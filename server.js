import express from 'express';
import { GameDig } from 'gamedig';
import axios from 'axios';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dgram from 'dgram';
import dns from 'dns';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3000;

const ALLOWED_COUNTRIES = ['PL', 'DE'];
const TARGET_MAP = 'de_dust2';
const MIN_SLOTS = 8;
const MAX_SLOTS = 10;

let cachedServers = [];
let lastUpdate = null;

// Zapytanie UDP do Steam Master Server
function queryMasterServer() {
  return new Promise((resolve, reject) => {
    const client = dgram.createSocket('udp4');
    const servers = [];
    let resolved = false;

    const filter = '\\appid\\730\\map\\' + TARGET_MAP;
    const request = Buffer.concat([
      Buffer.from([0x31, 0xFF]),
      Buffer.from('0.0.0.0:0\0'),
      Buffer.from(filter + '\0')
    ]);

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        try { client.close(); } catch {}
        console.log('Master Server timeout — zebrano ' + servers.length + ' serwerów');
        resolve(servers);
      }
    }, 8000);

    client.on('message', (msg) => {
      let offset = 6;
      while (offset + 6 <= msg.length) {
        const ip = msg[offset] + '.' + msg[offset+1] + '.' + msg[offset+2] + '.' + msg[offset+3];
        const port = (msg[offset+4] << 8) | msg[offset+5];
        offset += 6;

        if (ip === '0.0.0.0' && port === 0) {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            try { client.close(); } catch {}
            resolve(servers);
          }
          return;
        }
        servers.push({ ip, port });
      }
    });

    client.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        try { client.close(); } catch {}
        reject(err);
      }
    });

    dns.resolve4('hl2master.steampowered.com', (err, addresses) => {
      if (err) return reject(err);
      console.log('Master Server IP:', addresses[0]);
      client.send(request, 27011, addresses[0], (err) => {
        if (err) reject(err);
      });
    });
  });
}

// Sprawdza kraj IP
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

// Odpytuje serwer o szczegóły
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

// Główna funkcja odświeżająca listę
async function refreshServers() {
  console.log('\n[' + new Date().toLocaleTimeString() + '] Rozpoczynam odświeżanie...');
  try {
    const rawServers = await queryMasterServer();
    console.log('Serwery z Master Server:', rawServers.length);

    if (rawServers.length === 0) {
      console.log('Brak serwerów z Master Server — sprawdź połączenie UDP.');
      return;
    }

    const filtered = [];

    // Bierzemy pierwsze 150 serwerów żeby nie przeciążać ip-api.com
    for (const { ip, port } of rawServers.slice(0, 150)) {
      const country = await getCountry(ip);
      if (!ALLOWED_COUNTRIES.includes(country)) continue;

      console.log('PL/DE znaleziono:', ip + ':' + port, '(' + country + ') — odpytuję...');

      const info = await queryServer(ip, port);
      if (!info) continue;

      if (info.map !== TARGET_MAP) continue;
      if (info.maxplayers < MIN_SLOTS || info.maxplayers > MAX_SLOTS) continue;

      filtered.push({
        name: info.name,
        ip: ip + ':' + port,
        players: info.players.length,
        maxplayers: info.maxplayers,
        map: info.map,
        country: country
      });

      console.log('✓ Dodano:', info.name, ip + ':' + port);
    }

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

app.listen(PORT, () => {
  console.log('Serwer działa na http://localhost:' + PORT);
  refreshServers();
  setInterval(refreshServers, 30 * 1000);
});