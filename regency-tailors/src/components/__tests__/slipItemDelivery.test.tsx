import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ProductionSlipProductCard } from '../production/ProductionSlipProductCard';
import { ProductionSlipPage } from '../production/ProductionSlipPage';
import { paginateProductionSlip } from '../../utils/productionSlipPagination';
import { itemDeliveryDate } from '../../utils/itemDelivery';
import { slipDensityTokens, SLIP_DENSITY_ORDER } from '../../utils/productionSlipLayout';
import { Order, OrderItem } from '../../types';

/**
 * Every garment on the production slip shows its delivery date beside its name.
 *
 * The data model holds one delivery date per order, so each garment carries
 * that date. What matters is that none is left without one, that an old order
 * with no date prints a dash rather than the word "undefined", and that the
 * order number, quantity and measurements the card already printed are intact.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const item = (garmentType: string, over: Partial<OrderItem> = {}): OrderItem =>
  ({ id: `i-${garmentType}`, garmentType, fabricCode: '', fabricName: '', notes: '', price: 0, quantity: 1, ...over });

const order = (items: OrderItem[], over: Partial<Order> = {}): Order =>
  ({
    id: '7', orderNumber: '7', customerId: 'c1', customerName: 'Vikram Malhotra', customerPhone: '9876500001',
    items, orderDate: '2026-09-01', trialDate: '', trialRequired: false, deliveryDate: '2026-09-23',
    status: 'New', priority: 'Normal', specialInstructions: '', fittingNotes: '', totalAmount: 0, subtotal: 0,
    discount: 0, taxAmount: 0, advancePaid: 0, balanceDue: 0, urgent: false, notes: '',
    ...over
  } as Order);

const text = (html: string) =>
  html.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

describe('which date belongs to an item', () => {
  it('is the order\'s delivery date, for every item on it', () => {
    const o = order([item('Coat'), item('Pant'), item('Waistcoat')]);
    for (const it of o.items) expect(itemDeliveryDate(o, it)).toBe('2026-09-23');
  });

  it('is empty — not "undefined" — when an old order has no date', () => {
    expect(itemDeliveryDate({ deliveryDate: '' })).toBe('');
    expect(itemDeliveryDate({ deliveryDate: undefined as unknown as string })).toBe('');
    expect(itemDeliveryDate({ deliveryDate: null as unknown as string })).toBe('');
    expect(itemDeliveryDate({ deliveryDate: '   ' })).toBe('');
  });
});

describe('the garment bar', () => {
  const bar = (deliveryDate: string | undefined, garment = 'Coat') =>
    text(renderToStaticMarkup(
      <ProductionSlipProductCard item={item(garment, { quantity: 3 })} orderNumber="7" snapshot={{}} deliveryDate={deliveryDate} />
    ));

  it('prints the delivery date beside the product name', () => {
    const out = bar('2026-09-23');
    // order number, then name, then the date, then quantity — in that order
    const iNo = out.indexOf('#7'), iName = out.indexOf('Coat'), iDate = out.indexOf('2026-09-23'), iQty = out.indexOf('Qty 3');
    expect(iNo).toBeGreaterThan(-1);
    expect(iName).toBeGreaterThan(iNo);
    expect(iDate).toBeGreaterThan(iName);
    expect(iQty).toBeGreaterThan(iDate);
    expect(out).toMatch(/Coat\|Delivery \|2026-09-23\|Qty 3/);
  });

  it('keeps the order number and quantity it always printed', () => {
    const out = bar('2026-09-23');
    expect(out).toContain('#7');
    expect(out).toContain('Qty 3');
  });

  it('prints a dash, never "undefined", for an order with no date', () => {
    const out = bar('');
    expect(out).toMatch(/Delivery \|—\|/);
    expect(out).not.toMatch(/undefined|null|Invalid/i);
  });

  it('prints nothing extra when the caller offers no date', () => {
    expect(bar(undefined)).not.toContain('Delivery');
  });

  it('is present at every density tier', () => {
    for (const tier of SLIP_DENSITY_ORDER) {
      const out = text(renderToStaticMarkup(
        <ProductionSlipProductCard item={item('Coat')} orderNumber="7" snapshot={{}} deliveryDate="2026-09-23"
          tokens={slipDensityTokens(tier)} />
      ));
      expect(out, tier).toContain('2026-09-23');
    }
  });

  it('is never in the part of the bar that gives way', () => {
    // The garment name truncates when the bar is full; the date is shrink-0 and
    // no-wrap, so a long name can never push the date off the sheet.
    const html = renderToStaticMarkup(
      <ProductionSlipProductCard item={item('Kurta Pajama Set With Embroidered Dupatta And Stole')}
        orderNumber="7" snapshot={{}} deliveryDate="2026-09-23" />
    );
    const dateSpan = html.match(/<span[^>]*production-item-delivery[^>]*>/)?.[0] ?? '';
    expect(dateSpan).toContain('shrink-0');
    expect(dateSpan).toContain('whitespace-nowrap');
    const nameSpan = html.match(/<span[^>]*truncate[^>]*>/)?.[0] ?? '';
    expect(nameSpan).toContain('truncate');
  });
});

describe('a whole multi-garment slip', () => {
  const sheet = (o: Order) =>
    paginateProductionSlip(o).map(pageData =>
      text(renderToStaticMarkup(
        <ProductionSlipPage id="p" pageData={pageData} order={o} snapshot={o.measurementsSnapshot || {}}
          status={'New' as any} orderNum="7" isOverdue={false} density="dense" />
      )));

  const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

  it('every garment on every sheet carries its date', () => {
    const o = order(['Coat', 'Pant', 'Shirt', 'Kurta Pajama', 'Waistcoat', 'Sherwani', 'Jacket', '3 Piece Suit']
      .map(g => item(g)), { deliveryDate: '2026-10-05' });
    const pages = sheet(o);
    const all = pages.join('\n');
    // one bar per garment, each with its own "Delivery <date>"
    expect(count(all, 'Delivery |2026-10-05|')).toBe(o.items.length);
    // the order-level header date is still printed as before, on the first sheet
    expect(pages[0]).toMatch(/Delivery Date\|2026-10-05\|/);
  });

  it('a single-garment order carries it too', () => {
    const o = order([item('Coat')]);
    expect(count(sheet(o).join('\n'), 'Delivery |2026-09-23|')).toBe(1);
  });

  it('an old order with no delivery date still renders, with dashes', () => {
    const o = order([item('Coat'), item('Pant')], { deliveryDate: '' });
    const all = sheet(o).join('\n');
    expect(all).not.toMatch(/undefined|Invalid Date/i);
    expect(count(all, 'Delivery |—|')).toBe(2);
  });

  it('does not change how many sheets an order needs', () => {
    // The bar is one line either way, so pagination — which charges a measured
    // 5.9mm for it — is unaffected. This pins the model: it does not read dates.
    const o1 = order(Array.from({ length: 8 }, (_, i) => item(i % 2 ? 'Pant' : 'Coat')), { deliveryDate: '2026-09-23' });
    const o2 = { ...o1, deliveryDate: '' } as Order;
    expect(paginateProductionSlip(o1).map(p => p.items.length))
      .toEqual(paginateProductionSlip(o2).map(p => p.items.length));
  });
});

describe('both places that print a garment bar pass the date', () => {
  const src = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');
  it('the printed slip page', () => {
    expect(src('src/components/production/ProductionSlipPage.tsx')).toContain('deliveryDate={itemDeliveryDate(order, item)}');
  });
  it('the on-screen slip detail', () => {
    expect(src('src/components/modals/ProductionSlipDetailModal.tsx')).toContain('deliveryDate={itemDeliveryDate(order, item)}');
  });
});
