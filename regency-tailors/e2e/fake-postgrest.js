/**
 * An in-page PostgREST that enforces the real schema's uuid columns.
 *
 * Installed before the app boots, so the actual New Order wizard talks to it
 * exactly as it talks to Supabase. A uuid column that receives anything but a
 * uuid answers with Postgres's own 22P02 error, which is what turns the
 * reported failure into something a browser test can reproduce.
 */
(() => {
  const HOST = 'https://fake-project.supabase.co';
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const UUID_COLS = {
    customers: ['id'],
    orders: ['id', 'customer_id'],
    order_items: ['id', 'order_id'],
    order_payments: ['id', 'order_id'],
    measurements: ['id', 'customer_id'],
    measurement_values: ['id', 'measurement_id']
  };

  let seed = 0;
  const uuid = () => {
    seed += 1;
    return `00000000-0000-4000-8000-${String(seed).padStart(12, '0')}`;
  };
  const norm = p => String(p ?? '').replace(/\D/g, '').slice(-10);

  // A reload normally wipes this in-page database, which is fine for tests that
  // never reload. A test that has to prove data survives a hard refresh needs
  // the rows to outlive the page, so it sets `__PGREST_PERSIST` before this
  // script runs and the tables are mirrored into sessionStorage.
  const PERSIST = Boolean(window.__PGREST_PERSIST);
  const SAVE_KEY = '__PGREST_STATE__';

  const db = {
    customers: [], orders: [], order_items: [], order_payments: [],
    measurements: [], measurement_values: [], fittings: [], workers: [],
    invoices: [], expenses: [], trash_items: [],
    showroom_settings: [{ id: true, name: 'REGENCY TAILOR', subtitle: 'Bespoke Showroom & Tailoring Suite',
      city: 'Jalandhar', address_line1: 'BOOTAN MANDI', address_line2: 'JALANDHAR, PUNJAB 144003',
      phone: '99887 71631', email: null, gstin: null }],
    staff_profiles: [{ email: 'owner@example.com', full_name: 'Showroom Owner', is_active: true }]
  };
  let orderSeq = 0;

  if (PERSIST) {
    try {
      const saved = JSON.parse(sessionStorage.getItem(SAVE_KEY) || 'null');
      if (saved) {
        Object.assign(db, saved.db);
        seed = saved.seed || 0;
        orderSeq = saved.orderSeq || 0;
      }
    } catch { /* start empty */ }
  }
  const persist = () => {
    if (!PERSIST) return;
    try { sessionStorage.setItem(SAVE_KEY, JSON.stringify({ db, seed, orderSeq })); } catch { /* ignore */ }
  };

  // Everything the fake was asked to write, for the test to inspect.
  window.__PGREST = { db, writes: [], errors: [], persist };

  const err = (code, message, status = 400) =>
    new Response(JSON.stringify({ message, code, details: null, hint: null }),
      { status, headers: { 'Content-Type': 'application/json' } });

  const ok = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  const checkUuids = (table, row) => {
    for (const col of UUID_COLS[table] || []) {
      const v = row[col];
      if (v === undefined || v === null) continue;
      if (!UUID_RE.test(String(v))) {
        const message = `invalid input syntax for type uuid: "${String(v)}"`;
        window.__PGREST.errors.push({ table, col, value: String(v), message });
        return message;
      }
    }
    return null;
  };

  /** `?a=eq.1&b=is.null` -> predicates. */
  const predicates = params => {
    const out = [];
    for (const [k, raw] of params.entries()) {
      if (['select', 'order', 'limit', 'offset', 'on_conflict'].includes(k)) continue;
      const [op, ...rest] = String(raw).split('.');
      const val = rest.join('.');
      if (op === 'eq') out.push(r => String(r[k]) === val);
      else if (op === 'is') out.push(r => (val === 'null' ? r[k] === null || r[k] === undefined : true));
      else if (op === 'not') out.push(r => !(r[k] === null || r[k] === undefined));
    }
    return out;
  };

  const project = (table, rows, select) => rows.map(r => {
    const o = { ...r };
    if (table === 'customers_with_stats') {
      const mine = db.orders.filter(x => x.customer_id === r.id && !x.deleted_at);
      o.total_orders = mine.length;
      o.lifetime_spend = mine.reduce((s, x) => s + Number(x.total_amount || 0), 0);
      o.last_visit_date = mine.length ? mine[mine.length - 1].order_date : r.created_at;
    }
    if (select && select.includes('order_items(')) o.order_items = db.order_items.filter(i => i.order_id === r.id);
    if (select && select.includes('order_payments(')) o.order_payments = db.order_payments.filter(p => p.order_id === r.id);
    if (select && select.includes('measurement_values(')) o.measurement_values = db.measurement_values.filter(v => v.measurement_id === r.id);
    return o;
  });

  /** `trash_items` is a view over every soft-deleted row, exactly as the
   *  migration defines it, so the Trash screen and Restore work against the
   *  same shape they see in production. */
  const trashRows = () => [
    ...db.customers.filter(r => r.deleted_at).map(r => ({
      id: 'TRASH-CUSTOMER-' + r.id, item_type: 'Customer',
      title: `Client Profile: ${r.name} (${r.phone})`,
      entity_id: r.id, deleted_at: r.deleted_at, deleted_by: r.deleted_by || null })),
    ...db.orders.filter(r => r.deleted_at).map(r => ({
      id: 'TRASH-ORDER-' + r.id, item_type: 'Order',
      title: `Bespoke Order ${r.order_number} (${r.customer_name})`,
      entity_id: r.id, deleted_at: r.deleted_at, deleted_by: r.deleted_by || null })),
    ...db.measurements.filter(r => r.deleted_at).map(r => ({
      id: 'TRASH-MEASUREMENT-' + r.id, item_type: 'Measurement',
      title: `Measurement Spec: ${(db.customers.find(c => c.id === r.customer_id) || {}).name || 'Unknown Client'}`,
      entity_id: r.id, deleted_at: r.deleted_at, deleted_by: r.deleted_by || null })),
    ...db.workers.filter(r => r.deleted_at).map(r => ({
      id: 'TRASH-WORKER-' + r.id, item_type: 'Worker', title: `Artisan: ${r.name}`,
      entity_id: r.id, deleted_at: r.deleted_at, deleted_by: r.deleted_by || null }))
  ];

  const rowsOf = t =>
    t === 'customers_with_stats' ? db.customers :
    t === 'trash_items' ? trashRows() :
    (db[t] || []);

  const defaults = (table, row) => {
    const r = { id: uuid(), deleted_at: null, ...row };
    if (table === 'customers') {
      r.phone_normalized = norm(r.phone);
      r.created_at = r.created_at || new Date().toISOString();
    }
    if (table === 'orders') {
      orderSeq += 1;
      r.order_number = orderSeq;
      r.status = r.status || 'New';
      r.production_status = r.production_status || 'New';
      r.subtotal = r.subtotal ?? 0; r.discount = r.discount ?? 0; r.tax_amount = r.tax_amount ?? 0;
      r.total_amount = r.total_amount ?? 0; r.advance_paid = r.advance_paid ?? 0; r.balance_due = r.balance_due ?? 0;
    }
    return r;
  };

  const realFetch = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : (input.url || String(input));
    if (!url.startsWith(HOST)) return realFetch(input, init);

    const u = new URL(url);
    const method = ((init.method || (input && input.method) || 'GET')).toUpperCase();
    const headers = new Headers(init.headers || (input && input.headers) || {});
    const single = (headers.get('Accept') || '').includes('vnd.pgrst.object');
    const body = init.body ? JSON.parse(init.body) : null;

    if (u.pathname.startsWith('/auth/v1/')) return ok({});

    const table = u.pathname.replace('/rest/v1/', '');
    const select = u.searchParams.get('select') || '*';
    const preds = predicates(u.searchParams);
    const match = () => rowsOf(table).filter(r => preds.every(f => f(r)));

    if (method === 'GET') {
      const rows = project(table, match(), select);
      if (single) return ok(rows.length === 1 ? rows[0] : null);
      return ok(rows);
    }

    if (method === 'POST') {
      const list = Array.isArray(body) ? body : [body];
      const made = [];
      for (const raw of list) {
        const row = defaults(table, raw);
        const bad = checkUuids(table, row);
        if (bad) return err('22P02', bad);
        if (table === 'customers' &&
            db.customers.some(c => !c.deleted_at && c.phone_normalized === row.phone_normalized)) {
          return err('23505', 'duplicate key value violates unique constraint "customers_phone_unique_live"', 409);
        }
        // measurements.customer_id is `unique` in the schema, and order_items
        // is `unique (order_id, position)`. Both matter to this fake because a
        // double submission is exactly what they are there to stop.
        if (table === 'measurements' &&
            db.measurements.some(m => m.customer_id === row.customer_id)) {
          return err('23505', 'duplicate key value violates unique constraint "measurements_customer_id_key"', 409);
        }
        if (table === 'order_items' &&
            db.order_items.some(i => i.order_id === row.order_id && i.position === row.position)) {
          return err('23505', 'duplicate key value violates unique constraint "order_items_order_id_position_key"', 409);
        }
        const fk = { orders: ['customer_id', 'customers'], measurements: ['customer_id', 'customers'],
                     order_items: ['order_id', 'orders'] }[table];
        if (fk && row[fk[0]] && !db[fk[1]].some(p => p.id === row[fk[0]])) {
          return err('23503', `insert or update on table "${table}" violates foreign key constraint`, 409);
        }
        db[table].push(row);
        made.push(row);
      }
      window.__PGREST.writes.push({ table, method, body: list });
      persist();
      const rows = project(table, made, select);
      return ok(single ? rows[0] : rows, 201);
    }

    if (method === 'PATCH') {
      const targets = match();
      for (const r of targets) {
        const next = { ...r, ...body };
        if (table === 'customers') next.phone_normalized = norm(next.phone);
        const bad = checkUuids(table, next);
        if (bad) return err('22P02', bad);
        Object.assign(r, next);
      }
      window.__PGREST.writes.push({ table, method, body });
      persist();
      const rows = project(table, targets, select);
      return ok(single ? (rows[0] ?? null) : rows);
    }

    if (method === 'DELETE') {
      const doomed = new Set(match());
      db[table] = db[table].filter(r => !doomed.has(r));
      window.__PGREST.writes.push({ table, method, count: doomed.size });
      persist();
      return ok([]);
    }

    return ok([]);
  };
})();
