import React, { useState } from 'react';
import { X, Printer, FileText, Download, Check, Image as ImageIcon, Loader2 } from 'lucide-react';
import { Order, ShowroomProfile } from '../../types';
import { downloadElementAsPdf, downloadElementAsImage } from '../../utils/documentExport';
import { PrintableBill } from '../bills/PrintableBill';
import { BillExportCanvas } from '../bills/BillExportCanvas';

interface PrintBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order | null;
  profile?: ShowroomProfile;
}

export const PrintBillModal: React.FC<PrintBillModalProps> = ({
  isOpen,
  onClose,
  order
}) => {
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingImg, setIsExportingImg] = useState(false);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

  const rawOrderNum = order ? (order.orderNumber || order.id || '1') : '—';
  const numericOrderNum = rawOrderNum.replace(/[^0-9]/g, '') || rawOrderNum;

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    try {
      setIsExportingPdf(true);
      const filename = `Regency_Tailors_Bill_Order_${numericOrderNum || 'New'}.pdf`;
      const ok = await downloadElementAsPdf('bill-export-canvas', filename);
      if (ok) {
        setExportSuccess('PDF Downloaded!');
        setTimeout(() => setExportSuccess(null), 3000);
      }
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleDownloadImage = async () => {
    try {
      setIsExportingImg(true);
      const filename = `Regency_Tailors_Bill_Order_${numericOrderNum || 'New'}.png`;
      const ok = await downloadElementAsImage('bill-export-canvas', filename);
      if (ok) {
        setExportSuccess('PNG Downloaded!');
        setTimeout(() => setExportSuccess(null), 3000);
      }
    } finally {
      setIsExportingImg(false);
    }
  };

  const isBlank = !order;

  return (
    <div className="fixed inset-0 z-50 bg-[#071426]/90 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto font-['Manrope',sans-serif] modal-print-backdrop">
      
      {/* ========================================================================= */}
      {/* 1. DEDICATED OFF-SCREEN EXPORT CANVAS (MASTER SOURCE FOR PNG & PDF EXPORT) */}
      {/* ========================================================================= */}
      <div 
        style={{
          position: 'absolute',
          left: '-99999px',
          top: 0,
          width: '794px',
          minWidth: '794px',
          maxWidth: '794px',
          backgroundColor: '#FAF7F0',
          boxSizing: 'border-box',
          zIndex: -99999,
          pointerEvents: 'none'
        }}
        aria-hidden="true"
      >
        <BillExportCanvas order={order} id="bill-export-canvas" />
      </div>

      {/* ========================================================================= */}
      {/* 2. ON-SCREEN RESPONSIVE MODAL PREVIEW */}
      {/* ========================================================================= */}
      <div className="bg-[#FAF7F0] rounded-3xl border-2 border-[#C9A24A]/50 max-w-5xl w-full p-3 sm:p-5 shadow-2xl space-y-4 my-auto relative max-h-[96vh] flex flex-col overflow-hidden text-[#071426] modal-print-dialog">
        
        {/* ACTION BAR (Hidden on Native Print) */}
        <div className="no-print shrink-0 flex items-center justify-between pb-3 border-b border-[#E0D8CB]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#071426] text-[#C9A24A] flex items-center justify-center shadow-xs">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-[#8C7E6A] uppercase tracking-wider">A4 Customer Bill & Receipt</span>
              <h3 className="text-base font-extrabold text-[#071426]">
                {isBlank ? 'Blank Bill Template' : `Regency Tailors Bill — Order #${numericOrderNum}`}
              </h3>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2">
            {exportSuccess && (
              <span className="hidden sm:flex items-center gap-1 text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-300 px-3 py-1.5 rounded-xl">
                <Check className="w-3.5 h-3.5" />
                {exportSuccess}
              </span>
            )}

            {/* DOWNLOAD PDF */}
            <button
              onClick={handleDownloadPdf}
              disabled={isExportingPdf || isExportingImg}
              className="px-3.5 sm:px-4 py-2 bg-[#071426] hover:bg-[#0B1930] disabled:opacity-60 text-[#D4AF5A] font-extrabold text-xs rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer uppercase tracking-wider"
              title="Download Complete High-Resolution A4 PDF Bill"
            >
              {isExportingPdf ? (
                <Loader2 className="w-4 h-4 animate-spin text-[#C9A24A]" />
              ) : (
                <Download className="w-4 h-4 text-[#C9A24A]" />
              )}
              <span>{isExportingPdf ? 'Saving PDF...' : 'Download PDF'}</span>
            </button>

            {/* DOWNLOAD PNG */}
            <button
              onClick={handleDownloadImage}
              disabled={isExportingPdf || isExportingImg}
              className="px-3 py-2 bg-[#FAF8F5] hover:bg-[#EFE9DD] border border-[#D5CCA8] text-[#071426] font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer uppercase tracking-wider"
              title="Download Complete A4 PNG Image"
            >
              {isExportingImg ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#071426]" />
              ) : (
                <ImageIcon className="w-3.5 h-3.5 text-[#071426]" />
              )}
              <span>Download PNG</span>
            </button>

            {/* PRINT BILL */}
            <button
              onClick={handlePrint}
              className="px-4 sm:px-5 py-2 bg-[#C9A24A] hover:bg-[#B8913B] text-[#071426] font-black text-xs rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer uppercase tracking-wider"
              title="Print Customer Bill directly"
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

        {/* PRINTABLE BILL SHEET (RESPONSIVE SCREEN PREVIEW & NATIVE PRINT CONTAINER) */}
        <div className="flex-1 overflow-y-auto pr-1 flex justify-center items-start print:p-0 print:m-0 print:overflow-visible overscroll-contain">
          <div 
            id="printable-customer-bill-wrapper" 
            className="a4-print-page w-full max-w-[210mm] mx-auto p-0 sm:p-[5mm] bg-[#FAF7F0] box-border flex flex-col justify-start items-center"
            style={{ boxSizing: 'border-box' }}
          >
            <PrintableBill order={order} id="printable-customer-bill" />
          </div>
        </div>

      </div>
    </div>
  );
};
