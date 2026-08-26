import React, { useState, useMemo } from 'react';
import { Plus, Search, Eye, Edit3, Trash2, Filter, AlertTriangle, Users, MapPin } from 'lucide-react';
import { Customer, Order, MeasurementRecord } from '../../types';

interface CustomersViewProps {
  customers: Customer[];
  orders?: Order[];
  measurements?: MeasurementRecord[];
  onAddCustomer: () => void;
  onEditCustomer: (customer: Customer) => void;
  onDeleteCustomer: (customer: Customer) => void;
  onViewMeasurements?: (customer: Customer) => void;
  onCreateOrderForCustomer?: (customer: Customer) => void;
  onSelectCustomerProfile?: (customer: Customer) => void;
}

export const CustomersView: React.FC<CustomersViewProps> = ({
  customers = [],
  orders = [],
  measurements = [],
  onAddCustomer,
  onEditCustomer,
  onDeleteCustomer,
  onViewMeasurements,
  onCreateOrderForCustomer,
  onSelectCustomerProfile
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name_asc' | 'name_desc' | 'newest' | 'oldest' | 'most_orders'>('name_asc');
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);

  // Helper to format date cleanly like "21 Aug 2026"
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '21 Aug 2026';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  // Compute calculated metrics for each customer
  const customerStatsMap = useMemo(() => {
    const map = new Map<string, { orderCount: number; activeOrderCount: number }>();

    (customers || []).forEach(c => {
      const custOrders = (orders || []).filter(
        o => o.customerId === c.id || (c.phone && o.customerPhone === c.phone) || o.customerName === c.name
      );
      const activeCount = custOrders.filter(o => o.status !== 'Delivered').length;
      map.set(c.id, {
        orderCount: custOrders.length > 0 ? custOrders.length : (c.totalOrders || 0),
        activeOrderCount: activeCount
      });
    });

    return map;
  }, [customers, orders]);

  // Filtered and sorted customer list
  const processedCustomers = useMemo(() => {
    let list = [...(customers || [])];

    // 1. Search Query Filter
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(c => {
        const nameMatch = (c.name || '').toLowerCase().includes(q);
        const phoneMatch = (c.phone || '').includes(q);
        const idMatch = (c.id || '').toLowerCase().includes(q);
        const cityMatch = (c.city || '').toLowerCase().includes(q);
        return nameMatch || phoneMatch || idMatch || cityMatch;
      });
    }

    // 2. Sorting
    list.sort((a, b) => {
      const statsA = customerStatsMap.get(a.id) || { orderCount: a.totalOrders || 0, activeOrderCount: 0 };
      const statsB = customerStatsMap.get(b.id) || { orderCount: b.totalOrders || 0, activeOrderCount: 0 };

      switch (sortBy) {
        case 'name_asc':
          return (a.name || '').localeCompare(b.name || '');
        case 'name_desc':
          return (b.name || '').localeCompare(a.name || '');
        case 'newest': {
          const dateA = new Date(a.createdDate || 0).getTime();
          const dateB = new Date(b.createdDate || 0).getTime();
          return dateB - dateA;
        }
        case 'oldest': {
          const dateA = new Date(a.createdDate || 0).getTime();
          const dateB = new Date(b.createdDate || 0).getTime();
          return dateA - dateB;
        }
        case 'most_orders':
          return statsB.orderCount - statsA.orderCount;
        default:
          return 0;
      }
    });

    return list;
  }, [customers, searchQuery, sortBy, customerStatsMap]);

  return (
    <div className="w-full animate-fadeIn pb-12">
      {/* Main Customer Content Card */}
      <div className="bg-white rounded-3xl sm:rounded-[28px] border border-[#E5DFD5] shadow-[0_4px_25px_rgba(0,0,0,0.03)] p-6 sm:p-8 lg:p-10">
        
        {/* Page Title & Add Customer Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#071426] tracking-tight">
              Showroom Customers
            </h1>
            <p className="text-xs sm:text-sm text-[#7A7060] font-normal mt-1">
              Manage custom tailoring accounts and fit preferences
            </p>
          </div>

          <button
            onClick={onAddCustomer}
            className="px-5 py-2.5 bg-[#071426] hover:bg-[#0E2038] text-white text-xs sm:text-sm font-semibold rounded-xl shadow-xs transition-all flex items-center gap-2 self-start sm:self-auto cursor-pointer active:scale-98"
          >
            <Plus className="w-4 h-4 text-[#C9A24A]" />
            <span>Add New Customer</span>
          </button>
        </div>

        {/* Search / Filter / Sort Toolbar */}
        <div className="mt-6 p-3 sm:p-4 rounded-2xl border border-[#E5DFD5] bg-[#FAF8F5]/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Left: Search input */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 flex-1">
            {/* Search Input Box */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-[#9A9080] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by full name or mobile..."
                className="w-full pl-10 pr-4 py-2 bg-white rounded-xl border border-[#E5DFD5] text-xs text-[#071426] placeholder:text-[#9A9080] focus:outline-none focus:border-[#C9A24A] focus:ring-1 focus:ring-[#C9A24A] shadow-xs"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#8C7E6A] hover:text-[#071426] cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Right: Filter Icon & Sort Dropdown */}
          <div className="flex items-center gap-3 self-end md:self-auto">
            <div className="p-2 text-[#7A7060]" title="Filter Applied">
              <Filter className="w-4 h-4" />
            </div>

            <div className="relative">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-white border border-[#E5DFD5] rounded-xl px-3.5 py-2 text-xs font-semibold text-[#071426] shadow-xs focus:outline-none focus:border-[#C9A24A] cursor-pointer pr-8 appearance-none"
              >
                <option value="name_asc">Sort: Name (A-Z)</option>
                <option value="name_desc">Sort: Name (Z-A)</option>
                <option value="newest">Sort: Newest Customer</option>
                <option value="oldest">Sort: Oldest Customer</option>
                <option value="most_orders">Sort: Most Orders</option>
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[#7A7060] text-xs">
                ▼
              </div>
            </div>
          </div>
        </div>

        {/* Customer Table */}
        <div className="mt-6 rounded-2xl border border-[#E5DFD5] overflow-hidden bg-white shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#FAF8F5] text-[#574E3E] font-semibold text-xs border-b border-[#E5DFD5]">
                  <th className="py-3.5 px-5">Customer Details</th>
                  <th className="py-3.5 px-5">Mobile Number</th>
                  <th className="py-3.5 px-5">City / Location</th>
                  <th className="py-3.5 px-5">Customer Since</th>
                  <th className="py-3.5 px-5 text-center">Total Orders</th>
                  <th className="py-3.5 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F2ECE1]">
                {processedCustomers.length > 0 ? (
                  processedCustomers.map((customer) => {
                    const stats = customerStatsMap.get(customer.id) || { orderCount: customer.totalOrders || 0, activeOrderCount: 0 };
                    const initial = (customer.name || 'C').trim().charAt(0).toUpperCase();
                    const isFirstTime = stats.orderCount <= 1;

                    return (
                      <tr
                        key={customer.id}
                        className="hover:bg-[#FAF8F5]/60 transition-colors"
                      >
                        {/* Customer Details: Avatar + Name + First Time / Returning Badge */}
                        <td className="py-4 px-5">
                          <div className="flex items-center gap-3">
                            {/* Circular Avatar */}
                            <div className="w-10 h-10 rounded-full bg-[#F7F3EA] border border-[#E0D8CB] flex items-center justify-center font-bold text-[#071426] text-sm flex-shrink-0 shadow-2xs">
                              {initial}
                            </div>
                            <div>
                              <button
                                type="button"
                                onClick={() => onSelectCustomerProfile && onSelectCustomerProfile(customer)}
                                className="font-semibold text-sm text-[#071426] hover:text-[#C9A24A] transition-colors cursor-pointer text-left block"
                              >
                                {customer.name}
                              </button>
                              <div className="mt-0.5">
                                {isFirstTime ? (
                                  <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-[#FBF7EE] text-[#9E7B30] border border-[#E8DFC8]">
                                    First Time Customer
                                  </span>
                                ) : (
                                  <span className="inline-block px-2 py-0.5 rounded text-[10px] font-medium bg-[#F3F4F6] text-[#475569] border border-[#E2E8F0]">
                                    Returning Customer
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Mobile Number */}
                        <td className="py-4 px-5 font-normal text-xs text-[#071426]">
                          {customer.phone || '—'}
                        </td>

                        {/* City / Location */}
                        <td className="py-4 px-5 font-normal text-xs text-[#574E3E]">
                          {customer.city || customer.address || '—'}
                        </td>

                        {/* Customer Since */}
                        <td className="py-4 px-5 font-normal text-xs text-[#071426]">
                          {formatDate(customer.createdDate)}
                        </td>

                        {/* Orders */}
                        <td className="py-4 px-5 text-center font-bold text-xs text-[#071426]">
                          <span className="px-2.5 py-1 rounded-lg bg-[#FAF8F5] border border-[#E5DFD5]">
                            {stats.orderCount} Orders
                          </span>
                        </td>

                        {/* Actions: View (Eye), Edit (Pencil), Delete (Trash) */}
                        <td className="py-4 px-5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {/* View Customer Profile */}
                            <button
                              onClick={() => onSelectCustomerProfile && onSelectCustomerProfile(customer)}
                              className="p-1.5 text-[#574E3E] hover:text-[#071426] hover:bg-[#F7F3EA] rounded-lg transition-colors cursor-pointer"
                              title="View Customer Profile"
                            >
                              <Eye className="w-4 h-4" />
                            </button>

                            {/* Edit Customer */}
                            <button
                              onClick={() => onEditCustomer(customer)}
                              className="p-1.5 text-[#574E3E] hover:text-[#071426] hover:bg-[#F7F3EA] rounded-lg transition-colors cursor-pointer"
                              title="Edit Customer Details"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>

                            {/* Delete / Move to Trash */}
                            <button
                              onClick={() => setCustomerToDelete(customer)}
                              className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                              title="Move Customer to Trash"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  /* Empty Search Results / Empty Customer List State */
                  <tr>
                    <td colSpan={6} className="py-12 px-6 text-center">
                      {customers.length === 0 ? (
                        <div className="max-w-sm mx-auto space-y-3">
                          <div className="w-12 h-12 rounded-full bg-[#FAF8F5] border border-[#E5DFD5] flex items-center justify-center mx-auto text-[#C9A24A]">
                            <Users className="w-6 h-6" />
                          </div>
                          <h3 className="text-base font-bold text-[#071426]">No Customers Yet</h3>
                          <p className="text-xs text-[#7A7060]">
                            Add your first customer to start managing tailoring orders and measurements.
                          </p>
                          <button
                            onClick={onAddCustomer}
                            className="mt-2 px-4 py-2 bg-[#071426] text-white text-xs font-semibold rounded-xl hover:bg-[#0E2038] transition-colors cursor-pointer inline-flex items-center gap-1.5"
                          >
                            <Plus className="w-3.5 h-3.5 text-[#C9A24A]" />
                            <span>Add New Customer</span>
                          </button>
                        </div>
                      ) : (
                        <div className="max-w-sm mx-auto space-y-2">
                          <h3 className="text-sm font-bold text-[#071426]">No Customers Found</h3>
                          <p className="text-xs text-[#7A7060]">
                            Try another name or mobile number.
                          </p>
                          <button
                            onClick={() => {
                              setSearchQuery('');
                            }}
                            className="mt-2 text-xs font-semibold text-[#C9A24A] hover:underline cursor-pointer"
                          >
                            Clear search filters
                          </button>
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

      {/* Delete / Move to Trash Confirmation Dialog Modal */}
      {customerToDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-[#E5DFD5] space-y-4 animate-scaleUp">
            <div className="flex items-center gap-3 text-red-600">
              <div className="p-2.5 rounded-full bg-red-50 border border-red-100">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-[#071426]">
                Move Customer to Trash?
              </h3>
            </div>

            <p className="text-xs text-[#6E6454] leading-relaxed">
              This customer (<span className="font-semibold text-[#071426]">{customerToDelete.name}</span>) and related records will be moved to Trash. You can restore them anytime from the Trash section.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setCustomerToDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-[#6E6454] hover:text-[#071426] hover:bg-[#FAF8F5] rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const toDelete = customerToDelete;
                  setCustomerToDelete(null);
                  onDeleteCustomer(toDelete);
                }}
                className="px-4 py-2 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                Move to Trash
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
