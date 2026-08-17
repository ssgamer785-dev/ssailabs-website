// Browser E2E for the Trash / soft-delete feature. Drives the real built UI in a headless
// Chromium against a running preview server and a Supabase-compatible Postgres backend.
//
// Configure via env vars (defaults match a local Supabase-equivalent stack: Postgres+PostgREST):
//   BASE_URL      preview server to test               (default http://127.0.0.1:4317/)
//   PGHOST        psql host for direct DB assertions    (default /tmp, a unix socket dir)
//   PGPORT        psql port                             (default 5544)
//   PGDATABASE    database name                         (default prodverify)
//   PGUSER        psql role                              (default postgres)
//   CHROMIUM_PATH executable used by playwright-core     (default /opt/pw-browsers/chromium)
import { chromium } from 'playwright-core';
import { execSync } from 'node:child_process';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:4317/';
const PGHOST = process.env.PGHOST || '/tmp';
const PGPORT = process.env.PGPORT || '5544';
const PGDATABASE = process.env.PGDATABASE || 'prodverify';
const PGUSER = process.env.PGUSER || 'postgres';
const CHROMIUM_PATH = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';

const q = s => execSync(`psql -h ${PGHOST} -p ${PGPORT} -U ${PGUSER} -tA -q -d ${PGDATABASE} -c "${s}"`).toString().trim();
let pass = 0, fail = 0; const errs = [];
const ck = (n, c, d = "") => { console.log(c ? `  PASS  ${n}` : `  FAIL  ${n}${d ? "  -- " + d : ""}`); c ? pass++ : fail++; };

const b = await chromium.launch({ executablePath: CHROMIUM_PATH, args: ['--no-sandbox'] });
const p = await (await b.newContext()).newPage();
p.on('pageerror', e => errs.push(String(e)));

const login = async (role) => {
  await p.goto(BASE_URL, { waitUntil: 'networkidle' });
  await p.evaluate(r => { localStorage.setItem('showroom_authenticated', 'true'); localStorage.setItem('showroom_role', r); }, role);
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForTimeout(2800);
};

console.log('--- TEST N: non-admin cannot reach Trash ---');
await login('Staff');
const staffNav = p.getByRole('button', { name: /^\s*Trash\s*$/i });
ck('Trash hidden from Staff sidebar', await staffNav.count() === 0);

console.log('--- Admin sees Trash ---');
await login('Admin');
const adminNav = p.getByRole('button', { name: /^\s*Trash\s*$/i });
ck('Trash visible to Admin', await adminNav.count() > 0);

console.log('--- create a customer, then move it to Trash from the UI ---');
await p.getByRole('button', { name: /Customers Ledger/i }).first().click();
await p.waitForTimeout(1200);
await p.getByRole('button', { name: /Add.*(Customer|Client)|New Customer/i }).first().click();
await p.waitForTimeout(900);
const ins = await p.locator('form input[type="text"], form input:not([type])').all();
await ins[0].fill('Trash UI Client');
await ins[1].fill('9600055544');
await p.getByRole('button', { name: /Save|Register|Create|Add/i }).last().click();
await p.waitForTimeout(3000);
ck('customer created in the database', q(`select count(*) from customers where \\"mobileNumber\\"='9600055544'`) === '1');

const delBtn = p.getByRole('button', { name: /Delete/i }).first();
ck('delete control present', await delBtn.count() > 0);
await delBtn.click();
await p.waitForTimeout(900);
const dialog = await p.$eval('body', el => el.innerText);
console.log('--- confirmation wording ---');
ck('dialog says "Move to Trash"', /Move .*to Trash|Move to Trash/i.test(dialog), dialog.slice(0, 160));
ck('dialog says it can be restored', /can be restored|restored from Trash/i.test(dialog));
ck('dialog does NOT say permanently', !/permanently\?|cannot be undone/i.test(dialog));

const confirmBtn = p.getByRole('button', { name: /Move to Trash/i }).last();
await confirmBtn.click();
await p.waitForTimeout(3500);
ck('customer removed from the customers table', q(`select count(*) from customers where \\"mobileNumber\\"='9600055544'`) === '0');
ck('customer is now in the trash table', q(`select count(*) from trash where \\"recordType\\"='customers'`) === '1');
ck('gone from the Customers screen', !/Trash UI Client/i.test(await p.$eval('body', el => el.innerText)));

console.log('--- Trash screen shows it ---');
await p.getByRole('button', { name: /^\s*Trash\s*$/i }).first().click();
await p.waitForTimeout(2500);
let trashTxt = await p.$eval('body', el => el.innerText);
ck('deleted customer listed in Trash', /Trash UI Client/i.test(trashTxt));
ck('shows who deleted it', /Showroom Owner|Hardik|Admin/i.test(trashTxt));
ck('shows retention countdown', /day[s]? left/i.test(trashTxt));
ck('Restore action present', /Restore/i.test(trashTxt));
ck('Delete Permanently action present', /Delete Permanently/i.test(trashTxt));

console.log('--- TEST K: permanent delete demands explicit confirmation ---');
await p.getByRole('button', { name: /Delete Permanently/i }).first().click();
await p.waitForTimeout(900);
const permTxt = await p.$eval('body', el => el.innerText);
ck('strong confirmation shown', /Delete Permanently\?/i.test(permTxt));
ck('warns it cannot be undone', /cannot be undone|cannot be recovered/i.test(permTxt));
ck('still in the bin while unconfirmed', q(`select count(*) from trash`) !== '0');
const keepBtn = p.getByRole('button', { name: /Keep in Trash|Cancel/i }).last();
await keepBtn.click(); await p.waitForTimeout(900);
ck('cancelling leaves the record in Trash', q(`select count(*) from trash where \\"recordType\\"='customers'`) === '1');

console.log('--- restore from the UI ---');
await p.getByRole('button', { name: /^\s*Restore\s*$/i }).first().click();
await p.waitForTimeout(1000);
const restoreDlg = await p.$eval('body', el => el.innerText);
ck('restore confirmation shown', /Restore/i.test(restoreDlg));
await p.getByRole('button', { name: /^\s*Restore\s*$/i }).last().click();
await p.waitForTimeout(4000);
ck('customer restored to the database', q(`select count(*) from customers where \\"mobileNumber\\"='9600055544'`) === '1');
ck('removed from the trash table', q(`select count(*) from trash where \\"recordType\\"='customers'`) === '0');

console.log('--- TEST E: survives a refresh ---');
await p.reload({ waitUntil: 'networkidle' });
await p.waitForTimeout(3000);
await p.getByRole('button', { name: /Customers Ledger/i }).first().click();
await p.waitForTimeout(1500);
ck('restored customer visible after refresh', /Trash UI Client/i.test(await p.$eval('body', el => el.innerText)));
ck('still in the database after refresh', q(`select count(*) from customers where \\"mobileNumber\\"='9600055544'`) === '1');

console.log('--- dashboard unaffected ---');
await p.getByRole('button', { name: /Dashboard Hub/i }).first().click();
await p.waitForTimeout(1500);
const dash = await p.$eval('body', el => el.innerText);
ck('dashboard renders', /Total Customers/i.test(dash));
ck('no Recent Activity regression', !/Recent Activity/i.test(dash));

console.log(`\nUNCAUGHT PAGE ERRORS: ${errs.length}`);
errs.slice(0, 5).forEach(e => console.log('   ', e.slice(0, 200)));
console.log(`\n================ TRASH E2E: ${pass} passed, ${fail} failed ================`);
await b.close();
process.exit(fail > 0 || errs.length > 0 ? 1 : 0);
