import React, { useState } from 'react';
import { Calendar, Plus, Clock, CheckCircle2, AlertCircle, Edit3, Trash2, User, Scissors } from 'lucide-react';
import { Fitting } from '../../types';

interface FittingsViewProps {
  fittings: Fitting[];
  onNewFitting: () => void;
  onUpdateFittingStatus: (fittingId: string, status: Fitting['status'], notes?: string) => void;
  onDeleteFitting: (fittingId: string) => void;
}

export const FittingsView: React.FC<FittingsViewProps> = ({
  fittings,
  onNewFitting,
  onUpdateFittingStatus,
  onDeleteFitting
}) => {
  const [filterStatus, setFilterStatus] = useState<string>('All');

  const filtered = fittings.filter(f => filterStatus === 'All' || f.status === filterStatus);

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-[#E6E1D7] shadow-2xs">
        <div>
          <div className="text-[10px] font-bold tracking-[0.2em] text-[#C9A24A] uppercase mb-1 brand-font">
            SHOWROOM APPOINTMENTS
          </div>
          <h1 className="text-2xl font-extrabold text-[#071426] brand-font">
            Fitting & Trials
          </h1>
          <p className="text-xs text-[#7A7060]">
            Bespoke trial appointments, canvas drape adjustments, and trial fitting logs.
          </p>
        </div>

        <button
          onClick={onNewFitting}
          className="px-4 py-2.5 bg-[#C9A24A] hover:bg-[#B8913B] text-[#071426] font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-2 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Schedule New Trial</span>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-[#E6E1D7] pb-3">
        {['All', 'Scheduled', 'Completed', 'Re-Trial Needed', 'Cancelled'].map(st => (
          <button
            key={st}
            onClick={() => setFilterStatus(st)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
              filterStatus === st
                ? 'bg-[#071426] text-[#D4AF5A] border-[#C9A24A]'
                : 'bg-white text-[#6E6454] border-[#E6E1D7] hover:bg-[#F7F3EA]'
            }`}
          >
            {st}
          </button>
        ))}
      </div>

      {/* Fittings List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.length > 0 ? (
          filtered.map(fit => (
            <div
              key={fit.id}
              className="bg-white rounded-xl border border-[#E6E1D7] p-5 shadow-2xs space-y-3 relative hover:border-[#C9A24A] transition-all"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#C9A24A] bg-[#F7F3EA] px-2 py-0.5 rounded border border-[#E0D8CB]">
                  {fit.trialStage}
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  fit.status === 'Completed' ? 'bg-emerald-100 text-emerald-800' :
                  fit.status === 'Scheduled' ? 'bg-blue-100 text-blue-800' :
                  fit.status === 'Re-Trial Needed' ? 'bg-amber-100 text-amber-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {fit.status}
                </span>
              </div>

              <div>
                <h3 className="font-bold text-[#071426] text-base flex items-center gap-2">
                  <User className="w-4 h-4 text-[#C9A24A]" />
                  <span>{fit.customerName}</span>
                </h3>
                <div className="text-xs text-[#7A7060] mt-0.5">
                  Order: <strong className="text-[#071426]">{fit.orderId}</strong> • {fit.garment}
                </div>
              </div>

              <div className="p-3 bg-[#F7F3EA] rounded-lg text-xs space-y-1">
                <div className="flex items-center justify-between text-[#071426] font-semibold">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-[#C9A24A]" />
                    <span>{fit.scheduledDate}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-[#C9A24A]" />
                    <span>{fit.scheduledTime}</span>
                  </span>
                </div>
              </div>

              {fit.adjustmentNotes && (
                <div className="text-xs text-[#6E6454] italic border-l-2 border-[#C9A24A] pl-2 py-0.5">
                  "{fit.adjustmentNotes}"
                </div>
              )}

              {/* Status Update Quick Buttons */}
              <div className="pt-2 border-t border-[#F2ECE1] flex items-center justify-between">
                <div className="flex gap-1">
                  <button
                    onClick={() => onUpdateFittingStatus(fit.id, 'Completed')}
                    className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-[10px] rounded transition-colors"
                  >
                    Mark Done
                  </button>
                  <button
                    onClick={() => onUpdateFittingStatus(fit.id, 'Re-Trial Needed')}
                    className="px-2 py-1 bg-amber-600 hover:bg-amber-700 text-white font-bold text-[10px] rounded transition-colors"
                  >
                    Re-Trial
                  </button>
                </div>

                <button
                  onClick={() => onDeleteFitting(fit.id)}
                  className="p-1 text-[#8C7E6A] hover:text-red-600"
                  title="Cancel & Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-full py-14 px-6 bg-white rounded-2xl border border-[#E6E1D7] text-center shadow-2xs">
            {fittings.length === 0 ? (
              <div className="max-w-sm mx-auto space-y-3">
                <div className="w-12 h-12 rounded-full bg-[#FAF8F5] border border-[#E5DFD5] flex items-center justify-center mx-auto text-[#C9A24A]">
                  <Scissors className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-[#071426]">No Fittings Scheduled</h3>
                <p className="text-xs text-[#7A7060]">
                  Upcoming fittings and trials will appear here.
                </p>
                <button
                  onClick={onNewFitting}
                  className="mt-2 px-4 py-2 bg-[#071426] text-[#D4AF5A] text-xs font-semibold rounded-xl hover:bg-[#0E2038] transition-colors cursor-pointer inline-flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5 text-[#C9A24A]" />
                  <span>+ Schedule Fitting</span>
                </button>
              </div>
            ) : (
              <div className="text-xs text-[#8C7E6A]">
                No trial fitting appointments match the selected filter.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
