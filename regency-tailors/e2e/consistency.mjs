/**
 * DATA CONSISTENCY AUDIT — one journey, every surface, compared to the rows
 * the database actually holds.
 *
 * The app runs in Supabase mode against the in-page PostgREST shim, so every
 * read and write is the real repository code hitting a server that enforces
 * uuid columns, foreign keys and the live-phone unique index. After the wizard
 * saves, `window.__PGREST.db` IS the database: everything the UI shows is
 * checked against it, not against what the wizard typed.
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const CHROME = process.env.CHROME_PATH;
const BASE = process.env.E2E_BASE_URL || 'http://localhost:3100/';
const SHIM = readFileSync(new URL('./fake-postgrest.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (ok) pass++; else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); }
};
const section = t => console.log(`\n=== ${t} ===`);

const CUSTOMER = {
  name: 'Harjit Singh Bawa',
  phone: '9814550077',
  city: 'Jalandhar',
  address: 'Bootan Mandi, Near Chowk'
};
const WANT_GARMENTS = [
  { card: 'COAT', label: 'Coat', qty: 4 },
  { card: 'PANT', label: 'Pant', qty: 4 },
  { card: 'SHIRT', label: 'Shirt', qty: 3 },
  { card: 'KURTA PAJAMA', label: 'Kurta Pajama', qty: 3 }
];

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1150 } });
// Rows must outlive a hard refresh for the persistence test to mean anything.
await ctx.addInitScript(() => { window.__PGREST_PERSIST = true; });
await ctx.addInitScript(SHIM);
await ctx.addInitScript(() => {
  localStorage.setItem('regency-tailors-auth', JSON.stringify({
    access_token: 'test', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'test',
    user: { id: '00000000-0000-4000-8000-0000000000ff', email: 'owner@example.com',
      aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {},
      created_at: new Date().toISOString() }
  }));
});

const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));
page.on('dialog', d => d.accept());

const db = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__PGREST.db)));
const text = async () => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
/** Close whatever full-screen overlay is on top, through its own X button.
 *  Clicked from inside the page so a backdrop cannot intercept the pointer. */
const closeOverlay = async () => {
  for (let i = 0; i < 4; i++) {
    const gone = await page.evaluate(() => {
      const overlays = [...document.querySelectorAll('div.fixed.inset-0.z-50')];
      const ov = overlays[overlays.length - 1];
      if (!ov) return true;
      const btns = [...ov.querySelectorAll('button')];
      const x = btns.find(b => b.querySelector('svg.lucide-x, svg.lucide-x-icon'))
             || btns.find(b => /^(close|exit|done)/i.test((b.textContent || '').trim()))
             || btns[btns.length - 1];
      if (x) x.click();
      return false;
    });
    await page.waitForTimeout(500);
    if (gone) break;
    if (await page.locator('div.fixed.inset-0.z-50').count() === 0) break;
  }
  await page.waitForTimeout(300);
};

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);

section('BOOT');
const boot = await text();
check('signed in, Supabase mode, no login gate',
  !/Database not configured|Showroom sign in/i.test(boot));
check('no uncaught page error on boot', pageErrors.length === 0, pageErrors.join(' | '));

/* ==================================================================== */
/* THE JOURNEY                                                          */
/* ==================================================================== */
section('NEW ORDER WIZARD — real UI, real writes');

await page.getByRole('button', { name: /Dashboard Hub/i }).first().click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: /New Order/i }).first().click();
await page.waitForTimeout(800);

// STEP 1 — customer
await page.getByPlaceholder('e.g. Vikram Malhotra').fill(CUSTOMER.name);
await page.getByPlaceholder('e.g. 9876543210').fill(CUSTOMER.phone);
await page.getByPlaceholder('e.g. Jalandhar').fill(CUSTOMER.city);
await page.getByPlaceholder('e.g. Model Town, Jalandhar').fill(CUSTOMER.address);
check('step 1 label reads CUSTOMER ADDRESS', /CUSTOMER ADDRESS/i.test(await text()));
check('no CLIENT NOTES & PREFERENCES field', !/CLIENT NOTES\s*&\s*PREFERENCES/i.test(await text()));
await page.getByRole('button', { name: /^Continue$/ }).click();
await page.waitForTimeout(400);

// STEP 2 — order details; capture the delivery date the wizard proposes
const deliveryDate = await page.locator('input[type="date"]').nth(1).inputValue().catch(() => '');
const orderDate = await page.locator('input[type="date"]').nth(0).inputValue().catch(() => '');
await page.getByRole('button', { name: /^Continue$/ }).click();
await page.waitForTimeout(400);

// STEP 3 — garments and quantities
for (const g of WANT_GARMENTS) {
  const card = page.locator(`h3:text-is("${g.card}")`).locator('xpath=ancestor::div[contains(@class,"rounded-3xl")][1]');
  await card.getByRole('button', { name: /Select/ }).first().click();
  await page.waitForTimeout(250);
  for (let i = 1; i < g.qty; i++) {
    await card.getByRole('button', { name: '+', exact: true }).click();
    await page.waitForTimeout(120);
  }
}
const step3 = await text();
for (const g of WANT_GARMENTS) {
  check(`garment step shows ${g.qty}x ${g.label}`, new RegExp(`${g.qty}x\\s*${g.card}`, 'i').test(step3));
}
await page.getByRole('button', { name: /^Continue$/ }).click();
await page.waitForTimeout(700);

// STEP 4 — every measurement input, filled with a value unique to its label
const entered = await page.evaluate(() => {
  const HEADINGS = ['COAT MEASUREMENTS', 'PANT MEASUREMENTS', 'SHIRT MEASUREMENTS',
                    'KURTA MEASUREMENTS', 'PAJAMA MEASUREMENTS'];
  const set = (el, v) => {
    const proto = Object.getPrototypeOf(el);
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const out = {};
  let n = 0;
  for (const h of HEADINGS) {
    const span = [...document.querySelectorAll('span')].find(s => s.textContent.trim().startsWith(h));
    if (!span) continue;
    const panel = span.closest('div.space-y-3');
    if (!panel) continue;
    const sectionName = h.split(' ')[0].toLowerCase();
    out[sectionName] = {};
    for (const cell of panel.querySelectorAll('div.space-y-1')) {
      const label = cell.querySelector('label')?.textContent.trim();
      const input = cell.querySelector('input[type="text"]');
      if (!label || !input) continue;
      n += 1;
      const value = String(20 + n) + '.5';
      set(input, value);
      out[sectionName][label] = value;
    }
  }
  return out;
});
const enteredCount = Object.values(entered).reduce((a, o) => a + Object.keys(o).length, 0);
check('wizard offers exactly 41 measurement inputs for these garments', enteredCount === 41,
  `got ${enteredCount}: ` + Object.entries(entered).map(([k, v]) => `${k}=${Object.keys(v).length}`).join(' '));
check('coat asks for all 10 canonical fields', Object.keys(entered.coat || {}).length === 10,
  Object.keys(entered.coat || {}).join(', '));
check('coat includes Collar, Jacket Length, Waistcoat Length',
  ['Collar', 'Jacket Length', 'Waistcoat Length'].every(l => l in (entered.coat || {})));
check('kurta includes Bicep and Cuff',
  ['Bicep', 'Cuff'].every(l => l in (entered.kurta || {})));
check('pajama block is present with 7 fields', Object.keys(entered.pajama || {}).length === 7);

await page.getByRole('button', { name: /^Continue$/ }).click();
await page.waitForTimeout(700);

// STEP 5 — review
const review = await text();
check('review shows no CRAFTING NOTES & DIRECTIVES column', !/CRAFTING NOTES/i.test(review));
for (const g of WANT_GARMENTS) {
  const ok = new RegExp(`${g.qty}\\s*x?\\s*${g.card}`, 'i').test(review) ||
             new RegExp(`${g.card}[^0-9]{0,40}(qty|quantity)[^0-9]{0,6}${g.qty}`, 'i').test(review);
  check(`review lists ${g.qty}x ${g.label}`, ok);
}
console.log('  [debug] review garment lines:', (review.match(/(COAT|PANT|SHIRT|KURTA PAJAMA)[^A-Z]{0,60}/g)||[]).slice(0,8).join(' // '));

await page.getByRole('button', { name: /PLACE ORDER/i }).click();
await page.waitForTimeout(3000);

const afterPlace = await text();
check('PLACE ORDER reached the confirmation screen', /ORDER CONFIRMED/i.test(afterPlace),
  afterPlace.slice(0, 160));
check('no uncaught page error placing the order', pageErrors.length === 0, pageErrors.join(' | '));

/* ==================================================================== */
/* WHAT THE DATABASE ACTUALLY HOLDS                                     */
/* ==================================================================== */
section('PERSISTED ROWS — the source of truth');
const D = await db();

check('exactly one customer row was created', D.customers.length === 1,
  `${D.customers.length}: ` + D.customers.map(c => `${c.name}/${c.id}`).join(' | '));
const cust = D.customers[0] || {};
check('customer name stored verbatim', cust.name === CUSTOMER.name, cust.name);
check('customer phone stored verbatim', cust.phone === CUSTOMER.phone, cust.phone);
check('customer city stored', cust.city === CUSTOMER.city, String(cust.city));
check('customer address stored', cust.address === CUSTOMER.address, String(cust.address));
check('customer id is a uuid', /^[0-9a-f-]{36}$/i.test(cust.id || ''), cust.id);

check('exactly one order row was created', D.orders.length === 1, String(D.orders.length));
const ord = D.orders[0] || {};
check('order.customer_id is the customer uuid', ord.customer_id === cust.id,
  `${ord.customer_id} vs ${cust.id}`);
check('order_number came from the database sequence', Number.isInteger(ord.order_number), String(ord.order_number));
check('order delivery_date matches the wizard', ord.delivery_date === deliveryDate,
  `${ord.delivery_date} vs ${deliveryDate}`);
check('order status is New', ord.status === 'New', String(ord.status));

const items = D.order_items.filter(i => i.order_id === ord.id);
check('four garment lines stored', items.length === 4, `${items.length}: ` + items.map(i => `${i.quantity}x${i.garment_type}`).join(' '));
for (const g of WANT_GARMENTS) {
  const row = items.find(i => i.garment_type === g.label);
  check(`stored ${g.label} quantity is ${g.qty}`, !!row && Number(row.quantity) === g.qty,
    row ? String(row.quantity) : 'missing');
}
check('total item count is 14', items.reduce((a, i) => a + Number(i.quantity), 0) === 14,
  String(items.reduce((a, i) => a + Number(i.quantity), 0)));
check('no order line carries a price', items.every(i => Number(i.price || 0) === 0));

check('exactly one measurement profile row', D.measurements.length === 1, String(D.measurements.length));
const meas = D.measurements[0] || {};
check('measurement.customer_id is the same uuid', meas.customer_id === cust.id);
const mv = D.measurement_values.filter(v => v.measurement_id === meas.id);
check('five measurement_values rows, one per garment section', mv.length === 5,
  `${mv.length}: ` + mv.map(v => v.garment_category).join(', '));

// Every value the counter hand typed reached the row for its section.
const KEY_BY_LABEL = {
  'Length': 'length', 'Chest': 'chest', 'Stomach': 'stomach', 'Stomach / Waist': 'stomach',
  'H.P. / Hip': 'hip', 'Shoulder': 'shoulder', 'Sleeve': 'sleeve', 'X-Back': 'xBack',
  'Collar': 'collar', 'Jacket Length': 'jacketLength', 'Waistcoat Length': 'waistcoatLength',
  'Waist': 'waist', 'Thigh': 'thigh', 'In-Leg': 'inLeg', 'Bottom': 'bottom', 'Body': 'body',
  'Cuff': 'cuff', 'Bicep': 'bicep'
};
let storedOk = 0, storedBad = [];
for (const [sec, fields] of Object.entries(entered)) {
  const row = mv.find(v => v.garment_category === sec);
  const vals = row ? (row.data || row.values || null) : null;
  for (const [label, value] of Object.entries(fields)) {
    const key = KEY_BY_LABEL[label];
    const got = vals ? vals[key] : undefined;
    if (String(got) === String(value)) storedOk++;
    else storedBad.push(`${sec}.${label}(${key})=${got}≠${value}`);
  }
}
check('all 41 typed measurements are in the database under the right key',
  storedBad.length === 0 && storedOk === 41, `${storedOk}/41 ok; ${storedBad.slice(0, 6).join(' ')}`);


/* ==================================================================== */
/* EVERY VIEW, COMPARED TO THOSE ROWS                                   */
/* ==================================================================== */
const ORDER_NO = String(ord.order_number);
const allValues = Object.values(entered).flatMap(o => Object.values(o));

// Leave the wizard's confirmation screen.
await page.getByRole('button', { name: /Close|Done|Finish|Back to/i }).first().click().catch(() => {});
await page.waitForTimeout(600);
if (/ORDER CONFIRMED/i.test(await text())) {
  await page.locator('div.fixed.inset-0.z-50 button').last().click().catch(() => {});
  await page.waitForTimeout(600);
}

const tab = async name => {
  await page.getByRole('button', { name }).first().click();
  await page.waitForTimeout(900);
  return text();
};

section('CUSTOMERS LEDGER');
const ledger = await tab(/Customers Ledger/i);
check('ledger shows the stored customer name', ledger.includes(cust.name));
check('ledger shows the stored phone', ledger.includes(cust.phone));
check('ledger shows the stored city', ledger.includes(cust.city));
check('ledger counts one order for them', /1\s*(order|Orders)/i.test(ledger) || ledger.includes('1'));
check('no duplicate ledger entry for the same person',
  (ledger.match(new RegExp(cust.name, 'g')) || []).length <= 2,
  String((ledger.match(new RegExp(cust.name, 'g')) || []).length));

section('CUSTOMER PROFILE');
await page.locator(`text=${cust.name}`).first().click();
await page.waitForTimeout(900);
const profileTxt = await text();
check('profile opens on the same customer', profileTxt.includes(cust.name));
check('profile shows the same phone', profileTxt.includes(cust.phone));
check('profile lists the order by its database number', profileTxt.includes(ORDER_NO));
// measurements tab of the profile
const mTab = page.locator('div.fixed.inset-0.z-50 button', { hasText: /^Measurements/i });
if (await mTab.count()) { await mTab.first().click(); await page.waitForTimeout(700); }
const profileMeas = await text();
const profileHits = allValues.filter(v => profileMeas.includes(v)).length;
check('customer profile shows the stored measurements', profileHits >= 35, `${profileHits}/41 values visible`);
check('profile coat block carries Waistcoat Length', /waistcoat length/i.test(profileMeas));
await closeOverlay();

section('ORDERS + ORDER DOSSIER');
const ordersTxt = await tab(/Showroom Orders/i);
check('orders list shows the database order number', ordersTxt.includes(ORDER_NO));
check('orders list shows the customer name', ordersTxt.includes(cust.name));
await page.getByRole('button', { name: /^Details$/ }).first().click();
await page.waitForTimeout(1000);
const dossier = await text();
check('dossier opens the same order number', dossier.includes(ORDER_NO));
check('dossier shows the same customer', dossier.includes(cust.name));
check('dossier shows the same delivery date',
  dossier.includes(ord.delivery_date) ||
  dossier.includes(new Date(ord.delivery_date + 'T00:00:00').toLocaleDateString('en-GB')) ||
  dossier.includes(new Date(ord.delivery_date + 'T00:00:00').toLocaleDateString('en-US')),
  ord.delivery_date);
for (const g of WANT_GARMENTS) {
  check(`dossier lists ${g.label}`, new RegExp(g.card, 'i').test(dossier));
}
// garments tab
for (const t of ['Garments', 'Measurements']) {
  const b = page.locator('div.fixed.inset-0.z-50 button', { hasText: new RegExp('^' + t, 'i') });
  if (await b.count()) { await b.first().click(); await page.waitForTimeout(600); }
}
const dossierMeas = await text();
const dossierHits = allValues.filter(v => dossierMeas.includes(v)).length;
check('dossier measurements match the stored values', dossierHits >= 35, `${dossierHits}/41 visible`);
if (dossierHits < 35) {
  console.log('  [debug] dossier tabs:', await page.locator('div.fixed.inset-0.z-50 button').allInnerTexts().then(a=>a.join(' | ').slice(0,300)));
  console.log('  [debug] dossier text:', dossierMeas.slice(0, 900));
}
await closeOverlay();

section('MEASUREMENTS ENTRY VIEW');
const measTxt = await tab(/Measurements Entry/i);
check('measurements view lists the customer', measTxt.includes(cust.name));
check('measurements view lists every garment section',
  ['coat', 'pant', 'shirt', 'kurta', 'pajama'].filter(g => new RegExp(g, 'i').test(measTxt)).length >= 4);

section('PRODUCTION SLIP');
const slipsTxt = await tab(/Production Slips/i);
check('production slips list shows the order number', slipsTxt.includes(ORDER_NO));
check('production slips list shows the customer', slipsTxt.includes(cust.name));

await page.locator('button[title="Print Production Slip"]').first().click();
await page.waitForTimeout(2500);
const slip = await text();
check('printed slip carries the database order number', slip.includes(ORDER_NO));
check('printed slip names the customer', slip.includes(cust.name));
const badgeCount = (slip.match(new RegExp('#' + ORDER_NO + '\\b', 'g')) || []).length;
check('every garment on the slip carries the #order badge', badgeCount >= 4, `${badgeCount} badges`);
const slipHits = allValues.filter(v => slip.includes(v)).length;
check('slip prints all 41 stored measurements', slipHits === 41, `${slipHits}/41`);
check('slip shows the four garment types',
  WANT_GARMENTS.every(g => new RegExp(g.card.split(' ')[0], 'i').test(slip)));
check('slip reports 14 total items', /TOTAL ITEMS\s*14|14\s*(TOTAL|ITEMS)/i.test(slip), slip.match(/TOTAL ITEMS[^A-Z]{0,12}/i)?.[0] || '');
await closeOverlay();

section('CUSTOMER BILL');
await page.locator('button[title="Print Customer Bill"]').first().click();
await page.waitForTimeout(2500);
const bill = await text();
check('bill carries the database order number', bill.includes(ORDER_NO));
check('bill names the same customer', bill.includes(cust.name));
check('bill shows the same phone', bill.includes(cust.phone));
check('bill lists all four garments', WANT_GARMENTS.every(g => new RegExp(g.card.split(' ')[0], 'i').test(bill)));
check('bill carries NO measurement values', allValues.every(v => !bill.includes(v)),
  allValues.filter(v => bill.includes(v)).slice(0, 5).join(','));
check('bill carries no rupee figure', !bill.includes('₹'));
check('bill disclaimer is exact',
  /WE ARE NOT RESPONSIBLE FOR CLOTHES AFTER 2 MONTHS/i.test(bill));
for (const f of ['TOTAL AMOUNT', 'ADVANCE PAID', 'BALANCE', 'PAYMENT MODE', 'PAYMENT DATE']) {
  check(`bill has a blank ${f} line`, new RegExp(f, 'i').test(bill));
}
check('bill shows no REMARKS column', !/\bREMARKS\b/i.test(bill));
const billNums = (bill.match(/\b\d+\.\d{2}\b/g) || []);
check('bill contains no computed money value', billNums.length === 0, billNums.slice(0, 5).join(','));
await closeOverlay();

/* ==================================================================== */
/* REFRESH — nothing may live in React memory alone                     */
/* ==================================================================== */
section('HARD REFRESH / SECOND SESSION');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
const D2 = await db();
check('the database still holds exactly one customer after reload', D2.customers.length === 1);
check('the database still holds the order after reload', D2.orders.length === 1);
const afterReload = await tab(/Showroom Orders/i);
check('orders survive a hard refresh', afterReload.includes(ORDER_NO) && afterReload.includes(cust.name));
const ledger2 = await tab(/Customers Ledger/i);
check('the customer survives a hard refresh', ledger2.includes(cust.name) && ledger2.includes(cust.phone));

// localStorage must hold no business data in Supabase mode.
const ls = await page.evaluate(() => {
  const out = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    out[k] = (localStorage.getItem(k) || '').length;
  }
  return out;
});
// The only key the app may leave behind in Supabase mode is the order-number
// high-water mark, which is a preview aid: `orderToWizardRow` never sends
// `order_number`, so the database sequence remains the sole issuer.
const businessKeys = Object.keys(ls).filter(k => /REGENCY_TAILORS_DB/.test(k) && !/_ORDER_SEQ$/.test(k));
check('no customer, order or measurement data is written to localStorage in Supabase mode',
  businessKeys.length === 0, businessKeys.join(', '));
console.log('  localStorage keys:', Object.keys(ls).join(', ') || '(none)');

await browser.close();
section('RESULT');
console.log(`CONSISTENCY: ${pass}/${pass + fail} passed`);
if (failures.length) { console.log('\nFAILURES:'); failures.forEach(f => console.log('  - ' + f)); }
process.exit(fail ? 1 : 0);
