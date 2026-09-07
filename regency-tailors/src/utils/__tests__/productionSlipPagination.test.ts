import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
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
    // The closing blocks: notes when the order has any, and the TOTAL ITEMS
    // band always — it is never optional, so it is always reserved.
    const closingMm = page.isLastPage
      ? (hasNotes ? A4_PAGE_BUDGET_MM.notesBlock + BLOCK_GAP_MM : 0) +
        A4_PAGE_BUDGET_MM.summaryBlock +
        BLOCK_GAP_MM
      : 0;
    expect(cardsMm + closingMm).toBeLessThanOrEqual(capacity);
  });
  return pages;
}

describe('getGarmentCardHeightMm', () => {
  it('gives dual-table garments more room than single-table ones', () => {
    // Kurta Pajama is the only garment the showroom sells that carries two
    // measurement tables. Coat and Pant are separate products with one each.
    expect(getGarmentCardHeightMm(item('Kurta Pajama'))).toBeGreaterThan(getGarmentCardHeightMm(item('Shirt')));
    expect(getGarmentCardHeightMm(item('Kurta Pajama'))).toBeGreaterThan(getGarmentCardHeightMm(item('Pant')));
  });

  it('charges a Coat and a Pant separately, never as one combined garment', () => {
    const coat = getGarmentCardHeightMm(item('Coat'));
    const pant = getGarmentCardHeightMm(item('Pant'));
    const legacyCombined = getGarmentCardHeightMm(item('Full Coat Pant'));
    // Two products cost two headers and two remark bands; the legacy single
    // item carried both tables under one of each, so it is the smaller.
    expect(coat + pant).toBeGreaterThan(legacyCombined);
    expect(coat).toBeLessThan(legacyCombined);
    expect(pant).toBeLessThan(legacyCombined);
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

  it('charges nothing for fabric, style/cut or garment notes', () => {
    // The slip prints none of the three, so reserving paper for them would
    // push a one-sheet order onto two. Same garment, same measurements, same
    // remark — only the dropped fields differ, so the heights must match.
    const bare = getGarmentCardHeightMm(
      { ...item('Shirt', 'French cuffs'), fabricName: '', fabricCode: '', styleNotes: '' } as OrderItem
    );
    const loaded = getGarmentCardHeightMm({
      ...item('Shirt', 'French cuffs'),
      fabricName: 'Giza 87 Egyptian Cotton, white, double-ply, milled in Como',
      fabricCode: 'FB-SH-087',
      styleNotes: 'Cutaway collar, tapered body, single-needle topstitch throughout',
      notes: 'Cutaway collar, tapered body, single-needle topstitch throughout',
      specialInstructions: 'Wash and press before delivery; check button alignment.'
    } as OrderItem);
    expect(loaded).toBe(bare);
  });

  it('always reserves the remarks band, recorded or blank', () => {
    // A garment with no remark still prints the ruled line the workshop
    // writes its adjustment on, so the band is never free.
    const blank = getGarmentCardHeightMm(item('Shirt'));
    const measurementsOnly = 5.05 + 2 * 4.05 + 5.9 + 0.8;
    expect(blank).toBeGreaterThan(measurementsOnly);
  });

  it('charges hard line breaks in a remark', () => {
    // The band renders whitespace-pre-wrap, so a typed newline is a real break
    // on paper. Counting characters alone priced this remark as a single line
    // and clipped the rest off the sheet.
    const oneLine = getGarmentCardHeightMm(item('Shirt', 'Line one'));
    const threeLines = getGarmentCardHeightMm(item('Shirt', 'Line one\nLine two\nLine three'));
    expect(threeLines).toBeGreaterThan(oneLine);
    expect(threeLines - oneLine).toBeGreaterThanOrEqual(2 * 3.456);
  });

  it('charges a remark stored on the measurement snapshot', () => {
    // garmentRemarkFor falls back to the snapshot's per-garment map; the
    // height model resolves the remark the same way the card does, so a
    // snapshot-only remark is measured rather than silently overflowing.
    const shirt = item('Shirt');
    const short = getGarmentCardHeightMm(shirt, { garmentRemarks: { Shirt: 'Short' } } as any);
    const long = getGarmentCardHeightMm(shirt, { garmentRemarks: { Shirt: 'x'.repeat(400) } } as any);
    expect(long).toBeGreaterThan(short);
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
    const order = orderWith([item('Coat'), item('Pant'), item('Shirt'), item('Kurta Pajama'), item('Coat')]);
    const pages = paginateProductionSlip(order);
    const seen = pages.flatMap(p => p.items.map(i => i.originalIndex));
    expect(seen).toEqual([0, 1, 2, 3, 4]);
    expect(new Set(seen).size).toBe(5);
  });

  it('keeps a normal five-garment order on a single sheet', () => {
    // The whole point of the compact layout: the five garments the order
    // wizard can produce fit one sheet without the type shrinking.
    const pages = assertNoPageOverflows(
      orderWith([item('Coat'), item('Pant'), item('Shirt'), item('Kurta Pajama'), item('Coat')])
    );
    expect(pages).toHaveLength(1);
    expect(pages.every(p => p.totalPages === pages.length)).toBe(true);
  });

  it('spills onto a second sheet only when the content genuinely needs it', () => {
    const heavy = () => item('Kurta Pajama', 'x'.repeat(300));
    const pages = assertNoPageOverflows(orderWith(Array.from({ length: 8 }, heavy)));
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.flatMap(p => p.items)).toHaveLength(8);
  });

  it('shows the closing summary only on the final page', () => {
    const pages = paginateProductionSlip(
      orderWith([item('Coat'), item('Pant'), item('Shirt'), item('Kurta Pajama')])
    );
    const withSummary = pages.filter(p => p.showSpecialInstructions || p.showProductionNotes);
    expect(withSummary).toHaveLength(1);
    expect(withSummary[0].isLastPage).toBe(true);
  });

  it('reserves room for the summary rather than letting it overflow', () => {
    // A dual-table garment plus the summary must still fit its page.
    assertNoPageOverflows(orderWith([item('Kurta Pajama'), item('Kurta Pajama')]));
  });

  it('keeps garment hashtag numbering continuous across pages', () => {
    const pages = paginateProductionSlip(
      orderWith([item('Coat'), item('Pant'), item('Shirt'), item('Kurta Pajama'), item('Coat')])
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

/* ---------------------------------------------------------------------------
 * The page counts above are only achievable if the sheet can actually reach
 * the tier they are priced at.
 *
 * The slip renders at the loosest of four density tiers and steps down —
 * roomy, normal, compact, dense — each time a sheet reports that its content
 * overflowed. The budget above is calibrated against `dense`, the floor: an
 * eight-garment order is one sheet only because the type is allowed to get
 * that small. If the step-down never runs, the model's plan is unreachable and
 * the sheet prints with its last garment's measurements under the footer.
 *
 * That is exactly what happened. The reset that returns a newly opened slip to
 * the loosest tier lived in a layout effect, which React runs after the
 * sheets' own — so it overwrote the tightening they had just requested in the
 * same commit, the tier came out equal to what was already rendered, React
 * skipped the re-render, and the sheets never measured a second time. Every
 * overflowing sheet printed at `roomy` having never tried anything tighter.
 *
 * These read the source because the fault was in when the reset runs, not in
 * what it computes: a jsdom render reports every height as zero and would call
 * a clipped sheet fine.
 * ------------------------------------------------------------------------- */
describe('the slip can actually reach the tier its page count is priced at', () => {
  const modal = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '../../components/modals/PrintProductionSlipModal.tsx'),
    'utf8'
  );

  it('resets the tier while rendering, not in an effect that outruns the sheets', () => {
    const reset = modal.slice(modal.indexOf('const orderKey ='), modal.indexOf('const handleOverflow'));
    expect(reset).toContain('if (orderKey !== densityKey)');
    expect(reset).not.toMatch(/use(Layout)?Effect/);
  });

  it('still steps one tier at a time and stops at the floor', () => {
    expect(modal).toContain('tighterSlipDensity(current) ?? current');
  });

  it('and every sheet of one slip prints at the same tier', () => {
    // A single document-wide tier, not one per sheet: two sheets of the same
    // slip at different type sizes would read as a fault.
    expect(modal).toContain('density={density}');
  });
});
