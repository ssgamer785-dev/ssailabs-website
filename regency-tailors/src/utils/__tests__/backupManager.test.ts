import { describe, it, expect } from 'vitest';
import {
  buildBackupSnapshot,
  validateBackupContent,
  normalizeRestoredPayload,
  inspectBackupIntegrity,
  MAX_BACKUP_BYTES
} from '../backupManager';
import { Customer, Order, ShowroomProfile } from '../../types';

const profile: ShowroomProfile = {
  name: 'REGENCY TAILOR',
  subtitle: 'Bespoke Showroom & Tailoring Suite',
  city: 'JALANDHAR CITY SHOWROOM',
  address: 'Bootan Mandi, Jalandhar',
  phone: '99887 71631',
  email: 'concierge@regencytailors.com',
  gstin: '03AAAAA0000A1Z5',
  activeUser: 'Showroom Owner',
  activeRole: 'Admin'
};

const customer: Customer = {
  id: 'CUST-1',
  name: 'Arjun Mehta',
  phone: '9876543210',
  email: '',
  address: 'Model Town',
  city: 'Jalandhar',
  totalOrders: 1,
  lifetimeSpend: 18000,
  lastVisitDate: '2026-08-20',
  createdDate: '2026-08-01'
};

const order = {
  id: '1',
  orderNumber: '1',
  customerId: 'CUST-1',
  customerName: 'Arjun Mehta',
  customerPhone: '9876543210',
  items: [
    { id: 'ITEM-1-1', garmentType: 'Full Coat Pant', fabricCode: 'FB', fabricName: 'Wool', notes: '', price: 12000, quantity: 1, remarks: 'Peak lapel' },
    { id: 'ITEM-1-2', garmentType: 'Shirt', fabricCode: 'FB2', fabricName: 'Cotton', notes: '', price: 3000, quantity: 2, remarks: 'French cuff' }
  ],
  orderDate: '2026-08-20',
  trialDate: '',
  deliveryDate: '2026-09-01',
  status: 'Master Stitching',
  totalAmount: 18000,
  advancePaid: 8000,
  balanceDue: 10000,
  urgent: false,
  measurementsSnapshot: { unit: 'inches', coat: { chest: '41' }, garmentRemarks: { 'Full Coat Pant': 'Peak lapel' } }
} as unknown as Order;

const emptyCollections = {
  measurements: [],
  fittings: [],
  workers: [],
  invoices: [],
  expenses: [],
  trash: []
};

describe('buildBackupSnapshot', () => {
  it('counts garments by quantity, not line count', () => {
    const snap = buildBackupSnapshot({ customers: [customer], orders: [order], ...emptyCollections, profile });
    expect(snap.metadata.stats.garmentsCount).toBe(3); // 1 suit + 2 shirts
    expect(snap.metadata.stats.ordersCount).toBe(1);
  });

  it('carries the retired order-number high-water mark', () => {
    const snap = buildBackupSnapshot({ customers: [], orders: [], ...emptyCollections, profile, orderSequence: 42 });
    expect(snap.metadata.orderSequence).toBe(42);
  });

  it('never exports credentials or API keys', () => {
    const snap = buildBackupSnapshot({ customers: [customer], orders: [order], ...emptyCollections, profile });
    const serialised = JSON.stringify(snap);
    expect(/api[_-]?key|anon[_-]?key|service[_-]?role|password|secret|token/i.test(serialised)).toBe(false);
  });
});

describe('validateBackupContent', () => {
  const good = () =>
    JSON.stringify(buildBackupSnapshot({ customers: [customer], orders: [order], ...emptyCollections, profile }));

  it('accepts a snapshot this app produced', () => {
    const result = validateBackupContent(good());
    expect(result.isValid).toBe(true);
    expect(result.payload?.orders).toHaveLength(1);
    expect(result.payload?.orders[0].items[1].remarks).toBe('French cuff');
  });

  it('rejects an empty file', () => {
    expect(validateBackupContent('').isValid).toBe(false);
    expect(validateBackupContent('   ').error).toMatch(/empty/i);
  });

  it('rejects unparsable JSON', () => {
    const r = validateBackupContent('{"metadata":');
    expect(r.isValid).toBe(false);
    expect(r.error).toMatch(/corrupt/i);
  });

  it('rejects a backup from another application', () => {
    const r = validateBackupContent(JSON.stringify({ metadata: { application: 'Some Other App' }, customers: [] }));
    expect(r.isValid).toBe(false);
    expect(r.error).toMatch(/incompatible/i);
  });

  it('rejects a JSON object with no Regency collections', () => {
    const r = validateBackupContent(JSON.stringify({ hello: 'world' }));
    expect(r.isValid).toBe(false);
  });

  it('rejects a file above the size limit before parsing it', () => {
    const r = validateBackupContent('{}', 'huge.regency.backup', MAX_BACKUP_BYTES + 1);
    expect(r.isValid).toBe(false);
    expect(r.error).toMatch(/too large/i);
  });

  it('accepts a legacy backup that has collections but no metadata', () => {
    const r = validateBackupContent(JSON.stringify({ customers: [customer], orders: [order] }));
    expect(r.isValid).toBe(true);
    expect(r.payload?.customers).toHaveLength(1);
  });

  it('survives a full export -> import round trip without losing relationships', () => {
    const r = validateBackupContent(good());
    const restored = r.payload!;
    expect(restored.orders[0].customerId).toBe(customer.id);
    expect(restored.orders[0].measurementsSnapshot?.coat?.chest).toBe('41');
    expect(restored.orders[0].measurementsSnapshot?.garmentRemarks?.['Full Coat Pant']).toBe('Peak lapel');
    expect(restored.orders[0].advancePaid).toBe(8000);
    expect(restored.orders[0].balanceDue).toBe(10000);
  });
});

describe('normalizeRestoredPayload', () => {
  it('repairs an order whose garment list is not an array', () => {
    const payload: any = { metadata: {}, orders: [{ id: 'X', items: 'not-an-array' }], customers: [] };
    const fixed = normalizeRestoredPayload(payload);
    expect(Array.isArray(fixed.orders[0].items)).toBe(true);
    expect(fixed.orders[0].items).toHaveLength(0);
  });

  it('drops non-object entries instead of crashing the views', () => {
    const payload: any = { metadata: {}, orders: [null, 1, 'x'], customers: [null], measurements: [1, 'str', null] };
    const fixed = normalizeRestoredPayload(payload);
    expect(fixed.orders).toHaveLength(0);
    expect(fixed.customers).toHaveLength(0);
    expect(fixed.measurements).toHaveLength(0);
  });

  it('coerces money fields that arrive as strings or NaN', () => {
    const payload: any = {
      metadata: {},
      orders: [{ id: '1', totalAmount: 'NaN', advancePaid: '2500', items: [] }],
      customers: []
    };
    const fixed = normalizeRestoredPayload(payload);
    expect(fixed.orders[0].totalAmount).toBe(0);
    expect(fixed.orders[0].advancePaid).toBe(2500);
    expect(fixed.orders[0].balanceDue).toBe(0);
  });

  it('renumbers duplicate order ids so one cannot overwrite the other', () => {
    const payload: any = { metadata: {}, orders: [{ id: '5', items: [] }, { id: '5', items: [] }], customers: [] };
    const fixed = normalizeRestoredPayload(payload);
    expect(fixed.orders[0].id).not.toBe(fixed.orders[1].id);
  });

  it('leaves a healthy payload untouched', () => {
    const payload = buildBackupSnapshot({ customers: [customer], orders: [order], ...emptyCollections, profile });
    const fixed = normalizeRestoredPayload(payload);
    expect(fixed.orders[0].items.map(i => i.remarks)).toEqual(['Peak lapel', 'French cuff']);
    expect(fixed.orders[0].totalAmount).toBe(18000);
  });
});

describe('inspectBackupIntegrity', () => {
  it('finds orders pointing at a customer that is not in the backup', () => {
    const payload: any = {
      metadata: {},
      customers: [],
      orders: [{ id: '1', orderNumber: '1', customerId: 'GONE', items: [] }],
      measurements: [],
      invoices: []
    };
    const report = inspectBackupIntegrity(normalizeRestoredPayload(payload));
    expect(report.orphanOrders).toEqual(['1']);
  });

  it('finds invoices pointing at a missing order', () => {
    const payload: any = {
      metadata: {},
      customers: [],
      orders: [],
      measurements: [],
      invoices: [{ id: 'INV-9', orderId: '9' }]
    };
    const report = inspectBackupIntegrity(normalizeRestoredPayload(payload));
    expect(report.orphanInvoices).toEqual(['INV-9']);
  });

  it('reports a clean bill of health for a consistent backup', () => {
    const payload = buildBackupSnapshot({ customers: [customer], orders: [order], ...emptyCollections, profile });
    const report = inspectBackupIntegrity(normalizeRestoredPayload(payload));
    expect(report.orphanOrders).toEqual([]);
    expect(report.orphanMeasurements).toEqual([]);
    expect(report.orphanInvoices).toEqual([]);
    expect(report.duplicateOrderIds).toEqual([]);
  });
});
