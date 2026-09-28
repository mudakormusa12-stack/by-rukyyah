require("dotenv").config();

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const session = require("express-session");
const helmet = require("helmet");
const multer = require("multer");
const { rateLimit } = require("express-rate-limit");
const { database, dataDirectory } = require("./backend/database");

const app = express();
const projectRoot = __dirname;
const uploadDirectory = path.join(dataDirectory, "uploads");
const port = Number(process.env.PORT || 8000);
const adminPassword = process.env.ADMIN_PASSWORD;
const sessionSecret = process.env.SESSION_SECRET;

class SQLiteSessionStore extends session.Store {
  constructor() {
    super();
    this.readSession = database.prepare("SELECT sess FROM sessions WHERE sid=? AND expire > ?");
    this.writeSession = database.prepare(`
      INSERT INTO sessions (sid, sess, expire) VALUES (?, ?, ?)
      ON CONFLICT(sid) DO UPDATE SET sess=excluded.sess, expire=excluded.expire
    `);
    this.deleteSession = database.prepare("DELETE FROM sessions WHERE sid=?");
    this.expireSessions = database.prepare("DELETE FROM sessions WHERE expire <= ?");
  }

  get(sid, callback) {
    try {
      const row = this.readSession.get(sid, Date.now());
      callback(null, row ? JSON.parse(row.sess) : null);
    } catch (error) { callback(error); }
  }

  set(sid, value, callback = () => {}) {
    try {
      const expires = value.cookie?.expires ? new Date(value.cookie.expires).getTime() : Date.now() + 8 * 60 * 60 * 1000;
      this.writeSession.run(sid, JSON.stringify(value), expires);
      this.expireSessions.run(Date.now());
      callback(null);
    } catch (error) { callback(error); }
  }

  destroy(sid, callback = () => {}) {
    try { this.deleteSession.run(sid); callback(null); }
    catch (error) { callback(error); }
  }

  touch(sid, value, callback = () => {}) { this.set(sid, value, callback); }
}

if (!adminPassword || !sessionSecret) {
  throw new Error("Set ADMIN_PASSWORD and SESSION_SECRET in the private environment before starting the store.");
}

fs.mkdirSync(uploadDirectory, { recursive: true });
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "12mb" }));
app.use(express.urlencoded({ extended: false, limit: "12mb" }));
app.use(session({
  name: "byrukyyah_admin",
  store: new SQLiteSessionStore(),
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 8 * 60 * 60 * 1000
  }
}));

const imageStorage = multer.diskStorage({
  destination: (_request, _file, callback) => callback(null, uploadDirectory),
  filename: (_request, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(null, `${crypto.randomUUID()}${extension}`);
  }
});
const imageUpload = multer({
  storage: imageStorage,
  limits: { fileSize: 6 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => {
    callback(null, ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.mimetype));
  }
});

const statements = {
  listProducts: database.prepare("SELECT * FROM products ORDER BY created_at DESC"),
  productById: database.prepare("SELECT * FROM products WHERE id = ?"),
  productByName: database.prepare("SELECT * FROM products WHERE name = ? COLLATE NOCASE"),
  insertProduct: database.prepare(`
    INSERT INTO products (id, name, price, category, description, image, sold_out, created_at, updated_at)
    VALUES (@id, @name, @price, @category, @description, @image, @sold_out, @now, @now)
  `),
  updateProduct: database.prepare(`
    UPDATE products SET name=@name, price=@price, category=@category, description=@description,
      image=@image, sold_out=@sold_out, updated_at=@now WHERE id=@id
  `),
  listOrders: database.prepare("SELECT * FROM orders ORDER BY created_at DESC"),
  orderItems: database.prepare("SELECT * FROM order_items WHERE order_id = ?"),
  upsertCustomer: database.prepare(`
    INSERT INTO customers (id, name, phone, address, city, created_at, updated_at)
    VALUES (@id, @name, @phone, @address, @city, @now, @now)
    ON CONFLICT(phone) DO UPDATE SET name=excluded.name, address=excluded.address,
      city=excluded.city, updated_at=excluded.updated_at
  `),
  customerId: database.prepare("SELECT id FROM customers WHERE phone = ?"),
  insertOrder: database.prepare(`
    INSERT INTO orders (id, external_id, customer_id, customer_name, customer_phone,
      customer_address, customer_city, total, status, created_at)
    VALUES (@id, @external_id, @customer_id, @customer_name, @customer_phone,
      @customer_address, @customer_city, @total, @status, @created_at)
  `),
  insertOrderItem: database.prepare(`
    INSERT INTO order_items (id, order_id, product_id, product_name, unit_price, quantity, image)
    VALUES (@id, @order_id, @product_id, @product_name, @unit_price, @quantity, @image)
  `)
};

function publicProduct(row) {
  return {
    id: row.id,
    name: row.name,
    price: row.price,
    category: row.category,
    description: row.description,
    image: row.image,
    soldOut: Boolean(row.sold_out)
  };
}

function requireAdmin(request, response, next) {
  if (request.session && request.session.isAdmin === true) return next();
  if (request.path.endsWith(".html")) return response.redirect("/admin-login.html");
  return response.status(401).json({ error: "Admin authentication required." });
}

function requireCsrf(request, response, next) {
  const supplied = request.get("x-csrf-token") || "";
  const expected = request.session.csrfToken || "";
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  if (!expected || suppliedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)) {
    return response.status(403).json({ error: "Your session has expired. Please sign in again." });
  }
  next();
}

function scryptPassword(value) {
  return crypto.scryptSync(value, sessionSecret, 64);
}

function validText(value, maxLength) {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= maxLength;
}

function normalizeProduct(body, existingImage = "") {
  const price = Number(body.price);
  const category = String(body.category || "");
  const allowedCategories = ["kaftans", "makeup", "jewellery", "accessories"];
  if (!validText(body.name, 120) || !Number.isSafeInteger(price) || price < 0 || !allowedCategories.includes(category)) {
    const error = new Error("Enter a product name, whole-number price, and valid category.");
    error.status = 400;
    throw error;
  }
  return {
    name: body.name.trim(),
    price,
    category,
    description: String(body.description || "").trim().slice(0, 2000),
    image: existingImage,
    sold_out: body.soldOut === "true" || body.soldOut === true || body.availability === "soldOut" ? 1 : 0
  };
}

function removeUploadedImage(imagePath) {
  if (!imagePath || !imagePath.startsWith("/uploads/")) return;
  const filePath = path.join(uploadDirectory, path.basename(imagePath));
  fs.promises.unlink(filePath).catch(() => {});
}

function ordersWithItems() {
  return statements.listOrders.all().map((order) => ({
    id: order.id,
    customerName: order.customer_name,
    customerPhone: order.customer_phone,
    customerAddress: order.customer_address,
    customerCity: order.customer_city,
    total: order.total,
    status: order.status,
    date: order.created_at,
    items: statements.orderItems.all(order.id).map((item) => ({
      productId: item.product_id,
      name: item.product_name,
      price: item.unit_price,
      quantity: item.quantity,
      image: item.image
    }))
  }));
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many sign-in attempts. Please try again later." }
});

app.get("/api/health", (_request, response) => response.json({ status: "ok" }));

app.get("/api/products", (_request, response) => {
  response.json(statements.listProducts.all().map(publicProduct));
});

app.get("/api/products/:id", (request, response) => {
  const row = statements.productById.get(request.params.id);
  if (!row) return response.status(404).json({ error: "Product not found." });
  response.json(publicProduct(row));
});

app.get("/api/admin/session", (request, response) => {
  response.json({ authenticated: request.session.isAdmin === true, csrfToken: request.session.csrfToken || null });
});

app.post("/api/admin/login", loginLimiter, (request, response, next) => {
  const suppliedPassword = typeof request.body.password === "string" ? request.body.password : "";
  const valid = suppliedPassword.length <= 256 && crypto.timingSafeEqual(scryptPassword(suppliedPassword), scryptPassword(adminPassword));
  if (!valid) return response.status(401).json({ error: "Incorrect password." });

  request.session.regenerate((error) => {
    if (error) return next(error);
    request.session.isAdmin = true;
    request.session.csrfToken = crypto.randomBytes(32).toString("hex");
    request.session.save((saveError) => {
      if (saveError) return next(saveError);
      response.json({ authenticated: true, csrfToken: request.session.csrfToken });
    });
  });
});

app.post("/api/admin/logout", requireAdmin, requireCsrf, (request, response, next) => {
  request.session.destroy((error) => {
    if (error) return next(error);
    response.clearCookie("byrukyyah_admin", { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production" });
    response.json({ authenticated: false });
  });
});

app.get("/api/admin/orders", requireAdmin, (_request, response) => response.json(ordersWithItems()));

app.post("/api/admin/products", requireAdmin, requireCsrf, imageUpload.single("image"), (request, response, next) => {
  try {
    if (!request.file) return response.status(400).json({ error: "Upload a product photo from your device." });
    const product = normalizeProduct(request.body, request.file ? `/uploads/${request.file.filename}` : "");
    product.id = crypto.randomUUID();
    product.now = new Date().toISOString();
    statements.insertProduct.run(product);
    response.status(201).json(publicProduct(statements.productById.get(product.id)));
  } catch (error) {
    if (request.file) removeUploadedImage(`/uploads/${request.file.filename}`);
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") return response.status(409).json({ error: "A product with this name already exists." });
    next(error);
  }
});

app.put("/api/admin/products/:id", requireAdmin, requireCsrf, imageUpload.single("image"), (request, response, next) => {
  try {
    const current = statements.productById.get(request.params.id);
    if (!current) return response.status(404).json({ error: "Product not found." });
    const product = normalizeProduct(request.body, request.file ? `/uploads/${request.file.filename}` : current.image);
    product.id = current.id;
    product.now = new Date().toISOString();
    statements.updateProduct.run(product);
    if (request.file) removeUploadedImage(current.image);
    response.json(publicProduct(statements.productById.get(current.id)));
  } catch (error) {
    if (request.file) removeUploadedImage(`/uploads/${request.file.filename}`);
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") return response.status(409).json({ error: "A product with this name already exists." });
    next(error);
  }
});

app.patch("/api/admin/products/:id/availability", requireAdmin, requireCsrf, (request, response) => {
  const current = statements.productById.get(request.params.id);
  if (!current) return response.status(404).json({ error: "Product not found." });
  if (typeof request.body.soldOut !== "boolean") return response.status(400).json({ error: "Availability must be true or false." });
  database.prepare("UPDATE products SET sold_out=?, updated_at=? WHERE id=?").run(Number(request.body.soldOut), new Date().toISOString(), current.id);
  response.json(publicProduct(statements.productById.get(current.id)));
});

app.delete("/api/admin/products/:id", requireAdmin, requireCsrf, (request, response) => {
  const current = statements.productById.get(request.params.id);
  if (!current) return response.status(404).json({ error: "Product not found." });
  database.prepare("DELETE FROM products WHERE id=?").run(current.id);
  removeUploadedImage(current.image);
  response.status(204).end();
});

const createOrder = database.transaction((body) => {
  const fields = ["customerName", "customerPhone", "customerAddress", "customerCity"];
  if (fields.some((field) => !validText(body[field], 500))) {
    const error = new Error("Complete all delivery details before placing the order.");
    error.status = 400;
    throw error;
  }
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 30) {
    const error = new Error("Your bag is empty or contains too many items.");
    error.status = 400;
    throw error;
  }

  const items = body.items.map((cartItem) => {
    const product = cartItem.productId ? statements.productById.get(cartItem.productId) : statements.productByName.get(cartItem.name);
    const quantity = Number(cartItem.quantity);
    if (!product) {
      const error = new Error(`${cartItem.name || "An item"} is no longer available. Refresh the shop and update your bag.`);
      error.status = 409;
      throw error;
    }
    if (product.sold_out) {
      const error = new Error(`${product.name} is sold out and cannot be ordered.`);
      error.status = 409;
      throw error;
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      const error = new Error("A bag quantity is invalid.");
      error.status = 400;
      throw error;
    }
    return { product, quantity };
  });

  const now = new Date().toISOString();
  const customerId = crypto.randomUUID();
  statements.upsertCustomer.run({
    id: customerId,
    name: body.customerName.trim(),
    phone: body.customerPhone.trim(),
    address: body.customerAddress.trim(),
    city: body.customerCity.trim(),
    now
  });
  const actualCustomerId = statements.customerId.get(body.customerPhone.trim()).id;
  const orderId = crypto.randomUUID();
  const total = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  statements.insertOrder.run({
    id: orderId,
    external_id: null,
    customer_id: actualCustomerId,
    customer_name: body.customerName.trim(),
    customer_phone: body.customerPhone.trim(),
    customer_address: body.customerAddress.trim(),
    customer_city: body.customerCity.trim(),
    total,
    status: "Processing",
    created_at: now
  });
  for (const item of items) {
    statements.insertOrderItem.run({
      id: crypto.randomUUID(),
      order_id: orderId,
      product_id: item.product.id,
      product_name: item.product.name,
      unit_price: item.product.price,
      quantity: item.quantity,
      image: item.product.image
    });
  }
  return { id: orderId, total, date: now, status: "Processing", items: items.map(({ product, quantity }) => ({
    productId: product.id,
    name: product.name,
    price: product.price,
    quantity,
    image: product.image
  })) };
});

app.post("/api/orders", (request, response, next) => {
  try {
    response.status(201).json(createOrder(request.body));
  } catch (error) {
    if (error.status) return response.status(error.status).json({ error: error.message });
    next(error);
  }
});

app.post("/api/admin/migrate-local-data", requireAdmin, requireCsrf, (request, response, next) => {
  try {
    const done = database.prepare("SELECT 1 FROM migrations WHERE name='browser-local-storage-v1'").get();
    if (done) return response.json({ migrated: false, reason: "already-migrated" });
    const legacyProducts = request.body.products;
    const legacyOrders = Array.isArray(request.body.orders) ? request.body.orders : [];

    const migrate = database.transaction(() => {
      if (Array.isArray(legacyProducts)) {
        database.prepare("DELETE FROM products").run();
        for (const legacy of legacyProducts) {
          if (!legacy || !validText(legacy.name, 120) || (legacy.name === "Kafta" && Number(legacy.price || 0) === 0)) continue;
          const category = ["kaftans", "makeup", "jewellery", "accessories"].includes(legacy.category) ? legacy.category : "kaftans";
          const image = String(legacy.image || "images/product-1.jpg");
          const product = normalizeProduct({
            name: legacy.name,
            price: Number(legacy.price || 0),
            category,
            description: legacy.description || "",
            soldOut: Boolean(legacy.soldOut)
          }, image);
          const now = new Date().toISOString();
          statements.insertProduct.run({ ...product, id: crypto.randomUUID(), now });
        }
      }

      const insertLegacyOrder = database.prepare(`
        INSERT OR IGNORE INTO orders (id, external_id, customer_id, customer_name, customer_phone,
          customer_address, customer_city, total, status, created_at)
        VALUES (@id, @external_id, @customer_id, @customer_name, @customer_phone,
          @customer_address, @customer_city, @total, @status, @created_at)
      `);
      for (const legacyOrder of legacyOrders) {
        if (!legacyOrder || !Array.isArray(legacyOrder.items)) continue;
        const customerName = String(legacyOrder.customerName || "").trim();
        const customerPhone = String(legacyOrder.customerPhone || "").trim();
        const customerAddress = String(legacyOrder.customerAddress || "").trim();
        const customerCity = String(legacyOrder.customerCity || "").trim();
        if (![customerName, customerPhone, customerAddress, customerCity].every((value) => validText(value, 500))) continue;
        const now = legacyOrder.date || new Date().toISOString();
        const customerId = crypto.randomUUID();
        statements.upsertCustomer.run({ id: customerId, name: customerName, phone: customerPhone, address: customerAddress, city: customerCity, now });
        const actualCustomerId = statements.customerId.get(customerPhone).id;
        const orderId = crypto.randomUUID();
        const externalId = String(legacyOrder.id || orderId);
        const items = legacyOrder.items.map((item) => ({
          productId: null,
          name: String(item.name || "Item").slice(0, 120),
          price: Math.max(0, Number(item.price || 0)),
          quantity: Math.max(1, Number(item.quantity || 1)),
          image: String(item.image || "")
        }));
        const total = Math.max(0, Number(legacyOrder.total || items.reduce((sum, item) => sum + item.price * item.quantity, 0)));
        const result = insertLegacyOrder.run({
          id: orderId,
          external_id: externalId,
          customer_id: actualCustomerId,
          customer_name: customerName,
          customer_phone: customerPhone,
          customer_address: customerAddress,
          customer_city: customerCity,
          total,
          status: String(legacyOrder.status || "Processing"),
          created_at: now
        });
        if (!result.changes) continue;
        for (const item of items) statements.insertOrderItem.run({ id: crypto.randomUUID(), order_id: orderId, product_id: item.productId, product_name: item.name, unit_price: item.price, quantity: item.quantity, image: item.image });
      }
      database.prepare("INSERT INTO migrations(name, completed_at) VALUES('browser-local-storage-v1', ?)").run(new Date().toISOString());
    });
    migrate();
    response.json({ migrated: true, products: statements.listProducts.all().length, orders: statements.listOrders.all().length });
  } catch (error) {
    next(error);
  }
});

app.get("/admin-login.html", (_request, response) => {
  response.set("Cache-Control", "no-store, private");
  response.sendFile(path.join(projectRoot, "admin-login.html"), { cacheControl: false });
});
app.get("/admin.html", requireAdmin, (_request, response) => {
  response.set("Cache-Control", "no-store, private");
  response.sendFile(path.join(projectRoot, "admin.html"), { cacheControl: false });
});
app.get("/orders.html", requireAdmin, (_request, response) => {
  response.set("Cache-Control", "no-store, private");
  response.sendFile(path.join(projectRoot, "orders.html"), { cacheControl: false });
});

app.use("/uploads", express.static(uploadDirectory, { fallthrough: false, dotfiles: "deny" }));
app.use((request, response, next) => {
  if (/^\/(backend|data|node_modules)(\/|$)/.test(request.path) ||
      /^\/[^/]*\.before-backend$/.test(request.path) ||
      /^\/admin-(backup|before|dashboard|layout|safe)/.test(request.path) ||
      /^\/(server\.js|package(?:-lock)?\.json|render\.yaml|\.env(?:\.|$))$/.test(request.path) ||
      request.path.endsWith(".json")) {
    return response.sendStatus(404);
  }
  next();
});
app.use(express.static(projectRoot, { index: "index.html", dotfiles: "deny" }));

app.use((error, _request, response, _next) => {
  console.error(error.message);
  const status = error.status || (error instanceof multer.MulterError ? 400 : 500);
  response.status(status).json({ error: status === 500 ? "The request could not be completed." : error.message });
});

app.listen(port, () => console.log(`BY_RUKAYYAH server listening on port ${port}`));