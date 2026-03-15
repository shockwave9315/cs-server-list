import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'fs/promises';
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
    ...overrides
  };
}

test('refresh service persists and restores snapshot when enabled', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cs-server-list-'));
  const cacheFile = join(dir, 'snapshot.json');

  const refreshService = createRefreshService({
    config: createConfig({ snapshotCacheFile: cacheFile }),
    logger: createLogger(),
    steamService: {
      fetchServerList: async () => [
        {
          addr: '1.2.3.4:27015',
          max_players: 8,
          players: 5,
          name: 'Srv',
          map: 'de_dust2'
        }
      ]
    },
    geoIpService: {
      getCountry: async () => 'PL'
    },
    gameDigService: {
      queryPlayers: async () => 6
    }
  });

  const result = await refreshService.refreshServers('test');
  assert.equal(result.status, 'success');

  const raw = await readFile(cacheFile, 'utf8');
  const persisted = JSON.parse(raw);
  assert.equal(persisted.servers.length, 1);

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
  assert.equal(snapshot.freshness, 'fresh');
});
