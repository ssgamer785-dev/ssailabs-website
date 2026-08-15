/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from "react";
import { 
  Users, 
  Calendar, 
  Plus, 
  Coins, 
  Banknote, 
  UserCheck, 
  Search, 
  Edit, 
  Check, 
  Trash2, 
  AlertCircle, 
  Info, 
  ChevronRight, 
  CheckCircle,
  FileText,
  DollarSign,
  Camera,
  LayoutGrid,
  List,
  Filter,
  ArrowUpDown,
  UserX,
  Printer,
  Clock,
  Sparkles
} from "lucide-react";
import { db, stripEmbeddedTags } from "../db";
import { 
  Worker, 
  AttendanceStatus, 
  AttendanceRecord, 
  WorkerAdvance, 
  WorkerSalaryPayout 
} from "../types";
import ConfirmModal from "./ConfirmModal";
import WorkerModal from "./workers/WorkerModal";
import WorkerDetailModal from "./workers/WorkerDetailModal";
import WorkerSalarySlipModal from "./workers/WorkerSalarySlipModal";
import SafeDeleteModal from "./workers/SafeDeleteModal";
import SimpleAttendanceView from "./workers/SimpleAttendanceView";

export default function WorkersView() {
  // Navigation Tabs
  const [activeTab, setActiveTab] = useState<"roster" | "attendance" | "salary-calculator" | "advances">("roster");

  // Database States
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [advances, setAdvances] = useState<WorkerAdvance[]>([]);
  const [payouts, setPayouts] = useState<WorkerSalaryPayout[]>([]);

  // Selected Month (YYYY-MM)
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const today = new Date();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    return `${today.getFullYear()}-${mm}`;
  });

  // Selected Date for attendance register (YYYY-MM-DD)
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return new Date().toISOString().split("T")[0];
  });

  // Roster Filter / Search / View Modes
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("active");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"name" | "salary_desc" | "joining_desc" | "advance_desc">("name");
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");

  // Advances Filter
  const [advanceStatusFilter, setAdvanceStatusFilter] = useState<"all" | "pending" | "repaid">("all");
  const [advanceSearchTerm, setAdvanceSearchTerm] = useState("");

  // Modals States
  const [showAddWorkerModal, setShowAddWorkerModal] = useState(false);
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null);
  const [selectedDetailWorker, setSelectedDetailWorker] = useState<Worker | null>(null);
  const [workerToDelete, setWorkerToDelete] = useState<Worker | null>(null);
  const [selectedSlipPayout, setSelectedSlipPayout] = useState<WorkerSalaryPayout | null>(null);

  // Advance Modals
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [editingAdvance, setEditingAdvance] = useState<WorkerAdvance | null>(null);
  const [newAdvance, setNewAdvance] = useState({
    workerId: "",
    amount: 1000,
    date: new Date().toISOString().split("T")[0],
    notes: ""
  });
  const [deleteAdvanceConfirmation, setDeleteAdvanceConfirmation] = useState<{
    isOpen: boolean;
    advanceId: string;
    workerName: string;
    amount: number;
  }>({
    isOpen: false,
    advanceId: "",
    workerName: "",
    amount: 0
  });

  // Salary Modals
  const [editingSalary, setEditingSalary] = useState<WorkerSalaryPayout | null>(null);
  const [showEditSalaryModal, setShowEditSalaryModal] = useState(false);
  const [deletePayoutConfirmation, setDeletePayoutConfirmation] = useState<{
    isOpen: boolean;
    payoutId: string;
    payoutWorkerName: string;
    payoutMonth: string;
  }>({
    isOpen: false,
    payoutId: "",
    payoutWorkerName: "",
    payoutMonth: ""
  });

  // Attendance Modals
  const [editingAttendanceRecord, setEditingAttendanceRecord] = useState<AttendanceRecord | null>(null);
  const [showEditAttendanceModal, setShowEditAttendanceModal] = useState(false);
  const [deleteAttendanceConfirmation, setDeleteAttendanceConfirmation] = useState<{
    isOpen: boolean;
    attendanceId: string;
    workerName: string;
    date: string;
  }>({
    isOpen: false,
    attendanceId: "",
    workerName: "",
    date: ""
  });

  const [showDeleteAllWorkersConfirmation, setShowDeleteAllWorkersConfirmation] = useState(false);
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  // User notifications & feedback
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Dynamic calculations for salary calculator
  const [payrollDrafts, setPayrollDrafts] = useState<{
    [workerId: string]: {
      presents: number;
      halfDays: number;
      absents: number;
      paidLeavesUsed: number;
      excessLeavesDeducted: number;
      grossSalary: number;
      pendingAdvance: number;
      deductAdvance: number;
      bonus: number;
      netPayable: number;
      notes: string;
      alreadyPaid: boolean;
      totalHoursWorked: number;
    }
  }>({});

  // Reload data from database single source of truth
  const reloadData = () => {
    setWorkers(db.getWorkers());
    setAttendance(db.getAttendance());
    setAdvances(db.getAdvances());
    setPayouts(db.getSalaryPayouts());
  };

  useEffect(() => {
    reloadData();
    return db.onSync(reloadData);
  }, []);

  // Sync payroll calculations whenever month, workers, attendance, advances, or payouts change
  useEffect(() => {
    const activeWorkers = db.getActiveWorkers();
    const draft: typeof payrollDrafts = {};

    activeWorkers.forEach(w => {
      const monthRecords = attendance.filter(r => r.workerId === w.id && r.date.startsWith(selectedMonth));
      
      let presents = 0;
      let halfDays = 0;
      let absents = 0;
      let paidLeavesUsed = 0;
      let totalHoursWorked = 0;

      monthRecords.forEach(r => {
        if (r.status === "Present" || r.status === "Checked In" || r.status === "Checked Out") {
          presents++;
          if (r.totalHours) {
            totalHoursWorked += r.totalHours;
          }
        } else if (r.status === "Half Day") {
          halfDays++;
        } else if (r.status === "Absent") {
          absents++;
        } else if (r.status === "Paid Leave") {
          paidLeavesUsed++;
        }
      });

      // 2 Paid Leaves Free Allowance Policy:
      // If employee took paid leaves, allow up to 2 free without salary deduction.
      const freeLeavesToUse = Math.min(2, paidLeavesUsed);
      const excessLeavesDeducted = Math.max(0, paidLeavesUsed - 2);

      // Total days counted for salary:
      const totalPaidDays = presents + (halfDays * 0.5) + freeLeavesToUse;

      const monthlySalary = w.monthlySalary || (w.dailyWages ? w.dailyWages * 30 : 18000);

      // Compute Gross Salary
      let grossSalary = Math.round((totalPaidDays / 30) * monthlySalary);
      if (grossSalary > monthlySalary) grossSalary = monthlySalary;

      // Pending Advances
      const pendingAdvances = advances
        .filter(a => a.workerId === w.id && !a.repaid)
        .reduce((sum, a) => sum + (Number(a.amount) || 0), 0);

      const deductAdvance = Math.min(pendingAdvances, Math.round(grossSalary * 0.5)); // Default suggest 50% or full pending

      // Check if already paid for this month
      const monthPayouts = payouts.filter(p => p.workerId === w.id && p.month === selectedMonth);
      const alreadyPaid = monthPayouts.length > 0;

      draft[w.id] = {
        presents,
        halfDays,
        absents,
        paidLeavesUsed,
        excessLeavesDeducted,
        grossSalary,
        pendingAdvance: pendingAdvances,
        deductAdvance: alreadyPaid ? 0 : deductAdvance,
        bonus: 0,
        netPayable: Math.max(0, grossSalary - (alreadyPaid ? 0 : deductAdvance)),
        notes: alreadyPaid ? `Salary already disbursed on ${monthPayouts[0].paymentDate}` : "",
        alreadyPaid,
        totalHoursWorked: Number(totalHoursWorked.toFixed(2))
      };
    });

    setPayrollDrafts(draft);
  }, [selectedMonth, workers, attendance, advances, payouts]);

  // Handle Photo change directly from card avatar
  const handleDirectWorkerPhotoChange = (workerId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        setErrorMessage("Photo size exceeds 2MB limit. Please choose a smaller image.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        db.updateWorker(workerId, { photoUrl: base64String });
        reloadData();
        setSuccessMessage("Worker photo updated successfully! ✓");
        setTimeout(() => setSuccessMessage(null), 3000);
      };
      reader.readAsDataURL(file);
    }
  };

  // Add / Edit Worker Action
  const handleSaveWorker = async (workerPayload: {
    name: string;
    mobileNumber: string;
    address: string;
    role: string;
    monthlySalary: number;
    dailyWages?: number;
    active: boolean;
    joiningDate: string;
    photoUrl?: string;
  }) => {
    try {
      setIsProcessingAction(true);
      setErrorMessage(null);

      if (editingWorker) {
        // Edit must UPDATE the existing Supabase worker record preserving its ID
        db.updateWorker(editingWorker.id, workerPayload);
        setSuccessMessage(`Profile for ${workerPayload.name} updated successfully! ✓`);
      } else {
        // Add creates a new record
        db.addWorker(workerPayload);
        setSuccessMessage(`New staff member ${workerPayload.name} hired successfully! ✓`);
      }

      await db.supabaseQueue;
      setShowAddWorkerModal(false);
      setEditingWorker(null);
      reloadData();
      setTimeout(() => setSuccessMessage(null), 3500);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to save staff profile.");
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Toggle Active Status
  const handleToggleWorkerStatus = async (worker: Worker) => {
    try {
      db.updateWorker(worker.id, { active: !worker.active });
      await db.supabaseQueue;
      reloadData();
      setSuccessMessage(`${worker.name} is now ${!worker.active ? "Active" : "Inactive"}. ✓`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to update worker status.");
    }
  };

  // Permanent Delete Confirm Action
  const handleConfirmDeleteWorker = async (workerId: string) => {
    try {
      setIsProcessingAction(true);
      db.deleteWorker(workerId);
      await db.supabaseQueue;
      setWorkerToDelete(null);
      if (selectedDetailWorker?.id === workerId) {
        setSelectedDetailWorker(null);
      }
      reloadData();
      setSuccessMessage("Worker profile deleted permanently. ✓");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setErrorMessage(err.message || "Could not delete worker.");
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Safe Deactivation Action
  const handleDeactivateWorker = async (workerId: string) => {
    try {
      setIsProcessingAction(true);
      db.updateWorker(workerId, { active: false });
      await db.supabaseQueue;
      setWorkerToDelete(null);
      reloadData();
      setSuccessMessage("Worker deactivated successfully to protect historical ledgers. ✓");
      setTimeout(() => setSuccessMessage(null), 3500);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to deactivate worker.");
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Delete All Workers Action
  const handleConfirmDeleteAllWorkers = async () => {
    try {
      setIsProcessingAction(true);
      setShowDeleteAllWorkersConfirmation(false);
      db.clearAllWorkers();
      await db.supabaseQueue;
      setSelectedDetailWorker(null);
      setWorkerToDelete(null);
      reloadData();
      setSuccessMessage("All workers, attendance logs, advances, and payroll records have been deleted permanently. ✓");
      setTimeout(() => setSuccessMessage(null), 3500);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to delete all workers.");
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Advance Salary Submit Action
  const handleAddAdvanceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdvance.workerId || newAdvance.amount <= 0) return;

    try {
      setIsProcessingAction(true);
      if (editingAdvance) {
        db.updateAdvance(editingAdvance.id, {
          workerId: newAdvance.workerId,
          amount: Number(newAdvance.amount),
          date: newAdvance.date,
          notes: newAdvance.notes
        });
        setEditingAdvance(null);
        setSuccessMessage("Staff cash advance updated successfully! ✓");
      } else {
        db.addAdvance({
          workerId: newAdvance.workerId,
          amount: Number(newAdvance.amount),
          date: newAdvance.date,
          notes: newAdvance.notes
        });
        setSuccessMessage("Staff advance salary logged and debited as expense successfully! ✓");
      }
      await db.supabaseQueue;

      setNewAdvance({
        workerId: "",
        amount: 1000,
        date: new Date().toISOString().split("T")[0],
        notes: ""
      });
      setShowAdvanceModal(false);
      reloadData();
      setTimeout(() => setSuccessMessage(null), 3500);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to save advance.");
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Process Salary Payout Action
  const handleProcessPayout = async (workerId: string) => {
    const draft = payrollDrafts[workerId];
    if (!draft || draft.alreadyPaid) return;

    const worker = workers.find(w => w.id === workerId);
    if (!worker) return;

    try {
      setIsProcessingAction(true);
      db.addSalaryPayout({
        workerId,
        month: selectedMonth,
        calculatedSalary: draft.grossSalary,
        presents: draft.presents,
        halfDays: draft.halfDays,
        absents: draft.absents,
        paidLeavesUsed: draft.paidLeavesUsed,
        advanceDeductions: draft.deductAdvance,
        bonus: draft.bonus,
        netPaid: draft.netPayable + draft.bonus,
        paymentDate: new Date().toISOString().split("T")[0],
        notes: draft.notes || `Monthly salary for ${selectedMonth}`
      });
      await db.supabaseQueue;
      reloadData();
      setSuccessMessage(`Salary payout processed successfully for ${worker.name}! ₹${draft.netPayable + draft.bonus} recorded under showroom ledger. ✓`);
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to process salary payout.");
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Update Dynamic Bonus/Deduction in State
  const handleDraftFieldChange = (workerId: string, field: "deductAdvance" | "bonus" | "notes", value: any) => {
    setPayrollDrafts(prev => {
      const current = prev[workerId];
      if (!current) return prev;

      let deductAdvance = current.deductAdvance;
      let bonus = current.bonus;
      let notes = current.notes;

      if (field === "deductAdvance") deductAdvance = Math.min(Number(value), current.pendingAdvance);
      if (field === "bonus") bonus = Math.max(0, Number(value));
      if (field === "notes") notes = String(value);

      const netPayable = Math.max(0, current.grossSalary - deductAdvance);

      return {
        ...prev,
        [workerId]: {
          ...current,
          deductAdvance,
          bonus,
          notes,
          netPayable
        }
      };
    });
  };

  // Distinct roles for filter
  const distinctRoles = useMemo(() => {
    const set = new Set(workers.map(w => w.role).filter(Boolean));
    return Array.from(set);
  }, [workers]);

  // Filtered & Sorted Workers
  const filteredWorkers = useMemo(() => {
    return workers
      .filter(w => {
        // Status filter
        if (statusFilter === "active" && !w.active) return false;
        if (statusFilter === "inactive" && w.active) return false;
        
        // Role filter
        if (roleFilter !== "all" && w.role !== roleFilter) return false;

        // Search term (name, mobile, address, role)
        if (searchTerm.trim()) {
          const q = searchTerm.toLowerCase();
          const matchName = w.name.toLowerCase().includes(q);
          const matchMobile = w.mobileNumber && w.mobileNumber.includes(q);
          const matchRole = w.role.toLowerCase().includes(q);
          const matchAddress = w.address && w.address.toLowerCase().includes(q);
          return matchName || matchMobile || matchRole || matchAddress;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === "name") return a.name.localeCompare(b.name);
        if (sortBy === "salary_desc") {
          const salA = a.monthlySalary || (a.dailyWages * 30) || 0;
          const salB = b.monthlySalary || (b.dailyWages * 30) || 0;
          return salB - salA;
        }
        if (sortBy === "joining_desc") return b.joiningDate.localeCompare(a.joiningDate);
        if (sortBy === "advance_desc") {
          const advA = advances.filter(x => x.workerId === a.id && !x.repaid).reduce((s, x) => s + x.amount, 0);
          const advB = advances.filter(x => x.workerId === b.id && !x.repaid).reduce((s, x) => s + x.amount, 0);
          return advB - advA;
        }
        return 0;
      });
  }, [workers, statusFilter, roleFilter, searchTerm, sortBy, advances]);

  // Filtered Advances
  const filteredAdvances = useMemo(() => {
    return advances
      .filter(adv => {
        if (advanceStatusFilter === "pending" && adv.repaid) return false;
        if (advanceStatusFilter === "repaid" && !adv.repaid) return false;

        if (advanceSearchTerm.trim()) {
          const worker = workers.find(w => w.id === adv.workerId);
          const wName = worker ? worker.name.toLowerCase() : "";
          const q = advanceSearchTerm.toLowerCase();
          const matchWorker = wName.includes(q);
          const matchNotes = adv.notes ? adv.notes.toLowerCase().includes(q) : false;
          const matchAmount = adv.amount.toString().includes(q);
          return matchWorker || matchNotes || matchAmount;
        }
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [advances, advanceStatusFilter, advanceSearchTerm, workers]);

  return (
    <div className="space-y-6 animate-fade-in pb-16 font-sans">
      
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-3xl border border-light shadow-2xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-navy text-gold flex items-center justify-center font-serif font-black shadow-xs">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-serif text-navy font-black tracking-tight flex items-center gap-2">
                Workforce & Payroll Management
              </h1>
              <p className="text-muted-grey text-xs mt-0.5">
                Manage master cutters, tailoring staff, live biometric attendance, advances, and monthly salary disbursement
              </p>
            </div>
          </div>
        </div>
        
        {/* Rapid Actions */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => {
              setEditingWorker(null);
              setShowAddWorkerModal(true);
            }}
            className="bg-navy hover:bg-navy-hover text-white text-xs font-bold px-4 py-2.5 rounded-xl border border-navy shadow-sm transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
          >
            <Plus className="w-4 h-4 text-gold" />
            Hire New Worker
          </button>

          <button
            onClick={() => {
              setEditingAdvance(null);
              setNewAdvance({
                workerId: workers.filter(w => w.active)[0]?.id || "",
                amount: 1000,
                date: new Date().toISOString().split("T")[0],
                notes: ""
              });
              setShowAdvanceModal(true);
            }}
            className="bg-cream/40 text-navy hover:bg-cream/70 text-xs font-bold px-4 py-2.5 rounded-xl border border-gold/30 shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
          >
            <Coins className="w-4 h-4 text-gold" />
            Issue Advance
          </button>

          {workers.length > 0 && (
            <button
              onClick={() => setShowDeleteAllWorkersConfirmation(true)}
              className="bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold px-4 py-2.5 rounded-xl border border-rose-200 shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
              title="Delete all workers and associated logs"
            >
              <Trash2 className="w-4 h-4 text-rose-600" />
              Delete All Workers
            </button>
          )}
        </div>
      </div>

      {/* Quick Key Performance Indicators (KPI Cards) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-light p-4 rounded-2xl shadow-2xs flex items-center gap-3.5">
          <div className="bg-navy/5 text-navy p-3 rounded-xl">
            <Users className="w-5 h-5 text-navy" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-muted-grey">Total Tailoring Staff</p>
            <p className="text-lg font-serif font-black text-navy">
              {workers.filter(w => w.active).length} <span className="text-xs font-sans font-normal text-muted-grey">Active ({workers.length} Total)</span>
            </p>
          </div>
        </div>

        <div className="bg-white border border-light p-4 rounded-2xl shadow-2xs flex items-center gap-3.5">
          <div className="bg-emerald-50 text-emerald-700 p-3 rounded-xl">
            <UserCheck className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-muted-grey">Today's Attendance</p>
            <p className="text-lg font-serif font-black text-navy">
              {attendance.filter(r => r.date === selectedDate && (r.status === "Present" || r.status === "Half Day" || r.status === "Checked In" || r.status === "Checked Out")).length} Present
            </p>
          </div>
        </div>

        <div className="bg-white border border-light p-4 rounded-2xl shadow-2xs flex items-center gap-3.5">
          <div className="bg-amber-50 text-amber-700 p-3 rounded-xl">
            <Coins className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-muted-grey">Outstanding Advances</p>
            <p className="text-lg font-serif font-black text-navy font-mono">
              ₹{advances.filter(a => !a.repaid).reduce((sum, a) => sum + (Number(a.amount) || 0), 0)}
            </p>
          </div>
        </div>

        <div className="bg-white border border-light p-4 rounded-2xl shadow-2xs flex items-center gap-3.5">
          <div className="bg-cream text-gold p-3 rounded-xl">
            <Banknote className="w-5 h-5 text-gold" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-muted-grey">Monthly Payroll Draft</p>
            <p className="text-lg font-serif font-black text-navy font-mono">
              ₹{Object.values(payrollDrafts).reduce((sum, d: any) => sum + (d.alreadyPaid ? 0 : d.netPayable + d.bonus), 0)}
            </p>
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="border-b border-light flex gap-2 overflow-x-auto scrollbar-none pb-0.5">
        {[
          { id: "roster", label: `Staff Directory (${workers.length})`, icon: Users },
          { id: "attendance", label: "Attendance Sheet", icon: Calendar },
          { id: "salary-calculator", label: "Salary Calculator", icon: Banknote },
          { id: "advances", label: `Staff Advances`, icon: Coins },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-5 py-3 text-xs font-bold transition-all border-b-2 whitespace-nowrap cursor-pointer ${
                isActive 
                  ? "border-gold text-navy font-serif text-sm" 
                  : "border-transparent text-muted-grey hover:text-navy hover:border-light"
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? "text-gold" : "text-muted-grey"}`} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Notification / Feedback Banners */}
      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-100 text-emerald-950 p-4 rounded-2xl flex items-center gap-3 animate-fade-in font-sans">
          <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <span className="text-xs font-bold">{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="bg-rose-50 border border-rose-100 text-rose-950 p-4 rounded-2xl flex items-start gap-3 animate-fade-in font-sans">
          <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="text-xs font-bold text-rose-900 block">Operation Restricted</span>
            <p className="text-xs leading-relaxed text-rose-800">{errorMessage}</p>
          </div>
          <button 
            onClick={() => setErrorMessage(null)} 
            className="ml-auto text-rose-600 hover:text-rose-950 text-xs font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* ======================================================== */}
      {/* SUB-TAB 1: STAFF ROSTER / DIRECTORY                      */}
      {/* ======================================================== */}
      {activeTab === "roster" && (
        <div className="bg-white border border-light rounded-3xl p-6 shadow-sm space-y-6">
          
          {/* Controls Bar: Search, Filters, Sorters, View Mode */}
          <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-4 bg-cream/15 p-4 rounded-2xl border border-light">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-muted-grey absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search staff by name, mobile, role, or address..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-4 py-2 border border-light rounded-xl w-full text-xs focus:outline-none focus:border-gold bg-white"
              />
            </div>

            {/* Filter Chips & Selectors */}
            <div className="flex items-center gap-2.5 flex-wrap">
              {/* Status Filter */}
              <div className="flex items-center bg-white border border-light rounded-xl p-0.5 text-xs font-bold">
                <button
                  onClick={() => setStatusFilter("all")}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                    statusFilter === "all" ? "bg-navy text-gold" : "text-muted-grey hover:text-navy"
                  }`}
                >
                  All ({workers.length})
                </button>
                <button
                  onClick={() => setStatusFilter("active")}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                    statusFilter === "active" ? "bg-navy text-gold" : "text-muted-grey hover:text-navy"
                  }`}
                >
                  Active ({workers.filter(w => w.active).length})
                </button>
                <button
                  onClick={() => setStatusFilter("inactive")}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                    statusFilter === "inactive" ? "bg-navy text-gold" : "text-muted-grey hover:text-navy"
                  }`}
                >
                  Inactive ({workers.filter(w => !w.active).length})
                </button>
              </div>

              {/* Role Dropdown */}
              {distinctRoles.length > 0 && (
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="bg-white border border-light rounded-xl px-3 py-2 text-xs font-bold text-navy focus:outline-none focus:border-gold"
                >
                  <option value="all">All Roles</option>
                  {distinctRoles.map(role => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>
              )}

              {/* Sort By Dropdown */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-white border border-light rounded-xl px-3 py-2 text-xs font-bold text-navy focus:outline-none focus:border-gold"
              >
                <option value="name">Sort: Name (A-Z)</option>
                <option value="salary_desc">Sort: Salary (High to Low)</option>
                <option value="joining_desc">Sort: Joining Date (Newest)</option>
                <option value="advance_desc">Sort: Pending Advance (Highest)</option>
              </select>

              {/* View Mode Toggle */}
              <div className="flex items-center bg-white border border-light rounded-xl p-0.5">
                <button
                  onClick={() => setViewMode("cards")}
                  className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                    viewMode === "cards" ? "bg-navy text-gold" : "text-muted-grey hover:text-navy"
                  }`}
                  title="Card Grid View"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode("table")}
                  className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                    viewMode === "table" ? "bg-navy text-gold" : "text-muted-grey hover:text-navy"
                  }`}
                  title="Table View"
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Roster View Output */}
          {filteredWorkers.length === 0 ? (
            <div className="bg-cream/10 border-2 border-dashed border-light rounded-3xl p-12 text-center space-y-4">
              <div className="bg-cream/30 text-gold p-4 rounded-full w-14 h-14 mx-auto flex items-center justify-center">
                <Users className="w-6 h-6" />
              </div>
              <div className="max-w-md mx-auto space-y-1">
                <h4 className="font-serif font-black text-navy text-lg">No Staff Members Found</h4>
                <p className="text-xs text-muted-grey">
                  {searchTerm || roleFilter !== "all" || statusFilter !== "all"
                    ? "No workers match the current search filters. Try clearing search criteria."
                    : "No tailors or staff registered yet. Add staff members to track attendance and process monthly payroll."}
                </p>
              </div>
              <button
                onClick={() => {
                  setEditingWorker(null);
                  setShowAddWorkerModal(true);
                }}
                className="bg-navy hover:bg-navy-hover text-white text-xs font-bold px-5 py-2.5 rounded-xl inline-flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95 transition-all"
              >
                <Plus className="w-4 h-4 text-gold" /> Hire New Worker
              </button>
            </div>
          ) : viewMode === "cards" ? (
            /* Card Grid Layout */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredWorkers.map((w) => {
                const unpaidAdvSum = advances
                  .filter(a => a.workerId === w.id && !a.repaid)
                  .reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
                
                const monthlyRate = w.monthlySalary || (w.dailyWages ? w.dailyWages * 30 : 18000);

                return (
                  <div
                    key={w.id}
                    className={`border rounded-2xl p-5 space-y-4 transition-all relative overflow-hidden flex flex-col justify-between ${
                      w.active 
                        ? "border-light bg-white hover:border-gold/40 hover:shadow-sm" 
                        : "border-light/60 bg-gray-50/70 opacity-75"
                    }`}
                  >
                    <div className="space-y-3.5">
                      {/* Card Header: Avatar, Name, Role, Status */}
                      <div className="flex items-start gap-3.5">
                        <label 
                          className="relative w-12 h-12 rounded-2xl overflow-hidden flex items-center justify-center border border-gold/40 shadow-2xs flex-shrink-0 cursor-pointer group transition-all bg-white" 
                          title="Click to change worker photo"
                        >
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleDirectWorkerPhotoChange(w.id, e)}
                            className="hidden"
                          />
                          {w.photoUrl ? (
                            <img 
                              src={w.photoUrl} 
                              alt={w.name} 
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full bg-cream text-navy font-bold font-serif flex items-center justify-center text-sm">
                              {w.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)}
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <Camera className="w-3.5 h-3.5 text-white" />
                          </div>
                        </label>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start">
                            <div>
                              <h4 
                                onClick={() => setSelectedDetailWorker(w)}
                                className="font-serif font-black text-navy text-sm truncate hover:text-gold cursor-pointer transition-colors" 
                                title={w.name}
                              >
                                {w.name}
                              </h4>
                              <p className="text-[11px] text-gold font-bold">{w.role}</p>
                            </div>

                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                              w.active 
                                ? "text-emerald-800 bg-emerald-50 border border-emerald-200" 
                                : "text-rose-800 bg-rose-50 border border-rose-200"
                            }`}>
                              {w.active ? "Active" : "Inactive"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Card Details Metrics */}
                      <div className="space-y-1.5 text-xs font-sans text-charcoal pt-1 border-t border-light/60">
                        <p className="flex justify-between">
                          <span className="text-muted-grey">Mobile:</span>
                          <span className="font-mono font-bold text-navy">{w.mobileNumber || "N/A"}</span>
                        </p>
                        <p className="flex justify-between">
                          <span className="text-muted-grey">Monthly Salary:</span>
                          <span className="font-mono font-bold text-navy">₹{monthlyRate}</span>
                        </p>
                        <p className="flex justify-between">
                          <span className="text-muted-grey">Joined On:</span>
                          <span className="font-mono text-charcoal">{w.joiningDate}</span>
                        </p>
                        <p className="flex justify-between border-t border-light/40 pt-1.5">
                          <span className="text-amber-800 font-bold">Unpaid Advance:</span>
                          <span className="font-mono font-bold text-amber-700">₹{unpaidAdvSum}</span>
                        </p>
                      </div>
                    </div>

                    {/* Card Footer Actions */}
                    <div className="flex items-center justify-between gap-1 pt-3 border-t border-light/60">
                      <button
                        onClick={() => setSelectedDetailWorker(w)}
                        className="text-[11px] font-bold text-navy hover:text-gold hover:bg-cream/40 px-2.5 py-1.5 rounded-xl flex items-center gap-1 transition-all cursor-pointer"
                      >
                        Profile & Ledger <ChevronRight className="w-3 h-3" />
                      </button>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            setEditingWorker(w);
                            setShowAddWorkerModal(true);
                          }}
                          className="p-1.5 text-navy hover:bg-cream/40 rounded-lg transition-colors cursor-pointer"
                          title="Edit staff profile"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleToggleWorkerStatus(w)}
                          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                            w.active 
                              ? "text-rose-600 hover:bg-rose-50" 
                              : "text-emerald-600 hover:bg-emerald-50"
                          }`}
                          title={w.active ? "Deactivate worker" : "Activate worker"}
                        >
                          <UserX className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setWorkerToDelete(w)}
                          className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="Safe delete worker"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Table View Layout */
            <div className="border border-light rounded-2xl overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-navy text-white text-[10px] uppercase font-bold tracking-wider">
                    <th className="py-3 px-4">Staff Member</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Mobile</th>
                    <th className="py-3 px-4 text-right">Monthly Salary</th>
                    <th className="py-3 px-4 text-right">Pending Advance</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-light font-sans text-xs">
                  {filteredWorkers.map((w) => {
                    const unpaidAdvSum = advances
                      .filter(a => a.workerId === w.id && !a.repaid)
                      .reduce((sum, a) => sum + (Number(a.amount) || 0), 0);
                    const monthlyRate = w.monthlySalary || (w.dailyWages ? w.dailyWages * 30 : 18000);

                    return (
                      <tr key={w.id} className="hover:bg-cream/10 transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full overflow-hidden bg-cream flex items-center justify-center font-bold text-navy text-xs border border-gold/30 flex-shrink-0">
                              {w.photoUrl ? (
                                <img src={w.photoUrl} alt={w.name} className="w-full h-full object-cover" />
                              ) : (
                                w.name.slice(0, 2).toUpperCase()
                              )}
                            </div>
                            <span 
                              onClick={() => setSelectedDetailWorker(w)}
                              className="font-bold text-navy hover:text-gold cursor-pointer"
                            >
                              {w.name}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 font-medium text-navy">{w.role}</td>
                        <td className="py-3 px-4 font-mono">{w.mobileNumber || "-"}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-navy">₹{monthlyRate}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-amber-700">₹{unpaidAdvSum}</td>
                        <td className="py-3 px-4 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                            w.active 
                              ? "text-emerald-800 bg-emerald-50 border border-emerald-200" 
                              : "text-rose-800 bg-rose-50 border border-rose-200"
                          }`}>
                            {w.active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => setSelectedDetailWorker(w)}
                              className="p-1 text-navy hover:bg-cream/40 rounded-lg cursor-pointer"
                              title="View full profile & ledger"
                            >
                              <FileText className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                setEditingWorker(w);
                                setShowAddWorkerModal(true);
                              }}
                              className="p-1 text-navy hover:bg-cream/40 rounded-lg cursor-pointer"
                              title="Edit staff profile"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setWorkerToDelete(w)}
                              className="p-1 text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                              title="Safe delete worker"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* SUB-TAB 2: SIMPLE WORKER ATTENDANCE SYSTEM               */}
      {/* ======================================================== */}
      {activeTab === "attendance" && (
        <SimpleAttendanceView
          workers={workers}
          attendance={attendance}
          onDataChanged={reloadData}
        />
      )}

      {/* ======================================================== */}
      {/* SUB-TAB 3: SALARY CALCULATOR & DISBURSAL                 */}
      {/* ======================================================== */}
      {activeTab === "salary-calculator" && (
        <div className="bg-white border border-light rounded-3xl p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-light pb-4">
            <div>
              <h3 className="text-lg font-serif font-black text-navy">Monthly Salary Calculator</h3>
              <p className="text-xs text-muted-grey">
                Auto-computes pro-rata daily wages based on attendance, deducts advances, and records official ledger payments.
              </p>
            </div>
            
            <div className="flex items-center gap-2.5">
              <label className="text-xs font-bold text-navy">Select Payroll Month:</label>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="border border-light rounded-xl px-3 py-1.5 text-xs font-bold text-navy focus:outline-none focus:border-gold bg-cream/10 font-mono"
              />
            </div>
          </div>

          {/* Active Month Computation Table */}
          <div className="border border-light rounded-2xl overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-navy text-white text-[10px] uppercase font-bold tracking-wider">
                  <th className="py-3 px-4">Staff Member</th>
                  <th className="py-3 px-4">Monthly Rate</th>
                  <th className="py-3 px-4 text-center">Attendance (P / H / L / A)</th>
                  <th className="py-3 px-4 text-right">Gross Earned</th>
                  <th className="py-3 px-4 text-right">Advance Recovery</th>
                  <th className="py-3 px-4 text-right">Bonus</th>
                  <th className="py-3 px-4 text-right">Net Payable</th>
                  <th className="py-3 px-4 text-center">Disburse Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-light font-sans text-xs">
                {workers.filter(w => w.active).map((w) => {
                  const draft = payrollDrafts[w.id];
                  if (!draft) return null;

                  return (
                    <tr key={w.id} className="hover:bg-cream/5">
                      <td className="py-3.5 px-4">
                        <p className="font-bold text-navy">{w.name}</p>
                        <span className="text-[10px] text-muted-grey">{w.role}</span>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-navy">
                        ₹{w.monthlySalary || (w.dailyWages * 30) || 18000}
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono">
                        <span className="text-emerald-700 font-bold">{draft.presents}P</span>
                        {" / "}
                        <span className="text-amber-700">{draft.halfDays}H</span>
                        {" / "}
                        <span className="text-blue-700">{draft.paidLeavesUsed}L</span>
                        {" / "}
                        <span className="text-rose-700">{draft.absents}A</span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-navy">
                        ₹{draft.grossSalary}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {draft.alreadyPaid ? (
                          <span className="font-mono text-muted-grey">-</span>
                        ) : (
                          <input
                            type="number"
                            min={0}
                            max={draft.pendingAdvance}
                            value={draft.deductAdvance}
                            onChange={(e) => handleDraftFieldChange(w.id, "deductAdvance", Number(e.target.value))}
                            className="w-20 border border-light rounded-lg px-2 py-1 text-right font-mono text-xs focus:outline-none focus:border-gold"
                            title={`Max pending advance: ₹${draft.pendingAdvance}`}
                          />
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {draft.alreadyPaid ? (
                          <span className="font-mono text-muted-grey">-</span>
                        ) : (
                          <input
                            type="number"
                            min={0}
                            value={draft.bonus}
                            onChange={(e) => handleDraftFieldChange(w.id, "bonus", Number(e.target.value))}
                            className="w-20 border border-light rounded-lg px-2 py-1 text-right font-mono text-xs focus:outline-none focus:border-gold"
                            placeholder="Bonus ₹"
                          />
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-navy text-sm">
                        ₹{draft.netPayable + draft.bonus}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {draft.alreadyPaid ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                            <Check className="w-3 h-3 text-emerald-600" /> Disbursed
                          </span>
                        ) : (
                          <button
                            onClick={() => handleProcessPayout(w.id)}
                            disabled={isProcessingAction}
                            className="bg-navy hover:bg-navy-hover text-white text-[10px] font-bold px-3 py-1.5 rounded-xl border border-navy shadow-2xs transition-all flex items-center gap-1 mx-auto cursor-pointer active:scale-95 disabled:opacity-50"
                          >
                            <Banknote className="w-3.5 h-3.5 text-gold" /> Pay Salary
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Processed Salary History Ledger */}
          <div className="space-y-4 pt-4 border-t border-light">
            <div className="flex justify-between items-center">
              <div>
                <h4 className="font-serif font-bold text-navy text-sm">Disbursed Salary History Ledger</h4>
                <p className="text-[11px] text-muted-grey">Audited records of monthly tailors salaries disbursed in showroom ledger</p>
              </div>
            </div>

            <div className="border border-light rounded-2xl overflow-hidden">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-navy text-white text-[10px] uppercase font-bold tracking-wider">
                    <th className="py-2.5 px-4">Disbursed Date</th>
                    <th className="py-2.5 px-4">Staff Member</th>
                    <th className="py-2.5 px-4">Month</th>
                    <th className="py-2.5 px-4 text-right">Base Salary</th>
                    <th className="py-2.5 px-4 text-right">Advance Recovery</th>
                    <th className="py-2.5 px-4 text-right">Bonus</th>
                    <th className="py-2.5 px-4 text-right">Net Disbursed</th>
                    <th className="py-2.5 px-4 text-center">Pay Slip / Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-light font-sans text-xs">
                  {payouts.sort((a,b) => b.paymentDate.localeCompare(a.paymentDate)).map((p) => {
                    const worker = workers.find(w => w.id === p.workerId);
                    const workerName = worker ? worker.name : "Unknown";

                    return (
                      <tr key={p.id} className="hover:bg-cream/5">
                        <td className="py-3 px-4 font-mono">{p.paymentDate}</td>
                        <td className="py-3 px-4 font-bold text-navy">{workerName}</td>
                        <td className="py-3 px-4 font-bold">{p.month}</td>
                        <td className="py-3 px-4 text-right font-mono">₹{p.calculatedSalary}</td>
                        <td className="py-3 px-4 text-right font-mono text-amber-700">-₹{p.advanceDeductions}</td>
                        <td className="py-3 px-4 text-right font-mono text-emerald-700">+₹{p.bonus}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-navy">₹{p.netPaid}</td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => setSelectedSlipPayout(p)}
                              className="bg-navy hover:bg-navy-hover text-white text-[10px] font-bold px-2.5 py-1 rounded-lg flex items-center gap-1 cursor-pointer transition-all shadow-2xs"
                              title="Print / View salary slip"
                            >
                              <Printer className="w-3 h-3 text-gold" /> Pay Slip
                            </button>
                            <button
                              onClick={() => {
                                setEditingSalary(p);
                                setShowEditSalaryModal(true);
                              }}
                              className="p-1 text-navy hover:bg-cream/40 rounded-lg cursor-pointer"
                              title="Edit payout"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeletePayoutConfirmation({
                                isOpen: true,
                                payoutId: p.id,
                                payoutWorkerName: workerName,
                                payoutMonth: p.month
                              })}
                              className="p-1 text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                              title="Revert & delete payout"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {payouts.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-6 text-center text-muted-grey">
                        No monthly salary payouts recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SUB-TAB 4: STAFF ADVANCES                                */}
      {/* ======================================================== */}
      {activeTab === "advances" && (
        <div className="bg-white border border-light rounded-3xl p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-light pb-4">
            <div>
              <h3 className="text-lg font-serif font-black text-navy">Staff Advances & Loans</h3>
              <p className="text-xs text-muted-grey">
                Issue instant cash advances to tailors and track repayment statuses automatically.
              </p>
            </div>
            
            <button
              onClick={() => {
                setEditingAdvance(null);
                setNewAdvance({
                  workerId: workers.filter(w => w.active)[0]?.id || "",
                  amount: 1000,
                  date: new Date().toISOString().split("T")[0],
                  notes: ""
                });
                setShowAdvanceModal(true);
              }}
              className="bg-navy hover:bg-navy-hover text-white text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95 transition-all"
            >
              <Plus className="w-4 h-4 text-gold" /> Issue Advance
            </button>
          </div>

          {/* Advances Filter Bar */}
          <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 bg-cream/15 p-3.5 rounded-2xl border border-light">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-muted-grey absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search advances by worker name or notes..."
                value={advanceSearchTerm}
                onChange={(e) => setAdvanceSearchTerm(e.target.value)}
                className="pl-8 pr-3 py-1.5 border border-light rounded-xl w-full text-xs focus:outline-none focus:border-gold bg-white"
              />
            </div>

            <div className="flex items-center bg-white border border-light rounded-xl p-0.5 text-xs font-bold">
              <button
                onClick={() => setAdvanceStatusFilter("all")}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  advanceStatusFilter === "all" ? "bg-navy text-gold" : "text-muted-grey hover:text-navy"
                }`}
              >
                All ({advances.length})
              </button>
              <button
                onClick={() => setAdvanceStatusFilter("pending")}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  advanceStatusFilter === "pending" ? "bg-navy text-gold" : "text-muted-grey hover:text-navy"
                }`}
              >
                Pending ({advances.filter(a => !a.repaid).length})
              </button>
              <button
                onClick={() => setAdvanceStatusFilter("repaid")}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  advanceStatusFilter === "repaid" ? "bg-navy text-gold" : "text-muted-grey hover:text-navy"
                }`}
              >
                Settled ({advances.filter(a => a.repaid).length})
              </button>
            </div>
          </div>

          <div className="border border-light rounded-2xl overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-navy text-white text-[10px] uppercase font-bold tracking-wider">
                  <th className="py-3 px-4">Date Given</th>
                  <th className="py-3 px-4">Worker Name</th>
                  <th className="py-3 px-4 text-right">Advance Amount</th>
                  <th className="py-3 px-4">Purpose / Memo</th>
                  <th className="py-3 px-4 text-center">Repay Status</th>
                  <th className="py-3 px-4 text-center">Settlement Date</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-light font-sans text-xs">
                {filteredAdvances.map((adv) => {
                  const worker = workers.find(w => w.id === adv.workerId);
                  return (
                    <tr key={adv.id} className="hover:bg-cream/5 transition-colors">
                      <td className="py-3 px-4 font-mono">{adv.date}</td>
                      <td className="py-3 px-4 font-bold text-navy">
                        {worker ? worker.name : "Unknown"}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-navy">
                        ₹{adv.amount}
                      </td>
                      <td className="py-3 px-4 text-muted-grey italic">
                        {stripEmbeddedTags(adv.notes) || "Emergency personal advance"}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {adv.repaid ? (
                          <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                            Repaid / Settled
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-100">
                            Outstanding Balance
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center font-mono text-muted-grey">
                        {adv.repaid ? adv.repayDate || "Salary Deducted" : "Pending"}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => {
                              setEditingAdvance(adv);
                              setNewAdvance({
                                workerId: adv.workerId,
                                amount: adv.amount,
                                date: adv.date,
                                notes: adv.notes || ""
                              });
                              setShowAdvanceModal(true);
                            }}
                            className="p-1 text-navy hover:bg-cream/40 rounded-lg cursor-pointer"
                            title="Edit advance"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteAdvanceConfirmation({
                              isOpen: true,
                              advanceId: adv.id,
                              workerName: worker ? worker.name : "Staff Member",
                              amount: adv.amount
                            })}
                            className="p-1 text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                            title="Delete advance"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredAdvances.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-muted-grey">
                      No staff advance salaries or loans found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* POPUP MODALS & DRAWERS                                   */}
      {/* ======================================================== */}

      {/* 1. Add / Edit Worker Modal */}
      <WorkerModal
        isOpen={showAddWorkerModal}
        editingWorker={editingWorker}
        onSave={handleSaveWorker}
        onClose={() => {
          setShowAddWorkerModal(false);
          setEditingWorker(null);
        }}
        isProcessing={isProcessingAction}
      />

      {/* 2. Worker Detail View Modal */}
      {selectedDetailWorker && (
        <WorkerDetailModal
          isOpen={!!selectedDetailWorker}
          worker={selectedDetailWorker}
          attendance={attendance}
          advances={advances}
          salaries={payouts}
          onClose={() => setSelectedDetailWorker(null)}
          onEditWorker={(w) => {
            setEditingWorker(w);
            setShowAddWorkerModal(true);
          }}
          onToggleStatus={handleToggleWorkerStatus}
          onIssueAdvance={(workerId) => {
            setEditingAdvance(null);
            setNewAdvance({
              workerId,
              amount: 1000,
              date: new Date().toISOString().split("T")[0],
              notes: ""
            });
            setShowAdvanceModal(true);
          }}
          onEditAdvance={(adv) => {
            setEditingAdvance(adv);
            setNewAdvance({
              workerId: adv.workerId,
              amount: adv.amount,
              date: adv.date,
              notes: adv.notes || ""
            });
            setShowAdvanceModal(true);
          }}
          onDeleteAdvance={(adv) => {
            const worker = workers.find(w => w.id === adv.workerId);
            setDeleteAdvanceConfirmation({
              isOpen: true,
              advanceId: adv.id,
              workerName: worker ? worker.name : "Staff Member",
              amount: adv.amount
            });
          }}
          onEditSalary={(sal) => {
            setEditingSalary(sal);
            setShowEditSalaryModal(true);
          }}
          onDeleteSalary={(sal, workerName) => {
            setDeletePayoutConfirmation({
              isOpen: true,
              payoutId: sal.id,
              payoutWorkerName: workerName,
              payoutMonth: sal.month
            });
          }}
          onEditAttendance={(rec) => {
            setEditingAttendanceRecord(rec);
            setShowEditAttendanceModal(true);
          }}
          onDeleteAttendance={(rec) => {
            const worker = workers.find(w => w.id === rec.workerId);
            setDeleteAttendanceConfirmation({
              isOpen: true,
              attendanceId: rec.id,
              workerName: worker ? worker.name : "Staff Member",
              date: rec.date
            });
          }}
        />
      )}

      {/* 3. Safe Deletion Dialog */}
      <SafeDeleteModal
        isOpen={!!workerToDelete}
        worker={workerToDelete}
        advances={advances}
        salaries={payouts}
        attendance={attendance}
        onConfirmDelete={handleConfirmDeleteWorker}
        onDeactivate={handleDeactivateWorker}
        onClose={() => setWorkerToDelete(null)}
        isProcessing={isProcessingAction}
      />

      {/* 4. Salary Pay Slip Modal */}
      {selectedSlipPayout && (
        <WorkerSalarySlipModal
          isOpen={!!selectedSlipPayout}
          payout={selectedSlipPayout}
          worker={workers.find(w => w.id === selectedSlipPayout.workerId) || null}
          onClose={() => setSelectedSlipPayout(null)}
        />
      )}

      {/* 5. Issue / Edit Cash Advance Modal */}
      {showAdvanceModal && (
        <div className="fixed inset-0 bg-navy/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in font-sans">
          <div className="bg-white rounded-3xl border border-light max-w-md w-full overflow-hidden shadow-2xl animate-scale-up">
            <div className="bg-navy text-white px-6 py-4 border-b border-gold/20 flex justify-between items-center">
              <h3 className="font-serif font-black text-gold text-base">
                {editingAdvance ? "Edit Staff Advance" : "Issue Staff Advance"}
              </h3>
              <button 
                onClick={() => {
                  setShowAdvanceModal(false);
                  setEditingAdvance(null);
                }}
                className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/10"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddAdvanceSubmit} className="p-6 space-y-4 text-xs font-sans">
              <div className="space-y-1">
                <label className="text-xs font-bold text-navy">Select Staff Member:</label>
                <select
                  required
                  value={newAdvance.workerId}
                  onChange={(e) => setNewAdvance({...newAdvance, workerId: e.target.value})}
                  className="w-full border border-light rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:border-gold bg-cream/5"
                >
                  <option value="">-- Choose Worker --</option>
                  {workers.filter(w => w.active || (editingAdvance && w.id === editingAdvance.workerId)).map(w => (
                    <option key={w.id} value={w.id}>{w.name} ({w.role})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-navy">Advance Amount (₹):</label>
                  <input
                    type="number"
                    required
                    min={100}
                    step={100}
                    value={newAdvance.amount}
                    onChange={(e) => setNewAdvance({...newAdvance, amount: Number(e.target.value)})}
                    className="w-full border border-light rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:border-gold bg-cream/5 font-mono font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-navy">Disbursement Date:</label>
                  <input
                    type="date"
                    value={newAdvance.date}
                    onChange={(e) => setNewAdvance({...newAdvance, date: e.target.value})}
                    className="w-full border border-light rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:border-gold bg-cream/5 font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-navy">Purpose / Memo:</label>
                <input
                  type="text"
                  placeholder="e.g. Medical emergency, festival advance"
                  value={newAdvance.notes}
                  onChange={(e) => setNewAdvance({...newAdvance, notes: e.target.value})}
                  className="w-full border border-light rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:border-gold bg-cream/5"
                />
              </div>

              {editingAdvance && (
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 p-3 rounded-xl">
                  <input
                    type="checkbox"
                    id="edit_repaid_status"
                    checked={editingAdvance.repaid}
                    onChange={(e) => setEditingAdvance(prev => prev ? { ...prev, repaid: e.target.checked, repayDate: e.target.checked ? new Date().toISOString().split("T")[0] : undefined } : null)}
                    className="w-4 h-4 text-navy rounded border-gray-300 focus:ring-gold cursor-pointer"
                  />
                  <label htmlFor="edit_repaid_status" className="text-xs font-bold text-amber-950 cursor-pointer">
                    Mark as Settled / Repaid
                  </label>
                </div>
              )}

              <div className="flex gap-2.5 pt-4 border-t border-light justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowAdvanceModal(false);
                    setEditingAdvance(null);
                  }}
                  className="px-4 py-2 text-xs font-bold text-charcoal hover:bg-cream border border-light rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProcessingAction}
                  className="bg-navy hover:bg-navy-hover text-white text-xs font-bold px-5 py-2 rounded-xl border border-navy shadow-sm cursor-pointer active:scale-95"
                >
                  {editingAdvance ? "Save Changes" : "Confirm Advance"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. Edit Salary Payout Modal */}
      {showEditSalaryModal && editingSalary && (
        <div className="fixed inset-0 bg-navy/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in font-sans">
          <div className="bg-white rounded-3xl border border-light max-w-md w-full overflow-hidden shadow-2xl animate-scale-up">
            <div className="bg-navy text-white px-6 py-4 border-b border-gold/20 flex justify-between items-center">
              <h3 className="font-serif font-black text-gold text-base">Edit Salary Payout</h3>
              <button 
                onClick={() => {
                  setShowEditSalaryModal(false);
                  setEditingSalary(null);
                }}
                className="text-gray-400 hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={async (e) => {
              e.preventDefault();
              try {
                const base = Number(editingSalary.calculatedSalary);
                const bon = Number(editingSalary.bonus || 0);
                const ded = Number(editingSalary.advanceDeductions || 0);
                const net = Math.max(0, base + bon - ded);

                db.updateSalaryPayout(editingSalary.id, {
                  calculatedSalary: base,
                  bonus: bon,
                  advanceDeductions: ded,
                  netPaid: net,
                  paymentDate: editingSalary.paymentDate,
                  notes: editingSalary.notes
                });

                await db.waitForSync();
                setShowEditSalaryModal(false);
                setEditingSalary(null);
                reloadData();
                setSuccessMessage("Salary payout record updated and saved to cloud successfully! ✓");
                setTimeout(() => setSuccessMessage(null), 3000);
              } catch (err: any) {
                setErrorMessage(err.message || "Failed to update salary payout.");
              }
            }} className="p-6 space-y-4 text-xs font-sans">
              <div className="space-y-1 bg-cream/15 p-3 rounded-xl border border-light">
                <p className="text-xs text-navy font-bold">Worker: <span className="text-gold font-serif">{workers.find(w => w.id === editingSalary.workerId)?.name || "Unknown"}</span></p>
                <p className="text-xs text-navy font-bold">Month: <span className="font-mono text-charcoal">{editingSalary.month}</span></p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-navy">Base Salary (₹):</label>
                  <input
                    type="number"
                    required
                    value={editingSalary.calculatedSalary}
                    onChange={(e) => setEditingSalary({ ...editingSalary, calculatedSalary: Number(e.target.value) })}
                    className="w-full border border-light rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:border-gold bg-cream/5 font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-navy">Bonus Paid (₹):</label>
                  <input
                    type="number"
                    required
                    value={editingSalary.bonus}
                    onChange={(e) => setEditingSalary({ ...editingSalary, bonus: Number(e.target.value) })}
                    className="w-full border border-light rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:border-gold bg-cream/5 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-navy">Advance Recovery (₹):</label>
                  <input
                    type="number"
                    required
                    value={editingSalary.advanceDeductions}
                    onChange={(e) => setEditingSalary({ ...editingSalary, advanceDeductions: Number(e.target.value) })}
                    className="w-full border border-light rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:border-gold bg-cream/5 font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-navy">Payment Date:</label>
                  <input
                    type="date"
                    required
                    value={editingSalary.paymentDate}
                    onChange={(e) => setEditingSalary({ ...editingSalary, paymentDate: e.target.value })}
                    className="w-full border border-light rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:border-gold bg-cream/5 font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-navy">Remarks / Notes:</label>
                <input
                  type="text"
                  placeholder="e.g. Monthly salary disbursed"
                  value={editingSalary.notes || ""}
                  onChange={(e) => setEditingSalary({ ...editingSalary, notes: e.target.value })}
                  className="w-full border border-light rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:border-gold bg-cream/5"
                />
              </div>

              <div className="bg-cream/25 p-3.5 rounded-xl text-center border border-light/60 font-mono text-xs">
                <p className="text-muted-grey">Recalculated Net Paid:</p>
                <p className="text-base font-bold text-navy">₹{Math.max(0, Number(editingSalary.calculatedSalary) + Number(editingSalary.bonus || 0) - Number(editingSalary.advanceDeductions || 0))}</p>
              </div>

              <div className="flex gap-2.5 pt-4 border-t border-light justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditSalaryModal(false);
                    setEditingSalary(null);
                  }}
                  className="px-4 py-2 text-xs font-bold text-charcoal hover:bg-cream border border-light rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-navy hover:bg-navy-hover text-white text-xs font-bold px-5 py-2 rounded-xl border border-navy shadow-sm cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. Edit Attendance Log Modal */}
      {showEditAttendanceModal && editingAttendanceRecord && (
        <div className="fixed inset-0 bg-navy/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in font-sans">
          <div className="bg-white rounded-3xl border border-light max-w-md w-full overflow-hidden shadow-2xl animate-scale-up">
            <div className="bg-navy text-white px-6 py-4 border-b border-gold/20 flex justify-between items-center">
              <h3 className="font-serif font-black text-gold text-base">Edit Attendance Record</h3>
              <button 
                onClick={() => {
                  setShowEditAttendanceModal(false);
                  setEditingAttendanceRecord(null);
                }}
                className="text-gray-400 hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={async (e) => {
              e.preventDefault();
              try {
                db.updateAttendance(editingAttendanceRecord.id, {
                  status: editingAttendanceRecord.status,
                  notes: editingAttendanceRecord.notes,
                  checkInTime: editingAttendanceRecord.checkInTime || undefined,
                  checkOutTime: editingAttendanceRecord.checkOutTime || undefined,
                  date: editingAttendanceRecord.date
                });

                await db.waitForSync();
                setShowEditAttendanceModal(false);
                setEditingAttendanceRecord(null);
                reloadData();
                setSuccessMessage("Attendance record updated successfully! ✓");
                setTimeout(() => setSuccessMessage(null), 3000);
              } catch (err: any) {
                setErrorMessage(err.message || "Failed to update attendance record.");
              }
            }} className="p-6 space-y-4 text-xs font-sans">
              <div className="space-y-1 bg-cream/15 p-3 rounded-xl border border-light">
                <p className="text-xs text-navy font-bold">Staff Member: <span className="text-gold font-serif">{workers.find(w => w.id === editingAttendanceRecord.workerId)?.name || "Unknown"}</span></p>
                <p className="text-xs text-navy font-bold">Date: <span className="font-mono text-charcoal">{editingAttendanceRecord.date}</span></p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-navy">Attendance Status:</label>
                <select
                  value={editingAttendanceRecord.status}
                  onChange={(e) => setEditingAttendanceRecord({ ...editingAttendanceRecord, status: e.target.value as AttendanceStatus })}
                  className="w-full border border-light rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:border-gold bg-cream/5 font-bold"
                >
                  <option value="Present">Present</option>
                  <option value="Half Day">Half Day</option>
                  <option value="Paid Leave">Paid Leave</option>
                  <option value="Absent">Absent</option>
                  <option value="Checked In">Checked In</option>
                  <option value="Checked Out">Checked Out</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-navy">Remarks / Notes:</label>
                <input
                  type="text"
                  placeholder="e.g. Approved leave, late arrival"
                  value={editingAttendanceRecord.notes || ""}
                  onChange={(e) => setEditingAttendanceRecord({ ...editingAttendanceRecord, notes: e.target.value })}
                  className="w-full border border-light rounded-xl px-3 py-2.5 text-xs focus:outline-none focus:border-gold bg-cream/5"
                />
              </div>

              <div className="flex gap-2.5 pt-4 border-t border-light justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditAttendanceModal(false);
                    setEditingAttendanceRecord(null);
                  }}
                  className="px-4 py-2 text-xs font-bold text-charcoal hover:bg-cream border border-light rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-navy hover:bg-navy-hover text-white text-xs font-bold px-5 py-2 rounded-xl border border-navy shadow-sm cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modals for Delete Operations */}
      <ConfirmModal
        isOpen={deleteAdvanceConfirmation.isOpen}
        title="Delete Cash Advance?"
        message={`Are you sure you want to permanently delete the cash advance record of ₹${deleteAdvanceConfirmation.amount} issued to ${deleteAdvanceConfirmation.workerName}?\n\nThis will remove the transaction record from accounting.`}
        confirmLabel="Yes, Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={async () => {
          const { advanceId } = deleteAdvanceConfirmation;
          setDeleteAdvanceConfirmation(prev => ({ ...prev, isOpen: false }));
          try {
            db.deleteAdvance(advanceId);
            await db.supabaseQueue;
            reloadData();
            setSuccessMessage("Staff advance record deleted successfully! ✓");
            setTimeout(() => setSuccessMessage(null), 3000);
          } catch (err: any) {
            setErrorMessage(err.message || "Could not delete advance.");
          }
        }}
        onCancel={() => setDeleteAdvanceConfirmation(prev => ({ ...prev, isOpen: false }))}
      />

      <ConfirmModal
        isOpen={deletePayoutConfirmation.isOpen}
        title="Revert & Delete Salary Payout?"
        message={`Are you sure you want to delete and revert the processed salary payout for ${deletePayoutConfirmation.payoutWorkerName} (${deletePayoutConfirmation.payoutMonth})?\n\nThis will also restore any advance deductions adjusted in this payout.`}
        confirmLabel="Yes, Revert & Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={async () => {
          const { payoutId } = deletePayoutConfirmation;
          setDeletePayoutConfirmation(prev => ({ ...prev, isOpen: false }));
          try {
            db.deleteSalaryPayout(payoutId);
            await db.supabaseQueue;
            reloadData();
            setSuccessMessage("Salary payout reverted and removed from ledger successfully! ✓");
            setTimeout(() => setSuccessMessage(null), 3000);
          } catch (err: any) {
            setErrorMessage(err.message || "Could not delete salary payout.");
          }
        }}
        onCancel={() => setDeletePayoutConfirmation(prev => ({ ...prev, isOpen: false }))}
      />

      <ConfirmModal
        isOpen={deleteAttendanceConfirmation.isOpen}
        title="Delete Attendance Log?"
        message={`Are you sure you want to delete the attendance log of ${deleteAttendanceConfirmation.workerName} for ${deleteAttendanceConfirmation.date}?`}
        confirmLabel="Yes, Delete Log"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={async () => {
          const { attendanceId } = deleteAttendanceConfirmation;
          setDeleteAttendanceConfirmation(prev => ({ ...prev, isOpen: false }));
          try {
            db.deleteAttendance(attendanceId);
            await db.supabaseQueue;
            reloadData();
            setSuccessMessage("Attendance record removed successfully! ✓");
            setTimeout(() => setSuccessMessage(null), 3000);
          } catch (err: any) {
            setErrorMessage(err.message || "Could not delete attendance record.");
          }
        }}
        onCancel={() => setDeleteAttendanceConfirmation(prev => ({ ...prev, isOpen: false }))}
      />

      <ConfirmModal
        isOpen={showDeleteAllWorkersConfirmation}
        title="Delete All Workers & Payroll Records?"
        message={`Are you sure you want to permanently delete all ${workers.length} workers?\n\nThis will remove all worker profiles, daily attendance logs, cash advances, and salary payout history. This action cannot be undone.`}
        confirmLabel={isProcessingAction ? "Deleting..." : "Yes, Delete All Workers"}
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={handleConfirmDeleteAllWorkers}
        onCancel={() => setShowDeleteAllWorkersConfirmation(false)}
      />

    </div>
  );
}
