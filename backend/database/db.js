const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

let db;
let engine = 'sqlite';

// Detect Postgres (Netlify Neon)
const pgUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;

if (pgUrl) {
  console.log('🐘 Cloud Database Detected (Postgres)');
  const { Pool } = require('pg');
  db = new Pool({
    connectionString: pgUrl,
    ssl: { rejectUnauthorized: false }
  });
  engine = 'postgres';
} else {
  // Fallback to SQLite (Local)
  let sqlite3;
  try {
    sqlite3 = require('sqlite3').verbose();
  } catch (e) {
    console.error('❌ Failed to load sqlite3 binary.');
  }

  if (sqlite3) {
    const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL || process.env.NETLIFY;
    let dbPath = path.resolve(__dirname, '../../users.db');
    if (isProduction) dbPath = path.join('/tmp', 'users.db');

    console.log(`📡 Local Database: ${dbPath}`);
    db = new sqlite3.Database(dbPath);
    engine = 'sqlite';
  }
}

// Convert SQLite '?' to Postgres '$1, $2...'
function translateSql(sql) {
  if (engine !== 'postgres') return sql;
  let index = 1;
  return sql.replace(/\?/g, () => `$${index++}`);
}

const run = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error('DATABASE_NOT_AVAILABLE'));
    const translated = translateSql(sql);

    if (engine === 'postgres') {
      db.query(translated, params)
        .then(res => resolve(res))
        .catch(reject);
    } else {
      db.run(translated, params, function (err) {
        if (err) reject(err);
        else resolve(this);
      });
    }
  });
};

const get = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error('DATABASE_NOT_AVAILABLE'));
    const translated = translateSql(sql);

    if (engine === 'postgres') {
      db.query(translated, params)
        .then(res => resolve(res.rows[0]))
        .catch(reject);
    } else {
      db.get(translated, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    }
  });
};

const all = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error('DATABASE_NOT_AVAILABLE'));
    const translated = translateSql(sql);

    if (engine === 'postgres') {
      db.query(translated, params)
        .then(res => resolve(res.rows))
        .catch(reject);
    } else {
      db.all(translated, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    }
  });
};

// Initialized engine state
async function init() {
  if (!db) return;

  try {
    const idType = engine === 'postgres' ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
    const timestampType = engine === 'postgres' ? 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' : 'DATETIME DEFAULT CURRENT_TIMESTAMP';

    await run(`
            CREATE TABLE IF NOT EXISTS users (
                id ${idType},
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                is_verified INTEGER DEFAULT 0,
                verification_code TEXT,
                is_admin INTEGER DEFAULT 0,
                is_disabled INTEGER DEFAULT 0,
                created_at ${timestampType}
            )
        `);

    await run(`
            CREATE TABLE IF NOT EXISTS user_stocks (
                id ${idType},
                user_id INTEGER NOT NULL,
                symbol TEXT NOT NULL,
                name TEXT,
                added_at ${timestampType},
                UNIQUE(user_id, symbol)
            )
        `);

    // Create Admin
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (adminEmail && adminPassword) {
      const user = await get('SELECT * FROM users WHERE email = ?', [adminEmail]);
      if (!user) {
        const hashed = bcrypt.hashSync(adminPassword, 10);
        await run('INSERT INTO users (email, password, is_verified, is_admin) VALUES (?, ?, 1, 1)', [adminEmail, hashed]);
        console.log(`✅ Production Admin Created: ${adminEmail}`);
      }
    }
  } catch (err) {
    console.error('❌ DB Init Error:', err.message);
  }
}

init();

module.exports = { run, get, all, db, engine };
