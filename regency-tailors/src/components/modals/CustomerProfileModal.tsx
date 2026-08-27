import React, { useState } from 'react';
import { 
  X, 
  User, 
  Phone, 
  Mail, 
  MapPin, 
  ShoppingBag, 
  Ruler, 
  Calendar, 
  Sparkles, 
  Plus, 
  Edit3, 
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import { Customer, Order, MeasurementRecord, Fitting } from '../../types';

interface CustomerProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer | null;
  orders?: Order[];
  measurements?: MeasurementRecord[];
  fittings?: Fitting[];
  onNewOrderForCustomer: (customer: Customer) => void;
  onNewMeasurementForCustomer: (customer: Customer) => void;
  onSelectOrder: (order: Order) => void;
  onEditCustomer: (customer: Customer) => void;
}

export const CustomerProfileModal: React.FC<CustomerProfileModalProps> = ({
  isOpen,
  onClose,
  customer,
  orders = [],
  measurements = [],
  fittings = [],
  onNewOrderForCustomer,
  onNewMeasurementForCustomer,
  onSelectOrder,
  onEditCustomer
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'orders' | 'measurements' | 'fittings'>('overview');

  if (!isOpen || !customer) return null;

  const customerOrders = (orders || []).filter(o => o.customerId === customer.id);
  const customerMeasurements = (measurements || []).filter(m => m.customerId === customer.id);
  const customerFittings = (fittings || []).filter(f => f.customerName === customer.name || (customer.phone && f.customerPhone === customer.phone));
  const activeOrdersCount = customerOrders.filter(o => o.status !== 'Delivered').length;

  return (
    <div className="fixed inset-0 z-50 bg-[#071426]/85 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto font-sans print-app-shell">
      <div className="bg-white rounded-3xl border border-[#E6E1D7] max-w-4xl w-full p-5 sm:p-7 shadow-2xl space-y-6 my-auto relative max-h-[94vh] flex flex-col overflow-hidden text-[#071426]">
        
        {/* HEADER */}
        <div className="shrink-0 border-b border-[#F2ECE1] pb-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-[#071426] text-[#D4AF5A] flex items-center justify-center font-extrabold text-lg shadow-xs">
                {customer.name.charAt(0)}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold tracking-[0.2em] text-[#C9A24A] uppercase font-mono">
                    {customer.id}
                  </span>
                  {customerOrders.length >= 3 && (
                    <span className="px-2 py-0.5 bg-[#C9A24A]/20 text-[#071426] font-bold text-[10px] rounded-full border border-[#C9A24A]/40">
                      ★ BESPOKE PATRON
                    </span>
                  )}
                </div>
                <h2 className="text-2xl font-black text-[#071426] tracking-tight">
                  {customer.name}
                </h2>
              </div>
            </div>

            {/* Quick Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onNewOrderForCustomer(customer);
                }}
                className="px-3.5 py-2 bg-[#071426] hover:bg-[#0B1930] text-[#D4AF5A] font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                <span>+ New Order</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onNewMeasurementForCustomer(customer);
                }}
                className="px-3.5 py-2 bg-[#FAF8F5] hover:bg-[#F4EFE6] text-[#071426] border border-[#E0D8CB] font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Ruler className="w-3.5 h-3.5 text-[#C9A24A]" />
                <span>+ Measurement</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEditCustomer(customer);
                }}
                className="p-2 text-[#071426] hover:bg-[#FAF8F5] border border-[#E0D8CB] rounded-xl transition-colors cursor-pointer"
                title="Edit Client Information"
              >
                <Edit3 className="w-4 h-4" />
              </button>

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
              { id: 'overview', label: 'Client Overview', icon: User },
              { id: 'orders', label: `Orders (${customerOrders.length})`, icon: ShoppingBag },
              { id: 'measurements', label: `Measurements (${customerMeasurements.length})`, icon: Ruler },
              { id: 'fittings', label: `Fittings & Trials (${customerFittings.length})`, icon: Calendar }
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

        {/* MODAL BODY */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-5 text-xs overscroll-contain">
          
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-5 animate-fadeIn">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 bg-[#FAF8F5] rounded-2xl border border-[#E0D8CB]">
                  <div className="text-[10px] font-bold text-[#8C7E6A] uppercase">Total Bespoke Orders</div>
                  <div className="text-xl font-black text-[#071426] mt-1">{customerOrders.length} Orders</div>
                </div>
                <div className="p-4 bg-[#FAF8F5] rounded-2xl border border-[#E0D8CB]">
                  <div className="text-[10px] font-bold text-[#8C7E6A] uppercase">Active in Workshop</div>
                  <div className="text-xl font-black text-[#C9A24A] mt-1">{activeOrdersCount} Active</div>
                </div>
                <div className="p-4 bg-[#FAF8F5] rounded-2xl border border-[#E0D8CB]">
                  <div className="text-[10px] font-bold text-[#8C7E6A] uppercase">Measurement Sets</div>
                  <div className="text-xl font-black text-emerald-800 mt-1">
                    {customerMeasurements.length} Garment Sets
                  </div>
                </div>
              </div>

              {/* Contact Details Card */}
              <div className="bg-[#FAF8F5] p-5 rounded-2xl border border-[#E0D8CB] space-y-3">
                <div className="font-extrabold text-xs text-[#071426] uppercase tracking-wider">
                  CONTACT &amp; RESIDENCE
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-[#6E6454]">
                  <div>Phone: <strong className="text-[#071426] font-mono">{customer.phone}</strong></div>
                  <div>Email: <strong className="text-[#071426]">{customer.email || '—'}</strong></div>
                  <div>City: <strong className="text-[#071426]">{customer.city}</strong></div>
                  <div>Address: <strong className="text-[#071426]">{customer.address}</strong></div>
                </div>

                {customer.notes && (
                  <div className="pt-2 border-t border-[#EAE4D8] text-[11px] text-[#7A7060]">
                    <strong>Client Style Notes:</strong> {customer.notes}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: ORDERS */}
          {activeTab === 'orders' && (
            <div className="space-y-3 animate-fadeIn">
              {customerOrders.length > 0 ? (
                <div className="divide-y divide-[#EAE4D8] border border-[#E0D8CB] rounded-2xl overflow-hidden bg-[#FAF8F5]">
                  {customerOrders.map(order => (
                    <div
                      key={order.id}
                      onClick={() => {
                        onClose();
                        onSelectOrder(order);
                      }}
                      className="p-4 flex items-center justify-between hover:bg-white transition-colors cursor-pointer"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-[#C9A24A] text-sm">{order.id}</span>
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#071426] text-[#D4AF5A]">
                            {order.status}
                          </span>
                        </div>
                        <div className="text-[#6E6454] text-[11px]">
                          {(order.items || []).map(i => i.garmentType).join(', ')} • Delivery: {order.deliveryDate}
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="px-3 py-1 bg-[#071426] text-[#D4AF5A] text-xs font-bold rounded-lg hover:bg-[#0B1930]">
                          View Details
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center bg-[#FAF8F5] rounded-2xl border border-[#E0D8CB] text-[#7A7060]">
                  No orders found for this customer.
                </div>
              )}
            </div>
          )}

          {/* TAB 3: MEASUREMENTS */}
          {activeTab === 'measurements' && (
            <div className="space-y-4 animate-fadeIn">
              {customerMeasurements.length > 0 ? (
                customerMeasurements.map(m => (
                  <div key={m.id} className="bg-[#FAF8F5] p-4 rounded-2xl border border-[#E0D8CB] space-y-3">
                    <div className="flex items-center justify-between border-b border-[#EAE4D8] pb-2">
                      <div>
                        <span className="font-extrabold text-sm text-[#071426]">{m.garmentType}</span>
                        <div className="text-[10px] text-[#7A7060]">Updated on {m.lastUpdated}</div>
                      </div>
                      <span className="px-2.5 py-1 bg-white border border-[#E0D8CB] rounded-lg font-bold text-[#C9A24A]">
                        {m.unit}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      {m.coat && Object.entries(m.coat).map(([k, v]) => (
                        <div key={k} className="bg-white p-2 rounded-xl border border-[#EAE4D8] flex justify-between">
                          <span className="text-[#6E6454] capitalize">Coat {k}:</span>
                          <span className="font-bold text-[#071426]">{v}"</span>
                        </div>
                      ))}
                      {m.pant && Object.entries(m.pant).map(([k, v]) => (
                        <div key={k} className="bg-white p-2 rounded-xl border border-[#EAE4D8] flex justify-between">
                          <span className="text-[#6E6454] capitalize">Pant {k}:</span>
                          <span className="font-bold text-[#071426]">{v}"</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center bg-[#FAF8F5] rounded-2xl border border-[#E0D8CB] text-[#7A7060]">
                  No measurement records found for this client.
                </div>
              )}
            </div>
          )}

          {/* TAB 4: FITTINGS */}
          {activeTab === 'fittings' && (
            <div className="space-y-3 animate-fadeIn">
              {customerFittings.length > 0 ? (
                customerFittings.map(fit => (
                  <div key={fit.id} className="p-4 bg-[#FAF8F5] rounded-2xl border border-[#E0D8CB] flex items-center justify-between">
                    <div>
                      <div className="font-extrabold text-sm text-[#071426]">{fit.trialStage} • {fit.garment}</div>
                      <div className="text-[11px] text-[#7A7060]">Scheduled: {fit.scheduledDate} at {fit.scheduledTime}</div>
                    </div>
                    <span className="px-2.5 py-1 bg-[#071426] text-[#D4AF5A] rounded-lg font-bold text-[10px]">
                      {fit.status}
                    </span>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center bg-[#FAF8F5] rounded-2xl border border-[#E0D8CB] text-[#7A7060]">
                  No fitting appointments recorded for this client.
                </div>
              )}
            </div>
          )}

        </div>

        {/* FOOTER */}
        <div className="shrink-0 pt-4 border-t border-[#F2ECE1] flex items-center justify-between text-xs">
          <span className="text-[#7A7060] font-mono">
            Client ID: {customer.id}
          </span>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-[#071426] hover:bg-[#0B1930] text-[#D4AF5A] font-bold rounded-xl transition-colors cursor-pointer"
          >
            Close Profile
          </button>
        </div>

      </div>
    </div>
  );
};
