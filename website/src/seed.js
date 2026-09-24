// Starting catalogue. The Garba products and kurti fabrics use model photos (and a few real shop
// photos); the dress materials are samples with generated SVG illustrations that can be replaced
// from the admin panel.
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

// The same mirror-work chaniya choli in more colours, each sold as a full set, the choli alone and the
// ghagra alone. Photos are model photos in public/img/products/garba/colours/.
const GARBA_COLOURS = [
  { key: 'black', name: 'Black', colour: 'Black and maroon', ghagra: 'black and deep maroon panels' },
  { key: 'red', name: 'Red', colour: 'Red and golden yellow', ghagra: 'red and golden yellow panels' },
  { key: 'green', name: 'Parrot Green', colour: 'Parrot green, rani pink and orange', ghagra: 'parrot green, rani pink and orange panels' },
  { key: 'multi', name: 'Multicolour', colour: 'Multicolour', ghagra: 'rainbow panels of red, yellow, green, blue, orange and pink' },
  { key: 'yellow', name: 'Mustard Yellow', colour: 'Mustard yellow and rani pink', ghagra: 'mustard yellow and rani pink panels' },
];

const colourSet = (c) => {
  const img = (shots) => shots.map((s) => `garba/colours/${c.key}-${s}.jpg`);
  const fabric = 'Cotton with Kutchi patchwork and mirror work';
  return [
    P(`${c.name} Mirror Work Kutchi Chaniya Choli`, 'Chaniya Choli', 3999, 5499, fabric, c.colour, null, null, null, {
      sizes: BLOUSE, stock: 4, images: img(['1-studio', '2-closeup', '3-garba', '4-daylight']),
      description: `Our mirror-work bustier choli in ${c.colour.toLowerCase()}, covered in Kutchi patchwork and mirrors, with a sweetheart neckline and thin embroidered straps.\n\nPaired with a wide-ghera kali ghagra in ${c.ghagra}, finished with gold gota lines and a gota border at the hem.` }),
    P(`${c.name} Kutchi Patchwork Mirror Work Bustier Blouse`, 'Navratri Blouses', 1799, 2499, fabric, c.colour, null, null, null, {
      sizes: BLOUSE, stock: 5, images: img(['2-closeup', '1-studio', '3-garba']),
      description: `The mirror-work bustier choli on its own, in ${c.colour.toLowerCase()} with colourful Kutchi patches and mirrors all over the cups.\n\nWear it with any plain or bandhani ghagra for an instant Garba look.` }),
    P(`${c.name} Kali Ghagra with Gota Border`, 'Ghagras', 1999, 2799, 'Cotton', c.colour, null, null, null, {
      sizes: FREE, stock: 5, images: img(['3-garba', '4-daylight', '1-studio']),
      description: `Kali ghagra in ${c.ghagra}, with gold gota lines and a gota border at the hem. Wide ghera for big garba twirls, drawstring waist.` }),
  ];
};

// Kurti fabrics sold by the piece. Photos show a model in three kurti styles made from each print,
// then the folded fabric; they are in public/img/products/kurtis/.
const KURTI_PRINTS = [
  { key: 'indigo-vine', name: 'Indigo Vine Print Cotton Kurti Fabric', price: 649, mrp: 849, colour: 'Indigo and white', print: 'white vines and diamond motifs in neat vertical rows on deep indigo' },
  { key: 'teal-maroon-floral', name: 'Teal and Maroon Floral Print Kurti Fabric', price: 699, mrp: 899, colour: 'Teal, maroon and mustard', print: 'maroon flowers and mustard leaves on a dark teal ground' },
  { key: 'indigo-floral', name: 'Indigo Floral Print Cotton Kurti Fabric', price: 649, mrp: 849, colour: 'Indigo and white', print: 'soft white floral clusters on deep indigo' },
  { key: 'white-blue-buti', name: 'White and Blue Buti Block Print Kurti Fabric', price: 599, mrp: 799, colour: 'White and blue', print: 'small blue block printed butis on crisp white' },
  { key: 'black-maroon-paisley', name: 'Black and Maroon Kalamkari Paisley Kurti Fabric', price: 749, mrp: 999, colour: 'Black, maroon and cream', print: 'bold maroon and cream kalamkari paisleys on black' },
];

const kurtiFabric = (k) => P(k.name, 'Kurti Materials', k.price, k.mrp, 'Cotton', k.colour, null, null, null, {
  stock: 15, images: ['1-straight', '2-anarkali', '3-short', '4-fabric'].map((s) => `kurtis/${k.key}-${s}.jpg`),
  description: `A 2.5 metre cotton piece with ${k.print}. Enough for a knee-length kurti with sleeves.\n\nThe photos show three ways to get it stitched: a straight kurti with palazzo, a flared anarkali, and a short kurti with jeans.` });

const PRODUCTS = [
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

  P('Orange Mirror Work Kutchi Chaniya Choli', 'Chaniya Choli', 3999, 5499, 'Cotton with Kutchi patchwork and mirror work', 'Orange and rani pink', null, null, null, {
    sizes: BLOUSE, featured: 1, stock: 6,
    images: ['garba/model-studio-1.jpg', 'garba/model-choli-closeup.jpg', 'garba/model-garba-night-1.jpg', 'garba/model-studio-3.jpg', 'garba/shop-choli-closeup.jpg', 'garba/shop-choli-embroidery.jpg'],
    description: 'Our showstopper for Garba nights. A stitched bustier choli covered in Kutchi patchwork, animal and floral motifs and real mirror work, with a sweetheart neckline and thin embroidered straps.\n\nPaired with a wide-ghera kali ghagra in orange and rani pink panels, finished with a gold gota border that shines with every twirl.\n\nThe last two photos are close-ups of the actual piece at our shop.' }),
  P('Kutchi Patchwork Mirror Work Bustier Blouse', 'Navratri Blouses', 1799, 2499, 'Cotton with Kutchi patchwork and mirror work', 'Orange multicolour', null, null, null, {
    sizes: BLOUSE, featured: 1, stock: 8,
    images: ['garba/model-choli-closeup.jpg', 'garba/model-studio-1.jpg', 'garba/shop-choli-closeup.jpg', 'garba/shop-choli-embroidery.jpg'],
    description: 'The same hand-worked bustier choli, sold on its own. Orange base with colourful Kutchi patches, mirrors all over the cups and embroidered straps.\n\nWear it with any plain or bandhani ghagra for an instant Garba look.' }),
  P('Orange and Rani Pink Kali Ghagra with Gota Border', 'Ghagras', 1999, 2799, 'Cotton', 'Orange and rani pink', null, null, null, {
    sizes: FREE, featured: 1, stock: 8,
    images: ['garba/model-garba-night-2.jpg', 'garba/model-studio-2.jpg', 'garba/model-studio-3.jpg'],
    description: 'Kali ghagra in alternating orange and rani pink panels with gold gota lines and a triple gota border at the hem. Wide ghera for big garba twirls, drawstring waist.' }),
  ...GARBA_COLOURS.flatMap(colourSet),
  ...KURTI_PRINTS.map(kurtiFabric),
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
      p.urls = p.images ? p.images.map((f) => `/static/img/products/${f}`) : [`/static/img/products/${slug}.svg`];
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
