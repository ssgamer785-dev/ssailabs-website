/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  User, 
  ShoppingBag, 
  Ruler, 
  QrCode, 
  LogOut, 
  Search, 
  ChevronRight, 
  ArrowLeft, 
  Phone, 
  Calendar, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  X, 
  Scissors, 
  FileText,
  Tag,
  CreditCard,
  Layers,
  ChevronDown
} from "lucide-react";
import { QRCodeSVG as QRCode } from "qrcode.react";
import { Customer, Order, Measurement, OrderStatus, PANT_MEASUREMENT_FIELDS, normalizePantMeasurement } from "../types";
import { db } from "../db";
import ConfirmModal from "./ConfirmModal";

interface ClientPortalViewProps {
  initialCustomerId?: string;
  onClearInitialCustomer?: () => void;
}

/**
 * Normalizes any raw phone input or stored phone number to the standard 10-digit number.
 * Handles formats like:
 * - "+91 98765 43210" -> "9876543210"
 * - "+91-98765-43210" -> "9876543210"
 * - "09876543210" -> "9876543210"
 * - "919876543210" -> "9876543210"
 * - "98765 43210" -> "9876543210"
 */
export function normalizeMobileNumber(raw: string | undefined | null): string {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) {
    return digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith("0")) {
    return digits.slice(1);
  }
  if (digits.length >= 10) {
    return digits.slice(-10);
  }
  return digits;
}

export default function ClientPortalView({ initialCustomerId, onClearInitialCustomer }: ClientPortalViewProps) {
  // --- SEARCH STATES ---
  const [searchMobile, setSearchMobile] = useState("");
  const [searchSubmitted, setSearchSubmitted] = useState(false);
  const [matchedProfiles, setMatchedProfiles] = useState<Customer[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  // --- ACTIVE PROFILE SELECTION & ISOLATION STATES ---
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [currentClient, setCurrentClient] = useState<Customer | null>(null);
  const [clientOrders, setClientOrders] = useState<Order[]>([]);
  const [clientMeasurements, setClientMeasurements] = useState<Measurement[]>([]);
  const [selectedMeasurementId, setSelectedMeasurementId] = useState<string | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);

  // --- MODAL / DETAIL STATES ---
  const [selectedOrderForDetail, setSelectedOrderForDetail] = useState<Order | null>(null);
  const [portalTab, setPortalTab] = useState<"active-orders" | "order-history" | "measurements" | "qr">("active-orders");

  // --- NOTIFICATION / CONFIRM MODAL ---
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    variant?: "danger" | "warning" | "info";
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  // Handle direct initialCustomerId prop (e.g. from QR code scan or URL route)
  useEffect(() => {
    if (initialCustomerId) {
      const customers = db.getCustomers();
      const matched = customers.find(c => c.id === initialCustomerId);
      if (matched) {
        setSearchMobile(matched.mobileNumber);
        setMatchedProfiles([matched]);
        setSearchSubmitted(true);
        loadCustomerProfile(matched);
      }
    }
  }, [initialCustomerId]);

  // Load customer data strictly by customer ID to guarantee session isolation
  const loadCustomerProfile = (customer: Customer) => {
    setIsLoadingProfile(true);
    // Clear old state completely before loading new profile
    setCurrentClient(null);
    setClientOrders([]);
    setClientMeasurements([]);
    setSelectedMeasurementId(null);
    setSelectedOrderForDetail(null);

    const custId = customer.id;
    // Query DB strictly by customer ID
    const orders = db.getOrdersForCustomer(custId);
    const measurements = db.getMeasurements(custId);

    setSelectedCustomerId(custId);
    setCurrentClient(customer);
    setClientOrders(orders);
    setClientMeasurements(measurements);
    if (measurements.length > 0) {
      setSelectedMeasurementId(measurements[0].id);
    }

    // Set default tab based on orders
    const activeOrders = orders.filter(o => o.status !== "Delivered");
    if (activeOrders.length > 0) {
      setPortalTab("active-orders");
    } else if (orders.length > 0) {
      setPortalTab("order-history");
    } else {
      setPortalTab("measurements");
    }

    setIsLoadingProfile(false);
  };

  // Perform mobile-only search
  const handleSearch = (e?: React.FormEvent, overrideMobile?: string) => {
    if (e) e.preventDefault();
    setSearchError(null);

    const rawMobile = overrideMobile !== undefined ? overrideMobile : searchMobile;
    const normalizedQuery = normalizeMobileNumber(rawMobile);

    if (!normalizedQuery || normalizedQuery.length < 10) {
      setSearchError("Please enter a valid 10-digit mobile number.");
      return;
    }

    // Clear previous selection data
    setSelectedCustomerId(null);
    setCurrentClient(null);
    setClientOrders([]);
    setClientMeasurements([]);
    setSelectedOrderForDetail(null);

    const allCustomers = db.getCustomers();
    // CRITICAL: Filter ALL customers matching the normalized mobile number
    const matches = allCustomers.filter(
      c => normalizeMobileNumber(c.mobileNumber) === normalizedQuery
    );

    setMatchedProfiles(matches);
    setSearchSubmitted(true);

    if (matches.length === 1) {
      // Exactly one profile: open directly
      loadCustomerProfile(matches[0]);
    } else if (matches.length === 0) {
      // No match
      setSearchError("No profile found. Please check the mobile number and try again.");
    }
  };

  // Back navigation to profile list without re-querying
  const handleBackToProfiles = () => {
    // Clear selected customer and derived data
    setSelectedCustomerId(null);
    setCurrentClient(null);
    setClientOrders([]);
    setClientMeasurements([]);
    setSelectedOrderForDetail(null);
    onClearInitialCustomer?.();
  };

  // Full reset to search screen
  const handleChangeMobile = () => {
    setSelectedCustomerId(null);
    setCurrentClient(null);
    setClientOrders([]);
    setClientMeasurements([]);
    setSelectedOrderForDetail(null);
    setMatchedProfiles([]);
    setSearchSubmitted(false);
    setSearchError(null);
    setSearchMobile("");
    onClearInitialCustomer?.();
  };

  // Separate orders into active vs past
  const activeOrders = clientOrders.filter(o => o.status !== "Delivered");
  const pastOrders = clientOrders.filter(o => o.status === "Delivered");

  // Selected measurement version
  const currentMeasurement = clientMeasurements.find(m => m.id === selectedMeasurementId) || clientMeasurements[0] || null;

  // Helper to format dates
  const formatDate = (isoString?: string) => {
    if (!isoString) return "-";
    try {
      return new Date(isoString).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric"
      });
    } catch {
      return isoString;
    }
  };

  // Helper for customer initials
  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map(n => n[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase();
  };

  // Helper for order status badge styling
  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case "Delivered":
        return "bg-emerald-500/10 text-emerald-700 border-emerald-500/30";
      case "Ready":
        return "bg-blue-500/10 text-blue-700 border-blue-500/30";
      case "Trial Scheduled":
        return "bg-amber-500/10 text-amber-700 border-amber-500/30";
      case "In Cutting":
      case "Stitching":
        return "bg-indigo-500/10 text-indigo-700 border-indigo-500/30";
      case "Pending":
      default:
        return "bg-slate-500/10 text-slate-700 border-slate-500/30";
    }
  };

  // =========================================================================
  // VIEW 1: SEARCH SCREEN (Landing Screen when no search submitted or no active customer)
  // =========================================================================
  if (!searchSubmitted || (matchedProfiles.length === 0 && !currentClient)) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center p-4 font-sans text-xs">
        <div className="bg-white rounded-3xl border border-light max-w-md w-full shadow-2xl overflow-hidden animate-scale-up">
          
          {/* Top Branding Panel */}
          <div className="bg-navy p-7 text-center text-white space-y-3 border-b border-gold/15">
            <div className="w-14 h-14 rounded-full border-2 border-gold flex items-center justify-center text-gold font-serif font-black text-xl mx-auto shadow-md">
              SS
            </div>
            <div>
              <h1 className="text-xl font-serif font-black tracking-widest uppercase">SIGNATURE SUITINGS</h1>
              <p className="text-[10px] uppercase tracking-widest text-gold/80 font-bold font-mono mt-0.5">Bespoke Client Portal</p>
            </div>
          </div>

          {/* Search Form Panel */}
          <div className="p-7 space-y-6">
            <div className="text-center space-y-1.5">
              <h2 className="text-base font-serif font-bold text-navy">Find Your Profile</h2>
              <p className="text-muted-grey text-[11px] leading-relaxed">
                Enter your registered mobile number to view your bespoke measurements, active tailoring orders, and delivery status.
              </p>
            </div>

            <form onSubmit={(e) => handleSearch(e)} className="space-y-4">
              <div className="space-y-1.5">
                <label className="font-semibold text-navy text-[11px] block">
                  Enter Mobile Number
                </label>
                <div className="relative flex items-center">
                  <div className="absolute left-3.5 flex items-center pointer-events-none text-navy font-bold font-mono text-xs border-r border-light pr-2.5">
                    +91
                  </div>
                  <input 
                    type="tel" 
                    required
                    autoFocus
                    placeholder="98765 43210"
                    value={searchMobile}
                    onChange={(e) => {
                      setSearchMobile(e.target.value);
                      if (searchError) setSearchError(null);
                    }}
                    className="w-full bg-cream/15 pl-16 pr-9 py-3 border border-light rounded-2xl focus:outline-hidden focus:border-gold focus:ring-1 focus:ring-gold text-sm font-mono tracking-wider text-navy placeholder:text-muted-grey/50"
                  />
                  {searchMobile && (
                    <button
                      type="button"
                      onClick={() => { setSearchMobile(""); setSearchError(null); }}
                      className="absolute right-3 text-muted-grey hover:text-navy cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {searchError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-[11px] flex items-start gap-2 animate-fade-in">
                  <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">No profile found</p>
                    <p className="text-[10px] text-rose-600 mt-0.5">Please check the mobile number and try again.</p>
                  </div>
                </div>
              )}

              <button 
                type="submit"
                className="w-full bg-navy hover:bg-navy-hover text-white font-bold py-3 px-4 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-md hover:shadow-lg cursor-pointer text-xs uppercase tracking-wider"
              >
                <Search className="w-4 h-4 text-gold" />
                <span>Search Profile</span>
              </button>
            </form>

          </div>

        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: MULTIPLE PROFILES SELECTION SCREEN (When > 1 customer matches mobile)
  // =========================================================================
  if (matchedProfiles.length > 1 && !currentClient) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 font-sans text-xs animate-fade-in p-4">
        
        {/* Header banner */}
        <div className="bg-navy text-white rounded-3xl border border-gold/15 p-6 shadow-md flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-gold/20 text-gold font-mono font-bold text-[10px] uppercase border border-gold/30">
                +91 {searchMobile.trim()}
              </span>
              <span className="text-white/60 text-[10px] font-mono">({matchedProfiles.length} Profiles Found)</span>
            </div>
            <h1 className="text-xl font-serif font-black tracking-tight">Multiple profiles found</h1>
            <p className="text-gold/80 text-[11px]">
              Please choose your name below to view your personalized measurements and orders:
            </p>
          </div>

          <button 
            type="button"
            onClick={handleChangeMobile}
            className="bg-white/10 hover:bg-white/20 text-white border border-white/20 font-semibold px-3.5 py-2 rounded-xl flex items-center gap-1.5 cursor-pointer transition-colors text-[11px] shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Change Mobile Number
          </button>
        </div>

        {/* List of customer profile cards */}
        <div className="space-y-3">
          {matchedProfiles.map((profile) => {
            const memberId = `SS-${profile.id.slice(-6).toUpperCase()}`;
            const customerYear = profile.customerSince 
              ? new Date(profile.customerSince).getFullYear() 
              : "2024";

            return (
              <div 
                key={profile.id}
                onClick={() => loadCustomerProfile(profile)}
                className="bg-white rounded-2xl border border-light p-5 shadow-sm hover:shadow-md hover:border-gold transition-all cursor-pointer group flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-4">
                  {/* Avatar / Initials */}
                  <div className="w-12 h-12 rounded-2xl bg-navy text-gold font-serif font-bold text-base flex items-center justify-center border border-gold/20 shadow-xs group-hover:scale-105 transition-transform shrink-0">
                    {getInitials(profile.fullName)}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-serif font-bold text-navy group-hover:text-gold transition-colors">
                        {profile.fullName}
                      </h2>
                      <span className="text-[9px] uppercase font-mono font-bold px-2 py-0.5 rounded-md bg-cream/60 text-muted-grey border border-light">
                        {memberId}
                      </span>
                    </div>

                    <p className="text-[11px] text-muted-grey">
                      Customer Profile &bull; <span className="text-charcoal font-medium">Customer since {customerYear}</span>
                    </p>

                    {profile.preferenceTags && profile.preferenceTags.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap pt-0.5">
                        {profile.preferenceTags.slice(0, 3).map((tag, idx) => (
                          <span key={idx} className="text-[9px] font-semibold bg-navy/5 text-navy px-1.5 py-0.5 rounded border border-navy/10">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <button 
                  type="button"
                  className="bg-navy group-hover:bg-gold text-white group-hover:text-navy font-bold px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition-all text-[11px] uppercase tracking-wider shrink-0 cursor-pointer shadow-xs"
                >
                  <span>View Profile</span>
                  <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer info */}
        <div className="text-center pt-4">
          <p className="text-[10px] text-muted-grey">
            Each profile maintains completely isolated measurements, past orders, and billing records.
          </p>
        </div>

      </div>
    );
  }

  // =========================================================================
  // VIEW 3: ACTIVE CUSTOMER PORTAL PROFILE (Fully Loaded Customer Profile)
  // =========================================================================
  if (!currentClient || isLoadingProfile) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gold"></div>
        <p className="text-xs text-muted-grey mt-3 font-medium">Loading customer profile securely...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 font-sans text-xs animate-fade-in p-2 sm:p-4">
      
      {/* Top Header Card */}
      <div className="bg-navy text-white rounded-3xl border border-gold/15 p-6 shadow-md space-y-4">
        
        {/* Top bar with back navigation and reset */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gold/15 pb-4">
          <div className="flex items-center gap-2">
            {matchedProfiles.length > 1 && (
              <button 
                type="button"
                onClick={handleBackToProfiles}
                className="bg-gold/15 hover:bg-gold/30 text-white border border-gold/25 font-bold px-3 py-1.5 rounded-xl flex items-center gap-1.5 cursor-pointer transition-colors text-[11px]"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-gold" />
                <span>← Back to Profiles</span>
              </button>
            )}
            <button 
              type="button"
              onClick={handleChangeMobile}
              className="bg-white/10 hover:bg-white/20 text-white/90 border border-white/15 font-semibold px-3 py-1.5 rounded-xl flex items-center gap-1.5 cursor-pointer transition-colors text-[11px]"
            >
              <Phone className="w-3.5 h-3.5 text-white/60" />
              <span>Change Mobile Number</span>
            </button>
          </div>

          <span className="text-[10px] font-mono text-gold/80 uppercase font-bold tracking-wider">
            Verified Customer Portal
          </span>
        </div>

        {/* Customer Identity Bar */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gold text-navy font-serif font-black text-xl flex items-center justify-center border-2 border-white/20 shadow-md shrink-0">
              {getInitials(currentClient.fullName)}
            </div>
            <div className="space-y-1">
              <span className="text-[9px] text-gold font-bold uppercase tracking-widest font-mono">Bespoke Suite Holder</span>
              <h1 className="text-2xl font-serif font-bold tracking-tight text-white">{currentClient.fullName}</h1>
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-white/70">
                <span className="font-mono flex items-center gap-1">
                  <Phone className="w-3 h-3 text-gold" />
                  +91 {currentClient.mobileNumber}
                </span>
                <span>&bull;</span>
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-gold" />
                  Customer since {formatDate(currentClient.customerSince)}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white/10 border border-white/15 rounded-2xl px-4 py-2.5 text-right font-mono self-stretch sm:self-auto flex sm:flex-col justify-between items-center sm:items-end">
            <span className="text-[9px] text-white/60 uppercase tracking-widest">Showroom ID</span>
            <span className="text-xs font-bold text-gold">SS-{currentClient.id.slice(-6).toUpperCase()}</span>
          </div>
        </div>

      </div>

      {/* Main Grid: Sidebar Tabs + Content Area */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        
        {/* Left Column: Navigation Tabs */}
        <div className="md:col-span-3 bg-white rounded-3xl border border-light shadow-3xs p-3.5 space-y-1.5 flex flex-row md:flex-col overflow-x-auto md:overflow-visible">
          
          <button 
            type="button"
            onClick={() => setPortalTab("active-orders")}
            className={`w-full py-2.5 px-3.5 rounded-xl font-bold flex items-center justify-between gap-2 cursor-pointer transition-colors text-[11px] shrink-0 ${
              portalTab === "active-orders" ? "bg-navy text-white shadow-xs" : "text-muted-grey hover:bg-cream/30 hover:text-navy"
            }`}
          >
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-gold" />
              <span>Current Orders</span>
            </div>
            {activeOrders.length > 0 && (
              <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                portalTab === "active-orders" ? "bg-gold text-navy" : "bg-navy/10 text-navy"
              }`}>
                {activeOrders.length}
              </span>
            )}
          </button>

          <button 
            type="button"
            onClick={() => setPortalTab("order-history")}
            className={`w-full py-2.5 px-3.5 rounded-xl font-bold flex items-center justify-between gap-2 cursor-pointer transition-colors text-[11px] shrink-0 ${
              portalTab === "order-history" ? "bg-navy text-white shadow-xs" : "text-muted-grey hover:bg-cream/30 hover:text-navy"
            }`}
          >
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-gold" />
              <span>Order History</span>
            </div>
            {pastOrders.length > 0 && (
              <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                portalTab === "order-history" ? "bg-gold text-navy" : "bg-navy/10 text-navy"
              }`}>
                {pastOrders.length}
              </span>
            )}
          </button>

          <button 
            type="button"
            onClick={() => setPortalTab("measurements")}
            className={`w-full py-2.5 px-3.5 rounded-xl font-bold flex items-center justify-between gap-2 cursor-pointer transition-colors text-[11px] shrink-0 ${
              portalTab === "measurements" ? "bg-navy text-white shadow-xs" : "text-muted-grey hover:bg-cream/30 hover:text-navy"
            }`}
          >
            <div className="flex items-center gap-2">
              <Ruler className="w-4 h-4 text-gold" />
              <span>Measurements</span>
            </div>
            {clientMeasurements.length > 0 && (
              <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                portalTab === "measurements" ? "bg-gold text-navy" : "bg-navy/10 text-navy"
              }`}>
                {clientMeasurements.length}
              </span>
            )}
          </button>

          <button 
            type="button"
            onClick={() => setPortalTab("qr")}
            className={`w-full py-2.5 px-3.5 rounded-xl font-bold flex items-center gap-2 cursor-pointer transition-colors text-[11px] shrink-0 ${
              portalTab === "qr" ? "bg-navy text-white shadow-xs" : "text-muted-grey hover:bg-cream/30 hover:text-navy"
            }`}
          >
            <QrCode className="w-4 h-4 text-gold" />
            <span>QR Member Pass</span>
          </button>

        </div>

        {/* Right Content Panel */}
        <div className="md:col-span-9 bg-white rounded-3xl border border-light p-6 shadow-3xs min-h-[450px]">
          
          {/* TAB 1: CURRENT ACTIVE ORDERS */}
          {portalTab === "active-orders" && (
            <div className="space-y-5 animate-fade-in">
              <div className="flex justify-between items-center border-b border-light pb-3">
                <div>
                  <h2 className="text-sm font-serif font-bold text-navy uppercase tracking-wider">Current Orders</h2>
                  <p className="text-[11px] text-muted-grey">Active custom tailoring commissions in progress</p>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-navy/5 text-navy font-bold font-mono text-[10px]">
                  {activeOrders.length} Active
                </span>
              </div>

              {activeOrders.length === 0 ? (
                <div className="text-center py-12 space-y-3 bg-cream/20 rounded-2xl border border-dashed border-light">
                  <ShoppingBag className="w-8 h-8 text-muted-grey mx-auto opacity-50" />
                  <p className="text-muted-grey font-medium text-xs">No active orders currently in production.</p>
                  <p className="text-[10px] text-muted-grey/70">Visit Signature Suitings showroom to commission your next bespoke garment.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {activeOrders.map((order) => {
                    const balanceDue = (order.totalAmount || 0) - (order.advancePaid || 0);

                    return (
                      <div 
                        key={order.id}
                        className="bg-cream/20 p-5 rounded-2xl border border-light hover:border-gold/50 transition-all space-y-4 shadow-3xs"
                      >
                        {/* Order Top Bar */}
                        <div className="flex justify-between items-start flex-wrap gap-2 border-b border-light/80 pb-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-serif font-bold text-navy text-base">Order #{order.orderNumber}</span>
                              <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase border ${getStatusBadge(order.status)}`}>
                                {order.status}
                              </span>
                            </div>
                            <p className="text-muted-grey font-mono text-[10px] mt-0.5">
                              Booked on {formatDate(order.orderDate)}
                            </p>
                          </div>

                          <div className="text-right font-mono">
                            <span className="text-[10px] text-muted-grey uppercase block">Total Amount</span>
                            <span className="font-bold text-navy text-sm">₹{Number(order.totalAmount || 0).toLocaleString("en-IN")}</span>
                          </div>
                        </div>

                        {/* Garment Details & Delivery Date */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <span className="text-[10px] text-muted-grey uppercase font-bold tracking-wider">Garments</span>
                            <div className="flex gap-1.5 flex-wrap">
                              {order.garmentTypes.map((g, i) => (
                                <span key={i} className="px-2.5 py-1 bg-white text-navy font-bold rounded-lg border border-light text-[10px]">
                                  {g}
                                </span>
                              ))}
                            </div>
                            {order.fabricDetails && (
                              <p className="text-[11px] text-charcoal font-medium mt-1">
                                <span className="text-muted-grey font-semibold">Fabric:</span> {order.fabricDetails}
                              </p>
                            )}
                          </div>

                          <div className="bg-white/80 p-3 rounded-xl border border-light space-y-1">
                            <span className="text-[9px] text-muted-grey uppercase font-bold tracking-wider flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-gold" />
                              Expected Delivery
                            </span>
                            <p className="font-serif font-bold text-navy text-sm">
                              {formatDate(order.expectedDeliveryDate)}
                            </p>
                            <div className="flex justify-between items-center text-[10px] pt-1 border-t border-light/60 font-mono">
                              <span className="text-muted-grey">Advance: ₹{Number(order.advancePaid || 0).toLocaleString("en-IN")}</span>
                              <span className={balanceDue > 0 ? "text-amber-700 font-bold" : "text-emerald-700 font-bold"}>
                                Balance: ₹{Number(balanceDue).toLocaleString("en-IN")}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* View Details Action */}
                        <div className="flex justify-end pt-1">
                          <button
                            type="button"
                            onClick={() => setSelectedOrderForDetail(order)}
                            className="bg-navy hover:bg-navy-hover text-white font-bold px-3.5 py-1.5 rounded-xl text-[10px] uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <span>View Order Details</span>
                            <ChevronRight className="w-3.5 h-3.5 text-gold" />
                          </button>
                        </div>

                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: PAST ORDERS / ORDER HISTORY */}
          {portalTab === "order-history" && (
            <div className="space-y-5 animate-fade-in">
              <div className="flex justify-between items-center border-b border-light pb-3">
                <div>
                  <h2 className="text-sm font-serif font-bold text-navy uppercase tracking-wider">Order History</h2>
                  <p className="text-[11px] text-muted-grey">Completed and delivered tailoring commissions</p>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold font-mono text-[10px]">
                  {pastOrders.length} Completed
                </span>
              </div>

              {pastOrders.length === 0 ? (
                <div className="text-center py-12 space-y-3 bg-cream/20 rounded-2xl border border-dashed border-light">
                  <Clock className="w-8 h-8 text-muted-grey mx-auto opacity-50" />
                  <p className="text-muted-grey font-medium text-xs">No previous delivered orders found.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pastOrders.map((order) => (
                    <div 
                      key={order.id}
                      className="bg-white p-4.5 rounded-2xl border border-light hover:border-gold/40 transition-all space-y-3 shadow-3xs"
                    >
                      <div className="flex justify-between items-start flex-wrap gap-2 border-b border-light/80 pb-2.5">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-serif font-bold text-navy text-sm">Order #{order.orderNumber}</span>
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Delivered
                            </span>
                          </div>
                          <p className="text-muted-grey font-mono text-[10px] mt-0.5">
                            Delivered: {formatDate(order.actualDeliveryDate || order.expectedDeliveryDate)} &bull; Ordered: {formatDate(order.orderDate)}
                          </p>
                        </div>

                        <div className="text-right font-mono">
                          <span className="font-bold text-navy text-sm">₹{Number(order.totalAmount || 0).toLocaleString("en-IN")}</span>
                          <span className="text-[9px] text-emerald-600 block font-bold">Settled in Full</span>
                        </div>
                      </div>

                      <div className="flex justify-between items-center flex-wrap gap-2">
                        <div className="flex gap-1.5 flex-wrap">
                          {order.garmentTypes.map((g, i) => (
                            <span key={i} className="px-2 py-0.5 bg-cream/50 text-navy font-semibold rounded-md border border-light text-[10px]">
                              {g}
                            </span>
                          ))}
                        </div>

                        <button
                          type="button"
                          onClick={() => setSelectedOrderForDetail(order)}
                          className="text-navy hover:text-gold font-bold text-[10px] flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <span>View Details</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: MEASUREMENTS & SIZE CHART */}
          {portalTab === "measurements" && (
            <div className="space-y-5 animate-fade-in">
              <div className="flex justify-between items-start flex-wrap gap-3 border-b border-light pb-3">
                <div>
                  <h2 className="text-sm font-serif font-bold text-navy uppercase tracking-wider">Master Size Configuration</h2>
                  <p className="text-[11px] text-muted-grey">Official tailor measurements recorded for {currentClient.fullName}</p>
                </div>

                {/* Version switcher if multiple measurement versions exist */}
                {clientMeasurements.length > 1 && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-grey font-semibold">Version:</span>
                    <select
                      value={selectedMeasurementId || ""}
                      onChange={(e) => setSelectedMeasurementId(e.target.value)}
                      className="bg-cream/40 border border-light rounded-xl px-3 py-1.5 text-[10px] font-mono font-bold text-navy focus:outline-hidden focus:border-gold"
                    >
                      {clientMeasurements.map((m, idx) => (
                        <option key={m.id} value={m.id}>
                          {idx === 0 ? "Latest" : `Version ${clientMeasurements.length - idx}`} ({formatDate(m.versionDate)})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {!currentMeasurement ? (
                <div className="text-center py-12 space-y-3 bg-cream/20 rounded-2xl border border-dashed border-light">
                  <Ruler className="w-8 h-8 text-muted-grey mx-auto opacity-50" />
                  <p className="text-muted-grey font-medium text-xs">No size measurements recorded yet.</p>
                  <p className="text-[10px] text-muted-grey/70">Visit Hardik Nagpal Industries cutting desk to record your master size card.</p>
                </div>
              ) : (
                <div className="space-y-5 text-xs font-sans">
                  
                  {/* Measurement Info Banner */}
                  <div className="bg-gold/10 border border-gold/25 p-3.5 rounded-2xl flex flex-wrap justify-between items-center gap-2 text-[11px]">
                    <div>
                      <span className="font-bold text-navy">Master Measurement Record</span>
                      <p className="text-charcoal text-[10px]">
                        Recorded on {formatDate(currentMeasurement.versionDate)} &bull; Slip #{currentMeasurement.slipNumber}
                      </p>
                    </div>
                    {currentMeasurement.fabricSelected && (
                      <span className="text-[10px] bg-white px-2.5 py-1 rounded-lg border border-gold/30 font-semibold text-navy">
                        Fabric: {currentMeasurement.fabricSelected}
                      </span>
                    )}
                  </div>

                  {/* Garment Measurement Cards Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    
                    {/* Coat / Indo-Western */}
                    {currentMeasurement.coatIndoWestern && Object.values(currentMeasurement.coatIndoWestern).some(Boolean) && (
                      <div className="border border-light rounded-2xl overflow-hidden shadow-3xs">
                        <div className="bg-navy p-2.5 font-bold text-white flex items-center justify-between">
                          <span className="font-serif">Coat / Indo-Western (Inches)</span>
                          <Scissors className="w-3.5 h-3.5 text-gold" />
                        </div>
                        <div className="p-3.5 font-mono grid grid-cols-2 gap-2 text-charcoal bg-white">
                          {currentMeasurement.coatIndoWestern.length && <p>Length: <b>{currentMeasurement.coatIndoWestern.length}&quot;</b></p>}
                          {currentMeasurement.coatIndoWestern.chest && <p>Chest: <b>{currentMeasurement.coatIndoWestern.chest}&quot;</b></p>}
                          {currentMeasurement.coatIndoWestern.waist && <p>Waist: <b>{currentMeasurement.coatIndoWestern.waist}&quot;</b></p>}
                          {currentMeasurement.coatIndoWestern.neck && <p>Neck: <b>{currentMeasurement.coatIndoWestern.neck}&quot;</b></p>}
                          {currentMeasurement.coatIndoWestern.tira && <p>Shoulder (Tira): <b>{currentMeasurement.coatIndoWestern.tira}&quot;</b></p>}
                          {currentMeasurement.coatIndoWestern.arms && <p>Sleeve (Arms): <b>{currentMeasurement.coatIndoWestern.arms}&quot;</b></p>}
                          {currentMeasurement.coatIndoWestern.cback && <p>C/Back: <b>{currentMeasurement.coatIndoWestern.cback}&quot;</b></p>}
                          {currentMeasurement.coatIndoWestern.hb && <p>H.B.: <b>{currentMeasurement.coatIndoWestern.hb}&quot;</b></p>}
                        </div>
                      </div>
                    )}

                    {/* Trouser / Pent */}
                    {currentMeasurement.pent && Object.values(currentMeasurement.pent).some(Boolean) && (
                      <div className="border border-light rounded-2xl overflow-hidden shadow-3xs">
                        <div className="bg-navy p-2.5 font-bold text-white flex items-center justify-between">
                          <span className="font-serif">Trouser / Pent (Inches)</span>
                          <Scissors className="w-3.5 h-3.5 text-gold" />
                        </div>
                        <div className="p-3.5 font-mono grid grid-cols-2 gap-2 text-charcoal bg-white">
                          {PANT_MEASUREMENT_FIELDS.map(f => {
                            const value = (normalizePantMeasurement(currentMeasurement.pent) as any)[f.key];
                            return value ? <p key={f.key}>{f.label}: <b>{value}&quot;</b></p> : null;
                          })}
                        </div>
                      </div>
                    )}

                    {/* Shirt / Kurta */}
                    {currentMeasurement.shirtKurta && Object.values(currentMeasurement.shirtKurta).some(Boolean) && (
                      <div className="border border-light rounded-2xl overflow-hidden shadow-3xs">
                        <div className="bg-navy p-2.5 font-bold text-white flex items-center justify-between">
                          <span className="font-serif">Shirt / Kurta (Inches)</span>
                          <Scissors className="w-3.5 h-3.5 text-gold" />
                        </div>
                        <div className="p-3.5 font-mono grid grid-cols-2 gap-2 text-charcoal bg-white">
                          {currentMeasurement.shirtKurta.length && <p>Length: <b>{currentMeasurement.shirtKurta.length}&quot;</b></p>}
                          {currentMeasurement.shirtKurta.chest && <p>Chest: <b>{currentMeasurement.shirtKurta.chest}&quot;</b></p>}
                          {currentMeasurement.shirtKurta.waist && <p>Waist: <b>{currentMeasurement.shirtKurta.waist}&quot;</b></p>}
                          {currentMeasurement.shirtKurta.neck && <p>Collar (Neck): <b>{currentMeasurement.shirtKurta.neck}&quot;</b></p>}
                          {currentMeasurement.shirtKurta.tira && <p>Shoulder: <b>{currentMeasurement.shirtKurta.tira}&quot;</b></p>}
                          {currentMeasurement.shirtKurta.arms && <p>Sleeve: <b>{currentMeasurement.shirtKurta.arms}&quot;</b></p>}
                        </div>
                      </div>
                    )}

                    {/* Vest */}
                    {currentMeasurement.vest && Object.values(currentMeasurement.vest).some(Boolean) && (
                      <div className="border border-light rounded-2xl overflow-hidden shadow-3xs">
                        <div className="bg-navy p-2.5 font-bold text-white flex items-center justify-between">
                          <span className="font-serif">Vest / Waistcoat (Inches)</span>
                          <Scissors className="w-3.5 h-3.5 text-gold" />
                        </div>
                        <div className="p-3.5 font-mono grid grid-cols-2 gap-2 text-charcoal bg-white">
                          {currentMeasurement.vest.length && <p>Length: <b>{currentMeasurement.vest.length}&quot;</b></p>}
                          {currentMeasurement.vest.chest && <p>Chest: <b>{currentMeasurement.vest.chest}&quot;</b></p>}
                          {currentMeasurement.vest.waist && <p>Waist: <b>{currentMeasurement.vest.waist}&quot;</b></p>}
                          {currentMeasurement.vest.hip && <p>Hip: <b>{currentMeasurement.vest.hip}&quot;</b></p>}
                        </div>
                      </div>
                    )}

                  </div>

                  {/* Design Notes */}
                  {currentMeasurement.designNotes && (
                    <div className="p-3.5 bg-cream/30 border border-light rounded-2xl space-y-1">
                      <span className="text-[10px] text-muted-grey uppercase font-bold tracking-wider">Styling & Cut Notes</span>
                      <p className="text-charcoal leading-relaxed text-xs">{currentMeasurement.designNotes}</p>
                    </div>
                  )}

                </div>
              )}
            </div>
          )}

          {/* TAB 4: QR MEMBER PASS */}
          {portalTab === "qr" && (
            <div className="space-y-4 text-center py-6 animate-fade-in">
              <div className="max-w-xs mx-auto space-y-4">
                <div className="space-y-1">
                  <h2 className="text-sm font-serif font-bold text-navy uppercase tracking-wider">Showroom QR Identification</h2>
                  <p className="text-muted-grey text-[11px] leading-relaxed">
                    Present this permanent pass at Signature Suitings showroom desk for express lookup.
                  </p>
                </div>

                {/* QR Card Frame */}
                <div className="bg-navy border border-gold/25 p-6 rounded-3xl text-white text-center space-y-4 shadow-xl">
                  <div className="w-10 h-10 border-2 border-gold rounded-full flex items-center justify-center text-gold font-serif font-black text-sm mx-auto">
                    SS
                  </div>
                  <div>
                    <h3 className="font-serif font-black tracking-widest text-xs uppercase">SIGNATURE SUITINGS</h3>
                    <p className="text-[8px] tracking-widest text-gold/80 uppercase font-mono mt-0.5">Bespoke Suite Card</p>
                  </div>
                  
                  <div className="bg-white p-3.5 rounded-2xl inline-block shadow-inner mx-auto">
                    <QRCode 
                      value={`${window.location.origin}/portal/${currentClient.qrCodeId || currentClient.id}`} 
                      size={180}
                      level="H"
                    />
                  </div>

                  <div className="space-y-0.5 text-xs font-semibold">
                    <p className="text-gold font-serif text-sm">{currentClient.fullName}</p>
                    <p className="text-white/70 font-mono tracking-wide">+91 {currentClient.mobileNumber}</p>
                    <p className="text-white/40 font-mono text-[9px]">ID: SS-{currentClient.id.slice(-6).toUpperCase()}</p>
                  </div>
                </div>

              </div>
            </div>
          )}

        </div>
      </div>

      {/* =====================================================================
          ORDER DETAILS MODAL (Completely Customer-Friendly & Secure)
      ===================================================================== */}
      {selectedOrderForDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-3xl border border-light max-w-lg w-full shadow-2xl overflow-hidden animate-scale-up space-y-0">
            
            {/* Modal Header */}
            <div className="bg-navy p-5 text-white flex justify-between items-center border-b border-gold/15">
              <div>
                <span className="text-[9px] text-gold uppercase font-mono font-bold tracking-widest">Order Specification</span>
                <h3 className="text-lg font-serif font-bold">Order #{selectedOrderForDetail.orderNumber}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrderForDetail(null)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 text-xs font-sans max-h-[75vh] overflow-y-auto">
              
              {/* Status Banner */}
              <div className="flex justify-between items-center p-3 bg-cream/30 rounded-2xl border border-light">
                <div>
                  <span className="text-[10px] text-muted-grey uppercase font-semibold">Current Status</span>
                  <p className="font-bold text-navy text-sm mt-0.5">{selectedOrderForDetail.status}</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase border ${getStatusBadge(selectedOrderForDetail.status)}`}>
                  {selectedOrderForDetail.status}
                </span>
              </div>

              {/* Garments List */}
              <div className="space-y-1.5">
                <span className="text-[10px] text-muted-grey uppercase font-bold tracking-wider">Garments Commissioned</span>
                <div className="space-y-2">
                  {selectedOrderForDetail.garmentTypes.map((g, idx) => (
                    <div key={idx} className="p-3 bg-white border border-light rounded-xl flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Scissors className="w-3.5 h-3.5 text-gold" />
                        <span className="font-bold text-navy">{g}</span>
                      </div>
                      <span className="text-[10px] font-mono text-muted-grey">Quantity: 1</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Fabric details if recorded */}
              {selectedOrderForDetail.fabricDetails && (
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-grey uppercase font-bold tracking-wider">Fabric Selection</span>
                  <p className="p-3 bg-cream/20 border border-light rounded-xl text-charcoal font-medium">
                    {selectedOrderForDetail.fabricDetails}
                  </p>
                </div>
              )}

              {/* Dates & Timeline */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-cream/20 rounded-xl border border-light space-y-1">
                  <span className="text-[9px] text-muted-grey uppercase font-bold flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-gold" />
                    Order Date
                  </span>
                  <p className="font-bold text-navy">{formatDate(selectedOrderForDetail.orderDate)}</p>
                </div>

                <div className="p-3 bg-cream/20 rounded-xl border border-light space-y-1">
                  <span className="text-[9px] text-muted-grey uppercase font-bold flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-gold" />
                    Expected Delivery
                  </span>
                  <p className="font-bold text-navy">{formatDate(selectedOrderForDetail.expectedDeliveryDate)}</p>
                </div>
              </div>

              {/* Financial Summary */}
              <div className="p-4 bg-navy text-white rounded-2xl space-y-2 font-mono">
                <div className="flex justify-between items-center text-[11px] text-white/70">
                  <span>Total Order Amount:</span>
                  <span className="font-bold text-white">₹{Number(selectedOrderForDetail.totalAmount || 0).toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between items-center text-[11px] text-white/70">
                  <span>Advance Payment Paid:</span>
                  <span className="font-bold text-emerald-400">₹{Number(selectedOrderForDetail.advancePaid || 0).toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between items-center text-xs pt-2 border-t border-white/15 font-bold">
                  <span>Outstanding Balance Due:</span>
                  <span className={(selectedOrderForDetail.totalAmount || 0) - (selectedOrderForDetail.advancePaid || 0) > 0 ? "text-amber-300" : "text-emerald-400"}>
                    ₹{Number((selectedOrderForDetail.totalAmount || 0) - (selectedOrderForDetail.advancePaid || 0)).toLocaleString("en-IN")}
                  </span>
                </div>
              </div>

              {/* Notes */}
              {selectedOrderForDetail.notes && (
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-grey uppercase font-bold tracking-wider">Tailoring Notes</span>
                  <p className="text-[11px] text-charcoal leading-relaxed">{selectedOrderForDetail.notes}</p>
                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-cream/20 border-t border-light flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedOrderForDetail(null)}
                className="bg-navy hover:bg-navy-hover text-white font-bold px-5 py-2 rounded-xl text-xs uppercase tracking-wider cursor-pointer transition-colors"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

      {/* CUSTOM CONFIRMATION MODAL */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmLabel={confirmModal.confirmLabel}
        variant={confirmModal.variant}
        onConfirm={confirmModal.onConfirm}
      />

    </div>
  );
}
