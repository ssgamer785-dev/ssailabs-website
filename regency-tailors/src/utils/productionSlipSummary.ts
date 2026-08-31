import { OrderItem } from '../types';

export interface SlipSummaryLine {
  /** Garment name exactly as the order recorded it. */
  label: string;
  /** Pieces of that garment across the whole order. */
  quantity: number;
}

export interface SlipSummary {
  /** Every piece in the order, not the number of line items. */
  totalItems: number;
  lines: SlipSummaryLine[];
}

/**
 * The count the workshop checks its finished pile against.
 *
 * Counts pieces, not line items: an order of five kurta pajamas, a coat and a
 * pant is seven things to make, and seven is the number that has to match what
 * goes back on the rail.
 *
 * Line items of the same garment are folded together — two separate Coat rows
 * of one each read as COAT x 2 — but different garments never are. Coat and
 * Pant in particular stay apart: they are two products, and a summary that
 * merged them back into a combined suit would undo the thing the rest of this
 * change exists to fix.
 *
 * Garments keep the order of their first appearance, so the summary reads down
 * in the same sequence as the #N blocks above it.
 */
export function summariseOrderItems(items: OrderItem[] | undefined | null): SlipSummary {
  const lines: SlipSummaryLine[] = [];
  const indexByLabel = new Map<string, number>();

  for (const item of Array.isArray(items) ? items : []) {
    if (!item || typeof item !== 'object') continue;

    const label = (item.garmentType || '').trim() || 'Garment';
    // A missing or unparseable quantity is one piece, never zero: the garment
    // is on the order, so it is being made.
    const raw = Number(item.quantity);
    const quantity = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 1;

    const key = label.toLowerCase();
    const existing = indexByLabel.get(key);
    if (existing === undefined) {
      indexByLabel.set(key, lines.length);
      lines.push({ label, quantity });
    } else {
      lines[existing].quantity += quantity;
    }
  }

  return {
    totalItems: lines.reduce((sum, line) => sum + line.quantity, 0),
    lines
  };
}

/** "KURTA PAJAMA x 5 | COAT x 1 | PANT x 1" — always with a count, even at one. */
export function formatSlipSummaryLines(summary: SlipSummary): string {
  return summary.lines.map(l => `${l.label.toUpperCase()} × ${l.quantity}`).join('  |  ');
}
