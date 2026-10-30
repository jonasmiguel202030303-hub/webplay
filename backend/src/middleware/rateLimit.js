import rateLimit from 'express-rate-limit';
import { config } from '../config/env.js';

const handler = (_req, res) => {
  res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Muitas requisições. Aguarde alguns instantes e tente novamente.' } });
};

function make(limit, windowMs, extra = {}) {
  if (config.rate.disabled || config.isTest) return (_req, _res, next) => next();
  return rateLimit({ windowMs, limit, standardHeaders: 'draft-7', legacyHeaders: false, handler, ...extra });
}

export const globalLimiter = () => make(config.rate.global, 60_000);
export const authLimiter = () => make(config.rate.auth, 15 * 60_000);
export const webhookLimiter = () => make(config.rate.webhook, 60_000);
export const sensitiveLimiter = () => make(30, 60_000);
