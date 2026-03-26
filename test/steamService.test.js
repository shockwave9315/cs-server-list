import test from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import { createSteamService } from '../src/services/steamService.js';

test('steam service fetches each allowed map and merges results', async () => {
  const calls = [];
  const originalGet = axios.get;

  axios.get = async (_url, options) => {
    calls.push(options.params.filter);
    const map = options.params.filter.split('\\map\\')[1];
    return {
      data: {
        response: {
          servers: [{ addr: `10.0.0.${calls.length}:27015`, map, max_players: 10, players: 2, name: map }]
        }
      }
    };
  };

  try {
    const config = {
      steamApiKey: 'key',
      appId: '4465480',
      steamLimit: 500,
      allowedMaps: ['de_dust2', 'de_mirage', 'de_inferno']
    };

    const service = createSteamService(config);
    const servers = await service.fetchServerList();

    assert.equal(calls.length, 3);
    assert.deepEqual(new Set(calls), new Set([
      '\\appid\\4465480\\map\\de_dust2',
      '\\appid\\4465480\\map\\de_mirage',
      '\\appid\\4465480\\map\\de_inferno'
    ]));
    assert.equal(servers.length, 3);
    assert.deepEqual(new Set(servers.map((server) => server.map)), new Set(config.allowedMaps));
  } finally {
    axios.get = originalGet;
  }
});

test('steam service fetches only scoped map when provided', async () => {
  const calls = [];
  const originalGet = axios.get;

  axios.get = async (_url, options) => {
    calls.push(options.params.filter);
    return {
      data: {
        response: {
          servers: [{ addr: '10.0.0.10:27015', map: 'de_dust2', max_players: 10, players: 2, name: 'de_dust2' }]
        }
      }
    };
  };

  try {
    const config = {
      steamApiKey: 'key',
      appId: '4465480',
      steamLimit: 500,
      allowedMaps: ['de_dust2', 'de_mirage', 'de_inferno']
    };

    const service = createSteamService(config);
    await service.fetchServerList({ mapScope: 'de_dust2' });

    assert.equal(calls.length, 1);
    assert.equal(calls[0], '\\appid\\4465480\\map\\de_dust2');
  } finally {
    axios.get = originalGet;
  }
});
