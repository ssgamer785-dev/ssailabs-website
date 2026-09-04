/**
 * Drives the REAL New Order wizard, in Supabase mode, against a PostgREST that
 * enforces uuid columns — the reported failure, reproduced or not, end to end.
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const CHROME = process.env.CHROME_PATH;
// Needs a dev server in SUPABASE MODE, pointed at a host only the shim answers:
//   VITE_SUPABASE_URL=https://fake-project.supabase.co \
//   VITE_SUPABASE_ANON_KEY=sb_publishable_TESTKEY_0000000000000000 \
//   npx vite --port=3100
//   E2E_BASE_URL=http://localhost:3100/ node e2e/order-uuid.mjs
const BASE = process.env.E2E_BASE_URL || 'http://localhost:3100/';
const SHIM = readFileSync(new URL('./fake-postgrest.js', import.meta.url), 'utf8');
const PHONE = process.env.PHONE || '9814318809';
const NAME = process.env.NAME || 'gab hru';

let pass = 0, fail = 0;
const check = (n, ok, x = '') => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`); ok ? pass++ : fail++; };

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
await ctx.addInitScript(SHIM);
// A signed-in, authorised session, so the gate opens without a real Google login.
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

const body0 = await page.locator('body').innerText();
check('the app is in Supabase mode and signed in',
  !/Database not configured|Showroom sign in/i.test(body0),
  body0.split('\n').filter(Boolean).slice(0, 2).join(' | '));

/* ------------------------------------------------ run the wizard ------ */
async function placeOrder({ name, phone }) {
  await page.getByRole('button', { name: /Dashboard Hub/i }).first().click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /New Order/i }).first().click();
  await page.waitForTimeout(700);

  await page.getByPlaceholder('e.g. Vikram Malhotra').fill(name);
  await page.getByPlaceholder('e.g. 9876543210').fill(phone);
  await page.getByPlaceholder('e.g. Jalandhar').fill('Jalandhar');
  await page.getByPlaceholder('e.g. Model Town, Jalandhar').fill('Model Town');
  await page.getByRole('button', { name: /^Continue$/ }).click();  // -> order details
  await page.waitForTimeout(350);
  await page.getByRole('button', { name: /^Continue$/ }).click();  // -> garments
  await page.waitForTimeout(350);

  const card = page.locator('h3:text-is("COAT")').locator('xpath=ancestor::div[contains(@class,"rounded-3xl")][1]');
  await card.getByRole('button', { name: /Select/ }).first().click();
  await page.waitForTimeout(350);
  await page.getByRole('button', { name: /^Continue$/ }).click();  // -> measurements
  await page.waitForTimeout(500);

  // A couple of real measurements, entered in the wizard's own inputs.
  const inputs = page.locator('input[type="text"]');
  const n = Math.min(3, await inputs.count());
  for (let i = 0; i < n; i++) await inputs.nth(i).fill(String(30 + i));

  await page.getByRole('button', { name: /^Continue$/ }).click();  // -> review
  await page.waitForTimeout(600);

  const review = await page.locator('body').innerText();
  const onReview = /REVIEW|Place Order/i.test(review);

  await page.getByRole('button', { name: /Place Order/i }).first().click();
  await page.waitForTimeout(2500);
  return { onReview };
}

console.log('\n=== PLACE ORDER — brand new customer ===');
const first = await placeOrder({ name: NAME, phone: PHONE });
check('the wizard reached the Review step', first.onReview);

const after = await page.locator('body').innerText();
const uuidError = /invalid input syntax for type uuid/i.test(after);
check('NO uuid error on screen', !uuidError,
  (after.match(/Could not [^\n]*/) || [''])[0].slice(0, 120));
check('no error banner is showing', !/Could not (create|save)/i.test(after),
  (after.match(/Could not [^\n]*/) || [''])[0].slice(0, 140));

const state = await page.evaluate(() => ({
  customers: window.__PGREST.db.customers.map(c => ({ id: c.id, name: c.name, phone: c.phone_normalized })),
  orders: window.__PGREST.db.orders.map(o => ({ id: o.id, n: o.order_number, customer_id: o.customer_id })),
  measurements: window.__PGREST.db.measurements.map(m => ({ id: m.id, customer_id: m.customer_id })),
  items: window.__PGREST.db.order_items.length,
  uuidErrors: window.__PGREST.errors,
  sentCustomerIds: window.__PGREST.writes
    .filter(w => w.method === 'POST' && (w.table === 'orders' || w.table === 'measurements'))
    .flatMap(w => w.body.map(r => r.customer_id))
}));

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
check('the database rejected no uuid at all', state.uuidErrors.length === 0,
  state.uuidErrors.map(e => `${e.table}.${e.col}="${e.value}"`).join(', ') || 'none');
check('exactly one customer row exists', state.customers.length === 1, JSON.stringify(state.customers));
check('exactly one order row exists', state.orders.length === 1, JSON.stringify(state.orders));
check('the order carries a real uuid', Boolean(state.orders[0]) && UUID_RE.test(state.orders[0].customer_id),
  state.orders[0]?.customer_id);
check('the order points at that customer',
  Boolean(state.orders[0]) && state.orders[0].customer_id === state.customers[0]?.id);
check('the measurement points at the same customer',
  state.measurements.length === 1 && state.measurements[0].customer_id === state.customers[0]?.id,
  JSON.stringify(state.measurements));
check('the order garment line was written', state.items === 1, `${state.items} items`);
check('no CUST- id was ever sent to a customer_id column',
  state.sentCustomerIds.every(v => UUID_RE.test(String(v))), state.sentCustomerIds.join(', '));

/* --------------------------------------- reload, then a second order --- */
console.log('\n=== RELOAD, THEN A SECOND ORDER ON THE SAME PHONE ===');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
// The fake database is per-page-load, so re-seed it with what the first order
// produced before running the second — the point is the same-phone behaviour.
await page.evaluate(s => {
  window.__PGREST.db.customers.push(...s.customers.map(c => ({
    id: c.id, name: c.name, phone: c.phone, phone_normalized: c.phone,
    email: null, address: null, city: null, notes: null,
    created_at: new Date().toISOString(), deleted_at: null
  })));
}, { customers: state.customers });
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

const second = await placeOrder({ name: NAME, phone: PHONE });
const after2 = await page.locator('body').innerText();
check('second order: no uuid error', !/invalid input syntax for type uuid/i.test(after2));
check('second order: no error banner', !/Could not (create|save)/i.test(after2));

const state2 = await page.evaluate(() => ({
  customers: window.__PGREST.db.customers.length,
  orders: window.__PGREST.db.orders.map(o => o.customer_id),
  uuidErrors: window.__PGREST.errors.length
}));
check('no duplicate customer was created', state2.customers === 1, `${state2.customers} customers`);
check('the second order reuses the same customer uuid',
  state2.orders.length >= 1 && new Set(state2.orders).size === 1, JSON.stringify(state2.orders));
check('still no uuid rejection', state2.uuidErrors === 0);

check('no uncaught page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | ') || 'none');
if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT, fullPage: true });

console.log(`\nWIZARD: ${pass}/${pass + fail} passed`);
await browser.close();
process.exit(fail ? 1 : 0);
