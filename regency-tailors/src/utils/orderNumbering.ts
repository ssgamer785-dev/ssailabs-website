import { Order, TrashItem } from '../types';
import { readRaw, writeRaw } from './safeStorage';

/**
 * Order number allocation for Regency Tailors.
 *
 * Numbers are the customer-facing identity printed on production slips and
 * bills, so a number must never be issued twice. Deriving "next number" purely
 * from the live orders list is not enough: deleting the newest order and
 * emptying the trash lowers the maximum again and the next order re-uses a
 * number that is already on a printed bill.
 *
 * The high-water mark below is monotonic — it only ever moves up — and is
 * persisted alongside the data, so retired numbers stay retired.
 */

export const ORDER_SEQ_SUFFIX = '_ORDER_SEQ';

/** Largest number embedded in an order id / order number, or 0. */
export function extractOrderNumber(raw: unknown): number {
  const digits = String(raw ?? '').match(/\d+/g);
  if (!digits) return 0;
  const value = parseInt(digits.join(''), 10);
  if (!Number.isFinite(value) || value <= 0 || value >= 1000000) return 0;
  return value;
}

/** Highest number visible across live orders and trashed orders. */
export function highestNumberInData(orders: Order[] = [], trash: TrashItem[] = []): number {
  let max = 0;

  (Array.isArray(orders) ? orders : []).forEach(o => {
    max = Math.max(max, extractOrderNumber(o?.orderNumber || o?.id));
  });

  (Array.isArray(trash) ? trash : [])
    .filter(t => t?.itemType === 'Order')
    .forEach(t => {
      max = Math.max(max, extractOrderNumber(t?.originalData?.orderNumber || t?.originalData?.id));
    });

  return max;
}

/** Reads the persisted high-water mark (0 when unset or unreadable). */
export function readHighWaterMark(storageKey: string): number {
  const raw = readRaw(`${storageKey}${ORDER_SEQ_SUFFIX}`);
  const value = parseInt(raw || '0', 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/** Raises the persisted high-water mark. Never lowers it. */
export function raiseHighWaterMark(storageKey: string, candidate: number): number {
  const current = readHighWaterMark(storageKey);
  const next = Math.max(current, Number.isFinite(candidate) ? candidate : 0);
  if (next > current) {
    writeRaw(`${storageKey}${ORDER_SEQ_SUFFIX}`, String(next));
  }
  return next;
}

/**
 * The number the next new order should carry.
 *
 * Reads the persisted mark at call time (not from React state) so a second
 * browser tab that has already issued a number cannot hand out the same one.
 */
export function peekNextOrderNumber(storageKey: string, orders: Order[], trash: TrashItem[]): string {
  const ceiling = Math.max(readHighWaterMark(storageKey), highestNumberInData(orders, trash));
  return String(ceiling + 1);
}

/**
 * Allocates and immediately reserves the next order number, so it cannot be
 * handed out again even if this order is later deleted.
 */
export function allocateOrderNumber(storageKey: string, orders: Order[], trash: TrashItem[]): string {
  const next = parseInt(peekNextOrderNumber(storageKey, orders, trash), 10);
  raiseHighWaterMark(storageKey, next);
  return String(next);
}
