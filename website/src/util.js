const crypto = require('node:crypto');
const config = require('./config');

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 0 });
const money = (paise) => inr.format((paise || 0) / 100);

// SQLite stores UTC; show times in India Standard Time.
const istFormat = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const ist = (sqlTime) => (sqlTime ? istFormat.format(new Date(sqlTime.replace(' ', 'T') + 'Z')) : '');

const slugify = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);

const hmac = (value) => crypto.createHmac('sha256', config.secret).update(value).digest('base64url');

const safeEqual = (a, b) => {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
};

// Signed cookies: value is base64url(JSON) + '.' + HMAC, so customers can't tamper with them.
function setSigned(res, name, data, opts = {}) {
  const body = Buffer.from(JSON.stringify(data)).toString('base64url');
  res.cookie(name, `${body}.${hmac(name + body)}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.baseUrl.startsWith('https://'),
    path: '/',
    ...opts,
  });
}

function getSigned(req, name) {
  const raw = parseCookies(req)[name];
  if (!raw) return null;
  const [body, sig] = raw.split('.');
  if (!body || !sig || !safeEqual(sig, hmac(name + body))) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function parseCookies(req) {
  if (req._cookies) return req._cookies;
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  req._cookies = out;
  return out;
}

// Order numbers look like PNX-240923-4F7K: date + random, easy to read out on the phone.
function newOrderNo() {
  const d = new Date();
  const date = d.toISOString().slice(2, 10).replace(/-/g, '');
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let rand = '';
  for (const b of crypto.randomBytes(4)) rand += alphabet[b % alphabet.length];
  return `PNX-${date}-${rand}`;
}

const token = (bytes = 16) => crypto.randomBytes(bytes).toString('base64url');

const STATUS_LABELS = {
  awaiting_payment: 'Awaiting payment',
  confirmed: 'Confirmed',
  packed: 'Packed',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

const INDIAN_STATES = [
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh',
  'Chhattisgarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep',
  'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Puducherry',
  'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand',
  'West Bengal',
];

module.exports = { money, ist, slugify, hmac, safeEqual, setSigned, getSigned, newOrderNo, token, STATUS_LABELS, INDIAN_STATES };
