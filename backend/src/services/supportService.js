import { query, queryOne } from '../config/db.js';
import { conflict } from '../utils/errors.js';
import { audit } from './auditService.js';

export async function createSupportRequest(req, tenant, userId, { subject, message }) {
  const open = await queryOne("SELECT COUNT(*) AS n FROM support_requests WHERE tenant_id = ? AND status = 'open'", [tenant.id]);
  if (Number(open.n) >= 10) throw conflict('Você já possui muitas solicitações em aberto. Aguarde o retorno do suporte.', 'SUPPORT_LIMIT');
  const r = await query('INSERT INTO support_requests (tenant_id, user_id, subject, message) VALUES (?, ?, ?, ?)', [tenant.id, userId, subject, message]);
  await audit(req, { action: 'support.create', entityType: 'support_request', entityId: r.insertId, tenantId: tenant.id });
  return { id: r.insertId };
}

export async function listOwnSupportRequests(tenantId) {
  const rows = await query('SELECT id, subject, message, status, created_at FROM support_requests WHERE tenant_id = ? ORDER BY id DESC LIMIT 50', [tenantId]);
  return rows.map((r) => ({ id: r.id, subject: r.subject, message: r.message, status: r.status, createdAt: r.created_at }));
}

export async function createPrivacyRequest(req, tenant, userId, { requestType, notes }) {
  const r = await query("INSERT INTO privacy_requests (subject_type, subject_id, tenant_id, request_type, notes) VALUES ('user', ?, ?, ?, ?)", [userId, tenant.id, requestType, notes || null]);
  await audit(req, { action: 'privacy.request', entityType: 'privacy_request', entityId: r.insertId, tenantId: tenant.id, metadata: { requestType } });
  return { id: r.insertId };
}

export async function listNotifications(userId) {
  const rows = await query('SELECT id, kind, title, body, read_at, created_at FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50', [userId]);
  return rows.map((n) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, read: !!n.read_at, at: n.created_at }));
}

export async function markNotificationsRead(userId) {
  await query('UPDATE notifications SET read_at = UTC_TIMESTAMP(3) WHERE user_id = ? AND read_at IS NULL', [userId]);
}
