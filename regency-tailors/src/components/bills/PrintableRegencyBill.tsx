/*
 * NOT USER-REACHABLE.
 *
 * This is the showroom's older money-bearing invoice (DESCRIPTION / RATE /
 * AMOUNT in rupees). The approved customer bill is `OrderBillPage` — one A4
 * sheet, QR codes, and an Amount left blank for the owner to write by hand —
 * and it is the only bill any button in the app opens. The modal that used to
 * open this one (`PrintBillModal`) has been removed, along with the Print Bill
 * actions on the Production Slips screen and the slip dossier, which now open
 * the approved bill.
 *
 * The file is kept, not deleted: `OrderBillPage` and `ProductionSlipPage` both
 * import the showroom address and phone constants from here, and the component
 * itself is worth keeping for reference to bills printed before the change.
 *
 * Do not wire it back into the UI without asking the showroom first.
 */
import React, { useState } from 'react';
import { MapPin, Phone, User, FileText } from 'lucide-react';
import { Order } from '../../types';
import regencyLogoImg from '../../assets/images/regency-tailors-logo-512.webp';

// Static Showroom Contact Details (Official Regency Tailor)
export const SHOWROOM_ADDRESS_LINE1 = 'BOOTAN MANDI,';
export const SHOWROOM_ADDRESS_LINE2 = 'JALANDHAR, PUNJAB 144003';
export const SHOWROOM_PHONE = '99887 71631';

export interface PrintableRegencyBillProps {
  order: Order | null;
  id?: string;
}

export const PrintableRegencyBill: React.FC<PrintableRegencyBillProps> = ({
  order,
  id = 'printable-customer-bill'
}) => {
  // The shipped logo asset can fail to decode (see README — the bundled JPEG is
  // corrupt). A customer-facing bill must never show a broken-image icon, so we
  // fall back to the same engraved RT monogram the sidebar already uses.
  const [logoSrc, setLogoSrc] = useState<string>(regencyLogoImg);
  const [logoFailed, setLogoFailed] = useState(false);
  const handleLogoError = () => {
    if (logoSrc !== '/regency-tailors-logo.jpg') {
      setLogoSrc('/regency-tailors-logo.jpg');
    } else {
      setLogoFailed(true);
    }
  };

  const isBlank = !order;
  const rawOrderNum = order ? (order.orderNumber || order.id || '1') : '—';
  const numericOrderNum = rawOrderNum.replace(/[^0-9]/g, '') || rawOrderNum;

  // Format date helper like "21 Aug 2026"
  const formatDate = (dateStr?: string): string => {
    if (!dateStr || dateStr === '—') return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const day = d.getDate().toString().padStart(2, '0');
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${day} ${months[d.getMonth()]} ${d.getFullYear()}`;
    } catch {
      return dateStr;
    }
  };

  // Format currency with standard Indian numbering and two decimals
  const formatNumber = (num?: number): string => {
    if (num === undefined || num === null || isNaN(num)) return '0.00';
    return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Format Bill No like RT-00003
  const billNo = isBlank 
    ? '—' 
    : `RT-${numericOrderNum.toString().padStart(5, '0')}`;

  const orderNo = isBlank ? '—' : numericOrderNum;
  const billingDate = isBlank ? '—' : formatDate(order?.orderDate || new Date().toISOString().split('T')[0]);
  const dueDate = isBlank ? '—' : formatDate(order?.deliveryDate || order?.orderDate);

  const customerName = order?.customerName || '—';
  const customerPhone = order?.customerPhone || '—';
  const customerAddress = order?.customerAddress || (order as any)?.address || '—';

  const orderDateDisplay = isBlank ? '—' : formatDate(order?.orderDate);
  const deliveryDateDisplay = isBlank ? '—' : formatDate(order?.deliveryDate);
  const paymentMethodDisplay = order?.paymentMethod || (isBlank ? '—' : 'Cash');

  // Garment Items from order
  const items = order?.items || [];
  
  // Financial Calculations
  const subtotal = order?.subtotal ?? (items.reduce((acc, i) => acc + ((i.price || 0) * (i.quantity || 1)), 0) || order?.totalAmount || 0);
  const discount = order?.discount || 0;
  const grandTotal = order?.totalAmount || 0;
  const amountPaid = order?.advancePaid || 0;
  const balanceDue = order ? (order.balanceDue ?? Math.max(0, grandTotal - amountPaid)) : 0;

  return (
    <div 
      id={id}
      className="a4-bill-card w-full max-w-[190mm] mx-auto bg-[#FAF7F0] border-2 border-[#C9A24A] rounded-2xl text-[#071426] shadow-sm overflow-hidden relative"
      style={{ 
        boxSizing: 'border-box', 
        width: '100%', 
        maxWidth: '190mm',
        backgroundColor: '#FAF7F0',
        fontFamily: "'Manrope', system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
      }}
    >
      {/* ======================================================== */}
      {/* CORNER DECORATIVE ORNAMENTS (4 CORNERS OF THE BILL) */}
      {/* ======================================================== */}
      {/* Top-Left Corner Flourish */}
      <svg width="28" height="28" viewBox="0 0 40 40" fill="none" className="absolute top-1 left-1 pointer-events-none z-20 opacity-90">
        <path d="M4 36 L4 8 C4 5.79 5.79 4 8 4 L36 4" stroke="#C9A24A" strokeWidth="2" strokeLinecap="round" />
        <circle cx="8" cy="8" r="2.5" fill="#C9A24A" />
        <path d="M4 14 C10 14 14 10 14 4" stroke="#C9A24A" strokeWidth="1.5" />
      </svg>
      {/* Top-Right Corner Flourish */}
      <svg width="28" height="28" viewBox="0 0 40 40" fill="none" className="absolute top-1 right-1 pointer-events-none z-20 opacity-90">
        <path d="M36 36 L36 8 C36 5.79 34.21 4 32 4 L4 4" stroke="#C9A24A" strokeWidth="2" strokeLinecap="round" />
        <circle cx="32" cy="8" r="2.5" fill="#C9A24A" />
        <path d="M36 14 C30 14 26 10 26 4" stroke="#C9A24A" strokeWidth="1.5" />
      </svg>
      {/* Bottom-Left Corner Flourish */}
      <svg width="28" height="28" viewBox="0 0 40 40" fill="none" className="absolute bottom-1 left-1 pointer-events-none z-20 opacity-90">
        <path d="M4 4 L4 32 C4 34.21 5.79 36 8 36 L36 36" stroke="#C9A24A" strokeWidth="2" strokeLinecap="round" />
        <circle cx="8" cy="32" r="2.5" fill="#C9A24A" />
        <path d="M4 26 C10 26 14 30 14 36" stroke="#C9A24A" strokeWidth="1.5" />
      </svg>
      {/* Bottom-Right Corner Flourish */}
      <svg width="28" height="28" viewBox="0 0 40 40" fill="none" className="absolute bottom-1 right-1 pointer-events-none z-20 opacity-90">
        <path d="M36 4 L36 32 C36 34.21 34.21 36 32 36 L4 36" stroke="#C9A24A" strokeWidth="2" strokeLinecap="round" />
        <circle cx="32" cy="32" r="2.5" fill="#C9A24A" />
        <path d="M36 26 C30 26 26 30 26 36" stroke="#C9A24A" strokeWidth="1.5" />
      </svg>

      {/* ======================================================== */}
      {/* 1. TOP HEADER (MIDNIGHT NAVY BRAND & INFORMATION HEADER) */}
      {/* ======================================================== */}
      <div 
        className="bg-[#071426] text-white pt-4 pb-3.5 px-4 sm:px-6 relative"
        style={{
          width: '100%',
          boxSizing: 'border-box'
        }}
      >
        {/* UPPER TIER: OFFICIAL LOGO (LEFT) & REGENCY TAILOR CENTERPIECE */}
        <div 
          style={{
            display: 'grid',
            gridTemplateColumns: '26% 74%',
            alignItems: 'center',
            width: '100%',
            boxSizing: 'border-box'
          }}
        >
          {/* TOP LEFT: OFFICIAL REGENCY LOGO ASSET */}
          <div className="flex flex-col items-start justify-center pr-2" style={{ boxSizing: 'border-box' }}>
            {logoFailed ? (
              <div
                className="flex flex-col items-center justify-center select-none"
                style={{ maxHeight: '78px' }}
                aria-label="Regency Tailor"
              >
                <div className="w-11 h-11 rounded-full border-2 border-[#C9A24A] flex items-center justify-center text-[#D4AF5A] font-black text-base" style={{ fontFamily: "'Cinzel', serif" }}>
                  RT
                </div>
                <span className="text-[7px] font-extrabold tracking-[0.18em] text-[#D4AF5A] uppercase mt-1">
                  EST. REGENCY
                </span>
              </div>
            ) : (
              <img
                src={logoSrc}
                alt="Regency Tailor Logo"
                onError={handleLogoError}
                referrerPolicy="no-referrer"
                className="w-full max-w-[110px] h-auto object-contain select-none"
                style={{
                  objectFit: 'contain',
                  maxHeight: '78px'
                }}
              />
            )}
          </div>

          {/* TOP CENTER / RIGHT: REGENCY TAILOR BRAND CENTERPIECE & TAGLINE */}
          <div className="flex flex-col items-center justify-center text-center pl-1 pr-3" style={{ boxSizing: 'border-box' }}>
            {/* Top Ornate Gold Filigree Flourish */}
            <svg width="120" height="12" viewBox="0 0 160 16" fill="#C9A24A" className="mb-0.5 opacity-90">
              <path d="M80 0 C88 8, 110 10, 160 10 C125 10, 115 16, 80 16 C45 16, 35 10, 0 10 C50 10, 72 8, 80 0 Z" />
            </svg>

            {/* Prominent Brand Title */}
            <h1 
              className="text-xl sm:text-2xl font-black tracking-[0.14em] text-[#D4AF5A] uppercase select-none"
              style={{ 
                fontFamily: "'Cinzel', 'Playfair Display', 'Manrope', serif",
                color: '#D4AF5A',
                margin: 0,
                lineHeight: 1.15,
                textShadow: '0 1px 2px rgba(0,0,0,0.3)'
              }}
            >
              REGENCY TAILOR
            </h1>

            {/* Bottom Ornate Gold Filigree Flourish */}
            <svg width="120" height="12" viewBox="0 0 160 16" fill="#C9A24A" className="mt-0.5 opacity-90 rotate-180">
              <path d="M80 0 C88 8, 110 10, 160 10 C125 10, 115 16, 80 16 C45 16, 35 10, 0 10 C50 10, 72 8, 80 0 Z" />
            </svg>

            {/* Tailoring Tagline */}
            <div 
              className="text-[8.5px] sm:text-[9px] font-bold text-[#E6D5B8] uppercase tracking-[0.22em] mt-1 text-center"
              style={{ whiteSpace: 'nowrap' }}
            >
              PREMIUM TAILORING &nbsp;•&nbsp; PERFECT FIT &nbsp;•&nbsp; TIMELESS STYLE
            </div>
          </div>
        </div>

        {/* ELEGANT GOLD DIVIDER LINE */}
        <div className="w-full h-[1.5px] bg-gradient-to-r from-transparent via-[#C9A24A]/70 to-transparent my-2.5" />

        {/* LOWER TIER: SHOWROOM INFORMATION (LEFT) & BILL DETAILS (RIGHT) */}
        <div 
          style={{
            display: 'grid',
            gridTemplateColumns: '55% 45%',
            alignItems: 'center',
            gap: '12px',
            width: '100%',
            boxSizing: 'border-box'
          }}
        >
          {/* LEFT: SHOWROOM INFORMATION (ADDRESS & PHONE) */}
          <div className="flex items-center gap-3 text-left" style={{ boxSizing: 'border-box' }}>
            {/* Address */}
            <div className="flex items-start gap-1.5 text-[#FAF7F0]/90">
              <MapPin className="w-3.5 h-3.5 text-[#C9A24A] shrink-0 mt-0.5" />
              <div>
                <div className="font-extrabold text-white tracking-wide text-[10px] leading-snug">
                  {SHOWROOM_ADDRESS_LINE1}
                </div>
                <div className="text-[9px] text-[#D8CFBF] leading-tight">
                  {SHOWROOM_ADDRESS_LINE2}
                </div>
              </div>
            </div>

            {/* Vertical Gold Separator */}
            <div className="h-6 w-[1px] bg-[#C9A24A]/40 shrink-0" />

            {/* Phone */}
            <div className="flex items-center gap-1.5 text-[#FAF7F0]/90">
              <Phone className="w-3.5 h-3.5 text-[#C9A24A] shrink-0" />
              <div className="font-extrabold text-white tracking-wider text-[10.5px]" style={{ whiteSpace: 'nowrap' }}>
                {SHOWROOM_PHONE}
              </div>
            </div>
          </div>

          {/* RIGHT: BILL INFORMATION (BILL NO., ORDER NO., BILLING DATE, DUE DATE) */}
          <div className="flex flex-col items-end justify-center border-l border-[#C9A24A]/40 pl-3" style={{ boxSizing: 'border-box' }}>
            <div 
              style={{
                display: 'grid',
                gridTemplateColumns: 'max-content max-content max-content',
                columnGap: '5px',
                rowGap: '2.5px',
                justifyContent: 'end',
                alignItems: 'center',
                boxSizing: 'border-box'
              }}
            >
              <span style={{ fontSize: '9px', fontWeight: 700, color: '#D4AF5A', textTransform: 'uppercase', whiteSpace: 'nowrap', textAlign: 'right' }}>
                BILL NO.
              </span>
              <span style={{ fontSize: '9px', fontWeight: 700, color: '#D4AF5A', textAlign: 'center' }}>:</span>
              <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#FFFFFF', whiteSpace: 'nowrap', textAlign: 'left' }}>
                {billNo}
              </span>

              <span style={{ fontSize: '9px', fontWeight: 700, color: '#D4AF5A', textTransform: 'uppercase', whiteSpace: 'nowrap', textAlign: 'right' }}>
                ORDER NO.
              </span>
              <span style={{ fontSize: '9px', fontWeight: 700, color: '#D4AF5A', textAlign: 'center' }}>:</span>
              <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#FFFFFF', whiteSpace: 'nowrap', textAlign: 'left' }}>
                {orderNo}
              </span>

              <span style={{ fontSize: '9px', fontWeight: 700, color: '#D4AF5A', textTransform: 'uppercase', whiteSpace: 'nowrap', textAlign: 'right' }}>
                BILLING DATE
              </span>
              <span style={{ fontSize: '9px', fontWeight: 700, color: '#D4AF5A', textAlign: 'center' }}>:</span>
              <span style={{ fontSize: '10px', fontWeight: 600, color: '#FFFFFF', whiteSpace: 'nowrap', textAlign: 'left' }}>
                {billingDate}
              </span>

              <span style={{ fontSize: '9px', fontWeight: 700, color: '#D4AF5A', textTransform: 'uppercase', whiteSpace: 'nowrap', textAlign: 'right' }}>
                DUE DATE
              </span>
              <span style={{ fontSize: '9px', fontWeight: 700, color: '#D4AF5A', textAlign: 'center' }}>:</span>
              <span style={{ fontSize: '10px', fontWeight: 600, color: '#FFFFFF', whiteSpace: 'nowrap', textAlign: 'left' }}>
                {dueDate}
              </span>
            </div>
          </div>
        </div>

        {/* Decorative Gold Curved Divider Line at Bottom of Header */}
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#8A6822] via-[#E5C16C] to-[#8A6822]"></div>
      </div>

      {/* ======================================================== */}
      {/* 2. BODY CONTENT (WARM IVORY CANVAS) */}
      {/* ======================================================== */}
      <div className="p-3.5 sm:p-4 space-y-3" style={{ boxSizing: 'border-box' }}>

        {/* ---------------------------------------------------- */}
        {/* CUSTOMER DETAILS & ORDER DETAILS (SIDE-BY-SIDE 1fr 1fr) */}
        {/* ---------------------------------------------------- */}
        <div 
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '12px',
            width: '100%',
            boxSizing: 'border-box'
          }}
        >
          {/* LEFT: CUSTOMER DETAILS */}
          <div className="bg-[#FAF7F0] p-2.5 rounded-xl border border-[#DFD7C7] space-y-1.5 shadow-2xs" style={{ boxSizing: 'border-box' }}>
            <div className="flex items-center gap-1.5 pb-1 border-b border-[#E8E0D2]">
              <div className="w-5 h-5 rounded-md bg-[#C9A24A] text-white flex items-center justify-center shadow-xs">
                <User className="w-3.5 h-3.5 text-white" />
              </div>
              <h3 className="text-[11px] font-black tracking-wider text-[#071426] uppercase" style={{ whiteSpace: 'nowrap', margin: 0 }}>
                CUSTOMER DETAILS
              </h3>
            </div>

            {/* Customer Key-Values Grid (Label | : | Value) */}
            <div 
              style={{
                display: 'grid',
                gridTemplateColumns: 'max-content max-content 1fr',
                rowGap: '3.5px',
                columnGap: '6px',
                alignItems: 'baseline',
                boxSizing: 'border-box'
              }}
            >
              <span className="font-bold text-[#4A5568] uppercase text-[9.5px]" style={{ whiteSpace: 'nowrap' }}>CUSTOMER NAME</span>
              <span className="font-bold text-[#4A5568] text-[10px]">:</span>
              <span className="font-extrabold text-[#071426] truncate text-[11px]">{customerName}</span>

              <span className="font-bold text-[#4A5568] uppercase text-[9.5px]" style={{ whiteSpace: 'nowrap' }}>MOBILE NUMBER</span>
              <span className="font-bold text-[#4A5568] text-[10px]">:</span>
              <span className="font-bold text-[#071426] text-[11px]">{customerPhone}</span>

              <span className="font-bold text-[#4A5568] uppercase text-[9.5px]" style={{ whiteSpace: 'nowrap' }}>ADDRESS</span>
              <span className="font-bold text-[#4A5568] text-[10px]">:</span>
              <span className="font-medium text-[#071426] truncate text-[10.5px]">{customerAddress}</span>
            </div>
          </div>

          {/* RIGHT: ORDER DETAILS */}
          <div className="bg-[#FAF7F0] p-2.5 rounded-xl border border-[#DFD7C7] space-y-1.5 shadow-2xs" style={{ boxSizing: 'border-box' }}>
            <div className="flex items-center gap-1.5 pb-1 border-b border-[#E8E0D2]">
              <div className="w-5 h-5 rounded-md bg-[#C9A24A] text-white flex items-center justify-center shadow-xs">
                <FileText className="w-3.5 h-3.5 text-white" />
              </div>
              <h3 className="text-[11px] font-black tracking-wider text-[#071426] uppercase" style={{ whiteSpace: 'nowrap', margin: 0 }}>
                ORDER DETAILS
              </h3>
            </div>

            {/* Order Key-Values Grid (Label | : | Value) */}
            <div 
              style={{
                display: 'grid',
                gridTemplateColumns: 'max-content max-content 1fr',
                rowGap: '3.5px',
                columnGap: '6px',
                alignItems: 'baseline',
                boxSizing: 'border-box'
              }}
            >
              <span className="font-bold text-[#4A5568] uppercase text-[9.5px]" style={{ whiteSpace: 'nowrap' }}>ORDER DATE</span>
              <span className="font-bold text-[#4A5568] text-[10px]">:</span>
              <span className="font-bold text-[#071426] text-[11px]">{orderDateDisplay}</span>

              <span className="font-bold text-[#4A5568] uppercase text-[9.5px]" style={{ whiteSpace: 'nowrap' }}>DELIVERY DATE</span>
              <span className="font-bold text-[#4A5568] text-[10px]">:</span>
              <span className="font-bold text-[#071426] text-[11px]">{deliveryDateDisplay}</span>

              <span className="font-bold text-[#4A5568] uppercase text-[9.5px]" style={{ whiteSpace: 'nowrap' }}>PAYMENT METHOD</span>
              <span className="font-bold text-[#4A5568] text-[10px]">:</span>
              <span className="font-bold text-[#071426] text-[11px]">{paymentMethodDisplay}</span>
            </div>
          </div>
        </div>

        {/* ---------------------------------------------------- */}
        {/* 3. ITEMIZED GARMENT TABLE (100% FIXED WIDTH) */}
        {/* ---------------------------------------------------- */}
        <div className="rounded-xl overflow-hidden border border-[#DFD7C7] shadow-2xs bg-white" style={{ boxSizing: 'border-box', width: '100%' }}>
          <table className="w-full text-left text-xs border-collapse" style={{ tableLayout: 'fixed', width: '100%', boxSizing: 'border-box' }}>
            <thead>
              <tr className="bg-[#071426] text-[#D4AF5A] font-extrabold uppercase text-[10px] tracking-wider border-b border-[#071426]">
                <th style={{ width: '8%', textAlign: 'center', padding: '6px 4px', borderRight: '1px solid rgba(201, 162, 74, 0.3)' }}>S.NO.</th>
                <th style={{ width: '22%', textAlign: 'left', padding: '6px 8px', borderRight: '1px solid rgba(201, 162, 74, 0.3)' }}>ITEM / GARMENT</th>
                <th style={{ width: '38%', textAlign: 'left', padding: '6px 8px', borderRight: '1px solid rgba(201, 162, 74, 0.3)' }}>DESCRIPTION</th>
                <th style={{ width: '8%', textAlign: 'center', padding: '6px 4px', borderRight: '1px solid rgba(201, 162, 74, 0.3)' }}>QTY.</th>
                <th style={{ width: '12%', textAlign: 'right', padding: '6px 8px', borderRight: '1px solid rgba(201, 162, 74, 0.3)' }}>RATE (₹)</th>
                <th style={{ width: '12%', textAlign: 'right', padding: '6px 8px' }}>AMOUNT (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EAE3D5] text-[#071426]">
              {items.length > 0 ? (
                items.map((item, idx) => {
                  const qty = item.quantity || 1;
                  const rate = item.price || 0;
                  const amount = qty * rate;
                  
                  const desc = [
                    item.fabricName,
                    item.fabricCode ? `Code: ${item.fabricCode}` : '',
                    item.styleNotes
                  ].filter(Boolean).join(' • ') || '—';

                  return (
                    <tr key={idx} className={idx % 2 === 1 ? 'bg-[#FAF8F5]' : 'bg-white'}>
                      <td className="py-2.5 px-1 text-center font-bold text-[#071426] text-[10.5px] border-r border-[#EAE3D5]">{idx + 1}</td>
                      <td className="py-2.5 px-2 font-black text-[#071426] text-[11px] truncate border-r border-[#EAE3D5]">{item.garmentType}</td>
                      <td 
                        className="py-2.5 px-2 font-medium text-[#4A5568] text-[10px] leading-snug border-r border-[#EAE3D5]"
                        style={{ overflowWrap: 'break-word', wordBreak: 'normal' }}
                      >
                        {desc}
                      </td>
                      <td className="py-2.5 px-1 text-center font-bold text-[#071426] text-[10.5px] border-r border-[#EAE3D5]">{qty}</td>
                      <td className="py-2.5 px-2 text-right font-bold text-[#071426] text-[10.5px] border-r border-[#EAE3D5]">{formatNumber(rate)}</td>
                      <td className="py-2.5 px-2 text-right font-black text-[#071426] text-[10.5px]">{formatNumber(amount)}</td>
                    </tr>
                  );
                })
              ) : (
                /* Blank Template Row */
                <tr>
                  <td className="py-2 px-1 text-center font-bold text-[#8C7E6A] border-r border-[#EAE3D5]">—</td>
                  <td className="py-2 px-2 font-bold text-[#8C7E6A] border-r border-[#EAE3D5]">—</td>
                  <td className="py-2 px-2 font-medium text-[#8C7E6A] border-r border-[#EAE3D5]">—</td>
                  <td className="py-2 px-1 text-center font-bold text-[#8C7E6A] border-r border-[#EAE3D5]">—</td>
                  <td className="py-2 px-2 text-right font-semibold text-[#8C7E6A] border-r border-[#EAE3D5]">—</td>
                  <td className="py-2 px-2 text-right font-black text-[#8C7E6A]">—</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ---------------------------------------------------- */}
        {/* 4. FINANCIAL SUMMARY & DECORATIVE APPRECIATION CARD */}
        {/* ---------------------------------------------------- */}
        <div 
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '12px',
            alignItems: 'start',
            width: '100%',
            boxSizing: 'border-box'
          }}
        >
          {/* LEFT: DECORATIVE APPRECIATION BOX */}
          <div className="bg-[#FAF7F0] p-3 rounded-xl border border-[#DFD7C7] flex flex-col items-center justify-center text-center relative overflow-hidden shadow-2xs min-h-[142px]" style={{ boxSizing: 'border-box' }}>
            
            {/* Subtle Background Watermark (Regency Monogram) */}
            <div className="absolute inset-0 flex items-center justify-center opacity-6 pointer-events-none">
              <svg width="115" height="115" viewBox="0 0 100 100" fill="#C9A24A">
                <circle cx="50" cy="50" r="45" stroke="#C9A24A" strokeWidth="2.5" fill="none" />
                <path d="M42 22 L34 78 M34 22 L56 22 C66 22 70 30 70 38 C70 47 63 52 52 52 L34 52 M50 52 L68 78" stroke="#C9A24A" strokeWidth="4" strokeLinecap="round" />
              </svg>
            </div>

            {/* Top Ornate Filigree Flourish */}
            <svg width="40" height="9" viewBox="0 0 60 12" fill="#C9A24A" className="mb-1 opacity-85">
              <path d="M30 0 C35 6, 45 8, 60 8 C45 8, 40 12, 30 12 C20 12, 15 8, 0 8 C15 8, 25 6, 30 0 Z" />
            </svg>

            {/* Appreciation Message */}
            <div className="space-y-0.5 z-10 my-auto">
              <p className="text-[11px] font-bold text-[#071426] tracking-wide">
                We appreciate your trust in
              </p>
              <p 
                className="text-sm sm:text-base font-black text-[#C9A24A] tracking-wider"
                style={{ fontFamily: "'Cinzel', 'Playfair Display', 'Manrope', serif" }}
              >
                REGENCY TAILOR.
              </p>
            </div>

            {/* Bottom Ornate Filigree Flourish */}
            <svg width="40" height="9" viewBox="0 0 60 12" fill="#C9A24A" className="mt-1 opacity-85 rotate-180">
              <path d="M30 0 C35 6, 45 8, 60 8 C45 8, 40 12, 30 12 C20 12, 15 8, 0 8 C15 8, 25 6, 30 0 Z" />
            </svg>
          </div>

          {/* RIGHT: FINANCIAL TOTALS BREAKDOWN */}
          <div className="bg-white rounded-xl border border-[#DFD7C7] overflow-hidden shadow-2xs text-xs" style={{ boxSizing: 'border-box' }}>
            
            {/* SUB TOTAL */}
            <div className="flex justify-between items-center py-2 px-3.5 border-b border-[#F0EAE0]">
              <span className="font-bold text-[#4A5568] uppercase tracking-wider text-[9.5px]" style={{ whiteSpace: 'nowrap' }}>SUB TOTAL</span>
              <span className="font-black text-[11px] text-[#071426]">₹{formatNumber(subtotal)}</span>
            </div>

            {/* DISCOUNT */}
            <div className="flex justify-between items-center py-2 px-3.5 border-b border-[#F0EAE0]">
              <span className="font-bold text-[#4A5568] uppercase tracking-wider text-[9.5px]" style={{ whiteSpace: 'nowrap' }}>DISCOUNT</span>
              <span className="font-bold text-[11px] text-[#15803D]">
                {discount > 0 ? `-₹${formatNumber(discount)}` : `₹0.00`}
              </span>
            </div>

            {/* GRAND TOTAL (CHAMPAGNE GOLD HIGHLIGHT BAR) */}
            <div className="flex justify-between items-center py-2 px-3.5 bg-[#C9A24A] text-[#071426]">
              <span className="font-black uppercase tracking-wider text-[10.5px]" style={{ whiteSpace: 'nowrap' }}>GRAND TOTAL</span>
              <span className="font-black text-sm">₹{formatNumber(grandTotal)}</span>
            </div>

            {/* AMOUNT PAID */}
            <div className="flex justify-between items-center py-2 px-3.5 border-b border-[#F0EAE0]">
              <span className="font-bold text-[#4A5568] uppercase tracking-wider text-[9.5px]" style={{ whiteSpace: 'nowrap' }}>AMOUNT PAID</span>
              <span className="font-black text-[11px] text-[#15803D]">₹{formatNumber(amountPaid)}</span>
            </div>

            {/* BALANCE DUE (MIDNIGHT NAVY BAR) */}
            <div className="flex justify-between items-center py-2 px-3.5 bg-[#071426] text-white">
              <span className="font-black uppercase tracking-wider text-[10.5px] text-[#D4AF5A]" style={{ whiteSpace: 'nowrap' }}>BALANCE DUE</span>
              <span className="font-black text-sm text-white">₹{formatNumber(balanceDue)}</span>
            </div>
          </div>
        </div>

        {/* ---------------------------------------------------- */}
        {/* 5. THANK YOU SECTION */}
        {/* ---------------------------------------------------- */}
        <div className="pt-1 text-center space-y-0.5" style={{ boxSizing: 'border-box' }}>
          <div className="flex items-center justify-center gap-2.5">
            <div className="h-[1px] bg-gradient-to-r from-transparent to-[#C9A24A] flex-1 max-w-[90px]"></div>
            <h4 className="text-xs font-black text-[#071426] uppercase tracking-widest" style={{ whiteSpace: 'nowrap', margin: 0 }}>
              THANK YOU!
            </h4>
            <div className="h-[1px] bg-gradient-to-l from-transparent to-[#C9A24A] flex-1 max-w-[90px]"></div>
          </div>

          <p className="text-[10px] font-semibold text-[#4A5568]" style={{ margin: 0 }}>
            For choosing Regency Tailor.
          </p>

          <div className="pt-0.5">
            <div className="text-[9px] text-[#8C7E6A] font-medium">Regards,</div>
            <div className="text-[11px] font-extrabold text-[#C9A24A] uppercase tracking-wider">
              Regency Tailor
            </div>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 6. BOTTOM FOOTER (MIDNIGHT NAVY WITH SHOWROOM DETAILS) */}
      {/* ======================================================== */}
      <div className="bg-[#071426] text-white py-2 px-4 sm:px-5 mt-1 relative" style={{ width: '100%', boxSizing: 'border-box' }}>
        {/* Top Accent Gold Line */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#8A6822] via-[#E5C16C] to-[#8A6822]"></div>

        <div className="flex items-center justify-between gap-2 text-xs" style={{ width: '100%', boxSizing: 'border-box' }}>
          {/* Showroom Address Left */}
          <div className="flex items-center gap-1.5 text-left">
            <MapPin className="w-3.5 h-3.5 text-[#C9A24A] shrink-0" />
            <div className="text-[9.5px] leading-tight">
              <span className="font-bold text-white uppercase">{SHOWROOM_ADDRESS_LINE1} </span>
              <span className="text-[#D8CFBF] uppercase">{SHOWROOM_ADDRESS_LINE2}</span>
            </div>
          </div>

          {/* Center Regency Monogram */}
          <div className="w-6.5 h-6.5 rounded-full border border-[#C9A24A]/80 overflow-hidden flex items-center justify-center bg-[#071426] shadow-xs shrink-0">
            {logoFailed ? (
              <span className="text-[9px] font-black text-[#D4AF5A] tracking-wider" style={{ fontFamily: "'Cinzel', serif" }}>
                RT
              </span>
            ) : (
              <img
                src={logoSrc}
                alt="Regency Tailor"
                onError={handleLogoError}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            )}
          </div>

          {/* Showroom Mobile Right */}
          <div className="flex items-center gap-1.5 text-right">
            <Phone className="w-3.5 h-3.5 text-[#C9A24A] shrink-0" />
            <div className="text-[10.5px] font-bold text-white tracking-wider">
              {SHOWROOM_PHONE}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
