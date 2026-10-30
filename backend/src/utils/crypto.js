import crypto from 'node:crypto';
import { config } from '../config/env.js';

function parseKey(raw) {
  if (!raw) return null;
  const buf = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  return buf.length === 32 ? buf : null;
}

function keyring() {
  const ring = new Map();
  const current = parseKey(config.encryptionKey);
  if (current) ring.set(config.encryptionKeyId, current);
  const prev = parseKey(config.encryptionKeyPrev);
  if (prev) ring.set(config.encryptionKeyPrevId, prev);
  return ring;
}

/** AES-256-GCM. Formato: v1:<keyId>:<iv>:<tag>:<dados> (base64). */
export function encryptSecret(plain) {
  const key = keyring().get(config.encryptionKeyId);
  if (!key) throw new Error('ENCRYPTION_KEY ausente ou inválida (esperado 32 bytes).');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', config.encryptionKeyId, iv.toString('base64'), tag.toString('base64'), data.toString('base64')].join(':');
}

export function decryptSecret(payload) {
  const [version, keyId, iv, tag, data] = String(payload).split(':');
  if (version !== 'v1') throw new Error('Formato de segredo desconhecido.');
  const key = keyring().get(keyId);
  if (!key) throw new Error(`Chave de criptografia "${keyId}" indisponível.`);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}

export const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

export const uuid = () => crypto.randomUUID();

export function hashIp(ip) {
  if (!ip) return null;
  return crypto.createHmac('sha256', config.jwtSecret || 'webplay').update(String(ip)).digest('hex');
}

export function timingSafeEqualStr(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/** Mostra só o final de um segredo. Nunca devolve o valor completo. */
export function maskSecret(value) {
  if (!value) return null;
  const s = String(value);
  return s.length <= 8 ? '••••' : `••••••••${s.slice(-4)}`;
}
