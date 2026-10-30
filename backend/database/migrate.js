import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { config } from '../src/config/env.js';
import { defaultPlatformSettings, initialDocuments, INITIAL_TERMS_VERSION } from './defaults.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(here, 'migrations');

export async function runMigrations({ log = console.log } = {}) {
  const conn = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    multipleStatements: true,
    charset: 'utf8mb4',
  });
  try {
    await conn.query("SET time_zone = '+00:00'");
    await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(100) NOT NULL PRIMARY KEY,
      applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    const [applied] = await conn.query('SELECT version FROM schema_migrations');
    const done = new Set(applied.map((r) => r.version));
    const files = (await fs.readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();

    let count = 0;
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8');
      log(`Aplicando migração ${file}...`);
      await conn.query(sql);
      await conn.query('INSERT INTO schema_migrations (version) VALUES (?)', [file]);
      count += 1;
    }

    // Dados padrão da plataforma (idempotente).
    for (const [key, value] of Object.entries(defaultPlatformSettings)) {
      await conn.query('INSERT IGNORE INTO platform_settings (setting_key, setting_value) VALUES (?, ?)', [key, JSON.stringify(value)]);
    }
    for (const doc of initialDocuments) {
      const [rows] = await conn.query('SELECT id FROM terms_versions WHERE doc_type = ? LIMIT 1', [doc.doc_type]);
      if (rows.length === 0) {
        await conn.query(
          'INSERT INTO terms_versions (doc_type, version, title, content, is_current) VALUES (?, ?, ?, ?, 1)',
          [doc.doc_type, INITIAL_TERMS_VERSION, doc.title, doc.content],
        );
      }
    }
    log(count ? `${count} migração(ões) aplicada(s).` : 'Banco já está atualizado.');
    return count;
  } finally {
    await conn.end();
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runMigrations().catch((err) => {
    console.error('Falha na migração:', err.message);
    process.exitCode = 1;
  });
}
