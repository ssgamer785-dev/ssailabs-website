import { describe, it, expect } from 'vitest';
import { convertLegacyDataset, newId, LegacyDataset } from '../legacyImport';
import { Customer, Order, MeasurementRecord } from '../../types';

const customer = (over: Partial<Customer> = {}): Customer => ({
  id: 'CUST-1',
  name: 'Arjun Mehta',
  phone: '9876543210',
  email: '',
  address: 'Model Town',
  city: 'Jalandhar',
  totalOrders: 1,
  lifetimeSpend: 18000,
  lastVisitDate: '2026-08-20',
  createdDate: '2026-08-01',
  ...over
});

const order = (over: Partial<Order> = {}): Order =>
  ({
    id: '1',
    orderNumber: '1',
    customerId: 'CUST-1',
    customerName: 'Arjun Mehta',
    customerPhone: '9876543210',
    items: [
      { id: 'ITEM-1', garmentType: 'Full Coat Pant', fabricCode: '', fabricName: '', notes: '', price: 12000, quantity: 1, remarks: 'Peak lapel' },
      { id: 'ITEM-2', garmentType: 'Shirt', fabricCode: '', fabricName: '', notes: '', price: 3000, quantity: 2, remarks: 'French cuff' }
    ],
    orderDate: '2026-08-20',
    trialDate: '',
    deliveryDate: '2026-09-01',
    status: 'Master Stitching',
    productionStatus: 'In Production',
    totalAmount: 18000,
    advancePaid: 8000,
    balanceDue: 10000,
    urgent: false,
    measurementsSnapshot: { unit: 'inches', coat: { chest: '41' } },
    paymentHistory: [{ id: 'PAY-1', date: '2026-08-20', amount: 8000, method: 'Cash' }],
    ...over
  }) as Order;

const measurement = (over: Partial<MeasurementRecord> = {}): MeasurementRecord => ({
  id: 'MEAS-1',
  customerId: 'CUST-1',
  customerName: 'Arjun Mehta',
  customerPhone: '9876543210',
  garmentType: 'Full Coat Pant, Shirt',
  unit: 'inches',
  coat: { chest: '41', length: '30.5' },
  pant: { waist: '34' },
  shirt: { chest: '40' },
  lastUpdated: '2026-08-20',
  ...over
});

const dataset = (over: Partial<LegacyDataset> = {}): LegacyDataset => ({
  customers: [customer()],
  orders: [order()],
  measurements: [measurement()],
  ...over
});

describe('newId', () => {
  it('produces distinct v4 identifiers', () => {
    const ids = new Set(Array.from({ length: 200 }, newId));
    expect(ids.size).toBe(200);
    expect([...ids][0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('convertLegacyDataset', () => {
  it('carries every record across', () => {
    const { payload, stats } = convertLegacyDataset(dataset());
    expect(stats).toMatchObject({ customers: 1, orders: 1, garments: 2, measurements: 1 });
    expect(payload.customers[0].name).toBe('Arjun Mehta');
    expect(payload.orders[0].order_number).toBe(1);
  });

  it('links orders to the customer by the new database id', () => {
    const { payload } = convertLegacyDataset(dataset());
    expect(payload.orders[0].customer_id).toBe(payload.customers[0].id);
  });

  it('preserves per-garment remarks and slip positions', () => {
    const { payload } = convertLegacyDataset(dataset());
    expect(payload.order_items.map(i => i.remarks)).toEqual(['Peak lapel', 'French cuff']);
    expect(payload.order_items.map(i => i.position)).toEqual([1, 2]);
  });

  it('keeps the immutable per-order measurement snapshot', () => {
    const { payload } = convertLegacyDataset(dataset());
    expect((payload.orders[0].measurements_snapshot as any).coat.chest).toBe('41');
  });

  it('splits the measurement ledger into per-garment rows', () => {
    const { payload } = convertLegacyDataset(dataset());
    const categories = payload.measurement_values.map(v => v.garment_category).sort();
    expect(categories).toEqual(['coat', 'pant', 'shirt']);
    expect(payload.measurement_values.find(v => v.garment_category === 'coat')).toMatchObject({
      data: { chest: '41', length: '30.5' }
    });
  });

  it('turns the embedded payment history into payment rows', () => {
    const { payload } = convertLegacyDataset(dataset());
    expect(payload.order_payments).toHaveLength(1);
    expect(payload.order_payments[0]).toMatchObject({ amount: 8000, method: 'Cash' });
  });

  it('does not lose an advance that has no payment history', () => {
    const { payload } = convertLegacyDataset(
      dataset({ orders: [order({ paymentHistory: [], advancePaid: 5000 })] })
    );
    expect(payload.order_payments).toHaveLength(1);
    expect(payload.order_payments[0].amount).toBe(5000);
  });

  it('folds duplicate customers sharing a phone number into one record', () => {
    const { payload, skipped } = convertLegacyDataset(
      dataset({
        customers: [
          customer({ id: 'CUST-1' }),
          customer({ id: 'CUST-2', phone: '+91 98765 43210' })
        ],
        orders: [order({ customerId: 'CUST-1' }), order({ id: '2', orderNumber: '2', customerId: 'CUST-2' })]
      })
    );
    expect(payload.customers).toHaveLength(1);
    expect(new Set(payload.orders.map(o => o.customer_id)).size).toBe(1);
    expect(skipped.join(' ')).toMatch(/merged/i);
  });

  it('re-issues duplicate order numbers instead of losing an order', () => {
    const { payload, skipped } = convertLegacyDataset(
      dataset({ orders: [order({ id: '1' }), order({ id: '1', orderNumber: '1' })] })
    );
    const numbers = payload.orders.map(o => o.order_number);
    expect(payload.orders).toHaveLength(2);
    expect(new Set(numbers).size).toBe(2);
    expect(skipped.join(' ')).toMatch(/re-issued/i);
  });

  it('continues the order sequence above every migrated number', () => {
    const { payload } = convertLegacyDataset(
      dataset({ orders: [order({ id: '17', orderNumber: '17' })], orderSequence: 3 })
    );
    expect(payload.order_sequence).toBe(17);
  });

  it('respects a stored high-water mark above the visible orders', () => {
    const { payload } = convertLegacyDataset(dataset({ orderSequence: 42 }));
    expect(payload.order_sequence).toBe(42);
  });

  it('reports rather than silently drops a customer with no usable phone', () => {
    const { payload, skipped } = convertLegacyDataset(
      dataset({ customers: [customer({ phone: '123' })], orders: [], measurements: [] })
    );
    expect(payload.customers).toHaveLength(0);
    expect(skipped.join(' ')).toMatch(/no usable phone/i);
  });

  it('reports an order whose customer is missing rather than orphaning it', () => {
    const { payload, skipped } = convertLegacyDataset(
      dataset({ customers: [], measurements: [], orders: [order({ customerPhone: '9999999999' })] })
    );
    expect(payload.orders).toHaveLength(0);
    expect(skipped.join(' ')).toMatch(/not migrated/i);
  });

  it('matches an order to its customer by phone when the id is unknown', () => {
    const { payload } = convertLegacyDataset(
      dataset({ orders: [order({ customerId: 'MISSING-ID' })], measurements: [] })
    );
    expect(payload.orders).toHaveLength(1);
    expect(payload.orders[0].customer_id).toBe(payload.customers[0].id);
  });

  it('handles a completely empty showroom', () => {
    const { payload, stats, skipped } = convertLegacyDataset({});
    expect(stats).toMatchObject({ customers: 0, orders: 0 });
    expect(payload.order_sequence).toBe(1);
    expect(skipped).toEqual([]);
  });

  it('survives malformed entries without throwing', () => {
    const messy = {
      customers: [null, undefined, customer()],
      orders: [null, order()],
      measurements: [null, measurement()]
    } as unknown as LegacyDataset;
    expect(() => convertLegacyDataset(messy)).not.toThrow();
    const { payload } = convertLegacyDataset(messy);
    expect(payload.customers).toHaveLength(1);
    expect(payload.orders).toHaveLength(1);
  });
});
