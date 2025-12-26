const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

// Vercel/Serverless platforms have read-only filesystems. 
// We use /tmp as a fallback for the database file in those environments.
const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL;
let dbPath = path.resolve(__dirname, '../../users.db');

if (isProduction) {
  const tmpPath = path.join('/tmp', 'users.db');
  // Copy existing DB if it exists (for initial seeding) though /tmp is ephemeral
  dbPath = tmpPath;
}

console.log(`📡 Database attempt: ${dbPath} `);
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Database opening error:', err.message);
  } else {
    console.log('✅ Connected to the SQLite database.');
  }
});

// Helper to run queries with promises
const run = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};

const get = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const all = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

// Initialize sequence
async function init() {
  try {
    await run(`
            CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  is_verified INTEGER DEFAULT 0,
  verification_code TEXT,
  is_admin INTEGER DEFAULT 0,
  is_disabled INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
  `);

    await run(`
            CREATE TABLE IF NOT EXISTS user_stocks(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    symbol TEXT NOT NULL,
    name TEXT,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id),
    UNIQUE(user_id, symbol)
  )
  `);

    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;
    const existingAdmin = await get('SELECT * FROM users WHERE email = ?', [adminEmail]);

    if (!existingAdmin) {
      const hashedPassword = bcrypt.hashSync(adminPassword, 10);
      await run(`
                INSERT INTO users(email, password, is_verified, is_admin)
VALUES(?, ?, 1, 1)
            `, [adminEmail, hashedPassword]);
      console.log(`Admin account created: ${adminEmail} `);
    }
  } catch (err) {
    console.error('DB Init Error:', err);
  }
}

init();

module.exports = { run, get, all };
