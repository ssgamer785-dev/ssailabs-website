import { Order, OrderItem } from '../types';

/**
 * The delivery date that belongs to one garment on an order.
 *
 * Today that is the order's own date, for every garment. The data model holds
 * one delivery date per order — `orders.delivery_date`, and the wizard's single
 * "Expected Delivery Date" — and `order_items` has no date of its own, so a
 * coat and a pant on the same order are due together. This is the one place
 * that answers "which date for this item?", so the slip asks here instead of
 * reaching for `order.deliveryDate` itself.
 *
 * Returns an empty string when the order carries no date (an old or imported
 * order). The caller prints a dash for that: an honest "not recorded", never
 * the word `undefined` and never a date made up to fill the space.
 */
export function itemDeliveryDate(order: Pick<Order, 'deliveryDate'>, _item?: OrderItem): string {
  const date = order?.deliveryDate;
  return typeof date === 'string' ? date.trim() : '';
}
