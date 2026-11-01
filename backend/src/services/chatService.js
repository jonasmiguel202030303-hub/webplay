import { query, queryOne } from '../config/db.js';
import { tooMany, unprocessable } from '../utils/errors.js';
import { checkMessage, parseWordList } from '../utils/chatFilter.js';

const MAX_LEN = 300;
const MIN_GAP_MS = 2000;
const SETTINGS_TTL_MS = 10_000;

const settingsCache = new Map();
const lastPost = new Map();
let postCount = 0;

export const clearChatSettingsCache = (tenantId) => settingsCache.delete(tenantId);

async function chatSettings(tenantId) {
  const hit = settingsCache.get(tenantId);
  if (hit && Date.now() - hit.at < SETTINGS_TTL_MS) return hit.value;
  const row = await queryOne('SELECT chat_enabled, chat_banned_words FROM tenant_settings WHERE tenant_id = ?', [tenantId]);
  const value = { enabled: row ? !!row.chat_enabled : true, words: parseWordList(row?.chat_banned_words) };
  settingsCache.set(tenantId, { at: Date.now(), value });
  if (settingsCache.size > 500) settingsCache.delete(settingsCache.keys().next().value);
  return value;
}

const view = (r) => ({ id: Number(r.id), profileId: Number(r.profile_id), name: r.author_name, avatar: r.author_avatar, body: r.body, at: r.created_at });

/** Perfis infantis não participam do chat (conversa aberta com desconhecidos). */
const availability = async (tenantId, profile) => {
  const s = await chatSettings(tenantId);
  if (!s.enabled) return { settings: s, enabled: false, reason: 'off' };
  if (profile.isKids) return { settings: s, enabled: false, reason: 'kids' };
  return { settings: s, enabled: true };
};

/** Mensagens novas (id maior que `afterId`) ou, sem `afterId`, as últimas 50. */
export async function listChat(tenantId, profile, afterId = 0) {
  const a = await availability(tenantId, profile);
  if (!a.enabled) return { enabled: false, reason: a.reason, messages: [] };
  const cols = 'id, profile_id, author_name, author_avatar, body, created_at';
  let rows;
  if (afterId > 0) {
    rows = await query(`SELECT ${cols} FROM chat_messages WHERE tenant_id = ? AND id > ? ORDER BY id ASC LIMIT 100`, [tenantId, afterId]);
  } else {
    rows = await query(`SELECT ${cols} FROM chat_messages WHERE tenant_id = ? ORDER BY id DESC LIMIT 50`, [tenantId]);
    rows.reverse();
  }
  return { enabled: true, messages: rows.map(view) };
}

export async function postChat(tenantId, profile, avatar, rawBody) {
  const a = await availability(tenantId, profile);
  if (!a.enabled) throw unprocessable(a.reason === 'kids' ? 'O chat não está disponível em perfis infantis.' : 'O chat está desativado.', 'CHAT_DISABLED');

  const body = String(rawBody ?? '').replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
  if (!body) throw unprocessable('Escreva uma mensagem.', 'CHAT_EMPTY');
  if (body.length > MAX_LEN) throw unprocessable(`A mensagem pode ter no máximo ${MAX_LEN} caracteres.`, 'CHAT_TOO_LONG');

  const last = lastPost.get(profile.id);
  const now = Date.now();
  if (last && now - last.at < MIN_GAP_MS) throw tooMany('Aguarde um instante para enviar outra mensagem.', 'CHAT_SLOW_DOWN');
  if (last && last.body === body && now - last.at < 30_000) throw unprocessable('Você já enviou essa mensagem.', 'CHAT_DUPLICATE');

  const problem = checkMessage(body, a.settings.words);
  if (problem === 'link') throw unprocessable('Links não são permitidos no chat.', 'CHAT_BLOCKED');
  if (problem) throw unprocessable('Sua mensagem contém palavras não permitidas.', 'CHAT_BLOCKED');

  lastPost.set(profile.id, { at: now, body });
  if (lastPost.size > 5000) lastPost.delete(lastPost.keys().next().value);

  const result = await query('INSERT INTO chat_messages (tenant_id, profile_id, author_name, author_avatar, body) VALUES (?, ?, ?, ?, ?)', [
    tenantId, profile.id, String(profile.name).slice(0, 40), String(avatar ?? 'people-1').slice(0, 30), body,
  ]);
  // Histórico curto: apaga mensagens com mais de 3 dias de vez em quando.
  if (++postCount % 50 === 0) {
    query('DELETE FROM chat_messages WHERE tenant_id = ? AND created_at < UTC_TIMESTAMP(3) - INTERVAL 3 DAY', [tenantId]).catch(() => {});
  }
  const row = await queryOne('SELECT id, profile_id, author_name, author_avatar, body, created_at FROM chat_messages WHERE id = ?', [result.insertId]);
  return view(row);
}
