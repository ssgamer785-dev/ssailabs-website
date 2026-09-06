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
  var coat = { length: '31.5', chest: '40', stomach: '36', hip: '41', shoulder: '18.5',
               sleeve: '25', xBack: '17.5', collar: '16', jacketLength: '30', waistcoatLength: '25' };
  var pant = { length: '40', waist: '34', hip: '40.5', thigh: '24.5', inLeg: '31', bottom: '15', body: '11' };
  var shirt = { length: '29', chest: '38', stomach: '35', hip: '39', shoulder: '18', sleeve: '24', collar: '15.5', cuff: '9' };
  var kurta = { length: '44', chest: '42', stomach: '40', hip: '43', shoulder: '18', sleeve: '23', bicep: '15', cuff: '10', collar: '16' };
  var pajama = { length: '40', waist: '36', hip: '41', thigh: '25', inLeg: '30', bottom: '14', body: '12' };
  // A uuid is 8-4-4-4-12; the last group must be exactly twelve hex digits, so
  // the discriminator goes inside it rather than being appended and truncated.
  var uuid = function (tag, a, b) {
    return '00000000-0000-4000-8000-' + tag +
      String(a).padStart(b === undefined ? 11 : 5, '0') +
      (b === undefined ? '' : String(b).padStart(6, '0'));
  };
  // One order per garment count the production slip has to paginate for.
  var COUNTS = [1, 2, 3, 5, 8, 14];
  var TYPES = ['Coat', 'Pant', 'Shirt', 'Kurta Pajama'];
  COUNTS.forEach(function (n, idx) {
    var cid = uuid('c', idx);
    var oid = uuid('d', idx);
    var mid = uuid('e', idx);
    var phone = '98100' + String(idx).padStart(5, '0');
    D.customers.push({ id: cid, name: 'Slip Client ' + n, phone: phone,
      phone_normalized: phone, city: 'Jalandhar', address: 'Bootan Mandi',
      email: null, deleted_at: null, created_at: new Date().toISOString() });
    D.orders.push({ id: oid, customer_id: cid, order_number: 100 + n, status: 'New',
      production_status: 'New', production_notes: '', customer_name: 'Slip Client ' + n,
      customer_phone: phone, customer_address: 'Bootan Mandi, Jalandhar',
      order_date: '2026-09-01', delivery_date: '2026-09-25', deleted_at: null,
      subtotal: 0, discount: 0, tax_amount: 0, total_amount: 0, advance_paid: 0, balance_due: 0,
      measurements_snapshot: { unit: 'inches', coat: coat, pant: pant, shirt: shirt, kurta: kurta, pajama: pajama } });
    for (var i = 0; i < n; i++) {
      D.order_items.push({ id: uuid('f', idx, i),
        order_id: oid, position: i + 1, garment_type: TYPES[i % TYPES.length], quantity: 2, price: 0 });
    }
    D.measurements.push({ id: mid, customer_id: cid, unit: 'inches', deleted_at: null, last_updated: '2026-09-01' });
    D.measurement_values.push({ id: uuid('a', idx),
      measurement_id: mid, garment_category: 'coat', data: coat });
  });
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
