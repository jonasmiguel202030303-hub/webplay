import nodemailer from 'nodemailer';
import { config } from '../config/env.js';
import { query } from '../config/db.js';
import { logger } from '../config/logger.js';

let transporter;
function getTransporter() {
  if (!config.mail.smtpHost) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.mail.smtpHost,
      port: config.mail.smtpPort,
      secure: config.mail.smtpSecure,
      auth: config.mail.smtpUser ? { user: config.mail.smtpUser, pass: config.mail.smtpPass } : undefined,
      connectionTimeout: 10000,
      socketTimeout: 15000,
    });
  }
  return transporter;
}

/**
 * Envia e-mail por SMTP. Sem SMTP configurado, registra no log/outbox (apenas desenvolvimento e testes);
 * em produção o corpo não é gravado no banco para não persistir tokens.
 */
export async function sendMail({ to, subject, text }) {
  const tx = getTransporter();
  if (!tx) {
    if (config.isProd) logger.warn('SMTP não configurado: e-mail não enviado.', { subject });
    else logger.info(`[e-mail simulado] para=${to} assunto="${subject}"\n${text}`);
    await query('INSERT INTO email_outbox (to_email, subject, body_text, status) VALUES (?, ?, ?, ?)', [
      to,
      subject,
      config.isProd ? '[conteúdo não armazenado]' : text,
      'logged',
    ]);
    return { sent: false };
  }
  try {
    await tx.sendMail({ from: config.mail.from, to, subject, text });
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
