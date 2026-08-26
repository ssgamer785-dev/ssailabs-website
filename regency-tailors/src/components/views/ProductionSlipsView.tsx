import React, { useState, useMemo } from 'react';
import { 
  ScrollText, 
  Search, 
  Filter, 
  Printer, 
  FileText, 
  Eye, 
  Scissors, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  Calendar,
  AlertTriangle,
  Layers,
  Sparkles,
  ChevronRight
} from 'lucide-react';
import { Order, ProductionStatus } from '../../types';

interface ProductionSlipsViewProps {
  orders: Order[];
  onSelectProductionSlip: (order: Order) => void;
  onPrintProductionSlip: (order: Order) => void;
  onPrintBill: (order: Order) => void;
  onViewOrderDetails: (order: Order) => void;
  onUpdateProductionStatus: (orderId: string, status: ProductionStatus) => void;
}

export const ProductionSlipsView: React.FC<ProductionSlipsViewProps> = ({
  orders,
  onSelectProductionSlip,
  onPrintProductionSlip,
  onPrintBill,
  onViewOrderDetails,
  onUpdateProductionStatus
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | ProductionStatus>('All');
  const [deliveryFilter, setDeliveryFilter] = useState<'All' | 'Today' | 'Upcoming' | 'Overdue'>('All');

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);

  // Counts for status metrics
  const counts = useMemo(() => {
    let total = orders.length;
    let newCount = 0;
    let inProdCount = 0;
    let readyCount = 0;
    let completedCount = 0;
    let overdueCount = 0;

    orders.forEach(o => {
      const st = o.productionStatus || 'New';
      if (st === 'New') newCount++;
      else if (st === 'In Production') inProdCount++;
      else if (st === 'Ready') readyCount++;
      else if (st === 'Completed') completedCount++;

      if (o.deliveryDate < todayStr && st !== 'Completed') {
        overdueCount++;
      }
    });

    return { total, newCount, inProdCount, readyCount, completedCount, overdueCount };
  }, [orders, todayStr]);

  // Filtered orders list
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const st = o.productionStatus || 'New';
      const orderNum = o.orderNumber || o.id;

      // Status filter
      if (statusFilter !== 'All' && st !== statusFilter) {
        return false;
      }

      // Delivery filter
      if (deliveryFilter === 'Today') {
        if (o.deliveryDate !== todayStr) return false;
      } else if (deliveryFilter === 'Upcoming') {
        if (o.deliveryDate <= todayStr || st === 'Completed') return false;
      } else if (deliveryFilter === 'Overdue') {
        if (o.deliveryDate >= todayStr || st === 'Completed') return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = o.customerName.toLowerCase().includes(q);
        const matchesNum = orderNum.toLowerCase().includes(q);
        const matchesPhone = o.customerPhone.includes(q);
        const matchesGarments = (o.items || []).some(i => i.garmentType.toLowerCase().includes(q));
        if (!matchesName && !matchesNum && !matchesPhone && !matchesGarments) {
          return false;
        }
      }

      return true;
    });
  }, [orders, statusFilter, deliveryFilter, searchQuery, todayStr]);

  const getStatusBadge = (status: ProductionStatus = 'New') => {
    switch (status) {
      case 'New':
        return 'bg-blue-50 text-blue-800 border-blue-200';
      case 'In Production':
        return 'bg-amber-50 text-amber-800 border-amber-300';
      case 'Ready':
        return 'bg-emerald-50 text-emerald-800 border-emerald-300';
      case 'Completed':
        return 'bg-slate-100 text-slate-700 border-slate-300';
      default:
        return 'bg-blue-50 text-blue-800 border-blue-200';
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-[#E6E1D7] shadow-2xs">
        <div>
          <div className="text-[10px] font-bold tracking-[0.2em] text-[#C9A24A] uppercase mb-1 brand-font">
            WORKSHOP MANUFACTURING QUEUE
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#071426] brand-font uppercase">
            Production Slips
          </h1>
          <p className="text-xs text-[#7A7060] mt-0.5">
            Single-source tailor workshop slips with full cutting specs, measurements, and production stages.
          </p>
        </div>

        {/* Quick Summary Pill */}
        <div className="flex items-center gap-2 bg-[#FAF8F5] p-2 rounded-2xl border border-[#E0D8CB]">
          <div className="px-3 py-1.5 bg-[#071426] text-[#D4AF5A] font-extrabold text-xs rounded-xl shadow-xs">
            {counts.total} Slips Total
          </div>
          {counts.overdueCount > 0 && (
            <div className="px-3 py-1.5 bg-red-50 text-red-700 font-extrabold text-xs rounded-xl border border-red-200 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{counts.overdueCount} Overdue</span>
            </div>
          )}
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <button
          onClick={() => setStatusFilter(statusFilter === 'New' ? 'All' : 'New')}
          className={`p-4 rounded-2xl border transition-all text-left cursor-pointer ${
            statusFilter === 'New'
              ? 'bg-blue-50/80 border-blue-300 ring-2 ring-blue-400'
              : 'bg-white border-[#E6E1D7] hover:border-[#C9A24A]'
          }`}
        >
          <div className="text-[10px] font-bold text-blue-800 uppercase flex items-center justify-between">
            <span>New In Queue</span>
            <span className="w-2 h-2 rounded-full bg-blue-500" />
          </div>
          <div className="text-2xl font-black text-[#071426] mt-1">{counts.newCount}</div>
        </button>

        <button
          onClick={() => setStatusFilter(statusFilter === 'In Production' ? 'All' : 'In Production')}
          className={`p-4 rounded-2xl border transition-all text-left cursor-pointer ${
            statusFilter === 'In Production'
              ? 'bg-amber-50/80 border-amber-300 ring-2 ring-amber-400'
              : 'bg-white border-[#E6E1D7] hover:border-[#C9A24A]'
          }`}
        >
          <div className="text-[10px] font-bold text-amber-800 uppercase flex items-center justify-between">
            <span>In Production</span>
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          </div>
          <div className="text-2xl font-black text-[#071426] mt-1">{counts.inProdCount}</div>
        </button>

        <button
          onClick={() => setStatusFilter(statusFilter === 'Ready' ? 'All' : 'Ready')}
          className={`p-4 rounded-2xl border transition-all text-left cursor-pointer ${
            statusFilter === 'Ready'
              ? 'bg-emerald-50/80 border-emerald-300 ring-2 ring-emerald-400'
              : 'bg-white border-[#E6E1D7] hover:border-[#C9A24A]'
          }`}
        >
          <div className="text-[10px] font-bold text-emerald-800 uppercase flex items-center justify-between">
            <span>Ready for Trial/Pickup</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
          </div>
          <div className="text-2xl font-black text-[#071426] mt-1">{counts.readyCount}</div>
        </button>

        <button
          onClick={() => setStatusFilter(statusFilter === 'Completed' ? 'All' : 'Completed')}
          className={`p-4 rounded-2xl border transition-all text-left cursor-pointer ${
            statusFilter === 'Completed'
              ? 'bg-slate-100 border-slate-300 ring-2 ring-slate-400'
              : 'bg-white border-[#E6E1D7] hover:border-[#C9A24A]'
          }`}
        >
          <div className="text-[10px] font-bold text-slate-700 uppercase flex items-center justify-between">
            <span>Completed</span>
            <span className="w-2 h-2 rounded-full bg-slate-400" />
          </div>
          <div className="text-2xl font-black text-[#071426] mt-1">{counts.completedCount}</div>
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-[#E6E1D7] shadow-2xs flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-[#8C7E6A] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search customer name or order number..."
            className="w-full pl-10 pr-4 py-2.5 bg-[#FAF8F5] border border-[#E0D8CB] rounded-xl text-xs text-[#071426] placeholder-[#8C7E6A] focus:outline-none focus:border-[#C9A24A]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#8C7E6A] hover:text-[#071426]"
            >
              Clear
            </button>
          )}
        </div>

        {/* Filter Badges */}
        <div className="flex items-center gap-2 flex-wrap w-full md:w-auto">
          {/* Status Dropdown */}
          <div className="flex items-center gap-1.5 bg-[#FAF8F5] border border-[#E0D8CB] px-3 py-1.5 rounded-xl text-xs">
            <Filter className="w-3.5 h-3.5 text-[#C9A24A]" />
            <span className="text-[10px] font-bold text-[#8C7E6A] uppercase">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="bg-transparent font-bold text-[#071426] outline-none cursor-pointer"
            >
              <option value="All">All Statuses</option>
              <option value="New">New</option>
              <option value="In Production">In Production</option>
              <option value="Ready">Ready</option>
              <option value="Completed">Completed</option>
            </select>
          </div>

          {/* Delivery Dropdown */}
          <div className="flex items-center gap-1.5 bg-[#FAF8F5] border border-[#E0D8CB] px-3 py-1.5 rounded-xl text-xs">
            <Calendar className="w-3.5 h-3.5 text-[#C9A24A]" />
            <span className="text-[10px] font-bold text-[#8C7E6A] uppercase">Delivery:</span>
            <select
              value={deliveryFilter}
              onChange={(e) => setDeliveryFilter(e.target.value as any)}
              className="bg-transparent font-bold text-[#071426] outline-none cursor-pointer"
            >
              <option value="All">All Dates</option>
              <option value="Today">Today</option>
              <option value="Upcoming">Upcoming</option>
              <option value="Overdue">Overdue</option>
            </select>
          </div>
        </div>
      </div>

      {/* Production Slips Table List */}
      {filteredOrders.length === 0 ? (
        <div className="bg-white rounded-3xl border border-[#E6E1D7] p-12 text-center space-y-4 shadow-2xs">
          <div className="w-16 h-16 rounded-full bg-[#FAF8F5] border-2 border-[#E0D8CB] text-[#C9A24A] flex items-center justify-center mx-auto">
            <ScrollText className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-black text-[#071426] uppercase">
              {orders.length === 0 ? 'No Production Slips Yet' : 'No matching slips found'}
            </h2>
            <p className="text-xs text-[#7A7060] max-w-md mx-auto">
              {orders.length === 0
                ? 'Production slips will appear automatically when orders are placed.'
                : 'Try adjusting your search criteria or filter tags above.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-[#E6E1D7] shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#071426] text-[#D4AF5A] font-extrabold uppercase text-[11px] tracking-wider">
                  <th className="py-3.5 px-4">Slip / Order No.</th>
                  <th className="py-3.5 px-4">Customer</th>
                  <th className="py-3.5 px-4">Garments</th>
                  <th className="py-3.5 px-4">Order Date</th>
                  <th className="py-3.5 px-4">Delivery Date</th>
                  <th className="py-3.5 px-4">Production Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E6E1D7]">
                {filteredOrders.map((order) => {
                  const orderNum = order.orderNumber || order.id;
                  const prodStatus: ProductionStatus = order.productionStatus || 'New';
                  const isOverdue = order.deliveryDate < todayStr && prodStatus !== 'Completed';

                  return (
                    <tr 
                      key={order.id} 
                      className="hover:bg-[#FAF8F5] transition-colors group cursor-pointer"
                      onClick={() => onSelectProductionSlip(order)}
                    >
                      {/* Slip / Order No */}
                      <td className="py-4 px-4 font-black text-sm text-[#071426] whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-1 bg-[#071426] text-[#D4AF5A] font-black text-xs rounded-lg border border-[#C9A24A]/40 shadow-2xs">
                            #{orderNum}
                          </span>
                          {order.urgent && (
                            <span className="px-1.5 py-0.5 bg-red-100 text-red-700 font-extrabold text-[9px] rounded">
                              URGENT
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Customer */}
                      <td className="py-4 px-4">
                        <div className="font-extrabold text-sm text-[#071426]">{order.customerName}</div>
                        <div className="text-[11px] text-[#7A7060] font-medium">{order.customerPhone}</div>
                      </td>

                      {/* Garments */}
                      <td className="py-4 px-4">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {order.items?.map((item, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 bg-[#FAF8F5] text-[#071426] font-bold text-[11px] rounded-md border border-[#E0D8CB]"
                            >
                              {item.quantity && item.quantity > 1 ? `${item.quantity}x ` : ''}
                              {item.garmentType}
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* Order Date */}
                      <td className="py-4 px-4 text-xs font-semibold text-[#7A7060] whitespace-nowrap">
                        {order.orderDate}
                      </td>

                      {/* Delivery Date */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className={`font-extrabold text-xs ${isOverdue ? 'text-red-600' : 'text-[#071426]'}`}>
                            {order.deliveryDate}
                          </span>
                          {isOverdue && (
                            <span className="px-1.5 py-0.2 bg-red-100 text-red-700 font-extrabold text-[9px] rounded">
                              OVERDUE
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Status Dropdown/Selector */}
                      <td 
                        className="py-4 px-4 whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <select
                          value={prodStatus}
                          onChange={(e) => onUpdateProductionStatus(order.id, e.target.value as ProductionStatus)}
                          className={`py-1 px-2.5 rounded-lg text-xs font-black uppercase tracking-wider border cursor-pointer outline-none ${getStatusBadge(prodStatus)}`}
                        >
                          <option value="New">New</option>
                          <option value="In Production">In Production</option>
                          <option value="Ready">Ready</option>
                          <option value="Completed">Completed</option>
                        </select>
                      </td>

                      {/* Actions */}
                      <td 
                        className="py-4 px-4 text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => onSelectProductionSlip(order)}
                            className="p-1.5 bg-[#FAF8F5] hover:bg-[#EFE9DF] text-[#071426] rounded-lg border border-[#E0D8CB] transition-colors"
                            title="View Production Slip"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => onPrintProductionSlip(order)}
                            className="p-1.5 bg-[#071426] hover:bg-[#0E2038] text-[#D4AF5A] rounded-lg border border-[#C9A24A]/30 transition-colors shadow-2xs"
                            title="Print Production Slip"
                          >
                            <Printer className="w-3.5 h-3.5 text-[#C9A24A]" />
                          </button>

                          <button
                            onClick={() => onPrintBill(order)}
                            className="p-1.5 bg-white hover:bg-[#FAF8F5] text-[#071426] rounded-lg border border-[#E0D8CB] transition-colors shadow-2xs"
                            title="Print Customer Bill"
                          >
                            <FileText className="w-3.5 h-3.5 text-[#C9A24A]" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
};
