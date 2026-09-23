const express = require('express');
const config = require('../config');
const { db, parseProduct } = require('../db');
const { loadCart, addToCart, updateCart, syncCart, clearCart } = require('../cart');
const { createOrder, confirmOrder, getItems, StockError } = require('../orders');
const razorpay = require('../razorpay');
const { safeEqual, INDIAN_STATES } = require('../util');

const router = express.Router();

const q = {
  categories: db.prepare('SELECT * FROM categories ORDER BY sort, name'),
  category: db.prepare('SELECT * FROM categories WHERE slug = ?'),
  featured: db.prepare(`SELECT p.*, c.name AS category_name, c.slug AS category_slug FROM products p JOIN categories c ON c.id = p.category_id
                        WHERE p.active = 1 AND p.featured = 1 ORDER BY p.created_at DESC, p.id DESC LIMIT 8`),
  festive: db.prepare(`SELECT p.*, c.name AS category_name, c.slug AS category_slug FROM products p JOIN categories c ON c.id = p.category_id
                       WHERE p.active = 1 AND c.is_festive = 1 ORDER BY p.featured DESC, p.id DESC LIMIT 8`),
  product: db.prepare(`SELECT p.*, c.name AS category_name, c.slug AS category_slug FROM products p JOIN categories c ON c.id = p.category_id
                       WHERE p.slug = ? AND p.active = 1`),
  related: db.prepare(`SELECT p.*, c.slug AS category_slug FROM products p JOIN categories c ON c.id = p.category_id
                       WHERE p.category_id = ? AND p.id != ? AND p.active = 1 ORDER BY RANDOM() LIMIT 4`),
  orderByNo: db.prepare('SELECT * FROM orders WHERE order_no = ?'),
};

const SORTS = {
  new: 'p.created_at DESC, p.id DESC',
  'price-asc': 'p.price ASC',
  'price-desc': 'p.price DESC',
  name: 'p.name ASC',
};

function listProducts({ categoryId, search, sort, inStock }) {
  const where = ['p.active = 1'];
  const args = [];
  if (categoryId) { where.push('p.category_id = ?'); args.push(categoryId); }
  if (search) {
    where.push("(p.name LIKE ? ESCAPE '\\' OR p.fabric LIKE ? ESCAPE '\\' OR p.color LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\')");
    const like = `%${search.replace(/[\\%_]/g, (m) => '\\' + m)}%`;
    args.push(like, like, like, like);
  }
  if (inStock) where.push('p.stock > 0');
  const order = SORTS[sort] || SORTS.new;
  return db.prepare(`SELECT p.*, c.name AS category_name, c.slug AS category_slug FROM products p JOIN categories c ON c.id = p.category_id
                     WHERE ${where.join(' AND ')} ORDER BY ${order}`).all(...args).map(parseProduct);
}

router.get('/', (req, res) => {
  res.render('home', {
    title: `${config.shop.name} | ${config.shop.tagline}`,
    categories: q.categories.all(),
    featured: q.featured.all().map(parseProduct),
    festive: q.festive.all().map(parseProduct),
  });
});

router.get('/shop', (req, res) => {
  const search = String(req.query.q || '').trim().slice(0, 60);
  const sort = String(req.query.sort || 'new');
  res.render('listing', {
    title: search ? `Search: ${search}` : 'All products',
    heading: search ? `Results for “${search}”` : 'All products',
    intro: '',
    category: null,
    products: listProducts({ search, sort, inStock: req.query.instock === '1' }),
    sort, search, inStock: req.query.instock === '1',
  });
});

router.get('/c/:slug', (req, res, next) => {
  const category = q.category.get(req.params.slug);
  if (!category) return next();
  const sort = String(req.query.sort || 'new');
  res.render('listing', {
    title: category.name,
    heading: category.name,
    intro: category.description,
    category,
    products: listProducts({ categoryId: category.id, sort, inStock: req.query.instock === '1' }),
    sort, search: '', inStock: req.query.instock === '1',
  });
});

router.get('/p/:slug', (req, res, next) => {
  const product = parseProduct(q.product.get(req.params.slug));
  if (!product) return next();
  res.render('product', {
    title: product.name,
    product,
    related: q.related.all(product.category_id, product.id).map(parseProduct),
  });
});

router.post('/cart/add', (req, res) => {
  const product = parseProduct(db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(Number(req.body.product_id)));
  if (!product) return res.redirect('/cart');
  const size = String(req.body.size || '');
  const back = `/p/${product.slug}`;
  if (product.sizeList.length && !product.sizeList.includes(size)) {
    res.flash('error', 'Please choose a size.');
    return res.redirect(back);
  }
  if (product.stock <= 0) {
    res.flash('error', 'Sorry, this item is out of stock.');
    return res.redirect(back);
  }
  const qty = Math.max(1, Math.min(Number.parseInt(req.body.qty, 10) || 1, product.stock));
  addToCart(req, res, product.id, product.sizeList.length ? size : '', qty);
  if (req.body.buy_now) return res.redirect('/checkout');
  res.flash('success', `${product.name} added to your cart.`);
  res.redirect(back);
});

router.post('/cart/update', (req, res) => {
  updateCart(req, res, Number(req.body.index), Number.parseInt(req.body.qty, 10) || 0);
  res.redirect('/cart');
});

router.get('/cart', (req, res) => {
  const cart = loadCart(req);
  if (cart.problems.length) syncCart(res, cart);
  res.render('cart', { title: 'Your cart', cart });
});

router.get('/checkout', (req, res) => {
  const cart = loadCart(req);
  if (!cart.items.length) return res.redirect('/cart');
  if (cart.problems.length) syncCart(res, cart);
  res.render('checkout', {
    title: 'Checkout', cart, form: {}, errors: {},
    states: INDIAN_STATES, razorpayEnabled: config.razorpay.enabled, codEnabled: config.codEnabled,
  });
});

function validateCustomer(body) {
  const clean = (k, max) => String(body[k] || '').trim().replace(/\s+/g, ' ').slice(0, max);
  const form = {
    name: clean('name', 80),
    phone: clean('phone', 20).replace(/[\s-]/g, '').replace(/^(\+91|91|0)(?=\d{10}$)/, ''),
    email: clean('email', 120),
    address1: clean('address1', 200),
    address2: clean('address2', 200),
    city: clean('city', 60),
    state: clean('state', 60),
    pincode: clean('pincode', 6),
    notes: clean('notes', 500),
    payment: clean('payment', 20),
  };
  const errors = {};
  if (form.name.length < 2) errors.name = 'Please enter your full name.';
  if (!/^[6-9]\d{9}$/.test(form.phone)) errors.phone = 'Enter a 10 digit mobile number.';
  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = 'This email doesn’t look right.';
  if (form.address1.length < 5) errors.address1 = 'Please enter your house and street.';
  if (form.city.length < 2) errors.city = 'Please enter your city.';
  if (!INDIAN_STATES.includes(form.state)) errors.state = 'Please choose your state.';
  if (!/^[1-9]\d{5}$/.test(form.pincode)) errors.pincode = 'Enter a 6 digit PIN code.';
  const allowed = [config.razorpay.enabled && 'razorpay', config.codEnabled && 'cod'].filter(Boolean);
  if (!allowed.includes(form.payment)) errors.payment = 'Please choose how you want to pay.';
  return { form, errors };
}

router.post('/checkout', async (req, res, next) => {
  try {
    const cart = loadCart(req);
    if (!cart.items.length) return res.redirect('/cart');
    const { form, errors } = validateCustomer(req.body);
    if (cart.problems.length) {
      syncCart(res, cart);
      errors.cart = cart.problems.join(' ');
    }
    if (Object.keys(errors).length) {
      return res.status(422).render('checkout', {
        title: 'Checkout', cart, form, errors,
        states: INDIAN_STATES, razorpayEnabled: config.razorpay.enabled, codEnabled: config.codEnabled,
      });
    }

    const order = createOrder(cart, form, form.payment);

    if (form.payment === 'cod') {
      try {
        confirmOrder(order.id, { strict: true });
      } catch (err) {
        if (!(err instanceof StockError)) throw err;
        db.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?").run(order.id);
        res.flash('error', err.message);
        return res.redirect('/cart');
      }
      clearCart(res);
      return res.redirect(`/order/${order.order_no}?t=${order.access_token}`);
    }

    const rzOrder = await razorpay.createOrder({
      amount: order.total,
      receipt: order.order_no,
      notes: { order_no: order.order_no },
    });
    db.prepare('UPDATE orders SET razorpay_order_id = ? WHERE id = ?').run(rzOrder.id, order.id);
    res.redirect(`/pay/${order.order_no}?t=${order.access_token}`);
  } catch (err) {
    next(err);
  }
});

// Looks up an order from the URL, only if the secret link token matches.
function orderFromLink(req) {
  const order = q.orderByNo.get(String(req.params.orderNo));
  if (!order || !safeEqual(order.access_token, String(req.query.t || req.body?.t || ''))) return null;
  return order;
}

router.get('/pay/:orderNo', (req, res, next) => {
  const order = orderFromLink(req);
  if (!order) return next();
  if (order.status !== 'awaiting_payment' || !order.razorpay_order_id) {
    return res.redirect(`/order/${order.order_no}?t=${order.access_token}`);
  }
  res.render('pay', { title: 'Complete payment', order, keyId: config.razorpay.keyId });
});

router.post('/payment/verify', (req, res, next) => {
  const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body;
  const order = db.prepare('SELECT * FROM orders WHERE razorpay_order_id = ?').get(String(orderId || ''));
  if (!order) return next();
  const link = `/order/${order.order_no}?t=${order.access_token}`;
  if (!razorpay.verifyPaymentSignature({ orderId, paymentId, signature })) {
    res.flash('error', 'We could not verify the payment. If money was deducted, please contact us with your order number.');
    return res.redirect(`/pay/${order.order_no}?t=${order.access_token}`);
  }
  confirmOrder(order.id, { paymentId: String(paymentId) });
  clearCart(res);
  res.redirect(link);
});

router.get('/order/:orderNo', (req, res, next) => {
  const order = orderFromLink(req);
  if (!order) return next();
  res.render('order', { title: `Order ${order.order_no}`, order, items: getItems.all(order.id) });
});

router.get('/track', (req, res) => res.render('track', { title: 'Track your order', error: null, form: {} }));

router.post('/track', (req, res) => {
  const orderNo = String(req.body.order_no || '').trim().toUpperCase();
  const phone = String(req.body.phone || '').replace(/\D/g, '').slice(-10);
  const order = q.orderByNo.get(orderNo);
  if (!order || !safeEqual(order.phone, phone)) {
    return res.status(404).render('track', {
      title: 'Track your order', form: { order_no: orderNo, phone },
      error: 'We couldn’t find an order with that number and phone. Please check and try again.',
    });
  }
  res.redirect(`/order/${order.order_no}?t=${order.access_token}`);
});

const PAGES = {
  about: 'About us',
  contact: 'Contact us',
  shipping: 'Shipping policy',
  returns: 'Returns and refunds',
  privacy: 'Privacy policy',
  terms: 'Terms and conditions',
};
router.get('/:page', (req, res, next) => {
  const title = PAGES[req.params.page];
  if (!title) return next();
  res.render('pages/info', { title, page: req.params.page, shipping: config.shipping });
});

module.exports = router;
