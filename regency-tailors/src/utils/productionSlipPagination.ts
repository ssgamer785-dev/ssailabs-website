import { Order, OrderItem } from '../types';

export interface ProductionSlipPageData {
  pageIndex: number; // 0-based
  totalPages: number;
  isFirstPage: boolean;
  isLastPage: boolean;
  items: { item: OrderItem; originalIndex: number }[];
  showSpecialInstructions: boolean;
  showProductionNotes: boolean;
  showArtisanSignOff: boolean;
}

/* ---------------------------------------------------------------------------
 * A4 page budget, in millimetres.
 *
 * These figures were measured from the rendered slip under print media at A4
 * width (see `e2e/production-slip-print.mjs`), not estimated. The previous
 * abstract "spatial weight" units under-counted a garment card by roughly a
 * third, so a page the app labelled "Page 2 of 4" was ~295mm tall and spilled
 * onto a sixth sheet with the overflow cut in half.
 *
 * @page uses `margin: 10mm 12mm`, leaving 297 - 20 = 277mm of printable height.
 * ------------------------------------------------------------------------- */
const PRINTABLE_HEIGHT_MM = 277;
const MASTER_HEADER_MM = 38;        // page 1 workshop header + meta grid (measured 36.2)
const CONTINUATION_HEADER_MM = 20;  // compact continuation header (measured 18.9)
const FOOTER_MM = 9;                // per-page footer (measured 7.4)
const SUMMARY_BLOCK_MM = 52;        // instructions + production notes + sign-off (measured 50.1)
const CARD_GAP_MM = 5;              // vertical space between garment cards

const CARD_SINGLE_MM = 128;         // one measurement table  (measured 126.1)
const CARD_DUAL_MM = 176;           // two measurement tables (measured 171.8 - 174.7)
const REMARK_OVERFLOW_MM = 6;       // per extra wrapped line of remarks
const REMARK_CHARS_PER_LINE = 90;

export const A4_PAGE_BUDGET_MM = {
  printable: PRINTABLE_HEIGHT_MM,
  firstPage: PRINTABLE_HEIGHT_MM - MASTER_HEADER_MM - FOOTER_MM,
  continuationPage: PRINTABLE_HEIGHT_MM - CONTINUATION_HEADER_MM - FOOTER_MM,
  summaryBlock: SUMMARY_BLOCK_MM
};

/**
 * Height a garment card occupies on paper, in millimetres.
 *
 * Garments that carry two measurement tables (a suit's coat + pant, a kurta
 * pajama set) are roughly 40% taller than a single-table garment.
 */
export function getGarmentCardHeightMm(item: OrderItem): number {
  const gType = (item?.garmentType || '').toLowerCase().trim();
  const isSuit = gType.includes('suit') || gType.includes('full coat pant');
  const isSet = gType.includes('set') || (gType.includes('kurta') && (gType.includes('pajama') || gType.includes('pyjama')));
  const isSherwaniWithBottom =
    gType.includes('sherwani') && (gType.includes('pant') || gType.includes('churidar') || gType.includes('pajama'));

  let height = isSuit || isSet || isSherwaniWithBottom ? CARD_DUAL_MM : CARD_SINGLE_MM;

  // The remarks box grows with its text; budget for every line past the first.
  const remarkLength = typeof item?.remarks === 'string' ? item.remarks.trim().length : 0;
  if (remarkLength > REMARK_CHARS_PER_LINE) {
    height += Math.ceil((remarkLength - REMARK_CHARS_PER_LINE) / REMARK_CHARS_PER_LINE) * REMARK_OVERFLOW_MM;
  }

  return height;
}

/**
 * Retained for backwards compatibility with the original unit-based API.
 * One "unit" was roughly one single-table garment card.
 */
export function getGarmentSpatialWeight(item: OrderItem): number {
  return getGarmentCardHeightMm(item) / CARD_SINGLE_MM;
}

/**
 * Splits an order's garments across A4 portrait pages.
 *
 * Rules:
 * 1. A garment card is never split across pages.
 * 2. Page 1 carries the full master header; later pages carry a compact one.
 * 3. The final page reserves room for special instructions, production notes
 *    and the master-cutter sign-off.
 * 4. A page is only filled to the real printable height, so what the modal
 *    reports as "4 pages" is what the printer produces.
 */
export function paginateProductionSlip(order: Order): ProductionSlipPageData[] {
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
        showProductionNotes: true,
        showArtisanSignOff: true
      }
    ];
  }

  const capacityFor = (pageIndex: number) =>
    pageIndex === 0 ? A4_PAGE_BUDGET_MM.firstPage : A4_PAGE_BUDGET_MM.continuationPage;

  const rawPages: { items: { item: OrderItem; originalIndex: number }[]; usedMm: number }[] = [];
  let current: { item: OrderItem; originalIndex: number }[] = [];
  let usedMm = 0;

  for (const entry of itemsWithIndex) {
    const cardMm = getGarmentCardHeightMm(entry.item);
    const gap = current.length > 0 ? CARD_GAP_MM : 0;
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

  // The closing summary block lives on the final page. If it does not fit,
  // move the last garment forward rather than letting the block overflow.
  const lastIdx = rawPages.length - 1;
  const lastPage = rawPages[lastIdx];
  const lastCapacity = capacityFor(lastIdx);

  if (lastPage.usedMm + CARD_GAP_MM + A4_PAGE_BUDGET_MM.summaryBlock > lastCapacity) {
    if (lastPage.items.length > 1) {
      const moved = lastPage.items.pop()!;
      lastPage.usedMm -= getGarmentCardHeightMm(moved.item) + CARD_GAP_MM;
      rawPages.push({ items: [moved], usedMm: getGarmentCardHeightMm(moved.item) });
    } else {
      // A single oversized garment already fills the page — give the summary
      // block a sheet of its own instead of clipping it.
      rawPages.push({ items: [], usedMm: 0 });
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
    showProductionNotes: idx === totalPages - 1,
    showArtisanSignOff: idx === totalPages - 1
  }));
}
