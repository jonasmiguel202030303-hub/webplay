import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';

const ISSUER = 'webplaybrasil';

export const STAFF_COOKIE = 'wp_staff';
export const VIEWER_COOKIE = 'wp_viewer';

export function signStaffToken(user) {
  return jwt.sign({ role: user.role, tv: user.token_version }, config.jwtSecret, {
    algorithm: 'HS256',
    issuer: ISSUER,
    audience: 'staff',
    subject: String(user.id),
    expiresIn: `${config.staffSessionHours}h`,
  });
}

export function signViewerToken({ viewerId, tenantId, tokenVersion, jti }) {
  return jwt.sign({ tid: tenantId, tv: tokenVersion }, config.jwtSecret, {
    algorithm: 'HS256',
    issuer: ISSUER,
    audience: 'viewer',
    subject: String(viewerId),
    jwtid: jti,
    expiresIn: `${config.viewerSessionDays}d`,
  });
}

export function verifyToken(token, audience) {
  try {
    return jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'], issuer: ISSUER, audience });
  } catch {
    return null;
  }
}

export function cookieOptions(maxAgeMs) {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    path: '/',
    domain: config.cookieDomain,
    maxAge: maxAgeMs,
  };
}

export const staffCookieMaxAge = () => config.staffSessionHours * 3600 * 1000;
export const viewerCookieMaxAge = () => config.viewerSessionDays * 86400 * 1000;
