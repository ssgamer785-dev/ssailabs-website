/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  Ruler, 
  Copy, 
  Printer, 
  Save, 
  User, 
  Calendar, 
  Check, 
  Info, 
  Sparkles,
  Scissors
} from "lucide-react";
import { Customer, Measurement, normalizePantMeasurement } from "../types";
import { db, stripEmbeddedTags } from "../db";
import ConfirmModal from "./ConfirmModal";

interface MeasurementsViewProps {
  initialCustomerId?: string;
  initialCopyFromId?: string;
  onSaveSuccess: (customerId: string) => void;
}

export default function MeasurementsView({ 
  initialCustomerId, 
  initialCopyFromId,
  onSaveSuccess 
}: MeasurementsViewProps) {
  // --- STATE ---
  const [customers, setCustomers] = useState<Customer[]>(db.getCustomers());
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(initialCustomerId || "");
  const [slipNumber, setSlipNumber] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  
  // Dates
  const [tryOnDate, setTryOnDate] = useState("2026-07-05");
  const [deliveryDate, setDeliveryDate] = useState("2026-07-20");

  // Sub-tab state
  const [activeTab, setActiveTab] = useState<"coat" | "pent" | "vest" | "shirt" | "remarks">("coat");

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

  // FORM INPUT STATES
  // Coat/Indo Western
  const [coatLength, setCoatLength] = useState("");
  const [coatChest, setCoatChest] = useState("");
  const [coatWaist, setCoatWaist] = useState("");
  const [coatNeck, setCoatNeck] = useState("");
  const [coatTira, setCoatTira] = useState("");
  const [coatHb, setCoatHb] = useState("");
  const [coatCback, setCoatCback] = useState("");
  const [coatArms, setCoatArms] = useState("");
  const [coatBicep, setCoatBicep] = useState("");
  const [coatFront, setCoatFront] = useState("");
  const [coatModa, setCoatModa] = useState("");

  // Pent
  const [pentLength, setPentLength] = useState("");
  const [pentWaist, setPentWaist] = useState("");
  const [pentHips, setPentHips] = useState("");
  const [pentInlength, setPentInlength] = useState("");
  const [pentPatt, setPentPatt] = useState("");
  const [pentBottom, setPentBottom] = useState("");
  const [pentKnee, setPentKnee] = useState("");

  // Vest
  const [vestLength, setVestLength] = useState("");
  const [vestChest, setVestChest] = useState("");
  const [vestWaist, setVestWaist] = useState("");
  const [vestHip, setVestHip] = useState("");
  const [vestTira, setVestTira] = useState("");
  const [vestNeck, setVestNeck] = useState("");

  // Shirt/Kurta
  const [shirtLength, setShirtLength] = useState("");
  const [shirtChest, setShirtChest] = useState("");
  const [shirtWaist, setShirtWaist] = useState("");
  const [shirtHip, setShirtHip] = useState("");
  const [shirtTira, setShirtTira] = useState("");
  const [shirtArms, setShirtArms] = useState("");
  const [shirtNeck, setShirtNeck] = useState("");
  const [shirtCback, setShirtCback] = useState("");
  const [shirtFront, setShirtFront] = useState("");
  const [shirtModa, setShirtModa] = useState("");
  const [shirtBicep, setShirtBicep] = useState("");

  // Remarks
  const [designNotes, setDesignNotes] = useState("");
  const [fabricSelected, setFabricSelected] = useState("");
  const [liningChoice, setLiningChoice] = useState("");
  const [remarks, setRemarks] = useState("");

  // PRINT PREVIEW OVERLAY
  const [isPrintPreviewOpen, setIsPrintPreviewOpen] = useState(false);

  // Load Previous measurements for memory hints
  const [previousMeas, setPreviousMeas] = useState<Measurement | null>(null);

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);

  // Load or sync state on mount/change
  const refreshDb = () => {
    setCustomers(db.getCustomers());
    const nextSlipNum = `SS-${String(db.getMeasurements("").length + 1).padStart(4, "0")}`;
    setSlipNumber(nextSlipNum);
  };

  useEffect(() => {
    refreshDb();
    return db.onSync(refreshDb);
  }, []);

  // Handle direct Copy from Id
  useEffect(() => {
    if (initialCopyFromId) {
      applyMeasurementCopy(initialCopyFromId);
    }
  }, [initialCopyFromId]);

  // Apply measurements copy helper
  const applyMeasurementCopy = (measId: string) => {
    const source = db.getMeasurementById(measId);
    if (!source) return;

    // Set Coat
    setCoatLength(source.coatIndoWestern.length);
    setCoatChest(source.coatIndoWestern.chest);
    setCoatWaist(source.coatIndoWestern.waist);
    setCoatNeck(source.coatIndoWestern.neck);
    setCoatTira(source.coatIndoWestern.tira);
    setCoatHb(source.coatIndoWestern.hb);
    setCoatCback(source.coatIndoWestern.cback);
    setCoatArms(source.coatIndoWestern.arms);
    setCoatBicep(source.coatIndoWestern.bicep || "");
    setCoatFront(source.coatIndoWestern.front || "");
    setCoatModa(source.coatIndoWestern.moda || "");

    // Set Pent. Normalised so size cards saved under older field names (inseam, thigh,
    // seat) still populate the standard seven boxes instead of appearing blank.
    const normPent = normalizePantMeasurement(source.pent);
    setPentLength(normPent.length || "");
    setPentWaist(normPent.waist || "");
    setPentHips(normPent.hips || "");
    setPentInlength(normPent.inlength || "");
    setPentPatt(normPent.patt || "");
    setPentKnee(normPent.knee || "");
    setPentBottom(normPent.bottom || "");

    // Set Vest
    setVestLength(source.vest.length);
    setVestChest(source.vest.chest);
    setVestWaist(source.vest.waist);
    setVestHip(source.vest.hip);
    setVestTira(source.vest.tira);
    setVestNeck(source.vest.neck);

    // Set Shirt/Kurta
    setShirtLength(source.shirtKurta.length);
    setShirtChest(source.shirtKurta.chest);
    setShirtWaist(source.shirtKurta.waist);
    setShirtHip(source.shirtKurta.hip);
    setShirtTira(source.shirtKurta.tira);
    setShirtArms(source.shirtKurta.arms);
    setShirtNeck(source.shirtKurta.neck);
    setShirtCback(source.shirtKurta.cback);
    setShirtFront(source.shirtKurta.front);
    setShirtModa(source.shirtKurta.moda);
    setShirtBicep(source.shirtKurta.bicep);

    // Set Remarks
    setDesignNotes(stripEmbeddedTags(source.designNotes || ""));
    setFabricSelected(stripEmbeddedTags(source.fabricSelected || ""));
    setLiningChoice(stripEmbeddedTags(source.liningChoice || ""));
    setRemarks(stripEmbeddedTags(source.remarks || ""));

    // Set Serial Number (copied from any of the garments)
    setSerialNumber(source.coatIndoWestern.serialNumber || source.pent.serialNumber || source.vest.serialNumber || source.shirtKurta.serialNumber || "");

    // Set date bounds
    setTryOnDate(source.tryOnDate);
    setDeliveryDate(source.deliveryDate);
  };

  const clearFormFields = () => {
    setCoatLength("");
    setCoatChest("");
    setCoatWaist("");
    setCoatNeck("");
    setCoatTira("");
    setCoatHb("");
    setCoatCback("");
    setCoatArms("");
    setCoatBicep("");
    setCoatFront("");
    setCoatModa("");

    setPentWaist("");
    setPentHips("");
    setPentPatt("");
    setPentBottom("");
    setPentKnee("");

    setVestLength("");
    setVestChest("");
    setVestWaist("");
    setVestHip("");
    setVestTira("");
    setVestNeck("");

    setShirtLength("");
    setShirtChest("");
    setShirtWaist("");
    setShirtHip("");
    setShirtTira("");
    setShirtArms("");
    setShirtNeck("");
    setShirtCback("");
    setShirtFront("");
    setShirtModa("");
    setShirtBicep("");

    setDesignNotes("");
    setFabricSelected("");
    setLiningChoice("");
    setRemarks("");
    setSerialNumber("");

    setTryOnDate("2026-07-05");
    setDeliveryDate("2026-07-20");
  };

  useEffect(() => {
    if (selectedCustomerId) {
      const latest = db.getLatestMeasurement(selectedCustomerId);
      if (latest) {
        setPreviousMeas(latest);
        applyMeasurementCopy(latest.id);
      } else {
        setPreviousMeas(null);
        clearFormFields();
      }
    } else {
      setPreviousMeas(null);
      clearFormFields();
    }
  }, [selectedCustomerId]);

  const handleCopyFromLast = () => {
    if (!selectedCustomerId) {
      setConfirmModal({
        isOpen: true,
        title: "Selection Required",
        message: "Please select a customer first to load measurement records.",
        confirmLabel: "Understood",
        variant: "warning",
        onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
      });
      return;
    }
    const latest = db.getLatestMeasurement(selectedCustomerId);
    if (!latest) {
      setConfirmModal({
        isOpen: true,
        title: "No History Found",
        message: "This customer has no previous measurement history to copy from.",
        confirmLabel: "Understood",
        variant: "info",
        onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
      });
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: "Pre-fill Size Configurations",
      message: `Would you like to pre-fill size configurations from measurement slip ${latest.slipNumber} (Dated ${new Date(latest.versionDate).toLocaleDateString()})?`,
      confirmLabel: "Pre-fill Configuration",
      cancelLabel: "Cancel",
      variant: "info",
      onConfirm: () => {
        applyMeasurementCopy(latest.id);
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      },
      onCancel: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
    });
  };

  const handleSave = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedCustomerId) {
      setConfirmModal({
        isOpen: true,
        title: "Selection Required",
        message: "Please select a customer first to save size measurements.",
        confirmLabel: "Understood",
        variant: "warning",
        onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
      });
      return;
    }

    const payload = {
      customerId: selectedCustomerId,
      tryOnDate,
      deliveryDate,
      coatIndoWestern: {
        length: coatLength, chest: coatChest, waist: coatWaist, neck: coatNeck, tira: coatTira, hb: coatHb, cback: coatCback, arms: coatArms, bicep: coatBicep, front: coatFront, moda: coatModa, serialNumber: serialNumber
      },
      pent: {
        length: pentLength, waist: pentWaist, hips: pentHips, inlength: pentInlength,
        patt: pentPatt, knee: pentKnee, bottom: pentBottom, serialNumber: serialNumber
      },
      vest: {
        length: vestLength, chest: vestChest, waist: vestWaist, hip: vestHip, tira: vestTira, neck: vestNeck, serialNumber: serialNumber
      },
      shirtKurta: {
        length: shirtLength, chest: shirtChest, waist: shirtWaist, hip: shirtHip, tira: shirtTira, arms: shirtArms, neck: shirtNeck, cback: shirtCback, front: shirtFront, moda: shirtModa, bicep: shirtBicep, serialNumber: serialNumber
      },
      designNotes,
      fabricSelected,
      liningChoice,
      remarks,
      createdBy: "usr_staff1" // Master Tailor
    };

    const saved = db.saveMeasurement(payload);
    setConfirmModal({
      isOpen: true,
      title: "Measurements Saved",
      message: `Measurement slip ${saved.slipNumber} has been saved successfully in the database files. Memory change comparison execution completed.`,
      confirmLabel: "Understood",
      variant: "info",
      onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
    });
    
    onSaveSuccess(selectedCustomerId);
  };

  const handleSaveAndPrint = () => {
    if (!selectedCustomerId) {
      setConfirmModal({
        isOpen: true,
        title: "Selection Required",
        message: "Please select a customer first to save and preview measurements.",
        confirmLabel: "Understood",
        variant: "warning",
        onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
      });
      return;
    }
    // Save first
    handleSave();
    // Open print view
    setIsPrintPreviewOpen(true);
  };

  return (
    <div className="space-y-6">
      
      {/* HEADER CARD */}
      <div className="bg-white rounded-3xl border border-light shadow-sm p-6 space-y-4 font-sans animate-fade-in">
        <div>
          <h1 className="text-2xl font-serif text-navy font-bold flex items-center gap-2">
            <Ruler className="w-5.5 h-5.5 text-gold" />
            Measurement Registration
          </h1>
          <p className="text-muted-grey text-sm mt-0.5">Record bespoke menswear sizing configurations directly to customer account history</p>
        </div>

        {/* Top Header Fields Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 bg-cream/35 p-4 rounded-2xl border border-light text-xs text-charcoal">
          {/* Slip Number - Ready only */}
          <div className="space-y-1">
            <label className="font-semibold text-navy">Slip Number</label>
            <input 
              type="text" 
              readOnly 
              value={slipNumber}
              className="w-full bg-cream/70 px-3 py-2 border border-light rounded-lg font-mono font-bold text-navy focus:outline-hidden"
            />
          </div>

          {/* Serial Number - Editable */}
          <div className="space-y-1">
            <label className="font-semibold text-navy">Serial Number</label>
            <input 
              type="text" 
              placeholder="e.g. SN-987"
              value={serialNumber}
              onChange={(e) => setSerialNumber(e.target.value)}
              className="w-full bg-white px-3 py-2 border border-light rounded-lg font-sans text-xs focus:outline-hidden focus:border-gold"
            />
          </div>

          {/* Customer Selection */}
          <div className="space-y-1">
            <label className="font-semibold text-navy">Select Customer <span className="text-red-600">*</span></label>
            <select 
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              className="w-full bg-white px-3 py-2 border border-light rounded-lg font-sans text-xs focus:outline-hidden focus:border-gold"
            >
              <option value="">-- Choose Customer --</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.fullName} ({c.mobileNumber})</option>
              ))}
            </select>
          </div>

          {/* Try On Fitting Date */}
          <div className="space-y-1">
            <label className="font-semibold text-navy">Try-On Fitting Date</label>
            <input 
              type="date" 
              value={tryOnDate}
              onChange={(e) => setTryOnDate(e.target.value)}
              className="w-full bg-white px-3 py-2 border border-light rounded-lg font-sans text-xs focus:outline-hidden focus:border-gold"
            />
          </div>

          {/* Target Delivery Date */}
          <div className="space-y-1">
            <label className="font-semibold text-navy">Scheduled Delivery Date</label>
            <input 
              type="date" 
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              className="w-full bg-white px-3 py-2 border border-light rounded-lg font-sans text-xs focus:outline-hidden focus:border-gold"
            />
          </div>
        </div>

        {/* Display Auto Fill Memory Alert if customer has past history */}
        {selectedCustomer && previousMeas && (
          <div className="bg-gold/5 border border-gold/15 rounded-xl p-3 flex justify-between items-center gap-4 text-xs font-sans">
            <p className="text-charcoal flex items-center gap-1.5 leading-relaxed">
              <Sparkles className="w-4 h-4 text-gold flex-shrink-0" />
              <span><b>{selectedCustomer.fullName}</b> has historical sizes in database (Dated: {new Date(previousMeas.versionDate).toLocaleDateString()}). Autocomplete sizes instantly.</span>
            </p>
            <button 
              onClick={handleCopyFromLast}
              className="bg-navy hover:bg-navy-hover text-white px-3.5 py-1.5 rounded-lg text-[10px] font-bold uppercase flex-shrink-0 flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
            >
              <Copy className="w-3 h-3 text-gold" />
              Autocomplete Sizes
            </button>
          </div>
        )}
      </div>

      {/* CORE SIZE TABBED FORM CONTAINER */}
      <div className="bg-white rounded-3xl border border-light shadow-sm p-6 space-y-6 font-sans">
        {/* Tab triggers */}
        <div className="flex border-b border-light overflow-x-auto whitespace-nowrap scrollbar-none text-xs">
          {(["coat", "pent", "vest", "shirt", "remarks"] as const).map((tab) => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-3 px-5 font-bold uppercase border-b-2 transition-all cursor-pointer ${
                activeTab === tab 
                  ? "border-gold text-navy bg-white" 
                  : "border-transparent text-muted-grey hover:text-navy hover:bg-cream/10"
              }`}
            >
              {tab === "coat" ? "Coat / Indo Western" : tab === "remarks" ? "Remarks & Lining" : tab}
            </button>
          ))}
        </div>

        {/* TAB CONTENTS CONTAINER */}
        <div className="text-xs text-charcoal">
          
          {/* COAT / INDO WESTERN */}
          {activeTab === "coat" && (
            <div className="space-y-4 animate-fade-in">
              <h3 className="text-sm font-serif font-bold text-navy uppercase tracking-wider mb-2">Coat / Indo-Western Configurations</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
                {[
                  { label: "Length", state: coatLength, setState: setCoatLength, prev: previousMeas?.coatIndoWestern?.length },
                  { label: "Chest", state: coatChest, setState: setCoatChest, prev: previousMeas?.coatIndoWestern?.chest },
                  { label: "Waist", state: coatWaist, setState: setCoatWaist, prev: previousMeas?.coatIndoWestern?.waist },
                  { label: "Neck", state: coatNeck, setState: setCoatNeck, prev: previousMeas?.coatIndoWestern?.neck },
                  { label: "Tira", state: coatTira, setState: setCoatTira, prev: previousMeas?.coatIndoWestern?.tira },
                  { label: "H.B. (Half Back)", state: coatHb, setState: setCoatHb, prev: previousMeas?.coatIndoWestern?.hb },
                  { label: "C/Back (Center Back)", state: coatCback, setState: setCoatCback, prev: previousMeas?.coatIndoWestern?.cback },
                  { label: "Arms Length", state: coatArms, setState: setCoatArms, prev: previousMeas?.coatIndoWestern?.arms },
                  { label: "Bicep", state: coatBicep, setState: setCoatBicep, prev: previousMeas?.coatIndoWestern?.bicep },
                  { label: "Front", state: coatFront, setState: setCoatFront, prev: previousMeas?.coatIndoWestern?.front },
                  { label: "Moda (Armhole)", state: coatModa, setState: setCoatModa, prev: previousMeas?.coatIndoWestern?.moda }
                ].map((f, idx) => {
                  const differs = f.prev && f.state && f.prev !== f.state;
                  return (
                    <div key={idx} className="space-y-1 relative">
                      <label className="font-semibold text-navy flex items-center justify-between">
                        <span>{f.label}</span>
                        {differs && (
                          <span className="text-[9px] text-gold font-bold bg-gold/5 px-1.5 py-0.2 rounded-full border border-gold/15">
                            Prev: {f.prev}"
                          </span>
                        )}
                      </label>
                      <div className="relative">
                        <input 
                          type="text" 
                          placeholder="e.g. 30"
                          value={f.state}
                          onChange={(e) => f.setState(e.target.value)}
                          className="w-full bg-white pl-3 pr-8 py-2 border border-light rounded-lg focus:outline-hidden focus:border-gold font-mono"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-grey">in</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* PENT */}
          {activeTab === "pent" && (
            <div className="space-y-4 animate-fade-in">
              <h3 className="text-sm font-serif font-bold text-navy uppercase tracking-wider mb-2">Trouser / Pent Configurations</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
                {[
                  { label: "Length", state: pentLength, setState: setPentLength, prev: previousMeas?.pent?.length },
                  { label: "Waist", state: pentWaist, setState: setPentWaist, prev: previousMeas?.pent?.waist },
                  { label: "Hips", state: pentHips, setState: setPentHips, prev: previousMeas?.pent?.hips },
                  { label: "Inlength", state: pentInlength, setState: setPentInlength, prev: previousMeas?.pent?.inlength },
                  { label: "Patt", state: pentPatt, setState: setPentPatt, prev: previousMeas?.pent?.patt },
                  { label: "Knee", state: pentKnee, setState: setPentKnee, prev: previousMeas?.pent?.knee },
                  { label: "Bottom", state: pentBottom, setState: setPentBottom, prev: previousMeas?.pent?.bottom }
                ].map((f, idx) => {
                  const differs = f.prev && f.state && f.prev !== f.state;
                  return (
                    <div key={idx} className="space-y-1 relative">
                      <label className="font-semibold text-navy flex items-center justify-between">
                        <span>{f.label}</span>
                        {differs && (
                          <span className="text-[9px] text-gold font-bold bg-gold/5 px-1.5 py-0.2 rounded-full border border-gold/15">
                            Prev: {f.prev}"
                          </span>
                        )}
                      </label>
                      <div className="relative">
                        <input 
                          type="text" 
                          placeholder="e.g. 34"
                          value={f.state}
                          onChange={(e) => f.setState(e.target.value)}
                          className="w-full bg-white pl-3 pr-8 py-2 border border-light rounded-lg focus:outline-hidden focus:border-gold font-mono"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-grey">in</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* VEST */}
          {activeTab === "vest" && (
            <div className="space-y-4 animate-fade-in">
              <h3 className="text-sm font-serif font-bold text-navy uppercase tracking-wider mb-2">Waistcoat / Vest Configurations</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
                {[
                  { label: "Length", state: vestLength, setState: setVestLength, prev: previousMeas?.vest?.length },
                  { label: "Chest", state: vestChest, setState: setVestChest, prev: previousMeas?.vest?.chest },
                  { label: "Waist", state: vestWaist, setState: setVestWaist, prev: previousMeas?.vest?.waist },
                  { label: "Hip", state: vestHip, setState: setVestHip, prev: previousMeas?.vest?.hip },
                  { label: "Tira", state: vestTira, setState: setVestTira, prev: previousMeas?.vest?.tira },
                  { label: "Neck", state: vestNeck, setState: setVestNeck, prev: previousMeas?.vest?.neck }
                ].map((f, idx) => {
                  const differs = f.prev && f.state && f.prev !== f.state;
                  return (
                    <div key={idx} className="space-y-1 relative">
                      <label className="font-semibold text-navy flex items-center justify-between">
                        <span>{f.label}</span>
                        {differs && (
                          <span className="text-[9px] text-gold font-bold bg-gold/5 px-1.5 py-0.2 rounded-full border border-gold/15">
                            Prev: {f.prev}"
                          </span>
                        )}
                      </label>
                      <div className="relative">
                        <input 
                          type="text" 
                          placeholder="e.g. 26"
                          value={f.state}
                          onChange={(e) => f.setState(e.target.value)}
                          className="w-full bg-white pl-3 pr-8 py-2 border border-light rounded-lg focus:outline-hidden focus:border-gold font-mono"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-grey">in</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* SHIRT / KURTA */}
          {activeTab === "shirt" && (
            <div className="space-y-4 animate-fade-in">
              <h3 className="text-sm font-serif font-bold text-navy uppercase tracking-wider mb-2">Shirt / Kurta Configurations</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
                {[
                  { label: "Length", state: shirtLength, setState: setShirtLength, prev: previousMeas?.shirtKurta?.length },
                  { label: "Chest", state: shirtChest, setState: setShirtChest, prev: previousMeas?.shirtKurta?.chest },
                  { label: "Waist", state: shirtWaist, setState: setShirtWaist, prev: previousMeas?.shirtKurta?.waist },
                  { label: "Hip", state: shirtHip, setState: setShirtHip, prev: previousMeas?.shirtKurta?.hip },
                  { label: "Tira", state: shirtTira, setState: setShirtTira, prev: previousMeas?.shirtKurta?.tira },
                  { label: "Arms Length", state: shirtArms, setState: setShirtArms, prev: previousMeas?.shirtKurta?.arms },
                  { label: "Neck", state: shirtNeck, setState: setShirtNeck, prev: previousMeas?.shirtKurta?.neck },
                  { label: "C/Back", state: shirtCback, setState: setShirtCback, prev: previousMeas?.shirtKurta?.cback },
                  { label: "Front Chest", state: shirtFront, setState: setShirtFront, prev: previousMeas?.shirtKurta?.front },
                  { label: "Moda (Armhole)", state: shirtModa, setState: setShirtModa, prev: previousMeas?.shirtKurta?.moda },
                  { label: "Bicep", state: shirtBicep, setState: setShirtBicep, prev: previousMeas?.shirtKurta?.bicep }
                ].map((f, idx) => {
                  const differs = f.prev && f.state && f.prev !== f.state;
                  return (
                    <div key={idx} className="space-y-1 relative">
                      <label className="font-semibold text-navy flex items-center justify-between">
                        <span>{f.label}</span>
                        {differs && (
                          <span className="text-[9px] text-gold font-bold bg-gold/5 px-1.5 py-0.2 rounded-full border border-gold/15">
                            Prev: {f.prev}"
                          </span>
                        )}
                      </label>
                      <div className="relative">
                        <input 
                          type="text" 
                          placeholder="e.g. 30"
                          value={f.state}
                          onChange={(e) => f.setState(e.target.value)}
                          className="w-full bg-white pl-3 pr-8 py-2 border border-light rounded-lg focus:outline-hidden focus:border-gold font-mono"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-grey">in</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* DESIGN REMARKS */}
          {activeTab === "remarks" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in text-xs">
              <div className="space-y-4">
                <h3 className="text-sm font-serif font-bold text-navy uppercase tracking-wider">Garment Sytle Details</h3>
                
                <div className="space-y-1.5">
                  <label className="font-semibold text-navy">Fabric Selection Description</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Raymond Super 120s Dark Gray Glen Plaid"
                    value={fabricSelected}
                    onChange={(e) => setFabricSelected(e.target.value)}
                    className="w-full bg-white px-3.5 py-2.5 border border-light rounded-xl font-sans focus:outline-hidden focus:border-gold"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold text-navy">Inner Lining & Accent Choice</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Premium Bemberg Crimson Silk"
                    value={liningChoice}
                    onChange={(e) => setLiningChoice(e.target.value)}
                    className="w-full bg-white px-3.5 py-2.5 border border-light rounded-xl font-sans focus:outline-hidden focus:border-gold"
                  />
                </div>
                
                <div className="space-y-1.5">
                  <label className="font-semibold text-navy">Fabric Cut design specifications (vents, pocket slots, lapels)</label>
                  <textarea 
                    rows={4}
                    placeholder="e.g. Double breasted coat. Peak lapel 3.5 inches. Ticket pocket on right. Inside pocket configured to fit premium cigars."
                    value={designNotes}
                    onChange={(e) => setDesignNotes(e.target.value)}
                    className="w-full bg-white p-3 border border-light rounded-xl font-sans focus:outline-hidden focus:border-gold"
                  />
                </div>
              </div>

              <div className="space-y-4 border-l border-light pl-0 md:pl-6">
                <h3 className="text-sm font-serif font-bold text-navy uppercase tracking-wider">Showroom Fitting Reminders</h3>
                <div className="space-y-1.5">
                  <label className="font-semibold text-navy">Internal remarks (visible only to cutting masters and stitching tailors)</label>
                  <textarea 
                    rows={8}
                    placeholder="e.g. Customer has high shoulders. Tailor please keep extra 1.5 inch stitch seam inside trousers belt for waist adjustment during trials."
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    className="w-full bg-white p-3 border border-light rounded-xl font-sans focus:outline-hidden focus:border-gold"
                  />
                </div>
              </div>
            </div>
          )}

        </div>

        {/* PERSISTENT ACTION BAR (Section 5.5) */}
        <div className="border-t border-light pt-5 flex flex-wrap justify-between items-center gap-4 text-xs font-sans">
          <button 
            type="button" 
            onClick={handleCopyFromLast}
            className="bg-cream hover:bg-cream/80 text-navy font-semibold px-4.5 py-2.5 rounded-xl border border-light transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5 text-gold" />
            Copy from Last Order
          </button>

          <div className="flex gap-3">
            <button 
              type="button" 
              onClick={handleSaveAndPrint}
              className="bg-gold/10 hover:bg-gold/25 text-navy border border-gold/15 font-semibold px-5 py-2.5 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-gold" />
              Save & Print Fabrication Slip
            </button>
            
            <button 
              type="button" 
              onClick={() => handleSave()}
              className="bg-navy hover:bg-navy-hover text-white font-semibold px-6 py-2.5 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5 text-gold" />
              Save Measurements Only
            </button>
          </div>
        </div>
      </div>

      {/* =====================================================================
          STITCHING FABRICATION PAPER SLIP PRINT VIEW MODAL (Section 8)
      ===================================================================== */}
      {isPrintPreviewOpen && selectedCustomer && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50 animate-fade-in font-sans">
          <div className="bg-white rounded-3xl border border-light max-w-3xl w-full max-h-[92vh] overflow-y-auto shadow-2xl p-6 space-y-6">
            
            <div className="flex justify-between items-center border-b border-light pb-3 print:hidden">
              <span className="font-serif font-bold text-navy text-sm">stitching Fabrication Paper Slip Print Preview</span>
              <div className="flex gap-2">
                <button 
                  onClick={() => window.print()}
                  className="bg-navy hover:bg-navy-hover text-white px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-gold" />
                  Trigger System Print
                </button>
                <button 
                  onClick={() => setIsPrintPreviewOpen(false)}
                  className="bg-cream hover:bg-cream/80 text-navy px-4 py-2 rounded-xl text-xs font-semibold border border-light cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>

            {/* Print Area - Replicating traditional paper slip layout */}
            <div id="print-paper-slip" className="bg-white border-2 border-charcoal/85 p-6 text-charcoal space-y-6 print:p-0 print:border-0 font-sans max-w-[210mm] mx-auto">
              
              {/* Header Letterhead (Section 1.1 Registered Specs) */}
              <div className="text-center space-y-1.5 border-b-2 border-charcoal pb-4">
                {/* Intertwined crest monogram */}
                <div className="w-11 h-11 rounded-full border-2 border-charcoal flex items-center justify-center text-charcoal font-serif font-bold text-base mx-auto bg-white">
                  SS
                </div>
                <h2 className="text-2xl font-serif font-extrabold tracking-wide uppercase">SIGNATURE SUITINGS</h2>
                <p className="text-[10px] font-sans font-bold tracking-widest uppercase text-charcoal/80">NEEL KANTH INDUSTRIES &bull; "THE SIGN OF COMFORT"</p>
                <p className="text-[9px] text-charcoal/70">
                  2, Tara Singh Avenue, Peer Dad Road, Jalandhar, Punjab, India &bull; Phones: 93572 51900, 95696 81900
                </p>
              </div>

              {/* Patient details block equivalent for tailor */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-[10px] border-b border-charcoal/65 pb-3 font-sans">
                <div><b>Slip No:</b> {slipNumber}</div>
                <div><b>Serial No:</b> {serialNumber || "-"}</div>
                <div><b>Date Logged:</b> {new Date().toLocaleDateString("en-IN")}</div>
                <div><b>Try-On Date:</b> {new Date(tryOnDate).toLocaleDateString("en-IN")}</div>
                <div><b>Delivery Target:</b> {new Date(deliveryDate).toLocaleDateString("en-IN")}</div>
                <div className="col-span-2"><b>Customer:</b> <span className="font-bold text-xs">{selectedCustomer.fullName}</span></div>
                <div className="col-span-2"><b>Mobile No:</b> <span className="font-bold font-mono">{selectedCustomer.mobileNumber}</span></div>
                <div className="col-span-4"><b>Delivery Location Address:</b> {selectedCustomer.address || "Showroom Collection Only"}</div>
              </div>

              {/* Sizes Fields columns formatted for print */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-[11px]">
                
                {/* Left col garments: Coat & Pent */}
                <div className="space-y-4">
                  <div className="border border-charcoal/75 rounded-lg overflow-hidden">
                    <div className="bg-charcoal/10 p-1.5 text-center font-bold uppercase tracking-wider font-serif text-[10px] border-b border-charcoal">Coat / Indo-Western</div>
                    <div className="grid grid-cols-4 gap-1 p-2 font-mono">
                      <div>Len: <b>{coatLength || "-"}</b></div>
                      <div>Chest: <b>{coatChest || "-"}</b></div>
                      <div>Waist: <b>{coatWaist || "-"}</b></div>
                      <div>Neck: <b>{coatNeck || "-"}</b></div>
                      <div>Tira: <b>{coatTira || "-"}</b></div>
                      <div>HB: <b>{coatHb || "-"}</b></div>
                      <div>Cback: <b>{coatCback || "-"}</b></div>
                      <div>Arms: <b>{coatArms || "-"}</b></div>
                      <div>Bicep: <b>{coatBicep || "-"}</b></div>
                      <div>Front: <b>{coatFront || "-"}</b></div>
                      <div>Moda: <b>{coatModa || "-"}</b></div>
                    </div>
                  </div>

                  <div className="border border-charcoal/75 rounded-lg overflow-hidden">
                    <div className="bg-charcoal/10 p-1.5 text-center font-bold uppercase tracking-wider font-serif text-[10px] border-b border-charcoal">Trouser / Pent Sizes</div>
                    <div className="grid grid-cols-5 gap-1 p-2 font-mono text-[10px]">
                      <div>Length: <b>{pentLength || "-"}</b></div>
                      <div>Waist: <b>{pentWaist || "-"}</b></div>
                      <div>Hips: <b>{pentHips || "-"}</b></div>
                      <div>Inlength: <b>{pentInlength || "-"}</b></div>
                      <div>Patt: <b>{pentPatt || "-"}</b></div>
                      <div>Knee: <b>{pentKnee || "-"}</b></div>
                      <div>Bottom: <b>{pentBottom || "-"}</b></div>
                    </div>
                  </div>
                </div>

                {/* Right col garments: Vest & Shirt */}
                <div className="space-y-4">
                  <div className="border border-charcoal/75 rounded-lg overflow-hidden">
                    <div className="bg-charcoal/10 p-1.5 text-center font-bold uppercase tracking-wider font-serif text-[10px] border-b border-charcoal">Waistcoat / Vest Sizes</div>
                    <div className="grid grid-cols-3 gap-1 p-2 font-mono">
                      <div>Len: <b>{vestLength || "-"}</b></div>
                      <div>Chest: <b>{vestChest || "-"}</b></div>
                      <div>Waist: <b>{vestWaist || "-"}</b></div>
                      <div>Hip: <b>{vestHip || "-"}</b></div>
                      <div>Tira: <b>{vestTira || "-"}</b></div>
                      <div>Neck: <b>{vestNeck || "-"}</b></div>
                    </div>
                  </div>

                  <div className="border border-charcoal/75 rounded-lg overflow-hidden">
                    <div className="bg-charcoal/10 p-1.5 text-center font-bold uppercase tracking-wider font-serif text-[10px] border-b border-charcoal">Shirt / Kurta Sizes</div>
                    <div className="grid grid-cols-4 gap-1 p-2 font-mono">
                      <div>Len: <b>{shirtLength || "-"}</b></div>
                      <div>Chest: <b>{shirtChest || "-"}</b></div>
                      <div>Waist: <b>{shirtWaist || "-"}</b></div>
                      <div>Hip: <b>{shirtHip || "-"}</b></div>
                      <div>Tira: <b>{shirtTira || "-"}</b></div>
                      <div>Arms: <b>{shirtArms || "-"}</b></div>
                      <div>Neck: <b>{shirtNeck || "-"}</b></div>
                      <div>Cback: <b>{shirtCback || "-"}</b></div>
                    </div>
                  </div>
                </div>

              </div>

              {/* Fabrics & Styling Remarks print box */}
              <div className="border border-charcoal/75 rounded-lg p-3 text-[10px] space-y-1.5 bg-cream/5 font-sans">
                <div><b>Selected Fabric Brand/Drape:</b> {stripEmbeddedTags(fabricSelected) || "Not specified"}</div>
                <div><b>Accent Lining Choice:</b> {stripEmbeddedTags(liningChoice) || "Not specified"}</div>
                <div><b>Detailed Cutting styling notes:</b> {stripEmbeddedTags(designNotes) || "Classic bespoke design"}</div>
                <div><b>Tailor Master stitch remarks:</b> {stripEmbeddedTags(remarks) || "Classic drape configurations. Perfect finish."}</div>
              </div>

              {/* Paper Slip print disclaimer & signature block (Section 8) */}
              <div className="border-t-2 border-charcoal pt-6 mt-4 grid grid-cols-2 gap-4 text-[9px] font-sans font-semibold text-charcoal/90">
                <div className="space-y-1.5">
                  <p className="leading-relaxed">No responsibility of clothes after one month from the date of delivery. E. & O.E.</p>
                  <p className="text-[7px] text-charcoal/60">Signature Suitings &bull; Jalandhar City Showroom</p>
                </div>
                <div className="flex flex-col justify-end items-end h-16 pt-4">
                  <span className="border-t border-charcoal/60 w-36 text-center text-[9px] uppercase tracking-wider text-charcoal/80 pt-1">
                    Master Cutter Signature
                  </span>
                </div>
              </div>

            </div>

            <div className="flex justify-end gap-3 print:hidden">
              <button 
                onClick={() => setIsPrintPreviewOpen(false)}
                className="bg-navy hover:bg-navy-hover text-white font-semibold font-sans px-5 py-2.5 rounded-xl text-xs transition-colors cursor-pointer"
              >
                Close Preview
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
        cancelLabel={confirmModal.cancelLabel}
        variant={confirmModal.variant}
        onConfirm={confirmModal.onConfirm}
        onCancel={confirmModal.onCancel}
      />

    </div>
  );
}
