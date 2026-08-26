import React, { useState, useMemo } from 'react';
import { X, Printer, Scissors, Download, Check, Image as ImageIcon, Loader2, Layers } from 'lucide-react';
import { Order, ProductionStatus } from '../../types';
import { ProductionSlipPage } from '../production/ProductionSlipPage';
import { paginateProductionSlip } from '../../utils/productionSlipPagination';
import { downloadElementAsPdf, downloadElementAsImage } from '../../utils/documentExport';

interface PrintProductionSlipModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order | null;
}

export const PrintProductionSlipModal: React.FC<PrintProductionSlipModalProps> = ({
  isOpen,
  onClose,
  order
}) => {
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingImg, setIsExportingImg] = useState(false);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const rawOrderNum = order ? (order.orderNumber || order.id || '1') : '—';
  const numericOrderNum = rawOrderNum.replace(/[^0-9]/g, '') || rawOrderNum;
  const orderNum = order ? (order.orderNumber || order.id) : '';
  const snapshot = order ? (order.measurementsSnapshot || {}) : {};
  const status: ProductionStatus = order ? (order.productionStatus || 'New') : 'New';

  // Check if overdue
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const isOverdue = order ? (order.deliveryDate < todayStr && status !== 'Completed') : false;

  // Intelligently calculate multi-page A4 pagination based on garment count & content volume
  const pages = useMemo(() => {
    if (!order) return [];
    return paginateProductionSlip(order);
  }, [order]);

  if (!isOpen || !order) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    try {
      setIsExportingPdf(true);
      setExportError(null);
      const filename = `Production_Slip_Order_${numericOrderNum || 'New'}.pdf`;
      const ok = await downloadElementAsPdf('printable-production-slip', filename);
      if (ok) {
        setExportSuccess(`PDF Saved (${pages.length} ${pages.length === 1 ? 'Page' : 'Pages'})!`);
        setTimeout(() => setExportSuccess(null), 3500);
      } else {
        setExportError('PDF could not be generated. The browser print dialog was opened instead — use "Save as PDF" there.');
      }
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleDownloadImage = async () => {
    try {
      setIsExportingImg(true);
      const filename = `Production_Slip_Order_${numericOrderNum || 'New'}_Page_1.png`;
      const ok = await downloadElementAsImage('printable-production-slip-page-0', filename);
      if (ok) {
        setExportSuccess('Image Downloaded!');
        setTimeout(() => setExportSuccess(null), 3000);
      } else {
        setExportError('The PNG image could not be generated. Use Download PDF or Print Slip instead.');
      }
    } finally {
      setIsExportingImg(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#071426]/85 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto font-sans modal-print-backdrop print-document-root">
      
      {/* Container - Screen View with Print Action Bar */}
      <div className="bg-white rounded-3xl border border-[#E6E1D7] max-w-4xl w-full p-4 sm:p-6 shadow-2xl space-y-4 my-auto relative max-h-[96vh] flex flex-col overflow-hidden text-[#071426] modal-print-dialog">
        
        {/* ACTION BAR (Hidden during actual print) */}
        <div className="no-print shrink-0 flex items-center justify-between pb-3 border-b border-[#E6E1D7] gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#071426] text-[#C9A24A] flex items-center justify-center shrink-0">
              <Scissors className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-[#8C7E6A] uppercase tracking-wider">A4 Workshop Document</span>
                <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.2 rounded-full bg-[#071426] text-[#D4AF5A] border border-[#C9A24A]/40 font-mono">
                  <Layers className="w-2.5 h-2.5" />
                  {pages.length} {pages.length === 1 ? 'PAGE' : 'PAGES'}
                </span>
              </div>
              <h3 className="text-sm sm:text-base font-extrabold text-[#071426] truncate">
                Production Slip — Order #{orderNum}
              </h3>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2 shrink-0">
            {exportSuccess && (
              <span className="hidden sm:flex items-center gap-1 text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-300 px-3 py-1.5 rounded-xl animate-fadeIn">
                <Check className="w-3.5 h-3.5" />
                {exportSuccess}
              </span>
            )}

            {/* DOWNLOAD PDF */}
            <button
              onClick={handleDownloadPdf}
              disabled={isExportingPdf || isExportingImg}
              className="px-3.5 sm:px-4 py-2 bg-[#071426] hover:bg-[#0B1930] disabled:opacity-60 text-[#D4AF5A] font-extrabold text-xs rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer uppercase tracking-wider"
              title="Download Complete High-Resolution A4 Multi-Page PDF"
            >
              {isExportingPdf ? (
                <Loader2 className="w-4 h-4 animate-spin text-[#C9A24A]" />
              ) : (
                <Download className="w-4 h-4 text-[#C9A24A]" />
              )}
              <span>{isExportingPdf ? 'Saving PDF...' : 'Download PDF'}</span>
            </button>

            {/* DOWNLOAD IMAGE (PNG) */}
            <button
              onClick={handleDownloadImage}
              disabled={isExportingPdf || isExportingImg}
              className="hidden sm:flex px-3 py-2 bg-[#FAF8F5] hover:bg-[#EFE9DD] border border-[#D5CCA8] text-[#071426] font-bold text-xs rounded-xl shadow-xs transition-all items-center gap-1.5 cursor-pointer uppercase tracking-wider"
              title="Download Page 1 as PNG Image"
            >
              {isExportingImg ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#071426]" />
              ) : (
                <ImageIcon className="w-3.5 h-3.5 text-[#071426]" />
              )}
              <span>PNG</span>
            </button>

            {/* PRINT SLIP */}
            <button
              onClick={handlePrint}
              className="px-4 sm:px-5 py-2 bg-[#C9A24A] hover:bg-[#B8913B] text-[#071426] font-extrabold text-xs rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer uppercase tracking-wider"
              title="Print Multi-Page Production Slip to A4 Paper"
            >
              <Printer className="w-4 h-4 text-[#071426]" />
              <span>PRINT SLIP</span>
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

        {/* PRINTABLE SLIP CONTENT (A4 Multi-Page Layout) */}
        <div className="flex-1 overflow-y-auto pr-1 overscroll-contain">
          <div 
            id="printable-production-slip" 
            className="space-y-6 print:space-y-0"
          >
            {pages.map((pageData) => (
              <React.Fragment key={pageData.pageIndex}>
                {/* On-screen visual page indicator (hidden when printing) */}
                {pages.length > 1 && (
                  <div className="no-print flex items-center justify-center gap-3 py-1">
                    <div className="h-px bg-[#C9A24A]/30 flex-1 max-w-[120px]" />
                    <span className="text-[10px] font-black text-[#8C7E6A] uppercase tracking-widest bg-[#FAF8F5] px-3 py-1 rounded-full border border-[#E0D8CB] font-mono">
                      A4 PAGE {pageData.pageIndex + 1} OF {pageData.totalPages}
                    </span>
                    <div className="h-px bg-[#C9A24A]/30 flex-1 max-w-[120px]" />
                  </div>
                )}

                <ProductionSlipPage
                  id={`printable-production-slip-page-${pageData.pageIndex}`}
                  pageData={pageData}
                  order={order}
                  snapshot={snapshot}
                  status={status}
                  orderNum={orderNum}
                  isOverdue={isOverdue}
                />
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
