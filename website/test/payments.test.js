// End-to-end checks for checkout, Razorpay verification, webhook and stock handling.
// Razorpay's API is mocked, so no keys or network are needed: `node --test test/`
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pnx-'));
Object.assign(process.env, {
  DB_FILE: path.join(tmp, 'test.db'), UPLOAD_DIR: path.join(tmp, 'uploads'),
  RAZORPAY_KEY_ID: 'rzp_test_x', RAZORPAY_KEY_SECRET: 'secret123', RAZORPAY_WEBHOOK_SECRET: 'whsecret',
  ADMIN_PASSWORD: 'pw', SESSION_SECRET: 'test-secret',
  BREVO_API_KEY: 'brevo-test', EMAIL_FROM: 'shop@example.com', ORDER_ALERT_EMAIL: 'owner@example.com',
});

const realFetch = global.fetch;
let rzCount = 0;
const emails = []; // order alert emails "sent" through the mocked Brevo API
global.fetch = async (url, opts) => {
  if (String(url) === 'https://api.brevo.com/v3/smtp/email') {
    emails.push(JSON.parse(opts.body));
    return new Response('{"messageId":"m"}', { status: 201 });
  }
  if (String(url).startsWith('https://api.razorpay.com/')) {
    const body = JSON.parse(opts.body);
    return new Response(JSON.stringify({ id: `order_test${++rzCount}`, amount: body.amount, currency: 'INR' }), { status: 200 });
  }
  return realFetch(url, opts);
};

const app = require('../server');
const { db } = require('../src/db');
let base; let server;

test.before(() => new Promise((r) => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); }));
test.after(() => { server.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

// Tiny cookie-keeping client
function client() {
  const jar = {};
  return async (p, { form, headers = {}, body, method } = {}) => {
    const res = await realFetch(base + p, {
      method: method || (form ? 'POST' : 'GET'), redirect: 'manual',
      headers: { cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '), ...(form ? { 'content-type': 'application/x-www-form-urlencoded' } : {}), ...headers },
      body: form ? new URLSearchParams(form).toString() : body,
    });
    for (const c of res.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); jar[kv.slice(0, i)] = kv.slice(i + 1); }
    return res;
  };
}

const customer = { name: 'Priya Shah', phone: '9825012345', email: '', address1: '12 Shanti Nagar', city: 'Ahmedabad', state: 'Gujarat', pincode: '380009' };
// A fixed product for these tests, so they don't depend on the starting catalogue.
db.prepare(`INSERT OR IGNORE INTO products (slug, name, category_id, price, mrp, sizes, stock, images)
            VALUES ('test-navratri-blouse', 'Test Navratri Blouse', (SELECT id FROM categories ORDER BY sort LIMIT 1),
                    89900, 129900, '32, 34, 36, 38, 40, 42', 20, '[]')`).run();
const product = () => db.prepare("SELECT * FROM products WHERE slug = 'test-navratri-blouse'").get();

test('online payment: verified signature confirms the order and reduces stock', async () => {
  const c = client();
  const before = product().stock;
  await c('/cart/add', { form: { product_id: product().id, size: '36', qty: '2' } });
  const res = await c('/checkout', { form: { ...customer, payment: 'razorpay' } });
  assert.equal(res.status, 302);
  assert.match(res.headers.get('location'), /^\/pay\/PNX-/);
  const order = db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 1').get();
  assert.equal(order.status, 'awaiting_payment');
  assert.equal(order.total, 2 * 89900); // above ₹1,499 so shipping is free
  assert.equal(product().stock, before, 'stock untouched until paid');

  const pay = await (await c(res.headers.get('location'))).text();
  assert.ok(pay.includes(order.razorpay_order_id));

  const bad = await c('/payment/verify', { form: { razorpay_order_id: order.razorpay_order_id, razorpay_payment_id: 'pay_1', razorpay_signature: 'nope' } });
  assert.match(bad.headers.get('location'), /^\/pay\//);
  assert.equal(db.prepare('SELECT status FROM orders WHERE id = ?').get(order.id).status, 'awaiting_payment');

  const sig = crypto.createHmac('sha256', 'secret123').update(`${order.razorpay_order_id}|pay_1`).digest('hex');
  const ok = await c('/payment/verify', { form: { razorpay_order_id: order.razorpay_order_id, razorpay_payment_id: 'pay_1', razorpay_signature: sig } });
  assert.match(ok.headers.get('location'), /^\/order\//);
  const after = db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id);
  assert.equal(after.status, 'confirmed');
  assert.equal(after.payment_status, 'paid');
  assert.equal(product().stock, before - 2);

  // Replaying the same payment must not take stock twice
  await c('/payment/verify', { form: { razorpay_order_id: order.razorpay_order_id, razorpay_payment_id: 'pay_1', razorpay_signature: sig } });
  assert.equal(product().stock, before - 2);
  assert.equal((await (await c('/cart')).text()).includes('Your cart is empty'), true);

  // Exactly one alert email for this order, even though it was confirmed twice
  const alerts = emails.filter((e) => e.subject.includes(order.order_no));
  assert.equal(alerts.length, 1);
  assert.deepEqual(alerts[0].to, [{ email: 'owner@example.com' }]);
  assert.match(alerts[0].subject, /paid online/);
});

test('webhook confirms a paid order when the customer never returned', async () => {
  const c = client();
  await c('/cart/add', { form: { product_id: product().id, size: '38', qty: '1' } });
  await c('/checkout', { form: { ...customer, payment: 'razorpay' } });
  const order = db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 1').get();
  const payload = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_wh', order_id: order.razorpay_order_id, amount: order.total } } } });
  const forged = await c('/payment/webhook', { method: 'POST', body: payload, headers: { 'content-type': 'application/json', 'x-razorpay-signature': 'bad' } });
  assert.equal(forged.status, 400);
  const sig = crypto.createHmac('sha256', 'whsecret').update(payload).digest('hex');
  const res = await c('/payment/webhook', { method: 'POST', body: payload, headers: { 'content-type': 'application/json', 'x-razorpay-signature': sig } });
  assert.equal(res.status, 200);
  assert.equal(db.prepare('SELECT payment_status FROM orders WHERE id = ?').get(order.id).payment_status, 'paid');
});

test('cash on delivery confirms immediately; tampered cart cookie is ignored', async () => {
  const c = client();
  const fake = Buffer.from(JSON.stringify([{ p: product().id, s: '36', q: 1 }])).toString('base64url');
  const res = await realFetch(base + '/cart', { headers: { cookie: `cart=${fake}.forged` } });
  assert.ok((await res.text()).includes('Your cart is empty'));

  await c('/cart/add', { form: { product_id: product().id, size: '40', qty: '1' } });
  const out = await c('/checkout', { form: { ...customer, phone: '+91 98250-12345', payment: 'cod' } });
  assert.match(out.headers.get('location'), /^\/order\/PNX-.*\?t=/);
  const order = db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 1').get();
  assert.equal(order.status, 'confirmed');
  assert.equal(order.phone, '9825012345');
  // Order page needs the secret link token
  assert.equal((await c(`/order/${order.order_no}`)).status, 404);
  const page = await c(`/order/${order.order_no}?t=${order.access_token}`);
  assert.equal(page.status, 200);

  // Customer can send the order to the shop's WhatsApp, and the shop got an email
  const html = await page.text();
  const wa = html.match(/href="https:\/\/wa\.me\/919969495026\?text=([^"]+)"[^>]*>\s*<svg[^]*?Send my order on WhatsApp/);
  assert.ok(wa, 'WhatsApp order button present');
  const text = decodeURIComponent(wa[1]);
  assert.ok(text.includes(order.order_no) && text.includes('Test Navratri Blouse (Size 40) x 1') && text.includes('Cash on Delivery'));
  const alert = emails.find((e) => e.subject.includes(order.order_no));
  assert.match(alert.subject, /COD/);
  assert.ok(alert.textContent.includes('+91 9825012345') && alert.textContent.includes('/admin/orders/'));
});

test('checkout rejects bad details and sold-out items', async () => {
  const c = client();
  await c('/cart/add', { form: { product_id: product().id, size: '36', qty: '1' } });
  const bad = await c('/checkout', { form: { ...customer, phone: '12345', pincode: '0000', payment: 'cod' } });
  assert.equal(bad.status, 422);
  db.prepare('UPDATE products SET stock = 0 WHERE id = ?').run(product().id);
  const html = await (await c('/cart')).text();
  assert.ok(html.includes('out of stock'));
});

test('admin needs the password and a valid form token', async () => {
  const c = client();
  assert.equal((await c('/admin')).headers.get('location'), '/admin/login');
  assert.equal((await c('/admin/login', { form: { password: 'wrong' } })).status, 401);
  await c('/admin/login', { form: { password: 'pw' } });
  assert.equal((await c('/admin')).status, 200);
  assert.equal((await c('/admin/categories', { form: { name: 'Sarees' } })).status, 403);
});
