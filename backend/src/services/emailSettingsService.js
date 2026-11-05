import { query, queryOne } from '../config/db.js';
import { config } from '../config/env.js';
import { decryptSecret, encryptSecret, maskSecret } from '../utils/crypto.js';
import { audit } from './auditService.js';

let cache = { at: 0, data: null };
const TTL_MS = 5000;

function invalidate() {
  cache = { at: 0, data: null };
}

async function loadRow() {
  if (cache.data !== null && Date.now() - cache.at < TTL_MS) return cache.data;
  const row = (await queryOne('SELECT * FROM email_settings WHERE id = 1')) ?? false;
  cache = { at: Date.now(), data: row };
  return row;
}

/** Config efetiva usada para enviar e-mails: prioriza o que foi salvo pelo master; cai para variáveis de ambiente. */
export async function getActiveMailConfig() {
  const row = await loadRow();
  if (row?.smtp_host) {
    const fromEmail = row.from_email || config.mail.from.match(/<(.+)>/)?.[1] || row.from_email;
    const from = row.from_email ? (row.from_name ? `${row.from_name} <${row.from_email}>` : row.from_email) : config.mail.from;
    return {
      smtpHost: row.smtp_host,
      smtpPort: row.smtp_port || 587,
      smtpSecure: !!row.smtp_secure,
      smtpUser: row.smtp_user || '',
      smtpPass: row.smtp_pass_enc ? decryptSecret(row.smtp_pass_enc) : '',
      from,
      fromEmail,
    };
  }
  return {
    smtpHost: config.mail.smtpHost,
    smtpPort: config.mail.smtpPort,
    smtpSecure: config.mail.smtpSecure,
    smtpUser: config.mail.smtpUser,
    smtpPass: config.mail.smtpPass,
    from: config.mail.from,
    fromEmail: config.mail.from.match(/<(.+)>/)?.[1] || config.mail.from,
  };
}

export async function getEmailSettingsView() {
  const row = await queryOne('SELECT * FROM email_settings WHERE id = 1');
  return {
    configured: !!row?.smtp_host,
    usingEnvFallback: !row?.smtp_host && !!config.mail.smtpHost,
    smtpHost: row?.smtp_host ?? null,
    smtpPort: row?.smtp_port ?? 587,
    smtpSecure: row ? !!row.smtp_secure : false,
    smtpUser: row?.smtp_user ?? null,
    smtpPassMasked: row?.smtp_pass_enc ? maskSecret(decryptSecret(row.smtp_pass_enc)) : null,
    fromName: row?.from_name ?? null,
    fromEmail: row?.from_email ?? null,
    lastCheckAt: row?.last_check_at ?? null,
    lastCheckOk: row?.last_check_ok === null || row?.last_check_ok === undefined ? null : !!row.last_check_ok,
    lastCheckMessage: row?.last_check_message ?? null,
  };
}

export async function saveEmailSettings(req, { smtpHost, smtpPort, smtpSecure, smtpUser, smtpPass, fromName, fromEmail }) {
  await query('INSERT INTO email_settings (id) VALUES (1) ON DUPLICATE KEY UPDATE id = id');
  const sets = ['updated_by = ?'];
  const params = [req.auth.userId];
  if (smtpHost !== undefined) {
    sets.push('smtp_host = ?');
    params.push(smtpHost || null);
  }
  if (smtpPort !== undefined) {
    sets.push('smtp_port = ?');
    params.push(smtpPort || null);
  }
  if (smtpSecure !== undefined) {
    sets.push('smtp_secure = ?');
    params.push(smtpSecure ? 1 : 0);
  }
  if (smtpUser !== undefined) {
    sets.push('smtp_user = ?');
    params.push(smtpUser || null);
  }
  if (smtpPass) {
    sets.push('smtp_pass_enc = ?', 'last_check_at = NULL', 'last_check_ok = NULL', 'last_check_message = NULL');
    params.push(encryptSecret(smtpPass));
  }
  if (fromName !== undefined) {
    sets.push('from_name = ?');
    params.push(fromName || null);
  }
  if (fromEmail !== undefined) {
    sets.push('from_email = ?');
    params.push(fromEmail || null);
  }
  await query(`UPDATE email_settings SET ${sets.join(', ')} WHERE id = 1`, params);
  invalidate();
  await audit(req, {
    action: 'email.settings_update',
    entityType: 'email_settings',
    entityId: '1',
    metadata: { smtpHostChanged: smtpHost !== undefined, passwordChanged: !!smtpPass },
  });
  return getEmailSettingsView();
}

/** Envia um e-mail de teste com a configuração atual. Importa mailService dinamicamente para evitar import circular. */
export async function testEmailConnection(req, to) {
  invalidate();
  const cfg = await getActiveMailConfig();
  let ok = false;
  let message;
  try {
    if (!cfg.smtpHost) throw new Error('SMTP não configurado.');
    const { sendMail } = await import('./mailService.js');
    const result = await sendMail({
      to: to || req.auth.email,
      subject: 'Teste de configuração de e-mail — WebPlay Brasil',
      text: 'Este é um e-mail de teste enviado pelo painel master do WebPlay Brasil. Se você recebeu esta mensagem, a configuração de SMTP está funcionando corretamente.',
    });
    ok = !!result.sent;
    message = ok ? 'E-mail de teste enviado com sucesso.' : 'Não foi possível enviar: verifique as credenciais SMTP.';
  } catch (err) {
    message = String(err.message || 'Falha ao testar o SMTP.').slice(0, 200);
  }
  await query('INSERT INTO email_settings (id) VALUES (1) ON DUPLICATE KEY UPDATE id = id');
  await query('UPDATE email_settings SET last_check_at = UTC_TIMESTAMP(3), last_check_ok = ?, last_check_message = ? WHERE id = 1', [ok ? 1 : 0, message]);
  await audit(req, { action: 'email.settings_test', entityType: 'email_settings', entityId: '1', metadata: { ok } });
  return { ok, message };
}
