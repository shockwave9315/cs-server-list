import { GameDig } from 'gamedig';

const NON_PLAYER_MARKERS = [
  'max players',
  'current players',
  'num players',
  'player count',
  'players'
];

function normalizePlayerName(player) {
  if (!player || typeof player !== 'object') return null;
  const rawName = typeof player.name === 'string'
    ? player.name
    : typeof player.raw === 'string'
      ? player.raw
      : '';
  const name = rawName.trim();
  if (!name) return null;

  const normalized = name.toLowerCase();
  if (NON_PLAYER_MARKERS.includes(normalized)) return null;
  if (normalized.startsWith('max players')) return null;

  return name;
}

function normalizePlayerList(players) {
  if (!Array.isArray(players)) {
    return { players: null, status: 'unavailable' };
  }

  const unique = new Set();
  const filtered = [];

  for (const player of players) {
    const normalized = normalizePlayerName(player);
    if (!normalized) continue;
    const dedupeKey = normalized.toLowerCase();
    if (unique.has(dedupeKey)) continue;
    unique.add(dedupeKey);
    filtered.push(normalized);
  }

  if (filtered.length > 0) {
    return { players: filtered, status: 'available' };
  }

  return {
    players: [],
    status: players.length === 0 ? 'empty' : 'filtered_invalid'
  };
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
        players: playerList.players,
        playerListStatus: playerList.status,
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
