// Cria (ou promove) o usuário master em qualquer ambiente. A senha vem de MASTER_PASSWORD ou de um prompt oculto.
import { query, queryOne, closePool } from '../src/config/db.js';
import { hashPassword } from '../src/services/authService.js';
import { normalizeEmail } from '../src/utils/email.js';
import { passwordField, emailField } from '../src/validators/schemas.js';

const [email, ...nameParts] = process.argv.slice(2);
if (!email) {
  console.error('Uso: npm run create-master -w backend -- email@dominio.com "Nome do Master"');
  console.error('A senha é lida de MASTER_PASSWORD ou solicitada de forma oculta.');
  process.exit(1);
}

function promptHidden(label) {
  return new Promise((resolve) => {
    process.stdout.write(label);
    const stdin = process.stdin;
    let value = '';
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (ch) => {
      for (const c of ch) {
        if (c === '\r' || c === '\n') {
          stdin.setRawMode?.(false);
          stdin.pause();
          stdin.off('data', onData);
          process.stdout.write('\n');
          return resolve(value);
        }
        if (c === '\u0003') process.exit(130);
        if (c === '\u007f' || c === '\b') value = value.slice(0, -1);
        else value += c;
      }
    };
    stdin.on('data', onData);
  });
}

try {
  const parsedEmail = emailField.safeParse(email);
  if (!parsedEmail.success) throw new Error(parsedEmail.error.issues[0].message);
  const password = process.env.MASTER_PASSWORD || (await promptHidden('Senha do master: '));
  const parsedPass = passwordField.safeParse(password);
  if (!parsedPass.success) throw new Error(parsedPass.error.issues[0].message);

  const name = nameParts.join(' ').trim() || 'Administrador Master';
  const normalized = normalizeEmail(parsedEmail.data);
  const hash = await hashPassword(password);
  const existing = await queryOne('SELECT id, role FROM users WHERE email_normalized = ?', [normalized]);
  if (existing) {
    if (existing.role === 'tenant_owner') throw new Error('Este e-mail pertence a um assinante. Use outro e-mail.');
    await query("UPDATE users SET password_hash = ?, role = 'master', status = 'active', token_version = token_version + 1 WHERE id = ?", [hash, existing.id]);
    console.log('Usuário existente atualizado como master (sessões anteriores invalidadas).');
  } else {
    await query("INSERT INTO users (name, email, email_normalized, password_hash, role, status, email_verified_at) VALUES (?, ?, ?, ?, 'master', 'active', UTC_TIMESTAMP(3))", [name, parsedEmail.data, normalized, hash]);
    console.log('Usuário master criado.');
  }
} catch (err) {
  console.error(`Erro: ${err.message}`);
  process.exitCode = 1;
} finally {
  await closePool();
}
