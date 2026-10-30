import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { config } from '../config/env.js';
import { encryptSecret, decryptSecret } from '../utils/crypto.js';
import { SourceError, safeFetchStream, readLimitedBuffer } from '../adapters/safeFetch.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../config/logger.js';

/**
 * Retransmissão de mídia: o navegador fala só com a plataforma; o servidor busca a fonte (com DNS alternativo,
 * validação SSRF e sem expor credenciais). Cada URL da fonte vira um token opaco (AES-256-GCM) com validade.
 */

export const relayEnabled = () => config.relay.mode !== 'off';

// AES-256-GCM usa IV aleatório: criptografar a mesma URL duas vezes gera tokens diferentes. Uma playlist HLS ao
// vivo é uma janela deslizante (os mesmos segmentos aparecem em várias recargas seguidas); o hls.js compara os
// segmentos repetidos entre uma recarga e outra e considera erro fatal ("media sequence mismatch") se a mesma
// posição da playlist vier com uma URL diferente. Por isso guardamos o token já emitido para cada URL da fonte
// e reaproveitamos enquanto ainda tiver validade, em vez de gerar um novo a cada reescrita da playlist.
const TOKEN_REUSE_MARGIN_MS = 60_000;
const tokenCache = new Map();

export function makeRelayToken(tenantId, url) {
  const key = `${tenantId}:${url}`;
  const now = Date.now();
  const cached = tokenCache.get(key);
  if (cached && cached.exp - now > TOKEN_REUSE_MARGIN_MS) return cached.token;
  const expSeconds = Math.floor(now / 1000) + config.relay.tokenTtlSeconds;
  const payload = JSON.stringify({ t: tenantId, u: url, e: expSeconds });
  const token = Buffer.from(encryptSecret(payload), 'utf8').toString('base64url');
  if (tokenCache.size >= 5000) tokenCache.delete(tokenCache.keys().next().value);
  tokenCache.set(key, { token, exp: expSeconds * 1000 });
  return token;
}

export const relayPath = (tenantId, url) => `/api/relay/${makeRelayToken(tenantId, url)}`;

export function openRelayToken(token) {
  try {
    const data = JSON.parse(decryptSecret(Buffer.from(String(token), 'base64url').toString('utf8')));
    if (!data || typeof data.u !== 'string' || !Number.isInteger(data.t) || !Number.isInteger(data.e)) return null;
    if (data.e < Math.floor(Date.now() / 1000)) return null;
    return { tenantId: data.t, url: data.u };
  } catch {
    return null;
  }
}

const URI_ATTR = /URI="([^"]+)"/g;

/** Reescreve todas as URIs de uma playlist HLS para o relay (segmentos, chaves, mapas, variantes). */
export function rewritePlaylist(text, baseUrl, tenantId) {
  const abs = (ref) => relayPath(tenantId, new URL(ref, baseUrl).toString());
  return text
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith('#')) return line.replace(URI_ATTR, (_m, ref) => `URI="${abs(ref)}"`);
      return abs(trimmed);
    })
    .join('\n');
}

let active = 0;

// A fonte limita (429) as chamadas ao endereço que redireciona; o hls.js recarrega a playlist a cada poucos segundos.
// Guardamos o destino final do redirecionamento para consultá-lo direto nas próximas recargas.
const RESOLVED_TTL_MS = 5 * 60 * 1000;
const resolved = new Map();
const rememberResolved = (from, to) => {
  if (resolved.size >= 500) resolved.delete(resolved.keys().next().value);
  resolved.set(from, { url: to, exp: Date.now() + RESOLVED_TTL_MS });
};

const isPlaylist = (finalUrl, contentType) => /mpegurl/i.test(contentType ?? '') || /\.m3u8$/i.test(new URL(finalUrl).pathname);

// Toda fonte com baixo limite de conexões simultâneas (ex.: Xtream "1 conexão por usuário") derruba a sessão se o
// player pedir o mesmo segmento/playlist várias vezes ao mesmo tempo (retries do hls.js sobrepostos). Para a mesma
// URL final, compartilhamos uma única busca na fonte entre todas as requisições concorrentes do navegador, e
// guardamos o resultado por alguns segundos para absorver rajadas de retry sem abrir conexões extras na fonte.
const DEDUPE_SUCCESS_TTL_MS = 8000;
const inFlight = new Map();
function dedupe(key, fetcher) {
  const now = Date.now();
  const existing = inFlight.get(key);
  if (existing && existing.expiresAt > now) return existing.promise;
  const entry = { expiresAt: now + 30_000 };
  entry.promise = fetcher().then(
    (result) => {
      entry.expiresAt = Date.now() + DEDUPE_SUCCESS_TTL_MS;
      return result;
    },
    (err) => {
      inFlight.delete(key);
      throw err;
    },
  );
  if (inFlight.size >= 500) inFlight.delete(inFlight.keys().next().value);
  inFlight.set(key, entry);
  return entry.promise;
}

// Xtream conta "usuário/senha" como uma única linha e derruba a conexão anterior quando uma nova chega: a
// playlist recarrega a cada poucos segundos enquanto um segmento ainda está baixando, e as duas conexões
// simultâneas (undici abre até 20 por host) fazem a fonte encerrar uma delas — o player então vê um erro e
// reconecta, o que se repete a cada recarga. Serializamos todas as buscas na fonte que pertencem à mesma linha.
function lineKeyFor(rawUrl) {
  try {
    const u = new URL(rawUrl);
    const m = u.pathname.match(/\/(?:live|movie|series)\/([^/]+)\/([^/]+)\//);
    return m ? `${u.host}|${m[1]}|${m[2]}` : u.host;
  } catch {
    return rawUrl;
  }
}
const lineLocks = new Map();
function withLineLock(lineKey, fn) {
  const tail = lineLocks.get(lineKey) ?? Promise.resolve();
  const run = tail.then(fn, fn);
  const guarded = run.catch(() => {});
  lineLocks.set(lineKey, guarded);
  guarded.finally(() => { if (lineLocks.get(lineKey) === guarded) lineLocks.delete(lineKey); });
  return run;
}

async function openUpstreamFor(opened, controller) {
  const open = async (url) => {
    try {
      return await safeFetchStream(url, { headers: {}, signal: controller.signal });
    } catch (err) {
      if (err instanceof SourceError) throw new AppError(502, `SOURCE_${err.code}`, err.message);
      throw err;
    }
  };
  const known = resolved.get(opened.url);
  let upstream;
  if (known && known.exp > Date.now()) {
    try {
      upstream = await open(known.url);
      if (upstream.response.status >= 400) {
        await upstream.response.body?.cancel().catch(() => {});
        upstream = null;
      }
    } catch (err) {
      if (controller.signal.aborted) throw err;
      upstream = null;
    }
    if (!upstream) resolved.delete(opened.url);
  }
  upstream ??= await open(opened.url);
  if (upstream.response.status >= 400) {
    await upstream.response.body?.cancel().catch(() => {});
    if (upstream.response.status === 404) throw new AppError(404, 'SOURCE_NOT_FOUND', 'Conteúdo não encontrado na fonte.');
    if (upstream.response.status === 429) throw new AppError(429, 'SOURCE_RATE_LIMITED', 'A fonte limitou temporariamente as requisições. Aguarde alguns segundos.');
    throw new AppError(502, upstream.response.status === 401 || upstream.response.status === 403 ? 'SOURCE_AUTH_FAILED' : 'SOURCE_ERROR', `A fonte respondeu com status ${upstream.response.status}.`);
  }
  return upstream;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Fontes Xtream às vezes recusam/derrubam a conexão por uma fração de segundo bem no instante em que a conexão
// anterior da mesma linha está terminando (a nova chega antes da fonte liberar a "vaga"), devolvendo uma página
// de erro (HTML) no lugar da playlist. Players maduros (ex.: iptv-proxy) escondem essa falha reabrindo a conexão
// sozinhos antes de avisar o cliente — fazemos o mesmo aqui em vez de propagar o erro e deixar o player reconectar.
const PLAYLIST_RETRY_DELAYS_MS = [300, 900];

/** Busca e guarda em memória playlist ou segmento (sem Range): permite compartilhar entre requisições concorrentes. */
async function fetchBuffered(opened, controller) {
  // Trava pela linha inteiro (abertura + leitura do corpo): a fonte só tolera 1 conexão por vez para essa credencial.
  return withLineLock(lineKeyFor(opened.url), async () => {
    for (let attempt = 0; ; attempt += 1) {
      let response;
      let finalUrl;
      try {
        ({ response, url: finalUrl } = await openUpstreamFor(opened, controller));
      } catch (err) {
        const transient = err instanceof AppError && (err.code === 'SOURCE_ERROR' || err.code === 'SOURCE_UNREACHABLE');
        if (transient && attempt < PLAYLIST_RETRY_DELAYS_MS.length && !controller.signal.aborted) {
          logger.warn('Relay falhou ao abrir a fonte, tentando de novo', { tentativa: attempt + 1, erro: err.message });
          await sleep(PLAYLIST_RETRY_DELAYS_MS[attempt]);
          continue;
        }
        throw err;
      }
      const contentType = response.headers.get('content-type') ?? '';
      const playlist = isPlaylist(finalUrl, contentType);
      let body;
      try {
        body = await readLimitedBuffer(response, playlist ? config.relay.playlistMaxBytes : config.relay.segmentMaxBytes);
      } catch (err) {
        if (err instanceof SourceError) throw new AppError(502, `SOURCE_${err.code}`, err.message);
        throw new AppError(502, 'SOURCE_UNREACHABLE', 'Falha ao ler a resposta da fonte.');
      }
      if (!playlist) {
        const headersOut = {};
        for (const name of ['content-type', 'content-length', 'accept-ranges']) {
          const value = response.headers.get(name);
          if (value) headersOut[name] = value;
        }
        return { kind: 'media', headers: headersOut, body, contentType };
      }
      const text = body.toString('utf8');
      if (text.trimStart().startsWith('#EXTM3U')) {
        if (finalUrl !== opened.url) rememberResolved(opened.url, finalUrl);
        return { kind: 'playlist', text, finalUrl };
      }
      if (attempt < PLAYLIST_RETRY_DELAYS_MS.length && !controller.signal.aborted) {
        logger.warn('Relay recebeu playlist inválida da fonte, tentando de novo', { host: new URL(finalUrl).host, tentativa: attempt + 1, amostra: text.slice(0, 500) });
        await sleep(PLAYLIST_RETRY_DELAYS_MS[attempt]);
        continue;
      }
      logger.warn('Relay recebeu playlist inválida da fonte', { host: new URL(finalUrl).host, amostra: text.slice(0, 2000) });
      throw new AppError(502, 'SOURCE_BAD_RESPONSE', 'A fonte não devolveu uma playlist HLS válida.');
    }
  });
}

/** Atende GET /api/relay/:token. */
export async function handleRelay(req, res) {
  const opened = openRelayToken(req.params.token);
  if (!opened) throw new AppError(410, 'RELAY_EXPIRED', 'Este link de reprodução expirou. Recarregue a página.');
  if (active >= config.relay.maxConcurrent) throw new AppError(503, 'RELAY_BUSY', 'Servidor ocupado. Tente novamente em instantes.');

  const rangeHeader = req.headers.range && /^bytes=\d*-\d*(,\s*\d*-\d*)*$/.test(req.headers.range) ? req.headers.range : null;
  const controller = new AbortController();
  res.on('close', () => controller.abort());

  active += 1;
  try {
    // Sem Range (playlists e segmentos ao vivo): compartilha a busca na fonte entre requisições concorrentes.
    if (!rangeHeader) {
      const result = await dedupe(`${opened.tenantId}:${opened.url}`, () => fetchBuffered(opened, controller));
      if (result.kind === 'playlist') {
        res.set({ 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-store' });
        res.send(rewritePlaylist(result.text, result.finalUrl, opened.tenantId));
        return;
      }
      res.set('Cache-Control', 'private, max-age=60');
      res.set('X-Content-Type-Options', 'nosniff');
      for (const [name, value] of Object.entries(result.headers)) res.set(name, value);
      res.end(result.body);
      return;
    }

    // Com Range (busca/seek em VOD): mantém o streaming direto, mas ainda trava pela linha (1 conexão por vez).
    await withLineLock(lineKeyFor(opened.url), async () => {
      const { response, url: finalUrl } = await openUpstreamFor(opened, controller);
      res.status(response.status === 206 ? 206 : 200);
      res.set('Cache-Control', 'private, max-age=60');
      res.set('X-Content-Type-Options', 'nosniff');
      for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
        const value = response.headers.get(name);
        if (value) res.set(name, value);
      }
      if (!response.body) return res.end();
      const contentType = response.headers.get('content-type') ?? '';
      const startedAt = Date.now();
      let bytes = 0;
      const source = Readable.fromWeb(response.body);
      source.on('data', (c) => { bytes += c.length; });
      let outcome = 'fim da fonte';
      try {
        await pipeline(source, res);
      } catch (err) {
        outcome = controller.signal.aborted ? 'navegador fechou' : `erro ${err?.code ?? err?.message}`;
      }
      if (/mp2t|octet/i.test(contentType)) logger.info('Relay de mídia encerrado', { motivo: outcome, segundos: Math.round((Date.now() - startedAt) / 1000), bytes, host: new URL(finalUrl).host });
    });
  } finally {
    active -= 1;
  }
}
