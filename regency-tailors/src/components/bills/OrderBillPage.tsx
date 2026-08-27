import React from 'react';
import { MapPin, Phone, User, FileText } from 'lucide-react';
import { Order, MeasurementRecord, ShowroomProfile } from '../../types';
import { OrderBillPageData } from '../../utils/orderBillPagination';
import { OrderBillGarmentRow } from './OrderBillGarmentRow';
import regencyLogoImg from '../../assets/images/regency-tailors-logo.jpg';
import { SHOWROOM_ADDRESS_LINE1, SHOWROOM_ADDRESS_LINE2, SHOWROOM_PHONE } from './PrintableRegencyBill';

export interface OrderBillPageProps {
  id: string;
  pageData: OrderBillPageData;
  order: Order;
  snapshot: Partial<MeasurementRecord>;
  profile?: ShowroomProfile | null;
}

const TABLE_COLUMNS: { label: string; width: string; align?: 'left' | 'center' }[] = [
  { label: 'S.NO.', width: '5%', align: 'center' },
  { label: 'PRODUCT / GARMENT', width: '14%' },
  { label: 'DESCRIPTION / STITCHING DETAILS', width: '23%' },
  { label: 'FABRIC', width: '15%' },
  { label: 'QTY.', width: '6%', align: 'center' },
  { label: 'REMARKS', width: '22%' },
  { label: 'AMOUNT', width: '15%', align: 'center' }
];

/**
 * One A4 sheet of the customer order bill.
 *
 * Two rules this document holds to everywhere, not just in the obvious spot:
 *   - No measurement of any kind appears here. That is the Production Slip's
 *     job; this component never imports the measurement-table logic at all.
 *   - No financial figure is ever computed or pre-filled. A Payment Details
 *     section exists, per the showroom's request, entirely as blank lines for
 *     the owner to fill in by hand — never populated from the order's stored
 *     totals, which is why `order.totalAmount` etc. are never read here.
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
  // Showroom settings (profile) are the source of truth. The confirmed Bootan
  // Mandi details — the same constants the existing admin bill already uses —
  // are only a fallback for when settings have not been filled in yet, so this
  // customer-facing document never prints a dash where the shop's own address
  // belongs.
  const showroomAddress =
    (profile?.address || '').trim() || `${SHOWROOM_ADDRESS_LINE1} ${SHOWROOM_ADDRESS_LINE2}`;
  const showroomPhone = (profile?.phone || '').trim() || SHOWROOM_PHONE;
  const orderNotes = (order.specialInstructions || order.notes || '').trim();
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

  const paymentLine = (label: string) => (
    <div className="flex items-baseline gap-2">
      <span className="text-[9.5px] font-black text-[#071426] uppercase tracking-wide shrink-0" style={{ whiteSpace: 'nowrap' }}>
        {label}
      </span>
      <span className="flex-1 border-b border-[#8C7E6A] h-4" />
    </div>
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
            {/* ============ PREMIUM BRAND HEADER ============ */}
            <div className="bg-[#071426] text-white px-6 pt-6 pb-4 text-center relative">
              <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#8A6822] via-[#F0D48A] to-[#8A6822]" />

              {/*
                Sized by WIDTH, not height: a shared print rule elsewhere
                releases every descendant of the print modal from a fixed
                `height` (it exists to un-clip scroll containers), which would
                override a height-based constraint here and blow the logo up
                to the full column width. Constraining width sidesteps that
                rule entirely rather than changing it — a print-CSS change
                broad enough to fix here would also touch the Production Slip
                and the existing admin bill.
              */}
              <div className="mx-auto" style={{ width: '148px' }}>
                <img
                  src={regencyLogoImg}
                  alt="Regency Tailors"
                  className="w-full h-auto object-contain select-none block"
                />
              </div>

              <svg width="170" height="14" viewBox="0 0 200 18" fill="#C9A24A" className="opacity-90 mx-auto mt-2.5">
                <path d="M100 0 C110 9, 138 12, 200 12 C155 12, 143 18, 100 18 C57 18, 45 12, 0 12 C62 12, 90 9, 100 0 Z" />
              </svg>

              <h1
                className="font-black tracking-[0.16em] text-[#D4AF5A] uppercase m-0"
                style={{ fontFamily: "'Cinzel', 'Playfair Display', serif", lineHeight: 1.15, fontSize: '34px' }}
              >
                REGENCY TAILORS
              </h1>

              <svg width="170" height="14" viewBox="0 0 200 18" fill="#C9A24A" className="opacity-90 mx-auto mt-1 rotate-180">
                <path d="M100 0 C110 9, 138 12, 200 12 C155 12, 143 18, 100 18 C57 18, 45 12, 0 12 C62 12, 90 9, 100 0 Z" />
              </svg>

              <div className="text-[10px] font-bold text-[#E6D5B8] uppercase tracking-[0.3em] mt-1.5">
                PREMIUM TAILORING &nbsp;•&nbsp; PERFECT FIT &nbsp;•&nbsp; TIMELESS STYLE
              </div>

              <div className="w-full h-[1.5px] bg-gradient-to-r from-transparent via-[#C9A24A]/70 to-transparent my-3" />

              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                <MapPin className="w-3.5 h-3.5 text-[#C9A24A] shrink-0" />
                <span className="text-[10.5px] font-bold text-[#D8CFBF] uppercase tracking-wide">
                  {showroomAddress}
                </span>
                <span className="text-[#C9A24A] mx-1">•</span>
                <Phone className="w-3.5 h-3.5 text-[#C9A24A] shrink-0" />
                <span className="text-[11px] font-bold text-white tracking-wider">{showroomPhone}</span>
              </div>
            </div>

            {/* ============ ORDER + CUSTOMER ============ */}
            <div className="px-5 pt-3.5 pb-2">
              <div className="text-center mb-2.5">
                <span className="inline-block text-[11px] font-black tracking-[0.3em] text-[#8C7E6A] uppercase border-y border-[#DFD7C7] py-1.5 px-8">
                  Customer Bill
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
          <div className="bg-[#071426] text-white px-5 py-2.5 flex items-center justify-between gap-3 relative">
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#8A6822] via-[#F0D48A] to-[#8A6822]" />
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

        {/* ============ PRODUCT / GARMENT TABLE (no measurements, no computed amounts) ============ */}
        <div className="px-5 py-2.5">
          {isFirstPage && (
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-black text-[#071426] uppercase tracking-wider">
                Product / Garment Details
              </span>
              <span className="text-[9px] font-bold text-[#8C7E6A] uppercase tracking-wider">
                {garmentCount} {garmentCount === 1 ? 'Piece' : 'Pieces'}
              </span>
            </div>
          )}

          <table
            className="order-bill-table w-full border-collapse rounded-lg overflow-hidden"
            style={{ tableLayout: 'fixed', width: '100%' }}
          >
            <colgroup>
              {TABLE_COLUMNS.map((c, i) => (
                <col key={i} style={{ width: c.width }} />
              ))}
            </colgroup>
            <thead>
              <tr className="bg-[#071426] text-[#D4AF5A]">
                {TABLE_COLUMNS.map((c, i) => (
                  <th
                    key={i}
                    className="border border-[#071426] px-2 py-1.5 font-black uppercase tracking-wider"
                    style={{ fontSize: '8.5px', textAlign: c.align === 'center' ? 'center' : 'left' }}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map(({ item, originalIndex }) => (
                <OrderBillGarmentRow
                  key={item.id || originalIndex}
                  item={item}
                  index={originalIndex}
                  snapshot={snapshot}
                />
              ))}
            </tbody>
          </table>
        </div>

        {/* ============ CLOSING: notes, payment lines, terms, signatures, disclaimer ============ */}
        {isLastPage && showClosing && (
          <div className="px-5 pb-2 space-y-2.5 break-inside-avoid">
            {orderNotes && (
              <div className="bg-white border border-[#DFD7C7] rounded-xl px-3 py-2">
                <span className="block text-[8.5px] font-black text-[#8C7E6A] uppercase tracking-wider">
                  Order Notes
                </span>
                <p className="text-[10.5px] font-semibold text-[#071426] leading-relaxed m-0 whitespace-pre-wrap">
                  {orderNotes}
                </p>
              </div>
            )}

            {/* PAYMENT DETAILS — blank lines only. Never populated, never calculated. */}
            <div className="bg-white border-2 border-[#C9A24A] rounded-xl px-4 py-3">
              <h4 className="text-[10.5px] font-black text-[#071426] uppercase tracking-[0.2em] m-0 mb-2 pb-1.5 border-b border-[#E8E0D2]">
                Payment Details
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: '20px', rowGap: '9px' }}>
                {paymentLine('Total Amount')}
                {paymentLine('Advance Paid')}
                {paymentLine('Balance')}
                {paymentLine('Payment Mode')}
              </div>
              <div className="mt-2.5">{paymentLine('Payment Date')}</div>
            </div>

            {/* TERMS & CONDITIONS — short, factual, nothing invented */}
            <div className="bg-[#FAF7F0] border border-[#DFD7C7] rounded-xl px-3.5 py-2">
              <span className="block text-[8.5px] font-black text-[#8C7E6A] uppercase tracking-wider mb-1">
                Terms &amp; Conditions
              </span>
              <ul className="text-[9.5px] font-semibold text-[#4A5568] leading-relaxed m-0 pl-3.5 space-y-0.5" style={{ listStyleType: 'disc' }}>
                <li>Please retain this bill and present it at the time of order collection.</li>
                <li>Kindly verify all garment details at the time of delivery.</li>
              </ul>
            </div>

            <div className="text-center py-0.5">
              <div className="flex items-center justify-center gap-2.5">
                <div className="h-[1px] bg-gradient-to-r from-transparent to-[#C9A24A] flex-1 max-w-[80px]" />
                <h4 className="text-[11px] font-black text-[#071426] uppercase tracking-widest m-0">THANK YOU!</h4>
                <div className="h-[1px] bg-gradient-to-l from-transparent to-[#C9A24A] flex-1 max-w-[80px]" />
              </div>
              <p className="text-[9.5px] font-semibold text-[#4A5568] m-0 mt-0.5">
                For choosing Regency Tailors.
              </p>
            </div>

            {/* SIGNATURES */}
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

            {/* REQUIRED FINAL DISCLAIMER — the closing message of the whole document */}
            <div className="bg-[#071426] rounded-xl px-4 py-2.5 text-center border-2 border-[#C9A24A]">
              <p className="text-[11px] font-black text-[#F0D48A] uppercase tracking-wide m-0">
                We are not responsible for clothes after 2 months.
              </p>
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
