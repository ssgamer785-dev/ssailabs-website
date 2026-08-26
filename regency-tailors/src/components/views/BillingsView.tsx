import React, { useState } from 'react';
import { FileText, Plus, Search, Printer, DollarSign, CheckCircle2, AlertCircle, Eye } from 'lucide-react';
import { Invoice, ShowroomProfile, Order } from '../../types';

interface BillingsViewProps {
  invoices: Invoice[];
  profile: ShowroomProfile;
  orders?: Order[];
  onNewInvoice: () => void;
  onRecordPayment: (invoiceId: string, amount: number) => void;
  onPrintBill?: (order: Order) => void;
}

export const BillingsView: React.FC<BillingsViewProps> = ({
  invoices,
  profile,
  orders = [],
  onNewInvoice,
  onRecordPayment,
  onPrintBill
}) => {
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(
    invoices.length > 0 ? invoices[0] : null
  );
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = invoices.filter(
    inv =>
      inv.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.customerPhone.includes(searchQuery)
  );

  const totalInvoiced = invoices.reduce((sum, i) => sum + i.grandTotal, 0);
  const totalCollected = invoices.reduce((sum, i) => sum + i.amountPaid, 0);
  const totalPending = invoices.reduce((sum, i) => sum + i.balanceRemaining, 0);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-[#E6E1D7] shadow-2xs">
        <div>
          <div className="text-[10px] font-bold tracking-[0.2em] text-[#C9A24A] uppercase mb-1 brand-font">
            FINANCIAL LEDGER
          </div>
          <h1 className="text-2xl font-extrabold text-[#071426] brand-font">
            Billings & Ledger
          </h1>
          <p className="text-xs text-[#7A7060]">
            GST Invoices, customer billing receipts, advance payment tracking, and ledger history.
          </p>
        </div>

        <button
          onClick={onNewInvoice}
          className="px-4 py-2.5 bg-[#C9A24A] hover:bg-[#B8913B] text-[#071426] font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-2 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Generate New Invoice</span>
        </button>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-[#E6E1D7] shadow-2xs">
          <div className="text-[10px] font-bold text-[#8C7E6A] uppercase">Total Invoiced</div>
          <div className="text-xl font-extrabold text-[#071426] mt-1">₹{totalInvoiced.toLocaleString('en-IN')}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-[#E6E1D7] shadow-2xs">
          <div className="text-[10px] font-bold text-[#8C7E6A] uppercase">Total Payments Collected</div>
          <div className="text-xl font-extrabold text-emerald-700 mt-1">₹{totalCollected.toLocaleString('en-IN')}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-[#E6E1D7] shadow-2xs">
          <div className="text-[10px] font-bold text-[#8C7E6A] uppercase">Pending Receivables</div>
          <div className="text-xl font-extrabold text-red-700 mt-1">₹{totalPending.toLocaleString('en-IN')}</div>
        </div>
      </div>

      {/* Main Grid: Invoices List (Left) + Printable Receipt (Right) */}
      {invoices.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E6E1D7] p-14 text-center shadow-2xs">
          <div className="max-w-sm mx-auto space-y-3">
            <div className="w-12 h-12 rounded-full bg-[#FAF8F5] border border-[#E5DFD5] flex items-center justify-center mx-auto text-[#C9A24A]">
              <FileText className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-[#071426]">No Billing Records</h3>
            <p className="text-xs text-[#7A7060]">
              Invoices and payments will appear here after tailoring orders are created.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left List (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-white p-3 rounded-xl border border-[#E6E1D7] flex items-center gap-2 shadow-2xs">
              <Search className="w-4 h-4 text-[#C9A24A]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search invoice # or customer..."
                className="w-full bg-transparent text-xs text-[#071426] outline-none placeholder:text-[#9A9080]"
              />
            </div>

            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {filtered.map(inv => (
                <div
                  key={inv.id}
                  onClick={() => setSelectedInvoice(inv)}
                  className={`p-4 rounded-xl border transition-all cursor-pointer space-y-2 ${
                    selectedInvoice?.id === inv.id
                      ? 'bg-white border-[#C9A24A] shadow-md ring-2 ring-[#C9A24A]/20'
                      : 'bg-white border-[#E6E1D7] hover:border-[#C9A24A]/60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-[#C9A24A] text-xs">{inv.id}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      inv.status === 'Paid' ? 'bg-emerald-100 text-emerald-800' :
                      inv.status === 'Partial' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {inv.status}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs font-bold text-[#071426]">
                    <span>{inv.customerName}</span>
                    <span>₹{inv.grandTotal.toLocaleString('en-IN')}</span>
                  </div>

                  <div className="text-[11px] text-[#7A7060] flex items-center justify-between">
                    <span>Date: {inv.date}</span>
                    <span className="text-red-600 font-semibold">Rem: ₹{inv.balanceRemaining.toLocaleString('en-IN')}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Printable Invoice Receipt Preview (7 cols) */}
          <div className="lg:col-span-7">
            {selectedInvoice ? (
              <div className="bg-white rounded-2xl border border-[#E6E1D7] p-8 shadow-2xs space-y-6 relative" id="printable-invoice">
                <div className="flex items-center justify-between border-b border-[#F2ECE1] pb-6">
                  <div>
                    <div className="text-2xl font-extrabold text-[#071426] brand-font tracking-wider">
                      {profile.name}
                    </div>
                    <div className="text-xs text-[#C9A24A] font-bold uppercase tracking-widest mt-0.5">
                      {profile.city}
                    </div>
                    <div className="text-[11px] text-[#7A7060] mt-1 max-w-xs leading-relaxed">
                      {profile.address}<br />
                      GSTIN: {profile.gstin} | Tel: {profile.phone}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-xs font-bold uppercase tracking-widest text-[#C9A24A]">INVOICE</div>
                    <div className="text-lg font-bold font-mono text-[#071426]">{selectedInvoice.id}</div>
                    <div className="text-xs text-[#7A7060] mt-1">Date: {selectedInvoice.date}</div>
                    <div className="text-xs text-[#7A7060]">Mode: {selectedInvoice.paymentMode}</div>
                  </div>
                </div>

                {/* Billed To */}
                <div className="p-4 bg-[#F7F3EA] rounded-xl flex items-center justify-between text-xs">
                  <div>
                    <div className="text-[10px] font-bold text-[#8C7E6A] uppercase">Billed To</div>
                    <div className="text-sm font-bold text-[#071426]">{selectedInvoice.customerName}</div>
                    <div className="text-[#6E6454]">{selectedInvoice.customerPhone}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-bold text-[#8C7E6A] uppercase">Order Reference</div>
                    <div className="font-mono font-bold text-[#C9A24A]">{selectedInvoice.orderId}</div>
                  </div>
                </div>

                {/* Items Table */}
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#E6E1D7] text-[#8C7E6A] uppercase font-semibold text-[10px] tracking-wider">
                      <th className="py-2">Description</th>
                      <th className="py-2 text-center">Qty</th>
                      <th className="py-2 text-right">Rate</th>
                      <th className="py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F2ECE1]">
                    {(selectedInvoice.items || []).map((item, idx) => (
                      <tr key={idx}>
                        <td className="py-2.5 font-medium text-[#071426]">{item.description}</td>
                        <td className="py-2.5 text-center text-[#6E6454]">{item.qty}</td>
                        <td className="py-2.5 text-right text-[#6E6454]">₹{item.rate.toLocaleString('en-IN')}</td>
                        <td className="py-2.5 text-right font-bold text-[#071426]">₹{item.amount.toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Calculation Totals */}
                <div className="border-t border-[#E6E1D7] pt-4 flex justify-end">
                  <div className="w-64 space-y-2 text-xs">
                    <div className="flex justify-between text-[#6E6454]">
                      <span>Subtotal:</span>
                      <span>₹{selectedInvoice.subtotal.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between text-[#6E6454]">
                      <span>GST (5%):</span>
                      <span>₹{selectedInvoice.gstAmount.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between text-[#6E6454]">
                      <span>Discount:</span>
                      <span>- ₹{selectedInvoice.discount.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between text-sm font-extrabold text-[#071426] pt-2 border-t border-[#E6E1D7]">
                      <span>Grand Total:</span>
                      <span>₹{selectedInvoice.grandTotal.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between text-emerald-700 font-bold">
                      <span>Amount Paid:</span>
                      <span>₹{selectedInvoice.amountPaid.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between text-red-600 font-extrabold text-sm pt-1 border-t border-dashed border-[#E6E1D7]">
                      <span>Balance Due:</span>
                      <span>₹{selectedInvoice.balanceRemaining.toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-4 border-t border-[#F2ECE1] flex items-center justify-between no-print">
                  {selectedInvoice.balanceRemaining > 0 && (
                    <button
                      onClick={() => {
                        const pay = prompt(`Enter payment amount received for ${selectedInvoice.id}:`, selectedInvoice.balanceRemaining.toString());
                        if (pay && parseFloat(pay) > 0) {
                          onRecordPayment(selectedInvoice.id, parseFloat(pay));
                        }
                      }}
                      className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-xs"
                    >
                      Record Payment Received
                    </button>
                  )}

                  <button
                    onClick={() => {
                      if (onPrintBill) {
                        const matchingOrder = orders.find(o => o.id === selectedInvoice.orderId || o.orderNumber === selectedInvoice.orderId);
                        if (matchingOrder) {
                          onPrintBill(matchingOrder);
                          return;
                        }
                        // Construct synthetic order from invoice
                        const synthOrder: Order = {
                          id: selectedInvoice.orderId || selectedInvoice.id,
                          orderNumber: selectedInvoice.orderId || selectedInvoice.id.replace('INV-', ''),
                          customerId: 'CUST-GEN',
                          customerName: selectedInvoice.customerName,
                          customerPhone: selectedInvoice.customerPhone,
                          customerAddress: 'Jalandhar, Punjab',
                          orderDate: selectedInvoice.date,
                          trialDate: selectedInvoice.date,
                          deliveryDate: selectedInvoice.date,
                          status: 'Ready for Pickup',
                          urgent: false,
                          totalAmount: selectedInvoice.grandTotal,
                          subtotal: selectedInvoice.subtotal,
                          discount: selectedInvoice.discount,
                          advancePaid: selectedInvoice.amountPaid,
                          balanceDue: selectedInvoice.balanceRemaining,
                          paymentMethod: selectedInvoice.paymentMode,
                          items: selectedInvoice.items.map(item => ({
                            id: `itm-${Math.random()}`,
                            garmentType: item.description.replace(' Bespoke Crafting', ''),
                            fabricCode: '',
                            fabricName: 'Premium Cloth',
                            notes: '',
                            price: item.rate,
                            quantity: item.qty
                          }))
                        };
                        onPrintBill(synthOrder);
                      } else {
                        handlePrint();
                      }
                    }}
                    className="px-4 py-2 bg-[#071426] text-[#D4AF5A] hover:bg-[#0B1930] font-bold text-xs rounded-xl shadow-xs flex items-center gap-2 ml-auto cursor-pointer"
                  >
                    <Printer className="w-4 h-4 text-[#C9A24A]" />
                    <span>Download / Print Bill</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-[#E6E1D7] p-12 text-center text-xs text-[#8C7E6A]">
                Select an invoice from the list to view billing details.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
