/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from "react";
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon, 
  Check, 
  CheckCircle2, 
  Search, 
  Users, 
  Clock, 
  AlertCircle, 
  Sparkles,
  Save,
  MessageSquare,
  Eye,
  EyeOff
} from "lucide-react";
import { db } from "../../db";
import { Worker, AttendanceRecord, AttendanceStatus } from "../../types";

interface SimpleAttendanceViewProps {
  workers: Worker[];
  attendance: AttendanceRecord[];
  onDataChanged: () => void;
}

export default function SimpleAttendanceView({
  workers,
  attendance,
  onDataChanged
}: SimpleAttendanceViewProps) {
  // Selected Date (YYYY-MM-DD)
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return new Date().toISOString().split("T")[0];
  });

  // Local Attendance State for Selected Date: { [workerId]: { status: AttendanceStatus | "Not Marked"; notes: string } }
  const [attendanceState, setAttendanceState] = useState<{
    [workerId: string]: { status: AttendanceStatus | "Not Marked"; notes: string };
  }>({});

  // UI States
  const [searchQuery, setSearchQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [expandedNotesWorkerId, setExpandedNotesWorkerId] = useState<string | null>(null);

  // Today ISO String for date comparison
  const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);

  // Format Date for Display (e.g. "14 August 2026" and Day Name)
  const formattedDateDisplay = useMemo(() => {
    try {
      const [y, m, d] = selectedDate.split("-").map(Number);
      const dateObj = new Date(y, m - 1, d);
      const dayName = dateObj.toLocaleDateString("en-US", { weekday: "long" });
      const fullDate = dateObj.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" });
      const isToday = selectedDate === todayStr;
      const isYesterday = selectedDate === new Date(Date.now() - 86400000).toISOString().split("T")[0];

      let badge = "";
      if (isToday) badge = "Today";
      else if (isYesterday) badge = "Yesterday";

      return { dayName, fullDate, badge, isToday };
    } catch {
      return { dayName: "", fullDate: selectedDate, badge: "", isToday: false };
    }
  }, [selectedDate, todayStr]);

  // Load attendance records into local state when selectedDate or attendance changes
  useEffect(() => {
    const dayRecords = db.getAttendance().filter(r => r.date === selectedDate);
    const initial: typeof attendanceState = {};

    workers.forEach(w => {
      const rec = dayRecords.find(r => r.workerId === w.id);
      if (rec) {
        initial[w.id] = {
          status: rec.status,
          notes: rec.notes || ""
        };
      } else {
        initial[w.id] = {
          status: "Not Marked",
          notes: ""
        };
      }
    });

    setAttendanceState(initial);
    setIsDirty(false);
    setSaveSuccess(false);
    setErrorMessage(null);
  }, [selectedDate, workers]);

  // Filter workers by active status and search query
  const displayedWorkers = useMemo(() => {
    return workers
      .filter(w => (showInactive ? true : w.active))
      .filter(w => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
          w.name.toLowerCase().includes(q) ||
          w.role.toLowerCase().includes(q) ||
          (w.mobileNumber && w.mobileNumber.includes(q))
        );
      });
  }, [workers, showInactive, searchQuery]);

  // Summary Metrics (live reactivity based on attendanceState)
  const summary = useMemo(() => {
    let presentCount = 0;
    let halfDayCount = 0;
    let absentCount = 0;
    let notMarkedCount = 0;

    // Count for all active workers (or displayed workers if inactive included)
    const targetWorkers = showInactive ? workers : workers.filter(w => w.active);

    targetWorkers.forEach(w => {
      const current = attendanceState[w.id];
      const status = current ? current.status : "Not Marked";

      if (status === "Present" || status === "Checked In" || status === "Checked Out" || status === "Paid Leave") {
        presentCount++;
      } else if (status === "Half Day") {
        halfDayCount++;
      } else if (status === "Absent") {
        absentCount++;
      } else {
        notMarkedCount++;
      }
    });

    return {
      present: presentCount,
      halfDay: halfDayCount,
      absent: absentCount,
      notMarked: notMarkedCount,
      total: targetWorkers.length
    };
  }, [attendanceState, workers, showInactive]);

  // Date Navigation Handlers
  const handlePreviousDay = () => {
    const [y, m, d] = selectedDate.split("-").map(Number);
    const prevDate = new Date(y, m - 1, d - 1);
    setSelectedDate(prevDate.toISOString().split("T")[0]);
  };

  const handleNextDay = () => {
    const [y, m, d] = selectedDate.split("-").map(Number);
    const nextDate = new Date(y, m - 1, d + 1);
    setSelectedDate(nextDate.toISOString().split("T")[0]);
  };

  const handleSetToday = () => {
    setSelectedDate(todayStr);
  };

  const handleSetYesterday = () => {
    const yest = new Date(Date.now() - 86400000).toISOString().split("T")[0];
    setSelectedDate(yest);
  };

  // Status Change for single worker
  const handleSetStatus = (workerId: string, status: AttendanceStatus) => {
    setAttendanceState(prev => ({
      ...prev,
      [workerId]: {
        ...prev[workerId],
        status
      }
    }));
    setIsDirty(true);
    setSaveSuccess(false);
    setErrorMessage(null);
  };

  // Mark All Active Workers as Present
  const handleMarkAllPresent = () => {
    const updated = { ...attendanceState };
    displayedWorkers.forEach(w => {
      updated[w.id] = {
        status: "Present",
        notes: updated[w.id]?.notes || ""
      };
    });
    setAttendanceState(updated);
    setIsDirty(true);
    setSaveSuccess(false);
    setErrorMessage(null);
  };

  // Update Worker Notes
  const handleSetNotes = (workerId: string, notes: string) => {
    setAttendanceState(prev => ({
      ...prev,
      [workerId]: {
        ...prev[workerId],
        notes
      }
    }));
    setIsDirty(true);
  };

  // Save Attendance to Supabase and Local Cache
  const handleSaveAttendance = async () => {
    try {
      setIsSaving(true);
      setErrorMessage(null);

      // Collect records to save (only records with a concrete status)
      const recordsToSave: Omit<AttendanceRecord, "id">[] = [];

      Object.entries(attendanceState).forEach(([workerId, entry]: [string, { status: AttendanceStatus | "Not Marked"; notes: string }]) => {
        if (entry.status !== "Not Marked") {
          const workerObj = workers.find(w => w.id === workerId);
          recordsToSave.push({
            workerId,
            workerName: workerObj?.name || "",
            date: selectedDate,
            status: entry.status,
            notes: entry.notes || ""
          });
        }
      });

      if (recordsToSave.length === 0) {
        setErrorMessage("Please mark attendance for at least one worker before saving.");
        setIsSaving(false);
        return;
      }

      const res = await db.saveBulkAttendance(recordsToSave);

      if (!res.success) {
        setErrorMessage(res.error || "Unable to save attendance. Please try again.");
      } else {
        setIsDirty(false);
        setSaveSuccess(true);
        onDataChanged();
        setTimeout(() => {
          setSaveSuccess(false);
        }, 4000);
      }
    } catch (err: any) {
      console.error("Save attendance error:", err);
      setErrorMessage(err.message || "Unable to save attendance. Please check network connection and try again.");
    } finally {
      setIsSaving(false);
    }
  };

  // Helper to extract Worker Initials
  const getInitials = (name: string) => {
    if (!name) return "W";
    const parts = name.trim().split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <div className="space-y-5 font-sans">
      
      {/* ======================================================== */}
      {/* 1. ATTENDANCE HEADER & DATE CONTROLS                    */}
      {/* ======================================================== */}
      <div className="bg-white border border-light rounded-3xl p-5 sm:p-6 shadow-sm space-y-5">
        
        {/* Main Title & Save Status Badge */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-light pb-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl sm:text-2xl font-serif font-black text-navy tracking-tight">
                ATTENDANCE
              </h2>
              <span className="text-[11px] font-bold text-navy/70 bg-cream/40 px-2.5 py-0.5 rounded-full border border-gold/30">
                Daily Register
              </span>
            </div>
            <p className="text-xs text-muted-grey mt-0.5">
              Select worker status below and click Save Attendance.
            </p>
          </div>

          {/* Quick Status / Save Status Badge */}
          <div className="flex items-center gap-2 self-start sm:self-auto">
            {saveSuccess && (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl animate-fade-in shadow-2xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ✓ Attendance Saved
              </span>
            )}
            {isDirty && !saveSuccess && (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-xl">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                Unsaved changes
              </span>
            )}
            {!isDirty && !saveSuccess && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-muted-grey bg-cream/20 border border-light px-2.5 py-1 rounded-xl">
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                Synced with Cloud
              </span>
            )}
          </div>
        </div>

        {/* Date Selector Banner */}
        <div className="bg-cream/20 border border-light rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
          
          {/* Day & Date Highlight */}
          <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
            <div className="bg-navy text-white p-2.5 rounded-xl shadow-2xs">
              <CalendarIcon className="w-5 h-5 text-gold" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base sm:text-lg font-serif font-black text-navy">
                  {formattedDateDisplay.fullDate}
                </span>
                {formattedDateDisplay.badge && (
                  <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                    formattedDateDisplay.isToday 
                      ? "bg-navy text-gold" 
                      : "bg-charcoal text-white"
                  }`}>
                    {formattedDateDisplay.badge}
                  </span>
                )}
              </div>
              <p className="text-xs font-medium text-muted-grey">
                {formattedDateDisplay.dayName}
              </p>
            </div>
          </div>

          {/* Date Navigation Buttons & Date Picker */}
          <div className="flex items-center gap-2 flex-wrap justify-center w-full md:w-auto">
            <button
              type="button"
              onClick={handlePreviousDay}
              className="bg-white hover:bg-cream/40 text-navy text-xs font-bold px-3 py-2 rounded-xl border border-light shadow-2xs flex items-center gap-1 cursor-pointer transition-all active:scale-95"
              title="View Previous Day Attendance"
            >
              <ChevronLeft className="w-4 h-4 text-navy" />
              <span>Previous Day</span>
            </button>

            <button
              type="button"
              onClick={handleSetToday}
              className={`text-xs font-bold px-3.5 py-2 rounded-xl border shadow-2xs cursor-pointer transition-all active:scale-95 ${
                formattedDateDisplay.isToday
                  ? "bg-navy text-gold border-navy"
                  : "bg-white hover:bg-cream/40 text-navy border-light"
              }`}
            >
              Today
            </button>

            <button
              type="button"
              onClick={handleNextDay}
              className="bg-white hover:bg-cream/40 text-navy text-xs font-bold px-3 py-2 rounded-xl border border-light shadow-2xs flex items-center gap-1 cursor-pointer transition-all active:scale-95"
              title="View Next Day Attendance"
            >
              <span>Next Day</span>
              <ChevronRight className="w-4 h-4 text-navy" />
            </button>

            {/* Custom Date Input */}
            <div className="relative">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-white border border-light rounded-xl px-3 py-1.5 text-xs font-bold font-mono text-navy focus:outline-none focus:border-gold shadow-2xs cursor-pointer"
                title="Select custom date"
              />
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* 2. TODAY'S SUMMARY CARDS                                 */}
        {/* ======================================================== */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          
          {/* Present */}
          <div className="bg-emerald-50/70 border border-emerald-200/80 p-3.5 rounded-2xl flex items-center justify-between">
            <div>
              <span className="text-[10px] uppercase font-bold text-emerald-800 tracking-wider block">
                🟢 Present
              </span>
              <span className="text-xl sm:text-2xl font-serif font-black text-emerald-950 font-mono">
                {summary.present}
              </span>
            </div>
            <div className="w-8 h-8 rounded-xl bg-emerald-100/80 text-emerald-700 flex items-center justify-center font-bold text-xs">
              {Math.round((summary.present / (summary.total || 1)) * 100)}%
            </div>
          </div>

          {/* Half Day */}
          <div className="bg-amber-50/70 border border-amber-200/80 p-3.5 rounded-2xl flex items-center justify-between">
            <div>
              <span className="text-[10px] uppercase font-bold text-amber-800 tracking-wider block">
                🟡 Half Day
              </span>
              <span className="text-xl sm:text-2xl font-serif font-black text-amber-950 font-mono">
                {summary.halfDay}
              </span>
            </div>
            <div className="w-8 h-8 rounded-xl bg-amber-100/80 text-amber-700 flex items-center justify-center font-bold text-xs">
              ½
            </div>
          </div>

          {/* Absent */}
          <div className="bg-rose-50/70 border border-rose-200/80 p-3.5 rounded-2xl flex items-center justify-between">
            <div>
              <span className="text-[10px] uppercase font-bold text-rose-800 tracking-wider block">
                🔴 Absent
              </span>
              <span className="text-xl sm:text-2xl font-serif font-black text-rose-950 font-mono">
                {summary.absent}
              </span>
            </div>
            <div className="w-8 h-8 rounded-xl bg-rose-100/80 text-rose-700 flex items-center justify-center font-bold text-xs">
              ✕
            </div>
          </div>

          {/* Not Marked */}
          <div className={`border p-3.5 rounded-2xl flex items-center justify-between transition-colors ${
            summary.notMarked > 0 
              ? "bg-slate-50 border-slate-200" 
              : "bg-cream/20 border-light"
          }`}>
            <div>
              <span className="text-[10px] uppercase font-bold text-muted-grey tracking-wider block">
                ⚪ Not Marked
              </span>
              <span className="text-xl sm:text-2xl font-serif font-black text-navy font-mono">
                {summary.notMarked}
              </span>
            </div>
            <div className="text-[10px] font-bold text-muted-grey text-right">
              Total: {summary.total}
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* 3. QUICK ACTIONS & SAVE BUTTON BAR                       */}
        {/* ======================================================== */}
        <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 pt-1 border-t border-light/60">
          
          {/* Left: Mark All Present & Search */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={handleMarkAllPresent}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-2xs flex items-center gap-2 cursor-pointer transition-all active:scale-95"
            >
              <Check className="w-4 h-4 stroke-[3]" />
              <span>Mark All Present</span>
            </button>

            {/* Worker Search */}
            <div className="relative flex-1 sm:w-64">
              <Search className="w-3.5 h-3.5 text-muted-grey absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search worker..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-2 border border-light rounded-xl text-xs bg-white focus:outline-none focus:border-gold placeholder:text-muted-grey"
              />
            </div>

            {/* Inactive Toggle */}
            <button
              type="button"
              onClick={() => setShowInactive(!showInactive)}
              className={`text-xs font-bold px-3 py-2 rounded-xl border flex items-center gap-1.5 cursor-pointer transition-all ${
                showInactive 
                  ? "bg-navy text-gold border-navy" 
                  : "bg-white text-muted-grey hover:text-navy border-light"
              }`}
              title="Toggle inactive staff visibility"
            >
              {showInactive ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              <span>{showInactive ? "Showing All Staff" : "Active Staff Only"}</span>
            </button>
          </div>

          {/* Right: Prominent Save Attendance Button */}
          <div>
            <button
              type="button"
              onClick={handleSaveAttendance}
              disabled={isSaving}
              className={`w-full sm:w-auto text-xs font-bold px-6 py-2.5 rounded-xl border shadow-sm flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 disabled:opacity-50 ${
                isDirty
                  ? "bg-navy hover:bg-navy-hover text-gold border-gold/40 ring-2 ring-gold/20"
                  : "bg-navy hover:bg-navy-hover text-white border-navy"
              }`}
            >
              <Save className="w-4 h-4 text-gold" />
              <span>{isSaving ? "Saving Attendance..." : "Save Attendance"}</span>
            </button>
          </div>
        </div>

        {/* Error Feedback Message */}
        {errorMessage && (
          <div className="bg-rose-50 border border-rose-200 text-rose-900 p-3.5 rounded-2xl flex items-start gap-2.5 text-xs animate-fade-in font-sans">
            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-bold block">Unable to save attendance. Please try again.</span>
              <p className="text-rose-800 text-[11px] mt-0.5">{errorMessage}</p>
            </div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-rose-700 hover:text-rose-950 font-bold px-2 py-0.5"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* 4. WORKER ATTENDANCE LIST / CARDS                        */}
      {/* ======================================================== */}
      <div className="space-y-3">
        {displayedWorkers.length === 0 ? (
          <div className="bg-white border-2 border-dashed border-light rounded-3xl p-10 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-cream/40 text-gold flex items-center justify-center mx-auto">
              <Users className="w-6 h-6" />
            </div>
            <h4 className="text-base font-serif font-bold text-navy">No Staff Members Found</h4>
            <p className="text-xs text-muted-grey max-w-sm mx-auto">
              {searchQuery ? "No workers match the search text. Try clearing the search." : "No active staff registered. Add staff members in the Staff Directory."}
            </p>
          </div>
        ) : (
          displayedWorkers.map((worker) => {
            const current = attendanceState[worker.id] || { status: "Not Marked", notes: "" };
            const status = current.status;
            
            // Check if worker has check-in/out record from terminal
            const dayRecord = attendance.find(r => r.workerId === worker.id && r.date === selectedDate);
            const checkInTime = dayRecord?.checkInTime;
            const checkOutTime = dayRecord?.checkOutTime;

            const isPresentSelected = status === "Present" || status === "Checked In" || status === "Checked Out" || status === "Paid Leave";
            const isHalfDaySelected = status === "Half Day";
            const isAbsentSelected = status === "Absent";
            const isNotMarked = status === "Not Marked";

            return (
              <div
                key={worker.id}
                className={`bg-white border rounded-2xl p-4 sm:p-4.5 shadow-2xs transition-all flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 ${
                  !worker.active
                    ? "opacity-60 bg-slate-50/70 border-light"
                    : isNotMarked
                    ? "border-light hover:border-gold/40"
                    : isPresentSelected
                    ? "border-emerald-200/90 bg-emerald-50/10"
                    : isHalfDaySelected
                    ? "border-amber-200/90 bg-amber-50/10"
                    : "border-rose-200/90 bg-rose-50/10"
                }`}
              >
                {/* Worker Particulars: Avatar, Name, Role, Mobile */}
                <div className="flex items-center gap-3.5 min-w-0">
                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                    {worker.photoUrl ? (
                      <img
                        src={worker.photoUrl}
                        alt={worker.name}
                        className="w-12 h-12 rounded-full object-cover border-2 border-gold/40 shadow-2xs"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-navy text-gold font-serif font-black text-sm flex items-center justify-center border-2 border-gold/30 shadow-2xs">
                        {getInitials(worker.name)}
                      </div>
                    )}
                    {worker.active ? (
                      <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full" title="Active Staff" />
                    ) : (
                      <span className="absolute bottom-0 right-0 w-3 h-3 bg-slate-400 border-2 border-white rounded-full" title="Inactive Staff" />
                    )}
                  </div>

                  {/* Name & Role */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-bold text-navy text-sm sm:text-base truncate">
                        {worker.name}
                      </h4>
                      {!worker.active && (
                        <span className="text-[9px] font-bold text-muted-grey bg-slate-100 px-2 py-0.5 rounded-md">
                          Inactive
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-grey flex-wrap mt-0.5">
                      <span className="font-medium text-navy/70">{worker.role}</span>
                      {worker.mobileNumber && (
                        <>
                          <span className="text-light">•</span>
                          <span className="font-mono text-[11px]">{worker.mobileNumber}</span>
                        </>
                      )}
                    </div>

                    {/* Optional Clock In / Clock Out timestamps if available */}
                    {checkInTime && (
                      <div className="flex items-center gap-1.5 text-[10px] font-mono text-emerald-800 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-md mt-1 w-fit">
                        <Clock className="w-3 h-3 text-emerald-600" />
                        <span>In: {new Date(checkInTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                        {checkOutTime && (
                          <span> → Out: {new Date(checkOutTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                        )}
                        {dayRecord?.totalHours ? ` (${dayRecord.totalHours} hrs)` : ""}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: 3 Large Clickable Status Buttons + Optional Note */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                  
                  {/* Status Buttons Group */}
                  <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center sm:gap-2">
                    
                    {/* 🟢 PRESENT BUTTON */}
                    <button
                      type="button"
                      onClick={() => handleSetStatus(worker.id, "Present")}
                      className={`min-h-[44px] sm:min-h-[40px] px-3 sm:px-4.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-95 ${
                        isPresentSelected
                          ? "bg-emerald-600 text-white font-black shadow-sm ring-2 ring-emerald-600/30 border border-emerald-600"
                          : "bg-cream/15 text-charcoal hover:bg-emerald-50 hover:text-emerald-800 hover:border-emerald-300 border border-light"
                      }`}
                    >
                      <span className="text-sm">🟢</span>
                      <span>Present</span>
                      {isPresentSelected && <Check className="w-3.5 h-3.5 stroke-[3] ml-0.5" />}
                    </button>

                    {/* 🟡 HALF DAY BUTTON */}
                    <button
                      type="button"
                      onClick={() => handleSetStatus(worker.id, "Half Day")}
                      className={`min-h-[44px] sm:min-h-[40px] px-3 sm:px-4.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-95 ${
                        isHalfDaySelected
                          ? "bg-amber-500 text-white font-black shadow-sm ring-2 ring-amber-500/30 border border-amber-500"
                          : "bg-cream/15 text-charcoal hover:bg-amber-50 hover:text-amber-800 hover:border-amber-300 border border-light"
                      }`}
                    >
                      <span className="text-sm">🟡</span>
                      <span>Half Day</span>
                      {isHalfDaySelected && <Check className="w-3.5 h-3.5 stroke-[3] ml-0.5" />}
                    </button>

                    {/* 🔴 ABSENT BUTTON */}
                    <button
                      type="button"
                      onClick={() => handleSetStatus(worker.id, "Absent")}
                      className={`min-h-[44px] sm:min-h-[40px] px-3 sm:px-4.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 active:scale-95 ${
                        isAbsentSelected
                          ? "bg-rose-600 text-white font-black shadow-sm ring-2 ring-rose-600/30 border border-rose-600"
                          : "bg-cream/15 text-charcoal hover:bg-rose-50 hover:text-rose-800 hover:border-rose-300 border border-light"
                      }`}
                    >
                      <span className="text-sm">🔴</span>
                      <span>Absent</span>
                      {isAbsentSelected && <Check className="w-3.5 h-3.5 stroke-[3] ml-0.5" />}
                    </button>
                  </div>

                  {/* Optional Note Toggle / Input */}
                  <div className="flex items-center justify-end">
                    {expandedNotesWorkerId === worker.id ? (
                      <div className="flex items-center gap-1 w-full sm:w-48">
                        <input
                          type="text"
                          placeholder="Note (e.g. late 30m)..."
                          value={current.notes}
                          onChange={(e) => handleSetNotes(worker.id, e.target.value)}
                          className="w-full text-xs px-2.5 py-1.5 border border-gold rounded-lg bg-white focus:outline-none"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => setExpandedNotesWorkerId(null)}
                          className="text-xs text-navy font-bold px-1.5 py-1 hover:bg-cream/30 rounded"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setExpandedNotesWorkerId(worker.id)}
                        className={`text-xs p-2 rounded-lg border transition-colors cursor-pointer ${
                          current.notes 
                            ? "text-gold bg-navy border-navy" 
                            : "text-muted-grey hover:text-navy border-transparent hover:border-light"
                        }`}
                        title={current.notes ? `Note: ${current.notes}` : "Add optional note"}
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ======================================================== */}
      {/* 5. BOTTOM STICKY SAVE BAR (Visible when changes exist)   */}
      {/* ======================================================== */}
      {isDirty && (
        <div className="sticky bottom-4 z-20 bg-navy text-white p-4 rounded-2xl shadow-xl border border-gold/40 flex flex-col sm:flex-row items-center justify-between gap-3 animate-slide-up">
          <div className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-gold animate-pulse" />
            <span className="font-bold">You have unsaved attendance changes for {formattedDateDisplay.fullDate}</span>
          </div>
          
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleSaveAttendance}
              disabled={isSaving}
              className="w-full sm:w-auto bg-gold hover:bg-gold/90 text-navy font-bold text-xs px-6 py-2.5 rounded-xl shadow-md cursor-pointer transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              <Save className="w-4 h-4 text-navy" />
              <span>{isSaving ? "Saving to Cloud..." : "Save Attendance Now"}</span>
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
