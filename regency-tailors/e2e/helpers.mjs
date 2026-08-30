import { chromium } from 'playwright';

// Playwright's own download is skipped in most CI images; allow an override.
export const CHROME = process.env.CHROME_PATH || undefined;
export const BASE = process.env.E2E_BASE_URL || 'http://localhost:3000/';

export async function launch(opts = {}) {
  const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, acceptDownloads: true, ...opts });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  return { browser, ctx, page, errors };
}

export async function readDb(page) {
  return page.evaluate(() => {
    const g = k => { try { return JSON.parse(localStorage.getItem('REGENCY_TAILORS_DB_V3_' + k) || 'null'); } catch { return 'PARSE_ERR'; } };
    return {
      customers: g('CUSTOMERS') || [], orders: g('ORDERS') || [], measurements: g('MEASUREMENTS') || [],
      invoices: g('INVOICES') || [], fittings: g('FITTINGS') || [], trash: g('TRASH') || [],
      seq: localStorage.getItem('REGENCY_TAILORS_DB_V3_ORDER_SEQ')
    };
  });
}

/*
 * Runs the full New Order wizard. garments: array of GARMENT_CONFIGS labels
 * e.g. 'FULL COAT PANT'.
 *
 * There is deliberately no `fabrics` option: fabric, style/cut and garment
 * notes are no longer collected anywhere in the wizard, so a helper that
 * pretended to type them would be testing a screen that does not exist. Orders
 * that predate the change still carry those columns, and the tests that cover
 * the bill rendering them seed the stored order directly instead.
 */
export async function createOrder(page, { name, phone, city, address, garments = ['FULL COAT PANT'], remarks = {}, measurements = {} }) {
  await page.getByRole('button', { name: /Dashboard Hub/i }).click().catch(() => {});
  await page.waitForTimeout(250);
  await page.getByRole('button', { name: /New Order/i }).first().click();
  await page.waitForTimeout(400);
  const wizardNum = (await page.locator('text=/^Order #/').first().innerText()).replace(/\D/g, '');

  await page.getByPlaceholder('e.g. Vikram Malhotra').fill(name);
  await page.getByPlaceholder('e.g. 9876543210').fill(phone);
  if (city) await page.getByPlaceholder('e.g. Jalandhar').fill(city);
  if (address) await page.getByPlaceholder('e.g. Model Town, Jalandhar').fill(address);
  await page.getByRole('button', { name: /^Continue$/ }).click();
  await page.waitForTimeout(250);
  await page.getByRole('button', { name: /^Continue$/ }).click();  // step 2 defaults
  await page.waitForTimeout(250);

  for (const g of garments) {
    const card = page.locator(`h3:text-is("${g}")`).locator('xpath=ancestor::div[contains(@class,"rounded-3xl")][1]');
    await card.getByRole('button', { name: /Select/ }).first().click();
    await page.waitForTimeout(250);
  }
  await page.getByRole('button', { name: /^Continue$/ }).click();
  await page.waitForTimeout(350);

  // Step 4: per-garment REMARKS textareas (one per selected garment, in selection order)
  const remarkBoxes = page.getByPlaceholder('Add any production remarks for this garment...');
  const rbCount = await remarkBoxes.count();
  for (let i = 0; i < rbCount; i++) {
    const key = garments[i];
    if (remarks[key]) await remarkBoxes.nth(i).fill(remarks[key]);
  }

  // Step 4: fill measurements. `measurements` = { 'COAT MEASUREMENTS': { Chest: 40, ... }, ... }
  for (const [sectionTitle, fields] of Object.entries(measurements)) {
    const section = page.locator('div.space-y-3').filter({ hasText: sectionTitle }).last();
    for (const [label, val] of Object.entries(fields)) {
      const input = section.locator('div.space-y-1')
        .filter({ has: page.locator(`label:text-is("${label}")`) })
        .locator('input').first();
      if (await input.count()) await input.fill(String(val));
    }
  }

  await page.getByRole('button', { name: /^Continue$/ }).click();
  await page.waitForTimeout(350);
  await page.getByRole('button', { name: /PLACE ORDER/ }).click();
  await page.waitForTimeout(700);

  return wizardNum;
}

export async function closeWizard(page) {
  const done = page.getByRole('button', { name: /done|close|finish|back to/i }).first();
  if (await done.count()) { await done.click(); await page.waitForTimeout(400); return; }
  await page.getByRole('button', { name: /^Exit$/ }).click();
  await page.waitForTimeout(400);
}

/** Dismiss the order-success screen and return to the dashboard. */
export async function finishOrder(page) {
  await page.getByRole('button', { name: /Back to Dashboard|Exit|Close|Done/i }).first().click().catch(() => {});
  await page.waitForTimeout(400);
}

/** Number of sheets a PDF buffer contains. */
export function pdfPageCount(buffer) {
  const match = /\/Count\s+(\d+)/.exec(buffer.toString('latin1'));
  return match ? parseInt(match[1], 10) : 0;
}

/** Minimal assertion helper so the suite has no extra runtime dependency. */
export function makeReporter(label) {
  const results = [];
  return {
    check(name, condition, detail = '') {
      results.push({ name, ok: Boolean(condition), detail });
      console.log(`  ${condition ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
    },
    summary() {
      const failed = results.filter(r => !r.ok);
      console.log(`\n${label}: ${results.length - failed.length}/${results.length} passed`);
      return failed.length;
    }
  };
}
