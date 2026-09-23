const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const multer = require('multer');
const config = require('../config');
const { db, parseProduct } = require('../db');
const { setStatus, getItems, getOrderById } = require('../orders');
const { getSigned, setSigned, safeEqual, slugify, token, STATUS_LABELS } = require('../util');

const router = express.Router();
const SESSION_HOURS = 12;

// ---- Login ---------------------------------------------------------------

const failedLogins = new Map(); // ip -> { count, until }

function adminSession(req) {
  const s = getSigned(req, 'admin');
  return s && s.exp > Date.now() ? s : null;
}

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.locals.admin = adminSession(req);
  res.locals.path = req.path;
  res.locals.csrf = res.locals.admin?.csrf || '';
  next();
});

router.get('/login', (req, res) => {
  res.render('admin/login', { title: 'Admin login', error: config.adminPassword ? null : 'Admin is locked. Set ADMIN_PASSWORD on the server first.' });
});

router.post('/login', (req, res) => {
  const ip = req.ip;
  const f = failedLogins.get(ip);
  if (f && f.count >= 5 && f.until > Date.now()) {
    return res.status(429).render('admin/login', { title: 'Admin login', error: 'Too many attempts. Please wait 15 minutes.' });
  }
  if (!config.adminPassword || !safeEqual(String(req.body.password || ''), config.adminPassword)) {
    const count = (f && f.until > Date.now() ? f.count : 0) + 1;
    failedLogins.set(ip, { count, until: Date.now() + 15 * 60 * 1000 });
    return res.status(401).render('admin/login', { title: 'Admin login', error: 'Wrong password.' });
  }
  failedLogins.delete(ip);
  setSigned(res, 'admin', { exp: Date.now() + SESSION_HOURS * 3600 * 1000, csrf: token() }, { sameSite: 'strict', path: '/admin' });
  res.redirect('/admin');
});

router.post('/logout', (req, res) => {
  res.clearCookie('admin', { path: '/admin' });
  res.redirect('/admin/login');
});

router.use((req, res, next) => (res.locals.admin ? next() : res.redirect('/admin/login')));

// Checked after multer so multipart forms have their fields parsed.
const checkCsrf = (req, res, next) => {
  if (req.method === 'POST' && !safeEqual(String(req.body?._csrf || ''), res.locals.csrf)) {
    (req.files || []).forEach((f) => fs.rm(f.path, { force: true }, () => {}));
    return res.status(403).send('Form expired. Go back, refresh the page and try again.');
  }
  next();
};

// ---- Uploads -------------------------------------------------------------

const IMAGE_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const upload = multer({
  storage: multer.diskStorage({
    destination: config.uploadDir,
    filename: (req, file, cb) => cb(null, `${Date.now()}-${token(6)}${IMAGE_TYPES[file.mimetype]}`),
  }),
  limits: { fileSize: 6 * 1024 * 1024, files: 8 },
  fileFilter: (req, file, cb) => cb(null, Boolean(IMAGE_TYPES[file.mimetype])),
});

const removeUpload = (url) => {
  if (!url.startsWith('/uploads/')) return;
  fs.rm(path.join(config.uploadDir, path.basename(url)), { force: true }, () => {});
};

// ---- Dashboard -----------------------------------------------------------

router.get('/', (req, res) => {
  const stats = {
    ordersToday: db.prepare("SELECT COUNT(*) AS n FROM orders WHERE status != 'awaiting_payment' AND date(created_at) = date('now')").get().n,
    toShip: db.prepare("SELECT COUNT(*) AS n FROM orders WHERE status IN ('confirmed', 'packed')").get().n,
    revenue30: db.prepare("SELECT COALESCE(SUM(total), 0) AS n FROM orders WHERE status NOT IN ('awaiting_payment', 'cancelled') AND created_at >= datetime('now', '-30 days')").get().n,
    products: db.prepare('SELECT COUNT(*) AS n FROM products WHERE active = 1').get().n,
  };
  const lowStock = db.prepare('SELECT id, name, stock FROM products WHERE active = 1 AND stock <= 3 ORDER BY stock, name LIMIT 10').all();
  const recent = db.prepare("SELECT * FROM orders WHERE status != 'awaiting_payment' ORDER BY id DESC LIMIT 8").all();
  res.render('admin/dashboard', { title: 'Dashboard', stats, lowStock, recent });
});

// ---- Products ------------------------------------------------------------

const categoriesAll = db.prepare('SELECT * FROM categories ORDER BY sort, name');

router.get('/products', (req, res) => {
  const cat = Number(req.query.category) || 0;
  const products = db.prepare(`SELECT p.*, c.name AS category_name FROM products p JOIN categories c ON c.id = p.category_id
                               ${cat ? 'WHERE p.category_id = ?' : ''} ORDER BY p.id DESC`).all(...(cat ? [cat] : [])).map(parseProduct);
  res.render('admin/products', { title: 'Products', products, categories: categoriesAll.all(), cat });
});

const emptyProduct = { id: null, name: '', category_id: '', price: 0, mrp: 0, fabric: '', color: '', description: '', sizes: '', stock: 1, images: [], featured: 0, active: 1 };

router.get('/products/new', (req, res) => {
  res.render('admin/product-form', { title: 'Add product', product: emptyProduct, categories: categoriesAll.all(), errors: {} });
});

router.get('/products/:id/edit', (req, res, next) => {
  const product = parseProduct(db.prepare('SELECT * FROM products WHERE id = ?').get(Number(req.params.id)));
  if (!product) return next();
  res.render('admin/product-form', { title: `Edit ${product.name}`, product, categories: categoriesAll.all(), errors: {} });
});

const toPaise = (v) => Math.round(Number(String(v || '0').replace(/[,₹\s]/g, '')) * 100);

function readProductForm(body) {
  const product = {
    name: String(body.name || '').trim().slice(0, 150),
    category_id: Number(body.category_id),
    price: toPaise(body.price),
    mrp: toPaise(body.mrp),
    fabric: String(body.fabric || '').trim().slice(0, 100),
    color: String(body.color || '').trim().slice(0, 100),
    description: String(body.description || '').trim().slice(0, 5000),
    sizes: String(body.sizes || '').split(',').map((s) => s.trim()).filter(Boolean).join(', ').slice(0, 200),
    stock: Math.max(0, Number.parseInt(body.stock, 10) || 0),
    featured: body.featured ? 1 : 0,
    active: body.active ? 1 : 0,
  };
  const errors = {};
  if (product.name.length < 2) errors.name = 'Enter a product name.';
  if (!db.prepare('SELECT 1 FROM categories WHERE id = ?').get(product.category_id)) errors.category_id = 'Choose a category.';
  if (!(product.price > 0)) errors.price = 'Enter a selling price above zero.';
  if (product.mrp && product.mrp < product.price) errors.mrp = 'MRP should be more than the selling price, or left empty.';
  if (Number.isNaN(product.mrp)) product.mrp = 0;
  return { product, errors };
}

function uniqueSlug(name, id) {
  const base = slugify(name) || 'product';
  let slug = base;
  for (let n = 2; db.prepare('SELECT 1 FROM products WHERE slug = ? AND id IS NOT ?').get(slug, id); n++) slug = `${base}-${n}`;
  return slug;
}

router.post('/products{/:id}', upload.array('images', 8), checkCsrf, (req, res) => {
  const id = req.params.id ? Number(req.params.id) : null;
  const existing = id && parseProduct(db.prepare('SELECT * FROM products WHERE id = ?').get(id));
  if (id && !existing) return res.redirect('/admin/products');

  const { product, errors } = readProductForm(req.body);
  const uploaded = (req.files || []).map((f) => `/uploads/${f.filename}`);
  const remove = [].concat(req.body.remove_image || []);
  const kept = (existing?.images || []).filter((url) => !remove.includes(url));
  const images = [...kept, ...uploaded];

  if (Object.keys(errors).length) {
    uploaded.forEach(removeUpload);
    return res.status(422).render('admin/product-form', {
      title: id ? 'Edit product' : 'Add product',
      product: { ...emptyProduct, ...existing, ...product, id },
      categories: categoriesAll.all(), errors,
    });
  }

  const cols = [product.name, product.category_id, product.price, product.mrp, product.fabric, product.color,
    product.description, product.sizes, product.stock, JSON.stringify(images), product.featured, product.active];
  if (id) {
    db.prepare(`UPDATE products SET name=?, category_id=?, price=?, mrp=?, fabric=?, color=?, description=?, sizes=?, stock=?,
                images=?, featured=?, active=?, slug=? WHERE id=?`).run(...cols, uniqueSlug(product.name, id), id);
    existing.images.filter((url) => remove.includes(url)).forEach(removeUpload);
  } else {
    db.prepare(`INSERT INTO products (name, category_id, price, mrp, fabric, color, description, sizes, stock, images, featured, active, slug)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(...cols, uniqueSlug(product.name, null));
  }
  res.flash('success', `Saved ${product.name}.`);
  res.redirect('/admin/products');
});

router.post('/products/:id/delete', checkCsrf, (req, res) => {
  const product = parseProduct(db.prepare('SELECT * FROM products WHERE id = ?').get(Number(req.params.id)));
  if (product) {
    db.prepare('DELETE FROM products WHERE id = ?').run(product.id);
    product.images.forEach(removeUpload);
    res.flash('success', `Deleted ${product.name}.`);
  }
  res.redirect('/admin/products');
});

// ---- Categories ----------------------------------------------------------

router.get('/categories', (req, res) => {
  const categories = db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) AS product_count
                                 FROM categories c ORDER BY sort, name`).all();
  res.render('admin/categories', { title: 'Categories', categories });
});

router.post('/categories', checkCsrf, (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 60);
  const description = String(req.body.description || '').trim().slice(0, 500);
  const isFestive = req.body.is_festive ? 1 : 0;
  const sort = Number.parseInt(req.body.sort, 10) || 0;
  const id = Number(req.body.id) || null;
  if (name.length < 2) {
    res.flash('error', 'Category name is too short.');
  } else if (id) {
    db.prepare('UPDATE categories SET name=?, description=?, is_festive=?, sort=? WHERE id=?').run(name, description, isFestive, sort, id);
    res.flash('success', `Updated ${name}.`);
  } else {
    let slug = slugify(name);
    if (db.prepare('SELECT 1 FROM categories WHERE slug = ?').get(slug)) slug += `-${Date.now() % 10000}`;
    db.prepare('INSERT INTO categories (slug, name, description, is_festive, sort) VALUES (?, ?, ?, ?, ?)').run(slug, name, description, isFestive, sort);
    res.flash('success', `Added ${name}.`);
  }
  res.redirect('/admin/categories');
});

// ---- Orders --------------------------------------------------------------

router.get('/orders', (req, res) => {
  const status = STATUS_LABELS[req.query.status] ? req.query.status : '';
  const orders = status
    ? db.prepare('SELECT * FROM orders WHERE status = ? ORDER BY id DESC LIMIT 300').all(status)
    : db.prepare("SELECT * FROM orders WHERE status != 'awaiting_payment' ORDER BY id DESC LIMIT 300").all();
  res.render('admin/orders', { title: 'Orders', orders, status });
});

router.get('/orders/:id', (req, res, next) => {
  const order = getOrderById.get(Number(req.params.id));
  if (!order) return next();
  res.render('admin/order', { title: `Order ${order.order_no}`, order, items: getItems.all(order.id) });
});

router.post('/orders/:id', checkCsrf, (req, res) => {
  const id = Number(req.params.id);
  const order = getOrderById.get(id);
  if (!order) return res.redirect('/admin/orders');
  if (STATUS_LABELS[req.body.status]) {
    setStatus(id, req.body.status, String(req.body.tracking_info || '').trim().slice(0, 300));
  }
  if (['pending', 'paid', 'refunded'].includes(req.body.payment_status)) {
    db.prepare('UPDATE orders SET payment_status = ? WHERE id = ?').run(req.body.payment_status, id);
  }
  res.flash('success', 'Order updated.');
  res.redirect(`/admin/orders/${id}`);
});

module.exports = router;
