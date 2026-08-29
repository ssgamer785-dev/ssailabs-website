import { describe, it, expect } from 'vitest';
import {
  paginateProductionSlip,
  getGarmentCardHeightMm,
  A4_PAGE_BUDGET_MM
} from '../productionSlipPagination';
import { Order, OrderItem } from '../../types';

const item = (garmentType: string, remarks = ''): OrderItem => ({
  id: `ITEM-${garmentType}`,
  garmentType,
  fabricCode: 'FB',
  fabricName: 'Fabric',
  notes: '',
  price: 0,
  quantity: 1,
  remarks
});

const orderWith = (items: OrderItem[]): Order =>
  ({
    id: '1',
    orderNumber: '1',
    customerId: 'C1',
    customerName: 'Vikram Malhotra',
    customerPhone: '9876500001',
    items,
    orderDate: '2026-08-26',
    trialDate: '',
    deliveryDate: '2026-09-07',
    status: 'New',
    totalAmount: 0,
    advancePaid: 0,
    balanceDue: 0,
    urgent: false
  }) as Order;

/**
 * Every page must fit inside the real printable height of an A4 sheet.
 *
 * The notes block is only charged when the order actually carries notes, which
 * mirrors what the slip renders — an order with none prints no empty box.
 */
const BLOCK_GAP_MM = 1.7;

function assertNoPageOverflows(order: Order) {
  const pages = paginateProductionSlip(order);
  const hasNotes = Boolean(
    (order.specialInstructions || order.notes || '').trim() ||
      (order.productionNotes || '').trim() ||
      (order.fittingNotes || '').trim()
  );
  pages.forEach(page => {
    const capacity = page.isFirstPage ? A4_PAGE_BUDGET_MM.firstPage : A4_PAGE_BUDGET_MM.continuationPage;
    const cardsMm = page.items.reduce(
      (sum, entry, idx) => sum + getGarmentCardHeightMm(entry.item) + (idx ? BLOCK_GAP_MM : 0),
      0
    );
    const notesMm =
      page.isLastPage && hasNotes
        ? A4_PAGE_BUDGET_MM.notesBlock + (page.items.length ? BLOCK_GAP_MM : 0)
        : 0;
    expect(cardsMm + notesMm).toBeLessThanOrEqual(capacity);
  });
  return pages;
}

describe('getGarmentCardHeightMm', () => {
  it('gives dual-table garments more room than single-table ones', () => {
    expect(getGarmentCardHeightMm(item('Full Coat Pant'))).toBeGreaterThan(getGarmentCardHeightMm(item('Shirt')));
    expect(getGarmentCardHeightMm(item('Kurta Pajama'))).toBeGreaterThan(getGarmentCardHeightMm(item('Pant')));
  });

  it('grows with long remarks', () => {
    const short = getGarmentCardHeightMm(item('Shirt', 'French cuff'));
    const long = getGarmentCardHeightMm(item('Shirt', 'x'.repeat(400)));
    expect(long).toBeGreaterThan(short);
  });

  it('tolerates a malformed item', () => {
    expect(getGarmentCardHeightMm({} as OrderItem)).toBeGreaterThan(0);
    expect(getGarmentCardHeightMm(null as any)).toBeGreaterThan(0);
  });
});

describe('paginateProductionSlip', () => {
  it('always produces at least one page, even with no garments', () => {
    const pages = paginateProductionSlip(orderWith([]));
    expect(pages).toHaveLength(1);
    expect(pages[0].showSpecialInstructions).toBe(true);
  });

  it('keeps a single-garment order on one page', () => {
    const pages = assertNoPageOverflows(orderWith([item('Shirt')]));
    expect(pages).toHaveLength(1);
    expect(pages[0].isFirstPage && pages[0].isLastPage).toBe(true);
  });

  it('never splits a garment card across pages', () => {
    const order = orderWith([item('Full Coat Pant'), item('Coat'), item('Pant'), item('Shirt'), item('Kurta Pajama')]);
    const pages = paginateProductionSlip(order);
    const seen = pages.flatMap(p => p.items.map(i => i.originalIndex));
    expect(seen).toEqual([0, 1, 2, 3, 4]);
    expect(new Set(seen).size).toBe(5);
  });

  it('keeps a normal five-garment order on a single sheet', () => {
    // The whole point of the compact layout: the five garments the order
    // wizard can produce fit one sheet without the type shrinking.
    const pages = assertNoPageOverflows(
      orderWith([item('Full Coat Pant'), item('Coat'), item('Pant'), item('Shirt'), item('Kurta Pajama')])
    );
    expect(pages).toHaveLength(1);
    expect(pages.every(p => p.totalPages === pages.length)).toBe(true);
  });

  it('spills onto a second sheet only when the content genuinely needs it', () => {
    const heavy = () => item('Full Coat Pant', 'x'.repeat(300));
    const pages = assertNoPageOverflows(orderWith(Array.from({ length: 8 }, heavy)));
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.flatMap(p => p.items)).toHaveLength(8);
  });

  it('shows the closing summary only on the final page', () => {
    const pages = paginateProductionSlip(
      orderWith([item('Full Coat Pant'), item('Coat'), item('Pant'), item('Shirt')])
    );
    const withSummary = pages.filter(p => p.showSpecialInstructions || p.showProductionNotes);
    expect(withSummary).toHaveLength(1);
    expect(withSummary[0].isLastPage).toBe(true);
  });

  it('reserves room for the summary rather than letting it overflow', () => {
    // A dual-table garment plus the summary must still fit its page.
    assertNoPageOverflows(orderWith([item('Full Coat Pant'), item('Kurta Pajama')]));
  });

  it('keeps garment hashtag numbering continuous across pages', () => {
    const pages = paginateProductionSlip(
      orderWith([item('Full Coat Pant'), item('Coat'), item('Pant'), item('Shirt'), item('Kurta Pajama')])
    );
    const indices = pages.flatMap(p => p.items.map(i => i.originalIndex));
    expect(indices).toEqual(indices.slice().sort((a, b) => a - b));
  });

  it('ignores malformed garment entries instead of throwing', () => {
    const order = orderWith([null as any, item('Shirt'), undefined as any]);
    const pages = paginateProductionSlip(order);
    expect(pages.flatMap(p => p.items)).toHaveLength(1);
  });

  it('handles an order whose items field is not an array', () => {
    const order = { ...orderWith([]), items: 'broken' as any };
    expect(() => paginateProductionSlip(order)).not.toThrow();
    expect(paginateProductionSlip(order)).toHaveLength(1);
  });
});
