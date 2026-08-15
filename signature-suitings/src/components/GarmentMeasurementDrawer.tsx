/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { db } from "../db";
import { GarmentLineItem, Measurement, Customer } from "../types";
import { Ruler, CheckCircle, Copy, Save, X, Sparkles, Check, ChevronRight, AlertCircle } from "lucide-react";

interface Props {
  isOpen: boolean;
  lineItem: GarmentLineItem;
  customerId?: string;
  onClose: () => void;
  onSave: (updatedLineItem: GarmentLineItem) => void;
}

export const GarmentMeasurementDrawer: React.FC<Props> = ({
  isOpen,
  lineItem,
  customerId,
  onClose,
  onSave
}) => {
  // Active Tab state (Matches Measurements Entry section)
  const [activeTab, setActiveTab] = useState<"coat" | "pent" | "vest" | "shirt" | "remarks">("coat");
  const [copyMenuOpen, setCopyMenuOpen] = useState(false);

  // Customer historical measurements
  const customerMeasurements = customerId ? db.getMeasurements(customerId) : [];
  const previousMeas: Measurement | null = customerMeasurements.length > 0 ? customerMeasurements[0] : null;

  // Form Field States (Identical to Measurements Entry section)
  // Coat / Indo-Western
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
  const [pentWaist, setPentWaist] = useState("");
  const [pentHips, setPentHips] = useState("");
  const [pentPatt, setPentPatt] = useState("");
  const [pentKnee, setPentKnee] = useState("");
  const [pentBottom, setPentBottom] = useState("");

  // Vest
  const [vestLength, setVestLength] = useState("");
  const [vestChest, setVestChest] = useState("");
  const [vestWaist, setVestWaist] = useState("");
  const [vestHip, setVestHip] = useState("");
  const [vestTira, setVestTira] = useState("");
  const [vestNeck, setVestNeck] = useState("");

  // Shirt / Kurta
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

  // Remarks & Lining
  const [designNotes, setDesignNotes] = useState("");
  const [fabricSelected, setFabricSelected] = useState("");
  const [liningChoice, setLiningChoice] = useState("");
  const [remarks, setRemarks] = useState("");

  // Populate state from lineItem measurementValues on open
  useEffect(() => {
    if (!isOpen) return;

    // Detect initial tab according to garment name
    const nameLower = (lineItem.garmentName || "").toLowerCase();
    if (nameLower.includes("pent") || nameLower.includes("pant") || nameLower.includes("trouser") || nameLower.includes("chinos")) {
      setActiveTab("pent");
    } else if (nameLower.includes("vest") || nameLower.includes("waistcoat") || nameLower.includes("nehru")) {
      setActiveTab("vest");
    } else if (nameLower.includes("shirt") || nameLower.includes("kurta") || nameLower.includes("sherwani")) {
      setActiveTab("shirt");
    } else {
      setActiveTab("coat");
    }

    const mv = lineItem.measurementValues || {};

    // Coat / Indo Western
    const c = mv.coatIndoWestern || {};
    setCoatLength(c.length || mv.coatLength || mv.length || "");
    setCoatChest(c.chest || mv.coatChest || mv.chest || "");
    setCoatWaist(c.waist || mv.coatWaist || mv.waist || "");
    setCoatNeck(c.neck || mv.coatNeck || mv.neck || "");
    setCoatTira(c.tira || mv.coatTira || mv.tira || "");
    setCoatHb(c.hb || mv.coatHb || mv.hb || "");
    setCoatCback(c.cback || mv.coatCback || mv.cback || "");
    setCoatArms(c.arms || mv.coatArms || mv.arms || "");
    setCoatBicep(c.bicep || mv.coatBicep || mv.bicep || "");
    setCoatFront(c.front || mv.coatFront || mv.front || "");
    setCoatModa(c.moda || mv.coatModa || mv.moda || "");

    // Pent
    const p = mv.pent || {};
    setPentWaist(p.waist || mv.pentWaist || "");
    setPentHips(p.hips || mv.pentHips || mv.hips || "");
    setPentPatt(p.patt || mv.pentPatt || mv.patt || "");
    setPentKnee(p.knee || mv.pentKnee || mv.knee || "");
    setPentBottom(p.bottom || mv.pentBottom || mv.bottom || "");

    // Vest
    const v = mv.vest || {};
    setVestLength(v.length || mv.vestLength || "");
    setVestChest(v.chest || mv.vestChest || "");
    setVestWaist(v.waist || mv.vestWaist || "");
    setVestHip(v.hip || mv.vestHip || "");
    setVestTira(v.tira || mv.vestTira || "");
    setVestNeck(v.neck || mv.vestNeck || "");

    // Shirt / Kurta
    const s = mv.shirtKurta || {};
    setShirtLength(s.length || mv.shirtLength || "");
    setShirtChest(s.chest || mv.shirtChest || "");
    setShirtWaist(s.waist || mv.shirtWaist || "");
    setShirtHip(s.hip || mv.shirtHip || "");
    setShirtTira(s.tira || mv.shirtTira || "");
    setShirtArms(s.arms || mv.shirtArms || "");
    setShirtNeck(s.neck || mv.shirtNeck || "");
    setShirtCback(s.cback || mv.shirtCback || "");
    setShirtFront(s.front || mv.shirtFront || "");
    setShirtModa(s.moda || mv.shirtModa || "");
    setShirtBicep(s.bicep || mv.shirtBicep || "");

    // Remarks
    setDesignNotes(mv.designNotes || lineItem.notes || "");
    setFabricSelected(mv.fabricSelected || lineItem.fabric || "");
    setLiningChoice(mv.liningChoice || "");
    setRemarks(mv.remarks || "");
  }, [isOpen, lineItem]);

  // Copy measurements from historical Measurement record
  const applyMeasurementCopy = (source: Measurement) => {
    if (!source) return;

    setCoatLength(source.coatIndoWestern?.length || "");
    setCoatChest(source.coatIndoWestern?.chest || "");
    setCoatWaist(source.coatIndoWestern?.waist || "");
    setCoatNeck(source.coatIndoWestern?.neck || "");
    setCoatTira(source.coatIndoWestern?.tira || "");
    setCoatHb(source.coatIndoWestern?.hb || "");
    setCoatCback(source.coatIndoWestern?.cback || "");
    setCoatArms(source.coatIndoWestern?.arms || "");
    setCoatBicep(source.coatIndoWestern?.bicep || "");
    setCoatFront(source.coatIndoWestern?.front || "");
    setCoatModa(source.coatIndoWestern?.moda || "");

    setPentWaist(source.pent?.waist || "");
    setPentHips(source.pent?.hips || "");
    setPentPatt(source.pent?.patt || "");
    setPentBottom(source.pent?.bottom || "");
    setPentKnee(source.pent?.knee || "");

    setVestLength(source.vest?.length || "");
    setVestChest(source.vest?.chest || "");
    setVestWaist(source.vest?.waist || "");
    setVestHip(source.vest?.hip || "");
    setVestTira(source.vest?.tira || "");
    setVestNeck(source.vest?.neck || "");

    setShirtLength(source.shirtKurta?.length || "");
    setShirtChest(source.shirtKurta?.chest || "");
    setShirtWaist(source.shirtKurta?.waist || "");
    setShirtHip(source.shirtKurta?.hip || "");
    setShirtTira(source.shirtKurta?.tira || "");
    setShirtArms(source.shirtKurta?.arms || "");
    setShirtNeck(source.shirtKurta?.neck || "");
    setShirtCback(source.shirtKurta?.cback || "");
    setShirtFront(source.shirtKurta?.front || "");
    setShirtModa(source.shirtKurta?.moda || "");
    setShirtBicep(source.shirtKurta?.bicep || "");

    setDesignNotes(source.designNotes || "");
    setFabricSelected(source.fabricSelected || "");
    setLiningChoice(source.liningChoice || "");
    setRemarks(source.remarks || "");

    setCopyMenuOpen(false);
  };

  // Check if any measurements are entered
  const isAnyValueFilled = () => {
    return [
      coatLength, coatChest, coatWaist, coatNeck, coatTira, coatHb, coatCback, coatArms, coatBicep, coatFront, coatModa,
      pentWaist, pentHips, pentPatt, pentKnee, pentBottom,
      vestLength, vestChest, vestWaist, vestHip, vestTira, vestNeck,
      shirtLength, shirtChest, shirtWaist, shirtHip, shirtTira, shirtArms, shirtNeck, shirtCback, shirtFront, shirtModa, shirtBicep,
      designNotes, fabricSelected, liningChoice, remarks
    ].some(val => val && val.trim() !== "");
  };

  // Save Measurements back to line item
  const handleSave = () => {
    const measurementValues: Record<string, any> = {
      coatIndoWestern: {
        length: coatLength, chest: coatChest, waist: coatWaist, neck: coatNeck, tira: coatTira, hb: coatHb, cback: coatCback, arms: coatArms, bicep: coatBicep, front: coatFront, moda: coatModa
      },
      pent: {
        waist: pentWaist, hips: pentHips, patt: pentPatt, bottom: pentBottom, knee: pentKnee
      },
      vest: {
        length: vestLength, chest: vestChest, waist: vestWaist, hip: vestHip, tira: vestTira, neck: vestNeck
      },
      shirtKurta: {
        length: shirtLength, chest: shirtChest, waist: shirtWaist, hip: shirtHip, tira: shirtTira, arms: shirtArms, neck: shirtNeck, cback: shirtCback, front: shirtFront, moda: shirtModa, bicep: shirtBicep
      },
      designNotes,
      fabricSelected,
      liningChoice,
      remarks,

      // Flat aliases for quick access
      coatLength, coatChest, coatWaist, coatNeck, coatTira, coatHb, coatCback, coatArms, coatBicep, coatFront, coatModa,
      pentWaist, pentHips, pentPatt, pentKnee, pentBottom,
      vestLength, vestChest, vestWaist, vestHip, vestTira, vestNeck,
      shirtLength, shirtChest, shirtWaist, shirtHip, shirtTira, shirtArms, shirtNeck, shirtCback, shirtFront, shirtModa, shirtBicep
    };

    const hasValue = isAnyValueFilled();

    const updatedLineItem: GarmentLineItem = {
      ...lineItem,
      measurementValues,
      measurementStatus: hasValue ? "Complete" : "Pending",
      notes: remarks || designNotes || lineItem.notes || "",
      fabric: fabricSelected || lineItem.fabric || "",
      updatedAt: new Date().toISOString()
    };

    onSave(updatedLineItem);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex justify-end font-sans">
      <div className="bg-white w-full max-w-2xl h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        
        {/* Drawer Header */}
        <div className="bg-navy text-white px-6 py-4 flex items-center justify-between border-b border-gold/20 shrink-0">
          <div>
            <span className="text-[10px] text-gold uppercase tracking-wider font-extrabold flex items-center gap-1">
              <Ruler className="w-3.5 h-3.5" />
              Tailoring Measurements Spec
            </span>
            <h2 className="font-serif font-bold text-lg text-white flex items-center gap-2">
              {lineItem.garmentName}
              {lineItem.category && (
                <span className="text-[10px] bg-gold/20 text-gold border border-gold/30 px-2 py-0.5 rounded-full font-sans">
                  {lineItem.category}
                </span>
              )}
            </h2>
          </div>

          <button
            onClick={onClose}
            className="text-white/60 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Autocomplete / Copy Toolbar */}
        <div className="bg-slate-50 border-b border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div>
            <span className="text-slate-500 font-bold block text-[10px] uppercase">Garment Item:</span>
            <span className="font-bold text-navy text-xs">{lineItem.garmentName} {lineItem.fabric ? `(${lineItem.fabric})` : ""}</span>
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setCopyMenuOpen(!copyMenuOpen)}
              className="bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 border border-amber-300 transition-all cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5 text-amber-700" />
              <span>Copy Previous Measurements</span>
            </button>

            {/* Dropdown Menu for Copying */}
            {copyMenuOpen && (
              <div className="absolute right-0 mt-2 w-72 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 p-2 space-y-1 text-xs">
                <div className="px-3 py-1.5 text-[10px] uppercase font-extrabold text-slate-400 border-b border-slate-100">
                  Customer Master Records
                </div>
                {customerMeasurements.length === 0 ? (
                  <div className="px-3 py-2 text-slate-400 text-center">No master measurement records found.</div>
                ) : (
                  customerMeasurements.map(m => (
                    <button
                      key={m.id}
                      onClick={() => applyMeasurementCopy(m)}
                      className="w-full text-left px-3 py-2 hover:bg-amber-50 text-slate-700 rounded-xl transition-colors font-medium flex items-center justify-between cursor-pointer"
                    >
                      <div>
                        <span className="font-bold text-navy block">Slip #{m.slipNumber}</span>
                        <span className="text-[10px] text-slate-400">{new Date(m.versionDate).toLocaleDateString()}</span>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-amber-600" />
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Historical Auto-Fill Memory Alert Banner */}
        {previousMeas && (
          <div className="bg-amber-50 border-b border-amber-200 px-5 py-2.5 flex items-center justify-between gap-3 text-xs shrink-0">
            <p className="text-amber-900 font-medium flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Historical sizes found (Slip #{previousMeas.slipNumber}, {new Date(previousMeas.versionDate).toLocaleDateString()}).</span>
            </p>
            <button
              type="button"
              onClick={() => applyMeasurementCopy(previousMeas)}
              className="bg-navy hover:bg-navy-light text-gold px-3 py-1 rounded-xl text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer shrink-0"
            >
              <Copy className="w-3 h-3" />
              <span>Autocomplete Sizes</span>
            </button>
          </div>
        )}

        {/* 5 CONFIGURATION TABS (Identical to Measurements Entry section) */}
        <div className="flex border-b border-slate-200 overflow-x-auto whitespace-nowrap scrollbar-none text-xs bg-slate-50/50 px-3 shrink-0">
          {(["coat", "pent", "vest", "shirt", "remarks"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`py-3 px-4 font-bold uppercase border-b-2 transition-all cursor-pointer ${
                activeTab === tab
                  ? "border-gold text-navy bg-white shadow-2xs font-extrabold"
                  : "border-transparent text-slate-500 hover:text-navy hover:bg-slate-100"
              }`}
            >
              {tab === "coat" ? "Coat / Indo Western" : tab === "pent" ? "Pent / Trouser" : tab === "vest" ? "Vest / Waistcoat" : tab === "shirt" ? "Shirt / Kurta" : "Remarks & Lining"}
            </button>
          ))}
        </div>

        {/* TAB CONTENTS (Identical fields as Measurements Entry section) */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* 1. COAT / INDO WESTERN */}
          {activeTab === "coat" && (
            <div className="space-y-4 animate-fade-in">
              <h3 className="text-xs font-bold text-navy uppercase tracking-wider mb-2 border-b border-slate-100 pb-1">
                Coat / Indo-Western Configurations
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
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
                      <label className="font-bold text-navy flex items-center justify-between text-[11px]">
                        <span>{f.label}</span>
                        {differs && (
                          <span className="text-[9px] text-amber-700 font-bold bg-amber-50 px-1 py-0.2 rounded border border-amber-200">
                            Prev: {f.prev}"
                          </span>
                        )}
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="0.0"
                          value={f.state}
                          onChange={(e) => f.setState(e.target.value)}
                          className="w-full bg-slate-50 pl-3 pr-8 py-2 border border-slate-300 rounded-xl focus:outline-none focus:border-navy font-mono text-sm font-bold text-navy"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">in</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 2. PENT / TROUSER */}
          {activeTab === "pent" && (
            <div className="space-y-4 animate-fade-in">
              <h3 className="text-xs font-bold text-navy uppercase tracking-wider mb-2 border-b border-slate-100 pb-1">
                Trouser / Pent Configurations
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
                {[
                  { label: "Waist", state: pentWaist, setState: setPentWaist, prev: previousMeas?.pent?.waist },
                  { label: "Hips", state: pentHips, setState: setPentHips, prev: previousMeas?.pent?.hips },
                  { label: "Patt (Thigh)", state: pentPatt, setState: setPentPatt, prev: previousMeas?.pent?.patt },
                  { label: "Knee", state: pentKnee, setState: setPentKnee, prev: previousMeas?.pent?.knee },
                  { label: "Bottom Width", state: pentBottom, setState: setPentBottom, prev: previousMeas?.pent?.bottom }
                ].map((f, idx) => {
                  const differs = f.prev && f.state && f.prev !== f.state;
                  return (
                    <div key={idx} className="space-y-1 relative">
                      <label className="font-bold text-navy flex items-center justify-between text-[11px]">
                        <span>{f.label}</span>
                        {differs && (
                          <span className="text-[9px] text-amber-700 font-bold bg-amber-50 px-1 py-0.2 rounded border border-amber-200">
                            Prev: {f.prev}"
                          </span>
                        )}
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="0.0"
                          value={f.state}
                          onChange={(e) => f.setState(e.target.value)}
                          className="w-full bg-slate-50 pl-3 pr-8 py-2 border border-slate-300 rounded-xl focus:outline-none focus:border-navy font-mono text-sm font-bold text-navy"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">in</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 3. VEST / WAISTCOAT */}
          {activeTab === "vest" && (
            <div className="space-y-4 animate-fade-in">
              <h3 className="text-xs font-bold text-navy uppercase tracking-wider mb-2 border-b border-slate-100 pb-1">
                Waistcoat / Vest Configurations
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
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
                      <label className="font-bold text-navy flex items-center justify-between text-[11px]">
                        <span>{f.label}</span>
                        {differs && (
                          <span className="text-[9px] text-amber-700 font-bold bg-amber-50 px-1 py-0.2 rounded border border-amber-200">
                            Prev: {f.prev}"
                          </span>
                        )}
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="0.0"
                          value={f.state}
                          onChange={(e) => f.setState(e.target.value)}
                          className="w-full bg-slate-50 pl-3 pr-8 py-2 border border-slate-300 rounded-xl focus:outline-none focus:border-navy font-mono text-sm font-bold text-navy"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">in</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 4. SHIRT / KURTA */}
          {activeTab === "shirt" && (
            <div className="space-y-4 animate-fade-in">
              <h3 className="text-xs font-bold text-navy uppercase tracking-wider mb-2 border-b border-slate-100 pb-1">
                Shirt / Kurta Configurations
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
                {[
                  { label: "Length", state: shirtLength, setState: setShirtLength, prev: previousMeas?.shirtKurta?.length },
                  { label: "Chest", state: shirtChest, setState: setShirtChest, prev: previousMeas?.shirtKurta?.chest },
                  { label: "Waist", state: shirtWaist, setState: setShirtWaist, prev: previousMeas?.shirtKurta?.waist },
                  { label: "Hip", state: shirtHip, setState: setShirtHip, prev: previousMeas?.shirtKurta?.hip },
                  { label: "Tira", state: shirtTira, setState: setShirtTira, prev: previousMeas?.shirtKurta?.tira },
                  { label: "Arms Length", state: shirtArms, setState: setShirtArms, prev: previousMeas?.shirtKurta?.arms },
                  { label: "Neck", state: shirtNeck, setState: setShirtNeck, prev: previousMeas?.shirtKurta?.neck },
                  { label: "C/Back", state: shirtCback, setState: setShirtCback, prev: previousMeas?.shirtKurta?.cback },
                  { label: "Front", state: shirtFront, setState: setShirtFront, prev: previousMeas?.shirtKurta?.front },
                  { label: "Moda (Armhole)", state: shirtModa, setState: setShirtModa, prev: previousMeas?.shirtKurta?.moda },
                  { label: "Bicep", state: shirtBicep, setState: setShirtBicep, prev: previousMeas?.shirtKurta?.bicep }
                ].map((f, idx) => {
                  const differs = f.prev && f.state && f.prev !== f.state;
                  return (
                    <div key={idx} className="space-y-1 relative">
                      <label className="font-bold text-navy flex items-center justify-between text-[11px]">
                        <span>{f.label}</span>
                        {differs && (
                          <span className="text-[9px] text-amber-700 font-bold bg-amber-50 px-1 py-0.2 rounded border border-amber-200">
                            Prev: {f.prev}"
                          </span>
                        )}
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="0.0"
                          value={f.state}
                          onChange={(e) => f.setState(e.target.value)}
                          className="w-full bg-slate-50 pl-3 pr-8 py-2 border border-slate-300 rounded-xl focus:outline-none focus:border-navy font-mono text-sm font-bold text-navy"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">in</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 5. REMARKS & LINING */}
          {activeTab === "remarks" && (
            <div className="space-y-4 animate-fade-in text-xs">
              <h3 className="text-xs font-bold text-navy uppercase tracking-wider mb-2 border-b border-slate-100 pb-1">
                Design Notes & Lining Choices
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="font-bold text-navy block">Design Notes</label>
                  <input
                    type="text"
                    placeholder="e.g. Double vent, ban collar, slim fit..."
                    value={designNotes}
                    onChange={(e) => setDesignNotes(e.target.value)}
                    className="w-full bg-slate-50 px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:border-navy text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-navy block">Selected Fabric</label>
                  <input
                    type="text"
                    placeholder="e.g. Raymond Italian Wool Code 902"
                    value={fabricSelected}
                    onChange={(e) => setFabricSelected(e.target.value)}
                    className="w-full bg-slate-50 px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:border-navy text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-navy block">Lining Choice</label>
                  <input
                    type="text"
                    placeholder="e.g. Satin Silk Paisley"
                    value={liningChoice}
                    onChange={(e) => setLiningChoice(e.target.value)}
                    className="w-full bg-slate-50 px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:border-navy text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-navy block">Tailoring Remarks</label>
                  <input
                    type="text"
                    placeholder="Special stitching instructions"
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    className="w-full bg-slate-50 px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:border-navy text-xs"
                  />
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Drawer Footer */}
        <div className="bg-slate-50 border-t border-slate-200 p-4 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500">Status:</span>
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${
              isAnyValueFilled() ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
            }`}>
              {isAnyValueFilled() ? "Complete" : "Pending Measurements"}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="bg-navy hover:bg-navy-light text-gold font-bold px-6 py-2 rounded-xl text-xs flex items-center gap-2 shadow-md transition-all cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Save Measurements</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
