/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  Plus, 
  Search, 
  Filter, 
  User, 
  Phone, 
  MapPin, 
  Mail, 
  Calendar, 
  Trash2, 
  Edit, 
  Eye, 
  ChevronRight, 
  ArrowLeft, 
  Ruler, 
  ShoppingBag, 
  History, 
  Receipt, 
  Sparkles, 
  QrCode, 
  Printer, 
  ArrowLeftRight,
  UserCheck,
  CheckCircle,
  FileText,
  Clock,
  ExternalLink,
  Camera
} from "lucide-react";
import { QRCodeSVG as QRCode } from "qrcode.react";
import { Customer, Measurement, Order, Invoice, Trial, Alteration, MemoryNote, PANT_MEASUREMENT_FIELDS, normalizePantMeasurement } from "../types";
import { db, stripEmbeddedTags } from "../db";
import ConfirmModal from "./ConfirmModal";
import EditOrderModal from "./EditOrderModal";
import { uploadImage, isSupabaseConfigured } from "../supabase";

interface CustomersViewProps {
  initialSelectedCustomerId?: string;
  onNavigateToMeasurement: (customerId: string, copyFromId?: string) => void;
  onNavigateToOrder: (customerId: string) => void;
  onNavigateToInvoice: (customerId: string, orderId: string) => void;
}

export default function CustomersView({ 
  initialSelectedCustomerId,
  onNavigateToMeasurement,
  onNavigateToOrder,
  onNavigateToInvoice
}: CustomersViewProps) {
  // --- DATABASE STATE ---
  const [customers, setCustomers] = useState<Customer[]>(db.getCustomers());
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(initialSelectedCustomerId || null);
  
  // --- LIST FILTER STATE ---
  const [searchQuery, setSearchQuery] = useState("");
  const [hasBalanceFilter, setHasBalanceFilter] = useState(false);
  const [sortKey, setSortKey] = useState<"name" | "added" | "spend">("name");

  // --- MODALS STATE ---
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);

  // --- ADD/EDIT CUSTOMER FORM STATE ---
  const [formName, setFormName] = useState("");
  const [formMobile, setFormMobile] = useState("");
  const [formAlternate, setFormAlternate] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formDob, setFormDob] = useState("");
  const [formFabric, setFormFabric] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formPhotoUrl, setFormPhotoUrl] = useState("");
  const [formOpeningUdhar, setFormOpeningUdhar] = useState("");
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  // --- UDHAR ACTION MODALS STATE ---
  const [isAddUdharModalOpen, setIsAddUdharModalOpen] = useState(false);
  const [addUdharAmount, setAddUdharAmount] = useState("");
  const [addUdharNote, setAddUdharNote] = useState("");

  const [isPayUdharModalOpen, setIsPayUdharModalOpen] = useState(false);
  const [payUdharAmount, setPayUdharAmount] = useState("");
  const [payUdharMode, setPayUdharMode] = useState<"Cash" | "UPI / QR" | "Card (POS)" | "Bank Transfer">("Cash");

  // --- PROFILE TAB STATE ---
  const [profileTab, setProfileTab] = useState<"overview" | "measurements" | "orders" | "trials" | "billing" | "memory">("overview");
  
  // --- COMPARISON STATE ---
  const [isComparing, setIsComparing] = useState(false);
  const [compareVersion1, setCompareVersion1] = useState<string>("");
  const [compareVersion2, setCompareVersion2] = useState<string>("");

  // --- MEMORY NOTES STATE ---
  const [newMemoryNoteText, setNewMemoryNoteText] = useState("");

  // --- QR CARD PRINT STATE ---
  const [isQrCardOpen, setIsQrCardOpen] = useState(false);

  // --- CUSTOM CONFIRM MODAL STATE ---
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: "danger" | "warning" | "info";
    onConfirm: () => void;
    onCancel?: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  // Edit Order state
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);

  // Refresh database references
  const refreshDb = () => {
    setCustomers(db.getCustomers());
    db.recalculateAllBalances();
  };

  useEffect(() => {
    const unsubscribe = db.onSync(() => {
      setCustomers(db.getCustomers());
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (initialSelectedCustomerId) {
      setSelectedCustomerId(initialSelectedCustomerId);
    }
  }, [initialSelectedCustomerId]);

  // Selected customer object
  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);

  // Retrieve customer specific subcollections
  const customerMeasurements = selectedCustomerId ? db.getMeasurements(selectedCustomerId) : [];
  const customerOrders = selectedCustomerId ? db.getOrdersForCustomer(selectedCustomerId) : [];
  const customerInvoices = selectedCustomerId ? db.getInvoicesForCustomer(selectedCustomerId) : [];
  const customerTrials = selectedCustomerId ? db.getTrialsForCustomer(selectedCustomerId) : [];
  const customerAlterations = selectedCustomerId ? db.getAlterationsForCustomer(selectedCustomerId) : [];

  // Setup initial compare versions if available
  useEffect(() => {
    if (customerMeasurements.length >= 2) {
      setCompareVersion1(customerMeasurements[0].id);
      setCompareVersion2(customerMeasurements[1].id);
    } else {
      setIsComparing(false);
    }
  }, [selectedCustomerId, customerMeasurements.length]);

  // Handle Form resets
  const resetForm = () => {
    setFormName("");
    setFormMobile("");
    setFormAlternate("");
    setFormEmail("");
    setFormAddress("");
    setFormDob("");
    setFormFabric("");
    setFormNotes("");
    setFormPhotoUrl("");
    setFormOpeningUdhar("");
    setIsUploadingPhoto(false);
    setEditingCustomerId(null);
    setIsEditMode(false);
  };

  // Open Form for Adding
  const openAddModal = () => {
    resetForm();
    setIsAddModalOpen(true);
  };

  // Open Form for Editing
  const openEditModal = (cust: Customer) => {
    setEditingCustomerId(cust.id);
    setFormName(cust.fullName);
    setFormMobile(cust.mobileNumber);
    setFormAlternate(cust.alternateNumber || "");
    setFormEmail(cust.email || "");
    setFormAddress(cust.address || "");
    setFormDob(cust.dob || "");
    setFormFabric(cust.preferredFabricBrands.join(", "));
    setFormNotes(stripEmbeddedTags(cust.generalNotes));
    setFormPhotoUrl(cust.photoUrl || "");
    setIsEditMode(true);
    setIsAddModalOpen(true);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isSupabaseConfigured) {
      setConfirmModal({
        isOpen: true,
        title: "Supabase Required",
        message: "Supabase connection is not fully configured yet. Please configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable permanent photo uploads.",
        confirmLabel: "Understood",
        variant: "warning",
        onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
      });
      return;
    }

    setIsUploadingPhoto(true);
    try {
      const url = await uploadImage(file);
      if (url) {
        setFormPhotoUrl(url);
      } else {
        setConfirmModal({
          isOpen: true,
          title: "Upload Failed",
          message: "Could not upload the profile photo. Please ensure the 'images' storage bucket is created and public in your Supabase project.",
          confirmLabel: "Understood",
          variant: "danger",
          onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
        });
      }
    } catch (error) {
      console.error("Photo upload error:", error);
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleDirectCustomerPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedCustomerId) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      db.updateCustomer(selectedCustomerId, { photoUrl: base64String });
      refreshDb();
    };
    reader.readAsDataURL(file);
  };

  // Save Customer Form
  const handleSaveCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formMobile.trim()) {
      setConfirmModal({
        isOpen: true,
        title: "Validation Required",
        message: "Customer Full Name and Mobile Number are required fields.",
        confirmLabel: "Understood",
        variant: "warning",
        onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
      });
      return;
    }
    if (formMobile.trim().replace(/\D/g, "").length !== 10) {
      setConfirmModal({
        isOpen: true,
        title: "Invalid Mobile Number",
        message: "Mobile Number must be exactly 10 digits.",
        confirmLabel: "Understood",
        variant: "warning",
        onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
      });
      return;
    }

    const fabricBrands = formFabric.split(",").map(b => b.trim()).filter(b => b.length > 0);

    if (isEditMode && editingCustomerId) {
      db.updateCustomer(editingCustomerId, {
        fullName: formName,
        mobileNumber: formMobile,
        alternateNumber: formAlternate,
        email: formEmail,
        address: formAddress,
        dob: formDob,
        preferredFabricBrands: fabricBrands,
        generalNotes: formNotes,
        photoUrl: formPhotoUrl
      });
    } else {
      const newC = db.addCustomer({
        fullName: formName,
        mobileNumber: formMobile,
        alternateNumber: formAlternate,
        email: formEmail,
        address: formAddress,
        dob: formDob,
        preferredFabricBrands: fabricBrands,
        generalNotes: formNotes,
        photoUrl: formPhotoUrl
      });
      const initialUdharNum = parseFloat(formOpeningUdhar);
      if (!isNaN(initialUdharNum) && initialUdharNum > 0) {
        db.addOpeningUdhar(newC.id, initialUdharNum, "Purana Udhar at Registration");
      }
    }

    refreshDb();
    setIsAddModalOpen(false);
    resetForm();
  };

  const handleAddOpeningUdharSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId) return;
    const amt = parseFloat(addUdharAmount);
    if (isNaN(amt) || amt <= 0) {
      setConfirmModal({
        isOpen: true,
        title: "Invalid Amount",
        message: "Please enter a valid Udhar amount greater than 0.",
        confirmLabel: "Understood",
        variant: "warning",
        onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
      });
      return;
    }
    db.addOpeningUdhar(selectedCustomerId, amt, addUdharNote || "Purana Udhar");
    refreshDb();
    setIsAddUdharModalOpen(false);
    setAddUdharAmount("");
    setAddUdharNote("");
  };

  const handlePayUdharSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId) return;
    const amt = parseFloat(payUdharAmount);
    if (isNaN(amt) || amt <= 0) {
      setConfirmModal({
        isOpen: true,
        title: "Invalid Amount",
        message: "Please enter a valid payment amount greater than 0.",
        confirmLabel: "Understood",
        variant: "warning",
        onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
      });
      return;
    }
    db.payCustomerUdhar(selectedCustomerId, amt, payUdharMode, "Billing Counter");
    refreshDb();
    setIsPayUdharModalOpen(false);
    setPayUdharAmount("");
  };

  // Delete Customer — shows exactly what would be destroyed, and steers the user towards
  // archiving whenever the customer carries payment history or an unpaid balance.
  const handleDeleteCustomer = (id: string, name: string) => {
    const impact = db.getCustomerDeletionImpact(id);
    if (!impact.exists) return;

    const linked: string[] = [];
    if (impact.orders) linked.push(`${impact.orders} order${impact.orders === 1 ? "" : "s"}`);
    if (impact.measurements) linked.push(`${impact.measurements} measurement slip${impact.measurements === 1 ? "" : "s"}`);
    if (impact.invoices) linked.push(`${impact.invoices} bill${impact.invoices === 1 ? "" : "s"}`);
    if (impact.appointments) linked.push(`${impact.appointments} appointment${impact.appointments === 1 ? "" : "s"}`);
    if (impact.trials) linked.push(`${impact.trials} trial${impact.trials === 1 ? "" : "s"}`);
    const linkedText = linked.length > 0 ? ` This also removes ${linked.join(", ")}.` : "";

    if (!impact.safeToDelete) {
      // Financial history present: offer archiving as the primary action.
      setConfirmModal({
        isOpen: true,
        title: "Archive Customer Instead?",
        message: `${impact.reason}\n\nArchiving hides ${name} from active lists and keeps every bill, payment and order exactly as it is.`,
        confirmLabel: "Archive Customer",
        cancelLabel: "Cancel",
        variant: "warning",
        onConfirm: () => {
          db.archiveCustomer(id);
          refreshDb();
          if (selectedCustomerId === id) setSelectedCustomerId(null);
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        },
        onCancel: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
      });
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: "Move Customer to Trash?",
      message: `Move ${name} to Trash?${linkedText} They will be moved to Trash and can be restored. Nothing is permanently deleted.`,
      confirmLabel: "Move to Trash",
      cancelLabel: "Cancel",
      variant: "danger",
      onConfirm: async () => {
        try {
          const res = await db.deleteCustomer(id);
          if (!res.success) throw new Error(res.error || "Could not move this customer to Trash.");
          refreshDb();
          if (selectedCustomerId === id) setSelectedCustomerId(null);
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
        } catch (err: any) {
          setConfirmModal({
            isOpen: true,
            title: "Customer Not Moved to Trash",
            message: err?.message || "This customer could not be deleted.",
            confirmLabel: "OK",
            variant: "warning",
            onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
          } as any);
        }
      },
      onCancel: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
    });
  };

  // Add Memory Note
  const handleAddMemoryNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemoryNoteText.trim() || !selectedCustomerId) return;
    
    db.addCustomerMemoryNote(selectedCustomerId, newMemoryNoteText, "Hardik Nagpal");
    setNewMemoryNoteText("");
    refreshDb();
  };

  // Delete Memory Note
  const handleDeleteMemoryNote = (timestamp: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Delete Sizing Note",
      message: "Are you sure you want to delete this memory timeline log record? Sizing notes from fittings cannot be restored.",
      confirmLabel: "Delete Note",
      cancelLabel: "Cancel",
      variant: "danger",
      onConfirm: () => {
        db.deleteCustomerMemoryNote(selectedCustomerId!, timestamp);
        refreshDb();
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      },
      onCancel: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
    });
  };

  // Filter & Sort list
  const filteredCustomers = customers.filter(c => {
    const matchesSearch = c.fullName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          c.mobileNumber.includes(searchQuery);
    const matchesBalance = hasBalanceFilter ? c.outstandingBalance > 0 : true;
    return matchesSearch && matchesBalance;
  }).sort((a, b) => {
    if (sortKey === "name") {
      return a.fullName.localeCompare(b.fullName);
    } else if (sortKey === "added") {
      return new Date(b.customerSince).getTime() - new Date(a.customerSince).getTime();
    } else if (sortKey === "spend") {
      // Calculate spent amount by adding up all paid amounts in invoices
      const getSpend = (custId: string) => {
        return db.getInvoicesForCustomer(custId).reduce((sum, inv) => sum + inv.advancePaid, 0);
      };
      return getSpend(b.id) - getSpend(a.id);
    }
    return 0;
  });

  // Calculate high value spend metrics
  const getSpendSummary = (custId: string) => {
    const invs = db.getInvoicesForCustomer(custId);
    const totalSpent = invs.reduce((sum, inv) => sum + (inv.grandTotal - inv.balanceDue), 0);
    const totalOrders = db.getOrdersForCustomer(custId).length;
    const avgOrderValue = totalOrders > 0 ? Math.round(totalSpent / totalOrders) : 0;
    return { totalSpent, avgOrderValue };
  };

  return (
    <div className="space-y-6">
      {!selectedCustomerId ? (
        // =====================================================================
        // CUSTOMER LIST VIEW
        // =====================================================================
        <div className="bg-white rounded-3xl border border-light shadow-sm p-6 space-y-6 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-serif text-navy font-bold">Showroom Customers</h1>
              <p className="text-muted-grey text-sm mt-0.5">Manage custom tailoring accounts and fit preferences</p>
            </div>
            <button 
              onClick={openAddModal}
              className="bg-navy hover:bg-navy-hover hover:border-gold/30 text-white font-semibold font-sans px-5 py-2.5 rounded-xl flex items-center gap-2 border border-navy/20 shadow-xs cursor-pointer text-sm self-start sm:self-auto transition-all"
            >
              <Plus className="w-4 h-4 text-gold" />
              Add New Customer
            </button>
          </div>

          {/* Filters & Search */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center bg-cream/30 p-4 rounded-2xl border border-light">
            <div className="md:col-span-6 relative">
              <Search className="w-4 h-4 text-muted-grey absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input 
                type="text" 
                placeholder="Search by full name or mobile..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white pl-10 pr-4 py-2 border border-light rounded-xl font-sans text-sm text-charcoal placeholder:text-muted-grey/60 focus:border-gold focus:ring-1 focus:ring-gold focus:outline-hidden"
              />
            </div>
            
            <div className="md:col-span-3 flex items-center gap-2.5">
              <input 
                type="checkbox" 
                id="balanceFilter" 
                checked={hasBalanceFilter}
                onChange={(e) => setHasBalanceFilter(e.target.checked)}
                className="w-4 h-4 text-gold border-light rounded-xs focus:ring-gold accent-gold"
              />
              <label htmlFor="balanceFilter" className="text-xs font-semibold font-sans text-charcoal select-none cursor-pointer">
                Has Outstanding Balance
              </label>
            </div>

            <div className="md:col-span-3 flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-muted-grey flex-shrink-0" />
              <select 
                value={sortKey} 
                onChange={(e: any) => setSortKey(e.target.value)}
                className="w-full bg-white px-3 py-2 border border-light rounded-xl font-sans text-xs font-semibold text-charcoal focus:outline-hidden focus:border-gold"
              >
                <option value="name">Sort: Name (A-Z)</option>
                <option value="added">Sort: Recently Added</option>
                <option value="spend">Sort: Highest Spend</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto border border-light rounded-2xl">
            {filteredCustomers.length === 0 ? (
              <div className="py-16 text-center space-y-3">
                <div className="inline-flex bg-cream p-4 rounded-full">
                  <User className="w-8 h-8 text-gold/60" />
                </div>
                <h3 className="font-serif font-bold text-navy text-lg">No customers found</h3>
                <p className="text-muted-grey text-xs max-w-xs mx-auto">Try refining your search text or clear filters to view tailoring records.</p>
                <button 
                  onClick={openAddModal} 
                  className="bg-cream hover:bg-cream/80 text-navy text-xs font-semibold px-4 py-2 rounded-xl border border-light transition-colors mt-2"
                >
                  Add First Customer
                </button>
              </div>
            ) : (
              <table className="w-full text-left font-sans text-xs border-collapse">
                <thead>
                  <tr className="bg-cream/40 text-navy font-bold border-b border-light">
                    <th className="p-4">Customer Details</th>
                    <th className="p-4">Mobile Number</th>
                    <th className="p-4">Customer Since</th>
                    <th className="p-4 text-center">Orders</th>
                    <th className="p-4 text-right">Outstanding Balance</th>
                    <th className="p-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-light text-charcoal">
                  {filteredCustomers.map((cust) => {
                    const initials = cust.fullName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
                    return (
                      <tr key={cust.id} className="hover:bg-cream/15 group transition-colors">
                        <td className="p-4 flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full overflow-hidden bg-navy/5 text-navy font-bold font-sans text-xs flex items-center justify-center border border-navy/5">
                            {cust.photoUrl ? (
                              <img src={cust.photoUrl} alt={cust.fullName} className="w-full h-full object-cover" />
                            ) : (
                              initials
                            )}
                          </div>
                          <div className="space-y-0.5">
                            <span 
                              onClick={() => setSelectedCustomerId(cust.id)}
                              className="font-semibold text-charcoal hover:text-gold cursor-pointer text-sm block font-serif"
                            >
                              {cust.fullName}
                            </span>
                            <div className="flex gap-1">
                              {cust.preferenceTags.slice(0, 2).map((tag, i) => (
                                <span key={i} className="px-1.5 py-0.2 bg-gold/5 border border-gold/15 text-gold text-[9px] font-semibold rounded-xs">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </div>
                        </td>
                        <td className="p-4 font-mono font-medium">{cust.mobileNumber}</td>
                        <td className="p-4 text-muted-grey">
                          {new Date(cust.customerSince).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric"
                          })}
                        </td>
                        <td className="p-4 text-center font-semibold text-navy">{cust.totalOrdersCount}</td>
                        <td className="p-4 text-right font-mono font-bold">
                          {cust.outstandingBalance > 0 ? (
                            <span className="text-red-600 bg-red-50 border border-red-100 px-2.5 py-0.5 rounded-full">
                              ₹{cust.outstandingBalance.toLocaleString("en-IN")}
                            </span>
                          ) : (
                            <span className="text-green-700 bg-green-50 border border-green-100 px-2.5 py-0.5 rounded-full">
                              ₹0
                            </span>
                          )}
                        </td>
                        <td className="p-4">
                          <div className="flex items-center justify-center gap-2">
                            <button 
                              onClick={() => setSelectedCustomerId(cust.id)}
                              title="View Customer 360 profile"
                              className="p-1.5 hover:bg-cream text-navy rounded-lg transition-colors cursor-pointer"
                            >
                              <Eye className="w-4 h-4 text-navy" />
                            </button>
                            <button 
                              onClick={() => openEditModal(cust)}
                              title="Edit Customer"
                              className="p-1.5 hover:bg-cream text-charcoal rounded-lg transition-colors cursor-pointer"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => handleDeleteCustomer(cust.id, cust.fullName)}
                              title="Delete Customer"
                              className="p-1.5 hover:bg-red-50 text-red-600 rounded-lg transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : (
        // =====================================================================
        // CUSTOMER 360 PROFILE VIEW
        // =====================================================================
        <div className="space-y-6 animate-fade-in">
          {/* Back Navigation Bar */}
          <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-light shadow-xs">
            <button 
              onClick={() => setSelectedCustomerId(null)}
              className="flex items-center gap-2 font-semibold font-sans text-xs text-navy hover:text-gold transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Customers List
            </button>
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setIsQrCardOpen(true)}
                className="bg-cream hover:bg-cream/80 text-navy font-semibold font-sans px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 border border-light transition-all"
              >
                <QrCode className="w-4 h-4 text-gold" />
                Customer QR Card
              </button>
              <button 
                onClick={() => onNavigateToMeasurement(selectedCustomer!.id)}
                className="bg-gold/10 hover:bg-gold/20 text-navy font-semibold font-sans px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 border border-gold/20 transition-all"
              >
                <Ruler className="w-4 h-4 text-gold" />
                New Measurement
              </button>
              <button 
                onClick={() => onNavigateToOrder(selectedCustomer!.id)}
                className="bg-navy hover:bg-navy-hover text-white font-semibold font-sans px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-all"
              >
                <Plus className="w-4 h-4 text-gold" />
                Place Order
              </button>
            </div>
          </div>

          {/* Profile Header Block */}
          <div className="bg-white rounded-3xl border border-light shadow-sm p-6 grid grid-cols-1 md:grid-cols-12 gap-6 relative overflow-hidden">
            {/* Background flourish */}
            <div className="absolute top-0 right-0 w-40 h-40 bg-gold/5 rounded-full blur-2xl -mr-12 -mt-12 pointer-events-none" />
            
            {/* Profile Avatar & Primary Details */}
            <div className="md:col-span-8 flex flex-col sm:flex-row items-start sm:items-center gap-5">
              <label className="relative w-16 h-16 rounded-2xl overflow-hidden bg-navy text-gold text-2xl font-serif font-bold flex items-center justify-center border border-gold/20 shadow-xs cursor-pointer group hover:border-gold transition-all shrink-0" title="Click to change customer profile photo">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleDirectCustomerPhotoChange}
                  className="hidden"
                />
                {selectedCustomer!.photoUrl ? (
                  <img src={selectedCustomer!.photoUrl} alt={selectedCustomer!.fullName} className="w-full h-full object-cover" />
                ) : (
                  selectedCustomer!.fullName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()
                )}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <Camera className="w-5 h-5 text-white" />
                </div>
              </label>
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-2xl font-serif font-bold text-navy">{selectedCustomer!.fullName}</h2>
                  {selectedCustomer!.outstandingBalance > 0 && (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                      Balance Due: ₹{selectedCustomer!.outstandingBalance.toLocaleString("en-IN")}
                    </span>
                  )}
                </div>
                
                {/* Contact grid */}
                <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted-grey">
                  <span className="flex items-center gap-1.5 font-mono">
                    <Phone className="w-3.5 h-3.5 text-gold" />
                    {selectedCustomer!.mobileNumber}
                  </span>
                  {selectedCustomer!.email && (
                    <span className="flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-gold" />
                      {selectedCustomer!.email}
                    </span>
                  )}
                  {selectedCustomer!.address && (
                    <span className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-gold" />
                      {selectedCustomer!.address}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Quick stats panel */}
            <div className="md:col-span-4 bg-cream/40 rounded-2xl border border-light p-4 grid grid-cols-2 gap-4 text-center self-center">
              <div>
                <p className="text-[10px] font-semibold text-muted-grey uppercase tracking-wider">Total Orders</p>
                <p className="text-lg font-bold text-navy mt-0.5">{customerOrders.length}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-muted-grey uppercase tracking-wider">Total Spend</p>
                <p className="text-lg font-bold text-green-700 mt-0.5">₹{getSpendSummary(selectedCustomer!.id).totalSpent.toLocaleString("en-IN")}</p>
              </div>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex border-b border-light overflow-x-auto whitespace-nowrap scrollbar-none font-sans text-xs">
            {(["overview", "measurements", "orders", "trials", "billing", "memory"] as const).map((tab) => (
              <button 
                key={tab}
                onClick={() => setProfileTab(tab)}
                className={`py-3 px-5 font-semibold capitalize border-b-2 transition-all cursor-pointer ${
                  profileTab === tab 
                    ? "border-gold text-navy bg-white" 
                    : "border-transparent text-muted-grey hover:text-navy hover:bg-cream/10"
                }`}
              >
                {tab === "memory" ? "🧠 Memory Notes" : tab}
              </button>
            ))}
          </div>

          {/* Tab Content Panels */}
          <div className="bg-white rounded-3xl border border-light shadow-sm p-6 min-h-[400px]">
            
            {/* OVERVIEW TAB */}
            {profileTab === "overview" && (
              <div className="space-y-6 animate-fade-in">
                {/* Udhar & Credit Ledger Banner */}
                <div className="bg-cream/25 rounded-2xl border border-gold/30 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-light pb-2.5">
                    <div>
                      <h3 className="text-sm font-bold text-navy uppercase tracking-wider flex items-center gap-2">
                        <Receipt className="w-4 h-4 text-gold" /> Udhar & Credit Ledger Account
                      </h3>
                      <p className="text-xs text-muted-grey">Manage customer's due balance, opening Udhar, and payments</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        type="button"
                        onClick={() => setIsAddUdharModalOpen(true)}
                        className="bg-white hover:bg-cream text-navy font-bold text-xs px-3 py-2 rounded-xl border border-light shadow-2xs flex items-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5 text-gold" /> Purana Udhar Add Karein
                      </button>
                      {selectedCustomer!.outstandingBalance > 0 && (
                        <button 
                          type="button"
                          onClick={() => setIsPayUdharModalOpen(true)}
                          className="bg-navy hover:bg-navy-hover text-white font-bold text-xs px-3.5 py-2 rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer transition-colors"
                        >
                          <Receipt className="w-3.5 h-3.5 text-gold" /> Udhar Jama Karein (Receive Payment)
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                    <div className="bg-white p-3 rounded-xl border border-light">
                      <p className="text-[10px] font-semibold text-muted-grey uppercase">Kul Udhar (Outstanding Due)</p>
                      <p className={`text-xl font-bold font-mono mt-0.5 ${selectedCustomer!.outstandingBalance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                        ₹{selectedCustomer!.outstandingBalance.toLocaleString("en-IN")}
                      </p>
                    </div>
                    <div className="bg-white p-3 rounded-xl border border-light">
                      <p className="text-[10px] font-semibold text-muted-grey uppercase">Total Billed Amount</p>
                      <p className="text-xl font-bold font-mono text-navy mt-0.5">
                        ₹{customerInvoices.reduce((sum, inv) => sum + inv.grandTotal, 0).toLocaleString("en-IN")}
                      </p>
                    </div>
                    <div className="bg-white p-3 rounded-xl border border-light">
                      <p className="text-[10px] font-semibold text-muted-grey uppercase">Total Jama (Paid Deposit)</p>
                      <p className="text-xl font-bold font-mono text-emerald-700 mt-0.5">
                        ₹{customerInvoices.reduce((sum, inv) => sum + inv.advancePaid, 0).toLocaleString("en-IN")}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Preferences section */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold text-navy uppercase tracking-wider flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-gold" />
                      Auto-Learned Preference Tags
                    </h3>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {selectedCustomer!.preferenceTags.length === 0 ? (
                        <p className="text-xs text-muted-grey italic">No preferences registered yet.</p>
                      ) : (
                        selectedCustomer!.preferenceTags.map((tag, i) => (
                          <span key={i} className="bg-cream border border-gold/25 text-navy px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-2xs">
                            <span className="w-1.5 h-1.5 bg-gold rounded-full" />
                            {tag}
                          </span>
                        ))
                      )}
                    </div>

                    <div className="border border-light rounded-2xl p-4 bg-cream/20 space-y-3 mt-4">
                      <h4 className="text-xs font-bold text-navy uppercase tracking-wider">Showroom Handbooks</h4>
                      <div className="grid grid-cols-2 gap-4 text-xs">
                        <div>
                          <p className="text-muted-grey font-medium">Preferred Fabric Brands:</p>
                          <p className="font-bold text-charcoal mt-0.5">
                            {selectedCustomer!.preferredFabricBrands.length > 0 
                              ? selectedCustomer!.preferredFabricBrands.join(", ") 
                              : "None recorded"}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-grey font-medium">Average Order Value:</p>
                          <p className="font-bold text-charcoal mt-0.5">₹{getSpendSummary(selectedCustomer!.id).avgOrderValue.toLocaleString("en-IN")}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* General remarks section */}
                  <div className="space-y-4 border-l border-light pl-0 md:pl-6">
                    <h3 className="text-sm font-bold text-navy uppercase tracking-wider">General Showroom Notes</h3>
                    <div className="bg-cream/15 p-4 rounded-2xl border border-light text-xs leading-relaxed text-charcoal min-h-[140px] whitespace-pre-line">
                      {stripEmbeddedTags(selectedCustomer!.generalNotes) || "No specific general notes entered for this customer. Tap 'Edit Customer' to add notes."}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* MEASUREMENT HISTORY TAB */}
            {profileTab === "measurements" && (
              <div className="space-y-6 animate-fade-in">
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-light pb-4">
                  <div>
                    <h3 className="text-base font-serif font-bold text-navy">Measurement Versions</h3>
                    <p className="text-muted-grey text-xs mt-0.5">Chronological size snapshots from cutting master log</p>
                  </div>
                  
                  {customerMeasurements.length >= 2 && (
                    <button 
                      onClick={() => setIsComparing(!isComparing)}
                      className={`font-semibold font-sans px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 border transition-all cursor-pointer ${
                        isComparing 
                          ? "bg-gold text-white border-gold shadow-sm" 
                          : "bg-cream text-navy border-light hover:bg-cream/80"
                      }`}
                    >
                      <ArrowLeftRight className="w-3.5 h-3.5" />
                      Compare Versions
                    </button>
                  )}
                </div>

                {isComparing && customerMeasurements.length >= 2 ? (
                  // COMPARE MODE
                  <div className="space-y-4 animate-fade-in">
                    <div className="flex flex-wrap items-center gap-3 bg-cream/40 p-3 rounded-xl border border-light text-xs font-semibold">
                      <span className="text-navy">Compare version:</span>
                      <select 
                        value={compareVersion1} 
                        onChange={(e) => setCompareVersion1(e.target.value)}
                        className="bg-white px-2.5 py-1 border border-light rounded-lg font-sans text-xs font-medium"
                      >
                        {customerMeasurements.map(m => (
                          <option key={m.id} value={m.id}>
                            {new Date(m.versionDate).toLocaleDateString("en-IN")} ({m.slipNumber})
                          </option>
                        ))}
                      </select>
                      <span className="text-muted-grey">with:</span>
                      <select 
                        value={compareVersion2} 
                        onChange={(e) => setCompareVersion2(e.target.value)}
                        className="bg-white px-2.5 py-1 border border-light rounded-lg font-sans text-xs font-medium"
                      >
                        {customerMeasurements.map(m => (
                          <option key={m.id} value={m.id}>
                            {new Date(m.versionDate).toLocaleDateString("en-IN")} ({m.slipNumber})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Compare Display */}
                    <MeasurementCompareDisplay 
                      measurements={customerMeasurements} 
                      compareVersion1={compareVersion1} 
                      compareVersion2={compareVersion2} 
                    />

                  </div>
                ) : (
                  // TIMELINE VIEW
                  <div className="space-y-6">
                    {customerMeasurements.length === 0 ? (
                      <div className="text-center py-10 space-y-2">
                        <Ruler className="w-8 h-8 text-muted-grey/40 mx-auto" />
                        <p className="text-xs text-muted-grey">No sizes recorded for this customer yet.</p>
                        <button 
                          onClick={() => onNavigateToMeasurement(selectedCustomer!.id)}
                          className="bg-cream text-navy font-semibold font-sans px-4 py-2 rounded-xl text-xs border border-light mt-2"
                        >
                          Record First Sizes
                        </button>
                      </div>
                    ) : (
                      customerMeasurements.map((m) => {
                        return (
                          <div key={m.id} className="border border-light rounded-2xl p-5 space-y-4 hover:border-gold/30 hover:shadow-xs transition-all bg-cream/10">
                            <div className="flex justify-between items-start border-b border-light/60 pb-3">
                              <div className="space-y-1">
                                <span className="text-xs font-bold text-navy bg-cream border border-gold/15 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                                  {m.slipNumber}
                                </span>
                                {(m.coatIndoWestern?.serialNumber || m.pent?.serialNumber || m.vest?.serialNumber || m.shirtKurta?.serialNumber) && (
                                  <span className="text-xs font-bold text-green-700 bg-green-50 border border-green-200 px-2.5 py-0.5 rounded-full ml-2">
                                    Serial: {m.coatIndoWestern?.serialNumber || m.pent?.serialNumber || m.vest?.serialNumber || m.shirtKurta?.serialNumber}
                                  </span>
                                )}
                                <span className="text-xs text-muted-grey ml-3">
                                  Recorded on: {new Date(m.versionDate).toLocaleDateString("en-IN", {
                                    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
                                  })}
                                </span>
                              </div>
                              <div className="flex gap-2">
                                <button 
                                  onClick={() => onNavigateToMeasurement(selectedCustomer!.id, m.id)}
                                  className="text-[11px] font-semibold text-navy hover:text-gold bg-white px-2.5 py-1 rounded-lg border border-light shadow-2xs transition-colors cursor-pointer"
                                >
                                  Use/Copy Sizes
                                </button>
                              </div>
                            </div>

                            {/* Changes since previous version badge display */}
                            {m.changesSincePrevious && m.changesSincePrevious.length > 0 && (
                              <div className="bg-gold/5 border border-gold/15 rounded-xl p-3 space-y-1">
                                <h4 className="text-[10px] font-bold text-navy uppercase tracking-wider flex items-center gap-1.5 font-sans">
                                  <Sparkles className="w-3 h-3 text-gold" />
                                  Changes detected in this version:
                                </h4>
                                <div className="flex flex-wrap gap-2 pt-1">
                                  {m.changesSincePrevious.map((c, idx) => (
                                    <span key={idx} className="bg-white border border-light px-2 py-0.5 rounded-md text-[10px] font-semibold text-charcoal shadow-2xs">
                                      {c.garment} &bull; <span className="capitalize">{c.field}</span>: <span className="line-through text-muted-grey font-mono">{c.oldValue}"</span> &rarr; <span className="text-green-700 font-bold font-mono">{c.newValue}"</span> ({c.change}")
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Sizes Table display summary */}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs font-sans">
                              {/* Coat brief */}
                              <div className="bg-white p-3 rounded-xl border border-light/60 space-y-1">
                                <p className="font-bold text-navy border-b border-light pb-1 uppercase tracking-wider text-[10px]">Coat/Indo Western</p>
                                <div className="grid grid-cols-2 gap-x-2 gap-y-1 font-mono text-[11px] pt-1 text-charcoal">
                                  <div>Len: <b>{m.coatIndoWestern.length}"</b></div>
                                  <div>Chest: <b>{m.coatIndoWestern.chest}"</b></div>
                                  <div>Waist: <b>{m.coatIndoWestern.waist}"</b></div>
                                  <div>Arm: <b>{m.coatIndoWestern.arms}"</b></div>
                                </div>
                              </div>

                              {/* Pent brief */}
                              <div className="bg-white p-3 rounded-xl border border-light/60 space-y-1">
                                <p className="font-bold text-navy border-b border-light pb-1 uppercase tracking-wider text-[10px]">Pent</p>
                                <div className="grid grid-cols-2 gap-x-2 gap-y-1 font-mono text-[11px] pt-1 text-charcoal">
                                  {PANT_MEASUREMENT_FIELDS.map(f => {
                                    const value = (normalizePantMeasurement(m.pent) as any)[f.key];
                                    return <div key={f.key}>{f.label}: <b>{value || "-"}</b></div>;
                                  })}
                                </div>
                              </div>

                              {/* Vest brief */}
                              <div className="bg-white p-3 rounded-xl border border-light/60 space-y-1">
                                <p className="font-bold text-navy border-b border-light pb-1 uppercase tracking-wider text-[10px]">Vest</p>
                                <div className="grid grid-cols-2 gap-x-2 gap-y-1 font-mono text-[11px] pt-1 text-charcoal">
                                  <div>Len: <b>{m.vest.length}"</b></div>
                                  <div>Chest: <b>{m.vest.chest}"</b></div>
                                  <div>Waist: <b>{m.vest.waist}"</b></div>
                                  <div>Hip: <b>{m.vest.hip}"</b></div>
                                </div>
                              </div>

                              {/* Shirt brief */}
                              <div className="bg-white p-3 rounded-xl border border-light/60 space-y-1">
                                <p className="font-bold text-navy border-b border-light pb-1 uppercase tracking-wider text-[10px]">Shirt/Kurta</p>
                                <div className="grid grid-cols-2 gap-x-2 gap-y-1 font-mono text-[11px] pt-1 text-charcoal">
                                  <div>Len: <b>{m.shirtKurta.length}"</b></div>
                                  <div>Chest: <b>{m.shirtKurta.chest}"</b></div>
                                  <div>Waist: <b>{m.shirtKurta.waist}"</b></div>
                                  <div>Neck: <b>{m.shirtKurta.neck}"</b></div>
                                </div>
                              </div>
                            </div>

                            {/* Extra design choices */}
                            <div className="grid grid-cols-2 gap-4 text-xs border-t border-light/60 pt-2 text-charcoal">
                              <div><b>Fabric:</b> {m.fabricSelected || "Not specified"}</div>
                              <div><b>Lining:</b> {m.liningChoice || "Not specified"}</div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ORDERS TAB */}
            {profileTab === "orders" && (
              <div className="space-y-6 animate-fade-in">
                <h3 className="text-base font-serif font-bold text-navy border-b border-light pb-3">Active & Past Orders</h3>
                
                {customerOrders.length === 0 ? (
                  <p className="text-xs text-muted-grey text-center py-10">No orders registered for this customer yet.</p>
                ) : (
                  <div className="space-y-6 font-sans text-xs text-charcoal">
                    {customerOrders.map((ord) => {
                      const inv = customerInvoices.find(i => i.id === ord.linkedInvoiceId);
                      return (
                        <div key={ord.id} className="border border-light rounded-2xl p-5 space-y-4 shadow-3xs bg-white">
                          <div className="flex flex-wrap justify-between items-center gap-3 border-b border-light pb-3">
                            <div className="space-y-1">
                              <h4 className="text-sm font-bold text-navy font-serif">
                                Order {ord.orderNumber}
                              </h4>
                              <p className="text-[10px] text-muted-grey">
                                Ordered: {new Date(ord.orderDate).toLocaleDateString("en-IN")} &bull; Target Delivery: {new Date(ord.expectedDeliveryDate).toLocaleDateString("en-IN")}
                              </p>
                            </div>

                            {/* Status Pill & Actions */}
                            <div className="flex items-center gap-2">
                              <span className={`px-3 py-1 rounded-full font-bold text-[10px] uppercase border ${
                                ord.status === "Delivered" 
                                  ? "bg-green-50 border-green-200 text-green-700" 
                                  : ord.status === "Ready"
                                  ? "bg-blue-50 border-blue-200 text-blue-700"
                                  : ord.status === "Trial Scheduled"
                                  ? "bg-purple-50 border-purple-200 text-purple-700"
                                  : "bg-amber-50 border-amber-200 text-amber-700"
                              }`}>
                                {ord.status}
                              </span>
                              <button
                                onClick={() => setEditingOrderId(ord.id)}
                                title="Edit Order & Financial Ledger"
                                className="bg-navy/10 hover:bg-navy text-navy hover:text-white font-semibold px-2.5 py-1 rounded-lg border border-navy/20 flex items-center gap-1 text-[11px] transition-colors cursor-pointer"
                              >
                                <Edit className="w-3.5 h-3.5" />
                                Edit
                              </button>
                            </div>
                          </div>

                          {/* Garment Details & Pricing */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <div>
                                <span className="text-muted-grey block">Items:</span>
                                <div className="flex gap-2.5 mt-1">
                                  {ord.garmentTypes.map((t, i) => (
                                    <span key={i} className="px-2.5 py-1 bg-cream border border-light font-semibold text-charcoal rounded-lg">
                                      {t}
                                    </span>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <span className="text-muted-grey block">Fabric Details:</span>
                                <span className="font-semibold block mt-0.5">{ord.fabricDetails || "Raymond Classic"}</span>
                              </div>
                            </div>

                            {/* Invoice Link */}
                            <div className="bg-cream/15 p-3.5 rounded-xl border border-light space-y-1.5 self-center">
                              <div className="flex justify-between font-semibold">
                                <span className="text-muted-grey">Invoice status:</span>
                                <span className={`px-2 py-0.5 rounded-full font-bold text-[9px] ${
                                  inv?.paymentStatus === "Paid" 
                                    ? "bg-green-100 text-green-800" 
                                    : inv?.paymentStatus === "Partially Paid"
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-red-100 text-red-800"
                                }`}>
                                  {inv?.paymentStatus || "Unbilled"}
                                </span>
                              </div>
                              <div className="flex justify-between font-mono font-bold text-navy text-xs border-t border-light pt-1.5">
                                <span>Grand Total:</span>
                                <span>₹{inv?.grandTotal?.toLocaleString() || "0"}</span>
                              </div>
                              <div className="flex justify-between font-mono font-bold text-red-600 text-xs">
                                <span>Outstanding:</span>
                                <span>₹{inv?.balanceDue?.toLocaleString() || "0"}</span>
                              </div>
                            </div>
                          </div>

                          {/* Status Stepper visualization */}
                          <div className="border-t border-light/60 pt-4 mt-2">
                            <h5 className="text-[10px] font-bold text-muted-grey uppercase tracking-wider mb-3">Order Production Pipeline</h5>
                            <div className="grid grid-cols-6 gap-1 text-center font-semibold text-[10px]">
                              {(["Pending", "In Cutting", "Stitching", "Trial Scheduled", "Ready", "Delivered"] as const).map((stage, idx) => {
                                const currentIdx = ["Pending", "In Cutting", "Stitching", "Trial Scheduled", "Ready", "Delivered"].indexOf(ord.status);
                                const isCompleted = idx <= currentIdx;
                                const isActive = stage === ord.status;

                                return (
                                  <div key={stage} className="space-y-1 flex flex-col items-center">
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold font-sans border text-[10px] ${
                                      isActive 
                                        ? "bg-navy text-gold border-gold scale-110" 
                                        : isCompleted 
                                        ? "bg-green-50 border-green-500 text-green-700" 
                                        : "bg-white border-light text-muted-grey"
                                    }`}>
                                      {isCompleted && !isActive ? "✓" : idx + 1}
                                    </div>
                                    <span className={isActive ? "text-navy font-bold" : "text-muted-grey"}>{stage}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TRIALS & ALTERATIONS TAB */}
            {profileTab === "trials" && (
              <div className="space-y-6 animate-fade-in">
                <h3 className="text-base font-serif font-bold text-navy border-b border-light pb-3">Trials & Fittings History</h3>
                
                {customerTrials.length === 0 && customerAlterations.length === 0 ? (
                  <p className="text-xs text-muted-grey text-center py-10">No trial fittings or alteration requests logged yet.</p>
                ) : (
                  <div className="space-y-5 font-sans text-xs text-charcoal">
                    {/* Combine Trials and Alterations in a chronological feed */}
                    {(() => {
                      const events: {
                        type: "trial" | "alteration";
                        date: string;
                        title: string;
                        desc: string;
                        details?: string;
                        notes?: string;
                        staff: string;
                        highlight?: boolean;
                      }[] = [];

                      customerTrials.forEach(t => {
                        events.push({
                          type: "trial",
                          date: t.trialDate,
                          title: "Fitting Trial Fitting",
                          desc: t.feedback,
                          staff: t.conductedBy,
                          highlight: t.alterationRequired
                        });
                      });

                      customerAlterations.forEach(a => {
                        events.push({
                          type: "alteration",
                          date: a.alterationDate,
                          title: "Fabric Alteration Logged",
                          desc: a.description,
                          details: a.beforeNotes,
                          notes: a.afterNotes,
                          staff: a.handledBy,
                          highlight: true
                        });
                      });

                      const sortedEvents = events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                      return sortedEvents.map((ev, index) => (
                        <div key={index} className={`border rounded-2xl p-4.5 space-y-2 relative overflow-hidden transition-all hover:shadow-xs ${
                          ev.type === "alteration" 
                            ? "bg-rose-50/20 border-rose-100" 
                            : ev.highlight 
                            ? "bg-amber-50/25 border-amber-100" 
                            : "bg-cream/10 border-light"
                        }`}>
                          <div className="flex justify-between items-start gap-3">
                            <div className="space-y-0.5">
                              <h4 className={`font-serif font-bold text-sm ${ev.type === "alteration" ? "text-rose-900" : "text-navy"}`}>
                                {ev.title}
                              </h4>
                              <p className="text-[10px] text-muted-grey">
                                Date: {new Date(ev.date).toLocaleDateString("en-IN", {
                                  day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
                                })} &bull; Conducted by: {ev.staff}
                              </p>
                            </div>
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                              ev.type === "alteration" 
                                ? "bg-rose-100 text-rose-800" 
                                : ev.highlight 
                                ? "bg-amber-100 text-amber-800" 
                                : "bg-green-100 text-green-800"
                            }`}>
                              {ev.type === "alteration" ? "Alteration" : ev.highlight ? "Alteration Required" : "Fitting Perfect"}
                            </span>
                          </div>

                          <p className="text-charcoal leading-relaxed text-xs">{ev.desc}</p>
                          
                          {ev.details && (
                            <div className="text-[11px] bg-white p-2.5 rounded-xl border border-light mt-2 text-rose-950 font-sans">
                              <b>Before alteration note:</b> {ev.details}
                            </div>
                          )}
                          {ev.notes && (
                            <div className="text-[11px] bg-green-50/35 p-2.5 rounded-xl border border-green-100 mt-1 text-green-950 font-sans">
                              <b>After adjustment confirmation:</b> {ev.notes}
                            </div>
                          )}
                        </div>
                      ));
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* BILLING & INVOICES TAB */}
            {profileTab === "billing" && (
              <div className="space-y-6 animate-fade-in">
                <h3 className="text-base font-serif font-bold text-navy border-b border-light pb-3">Invoice & Payment History</h3>
                
                {customerInvoices.length === 0 ? (
                  <p className="text-xs text-muted-grey text-center py-10">No invoices billed for this customer yet.</p>
                ) : (
                  <div className="space-y-4 font-sans text-xs">
                    {customerInvoices.map((inv) => (
                      <div key={inv.id} className="border border-light rounded-2xl p-4.5 space-y-3 shadow-3xs hover:border-gold/30 transition-all bg-white">
                        <div className="flex justify-between items-center gap-2 border-b border-light pb-2">
                          <div className="space-y-0.5">
                            <span className="font-bold text-navy font-serif text-sm block">
                              Invoice {inv.invoiceNumber}
                            </span>
                            <span className="text-[10px] text-muted-grey">
                              Billed: {new Date(inv.invoiceDate).toLocaleDateString("en-IN")}
                            </span>
                          </div>
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            inv.paymentStatus === "Paid" 
                              ? "bg-green-100 text-green-800" 
                              : inv.paymentStatus === "Partially Paid" 
                              ? "bg-amber-100 text-amber-800" 
                              : "bg-red-100 text-red-800"
                          }`}>
                            {inv.paymentStatus}
                          </span>
                        </div>

                        {/* Items listed */}
                        <div className="space-y-1.5 pt-1 text-[11px]">
                          {inv.lineItems.map((item, idx) => (
                            <div key={idx} className="flex justify-between text-charcoal">
                              <span>{item.description} (x{item.quantity})</span>
                              <span className="font-mono">₹{item.amount.toLocaleString()}</span>
                            </div>
                          ))}
                        </div>

                        {/* Calculations summary */}
                        <div className="border-t border-light/60 pt-3 flex justify-between items-center text-xs">
                          <div className="flex gap-4 text-charcoal">
                            <div>Total Paid: <b className="font-mono text-green-700">₹{inv.advancePaid.toLocaleString()}</b></div>
                            <div>Outstanding: <b className="font-mono text-rose-600">₹{inv.balanceDue.toLocaleString()}</b></div>
                          </div>
                          <div className="font-mono text-sm font-bold text-navy">
                            Grand Total: ₹{inv.grandTotal.toLocaleString()}
                          </div>
                        </div>

                        {/* Display payments history list */}
                        {inv.payments && inv.payments.length > 0 && (
                          <div className="bg-cream/15 rounded-xl p-3 border border-light mt-2 text-[10px] space-y-1.5">
                            <span className="font-bold text-navy uppercase tracking-wider block text-[9px]">Payments Transactions Log:</span>
                            {inv.payments.map((p, idx) => (
                              <div key={idx} className="flex justify-between text-muted-grey border-b border-light/20 last:border-0 pb-1 last:pb-0 font-mono">
                                <span>{new Date(p.date).toLocaleDateString()} &bull; {p.mode}</span>
                                <span className="font-bold text-green-800">+ ₹{p.amount.toLocaleString()}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* MEMORY NOTES TAB */}
            {profileTab === "memory" && (
              <div className="space-y-6 animate-fade-in">
                <div>
                  <h3 className="text-base font-serif font-bold text-navy">🧠 Flagship Memory Timeline Logs</h3>
                  <p className="text-muted-grey text-xs mt-0.5">Chronological, un-editable (except by admin) staff notes of specific fitting quirks & habits</p>
                </div>

                {/* Add Note Form */}
                <form onSubmit={handleAddMemoryNote} className="flex gap-3 bg-cream/30 p-4.5 rounded-2xl border border-light">
                  <input 
                    type="text" 
                    placeholder="Enter fitting quirk (e.g., 'Likes tight waistband, prefers double venting on jacket')"
                    value={newMemoryNoteText}
                    onChange={(e) => setNewMemoryNoteText(e.target.value)}
                    className="flex-1 bg-white px-3.5 py-2.5 border border-light rounded-xl font-sans text-xs text-charcoal focus:border-gold focus:outline-hidden"
                  />
                  <button 
                    type="submit"
                    className="bg-navy hover:bg-navy-hover text-white px-5 py-2.5 rounded-xl font-sans font-semibold text-xs flex-shrink-0 transition-all cursor-pointer"
                  >
                    Add Note
                  </button>
                </form>

                {/* Notes List */}
                <div className="space-y-4">
                  {selectedCustomer!.memoryNotes.length === 0 ? (
                    <div className="text-center py-12 text-muted-grey italic text-xs">
                      No memory logs added yet. Add important sizing/collar/habit instructions above!
                    </div>
                  ) : (
                    selectedCustomer!.memoryNotes.map((note) => (
                      <div key={note.timestamp} className="bg-cream/15 border border-light rounded-2xl p-4.5 space-y-2 hover:border-gold/20 transition-all relative group">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2 text-[10px] text-muted-grey">
                            <span className="font-semibold text-navy flex items-center gap-1">
                              <UserCheck className="w-3 h-3 text-gold" />
                              {note.addedBy}
                            </span>
                            <span>&bull;</span>
                            <span>
                              {new Date(note.timestamp).toLocaleDateString("en-IN", {
                                day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
                              })}
                            </span>
                          </div>
                          
                          <button 
                            onClick={() => handleDeleteMemoryNote(note.timestamp)}
                            className="text-rose-600 opacity-0 group-hover:opacity-100 hover:bg-rose-50 p-1 rounded-lg transition-all cursor-pointer"
                            title="Delete memory record"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <p className="text-charcoal text-xs leading-relaxed font-medium">{note.note}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* =====================================================================
          ADD/EDIT CUSTOMER MODAL
      ===================================================================== */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-fade-in font-sans">
          <div className="bg-white rounded-3xl border border-light max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl p-6 space-y-6 animate-scale-up">
            <div className="flex justify-between items-center border-b border-light pb-4">
              <h3 className="text-lg font-serif font-bold text-navy">
                {isEditMode ? "Edit Tailoring Profile" : "Create Tailoring Customer"}
              </h3>
              <button 
                onClick={() => setIsAddModalOpen(false)}
                className="text-muted-grey hover:text-navy hover:bg-cream/50 p-1.5 rounded-lg transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveCustomer} className="space-y-5 text-xs text-charcoal">
              {/* Main rows */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="font-semibold text-navy">Full Name <span className="text-red-600">*</span></label>
                  <input 
                    type="text" 
                    required
                    placeholder="E.g. Ramandeep Singh"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full bg-white px-3 py-2 border border-light rounded-lg focus:outline-hidden focus:border-gold"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="font-semibold text-navy">Mobile Number (10 digits) <span className="text-red-600">*</span></label>
                  <input 
                    type="text" 
                    required
                    placeholder="E.g. 9876543210"
                    value={formMobile}
                    onChange={(e) => setFormMobile(e.target.value)}
                    className="w-full bg-white px-3 py-2 border border-light rounded-lg focus:outline-hidden focus:border-gold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="font-semibold text-navy">Alternate Mobile Number (Optional)</label>
                  <input 
                    type="text" 
                    placeholder="E.g. 9569681900"
                    value={formAlternate}
                    onChange={(e) => setFormAlternate(e.target.value)}
                    className="w-full bg-white px-3 py-2 border border-light rounded-lg focus:outline-hidden focus:border-gold"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="font-semibold text-navy">Email Address (Optional)</label>
                  <input 
                    type="email" 
                    placeholder="E.g. raman@gmail.com"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className="w-full bg-white px-3 py-2 border border-light rounded-lg focus:outline-hidden focus:border-gold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="font-semibold text-navy">Date of Birth (Optional)</label>
                  <input 
                    type="date" 
                    value={formDob}
                    onChange={(e) => setFormDob(e.target.value)}
                    className="w-full bg-white px-3 py-2 border border-light rounded-lg focus:outline-hidden focus:border-gold"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="font-semibold text-navy">Preferred Fabric Brands (Comma separated)</label>
                  <input 
                    type="text" 
                    placeholder="E.g. Raymond, Siyaram's, Loro Piana"
                    value={formFabric}
                    onChange={(e) => setFormFabric(e.target.value)}
                    className="w-full bg-white px-3 py-2 border border-light rounded-lg focus:outline-hidden focus:border-gold"
                  />
                </div>
              </div>

              {!isEditMode && (
                <div className="bg-amber-50/50 p-3.5 rounded-2xl border border-amber-200/80 space-y-1.5">
                  <label className="font-bold text-amber-900 flex items-center justify-between">
                    <span>Purana Udhar / Opening Balance (₹)</span>
                    <span className="text-[10px] text-amber-700 font-normal">Optional initial balance</span>
                  </label>
                  <input 
                    type="number" 
                    placeholder="e.g. 1500"
                    value={formOpeningUdhar}
                    onChange={(e) => setFormOpeningUdhar(e.target.value)}
                    className="w-full bg-white px-3 py-2 border border-amber-300 rounded-xl focus:outline-none focus:border-amber-600 font-mono font-bold text-navy"
                  />
                  <p className="text-[10px] text-amber-800">If this customer already has a pending balance from past orders, enter it here.</p>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="font-semibold text-navy">Customer Delivery Address</label>
                <input 
                  type="text" 
                  placeholder="E.g. Model Town, Jalandhar, Punjab"
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  className="w-full bg-white px-3 py-2 border border-light rounded-lg focus:outline-hidden focus:border-gold"
                />
              </div>

              <div className="space-y-1.5 bg-cream/30 p-4 rounded-2xl border border-dashed border-gold/35 flex flex-col items-center justify-center text-center">
                <label className="font-bold text-navy mb-2 self-start">Customer Profile Photograph</label>
                {formPhotoUrl ? (
                  <div className="relative group w-20 h-20 rounded-full overflow-hidden border-2 border-gold shadow-md">
                    <img src={formPhotoUrl} alt="Preview" className="w-full h-full object-cover aspect-square" />
                    <button 
                      type="button" 
                      onClick={() => setFormPhotoUrl("")}
                      className="absolute inset-0 bg-black/60 text-white text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer font-bold"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 rounded-full bg-cream border border-light flex items-center justify-center text-muted-grey mb-2">
                      <Camera className="w-5 h-5 text-gold" />
                    </div>
                    <label className="bg-navy hover:bg-navy-hover text-white text-[10px] font-bold px-3 py-1.5 rounded-lg cursor-pointer transition-colors">
                      {isUploadingPhoto ? "Uploading..." : "Upload Photo"}
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        disabled={isUploadingPhoto}
                        onChange={handlePhotoUpload} 
                      />
                    </label>
                    <p className="text-[9px] text-muted-grey mt-1">PNG, JPG, or WEBP up to 5MB. Stored permanently in your Supabase bucket.</p>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-navy">General Remarks & Cutting Notes</label>
                <textarea 
                  rows={3}
                  placeholder="E.g. Left shoulder lower by 0.5 inches. Demands soft collar stiffness only."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full bg-white p-3 border border-light rounded-lg focus:outline-hidden focus:border-gold"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-light">
                <button 
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="bg-cream hover:bg-cream/80 text-navy font-semibold px-4 py-2.5 rounded-xl border border-light transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="bg-navy hover:bg-navy-hover text-white font-semibold px-5 py-2.5 rounded-xl border border-navy/20 shadow-xs transition-colors cursor-pointer"
                >
                  {isEditMode ? "Save Changes" : "Create Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          CUSTOMER QR PORTAL MEMBERSHIP CARD MODAL
      ===================================================================== */}
      {isQrCardOpen && selectedCustomer && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 animate-fade-in font-sans">
          <div className="bg-white rounded-3xl border border-light max-w-md w-full shadow-2xl p-6 space-y-6 animate-scale-up">
            <div className="flex justify-between items-center border-b border-light pb-3">
              <h3 className="font-serif font-bold text-navy text-base">QR Membership Card</h3>
              <button 
                onClick={() => setIsQrCardOpen(false)}
                className="text-muted-grey hover:text-navy hover:bg-cream/50 p-1.5 rounded-lg transition-colors cursor-pointer text-sm font-sans"
              >
                ✕
              </button>
            </div>

            {/* QR Card Container: Print Layout Spec (Section 7) */}
            <div id="qr-membership-card" className="bg-[#0B1F3A] text-white p-6 rounded-2xl border-2 border-[#C9A24B] shadow-lg relative overflow-hidden aspect-[1.586] flex flex-col justify-between font-sans">
              {/* Monogram crest watermarked background */}
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,#132a4c,transparent_70%)] pointer-events-none" />

              {/* Header */}
              <div className="flex justify-between items-start z-10">
                <div className="flex items-center gap-2">
                  {/* Miniature Monogram Crest */}
                  <div className="w-8 h-8 rounded-full border border-[#C9A24B]/60 flex items-center justify-center text-[#C9A24B] text-[10px] font-bold font-serif bg-[#132A4C]/50 shadow-xs">
                    SS
                  </div>
                  <div>
                    <h4 className="text-xs font-serif font-bold tracking-wider text-white">SIGNATURE SUITINGS</h4>
                    <p className="text-[7px] text-[#C9A24B] uppercase tracking-widest font-sans">The Sign of Comfort</p>
                  </div>
                </div>
                <span className="text-[7px] font-semibold text-[#E8D5A3]/80 uppercase tracking-wider font-mono">Bespoke Club</span>
              </div>

              {/* Card Body Grid */}
              <div className="grid grid-cols-12 gap-2 items-center mt-3 z-10">
                {/* Text specs */}
                <div className="col-span-8 space-y-1">
                  <p className="text-[9px] text-[#E8D5A3] font-medium tracking-wider uppercase">MEMBER</p>
                  <h3 className="text-sm font-serif font-bold text-white tracking-wide truncate">{selectedCustomer.fullName}</h3>
                  <div className="pt-1.5 font-mono text-[8px] text-white/70 space-y-0.5">
                    <p>ID: SS-{selectedCustomer.id.slice(-6).toUpperCase()}</p>
                    <p>Phone: {selectedCustomer.mobileNumber}</p>
                  </div>
                </div>

                {/* QR Code */}
                <div className="col-span-4 justify-self-end bg-white p-2 rounded-lg border border-[#C9A24B]/30 shadow-md">
                  <QRCode 
                    value={`${window.location.origin}/portal/${selectedCustomer.qrCodeId}`}
                    size={64}
                    bgColor="#FFFFFF"
                    fgColor="#0B1F3A"
                    level="L"
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="border-t border-[#C9A24B]/25 pt-2.5 mt-3 flex justify-between items-center text-[7px] text-white/50 z-10">
                <span>Scan card QR code to review active fitting progress & invoices</span>
                <span className="font-mono text-[#C9A24B] font-bold">Showroom (O) 93572 51900</span>
              </div>
            </div>

            {/* Downloader controls */}
            <div className="flex gap-3 justify-end text-xs">
              <button 
                onClick={() => {
                  setConfirmModal({
                    isOpen: true,
                    title: "Print QR Identity Card",
                    message: "Printed QR Card initialized successfully. In the live showroom environment, this task directly hooks to the dedicated industrial card printer.",
                    variant: "info",
                    confirmLabel: "Proceed with Print",
                    cancelLabel: "Cancel",
                    onConfirm: () => {
                      setConfirmModal(prev => ({ ...prev, isOpen: false }));
                      window.print();
                    },
                    onCancel: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
                  });
                }}
                className="bg-cream hover:bg-cream/80 text-navy font-semibold px-4 py-2 rounded-xl border border-light flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5 text-gold" />
                Print Card
              </button>
              <button 
                onClick={() => setIsQrCardOpen(false)}
                className="bg-navy hover:bg-navy-hover text-white font-semibold px-5 py-2 rounded-xl transition-all cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD OPENING UDHAR MODAL */}
      {isAddUdharModalOpen && selectedCustomer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-fade-in font-sans">
          <div className="bg-white rounded-3xl border border-light max-w-md w-full shadow-2xl p-6 space-y-5 animate-scale-up">
            <div className="flex justify-between items-center border-b border-light pb-3">
              <h3 className="text-base font-serif font-bold text-navy flex items-center gap-2">
                <Plus className="w-4 h-4 text-gold" /> Purana Udhar Add Karein
              </h3>
              <button 
                onClick={() => setIsAddUdharModalOpen(false)}
                className="text-muted-grey hover:text-navy hover:bg-cream/50 p-1.5 rounded-lg transition-colors cursor-pointer text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddOpeningUdharSubmit} className="space-y-4 text-xs text-charcoal">
              <p className="text-muted-grey">
                Adding past/opening balance for <span className="font-bold text-navy">{selectedCustomer.fullName}</span>. Current balance is <span className="font-mono font-bold text-rose-600">₹{selectedCustomer.outstandingBalance.toLocaleString("en-IN")}</span>.
              </p>

              <div className="space-y-1">
                <label className="font-bold text-navy">Udhar Amount (₹) <span className="text-red-500">*</span></label>
                <input 
                  type="number"
                  required
                  placeholder="e.g. 2500"
                  value={addUdharAmount}
                  onChange={e => setAddUdharAmount(e.target.value)}
                  className="w-full bg-white px-3 py-2 border border-light rounded-xl font-mono font-bold text-sm text-navy focus:outline-none focus:border-gold"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-navy">Note / Reason (Optional)</label>
                <input 
                  type="text"
                  placeholder="e.g. Old ledger balance from 2024 book"
                  value={addUdharNote}
                  onChange={e => setAddUdharNote(e.target.value)}
                  className="w-full bg-white px-3 py-2 border border-light rounded-xl focus:outline-none focus:border-gold"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-light">
                <button 
                  type="button"
                  onClick={() => setIsAddUdharModalOpen(false)}
                  className="bg-cream hover:bg-cream/80 text-navy font-semibold px-4 py-2 rounded-xl border border-light transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="bg-navy hover:bg-navy-hover text-white font-bold px-5 py-2 rounded-xl transition-colors cursor-pointer shadow-xs"
                >
                  Add to Balance
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PAY UDHAR MODAL */}
      {isPayUdharModalOpen && selectedCustomer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-fade-in font-sans">
          <div className="bg-white rounded-3xl border border-light max-w-md w-full shadow-2xl p-6 space-y-5 animate-scale-up">
            <div className="flex justify-between items-center border-b border-light pb-3">
              <h3 className="text-base font-serif font-bold text-navy flex items-center gap-2">
                <Receipt className="w-4 h-4 text-emerald-600" /> Udhar Payment Receive Karein
              </h3>
              <button 
                onClick={() => setIsPayUdharModalOpen(false)}
                className="text-muted-grey hover:text-navy hover:bg-cream/50 p-1.5 rounded-lg transition-colors cursor-pointer text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handlePayUdharSubmit} className="space-y-4 text-xs text-charcoal">
              <div className="bg-rose-50 p-3 rounded-2xl border border-rose-200 flex justify-between items-center">
                <span className="font-bold text-rose-900">Total Udhar Due:</span>
                <span className="font-mono text-base font-bold text-rose-700">₹{selectedCustomer.outstandingBalance.toLocaleString("en-IN")}</span>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-navy">Payment Received Amount (₹) <span className="text-red-500">*</span></label>
                <input 
                  type="number"
                  required
                  placeholder={`Max ₹${selectedCustomer.outstandingBalance}`}
                  value={payUdharAmount}
                  onChange={e => setPayUdharAmount(e.target.value)}
                  className="w-full bg-white px-3 py-2 border border-light rounded-xl font-mono font-bold text-sm text-emerald-800 focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-navy">Payment Mode</label>
                <select
                  value={payUdharMode}
                  onChange={e => setPayUdharMode(e.target.value as any)}
                  className="w-full bg-white px-3 py-2 border border-light rounded-xl focus:outline-none focus:border-gold font-semibold"
                >
                  <option value="Cash">Cash</option>
                  <option value="UPI / QR">UPI / QR</option>
                  <option value="Card (POS)">Card (POS)</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-light">
                <button 
                  type="button"
                  onClick={() => setIsPayUdharModalOpen(false)}
                  className="bg-cream hover:bg-cream/80 text-navy font-semibold px-4 py-2 rounded-xl border border-light transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-5 py-2 rounded-xl transition-colors cursor-pointer shadow-xs"
                >
                  Confirm Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT ORDER MODAL */}
      <EditOrderModal
        orderId={editingOrderId}
        isOpen={!!editingOrderId}
        onClose={() => setEditingOrderId(null)}
        onSuccess={refreshDb}
      />

      {/* CUSTOM CONFIRMATION MODAL */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmLabel={confirmModal.confirmLabel}
        cancelLabel={confirmModal.cancelLabel}
        variant={confirmModal.variant}
        onConfirm={confirmModal.onConfirm}
        onCancel={confirmModal.onCancel}
      />

    </div>
  );
}

function MeasurementCompareDisplay({
  measurements,
  compareVersion1,
  compareVersion2
}: {
  measurements: Measurement[];
  compareVersion1: string;
  compareVersion2: string;
}) {
  const m1 = measurements.find(m => m.id === compareVersion1);
  const m2 = measurements.find(m => m.id === compareVersion2);
  if (!m1 || !m2) return null;

  const renderCompareRow = (garmentName: string, fields: { label: string; key: string; val1: string; val2: string }[]) => (
    <div className="border border-light rounded-2xl overflow-hidden bg-white">
      <div className="bg-cream/40 p-3 font-semibold text-xs text-navy border-b border-light uppercase tracking-wider">{garmentName}</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 text-xs">
        {fields.map(f => {
          const isChanged = f.val1 !== f.val2;
          return (
            <div key={f.key} className={`p-2.5 rounded-xl border transition-all ${isChanged ? "bg-gold/5 border-gold/30 ring-1 ring-gold/20" : "bg-cream/10 border-light/60"}`}>
              <p className="text-muted-grey font-semibold text-[10px] uppercase">{f.label}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="font-mono text-muted-grey text-xs line-through">{f.val2 || "0"} in</span>
                <ChevronRight className="w-3 h-3 text-gold" />
                <span className="font-mono font-bold text-navy text-sm">{f.val1 || "0"} in</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      {renderCompareRow("Coat / Indo Western", [
        { label: "Length", key: "len", val1: m1.coatIndoWestern.length, val2: m2.coatIndoWestern.length },
        { label: "Chest", key: "ch", val1: m1.coatIndoWestern.chest, val2: m2.coatIndoWestern.chest },
        { label: "Waist", key: "wst", val1: m1.coatIndoWestern.waist, val2: m2.coatIndoWestern.waist },
        { label: "Neck", key: "nck", val1: m1.coatIndoWestern.neck, val2: m2.coatIndoWestern.neck },
        { label: "Tira", key: "tra", val1: m1.coatIndoWestern.tira, val2: m2.coatIndoWestern.tira },
        { label: "Arm Length", key: "arm", val1: m1.coatIndoWestern.arms, val2: m2.coatIndoWestern.arms }
      ])}
      {renderCompareRow("Pent", [
        { label: "Waist", key: "pw", val1: m1.pent.waist, val2: m2.pent.waist },
        { label: "Hips", key: "ph", val1: m1.pent.hips, val2: m2.pent.hips },
        { label: "Patt (Thigh)", key: "pp", val1: m1.pent.patt, val2: m2.pent.patt },
        { label: "Bottom", key: "pb", val1: m1.pent.bottom, val2: m2.pent.bottom }
      ])}
    </div>
  );
}
