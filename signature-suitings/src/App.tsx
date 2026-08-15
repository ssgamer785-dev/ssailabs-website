/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  LayoutDashboard, 
  Users, 
  Ruler, 
  ShoppingBag, 
  Calendar, 
  Receipt, 
  TrendingUp, 
  Search, 
  Sparkles, 
  UserCheck, 
  ShieldAlert,
  QrCode, 
  Sliders,
  Scissors,
  HelpCircle,
  Menu,
  X,
  Database,
  LogOut,
  Lock,
  Eye,
  EyeOff,
  Camera,
  User,
  Plus
} from "lucide-react";

// Views
import DashboardView from "./components/DashboardView";
import CustomersView from "./components/CustomersView";
import MeasurementsView from "./components/MeasurementsView";
import OrdersView from "./components/OrdersView";
import TrialsView from "./components/TrialsView";
import BillingView from "./components/BillingView";
import FinanceView from "./components/FinanceView";
import ClientPortalView from "./components/ClientPortalView";
import BackupView from "./components/BackupView";
import WorkersView from "./components/WorkersView";
import ProfileView from "./components/ProfileView";
import AttendanceKiosk from "./components/AttendanceKiosk";
import LoginScreen from "./components/LoginScreen";
import { supabase, isSupabaseConfigured, uploadImage } from "./supabase";
import SignatureLogo from "./components/SignatureLogo";

import { Customer, Measurement, Order, Invoice } from "./types";
import { db, safeSetItem, safeRemoveItem } from "./db";

type ActivePage = "dashboard" | "customers" | "measurements" | "orders" | "trials" | "billing" | "finance" | "client-portal" | "backup" | "workers" | "profile" | "attendance-kiosk";

// Counter passphrases for switching between Admin and Staff mode on a shared showroom
// terminal. Overridable at build time so the shop can change them without editing source.
// These gate an in-app view switch only — real access control is Supabase Auth + RLS.
const env: any = (import.meta as any).env || {};
const ADMIN_PASSPHRASE = env.VITE_ADMIN_PASSPHRASE || "Sunil@1956";
const STAFF_PASSPHRASE = env.VITE_STAFF_PASSPHRASE || "Signature@123";

export default function App() {
  const [activePage, setActivePage] = useState<ActivePage>("dashboard");
  
  // Authentication states
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [userRole, setUserRole] = useState<"Admin" | "Staff">("Staff");
  const [userPhoto, setUserPhoto] = useState<string>(localStorage.getItem("showroom_user_photo") || "");
  const [currentUserEmail, setCurrentUserEmail] = useState<string>(localStorage.getItem("showroom_user_email") || "");

  const handleUserPhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = reader.result as string;
        setUserPhoto(base64String);
        safeSetItem("showroom_user_photo", base64String);
      };
      reader.readAsDataURL(file);

      if (isSupabaseConfigured) {
        try {
          const uploadedUrl = await uploadImage(file);
          if (uploadedUrl) {
            setUserPhoto(uploadedUrl);
            safeSetItem("showroom_user_photo", uploadedUrl);
            if (currentUserEmail) {
              const match = db.getAllUsersIncludingInactive().find(u => u.email === currentUserEmail);
              if (match) {
                db.updateUser(match.id, { photoUrl: uploadedUrl });
              }
            }
          }
        } catch (err) {
          console.error("Error uploading profile photo to Supabase storage:", err);
        }
      } else {
        const readerFallback = new FileReader();
        readerFallback.onloadend = () => {
          const base64String = readerFallback.result as string;
          setUserPhoto(base64String);
          safeSetItem("showroom_user_photo", base64String);
          if (currentUserEmail) {
            const match = db.getAllUsersIncludingInactive().find(u => u.email === currentUserEmail);
            if (match) {
              db.updateUser(match.id, { photoUrl: base64String });
            }
          }
        };
        readerFallback.readAsDataURL(file);
      }
    }
  };

  const handleUserPhotoRemove = () => {
    setUserPhoto("");
    safeRemoveItem("showroom_user_photo");
    if (currentUserEmail) {
      const match = db.getAllUsersIncludingInactive().find(u => u.email === currentUserEmail);
      if (match) {
        db.updateUser(match.id, { photoUrl: "" });
      }
    }
  };

  // Load and listen to Supabase Authentication Session
  useEffect(() => {
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setIsAuthenticated(true);
        let role: "Admin" | "Staff" = "Staff";
        const email = session.user.email;
        if (email) {
          setCurrentUserEmail(email);
          safeSetItem("showroom_user_email", email);
          const match = db.getUsers().find(u => u.email === email);
          if (match) {
            role = match.role;
            if (match.photoUrl) {
              setUserPhoto(match.photoUrl);
              safeSetItem("showroom_user_photo", match.photoUrl);
            } else {
              setUserPhoto("");
              safeRemoveItem("showroom_user_photo");
            }
          } else if (session.user.user_metadata?.role) {
            role = session.user.user_metadata.role;
          }
        }
        setUserRole(role);
      } else {
        // Fallback to localStorage for offline or bypass sessions
        const isLocalAuth = localStorage.getItem("showroom_authenticated") === "true";
        if (isLocalAuth) {
          const localRole = (localStorage.getItem("showroom_role") as "Admin" | "Staff") || "Staff";
          setIsAuthenticated(true);
          setUserRole(localRole);
          const localEmail = localStorage.getItem("showroom_user_email") || "";
          setCurrentUserEmail(localEmail);
          if (localEmail) {
            const match = db.getUsers().find(u => u.email === localEmail);
            if (match && match.photoUrl) {
              setUserPhoto(match.photoUrl);
            } else {
              setUserPhoto("");
            }
          }
        }
      }
    };
    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session) {
        setIsAuthenticated(true);
        let role: "Admin" | "Staff" = "Staff";
        const email = session.user.email;
        if (email) {
          setCurrentUserEmail(email);
          safeSetItem("showroom_user_email", email);
          const match = db.getUsers().find(u => u.email === email);
          if (match) {
            role = match.role;
            if (match.photoUrl) {
              setUserPhoto(match.photoUrl);
              safeSetItem("showroom_user_photo", match.photoUrl);
            } else {
              setUserPhoto("");
              safeRemoveItem("showroom_user_photo");
            }
          } else if (session.user.user_metadata?.role) {
            role = session.user.user_metadata.role;
          }
        }
        setUserRole(role);
      } else {
        setIsAuthenticated(false);
        setUserRole("Staff");
        setCurrentUserEmail("");
        safeRemoveItem("showroom_user_email");
        setUserPhoto("");
        safeRemoveItem("showroom_user_photo");
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Role Switch Verification State
  const [roleSwitchTarget, setRoleSwitchTarget] = useState<"Admin" | "Staff" | null>(null);
  const [roleSwitchPassword, setRoleSwitchPassword] = useState("");
  const [roleSwitchError, setRoleSwitchError] = useState("");
  const [showSwitchPassword, setShowSwitchPassword] = useState(false);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("Supabase signout failed:", err);
    }
    safeRemoveItem("showroom_authenticated");
    safeRemoveItem("showroom_role");
    setIsAuthenticated(false);
    setRouteCustomerId(undefined);
    setRouteOrderId(undefined);
    setActivePage("dashboard");
  };

  const handleOpenNewOrder = () => {
    setActivePage("orders");
    setIsMobileMenuOpen(false);
    sessionStorage.setItem("sig_suit_open_new_order", "true");
    window.dispatchEvent(new CustomEvent("sig_suit_trigger_new_order"));
  };

  const handleRoleChangeAttempt = (targetRole: "Admin" | "Staff") => {
    if (targetRole === userRole) return;
    setRoleSwitchTarget(targetRole);
    setRoleSwitchPassword("");
    setRoleSwitchError("");
    setShowSwitchPassword(false);
  };

  /**
   * Persists a verified role switch.
   * The previous version called db.updateUser(user.email, ...) — updateUser matches on the
   * record id, never the email, so no user row was ever found and the role change was lost on
   * reload. Resolve the user by email first, then update by their real id.
   */
  const persistRoleChange = async (role: "Admin" | "Staff") => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const email = user?.email || currentUserEmail;
      if (email) {
        const match = db.getAllUsersIncludingInactive().find(u => u.email === email);
        if (match) {
          db.updateUser(match.id, { role });
        }
      }
      if (user) {
        await supabase.auth.updateUser({ data: { role } });
      }
    } catch (err) {
      console.error("Could not sync role change to Supabase metadata:", err);
    }
    safeSetItem("showroom_role", role);
  };

  const handleVerifyRoleSwitch = async (e: React.FormEvent) => {
    e.preventDefault();
    const enteredPassword = roleSwitchPassword.trim();

    if (roleSwitchTarget === "Admin" && enteredPassword === ADMIN_PASSPHRASE) {
      setUserRole("Admin");
      setRoleSwitchTarget(null);
      await persistRoleChange("Admin");
    } else if (roleSwitchTarget === "Staff" && enteredPassword === STAFF_PASSPHRASE) {
      setUserRole("Staff");
      setRoleSwitchTarget(null);
      await persistRoleChange("Staff");
    } else {
      setRoleSwitchError("Incorrect password for the " + roleSwitchTarget + " role.");
    }
  };
  
  // States for Smart Search & Customer 360 Overlay
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Customer[]>([]);
  const [selectedOverlayCustomer, setSelectedOverlayCustomer] = useState<Customer | null>(null);
  const [overlayActiveTab, setOverlayActiveTab] = useState<"overview" | "measurements" | "orders" | "trials" | "billing">("overview");

  // Dynamic routing states from sub-views
  const [routeCustomerId, setRouteCustomerId] = useState<string | undefined>(undefined);
  const [routeOrderId, setRouteOrderId] = useState<string | undefined>(undefined);

  // Mobile sidebar state
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showSyncDiagnostics, setShowSyncDiagnostics] = useState(false);

  // Synchronize UI whenever Supabase Database synchronizes in the background
  const [dbVersion, setDbVersion] = useState(0);
  const [syncHealth, setSyncHealth] = useState(() => db.getSyncHealth());
  useEffect(() => {
    const unsubscribe = db.onSync(() => {
      setDbVersion(v => v + 1);
      setSyncHealth(db.getSyncHealth());
    });
    return unsubscribe;
  }, []);

  // Update user photo in real-time when db syncs down or email changes
  useEffect(() => {
    if (currentUserEmail) {
      const match = db.getAllUsersIncludingInactive().find(u => u.email === currentUserEmail);
      if (match && match.photoUrl) {
        setUserPhoto(match.photoUrl);
      } else {
        setUserPhoto("");
      }
    }
  }, [dbVersion, currentUserEmail]);

  // Refresh cloud data on login and when the app regains focus.
  //
  // This used to re-run a full 14-table sync on every navigation and every route-param
  // change, so a few clicks around the sidebar fired several complete refetches at once —
  // slow, and a source of overlapping merges. Realtime keeps the data current while the app
  // is open, so a sync on login plus a throttled one on tab focus is enough.
  useEffect(() => {
    if (!isAuthenticated) return;

    let lastSync = 0;
    const MIN_SYNC_INTERVAL_MS = 60000;

    const syncIfStale = () => {
      const now = Date.now();
      if (now - lastSync < MIN_SYNC_INTERVAL_MS) return;
      lastSync = now;
      db.initializeSupabaseSync();
    };

    syncIfStale();

    const onFocus = () => {
      if (document.visibilityState === "visible") syncIfStale();
    };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [isAuthenticated]);

  // Handle smart search typing
  useEffect(() => {
    if (searchQuery.trim().length > 0) {
      const results = db.searchCustomers(searchQuery);
      setSearchResults(results);
    } else {
      setSearchResults([]);
    }
  }, [searchQuery]);

  // Handle URL client-side routing for /portal/{customerIdOrQrCodeId}
  useEffect(() => {
    const handleUrlRoute = () => {
      const path = window.location.pathname;
      const searchParams = new URLSearchParams(window.location.search);
      const portalIdParam = searchParams.get("portalId") || searchParams.get("portal");

      let customerIdOrQrId = "";
      if (path.startsWith("/portal/")) {
        customerIdOrQrId = path.substring("/portal/".length);
      } else if (portalIdParam) {
        customerIdOrQrId = portalIdParam;
      }

      if (customerIdOrQrId) {
        // Find by customerId first
        let customer = db.getCustomerById(customerIdOrQrId);
        if (!customer) {
          // Find by qrCodeId second
          customer = db.getCustomerByQrId(customerIdOrQrId);
        }

        if (customer) {
          setRouteCustomerId(customer.id);
          setActivePage("client-portal");
        }
      }
    };

    handleUrlRoute();

    window.addEventListener("popstate", handleUrlRoute);
    return () => window.removeEventListener("popstate", handleUrlRoute);
  }, []);

  // Handle direct navigation requests
  const handleNavigateToInvoice = (customerId: string, orderId: string) => {
    setRouteCustomerId(customerId);
    setRouteOrderId(orderId);
    setActivePage("billing");
  };

  const handleNavigateToCustomerProfile = (customerId: string) => {
    setRouteCustomerId(customerId);
    setActivePage("customers");
  };

  // Close smart search overlay
  const handleSelectSearchResult = (cust: Customer) => {
    setSelectedOverlayCustomer(cust);
    setSearchQuery("");
    setSearchResults([]);
  };

  // Quick Action Buttons
  const triggerQuickAction = (page: ActivePage, customerId?: string) => {
    if (customerId) {
      setRouteCustomerId(customerId);
    } else {
      setRouteCustomerId(undefined);
    }
    setRouteOrderId(undefined);
    setActivePage(page);
    setIsMobileMenuOpen(false);
  };

  if (activePage === "attendance-kiosk") {
    return (
      <AttendanceKiosk 
        onBackToLogin={() => {
          if (isAuthenticated) {
            setActivePage("workers");
          } else {
            setActivePage("dashboard");
          }
        }}
      />
    );
  }

  if (!isAuthenticated && activePage !== "client-portal") {
    return (
      <LoginScreen 
        onLoginSuccess={(role) => {
          setIsAuthenticated(true);
          setUserRole(role);
          safeSetItem("showroom_authenticated", "true");
          safeSetItem("showroom_role", role);
        }}
        onBypassToPortal={() => {
          setActivePage("client-portal");
        }}
        onGoToAttendanceKiosk={() => {
          setActivePage("attendance-kiosk");
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-cream/30 text-charcoal font-sans flex">
      
      {/* =====================================================================
          SIDEBAR NAVIGATION (Section 1.1 Brand Identity / Section 5.3 Shell)
      ===================================================================== */}
      <aside className={`fixed inset-y-0 left-0 bg-navy text-white w-64 border-r border-gold/15 flex flex-col z-30 transition-transform duration-300 print:hidden ${
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      }`}>
        {/* Brand Header */}
        <div className="p-4 border-b border-gold/15 flex items-center justify-between bg-navy-hover/40">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl overflow-hidden border border-gold/40 flex items-center justify-center bg-black shadow-md flex-shrink-0 p-1">
              <SignatureLogo size={38} iconOnly={true} className="w-full h-full object-contain" />
            </div>
            <div>
              <h2 className="font-serif font-black tracking-widest text-xs uppercase text-[#d4af37]">SIGNATURE</h2>
              <p className="text-[9px] uppercase tracking-widest text-white/60 font-bold font-sans">SUITINGS &bull; SHOWROOM</p>
            </div>
          </div>
          <button 
            onClick={() => setIsMobileMenuOpen(false)}
            className="lg:hidden text-white/70 hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Items (Section 5.3) */}
        <nav className="p-4 flex-1 space-y-1.5 overflow-y-auto scrollbar-none text-xs">
          {[
            { id: "dashboard", label: "Dashboard Hub", icon: LayoutDashboard },
            { id: "customers", label: "Customers Ledger", icon: Users },
            { id: "measurements", label: "Measurements Entry", icon: Ruler },
            { id: "orders", label: "Showroom Orders", icon: ShoppingBag },
            { id: "trials", label: "Fitting & Trials", icon: Calendar },
            { id: "workers", label: "Workers & Payroll", icon: Scissors },
            { id: "billing", label: "Billings & Ledger", icon: Receipt },
            { id: "finance", label: "Finances & Charts", icon: TrendingUp },
            { id: "backup", label: "Backup & Recovery", icon: Database },
            { id: "profile", label: "My Profile", icon: User },
          ].filter((item) => {
            if (item.id === "workers" && userRole !== "Admin") {
              return false;
            }
            return true;
          }).map((item) => {
            const Icon = item.icon;
            const active = activePage === item.id;
            const isFinanceStaff = item.id === "finance" && userRole === "Staff";

            return (
              <button
                key={item.id}
                onClick={() => {
                  setActivePage(item.id as any);
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full py-2.5 px-4 rounded-xl font-bold flex items-center gap-3 transition-all cursor-pointer ${
                  active 
                    ? "bg-gold text-navy shadow-xs border border-gold" 
                    : isFinanceStaff
                    ? "text-white/40 hover:bg-white/5 cursor-not-allowed"
                    : "text-white/75 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon className={`w-4 h-4 ${active ? "text-navy" : "text-gold"}`} />
                <span>{item.label}</span>
                {isFinanceStaff && (
                  <span className="ml-auto text-[8px] bg-red-900/60 text-red-200 px-1 rounded">Admin Only</span>
                )}
              </button>
            );
          })}

          <div className="border-t border-gold/10 my-4 pt-4">
            {/* Customer portal isolated link */}
            <button
              onClick={() => {
                setActivePage("client-portal");
                setIsMobileMenuOpen(false);
              }}
              className={`w-full py-2.5 px-4 rounded-xl font-bold flex items-center gap-3 transition-all cursor-pointer ${
                activePage === "client-portal"
                  ? "bg-gold text-navy shadow-xs border border-gold"
                  : "text-white/75 hover:bg-white/5 hover:text-white border border-dashed border-white/25"
              }`}
            >
              <QrCode className="w-4 h-4 text-gold" />
              <span>Isolated Client Portal</span>
            </button>
          </div>
        </nav>

        {/* Footer Settings & Role Switcher (Section 10.1 Role enforcing) */}
        <div className="p-4 bg-navy-light border-t border-gold/10 space-y-3">
          <div className="flex items-center justify-between text-[10px] text-white/70">
            <div className="flex items-center gap-1.5 font-bold">
              <UserCheck className="w-3.5 h-3.5 text-gold" />
              <span>Current Role</span>
            </div>
            <select
              value={userRole}
              onChange={(e) => handleRoleChangeAttempt(e.target.value as any)}
              className="bg-navy border border-gold/20 rounded-md py-1 px-1.5 text-white text-[10px] focus:outline-hidden font-bold cursor-pointer"
            >
              <option value="Admin">Admin</option>
              <option value="Staff">Staff / Tailor</option>
            </select>
          </div>
          
          <button
            onClick={handleLogout}
            className="w-full bg-red-950/20 hover:bg-red-900/30 text-red-300 border border-red-900/30 py-2 rounded-xl text-[10px] uppercase tracking-wider font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5 text-red-400" />
            <span>Secure Log Out</span>
          </button>
          
          <div className="text-[9px] text-white/40 font-semibold leading-normal font-mono text-center">
            Built By S.S Ai Labs &bull; V1.0.0
          </div>
        </div>
      </aside>

      {/* =====================================================================
          MAIN WORKSPACE LAYOUT (TopNavbar + View switcher)
      ===================================================================== */}
      <div className="flex-1 lg:pl-64 flex flex-col min-h-screen print:pl-0">
        
        {/* Top Navbar Header (Section 5.4 Global Search) */}
        <header className="sticky top-0 bg-white border-b border-light px-6 py-4 flex items-center justify-between z-20 shadow-xs print:hidden">
          
          {/* Left search */}
          <div className="flex items-center gap-4 flex-1">
            <button 
              onClick={() => setIsMobileMenuOpen(true)}
              className="lg:hidden text-navy hover:bg-cream p-1.5 rounded-lg cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>

            {activePage !== "client-portal" && (
              <div className="relative max-w-sm w-full font-sans text-xs">
                <Search className="w-4 h-4 text-gold absolute left-3 top-1/2 -translate-y-1/2" />
                <input 
                  type="text" 
                  placeholder="Smart Search: Type customer name or digits..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-cream/15 pl-9 pr-4 py-2 border border-light rounded-xl focus:outline-hidden focus:border-gold font-sans"
                />

                {/* Instant Search Dropdown Results */}
                {searchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-light rounded-2xl shadow-xl z-50 overflow-hidden text-charcoal">
                    <div className="p-2 border-b border-light text-[9px] uppercase font-bold tracking-widest bg-cream/30 text-navy">
                      Matching Showroom Profiles
                    </div>
                    <div className="divide-y divide-light max-h-48 overflow-y-auto">
                      {searchResults.map((cust) => (
                        <div 
                          key={cust.id}
                          onClick={() => handleSelectSearchResult(cust)}
                          className="p-3 hover:bg-cream/45 cursor-pointer transition-colors flex justify-between items-center gap-4"
                        >
                          <div>
                            <p className="font-serif font-bold text-navy text-xs">{cust.fullName}</p>
                            <p className="text-[10px] text-muted-grey font-mono">{cust.mobileNumber}</p>
                          </div>
                          <span className="text-[9px] text-gold font-bold uppercase tracking-wider bg-gold/5 border border-gold/15 px-2 py-0.5 rounded-full">
                            View 360&deg;
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Brand info & Actions */}
          <div className="flex items-center gap-3 sm:gap-4 text-xs font-sans">
            {/* Honest cloud-save indicator: only appears when writes have NOT reached
                Supabase yet, so "saved" in this app always means saved. */}
            {syncHealth.cloudEnabled && syncHealth.pendingWrites > 0 && (
              <button
                onClick={() => db.flushOutbox()}
                title={syncHealth.lastError || "Waiting to reach the cloud database"}
                className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-800 px-2.5 py-1 rounded-full font-bold text-[10px] hover:bg-amber-100 transition-colors cursor-pointer"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                <span>
                  {syncHealth.pendingWrites} change{syncHealth.pendingWrites === 1 ? "" : "s"} not yet saved to cloud &bull; Retry
                </span>
              </button>
            )}
            <div className="text-right hidden sm:block">
              {userRole === "Admin" && (
                <p className="font-bold text-navy">Hardik Nagpal</p>
              )}
              <p className="text-[10px] text-muted-grey font-semibold">
                {userRole === "Admin" ? "Showroom Owner / Admin" : "Showroom Staff / Tailor"}
              </p>
            </div>
            <label className="relative w-9 h-9 rounded-full overflow-hidden bg-cream border border-light flex items-center justify-center font-bold text-navy cursor-pointer group hover:border-gold/50 transition-all shadow-xs shrink-0" title="Click to change your profile photo">
              <input
                type="file"
                accept="image/*"
                onChange={handleUserPhotoChange}
                className="hidden"
              />
              {userPhoto ? (
                <img src={userPhoto} alt="User Profile" className="w-full h-full object-cover" />
              ) : (
                <span>{userRole === "Admin" ? "HN" : "SS"}</span>
              )}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <Camera className="w-3.5 h-3.5 text-white" />
              </div>
            </label>
          </div>

        </header>

        {/* VIEW WORKSPACE CONTROLLER */}
        <main className="p-6 flex-1 max-w-7xl w-full mx-auto space-y-6">
          
          {isSupabaseConfigured && db.syncErrors.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs font-sans text-amber-900 space-y-2 relative shadow-sm animate-fade-in">
              <div className="flex items-start gap-3">
                <div className="bg-amber-100 text-amber-700 p-2 rounded-xl mt-0.5">
                  <Database className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-amber-950 text-sm">Supabase Connected, but Tables Missing (Code PGRST125)</h4>
                  <p className="mt-1 leading-relaxed text-amber-800">
                    The database client is successfully connected to your Supabase project, but the required tables (such as <strong>{db.syncErrors.join(", ")}</strong>) have not been created in your public schema yet.
                  </p>
                  <p className="mt-1 font-semibold text-amber-950">
                    💡 The showroom remains 100% operational! Your modifications are safely stored in your local browser cache (LocalStorage) and will auto-sync to the cloud as soon as you create the tables.
                  </p>
                </div>
                <button 
                  onClick={() => setShowSyncDiagnostics(!showSyncDiagnostics)}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-medium px-3 py-1.5 rounded-lg transition-all ml-4 shrink-0"
                >
                  {showSyncDiagnostics ? "Hide Setup Steps" : "Show Setup Guide"}
                </button>
              </div>

              {showSyncDiagnostics && (
                <div className="mt-4 bg-white border border-amber-100 rounded-xl p-4 space-y-3 text-gray-700">
                  <h5 className="font-semibold text-gray-900 text-sm">How to complete your Supabase Cloud Database setup:</h5>
                  <ol className="list-decimal pl-5 space-y-1.5 leading-relaxed">
                    <li>Open your <strong>Supabase Project Dashboard</strong>.</li>
                    <li>Click on the <strong>SQL Editor</strong> tab in the left sidebar.</li>
                    <li>Click <strong>New Query</strong>.</li>
                    <li>Copy the contents of the <code>supabase_schema.sql</code> file found in this workspace root.</li>
                    <li>Paste the SQL script into the query window and click <strong>Run</strong> (or press Command/Ctrl + Enter).</li>
                    <li>Once the tables are created, refresh this page! The application will automatically migrate your local cache to the cloud.</li>
                  </ol>
                </div>
              )}
            </div>
          )}

          {/* ROLE BASED EXCLUSIVE PAGE BLOCK (Section 10.1 Access controls) */}
          {(activePage === "finance" || activePage === "workers") && userRole === "Staff" ? (
            <div className="bg-white rounded-3xl border border-light p-12 text-center max-w-md mx-auto space-y-4 shadow-sm animate-scale-up font-sans text-xs">
              <div className="inline-flex bg-rose-50 text-red-600 p-4 rounded-full border border-rose-100">
                <ShieldAlert className="w-8 h-8" />
              </div>
              <h2 className="text-lg font-serif font-bold text-navy">Administrative Privilege Required</h2>
              <p className="text-muted-grey leading-relaxed">
                This section is restricted to Admin accounts only. Current staff authorization cannot view or modify these files.
              </p>
              <button 
                onClick={() => setActivePage("dashboard")}
                className="bg-navy hover:bg-navy-hover text-white font-semibold py-2 px-6 rounded-xl transition-all cursor-pointer"
              >
                Return to Dashboard
              </button>
            </div>
          ) : (
            <>
              {/* PAGE VIEW SWITCHER */}
              {activePage === "dashboard" && (
                <DashboardView 
                  onNavigate={(page, params) => {
                    if (params?.customerId) {
                      setRouteCustomerId(params.customerId);
                    } else {
                      setRouteCustomerId(""); // reset if none
                    }
                    if (params?.orderId) {
                      setRouteOrderId(params.orderId);
                    } else {
                      setRouteOrderId(""); // reset if none
                    }
                    if (page === "Customers") setActivePage("customers");
                    if (page === "Orders") setActivePage("orders");
                    if (page === "Invoices") setActivePage("billing");
                    if (page === "Scheduling") setActivePage("trials");
                  }}
                  onOpenQuickAction={(action) => {
                    if (action === "new_customer") { setActivePage("customers"); }
                    if (action === "new_order") { setActivePage("orders"); }
                    if (action === "new_invoice") { setActivePage("billing"); }
                    if (action === "new_appointment") { setActivePage("trials"); }
                  }}
                  currentUserRole={userRole}
                />
              )}

              {activePage === "customers" && (
                <CustomersView 
                  initialSelectedCustomerId={routeCustomerId} 
                  onNavigateToMeasurement={(customerId) => {
                    setRouteCustomerId(customerId);
                    setActivePage("measurements");
                  }}
                  onNavigateToOrder={(customerId) => {
                    setRouteCustomerId(customerId);
                    setActivePage("orders");
                  }}
                  onNavigateToInvoice={(customerId, orderId) => {
                    setRouteCustomerId(customerId);
                    setRouteOrderId(orderId);
                    setActivePage("billing");
                  }}
                />
              )}

              {activePage === "measurements" && (
                <MeasurementsView 
                  initialCustomerId={routeCustomerId} 
                  onSaveSuccess={(cid) => {
                    setRouteCustomerId(cid);
                    setActivePage("customers");
                  }}
                />
              )}

              {activePage === "orders" && (
                <OrdersView 
                  initialCustomerId={routeCustomerId}
                  onNavigateToInvoice={handleNavigateToInvoice}
                  onNavigateToCustomerProfile={handleNavigateToCustomerProfile}
                />
              )}

              {activePage === "trials" && (
                <TrialsView />
              )}

              {activePage === "billing" && (
                <BillingView 
                  initialCustomerId={routeCustomerId} 
                  initialOrderId={routeOrderId} 
                />
              )}

              {activePage === "finance" && (
                <FinanceView />
              )}

              {activePage === "backup" && (
                <BackupView />
              )}

              {activePage === "workers" && (
                <WorkersView />
              )}

              {activePage === "client-portal" && (
                <ClientPortalView 
                  initialCustomerId={routeCustomerId}
                  onClearInitialCustomer={() => setRouteCustomerId(undefined)}
                />
              )}

              {activePage === "profile" && (
                <ProfileView
                  userRole={userRole}
                  userPhoto={userPhoto}
                  currentUserEmail={currentUserEmail}
                  onPhotoChange={handleUserPhotoChange}
                  onRemovePhoto={handleUserPhotoRemove}
                />
              )}
            </>
          )}

        </main>

      </div>

      {/* =====================================================================
          GLOBAL SMART SEARCH "CUSTOMER 360 PANEL" OVERLAY (Section 5.4.3)
      ===================================================================== */}
      {selectedOverlayCustomer && (
        <div className="fixed inset-0 bg-black/65 flex justify-end z-50 animate-fade-in font-sans text-xs">
          <div className="bg-white max-w-xl w-full h-full shadow-2xl flex flex-col border-l border-light animate-scale-up">
            
            {/* Overlay Header */}
            <div className="bg-navy text-white p-5 flex justify-between items-center border-b border-gold/15 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-gold flex items-center justify-center font-bold text-navy text-sm font-serif">
                  {selectedOverlayCustomer.fullName.charAt(0)}
                </div>
                <div>
                  <h3 className="font-serif font-bold text-sm tracking-wide">{selectedOverlayCustomer.fullName}</h3>
                  <p className="text-[10px] text-gold/80 font-mono font-bold">{selectedOverlayCustomer.mobileNumber}</p>
                </div>
              </div>
              
              <button 
                onClick={() => setSelectedOverlayCustomer(null)}
                className="text-white/80 hover:text-white p-1.5 hover:bg-white/10 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Sub-tab navigation within overlay */}
            <div className="bg-cream/40 border-b border-light px-4 flex gap-2 text-[10px] font-bold uppercase overflow-x-auto whitespace-nowrap flex-shrink-0">
              {[
                { id: "overview", label: "Overview" },
                { id: "measurements", label: "Sizing history" },
                { id: "orders", label: "Orders tracking" },
                { id: "billing", label: "Billing records" }
              ].map((sub) => (
                <button
                  key={sub.id}
                  onClick={() => setOverlayActiveTab(sub.id as any)}
                  className={`py-3 px-3 border-b-2 transition-all cursor-pointer ${
                    overlayActiveTab === sub.id 
                      ? "border-gold text-navy font-bold" 
                      : "border-transparent text-muted-grey hover:text-navy"
                  }`}
                >
                  {sub.label}
                </button>
              ))}
            </div>

            {/* Sub-tab Contents (Isolated data summaries) */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5 text-charcoal">
              
              {/* Overview Tab */}
              {overlayActiveTab === "overview" && (
                <div className="space-y-4">
                  <div className="bg-cream/35 p-4 rounded-xl border border-light space-y-2">
                    <h4 className="font-bold text-navy uppercase text-[10px]">Contact information</h4>
                    <p><b>Address:</b> {selectedOverlayCustomer.address || "Showroom Collection Only"}</p>
                    <p><b>Account status:</b> {db.isCustomerArchived(selectedOverlayCustomer) ? "Archived" : "Active Bespoke Client"}</p>
                    <p>
                      <b>Fabric Preferences:</b>{" "}
                      {selectedOverlayCustomer.preferredFabricBrands.length > 0
                        ? selectedOverlayCustomer.preferredFabricBrands.join(", ")
                        : "None recorded yet"}
                    </p>
                  </div>

                  {/* Preferences learned */}
                  <div className="bg-gold/5 border border-gold/15 p-4 rounded-xl space-y-2">
                    <h4 className="font-bold text-navy uppercase text-[10px] flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 text-gold" />
                      Memory preference learning model
                    </h4>
                    <div className="flex gap-1.5 flex-wrap">
                      {selectedOverlayCustomer.preferenceTags.map((tag, i) => (
                        <span key={i} className="px-2 py-0.5 bg-white text-navy font-bold rounded-md border border-gold/20">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Sizing History */}
              {overlayActiveTab === "measurements" && (
                <div className="space-y-4">
                  {db.getMeasurements(selectedOverlayCustomer.id).length === 0 ? (
                    <p className="text-muted-grey italic py-4">No size cards entered for this client.</p>
                  ) : (
                    db.getMeasurements(selectedOverlayCustomer.id).map((m) => (
                      <div key={m.id} className="border border-light rounded-xl overflow-hidden text-[10px] font-mono p-3 bg-cream/10 space-y-2">
                        <div className="flex justify-between items-center border-b border-light pb-1.5 font-sans">
                          <span className="font-bold text-navy">Slip: {m.slipNumber}</span>
                          <span className="text-muted-grey">{new Date(m.versionDate).toLocaleDateString()}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-charcoal">
                          <div>
                            <span className="font-sans font-bold text-navy uppercase text-[9px] block mb-1">Coat Dimensions</span>
                            <p>Length: <b>{m.coatIndoWestern.length || "-"}</b></p>
                            <p>Chest: <b>{m.coatIndoWestern.chest || "-"}</b></p>
                            <p>Waist: <b>{m.coatIndoWestern.waist || "-"}</b></p>
                          </div>
                          <div>
                            <span className="font-sans font-bold text-navy uppercase text-[9px] block mb-1">Trouser Dimensions</span>
                            <p>Waist: <b>{m.pent.waist || "-"}</b></p>
                            <p>Hips: <b>{m.pent.hips || "-"}</b></p>
                            <p>Bottom: <b>{m.pent.bottom || "-"}</b></p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Orders tracking */}
              {overlayActiveTab === "orders" && (
                <div className="space-y-3">
                  {db.getOrdersForCustomer(selectedOverlayCustomer.id).length === 0 ? (
                    <p className="text-muted-grey italic py-4">No custom garments logged.</p>
                  ) : (
                    db.getOrdersForCustomer(selectedOverlayCustomer.id).map((ord) => (
                      <div key={ord.id} className="bg-cream/15 p-3.5 rounded-xl border border-light flex justify-between items-center gap-4">
                        <div>
                          <p className="font-serif font-bold text-navy">{ord.orderNumber}</p>
                          <p className="text-muted-grey font-mono text-[9px] mt-0.5">{ord.garmentTypes.join(", ")}</p>
                        </div>
                        <span className="px-2 py-0.5 bg-gold/10 text-navy font-bold uppercase rounded-md text-[9px]">
                          {ord.status}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Billing Ledger */}
              {overlayActiveTab === "billing" && (
                <div className="space-y-3">
                  {db.getInvoicesForCustomer(selectedOverlayCustomer.id).length === 0 ? (
                    <p className="text-muted-grey italic py-4">No bill invoices issued.</p>
                  ) : (
                    db.getInvoicesForCustomer(selectedOverlayCustomer.id).map((inv) => (
                      <div key={inv.id} className="bg-cream/15 p-3.5 rounded-xl border border-light flex justify-between items-center gap-4">
                        <div>
                          <p className="font-bold text-navy">{inv.invoiceNumber}</p>
                          <p className="text-red-600 font-mono font-bold text-[10px] mt-0.5">Bal: ₹{inv.balanceDue.toLocaleString()}</p>
                        </div>
                        <span className="font-mono text-charcoal font-bold">
                          ₹{inv.grandTotal.toLocaleString()}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}

            </div>

            {/* Quick Link buttons inside overlay */}
            <div className="p-4 border-t border-light bg-cream/30 gap-2 flex flex-col flex-shrink-0">
              <button 
                onClick={() => {
                  setRouteCustomerId(selectedOverlayCustomer.id);
                  setActivePage("measurements");
                  setSelectedOverlayCustomer(null);
                }}
                className="w-full bg-navy hover:bg-navy-hover text-white font-bold py-2.5 rounded-xl text-center cursor-pointer"
              >
                Log New Measurement version
              </button>
              <button 
                onClick={() => {
                  setRouteCustomerId(selectedOverlayCustomer.id);
                  setActivePage("orders");
                  setSelectedOverlayCustomer(null);
                }}
                className="w-full bg-gold hover:bg-gold/90 text-navy font-bold py-2.5 rounded-xl text-center cursor-pointer"
              >
                Book custom bespoke Order
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ROLE SWITCH VERIFICATION MODAL */}
      {roleSwitchTarget && (
        <div className="fixed inset-0 bg-[#0a192f]/70 backdrop-blur-xs flex items-center justify-center p-4 z-[200] animate-fade-in font-sans text-xs">
          <div className="bg-white max-w-md w-full rounded-3xl border border-light shadow-2xl overflow-hidden animate-scale-up">
            <div className="h-2 bg-gradient-to-r from-gold via-yellow-300 to-gold" />
            
            <form onSubmit={handleVerifyRoleSwitch} className="p-6 sm:p-8 space-y-4 text-charcoal">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-cream border border-light flex-shrink-0">
                  <Lock className="w-5 h-5 text-gold" />
                </div>
                <div className="text-left">
                  <h3 className="text-sm font-serif font-bold text-navy">Role Switch Verification</h3>
                  <p className="text-[9px] uppercase tracking-wider font-bold text-muted-grey">
                    Elevated Gatekeeper Clearance
                  </p>
                </div>
              </div>

              <div className="w-full h-[1px] bg-light" />

              <p className="text-muted-grey text-[11px] leading-relaxed text-left">
                You are switching to the <b className="text-navy uppercase">{roleSwitchTarget}</b> role. Please input the unique passphrase designated for this credential level to authorize this transition.
              </p>

              <div className="space-y-1.5 text-left">
                <label className="text-[10px] uppercase tracking-wider font-bold text-navy block">
                  Passphrase for {roleSwitchTarget}
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#d4af37] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input 
                    type={showSwitchPassword ? "text" : "password"} 
                    required
                    autoFocus
                    placeholder="••••••••"
                    value={roleSwitchPassword}
                    onChange={(e) => {
                      setRoleSwitchPassword(e.target.value);
                      setRoleSwitchError("");
                    }}
                    className="w-full bg-cream/20 text-[#0a192f] pl-11 pr-11 py-2.5 border border-light rounded-xl focus:outline-hidden focus:border-[#d4af37] focus:ring-1 focus:ring-[#d4af37] text-xs font-mono font-semibold"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSwitchPassword(!showSwitchPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-grey hover:text-[#0a192f] focus:outline-hidden cursor-pointer"
                  >
                    {showSwitchPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {roleSwitchError && (
                <div className="bg-red-50 border border-red-100 text-red-600 p-2.5 rounded-xl text-[10px] font-medium leading-relaxed text-left">
                  {roleSwitchError}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRoleSwitchTarget(null)}
                  className="flex-1 bg-cream hover:bg-light text-navy font-bold py-2.5 rounded-xl text-center border border-light transition-all cursor-pointer text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-[#0a192f] hover:bg-[#112240] text-white font-bold py-2.5 rounded-xl text-center transition-all cursor-pointer text-xs flex items-center justify-center gap-1.5"
                >
                  <span>Authorize</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
