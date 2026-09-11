import { Order } from '../types';

/**
 * What an edit actually saves.
 *
 * The order wizard builds a fresh Order from what is on screen. It has no
 * reason to know about the database, so it carries no `dbId` — and the
 * repository decides between INSERT and UPDATE on exactly that field. Handing
 * the wizard's object straight to the repository therefore made every edit an
 * insert: the sequence issued a second number, and the showroom had two orders
 * where it had printed one bill.
 *
 * Merging against the stored order is what makes an edit an edit. Three groups
 * of fields, and which group a field is in is the whole point:
 *
 *   The wizard owns customer details, dates, garments and measurements. Those
 *   are taken from what was just entered.
 *
 *   The database owns identity — `dbId`, `id`, `orderNumber`. Those are taken
 *   from the stored order and are never read from the wizard, so a stale or
 *   rebuilt object cannot renumber an order.
 *
 *   Everything else — money, payment history, workflow and production status,
 *   trial date, priority, invoice and fitting links — belongs to screens other
 *   than the wizard, and is carried across untouched.
 *
 * With no stored order this is a new order, and the wizard's object is exactly
 * right: it has no identity yet, which is what tells the repository to insert
 * and let the sequence assign the number.
 */
export function mergeEditedOrder(wizardOrder: Order, existingOrder: Order | null | undefined): Order {
  if (!existingOrder) return wizardOrder;

  return {
    ...existingOrder,

    // --- the wizard's to change
    customerId: wizardOrder.customerId,
    customerName: wizardOrder.customerName,
    customerPhone: wizardOrder.customerPhone,
    customerEmail: wizardOrder.customerEmail ?? existingOrder.customerEmail,
    customerAddress: wizardOrder.customerAddress ?? existingOrder.customerAddress,
    items: wizardOrder.items,
    orderDate: wizardOrder.orderDate,
    deliveryDate: wizardOrder.deliveryDate,
    specialInstructions: wizardOrder.specialInstructions,
    notes: wizardOrder.notes,
    fittingNotes: wizardOrder.fittingNotes,
    measurementsSnapshot: wizardOrder.measurementsSnapshot,

    // --- the database's, restated so they cannot be lost to a spread
    id: existingOrder.id,
    orderNumber: existingOrder.orderNumber,
    dbId: existingOrder.dbId
  };
}

/**
 * The stored order an edit belongs to, or null when this is a new order.
 *
 * Matched on the showroom-facing id first, then on the database key, so an
 * order still resolves if one of the two is missing from what the wizard
 * returned.
 */
export function findOrderBeingEdited(wizardOrder: Order, orders: Order[]): Order | null {
  return (
    orders.find(o => o.id === wizardOrder.id) ||
    (wizardOrder.dbId ? orders.find(o => o.dbId === wizardOrder.dbId) : undefined) ||
    null
  );
}
