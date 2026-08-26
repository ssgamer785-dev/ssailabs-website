import React, { useState } from 'react';
import { 
  X, 
  ShoppingBag, 
  Calendar, 
  User, 
  Ruler, 
  CheckCircle2, 
  Clock, 
  Scissors, 
  Truck, 
  Edit3, 
  AlertCircle, 
  Sparkles,
  Phone,
  Mail,
  MapPin
} from 'lucide-react';
import { Order, OrderStatus, MeasurementRecord, Fitting, Customer } from '../../types';
import { RegencyLogo } from '../RegencyLogo';

interface OrderDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order | null;
  customer?: Customer | null;
  measurements?: MeasurementRecord[];
  fittings?: Fitting[];
  onUpdateStatus: (orderId: string, newStatus: OrderStatus) => void;
  onEditOrder?: (order: Order) => void;
  onPrintProductionSlip?: (order: Order) => void;
}

const PRODUCTION_STAGES: OrderStatus[] = [
  'Measurement Taken',
  'Fabric Cutting',
  'Master Stitching',
  'First Trial',
  'Final Fitting',
  'Ready for Pickup',
  'Delivered'
];

export const OrderDetailModal: React.FC<OrderDetailModalProps> = ({
  isOpen,
  onClose,
  order,
  customer,
  measurements = [],
  fittings = [],
  onUpdateStatus,
  onEditOrder,
  onPrintProductionSlip
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'garments' | 'measurements' | 'fitting'>('overview');

  if (!isOpen || !order) return null;

  // Find linked customer, fitting, measurements
  const linkedCustomer = customer || null;
  const linkedFitting = fittings.find(f => f.orderId === order.id || f.orderId === order.orderNumber);
  const snapshot = order.measurementsSnapshot;

  const currentStageIndex = PRODUCTION_STAGES.indexOf(order.status);

  return (
    <div className="fixed inset-0 z-50 bg-[#071426]/85 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto font-sans">
      <div className="bg-white rounded-3xl border border-[#E6E1D7] max-w-4xl w-full p-5 sm:p-7 shadow-2xl space-y-6 my-auto relative max-h-[94vh] flex flex-col overflow-hidden text-[#071426]">
        
        {/* MODAL HEADER */}
        <div className="shrink-0 border-b border-[#F2ECE1] pb-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <RegencyLogo size="sm" className="shrink-0" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold tracking-[0.2em] text-[#C9A24A] uppercase">
                    BESPOKE ORDER DOSSIER
                  </span>
                  {order.urgent && (
                    <span className="px-2 py-0.5 bg-red-100 text-red-700 font-bold text-[10px] rounded-full">
                      URGENT
                    </span>
                  )}
                </div>
                <h2 className="text-2xl font-black text-[#071426] tracking-tight flex items-center gap-2">
                  <span>{order.id}</span>
                  <span className="text-sm font-semibold text-[#7A7060]">
                    • {order.customerName}
                  </span>
                </h2>
              </div>
            </div>

            {/* Quick Actions in Header */}
            <div className="flex items-center gap-2">
              {/* Status Updater Select */}
              <div className="flex items-center gap-1.5 bg-[#FAF8F5] border border-[#E0D8CB] px-3 py-1.5 rounded-xl text-xs">
                <span className="text-[10px] font-bold text-[#8C7E6A] uppercase">Status:</span>
                <select
                  value={order.status}
                  onChange={(e) => onUpdateStatus(order.id, e.target.value as OrderStatus)}
                  className="bg-transparent font-extrabold text-[#071426] outline-none cursor-pointer"
                >
                  {PRODUCTION_STAGES.map(st => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>
              </div>

              {onEditOrder && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onEditOrder(order);
                  }}
                  className="p-2 text-[#071426] hover:bg-[#FAF8F5] border border-[#E0D8CB] rounded-xl transition-colors cursor-pointer"
                  title="Edit Order"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
              )}

              <button
                type="button"
                onClick={onClose}
                className="p-2 text-[#8C7E6A] hover:text-[#071426] hover:bg-[#FAF8F5] rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
            {[
              { id: 'overview', label: 'Overview & Timeline', icon: Clock },
              { id: 'garments', label: `Garments (${order.items.length})`, icon: ShoppingBag },
              { id: 'measurements', label: 'Measurements Specs', icon: Ruler },
              { id: 'fitting', label: 'Fitting & Trial', icon: Calendar }
            ].map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold transition-all whitespace-nowrap cursor-pointer ${
                    isActive
                      ? 'bg-[#071426] text-[#D4AF5A] shadow-xs'
                      : 'bg-[#FAF8F5] text-[#6E6454] hover:bg-[#EAE4D8] hover:text-[#071426]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* MODAL CONTENT BODY */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-5 text-xs overscroll-contain">
          
          {/* TAB 1: OVERVIEW & WORKSHOP TIMELINE */}
          {activeTab === 'overview' && (
            <div className="space-y-6 animate-fadeIn">
              
              {/* Production Progress Bar */}
              <div className="bg-[#FAF8F5] p-5 rounded-2xl border border-[#E0D8CB] space-y-4">
                <div className="flex items-center justify-between">
                  <div className="font-extrabold text-sm text-[#071426]">
                    Workshop Production Stage
                  </div>
                  <span className="text-xs font-bold text-[#C9A24A]">
                    {order.status}
                  </span>
                </div>

                {/* Stepper bar */}
                <div className="grid grid-cols-7 gap-1">
                  {PRODUCTION_STAGES.map((st, idx) => {
                    const isDone = idx <= currentStageIndex;
                    const isCurrent = idx === currentStageIndex;
                    return (
                      <div key={st} className="text-center space-y-1">
                        <div className={`h-2 rounded-full transition-all ${
                          isCurrent
                            ? 'bg-[#C9A24A] shadow-[0_0_8px_#C9A24A]'
                            : isDone
                            ? 'bg-[#071426]'
                            : 'bg-[#E0D8CB]'
                        }`} />
                        <div className={`text-[9px] font-bold truncate hidden sm:block ${
                          isCurrent ? 'text-[#C9A24A]' : isDone ? 'text-[#071426]' : 'text-[#9A9080]'
                        }`}>
                          {st.split(' ')[0]}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Quick Summary Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {/* Client Info */}
                <div className="bg-[#FAF8F5] p-4 rounded-2xl border border-[#E0D8CB] space-y-2">
                  <div className="text-[10px] font-bold text-[#C9A24A] uppercase tracking-wider">
                    CLIENT DETAILS
                  </div>
                  <div className="font-extrabold text-sm text-[#071426]">{order.customerName}</div>
                  <div className="space-y-1 text-[#6E6454]">
                    <div className="flex items-center gap-1.5 font-mono">
                      <Phone className="w-3 h-3 text-[#C9A24A]" />
                      <span>{order.customerPhone}</span>
                    </div>
                    {order.customerEmail && (
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <Mail className="w-3 h-3 text-[#A39682]" />
                        <span>{order.customerEmail}</span>
                      </div>
                    )}
                    {linkedCustomer?.city && (
                      <div className="flex items-center gap-1.5 text-[11px]">
                        <MapPin className="w-3 h-3 text-[#A39682]" />
                        <span>{linkedCustomer.city}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Deadlines & Timeline */}
                <div className="bg-[#FAF8F5] p-4 rounded-2xl border border-[#E0D8CB] space-y-2">
                  <div className="text-[10px] font-bold text-[#C9A24A] uppercase tracking-wider">
                    TIMELINE &amp; DATES
                  </div>
                  <div className="space-y-1 text-[#6E6454]">
                    <div>Booked On: <strong className="text-[#071426]">{order.orderDate}</strong></div>
                    <div>Trial Date: <strong className="text-[#071426]">{order.trialDate || 'No Trial Scheduled'}</strong></div>
                    <div>Expected Delivery: <strong className="text-[#C9A24A] text-sm">{order.deliveryDate}</strong></div>
                    {order.deliveryTime && <div>Slot: {order.deliveryTime}</div>}
                  </div>
                </div>

                {/* Order Scope & Garments */}
                <div className="bg-[#FAF8F5] p-4 rounded-2xl border border-[#E0D8CB] space-y-2">
                  <div className="text-[10px] font-bold text-[#C9A24A] uppercase tracking-wider">
                    ORDER SCOPE
                  </div>
                  <div className="space-y-1 text-[#6E6454]">
                    <div>Garments: <strong className="text-sm font-black text-[#071426]">{(order.items || []).length} Items</strong></div>
                    <div>Priority: <strong className={order.urgent ? 'text-red-700 font-bold' : 'text-[#071426]'}>{order.urgent ? 'High (Urgent)' : 'Standard'}</strong></div>
                    <div className="pt-1 border-t border-[#EAE4D8] truncate">
                      <span className="text-[11px]">{(order.items || []).map(i => i.garmentType).join(', ')}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Special Instructions Note */}
              {order.notes && (
                <div className="p-4 bg-[#FAF8F5] rounded-2xl border border-[#E0D8CB] space-y-1 text-xs">
                  <div className="font-bold text-[#C9A24A] uppercase text-[10px]">
                    SPECIAL WORKSHOP INSTRUCTIONS
                  </div>
                  <div className="text-[#071426] font-medium leading-relaxed">
                    {order.notes}
                  </div>
                </div>
              )}

            </div>
          )}

          {/* TAB 2: GARMENTS */}
          {activeTab === 'garments' && (
            <div className="space-y-4 animate-fadeIn">
              <div className="flex items-center justify-between">
                <h3 className="font-extrabold text-sm text-[#071426]">
                  Selected Garments ({(order.items || []).length})
                </h3>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {(order.items || []).map((item, idx) => (
                  <div key={item.id || idx} className="p-4 bg-[#FAF8F5] rounded-2xl border border-[#E0D8CB] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-sm text-[#071426]">
                          {item.garmentType}
                        </span>
                        {item.quantity && item.quantity > 1 && (
                          <span className="px-2 py-0.5 bg-[#071426] text-[#D4AF5A] rounded-md text-[10px] font-bold">
                            Qty: {item.quantity}
                          </span>
                        )}
                      </div>
                      <div className="text-[#6E6454] text-xs">
                        Fabric: <strong>{item.fabricName || 'Bespoke Premium Fabric'}</strong> • Code: <span className="font-mono">{item.fabricCode || 'FB-REG-100'}</span>
                      </div>
                      {item.notes && (
                        <div className="text-[11px] text-[#7A7060] italic">
                          Notes: {item.notes}
                        </div>
                      )}
                      {item.remarks && (
                        <div className="p-2 bg-white rounded-lg border border-[#EAE4D8] text-[11px] text-[#071426] mt-1">
                          <strong className="text-[#8C7E6A] uppercase text-[10px] block">Production Remarks:</strong>
                          {item.remarks}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: MEASUREMENTS SNAPSHOT */}
          {activeTab === 'measurements' && (
            <div className="space-y-5 animate-fadeIn">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-sm text-[#071426]">
                    Order Measurement Specifications
                  </h3>
                  <p className="text-[11px] text-[#7A7060]">
                    Immutable bespoke measurements snapshot captured at the time of order entry.
                  </p>
                </div>

                {snapshot?.unit && (
                  <span className="px-3 py-1 bg-[#FAF8F5] border border-[#E0D8CB] rounded-xl font-bold text-[#C9A24A] text-xs">
                    Unit: {snapshot.unit}
                  </span>
                )}
              </div>

              {snapshot ? (
                <div className="space-y-4">
                  {/* Coat */}
                  {snapshot.coat && (
                    <div className="bg-[#FAF8F5] p-4 rounded-2xl border border-[#E0D8CB] space-y-2.5">
                      <h4 className="font-extrabold text-xs text-[#071426] uppercase tracking-wider flex items-center gap-1.5">
                        <span>🧥</span> Coat / Blazer Measurements
                      </h4>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        {Object.entries(snapshot.coat).map(([k, v]) => (
                          <div key={k} className="bg-white p-2.5 rounded-xl border border-[#EAE4D8] flex justify-between">
                            <span className="text-[#6E6454] capitalize font-medium">{k}:</span>
                            <span className="font-bold text-[#071426]">{v}"</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Pant */}
                  {snapshot.pant && (
                    <div className="bg-[#FAF8F5] p-4 rounded-2xl border border-[#E0D8CB] space-y-2.5">
                      <h4 className="font-extrabold text-xs text-[#071426] uppercase tracking-wider flex items-center gap-1.5">
                        <span>👖</span> Pant / Trouser Measurements
                      </h4>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        {Object.entries(snapshot.pant).map(([k, v]) => (
                          <div key={k} className="bg-white p-2.5 rounded-xl border border-[#EAE4D8] flex justify-between">
                            <span className="text-[#6E6454] capitalize font-medium">{k}:</span>
                            <span className="font-bold text-[#071426]">{v}"</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Shirt */}
                  {snapshot.shirt && (
                    <div className="bg-[#FAF8F5] p-4 rounded-2xl border border-[#E0D8CB] space-y-2.5">
                      <h4 className="font-extrabold text-xs text-[#071426] uppercase tracking-wider flex items-center gap-1.5">
                        <span>👔</span> Shirt Measurements
                      </h4>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        {Object.entries(snapshot.shirt).map(([k, v]) => (
                          <div key={k} className="bg-white p-2.5 rounded-xl border border-[#EAE4D8] flex justify-between">
                            <span className="text-[#6E6454] capitalize font-medium">{k}:</span>
                            <span className="font-bold text-[#071426]">{v}"</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Kurta & Pajama */}
                  {snapshot.kurta && (
                    <div className="bg-[#FAF8F5] p-4 rounded-2xl border border-[#E0D8CB] space-y-2.5">
                      <h4 className="font-extrabold text-xs text-[#071426] uppercase tracking-wider flex items-center gap-1.5">
                        <span>👘</span> Kurta &amp; Pajama Measurements
                      </h4>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        {Object.entries(snapshot.kurta).map(([k, v]) => (
                          <div key={k} className="bg-white p-2.5 rounded-xl border border-[#EAE4D8] flex justify-between">
                            <span className="text-[#6E6454] capitalize font-medium">{k}:</span>
                            <span className="font-bold text-[#071426]">{v}"</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Fit Notes */}
                  {snapshot.fittingNotes && (
                    <div className="p-3 bg-[#FAF8F5] rounded-xl border border-[#E0D8CB] text-xs text-[#6E6454]">
                      <strong>Fitting Notes:</strong> {snapshot.fittingNotes}
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-8 text-center bg-[#FAF8F5] rounded-2xl border border-[#E0D8CB] text-[#7A7060]">
                  No measurement snapshot was attached to this order. You can record measurements in the Measurements section.
                </div>
              )}
            </div>
          )}

          {/* TAB 4: FITTING & TRIAL */}
          {activeTab === 'fitting' && (
            <div className="space-y-4 animate-fadeIn">
              <div className="flex items-center justify-between">
                <h3 className="font-extrabold text-sm text-[#071426]">
                  Fitting &amp; Trial Appointments
                </h3>
              </div>

              {linkedFitting ? (
                <div className="bg-[#FAF8F5] p-5 rounded-2xl border border-[#E0D8CB] space-y-3">
                  <div className="flex items-center justify-between border-b border-[#EAE4D8] pb-2">
                    <span className="font-mono font-bold text-[#C9A24A]">{linkedFitting.id}</span>
                    <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-[#071426] text-[#D4AF5A]">
                      {linkedFitting.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-[#6E6454]">
                    <div>Stage: <strong className="text-[#071426]">{linkedFitting.trialStage}</strong></div>
                    <div>Scheduled Date: <strong className="text-[#071426]">{linkedFitting.scheduledDate}</strong></div>
                    <div>Time Slot: <strong className="text-[#071426]">{linkedFitting.scheduledTime}</strong></div>
                    <div>Garment: <strong className="text-[#071426]">{linkedFitting.garment}</strong></div>
                  </div>

                  {linkedFitting.adjustmentNotes && (
                    <div className="p-3 bg-white rounded-xl border border-[#EAE4D8] text-[11px] text-[#071426]">
                      <strong>Cutter Adjustment Focus:</strong> {linkedFitting.adjustmentNotes}
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-8 text-center bg-[#FAF8F5] rounded-2xl border border-[#E0D8CB] text-[#7A7060] space-y-2">
                  <Calendar className="w-8 h-8 text-[#C9A24A] mx-auto" />
                  <div>No trial appointment currently linked to this order.</div>
                </div>
              )}
            </div>
          )}

        </div>

        {/* MODAL FOOTER */}
        <div className="shrink-0 pt-4 border-t border-[#F2ECE1] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <span className="text-[#7A7060] font-mono">
            ID: {order.id} • Customer ID: {order.customerId}
          </span>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {onPrintProductionSlip && (
              <button
                type="button"
                onClick={() => onPrintProductionSlip(order)}
                className="px-4 py-2.5 bg-[#071426] hover:bg-[#0E2038] text-[#D4AF5A] font-bold rounded-xl border border-[#C9A24A]/40 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
                title="Download PDF or Print Production Slip"
              >
                <Scissors className="w-3.5 h-3.5 text-[#C9A24A]" />
                <span>Download / Print Slip</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 bg-[#FAF8F5] hover:bg-[#EFE9DF] text-[#071426] font-bold rounded-xl border border-[#E0D8CB] transition-colors cursor-pointer"
            >
              Close Dossier
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
