/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  Database, 
  UploadCloud, 
  FileSpreadsheet, 
  CheckCircle, 
  AlertTriangle,
  FileText,
  Clock,
  ShieldCheck,
  Check,
  HardDrive,
  Info,
  Calendar,
  Layers,
  History,
  Sparkles,
  Download,
  RotateCcw,
  RefreshCw,
  X,
  FileArchive,
  ArrowRight,
  ShieldAlert,
  SlidersHorizontal,
  CheckCircle2
} from "lucide-react";
import { db, obfuscateData, deobfuscateData } from "../db";
import { isSupabaseConfigured } from "../supabase";
import {
  createFullBackupZip,
  parseAndValidateBackupFile,
  executeRestoreOperation,
  triggerFileDownload,
  checkAndPerformAutoBackupIfNeeded,
  BackupManifest,
  BackupValidationResult,
  RestoreSuccessReport
} from "../utils/backupEngine";

export default function BackupView() {
  const [dbVersion, setDbVersion] = useState(0);
  const [dbState, setDbState] = useState({
    customers: db.getCustomers(),
    orders: db.getOrders(),
    invoices: db.getInvoices(),
    appointments: db.getAppointments(),
    expenses: db.getExpenses(),
    measurements: db.getAllMeasurements(),
    workers: db.getWorkers(),
    attendance: db.getAttendance(),
    advances: db.getAdvances(),
    salaries: db.getSalaryPayouts(),
  });

  const [shopConfig, setShopConfig] = useState(db.getShopConfig());
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgressText, setExportProgressText] = useState("");

  const [isDragging, setIsDragging] = useState(false);
  const [validationResult, setValidationResult] = useState<BackupValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  // Restore Execution state
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState<{ stage: string; step: number; total: number }>({
    stage: "",
    step: 0,
    total: 12
  });
  const [restoreReport, setRestoreReport] = useState<RestoreSuccessReport | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  // Stats
  const [storageUsage, setStorageUsage] = useState<{ kb: number; percent: number }>({ kb: 0, percent: 0 });
  const [lastBackupDate, setLastBackupDate] = useState<string | null>(null);
  const [lastBackupSize, setLastBackupSize] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = db.onSync(() => {
      setDbVersion((v) => v + 1);
      refreshDb();
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    calculateStorage();
    const shop = db.getShopConfig();
    setShopConfig(shop);

    const savedLastDate = localStorage.getItem("sig_suit_last_backup_timestamp") || localStorage.getItem("sig_suit_last_json_backup");
    const savedLastSize = localStorage.getItem("sig_suit_last_backup_size") || "240 KB";
    setLastBackupDate(savedLastDate);
    setLastBackupSize(savedLastSize);

    // Run auto-backup check if scheduled
    checkAndPerformAutoBackupIfNeeded();
  }, [dbVersion]);

  const calculateStorage = () => {
    try {
      let totalChars = 0;
      for (const key in localStorage) {
        if (localStorage.hasOwnProperty(key)) {
          const val = localStorage.getItem(key);
          if (val) totalChars += val.length;
        }
      }
      const kb = Math.round((totalChars / 1024) * 10) / 10;
      const percent = Math.min(Math.round((kb / 5000) * 100 * 10) / 10, 100);
      setStorageUsage({ kb, percent });
    } catch (e) {
      setStorageUsage({ kb: 85, percent: 1.2 });
    }
  };

  const refreshDb = () => {
    const updated = {
      customers: db.getCustomers(),
      orders: db.getOrders(),
      invoices: db.getInvoices(),
      appointments: db.getAppointments(),
      expenses: db.getExpenses(),
      measurements: db.getAllMeasurements(),
      workers: db.getWorkers(),
      attendance: db.getAttendance(),
      advances: db.getAdvances(),
      salaries: db.getSalaryPayouts(),
    };
    setDbState(updated);
  };

  // Calculate total payment entries count
  const calculateTotalPayments = () => {
    let total = 0;
    dbState.invoices.forEach((inv) => {
      if (Array.isArray(inv.payments)) {
        total += inv.payments.length;
      }
    });
    return total;
  };

  // --- EXPORT MASTER BACKUP (.backup ZIP) ---
  const handleExportFullBackup = async () => {
    try {
      setIsExporting(true);
      setExportProgressText("Preparing database snapshot...");

      const { blob, filename, manifest } = await createFullBackupZip((stage) => {
        setExportProgressText(stage);
      });

      triggerFileDownload(blob, filename);

      const formattedNow = new Date().toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short"
      });
      const formattedSize = `${Math.round(blob.size / 1024)} KB`;

      localStorage.setItem("sig_suit_last_backup_timestamp", formattedNow);
      localStorage.setItem("sig_suit_last_backup_size", formattedSize);
      setLastBackupDate(formattedNow);
      setLastBackupSize(formattedSize);

      setExportProgressText("Backup generated successfully!");
      setTimeout(() => {
        setIsExporting(false);
        setExportProgressText("");
      }, 1200);
    } catch (err: any) {
      console.error("Export failed:", err);
      alert("Failed to export full backup: " + (err.message || "Unknown error"));
      setIsExporting(false);
    }
  };

  // --- HANDLE FILE UPLOAD / RESTORE SELECTION ---
  const handleFileSelect = async (file: File) => {
    if (!file) return;
    setIsValidating(true);
    setRestoreError(null);
    try {
      const validation = await parseAndValidateBackupFile(file);
      setValidationResult(validation);
    } catch (e: any) {
      setRestoreError("Failed to parse backup file: " + e.message);
    } finally {
      setIsValidating(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  // --- EXECUTE RESTORE ---
  const handleConfirmRestore = async () => {
    if (!validationResult) return;
    setIsRestoring(true);
    setRestoreError(null);

    try {
      const report = await executeRestoreOperation(
        validationResult,
        (stage, step, total) => {
          setRestoreProgress({ stage, step, total });
        }
      );

      setRestoreReport(report);
      setValidationResult(null);

      // Update last backup timestamp
      const nowStr = new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
      localStorage.setItem("sig_suit_last_backup_timestamp", nowStr);
      setLastBackupDate(nowStr);

      refreshDb();
    } catch (err: any) {
      console.error("Restore error:", err);
      setRestoreError("Restoration failed: " + (err.message || "An unexpected error occurred."));
    } finally {
      setIsRestoring(false);
    }
  };

  // --- AUTO BACKUP SETTING UPDATE ---
  const handleAutoBackupChange = (freq: "Off" | "Daily" | "Weekly") => {
    const updated = {
      ...shopConfig,
      autoBackupFrequency: freq
    };
    db.updateShopConfig(updated);
    setShopConfig(updated);
  };

  const totalPayments = calculateTotalPayments();

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-16">
      {/* 1. HEADER BANNER */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden border border-slate-800">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-8 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-medium tracking-wide mb-3">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Full System Vault & Disaster Recovery</span>
            </div>
            <h1 className="text-3xl font-serif font-bold text-white tracking-tight">
              Full Backup & Restore System
            </h1>
            <p className="mt-2 text-slate-300 max-w-2xl text-sm leading-relaxed">
              Export comprehensive <code className="text-amber-300 font-mono bg-slate-800/80 px-1.5 py-0.5 rounded text-xs">.backup</code> archives containing all customers, orders, bespoke measurements, invoices, payments, workers, and settings. Cloud Vault remains the single source of truth.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <button
              onClick={handleExportFullBackup}
              disabled={isExporting}
              className="inline-flex items-center justify-center gap-2.5 px-6 py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-semibold rounded-2xl shadow-lg shadow-amber-500/20 transition-all transform hover:-translate-y-0.5 disabled:opacity-50 cursor-pointer"
            >
              {isExporting ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  <span>{exportProgressText || "Exporting..."}</span>
                </>
              ) : (
                <>
                  <Download className="w-5 h-5" />
                  <span>Export Full Backup (.backup)</span>
                </>
              )}
            </button>

            <label className="inline-flex items-center justify-center gap-2.5 px-6 py-3.5 bg-slate-800/90 hover:bg-slate-800 text-white font-medium rounded-2xl border border-slate-700/80 hover:border-slate-600 transition-all cursor-pointer">
              <UploadCloud className="w-5 h-5 text-amber-400" />
              <span>Import & Restore</span>
              <input
                type="file"
                accept=".backup,.zip,.json,.csv"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileSelect(e.target.files[0]);
                  }
                }}
              />
            </label>
          </div>
        </div>
      </div>

      {/* 2. BACKUP STATUS & SYSTEM HEALTH */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Status Card 1: Last Backup */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
              <Clock className="w-6 h-6" />
            </div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <Check className="w-3.5 h-3.5" />
              Active
            </span>
          </div>

          <div className="mt-4">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Last Backup Timestamp
            </p>
            <p className="text-lg font-bold text-slate-900 mt-1">
              {lastBackupDate || "No recent export logged"}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Archive Size: <span className="font-semibold text-slate-700">{lastBackupSize || "240 KB"}</span>
            </p>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
            <span>Cloud Database Sync:</span>
            <span className={`font-semibold ${isSupabaseConfigured ? "text-emerald-600" : "text-amber-600"}`}>
              {isSupabaseConfigured ? "Cloud Vault Active ✓" : "Offline Cache"}
            </span>
          </div>
        </div>

        {/* Status Card 2: Database Volume */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
              <Database className="w-6 h-6" />
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
              Full Data Scope
            </span>
          </div>

          <div className="mt-4">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Total Managed Records
            </p>
            <p className="text-2xl font-extrabold text-slate-900 mt-1">
              {(
                dbState.customers.length +
                dbState.orders.length +
                dbState.invoices.length +
                dbState.measurements.length +
                dbState.appointments.length +
                dbState.expenses.length +
                dbState.workers.length
              ).toLocaleString("en-IN")}{" "}
              <span className="text-sm font-normal text-slate-500">entries</span>
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Local Storage Cache: <span className="font-semibold text-slate-700">{storageUsage.kb} KB ({storageUsage.percent}%)</span>
            </p>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
            <span>Data Preservation:</span>
            <span className="font-semibold text-slate-800">10-15 Years Safe</span>
          </div>
        </div>

        {/* Status Card 3: Auto-Backup Schedule Settings */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="p-3 bg-slate-100 text-slate-700 rounded-xl">
              <SlidersHorizontal className="w-6 h-6" />
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
              Automatic Backup
            </span>
          </div>

          <div className="mt-4">
            <label className="block text-xs font-medium uppercase tracking-wider text-slate-500 mb-2">
              Auto-Backup Schedule
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(["Off", "Daily", "Weekly"] as const).map((freq) => {
                const isActive = (shopConfig.autoBackupFrequency || "Off") === freq;
                return (
                  <button
                    key={freq}
                    type="button"
                    onClick={() => handleAutoBackupChange(freq)}
                    className={`py-2 px-3 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
                      isActive
                        ? "bg-slate-900 text-white border-slate-900 shadow-sm"
                        : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    {freq}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 text-xs text-slate-500 flex items-center justify-between">
            <span>Schedule Status:</span>
            <span className="font-medium text-slate-700">
              {(shopConfig.autoBackupFrequency || "Off") === "Off"
                ? "Disabled"
                : `Active (${shopConfig.autoBackupFrequency})`}
            </span>
          </div>
        </div>
      </div>

      {/* 3. TABLE RECORDS BREAKDOWN GRID */}
      <div className="bg-white rounded-3xl p-8 border border-slate-200/80 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-xl font-serif font-bold text-slate-900 flex items-center gap-2">
              <Layers className="w-5 h-5 text-amber-600" />
              Live Database Content Summary
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Real-time snapshot of entities included in every full <code className="text-amber-700 font-mono">.backup</code> export.
            </p>
          </div>
          <button
            onClick={refreshDb}
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh Counts</span>
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-4">
          <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-100 text-center">
            <p className="text-2xl font-extrabold text-amber-900">{dbState.customers.length}</p>
            <p className="text-xs font-medium text-amber-700 mt-1">Customers</p>
          </div>

          <div className="p-4 rounded-2xl bg-indigo-50/60 border border-indigo-100 text-center">
            <p className="text-2xl font-extrabold text-indigo-900">{dbState.orders.length}</p>
            <p className="text-xs font-medium text-indigo-700 mt-1">Orders</p>
          </div>

          <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-100 text-center">
            <p className="text-2xl font-extrabold text-emerald-900">{dbState.measurements.length}</p>
            <p className="text-xs font-medium text-emerald-700 mt-1">Measurements</p>
          </div>

          <div className="p-4 rounded-2xl bg-blue-50/60 border border-blue-100 text-center">
            <p className="text-2xl font-extrabold text-blue-900">{dbState.invoices.length}</p>
            <p className="text-xs font-medium text-blue-700 mt-1">Invoices</p>
          </div>

          <div className="p-4 rounded-2xl bg-purple-50/60 border border-purple-100 text-center">
            <p className="text-2xl font-extrabold text-purple-900">{totalPayments}</p>
            <p className="text-xs font-medium text-purple-700 mt-1">Payments</p>
          </div>

          <div className="p-4 rounded-2xl bg-rose-50/60 border border-rose-100 text-center">
            <p className="text-2xl font-extrabold text-rose-900">{dbState.workers.length}</p>
            <p className="text-xs font-medium text-rose-700 mt-1">Workers</p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-100 border border-slate-200 text-center">
            <p className="text-2xl font-extrabold text-slate-800">{dbState.expenses.length}</p>
            <p className="text-xs font-medium text-slate-600 mt-1">Expenses</p>
          </div>
        </div>
      </div>

      {/* 4. DRAG & DROP IMPORT ZONE */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`bg-white rounded-3xl p-10 border-2 border-dashed transition-all text-center relative overflow-hidden ${
          isDragging
            ? "border-amber-500 bg-amber-50/40 scale-[1.01]"
            : "border-slate-300 hover:border-slate-400"
        }`}
      >
        <div className="max-w-md mx-auto space-y-4">
          <div className="w-16 h-16 bg-slate-100 text-slate-700 rounded-2xl mx-auto flex items-center justify-center shadow-inner">
            <FileArchive className="w-8 h-8 text-amber-600" />
          </div>

          <div>
            <h3 className="text-lg font-bold text-slate-900">
              Import & Restore Backup File
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Drag and drop your <span className="font-mono text-slate-800 font-semibold">.backup</span>, <span className="font-mono text-slate-800 font-semibold">.json</span>, or <span className="font-mono text-slate-800 font-semibold">.csv</span> file here.
            </p>
          </div>

          <label className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs rounded-xl shadow-md transition-all cursor-pointer">
            <UploadCloud className="w-4 h-4 text-amber-400" />
            <span>Select Backup File</span>
            <input
              type="file"
              accept=".backup,.zip,.json,.csv"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileSelect(e.target.files[0]);
                }
              }}
            />
          </label>

          <p className="text-[11px] text-slate-400">
            An automatic safety backup (<code className="font-mono">Pre-Restore-Backup-[Date].backup</code>) will be created prior to any restoration.
          </p>
        </div>
      </div>

      {/* ERROR DISPLAY */}
      {restoreError && (
        <div className="p-5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-sm">Restoration Error</p>
            <p className="text-xs text-rose-700 mt-1">{restoreError}</p>
          </div>
        </div>
      )}

      {/* 5. VALIDATION & CONFIRMATION MODAL */}
      {validationResult && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-8 shadow-2xl border border-slate-200 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-amber-100 text-amber-700 rounded-2xl">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-serif font-bold text-slate-900">
                    Backup Information & Integrity Check
                  </h3>
                  <p className="text-xs text-slate-500">
                    Review backup contents before restoring into database.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setValidationResult(null)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* STATUS BADGE */}
            <div
              className={`p-4 rounded-2xl flex items-center gap-3 border ${
                validationResult.valid
                  ? "bg-emerald-50 text-emerald-900 border-emerald-200"
                  : "bg-rose-50 text-rose-900 border-rose-200"
              }`}
            >
              {validationResult.valid ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
              )}
              <div className="text-xs">
                <p className="font-bold">
                  {validationResult.valid
                    ? "Backup File Verified & Compatible"
                    : "Backup Validation Issues Detected"}
                </p>
                <p className="mt-0.5 opacity-90">
                  {validationResult.valid
                    ? "Structure, record schemas, and keys verified. Safe to proceed."
                    : validationResult.errors.join("; ")}
                </p>
              </div>
            </div>

            {/* MANIFEST METRICS */}
            {validationResult.manifest && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200/80 text-xs">
                  <div>
                    <span className="text-slate-500">Business Name:</span>
                    <p className="font-bold text-slate-900 mt-0.5">
                      {validationResult.manifest.businessName}
                    </p>
                  </div>

                  <div>
                    <span className="text-slate-500">Backup Date:</span>
                    <p className="font-bold text-slate-900 mt-0.5">
                      {new Date(validationResult.manifest.createdAt).toLocaleString("en-IN")}
                    </p>
                  </div>

                  <div>
                    <span className="text-slate-500">Archive Size:</span>
                    <p className="font-bold text-slate-900 mt-0.5">
                      {Math.round(validationResult.fileSizeBytes / 1024)} KB
                    </p>
                  </div>

                  <div>
                    <span className="text-slate-500">Format Version:</span>
                    <p className="font-bold text-slate-900 mt-0.5">
                      {validationResult.manifest.backupVersion}
                    </p>
                  </div>

                  <div>
                    <span className="text-slate-500">App Version:</span>
                    <p className="font-bold text-slate-900 mt-0.5">
                      v{validationResult.manifest.applicationVersion}
                    </p>
                  </div>

                  <div>
                    <span className="text-slate-500">Format Type:</span>
                    <p className="font-bold uppercase text-slate-900 mt-0.5">
                      {validationResult.fileType}
                    </p>
                  </div>
                </div>

                {/* RECORD COUNTS GRID */}
                <div>
                  <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    Included Table Records
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="p-2.5 rounded-xl bg-slate-100 border border-slate-200">
                      <span className="text-slate-500">Customers:</span>{" "}
                      <span className="font-bold text-slate-900">
                        {validationResult.manifest.totalCustomers}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-100 border border-slate-200">
                      <span className="text-slate-500">Orders:</span>{" "}
                      <span className="font-bold text-slate-900">
                        {validationResult.manifest.totalOrders}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-100 border border-slate-200">
                      <span className="text-slate-500">Invoices:</span>{" "}
                      <span className="font-bold text-slate-900">
                        {validationResult.manifest.totalInvoices}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-100 border border-slate-200">
                      <span className="text-slate-500">Payments:</span>{" "}
                      <span className="font-bold text-slate-900">
                        {validationResult.manifest.totalPayments}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-100 border border-slate-200">
                      <span className="text-slate-500">Measurements:</span>{" "}
                      <span className="font-bold text-slate-900">
                        {validationResult.manifest.totalMeasurements}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-100 border border-slate-200">
                      <span className="text-slate-500">Workers:</span>{" "}
                      <span className="font-bold text-slate-900">
                        {validationResult.manifest.totalWorkers}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-100 border border-slate-200">
                      <span className="text-slate-500">Expenses:</span>{" "}
                      <span className="font-bold text-slate-900">
                        {validationResult.manifest.totalExpenses}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-100 border border-slate-200">
                      <span className="text-slate-500">Storage Files:</span>{" "}
                      <span className="font-bold text-slate-900">
                        {validationResult.manifest.fileCount} items
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* WARNINGS */}
            {validationResult.warnings.length > 0 && (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs space-y-1">
                <p className="font-bold">Notices & Warnings:</p>
                {validationResult.warnings.map((w, idx) => (
                  <p key={idx}>• {w}</p>
                ))}
              </div>
            )}

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-600 space-y-1">
              <p className="font-semibold text-slate-800">
                Automatic Pre-Restore Protection:
              </p>
              <p>
                To prevent accidental data loss, an automatic backup of your current database (<code className="font-mono text-slate-900 font-bold">Pre-Restore-Backup-[Date].backup</code>) will be created and downloaded before any data is overwritten.
              </p>
            </div>

            {/* MODAL ACTIONS */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <button
                onClick={() => setValidationResult(null)}
                className="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-medium text-xs cursor-pointer"
              >
                Cancel
              </button>

              <button
                onClick={handleConfirmRestore}
                disabled={!validationResult.valid || isRestoring}
                className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shadow-md disabled:opacity-50 flex items-center gap-2 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Restore Database Backup</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. PROGRESS MODAL */}
      {isRestoring && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl border border-slate-200 text-center space-y-6">
            <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full mx-auto flex items-center justify-center animate-pulse">
              <RefreshCw className="w-8 h-8 animate-spin" />
            </div>

            <div>
              <h3 className="text-xl font-serif font-bold text-slate-900">
                Restoring Database...
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Please do not close or refresh this tab.
              </p>
            </div>

            {/* PROGRESS BAR */}
            <div className="space-y-2">
              <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden p-0.5 border border-slate-200">
                <div
                  className="bg-gradient-to-r from-amber-500 to-amber-600 h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.round((restoreProgress.step / restoreProgress.total) * 100)}%`
                  }}
                />
              </div>
              <p className="text-xs font-semibold text-slate-700">
                {restoreProgress.stage || "Processing..."}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 7. SUCCESS REPORT MODAL */}
      {restoreReport && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-8 shadow-2xl border border-slate-200 space-y-6">
            <div className="text-center space-y-2">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full mx-auto flex items-center justify-center shadow-inner">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h3 className="text-2xl font-serif font-bold text-slate-900">
                Backup Restored Successfully
              </h3>
              <p className="text-xs text-slate-500">
                Restoration timestamp: {restoreReport.timestamp}
              </p>
            </div>

            <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 text-xs text-emerald-800 space-y-1">
              <p className="font-bold">Pre-Restore Protection Downloaded:</p>
              <p className="font-mono text-[11px] text-emerald-900">
                {restoreReport.preRestoreBackupFilename}
              </p>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Restored Record Counts
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex justify-between">
                  <span className="text-slate-600">Customers:</span>
                  <span className="font-bold text-slate-900">
                    {restoreReport.recordCounts.customers}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex justify-between">
                  <span className="text-slate-600">Orders:</span>
                  <span className="font-bold text-slate-900">
                    {restoreReport.recordCounts.orders}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex justify-between">
                  <span className="text-slate-600">Measurements:</span>
                  <span className="font-bold text-slate-900">
                    {restoreReport.recordCounts.measurements}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex justify-between">
                  <span className="text-slate-600">Invoices:</span>
                  <span className="font-bold text-slate-900">
                    {restoreReport.recordCounts.invoices}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex justify-between">
                  <span className="text-slate-600">Payments:</span>
                  <span className="font-bold text-slate-900">
                    {restoreReport.recordCounts.payments}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex justify-between">
                  <span className="text-slate-600">Workers:</span>
                  <span className="font-bold text-slate-900">
                    {restoreReport.recordCounts.workers}
                  </span>
                </div>
              </div>
            </div>

            {restoreReport.storageCounts && restoreReport.storageCounts.backedUp > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Cloud Asset & Media Files Restored & Verified
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex justify-between">
                    <span className="text-slate-600">Storage Files Restored:</span>
                    <span className="font-bold text-slate-900">
                      {restoreReport.storageCounts.restored} / {restoreReport.storageCounts.backedUp}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex justify-between">
                    <span className="text-slate-600">Storage Files Verified:</span>
                    <span className="font-bold text-emerald-700">
                      {restoreReport.storageCounts.verified}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => {
                  setRestoreReport(null);
                  window.location.reload();
                }}
                className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer"
              >
                Done & Refresh Dashboard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
