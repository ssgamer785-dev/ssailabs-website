import { describe, it, expect } from 'vitest';
import { summariseOrderItems, formatSlipSummaryLines } from '../productionSlipSummary';
import { OrderItem } from '../../types';

const item = (garmentType: string, quantity = 1): OrderItem =>
  ({ id: `ITEM-${garmentType}-${quantity}`, garmentType, quantity, price: 0 }) as OrderItem;

describe('summariseOrderItems', () => {
  it('counts pieces, not line items', () => {
    // The example the workshop works to: five kurta pajamas, a coat and a
    // pant is seven things to make.
    const summary = summariseOrderItems([
      item('Kurta Pajama', 5),
      item('Coat', 1),
      item('Pant', 1)
    ]);
    expect(summary.totalItems).toBe(7);
    expect(summary.lines).toEqual([
      { label: 'Kurta Pajama', quantity: 5 },
      { label: 'Coat', quantity: 1 },
      { label: 'Pant', quantity: 1 }
    ]);
    expect(formatSlipSummaryLines(summary)).toBe('KURTA PAJAMA × 5  |  COAT × 1  |  PANT × 1');
  });

  it('never merges Coat and Pant', () => {
    // They are two products now. A summary that folded them back together
    // would undo the split this whole change exists to make.
    const summary = summariseOrderItems([item('Coat'), item('Pant')]);
    expect(summary.lines.map(l => l.label)).toEqual(['Coat', 'Pant']);
    expect(summary.totalItems).toBe(2);
  });

  it('folds repeated line items of the same garment together', () => {
    const summary = summariseOrderItems([item('Coat', 1), item('Shirt', 2), item('Coat', 3)]);
    expect(summary.lines).toEqual([
      { label: 'Coat', quantity: 4 },
      { label: 'Shirt', quantity: 2 }
    ]);
    expect(summary.totalItems).toBe(6);
  });

  it('keeps garments in the order they first appear', () => {
    // So the summary reads down in the same sequence as the #N blocks.
    const summary = summariseOrderItems([item('Shirt'), item('Coat'), item('Pant')]);
    expect(summary.lines.map(l => l.label)).toEqual(['Shirt', 'Coat', 'Pant']);
  });

  it('shows a count of one rather than omitting it', () => {
    expect(formatSlipSummaryLines(summariseOrderItems([item('Coat')]))).toBe('COAT × 1');
  });

  it('treats a missing or nonsense quantity as one piece', () => {
    // The garment is on the order, so it is being made. Never zero.
    const summary = summariseOrderItems([
      { id: 'A', garmentType: 'Coat' } as OrderItem,
      { id: 'B', garmentType: 'Pant', quantity: 0 } as OrderItem,
      { id: 'C', garmentType: 'Shirt', quantity: -4 } as OrderItem,
      { id: 'D', garmentType: 'Kurta Pajama', quantity: NaN } as OrderItem
    ]);
    expect(summary.totalItems).toBe(4);
    expect(summary.lines.every(l => l.quantity === 1)).toBe(true);
  });

  it('still counts a legacy combined garment as the one line it was', () => {
    // Historic orders keep their record; the summary reports what the order
    // actually says rather than rewriting it into two products.
    const summary = summariseOrderItems([item('Full Coat Pant', 2), item('Shirt')]);
    expect(summary.totalItems).toBe(3);
    expect(summary.lines[0]).toEqual({ label: 'Full Coat Pant', quantity: 2 });
  });

  it('survives an empty or malformed order', () => {
    expect(summariseOrderItems([])).toEqual({ totalItems: 0, lines: [] });
    expect(summariseOrderItems(undefined)).toEqual({ totalItems: 0, lines: [] });
    expect(summariseOrderItems([null as never, undefined as never])).toEqual({ totalItems: 0, lines: [] });
    expect(summariseOrderItems([{ id: 'X' } as OrderItem]).lines).toEqual([{ label: 'Garment', quantity: 1 }]);
  });
});
