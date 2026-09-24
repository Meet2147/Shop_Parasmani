// New-order alerts for the shop owner.
// Email goes through Brevo's free transactional email API (https://www.brevo.com):
// set BREVO_API_KEY, ORDER_ALERT_EMAIL and EMAIL_FROM (a sender verified in Brevo).
// Without those settings alerts are skipped and orders still work normally.
const config = require('./config');
const { money } = require('./util');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const paymentLabel = (order) => (order.payment_method === 'cod'
  ? 'Cash on Delivery'
  : `Online (Razorpay)${order.payment_status === 'paid' ? ', paid' : ''}`);

const addressLines = (order) => [
  order.address1, order.address2, `${order.city}, ${order.state} ${order.pincode}`,
].filter(Boolean);

function orderEmail(order, items) {
  const adminLink = `${config.baseUrl}/admin/orders/${order.id}`;
  const itemLines = items.map((i) => `${i.name}${i.size ? ` (Size ${i.size})` : ''} x ${i.qty} = ${money(i.price * i.qty)}`);
  const subject = `New order ${order.order_no}: ${money(order.total)}, ${order.payment_method === 'cod' ? 'COD' : 'paid online'}`;

  const text = [
    `New order ${order.order_no}`,
    '',
    ...itemLines,
    `Shipping: ${order.shipping ? money(order.shipping) : 'Free'}`,
    `Total: ${money(order.total)}`,
    `Payment: ${paymentLabel(order)}`,
    '',
    `Customer: ${order.customer_name}, +91 ${order.phone}${order.email ? `, ${order.email}` : ''}`,
    ...addressLines(order),
    order.notes ? `Note: ${order.notes}` : '',
    '',
    `Open in admin: ${adminLink}`,
  ].filter((l) => l !== null).join('\n');

  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#222;max-width:560px">
  <h2 style="margin:0 0 6px">New order ${esc(order.order_no)}</h2>
  <p style="margin:0 0 14px;font-size:18px"><strong>${esc(money(order.total))}</strong> · ${esc(paymentLabel(order))}</p>
  <table style="border-collapse:collapse;width:100%">
    ${items.map((i) => `<tr><td style="padding:6px 0;border-bottom:1px solid #eee">${esc(i.name)}${i.size ? ` <span style="color:#777">(Size ${esc(i.size)})</span>` : ''} × ${i.qty}</td>
      <td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right">${esc(money(i.price * i.qty))}</td></tr>`).join('')}
    <tr><td style="padding:6px 0">Shipping</td><td style="text-align:right">${order.shipping ? esc(money(order.shipping)) : 'Free'}</td></tr>
  </table>
  <h3 style="margin:18px 0 4px">Customer</h3>
  <p style="margin:0">${esc(order.customer_name)}<br>
    <a href="tel:+91${esc(order.phone)}">+91 ${esc(order.phone)}</a> ·
    <a href="https://wa.me/91${esc(order.phone)}">WhatsApp</a>${order.email ? `<br>${esc(order.email)}` : ''}<br>
    ${addressLines(order).map(esc).join('<br>')}</p>
  ${order.notes ? `<p style="background:#fff4dc;padding:8px">Note: ${esc(order.notes)}</p>` : ''}
  <p style="margin-top:20px"><a href="${esc(adminLink)}" style="background:#7a1230;color:#fff;padding:10px 18px;border-radius:20px;text-decoration:none">Open order in admin</a></p>
</div>`;

  return { subject, text, html };
}

async function sendEmail({ to, subject, text, html }) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': config.alerts.brevoApiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: { name: config.shop.name, email: config.alerts.emailFrom },
      to: to.map((email) => ({ email })),
      subject,
      textContent: text,
      htmlContent: html,
    }),
  });
  if (!res.ok) throw new Error(`Brevo email failed (${res.status}): ${await res.text().catch(() => '')}`);
}

// Fire and forget: an email problem must never break checkout.
function notifyNewOrder(order, items) {
  if (!config.alerts.emailEnabled) return Promise.resolve(false);
  return sendEmail({ to: config.alerts.to, ...orderEmail(order, items) })
    .then(() => true)
    .catch((err) => {
      console.error(`Order alert for ${order.order_no} not sent:`, err.message);
      return false;
    });
}

// Text the customer sends to the shop's WhatsApp from the confirmation page.
function whatsappOrderText(order, items) {
  return [
    `Hi ${config.shop.name}, I just placed order ${order.order_no}.`,
    '',
    ...items.map((i) => `• ${i.name}${i.size ? ` (Size ${i.size})` : ''} x ${i.qty}`),
    `Total: ${money(order.total)} (${order.payment_method === 'cod' ? 'Cash on Delivery' : 'paid online'})`,
    '',
    `Name: ${order.customer_name}`,
    `Phone: ${order.phone}`,
    `Address: ${addressLines(order).join(', ')}`,
  ].join('\n');
}

module.exports = { notifyNewOrder, orderEmail, whatsappOrderText };
