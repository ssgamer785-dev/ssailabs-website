/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { 
  X, 
  User, 
  Calendar, 
  Coins, 
  Banknote, 
  Clock, 
  CheckCircle2, 
  Edit, 
  Trash2, 
  Plus, 
  Printer, 
  Phone, 
  MapPin, 
  Briefcase, 
  ChevronRight,
  FileText,
  AlertCircle
} from "lucide-react";
import { 
  Worker, 
  AttendanceRecord, 
  WorkerAdvance, 
  WorkerSalaryPayout 
} from "../../types";
import { stripEmbeddedTags } from "../../db";
import WorkerSalarySlipModal from "./WorkerSalarySlipModal";

interface WorkerDetailModalProps {
  isOpen: boolean;
  worker: Worker | null;
  attendance: AttendanceRecord[];
  advances: WorkerAdvance[];
  salaries: WorkerSalaryPayout[];
  onClose: () => void;
  onEditWorker: (worker: Worker) => void;
  onToggleStatus: (worker: Worker) => void;
  onIssueAdvance: (workerId: string) => void;
  onEditAdvance: (advance: WorkerAdvance) => void;
  onDeleteAdvance: (advance: WorkerAdvance) => void;
  onEditSalary: (salary: WorkerSalaryPayout) => void;
  onDeleteSalary: (salary: WorkerSalaryPayout, workerName: string) => void;
  onEditAttendance: (record: AttendanceRecord) => void;
  onDeleteAttendance: (record: AttendanceRecord) => void;
}

export default function WorkerDetailModal({
  isOpen,
  worker,
  attendance,
  advances,
  salaries,
  onClose,
  onEditWorker,
  onToggleStatus,
  onIssueAdvance,
  onEditAdvance,
  onDeleteAdvance,
  onEditSalary,
  onDeleteSalary,
  onEditAttendance,
  onDeleteAttendance
}: WorkerDetailModalProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "attendance" | "advances" | "salaries">("overview");
  
  // Selected month filter for attendance
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const today = new Date();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    return `${today.getFullYear()}-${mm}`;
  });

  // Selected salary slip to view/print
  const [selectedSlipPayout, setSelectedSlipPayout] = useState<WorkerSalaryPayout | null>(null);

  if (!isOpen || !worker) return null;

  // Filter records for this worker
  const workerAttendance = attendance.filter(r => r.workerId === worker.id);
  const workerAdvances = advances.filter(a => a.workerId === worker.id);
  const workerSalaries = salaries.filter(s => s.workerId === worker.id);

  // Financial calculations
  const totalAdvancesIssued = workerAdvances.reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
  const outstandingAdvances = workerAdvances.filter(a => !a.repaid);
  const totalOutstanding = outstandingAdvances.reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
  const totalRepaid = totalAdvancesIssued - totalOutstanding;
  const totalLifetimeSalaryPaid = workerSalaries.reduce((sum, s) => sum + (Number(s.netPaid) || 0), 0);

  // Attendance for selected month
  const monthAttendance = workerAttendance.filter(r => r.date.startsWith(selectedMonth));
  const presentsCount = monthAttendance.filter(r => r.status === "Present" || r.status === "Checked In" || r.status === "Checked Out").length;
  const halfDaysCount = monthAttendance.filter(r => r.status === "Half Day").length;
  const paidLeavesCount = monthAttendance.filter(r => r.status === "Paid Leave").length;
  const absentsCount = monthAttendance.filter(r => r.status === "Absent").length;
  const totalHoursMonth = monthAttendance.reduce((sum, r) => sum + (Number(r.totalHours) || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/60 backdrop-blur-xs font-sans animate-fade-in">
      <div className="fixed inset-0" onClick={onClose} />

      <div className="relative bg-white w-full max-w-4xl rounded-3xl border border-light shadow-2xl overflow-hidden z-10 animate-scale-up max-h-[90vh] flex flex-col">
        {/* Header Hero */}
        <div className="bg-navy text-white px-6 py-5 border-b border-gold/20 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-4">
            {/* Worker Avatar */}
            <div className="w-14 h-14 rounded-2xl overflow-hidden border-2 border-gold/40 shadow-sm flex-shrink-0 bg-white flex items-center justify-center">
              {worker.photoUrl ? (
                <img 
                  src={worker.photoUrl} 
                  alt={worker.name} 
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-cream text-navy font-serif font-bold text-lg flex items-center justify-center">
                  {worker.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="font-serif font-black text-gold text-lg tracking-tight">
                  {worker.name}
                </h3>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                  worker.active 
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" 
                    : "bg-rose-500/20 text-rose-300 border-rose-500/40"
                }`}>
                  {worker.active ? "Active Staff" : "Inactive / Archived"}
                </span>
              </div>
              <p className="text-xs text-gray-300 font-sans mt-0.5 flex items-center gap-2">
                <span className="text-white font-medium">{worker.role}</span>
                &bull;
                <span>Joined {worker.joiningDate}</span>
              </p>
            </div>
          </div>

          {/* Quick Header Actions */}
          <div className="flex items-center gap-2 self-end sm:self-center">
            <button
              onClick={() => onEditWorker(worker)}
              className="bg-white/10 hover:bg-white/20 text-white text-xs font-bold px-3 py-1.5 rounded-xl border border-white/20 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Edit className="w-3.5 h-3.5 text-gold" />
              Edit
            </button>
            <button
              onClick={() => onIssueAdvance(worker.id)}
              className="bg-gold hover:bg-gold/90 text-navy font-bold text-xs px-3.5 py-1.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 shadow-xs"
            >
              <Coins className="w-3.5 h-3.5" />
              Give Advance
            </button>
            <button 
              onClick={onClose}
              className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Sub-Navigation Tabs */}
        <div className="border-b border-light bg-cream/15 px-6 flex gap-2 overflow-x-auto scrollbar-none">
          {[
            { id: "overview", label: "Overview & Profile", icon: User },
            { id: "attendance", label: `Attendance (${workerAttendance.length})`, icon: Calendar },
            { id: "advances", label: `Advances & Loans (${workerAdvances.length})`, icon: Coins },
            { id: "salaries", label: `Salary History (${workerSalaries.length})`, icon: Banknote },
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 py-3 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                  isActive 
                    ? "border-gold text-navy font-serif" 
                    : "border-transparent text-muted-grey hover:text-navy hover:border-light"
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? "text-gold" : "text-muted-grey"}`} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Modal Body Container */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs text-charcoal">
          
          {/* TAB 1: OVERVIEW */}
          {activeTab === "overview" && (
            <div className="space-y-6 animate-fade-in">
              {/* Financial Snapshot Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                <div className="bg-cream/20 border border-light p-3.5 rounded-2xl">
                  <span className="text-[10px] uppercase font-bold text-muted-grey block">Monthly Salary</span>
                  <span className="text-base font-serif font-black text-navy font-mono">
                    ₹{worker.monthlySalary || (worker.dailyWages ? worker.dailyWages * 30 : 18000)}
                  </span>
                  <span className="text-[10px] text-muted-grey block mt-0.5">Fixed Monthly Package</span>
                </div>

                <div className="bg-amber-50/70 border border-amber-100 p-3.5 rounded-2xl">
                  <span className="text-[10px] uppercase font-bold text-amber-800 block">Pending Advance</span>
                  <span className="text-base font-serif font-black text-amber-950 font-mono">
                    ₹{totalOutstanding}
                  </span>
                  <span className="text-[10px] text-amber-700 block mt-0.5">{outstandingAdvances.length} Active loan(s)</span>
                </div>

                <div className="bg-emerald-50/70 border border-emerald-100 p-3.5 rounded-2xl">
                  <span className="text-[10px] uppercase font-bold text-emerald-800 block">Repaid Advances</span>
                  <span className="text-base font-serif font-black text-emerald-950 font-mono">
                    ₹{totalRepaid}
                  </span>
                  <span className="text-[10px] text-emerald-700 block mt-0.5">Deducted from payroll</span>
                </div>

                <div className="bg-navy/5 border border-navy/10 p-3.5 rounded-2xl">
                  <span className="text-[10px] uppercase font-bold text-navy block">Lifetime Wages</span>
                  <span className="text-base font-serif font-black text-navy font-mono">
                    ₹{totalLifetimeSalaryPaid}
                  </span>
                  <span className="text-[10px] text-muted-grey block mt-0.5">{workerSalaries.length} Payouts disbursed</span>
                </div>
              </div>

              {/* Bio & Details Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white border border-light rounded-2xl p-4 space-y-3">
                  <h4 className="font-serif font-bold text-navy text-xs uppercase tracking-wider flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-gold" /> Employee Contact Particulars
                  </h4>
                  <div className="space-y-2 text-xs divide-y divide-light/60">
                    <div className="flex justify-between py-1">
                      <span className="text-muted-grey">Full Name:</span>
                      <span className="font-bold text-navy">{worker.name}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-muted-grey">Phone / Mobile:</span>
                      <span className="font-bold font-mono text-navy">{worker.mobileNumber || "Not recorded"}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-muted-grey">Designation:</span>
                      <span className="font-medium text-navy">{worker.role}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-muted-grey">Joining Date:</span>
                      <span className="font-mono text-navy">{worker.joiningDate}</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-muted-grey">Residential Address:</span>
                      <span className="font-medium text-navy text-right max-w-[200px]">{worker.address || "Jalandhar, Punjab"}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-light rounded-2xl p-4 space-y-3 flex flex-col justify-between">
                  <div>
                    <h4 className="font-serif font-bold text-navy text-xs uppercase tracking-wider flex items-center gap-1.5 mb-2">
                      <Briefcase className="w-3.5 h-3.5 text-gold" /> Status & Controls
                    </h4>
                    <p className="text-muted-grey text-xs leading-relaxed">
                      Manage this worker's daily roster participation. Inactive profiles remain stored forever for accurate accounting, trial, and alteration audit trails.
                    </p>
                  </div>

                  <div className="p-3 bg-cream/15 rounded-xl border border-light flex items-center justify-between">
                    <div>
                      <span className="font-bold text-navy text-xs block">Current Status</span>
                      <span className="text-[10px] text-muted-grey">
                        {worker.active ? "Appears in live attendance & payroll" : "Archived from daily punching"}
                      </span>
                    </div>
                    <button
                      onClick={() => onToggleStatus(worker)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        worker.active 
                          ? "bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200" 
                          : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                      }`}
                    >
                      {worker.active ? "Deactivate" : "Activate"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: ATTENDANCE HISTORY */}
          {activeTab === "attendance" && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-cream/15 p-3.5 rounded-2xl border border-light">
                <div>
                  <span className="font-serif font-bold text-navy text-xs block">Monthly Attendance Filter</span>
                  <span className="text-[10px] text-muted-grey">Review daily check-in, checkout, and free leaves history</span>
                </div>
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="border border-light rounded-xl px-3 py-1.5 text-xs font-bold text-navy focus:outline-none focus:border-gold bg-white"
                />
              </div>

              {/* Monthly Stats */}
              <div className="grid grid-cols-5 gap-2 text-center">
                <div className="bg-emerald-50 border border-emerald-100 p-2.5 rounded-xl">
                  <span className="text-[10px] text-emerald-800 uppercase font-bold block">Presents</span>
                  <span className="font-mono font-bold text-emerald-950 text-base">{presentsCount}</span>
                </div>
                <div className="bg-amber-50 border border-amber-100 p-2.5 rounded-xl">
                  <span className="text-[10px] text-amber-800 uppercase font-bold block">Half Days</span>
                  <span className="font-mono font-bold text-amber-950 text-base">{halfDaysCount}</span>
                </div>
                <div className="bg-blue-50 border border-blue-100 p-2.5 rounded-xl">
                  <span className="text-[10px] text-blue-800 uppercase font-bold block">Paid Leaves</span>
                  <span className="font-mono font-bold text-blue-950 text-base">{paidLeavesCount}</span>
                </div>
                <div className="bg-rose-50 border border-rose-100 p-2.5 rounded-xl">
                  <span className="text-[10px] text-rose-800 uppercase font-bold block">Absents</span>
                  <span className="font-mono font-bold text-rose-950 text-base">{absentsCount}</span>
                </div>
                <div className="bg-navy/5 border border-navy/10 p-2.5 rounded-xl">
                  <span className="text-[10px] text-navy uppercase font-bold block">Hours</span>
                  <span className="font-mono font-bold text-navy text-base">{totalHoursMonth.toFixed(1)}h</span>
                </div>
              </div>

              {/* Attendance Table */}
              <div className="border border-light rounded-2xl overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-navy text-white text-[10px] uppercase font-bold tracking-wider">
                      <th className="py-2.5 px-3.5">Date</th>
                      <th className="py-2.5 px-3.5">Status</th>
                      <th className="py-2.5 px-3.5">Punch In / Out</th>
                      <th className="py-2.5 px-3.5">Hours</th>
                      <th className="py-2.5 px-3.5">Remarks</th>
                      <th className="py-2.5 px-3.5 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-light font-sans text-xs">
                    {monthAttendance.sort((a,b) => b.date.localeCompare(a.date)).map((r) => {
                      let statusBadge = "bg-emerald-50 text-emerald-800 border-emerald-100";
                      if (r.status === "Half Day") statusBadge = "bg-amber-50 text-amber-800 border-amber-100";
                      if (r.status === "Paid Leave") statusBadge = "bg-blue-50 text-blue-800 border-blue-100";
                      if (r.status === "Absent") statusBadge = "bg-rose-50 text-rose-800 border-rose-100";

                      return (
                        <tr key={r.id} className="hover:bg-cream/10">
                          <td className="py-2.5 px-3.5 font-mono font-bold text-navy">{r.date}</td>
                          <td className="py-2.5 px-3.5">
                            <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold ${statusBadge}`}>
                              {r.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-3.5 font-mono text-[11px] text-muted-grey">
                            {r.checkInTime ? new Date(r.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "-"}
                            {" → "}
                            {r.checkOutTime ? new Date(r.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "-"}
                          </td>
                          <td className="py-2.5 px-3.5 font-mono font-semibold">
                            {r.totalHours ? `${r.totalHours} hrs` : "-"}
                          </td>
                          <td className="py-2.5 px-3.5 text-muted-grey italic">
                            {stripEmbeddedTags(r.notes) || "-"}
                          </td>
                          <td className="py-2.5 px-3.5 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => onEditAttendance(r)}
                                className="p-1 text-navy hover:bg-cream/40 rounded-lg cursor-pointer"
                                title="Edit log"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => onDeleteAttendance(r)}
                                className="p-1 text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                                title="Delete log"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {monthAttendance.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-muted-grey">
                          No attendance records found for {selectedMonth}.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: ADVANCES & LOANS */}
          {activeTab === "advances" && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex justify-between items-center bg-cream/15 p-3.5 rounded-2xl border border-light">
                <div>
                  <span className="font-serif font-bold text-navy text-xs block">Cash Advances & Loan Ledger</span>
                  <span className="text-[10px] text-muted-grey">
                    Outstanding: <strong className="text-amber-800 font-mono">₹{totalOutstanding}</strong> &bull; Total Settled: <strong className="text-emerald-800 font-mono">₹{totalRepaid}</strong>
                  </span>
                </div>
                <button
                  onClick={() => onIssueAdvance(worker.id)}
                  className="bg-navy hover:bg-navy-hover text-white text-xs font-bold px-3.5 py-1.5 rounded-xl flex items-center gap-1 cursor-pointer active:scale-95 transition-all shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5 text-gold" />
                  Give Advance
                </button>
              </div>

              <div className="border border-light rounded-2xl overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-navy text-white text-[10px] uppercase font-bold tracking-wider">
                      <th className="py-2.5 px-3.5">Date Given</th>
                      <th className="py-2.5 px-3.5 text-right">Amount</th>
                      <th className="py-2.5 px-3.5">Purpose / Memo</th>
                      <th className="py-2.5 px-3.5 text-center">Status</th>
                      <th className="py-2.5 px-3.5 text-center">Settled On</th>
                      <th className="py-2.5 px-3.5 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-light font-sans text-xs">
                    {workerAdvances.sort((a,b) => b.date.localeCompare(a.date)).map((adv) => (
                      <tr key={adv.id} className="hover:bg-cream/10">
                        <td className="py-2.5 px-3.5 font-mono">{adv.date}</td>
                        <td className="py-2.5 px-3.5 text-right font-mono font-bold text-navy">
                          ₹{adv.amount}
                        </td>
                        <td className="py-2.5 px-3.5 text-muted-grey italic">
                          {stripEmbeddedTags(adv.notes) || "Personal advance"}
                        </td>
                        <td className="py-2.5 px-3.5 text-center">
                          <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold ${
                            adv.repaid 
                              ? "bg-emerald-50 text-emerald-800 border-emerald-100" 
                              : "bg-amber-50 text-amber-800 border-amber-100"
                          }`}>
                            {adv.repaid ? "Settled" : "Outstanding"}
                          </span>
                        </td>
                        <td className="py-2.5 px-3.5 text-center font-mono text-muted-grey text-[11px]">
                          {adv.repayDate || (adv.repaid ? "Salary Payout" : "-")}
                        </td>
                        <td className="py-2.5 px-3.5 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => onEditAdvance(adv)}
                              className="p-1 text-navy hover:bg-cream/40 rounded-lg cursor-pointer"
                              title="Edit advance"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => onDeleteAdvance(adv)}
                              className="p-1 text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                              title="Delete advance"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {workerAdvances.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-muted-grey">
                          No cash advances or loans recorded for {worker.name}.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: SALARY & PAYROLL HISTORY */}
          {activeTab === "salaries" && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex justify-between items-center bg-cream/15 p-3.5 rounded-2xl border border-light">
                <div>
                  <span className="font-serif font-bold text-navy text-xs block">Processed Salary Disbursal History</span>
                  <span className="text-[10px] text-muted-grey">
                    Lifetime wages disbursed: <strong className="text-navy font-mono font-bold">₹{totalLifetimeSalaryPaid}</strong>
                  </span>
                </div>
              </div>

              <div className="border border-light rounded-2xl overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-navy text-white text-[10px] uppercase font-bold tracking-wider">
                      <th className="py-2.5 px-3.5">Disbursed Date</th>
                      <th className="py-2.5 px-3.5">Month</th>
                      <th className="py-2.5 px-3.5 text-right">Base</th>
                      <th className="py-2.5 px-3.5 text-right">Advance Ded.</th>
                      <th className="py-2.5 px-3.5 text-right">Bonus</th>
                      <th className="py-2.5 px-3.5 text-right">Net Paid</th>
                      <th className="py-2.5 px-3.5 text-center">Slip / Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-light font-sans text-xs">
                    {workerSalaries.sort((a,b) => b.paymentDate.localeCompare(a.paymentDate)).map((p) => (
                      <tr key={p.id} className="hover:bg-cream/10">
                        <td className="py-2.5 px-3.5 font-mono">{p.paymentDate}</td>
                        <td className="py-2.5 px-3.5 font-bold text-navy">{p.month}</td>
                        <td className="py-2.5 px-3.5 text-right font-mono">₹{p.calculatedSalary}</td>
                        <td className="py-2.5 px-3.5 text-right font-mono text-amber-700">-₹{p.advanceDeductions}</td>
                        <td className="py-2.5 px-3.5 text-right font-mono text-emerald-700">+₹{p.bonus}</td>
                        <td className="py-2.5 px-3.5 text-right font-mono font-bold text-navy text-sm">
                          ₹{p.netPaid}
                        </td>
                        <td className="py-2.5 px-3.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => setSelectedSlipPayout(p)}
                              className="bg-navy hover:bg-navy-hover text-white text-[10px] font-bold px-2.5 py-1 rounded-lg flex items-center gap-1 cursor-pointer transition-all shadow-2xs"
                              title="View and print salary slip"
                            >
                              <Printer className="w-3 h-3 text-gold" />
                              Pay Slip
                            </button>
                            <button
                              onClick={() => onEditSalary(p)}
                              className="p-1 text-navy hover:bg-cream/40 rounded-lg cursor-pointer"
                              title="Edit salary payout"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => onDeleteSalary(p, worker.name)}
                              className="p-1 text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                              title="Revert & delete salary payout"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {workerSalaries.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-muted-grey">
                          No monthly salaries disbursed to {worker.name} yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-light bg-cream/10 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold text-charcoal hover:bg-cream border border-light rounded-xl transition-all cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>

      {/* Salary Slip Modal */}
      {selectedSlipPayout && (
        <WorkerSalarySlipModal
          isOpen={!!selectedSlipPayout}
          payout={selectedSlipPayout}
          worker={worker}
          onClose={() => setSelectedSlipPayout(null)}
        />
      )}
    </div>
  );
}
