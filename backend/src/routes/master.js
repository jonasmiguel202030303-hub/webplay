import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/errors.js';
import { idParam } from '../utils/http.js';
import { pageParams } from '../utils/time.js';
import { validate } from '../middleware/validate.js';
import { sensitiveLimiter } from '../middleware/rateLimit.js';
import { noStore } from '../middleware/security.js';
import { authenticateStaff, requireRole } from '../middleware/auth.js';
import {
  masterSettingsSchema, termsPublishSchema, mpSettingsSchema, mpModeSchema, emailSettingsSchema, emailTestSchema,
  grantDaysSchema, suspendSchema, adminCreateSchema, supportStatusSchema, viewerStatusSchema,
} from '../validators/schemas.js';
import * as master from '../services/masterService.js';
import * as billing from '../services/billingService.js';
import * as subscriptions from '../services/subscriptionService.js';
import * as emailSettings from '../services/emailSettingsService.js';
import { metricsSnapshot } from '../middleware/metrics.js';

const router = Router();
router.use(noStore, authenticateStaff, requireRole('master', 'admin'));
const masterOnly = requireRole('master');

const str = (v, max = 80) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
const int = (v) => (Number.isInteger(Number.parseInt(v, 10)) ? Number.parseInt(v, 10) : undefined);

router.get('/dashboard', asyncHandler(async (_req, res) => {
  res.json(await master.getDashboard());
}));

router.get('/system', asyncHandler(async (_req, res) => {
  res.json({ ...(await master.getSystemInfo()), metrics: metricsSnapshot() });
}));

// ----- Assinantes -----
router.get('/tenants', asyncHandler(async (req, res) => {
  const { page, size, offset } = pageParams(req.query);
  res.json({ ...(await master.listTenants({ offset, size, search: str(req.query.search), status: str(req.query.status, 20) })), page, pageSize: size });
}));

router.get('/tenants/:id', asyncHandler(async (req, res) => {
  res.json(await master.getTenantDetail(idParam(req)));
}));

router.post('/tenants/:id/suspend', validate(suspendSchema), asyncHandler(async (req, res) => {
  await subscriptions.suspendTenant(req, idParam(req), req.valid.body.reason);
  res.json(await master.getTenantDetail(idParam(req)));
}));

router.post('/tenants/:id/reactivate', asyncHandler(async (req, res) => {
  await subscriptions.reactivateTenant(req, idParam(req));
  res.json(await master.getTenantDetail(idParam(req)));
}));

router.post('/tenants/:id/grant-days', masterOnly, validate(grantDaysSchema), asyncHandler(async (req, res) => {
  await subscriptions.grantDays(req, idParam(req), req.valid.body.days, req.valid.body.reason);
  res.json(await master.getTenantDetail(idParam(req)));
}));

// ----- Configurações comerciais e termos -----
router.get('/settings', asyncHandler(async (_req, res) => {
  res.json(await master.getCommercialSettings());
}));

router.put('/settings', masterOnly, validate(masterSettingsSchema), asyncHandler(async (req, res) => {
  res.json(await master.updateCommercialSettings(req, req.valid.body));
}));

router.get('/terms', asyncHandler(async (req, res) => {
  res.json({ versions: await master.listTermsVersions(str(req.query.docType, 20)) });
}));

router.post('/terms', masterOnly, validate(termsPublishSchema), asyncHandler(async (req, res) => {
  await master.publishTerms(req, req.valid.body);
  res.status(201).json({ versions: await master.listTermsVersions() });
}));

// ----- Mercado Pago (somente master) -----
router.get('/mercadopago', masterOnly, asyncHandler(async (_req, res) => {
  res.json(await billing.getMpSettingsView());
}));

router.put('/mercadopago', masterOnly, validate(mpSettingsSchema), asyncHandler(async (req, res) => {
  res.json(await billing.saveMpSettings(req, req.valid.body));
}));

router.put('/mercadopago/mode', masterOnly, validate(mpModeSchema), asyncHandler(async (req, res) => {
  res.json(await billing.setMpMode(req, req.valid.body.mode));
}));

router.post('/mercadopago/test', masterOnly, sensitiveLimiter(), validate(mpModeSchema), asyncHandler(async (req, res) => {
  res.json(await billing.testMpConnection(req, req.valid.body.mode));
}));

// ----- E-mail (SMTP) (somente master) -----
router.get('/email', masterOnly, asyncHandler(async (_req, res) => {
  res.json(await emailSettings.getEmailSettingsView());
}));

router.put('/email', masterOnly, validate(emailSettingsSchema), asyncHandler(async (req, res) => {
  res.json(await emailSettings.saveEmailSettings(req, req.valid.body));
}));

router.post('/email/test', masterOnly, sensitiveLimiter(), validate(emailTestSchema), asyncHandler(async (req, res) => {
  res.json(await emailSettings.testEmailConnection(req, req.valid.body.to));
}));

// ----- Pagamentos e webhooks -----
router.get('/payments', asyncHandler(async (req, res) => {
  const { page, size, offset } = pageParams(req.query);
  res.json({ ...(await billing.listAllPayments({ offset, size, status: str(req.query.status, 20), tenantId: int(req.query.tenantId) })), page, pageSize: size });
}));

router.get('/payments/:id/events', asyncHandler(async (req, res) => {
  res.json({ events: await billing.listPaymentEvents(idParam(req)) });
}));

router.post('/payments/:id/sync', masterOnly, sensitiveLimiter(), asyncHandler(async (req, res) => {
  res.json(await billing.syncAnyPayment(req, idParam(req)));
}));

router.get('/webhook-events', asyncHandler(async (req, res) => {
  const { page, size, offset } = pageParams(req.query);
  res.json({ ...(await billing.listWebhookEvents({ offset, size, status: str(req.query.status, 30) })), page, pageSize: size });
}));

// ----- Auditoria -----
router.get('/audit', asyncHandler(async (req, res) => {
  const { page, size, offset } = pageParams(req.query, { defaultSize: 30 });
  res.json({
    ...(await master.listAudit({ offset, size, action: str(req.query.action), tenantId: int(req.query.tenantId), result: ['success', 'failure', 'denied'].includes(req.query.result) ? req.query.result : undefined })),
    page, pageSize: size,
  });
}));

// ----- Administradores -----
router.get('/admins', masterOnly, asyncHandler(async (_req, res) => {
  res.json({ admins: await master.listAdmins() });
}));

router.post('/admins', masterOnly, validate(adminCreateSchema), asyncHandler(async (req, res) => {
  await master.createAdmin(req, req.valid.body);
  res.status(201).json({ admins: await master.listAdmins() });
}));

router.patch('/admins/:id/status', masterOnly, validate(viewerStatusSchema), asyncHandler(async (req, res) => {
  await master.setAdminStatus(req, idParam(req), req.valid.body.status);
  res.json({ admins: await master.listAdmins() });
}));

// ----- Suporte e privacidade -----
router.get('/support', asyncHandler(async (req, res) => {
  const { page, size, offset } = pageParams(req.query);
  res.json({ ...(await master.listSupportRequests({ offset, size, status: str(req.query.status, 20) })), page, pageSize: size });
}));

router.patch('/support/:id', validate(supportStatusSchema), asyncHandler(async (req, res) => {
  await master.setSupportStatus(req, idParam(req), req.valid.body.status);
  res.json({ ok: true });
}));

const privacyStatusSchema = z.object({ status: z.enum(['open', 'in_progress', 'done', 'rejected']) });

router.get('/privacy-requests', asyncHandler(async (req, res) => {
  const { page, size, offset } = pageParams(req.query);
  res.json({ ...(await master.listPrivacyRequests({ offset, size, status: str(req.query.status, 20) })), page, pageSize: size });
}));

router.patch('/privacy-requests/:id', validate(privacyStatusSchema), asyncHandler(async (req, res) => {
  await master.setPrivacyStatus(req, idParam(req), req.valid.body.status);
  res.json({ ok: true });
}));

export default router;
