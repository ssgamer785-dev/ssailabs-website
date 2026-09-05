import React, { useState } from 'react';
import { 
  X, 
  Printer, 
  FileText, 
  Eye, 
  Save, 
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { Order, ProductionStatus } from '../../types';
import { ProductionSlipProductCard } from '../production/ProductionSlipProductCard';

interface ProductionSlipDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order | null;
  onUpdateProductionStatus: (orderId: string, status: ProductionStatus) => void;
  /** Resolves to null once the note is stored, or to the reason it was not. */
  onUpdateProductionNotes: (orderId: string, notes: string) => void | Promise<string | null>;
  onPrintProductionSlip: (order: Order) => void;
  onPrintBill: (order: Order) => void;
  onViewOrderDetails: (order: Order) => void;
}

/**
 * The dossier itself, mounted only while there is a slip to show.
 *
 * Splitting it from the wrapper below is what keeps the hooks unconditional:
 * they used to sit after an `if (!isOpen || !order) return null`, so the same
 * component instance rendered no hooks when closed and two when open. React
 * happens to tolerate that shape today — a render that produced no hook state
 * is treated as a fresh mount — but it is the pattern the rules of hooks exist
 * to forbid, and one added effect would turn it into a crash. The behaviour is
 * unchanged: this body still mounts fresh each time the dossier appears, so
 * the notes box still starts from the order it was opened on.
 */
const SlipDossier: React.FC<Omit<ProductionSlipDetailModalProps, 'isOpen'> & { order: Order }> = ({
  onClose,
  order,
  onUpdateProductionNotes,
  onPrintProductionSlip,
  onPrintBill,
  onViewOrderDetails
}) => {
  const [notes, setNotes] = useState(order.productionNotes || '');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);

  const orderNum = order.orderNumber || order.id;
  const snapshot = order.measurementsSnapshot || {};
  const status: ProductionStatus = order.productionStatus || 'New';
  const items = order.items || [];

  const todayStr = new Date().toISOString().split('T')[0];
  const isOverdue = order.deliveryDate < todayStr && status !== 'Completed';

  /**
   * "Notes Saved" now means the database said so.
   *
   * This used to flip the green badge on the instant the button was pressed,
   * next to a write that was neither awaited nor checked. A note the database
   * refused was reported as recorded, and the failure banner it did raise sits
   * in the page behind this dossier's backdrop, so nobody saw it. The workshop
   * would then cut to an instruction that was never stored.
   */
  const handleSaveNotes = async () => {
    if (saveState === 'saving') return;
    setSaveState('saving');
    setSaveError(null);
    const failure = await onUpdateProductionNotes(order.id, notes);
    if (failure) {
      setSaveError(failure);
      setSaveState('idle');
      return;
    }
    setSaveState('saved');
    setTimeout(() => setSaveState('idle'), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#071426]/85 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto font-sans print-app-shell">
      <div className="bg-white rounded-3xl border border-[#E6E1D7] max-w-4xl w-full p-5 sm:p-7 shadow-2xl space-y-6 my-auto relative max-h-[94vh] flex flex-col overflow-hidden text-[#071426]">
        
        {/* HEADER */}
        <div className="shrink-0 border-b border-[#F2ECE1] pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold tracking-[0.2em] text-[#C9A24A] uppercase">
                  WORKSHOP SLIP
                </span>
              </div>
              <h2 className="text-2xl font-black text-[#071426] tracking-tight flex items-center gap-2">
                <span>PRODUCTION SLIP #{orderNum}</span>
                <span className="text-sm font-semibold text-[#7A7060] hidden sm:inline">
                  • {order.customerName}
                </span>
              </h2>
            </div>
          </div>

          {/* Top Quick Actions */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <button
              onClick={() => onPrintProductionSlip(order)}
              className="px-3.5 py-2 bg-[#071426] hover:bg-[#0E2038] text-[#D4AF5A] text-xs font-bold rounded-xl border border-[#C9A24A]/30 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
              title="Print Production Slip"
            >
              <Printer className="w-3.5 h-3.5 text-[#C9A24A]" />
              <span>Print Slip</span>
            </button>

            <button
              onClick={() => onPrintBill(order)}
              className="px-3.5 py-2 bg-white hover:bg-[#FAF8F5] text-[#071426] text-xs font-bold rounded-xl border border-[#E0D8CB] transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
              title="Print Customer Bill"
            >
              <FileText className="w-3.5 h-3.5 text-[#C9A24A]" />
              <span>Print Bill</span>
            </button>

            <button
              onClick={() => {
                onClose();
                onViewOrderDetails(order);
              }}
              className="px-3 py-2 bg-[#FAF8F5] hover:bg-[#EFE9DF] text-[#071426] text-xs font-bold rounded-xl border border-[#E0D8CB] transition-all flex items-center gap-1.5 cursor-pointer"
              title="View Complete Order Dossier"
            >
              <Eye className="w-3.5 h-3.5" />
              <span className="hidden md:inline">View Order</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 text-[#7A7060] hover:text-[#071426] hover:bg-[#FAF8F5] rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* BODY SCROLL AREA */}
        <div className="flex-1 overflow-y-auto space-y-6 pr-1 overscroll-contain">

          {/* Customer & Order Metadata Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-white p-4 rounded-2xl border border-[#E0D8CB] text-xs">
            <div className="p-2.5 bg-[#FAF8F5] rounded-xl border border-[#E6E1D7]">
              <span className="text-[10px] font-bold text-[#8C7E6A] uppercase block">Customer Name</span>
              <span className="font-extrabold text-sm text-[#071426] block mt-0.5">{order.customerName}</span>
            </div>
            <div className="p-2.5 bg-[#FAF8F5] rounded-xl border border-[#E6E1D7]">
              <span className="text-[10px] font-bold text-[#8C7E6A] uppercase block">Mobile Number</span>
              <span className="font-bold text-xs text-[#071426] block mt-0.5">{order.customerPhone}</span>
            </div>
            <div className="p-2.5 bg-[#FAF8F5] rounded-xl border border-[#E6E1D7]">
              <span className="text-[10px] font-bold text-[#8C7E6A] uppercase block">Order Date</span>
              <span className="font-bold text-xs text-[#071426] block mt-0.5">{order.orderDate}</span>
            </div>
            <div className="p-2.5 bg-[#FAF8F5] rounded-xl border border-[#E6E1D7]">
              <span className="text-[10px] font-bold text-[#8C7E6A] uppercase block">Delivery Date</span>
              <div className="flex items-center gap-1 mt-0.5">
                <span className={`font-extrabold text-xs ${isOverdue ? 'text-red-600' : 'text-[#071426]'}`}>
                  {order.deliveryDate}
                </span>
                {isOverdue && (
                  <span className="px-1.5 py-0.2 bg-red-100 text-red-700 font-bold text-[9px] rounded">
                    OVERDUE
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* INDIVIDUAL PRODUCTS — each stamped with the customer's order
              number, measurements, and the blank writing area. */}
          <div className="space-y-4">
            {items.map((item, idx) => (
              <ProductionSlipProductCard
                key={item.id || idx}
                item={item}
                orderNumber={orderNum}
                snapshot={snapshot}
              />
            ))}
          </div>

          {/* Section: Special Instructions */}
          <div className="p-4 rounded-2xl bg-[#FAF8F5] border border-[#E0D8CB] space-y-1.5">
            <span className="text-xs font-black text-[#8C7E6A] uppercase tracking-wider block">
              SPECIAL INSTRUCTIONS & CLIENT FIT PREFERENCES
            </span>
            <p className="text-xs font-semibold text-[#071426]">
              {order.specialInstructions || order.notes || 'No special instructions.'}
            </p>
          </div>

          {/* Section: Production Notes (Editable by Workshop Staff) */}
          <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-black text-amber-900 uppercase tracking-wider block">
                  PRODUCTION NOTES (INTERNAL WORKSHOP ONLY)
                </span>
                <p className="text-[11px] text-amber-700">
                  Staff notes for cutting, stitching adjustments & workshop stages. Not shown on customer bill.
                </p>
              </div>

              {saveState === 'saving' && (
                <span className="px-2.5 py-1 bg-[#071426] text-[#D4AF5A] font-bold text-xs rounded-lg flex items-center gap-1">
                  <span>Saving…</span>
                </span>
              )}
              {saveState === 'saved' && (
                <span className="px-2.5 py-1 bg-emerald-600 text-white font-bold text-xs rounded-lg animate-fadeIn flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Notes Saved</span>
                </span>
              )}
            </div>

            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Cutting completed on 20 Aug. Extra 0.5 in sleeve margin left for trial fitting..."
              rows={3}
              className="w-full p-3 bg-white border border-amber-300 rounded-xl text-xs text-[#071426] placeholder-amber-700/50 outline-none focus:border-[#C9A24A]"
            />

            {saveError && (
              <div
                role="alert"
                className="px-3 py-2 bg-red-50 border border-red-300 rounded-xl text-[11px] font-bold text-red-800 flex items-start gap-1.5"
              >
                <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />
                <span>
                  <span className="uppercase tracking-wide">Not saved.</span> {saveError}
                </span>
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                disabled={saveState === 'saving'}
                onClick={handleSaveNotes}
                className="px-4 py-2 bg-[#071426] hover:bg-[#0E2038] text-[#D4AF5A] text-xs font-extrabold rounded-xl border border-[#C9A24A]/40 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Save className="w-3.5 h-3.5 text-[#C9A24A]" />
                <span>{saveState === 'saving' ? 'Saving Notes…' : 'Save Production Notes'}</span>
              </button>
            </div>
          </div>

        </div>

        {/* FOOTER ACTIONS */}
        <div className="shrink-0 pt-3 border-t border-[#F2ECE1] flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-[#7A7060]">
            Workshop System • Order #{orderNum}
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              onClick={() => onPrintProductionSlip(order)}
              className="flex-1 sm:flex-none px-5 py-2.5 bg-[#C9A24A] hover:bg-[#B8913B] text-[#071426] font-extrabold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer uppercase tracking-wider"
              title="Download PDF or Print Production Slip"
            >
              <Printer className="w-4 h-4" />
              <span>DOWNLOAD / PRINT SLIP</span>
            </button>

            <button
              onClick={onClose}
              className="px-4 py-2.5 bg-white hover:bg-[#FAF8F5] text-[#071426] font-bold text-xs rounded-xl border border-[#E0D8CB] transition-all cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

/**
 * Public entry point: renders nothing when the drawer is closed or no slip is
 * selected, and otherwise hands the dossier a non-null order.
 */
export const ProductionSlipDetailModal: React.FC<ProductionSlipDetailModalProps> = ({
  isOpen,
  order,
  ...rest
}) => {
  if (!isOpen || !order) return null;
  return <SlipDossier order={order} {...rest} />;
};
