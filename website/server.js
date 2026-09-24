const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const config = require('./src/config');
const { money, ist, getSigned, setSigned, STATUS_LABELS } = require('./src/util');
const { readCart } = require('./src/cart');
const { db } = require('./src/db');

// First run: fill the catalogue with sample products so the shop isn't empty.
if (db.prepare('SELECT COUNT(*) AS n FROM categories').get().n === 0) require('./src/seed').seed();

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);
app.disable('x-powered-by');

// Razorpay webhooks need the raw body for signature checks, so mount before the body parsers.
app.post('/payment/webhook', express.raw({ type: 'application/json', limit: '1mb' }), require('./src/routes/webhook'));

app.use(express.urlencoded({ extended: false, limit: '200kb' }));
app.use(express.json({ limit: '200kb' }));

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  });
  next();
});

app.use('/static', express.static(path.join(__dirname, 'public'), { maxAge: '7d' }));
fs.mkdirSync(config.uploadDir, { recursive: true });
app.use('/uploads', express.static(config.uploadDir, { maxAge: '30d' }));
// Browsers, iPhones and search engines ask for these at the site root.
for (const icon of ['favicon.ico', 'apple-touch-icon.png']) {
  app.get(`/${icon}`, (req, res) => res.sendFile(path.join(__dirname, 'public', 'img', icon), { maxAge: '7d' }));
}

// Stylesheets, scripts and the tab icon are cached for 7 days, so their URLs carry a content hash:
// a changed file gets a new URL and returning visitors see the update straight away.
const assetVersion = require('node:crypto').createHash('sha1')
  .update(['css/style.css', 'css/admin.css', 'js/app.js', 'img/favicon.svg'].map((f) => fs.readFileSync(path.join(__dirname, 'public', f))).join(''))
  .digest('hex').slice(0, 10);

// Values every page template can use.
const navCategories = db.prepare('SELECT slug, name, is_festive FROM categories ORDER BY sort, name');
app.use((req, res, next) => {
  res.locals.shop = config.shop;
  res.locals.assetVersion = assetVersion;
  res.locals.money = money;
  res.locals.ist = ist;
  res.locals.STATUS_LABELS = STATUS_LABELS;
  res.locals.path = req.path;
  res.locals.navCategories = navCategories.all();
  res.locals.cartCount = readCart(req).reduce((n, l) => n + l.q, 0);
  res.locals.freeShippingAbove = config.shipping.freeAbove;
  res.locals.flash = getSigned(req, 'flash');
  if (res.locals.flash) res.clearCookie('flash', { path: '/' });
  res.flash = (type, message) => setSigned(res, 'flash', { type, message }, { maxAge: 60 * 1000 });
  next();
});

app.use('/admin', require('./src/routes/admin'));
app.use('/', require('./src/routes/shop'));

app.use((req, res) => res.status(404).render('pages/404', { title: 'Page not found' }));

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).render('pages/error', { title: 'Something went wrong' });
});

if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`${config.shop.name} running at ${config.baseUrl}`);
    console.log(`Online payments: ${config.razorpay.enabled ? 'Razorpay enabled' : 'off (set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET)'}`);
    if (!config.adminPassword) console.log('Admin is locked: set ADMIN_PASSWORD to use /admin');
  });
}

module.exports = app;
