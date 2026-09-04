import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FakeSupabase } from './fakeSupabase';
import { Customer, MeasurementRecord, Order } from '../../types';

/**
 * Regression cover for the production failure seen on the first real Supabase
 * order:
 *
 *   Could not create the order: invalid input syntax for type uuid:
 *   "CUST-MTMUP4YW-2286"
 *
 * The New Order wizard builds its customer the moment the counter hand finishes
 * typing, with a provisional `CUST-...` id, because no row exists yet. That id
 * was reaching `orders.customer_id`, which is a uuid column.
 *
 * These tests run the real repository against a fake PostgREST client that
 * enforces the same uuid, foreign-key and unique-phone constraints as the
 * schema, so a regression fails here with the same message it failed with in
 * production rather than passing quietly.
 */

let db: FakeSupabase;

vi.mock('../../lib/supabase', () => ({
  requireSupabase: () => db,
  isSupabaseConfigured: true,
  usesSupabase: true,
  persistenceMode: 'supabase',
  supabase: null
}));

// Imported after the mock so the repository picks up the fake client.
const repo = await import('../supabaseRepository');
const { orderToWizardRow, isUuid, normalizePhone, assertCustomerUuid } = await import('../mappers');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The exact id shape the wizard mints: OrderModal.tsx builds it from Date.now(). */
const CLIENT_ID = 'CUST-MTMUP4YW-2286';

const anOrder = (overrides: Partial<Order> = {}): Order => ({
  id: '1',
  orderNumber: '1',
  customerId: CLIENT_ID,
  customerName: 'Rahul Sharma',
  customerPhone: '98765 43210',
  customerEmail: '',
  customerAddress: 'Model Town, Jalandhar',
  items: [
    { id: 'ITEM-1', garmentType: 'Coat', price: 0, quantity: 1 } as Order['items'][number],
    { id: 'ITEM-2', garmentType: 'Pant', price: 0, quantity: 1 } as Order['items'][number]
  ],
  orderDate: '2026-09-04',
  trialDate: '',
  deliveryDate: '2026-09-13',
  status: 'New',
  totalAmount: 0,
  advancePaid: 0,
  balanceDue: 0,
  urgent: false,
  ...overrides
});

const aMeasurement = (overrides: Partial<MeasurementRecord> = {}): MeasurementRecord => ({
  id: '',
  customerId: CLIENT_ID,
  customerName: 'Rahul Sharma',
  customerPhone: '98765 43210',
  garmentType: 'Coat',
  unit: 'inches',
  lastUpdated: '2026-09-04',
  coat: { chest: '40' } as MeasurementRecord['coat'],
  ...overrides
});

const aCustomer = (overrides: Partial<Customer> = {}): Customer => ({
  id: CLIENT_ID,
  name: 'Rahul Sharma',
  phone: '98765 43210',
  email: '',
  address: 'Model Town',
  city: 'Jalandhar',
  totalOrders: 0,
  lifetimeSpend: 0,
  createdDate: '2026-09-04',
  lastVisitDate: '2026-09-04',
  ...overrides
});

beforeEach(() => {
  db = new FakeSupabase();
});

/* ------------------------------------------------------------------------ */

describe('the harness reproduces the production failure', () => {
  // If this stops failing, every test below is worthless: it would mean the
  // fake accepts ids Postgres rejects.
  it('rejects a CUST- id written straight into orders.customer_id', async () => {
    db.seedCustomer({ name: 'Rahul Sharma', phone: '9876543210' });
    const { error } = await db.from('orders').insert({
      customer_id: CLIENT_ID,
      customer_name: 'Rahul Sharma',
      customer_phone: '9876543210',
      delivery_date: '2026-09-13'
    });
    expect(error?.message).toBe('invalid input syntax for type uuid: "CUST-MTMUP4YW-2286"');
    expect(error?.code).toBe('22P02');
  });
});

describe('saveOrder resolves the customer to a real uuid', () => {
  it('sends the database uuid, never the CUST- client id', async () => {
    const seeded = db.seedCustomer({ name: 'Rahul Sharma', phone: '9876543210' });

    const saved = await repo.saveOrder(anOrder());

    const stored = db.tables.orders[0];
    expect(stored.customer_id).toBe(seeded.id);
    expect(stored.customer_id).toMatch(UUID_RE);
    expect(stored.customer_id).not.toBe(CLIENT_ID);
    expect(saved.customerId).toBe(seeded.id);
  });

  it('never lets a CUST- string reach any insert payload', async () => {
    db.seedCustomer({ name: 'Rahul Sharma', phone: '9876543210' });
    await repo.saveOrder(anOrder());

    const everythingSent = JSON.stringify(db.writes);
    expect(everythingSent).not.toContain('CUST-');
  });

  it('creates the customer when the phone number is new, and links to it', async () => {
    expect(db.tables.customers).toHaveLength(0);

    await repo.saveOrder(anOrder({ customerPhone: '90000 11111' }));

    expect(db.tables.customers).toHaveLength(1);
    const created = db.tables.customers[0];
    expect(created.name).toBe('Rahul Sharma');
    expect(created.phone_normalized).toBe('9000011111');
    expect(db.tables.orders[0].customer_id).toBe(created.id);
  });

  it('links a walk-in to the existing ledger rather than opening a second one', async () => {
    // The number is already on file; the wizard just did not know the uuid.
    const seeded = db.seedCustomer({ name: 'Rahul Sharma', phone: '+91 98765 43210' });

    await repo.saveOrder(anOrder({ customerPhone: '098765 43210' }));

    expect(db.tables.customers).toHaveLength(1);
    expect(db.tables.orders[0].customer_id).toBe(seeded.id);
  });

  it('uses a real uuid unchanged, without touching the customers table', async () => {
    const seeded = db.seedCustomer({ name: 'Rahul Sharma', phone: '9876543210' });

    await repo.saveOrder(anOrder({ customerId: String(seeded.id) }));

    expect(db.tables.orders[0].customer_id).toBe(seeded.id);
    expect(db.writes.some(w => w.table === 'customers')).toBe(false);
  });

  it('refuses the write, clearly, when there is no id and no phone to match on', async () => {
    await expect(repo.saveOrder(anOrder({ customerPhone: '' }))).rejects.toThrow(
      /not linked to a database record and has no phone number/i
    );
    expect(db.tables.orders).toHaveLength(0);
    expect(db.tables.customers).toHaveLength(0);
  });

  it('recovers when another device inserts the same customer first', async () => {
    // The partial unique index rejects our insert; the row it protected is the
    // one we wanted, so the order still lands on the right customer.
    db.raceNextCustomerInsert = true;

    await repo.saveOrder(anOrder());

    expect(db.tables.customers).toHaveLength(1);
    expect(db.tables.orders[0].customer_id).toBe(db.tables.customers[0].id);
  });

  it('carries an edit through on the order it already has', async () => {
    const seeded = db.seedCustomer({ name: 'Rahul Sharma', phone: '9876543210' });
    const first = await repo.saveOrder(anOrder());

    const edited = await repo.saveOrder({
      ...anOrder({ customerId: String(seeded.id) }),
      dbId: first.dbId,
      deliveryDate: '2026-09-20'
    });

    expect(db.tables.orders).toHaveLength(1);
    expect(edited.deliveryDate).toBe('2026-09-20');
    expect(db.tables.orders[0].customer_id).toBe(seeded.id);
  });
});

describe('saveMeasurement resolves the customer the same way', () => {
  it('sends the database uuid for a CUST- client id', async () => {
    const seeded = db.seedCustomer({ name: 'Rahul Sharma', phone: '9876543210' });

    await repo.saveMeasurement(aMeasurement());

    expect(db.tables.measurements).toHaveLength(1);
    expect(db.tables.measurements[0].customer_id).toBe(seeded.id);
    expect(db.tables.measurements[0].customer_id).toMatch(UUID_RE);
  });

  it('creates the customer when the measurement modal invented one inline', async () => {
    await repo.saveMeasurement(aMeasurement({ customerId: 'CUST-742', customerPhone: '9000011111' }));

    expect(db.tables.customers).toHaveLength(1);
    expect(db.tables.measurements[0].customer_id).toBe(db.tables.customers[0].id);
  });
});

describe('saveCustomer tells a stored row from a client id by shape', () => {
  it('updates in place when given a real uuid', async () => {
    const seeded = db.seedCustomer({ name: 'Old Name', phone: '9876543210' });

    const saved = await repo.saveCustomer(aCustomer({ id: String(seeded.id), name: 'New Name' }));

    expect(db.tables.customers).toHaveLength(1);
    expect(saved.id).toBe(seeded.id);
    expect(db.tables.customers[0].name).toBe('New Name');
  });

  it('matches a CUST- id by phone instead of by id', async () => {
    const seeded = db.seedCustomer({ name: 'Rahul Sharma', phone: '9876543210' });

    const saved = await repo.saveCustomer(aCustomer({ city: 'Ludhiana' }));

    expect(db.tables.customers).toHaveLength(1);
    expect(saved.id).toBe(seeded.id);
    expect(db.tables.customers[0].city).toBe('Ludhiana');
  });

  it('handles a legacy RESTORED-CUST- id, which the old prefix test let through', async () => {
    // `RESTORED-CUST-1` does not start with `CUST-`, so the previous
    // `startsWith('CUST-')` check treated it as a uuid and sent it to
    // `.eq('id', ...)`. Matching on shape rather than on a prefix fixes it.
    const seeded = db.seedCustomer({ name: 'Rahul Sharma', phone: '9876543210' });

    const saved = await repo.saveCustomer(aCustomer({ id: 'RESTORED-CUST-1' }));

    expect(saved.id).toBe(seeded.id);
    expect(db.tables.customers).toHaveLength(1);
  });

  it('creates a genuinely new customer and issues a uuid', async () => {
    const saved = await repo.saveCustomer(aCustomer({ phone: '9000011111' }));

    expect(saved.id).toMatch(UUID_RE);
    expect(db.tables.customers).toHaveLength(1);
  });
});

describe('end to end: customer -> reload -> select -> order -> reload', () => {
  it('keeps the order linked to the customer across both reloads', async () => {
    // 1. Create the customer, as the Customers screen does — with a client id.
    const created = await repo.saveCustomer(aCustomer());
    expect(created.id).toMatch(UUID_RE);

    // 2. Reload. This is what the app holds in React state afterwards.
    const afterCustomer = await repo.loadDataset('owner@example.com');
    expect(afterCustomer.customers).toHaveLength(1);

    // 3. Find/select the customer the way the order wizard does.
    const selected = afterCustomer.customers.find(c => normalizePhone(c.phone) === '9876543210');
    expect(selected).toBeDefined();
    expect(selected!.id).toBe(created.id);

    // 4. Place the order against the selected customer.
    const savedOrder = await repo.saveOrder(anOrder({ customerId: selected!.id }));
    expect(savedOrder.customerId).toBe(created.id);
    expect(savedOrder.items.map(i => i.garmentType)).toEqual(['Coat', 'Pant']);

    // 5. Reload again — the link survives a round trip through the database.
    const afterOrder = await repo.loadDataset('owner@example.com');
    expect(afterOrder.orders).toHaveLength(1);
    expect(afterOrder.orders[0].customerId).toBe(created.id);
    expect(afterOrder.customers[0].id).toBe(created.id);
    expect(afterOrder.orders[0].items).toHaveLength(2);

    // And exactly one customer exists: no duplicate ledger was opened.
    expect(db.tables.customers).toHaveLength(1);
  });

  it('works the same for a walk-in the wizard created inline', async () => {
    // No prior customer: the wizard hands over a CUST- id and nothing else.
    const savedOrder = await repo.saveOrder(anOrder());
    expect(savedOrder.customerId).toMatch(UUID_RE);

    const reloaded = await repo.loadDataset('owner@example.com');
    expect(reloaded.customers).toHaveLength(1);
    expect(reloaded.orders).toHaveLength(1);
    expect(reloaded.orders[0].customerId).toBe(reloaded.customers[0].id);

    // A second order for the same walk-in reuses that customer.
    await repo.saveOrder(anOrder({ id: '2', orderNumber: '2' }));
    const again = await repo.loadDataset('owner@example.com');
    expect(again.customers).toHaveLength(1);
    expect(again.orders).toHaveLength(2);
    expect(new Set(again.orders.map(o => o.customerId)).size).toBe(1);
  });
});

describe('the mapper cannot pass a client id through', () => {
  it('writes the customerId it is given, not the one on the order', () => {
    const uuid = '11111111-2222-4333-8444-555555555555';
    const row = orderToWizardRow(anOrder(), uuid);
    expect(row.customer_id).toBe(uuid);
  });
});

describe('the shared identity helpers', () => {
  it('accepts uuids and rejects every client id shape', () => {
    expect(isUuid('11111111-2222-4333-8444-555555555555')).toBe(true);
    expect(isUuid('11111111-2222-4333-8444-555555555555'.toUpperCase())).toBe(true);
    expect(isUuid(CLIENT_ID)).toBe(false);
    expect(isUuid('CUST-742')).toBe(false);
    expect(isUuid('RESTORED-CUST-1')).toBe(false);
    expect(isUuid('MEAS-1234')).toBe(false);
    expect(isUuid('')).toBe(false);
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid(null)).toBe(false);
    expect(isUuid('11111111-2222-4333-8444-5555555555')).toBe(false); // too short
  });

  it('normalises a phone number exactly as the generated column does', () => {
    // right(regexp_replace(phone, '[^0-9]', '', 'g'), 10)
    expect(normalizePhone('98765 43210')).toBe('9876543210');
    expect(normalizePhone('+91 98765-43210')).toBe('9876543210');
    expect(normalizePhone('098765 43210')).toBe('9876543210');
    expect(normalizePhone('(98765) 43210')).toBe('9876543210');
    expect(normalizePhone('')).toBe('');
    expect(normalizePhone(undefined)).toBe('');
    expect(normalizePhone(null)).toBe('');
  });
});

/* --------------------------------------------------------------------- */

/**
 * The id from the second live report, verbatim. The wizard mints these from
 * `Date.now().toString(36)`, so the shape matters more than the digits — but
 * pinning the exact value the showroom saw makes a regression unmistakable.
 */
const LIVE_REPORT_ID = 'CUST-MTNC6JR3-5964';

describe('the reported failure: order #6, "gab hru", 9814318809', () => {
  const gabHru = (overrides: Partial<Order> = {}): Order =>
    anOrder({
      id: '6',
      orderNumber: '6',
      customerId: LIVE_REPORT_ID,
      customerName: 'gab hru',
      customerPhone: '9814318809',
      customerAddress: '',
      ...overrides
    });

  it('places the order and never sends the provisional id', async () => {
    const saved = await repo.saveOrder(gabHru());

    const stored = db.tables.orders[0];
    expect(stored.customer_id).toMatch(UUID_RE);
    expect(stored.customer_id).not.toBe(LIVE_REPORT_ID);
    expect(saved.orderNumber).toBeTruthy();
    expect(JSON.stringify(db.writes)).not.toContain('CUST-');
  });

  it('creates the customer, then links the order to that row', async () => {
    await repo.saveOrder(gabHru());

    expect(db.tables.customers).toHaveLength(1);
    const created = db.tables.customers[0];
    expect(created.name).toBe('gab hru');
    expect(created.phone_normalized).toBe('9814318809');
    expect(db.tables.orders[0].customer_id).toBe(created.id);
  });

  it('links the measurement to the same row', async () => {
    await repo.saveOrder(gabHru());
    await repo.saveMeasurement(
      aMeasurement({ customerId: LIVE_REPORT_ID, customerName: 'gab hru', customerPhone: '9814318809' })
    );

    expect(db.tables.customers).toHaveLength(1);
    expect(db.tables.measurements[0].customer_id).toBe(db.tables.customers[0].id);
    expect(db.tables.measurements[0].customer_id).toBe(db.tables.orders[0].customer_id);
  });

  it('a second order on the same number reuses the customer', async () => {
    await repo.saveOrder(gabHru());
    await repo.saveOrder(gabHru({ id: '7', orderNumber: '7' }));

    expect(db.tables.customers).toHaveLength(1);
    expect(new Set(db.tables.orders.map(o => o.customer_id)).size).toBe(1);
  });
});

describe('the hard invariant at the write boundary', () => {
  it('the mapper refuses a provisional id outright', () => {
    expect(() => orderToWizardRow(anOrder(), LIVE_REPORT_ID))
      .toThrow(/not linked to a database record/i);
  });

  it('it refuses every other shape that is not a uuid', () => {
    for (const bad of [LIVE_REPORT_ID, 'CUST-742', 'RESTORED-CUST-1', 'MEAS-1234', '', '   ', 'undefined', 'null']) {
      expect(() => assertCustomerUuid(bad, 'ctx'), `accepted "${bad}"`).toThrow();
    }
    expect(() => assertCustomerUuid(undefined, 'ctx')).toThrow(/nothing/);
    expect(() => assertCustomerUuid(null, 'ctx')).toThrow(/nothing/);
    expect(() => assertCustomerUuid('', 'ctx')).toThrow(/an empty value/);
  });

  it('it lets a real uuid through unchanged', () => {
    const id = '11111111-2222-4333-8444-555555555555';
    expect(assertCustomerUuid(id, 'ctx')).toBe(id);
    expect(orderToWizardRow(anOrder(), id).customer_id).toBe(id);
  });

  it('the refusal happens in the app, before any request is sent', () => {
    // The mapper is pure: throwing here means nothing reached the network.
    expect(() => orderToWizardRow(anOrder(), LIVE_REPORT_ID)).toThrow();
    expect(db.writes).toHaveLength(0);
  });

  it('a measurement cannot be written with a provisional id either', async () => {
    // No phone to resolve by, so there is no legitimate way to a uuid.
    await expect(
      repo.saveMeasurement(aMeasurement({ customerId: LIVE_REPORT_ID, customerPhone: '' }))
    ).rejects.toThrow(/no phone number to match on/i);
    expect(db.tables.measurements).toHaveLength(0);
    expect(db.tables.customers).toHaveLength(0);
  });
});
