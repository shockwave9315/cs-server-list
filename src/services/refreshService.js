import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname } from 'path';
import { mapLimit } from '../utils/network.js';
import { dedupeByAddr, parseServerAddr } from '../utils/servers.js';
import { buildFreshness } from '../utils/freshness.js';

export function createRefreshService({ config, logger, steamService, geoIpService, gameDigService }) {
  const state = {
    cachedServers: [],
    lastUpdate: null,
    lastSuccessAt: null,
    lastError: null,
    refreshInProgress: false,
    refreshPromise: null
  };

  function getFreshness() {
    return buildFreshness(state.lastSuccessAt, config.maxStaleMs);
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

      state.cachedServers = parsed.servers;
      state.lastUpdate = typeof parsed.lastUpdate === 'string' ? parsed.lastUpdate : null;
      state.lastSuccessAt = typeof parsed.lastSuccessAt === 'string' ? parsed.lastSuccessAt : null;
      state.lastError = typeof parsed.lastError === 'string' ? parsed.lastError : null;

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

  async function refreshServers(trigger = 'manual') {
    if (state.refreshInProgress) {
      return { status: 'busy' };
    }

    state.refreshInProgress = true;
    state.refreshPromise = (async () => {
      const startedAt = Date.now();
      logger.info('refresh.start', { trigger });

      try {
        const rawServers = await steamService.fetchServerList();

        const slotFiltered = rawServers.filter(
          (s) => s.max_players >= config.minSlots && s.max_players <= config.maxSlots
        );

        const uniqueServers = dedupeByAddr(slotFiltered);

        const processed = await mapLimit(
          uniqueServers,
          config.workerConcurrency,
          async (server) => {
            const parsed = server._parsedAddr || parseServerAddr(server.addr);
            if (!parsed) return null;

            const country = await geoIpService.getCountry(parsed.host);
            if (!country || !config.allowedCountriesSet.has(country)) return null;

            const playersFromQuery = await gameDigService.queryPlayers(parsed.host, parsed.port);
            const playerCountSource = playersFromQuery == null ? 'steam_fallback' : 'gamedig_live';
            return {
              name: server.name,
              ip: parsed.normalized,
              players: playersFromQuery ?? server.players,
              playerCountSource,
              maxplayers: server.max_players,
              map: server.map,
              country
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

        const filtered = processed.filter(Boolean).sort((a, b) => b.players - a.players);
        state.cachedServers = filtered;
        state.lastUpdate = new Date().toISOString();
        state.lastSuccessAt = state.lastUpdate;
        state.lastError = null;
        await persistSnapshot();

        logger.info('refresh.done', {
          trigger,
          rawCount: rawServers.length,
          slotFiltered: slotFiltered.length,
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
