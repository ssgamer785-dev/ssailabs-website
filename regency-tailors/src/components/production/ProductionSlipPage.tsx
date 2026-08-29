import React from 'react';
import { Order, ProductionStatus, MeasurementRecord } from '../../types';
import { ProductionSlipProductCard } from './ProductionSlipProductCard';
import { ProductionSlipPageData } from '../../utils/productionSlipPagination';
import { SHOWROOM_ADDRESS_LINE1, SHOWROOM_ADDRESS_LINE2 } from '../bills/PrintableRegencyBill';

interface ProductionSlipPageProps {
  id: string;
  pageData: ProductionSlipPageData;
  order: Order;
  snapshot: Partial<MeasurementRecord>;
  status: ProductionStatus;
  orderNum: string;
  isOverdue: boolean;
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
 */
export const ProductionSlipPage: React.FC<ProductionSlipPageProps> = ({
  id,
  pageData,
  order,
  snapshot,
  orderNum,
  isOverdue
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
      className="a4-production-page bg-white text-black flex flex-col"
      style={{ boxSizing: 'border-box' }}
    >
      <div className="flex-1 min-h-0">
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
        <div className="mt-1.5 space-y-1.5">
          {items.map(({ item, originalIndex }) => (
            <ProductionSlipProductCard
              key={item.id || originalIndex}
              item={item}
              index={originalIndex}
              snapshot={snapshot}
            />
          ))}
        </div>

        {/* ============ ORDER-LEVEL NOTES (final sheet only) ============
            Rendered only when the showroom actually recorded them, so an order
            without notes does not print an empty box pretending to be one. */}
        {isLastPage && (
          <div className="mt-1.5 space-y-1.5 break-inside-avoid">
            {showSpecialInstructions && (specialInstructions || fittingNotes) && (
              <div className="border border-black">
                <div className="bg-black text-white px-2 py-[2px] text-[8.5px] font-black uppercase tracking-wider">
                  Special Instructions &amp; Fit Preferences
                </div>
                {specialInstructions && (
                  <p className="px-2 py-[3px] text-[9.5px] font-semibold leading-snug m-0 whitespace-pre-wrap">
                    {specialInstructions}
                  </p>
                )}
                {fittingNotes && (
                  <p className="px-2 py-[3px] text-[9.5px] font-semibold leading-snug m-0 whitespace-pre-wrap border-t border-black/30">
                    {fittingNotes}
                  </p>
                )}
              </div>
            )}

            {showProductionNotes && productionNotes && (
              <div className="border border-black">
                <div className="bg-black text-white px-2 py-[2px] text-[8.5px] font-black uppercase tracking-wider">
                  Production Notes — Internal Workshop Only
                </div>
                <p className="px-2 py-[3px] text-[9.5px] font-semibold leading-snug m-0 whitespace-pre-wrap">
                  {productionNotes}
                </p>
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
