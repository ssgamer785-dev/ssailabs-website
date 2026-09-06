/**
 * TEST ONLY. Prepares dist-e2e for the printing check by adding the browser
 * suites' in-page PostgREST as an ordinary script file and seeding one order.
 *
 * A script file rather than an injected preload, because the desktop window
 * sets `script-src 'self'` with no `unsafe-eval` — the same policy the showroom
 * runs under. A harness that needed the policy relaxed would be testing a
 * different application.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist-e2e');
const shim = fs.readFileSync(path.join(ROOT, 'e2e', 'fake-postgrest.js'), 'utf8');

const seed = `
localStorage.setItem('regency-tailors-auth', JSON.stringify({
  access_token: 't', token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 't',
  user: { id: '00000000-0000-4000-8000-0000000000ff', email: 'owner@example.com',
    aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {},
    created_at: new Date().toISOString() }
}));
(function seed() {
  var D = window.__PGREST.db;
  var cid = '00000000-0000-4000-8000-0000000000c1';
  var oid = '00000000-0000-4000-8000-0000000000d1';
  var coat = { length: '31.5', chest: '40', stomach: '36', hip: '41', shoulder: '18.5',
               sleeve: '25', xBack: '17.5', collar: '16', jacketLength: '30', waistcoatLength: '25' };
  var pant = { length: '40', waist: '34', hip: '40.5', thigh: '24.5', inLeg: '31', bottom: '15', body: '11' };
  D.customers.push({ id: cid, name: 'Print Check Client', phone: '9812345678',
    phone_normalized: '9812345678', city: 'Jalandhar', address: 'Bootan Mandi',
    email: null, deleted_at: null, created_at: new Date().toISOString() });
  D.orders.push({ id: oid, customer_id: cid, order_number: 21, status: 'New',
    production_status: 'New', production_notes: '', customer_name: 'Print Check Client',
    customer_phone: '9812345678', customer_address: 'Bootan Mandi, Jalandhar',
    order_date: '2026-09-01', delivery_date: '2026-09-25', deleted_at: null,
    subtotal: 0, discount: 0, tax_amount: 0, total_amount: 0, advance_paid: 0, balance_due: 0,
    measurements_snapshot: { unit: 'inches', coat: coat, pant: pant } });
  D.order_items.push(
    { id: '00000000-0000-4000-8000-0000000000f1', order_id: oid, position: 1, garment_type: 'Coat', quantity: 4, price: 0 },
    { id: '00000000-0000-4000-8000-0000000000f2', order_id: oid, position: 2, garment_type: 'Pant', quantity: 4, price: 0 });
})();
`;

fs.writeFileSync(path.join(DIST, 'test-harness.js'), shim + '\n' + seed);

const indexPath = path.join(DIST, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');
if (!html.includes('test-harness.js')) {
  // First in <head>, so the shim replaces fetch before the bundle constructs
  // its Supabase client.
  html = html.replace('<head>', '<head>\n    <script src="/test-harness.js"></script>');
  fs.writeFileSync(indexPath, html);
}
console.log('dist-e2e prepared for the printing check');
