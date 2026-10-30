import { query, queryOne, withTransaction, isDuplicateError, parseJson } from '../config/db.js';
import { config } from '../config/env.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';
import { normalizeEmail } from '../utils/email.js';
import { getSettings, setSettings } from './settingsService.js';
import { getSubscriptionView } from './subscriptionService.js';
import { getBrand } from './tenantService.js';
import { hashPassword } from './authService.js';
import { audit } from './auditService.js';
import { paymentView } from './billingService.js';

const like = (s) => `%${String(s).replace(/[%_\\]/g, '\\$&')}%`;

// Estado efetivo calculado no banco com o relógio do servidor (espelha computeAccess).
const EFFECTIVE_STATUS_SQL = `CASE
  WHEN s.status = 'suspended' THEN 'suspended'
  WHEN s.status = 'canceled' THEN 'canceled'
  WHEN s.current_period_end > UTC_TIMESTAMP(3) AND s.status <> 'trial' THEN 'active'
  WHEN s.status = 'trial' AND s.trial_ends_at > UTC_TIMESTAMP(3) THEN 'trial'
  ELSE 'expired' END`;

// ---------- Painel ----------

export async function getDashboard() {
  const [status, signups7, signups30, viewers, revenue, paymentsByStatus, failedWebhooks, signupSeries, revenueSeries, expiring] = await Promise.all([
    query(`SELECT ${EFFECTIVE_STATUS_SQL} AS st, COUNT(*) AS n FROM subscriptions s JOIN tenants t ON t.id = s.tenant_id WHERE t.deleted_at IS NULL GROUP BY st`),
    queryOne('SELECT COUNT(*) AS n FROM tenants WHERE deleted_at IS NULL AND created_at > (UTC_TIMESTAMP(3) - INTERVAL 7 DAY)'),
    queryOne('SELECT COUNT(*) AS n FROM tenants WHERE deleted_at IS NULL AND created_at > (UTC_TIMESTAMP(3) - INTERVAL 30 DAY)'),
    queryOne('SELECT COUNT(*) AS n FROM viewer_accounts WHERE deleted_at IS NULL'),
    query("SELECT mode, COALESCE(SUM(amount_cents),0) AS total, COUNT(*) AS n FROM payments WHERE status = 'approved' GROUP BY mode"),
    query('SELECT status, COUNT(*) AS n FROM payments GROUP BY status'),
    queryOne("SELECT COUNT(*) AS n FROM payment_webhook_events WHERE status IN ('failed','invalid_signature') AND received_at > (UTC_TIMESTAMP(3) - INTERVAL 7 DAY)"),
    query('SELECT DATE(created_at) AS d, COUNT(*) AS n FROM tenants WHERE deleted_at IS NULL AND created_at > (UTC_TIMESTAMP(3) - INTERVAL 30 DAY) GROUP BY d ORDER BY d'),
    query("SELECT DATE(paid_at) AS d, SUM(amount_cents) AS total FROM payments WHERE status = 'approved' AND mode = 'production' AND paid_at > (UTC_TIMESTAMP(3) - INTERVAL 30 DAY) GROUP BY d ORDER BY d"),
    queryOne("SELECT COUNT(*) AS n FROM subscriptions WHERE (status = 'active' AND current_period_end BETWEEN UTC_TIMESTAMP(3) AND (UTC_TIMESTAMP(3) + INTERVAL 30 DAY)) OR (status = 'trial' AND trial_ends_at BETWEEN UTC_TIMESTAMP(3) AND (UTC_TIMESTAMP(3) + INTERVAL 24 HOUR))"),
  ]);
  const by = Object.fromEntries(status.map((r) => [r.st, Number(r.n)]));
  const rev = Object.fromEntries(revenue.map((r) => [r.mode, { totalCents: Number(r.total), payments: Number(r.n) }]));
  return {
    tenants: {
      total: Object.values(by).reduce((a, b) => a + b, 0),
      trial: by.trial ?? 0,
      active: by.active ?? 0,
      expired: by.expired ?? 0,
      suspended: by.suspended ?? 0,
      canceled: by.canceled ?? 0,
      newLast7Days: Number(signups7.n),
      newLast30Days: Number(signups30.n),
      expiringSoon: Number(expiring.n),
    },
    viewers: Number(viewers.n),
    revenue: { production: rev.production ?? { totalCents: 0, payments: 0 }, test: rev.test ?? { totalCents: 0, payments: 0 } },
    payments: Object.fromEntries(paymentsByStatus.map((r) => [r.status, Number(r.n)])),
    webhookProblemsLast7Days: Number(failedWebhooks.n),
    series: {
      signups: signupSeries.map((r) => ({ date: new Date(r.d).toISOString().slice(0, 10), value: Number(r.n) })),
      revenue: revenueSeries.map((r) => ({ date: new Date(r.d).toISOString().slice(0, 10), valueCents: Number(r.total) })),
    },
  };
}

// ---------- Assinantes ----------

export async function listTenants({ offset, size, search, status }) {
  const conds = ['t.deleted_at IS NULL'];
  const params = [];
  if (search) {
    conds.push('(u.name LIKE ? OR u.email LIKE ? OR t.slug LIKE ? OR b.display_name LIKE ?)');
    params.push(like(search), like(search), like(search), like(search));
  }
  const having = status && ['trial', 'active', 'expired', 'suspended', 'canceled'].includes(status) ? 'WHERE st = ?' : '';
  const base = `SELECT t.id, t.slug, t.created_at, u.name AS owner_name, u.email AS owner_email, u.status AS user_status, b.display_name,
      s.trial_ends_at, s.current_period_end, ${EFFECTIVE_STATUS_SQL} AS st
    FROM tenants t JOIN users u ON u.id = t.owner_user_id JOIN tenant_branding b ON b.tenant_id = t.id
    LEFT JOIN subscriptions s ON s.tenant_id = t.id WHERE ${conds.join(' AND ')}`;
  const hparams = having ? [...params, status] : params;
  const [rows, total] = await Promise.all([
    query(`SELECT * FROM (${base}) x ${having} ORDER BY id DESC LIMIT ? OFFSET ?`, [...hparams, size, offset]),
    queryOne(`SELECT COUNT(*) AS n FROM (${base}) x ${having}`, hparams),
  ]);
  return {
    items: rows.map((r) => ({
      id: r.id, slug: r.slug, brand: r.display_name, ownerName: r.owner_name, ownerEmail: r.owner_email,
      accountStatus: r.user_status, status: r.st, trialEndsAt: r.trial_ends_at, planEndsAt: r.current_period_end, createdAt: r.created_at,
    })),
    total: Number(total.n),
  };
}

export async function getTenantDetail(tenantId) {
  const tenant = await queryOne(
    'SELECT t.id, t.slug, t.created_at, u.id AS user_id, u.name AS owner_name, u.email AS owner_email, u.status AS user_status, u.last_login_at FROM tenants t JOIN users u ON u.id = t.owner_user_id WHERE t.id = ? AND t.deleted_at IS NULL',
    [tenantId],
  );
  if (!tenant) throw notFound('Assinante não encontrado.');
  const [brand, subscription, payments, counts, audits] = await Promise.all([
    getBrand(tenantId),
    getSubscriptionView(tenantId),
    query('SELECT * FROM payments WHERE tenant_id = ? ORDER BY id DESC LIMIT 50', [tenantId]),
    queryOne(
      `SELECT (SELECT COUNT(*) FROM viewer_accounts WHERE tenant_id = ? AND deleted_at IS NULL) AS viewers,
              (SELECT COUNT(*) FROM viewer_profiles WHERE tenant_id = ? AND deleted_at IS NULL) AS profiles,
              (SELECT COUNT(*) FROM source_servers WHERE tenant_id = ? AND deleted_at IS NULL) AS servers`,
      [tenantId, tenantId, tenantId],
    ),
    query('SELECT action, result, reason, actor_role, created_at FROM audit_logs WHERE tenant_id = ? ORDER BY id DESC LIMIT 30', [tenantId]),
  ]);
  return {
    id: tenant.id,
    slug: tenant.slug,
    createdAt: tenant.created_at,
    owner: { id: tenant.user_id, name: tenant.owner_name, email: tenant.owner_email, status: tenant.user_status, lastLoginAt: tenant.last_login_at },
    brand,
    subscription,
    counts: { viewers: Number(counts.viewers), profiles: Number(counts.profiles), servers: Number(counts.servers) },
    payments: payments.map((p) => ({ ...paymentView(p), mpPaymentId: p.mp_payment_id })),
    audit: audits.map((a) => ({ action: a.action, result: a.result, reason: a.reason, actorRole: a.actor_role, at: a.created_at })),
  };
}

// ---------- Configurações comerciais ----------

const SETTINGS_MAP = {
  priceCents: 'price_cents',
  subscriptionMonths: 'subscription_months',
  trialHours: 'trial_hours',
  renewalWindowDays: 'renewal_window_days',
  headline: 'commercial_headline',
  description: 'commercial_description',
  footerText: 'footer_text',
  supportWhatsapp: 'support_whatsapp',
  supportEmail: 'support_email',
  supportHoursText: 'support_hours_text',
};

export async function getCommercialSettings() {
  const s = await getSettings();
  return Object.fromEntries(Object.entries(SETTINGS_MAP).map(([camel, snake]) => [camel, s[snake]]));
}

export async function updateCommercialSettings(req, data) {
  const before = await getCommercialSettings();
  const updates = {};
  const changed = {};
  for (const [camel, snake] of Object.entries(SETTINGS_MAP)) {
    if (data[camel] !== undefined && data[camel] !== before[camel]) {
      updates[snake] = data[camel];
      changed[camel] = { from: before[camel], to: data[camel] };
    }
  }
  if (Object.keys(updates).length) {
    await setSettings(updates, req.auth.userId);
    await audit(req, { action: 'settings.update', entityType: 'platform_settings', metadata: changed });
  }
  return getCommercialSettings();
}

// ---------- Termos ----------

export async function listTermsVersions(docType) {
  const rows = await query(
    `SELECT id, doc_type, version, title, is_current, published_at FROM terms_versions ${docType ? 'WHERE doc_type = ?' : ''} ORDER BY id DESC LIMIT 100`,
    docType ? [docType] : [],
  );
  return rows.map((r) => ({ id: r.id, docType: r.doc_type, version: r.version, title: r.title, isCurrent: !!r.is_current, publishedAt: r.published_at }));
}

export async function publishTerms(req, { docType, version, title, content }) {
  try {
    await withTransaction(async (tx) => {
      await tx.query('UPDATE terms_versions SET is_current = 0 WHERE doc_type = ?', [docType]);
      await tx.query('INSERT INTO terms_versions (doc_type, version, title, content, is_current, created_by) VALUES (?, ?, ?, ?, 1, ?)', [docType, version, title, content, req.auth.userId]);
    });
  } catch (err) {
    if (isDuplicateError(err)) throw conflict('Esta versão já foi publicada. Informe um novo número de versão.', 'VERSION_EXISTS');
    throw err;
  }
  await audit(req, { action: 'terms.publish', entityType: 'terms', entityId: `${docType}@${version}`, metadata: { docType, version } });
}

// ---------- Auditoria ----------

export async function listAudit({ offset, size, action, tenantId, result }) {
  const conds = [];
  const params = [];
  if (action) { conds.push('a.action LIKE ?'); params.push(like(action)); }
  if (tenantId) { conds.push('a.tenant_id = ?'); params.push(tenantId); }
  if (result) { conds.push('a.result = ?'); params.push(result); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const [rows, total] = await Promise.all([
    query(
      `SELECT a.id, a.action, a.entity_type, a.entity_id, a.result, a.reason, a.metadata, a.ip, a.actor_role, a.tenant_id, a.created_at, u.email AS actor_email
         FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_user_id ${where} ORDER BY a.id DESC LIMIT ? OFFSET ?`,
      [...params, size, offset],
    ),
    queryOne(`SELECT COUNT(*) AS n FROM audit_logs a ${where}`, params),
  ]);
  return {
    items: rows.map((r) => ({
      id: r.id, action: r.action, entityType: r.entity_type, entityId: r.entity_id, result: r.result, reason: r.reason,
      metadata: parseJson(r.metadata), ip: r.ip, actorRole: r.actor_role, actorEmail: r.actor_email, tenantId: r.tenant_id, at: r.created_at,
    })),
    total: Number(total.n),
  };
}

// ---------- Administradores ----------

export async function listAdmins() {
  const rows = await query("SELECT id, name, email, role, status, last_login_at, created_at FROM users WHERE role IN ('master','admin') AND deleted_at IS NULL ORDER BY id");
  return rows.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, status: u.status, lastLoginAt: u.last_login_at, createdAt: u.created_at }));
}

export async function createAdmin(req, { name, email, password }) {
  try {
    const r = await query("INSERT INTO users (name, email, email_normalized, password_hash, role, status, email_verified_at) VALUES (?, ?, ?, ?, 'admin', 'active', UTC_TIMESTAMP(3))", [
      name, email, normalizeEmail(email), await hashPassword(password),
    ]);
    await audit(req, { action: 'admin.create', entityType: 'user', entityId: r.insertId });
    return { id: r.insertId };
  } catch (err) {
    if (isDuplicateError(err)) throw conflict('Este e-mail já possui cadastro.', 'EMAIL_TAKEN');
    throw err;
  }
}

export async function setAdminStatus(req, userId, status) {
  const user = await queryOne("SELECT id, role FROM users WHERE id = ? AND role = 'admin' AND deleted_at IS NULL", [userId]);
  if (!user) throw notFound('Administrador não encontrado.');
  await query('UPDATE users SET status = ?, token_version = token_version + 1 WHERE id = ?', [status, userId]);
  await audit(req, { action: `admin.${status === 'active' ? 'reactivate' : 'suspend'}`, entityType: 'user', entityId: userId });
}

// ---------- Suporte e privacidade ----------

export async function listSupportRequests({ offset, size, status }) {
  const where = status ? 'WHERE r.status = ?' : '';
  const params = status ? [status] : [];
  const [rows, total] = await Promise.all([
    query(
      `SELECT r.*, t.slug, u.email FROM support_requests r JOIN tenants t ON t.id = r.tenant_id JOIN users u ON u.id = r.user_id ${where} ORDER BY r.id DESC LIMIT ? OFFSET ?`,
      [...params, size, offset],
    ),
    queryOne(`SELECT COUNT(*) AS n FROM support_requests r ${where}`, params),
  ]);
  return { items: rows.map((r) => ({ id: r.id, slug: r.slug, email: r.email, subject: r.subject, message: r.message, status: r.status, createdAt: r.created_at })), total: Number(total.n) };
}

export async function setSupportStatus(req, id, status) {
  const res = await query('UPDATE support_requests SET status = ? WHERE id = ?', [status, id]);
  if (!res.affectedRows) throw notFound('Solicitação não encontrada.');
  await audit(req, { action: 'support.status', entityType: 'support_request', entityId: id, metadata: { status } });
}

export async function listPrivacyRequests({ offset, size, status }) {
  const where = status ? 'WHERE status = ?' : '';
  const params = status ? [status] : [];
  const [rows, total] = await Promise.all([
    query(`SELECT * FROM privacy_requests ${where} ORDER BY id DESC LIMIT ? OFFSET ?`, [...params, size, offset]),
    queryOne(`SELECT COUNT(*) AS n FROM privacy_requests ${where}`, params),
  ]);
  return {
    items: rows.map((r) => ({ id: r.id, subjectType: r.subject_type, subjectId: r.subject_id, tenantId: r.tenant_id, requestType: r.request_type, status: r.status, notes: r.notes, createdAt: r.created_at })),
    total: Number(total.n),
  };
}

export async function setPrivacyStatus(req, id, status) {
  if (!['open', 'in_progress', 'done', 'rejected'].includes(status)) throw badRequest('Status inválido.');
  const res = await query('UPDATE privacy_requests SET status = ? WHERE id = ?', [status, id]);
  if (!res.affectedRows) throw notFound('Solicitação não encontrada.');
  await audit(req, { action: 'privacy.status', entityType: 'privacy_request', entityId: id, metadata: { status } });
}

// ---------- Sistema ----------

export async function getSystemInfo() {
  let dbOk = true;
  const started = Date.now();
  try {
    await query('SELECT 1');
  } catch {
    dbOk = false;
  }
  const mem = process.memoryUsage();
  return {
    version: config.appVersion,
    node: process.version,
    env: config.isProd ? 'production' : 'development',
    uptimeSeconds: Math.round(process.uptime()),
    memoryMb: { rss: Math.round(mem.rss / 1048576), heapUsed: Math.round(mem.heapUsed / 1048576) },
    database: { ok: dbOk, latencyMs: Date.now() - started },
  };
}
