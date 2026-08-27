/**
 * Customer order bill — end-to-end verification.
 *
 * Drives the real application: creates orders through the wizard, opens the
 * bill from the success screen, and asserts on the rendered document and on
 * the PDF the browser's own print pipeline produces.
 *
 *   npm run dev:local     # in one terminal
 *   npm run test:bill     # in another
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { launch, readDb, createOrder, BASE, pdfPageCount, makeReporter } from './helpers.mjs';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'regency-bill-'));
const report = makeReporter('ORDER BILL');
const A4 = { format: 'A4', printBackground: true, margin: { top: '10mm', bottom: '10mm', left: '12mm', right: '12mm' } };

/**
 * Every money word and symbol the bill must never contain. Checked against the
 * rendered text of the document itself, so an empty column would fail too.
 */
const MONEY_TERMS = [
  '₹', 'INR', 'Price', 'Rate', 'Amount', 'Subtotal', 'Sub Total', 'Discount',
  'Advance', 'Balance', 'Total', 'Grand Total', 'Payment', 'Paid', 'Rs', 'Due'
];

/**
 * Matches a money term as a word, not as a fragment of another one — "Rs"
 * inside "Tailors." is not a currency marker. The ₹ symbol is matched
 * literally, since it can never be part of a legitimate word.
 */
function containsMoneyTerm(text, term) {
  if (term === '₹') return text.includes('₹');
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(text);
}

/** Any number formatted the way a currency value would be. */
function containsCurrencyValue(text) {
  return /(?:₹|Rs\.?|INR)\s*[\d,]+|\b\d{1,3}(?:,\d{2,3})+(?:\.\d{2})?\b|\b\d+\.\d{2}\b/.test(text);
}

async function openBillFromSuccessScreen(page) {
  await page.getByRole('button', { name: /^PRINT BILL$/ }).first().click();
  await page.waitForTimeout(1200);
}

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
 * TEST 1 / 5 / 6 / 7 / 8 / 9 / 10 — single garment, full content      *
 * ------------------------------------------------------------------ */
await scenario('Single-garment bill carries the whole order', async ({ page }) => {
  await createOrder(page, {
    name: 'Arjun Mehta',
    phone: '9876543210',
    city: 'Jalandhar',
    address: 'Model Town Market',
    garments: ['FULL COAT PANT'],
    remarks: { 'FULL COAT PANT': 'Peak lapel, surgeon cuffs, contrast burgundy lining' },
    measurements: {
      'COAT MEASUREMENTS': {
        Length: 30.5, Chest: 41, Stomach: 37, 'H.P. / Hip': 42, Shoulder: 18.5,
        Sleeve: 25, 'X-Back': 17.5, Collar: 16, 'Jacket Length': 30.5, 'Waistcoat Length': 23
      },
      'PANT MEASUREMENTS': { Length: 40, Waist: 34, 'H.P. / Hip': 40.5, Thigh: 24.5, 'In-Leg': 31, Bottom: 15, Body: 11 }
    }
  });

  await openBillFromSuccessScreen(page);
  const bill = page.locator('#printable-order-bill');
  report.check('the bill opens from the success screen', (await bill.count()) === 1);

  const text = await bill.innerText();

  // TEST 5 — customer information
  report.check('customer name appears', text.includes('Arjun Mehta'));
  report.check('customer mobile appears', text.includes('9876543210'));
  report.check('customer address appears', /Model Town Market/.test(text));
  report.check('city appears', /Jalandhar/.test(text));

  // TEST 6 — order identifiers and dates
  const db = await readDb(page);
  const order = db.orders[0];
  report.check('order number appears', text.includes(order.orderNumber), `order #${order.orderNumber}`);
  report.check('bill number appears', /RT-\d{5}/.test(text), text.match(/RT-\d{5}/)?.[0]);
  report.check('order date appears', /ORDER DATE/i.test(text));
  report.check('delivery date appears', /DELIVERY DATE/i.test(text));

  // TEST 7 — garment detail
  report.check('garment name appears', text.includes('FULL COAT PANT') || text.includes('Full Coat Pant'));
  report.check('quantity appears', /QTY\s*1/i.test(text));

  // TEST 8 — measurements, values not just labels
  report.check('coat measurements appear', /COAT MEASUREMENTS/.test(text));
  report.check('pant measurements appear', /PANT MEASUREMENTS/.test(text));
  report.check('a recorded measurement value is printed', text.includes('30.5') && text.includes('41'));

  // TEST 9 — the garment's own remark
  report.check('garment remark appears', text.includes('Peak lapel, surgeon cuffs, contrast burgundy lining'));

  // TEST 10 — the real logo asset.
  // Asserting on painted pixels rather than the `complete` flag: a decoded
  // image is what matters, and a broken one would still report complete.
  await page.waitForFunction(() => {
    const img = document.querySelector('#printable-order-bill img');
    return img && img.naturalWidth > 0;
  }, { timeout: 20000 }).catch(() => {});

  const logo = await page.evaluate(() => {
    const img = document.querySelector('#printable-order-bill img');
    if (!img) return null;
    const box = img.getBoundingClientRect();
    const info = {
      w: img.naturalWidth,
      h: img.naturalHeight,
      renderedW: Math.round(box.width),
      renderedH: Math.round(box.height),
      nonBlankPixels: 0
    };
    const canvas = document.createElement('canvas');
    canvas.width = 40;
    canvas.height = 40;
    const ctx = canvas.getContext('2d');
    try {
      ctx.drawImage(img, 0, 0, 40, 40);
      const data = ctx.getImageData(0, 0, 40, 40).data;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] + data[i + 1] + data[i + 2] > 30) info.nonBlankPixels++;
      }
    } catch {
      info.nonBlankPixels = -1;
    }
    return info;
  });

  report.check('the Regency Tailors logo decodes', Boolean(logo && logo.w > 0 && logo.h > 0),
    logo ? `${logo.w}x${logo.h} source` : 'no <img> found');
  report.check('the logo actually paints its artwork', Boolean(logo && logo.nonBlankPixels > 800),
    logo ? `${logo.nonBlankPixels}/1600 non-blank pixels` : '');
  report.check('the logo is not distorted', Boolean(logo && Math.abs(logo.renderedW - logo.renderedH) <= 2),
    logo ? `${logo.renderedW}x${logo.renderedH} rendered, source is square` : '');
  report.check('no RT text fallback is used in place of the logo', !/EST\. REGENCY/.test(text));

  // Signature area
  report.check('signature area is present', /Customer Signature/i.test(text) && /For Regency Tailors/i.test(text));
});

/* ------------------------------------------------------------------ *
 * TEST 3 / 4 — zero financial information anywhere                    *
 * ------------------------------------------------------------------ */
await scenario('Bill contains no financial information', async ({ page }) => {
  await createOrder(page, {
    name: 'Vikram Malhotra', phone: '9876500001', city: 'Jalandhar', address: 'Civil Lines',
    garments: ['FULL COAT PANT', 'SHIRT'],
    measurements: { 'COAT MEASUREMENTS': { Chest: 41 }, 'SHIRT MEASUREMENTS': { Chest: 40 } }
  });

  // Give the order real figures first: the bill must exclude them even when
  // the underlying order has money recorded against it.
  await page.evaluate(() => {
    const K = 'REGENCY_TAILORS_DB_V3_';
    const orders = JSON.parse(localStorage.getItem(K + 'ORDERS'));
    orders[0] = { ...orders[0], totalAmount: 24500, advancePaid: 10000, balanceDue: 14500,
      subtotal: 24500, discount: 500, taxAmount: 0, paymentMethod: 'Cash' };
    orders[0].items = orders[0].items.map(i => ({ ...i, price: 12250 }));
    localStorage.setItem(K + 'ORDERS', JSON.stringify(orders));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(700);

  await page.getByRole('button', { name: /Showroom Orders/i }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /^Details$/i }).first().click();
  await page.waitForTimeout(900);
  await page.getByRole('button', { name: /^Print Bill$/i }).first().click();
  await page.waitForTimeout(1200);

  const bill = page.locator('#printable-order-bill');
  report.check('the bill opens from the order detail view', (await bill.count()) === 1);

  const text = await bill.innerText();
  const html = await bill.innerHTML();

  for (const term of MONEY_TERMS) {
    report.check(`bill text contains no "${term}"`, !containsMoneyTerm(text, term),
      containsMoneyTerm(text, term)
        ? text.split('\n').find(l => containsMoneyTerm(l, term))
        : '');
  }

  // The figures themselves must not be in the markup either.
  for (const value of ['24500', '24,500', '10000', '10,000', '14500', '14,500', '12250', '12,250']) {
    report.check(`bill markup does not carry the value ${value}`, !html.includes(value));
  }

  report.check('bill markup has no currency symbol', !html.includes('₹'));
  report.check('bill shows no currency-formatted number', !containsCurrencyValue(text),
    text.match(/(?:₹|Rs\.?|INR)\s*[\d,]+|\b\d{1,3}(?:,\d{2,3})+\b/)?.[0] || '');
});

/* ------------------------------------------------------------------ *
 * TEST 2 / 5 — several garments, none mixed up                        *
 * ------------------------------------------------------------------ */
await scenario('Every garment keeps its own detail', async ({ page }) => {
  await createOrder(page, {
    name: 'Rohit Sharma', phone: '9812300045', city: 'Jalandhar', address: 'Guru Nanak Pura',
    garments: ['FULL COAT PANT', 'COAT', 'PANT', 'SHIRT', 'KURTA PAJAMA'],
    remarks: {
      'FULL COAT PANT': 'REMARK-SUIT peak lapel',
      COAT: 'REMARK-COAT double vent',
      PANT: 'REMARK-PANT side adjusters',
      SHIRT: 'REMARK-SHIRT french cuffs',
      'KURTA PAJAMA': 'REMARK-KURTA mandarin collar'
    },
    measurements: {
      'COAT MEASUREMENTS': { Chest: 41, Length: 30.5 },
      'PANT MEASUREMENTS': { Waist: 34, Length: 40 },
      'SHIRT MEASUREMENTS': { Chest: 40, Collar: 15.5 },
      'KURTA MEASUREMENTS': { Chest: 43, Length: 44 },
      'PAJAMA MEASUREMENTS': { Waist: 35, Length: 40 }
    }
  });
  await openBillFromSuccessScreen(page);

  const cards = page.locator('.order-bill-garment-card');
  const count = await cards.count();
  report.check('every garment has its own card', count === 5, `${count} cards`);

  const expected = [
    ['Full Coat Pant', 'REMARK-SUIT', ['COAT MEASUREMENTS', 'PANT MEASUREMENTS']],
    ['Coat', 'REMARK-COAT', ['COAT MEASUREMENTS']],
    ['Pant', 'REMARK-PANT', ['PANT MEASUREMENTS']],
    ['Shirt', 'REMARK-SHIRT', ['SHIRT MEASUREMENTS']],
    ['Kurta Pajama', 'REMARK-KURTA', ['KURTA MEASUREMENTS', 'PAJAMA MEASUREMENTS']]
  ];

  for (let i = 0; i < expected.length; i++) {
    const [garment, remarkTag, blocks] = expected[i];
    const cardText = await cards.nth(i).innerText();
    report.check(`card ${i + 1} is the ${garment}`, cardText.toUpperCase().includes(garment.toUpperCase()));
    report.check(`card ${i + 1} carries only its own remark`, cardText.includes(remarkTag));

    const otherRemarks = expected.filter((_, j) => j !== i).map(e => e[1]);
    report.check(`card ${i + 1} does not carry another garment's remark`,
      otherRemarks.every(r => !cardText.includes(r)));

    report.check(`card ${i + 1} shows the right measurement tables`,
      blocks.every(b => cardText.includes(b)));

    const wrongBlocks = ['COAT MEASUREMENTS', 'PANT MEASUREMENTS', 'SHIRT MEASUREMENTS', 'KURTA MEASUREMENTS', 'PAJAMA MEASUREMENTS']
      .filter(b => !blocks.includes(b));
    report.check(`card ${i + 1} shows no unrelated measurement table`,
      wrongBlocks.every(b => !cardText.includes(b)), wrongBlocks.filter(b => cardText.includes(b)).join(','));
  }

  // Sequential numbering, no duplicates
  const badges = await page.locator('.order-bill-garment-card span.font-mono').allInnerTexts();
  report.check('garment numbering runs 1..n without repeats',
    badges.join(',') === '1,2,3,4,5', badges.join(','));
});

/* ------------------------------------------------------------------ *
 * TEST 11 / 12 — A4 print output                                      *
 * ------------------------------------------------------------------ */
await scenario('Bill prints as properly formatted A4 sheets', async ({ page }) => {
  await createOrder(page, {
    name: 'Harpreet Singh', phone: '9814455566', city: 'Jalandhar', address: 'Bootan Mandi',
    garments: ['FULL COAT PANT', 'COAT', 'PANT', 'SHIRT', 'KURTA PAJAMA'],
    remarks: {
      'FULL COAT PANT': 'Peak lapel, surgeon cuffs, working buttonholes, contrast lining in burgundy silk, ticket pocket on the right, side vents at 22cm and a slightly extended shoulder line as discussed at the fitting.'
    },
    measurements: {
      'COAT MEASUREMENTS': { Length: 30.5, Chest: 41, Stomach: 37, 'H.P. / Hip': 42, Shoulder: 18.5, Sleeve: 25, 'X-Back': 17.5, Collar: 16, 'Jacket Length': 30.5, 'Waistcoat Length': 23 },
      'PANT MEASUREMENTS': { Length: 40, Waist: 34, 'H.P. / Hip': 40.5, Thigh: 24.5, 'In-Leg': 31, Bottom: 15, Body: 11 },
      'SHIRT MEASUREMENTS': { Length: 29, Chest: 40, Stomach: 36, 'H.P. / Hip': 41, Shoulder: 18, Sleeve: 24.5, Collar: 15.5 },
      'KURTA MEASUREMENTS': { Length: 44, Chest: 43, Shoulder: 19, Sleeve: 25, Collar: 16.5 },
      'PAJAMA MEASUREMENTS': { Length: 40, Waist: 35, Thigh: 25, 'In-Leg': 30, Bottom: 15 }
    }
  });
  await openBillFromSuccessScreen(page);

  const reported = parseInt((await page.locator('text=/\\d+ PAGES?/').first().innerText()).replace(/\D/g, ''), 10);
  const rendered = await page.locator('.a4-bill-page').count();
  report.check('rendered sheets match the reported page count', reported === rendered, `${reported} vs ${rendered}`);
  report.check('a large order spans more than one sheet', rendered > 1, `${rendered} sheets`);

  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(600);

  // Nothing may exceed the printable height of an A4 sheet.
  const heights = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.cssText = 'height:100mm;position:absolute;visibility:hidden';
    document.body.appendChild(probe);
    const pxPer100mm = probe.getBoundingClientRect().height;
    probe.remove();
    return [...document.querySelectorAll('.a4-bill-page')].map(el =>
      +((el.getBoundingClientRect().height / pxPer100mm) * 100).toFixed(1)
    );
  });
  report.check('no sheet exceeds the 277mm printable height',
    heights.every(h => h <= 277.5), heights.join('mm, ') + 'mm');

  const overflow = await page.evaluate(() => {
    const pages = [...document.querySelectorAll('.a4-bill-page')];
    return pages.some(p => p.scrollWidth > p.clientWidth + 2);
  });
  report.check('no horizontal overflow on any sheet', !overflow);

  const pdf = await page.pdf(A4);
  fs.writeFileSync(path.join(TMP, 'bill.pdf'), pdf);
  const sheets = pdfPageCount(pdf);
  report.check('printed sheets match the reported page count', sheets === reported,
    `${sheets} printed vs ${reported} reported`);

  const shellVisible = await page.evaluate(() =>
    [...document.querySelectorAll('.print-app-shell')].some(el => getComputedStyle(el).display !== 'none'));
  report.check('the showroom navigation is not on the printed bill', !shellVisible);

  const printedText = await page.locator('#printable-order-bill').innerText();
  report.check('every garment reaches the paper',
    ['FULL COAT PANT', 'COAT', 'PANT', 'SHIRT', 'KURTA PAJAMA'].every(g => printedText.toUpperCase().includes(g)));
  report.check('the closing signature area reaches the paper', /Customer Signature/i.test(printedText));
  report.check('the long remark is not truncated',
    printedText.includes('slightly extended shoulder line as discussed at the fitting.'));

  for (const term of MONEY_TERMS) {
    report.check(`printed bill contains no "${term}"`, !containsMoneyTerm(printedText, term));
  }
  report.check('printed bill shows no currency-formatted number', !containsCurrencyValue(printedText));
});

/* ------------------------------------------------------------------ *
 * Missing optional fields must not produce holes or invented content  *
 * ------------------------------------------------------------------ */
await scenario('Bill copes with missing optional detail', async ({ page }) => {
  await createOrder(page, {
    name: 'Minimal Client', phone: '9000011122',
    garments: ['SHIRT'],
    measurements: {}
  });
  await openBillFromSuccessScreen(page);

  const text = await page.locator('#printable-order-bill').innerText();
  report.check('the bill still renders with no measurements or address', text.includes('Minimal Client'));
  report.check('unrecorded measurements show a dash, not an invented number',
    /—/.test(text) && !/\b(40|41|34)\b/.test(text));
  report.check('no remarks section is invented when none was entered', !/REMARKS/i.test(text));
  report.check('still no financial information',
    MONEY_TERMS.every(t => !containsMoneyTerm(text, t)) && !containsCurrencyValue(text));
});

/* ------------------------------------------------------------------ *
 * TEST 13 / 14 — the slip and the order flow still work               *
 * ------------------------------------------------------------------ */
await scenario('Production slip and order editing are unaffected', async ({ page }) => {
  await createOrder(page, {
    name: 'Regression Client', phone: '9777788899', city: 'Jalandhar', address: 'Model Town',
    garments: ['FULL COAT PANT', 'SHIRT'],
    remarks: { 'FULL COAT PANT': 'Slip remark intact' },
    measurements: { 'COAT MEASUREMENTS': { Chest: 41 }, 'PANT MEASUREMENTS': { Waist: 34 }, 'SHIRT MEASUREMENTS': { Chest: 40 } }
  });
  await page.getByRole('button', { name: /Back to Dashboard|Exit|Close|Done/i }).first().click().catch(() => {});
  await page.waitForTimeout(500);

  await page.getByRole('button', { name: /Showroom Orders/i }).click();
  await page.waitForTimeout(500);
  await page.locator('button[title="Download PDF or Print Production Slip"]').first().click();
  await page.waitForTimeout(1200);

  const slip = page.locator('#printable-production-slip');
  report.check('the production slip still opens', (await slip.count()) === 1);
  const slipText = await slip.innerText();
  report.check('the slip still shows its garments', /FULL COAT PANT/i.test(slipText) && /SHIRT/i.test(slipText));
  report.check('the slip still shows measurements', /COAT MEASUREMENTS/.test(slipText));
  report.check('the slip still shows per-garment remarks', slipText.includes('Slip remark intact'));
  report.check('the slip still carries its workshop sign-off', /Master Cutter Sign-Off/i.test(slipText));

  await page.locator('button[title="Close"]').first().click().catch(() => {});
  await page.waitForTimeout(500);

  // Editing an order still works and still preserves what it should.
  await page.locator('button[title="Edit Order"]').first().click();
  await page.waitForTimeout(800);
  for (let i = 0; i < 4; i++) {
    await page.getByRole('button', { name: /^Continue$/ }).click();
    await page.waitForTimeout(250);
  }
  await page.getByRole('button', { name: /PLACE ORDER/ }).click();
  await page.waitForTimeout(900);

  const db = await readDb(page);
  report.check('editing an order does not duplicate it', db.orders.length === 1, `${db.orders.length} orders`);
  report.check('the edited order keeps its garments', db.orders[0].items.length === 2);
  report.check('the edited order keeps its remarks', db.orders[0].items[0].remarks === 'Slip remark intact');
});

const failures = report.summary();
fs.rmSync(TMP, { recursive: true, force: true });
process.exit(failures > 0 ? 1 : 0);
