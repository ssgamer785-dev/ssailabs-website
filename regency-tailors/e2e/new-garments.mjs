/**
 * The garments the showroom added, driven through the real application.
 *
 * Unit tests prove the canonical definitions agree with each other. This
 * proves the wizard actually offers these garments, draws the right boxes,
 * moves between them on Enter without placing the order, stores what was
 * typed, and prints it on the workshop slip — which is the only chain that
 * matters to a counter hand.
 */
import { launch, readDb, createOrder, finishOrder, BASE, makeReporter } from './helpers.mjs';

const report = makeReporter('NEW GARMENTS');
const { browser, page } = await launch();
page.on('pageerror', e => report.check(`no uncaught page error: ${e.message}`, false));

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

/** Section headings visible in the wizard's measurement step. */
const visibleSections = async () =>
  (await page.locator('div.space-y-3 >> text=/MEASUREMENTS \\(/').allInnerTexts())
    .map(t => t.replace(/\s*\(.*$/, '').trim());

/** Open the wizard as far as the measurement step with one garment selected. */
async function openMeasurementStep(label, name, phone) {
  await page.getByRole('button', { name: /Dashboard Hub/i }).click().catch(() => {});
  await page.waitForTimeout(250);
  await page.getByRole('button', { name: /New Order/i }).first().click();
  await page.waitForTimeout(400);
  await page.getByPlaceholder('e.g. Vikram Malhotra').fill(name);
  await page.getByPlaceholder('e.g. 9876543210').fill(phone);
  await page.getByRole('button', { name: /^Continue$/ }).click();
  await page.waitForTimeout(250);
  await page.getByRole('button', { name: /^Continue$/ }).click();
  await page.waitForTimeout(250);
  const card = page.locator(`h3:text-is("${label}")`)
    .locator('xpath=ancestor::div[contains(@class,"rounded-3xl")][1]');
  await card.getByRole('button', { name: /Select/ }).first().click();
  await page.waitForTimeout(250);
  await page.getByRole('button', { name: /^Continue$/ }).click();
  await page.waitForTimeout(500);
}

async function abandon() {
  await page.getByRole('button', { name: /^Exit$/ }).first().click().catch(() => {});
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /discard|yes|confirm|exit/i }).first().click().catch(() => {});
  await page.waitForTimeout(400);
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
}

/* ------------------------------------------- each garment draws its own boxes */

const EXPECTED_SECTIONS = [
  ['JACKET',        ['JACKET MEASUREMENTS']],
  ['WAISTCOAT',     ['WAISTCOAT MEASUREMENTS']],
  ['SHERWANI',      ['SHERWANI MEASUREMENTS']],
  ['2 PIECE SUIT',  ['COAT MEASUREMENTS', 'PANT MEASUREMENTS']],
  ['3 PIECE SUIT',  ['COAT MEASUREMENTS', 'PANT MEASUREMENTS', 'WAISTCOAT MEASUREMENTS']]
];

let phoneSeq = 9700000000;
for (const [label, expected] of EXPECTED_SECTIONS) {
  await openMeasurementStep(label, `Sect ${label}`, String(++phoneSeq));
  const seen = await visibleSections();
  report.check(`${label}: shows ${expected.join(' + ')}`,
    JSON.stringify(seen) === JSON.stringify(expected), seen.join(', ') || '(none)');
  await abandon();
}

/* ------------------------------------------------------- Enter moves, never saves */

await openMeasurementStep('3 PIECE SUIT', 'Enter Nav', String(++phoneSeq));

const inputs = page.locator('input[data-measurement-input]');
const total = await inputs.count();
report.check('a 3 Piece Suit offers coat + pant + waistcoat boxes', total === 10 + 7 + 5, `${total} boxes`);

await inputs.first().click();
await inputs.first().fill('31');
const orderedNames = [];
for (let i = 0; i < total - 1; i++) {
  await page.keyboard.press('Enter');
  await page.waitForTimeout(40);
  orderedNames.push(await page.evaluate(() => document.activeElement?.id || ''));
}
report.check('Enter walked every remaining box in order',
  orderedNames.length === total - 1 && orderedNames.every(Boolean), `${orderedNames.length} steps`);
report.check('Enter crossed from the coat into the pant',
  orderedNames.some(id => id.startsWith('m-pant-')), orderedNames.filter(i => i.startsWith('m-pant-'))[0] || '');
report.check('Enter crossed from the pant into the waistcoat',
  orderedNames.some(id => id.startsWith('m-waistcoat-')),
  orderedNames.filter(i => i.startsWith('m-waistcoat-'))[0] || '');
report.check('the coat ran before the waistcoat',
  orderedNames.findIndex(i => i.startsWith('m-pant-')) <
  orderedNames.findIndex(i => i.startsWith('m-waistcoat-')));

// Still on the measurement step: Enter must not have placed the order.
report.check('Enter on the last box did not place the order',
  await page.getByRole('button', { name: /PLACE ORDER/ }).count() === 0);
report.check('and the wizard is still on Measurements',
  (await page.locator('text=/MEASUREMENTS/').count()) > 0);
await abandon();

/* -------------------------------------------- saved, reloaded and printed */

await createOrder(page, {
  name: 'Suit Client', phone: '9700000099',
  garments: ['3 PIECE SUIT'],
  measurements: {
    'COAT MEASUREMENTS': { Length: 31, Chest: 40, Collar: 16 },
    'PANT MEASUREMENTS': { Length: 40, Waist: 34 },
    'WAISTCOAT MEASUREMENTS': { Length: 25, Chest: 40, Shoulder: 18 }
  }
});
await finishOrder(page);

const db = await readDb(page);
const order = db.orders[db.orders.length - 1];
const snap = order.measurementsSnapshot || {};
report.check('the coat section was stored', snap.coat?.chest == 40, JSON.stringify(snap.coat || {}));
report.check('the pant section was stored', snap.pant?.waist == 34, JSON.stringify(snap.pant || {}));
report.check('the waistcoat section was stored', snap.waistcoat?.length == 25, JSON.stringify(snap.waistcoat || {}));
report.check('no jacket section leaked in', snap.jacketGarment === undefined);
report.check('no shirt section leaked in', snap.shirt === undefined);

await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.getByRole('button', { name: /Production Slips/i }).first().click();
await page.waitForTimeout(1000);
await page.locator('button[title="Print Production Slip"]').first().click();
await page.waitForTimeout(2200);
const slip = (await page.locator('div.fixed.inset-0.z-50').last().innerText()).replace(/\s+/g, ' ');
report.check('the slip prints the coat table', /COAT MEASUREMENTS/i.test(slip));
report.check('the slip prints the pant table', /PANT MEASUREMENTS/i.test(slip));
report.check('the slip prints the waistcoat table', /WAISTCOAT MEASUREMENTS/i.test(slip));
report.check('the slip carries the stored waistcoat length', /\b25\b/.test(slip));
report.check('the slip invents no jacket table', !/JACKET MEASUREMENTS/i.test(slip));

await browser.close();
process.exit(report.summary() === 0 ? 0 : 1);
