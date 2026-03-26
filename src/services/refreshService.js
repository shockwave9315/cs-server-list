import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname } from 'path';
import { mapLimit } from '../utils/network.js';
import { dedupeByAddr, parseServerAddr } from '../utils/servers.js';
import { buildFreshness } from '../utils/freshness.js';

const PLAYER_COUNT_SOURCES = new Set(['gamedig_live', 'steam_fallback']);

const REFRESH_STABILITY_DEFAULTS = Object.freeze({
  graceMissLimit: 2,
  staleMissThreshold: 2
});

function coerceIsoString(value) {
  return typeof value === 'string' ? value : null;
}

function coerceNonNegativeInt(value, fallback = 0) {
  if (!Number.isInteger(value) || value < 0) return fallback;
  return value;
}

function deriveStabilityState(missedRefreshCount, staleMissThreshold) {
  if (missedRefreshCount <= 0) return 'stable';
  if (missedRefreshCount >= staleMissThreshold) return 'stale';
  return 'unstable';
}

function normalizePlayerCountSource(value) {
  if (PLAYER_COUNT_SOURCES.has(value)) return value;
  return 'steam_fallback';
}

function normalizeRestoredServer(server, fallbackSeenAt, staleMissThreshold) {
  const missedRefreshCount = coerceNonNegativeInt(server?.missedRefreshCount, 0);
  const lastSeenAt = coerceIsoString(server?.lastSeenAt) || fallbackSeenAt;
  const lastRefreshAt = coerceIsoString(server?.lastRefreshAt) || fallbackSeenAt;

  return {
    ...server,
    ping: typeof server?.ping === 'number' ? server.ping : null,
    playerCountSource: normalizePlayerCountSource(server?.playerCountSource),
    playerList: Array.isArray(server?.playerList) ? server.playerList : null,
    playerListStatus: typeof server?.playerListStatus === 'string' ? server.playerListStatus : 'unavailable',
    lastSeenAt,
    missedRefreshCount,
    stabilityState: typeof server?.stabilityState === 'string'
      ? server.stabilityState
      : deriveStabilityState(missedRefreshCount, staleMissThreshold),
    lastRefreshAt
  };
}

function resolveStabilityPolicy(config) {
  const graceMissLimit = Number.isInteger(config.graceMissLimit) && config.graceMissLimit > 0
    ? config.graceMissLimit
    : REFRESH_STABILITY_DEFAULTS.graceMissLimit;
  const staleMissThreshold = Number.isInteger(config.staleMissThreshold) && config.staleMissThreshold > 0
    ? config.staleMissThreshold
    : Math.max(graceMissLimit, REFRESH_STABILITY_DEFAULTS.staleMissThreshold);

  return {
    graceMissLimit,
    staleMissThreshold
  };
}

export function createRefreshService({ config, logger, steamService, geoIpService, gameDigService }) {
  const state = {
    cachedServers: [],
    lastUpdate: null,
    lastSuccessAt: null,
    lastError: null,
    refreshInProgress: false,
    refreshPromise: null
  };

  const { graceMissLimit, staleMissThreshold } = resolveStabilityPolicy(config);

  function getFreshness() {
    return buildFreshness(state.lastSuccessAt, config.maxStaleMs);
  }

  function normalizeMapScope(scope) {
    if (typeof scope !== 'string') return 'all';
    if (scope === 'all') return 'all';
    return config.allowedMapsSet.has(scope) ? scope : 'all';
  }

  async function persistSnapshot() {
    if (!config.snapshotCacheFile || !config.persistSnapshotOnRefresh) return;

    const payload = {
      servers: state.cachedServers,
      lastUpdate: state.lastUpdate,
      lastSuccessAt: state.lastSuccessAt,
      lastError: state.lastError
    };

    try {
      await mkdir(dirname(config.snapshotCacheFile), { recursive: true });
      await writeFile(config.snapshotCacheFile, JSON.stringify(payload), 'utf8');
    } catch (error) {
      logger.warn('snapshot.persist_failed', { error: error.message, file: config.snapshotCacheFile });
    }
  }

  async function restoreSnapshot() {
    if (!config.snapshotCacheFile || !config.restoreSnapshotOnStartup) return false;

    try {
      const raw = await readFile(config.snapshotCacheFile, 'utf8');
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed.servers)) return false;

      const fallbackSeenAt = coerceIsoString(parsed.lastSuccessAt) || coerceIsoString(parsed.lastUpdate);
      state.cachedServers = parsed.servers.map((server) =>
        normalizeRestoredServer(server, fallbackSeenAt, staleMissThreshold)
      );
      state.lastUpdate = coerceIsoString(parsed.lastUpdate);
      state.lastSuccessAt = coerceIsoString(parsed.lastSuccessAt);
      state.lastError = coerceIsoString(parsed.lastError);

      logger.info('snapshot.restore_success', {
        file: config.snapshotCacheFile,
        count: state.cachedServers.length,
        freshness: getFreshness().status
      });
      return true;
    } catch (error) {
      logger.info('snapshot.restore_skipped', {
        file: config.snapshotCacheFile,
        reason: error.code === 'ENOENT' ? 'missing' : 'invalid'
      });
      return false;
    }
  }

  async function refreshServers(trigger = 'manual', options = {}) {
    if (state.refreshInProgress) {
      return { status: 'busy' };
    }

    const mapScope = normalizeMapScope(options.mapScope);
    state.refreshInProgress = true;
    state.refreshPromise = (async () => {
      const startedAt = Date.now();
      logger.info('refresh.start', { trigger, mapScope });

      try {
        const rawServers = await steamService.fetchServerList({ mapScope });

        const mergedUniqueServers = dedupeByAddr(rawServers);

        const authoritativeServers = mergedUniqueServers.filter((server) => {
          if (server.max_players !== config.requiredMaxPlayers) return false;
          const map = typeof server.map === 'string' ? server.map.toLowerCase() : '';
          return config.allowedMapsSet.has(map);
        });

        const uniqueServers = authoritativeServers;

        const listedIps = new Set(
          uniqueServers
            .map((server) => server._parsedAddr || parseServerAddr(server.addr))
            .filter(Boolean)
            .map((parsed) => parsed.normalized)
        );

        const processed = await mapLimit(
          uniqueServers,
          config.workerConcurrency,
          async (server) => {
            const parsed = server._parsedAddr || parseServerAddr(server.addr);
            if (!parsed) return null;

            const country = await geoIpService.getCountry(parsed.host);
            if (!country || !config.allowedCountriesSet.has(country)) return null;

            const query = typeof gameDigService.queryServerMeta === 'function'
              ? await gameDigService.queryServerMeta(parsed.host, parsed.port)
              : null;
            const playersFromQuery = query?.playerCount ?? (typeof gameDigService.queryPlayers === 'function'
              ? await gameDigService.queryPlayers(parsed.host, parsed.port)
              : null);
            const playerCountSource = playersFromQuery == null ? 'steam_fallback' : 'gamedig_live';

            return {
              name: server.name,
              ip: parsed.normalized,
              players: playersFromQuery ?? server.players,
              playerCountSource,
              maxplayers: server.max_players,
              map: server.map,
              country,
              ping: query?.ping ?? null,
              playerList: Array.isArray(query?.players) ? query.players : null,
              playerListStatus: typeof query?.playerListStatus === 'string' ? query.playerListStatus : 'unavailable'
            };
          },
          {
            onItemError(error, server) {
              logger.warn('refresh.item_failed', {
                addr: server?.addr,
                error: error?.message || String(error)
              });
            }
          }
        );

        const now = new Date().toISOString();
        const seenIps = new Set();

        const merged = [];
        for (const server of processed.filter(Boolean)) {
          seenIps.add(server.ip);

          merged.push({
            ...server,
            playerCountSource: normalizePlayerCountSource(server.playerCountSource),
            lastSeenAt: now,
            missedRefreshCount: 0,
            stabilityState: 'stable',
            lastRefreshAt: now,
            ping: typeof server.ping === 'number' ? server.ping : null,
            playerList: Array.isArray(server.playerList) ? server.playerList : null,
            playerListStatus: typeof server.playerListStatus === 'string' ? server.playerListStatus : 'unavailable'
          });
        }

        for (const previous of state.cachedServers) {
          if (seenIps.has(previous.ip)) continue;
          if (!listedIps.has(previous.ip)) continue;

          const nextMissed = coerceNonNegativeInt(previous.missedRefreshCount, 0) + 1;
          if (nextMissed > graceMissLimit) continue;

          merged.push({
            ...previous,
            playerCountSource: normalizePlayerCountSource(previous.playerCountSource),
            missedRefreshCount: nextMissed,
            stabilityState: deriveStabilityState(nextMissed, staleMissThreshold),
            lastRefreshAt: now,
            lastSeenAt: coerceIsoString(previous.lastSeenAt) || state.lastSuccessAt || state.lastUpdate || now,
            ping: typeof previous.ping === 'number' ? previous.ping : null,
            playerList: Array.isArray(previous.playerList) ? previous.playerList : null,
            playerListStatus: typeof previous.playerListStatus === 'string' ? previous.playerListStatus : 'unavailable'
          });
        }

        const filtered = merged.sort((a, b) => b.players - a.players);

        state.cachedServers = filtered;
        state.lastUpdate = now;
        state.lastSuccessAt = now;
        state.lastError = null;
        await persistSnapshot();

        logger.info('refresh.done', {
          trigger,
          mapScope,
          rawCount: rawServers.length,
          mergedUniqueCount: mergedUniqueServers.length,
          authoritativeFiltered: authoritativeServers.length,
          uniqueCount: uniqueServers.length,
          finalCount: filtered.length,
          durationMs: Date.now() - startedAt
        });

        return { status: 'success', count: filtered.length };
      } catch (error) {
        state.lastError = error.message;
        logger.error('refresh.failed', { trigger, error: error.message, durationMs: Date.now() - startedAt });
        return { status: 'error', error: error.message };
      } finally {
        state.refreshInProgress = false;
        state.refreshPromise = null;
      }
    })();

    return state.refreshPromise;
  }

  function getSnapshot() {
    const freshness = getFreshness();
    return {
      servers: state.cachedServers,
      lastUpdate: state.lastUpdate,
      lastSuccessAt: state.lastSuccessAt,
      freshness: freshness.status,
      stale: freshness.stale,
      ageMs: freshness.ageMs,
      refreshInProgress: state.refreshInProgress,
      count: state.cachedServers.length,
      lastError: state.lastError
    };
  }

  return {
    refreshServers,
    getSnapshot,
    getFreshness,
    restoreSnapshot,
    getActiveRefreshPromise: () => state.refreshPromise,
    isRefreshing: () => state.refreshInProgress
  };
}
