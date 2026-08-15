/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  X, 
  User, 
  Phone, 
  MapPin, 
  Briefcase, 
  DollarSign, 
  Calendar, 
  Camera, 
  CheckCircle2, 
  AlertCircle,
  FileText
} from "lucide-react";
import { Worker } from "../../types";

interface WorkerModalProps {
  isOpen: boolean;
  editingWorker: Worker | null;
  onSave: (workerData: {
    name: string;
    mobileNumber: string;
    address: string;
    role: string;
    monthlySalary: number;
    dailyWages?: number;
    active: boolean;
    joiningDate: string;
    photoUrl?: string;
  }) => Promise<void>;
  onClose: () => void;
  isProcessing?: boolean;
}

const COMMON_ROLES = [
  "Senior Stitching Tailor",
  "Master Cutter & Designer",
  "Coat & Blazer Specialist",
  "Trouser / Pent Master",
  "Finishing & Press Master",
  "Helper & Hand Stitcher",
  "Apprentice Tailor"
];

export default function WorkerModal({
  isOpen,
  editingWorker,
  onSave,
  onClose,
  isProcessing = false
}: WorkerModalProps) {
  const [formData, setFormData] = useState({
    name: "",
    mobileNumber: "",
    address: "",
    role: COMMON_ROLES[0],
    customRole: "",
    monthlySalary: 18000,
    active: true,
    joiningDate: new Date().toISOString().split("T")[0],
    photoUrl: ""
  });

  const [validationError, setValidationError] = useState<string | null>(null);

  // Initialize or populate form on open
  useEffect(() => {
    if (editingWorker) {
      const isPredefinedRole = COMMON_ROLES.includes(editingWorker.role);
      const monthly = editingWorker.monthlySalary || (editingWorker.dailyWages ? editingWorker.dailyWages * 30 : 18000);

      setFormData({
        name: editingWorker.name || "",
        mobileNumber: editingWorker.mobileNumber || "",
        address: editingWorker.address || "",
        role: isPredefinedRole ? editingWorker.role : "Custom",
        customRole: isPredefinedRole ? "" : editingWorker.role,
        monthlySalary: monthly,
        active: editingWorker.active !== undefined ? editingWorker.active : true,
        joiningDate: editingWorker.joiningDate || new Date().toISOString().split("T")[0],
        photoUrl: editingWorker.photoUrl || ""
      });
    } else {
      setFormData({
        name: "",
        mobileNumber: "",
        address: "",
        role: COMMON_ROLES[0],
        customRole: "",
        monthlySalary: 18000,
        active: true,
        joiningDate: new Date().toISOString().split("T")[0],
        photoUrl: ""
      });
    }
    setValidationError(null);
  }, [editingWorker, isOpen]);

  if (!isOpen) return null;

  // Handle Photo upload
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        setValidationError("Image file size exceeds 2MB limit. Please upload a smaller image.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({
          ...prev,
          photoUrl: reader.result as string
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  // Form Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const trimmedName = formData.name.trim();
    if (!trimmedName) {
      setValidationError("Please enter the worker's full name.");
      return;
    }

    const effectiveRole = formData.role === "Custom" 
      ? (formData.customRole.trim() || "Tailor") 
      : formData.role;

    const monthlySalary = Number(formData.monthlySalary) || 18000;

    try {
      await onSave({
        name: trimmedName,
        mobileNumber: formData.mobileNumber.trim(),
        address: formData.address.trim(),
        role: effectiveRole,
        monthlySalary,
        dailyWages: Math.round(monthlySalary / 30),
        active: formData.active,
        joiningDate: formData.joiningDate || new Date().toISOString().split("T")[0],
        photoUrl: formData.photoUrl || undefined
      });
    } catch (err: any) {
      setValidationError(err.message || "Failed to save worker record. Please check details and try again.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/60 backdrop-blur-xs font-sans animate-fade-in">
      <div className="fixed inset-0" onClick={onClose} />

      <div className="relative bg-white w-full max-w-xl rounded-3xl border border-light shadow-2xl overflow-hidden z-10 animate-scale-up max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-navy text-white px-6 py-4 border-b border-gold/20 flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gold/15 text-gold flex items-center justify-center border border-gold/30">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-serif font-black text-gold text-base tracking-tight">
                {editingWorker ? "Edit Staff Member Profile" : "Hire New Staff Member"}
              </h3>
              <p className="text-[10px] text-gray-300 font-sans">
                {editingWorker ? "Update employee details, designation, or salary rate" : "Add tailor, helper, or master cutter to showroom roster"}
              </p>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 text-xs font-sans">
          {validationError && (
            <div className="bg-rose-50 border border-rose-100 text-rose-900 p-3 rounded-2xl flex items-center gap-2.5 text-xs">
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
              <span>{validationError}</span>
            </div>
          )}

          {/* Photo & Basic Info Row */}
          <div className="flex flex-col sm:flex-row items-center gap-5 p-4 bg-cream/15 rounded-2xl border border-light">
            {/* Photo Avatar with upload trigger */}
            <div className="relative flex-shrink-0">
              <div className="w-20 h-20 rounded-2xl overflow-hidden border-2 border-gold/40 shadow-xs bg-white flex items-center justify-center group relative">
                {formData.photoUrl ? (
                  <img 
                    src={formData.photoUrl} 
                    alt="Staff preview" 
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-navy/5 text-navy flex flex-col items-center justify-center">
                    <User className="w-8 h-8 text-gold opacity-80" />
                    <span className="text-[9px] font-bold text-muted-grey uppercase mt-0.5">Photo</span>
                  </div>
                )}

                <label className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white cursor-pointer transition-opacity">
                  <Camera className="w-5 h-5 text-gold mb-0.5" />
                  <span className="text-[9px] font-bold uppercase">Change</span>
                  <input 
                    type="file" 
                    accept="image/*" 
                    onChange={handlePhotoUpload} 
                    className="hidden" 
                  />
                </label>
              </div>

              {formData.photoUrl && (
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, photoUrl: "" }))}
                  className="absolute -top-1.5 -right-1.5 bg-rose-600 text-white rounded-full p-1 hover:bg-rose-700 shadow-xs cursor-pointer"
                  title="Remove photo"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Quick Helper Text */}
            <div className="flex-1 text-center sm:text-left space-y-1">
              <label className="text-xs font-bold text-navy block">
                Profile Photo (Optional)
              </label>
              <p className="text-[11px] text-muted-grey">
                Upload a portrait for instant facial recognition during daily attendance punch-in.
              </p>
              <label className="inline-flex items-center gap-1.5 text-[11px] font-bold text-navy hover:text-gold cursor-pointer underline underline-offset-2">
                <Camera className="w-3 h-3 text-gold" />
                Select Photo from Device
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={handlePhotoUpload} 
                  className="hidden" 
                />
              </label>
            </div>
          </div>

          {/* Full Name & Mobile Number */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-navy flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-gold" />
                Full Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Gurpreet Singh"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full border border-light rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-gold bg-cream/5"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-navy flex items-center gap-1">
                <Phone className="w-3.5 h-3.5 text-gold" />
                Mobile Number
              </label>
              <input
                type="tel"
                placeholder="e.g. 9876543210"
                value={formData.mobileNumber}
                onChange={(e) => setFormData({ ...formData, mobileNumber: e.target.value })}
                className="w-full border border-light rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-gold bg-cream/5 font-mono"
              />
            </div>
          </div>

          {/* Role & Designation */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-navy flex items-center gap-1">
                <Briefcase className="w-3.5 h-3.5 text-gold" />
                Designation / Role
              </label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                className="w-full border border-light rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-gold bg-cream/5 font-medium"
              >
                {COMMON_ROLES.map(role => (
                  <option key={role} value={role}>{role}</option>
                ))}
                <option value="Custom">Custom Role...</option>
              </select>
            </div>

            {formData.role === "Custom" ? (
              <div className="space-y-1">
                <label className="text-xs font-bold text-navy">
                  Specify Custom Role Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Hand Embroidery Artist"
                  value={formData.customRole}
                  onChange={(e) => setFormData({ ...formData, customRole: e.target.value })}
                  className="w-full border border-light rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-gold bg-cream/5"
                />
              </div>
            ) : (
              <div className="space-y-1">
                <label className="text-xs font-bold text-navy flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-gold" />
                  Date of Joining
                </label>
                <input
                  type="date"
                  value={formData.joiningDate}
                  onChange={(e) => setFormData({ ...formData, joiningDate: e.target.value })}
                  className="w-full border border-light rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-gold bg-cream/5 font-mono"
                />
              </div>
            )}
          </div>

          {formData.role === "Custom" && (
            <div className="space-y-1">
              <label className="text-xs font-bold text-navy flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-gold" />
                Date of Joining
              </label>
              <input
                type="date"
                value={formData.joiningDate}
                onChange={(e) => setFormData({ ...formData, joiningDate: e.target.value })}
                className="w-full border border-light rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-gold bg-cream/5 font-mono"
              />
            </div>
          )}

          {/* Monthly Salary */}
          <div className="bg-cream/20 p-4 rounded-2xl border border-light space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-serif font-bold text-navy flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-gold" />
                Monthly Compensation & Salary
              </span>
              <span className="text-[10px] text-muted-grey uppercase font-bold">
                Fixed Salary
              </span>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-navy block">
                Monthly Salary (₹) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-grey font-mono font-bold">₹</span>
                <input
                  type="number"
                  required
                  min={100}
                  step={100}
                  placeholder="e.g. 18000"
                  value={formData.monthlySalary}
                  onChange={(e) => setFormData(prev => ({ ...prev, monthlySalary: Number(e.target.value) }))}
                  className="w-full pl-7 pr-3 py-2.5 border border-light rounded-xl text-xs font-bold font-mono text-navy focus:outline-none focus:border-gold bg-white"
                />
              </div>
            </div>
            <p className="text-[10px] text-muted-grey italic">
              *Fixed monthly salary for tailoring staff, automatically calculated based on attendance days during monthly payroll.
            </p>
          </div>

          {/* Home Address */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-navy flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-gold" />
              Residential Address
            </label>
            <textarea
              placeholder="e.g. House No. 42, Model Town, Jalandhar, Punjab"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              rows={2}
              className="w-full border border-light rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:border-gold bg-cream/5 resize-none"
            />
          </div>

          {/* Active Status Toggle */}
          <div className="flex items-center justify-between p-3.5 bg-white border border-light rounded-2xl">
            <div>
              <span className="text-xs font-bold text-navy block">Employment Status</span>
              <span className="text-[10px] text-muted-grey">
                {formData.active 
                  ? "Active employee — appears in daily attendance register and live punch-in terminal" 
                  : "Inactive / On leave — hidden from daily register while preserving past ledgers"}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, active: !prev.active }))}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer border ${
                formData.active
                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                  : "bg-rose-50 text-rose-800 border-rose-200"
              }`}
            >
              {formData.active ? "Active" : "Inactive"}
            </button>
          </div>

          {/* Form Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-light">
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="px-4 py-2.5 text-xs font-bold text-charcoal hover:bg-cream border border-light rounded-xl transition-all cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isProcessing}
              className="bg-navy hover:bg-navy-hover text-white text-xs font-bold px-6 py-2.5 rounded-xl border border-navy shadow-sm transition-all flex items-center gap-2 cursor-pointer active:scale-95 disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4 text-gold" />
              {isProcessing ? "Saving..." : editingWorker ? "Save Changes" : "Confirm Hiring"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
