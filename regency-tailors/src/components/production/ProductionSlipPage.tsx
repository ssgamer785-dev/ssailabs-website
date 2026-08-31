import React, { useLayoutEffect, useRef } from 'react';
import { Order, ProductionStatus, MeasurementRecord } from '../../types';
import { ProductionSlipProductCard } from './ProductionSlipProductCard';
import { ProductionSlipPageData } from '../../utils/productionSlipPagination';
import { SlipDensity, slipDensityTokens } from '../../utils/productionSlipLayout';
import { summariseOrderItems } from '../../utils/productionSlipSummary';
import { SHOWROOM_ADDRESS_LINE1, SHOWROOM_ADDRESS_LINE2 } from '../bills/PrintableRegencyBill';

interface ProductionSlipPageProps {
  id: string;
  pageData: ProductionSlipPageData;
  order: Order;
  snapshot: Partial<MeasurementRecord>;
  status: ProductionStatus;
  orderNum: string;
  isOverdue: boolean;
  /** Tier chosen by the document-wide auto-fit; every sheet renders the same. */
  density: SlipDensity;
  /** Called when this sheet does not fit the tier it was given. */
  onOverflow?: (pageIndex: number) => void;
}

/**
 * One A4 sheet of the workshop production slip.
 *
 * Printed in a workshop on whatever printer is to hand, so it is designed for
 * black toner on white paper: no navy, no gold, no tints. The only filled
 * areas are solid black bars behind white text, which reproduce cleanly on any
 * mono printer.
 *
 * It carries no money and no signature blocks — it is a cutting instruction,
 * not a contract. Everything on it comes from the order the showroom actually
 * entered; nothing is invented to fill the sheet.
 *
 * The sheet reports overflow upward rather than resizing itself: the tier is
 * owned by the document so that two sheets of one slip never print at
 * different type sizes, which would read as a fault rather than a fit.
 */
export const ProductionSlipPage: React.FC<ProductionSlipPageProps> = ({
  id,
  pageData,
  order,
  snapshot,
  orderNum,
  isOverdue,
  density,
  onOverflow
}) => {
  const {
    pageIndex,
    totalPages,
    isFirstPage,
    isLastPage,
    items,
    showSpecialInstructions,
    showProductionNotes
  } = pageData;

  const specialInstructions = (order.specialInstructions || order.notes || '').trim();
  const productionNotes = (order.productionNotes || '').trim();
  const fitPreference = (snapshot.fitPreference || '').trim();
  const fittingNotes = (snapshot.fittingNotes || order.fittingNotes || '').trim();
  const showroomAddress = `${SHOWROOM_ADDRESS_LINE1} ${SHOWROOM_ADDRESS_LINE2}`;
  const tokens = slipDensityTokens(density);
  // Counted from the whole order, not this sheet's slice, and printed once at
  // the very end — it is the tally the workshop checks the finished pile
  // against, so a per-sheet subtotal would be worse than useless.
  const summary = summariseOrderItems(order.items);
  const flowRef = useRef<HTMLDivElement>(null);
  const overflowCallback = useRef(onOverflow);
  overflowCallback.current = onOverflow;

  /**
   * Measured overflow test, run before paint so a tightened tier is never seen
   * as a flicker. scrollHeight against clientHeight asks the browser directly
   * whether the content fits the fixed sheet box — no millimetre conversion,
   * and no assumption about the print scale factor.
   */
  useLayoutEffect(() => {
    const flow = flowRef.current;
    if (!flow) return;
    if (flow.scrollHeight > flow.clientHeight + 1) {
      overflowCallback.current?.(pageIndex);
    }
  });

  /** One label/value pair in the order's meta strip. */
  const meta = (label: string, value: string, emphasise = false) => (
    <div className="min-w-0">
      <span className="block text-[7.5px] font-bold uppercase tracking-wide leading-none">{label}</span>
      <span
        className={`block text-[10px] leading-tight truncate ${emphasise ? 'font-black underline' : 'font-bold'}`}
      >
        {value || '—'}
      </span>
    </div>
  );

  return (
    <div
      id={id}
      data-page-index={pageIndex}
      // Exposed so the print tests can assert which tier actually rendered:
      // the pagination model is calibrated against the floor tier, and that
      // check is only meaningful on a sheet the auto-fit left there.
      data-density={density}
      className="a4-production-page bg-white text-black flex flex-col"
      style={{ boxSizing: 'border-box' }}
    >
      <div ref={flowRef} className="flex-1 min-h-0">
        {/* ============ HEADER ============ */}
        {isFirstPage ? (
          <div className="border-2 border-black">
            <div className="flex items-stretch border-b border-black">
              <div className="flex-1 px-2 py-1 min-w-0">
                <div className="font-black text-[14px] leading-none tracking-wide uppercase">
                  REGENCY TAILOR
                </div>
                <div className="text-[7.5px] font-semibold uppercase tracking-wide leading-tight mt-[2px]">
                  {showroomAddress}
                </div>
              </div>
              <div className="bg-black text-white px-2.5 py-1 flex flex-col justify-center items-end shrink-0">
                <span className="text-[7.5px] font-bold uppercase tracking-widest leading-none">
                  Production Slip
                </span>
                <span className="text-[13px] font-black leading-none mt-[2px] font-mono">
                  ORDER #{orderNum}
                </span>
              </div>
            </div>

            <div
              className="production-slip-detail-grid px-2 py-1 gap-x-3 gap-y-1"
              style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}
            >
              {meta('Customer', order.customerName)}
              {meta('Mobile', order.customerPhone)}
              {meta('Order Date', order.orderDate)}
              {meta('Delivery Date', `${order.deliveryDate}${isOverdue ? '  (OVERDUE)' : ''}`, isOverdue)}
              {meta('Unit', `${snapshot.unit || 'Inches'}${fitPreference ? ` · ${fitPreference}` : ''}`)}
            </div>
          </div>
        ) : (
          <div className="border-2 border-black flex items-center justify-between gap-2 px-2 py-1">
            <div className="min-w-0">
              <span className="font-black text-[11px] uppercase tracking-wide">
                REGENCY TAILOR · PRODUCTION SLIP
              </span>
              <span className="text-[9px] font-semibold ml-2">
                {order.customerName} · {order.customerPhone}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="font-mono font-black text-[11px]">ORDER #{orderNum}</span>
              <span className="text-[8.5px] font-bold uppercase">
                Page {pageIndex + 1} of {totalPages}
              </span>
            </div>
          </div>
        )}

        {/* ============ GARMENTS ============ */}
        <div
          className="flex flex-col"
          style={{ marginTop: tokens.blockGapPx, gap: tokens.blockGapPx }}
        >
          {items.map(({ item, originalIndex }) => (
            <ProductionSlipProductCard
              key={item.id || originalIndex}
              item={item}
              index={originalIndex}
              snapshot={snapshot}
              tokens={tokens}
            />
          ))}
        </div>

        {/* ============ ORDER-LEVEL NOTES (final sheet only) ============
            Rendered only when the showroom actually recorded them, so an order
            without notes does not print an empty box pretending to be one. */}
        {isLastPage && (
          <div
            className="flex flex-col break-inside-avoid"
            style={{ marginTop: tokens.blockGapPx, gap: tokens.blockGapPx }}
          >
            {showSpecialInstructions && (specialInstructions || fittingNotes) && (
              <div className="border border-black">
                <div
                  className="bg-black text-white px-2 py-[2px] font-black uppercase tracking-wider"
                  style={{ fontSize: `${tokens.noteHeadPx}px` }}
                >
                  Special Instructions &amp; Fit Preferences
                </div>
                {specialInstructions && (
                  <p
                    className="px-2 font-semibold leading-snug m-0 whitespace-pre-wrap"
                    style={{ fontSize: `${tokens.notePx}px`, paddingTop: tokens.notePadY, paddingBottom: tokens.notePadY }}
                  >
                    {specialInstructions}
                  </p>
                )}
                {fittingNotes && (
                  <p
                    className="px-2 font-semibold leading-snug m-0 whitespace-pre-wrap border-t border-black/30"
                    style={{ fontSize: `${tokens.notePx}px`, paddingTop: tokens.notePadY, paddingBottom: tokens.notePadY }}
                  >
                    {fittingNotes}
                  </p>
                )}
              </div>
            )}

            {showProductionNotes && productionNotes && (
              <div className="border border-black">
                <div
                  className="bg-black text-white px-2 py-[2px] font-black uppercase tracking-wider"
                  style={{ fontSize: `${tokens.noteHeadPx}px` }}
                >
                  Production Notes — Internal Workshop Only
                </div>
                <p
                  className="px-2 font-semibold leading-snug m-0 whitespace-pre-wrap"
                  style={{ fontSize: `${tokens.notePx}px`, paddingTop: tokens.notePadY, paddingBottom: tokens.notePadY }}
                >
                  {productionNotes}
                </p>
              </div>
            )}

            {/* ============ TOTAL ITEMS ============
                The last thing on the last sheet: what the workshop counts the
                finished pile against. One band, garments on one line, so it
                costs the sheet a few millimetres rather than a block. */}
            {summary.lines.length > 0 && (
              <div className="production-slip-summary flex items-stretch border border-black break-inside-avoid">
                <div
                  className="bg-black text-white px-2 font-black uppercase tracking-wider shrink-0 flex items-center gap-2"
                  style={{ fontSize: `${tokens.noteHeadPx}px`, paddingTop: tokens.notePadY, paddingBottom: tokens.notePadY }}
                >
                  <span>Total Items</span>
                  <span
                    className="font-mono"
                    style={{ fontSize: `${tokens.notePx + 1}px` }}
                    data-total-items={summary.totalItems}
                  >
                    {summary.totalItems}
                  </span>
                </div>
                <div
                  className="flex-1 flex flex-wrap items-center gap-x-3 gap-y-[1px] px-2 min-w-0"
                  style={{ paddingTop: tokens.notePadY, paddingBottom: tokens.notePadY }}
                >
                  {summary.lines.map(line => (
                    <span
                      key={line.label}
                      className="font-bold uppercase tracking-wide whitespace-nowrap"
                      style={{ fontSize: `${tokens.notePx}px` }}
                    >
                      {line.label} <span className="font-black">× {line.quantity}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ============ FOOTER ============ */}
      <div className="shrink-0 mt-1.5 pt-[3px] border-t border-black flex items-center justify-between text-[8px] font-bold uppercase tracking-wide">
        <span>Workshop Production Slip · Order #{orderNum}</span>
        <span className="font-mono">
          Page {pageIndex + 1} of {totalPages}
        </span>
      </div>
    </div>
  );
};
