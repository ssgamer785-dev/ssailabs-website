import { Order, OrderItem, MeasurementRecord } from '../types';
import { garmentMeasurementBlocks, garmentRemarkFor } from './garmentMeasurements';

/**
 * Splits the customer bill across A4 portrait sheets.
 *
 * Same measured-millimetre approach as the production slip: budgets taken from
 * the rendered document rather than guessed, so a bill the screen labels
 * "3 pages" prints as three sheets with nothing clipped. A garment card is
 * never split down the middle.
 */

export interface OrderBillPageData {
  pageIndex: number;
  totalPages: number;
  isFirstPage: boolean;
  isLastPage: boolean;
  items: { item: OrderItem; originalIndex: number }[];
  showClosing: boolean;
}

/* @page uses margin: 10mm 12mm, leaving 297 - 20 = 277mm of printable height.
 *
 * Every figure below was measured from the rendered bill under print media at
 * the true A4 content width (186mm), not estimated, then given a small margin
 * of safety. Guessed budgets either overflow the sheet or leave a third of it
 * blank; these keep the page count honest and the paper full. */
const PRINTABLE_HEIGHT_MM = 277;
const MASTER_HEADER_MM = 88;       // brand band + showroom bar + order/customer blocks (measured 85.2)
const CONTINUATION_HEADER_MM = 18; // compact band (measured 14.8)
const FOOTER_MM = 10;              // per-sheet footer (measured 7.8)
const CLOSING_BLOCK_MM = 58;       // order notes + thank you + signature area
const CARD_GAP_MM = 4;

const CARD_BASE_MM = 14;           // garment heading and padding (measured ~12.7)
const DETAIL_ROW_MM = 8;           // fabric / code / cut, two per row
const MEASUREMENT_TABLE_MM = 6;    // one table's navy heading (measured ~5)
const MEASUREMENT_ROW_MM = 14;     // one row of five cells (measured ~13.5)
const CELLS_PER_ROW = 5;
const REMARK_BASE_MM = 14;
const REMARK_LINE_MM = 5;
const REMARK_CHARS_PER_LINE = 95;

export const A4_BILL_BUDGET_MM = {
  printable: PRINTABLE_HEIGHT_MM,
  firstPage: PRINTABLE_HEIGHT_MM - MASTER_HEADER_MM - FOOTER_MM,
  continuationPage: PRINTABLE_HEIGHT_MM - CONTINUATION_HEADER_MM - FOOTER_MM,
  closingBlock: CLOSING_BLOCK_MM
};

/** Height a garment card occupies on paper, derived from what it will contain. */
export function getBillCardHeightMm(item: OrderItem, snapshot: Partial<MeasurementRecord>): number {
  let height = CARD_BASE_MM;

  // Fabric, code, styling and garment note render two to a row, and only when
  // the showroom actually recorded them.
  const details = [item?.fabricName, item?.fabricCode, item?.styleNotes || item?.notes, item?.specialInstructions]
    .filter(v => typeof v === 'string' && v.trim().length > 0).length;
  if (details > 0) height += Math.ceil(details / 2) * DETAIL_ROW_MM;

  garmentMeasurementBlocks(item, snapshot).forEach(block => {
    height += MEASUREMENT_TABLE_MM + Math.ceil(block.fields.length / CELLS_PER_ROW) * MEASUREMENT_ROW_MM;
  });

  const remark = garmentRemarkFor(item, snapshot);
  if (remark) {
    height += REMARK_BASE_MM + Math.floor(remark.length / REMARK_CHARS_PER_LINE) * REMARK_LINE_MM;
  }

  return height;
}

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
    const cardMm = getBillCardHeightMm(entry.item, snapshot);
    const gap = current.length > 0 ? CARD_GAP_MM : 0;

    if (current.length > 0 && usedMm + gap + cardMm > capacityFor(pages.length)) {
      pages.push({ items: current, usedMm });
      current = [entry];
      usedMm = cardMm;
    } else {
      current.push(entry);
      usedMm += gap + cardMm;
    }
  }
  if (current.length > 0) pages.push({ items: current, usedMm });

  // The closing block lives on the final sheet. Give it its own sheet rather
  // than letting it overflow off the bottom of a full one.
  const lastIndex = pages.length - 1;
  const last = pages[lastIndex];
  if (last.usedMm + CARD_GAP_MM + A4_BILL_BUDGET_MM.closingBlock > capacityFor(lastIndex)) {
    if (last.items.length > 1) {
      const moved = last.items.pop()!;
      last.usedMm -= getBillCardHeightMm(moved.item, snapshot) + CARD_GAP_MM;
      pages.push({ items: [moved], usedMm: getBillCardHeightMm(moved.item, snapshot) });
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
