import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { createRefreshService } from '../src/services/refreshService.js';

function createLogger() {
  return {
    info() {},
    warn() {},
    error() {}
  };
}

function createConfig(overrides = {}) {
  return {
    minSlots: 8,
    maxSlots: 10,
    allowedCountriesSet: new Set(['PL', 'DE']),
    workerConcurrency: 2,
    maxStaleMs: 1000,
    snapshotCacheFile: '',
    persistSnapshotOnRefresh: true,
    restoreSnapshotOnStartup: true,
    graceMissLimit: 2,
    staleMissThreshold: 2,
    ...overrides
  };
}

function createSingleServer() {
  return {
    addr: '1.2.3.4:27015',
    max_players: 8,
    players: 5,
    name: 'Srv',
    map: 'de_dust2'
  };
}

test('refresh service persists and restores snapshot when enabled', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cs-server-list-'));
  const cacheFile = join(dir, 'snapshot.json');

  const refreshService = createRefreshService({
    config: createConfig({ snapshotCacheFile: cacheFile }),
    logger: createLogger(),
    steamService: {
      fetchServerList: async () => [createSingleServer()]
    },
    geoIpService: {
      getCountry: async () => 'PL'
    },
    gameDigService: {
      queryServerMeta: async () => ({
        playerCount: 6,
        players: ['one', 'two'],
        ping: 23
      })
    }
  });

  const result = await refreshService.refreshServers('test');
  assert.equal(result.status, 'success');

  const raw = await readFile(cacheFile, 'utf8');
  const persisted = JSON.parse(raw);
  assert.equal(persisted.servers.length, 1);
  assert.equal(persisted.servers[0].playerCountSource, 'gamedig_live');
  assert.deepEqual(persisted.servers[0].playerList, ['one', 'two']);

  const restored = createRefreshService({
    config: createConfig({ snapshotCacheFile: cacheFile }),
    logger: createLogger(),
    steamService: { fetchServerList: async () => [] },
    geoIpService: { getCountry: async () => null },
    gameDigService: { queryPlayers: async () => null }
  });

  const restoredOk = await restored.restoreSnapshot();
  assert.equal(restoredOk, true);
  const snapshot = restored.getSnapshot();
  assert.equal(snapshot.count, 1);
  assert.equal(snapshot.servers[0].playerCountSource, 'gamedig_live');
  assert.equal(snapshot.servers[0].stabilityState, 'stable');
  assert.equal(snapshot.freshness, 'fresh');
});

test('refresh service keeps previously seen server for grace misses and marks stability transitions', async () => {
  const fetches = [[createSingleServer()], [], [], []];
  const refreshService = createRefreshService({
    config: createConfig(),
    logger: createLogger(),
    steamService: {
      fetchServerList: async () => fetches.shift() || []
    },
    geoIpService: {
      getCountry: async () => 'PL'
    },
    gameDigService: {
      queryServerMeta: async () => ({ playerCount: 7, players: ['active'], ping: 30 })
    }
  });

  await refreshService.refreshServers('seed');
  const first = refreshService.getSnapshot();
  assert.equal(first.count, 1);
  const firstSeenAt = first.servers[0].lastSeenAt;

  await refreshService.refreshServers('miss-1');
  const second = refreshService.getSnapshot();
  assert.equal(second.count, 1);
  assert.equal(second.servers[0].missedRefreshCount, 1);
  assert.equal(second.servers[0].stabilityState, 'unstable');
  assert.equal(second.servers[0].lastSeenAt, firstSeenAt);
  assert.ok(typeof second.servers[0].lastRefreshAt === 'string');

  await refreshService.refreshServers('miss-2');
  const third = refreshService.getSnapshot();
  assert.equal(third.count, 1);
  assert.equal(third.servers[0].missedRefreshCount, 2);
  assert.equal(third.servers[0].stabilityState, 'stale');
  assert.equal(third.servers[0].lastSeenAt, firstSeenAt);

  await refreshService.refreshServers('miss-3');
  const fourth = refreshService.getSnapshot();
  assert.equal(fourth.count, 0);
});

test('refresh service uses steam fallback source when live query is unavailable', async () => {
  const refreshService = createRefreshService({
    config: createConfig(),
    logger: createLogger(),
    steamService: {
      fetchServerList: async () => [createSingleServer()]
    },
    geoIpService: {
      getCountry: async () => 'PL'
    },
    gameDigService: {
      queryServerMeta: async () => null
    }
  });

  await refreshService.refreshServers('fallback');
  const snapshot = refreshService.getSnapshot();
  assert.equal(snapshot.count, 1);
  assert.equal(snapshot.servers[0].playerCountSource, 'steam_fallback');
  assert.equal(snapshot.servers[0].playerList, null);
});

test('refresh service restores backward-compatible snapshot payloads with additive defaults', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cs-server-list-'));
  const cacheFile = join(dir, 'snapshot-old.json');

  await writeFile(
    cacheFile,
    JSON.stringify({
      servers: [
        {
          name: 'Legacy',
          ip: '5.6.7.8:27015',
          players: 3,
          maxplayers: 8,
          map: 'de_mirage',
          country: 'DE'
        }
      ],
      lastUpdate: '2024-01-01T00:00:00.000Z',
      lastSuccessAt: '2024-01-01T00:00:00.000Z'
    }),
    'utf8'
  );

  const restored = createRefreshService({
    config: createConfig({ snapshotCacheFile: cacheFile }),
    logger: createLogger(),
    steamService: { fetchServerList: async () => [] },
    geoIpService: { getCountry: async () => null },
    gameDigService: { queryServerMeta: async () => null }
  });

  const restoredOk = await restored.restoreSnapshot();
  assert.equal(restoredOk, true);

  const snapshot = restored.getSnapshot();
  assert.equal(snapshot.count, 1);
  assert.equal(snapshot.servers[0].playerCountSource, 'steam_fallback');
  assert.equal(snapshot.servers[0].missedRefreshCount, 0);
  assert.equal(snapshot.servers[0].stabilityState, 'stable');
  assert.equal(snapshot.servers[0].lastSeenAt, '2024-01-01T00:00:00.000Z');
});
