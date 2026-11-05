import bcrypt from 'bcryptjs';
import { config } from '../config/env.js';
import { query, queryOne, withTransaction, isDuplicateError } from '../config/db.js';
import { badRequest, conflict, forbidden, notFound, unauthorized } from '../utils/errors.js';
import { normalizeEmail } from '../utils/email.js';
import { randomToken, uuid, encryptSecret, decryptSecret, timingSafeEqualStr } from '../utils/crypto.js';
import { HOUR_MS } from '../utils/time.js';
import { signViewerToken, viewerCookieMaxAge } from '../utils/tokens.js';
import { createOneTimeToken, consumeOneTimeToken } from './tokenService.js';
import { sendMail } from './mailService.js';
import { audit } from './auditService.js';
import { hashPassword, recordTermsAcceptance, verifyCredentials } from './authService.js';
import { getTenantSettingsRow } from './tenantService.js';
import { checkLine, listServerRows, toAppError } from './sourceService.js';
import { passwordResetEmailTemplate } from '../utils/emailTemplates.js';

// ---------- Visões ----------

const viewerView = (v) => ({ id: v.id, name: v.name, email: v.email, adultControlEnabled: !!v.adult_control_enabled });

export const profileView = (p) => ({ id: p.id, name: p.name, avatar: p.avatar, isKids: !!p.is_kids });

const contentView = (r) => ({
  serverId: r.server_id,
  contentType: r.content_type,
  streamId: r.stream_id,
  name: r.name,
  icon: r.icon,
});

// ---------- Cadastro, sessão e senha ----------

export async function registerViewer(req, tenant, data) {
  const settings = await getTenantSettingsRow(tenant.id);
  if (!settings.allow_viewer_signup) throw forbidden('O cadastro de novos espectadores está desativado nesta página.', 'SIGNUP_DISABLED');
  const total = await queryOne('SELECT COUNT(*) AS n FROM viewer_accounts WHERE tenant_id = ? AND deleted_at IS NULL', [tenant.id]);
  if (Number(total.n) >= settings.max_viewers) throw conflict('O limite de espectadores desta página foi atingido.', 'VIEWER_LIMIT');

  const emailNormalized = normalizeEmail(data.email);
  const passwordHash = await hashPassword(data.password);
  try {
    const viewerId = await withTransaction(async (tx) => {
      const v = await tx.query('INSERT INTO viewer_accounts (tenant_id, name, email, email_normalized, password_hash) VALUES (?, ?, ?, ?, ?)', [
        tenant.id, data.name, data.email, emailNormalized, passwordHash,
      ]);
      await tx.query('INSERT INTO viewer_profiles (tenant_id, viewer_id, name, avatar) VALUES (?, ?, ?, ?)', [
        tenant.id, v.insertId, data.name.split(' ')[0].slice(0, 40), 'violet',
      ]);
      await recordTermsAcceptance(tx, { viewerId: v.insertId, req });
      return v.insertId;
    });
    await audit(req, { action: 'viewer.register', entityType: 'viewer', entityId: viewerId, tenantId: tenant.id });
    return viewerId;
  } catch (err) {
    if (isDuplicateError(err)) throw conflict('Este e-mail já possui cadastro nesta página. Entre ou recupere a senha.', 'EMAIL_TAKEN');
    throw err;
  }
}

export async function loginViewer(req, tenant, { email, password }) {
  const viewer = await queryOne('SELECT * FROM viewer_accounts WHERE tenant_id = ? AND email_normalized = ? AND deleted_at IS NULL', [tenant.id, normalizeEmail(email)]);
  await verifyCredentials({ table: 'viewer_accounts', row: viewer, password, req, auditAction: 'viewer.login' });
  if (viewer.status === 'suspended') throw forbidden('Seu acesso foi suspenso. Fale com o responsável por esta página.', 'VIEWER_SUSPENDED');
  return startViewerSession(req, tenant, viewer);
}

async function startViewerSession(req, tenant, viewer) {
  const settings = await getTenantSettingsRow(tenant.id);
  const jti = uuid();
  const maxAge = viewerCookieMaxAge();
  await withTransaction(async (tx) => {
    const active = await tx.query(
      'SELECT id FROM viewer_sessions WHERE viewer_id = ? AND revoked_at IS NULL AND expires_at > UTC_TIMESTAMP(3) ORDER BY last_seen_at ASC FOR UPDATE',
      [viewer.id],
    );
    const excess = active.length - settings.max_sessions_per_viewer + 1;
    if (excess > 0) {
      const ids = active.slice(0, excess).map((s) => s.id);
      await tx.query(`UPDATE viewer_sessions SET revoked_at = UTC_TIMESTAMP(3) WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
    }
    await tx.query('INSERT INTO viewer_sessions (tenant_id, viewer_id, jti, user_agent, expires_at) VALUES (?, ?, ?, ?, ?)', [
      tenant.id, viewer.id, jti, (req.get('user-agent') || '').slice(0, 255), new Date(Date.now() + maxAge),
    ]);
  });
  await audit(req, { action: 'viewer.login', entityType: 'viewer', entityId: viewer.id, tenantId: tenant.id });
  const token = signViewerToken({ viewerId: viewer.id, tenantId: tenant.id, tokenVersion: viewer.token_version, jti });
  return { token, viewer: viewerView(viewer) };
}

// ---------- Login pela linha Xtream (usuário/senha do próprio cliente) ----------

const fmtDate = (iso) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

export const accountView = (info, checkedAt) =>
  info
    ? {
        status: info.status ?? '',
        active: info.active !== false,
        expiresAt: info.expiresAt ?? null,
        isTrial: !!info.isTrial,
        maxConnections: info.maxConnections ?? null,
        activeConnections: info.activeConnections ?? null,
        checkedAt: checkedAt ? new Date(checkedAt).toISOString() : null,
      }
    : null;

/** Bloqueia o uso quando a linha está desativada ou vencida (a data é conferida a cada chamada, sem ir ao servidor). */
export function assertLineUsable(account) {
  if (!account) return;
  if (account.active === false) throw forbidden(`Sua linha está ${account.status ? `"${account.status}"` : 'desativada'}. Fale com o seu fornecedor.`, 'LINE_INACTIVE');
  if (account.expiresAt && new Date(account.expiresAt) <= new Date()) {
    throw forbidden(`Sua assinatura venceu em ${fmtDate(account.expiresAt)}. Renove com o seu fornecedor.`, 'LINE_EXPIRED');
  }
}

const authFailureFirst = (errors) => errors.find((e) => e?.code === 'AUTH_FAILED') ?? errors[0];

export async function loginViewerWithLine(req, tenant, { username, password }) {
  const servers = await listServerRows(tenant.id);
  if (!servers.length) throw notFound('Nenhuma fonte de conteúdo foi configurada ainda.', 'NO_SERVER');

  // O cliente informa só usuário e senha: descobrimos em qual DNS do assinante a linha existe.
  let found = null;
  const errors = [];
  for (const server of servers) {
    try {
      found = { server, account: await checkLine(server, username, password) };
      break;
    } catch (err) {
      errors.push(err);
    }
  }
  if (!found) {
    const err = authFailureFirst(errors);
    if (err?.code === 'AUTH_FAILED') {
      await audit(req, { action: 'viewer.login', result: 'failure', tenantId: tenant.id, metadata: { mode: 'line' } });
      throw unauthorized(err.message, 'INVALID_CREDENTIALS');
    }
    throw toAppError(err);
  }
  const { server, account } = found;
  assertLineUsable(account);

  const emailNormalized = `xc:${server.id}:${username.toLowerCase()}`.slice(0, 190);
  const settings = await getTenantSettingsRow(tenant.id);
  const passwordEnc = encryptSecret(password);
  const info = JSON.stringify(account);
  let viewer = await queryOne('SELECT * FROM viewer_accounts WHERE tenant_id = ? AND email_normalized = ? AND deleted_at IS NULL', [tenant.id, emailNormalized]);
  if (viewer) {
    if (viewer.status === 'suspended') throw forbidden('Seu acesso foi suspenso. Fale com o responsável por esta página.', 'VIEWER_SUSPENDED');
    await query(
      'UPDATE viewer_accounts SET xtream_password_enc = ?, account_info = ?, account_checked_at = UTC_TIMESTAMP(3), failed_logins = 0, locked_until = NULL, last_login_at = UTC_TIMESTAMP(3) WHERE id = ?',
      [passwordEnc, info, viewer.id],
    );
  } else {
    const total = await queryOne('SELECT COUNT(*) AS n FROM viewer_accounts WHERE tenant_id = ? AND deleted_at IS NULL', [tenant.id]);
    if (Number(total.n) >= settings.max_viewers) throw conflict('O limite de espectadores desta página foi atingido.', 'VIEWER_LIMIT');
    const unusableHash = await hashPassword(randomToken(24));
    try {
      await withTransaction(async (tx) => {
        const v = await tx.query(
          `INSERT INTO viewer_accounts (tenant_id, server_id, xtream_username, xtream_password_enc, account_info, account_checked_at, name, email, email_normalized, password_hash, last_login_at)
           VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(3), ?, ?, ?, ?, UTC_TIMESTAMP(3))`,
          [tenant.id, server.id, username, passwordEnc, info, username.slice(0, 120), username.slice(0, 190), emailNormalized, unusableHash],
        );
        await tx.query('INSERT INTO viewer_profiles (tenant_id, viewer_id, name, avatar) VALUES (?, ?, ?, ?)', [tenant.id, v.insertId, username.slice(0, 40), 'violet']);
      });
    } catch (err) {
      if (!isDuplicateError(err)) throw err;
    }
    viewer = await queryOne('SELECT * FROM viewer_accounts WHERE tenant_id = ? AND email_normalized = ? AND deleted_at IS NULL', [tenant.id, emailNormalized]);
    await audit(req, { action: 'viewer.register', entityType: 'viewer', entityId: viewer.id, tenantId: tenant.id, metadata: { mode: 'line' } });
  }
  const session = await startViewerSession(req, tenant, viewer);
  return { ...session, account: accountView(account, new Date()) };
}

/** Reconsulta a linha no servidor Xtream (com intervalo mínimo). Se o servidor estiver fora do ar, devolve o último estado conhecido. */
export async function refreshLine(line, { maxAgeMs = 0 } = {}) {
  const cached = accountView(line.account, line.checkedAt);
  if (maxAgeMs && line.checkedAt && Date.now() - new Date(line.checkedAt).getTime() < maxAgeMs) return cached;
  const server = await queryOne('SELECT id, adapter, base_url FROM source_servers WHERE id = ? AND deleted_at IS NULL', [line.serverId]);
  if (!server) return cached;
  let account;
  try {
    account = await checkLine(server, line.username, line.password);
  } catch (err) {
    if (err?.code !== 'AUTH_FAILED') return cached;
    account = { ...(line.account ?? {}), active: false, status: err.message };
  }
  await query('UPDATE viewer_accounts SET account_info = ?, account_checked_at = UTC_TIMESTAMP(3) WHERE id = ?', [JSON.stringify(account), line.viewerId]);
  line.account = account;
  line.checkedAt = new Date();
  line.allowedFormats = account.allowedFormats ?? line.allowedFormats;
  return accountView(account, line.checkedAt);
}

export async function logoutViewer(jti) {
  if (jti) await query('UPDATE viewer_sessions SET revoked_at = UTC_TIMESTAMP(3) WHERE jti = ?', [jti]);
}

export async function forgotViewerPassword(req, tenant, email) {
  const viewer = await queryOne("SELECT * FROM viewer_accounts WHERE tenant_id = ? AND email_normalized = ? AND status = 'active' AND deleted_at IS NULL", [tenant.id, normalizeEmail(email)]);
  if (!viewer) return {};
  const token = await createOneTimeToken({ viewerId: viewer.id, purpose: 'reset', ttlMs: HOUR_MS });
  const link = `${config.appUrl}/${tenant.slug}/redefinir-senha?token=${token}`;
  const reset = passwordResetEmailTemplate({ name: viewer.name, link, expiresInText: '1 hora' });
  await sendMail({ to: viewer.email, subject: reset.subject, text: reset.text, html: reset.html });
  await audit(req, { action: 'viewer.forgot_password', entityType: 'viewer', entityId: viewer.id, tenantId: tenant.id });
  return config.isProd ? {} : { devResetUrl: link };
}

export async function resetViewerPassword(req, tenant, { token, password }) {
  const passwordHash = await hashPassword(password);
  const viewerId = await withTransaction(async (tx) => {
    const row = await consumeOneTimeToken(token, 'reset', tx);
    if (!row?.viewer_id) throw badRequest('Link inválido ou expirado. Solicite um novo.', 'INVALID_TOKEN');
    const res = await tx.query(
      'UPDATE viewer_accounts SET password_hash = ?, token_version = token_version + 1, failed_logins = 0, locked_until = NULL WHERE id = ? AND tenant_id = ?',
      [passwordHash, row.viewer_id, tenant.id],
    );
    if (!res.affectedRows) throw badRequest('Link inválido ou expirado. Solicite um novo.', 'INVALID_TOKEN');
    await tx.query('UPDATE viewer_sessions SET revoked_at = UTC_TIMESTAMP(3) WHERE viewer_id = ? AND revoked_at IS NULL', [row.viewer_id]);
    return row.viewer_id;
  });
  await audit(req, { action: 'viewer.reset_password', entityType: 'viewer', entityId: viewerId, tenantId: tenant.id });
}

export async function getViewerSession(tenant, viewer) {
  const profiles = await listProfiles(tenant.id, viewer.id);
  const account = viewer.line ? await refreshLine(viewer.line, { maxAgeMs: 60_000 }) : null;
  return { viewer: viewerView(viewer), profiles, account };
}

// ---------- Controle parental (PIN de categorias adultas) ----------

export async function getAdultControlStatus(viewerId) {
  const v = await queryOne('SELECT adult_control_enabled, adult_pin_hash FROM viewer_accounts WHERE id = ?', [viewerId]);
  return { enabled: !!v?.adult_control_enabled, hasPin: !!v?.adult_pin_hash };
}

export async function setAdultControl(req, tenant, viewerId, { enabled, pin, currentPin }) {
  const v = await queryOne('SELECT adult_control_enabled, adult_pin_hash FROM viewer_accounts WHERE id = ? AND tenant_id = ?', [viewerId, tenant.id]);
  if (!v) throw notFound('Conta não encontrada.', 'NOT_FOUND');
  if (v.adult_pin_hash && (enabled !== !!v.adult_control_enabled || pin)) {
    if (!currentPin || !(await bcrypt.compare(currentPin, v.adult_pin_hash))) throw badRequest('PIN atual incorreto.', 'INVALID_PIN');
  }
  if (enabled && !v.adult_pin_hash && !pin) throw badRequest('Defina um PIN de 4 dígitos para ativar o controle parental.', 'PIN_REQUIRED');
  const pinHash = pin ? await hashPassword(pin) : v.adult_pin_hash;
  await query('UPDATE viewer_accounts SET adult_control_enabled = ?, adult_pin_hash = ? WHERE id = ?', [enabled ? 1 : 0, pinHash, viewerId]);
  await audit(req, { action: 'viewer.adult_control', entityType: 'viewer', entityId: viewerId, tenantId: tenant.id, metadata: { enabled } });
  return { enabled: !!enabled, hasPin: !!pinHash };
}

export async function verifyAdultPin(viewerId, pin) {
  const v = await queryOne('SELECT adult_pin_hash FROM viewer_accounts WHERE id = ?', [viewerId]);
  if (!v?.adult_pin_hash) return false;
  return bcrypt.compare(pin, v.adult_pin_hash);
}

// ---------- Perfis ----------

export async function listProfiles(tenantId, viewerId) {
  const rows = await query('SELECT id, name, avatar, is_kids FROM viewer_profiles WHERE tenant_id = ? AND viewer_id = ? AND deleted_at IS NULL ORDER BY id', [tenantId, viewerId]);
  return rows.map(profileView);
}

export async function createProfile(req, tenant, viewerId, data) {
  const settings = await getTenantSettingsRow(tenant.id);
  if (data.isKids && !settings.kids_profiles_enabled) throw forbidden('Perfis infantis não estão habilitados nesta página.', 'KIDS_DISABLED');
  const id = await withTransaction(async (tx) => {
    await tx.queryOne('SELECT id FROM viewer_accounts WHERE id = ? AND tenant_id = ? FOR UPDATE', [viewerId, tenant.id]);
    const n = await tx.queryOne('SELECT COUNT(*) AS n FROM viewer_profiles WHERE tenant_id = ? AND viewer_id = ? AND deleted_at IS NULL', [tenant.id, viewerId]);
    if (Number(n.n) >= settings.max_profiles_per_viewer) throw conflict(`Limite de ${settings.max_profiles_per_viewer} perfis atingido.`, 'PROFILE_LIMIT');
    const r = await tx.query('INSERT INTO viewer_profiles (tenant_id, viewer_id, name, avatar, is_kids) VALUES (?, ?, ?, ?, ?)', [tenant.id, viewerId, data.name, data.avatar, data.isKids ? 1 : 0]);
    return r.insertId;
  });
  await audit(req, { action: 'profile.create', entityType: 'profile', entityId: id, tenantId: tenant.id });
  return profileView(await queryOne('SELECT id, name, avatar, is_kids FROM viewer_profiles WHERE id = ?', [id]));
}

async function ownedProfile(tenantId, viewerId, profileId) {
  const row = await queryOne('SELECT id, name, avatar, is_kids FROM viewer_profiles WHERE id = ? AND tenant_id = ? AND viewer_id = ? AND deleted_at IS NULL', [profileId, tenantId, viewerId]);
  if (!row) throw notFound('Perfil não encontrado.');
  return row;
}

export async function updateProfile(req, tenant, viewerId, profileId, data) {
  await ownedProfile(tenant.id, viewerId, profileId);
  const settings = await getTenantSettingsRow(tenant.id);
  if (data.isKids && !settings.kids_profiles_enabled) throw forbidden('Perfis infantis não estão habilitados nesta página.', 'KIDS_DISABLED');
  await query('UPDATE viewer_profiles SET name = ?, avatar = ?, is_kids = ? WHERE id = ?', [data.name, data.avatar, data.isKids ? 1 : 0, profileId]);
  return profileView(await queryOne('SELECT id, name, avatar, is_kids FROM viewer_profiles WHERE id = ?', [profileId]));
}

export async function deleteProfile(req, tenant, viewerId, profileId) {
  await ownedProfile(tenant.id, viewerId, profileId);
  const n = await queryOne('SELECT COUNT(*) AS n FROM viewer_profiles WHERE tenant_id = ? AND viewer_id = ? AND deleted_at IS NULL', [tenant.id, viewerId]);
  if (Number(n.n) <= 1) throw conflict('É necessário manter ao menos um perfil.', 'LAST_PROFILE');
  await withTransaction(async (tx) => {
    for (const table of ['viewer_favorites', 'viewer_history', 'viewer_progress']) await tx.query(`DELETE FROM ${table} WHERE profile_id = ? AND tenant_id = ?`, [profileId, tenant.id]);
    await tx.query('UPDATE viewer_profiles SET deleted_at = UTC_TIMESTAMP(3) WHERE id = ?', [profileId]);
  });
  await audit(req, { action: 'profile.delete', entityType: 'profile', entityId: profileId, tenantId: tenant.id });
}

// ---------- Favoritos, histórico e progresso ----------

async function assertServer(tenantId, serverId) {
  const s = await queryOne('SELECT id FROM source_servers WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL', [serverId, tenantId]);
  if (!s) throw notFound('Servidor não encontrado.');
}

export async function listFavorites(tenantId, profileId) {
  const rows = await query('SELECT * FROM viewer_favorites WHERE tenant_id = ? AND profile_id = ? ORDER BY id DESC LIMIT 500', [tenantId, profileId]);
  return rows.map(contentView);
}

export async function addFavorite(tenantId, profileId, ref) {
  await assertServer(tenantId, ref.serverId);
  const count = await queryOne('SELECT COUNT(*) AS n FROM viewer_favorites WHERE tenant_id = ? AND profile_id = ?', [tenantId, profileId]);
  if (Number(count.n) >= 500) throw conflict('Limite de 500 favoritos atingido.', 'FAVORITES_LIMIT');
  await query(
    'INSERT INTO viewer_favorites (tenant_id, profile_id, server_id, content_type, stream_id, name, icon) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), icon = VALUES(icon)',
    [tenantId, profileId, ref.serverId, ref.contentType, ref.streamId, ref.name, ref.icon ?? null],
  );
}

export async function removeFavorite(tenantId, profileId, { serverId, contentType, streamId }) {
  await query('DELETE FROM viewer_favorites WHERE tenant_id = ? AND profile_id = ? AND server_id = ? AND content_type = ? AND stream_id = ?', [tenantId, profileId, serverId, contentType, streamId]);
}

export async function isFavorite(tenantId, profileId, { serverId, contentType, streamId }) {
  const row = await queryOne('SELECT id FROM viewer_favorites WHERE tenant_id = ? AND profile_id = ? AND server_id = ? AND content_type = ? AND stream_id = ?', [tenantId, profileId, serverId, contentType, streamId]);
  return !!row;
}

export async function listHistory(tenantId, profileId) {
  const rows = await query('SELECT * FROM viewer_history WHERE tenant_id = ? AND profile_id = ? ORDER BY watched_at DESC LIMIT 60', [tenantId, profileId]);
  return rows.map((r) => ({ ...contentView(r), watchedAt: r.watched_at, watchCount: r.watch_count }));
}

export async function recordHistory(tenantId, profileId, ref) {
  await assertServer(tenantId, ref.serverId);
  await query(
    `INSERT INTO viewer_history (tenant_id, profile_id, server_id, content_type, stream_id, name, icon) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE watch_count = watch_count + 1, watched_at = UTC_TIMESTAMP(3), name = VALUES(name), icon = VALUES(icon)`,
    [tenantId, profileId, ref.serverId, ref.contentType, ref.streamId, ref.name, ref.icon ?? null],
  );
  await query(
    'DELETE FROM viewer_history WHERE tenant_id = ? AND profile_id = ? AND id NOT IN (SELECT id FROM (SELECT id FROM viewer_history WHERE tenant_id = ? AND profile_id = ? ORDER BY watched_at DESC LIMIT 200) keep)',
    [tenantId, profileId, tenantId, profileId],
  );
}

export async function clearHistory(tenantId, profileId) {
  await query('DELETE FROM viewer_history WHERE tenant_id = ? AND profile_id = ?', [tenantId, profileId]);
}

export async function saveProgress(tenantId, profileId, p) {
  if (p.contentType === 'live') throw badRequest('O progresso só é salvo para filmes e séries.', 'INVALID_CONTENT_TYPE');
  if (p.contentType === 'series' && !p.episodeId) throw badRequest('Informe o episódio.', 'INVALID_CONTENT_TYPE');
  await assertServer(tenantId, p.serverId);
  const completed = p.durationSeconds > 0 && p.positionSeconds / p.durationSeconds >= 0.95 ? 1 : 0;
  await query(
    `INSERT INTO viewer_progress (tenant_id, profile_id, server_id, content_type, stream_id, episode_id, name, icon, position_seconds, duration_seconds, completed)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE position_seconds = VALUES(position_seconds), duration_seconds = VALUES(duration_seconds), completed = VALUES(completed), name = VALUES(name), icon = VALUES(icon)`,
    [tenantId, profileId, p.serverId, p.contentType, p.streamId, p.contentType === 'series' ? p.episodeId : '', p.name, p.icon ?? null, p.positionSeconds, p.durationSeconds, completed],
  );
}

export async function getProgress(tenantId, profileId, { serverId, streamId, contentType = 'vod', episodeId = '' }) {
  const r = await queryOne(
    'SELECT position_seconds, duration_seconds, completed FROM viewer_progress WHERE tenant_id = ? AND profile_id = ? AND server_id = ? AND content_type = ? AND stream_id = ? AND episode_id = ?',
    [tenantId, profileId, serverId, contentType, streamId, episodeId],
  );
  return r ? { positionSeconds: r.position_seconds, durationSeconds: r.duration_seconds, completed: !!r.completed } : null;
}

export async function listContinueWatching(tenantId, profileId) {
  const rows = await query(
    'SELECT * FROM viewer_progress WHERE tenant_id = ? AND profile_id = ? AND completed = 0 AND position_seconds > 10 ORDER BY updated_at DESC LIMIT 40',
    [tenantId, profileId],
  );
  // Séries: só o episódio mais recente de cada uma.
  const seen = new Set();
  const items = [];
  for (const r of rows) {
    const key = `${r.server_id}:${r.content_type}:${r.stream_id}`;
    if (r.content_type === 'series' && seen.has(key)) continue;
    seen.add(key);
    items.push({ ...contentView(r), episodeId: r.episode_id || null, positionSeconds: r.position_seconds, durationSeconds: r.duration_seconds });
  }
  return items.slice(0, 20);
}

// ---------- LGPD (espectador) ----------

export async function exportViewerData(tenant, viewerId) {
  const [viewer, profiles] = await Promise.all([
    queryOne('SELECT id, name, email, status, created_at, last_login_at FROM viewer_accounts WHERE id = ? AND tenant_id = ?', [viewerId, tenant.id]),
    query('SELECT id, name, avatar, is_kids, created_at FROM viewer_profiles WHERE viewer_id = ? AND tenant_id = ? AND deleted_at IS NULL', [viewerId, tenant.id]),
  ]);
  const data = [];
  for (const p of profiles) {
    const [favorites, history, progress] = await Promise.all([
      listFavorites(tenant.id, p.id), listHistory(tenant.id, p.id), query('SELECT stream_id, name, position_seconds, duration_seconds, completed FROM viewer_progress WHERE tenant_id = ? AND profile_id = ?', [tenant.id, p.id]),
    ]);
    data.push({ profile: profileView(p), favorites, history, progress });
  }
  return { exportedAt: new Date().toISOString(), viewer, profiles: data };
}

export async function deleteViewerAccount(req, tenant, viewerId, password) {
  const viewer = await queryOne('SELECT * FROM viewer_accounts WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL', [viewerId, tenant.id]);
  // Contas por linha Xtream confirmam com a senha da própria linha.
  const valid = viewer && (viewer.xtream_password_enc ? timingSafeEqualStr(password, decryptSecret(viewer.xtream_password_enc)) : await bcrypt.compare(password, viewer.password_hash));
  if (!valid) throw badRequest('Senha incorreta.', 'INVALID_CREDENTIALS');
  await anonymizeViewer(tenant.id, viewerId);
  await audit(req, { action: 'viewer.delete_account', entityType: 'viewer', entityId: viewerId, tenantId: tenant.id });
}

async function anonymizeViewer(tenantId, viewerId) {
  const placeholder = `removido-${viewerId}@removed.invalid`;
  await withTransaction(async (tx) => {
    const profiles = await tx.query('SELECT id FROM viewer_profiles WHERE viewer_id = ? AND tenant_id = ?', [viewerId, tenantId]);
    for (const p of profiles) {
      for (const table of ['viewer_favorites', 'viewer_history', 'viewer_progress']) await tx.query(`DELETE FROM ${table} WHERE profile_id = ? AND tenant_id = ?`, [p.id, tenantId]);
    }
    await tx.query('UPDATE viewer_profiles SET deleted_at = UTC_TIMESTAMP(3), name = ? WHERE viewer_id = ? AND tenant_id = ?', ['Removido', viewerId, tenantId]);
    await tx.query('UPDATE viewer_sessions SET revoked_at = UTC_TIMESTAMP(3) WHERE viewer_id = ? AND revoked_at IS NULL', [viewerId]);
    await tx.query(
      "UPDATE viewer_accounts SET name = 'Removido', email = ?, email_normalized = ?, password_hash = ?, xtream_username = NULL, xtream_password_enc = NULL, account_info = NULL, status = 'suspended', token_version = token_version + 1, deleted_at = UTC_TIMESTAMP(3) WHERE id = ? AND tenant_id = ?",
      [placeholder, placeholder, await hashPassword(randomToken(24)), viewerId, tenantId],
    );
  });
}

// ---------- Gestão pelo assinante ----------

export async function listViewersForOwner(tenantId, { offset, size, search }) {
  const conds = ['v.tenant_id = ?', 'v.deleted_at IS NULL'];
  const params = [tenantId];
  if (search) {
    conds.push('(v.name LIKE ? OR v.email LIKE ?)');
    const like = `%${search.replace(/[%_\\]/g, '\\$&')}%`;
    params.push(like, like);
  }
  const where = conds.join(' AND ');
  const [rows, total] = await Promise.all([
    query(
      `SELECT v.id, v.name, v.email, v.status, v.created_at, v.last_login_at,
              (SELECT COUNT(*) FROM viewer_profiles p WHERE p.viewer_id = v.id AND p.deleted_at IS NULL) AS profiles
         FROM viewer_accounts v WHERE ${where} ORDER BY v.id DESC LIMIT ? OFFSET ?`,
      [...params, size, offset],
    ),
    queryOne(`SELECT COUNT(*) AS n FROM viewer_accounts v WHERE ${where}`, params),
  ]);
  return {
    items: rows.map((r) => ({ id: r.id, name: r.name, email: r.email, status: r.status, createdAt: r.created_at, lastLoginAt: r.last_login_at, profiles: Number(r.profiles) })),
    total: Number(total.n),
  };
}

async function ownedViewer(tenantId, viewerId) {
  const v = await queryOne('SELECT id, name, email, status FROM viewer_accounts WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL', [viewerId, tenantId]);
  if (!v) throw notFound('Espectador não encontrado.');
  return v;
}

export async function createViewerByOwner(req, tenant, data) {
  const settings = await getTenantSettingsRow(tenant.id);
  const total = await queryOne('SELECT COUNT(*) AS n FROM viewer_accounts WHERE tenant_id = ? AND deleted_at IS NULL', [tenant.id]);
  if (Number(total.n) >= settings.max_viewers) throw conflict('O limite de espectadores foi atingido.', 'VIEWER_LIMIT');
  const passwordHash = await hashPassword(data.password);
  try {
    const id = await withTransaction(async (tx) => {
      const v = await tx.query('INSERT INTO viewer_accounts (tenant_id, name, email, email_normalized, password_hash) VALUES (?, ?, ?, ?, ?)', [tenant.id, data.name, data.email, normalizeEmail(data.email), passwordHash]);
      await tx.query('INSERT INTO viewer_profiles (tenant_id, viewer_id, name, avatar) VALUES (?, ?, ?, ?)', [tenant.id, v.insertId, data.name.split(' ')[0].slice(0, 40), 'violet']);
      return v.insertId;
    });
    await audit(req, { action: 'viewer.create_by_owner', entityType: 'viewer', entityId: id, tenantId: tenant.id });
    return { id };
  } catch (err) {
    if (isDuplicateError(err)) throw conflict('Este e-mail já está cadastrado.', 'EMAIL_TAKEN');
    throw err;
  }
}

export async function setViewerStatus(req, tenant, viewerId, status) {
  await ownedViewer(tenant.id, viewerId);
  await query('UPDATE viewer_accounts SET status = ?, token_version = token_version + 1 WHERE id = ?', [status, viewerId]);
  if (status === 'suspended') await query('UPDATE viewer_sessions SET revoked_at = UTC_TIMESTAMP(3) WHERE viewer_id = ? AND revoked_at IS NULL', [viewerId]);
  await audit(req, { action: `viewer.${status === 'active' ? 'reactivate' : 'suspend'}`, entityType: 'viewer', entityId: viewerId, tenantId: tenant.id });
}

export async function setViewerPasswordByOwner(req, tenant, viewerId, password) {
  await ownedViewer(tenant.id, viewerId);
  await query('UPDATE viewer_accounts SET password_hash = ?, token_version = token_version + 1, failed_logins = 0, locked_until = NULL WHERE id = ?', [await hashPassword(password), viewerId]);
  await query('UPDATE viewer_sessions SET revoked_at = UTC_TIMESTAMP(3) WHERE viewer_id = ? AND revoked_at IS NULL', [viewerId]);
  await audit(req, { action: 'viewer.password_set_by_owner', entityType: 'viewer', entityId: viewerId, tenantId: tenant.id });
}

export async function deleteViewerByOwner(req, tenant, viewerId) {
  await ownedViewer(tenant.id, viewerId);
  await anonymizeViewer(tenant.id, viewerId);
  await audit(req, { action: 'viewer.delete_by_owner', entityType: 'viewer', entityId: viewerId, tenantId: tenant.id });
}

export async function listProfilesForOwner(tenantId, viewerId) {
  await ownedViewer(tenantId, viewerId);
  return listProfiles(tenantId, viewerId);
}
