import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

function createConfig(overrides = {}) {
  return {
    env: 'test',
    manualRefreshToken: '',
    maxStaleMs: 60_000,
    ...overrides
  };
}

async function withServer({ config, refreshService }, run) {
  const app = createApp({ config, refreshService });
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));

  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('GET /api/servers returns snapshot payload', async () => {
  const snapshot = {
    servers: [{ name: 'A', ip: '1.1.1.1:27015', players: 2, maxplayers: 10, map: 'de_dust2', country: 'PL' }],
    lastUpdate: '2024-01-01T00:00:00.000Z',
    lastSuccessAt: '2024-01-01T00:00:00.000Z',
    freshness: 'fresh',
    stale: false,
    ageMs: 100,
    refreshInProgress: false,
    count: 1,
    lastError: null
  };

  await withServer(
    {
      config: createConfig(),
      refreshService: {
        getSnapshot: () => snapshot,
        refreshServers: async () => ({ status: 'success', count: 1 })
      }
    },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/servers`);
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), snapshot);
    }
  );
});

test('POST /api/refresh returns success payload', async () => {
  await withServer(
    {
      config: createConfig(),
      refreshService: {
        getSnapshot: () => ({ freshness: 'never_succeeded', refreshInProgress: false, stale: true, lastError: null }),
        refreshServers: async () => ({ status: 'success', count: 7 })
      }
    },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/refresh`, { method: 'POST' });
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { status: 'success', count: 7 });
    }
  );
});

test('POST /api/refresh enforces token protection', async () => {
  await withServer(
    {
      config: createConfig({ manualRefreshToken: 'top-secret' }),
      refreshService: {
        getSnapshot: () => ({ freshness: 'never_succeeded', refreshInProgress: false, stale: true, lastError: null }),
        refreshServers: async () => ({ status: 'success', count: 1 })
      }
    },
    async (baseUrl) => {
      const unauthorized = await fetch(`${baseUrl}/api/refresh`, { method: 'POST' });
      assert.equal(unauthorized.status, 401);

      const authorized = await fetch(`${baseUrl}/api/refresh`, {
        method: 'POST',
        headers: { authorization: 'Bearer top-secret' }
      });
      assert.equal(authorized.status, 200);
      assert.deepEqual(await authorized.json(), { status: 'success', count: 1 });
    }
  );
});

test('POST /api/refresh returns 202 on busy state', async () => {
  await withServer(
    {
      config: createConfig(),
      refreshService: {
        getSnapshot: () => ({ freshness: 'stale', refreshInProgress: true, stale: true, lastError: null }),
        refreshServers: async () => ({ status: 'busy' })
      }
    },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/refresh`, { method: 'POST' });
      assert.equal(res.status, 202);
      assert.deepEqual(await res.json(), { status: 'busy' });
    }
  );
});

test('GET /health reports never succeeded and stale/degraded', async () => {
  await withServer(
    {
      config: createConfig(),
      refreshService: {
        getSnapshot: () => ({
          freshness: 'never_succeeded',
          refreshInProgress: false,
          lastError: 'boom'
        }),
        refreshServers: async () => ({ status: 'success', count: 1 })
      }
    },
    async (baseUrl) => {
      const never = await fetch(`${baseUrl}/health`);
      assert.equal(never.status, 503);
      assert.equal((await never.json()).reason, 'never_succeeded');

      const appFresh = createApp({
        config: createConfig(),
        refreshService: {
          getSnapshot: () => ({
            freshness: 'fresh',
            refreshInProgress: false,
            lastSuccessAt: new Date().toISOString(),
            ageMs: 10,
            lastError: null
          })
        }
      });

      const freshServer = appFresh.listen(0);
      await new Promise((resolve) => freshServer.once('listening', resolve));
      const freshPort = freshServer.address().port;
      const fresh = await fetch(`http://127.0.0.1:${freshPort}/health`);
      assert.equal(fresh.status, 200);
      assert.equal((await fresh.json()).reason, 'fresh');
      await new Promise((resolve) => freshServer.close(resolve));

      const appStale = createApp({
        config: createConfig(),
        refreshService: {
          getSnapshot: () => ({
            freshness: 'stale',
            refreshInProgress: false,
            lastSuccessAt: new Date(Date.now() - 10_000).toISOString(),
            ageMs: 10_000,
            lastError: null
          })
        }
      });

      const staleServer = appStale.listen(0);
      await new Promise((resolve) => staleServer.once('listening', resolve));
      const stalePort = staleServer.address().port;
      const stale = await fetch(`http://127.0.0.1:${stalePort}/health`);
      assert.equal(stale.status, 503);
      assert.equal((await stale.json()).reason, 'stale');
      await new Promise((resolve) => staleServer.close(resolve));
    }
  );
});
