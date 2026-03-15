import { mapLimit } from '../utils/network.js';
import { dedupeByAddr, parseServerAddr } from '../utils/servers.js';

export function createRefreshService({ config, logger, steamService, geoIpService, gameDigService }) {
  const state = {
    cachedServers: [],
    lastUpdate: null,
    lastSuccessAt: null,
    lastError: null,
    refreshInProgress: false,
    refreshPromise: null
  };

  async function refreshServers(trigger = 'manual') {
    if (state.refreshInProgress) {
      return { ok: true, busy: true };
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

        const processed = await mapLimit(uniqueServers, config.workerConcurrency, async (server) => {
          const parsed = server._parsedAddr || parseServerAddr(server.addr);
          if (!parsed) return null;

          const country = await geoIpService.getCountry(parsed.host);
          if (!country || !config.allowedCountries.includes(country)) return null;

          const playersFromQuery = await gameDigService.queryPlayers(parsed.host, parsed.port);
          return {
            name: server.name,
            ip: parsed.normalized,
            players: playersFromQuery ?? server.players,
            maxplayers: server.max_players,
            map: server.map,
            country
          };
        });

        const filtered = processed.filter(Boolean).sort((a, b) => b.players - a.players);
        state.cachedServers = filtered;
        state.lastUpdate = new Date().toISOString();
        state.lastSuccessAt = state.lastUpdate;
        state.lastError = null;

        logger.info('refresh.done', {
          trigger,
          rawCount: rawServers.length,
          slotFiltered: slotFiltered.length,
          uniqueCount: uniqueServers.length,
          finalCount: filtered.length,
          durationMs: Date.now() - startedAt
        });

        return { ok: true, busy: false, count: filtered.length };
      } catch (error) {
        state.lastError = error.message;
        logger.error('refresh.failed', { trigger, error: error.message, durationMs: Date.now() - startedAt });
        return { ok: false, busy: false, error: error.message };
      } finally {
        state.refreshInProgress = false;
        state.refreshPromise = null;
      }
    })();

    return state.refreshPromise;
  }

  function getSnapshot() {
    return {
      servers: state.cachedServers,
      lastUpdate: state.lastUpdate,
      lastSuccessAt: state.lastSuccessAt,
      stale: Boolean(state.lastError),
      refreshInProgress: state.refreshInProgress,
      count: state.cachedServers.length,
      lastError: state.lastError
    };
  }

  return {
    refreshServers,
    getSnapshot,
    isRefreshing: () => state.refreshInProgress
  };
}
