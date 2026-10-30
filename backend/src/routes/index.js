import { Router } from 'express';
import { config } from '../config/env.js';
import { query } from '../config/db.js';
import { asyncHandler } from '../utils/errors.js';
import authRoutes from './auth.js';
import publicRoutes from './public.js';
import tenantRoutes from './tenant.js';
import masterRoutes from './master.js';
import viewerRoutes from './viewer.js';
import webhookRoutes from './webhooks.js';

const router = Router();

router.get('/health', asyncHandler(async (_req, res) => {
  let database = 'ok';
  try {
    await query('SELECT 1');
  } catch {
    database = 'error';
  }
  res.status(database === 'ok' ? 200 : 503).json({ status: database === 'ok' ? 'ok' : 'degraded', database, version: config.appVersion });
}));

router.use('/auth', authRoutes);
router.use('/public', publicRoutes);
router.use('/tenant', tenantRoutes);
router.use('/master', masterRoutes);
router.use('/v/:slug', viewerRoutes);
router.use('/webhooks', webhookRoutes);

export default router;
