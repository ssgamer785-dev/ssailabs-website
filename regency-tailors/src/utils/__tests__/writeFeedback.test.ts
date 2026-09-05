import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Three defects this file pins, all found by driving the real UI against a
 * PostgREST that enforces the live schema. Each is a case where the screen and
 * the database disagreed and the screen was the one being believed.
 *
 * The behavioural proof lives in e2e/integrity.mjs, which reproduces all three
 * in a browser. These assertions guard the shape of the fixes, so a later edit
 * cannot quietly reintroduce the pattern that caused them.
 */

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string): string => readFileSync(resolve(SRC, rel), 'utf8');

describe('an open dossier shows the row the database now holds', () => {
  const app = read('App.tsx');

  it('App looks the record up at render time instead of using the captured snapshot', () => {
    expect(app).toContain('const liveOrder = (snapshot: Order | null): Order | null =>');
    expect(app).toContain('const liveCustomer = (snapshot: Customer | null): Customer | null =>');
  });

  it('every order-bearing modal is wired through the lookup', () => {
    for (const state of [
      'selectedOrderForDetail',
      'selectedOrderForSlipDetail',
      'selectedOrderForPrintSlip',
      'selectedOrderForBill'
    ]) {
      expect(app, `${state} is still handed to a modal raw`)
        .not.toMatch(new RegExp(`order=\\{${state}\\}`));
      expect(app).toContain(`liveOrder(${state})`);
    }
    expect(app).not.toMatch(/customer=\{selectedCustomerProfile\}/);
    expect(app).toContain('liveCustomer(selectedCustomerProfile)');
  });

  it('the lookup falls back to the snapshot so a modal never blanks mid-view', () => {
    expect(app).toContain('orders.find(o => o.id === snapshot.id) || snapshot');
    expect(app).toContain('customers.find(c => c.id === snapshot.id) || snapshot');
  });
});

describe('"Notes Saved" means the database saved it', () => {
  const app = read('App.tsx');
  const modal = read('components/modals/ProductionSlipDetailModal.tsx');

  it('App has a write path that reports the outcome to the caller', () => {
    expect(app).toContain('const pushResult = useCallback(async (write: () => Promise<unknown>): Promise<string | null>');
    // It must still resync from the server whichever way the write went.
    const body = app.slice(app.indexOf('const pushResult'), app.indexOf('const pushOrThrow'));
    expect(body).toContain('await refresh()');
    expect(body).toContain('return failure');
  });

  it('the production-notes handler returns that outcome rather than discarding it', () => {
    expect(app).toContain('const handleUpdateProductionNotes = async (orderId: string, notes: string): Promise<string | null>');
    expect(app).toContain('return pushResult(() => repo.updateProductionNotes(dbId, notes))');
    expect(app).not.toMatch(/void push\(\(\) => repo\.updateProductionNotes/);
  });

  it('the dossier awaits the result and only then shows the green badge', () => {
    expect(modal).toContain('const failure = await onUpdateProductionNotes(order.id, notes)');
    // The badge is bound to a resolved state, never flipped on beside the call.
    expect(modal).toContain("setSaveState('saved')");
    expect(modal).toMatch(/if \(failure\) \{[\s\S]{0,120}setSaveError\(failure\);[\s\S]{0,80}return;/);
    expect(modal).not.toContain('setIsSavedToast(true)');
  });

  it('a refused write is reported inside the dossier, not only in the page banner', () => {
    // The page-level banner sits behind this modal's backdrop.
    expect(modal).toContain('role="alert"');
    expect(modal).toContain('{saveError}');
  });
});

describe('PLACE ORDER cannot be submitted twice', () => {
  const wizard = read('components/modals/OrderModal.tsx');

  it('the guard is a ref, which is written before React re-renders', () => {
    expect(wizard).toContain('const submittingRef = useRef(false)');
    expect(wizard).toMatch(/if \(submittingRef\.current\) return;\s*\n\s*submittingRef\.current = true;/);
  });

  it('React state is no longer the gate', () => {
    // `isSubmitting` may still drive the label; it must not be the check.
    expect(wizard).not.toMatch(/handleFinalPlaceOrder = async \(\) => \{\s*\n\s*if \(isSubmitting\) return;/);
  });

  it('the guard is released on every exit so a retry still works', () => {
    expect(wizard).toMatch(/finally \{[\s\S]{0,220}submittingRef\.current = false;/);
  });
});
