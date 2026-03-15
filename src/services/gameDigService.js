import { GameDig } from 'gamedig';

export function createGameDigService() {
  async function queryPlayers(host, port) {
    try {
      const state = await GameDig.query({
        type: 'csgo',
        host,
        port,
        maxAttempts: 2,
        socketTimeout: 3000
      });
      return state.players.length;
    } catch {
      return null;
    }
  }

  return { queryPlayers };
}
