import { query } from '../config/db.js';
import { logger } from '../config/logger.js';
import { runExpiryJob } from '../services/subscriptionService.js';

const timers = [];

async function safely(name, fn) {
  try {
    const result = await fn();
    if (result) logger.debug(`Job ${name}`, { result });
  } catch (err) {
    logger.error(`Falha no job ${name}`, { error: err });
  }
}

/** Retenção de dados técnicos (LGPD/minimização) e fechamento de cobranças antigas. */
export async function runRetentionJob() {
  const out = {};
  out.tokens = (await query('DELETE FROM password_reset_tokens WHERE expires_at < (UTC_TIMESTAMP(3) - INTERVAL 7 DAY)')).affectedRows;
  out.sessions = (await query('DELETE FROM viewer_sessions WHERE expires_at < (UTC_TIMESTAMP(3) - INTERVAL 30 DAY) OR revoked_at < (UTC_TIMESTAMP(3) - INTERVAL 30 DAY)')).affectedRows;
  out.outbox = (await query('DELETE FROM email_outbox WHERE created_at < (UTC_TIMESTAMP(3) - INTERVAL 30 DAY)')).affectedRows;
  out.webhookInvalid = (await query("DELETE FROM payment_webhook_events WHERE status = 'invalid_signature' AND received_at < (UTC_TIMESTAMP(3) - INTERVAL 30 DAY)")).affectedRows;
  out.webhookPayloads = (await query('UPDATE payment_webhook_events SET payload = NULL WHERE payload IS NOT NULL AND received_at < (UTC_TIMESTAMP(3) - INTERVAL 90 DAY)')).affectedRows;
  // Cobranças que nunca foram pagas deixam de contar como "pagamento pendente" após 3 dias.
  out.expiredPayments = (
    await query("UPDATE payments SET status = 'expired', status_detail = 'not_paid' WHERE status IN ('pending','in_process') AND created_at < (UTC_TIMESTAMP(3) - INTERVAL 3 DAY)")
  ).affectedRows;
  return out;
}

export function startJobs() {
  timers.push(setInterval(() => safely('expiracao', () => runExpiryJob()), 60_000));
  timers.push(setInterval(() => safely('retencao', runRetentionJob), 6 * 3600_000));
  safely('expiracao', () => runExpiryJob());
  safely('retencao', runRetentionJob);
  for (const t of timers) t.unref();
}

export function stopJobs() {
  for (const t of timers.splice(0)) clearInterval(t);
}
