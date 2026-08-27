import { Order, OrderItem, MeasurementRecord } from '../types';
import { garmentRemarkFor } from './garmentMeasurements';

/**
 * Splits the customer bill across A4 portrait sheets.
 *
 * Same measured-millimetre approach as the production slip: every constant
 * below was read from the rendered document under print media at the true A4
 * content width (186mm) — including a calibration pass across eight rows with
 * remark text from 0 to 160 characters, fitting row growth to real wrapped
 * lines rather than assumed ones — not guessed. A garment row is never split
 * down the middle.
 *
 * This document carries no measurements, so row height depends only on how
 * much description, fabric and remark text a garment actually has — never on
 * measurement tables, which the bill does not render at all.
 */

export interface OrderBillPageData {
  pageIndex: number;
  totalPages: number;
  isFirstPage: boolean;
  isLastPage: boolean;
  items: { item: OrderItem; originalIndex: number }[];
  showClosing: boolean;
}

/* @page uses margin: 10mm 12mm, leaving 297 - 20 = 277mm of printable height. */
const PRINTABLE_HEIGHT_MM = 277;

// Header/table/footer/closing bands — measured directly (see calibration note
// above). Margins are sized by how much a component's real height can move
// with font substitution: a fixed navy bar with a heading barely shifts, so it
// keeps a thin margin; the closing block contains wrapped paragraph text (the
// terms bullets, order notes) and keeps a fuller one. Stacking a generous
// margin on every one of four components compounded into ~10mm of unearned
// overhead in testing — enough to force even a single-garment bill onto a
// second page for no real reason — so these are deliberately not all rounded
// up by the same amount.
const MASTER_HEADER_MM = 137;      // premium brand band + customer/order blocks (measured 135.4)
const CONTINUATION_HEADER_MM = 16; // compact band on later sheets (measured 14.8)
const TABLE_HEADER_MM = 22;        // "Product/Garment Details" label + table's navy header row (measured 21.3)
const FOOTER_MM = 8.5;             // per-sheet footer bar (measured 7.8)
const CLOSING_BLOCK_MM = 97;       // notes + payment lines + terms + signatures + disclaimer (measured 94.5)

// Row growth, fitted to eight measured rows (remark length 0 → 160 chars,
// row height 8.665mm → 33.6mm): a flat base for one line, then a fixed
// per-line increment for the tallest cell in the row. Every fitted point in
// the calibration came out at or slightly above this line — the safe
// direction, since production uses Manrope rather than this sandbox's
// fallback font and a narrower font would need fewer, not more, lines.
const ROW_BASE_MM = 9;
const LINE_HEIGHT_MM = 3.8;
const DESCRIPTION_CHARS_PER_LINE = 20; // ~23% column width — matches the measured remark column
const REMARK_CHARS_PER_LINE = 20;      // ~22% column width — the column the calibration measured directly
const FABRIC_CHARS_PER_LINE = 13;      // ~15% column width, scaled proportionally from the above

export const A4_BILL_BUDGET_MM = {
  printable: PRINTABLE_HEIGHT_MM,
  firstPage: PRINTABLE_HEIGHT_MM - MASTER_HEADER_MM - TABLE_HEADER_MM - FOOTER_MM,
  continuationPage: PRINTABLE_HEIGHT_MM - CONTINUATION_HEADER_MM - TABLE_HEADER_MM - FOOTER_MM,
  closingBlock: CLOSING_BLOCK_MM
};

/** Wrapped lines a piece of text needs at a given column's character capacity. */
function linesFor(text: string, charsPerLine: number): number {
  const trimmed = (text || '').trim();
  return trimmed ? Math.max(1, Math.ceil(trimmed.length / charsPerLine)) : 1;
}

/** Height a garment's table row occupies on paper, derived from its content. */
export function getBillRowHeightMm(item: OrderItem, snapshot: Partial<MeasurementRecord>): number {
  const styleText = (item?.styleNotes || item?.notes || '').trim();
  const specialText = (item?.specialInstructions || '').trim();
  const descriptionLines =
    styleText && specialText && styleText !== specialText
      ? linesFor(styleText, DESCRIPTION_CHARS_PER_LINE) + linesFor(specialText, DESCRIPTION_CHARS_PER_LINE)
      : linesFor(styleText || specialText, DESCRIPTION_CHARS_PER_LINE);

  const fabricName = (item?.fabricName || '').trim();
  const fabricCode = (item?.fabricCode || '').trim();
  const fabricLines = fabricName ? linesFor(fabricName, FABRIC_CHARS_PER_LINE) + (fabricCode ? 1 : 0) : 1;

  const remarkLines = linesFor(garmentRemarkFor(item, snapshot), REMARK_CHARS_PER_LINE);

  const tallestLines = Math.max(descriptionLines, fabricLines, remarkLines, 1);
  return ROW_BASE_MM + (tallestLines - 1) * LINE_HEIGHT_MM;
}

/** Retained name for readability at call sites; a "card" here is a table row. */
export const getBillCardHeightMm = getBillRowHeightMm;

export function paginateOrderBill(
  order: Order | null,
  snapshot: Partial<MeasurementRecord> = {}
): OrderBillPageData[] {
  const items = Array.isArray(order?.items) ? order!.items : [];
  const entries = items
    .filter(item => item && typeof item === 'object')
    .map((item, idx) => ({ item, originalIndex: idx }));

  if (entries.length === 0) {
    return [{ pageIndex: 0, totalPages: 1, isFirstPage: true, isLastPage: true, items: [], showClosing: true }];
  }

  const capacityFor = (pageIndex: number) =>
    pageIndex === 0 ? A4_BILL_BUDGET_MM.firstPage : A4_BILL_BUDGET_MM.continuationPage;

  const pages: { items: { item: OrderItem; originalIndex: number }[]; usedMm: number }[] = [];
  let current: { item: OrderItem; originalIndex: number }[] = [];
  let usedMm = 0;

  for (const entry of entries) {
    const rowMm = getBillRowHeightMm(entry.item, snapshot);

    if (current.length > 0 && usedMm + rowMm > capacityFor(pages.length)) {
      pages.push({ items: current, usedMm });
      current = [entry];
      usedMm = rowMm;
    } else {
      current.push(entry);
      usedMm += rowMm;
    }
  }
  if (current.length > 0) pages.push({ items: current, usedMm });

  // The closing block (payment lines, terms, signatures, disclaimer) lives on
  // the final sheet. Give it its own sheet rather than letting it overflow.
  const lastIndex = pages.length - 1;
  const last = pages[lastIndex];
  if (last.usedMm + A4_BILL_BUDGET_MM.closingBlock > capacityFor(lastIndex)) {
    if (last.items.length > 1) {
      const moved = last.items.pop()!;
      last.usedMm -= getBillRowHeightMm(moved.item, snapshot);
      pages.push({ items: [moved], usedMm: getBillRowHeightMm(moved.item, snapshot) });
    } else {
      pages.push({ items: [], usedMm: 0 });
    }
  }

  const totalPages = pages.length;
  return pages.map((page, idx) => ({
    pageIndex: idx,
    totalPages,
    isFirstPage: idx === 0,
    isLastPage: idx === totalPages - 1,
    items: page.items,
    showClosing: idx === totalPages - 1
  }));
}
