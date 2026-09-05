/**
 * INTEGRITY AUDIT — updates, failures, races, trash and restore.
 *
 * The companion to consistency.mjs. That one proves a clean journey ends with
 * the database and every screen agreeing. This one attacks the edges: does an
 * update reach every screen that shows it, does a rejected write ever get
 * reported as saved, can two clicks make two customers, and does a restore
 * bring back the same logical record rather than a copy.
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

const AUTH = () => {
  // Re-seeded on every navigation, so a test that signs out has to say so —
  // otherwise this would hand the session straight back on the reload.
  if (sessionStorage.getItem('__SIGNED_OUT__')) return;
  localStorage.setItem('regency-tailors-auth', JSON.stringify({
    access_token: 'test', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'test',
    user: { id: '00000000-0000-4000-8000-0000000000ff', email: 'owner@example.com',
      aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {},
      created_at: new Date().toISOString() }
  }));
};

/** A signed-in page with a seeded customer + order, straight in the fake db. */
async function boot({ persist = false } = {}) {
  const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  const ctx = await browser.newContext({ viewport: { width: 1680, height: 1150 } });
  if (persist) await ctx.addInitScript(() => { window.__PGREST_PERSIST = true; });
  await ctx.addInitScript(SHIM);
  await ctx.addInitScript(AUTH);
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  page.on('dialog', d => d.accept());
  return { browser, ctx, page, pageErrors };
}

/** Seeds one customer, one order, one measurement profile before the app boots. */
const SEED = () => {
  const wait = setInterval(() => {
    if (!window.__PGREST) return;
    clearInterval(wait);
    const D = window.__PGREST.db;
    if (D.customers.length) return;
    const cid = '00000000-0000-4000-8000-0000000000c1';
    const oid = '00000000-0000-4000-8000-0000000000d1';
    const mid = '00000000-0000-4000-8000-0000000000e1';
    D.customers.push({ id: cid, name: 'Ranjit Sahota', phone: '9812340001',
      phone_normalized: '9812340001', city: 'Jalandhar', address: 'Model Town',
      email: null, notes: null, deleted_at: null, created_at: new Date().toISOString() });
    D.orders.push({ id: oid, customer_id: cid, order_number: 41, status: 'New',
      production_status: 'New', production_notes: '', customer_name: 'Ranjit Sahota',
      customer_phone: '9812340001', customer_address: 'Model Town, Jalandhar',
      order_date: '2026-09-01', delivery_date: '2026-09-25', deleted_at: null,
      subtotal: 0, discount: 0, tax_amount: 0, total_amount: 0, advance_paid: 0, balance_due: 0,
      measurements_snapshot: { unit: 'inches', coat: { length: '31.5', chest: '40', collar: '16',
        jacketLength: '30', waistcoatLength: '25' } } });
    D.order_items.push({ id: '00000000-0000-4000-8000-0000000000f1', order_id: oid,
      position: 1, garment_type: 'Coat', quantity: 2, price: 0, remarks: null });
    D.measurements.push({ id: mid, customer_id: cid, unit: 'inches', deleted_at: null,
      last_updated: '2026-09-01', fit_preference: null, posture_notes: null,
      fitting_notes: null, garment_remarks: null });
    D.measurement_values.push({ id: '00000000-0000-4000-8000-0000000000g1'.replace('g','9'),
      measurement_id: mid, garment_category: 'coat',
      data: { length: '31.5', chest: '40', collar: '16', jacketLength: '30', waistcoatLength: '25' } });
    if (window.__PGREST.persist) window.__PGREST.persist();
  }, 0);
};

const txt = async page => (await page.locator('body').innerText()).replace(/\s+/g, ' ');
const dbOf = page => page.evaluate(() => JSON.parse(JSON.stringify(window.__PGREST.db)));
const closeOverlay = async page => {
  for (let i = 0; i < 4; i++) {
    const gone = await page.evaluate(() => {
      const ovs = [...document.querySelectorAll('div.fixed.inset-0.z-50')];
      const ov = ovs[ovs.length - 1];
      if (!ov) return true;
      const btns = [...ov.querySelectorAll('button')];
      const x = btns.find(b => b.querySelector('svg.lucide-x, svg.lucide-x-icon'))
             || btns.find(b => /^(close|exit|done)/i.test((b.textContent || '').trim()))
             || btns[btns.length - 1];
      if (x) x.click();
      return false;
    });
    await page.waitForTimeout(400);
    if (gone || await page.locator('div.fixed.inset-0.z-50').count() === 0) break;
  }
  await page.waitForTimeout(250);
};
const tab = async (page, name) => {
  await page.getByRole('button', { name }).first().click();
  await page.waitForTimeout(800);
  return txt(page);
};

/* ==================================================================== */
/* 1. CROSS-VIEW UPDATE                                                 */
/* ==================================================================== */
{
  section('CROSS-VIEW UPDATE — a customer edit must reach every screen');
  const { browser, ctx, page, pageErrors } = await boot();
  await ctx.addInitScript(SEED);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2200);

  const before = await dbOf(page);
  check('seeded customer loaded', before.customers.length === 1, before.customers.map(c => c.name).join());

  await tab(page, /Customers Ledger/i);
  await page.getByRole('button', { name: /Edit|Modify/i }).first().click().catch(async () => {
    await page.locator('button[title*="Edit" i]').first().click();
  });
  await page.waitForTimeout(700);

  const NEW_CITY = 'Ludhiana';
  const NEW_NAME = 'Ranjit Singh Sahota';
  const inputs = page.locator('div.fixed.inset-0.z-50 input');
  const n = await inputs.count();
  check('edit-customer form opened', n > 0, `${n} inputs`);
  await inputs.nth(0).fill(NEW_NAME);
  for (let i = 0; i < n; i++) {
    const v = await inputs.nth(i).inputValue();
    if (v === 'Jalandhar') await inputs.nth(i).fill(NEW_CITY);
  }
  await page.getByRole('button', { name: /Save|Update/i }).last().click();
  await page.waitForTimeout(2200);

  const after = await dbOf(page);
  check('the edit was written to the database, not just to the screen',
    after.customers[0].name === NEW_NAME && after.customers[0].city === NEW_CITY,
    `${after.customers[0].name} / ${after.customers[0].city}`);
  check('the edit did NOT create a second customer row', after.customers.length === 1,
    String(after.customers.length));
  check('the customer keeps the same uuid across the edit',
    after.customers[0].id === before.customers[0].id);

  const ledger = await tab(page, /Customers Ledger/i);
  check('ledger shows the new name without a manual reload', ledger.includes(NEW_NAME));
  check('ledger no longer shows the old name', !ledger.includes('Ranjit Sahota '));
  check('ledger shows the new city', ledger.includes(NEW_CITY));

  await page.locator(`text=${NEW_NAME}`).first().click();
  await page.waitForTimeout(800);
  check('customer profile shows the new name', (await txt(page)).includes(NEW_NAME));
  await closeOverlay(page);

  check('no uncaught page error during the edit', pageErrors.length === 0, pageErrors.join(' | '));
  await browser.close();
}

/* ==================================================================== */
/* 2. STALE MODAL — a status change made inside the dossier             */
/* ==================================================================== */
{
  section('OPEN DOSSIER — does a status change stick on screen?');
  const { browser, ctx, page, pageErrors } = await boot();
  await ctx.addInitScript(SEED);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2200);

  await tab(page, /Showroom Orders/i);
  await page.getByRole('button', { name: /^Details$/ }).first().click();
  await page.waitForTimeout(900);

  const select = page.locator('div.fixed.inset-0.z-50 select').first();
  check('the dossier has a status control', await select.count() > 0);
  const startStatus = await select.inputValue();
  await select.selectOption('Fabric Cutting');
  await page.waitForTimeout(2500);

  const dbNow = await dbOf(page);
  check('the database recorded the new status', dbNow.orders[0].status === 'Fabric Cutting',
    dbNow.orders[0].status);

  const shown = await select.inputValue();
  check('the open dossier still shows the status the database now holds',
    shown === 'Fabric Cutting', `database=${dbNow.orders[0].status} dossier shows=${shown} (was ${startStatus})`);
  await closeOverlay(page);

  const list = await tab(page, /Showroom Orders/i);
  check('the orders list reflects the new status', /Fabric Cutting/i.test(list));
  check('no uncaught page error', pageErrors.length === 0, pageErrors.join(' | '));
  await browser.close();
}

/* ==================================================================== */
/* 3. PRODUCTION SLIP DOSSIER — notes, toast honesty, hook order        */
/* ==================================================================== */
{
  section('PRODUCTION SLIP DOSSIER — notes and the "Notes Saved" toast');
  const { browser, ctx, page, pageErrors } = await boot();
  await ctx.addInitScript(SEED);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2200);

  await tab(page, /Production Slips/i);
  await page.locator('button[title="View Production Slip"]').first().click();
  await page.waitForTimeout(1200);
  check('the slip dossier opened without a React error',
    pageErrors.length === 0 && /PRODUCTION SLIP/i.test(await txt(page)),
    pageErrors.join(' | '));

  // Close and reopen: the second mount is where a conditional hook shows up.
  await closeOverlay(page);
  await page.waitForTimeout(400);
  await page.locator('button[title="View Production Slip"]').first().click();
  await page.waitForTimeout(1000);
  check('the slip dossier survives close-and-reopen', pageErrors.length === 0, pageErrors.join(' | '));

  // A note that the database will accept.
  const area = page.locator('div.fixed.inset-0.z-50 textarea').first();
  await area.fill('Cutting done 5 Sep. Half-inch extra on sleeve.');
  await page.getByRole('button', { name: /Save Production Notes/i }).click();
  await page.waitForTimeout(2200);
  const okDb = await dbOf(page);
  check('a good note reaches the database',
    okDb.orders[0].production_notes === 'Cutting done 5 Sep. Half-inch extra on sleeve.',
    String(okDb.orders[0].production_notes));

  // Now make the very next production_notes write fail, and try again.
  await page.evaluate(() => { window.__FAIL_NOTES = true; });
  await page.evaluate(() => {
    const realFetch = window.fetch;
    window.fetch = async (input, init = {}) => {
      const url = typeof input === 'string' ? input : (input.url || String(input));
      const body = init.body ? String(init.body) : '';
      if (window.__FAIL_NOTES && /\/rest\/v1\/orders/.test(url) &&
          (init.method || '').toUpperCase() === 'PATCH' && body.includes('production_notes')) {
        return new Response(JSON.stringify({
          message: 'new row violates row-level security policy for table "orders"',
          code: '42501', details: null, hint: null
        }), { status: 403, headers: { 'Content-Type': 'application/json' } });
      }
      return realFetch(input, init);
    };
  });

  await area.fill('THIS WRITE WILL BE REFUSED BY THE DATABASE');
  await page.getByRole('button', { name: /Save Production Notes/i }).click();
  await page.waitForTimeout(600);

  const toast = page.locator('span:has-text("Notes Saved")');
  const toastVisible = await toast.count() > 0 && await toast.first().isVisible();
  await page.waitForTimeout(2200);
  const badDb = await dbOf(page);
  check('the refused note did NOT reach the database',
    badDb.orders[0].production_notes !== 'THIS WRITE WILL BE REFUSED BY THE DATABASE',
    String(badDb.orders[0].production_notes));
  check('the UI does not claim "Notes Saved" for a write the database refused',
    !toastVisible, toastVisible ? 'green "Notes Saved" badge shown anyway' : '');

  // Visible *without closing the dossier* — the page-level banner sits behind
  // this backdrop, so a failure has to be reported where the person is looking.
  const errorInModal = await page.evaluate(() => {
    const ov = document.querySelector('div.fixed.inset-0.z-50');
    return ov ? /row-level security|not saved|could not|failed/i.test(ov.innerText) : false;
  });
  check('the failure is reported inside the dossier, where the person is looking', errorInModal);

  await browser.close();
}

/* ==================================================================== */
/* 4. RETURNING CUSTOMER — no second ledger row                         */
/* ==================================================================== */
{
  section('RETURNING CUSTOMER — same phone must not open a second ledger row');
  const { browser, ctx, page, pageErrors } = await boot();
  await ctx.addInitScript(SEED);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2200);

  // Place a second order typing the SAME phone number as a "new" customer.
  await page.getByRole('button', { name: /Dashboard Hub/i }).first().click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /New Order/i }).first().click();
  await page.waitForTimeout(900);
  await page.getByPlaceholder('e.g. Vikram Malhotra').fill('Ranjit Sahota');
  await page.getByPlaceholder('e.g. 9876543210').fill('98-1234-0001');   // same digits, typed differently
  await page.getByPlaceholder('e.g. Jalandhar').fill('Jalandhar');
  await page.getByRole('button', { name: /^Continue$/ }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /^Continue$/ }).click();
  await page.waitForTimeout(400);
  const card = page.locator('h3:text-is("SHIRT")').locator('xpath=ancestor::div[contains(@class,"rounded-3xl")][1]');
  await card.getByRole('button', { name: /Select/ }).first().click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /^Continue$/ }).click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /^Continue$/ }).click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /PLACE ORDER/i }).click();
  await page.waitForTimeout(3200);

  const D = await dbOf(page);
  check('a differently-formatted same phone did not open a second ledger row',
    D.customers.filter(c => !c.deleted_at).length === 1,
    D.customers.map(c => `${c.name}/${c.phone}`).join(' | '));
  check('both orders point at the one customer uuid',
    D.orders.length === 2 && new Set(D.orders.map(o => o.customer_id)).size === 1,
    D.orders.map(o => o.customer_id).join(' | '));
  check('the second order got its own database number',
    D.orders[0].order_number !== D.orders[1].order_number,
    D.orders.map(o => o.order_number).join(', '));
  check('the earlier coat measurements were not blanked by a shirt-only order',
    D.measurement_values.some(v => v.garment_category === 'coat' && v.data && v.data.chest === '40'),
    D.measurement_values.map(v => v.garment_category).join(', '));
  check('no uncaught page error', pageErrors.length === 0, pageErrors.join(' | '));
  await browser.close();
}

/* ==================================================================== */
/* 5. FAILED ORDER SAVE — never reported as placed                      */
/* ==================================================================== */
{
  section('FAILED ORDER SAVE — the wizard must not announce a phantom order');
  const { browser, ctx, page, pageErrors } = await boot();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2200);

  await page.evaluate(() => {
    const realFetch = window.fetch;
    window.fetch = async (input, init = {}) => {
      const url = typeof input === 'string' ? input : (input.url || String(input));
      if (/\/rest\/v1\/orders/.test(url) && (init.method || 'GET').toUpperCase() === 'POST') {
        return new Response(JSON.stringify({
          message: 'new row violates row-level security policy for table "orders"',
          code: '42501', details: null, hint: null
        }), { status: 403, headers: { 'Content-Type': 'application/json' } });
      }
      return realFetch(input, init);
    };
  });

  await page.getByRole('button', { name: /Dashboard Hub/i }).first().click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /New Order/i }).first().click();
  await page.waitForTimeout(900);
  await page.getByPlaceholder('e.g. Vikram Malhotra').fill('Refused Order Client');
  await page.getByPlaceholder('e.g. 9876543210').fill('9700000042');
  await page.getByPlaceholder('e.g. Jalandhar').fill('Jalandhar');
  await page.getByRole('button', { name: /^Continue$/ }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /^Continue$/ }).click();
  await page.waitForTimeout(400);
  const c2 = page.locator('h3:text-is("PANT")').locator('xpath=ancestor::div[contains(@class,"rounded-3xl")][1]');
  await c2.getByRole('button', { name: /Select/ }).first().click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /^Continue$/ }).click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /^Continue$/ }).click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /PLACE ORDER/i }).click();
  await page.waitForTimeout(3200);

  const body = await txt(page);
  const D = await dbOf(page);
  check('no order row exists after the database refused the insert', D.orders.length === 0,
    String(D.orders.length));
  check('the wizard did NOT show ORDER CONFIRMED', !/ORDER CONFIRMED/i.test(body),
    body.slice(0, 120));
  check('the wizard tells the user the save failed',
    /row-level security|could not|unable|failed/i.test(body),
    body.match(/.{0,90}(row-level security|could not|unable|failed).{0,60}/i)?.[0] || 'no message');
  check('a retry control is offered', /Try Again/i.test(body));
  await browser.close();
}

/* ==================================================================== */
/* 6. DELETE -> TRASH -> RESTORE                                        */
/* ==================================================================== */
{
  section('DELETE → TRASH → RESTORE');
  const { browser, ctx, page, pageErrors } = await boot();
  await ctx.addInitScript(SEED);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2200);

  const start = await dbOf(page);
  const orderUuid = start.orders[0].id;
  const orderNo = String(start.orders[0].order_number);

  await tab(page, /Showroom Orders/i);
  await page.locator('button[title*="Delete" i], button[title*="Trash" i]').first().click();
  await page.waitForTimeout(2200);

  const afterDel = await dbOf(page);
  check('the order was soft-deleted, not destroyed',
    afterDel.orders.length === 1 && !!afterDel.orders[0].deleted_at, String(afterDel.orders[0].deleted_at));
  check('the order keeps its uuid while in trash', afterDel.orders[0].id === orderUuid);
  check('its garment lines were NOT deleted',
    afterDel.order_items.filter(i => i.order_id === orderUuid).length === 1);

  const listAfterDel = await tab(page, /Showroom Orders/i);
  check('the deleted order left the orders list', !new RegExp(`\\b${orderNo}\\b`).test(listAfterDel));

  const trashTxt = await tab(page, /Trash/i);
  check('the deleted order appears in Trash', trashTxt.includes(orderNo) || /Bespoke Order/i.test(trashTxt),
    trashTxt.slice(0, 200));

  await page.getByRole('button', { name: /Restore/i }).first().click();
  await page.waitForTimeout(2500);

  const afterRestore = await dbOf(page);
  check('restore cleared deleted_at on the SAME row',
    afterRestore.orders.length === 1 &&
    afterRestore.orders[0].id === orderUuid &&
    !afterRestore.orders[0].deleted_at);
  check('restore did not create a duplicate order', afterRestore.orders.length === 1,
    String(afterRestore.orders.length));
  check('the restored order keeps its original number',
    String(afterRestore.orders[0].order_number) === orderNo, String(afterRestore.orders[0].order_number));
  check('the restored order still points at the same customer',
    afterRestore.orders[0].customer_id === start.customers[0].id);
  check('its garments came back with it',
    afterRestore.order_items.filter(i => i.order_id === orderUuid).length === 1);

  const listBack = await tab(page, /Showroom Orders/i);
  check('the restored order is back in the orders list', new RegExp(`\\b${orderNo}\\b`).test(listBack));

  // The restored order must still print correctly.
  await tab(page, /Production Slips/i);
  await page.locator('button[title="Print Production Slip"]').first().click();
  await page.waitForTimeout(2200);
  const slip = await txt(page);
  check('the restored order still prints a correct production slip',
    slip.includes(orderNo) && /COAT MEASUREMENTS/i.test(slip));
  await closeOverlay(page);
  await page.locator('button[title="Print Customer Bill"]').first().click();
  await page.waitForTimeout(2200);
  const bill = await txt(page);
  check('the restored order still prints a correct customer bill',
    bill.includes(orderNo) && /WE ARE NOT RESPONSIBLE FOR CLOTHES AFTER 2 MONTHS/i.test(bill));
  check('no uncaught page error through delete and restore', pageErrors.length === 0, pageErrors.join(' | '));
  await browser.close();
}

/* ==================================================================== */
/* 7. RACES — rapid clicks must not double-write                        */
/* ==================================================================== */
{
  section('RACES — rapid submission must not create duplicates');
  const { browser, ctx, page, pageErrors } = await boot();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2200);

  await page.getByRole('button', { name: /Dashboard Hub/i }).first().click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /New Order/i }).first().click();
  await page.waitForTimeout(900);
  await page.getByPlaceholder('e.g. Vikram Malhotra').fill('Double Click Client');
  await page.getByPlaceholder('e.g. 9876543210').fill('9700001234');
  await page.getByPlaceholder('e.g. Jalandhar').fill('Jalandhar');
  await page.getByRole('button', { name: /^Continue$/ }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /^Continue$/ }).click();
  await page.waitForTimeout(400);
  const cc = page.locator('h3:text-is("COAT")').locator('xpath=ancestor::div[contains(@class,"rounded-3xl")][1]');
  await cc.getByRole('button', { name: /Select/ }).first().click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /^Continue$/ }).click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /^Continue$/ }).click();
  await page.waitForTimeout(600);

  // Five clicks as fast as the browser will dispatch them: an impatient double
  // click on a slow machine, taken to its limit.
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')]
      .find(b => /PLACE ORDER/i.test(b.textContent || ''));
    for (let i = 0; i < 5; i++) btn.click();
  });
  await page.waitForTimeout(4500);

  const D = await dbOf(page);
  check('five rapid PLACE ORDER clicks created exactly one order', D.orders.length === 1,
    String(D.orders.length));
  check('and exactly one customer', D.customers.length === 1, String(D.customers.length));
  check('and exactly one set of garment lines', D.order_items.length === 1, String(D.order_items.length));
  check('and exactly one measurement profile', D.measurements.length === 1, String(D.measurements.length));
  check('no uncaught page error under rapid clicking', pageErrors.length === 0, pageErrors.join(' | '));
  await browser.close();
}

{
  section('RACES — a human double-click, 80ms apart');
  const { browser, ctx, page, pageErrors } = await boot();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2200);
  await page.getByRole('button', { name: /Dashboard Hub/i }).first().click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /New Order/i }).first().click();
  await page.waitForTimeout(900);
  await page.getByPlaceholder('e.g. Vikram Malhotra').fill('Impatient Client');
  await page.getByPlaceholder('e.g. 9876543210').fill('9700005678');
  await page.getByPlaceholder('e.g. Jalandhar').fill('Jalandhar');
  await page.getByRole('button', { name: /^Continue$/ }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /^Continue$/ }).click();
  await page.waitForTimeout(400);
  const pc = page.locator('h3:text-is("PANT")').locator('xpath=ancestor::div[contains(@class,"rounded-3xl")][1]');
  await pc.getByRole('button', { name: /Select/ }).first().click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /^Continue$/ }).click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /^Continue$/ }).click();
  await page.waitForTimeout(600);

  const place = page.getByRole('button', { name: /PLACE ORDER/i });
  await place.click({ force: true });
  await page.waitForTimeout(80);
  await place.click({ force: true }).catch(() => {});
  await page.waitForTimeout(4500);

  const D2 = await dbOf(page);
  check('a double-click 80ms apart still places exactly one order', D2.orders.length === 1,
    String(D2.orders.length));
  check('and the customer is not duplicated', D2.customers.length === 1, String(D2.customers.length));
  check('no uncaught page error', pageErrors.length === 0, pageErrors.join(' | '));
  await browser.close();
}

/* ==================================================================== */
/* 8. CLIENT PORTAL + blank/zero measurements                           */
/* ==================================================================== */
{
  section('CLIENT PORTAL — same measurements, blanks and zeroes handled');
  const { browser, ctx, page, pageErrors } = await boot();
  await ctx.addInitScript(() => {
    const w = setInterval(() => {
      if (!window.__PGREST) return;
      clearInterval(w);
      const D = window.__PGREST.db;
      const cid = '00000000-0000-4000-8000-0000000000c9';
      const mid = '00000000-0000-4000-8000-0000000000e9';
      D.customers.push({ id: cid, name: 'Zero Blank Client', phone: '9800000099',
        phone_normalized: '9800000099', city: 'Jalandhar', address: 'Test Street',
        email: null, deleted_at: null, created_at: new Date().toISOString() });
      D.measurements.push({ id: mid, customer_id: cid, unit: 'inches', deleted_at: null,
        last_updated: '2026-09-01', fit_preference: null, posture_notes: null,
        fitting_notes: null, garment_remarks: null });
      // A deliberate zero, a deliberate blank, and a missing key.
      D.measurement_values.push({ id: '00000000-0000-4000-8000-0000000000a9',
        measurement_id: mid, garment_category: 'coat',
        data: { length: '31.5', chest: 0, stomach: '', hip: '38', shoulder: '18',
                sleeve: '25', xBack: '17', collar: '16' /* jacketLength + waistcoatLength absent */ } });
    }, 0);
  });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2200);

  await page.getByRole('button', { name: /Client Portal/i }).first().click();
  await page.waitForTimeout(900);
  const search = page.locator('div.fixed.inset-0.z-50 input').first();
  await search.fill('9800000099');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: /Search|Look ?up|Find/i }).first().click().catch(() => {});
  await page.waitForTimeout(1200);

  const portal = await txt(page);
  check('client portal finds the customer by phone', portal.includes('Zero Blank Client'), portal.slice(0, 160));
  check('client portal shows all ten coat labels',
    ['Length', 'Chest', 'Stomach', 'H.P. / Hip', 'Shoulder', 'Sleeve', 'X-Back', 'Collar',
     'Jacket Length', 'Waistcoat Length'].every(l => new RegExp(l.replace(/[.\/]/g, '.'), 'i').test(portal)),
    ['Jacket Length', 'Waistcoat Length', 'Collar', 'X-Back'].filter(l => !new RegExp(l, 'i').test(portal)).join(', '));
  check('a recorded zero is shown as 0, not dropped', /\b0\b/.test(portal));
  check('unrecorded fields show an em dash rather than vanishing', portal.includes('—'));
  check('no uncaught page error in the client portal', pageErrors.length === 0, pageErrors.join(' | '));
  await browser.close();
}

/* ==================================================================== */
/* 9. BACKUP — the file, and what a refused restore reports             */
/* ==================================================================== */
{
  section('BACKUP & RECOVERY');
  const { browser, ctx, page, pageErrors } = await boot();
  await ctx.addInitScript(SEED);
  // export_backup / restore_backup are RPCs; the shim answers them from the
  // same tables, exactly as the database function does.
  await ctx.addInitScript(() => {
    const w = setInterval(() => {
      if (!window.fetch || !window.__PGREST) return;
      clearInterval(w);
      const D = window.__PGREST.db;
      const inner = window.fetch;
      window.__RESTORE_SHOULD_FAIL = false;
      window.fetch = async (input, init = {}) => {
        const url = typeof input === 'string' ? input : (input.url || String(input));
        if (/\/rest\/v1\/rpc\/export_backup/.test(url)) {
          return new Response(JSON.stringify({
            customers: D.customers, orders: D.orders, order_items: D.order_items,
            order_payments: D.order_payments, measurements: D.measurements,
            measurement_values: D.measurement_values, fittings: D.fittings,
            workers: D.workers, expenses: D.expenses,
            audit_log: [{ id: 1, action: 'seeded', at: new Date().toISOString() }],
            showroom_settings: D.showroom_settings[0],
            order_sequence: 41
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (/\/rest\/v1\/rpc\/restore_backup/.test(url)) {
          if (window.__RESTORE_SHOULD_FAIL) {
            return new Response(JSON.stringify({
              message: 'Not authorised to restore showroom data', code: '42501',
              details: null, hint: null
            }), { status: 403, headers: { 'Content-Type': 'application/json' } });
          }
          return new Response(JSON.stringify({ restored: true, audit_log_restored: false }),
            { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return inner(input, init);
      };
    }, 0);
  });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2200);

  await tab(page, /Backup & Recovery/i);
  const dl = page.waitForEvent('download', { timeout: 30000 });
  await page.getByRole('button', { name: /Export|Download|Create Backup/i }).first().click();
  const download = await dl;
  const path = await download.path();
  const file = JSON.parse(readFileSync(path, 'utf8'));

  check('the backup downloads as a .regency.backup file',
    /\.regency\.backup$/.test(download.suggestedFilename()), download.suggestedFilename());
  check('it carries the exact database payload', !!file.database);
  for (const coll of ['customers', 'orders', 'order_items', 'measurements',
                      'measurement_values', 'showroom_settings']) {
    check(`the payload carries ${coll}`, file.database[coll] !== undefined);
  }
  check('it carries the order-number high-water mark',
    typeof file.metadata?.orderSequence === 'number', String(file.metadata?.orderSequence));
  check('the audit log is carried in the file (export-only, never restored)',
    Array.isArray(file.database.audit_log) && file.database.audit_log.length > 0);
  const asText = JSON.stringify(file);
  check('the backup file contains no key, token or credential',
    !/service_role|sb_secret|access_token|refresh_token|anon_key|jwt|password|client_secret/i.test(asText),
    (asText.match(/service_role|sb_secret|access_token|refresh_token|anon_key|jwt|password|client_secret/i) || [])[0] || '');
  check('the exported customer matches the database row',
    file.database.customers[0].name === 'Ranjit Sahota' &&
    file.database.customers[0].id === '00000000-0000-4000-8000-0000000000c1');
  await page.waitForTimeout(1200);   // the handler posts its message after the file lands
  check('export reports success', /exported successfully/i.test(await txt(page)));

  // A restore the database refuses must not be announced as a success.
  await page.evaluate(() => { window.__RESTORE_SHOULD_FAIL = true; });
  const input = page.locator('input[type="file"]').first();
  await input.setInputFiles(path);
  await page.waitForTimeout(1500);
  const confirmBtn = page.getByRole('button', { name: /Restore|Confirm|Proceed|Import/i });
  if (await confirmBtn.count()) { await confirmBtn.last().click(); await page.waitForTimeout(2500); }
  const restoreTxt = await txt(page);
  check('a refused restore is NOT reported as successful',
    !/restored successfully/i.test(restoreTxt),
    restoreTxt.match(/.{0,80}restored successfully.{0,40}/i)?.[0] || '');
  check('a refused restore says why',
    /not authoris|not authoriz|failed to restore|could not/i.test(restoreTxt),
    restoreTxt.match(/.{0,40}(not authoris|failed to restore|could not).{0,60}/i)?.[0] || '');
  const stillThere = await dbOf(page);
  check('production data is untouched after the refused restore',
    stillThere.customers.length === 1 && stillThere.orders.length === 1);
  check('no uncaught page error', pageErrors.length === 0, pageErrors.join(' | '));
  await browser.close();
}

/* ==================================================================== */
/* 10. SIGN OUT / SIGN BACK IN                                          */
/* ==================================================================== */
{
  section('SIGN OUT → SIGN IN — the data comes back from the database');
  const { browser, ctx, page, pageErrors } = await boot({ persist: true });
  await ctx.addInitScript(SEED);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2200);

  const before = await tab(page, /Showroom Orders/i);
  check('signed in, order visible', before.includes('41') && before.includes('Ranjit Sahota'));

  // Sign out the way the sidebar does: drop the session and reload.
  await page.evaluate(() => {
    sessionStorage.setItem('__SIGNED_OUT__', '1');
    localStorage.removeItem('regency-tailors-auth');
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2200);
  const out = await txt(page);
  check('signed out: the sign-in screen is shown', /Showroom sign in|Continue with Google/i.test(out),
    out.slice(0, 120));
  check('signed out: no customer or order data on the page',
    !out.includes('Ranjit Sahota') && !/Showroom Orders/.test(out));
  const lsOut = await page.evaluate(() =>
    Object.keys(localStorage).filter(k => k.startsWith('REGENCY_TAILORS_DB_V3_')));
  check('signed out: no showroom records left in browser storage',
    lsOut.filter(k => !/_ORDER_SEQ$/.test(k)).length === 0, lsOut.join(', '));

  // Sign back in.
  await page.evaluate(() => {
    sessionStorage.removeItem('__SIGNED_OUT__');
    localStorage.setItem('regency-tailors-auth', JSON.stringify({
      access_token: 'test', token_type: 'bearer', expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'test',
      user: { id: '00000000-0000-4000-8000-0000000000ff', email: 'owner@example.com',
        aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {},
        created_at: new Date().toISOString() } }));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const back = await tab(page, /Showroom Orders/i);
  check('signed back in: the same order is there', back.includes('41') && back.includes('Ranjit Sahota'));
  const ledgerBack = await tab(page, /Customers Ledger/i);
  check('signed back in: the same customer is there',
    ledgerBack.includes('Ranjit Sahota') && ledgerBack.includes('9812340001'));
  const D = await dbOf(page);
  check('nothing was duplicated across the session change',
    D.customers.length === 1 && D.orders.length === 1,
    `${D.customers.length} customers, ${D.orders.length} orders`);
  check('no uncaught page error across sign out and back in', pageErrors.length === 0, pageErrors.join(' | '));
  await browser.close();
}

section('RESULT');
console.log(`INTEGRITY: ${pass}/${pass + fail} passed`);
if (failures.length) { console.log('\nFAILURES:'); failures.forEach(f => console.log('  - ' + f)); }
process.exit(fail ? 1 : 0);
