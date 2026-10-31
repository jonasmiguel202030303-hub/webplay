import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const backendRoot = path.resolve(here, '..', '..');

const bool = (value, fallback) => {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};
const int = (value, fallback) => {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
};
const list = (value) =>
  String(value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development';
  const isProd = nodeEnv === 'production';
  const isTest = nodeEnv === 'test';

  const appUrl = (env.APP_URL || 'http://localhost:5173').replace(/\/+$/, '');
  const cfg = {
    nodeEnv,
    isProd,
    isTest,
    port: int(env.PORT, 4000),
    appUrl,
    backendPublicUrl: (env.BACKEND_PUBLIC_URL || appUrl).replace(/\/+$/, ''),
    corsOrigins: list(env.CORS_ORIGINS || appUrl),
    trustProxy: env.TRUST_PROXY === undefined ? (isProd ? 1 : 0) : int(env.TRUST_PROXY, 0),
    serveFrontend: bool(env.SERVE_FRONTEND, isProd),

    db: {
      host: env.DB_HOST || '127.0.0.1',
      port: int(env.DB_PORT, 3306),
      user: env.DB_USER || 'webplay',
      password: env.DB_PASSWORD || '',
      database: env.DB_NAME || 'webplay',
      poolSize: int(env.DB_POOL_SIZE, 10),
    },

    jwtSecret: env.JWT_SECRET || '',
    staffSessionHours: int(env.STAFF_SESSION_HOURS, 12),
    viewerSessionDays: int(env.VIEWER_SESSION_DAYS, 7),
    cookieSecure: bool(env.COOKIE_SECURE, isProd),
    cookieDomain: env.COOKIE_DOMAIN || undefined,
    bcryptCost: int(env.BCRYPT_COST, isTest ? 4 : 12),

    encryptionKey: env.ENCRYPTION_KEY || '',
    encryptionKeyId: env.ENCRYPTION_KEY_ID || 'k1',
    encryptionKeyPrev: env.ENCRYPTION_KEY_PREV || '',
    encryptionKeyPrevId: env.ENCRYPTION_KEY_PREV_ID || 'k0',

    storageDir: path.resolve(backendRoot, env.STORAGE_DIR || 'storage'),
    uploadMaxBytes: int(env.UPLOAD_MAX_BYTES, 2 * 1024 * 1024),

    mail: {
      from: env.MAIL_FROM || 'WebPlay Brasil <no-reply@webplaybrasil.online>',
      smtpHost: env.SMTP_HOST || '',
      smtpPort: int(env.SMTP_PORT, 587),
      smtpUser: env.SMTP_USER || '',
      smtpPass: env.SMTP_PASS || '',
      smtpSecure: bool(env.SMTP_SECURE, false),
    },

    source: {
      // Painéis IPTV/Xtream são quase sempre http://; o relay serve tudo por https ao navegador.
      allowHttp: bool(env.ALLOW_HTTP_SOURCES, true),
      allowedPrivateHosts: list(env.SSRF_ALLOWED_HOSTS).map((h) => h.toLowerCase()),
      timeoutMs: int(env.SOURCE_TIMEOUT_MS, 10000),
      dnsFallback: list(env.SOURCE_DNS_FALLBACK ?? '8.8.8.8,1.1.1.1'),
      maxBytes: int(env.SOURCE_MAX_BYTES, 25 * 1024 * 1024),
      maxRedirects: int(env.SOURCE_MAX_REDIRECTS, 3),
      hostAllowlist: list(env.SOURCE_HOST_ALLOWLIST).map((h) => h.toLowerCase()),
      maxServersPerTenant: int(env.MAX_SERVERS_PER_TENANT, 5),
    },

    // Retransmissão (relay) de mídia pelo servidor: 'auto' = o player tenta direto e usa o relay se falhar; 'always' = sempre relay
    // (oculta credenciais da fonte do navegador); 'off' = somente reprodução direta.
    relay: {
      mode: ['off', 'auto', 'always'].includes(env.PLAYBACK_RELAY) ? env.PLAYBACK_RELAY : 'auto',
      tokenTtlSeconds: int(env.RELAY_TOKEN_TTL_SECONDS, 6 * 3600),
      playlistMaxBytes: int(env.RELAY_PLAYLIST_MAX_BYTES, 2 * 1024 * 1024),
      segmentMaxBytes: int(env.RELAY_SEGMENT_MAX_BYTES, 20 * 1024 * 1024),
      maxConcurrent: int(env.RELAY_MAX_CONCURRENT, 100),
    },

    trial: {
      maxPerIp: int(env.TRIAL_MAX_PER_IP, isProd ? 2 : 50),
      ipWindowDays: int(env.TRIAL_IP_WINDOW_DAYS, 30),
    },

    mercadoPago: {
      apiBase: (env.MP_API_BASE || 'https://api.mercadopago.com').replace(/\/+$/, ''),
      timeoutMs: int(env.MP_TIMEOUT_MS, 15000),
    },

    // Mural de pôsteres (fundo das telas de login/cadastro) com capas de lançamento da TMDB.
    tmdb: {
      apiKey: env.TMDB_API_KEY || 'e6d7848005cb7cd80f44f733b0aa7c2d',
      cacheTtlMs: int(env.TMDB_CACHE_TTL_MS, 3600_000),
      timeoutMs: int(env.TMDB_TIMEOUT_MS, 8000),
    },

    rate: {
      global: int(env.RATE_LIMIT_GLOBAL, 600),
      auth: int(env.RATE_LIMIT_AUTH, 20),
      webhook: int(env.RATE_LIMIT_WEBHOOK, 300),
      disabled: bool(env.RATE_LIMIT_DISABLED, false),
    },

    logLevel: env.LOG_LEVEL || (isTest ? 'silent' : 'info'),
    appVersion: env.APP_VERSION || '1.0.0',
  };

  return cfg;
}

export function assertProductionConfig(cfg) {
  if (!cfg.isProd) return;
  const problems = [];
  if (cfg.jwtSecret.length < 32) problems.push('JWT_SECRET deve ter ao menos 32 caracteres.');
  if (!cfg.encryptionKey) problems.push('ENCRYPTION_KEY é obrigatório (32 bytes em base64 ou 64 caracteres hex).');
  if (!cfg.db.password) problems.push('DB_PASSWORD é obrigatório.');
  if (!cfg.appUrl.startsWith('https://')) problems.push('APP_URL deve usar HTTPS em produção.');
  if (!cfg.cookieSecure) problems.push('COOKIE_SECURE deve estar ativo em produção.');
  if (problems.length) {
    throw new Error(`Configuração de produção inválida:\n - ${problems.join('\n - ')}`);
  }
}

export const config = loadConfig();
