import React, { useState } from 'react';
import { TrendingUp, Plus, DollarSign, Wallet, ArrowDownRight, ArrowUpRight, PieChart } from 'lucide-react';
import { Expense, Invoice } from '../../types';

interface FinancesViewProps {
  invoices: Invoice[];
  expenses: Expense[];
  onAddExpense: (expense: Omit<Expense, 'id'>) => void;
}

export const FinancesView: React.FC<FinancesViewProps> = ({
  invoices,
  expenses,
  onAddExpense
}) => {
  const [showModal, setShowModal] = useState(false);
  const [cat, setCat] = useState<Expense['category']>('Fabric Inventory');
  const [desc, setDesc] = useState('');
  const [amt, setAmt] = useState('');
  const [paidTo, setPaidTo] = useState('');

  const totalRevenue = invoices.reduce((sum, i) => sum + i.amountPaid, 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const netProfit = totalRevenue - totalExpenses;

  const handleSubmitExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!desc || !amt) return;
    onAddExpense({
      date: new Date().toISOString().split('T')[0],
      category: cat,
      description: desc,
      amount: parseFloat(amt),
      paidTo: paidTo || 'Vendor'
    });
    setDesc('');
    setAmt('');
    setPaidTo('');
    setShowModal(false);
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-[#E6E1D7] shadow-2xs">
        <div>
          <div className="text-[10px] font-bold tracking-[0.2em] text-[#C9A24A] uppercase mb-1 brand-font">
            SHOWROOM PERFORMANCE
          </div>
          <h1 className="text-2xl font-extrabold text-[#071426] brand-font">
            Finances & Analytics
          </h1>
          <p className="text-xs text-[#7A7060]">
            P&L statement, fabric inventory expenses, artisan payouts, and net operating profit.
          </p>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2.5 bg-[#C9A24A] hover:bg-[#B8913B] text-[#071426] font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-2 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Record Expense</span>
        </button>
      </div>

      {/* Financial Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-[#E6E1D7] shadow-2xs">
          <div className="flex items-center justify-between text-xs font-bold text-[#8C7E6A] uppercase">
            <span>Total Collections</span>
            <ArrowUpRight className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-700 mt-2">
            ₹{totalRevenue.toLocaleString('en-IN')}
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-[#E6E1D7] shadow-2xs">
          <div className="flex items-center justify-between text-xs font-bold text-[#8C7E6A] uppercase">
            <span>Showroom Expenses</span>
            <ArrowDownRight className="w-4 h-4 text-red-600" />
          </div>
          <div className="text-2xl font-extrabold text-red-600 mt-2">
            ₹{totalExpenses.toLocaleString('en-IN')}
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-[#E6E1D7] shadow-2xs">
          <div className="flex items-center justify-between text-xs font-bold text-[#8C7E6A] uppercase">
            <span>Net Operating Profit</span>
            <TrendingUp className="w-4 h-4 text-[#C9A24A]" />
          </div>
          <div className={`text-2xl font-extrabold mt-2 ${netProfit >= 0 ? 'text-[#071426]' : 'text-red-600'}`}>
            ₹{netProfit.toLocaleString('en-IN')}
          </div>
        </div>
      </div>

      {/* Visual Revenue vs Expense Chart representation */}
      <div className="bg-white rounded-2xl border border-[#E6E1D7] p-6 shadow-2xs space-y-4">
        <h3 className="text-sm font-bold text-[#071426] flex items-center gap-2">
          <PieChart className="w-4 h-4 text-[#C9A24A]" />
          <span>Revenue vs Expense Comparison</span>
        </h3>

        {totalRevenue === 0 && totalExpenses === 0 ? (
          <div className="py-6 text-center text-xs text-[#8C7E6A]">
            No financial transactions recorded yet. Analytics will calculate automatically as orders and expenses are added.
          </div>
        ) : (
          <div className="space-y-3">
            {/* Revenue Bar */}
            <div>
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span className="text-emerald-800">Gross Collections (₹{totalRevenue.toLocaleString()})</span>
                <span className="text-[#8C7E6A]">100%</span>
              </div>
              <div className="h-4 bg-emerald-100 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-600 rounded-full w-full" />
              </div>
            </div>

            {/* Expense Bar */}
            <div>
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span className="text-red-800">Operational Costs (₹{totalExpenses.toLocaleString()})</span>
                <span className="text-[#8C7E6A]">
                  {totalRevenue > 0 ? Math.round((totalExpenses / totalRevenue) * 100) : 0}% of collections
                </span>
              </div>
              <div className="h-4 bg-red-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-red-600 rounded-full transition-all duration-500"
                  style={{ width: `${totalRevenue > 0 ? Math.min(100, (totalExpenses / totalRevenue) * 100) : 0}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Expense History Table */}
      <div className="bg-white rounded-2xl border border-[#E6E1D7] shadow-2xs overflow-hidden">
        <div className="p-4 bg-[#FAFAFA] border-b border-[#F2ECE1] font-bold text-xs text-[#071426]">
          Showroom Expense Ledger
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-[#F7F3EA] text-[#7A7060] font-bold uppercase text-[10px] border-b border-[#E6E1D7]">
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Description</th>
                <th className="py-3 px-4">Paid To</th>
                <th className="py-3 px-4 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F2ECE1]">
              {expenses.length > 0 ? (
                expenses.map(e => (
                  <tr key={e.id} className="hover:bg-[#F7F3EA]/50">
                    <td className="py-3 px-4 font-mono text-[#8C7E6A]">{e.date}</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#F7F3EA] text-[#071426] border border-[#E0D8CB]">
                        {e.category}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-semibold text-[#071426]">{e.description}</td>
                    <td className="py-3 px-4 text-[#6E6454]">{e.paidTo}</td>
                    <td className="py-3 px-4 text-right font-extrabold text-red-600">
                      ₹{e.amount.toLocaleString('en-IN')}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-xs text-[#8C7E6A]">
                    No showroom expenses recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Expense Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-[#E6E1D7] p-6 w-full max-w-md shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-[#071426] brand-font">Record Showroom Expense</h3>
            <form onSubmit={handleSubmitExpense} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-[#6E6454] mb-1">Category</label>
                <select
                  value={cat}
                  onChange={(e) => setCat(e.target.value as any)}
                  className="w-full bg-[#F7F3EA] border border-[#E0D8CB] p-2 rounded-lg outline-none focus:border-[#C9A24A]"
                >
                  <option value="Fabric Inventory">Fabric Inventory</option>
                  <option value="Linings & Canvas">Linings & Canvas</option>
                  <option value="Staff Wages">Staff Wages</option>
                  <option value="Showroom Utilities">Showroom Utilities</option>
                  <option value="Equipment & Maintenance">Equipment & Maintenance</option>
                  <option value="Misc">Misc</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-[#6E6454] mb-1">Description</label>
                <input
                  type="text"
                  required
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  placeholder="e.g. Scabal Tweed Fabric Import"
                  className="w-full bg-[#F7F3EA] border border-[#E0D8CB] p-2 rounded-lg outline-none focus:border-[#C9A24A]"
                />
              </div>

              <div>
                <label className="block font-bold text-[#6E6454] mb-1">Amount (₹)</label>
                <input
                  type="number"
                  required
                  value={amt}
                  onChange={(e) => setAmt(e.target.value)}
                  placeholder="e.g. 25000"
                  className="w-full bg-[#F7F3EA] border border-[#E0D8CB] p-2 rounded-lg outline-none focus:border-[#C9A24A]"
                />
              </div>

              <div>
                <label className="block font-bold text-[#6E6454] mb-1">Paid To / Vendor</label>
                <input
                  type="text"
                  value={paidTo}
                  onChange={(e) => setPaidTo(e.target.value)}
                  placeholder="e.g. Oberoi Textile Traders"
                  className="w-full bg-[#F7F3EA] border border-[#E0D8CB] p-2 rounded-lg outline-none focus:border-[#C9A24A]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-white border border-[#E0D8CB] text-[#071426] font-semibold rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#071426] text-[#D4AF5A] font-bold rounded-lg hover:bg-[#0B1930]"
                >
                  Save Expense
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
