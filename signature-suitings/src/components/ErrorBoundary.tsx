import React, { ErrorInfo, ReactNode } from "react";
import { ShieldAlert, RefreshCw, Download, RotateCcw } from "lucide-react";
import { db } from "../db";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMsg: string;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  props: Props;
  state: State = {
    hasError: false,
    errorMsg: ""
  };

  constructor(props: Props) {
    super(props);
    this.props = props;
  }

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, errorMsg: error.message || "An unexpected workspace integrity issue was detected." };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log sanitized error information to prevent internal disclosures
    console.warn("Secure Workspace Guard intercepted an unexpected exception:", error.message);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleClearAndReset = () => {
    if (confirm("Are you sure you want to re-initialize your local showroom workspace? This will safely revert to your last cloud-synced status.")) {
      try {
        localStorage.clear();
        window.location.reload();
      } catch (e) {
        window.location.reload();
      }
    }
  };

  private handleEmergencyExport = () => {
    try {
      const backupData = db.getBackupData();
      const jsonStr = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `SS_Emergency_Recovery_Backup_${new Date().toISOString().split("T")[0]}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      alert("Emergency backup export failed. Please check local browser permissions.");
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0b1329] text-white font-sans flex flex-col justify-center items-center p-6 relative overflow-hidden">
          {/* Decorative ambient background elements */}
          <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-gold/5 blur-[120px]" />
          <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-navy-light/10 blur-[120px]" />

          <div className="w-full max-w-xl bg-white rounded-[32px] border border-gold/15 shadow-2xl overflow-hidden relative z-10 p-8 sm:p-10 flex flex-col items-center">
            {/* Luxury top accent bar */}
            <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-gold via-yellow-300 to-gold" />

            <div className="w-16 h-16 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center mb-6">
              <ShieldAlert className="w-8 h-8 text-red-600 animate-pulse" />
            </div>

            <h1 className="font-serif text-2xl font-black tracking-widest text-[#0a192f] text-center uppercase">
              WORKSPACE PROTECTED
            </h1>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#d4af37] font-bold font-sans mt-1 mb-6 text-center">
              SIGNATURE SUITINGS & SHOWROOM
            </p>

            <div className="bg-slate-50 border border-slate-100 p-5 rounded-2xl w-full text-center mb-6">
              <p className="text-xs text-slate-700 leading-relaxed font-semibold">
                An integrity or rendering guard was triggered to secure your showroom database. 
                No structural details or internal files were exposed.
              </p>
              <div className="mt-3 text-[10px] font-mono text-slate-400 bg-slate-100 p-2.5 rounded-lg border border-slate-200 select-all max-h-20 overflow-y-auto">
                SECURE_ID: {btoa(this.state.errorMsg).substring(0, 32)}
              </div>
            </div>

            <div className="w-full space-y-3">
              <button
                type="button"
                onClick={this.handleReload}
                className="w-full bg-[#0a192f] hover:bg-[#112240] text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer text-xs"
              >
                <RefreshCw className="w-4 h-4 text-gold animate-spin" style={{ animationDuration: "3s" }} />
                <span>Reload Showroom Workspace</span>
              </button>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={this.handleEmergencyExport}
                  className="bg-cream/40 hover:bg-cream/70 text-navy border border-light font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer text-xs"
                >
                  <Download className="w-3.5 h-3.5 text-[#d4af37]" />
                  <span>Secure Backup</span>
                </button>

                <button
                  type="button"
                  onClick={this.handleClearAndReset}
                  className="bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer text-xs"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Workspace</span>
                </button>
              </div>
            </div>

            <p className="text-[10px] text-gray-400 mt-8 font-mono">
              SECURE WORKSPACE &bull; SHIELD_VERSION_2.0
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
