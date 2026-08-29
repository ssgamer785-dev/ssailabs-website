import { Order, OrderItem, MeasurementRecord } from '../types';
import { garmentMeasurementBlocks } from './garmentMeasurements';

export interface ProductionSlipPageData {
  pageIndex: number; // 0-based
  totalPages: number;
  isFirstPage: boolean;
  isLastPage: boolean;
  items: { item: OrderItem; originalIndex: number }[];
  showSpecialInstructions: boolean;
  showProductionNotes: boolean;
}

/* ---------------------------------------------------------------------------
 * A4 page budget, in millimetres.
 *
 * Every figure below was measured from the rendered slip under print media at
 * the true A4 content width (186mm), not estimated.
 *
 * The height of a garment is derived from what it actually contains — how many
 * detail lines it has, how many measurement categories, how many rows of cells
 * those categories need — rather than from a flat "single or dual table"
 * constant. The old flat model charged every coat the same 128mm whether it
 * carried two recorded measurements or ten, which is what made a five-garment
 * order claim five sheets.
 *
 * @page uses `margin: 10mm 12mm`, leaving 297 - 20 = 277mm of printable height.
 * ------------------------------------------------------------------------- */
const PRINTABLE_HEIGHT_MM = 277;

/* Page bands, read from the rendered sheet under print media. Each carries a
 * small margin over its measured value for font-substitution drift. */
const MASTER_HEADER_MM = 18.2;     // brand bar + 5-column meta strip (measured 17.56)
const CONTINUATION_HEADER_MM = 8;  // single-line header on later sheets (measured 6.4)
const FOOTER_MM = 4.6;             // per-sheet footer rule (measured 4.23)
const NOTES_BLOCK_MM = 27;         // special instructions + production notes (measured 24.6)
const BLOCK_GAP_MM = 1.7;          // vertical gap between garment blocks

/* Per-garment structure, measured the same way. Validated against three real
 * garments: predicted 33.06 / 46.76 / 53.90 against actual 33.85 / 47.02 /
 * 54.16, the residual being the block's own border. */
const BLOCK_BORDER_MM = 0.8;       // the block's top and bottom rule
const BLOCK_HEADER_MM = 5.9;       // the black "#N GARMENT ... Qty" bar (measured 5.82)
const DETAIL_ROW_MM = 4.85;        // one Fabric / Style / Notes / Remarks row (measured 4.78)
const DETAIL_WRAP_MM = 2.45;       // each extra wrapped line of a detail value (measured 2.36)
const DETAIL_CHARS_PER_LINE = 95;  // value column capacity; deliberately a slight
                                   // under-estimate, so the prediction errs tall
const CATEGORY_TITLE_MM = 5.05;    // the black measurement-category bar (measured 4.96)
const MEASUREMENT_ROW_MM = 4.05;   // one row of five inline label/value cells (measured 3.97)
const MEASUREMENT_COLUMNS = 5;     // must match ProductionSlipProductCard

export const A4_PAGE_BUDGET_MM = {
  printable: PRINTABLE_HEIGHT_MM,
  firstPage: PRINTABLE_HEIGHT_MM - MASTER_HEADER_MM - FOOTER_MM,
  continuationPage: PRINTABLE_HEIGHT_MM - CONTINUATION_HEADER_MM - FOOTER_MM,
  notesBlock: NOTES_BLOCK_MM
};

/** Wrapped lines a detail value needs in the slip's value column. */
function detailLines(text: string): number {
  const trimmed = (text || '').trim();
  return trimmed ? Math.max(1, Math.ceil(trimmed.length / DETAIL_CHARS_PER_LINE)) : 0;
}

/**
 * Height a garment's block occupies on paper, in millimetres, derived from the
 * content it will actually render. Needs the measurement snapshot because the
 * number of measurement categories — and therefore rows — depends on which
 * garment it is.
 */
export function getGarmentCardHeightMm(
  item: OrderItem,
  snapshot: Partial<MeasurementRecord> = {}
): number {
  let height = BLOCK_HEADER_MM + BLOCK_BORDER_MM;

  // Detail rows: only the ones the card will actually print.
  const fabric = `${item?.fabricName || ''} ${item?.fabricCode || ''}`.trim();
  const style = (item?.styleNotes || item?.notes || '').trim();
  const special = (item?.specialInstructions || '').trim();
  const remarks = typeof item?.remarks === 'string' ? item.remarks.trim() : '';

  for (const value of [fabric, style, special !== style ? special : '', remarks]) {
    const lines = detailLines(value);
    if (lines > 0) height += DETAIL_ROW_MM + (lines - 1) * DETAIL_WRAP_MM;
  }

  // Measurement categories, each a title bar plus however many cell rows the
  // garment's field list needs at five columns.
  for (const category of garmentMeasurementBlocks(item, snapshot)) {
    const rows = Math.ceil(category.fields.length / MEASUREMENT_COLUMNS);
    height += CATEGORY_TITLE_MM + rows * MEASUREMENT_ROW_MM;
  }

  return height;
}

/**
 * Retained for backwards compatibility with the original unit-based API.
 * One "unit" is roughly one modest single-category garment block.
 */
export function getGarmentSpatialWeight(item: OrderItem): number {
  return getGarmentCardHeightMm(item) / 30;
}

/**
 * Splits an order's garments across A4 portrait pages.
 *
 * Rules:
 * 1. A garment block is never split across pages — half a measurement table on
 *    the next sheet is how a cutter reads the wrong number.
 * 2. Page 1 carries the full header; later pages carry a one-line one.
 * 3. The final page reserves room for the order-level notes.
 * 4. A page is only filled to the real printable height, so what the modal
 *    reports as "2 pages" is what the printer produces.
 */
export function paginateProductionSlip(
  order: Order,
  snapshot: Partial<MeasurementRecord> = order?.measurementsSnapshot || {}
): ProductionSlipPageData[] {
  const items = Array.isArray(order?.items) ? order.items : [];
  const itemsWithIndex = items
    .filter(item => item && typeof item === 'object')
    .map((item, idx) => ({ item, originalIndex: idx }));

  if (itemsWithIndex.length === 0) {
    return [
      {
        pageIndex: 0,
        totalPages: 1,
        isFirstPage: true,
        isLastPage: true,
        items: [],
        showSpecialInstructions: true,
        showProductionNotes: true
      }
    ];
  }

  const capacityFor = (pageIndex: number) =>
    pageIndex === 0 ? A4_PAGE_BUDGET_MM.firstPage : A4_PAGE_BUDGET_MM.continuationPage;

  const rawPages: { items: { item: OrderItem; originalIndex: number }[]; usedMm: number }[] = [];
  let current: { item: OrderItem; originalIndex: number }[] = [];
  let usedMm = 0;

  for (const entry of itemsWithIndex) {
    const cardMm = getGarmentCardHeightMm(entry.item, snapshot);
    const gap = current.length > 0 ? BLOCK_GAP_MM : 0;
    const capacity = capacityFor(rawPages.length);

    if (current.length > 0 && usedMm + gap + cardMm > capacity) {
      rawPages.push({ items: current, usedMm });
      current = [entry];
      usedMm = cardMm;
    } else {
      current.push(entry);
      usedMm += gap + cardMm;
    }
  }

  if (current.length > 0) {
    rawPages.push({ items: current, usedMm });
  }

  // The order-level notes live on the final page. If they do not fit, move the
  // last garment forward rather than letting the block overflow. Only reserve
  // the room when there is actually something to print there.
  const hasNotes = Boolean(
    (order?.specialInstructions || order?.notes || '').trim() ||
      (order?.productionNotes || '').trim() ||
      (snapshot?.fittingNotes || order?.fittingNotes || '').trim()
  );

  if (hasNotes) {
    const lastIdx = rawPages.length - 1;
    const lastPage = rawPages[lastIdx];
    const lastCapacity = capacityFor(lastIdx);

    if (lastPage.usedMm + BLOCK_GAP_MM + A4_PAGE_BUDGET_MM.notesBlock > lastCapacity) {
      if (lastPage.items.length > 1) {
        const moved = lastPage.items.pop()!;
        lastPage.usedMm -= getGarmentCardHeightMm(moved.item, snapshot) + BLOCK_GAP_MM;
        rawPages.push({
          items: [moved],
          usedMm: getGarmentCardHeightMm(moved.item, snapshot)
        });
      } else {
        // A single oversized garment already fills the page — give the notes a
        // sheet of their own instead of clipping them.
        rawPages.push({ items: [], usedMm: 0 });
      }
    }
  }

  const totalPages = rawPages.length;

  return rawPages.map((page, idx) => ({
    pageIndex: idx,
    totalPages,
    isFirstPage: idx === 0,
    isLastPage: idx === totalPages - 1,
    items: page.items,
    showSpecialInstructions: idx === totalPages - 1,
    showProductionNotes: idx === totalPages - 1
  }));
}
