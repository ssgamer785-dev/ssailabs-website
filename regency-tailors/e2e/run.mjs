/**
 * Regency Tailor — end-to-end suite.
 *
 * Drives the real application in Chromium and asserts against the browser
 * database and the actual print output. See e2e/README.md.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { launch, readDb, createOrder, finishOrder, BASE, pdfPageCount, makeReporter } from './helpers.mjs';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'regency-e2e-'));
const report = makeReporter('E2E');
const A4 = { format: 'A4', printBackground: true, margin: { top: '10mm', bottom: '10mm', left: '12mm', right: '12mm' } };

const FULL_MEASUREMENTS = {
  'COAT MEASUREMENTS': {
    Length: 30.5, Chest: 41, Stomach: 37, 'H.P. / Hip': 42, Shoulder: 18.5,
    Sleeve: 25, 'X-Back': 17.5, Collar: 16, 'Jacket Length': 30.5, 'Waistcoat Length': 23
  },
  'PANT MEASUREMENTS': { Length: 40, Waist: 34, 'H.P. / Hip': 40.5, Thigh: 24.5, 'In-Leg': 31, Bottom: 15, Body: 11 },
  'SHIRT MEASUREMENTS': { Length: 29, Chest: 40, Stomach: 36, 'H.P. / Hip': 41, Shoulder: 18, Sleeve: 24.5, Collar: 15.5 }
};

async function scenario(name, fn) {
  console.log(`\n=== ${name} ===`);
  const ctx = await launch();
  try {
    await ctx.page.goto(BASE, { waitUntil: 'networkidle' });
    await ctx.page.waitForTimeout(400);
    await fn(ctx);
    report.check(`${name}: no uncaught page errors`, ctx.errors.length === 0, ctx.errors.join(' | '));
  } finally {
    await ctx.browser.close();
  }
}

/* ------------------------------------------------------------------ *
 * 1. Full workflow: customer -> order -> garments -> measurements     *
 * ------------------------------------------------------------------ */
await scenario('Full order workflow', async ({ page }) => {
  await createOrder(page, {
    name: 'Arjun Mehta',
    phone: '9876543210',
    garments: ['COAT', 'PANT', 'SHIRT'],
    remarks: {
      COAT: 'Peak lapel, surgeon cuffs',
      PANT: 'Side adjusters, no belt loops',
      SHIRT: 'French cuff, no pocket'
    },
    measurements: FULL_MEASUREMENTS
  });
  await finishOrder(page);

  const db = await readDb(page);
  const order = db.orders[0];
  const snap = order.measurementsSnapshot;

  report.check('order is numbered 1 in an empty showroom', order.id === '1' && order.orderNumber === '1', order.id);
  report.check('order links to the created customer', order.customerId === db.customers[0].id);
  report.check('every garment is its own line item', order.items.length === 3, `${order.items.length} items`);
  report.check('per-garment remarks are stored on the line items',
    order.items[0].remarks === 'Peak lapel, surgeon cuffs' &&
    order.items[1].remarks === 'Side adjusters, no belt loops' &&
    order.items[2].remarks === 'French cuff, no pocket');
  report.check('coat measurements are isolated to the coat', snap.coat.chest === '41' && snap.coat.collar === '16');
  report.check('pant measurements are isolated to the pant', snap.pant.waist === '34' && snap.pant.inLeg === '31');
  report.check('shirt measurements are isolated to the shirt', snap.shirt.chest === '40' && snap.shirt.collar === '15.5');
  report.check('shirt-only fields never leak into coat', snap.coat.waist === undefined);
  report.check('measurement ledger row carries the order number', db.measurements[0].orderNumber === '1');
  report.check('measurement ledger row carries garment remarks', Boolean(db.measurements[0].garmentRemarks));
  report.check('an invoice is generated for the order', db.invoices[0]?.orderId === order.id);
  report.check('customer order count is 1, not double-counted', db.customers[0].totalOrders === 1, String(db.customers[0].totalOrders));
});

/* ------------------------------------------------------------------ *
 * 2. Returning customer must not become a duplicate ledger row         *
 * ------------------------------------------------------------------ */
await scenario('Returning customer is not duplicated', async ({ page }) => {
  await createOrder(page, { name: 'Arjun Mehta', phone: '9876543210', garments: ['SHIRT'], measurements: { 'SHIRT MEASUREMENTS': { Chest: 40 } } });
  await finishOrder(page);
  await createOrder(page, { name: 'Arjun Mehta', phone: '+91 98765 43210', garments: ['KURTA PAJAMA'], measurements: { 'KURTA MEASUREMENTS': { Chest: 42 } } });
  await finishOrder(page);

  const db = await readDb(page);
  report.check('same phone number resolves to one customer', db.customers.length === 1, `${db.customers.length} customers`);
  report.check('customer shows both orders', db.customers[0].totalOrders === 2, String(db.customers[0].totalOrders));
  report.check('both orders point at that customer',
    db.orders.every(o => o.customerId === db.customers[0].id));
  report.check('shirt measurements survive the later kurta-only order',
    Boolean(db.measurements[0].shirt) && Boolean(db.measurements[0].kurta));
});

/* ------------------------------------------------------------------ *
 * 3. Order numbering: retired numbers stay retired                     *
 * ------------------------------------------------------------------ */
await scenario('Order numbers are never re-issued', async ({ page }) => {
  for (const [n, p] of [['Cust A', '9000000001'], ['Cust B', '9000000002']]) {
    await createOrder(page, { name: n, phone: p, garments: ['SHIRT'], measurements: { 'SHIRT MEASUREMENTS': { Chest: 40 } } });
    await finishOrder(page);
  }
  let db = await readDb(page);
  report.check('orders are numbered sequentially', db.orders.map(o => o.id).sort().join(',') === '1,2');

  await page.getByRole('button', { name: /Showroom Orders/i }).click();
  await page.waitForTimeout(500);
  await page.locator('tr', { hasText: 'Cust B' }).first().locator('button[title="Delete Order"]').click();
  await page.waitForTimeout(600);

  await page.getByRole('button', { name: /^Trash$/i }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /empty trash/i }).first().click();
  await page.waitForTimeout(700);

  db = await readDb(page);
  report.check('trash is empty and order 2 is gone', db.trash.length === 0 && !db.orders.some(o => o.id === '2'));

  await createOrder(page, { name: 'Cust C', phone: '9000000003', garments: ['SHIRT'], measurements: { 'SHIRT MEASUREMENTS': { Chest: 40 } } });
  await finishOrder(page);

  db = await readDb(page);
  const ids = db.orders.map(o => o.id);
  report.check('the retired number 2 is not re-issued', !ids.includes('2'), ids.join(','));
  report.check('no duplicate order numbers exist', new Set(ids).size === ids.length, ids.join(','));
});

/* ------------------------------------------------------------------ *
 * 4. Two tabs cannot collide                                           *
 * ------------------------------------------------------------------ */
await scenario('Concurrent tabs do not collide', async ({ ctx, page }) => {
  await createOrder(page, { name: 'Seed Cust', phone: '9111111111', garments: ['SHIRT'], measurements: { 'SHIRT MEASUREMENTS': { Chest: 40 } } });
  await finishOrder(page);

  const tabB = await ctx.newPage();
  tabB.on('dialog', d => d.accept());
  await tabB.goto(BASE, { waitUntil: 'networkidle' });
  await tabB.waitForTimeout(600);

  await createOrder(page, { name: 'Tab A Cust', phone: '9222222222', garments: ['SHIRT'], measurements: { 'SHIRT MEASUREMENTS': { Chest: 41 } } });
  await finishOrder(page);

  await createOrder(tabB, { name: 'Tab B Cust', phone: '9333333333', garments: ['SHIRT'], measurements: { 'SHIRT MEASUREMENTS': { Chest: 42 } } });
  await finishOrder(tabB);

  const db = await readDb(tabB);
  const ids = db.orders.map(o => o.id);
  report.check("tab A's order survives tab B's save", db.orders.some(o => o.customerName === 'Tab A Cust'), ids.join(','));
  report.check('all three orders are present', db.orders.length === 3, String(db.orders.length));
  report.check('tabs issued distinct numbers', new Set(ids).size === ids.length, ids.join(','));
});

/* ------------------------------------------------------------------ *
 * 5. Editing an order must not destroy money or workflow state         *
 * ------------------------------------------------------------------ */
await scenario('Editing an order preserves payments and production', async ({ page }) => {
  await createOrder(page, {
    name: 'Edit Client', phone: '9444444444', garments: ['COAT'],
    remarks: { COAT: 'Peak lapel' },
    measurements: { 'COAT MEASUREMENTS': { Chest: 41 }, 'PANT MEASUREMENTS': { Waist: 34 } }
  });
  await finishOrder(page);

  // Bring the order to a realistic mid-production state with a part payment.
  await page.evaluate(() => {
    const K = 'REGENCY_TAILORS_DB_V3_';
    const orders = JSON.parse(localStorage.getItem(K + 'ORDERS'));
    orders[0] = {
      ...orders[0], status: 'Master Stitching', productionStatus: 'In Production',
      productionNotes: 'Cut done by Master Singh', totalAmount: 18000, advancePaid: 8000, balanceDue: 10000,
      paymentHistory: [{ id: 'PAY-1', date: '2026-08-20', amount: 8000, method: 'Cash' }]
    };
    localStorage.setItem(K + 'ORDERS', JSON.stringify(orders));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  await page.getByRole('button', { name: /Showroom Orders/i }).click();
  await page.waitForTimeout(500);
  await page.locator('button[title="Edit Order"]').first().click();
  await page.waitForTimeout(700);
  for (let i = 0; i < 4; i++) {
    await page.getByRole('button', { name: /^Continue$/ }).click();
    await page.waitForTimeout(250);
  }
  await page.getByRole('button', { name: /PLACE ORDER/ }).click();
  await page.waitForTimeout(800);

  const db = await readDb(page);
  const o = db.orders[0];
  report.check('workflow status survives the edit', o.status === 'Master Stitching', o.status);
  report.check('production status survives the edit', o.productionStatus === 'In Production', String(o.productionStatus));
  report.check('production notes survive the edit', o.productionNotes === 'Cut done by Master Singh');
  report.check('order total survives the edit', o.totalAmount === 18000, String(o.totalAmount));
  report.check('advance payment survives the edit', o.advancePaid === 8000, String(o.advancePaid));
  report.check('balance due survives the edit', o.balanceDue === 10000, String(o.balanceDue));
  report.check('payment history survives the edit', (o.paymentHistory || []).length === 1);
  report.check('editing does not create a second order', db.orders.length === 1);
  report.check('customer order count is not double-counted', db.customers[0].totalOrders === 1, String(db.customers[0].totalOrders));
  report.check('invoice keeps the recorded payment', db.invoices[0].amountPaid === 8000 && db.invoices[0].status === 'Partial');
});

/* ------------------------------------------------------------------ *
 * 6. Production slip prints the number of sheets it promises           *
 * ------------------------------------------------------------------ */
await scenario('Production slip prints as many A4 sheets as it reports', async ({ page }) => {
  await createOrder(page, {
    name: 'Vikram Malhotra', phone: '9876500001',
    garments: ['COAT', 'PANT', 'SHIRT', 'KURTA PAJAMA'],
    remarks: { COAT: 'Peak lapel, surgeon cuffs, working buttonholes, contrast lining in burgundy silk' },
    measurements: FULL_MEASUREMENTS
  });
  await finishOrder(page);

  await page.getByRole('button', { name: /Showroom Orders/i }).click();
  await page.waitForTimeout(500);
  await page.locator('button[title="Download PDF or Print Production Slip"]').first().click();
  await page.waitForTimeout(1200);

  const reported = parseInt((await page.locator('text=/\\d+ PAGES?/').first().innerText()).replace(/\D/g, ''), 10);
  const rendered = await page.locator('.a4-production-page').count();
  report.check('rendered page count matches the reported count', reported === rendered, `${reported} vs ${rendered}`);

  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(500);
  const pdf = await page.pdf(A4);
  fs.writeFileSync(path.join(TMP, 'slip.pdf'), pdf);
  const sheets = pdfPageCount(pdf);
  report.check('printed sheets match the reported page count', sheets === reported, `${sheets} sheets vs ${reported} reported`);

  const shellVisible = await page.evaluate(() =>
    [...document.querySelectorAll('.print-app-shell')].some(el => getComputedStyle(el).display !== 'none'));
  report.check('showroom navigation is not on the printed slip', !shellVisible);

  const printedText = await page.locator('#printable-production-slip').innerText();
  report.check('every garment appears on the printed slip',
    ['COAT', 'PANT', 'SHIRT', 'KURTA PAJAMA'].every(g => printedText.includes(g)));

  // The slip is a cutting instruction, not a contract: no signature blocks,
  // and no money of any kind.
  report.check('the slip carries no signature block',
    !/Sign-?Off|Signature/i.test(printedText));
  /*
   * No money anywhere. The closing TOTAL ITEMS band is a piece count, not a
   * figure, so it is checked separately rather than being allowed to soften
   * the money test for the rest of the sheet.
   */
  const moneyText = await page.evaluate(() => {
    const root = document.querySelector('#printable-production-slip').cloneNode(true);
    root.querySelectorAll('.production-slip-summary').forEach(el => el.remove());
    return root.innerText || root.textContent || '';
  });
  report.check('the slip carries no financial information',
    !/\b(Amount|Total|Advance|Balance|Payment|Price|Subtotal|Discount)\b/i.test(moneyText) &&
    !moneyText.includes('\u20B9'), (moneyText.match(/\b(Amount|Total|Advance|Balance|Payment|Price|Subtotal|Discount)\b/i) || [])[0] || '');
  const summaryText = await page.locator('.production-slip-summary').innerText();
  report.check('the closing tally is a piece count, not a figure',
    /TOTAL ITEMS/i.test(summaryText) &&
    !/\b(Amount|Advance|Balance|Payment|Price|Subtotal|Discount)\b/i.test(summaryText) &&
    !summaryText.includes('\u20B9'), summaryText.replace(/\n/g, ' '));

  /*
   * Every garment carries the customer's order number, not its own position.
   * A bench holds work from several orders at once, so the number on a piece
   * has to say which order it belongs to.
   */
  const slipOrderNo = (await readDb(page)).orders[0].orderNumber;
  const badges = await page.evaluate(() =>
    [...document.querySelectorAll('.production-slip-product-card')]
      .map(c => (c.children[0].children[0].textContent || '').trim()));
  report.check('every garment is stamped with the order number',
    badges.length === 4 && badges.every(b => b === `#${slipOrderNo}`),
    badges.join(' '));
  report.check('no garment carries a serial position instead',
    !badges.some((b, i) => b === `#${i + 1}` && String(i + 1) !== String(slipOrderNo)),
    badges.join(' '));

  // Black and white only — a workshop prints this on a mono laser.
  const nonMono = await page.evaluate(() => {
    const isMono = c => {
      const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!m) return true;
      const v = [+m[1], +m[2], +m[3]];
      return Math.max(...v) - Math.min(...v) <= 6;
    };
    const bad = [];
    document.querySelectorAll('.a4-production-page, .a4-production-page *').forEach(el => {
      const cs = getComputedStyle(el);
      for (const prop of ['color', 'backgroundColor', 'borderTopColor', 'borderBottomColor',
                          'borderLeftColor', 'borderRightColor']) {
        const val = cs[prop];
        if (val && val !== 'rgba(0, 0, 0, 0)' && !isMono(val)) bad.push(`${prop}=${val}`);
      }
    });
    return [...new Set(bad)];
  });
  report.check('the slip renders in pure black and white', nonMono.length === 0, nonMono.slice(0, 3).join(' | '));

  // Nothing may spill past the bottom of a sheet.
  const slipOverflow = await page.evaluate(() =>
    [...document.querySelectorAll('.a4-production-page')].map(sheet => {
      const flow = sheet.firstElementChild;
      return flow.scrollHeight - flow.clientHeight;
    }));
  report.check('no production slip sheet overflows', slipOverflow.every(o => o <= 0), slipOverflow.join(','));

  /*
   * Content order and content limits.
   *
   * Each garment reads #N -> MEASUREMENTS -> REMARKS and nothing else. Fabric,
   * style/cut and garment notes are not collected any more and must not appear
   * anywhere on the slip; a stale label would send a cutter looking for
   * information the showroom never took.
   */
  const cardOrder = await page.evaluate(() =>
    [...document.querySelectorAll('.production-slip-product-card')].map(card => {
      const kids = [...card.children];
      return {
        heading: (kids[0].textContent || '').trim().replace(/\s+/g, ' '),
        categories: kids.slice(1, -1).map(c => (c.children[0].textContent || '').trim().replace(/\s+/g, ' ')),
        last: (kids[kids.length - 1].textContent || '').trim().replace(/\s+/g, ' ')
      };
    }));

  report.check('every garment block leads with the order number and garment name',
    cardOrder.every(c => c.heading.startsWith(`#${slipOrderNo}`)),
    cardOrder.map(c => c.heading.slice(0, 24)).join(' / '));
  report.check('measurements sit between the heading and the remarks',
    cardOrder.every(c => c.categories.length > 0 && c.categories.every(t => /MEASUREMENTS/i.test(t))),
    cardOrder.map(c => c.categories.join('+')).join(' / '));
  report.check('the remarks band closes every garment block',
    cardOrder.every(c => /^REMARKS/i.test(c.last)),
    cardOrder.map(c => c.last.slice(0, 20)).join(' / '));
  report.check('no fabric, style/cut or garment-notes label on the slip',
    !/\bFabric\b|\bStyle\s*\/?\s*Cut\b|\bGarment Notes\b|\bStitching\b/i.test(printedText));

  // The tier the auto-fit settled on must be a real one, and the sheet it
  // produced must still be the sheet the printer gets.
  const tiers = await page.evaluate(() =>
    [...document.querySelectorAll('.a4-production-page')].map(s => s.getAttribute('data-density')));
  report.check('every sheet renders at the same resolved density tier',
    new Set(tiers).size === 1 && ['roomy', 'normal', 'compact', 'dense'].includes(tiers[0]),
    tiers.join(','));
});

/* ------------------------------------------------------------------ *
 * 6c. Coat and Pant are separate products, and the slip totals them    *
 * ------------------------------------------------------------------ */
await scenario('Coat and Pant are two products, never a combined garment', async ({ page }) => {
  await createOrder(page, {
    name: 'Suit Client', phone: '9800022233',
    garments: ['COAT', 'PANT'],
    remarks: { COAT: 'Peak lapel, double vent', PANT: 'Side adjusters, no belt loops' },
    measurements: FULL_MEASUREMENTS
  });
  await finishOrder(page);

  const db = await readDb(page);
  const order = db.orders[0];

  report.check('a coat and a pant are two order items', order.items.length === 2, `${order.items.length} items`);
  report.check('they keep their own garment identities',
    order.items[0].garmentType === 'Coat' && order.items[1].garmentType === 'Pant',
    order.items.map(i => i.garmentType).join(' / '));
  report.check('no combined garment is stored behind the scenes',
    !order.items.some(i => /full\s*coat\s*pant/i.test(i.garmentType || '')),
    order.items.map(i => i.garmentType).join(' / '));
  report.check('each keeps its own remark',
    order.items[0].remarks === 'Peak lapel, double vent' &&
    order.items[1].remarks === 'Side adjusters, no belt loops');
  report.check('coat measurements are recorded', order.measurementsSnapshot?.coat?.chest === '41');
  report.check('pant measurements are recorded', order.measurementsSnapshot?.pant?.waist === '34');

  await page.getByRole('button', { name: /Showroom Orders/i }).click();
  await page.waitForTimeout(500);
  await page.locator('button[title="Download PDF or Print Production Slip"]').first().click();
  await page.waitForTimeout(1300);

  const slipText = await page.locator('#printable-production-slip').innerText();
  report.check('the slip has no combined garment anywhere', !/full\s*coat\s*pant/i.test(slipText));

  const headings = await page.evaluate(() =>
    [...document.querySelectorAll('.production-slip-product-card')]
      .map(c => (c.children[0].textContent || '').trim().replace(/\s+/g, ' ')));
  // Product order is unchanged — Coat then Pant — but both are stamped with
  // the one order number rather than 1 and 2.
  const suitOrderNo = order.orderNumber;
  report.check('the slip prints the Coat first and the Pant second',
    /Coat/i.test(headings[0]) && /Pant/i.test(headings[1]), headings.join(' / '));
  report.check('both garments carry the same order number',
    headings.every(h => h.startsWith(`#${suitOrderNo}`)), headings.join(' / '));

  // Each garment renders only its own measurement tables.
  const cats = await page.evaluate(() =>
    [...document.querySelectorAll('.production-slip-product-card')].map(card =>
      [...card.children].slice(1, -1)
        .map(c => (c.children[0].textContent || '').trim().replace(/\s+/g, ' '))));
  report.check('the coat block carries only coat measurements',
    cats[0].length === 1 && /COAT MEASUREMENTS/i.test(cats[0][0]), cats[0].join('+'));
  report.check('the pant block carries only pant measurements',
    cats[1].length === 1 && /PANT MEASUREMENTS/i.test(cats[1][0]), cats[1].join('+'));
});

/* ------------------------------------------------------------------ *
 * 6c-bis. A legacy combined garment stays readable, and converts       *
 *         to two products only when someone actually saves the order   *
 * ------------------------------------------------------------------ */
await scenario('A legacy Full Coat Pant order is preserved, printed, and split only on save', async ({ page }) => {
  // Place a normal order, then rewrite its line item to the combined garment
  // the showroom used to sell. This is what a pre-split order looks like on
  // disk; nothing in the app can create one any more.
  await createOrder(page, {
    name: 'Legacy Client', phone: '9800044455',
    garments: ['COAT'],
    remarks: { COAT: 'Peak lapel, legacy order' },
    measurements: { 'COAT MEASUREMENTS': { Chest: 41 }, 'PANT MEASUREMENTS': { Waist: 34 } }
  });
  await finishOrder(page);

  await page.evaluate(() => {
    const K = 'REGENCY_TAILORS_DB_V3_';
    const orders = JSON.parse(localStorage.getItem(K + 'ORDERS'));
    orders[0].items = [{ ...orders[0].items[0], garmentType: 'Full Coat Pant', quantity: 2 }];
    orders[0].measurementsSnapshot = {
      ...orders[0].measurementsSnapshot,
      pant: { waist: '34', length: '40' }
    };
    localStorage.setItem(K + 'ORDERS', JSON.stringify(orders));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  // Reading and printing must not touch it.
  await page.getByRole('button', { name: /Showroom Orders/i }).click();
  await page.waitForTimeout(500);
  await page.locator('button[title="Download PDF or Print Production Slip"]').first().click();
  await page.waitForTimeout(1300);

  const cats = await page.evaluate(() =>
    [...document.querySelectorAll('.production-slip-product-card')].map(card =>
      [...card.children].slice(1, -1)
        .map(c => (c.children[0].textContent || '').replace(/\s+/g, ' ').trim())));
  report.check('a legacy combined garment still prints both measurement tables',
    cats.length === 1 && cats[0].length === 2 &&
    /COAT MEASUREMENTS/i.test(cats[0][0]) && /PANT MEASUREMENTS/i.test(cats[0][1]),
    JSON.stringify(cats));

  const tally = (await page.locator('.production-slip-summary').innerText()).replace(/\s+/g, ' ');
  report.check('the tally reports the legacy order as recorded', /TOTAL ITEMS\s*2/i.test(tally), tally);

  const untouched = await readDb(page);
  report.check('printing did not rewrite the stored order',
    untouched.orders[0].items.length === 1 &&
    untouched.orders[0].items[0].garmentType === 'Full Coat Pant',
    untouched.orders[0].items.map(i => i.garmentType).join(' / '));

  // Editing and saving converts it — deliberately, and only then.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: /Showroom Orders/i }).click();
  await page.waitForTimeout(500);
  await page.locator('button[title="Edit Order"]').first().click();
  await page.waitForTimeout(800);
  for (let i = 0; i < 4; i++) {
    await page.getByRole('button', { name: /^Continue$/ }).click();
    await page.waitForTimeout(350);
  }
  await page.getByRole('button', { name: /PLACE ORDER|UPDATE ORDER|SAVE/i }).first().click();
  await page.waitForTimeout(1200);

  const after = await readDb(page);
  const items = after.orders[0].items;
  report.check('saving splits the legacy garment into a Coat and a Pant',
    items.length === 2 && items[0].garmentType === 'Coat' && items[1].garmentType === 'Pant',
    items.map(i => i.garmentType).join(' / '));
  report.check('the split keeps the recorded quantity on both',
    items.every(i => i.quantity === 2), items.map(i => i.quantity).join(' / '));
  report.check('no combined garment survives the save',
    !items.some(i => /full\s*coat\s*pant/i.test(i.garmentType || '')));
});

/* ------------------------------------------------------------------ *
 * 6c-ter. The # on every garment is the customer's order number        *
 * ------------------------------------------------------------------ */
await scenario('Every garment on a slip is stamped with the order number', async ({ page }) => {
  await createOrder(page, {
    name: 'Numbering Client', phone: '9800055502',
    garments: ['COAT', 'PANT', 'SHIRT', 'KURTA PAJAMA'],
    measurements: FULL_MEASUREMENTS
  });
  await finishOrder(page);

  /** Sets the order's number, reopens its slip, and returns what it printed. */
  const slipFor = async (orderNumber) => {
    await page.evaluate(n => {
      const K = 'REGENCY_TAILORS_DB_V3_';
      const orders = JSON.parse(localStorage.getItem(K + 'ORDERS'));
      orders[0] = { ...orders[0], orderNumber: n };
      localStorage.setItem(K + 'ORDERS', JSON.stringify(orders));
    }, orderNumber);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: /Showroom Orders/i }).click();
    await page.waitForTimeout(600);
    await page.locator('button[title="Download PDF or Print Production Slip"]').first().click();
    await page.waitForTimeout(1300);
    return page.evaluate(() => ({
      badges: [...document.querySelectorAll('.production-slip-product-card')]
        .map(c => (c.children[0].children[0].textContent || '').trim()),
      cards: [...document.querySelectorAll('.production-slip-product-card')].map(card => ({
        garment: (card.children[0].children[1].textContent || '').replace(/\s+/g, ' ').trim(),
        titles: [...card.children].slice(1, -1)
          .map(c => (c.children[0].textContent || '').replace(/\s+/g, ' ').trim())
      })),
      text: document.querySelector('#printable-production-slip').innerText,
      tally: (document.querySelector('.production-slip-summary')?.innerText || '')
        .replace(/\s+/g, ' ').trim()
    }));
  };

  // Order number 2, four garments: every badge reads #2, and none reads a
  // garment position.
  const two = await slipFor('2');
  report.check('all four garments read #2',
    two.badges.length === 4 && two.badges.every(b => b === '#2'), two.badges.join(' '));
  report.check('no #1, #3 or #4 appears as a garment number',
    !two.badges.some(b => ['#1', '#3', '#4'].includes(b)), two.badges.join(' '));
  report.check('the sheet header agrees with the garment badges', /ORDER\s*#\s*2\b/i.test(two.text));

  // Renumber to 15: the badges follow the order, proving they are not derived
  // from the garment's position, which did not change.
  const fifteen = await slipFor('15');
  report.check('all four garments follow the order number to #15',
    fifteen.badges.length === 4 && fifteen.badges.every(b => b === '#15'), fifteen.badges.join(' '));
  report.check('the badge is not derived from the garment position',
    !fifteen.badges.some(b => ['#1', '#2', '#3', '#4'].includes(b)), fifteen.badges.join(' '));

  // Everything else about the slip is untouched by the numbering change.
  report.check('product order is unchanged',
    /Coat/i.test(fifteen.cards[0].garment) && /Pant/i.test(fifteen.cards[1].garment) &&
    /Shirt/i.test(fifteen.cards[2].garment) && /Kurta/i.test(fifteen.cards[3].garment),
    fifteen.cards.map(c => c.garment).join(' / '));
  report.check('each garment still carries only its own measurements',
    fifteen.cards[0].titles.length === 1 && /COAT MEASUREMENTS/i.test(fifteen.cards[0].titles[0]) &&
    fifteen.cards[1].titles.length === 1 && /PANT MEASUREMENTS/i.test(fifteen.cards[1].titles[0]),
    JSON.stringify(fifteen.cards.map(c => c.titles)));
  report.check('the TOTAL ITEMS tally is unchanged', /TOTAL ITEMS\s*4/i.test(fifteen.tally), fifteen.tally);
});

/* ------------------------------------------------------------------ *
 * 6d. The slip closes with a TOTAL ITEMS tally                         *
 * ------------------------------------------------------------------ */
await scenario('Production slip totals the pieces on its final sheet', async ({ page }) => {
  await createOrder(page, {
    name: 'Tally Client', phone: '9800033344',
    garments: ['KURTA PAJAMA', 'COAT', 'PANT'],
    measurements: FULL_MEASUREMENTS
  });
  await finishOrder(page);

  // Five kurta pajamas, one coat, one pant — the worked example: 7 pieces.
  await page.evaluate(() => {
    const K = 'REGENCY_TAILORS_DB_V3_';
    const orders = JSON.parse(localStorage.getItem(K + 'ORDERS'));
    orders[0].items = orders[0].items.map(i =>
      i.garmentType === 'Kurta Pajama' ? { ...i, quantity: 5 } : i);
    localStorage.setItem(K + 'ORDERS', JSON.stringify(orders));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  await page.getByRole('button', { name: /Showroom Orders/i }).click();
  await page.waitForTimeout(500);
  await page.locator('button[title="Download PDF or Print Production Slip"]').first().click();
  await page.waitForTimeout(1300);

  const summaries = page.locator('.production-slip-summary');
  report.check('exactly one summary band is printed', (await summaries.count()) === 1,
    `${await summaries.count()} bands`);

  const summaryText = (await summaries.first().innerText()).replace(/\s+/g, ' ').trim();
  report.check('it reports the total piece count', /TOTAL ITEMS\s*7/i.test(summaryText), summaryText);
  report.check('it counts the kurta pajamas by quantity', /KURTA PAJAMA\s*×\s*5/i.test(summaryText), summaryText);
  report.check('it lists the coat with its count', /COAT\s*×\s*1/i.test(summaryText), summaryText);
  report.check('it lists the pant with its count', /PANT\s*×\s*1/i.test(summaryText), summaryText);
  report.check('it never merges the coat and pant back together',
    !/full\s*coat\s*pant/i.test(summaryText), summaryText);

  // It belongs to the last sheet only.
  const onLastSheet = await page.evaluate(() => {
    const sheets = [...document.querySelectorAll('.a4-production-page')];
    return sheets.map(s => s.querySelectorAll('.production-slip-summary').length);
  });
  report.check('the summary sits on the final sheet and no other',
    onLastSheet.slice(0, -1).every(n => n === 0) && onLastSheet[onLastSheet.length - 1] === 1,
    onLastSheet.join(','));
});

/* ------------------------------------------------------------------ *
 * 6b. Fabric, style/cut and garment notes are gone from New Order      *
 * ------------------------------------------------------------------ */
await scenario('New Order no longer collects fabric, style/cut or garment notes', async ({ page }) => {
  await page.getByRole('button', { name: /Dashboard Hub/i }).click().catch(() => {});
  await page.waitForTimeout(250);
  await page.getByRole('button', { name: /New Order/i }).first().click();
  await page.waitForTimeout(400);

  await page.getByPlaceholder('e.g. Vikram Malhotra').fill('Field Removal Check');
  await page.getByPlaceholder('e.g. 9876543210').fill('9800011122');
  await page.getByRole('button', { name: /^Continue$/ }).click();
  await page.waitForTimeout(250);
  await page.getByRole('button', { name: /^Continue$/ }).click();
  await page.waitForTimeout(250);

  // Garment selection step, with a garment expanded so its whole
  // configuration panel is on screen.
  const card = page.locator('h3:text-is("COAT")')
    .locator('xpath=ancestor::div[contains(@class,"rounded-3xl")][1]');
  await card.getByRole('button', { name: /Select/ }).first().click();
  await page.waitForTimeout(300);

  report.check('the fabric input is gone',
    (await page.getByPlaceholder('Fabric description...').count()) === 0);
  const stepText = await page.locator('body').innerText();
  report.check('no fabric, style/cut or garment-notes label on the garment step',
    !/Fabric Details|Fabric Code|\bStyle\s*\/?\s*Cut\b|Garment Notes/i.test(stepText),
    (stepText.match(/Fabric[^\n]{0,30}|Style\s*\/?\s*Cut[^\n]{0,20}|Garment Notes[^\n]{0,20}/i) || [])[0] || '');

  // Quantity still works — removing the three fields must not disturb it.
  report.check('quantity control still present', (await card.getByText('Quantity').count()) > 0);

  // And the order still places, with remarks and measurements intact.
  await page.getByRole('button', { name: /^Continue$/ }).click();
  await page.waitForTimeout(350);
  await page.getByPlaceholder('Add any production remarks for this garment...').first()
    .fill('Peak lapel, surgeon cuffs');
  const chest = page.locator('div.space-y-3').filter({ hasText: 'COAT MEASUREMENTS' }).last()
    .locator('div.space-y-1').filter({ has: page.locator('label:text-is("Chest")') }).locator('input').first();
  if (await chest.count()) await chest.fill('41');
  await page.getByRole('button', { name: /^Continue$/ }).click();
  await page.waitForTimeout(350);
  await page.getByRole('button', { name: /PLACE ORDER/ }).click();
  await page.waitForTimeout(900);

  const db = await readDb(page);
  const placed = db.orders[0];
  report.check('the order still saves', Boolean(placed) && placed.items.length === 1);
  report.check('the garment remark still saves', placed.items[0].remarks === 'Peak lapel, surgeon cuffs');
  report.check('the measurement still saves', placed.measurementsSnapshot?.coat?.chest === '41');
  report.check('the dropped columns stay empty rather than being invented',
    !placed.items[0].fabricName && !placed.items[0].styleNotes,
    `${placed.items[0].fabricName} / ${placed.items[0].styleNotes}`);
});

/* ------------------------------------------------------------------ *
 * 7. Bill prints on one clean A4 sheet                                 *
 * ------------------------------------------------------------------ */
await scenario('Bill prints on one clean A4 sheet', async ({ page }) => {
  await createOrder(page, {
    name: 'Bill Client', phone: '9555500002',
    city: 'Jalandhar', address: 'Model Town Market',
    garments: ['COAT', 'SHIRT'],
    measurements: FULL_MEASUREMENTS
  });
  await finishOrder(page);

  await page.getByRole('button', { name: /Production Slips/i }).click();
  await page.waitForTimeout(700);
  await page.locator('button[title="Print Customer Bill"]').first().click();
  await page.waitForTimeout(1500);

  const billText = await page.locator('#printable-customer-bill').innerText();
  report.check('bill shows the correct customer', billText.includes('Bill Client'));
  report.check('bill shows the correct order number', billText.includes('ORDER NO.') && billText.includes('RT-00001'));
  report.check('bill lists every garment', billText.includes('Coat') && billText.includes('Shirt'));
  report.check('bill shows the recorded customer address', /Model Town Market/.test(billText),
    billText.match(/ADDRESS[\s\S]{0,60}/)?.[0]?.replace(/\n/g, ' '));

  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(500);
  const pdf = await page.pdf(A4);
  const sheets = pdfPageCount(pdf);
  report.check('bill prints on a single sheet', sheets === 1, `${sheets} sheets`);

  const shellVisible = await page.evaluate(() =>
    [...document.querySelectorAll('.print-app-shell')].some(el => getComputedStyle(el).display !== 'none'));
  report.check('showroom navigation is not on the printed bill', !shellVisible);
});

/* ------------------------------------------------------------------ *
 * 8. Backup export -> wipe -> import round trip                        *
 * ------------------------------------------------------------------ */
await scenario('Backup export and import restore everything', async ({ page }) => {
  await createOrder(page, {
    name: 'Backup Client', phone: '9555500001', garments: ['COAT', 'KURTA PAJAMA'],
    remarks: { COAT: 'Ticket pocket', 'KURTA PAJAMA': 'Ivory silk' },
    measurements: {
      'COAT MEASUREMENTS': { Chest: 42, Length: 31 }, 'PANT MEASUREMENTS': { Waist: 35 },
      'KURTA MEASUREMENTS': { Chest: 43 }, 'PAJAMA MEASUREMENTS': { Waist: 36 }
    }
  });
  await finishOrder(page);
  const before = await readDb(page);

  await page.getByRole('button', { name: /Backup & Recovery/i }).click();
  await page.waitForTimeout(600);
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 20000 }),
    page.getByRole('button', { name: /export/i }).first().click()
  ]);
  const file = path.join(TMP, download.suggestedFilename());
  await download.saveAs(file);
  const raw = fs.readFileSync(file, 'utf8');
  const parsed = JSON.parse(raw);

  report.check('backup contains every collection',
    ['customers', 'orders', 'measurements', 'invoices', 'fittings', 'workers', 'expenses', 'trash'].every(k => Array.isArray(parsed[k])));
  report.check('backup carries the order-number high-water mark', typeof parsed.metadata.orderSequence === 'number');
  report.check('backup contains no credentials or API keys', !/api[_-]?key|anon[_-]?key|service[_-]?role|password|secret|token/i.test(raw));

  await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('REGENCY_TAILORS_DB_V3')).forEach(k => localStorage.removeItem(k)));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  report.check('wipe cleared the test data', (await readDb(page)).orders.length === 0);

  await page.getByRole('button', { name: /Backup & Recovery/i }).click();
  await page.waitForTimeout(600);
  await page.setInputFiles('input[type=file]', file);
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /RESTORE BACKUP/i }).click();
  await page.waitForTimeout(3500);

  const after = await readDb(page);
  report.check('every customer is restored', after.customers.length === before.customers.length);
  report.check('every order is restored', after.orders.length === before.orders.length);
  report.check('every measurement record is restored', after.measurements.length === before.measurements.length);
  report.check('every invoice is restored', after.invoices.length === before.invoices.length);
  report.check('order keeps its customer link', after.orders[0].customerId === after.customers[0].id);
  report.check('per-garment remarks survive the round trip',
    after.orders[0].items.map(i => i.remarks).join('|') === 'Ticket pocket|Ivory silk');
  report.check('measurements survive the round trip',
    after.orders[0].measurementsSnapshot.coat.chest === '42' && after.orders[0].measurementsSnapshot.kurta.chest === '43');
  report.check('order-number mark is restored', after.seq !== null);

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  report.check('restored data persists across a refresh', (await readDb(page)).orders.length === before.orders.length);
});

/* ------------------------------------------------------------------ *
 * 9. Hostile backup files                                              *
 * ------------------------------------------------------------------ */
await scenario('Hostile backup files never damage live data', async ({ page }) => {
  const cases = {
    'empty.regency.backup': ['', false],
    'truncated.regency.backup': ['{"metadata": {"application": "Regency Tailor"', false],
    'notjson.regency.backup': ['this is definitely not json at all', false],
    'wrongapp.regency.backup': [JSON.stringify({ metadata: { application: 'Some Other App' }, customers: [] }), false],
    'nocollections.regency.backup': [JSON.stringify({ hello: 'world' }), false],
    'structurally-broken.regency.backup': [JSON.stringify({
      metadata: { application: 'Regency Tailor' },
      customers: [{ id: 'X', name: '<img src=x onerror="window.__XSS=1">', phone: '9' }],
      orders: [{ id: 'ORPHAN', customerId: 'MISSING', customerName: 'Ghost', items: 'not-an-array', totalAmount: 'NaN' }],
      measurements: [1, 'str', null]
    }), true]
  };
  for (const [file, [content]] of Object.entries(cases)) fs.writeFileSync(path.join(TMP, file), content);

  await createOrder(page, { name: 'Safe Client', phone: '9000009999', garments: ['SHIRT'], measurements: { 'SHIRT MEASUREMENTS': { Chest: 40 } } });
  await finishOrder(page);
  await page.getByRole('button', { name: /Backup & Recovery/i }).click();
  await page.waitForTimeout(600);

  for (const [file, [, shouldPassValidation]] of Object.entries(cases)) {
    await page.setInputFiles('input[type=file]', path.join(TMP, file));
    await page.waitForTimeout(900);
    const previewOpen = (await page.getByRole('button', { name: /RESTORE BACKUP/i }).count()) > 0;
    report.check(`${file} is ${shouldPassValidation ? 'accepted for review' : 'rejected'}`, previewOpen === shouldPassValidation);
    if (previewOpen) {
      const cancel = page.getByRole('button', { name: /cancel|close/i }).last();
      if (await cancel.count()) { await cancel.click(); await page.waitForTimeout(400); }
    }
  }

  const db = await readDb(page);
  report.check('live data is untouched after every rejected import', db.orders.length === 1 && db.customers.length === 1);
  report.check('no script from a backup file executed', !(await page.evaluate(() => Boolean(window.__XSS))));

  // Now actually restore the structurally broken file and browse the app.
  await page.setInputFiles('input[type=file]', path.join(TMP, 'structurally-broken.regency.backup'));
  await page.waitForTimeout(900);
  await page.getByRole('button', { name: /RESTORE BACKUP/i }).click();
  await page.waitForTimeout(3500);
  report.check('integrity problems are reported to the user',
    (await page.locator('text=/Data integrity notes/i').count()) > 0);

  await page.getByRole('button', { name: /Showroom Orders/i }).click();
  await page.waitForTimeout(1200);
  const rootSize = await page.evaluate(() => document.getElementById('root').innerHTML.length);
  report.check('a structurally broken backup does not blank the screen', rootSize > 1000, `root html ${rootSize} bytes`);
});

/* ------------------------------------------------------------------ *
 * 10. Storage failures degrade gracefully                              *
 * ------------------------------------------------------------------ */
console.log('\n=== Storage failure handling ===');
for (const [label, seed] of [
  ['corrupt JSON in orders', () => localStorage.setItem('REGENCY_TAILORS_DB_V3_ORDERS', '{"broken": ')],
  ['wrong shape in customers', () => localStorage.setItem('REGENCY_TAILORS_DB_V3_CUSTOMERS', '{"a":1}')]
]) {
  const { browser, page, errors } = await launch();
  await page.goto(BASE);
  await page.evaluate(seed);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const size = await page.evaluate(() => document.getElementById('root').innerHTML.length);
  report.check(`${label}: app still renders`, size > 1000, `root html ${size} bytes`);
  report.check(`${label}: no uncaught error`, errors.length === 0, errors.join(' | '));
  await browser.close();
}

{
  const { browser, ctx, page } = await launch();
  await ctx.addInitScript(() => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (String(k).startsWith('REGENCY_TAILORS_DB_V3')) {
        const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e;
      }
      return orig.call(this, k, v);
    };
  });
  const p2 = await ctx.newPage();
  await p2.goto(BASE, { waitUntil: 'networkidle' });
  await p2.waitForTimeout(1200);
  const size = await p2.evaluate(() => document.getElementById('root').innerHTML.length);
  report.check('storage quota exhausted: app still renders', size > 1000, `root html ${size} bytes`);
  report.check('storage quota exhausted: user is warned', (await p2.locator('text=/Data not saved/i').count()) > 0);
  await browser.close();
  await page.context().browser()?.close?.().catch(() => {});
}

const failures = report.summary();
fs.rmSync(TMP, { recursive: true, force: true });
process.exit(failures > 0 ? 1 : 0);
