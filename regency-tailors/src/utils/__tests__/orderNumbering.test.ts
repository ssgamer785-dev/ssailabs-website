import { describe, it, expect, beforeEach } from 'vitest';
import {
  extractOrderNumber,
  highestNumberInData,
  readHighWaterMark,
  raiseHighWaterMark,
  peekNextOrderNumber,
  allocateOrderNumber
} from '../orderNumbering';
import { Order, TrashItem } from '../../types';

const KEY = 'TEST_DB';

const order = (id: string): Order =>
  ({
    id,
    orderNumber: id,
    customerId: 'C1',
    customerName: 'Test',
    customerPhone: '9876543210',
    items: [],
    orderDate: '2026-01-01',
    trialDate: '',
    deliveryDate: '2026-01-10',
    status: 'New',
    totalAmount: 0,
    advancePaid: 0,
    balanceDue: 0,
    urgent: false
  }) as Order;

const trashedOrder = (id: string): TrashItem => ({
  id: `TRASH-${id}`,
  itemType: 'Order',
  title: `Bespoke Order ${id}`,
  originalData: order(id),
  deletedAt: '2026-01-05',
  deletedBy: 'Owner'
});

beforeEach(() => {
  localStorage.clear();
});

describe('extractOrderNumber', () => {
  it('reads plain numeric ids', () => {
    expect(extractOrderNumber('7')).toBe(7);
  });

  it('reads prefixed ids like RT-0042', () => {
    expect(extractOrderNumber('RT-0042')).toBe(42);
  });

  it('returns 0 for ids with no digits', () => {
    expect(extractOrderNumber('DRAFT')).toBe(0);
    expect(extractOrderNumber(undefined)).toBe(0);
    expect(extractOrderNumber(null)).toBe(0);
  });

  it('ignores absurdly large numbers that are clearly timestamps', () => {
    expect(extractOrderNumber('ORD-1735689600000')).toBe(0);
  });
});

describe('highestNumberInData', () => {
  it('considers live orders and trashed orders', () => {
    expect(highestNumberInData([order('3'), order('1')], [trashedOrder('9')])).toBe(9);
  });

  it('tolerates malformed input', () => {
    expect(highestNumberInData(undefined as any, undefined as any)).toBe(0);
    expect(highestNumberInData([null as any, order('2')], [null as any])).toBe(2);
  });
});

describe('order number allocation', () => {
  it('starts an empty showroom at 1', () => {
    expect(peekNextOrderNumber(KEY, [], [])).toBe('1');
  });

  it('continues from the highest existing order', () => {
    expect(peekNextOrderNumber(KEY, [order('1'), order('2')], [])).toBe('3');
  });

  it('never re-issues a number after the order is deleted and the trash emptied', () => {
    // Two orders placed, so 1 and 2 are printed on real paperwork.
    expect(allocateOrderNumber(KEY, [], [])).toBe('1');
    expect(allocateOrderNumber(KEY, [order('1')], [])).toBe('2');

    // Order 2 is deleted and the trash is emptied — the data no longer shows 2.
    const remaining = [order('1')];
    expect(allocateOrderNumber(KEY, remaining, [])).toBe('3');
  });

  it('does not re-issue a number still sitting in the trash', () => {
    raiseHighWaterMark(KEY, 2);
    expect(peekNextOrderNumber(KEY, [order('1')], [trashedOrder('2')])).toBe('3');
  });

  it('gives concurrent callers distinct numbers', () => {
    // Two browser tabs allocating back to back against the same storage.
    const a = allocateOrderNumber(KEY, [], []);
    const b = allocateOrderNumber(KEY, [], []); // tab B still has a stale empty list
    expect(a).toBe('1');
    expect(b).toBe('2');
    expect(a).not.toBe(b);
  });

  it('never lowers the high-water mark', () => {
    raiseHighWaterMark(KEY, 10);
    raiseHighWaterMark(KEY, 3);
    expect(readHighWaterMark(KEY)).toBe(10);
  });

  it('resumes correctly from a restored backup that is ahead of the local mark', () => {
    raiseHighWaterMark(KEY, 2);
    const restoredOrders = [order('1'), order('2'), order('3'), order('17')];
    expect(peekNextOrderNumber(KEY, restoredOrders, [])).toBe('18');
  });

  it('treats an unreadable counter as zero rather than throwing', () => {
    localStorage.setItem(`${KEY}_ORDER_SEQ`, 'not-a-number');
    expect(readHighWaterMark(KEY)).toBe(0);
    expect(peekNextOrderNumber(KEY, [order('4')], [])).toBe('5');
  });
});
