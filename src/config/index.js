import 'dotenv/config';

function parseIntEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid integer for ${name}: ${raw}`);
  }
  return parsed;
}

function parseBoolEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

function parseCountries(raw) {
  if (!raw) return ['PL', 'DE'];
  return raw
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
}

export const ALL_CSGO_MAPS = [
  'de_dust2',
  'de_dust',
  'de_mirage',
  'de_inferno',
  'de_nuke',
  'de_overpass',
  'de_vertigo',
  'de_ancient',
  'de_anubis',
  'de_cache',
  'de_train',
  'de_cobblestone',
  'de_tuscan',
  'de_season',
  'de_canals',
  'cs_office',
  'cs_italy',
  'de_basalt',
  'de_thera'
];

export function loadConfig() {
  const steamApiKey = process.env.STEAM_API_KEY;
  if (!steamApiKey) {
    throw new Error('Missing required env: STEAM_API_KEY');
  }

  const requiredMaxPlayers = parseIntEnv('REQUIRED_MAX_PLAYERS', 10);
  if (requiredMaxPlayers < 1) {
    throw new Error('REQUIRED_MAX_PLAYERS must be >= 1');
  }

  const port = parseIntEnv('PORT', 3000);
  const refreshIntervalMs = parseIntEnv('REFRESH_INTERVAL_MS', 5 * 60 * 1000);
  const countryCacheTtlMs = parseIntEnv('COUNTRY_CACHE_TTL_MS', 60 * 60 * 1000);
  const steamLimit = parseIntEnv('STEAM_LIMIT', 500);
  const steamMapFetchConcurrency = parseIntEnv('STEAM_MAP_FETCH_CONCURRENCY', 4);
  const workerConcurrency = parseIntEnv('WORKER_CONCURRENCY', 20);
  const maxStaleMs = parseIntEnv('MAX_STALE_MS', 15 * 60 * 1000);
  const shutdownRefreshWaitMs = parseIntEnv('SHUTDOWN_REFRESH_WAIT_MS', 3000);

  if (workerConcurrency < 1) {
    throw new Error('WORKER_CONCURRENCY must be >= 1');
  }
  if (steamMapFetchConcurrency < 1) {
    throw new Error('STEAM_MAP_FETCH_CONCURRENCY must be >= 1');
  }

  if (maxStaleMs < 0) {
    throw new Error('MAX_STALE_MS must be >= 0');
  }

  if (shutdownRefreshWaitMs < 0) {
    throw new Error('SHUTDOWN_REFRESH_WAIT_MS must be >= 0');
  }

  const allowedCountries = parseCountries(process.env.ALLOWED_COUNTRIES);

  return {
    env: process.env.NODE_ENV || 'development',
    port,
    steamApiKey,
    appId: process.env.APP_ID || '4465480',
    allowedCountries,
    allowedCountriesSet: new Set(allowedCountries),
    requiredMaxPlayers,
    allowedMaps: ALL_CSGO_MAPS,
    allowedMapsSet: new Set(ALL_CSGO_MAPS),
    steamLimit,
    steamMapFetchConcurrency,
    autoRefreshEnabled: parseBoolEnv('AUTO_REFRESH_ENABLED', true),
    refreshIntervalMs,
    manualRefreshToken: process.env.REFRESH_TOKEN || '',
    countryCacheTtlMs,
    geoIpUrl: process.env.GEOIP_URL || 'http://ip-api.com/json',
    workerConcurrency,
    waitForInitialRefresh: parseBoolEnv('WAIT_FOR_INITIAL_REFRESH', false),
    maxStaleMs,
    shutdownRefreshWaitMs,
    snapshotCacheFile: process.env.SNAPSHOT_CACHE_FILE || '',
    restoreSnapshotOnStartup: parseBoolEnv('RESTORE_SNAPSHOT_ON_STARTUP', true),
    persistSnapshotOnRefresh: parseBoolEnv('PERSIST_SNAPSHOT_ON_REFRESH', true)
  };
}
