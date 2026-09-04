import React, { useLayoutEffect, useRef, useState } from 'react';
import { MapPin, Phone, User, FileText } from 'lucide-react';
import { Order, MeasurementRecord, ShowroomProfile } from '../../types';
import {
  BillColumnWidths,
  BillDensity,
  INITIAL_DENSITY,
  densityTokens,
  planOrderBill,
  tighterDensity
} from '../../utils/orderBillLayout';
import { OrderBillGarmentRow } from './OrderBillGarmentRow';
import regencyLogoImg from '../../assets/images/regency-tailors-logo.jpg';
import instagramQrImg from '../../assets/images/regency-instagram-qr.webp';
import googleQrImg from '../../assets/images/regency-google-qr.webp';
import { SHOWROOM_ADDRESS_LINE1, SHOWROOM_ADDRESS_LINE2, SHOWROOM_PHONE } from './PrintableRegencyBill';

export interface OrderBillPageProps {
  id: string;
  order: Order;
  snapshot: Partial<MeasurementRecord>;
  profile?: ShowroomProfile | null;
  /** Reports the density actually used once the sheet has been measured. */
  onDensityResolved?: (density: BillDensity) => void;
}

const TABLE_COLUMNS: { label: string; key: keyof BillColumnWidths; align?: 'left' | 'center' }[] = [
  { label: 'S.NO.', key: 'sno', align: 'center' },
  { label: 'PRODUCT / GARMENT', key: 'garment' },
  { label: 'QTY.', key: 'qty', align: 'center' },
  { label: 'AMOUNT', key: 'amount', align: 'center' }
];

/**
 * The customer order bill — one A4 portrait sheet, always.
 *
 * Three rules this document holds to everywhere, not just in the obvious spot:
 *
 *   - It is never more than one page. The sheet is a fixed-height box, and the
 *     effect below measures the real rendered content and tightens the density
 *     tier until it fits. Nothing is clipped or dropped to achieve that: the
 *     layout gets denser, the content stays whole.
 *   - No measurement of any kind appears here. That is the Production Slip's
 *     job; this component never imports the measurement-table logic at all.
 *   - No financial figure is ever computed or pre-filled. A Payment Details
 *     section exists, per the showroom's request, entirely as blank lines for
 *     the owner to fill in by hand — never populated from the order's stored
 *     totals, which is why `order.totalAmount` etc. are never read here.
 */
export const OrderBillPage: React.FC<OrderBillPageProps> = ({
  id,
  order,
  snapshot,
  profile,
  onDensityResolved
}) => {
  const plan = planOrderBill(order, snapshot);
  const [density, setDensity] = useState<BillDensity>(INITIAL_DENSITY);
  // Set only in the extreme case handled below: content that still overflows
  // at the floor density tier. The garment catalog offers five garment types,
  // each selectable once, so no order the wizard can produce reaches this —
  // it exists only so an unusually large imported or hand-edited order is
  // never silently clipped.
  const [overflowSafety, setOverflowSafety] = useState(false);
  const flowRef = useRef<HTMLDivElement>(null);

  // Restart from the loosest tier whenever the order changes, so a bill that
  // got tightened for a previous order does not stay tight for the next one.
  const orderKey = order?.id || order?.orderNumber || '';
  useLayoutEffect(() => {
    setDensity(INITIAL_DENSITY);
    setOverflowSafety(false);
  }, [orderKey]);

  const densityCallback = useRef(onDensityResolved);
  densityCallback.current = onDensityResolved;

  /**
   * Measured auto-fit. Runs before paint, so a tightened tier is never seen as
   * a flicker. One step per commit: setting state re-runs this effect against
   * the newly rendered tier, walking down only as far as the content needs —
   * which means the tier that survives is the loosest one that actually fits.
   */
  useLayoutEffect(() => {
    const flow = flowRef.current;
    if (!flow) return;
    // scrollHeight vs clientHeight is a direct overflow test on the flex
    // region that holds the document body — no millimetre conversion, and no
    // assumption about the print scale factor.
    const overflows = flow.scrollHeight > flow.clientHeight + 1;
    if (overflows) {
      const next = tighterDensity(density);
      if (next) {
        setDensity(next);
        return;
      }
      // Already at the floor tier and still too tall. Every field is at its
      // smallest readable size, so the only remaining choices are to clip
      // content or let the sheet grow past one page for this one order.
      // Losing content is never acceptable, so it grows — printing very
      // slightly onto a second sheet is a far smaller failure than a
      // customer bill missing a garment the shop is actually making them.
      setOverflowSafety(true);
    }
    densityCallback.current?.(density);
  }, [density]);

  const tokens = densityTokens(density);

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
      <span
        className="font-bold text-[#4A5568] uppercase tracking-wide"
        style={{ whiteSpace: 'nowrap', fontSize: tokens.metaLabelPx }}
      >
        {label}
      </span>
      <span className="font-bold text-[#4A5568]" style={{ fontSize: tokens.metaLabelPx }}>:</span>
      <span className="font-black text-[#071426]" style={{ fontSize: tokens.metaValuePx }}>
        {value}
      </span>
    </>
  );

  const paymentLine = (label: string) => (
    <div className="flex items-baseline gap-2">
      <span
        className="font-black text-[#071426] uppercase tracking-wide shrink-0"
        style={{ whiteSpace: 'nowrap', fontSize: tokens.paymentLabelPx }}
      >
        {label}
      </span>
      <span className="flex-1 border-b border-[#8C7E6A]" style={{ height: tokens.paymentLineH }} />
    </div>
  );

  /**
   * A QR tile. Both codes sit on their own white card: the Instagram file has
   * a fully transparent edge, and a QR needs a light quiet zone around it to
   * scan reliably — neither can be left to chance on a navy header.
   *
   * Both source images place their code across 80% of their own width, so
   * giving both tiles the same width renders both codes at the same module
   * size. Height is left to follow the aspect ratio, which is why the
   * Instagram tile is taller: its file carries its @handle caption beneath
   * the code, and squeezing that to match would distort the code itself.
   */
  const qrTile = (src: string, alt: string, label: string) => (
    <div className="flex flex-col items-center gap-1" style={{ width: tokens.qrPx }}>
      <div className="bg-white rounded-lg p-[3px] border border-[#C9A24A]/50" style={{ width: '100%' }}>
        <img
          src={src}
          alt={alt}
          className="w-full h-auto block"
          style={{ objectFit: 'contain', imageRendering: 'crisp-edges' }}
        />
      </div>
      <span
        className="font-bold text-[#D8CFBF] uppercase text-center leading-tight"
        style={{ fontSize: tokens.qrLabelPx, letterSpacing: '0.04em' }}
      >
        {label}
      </span>
    </div>
  );

  return (
    <div
      id={id}
      data-density={density}
      data-overflow-safety={overflowSafety || undefined}
      className="a4-bill-page bg-[#FAF7F0] border-2 border-[#C9A24A] rounded-2xl overflow-hidden mx-auto flex flex-col text-[#071426] print:rounded-none print:border-none"
      style={{
        boxSizing: 'border-box',
        fontFamily: "'Manrope', system-ui, -apple-system, sans-serif",
        // The one documented exception to a fixed one-page height: content
        // that still overflows at the smallest readable type. See the
        // overflow-safety branch in the measuring effect above.
        ...(overflowSafety ? { height: 'auto', maxHeight: 'none', overflow: 'visible' } : {})
      }}
    >
      {/* The measured region: everything except the fixed footer bar. Laid out
          as a column so the garment table can absorb whatever space the order
          does not need, which keeps the closing blocks on the bottom edge of
          the sheet instead of leaving a pool of dead space beneath them. */}
      <div
        ref={flowRef}
        className="a4-bill-flow flex-1 min-h-0 flex flex-col"
        style={overflowSafety ? { overflow: 'visible', height: 'auto', maxHeight: 'none' } : { overflow: 'hidden' }}
      >
        {/* ============ PREMIUM BRAND HEADER ============ */}
        <div
          className="bg-[#071426] text-white px-5 relative"
          style={{ paddingTop: tokens.headerPadY, paddingBottom: tokens.headerPadY * 0.7 }}
        >
          <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#8A6822] via-[#F0D48A] to-[#8A6822]" />

          {/* QR | brand | QR. The codes occupy the space either side of a
              centred lockup that would otherwise be empty, which is what keeps
              the header from growing to accommodate them. */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `${tokens.qrPx}px 1fr ${tokens.qrPx}px`,
              alignItems: 'center',
              columnGap: 12
            }}
          >
            {qrTile(instagramQrImg, 'Regency Tailor on Instagram', 'Follow Us On Instagram')}

            <div className="text-center">
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
              <div className="mx-auto" style={{ width: tokens.logoPx }}>
                <img
                  src={regencyLogoImg}
                  alt="Regency Tailor"
                  className="w-full h-auto object-contain select-none block"
                />
              </div>

              <h1
                className="font-black tracking-[0.16em] text-[#D4AF5A] uppercase m-0"
                style={{
                  fontFamily: "'Cinzel', 'Playfair Display', serif",
                  lineHeight: 1.12,
                  fontSize: tokens.brandPx,
                  marginTop: tokens.sectionGap * 0.5
                }}
              >
                REGENCY TAILOR
              </h1>

              <div
                className="font-bold text-[#E6D5B8] uppercase"
                style={{ fontSize: tokens.taglinePx, letterSpacing: '0.22em', marginTop: 3 }}
              >
                PREMIUM TAILORING &nbsp;•&nbsp; PERFECT FIT &nbsp;•&nbsp; TIMELESS STYLE
              </div>
            </div>

            {qrTile(googleQrImg, 'Regency Tailor on Google', 'Review Us On Google')}
          </div>

          <div
            className="w-full h-[1.5px] bg-gradient-to-r from-transparent via-[#C9A24A]/70 to-transparent"
            style={{ marginTop: tokens.sectionGap * 0.7, marginBottom: tokens.sectionGap * 0.55 }}
          />

          <div className="flex items-center justify-center gap-1.5 flex-wrap">
            <MapPin className="w-3 h-3 text-[#C9A24A] shrink-0" />
            <span
              className="font-bold text-[#D8CFBF] uppercase tracking-wide"
              style={{ fontSize: tokens.metaValuePx }}
            >
              {showroomAddress}
            </span>
            <span className="text-[#C9A24A] mx-1">•</span>
            <Phone className="w-3 h-3 text-[#C9A24A] shrink-0" />
            <span className="font-bold text-white tracking-wider" style={{ fontSize: tokens.metaValuePx }}>
              {showroomPhone}
            </span>
          </div>
        </div>

        {/* ============ CUSTOMER + ORDER ============ */}
        <div className="px-5" style={{ paddingTop: tokens.sectionGap, paddingBottom: tokens.sectionGap * 0.5 }}>
          <div className="text-center" style={{ marginBottom: tokens.sectionGap * 0.8 }}>
            <span
              className="inline-block font-black tracking-[0.3em] text-[#8C7E6A] uppercase border-y border-[#DFD7C7] px-8"
              style={{ fontSize: tokens.metaValuePx, paddingTop: 4, paddingBottom: 4 }}
            >
              Customer Bill
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div
              className="bg-white rounded-xl border border-[#DFD7C7]"
              style={{ padding: tokens.blockPadY }}
            >
              <div
                className="flex items-center gap-1.5 border-b border-[#E8E0D2]"
                style={{ paddingBottom: 4, marginBottom: 5 }}
              >
                <div className="w-4 h-4 rounded-md bg-[#C9A24A] text-white flex items-center justify-center shrink-0">
                  <User className="w-3 h-3" />
                </div>
                <h3
                  className="font-black tracking-wider text-[#071426] uppercase m-0"
                  style={{ fontSize: tokens.metaValuePx }}
                >
                  CUSTOMER DETAILS
                </h3>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'max-content max-content 1fr',
                  rowGap: 3,
                  columnGap: 6,
                  alignItems: 'baseline'
                }}
              >
                {metaRow('NAME', order.customerName || '—')}
                {metaRow('MOBILE', order.customerPhone || '—')}
                {metaRow('ADDRESS', addressLine || '—')}
              </div>
            </div>

            <div
              className="bg-white rounded-xl border border-[#DFD7C7]"
              style={{ padding: tokens.blockPadY }}
            >
              <div
                className="flex items-center gap-1.5 border-b border-[#E8E0D2]"
                style={{ paddingBottom: 4, marginBottom: 5 }}
              >
                <div className="w-4 h-4 rounded-md bg-[#C9A24A] text-white flex items-center justify-center shrink-0">
                  <FileText className="w-3 h-3" />
                </div>
                <h3
                  className="font-black tracking-wider text-[#071426] uppercase m-0"
                  style={{ fontSize: tokens.metaValuePx }}
                >
                  ORDER DETAILS
                </h3>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'max-content max-content 1fr',
                  rowGap: 3,
                  columnGap: 6,
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

        {/* ============ PRODUCT / GARMENT TABLE (no measurements, no computed amounts) ============ */}
        <div
          className="px-5"
          style={{ paddingTop: tokens.sectionGap * 0.5, paddingBottom: tokens.sectionGap * 0.6 }}
        >
          <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
            <span
              className="font-black text-[#071426] uppercase tracking-wider"
              style={{ fontSize: tokens.metaValuePx }}
            >
              Product / Garment Details
            </span>
            <span
              className="font-bold text-[#8C7E6A] uppercase tracking-wider"
              style={{ fontSize: tokens.metaLabelPx }}
            >
              {garmentCount} {garmentCount === 1 ? 'Piece' : 'Pieces'}
            </span>
          </div>

          <table
            className="order-bill-table w-full border-collapse rounded-lg overflow-hidden"
            style={{ tableLayout: 'fixed', width: '100%' }}
          >
            <colgroup>
              {TABLE_COLUMNS.map((c, i) => (
                <col key={i} style={{ width: `${tokens.columns[c.key]}%` }} />
              ))}
            </colgroup>
            <thead>
              <tr className="bg-[#071426] text-[#D4AF5A]">
                {TABLE_COLUMNS.map((c, i) => (
                  <th
                    key={i}
                    className="border border-[#071426] font-black uppercase tracking-wider"
                    style={{
                      fontSize: tokens.tableHeadPx,
                      textAlign: c.align === 'center' ? 'center' : 'left',
                      paddingTop: 5,
                      paddingBottom: 5,
                      paddingLeft: 6,
                      paddingRight: 6
                    }}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {plan.items.map(({ item, originalIndex }) => (
                <OrderBillGarmentRow
                  key={item.id || originalIndex}
                  item={item}
                  index={originalIndex}
                  snapshot={snapshot}
                  tokens={tokens}
                />
              ))}
            </tbody>
          </table>
        </div>

        {/*
          Flexible spacer. A short order does not fill 277mm on its own, and
          the closing blocks below are fixed height — so *something* has to
          absorb the leftover room. The only flex-grow child in this column,
          so it silently takes whatever the header/details/table/closing did
          not need, keeping the closing blocks anchored to the bottom edge of
          the sheet instead of leaving them stranded mid-page.
        */}
        <div style={{ flex: '1 1 auto', minHeight: tokens.sectionGap, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="w-full px-10 flex items-center gap-3">
            <div className="flex-1 border-t border-[#C9A24A]/60" />
            <div className="border border-[#C9A24A] shrink-0" style={{ width: 6, height: 6, transform: 'rotate(45deg)' }} />
            <div className="flex-1 border-t border-[#C9A24A]/60" />
          </div>
        </div>

        {/* ============ CLOSING: notes, payment lines, terms, signatures, disclaimer ============ */}
        <div className="px-5" style={{ paddingBottom: tokens.sectionGap * 0.5 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: tokens.sectionGap * 0.75 }}>
            {orderNotes && (
              <div
                className="bg-white border border-[#DFD7C7] rounded-xl px-3"
                style={{ paddingTop: tokens.blockPadY * 0.7, paddingBottom: tokens.blockPadY * 0.7 }}
              >
                <span
                  className="block font-black text-[#8C7E6A] uppercase tracking-wider"
                  style={{ fontSize: tokens.metaLabelPx }}
                >
                  Order Notes
                </span>
                <p
                  className="font-semibold text-[#071426] m-0 whitespace-pre-wrap"
                  style={{ fontSize: tokens.rowTextPx, lineHeight: tokens.rowLeading }}
                >
                  {orderNotes}
                </p>
              </div>
            )}

            {/* PAYMENT DETAILS — blank lines only. Never populated, never calculated. */}
            <div
              className="bg-white border-2 border-[#C9A24A] rounded-xl px-4"
              style={{ paddingTop: tokens.blockPadY, paddingBottom: tokens.blockPadY }}
            >
              <h4
                className="font-black text-[#071426] uppercase tracking-[0.2em] m-0 border-b border-[#E8E0D2]"
                style={{
                  fontSize: tokens.metaValuePx,
                  marginBottom: tokens.paymentRowGap * 0.7,
                  paddingBottom: 5
                }}
              >
                Payment Details
              </h4>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  columnGap: 20,
                  rowGap: tokens.paymentRowGap
                }}
              >
                {paymentLine('Total Amount')}
                {paymentLine('Advance Paid')}
                {paymentLine('Balance')}
                {paymentLine('Payment Mode')}
              </div>
              <div style={{ marginTop: tokens.paymentRowGap }}>{paymentLine('Payment Date')}</div>
            </div>

            {/* TERMS & CONDITIONS — short, factual, nothing invented */}
            <div
              className="bg-[#FAF7F0] border border-[#DFD7C7] rounded-xl px-3.5"
              style={{ paddingTop: tokens.blockPadY * 0.65, paddingBottom: tokens.blockPadY * 0.65 }}
            >
              <span
                className="block font-black text-[#8C7E6A] uppercase tracking-wider"
                style={{ fontSize: tokens.metaLabelPx, marginBottom: 2 }}
              >
                Terms &amp; Conditions
              </span>
              <ul
                className="font-semibold text-[#4A5568] m-0 pl-3.5"
                style={{ listStyleType: 'disc', fontSize: tokens.termsPx, lineHeight: 1.45 }}
              >
                <li>Please retain this bill and present it at the time of order collection.</li>
                <li>Kindly verify all garment details at the time of delivery.</li>
              </ul>
            </div>

            {/* REQUIRED FINAL DISCLAIMER — the closing message of the whole document */}
            <div
              className="bg-[#071426] rounded-xl px-4 text-center border-2 border-[#C9A24A]"
              style={{ paddingTop: tokens.blockPadY * 0.7, paddingBottom: tokens.blockPadY * 0.7 }}
            >
              <p
                className="font-black text-[#F0D48A] uppercase tracking-wide m-0"
                style={{ fontSize: tokens.disclaimerPx }}
              >
                We are not responsible for clothes after 2 months.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ============ FOOTER ============ */}
      <div className="bg-[#071426] text-white px-5 py-1.5 relative shrink-0">
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#8A6822] via-[#E5C16C] to-[#8A6822]" />
        <div className="flex items-center justify-between gap-2">
          <span
            className="font-bold text-[#D8CFBF] uppercase tracking-wider truncate"
            style={{ fontSize: tokens.metaLabelPx }}
          >
            {showroomAddress} &nbsp;•&nbsp; {showroomPhone}
          </span>
          <span
            className="font-black text-[#D4AF5A] font-mono shrink-0"
            style={{ fontSize: tokens.metaLabelPx }}
          >
            {billNo}
          </span>
        </div>
      </div>
    </div>
  );
};
