import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeEditedOrder, findOrderBeingEdited } from '../orderEditMerge';
import { Order } from '../../types';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (rel: string): string => readFileSync(resolve(ROOT, rel), 'utf8');

/**
 * The bug these exist for.
 *
 * Editing an order in production created a second order and issued it the next
 * number. The order the wizard hands back carries no `dbId`, because it builds
 * a fresh object from the screen; the repository chooses INSERT or UPDATE on
 * exactly that field. The browser-storage path merged against the stored order
 * and so kept it. The Supabase path did not, and every edit became an insert.
 */

/** What the database gave back when the order was loaded. */
const stored = (over: Partial<Order> = {}): Order =>
  ({
    id: '1',
    orderNumber: '1',
    dbId: '11111111-1111-4111-8111-111111111111',
    customerId: 'c-1',
    customerName: 'Vikram Malhotra',
    customerPhone: '9876500001',
    items: [{ id: 'i1', garmentType: 'Coat', price: 0, quantity: 1 } as any],
    orderDate: '2026-09-01',
    deliveryDate: '2026-09-15',
    status: 'Measurement Taken',
    productionStatus: 'In Production',
    productionNotes: 'cutting done',
    subtotal: 8000,
    totalAmount: 8000,
    advancePaid: 3000,
    balanceDue: 5000,
    paymentHistory: [{ id: 'p1', date: '2026-09-02', amount: 3000, method: 'Cash' }],
    invoiceId: 'INV-1',
    ...over
  }) as Order;

/** What the wizard hands back after an edit: no dbId, and defaults elsewhere. */
const fromWizard = (over: Partial<Order> = {}): Order =>
  ({
    id: '1',
    orderNumber: '1',
    customerId: 'c-1',
    customerName: 'Vikram Malhotra',
    customerPhone: '9876500001',
    items: [{ id: 'i1', garmentType: 'Coat', price: 0, quantity: 1 } as any],
    orderDate: '2026-09-01',
    deliveryDate: '2026-09-15',
    status: 'New',
    productionStatus: 'New',
    subtotal: 0,
    totalAmount: 0,
    advancePaid: 0,
    balanceDue: 0,
    ...over
  }) as Order;

describe('an edit reaches the database as an edit', () => {
  it('keeps the database key, which is what makes it an UPDATE', () => {
    const merged = mergeEditedOrder(fromWizard({ customerName: 'Renamed' }), stored());
    expect(merged.dbId).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('keeps the order number even when the wizard hands back a different one', () => {
    // A stale or rebuilt wizard object must never be able to renumber an order.
    const merged = mergeEditedOrder(fromWizard({ orderNumber: '99', id: '1' }), stored());
    expect(merged.orderNumber).toBe('1');
    expect(merged.id).toBe('1');
  });

  it('survives ten edits with the same identity', () => {
    let current = stored();
    for (let i = 1; i <= 10; i++) {
      current = mergeEditedOrder(fromWizard({ customerName: `Edit ${i}` }), current);
      expect(current.orderNumber, `after edit ${i}`).toBe('1');
      expect(current.dbId, `after edit ${i}`).toBe('11111111-1111-4111-8111-111111111111');
    }
    expect(current.customerName).toBe('Edit 10');
  });

  it('applies what the wizard owns', () => {
    const merged = mergeEditedOrder(
      fromWizard({
        customerName: 'New Name',
        deliveryDate: '2026-12-01',
        notes: 'rush',
        items: [{ id: 'i9', garmentType: '3 Piece Suit', price: 0, quantity: 1 } as any]
      }),
      stored()
    );
    expect(merged.customerName).toBe('New Name');
    expect(merged.deliveryDate).toBe('2026-12-01');
    expect(merged.notes).toBe('rush');
    expect(merged.items[0].garmentType).toBe('3 Piece Suit');
  });

  it('does not let the wizard reset money, workflow or production history', () => {
    const merged = mergeEditedOrder(fromWizard(), stored());
    expect(merged.advancePaid).toBe(3000);
    expect(merged.balanceDue).toBe(5000);
    expect(merged.totalAmount).toBe(8000);
    expect(merged.paymentHistory).toHaveLength(1);
    expect(merged.status).toBe('Measurement Taken');
    expect(merged.productionStatus).toBe('In Production');
    expect(merged.productionNotes).toBe('cutting done');
    expect(merged.invoiceId).toBe('INV-1');
  });

  it('a new order is passed through untouched, so the sequence assigns its number', () => {
    const fresh = fromWizard({ id: '', orderNumber: '' });
    const merged = mergeEditedOrder(fresh, null);
    expect(merged).toBe(fresh);
    expect(merged.dbId).toBeUndefined();
  });
});

describe('finding the order being edited', () => {
  const list = [stored(), stored({ id: '2', orderNumber: '2', dbId: 'dbid-2' })];

  it('matches on the showroom id', () => {
    expect(findOrderBeingEdited(fromWizard({ id: '2' }), list)?.dbId).toBe('dbid-2');
  });

  it('falls back to the database key when the id is missing', () => {
    const wizard = fromWizard({ id: '', dbId: 'dbid-2' });
    expect(findOrderBeingEdited(wizard, list)?.orderNumber).toBe('2');
  });

  it('returns null for an order that is not stored yet', () => {
    expect(findOrderBeingEdited(fromWizard({ id: 'new', dbId: undefined }), list)).toBeNull();
  });
});

describe('both persistence paths go through the merge', () => {
  const app = read('src/App.tsx');

  it('the merge runs before either branch, not inside one of them', () => {
    const handler = app.slice(app.indexOf('const handleSaveOrder'));
    const merge = handler.indexOf('mergeEditedOrder(order, existingOrder)');
    const supabaseBranch = handler.indexOf('if (usesSupabase)');
    expect(merge).toBeGreaterThan(-1);
    expect(merge, 'the merge must happen before the Supabase branch').toBeLessThan(supabaseBranch);
  });

  it('the Supabase branch saves the merged order, never the wizard object', () => {
    expect(app).toContain('repo.saveOrder(mergedOrder)');
    expect(app).not.toContain('repo.saveOrder(order)');
  });
});

describe('the measurement ledger receives every section the order captured', () => {
  const app = read('src/App.tsx');

  it('no hand-written five-section list survives', () => {
    // Both save paths listed coat/pant/shirt/kurta/pajama by hand, so a
    // waistcoat, jacket or sherwani measured on an order never reached the
    // customer's sheet.
    expect(app).not.toMatch(/\['coat',\s*'pant',\s*'shirt',\s*'kurta',\s*'pajama'\]/);
    expect(app).toContain('MEASUREMENT_SECTIONS.forEach');
  });

  it('both save paths spread the captured sections, not the helper itself', () => {
    // `...capturedSections` spreads the function, which has no own enumerable
    // properties: silently no sections at all. It has to be called.
    expect(app).not.toMatch(/\.\.\.capturedSections\s*(,|\n|\})/);
    // Supabase path: called inline. localStorage path: called into `captured`.
    expect(app).toContain('...capturedSections(order.measurementsSnapshot)');
    expect(app).toContain('const captured = capturedSections(snap);');
    expect(app).toContain('...captured');
  });
});
