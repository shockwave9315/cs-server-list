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
    requiredMaxPlayers: 10,
    allowedMaps: ['de_dust2', 'de_mirage', 'de_inferno'],
    allowedMapsSet: new Set(['de_dust2', 'de_mirage', 'de_inferno']),
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
    max_players: 10,
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
        playerListStatus: 'available',
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
  assert.equal(persisted.servers[0].playerListStatus, 'available');

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
  assert.equal(snapshot.servers[0].playerListStatus, 'available');
  assert.equal(snapshot.freshness, 'fresh');
});

test('refresh service keeps previously seen server for grace misses only when still listed and processing fails', async () => {
  const fetches = [
    [createSingleServer()],
    [createSingleServer()],
    [createSingleServer()],
    [createSingleServer()]
  ];
  let queryAttempts = 0;

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
      queryServerMeta: async () => {
        queryAttempts += 1;
        if (queryAttempts === 1) return { playerCount: 7, players: ['active'], ping: 30 };
        throw new Error('query failed');
      }
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

test('refresh service drops previously seen servers immediately when absent from authoritative steam list', async () => {
  const fetches = [[createSingleServer()], []];
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
  assert.equal(refreshService.getSnapshot().count, 1);

  await refreshService.refreshServers('absent');
  const snapshot = refreshService.getSnapshot();
  assert.equal(snapshot.count, 0);
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
  assert.equal(snapshot.servers[0].playerListStatus, 'unavailable');
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
          maxplayers: 10,
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
  assert.equal(snapshot.servers[0].playerListStatus, 'unavailable');
});


test('refresh service preserves data-driven player list status from live-like fixtures', async () => {
  const variants = [
    { addr: '1.1.1.1:27015', map: 'de_dust2', name: 'A', players: 1, max_players: 10 },
    { addr: '1.1.1.1:27016', map: 'de_inferno', name: 'B', players: 0, max_players: 10 },
    { addr: '1.1.1.1:27017', map: 'de_mirage', name: 'C', players: 2, max_players: 10 }
  ];

  const byPort = new Map([
    [27015, { playerCount: 1, players: ['real-player'], playerListStatus: 'available', ping: 20 }],
    [27016, { playerCount: 0, players: [], playerListStatus: 'empty', ping: 21 }],
    [27017, { playerCount: 2, players: [], playerListStatus: 'filtered_invalid', ping: 22 }]
  ]);

  const refreshService = createRefreshService({
    config: createConfig(),
    logger: createLogger(),
    steamService: { fetchServerList: async () => variants },
    geoIpService: { getCountry: async () => 'PL' },
    gameDigService: {
      queryServerMeta: async (_host, port) => byPort.get(port)
    }
  });

  await refreshService.refreshServers('fixture-like');
  const snapshot = refreshService.getSnapshot();
  const statusByIp = new Map(snapshot.servers.map((s) => [s.ip, s.playerListStatus]));

  assert.equal(statusByIp.get('1.1.1.1:27015'), 'available');
  assert.equal(statusByIp.get('1.1.1.1:27016'), 'empty');
  assert.equal(statusByIp.get('1.1.1.1:27017'), 'filtered_invalid');
});


test('refresh service keeps only exact 10-slot servers on allowed maps', async () => {
  const refreshService = createRefreshService({
    config: createConfig(),
    logger: createLogger(),
    steamService: {
      fetchServerList: async () => [
        { addr: '2.2.2.2:27015', map: 'de_dust2', name: 'Good', players: 5, max_players: 10 },
        { addr: '2.2.2.2:27015', map: 'de_dust2', name: 'Good duplicate', players: 6, max_players: 10 },
        { addr: '2.2.2.2:27016', map: 'de_mirage', name: 'WrongSlotsLow', players: 5, max_players: 9 },
        { addr: '2.2.2.2:27017', map: 'de_inferno', name: 'WrongSlotsHigh', players: 5, max_players: 12 },
        { addr: '2.2.2.2:27018', map: 'workshop_123/custom_map', name: 'Custom', players: 5, max_players: 10 }
      ]
    },
    geoIpService: { getCountry: async () => 'PL' },
    gameDigService: { queryServerMeta: async () => ({ playerCount: 5, players: [], ping: 35 }) }
  });

  await refreshService.refreshServers('filtering');
  const snapshot = refreshService.getSnapshot();

  assert.equal(snapshot.count, 1);
  assert.equal(snapshot.servers[0].ip, '2.2.2.2:27015');
  assert.equal(snapshot.servers[0].map, 'de_dust2');
  assert.equal(snapshot.servers[0].maxplayers, 10);
});

test('refresh service merges multi-map authoritative snapshot in one refresh', async () => {
  const refreshService = createRefreshService({
    config: createConfig(),
    logger: createLogger(),
    steamService: {
      fetchServerList: async () => [
        { addr: '3.3.3.3:27015', map: 'de_dust2', name: 'Dust', players: 6, max_players: 10 },
        { addr: '3.3.3.3:27016', map: 'de_mirage', name: 'Mirage', players: 4, max_players: 10 },
        { addr: '3.3.3.3:27017', map: 'de_inferno', name: 'Inferno', players: 3, max_players: 10 }
      ]
    },
    geoIpService: { getCountry: async () => 'PL' },
    gameDigService: {
      queryServerMeta: async (_host, port) => ({
        playerCount: port === 27015 ? 6 : port === 27016 ? 4 : 3,
        players: [],
        ping: 40
      })
    }
  });

  await refreshService.refreshServers('multi-map');
  const snapshot = refreshService.getSnapshot();
  const maps = new Set(snapshot.servers.map((server) => server.map));

  assert.equal(snapshot.count, 3);
  assert.deepEqual(maps, new Set(['de_dust2', 'de_mirage', 'de_inferno']));
});

test('refresh service uses selected map scope for backend collection', async () => {
  const observedScopes = [];
  const refreshService = createRefreshService({
    config: createConfig(),
    logger: createLogger(),
    steamService: {
      fetchServerList: async ({ mapScope } = {}) => {
        observedScopes.push(mapScope);
        if (mapScope === 'de_dust2') {
          return [{ addr: '7.7.7.7:27015', map: 'de_dust2', name: 'Dust', players: 5, max_players: 10 }];
        }
        return [
          { addr: '7.7.7.7:27015', map: 'de_dust2', name: 'Dust', players: 5, max_players: 10 },
          { addr: '7.7.7.7:27016', map: 'de_mirage', name: 'Mirage', players: 5, max_players: 10 }
        ];
      }
    },
    geoIpService: { getCountry: async () => 'PL' },
    gameDigService: { queryServerMeta: async () => ({ playerCount: 5, players: [], ping: 35 }) }
  });

  await refreshService.refreshServers('scoped', { mapScope: 'de_dust2' });
  assert.deepEqual(observedScopes, ['de_dust2']);
  assert.equal(refreshService.getSnapshot().count, 1);

  await refreshService.refreshServers('all', { mapScope: 'all' });
  assert.deepEqual(observedScopes, ['de_dust2', 'all']);
  assert.equal(refreshService.getSnapshot().count, 2);
});

test('refresh service falls back to all scope for unknown map values', async () => {
  const observedScopes = [];
  const refreshService = createRefreshService({
    config: createConfig(),
    logger: createLogger(),
    steamService: {
      fetchServerList: async ({ mapScope } = {}) => {
        observedScopes.push(mapScope);
        return [{ addr: '8.8.8.8:27015', map: 'de_dust2', name: 'Dust', players: 5, max_players: 10 }];
      }
    },
    geoIpService: { getCountry: async () => 'PL' },
    gameDigService: { queryServerMeta: async () => ({ playerCount: 5, players: [], ping: 35 }) }
  });

  await refreshService.refreshServers('invalid-scope', { mapScope: 'de_cache' });
  assert.deepEqual(observedScopes, ['all']);
});

test('refresh service treats map scope as request-scoped and defaults to all when omitted', async () => {
  const observedScopes = [];
  const refreshService = createRefreshService({
    config: createConfig(),
    logger: createLogger(),
    steamService: {
      fetchServerList: async ({ mapScope } = {}) => {
        observedScopes.push(mapScope);
        return [{ addr: '9.9.9.9:27015', map: 'de_dust2', name: 'Dust', players: 5, max_players: 10 }];
      }
    },
    geoIpService: { getCountry: async () => 'PL' },
    gameDigService: { queryServerMeta: async () => ({ playerCount: 5, players: [], ping: 35 }) }
  });

  await refreshService.refreshServers('manual', { mapScope: 'de_dust2' });
  await refreshService.refreshServers('scheduler');

  assert.deepEqual(observedScopes, ['de_dust2', 'all']);
  assert.deepEqual(refreshService.getSnapshot().allowedMaps, ['de_dust2', 'de_mirage', 'de_inferno']);
});
