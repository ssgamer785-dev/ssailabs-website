import React from 'react';
import {
  LayoutDashboard,
  Users,
  Ruler,
  ShoppingBag,
  ScrollText,
  Calendar,
  Database,
  Trash2,
  ExternalLink,
  LogOut,
  X
} from 'lucide-react';
import { RegencyLogo } from './RegencyLogo';

export type NavTab =
  | 'dashboard'
  | 'customers'
  | 'measurements'
  | 'orders'
  | 'productionslips'
  | 'fittings'
  | 'workers'
  | 'billings'
  | 'finances'
  | 'backup'
  | 'trash';

interface SidebarProps {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  onOpenClientPortal: () => void;
  userName?: string;
  onSignOut?: () => void;
  mobileOpen?: boolean;
  setMobileOpen?: (open: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  onOpenClientPortal,
  userName = 'Showroom Owner',
  onSignOut,
  mobileOpen = false,
  setMobileOpen
}) => {
  const navItems: { id: NavTab; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'dashboard', label: 'Dashboard Hub', icon: LayoutDashboard },
    { id: 'customers', label: 'Customers Ledger', icon: Users },
    { id: 'measurements', label: 'Measurements Entry', icon: Ruler },
    { id: 'orders', label: 'Showroom Orders', icon: ShoppingBag },
    { id: 'productionslips', label: 'Production Slips', icon: ScrollText },
    { id: 'fittings', label: 'Fitting & Trials', icon: Calendar },
    { id: 'backup', label: 'Backup & Recovery', icon: Database },
    { id: 'trash', label: 'Trash', icon: Trash2 }
  ];

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#071426] bg-wood-grain text-[#F7F3EA] border-r border-[#1B2C45] w-64 flex-shrink-0 select-none">
      {/* Sidebar Header with Official Regency Logo */}
      <div className="py-4 px-3 border-b border-[#1B2C45] relative flex flex-col items-center justify-center">
        <RegencyLogo size="md" className="w-full" />
        {setMobileOpen && (
          <button
            onClick={() => setMobileOpen(false)}
            className="md:hidden text-[#94A3B8] hover:text-[#C9A24A] p-1.5 absolute top-3 right-3 rounded-lg hover:bg-[#132338]"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation List */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1 scrollbar-thin scrollbar-thumb-[#1B2C45]">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id);
                if (setMobileOpen) setMobileOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-bold tracking-wide transition-all duration-150 relative group ${
                isActive
                  ? 'bg-[#132338] text-[#C9A24A] shadow-inner font-extrabold'
                  : 'text-[#E0D8CB] hover:bg-[#0E1E34] hover:text-[#FFFFFF]'
              }`}
            >
              {/* Active Indicator Bar */}
              {isActive && (
                <span className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-[#C9A24A] rounded-r-full shadow-[0_0_8px_#C9A24A]" />
              )}
              <Icon
                className={`w-4 h-4 transition-colors ${
                  isActive ? 'text-[#C9A24A]' : 'text-[#A39682] group-hover:text-[#C9A24A]'
                }`}
              />
              <span className="truncate font-bold tracking-wide">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Bottom Section */}
      <div className="p-4 border-t border-[#1B2C45] space-y-3 bg-[#05101E]">
        {/* Isolated Client Portal Button */}
        <button
          onClick={onOpenClientPortal}
          className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-[#3A2F1B] bg-[#111C2B] text-[#D4AF5A] hover:border-[#C9A24A] hover:bg-[#162539] transition-all text-xs font-semibold tracking-wide group"
        >
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#C9A24A] animate-pulse" />
            <span>Client Portal</span>
          </div>
          <ExternalLink className="w-3.5 h-3.5 text-[#C9A24A] group-hover:translate-x-0.5 transition-transform" />
        </button>

        {/* Current User & Role Toggle */}
        <div className="flex items-center justify-between text-xs px-2 py-1.5 bg-[#0C1B2E] rounded-xl border border-[#1E3048]">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="w-6 h-6 rounded-full bg-[#1B2D46] flex items-center justify-center text-[#C9A24A] font-bold text-[10px] shrink-0">
              {userName.charAt(0)}
            </div>
            <div className="truncate">
              <div className="text-[11px] font-bold text-[#F7F3EA] truncate">{userName}</div>
              <div className="text-[9px] text-[#A39682]">Admin</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className="px-2 py-0.5 rounded text-[9px] font-bold bg-[#132338] text-[#C9A24A] border border-[#233754] select-none"
              title="Showroom access level"
            >
              ADMIN
            </span>
            {onSignOut && (
              <button
                onClick={onSignOut}
                className="p-1.5 rounded text-[#A39682] hover:text-[#C9A24A] hover:bg-[#132338] transition-colors cursor-pointer"
                title="Sign out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Footer Credit */}
        <div className="text-[10px] text-center text-[#6B7A90] font-mono pt-1">
          Built By S.S Ai Labs • V1.0.0
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:block h-screen sticky top-0 z-30 print-app-shell">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden print-app-shell">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={() => setMobileOpen && setMobileOpen(false)}
          />
          <div className="relative z-10 w-64 h-full">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};
