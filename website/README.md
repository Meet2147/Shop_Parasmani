# ParasmaniNX online shop

Online store for ParasmaniNX: dress materials, kurti materials and the Navratri collection
(chaniya choli, blouses, ghagras). Customers browse, add to cart and pay online through
Razorpay (UPI, cards, netbanking) or choose Cash on Delivery. The shop owner manages products,
stock and orders from `/admin`.

## What's included

**Shop:** home page with Navratri banner, category pages with sorting and in-stock filter,
search, product pages with photos, sizes and stock, cart, checkout with Indian address and
PIN code checks, order confirmation page, order tracking by order number and phone,
WhatsApp buttons, and the policy pages Razorpay asks for (shipping, returns, privacy, terms, contact).

**Payments:** Razorpay Standard Checkout with server-side signature verification, a webhook
so paid orders are confirmed even if the customer closes the browser, and Cash on Delivery.
Prices are always taken from the database, never from the browser. Stock is reduced only when
an order is confirmed, and returned when an order is cancelled.

**Admin (`/admin`):** dashboard (today's orders, orders to ship, 30-day sales, low stock),
add and edit products with photo upload, hide or delete products, categories, orders list,
order status (confirmed, packed, shipped, delivered, cancelled), payment status and courier
tracking number shown to the customer.

## Run it on your computer

Needs Node.js 22.5 or newer.

```bash
npm install
cp .env.example .env      # then set ADMIN_PASSWORD and SESSION_SECRET
npm start                 # http://localhost:3000
```

The first start fills the shop with 18 sample products using drawn illustrations.
Replace them with real photos from `/admin`. Run the tests with `npm test`.

## Going live checklist

1. **Shop details:** fill in `SHOP_PHONE`, `SHOP_WHATSAPP`, `SHOP_EMAIL`, `SHOP_ADDRESS` in `.env`.
2. **Razorpay:** create an account at razorpay.com, finish KYC, then copy the Key ID and
   Key Secret into `.env`. Start with `rzp_test_` keys to try payments without real money.
   Add a webhook at `https://your-domain/payment/webhook` for `payment.captured` and
   `order.paid`, and put its secret in `RAZORPAY_WEBHOOK_SECRET`.
3. **Hosting:** any host that runs Node.js with a persistent disk works (for example a small
   VPS, Render or Railway with a volume). Keep `data/` (the database) and `uploads/`
   (product photos) on the persistent disk and back them up.
4. **Domain and HTTPS:** point your domain at the host and set `BASE_URL=https://your-domain`.
5. **Policies:** read the shipping and returns pages and adjust them to how your shop works.

## Project layout

```
server.js              app setup
src/config.js          settings from .env
src/db.js              SQLite tables (Node's built-in driver)
src/cart.js            cart stored in a signed cookie
src/orders.js          creating, confirming and cancelling orders with stock
src/razorpay.js        Razorpay API and signature checks
src/routes/shop.js     customer pages, checkout and payment
src/routes/admin.js    admin panel
src/routes/webhook.js  Razorpay webhook
src/seed.js            sample catalogue
views/                 EJS page templates
public/                CSS, JS and images
test/                  automated tests
```
