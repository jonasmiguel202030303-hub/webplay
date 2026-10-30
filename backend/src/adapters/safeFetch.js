import dns from 'node:dns';
import net from 'node:net';
import { Agent, fetch as undiciFetch } from 'undici';
import { config } from '../config/env.js';

export class SourceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SourceError';
    this.code = code;
  }
}

const blocked = new net.BlockList();
const v4 = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
];
for (const [addr, prefix] of v4) blocked.addSubnet(addr, prefix, 'ipv4');
const v6 = [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['2001:db8::', 32], ['64:ff9b::', 96], ['100::', 64]];
for (const [addr, prefix] of v6) blocked.addSubnet(addr, prefix, 'ipv6');

// Inclui endpoints de metadados de nuvem (169.254.169.254 / fd00:ec2::254) além das redes privadas.
const METADATA_HOSTS = new Set(['metadata.google.internal', 'metadata', 'instance-data']);
const BLOCKED_PORTS = new Set([22, 23, 25, 53, 110, 111, 135, 139, 143, 445, 465, 587, 993, 995, 1433, 1521, 2375, 3306, 3389, 5432, 5900, 6379, 9200, 11211, 27017]);

export function isForbiddenIp(ip) {
  let address = String(ip);
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) address = mapped[1];
  if (address.toLowerCase() === 'fd00:ec2::254') return true;
  const family = net.isIP(address);
  if (!family) return true;
  return blocked.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

const isAllowedPrivate = (hostname, cfg) => cfg.allowedPrivateHosts.includes(String(hostname).toLowerCase().replace(/^\[|\]$/g, ''));

/** Valida e normaliza a URL base da fonte. Lança SourceError com mensagem em português. */
export function validateSourceUrl(raw, cfg = config.source) {
  let url;
  try {
    url = new URL(String(raw).trim());
  } catch {
    throw new SourceError('INVALID_URL', 'URL inválida. Exemplo: https://servidor-exemplo.com:8080');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new SourceError('INVALID_URL', 'Somente URLs http:// ou https:// são permitidas.');
  }
  if (url.protocol === 'http:' && !cfg.allowHttp) {
    throw new SourceError('INSECURE_PROTOCOL', 'Em produção, apenas URLs https:// são aceitas para fontes.');
  }
  if (url.username || url.password) {
    throw new SourceError('INVALID_URL', 'Não inclua usuário e senha na URL. Preencha os campos próprios.');
  }
  const hostname = url.hostname.toLowerCase();
  if (!hostname || METADATA_HOSTS.has(hostname)) throw new SourceError('BLOCKED_ADDRESS', 'Endereço de servidor não permitido.');
  const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;
  if (BLOCKED_PORTS.has(port)) throw new SourceError('BLOCKED_PORT', 'A porta informada não é permitida.');
  if (cfg.hostAllowlist.length && !cfg.hostAllowlist.some((h) => hostname === h || hostname.endsWith(`.${h}`))) {
    throw new SourceError('HOST_NOT_ALLOWED', 'Este servidor não está na lista de domínios autorizados pela plataforma.');
  }
  const literal = hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(literal) && isForbiddenIp(literal) && !isAllowedPrivate(hostname, cfg)) {
    throw new SourceError('BLOCKED_ADDRESS', 'Endereços locais, privados ou reservados não são permitidos.');
  }
  if (hostname === 'localhost' && !isAllowedPrivate(hostname, cfg)) {
    throw new SourceError('BLOCKED_ADDRESS', 'Endereços locais, privados ou reservados não são permitidos.');
  }
  url.hash = '';
  url.search = '';
  return url;
}

/** Remove sufixos comuns colados pelo usuário e devolve a base canônica (sem barra final). */
export function normalizeBaseUrl(raw, cfg = config.source) {
  const url = validateSourceUrl(raw, cfg);
  let p = url.pathname.replace(/\/+$/, '');
  p = p.replace(/\/(player_api|get|panel_api|xmltv)\.php$/i, '');
  return `${url.protocol}//${url.host}${p}`;
}

const toAddresses = (ips, family) => ips.map((address) => ({ address, family }));

/** Alguns provedores bloqueiam o DNS de domínios de IPTV; nesse caso resolve por DNS públicos (SOURCE_DNS_FALLBACK). */
async function resolveWithFallback(hostname, cfg) {
  const servers = cfg.dnsFallback ?? [];
  if (!servers.length) return null;
  const resolver = new dns.promises.Resolver({ timeout: 3000, tries: 1 });
  resolver.setServers(servers);
  const [v4a, v6a] = await Promise.allSettled([resolver.resolve4(hostname), resolver.resolve6(hostname)]);
  const found = [...toAddresses(v4a.status === 'fulfilled' ? v4a.value : [], 4), ...toAddresses(v6a.status === 'fulfilled' ? v6a.value : [], 6)];
  return found.length ? found : null;
}

// Hosts cujo DNS local falhou: durante alguns minutos vão direto ao DNS alternativo (evita esperar o timeout do DNS local a cada conexão).
const fallbackCache = new Map();
const FALLBACK_TTL_MS = 5 * 60_000;

function lookupAll(hostname, cfg, cb) {
  const cached = fallbackCache.get(hostname);
  if (cached && cached.exp > Date.now()) return cb(null, cached.addresses);
  dns.lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
    if (!err || !['ENOTFOUND', 'EAI_AGAIN', 'ESERVFAIL', 'ECONNREFUSED'].includes(err.code)) return cb(err, addresses);
    resolveWithFallback(hostname, cfg).then(
      (found) => {
        if (found) fallbackCache.set(hostname, { addresses: found, exp: Date.now() + FALLBACK_TTL_MS });
        cb(found ? null : err, found);
      },
      () => cb(err),
    );
  });
}

function makeLookup(cfg) {
  return (hostname, options, callback) => {
    const done = typeof options === 'function' ? options : callback;
    const opts = typeof options === 'function' ? {} : options;
    lookupAll(hostname, cfg, (err, addresses) => {
      if (err) return done(err);
      const bad = addresses.find((a) => isForbiddenIp(a.address));
      if (bad && !isAllowedPrivate(hostname, cfg)) {
        return done(new SourceError('BLOCKED_ADDRESS', 'O endereço do servidor aponta para uma rede não permitida.'));
      }
      if (opts.all) return done(null, addresses);
      return done(null, addresses[0].address, addresses[0].family);
    });
  };
}

const agents = new Map();
function agentFor(cfg) {
  const key = JSON.stringify(cfg.allowedPrivateHosts);
  if (!agents.has(key)) {
    agents.set(
      key,
      new Agent({ connect: { lookup: makeLookup(cfg), timeout: cfg.timeoutMs }, headersTimeout: cfg.timeoutMs, bodyTimeout: cfg.timeoutMs, maxRedirections: 0, connections: 20 }),
    );
  }
  return agents.get(key);
}

async function readLimitedBuffer(response, maxBytes) {
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > maxBytes) throw new SourceError('TOO_LARGE', 'A resposta da fonte excede o tamanho máximo permitido.');
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new SourceError('TOO_LARGE', 'A resposta da fonte excede o tamanho máximo permitido.');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

async function readLimited(response, maxBytes) {
  return (await readLimitedBuffer(response, maxBytes)).toString('utf8');
}

/**
 * Abre a conexão com a fonte (GET) validando cada destino, inclusive após redirecionamentos, e resolvendo DNS
 * com checagem de IP. Devolve a resposta ainda não lida e a URL final. Nunca inclui a URL em mensagens de erro.
 */
async function openUpstream(rawUrl, { cfg, headers, signal }) {
  let current = rawUrl;
  for (let hop = 0; hop <= cfg.maxRedirects; hop += 1) {
    const parsed = new URL(current);
    validateSourceUrl(`${parsed.origin}${parsed.pathname}`, cfg);
    let response;
    try {
      response = await undiciFetch(current, {
        method: 'GET',
        redirect: 'manual',
        dispatcher: agentFor(cfg),
        signal,
        headers: { Accept: 'application/json, text/plain, */*', 'User-Agent': 'WebPlayBrasil/1.0', ...headers },
      });
    } catch (err) {
      throw mapNetworkError(err);
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel().catch(() => {});
      if (!location) throw new SourceError('BAD_RESPONSE', 'A fonte retornou um redirecionamento inválido.');
      if (hop === cfg.maxRedirects) throw new SourceError('TOO_MANY_REDIRECTS', 'A fonte redirecionou demais.');
      current = new URL(location, current).toString();
      continue;
    }
    return { response, url: current };
  }
  throw new SourceError('TOO_MANY_REDIRECTS', 'A fonte redirecionou demais.');
}

/** GET seguro com timeout total e limite de bytes. */
export async function safeFetchText(rawUrl, { cfg = config.source, headers = {} } = {}) {
  const { response } = await openUpstream(rawUrl, { cfg, headers, signal: AbortSignal.timeout(cfg.timeoutMs) });
  let body;
  try {
    body = await readLimited(response, cfg.maxBytes);
  } catch (err) {
    if (err instanceof SourceError) throw err;
    throw mapNetworkError(err);
  }
  return { status: response.status, body, headers: response.headers };
}

/** GET seguro em modo streaming (retransmissão de mídia): devolve a resposta sem ler o corpo e a URL final. */
export async function safeFetchStream(rawUrl, { cfg = config.source, headers = {}, signal } = {}) {
  return openUpstream(rawUrl, { cfg, headers: { Accept: '*/*', ...headers }, signal });
}

export { readLimited, readLimitedBuffer };

function mapNetworkError(err) {
  const cause = err?.cause ?? err;
  const root = cause instanceof SourceError ? cause : err instanceof SourceError ? err : null;
  if (root) return root;
  const code = cause?.code || err?.code || '';
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError' || code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'UND_ERR_HEADERS_TIMEOUT' || code === 'UND_ERR_BODY_TIMEOUT') {
    return new SourceError('TIMEOUT', 'O servidor demorou demais para responder (timeout).');
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return new SourceError('UNREACHABLE', 'Não foi possível encontrar o endereço do servidor (DNS).');
  if (code === 'ECONNREFUSED') return new SourceError('UNREACHABLE', 'O servidor recusou a conexão. Verifique a porta.');
  if (/CERT|SSL|TLS/.test(String(code))) return new SourceError('TLS_ERROR', 'Falha de certificado/TLS ao conectar ao servidor.');
  return new SourceError('UNREACHABLE', 'Não foi possível conectar ao servidor.');
}

export async function safeFetchJson(rawUrl, opts) {
  const res = await safeFetchText(rawUrl, opts);
  if (res.status === 401 || res.status === 403) {
    const detail = /expired|expirad/i.test(res.body) ? 'A linha está expirada no servidor.' : /disabled|banned|blocked/i.test(res.body) ? 'A linha está desativada no servidor.' : 'Usuário ou senha inválidos.';
    throw new SourceError('AUTH_FAILED', detail);
  }
  if (res.status >= 500) throw new SourceError('SERVER_ERROR', `O servidor da fonte respondeu com erro (${res.status}).`);
  if (res.status >= 400) throw new SourceError('BAD_RESPONSE', `A fonte respondeu com status ${res.status}.`);
  try {
    return JSON.parse(res.body);
  } catch {
    throw explainNonJson(res.body);
  }
}

/** Painéis XUI/Xtream respondem com HTML quando a linha está desativada/expirada; traduz isso em vez de um erro genérico. */
function explainNonJson(body) {
  const text = String(body)
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (/expired|expirad/i.test(text)) return new SourceError('AUTH_FAILED', 'A linha está expirada no servidor.');
  if (/disabled|banned|blocked|desativad|bloquead/i.test(text)) return new SourceError('AUTH_FAILED', 'A linha está desativada no servidor.');
  if (/invalid|not found|inv[aá]lid/i.test(text) && /line|user|usu[aá]rio/i.test(text)) return new SourceError('AUTH_FAILED', 'Usuário ou senha inválidos.');
  return new SourceError('BAD_RESPONSE', 'A resposta da fonte não é um JSON válido. O servidor pode não ser compatível com a API Xtream Codes.');
}
