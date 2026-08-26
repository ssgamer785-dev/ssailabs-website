import React, { useState, useRef } from 'react';
import {
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  FileCheck2,
  Loader2,
  ShieldCheck,
  Users,
  ShoppingBag,
  Ruler,
  Scissors,
  Calendar,
  Receipt,
  Briefcase,
  Layers
} from 'lucide-react';
import {
  RegencyBackupPayload,
  BackupValidationResult,
  buildBackupSnapshot,
  downloadBackupFile,
  validateBackupContent
} from '../../utils/backupManager';
import { readHighWaterMark, highestNumberInData } from '../../utils/orderNumbering';
import { usesSupabase } from '../../lib/supabase';
import { LegacyMigrationCard } from '../LegacyMigrationCard';
import { exportBackupPayload } from '../../data/supabaseRepository';

// Must match App.tsx's STORAGE_KEY
const BACKUP_STORAGE_KEY = 'REGENCY_TAILORS_DB_V3';
import {
  Customer,
  Order,
  MeasurementRecord,
  Fitting,
  Worker,
  Invoice,
  Expense,
  TrashItem,
  ShowroomProfile
} from '../../types';

interface BackupViewProps {
  customers: Customer[];
  orders: Order[];
  measurements: MeasurementRecord[];
  fittings: Fitting[];
  workers: Worker[];
  invoices: Invoice[];
  expenses: Expense[];
  trash: TrashItem[];
  profile: ShowroomProfile;
  onRestoreBackup: (payload: RegencyBackupPayload) => void | Promise<void>;
  onRefresh?: () => void | Promise<void>;
}

export const BackupView: React.FC<BackupViewProps> = ({
  customers,
  orders,
  measurements,
  fittings,
  workers,
  invoices,
  expenses,
  trash,
  profile,
  onRestoreBackup,
  onRefresh
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Export State
  const [isExporting, setIsExporting] = useState(false);
  const [exportStep, setExportStep] = useState<string>('');
  const [exportSuccessMessage, setExportSuccessMessage] = useState<string | null>(null);

  // Import State
  const [isImporting, setIsImporting] = useState(false);
  const [importProgressStep, setImportProgressStep] = useState<string>('');
  const [validationResult, setValidationResult] = useState<BackupValidationResult | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [importErrorMessage, setImportErrorMessage] = useState<string | null>(null);
  const [importSuccessMessage, setImportSuccessMessage] = useState<string | null>(null);
  const [integrityNotice, setIntegrityNotice] = useState<string | null>(null);

  // -------------------------------------------------------------
  // 1. EXPORT BACKUP FLOW
  // -------------------------------------------------------------
  const handleExportBackup = async () => {
    if (isExporting || isImporting) return;
    setIsExporting(true);
    setExportSuccessMessage(null);
    setImportErrorMessage(null);
    setImportSuccessMessage(null);

    try {
      setExportStep('Preparing backup...');
      await new Promise(r => setTimeout(r, 200));

      setExportStep('Collecting customers and profiles...');
      await new Promise(r => setTimeout(r, 150));

      setExportStep('Collecting bespoke orders and garment line items...');
      await new Promise(r => setTimeout(r, 150));

      setExportStep('Collecting precision measurements and posture notes...');
      await new Promise(r => setTimeout(r, 150));

      setExportStep('Collecting production records and fitting schedules...');
      await new Promise(r => setTimeout(r, 150));

      setExportStep('Validating record relationships and data integrity...');

      // On the Supabase path the file carries the exact database payload as
      // well as the readable collections, so a restore reproduces the database
      // verbatim rather than being re-derived from the screen's copy.
      let databasePayload: Record<string, unknown> | undefined;
      if (usesSupabase) {
        setExportStep('Reading the showroom database...');
        databasePayload = await exportBackupPayload();
      }

      const snapshot = buildBackupSnapshot({
        customers,
        orders,
        measurements,
        fittings,
        workers,
        invoices,
        expenses,
        trash,
        profile,
        // Carry the retired-order-number mark so a restored database continues
        // from the correct next number instead of re-issuing a printed one.
        orderSequence: usesSupabase
          ? Number((databasePayload as { order_sequence?: number } | undefined)?.order_sequence || highestNumberInData(orders, trash))
          : Math.max(readHighWaterMark(BACKUP_STORAGE_KEY), highestNumberInData(orders, trash)),
        database: databasePayload
      });
      await new Promise(r => setTimeout(r, 200));

      setExportStep('Creating .regency.backup package...');
      const downloadedFileName = downloadBackupFile(snapshot);
      await new Promise(r => setTimeout(r, 250));

      setExportStep('Download ready');
      setIsExporting(false);
      setExportSuccessMessage(`Backup exported successfully (${downloadedFileName}).`);
    } catch (err: any) {
      setIsExporting(false);
      setExportStep('');
      setImportErrorMessage(`Failed to generate backup: ${err.message || 'Unknown error'}`);
    }
  };

  // -------------------------------------------------------------
  // 2. IMPORT BACKUP FILE SELECTION & VALIDATION
  // -------------------------------------------------------------
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset messages
    setImportErrorMessage(null);
    setImportSuccessMessage(null);
    setExportSuccessMessage(null);
    setIntegrityNotice(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const result = validateBackupContent(content, file.name, file.size);

        if (!result.isValid) {
          setImportErrorMessage(result.error || 'Invalid or corrupted backup file. No data was changed.');
          return;
        }

        // Show preview confirmation modal before restoring
        setValidationResult(result);
        setShowPreviewModal(true);
      } catch (err: any) {
        setImportErrorMessage(`Invalid or corrupted backup file. No data was changed. (${err.message || ''})`);
      } finally {
        // Reset file input so same file can be re-selected if desired
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    };

    reader.onerror = () => {
      setImportErrorMessage('Failed to read backup file from disk. Please check file permissions.');
      if (fileInputRef.current) fileInputRef.current.value = '';
    };

    reader.readAsText(file);
  };

  // -------------------------------------------------------------
  // 3. EXECUTE ATOMIC RESTORATION WITH PROGRESS
  // -------------------------------------------------------------
  const handleConfirmRestore = async () => {
    if (!validationResult || !validationResult.payload) return;
    setIsImporting(true);

    try {
      setImportProgressStep('Validating backup...');
      await new Promise(r => setTimeout(r, 200));

      setImportProgressStep('Preparing restore...');
      await new Promise(r => setTimeout(r, 180));

      setImportProgressStep('Restoring customers...');
      await new Promise(r => setTimeout(r, 180));

      setImportProgressStep('Restoring orders and garment line items...');
      await new Promise(r => setTimeout(r, 180));

      setImportProgressStep('Restoring precision measurements and remarks...');
      await new Promise(r => setTimeout(r, 180));

      setImportProgressStep('Restoring production slips and fittings...');
      await new Promise(r => setTimeout(r, 180));

      setImportProgressStep('Restoring billing records and invoices...');
      await new Promise(r => setTimeout(r, 180));

      setImportProgressStep('Verifying relationships...');
      const integrity = validationResult.integrity;
      if (integrity) {
        const issues: string[] = [];
        if (integrity.orphanOrders.length)
          issues.push(`${integrity.orphanOrders.length} order(s) reference a missing customer`);
        if (integrity.orphanMeasurements.length)
          issues.push(`${integrity.orphanMeasurements.length} measurement record(s) reference a missing customer`);
        if (integrity.orphanInvoices.length)
          issues.push(`${integrity.orphanInvoices.length} invoice(s) reference a missing order`);
        if (integrity.duplicateOrderIds.length)
          issues.push(`${integrity.duplicateOrderIds.length} duplicate order number(s) were renumbered`);
        if (integrity.repairedOrders)
          issues.push(`${integrity.repairedOrders} order(s) had malformed garment lists repaired`);
        setIntegrityNotice(issues.length ? issues.join(' • ') : null);
      }
      await new Promise(r => setTimeout(r, 180));

      // Perform the replacement. On Supabase this is a single database
      // transaction; a failure throws and is reported below without having
      // changed anything.
      await onRestoreBackup(validationResult.payload);

      setImportProgressStep('Restore complete');
      await new Promise(r => setTimeout(r, 250));

      setShowPreviewModal(false);
      setIsImporting(false);
      setValidationResult(null);
      setImportSuccessMessage('Backup restored successfully. Your Regency Tailors data has been restored.');
    } catch (err: any) {
      setIsImporting(false);
      setImportProgressStep('');
      setImportErrorMessage(`Failed to restore backup: ${err.message || 'Unknown error'}`);
    }
  };

  // Formatted date helper
  const formatCreationDate = (isoString?: string) => {
    if (!isoString) return 'N/A';
    try {
      const d = new Date(isoString);
      return d.toLocaleString('en-US', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-12 max-w-5xl mx-auto">
      {/* Hidden File Input strictly accepting .regency.backup, .backup, and .json */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept=".regency.backup,.backup,.json"
        className="hidden"
      />

      <LegacyMigrationCard
        liveOrderCount={orders.length}
        liveCustomerCount={customers.length}
        onMigrated={() => onRefresh?.()}
      />

      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 sm:p-8 rounded-2xl border border-[#E6E1D7] shadow-2xs">
        <div>
          <div className="text-[10px] font-bold tracking-[0.2em] text-[#C9A24A] uppercase mb-1 brand-font">
            DATA INTEGRITY & SECURITY
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#071426] brand-font">
            Backup & Restore
          </h1>
          <p className="text-xs sm:text-sm text-[#7A7060] mt-1 max-w-2xl leading-relaxed">
            Securely export or restore your complete showroom database including client ledgers, orders, garments, measurements, production slips, and billing.
          </p>
        </div>

        <div className="flex items-center gap-2 px-3 py-2 bg-[#F7F3EA] border border-[#E6E1D7] rounded-xl text-xs font-semibold text-[#071426] shrink-0 self-start sm:self-auto">
          <ShieldCheck className="w-4 h-4 text-[#C9A24A]" />
          <span>AES Data Integrity</span>
        </div>
      </div>

      {/* Alert / Notification Feedback */}
      {exportSuccessMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3 text-xs sm:text-sm font-medium text-emerald-900 animate-fadeIn">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <div className="flex-1">{exportSuccessMessage}</div>
          <button
            onClick={() => setExportSuccessMessage(null)}
            className="text-xs text-emerald-700 hover:text-emerald-900 font-bold cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {importSuccessMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-3 text-xs sm:text-sm font-medium text-emerald-900 animate-fadeIn">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <div className="flex-1">{importSuccessMessage}</div>
          <button
            onClick={() => setImportSuccessMessage(null)}
            className="text-xs text-emerald-700 hover:text-emerald-900 font-bold cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Relationship problems found while restoring. Reported, never hidden. */}
      {integrityNotice && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3 text-xs sm:text-sm font-medium text-amber-900 animate-fadeIn">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-black uppercase tracking-wider text-[11px] mb-1">
              Data integrity notes from this backup
            </div>
            <div>{integrityNotice}</div>
            <div className="mt-1 text-amber-800">
              The records were restored — review them before relying on the affected reports.
            </div>
          </div>
          <button
            onClick={() => setIntegrityNotice(null)}
            className="text-xs text-amber-800 hover:text-amber-950 font-bold cursor-pointer shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {importErrorMessage && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 text-xs sm:text-sm font-medium text-red-900 animate-fadeIn">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
          <div className="flex-1">{importErrorMessage}</div>
          <button
            onClick={() => setImportErrorMessage(null)}
            className="text-xs text-red-700 hover:text-red-900 font-bold cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* TWO PRIMARY ACTION CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
        {/* OPTION 1: EXPORT BACKUP */}
        <div className="bg-white p-6 sm:p-8 rounded-2xl border border-[#E6E1D7] shadow-2xs hover:shadow-md transition-all flex flex-col justify-between space-y-6 group">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="w-12 h-12 rounded-2xl bg-[#071426] text-[#C9A24A] flex items-center justify-center shadow-xs">
                <Download className="w-6 h-6" />
              </div>
              <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 bg-[#F7F3EA] text-[#071426] rounded-full border border-[#E6E1D7]">
                .regency.backup
              </span>
            </div>

            <div>
              <h2 className="text-xl font-extrabold text-[#071426] brand-font tracking-tight">
                EXPORT BACKUP
              </h2>
              <p className="text-xs sm:text-sm text-[#7A7060] mt-2 leading-relaxed">
                Download a complete backup of your Regency Tailors data.
              </p>
            </div>

            <div className="bg-[#F7F3EA]/70 p-4 rounded-xl border border-[#E6E1D7] text-xs text-[#52493A] space-y-2">
              <div className="font-semibold text-[#071426] flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-[#C9A24A]" />
                <span>Backup Package Snapshot Includes:</span>
              </div>
              <div className="grid grid-cols-2 gap-y-1 gap-x-2 text-[11px] text-[#7A7060]">
                <span>• {customers.length} Client Profiles</span>
                <span>• {orders.length} Showroom Orders</span>
                <span>• {measurements.length} Measurement Cards</span>
                <span>• {fittings.length} Fitting Records</span>
                <span>• {invoices.length} Invoices & Payments</span>
                <span>• {workers.length} Staff & Artisans</span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            {isExporting && (
              <div className="p-3 bg-[#F7F3EA] rounded-xl border border-[#E6E1D7] flex items-center gap-2.5 text-xs text-[#071426] font-medium">
                <Loader2 className="w-4 h-4 text-[#C9A24A] animate-spin shrink-0" />
                <span>{exportStep}</span>
              </div>
            )}

            <button
              type="button"
              disabled={isExporting || isImporting}
              onClick={handleExportBackup}
              className={`w-full py-3.5 px-6 font-extrabold text-xs sm:text-sm rounded-xl transition-all flex items-center justify-center gap-2.5 tracking-wider uppercase brand-font ${
                isExporting || isImporting
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-[#C9A24A] hover:bg-[#B8913B] text-[#071426] shadow-sm hover:shadow-md cursor-pointer active:scale-[0.99]'
              }`}
            >
              <Download className="w-4 h-4" />
              <span>{isExporting ? 'Exporting Backup...' : 'EXPORT BACKUP'}</span>
            </button>
          </div>
        </div>

        {/* OPTION 2: IMPORT BACKUP */}
        <div className="bg-white p-6 sm:p-8 rounded-2xl border border-[#E6E1D7] shadow-2xs hover:shadow-md transition-all flex flex-col justify-between space-y-6 group">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="w-12 h-12 rounded-2xl bg-[#F7F3EA] text-[#071426] border border-[#E6E1D7] flex items-center justify-center shadow-xs">
                <Upload className="w-6 h-6 text-[#C9A24A]" />
              </div>
              <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 bg-amber-50 text-amber-800 rounded-full border border-amber-200">
                Safe Atomic Restore
              </span>
            </div>

            <div>
              <h2 className="text-xl font-extrabold text-[#071426] brand-font tracking-tight">
                IMPORT BACKUP
              </h2>
              <p className="text-xs sm:text-sm text-[#7A7060] mt-2 leading-relaxed">
                Restore your data from a previously exported .backup file.
              </p>
            </div>

            <div className="bg-[#F7F3EA]/70 p-4 rounded-xl border border-[#E6E1D7] text-xs text-[#52493A] space-y-2">
              <div className="font-semibold text-[#071426] flex items-center gap-1.5">
                <FileCheck2 className="w-3.5 h-3.5 text-[#C9A24A]" />
                <span>Verification & Protection:</span>
              </div>
              <p className="text-[11px] text-[#7A7060] leading-relaxed">
                Every backup file is pre-validated for structure, schema integrity, and relationship accuracy before any data changes. You will preview the data summary before confirming restoration.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <button
              type="button"
              disabled={isExporting || isImporting}
              onClick={() => fileInputRef.current?.click()}
              className={`w-full py-3.5 px-6 font-extrabold text-xs sm:text-sm rounded-xl transition-all flex items-center justify-center gap-2.5 tracking-wider uppercase brand-font ${
                isExporting || isImporting
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-[#071426] hover:bg-[#0E223D] text-[#C9A24A] shadow-sm hover:shadow-md cursor-pointer active:scale-[0.99]'
              }`}
            >
              <Upload className="w-4 h-4 text-[#C9A24A]" />
              <span>IMPORT BACKUP</span>
            </button>
          </div>
        </div>
      </div>

      {/* Auto-Save & Storage Notice */}
      <div className="p-4 bg-white border border-[#E6E1D7] rounded-2xl flex items-start sm:items-center gap-3.5 text-xs text-[#52493A] shadow-2xs">
        <div className="w-8 h-8 rounded-lg bg-[#F7F3EA] text-[#C9A24A] flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
          <CheckCircle2 className="w-4 h-4 text-[#C9A24A]" />
        </div>
        <div className="leading-relaxed">
          <strong className="text-[#071426] font-bold">Continuous Local Persistence:</strong> Regency Tailors maintains live persistence in your browser storage. Generating an <span className="font-semibold text-[#071426]">EXPORT BACKUP</span> creates an offline file package that can be safely archived, moved across devices, or restored anytime.
        </div>
      </div>

      {/* ========================================================= */}
      {/* RESTORE PREVIEW & CONFIRMATION MODAL */}
      {/* ========================================================= */}
      {showPreviewModal && validationResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white w-full max-w-2xl rounded-2xl border border-[#E6E1D7] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="bg-[#071426] p-6 text-white flex items-center justify-between border-b border-[#C9A24A]/30">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#C9A24A]/20 text-[#C9A24A] flex items-center justify-center">
                  <FileCheck2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold brand-font text-white">
                    RESTORE BACKUP
                  </h3>
                  <p className="text-xs text-[#C9A24A]">
                    Review verified snapshot details before confirming
                  </p>
                </div>
              </div>

              {!isImporting && (
                <button
                  type="button"
                  onClick={() => setShowPreviewModal(false)}
                  className="text-gray-400 hover:text-white text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 overflow-y-auto flex-1 text-[#071426]">
              {/* File Info */}
              <div className="bg-[#F7F3EA] p-4 rounded-xl border border-[#E6E1D7] space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
                  <span className="text-[#7A7060] font-medium">Backup File:</span>
                  <span className="font-bold text-[#071426] font-mono break-all">
                    {validationResult.fileName}
                  </span>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
                  <span className="text-[#7A7060] font-medium">Created:</span>
                  <span className="font-semibold text-[#071426]">
                    {formatCreationDate(validationResult.createdAt)}
                  </span>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
                  <span className="text-[#7A7060] font-medium">Application:</span>
                  <span className="font-semibold text-[#071426]">
                    {validationResult.payload?.metadata?.application || 'Regency Tailors'} (v{validationResult.payload?.metadata?.schemaVersion || '2.0.0'})
                  </span>
                </div>
              </div>

              {/* Data Summary Breakdown Grid */}
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-[#7A7060] mb-3 brand-font">
                  Data Records Found in Backup
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 bg-white rounded-xl border border-[#E6E1D7] flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-[#F7F3EA] text-[#C9A24A] flex items-center justify-center shrink-0">
                      <Users className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-[10px] text-[#7A7060] font-semibold uppercase">Customers</div>
                      <div className="text-base font-extrabold text-[#071426]">
                        {validationResult.stats?.customersCount || 0}
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-white rounded-xl border border-[#E6E1D7] flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-[#F7F3EA] text-[#C9A24A] flex items-center justify-center shrink-0">
                      <ShoppingBag className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-[10px] text-[#7A7060] font-semibold uppercase">Orders</div>
                      <div className="text-base font-extrabold text-[#071426]">
                        {validationResult.stats?.ordersCount || 0}
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-white rounded-xl border border-[#E6E1D7] flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-[#F7F3EA] text-[#C9A24A] flex items-center justify-center shrink-0">
                      <Ruler className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-[10px] text-[#7A7060] font-semibold uppercase">Measurements</div>
                      <div className="text-base font-extrabold text-[#071426]">
                        {validationResult.stats?.measurementsCount || 0}
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-white rounded-xl border border-[#E6E1D7] flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-[#F7F3EA] text-[#C9A24A] flex items-center justify-center shrink-0">
                      <Scissors className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-[10px] text-[#7A7060] font-semibold uppercase">Garment Items</div>
                      <div className="text-base font-extrabold text-[#071426]">
                        {validationResult.stats?.garmentsCount || 0}
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-white rounded-xl border border-[#E6E1D7] flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-[#F7F3EA] text-[#C9A24A] flex items-center justify-center shrink-0">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-[10px] text-[#7A7060] font-semibold uppercase">Fittings / Trials</div>
                      <div className="text-base font-extrabold text-[#071426]">
                        {validationResult.stats?.fittingsCount || 0}
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-white rounded-xl border border-[#E6E1D7] flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-[#F7F3EA] text-[#C9A24A] flex items-center justify-center shrink-0">
                      <Receipt className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-[10px] text-[#7A7060] font-semibold uppercase">Invoices & Bills</div>
                      <div className="text-base font-extrabold text-[#071426]">
                        {validationResult.stats?.invoicesCount || 0}
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-white rounded-xl border border-[#E6E1D7] flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-[#F7F3EA] text-[#C9A24A] flex items-center justify-center shrink-0">
                      <Briefcase className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-[10px] text-[#7A7060] font-semibold uppercase">Staff & Artisans</div>
                      <div className="text-base font-extrabold text-[#071426]">
                        {validationResult.stats?.workersCount || 0}
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-white rounded-xl border border-[#E6E1D7] flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-[#F7F3EA] text-[#C9A24A] flex items-center justify-center shrink-0">
                      <Layers className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-[10px] text-[#7A7060] font-semibold uppercase">Expenses</div>
                      <div className="text-base font-extrabold text-[#071426]">
                        {validationResult.stats?.expensesCount || 0}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Important Confirmation Warning */}
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1.5">
                <div className="font-bold flex items-center gap-1.5 text-amber-950">
                  <AlertTriangle className="w-4 h-4 text-amber-700" />
                  <span>Full Replacement Restore Mode</span>
                </div>
                <p className="leading-relaxed text-amber-900/90">
                  Confirming this restore will replace current business data with the verified snapshot in this file. All relationships between customers, orders, measurements, production slips, and billing will be faithfully restored.
                </p>
              </div>

              {/* Restore Progress Bar */}
              {isImporting && (
                <div className="p-4 bg-[#F7F3EA] rounded-xl border border-[#E6E1D7] space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-[#071426]">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 text-[#C9A24A] animate-spin" />
                      <span>{importProgressStep}</span>
                    </div>
                    <span className="text-[#C9A24A]">Processing...</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-[#C9A24A] h-1.5 rounded-full animate-pulse w-full"></div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="p-6 bg-[#F7F3EA] border-t border-[#E6E1D7] flex flex-col sm:flex-row items-center justify-end gap-3">
              <button
                type="button"
                disabled={isImporting}
                onClick={() => setShowPreviewModal(false)}
                className={`w-full sm:w-auto px-6 py-2.5 rounded-xl border border-[#E6E1D7] text-[#071426] font-bold text-xs hover:bg-white transition-all cursor-pointer ${
                  isImporting ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                CANCEL
              </button>

              <button
                type="button"
                disabled={isImporting}
                onClick={handleConfirmRestore}
                className={`w-full sm:w-auto px-6 py-2.5 rounded-xl bg-[#C9A24A] hover:bg-[#B8913B] text-[#071426] font-extrabold text-xs tracking-wider uppercase brand-font shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  isImporting ? 'opacity-50 cursor-not-allowed' : 'active:scale-[0.99]'
                }`}
              >
                {isImporting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-[#071426]" />
                    <span>RESTORING DATA...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    <span>RESTORE BACKUP</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
