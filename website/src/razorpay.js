// Thin Razorpay client: create an order, verify the checkout signature and webhooks.
// Docs: https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/
const crypto = require('node:crypto');
const config = require('./config');
const { safeEqual } = require('./util');

async function createOrder({ amount, receipt, notes }) {
  const auth = Buffer.from(`${config.razorpay.keyId}:${config.razorpay.keySecret}`).toString('base64');
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
    body: JSON.stringify({ amount, currency: 'INR', receipt, notes }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Razorpay order failed (${res.status}): ${body?.error?.description || 'unknown error'}`);
  }
  return body;
}

function verifyPaymentSignature({ orderId, paymentId, signature }) {
  const expected = crypto.createHmac('sha256', config.razorpay.keySecret).update(`${orderId}|${paymentId}`).digest('hex');
  return safeEqual(expected, signature || '');
}

function verifyWebhook(rawBody, signature) {
  if (!config.razorpay.webhookSecret) return false;
  const expected = crypto.createHmac('sha256', config.razorpay.webhookSecret).update(rawBody).digest('hex');
  return safeEqual(expected, signature || '');
}

module.exports = { createOrder, verifyPaymentSignature, verifyWebhook };
