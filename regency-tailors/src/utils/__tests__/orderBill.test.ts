import { describe, it, expect } from 'vitest';
import { garmentMeasurementBlocks, garmentRemarkFor, recordedMeasurementCount } from '../garmentMeasurements';
import {
  planOrderBill,
  INITIAL_DENSITY,
  billRowLines,
  billTextLoad,
  densityTokens,
  tighterDensity,
  DENSITY_ORDER
} from '../orderBillLayout';
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


describe('bill row text load', () => {
  it('does not vary by garment type when no descriptive text is recorded', () => {
    // The bill's sizing model reads description/fabric/remark text only —
    // never measurement tables — so a garment with two measurement tables
    // (Full Coat Pant) takes no more room than one with none recorded here,
    // as long as neither has any bill-visible text of its own.
    expect(billRowLines(item('Full Coat Pant'), snapshot))
      .toBe(billRowLines(item('Shirt'), snapshot));
  });

  it('ignores measurement data entirely — only the remark map affects size', () => {
    const withMeasurements: Partial<MeasurementRecord> = { ...snapshot };
    const withoutMeasurements: Partial<MeasurementRecord> = { unit: 'inches' };
    expect(billRowLines(item('Full Coat Pant'), withMeasurements))
      .toBe(billRowLines(item('Full Coat Pant'), withoutMeasurements));
  });

  it('grows with a long remark', () => {
    const short = billRowLines(item('Shirt', { remarks: 'Short' }), snapshot);
    const long = billRowLines(item('Shirt', { remarks: 'x'.repeat(400) }), snapshot);
    expect(long).toBeGreaterThan(short);
  });

  it('grows when fabric and styling were recorded', () => {
    const bare = billRowLines(item('Shirt'), snapshot);
    const detailed = billRowLines(
      item('Shirt', { fabricName: 'Giza cotton hand-finished', fabricCode: 'FB-1', styleNotes: 'Cutaway collar, french cuffs, no chest pocket' }),
      snapshot
    );
    expect(detailed).toBeGreaterThan(bare);
  });

  it('sums the load across every garment', () => {
    const items = [item('Shirt'), item('Coat'), item('Pant')];
    expect(billTextLoad(items, snapshot))
      .toBe(items.reduce((s, i) => s + billRowLines(i, snapshot), 0));
  });

  it('never reports less than one line for an empty garment', () => {
    expect(billRowLines(item('Shirt'), {})).toBe(1);
    expect(billRowLines({} as OrderItem, {})).toBe(1);
  });
});

describe('bill density tiers', () => {
  it('tightens monotonically at every step of the ladder', () => {
    for (let i = 1; i < DENSITY_ORDER.length; i++) {
      const looser = densityTokens(DENSITY_ORDER[i - 1]);
      const tighter = densityTokens(DENSITY_ORDER[i]);
      expect(tighter.rowTextPx).toBeLessThan(looser.rowTextPx);
      expect(tighter.rowPadY).toBeLessThan(looser.rowPadY);
      expect(tighter.logoPx).toBeLessThan(looser.logoPx);
      expect(tighter.qrPx).toBeLessThan(looser.qrPx);
      expect(tighter.sectionGap).toBeLessThan(looser.sectionGap);
    }
  });

  it('keeps even the tightest tier readable rather than shrinking without limit', () => {
    const floor = densityTokens(DENSITY_ORDER[DENSITY_ORDER.length - 1]);
    expect(floor.rowTextPx).toBeGreaterThanOrEqual(7);
    expect(floor.disclaimerPx).toBeGreaterThanOrEqual(9);
    // The QR must stay big enough to actually scan off the printed sheet.
    expect(floor.qrPx).toBeGreaterThanOrEqual(56);
  });

  it('walks the ladder one step at a time and stops at the floor', () => {
    // Derived from the ladder rather than spelled out, so adding a tier
    // extends the check instead of breaking it.
    DENSITY_ORDER.forEach((tier, i) => {
      const expected = i < DENSITY_ORDER.length - 1 ? DENSITY_ORDER[i + 1] : null;
      expect(tighterDensity(tier)).toBe(expected);
    });
  });

  it('starts every bill at the loosest tier', () => {
    // The tier is not guessed from the order. Every bill renders roomy first
    // and is tightened only if the sheet it produced actually overflowed, so
    // the tier that survives is the loosest one that genuinely fits.
    expect(INITIAL_DENSITY).toBe(DENSITY_ORDER[0]);
    expect(INITIAL_DENSITY).toBe('roomy');
  });

  it('hands the wrapping columns more of the table as it tightens', () => {
    // Widening description and remarks is what buys room at high density:
    // the same text wraps to fewer lines without the type getting smaller.
    const roomy = densityTokens('roomy').columns;
    const floor = densityTokens(DENSITY_ORDER[DENSITY_ORDER.length - 1]).columns;
    expect(floor.description + floor.remarks).toBeGreaterThan(roomy.description + roomy.remarks);
  });

  it('keeps every column set summing to a full table width', () => {
    for (const key of DENSITY_ORDER) {
      const c = densityTokens(key).columns;
      const total = c.sno + c.garment + c.description + c.fabric + c.qty + c.remarks + c.amount;
      expect(total).toBeCloseTo(100, 5);
    }
  });

  it('always leaves a writable Amount column, at every tier', () => {
    for (const key of DENSITY_ORDER) {
      expect(densityTokens(key).columns.amount).toBeGreaterThanOrEqual(12);
    }
  });

  it('falls back to a usable tier for an unknown key', () => {
    expect(densityTokens('nonsense' as never).rowTextPx).toBeGreaterThan(0);
  });
});

describe('single-page bill plan', () => {
  it('puts every garment on the one sheet, in order', () => {
    const order = orderWith([item('Full Coat Pant'), item('Coat'), item('Pant'), item('Shirt'), item('Kurta Pajama')]);
    const plan = planOrderBill(order, snapshot);
    expect(plan.items.map(i => i.originalIndex)).toEqual([0, 1, 2, 3, 4]);
  });

  it('never drops a garment, however many the order has', () => {
    // There is no second page to defer to, so a large order must still
    // render every row — the layout gets denser, the content stays whole.
    for (const n of [1, 2, 5, 8, 12, 20, 40]) {
      const order = orderWith(Array.from({ length: n }, (_, i) => item(`G${i}`)));
      expect(planOrderBill(order, snapshot).items).toHaveLength(n);
    }
  });

  it('keeps S.No. stable and unique across the sheet', () => {
    const order = orderWith(Array.from({ length: 9 }, (_, i) => item(i % 2 ? 'Shirt' : 'Full Coat Pant')));
    const indices = planOrderBill(order, snapshot).items.map(i => i.originalIndex);
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
    expect(new Set(indices).size).toBe(9);
  });

  it('reports the text load the table has to carry', () => {
    const items = [item('Shirt', { remarks: 'Cutaway collar' }), item('Coat')];
    const plan = planOrderBill(orderWith(items), snapshot);
    expect(plan.textLoad).toBe(billTextLoad(items, snapshot));
  });

  it('handles an order with no garments', () => {
    const plan = planOrderBill(orderWith([]), snapshot);
    expect(plan.items).toHaveLength(0);
    expect(plan.textLoad).toBe(0);
  });

  it('ignores malformed garment entries', () => {
    const order = orderWith([null as any, item('Shirt'), undefined as any]);
    expect(planOrderBill(order, snapshot).items).toHaveLength(1);
  });

  it('handles an order whose items field is not an array', () => {
    const order = { ...orderWith([]), items: 'broken' as any };
    expect(() => planOrderBill(order, snapshot)).not.toThrow();
    expect(planOrderBill(order, snapshot).items).toHaveLength(0);
  });

  it('handles a null order', () => {
    expect(() => planOrderBill(null, snapshot)).not.toThrow();
    expect(planOrderBill(null, snapshot).items).toHaveLength(0);
  });
});
