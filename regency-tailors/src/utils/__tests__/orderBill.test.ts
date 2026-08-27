import { describe, it, expect } from 'vitest';
import { garmentMeasurementBlocks, garmentRemarkFor, recordedMeasurementCount } from '../garmentMeasurements';
import { paginateOrderBill, getBillCardHeightMm, A4_BILL_BUDGET_MM } from '../orderBillPagination';
import { Order, OrderItem, MeasurementRecord } from '../../types';

const item = (garmentType: string, over: Partial<OrderItem> = {}): OrderItem => ({
  id: `ITEM-${garmentType}`,
  garmentType,
  fabricCode: '',
  fabricName: '',
  notes: '',
  price: 0,
  quantity: 1,
  remarks: '',
  ...over
});

const snapshot: Partial<MeasurementRecord> = {
  unit: 'inches',
  coat: { chest: '41', length: '30.5' },
  pant: { waist: '34' },
  shirt: { chest: '40', collar: '15.5' },
  kurta: { chest: '43' },
  pajama: { waist: '35' }
};

const orderWith = (items: OrderItem[]): Order =>
  ({
    id: '1',
    orderNumber: '1',
    customerId: 'C1',
    customerName: 'Harpreet Singh',
    customerPhone: '9814455566',
    items,
    orderDate: '2026-08-27',
    trialDate: '',
    deliveryDate: '2026-09-08',
    status: 'New',
    totalAmount: 0,
    advancePaid: 0,
    balanceDue: 0,
    urgent: false
  }) as Order;

/** No sheet may exceed what actually fits on A4. */
function assertNoSheetOverflows(order: Order) {
  const pages = paginateOrderBill(order, snapshot);
  pages.forEach(page => {
    const capacity = page.isFirstPage ? A4_BILL_BUDGET_MM.firstPage : A4_BILL_BUDGET_MM.continuationPage;
    const cards = page.items.reduce(
      (sum, entry, idx) => sum + getBillCardHeightMm(entry.item, snapshot) + (idx ? 4 : 0),
      0
    );
    const closing = page.showClosing ? A4_BILL_BUDGET_MM.closingBlock + (page.items.length ? 4 : 0) : 0;
    expect(cards + closing).toBeLessThanOrEqual(capacity);
  });
  return pages;
}

describe('garment measurement mapping', () => {
  it('gives a suit both a coat and a pant table', () => {
    const titles = garmentMeasurementBlocks(item('Full Coat Pant'), snapshot).map(b => b.title);
    expect(titles).toEqual(['COAT MEASUREMENTS', 'PANT MEASUREMENTS']);
  });

  it('gives a kurta pajama both ethnic tables', () => {
    const titles = garmentMeasurementBlocks(item('Kurta Pajama'), snapshot).map(b => b.title);
    expect(titles).toEqual(['KURTA MEASUREMENTS', 'PAJAMA MEASUREMENTS']);
  });

  it.each([
    ['Coat', ['COAT MEASUREMENTS']],
    ['Pant', ['PANT MEASUREMENTS']],
    ['Shirt', ['SHIRT MEASUREMENTS']],
    ['Trousers', ['PANT MEASUREMENTS']],
    ['Bespoke Shirt', ['SHIRT MEASUREMENTS']]
  ])('gives %s only its own table', (garment, expected) => {
    expect(garmentMeasurementBlocks(item(garment as string), snapshot).map(b => b.title)).toEqual(expected);
  });

  it('never puts a shirt measurement on a coat', () => {
    const coat = garmentMeasurementBlocks(item('Coat'), snapshot);
    expect(coat.some(b => b.title.includes('SHIRT'))).toBe(false);
    expect(coat[0].fields.find(f => f.label === 'Chest')?.value).toBe('41');
  });

  it('reads every recorded coat field', () => {
    const [coat] = garmentMeasurementBlocks(item('Coat'), snapshot);
    expect(coat.fields.map(f => f.label)).toEqual([
      'Length', 'Chest', 'Stomach', 'H.P. / Hip', 'Shoulder',
      'Sleeve', 'X-Back', 'Collar', 'Jacket Length', 'Waistcoat Length'
    ]);
  });

  it('leaves unrecorded measurements empty rather than inventing them', () => {
    const [coat] = garmentMeasurementBlocks(item('Coat'), { coat: { chest: '41' } });
    expect(coat.fields.find(f => f.label === 'Chest')?.value).toBe('41');
    expect(coat.fields.find(f => f.label === 'Sleeve')?.value).toBeUndefined();
    expect(recordedMeasurementCount([coat])).toBe(1);
  });

  it('falls back to a generic table for an unknown garment', () => {
    const blocks = garmentMeasurementBlocks(item('Waistcoat Only'), snapshot);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].title).toContain('MEASUREMENTS');
  });

  it('tolerates a malformed item', () => {
    expect(() => garmentMeasurementBlocks({} as OrderItem, {})).not.toThrow();
    expect(() => garmentMeasurementBlocks(null as any, {})).not.toThrow();
  });
});

describe('garment remarks', () => {
  it('prefers the remark stored on the line item', () => {
    expect(garmentRemarkFor(item('Shirt', { remarks: 'French cuffs' }), snapshot)).toBe('French cuffs');
  });

  it('falls back to the snapshot entry keyed by this garment', () => {
    expect(garmentRemarkFor(item('Shirt'), { garmentRemarks: { Shirt: 'No pocket' } })).toBe('No pocket');
  });

  it('never returns another garment’s remark', () => {
    const remarks = { Shirt: 'SHIRT-ONLY', 'Kurta Pajama': 'KURTA-ONLY' };
    expect(garmentRemarkFor(item('Pant'), { garmentRemarks: remarks })).toBe('');
    expect(garmentRemarkFor(item('Shirt'), { garmentRemarks: remarks })).toBe('SHIRT-ONLY');
  });

  it('returns an empty string when nothing was recorded', () => {
    expect(garmentRemarkFor(item('Coat'), {})).toBe('');
    expect(garmentRemarkFor(item('Coat'), { garmentRemarks: { Coat: '   ' } })).toBe('');
  });

  it('ignores a non-string remark from a hand-edited backup', () => {
    expect(garmentRemarkFor(item('Coat'), { garmentRemarks: { Coat: 42 as any } })).toBe('');
  });
});

describe('bill card height', () => {
  it('is larger for a garment with two measurement tables', () => {
    expect(getBillCardHeightMm(item('Full Coat Pant'), snapshot))
      .toBeGreaterThan(getBillCardHeightMm(item('Shirt'), snapshot));
  });

  it('grows with a long remark', () => {
    const short = getBillCardHeightMm(item('Shirt', { remarks: 'Short' }), snapshot);
    const long = getBillCardHeightMm(item('Shirt', { remarks: 'x'.repeat(400) }), snapshot);
    expect(long).toBeGreaterThan(short);
  });

  it('grows when fabric and styling were recorded', () => {
    const bare = getBillCardHeightMm(item('Shirt'), snapshot);
    const detailed = getBillCardHeightMm(
      item('Shirt', { fabricName: 'Giza cotton', fabricCode: 'FB-1', styleNotes: 'Cutaway collar' }),
      snapshot
    );
    expect(detailed).toBeGreaterThan(bare);
  });
});

describe('bill pagination', () => {
  it('always produces at least one sheet', () => {
    const pages = paginateOrderBill(orderWith([]), snapshot);
    expect(pages).toHaveLength(1);
    expect(pages[0].showClosing).toBe(true);
  });

  it('keeps a small order on a single sheet', () => {
    const pages = assertNoSheetOverflows(orderWith([item('Shirt')]));
    expect(pages).toHaveLength(1);
    expect(pages[0].isFirstPage && pages[0].isLastPage).toBe(true);
  });

  it('never splits a garment across sheets and never repeats one', () => {
    const order = orderWith([item('Full Coat Pant'), item('Coat'), item('Pant'), item('Shirt'), item('Kurta Pajama')]);
    const seen = paginateOrderBill(order, snapshot).flatMap(p => p.items.map(i => i.originalIndex));
    expect(seen).toEqual([0, 1, 2, 3, 4]);
    expect(new Set(seen).size).toBe(5);
  });

  it('keeps garment numbering in order across sheets', () => {
    const order = orderWith(Array.from({ length: 8 }, (_, i) => item(i % 2 ? 'Shirt' : 'Full Coat Pant')));
    const indices = paginateOrderBill(order, snapshot).flatMap(p => p.items.map(i => i.originalIndex));
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
  });

  it('spills a large order onto more sheets rather than one crowded page', () => {
    const order = orderWith(Array.from({ length: 10 }, () => item('Full Coat Pant')));
    const pages = assertNoSheetOverflows(order);
    expect(pages.length).toBeGreaterThan(2);
    expect(pages.every(p => p.totalPages === pages.length)).toBe(true);
  });

  it('shows the closing block on the final sheet only', () => {
    const order = orderWith([item('Full Coat Pant'), item('Coat'), item('Pant'), item('Shirt'), item('Kurta Pajama')]);
    const pages = paginateOrderBill(order, snapshot);
    const closing = pages.filter(p => p.showClosing);
    expect(closing).toHaveLength(1);
    expect(closing[0].isLastPage).toBe(true);
  });

  it('reserves room for the signature area rather than overflowing it', () => {
    assertNoSheetOverflows(orderWith([item('Full Coat Pant'), item('Kurta Pajama')]));
    assertNoSheetOverflows(orderWith([item('Full Coat Pant', { remarks: 'x'.repeat(600) })]));
  });

  it('fills the first sheet rather than stopping after one garment', () => {
    // Two single-table garments comfortably share the opening sheet.
    const pages = paginateOrderBill(orderWith([item('Shirt'), item('Coat')]), snapshot);
    expect(pages[0].items).toHaveLength(2);
  });

  it('ignores malformed garment entries', () => {
    const order = orderWith([null as any, item('Shirt'), undefined as any]);
    expect(paginateOrderBill(order, snapshot).flatMap(p => p.items)).toHaveLength(1);
  });

  it('handles an order whose items field is not an array', () => {
    const order = { ...orderWith([]), items: 'broken' as any };
    expect(() => paginateOrderBill(order, snapshot)).not.toThrow();
    expect(paginateOrderBill(order, snapshot)).toHaveLength(1);
  });

  it('handles a null order', () => {
    expect(paginateOrderBill(null, snapshot)).toHaveLength(1);
  });
});
