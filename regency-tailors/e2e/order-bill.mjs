/**
 * Customer order bill — end-to-end verification.
 *
 * Drives the real application: creates orders through the wizard, opens the
 * bill from the success screen, and asserts on the rendered document and on
 * the PDF the browser's own print pipeline produces.
 *
 * This bill carries customer, order and per-garment detail — never a
 * measurement (that is the Production Slip's job) and never a computed or
 * pre-filled money figure (the showroom writes the amount on the printed
 * sheet by hand). Both guarantees are checked directly against rendered text,
 * not inferred from the code that produced it.
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
 * Money words the bill must never contain under any circumstance. This is
 * deliberately narrower than Phase C's list: this design keeps a Payment
 * Details section with the labels "Total Amount", "Advance Paid", "Balance",
 * "Payment Mode" and "Payment Date", plus an "Amount" table column header —
 * all required by spec, all blank. So "Amount", "Advance", "Balance",
 * "Total" and "Payment" are not forbidden words here; their *values* are
 * checked separately (blank table cells, no injected figures, no
 * currency-formatted number anywhere). What must never appear at all is
 * anything implying a computed figure: a rate, a subtotal, a discount, a
 * grand total, or a due amount.
 */
const MONEY_TERMS = ['₹', 'INR', 'Price', 'Rate', 'Subtotal', 'Sub Total', 'Discount', 'Grand Total', 'Rs', 'Due'];

/**
 * Every measurement section heading the Production Slip prints. None of them
 * may ever reach the customer bill — full phrases only, so a legitimate
 * stitching description that happens to mention "shoulder" or "collar" can
 * never trip this check.
 */
const MEASUREMENT_HEADINGS = [
  'COAT MEASUREMENTS', 'PANT MEASUREMENTS', 'SHIRT MEASUREMENTS',
  'KURTA MEASUREMENTS', 'PAJAMA MEASUREMENTS', 'MEASUREMENTS'
];

const PAYMENT_LABELS = ['TOTAL AMOUNT', 'ADVANCE PAID', 'BALANCE', 'PAYMENT MODE', 'PAYMENT DATE'];

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

function assertNoMeasurements(text, label = 'bill') {
  for (const heading of MEASUREMENT_HEADINGS) {
    report.check(`${label} text contains no "${heading}"`, !text.toUpperCase().includes(heading));
  }
}

function assertNoMoneyAnywhere(text, label = 'bill') {
  for (const term of MONEY_TERMS) {
    report.check(`${label} text contains no "${term}"`, !containsMoneyTerm(text, term),
      containsMoneyTerm(text, term) ? text.split('\n').find(l => containsMoneyTerm(l, term)) : '');
  }
  report.check(`${label} text has no currency symbol`, !text.includes('₹'));
  report.check(`${label} text shows no currency-formatted number`, !containsCurrencyValue(text));
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
 * Single garment: full customer/order/garment detail, zero            *
 * measurements, premium header, exact logo.                           *
 * ------------------------------------------------------------------ */
await scenario('Single-garment bill carries full detail and no measurements', async ({ page }) => {
  await createOrder(page, {
    name: 'Arjun Mehta',
    phone: '9876543210',
    city: 'Jalandhar',
    address: 'Model Town Market',
    garments: ['FULL COAT PANT'],
    remarks: { 'FULL COAT PANT': 'Peak lapel, surgeon cuffs, contrast burgundy lining' },
    fabrics: { 'FULL COAT PANT': 'Loro Piana Super 150s Midnight Navy Wool' },
    measurements: {
      'COAT MEASUREMENTS': {
        Length: 30.5, Chest: 41.75, Stomach: 37.25, 'H.P. / Hip': 42.15, Shoulder: 18.55,
        Sleeve: 25.35, 'X-Back': 17.45, Collar: 16.05, 'Jacket Length': 30.5, 'Waistcoat Length': 23.15
      },
      'PANT MEASUREMENTS': { Length: 40, Waist: 34.65, 'H.P. / Hip': 40.5, Thigh: 24.45, 'In-Leg': 31, Bottom: 15, Body: 11 }
    }
  });

  await openBillFromSuccessScreen(page);
  const bill = page.locator('#printable-order-bill');
  report.check('the bill opens from the success screen', (await bill.count()) === 1);

  const text = await bill.innerText();

  // Header: exact business identity, large and centered.
  report.check('the large brand heading reads REGENCY TAILORS', /REGENCY TAILORS/.test(text));
  report.check('the premium tagline is present', /PREMIUM TAILORING/.test(text) && /PERFECT FIT/.test(text));
  report.check('the "Customer Bill" label is present', /Customer Bill/i.test(text));
  report.check('the showroom address/phone line is present', /BOOTAN MANDI/i.test(text) && /\d{5}\s?\d{5}/.test(text));

  // Customer details
  report.check('customer name appears', text.includes('Arjun Mehta'));
  report.check('customer mobile appears', text.includes('9876543210'));
  report.check('customer address appears', /Model Town Market/.test(text));
  report.check('city appears', /Jalandhar/.test(text));
  report.check('CUSTOMER DETAILS heading present', /CUSTOMER DETAILS/.test(text));

  // Order details
  const db = await readDb(page);
  const order = db.orders[0];
  report.check('order number appears', text.includes(order.orderNumber), `order #${order.orderNumber}`);
  report.check('bill number appears', /RT-\d{5}/.test(text), text.match(/RT-\d{5}/)?.[0]);
  report.check('ORDER DATE label appears', /ORDER DATE/i.test(text));
  report.check('DELIVERY DATE label appears', /DELIVERY DATE/i.test(text));
  report.check('ORDER DETAILS heading present', /ORDER DETAILS/.test(text));

  // Product/garment table structure and this garment's row
  report.check('table has all seven column headers', [
    'S.NO', 'PRODUCT', 'GARMENT', 'DESCRIPTION', 'STITCHING', 'FABRIC', 'QTY', 'REMARKS', 'AMOUNT'
  ].every(h => text.toUpperCase().includes(h)));

  const rows = page.locator('.order-bill-row');
  report.check('exactly one garment row is rendered', (await rows.count()) === 1, `${await rows.count()} rows`);
  const rowText = await rows.first().innerText();
  report.check('the row shows the garment name', /FULL COAT PANT/i.test(rowText));
  report.check('the row shows the fabric that was entered', rowText.includes('Loro Piana Super 150s Midnight Navy Wool'));
  report.check('the row shows the garment remark', rowText.includes('Peak lapel, surgeon cuffs, contrast burgundy lining'));
  report.check('the row shows quantity 1', /\b1\b/.test(rowText));
  report.check('the row\'s S.No. is 1', (await rows.first().locator('td').first().innerText()).trim() === '1');

  const amountCell = rows.first().locator('.order-bill-amount-cell');
  report.check('the Amount cell carries no value', (await amountCell.innerText()).trim() === '',
    `"${(await amountCell.innerText()).trim()}"`);

  // Zero measurements anywhere, even though this order has a full recorded set
  assertNoMeasurements(text);
  for (const value of ['41.75', '37.25', '25.35', '34.65', '24.45']) {
    report.check(`no recorded measurement value "${value}" leaks onto the bill`, !text.includes(value));
  }
  report.check('no .production-measurement-grid element on the bill',
    (await page.locator('#printable-order-bill .production-measurement-grid').count()) === 0);

  // Zero financial information, even unprompted
  assertNoMoneyAnywhere(text);

  // The real logo asset — painted pixels, not just a "complete" flag.
  await page.waitForFunction(() => {
    const img = document.querySelector('#printable-order-bill img');
    return img && img.naturalWidth > 0;
  }, { timeout: 20000 }).catch(() => {});

  const logo = await page.evaluate(() => {
    const img = document.querySelector('#printable-order-bill img');
    if (!img) return null;
    const box = img.getBoundingClientRect();
    const info = { w: img.naturalWidth, h: img.naturalHeight, renderedW: Math.round(box.width), renderedH: Math.round(box.height), nonBlankPixels: 0 };
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
  report.check('the logo is rendered prominently large (>=100px), not shrunk to an icon',
    Boolean(logo && logo.renderedW >= 100), logo ? `${logo.renderedW}px wide` : '');
  report.check('the logo is not blown up past its header column (<=200px)',
    Boolean(logo && logo.renderedW <= 200), logo ? `${logo.renderedW}px wide` : '');

  // Signature area and disclaimer
  report.check('signature area is present', /Customer Signature/i.test(text) && /For Regency Tailors/i.test(text));
  report.check('the exact required disclaimer is present',
    /WE ARE NOT RESPONSIBLE FOR CLOTHES AFTER 2 MONTHS\./i.test(text));
});

/* ------------------------------------------------------------------ *
 * Zero financial information, even when the underlying order has      *
 * real figures — and the blank Payment Details section still shows.   *
 * ------------------------------------------------------------------ */
await scenario('Bill contains no financial information even when the order has real figures', async ({ page }) => {
  await createOrder(page, {
    name: 'Vikram Malhotra', phone: '9876500001', city: 'Jalandhar', address: 'Civil Lines',
    garments: ['FULL COAT PANT', 'SHIRT'],
    fabrics: { 'FULL COAT PANT': 'Giza 87 Egyptian Cotton', SHIRT: 'Sea Island Cotton White' }
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

  assertNoMoneyAnywhere(text);

  // The figures themselves must not be in the markup either.
  for (const value of ['24500', '24,500', '10000', '10,000', '14500', '14,500', '12250', '12,250']) {
    report.check(`bill markup does not carry the value ${value}`, !html.includes(value));
  }

  // The Payment Details section must still exist — as blank lines, per the
  // showroom's explicit request — never silently dropped and never filled in
  // from the figures the order actually has.
  report.check('PAYMENT DETAILS heading is present', /PAYMENT DETAILS/i.test(text));
  for (const label of PAYMENT_LABELS) {
    report.check(`payment label "${label}" is present`, text.toUpperCase().includes(label));
  }

  // Every Amount cell in the garment table is a blank line, never a value.
  const amountCells = page.locator('.order-bill-amount-cell');
  const amountCount = await amountCells.count();
  report.check('there are amount cells to check', amountCount === 2, `${amountCount} cells`);
  for (let i = 0; i < amountCount; i++) {
    const cellText = (await amountCells.nth(i).innerText()).trim();
    report.check(`Amount cell ${i + 1} carries no value`, cellText === '', `"${cellText}"`);
  }

  assertNoMeasurements(text);
});

/* ------------------------------------------------------------------ *
 * Several garments, each keeping its own description, fabric, and     *
 * remark — none mixed up, correct sequential numbering.                *
 * ------------------------------------------------------------------ */
await scenario('Every garment row keeps its own detail, none mixed up', async ({ page }) => {
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
    fabrics: {
      'FULL COAT PANT': 'FABRIC-SUIT navy wool',
      COAT: 'FABRIC-COAT charcoal tweed',
      PANT: 'FABRIC-PANT grey worsted',
      SHIRT: 'FABRIC-SHIRT white poplin',
      'KURTA PAJAMA': 'FABRIC-KURTA cream silk'
    },
    measurements: {
      'COAT MEASUREMENTS': { Chest: 41, Length: 30.5 },
      'PANT MEASUREMENTS': { Waist: 34, Length: 40 },
      'SHIRT MEASUREMENTS': { Chest: 40, Collar: 15.5 },
      'KURTA MEASUREMENTS': { Chest: 43, Length: 44 },
      'PAJAMA MEASUREMENTS': { Waist: 35, Length: 40 }
    }
  });

  // Fields the wizard has no UI for yet (styleNotes / fabricCode /
  // specialInstructions) still exist in the schema and the bill must render
  // them correctly when present — set directly, the same way order totals
  // are set directly in the scenario above.
  await page.evaluate(() => {
    const K = 'REGENCY_TAILORS_DB_V3_';
    const orders = JSON.parse(localStorage.getItem(K + 'ORDERS'));
    const styleByGarment = {
      'Full Coat Pant': 'DESC-SUIT 2-button notch lapel',
      Coat: 'DESC-COAT single vent',
      Pant: 'DESC-PANT flat front',
      Shirt: 'DESC-SHIRT cutaway collar',
      'Kurta Pajama': 'DESC-KURTA straight cut'
    };
    orders[0].items = orders[0].items.map(i => ({
      ...i,
      styleNotes: styleByGarment[i.garmentType] || '',
      fabricCode: `FC-${(i.garmentType || '').replace(/\s+/g, '').slice(0, 4).toUpperCase()}`
    }));
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

  const rows = page.locator('.order-bill-row');
  const count = await rows.count();
  report.check('every garment has its own row', count === 5, `${count} rows`);

  const expected = [
    ['Full Coat Pant', 'REMARK-SUIT', 'FABRIC-SUIT', 'DESC-SUIT'],
    ['Coat', 'REMARK-COAT', 'FABRIC-COAT', 'DESC-COAT'],
    ['Pant', 'REMARK-PANT', 'FABRIC-PANT', 'DESC-PANT'],
    ['Shirt', 'REMARK-SHIRT', 'FABRIC-SHIRT', 'DESC-SHIRT'],
    ['Kurta Pajama', 'REMARK-KURTA', 'FABRIC-KURTA', 'DESC-KURTA']
  ];

  for (let i = 0; i < expected.length; i++) {
    const [garment, remarkTag, fabricTag, descTag] = expected[i];
    const rowText = await rows.nth(i).innerText();
    report.check(`row ${i + 1} is the ${garment}`, rowText.toUpperCase().includes(garment.toUpperCase()));
    report.check(`row ${i + 1} carries only its own remark`, rowText.includes(remarkTag));
    report.check(`row ${i + 1} carries only its own fabric`, rowText.includes(fabricTag));
    report.check(`row ${i + 1} carries only its own description`, rowText.includes(descTag));
    report.check(`row ${i + 1}'s S.No. is ${i + 1}`,
      (await rows.nth(i).locator('td').first().innerText()).trim() === String(i + 1));

    const others = expected.filter((_, j) => j !== i);
    report.check(`row ${i + 1} does not carry another garment's remark`,
      others.every(([, r]) => !rowText.includes(r)));
    report.check(`row ${i + 1} does not carry another garment's fabric`,
      others.every(([, , f]) => !rowText.includes(f)));
    report.check(`row ${i + 1} does not carry another garment's description`,
      others.every(([, , , d]) => !rowText.includes(d)));
  }

  const billText = await page.locator('#printable-order-bill').innerText();
  assertNoMeasurements(billText);
  assertNoMoneyAnywhere(billText);
});

/* ------------------------------------------------------------------ *
 * A4 print output: page count, no overflow, no clipping, PDF matches  *
 * the on-screen preview — for a large order with a long remark.       *
 * ------------------------------------------------------------------ */
await scenario('Bill prints as properly formatted, multi-page A4 sheets', async ({ page }) => {
  const longRemark = 'Peak lapel, surgeon cuffs, working buttonholes, contrast lining in burgundy silk, ticket pocket on the right, side vents at 22cm and a slightly extended shoulder line as discussed at the fitting, plus reinforced inner pockets for a phone and cardholder.';
  await createOrder(page, {
    name: 'Harpreet Singh', phone: '9814455566', city: 'Jalandhar', address: 'Bootan Mandi',
    garments: ['FULL COAT PANT', 'COAT', 'PANT', 'SHIRT', 'KURTA PAJAMA'],
    remarks: { 'FULL COAT PANT': longRemark },
    fabrics: {
      'FULL COAT PANT': 'Loro Piana Super 150s Midnight Navy Wool',
      COAT: 'Charcoal Herringbone Tweed',
      PANT: 'Grey Worsted Wool',
      SHIRT: 'Giza 87 Egyptian Cotton White',
      'KURTA PAJAMA': 'Cream Raw Silk'
    }
  });
  await openBillFromSuccessScreen(page);

  const reported = parseInt((await page.locator('text=/\\d+ PAGES?/').first().innerText()).replace(/\D/g, ''), 10);
  const rendered = await page.locator('.a4-bill-page').count();
  report.check('rendered sheets match the reported page count', reported === rendered, `${reported} vs ${rendered}`);
  report.check('a large order with a long remark spans more than one sheet', rendered > 1, `${rendered} sheets`);

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
  report.check('every fabric reaches the paper',
    ['Loro Piana', 'Herringbone', 'Worsted', 'Giza 87', 'Raw Silk'].every(f => printedText.includes(f)));
  report.check('the closing signature area reaches the paper', /Customer Signature/i.test(printedText));
  report.check('the required disclaimer reaches the paper',
    /WE ARE NOT RESPONSIBLE FOR CLOTHES AFTER 2 MONTHS\./i.test(printedText));
  report.check('the long remark is not truncated', printedText.includes(longRemark));

  assertNoMoneyAnywhere(printedText, 'printed bill');
  assertNoMeasurements(printedText, 'printed bill');
});

/* ------------------------------------------------------------------ *
 * Missing optional detail must show a dash, never invented content,   *
 * and the Remarks/Description/Fabric columns still print as blanks.   *
 * ------------------------------------------------------------------ */
await scenario('Bill copes with missing optional detail without inventing content', async ({ page }) => {
  await createOrder(page, {
    name: 'Minimal Client', phone: '9000011122',
    garments: ['SHIRT']
  });
  await openBillFromSuccessScreen(page);

  const bill = page.locator('#printable-order-bill');
  const text = await bill.innerText();
  report.check('the bill still renders with no fabric, remark or address entered', text.includes('Minimal Client'));

  const row = page.locator('.order-bill-row').first();
  const rowText = await row.innerText();
  report.check('an empty description cell shows a dash, not blank or "undefined"',
    !/undefined|null/i.test(rowText));
  report.check('the row still shows a dash for the unentered description/fabric/remarks',
    (rowText.match(/—/g) || []).length >= 3, rowText);

  report.check('the REMARKS column header still prints (it is a fixed table column)', /REMARKS/i.test(text));
  assertNoMoneyAnywhere(text);
  assertNoMeasurements(text);
});

/* ------------------------------------------------------------------ *
 * The Production Slip and order editing remain unaffected — this      *
 * feature touches only the customer bill.                             *
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
  report.check('the slip still shows measurements — this document is the one that must', /COAT MEASUREMENTS/.test(slipText));
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
