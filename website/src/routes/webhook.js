// Razorpay webhook: confirms paid orders even if the customer closed the browser
// before returning to the shop. Set it up in Razorpay Dashboard > Webhooks with the
// events "payment.captured" and "order.paid", pointing at BASE_URL/payment/webhook.
const { db } = require('../db');
const { confirmOrder } = require('../orders');
const razorpay = require('../razorpay');

module.exports = (req, res) => {
  const raw = req.body instanceof Buffer ? req.body : Buffer.from('');
  if (!razorpay.verifyWebhook(raw, req.get('X-Razorpay-Signature'))) return res.status(400).send('invalid signature');

  let event;
  try {
    event = JSON.parse(raw.toString('utf8'));
  } catch {
    return res.status(400).send('bad json');
  }

  if (event.event === 'payment.captured' || event.event === 'order.paid') {
    const payment = event.payload?.payment?.entity;
    const order = payment && db.prepare('SELECT * FROM orders WHERE razorpay_order_id = ?').get(String(payment.order_id));
    if (order && payment.amount === order.total) confirmOrder(order.id, { paymentId: String(payment.id) });
  }
  res.json({ ok: true });
};
