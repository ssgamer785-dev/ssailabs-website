import React from 'react';
import {
  Users,
  ShoppingBag,
  Calendar,
  Clock,
  Sparkles,
  ArrowUpRight,
  Plus,
  Ruler,
  Scissors,
  ScrollText,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Phone
} from 'lucide-react';
import { Customer, Order, Fitting } from '../../types';
import { NavTab } from '../Sidebar';

interface DashboardViewProps {
  customers: Customer[];
  orders: Order[];
  fittings: Fitting[];
  userName: string;
  setActiveTab: (tab: NavTab) => void;
  onNewOrder: () => void;
  onNewCustomer: () => void;
  onNewMeasurement: () => void;
  onNewFitting: () => void;
  onSelectOrder: (order: Order) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  customers,
  orders,
  fittings,
  userName,
  setActiveTab,
  onNewOrder,
  onNewCustomer,
  onNewMeasurement,
  onNewFitting,
  onSelectOrder
}) => {
  // Calculations
  const totalCustomers = customers.length;
  const activeOrders = orders.filter(o => o.status !== 'Delivered');
  const activeOrdersCount = activeOrders.length;
  const dueThisWeekCount = orders.filter(o => o.status !== 'Delivered').length;
  const inWorkshopQueue = orders.filter(o => (o.productionStatus || 'New') !== 'Completed').length;

  // Today's Date string
  const todayStr = new Date().toISOString().split('T')[0];
  const todayAppointments = fittings.filter(f => f.status === 'Scheduled');
  const todayDeliveries = orders.filter(o => o.deliveryDate === todayStr && o.status !== 'Delivered');

  return (
    <div className="space-y-8 animate-fadeIn pb-12 w-full max-w-[1920px] mx-auto">
      {/* Showroom Header */}
      <div className="bg-white rounded-3xl p-6 md:p-8 border border-[#E0D8CB] shadow-md relative overflow-hidden bg-chevron-pattern">
        <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-bl from-[#C9A24A]/15 to-transparent rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="text-xs font-bold tracking-[0.25em] text-[#C9A24A] uppercase mb-1.5 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#C9A24A]" />
              <span>REGENCY TAILOR • SHOWROOM HUB</span>
            </div>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-black text-[#071426] tracking-tight">
              REGENCY TAILOR
            </h1>
            <p className="text-sm md:text-base text-[#574E3E] mt-1.5 font-bold">
              Welcome Back, <span className="text-[#071426] font-extrabold">{userName}</span> • Showroom Owner
            </p>
          </div>

          {/* Action Quick Buttons */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={onNewOrder}
              className="px-5 py-3 bg-[#C9A24A] hover:bg-[#B8913B] text-[#071426] font-black text-xs md:text-sm rounded-2xl shadow-md transition-all flex items-center gap-2 active:scale-95 cursor-pointer"
            >
              <Plus className="w-5 h-5 stroke-[2.5]" />
              <span>New Order</span>
            </button>
          </div>
        </div>
      </div>

      {/* 5 Statistic Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
        {/* 1. TOTAL CUSTOMERS */}
        <div
          onClick={() => setActiveTab('customers')}
          className="bg-white rounded-2xl p-5 md:p-6 border border-[#E0D8CB] shadow-xs hover:border-[#C9A24A] hover:shadow-lg transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-11 h-11 rounded-xl bg-[#F7F3EA] flex items-center justify-center text-[#C9A24A] group-hover:bg-[#071426] group-hover:text-[#D4AF5A] transition-colors shadow-xs">
              <Users className="w-5 h-5 stroke-[2.5]" />
            </div>
          </div>
          <div className="text-xs font-extrabold text-[#6E6454] tracking-widest uppercase mb-1">
            TOTAL CUSTOMERS
          </div>
          <div className="text-3xl md:text-4xl font-black text-[#071426] tracking-tight">
            {totalCustomers}
          </div>
        </div>

        {/* 2. ACTIVE ORDERS */}
        <div
          onClick={() => setActiveTab('orders')}
          className="bg-white rounded-2xl p-5 md:p-6 border border-[#E0D8CB] shadow-xs hover:border-[#C9A24A] hover:shadow-lg transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-11 h-11 rounded-xl bg-[#F7F3EA] flex items-center justify-center text-[#C9A24A] group-hover:bg-[#071426] group-hover:text-[#D4AF5A] transition-colors shadow-xs">
              <ShoppingBag className="w-5 h-5 stroke-[2.5]" />
            </div>
            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
              In Progress
            </span>
          </div>
          <div className="text-xs font-extrabold text-[#6E6454] tracking-widest uppercase mb-1">
            ACTIVE ORDERS
          </div>
          <div className="text-3xl md:text-4xl font-black text-[#071426] tracking-tight">
            {activeOrdersCount}
          </div>
        </div>

        {/* 3. DUE THIS WEEK */}
        <div
          onClick={() => setActiveTab('orders')}
          className="bg-white rounded-2xl p-5 md:p-6 border border-[#E0D8CB] shadow-xs hover:border-[#C9A24A] hover:shadow-lg transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-11 h-11 rounded-xl bg-[#F7F3EA] flex items-center justify-center text-[#C9A24A] group-hover:bg-[#071426] group-hover:text-[#D4AF5A] transition-colors shadow-xs">
              <Calendar className="w-5 h-5 stroke-[2.5]" />
            </div>
          </div>
          <div className="text-xs font-extrabold text-[#6E6454] tracking-widest uppercase mb-1">
            DUE THIS WEEK
          </div>
          <div className="text-3xl md:text-4xl font-black text-[#071426] tracking-tight">
            {dueThisWeekCount}
          </div>
        </div>

        {/* 4. WORKSHOP QUEUE */}
        <div
          onClick={() => setActiveTab('productionslips')}
          className="bg-white rounded-2xl p-5 md:p-6 border border-[#E0D8CB] shadow-xs hover:border-[#C9A24A] hover:shadow-lg transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-11 h-11 rounded-xl bg-[#F7F3EA] flex items-center justify-center text-[#C9A24A] group-hover:bg-[#071426] group-hover:text-[#D4AF5A] transition-colors shadow-xs">
              <ScrollText className="w-5 h-5 stroke-[2.5]" />
            </div>
            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-900 border border-blue-300">
              Workshop
            </span>
          </div>
          <div className="text-xs font-extrabold text-[#6E6454] tracking-widest uppercase mb-1">
            WORKSHOP QUEUE
          </div>
          <div className="text-3xl md:text-4xl font-black text-[#071426] tracking-tight">
            {inWorkshopQueue}
          </div>
        </div>

        {/* 5. TODAY'S APPOINTMENTS */}
        <div
          onClick={() => setActiveTab('fittings')}
          className="bg-white rounded-2xl p-5 md:p-6 border border-[#E0D8CB] shadow-xs hover:border-[#C9A24A] hover:shadow-lg transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-11 h-11 rounded-xl bg-[#F7F3EA] flex items-center justify-center text-[#C9A24A] group-hover:bg-[#071426] group-hover:text-[#D4AF5A] transition-colors shadow-xs">
              <Clock className="w-5 h-5 stroke-[2.5]" />
            </div>
            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-900 border border-blue-300">
              Today
            </span>
          </div>
          <div className="text-xs font-extrabold text-[#6E6454] tracking-widest uppercase mb-1">
            TODAY'S APPOINTMENTS
          </div>
          <div className="text-3xl md:text-4xl font-black text-[#071426] tracking-tight">
            {todayAppointments.length}
          </div>
        </div>
      </div>

      {/* TODAY'S DELIVERIES SECTION */}
      <div className="bg-white rounded-3xl border border-[#E0D8CB] shadow-md p-6 md:p-8 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#F2ECE1]">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🔥</span>
            <div>
              <h2 className="text-lg md:text-xl font-black text-[#071426] flex items-center gap-2">
                Today's Deliveries
              </h2>
              <p className="text-xs md:text-sm font-bold text-[#6E6454]">
                Bespoke orders scheduled for showroom pickup or delivery today.
              </p>
            </div>
          </div>
          <span className="self-start sm:self-auto px-4 py-1.5 rounded-full text-xs font-black bg-[#F7F3EA] text-[#C9A24A] border-2 border-[#E0D8CB]">
            {todayDeliveries.length} Orders Scheduled
          </span>
        </div>

        {/* Deliveries List or Empty State */}
        {todayDeliveries.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {todayDeliveries.map(o => (
              <div
                key={o.id}
                onClick={() => onSelectOrder(o)}
                className="p-5 rounded-2xl border-2 border-[#C9A24A]/50 bg-[#FDF9EE] hover:bg-[#F2ECE1] transition-all cursor-pointer flex items-center justify-between shadow-xs"
              >
                <div>
                  <div className="font-black text-[#071426] text-base flex items-center gap-2">
                    <span className="text-[#C9A24A] font-mono">{o.id}</span>
                    <span>• {o.customerName}</span>
                  </div>
                  <div className="text-xs font-bold text-[#574E3E] mt-1.5">
                    {(o.items || []).map(i => i.garmentType).join(', ')}
                  </div>
                  <div className="text-xs text-[#071426] font-extrabold mt-1.5">
                    Delivery Date: {o.deliveryDate}
                  </div>
                </div>
                <button className="px-4 py-2 bg-[#071426] text-[#C9A24A] text-xs font-extrabold rounded-xl hover:bg-[#0B1930] shadow-xs">
                  View
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-10 rounded-2xl border-2 border-dashed border-[#E0D8CB] bg-[#FAFAFA] text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-[#F7F3EA] text-[#C9A24A] mx-auto flex items-center justify-center shadow-xs">
              <Sparkles className="w-7 h-7 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="text-base font-black text-[#071426]">All Clear for Today!</h3>
              <p className="text-xs md:text-sm font-bold text-[#6E6454] max-w-md mx-auto mt-1">
                No custom suits or garments are scheduled for delivery today. Use the Order Book to review upcoming order dates.
              </p>
            </div>
            <button
              onClick={() => setActiveTab('orders')}
              className="px-6 py-3 bg-[#071426] text-[#D4AF5A] hover:bg-[#0B1930] text-xs md:text-sm font-black rounded-2xl transition-all shadow-md inline-flex items-center gap-2.5 cursor-pointer"
            >
              <span>Open Order Book</span>
              <ArrowUpRight className="w-4 h-4 text-[#C9A24A] stroke-[2.5]" />
            </button>
          </div>
        )}
      </div>

      {/* Grid: Upcoming Fitting Appointments & Recent Showroom Orders */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: Upcoming Fitting Appointments (4 cols) */}
        <div className="lg:col-span-4 bg-white rounded-3xl border border-[#E0D8CB] p-6 shadow-md space-y-5">
          <div className="flex items-center justify-between pb-4 border-b border-[#F2ECE1]">
            <h3 className="text-base font-black text-[#071426] flex items-center gap-2.5">
              <Clock className="w-5 h-5 text-[#C9A24A] stroke-[2.5]" />
              <span>Fitting & Trial Schedule</span>
            </h3>
            <button
              onClick={() => setActiveTab('fittings')}
              className="text-xs font-extrabold text-[#C9A24A] hover:underline cursor-pointer"
            >
              View All
            </button>
          </div>

          <div className="space-y-4">
            {todayAppointments.length > 0 ? (
              todayAppointments.map(f => (
                <div
                  key={f.id}
                  className="p-4 rounded-2xl border border-[#E0D8CB] bg-[#F7F3EA]/60 hover:bg-[#F7F3EA] transition-colors space-y-2 shadow-2xs"
                >
                  <div className="flex items-center justify-between text-xs md:text-sm">
                    <span className="font-black text-[#071426]">{f.customerName}</span>
                    <span className="px-2.5 py-1 bg-[#071426] text-[#C9A24A] font-extrabold rounded-lg text-xs">
                      {f.scheduledTime}
                    </span>
                  </div>
                  <div className="text-xs font-bold text-[#574E3E]">
                    <span>{f.garment} ({f.trialStage})</span>
                  </div>
                  <div className="text-xs text-[#6E6454] font-semibold italic">
                    "{f.adjustmentNotes}"
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs md:text-sm font-bold text-[#6E6454] text-center py-6">
                No fittings scheduled for today.
              </p>
            )}
          </div>
        </div>

        {/* Right: Recent Showroom Orders (8 cols) */}
        <div className="lg:col-span-8 bg-white rounded-3xl border border-[#E0D8CB] p-6 shadow-md space-y-5">
          <div className="flex items-center justify-between pb-4 border-b border-[#F2ECE1]">
            <h3 className="text-base font-black text-[#071426] flex items-center gap-2.5">
              <ShoppingBag className="w-5 h-5 text-[#C9A24A] stroke-[2.5]" />
              <span>Recent Bespoke Orders</span>
            </h3>
            <button
              onClick={() => setActiveTab('orders')}
              className="text-xs font-extrabold text-[#C9A24A] hover:underline cursor-pointer"
            >
              View All Orders
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs md:text-sm">
              <thead>
                <tr className="border-b-2 border-[#E0D8CB] text-[#071426] uppercase font-black text-xs tracking-wider">
                  <th className="py-3 px-4">Order ID</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Garments</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Delivery Date</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F2ECE1]">
                {orders.length > 0 ? (
                  orders.slice(0, 5).map(o => (
                    <tr key={o.id} className="hover:bg-[#F7F3EA]/70 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-black text-[#C9A24A]">{o.id}</td>
                      <td className="py-3.5 px-4 font-black text-[#071426]">{o.customerName}</td>
                      <td className="py-3.5 px-4 font-bold text-[#574E3E]">
                        {(o.items || []).map(i => i.garmentType).join(', ')}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="px-2.5 py-1 rounded-md text-xs font-extrabold bg-[#F7F3EA] text-[#071426] border border-[#E0D8CB]">
                          {o.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-bold text-[#071426] text-xs">
                        {o.deliveryDate}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => onSelectOrder(o)}
                          className="p-1.5 rounded-lg hover:bg-[#071426] text-[#C9A24A] hover:text-[#D4AF5A] transition-colors cursor-pointer"
                        >
                          <ChevronRight className="w-5 h-5 stroke-[2.5]" />
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-xs md:text-sm font-bold text-[#6E6454]">
                      No recent orders found. Create your first tailoring order to get started.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
