// The cart lives in a signed cookie as [{ p: productId, s: size, q: qty }].
// Prices always come from the database, never from the browser.
const { db, parseProduct } = require('./db');
const config = require('./config');
const { getSigned, setSigned } = require('./util');

const MAX_LINES = 30;
const MAX_QTY = 20;

function readCart(req) {
  const raw = getSigned(req, 'cart');
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((l) => l && Number.isInteger(l.p) && Number.isInteger(l.q) && l.q > 0)
    .map((l) => ({ p: l.p, s: String(l.s || '').slice(0, 30), q: Math.min(l.q, MAX_QTY) }))
    .slice(0, MAX_LINES);
}

function writeCart(res, lines) {
  setSigned(res, 'cart', lines.slice(0, MAX_LINES), { maxAge: 30 * 24 * 3600 * 1000 });
}

const getProduct = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1');

// Resolves cart lines to products and totals, dropping anything no longer for sale.
function loadCart(req) {
  const items = [];
  const problems = [];
  for (const line of readCart(req)) {
    const product = parseProduct(getProduct.get(line.p));
    if (!product) continue;
    if (product.sizeList.length && !product.sizeList.includes(line.s)) continue;
    let qty = line.q;
    if (product.stock <= 0) {
      problems.push(`${product.name} is out of stock and was removed.`);
      continue;
    }
    if (qty > product.stock) {
      qty = product.stock;
      problems.push(`Only ${product.stock} of ${product.name} left, quantity updated.`);
    }
    items.push({ product, size: line.s, qty, lineTotal: product.price * qty });
  }
  const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);
  const shipping = subtotal === 0 || subtotal >= config.shipping.freeAbove ? 0 : config.shipping.fee;
  const count = items.reduce((sum, i) => sum + i.qty, 0);
  return { items, subtotal, shipping, total: subtotal + shipping, count, problems };
}

function addToCart(req, res, productId, size, qty) {
  const lines = readCart(req);
  const existing = lines.find((l) => l.p === productId && l.s === size);
  if (existing) existing.q = Math.min(existing.q + qty, MAX_QTY);
  else lines.push({ p: productId, s: size, q: Math.min(qty, MAX_QTY) });
  writeCart(res, lines);
}

function updateCart(req, res, index, qty) {
  const lines = readCart(req);
  if (!lines[index]) return;
  if (qty <= 0) lines.splice(index, 1);
  else lines[index].q = Math.min(qty, MAX_QTY);
  writeCart(res, lines);
}

// Rewrites the cookie so it matches what loadCart actually kept.
function syncCart(res, cart) {
  writeCart(res, cart.items.map((i) => ({ p: i.product.id, s: i.size, q: i.qty })));
}

const clearCart = (res) => writeCart(res, []);

module.exports = { loadCart, addToCart, updateCart, syncCart, clearCart, readCart };
