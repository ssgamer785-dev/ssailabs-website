/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import {
  X,
  Plus,
  Trash2,
  AlertTriangle,
  Save,
  Loader2,
  CheckCircle2,
  DollarSign,
  Scissors,
  Ruler,
  ShoppingBag,
  FileText
} from "lucide-react";
import {
  Order,
  Invoice,
  InvoiceLineItem,
  Customer,
  OrderStatus,
  GarmentLineItem
} from "../types";
import { db, stripEmbeddedTags, decodeEmbeddedJSON } from "../db";
import { isSupabaseConfigured, supabase } from "../supabase";
import { GarmentMeasurementDrawer } from "./GarmentMeasurementDrawer";

interface EditOrderModalProps {
  orderId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function EditOrderModal({ orderId, isOpen, onClose, onSuccess }: EditOrderModalProps) {
  // Loading and error states
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);
  const [isDeletingOrder, setIsDeletingOrder] = useState<boolean>(false);
  const [deleteSuccessMsg, setDeleteSuccessMsg] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<{ message: string; details?: string } | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  // Reference data
  const [orderCustomer, setOrderCustomer] = useState<Customer | null>(null);

  // Form Fields - Order Header
  const [orderNumber, setOrderNumber] = useState<string>("");
  const [customerId, setCustomerId] = useState<string>("");
  const [orderDate, setOrderDate] = useState<string>("");
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState<string>("");
  const [status, setStatus] = useState<OrderStatus>("Pending");
  const [assignedTailor, setAssignedTailor] = useState<string>("");
  const [fabricDetails, setFabricDetails] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [linkedMeasurementVersionId, setLinkedMeasurementVersionId] = useState<string>("");

  // Form Fields - Garment Line Items & Financials
  const [garmentLineItems, setGarmentLineItems] = useState<GarmentLineItem[]>([]);
  const [discount, setDiscount] = useState<number>(0);
  const [taxPercent, setTaxPercent] = useState<number>(0);

  // Selected Item for Measurements Drawer
  const [selectedLineItemForMeasurements, setSelectedLineItemForMeasurements] = useState<GarmentLineItem | null>(null);

  // Core Garment Types Quick-Add Buttons
  const coreGarments = [
    { name: "Indo-Western", category: "Ethnic", price: 3500 },
    { name: "Pant / Trouser", category: "Trousers", price: 1200 },
    { name: "Vest / Waistcoat", category: "Vests", price: 1500 },
    { name: "Shirt / Kurta", category: "Shirts", price: 1000 },
    { name: "Coat / Blazer", category: "Outerwear", price: 2500 },
  ];

  // Load fresh order & invoice data
  useEffect(() => {
    let isMounted = true;

    async function loadFreshData() {
      if (!orderId) return;
      setLoading(true);
      setFetchError(null);
      setSaveError(null);
      setSaveSuccess(false);

      try {
        let freshOrder: Order | null = db.getOrders().find(o => o.id === orderId) || null;
        let freshInvoice: Invoice | null = null;

        if (isSupabaseConfigured) {
          try {
            const { data: orderData, error: orderErr } = await supabase
              .from("orders")
              .select("*")
              .eq("id", orderId)
              .single();

            if (!orderErr && orderData) {
              const decodedLines = decodeEmbeddedJSON<any[]>(orderData.notes, "GARMENT_ITEMS");
              const decodedHist = decodeEmbeddedJSON<any[]>(orderData.notes, "STATUS_HIST");
              const gItems = (orderData.garmentLineItems && Array.isArray(orderData.garmentLineItems) && orderData.garmentLineItems.length > 0)
                ? orderData.garmentLineItems
                : (decodedLines && Array.isArray(decodedLines) && decodedLines.length > 0 ? decodedLines : (freshOrder?.garmentLineItems || []));

              const sHist = (orderData.statusHistory && Array.isArray(orderData.statusHistory) && orderData.statusHistory.length > 0)
                ? orderData.statusHistory
                : (decodedHist && Array.isArray(decodedHist) && decodedHist.length > 0 ? decodedHist : (freshOrder?.statusHistory || []));

              freshOrder = {
                ...freshOrder,
                ...orderData,
                garmentLineItems: gItems,
                statusHistory: sHist
              } as Order;
            }

            const invoiceIdToQuery = freshOrder?.linkedInvoiceId;
            if (invoiceIdToQuery) {
              const { data: invData } = await supabase
                .from("invoices")
                .select("*")
                .eq("id", invoiceIdToQuery)
                .single();
              if (invData) {
                const decodedLineItems = decodeEmbeddedJSON<any[]>(invData.notes, "LINE_ITEMS");
                const decodedPayments = decodeEmbeddedJSON<any[]>(invData.notes, "PAYMENTS");
                freshInvoice = {
                  ...invData,
                  lineItems: invData.lineItems || decodedLineItems || [],
                  payments: invData.payments || decodedPayments || []
                } as Invoice;
              }
            }
          } catch (cloudErr) {
            console.warn("Could not fetch remote order in EditOrderModal (using local cache):", cloudErr);
          }
        }

        if (!freshOrder) {
          freshOrder = db.getOrders().find(o => o.id === orderId) || null;
        }

        if (!freshOrder) {
          if (isMounted) setFetchError("Order not found in database.");
          return;
        }

        if (!freshInvoice && freshOrder.linkedInvoiceId) {
          freshInvoice = db.getInvoiceById(freshOrder.linkedInvoiceId) || null;
        }
        if (!freshInvoice) {
          freshInvoice = db.getInvoices().find(i => i.linkedOrderId === orderId) || null;
        }

        if (isMounted) {
          setOrderNumber(freshOrder.orderNumber || "");
          setCustomerId(freshOrder.customerId || "");
          setOrderDate(freshOrder.orderDate || new Date().toISOString().split("T")[0]);
          setExpectedDeliveryDate(freshOrder.expectedDeliveryDate || "");
          setStatus(freshOrder.status || "Pending");
          setAssignedTailor(freshOrder.assignedTailor || "");
          setFabricDetails(freshOrder.fabricDetails || "");
          setNotes(stripEmbeddedTags(freshOrder.notes));
          setLinkedMeasurementVersionId(freshOrder.linkedMeasurementVersionId || "");

          const cust = db.getCustomerById(freshOrder.customerId);
          setOrderCustomer(cust || null);

          // Populate Garment Line Items
          if (freshOrder.garmentLineItems && freshOrder.garmentLineItems.length > 0) {
            setGarmentLineItems(freshOrder.garmentLineItems);
          } else if (freshOrder.garmentTypes && freshOrder.garmentTypes.length > 0) {
            const perItemRate = freshOrder.totalAmount ? Math.round(freshOrder.totalAmount / freshOrder.garmentTypes.length) : 1000;
            const mappedTypes: GarmentLineItem[] = freshOrder.garmentTypes.map((gType, idx) => ({
              id: `item-${Date.now()}-${idx}`,
              garmentName: gType,
              category: "Custom",
              quantity: 1,
              fabric: freshOrder?.fabricDetails || "",
              color: "",
              rate: perItemRate,
              discount: 0,
              amount: perItemRate,
              measurementValues: {},
              measurementStatus: "Pending",
              notes: ""
            }));
            setGarmentLineItems(mappedTypes);
          } else if (freshInvoice?.lineItems && freshInvoice.lineItems.length > 0) {
            const mappedItems: GarmentLineItem[] = freshInvoice.lineItems.map((invItem, idx) => ({
              id: `item-${Date.now()}-${idx}`,
              garmentName: invItem.description || "Garment Item",
              category: "Custom",
              quantity: invItem.quantity || 1,
              fabric: freshOrder?.fabricDetails || "",
              color: "",
              rate: invItem.rate || 0,
              discount: 0,
              amount: invItem.amount || 0,
              measurementValues: {},
              measurementStatus: "Pending",
              notes: ""
            }));
            setGarmentLineItems(mappedItems);
          } else {
            setGarmentLineItems([]);
          }

          if (freshInvoice) {
            setDiscount(freshInvoice.discount || 0);
            setTaxPercent(freshInvoice.taxPercent || 0);
          }
        }
      } catch (err: any) {
        console.error("Error loading order in modal:", err);
        if (isMounted) setFetchError(err.message || "Failed to load order.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadFreshData();

    return () => {
      isMounted = false;
    };
  }, [orderId, isOpen]);

  // Financial Calculations
  const subtotal = garmentLineItems.reduce((sum, item) => sum + (item.amount || 0), 0);
  const discountAmt = discount || 0;
  const taxableAmount = Math.max(0, subtotal - discountAmt);
  const taxAmount = (taxableAmount * taxPercent) / 100;
  const grandTotal = Math.max(0, taxableAmount + taxAmount);

  // Existing payments calculation (accurate single count)
  const linkedInvoice = orderId ? db.getInvoices().find(i => i.linkedOrderId === orderId) : null;
  const totalPaid = linkedInvoice
    ? (linkedInvoice.payments && linkedInvoice.payments.length > 0
        ? linkedInvoice.payments.reduce((sum, p) => sum + (parseFloat(String(p.amount)) || 0), 0)
        : (parseFloat(String(linkedInvoice.advancePaid)) || 0))
    : 0;
  const balanceDue = Math.max(0, grandTotal - totalPaid);

  // Add Item Handler
  const handleAddItem = (presetName?: string, category: string = "Custom", price: number = 1000) => {
    const defaultName = presetName || "Indo-Western";
    const newItem: GarmentLineItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      garmentName: defaultName,
      category: category,
      quantity: 1,
      fabric: fabricDetails || "",
      color: "",
      rate: price,
      discount: 0,
      amount: price,
      measurementValues: {},
      measurementStatus: "Pending",
      notes: ""
    };

    setGarmentLineItems(prev => [...prev, newItem]);
  };

  // Field change on line item
  const handleLineItemChange = (index: number, field: keyof GarmentLineItem, value: any) => {
    setGarmentLineItems(prev => {
      const updated = [...prev];
      const item = { ...updated[index] };

      if (field === "quantity" || field === "rate" || field === "discount") {
        const qty = field === "quantity" ? Math.max(1, parseInt(value) || 0) : item.quantity;
        const rate = field === "rate" ? Math.max(0, parseFloat(value) || 0) : item.rate;
        const disc = field === "discount" ? Math.max(0, parseFloat(value) || 0) : (item.discount || 0);

        item.quantity = qty;
        item.rate = rate;
        item.discount = disc;
        item.amount = Math.max(0, (qty * rate) - disc);
      } else {
        (item as any)[field] = value;
      }

      updated[index] = item;
      return updated;
    });
  };

  // Delete Item
  const handleDeleteItem = (index: number) => {
    setGarmentLineItems(prev => prev.filter((_, i) => i !== index));
  };

  // Save Measurements from Drawer
  const handleSaveLineItemMeasurements = (updatedItem: GarmentLineItem) => {
    setGarmentLineItems(prev => prev.map(item => item.id === updatedItem.id ? updatedItem : item));
  };

  // Delete Order. `force` is only reachable after the user has been shown, and accepted,
  // that recorded payments will be destroyed along with the order.
  const handleDeleteOrder = async (force: boolean = false) => {
    if (!orderId) return;
    setIsDeletingOrder(true);
    setSaveError(null);

    try {
      db.deleteOrder(orderId, { force });
      setDeleteSuccessMsg(true);
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 600);
    } catch (err: any) {
      setSaveError({ message: err.message || "Failed to delete order." });
      setIsDeletingOrder(false);
      setShowDeleteConfirm(false);
    }
  };

  // Save Order
  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!orderId) {
      setSaveError({ message: "Order ID missing." });
      return;
    }

    if (!expectedDeliveryDate) {
      setSaveError({ message: "Please select an expected delivery date." });
      return;
    }

    if (garmentLineItems.length === 0) {
      setSaveError({ message: "Please add at least 1 garment item to the order." });
      return;
    }

    const invalidItem = garmentLineItems.find(item => !item.garmentName || !item.garmentName.trim());
    if (invalidItem) {
      setSaveError({ message: "Please enter a valid name for all garment items." });
      return;
    }

    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const syncedInvoiceLineItems: InvoiceLineItem[] = garmentLineItems.map(item => ({
        description: `${item.garmentName}${item.fabric ? ` (${item.fabric})` : ""}`,
        quantity: item.quantity || 1,
        rate: item.rate || 0,
        amount: item.amount || 0
      }));

      const res = await db.saveFullOrderEdit(
        orderId,
        {
          orderDate,
          expectedDeliveryDate,
          status,
          assignedTailor,
          fabricDetails,
          notes,
          linkedMeasurementVersionId,
          garmentLineItems,
          garmentTypes: Array.from(new Set(garmentLineItems.map(g => g.garmentName)))
        },
        syncedInvoiceLineItems,
        {
          subtotal,
          discount: discountAmt,
          taxPercent,
          taxAmount,
          grandTotal
        }
      );

      if (!res.success) {
        setSaveError({
          message: res.error?.message || "Failed to save order changes."
        });
        setSaving(false);
        return;
      }

      setSaveSuccess(true);
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 600);
    } catch (err: any) {
      setSaveError({ message: err.message || "An error occurred while saving." });
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || !orderId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-navy/60 backdrop-blur-xs font-sans overflow-y-auto animate-fade-in">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-4xl my-4 overflow-hidden flex flex-col max-h-[94vh]">

        {/* Modal Header */}
        <div className="bg-navy text-white px-5 py-3.5 flex items-center justify-between border-b border-navy-hover shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gold/20 rounded-xl border border-gold/30">
              <Scissors className="w-5 h-5 text-gold" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-serif font-bold text-white flex items-center gap-2">
                Edit Order #{orderNumber || (orderId ? `SS-${orderId.slice(-6).toUpperCase()}` : "")}
              </h2>
              <p className="text-xs text-slate-300">
                Customer: <span className="text-gold font-bold">{orderCustomer?.fullName || (customerId ? `Customer SS-${customerId.slice(-6).toUpperCase()}` : "Customer")}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="p-1.5 hover:bg-white/10 rounded-full text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1 bg-slate-50/50">

          {loading ? (
            <div className="py-16 text-center space-y-3">
              <Loader2 className="w-8 h-8 text-gold animate-spin mx-auto" />
              <p className="text-xs font-semibold text-navy">Loading order details...</p>
            </div>
          ) : fetchError ? (
            <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-xs space-y-1 text-red-800">
              <p className="font-bold">{fetchError}</p>
            </div>
          ) : (
            <form id="edit-order-form" onSubmit={handleSave} className="space-y-5">

              {/* Status & Alerts */}
              {saveError && (
                <div className="p-3 bg-red-50 border border-red-300 rounded-xl text-xs text-red-900 font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{saveError.message}</span>
                </div>
              )}

              {saveSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-800 font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Order updated successfully!</span>
                </div>
              )}

              {deleteSuccessMsg && (
                <div className="p-3 bg-red-50 border border-red-300 rounded-xl text-xs text-red-800 font-bold flex items-center gap-2">
                  <Trash2 className="w-4 h-4 text-red-600 shrink-0" />
                  <span>Order deleted.</span>
                </div>
              )}

              {showDeleteConfirm && (() => {
                const impact = orderId ? db.getOrderDeletionImpact(orderId) : null;
                const hasPayments = Boolean(impact && !impact.safeToDelete);
                return (
                  <div className="p-4 bg-red-50 border-2 border-red-200 rounded-2xl text-xs space-y-2 text-red-900">
                    <p className="font-bold text-red-800">Delete this order permanently?</p>
                    {hasPayments ? (
                      <p className="leading-relaxed">
                        ₹{impact!.paidAmount.toLocaleString("en-IN")} has already been received against this
                        order across {impact!.recordedPayments} payment{impact!.recordedPayments === 1 ? "" : "s"}.
                        Deleting removes that money from your books as well.
                      </p>
                    ) : (
                      <p className="leading-relaxed">
                        The order and its bill will be removed. No payments have been received against it.
                      </p>
                    )}
                    <div className="flex items-center gap-3 pt-1">
                      <button
                        type="button"
                        onClick={() => handleDeleteOrder(hasPayments)}
                        disabled={isDeletingOrder}
                        className="bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-1.5 rounded-xl text-xs cursor-pointer disabled:opacity-60"
                      >
                        {isDeletingOrder ? "Deleting..." : hasPayments ? "Delete Order & Payments" : "Yes, Delete Order"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowDeleteConfirm(false)}
                        className="bg-white text-slate-700 font-bold px-4 py-1.5 rounded-xl border border-slate-300 text-xs cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* SECTION 1: CORE ORDER HEADER */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3 shadow-2xs">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-600 font-bold mb-1">Expected Delivery Date *</label>
                    <input
                      type="date"
                      value={expectedDeliveryDate}
                      onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                      className="w-full bg-slate-50 px-3 py-1.5 border border-slate-300 rounded-xl font-bold text-navy focus:outline-none focus:border-navy"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 font-bold mb-1">Order Status</label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as OrderStatus)}
                      className="w-full bg-slate-50 px-3 py-1.5 border border-slate-300 rounded-xl font-bold text-navy focus:outline-none focus:border-navy"
                    >
                      <option value="Pending">Pending</option>
                      <option value="In Cutting">In Cutting</option>
                      <option value="Stitching">Stitching</option>
                      <option value="Trial Scheduled">Trial Scheduled</option>
                      <option value="Ready">Ready for Pickup</option>
                      <option value="Delivered">Delivered</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-600 font-bold mb-1">Assigned Tailor</label>
                    <input
                      type="text"
                      placeholder="Master / Tailor name"
                      value={assignedTailor}
                      onChange={(e) => setAssignedTailor(e.target.value)}
                      className="w-full bg-slate-50 px-3 py-1.5 border border-slate-300 rounded-xl font-medium focus:outline-none focus:border-navy"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 2: GARMENT LINE ITEM MANAGEMENT */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-4 shadow-2xs">

                {/* Garment Quick Add Buttons */}
                <div className="space-y-2 border-b border-slate-200 pb-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-navy uppercase tracking-wider flex items-center gap-1.5">
                      <ShoppingBag className="w-4 h-4 text-gold" />
                      Garment Line Items
                    </h3>
                    <button
                      type="button"
                      onClick={() => handleAddItem("Custom Garment", "Custom", 1000)}
                      className="bg-navy hover:bg-navy-light text-gold font-bold px-3 py-1 rounded-xl text-xs flex items-center gap-1 cursor-pointer transition-all"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>+ Add Custom Item</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap pt-1">
                    <span className="text-[11px] font-bold text-slate-500 mr-1">Quick Add:</span>
                    {coreGarments.map((g) => (
                      <button
                        key={g.name}
                        type="button"
                        onClick={() => handleAddItem(g.name, g.category, g.price)}
                        className="bg-slate-100 hover:bg-navy hover:text-gold text-slate-800 font-bold text-xs px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5 text-gold" />
                        <span>{g.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Garment Items List */}
                <div className="space-y-3">
                  {garmentLineItems.length === 0 ? (
                    <div className="p-6 text-center bg-slate-50 border border-dashed border-slate-300 rounded-2xl">
                      <p className="text-xs font-bold text-slate-500 mb-2">No garments added yet.</p>
                      <div className="flex justify-center gap-2 flex-wrap">
                        {coreGarments.map((g) => (
                          <button
                            key={g.name}
                            type="button"
                            onClick={() => handleAddItem(g.name, g.category, g.price)}
                            className="bg-navy text-gold text-xs font-bold px-3 py-1 rounded-xl cursor-pointer hover:bg-navy-light"
                          >
                            + Add {g.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    garmentLineItems.map((item, idx) => {
                      const hasMeasurements = Object.keys(item.measurementValues || {}).length > 0 || item.measurementStatus === "Complete";

                      return (
                        <div
                          key={item.id}
                          className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3 hover:border-navy/30 transition-all"
                        >
                          {/* Item Title & Actions */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-2">
                            <div className="flex items-center gap-2 flex-1">
                              <span className="w-6 h-6 rounded-full bg-navy text-gold text-[11px] font-bold flex items-center justify-center shrink-0">
                                {idx + 1}
                              </span>
                              <input
                                type="text"
                                value={item.garmentName}
                                onChange={(e) => handleLineItemChange(idx, "garmentName", e.target.value)}
                                placeholder="Garment (Indo-Western, Pant, Vest, Shirt)"
                                className="w-full sm:w-64 font-serif font-bold text-navy text-sm bg-white border border-slate-300 focus:border-navy px-2.5 py-1 rounded-xl"
                              />
                            </div>

                            <div className="flex items-center gap-2 self-end sm:self-auto">
                              {/* MEASUREMENTS DRAWER BUTTON */}
                              <button
                                type="button"
                                onClick={() => setSelectedLineItemForMeasurements(item)}
                                className={`text-xs font-bold px-3 py-1 rounded-xl border flex items-center gap-1.5 transition-all cursor-pointer ${
                                  hasMeasurements
                                    ? "bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100"
                                    : "bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100"
                                }`}
                              >
                                <Ruler className="w-3.5 h-3.5 text-amber-600" />
                                <span>{hasMeasurements ? "✓ Measurements (Edit)" : "+ Add Measurements"}</span>
                              </button>

                              {/* DELETE ITEM BUTTON */}
                              <button
                                type="button"
                                onClick={() => handleDeleteItem(idx)}
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer"
                                title="Delete Item"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          {/* Item Specific Fields: Fabric, Qty, Rate, Total, Remarks */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Fabric / Cloth</label>
                              <input
                                type="text"
                                placeholder="Fabric name/code"
                                value={item.fabric || ""}
                                onChange={(e) => handleLineItemChange(idx, "fabric", e.target.value)}
                                className="w-full bg-white border border-slate-300 rounded-xl px-2.5 py-1 font-medium focus:outline-none focus:border-navy"
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Quantity</label>
                              <input
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={(e) => handleLineItemChange(idx, "quantity", e.target.value)}
                                className="w-full bg-white border border-slate-300 rounded-xl px-2.5 py-1 font-bold text-navy focus:outline-none focus:border-navy text-center"
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Rate (₹)</label>
                              <input
                                type="number"
                                min="0"
                                value={item.rate}
                                onChange={(e) => handleLineItemChange(idx, "rate", e.target.value)}
                                className="w-full bg-white border border-slate-300 rounded-xl px-2.5 py-1 font-bold text-navy focus:outline-none focus:border-navy text-right font-mono"
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Total Amount</label>
                              <div className="bg-slate-100 border border-slate-200 rounded-xl px-2.5 py-1 font-mono font-extrabold text-navy text-right">
                                ₹{(item.amount || 0).toLocaleString()}
                              </div>
                            </div>
                          </div>

                          {/* Garment Remarks & Tailoring Notes */}
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 mb-0.5 flex items-center gap-1">
                              <FileText className="w-3 h-3 text-gold" />
                              <span>Garment Remarks & Specifics</span>
                            </label>
                            <input
                              type="text"
                              placeholder="e.g. Double vent, ban collar, extra margin, specific lining choice..."
                              value={item.notes || ""}
                              onChange={(e) => handleLineItemChange(idx, "notes", e.target.value)}
                              className="w-full bg-white border border-slate-300 rounded-xl px-2.5 py-1 text-xs text-slate-700 focus:outline-none focus:border-navy"
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* SECTION 3: BILL LEDGER */}
              <div className="bg-navy text-white p-4 rounded-2xl border border-navy-hover space-y-3">
                <h3 className="text-xs font-bold text-gold uppercase tracking-wider border-b border-white/10 pb-1.5 flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4 text-gold" />
                  Bill Ledger
                </h3>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Subtotal</label>
                    <div className="bg-navy-light px-3 py-1.5 border border-white/10 rounded-xl font-mono font-bold text-white">
                      ₹{subtotal.toLocaleString()}
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Discount (₹)</label>
                    <input
                      type="number"
                      min="0"
                      value={discount}
                      onChange={(e) => setDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="w-full bg-navy-light px-3 py-1.5 border border-white/20 rounded-xl font-mono font-bold text-white focus:outline-none focus:border-gold"
                    />
                  </div>

                  <div>
                    <label className="block text-gold font-bold mb-1">Grand Total</label>
                    <div className="bg-gold text-navy px-3 py-1.5 rounded-xl font-mono font-extrabold">
                      ₹{grandTotal.toLocaleString()}
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Balance Due</label>
                    <div className={`px-3 py-1.5 rounded-xl font-mono font-bold border ${
                      balanceDue > 0 ? "bg-amber-500/20 text-amber-300 border-amber-500/30" : "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                    }`}>
                      ₹{balanceDue.toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-white border-t border-slate-200 px-5 py-3 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(!showDeleteConfirm)}
            disabled={saving || loading}
            className="text-red-600 hover:text-red-700 font-bold text-xs flex items-center gap-1 px-2 py-1 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Order</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => handleSave()}
              disabled={saving || loading}
              className="bg-navy hover:bg-navy-light text-gold font-bold px-6 py-2 rounded-xl text-xs flex items-center gap-2 shadow-md transition-all cursor-pointer disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-gold" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Save Order</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ITEM MEASUREMENTS DRAWER */}
      {selectedLineItemForMeasurements && (
        <GarmentMeasurementDrawer
          isOpen={!!selectedLineItemForMeasurements}
          lineItem={selectedLineItemForMeasurements}
          customerId={customerId}
          onClose={() => setSelectedLineItemForMeasurements(null)}
          onSave={handleSaveLineItemMeasurements}
        />
      )}
    </div>
  );
}
