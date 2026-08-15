/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Printer, X, Banknote, Calendar, User, ShieldCheck } from "lucide-react";
import { Worker, WorkerSalaryPayout } from "../../types";

interface WorkerSalarySlipModalProps {
  isOpen: boolean;
  payout: WorkerSalaryPayout | null;
  worker: Worker | null;
  onClose: () => void;
}

export default function WorkerSalarySlipModal({
  isOpen,
  payout,
  worker,
  onClose
}: WorkerSalarySlipModalProps) {
  if (!isOpen || !payout || !worker) return null;

  const handlePrint = () => {
    window.print();
  };

  // Convert month YYYY-MM to readable string e.g. "October 2026"
  const getMonthName = (monthStr: string) => {
    try {
      const [year, month] = monthStr.split("-");
      const date = new Date(parseInt(year), parseInt(month) - 1, 1);
      return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    } catch {
      return monthStr;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/60 backdrop-blur-xs font-sans animate-fade-in print:p-0 print:bg-white">
      <div className="fixed inset-0 print:hidden" onClick={onClose} />

      <div className="relative bg-white w-full max-w-2xl rounded-3xl border border-light shadow-2xl overflow-hidden z-10 animate-scale-up max-h-[90vh] flex flex-col print:border-none print:shadow-none print:max-w-none print:rounded-none">
        {/* Top Action Bar (hidden when printing) */}
        <div className="p-4 bg-navy text-white flex justify-between items-center print:hidden border-b border-gold/20">
          <div className="flex items-center gap-2">
            <Banknote className="w-5 h-5 text-gold" />
            <h3 className="font-serif font-bold text-sm tracking-tight text-white">
              Official Salary Payout Voucher & Slip
            </h3>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="bg-gold hover:bg-gold/90 text-navy font-bold text-xs px-3.5 py-1.5 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95"
            >
              <Printer className="w-3.5 h-3.5" />
              Print Slip
            </button>
            <button
              onClick={onClose}
              className="text-gray-300 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Salary Slip Content */}
        <div className="p-8 overflow-y-auto space-y-6 text-xs text-charcoal print:p-6">
          {/* Slip Header */}
          <div className="border-b-2 border-navy pb-4 flex justify-between items-start gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-serif font-black text-xl text-navy tracking-tight">SIGNATURE SUITINGS</span>
                <span className="text-[10px] bg-navy text-gold px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                  Bespoke Tailoring
                </span>
              </div>
              <p className="text-[11px] text-muted-grey mt-0.5">
                Luxury Tailoring & Menswear Studio &bull; Jalandhar, Punjab
              </p>
              <p className="text-[10px] text-muted-grey">Phone: +91 98765 43210 &bull; GSTIN: 03AAAAA0000A1Z5</p>
            </div>

            <div className="text-right">
              <span className="text-xs font-serif font-black text-navy uppercase block">
                MONTHLY SALARY SLIP
              </span>
              <span className="font-mono font-bold text-gold text-sm block">
                {getMonthName(payout.month)}
              </span>
              <span className="text-[10px] text-muted-grey font-mono block mt-0.5">
                Ref: PAY-{payout.id.slice(-6).toUpperCase()}
              </span>
            </div>
          </div>

          {/* Employee & Payout Details Grid */}
          <div className="grid grid-cols-2 gap-4 bg-cream/15 p-4 rounded-2xl border border-light text-xs">
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-navy font-bold">
                <User className="w-3.5 h-3.5 text-gold" /> Employee Information
              </div>
              <p><strong className="text-muted-grey">Name:</strong> <span className="font-bold text-navy">{worker.name}</span></p>
              <p><strong className="text-muted-grey">Designation:</strong> {worker.role}</p>
              <p><strong className="text-muted-grey">Mobile:</strong> {worker.mobileNumber || "N/A"}</p>
              <p><strong className="text-muted-grey">Joining Date:</strong> {worker.joiningDate}</p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-navy font-bold">
                <Calendar className="w-3.5 h-3.5 text-gold" /> Payment Particulars
              </div>
              <p><strong className="text-muted-grey">Payment Date:</strong> <span className="font-mono font-bold">{payout.paymentDate}</span></p>
              <p><strong className="text-muted-grey">Pay Period:</strong> {payout.month}</p>
              <p><strong className="text-muted-grey">Monthly Salary:</strong> ₹{worker.monthlySalary || (worker.dailyWages ? worker.dailyWages * 30 : 18000)}</p>
            </div>
          </div>

          {/* Attendance Breakdown */}
          <div className="space-y-2">
            <h4 className="font-serif font-bold text-navy text-xs uppercase tracking-wider">
              Attendance Summary for {getMonthName(payout.month)}
            </h4>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="bg-emerald-50 border border-emerald-100 p-2.5 rounded-xl">
                <span className="text-[10px] text-emerald-800 font-bold uppercase block">Presents</span>
                <span className="font-mono font-bold text-emerald-950 text-base">{payout.presents} Days</span>
              </div>
              <div className="bg-amber-50 border border-amber-100 p-2.5 rounded-xl">
                <span className="text-[10px] text-amber-800 font-bold uppercase block">Half Days</span>
                <span className="font-mono font-bold text-amber-950 text-base">{payout.halfDays} Days</span>
              </div>
              <div className="bg-blue-50 border border-blue-100 p-2.5 rounded-xl">
                <span className="text-[10px] text-blue-800 font-bold uppercase block">Paid Leaves (Free)</span>
                <span className="font-mono font-bold text-blue-950 text-base">{payout.paidLeavesUsed} Days</span>
              </div>
              <div className="bg-rose-50 border border-rose-100 p-2.5 rounded-xl">
                <span className="text-[10px] text-rose-800 font-bold uppercase block">Absents (Unpaid)</span>
                <span className="font-mono font-bold text-rose-950 text-base">{payout.absents} Days</span>
              </div>
            </div>
          </div>

          {/* Earnings & Deductions Table */}
          <div className="border border-light rounded-2xl overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-navy text-white text-[10px] uppercase tracking-wider font-bold">
                  <th className="py-2.5 px-4">Earnings Component</th>
                  <th className="py-2.5 px-4 text-right">Amount (₹)</th>
                  <th className="py-2.5 px-4">Deductions Component</th>
                  <th className="py-2.5 px-4 text-right">Amount (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-light font-sans text-xs">
                <tr>
                  <td className="py-3 px-4">
                    <p className="font-bold text-navy">Earned Base Wages</p>
                    <span className="text-[10px] text-muted-grey">Based on verified attendance</span>
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-bold">
                    ₹{payout.calculatedSalary}
                  </td>
                  <td className="py-3 px-4">
                    <p className="font-bold text-amber-900">Cash Advance Recovery</p>
                    <span className="text-[10px] text-muted-grey">Adjusted against prior loans</span>
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-amber-700">
                    ₹{payout.advanceDeductions}
                  </td>
                </tr>
                {payout.bonus > 0 && (
                  <tr>
                    <td className="py-3 px-4">
                      <p className="font-bold text-emerald-900">Festive / Performance Bonus</p>
                      <span className="text-[10px] text-muted-grey">Special showroom reward</span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700">
                      +₹{payout.bonus}
                    </td>
                    <td className="py-3 px-4 text-muted-grey">-</td>
                    <td className="py-3 px-4 text-right text-muted-grey font-mono">₹0</td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="bg-cream/40 font-bold border-t-2 border-navy text-navy">
                  <td className="py-3 px-4 font-serif">Gross Earnings</td>
                  <td className="py-3 px-4 text-right font-mono font-bold">
                    ₹{payout.calculatedSalary + payout.bonus}
                  </td>
                  <td className="py-3 px-4 font-serif">Total Deductions</td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-amber-800">
                    ₹{payout.advanceDeductions}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Net Salary Summary Block */}
          <div className="bg-navy text-white p-4 rounded-2xl flex justify-between items-center">
            <div>
              <span className="text-[10px] text-gold uppercase font-bold tracking-wider block">
                Net Disbursed Take-Home Salary
              </span>
              <span className="text-xs text-gray-300">
                {payout.notes || `Disbursed on ${payout.paymentDate}`}
              </span>
            </div>
            <div className="text-right">
              <span className="text-2xl font-serif font-black text-gold font-mono">
                ₹{payout.netPaid.toLocaleString("en-IN")}
              </span>
            </div>
          </div>

          {/* Signatures */}
          <div className="pt-8 grid grid-cols-2 gap-8 text-center text-[11px] text-charcoal">
            <div className="space-y-8">
              <div className="border-b border-dashed border-gray-400 w-40 mx-auto" />
              <p className="font-bold text-navy">
                Worker's Signature / Thumb Impression<br />
                <span className="text-muted-grey font-normal">({worker.name})</span>
              </p>
            </div>

            <div className="space-y-8">
              <div className="border-b border-dashed border-gray-400 w-40 mx-auto" />
              <p className="font-bold text-navy flex items-center justify-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-gold" />
                Authorized Signature & Seal<br />
                <span className="text-muted-grey font-normal">Signature Suitings Studio</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
