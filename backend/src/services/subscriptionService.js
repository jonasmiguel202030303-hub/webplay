import { query, queryOne, withTransaction, isDuplicateError } from '../config/db.js';
import { config } from '../config/env.js';
import { getSettings } from './settingsService.js';
import { audit } from './auditService.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';
import { DAY_MS, HOUR_MS, toIso } from '../utils/time.js';
import { sendMail } from './mailService.js';
import { subscriptionExpiringEmailTemplate } from '../utils/emailTemplates.js';
import { logger } from '../config/logger.js';

/**
 * Calcula o estado efetivo da assinatura a partir dos relógios do SERVIDOR.
 * O frontend apenas exibe; nunca decide acesso.
 */
export function computeAccess(sub, { now = new Date(), hasPendingPayment = false } = {}) {
  const base = {
    status: 'expired',
    phase: 'none',
    hasAccess: false,
    endsAt: null,
    remainingMs: 0,
    serverNow: now.toISOString(),
  };
  if (!sub) return { ...base, status: 'expired', phase: 'none' };

  const trialEnd = sub.trial_ends_at ? new Date(sub.trial_ends_at) : null;
  const periodEnd = sub.current_period_end ? new Date(sub.current_period_end) : null;

  if (sub.status === 'suspended') return { ...base, status: 'suspended', phase: 'suspended' };
  if (sub.status === 'canceled') return { ...base, status: 'canceled', phase: 'canceled' };

  if (periodEnd && periodEnd > now && sub.status !== 'trial') {
    return { ...base, status: 'active', phase: 'plan', hasAccess: true, endsAt: periodEnd.toISOString(), remainingMs: periodEnd - now };
  }
  if (sub.status === 'trial' && trialEnd && trialEnd > now) {
    return { ...base, status: 'trial', phase: 'trial', hasAccess: true, endsAt: trialEnd.toISOString(), remainingMs: trialEnd - now };
  }
  const phase = periodEnd ? 'plan_expired' : trialEnd ? 'trial_ended' : 'no_trial';
  return { ...base, status: hasPendingPayment ? 'pending_payment' : 'expired', phase };
}

export async function getSubscriptionRow(tenantId, db = { queryOne }) {
  return db.queryOne('SELECT * FROM subscriptions WHERE tenant_id = ? LIMIT 1', [tenantId]);
}

export async function hasPendingPayment(tenantId) {
  const row = await queryOne(
    "SELECT id FROM payments WHERE tenant_id = ? AND status IN ('pending','in_process') AND created_at > (UTC_TIMESTAMP(3) - INTERVAL 3 DAY) LIMIT 1",
    [tenantId],
  );
  return !!row;
}

export async function getAccess(tenantId) {
  const [sub, pending] = await Promise.all([getSubscriptionRow(tenantId), hasPendingPayment(tenantId)]);
  return { sub, access: computeAccess(sub, { hasPendingPayment: pending }) };
}

export async function getSubscriptionView(tenantId) {
  const settings = await getSettings();
  const { sub, access } = await getAccess(tenantId);
  const now = Date.now();
  const periodEnd = sub?.current_period_end ? new Date(sub.current_period_end) : null;
  const windowMs = settings.renewal_window_days * DAY_MS;
  const canRenew = !(access.status === 'active' && periodEnd && periodEnd.getTime() - now > windowMs) && access.status !== 'suspended';
  return {
    status: access.status,
    phase: access.phase,
    hasAccess: access.hasAccess,
    endsAt: access.endsAt,
    remainingMs: access.remainingMs,
    remainingDays: access.hasAccess ? Math.ceil(access.remainingMs / DAY_MS) : 0,
    serverNow: access.serverNow,
    trial: { startedAt: toIso(sub?.trial_started_at), endsAt: toIso(sub?.trial_ends_at), available: !!sub?.trial_started_at },
    plan: { startedAt: toIso(sub?.current_period_start), endsAt: toIso(sub?.current_period_end) },
    suspendedReason: sub?.status === 'suspended' ? sub.suspended_reason : null,
    price: {
      cents: settings.price_cents,
      months: settings.subscription_months,
      currency: 'BRL',
    },
    canRenew,
    renewalWindowDays: settings.renewal_window_days,
  };
}

/** Inicia o teste gratuito na ativação da conta (dentro de transação). */
export async function startTrial(tx, { tenantId, userId, emailNormalized, ipHash }) {
  const settings = await getSettings();
  const now = new Date();
  const emailUsed = await tx.queryOne('SELECT id FROM trial_usage WHERE email_normalized = ? LIMIT 1', [emailNormalized]);
  let ipTooMany = false;
  if (ipHash) {
    const since = new Date(now.getTime() - config.trial.ipWindowDays * DAY_MS);
    const row = await tx.queryOne('SELECT COUNT(*) AS n FROM trial_usage WHERE ip_hash = ? AND started_at >= ?', [ipHash, since]);
    ipTooMany = Number(row?.n ?? 0) >= config.trial.maxPerIp;
  }

  if (emailUsed || ipTooMany) {
    await tx.query("INSERT INTO subscriptions (tenant_id, status) VALUES (?, 'expired') ON DUPLICATE KEY UPDATE tenant_id = tenant_id", [tenantId]);
    return { granted: false, reason: emailUsed ? 'EMAIL_ALREADY_USED_TRIAL' : 'IP_LIMIT' };
  }

  const endsAt = new Date(now.getTime() + settings.trial_hours * HOUR_MS);
  await tx.query(
    "INSERT INTO subscriptions (tenant_id, status, trial_started_at, trial_ends_at) VALUES (?, 'trial', ?, ?) ON DUPLICATE KEY UPDATE tenant_id = tenant_id",
    [tenantId, now, endsAt],
  );
  try {
    await tx.query('INSERT INTO trial_usage (tenant_id, user_id, email_normalized, ip_hash, started_at, ends_at) VALUES (?, ?, ?, ?, ?, ?)', [
      tenantId, userId, emailNormalized, ipHash, now, endsAt,
    ]);
  } catch (err) {
    if (isDuplicateError(err)) throw conflict('O teste gratuito já foi utilizado por esta conta.', 'TRIAL_ALREADY_USED');
    throw err;
  }
  return { granted: true, startedAt: now, endsAt };
}

/** Concede dias manualmente (somente master) com justificativa obrigatória registrada em auditoria. */
export async function grantDays(req, tenantId, days, reason) {
  if (!reason || reason.trim().length < 10) throw badRequest('Informe uma justificativa (mín. 10 caracteres).');
  const result = await withTransaction(async (tx) => {
    const sub = await tx.queryOne('SELECT * FROM subscriptions WHERE tenant_id = ? FOR UPDATE', [tenantId]);
    if (!sub) throw notFound('Assinatura não encontrada.');
    const now = new Date();
    const currentEnd = sub.current_period_end ? new Date(sub.current_period_end) : null;
    const stillActive = sub.status === 'active' && currentEnd && currentEnd > now;
    const start = stillActive ? new Date(sub.current_period_start) : now;
    const base = stillActive ? currentEnd : now;
    const newEnd = new Date(base.getTime() + days * DAY_MS);
    await tx.query(
      "UPDATE subscriptions SET status = 'active', current_period_start = ?, current_period_end = ?, suspended_reason = NULL WHERE id = ?",
      [start, newEnd, sub.id],
    );
    return { previousEnd: toIso(currentEnd), newEnd: toIso(newEnd) };
  });
  await audit(req, { action: 'subscription.grant_days', entityType: 'tenant', entityId: tenantId, tenantId, reason, metadata: { days, ...result } });
  return result;
}

export async function suspendTenant(req, tenantId, reason) {
  const sub = await getSubscriptionRow(tenantId);
  if (!sub) throw notFound('Assinatura não encontrada.');
  await query("UPDATE subscriptions SET status = 'suspended', suspended_reason = ? WHERE tenant_id = ?", [reason, tenantId]);
  await audit(req, { action: 'tenant.suspend', entityType: 'tenant', entityId: tenantId, tenantId, reason });
}

export async function reactivateTenant(req, tenantId) {
  const sub = await getSubscriptionRow(tenantId);
  if (!sub) throw notFound('Assinatura não encontrada.');
  if (sub.status !== 'suspended' && sub.status !== 'canceled') throw badRequest('A assinatura não está suspensa.');
  const now = new Date();
  let status = 'expired';
  if (sub.current_period_end && new Date(sub.current_period_end) > now) status = 'active';
  else if (sub.trial_ends_at && new Date(sub.trial_ends_at) > now && !sub.current_period_end) status = 'trial';
  await query('UPDATE subscriptions SET status = ?, suspended_reason = NULL, canceled_at = NULL WHERE tenant_id = ?', [status, tenantId]);
  await audit(req, { action: 'tenant.reactivate', entityType: 'tenant', entityId: tenantId, tenantId, metadata: { status } });
  return status;
}

const TRIAL_THRESHOLDS = [
  { key: '1h', ms: HOUR_MS, text: 'menos de 1 hora' },
  { key: '6h', ms: 6 * HOUR_MS, text: 'menos de 6 horas' },
  { key: '24h', ms: 24 * HOUR_MS, text: 'menos de 24 horas' },
];
const PLAN_THRESHOLDS = [
  { key: '1d', ms: DAY_MS, text: 'menos de 1 dia' },
  { key: '7d', ms: 7 * DAY_MS, text: '7 dias' },
  { key: '30d', ms: 30 * DAY_MS, text: '30 dias' },
];

/** Retorna `true` quando o aviso foi criado agora (primeira vez); `false` quando já existia (dedupe). */
async function notify(userId, tenantId, kind, dedupeKey, title, body) {
  try {
    await query('INSERT INTO notifications (user_id, tenant_id, kind, dedupe_key, title, body) VALUES (?, ?, ?, ?, ?, ?)', [
      userId, tenantId, kind, dedupeKey, title, body,
    ]);
    return true;
  } catch (err) {
    if (!isDuplicateError(err)) throw err;
    return false;
  }
}

/** Gera avisos de vencimento (24h/6h/1h do teste; 30d/7d/1d do plano). Idempotente; envia e-mail só na 1ª vez. */
export async function syncExpiryNotifications(row, now = new Date()) {
  const { tenant_id: tenantId, owner_user_id: userId, owner_email: email, owner_name: name } = row;
  if (row.status === 'trial' && row.trial_ends_at) {
    const left = new Date(row.trial_ends_at) - now;
    if (left <= 0) {
      await notify(userId, tenantId, 'trial_ended', 'trial:ended', 'Seu teste gratuito terminou', 'O player foi bloqueado. Seu painel e suas configurações continuam salvos. Contrate o plano para reativar.');
    } else {
      const hit = TRIAL_THRESHOLDS.find((t) => left <= t.ms);
      if (hit) await notify(userId, tenantId, 'trial_expiring', `trial:${hit.key}`, 'Seu teste gratuito está acabando', `Restam ${hit.text} de teste gratuito.`);
    }
  } else if (row.status === 'active' && row.current_period_end) {
    const end = new Date(row.current_period_end);
    const left = end - now;
    const tag = end.toISOString().slice(0, 10);
    if (left <= 0) {
      await notify(userId, tenantId, 'plan_expired', `plan:expired:${tag}`, 'Sua assinatura venceu', 'Os recursos do player foram bloqueados. Renove para reativar.');
    } else {
      const hit = PLAN_THRESHOLDS.find((t) => left <= t.ms);
      if (hit) {
        const created = await notify(userId, tenantId, 'plan_expiring', `plan:${hit.key}:${tag}`, 'Sua assinatura está perto de vencer', `Restam ${hit.text} de assinatura. Renove com antecedência: os dias restantes são mantidos.`);
        if (created && email) {
          const tpl = subscriptionExpiringEmailTemplate({
            name, daysLeftText: hit.text, endsAtFormatted: end.toLocaleDateString('pt-BR', { timeZone: 'UTC' }), renewUrl: `${config.appUrl}/painel/assinatura`,
          });
          sendMail({ to: email, subject: tpl.subject, text: tpl.text, html: tpl.html }).catch((err) => logger.error('Falha ao enviar e-mail de vencimento próximo', { error: err }));
        }
      }
    }
  }
}

export async function runExpiryJob(now = new Date()) {
  const rows = await query(
    `SELECT s.*, t.owner_user_id, u.email AS owner_email, u.name AS owner_name
     FROM subscriptions s JOIN tenants t ON t.id = s.tenant_id JOIN users u ON u.id = t.owner_user_id
     WHERE t.deleted_at IS NULL AND (
       (s.status = 'trial' AND s.trial_ends_at <= ? AND s.trial_ends_at >= ?) OR
       (s.status = 'active' AND s.current_period_end <= ? AND s.current_period_end >= ?))`,
    [new Date(now.getTime() + DAY_MS), new Date(now.getTime() - 7 * DAY_MS), new Date(now.getTime() + 30 * DAY_MS), new Date(now.getTime() - 7 * DAY_MS)],
  );
  for (const row of rows) await syncExpiryNotifications(row, now);
  return rows.length;
}
