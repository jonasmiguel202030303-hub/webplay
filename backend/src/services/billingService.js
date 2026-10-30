import crypto from 'node:crypto';
import { config } from '../config/env.js';
import { query, queryOne, withTransaction, isDuplicateError, parseJson } from '../config/db.js';
import { AppError, badRequest, notFound } from '../utils/errors.js';
import { decryptSecret, encryptSecret, maskSecret, sha256, timingSafeEqualStr, uuid } from '../utils/crypto.js';
import { addMonthsUtc, toIso } from '../utils/time.js';
import { logger } from '../config/logger.js';
import { getSettings, setSettings } from './settingsService.js';
import { getSubscriptionView } from './subscriptionService.js';
import { audit } from './auditService.js';

const STATUS_MAP = {
  approved: 'approved',
  authorized: 'in_process',
  pending: 'pending',
  in_process: 'in_process',
  in_mediation: 'in_process',
  rejected: 'rejected',
  cancelled: 'cancelled',
  refunded: 'refunded',
  charged_back: 'charged_back',
};

// ---------- Configuração / cliente da API ----------

export async function getActiveMode() {
  return (await getSettings()).mp_mode === 'production' ? 'production' : 'test';
}

async function loadModeConfig(mode) {
  const row = await queryOne('SELECT * FROM payment_settings WHERE mode = ?', [mode]);
  if (!row?.access_token_enc) {
    throw new AppError(503, 'PAYMENTS_NOT_CONFIGURED', 'Os pagamentos ainda não foram configurados pela administração.');
  }
  return {
    accessToken: decryptSecret(row.access_token_enc),
    webhookSecret: row.webhook_secret_enc ? decryptSecret(row.webhook_secret_enc) : null,
    publicKey: row.public_key,
  };
}

async function mpRequest(mode, method, path, { body, idempotencyKey } = {}) {
  const { accessToken } = await loadModeConfig(mode);
  let response;
  try {
    response = await fetch(`${config.mercadoPago.apiBase}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(config.mercadoPago.timeoutMs),
    });
  } catch {
    throw new AppError(502, 'MP_UNREACHABLE', 'Não foi possível comunicar com o Mercado Pago. Tente novamente.');
  }
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const detail = data?.message || data?.error || `status ${response.status}`;
    logger.warn('Erro na API do Mercado Pago', { path, status: response.status, detail: String(detail).slice(0, 200) });
    throw new AppError(502, 'MP_ERROR', `O Mercado Pago recusou a operação (${String(detail).slice(0, 120)}).`);
  }
  return data;
}

// ---------- Configuração pelo painel master ----------

export async function getMpSettingsView() {
  const [rows, active] = await Promise.all([query('SELECT * FROM payment_settings'), getActiveMode()]);
  const byMode = Object.fromEntries(rows.map((r) => [r.mode, r]));
  const modes = {};
  for (const mode of ['test', 'production']) {
    const r = byMode[mode];
    modes[mode] = {
      configured: !!r?.access_token_enc,
      accessTokenMasked: r?.access_token_enc ? maskSecret(decryptSecret(r.access_token_enc)) : null,
      publicKey: r?.public_key ?? null,
      webhookSecretMasked: r?.webhook_secret_enc ? maskSecret(decryptSecret(r.webhook_secret_enc)) : null,
      lastCheckAt: r?.last_check_at ?? null,
      lastCheckOk: r?.last_check_ok === null || r?.last_check_ok === undefined ? null : !!r.last_check_ok,
      lastCheckMessage: r?.last_check_message ?? null,
    };
  }
  return { activeMode: active, modes, webhookUrl: `${config.backendPublicUrl}/api/webhooks/mercadopago` };
}

export async function saveMpSettings(req, { mode, accessToken, publicKey, webhookSecret }) {
  await query('INSERT INTO payment_settings (mode) VALUES (?) ON DUPLICATE KEY UPDATE mode = mode', [mode]);
  const sets = ['updated_by = ?'];
  const params = [req.auth.userId];
  if (accessToken) {
    sets.push('access_token_enc = ?', 'last_check_at = NULL', 'last_check_ok = NULL', 'last_check_message = NULL');
    params.push(encryptSecret(accessToken));
  }
  if (publicKey !== undefined) {
    sets.push('public_key = ?');
    params.push(publicKey || null);
  }
  if (webhookSecret) {
    sets.push('webhook_secret_enc = ?');
    params.push(encryptSecret(webhookSecret));
  }
  await query(`UPDATE payment_settings SET ${sets.join(', ')} WHERE mode = ?`, [...params, mode]);
  await audit(req, {
    action: 'mercadopago.settings_update', entityType: 'payment_settings', entityId: mode,
    metadata: { mode, accessTokenChanged: !!accessToken, webhookSecretChanged: !!webhookSecret },
  });
  return getMpSettingsView();
}

export async function setMpMode(req, mode) {
  if (mode === 'production') await loadModeConfig('production');
  await setSettings({ mp_mode: mode }, req.auth.userId);
  await audit(req, { action: 'mercadopago.mode_change', entityType: 'payment_settings', entityId: mode, metadata: { mode } });
  return getMpSettingsView();
}

export async function testMpConnection(req, mode) {
  let ok = false;
  let message;
  try {
    const me = await mpRequest(mode, 'GET', '/users/me');
    ok = true;
    message = `Conectado como ${me?.nickname ?? me?.email ?? 'conta Mercado Pago'} (${me?.site_id ?? '—'}).`;
  } catch (err) {
    message = err.message;
  }
  await query('UPDATE payment_settings SET last_check_at = UTC_TIMESTAMP(3), last_check_ok = ?, last_check_message = ? WHERE mode = ?', [ok ? 1 : 0, message.slice(0, 300), mode]);
  await audit(req, { action: 'mercadopago.test_connection', result: ok ? 'success' : 'failure', metadata: { mode } });
  return { ok, message };
}

// ---------- Visões ----------

export function paymentView(row, { includePix = false } = {}) {
  const pendingOpen = ['pending', 'in_process'].includes(row.status);
  return {
    id: row.id,
    method: row.method,
    mode: row.mode,
    amountCents: row.amount_cents,
    currency: row.currency,
    periodMonths: row.period_months,
    status: row.status,
    statusDetail: row.status_detail,
    createdAt: row.created_at,
    paidAt: row.paid_at,
    periodFrom: row.period_from,
    periodTo: row.period_to,
    checkoutUrl: pendingOpen ? row.checkout_url : null,
    pix:
      includePix && pendingOpen && row.pix_qr_code
        ? { qrCode: row.pix_qr_code, qrCodeBase64: row.pix_qr_base64, expiresAt: row.pix_expires_at }
        : null,
  };
}

export async function listTenantPayments(tenantId) {
  const rows = await query('SELECT * FROM payments WHERE tenant_id = ? ORDER BY id DESC LIMIT 100', [tenantId]);
  return rows.map((r) => paymentView(r, { includePix: true }));
}

async function logPaymentEvent(db, paymentId, event, details) {
  await db.query('INSERT INTO payment_events (payment_id, event, details) VALUES (?, ?, ?)', [paymentId, event, details ? JSON.stringify(details) : null]);
}

// ---------- Criação de cobrança ----------

export async function createCheckout(req, tenant, user, method) {
  const settings = await getSettings();
  const view = await getSubscriptionView(tenant.id);
  if (view.status === 'suspended') throw badRequest('Assinatura suspensa. Entre em contato com o suporte.', 'SUBSCRIPTION_SUSPENDED');
  if (!view.canRenew) throw badRequest(`A renovação só é permitida quando faltarem ${view.renewalWindowDays} dias ou menos para o vencimento.`, 'RENEWAL_NOT_ALLOWED');

  const mode = await getActiveMode();
  await loadModeConfig(mode); // falha cedo se não configurado

  // Evita cobranças duplicadas: reaproveita a cobrança pendente recente do mesmo método.
  const recent = await queryOne(
    "SELECT * FROM payments WHERE tenant_id = ? AND mode = ? AND method = ? AND status IN ('pending','in_process') AND created_at > (UTC_TIMESTAMP(3) - INTERVAL 30 MINUTE) ORDER BY id DESC LIMIT 1",
    [tenant.id, mode, method],
  );
  if (recent && (recent.checkout_url || recent.pix_qr_code)) return paymentView(recent, { includePix: true });

  const sub = await queryOne('SELECT id FROM subscriptions WHERE tenant_id = ?', [tenant.id]);
  const reference = uuid();
  const amount = settings.price_cents;
  const months = settings.subscription_months;
  const insert = await query(
    "INSERT INTO payments (tenant_id, subscription_id, mode, external_reference, method, amount_cents, period_months, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')",
    [tenant.id, sub.id, mode, reference, method, amount, months],
  );
  const paymentId = insert.insertId;
  await logPaymentEvent({ query }, paymentId, 'created', { method, amountCents: amount, mode });

  const notificationUrl = config.backendPublicUrl.startsWith('https://') ? `${config.backendPublicUrl}/api/webhooks/mercadopago` : undefined;
  const title = `Assinatura anual ${settings.product_name} (${months} meses)`;

  try {
    if (method === 'pix') {
      const expires = new Date(Date.now() + 30 * 60_000);
      const data = await mpRequest(mode, 'POST', '/v1/payments', {
        idempotencyKey: reference,
        body: {
          transaction_amount: amount / 100,
          description: title,
          payment_method_id: 'pix',
          external_reference: reference,
          payer: { email: user.email },
          date_of_expiration: expires.toISOString().replace('Z', '-00:00'),
          ...(notificationUrl ? { notification_url: notificationUrl } : {}),
        },
      });
      const tx = data?.point_of_interaction?.transaction_data ?? {};
      await query(
        'UPDATE payments SET mp_payment_id = ?, status = ?, status_detail = ?, pix_qr_code = ?, pix_qr_base64 = ?, pix_expires_at = ?, checkout_url = ? WHERE id = ?',
        [String(data.id), STATUS_MAP[data.status] ?? 'pending', data.status_detail ?? null, tx.qr_code ?? null, tx.qr_code_base64 ?? null, expires, tx.ticket_url ?? null, paymentId],
      );
    } else {
      const data = await mpRequest(mode, 'POST', '/checkout/preferences', {
        body: {
          items: [{ id: `plan-${months}m`, title, quantity: 1, unit_price: amount / 100, currency_id: 'BRL' }],
          external_reference: reference,
          payer: { email: user.email },
          back_urls: {
            success: `${config.appUrl}/painel/pagamentos?retorno=sucesso`,
            pending: `${config.appUrl}/painel/pagamentos?retorno=pendente`,
            failure: `${config.appUrl}/painel/pagamentos?retorno=falha`,
          },
          ...(config.appUrl.startsWith('https://') ? { auto_return: 'approved' } : {}),
          ...(notificationUrl ? { notification_url: notificationUrl } : {}),
          metadata: { tenant_id: tenant.id, payment_id: paymentId },
        },
      });
      const url = mode === 'production' ? data.init_point : data.sandbox_init_point || data.init_point;
      await query('UPDATE payments SET mp_preference_id = ?, checkout_url = ? WHERE id = ?', [data.id, url, paymentId]);
    }
  } catch (err) {
    await query("UPDATE payments SET status = 'rejected', status_detail = 'gateway_error' WHERE id = ?", [paymentId]);
    await logPaymentEvent({ query }, paymentId, 'gateway_error', { code: err.code });
    await audit(req, { action: 'payment.create', result: 'failure', entityType: 'payment', entityId: paymentId, metadata: { method, code: err.code } });
    throw err;
  }
  await audit(req, { action: 'payment.create', entityType: 'payment', entityId: paymentId, metadata: { method, mode, amountCents: amount } });
  return paymentView(await queryOne('SELECT * FROM payments WHERE id = ?', [paymentId]), { includePix: true });
}

// ---------- Aplicação do pagamento (idempotente) ----------

/**
 * Sincroniza o pagamento com o estado REAL consultado no Mercado Pago. A assinatura só é estendida aqui,
 * dentro de transação, com a linha do pagamento bloqueada (FOR UPDATE) e a marca applied_at como trava.
 */
export async function syncFromGateway(mode, mpPaymentId, { source = 'webhook' } = {}) {
  const remote = await mpRequest(mode, 'GET', `/v1/payments/${encodeURIComponent(mpPaymentId)}`);
  const reference = remote?.external_reference;
  if (!reference) return { outcome: 'ignored', reason: 'sem external_reference' };
  const local = await queryOne('SELECT id FROM payments WHERE external_reference = ? AND mode = ?', [reference, mode]);
  if (!local) return { outcome: 'ignored', reason: 'pagamento desconhecido' };

  const status = STATUS_MAP[remote.status] ?? 'pending';
  const remoteCents = Math.round(Number(remote.transaction_amount) * 100);

  return withTransaction(async (tx) => {
    const payment = await tx.queryOne('SELECT * FROM payments WHERE id = ? FOR UPDATE', [local.id]);
    if (remote.currency_id && remote.currency_id !== payment.currency) {
      await logPaymentEvent(tx, payment.id, 'currency_mismatch', { remote: remote.currency_id });
      return { outcome: 'rejected', reason: 'moeda divergente', paymentId: payment.id };
    }
    if (status === 'approved' && remoteCents !== payment.amount_cents) {
      await logPaymentEvent(tx, payment.id, 'amount_mismatch', { expected: payment.amount_cents, received: remoteCents });
      return { outcome: 'rejected', reason: 'valor divergente', paymentId: payment.id };
    }
    // Um mesmo pagamento do gateway não pode estar vinculado a duas cobranças.
    try {
      await tx.query('UPDATE payments SET mp_payment_id = ? WHERE id = ? AND (mp_payment_id IS NULL OR mp_payment_id = ?)', [String(remote.id), payment.id, String(remote.id)]);
    } catch (err) {
      if (!isDuplicateError(err)) throw err;
      return { outcome: 'ignored', reason: 'pagamento já vinculado', paymentId: payment.id };
    }

    const changed = payment.status !== status;
    await tx.query('UPDATE payments SET status = ?, status_detail = ?, paid_at = COALESCE(paid_at, ?) WHERE id = ?', [
      status,
      remote.status_detail ?? null,
      status === 'approved' ? new Date(remote.date_approved ?? Date.now()) : null,
      payment.id,
    ]);
    if (changed) await logPaymentEvent(tx, payment.id, `status:${status}`, { source, previous: payment.status, remote: remote.status });

    if (status !== 'approved') {
      if (['refunded', 'charged_back'].includes(status) && payment.applied_at) {
        await logPaymentEvent(tx, payment.id, 'requires_manual_review', { status });
      }
      return { outcome: 'updated', status, paymentId: payment.id };
    }
    if (payment.applied_at) return { outcome: 'already_applied', paymentId: payment.id };

    const sub = await tx.queryOne('SELECT * FROM subscriptions WHERE id = ? FOR UPDATE', [payment.subscription_id]);
    const now = new Date();
    const currentEnd = sub.current_period_end ? new Date(sub.current_period_end) : null;
    const prolongs = sub.status === 'active' && currentEnd && currentEnd > now;
    const base = prolongs ? currentEnd : now;
    const newEnd = addMonthsUtc(base, payment.period_months);
    await tx.query('UPDATE subscriptions SET status = ?, current_period_start = ?, current_period_end = ?, price_cents = ? WHERE id = ?', [
      sub.status === 'suspended' ? 'suspended' : 'active',
      prolongs ? sub.current_period_start : now,
      newEnd,
      payment.amount_cents,
      sub.id,
    ]);
    await tx.query('UPDATE payments SET applied_at = ?, period_from = ?, period_to = ? WHERE id = ?', [now, base, newEnd, payment.id]);
    await logPaymentEvent(tx, payment.id, 'subscription_extended', { from: toIso(base), to: toIso(newEnd), early: prolongs });
    const owner = await tx.queryOne('SELECT owner_user_id FROM tenants WHERE id = ?', [payment.tenant_id]);
    try {
      await tx.query('INSERT INTO notifications (user_id, tenant_id, kind, dedupe_key, title, body) VALUES (?, ?, ?, ?, ?, ?)', [
        owner.owner_user_id, payment.tenant_id, 'payment_approved', `payment:${payment.id}`, 'Pagamento confirmado',
        `Sua assinatura está ativa até ${newEnd.toLocaleDateString('pt-BR', { timeZone: 'UTC' })}.`,
      ]);
    } catch (err) {
      if (!isDuplicateError(err)) throw err;
    }
    return { outcome: 'applied', paymentId: payment.id, periodTo: newEnd };
  });
}

/** Consulta sob demanda do assinante (útil quando o webhook não alcança o ambiente, como em localhost). */
export async function syncTenantPayment(req, tenantId, paymentId) {
  const payment = await queryOne('SELECT * FROM payments WHERE id = ? AND tenant_id = ?', [paymentId, tenantId]);
  if (!payment) throw notFound('Pagamento não encontrado.');
  let mpId = payment.mp_payment_id;
  if (!mpId) {
    const search = await mpRequest(payment.mode, 'GET', `/v1/payments/search?external_reference=${encodeURIComponent(payment.external_reference)}&sort=date_created&criteria=desc&limit=1`);
    mpId = search?.results?.[0]?.id ? String(search.results[0].id) : null;
  }
  if (!mpId) return { outcome: 'waiting', payment: paymentView(payment, { includePix: true }) };
  const result = await syncFromGateway(payment.mode, mpId, { source: 'manual_sync' });
  await audit(req, { action: 'payment.sync', entityType: 'payment', entityId: paymentId, tenantId, metadata: { outcome: result.outcome } });
  return { outcome: result.outcome, payment: paymentView(await queryOne('SELECT * FROM payments WHERE id = ?', [paymentId]), { includePix: true }) };
}

export async function syncAnyPayment(req, paymentId) {
  const payment = await queryOne('SELECT * FROM payments WHERE id = ?', [paymentId]);
  if (!payment) throw notFound('Pagamento não encontrado.');
  return syncTenantPayment(req, payment.tenant_id, paymentId);
}

// ---------- Webhook ----------

export function verifyMpSignature({ secret, signatureHeader, requestId, dataId }) {
  if (!secret || !signatureHeader || !dataId) return false;
  const parts = Object.fromEntries(
    String(signatureHeader).split(',').map((p) => {
      const [k, ...v] = p.trim().split('=');
      return [k, v.join('=')];
    }),
  );
  if (!parts.ts || !parts.v1) return false;
  const id = /^[a-z0-9]+$/i.test(String(dataId)) ? String(dataId).toLowerCase() : String(dataId);
  const manifest = `id:${id};request-id:${requestId ?? ''};ts:${parts.ts};`;
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  return timingSafeEqualStr(expected, parts.v1);
}

export async function handleMpWebhook(req) {
  const body = req.body ?? {};
  const dataId = String(req.query['data.id'] ?? req.query?.data?.id ?? body?.data?.id ?? '');
  const topic = String(req.query.type ?? req.query.topic ?? body.type ?? body.topic ?? '');
  const requestId = req.get('x-request-id') ?? '';
  const signatureHeader = req.get('x-signature') ?? '';
  const hinted = body.live_mode === true ? 'production' : body.live_mode === false ? 'test' : await getActiveMode();

  // O modo só é considerado confiável depois que a assinatura é validada com o segredo daquele modo.
  const modes = [hinted, hinted === 'test' ? 'production' : 'test'];
  let mode = null;
  for (const candidate of modes) {
    const row = await queryOne('SELECT webhook_secret_enc FROM payment_settings WHERE mode = ?', [candidate]);
    if (!row?.webhook_secret_enc) continue;
    if (verifyMpSignature({ secret: decryptSecret(row.webhook_secret_enc), signatureHeader, requestId, dataId })) {
      mode = candidate;
      break;
    }
  }

  const payload = JSON.stringify({ query: req.query, body: { action: body.action, type: body.type, live_mode: body.live_mode, data: body.data } }).slice(0, 4000);
  if (!mode) {
    const key = `invalid:${sha256(`${signatureHeader}|${requestId}|${dataId}|${Date.now() / 60000 | 0}`)}`;
    await query(
      "INSERT IGNORE INTO payment_webhook_events (mode, event_key, topic, resource_id, request_id, signature_valid, payload, status, error_message) VALUES (?, ?, ?, ?, ?, 0, ?, 'invalid_signature', ?)",
      [hinted, key, topic.slice(0, 60), dataId.slice(0, 60), requestId.slice(0, 80), payload, 'Assinatura inválida ou segredo não configurado.'],
    );
    return { status: 401, body: { ok: false } };
  }

  const eventKey = `${topic}:${dataId}:${requestId}`.slice(0, 190);
  let eventId;
  try {
    const ins = await query(
      "INSERT INTO payment_webhook_events (mode, event_key, topic, resource_id, request_id, signature_valid, payload, status) VALUES (?, ?, ?, ?, ?, 1, ?, 'received')",
      [mode, eventKey, topic.slice(0, 60), dataId.slice(0, 60), requestId.slice(0, 80), payload],
    );
    eventId = ins.insertId;
  } catch (err) {
    if (!isDuplicateError(err)) throw err;
    const existing = await queryOne("SELECT id, status FROM payment_webhook_events WHERE provider = 'mercadopago' AND mode = ? AND event_key = ?", [mode, eventKey]);
    if (existing.status !== 'failed') return { status: 200, body: { ok: true, duplicate: true } };
    await query('UPDATE payment_webhook_events SET attempts = attempts + 1, status = ? WHERE id = ?', ['received', existing.id]);
    eventId = existing.id;
  }

  if (topic !== 'payment' || !dataId) {
    await query("UPDATE payment_webhook_events SET status = 'ignored', processed_at = UTC_TIMESTAMP(3) WHERE id = ?", [eventId]);
    return { status: 200, body: { ok: true, ignored: true } };
  }

  try {
    const result = await syncFromGateway(mode, dataId, { source: 'webhook' });
    await query('UPDATE payment_webhook_events SET status = ?, error_message = ?, processed_at = UTC_TIMESTAMP(3) WHERE id = ?', [
      ['ignored', 'rejected'].includes(result.outcome) ? 'ignored' : 'processed',
      result.reason ?? null,
      eventId,
    ]);
    return { status: 200, body: { ok: true, outcome: result.outcome } };
  } catch (err) {
    await query("UPDATE payment_webhook_events SET status = 'failed', error_message = ? WHERE id = ?", [String(err.message).slice(0, 500), eventId]);
    // 5xx faz o Mercado Pago reenviar a notificação.
    return { status: 500, body: { ok: false } };
  }
}

// ---------- Consultas do painel master ----------

export async function listWebhookEvents({ offset, size, status }) {
  const where = status ? 'WHERE status = ?' : '';
  const params = status ? [status] : [];
  const [rows, total] = await Promise.all([
    query(`SELECT id, mode, topic, resource_id, request_id, signature_valid, status, error_message, attempts, received_at, processed_at FROM payment_webhook_events ${where} ORDER BY id DESC LIMIT ? OFFSET ?`, [...params, size, offset]),
    queryOne(`SELECT COUNT(*) AS n FROM payment_webhook_events ${where}`, params),
  ]);
  return { items: rows, total: Number(total.n) };
}

export async function listAllPayments({ offset, size, status, tenantId }) {
  const conds = [];
  const params = [];
  if (status) { conds.push('p.status = ?'); params.push(status); }
  if (tenantId) { conds.push('p.tenant_id = ?'); params.push(tenantId); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const [rows, total] = await Promise.all([
    query(
      `SELECT p.*, t.slug, b.display_name FROM payments p JOIN tenants t ON t.id = p.tenant_id JOIN tenant_branding b ON b.tenant_id = t.id ${where} ORDER BY p.id DESC LIMIT ? OFFSET ?`,
      [...params, size, offset],
    ),
    queryOne(`SELECT COUNT(*) AS n FROM payments p ${where}`, params),
  ]);
  return { items: rows.map((r) => ({ ...paymentView(r), tenantId: r.tenant_id, slug: r.slug, brand: r.display_name, mpPaymentId: r.mp_payment_id })), total: Number(total.n) };
}

export async function listPaymentEvents(paymentId) {
  const rows = await query('SELECT event, details, created_at FROM payment_events WHERE payment_id = ? ORDER BY id', [paymentId]);
  return rows.map((r) => ({ event: r.event, details: parseJson(r.details), at: r.created_at }));
}
