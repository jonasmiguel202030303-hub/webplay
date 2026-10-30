// Dados de DESENVOLVIMENTO. Recusa execução em produção. Idempotente: não duplica registros existentes.
import { config } from '../../src/config/env.js';
import { query, queryOne, withTransaction, closePool } from '../../src/config/db.js';
import { hashPassword } from '../../src/services/authService.js';
import { startTrial } from '../../src/services/subscriptionService.js';
import { encryptSecret } from '../../src/utils/crypto.js';
import { normalizeEmail } from '../../src/utils/email.js';

if (config.isProd) {
  console.error('O seed de desenvolvimento não pode ser executado em produção.');
  process.exit(1);
}

const password = process.env.SEED_PASSWORD;
if (!password || password.length < 10) {
  console.error('Defina SEED_PASSWORD (mín. 10 caracteres) no backend/.env.');
  process.exit(1);
}
const MASTER_EMAIL = process.env.SEED_MASTER_EMAIL || 'santosjhonatan5@gmail.com';
const MOCK_URL = process.env.SEED_SOURCE_URL || 'http://127.0.0.1:4010';

async function ensureUser({ name, email, role }) {
  const existing = await queryOne('SELECT id FROM users WHERE email_normalized = ?', [normalizeEmail(email)]);
  if (existing) return { id: existing.id, created: false };
  const r = await query(
    "INSERT INTO users (name, email, email_normalized, password_hash, role, status, email_verified_at) VALUES (?, ?, ?, ?, ?, 'active', UTC_TIMESTAMP(3))",
    [name, email, normalizeEmail(email), await hashPassword(password), role],
  );
  return { id: r.insertId, created: true };
}

try {
  const master = await ensureUser({ name: 'Administrador Master', email: MASTER_EMAIL, role: 'master' });
  await ensureUser({ name: 'Administrador Teste', email: 'admin@webplay.test', role: 'admin' });
  const owner = await ensureUser({ name: 'Cliente Teste', email: 'cliente@webplay.test', role: 'tenant_owner' });

  let tenantId;
  if (owner.created) {
    tenantId = await withTransaction(async (tx) => {
      const t = await tx.query('INSERT INTO tenants (owner_user_id, slug) VALUES (?, ?)', [owner.id, 'demo']);
      await tx.query('INSERT INTO tenant_branding (tenant_id, display_name, short_name, banner_title, banner_subtitle, welcome_text) VALUES (?, ?, ?, ?, ?, ?)', [
        t.insertId, 'Demo Play', 'Demo', 'Bem-vindo ao Demo Play', 'Ambiente de demonstração (desenvolvimento).', 'Escolha um perfil e aproveite.',
      ]);
      await tx.query('INSERT INTO tenant_settings (tenant_id) VALUES (?)', [t.insertId]);
      const user = await tx.queryOne('SELECT email_normalized FROM users WHERE id = ?', [owner.id]);
      await startTrial(tx, { tenantId: t.insertId, userId: owner.id, emailNormalized: user.email_normalized, ipHash: null });
      return t.insertId;
    });
  } else {
    tenantId = (await queryOne('SELECT id FROM tenants WHERE owner_user_id = ?', [owner.id]))?.id;
  }

  if (tenantId) {
    const viewer = await queryOne('SELECT id FROM viewer_accounts WHERE tenant_id = ? AND email_normalized = ?', [tenantId, 'espectador@webplay.test']);
    if (!viewer) {
      await withTransaction(async (tx) => {
        const v = await tx.query('INSERT INTO viewer_accounts (tenant_id, name, email, email_normalized, password_hash) VALUES (?, ?, ?, ?, ?)', [
          tenantId, 'Espectador Teste', 'espectador@webplay.test', 'espectador@webplay.test', await hashPassword(password),
        ]);
        await tx.query('INSERT INTO viewer_profiles (tenant_id, viewer_id, name, avatar) VALUES (?, ?, ?, ?)', [tenantId, v.insertId, 'Espectador', 'violet']);
      });
    }
    const server = await queryOne('SELECT id FROM source_servers WHERE tenant_id = ? AND deleted_at IS NULL LIMIT 1', [tenantId]);
    if (!server) {
      await query(
        "INSERT INTO source_servers (tenant_id, name, base_url, username_enc, password_enc, is_default, status, status_message) VALUES (?, 'Fonte de teste (mock)', ?, ?, ?, 1, 'unknown', 'Inicie a fonte mock: npm run mock-source')",
        [tenantId, MOCK_URL, encryptSecret('demo'), encryptSecret('demo')],
      );
    }
  }

  console.log('Seed concluído.');
  console.log(`  Master:      ${MASTER_EMAIL}${master.created ? ' (criado)' : ' (já existia)'}`);
  console.log('  Admin:       admin@webplay.test');
  console.log('  Assinante:   cliente@webplay.test  (página /demo)');
  console.log('  Espectador:  espectador@webplay.test (página /demo)');
  console.log('  Senha dos usuários de teste: valor de SEED_PASSWORD');
} finally {
  await closePool();
}
