/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  ShoppingBag, 
  Plus, 
  Search, 
  Filter, 
  ArrowLeft, 
  CheckCircle, 
  User, 
  Calendar, 
  Scissors, 
  UserCheck, 
  Sparkles, 
  Receipt, 
  FileText, 
  TrendingUp, 
  Clock, 
  ArrowRight,
  Eye,
  Trash2,
  Printer,
  Edit,
  Edit2,
  Check,
  X,
  Layers
} from "lucide-react";
import { Order, Customer, Measurement, OrderStatus } from "../types";
import { db, stripEmbeddedTags } from "../db";
import ConfirmModal from "./ConfirmModal";
import EditOrderModal from "./EditOrderModal";

const getLocalDateString = (dateObj = new Date()) => {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, "0");
  const day = String(dateObj.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

interface OrdersViewProps {
  initialCustomerId?: string;
  autoOpenCreateModal?: boolean;
  onNavigateToInvoice: (customerId: string, orderId: string) => void;
  onNavigateToCustomerProfile: (customerId: string) => void;
}

export default function OrdersView({ 
  initialCustomerId, 
  autoOpenCreateModal = false,
  onNavigateToInvoice,
  onNavigateToCustomerProfile
}: OrdersViewProps) {
  // --- DATABASE STATE ---
  const [orders, setOrders] = useState<Order[]>(db.getOrders());
  const [customers, setCustomers] = useState<Customer[]>(db.getCustomers());
  
  // --- UI VIEW STATE ---
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isPrintSummaryOpen, setIsPrintSummaryOpen] = useState(false);
  const [isPrintSlipOpen, setIsPrintSlipOpen] = useState(false);

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

  // --- FILTER STATE ---
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "All">("All");
  const [showFinancials, setShowFinancials] = useState(true);

  // --- NEW ORDER MODAL FORM STATE ---
  const garmentOptions = ["Coat/Indo Western", "Pent", "Vest", "Shirt/Kurta"];
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [matchedCustomers, setMatchedCustomers] = useState<Customer[]>([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [selectedCust, setSelectedCust] = useState<Customer | null>(null);

  // Customer basic info
  const [custName, setCustName] = useState("");
  const [custMobile, setCustMobile] = useState("");
  const [custAddress, setCustAddress] = useState("");

  // Garment selections
  const [selectedGarments, setSelectedGarments] = useState<Record<string, boolean>>({
    "Coat/Indo Western": true,
    "Pent": true,
    "Vest": false,
    "Shirt/Kurta": false,
  });

  // Sizing inputs
  const [coatValues, setCoatValues] = useState({
    length: "", chest: "", waist: "", neck: "", tira: "",
    hb: "", cback: "", arms: "", bicep: "", front: "", moda: "",
  });
  const [pentValues, setPentValues] = useState({
    length: "", inlength: "", waist: "", hips: "",
    patt: "", knee: "", bottom: "",
  });
  const [vestValues, setVestValues] = useState({
    length: "", chest: "", waist: "", hip: "", tira: "", neck: "",
  });
  const [shirtValues, setShirtValues] = useState({
    length: "", chest: "", waist: "", hip: "",
    tira: "", arms: "", neck: "", cback: "",
    front: "", moda: "", bicep: "",
  });

  // Styling & Fabric Details
  const [fabricBrand, setFabricBrand] = useState("Raymond Heritage");
  const [fabricColor, setFabricColor] = useState("");
  const [lapelStyle, setLapelStyle] = useState("Notch Lapel (Standard)");
  const [ventStyle, setVentStyle] = useState("Double Vent (Side)");
  const [prefNotes, setPrefNotes] = useState("");

  // Order Details
  const [serialNumber, setSerialNumber] = useState("");
  const [tryOnDate, setTryOnDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return getLocalDateString(d);
  });
  const [deliveryDate, setDeliveryDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return getLocalDateString(d);
  });
  const [totalAmount, setTotalAmount] = useState("");
  const [advancePaid, setAdvancePaid] = useState("");
  const [assignedTailor, setAssignedTailor] = useState("Master Harjeet Singh");
  const [orderPriority, setOrderPriority] = useState("Normal");
  const [paymentMode, setPaymentMode] = useState("Cash");

  // Last measurement state
  const [latestMeas, setLatestMeas] = useState<Measurement | null>(null);

  // Success state
  const [successData, setSuccessData] = useState<{
    orderId: string;
    orderNumber: string;
    customerName: string;
    deliveryDate: string;
    garments: string[];
    totalAmount: number;
    advancePaid: number;
    balanceDue: number;
  } | null>(null);

  const refreshDb = () => {
    setOrders(db.getOrders());
    setCustomers(db.getCustomers());
  };

  const applyGarmentPreset = (type: "2pc" | "3pc" | "shirt_pent" | "kurta" | "coat" | "pent" | "shirt") => {
    switch (type) {
      case "2pc":
        setSelectedGarments({ "Coat/Indo Western": true, Pent: true, Vest: false, "Shirt/Kurta": false });
        break;
      case "3pc":
        setSelectedGarments({ "Coat/Indo Western": true, Pent: true, Vest: true, "Shirt/Kurta": false });
        break;
      case "shirt_pent":
        setSelectedGarments({ "Coat/Indo Western": false, Pent: true, Vest: false, "Shirt/Kurta": true });
        break;
      case "kurta":
        setSelectedGarments({ "Coat/Indo Western": true, Pent: true, Vest: false, "Shirt/Kurta": true });
        break;
      case "coat":
        setSelectedGarments({ "Coat/Indo Western": true, Pent: false, Vest: false, "Shirt/Kurta": false });
        break;
      case "pent":
        setSelectedGarments({ "Coat/Indo Western": false, Pent: true, Vest: false, "Shirt/Kurta": false });
        break;
      case "shirt":
        setSelectedGarments({ "Coat/Indo Western": false, Pent: false, Vest: false, "Shirt/Kurta": true });
        break;
    }
  };

  const openNewOrderModal = (prefillCustomerId?: string) => {
    handleResetForm();
    const custId = prefillCustomerId || initialCustomerId;
    if (custId) {
      const cust = db.getCustomerById(custId);
      if (cust) {
        handleSelectCustomer(cust);
      }
    }
    setIsCreateOpen(true);
  };

  const handleResetForm = () => {
    setCustomerSearchQuery("");
    setMatchedCustomers([]);
    setShowCustomerDropdown(false);
    setSelectedCust(null);
    setCustName("");
    setCustMobile("");
    setCustAddress("");
    setSelectedGarments({
      "Coat/Indo Western": true,
      "Pent": true,
      "Vest": false,
      "Shirt/Kurta": false,
    });
    setCoatValues({
      length: "", chest: "", waist: "", neck: "", tira: "",
      hb: "", cback: "", arms: "", bicep: "", front: "", moda: "",
    });
    setPentValues({
      length: "", inlength: "", waist: "", hips: "",
      patt: "", knee: "", bottom: "",
    });
    setVestValues({
      length: "", chest: "", waist: "", hip: "", tira: "", neck: "",
    });
    setShirtValues({
      length: "", chest: "", waist: "", hip: "",
      tira: "", arms: "", neck: "", cback: "",
      front: "", moda: "", bicep: "",
    });
    setFabricBrand("Raymond Heritage");
    setFabricColor("");
    setLapelStyle("Notch Lapel (Standard)");
    setVentStyle("Double Vent (Side)");
    setPrefNotes("");
    setSerialNumber("");
    
    const dFit = new Date();
    dFit.setDate(dFit.getDate() + 7);
    setTryOnDate(getLocalDateString(dFit));

    const dDel = new Date();
    dDel.setDate(dDel.getDate() + 14);
    setDeliveryDate(getLocalDateString(dDel));

    setTotalAmount("");
    setAdvancePaid("");
    setAssignedTailor("Master Harjeet Singh");
    setOrderPriority("Normal");
    setPaymentMode("Cash");
    setLatestMeas(null);
    setSuccessData(null);
  };

  const handleSearchChange = (val: string) => {
    setCustomerSearchQuery(val);
    setCustName(val);
    if (!val.trim()) {
      setMatchedCustomers([]);
      setShowCustomerDropdown(false);
      return;
    }
    const cleanQ = val.toLowerCase().trim();
    const cleanDigits = val.replace(/\D/g, "");

    const matches = customers.filter(c => {
      const nameMatch = c.fullName.toLowerCase().includes(cleanQ);
      const cleanCustMobile = c.mobileNumber.replace(/\D/g, "");
      const mobileMatch = cleanDigits.length > 0 && cleanCustMobile.includes(cleanDigits);
      return nameMatch || mobileMatch;
    });

    setMatchedCustomers(matches);
    setShowCustomerDropdown(matches.length > 0);
  };

  const handleSelectCustomer = (cust: Customer) => {
    setSelectedCust(cust);
    setCustName(cust.fullName);
    setCustMobile(cust.mobileNumber);
    setCustAddress(cust.address || "");
    setShowCustomerDropdown(false);

    // Fetch latest measurement
    const measList = db.getMeasurements(cust.id);
    if (measList && measList.length > 0) {
      setLatestMeas(measList[0]);
    } else {
      setLatestMeas(null);
    }
  };

  const handleUseLastMeasurements = () => {
    if (!latestMeas) return;
    if (latestMeas.coatIndoWestern) {
      setCoatValues({
        length: latestMeas.coatIndoWestern.length || "",
        chest: latestMeas.coatIndoWestern.chest || "",
        waist: latestMeas.coatIndoWestern.waist || "",
        neck: latestMeas.coatIndoWestern.neck || "",
        tira: latestMeas.coatIndoWestern.tira || "",
        hb: latestMeas.coatIndoWestern.hb || "",
        cback: latestMeas.coatIndoWestern.cback || "",
        arms: latestMeas.coatIndoWestern.arms || "",
        bicep: latestMeas.coatIndoWestern.bicep || "",
        front: latestMeas.coatIndoWestern.front || "",
        moda: latestMeas.coatIndoWestern.moda || "",
      });
      if (latestMeas.coatIndoWestern.serialNumber) {
        setSerialNumber(latestMeas.coatIndoWestern.serialNumber);
      }
    }
    if (latestMeas.pent) {
      setPentValues({
        length: latestMeas.pent.length || "",
        inlength: latestMeas.pent.inlength || "",
        waist: latestMeas.pent.waist || "",
        hips: latestMeas.pent.hips || "",
        patt: latestMeas.pent.patt || "",
        knee: latestMeas.pent.knee || "",
        bottom: latestMeas.pent.bottom || "",
      });
    }
    if (latestMeas.vest) {
      setVestValues({
        length: latestMeas.vest.length || "",
        chest: latestMeas.vest.chest || "",
        waist: latestMeas.vest.waist || "",
        hip: latestMeas.vest.hip || "",
        tira: latestMeas.vest.tira || "",
        neck: latestMeas.vest.neck || "",
      });
    }
    if (latestMeas.shirtKurta) {
      setShirtValues({
        length: latestMeas.shirtKurta.length || "",
        chest: latestMeas.shirtKurta.chest || "",
        waist: latestMeas.shirtKurta.waist || "",
        hip: latestMeas.shirtKurta.hip || "",
        tira: latestMeas.shirtKurta.tira || "",
        arms: latestMeas.shirtKurta.arms || "",
        neck: latestMeas.shirtKurta.neck || "",
        cback: latestMeas.shirtKurta.cback || "",
        front: latestMeas.shirtKurta.front || "",
        moda: latestMeas.shirtKurta.moda || "",
        bicep: latestMeas.shirtKurta.bicep || "",
      });
    }
    if (latestMeas.remarks) {
      setPrefNotes(latestMeas.remarks);
    }
  };

  const handleSaveOrder = (e: React.FormEvent) => {
    e.preventDefault();

    if (!custName.trim()) {
      setConfirmModal({
        isOpen: true,
        title: "Validation Error",
        message: "Please enter the customer's full name.",
        confirmLabel: "Understood",
        variant: "warning",
        onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false }))
      });
      return;
    }
    if (!custMobile.trim()) {
      setConfirmModal({
        isOpen: true,
        title: "Validation Error",
        message: "Please enter the customer's mobile number.",
        confirmLabel: "Understood",
        variant: "warning",
        onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false }))
      });
      return;
    }
    if (!custAddress.trim()) {
      setConfirmModal({
        isOpen: true,
        title: "Validation Error",
        message: "Please enter the customer's city/address.",
        confirmLabel: "Understood",
        variant: "warning",
        onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false }))
      });
      return;
    }

    const activeGarments = Object.entries(selectedGarments)
      .filter(([_, active]) => active)
      .map(([name]) => name);

    if (activeGarments.length === 0) {
      setConfirmModal({
        isOpen: true,
        title: "Validation Error",
        message: "Please select at least one garment for this bespoke order.",
        confirmLabel: "Understood",
        variant: "warning",
        onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false }))
      });
      return;
    }

    if (!deliveryDate) {
      setConfirmModal({
        isOpen: true,
        title: "Validation Error",
        message: "Please set the expected delivery date.",
        confirmLabel: "Understood",
        variant: "warning",
        onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false }))
      });
      return;
    }

    const totalVal = totalAmount ? parseFloat(totalAmount) : 0;
    const advVal = advancePaid ? parseFloat(advancePaid) : 0;

    if (advVal > totalVal && totalVal > 0) {
      setConfirmModal({
        isOpen: true,
        title: "Validation Error",
        message: "Advance paid cannot exceed the total order amount.",
        confirmLabel: "Understood",
        variant: "warning",
        onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false }))
      });
      return;
    }

    try {
      // 1. Ensure Customer exists or create new
      let customerId = selectedCust ? selectedCust.id : "";
      if (!customerId) {
        const cleanDigits = custMobile.replace(/\D/g, "");
        const existing = customers.find(c => {
          const cClean = c.mobileNumber.replace(/\D/g, "");
          return cleanDigits.length >= 10 && cClean.endsWith(cleanDigits.slice(-10));
        });

        if (existing) {
          customerId = existing.id;
        } else {
          const newCust = db.addCustomer({
            fullName: custName.trim(),
            mobileNumber: custMobile.trim(),
            address: custAddress.trim(),
            preferredFabricBrands: [fabricBrand]
          });
          customerId = newCust.id;
        }
      }

      // 2. Save measurement record
      const fullRemarks = [
        fabricBrand ? `Fabric: ${fabricBrand}` : "",
        fabricColor ? `Color: ${fabricColor}` : "",
        lapelStyle ? `Lapel: ${lapelStyle}` : "",
        ventStyle ? `Vent: ${ventStyle}` : "",
        prefNotes ? `Notes: ${prefNotes}` : ""
      ].filter(Boolean).join(" | ");

      const newMeas = db.saveMeasurement({
        customerId,
        tryOnDate,
        deliveryDate,
        createdBy: assignedTailor || "Master Tailor",
        remarks: fullRemarks,
        coatIndoWestern: {
          ...coatValues,
          serialNumber: serialNumber || undefined,
          date: getLocalDateString(),
        },
        pent: {
          ...pentValues,
          date: getLocalDateString(),
        },
        vest: {
          ...vestValues,
          date: getLocalDateString(),
        },
        shirtKurta: {
          ...shirtValues,
          date: getLocalDateString(),
        },
      });

      // 3. Create Order
      const combinedFabricDetails = [
        fabricBrand,
        fabricColor ? `(${fabricColor})` : "",
        lapelStyle ? `[${lapelStyle}]` : "",
        ventStyle ? `[${ventStyle}]` : ""
      ].filter(Boolean).join(" ");

      const newOrder = db.addOrder({
        customerId,
        garmentTypes: activeGarments,
        linkedMeasurementVersionId: newMeas.id,
        fabricDetails: combinedFabricDetails || "Raymond Fine Suiting",
        expectedDeliveryDate: deliveryDate,
        assignedTailor: assignedTailor || "Master Harjeet Singh",
        status: "Pending",
        notes: fullRemarks,
      }, totalVal, advVal);

      refreshDb();

      setSuccessData({
        orderId: newOrder.id,
        orderNumber: newOrder.orderNumber,
        customerName: custName.trim(),
        deliveryDate,
        garments: activeGarments,
        totalAmount: totalVal,
        advancePaid: advVal,
        balanceDue: Math.max(0, totalVal - advVal),
      });

    } catch (err: any) {
      setConfirmModal({
        isOpen: true,
        title: "Error Creating Order",
        message: err.message || "Failed to register new order. Please try again.",
        confirmLabel: "Understood",
        variant: "danger",
        onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false }))
      });
    }
  };

  React.useEffect(() => {
    refreshDb();
    if (autoOpenCreateModal || sessionStorage.getItem("sig_suit_open_new_order") === "true") {
      openNewOrderModal();
      sessionStorage.removeItem("sig_suit_open_new_order");
    }

    const handleTrigger = () => {
      openNewOrderModal();
    };

    window.addEventListener("sig_suit_trigger_new_order", handleTrigger);
    return () => {
      window.removeEventListener("sig_suit_trigger_new_order", handleTrigger);
    };
  }, [autoOpenCreateModal]);

  React.useEffect(() => {
    return db.onSync(refreshDb);
  }, []);

  const selectedOrder = orders.find(o => o.id === selectedOrderId);
  const selectedOrderCustomer = selectedOrder ? customers.find(c => c.id === selectedOrder.customerId) : null;
  const linkedMeas = selectedOrder?.linkedMeasurementVersionId ? db.getMeasurementById(selectedOrder.linkedMeasurementVersionId) : null;
  const custLatestMeas = selectedOrder ? db.getLatestMeasurement(selectedOrder.customerId) : null;
  const selectedOrderMeasurement = linkedMeas || custLatestMeas || null;
  const selectedOrderInvoices = selectedOrder ? db.getInvoiceByOrderId(selectedOrder.id) : null;

  // Delete Order — warns explicitly when money has already been received against it.
  const handleDeleteOrder = (id: string, num: string) => {
    const impact = db.getOrderDeletionImpact(id);
    if (!impact.exists) return;

    const runDelete = async (force: boolean) => {
      try {
        const res = await db.deleteOrder(id, { force });
        if (!res.success) throw new Error(res.error || "Could not move this order to Trash.");
        refreshDb();
        if (selectedOrderId === id) setSelectedOrderId(null);
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      } catch (err: any) {
        setConfirmModal({
          isOpen: true,
          title: "Order Not Moved to Trash",
          message: err?.message || "This order could not be deleted.",
          confirmLabel: "OK",
          cancelLabel: "Cancel",
          variant: "warning",
          onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
          onCancel: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
        });
      }
    };

    if (!impact.safeToDelete) {
      setConfirmModal({
        isOpen: true,
        title: "This Order Has Payments",
        message: `${impact.reason}\n\nContinue only if this order was booked in error and the money was never actually taken.`,
        confirmLabel: "Move to Trash Anyway",
        cancelLabel: "Keep Order",
        variant: "danger",
        onConfirm: () => runDelete(true),
        onCancel: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
      });
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: "Move Order to Trash?",
      message: `Move Order ${num} to Trash? Its bill and any trial records move with it, and the whole job can be restored together from Trash.`,
      confirmLabel: "Move to Trash",
      cancelLabel: "Cancel",
      variant: "danger",
      onConfirm: () => runDelete(false),
      onCancel: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
    });
  };

  // Advance Order Status Pipeline (Section 5.6.3)
  const handleAdvanceStatus = (orderId: string, nextStatus: OrderStatus) => {
    db.updateOrderStatus(orderId, nextStatus, "Hardik Nagpal");
    refreshDb();
  };

  // Filter List
  const filteredOrders = orders.filter(o => {
    const cust = customers.find(c => c.id === o.customerId);
    const matchesCustomerName = cust?.fullName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                o.orderNumber.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "All" ? true : o.status === statusFilter;
    return matchesCustomerName && matchesStatus;
  });

  return (
    <div className="space-y-6">
      
      {!selectedOrderId ? (
        // =====================================================================
        // ORDERS LIST VIEW
        // =====================================================================
        <div className="bg-white rounded-3xl border border-light shadow-sm p-6 space-y-6 animate-fade-in font-sans print:hidden">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-serif text-navy font-bold">Showroom Order Book</h1>
            </div>
            <button 
              onClick={() => {
                if (initialCustomerId) {
                  const c = customers.find(cust => cust.id === initialCustomerId);
                  if (c) handleSelectCustomer(c);
                }
                setIsCreateOpen(true);
              }}
              className="bg-navy hover:bg-navy-hover text-white font-semibold px-5 py-2.5 rounded-xl flex items-center gap-2 border border-navy/20 shadow-xs cursor-pointer text-sm self-start sm:self-auto transition-all"
            >
              <Plus className="w-4 h-4 text-gold" />
              Place Custom Order
            </button>
          </div>

          {/* Filter Bar */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center bg-cream/30 p-4 rounded-2xl border border-light text-xs font-semibold text-charcoal">
            <div className="md:col-span-5 relative">
              <Search className="w-4 h-4 text-muted-grey absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input 
                type="text" 
                placeholder="Search by customer name or order number..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white pl-10 pr-4 py-2 border border-light rounded-xl font-sans text-xs focus:outline-hidden focus:border-gold"
              />
            </div>
            
            <div className="md:col-span-3 flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-muted-grey flex-shrink-0" />
              <select 
                value={statusFilter} 
                onChange={(e: any) => setStatusFilter(e.target.value)}
                className="w-full bg-white px-3 py-2 border border-light rounded-xl font-sans text-xs text-charcoal focus:outline-hidden focus:border-gold"
              >
                <option value="All">Filter: All Statuses</option>
                <option value="Pending">Pending</option>
                <option value="In Cutting">In Cutting</option>
                <option value="Stitching">Stitching</option>
                <option value="Trial Scheduled">Trial Scheduled</option>
                <option value="Ready">Ready (For Collection)</option>
                <option value="Delivered">Delivered</option>
              </select>
            </div>

            <div className="md:col-span-4 flex items-center justify-start md:justify-end gap-2 bg-white/40 md:bg-transparent p-2 md:p-0 rounded-xl border border-light/50 md:border-none">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input 
                  type="checkbox"
                  checked={showFinancials}
                  onChange={(e) => setShowFinancials(e.target.checked)}
                  className="w-4 h-4 text-navy border-light rounded-md focus:ring-navy focus:ring-2 accent-navy cursor-pointer"
                />
                <span className="text-navy font-bold">Show Advance & Pending (₹)</span>
              </label>
            </div>
          </div>

          {/* Orders Table */}
          <div className="overflow-x-auto border border-light rounded-2xl text-xs">
            {filteredOrders.length === 0 ? (
              <div className="py-16 text-center space-y-3 bg-white">
                <div className="inline-flex bg-cream p-4 rounded-full">
                  <ShoppingBag className="w-8 h-8 text-gold/60" />
                </div>
                <h3 className="font-serif font-bold text-navy text-lg">No orders booked</h3>
                <p className="text-muted-grey text-xs max-w-xs mx-auto">Try clarifying search terms or log a new bespoke order for customers.</p>
              </div>
            ) : (
              <table className="w-full text-left font-sans border-collapse">
                <thead>
                  <tr className="bg-cream/40 text-navy font-bold border-b border-light">
                    <th className="p-4">Order Details</th>
                    <th className="p-4">Customer Name</th>
                    <th className="p-4">Garments</th>
                    <th className="p-4">Date Logged</th>
                    <th className="p-4">Target Delivery</th>
                    {showFinancials && (
                      <th className="p-4">Financials (₹)</th>
                    )}
                    <th className="p-4 text-center">Status</th>
                    <th className="p-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-light text-charcoal">
                  {filteredOrders.map((ord) => {
                    const cust = customers.find(c => c.id === ord.customerId);
                    return (
                      <tr key={ord.id} className="hover:bg-cream/15 transition-colors">
                        <td className="p-4 font-serif font-bold text-navy text-sm">
                          <span 
                            onClick={() => setSelectedOrderId(ord.id)}
                            className="cursor-pointer hover:text-gold"
                          >
                            {ord.orderNumber}
                          </span>
                        </td>
                        <td className="p-4 font-semibold text-charcoal">
                          <span 
                            onClick={() => onNavigateToCustomerProfile(ord.customerId)}
                            className="hover:text-gold hover:underline cursor-pointer"
                          >
                            {cust?.fullName || "Bespoke Customer"}
                          </span>
                        </td>
                        <td className="p-4">
                          <div className="flex gap-1.5 flex-wrap">
                            {(() => {
                              const rawItems = (ord.garmentLineItems && ord.garmentLineItems.length > 0)
                                ? ord.garmentLineItems.map(g => g.garmentName)
                                : (ord.garmentTypes && ord.garmentTypes.length > 0 ? ord.garmentTypes : []);

                              const list = Array.from(new Set(
                                rawItems.flatMap(name => 
                                  name.startsWith("Bespoke Tailoring:") 
                                    ? name.replace("Bespoke Tailoring:", "").split(",").map(s => s.trim())
                                    : [name.trim()]
                                ).filter(Boolean)
                              ));

                              if (list.length === 0) {
                                return <span className="text-muted-grey text-[10px] italic">No Garments</span>;
                              }

                              return list.map((g, i) => (
                                <span key={i} className="px-2 py-0.5 bg-navy text-gold rounded-md font-bold text-[10px] border border-gold/30 uppercase tracking-wider shadow-2xs">
                                  {g}
                                </span>
                              ));
                            })()}
                          </div>
                        </td>
                        <td className="p-4 text-muted-grey">
                          {new Date(ord.orderDate).toLocaleDateString("en-IN", {
                            day: "numeric", month: "short", year: "numeric"
                          })}
                        </td>
                        <td className="p-4 font-medium text-charcoal">
                          {new Date(ord.expectedDeliveryDate).toLocaleDateString("en-IN", {
                            day: "numeric", month: "short", year: "numeric"
                          })}
                        </td>
                        {showFinancials && (
                          <td className="p-4">
                            <OrderFinancialCell orderId={ord.id} />
                          </td>
                        )}
                        <td className="p-4 text-center">
                          <span className={`px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider text-[9px] border ${
                            ord.status === "Delivered" 
                              ? "bg-green-50 border-green-200 text-green-700" 
                              : ord.status === "Ready" 
                              ? "bg-blue-50 border-blue-200 text-blue-700"
                              : "bg-amber-50 border-amber-200 text-amber-700"
                          }`}>
                            {ord.status}
                          </span>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center justify-center gap-2">
                            <button 
                              onClick={() => setSelectedOrderId(ord.id)}
                              title="View Order Details & Stepper"
                              className="p-1.5 hover:bg-cream text-navy rounded-lg cursor-pointer"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => setEditingOrderId(ord.id)}
                              title="Edit Order & Financial Ledger"
                              className="p-1.5 hover:bg-navy/10 text-navy rounded-lg cursor-pointer"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => handleDeleteOrder(ord.id, ord.orderNumber)}
                              title="Delete Order"
                              className="p-1.5 hover:bg-rose-50 text-red-600 rounded-lg cursor-pointer"
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
        // ORDER DETAILS / PIPELINE PORTAL (Section 5.6.3)
        // =====================================================================
        <div className="space-y-6 animate-fade-in font-sans text-xs print:hidden">
          {/* Backbar */}
          <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-light shadow-xs">
            <button 
              onClick={() => setSelectedOrderId(null)}
              className="flex items-center gap-2 font-semibold text-navy hover:text-gold transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Order Book
            </button>
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setEditingOrderId(selectedOrder!.id)}
                className="bg-navy hover:bg-navy-hover text-white font-semibold px-4 py-2 rounded-xl border border-navy/20 flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Edit className="w-4 h-4 text-gold" />
                Edit Order
              </button>
              <button 
                onClick={() => setIsPrintSummaryOpen(true)}
                className="bg-cream hover:bg-cream/80 text-navy font-semibold px-4 py-2 rounded-xl border border-light flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Printer className="w-4 h-4 text-gold" />
                Print Summary
              </button>
              {selectedOrderInvoices ? (
                <button 
                  onClick={() => onNavigateToInvoice(selectedOrder!.customerId, selectedOrder!.id)}
                  className="bg-cream hover:bg-cream/80 text-navy font-semibold px-4 py-2 rounded-xl border border-light flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Receipt className="w-4 h-4 text-gold" />
                  View Invoice
                </button>
              ) : (
                <button 
                  onClick={() => onNavigateToInvoice(selectedOrder!.customerId, selectedOrder!.id)}
                  className="bg-gold/10 hover:bg-gold/20 text-navy font-semibold px-4 py-2 rounded-xl border border-gold/20 flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4 text-gold" />
                  Generate Invoice Billing
                </button>
              )}
            </div>
          </div>

          {/* Stepper block (Section 5.6.3) */}
          <div className="bg-white rounded-3xl border border-light shadow-sm p-6 space-y-6">
            <div className="flex justify-between items-start flex-wrap gap-4 border-b border-light pb-4">
              <div>
                <span className="text-xs font-bold text-gold uppercase tracking-widest font-mono">Order Pipeline Roadmap</span>
                <h2 className="text-xl font-serif font-bold text-navy mt-1">Order {selectedOrder!.orderNumber}</h2>
              </div>
              
              {/* Status progression control button */}
              <div className="flex gap-2">
                {selectedOrder!.status === "Pending" && (
                  <button 
                    onClick={() => handleAdvanceStatus(selectedOrder!.id, "In Cutting")}
                    className="bg-navy hover:bg-navy-hover text-white font-semibold px-4 py-2 rounded-lg flex items-center gap-1 cursor-pointer transition-all"
                  >
                    Send to Cutting Room <ArrowRight className="w-3.5 h-3.5 text-gold" />
                  </button>
                )}
                {selectedOrder!.status === "In Cutting" && (
                  <button 
                    onClick={() => handleAdvanceStatus(selectedOrder!.id, "Stitching")}
                    className="bg-navy hover:bg-navy-hover text-white font-semibold px-4 py-2 rounded-lg flex items-center gap-1 cursor-pointer transition-all"
                  >
                    Start Fabric Stitching <ArrowRight className="w-3.5 h-3.5 text-gold" />
                  </button>
                )}
                {selectedOrder!.status === "Stitching" && (
                  <button 
                    onClick={() => handleAdvanceStatus(selectedOrder!.id, "Trial Scheduled")}
                    className="bg-navy hover:bg-navy-hover text-white font-semibold px-4 py-2 rounded-lg flex items-center gap-1 cursor-pointer transition-all"
                  >
                    Schedule Trial Fitting <ArrowRight className="w-3.5 h-3.5 text-gold" />
                  </button>
                )}
                {selectedOrder!.status === "Trial Scheduled" && (
                  <button 
                    onClick={() => handleAdvanceStatus(selectedOrder!.id, "Ready")}
                    className="bg-navy hover:bg-navy-hover text-white font-semibold px-4 py-2 rounded-lg flex items-center gap-1 cursor-pointer transition-all"
                  >
                    Mark Ready for Collection <ArrowRight className="w-3.5 h-3.5 text-gold" />
                  </button>
                )}
                {selectedOrder!.status === "Ready" && (
                  <button 
                    onClick={() => handleAdvanceStatus(selectedOrder!.id, "Delivered")}
                    className="bg-green-700 hover:bg-green-800 text-white font-semibold px-4 py-2 rounded-lg flex items-center gap-1 cursor-pointer transition-all shadow-2xs"
                  >
                    Collect Payment & Handover <CheckCircle className="w-3.5 h-3.5 text-gold" />
                  </button>
                )}
                {selectedOrder!.status === "Delivered" && (
                  <div className="flex items-center gap-1.5 text-green-700 bg-green-50 border border-green-200 px-3 py-2 rounded-lg font-bold">
                    <CheckCircle className="w-4 h-4" />
                    Handover Delivered & Completed
                  </div>
                )}
              </div>
            </div>

            {/* Visual Steps Stepper Line */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4 text-center">
              {(["Pending", "In Cutting", "Stitching", "Trial Scheduled", "Ready", "Delivered"] as const).map((stage, idx) => {
                const stagesList = ["Pending", "In Cutting", "Stitching", "Trial Scheduled", "Ready", "Delivered"];
                const currentIdx = stagesList.indexOf(selectedOrder!.status);
                const isCompleted = idx <= currentIdx;
                const isActive = stage === selectedOrder!.status;

                return (
                  <div key={stage} className={`p-4 rounded-2xl border transition-all ${
                    isActive 
                      ? "bg-navy text-white border-gold ring-1 ring-gold shadow-xs" 
                      : isCompleted 
                      ? "bg-green-50/45 border-green-200 text-green-800" 
                      : "bg-cream/15 border-light text-muted-grey"
                  }`}>
                    <div className="font-mono text-[10px] font-bold text-gold mb-1.5 uppercase tracking-widest">Stage 0{idx+1}</div>
                    <p className="font-serif font-bold text-sm leading-tight">{stage}</p>
                    <p className="text-[10px] mt-1.5 font-sans font-medium text-muted-grey/85">
                      {isActive ? "ACTIVE WORK" : isCompleted ? "✓ DONE" : "QUEUED"}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Details splits */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            
            {/* Left Box: Customer card & linked sizes */}
            <div className="md:col-span-8 space-y-6">
              
              {/* =========================================================
                  ORDERED GARMENT ITEMS & BESPOKE CUTTING MEASUREMENTS
                  ========================================================= */}
              <div className="bg-white rounded-3xl border border-light shadow-sm p-5 space-y-5">
                <div className="flex flex-wrap justify-between items-center border-b border-light pb-3 gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-navy uppercase tracking-wider flex items-center gap-1.5">
                      <Scissors className="w-4 h-4 text-gold" />
                      Ordered Garments & Bespoke Specifications
                    </h3>
                    <p className="text-[11px] text-muted-grey mt-0.5">
                      Itemized garment details, cloth specs, amounts & linked measurements
                    </p>
                  </div>
                  {/* Badges list */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {(() => {
                      const rawList = (selectedOrder.garmentLineItems && selectedOrder.garmentLineItems.length > 0)
                        ? selectedOrder.garmentLineItems.map(g => g.garmentName)
                        : (selectedOrder.garmentTypes && selectedOrder.garmentTypes.length > 0 ? selectedOrder.garmentTypes : []);
                      const gList = Array.from(new Set(
                        rawList.flatMap(name => 
                          name.startsWith("Bespoke Tailoring:") 
                            ? name.replace("Bespoke Tailoring:", "").split(",").map(s => s.trim())
                            : [name.trim()]
                        ).filter(Boolean)
                      ));
                      return gList.map((gName, idx) => (
                        <span key={idx} className="bg-navy text-gold text-[10px] font-bold px-2.5 py-1 rounded-full border border-gold/30 uppercase tracking-wide">
                          {gName}
                        </span>
                      ));
                    })()}
                  </div>
                </div>

                {/* Garment Cards List */}
                <div className="space-y-4">
                  {(() => {
                    const itemsToRender = (selectedOrder.garmentLineItems && selectedOrder.garmentLineItems.length > 0)
                      ? selectedOrder.garmentLineItems
                      : selectedOrder.garmentTypes.map((gName, i) => ({
                          id: `legacy-${i}`,
                          garmentName: gName,
                          quantity: 1,
                          fabric: selectedOrder.fabricDetails || "",
                          rate: Math.round((selectedOrder.totalAmount || 0) / (selectedOrder.garmentTypes.length || 1)),
                          discount: 0,
                          amount: Math.round((selectedOrder.totalAmount || 0) / (selectedOrder.garmentTypes.length || 1)),
                          measurementValues: {},
                          measurementStatus: "Pending" as const,
                          notes: selectedOrder.notes || ""
                        }));

                    if (itemsToRender.length === 0) {
                      return <p className="text-muted-grey text-xs italic">No garments logged for this order.</p>;
                    }

                    return itemsToRender.map((item, idx) => {
                      const gLower = item.garmentName.toLowerCase();
                      const isCoat = gLower.includes("coat") || gLower.includes("indo") || gLower.includes("blazer") || gLower.includes("sherwani") || gLower.includes("jacket") || gLower.includes("suit") || gLower.includes("achkan") || gLower.includes("jodhpuri") || gLower.includes("tuxedo") || gLower.includes("2pc") || gLower.includes("3pc");
                      const isPent = gLower.includes("pent") || gLower.includes("pant") || gLower.includes("trouser") || gLower.includes("pajama") || gLower.includes("salwar");
                      const isVest = gLower.includes("vest") || gLower.includes("waistcoat") || gLower.includes("sadri") || gLower.includes("koti");
                      const isShirt = gLower.includes("shirt") || gLower.includes("kurta") || gLower.includes("kameez");

                      const itemMv = item.measurementValues || {};
                      const coatMeas = selectedOrderMeasurement?.coatIndoWestern || itemMv.coatIndoWestern || itemMv;
                      const pentMeas = selectedOrderMeasurement?.pent || itemMv.pent || itemMv;
                      const vestMeas = selectedOrderMeasurement?.vest || itemMv.vest || itemMv;
                      const shirtMeas = selectedOrderMeasurement?.shirtKurta || itemMv.shirtKurta || itemMv;

                      return (
                        <div key={item.id || idx} className="bg-cream/15 rounded-2xl border border-light p-4 space-y-3.5">
                          {/* Item Header */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-light/60 pb-2.5">
                            <div className="flex items-center gap-2">
                              <span className="w-6 h-6 rounded-full bg-navy text-gold font-bold text-xs flex items-center justify-center font-mono">
                                #{idx + 1}
                              </span>
                              <h4 className="font-serif font-bold text-navy text-sm">{item.garmentName}</h4>
                              {item.quantity > 1 && (
                                <span className="bg-cream text-navy font-bold text-[10px] px-2 py-0.5 rounded-md border border-light">
                                  Qty: {item.quantity}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs font-mono">
                              {item.fabric && (
                                <span className="text-muted-grey">
                                  Cloth: <b className="text-charcoal">{item.fabric}</b>
                                </span>
                              )}
                              <span className="text-navy font-bold bg-gold/15 px-2.5 py-1 rounded-lg border border-gold/30">
                                ₹{item.amount ? item.amount.toLocaleString("en-IN") : 0}
                              </span>
                            </div>
                          </div>

                          {/* Remarks/Notes if present */}
                          {stripEmbeddedTags(item.notes) && (
                            <p className="text-[11px] text-charcoal/80 bg-white p-2 rounded-lg border border-light/60 italic">
                              <b className="not-italic text-navy">Remarks:</b> {stripEmbeddedTags(item.notes)}
                            </p>
                          )}

                          {/* Measurements breakdown for this garment */}
                          <div className="bg-white rounded-xl border border-light p-3 space-y-2">
                            <div className="flex items-center justify-between border-b border-light/50 pb-1.5">
                              <span className="text-[11px] font-bold text-navy uppercase tracking-wider flex items-center gap-1">
                                <Scissors className="w-3 h-3 text-gold" />
                                {item.garmentName} Measurements
                              </span>
                              {selectedOrderMeasurement?.slipNumber && (
                                <span className="text-[10px] text-muted-grey font-mono">
                                  Linked Slip #{selectedOrderMeasurement.slipNumber}
                                </span>
                              )}
                            </div>

                            {/* Specific fields based on garment category */}
                            {(selectedOrderMeasurement || item.measurementValues) ? (
                              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 font-mono text-[11px]">
                                {isCoat && (
                                  <>
                                    <div className="bg-cream/20 p-1.5 rounded border border-light/50"><span className="text-muted-grey text-[9px] block">Length:</span><b>{coatMeas?.length || coatMeas?.coatLength || "-"}"</b></div>
                                    <div className="bg-cream/20 p-1.5 rounded border border-light/50"><span className="text-muted-grey text-[9px] block">Chest:</span><b>{coatMeas?.chest || coatMeas?.coatChest || "-"}"</b></div>
                                    <div className="bg-cream/20 p-1.5 rounded border border-light/50"><span className="text-muted-grey text-[9px] block">Waist:</span><b>{coatMeas?.waist || coatMeas?.coatWaist || "-"}"</b></div>
                                    <div className="bg-cream/20 p-1.5 rounded border border-light/50"><span className="text-muted-grey text-[9px] block">Neck:</span><b>{coatMeas?.neck || coatMeas?.coatNeck || "-"}"</b></div>
                                    <div className="bg-cream/20 p-1.5 rounded border border-light/50"><span className="text-muted-grey text-[9px] block">Tira:</span><b>{coatMeas?.tira || coatMeas?.coatTira || "-"}"</b></div>
                                    <div className="bg-cream/20 p-1.5 rounded border border-light/50"><span className="text-muted-grey text-[9px] block">Arms:</span><b>{coatMeas?.arms || coatMeas?.coatArms || "-"}"</b></div>
                                    <div className="bg-cream/20 p-1.5 rounded border border-light/50"><span className="text-muted-grey text-[9px] block">Bicep:</span><b>{coatMeas?.bicep || coatMeas?.coatBicep || shirtMeas?.bicep || shirtMeas?.shirtBicep || "-"}"</b></div>
                                    <div className="bg-cream/20 p-1.5 rounded border border-light/50"><span className="text-muted-grey text-[9px] block">Front:</span><b>{coatMeas?.front || coatMeas?.coatFront || shirtMeas?.front || shirtMeas?.shirtFront || "-"}"</b></div>
                                    <div className="bg-cream/20 p-1.5 rounded border border-light/50"><span className="text-muted-grey text-[9px] block">Moda:</span><b>{coatMeas?.moda || coatMeas?.coatModa || shirtMeas?.moda || shirtMeas?.shirtModa || "-"}"</b></div>
                                    <div className="bg-cream/20 p-1.5 rounded border border-light/50"><span className="text-muted-grey text-[9px] block">H.B.:</span><b>{coatMeas?.hb || coatMeas?.coatHb || "-"}"</b></div>
                                    <div className="bg-cream/20 p-1.5 rounded border border-light/50"><span className="text-muted-grey text-[9px] block">C/Back:</span><b>{coatMeas?.cback || coatMeas?.coatCback || "-"}"</b></div>
                                  </>
                                )}

                                {isPent && (
                                  <>
                                    <div className="bg-cream/20 p-1.5 rounded border border-light/50"><span className="text-muted-grey text-[9px] block">Waist:</span><b>{pentMeas?.waist || pentMeas?.pentWaist || "-"}"</b></div>
                                    <div className="bg-cream/20 p-1.5 rounded border border-light/50"><span className="text-muted-grey text-[9px] block">Hips:</span><b>{pentMeas?.hips || pentMeas?.pentHips || "-"}"</b></div>
                                    <div className="bg-cream/20 p-1.5 rounded border border-light/50"><span className="text-muted-grey text-[9px] block">Patt (Thigh):</span><b>{pentMeas?.patt || pentMeas?.pentPatt || "-"}"</b></div>
                                    <div className="bg-cream/20 p-1.5 rounded border border-light/50"><span className="text-muted-grey text-[9px] block">Bottom:</span><b>{pentMeas?.bottom || pentMeas?.pentBottom || "-"}"</b></div>
                                    <div className="bg-cream/20 p-1.5 rounded border border-light/50"><span className="text-muted-grey text-[9px] block">Length:</span><b>{pentMeas?.length || pentMeas?.pentLength || "-"}"</b></div>
                                    <div className="bg-cream/20 p-1.5 rounded border border-light/50"><span className="text-muted-grey text-[9px] block">Inlength:</span><b>{pentMeas?.inlength || pentMeas?.pentInlength || "-"}"</b></div>
                                    <div className="bg-cream/20 p-1.5 rounded border border-light/50"><span className="text-muted-grey text-[9px] block">Knee:</span><b>{pentMeas?.knee || pentMeas?.pentKnee || "-"}"</b></div>
                                  </>
                                )}

                                {isVest && (
                                  <>
                                    <div className="bg-cream/20 p-1.5 rounded border border-light/50"><span className="text-muted-grey text-[9px] block">Length:</span><b>{vestMeas?.length || vestMeas?.vestLength || "-"}"</b></div>
                                    <div className="bg-cream/20 p-1.5 rounded border border-light/50"><span className="text-muted-grey text-[9px] block">Chest:</span><b>{vestMeas?.chest || vestMeas?.vestChest || "-"}"</b></div>
                                    <div className="bg-cream/20 p-1.5 rounded border border-light/50"><span className="text-muted-grey text-[9px] block">Waist:</span><b>{vestMeas?.waist || vestMeas?.vestWaist || "-"}"</b></div>
                                    <div className="bg-cream/20 p-1.5 rounded border border-light/50"><span className="text-muted-grey text-[9px] block">Hip:</span><b>{vestMeas?.hip || vestMeas?.vestHip || "-"}"</b></div>
                                    <div className="bg-cream/20 p-1.5 rounded border border-light/50"><span className="text-muted-grey text-[9px] block">Tira:</span><b>{vestMeas?.tira || vestMeas?.vestTira || "-"}"</b></div>
                                    <div className="bg-cream/20 p-1.5 rounded border border-light/50"><span className="text-muted-grey text-[9px] block">Neck:</span><b>{vestMeas?.neck || vestMeas?.vestNeck || "-"}"</b></div>
                                  </>
                                )}

                                {isShirt && (
                                  <>
                                    <div className="bg-cream/20 p-1.5 rounded border border-light/50"><span className="text-muted-grey text-[9px] block">Length:</span><b>{shirtMeas?.length || shirtMeas?.shirtLength || "-"}"</b></div>
                                    <div className="bg-cream/20 p-1.5 rounded border border-light/50"><span className="text-muted-grey text-[9px] block">Chest:</span><b>{shirtMeas?.chest || shirtMeas?.shirtChest || "-"}"</b></div>
                                    <div className="bg-cream/20 p-1.5 rounded border border-light/50"><span className="text-muted-grey text-[9px] block">Waist:</span><b>{shirtMeas?.waist || shirtMeas?.shirtWaist || "-"}"</b></div>
                                    <div className="bg-cream/20 p-1.5 rounded border border-light/50"><span className="text-muted-grey text-[9px] block">Arms:</span><b>{shirtMeas?.arms || shirtMeas?.shirtArms || "-"}"</b></div>
                                    <div className="bg-cream/20 p-1.5 rounded border border-light/50"><span className="text-muted-grey text-[9px] block">Neck:</span><b>{shirtMeas?.neck || shirtMeas?.shirtNeck || "-"}"</b></div>
                                    <div className="bg-cream/20 p-1.5 rounded border border-light/50"><span className="text-muted-grey text-[9px] block">Front:</span><b>{shirtMeas?.front || shirtMeas?.shirtFront || "-"}"</b></div>
                                    <div className="bg-cream/20 p-1.5 rounded border border-light/50"><span className="text-muted-grey text-[9px] block">Moda:</span><b>{shirtMeas?.moda || shirtMeas?.shirtModa || "-"}"</b></div>
                                    <div className="bg-cream/20 p-1.5 rounded border border-light/50"><span className="text-muted-grey text-[9px] block">Bicep:</span><b>{shirtMeas?.bicep || shirtMeas?.shirtBicep || "-"}"</b></div>
                                  </>
                                )}

                                {/* Fallback if unknown garment category */}
                                {!isCoat && !isPent && !isVest && !isShirt && (
                                  <div className="col-span-full text-muted-grey italic text-[10px]">
                                    Standard bespoke measurement specifications applied.
                                  </div>
                                )}
                              </div>
                            ) : (
                              <p className="text-muted-grey text-[10px] italic">No measurements recorded for this garment yet.</p>
                            )}

                            {/* Additional line item measurement values if key-value object exists */}
                            {item.measurementValues && Object.keys(item.measurementValues).length > 0 && (() => {
                              const validSpecs = Object.entries(item.measurementValues).filter(([k, v]) => {
                                if (!v) return false;
                                if (typeof v === "object") return false;
                                if (["designNotes", "remarks", "fabricSelected", "liningChoice"].includes(k)) return false;
                                return String(v).trim().length > 0;
                              });

                              if (validSpecs.length === 0) return null;

                              return (
                                <div className="pt-2 border-t border-light/40">
                                  <span className="text-[10px] font-bold text-navy block mb-1">Custom Recorded Specs:</span>
                                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 font-mono text-[10px]">
                                    {validSpecs.map(([k, v]) => (
                                      <div key={k} className="bg-cream/30 p-1 rounded">
                                        <span className="text-muted-grey">{k}:</span> <b>{String(v)}</b>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>

              {/* Order history timelines logs */}
              <div className="bg-white rounded-3xl border border-light shadow-sm p-5 space-y-4">
                <h3 className="text-sm font-bold text-navy uppercase tracking-wider border-b border-light pb-2.5">
                  Production Transition Logs
                </h3>
                <div className="space-y-4">
                  {selectedOrder!.statusHistory.map((h, idx) => (
                    <div key={idx} className="flex gap-3 items-start text-xs">
                      <div className="w-1.5 h-1.5 bg-gold rounded-full mt-1.5" />
                      <div>
                        <p className="font-semibold text-charcoal">Status advanced to "{h.status}"</p>
                        <p className="text-[10px] text-muted-grey">
                          Logged: {new Date(h.timestamp).toLocaleDateString("en-IN", {
                            day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
                          })} &bull; Processed by: {h.updatedBy}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>

            {/* Right Box: Order details, notes, fabric */}
            <div className="md:col-span-4 space-y-6">
              
              {/* Brief customer info */}
              {selectedOrderCustomer && (
                <div className="bg-white rounded-3xl border border-light shadow-sm p-4.5 space-y-3">
                  <h4 className="text-xs font-bold text-navy uppercase tracking-wider border-b border-light pb-1.5">Customer details</h4>
                  <div className="space-y-1.5">
                    <p className="font-serif font-bold text-navy text-sm">{selectedOrderCustomer.fullName}</p>
                    <p className="text-muted-grey font-mono">{selectedOrderCustomer.mobileNumber}</p>
                    <p className="text-muted-grey leading-relaxed">{selectedOrderCustomer.address || "Showroom Collection"}</p>
                  </div>
                </div>
              )}

              {/* Financial Ledger card */}
              <OrderLedgerCard orderId={selectedOrder!.id} />

              {/* Order Remarks & Instructions Card */}
              <OrderRemarksCard 
                order={selectedOrder!} 
                measurement={selectedOrderMeasurement} 
                onUpdate={() => setOrders(db.getOrders())} 
              />

            </div>

          </div>
        </div>
      )}

      {/* =====================================================================
          ORDER PLACEMENT CREATION MODAL
      ===================================================================== */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/60 backdrop-blur-xs p-4 sm:p-6 overflow-y-auto">
          <div className="bg-white w-full max-w-4xl rounded-3xl border border-light shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-fade-in font-sans text-charcoal">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-light bg-cream/40 flex justify-between items-center flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gold/15 flex items-center justify-center text-gold border border-gold/30">
                  <Scissors className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-serif font-bold text-navy">Book New Bespoke Order</h2>
                  <p className="text-muted-grey text-xs">Register bespoke client order, sizing tape records, fabric, and tailor schedule</p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => {
                  setIsCreateOpen(false);
                  handleResetForm();
                }}
                className="text-muted-grey hover:text-navy p-2 rounded-xl hover:bg-white/80 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {successData ? (
              /* SUCCESS SCREEN */
              <div className="p-8 text-center space-y-5 flex flex-col items-center justify-center overflow-y-auto">
                <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center text-green-600 border border-green-200 shadow-sm">
                  <CheckCircle className="w-10 h-10" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-2xl font-serif font-bold text-navy">Order Registered Successfully!</h3>
                  <p className="text-muted-grey text-sm">
                    Bespoke order <b className="text-gold font-mono font-bold">{successData.orderNumber}</b> has been recorded for <b className="text-charcoal font-bold">{successData.customerName}</b>.
                  </p>
                  <p className="text-xs text-muted-grey">
                    Expected Delivery: <b className="text-navy font-semibold">{new Date(successData.deliveryDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</b> &bull; Total: <b className="text-navy">₹{successData.totalAmount.toLocaleString("en-IN")}</b> &bull; Balance Due: <b className="text-rose-600 font-mono">₹{successData.balanceDue.toLocaleString("en-IN")}</b>
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-3 w-full max-w-lg pt-4">
                  <button
                    type="button"
                    onClick={() => setIsPrintSlipOpen(true)}
                    className="flex-1 min-w-[140px] bg-navy text-white hover:bg-navy-hover font-bold py-3 px-4 rounded-2xl transition-all text-xs flex items-center justify-center gap-2 cursor-pointer shadow-md"
                  >
                    <Printer className="w-4 h-4 text-gold" />
                    Print Workshop Slip
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreateOpen(false);
                      handleResetForm();
                      const o = orders.find(ord => ord.id === successData.orderId);
                      if (o) setSelectedOrderId(o.id);
                    }}
                    className="flex-1 min-w-[140px] bg-cream/70 hover:bg-cream text-navy font-bold py-3 px-4 rounded-2xl border border-light transition-all text-xs cursor-pointer"
                  >
                    View Registered Order
                  </button>
                  <button
                    type="button"
                    onClick={handleResetForm}
                    className="flex-1 min-w-[140px] bg-gold hover:bg-gold/90 text-navy font-bold py-3 px-4 rounded-2xl transition-all text-xs cursor-pointer shadow-sm"
                  >
                    + Add Another Order
                  </button>
                </div>
              </div>
            ) : (
              /* FORM SCREEN */
              <form onSubmit={handleSaveOrder} className="flex flex-col flex-1 overflow-hidden">
                <div className="flex-1 overflow-y-auto p-6 space-y-6">

                  {/* STEP 1 — Customer Info */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-navy flex items-center gap-2 border-b border-light pb-2">
                      <span className="w-5 h-5 rounded-full bg-gold/15 text-gold flex items-center justify-center text-xs font-bold font-mono">1</span>
                      Customer Information
                    </h3>

                    {selectedCust ? (
                      <div className="bg-cream/30 p-4 rounded-2xl border border-gold/30 flex justify-between items-center gap-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="px-2 py-0.5 bg-gold/10 text-gold text-[9px] font-bold uppercase rounded border border-gold/20">Selected Returning Client</span>
                            {latestMeas && (
                              <span className="px-2 py-0.5 bg-navy/10 text-navy text-[9px] font-bold uppercase rounded border border-navy/20 flex items-center gap-1">
                                <Sparkles className="w-2.5 h-2.5 text-gold" /> Last Measurements Found
                              </span>
                            )}
                          </div>
                          <p className="font-serif font-bold text-navy text-lg">{selectedCust.fullName}</p>
                          <p className="text-muted-grey text-xs">Mobile: {custMobile} &bull; Address: {custAddress}</p>
                        </div>
                        <button 
                          type="button" 
                          onClick={() => {
                            setSelectedCust(null);
                            setCustName(customerSearchQuery);
                            setCustMobile("");
                            setCustAddress("");
                          }}
                          className="text-muted-grey hover:text-red-600 p-1.5 rounded-full hover:bg-red-50 transition-colors cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3.5">
                        {/* Search Input */}
                        <div className="relative">
                          <label className="text-[11px] font-bold text-navy uppercase tracking-wider block mb-1">Search returning customer or type new name</label>
                          <div className="relative">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-grey" />
                            <input 
                              type="text" 
                              value={customerSearchQuery}
                              onChange={e => handleSearchChange(e.target.value)}
                              placeholder="Search by name / mobile number..."
                              className="w-full bg-cream/5 border border-light pl-10 pr-4 py-2.5 text-xs rounded-xl text-charcoal font-semibold focus:border-gold focus:outline-none transition-colors"
                            />
                          </div>
                          {/* Suggested dropdown */}
                          {showCustomerDropdown && matchedCustomers.length > 0 && (
                            <div className="absolute z-20 w-full mt-1 bg-white border border-light rounded-2xl shadow-lg max-h-48 overflow-y-auto divide-y divide-light">
                              {matchedCustomers.map(c => (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => handleSelectCustomer(c)}
                                  className="w-full text-left p-3 hover:bg-cream/20 text-xs font-semibold flex flex-col gap-0.5 text-charcoal cursor-pointer"
                                >
                                  <span className="font-serif text-navy text-sm font-bold">{c.fullName}</span>
                                  <span className="text-muted-grey">Mobile: {c.mobileNumber} &bull; {c.address}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Manual details */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold text-muted-grey uppercase">Full Name <span className="text-red-500">*</span></label>
                            <input 
                              type="text" 
                              value={custName}
                              onChange={e => setCustName(e.target.value)}
                              placeholder="Enter full name"
                              required
                              className="w-full bg-cream/5 border border-light p-2.5 text-xs rounded-xl text-charcoal font-semibold focus:border-gold focus:outline-none transition-colors"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold text-muted-grey uppercase">Mobile Number <span className="text-red-500">*</span></label>
                            <input 
                              type="text" 
                              value={custMobile}
                              onChange={e => setCustMobile(e.target.value)}
                              placeholder="Enter 10-digit mobile"
                              required
                              className="w-full bg-cream/5 border border-light p-2.5 text-xs rounded-xl text-charcoal font-semibold focus:border-gold focus:outline-none transition-colors"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold text-muted-grey uppercase">Address <span className="text-red-500">*</span></label>
                            <input 
                              type="text" 
                              value={custAddress}
                              onChange={e => setCustAddress(e.target.value)}
                              placeholder="Enter residential city / district"
                              required
                              className="w-full bg-cream/5 border border-light p-2.5 text-xs rounded-xl text-charcoal font-semibold focus:border-gold focus:outline-none transition-colors"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* STEP 2 — Quick Measurement Entry */}
                  <div className="space-y-4">
                    <div className="flex flex-wrap justify-between items-center gap-3 border-b border-light pb-2">
                      <h3 className="text-sm font-bold uppercase tracking-wider text-navy flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-gold/15 text-gold flex items-center justify-center text-xs font-bold font-mono">2</span>
                        Quick Measurement Entry
                      </h3>
                      {latestMeas && (
                        <button
                          type="button"
                          onClick={handleUseLastMeasurements}
                          className="bg-gold/10 hover:bg-gold/20 text-gold border border-gold/30 px-3 py-1 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-gold" />
                          Use Last Measurements
                        </button>
                      )}
                    </div>

                    {/* Garment checkboxes */}
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-navy uppercase tracking-wider block">Select Garments for this Order</label>
                      <div className="flex flex-wrap gap-2.5">
                        {garmentOptions.map(g => (
                          <label 
                            key={g}
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer select-none transition-all text-xs font-semibold ${
                              selectedGarments[g] 
                                ? "bg-gold/10 border-gold text-gold shadow-sm" 
                                : "bg-cream/5 hover:bg-cream border-light text-charcoal"
                            }`}
                          >
                            <input 
                              type="checkbox" 
                              checked={selectedGarments[g]}
                              onChange={() => setSelectedGarments({
                                ...selectedGarments,
                                [g]: !selectedGarments[g]
                              })}
                              className="w-4 h-4 text-gold accent-gold focus:ring-gold border-light rounded"
                            />
                            {g}
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Dynamic measurement sub-sections */}
                    <div className="space-y-4">
                      {/* Coat measurements */}
                      {selectedGarments["Coat/Indo Western"] && (
                        <div className="bg-cream/15 p-4 rounded-2xl border border-light/50 space-y-3">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-navy border-b border-light pb-1.5 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-gold" />
                            Coat / Indo Western Measurements (Inches)
                          </h4>
                          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
                            {[
                              { key: "length", label: "Length" },
                              { key: "chest", label: "Chest" },
                              { key: "waist", label: "Waist" },
                              { key: "neck", label: "Neck" },
                              { key: "tira", label: "Tira" },
                              { key: "hb", label: "H.B." },
                              { key: "cback", label: "C/Back" },
                              { key: "arms", label: "Arms" },
                              { key: "bicep", label: "Bicep" },
                              { key: "front", label: "Front" },
                              { key: "moda", label: "Moda" },
                            ].map(f => (
                              <div key={f.key} className="space-y-1">
                                <label className="text-[10px] font-semibold text-muted-grey uppercase">{f.label}</label>
                                <input 
                                  type="text" 
                                  value={(coatValues as any)[f.key]} 
                                  onChange={e => setCoatValues({ ...coatValues, [f.key]: e.target.value })} 
                                  placeholder="Inches"
                                  className="w-full bg-white border border-light p-1.5 px-2.5 text-xs rounded-xl text-charcoal font-semibold focus:border-gold focus:outline-none transition-colors"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Pent measurements */}
                      {selectedGarments["Pent"] && (
                        <div className="bg-cream/15 p-4 rounded-2xl border border-light/50 space-y-3">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-navy border-b border-light pb-1.5 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-gold" />
                            Pent Measurements (Inches)
                          </h4>
                          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2.5">
                            {[
                              { key: "length", label: "Length" },
                              { key: "inlength", label: "Inlength" },
                              { key: "waist", label: "Waist" },
                              { key: "hips", label: "Hips" },
                              { key: "patt", label: "Patt" },
                              { key: "knee", label: "Knee" },
                              { key: "bottom", label: "Bottom" },
                            ].map(f => (
                              <div key={f.key} className="space-y-1">
                                <label className="text-[10px] font-semibold text-muted-grey uppercase">{f.label}</label>
                                <input 
                                  type="text" 
                                  value={(pentValues as any)[f.key]} 
                                  onChange={e => setPentValues({ ...pentValues, [f.key]: e.target.value })} 
                                  placeholder="Inches"
                                  className="w-full bg-white border border-light p-1.5 px-2.5 text-xs rounded-xl text-charcoal font-semibold focus:border-gold focus:outline-none transition-colors"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Vest measurements */}
                      {selectedGarments["Vest"] && (
                        <div className="bg-cream/15 p-4 rounded-2xl border border-light/50 space-y-3">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-navy border-b border-light pb-1.5 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-gold" />
                            Vest Measurements (Inches)
                          </h4>
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
                            {[
                              { key: "length", label: "Length" },
                              { key: "chest", label: "Chest" },
                              { key: "waist", label: "Waist" },
                              { key: "hip", label: "Hip" },
                              { key: "tira", label: "Tira" },
                              { key: "neck", label: "Neck" },
                            ].map(f => (
                              <div key={f.key} className="space-y-1">
                                <label className="text-[10px] font-semibold text-muted-grey uppercase">{f.label}</label>
                                <input 
                                  type="text" 
                                  value={(vestValues as any)[f.key]} 
                                  onChange={e => setVestValues({ ...vestValues, [f.key]: e.target.value })} 
                                  placeholder="Inches"
                                  className="w-full bg-white border border-light p-1.5 px-2.5 text-xs rounded-xl text-charcoal font-semibold focus:border-gold focus:outline-none transition-colors"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Shirt/Kurta measurements */}
                      {selectedGarments["Shirt/Kurta"] && (
                        <div className="bg-cream/15 p-4 rounded-2xl border border-light/50 space-y-3">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-navy border-b border-light pb-1.5 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-gold" />
                            Shirt / Kurta Measurements (Inches)
                          </h4>
                          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
                            {[
                              { key: "length", label: "Length" },
                              { key: "chest", label: "Chest" },
                              { key: "waist", label: "Waist" },
                              { key: "hip", label: "Hip" },
                              { key: "tira", label: "Tira" },
                              { key: "arms", label: "Arms" },
                              { key: "neck", label: "Neck" },
                              { key: "cback", label: "C/Back" },
                              { key: "front", label: "Front" },
                              { key: "moda", label: "Moda" },
                              { key: "bicep", label: "Bicep" },
                            ].map(f => (
                              <div key={f.key} className="space-y-1">
                                <label className="text-[10px] font-semibold text-muted-grey uppercase">{f.label}</label>
                                <input 
                                  type="text" 
                                  value={(shirtValues as any)[f.key]} 
                                  onChange={e => setShirtValues({ ...shirtValues, [f.key]: e.target.value })} 
                                  placeholder="Inches"
                                  className="w-full bg-white border border-light p-1.5 px-2.5 text-xs rounded-xl text-charcoal font-semibold focus:border-gold focus:outline-none transition-colors"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* STEP 3 — Order, Pricing & Delivery Schedule */}
                  <div className="space-y-4 pb-4">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-navy flex items-center gap-2 border-b border-light pb-2">
                      <span className="w-5 h-5 rounded-full bg-gold/15 text-gold flex items-center justify-center text-xs font-bold font-mono">3</span>
                      Order, Pricing & Delivery Schedule
                    </h3>

                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-muted-grey uppercase">Serial / Slip Number</label>
                      <input 
                        type="text"
                        value={serialNumber}
                        onChange={e => setSerialNumber(e.target.value)}
                        placeholder="e.g. SN-1045"
                        className="w-full bg-cream/5 border border-light p-2.5 text-xs rounded-xl text-charcoal font-semibold focus:border-gold focus:outline-none transition-colors font-mono"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold text-muted-grey uppercase">Try-On Fit Date</label>
                        <input 
                          type="date"
                          value={tryOnDate}
                          onChange={e => setTryOnDate(e.target.value)}
                          className="w-full bg-cream/5 border border-light p-2.5 text-xs rounded-xl text-charcoal font-semibold focus:border-gold focus:outline-none transition-colors"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold text-muted-grey uppercase">Required Delivery Date <span className="text-red-500">*</span></label>
                        <input 
                          type="date"
                          value={deliveryDate}
                          onChange={e => setDeliveryDate(e.target.value)}
                          required
                          className="w-full bg-cream/5 border border-light p-2.5 text-xs rounded-xl text-charcoal font-semibold focus:border-gold focus:outline-none transition-colors"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold text-muted-grey uppercase">Total Billable Amount (₹)</label>
                        <input 
                          type="number"
                          value={totalAmount}
                          onChange={e => setTotalAmount(e.target.value)}
                          placeholder="e.g. 15000"
                          className="w-full bg-white border border-light p-2.5 text-xs rounded-xl text-charcoal font-semibold focus:border-gold focus:outline-none transition-colors font-mono"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold text-muted-grey uppercase">Advance Deposited (₹)</label>
                        <input 
                          type="number"
                          value={advancePaid}
                          onChange={e => setAdvancePaid(e.target.value)}
                          placeholder="e.g. 5000"
                          className="w-full bg-white border border-light p-2.5 text-xs rounded-xl text-charcoal font-semibold focus:border-gold focus:outline-none transition-colors font-mono"
                        />
                      </div>
                    </div>

                    {totalAmount && (
                      <div className="bg-cream/35 p-3.5 rounded-2xl border border-light/80 flex justify-between items-center text-xs">
                        <div className="space-y-0.5">
                          <span className="text-[10px] uppercase font-bold text-muted-grey tracking-wider">Financial Summary</span>
                          <p className="text-navy font-semibold font-sans">
                            Total: ₹{parseFloat(totalAmount).toLocaleString("en-IN")} &bull; Advance Received ({paymentMode}): ₹{(parseFloat(advancePaid) || 0).toLocaleString("en-IN")}
                          </p>
                        </div>
                        <span className="font-mono text-sm font-bold text-rose-600">
                          Balance Due: ₹{Math.max(0, parseFloat(totalAmount) - (parseFloat(advancePaid) || 0)).toLocaleString("en-IN")}
                        </span>
                      </div>
                    )}
                  </div>

                </div>

                {/* Form Action Footer */}
                <div className="p-4 border-t border-light bg-cream/30 flex justify-between items-center flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreateOpen(false);
                      handleResetForm();
                    }}
                    className="bg-white hover:bg-cream text-navy font-semibold px-5 py-2.5 rounded-2xl border border-light text-xs transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="bg-gold hover:bg-gold/90 text-navy font-bold py-3 px-8 rounded-2xl text-sm transition-all shadow-md active:scale-[0.98] cursor-pointer"
                  >
                    Save & Create Bespoke Order
                  </button>
                </div>
              </form>
            )}

          </div>
        </div>
      )}

      {/* PRINT WORKSHOP PRODUCTION SLIP MODAL */}
      {isPrintSlipOpen && successData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/70 backdrop-blur-xs p-4 sm:p-6 overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-3xl border border-light shadow-2xl p-6 sm:p-8 space-y-6 animate-fade-in text-charcoal font-sans">
            
            {/* Slip Header */}
            <div className="flex justify-between items-start border-b-2 border-navy pb-4">
              <div>
                <h2 className="text-xl font-serif font-bold text-navy uppercase tracking-wider">Signature Suitings & Tailors</h2>
                <p className="text-[11px] text-muted-grey">Workshop Production & Sizing Job Sheet</p>
              </div>
              <div className="text-right">
                <span className="text-xs font-mono font-bold bg-gold/15 text-navy px-2.5 py-1 rounded-lg border border-gold/30">
                  {successData.orderNumber}
                </span>
                <p className="text-[10px] text-muted-grey mt-1 font-mono">{new Date().toLocaleDateString("en-IN")}</p>
              </div>
            </div>

            {/* Client & Production Details */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-cream/30 p-3.5 rounded-2xl border border-light text-xs">
              <div>
                <span className="text-[10px] text-muted-grey uppercase font-bold block">Customer</span>
                <p className="font-bold text-navy">{successData.customerName}</p>
                <p className="text-muted-grey">{custMobile}</p>
              </div>
              <div>
                <span className="text-[10px] text-muted-grey uppercase font-bold block">Master Tailor</span>
                <p className="font-bold text-navy">{assignedTailor}</p>
                <span className={`px-1.5 py-0.2 text-[9px] rounded font-bold uppercase ${orderPriority === 'Urgent' ? 'bg-rose-100 text-rose-700' : 'bg-blue-100 text-navy'}`}>
                  {orderPriority}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-muted-grey uppercase font-bold block">Fit Try-On</span>
                <p className="font-semibold text-charcoal">{tryOnDate || "N/A"}</p>
              </div>
              <div>
                <span className="text-[10px] text-muted-grey uppercase font-bold block">Final Delivery</span>
                <p className="font-bold text-rose-700">{successData.deliveryDate}</p>
              </div>
            </div>

            {/* Garments & Measurements Snapshot */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-navy border-b border-light pb-1">
                Garments: {successData.garments.join(" + ")}
              </h4>

              {selectedGarments["Coat/Indo Western"] && (
                <div className="p-3 bg-cream/15 rounded-xl border border-light/60 space-y-1.5">
                  <span className="text-[11px] font-bold text-navy uppercase">Coat Sizing (Inches):</span>
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 text-xs">
                    {Object.entries(coatValues).filter(([_, v]) => v).map(([k, v]) => (
                      <div key={k} className="bg-white p-1 rounded border border-light/60 text-center">
                        <span className="text-[9px] text-muted-grey uppercase block">{k}</span>
                        <span className="font-mono font-bold text-navy">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedGarments["Pent"] && (
                <div className="p-3 bg-cream/15 rounded-xl border border-light/60 space-y-1.5">
                  <span className="text-[11px] font-bold text-navy uppercase">Pent Sizing (Inches):</span>
                  <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 text-xs">
                    {Object.entries(pentValues).filter(([_, v]) => v).map(([k, v]) => (
                      <div key={k} className="bg-white p-1 rounded border border-light/60 text-center">
                        <span className="text-[9px] text-muted-grey uppercase block">{k}</span>
                        <span className="font-mono font-bold text-navy">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedGarments["Vest"] && (
                <div className="p-3 bg-cream/15 rounded-xl border border-light/60 space-y-1.5">
                  <span className="text-[11px] font-bold text-navy uppercase">Vest Sizing (Inches):</span>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-xs">
                    {Object.entries(vestValues).filter(([_, v]) => v).map(([k, v]) => (
                      <div key={k} className="bg-white p-1 rounded border border-light/60 text-center">
                        <span className="text-[9px] text-muted-grey uppercase block">{k}</span>
                        <span className="font-mono font-bold text-navy">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedGarments["Shirt/Kurta"] && (
                <div className="p-3 bg-cream/15 rounded-xl border border-light/60 space-y-1.5">
                  <span className="text-[11px] font-bold text-navy uppercase">Shirt Sizing (Inches):</span>
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 text-xs">
                    {Object.entries(shirtValues).filter(([_, v]) => v).map(([k, v]) => (
                      <div key={k} className="bg-white p-1 rounded border border-light/60 text-center">
                        <span className="text-[9px] text-muted-grey uppercase block">{k}</span>
                        <span className="font-mono font-bold text-navy">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Fabric & Styling Specs */}
            <div className="p-3 bg-cream/20 rounded-xl border border-light/60 text-xs space-y-1">
              <p><b>Fabric:</b> {fabricBrand || "Selected Fabric"} &bull; <b>Color/Code:</b> {fabricColor || "Standard"} &bull; <b>Lapel:</b> {lapelStyle} &bull; <b>Vent:</b> {ventStyle}</p>
              {prefNotes && <p className="text-muted-grey italic"><b>Notes:</b> {prefNotes}</p>}
            </div>

            {/* Financials & Signatures */}
            <div className="flex justify-between items-center pt-2 text-xs border-t border-light">
              <div className="space-y-0.5">
                <p><b>Total:</b> ₹{successData.totalAmount.toLocaleString("en-IN")} &bull; <b>Adv ({paymentMode}):</b> ₹{successData.advancePaid.toLocaleString("en-IN")}</p>
                <p className="text-rose-600 font-bold font-mono">Balance: ₹{successData.balanceDue.toLocaleString("en-IN")}</p>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="bg-navy hover:bg-navy-hover text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <Printer className="w-4 h-4 text-gold" /> Print Slip
                </button>
                <button
                  type="button"
                  onClick={() => setIsPrintSlipOpen(false)}
                  className="bg-cream hover:bg-cream/80 text-navy font-semibold px-4 py-2 rounded-xl text-xs border border-light cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* =====================================================================
          ORDER SUMMARY PRINT PREVIEW DIALOG
      ===================================================================== */}
      {isPrintSummaryOpen && selectedOrder && selectedOrderCustomer && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50 animate-fade-in text-xs font-sans print:p-0 print:bg-white print:static print:z-auto">
          <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[92vh] overflow-y-auto shadow-2xl p-6 space-y-6 print:p-0 print:shadow-none print:max-h-none print:overflow-visible print:border-0 print:rounded-none">
            
            <div className="flex justify-between items-center border-b border-light pb-3 print:hidden">
              <span className="font-serif font-bold text-navy text-sm">Order Summary Print Preview</span>
              <div className="flex gap-2">
                <button 
                  onClick={() => window.print()}
                  className="bg-navy hover:bg-navy-hover text-white px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <Printer className="w-3.5 h-3.5 text-gold" />
                  Print Summary
                </button>
                <button 
                  onClick={() => setIsPrintSummaryOpen(false)}
                  className="bg-cream hover:bg-cream/80 text-navy px-4 py-2 rounded-xl text-xs font-semibold border border-light cursor-pointer transition-colors"
                >
                  Close
                </button>
              </div>
            </div>

            {/* Print paper mockup */}
            <div id="print-paper-slip" className="bg-white border-2 border-charcoal/80 p-6 text-charcoal space-y-6 max-w-[210mm] mx-auto print:border-0 print:p-0">
              
              {/* Header Letterhead */}
              <div className="text-center space-y-1 border-b-2 border-charcoal pb-4">
                <h1 className="text-2xl font-serif font-black tracking-wider uppercase">SIGNATURE SUITINGS</h1>
                <p className="text-[10px] font-sans font-bold tracking-widest text-charcoal/80">NEEL KANTH INDUSTRIES &bull; "THE SIGN OF COMFORT"</p>
                <p className="text-[9px] text-charcoal/70">
                  2, Tara Singh Avenue, Peer Dad Road, Jalandhar, Punjab, India &bull; Phones: 93572 51900, 95696 81900
                </p>
                <p className="text-[10px] font-mono font-bold uppercase text-navy pt-1.5">Bespoke Production Order Slip & Sizing Card</p>
              </div>

              {/* Order & Customer details grid */}
              <div className="grid grid-cols-2 gap-6 text-[10px] border-b border-charcoal/50 pb-4">
                <div className="space-y-1.5">
                  <h3 className="font-bold text-navy uppercase text-[9px] tracking-wider mb-1">Order Information</h3>
                  <p><b>Order Number:</b> {selectedOrder.orderNumber}</p>
                  <p><b>Date Booked:</b> {new Date(selectedOrder.orderDate).toLocaleDateString("en-IN", { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                  <p><b>Target Delivery Date:</b> <span className="font-bold">{new Date(selectedOrder.expectedDeliveryDate).toLocaleDateString("en-IN", { day: 'numeric', month: 'long', year: 'numeric' })}</span></p>
                  <p><b>Order Status:</b> <span className="uppercase font-bold text-navy">{selectedOrder.status}</span></p>
                  <p><b>Assigned Tailor:</b> {selectedOrder.assignedTailor || "Master Tailor (Signature)"}</p>
                </div>
                <div className="space-y-1.5">
                  <h3 className="font-bold text-navy uppercase text-[9px] tracking-wider mb-1">Customer Information</h3>
                  <p><b>Customer Name:</b> <span className="font-bold">{selectedOrderCustomer.fullName}</span></p>
                  <p><b>Mobile Number:</b> {selectedOrderCustomer.mobileNumber}</p>
                  <p><b>Address:</b> {selectedOrderCustomer.address || "Showroom Collection"}</p>
                  <p><b>Client Since:</b> {new Date(selectedOrderCustomer.customerSince).toLocaleDateString("en-IN", { month: 'short', year: 'numeric' })}</p>
                </div>
              </div>

              {/* Showroom Specs & Fabric Swatch */}
              <div className="grid grid-cols-2 gap-6 text-[10px] border-b border-charcoal/50 pb-4">
                <div className="space-y-1.5">
                  <h3 className="font-bold text-navy uppercase text-[9px] tracking-wider mb-1">Fabric & Style Specifications</h3>
                  <p><b>Garments Ordered:</b> {selectedOrder.garmentTypes.join(", ")}</p>
                  <p><b>Fabric Selected:</b> {selectedOrder.fabricDetails || "Raymond Premium Wool Blend"}</p>
                </div>
                {stripEmbeddedTags(selectedOrder.notes) && (
                  <div className="space-y-1.5">
                    <h3 className="font-bold text-navy uppercase text-[9px] tracking-wider mb-1">Designer remarks & styling notes</h3>
                    <p className="whitespace-pre-wrap leading-relaxed">{stripEmbeddedTags(selectedOrder.notes)}</p>
                  </div>
                )}
              </div>

              {/* Sizing Card section */}
              {selectedOrderMeasurement ? (
                <div className="space-y-4">
                  <div className="flex justify-between items-center border-b border-charcoal pb-1.5">
                    <h3 className="font-bold text-navy uppercase text-[10px] tracking-wider">Linked Sizing Specifications (Slip {selectedOrderMeasurement.slipNumber}){selectedOrderMeasurement.coatIndoWestern?.serialNumber ? ` - Serial: ${selectedOrderMeasurement.coatIndoWestern.serialNumber}` : ""}</h3>
                    <span className="text-[8px] font-mono text-muted-grey">Recorded: {new Date(selectedOrderMeasurement.versionDate).toLocaleDateString()}</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-[10px]">
                    {/* Coat Column */}
                    {(selectedOrder.garmentTypes.some(g => {
                      const l = g.toLowerCase();
                      return l.includes("coat") || l.includes("indo") || l.includes("blazer") || l.includes("sherwani") || l.includes("suit") || l.includes("achkan") || l.includes("jodhpuri") || l.includes("jacket") || l.includes("2pc") || l.includes("3pc");
                    }) || Object.values(selectedOrderMeasurement.coatIndoWestern || {}).some(v => v && v !== "-")) && (
                      <div className="border border-charcoal/30 rounded-lg p-2.5 space-y-1.5">
                        <span className="font-bold text-navy uppercase text-[9px] tracking-wider block border-b border-charcoal/20 pb-1">Coat / Indo Western</span>
                        <div className="grid grid-cols-2 gap-y-1 gap-x-2 font-mono text-[10px]">
                          <div>Length:</div><div className="font-bold">{selectedOrderMeasurement.coatIndoWestern?.length || "-"}"</div>
                          <div>Chest:</div><div className="font-bold">{selectedOrderMeasurement.coatIndoWestern?.chest || "-"}"</div>
                          <div>Waist:</div><div className="font-bold">{selectedOrderMeasurement.coatIndoWestern?.waist || "-"}"</div>
                          <div>Neck:</div><div className="font-bold">{selectedOrderMeasurement.coatIndoWestern?.neck || "-"}"</div>
                          <div>Tira:</div><div className="font-bold">{selectedOrderMeasurement.coatIndoWestern?.tira || "-"}"</div>
                          <div>H.B.:</div><div className="font-bold">{selectedOrderMeasurement.coatIndoWestern?.hb || "-"}"</div>
                          <div>C/Back:</div><div className="font-bold">{selectedOrderMeasurement.coatIndoWestern?.cback || "-"}"</div>
                          <div>Arms:</div><div className="font-bold">{selectedOrderMeasurement.coatIndoWestern?.arms || "-"}"</div>
                          <div>Bicep:</div><div className="font-bold">{selectedOrderMeasurement.coatIndoWestern?.bicep || selectedOrderMeasurement.shirtKurta?.bicep || "-"}"</div>
                          <div>Front:</div><div className="font-bold">{selectedOrderMeasurement.coatIndoWestern?.front || selectedOrderMeasurement.shirtKurta?.front || "-"}"</div>
                          <div>Moda:</div><div className="font-bold">{selectedOrderMeasurement.coatIndoWestern?.moda || selectedOrderMeasurement.shirtKurta?.moda || "-"}"</div>
                        </div>
                      </div>
                    )}

                    {/* Pants Column */}
                    {(selectedOrder.garmentTypes.some(g => {
                      const l = g.toLowerCase();
                      return l.includes("pent") || l.includes("pant") || l.includes("trouser") || l.includes("pajama") || l.includes("salwar");
                    }) || Object.values(selectedOrderMeasurement.pent || {}).some(v => v && v !== "-")) && (
                      <div className="border border-charcoal/30 rounded-lg p-2.5 space-y-1.5">
                        <span className="font-bold text-navy uppercase text-[9px] tracking-wider block border-b border-charcoal/20 pb-1">Pants / Trousers</span>
                        <div className="grid grid-cols-2 gap-y-1 gap-x-2 font-mono text-[10px]">
                          <div>Length:</div><div className="font-bold">{selectedOrderMeasurement.pent?.length || "-"}"</div>
                          <div>Inlength:</div><div className="font-bold">{selectedOrderMeasurement.pent?.inlength || "-"}"</div>
                          <div>Waist:</div><div className="font-bold">{selectedOrderMeasurement.pent?.waist || "-"}"</div>
                          <div>Hips:</div><div className="font-bold">{selectedOrderMeasurement.pent?.hips || "-"}"</div>
                          <div>Patt:</div><div className="font-bold">{selectedOrderMeasurement.pent?.patt || "-"}"</div>
                          <div>Knee:</div><div className="font-bold">{selectedOrderMeasurement.pent?.knee || "-"}"</div>
                          <div>Bottom:</div><div className="font-bold">{selectedOrderMeasurement.pent?.bottom || "-"}"</div>
                        </div>
                      </div>
                    )}

                    {/* Shirt Column */}
                    {(selectedOrder.garmentTypes.some(g => {
                      const l = g.toLowerCase();
                      return l.includes("shirt") || l.includes("kurta") || l.includes("kameez");
                    }) || Object.values(selectedOrderMeasurement.shirtKurta || {}).some(v => v && v !== "-")) && (
                      <div className="border border-charcoal/30 rounded-lg p-2.5 space-y-1.5">
                        <span className="font-bold text-navy uppercase text-[9px] tracking-wider block border-b border-charcoal/20 pb-1">Shirt / Kurta</span>
                        <div className="grid grid-cols-2 gap-y-1 gap-x-2 font-mono text-[10px]">
                          <div>Length:</div><div className="font-bold">{selectedOrderMeasurement.shirtKurta?.length || "-"}"</div>
                          <div>Chest:</div><div className="font-bold">{selectedOrderMeasurement.shirtKurta?.chest || "-"}"</div>
                          <div>Waist:</div><div className="font-bold">{selectedOrderMeasurement.shirtKurta?.waist || "-"}"</div>
                          <div>Arms:</div><div className="font-bold">{selectedOrderMeasurement.shirtKurta?.arms || "-"}"</div>
                          <div>Neck:</div><div className="font-bold">{selectedOrderMeasurement.shirtKurta?.neck || "-"}"</div>
                          <div>C/Back:</div><div className="font-bold">{selectedOrderMeasurement.shirtKurta?.cback || "-"}"</div>
                          <div>Front:</div><div className="font-bold">{selectedOrderMeasurement.shirtKurta?.front || "-"}"</div>
                          <div>Moda:</div><div className="font-bold">{selectedOrderMeasurement.shirtKurta?.moda || "-"}"</div>
                          <div>Bicep:</div><div className="font-bold">{selectedOrderMeasurement.shirtKurta?.bicep || "-"}"</div>
                        </div>
                      </div>
                    )}

                    {/* Vest Column (if ordered or available) */}
                    {(selectedOrder.garmentTypes.some(g => {
                      const l = g.toLowerCase();
                      return l.includes("vest") || l.includes("waistcoat") || l.includes("sadri") || l.includes("koti");
                    }) || Object.values(selectedOrderMeasurement.vest || {}).some(v => v && v !== "-")) && (
                      <div className="border border-charcoal/30 rounded-lg p-2.5 space-y-1.5">
                        <span className="font-bold text-navy uppercase text-[9px] tracking-wider block border-b border-charcoal/20 pb-1">Vest</span>
                        <div className="grid grid-cols-2 gap-y-1 gap-x-2 font-mono text-[10px]">
                          <div>Length:</div><div className="font-bold">{selectedOrderMeasurement.vest?.length || "-"}"</div>
                          <div>Chest:</div><div className="font-bold">{selectedOrderMeasurement.vest?.chest || "-"}"</div>
                          <div>Waist:</div><div className="font-bold">{selectedOrderMeasurement.vest?.waist || "-"}"</div>
                          <div>Hip:</div><div className="font-bold">{selectedOrderMeasurement.vest?.hip || "-"}"</div>
                          <div>Tira:</div><div className="font-bold">{selectedOrderMeasurement.vest?.tira || "-"}"</div>
                          <div>Neck:</div><div className="font-bold">{selectedOrderMeasurement.vest?.neck || "-"}"</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-[10px] text-muted-grey italic">No sizing specifications card is currently linked to this order.</p>
              )}

              {/* Remarks/Signatures Footer (Section 8.1 / Section 1.1) */}
              <div className="border-t-2 border-charcoal pt-6 mt-6 grid grid-cols-3 gap-4 text-[9px] font-sans font-semibold text-charcoal/90">
                <div className="space-y-1.5 col-span-1">
                  <p className="leading-relaxed">Please check garments at trial. Alterations can be recorded on delivery.</p>
                  <p className="text-[7px] text-charcoal/60">Signature Suitings &bull; Custom Work Order</p>
                </div>
                <div className="flex flex-col justify-end items-center h-16 pt-4 col-span-1">
                  <span className="border-t border-charcoal/60 w-32 text-center text-[9px] uppercase tracking-wider text-charcoal/80 pt-1">
                    Master Cutter/Tailor
                  </span>
                </div>
                <div className="flex flex-col justify-end items-end h-16 pt-4 col-span-1">
                  <span className="border-t border-charcoal/60 w-32 text-center text-[9px] uppercase tracking-wider text-charcoal/80 pt-1">
                    Authorised Signature
                  </span>
                </div>
              </div>

            </div>

            <div className="flex justify-end gap-3 print:hidden">
              <button 
                onClick={() => setIsPrintSummaryOpen(false)}
                className="bg-navy hover:bg-navy-hover text-white font-semibold font-sans px-5 py-2.5 rounded-xl text-xs transition-colors cursor-pointer"
              >
                Close Preview
              </button>
            </div>

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

function OrderFinancialCell({ orderId }: { orderId: string }) {
  const invoice = db.getInvoiceByOrderId(orderId);
  if (!invoice) {
    return (
      <span className="inline-block px-2 py-0.5 bg-gray-50 border border-gray-200 text-gray-500 rounded font-semibold text-[10px]">
        No Invoice
      </span>
    );
  }
  const total = invoice.grandTotal;
  const advance = invoice.advancePaid;
  const pending = invoice.balanceDue;
  return (
    <div className="space-y-1 text-left min-w-[130px] max-w-[170px] bg-cream/20 p-2 rounded-xl border border-light/60">
      <div className="flex justify-between gap-2 text-charcoal">
        <span className="text-muted-grey">Total:</span>
        <span className="font-mono font-bold">₹{total.toLocaleString("en-IN")}</span>
      </div>
      <div className="flex justify-between gap-2 text-green-700 font-medium">
        <span>Adv Paid:</span>
        <span className="font-mono">₹{advance.toLocaleString("en-IN")}</span>
      </div>
      <div className="flex justify-between gap-2 text-red-600 font-bold border-t border-light pt-0.5 mt-0.5">
        <span>Pending:</span>
        <span className="font-mono">₹{pending.toLocaleString("en-IN")}</span>
      </div>
    </div>
  );
}

function OrderLedgerCard({ orderId }: { orderId: string }) {
  const invoice = db.getInvoiceByOrderId(orderId);
  if (!invoice) return null;
  return (
    <div className="bg-white rounded-3xl border border-light shadow-sm p-4.5 space-y-3.5">
      <h4 className="text-xs font-bold text-navy uppercase tracking-wider border-b border-light pb-1.5 flex items-center justify-between">
        <span>Order Financial Ledger</span>
        <span className={`px-2 py-0.5 rounded-full font-bold uppercase tracking-wider text-[8px] border ${
          invoice.paymentStatus === "Paid" 
            ? "bg-green-50 border-green-200 text-green-700" 
            : invoice.paymentStatus === "Partially Paid" 
            ? "bg-amber-50 border-amber-200 text-amber-700"
            : "bg-red-50 border-red-200 text-red-700"
        }`}>
          {invoice.paymentStatus}
        </span>
      </h4>
      <div className="space-y-2">
        <div className="flex justify-between items-center text-xs">
          <span className="text-muted-grey font-medium">Total Bill:</span>
          <span className="font-mono font-bold text-navy text-sm">₹{invoice.grandTotal.toLocaleString("en-IN")}</span>
        </div>
        <div className="flex justify-between items-center text-xs text-green-700 font-semibold">
          <span>Advance Paid:</span>
          <span className="font-mono">₹{invoice.advancePaid.toLocaleString("en-IN")}</span>
        </div>
        <div className="flex justify-between items-center text-xs text-red-600 font-bold border-t border-light pt-2 mt-1">
          <span>Pending Balance:</span>
          <span className="font-mono text-sm">₹{invoice.balanceDue.toLocaleString("en-IN")}</span>
        </div>
      </div>
    </div>
  );
}

function OrderRemarksCard({
  order,
  measurement,
  onUpdate
}: {
  order: Order;
  measurement?: Measurement | null;
  onUpdate: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [remarksText, setRemarksText] = useState(stripEmbeddedTags(order.notes) || "");

  useEffect(() => {
    setRemarksText(stripEmbeddedTags(order.notes) || "");
  }, [order.id, order.notes]);

  const handleSave = () => {
    db.updateOrder(order.id, { notes: remarksText });
    setIsEditing(false);
    onUpdate();
  };

  const currentNotes = stripEmbeddedTags(order.notes);
  const designNotes = stripEmbeddedTags(measurement?.designNotes);
  const stitchRemarks = stripEmbeddedTags(measurement?.remarks);

  return (
    <div className="bg-white rounded-3xl border border-light shadow-sm p-4.5 space-y-3">
      <div className="flex items-center justify-between border-b border-light pb-2">
        <h4 className="text-xs font-bold text-navy uppercase tracking-wider flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5 text-gold" />
          Order Remarks & Instructions
        </h4>
        <button
          onClick={() => {
            if (isEditing) {
              handleSave();
            } else {
              setIsEditing(true);
            }
          }}
          className="text-[10px] font-bold text-navy bg-cream/60 hover:bg-gold/20 border border-gold/30 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
        >
          {isEditing ? (
            <>
              <Check className="w-3 h-3 text-green-700" />
              <span>Save</span>
            </>
          ) : (
            <>
              <Edit2 className="w-3 h-3 text-navy" />
              <span>Edit Remarks</span>
            </>
          )}
        </button>
      </div>

      {isEditing ? (
        <div className="space-y-2">
          <textarea
            value={remarksText}
            onChange={(e) => setRemarksText(e.target.value)}
            rows={3}
            placeholder="Type custom cutting/stitching remarks or special instructions for tailors..."
            className="w-full bg-cream/10 p-2.5 border border-light rounded-xl text-xs text-navy focus:outline-hidden focus:border-gold font-sans"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setRemarksText(stripEmbeddedTags(order.notes) || "");
                setIsEditing(false);
              }}
              className="text-[10px] px-2.5 py-1 text-muted-grey hover:text-navy border border-light rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="text-[10px] font-bold px-3 py-1 bg-navy text-gold rounded-lg shadow-xs cursor-pointer"
            >
              Save Remarks
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2 text-xs">
          {currentNotes ? (
            <div className="bg-cream/15 p-2.5 rounded-xl border border-light/60">
              <span className="text-[10px] font-bold text-gold uppercase tracking-wider block mb-0.5">Order Notes & Instructions:</span>
              <p className="text-charcoal leading-relaxed whitespace-pre-wrap">{currentNotes}</p>
            </div>
          ) : (
            <p className="text-muted-grey italic text-[11px]">No order remarks entered yet. Click 'Edit Remarks' to add special instructions.</p>
          )}

          {/* Sizing & Tailor Master Remarks from measurement if linked */}
          {(designNotes || stitchRemarks) && (
            <div className="pt-2 border-t border-light/50 space-y-1.5">
              <span className="text-[10px] font-bold text-navy uppercase tracking-wider block">Linked Measurement Remarks:</span>
              {designNotes && (
                <div className="bg-cream/20 p-2 rounded-lg border border-light/40 text-[11px]">
                  <b className="text-navy">Cutting Master Notes:</b> {designNotes}
                </div>
              )}
              {stitchRemarks && (
                <div className="bg-cream/20 p-2 rounded-lg border border-light/40 text-[11px]">
                  <b className="text-navy">Stitching Tailor Remarks:</b> {stitchRemarks}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
