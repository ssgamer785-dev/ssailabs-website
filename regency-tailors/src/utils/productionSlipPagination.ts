import { Order, OrderItem, MeasurementRecord } from '../types';
import { garmentMeasurementBlocks, garmentRemarkFor } from './garmentMeasurements';

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
 * measurement categories, how many rows of cells those categories need, how
 * long its remark is — rather than from a flat "single or dual table"
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

/* Per-garment structure, measured the same way: each band was read off the
 * rendered block under print media, and every constant is set a little above
 * its measured value so the prediction errs tall. Erring tall costs at worst
 * an early page break; erring short clips a measurement off the sheet. */
const BLOCK_BORDER_MM = 0.8;        // the block's own rules (measured 0.79)
const BLOCK_HEADER_MM = 5.9;        // the black "#N GARMENT ... Qty" bar (measured 5.82)
const REMARKS_ROW_MM = 4.85;        // the always-printed remarks band, one line (measured 4.78)
const REMARKS_WRAP_MM = 3.5;        // each extra line of the remark (measured 3.456)
const REMARKS_CHARS_PER_LINE = 110; // the band held 129 characters of workshop prose on
                                    // one line; 110 leaves room for a wider substituted face
const CATEGORY_TITLE_MM = 5.05;     // the black measurement-category bar (measured 4.70)
const MEASUREMENT_ROW_MM = 4.05;    // one row of five inline label/value cells (measured 3.97)
const MEASUREMENT_COLUMNS = 5;      // must match ProductionSlipProductCard

export const A4_PAGE_BUDGET_MM = {
  printable: PRINTABLE_HEIGHT_MM,
  firstPage: PRINTABLE_HEIGHT_MM - MASTER_HEADER_MM - FOOTER_MM,
  continuationPage: PRINTABLE_HEIGHT_MM - CONTINUATION_HEADER_MM - FOOTER_MM,
  notesBlock: NOTES_BLOCK_MM
};

/**
 * Lines the remark occupies in the slip's remarks column.
 *
 * The band renders with `whitespace-pre-wrap`, so a newline the counter hand
 * typed is a hard break on paper. Counting only characters would price a
 * three-line remark of thirty characters as one line and clip the rest, so
 * each hard-broken paragraph is wrapped on its own.
 */
function remarkLines(text: string): number {
  const trimmed = (text || '').trim();
  if (!trimmed) return 0;
  return trimmed
    .split('\n')
    .reduce((sum, para) => sum + Math.max(1, Math.ceil(para.trim().length / REMARKS_CHARS_PER_LINE)), 0);
}

/**
 * Height a garment's block occupies on paper, in millimetres, derived from the
 * content it will actually render. Needs the measurement snapshot because the
 * number of measurement categories — and therefore rows — depends on which
 * garment it is, and because the remark may be recorded against the snapshot
 * rather than the line item.
 *
 * The block is header + measurements + remarks, in that order and nothing
 * else. Fabric, style/cut and garment notes used to be charged here; they are
 * no longer collected or printed, so charging for them would reserve paper the
 * slip never uses and split a one-sheet order across two.
 */
export function getGarmentCardHeightMm(
  item: OrderItem,
  snapshot: Partial<MeasurementRecord> = {}
): number {
  let height = BLOCK_HEADER_MM + BLOCK_BORDER_MM;

  // Measurement categories, each a title bar plus however many cell rows the
  // garment's field list needs at five columns.
  for (const category of garmentMeasurementBlocks(item, snapshot)) {
    const rows = Math.ceil(category.fields.length / MEASUREMENT_COLUMNS);
    height += CATEGORY_TITLE_MM + rows * MEASUREMENT_ROW_MM;
  }

  // The remarks band always prints — with the garment's remark, or with a
  // single ruled line for the workshop to write an adjustment on — so it is
  // always charged. Resolved through the same helper the card uses, so a
  // remark stored on the snapshot is measured, not missed.
  const extraLines = Math.max(0, remarkLines(garmentRemarkFor(item, snapshot)) - 1);
  height += REMARKS_ROW_MM + extraLines * REMARKS_WRAP_MM;

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
 * 5. Once the page count is fixed, the garments are spread evenly across those
 *    pages rather than packed greedily into the first. Greedy packing is what
 *    made an eight-garment order print five garments on a full sheet and three
 *    on a sheet that was three-quarters empty; worse, the sheet's density
 *    auto-fit is governed by the fullest sheet, so cramming sheet one held the
 *    whole document at its tightest type size. Levelling the load lets every
 *    sheet print larger.
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

  const heights = itemsWithIndex.map(entry => getGarmentCardHeightMm(entry.item, snapshot));

  /**
   * Fills pages in order, never exceeding a page's own capacity nor the soft
   * ceiling `softCapMm`. Garment order is preserved — a slip whose garments do
   * not run 1, 2, 3 down the page is a slip a cutter can misread.
   */
  const packWith = (softCapMm: number) => {
    const pages: { items: { item: OrderItem; originalIndex: number }[]; usedMm: number }[] = [];
    let current: { item: OrderItem; originalIndex: number }[] = [];
    let usedMm = 0;

    itemsWithIndex.forEach((entry, i) => {
      const cardMm = heights[i];
      const gap = current.length > 0 ? BLOCK_GAP_MM : 0;
      // A single garment taller than the ceiling still has to go somewhere, so
      // the page's true capacity always wins over the soft ceiling.
      const limit = Math.max(Math.min(softCapMm, capacityFor(pages.length)), cardMm);

      if (current.length > 0 && usedMm + gap + cardMm > limit) {
        pages.push({ items: current, usedMm });
        current = [entry];
        usedMm = cardMm;
      } else {
        current.push(entry);
        usedMm += gap + cardMm;
      }
    });

    if (current.length > 0) pages.push({ items: current, usedMm });
    return pages;
  };

  // Pass one: pack to the real page capacity to learn the minimum sheet count.
  const greedy = packWith(Infinity);
  const minPages = greedy.length;

  /*
   * Pass two: find the lowest ceiling that still fits in that many sheets, so
   * the load is as level as it can be without costing a sheet. Binary search
   * over millimetres — monotonic, because a higher ceiling never needs more
   * pages — and bounded to a fixed number of steps rather than a tolerance, so
   * it cannot spin on a pathological order.
   */
  let rawPages = greedy;
  if (minPages > 1) {
    let low = Math.max(...heights);
    let high = heights.reduce((a, b) => a + b, 0) + BLOCK_GAP_MM * (heights.length - 1);
    for (let step = 0; step < 24 && high - low > 0.05; step++) {
      const mid = (low + high) / 2;
      const packed = packWith(mid);
      if (packed.length <= minPages) {
        high = mid;
        rawPages = packed;
      } else {
        low = mid;
      }
    }
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
