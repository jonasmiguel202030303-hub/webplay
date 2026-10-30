import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { config, backendRoot } from './config/env.js';
import { logger } from './config/logger.js';
import { metricsMiddleware } from './middleware/metrics.js';
import { securityHeaders, corsMiddleware, csrfGuard } from './middleware/security.js';
import { globalLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { uploadsRoot } from './services/uploadService.js';
import apiRouter from './routes/index.js';
import { asyncHandler } from './utils/errors.js';
import { handleRelay } from './services/relayService.js';

const UPLOAD_PATH = /^\/\d+\/[A-Za-z0-9-]+\.(webp|png)$/;

export function createApp({ frontendDir = path.resolve(backendRoot, '..', 'frontend', 'dist') } = {}) {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);

  app.use(metricsMiddleware(logger));
  app.use(securityHeaders());
  app.use(corsMiddleware());
  app.use(compression());
  app.use(cookieParser());

  // Imagens de marca: somente arquivos gerados pelo servidor (.webp/.png), nunca interpretados como página.
  app.use(
    '/uploads',
    (req, res, next) => {
      if (!UPLOAD_PATH.test(req.path)) return res.status(404).end();
      res.set({ 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'", 'Cache-Control': 'public, max-age=31536000, immutable' });
      next();
    },
    express.static(uploadsRoot(), { index: false, dotfiles: 'ignore', redirect: false }),
    (_req, res) => res.status(404).end(),
  );

  // Retransmissão de mídia: protegida por token opaco com validade; fora do limite global (um vídeo faz centenas de requisições).
  app.get('/api/relay/:token', asyncHandler(handleRelay));

  app.use('/api', globalLimiter(), express.json({ limit: '100kb' }), csrfGuard, apiRouter);
  app.use('/api', notFoundHandler);

  if (config.serveFrontend && fs.existsSync(path.join(frontendDir, 'index.html'))) {
    app.use(
      express.static(frontendDir, {
        index: false,
        setHeaders(res, filePath) {
          if (/[\\/]assets[\\/]/.test(filePath)) res.set('Cache-Control', 'public, max-age=31536000, immutable');
          else res.set('Cache-Control', 'no-cache');
        },
      }),
    );
    app.get(/^\/(?!api\/|uploads\/).*/, (_req, res) => {
      res.set('Cache-Control', 'no-cache');
      res.sendFile(path.join(frontendDir, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
