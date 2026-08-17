/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { 
  Receipt, 
  Plus, 
  Search, 
  Filter, 
  Printer, 
  CreditCard, 
  DollarSign, 
  ArrowLeft, 
  Check, 
  FileText, 
  Trash2,
  TrendingUp,
  Percent,
  Calculator,
  Edit
} from "lucide-react";
import { Invoice, Customer, Order } from "../types";
import { db } from "../db";
import ConfirmModal from "./ConfirmModal";
import EditOrderModal from "./EditOrderModal";

interface BillingViewProps {
  initialCustomerId?: string;
  initialOrderId?: string;
}

export default function BillingView({ initialCustomerId, initialOrderId }: BillingViewProps) {
  // --- DATABASE STATE ---
  const [invoices, setInvoices] = useState<Invoice[]>(db.getInvoices());
  const [customers, setCustomers] = useState<Customer[]>(db.getCustomers());
  const [orders, setOrders] = useState<Order[]>(db.getOrders());

  // --- UI STATES ---
  const [isNewInvoiceOpen, setIsNewInvoiceOpen] = useState(false);
  const [isRecordPaymentOpen, setIsRecordPaymentOpen] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [isPrintReceiptOpen, setIsPrintReceiptOpen] = useState(false);

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

  // --- FILTERS ---
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");

  // --- NEW INVOICE FORM STATE ---
  const [formCustomerId, setFormCustomerId] = useState(initialCustomerId || "");
  const [formOrderId, setFormOrderId] = useState(initialOrderId || "");
  const [formItems, setFormItems] = useState<{ name: string; price: number; qty: number }[]>([
    { name: "Bespoke Suit (Three-Piece)", price: 45000, qty: 1 }
  ]);
  const [formDiscount, setFormDiscount] = useState<number>(0);
  const [formTax, setFormTax] = useState<number>(5); // 5% GST standard
  const [formInitialPaid, setFormInitialPaid] = useState<number>(20000); // 50% deposit norm

  // --- RECORD PAYMENT STATE ---
  const [paymentAmount, setPaymentAmount] = useState<number>(5000);
  const [paymentMethod, setPaymentMethod] = useState<"Cash" | "Card" | "UPI" | "Bank Transfer">("UPI");

  const refreshDb = () => {
    setInvoices(db.getInvoices());
    setCustomers(db.getCustomers());
    setOrders(db.getOrders());
  };

  React.useEffect(() => {
    refreshDb();
    return db.onSync(refreshDb);
  }, []);

  // Calculations for current form
  const subtotal = formItems.reduce((acc, item) => acc + (item.price * item.qty), 0);
  const discountVal = (subtotal * formDiscount) / 100;
  const taxableVal = subtotal - discountVal;
  const taxVal = (taxableVal * formTax) / 100;
  const finalTotal = taxableVal + taxVal;
  const finalBalance = finalTotal - formInitialPaid;

  // Invoice detailed selectors
  const activeInvoice = invoices.find(inv => inv.id === selectedInvoiceId);
  const activeCustomer = activeInvoice ? customers.find(c => c.id === activeInvoice.customerId) : null;
  const activeOrder = activeInvoice ? orders.find(o => o.id === activeInvoice.linkedOrderId) : null;

  // Add Item Line to Invoice Creation
  const handleAddLineItem = () => {
    setFormItems(prev => [...prev, { name: "Bespoke Shirt", price: 3500, qty: 1 }]);
  };

  const handleRemoveLineItem = (idx: number) => {
    setFormItems(prev => prev.filter((_, i) => i !== idx));
  };

  const handleLineItemChange = (idx: number, field: "name" | "price" | "qty", val: any) => {
    setFormItems(prev => prev.map((item, i) => {
      if (i === idx) {
        return {
          ...item,
          [field]: field === "name" ? val : Number(val)
        };
      }
      return item;
    }));
  };

  // Issue custom tax invoice
  const handleCreateInvoice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCustomerId) {
      setConfirmModal({
        isOpen: true,
        title: "Selection Required",
        message: "Please select a customer first before generating an invoice.",
        confirmLabel: "Understood",
        variant: "warning",
        onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
      });
      return;
    }

    if (isNaN(finalTotal) || finalTotal <= 0) {
      setConfirmModal({
        isOpen: true,
        title: "Invalid Grand Total",
        message: "The invoice grand total must be a positive number greater than zero.",
        confirmLabel: "Understood",
        variant: "warning",
        onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
      });
      return;
    }

    if (isNaN(formInitialPaid) || formInitialPaid < 0) {
      setConfirmModal({
        isOpen: true,
        title: "Invalid Deposit",
        message: "Initial deposit cannot be negative.",
        confirmLabel: "Understood",
        variant: "warning",
        onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
      });
      return;
    }

    if (formInitialPaid > finalTotal) {
      setConfirmModal({
        isOpen: true,
        title: "Deposit Exceeds Total",
        message: "Initial deposit cannot be greater than the grand total bill.",
        confirmLabel: "Understood",
        variant: "warning",
        onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
      });
      return;
    }

    try {
      db.addInvoice({
        customerId: formCustomerId,
        linkedOrderId: formOrderId || "",
        lineItems: formItems.map(it => ({ 
          description: it.name, 
          quantity: it.qty, 
          rate: it.price,
          amount: it.qty * it.price 
        })),
        subtotal: subtotal,
        discount: discountVal,
        taxPercent: formTax,
        taxAmount: taxVal,
        grandTotal: finalTotal,
        advancePaid: formInitialPaid,
        paymentMode: "UPI"
      });

      setConfirmModal({
        isOpen: true,
        title: "Invoice Registered",
        message: "Bespoke billing invoice registered successfully. Customer ledger balance has been recalculated.",
        confirmLabel: "Understood",
        variant: "info",
        onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
      });
      refreshDb();
      setIsNewInvoiceOpen(false);

      // Reset Form
      setFormCustomerId("");
      setFormOrderId("");
      setFormItems([{ name: "Bespoke Suit (Three-Piece)", price: 45000, qty: 1 }]);
      setFormDiscount(0);
      setFormInitialPaid(20000);
    } catch (err: any) {
      setConfirmModal({
        isOpen: true,
        title: "Billing Failed",
        message: err.message || "Failed to register invoice. Please verify invoice calculations.",
        confirmLabel: "Understood",
        variant: "warning",
        onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
      });
    }
  };

  // Record custom payment transaction
  const handleRecordPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoiceId) return;

    db.recordPayment(selectedInvoiceId, paymentAmount, paymentMethod, "Staff");
    setConfirmModal({
      isOpen: true,
      title: "Payment Recorded",
      message: `Success! Payment deposit of ₹${paymentAmount.toLocaleString("en-IN")} has been recorded via ${paymentMethod} in the customer's ledger ledger files.`,
      confirmLabel: "Understood",
      variant: "info",
      onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
    });
    refreshDb();
    setIsRecordPaymentOpen(false);
  };

  const handleDeleteInvoice = (id: string, num: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Delete Invoice",
      message: `Are you absolutely sure you want to delete Invoice ${num}? This will remove the transaction record and modify the customer's outstanding balance history.`,
      confirmLabel: "Delete Invoice",
      cancelLabel: "Cancel",
      variant: "danger",
      onConfirm: () => {
        db.deleteInvoice(id);
        refreshDb();
        if (selectedInvoiceId === id) setSelectedInvoiceId(null);
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      },
      onCancel: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
    });
  };

  // Filter List
  const filteredInvoices = invoices.filter(inv => {
    const cust = customers.find(c => c.id === inv.customerId);
    const matchesQuery = cust?.fullName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         inv.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "All" ? true : inv.paymentStatus === statusFilter;
    return matchesQuery && matchesStatus;
  });

  return (
    <div className="space-y-6 font-sans text-xs">
      
      {/* HEADER CARD */}
      <div className="bg-white rounded-3xl border border-light shadow-sm p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 animate-fade-in print:hidden">
        <div>
          <h1 className="text-2xl font-serif text-navy font-bold flex items-center gap-2">
            <Receipt className="w-5.5 h-5.5 text-gold" />
            Billing & Invoicing Ledger
          </h1>
          <p className="text-muted-grey text-sm mt-0.5">Issue premium tax receipts and process secure customer balance accounts</p>
        </div>

        <button 
          onClick={() => {
            setFormCustomerId(initialCustomerId || "");
            setFormOrderId(initialOrderId || "");
            setIsNewInvoiceOpen(true);
          }}
          className="bg-navy hover:bg-navy-hover text-white font-semibold px-5 py-2.5 rounded-xl border border-navy/20 shadow-xs flex items-center gap-2 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4 text-gold" />
          Issue New Invoice
        </button>
      </div>

      {/* STATS KPIs OVERVIEW */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 print:hidden">
        <div className="bg-white rounded-3xl border border-light p-5 space-y-1">
          <span className="text-muted-grey uppercase text-[10px] font-bold tracking-wider">Total Invoiced Amount</span>
          <p className="font-serif font-bold text-navy text-xl">
            ₹{invoices.reduce((acc, i) => acc + (i.grandTotal || 0), 0).toLocaleString("en-IN")}
          </p>
        </div>
        <div className="bg-white rounded-3xl border border-light p-5 space-y-1">
          <span className="text-muted-grey uppercase text-[10px] font-bold tracking-wider">Deposits Paid</span>
          <p className="font-serif font-bold text-green-700 text-xl">
            ₹{invoices.reduce((acc, i) => acc + (i.advancePaid || 0), 0).toLocaleString("en-IN")}
          </p>
        </div>
        <div className="bg-white rounded-3xl border border-light p-5 space-y-1">
          <span className="text-muted-grey uppercase text-[10px] font-bold tracking-wider">Ledger Balance Outstanding</span>
          <p className="font-serif font-bold text-red-600 text-xl">
            ₹{invoices.reduce((acc, i) => acc + (i.balanceDue || 0), 0).toLocaleString("en-IN")}
          </p>
        </div>
      </div>

      {/* LIST TABLE CONTAINER */}
      <div className="bg-white rounded-3xl border border-light shadow-sm p-6 space-y-5 print:hidden">
        
        {/* Filters bar */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center bg-cream/35 p-4 rounded-2xl border border-light">
          <div className="md:col-span-8 relative">
            <Search className="w-4 h-4 text-muted-grey absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Search invoices by customer name, order number, or invoice no..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white pl-10 pr-4 py-2 border border-light rounded-xl font-sans focus:outline-hidden"
            />
          </div>

          <div className="md:col-span-4 flex items-center gap-2 font-semibold text-charcoal">
            <Filter className="w-3.5 h-3.5 text-muted-grey flex-shrink-0" />
            <select 
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full bg-white px-3 py-2 border border-light rounded-xl focus:outline-hidden"
            >
              <option value="All">All Invoices</option>
              <option value="Paid">Fully Paid</option>
              <option value="Partially Paid">Partially Paid</option>
              <option value="Unpaid">Unpaid</option>
            </select>
          </div>
        </div>

        {/* Real table */}
        <div className="overflow-x-auto border border-light rounded-2xl">
          {filteredInvoices.length === 0 ? (
            <div className="py-12 text-center text-muted-grey italic">
              No bills recorded. Click "Issue New Invoice" to generate billing ledger.
            </div>
          ) : (
            <table className="w-full text-left font-sans border-collapse">
              <thead>
                <tr className="bg-cream/40 text-navy font-bold border-b border-light">
                  <th className="p-4">Invoice No</th>
                  <th className="p-4">Customer</th>
                  <th className="p-4">Order Linked</th>
                  <th className="p-4">Total Bill</th>
                  <th className="p-4">Paid Deposit</th>
                  <th className="p-4">Outstanding Balance</th>
                  <th className="p-4 text-center">Status</th>
                  <th className="p-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-light text-charcoal">
                {filteredInvoices.map((inv) => {
                  const cust = customers.find(c => c.id === inv.customerId);
                  const ord = orders.find(o => o.id === inv.linkedOrderId);
                  const bal = inv.balanceDue;

                  return (
                    <tr key={inv.id} className="hover:bg-cream/10 transition-colors">
                      <td className="p-4 font-bold text-navy">{inv.invoiceNumber}</td>
                      <td className="p-4 font-semibold">{cust?.fullName || "Bespoke Customer"}</td>
                      <td className="p-4 font-semibold text-gold font-mono">{ord?.orderNumber || "Custom Drape"}</td>
                      <td className="p-4 font-mono font-bold text-navy">₹{inv.grandTotal.toLocaleString("en-IN")}</td>
                      <td className="p-4 font-mono text-green-700">₹{inv.advancePaid.toLocaleString("en-IN")}</td>
                      <td className="p-4 font-mono font-bold text-red-600">₹{bal.toLocaleString("en-IN")}</td>
                      <td className="p-4 text-center">
                        <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase border ${
                          inv.paymentStatus === "Paid"
                            ? "bg-green-50 border-green-200 text-green-700"
                            : inv.paymentStatus === "Partially Paid"
                            ? "bg-amber-50 border-amber-200 text-amber-700"
                            : "bg-red-50 border-red-200 text-red-700"
                        }`}>
                          {inv.paymentStatus}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center justify-center gap-2">
                          <button 
                            onClick={() => {
                              setSelectedInvoiceId(inv.id);
                              setIsPrintReceiptOpen(true);
                            }}
                            title="Print Tax Invoice Receipt"
                            className="p-1.5 hover:bg-cream text-navy rounded-lg cursor-pointer"
                          >
                            <Printer className="w-4 h-4" />
                          </button>

                          {inv.linkedOrderId && (
                            <button 
                              onClick={() => setEditingOrderId(inv.linkedOrderId)}
                              title="Edit Linked Order Ledger & Items"
                              className="p-1.5 hover:bg-navy/10 text-navy rounded-lg cursor-pointer"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                          )}

                          {bal > 0 && (
                            <button 
                              onClick={() => {
                                setSelectedInvoiceId(inv.id);
                                setPaymentAmount(bal);
                                setIsRecordPaymentOpen(true);
                              }}
                              title="Record Ledger Payment"
                              className="p-1.5 hover:bg-green-50 text-green-700 rounded-lg cursor-pointer"
                            >
                              <CreditCard className="w-4 h-4" />
                            </button>
                          )}

                          <button 
                            onClick={() => handleDeleteInvoice(inv.id, inv.invoiceNumber)}
                            title="Delete Invoice"
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

      {/* =====================================================================
          TAX INVOICE PRINT DIALOG PREVIEW (Section 8)
      ===================================================================== */}
      {isPrintReceiptOpen && activeInvoice && activeCustomer && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50 animate-fade-in text-xs font-sans print:p-0 print:bg-white print:static print:z-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[92vh] overflow-y-auto shadow-2xl p-6 space-y-6 print:p-0 print:shadow-none print:max-h-none print:overflow-visible print:border-0 print:rounded-none">
            
            <div className="flex justify-between items-center border-b border-light pb-3 print:hidden">
              <span className="font-serif font-bold text-navy text-sm">Tax Invoice Print Preview</span>
              <div className="flex gap-2">
                <button 
                  onClick={() => window.print()}
                  className="bg-navy hover:bg-navy-hover text-white px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-gold" />
                  Print Receipt
                </button>
                <button 
                  onClick={() => setIsPrintReceiptOpen(false)}
                  className="bg-cream hover:bg-cream/80 text-navy px-4 py-2 rounded-xl text-xs font-semibold border border-light cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>

            {/* Print paper mockup */}
            <div id="print-tax-invoice" className="bg-white p-8 text-charcoal space-y-6 max-w-[210mm] mx-auto print:p-0">

              {/* Header Letterhead */}
              <div className="space-y-4 pb-5 border-b-2 border-gold/70">
                <div className="grid grid-cols-2 gap-6 items-start">
                  <div>
                    <h1 className="text-[26px] leading-none font-serif font-black tracking-wide text-navy">SIGNATURE</h1>
                    <p className="text-[11px] font-sans font-bold tracking-[0.25em] text-gold mt-1.5">SUITINGS &bull; SHOWROOM</p>
                    <p className="text-[8px] font-sans font-semibold tracking-widest text-charcoal/50 mt-1.5 uppercase">Neel Kanth Industries &bull; "The Sign of Comfort"</p>
                  </div>
                  <div className="text-right space-y-0.5 text-[9px] text-charcoal/65 leading-relaxed">
                    <p>2, Tara Singh Avenue, Peer Dad Road,</p>
                    <p>Jalandhar, Punjab, India</p>
                    <p className="font-semibold text-charcoal/80 pt-0.5">Ph: 93572 51900 &bull; 95696 81900</p>
                  </div>
                </div>
                <p className="text-center text-[11px] font-sans font-bold uppercase tracking-[0.35em] text-navy">Tax Invoice Receipt</p>
              </div>

              {/* Invoice + customer metadata */}
              <div className="grid grid-cols-2 gap-6 text-[10px] pb-5 border-b border-light">
                <div className="space-y-1.5 leading-relaxed">
                  <p><span className="text-charcoal/50 font-semibold">Invoice No.</span> <b className="text-navy">{activeInvoice.invoiceNumber}</b></p>
                  <p><span className="text-charcoal/50 font-semibold">Billing Date</span> <b>{new Date(activeInvoice.invoiceDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</b></p>
                  {activeOrder && <p><span className="text-charcoal/50 font-semibold">Custom Order</span> <b className="text-gold">{activeOrder.orderNumber}</b></p>}
                </div>
                <div className="space-y-1.5 leading-relaxed text-right">
                  <p><span className="text-charcoal/50 font-semibold">Customer</span> <b className="text-navy">{activeCustomer.fullName}</b></p>
                  <p><span className="text-charcoal/50 font-semibold">Mobile</span> <b>{activeCustomer.mobileNumber}</b></p>
                  <p><span className="text-charcoal/50 font-semibold">Address</span> <b>{activeCustomer.address || "Collection Showroom"}</b></p>
                </div>
              </div>

              {/* Items Line list */}
              <div className="border border-light rounded-xl overflow-hidden">
                <table className="w-full text-left text-[10.5px] border-collapse">
                  <thead>
                    <tr className="bg-navy text-white border-b-2 border-gold">
                      <th className="py-2.5 px-3 font-bold text-[9px] uppercase tracking-wider w-8">#</th>
                      <th className="py-2.5 px-3 font-bold text-[9px] uppercase tracking-wider">Item Description</th>
                      <th className="py-2.5 px-3 font-bold text-[9px] uppercase tracking-wider text-center w-14">Qty</th>
                      <th className="py-2.5 px-3 font-bold text-[9px] uppercase tracking-wider text-right w-24">Unit Price</th>
                      <th className="py-2.5 px-3 font-bold text-[9px] uppercase tracking-wider text-right w-28">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-light">
                    {activeInvoice.lineItems.map((item, i) => (
                      <tr key={i}>
                        <td className="py-2.5 px-3 font-mono text-charcoal/45">{i + 1}</td>
                        <td className="py-2.5 px-3 font-semibold text-charcoal">{item.description}</td>
                        <td className="py-2.5 px-3 text-center font-mono text-charcoal/75">{item.quantity}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-charcoal/75">₹{item.rate.toLocaleString("en-IN")}</td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-navy">₹{item.amount.toLocaleString("en-IN")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Inclusive-of-taxes indicator */}
              <div className="flex items-start gap-3 bg-cream/60 border border-gold/40 rounded-xl px-4 py-3 print:break-inside-avoid">
                <div className="w-5 h-5 rounded-full bg-gold flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Check className="w-3 h-3 text-white" strokeWidth={3} />
                </div>
                <div>
                  <p className="font-bold text-navy text-[10px] uppercase tracking-wider">Inclusive of Taxes</p>
                  <p className="text-charcoal/60 text-[9px] mt-0.5">Prices shown are inclusive of applicable taxes.</p>
                </div>
              </div>

              {/* Financial totals summary */}
              <div className="flex justify-end print:break-inside-avoid">
                <div className="w-full sm:w-72 space-y-2">
                  <div className="flex justify-between text-[10px] text-charcoal/70">
                    <span>Subtotal</span>
                    <span className="font-mono">₹{activeInvoice.subtotal.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex justify-between text-[10px] text-charcoal/70">
                    <span>Discount</span>
                    <span className="font-mono">-₹{activeInvoice.discount.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="h-px bg-gold/50" />
                  <div className="flex justify-between items-baseline py-0.5">
                    <span className="font-bold text-navy text-[10.5px] uppercase tracking-wide">
                      Total Amount <span className="font-semibold normal-case text-charcoal/45 text-[8px]">(Incl. of Taxes)</span>
                    </span>
                    <span className="font-mono font-black text-navy text-base">₹{activeInvoice.grandTotal.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="pt-2 space-y-1.5 border-t border-light">
                    <div className="flex justify-between text-[10px] font-semibold text-green-700">
                      <span>Deposits Received</span>
                      <span className="font-mono">₹{activeInvoice.advancePaid.toLocaleString("en-IN")}</span>
                    </div>
                    <div className={`flex justify-between text-[11px] font-bold ${activeInvoice.balanceDue > 0 ? "text-red-600" : "text-green-700"}`}>
                      <span>Outstanding Balance</span>
                      <span className="font-mono">₹{activeInvoice.balanceDue.toLocaleString("en-IN")}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Transactions log ledger list */}
              {activeInvoice.payments && activeInvoice.payments.length > 0 && (
                <div className="border border-light rounded-xl p-3.5 space-y-2 print:break-inside-avoid">
                  <p className="font-bold uppercase tracking-widest text-navy text-[9px]">Payment Log</p>
                  <div className="space-y-1.5">
                    {activeInvoice.payments.map((pmt, i) => (
                      <div key={i} className="flex justify-between text-[9.5px] text-charcoal/70">
                        <span>{new Date(pmt.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} &bull; Deposited via {pmt.mode}</span>
                        <span className="font-mono font-bold text-charcoal">₹{pmt.amount.toLocaleString("en-IN")}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Disclaimer & signature */}
              <div className="pt-5 mt-1 border-t-2 border-gold/70 grid grid-cols-2 gap-6 items-end print:break-inside-avoid">
                <div className="space-y-2 text-[8.5px] text-charcoal/55 leading-relaxed">
                  <p>No responsibility of clothes after one month from the date of delivery. E. &amp; O.E.</p>
                  <p className="font-semibold text-charcoal/65">Signature Suitings &bull; Jalandhar City Showroom</p>
                  <p className="italic text-charcoal/45 pt-1">Thank you for choosing Signature Suitings.<br />We appreciate your trust.</p>
                </div>
                <div className="flex flex-col items-end">
                  <div className="w-36 border-t border-charcoal/50 pt-1.5 text-center">
                    <span className="text-[8.5px] uppercase tracking-widest text-charcoal/60">Authorised Signature</span>
                  </div>
                </div>
              </div>

            </div>

            <div className="flex justify-end gap-3 print:hidden">
              <button 
                onClick={() => setIsPrintReceiptOpen(false)}
                className="bg-navy hover:bg-navy-hover text-white font-semibold font-sans px-5 py-2.5 rounded-xl text-xs transition-colors cursor-pointer"
              >
                Close Preview
              </button>
            </div>

          </div>
        </div>
      )}

      {/* =====================================================================
          RECORD PAYMENT DEPOSIT DIALOG
      ===================================================================== */}
      {isRecordPaymentOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-fade-in text-xs">
          <div className="bg-white rounded-3xl border border-light max-w-md w-full shadow-2xl p-6 space-y-5 animate-scale-up">
            <div className="flex justify-between items-center border-b border-light pb-3">
              <h3 className="text-base font-serif font-bold text-navy">Record Ledger Deposit</h3>
              <button onClick={() => setIsRecordPaymentOpen(false)} className="text-muted-grey hover:text-navy cursor-pointer">✕</button>
            </div>

            <form onSubmit={handleRecordPayment} className="space-y-4">
              <div className="space-y-1">
                <label className="font-semibold text-navy">Payment Amount (₹)</label>
                <input 
                  type="number" 
                  required
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(Number(e.target.value))}
                  className="w-full bg-white px-3 py-2 border border-light rounded-lg focus:outline-hidden"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-navy">Payment Mode</label>
                <select 
                  value={paymentMethod}
                  onChange={(e: any) => setPaymentMethod(e.target.value)}
                  className="w-full bg-white px-3 py-2 border border-light rounded-lg focus:outline-hidden"
                >
                  <option value="UPI">UPI (Paytm/GPay)</option>
                  <option value="Cash">Cash Handover</option>
                  <option value="Card">Credit/Debit Card</option>
                  <option value="Bank Transfer">Direct Bank IMPS Transfer</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-light">
                <button 
                  type="button" 
                  onClick={() => setIsRecordPaymentOpen(false)}
                  className="bg-cream hover:bg-cream/80 text-navy font-semibold px-4.5 py-2 rounded-xl border border-light"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="bg-navy hover:bg-navy-hover text-white font-semibold px-5 py-2 rounded-xl"
                >
                  Post Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          ISSUE NEW INVOICE DIALOG
      ===================================================================== */}
      {isNewInvoiceOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-fade-in text-xs">
          <div className="bg-white rounded-3xl border border-light max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-2xl p-6 space-y-5 animate-scale-up">
            <div className="flex justify-between items-center border-b border-light pb-3">
              <h3 className="text-base font-serif font-bold text-navy">Issue custom Tax Invoice</h3>
              <button onClick={() => setIsNewInvoiceOpen(false)} className="text-muted-grey hover:text-navy cursor-pointer">✕</button>
            </div>

            <form onSubmit={handleCreateInvoice} className="space-y-4">
              
              {/* Customer selection */}
              <div className="space-y-1">
                <label className="font-semibold text-navy">Bespoke Customer <span className="text-red-600">*</span></label>
                <select 
                  required
                  value={formCustomerId}
                  onChange={(e) => setFormCustomerId(e.target.value)}
                  className="w-full bg-white px-3 py-2 border border-light rounded-lg focus:outline-hidden"
                >
                  <option value="">-- Choose Account --</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.fullName} ({c.mobileNumber})</option>
                  ))}
                </select>
              </div>

              {/* Order linker */}
              <div className="space-y-1">
                <label className="font-semibold text-navy">Linked Order book (Optional)</label>
                <select 
                  value={formOrderId}
                  onChange={(e) => setFormOrderId(e.target.value)}
                  className="w-full bg-white px-3 py-2 border border-light rounded-lg focus:outline-hidden"
                >
                  <option value="">-- Choose Order --</option>
                  {orders.filter(o => o.customerId === formCustomerId).map(o => (
                    <option key={o.id} value={o.id}>{o.orderNumber} ({o.garmentTypes.join(", ")})</option>
                  ))}
                </select>
              </div>

              {/* Itemized Line items */}
              <div className="space-y-2 border-t border-b border-light py-3">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-navy uppercase text-[10px]">Itemized Billings Lines</span>
                  <button 
                    type="button" 
                    onClick={handleAddLineItem}
                    className="text-gold font-bold flex items-center gap-1 hover:underline cursor-pointer"
                  >
                    + Add item
                  </button>
                </div>

                <div className="space-y-2.5 max-h-[22vh] overflow-y-auto pr-1">
                  {formItems.map((item, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <input 
                        type="text" 
                        required
                        placeholder="Item Description"
                        value={item.name}
                        onChange={(e) => handleLineItemChange(idx, "name", e.target.value)}
                        className="flex-1 bg-white px-3 py-2 border border-light rounded-lg focus:outline-hidden"
                      />
                      <input 
                        type="number" 
                        required
                        placeholder="Price"
                        value={item.price}
                        onChange={(e) => handleLineItemChange(idx, "price", e.target.value)}
                        className="w-20 bg-white px-3 py-2 border border-light rounded-lg font-mono focus:outline-hidden"
                      />
                      <input 
                        type="number" 
                        required
                        placeholder="Qty"
                        value={item.qty}
                        onChange={(e) => handleLineItemChange(idx, "qty", e.target.value)}
                        className="w-14 bg-white px-3 py-2 border border-light rounded-lg font-mono focus:outline-hidden text-center"
                      />
                      <button 
                        type="button" 
                        onClick={() => handleRemoveLineItem(idx)}
                        disabled={formItems.length === 1}
                        className="text-red-600 disabled:opacity-40 p-1.5 hover:bg-red-50 rounded-lg"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Financial Metrics Split */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="font-semibold text-navy">Discount (%)</label>
                  <input 
                    type="number" 
                    value={formDiscount}
                    onChange={(e) => setFormDiscount(Number(e.target.value))}
                    className="w-full bg-white px-3 py-2 border border-light rounded-lg focus:outline-hidden font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-navy">Tax GST (%)</label>
                  <input 
                    type="number" 
                    value={formTax}
                    onChange={(e) => setFormTax(Number(e.target.value))}
                    className="w-full bg-white px-3 py-2 border border-light rounded-lg focus:outline-hidden font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-navy">Deposit Deposit (₹)</label>
                  <input 
                    type="number" 
                    value={formInitialPaid}
                    onChange={(e) => setFormInitialPaid(Number(e.target.value))}
                    className="w-full bg-white px-3 py-2 border border-light rounded-lg focus:outline-hidden font-mono text-green-700 font-bold"
                  />
                </div>
              </div>

              {/* Calculations card feedback */}
              <div className="bg-cream/35 p-3 rounded-xl border border-light space-y-1 font-mono text-charcoal leading-relaxed text-[10px]">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>₹{subtotal.toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between text-red-600">
                  <span>Discount ({formDiscount}%):</span>
                  <span>-₹{discountVal.toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between">
                  <span>CGST/SGST Taxes ({formTax}%):</span>
                  <span>₹{taxVal.toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between border-t border-light pt-1.5 text-navy font-bold text-xs">
                  <span>Grand Total Bill:</span>
                  <span>₹{finalTotal.toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between text-green-700">
                  <span>Initial Deposit:</span>
                  <span>₹{formInitialPaid.toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between text-red-600 border-t border-light pt-1 font-bold">
                  <span>Ledger Balance Outstanding:</span>
                  <span>₹{finalBalance.toLocaleString("en-IN")}</span>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-light">
                <button 
                  type="button" 
                  onClick={() => setIsNewInvoiceOpen(false)}
                  className="bg-cream hover:bg-cream/80 text-navy font-semibold px-4.5 py-2 rounded-xl border border-light"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="bg-navy hover:bg-navy-hover text-white font-semibold px-5 py-2 rounded-xl"
                >
                  Issue Invoice
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
