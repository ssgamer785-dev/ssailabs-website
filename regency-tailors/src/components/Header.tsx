import React, { useState } from 'react';
import { Search, Menu, User, Sparkles, ChevronRight, Phone, ShoppingBag, Ruler } from 'lucide-react';
import { Customer, Order } from '../types';

interface HeaderProps {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  customers: Customer[];
  orders: Order[];
  onSelectCustomer?: (customer: Customer) => void;
  onSelectOrder?: (order: Order) => void;
  onOpenMobileMenu?: () => void;
  userName?: string;
  userRole?: string;
}

export const Header: React.FC<HeaderProps> = ({
  searchQuery,
  setSearchQuery,
  customers,
  orders,
  onSelectCustomer,
  onSelectOrder,
  onOpenMobileMenu,
  userName = 'Showroom Owner',
  userRole = 'Showroom Owner / Admin'
}) => {
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  // Filter search results
  const filteredCustomers = searchQuery.trim()
    ? customers.filter(
        c =>
          c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.phone.includes(searchQuery) ||
          c.id.toLowerCase().includes(searchQuery.toLowerCase())
      ).slice(0, 4)
    : [];

  const filteredOrders = searchQuery.trim()
    ? orders.filter(
        o =>
          o.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
          o.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          o.customerPhone.includes(searchQuery)
      ).slice(0, 4)
    : [];

  const hasResults = filteredCustomers.length > 0 || filteredOrders.length > 0;

  return (
    <header className="sticky top-0 z-20 bg-[#F7F3EA]/90 backdrop-blur-md border-b border-[#E6E1D7] px-4 md:px-8 py-3 flex items-center justify-between gap-4">
      {/* Left: Mobile Menu Toggle & Smart Search */}
      <div className="flex items-center gap-3 flex-1 max-w-2xl">
        <button
          onClick={onOpenMobileMenu}
          className="md:hidden p-2 rounded-lg bg-white border border-[#E6E1D7] text-[#071426] hover:bg-[#F2ECE1] transition-colors"
          aria-label="Toggle Navigation"
        >
          <Menu className="w-5 h-5 text-[#C9A24A]" />
        </button>

        {/* Smart Search Bar */}
        <div className="relative flex-1">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 absolute left-3 text-[#C9A24A] pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
              placeholder="Smart Search: Type customer name or digits..."
              className="w-full bg-white border border-[#E0D8CB] focus:border-[#C9A24A] focus:ring-2 focus:ring-[#C9A24A]/20 text-[#071426] text-xs md:text-sm pl-9 pr-8 py-2 rounded-lg outline-none transition-all placeholder:text-[#9A9080] font-medium placeholder:font-normal shadow-2xs"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 text-[#9A9080] hover:text-[#071426] text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>

          {/* Instant Search Popup */}
          {isSearchFocused && searchQuery.trim().length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-[#E0D8CB] rounded-xl shadow-xl z-50 overflow-hidden divide-y divide-[#F2ECE1]">
              {!hasResults && (
                <div className="p-4 text-center text-xs text-[#7A7060]">
                  No matching customers or orders found for "<span className="font-semibold">{searchQuery}</span>"
                </div>
              )}

              {/* Customers Section */}
              {filteredCustomers.length > 0 && (
                <div className="p-2">
                  <div className="text-[10px] font-bold text-[#C9A24A] uppercase tracking-wider px-2 py-1 flex items-center gap-1">
                    <User className="w-3 h-3" />
                    <span>Customers Ledger</span>
                  </div>
                  {filteredCustomers.map(c => (
                    <button
                      key={c.id}
                      onMouseDown={() => {
                        if (onSelectCustomer) onSelectCustomer(c);
                        setSearchQuery('');
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-[#F7F3EA] flex items-center justify-between transition-colors text-xs"
                    >
                      <div>
                        <div className="font-semibold text-[#071426]">{c.name}</div>
                        <div className="text-[11px] text-[#7A7060] flex items-center gap-2">
                          <span>{c.phone}</span>
                          <span>•</span>
                          <span>{c.city}</span>
                        </div>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-[#C9A24A]" />
                    </button>
                  ))}
                </div>
              )}

              {/* Orders Section */}
              {filteredOrders.length > 0 && (
                <div className="p-2">
                  <div className="text-[10px] font-bold text-[#C9A24A] uppercase tracking-wider px-2 py-1 flex items-center gap-1">
                    <ShoppingBag className="w-3 h-3" />
                    <span>Bespoke Orders</span>
                  </div>
                  {filteredOrders.map(o => (
                    <button
                      key={o.id}
                      onMouseDown={() => {
                        if (onSelectOrder) onSelectOrder(o);
                        setSearchQuery('');
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-[#F7F3EA] flex items-center justify-between transition-colors text-xs"
                    >
                      <div>
                        <div className="font-semibold text-[#071426] flex items-center gap-2">
                          <span className="text-[#C9A24A] font-mono">{o.id}</span>
                          <span>— {o.customerName}</span>
                        </div>
                        <div className="text-[11px] text-[#7A7060]">
                          {(o.items || []).map(i => i.garmentType).join(', ')} • {o.status}
                        </div>
                      </div>
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-[#F7F3EA] text-[#071426] border border-[#E0D8CB]">
                        {o.status}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
