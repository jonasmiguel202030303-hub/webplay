import { query, queryOne } from '../config/db.js';
import { randomToken, sha256 } from '../utils/crypto.js';
import { HOUR_MS } from '../utils/time.js';

/** Cria token de uso único (só o hash é armazenado) e invalida tokens anteriores do mesmo propósito. */
export async function createOneTimeToken({ userId = null, viewerId = null, purpose, ttlMs, db = { query } }) {
  const token = randomToken(32);
  if (userId) await db.query('UPDATE password_reset_tokens SET used_at = UTC_TIMESTAMP(3) WHERE user_id = ? AND purpose = ? AND used_at IS NULL', [userId, purpose]);
  if (viewerId) await db.query('UPDATE password_reset_tokens SET used_at = UTC_TIMESTAMP(3) WHERE viewer_id = ? AND purpose = ? AND used_at IS NULL', [viewerId, purpose]);
  await db.query('INSERT INTO password_reset_tokens (purpose, user_id, viewer_id, token_hash, expires_at) VALUES (?, ?, ?, ?, ?)', [
    purpose,
    userId,
    viewerId,
    sha256(token),
    new Date(Date.now() + (ttlMs ?? HOUR_MS)),
  ]);
  return token;
}

/** Consome o token (uso único, atômico). Retorna a linha ou null se inválido/expirado/usado. */
export async function consumeOneTimeToken(token, purpose, db = { query, queryOne }) {
  const hash = sha256(token);
  const res = await db.query(
    'UPDATE password_reset_tokens SET used_at = UTC_TIMESTAMP(3) WHERE token_hash = ? AND purpose = ? AND used_at IS NULL AND expires_at > UTC_TIMESTAMP(3)',
    [hash, purpose],
  );
  if (!res.affectedRows) return null;
  return db.queryOne('SELECT * FROM password_reset_tokens WHERE token_hash = ?', [hash]);
}
