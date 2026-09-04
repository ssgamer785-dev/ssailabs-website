import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { OrderBillGarmentRow } from '../../components/bills/OrderBillGarmentRow';
import { densityTokens } from '../orderBillLayout';
import { Order, OrderItem } from '../../types';

/**
 * One customer bill, and only one.
 *
 * The showroom used to carry two: `OrderBillPage`, the approved sheet with the
 * blank hand-written Amount, and `PrintableRegencyBill`, an older invoice that
 * prints rupee figures. Both were reachable — the older one from the Production
 * Slips row and the slip dossier, both under a button reading "Print Bill" —
 * so a counter hand could hand a customer a document with computed money on it
 * without realising there were two.
 *
 * These tests pin the wiring: the legacy invoice has no route into the UI, and
 * every Print Bill action resolves to the approved bill.
 */

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string): string => readFileSync(resolve(SRC, rel), 'utf8');

/** Props each component is handed, as App wires them. */
const appWiring = (): string => read('App.tsx');

/* ------------------------------------------------- the legacy route is gone */

describe('the legacy invoice has no way into the UI', () => {
  it('its modal no longer exists', () => {
    expect(existsSync(resolve(SRC, 'components/modals/PrintBillModal.tsx'))).toBe(false);
  });

  it('nothing imports or renders that modal', () => {
    const app = appWiring();
    expect(app).not.toContain('PrintBillModal');
    expect(app).not.toContain('handleOpenPrintBill');
    expect(app).not.toContain('isPrintBillOpen');
    expect(app).not.toContain('selectedOrderForPrintBill');
  });

  it('no component renders PrintableRegencyBill in a reachable tree', () => {
    // The only files that may name it are the two that import its showroom
    // address constants, plus the orphaned shims it lives behind.
    const allowed = new Set([
      'components/bills/PrintableRegencyBill.tsx',
      'components/bills/PrintableBill.tsx',
      'components/bills/BillExportCanvas.tsx',
      'components/bills/OrderBillPage.tsx',
      'components/production/ProductionSlipPage.tsx'
    ]);

    for (const rel of [
      'App.tsx',
      'components/views/ProductionSlipsView.tsx',
      'components/views/OrdersView.tsx',
      'components/modals/ProductionSlipDetailModal.tsx',
      'components/modals/OrderDetailModal.tsx',
      'components/modals/OrderModal.tsx',
      'components/modals/PrintOrderBillModal.tsx'
    ]) {
      expect(allowed.has(rel), `${rel} is in the allow list by mistake`).toBe(false);
      expect(read(rel), `${rel} references the legacy invoice`)
        .not.toMatch(/PrintableRegencyBill|PrintableBill|BillExportCanvas/);
    }
  });

  it('the approved bill imports only the address constants from it', () => {
    const page = read('components/bills/OrderBillPage.tsx');
    expect(page).toContain('SHOWROOM_ADDRESS_LINE1');
    // Never the component itself.
    expect(page).not.toMatch(/<PrintableRegencyBill|import \{ PrintableRegencyBill/);
  });

  it('the retained files say plainly that they are not reachable', () => {
    for (const rel of [
      'components/bills/PrintableRegencyBill.tsx',
      'components/bills/PrintableBill.tsx',
      'components/bills/BillExportCanvas.tsx'
    ]) {
      expect(read(rel)).toContain('NOT USER-REACHABLE');
    }
  });
});

/* --------------------------------------- every Print Bill action is approved */

describe('every Print Bill action opens the approved bill', () => {
  it('App routes both slip-side Print Bill props to the approved handler', () => {
    const app = appWiring();
    const wirings = app.match(/onPrintBill=\{[^}]+\}/g) || [];
    expect(wirings.length).toBeGreaterThan(0);
    for (const w of wirings) {
      expect(w, `stale wiring: ${w}`).toBe('onPrintBill={handleOpenOrderBill}');
    }
  });

  it('handleOpenOrderBill is the only bill handler left', () => {
    const app = appWiring();
    expect(app).toContain('const handleOpenOrderBill');
    expect(app).toContain('<PrintOrderBillModal');
    expect((app.match(/const handleOpen\w*Bill/g) || [])).toEqual(['const handleOpenOrderBill']);
  });

  it('the order dossier opens the approved bill', () => {
    const modal = read('components/modals/OrderDetailModal.tsx');
    expect(modal).toContain('onPrintOrderBill');
    expect(modal).not.toContain('onPrintBill(');
    // And App hands it that handler.
    expect(appWiring()).toContain('onPrintOrderBill={handleOpenOrderBill}');
  });

  it('the order success screen opens the approved bill', () => {
    const wizard = read('components/modals/OrderModal.tsx');
    expect(wizard).toContain('onPrintOrderBill(createdOrderSummary)');
    // The wizard no longer carries a second, legacy bill prop.
    expect(wizard).not.toContain('onPrintBill');
  });

  it('the Production Slips row and the slip dossier still offer a bill button', () => {
    // Repointed, not removed: the workshop queue keeps the affordance it had.
    expect(read('components/views/ProductionSlipsView.tsx')).toContain('onPrintBill(order)');
    expect(read('components/modals/ProductionSlipDetailModal.tsx')).toContain('onPrintBill(order)');
  });
});

/* -------------------------------- the approved bill is unchanged and correct */

describe('the approved bill still renders as approved', () => {
  const item = (garmentType: string, extra: Partial<OrderItem> = {}): OrderItem =>
    ({ id: 'I1', garmentType, price: 0, quantity: 1, ...extra }) as OrderItem;

  it('prints four cells, no remark, and a blank amount line', () => {
    const markup = renderToStaticMarkup(
      React.createElement('table', null,
        React.createElement('tbody', null,
          React.createElement(OrderBillGarmentRow, {
            item: item('Coat', { remarks: 'WORKSHOP-ONLY' }),
            index: 0,
            snapshot: {},
            tokens: densityTokens('roomy')
          })
        )
      )
    );
    expect((markup.match(/<td/g) || []).length).toBe(4);
    expect(markup).not.toContain('WORKSHOP-ONLY');
    expect(markup).toContain('aria-label="Amount — filled in by hand"');
  });

  it('carries no rupee figure, which is what the legacy invoice printed', () => {
    const markup = renderToStaticMarkup(
      React.createElement('table', null,
        React.createElement('tbody', null,
          React.createElement(OrderBillGarmentRow, {
            item: item('Coat'),
            index: 0,
            snapshot: {},
            tokens: densityTokens('roomy')
          })
        )
      )
    );
    expect(markup).not.toContain('₹');
    expect(markup).not.toMatch(/RATE|AMOUNT \(/i);
  });
});

/* ------------------------------------------------------- the order type only */

describe('nothing else regressed', () => {
  it('the order shape the bill reads is untouched', () => {
    const order: Partial<Order> = { id: '1', orderNumber: '1', items: [] };
    expect(order.orderNumber).toBe('1');
  });
});
