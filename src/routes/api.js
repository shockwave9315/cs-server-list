import { Router } from 'express';

export function createApiRouter({ refreshService, config }) {
  const router = Router();

  router.get('/servers', (req, res) => {
    res.json(refreshService.getSnapshot());
  });

  router.post('/refresh', async (req, res) => {
    if (config.manualRefreshToken) {
      const authHeader = req.get('authorization') || '';
      const bearer = authHeader.toLowerCase().startsWith('bearer ')
        ? authHeader.slice(7)
        : '';
      const token = req.get('x-refresh-token') || bearer;
      if (token !== config.manualRefreshToken) {
        return res.status(401).json({ status: 'unauthorized' });
      }
    }

    const requestedScope = req.body && typeof req.body === 'object'
      ? req.body.mapScope
      : undefined;

    const result = await refreshService.refreshServers('manual', { mapScope: requestedScope });
    if (result.status === 'busy') {
      return res.status(202).json({ status: 'busy' });
    }
    if (result.status === 'error') {
      return res.status(500).json({ status: 'error', error: result.error });
    }
    return res.json({ status: 'success', count: result.count });
  });

  return router;
}
