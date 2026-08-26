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

/**
 * Calculates the relative visual / spatial weight of a garment for A4 page budgeting.
 * Garments with multiple measurement tables (e.g. 2-Piece Suit, Kurta Pajama set) require more space.
 */
export function getGarmentSpatialWeight(item: OrderItem): number {
  const gType = (item.garmentType || '').toLowerCase().trim();
  const isSuit = gType.includes('suit') || gType.includes('full coat pant');
  const isSet = gType.includes('set') || (gType.includes('kurta') && (gType.includes('pajama') || gType.includes('pyjama')));
  const isSherwaniWithBottom = gType.includes('sherwani') && (gType.includes('pant') || gType.includes('churidar') || gType.includes('pajama'));

  let weight = 1.0; // Single measurement category (Coat, Pant, Shirt, Kurta, Pajama)
  if (isSuit || isSet || isSherwaniWithBottom) {
    weight = 1.45; // Dual measurement category (Coat + Pant, Kurta + Pajama)
  }

  // If item has long remarks (> 60 chars), add slight extra weight to ensure comfortable A4 layout
  if (item.remarks && item.remarks.trim().length > 60) {
    weight += 0.25;
  }

  return weight;
}

/**
 * Intelligently paginates an order's garments across A4 portrait pages.
 * 
 * Rules:
 * 1. Page 1 accommodates the full Regency Tailors Workshop Master Header, Order & Customer Meta Grid,
 *    and Production Status bar (Capacity ~ 2.1 units).
 * 2. Continuation pages (Page 2, 3, etc.) feature a compact continuation header (Capacity ~ 2.7 units).
 * 3. Final summary elements (Special Instructions, Internal Notes, Artisan Sign-off) require ~0.75 units.
 * 4. Garments are kept strictly intact within their logical cards and never split across pages.
 */
export function paginateProductionSlip(order: Order): ProductionSlipPageData[] {
  const items = order.items || [];
  const itemsWithIndex = items.map((item, idx) => ({ item, originalIndex: idx }));

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

  const rawPages: { items: { item: OrderItem; originalIndex: number }[] }[] = [];
  let currentPageItems: { item: OrderItem; originalIndex: number }[] = [];
  let currentCapacity = 2.15; // Page 1 budget
  let currentUsed = 0;

  for (let i = 0; i < itemsWithIndex.length; i++) {
    const currentItem = itemsWithIndex[i];
    const weight = getGarmentSpatialWeight(currentItem.item);

    // If adding this garment would overflow the page and we already have at least 1 garment on it
    if (currentPageItems.length > 0 && (currentUsed + weight > currentCapacity)) {
      rawPages.push({ items: currentPageItems });
      currentPageItems = [currentItem];
      currentCapacity = 2.75; // Continuation page budget
      currentUsed = weight;
    } else {
      currentPageItems.push(currentItem);
      currentUsed += weight;
    }
  }

  if (currentPageItems.length > 0) {
    rawPages.push({ items: currentPageItems });
  }

  // Ensure the final page has sufficient room for Special Instructions + Notes + Sign-off (~0.75)
  const lastPageIndex = rawPages.length - 1;
  const lastPage = rawPages[lastPageIndex];
  const lastPageCapacity = rawPages.length === 1 ? 2.15 : 2.75;
  const lastPageItemsWeight = lastPage.items.reduce((sum, it) => sum + getGarmentSpatialWeight(it.item), 0);

  // If last page has multiple items and adding summary causes extreme crowding, shift last item
  if (lastPage.items.length > 1 && (lastPageItemsWeight + 0.75 > lastPageCapacity)) {
    const poppedItem = lastPage.items.pop();
    if (poppedItem) {
      rawPages.push({ items: [poppedItem] });
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
