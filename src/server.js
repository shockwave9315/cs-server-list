import { loadConfig } from './config/index.js';
import { createApp } from './app.js';
import { logger } from './utils/logger.js';
import { createSteamService } from './services/steamService.js';
import { createGeoIpService } from './services/geoIpService.js';
import { createGameDigService } from './services/gameDigService.js';
import { createRefreshService } from './services/refreshService.js';

const config = loadConfig();

const steamService = createSteamService(config);
const geoIpService = createGeoIpService(config);
const gameDigService = createGameDigService();
const refreshService = createRefreshService({
  config,
  logger,
  steamService,
  geoIpService,
  gameDigService
});

await refreshService.restoreSnapshot();

const app = createApp({ config, refreshService });

let schedulerHandle = null;
let shuttingDown = false;

const server = app.listen(config.port, async () => {
  logger.info('server.started', { port: config.port });

  logger.info('startup.initial_refresh_mode', {
    waitForInitialRefresh: config.waitForInitialRefresh
  });

  if (config.waitForInitialRefresh) {
    const initialResult = await refreshService.refreshServers('startup');
    logger.info('startup.initial_refresh_complete', { result: initialResult.status });
  } else {
    refreshService.refreshServers('startup');
  }

  if (config.autoRefreshEnabled) {
    schedulerHandle = setInterval(() => {
      refreshService.refreshServers('scheduler');
    }, config.refreshIntervalMs);
    logger.info('scheduler.started', { refreshIntervalMs: config.refreshIntervalMs });
  }
});

function waitForActiveRefresh(timeoutMs) {
  const active = refreshService.getActiveRefreshPromise();
  if (!active || timeoutMs <= 0) return Promise.resolve('none');

  return Promise.race([
    active.then(() => 'done').catch(() => 'done'),
    new Promise((resolve) => {
      setTimeout(() => resolve('timeout'), timeoutMs);
    })
  ]);
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info('shutdown.start', { signal });

  if (schedulerHandle) {
    clearInterval(schedulerHandle);
    schedulerHandle = null;
  }

  const refreshWait = await waitForActiveRefresh(config.shutdownRefreshWaitMs);
  if (refreshWait === 'timeout') {
    logger.warn('shutdown.refresh_wait_timeout', { timeoutMs: config.shutdownRefreshWaitMs });
  }

  server.close((error) => {
    if (error) {
      logger.error('shutdown.failed', { signal, error: error.message });
      process.exitCode = 1;
      return;
    }

    logger.info('shutdown.complete', { signal, refreshWait });
  });
}

process.on('SIGINT', () => {
  shutdown('SIGINT');
});
process.on('SIGTERM', () => {
  shutdown('SIGTERM');
});
