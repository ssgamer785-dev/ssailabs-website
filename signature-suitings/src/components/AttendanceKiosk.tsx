import React, { useState, useEffect } from "react";
import { 
  Clock, 
  Search, 
  ArrowLeft, 
  CheckCircle, 
  LogIn, 
  LogOut, 
  UserCheck,
  Sparkles,
  User
} from "lucide-react";
import { db } from "../db";
import { Worker, AttendanceRecord } from "../types";

interface AttendanceKioskProps {
  onBackToLogin: () => void;
}

export default function AttendanceKiosk({ onBackToLogin }: AttendanceKioskProps) {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // Feedback alerts
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const todayStr = new Date().toISOString().split("T")[0];

  const reloadData = () => {
    setWorkers(db.getActiveWorkers());
    setAttendance(db.getAttendance());
  };

  useEffect(() => {
    reloadData();
    const unsubscribe = db.onSync(reloadData);
    
    // Refresh database records every 10 seconds to sync with cloud/local modifications
    const dataTimer = setInterval(() => {
      reloadData();
    }, 10000);

    // Update live clock every second
    const clockTimer = setInterval(() => {
      setCurrentTime(new Date());
    }, 10000);

    return () => {
      unsubscribe();
      clearInterval(dataTimer);
      clearInterval(clockTimer);
    };
  }, []);

  const filteredWorkers = workers.filter(w => 
    w.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    w.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (w.mobileNumber && w.mobileNumber.includes(searchQuery))
  );

  const getTodayRecord = (workerId: string) => {
    return attendance.find(r => r.workerId === workerId && r.date === todayStr);
  };

  const handleCheckIn = (worker: Worker) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      db.checkInWorker(worker.id, worker.name, todayStr);
      reloadData();
      setSelectedWorker(null);
      setSuccessMsg(`🎉 check-in SUCCESS! ${worker.name} is now checked-in at ${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}`);
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to complete check-in.");
    }
  };

  const handleCheckOut = (worker: Worker) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      db.checkOutWorker(worker.id, todayStr);
      reloadData();
      setSelectedWorker(null);
      setSuccessMsg(`✅ check-out SUCCESS! ${worker.name} checked-out at ${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}`);
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to complete check-out.");
    }
  };

  return (
    <div className="min-h-screen bg-navy text-white font-sans flex flex-col justify-between selection:bg-gold selection:text-navy relative overflow-hidden">
      
      {/* Background Decorative Art */}
      <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-gold/5 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-gold/5 blur-3xl pointer-events-none" />

      {/* Header Bar */}
      <header className="border-b border-gold/15 bg-navy-hover/30 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4 z-10">
        <div className="flex items-center gap-3">
          <button 
            onClick={onBackToLogin}
            className="p-2.5 rounded-xl border border-gold/20 hover:bg-gold/10 text-gold transition-all cursor-pointer flex items-center justify-center"
            title="Back to Sign In"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="font-serif font-black tracking-widest text-lg text-gold flex items-center gap-2">
              SIGNATURE SUITINGS
            </h1>
            <p className="text-[10px] tracking-widest text-white/50 uppercase font-bold">
              Staff Attendance Register & Kiosk
            </p>
          </div>
        </div>

        {/* Live Clock Display */}
        <div className="flex items-center gap-3.5 bg-black/20 border border-gold/10 px-5 py-2.5 rounded-2xl">
          <Clock className="w-6 h-6 text-gold animate-pulse" />
          <div className="text-right">
            <p className="font-mono text-xl font-bold text-gold leading-none">
              {currentTime.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })}
            </p>
            <p className="text-[10px] text-white/60 font-bold tracking-wide mt-1">
              {currentTime.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", year: "numeric" })}
            </p>
          </div>
        </div>
      </header>

      {/* Main Grid Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 flex flex-col md:flex-row gap-6 z-10 overflow-hidden">
        
        {/* Left Column: Worker Directory List */}
        <div className="flex-1 flex flex-col bg-black/25 border border-gold/10 rounded-3xl p-6 space-y-4 overflow-hidden min-h-[400px]">
          
          <div className="space-y-1">
            <h2 className="text-base font-serif font-bold text-gold">Select Your Name</h2>
            <p className="text-xs text-white/60">Tap your card to register arrival or departure.</p>
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gold/60" />
            <input 
              type="text" 
              placeholder="Search by name, role or mobile..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-navy border border-gold/25 rounded-2xl pl-11 pr-4 py-3.5 text-sm font-medium focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold transition-all placeholder:text-white/30"
            />
          </div>

          {/* Directory Grid */}
          <div className="flex-1 overflow-y-auto scrollbar-none pr-1 grid grid-cols-1 sm:grid-cols-2 gap-3 pb-4">
            {filteredWorkers.map(w => {
              const todayRecord = getTodayRecord(w.id);
              const isCheckedIn = todayRecord?.status === "Checked In";
              const isCheckedOut = todayRecord?.status === "Checked Out" || (todayRecord && todayRecord.status !== "Checked In");

              let statusText = "Absent";
              let badgeColor = "bg-rose-500/10 text-rose-400 border-rose-500/20";
              
              if (todayRecord) {
                if (todayRecord.status === "Checked In") {
                  statusText = `Checked In (${new Date(todayRecord.checkInTime!).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })})`;
                  badgeColor = "bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse";
                } else if (todayRecord.status === "Checked Out") {
                  statusText = `Completed (${todayRecord.totalHours || 0} hrs worked)`;
                  badgeColor = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
                } else {
                  statusText = todayRecord.status;
                  if (todayRecord.status === "Present") {
                    badgeColor = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
                  } else if (todayRecord.status === "Half Day") {
                    badgeColor = "bg-amber-500/10 text-amber-400 border-amber-500/20";
                  } else if (todayRecord.status === "Paid Leave") {
                    badgeColor = "bg-blue-500/10 text-blue-400 border-blue-500/20";
                  }
                }
              }

              const isCurrentlySelected = selectedWorker?.id === w.id;

              return (
                <button
                  key={w.id}
                  onClick={() => {
                    setSelectedWorker(w);
                    setErrorMsg(null);
                  }}
                  className={`flex items-center gap-4 p-4 rounded-2xl border text-left transition-all hover:bg-gold/5 cursor-pointer relative group ${
                    isCurrentlySelected 
                      ? "bg-gold/10 border-gold shadow-lg shadow-gold/5 ring-1 ring-gold" 
                      : "bg-navy-light/40 border-gold/10"
                  }`}
                >
                  {/* Worker Photo or Initials */}
                  <div className="w-12 h-12 rounded-xl overflow-hidden border border-gold/20 flex-shrink-0 bg-black/40 flex items-center justify-center text-gold font-bold">
                    {w.photoUrl ? (
                      <img src={w.photoUrl} alt={w.name} className="w-full h-full object-cover" />
                    ) : (
                      w.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm truncate text-white group-hover:text-gold transition-colors">{w.name}</p>
                    <p className="text-[10px] text-white/50 font-medium tracking-wide truncate">{w.role}</p>
                    
                    {/* Status Badge */}
                    <span className={`inline-block mt-1.5 px-2.5 py-0.5 rounded-full border text-[9px] font-bold ${badgeColor}`}>
                      ● {statusText}
                    </span>
                  </div>
                </button>
              );
            })}

            {filteredWorkers.length === 0 && (
              <div className="col-span-full py-16 text-center text-white/40 font-medium">
                No active workers found matching search.
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Attendance Action Panel */}
        <div className="w-full md:w-[380px] bg-black/25 border border-gold/10 rounded-3xl p-6 flex flex-col justify-between gap-6 min-h-[350px]">
          
          <div className="space-y-4">
            <h3 className="text-base font-serif font-bold text-gold border-b border-gold/10 pb-2">
              Punch Console
            </h3>

            {/* Notification messages */}
            {successMsg && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-4 rounded-2xl text-xs font-semibold leading-relaxed flex items-start gap-2.5 animate-fade-in">
                <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                <span>{successMsg}</span>
              </div>
            )}

            {errorMsg && (
              <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-2xl text-xs font-semibold leading-relaxed animate-fade-in">
                ⚠️ {errorMsg}
              </div>
            )}

            {selectedWorker ? (
              <div className="space-y-5 animate-fade-in">
                {/* Worker Preview Card */}
                <div className="bg-navy border border-gold/15 p-5 rounded-2xl flex flex-col items-center text-center space-y-3 relative overflow-hidden">
                  <div className="absolute top-2 right-3 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-gold" />
                    <span className="text-[8px] font-bold text-gold/80 uppercase tracking-widest">Active Staff</span>
                  </div>

                  <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-gold flex items-center justify-center bg-black/40 text-gold text-2xl font-black shadow-lg">
                    {selectedWorker.photoUrl ? (
                      <img src={selectedWorker.photoUrl} alt={selectedWorker.name} className="w-full h-full object-cover" />
                    ) : (
                      selectedWorker.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()
                    )}
                  </div>

                  <div>
                    <h4 className="font-serif font-black text-lg text-white">{selectedWorker.name}</h4>
                    <p className="text-xs font-bold text-gold mt-0.5">{selectedWorker.role}</p>
                    <p className="text-[10px] text-white/40 mt-1 font-mono">{selectedWorker.mobileNumber || "No mobile added"}</p>
                  </div>
                </div>

                {/* Punch Action Buttons */}
                <div className="grid grid-cols-2 gap-3.5">
                  <button
                    onClick={() => handleCheckIn(selectedWorker)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 px-4 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all shadow-md active:scale-95 cursor-pointer border border-emerald-500/30"
                  >
                    <LogIn className="w-6 h-6" />
                    <div className="text-center">
                      <p className="text-sm font-bold leading-none">PUNCH IN</p>
                      <p className="text-[9px] opacity-80 mt-1">Record Arrival</p>
                    </div>
                  </button>

                  <button
                    onClick={() => handleCheckOut(selectedWorker)}
                    className="bg-amber-600 hover:bg-amber-700 text-white font-bold py-4 px-4 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all shadow-md active:scale-95 cursor-pointer border border-amber-500/30"
                  >
                    <LogOut className="w-6 h-6" />
                    <div className="text-center">
                      <p className="text-sm font-bold leading-none">PUNCH OUT</p>
                      <p className="text-[9px] opacity-80 mt-1">Record Departure</p>
                    </div>
                  </button>
                </div>

                <button
                  onClick={() => setSelectedWorker(null)}
                  className="w-full bg-white/5 hover:bg-white/10 text-white/80 font-bold py-2.5 rounded-xl text-xs transition-colors cursor-pointer border border-white/10"
                >
                  Cancel Selection
                </button>
              </div>
            ) : (
              <div className="py-12 flex flex-col items-center justify-center text-center space-y-3 bg-navy-light/10 border border-dashed border-gold/10 rounded-2xl px-4">
                <div className="w-12 h-12 rounded-full bg-gold/5 flex items-center justify-center text-gold">
                  <UserCheck className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <p className="font-bold text-white text-xs">Waiting for staff selection</p>
                  <p className="text-[10px] text-white/55 max-w-[240px]">
                    Click on any staff member name in the directory to check-in or check-out.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-gold/10 pt-4 text-center">
            <p className="text-[9px] text-white/40 uppercase tracking-widest font-mono">
              Designed for ease of use in workshops &bull; © Signature Suitings
            </p>
          </div>
        </div>

      </main>

      {/* Footer copyright */}
      <footer className="border-t border-gold/10 bg-black/20 py-3.5 text-center text-[10px] text-white/35 font-mono">
        SIGNATURE SUITINGS SHOWROOM MANAGEMENT SYSTEM &bull; DAILY ATTENDANCE KIOSK TERMINAL V2
      </footer>

    </div>
  );
}
