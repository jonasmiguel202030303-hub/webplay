import bcrypt from 'bcryptjs';
import { config } from '../config/env.js';
import { query, queryOne, withTransaction, isDuplicateError } from '../config/db.js';
import { badRequest, conflict, forbidden, unauthorized, tooMany } from '../utils/errors.js';
import { normalizeEmail } from '../utils/email.js';
import { hashIp } from '../utils/crypto.js';
import { clientIp, HOUR_MS } from '../utils/time.js';
import { createOneTimeToken, consumeOneTimeToken } from './tokenService.js';
import { sendMail } from './mailService.js';
import { audit } from './auditService.js';
import { getCurrentTerms } from './settingsService.js';
import { startTrial } from './subscriptionService.js';
import { welcomeEmailTemplate, passwordResetEmailTemplate } from '../utils/emailTemplates.js';
import { logger } from '../config/logger.js';

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
// Hash válido usado para igualar o tempo de resposta quando o e-mail não existe.
const DUMMY_HASH = bcrypt.hashSync('webplay-dummy-password', 4);

export const hashPassword = (plain) => bcrypt.hash(plain, config.bcryptCost);

export async function recordTermsAcceptance(db, { userId = null, viewerId = null, req }) {
  const docs = await Promise.all(['terms', 'privacy', 'legal'].map(getCurrentTerms));
  for (const doc of docs.filter(Boolean)) {
    await db.query('INSERT INTO terms_acceptances (terms_version_id, user_id, viewer_id, ip_hash, user_agent) VALUES (?, ?, ?, ?, ?)', [
      doc.id,
      userId,
      viewerId,
      hashIp(clientIp(req)),
      (req.get('user-agent') || '').slice(0, 255),
    ]);
  }
}

export async function register(req, data) {
  const emailNormalized = normalizeEmail(data.email);
  const existing = await queryOne('SELECT id FROM users WHERE email_normalized = ? LIMIT 1', [emailNormalized]);
  if (existing) throw conflict('Este e-mail já possui cadastro. Entre ou recupere a senha.', 'EMAIL_TAKEN');
  const slugTaken = await queryOne('SELECT id FROM tenants WHERE slug = ? LIMIT 1', [data.slug]);
  if (slugTaken) throw conflict('Este endereço já está em uso. Escolha outro.', 'SLUG_TAKEN');

  const passwordHash = await hashPassword(data.password);
  let userId;
  try {
    ({ userId } = await withTransaction(async (tx) => {
      const u = await tx.query(
        "INSERT INTO users (name, email, email_normalized, password_hash, role, status) VALUES (?, ?, ?, ?, 'tenant_owner', 'active')",
        [data.name, data.email, emailNormalized, passwordHash],
      );
      const t = await tx.query('INSERT INTO tenants (owner_user_id, slug) VALUES (?, ?)', [u.insertId, data.slug]);
      await tx.query('INSERT INTO tenant_branding (tenant_id, display_name, short_name) VALUES (?, ?, ?)', [
        t.insertId,
        data.brandName,
        data.brandName.slice(0, 20),
      ]);
      await tx.query('INSERT INTO tenant_settings (tenant_id) VALUES (?)', [t.insertId]);
      await recordTermsAcceptance(tx, { userId: u.insertId, req });
      await startTrial(tx, { tenantId: t.insertId, userId: u.insertId, emailNormalized, ipHash: hashIp(clientIp(req)) });
      return { userId: u.insertId };
    }));
  } catch (err) {
    if (isDuplicateError(err)) {
      throw conflict('E-mail ou endereço já cadastrado.', 'DUPLICATE');
    }
    throw err;
  }

  await audit(req, { action: 'auth.register', entityType: 'user', entityId: userId, actor: { userId, role: 'tenant_owner' }, metadata: { slug: data.slug } });
  const welcome = welcomeEmailTemplate({ name: data.name, email: data.email, brandName: data.brandName });
  sendMail({ to: data.email, subject: welcome.subject, text: welcome.text, html: welcome.html }).catch((err) => logger.error('Falha ao enviar e-mail de boas-vindas', { error: err }));
  return { userId };
}

/** Contas criadas quando a ativação por e-mail ainda existia entram direto: ativa e inicia o teste no primeiro login. */
async function activatePending(req, user) {
  await withTransaction(async (tx) => {
    await tx.query("UPDATE users SET status = 'active' WHERE id = ? AND status = 'pending_activation'", [user.id]);
    const tenant = await tx.queryOne('SELECT id FROM tenants WHERE owner_user_id = ?', [user.id]);
    if (tenant) {
      await startTrial(tx, { tenantId: tenant.id, userId: user.id, emailNormalized: user.email_normalized, ipHash: hashIp(clientIp(req)) });
    }
  });
}

export async function activate(req, token) {
  const result = await withTransaction(async (tx) => {
    const row = await consumeOneTimeToken(token, 'activation', tx);
    if (!row) throw badRequest('Link de ativação inválido ou expirado.', 'INVALID_TOKEN');
    const user = await tx.queryOne('SELECT * FROM users WHERE id = ? FOR UPDATE', [row.user_id]);
    if (!user || user.deleted_at) throw badRequest('Conta não encontrada.', 'INVALID_TOKEN');
    await tx.query("UPDATE users SET status = IF(status = 'suspended', status, 'active'), email_verified_at = COALESCE(email_verified_at, UTC_TIMESTAMP(3)) WHERE id = ?", [user.id]);
    const tenant = await tx.queryOne('SELECT id FROM tenants WHERE owner_user_id = ?', [user.id]);
    let trial = { granted: false };
    if (tenant) {
      trial = await startTrial(tx, { tenantId: tenant.id, userId: user.id, emailNormalized: user.email_normalized, ipHash: hashIp(clientIp(req)) });
    }
    return { user, trial };
  });
  await audit(req, {
    action: 'auth.activate',
    entityType: 'user',
    entityId: result.user.id,
    actor: { userId: result.user.id, role: result.user.role },
    metadata: { trialGranted: result.trial.granted, reason: result.trial.reason },
  });
  return { email: result.user.email, trialGranted: result.trial.granted, trialEndsAt: result.trial.endsAt?.toISOString() ?? null };
}

export async function resendActivation(req, email) {
  const user = await queryOne("SELECT * FROM users WHERE email_normalized = ? AND status = 'pending_activation' AND deleted_at IS NULL", [normalizeEmail(email)]);
  if (!user) return { devActivationUrl: undefined };
  const token = await createOneTimeToken({ userId: user.id, purpose: 'activation', ttlMs: 48 * HOUR_MS });
  const link = `${config.appUrl}/ativar?token=${token}`;
  await sendMail({ to: user.email, subject: 'Ative sua conta WebPlay Brasil', text: `Para ativar sua conta, acesse:\n${link}\n\nO link vale por 48 horas.` });
  return config.isProd ? {} : { devActivationUrl: link };
}

/** Verifica senha com controle de bloqueio temporário. Compartilhado entre staff e espectadores. */
export async function verifyCredentials({ table, row, password, req, auditAction }) {
  const now = new Date();
  if (row?.locked_until && new Date(row.locked_until) > now) {
    throw tooMany('Conta temporariamente bloqueada por tentativas inválidas. Tente novamente em alguns minutos.', 'ACCOUNT_LOCKED');
  }
  const ok = await bcrypt.compare(password, row?.password_hash ?? DUMMY_HASH);
  if (!row || !ok) {
    if (row) {
      const failed = row.failed_logins + 1;
      const lock = failed >= MAX_FAILED ? new Date(now.getTime() + LOCK_MINUTES * 60_000) : null;
      await query(`UPDATE ${table} SET failed_logins = ?, locked_until = ? WHERE id = ?`, [lock ? 0 : failed, lock, row.id]);
    }
    await audit(req, { action: auditAction, result: 'failure', entityType: table, entityId: row?.id ?? null, actor: row ? { userId: table === 'users' ? row.id : null, role: row.role } : null });
    throw unauthorized('E-mail ou senha incorretos.', 'INVALID_CREDENTIALS');
  }
  await query(`UPDATE ${table} SET failed_logins = 0, locked_until = NULL, last_login_at = UTC_TIMESTAMP(3) WHERE id = ?`, [row.id]);
}

export async function login(req, { email, password }) {
  const user = await queryOne('SELECT * FROM users WHERE email_normalized = ? AND deleted_at IS NULL LIMIT 1', [normalizeEmail(email)]);
  await verifyCredentials({ table: 'users', row: user, password, req, auditAction: 'auth.login' });
  if (user.status === 'pending_activation') await activatePending(req, user);
  if (user.status === 'suspended') throw forbidden('Conta suspensa. Entre em contato com o suporte.', 'ACCOUNT_SUSPENDED');
  await audit(req, { action: 'auth.login', entityType: 'user', entityId: user.id, actor: { userId: user.id, role: user.role } });
  return user;
}

export async function forgotPassword(req, email) {
  const user = await queryOne("SELECT * FROM users WHERE email_normalized = ? AND status = 'active' AND deleted_at IS NULL", [normalizeEmail(email)]);
  if (!user) return {};
  const token = await createOneTimeToken({ userId: user.id, purpose: 'reset', ttlMs: HOUR_MS });
  const link = `${config.appUrl}/redefinir-senha?token=${token}`;
  const reset = passwordResetEmailTemplate({ name: user.name, link, expiresInText: '1 hora' });
  await sendMail({ to: user.email, subject: reset.subject, text: reset.text, html: reset.html });
  await audit(req, { action: 'auth.forgot_password', entityType: 'user', entityId: user.id, actor: { userId: user.id, role: user.role } });
  return config.isProd ? {} : { devResetUrl: link };
}

export async function resetPassword(req, { token, password }) {
  const passwordHash = await hashPassword(password);
  const userId = await withTransaction(async (tx) => {
    const row = await consumeOneTimeToken(token, 'reset', tx);
    if (!row || !row.user_id) throw badRequest('Link inválido ou expirado. Solicite um novo.', 'INVALID_TOKEN');
    await tx.query('UPDATE users SET password_hash = ?, token_version = token_version + 1, failed_logins = 0, locked_until = NULL WHERE id = ?', [passwordHash, row.user_id]);
    return row.user_id;
  });
  await audit(req, { action: 'auth.reset_password', entityType: 'user', entityId: userId, actor: { userId, role: null } });
}

export async function changePassword(req, userId, { currentPassword, newPassword }) {
  const user = await queryOne('SELECT * FROM users WHERE id = ?', [userId]);
  if (!(await bcrypt.compare(currentPassword, user.password_hash))) throw badRequest('Senha atual incorreta.', 'INVALID_CREDENTIALS');
  const hash = await hashPassword(newPassword);
  await query('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?', [hash, userId]);
  await audit(req, { action: 'auth.change_password', entityType: 'user', entityId: userId });
  return queryOne('SELECT * FROM users WHERE id = ?', [userId]);
}
