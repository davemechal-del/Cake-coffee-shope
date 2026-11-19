import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SAMPLES_FILE = path.join(__dirname, 'samples', 'products.json');
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, 'data');
const SQLITE_FILE = path.join(DATA_DIR, 'shop.db');

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@example.com').trim().toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

let mode = process.env.DATABASE_URL ? 'postgres' : 'sqlite';
let pool = null;
let sqliteDb = null;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPasswordHash(password, storedHash) {
  const [salt, hashHex] = String(storedHash || '').split(':');
  if (!salt || !hashHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const storedBuf = Buffer.from(hashHex, 'hex');
  return derived.length === storedBuf.length && crypto.timingSafeEqual(derived, storedBuf);
}

function loadSampleProducts() {
  if (!fs.existsSync(SAMPLES_FILE)) return [];
  const raw = JSON.parse(fs.readFileSync(SAMPLES_FILE, 'utf8'));
  const now = Date.now();
  return Array.isArray(raw)
    ? raw.map((item, idx) => ({
        id: crypto.randomUUID(),
        name: String(item.name || ''),
        price: Number(item.price || 0),
        category: String(item.category || 'Menu'),
        image: String(item.image || ''),
        description: String(item.description || ''),
        createdAt: new Date(now - idx * 1000).toISOString(),
        updatedAt: new Date(now - idx * 1000).toISOString(),
      }))
    : [];
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    price: Number(row.price),
    category: row.category || 'Menu',
    image: row.image || '',
    description: row.description || '',
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

export async function initDb() {
  if (process.env.DATABASE_URL) {
    mode = 'postgres';
    const useSsl =
      process.env.DATABASE_SSL !== 'false' &&
      (process.env.DATABASE_URL.includes('sslmode=require') ||
        process.env.DATABASE_URL.includes('render.com') ||
        process.env.NODE_ENV === 'production');

    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: useSsl ? {rejectUnauthorized: false} : false,
      max: 10,
      connectionTimeoutMillis: 15000,
    });

    pool.on('error', (err) => {
      console.error('Unexpected PostgreSQL pool error:', err);
    });

    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        price DOUBLE PRECISION NOT NULL,
        category TEXT NOT NULL DEFAULT 'Menu',
        image TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS images (
        id TEXT PRIMARY KEY,
        mime_type TEXT NOT NULL,
        data BYTEA NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const countRes = await pool.query('SELECT COUNT(*)::int AS count FROM products');
    if (countRes.rows[0].count === 0) {
      for (const item of loadSampleProducts()) {
        await pool.query(
          `INSERT INTO products (id, name, price, category, image, description, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            item.id,
            item.name,
            item.price,
            item.category,
            item.image,
            item.description,
            item.createdAt,
            item.updatedAt,
          ],
        );
      }
    }

    const adminRes = await pool.query('SELECT id FROM admins WHERE email = $1', [ADMIN_EMAIL]);
    const passwordHash = hashPassword(ADMIN_PASSWORD);
    if (adminRes.rowCount === 0) {
      await pool.query(
        'INSERT INTO admins (id, email, password_hash) VALUES ($1, $2, $3)',
        [crypto.randomUUID(), ADMIN_EMAIL, passwordHash],
      );
    } else if (process.env.ADMIN_PASSWORD) {
      await pool.query('UPDATE admins SET password_hash = $1 WHERE email = $2', [
        passwordHash,
        ADMIN_EMAIL,
      ]);
    }
    return;
  }

  // Local SQLite database (via Node 22 built-in node:sqlite)
  mode = 'sqlite';
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, {recursive: true});
  }
  const {DatabaseSync} = await import('node:sqlite');
  sqliteDb = new DatabaseSync(SQLITE_FILE);

  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      category TEXT NOT NULL DEFAULT 'Menu',
      image TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admins (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS images (
      id TEXT PRIMARY KEY,
      mime_type TEXT NOT NULL,
      data BLOB NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  const countRow = sqliteDb.prepare('SELECT COUNT(*) AS count FROM products').get();
  if (!countRow || countRow.count === 0) {
    const insertProduct = sqliteDb.prepare(`
      INSERT INTO products (id, name, price, category, image, description, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const item of loadSampleProducts()) {
      insertProduct.run(
        item.id,
        item.name,
        item.price,
        item.category,
        item.image,
        item.description,
        item.createdAt,
        item.updatedAt,
      );
    }
  }

  const existingAdmin = sqliteDb
    .prepare('SELECT id FROM admins WHERE email = ?')
    .get(ADMIN_EMAIL);
  const passwordHash = hashPassword(ADMIN_PASSWORD);
  if (!existingAdmin) {
    sqliteDb
      .prepare('INSERT INTO admins (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)')
      .run(crypto.randomUUID(), ADMIN_EMAIL, passwordHash, new Date().toISOString());
  } else if (process.env.ADMIN_PASSWORD) {
    sqliteDb
      .prepare('UPDATE admins SET password_hash = ? WHERE email = ?')
      .run(passwordHash, ADMIN_EMAIL);
  }
}

export function getDatabaseType() {
  return mode;
}

export async function verifyAdminCredentials(email, password) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized || !password) return false;

  if (mode === 'postgres') {
    const res = await pool.query('SELECT password_hash FROM admins WHERE email = $1', [normalized]);
    if (res.rowCount === 0) return false;
    return verifyPasswordHash(password, res.rows[0].password_hash);
  }

  const row = sqliteDb.prepare('SELECT password_hash FROM admins WHERE email = ?').get(normalized);
  if (!row) return false;
  return verifyPasswordHash(password, row.password_hash);
}

export async function saveImage(mimeType, buffer) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  if (mode === 'postgres') {
    await pool.query(
      'INSERT INTO images (id, mime_type, data, created_at) VALUES ($1, $2, $3, $4)',
      [id, mimeType, buffer, now],
    );
  } else {
    sqliteDb
      .prepare('INSERT INTO images (id, mime_type, data, created_at) VALUES (?, ?, ?, ?)')
      .run(id, mimeType, buffer, now);
  }

  return {id, url: `/api/images/${id}`};
}

export async function getImage(id) {
  if (!id) return null;
  if (mode === 'postgres') {
    const res = await pool.query('SELECT mime_type, data FROM images WHERE id = $1', [id]);
    if (res.rowCount === 0) return null;
    return {mimeType: res.rows[0].mime_type, data: Buffer.from(res.rows[0].data)};
  }

  const row = sqliteDb.prepare('SELECT mime_type, data FROM images WHERE id = ?').get(id);
  if (!row) return null;
  return {mimeType: row.mime_type, data: Buffer.from(row.data)};
}

export async function listProducts() {
  if (mode === 'postgres') {
    const res = await pool.query(
      'SELECT id, name, price, category, image, description, created_at, updated_at FROM products ORDER BY created_at DESC',
    );
    return res.rows.map(mapRow);
  }

  const rows = sqliteDb
    .prepare(
      'SELECT id, name, price, category, image, description, created_at, updated_at FROM products ORDER BY created_at DESC',
    )
    .all();
  return rows.map(mapRow);
}

export async function createProduct({name, price, category, image, description}) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  if (mode === 'postgres') {
    const res = await pool.query(
      `INSERT INTO products (id, name, price, category, image, description, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, name, price, category, image, description, created_at, updated_at`,
      [id, name, price, category, image, description, now, now],
    );
    return mapRow(res.rows[0]);
  }

  sqliteDb
    .prepare(
      `INSERT INTO products (id, name, price, category, image, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, name, price, category, image, description, now, now);
  return {id, name, price, category, image, description, createdAt: now, updatedAt: now};
}

export async function updateProduct(id, {name, price, category, image, description}) {
  const now = new Date().toISOString();

  if (mode === 'postgres') {
    const res = await pool.query(
      `UPDATE products
       SET name = $1, price = $2, category = $3, image = $4, description = $5, updated_at = $6
       WHERE id = $7
       RETURNING id, name, price, category, image, description, created_at, updated_at`,
      [name, price, category, image, description, now, id],
    );
    return res.rowCount > 0 ? mapRow(res.rows[0]) : null;
  }

  const result = sqliteDb
    .prepare(
      `UPDATE products
       SET name = ?, price = ?, category = ?, image = ?, description = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(name, price, category, image, description, now, id);
  if (!result.changes) return null;
  const row = sqliteDb
    .prepare(
      'SELECT id, name, price, category, image, description, created_at, updated_at FROM products WHERE id = ?',
    )
    .get(id);
  return mapRow(row);
}

export async function deleteProduct(id) {
  if (mode === 'postgres') {
    const res = await pool.query('DELETE FROM products WHERE id = $1', [id]);
    return res.rowCount > 0;
  }

  const result = sqliteDb.prepare('DELETE FROM products WHERE id = ?').run(id);
  return result.changes > 0;
}
