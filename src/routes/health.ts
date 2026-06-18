import { Router } from 'express';
import db from '../services/database';
import cache from '../services/cache';
import externalService from '../services/external';

const router = Router();

// Liveness probe – always returns OK if the app is running
router.get('/health/live', (_req, res) => {
  res.status(200).json({ status: 'ok', message: 'Live' });
});

// Readiness probe – checks DB, cache, and external services
router.get('/health/ready', async (_req, res) => {
  try {
    await db.ping(); // simple DB ping
    await cache.ping(); // cache ping
    await externalService.ping(); // external service check
    res.status(200).json({ status: 'ok', message: 'Ready' });
  } catch (err) {
    res.status(503).json({ status: 'fail', error: (err as Error).message });
  }
});

// Startup probe – runs on start-up to ensure all dependencies initialize correctly
router.get('/health/startup', async (_req, res) => {
  try {
    await db.initialize();
    await cache.initialize();
    await externalService.initialize();
    res.status(200).json({ status: 'ok', message: 'Startup checks passed' });
  } catch (err) {
    res.status(500).json({ status: 'error', error: (err as Error).message });
  }
});

export default router;
