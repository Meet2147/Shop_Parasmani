// Starting catalogue. The Garba products at the end use real photos from the shop plus model
// photos made from them; the rest are samples with generated SVG illustrations that can be
// replaced from the admin panel.
const fs = require('node:fs');
const path = require('node:path');
const { db, transaction } = require('./db');
const { slugify } = require('./util');

const IMG_DIR = path.join(__dirname, '..', 'public', 'img', 'products');

// ---- Fabric patterns -----------------------------------------------------

const patterns = {
  bandhani: (bg, fg, acc) => `<pattern id="pt" width="34" height="34" patternUnits="userSpaceOnUse">
      <rect width="34" height="34" fill="${bg}"/>
      <circle cx="8" cy="8" r="3.2" fill="none" stroke="${fg}" stroke-width="2"/>
      <circle cx="25" cy="25" r="3.2" fill="none" stroke="${fg}" stroke-width="2"/>
      <circle cx="25" cy="8" r="1.6" fill="${acc}"/><circle cx="8" cy="25" r="1.6" fill="${acc}"/></pattern>`,
  leheriya: (bg, fg, acc) => `<pattern id="pt" width="40" height="40" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
      <rect width="40" height="40" fill="${bg}"/>
      <path d="M0 10 Q10 4 20 10 T40 10" stroke="${fg}" stroke-width="5" fill="none"/>
      <path d="M0 28 Q10 22 20 28 T40 28" stroke="${acc}" stroke-width="3" fill="none"/></pattern>`,
  block: (bg, fg, acc) => `<pattern id="pt" width="60" height="60" patternUnits="userSpaceOnUse">
      <rect width="60" height="60" fill="${bg}"/>
      <g transform="translate(30 30)" fill="${fg}">
        ${[0, 60, 120, 180, 240, 300].map((a) => `<ellipse rx="4.5" ry="10" transform="rotate(${a}) translate(0 -10)"/>`).join('')}
        <circle r="4" fill="${acc}"/></g>
      <circle cx="0" cy="0" r="2.5" fill="${acc}"/><circle cx="60" cy="0" r="2.5" fill="${acc}"/>
      <circle cx="0" cy="60" r="2.5" fill="${acc}"/><circle cx="60" cy="60" r="2.5" fill="${acc}"/></pattern>`,
  mirror: (bg, fg, acc) => `<pattern id="pt" width="56" height="56" patternUnits="userSpaceOnUse">
      <rect width="56" height="56" fill="${bg}"/>
      <path d="M28 6 L50 28 L28 50 L6 28 Z" fill="none" stroke="${fg}" stroke-width="2.5"/>
      <circle cx="28" cy="28" r="7" fill="#e9eef2" stroke="${acc}" stroke-width="3"/>
      <circle cx="0" cy="0" r="5" fill="#e9eef2" stroke="${acc}" stroke-width="2.5"/><circle cx="56" cy="0" r="5" fill="#e9eef2" stroke="${acc}" stroke-width="2.5"/>
      <circle cx="0" cy="56" r="5" fill="#e9eef2" stroke="${acc}" stroke-width="2.5"/><circle cx="56" cy="56" r="5" fill="#e9eef2" stroke="${acc}" stroke-width="2.5"/></pattern>`,
  checks: (bg, fg, acc) => `<pattern id="pt" width="48" height="48" patternUnits="userSpaceOnUse">
      <rect width="48" height="48" fill="${bg}"/>
      <rect width="48" height="14" fill="${fg}" opacity=".55"/><rect width="14" height="48" fill="${fg}" opacity=".55"/>
      <rect x="30" width="3" height="48" fill="${acc}"/><rect y="30" width="48" height="3" fill="${acc}"/></pattern>`,
  floral: (bg, fg, acc) => `<pattern id="pt" width="80" height="80" patternUnits="userSpaceOnUse">
      <rect width="80" height="80" fill="${bg}"/>
      ${[[20, 20], [60, 60]].map(([x, y]) => `<g transform="translate(${x} ${y})">
        ${[0, 72, 144, 216, 288].map((a) => `<circle r="6" cx="0" cy="-8" fill="${fg}" transform="rotate(${a})"/>`).join('')}
        <circle r="4" fill="${acc}"/></g>`).join('')}
      <path d="M40 30 q6 6 0 12 q-6 -6 0 -12z M0 70 q6 -6 12 0 q-6 6 -12 0z" fill="${acc}" opacity=".7"/></pattern>`,
  zari: (bg, fg, acc) => `<pattern id="pt" width="36" height="36" patternUnits="userSpaceOnUse">
      <rect width="36" height="36" fill="${bg}"/>
      <path d="M18 4 C24 12 24 16 18 20 C12 16 12 12 18 4Z" fill="${fg}"/>
      <circle cx="0" cy="30" r="2" fill="${acc}"/><circle cx="36" cy="30" r="2" fill="${acc}"/></pattern>`,
};

const border = (gold, deep) => `<pattern id="bd" width="30" height="30" patternUnits="userSpaceOnUse">
    <rect width="30" height="30" fill="${deep}"/>
    <path d="M0 15 L15 3 L30 15 L15 27 Z" fill="${gold}"/><circle cx="15" cy="15" r="4" fill="${deep}"/>
    <rect width="30" height="3" fill="${gold}"/><rect y="27" width="30" height="3" fill="${gold}"/></pattern>`;

// ---- Silhouettes ---------------------------------------------------------

const shapes = {
  ghagra: () => `
    <path d="M225 150 L375 150 L530 640 Q300 700 70 640 Z" fill="url(#pt)"/>
    <path d="M225 150 L375 150 L530 640 Q300 700 70 640 Z" fill="url(#fold)"/>
    <path d="M86 600 Q300 660 514 600 L530 640 Q300 700 70 640 Z" fill="url(#bd)"/>
    <rect x="215" y="128" width="170" height="30" rx="6" fill="url(#bd)"/>
    <path d="M300 158 L300 250" stroke="#00000022" stroke-width="3"/>`,
  blouse: () => `<g transform="translate(300 340) scale(1.3) translate(-300 -340)">
    <path d="M200 190 Q300 250 400 190 L470 225 L505 330 L450 350 L420 290 L415 470 Q300 500 185 470 L180 290 L150 350 L95 330 L130 225 Z" fill="url(#pt)"/>
    <path d="M200 190 Q300 250 400 190 L470 225 L505 330 L450 350 L420 290 L415 470 Q300 500 185 470 L180 290 L150 350 L95 330 L130 225 Z" fill="url(#fold)"/>
    <path d="M200 190 Q300 250 400 190" fill="none" stroke="url(#bd)" stroke-width="16"/>
    <path d="M185 460 Q300 490 415 460" fill="none" stroke="url(#bd)" stroke-width="18"/>
    <path d="M95 330 L150 350 M505 330 L450 350" stroke="url(#bd)" stroke-width="14"/></g>`,
  chaniya: () => `
    <path d="M245 90 Q300 120 355 90 L395 108 L412 160 L385 168 L372 140 L370 230 Q300 245 230 230 L228 140 L215 168 L188 160 L205 108 Z" fill="url(#pt)"/>
    <path d="M230 222 Q300 238 370 222" stroke="url(#bd)" stroke-width="12" fill="none"/>
    <path d="M232 262 L368 262 L525 660 Q300 715 75 660 Z" fill="url(#pt)"/>
    <path d="M232 262 L368 262 L525 660 Q300 715 75 660 Z" fill="url(#fold)"/>
    <path d="M90 622 Q300 675 510 622 L525 660 Q300 715 75 660 Z" fill="url(#bd)"/>
    <rect x="222" y="248" width="156" height="24" rx="5" fill="url(#bd)"/>
    <path d="M395 110 C470 200 480 380 440 560 L470 570 C520 380 505 190 420 100 Z" fill="url(#bd)" opacity=".92"/>`,
  dress: (c) => `
    <g transform="rotate(-4 300 420)"><rect x="110" y="420" width="380" height="200" rx="10" fill="${c.plain}"/>
      <rect x="110" y="420" width="380" height="200" rx="10" fill="url(#fold)"/></g>
    <g transform="rotate(3 300 330)"><rect x="95" y="210" width="410" height="250" rx="10" fill="url(#pt)"/>
      <rect x="95" y="210" width="410" height="250" rx="10" fill="url(#fold)"/></g>
    <g transform="rotate(-2 300 520)"><rect x="140" y="470" width="330" height="170" rx="10" fill="${c.dupatta}"/>
      <rect x="140" y="610" width="330" height="30" fill="url(#bd)"/><rect x="140" y="470" width="330" height="170" rx="10" fill="url(#fold)"/></g>`,
  kurti: () => `
    <g transform="rotate(-3 300 420)"><rect x="120" y="390" width="360" height="220" rx="12" fill="url(#pt)"/>
      <rect x="120" y="390" width="360" height="220" rx="12" fill="#00000025"/></g>
    <g transform="rotate(2 300 330)"><rect x="100" y="170" width="400" height="330" rx="12" fill="url(#pt)"/>
      <rect x="100" y="170" width="400" height="330" rx="12" fill="url(#fold)"/>
      <path d="M100 470 L500 470" stroke="#ffffff55" stroke-width="3"/></g>`,
};

function fabricSvg(shape, pattern, colors) {
  const { bg, fg, acc, gold = '#d6a534', deep = colors.fg } = colors;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 750">
  <defs>
    ${patterns[pattern](bg, fg, acc)}
    ${border(gold, deep)}
    <linearGradient id="fold" x1="0" x2="1">
      <stop offset="0" stop-color="#000" stop-opacity=".18"/><stop offset=".3" stop-color="#fff" stop-opacity=".08"/>
      <stop offset=".55" stop-color="#000" stop-opacity=".1"/><stop offset=".8" stop-color="#fff" stop-opacity=".1"/>
      <stop offset="1" stop-color="#000" stop-opacity=".2"/></linearGradient>
    <radialGradient id="back" cx=".5" cy=".4" r=".75"><stop offset="0" stop-color="#fffaf1"/><stop offset="1" stop-color="#f0e2cc"/></radialGradient>
    <filter id="sh" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#5a2a12" flood-opacity=".22"/></filter>
  </defs>
  <rect width="600" height="750" fill="url(#back)"/>
  <g filter="url(#sh)">${shapes[shape](colors)}</g>
</svg>`;
}

// ---- Catalogue -----------------------------------------------------------

const CATEGORIES = [
  { name: 'Chaniya Choli', festive: 1, sort: 1, description: 'Hand-picked chaniya cholis for Navratri garba nights. Mirror work, bandhani and heavy ghera for the perfect twirl.' },
  { name: 'Navratri Blouses', festive: 1, sort: 2, description: 'Ready-to-wear Navratri blouses with kutchi work, mirrors and tassels. Pair them with any ghagra.' },
  { name: 'Ghagras', festive: 1, sort: 3, description: 'Flared ghagras with wide ghera and rich borders, made to swirl through every garba round.' },
  { name: 'Dress Materials', festive: 0, sort: 4, description: 'Unstitched 3-piece suit sets with top, bottom and dupatta. Get them stitched exactly your way.' },
  { name: 'Kurti Materials', festive: 0, sort: 5, description: 'Kurti fabrics by the piece in cotton, rayon and more. Everyday comfort and festive prints.' },
];

const P = (name, cat, price, mrp, fabric, color, shape, pattern, colors, extra = {}) => ({ name, cat, price, mrp, fabric, color, shape, pattern, colors, ...extra });
const FREE = 'Free Size';
const BLOUSE = '32, 34, 36, 38, 40, 42';

const PRODUCTS = [
  P('Rani Pink Mirror Work Chaniya Choli', 'Chaniya Choli', 3499, 4999, 'Cotton with mirror work', 'Rani pink and green', 'chaniya', 'mirror',
    { bg: '#d6246e', fg: '#1f7a4c', acc: '#c9a227', deep: '#1f7a4c' }, { sizes: FREE, featured: 1, stock: 12,
      description: 'A festive favourite in rani pink with hand-finished mirror work all over. Comes with a 7 metre ghera chaniya, an unstitched blouse piece with matching mirror lace and a contrast green bandhani dupatta.\n\nThe chaniya has an adjustable drawstring waist and fits waist sizes 26 to 40 inches.' }),
  P('Royal Blue Bandhani Chaniya Choli', 'Chaniya Choli', 2899, 3799, 'Pure cotton bandhani', 'Royal blue and yellow', 'chaniya', 'bandhani',
    { bg: '#1c3f94', fg: '#f4c430', acc: '#ffffff', deep: '#8a1538' }, { sizes: FREE, featured: 1, stock: 9,
      description: 'Traditional hand-tied bandhani in deep royal blue with sunshine yellow dots. Light, breathable cotton that stays comfortable through long garba nights.\n\nIncludes chaniya with 6 metre ghera, blouse piece and dupatta.' }),
  P('Maroon Kutchi Embroidered Chaniya Choli', 'Chaniya Choli', 5499, 6999, 'Cotton silk with kutchi embroidery', 'Maroon and gold', 'chaniya', 'zari',
    { bg: '#7a1230', fg: '#e0a82e', acc: '#f7e7b4', deep: '#2b1a4a' }, { sizes: FREE, featured: 1, stock: 5,
      description: 'Our premium pick. Rich maroon cotton silk with dense kutchi thread embroidery and a wide zari border on a 9 metre ghera.\n\nWith stitched blouse (size can be altered) and a heavy net dupatta.' }),
  P('Parrot Green Leheriya Chaniya Choli', 'Chaniya Choli', 2299, 2999, 'Rayon leheriya', 'Parrot green and orange', 'chaniya', 'leheriya',
    { bg: '#5aa832', fg: '#f47b20', acc: '#fff3c4', deep: '#b8235a' }, { sizes: FREE, stock: 15,
      description: 'Bright and joyful leheriya waves in parrot green and orange. A lightweight set that is easy to carry and dance in.' }),

  P('Black Mirror Work Navratri Blouse', 'Navratri Blouses', 899, 1299, 'Cotton with mirror work', 'Black multicolour', 'blouse', 'mirror',
    { bg: '#1d1d1f', fg: '#d6246e', acc: '#e8b923', deep: '#b8235a' }, { sizes: BLOUSE, featured: 1, stock: 20,
      description: 'Ready-made backless-style Navratri blouse with round mirrors and multicolour thread work. Adjustable dori tie at the back with tassels.\n\nGoes with almost every chaniya and ghagra.' }),
  P('Yellow Kutchi Work Blouse', 'Navratri Blouses', 749, 999, 'Cotton', 'Mustard yellow', 'blouse', 'block',
    { bg: '#e2a822', fg: '#8a1538', acc: '#1c5e8a', deep: '#8a1538' }, { sizes: BLOUSE, stock: 18,
      description: 'Mustard yellow cotton blouse with kutchi motifs and short sleeves. Soft cotton lining for all-night comfort.' }),
  P('Red Gamthi Patch Work Blouse', 'Navratri Blouses', 1099, 1499, 'Cotton gamthi', 'Red and green', 'blouse', 'floral',
    { bg: '#c62828', fg: '#2e7d32', acc: '#f9d65c', deep: '#1a237e' }, { sizes: BLOUSE, stock: 8,
      description: 'Colourful gamthi patch work blouse with mirror borders on the neckline and sleeves.' }),

  P('Multicolour Kutchi Ghagra', 'Ghagras', 1899, 2599, 'Cotton', 'Multicolour', 'ghagra', 'block',
    { bg: '#f2c14e', fg: '#c2185b', acc: '#1e6fa8', deep: '#6d1b3b' }, { sizes: FREE, featured: 1, stock: 10,
      description: 'Wide 8 metre ghera ghagra with kutchi block motifs and a mirror work border that flares beautifully while you twirl.' }),
  P('Navy Bandhani Ghagra with Gota Border', 'Ghagras', 2199, 2999, 'Cotton bandhani', 'Navy blue', 'ghagra', 'bandhani',
    { bg: '#1b2a5c', fg: '#f6d56b', acc: '#e44d8a', deep: '#a31545' }, { sizes: FREE, stock: 7,
      description: 'Navy bandhani ghagra with a shimmering gota patti border. Drawstring waist fits 26 to 40 inches.' }),
  P('Orange Leheriya Ghagra', 'Ghagras', 1499, 1999, 'Rayon', 'Orange and pink', 'ghagra', 'leheriya',
    { bg: '#f57c1f', fg: '#d81b60', acc: '#fff4d6', deep: '#5e1a78' }, { sizes: FREE, stock: 14,
      description: 'A bright orange leheriya ghagra, light on the waist and easy to style with any blouse.' }),

  P('Pastel Pink Chanderi Dress Material', 'Dress Materials', 1650, 2200, 'Chanderi silk', 'Pastel pink', 'dress', 'zari',
    { bg: '#f3b6c5', fg: '#c79a3b', acc: '#ffffff', deep: '#8e3b5a', plain: '#e8a1b3', dupatta: '#f7d5de' }, { featured: 1, stock: 16,
      description: 'Unstitched 3-piece set.\n\nTop: 2.5 metres chanderi with zari butti\nBottom: 2.5 metres cotton\nDupatta: 2.25 metres chanderi with zari border' }),
  P('Indigo Block Print Cotton Dress Material', 'Dress Materials', 1150, 1500, 'Pure cotton', 'Indigo blue', 'dress', 'block',
    { bg: '#23395d', fg: '#dfe7f2', acc: '#e0a82e', deep: '#23395d', plain: '#2f4a73', dupatta: '#c9d6ea' }, { stock: 22,
      description: 'Hand block printed indigo cotton for everyday comfort.\n\nTop: 2.5 metres\nBottom: 2.5 metres\nDupatta: 2.25 metres mulmul cotton' }),
  P('Mint Green Floral Georgette Dress Material', 'Dress Materials', 1399, 1899, 'Georgette', 'Mint green', 'dress', 'floral',
    { bg: '#a8dcc5', fg: '#d9587a', acc: '#f5c542', deep: '#2f7a5e', plain: '#8ecfb3', dupatta: '#e8f5ef' }, { featured: 1, stock: 11,
      description: 'Flowy georgette with a soft floral print, lined with santoon.\n\nTop: 2.5 metres\nBottom: 2.5 metres santoon\nDupatta: 2.25 metres chiffon' }),
  P('Wine Silk Embroidered Dress Material', 'Dress Materials', 2450, 3200, 'Art silk with embroidery', 'Wine', 'dress', 'mirror',
    { bg: '#6b1233', fg: '#d8a93a', acc: '#d8a93a', deep: '#3b0a1c', plain: '#5a0f2b', dupatta: '#c9a24a' }, { stock: 6,
      description: 'Festive art silk suit set with embroidered yoke and sequin work.\n\nTop: 2.5 metres\nBottom: 2.5 metres\nDupatta: 2.25 metres with embroidered border' }),

  P('Sunflower Yellow Cotton Kurti Fabric', 'Kurti Materials', 499, 650, 'Cotton cambric', 'Yellow', 'kurti', 'floral',
    { bg: '#f7c948', fg: '#ffffff', acc: '#e0662f', deep: '#8a4b12' }, { featured: 1, stock: 30,
      description: '2.5 metre cotton cambric piece with a cheerful floral print. Enough for a knee-length kurti with sleeves.' }),
  P('Teal Rayon Printed Kurti Fabric', 'Kurti Materials', 425, 550, 'Rayon', 'Teal', 'kurti', 'leheriya',
    { bg: '#127a7a', fg: '#f2d0a4', acc: '#f28c38', deep: '#0c4d4d' }, { stock: 25,
      description: 'Soft, drapey rayon that stitches beautifully into A-line and anarkali kurtis. 2.5 metre piece.' }),
  P('Red Checks Handloom Kurti Fabric', 'Kurti Materials', 575, 750, 'Handloom cotton', 'Red and white', 'kurti', 'checks',
    { bg: '#f5ede0', fg: '#c0392b', acc: '#1d3557', deep: '#c0392b' }, { stock: 18,
      description: 'Classic handloom checks, woven cotton that gets softer with every wash. 2.5 metre piece.' }),
  P('Lavender Bandhani Kurti Fabric', 'Kurti Materials', 699, 899, 'Cotton bandhani', 'Lavender', 'kurti', 'bandhani',
    { bg: '#8e7cc3', fg: '#ffffff', acc: '#f7d774', deep: '#4a3b82' }, { stock: 2,
      description: 'Hand-tied bandhani in a soft lavender shade. Limited pieces. 2.5 metres.' }),

  // Real pieces from the shop. Listed last so they get the newest ids and lead the home page.
  P('Orange Mirror Work Kutchi Chaniya Choli', 'Chaniya Choli', 3999, 5499, 'Cotton with Kutchi patchwork and mirror work', 'Orange and rani pink', null, null, null, {
    sizes: BLOUSE, featured: 1, stock: 6,
    images: ['model-studio-1.jpg', 'shop-choli-ghagra-front.jpg', 'model-choli-closeup.jpg', 'model-garba-night-1.jpg', 'shop-choli-embroidery.jpg', 'model-studio-3.jpg'],
    description: 'Our showstopper for Garba nights. A stitched bustier choli covered in Kutchi patchwork, animal and floral motifs and real mirror work, with a sweetheart neckline and thin embroidered straps.\n\nPaired with a wide-ghera kali ghagra in orange and rani pink panels, finished with a gold gota border that shines with every twirl.\n\nThe second and fifth photos show the actual piece at our shop; the model photos show how it looks when worn.' }),
  P('Kutchi Patchwork Mirror Work Bustier Blouse', 'Navratri Blouses', 1799, 2499, 'Cotton with Kutchi patchwork and mirror work', 'Orange multicolour', null, null, null, {
    sizes: BLOUSE, featured: 1, stock: 8,
    images: ['model-choli-closeup.jpg', 'shop-choli-closeup.jpg', 'shop-choli-embroidery.jpg', 'shop-choli-front.jpg'],
    description: 'The same hand-worked bustier choli, sold on its own. Orange base with colourful Kutchi patches, mirrors all over the cups and embroidered straps.\n\nWear it with any plain or bandhani ghagra for an instant Garba look.' }),
  P('Orange and Rani Pink Kali Ghagra with Gota Border', 'Ghagras', 1999, 2799, 'Cotton', 'Orange and rani pink', null, null, null, {
    sizes: FREE, featured: 1, stock: 8,
    images: ['model-garba-night-2.jpg', 'shop-ghagra-gota-border.jpg', 'model-studio-2.jpg', 'shop-full-look-angle.jpg'],
    description: 'Kali ghagra in alternating orange and rani pink panels with gold gota lines and a triple gota border at the hem. Wide ghera for big garba twirls, drawstring waist.' }),
];

function seed() {
  fs.mkdirSync(IMG_DIR, { recursive: true });
  transaction(() => {
    const catIds = {};
    for (const c of CATEGORIES) {
      const slug = slugify(c.name);
      db.prepare('INSERT OR IGNORE INTO categories (slug, name, description, is_festive, sort) VALUES (?, ?, ?, ?, ?)')
        .run(slug, c.name, c.description, c.festive, c.sort);
      catIds[c.name] = db.prepare('SELECT id FROM categories WHERE slug = ?').get(slug).id;
    }
    for (const p of PRODUCTS) {
      const slug = slugify(p.name);
      p.urls = p.images ? p.images.map((f) => `/static/img/products/garba/${f}`) : [`/static/img/products/${slug}.svg`];
      if (!p.images) fs.writeFileSync(path.join(IMG_DIR, `${slug}.svg`), fabricSvg(p.shape, p.pattern, p.colors));
      db.prepare(`INSERT OR IGNORE INTO products (slug, name, category_id, price, mrp, fabric, color, description, sizes, stock, images, featured)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(slug, p.name, catIds[p.cat], p.price * 100, p.mrp * 100, p.fabric, p.color, p.description || '', p.sizes || '',
          p.stock ?? 10, JSON.stringify(p.urls), p.featured || 0);
    }
    // Category tiles use a real photo when the category has one, else the first product image.
    for (const c of CATEGORIES) {
      const inCat = PRODUCTS.filter((p) => p.cat === c.name);
      const pick = inCat.find((p) => p.images) || inCat[0];
      db.prepare('UPDATE categories SET image = ? WHERE id = ?').run(pick.urls[0], catIds[c.name]);
    }
  });
  console.log(`Seeded ${CATEGORIES.length} categories and ${PRODUCTS.length} products.`);
}

if (require.main === module) seed();
module.exports = { seed };
