const express = require('express');
const Gamedig = require('gamedig');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = 3000;

// Filtrowanie — tylko te kraje
const ALLOWED_COUNTRIES = ['PL', 'DE'];
const TARGET_MAP = 'de_dust2';
const MIN_SLOTS = 8;
const MAX_SLOTS = 10;

let cachedServers = [];
let lastUpdate = null;

// Pobiera listę serwerów ze Steam Master Server
async function fetchServers() {
  console.log('[' + new Date().toLocaleTimeString() + '] Odpytuję Steam Master Server...');
  try {
    // Używamy gamedig do odpytania Steam Master Server
    const result = await Gamedig.query({
      type: 'csgo',
      host: 'hl2master.steampowered.com',
      port: 27011,
      maxAttempts: 3,
      socketTimeout: 5000,
      givenPortOnly: false,
      // Filtrujemy po mapie i maksymalnych graczach już na poziomie zapytania
      meta: {
        filter: '\\appid\\730\\map\\' + TARGET_MAP + '\\empty\\1'
      }
    });

    console.log('Znaleziono serwerów przed filtrowaniem:', result.length || 0);
    return result;
  } catch (err) {
    console.error('Błąd Steam Master Server:', err.message);
    return [];
  }
}

// Sprawdza kraj IP przez ip-api.com
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

// Odpytuje pojedynczy serwer o szczegóły
async function queryServer(ip, port) {
  try {
    const state = await Gamedig.query({
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
  try {
    // Bezpośrednie odpytanie Steam Master Server przez gamedig
    // Używamy niskopoziomowego zapytania UDP do master servera
    const dns = require('dns').promises;
    const dgram = require('dgram');

    const servers = await queryMasterServer();
    console.log('Surowe serwery z master:', servers.length);

    const filtered = [];

    for (const { ip, port } of servers.slice(0, 100)) {
      // Sprawdź kraj
      const country = await getCountry(ip);
      if (!ALLOWED_COUNTRIES.includes(country)) continue;

      // Odpytaj serwer o szczegóły
      const info = await queryServer(ip, port);
      if (!info) continue;

      // Filtruj po mapie i slotach
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

// Niskopoziomowe zapytanie do Steam Master Server UDP
function queryMasterServer() {
  return new Promise((resolve, reject) => {
    const dgram = require('dgram');
    const client = dgram.createSocket('udp4');
    const servers = [];
    let resolved = false;

    const filter = '\\appid\\730\\map\\' + TARGET_MAP;
    // Pakiet zapytania do Steam Master Server
    const request = Buffer.concat([
      Buffer.from([0x31, 0xFF]),
      Buffer.from('0.0.0.0:0\0'),
      Buffer.from(filter + '\0')
    ]);

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        client.close();
        resolve(servers);
      }
    }, 8000);

    client.on('message', (msg) => {
      // Parsuj odpowiedź — format: 6 bajtów na serwer (4 IP + 2 port)
      let offset = 6; // Pomiń nagłówek
      while (offset + 6 <= msg.length) {
        const ip = msg[offset] + '.' + msg[offset+1] + '.' + msg[offset+2] + '.' + msg[offset+3];
        const port = (msg[offset+4] << 8) | msg[offset+5];
        offset += 6;

        if (ip === '0.0.0.0' && port === 0) {
          // Koniec listy
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            client.close();
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
        client.close();
        reject(err);
      }
    });

    require('dns').resolve4('hl2master.steampowered.com', (err, addresses) => {
      if (err) return reject(err);
      client.send(request, 27011, addresses[0], (err) => {
        if (err) reject(err);
      });
    });
  });
}

// API endpoint
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/servers', (req, res) => {
  res.json({
    servers: cachedServers,
    lastUpdate: lastUpdate,
    count: cachedServers.length
  });
});

app.listen(PORT, () => {
  console.log('Serwer działa na http://localhost:' + PORT);
  refreshServers(); // Od razu przy starcie
  setInterval(refreshServers, 30 * 1000); // Co 30 sekund
});