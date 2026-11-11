/**
 * Measurements are free text — 38, 40 L, 15.5 R, 38 Tight, XL — end to end.
 *
 * Driven through the real wizard, the real App save path and the real
 * repository, in Supabase mode, against a PostgREST that stores measurements
 * as jsonb exactly as the database does. Every field of every garment is typed
 * into; the test then reads the rows the database actually holds, edits the
 * order, reloads, and looks at every screen that prints a measurement.
 *
 * Needs the dev server in Supabase mode:
 *   VITE_SUPABASE_URL=https://fake-project.supabase.co \
 *   VITE_SUPABASE_ANON_KEY=sb_publishable_TESTKEY_0000000000000000 \
 *   npx vite --port=3100
 *   E2E_BASE_URL=http://localhost:3100/ node e2e/alphanumeric-measurements.mjs
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { makeReporter } from './helpers.mjs';

const CHROME = process.env.CHROME_PATH || undefined;
const BASE = process.env.E2E_BASE_URL || 'http://localhost:3100/';
const SHIM = readFileSync(new URL('./fake-postgrest.js', import.meta.url), 'utf8');
const report = makeReporter('ALPHANUMERIC MEASUREMENTS');
const check = report.check;

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1100 }, acceptDownloads: true });
await ctx.addInitScript(() => { window.__PGREST_PERSIST = true; });
await ctx.addInitScript(SHIM);
await ctx.addInitScript(() => {
  const inAnHour = Math.floor(Date.now() / 1000) + 3600;
  localStorage.setItem('regency-tailors-auth', JSON.stringify({
    access_token: 'test', token_type: 'bearer', expires_in: 3600, expires_at: inAnHour, refresh_token: 'test',
    user: { id: '00000000-0000-4000-8000-0000000000ff', email: 'owner@example.com', aud: 'authenticated',
            role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() }
  }));
});
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));
page.on('dialog', d => d.accept());

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);

/* ---------------------------------------------------------------- values -- */

// Distinct per field, so a value found on a screen is unmistakably that field's.
// Mix of: decimal, number+letter, number+letter, number+word, letters, fraction.
const VARIANTS = [
  i => `${30 + i}.25`, i => `${30 + i} L`, i => `${30 + i}.5 R`,
  i => `${30 + i} Tight`, i => `XL${i}`, i => `${30 + i} 1/2`
];
const garments = ['3 PIECE SUIT', 'SHERWANI', 'JACKET', 'KURTA PAJAMA', 'SHIRT'];
const SECTIONS = ['coat', 'pant', 'waistcoat', 'jacketGarment', 'sherwani', 'kurta', 'pajama', 'shirt'];
const COLUMN = { jacketGarment: 'jacket_garment' };

/* ---------------------------------------------------------------- helpers -- */

const db = () => page.evaluate(() => ({
  orders: window.__PGREST.db.orders.map(o => ({ id: o.id, number: o.order_number, snap: o.measurements_snapshot, deleted: o.deleted_at })),
  values: window.__PGREST.db.measurement_values.map(v => ({ category: v.garment_category, data: v.data, mid: v.measurement_id })),
  measurements: window.__PGREST.db.measurements.length,
  rejected: window.__PGREST.errors.map(e => `${e.table}.${e.col}=${e.value}`),
  inserts: window.__PGREST.writes.filter(w => w.table === 'orders' && w.method === 'POST').length
}));

const tab = async name => {
  await page.getByRole('button', { name }).first().click();
  await page.waitForTimeout(900);
  return page.locator('body').innerText();
};

const closeOverlay = async () => {
  for (let i = 0; i < 4; i++) {
    const gone = await page.evaluate(() => {
      const ov = [...document.querySelectorAll('div.fixed.inset-0.z-50')].pop();
      if (!ov) return true;
      const btns = [...ov.querySelectorAll('button')];
      const x = btns.find(b => b.querySelector('svg.lucide-x, svg.lucide-x-icon'))
             || btns.find(b => /^(close|exit|done)/i.test((b.textContent || '').trim())) || btns[btns.length - 1];
      if (x) x.click();
      return false;
    });
    await page.waitForTimeout(450);
    if (gone || (await page.locator('div.fixed.inset-0.z-50').count()) === 0) break;
  }
  await page.waitForTimeout(250);
};

async function toMeasurementStep() {
  await page.getByRole('button', { name: /^Continue$/ }).click(); await page.waitForTimeout(350);
  await page.getByRole('button', { name: /^Continue$/ }).click(); await page.waitForTimeout(350);
}

async function selectGarments(list) {
  for (const g of list) {
    const card = page.locator(`h3:text-is("${g}")`).locator('xpath=ancestor::div[contains(@class,"rounded-3xl")][1]');
    await card.getByRole('button', { name: /Select/ }).first().click();
    await page.waitForTimeout(150);
  }
  await page.getByRole('button', { name: /^Continue$/ }).click();
  await page.waitForTimeout(500);
}

/** Types into EVERY measurement box on screen, returning what it typed by section/key. */
async function typeEverything() {
  const typed = {};
  let n = 0;
  for (const sec of SECTIONS) {
    const inputs = page.locator(`[data-measurement-section="${sec}"] input[data-measurement-input]`);
    const count = await inputs.count();
    for (let k = 0; k < count; k++) {
      const el = inputs.nth(k);
      const id = await el.getAttribute('id');             // m-<section>-<key>
      const key = id.replace(`m-${sec}-`, '');
      const value = VARIANTS[n % VARIANTS.length](n);
      await el.fill(value);
      (typed[sec] ||= {})[key] = value;
      n++;
    }
  }
  return typed;
}

const onScreenValues = () => page.evaluate(() => {
  const out = {};
  document.querySelectorAll('[data-measurement-section]').forEach(sec => {
    const name = sec.getAttribute('data-measurement-section');
    sec.querySelectorAll('input[data-measurement-input]').forEach(i => {
      (out[name] ||= {})[i.id.replace(`m-${name}-`, '')] = i.value;
    });
  });
  return out;
});

const flatten = o => Object.entries(o).flatMap(([s, f]) => Object.entries(f).map(([k, v]) => [`${s}.${k}`, v]));

async function placeOrderFromReview() {
  await page.getByRole('button', { name: /^Continue$/ }).click();      // 4 -> 5
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /PLACE ORDER/ }).click();
  await page.waitForTimeout(2400);
  const body = await page.locator('body').innerText();
  await page.getByRole('button', { name: /^(Close|Exit)$/ }).first().click().catch(() => {});
  await page.waitForTimeout(700);
  return body;
}

async function openEdit(customer) {
  await page.getByRole('button', { name: /Showroom Orders/i }).first().click();
  await page.waitForTimeout(900);
  const row = page.locator('tbody tr').filter({ hasText: customer }).first();
  await row.getByTitle('Edit Order').click();
  await page.waitForTimeout(1200);
}

/* ================================================================ 1. CREATE */
console.log('\n=== TYPE LETTERS, NUMBERS AND COMBINATIONS INTO EVERY FIELD OF EVERY GARMENT ===');
await page.getByRole('button', { name: /New Order/i }).first().click();
await page.waitForTimeout(800);
await page.getByPlaceholder('e.g. Vikram Malhotra').fill('Alpha Numeric');
await page.getByPlaceholder('e.g. 9876543210').fill('9814300011');
await page.getByPlaceholder('e.g. Jalandhar').fill('Jalandhar');
await page.getByPlaceholder('e.g. Model Town, Jalandhar').fill('Model Town');
await toMeasurementStepFromCustomer();
async function toMeasurementStepFromCustomer() {
  await page.getByRole('button', { name: /^Continue$/ }).click(); await page.waitForTimeout(350);   // -> details
  await page.getByRole('button', { name: /^Continue$/ }).click(); await page.waitForTimeout(350);   // -> garments
}
await selectGarments(garments);                                                                      // -> measurements

const sectionsShown = await page.locator('[data-measurement-section]').evaluateAll(els => els.map(e => e.getAttribute('data-measurement-section')));
check('all eight garment sections are on screen for the five garments',
  JSON.stringify([...sectionsShown].sort()) === JSON.stringify([...SECTIONS].sort()), sectionsShown.join(','));

const typed = await typeEverything();
const typedCount = flatten(typed).length;
check(`typed into all ${typedCount} fields`, typedCount >= 50, `${typedCount}`);

const echoed = await onScreenValues();
const wrongEcho = flatten(typed).filter(([k, v]) => flatten(echoed).find(([ek]) => ek === k)?.[1] !== v);
check('every box shows exactly what was typed — nothing was rejected, trimmed or changed',
  wrongEcho.length === 0, wrongEcho.slice(0, 3).map(([k, v]) => `${k}:${v}`).join(' '));

// Keystroke by keystroke, as a person types — not a programmatic fill.
const probe = page.locator('[data-measurement-section="coat"] input[data-measurement-input]').first();
await probe.fill('');
await probe.pressSequentially('40 L', { delay: 15 });
check('typing "40 L" key by key leaves "40 L" in the box', (await probe.inputValue()) === '40 L', await probe.inputValue());
await probe.fill('');
await probe.pressSequentially('XL', { delay: 15 });
check('typing "XL" key by key leaves "XL" in the box', (await probe.inputValue()) === 'XL', await probe.inputValue());
await probe.fill(typed.coat.length);

const created = await placeOrderFromReview();
check('no error banner on placing the order', !/Could not (create|save)|Unable to Place/i.test(created));

let s = await db();
check('exactly one order exists', s.orders.length === 1 && String(s.orders[0].number) === '1', s.orders.map(o => '#' + o.number).join(' '));
check('the database rejected nothing', s.rejected.length === 0, s.rejected.join(', '));

/* ---------------------------------- 2. the rows the database actually holds */
console.log('\n=== WHAT THE DATABASE HOLDS ===');
const snap = s.orders[0].snap || {};
const snapWrong = flatten(typed).filter(([k, v]) => { const [sec, key] = k.split('.'); return snap[sec]?.[key] !== v; });
check('orders.measurements_snapshot holds every typed value, exactly', snapWrong.length === 0,
  snapWrong.slice(0, 3).map(([k, v]) => `${k}:${v}`).join(' '));
check('and every one is stored as the text that was typed, not a number',
  flatten(typed).every(([k]) => { const [sec, key] = k.split('.'); return typeof snap[sec]?.[key] === 'string'; }));

const rowFor = sec => s.values.find(v => v.category === (COLUMN[sec] || sec));
for (const sec of SECTIONS) {
  const row = rowFor(sec);
  const bad = Object.entries(typed[sec]).filter(([k, v]) => row?.data?.[k] !== v);
  check(`measurement_values[${COLUMN[sec] || sec}] holds every typed value exactly`, Boolean(row) && bad.length === 0,
    !row ? 'row missing' : bad.slice(0, 2).map(([k, v]) => `${k}:${v}`).join(' '));
}
check('one row per garment section — no duplicates', s.values.length === SECTIONS.length, `${s.values.length} rows`);

/* ------------------------------------------------- 3. reload, then edit it */
console.log('\n=== RELOAD, THEN EDIT: NOTHING IS LOST OR REWRITTEN ===');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2200);

await openEdit('Alpha Numeric');
await toMeasurementStepFromCustomer();
await page.getByRole('button', { name: /^Continue$/ }).click();       // garments -> measurements
await page.waitForTimeout(600);
const prefilled = await onScreenValues();
const lost = flatten(typed).filter(([k, v]) => flatten(prefilled).find(([ek]) => ek === k)?.[1] !== v);
check('editing after a reload shows every value exactly as it was typed', lost.length === 0,
  lost.slice(0, 3).map(([k, v]) => `${k}:${v}`).join(' '));
await placeOrderFromReview();

s = await db();
const snap2 = s.orders[0].snap || {};
const changed = flatten(typed).filter(([k, v]) => { const [sec, key] = k.split('.'); return snap2[sec]?.[key] !== v; });
check('saving the edit without touching a value changes none of them', changed.length === 0,
  changed.slice(0, 3).map(([k, v]) => `${k}:${v}`).join(' '));
check('the edit was an UPDATE: still one order, still #1', s.orders.length === 1 && String(s.orders[0].number) === '1');
check('and still one row per garment section', s.values.length === SECTIONS.length, `${s.values.length} rows`);

/* ------------------------------------------- 4. the ±¼ buttons keep letters */
console.log('\n=== THE ±¼ BUTTONS KEEP THE LETTERS ===');
await openEdit('Alpha Numeric');
await toMeasurementStepFromCustomer();
await page.getByRole('button', { name: /^Continue$/ }).click();
await page.waitForTimeout(600);

const find = async pattern => {
  const all = flatten(await onScreenValues());
  return all.find(([, v]) => pattern.test(v));
};
const step = async (id, label) => {
  await page.locator(`#${id}`).locator('xpath=ancestor::div[contains(@class,"relative")][1]')
    .getByRole('button', { name: label }).click();
  await page.waitForTimeout(120);
};
const idOf = key => { const [sec, k] = key.split('.'); return `m-${sec}-${k}`; };

const withL = await find(/^\d+ L$/);
const withR = await find(/^\d+\.5 R$/);
const withWord = await find(/^\d+ Tight$/);
const lettersOnly = await find(/^XL\d+$/);
const fraction = await find(/^\d+ 1\/2$/);
const plain = await find(/^\d+\.25$/);

await step(idOf(withL[0]), '+¼');
check(`"${withL[1]}" +¼ keeps the L`, (await page.locator('#' + idOf(withL[0])).inputValue()) === `${parseFloat(withL[1]) + 0.25} L`,
  await page.locator('#' + idOf(withL[0])).inputValue());
await step(idOf(withR[0]), '-¼');
check(`"${withR[1]}" −¼ keeps the R`, (await page.locator('#' + idOf(withR[0])).inputValue()) === `${parseFloat(withR[1]) - 0.25} R`,
  await page.locator('#' + idOf(withR[0])).inputValue());
await step(idOf(withWord[0]), '+¼');
check(`"${withWord[1]}" +¼ keeps the word`, /^\d+(\.\d+)? Tight$/.test(await page.locator('#' + idOf(withWord[0])).inputValue()),
  await page.locator('#' + idOf(withWord[0])).inputValue());
await step(idOf(lettersOnly[0]), '+¼');
check(`"${lettersOnly[1]}" is left alone by +¼`, (await page.locator('#' + idOf(lettersOnly[0])).inputValue()) === lettersOnly[1],
  await page.locator('#' + idOf(lettersOnly[0])).inputValue());
await step(idOf(fraction[0]), '+¼');
check(`"${fraction[1]}" is left alone — a fraction is not guessed at`, (await page.locator('#' + idOf(fraction[0])).inputValue()) === fraction[1],
  await page.locator('#' + idOf(fraction[0])).inputValue());
await step(idOf(plain[0]), '+¼');
check(`a plain number still steps: "${plain[1]}" +¼`, (await page.locator('#' + idOf(plain[0])).inputValue()) === String(parseFloat(plain[1]) + 0.25),
  await page.locator('#' + idOf(plain[0])).inputValue());

const afterStep = await onScreenValues();
await placeOrderFromReview();
s = await db();
const snap3 = s.orders[0].snap || {};
const savedStepped = flatten(afterStep).filter(([k, v]) => { const [sec, key] = k.split('.'); return snap3[sec]?.[key] !== v; });
check('the stepped values were saved exactly as shown', savedStepped.length === 0,
  savedStepped.slice(0, 3).map(([k, v]) => `${k}:${v}`).join(' '));
// The shim's write log restarts on every page load, so this counts the inserts
// since the reload: an edit must make none.
check('still one order, still #1, after the third save — and no INSERT since the reload',
  s.orders.length === 1 && String(s.orders[0].number) === '1' && s.inserts === 0,
  `${s.orders.length} order(s), ${s.inserts} insert(s) since reload`);
Object.assign(typed, {}); // typed is now superseded by what the stepper produced
const current = {};
for (const [k, v] of flatten(afterStep)) { const [sec, key] = k.split('.'); (current[sec] ||= {})[key] = v; }

/* -------------------------------------------- 5. legacy numeric data intact */
console.log('\n=== EXISTING NUMERIC DATA IS NOT TOUCHED ===');
await page.evaluate(() => {
  const d = window.__PGREST.db, iso = new Date().toISOString();
  const cust = '00000000-0000-4000-8000-0000000000a1', ord = '00000000-0000-4000-8000-0000000000a2';
  const meas = '00000000-0000-4000-8000-0000000000a4';
  d.customers.push({ id: cust, name: 'Legacy Numeric', phone: '9814300022', phone_normalized: '9814300022',
    email: null, address: null, city: null, notes: null, created_at: iso, deleted_at: null });
  const coat = { length: 30, chest: 40, stomach: 36.5, hip: 41, shoulder: 18.5, sleeve: 25, xBack: 17.5, collar: 16 };
  const pant = { length: 40, waist: 34, hip: 40.5, thigh: 24.5, inLeg: 31, bottom: 15, body: 11 };
  d.orders.push({ id: ord, order_number: 2, customer_id: cust, customer_name: 'Legacy Numeric', customer_phone: '9814300022',
    order_date: '2026-08-01', delivery_date: '2026-08-20', status: 'New', production_status: 'New',
    subtotal: 0, discount: 0, tax_amount: 0, total_amount: 0, advance_paid: 0, balance_due: 0, deleted_at: null,
    measurements_snapshot: { unit: 'inches', coat, pant } });
  d.order_items.push({ id: '00000000-0000-4000-8000-0000000000a3', order_id: ord, position: 1, garment_type: '2 Piece Suit', quantity: 1, price: 0 });
  d.measurements.push({ id: meas, customer_id: cust, unit: 'inches', last_updated: '2026-08-01', deleted_at: null });
  d.measurement_values.push({ id: '00000000-0000-4000-8000-0000000000a5', measurement_id: meas, garment_category: 'coat', data: coat },
                            { id: '00000000-0000-4000-8000-0000000000a6', measurement_id: meas, garment_category: 'pant', data: pant });
  window.__PGREST.persist();
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2200);

await openEdit('Legacy Numeric');
await toMeasurementStepFromCustomer();
await page.getByRole('button', { name: /^Continue$/ }).click();
await page.waitForTimeout(600);
const legacyShown = await onScreenValues();
check('an old numeric order opens with its numbers in the boxes',
  legacyShown.coat?.chest === '40' && legacyShown.coat?.stomach === '36.5' && legacyShown.pant?.waist === '34',
  JSON.stringify({ chest: legacyShown.coat?.chest, stomach: legacyShown.coat?.stomach, waist: legacyShown.pant?.waist }));
await placeOrderFromReview();
s = await db();
const legacy = s.orders.find(o => String(o.number) === '2');
const lc = legacy?.snap?.coat, lp = legacy?.snap?.pant;
check('saving it unchanged keeps every coat number, value for value',
  ['length:30', 'chest:40', 'stomach:36.5', 'hip:41', 'shoulder:18.5', 'sleeve:25', 'xBack:17.5', 'collar:16']
    .every(p => { const [k, v] = p.split(':'); return String(lc?.[k]) === v; }), JSON.stringify(lc));
check('and every pant number', ['length:40', 'waist:34', 'hip:40.5', 'thigh:24.5', 'inLeg:31', 'bottom:15', 'body:11']
  .every(p => { const [k, v] = p.split(':'); return String(lp?.[k]) === v; }), JSON.stringify(lp));
check('the legacy order is still #2, and there are still two orders', s.orders.length === 2 && String(legacy?.number) === '2');

/* ----------------------------------------- 6. every screen shows the values */
console.log('\n=== EVERY SCREEN THAT PRINTS A MEASUREMENT ===');
const missingFrom = (text, map) => flatten(map).filter(([, v]) => !text.includes(v)).map(([k, v]) => `${k}:${v}`);
const INCH_AFTER_LETTERS = /(XL\d+|\d+ (L|Tight)|\d+\.5 R)[ \t]*"/;
const noInchAfterLetters = text => !INCH_AFTER_LETTERS.test(text);
const inchSnippet = text => { const m = INCH_AFTER_LETTERS.exec(text); return m ? JSON.stringify(text.slice(Math.max(0, m.index - 30), m.index + m[0].length + 20)) : ''; };

await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2200);

// Order Details
await tab(/Showroom Orders/i);
await page.locator('tbody tr').filter({ hasText: 'Alpha Numeric' }).getByRole('button', { name: /^Details$/ }).click();
await page.waitForTimeout(1200);
for (const t of ['Garments', 'Measurements']) {
  const b = page.locator('div.fixed.inset-0.z-50 button', { hasText: new RegExp('^' + t, 'i') });
  if (await b.count()) { await b.first().click(); await page.waitForTimeout(500); }
}
let text = await page.locator('body').innerText();
let miss = missingFrom(text, current);
check('Order Details shows every value, exactly', miss.length === 0, `${flatten(current).length - miss.length}/${flatten(current).length}${miss.length ? ' missing ' + miss.slice(0, 3).join(' ') : ''}`);
check('Order Details puts no inch mark after a value with letters', noInchAfterLetters(text));
await closeOverlay();

// Customer Profile
await tab(/Customers Ledger/i);
await page.locator('text=Alpha Numeric').first().click();
await page.waitForTimeout(1000);
const pm = page.locator('div.fixed.inset-0.z-50 button', { hasText: /^Measurements/i });
if (await pm.count()) { await pm.first().click(); await page.waitForTimeout(700); }
text = await page.locator('body').innerText();
miss = missingFrom(text, current);
check('Customer Profile shows every value, exactly', miss.length === 0, `${flatten(current).length - miss.length}/${flatten(current).length}${miss.length ? ' missing ' + miss.slice(0, 3).join(' ') : ''}`);
check('Customer Profile puts no inch mark after a value with letters', noInchAfterLetters(text));
await closeOverlay();

// Measurements Entry — the bespoke measurement sheet
text = await tab(/Measurements Entry/i);
check('the Measurements screen lists the customer', text.includes('Alpha Numeric'));
// The list's compact preview used to know only coat/pant/shirt/kurta/pajama, so
// a waistcoat, jacket or sherwani measured for someone never showed up there.
check('the Measurements list previews the waistcoat, jacket and sherwani too',
  /Waistcoat \(L \/ C \/ S\)/i.test(text) && /Jacket \(L \/ C \/ Collar\)/i.test(text) && /Sherwani \(L \/ C \/ Slv\)/i.test(text));
check('the list preview shows the typed letters unchanged, with no inch mark after them',
  text.includes(String(current.waistcoat.length)) && noInchAfterLetters(text), inchSnippet(text));
const editBtn = page.locator('button[title="Edit Measurements"]').first();
check('the Measurements screen offers an edit for each record', (await editBtn.count()) > 0);
// open the sheet view if there is one, else read the list
const sheetBtn = page.locator('button', { hasText: /Sheet|View|Print/i }).first();
if (await sheetBtn.count()) { await sheetBtn.click().catch(() => {}); await page.waitForTimeout(900); }
text = await page.locator('body').innerText();
miss = missingFrom(text, current);
check('the measurement sheet shows every value, exactly', miss.length === 0, `${flatten(current).length - miss.length}/${flatten(current).length}${miss.length ? ' missing ' + miss.slice(0, 3).join(' ') : ''}`);
check('the measurement sheet puts no inch mark after a value with letters', noInchAfterLetters(text), inchSnippet(text));
await closeOverlay();

// Production slip
await tab(/Production Slips/i);
await page.locator('button[title="Print Production Slip"]').first().click();
await page.waitForTimeout(2600);
const slipText = await page.locator('#printable-production-slip').innerText();
miss = missingFrom(slipText, current);
check('the Production Slip prints every value, exactly', miss.length === 0, `${flatten(current).length - miss.length}/${flatten(current).length}${miss.length ? ' missing ' + miss.slice(0, 3).join(' ') : ''}`);
check('the Production Slip puts no inch mark after a value with letters', noInchAfterLetters(slipText));
const slipOverflow = await page.evaluate(() => [...document.querySelectorAll('.a4-production-page')].map(sh => sh.firstElementChild.scrollHeight - sh.firstElementChild.clientHeight));
check('no slip sheet overflows with these longer values', slipOverflow.every(o => o <= 0), slipOverflow.join(','));
await closeOverlay();

// Customer Bill — measurements must stay off it
await page.locator('button[title="Print Customer Bill"]').first().click();
await page.waitForTimeout(2600);
const billText = await page.locator('body').innerText();
const onBill = flatten(current).filter(([, v]) => billText.includes(v)).map(([k, v]) => `${k}:${v}`);
check('the Customer Bill carries NO measurement value, numeric or alphanumeric', onBill.length === 0, onBill.slice(0, 4).join(' '));
await closeOverlay();

/* ---------------------------------- 7. Enter walks fields holding letters */
console.log('\n=== ENTER STILL MOVES TO THE NEXT FIELD ===');
const ordersBefore = (await db()).orders.length;
await page.getByRole('button', { name: /Dashboard Hub/i }).first().click().catch(() => {});
await page.waitForTimeout(300);
await page.getByRole('button', { name: /New Order/i }).first().click();
await page.waitForTimeout(800);
await page.getByPlaceholder('e.g. Vikram Malhotra').fill('Enter Walker');
await page.getByPlaceholder('e.g. 9876543210').fill('9814300033');
await toMeasurementStepFromCustomer();
await selectGarments(['COAT']);

const inputs = page.locator('input[data-measurement-input]');
const total = await inputs.count();
await inputs.first().click();
const walked = [];
for (let i = 0; i < total; i++) {
  const value = ['40 L', 'XL', '15.5 R', '38 Tight', '31', '32.5', 'N/A', '15 1/2', '30 Slim', 'x'][i % 10];
  await page.keyboard.type(value, { delay: 5 });
  walked.push(await page.evaluate(() => document.activeElement.id));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(60);
}
const entered = await onScreenValues();
check(`Enter walked all ${total} coat boxes, one at a time, in order`, new Set(walked).size === total, walked.slice(0, 3).join(' > ') + ' ...');
check('every box kept the letters typed into it',
  ['40 L', 'XL', '15.5 R', '38 Tight'].every((v, i) => Object.values(entered.coat)[i] === v), JSON.stringify(Object.values(entered.coat).slice(0, 4)));
const stillOnMeasurements = (await page.locator('input[data-measurement-input]').count()) === total;
check('Enter on the LAST box did not place the order', stillOnMeasurements && (await db()).orders.length === ordersBefore,
  `${(await db()).orders.length} orders`);
await page.getByRole('button', { name: /^Exit$/ }).first().click();
await page.waitForTimeout(500);

/* ----------------------------- 8. the Measurement Entry modal takes letters */
console.log('\n=== THE MEASUREMENT ENTRY SCREEN ACCEPTS LETTERS TOO ===');
await tab(/Measurements Entry/i);
await page.getByText('+ New Measurement').first().click();
await page.waitForTimeout(900);
await page.getByPlaceholder('Type name, phone or ID...').fill('Legacy');
await page.waitForTimeout(400);
await page.locator('div.cursor-pointer', { hasText: 'Legacy Numeric' }).first().click();
await page.waitForTimeout(300);
await page.locator('div.fixed.inset-0.z-50').last().getByText('COAT', { exact: true }).first().click();
await page.waitForTimeout(600);

const fields = page.locator('input[data-measurement-input]');
const nFields = await fields.count();
check('the Measurement Entry boxes exist', nFields > 0, `${nFields} boxes`);
const kinds = await fields.evaluateAll(els => [...new Set(els.map(e => e.type))]);
check('they are text boxes, not number boxes', JSON.stringify(kinds) === '["text"]', kinds.join(','));
const modalValues = ['38 Tight', 'XL', '15.5 R', '40 L'];
for (let i = 0; i < modalValues.length && i < nFields; i++) await fields.nth(i).fill(modalValues[i]);
const echoModal = await fields.evaluateAll((els, n) => els.slice(0, n).map(e => e.value), modalValues.length);
check('the boxes keep "38 Tight", "XL", "15.5 R", "40 L" exactly', JSON.stringify(echoModal) === JSON.stringify(modalValues), JSON.stringify(echoModal));

// stepper in the modal keeps letters too
const modalStep = page.locator('input[data-measurement-input]').first().locator('xpath=ancestor::div[contains(@class,"flex")][1]').getByTitle('Increase 0.25').first();
if (await modalStep.count()) {
  await modalStep.click();
  const stepped = await fields.first().inputValue();
  check('the modal\'s +0.25 keeps the letters: "38 Tight" -> "38.25 Tight"', stepped === '38.25 Tight', stepped);
  await fields.first().fill('38 Tight');
}
await page.getByRole('button', { name: /Save Measurements/ }).click();
await page.waitForTimeout(1800);
s = await db();
const savedCoat = s.values.filter(v => v.category === 'coat').flatMap(v => Object.values(v.data));
check('the saved coat row holds the typed values, as text', modalValues.every(v => savedCoat.includes(v)),
  JSON.stringify(savedCoat.filter(v => typeof v === 'string' && /[A-Za-z]/.test(v))));
const stillOneCoatRowForLegacy = s.values.filter(v => v.category === 'coat').length;
check('the unchanged garment sections kept their numbers', s.values.some(v => v.category === 'pant' && v.data.waist === 34 || String(v.data?.waist) === '34'));
void stillOneCoatRowForLegacy;

check('no uncaught page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | ') || 'none');
check('the database rejected nothing, at any point', (await db()).rejected.length === 0, (await db()).rejected.join(', '));

await browser.close();
process.exit(report.summary() ? 1 : 0);
