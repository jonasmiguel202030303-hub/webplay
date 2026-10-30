import { query } from '../config/db.js';
import { redact } from '../utils/logger.js';
import { clientIp } from '../utils/time.js';
import { logger } from '../config/logger.js';

/**
 * Registra auditoria. Nunca lança: falha de auditoria não deve derrubar a operação principal,
 * mas é registrada no log. Metadados passam por redação de segredos.
 */
export async function audit(req, entry) {
  try {
    const actor = entry.actor ?? req?.auth ?? null;
    await query(
      `INSERT INTO audit_logs (actor_user_id, actor_role, tenant_id, action, entity_type, entity_id, result, reason, metadata, ip, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        actor?.userId ?? null,
        actor?.role ?? null,
        entry.tenantId ?? req?.tenant?.id ?? null,
        entry.action,
        entry.entityType ?? null,
        entry.entityId != null ? String(entry.entityId) : null,
        entry.result ?? 'success',
        entry.reason ? String(entry.reason).slice(0, 1000) : null,
        entry.metadata ? JSON.stringify(redact(entry.metadata)) : null,
        req ? clientIp(req) : null,
        req?.get ? (req.get('user-agent') || '').slice(0, 255) : null,
      ],
    );
  } catch (err) {
    logger.error('Falha ao gravar auditoria', { action: entry.action, error: err });
  }
}
