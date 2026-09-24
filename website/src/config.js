// All shop settings come from environment variables (see .env.example).
const fs = require('node:fs');
const path = require('node:path');

// Minimal .env loader so the shop runs without extra packages.
const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

const env = (key, fallback = '') => process.env[key] ?? fallback;
const rupees = (key, fallback) => Math.round(Number(env(key, fallback)) * 100);

const config = {
  port: Number(env('PORT', 3000)),
  // Render sets RENDER_EXTERNAL_URL automatically, so BASE_URL is optional there.
  baseUrl: env('BASE_URL', env('RENDER_EXTERNAL_URL', `http://localhost:${env('PORT', 3000)}`)),
  secret: env('SESSION_SECRET', ''),
  adminPassword: env('ADMIN_PASSWORD', ''),
  dbFile: env('DB_FILE', path.join(__dirname, '..', 'data', 'shop.db')),
  uploadDir: env('UPLOAD_DIR', path.join(__dirname, '..', 'uploads')),

  shop: {
    name: env('SHOP_NAME', 'ParasmaniNX'),
    tagline: env('SHOP_TAGLINE', 'Dress materials, kurti fabrics and Navratri wear'),
    phone: env('SHOP_PHONE', '+91 99694 95026'),
    whatsapp: env('SHOP_WHATSAPP', '919969495026'),
    email: env('SHOP_EMAIL', 'contact@parasmaninx.in'),
    address: env('SHOP_ADDRESS', 'Lakshminarayan Temple Wadi, Mahatma Gandhi Rd, opposite Gandhi Market, Mumbai, Maharashtra 400077'),
    hours: env('SHOP_HOURS', 'Mon to Sat, 10:30 AM to 8:30 PM'),
  },

  // Prices are stored in paise (1 rupee = 100 paise) everywhere in the app.
  shipping: {
    fee: rupees('SHIPPING_FEE', 79),
    freeAbove: rupees('FREE_SHIPPING_ABOVE', 1499),
  },
  codEnabled: env('COD_ENABLED', 'true') === 'true',

  razorpay: {
    keyId: env('RAZORPAY_KEY_ID'),
    keySecret: env('RAZORPAY_KEY_SECRET'),
    webhookSecret: env('RAZORPAY_WEBHOOK_SECRET'),
  },

  // New-order email alerts (see src/notify.js). ORDER_ALERT_EMAIL may list several addresses, comma separated.
  alerts: {
    brevoApiKey: env('BREVO_API_KEY'),
    emailFrom: env('EMAIL_FROM'),
    to: env('ORDER_ALERT_EMAIL').split(',').map((s) => s.trim()).filter(Boolean),
  },
};

config.razorpay.enabled = Boolean(config.razorpay.keyId && config.razorpay.keySecret);
config.alerts.emailEnabled = Boolean(config.alerts.brevoApiKey && config.alerts.emailFrom && config.alerts.to.length);

if (!config.secret) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET must be set in production');
  }
  config.secret = 'dev-only-secret-change-me';
}

module.exports = config;
