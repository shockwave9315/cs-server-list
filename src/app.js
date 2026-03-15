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

    if (snapshot.freshness === 'never_succeeded') {
      return res.status(503).json({
        status: 'degraded',
        reason: snapshot.freshness,
        refreshInProgress: snapshot.refreshInProgress,
        lastError: snapshot.lastError
      });
    }

    const stale = snapshot.freshness === 'stale';
    return res.status(stale ? 503 : 200).json({
      status: stale ? 'degraded' : 'ok',
      reason: snapshot.freshness,
      refreshInProgress: snapshot.refreshInProgress,
      lastSuccessAt: snapshot.lastSuccessAt,
      ageMs: snapshot.ageMs,
      lastError: snapshot.lastError
    });
  });

  app.use('/api', createApiRouter({ refreshService, config }));

  return app;
}
