import mysql from 'mysql2/promise';
import { config } from './env.js';

let pool;

export function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.database,
      connectionLimit: config.db.poolSize,
      waitForConnections: true,
      queueLimit: 200,
      connectTimeout: 10000,
      charset: 'utf8mb4',
      timezone: 'Z',
      namedPlaceholders: false,
      decimalNumbers: true,
      supportBigNumbers: true,
      bigNumberStrings: false,
      multipleStatements: false,
    });
    pool.pool.on('connection', (conn) => {
      conn.query("SET time_zone = '+00:00'");
    });
  }
  return pool;
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

/** Executa uma consulta parametrizada e retorna as linhas. */
export async function query(sql, params = []) {
  const [rows] = await getPool().query(sql, params);
  return rows;
}

export async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] ?? null;
}

/** Executa operações críticas em transação. O callback recebe uma conexão com query/queryOne. */
export async function withTransaction(fn) {
  const conn = await getPool().getConnection();
  const tx = {
    conn,
    query: async (sql, params = []) => (await conn.query(sql, params))[0],
    queryOne: async (sql, params = []) => (await conn.query(sql, params))[0][0] ?? null,
  };
  try {
    await conn.beginTransaction();
    const result = await fn(tx);
    await conn.commit();
    return result;
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      /* conexão já encerrada */
    }
    throw err;
  } finally {
    conn.release();
  }
}

export function parseJson(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export const isDuplicateError = (err) => err?.code === 'ER_DUP_ENTRY';
