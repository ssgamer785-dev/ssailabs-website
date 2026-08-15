/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { 
  Calendar as CalendarIcon, 
  Plus, 
  Sparkles, 
  CheckCircle, 
  User, 
  Clock, 
  Trash2, 
  FileText,
  AlertCircle,
  Scissors,
  Pencil,
  Wallet,
  Eye,
  Check
} from "lucide-react";
import { Appointment, Order, Customer } from "../types";
import { db, stripEmbeddedTags } from "../db";
import ConfirmModal from "./ConfirmModal";

export default function TrialsView() {
  const [appointments, setAppointments] = useState<Appointment[]>(db.getAppointments());
  const [orders, setOrders] = useState<Order[]>(db.getOrders());
  const [customers, setCustomers] = useState<Customer[]>(db.getCustomers());

  const [isBookModalOpen, setIsBookModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"calendar" | "alterations">("calendar");
  const [viewingAppt, setViewingAppt] = useState<Appointment | null>(null);

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

  // --- FORM STATE ---
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formCustomerId, setFormCustomerId] = useState("");
  const [isNewCustomer, setIsNewCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [formOrderId, setFormOrderId] = useState("");
  const [formType, setFormType] = useState<"Trial Fitting" | "Alteration Check" | "Bespoke Fitting">("Trial Fitting");
  const [formDate, setFormDate] = useState("2026-07-10");
  const [formTime, setFormTime] = useState("14:30");
  const [formNotes, setFormNotes] = useState("");
  const [formStatus, setFormStatus] = useState<"Scheduled" | "Completed" | "Cancelled">("Scheduled");
  const [formCharge, setFormCharge] = useState<number>(0);
  const [formPaymentStatus, setFormPaymentStatus] = useState<"Paid" | "Unpaid">("Unpaid");
  const [formClothDropOffDate, setFormClothDropOffDate] = useState("");
  const [formFittingPickupDate, setFormFittingPickupDate] = useState("");
  const [formPickupDate, setFormPickupDate] = useState("");
  const [formPickupTime, setFormPickupTime] = useState("");
  const [formReadyDate, setFormReadyDate] = useState("");
  const [formReadyTime, setFormReadyTime] = useState("");
  const [formTrialStatus, setFormTrialStatus] = useState<"Pending" | "Ready" | "In-Progress" | "Altered" | "Delivered">("Pending");
  const [formCompletedStatus, setFormCompletedStatus] = useState<"Pending" | "Completed" | "Cancelled">("Pending");

  const refreshDb = () => {
    setAppointments(db.getAppointments());
    setOrders(db.getOrders());
    setCustomers(db.getCustomers());
  };

  const resetForm = () => {
    setEditingId(null);
    setFormCustomerId("");
    setIsNewCustomer(false);
    setNewCustomerName("");
    setNewCustomerPhone("");
    setFormOrderId("");
    setFormNotes("");
    setFormCharge(0);
    setFormPaymentStatus("Unpaid");
    setFormStatus("Scheduled");
    setFormClothDropOffDate("");
    setFormFittingPickupDate("");
    setFormPickupDate("");
    setFormPickupTime("");
    setFormReadyDate("");
    setFormReadyTime("");
    setFormTrialStatus("Pending");
    setFormCompletedStatus("Pending");
  };

  React.useEffect(() => {
    const unsubscribe = db.onSync(() => {
      refreshDb();
    });
    return unsubscribe;
  }, []);

  const handleBookAppointment = (e: React.FormEvent) => {
    e.preventDefault();
    
    let finalCustomerId = formCustomerId;
    
    if (!editingId && isNewCustomer) {
      if (!newCustomerName.trim()) {
        setConfirmModal({
          isOpen: true,
          title: "Name Required",
          message: "Please enter the full name for the new customer.",
          confirmLabel: "Understood",
          variant: "warning",
          onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
        });
        return;
      }
      // Create new customer
      const created = db.addCustomer({
        fullName: newCustomerName.trim(),
        mobileNumber: newCustomerPhone.trim() || "0000000000",
        preferredFabricBrands: [],
        alternateNumber: "",
        address: "",
        email: "",
        dob: "",
        generalNotes: "",
        photoUrl: "",
      });
      finalCustomerId = created.id;
    } else if (!finalCustomerId) {
      setConfirmModal({
        isOpen: true,
        title: "Selection Required",
        message: "Please choose a customer first.",
        confirmLabel: "Understood",
        variant: "warning",
        onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
      });
      return;
    }

    const typeMapping: Record<"Trial Fitting" | "Alteration Check" | "Bespoke Fitting", "Measurement" | "Trial" | "Delivery"> = {
      "Trial Fitting": "Trial",
      "Alteration Check": "Trial",
      "Bespoke Fitting": "Trial"
    };

    const parsedCharge = Number(formCharge) || 0;

    const appointmentPayload = {
      customerId: finalCustomerId,
      type: typeMapping[formType],
      dateTime: `${formDate}T${formTime}:00`,
      notes: formNotes,
      orderId: formOrderId || undefined,
      appointmentType: formType,
      appointmentDate: formDate,
      appointmentTime: formTime,
      trialCharge: parsedCharge,
      paymentStatus: formPaymentStatus,
      status: formStatus as any,
      clothDropOffDate: formClothDropOffDate || undefined,
      fittingPickupDate: formFittingPickupDate || undefined,
      pickupDate: formPickupDate || undefined,
      pickupTime: formPickupTime || undefined,
      readyDate: formReadyDate || undefined,
      readyTime: formReadyTime || undefined,
      trialStatus: formTrialStatus,
      completedStatus: formCompletedStatus,
    };

    if (editingId) {
      db.updateAppointment(editingId, appointmentPayload);
      setConfirmModal({
        isOpen: true,
        title: "Appointment Updated",
        message: "The fitting appointment and associated billing details have been updated successfully.",
        confirmLabel: "Understood",
        variant: "info",
        onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
      });
    } else {
      db.addAppointment(appointmentPayload);
      setConfirmModal({
        isOpen: true,
        title: "Appointment Logged",
        message: "Bespoke fitting appointment has been logged successfully inside the master calendar registry.",
        confirmLabel: "Understood",
        variant: "info",
        onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
      });
    }

    refreshDb();
    setIsBookModalOpen(false);

    // Reset
    resetForm();
  };

  const handleEditAppointmentClick = (appt: Appointment) => {
    setEditingId(appt.id);
    setFormCustomerId(appt.customerId);
    setIsNewCustomer(false);
    setNewCustomerName("");
    setNewCustomerPhone("");
    setFormOrderId(appt.orderId || "");
    setFormType((appt.appointmentType as any) || "Trial Fitting");
    
    if (appt.appointmentDate) {
      setFormDate(appt.appointmentDate);
    } else {
      setFormDate(appt.dateTime ? appt.dateTime.split("T")[0] : "2026-07-10");
    }

    if (appt.appointmentTime) {
      setFormTime(appt.appointmentTime);
    } else {
      setFormTime(appt.dateTime ? appt.dateTime.split("T")[1]?.slice(0, 5) || "14:30" : "14:30");
    }

    setFormNotes(appt.notes || "");
    setFormStatus(appt.status as any);
    setFormCharge(appt.trialCharge || 0);
    setFormPaymentStatus(appt.paymentStatus || "Unpaid");
    setFormClothDropOffDate(appt.clothDropOffDate || "");
    setFormFittingPickupDate(appt.fittingPickupDate || "");
    setFormPickupDate(appt.pickupDate || "");
    setFormPickupTime(appt.pickupTime || "");
    setFormReadyDate(appt.readyDate || "");
    setFormReadyTime(appt.readyTime || "");
    setFormTrialStatus(appt.trialStatus || "Pending");
    setFormCompletedStatus(appt.completedStatus || "Pending");
    setIsBookModalOpen(true);
  };

  const handleDeleteAppointment = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Delete Appointment",
      message: "Are you sure you want to delete this scheduled fitting appointment? This will permanently remove it from the master calendar ledger and delete any linked trial invoice.",
      confirmLabel: "Delete Appointment",
      cancelLabel: "Cancel",
      variant: "danger",
      onConfirm: () => {
        db.deleteAppointment(id);
        refreshDb();
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      },
      onCancel: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
    });
  };

  const handleToggleStatus = (id: string, current: string) => {
    const next = current === "Scheduled" ? "Completed" : "Scheduled";
    db.updateAppointmentStatus(id, next);
    refreshDb();
  };

  // Alteration specific lists (Appointments marked completed or has alteration notes)
  const alterationRecords = appointments.filter(a => a.appointmentType === "Alteration Check" || (a.notes && a.notes.toLowerCase().includes("alteration")));

  return (
    <div className="space-y-6 font-sans text-xs">
      
      {/* HEADER BAR */}
      <div className="bg-white rounded-3xl border border-light shadow-sm p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 animate-fade-in">
        <div>
          <h1 className="text-2xl font-serif text-navy font-bold flex items-center gap-2">
            <CalendarIcon className="w-5.5 h-5.5 text-gold" />
            Fitting & Trial Center
          </h1>
          <p className="text-muted-grey text-sm mt-0.5">Manage live garment trial appointments and tailoring modification logs</p>
        </div>

        <div className="flex gap-3">
          <button 
            onClick={() => {
              resetForm();
              setIsBookModalOpen(true);
            }}
            className="bg-navy hover:bg-navy-hover text-white font-semibold px-4.5 py-2.5 rounded-xl border border-navy/20 shadow-xs flex items-center gap-1.5 cursor-pointer transition-all"
          >
            <Plus className="w-4 h-4 text-gold" />
            Book Fitting Fitting
          </button>
        </div>
      </div>

      {/* VIEW TABS */}
      <div className="bg-white rounded-3xl border border-light shadow-sm p-6 space-y-6">
        <div className="flex border-b border-light text-xs">
          <button 
            onClick={() => setActiveTab("calendar")}
            className={`py-3 px-5 font-bold uppercase border-b-2 transition-all cursor-pointer ${
              activeTab === "calendar" 
                ? "border-gold text-navy bg-white" 
                : "border-transparent text-muted-grey hover:text-navy hover:bg-cream/10"
            }`}
          >
            Scheduled Fitting Calendar
          </button>
          <button 
            onClick={() => setActiveTab("alterations")}
            className={`py-3 px-5 font-bold uppercase border-b-2 transition-all cursor-pointer ${
              activeTab === "alterations" 
                ? "border-gold text-navy bg-white" 
                : "border-transparent text-muted-grey hover:text-navy hover:bg-cream/10"
            }`}
          >
            Trial Alteration Journals
          </button>
        </div>

        {/* TAB CONTENTS */}
        {activeTab === "calendar" ? (
          // CALENDAR/SCHEDULES VIEW
          <div className="space-y-5 animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Mini side guide */}
              <div className="md:col-span-1 bg-cream/35 p-5 rounded-2xl border border-light space-y-4">
                <h3 className="font-serif font-bold text-navy text-sm">Fitting Room Directives</h3>
                <p className="text-muted-grey leading-relaxed">
                  Bespoke handcrafting relies on Trial Fitting sessions. Record the master cutter's remarks in notes to link changes directly to the customer's permanent database size-card.
                </p>
                
                {/* AUTO CALCULATE TOTAL FITTING AMOUNTS */}
                <div className="space-y-2 border-t border-light pt-3">
                  <span className="text-[10px] uppercase font-bold text-muted-grey tracking-wider">Fitting & Trials Ledger</span>
                  <div className="bg-white p-3 rounded-xl border border-light flex justify-between items-center">
                    <span className="font-semibold text-navy">Total Fitting Charges:</span>
                    <span className="font-bold text-navy font-mono">₹{appointments.reduce((sum, a) => sum + (a.trialCharge || 0), 0)}</span>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-light flex justify-between items-center">
                    <span className="font-semibold text-green-700">Total Collected:</span>
                    <span className="font-bold text-green-700 font-mono">₹{appointments.filter(a => a.paymentStatus === "Paid").reduce((sum, a) => sum + (a.trialCharge || 0), 0)}</span>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-light flex justify-between items-center">
                    <span className="font-semibold text-rose-700">Total Pending:</span>
                    <span className="font-bold text-rose-700 font-mono">₹{appointments.filter(a => a.paymentStatus !== "Paid").reduce((sum, a) => sum + (a.trialCharge || 0), 0)}</span>
                  </div>
                </div>

                <div className="space-y-2 border-t border-light pt-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 bg-gold rounded-full" />
                    <span className="font-semibold text-navy">Trial Fitting</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 bg-blue-500 rounded-full" />
                    <span className="font-semibold text-navy">Alteration Check</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full" />
                    <span className="font-semibold text-navy">Bespoke Fitting</span>
                  </div>
                </div>
              </div>

              {/* Schedules list */}
              <div className="md:col-span-2 space-y-4">
                <h3 className="text-sm font-serif font-bold text-navy uppercase tracking-wider">Scheduled Fittings Pipeline</h3>
                
                {appointments.length === 0 ? (
                  <p className="text-muted-grey italic py-8">No scheduled trials. Book an appointment above.</p>
                ) : (
                  <div className="space-y-3">
                    {appointments.map((appt) => {
                      const cust = customers.find(c => c.id === appt.customerId);
                      const ord = orders.find(o => o.id === appt.orderId);

                      return (
                        <div key={appt.id} className="bg-white p-4.5 rounded-2xl border border-light shadow-3xs flex justify-between items-center gap-4 hover:border-gold/40 transition-colors">
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`px-2 py-0.5 rounded-md font-bold text-[9px] uppercase tracking-wider ${
                                appt.appointmentType === "Alteration Check" 
                                  ? "bg-blue-50 text-blue-700 border border-blue-100" 
                                  : appt.appointmentType === "Bespoke Fitting"
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                                  : "bg-gold/10 text-navy border border-gold/15"
                              }`}>
                                {appt.appointmentType || "Trial Fitting"}
                              </span>
                              
                              <span className="text-muted-grey font-semibold font-mono">
                                {appt.appointmentDate ? (
                                  new Date(appt.appointmentDate).toLocaleDateString("en-IN", {
                                    day: "numeric", month: "short", year: "numeric"
                                  })
                                ) : (
                                  appt.dateTime ? new Date(appt.dateTime).toLocaleDateString("en-IN", {
                                    day: "numeric", month: "short", year: "numeric"
                                  }) : ""
                                )} &bull; {appt.appointmentTime || (appt.dateTime ? appt.dateTime.split("T")[1]?.slice(0, 5) : "")}
                              </span>
                            </div>

                            <p className="font-serif font-bold text-navy text-sm">{cust?.fullName || "Bespoke Customer"}</p>
                            {ord && <p className="text-gold font-semibold font-mono">Linked Order: {ord.orderNumber}</p>}
                            {appt.trialCharge !== undefined && appt.trialCharge !== null ? (
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className="font-bold text-navy font-mono bg-cream px-1.5 py-0.5 rounded-md">₹{appt.trialCharge}</span>
                                <span className={`px-1.5 py-0.5 rounded-md font-bold text-[9px] uppercase tracking-wider ${
                                  appt.paymentStatus === "Paid"
                                    ? "bg-green-50 text-green-700 border border-green-100"
                                    : "bg-rose-50 text-rose-700 border border-rose-100"
                                }`}>
                                  {appt.paymentStatus || "Unpaid"}
                                </span>
                              </div>
                            ) : null}

                            {(appt.clothDropOffDate || appt.fittingPickupDate) && (
                              <div className="flex flex-wrap items-center gap-2 mt-2 bg-cream/30 p-2.5 rounded-xl border border-light max-w-md">
                                {appt.clothDropOffDate && (
                                  <div className="flex flex-col text-[10px]">
                                    <span className="text-muted-grey font-semibold">Cloth Dropped Off:</span>
                                    <span className="font-bold text-navy font-mono">
                                      {new Date(appt.clothDropOffDate).toLocaleDateString("en-IN", {
                                        day: "numeric", month: "short", year: "numeric"
                                      })}
                                    </span>
                                  </div>
                                )}
                                {appt.clothDropOffDate && appt.fittingPickupDate && (
                                  <div className="border-l border-light mx-1 h-5 self-center hidden sm:block" />
                                )}
                                {appt.fittingPickupDate && (
                                  <div className="flex flex-col text-[10px]">
                                    <span className="text-gold font-bold flex items-center gap-0.5">
                                      <span>★ Fitting Pickup Promise:</span>
                                    </span>
                                    <span className="font-bold text-navy font-mono">
                                      {new Date(appt.fittingPickupDate).toLocaleDateString("en-IN", {
                                        day: "numeric", month: "short", year: "numeric"
                                      })}
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}

                            {(appt.readyDate || appt.pickupDate || appt.trialStatus || appt.completedStatus) && (
                              <div className="flex flex-wrap items-center gap-3 mt-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-[10px] max-w-md">
                                {appt.readyDate && (
                                  <div className="flex flex-col">
                                    <span className="text-muted-grey font-semibold">Ready Date:</span>
                                    <span className="font-bold text-green-700 font-mono">
                                      {new Date(appt.readyDate).toLocaleDateString("en-IN", {
                                        day: "numeric", month: "short"
                                      })} {appt.readyTime || ""}
                                    </span>
                                  </div>
                                )}
                                {appt.readyDate && appt.pickupDate && (
                                  <div className="border-l border-slate-200 h-5" />
                                )}
                                {appt.pickupDate && (
                                  <div className="flex flex-col">
                                    <span className="text-muted-grey font-semibold">Actual Pickup:</span>
                                    <span className="font-bold text-navy font-mono">
                                      {new Date(appt.pickupDate).toLocaleDateString("en-IN", {
                                        day: "numeric", month: "short"
                                      })} {appt.pickupTime || ""}
                                    </span>
                                  </div>
                                )}
                                {(appt.trialStatus || appt.completedStatus) && (
                                  <div className="flex gap-2 ml-auto">
                                    {appt.trialStatus && (
                                      <span className={`px-2 py-0.5 rounded font-bold text-[9px] uppercase ${
                                        appt.trialStatus === "Delivered" ? "bg-green-100 text-green-800" :
                                        appt.trialStatus === "Ready" ? "bg-blue-100 text-blue-800" : "bg-yellow-100 text-yellow-800"
                                      }`}>
                                        Trial: {appt.trialStatus}
                                      </span>
                                    )}
                                    {appt.completedStatus && (
                                      <span className={`px-2 py-0.5 rounded font-bold text-[9px] uppercase ${
                                        appt.completedStatus === "Completed" ? "bg-green-100 text-green-800" :
                                        appt.completedStatus === "Cancelled" ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-800"
                                      }`}>
                                        {appt.completedStatus}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}

                            {appt.notes && <p className="text-muted-grey max-w-lg leading-relaxed whitespace-pre-wrap mt-1">{stripEmbeddedTags(appt.notes)}</p>}
                          </div>

                          <div className="flex items-center gap-2 flex-wrap">
                            <button 
                              onClick={() => handleToggleStatus(appt.id, appt.status)}
                              className={`px-3 py-1.5 rounded-lg font-bold border transition-all cursor-pointer text-xs ${
                                appt.status === "Completed"
                                  ? "bg-green-50 border-green-200 text-green-700"
                                  : "bg-cream border-light text-navy hover:border-gold/35"
                              }`}
                            >
                              {appt.status === "Completed" ? "Completed" : "Mark Done"}
                            </button>

                            {appt.status === "Completed" && appt.paymentStatus !== "Paid" && appt.trialCharge && appt.trialCharge > 0 ? (
                              <button
                                onClick={() => {
                                  db.updateAppointment(appt.id, { paymentStatus: "Paid" });
                                  refreshDb();
                                }}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer text-xs transition-colors shadow-3xs"
                                title="Settle Outstanding Fitting Payment"
                              >
                                <Wallet className="w-3.5 h-3.5 text-gold" />
                                <span>Settle Payment</span>
                              </button>
                            ) : null}

                            <button 
                              onClick={() => setViewingAppt(appt)}
                              className="p-1.5 text-navy hover:bg-cream rounded-lg cursor-pointer flex items-center gap-1"
                              title="View Full details"
                            >
                              <Eye className="w-4 h-4 text-navy" />
                            </button>

                            <button 
                              onClick={() => handleEditAppointmentClick(appt)}
                              className="p-1.5 text-navy hover:bg-cream rounded-lg cursor-pointer"
                              title="Edit Fitting details"
                            >
                              <Pencil className="w-4 h-4 text-navy" />
                            </button>

                            <button 
                              onClick={() => handleDeleteAppointment(appt.id)}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                              title="Delete Appointment"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          </div>
        ) : (
          // ALTERATIONS LOG JOURNAL LIST
          <div className="space-y-4 animate-fade-in">
            <h3 className="text-sm font-serif font-bold text-navy uppercase tracking-wider flex items-center gap-1.5">
              <Scissors className="w-4 h-4 text-gold" />
              Trial Alteration modification logs
            </h3>

            {alterationRecords.length === 0 ? (
              <div className="py-12 text-center text-muted-grey italic">
                No active alteration modification logs found. Change appointments type to "Alteration Check" to list them here.
              </div>
            ) : (
              <div className="space-y-3">
                {alterationRecords.map((rec) => {
                  const cust = customers.find(c => c.id === rec.customerId);
                  const ord = orders.find(o => o.id === rec.orderId);

                  return (
                    <div key={rec.id} className="bg-cream/20 p-4.5 rounded-2xl border border-light text-xs font-sans space-y-2">
                      <div className="flex justify-between items-center gap-4 border-b border-light pb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-serif font-bold text-navy text-sm">{cust?.fullName || "Bespoke Customer"}</span>
                          <span className="text-muted-grey font-mono text-[10px]">Fitting Master: Hardik Nagpal</span>
                        </div>
                        <span className="text-muted-grey font-mono">{new Date(rec.appointmentDate).toLocaleDateString("en-IN")}</span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <span className="text-muted-grey uppercase text-[10px] font-bold tracking-wider">Fitting modification specs</span>
                          <p className="text-charcoal leading-relaxed whitespace-pre-wrap mt-0.5">{rec.notes}</p>
                        </div>
                        {ord && (
                          <div>
                            <span className="text-muted-grey uppercase text-[10px] font-bold tracking-wider">Linked order book</span>
                            <p className="font-serif font-bold text-navy mt-0.5">{ord.orderNumber} &bull; {ord.garmentTypes.join(", ")}</p>
                            <p className="text-gold font-semibold text-[10px] uppercase font-mono tracking-wider mt-1">Status: {ord.status}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* BOOK APPOINTMENT MODAL */}
      {isBookModalOpen && (
        <div className="fixed inset-0 bg-black/55 flex items-center justify-center p-4 z-50 animate-fade-in text-xs">
          <div className="bg-white rounded-3xl border border-light max-w-3xl w-full shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-scale-up">
            
            {/* Sticky Header */}
            <div className="flex justify-between items-center border-b border-light p-5 md:p-6 pb-4 shrink-0 bg-white">
              <h3 className="text-base font-serif font-bold text-navy">
                {editingId ? "Edit Fitting Details" : "Schedule Fitting Trial"}
              </h3>
              <button 
                onClick={() => {
                  resetForm();
                  setIsBookModalOpen(false);
                }} 
                className="text-muted-grey hover:text-navy cursor-pointer w-6 h-6 flex items-center justify-center rounded-full hover:bg-cream/60 transition-all font-bold text-sm"
              >✕</button>
            </div>

            {/* Scrollable Form Container with 2-Column Grid */}
            <form id="trial-booking-form" onSubmit={handleBookAppointment} className="overflow-y-auto p-5 md:p-6 space-y-5 flex-1 max-h-[calc(90vh-140px)]">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                
                {/* Customer selection */}
                <div className="space-y-1.5 md:col-span-2">
                  <label className="font-semibold text-navy">Bespoke Customer <span className="text-red-600">*</span></label>
                  {editingId ? (
                    <div className="w-full bg-cream/35 px-3 py-2 border border-light rounded-lg font-bold text-navy">
                      {customers.find(c => c.id === formCustomerId)?.fullName || "Bespoke Customer"}
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {/* Select Existing or New Toggle */}
                      <div className="flex bg-cream/45 p-1 rounded-xl border border-light text-center">
                        <button
                          type="button"
                          onClick={() => {
                            setIsNewCustomer(false);
                            setFormCustomerId("");
                          }}
                          className={`w-1/2 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            !isNewCustomer
                              ? "bg-navy text-white shadow-3xs"
                              : "text-muted-grey hover:text-navy cursor-pointer"
                          }`}
                        >
                          Existing Customer
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsNewCustomer(true);
                            setFormCustomerId("");
                          }}
                          className={`w-1/2 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            isNewCustomer
                              ? "bg-navy text-white shadow-3xs"
                              : "text-muted-grey hover:text-navy cursor-pointer"
                          }`}
                        >
                          New Customer
                        </button>
                      </div>

                      {!isNewCustomer ? (
                        <select 
                          required
                          value={formCustomerId}
                          onChange={(e) => setFormCustomerId(e.target.value)}
                          className="w-full bg-white px-3 py-2 border border-light rounded-lg focus:outline-hidden text-xs"
                        >
                          <option value="">-- Select Customer --</option>
                          {customers.map(c => (
                            <option key={c.id} value={c.id}>{c.fullName} ({c.mobileNumber})</option>
                          ))}
                        </select>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-cream/20 p-3 rounded-2xl border border-light/80">
                          <div className="space-y-1">
                            <label className="font-semibold text-navy text-[11px] block">Full Name <span className="text-red-600">*</span></label>
                            <input
                              type="text"
                              required
                              placeholder="Enter Name"
                              value={newCustomerName}
                              onChange={(e) => setNewCustomerName(e.target.value)}
                              className="w-full bg-white px-3 py-1.5 border border-light rounded-lg focus:outline-hidden text-xs"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="font-semibold text-navy text-[11px] block">Mobile Number</label>
                            <input
                              type="text"
                              placeholder="Mobile number"
                              value={newCustomerPhone}
                              onChange={(e) => setNewCustomerPhone(e.target.value)}
                              className="w-full bg-white px-3 py-1.5 border border-light rounded-lg focus:outline-hidden text-xs font-mono"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Order selector (Optional) */}
                {!isNewCustomer && (
                  <div className="space-y-1 md:col-span-1">
                    <label className="font-semibold text-navy">Linked Order Number (Optional)</label>
                    <select 
                      value={formOrderId}
                      onChange={(e) => setFormOrderId(e.target.value)}
                      className="w-full bg-white px-3 py-2 border border-light rounded-lg focus:outline-hidden text-xs"
                    >
                      <option value="">-- Choose Order --</option>
                      {orders.filter(o => o.customerId === formCustomerId).map(o => (
                        <option key={o.id} value={o.id}>{o.orderNumber} ({o.garmentTypes.join(", ")})</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Fitting Type */}
                <div className={`space-y-1 ${isNewCustomer ? "md:col-span-2" : "md:col-span-1"}`}>
                  <label className="font-semibold text-navy">Fitting Type</label>
                  <select 
                    value={formType}
                    onChange={(e: any) => setFormType(e.target.value)}
                    className="w-full bg-white px-3 py-2 border border-light rounded-lg focus:outline-hidden"
                  >
                    <option value="Trial Fitting">Trial Fitting</option>
                    <option value="Alteration Check">Alteration Check</option>
                    <option value="Bespoke Fitting">Bespoke Fitting</option>
                  </select>
                </div>

                {/* Fitting Date */}
                <div className="space-y-1 md:col-span-1">
                  <label className="font-semibold text-navy">Fitting Date</label>
                  <input 
                    type="date" 
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full bg-white px-3 py-2 border border-light rounded-lg focus:outline-hidden"
                  />
                </div>

                {/* Time Slot */}
                <div className="space-y-1 md:col-span-1">
                  <label className="font-semibold text-navy">Time Slot</label>
                  <input 
                    type="time" 
                    value={formTime}
                    onChange={(e) => setFormTime(e.target.value)}
                    className="w-full bg-white px-3 py-2 border border-light rounded-lg focus:outline-hidden"
                  />
                </div>

                {/* Trial Charge (₹) */}
                <div className="space-y-1 md:col-span-1">
                  <label className="font-semibold text-navy">Trial Charge (₹)</label>
                  <input 
                    type="number" 
                    min={0}
                    placeholder="e.g. 500"
                    value={formCharge}
                    onChange={(e) => setFormCharge(Number(e.target.value))}
                    className="w-full bg-white px-3 py-2 border border-light rounded-lg focus:outline-hidden font-mono"
                  />
                </div>

                {/* Payment Status */}
                <div className="space-y-1 md:col-span-1">
                  <label className="font-semibold text-navy">Payment Status</label>
                  <select 
                    value={formPaymentStatus}
                    onChange={(e: any) => setFormPaymentStatus(e.target.value)}
                    className="w-full bg-white px-3 py-2 border border-light rounded-lg focus:outline-hidden"
                  >
                    <option value="Unpaid">Unpaid</option>
                    <option value="Paid">Paid</option>
                  </select>
                </div>

                {/* Appointment Status */}
                <div className="space-y-1 md:col-span-2">
                  <label className="font-semibold text-navy">Appointment Status</label>
                  <select 
                    value={formStatus}
                    onChange={(e: any) => setFormStatus(e.target.value)}
                    className="w-full bg-white px-3 py-2 border border-light rounded-lg focus:outline-hidden"
                  >
                    <option value="Scheduled">Scheduled</option>
                    <option value="Completed">Completed</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </div>

                {/* Cloth Drop-off and Fitting Pickup Dates */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-cream/35 p-3 rounded-2xl border border-light md:col-span-1">
                  <div className="space-y-1">
                    <label className="font-semibold text-navy text-[11px] block">Cloth Handover / Drop-off Date</label>
                    <input 
                      type="date" 
                      value={formClothDropOffDate}
                      onChange={(e) => setFormClothDropOffDate(e.target.value)}
                      className="w-full bg-white px-3 py-2 border border-light rounded-lg focus:outline-hidden text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-navy text-[11px] block">Fitting Pickup / Delivery Date</label>
                    <input 
                      type="date" 
                      value={formFittingPickupDate}
                      onChange={(e) => setFormFittingPickupDate(e.target.value)}
                      className="w-full bg-white px-3 py-2 border border-light rounded-lg focus:outline-hidden text-xs"
                    />
                  </div>
                </div>

                {/* Ready and Actual Pickup Statuses */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-cream/20 p-3 rounded-2xl border border-light md:col-span-1">
                  <div className="space-y-1">
                    <label className="font-semibold text-navy text-[11px] block">Item Ready Date & Time</label>
                    <div className="flex gap-2">
                      <input 
                        type="date" 
                        value={formReadyDate}
                        onChange={(e) => setFormReadyDate(e.target.value)}
                        className="w-1/2 bg-white px-2 py-1.5 border border-light rounded-lg focus:outline-hidden text-xs"
                      />
                      <input 
                        type="time" 
                        value={formReadyTime}
                        onChange={(e) => setFormReadyTime(e.target.value)}
                        className="w-1/2 bg-white px-2 py-1.5 border border-light rounded-lg focus:outline-hidden text-xs"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-navy text-[11px] block">Actual Pickup Date & Time</label>
                    <div className="flex gap-2">
                      <input 
                        type="date" 
                        value={formPickupDate}
                        onChange={(e) => setFormPickupDate(e.target.value)}
                        className="w-1/2 bg-white px-2 py-1.5 border border-light rounded-lg focus:outline-hidden text-xs"
                      />
                      <input 
                        type="time" 
                        value={formPickupTime}
                        onChange={(e) => setFormPickupTime(e.target.value)}
                        className="w-1/2 bg-white px-2 py-1.5 border border-light rounded-lg focus:outline-hidden text-xs"
                      />
                    </div>
                  </div>
                </div>

                {/* Trial Status */}
                <div className="space-y-1 md:col-span-1">
                  <label className="font-semibold text-navy text-[11px] block">Trial Status</label>
                  <select 
                    value={formTrialStatus}
                    onChange={(e: any) => setFormTrialStatus(e.target.value)}
                    className="w-full bg-white px-3 py-2 border border-light rounded-lg focus:outline-hidden text-xs"
                  >
                    <option value="Pending">Pending</option>
                    <option value="In-Progress">In-Progress</option>
                    <option value="Ready">Ready for Trial</option>
                    <option value="Altered">Altered & Verified</option>
                    <option value="Delivered">Delivered</option>
                  </select>
                </div>

                {/* Completed Status */}
                <div className="space-y-1 md:col-span-1">
                  <label className="font-semibold text-navy text-[11px] block">Completed Status</label>
                  <select 
                    value={formCompletedStatus}
                    onChange={(e: any) => setFormCompletedStatus(e.target.value)}
                    className="w-full bg-white px-3 py-2 border border-light rounded-lg focus:outline-hidden text-xs"
                  >
                    <option value="Pending">Pending</option>
                    <option value="Completed">Completed</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </div>

                {/* Notes */}
                <div className="space-y-1 md:col-span-2">
                  <label className="font-semibold text-navy">Fitting specifications / Modification Notes</label>
                  <textarea 
                    rows={2}
                    placeholder="E.g. Double vents checking on coat waist. Check shoulder pad thickness during trial."
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    className="w-full bg-white p-2.5 border border-light rounded-lg focus:outline-hidden"
                  />
                </div>

              </div>
            </form>

            {/* Sticky Action Footer */}
            <div className="flex justify-end gap-3 p-5 md:p-6 border-t border-light bg-cream/15 shrink-0">
              <button 
                type="button" 
                onClick={() => {
                  resetForm();
                  setIsBookModalOpen(false);
                }}
                className="bg-cream hover:bg-cream/80 text-navy font-semibold px-4.5 py-2 rounded-xl border border-light cursor-pointer text-xs transition-colors"
              >
                Cancel
              </button>
              <button 
                type="submit"
                form="trial-booking-form"
                className="bg-navy hover:bg-navy-hover text-white font-semibold px-5 py-2 rounded-xl cursor-pointer text-xs transition-colors"
              >
                {editingId ? "Save Changes" : "Schedule Trial"}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* VIEW APPOINTMENT DETAILS MODAL */}
      {viewingAppt && (() => {
        const cust = customers.find(c => c.id === viewingAppt.customerId);
        const ord = orders.find(o => o.id === viewingAppt.orderId);
        return (
          <div className="fixed inset-0 bg-black/55 flex items-center justify-center p-4 z-50 animate-fade-in text-xs">
            <div className="bg-white rounded-3xl border border-light max-w-2xl w-full shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-scale-up text-xs">
              
              {/* Header */}
              <div className="flex justify-between items-center border-b border-light p-5 md:p-6 pb-4 shrink-0 bg-white">
                <div>
                  <h3 className="text-sm md:text-base font-serif font-bold text-navy flex items-center gap-1.5">
                    <CalendarIcon className="w-4.5 h-4.5 text-gold" />
                    Fitting & Trial Session Details
                  </h3>
                  <span className="text-[10px] text-muted-grey font-mono uppercase tracking-wider mt-0.5 block">
                    Fitting Slip #TRL-{viewingAppt.id.slice(-6).toUpperCase()}
                  </span>
                </div>
                <button 
                  onClick={() => setViewingAppt(null)} 
                  className="text-muted-grey hover:text-navy cursor-pointer w-6 h-6 flex items-center justify-center rounded-full hover:bg-cream/60 transition-all font-bold text-sm"
                >✕</button>
              </div>

              {/* Scrollable details */}
              <div className="overflow-y-auto p-5 md:p-6 space-y-5 flex-1 max-h-[calc(90vh-140px)]">
                
                {/* Customer Card */}
                <div className="bg-cream/20 border border-light p-4 rounded-2xl flex items-start gap-3">
                  <div className="p-2 bg-navy/5 rounded-xl border border-navy/10 text-navy shrink-0">
                    <User className="w-5 h-5 text-gold" />
                  </div>
                  <div className="space-y-1 flex-1">
                    <span className="text-[10px] uppercase font-bold text-muted-grey tracking-wider">Bespoke Customer</span>
                    <h4 className="font-serif font-bold text-navy text-sm">{cust?.fullName || "Bespoke Customer"}</h4>
                    {cust?.mobileNumber && (
                      <p className="text-muted-grey font-mono text-[11px]">Mobile: {cust.mobileNumber}</p>
                    )}
                  </div>
                  {ord && (
                    <div className="text-right shrink-0 bg-gold/10 border border-gold/15 px-3 py-1.5 rounded-xl">
                      <span className="text-[9px] uppercase font-bold text-navy block">Linked Order</span>
                      <span className="font-bold text-navy font-mono text-[11px]">{ord.orderNumber}</span>
                    </div>
                  )}
                </div>

                {/* Core Parameters Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
                  <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
                    <span className="text-muted-grey font-semibold text-[10px] block mb-1">Fitting Type</span>
                    <span className={`px-2 py-0.5 rounded-md font-bold text-[9px] uppercase tracking-wider inline-block ${
                      viewingAppt.appointmentType === "Alteration Check" 
                        ? "bg-blue-50 text-blue-700 border border-blue-100" 
                        : viewingAppt.appointmentType === "Bespoke Fitting"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                        : "bg-gold/10 text-navy border border-gold/15"
                    }`}>
                      {viewingAppt.appointmentType || "Trial Fitting"}
                    </span>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
                    <span className="text-muted-grey font-semibold text-[10px] block mb-1">Scheduled Date</span>
                    <span className="font-bold text-navy text-xs font-mono">
                      {viewingAppt.appointmentDate ? (
                        new Date(viewingAppt.appointmentDate).toLocaleDateString("en-IN", {
                          day: "numeric", month: "short", year: "numeric"
                        })
                      ) : (
                        viewingAppt.dateTime ? new Date(viewingAppt.dateTime).toLocaleDateString("en-IN", {
                          day: "numeric", month: "short", year: "numeric"
                        }) : "N/A"
                      )}
                    </span>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
                    <span className="text-muted-grey font-semibold text-[10px] block mb-1">Time Slot</span>
                    <span className="font-bold text-navy text-xs font-mono">
                      {viewingAppt.appointmentTime || (viewingAppt.dateTime ? viewingAppt.dateTime.split("T")[1]?.slice(0, 5) : "N/A")}
                    </span>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
                    <span className="text-muted-grey font-semibold text-[10px] block mb-1">Trial Charge</span>
                    <span className="font-bold text-navy text-xs font-mono">
                      ₹{viewingAppt.trialCharge || 0}
                    </span>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
                    <span className="text-muted-grey font-semibold text-[10px] block mb-1">Payment Status</span>
                    <span className={`px-2 py-0.5 rounded-md font-bold text-[9px] uppercase tracking-wider inline-block ${
                      viewingAppt.paymentStatus === "Paid"
                        ? "bg-green-50 text-green-700 border border-green-100"
                        : "bg-rose-50 text-rose-700 border border-rose-100"
                    }`}>
                      {viewingAppt.paymentStatus || "Unpaid"}
                    </span>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
                    <span className="text-muted-grey font-semibold text-[10px] block mb-1">Appointment Status</span>
                    <span className={`px-2 py-0.5 rounded-md font-bold text-[9px] uppercase tracking-wider inline-block ${
                      viewingAppt.status === "Completed"
                        ? "bg-green-50 text-green-700 border border-green-100"
                        : viewingAppt.status === "Cancelled"
                        ? "bg-rose-50 text-rose-700 border border-rose-100"
                        : "bg-amber-50 text-amber-700 border border-amber-100"
                    }`}>
                      {viewingAppt.status || "Scheduled"}
                    </span>
                  </div>
                </div>

                {/* Sub-Statuses (Trial & Completed statuses) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-cream/15 border border-light p-3.5 rounded-2xl">
                    <span className="font-semibold text-navy text-[11px] block mb-2 uppercase tracking-wide">Workshop Trial Status</span>
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-1 rounded font-bold text-[10px] uppercase ${
                        viewingAppt.trialStatus === "Delivered" ? "bg-green-100 text-green-800" :
                        viewingAppt.trialStatus === "Ready" ? "bg-blue-100 text-blue-800" : "bg-yellow-100 text-yellow-800"
                      }`}>
                        Trial: {viewingAppt.trialStatus || "Pending"}
                      </span>
                    </div>
                  </div>

                  <div className="bg-cream/15 border border-light p-3.5 rounded-2xl">
                    <span className="font-semibold text-navy text-[11px] block mb-2 uppercase tracking-wide">Bespoke Completion Status</span>
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-1 rounded font-bold text-[10px] uppercase ${
                        viewingAppt.completedStatus === "Completed" ? "bg-green-100 text-green-800" :
                        viewingAppt.completedStatus === "Cancelled" ? "bg-rose-100 text-rose-800" : "bg-slate-100 text-slate-800"
                      }`}>
                        {viewingAppt.completedStatus || "Pending"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Dates Details Section */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-cream/35 p-4 rounded-2xl border border-light">
                  <div className="space-y-1">
                    <span className="text-muted-grey font-semibold text-[10px] block">Cloth Handover / Drop-off Date</span>
                    <p className="font-bold text-navy font-mono text-xs mt-1">
                      {viewingAppt.clothDropOffDate ? (
                        new Date(viewingAppt.clothDropOffDate).toLocaleDateString("en-IN", {
                          day: "numeric", month: "long", year: "numeric"
                        })
                      ) : "Not recorded"}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <span className="text-gold font-bold text-[10px] block">★ Fitting Pickup / Delivery Date</span>
                    <p className="font-bold text-navy font-mono text-xs mt-1">
                      {viewingAppt.fittingPickupDate ? (
                        new Date(viewingAppt.fittingPickupDate).toLocaleDateString("en-IN", {
                          day: "numeric", month: "long", year: "numeric"
                        })
                      ) : "Not promised"}
                    </p>
                  </div>
                </div>

                {/* Milestones / Timestamps Section */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-cream/15 p-4 rounded-2xl border border-light">
                  <div className="space-y-1">
                    <span className="text-muted-grey font-semibold text-[10px] block">Item Ready Date & Time</span>
                    <p className="font-bold text-green-700 font-mono text-xs mt-1">
                      {viewingAppt.readyDate ? (
                        `${new Date(viewingAppt.readyDate).toLocaleDateString("en-IN", {
                          day: "numeric", month: "short", year: "numeric"
                        })} ${viewingAppt.readyTime || ""}`
                      ) : "Not ready yet"}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <span className="text-muted-grey font-semibold text-[10px] block">Actual Pickup Date & Time</span>
                    <p className="font-bold text-navy font-mono text-xs mt-1">
                      {viewingAppt.pickupDate ? (
                        `${new Date(viewingAppt.pickupDate).toLocaleDateString("en-IN", {
                          day: "numeric", month: "short", year: "numeric"
                        })} ${viewingAppt.pickupTime || ""}`
                      ) : "Not picked up yet"}
                    </p>
                  </div>
                </div>

                {/* Notes & Specs Section */}
                <div className="space-y-1.5">
                  <span className="font-bold text-navy text-[11px] block uppercase tracking-wide">Fitting specifications / Modification Notes</span>
                  <div className="bg-cream/20 p-4 rounded-2xl border border-light leading-relaxed text-navy text-xs whitespace-pre-wrap min-h-[60px]">
                    {stripEmbeddedTags(viewingAppt.notes) || "No custom specification notes added for this session."}
                  </div>
                </div>

              </div>

              {/* Action Footer */}
              <div className="flex justify-between items-center p-5 md:p-6 border-t border-light bg-cream/15 shrink-0">
                <div>
                  {viewingAppt.status === "Completed" && viewingAppt.paymentStatus !== "Paid" && viewingAppt.trialCharge && viewingAppt.trialCharge > 0 ? (
                    <button
                      onClick={() => {
                        db.updateAppointment(viewingAppt.id, { paymentStatus: "Paid" });
                        setViewingAppt(prev => prev ? { ...prev, paymentStatus: "Paid" } : null);
                        refreshDb();
                      }}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2 rounded-xl flex items-center gap-1.5 cursor-pointer text-xs transition-colors shadow-xs"
                    >
                      <Wallet className="w-4 h-4 text-gold" />
                      <span>Settle Payment</span>
                    </button>
                  ) : null}
                </div>
                <button 
                  type="button" 
                  onClick={() => setViewingAppt(null)}
                  className="bg-navy hover:bg-navy-hover text-white font-semibold px-5 py-2 rounded-xl cursor-pointer text-xs transition-colors"
                >
                  Close Details
                </button>
              </div>

            </div>
          </div>
        );
      })()}

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
