import sqlite3 from 'sqlite3';
import pg from 'pg';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL || process.env.DATABASE_URL_INTERNAL || '';
const USE_POSTGRES = !!DATABASE_URL;

let db = null;
let pool = null;

if (USE_POSTGRES) {
  pool = new pg.Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
} else {
  const DB_PATH = process.env.DATABASE_PATH || './data/aks_sale.db';
  const dbPath = path.resolve(DB_PATH);
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  db = new sqlite3.Database(dbPath);
}

const toSqlite = (sql) => sql
  .replace(/\$1/g, '?')
  .replace(/\$2/g, '?')
  .replace(/\$3/g, '?')
  .replace(/\$4/g, '?')
  .replace(/\$5/g, '?')
  .replace(/\$6/g, '?')
  .replace(/\$7/g, '?')
  .replace(/\$8/g, '?')
  .replace(/\$9/g, '?')
  .replace(/SERIAL PRIMARY KEY AUTOINCREMENT/, 'INTEGER PRIMARY KEY AUTOINCREMENT')
  .replace(/SERIAL PRIMARY KEY/, 'INTEGER PRIMARY KEY AUTOINCREMENT')
  .replace(/SERIAL/g, 'INTEGER')
  .replace(/CURRENT_TIMESTAMP/g, "CURRENT_TIMESTAMP")
  .replace(/NOW\(\)/g, "CURRENT_TIMESTAMP");

export const initDb = async () => {
  const schema = `
    CREATE TABLE IF NOT EXISTS contacts (
      id ${USE_POSTGRES ? 'SERIAL' : 'INTEGER'} PRIMARY KEY${USE_POSTGRES ? '' : ' AUTOINCREMENT'},
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT,
      company TEXT,
      product_interest TEXT NOT NULL,
      source TEXT DEFAULT 'Website form',
      lead_score INTEGER DEFAULT 0,
      description TEXT,
      unsubscribe_token TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS deals (
      id ${USE_POSTGRES ? 'SERIAL' : 'INTEGER'} PRIMARY KEY${USE_POSTGRES ? '' : ' AUTOINCREMENT'},
      contact_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      product_type TEXT NOT NULL,
      pipeline TEXT NOT NULL DEFAULT 'digital',
      stage TEXT NOT NULL DEFAULT 'New Lead',
      value REAL DEFAULT 0,
      probability INTEGER DEFAULT 10,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id ${USE_POSTGRES ? 'SERIAL' : 'INTEGER'} PRIMARY KEY${USE_POSTGRES ? '' : ' AUTOINCREMENT'},
      deal_id INTEGER,
      contact_id INTEGER,
      title TEXT NOT NULL,
      description TEXT,
      assigned_to TEXT,
      due_date DATETIME,
      status TEXT DEFAULT 'pending',
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS email_logs (
      id ${USE_POSTGRES ? 'SERIAL' : 'INTEGER'} PRIMARY KEY${USE_POSTGRES ? '' : ' AUTOINCREMENT'},
      contact_id INTEGER,
      deal_id INTEGER,
      email_type TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT,
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'sent',
      created_by TEXT DEFAULT 'automation'
    );
    CREATE TABLE IF NOT EXISTS automation_state (
      id ${USE_POSTGRES ? 'SERIAL' : 'INTEGER'} PRIMARY KEY${USE_POSTGRES ? '' : ' AUTOINCREMENT'},
      contact_id INTEGER NOT NULL,
      sequence_type TEXT NOT NULL,
      sequence_length INTEGER NOT NULL,
      current_step INTEGER DEFAULT -1,
      next_email_at DATETIME,
      paused INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS users (
      id ${USE_POSTGRES ? 'SERIAL' : 'INTEGER'} PRIMARY KEY${USE_POSTGRES ? '' : ' AUTOINCREMENT'},
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'admin',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS email_events (
      id ${USE_POSTGRES ? 'SERIAL' : 'INTEGER'} PRIMARY KEY${USE_POSTGRES ? '' : ' AUTOINCREMENT'},
      email_log_id INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS notes (
      id ${USE_POSTGRES ? 'SERIAL' : 'INTEGER'} PRIMARY KEY${USE_POSTGRES ? '' : ' AUTOINCREMENT'},
      contact_id INTEGER NOT NULL,
      deal_id INTEGER,
      user_id INTEGER,
      content TEXT NOT NULL,
      type TEXT DEFAULT 'manual',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `;

  if (USE_POSTGRES) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const stmt of schema.split(';').filter(s => s.trim())) {
        await client.query(stmt + ';');
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } else {
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        const statements = schema.split(';').filter(s => s.trim());
        let count = 0;
        statements.forEach(stmt => {
          db.run(stmt, err => {
            if (err) reject(err);
            count++;
            if (count === statements.length) {
              db.run('CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage)', err2 => {
                if (err2) reject(err2);
                else resolve();
              });
            }
          });
        });
      });
    });
  }
};

export const getDb = () => USE_POSTGRES ? pool : db;

const toPostgres = (sql) => {
  let paramCount = 0;
  return sql.replace(/\?/g, () => {
    paramCount++;
    return `$${paramCount}`;
  });
};

export const run = (sql, params = []) => {
  if (USE_POSTGRES) {
    const pgSql = toPostgres(sql);
    return pool.query(pgSql, params).then(result => ({
      id: result.rows[0]?.id || result.rowCount,
      changes: result.rowCount
    }));
  }
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
};

export const get = (sql, params = []) => {
  if (USE_POSTGRES) {
    const pgSql = toPostgres(sql);
    return pool.query(pgSql, params).then(result => result.rows[0]);
  }
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

export const all = (sql, params = []) => {
  if (USE_POSTGRES) {
    const pgSql = toPostgres(sql);
    return pool.query(pgSql, params).then(result => result.rows);
  }
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

export default { initDb, getDb, run, get, all };
