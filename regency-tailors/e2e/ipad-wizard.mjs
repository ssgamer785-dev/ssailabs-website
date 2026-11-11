/**
 * The New Order wizard on iPads, tablets, laptops and desktops.
 *
 * The client reported that Back and Continue disappear on certain iPad sizes.
 * The footer holding them is the last thing in a full-screen column, and the
 * column was sized with 100vh — which on iPad Safari is the viewport with the
 * browser chrome retracted, taller than what is on screen, so the footer sat
 * below the fold. The on-screen keyboard and iOS's zoom-on-focus hide it by
 * other routes. This drives the real wizard through every step at every size
 * and checks the buttons are on screen, uncovered, and that nothing a user
 * types into is ever under the footer.
 *
 * What this cannot do: Chromium has no Safari toolbar and no iOS keyboard.
 *  - The large-viewport behaviour is MODELLED by making anything sized with
 *    `h-screen` 90px taller than the visible area (the old wizard must fail
 *    that pass; the fixed one is immune because it is not sized that way).
 *  - The keyboard is MODELLED with a stub `visualViewport`, which exercises the
 *    app's own handling, not iOS's.
 * Neither replaces a look at a real iPad; this is the regression net.
 *
 *   VITE_PERSISTENCE=local npx vite --port=3000
 *   E2E_BASE_URL=http://localhost:3000/ node e2e/ipad-wizard.mjs
 */
import { chromium } from 'playwright';
import { makeReporter } from './helpers.mjs';

const CHROME = process.env.CHROME_PATH || undefined;
const BASE = process.env.E2E_BASE_URL || 'http://localhost:3000/';
const report = makeReporter('IPAD / RESPONSIVE WIZARD');

/** CSS px, as Safari reports them. `chrome` = height lost to Safari's bars. */
const IPADS = [
  ['iPad mini 6',        744, 1133],
  ['iPad 9.7"',          768, 1024],
  ['iPad 10.2"',         810, 1080],
  ['iPad Air 10.9"',     820, 1180],
  ['iPad Pro 10.5"',     834, 1112],
  ['iPad Pro 11"',       834, 1194],
  ['iPad Pro 12.9"',    1024, 1366]
];
const SAFARI_CHROME_PX = 96;  // address bar + tab bar, which is what makes iPad "short"

const MATRIX = [
  ...IPADS.flatMap(([n, w, h]) => [
    { name: `${n} portrait`,                    w,     h,                      touch: true },
    { name: `${n} landscape`,                   w: h,  h: w,                    touch: true },
    { name: `${n} landscape, Safari bars shown`, w: h, h: w - SAFARI_CHROME_PX, touch: true }
  ]),
  { name: 'iPad 10.2" portrait, Safari bars shown', w: 810, h: 1080 - SAFARI_CHROME_PX, touch: true },
  { name: 'Android tablet 600x960',   w: 600,  h: 960,  touch: true },
  { name: 'small tablet landscape',   w: 960,  h: 600,  touch: true },
  { name: 'laptop 1366x768',          w: 1366, h: 768,  touch: false },
  { name: 'laptop 1440x900',          w: 1440, h: 900,  touch: false },
  { name: 'desktop 1920x1080',        w: 1920, h: 1080, touch: false },
  { name: 'short desktop window',     w: 1280, h: 520,  touch: false },
  // The Windows app's window: 1440x900 by default, 1100x700 at its smallest
  // (electron/main.cjs), and the page area loses roughly 60px to the frame.
  { name: 'desktop app default window content area', w: 1440, h: 840, touch: false },
  { name: 'desktop app minimum window content area', w: 1100, h: 640, touch: false }
];

const ALL_GARMENTS = ['COAT', 'PANT', 'SHIRT', 'KURTA PAJAMA', 'JACKET', 'WAISTCOAT', 'SHERWANI', '2 PIECE SUIT', '3 PIECE SUIT'];

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});

/* ------------------------------------------------------------ geometry --- */

const geometry = page => page.evaluate(() => {
  const rect = el => {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, width: b.width, height: b.height };
  };
  const q = s => document.querySelector(s);
  return {
    vw: window.innerWidth, vh: window.innerHeight,
    root: rect(q('[data-order-wizard]')),
    header: rect(q('[data-order-wizard] > header')),
    main: rect(q('[data-wizard-scroll]')),
    footer: rect(q('[data-wizard-footer]'))
  };
});

/** Is this footer button on screen, big enough to hit, and actually receiving taps? */
async function buttonState(page, name) {
  const btn = page.locator('[data-wizard-footer]').getByRole('button', { name }).first();
  if (!(await btn.count())) return { missing: true };
  return btn.evaluate(el => {
    const b = el.getBoundingClientRect();
    const pts = [[0.5, 0.5], [0.1, 0.2], [0.9, 0.2], [0.1, 0.8], [0.9, 0.8]]
      .map(([fx, fy]) => [b.left + b.width * fx, b.top + b.height * fy]);
    const covered = pts.some(([x, y]) => {
      const hit = document.elementFromPoint(x, y);
      return !hit || !(hit === el || el.contains(hit));
    });
    return {
      top: b.top, bottom: b.bottom, left: b.left, right: b.right, w: b.width, h: b.height,
      cx: b.left + b.width / 2, cy: b.top + b.height / 2,
      vw: window.innerWidth, vh: window.innerHeight, covered, disabled: el.disabled
    };
  });
}

const inside = (b, vw, vh) => b.top >= -0.5 && b.left >= -0.5 && b.bottom <= vh + 0.5 && b.right <= vw + 0.5;

/** A real tap/click at the button's own coordinates — no auto-scrolling to rescue it. */
async function press(page, touch, name) {
  const s = await buttonState(page, name);
  if (s.missing || !inside(s, s.vw, s.vh)) return false;
  if (touch) await page.touchscreen.tap(s.cx, s.cy); else await page.mouse.click(s.cx, s.cy);
  await page.waitForTimeout(450);
  return true;
}

/* ----------------------------------------------------------- one step ---- */

async function checkStep(page, vp, step, tag) {
  const g = await geometry(page);
  const at = `${vp.name} · step ${step}${tag ? ' · ' + tag : ''}`;

  report.check(`${at}: the wizard fits the screen`,
    g.root && g.root.top >= -0.5 && g.root.left >= -0.5 && g.root.bottom <= g.vh + 0.5 && g.root.right <= g.vw + 0.5,
    g.root ? `root ${Math.round(g.root.width)}x${Math.round(g.root.height)} in ${g.vw}x${g.vh}` : 'no root');

  report.check(`${at}: the footer is on screen`,
    g.footer && g.footer.bottom <= g.vh + 0.5 && g.footer.top >= 0 && g.footer.height > 30,
    g.footer ? `footer ${Math.round(g.footer.top)}-${Math.round(g.footer.bottom)} of ${g.vh}` : 'no footer');

  report.check(`${at}: the scroll area ends where the footer begins`,
    g.main && g.footer && Math.abs(g.main.bottom - g.footer.top) <= 1.5,
    g.main && g.footer ? `main ends ${Math.round(g.main.bottom)}, footer starts ${Math.round(g.footer.top)}` : '');

  report.check(`${at}: the header is on screen`, g.header && g.header.top >= -0.5 && g.header.bottom > 0);

  const fwd = await buttonState(page, step < 5 ? /^Continue$/ : /PLACE ORDER/);
  const back = await buttonState(page, step > 1 ? /^Back$/ : /^Cancel$/);
  const label = step < 5 ? 'Continue' : 'Place Order';
  const backLabel = step > 1 ? 'Back' : 'Cancel';

  report.check(`${at}: ${label} is fully on screen`, !fwd.missing && inside(fwd, fwd.vw, fwd.vh),
    fwd.missing ? 'missing' : `${Math.round(fwd.top)}-${Math.round(fwd.bottom)} of ${fwd.vh}`);
  report.check(`${at}: ${label} is not covered by anything`, !fwd.missing && !fwd.covered);
  report.check(`${at}: ${label} is big enough to tap`, !fwd.missing && fwd.h >= 44 && fwd.w >= 80,
    fwd.missing ? '' : `${Math.round(fwd.w)}x${Math.round(fwd.h)}`);
  report.check(`${at}: ${backLabel} is fully on screen`, !back.missing && inside(back, back.vw, back.vh),
    back.missing ? 'missing' : `${Math.round(back.top)}-${Math.round(back.bottom)} of ${back.vh}`);
  report.check(`${at}: ${backLabel} is not covered by anything`, !back.missing && !back.covered);
  report.check(`${at}: ${backLabel} is big enough to tap`, !back.missing && back.h >= 44 && back.w >= 60,
    back.missing ? '' : `${Math.round(back.w)}x${Math.round(back.h)}`);
  report.check(`${at}: ${label} and ${backLabel} do not overlap each other`,
    !fwd.missing && !back.missing && (back.right <= fwd.left + 0.5 || fwd.right <= back.left + 0.5));

  // The body keeps scrolling, and everything in it is reachable above the footer.
  const body = await page.evaluate(() => {
    const main = document.querySelector('[data-wizard-scroll]');
    const footer = document.querySelector('[data-wizard-footer]');
    const fTop = footer.getBoundingClientRect().top;
    const scrollable = main.scrollHeight > main.clientHeight + 1;
    main.scrollTop = main.scrollHeight;
    const kids = [...main.querySelectorAll('input, textarea, select, button')]
      .filter(e => e.getClientRects().length);
    const last = kids[kids.length - 1];
    const lb = last ? last.getBoundingClientRect() : null;
    const out = {
      scrollable,
      reached: !scrollable || main.scrollTop + main.clientHeight >= main.scrollHeight - 1,
      lastAboveFooter: !lb || lb.bottom <= fTop + 1,
      hOverflow: main.scrollWidth - main.clientWidth
    };
    main.scrollTop = 0;
    return out;
  });
  report.check(`${at}: the body scrolls to its end`, body.reached);
  report.check(`${at}: the last control is clear of the footer when scrolled to the end`, body.lastAboveFooter);
  report.check(`${at}: nothing scrolls sideways`, body.hOverflow <= 1, `${body.hOverflow}px`);
  return body;
}

/** Step 4: every measurement box, scrolled to, must be clear of the footer. */
async function checkMeasurementInputs(page, vp, tag, minBoxes) {
  const r = await page.evaluate(() => {
    const main = document.querySelector('[data-wizard-scroll]');
    const footer = document.querySelector('[data-wizard-footer]').getBoundingClientRect();
    const header = document.querySelector('[data-order-wizard] > header').getBoundingClientRect();
    const inputs = [...document.querySelectorAll('input[data-measurement-input]')];
    let hidden = 0, overlapped = 0, outside = 0;
    for (const el of inputs) {
      el.scrollIntoView({ block: 'center' });
      const b = el.getBoundingClientRect();
      const overlapsFooter = b.bottom > footer.top + 0.5 && b.top < footer.bottom;
      const underHeader = b.top < header.bottom - 0.5;
      if (overlapsFooter) overlapped++;
      if (underHeader) hidden++;
      if (b.bottom > window.innerHeight + 0.5 || b.right > window.innerWidth + 0.5) outside++;
    }
    main.scrollTop = 0;
    return { n: inputs.length, hidden, overlapped, outside };
  });
  const at = `${vp.name} · measurements${tag ? ' · ' + tag : ''}`;
  report.check(`${at}: ${r.n} measurement boxes are all reachable`, r.n >= minBoxes, `${r.n} boxes (expected at least ${minBoxes})`);
  report.check(`${at}: no measurement box sits under the footer`, r.overlapped === 0, `${r.overlapped} overlapped`);
  report.check(`${at}: no measurement box sits under the header`, r.hidden === 0, `${r.hidden} hidden`);
  report.check(`${at}: no measurement box is off screen`, r.outside === 0, `${r.outside} outside`);
}

/* ------------------------------------------------------- run the wizard --- */

async function openWizard(vp, { simulateLargeViewport = false } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: vp.w, height: vp.h },
    hasTouch: vp.touch, isMobile: vp.touch,
    deviceScaleFactor: vp.touch ? 2 : 1
  });
  // A controllable visual viewport, for the keyboard checks.
  await ctx.addInitScript(() => {
    const vv = new EventTarget();
    Object.assign(vv, { width: innerWidth, height: innerHeight, offsetTop: 0, offsetLeft: 0, scale: 1 });
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
    window.__setVV = (height, top = 0) => { vv.height = height; vv.offsetTop = top; vv.dispatchEvent(new Event('resize')); };
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  if (simulateLargeViewport) {
    // Safari's 100vh is the viewport with the toolbars retracted: taller than
    // what is visible. Model that: anything sized by h-screen overshoots by 90px.
    await page.addStyleTag({ content: '.h-screen, .min-h-screen { height: calc(100vh + 90px) !important; }' });
  }
  return { ctx, page, errors };
}

async function startNewOrder(page, touch) {
  await page.getByRole('button', { name: /Dashboard Hub/i }).first().click().catch(() => {});
  await page.waitForTimeout(250);
  const newOrder = page.getByRole('button', { name: /New Order/i }).first();
  await newOrder.click();
  await page.waitForTimeout(700);
}

async function walk(vp, { garments, simulateLargeViewport = false, tag = '' } = {}) {
  const { ctx, page, errors } = await openWizard(vp, { simulateLargeViewport });
  await startNewOrder(page, vp.touch);

  // STEP 1
  await checkStep(page, vp, 1, tag);
  await page.getByPlaceholder('e.g. Vikram Malhotra').fill('Wizard Layout');
  await page.getByPlaceholder('e.g. 9876543210').fill('9' + String(Math.floor(100000000 + Math.random() * 899999999)));
  await page.getByPlaceholder('e.g. Jalandhar').fill('Jalandhar');
  await page.getByPlaceholder('e.g. Model Town, Jalandhar').fill('Model Town');
  let advanced = await press(page, vp.touch, /^Continue$/);
  report.check(`${vp.name}${tag ? ' · ' + tag : ''}: tapping Continue on step 1 moves on`, advanced);

  // STEP 2
  await checkStep(page, vp, 2, tag);
  advanced = await press(page, vp.touch, /^Continue$/);
  report.check(`${vp.name}${tag ? ' · ' + tag : ''}: tapping Continue on step 2 moves on`, advanced);

  // STEP 3 — garments
  await checkStep(page, vp, 3, tag);
  for (const g of garments) {
    const card = page.locator(`h3:text-is("${g}")`).locator('xpath=ancestor::div[contains(@class,"rounded-3xl")][1]');
    await card.getByRole('button', { name: /Select/ }).first().click();
    await page.waitForTimeout(120);
  }
  await checkStep(page, vp, 3, `${tag ? tag + ' · ' : ''}${garments.length} garments`);
  advanced = await press(page, vp.touch, /^Continue$/);
  report.check(`${vp.name}${tag ? ' · ' + tag : ''}: tapping Continue on step 3 moves on`, advanced);

  // STEP 4 — measurements
  await checkStep(page, vp, 4, tag);
  // Coat 10; 3 Piece Suit = coat 10 + pant 7 + waistcoat 5; all nine garments is far more.
  const minBoxes = garments.length === ALL_GARMENTS.length ? 40 : garments.includes('3 PIECE SUIT') ? 22 : 10;
  await checkMeasurementInputs(page, vp, tag, minBoxes);
  advanced = await press(page, vp.touch, /^Continue$/);
  report.check(`${vp.name}${tag ? ' · ' + tag : ''}: tapping Continue on step 4 moves on`, advanced);

  // STEP 5 — review
  await checkStep(page, vp, 5, tag);

  // Back really goes back.
  const wentBack = await press(page, vp.touch, /^Back$/);
  const onStep4 = (await page.locator('input[data-measurement-input]').count()) > 0;
  report.check(`${vp.name}${tag ? ' · ' + tag : ''}: tapping Back from Review returns to Measurements`, wentBack && onStep4);

  report.check(`${vp.name}${tag ? ' · ' + tag : ''}: no uncaught page errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
  return { ctx, page };
}

/* ======================================================================= */

console.log('\n=== EVERY STEP, EVERY SIZE (all nine garments selected: the tallest case) ===');
// ONLY="iPad 10.2" narrows the first pass to matching sizes, for quick iteration.
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY, 'i') : null;
for (const vp of ONLY ? MATRIX.filter(v => ONLY.test(v.name)) : MATRIX) {
  const { ctx } = await walk(vp, { garments: ALL_GARMENTS });
  await ctx.close();
}

console.log('\n=== A SINGLE COAT (the shortest case) AT THE TIGHTEST SIZES ===');
for (const vp of [
  MATRIX.find(v => v.name === 'iPad 10.2" landscape, Safari bars shown'),
  MATRIX.find(v => v.name === 'iPad 10.2" portrait, Safari bars shown'),
  MATRIX.find(v => v.name === 'short desktop window'),
  MATRIX.find(v => v.name === 'Android tablet 600x960')
]) {
  const { ctx } = await walk(vp, { garments: ['COAT'], tag: 'single coat' });
  await ctx.close();
}

console.log('\n=== SAFARI LARGE-VIEWPORT MODEL: h-screen is 90px taller than the visible area ===');
for (const vp of [
  MATRIX.find(v => v.name === 'iPad 10.2" portrait, Safari bars shown'),
  MATRIX.find(v => v.name === 'iPad Air 10.9" landscape, Safari bars shown')
]) {
  const { ctx } = await walk(vp, { garments: ['3 PIECE SUIT'], simulateLargeViewport: true, tag: 'large-viewport model' });
  await ctx.close();
}

/* ------------------------------------------------ keyboard, safe area, zoom */

console.log('\n=== ON-SCREEN KEYBOARD (stub visualViewport) ===');
{
  const vp = { name: 'iPad 10.2" portrait', w: 810, h: 1080, touch: true };
  const { ctx, page } = await openWizard(vp);
  await startNewOrder(page, true);
  await page.getByPlaceholder('e.g. Vikram Malhotra').fill('Keyboard Test');
  await page.getByPlaceholder('e.g. 9876543210').fill('9876512345');
  await press(page, true, /^Continue$/);
  await press(page, true, /^Continue$/);
  const card = page.locator('h3:text-is("3 PIECE SUIT")').locator('xpath=ancestor::div[contains(@class,"rounded-3xl")][1]');
  await card.getByRole('button', { name: /Select/ }).first().click();
  await press(page, true, /^Continue$/);

  // Focus the very last measurement box, then raise a keyboard ~38% of the screen.
  const last = page.locator('input[data-measurement-input]').last();
  await last.scrollIntoViewIfNeeded();
  await last.focus();
  const KB = 400;
  const visibleH = vp.h - KB;
  await page.evaluate(h => window.__setVV(h, 0), visibleH);
  await page.waitForTimeout(400);

  const g = await geometry(page);
  report.check('keyboard up: the wizard shrinks to the visible area',
    g.root && Math.abs(g.root.height - visibleH) <= 1.5 && Math.abs(g.root.top) <= 1.5,
    g.root ? `root height ${Math.round(g.root.height)} vs visible ${visibleH}` : '');
  report.check('keyboard up: the footer sits above the keyboard', g.footer && g.footer.bottom <= visibleH + 0.5,
    g.footer ? `footer bottom ${Math.round(g.footer.bottom)} vs keyboard top ${visibleH}` : '');
  const fwd = await buttonState(page, /^Continue$/);
  const back = await buttonState(page, /^Back$/);
  report.check('keyboard up: Continue is above the keyboard and uncovered',
    !fwd.missing && fwd.bottom <= visibleH + 0.5 && !fwd.covered, fwd.missing ? 'missing' : `bottom ${Math.round(fwd.bottom)}`);
  report.check('keyboard up: Back is above the keyboard and uncovered',
    !back.missing && back.bottom <= visibleH + 0.5 && !back.covered, back.missing ? 'missing' : `bottom ${Math.round(back.bottom)}`);
  const focusedVisible = await page.evaluate(() => {
    const el = document.activeElement;
    const main = document.querySelector('[data-wizard-scroll]').getBoundingClientRect();
    const b = el.getBoundingClientRect();
    return b.top >= main.top - 0.5 && b.bottom <= main.bottom + 0.5;
  });
  report.check('keyboard up: the focused box is scrolled into the visible part of the body', focusedVisible);

  // iOS pans the visual viewport to reveal the field: the overlay follows it.
  await page.evaluate(h => window.__setVV(h, 60), visibleH);
  await page.waitForTimeout(300);
  const panned = await geometry(page);
  report.check('keyboard up and panned: the wizard follows the visual viewport',
    panned.root && Math.abs(panned.root.top - 60) <= 1.5, panned.root ? `top ${Math.round(panned.root.top)}` : '');

  // Keyboard down: everything returns to ordinary full-screen sizing.
  await page.evaluate(h => window.__setVV(h, 0), vp.h);
  await page.waitForTimeout(400);
  const after = await geometry(page);
  const styleLeft = await page.evaluate(() => document.querySelector('[data-order-wizard]').getAttribute('style') || '');
  report.check('keyboard down: the wizard is full screen again', after.root && Math.abs(after.root.height - vp.h) <= 1.5,
    after.root ? `height ${Math.round(after.root.height)}` : '');
  report.check('keyboard down: no inline sizing is left behind', !/height|top/.test(styleLeft), styleLeft || '(none)');

  // A small change — Safari's toolbar hiding — must not be mistaken for a keyboard.
  await page.evaluate(h => window.__setVV(h, 0), vp.h - 70);
  await page.waitForTimeout(300);
  const tool = await geometry(page);
  report.check('a toolbar hiding is not treated as a keyboard', tool.root && Math.abs(tool.root.height - vp.h) <= 1.5);
  await ctx.close();
}

console.log('\n=== SAFE-AREA INSETS ===');
{
  const vp = { name: 'iPad 10.2" landscape', w: 1080, h: 810, touch: true };
  const { ctx, page } = await openWizard(vp);
  await startNewOrder(page, true);
  // env(safe-area-inset-*) is 0 in a desktop browser; override the variables the
  // shell derives from it to what a Home Screen app on a Face-ID iPad reports.
  await page.evaluate(() => {
    const root = document.querySelector('[data-order-wizard]');
    root.style.setProperty('--safe-top', '24px');
    root.style.setProperty('--safe-bottom', '34px');
    root.style.setProperty('--safe-left', '20px');
    root.style.setProperty('--safe-right', '20px');
  });
  await page.waitForTimeout(200);
  const insets = await page.evaluate(() => {
    const cs = sel => getComputedStyle(document.querySelector(sel));
    const root = cs('[data-order-wizard]');
    return {
      footerBottom: parseFloat(cs('[data-wizard-footer]').paddingBottom),
      headerTop: parseFloat(cs('[data-order-wizard] > header').paddingTop),
      left: parseFloat(root.paddingLeft), right: parseFloat(root.paddingRight)
    };
  });
  report.check('a 34px bottom inset pads the footer by at least 34px', insets.footerBottom >= 34, `${insets.footerBottom}px`);
  report.check('a 24px top inset pads the header by at least 24px', insets.headerTop >= 24, `${insets.headerTop}px`);
  report.check('side insets pad the whole wizard', insets.left >= 20 && insets.right >= 20, `${insets.left}/${insets.right}px`);
  const fwd = await buttonState(page, /^Continue$/);
  report.check('with the inset applied, Continue still clears the home indicator',
    !fwd.missing && fwd.bottom <= fwd.vh - 34 + 0.5, fwd.missing ? '' : `bottom ${Math.round(fwd.bottom)} of ${fwd.vh}`);
  await ctx.close();

  // With no inset (the normal browser case) the footer keeps its ordinary padding.
  const plain = await openWizard({ name: 'plain', w: 1080, h: 810, touch: true });
  await startNewOrder(plain.page, true);
  const pad = await plain.page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('[data-wizard-footer]')).paddingBottom));
  report.check('with no inset the footer keeps ordinary padding', pad >= 8 && pad <= 20, `${pad}px`);
  await plain.ctx.close();
}

console.log('\n=== FIELDS DO NOT TRIGGER iOS ZOOM; DESKTOP IS UNCHANGED ===');
for (const [touch, name] of [[true, 'touch tablet'], [false, 'desktop']]) {
  const vp = { name, w: touch ? 1024 : 1440, h: touch ? 768 : 900, touch };
  const { ctx, page } = await openWizard(vp);
  const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
  report.check(`${name}: the emulation reports a ${touch ? 'coarse' : 'fine'} pointer`, coarse === touch);
  await startNewOrder(page, touch);
  const nameSize = await page.getByPlaceholder('e.g. Vikram Malhotra').evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  await page.getByPlaceholder('e.g. Vikram Malhotra').fill('Zoom Test');
  await page.getByPlaceholder('e.g. 9876543210').fill('9876500077');
  await press(page, touch, /^Continue$/);
  await press(page, touch, /^Continue$/);
  const card = page.locator('h3:text-is("COAT")').locator('xpath=ancestor::div[contains(@class,"rounded-3xl")][1]');
  await card.getByRole('button', { name: /Select/ }).first().click();
  await press(page, touch, /^Continue$/);
  const sizes = await page.evaluate(() =>
    [...new Set([...document.querySelectorAll('input[data-measurement-input]')]
      .map(e => parseFloat(getComputedStyle(e).fontSize)))]);
  if (touch) {
    report.check(`${name}: the customer field is at least 16px (no iOS zoom on focus)`, nameSize >= 16, `${nameSize}px`);
    report.check(`${name}: every measurement box is at least 16px`, sizes.every(s => s >= 16), sizes.join(','));
  } else {
    report.check(`${name}: fields keep their designed size`, nameSize < 16 && sizes.every(s => s < 16), `${nameSize}px / ${sizes.join(',')}`);
  }
  await ctx.close();
}

console.log('\n=== MEASUREMENT BOXES ARE FREE-TEXT, WITH A TEXT KEYBOARD ===');
{
  const vp = { name: 'iPad', w: 810, h: 1080, touch: true };
  const { ctx, page } = await openWizard(vp);
  await startNewOrder(page, true);
  await page.getByPlaceholder('e.g. Vikram Malhotra').fill('Keypad Test');
  await page.getByPlaceholder('e.g. 9876543210').fill('9876500088');
  await press(page, true, /^Continue$/);
  await press(page, true, /^Continue$/);
  const card = page.locator('h3:text-is("3 PIECE SUIT")').locator('xpath=ancestor::div[contains(@class,"rounded-3xl")][1]');
  await card.getByRole('button', { name: /Select/ }).first().click();
  await press(page, true, /^Continue$/);
  const attrs = await page.evaluate(() =>
    [...document.querySelectorAll('input[data-measurement-input]')].map(e => ({
      type: e.type, mode: e.getAttribute('inputmode'), cap: e.getAttribute('autocapitalize'),
      cor: e.getAttribute('autocorrect'), spell: e.getAttribute('spellcheck'), pattern: e.getAttribute('pattern')
    })));
  report.check(`all ${attrs.length} boxes are type=text`, attrs.length > 0 && attrs.every(a => a.type === 'text'));
  report.check('none asks for a numeric keypad', attrs.every(a => a.mode === 'text'), [...new Set(attrs.map(a => a.mode))].join(','));
  report.check('none autocapitalises or autocorrects', attrs.every(a => a.cap === 'off' && a.cor === 'off' && a.spell === 'false'));
  report.check('none restricts the characters', attrs.every(a => !a.pattern));
  await ctx.close();
}

await browser.close();
process.exit(report.summary() ? 1 : 0);
