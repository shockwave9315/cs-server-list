import test from 'node:test';
import assert from 'node:assert/strict';
import { GameDig } from 'gamedig';
import { createGameDigService } from '../src/services/gameDigService.js';

test('gameDig service normalizes player list and filters obvious metadata entries', async () => {
  const originalQuery = GameDig.query;
  GameDig.query = async () => ({
    players: [
      { name: '  Alice  ' },
      { name: '' },
      { name: 'Max Players' },
      { raw: 'Bob' },
      { name: 'alice' },
      { name: 'PLAYERS' }
    ],
    ping: 18
  });

  try {
    const service = createGameDigService();
    const result = await service.queryServerMeta('127.0.0.1', 27015);

    assert.equal(result.playerCount, 6);
    assert.deepEqual(result.players, ['Alice', 'Bob']);
    assert.equal(result.playerListStatus, 'available');
    assert.equal(result.ping, 18);
  } finally {
    GameDig.query = originalQuery;
  }
});

test('gameDig service marks empty and filtered-invalid lists distinctly', async () => {
  const originalQuery = GameDig.query;
  const service = createGameDigService();

  GameDig.query = async () => ({ players: [], ping: null });
  try {
    const empty = await service.queryServerMeta('127.0.0.1', 27015);
    assert.equal(empty.playerListStatus, 'empty');
    assert.deepEqual(empty.players, []);
  } finally {
    GameDig.query = originalQuery;
  }

  GameDig.query = async () => ({ players: [{ name: 'Max Players' }, { name: 'players' }], ping: null });
  try {
    const filtered = await service.queryServerMeta('127.0.0.1', 27015);
    assert.equal(filtered.playerListStatus, 'filtered_invalid');
    assert.deepEqual(filtered.players, []);
  } finally {
    GameDig.query = originalQuery;
  }
});
