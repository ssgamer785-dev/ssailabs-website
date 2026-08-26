import React, { useState } from 'react';
import { ShoppingBag, Plus, Search, Filter, Printer, Edit3, Trash2, CheckCircle2, ChevronRight, Scissors, AlertCircle } from 'lucide-react';
import { Order, OrderStatus } from '../../types';

interface OrdersViewProps {
  orders: Order[];
  onNewOrder: () => void;
  onEditOrder: (order: Order) => void;
  onDeleteOrder: (order: Order) => void;
  onUpdateOrderStatus: (orderId: string, status: OrderStatus) => void;
  onSelectOrder: (order: Order) => void;
  onPrintProductionSlip?: (order: Order) => void;
}

export const OrdersView: React.FC<OrdersViewProps> = ({
  orders,
  onNewOrder,
  onEditOrder,
  onDeleteOrder,
  onUpdateOrderStatus,
  onSelectOrder,
  onPrintProductionSlip
}) => {
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const statusOptions: Array<OrderStatus | 'All'> = [
    'All',
    'Measurement Taken',
    'Fabric Cutting',
    'Master Stitching',
    'First Trial',
    'Final Fitting',
    'Ready for Pickup',
    'Delivered'
  ];

  const filtered = orders.filter(o => {
    const matchesStatus = selectedStatus === 'All' || o.status === selectedStatus;
    const matchesSearch =
      o.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.customerPhone.includes(searchQuery);
    return matchesStatus && matchesSearch;
  });

  // Operational metrics
  const totalOrdersCount = orders.length;
  const activeWorkshopCount = orders.filter(o => o.status !== 'Delivered').length;
  const trialStageCount = orders.filter(o => o.status.includes('Trial') || o.status.includes('Fitting')).length;
  const readyForPickupCount = orders.filter(o => o.status === 'Ready for Pickup').length;

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-[#E6E1D7] shadow-2xs">
        <div>
          <div className="text-[10px] font-bold tracking-[0.2em] text-[#C9A24A] uppercase mb-1 brand-font">
            ORDER MANAGEMENT
          </div>
          <h1 className="text-2xl font-extrabold text-[#071426] brand-font">
            Showroom Orders
          </h1>
          <p className="text-xs text-[#7A7060]">
            Track bespoke garment status from fabric cutting to trial fittings and final delivery.
          </p>
        </div>

        <button
          onClick={onNewOrder}
          className="px-4 py-2.5 bg-[#C9A24A] hover:bg-[#B8913B] text-[#071426] font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-2 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Create Bespoke Order</span>
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-[#E6E1D7] shadow-2xs">
          <div className="text-[10px] font-bold text-[#8C7E6A] uppercase">Total Orders</div>
          <div className="text-xl font-extrabold text-[#071426] mt-1">{totalOrdersCount}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-[#E6E1D7] shadow-2xs">
          <div className="text-[10px] font-bold text-[#8C7E6A] uppercase">In Workshop</div>
          <div className="text-xl font-extrabold text-[#C9A24A] mt-1">{activeWorkshopCount}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-[#E6E1D7] shadow-2xs">
          <div className="text-[10px] font-bold text-[#8C7E6A] uppercase">In Trial / Fitting</div>
          <div className="text-xl font-extrabold text-blue-700 mt-1">{trialStageCount}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-[#E6E1D7] shadow-2xs">
          <div className="text-[10px] font-bold text-[#8C7E6A] uppercase">Ready for Pickup</div>
          <div className="text-xl font-extrabold text-emerald-700 mt-1">{readyForPickupCount}</div>
        </div>
      </div>

      {/* Status Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        {statusOptions.map(st => (
          <button
            key={st}
            onClick={() => setSelectedStatus(st)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border ${
              selectedStatus === st
                ? 'bg-[#071426] text-[#D4AF5A] border-[#C9A24A]'
                : 'bg-white text-[#6E6454] border-[#E6E1D7] hover:bg-[#F7F3EA]'
            }`}
          >
            {st}
          </button>
        ))}
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-2xl border border-[#E6E1D7] shadow-2xs overflow-hidden">
        {/* Search */}
        <div className="p-4 border-b border-[#F2ECE1] bg-[#FAFAFA] flex items-center gap-3">
          <Search className="w-4 h-4 text-[#C9A24A]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search orders by Order #, Customer, or Phone..."
            className="w-full bg-transparent text-xs text-[#071426] outline-none placeholder:text-[#9A9080]"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-[#F7F3EA] text-[#7A7060] font-semibold uppercase text-[10px] tracking-wider border-b border-[#E6E1D7]">
                <th className="py-3 px-4">Order ID & Date</th>
                <th className="py-3 px-4">Client</th>
                <th className="py-3 px-4">Garment & Fabric Details</th>
                <th className="py-3 px-4">Trial & Delivery</th>
                <th className="py-3 px-4">Production Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F2ECE1]">
              {filtered.length > 0 ? (
                filtered.map(o => (
                  <tr key={o.id} className="hover:bg-[#F7F3EA]/50 transition-colors">
                    <td className="py-3.5 px-4 font-mono">
                      <div className="font-bold text-[#C9A24A] flex items-center gap-1.5">
                        <span>{o.id}</span>
                        {o.urgent && (
                          <span className="px-1.5 py-0.2 bg-red-100 text-red-700 text-[9px] font-sans font-bold rounded">
                            URGENT
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[#8C7E6A]">{o.orderDate}</div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="font-bold text-[#071426]">{o.customerName}</div>
                      <div className="text-[11px] text-[#7A7060]">{o.customerPhone}</div>
                    </td>

                    <td className="py-3.5 px-4 max-w-xs">
                      {(o.items || []).map((item, idx) => (
                        <div key={idx} className="mb-1 last:mb-0">
                          <span className="font-semibold text-[#071426]">{item.garmentType}</span>
                          <div className="text-[11px] text-[#7A7060] truncate">{item.fabricName}</div>
                        </div>
                      ))}
                    </td>

                    <td className="py-3.5 px-4 text-[11px] text-[#6E6454]">
                      <div>Trial: <strong className="text-[#071426]">{o.trialDate || 'Not Scheduled'}</strong></div>
                      <div>Delivery: <strong className="text-[#C9A24A]">{o.deliveryDate}</strong></div>
                    </td>

                    <td className="py-3.5 px-4">
                      <select
                        value={o.status}
                        onChange={(e) => onUpdateOrderStatus(o.id, e.target.value as OrderStatus)}
                        className="bg-[#F7F3EA] text-[#071426] font-bold text-xs rounded border border-[#E0D8CB] px-2 py-1 outline-none focus:border-[#C9A24A] cursor-pointer"
                      >
                        {statusOptions.filter(s => s !== 'All').map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => onSelectOrder(o)}
                          className="px-2.5 py-1 rounded-lg bg-[#071426] text-[#C9A24A] hover:bg-[#0B1930] text-[11px] font-semibold transition-colors cursor-pointer"
                        >
                          Details
                        </button>
                        {onPrintProductionSlip && (
                          <button
                            onClick={() => onPrintProductionSlip(o)}
                            className="p-1.5 text-[#071426] hover:bg-[#FAF8F5] rounded-lg transition-colors border border-[#E0D8CB] cursor-pointer"
                            title="Download PDF or Print Production Slip"
                          >
                            <Scissors className="w-3.5 h-3.5 text-[#C9A24A]" />
                          </button>
                        )}
                        <button
                          onClick={() => onEditOrder(o)}
                          className="p-1 text-[#8C7E6A] hover:text-[#071426] cursor-pointer"
                          title="Edit Order"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onDeleteOrder(o)}
                          className="p-1 text-[#8C7E6A] hover:text-red-600 cursor-pointer"
                          title="Delete Order"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-12 px-6 text-center">
                    {orders.length === 0 ? (
                      <div className="max-w-sm mx-auto space-y-3">
                        <div className="w-12 h-12 rounded-full bg-[#FAF8F5] border border-[#E5DFD5] flex items-center justify-center mx-auto text-[#C9A24A]">
                          <ShoppingBag className="w-6 h-6" />
                        </div>
                        <h3 className="text-base font-bold text-[#071426]">No Orders Yet</h3>
                        <p className="text-xs text-[#7A7060]">
                          Create your first tailoring order to get started.
                        </p>
                        <button
                          onClick={onNewOrder}
                          className="mt-2 px-4 py-2 bg-[#071426] text-[#D4AF5A] text-xs font-semibold rounded-xl hover:bg-[#0E2038] transition-colors cursor-pointer inline-flex items-center gap-1.5"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>+ New Order</span>
                        </button>
                      </div>
                    ) : (
                      <div className="max-w-sm mx-auto space-y-2">
                        <h3 className="text-sm font-bold text-[#071426]">No Matching Orders</h3>
                        <p className="text-xs text-[#7A7060]">
                          No orders found matching your search or status filter.
                        </p>
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
