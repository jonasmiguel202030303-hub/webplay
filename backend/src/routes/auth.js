import { Router } from 'express';
import { asyncHandler } from '../utils/errors.js';
import { validate } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { authenticateStaff } from '../middleware/auth.js';
import { noStore } from '../middleware/security.js';
import {
  registerSchema, loginSchema, tokenSchema, emailOnlySchema, resetSchema, changePasswordSchema,
} from '../validators/schemas.js';
import * as auth from '../services/authService.js';
import { STAFF_COOKIE, cookieOptions, signStaffToken, staffCookieMaxAge } from '../utils/tokens.js';
import { queryOne } from '../config/db.js';
import { getTenantByOwner, getBrand } from '../services/tenantService.js';
import { getSubscriptionView } from '../services/subscriptionService.js';

const router = Router();
router.use(noStore);

const userView = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role });

async function sessionPayload(user) {
  const out = { user: userView(user), tenant: null, subscription: null };
  if (user.role === 'tenant_owner') {
    const tenant = await getTenantByOwner(user.id);
    if (tenant) {
      const [brand, subscription] = await Promise.all([getBrand(tenant.id), getSubscriptionView(tenant.id)]);
      out.tenant = { slug: tenant.slug, displayName: brand.displayName };
      out.subscription = subscription;
    }
  }
  return out;
}

const setSession = (res, user) => res.cookie(STAFF_COOKIE, signStaffToken(user), cookieOptions(staffCookieMaxAge()));

router.post('/register', authLimiter(), validate(registerSchema), asyncHandler(async (req, res) => {
  await auth.register(req, req.valid.body);
  res.status(201).json({ ok: true, message: 'Conta criada com sucesso.' });
}));

router.post('/activate', authLimiter(), validate(tokenSchema), asyncHandler(async (req, res) => {
  const result = await auth.activate(req, req.valid.body.token);
  res.json({ ok: true, ...result });
}));

router.post('/resend-activation', authLimiter(), validate(emailOnlySchema), asyncHandler(async (req, res) => {
  const result = await auth.resendActivation(req, req.valid.body.email);
  res.json({ ok: true, message: 'Se houver uma conta pendente para este e-mail, enviamos um novo link.', ...result });
}));

router.post('/login', authLimiter(), validate(loginSchema), asyncHandler(async (req, res) => {
  const user = await auth.login(req, req.valid.body);
  setSession(res, user);
  res.json(await sessionPayload(user));
}));

router.post('/logout', (req, res) => {
  res.clearCookie(STAFF_COOKIE, { ...cookieOptions(), maxAge: undefined });
  res.json({ ok: true });
});

router.get('/me', authenticateStaff, asyncHandler(async (req, res) => {
  const user = await queryOne('SELECT id, name, email, role, token_version FROM users WHERE id = ?', [req.auth.userId]);
  res.json(await sessionPayload(user));
}));

router.post('/forgot-password', authLimiter(), validate(emailOnlySchema), asyncHandler(async (req, res) => {
  const result = await auth.forgotPassword(req, req.valid.body.email);
  res.json({ ok: true, message: 'Se o e-mail estiver cadastrado, enviaremos as instruções de redefinição.', ...result });
}));

router.post('/reset-password', authLimiter(), validate(resetSchema), asyncHandler(async (req, res) => {
  await auth.resetPassword(req, req.valid.body);
  res.json({ ok: true, message: 'Senha redefinida. Entre com a nova senha.' });
}));

router.post('/change-password', authenticateStaff, validate(changePasswordSchema), asyncHandler(async (req, res) => {
  const user = await auth.changePassword(req, req.auth.userId, req.valid.body);
  setSession(res, user);
  res.json({ ok: true, message: 'Senha alterada.' });
}));

export default router;
