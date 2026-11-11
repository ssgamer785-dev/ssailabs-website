/**
 * Every garment on the production slip shows its delivery date beside its name.
 *
 * The data model holds one delivery date per order (orders.delivery_date), so
 * every garment on an order is due with it; this checks the slip prints that
 * date against each garment, on screen and on the paper that actually comes
 * out of the printer, without disturbing what the bar already carried (order
 * number, name, quantity), without making the bar taller (the pagination model
 * charges a fixed height for it), and without breaking an old order that has
 * no date at all.
 *
 *   VITE_PERSISTENCE=local npx vite --port=3000
 *   E2E_BASE_URL=http://localhost:3000/ node e2e/slip-item-dates.mjs
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'node:child_process';
import { launch, readDb, createOrder, finishOrder, BASE, pdfPageCount, makeReporter } from './helpers.mjs';

const report = makeReporter('SLIP ITEM DELIVERY DATES');
const check = report.check;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'regency-slip-dates-'));
const A4 = { format: 'A4', printBackground: true, margin: { top: '10mm', bottom: '10mm', left: '12mm', right: '12mm' } };
const SHOT_DIR = process.env.SHOT_DIR || '';

const ALL_NINE = ['COAT', 'PANT', 'SHIRT', 'KURTA PAJAMA', 'JACKET', 'WAISTCOAT', 'SHERWANI', '2 PIECE SUIT', '3 PIECE SUIT'];
const MEASURED = {
  'COAT MEASUREMENTS': { Length: 30.5, Chest: 41, Stomach: 37, Shoulder: 18.5, Sleeve: 25, Collar: 16 },
  'PANT MEASUREMENTS': { Length: 40, Waist: 34, Thigh: 24.5 },
  'SHIRT MEASUREMENTS': { Length: 29, Chest: 40 }
};

const { browser, page, errors } = await launch();
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);

const openSlip = async customer => {
  await page.getByRole('button', { name: /Showroom Orders/i }).click();
  await page.waitForTimeout(600);
  const row = page.locator('tbody tr').filter({ hasText: customer }).first();
  await row.locator('button[title="Download PDF or Print Production Slip"]').click();
  await page.waitForTimeout(1400);
};
const closeSlip = async () => {
  await page.evaluate(() => {
    const ov = [...document.querySelectorAll('div.fixed.inset-0.z-50')].pop();
    const btns = ov ? [...ov.querySelectorAll('button')] : [];
    const x = btns.find(b => b.querySelector('svg.lucide-x, svg.lucide-x-icon')) || btns.find(b => /^(close|exit|done)/i.test((b.textContent || '').trim()));
    if (x) x.click();
  });
  await page.emulateMedia({ media: 'screen' });
  await page.waitForTimeout(500);
};
const reportedPages = async () =>
  parseInt((await page.locator('text=/\\d+ PAGES?/').first().innerText()).replace(/\D/g, ''), 10);

/* ============================================================ 1. nine garments */
console.log('\n=== A NINE-GARMENT ORDER: EVERY GARMENT CARRIES ITS DATE ===');
await createOrder(page, {
  name: 'Slip Dates', phone: '9814300101', garments: ALL_NINE,
  remarks: { COAT: 'Peak lapel, working buttonholes' }, measurements: MEASURED
});
await finishOrder(page);
let db = await readDb(page);
const order = db.orders[0];
const DATE = order.deliveryDate;
check('the order has a delivery date to carry', /^\d{4}-\d{2}-\d{2}$/.test(DATE), DATE);
check('and nine garment lines', order.items.length === 9, `${order.items.length}`);

await openSlip('Slip Dates');
const reported = await reportedPages();

const cards = await page.evaluate(() => [...document.querySelectorAll('.production-slip-product-card')].map(card => {
  const bar = card.children[0];
  const [badge, group] = [bar.children[0], bar.children[1]];
  const nameEl = group.querySelector('span.truncate');
  const dateEl = group.querySelector('.production-item-delivery');
  const qtyEl = group.children[group.children.length - 1];
  const r = e => { if (!e) return null; const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, h: b.height }; };
  const cr = card.getBoundingClientRect();
  return {
    badge: (badge.textContent || '').trim(),
    name: (nameEl?.textContent || '').trim(),
    date: dateEl?.getAttribute('data-item-delivery'),
    dateText: (dateEl?.textContent || '').replace(/\s+/g, ' ').trim(),
    qty: (qtyEl?.textContent || '').trim(),
    nameBox: r(nameEl), dateBox: r(dateEl), qtyBox: r(qtyEl), card: { top: cr.top, left: cr.left, right: cr.right, bottom: cr.bottom },
    nameClipped: nameEl ? nameEl.scrollWidth > nameEl.clientWidth + 1 : null,
    dateClipped: dateEl ? dateEl.scrollWidth > dateEl.clientWidth + 1 : null,
    dateColor: dateEl ? getComputedStyle(dateEl).color : null
  };
}));
const n = cards.length;
check('every garment on the slip has a delivery date beside it', n === 9 && cards.every(c => c.date === DATE),
  `${cards.filter(c => c.date === DATE).length}/${n}`);
check('it reads "Delivery <date>"', cards.every(c => c.dateText === `Delivery ${DATE}`), cards[0]?.dateText);
// innerText applies the sheet's CSS uppercase, so compare case-insensitively.
check('and the order-level date in the slip header is still printed',
  /delivery date/i.test(await page.locator('#printable-production-slip').innerText()) &&
  (await page.locator('.production-slip-detail-grid').first().innerText()).includes(DATE));

const orderNo = (await readDb(page)).orders[0].orderNumber;
check('every garment still carries the order number', cards.every(c => c.badge === `#${orderNo}`), cards.map(c => c.badge).join(' '));
check('every garment still carries its quantity', cards.every(c => /^Qty \d+$/.test(c.qty)), cards.map(c => c.qty).join(' '));
check('the garment names are unchanged and in order', JSON.stringify(cards.map(c => c.name.toUpperCase())) ===
  JSON.stringify(order.items.map(i => String(i.garmentType).toUpperCase())), cards.map(c => c.name).join(' | '));

// "Waistcoat" contains "coat": the waistcoat used to print the coat's remark.
const remarkOf = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.production-slip-product-card')].map(card => [
  (card.children[0].children[1].querySelector('span.truncate')?.textContent || '').trim().toUpperCase(),
  (card.lastElementChild.textContent || '').replace(/\s+/g, ' ').trim()
])));
check('the coat prints the remark written for it', /Peak lapel, working buttonholes/.test(remarkOf['COAT']), remarkOf['COAT']);
check('the waistcoat does NOT print the coat\'s remark', !/Peak lapel/.test(remarkOf['WAISTCOAT']), remarkOf['WAISTCOAT']);
check('and neither do the jacket, sherwani or either suit',
  ['JACKET', 'SHERWANI', '2 PIECE SUIT', '3 PIECE SUIT'].every(g => !/Peak lapel/.test(remarkOf[g])),
  ['JACKET', 'SHERWANI', '2 PIECE SUIT', '3 PIECE SUIT'].map(g => remarkOf[g]).join(' | '));

check('the date sits beside the name — same line, to its right, before the quantity',
  cards.every(c => Math.abs(c.dateBox.bottom - c.nameBox.bottom) <= 4 &&
                   c.dateBox.left >= c.nameBox.right - 0.5 && c.qtyBox.left >= c.dateBox.right - 0.5),
  `name ${Math.round(cards[0].nameBox.left)}-${Math.round(cards[0].nameBox.right)}, date ${Math.round(cards[0].dateBox.left)}-${Math.round(cards[0].dateBox.right)}, qty ${Math.round(cards[0].qtyBox.left)}`);
check('the date is on one line (it does not wrap)', cards.every(c => c.dateBox.h < 20), `${Math.round(cards[0].dateBox.h)}px tall`);
check('no date is clipped', cards.every(c => c.dateClipped === false));
check('no garment name is truncated to make room', cards.every(c => c.nameClipped === false), cards.filter(c => c.nameClipped).map(c => c.name).join(','));
check('every date lies inside its garment block',
  cards.every(c => c.dateBox.left >= c.card.left && c.dateBox.right <= c.card.right && c.dateBox.top >= c.card.top && c.dateBox.bottom <= c.card.bottom));
check('the date prints in pure black', cards.every(c => c.dateColor === 'rgb(0, 0, 0)'), cards[0].dateColor);

// The pagination model charges a measured, fixed height for this bar. The date
// must cost nothing: hide it, and the bar must be exactly as tall as before.
const barHeights = await page.evaluate(() => [...document.querySelectorAll('.production-slip-product-card')].map(card => {
  const bar = card.children[0];
  const dateEl = bar.querySelector('.production-item-delivery');
  const withDate = bar.getBoundingClientRect().height;
  const prev = dateEl.style.display;
  dateEl.style.display = 'none';
  const without = bar.getBoundingClientRect().height;
  dateEl.style.display = prev;
  return { withDate, without };
}));
check('the date makes the garment bar no taller — pagination is unaffected',
  barHeights.every(h => Math.abs(h.withDate - h.without) < 0.3), barHeights.slice(0, 2).map(h => `${h.withDate.toFixed(2)} vs ${h.without.toFixed(2)}`).join('; '));

const slipText = (await page.locator('#printable-production-slip').innerText()).toUpperCase();
const wantTables = ['COAT MEASUREMENTS', 'PANT MEASUREMENTS', 'SHIRT MEASUREMENTS', 'KURTA MEASUREMENTS', 'PAJAMA MEASUREMENTS',
  'WAISTCOAT MEASUREMENTS', 'JACKET MEASUREMENTS', 'SHERWANI MEASUREMENTS'];
const missingTables = wantTables.filter(t => !slipText.includes(t));
check('every garment\'s measurement tables are all still printed', missingTables.length === 0, missingTables.join(', ') || 'all eight');
check('the entered measurement values are still printed', ['30.5', '41', '37', '18.5', '24.5'].every(v => slipText.includes(v)));
check('the remarks band is still printed', slipText.includes('PEAK LAPEL, WORKING BUTTONHOLES'));

/* ------------------------------------------------------- print and the PDF */
console.log('\n=== PRINTED: A4 SHEETS AND THE PDF ===');
await page.emulateMedia({ media: 'print' });
await page.waitForTimeout(600);
const pdf = await page.pdf(A4);
const pdfFile = path.join(TMP, 'slip.pdf');
fs.writeFileSync(pdfFile, pdf);
const sheets = pdfPageCount(pdf);
check('the printed sheets match the page count the slip reports', sheets === reported && sheets >= 2, `${sheets} sheets vs ${reported} reported`);

const overflow = await page.evaluate(() => [...document.querySelectorAll('.a4-production-page')].map(s => s.firstElementChild.scrollHeight - s.firstElementChild.clientHeight));
check('no sheet overflows', overflow.every(o => o <= 0), overflow.join(','));
const inkOutside = await page.evaluate(() => {
  const bad = [];
  document.querySelectorAll('.a4-production-page').forEach((sheet, i) => {
    const sb = sheet.getBoundingClientRect();
    sheet.querySelectorAll('.production-item-delivery').forEach(el => {
      const b = el.getBoundingClientRect();
      if (b.right > sb.right + 0.5 || b.left < sb.left - 0.5 || b.bottom > sb.bottom + 0.5) bad.push(`sheet ${i + 1}`);
    });
  });
  return bad;
});
check('no delivery date runs off the edge of a sheet', inkOutside.length === 0, inkOutside.join(','));
const printedDates = await page.locator('.production-item-delivery').count();
check('all nine dates are laid out for printing', printedDates === 9, `${printedDates}`);

const text = spawnSync('pdftotext', ['-layout', pdfFile, '-'], { encoding: 'utf8' }).stdout || '';
const dateHits = (text.match(new RegExp(DATE, 'g')) || []).length;
check('the PDF itself carries the date on every garment (nine) plus the header', dateHits >= 10, `${dateHits} occurrences of ${DATE}`);
check('the PDF has a "Delivery <date>" for each of the nine garments',
  (text.match(new RegExp(`Delivery\\s+${DATE}`, 'gi')) || []).length >= 9,
  `${(text.match(new RegExp(`Delivery\\s+${DATE}`, 'gi')) || []).length}`);
check('the PDF never says "undefined" or "Invalid"', !/undefined|Invalid Date|NaN/.test(text));
check('the PDF has the order number on every garment', (text.match(new RegExp(`#${orderNo}\\b`, 'g')) || []).length >= 9);
if (SHOT_DIR) {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  fs.copyFileSync(pdfFile, path.join(SHOT_DIR, 'slip-nine-garments.pdf'));
  spawnSync('pdftoppm', ['-png', '-r', '80', pdfFile, path.join(SHOT_DIR, 'slip-nine')]);
}
await closeSlip();

/* ====================================== 2. changing the date moves every garment */
console.log('\n=== EDIT THE ORDER\'S DELIVERY DATE: EVERY GARMENT FOLLOWS ===');
await createOrder(page, { name: 'Slip Edit', phone: '9814300102', garments: ['COAT', 'PANT', 'WAISTCOAT'], measurements: MEASURED });
await finishOrder(page);
const before = (await readDb(page)).orders.find(o => o.customerName === 'Slip Edit');

await page.getByRole('button', { name: /Showroom Orders/i }).click();
await page.waitForTimeout(600);
await page.locator('tbody tr').filter({ hasText: 'Slip Edit' }).first().getByTitle('Edit Order').click();
await page.waitForTimeout(1000);
await page.getByRole('button', { name: /^Continue$/ }).click();       // -> details
await page.waitForTimeout(400);
await page.locator('input[type="date"]').nth(1).fill('2026-12-31');
await page.waitForTimeout(200);
for (let i = 0; i < 3; i++) { await page.getByRole('button', { name: /^Continue$/ }).click(); await page.waitForTimeout(400); }
await page.getByRole('button', { name: /PLACE ORDER/ }).click();
await page.waitForTimeout(1200);
await finishOrder(page);

const after = (await readDb(page)).orders.filter(o => o.customerName === 'Slip Edit');
check('the edit updated the existing order — one order, same number', after.length === 1 && after[0].orderNumber === before.orderNumber,
  after.map(o => '#' + o.orderNumber).join(' '));
check('its delivery date is now 2026-12-31', after[0].deliveryDate === '2026-12-31', after[0].deliveryDate);

await openSlip('Slip Edit');
const edited = await page.evaluate(() => [...document.querySelectorAll('.production-item-delivery')].map(e => e.getAttribute('data-item-delivery')));
check('all three garments now show 2026-12-31', edited.length === 3 && edited.every(d => d === '2026-12-31'), edited.join(','));
check('the slip header agrees', (await page.locator('.production-slip-detail-grid').first().innerText()).includes('2026-12-31'));
await closeSlip();

/* ============================================ 3. an old order with no date */
console.log('\n=== AN OLD ORDER WITH NO DELIVERY DATE STILL PRINTS ===');
await createOrder(page, { name: 'Slip Old', phone: '9814300103', garments: ['COAT', 'PANT'], measurements: MEASURED });
await finishOrder(page);
for (const [label, mutate] of [
  ['an empty date', o => { o.deliveryDate = ''; }],
  ['a missing date', o => { delete o.deliveryDate; }],
  ['a null date', o => { o.deliveryDate = null; }]
]) {
  await page.evaluate(m => {
    const key = 'REGENCY_TAILORS_DB_V3_ORDERS';
    const all = JSON.parse(localStorage.getItem(key) || '[]');
    const o = all.find(x => x.customerName === 'Slip Old');
    new Function('o', m)(o);
    localStorage.setItem(key, JSON.stringify(all));
  }, label === 'an empty date' ? "o.deliveryDate = '';" : label === 'a missing date' ? 'delete o.deliveryDate;' : 'o.deliveryDate = null;');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  await openSlip('Slip Old');
  const body = await page.locator('#printable-production-slip').innerText();
  const dates = await page.evaluate(() => [...document.querySelectorAll('.production-item-delivery')].map(e => (e.textContent || '').replace(/\s+/g, ' ').trim()));
  check(`${label}: the slip still renders, both garments show a dash`, dates.length === 2 && dates.every(d => d === 'Delivery —'), dates.join(' | '));
  check(`${label}: nothing says "undefined", "null" or "Invalid Date"`, !/undefined|\bnull\b|Invalid Date|NaN/.test(body), (body.match(/undefined|\bnull\b|Invalid Date|NaN/) || [''])[0]);
  const ov = await page.evaluate(() => [...document.querySelectorAll('.a4-production-page')].map(s => s.firstElementChild.scrollHeight - s.firstElementChild.clientHeight));
  check(`${label}: the sheet does not overflow`, ov.every(o => o <= 0), ov.join(','));
  await page.emulateMedia({ media: 'print' });
  const p = await page.pdf(A4);
  check(`${label}: it prints as a PDF`, pdfPageCount(p) >= 1, `${pdfPageCount(p)} sheet(s)`);
  await closeSlip();
}

/* =================================== 4. the on-screen slip detail shows it too */
console.log('\n=== THE ON-SCREEN SLIP DETAIL ===');
const openDetail = async customer => {
  await page.getByRole('button', { name: /Production Slips/i }).first().click();
  await page.waitForTimeout(900);
  const row = page.locator('tr, div').filter({ hasText: customer }).filter({ has: page.locator('button[title="View Production Slip"]') }).last();
  await row.locator('button[title="View Production Slip"]').first().click();
  await page.waitForTimeout(1200);
};

await openDetail('Slip Dates');
const detailDates = await page.evaluate(() => [...document.querySelectorAll('.production-item-delivery')].map(e => e.getAttribute('data-item-delivery')));
check('the slip detail screen shows a date on each of the nine garments', detailDates.length === 9 && detailDates.every(d => d === DATE), `${detailDates.length} dates`);
const detailText = await page.locator('div.fixed.inset-0.z-50').last().innerText();
check('and the order\'s own delivery date above them', detailText.includes(DATE));
await closeSlip();

await openDetail('Slip Old');
const oldDetail = await page.locator('div.fixed.inset-0.z-50').last().innerText();
const oldDates = await page.evaluate(() => [...document.querySelectorAll('.production-item-delivery')].map(e => (e.textContent || '').replace(/\s+/g, ' ').trim()));
check('an order with no date: each garment shows a dash on the detail screen', oldDates.length === 2 && oldDates.every(d => d === 'Delivery —'), oldDates.join(' | '));
check('an order with no date: nothing says "undefined" or "null"', !/undefined|\bnull\b|Invalid Date|NaN/.test(oldDetail), (oldDetail.match(/undefined|\bnull\b|Invalid Date|NaN/) || [''])[0]);
check('an order with no date is not labelled OVERDUE', !/OVERDUE/i.test(oldDetail));
await closeSlip();

check('no uncaught page errors', errors.length === 0, errors.slice(0, 3).join(' | ') || 'none');
await browser.close();
process.exit(report.summary() ? 1 : 0);
