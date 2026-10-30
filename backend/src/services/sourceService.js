import { config } from '../config/env.js';
import { query, queryOne, withTransaction, parseJson } from '../config/db.js';
import { AppError, conflict, notFound } from '../utils/errors.js';
import { decryptSecret } from '../utils/crypto.js';
import { getAdapter } from '../adapters/xtream.js';
import { SourceError, normalizeBaseUrl } from '../adapters/safeFetch.js';
import { audit } from './auditService.js';
import { relayEnabled, relayPath } from './relayService.js';
import { getTenantSettingsRow } from './tenantService.js';
import { currentLine } from './lineContext.js';

const VALIDATION_CODES = new Set(['INVALID_URL', 'INSECURE_PROTOCOL', 'BLOCKED_ADDRESS', 'BLOCKED_PORT', 'HOST_NOT_ALLOWED']);
const OFFLINE_CODES = new Set(['TIMEOUT', 'UNREACHABLE', 'TLS_ERROR', 'SERVER_ERROR', 'TOO_MANY_REDIRECTS']);

/** Converte falhas da fonte em erros de API legíveis, sem qualquer credencial. */
export function toAppError(err) {
  if (err instanceof AppError) return err;
  if (err instanceof SourceError) {
    return new AppError(VALIDATION_CODES.has(err.code) ? 422 : err.code === 'AUTH_FAILED' ? 403 : 502, `SOURCE_${err.code}`, err.message);
  }
  return err;
}

const statusFromError = (err) => (err instanceof SourceError ? (err.code === 'AUTH_FAILED' ? 'auth_failed' : OFFLINE_CODES.has(err.code) ? 'offline' : 'error') : 'error');

const view = (row, creds) => ({
  id: row.id,
  name: row.name,
  adapter: row.adapter,
  url: row.base_url,
  username: creds?.username ?? null,
  hasCredentials: !!row.username_enc,
  status: row.status,
  statusMessage: row.status_message,
  account: parseJson(row.account_info, null),
  lastCheckedAt: row.last_checked_at,
  lastRefreshAt: row.last_refresh_at,
  isDefault: !!row.is_default,
});

export async function listServers(tenantId) {
  const rows = await query('SELECT * FROM source_servers WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY is_default DESC, id ASC', [tenantId]);
  return rows.map((r) => view(r, { username: safeDecrypt(r.username_enc) }));
}

function safeDecrypt(value) {
  if (!value) return null;
  try {
    return decryptSecret(value);
  } catch {
    return null;
  }
}

async function loadServer(tenantId, serverId) {
  const row = await queryOne('SELECT * FROM source_servers WHERE id = ? AND tenant_id = ? AND deleted_at IS NULL', [serverId, tenantId]);
  if (!row) throw notFound('Servidor não encontrado.');
  return row;
}

function adapterFor(row) {
  const line = currentLine();
  if (line && line.serverId === row.id) return getAdapter(row.adapter, { baseUrl: row.base_url, username: line.username, password: line.password });
  if (!row.username_enc || !row.password_enc) throw new SourceError('NO_CREDENTIALS', 'Entre com o seu usuário e senha para acessar o conteúdo.');
  return getAdapter(row.adapter, { baseUrl: row.base_url, username: decryptSecret(row.username_enc), password: decryptSecret(row.password_enc) });
}

const lineKey = () => {
  const line = currentLine();
  return line ? `v${line.viewerId}` : 'srv';
};

/** Testa só a DNS (sem usuário/senha) e não grava nada. */
export async function testConnection({ url }) {
  try {
    const baseUrl = normalizeBaseUrl(url);
    const probe = await getAdapter('xtream', { baseUrl }).probe();
    return { ok: true, baseUrl, probe };
  } catch (err) {
    throw toAppError(err);
  }
}

async function recordStatus(serverId, { status, message, account }) {
  await query('UPDATE source_servers SET status = ?, status_message = ?, account_info = COALESCE(?, account_info), last_checked_at = UTC_TIMESTAMP(3) WHERE id = ?', [
    status,
    message ? String(message).slice(0, 300) : null,
    account ? JSON.stringify(account) : null,
    serverId,
  ]);
}

export async function testSavedServer(req, tenantId, serverId) {
  const row = await loadServer(tenantId, serverId);
  try {
    const probe = await getAdapter(row.adapter, { baseUrl: row.base_url }).probe();
    await recordStatus(serverId, { status: 'online', message: probe.looksLikeXtream ? 'DNS respondendo.' : 'DNS respondeu, mas não parece um painel Xtream.' });
    await audit(req, { action: 'server.test', entityType: 'server', entityId: serverId, metadata: { ok: true } });
    return { ok: true, probe };
  } catch (err) {
    await recordStatus(serverId, { status: statusFromError(err), message: err.message });
    await audit(req, { action: 'server.test', entityType: 'server', entityId: serverId, result: 'failure', metadata: { code: err.code } });
    throw toAppError(err);
  }
}

export async function createServer(req, tenantId, { name, url }) {
  const baseUrl = (() => {
    try {
      return normalizeBaseUrl(url);
    } catch (err) {
      throw toAppError(err);
    }
  })();
  const count = await queryOne('SELECT COUNT(*) AS n FROM source_servers WHERE tenant_id = ? AND deleted_at IS NULL', [tenantId]);
  if (Number(count.n) >= config.source.maxServersPerTenant) throw conflict(`Limite de ${config.source.maxServersPerTenant} servidores por conta atingido.`, 'SERVER_LIMIT');

  const result = await query('INSERT INTO source_servers (tenant_id, name, base_url, is_default) VALUES (?, ?, ?, ?)', [
    tenantId, name, baseUrl, Number(count.n) === 0 ? 1 : 0,
  ]);
  await audit(req, { action: 'server.create', entityType: 'server', entityId: result.insertId, metadata: { name } });
  const row = await loadServer(tenantId, result.insertId);
  // Verifica a DNS e registra o estado; falhas de rede não impedem o salvamento.
  try {
    const probe = await getAdapter(row.adapter, { baseUrl }).probe();
    await recordStatus(row.id, { status: 'online', message: probe.looksLikeXtream ? 'DNS respondendo.' : 'DNS respondeu, mas não parece um painel Xtream.' });
  } catch (err) {
    await recordStatus(row.id, { status: statusFromError(err), message: err.message });
  }
  const fresh = await loadServer(tenantId, row.id);
  return view(fresh, null);
}

export async function updateServer(req, tenantId, serverId, { name, url }) {
  await loadServer(tenantId, serverId);
  let baseUrl;
  try {
    baseUrl = normalizeBaseUrl(url);
  } catch (err) {
    throw toAppError(err);
  }
  // O servidor guarda só a DNS: credenciais antigas (modelo anterior) são descartadas ao salvar.
  await query('UPDATE source_servers SET name = ?, base_url = ?, username_enc = NULL, password_enc = NULL, status = ?, status_message = NULL WHERE id = ?', [
    name, baseUrl, 'unknown', serverId,
  ]);
  clearCatalogCache(serverId);
  await audit(req, { action: 'server.update', entityType: 'server', entityId: serverId, metadata: { name } });
  const fresh = await loadServer(tenantId, serverId);
  return view(fresh, null);
}

export async function deleteServer(req, tenantId, serverId) {
  const row = await loadServer(tenantId, serverId);
  await withTransaction(async (tx) => {
    await tx.query('UPDATE source_servers SET deleted_at = UTC_TIMESTAMP(3), is_default = 0 WHERE id = ?', [serverId]);
    await tx.query('DELETE FROM source_categories_cache WHERE server_id = ? AND tenant_id = ?', [serverId, tenantId]);
    await tx.query('DELETE FROM viewer_favorites WHERE server_id = ? AND tenant_id = ?', [serverId, tenantId]);
    await tx.query('DELETE FROM viewer_history WHERE server_id = ? AND tenant_id = ?', [serverId, tenantId]);
    await tx.query('DELETE FROM viewer_progress WHERE server_id = ? AND tenant_id = ?', [serverId, tenantId]);
    if (row.is_default) {
      const next = await tx.queryOne('SELECT id FROM source_servers WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY id LIMIT 1', [tenantId]);
      if (next) await tx.query('UPDATE source_servers SET is_default = 1 WHERE id = ?', [next.id]);
    }
  });
  clearCatalogCache(serverId);
  await audit(req, { action: 'server.delete', entityType: 'server', entityId: serverId });
}

export async function setDefaultServer(req, tenantId, serverId) {
  await loadServer(tenantId, serverId);
  await withTransaction(async (tx) => {
    await tx.query('UPDATE source_servers SET is_default = 0 WHERE tenant_id = ?', [tenantId]);
    await tx.query('UPDATE source_servers SET is_default = 1 WHERE id = ? AND tenant_id = ?', [serverId, tenantId]);
  });
  await audit(req, { action: 'server.set_default', entityType: 'server', entityId: serverId });
}

// ---------- Cache de metadados ----------
const memCache = new Map();
const inflight = new Map();
const MAX_CACHE_ENTRIES = 40;

export function clearCatalogCache(serverId) {
  for (const key of memCache.keys()) if (key.startsWith(`${serverId}:`)) memCache.delete(key);
}

async function cached(key, ttlMs, loader) {
  const hit = memCache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.data;
  if (inflight.has(key)) return inflight.get(key);
  const promise = (async () => {
    try {
      const data = await loader();
      memCache.set(key, { at: Date.now(), data });
      if (memCache.size > MAX_CACHE_ENTRIES) memCache.delete(memCache.keys().next().value);
      return data;
    } catch (err) {
      if (hit) return hit.data; // serve dados antigos se a fonte falhar, sem inventar conteúdo
      throw err;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, promise);
  return promise;
}

const ttlMsFor = async (tenantId) => ((await getTenantSettingsRow(tenantId))?.catalog_cache_ttl_seconds ?? 600) * 1000;

/** Atualiza categorias (live/vod/series) a pedido do assinante ou quando o cache expira. */
export async function refreshCategories(req, tenantId, serverId) {
  const row = await loadServer(tenantId, serverId);
  const adapter = adapterFor(row);
  const types = ['live', 'vod', 'series'];
  const result = {};
  const fetched = {};
  let authFailure = null;
  for (const type of types) {
    try {
      fetched[type] = await adapter.getCategories(type);
      result[type] = { available: true, count: fetched[type].length };
    } catch (err) {
      result[type] = { available: false, count: 0, error: err.message };
      if (err.code === 'AUTH_FAILED' || err.code === 'TIMEOUT' || err.code === 'UNREACHABLE') authFailure = authFailure ?? err;
    }
  }
  if (authFailure && !Object.values(fetched).length) {
    await recordStatus(serverId, { status: statusFromError(authFailure), message: authFailure.message });
    throw toAppError(authFailure);
  }
  const now = new Date();
  await withTransaction(async (tx) => {
    for (const type of Object.keys(fetched)) {
      await tx.query('DELETE FROM source_categories_cache WHERE server_id = ? AND content_type = ?', [serverId, type]);
      for (const c of fetched[type]) {
        await tx.query(
          'INSERT INTO source_categories_cache (tenant_id, server_id, content_type, category_id, name, parent_id, position, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), position = VALUES(position), fetched_at = VALUES(fetched_at)',
          [tenantId, serverId, type, c.id.slice(0, 40), c.name.slice(0, 200), c.parentId, c.position, now],
        );
      }
    }
    await tx.query("UPDATE source_servers SET last_refresh_at = ?, status = 'online', status_message = 'Categorias atualizadas.', last_checked_at = ? WHERE id = ?", [now, now, serverId]);
  });
  clearCatalogCache(serverId);
  await audit(req, { action: 'server.refresh_categories', entityType: 'server', entityId: serverId, tenantId, metadata: result });
  return result;
}

const KIDS_RE = /infantil|kids|crian[cç]|desenho|cartoon|disney|junior|baby/i;

export async function getCategories(tenantId, serverId, type, { kidsOnly = false } = {}) {
  const server = await loadServer(tenantId, serverId);
  const ttl = await ttlMsFor(tenantId);
  let rows;
  let warning = null;
  if (currentLine()) {
    // Cada linha tem seus próprios bouquets: categorias ficam em memória por espectador, não no cache compartilhado do banco.
    try {
      const list = await cachedSmall(`${serverId}:${lineKey()}:cat:${type}`, ttl, () => adapterFor(server).getCategories(type));
      rows = list.map((c) => ({ category_id: c.id, name: c.name }));
    } catch (err) {
      throw toAppError(err);
    }
  } else {
    const stale = !server.last_refresh_at || Date.now() - new Date(server.last_refresh_at).getTime() > ttl;
    if (stale) {
      try {
        await refreshCategories(null, tenantId, serverId);
      } catch (err) {
        warning = err.message;
      }
    }
    rows = await query(
      'SELECT category_id, name, position FROM source_categories_cache WHERE tenant_id = ? AND server_id = ? AND content_type = ? ORDER BY position ASC, name ASC',
      [tenantId, serverId, type],
    );
  }
  if (kidsOnly) rows = rows.filter((r) => KIDS_RE.test(r.name));
  return { categories: rows.map((r) => ({ id: r.category_id, name: r.name })), warning };
}

const fold = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

async function allStreams(tenantId, serverId, type) {
  const row = await loadServer(tenantId, serverId);
  const ttl = await ttlMsFor(tenantId);
  return cached(`${serverId}:${lineKey()}:${type}`, ttl, async () => {
    const list = await adapterFor(row).getStreams(type);
    return list.map((s) => ({ ...s, _fold: fold(s.name) }));
  });
}

export async function getStreams(tenantId, serverId, type, { categoryId, q, page = 1, pageSize = 40, kidsOnly = false } = {}) {
  let list;
  try {
    list = await allStreams(tenantId, serverId, type);
  } catch (err) {
    throw toAppError(err);
  }
  if (kidsOnly) {
    const { categories } = await getCategories(tenantId, serverId, type, { kidsOnly: true });
    const ids = new Set(categories.map((c) => c.id));
    list = list.filter((s) => ids.has(s.categoryId));
  }
  if (categoryId) list = list.filter((s) => s.categoryId === String(categoryId));
  if (q) {
    const needle = fold(q).trim();
    if (needle) list = list.filter((s) => s._fold.includes(needle));
  }
  const total = list.length;
  const start = (page - 1) * pageSize;
  const items = list.slice(start, start + pageSize).map(({ _fold, ...s }) => s);
  return { items, total, page, pageSize };
}

export async function getStream(tenantId, serverId, type, streamId) {
  let list;
  try {
    list = await allStreams(tenantId, serverId, type);
  } catch (err) {
    throw toAppError(err);
  }
  const found = list.find((s) => s.id === String(streamId));
  if (!found) throw notFound('Conteúdo não encontrado na fonte.');
  const { _fold, ...stream } = found;
  return stream;
}

/** Cache pequeno (detalhes, EPG) separado do cache das listas grandes, para não expulsá-las. */
const smallCache = new Map();
async function cachedSmall(key, ttlMs, loader) {
  const hit = smallCache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.data;
  const data = await loader();
  smallCache.set(key, { at: Date.now(), data });
  if (smallCache.size > 300) smallCache.delete(smallCache.keys().next().value);
  return data;
}

/** Detalhes (sinopse, elenco, temporadas...) de filme ou série, com cache curto. */
export async function getDetails(tenantId, serverId, type, id) {
  const row = await loadServer(tenantId, serverId);
  try {
    return await cachedSmall(`${serverId}:${lineKey()}:details:${type}:${id}`, 10 * 60 * 1000, async () => {
      const adapter = adapterFor(row);
      return type === 'series' ? adapter.getSeriesInfo(id) : adapter.getVodInfo(id);
    });
  } catch (err) {
    throw toAppError(err);
  }
}

/** Programação curta de um canal ao vivo. Falha de EPG nunca derruba a tela: devolve lista vazia. */
export async function getEpg(tenantId, serverId, streamId) {
  const row = await loadServer(tenantId, serverId);
  try {
    return await cachedSmall(`${serverId}:${lineKey()}:epg:${streamId}`, 60 * 1000, () => adapterFor(row).getShortEpg(streamId));
  } catch {
    return [];
  }
}

/** Pôsteres para o fundo da tela de login (público): usa só o cache; se vazio, aquece em segundo plano. Nunca devolve credenciais. */
export async function listPosters(tenantId, limit = 48) {
  const serverId = await defaultServerId(tenantId);
  if (!serverId) return [];
  const hit = memCache.get(`${serverId}:srv:vod`);
  if (!hit) {
    allStreams(tenantId, serverId, 'vod').catch(() => {});
    return [];
  }
  const ADULT = /xxx|adulto|adult|porn|\+ ?18|18 ?\+|er[óo]tic|sexo/i;
  const withIcon = hit.data.filter((s) => s.icon && /^https?:\/\//i.test(s.icon) && !/imgur\.com/i.test(s.icon) && !ADULT.test(s.name ?? ''));
  const step = Math.max(1, Math.floor(withIcon.length / limit));
  const picked = [];
  for (let i = 0; i < withIcon.length && picked.length < limit; i += step) picked.push({ poster: withIcon[i].icon });
  return picked;
}

function playbackFor(tenantId, row, { url, format, formats, stream, extra = {} }) {
  const base = new URL(row.base_url);
  // Relay: o navegador fala só com a plataforma (contorna bloqueio de DNS, CORS e conteúdo misto, e oculta as credenciais).
  const relayUrl = relayEnabled() ? relayPath(tenantId, url) : null;
  const alternatives = (formats ?? []).filter((f) => f.format !== format).map((f) => ({ format: f.format, relayUrl: relayEnabled() ? relayPath(tenantId, f.url) : null, url: f.url }));
  const meta = { format, stream, sourceProtocol: base.protocol, sourceHost: base.hostname, ...extra };
  if (config.relay.mode === 'always') {
    return { ...meta, url: relayUrl, relayUrl, relayOnly: true, alternatives: alternatives.map(({ format: f, relayUrl: r }) => ({ format: f, url: r, relayUrl: r })) };
  }
  return { ...meta, url, relayUrl, relayOnly: false, alternatives };
}

/** Navegadores não tocam MKV/AVI etc.: oferece HLS e MP4 do mesmo título como alternativas (o player tenta em ordem). */
function vodFallbacks(adapter, type, id, format) {
  if (['mp4', 'm3u8'].includes(format)) return [];
  return ['m3u8', 'mp4'].map((f) => ({ format: f, url: adapter.buildPlayUrl({ type, id, extension: f }).url }));
}

/** Entrega a URL de reprodução direta ao espectador autenticado e autorizado (nunca em cache público). */
export async function getPlayback(tenantId, serverId, type, streamId) {
  const row = await loadServer(tenantId, serverId);
  const stream = await getStream(tenantId, serverId, type, streamId);
  const account = parseJson(row.account_info, {}) ?? {};
  const adapter = adapterFor(row);
  const allowed = currentLine()?.allowedFormats ?? account.allowedFormats ?? [];
  const { url, format } = adapter.buildPlayUrl({ type, id: stream.id, extension: stream.extension, allowedFormats: allowed });
  // Canais ao vivo: formatos alternativos (ex.: ts) para o player tentar se o HLS falhar.
  const formats = type === 'live'
    ? allowed.filter((f) => ['m3u8', 'ts'].includes(f)).map((f) => ({ format: f, url: adapter.buildPlayUrl({ type, id: stream.id, allowedFormats: [f] }).url }))
    : vodFallbacks(adapter, type, stream.id, format);
  return playbackFor(tenantId, row, { url, format, formats, stream });
}

/** Reprodução de um episódio de série (o id do episódio vem do get_series_info). */
export async function getEpisodePlayback(tenantId, serverId, seriesId, episodeId, extension) {
  const row = await loadServer(tenantId, serverId);
  const adapter = adapterFor(row);
  const stream = await getStream(tenantId, serverId, 'series', seriesId);
  const { url, format } = adapter.buildPlayUrl({ type: 'series', id: episodeId, extension });
  return playbackFor(tenantId, row, { url, format, formats: vodFallbacks(adapter, 'series', episodeId, format), stream });
}

/** Servidores (DNS) do assinante, padrão primeiro: usados para descobrir em qual deles a linha do cliente existe. */
export async function listServerRows(tenantId) {
  return query('SELECT id, name, adapter, base_url FROM source_servers WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY is_default DESC, id ASC', [tenantId]);
}

/** Consulta a linha do cliente em tempo real no servidor Xtream (status, vencimento, conexões). */
export async function checkLine(server, username, password) {
  return getAdapter(server.adapter, { baseUrl: server.base_url, username, password }).authenticate();
}

export async function defaultServerId(tenantId) {
  const row = await queryOne('SELECT id FROM source_servers WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY is_default DESC, id ASC LIMIT 1', [tenantId]);
  return row?.id ?? null;
}

export async function listServersForViewer(tenantId) {
  const line = currentLine();
  const rows = await query('SELECT id, name, status, is_default FROM source_servers WHERE tenant_id = ? AND deleted_at IS NULL ORDER BY is_default DESC, id', [tenantId]);
  return rows.filter((r) => !line || r.id === line.serverId).map((r) => ({ id: r.id, name: r.name, isDefault: !!r.is_default, status: r.status }));
}

