import React from 'react';
import { Scissors, Plus, Phone, CheckCircle2, UserCheck, Users, Award, Shirt } from 'lucide-react';
import { Worker } from '../../types';

interface WorkersViewProps {
  workers: Worker[];
  onAddWorker: () => void;
  onRecordAdvance?: (workerId: string, amount: number) => void;
  onMarkPayoutPaid?: (workerId: string) => void;
}

export const WorkersView: React.FC<WorkersViewProps> = ({
  workers,
  onAddWorker
}) => {
  const masterCuttersCount = workers.filter(w => (w.role || '').toLowerCase().includes('cutter') || (w.role || '').toLowerCase().includes('master')).length;
  const totalGarmentsCrafted = workers.reduce((sum, w) => sum + (w.garmentsCompletedThisMonth || 0), 0);

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-[#E6E1D7] shadow-2xs">
        <div>
          <div className="text-[10px] font-bold tracking-[0.2em] text-[#C9A24A] uppercase mb-1 brand-font">
            ARTISAN ROSTER
          </div>
          <h1 className="text-2xl font-extrabold text-[#071426] brand-font">
            Artisans & Staff
          </h1>
          <p className="text-xs text-[#7A7060]">
            Master cutters, tailors, hand finishers, workshop capacity, and garment craftsmanship metrics.
          </p>
        </div>

        <button
          onClick={onAddWorker}
          className="px-4 py-2.5 bg-[#C9A24A] hover:bg-[#B8913B] text-[#071426] font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-2 self-start sm:self-auto cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add Artisan / Staff</span>
        </button>
      </div>

      {/* Operational Metrics Summary Box */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-[#E6E1D7] shadow-2xs">
          <div className="text-[10px] font-bold text-[#8C7E6A] uppercase">Active Artisans</div>
          <div className="text-xl font-extrabold text-[#071426] mt-1">{workers.length} Staff</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-[#E6E1D7] shadow-2xs">
          <div className="text-[10px] font-bold text-[#8C7E6A] uppercase">Garments Tailored This Month</div>
          <div className="text-xl font-extrabold text-[#C9A24A] mt-1">
            {totalGarmentsCrafted} Garments
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-[#E6E1D7] shadow-2xs">
          <div className="text-[10px] font-bold text-[#8C7E6A] uppercase">Master Cutters & Tailors</div>
          <div className="text-xl font-extrabold text-emerald-800 mt-1">
            {masterCuttersCount} Specialists
          </div>
        </div>
      </div>

      {/* Workers Cards Grid */}
      {workers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E6E1D7] p-14 text-center shadow-2xs">
          <div className="max-w-sm mx-auto space-y-3">
            <div className="w-12 h-12 rounded-full bg-[#FAF8F5] border border-[#E5DFD5] flex items-center justify-center mx-auto text-[#C9A24A]">
              <Users className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-[#071426]">No Staff Added Yet</h3>
            <p className="text-xs text-[#7A7060]">
              Add master cutters, tailors, and hand finishers to manage workshop assignments.
            </p>
            <button
              onClick={onAddWorker}
              className="mt-2 px-4 py-2 bg-[#071426] text-[#D4AF5A] text-xs font-semibold rounded-xl hover:bg-[#0E2038] transition-colors cursor-pointer inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5 text-[#C9A24A]" />
              <span>+ Add Staff Member</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {workers.map(w => (
            <div
              key={w.id}
              className="bg-white rounded-2xl border border-[#E6E1D7] p-5 shadow-2xs space-y-4 relative hover:border-[#C9A24A] transition-all"
            >
              <div className="flex items-center justify-between pb-3 border-b border-[#F2ECE1]">
                <div>
                  <span className="text-[10px] font-bold text-[#C9A24A] uppercase tracking-wider">
                    {w.role}
                  </span>
                  <h3 className="text-base font-bold text-[#071426]">{w.name}</h3>
                  <div className="text-xs text-[#7A7060] flex items-center gap-1 mt-0.5">
                    <Phone className="w-3 h-3 text-[#C9A24A]" />
                    <span>{w.phone}</span>
                  </div>
                </div>

                <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-[#FAF8F5] text-[#071426] border border-[#E0D8CB]">
                  {w.type || 'In-House'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-[#FAF8F5] p-3 rounded-xl border border-[#F2ECE1]">
                  <div className="text-[10px] text-[#8C7E6A] uppercase font-bold">Monthly Output</div>
                  <div className="font-bold text-[#071426] text-sm mt-0.5">{w.garmentsCompletedThisMonth} pcs</div>
                </div>

                <div className="bg-[#FAF8F5] p-3 rounded-xl border border-[#F2ECE1]">
                  <div className="text-[10px] text-[#8C7E6A] uppercase font-bold">Workshop Status</div>
                  <div className="font-bold text-emerald-800 text-xs mt-0.5 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                    <span>Available</span>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-[#071426] text-[#F7F3EA] rounded-xl flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-[#A39682] uppercase font-bold">Specialty Role</div>
                  <div className="text-xs font-bold text-[#D4AF5A]">
                    {w.role}
                  </div>
                </div>
                <span className="px-2.5 py-1 bg-white/10 text-white font-medium text-[10px] rounded-lg">
                  Active Staff
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
