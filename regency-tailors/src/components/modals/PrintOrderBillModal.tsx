import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { X, Printer, Download, Check, Loader2, FileCheck2, ReceiptText } from 'lucide-react';
import { Order, ShowroomProfile } from '../../types';
import { OrderBillPage } from '../bills/OrderBillPage';
import { downloadElementAsPdf } from '../../utils/documentExport';

interface PrintOrderBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order | null;
  profile?: ShowroomProfile | null;
}

/**
 * The customer-facing order bill.
 *
 * Separate document from the workshop Production Slip, and separate from the
 * admin bill that carries figures. This one contains no financial information
 * at all — the showroom writes the amount on the printed sheet by hand, and it
 * always prints as exactly one A4 sheet.
 */
export const PrintOrderBillModal: React.FC<PrintOrderBillModalProps> = ({
  isOpen,
  onClose,
  order,
  profile
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const snapshot = order?.measurementsSnapshot || {};

  /**
   * Fit the fixed-size sheet to the modal by scaling it, never by reflowing
   * it: the sheet is laid out at true A4 dimensions so the preview matches the
   * paper, and only a uniform scale keeps that true on a narrow screen.
   */
  const viewportRef = useRef<HTMLDivElement>(null);
  const scalerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const fit = () => {
      const viewport = viewportRef.current;
      const sheet = scalerRef.current?.firstElementChild as HTMLElement | undefined;
      if (!viewport || !sheet) return;
      const available = viewport.clientWidth;
      const natural = sheet.offsetWidth;
      if (!available || !natural) return;
      setScale(Math.min(1, available / natural));
    };
    fit();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    if (ro && viewportRef.current) ro.observe(viewportRef.current);
    window.addEventListener('resize', fit);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', fit);
    };
  }, [isOpen, order]);

  // A scaled element still reserves its unscaled height in the flow, which
  // would leave a tall empty gap beneath the preview. Reserve the real,
  // post-scale height instead.
  const [scaledHeight, setScaledHeight] = useState<number | undefined>(undefined);
  useEffect(() => {
    const sheet = scalerRef.current?.firstElementChild as HTMLElement | undefined;
    if (sheet) setScaledHeight(sheet.offsetHeight * scale);
  }, [scale, isOpen, order]);

  if (!isOpen || !order) return null;

  const rawOrderNum = order.orderNumber || order.id || '';
  const numericOrderNum = rawOrderNum.replace(/[^0-9]/g, '') || rawOrderNum;

  const handlePrint = () => window.print();

  const handleDownloadPdf = async () => {
    try {
      setIsExporting(true);
      setExportError(null);
      const ok = await downloadElementAsPdf(
        'printable-order-bill',
        `Regency_Tailors_Order_Bill_${numericOrderNum || 'New'}.pdf`
      );
      if (ok) {
        setExportSuccess('PDF saved (1 page)');
        setTimeout(() => setExportSuccess(null), 3500);
      } else {
        setExportError('The PDF could not be generated. The browser print dialog was opened instead — use "Save as PDF" there.');
      }
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#071426]/85 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto font-sans modal-print-backdrop print-document-root">
      <div className="bg-white rounded-3xl border border-[#E6E1D7] max-w-4xl w-full p-4 sm:p-6 shadow-2xl space-y-4 my-auto relative max-h-[96vh] flex flex-col overflow-hidden text-[#071426] modal-print-dialog">
        {/* ACTION BAR (never printed) */}
        <div className="no-print shrink-0 flex items-center justify-between pb-3 border-b border-[#E6E1D7] gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#071426] text-[#C9A24A] flex items-center justify-center shrink-0">
              <ReceiptText className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-[#8C7E6A] uppercase tracking-wider">
                  A4 Customer Bill
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-[#071426] text-[#D4AF5A] border border-[#C9A24A]/40 font-mono">
                  <FileCheck2 className="w-2.5 h-2.5" />
                  1 PAGE
                </span>
              </div>
              <h3 className="text-sm sm:text-base font-extrabold text-[#071426] truncate">
                Order Bill — Order #{rawOrderNum}
              </h3>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2 shrink-0">
            {exportSuccess && (
              <span className="hidden sm:flex items-center gap-1 text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-300 px-3 py-1.5 rounded-xl">
                <Check className="w-3.5 h-3.5" />
                {exportSuccess}
              </span>
            )}

            <button
              onClick={handleDownloadPdf}
              disabled={isExporting}
              className="px-3.5 sm:px-4 py-2 bg-[#071426] hover:bg-[#0B1930] disabled:opacity-60 text-[#D4AF5A] font-extrabold text-xs rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer uppercase tracking-wider"
              title="Download the A4 bill as a PDF"
            >
              {isExporting ? (
                <Loader2 className="w-4 h-4 animate-spin text-[#C9A24A]" />
              ) : (
                <Download className="w-4 h-4 text-[#C9A24A]" />
              )}
              <span>{isExporting ? 'Saving PDF...' : 'Download PDF'}</span>
            </button>

            <button
              onClick={handlePrint}
              className="px-4 sm:px-5 py-2 bg-[#C9A24A] hover:bg-[#B8913B] text-[#071426] font-extrabold text-xs rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer uppercase tracking-wider"
              title="Print the bill on A4 paper"
            >
              <Printer className="w-4 h-4 text-[#071426]" />
              <span>PRINT BILL</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 text-[#7A7060] hover:text-[#071426] hover:bg-[#FAF8F5] rounded-xl transition-colors cursor-pointer"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="no-print shrink-0 px-3 py-2 bg-[#FAF8F5] border border-[#E0D8CB] rounded-xl text-[11px] font-semibold text-[#6E6454]">
          One A4 sheet, carrying customer, order and garment detail — no measurements. Write the amounts on the printed bill.
        </div>

        {exportError && (
          <div className="no-print shrink-0 p-3 bg-red-50 border border-red-300 rounded-xl flex items-start gap-2.5 text-xs font-semibold text-red-900">
            <span className="flex-1">{exportError}</span>
            <button
              onClick={() => setExportError(null)}
              className="font-bold text-red-700 hover:text-red-950 cursor-pointer shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* THE PRINTABLE A4 SHEET — exactly one, always */}
        <div ref={viewportRef} className="flex-1 overflow-y-auto pr-1 overscroll-contain">
          <div id="printable-order-bill" style={{ height: scaledHeight }}>
            <div
              ref={scalerRef}
              className="a4-bill-scaler"
              style={{ transform: `scale(${scale})`, width: 'fit-content' }}
            >
              <OrderBillPage
                id="printable-order-bill-page-0"
                order={order}
                snapshot={snapshot}
                profile={profile}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
