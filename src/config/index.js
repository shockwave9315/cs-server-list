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

export function loadConfig() {
  const steamApiKey = process.env.STEAM_API_KEY;
  if (!steamApiKey) {
    throw new Error('Missing required env: STEAM_API_KEY');
  }

  const minSlots = parseIntEnv('MIN_SLOTS', 8);
  const maxSlots = parseIntEnv('MAX_SLOTS', 10);
  if (minSlots > maxSlots) {
    throw new Error(`Invalid slot range: MIN_SLOTS (${minSlots}) > MAX_SLOTS (${maxSlots})`);
  }

  const port = parseIntEnv('PORT', 3000);
  const refreshIntervalMs = parseIntEnv('REFRESH_INTERVAL_MS', 5 * 60 * 1000);
  const countryCacheTtlMs = parseIntEnv('COUNTRY_CACHE_TTL_MS', 60 * 60 * 1000);
  const steamLimit = parseIntEnv('STEAM_LIMIT', 500);
  const workerConcurrency = parseIntEnv('WORKER_CONCURRENCY', 20);
  const maxStaleMs = parseIntEnv('MAX_STALE_MS', 15 * 60 * 1000);
  const shutdownRefreshWaitMs = parseIntEnv('SHUTDOWN_REFRESH_WAIT_MS', 3000);

  if (workerConcurrency < 1) {
    throw new Error('WORKER_CONCURRENCY must be >= 1');
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
    targetMap: process.env.TARGET_MAP || 'de_dust2',
    appId: process.env.APP_ID || '4465480',
    allowedCountries,
    allowedCountriesSet: new Set(allowedCountries),
    minSlots,
    maxSlots,
    steamLimit,
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
