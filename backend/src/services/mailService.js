import nodemailer from 'nodemailer';
import { config } from '../config/env.js';
import { query } from '../config/db.js';
import { logger } from '../config/logger.js';
import { getActiveMailConfig } from './emailSettingsService.js';

function buildTransporter(cfg) {
  if (!cfg.smtpHost) return null;
  return nodemailer.createTransport({
    host: cfg.smtpHost,
    port: cfg.smtpPort,
    secure: cfg.smtpSecure,
    auth: cfg.smtpUser ? { user: cfg.smtpUser, pass: cfg.smtpPass } : undefined,
    connectionTimeout: 10000,
    socketTimeout: 15000,
  });
}

const stripHtml = (html) =>
  String(html ?? '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Envia e-mail por SMTP (credenciais configuradas pelo master no painel, com fallback para variáveis de
 * ambiente). Sem SMTP configurado, registra no log/outbox (apenas desenvolvimento e testes); em produção
 * o corpo não é gravado no banco para não persistir tokens.
 */
export async function sendMail({ to, subject, text, html }) {
  const cfg = await getActiveMailConfig();
  const tx = buildTransporter(cfg);
  const bodyText = text || stripHtml(html);
  if (!tx) {
    if (config.isProd) logger.warn('SMTP não configurado: e-mail não enviado.', { subject });
    else logger.info(`[e-mail simulado] para=${to} assunto="${subject}"\n${bodyText}`);
    await query('INSERT INTO email_outbox (to_email, subject, body_text, status) VALUES (?, ?, ?, ?)', [
      to,
      subject,
      config.isProd ? '[conteúdo não armazenado]' : bodyText,
      'logged',
    ]);
    return { sent: false };
  }
  try {
    await tx.sendMail({ from: cfg.from, to, subject, text: bodyText, html: html || undefined });
    await query('INSERT INTO email_outbox (to_email, subject, body_text, status) VALUES (?, ?, ?, ?)', [to, subject, '[enviado]', 'sent']);
    return { sent: true };
  } catch (err) {
    logger.error('Falha ao enviar e-mail', { error: err });
    await query('INSERT INTO email_outbox (to_email, subject, body_text, status, error) VALUES (?, ?, ?, ?, ?)', [
      to,
      subject,
      '[falha]',
      'failed',
      String(err.message).slice(0, 300),
    ]);
    return { sent: false, error: true };
  }
}
