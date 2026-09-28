const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");

const dataDirectory = path.resolve(process.env.DATA_DIR || path.join(__dirname, "..", "data"));
fs.mkdirSync(dataDirectory, { recursive: true });

const database = new Database(path.join(dataDirectory, "by-rukyyah.sqlite"));
database.pragma("journal_mode = WAL");
database.pragma("foreign_keys = ON");

database.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    price INTEGER NOT NULL CHECK (price >= 0),
    category TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    image TEXT NOT NULL DEFAULT '',
    sold_out INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    external_id TEXT UNIQUE,
    customer_id TEXT NOT NULL REFERENCES customers(id),
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_address TEXT NOT NULL,
    customer_city TEXT NOT NULL,
    total INTEGER NOT NULL CHECK (total >= 0),
    status TEXT NOT NULL DEFAULT 'Processing',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id TEXT,
    product_name TEXT NOT NULL,
    unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    image TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS migrations (
    name TEXT PRIMARY KEY,
    completed_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    sess TEXT NOT NULL,
    expire INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders(created_at);
  CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON order_items(order_id);
  CREATE INDEX IF NOT EXISTS sessions_expire_idx ON sessions(expire);
`);

const initialProducts = [
  ["Elegant Kaftan", 35000, "kaftans", "Statement style for special moments.", "images/product-1.jpg"],
  ["Luxury Kaftan", 45000, "kaftans", "Effortless elegance with a premium feel.", "images/product-2.jpg"],
  ["Beauty Collection", 18000, "makeup", "Beauty essentials for your everyday look.", "images/product-3.jpg"],
  ["Signature Jewellery", 12500, "jewellery", "Elegant finishing touches for every outfit.", "images/product-4.jpg"],
  ["Premium Phone Accessory", 8500, "accessories", "Style and protection for your everyday device.", "images/product-5.jpg"],
  ["Signature Accessory", 10000, "accessories", "A polished addition to your collection.", "images/product-6.jpg"]
];

const insertInitialProduct = database.prepare(`
  INSERT OR IGNORE INTO products (id, name, price, category, description, image, sold_out, created_at, updated_at)
  VALUES (@id, @name, @price, @category, @description, @image, 0, @now, @now)
`);

const seedProducts = database.transaction(() => {
  const now = new Date().toISOString();
  for (const [name, price, category, description, image] of initialProducts) {
    insertInitialProduct.run({
      id: require("node:crypto").randomUUID(),
      name,
      price,
      category,
      description,
      image,
      now
    });
  }
});
seedProducts();

module.exports = { database, dataDirectory };