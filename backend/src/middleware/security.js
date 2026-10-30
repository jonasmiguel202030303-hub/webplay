import helmet from 'helmet';
import cors from 'cors';
import { config } from '../config/env.js';
import { forbidden } from '../utils/errors.js';

export function securityHeaders() {
  const csp = {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      // Ícones e capas vêm das fontes autorizadas de cada assinante.
      imgSrc: ["'self'", 'data:', 'blob:', 'https:', 'http:'],
      mediaSrc: ["'self'", 'blob:', 'https:', 'http:'],
      connectSrc: ["'self'", 'https:', 'http:', ...(config.isProd ? [] : ['ws:', 'wss:'])],
      fontSrc: ["'self'", 'data:'],
      workerSrc: ["'self'", 'blob:'],
      manifestSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
    },
  };
  return helmet({
    contentSecurityPolicy: csp,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginEmbedderPolicy: false,
    hsts: config.isProd ? { maxAge: 15552000, includeSubDomains: true } : false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  });
}

export function corsMiddleware() {
  const allowed = new Set(config.corsOrigins);
  return cors({
    origin(origin, cb) {
      if (!origin || allowed.has(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'X-Requested-With', 'X-Profile-Id'],
    maxAge: 600,
  });
}

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Proteção CSRF para sessões por cookie: exige cabeçalho personalizado (não enviável entre origens sem
 * preflight/CORS) e, quando há Origin, confere se está autorizado.
 */
export function csrfGuard(req, _res, next) {
  if (SAFE.has(req.method)) return next();
  if (req.path.startsWith('/webhooks/')) return next();
  if (req.get('x-requested-with') !== 'webplay') {
    return next(forbidden('Requisição bloqueada por proteção CSRF.', 'CSRF'));
  }
  const origin = req.get('origin');
  if (origin && !config.corsOrigins.includes(origin) && origin !== config.appUrl) {
    return next(forbidden('Origem não autorizada.', 'CSRF'));
  }
  next();
}

export function noStore(_req, res, next) {
  res.set('Cache-Control', 'no-store');
  next();
}
