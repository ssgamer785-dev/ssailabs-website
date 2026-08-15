/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { AlertTriangle, Trash2, UserX, ShieldAlert, CheckCircle2, X, Info } from "lucide-react";
import { Worker, WorkerAdvance, WorkerSalaryPayout, AttendanceRecord } from "../../types";

interface SafeDeleteModalProps {
  isOpen: boolean;
  worker: Worker | null;
  advances: WorkerAdvance[];
  salaries: WorkerSalaryPayout[];
  attendance: AttendanceRecord[];
  onConfirmDelete: (workerId: string) => void;
  onDeactivate: (workerId: string) => void;
  onClose: () => void;
  isProcessing?: boolean;
}

export default function SafeDeleteModal({
  isOpen,
  worker,
  advances,
  salaries,
  attendance,
  onConfirmDelete,
  onDeactivate,
  onClose,
  isProcessing = false
}: SafeDeleteModalProps) {
  if (!isOpen || !worker) return null;

  // Calculate worker history
  const workerAdvances = advances.filter(a => a.workerId === worker.id);
  const outstandingAdvances = workerAdvances.filter(a => !a.repaid);
  const outstandingSum = outstandingAdvances.reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
  const repaidAdvances = workerAdvances.filter(a => a.repaid);
  const workerSalaries = salaries.filter(s => s.workerId === worker.id);
  const workerAttendance = attendance.filter(r => r.workerId === worker.id);

  const hasOutstandingAdvance = outstandingSum > 0;
  const hasHistoricalFinance = workerSalaries.length > 0 || repaidAdvances.length > 0;
  const canDeleteSafely = !hasOutstandingAdvance && !hasHistoricalFinance;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/60 backdrop-blur-xs font-sans animate-fade-in">
      <div 
        className="fixed inset-0" 
        onClick={onClose} 
      />

      <div className="relative bg-white w-full max-w-lg rounded-3xl border border-light shadow-2xl overflow-hidden z-10 animate-scale-up">
        {/* Header */}
        <div className={`p-5 flex items-start gap-4 border-b ${
          hasOutstandingAdvance 
            ? "bg-rose-50 border-rose-100" 
            : hasHistoricalFinance 
              ? "bg-amber-50 border-amber-100" 
              : "bg-rose-50 border-rose-100"
        }`}>
          <div className={`p-2.5 rounded-2xl border shadow-2xs flex-shrink-0 ${
            hasOutstandingAdvance
              ? "bg-white border-rose-200 text-rose-600"
              : hasHistoricalFinance
                ? "bg-white border-amber-200 text-amber-600"
                : "bg-white border-rose-200 text-rose-600"
          }`}>
            {hasOutstandingAdvance ? (
              <ShieldAlert className="w-6 h-6" />
            ) : hasHistoricalFinance ? (
              <AlertTriangle className="w-6 h-6" />
            ) : (
              <Trash2 className="w-6 h-6" />
            )}
          </div>

          <div className="flex-1 min-w-0 pr-6">
            <h3 className="text-base font-serif font-black text-navy tracking-tight">
              {hasOutstandingAdvance 
                ? "Deletion Blocked: Unpaid Advances" 
                : hasHistoricalFinance 
                  ? "Historical Records Detected" 
                  : "Delete Staff Member Profile?"}
            </h3>
            <p className="text-[10px] uppercase font-bold text-muted-grey mt-0.5">
              Staff Member: <span className="text-navy">{worker.name}</span> ({worker.role})
            </p>
          </div>

          <button
            onClick={onClose}
            className="text-muted-grey hover:text-navy p-1 rounded-full hover:bg-black/5 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-xs text-charcoal leading-relaxed">
          {/* Case 1: Outstanding cash advances */}
          {hasOutstandingAdvance ? (
            <div className="space-y-3">
              <div className="bg-rose-50/80 border border-rose-100 rounded-2xl p-4 space-y-2">
                <p className="font-bold text-rose-950">
                  Cannot delete worker with outstanding financial balance.
                </p>
                <p className="text-rose-800 text-[11px]">
                  <strong>{worker.name}</strong> currently has an active cash advance balance of{" "}
                  <strong className="text-rose-950 font-mono text-sm">₹{outstandingSum}</strong>. Deleting this profile would result in an untracked loss in the shop accounts.
                </p>
              </div>

              <div className="bg-cream/20 border border-light rounded-2xl p-3.5 space-y-1.5 text-[11px]">
                <p className="font-bold text-navy flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-gold" /> Recommended Action:
                </p>
                <p className="text-muted-grey">
                  1. Settle the advance by marking it repaid or deducting it in monthly payroll.<br />
                  2. Or click <strong>"Deactivate Worker"</strong> below to safely archive their profile from active staff lists.
                </p>
              </div>
            </div>
          ) : hasHistoricalFinance ? (
            /* Case 2: Historical Payouts or Settled Advances exist */
            <div className="space-y-3">
              <div className="bg-amber-50/80 border border-amber-100 rounded-2xl p-4 space-y-2">
                <p className="font-bold text-amber-950">
                  This worker has verified accounting ledger history.
                </p>
                <p className="text-amber-900 text-[11px]">
                  Permanently deleting <strong>{worker.name}</strong> would break foreign key audit links in your past salary payouts and cash advance ledgers.
                </p>
              </div>

              {/* Record Summary */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-cream/20 border border-light p-2.5 rounded-xl">
                  <span className="text-[10px] text-muted-grey uppercase font-bold block">Salaries Paid</span>
                  <span className="font-mono font-bold text-navy text-sm">{workerSalaries.length} Records</span>
                </div>
                <div className="bg-cream/20 border border-light p-2.5 rounded-xl">
                  <span className="text-[10px] text-muted-grey uppercase font-bold block">Advances</span>
                  <span className="font-mono font-bold text-navy text-sm">{repaidAdvances.length} Settled</span>
                </div>
                <div className="bg-cream/20 border border-light p-2.5 rounded-xl">
                  <span className="text-[10px] text-muted-grey uppercase font-bold block">Attendance</span>
                  <span className="font-mono font-bold text-navy text-sm">{workerAttendance.length} Logs</span>
                </div>
              </div>

              <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-3.5 text-[11px] text-emerald-950 space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Best Practice: Deactivate Profile
                </p>
                <p className="text-emerald-800">
                  Deactivating sets their status to <em>Inactive</em>, removing them from daily attendance sheets and active payroll while permanently preserving your historical accounts.
                </p>
              </div>
            </div>
          ) : (
            /* Case 3: Safe to delete (No financial records) */
            <div className="space-y-3">
              <p>
                Are you sure you want to permanently delete the profile of <strong>{worker.name}</strong>?
              </p>

              <div className="bg-cream/20 border border-light rounded-2xl p-3.5 space-y-1.5 text-[11px]">
                <p className="font-bold text-navy">The following will be deleted:</p>
                <ul className="list-disc list-inside text-muted-grey space-y-0.5 pl-1">
                  <li>Worker profile and contact details</li>
                  <li>{workerAttendance.length} daily attendance logs (if any)</li>
                </ul>
              </div>

              <p className="text-[11px] text-rose-700 font-medium">
                This action is irreversible and will remove all references from the database.
              </p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-5 border-t border-light/60 bg-cream/10 flex items-center justify-end gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="px-4 py-2 text-xs font-bold text-charcoal hover:bg-cream border border-light rounded-xl transition-all cursor-pointer"
          >
            Cancel
          </button>

          {hasOutstandingAdvance ? (
            <button
              type="button"
              onClick={() => onDeactivate(worker.id)}
              disabled={isProcessing}
              className="px-4 py-2 text-xs font-bold text-white bg-navy hover:bg-navy-hover rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              <UserX className="w-3.5 h-3.5 text-gold" />
              Deactivate Worker Instead
            </button>
          ) : hasHistoricalFinance ? (
            <button
              type="button"
              onClick={() => onDeactivate(worker.id)}
              disabled={isProcessing}
              className="px-5 py-2 text-xs font-bold text-white bg-navy hover:bg-navy-hover rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              <UserX className="w-3.5 h-3.5 text-gold" />
              Deactivate Worker (Safe Archive)
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onConfirmDelete(worker.id)}
              disabled={isProcessing}
              className="px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {isProcessing ? "Deleting..." : "Permanently Delete"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
