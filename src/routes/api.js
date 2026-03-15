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

    const result = await refreshService.refreshServers('manual');
    if (result.busy) {
      return res.status(202).json({ status: 'busy' });
    }
    if (!result.ok) {
      return res.status(500).json({ status: 'failed', error: result.error });
    }
    return res.json({ status: 'done', count: result.count });
  });

  return router;
}
