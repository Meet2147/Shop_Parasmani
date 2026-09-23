const { db, transaction } = require('./db');
const { newOrderNo, token } = require('./util');

const insertOrder = db.prepare(`
  INSERT INTO orders (order_no, access_token, customer_name, phone, email, address1, address2, city, state, pincode,
                      notes, subtotal, shipping, total, payment_method, payment_status, status)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'awaiting_payment')`);
const insertItem = db.prepare('INSERT INTO order_items (order_id, product_id, name, size, price, qty, image) VALUES (?, ?, ?, ?, ?, ?, ?)');
const getItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?');
const getOrderById = db.prepare('SELECT * FROM orders WHERE id = ?');
const stockOf = db.prepare('SELECT stock, name FROM products WHERE id = ?');
const takeStock = db.prepare('UPDATE products SET stock = MAX(stock - ?, 0) WHERE id = ?');
const giveStock = db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?');

class StockError extends Error {}

// Saves the order in "awaiting payment" state. Stock is only taken when the order is confirmed.
function createOrder(cart, customer, paymentMethod) {
  return transaction(() => {
    const orderNo = newOrderNo();
    const { lastInsertRowid } = insertOrder.run(
      orderNo, token(), customer.name, customer.phone, customer.email, customer.address1, customer.address2,
      customer.city, customer.state, customer.pincode, customer.notes,
      cart.subtotal, cart.shipping, cart.total, paymentMethod,
    );
    for (const i of cart.items) {
      insertItem.run(lastInsertRowid, i.product.id, i.product.name, i.size, i.product.price, i.qty, i.product.images[0] || '');
    }
    return getOrderById.get(lastInsertRowid);
  });
}

// Confirms an order and reduces stock. With strict=true (cash on delivery) it refuses
// if anything sold out meanwhile; for already-paid orders it confirms regardless so the
// shop can sort it out with the customer.
function confirmOrder(orderId, { strict, paymentId } = {}) {
  return transaction(() => {
    const order = getOrderById.get(orderId);
    if (!order || order.status !== 'awaiting_payment') return order;
    const items = getItems.all(orderId);
    if (strict) {
      for (const i of items) {
        const p = i.product_id && stockOf.get(i.product_id);
        if (!p || p.stock < i.qty) throw new StockError(`Sorry, ${i.name} just went out of stock.`);
      }
    }
    for (const i of items) if (i.product_id) takeStock.run(i.qty, i.product_id);
    db.prepare(`UPDATE orders SET status = 'confirmed', payment_status = ?, razorpay_payment_id = COALESCE(?, razorpay_payment_id),
                updated_at = datetime('now') WHERE id = ?`)
      .run(paymentId ? 'paid' : order.payment_status, paymentId || null, orderId);
    return getOrderById.get(orderId);
  });
}

// Changes status from the admin panel. Cancelling a confirmed order puts the stock back.
function setStatus(orderId, status, trackingInfo) {
  return transaction(() => {
    const order = getOrderById.get(orderId);
    if (!order) return null;
    const wasHoldingStock = !['awaiting_payment', 'cancelled'].includes(order.status);
    const willHoldStock = !['awaiting_payment', 'cancelled'].includes(status);
    if (wasHoldingStock && !willHoldStock) {
      for (const i of getItems.all(orderId)) if (i.product_id) giveStock.run(i.qty, i.product_id);
    } else if (!wasHoldingStock && willHoldStock) {
      for (const i of getItems.all(orderId)) if (i.product_id) takeStock.run(i.qty, i.product_id);
    }
    db.prepare(`UPDATE orders SET status = ?, tracking_info = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(status, trackingInfo ?? order.tracking_info, orderId);
    return getOrderById.get(orderId);
  });
}

module.exports = { createOrder, confirmOrder, setStatus, getItems, getOrderById, StockError };
