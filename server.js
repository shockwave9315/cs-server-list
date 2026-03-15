import 'dotenv/config';
import express from 'express';
import { GameDig } from 'gamedig';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3000;

const STEAM_API_KEY = process.env.STEAM_API_KEY;
const ALLOWED_COUNTRIES = ['PL', 'DE'];
const TARGET_MAP = 'de_dust2';
const MIN_SLOTS = 8;
const MAX_SLOTS = 10;

let cachedServers = [];
let lastUpdate = null;

async function fetchServerList() {
  const url = 'https://api.steampowered.com/IGameServersService/GetServerList/v1/';
  const res = await axios.get(url, {
    params: {
      key: STEAM_API_KEY,
      filter: `\\appid\\4465480\\map\\${TARGET_MAP}`,
      limit: 500
    },
    timeout: 10000
  });
  return res.data?.response?.servers || [];
}

async function getCountry(ip) {
  try {
    const res = await axios.get('http://ip-api.com/json/' + ip + '?fields=countryCode', {
      timeout: 3000
    });
    return res.data.countryCode || null;
  } catch {
    return null;
  }
}

async function queryServer(ip, port) {
  try {
    const state = await GameDig.query({
      type: 'csgo',
      host: ip,
      port: port,
      maxAttempts: 2,
      socketTimeout: 3000
    });
    return state;
  } catch {
    return null;
  }
}

async function refreshServers() {
  console.log('\n[' + new Date().toLocaleTimeString() + '] Rozpoczynam odświeżanie...');
  try {
    const rawServers = await fetchServerList();
    console.log('Serwery z Steam API:', rawServers.length);

    const slotFiltered = rawServers.filter(s =>
      s.max_players >= MIN_SLOTS && s.max_players <= MAX_SLOTS
    );
    console.log('Po filtrze slotów:', slotFiltered.length);

    const filtered = [];

    for (const server of slotFiltered) {
      const [ip, portStr] = server.addr.split(':');
      const port = parseInt(portStr) || 27015;

      const country = await getCountry(ip);
      if (!ALLOWED_COUNTRIES.includes(country)) continue;

      console.log('PL/DE:', server.addr, '(' + country + ') —', server.name);

      const info = await queryServer(ip, port);
      const players = info ? info.players.length : server.players;

      filtered.push({
        name: server.name,
        ip: server.addr,
        players: players,
        maxplayers: server.max_players,
        map: server.map,
        country: country
      });

      console.log('✓ Dodano:', server.name, server.addr);
    }

    filtered.sort((a, b) => b.players - a.players);

    cachedServers = filtered;
    lastUpdate = new Date().toISOString();
    console.log('Gotowe. Serwerów po filtrowaniu:', filtered.length);

  } catch (err) {
    console.error('Błąd refreshServers:', err.message);
  }
}

app.use(express.static(join(__dirname, 'public')));

app.get('/api/servers', (req, res) => {
  res.json({
    servers: cachedServers,
    lastUpdate: lastUpdate,
    count: cachedServers.length
  });
});

app.post('/api/refresh', async (req, res) => {
  await refreshServers();
  res.json({ status: 'done' });
});

app.listen(PORT, () => {
  console.log('Serwer działa na http://localhost:' + PORT);
  refreshServers();
});