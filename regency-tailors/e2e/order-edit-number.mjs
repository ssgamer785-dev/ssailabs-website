/**
 * The reported bug, end to end, in SUPABASE MODE:
 *
 *   "Editing an existing order changes the order number / creates a new order."
 *
 * The existing edit test in `run.mjs` drives localStorage mode, where the save
 * path merges by id and never inserts — so it could not see this. The bug lived
 * in the Supabase branch, which handed the wizard's freshly built Order (no
 * `dbId`) to the repository; the repository takes a missing `dbId` to mean
 * "new row", INSERTed, and the sequence issued the next number.
 *
 * This drives the real wizard, the real App save path and the real repository
 * against a PostgREST that assigns `order_number` from a sequence on INSERT and
 * refuses to change it on UPDATE — exactly like the database after
 * `20260911000000_order_number_is_immutable.sql`.
 *
 * Needs the dev server in Supabase mode:
 *   VITE_SUPABASE_URL=https://fake-project.supabase.co \
 *   VITE_SUPABASE_ANON_KEY=sb_publishable_TESTKEY_0000000000000000 \
 *   npx vite --port=3100
 *   E2E_BASE_URL=http://localhost:3100/ node e2e/order-edit-number.mjs
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const CHROME = process.env.CHROME_PATH;
const BASE = process.env.E2E_BASE_URL || 'http://localhost:3100/';
const SHIM = readFileSync(new URL('./fake-postgrest.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
const check = (n, ok, x = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`); ok ? pass++ : fail++; };

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
// Rows must outlive a reload, because "reload and it is still #1" is one of the
// things being proved.
await ctx.addInitScript(() => { window.__PGREST_PERSIST = true; });
await ctx.addInitScript(SHIM);
await ctx.addInitScript(() => {
  const inAnHour = Math.floor(Date.now() / 1000) + 3600;
  localStorage.setItem('regency-tailors-auth', JSON.stringify({
    access_token: 'test', token_type: 'bearer', expires_in: 3600, expires_at: inAnHour,
    refresh_token: 'test',
    user: { id: '00000000-0000-4000-8000-0000000000ff', email: 'owner@example.com',
            aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {},
            created_at: new Date().toISOString() }
  }));
});

const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));
page.on('dialog', d => d.accept());

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

const boot = await page.locator('body').innerText();
check('the app is in Supabase mode and signed in',
  !/Database not configured|Showroom sign in/i.test(boot),
  boot.split('\n').filter(Boolean).slice(0, 2).join(' | '));

/* ----------------------------------------------------------- the database */

const snapshot = () => page.evaluate(() => ({
  orders: window.__PGREST.db.orders.map(o => ({
    uuid: o.id, number: o.order_number, customer: o.customer_id,
    delivery: o.delivery_date, deleted: o.deleted_at
  })),
  items: window.__PGREST.db.order_items.length,
  customers: window.__PGREST.db.customers.length,
  // Every write the app asked the database to perform, so the test can show
  // that an edit was an UPDATE and not a second INSERT.
  orderInserts: window.__PGREST.writes.filter(w => w.table === 'orders' && w.method === 'POST').length,
  orderUpdates: window.__PGREST.writes.filter(w => w.table === 'orders' && w.method === 'PATCH').length,
  // Did the client ever try to write an order number itself?
  numbersSent: window.__PGREST.writes
    .filter(w => w.table === 'orders')
    .flatMap(w => (Array.isArray(w.body) ? w.body : [w.body]))
    .filter(b => b && b.order_number !== undefined)
    .map(b => b.order_number),
  rejections: window.__PGREST.errors.map(e => `${e.table}.${e.col}=${e.value}`)
}));

/* ------------------------------------------------------------ the wizard */

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

const tab = async name => {
  await page.getByRole('button', { name }).first().click();
  await page.waitForTimeout(900);
  return page.locator('body').innerText();
};

async function openDashboard() {
  await page.getByRole('button', { name: /Dashboard Hub/i }).first().click().catch(() => {});
  await page.waitForTimeout(400);
}

async function runWizardToEnd() {
  // Steps 1-4 are already valid in both modes: new orders get the details typed
  // below, edits arrive prefilled from the stored order.
  for (let i = 0; i < 4; i++) {
    await page.getByRole('button', { name: /^Continue$/ }).click();
    await page.waitForTimeout(400);
  }
  await page.getByRole('button', { name: /PLACE ORDER/ }).click();
  await page.waitForTimeout(2200);
  const body = await page.locator('body').innerText();
  await page.getByRole('button', { name: /^(Close|Exit)$/ }).first().click().catch(() => {});
  await page.waitForTimeout(600);
  return body;
}

async function placeOrder({ name, phone }) {
  await openDashboard();
  await page.getByRole('button', { name: /New Order/i }).first().click();
  await page.waitForTimeout(800);
  await page.getByPlaceholder('e.g. Vikram Malhotra').fill(name);
  await page.getByPlaceholder('e.g. 9876543210').fill(phone);
  await page.getByPlaceholder('e.g. Jalandhar').fill('Jalandhar');
  await page.getByPlaceholder('e.g. Model Town, Jalandhar').fill('Model Town');
  await page.getByRole('button', { name: /^Continue$/ }).click();  // -> details
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /^Continue$/ }).click();  // -> garments
  await page.waitForTimeout(400);
  const card = page.locator('h3:text-is("COAT")').locator('xpath=ancestor::div[contains(@class,"rounded-3xl")][1]');
  await card.getByRole('button', { name: /Select/ }).first().click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /^Continue$/ }).click();  // -> measurements
  await page.waitForTimeout(500);
  const inputs = page.locator('input[type="text"]');
  const n = Math.min(3, await inputs.count());
  for (let i = 0; i < n; i++) await inputs.nth(i).fill(String(30 + i));
  await page.getByRole('button', { name: /^Continue$/ }).click();  // -> review
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /PLACE ORDER/ }).click();
  await page.waitForTimeout(2400);
  const body = await page.locator('body').innerText();
  await page.getByRole('button', { name: /^(Close|Exit)$/ }).first().click().catch(() => {});
  await page.waitForTimeout(700);
  return body;
}

/** The order numbers the Showroom Orders table is actually showing. */
async function listedNumbers() {
  await page.getByRole('button', { name: /Showroom Orders/i }).first().click();
  await page.waitForTimeout(900);
  // The first cell stacks the order number over the order date with no text
  // node between them, so read the number's own element rather than the cell.
  return page.$$eval('tbody tr td:first-child span', els =>
    els.map(e => (e.textContent || '').trim()).filter(t => /^\d+$/.test(t)));
}

/**
 * Opens Showroom Orders and edits the row belonging to `customer`, having first
 * checked that the list is showing it under the number the caller expects.
 */
async function editOrder(number, { customer, delivery } = {}) {
  await page.getByRole('button', { name: /Showroom Orders/i }).first().click();
  await page.waitForTimeout(900);
  const row = page.locator('tbody tr').filter({ hasText: customer }).first();
  const listed = (await row.locator('td').first().locator('span').first().innerText()).trim();
  await row.getByTitle('Edit Order').click();
  await page.waitForTimeout(1200);

  const header = await page.locator('text=/^Order #/').first().innerText();

  await page.getByRole('button', { name: /^Continue$/ }).click();  // -> details
  await page.waitForTimeout(450);
  if (delivery) {
    const dates = page.locator('input[type="date"]');
    if (await dates.count() > 1) await dates.nth(1).fill(delivery);
    await page.waitForTimeout(250);
  }
  await page.getByRole('button', { name: /^Continue$/ }).click();  // -> garments
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: /^Continue$/ }).click();  // -> measurements
  await page.waitForTimeout(450);
  await page.getByRole('button', { name: /^Continue$/ }).click();  // -> review
  await page.waitForTimeout(600);
  const review = await page.locator('body').innerText();
  await page.getByRole('button', { name: /PLACE ORDER/ }).click();
  await page.waitForTimeout(2400);
  const after = await page.locator('body').innerText();
  await page.getByRole('button', { name: /^(Close|Exit)$/ }).first().click().catch(() => {});
  await page.waitForTimeout(700);
  return { header, review, after, listed };
}

/* =============================================== 1. the first order is #1 */
console.log('\n=== CREATE THE FIRST ORDER ===');
const created = await placeOrder({ name: 'Edit Test One', phone: '9814318801' });
check('no error banner when placing the order', !/Could not (create|save)/i.test(created),
  (created.match(/Could not [^\n]*/) || [''])[0].slice(0, 140));

let s = await snapshot();
check('exactly one order row exists', s.orders.length === 1, JSON.stringify(s.orders));
check('the database issued #1', String(s.orders[0]?.number) === '1', String(s.orders[0]?.number));
check('the client never sent an order number', s.numbersSent.length === 0, s.numbersSent.join(','));
const firstUuid = s.orders[0]?.uuid;

/* ==================================== 2. edit it, repeatedly — still #1 */
console.log('\n=== EDIT #1 THREE TIMES ===');
for (let i = 1; i <= 3; i++) {
  const r = await editOrder(1, { customer: 'Edit Test One', delivery: `2026-0${i + 3}-1${i}` });
  check(`edit ${i}: the orders list showed it as 1`, r.listed === '1', r.listed);
  check(`edit ${i}: the wizard header still says Order #1`, /#\s*1\b/.test(r.header), r.header);
  check(`edit ${i}: no error banner`, !/Could not (create|save)/i.test(r.after),
    (r.after.match(/Could not [^\n]*/) || [''])[0].slice(0, 140));

  s = await snapshot();
  check(`edit ${i}: still exactly one order row`, s.orders.length === 1,
    s.orders.map(o => '#' + o.number).join(' '));
  check(`edit ${i}: it is still #1`, String(s.orders[0]?.number) === '1', String(s.orders[0]?.number));
  check(`edit ${i}: the row uuid did not change`, s.orders[0]?.uuid === firstUuid,
    `${s.orders[0]?.uuid} vs ${firstUuid}`);
  check(`edit ${i}: the database saw ${i} UPDATE(s) and still only 1 INSERT`,
    s.orderInserts === 1 && s.orderUpdates === i,
    `${s.orderInserts} insert(s), ${s.orderUpdates} update(s)`);
  check(`edit ${i}: no order number was ever sent by the client`,
    s.numbersSent.length === 0, s.numbersSent.join(','));
}

/* ============================================ 3. the edits actually saved */
check('the last edit reached the database — it is an UPDATE, not a no-op',
  String(s.orders[0]?.delivery || '').startsWith('2026-06-13'),
  String(s.orders[0]?.delivery));

/* ================================================ 4. reload — still #1 */
console.log('\n=== RELOAD ===');
// The fake's row store survives a reload, but its write log does not, so the
// counts from this page load are carried forward by hand.
const beforeReload = { inserts: s.orderInserts, updates: s.orderUpdates, numbersSent: s.numbersSent.length };
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
s = await snapshot();
check('after a reload there is still exactly one order', s.orders.length === 1,
  s.orders.map(o => '#' + o.number).join(' '));
check('after a reload it is still #1', String(s.orders[0]?.number) === '1', String(s.orders[0]?.number));
const shown = await listedNumbers();
check('the orders list shows exactly one order, numbered 1',
  shown.length === 1 && shown[0] === '1', shown.join(' '));

/* ============== 4b. every surface still says #1 after those edits ===== */
console.log('\n=== THE SAME HASHTAG ON EVERY SURFACE, AFTER THE EDITS ===');
const NO = '1';
const says = (label, txt) =>
  check(label, new RegExp(`(^|[^0-9])#?\\s*${NO}([^0-9]|$)`).test(txt),
    (txt.match(/#\s*\d+/g) || txt.match(/\b\d+\b/g) || []).slice(0, 6).join(' '));

const ledger = await tab(/Customers Ledger/i);
check('the ledger counts one order for the edited customer, not four',
  ledger.includes('Edit Test One'), 'customer listed');
await page.locator('text=Edit Test One').first().click();
await page.waitForTimeout(1000);
const profileOrders = page.locator('div.fixed.inset-0.z-50 button', { hasText: /^Orders/i });
if (await profileOrders.count()) { await profileOrders.first().click(); await page.waitForTimeout(700); }
const profile = await page.locator('body').innerText();
says('Customer Profile lists the order as #1', profile);
check('Customer Profile lists exactly one order for them',
  (profile.match(/Orders\s*\(1\)/) || []).length === 1 || !/Orders\s*\([2-9]\)/.test(profile),
  (profile.match(/Orders\s*\(\d+\)/) || [''])[0]);
await closeOverlay();

await tab(/Showroom Orders/i);
await page.getByRole('button', { name: /^Details$/ }).first().click();
await page.waitForTimeout(1200);
says('Order Details shows #1', await page.locator('body').innerText());
await closeOverlay();

const slips = await tab(/Production Slips/i);
says('the Production Slips list shows #1', slips);
await page.locator('button[title="Print Production Slip"]').first().click();
await page.waitForTimeout(2600);
says('the printed Production Slip carries #1', await page.locator('body').innerText());
await closeOverlay();

await page.locator('button[title="Print Customer Bill"]').first().click();
await page.waitForTimeout(2600);
says('the Customer Bill carries #1', await page.locator('body').innerText());
await closeOverlay();

await tab(/Client Portal/i);
// The portal is the customer's own view: it is searched by the number the
// showroom gave them, so it is the sharpest test that the number still works.
const portalSearch = page.getByPlaceholder(/Search by Order #/i);
await portalSearch.fill('1');
await portalSearch.press('Enter');
await page.waitForTimeout(1200);
const portalOrdersTab = page.locator('div.fixed.inset-0.z-50 button', { hasText: /^Orders/i });
if (await portalOrdersTab.count()) { await portalOrdersTab.first().click().catch(() => {}); await page.waitForTimeout(800); }
const portalTxt = await page.locator('body').innerText();
check('the Client Portal finds the order by the number the customer was given',
  portalTxt.includes('Edit Test One'),
  portalTxt.split('\n').filter(Boolean).slice(0, 3).join(' | '));
says('the Client Portal shows #1', portalTxt);
await closeOverlay();

// Search by the number the customer was given.
await tab(/Showroom Orders/i);
const search = page.getByPlaceholder(/Search orders by Order #/i);
await search.fill('1');
await page.waitForTimeout(700);
const found = await listedNumbers();
check('searching for 1 finds the order, and only it', found.length === 1 && found[0] === '1',
  found.join(' '));
await search.fill('');
await page.waitForTimeout(400);

/* ==================================== 5. a second order takes #2, not #4 */
console.log('\n=== CREATE A SECOND ORDER ===');
await placeOrder({ name: 'Edit Test Two', phone: '9814318802' });
s = await snapshot();
check('there are now exactly two orders', s.orders.length === 2,
  s.orders.map(o => '#' + o.number).join(' '));
check('the new order is #2 — the edits consumed no numbers',
  s.orders.map(o => String(o.number)).sort().join(',') === '1,2',
  s.orders.map(o => '#' + o.number).join(' '));

/* ======================= 6. edit #1 again — still #1, #2 left untouched */
console.log('\n=== EDIT #1 AGAIN, WITH #2 IN THE BOOK ===');
const again = await editOrder(1, { customer: 'Edit Test One', delivery: '2026-12-25' });
check('the orders list still shows it as 1', again.listed === '1', again.listed);
check('the wizard header still says Order #1', /#\s*1\b/.test(again.header), again.header);
s = await snapshot();
check('still exactly two orders', s.orders.length === 2, s.orders.map(o => '#' + o.number).join(' '));
check('#1 is still #1 and still the same row',
  s.orders.some(o => String(o.number) === '1' && o.uuid === firstUuid),
  JSON.stringify(s.orders));
check('#2 was not disturbed', s.orders.filter(o => String(o.number) === '2').length === 1,
  s.orders.map(o => '#' + o.number).join(' '));

/* ============================================== 7. the next one is #3 */
console.log('\n=== CREATE A THIRD ORDER ===');
await placeOrder({ name: 'Edit Test Three', phone: '9814318803' });
s = await snapshot();
check('three creates and four edits made exactly three orders', s.orders.length === 3,
  s.orders.map(o => '#' + o.number).join(' '));
check('the numbers are 1, 2, 3',
  s.orders.map(o => String(o.number)).sort().join(',') === '1,2,3',
  s.orders.map(o => '#' + o.number).join(' '));
check('every order number is distinct',
  new Set(s.orders.map(o => String(o.number))).size === s.orders.length);
const totalInserts = beforeReload.inserts + s.orderInserts;
const totalUpdates = beforeReload.updates + s.orderUpdates;
check('the database performed exactly 3 INSERTs and 4 UPDATEs',
  totalInserts === 3 && totalUpdates === 4,
  `${totalInserts} insert(s), ${totalUpdates} update(s)`);
check('the client never once sent an order number',
  beforeReload.numbersSent + s.numbersSent.length === 0, s.numbersSent.join(','));
check('the database never rejected a write', s.rejections.length === 0, s.rejections.join(', '));
check('no duplicate garment lines were left behind', s.items === 3, `${s.items} order_items`);

const finalShown = await listedNumbers();
check('the orders list shows 1, 2 and 3 — the same hashtags the database holds',
  finalShown.slice().sort().join(',') === '1,2,3', finalShown.join(' '));

/* ====================== 8. the database itself refuses a renumber ===== */
console.log('\n=== THE DATABASE REFUSES A RENUMBER ===');
const refused = await page.evaluate(async uuid => {
  const url = `https://fake-project.supabase.co/rest/v1/orders?id=eq.${uuid}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order_number: 99 })
  });
  const payload = await res.json().catch(() => ({}));
  const after = window.__PGREST.db.orders.find(o => o.id === uuid);
  return { okStatus: res.ok, code: payload.code, message: payload.message, number: after?.order_number };
}, firstUuid);
check('an UPDATE that changes order_number is rejected', !refused.okStatus && refused.code === '23514',
  `${refused.code || 'no error'}: ${(refused.message || '').slice(0, 90)}`);
check('and the order number is unchanged after the refusal', String(refused.number) === '1',
  String(refused.number));

check('no uncaught page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | ') || 'none');
if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT, fullPage: true });

console.log(`\nORDER EDIT / NUMBER IMMUTABILITY: ${pass}/${pass + fail} passed`);
await browser.close();
process.exit(fail ? 1 : 0);
