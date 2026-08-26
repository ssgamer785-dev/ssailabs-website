import React from 'react';
import { Order, ProductionStatus, MeasurementRecord } from '../../types';
import { ProductionSlipProductCard } from './ProductionSlipProductCard';
import { ProductionSlipPageData } from '../../utils/productionSlipPagination';

interface ProductionSlipPageProps {
  id: string;
  pageData: ProductionSlipPageData;
  order: Order;
  snapshot: Partial<MeasurementRecord>;
  status: ProductionStatus;
  orderNum: string;
  isOverdue: boolean;
}

export const ProductionSlipPage: React.FC<ProductionSlipPageProps> = ({
  id,
  pageData,
  order,
  snapshot,
  orderNum,
  isOverdue
}) => {
  const { pageIndex, totalPages, isFirstPage, isLastPage, items, showSpecialInstructions, showProductionNotes, showArtisanSignOff } = pageData;

  return (
    <div
      id={id}
      data-page-index={pageIndex}
      className="a4-production-page bg-white p-6 sm:p-8 border-2 border-[#C9A24A]/40 rounded-2xl max-w-3xl mx-auto space-y-5 text-[#071426] shadow-sm print:p-0 print:border-none print:shadow-none print:max-w-none print:space-y-4 print:bg-white flex flex-col justify-between"
      style={{
        boxSizing: 'border-box'
      }}
    >
      {/* Top Content Area */}
      <div className="space-y-5 print:space-y-4">
        
        {/* ======================================================== */}
        {/* 1. HEADER (Page 1 Master vs Page 2+ Continuation) */}
        {/* ======================================================== */}
        {isFirstPage ? (
          /* PAGE 1: Workshop Master Header */
          <div className="space-y-3.5 border-b-2 border-[#C9A24A] pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-black tracking-[0.25em] text-[#C9A24A] uppercase">
                  MASTER WORKSHOP SLIP
                </div>
                <h1 className="text-xl sm:text-2xl font-black text-[#071426] tracking-tight uppercase">
                  PRODUCTION SLIP
                </h1>
              </div>
              <div className="sm:text-right">
                <div className="inline-block px-3.5 py-1 rounded-md bg-[#071426] text-[#D4AF5A] font-extrabold text-xs sm:text-sm border border-[#C9A24A]/40 font-mono shadow-2xs">
                  ORDER #{orderNum}
                </div>
              </div>
            </div>

            {/* Client & Production Info Meta Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-[#FAF8F5] p-3 rounded-xl border border-[#E0D8CB] text-xs">
              <div>
                <span className="text-[9px] font-bold text-[#8C7E6A] uppercase block">Customer Name</span>
                <span className="font-extrabold text-xs sm:text-sm text-[#071426] truncate block">{order.customerName}</span>
              </div>
              <div>
                <span className="text-[9px] font-bold text-[#8C7E6A] uppercase block">Mobile Number</span>
                <span className="font-bold text-xs text-[#071426] block">{order.customerPhone}</span>
              </div>
              <div>
                <span className="text-[9px] font-bold text-[#8C7E6A] uppercase block">Order Date</span>
                <span className="font-bold text-xs text-[#071426] block">{order.orderDate}</span>
              </div>
              <div>
                <span className="text-[9px] font-bold text-[#8C7E6A] uppercase block">Delivery Date</span>
                <div className="flex items-center gap-1">
                  <span className={`font-extrabold text-xs sm:text-sm ${isOverdue ? 'text-red-600' : 'text-[#071426]'}`}>
                    {order.deliveryDate}
                  </span>
                  {isOverdue && (
                    <span className="px-1 py-0.2 bg-red-100 text-red-700 font-bold text-[8px] rounded">
                      OVERDUE
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* PAGE 2, 3, etc.: Compact Continuation Header */
          <div className="border-b-2 border-[#C9A24A] pb-3 bg-[#FAF8F5] p-3 rounded-xl border border-[#E0D8CB]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-black text-[#071426] uppercase tracking-wide">PRODUCTION SLIP</span>
                  <span className="px-1.5 py-0.5 bg-[#071426] text-[#D4AF5A] text-[10px] font-mono font-bold rounded">
                    ORDER #{orderNum}
                  </span>
                  <span className="text-[10px] font-black text-[#C9A24A] uppercase tracking-wider">
                    (CONTINUATION)
                  </span>
                </div>
                <div className="text-[11px] text-[#7A7060] font-medium mt-0.5">
                  Client: <strong className="text-[#071426]">{order.customerName}</strong> • {order.customerPhone}
                </div>
              </div>

              <div className="text-right shrink-0">
                <div className="text-[9px] font-bold text-[#8C7E6A] uppercase">Delivery Target</div>
                <div className="text-xs font-black text-[#071426]">{order.deliveryDate}</div>
                <div className="text-[10px] font-bold text-[#C9A24A] font-mono uppercase">
                  Page {pageIndex + 1} of {totalPages}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* 2. GARMENT PRODUCT CARDS FOR THIS PAGE */}
        {/* ======================================================== */}
        <div className="space-y-4">
          {items.map(({ item, originalIndex }) => (
            <ProductionSlipProductCard
              key={item.id || originalIndex}
              item={item}
              index={originalIndex}
              snapshot={snapshot}
            />
          ))}
        </div>

        {/* ======================================================== */}
        {/* 3. FINAL SUMMARY & SIGN-OFF (Only on Final Page) */}
        {/* ======================================================== */}
        {isLastPage && (
          <div className="space-y-3 pt-1 break-inside-avoid">
            {/* Special Instructions */}
            {showSpecialInstructions && (
              <div className="p-3 rounded-xl bg-[#FAF8F5] border border-[#E0D8CB] space-y-1">
                <span className="text-[9px] font-black text-[#8C7E6A] uppercase tracking-wider block">
                  SPECIAL INSTRUCTIONS & CLIENT FIT PREFERENCES
                </span>
                <p className="text-xs font-semibold text-[#071426]">
                  {order.specialInstructions || order.notes || 'Standard bespoke tailoring specifications.'}
                </p>
              </div>
            )}

            {/* Production Notes (Workshop Only) */}
            {showProductionNotes && (
              <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-200/80 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-black text-amber-900 uppercase tracking-wider">
                    PRODUCTION NOTES (INTERNAL WORKSHOP ONLY)
                  </span>
                  <span className="text-[8px] text-amber-700 font-bold uppercase tracking-wider">
                    Workshop Only
                  </span>
                </div>
                <p className="text-xs font-medium text-amber-950 italic">
                  {order.productionNotes || 'Cutting queue verified. Ready for tailor assignment.'}
                </p>
              </div>
            )}

            {/* Artisan Sign-Off */}
            {showArtisanSignOff && (
              <div className="p-3 rounded-xl bg-white border border-[#E0D8CB] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 text-[11px] text-[#7A7060]">
                <span>Workshop System • Generated {new Date().toLocaleDateString('en-IN')}</span>
                <div className="font-bold text-[#071426] flex items-center gap-2">
                  <span>Master Cutter Sign-Off:</span>
                  <span className="border-b border-[#071426] w-36 inline-block"></span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* 4. SUBTLE PROFESSIONAL FOOTER (Every Page) */}
      {/* ======================================================== */}
      <div className="pt-3 mt-4 border-t border-[#E6E1D7] flex justify-between items-center text-[10px] text-[#8C7E6A] shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-bold text-[#071426]">Workshop Production Slip</span>
          <span>•</span>
          <span className="font-mono">Order #{orderNum}</span>
        </div>
        <div className="font-bold text-[#071426] font-mono">
          Page {pageIndex + 1} of {totalPages}
        </div>
      </div>
    </div>
  );
};
