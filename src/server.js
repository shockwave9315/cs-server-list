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

const app = createApp({ config, refreshService });

app.listen(config.port, () => {
  logger.info('server.started', { port: config.port });
  refreshService.refreshServers('startup');

  if (config.autoRefreshEnabled) {
    setInterval(() => {
      refreshService.refreshServers('scheduler');
    }, config.refreshIntervalMs);
    logger.info('scheduler.started', { refreshIntervalMs: config.refreshIntervalMs });
  }
});
