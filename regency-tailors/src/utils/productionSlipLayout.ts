/**
 * Density tiers for the workshop production slip.
 *
 * The slip carries far less per garment than it used to — fabric, style/cut
 * and garment notes are no longer collected, so a five-garment order that once
 * filled a sheet now leaves roughly a third of it blank. Blank paper is wasted
 * paper on a document a cutter reads at arm's length across a bench, so the
 * sheet is filled by scaling the type and the row spacing up rather than by
 * inventing content to sit in the gap.
 *
 * The tiers work exactly like the customer bill's: the page renders at the
 * loosest tier and steps down only when a real measured overflow says it must,
 * so the tier that survives is the loosest one that actually fits. Nothing is
 * guessed from the garment count.
 *
 * `dense` is the floor and is deliberately identical to the compact layout
 * that was measured and approved — which is also the layout
 * productionSlipPagination.ts charges for. Pagination therefore always plans
 * against the tightest rendering, and density only ever spends slack that
 * pagination already proved was there.
 */

export type SlipDensity = 'roomy' | 'normal' | 'compact' | 'dense';

/** Loosest first. The auto-fit walks this in order. */
export const SLIP_DENSITY_ORDER: SlipDensity[] = ['roomy', 'normal', 'compact', 'dense'];

/** Every slip starts here and is tightened only by measurement. */
export const INITIAL_SLIP_DENSITY: SlipDensity = SLIP_DENSITY_ORDER[0];

export interface SlipDensityTokens {
  key: SlipDensity;
  /** Gap between garment blocks, and between them and the notes, in px. */
  blockGapPx: number;
  /** "#N GARMENT" bar. */
  headPx: number;
  headPadY: number;
  qtyPx: number;
  /** Black measurement-category bar. */
  catPx: number;
  catSubPx: number;
  catPadY: number;
  /** Measurement cells. */
  labelPx: number;
  valuePx: number;
  cellPadY: number;
  /** Remarks band. */
  remarkLabelPx: number;
  remarkPx: number;
  remarkPadY: number;
  /** Height of the ruled line printed when no remark was recorded. */
  remarkRulePx: number;
  /** Order-level notes on the final sheet. */
  noteHeadPx: number;
  notePx: number;
  notePadY: number;
}

const TOKENS: Record<SlipDensity, SlipDensityTokens> = {
  roomy: {
    key: 'roomy',
    blockGapPx: 12,
    headPx: 15, headPadY: 6, qtyPx: 12,
    catPx: 10, catSubPx: 8.5, catPadY: 4,
    labelPx: 9, valuePx: 13, cellPadY: 6.5,
    remarkLabelPx: 9, remarkPx: 11.5, remarkPadY: 5, remarkRulePx: 16,
    noteHeadPx: 10, notePx: 11.5, notePadY: 6
  },
  normal: {
    key: 'normal',
    blockGapPx: 10,
    headPx: 14, headPadY: 5, qtyPx: 11,
    catPx: 9.5, catSubPx: 8, catPadY: 3,
    labelPx: 8.5, valuePx: 12, cellPadY: 4.5,
    remarkLabelPx: 8.5, remarkPx: 10.5, remarkPadY: 4, remarkRulePx: 13,
    noteHeadPx: 9.5, notePx: 10.5, notePadY: 5
  },
  compact: {
    key: 'compact',
    blockGapPx: 8,
    headPx: 13, headPadY: 4, qtyPx: 10.5,
    catPx: 9, catSubPx: 7.5, catPadY: 2.5,
    labelPx: 8, valuePx: 11, cellPadY: 3,
    remarkLabelPx: 8, remarkPx: 10, remarkPadY: 3, remarkRulePx: 11,
    noteHeadPx: 9, notePx: 10, notePadY: 4
  },
  /* The floor: the exact compact layout the pagination model is calibrated
   * against. Do not tighten these without re-measuring that model. */
  dense: {
    key: 'dense',
    blockGapPx: 6,
    headPx: 12, headPadY: 3, qtyPx: 10,
    catPx: 8.5, catSubPx: 7.5, catPadY: 2,
    labelPx: 7.5, valuePx: 10, cellPadY: 2,
    remarkLabelPx: 7.5, remarkPx: 9.5, remarkPadY: 2, remarkRulePx: 10,
    noteHeadPx: 8.5, notePx: 9.5, notePadY: 3
  }
};

export function slipDensityTokens(key: SlipDensity): SlipDensityTokens {
  return TOKENS[key] || TOKENS.dense;
}

/** The next tighter tier, or null when already at the floor. */
export function tighterSlipDensity(key: SlipDensity): SlipDensity | null {
  const i = SLIP_DENSITY_ORDER.indexOf(key);
  return i >= 0 && i < SLIP_DENSITY_ORDER.length - 1 ? SLIP_DENSITY_ORDER[i + 1] : null;
}
