import React from 'react';
import { MapPin, Phone, User, FileText } from 'lucide-react';
import { Order, MeasurementRecord, ShowroomProfile } from '../../types';
import { OrderBillPageData } from '../../utils/orderBillPagination';
import { OrderBillGarmentCard } from './OrderBillGarmentCard';
import regencyLogoImg from '../../assets/images/regency-tailors-logo.jpg';
import { SHOWROOM_ADDRESS_LINE1, SHOWROOM_ADDRESS_LINE2, SHOWROOM_PHONE } from './PrintableRegencyBill';

export interface OrderBillPageProps {
  id: string;
  pageData: OrderBillPageData;
  order: Order;
  snapshot: Partial<MeasurementRecord>;
  profile?: ShowroomProfile | null;
}

/**
 * One A4 sheet of the customer order bill.
 *
 * Deliberately carries no financial information of any kind: no price, rate,
 * amount, subtotal, discount, advance, balance, payment or currency, and no
 * empty columns where they used to be. The amount is written by hand on the
 * printed sheet, so the layout is built around order and garment detail
 * instead of a money table.
 */
export const OrderBillPage: React.FC<OrderBillPageProps> = ({ id, pageData, order, snapshot, profile }) => {
  const { pageIndex, totalPages, isFirstPage, isLastPage, items, showClosing } = pageData;

  const rawOrderNum = order.orderNumber || order.id || '';
  const numericOrderNum = rawOrderNum.replace(/[^0-9]/g, '') || rawOrderNum;
  const billNo = `RT-${numericOrderNum.padStart(5, '0')}`;

  const formatDate = (value?: string): string => {
    if (!value) return '—';
    const d = new Date(value);
    if (isNaN(d.getTime())) return value;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
  };

  const addressLine = [order.customerAddress].filter(Boolean).join(', ').trim();
  // Showroom settings supply these in production. The confirmed Bootan Mandi
  // details are the fallback so a customer-facing bill never prints a dash
  // where the shop's own address and number belong.
  const showroomAddress =
    (profile?.address || '').trim() || `${SHOWROOM_ADDRESS_LINE1} ${SHOWROOM_ADDRESS_LINE2}`;
  const showroomPhone = (profile?.phone || '').trim() || SHOWROOM_PHONE;
  const orderNotes = (order.specialInstructions || order.notes || '').trim();
  const productionNotes = (order.productionNotes || '').trim();
  const garmentCount = (order.items || []).reduce((sum, i) => sum + (i.quantity || 1), 0);

  const metaRow = (label: string, value: string) => (
    <>
      <span className="text-[9px] font-bold text-[#4A5568] uppercase tracking-wide" style={{ whiteSpace: 'nowrap' }}>
        {label}
      </span>
      <span className="text-[9.5px] font-bold text-[#4A5568]">:</span>
      <span className="text-[10.5px] font-black text-[#071426]">{value}</span>
    </>
  );

  return (
    <div
      id={id}
      data-page-index={pageIndex}
      className="a4-bill-page bg-[#FAF7F0] border-2 border-[#C9A24A] rounded-2xl overflow-hidden mx-auto flex flex-col text-[#071426] print:rounded-none print:border-none"
      style={{ boxSizing: 'border-box', fontFamily: "'Manrope', system-ui, -apple-system, sans-serif" }}
    >
      <div className="flex-1">
        {isFirstPage ? (
          <>
            {/* ============ BRAND HEADER ============ */}
            <div className="bg-[#071426] text-white px-5 pt-4 pb-3.5">
              <div style={{ display: 'grid', gridTemplateColumns: '86px 1fr', alignItems: 'center', columnGap: '14px' }}>
                <img
                  src={regencyLogoImg}
                  alt="Regency Tailors"
                  className="w-full h-auto object-contain select-none"
                  style={{ maxHeight: '86px', objectFit: 'contain', borderRadius: '6px' }}
                />

                <div className="flex flex-col items-center text-center">
                  <svg width="130" height="12" viewBox="0 0 160 16" fill="#C9A24A" className="opacity-90">
                    <path d="M80 0 C88 8, 110 10, 160 10 C125 10, 115 16, 80 16 C45 16, 35 10, 0 10 C50 10, 72 8, 80 0 Z" />
                  </svg>
                  <h1
                    className="text-2xl font-black tracking-[0.14em] text-[#D4AF5A] uppercase m-0"
                    style={{ fontFamily: "'Cinzel', 'Playfair Display', serif", lineHeight: 1.15 }}
                  >
                    REGENCY TAILORS
                  </h1>
                  <svg width="130" height="12" viewBox="0 0 160 16" fill="#C9A24A" className="opacity-90 rotate-180">
                    <path d="M80 0 C88 8, 110 10, 160 10 C125 10, 115 16, 80 16 C45 16, 35 10, 0 10 C50 10, 72 8, 80 0 Z" />
                  </svg>
                  <div className="text-[8.5px] font-bold text-[#E6D5B8] uppercase tracking-[0.22em] mt-1">
                    PREMIUM TAILORING &nbsp;•&nbsp; PERFECT FIT &nbsp;•&nbsp; TIMELESS STYLE
                  </div>
                </div>
              </div>

              <div className="w-full h-[1.5px] bg-gradient-to-r from-transparent via-[#C9A24A]/70 to-transparent my-2.5" />

              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 min-w-0">
                  <MapPin className="w-3.5 h-3.5 text-[#C9A24A] shrink-0" />
                  <span className="text-[9.5px] font-bold text-[#D8CFBF] uppercase leading-tight">
                    {showroomAddress}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Phone className="w-3.5 h-3.5 text-[#C9A24A]" />
                  <span className="text-[10px] font-bold text-white tracking-wider">{showroomPhone}</span>
                </div>
              </div>
            </div>

            {/* ============ ORDER + CUSTOMER ============ */}
            <div className="px-5 pt-3.5 pb-2">
              <div className="text-center mb-2.5">
                <span className="inline-block text-[10px] font-black tracking-[0.28em] text-[#8C7E6A] uppercase border-y border-[#DFD7C7] py-1 px-6">
                  Customer Order Bill
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="bg-white p-2.5 rounded-xl border border-[#DFD7C7] space-y-1.5">
                  <div className="flex items-center gap-1.5 pb-1 border-b border-[#E8E0D2]">
                    <div className="w-5 h-5 rounded-md bg-[#C9A24A] text-white flex items-center justify-center">
                      <User className="w-3.5 h-3.5" />
                    </div>
                    <h3 className="text-[11px] font-black tracking-wider text-[#071426] uppercase m-0">
                      CUSTOMER DETAILS
                    </h3>
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'max-content max-content 1fr',
                      rowGap: '3.5px',
                      columnGap: '6px',
                      alignItems: 'baseline'
                    }}
                  >
                    {metaRow('NAME', order.customerName || '—')}
                    {metaRow('MOBILE', order.customerPhone || '—')}
                    {metaRow('ADDRESS', addressLine || '—')}
                  </div>
                </div>

                <div className="bg-white p-2.5 rounded-xl border border-[#DFD7C7] space-y-1.5">
                  <div className="flex items-center gap-1.5 pb-1 border-b border-[#E8E0D2]">
                    <div className="w-5 h-5 rounded-md bg-[#C9A24A] text-white flex items-center justify-center">
                      <FileText className="w-3.5 h-3.5" />
                    </div>
                    <h3 className="text-[11px] font-black tracking-wider text-[#071426] uppercase m-0">
                      ORDER DETAILS
                    </h3>
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'max-content max-content 1fr',
                      rowGap: '3.5px',
                      columnGap: '6px',
                      alignItems: 'baseline'
                    }}
                  >
                    {metaRow('BILL NO.', billNo)}
                    {metaRow('ORDER NO.', numericOrderNum || '—')}
                    {metaRow('ORDER DATE', formatDate(order.orderDate))}
                    {metaRow('DELIVERY DATE', formatDate(order.deliveryDate))}
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          /* ============ CONTINUATION HEADER ============ */
          <div className="bg-[#071426] text-white px-5 py-2.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <img
                src={regencyLogoImg}
                alt="Regency Tailors"
                className="w-9 h-9 object-contain rounded shrink-0"
                style={{ objectFit: 'contain' }}
              />
              <div className="min-w-0">
                <div
                  className="text-[13px] font-black tracking-[0.12em] text-[#D4AF5A] uppercase leading-tight"
                  style={{ fontFamily: "'Cinzel', serif" }}
                >
                  REGENCY TAILORS
                </div>
                <div className="text-[9px] font-bold text-[#D8CFBF] truncate">
                  {order.customerName} • {order.customerPhone}
                </div>
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[9px] font-bold text-[#A39682] uppercase tracking-wider">Continued</div>
              <div className="text-[11px] font-black text-[#D4AF5A] font-mono">{billNo}</div>
            </div>
          </div>
        )}

        {/* ============ GARMENTS ============ */}
        <div className="px-5 py-2.5 space-y-2.5">
          {isFirstPage && (
            <div className="flex items-center justify-between border-b border-[#DFD7C7] pb-1">
              <span className="text-[10px] font-black text-[#071426] uppercase tracking-wider">
                Garments Ordered
              </span>
              <span className="text-[9px] font-bold text-[#8C7E6A] uppercase tracking-wider">
                {garmentCount} {garmentCount === 1 ? 'Piece' : 'Pieces'}
              </span>
            </div>
          )}

          {items.map(({ item, originalIndex }) => (
            <OrderBillGarmentCard
              key={item.id || originalIndex}
              item={item}
              index={originalIndex}
              snapshot={snapshot}
            />
          ))}
        </div>

        {/* ============ CLOSING ============ */}
        {isLastPage && showClosing && (
          <div className="px-5 pb-2 space-y-2.5 break-inside-avoid">
            {(orderNotes || productionNotes) && (
              <div className="bg-white border border-[#DFD7C7] rounded-xl px-3 py-2 space-y-1.5">
                {orderNotes && (
                  <div>
                    <span className="block text-[8.5px] font-black text-[#8C7E6A] uppercase tracking-wider">
                      Order Notes
                    </span>
                    <p className="text-[10.5px] font-semibold text-[#071426] leading-relaxed m-0 whitespace-pre-wrap">
                      {orderNotes}
                    </p>
                  </div>
                )}
                {productionNotes && (
                  <div>
                    <span className="block text-[8.5px] font-black text-[#8C7E6A] uppercase tracking-wider">
                      Tailoring Notes
                    </span>
                    <p className="text-[10.5px] font-semibold text-[#071426] leading-relaxed m-0 whitespace-pre-wrap">
                      {productionNotes}
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="text-center py-1">
              <div className="flex items-center justify-center gap-2.5">
                <div className="h-[1px] bg-gradient-to-r from-transparent to-[#C9A24A] flex-1 max-w-[80px]" />
                <h4 className="text-[11px] font-black text-[#071426] uppercase tracking-widest m-0">THANK YOU!</h4>
                <div className="h-[1px] bg-gradient-to-l from-transparent to-[#C9A24A] flex-1 max-w-[80px]" />
              </div>
              <p className="text-[9.5px] font-semibold text-[#4A5568] m-0 mt-0.5">
                For choosing Regency Tailors.
              </p>
            </div>

            <div
              className="bg-white border border-[#DFD7C7] rounded-xl px-3 py-3"
              style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: '24px' }}
            >
              <div>
                <div className="border-b border-[#071426] h-7" />
                <span className="block text-[8.5px] font-bold text-[#8C7E6A] uppercase tracking-wider mt-1">
                  Customer Signature
                </span>
              </div>
              <div>
                <div className="border-b border-[#071426] h-7" />
                <span className="block text-[8.5px] font-bold text-[#8C7E6A] uppercase tracking-wider mt-1">
                  For Regency Tailors
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ============ FOOTER (every sheet) ============ */}
      <div className="bg-[#071426] text-white px-5 py-2 relative shrink-0">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#8A6822] via-[#E5C16C] to-[#8A6822]" />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[9px] font-bold text-[#D8CFBF] uppercase tracking-wider truncate">
            {showroomAddress}
          </span>
          <span className="text-[9px] font-black text-[#D4AF5A] font-mono shrink-0">
            {billNo} • Page {pageIndex + 1} of {totalPages}
          </span>
        </div>
      </div>
    </div>
  );
};
