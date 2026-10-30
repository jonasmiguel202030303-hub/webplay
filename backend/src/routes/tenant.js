import { Router } from 'express';
import multer from 'multer';
import { config } from '../config/env.js';
import { asyncHandler, notFound } from '../utils/errors.js';
import { idParam } from '../utils/http.js';
import { pageParams } from '../utils/time.js';
import { validate } from '../middleware/validate.js';
import { sensitiveLimiter } from '../middleware/rateLimit.js';
import { noStore } from '../middleware/security.js';
import { authenticateStaff, requireTenantOwner } from '../middleware/auth.js';
import {
  brandSchema, tenantSettingsSchema, serverCreateSchema, serverUpdateSchema, serverTestSchema, viewerCreateByOwnerSchema,
  viewerStatusSchema, viewerPasswordSchema, checkoutSchema, supportSchema, privacyRequestSchema,
} from '../validators/schemas.js';
import * as tenantService from '../services/tenantService.js';
import * as uploads from '../services/uploadService.js';
import * as sources from '../services/sourceService.js';
import * as viewers from '../services/viewerService.js';
import * as billing from '../services/billingService.js';
import * as support from '../services/supportService.js';
import { getSubscriptionView } from '../services/subscriptionService.js';
import { getSettings } from '../services/settingsService.js';
import { query } from '../config/db.js';

const router = Router();
router.use(noStore, authenticateStaff, requireTenantOwner);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.uploadMaxBytes, files: 1, fields: 2 } });

router.get('/overview', asyncHandler(async (req, res) => {
  res.json(await tenantService.getOverview(req.tenant));
}));

// ----- Marca e configurações -----
router.get('/brand', asyncHandler(async (req, res) => {
  res.json({ slug: req.tenant.slug, brand: await tenantService.getBrand(req.tenant.id) });
}));

router.put('/brand', validate(brandSchema), asyncHandler(async (req, res) => {
  const brand = await tenantService.updateBrand(req, req.tenant, req.valid.body);
  const slug = req.valid.body.slug ?? req.tenant.slug;
  res.json({ slug, brand });
}));

router.post('/brand/assets/:kind', sensitiveLimiter(), upload.single('file'), asyncHandler(async (req, res) => {
  if (!uploads.ASSET_KINDS[req.params.kind]) throw notFound('Tipo de imagem desconhecido.');
  res.json({ brand: await uploads.saveBrandAsset(req, req.tenant, req.params.kind, req.file?.buffer) });
}));

router.delete('/brand/assets/:kind', asyncHandler(async (req, res) => {
  res.json({ brand: await uploads.removeBrandAsset(req, req.tenant, req.params.kind) });
}));

router.get('/settings', asyncHandler(async (req, res) => {
  res.json(await tenantService.getTenantSettings(req.tenant.id));
}));

router.put('/settings', validate(tenantSettingsSchema), asyncHandler(async (req, res) => {
  res.json(await tenantService.updateTenantSettings(req, req.tenant.id, req.valid.body));
}));

// ----- Servidores de conteúdo -----
router.get('/servers', asyncHandler(async (req, res) => {
  res.json({ servers: await sources.listServers(req.tenant.id) });
}));

router.post('/servers/test', sensitiveLimiter(), validate(serverTestSchema), asyncHandler(async (req, res) => {
  res.json(await sources.testConnection(req.valid.body));
}));

router.post('/servers', sensitiveLimiter(), validate(serverCreateSchema), asyncHandler(async (req, res) => {
  res.status(201).json({ server: await sources.createServer(req, req.tenant.id, req.valid.body) });
}));

router.put('/servers/:id', sensitiveLimiter(), validate(serverUpdateSchema), asyncHandler(async (req, res) => {
  res.json({ server: await sources.updateServer(req, req.tenant.id, idParam(req), req.valid.body) });
}));

router.delete('/servers/:id', asyncHandler(async (req, res) => {
  await sources.deleteServer(req, req.tenant.id, idParam(req));
  res.json({ ok: true });
}));

router.post('/servers/:id/test', sensitiveLimiter(), asyncHandler(async (req, res) => {
  res.json(await sources.testSavedServer(req, req.tenant.id, idParam(req)));
}));

router.post('/servers/:id/refresh', sensitiveLimiter(), asyncHandler(async (req, res) => {
  res.json({ result: await sources.refreshCategories(req, req.tenant.id, idParam(req)) });
}));

router.post('/servers/:id/default', asyncHandler(async (req, res) => {
  await sources.setDefaultServer(req, req.tenant.id, idParam(req));
  res.json({ ok: true });
}));

// ----- Espectadores -----
router.get('/viewers', asyncHandler(async (req, res) => {
  const { page, size, offset } = pageParams(req.query);
  const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 80) : '';
  res.json({ ...(await viewers.listViewersForOwner(req.tenant.id, { offset, size, search })), page, pageSize: size });
}));

router.post('/viewers', validate(viewerCreateByOwnerSchema), asyncHandler(async (req, res) => {
  res.status(201).json(await viewers.createViewerByOwner(req, req.tenant, req.valid.body));
}));

router.patch('/viewers/:id/status', validate(viewerStatusSchema), asyncHandler(async (req, res) => {
  await viewers.setViewerStatus(req, req.tenant, idParam(req), req.valid.body.status);
  res.json({ ok: true });
}));

router.post('/viewers/:id/password', validate(viewerPasswordSchema), asyncHandler(async (req, res) => {
  await viewers.setViewerPasswordByOwner(req, req.tenant, idParam(req), req.valid.body.password);
  res.json({ ok: true });
}));

router.delete('/viewers/:id', asyncHandler(async (req, res) => {
  await viewers.deleteViewerByOwner(req, req.tenant, idParam(req));
  res.json({ ok: true });
}));

router.get('/viewers/:id/profiles', asyncHandler(async (req, res) => {
  res.json({ profiles: await viewers.listProfilesForOwner(req.tenant.id, idParam(req)) });
}));

// ----- Assinatura e pagamentos -----
router.get('/subscription', asyncHandler(async (req, res) => {
  const [subscription, settings] = await Promise.all([getSubscriptionView(req.tenant.id), getSettings()]);
  let paymentsConfigured = true;
  try {
    const status = await billing.getMpSettingsView();
    paymentsConfigured = status.modes[status.activeMode].configured;
  } catch {
    paymentsConfigured = false;
  }
  res.json({ subscription, paymentsConfigured, productName: settings.product_name });
}));

router.get('/payments', asyncHandler(async (req, res) => {
  res.json({ payments: await billing.listTenantPayments(req.tenant.id) });
}));

router.post('/payments/checkout', sensitiveLimiter(), validate(checkoutSchema), asyncHandler(async (req, res) => {
  const payment = await billing.createCheckout(req, req.tenant, { email: req.auth.email }, req.valid.body.method);
  res.status(201).json({ payment });
}));

router.post('/payments/:id/sync', sensitiveLimiter(), asyncHandler(async (req, res) => {
  res.json(await billing.syncTenantPayment(req, req.tenant.id, idParam(req)));
}));

// ----- Avisos, ajuda e privacidade -----
router.get('/notifications', asyncHandler(async (req, res) => {
  res.json({ notifications: await support.listNotifications(req.auth.userId) });
}));

router.post('/notifications/read', asyncHandler(async (req, res) => {
  await support.markNotificationsRead(req.auth.userId);
  res.json({ ok: true });
}));

router.get('/support', asyncHandler(async (req, res) => {
  res.json({ requests: await support.listOwnSupportRequests(req.tenant.id) });
}));

router.post('/support', sensitiveLimiter(), validate(supportSchema), asyncHandler(async (req, res) => {
  res.status(201).json(await support.createSupportRequest(req, req.tenant, req.auth.userId, req.valid.body));
}));

router.post('/privacy-requests', sensitiveLimiter(), validate(privacyRequestSchema), asyncHandler(async (req, res) => {
  res.status(201).json(await support.createPrivacyRequest(req, req.tenant, req.auth.userId, req.valid.body));
}));

router.get('/terms-acceptances', asyncHandler(async (req, res) => {
  const rows = await query(
    'SELECT v.doc_type, v.version, v.title, a.accepted_at FROM terms_acceptances a JOIN terms_versions v ON v.id = a.terms_version_id WHERE a.user_id = ? ORDER BY a.id DESC LIMIT 20',
    [req.auth.userId],
  );
  res.json({ acceptances: rows.map((r) => ({ docType: r.doc_type, version: r.version, title: r.title, acceptedAt: r.accepted_at })) });
}));

export default router;
