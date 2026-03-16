import { GameDig } from 'gamedig';

function normalizePlayerList(players) {
  if (!Array.isArray(players)) return null;
  return players
    .map((player) => {
      if (!player || typeof player !== 'object') return null;
      if (typeof player.name === 'string' && player.name.trim()) return player.name.trim();
      return null;
    })
    .filter(Boolean);
}

export function createGameDigService() {
  async function queryServerMeta(host, port) {
    try {
      const state = await GameDig.query({
        type: 'csgo',
        host,
        port,
        maxAttempts: 2,
        socketTimeout: 3000
      });

      const playerList = normalizePlayerList(state.players);
      return {
        playerCount: Array.isArray(state.players) ? state.players.length : null,
        players: playerList,
        ping: typeof state.ping === 'number' ? state.ping : null
      };
    } catch {
      return null;
    }
  }

  async function queryPlayers(host, port) {
    const meta = await queryServerMeta(host, port);
    return meta?.playerCount ?? null;
  }

  return { queryServerMeta, queryPlayers };
}
