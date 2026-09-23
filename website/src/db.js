// SQLite database using Node's built-in driver (no native packages to compile).
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');

fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });
const db = new DatabaseSync(config.dbFile);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS categories (
    id          INTEGER PRIMARY KEY,
    slug        TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    image       TEXT NOT NULL DEFAULT '',
    is_festive  INTEGER NOT NULL DEFAULT 0,
    sort        INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS products (
    id          INTEGER PRIMARY KEY,
    slug        TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    category_id INTEGER NOT NULL REFERENCES categories(id),
    price       INTEGER NOT NULL,            -- paise
    mrp         INTEGER NOT NULL DEFAULT 0,  -- paise, 0 = no strike-through price
    fabric      TEXT NOT NULL DEFAULT '',
    color       TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    sizes       TEXT NOT NULL DEFAULT '',    -- comma separated, empty = no size choice
    stock       INTEGER NOT NULL DEFAULT 0,
    images      TEXT NOT NULL DEFAULT '[]',  -- JSON array of URLs
    featured    INTEGER NOT NULL DEFAULT 0,
    active      INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS orders (
    id                  INTEGER PRIMARY KEY,
    order_no            TEXT NOT NULL UNIQUE,
    access_token        TEXT NOT NULL,
    customer_name       TEXT NOT NULL,
    phone               TEXT NOT NULL,
    email               TEXT NOT NULL DEFAULT '',
    address1            TEXT NOT NULL,
    address2            TEXT NOT NULL DEFAULT '',
    city                TEXT NOT NULL,
    state               TEXT NOT NULL,
    pincode             TEXT NOT NULL,
    notes               TEXT NOT NULL DEFAULT '',
    subtotal            INTEGER NOT NULL,
    shipping            INTEGER NOT NULL,
    total               INTEGER NOT NULL,
    payment_method      TEXT NOT NULL,              -- 'cod' | 'razorpay'
    payment_status      TEXT NOT NULL DEFAULT 'pending', -- pending | paid | failed | refunded
    status              TEXT NOT NULL DEFAULT 'awaiting_payment',
    razorpay_order_id   TEXT,
    razorpay_payment_id TEXT,
    tracking_info       TEXT NOT NULL DEFAULT '',
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id         INTEGER PRIMARY KEY,
    order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    name       TEXT NOT NULL,
    size       TEXT NOT NULL DEFAULT '',
    price      INTEGER NOT NULL,
    qty        INTEGER NOT NULL,
    image      TEXT NOT NULL DEFAULT ''
  );

  CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
  CREATE INDEX IF NOT EXISTS idx_orders_razorpay ON orders(razorpay_order_id);
`);

// Runs fn inside a transaction; rolls back if it throws.
function transaction(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

const parseProduct = (p) => p && { ...p, images: JSON.parse(p.images || '[]'), sizeList: p.sizes ? p.sizes.split(',').map((s) => s.trim()).filter(Boolean) : [] };

module.exports = { db, transaction, parseProduct };
