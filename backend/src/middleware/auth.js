import { queryOne, query, parseJson } from '../config/db.js';
import { forbidden, notFound, paymentRequired, unauthorized } from '../utils/errors.js';
import { decryptSecret } from '../utils/crypto.js';
import { runWithLine } from '../services/lineContext.js';
import { assertLineUsable, refreshLine } from '../services/viewerService.js';
import { STAFF_COOKIE, VIEWER_COOKIE, verifyToken } from '../utils/tokens.js';
import { getTenantBySlug, getTenantByOwner } from '../services/tenantService.js';
import { getAccess } from '../services/subscriptionService.js';
import { audit } from '../services/auditService.js';

export async function authenticateStaff(req, _res, next) {
  try {
    const payload = verifyToken(req.cookies?.[STAFF_COOKIE], 'staff');
    if (!payload) throw unauthorized();
    const user = await queryOne('SELECT id, name, email, role, status, token_version FROM users WHERE id = ? AND deleted_at IS NULL', [payload.sub]);
    if (!user || user.status !== 'active' || user.token_version !== payload.tv) throw unauthorized('Sessão expirada. Entre novamente.', 'SESSION_EXPIRED');
    req.auth = { userId: user.id, role: user.role, name: user.name, email: user.email };
    next();
  } catch (err) {
    next(err);
  }
}

export const requireRole = (...roles) => async (req, _res, next) => {
  if (!req.auth || !roles.includes(req.auth.role)) {
    await audit(req, { action: 'access.denied', result: 'denied', metadata: { path: req.originalUrl, required: roles } });
    return next(forbidden());
  }
  next();
};

/** O assinante é sempre derivado da sessão — nunca de parâmetros enviados pelo cliente. */
export async function requireTenantOwner(req, res, next) {
  try {
    if (req.auth?.role !== 'tenant_owner') throw forbidden();
    const tenant = await getTenantByOwner(req.auth.userId);
    if (!tenant) throw notFound('Assinante não encontrado.');
    req.tenant = tenant;
    next();
  } catch (err) {
    next(err);
  }
}

export async function resolveTenantFromSlug(req, _res, next) {
  try {
    const tenant = await getTenantBySlug(String(req.params.slug || '').toLowerCase());
    if (!tenant) throw notFound('Esta página não existe.', 'TENANT_NOT_FOUND');
    req.tenant = tenant;
    next();
  } catch (err) {
    next(err);
  }
}

export async function authenticateViewer(req, _res, next) {
  try {
    const payload = verifyToken(req.cookies?.[VIEWER_COOKIE], 'viewer');
    if (!payload || Number(payload.tid) !== req.tenant.id) throw unauthorized('Entre para continuar.', 'VIEWER_UNAUTHORIZED');
    const viewer = await queryOne(
      'SELECT id, tenant_id, name, email, status, token_version, server_id, xtream_username, xtream_password_enc, account_info, account_checked_at FROM viewer_accounts WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL',
      [payload.sub, req.tenant.id],
    );
    if (!viewer || viewer.status !== 'active' || viewer.token_version !== payload.tv) throw unauthorized('Sessão expirada. Entre novamente.', 'VIEWER_UNAUTHORIZED');
    const session = await queryOne(
      'SELECT id, last_seen_at FROM viewer_sessions WHERE jti = ? AND viewer_id = ? AND revoked_at IS NULL AND expires_at > UTC_TIMESTAMP(3)',
      [payload.jti, viewer.id],
    );
    if (!session) throw unauthorized('Sessão encerrada. Entre novamente.', 'VIEWER_UNAUTHORIZED');
    if (Date.now() - new Date(session.last_seen_at).getTime() > 10 * 60_000) {
      await query('UPDATE viewer_sessions SET last_seen_at = UTC_TIMESTAMP(3) WHERE id = ?', [session.id]);
    }
    req.viewer = { id: viewer.id, name: viewer.name, email: viewer.email, jti: payload.jti, line: lineFromRow(viewer) };
    next();
  } catch (err) {
    next(err);
  }
}

/** Linha Xtream do espectador (null para contas antigas por e-mail, que usam as credenciais do servidor). */
function lineFromRow(v) {
  if (!v.xtream_username || !v.xtream_password_enc || !v.server_id) return null;
  const account = parseJson(v.account_info, null);
  return {
    viewerId: v.id,
    serverId: v.server_id,
    username: v.xtream_username,
    password: decryptSecret(v.xtream_password_enc),
    account,
    checkedAt: v.account_checked_at,
    allowedFormats: account?.allowedFormats ?? [],
  };
}

/** Faz as credenciais do espectador valerem para tudo que o catálogo chamar durante esta requisição. */
export function bindViewerLine(req, _res, next) {
  if (req.viewer?.line) return runWithLine(req.viewer.line, next);
  next();
}

/** Confere a linha em tempo real (no máximo a cada 5 min) e barra linhas desativadas ou vencidas. */
export async function requireActiveLine(req, _res, next) {
  try {
    if (req.viewer.line) assertLineUsable(await refreshLine(req.viewer.line, { maxAgeMs: 5 * 60_000 }));
    next();
  } catch (err) {
    next(err);
  }
}

/** Perfil escolhido pelo espectador (cabeçalho X-Profile-Id) — sempre validado contra espectador e assinante. */
export async function requireProfile(req, _res, next) {
  try {
    const id = Number.parseInt(req.get('x-profile-id') ?? '', 10);
    if (!Number.isInteger(id)) throw forbidden('Selecione um perfil.', 'PROFILE_REQUIRED');
    const profile = await queryOne(
      'SELECT id, name, avatar, is_kids FROM viewer_profiles WHERE id = ? AND viewer_id = ? AND tenant_id = ? AND deleted_at IS NULL',
      [id, req.viewer.id, req.tenant.id],
    );
    if (!profile) throw forbidden('Perfil inválido.', 'PROFILE_REQUIRED');
    req.profile = { id: profile.id, name: profile.name, isKids: !!profile.is_kids };
    next();
  } catch (err) {
    next(err);
  }
}

/** Bloqueia os recursos protegidos do player quando a assinatura/teste do assinante não está ativa. */
export async function requireActiveSubscription(req, _res, next) {
  try {
    const { access } = await getAccess(req.tenant.id);
    if (!access.hasAccess) throw paymentRequired('Este serviço está temporariamente indisponível.', 'SUBSCRIPTION_INACTIVE');
    next();
  } catch (err) {
    next(err);
  }
}
