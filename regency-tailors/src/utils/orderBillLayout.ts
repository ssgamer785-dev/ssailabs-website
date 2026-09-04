import { Order, OrderItem, MeasurementRecord } from '../types';

/**
 * Layout planning for the customer bill.
 *
 * The bill is a SINGLE A4 portrait sheet — always, for any order. It never
 * paginates, so instead of splitting garments across sheets this module picks
 * a density: how much padding, type size and leading the sheet can afford
 * while still holding every garment the order actually contains.
 *
 * The tier chosen here is only an opening guess. `OrderBillPage` measures the
 * rendered sheet and steps the tier down if the real content overflows, so
 * the guarantee comes from a measurement in the browser rather than from the
 * estimate below being perfect. That matters because text wrapping depends on
 * the font that actually loads, which no static estimate can know.
 *
 * This document carries no measurements, and no longer carries fabric or
 * stitching description either — the showroom stopped collecting them, and a
 * column of em-dashes is worse than no column. The space a garment needs
 * therefore depends only on its remark text.
 */

export type BillDensity = 'roomy' | 'normal' | 'compact' | 'dense' | 'ultra';

/** Ordered loosest → tightest. Stepping "down" means moving right. */
export const DENSITY_ORDER: BillDensity[] = ['roomy', 'normal', 'compact', 'dense', 'ultra'];

/**
 * Every bill starts here and tightens only if the rendered sheet actually
 * overflows. Choosing the tier from an estimate instead was measurably worse:
 * it picked `compact` for a five-garment order that had 62mm of room to
 * spare, because no static guess can know how the text really wrapped.
 */
export const INITIAL_DENSITY: BillDensity = DENSITY_ORDER[0];

/** Percentage widths for the four garment-table columns, left to right. */
export interface BillColumnWidths {
  sno: number;
  garment: number;
  qty: number;
  amount: number;
}

export interface BillDensityTokens {
  key: BillDensity;

  /**
   * The same widths at every tier. Tighter tiers used to hand a larger share of
   * the table to the remarks column, because widening wrapping text shortens
   * the row more cheaply than shrinking the type does. With remarks gone no
   * cell wraps at all — every row is exactly one line — so there is nothing
   * left for a re-proportioned table to buy.
   */
  columns: BillColumnWidths;

  /* Header */
  logoPx: number;
  brandPx: number;
  taglinePx: number;
  qrPx: number;
  qrLabelPx: number;
  headerPadY: number;

  /* Body rhythm */
  sectionGap: number;
  blockPadY: number;
  metaValuePx: number;
  metaLabelPx: number;

  /* Garment table */
  tableHeadPx: number;
  rowPadY: number;
  rowTextPx: number;
  rowLeading: number;

  /* Closing blocks */
  paymentRowGap: number;
  paymentLabelPx: number;
  paymentLineH: number;
  termsPx: number;
  disclaimerPx: number;
}

/*
 * One balanced set of widths, summing to 100.
 *
 * Removing the remarks column returned 43% of the table. It goes where the
 * customer's eye goes: the garment name gets the room it needs to sit on one
 * line at any tier, and the amount column keeps a generous writing line for
 * the owner's pen. S.No. and Qty. hold single digits and need no more than
 * they have.
 */
const BILL_COLUMNS: BillColumnWidths = {
  sno: 8, garment: 52, qty: 10, amount: 30
};

/**
 * Five tiers, each a uniform tightening of the one before. The floor ('ultra')
 * is deliberately still readable — 7px body text at A4 scale is small print,
 * but it is print a customer can actually read, which is the point of putting
 * the garments on the bill at all. Shrinking past that to fit an implausible
 * number of rows would trade the document's purpose for a page count.
 */
const TOKENS: Record<BillDensity, BillDensityTokens> = {
  roomy: {
    key: 'roomy', columns: BILL_COLUMNS,
    logoPx: 108, brandPx: 34, taglinePx: 9.5, qrPx: 104, qrLabelPx: 7, headerPadY: 16,
    sectionGap: 9, blockPadY: 9, metaValuePx: 10.5, metaLabelPx: 9,
    tableHeadPx: 8.5, rowPadY: 7, rowTextPx: 10, rowLeading: 1.35,
    paymentRowGap: 12, paymentLabelPx: 9.5, paymentLineH: 15,
    termsPx: 9.5, disclaimerPx: 11.5
  },
  normal: {
    key: 'normal', columns: BILL_COLUMNS,
    logoPx: 94, brandPx: 30, taglinePx: 9, qrPx: 94, qrLabelPx: 6.5, headerPadY: 13,
    sectionGap: 7, blockPadY: 7.5, metaValuePx: 10, metaLabelPx: 8.5,
    tableHeadPx: 8, rowPadY: 5.5, rowTextPx: 9.5, rowLeading: 1.3,
    paymentRowGap: 9, paymentLabelPx: 9, paymentLineH: 13,
    termsPx: 9, disclaimerPx: 11
  },
  compact: {
    key: 'compact', columns: BILL_COLUMNS,
    logoPx: 80, brandPx: 26, taglinePx: 8, qrPx: 84, qrLabelPx: 6, headerPadY: 10,
    sectionGap: 5, blockPadY: 6, metaValuePx: 9.5, metaLabelPx: 8,
    tableHeadPx: 7.5, rowPadY: 4, rowTextPx: 9, rowLeading: 1.25,
    paymentRowGap: 7, paymentLabelPx: 8.5, paymentLineH: 11,
    termsPx: 8.5, disclaimerPx: 10.5
  },
  dense: {
    key: 'dense', columns: BILL_COLUMNS,
    logoPx: 66, brandPx: 22, taglinePx: 7, qrPx: 74, qrLabelPx: 5.5, headerPadY: 8,
    sectionGap: 4, blockPadY: 4.5, metaValuePx: 8.5, metaLabelPx: 7.5,
    tableHeadPx: 7, rowPadY: 2.5, rowTextPx: 8, rowLeading: 1.2,
    paymentRowGap: 5, paymentLabelPx: 8, paymentLineH: 9,
    termsPx: 8, disclaimerPx: 10
  },
  ultra: {
    key: 'ultra', columns: BILL_COLUMNS,
    logoPx: 54, brandPx: 18, taglinePx: 6.5, qrPx: 66, qrLabelPx: 5, headerPadY: 6,
    sectionGap: 3, blockPadY: 3.5, metaValuePx: 8, metaLabelPx: 7,
    tableHeadPx: 6.5, rowPadY: 1.5, rowTextPx: 7, rowLeading: 1.15,
    paymentRowGap: 4, paymentLabelPx: 7.5, paymentLineH: 8,
    termsPx: 7.5, disclaimerPx: 9.5
  }
};

export function densityTokens(key: BillDensity): BillDensityTokens {
  return TOKENS[key] || TOKENS.normal;
}

/** The next tighter tier, or null when already at the floor. */
export function tighterDensity(key: BillDensity): BillDensity | null {
  const i = DENSITY_ORDER.indexOf(key);
  return i >= 0 && i < DENSITY_ORDER.length - 1 ? DENSITY_ORDER[i + 1] : null;
}

/**
 * How many wrapped text lines a garment's row needs: exactly one.
 *
 * Remarks were the last cell on this document that wrapped. With that column
 * gone, S.No., garment, quantity and the blank amount line are each a single
 * line, so a row's height no longer depends on its content at all. The
 * signature is kept because the sheet planner and its tests speak in lines,
 * and because a future wrapping column would be measured here.
 *
 * Reads no measurement field, and now no remark either.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function billRowLines(_item: OrderItem, _snapshot: Partial<MeasurementRecord>): number {
  return 1;
}

/**
 * Total wrapped lines the garment table must hold. This — not the row count —
 * is what actually consumes the sheet: three richly-described garments can
 * easily outweigh eight bare ones.
 */
export function billTextLoad(items: OrderItem[], snapshot: Partial<MeasurementRecord>): number {
  return items.reduce((sum, item) => sum + billRowLines(item, snapshot), 0);
}

export interface OrderBillPlan {
  /** Every garment on the order, in order, each with its printed S.No. */
  items: { item: OrderItem; originalIndex: number }[];
  /** Wrapped-line total the table must carry. Diagnostic only — the density
   *  actually used comes from measuring the rendered sheet, not from this. */
  textLoad: number;
}

/**
 * Plans the single sheet. Every valid garment is included — nothing is ever
 * dropped or deferred to a second page, because there is no second page.
 */
export function planOrderBill(
  order: Order | null,
  snapshot: Partial<MeasurementRecord> = {}
): OrderBillPlan {
  const rawItems = Array.isArray(order?.items) ? order!.items : [];
  const items = rawItems
    .filter(item => item && typeof item === 'object')
    .map((item, idx) => ({ item, originalIndex: idx }));

  return { items, textLoad: billTextLoad(items.map(e => e.item), snapshot) };
}
