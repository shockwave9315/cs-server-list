import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createApiRouter } from './routes/api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function createApp({ config, refreshService }) {
  const app = express();

  app.use(express.json());
  app.use(express.static(join(__dirname, '..', 'public')));

  app.get('/health', (req, res) => {
    const snapshot = refreshService.getSnapshot();
    const healthy = snapshot.lastSuccessAt !== null;
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'degraded',
      env: config.env,
      refreshInProgress: snapshot.refreshInProgress,
      lastSuccessAt: snapshot.lastSuccessAt,
      stale: snapshot.stale
    });
  });

  app.use('/api', createApiRouter({ refreshService, config }));

  return app;
}
