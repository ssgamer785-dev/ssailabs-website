/**
 * Auth gate tests.
 *
 * Runs against a build in Supabase mode. These prove the client-side gate:
 * that an unauthenticated visitor never reaches the dashboard and never sees
 * showroom data. They do NOT prove authorisation — that is enforced by Row
 * Level Security and tested in supabase/tests/10_test_rls.sql, which is the
 * check that actually matters if someone bypasses this screen.
 *
 *   E2E_BASE_URL=http://localhost:3001 node e2e/auth-gate.mjs
 */
import { launch, makeReporter } from './helpers.mjs';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:3001';
const report = makeReporter('AUTH GATE');

const { browser, page, errors } = await launch();
await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);

const body = await page.innerText('body');

report.check('the sign-in screen is shown', /sign in|Continue with Google|not configured/i.test(body),
  body.split('\n').filter(Boolean).slice(0, 3).join(' | '));

report.check('the dashboard is not rendered', !/Dashboard Hub|Customers Ledger|Showroom Orders/.test(body));

report.check('no customer or order data is on the page',
  !/TOTAL CUSTOMERS|ACTIVE ORDERS|Recent Bespoke Orders/.test(body));

report.check('the navigation sidebar is absent', (await page.locator('.print-app-shell').count()) === 0);

// Client-side state must not carry business data before sign-in.
const leaked = await page.evaluate(() => {
  const keys = Object.keys(localStorage);
  const business = keys.filter(k => k.startsWith('REGENCY_TAILORS_DB_V3'));
  return { business, all: keys };
});
report.check('no showroom records are written to browser storage before sign-in',
  leaked.business.length === 0, leaked.business.join(',') || '(none)');

report.check('no service-role key is present in the page',
  !(await page.content()).includes('service_role'));

// Navigating straight to a deep link must not skip the gate.
await page.goto(`${BASE}/#/orders`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
const afterDeepLink = await page.innerText('body');
report.check('a deep link does not bypass the gate',
  !/Dashboard Hub|Showroom Orders/.test(afterDeepLink));

report.check('no uncaught page errors', errors.length === 0, errors.join(' | '));

await browser.close();
process.exit(report.summary() > 0 ? 1 : 0);
