import React, { useState } from 'react';
import { 
  Ruler, 
  Plus, 
  Search, 
  Printer, 
  Edit3, 
  Trash2, 
  Eye, 
  Phone, 
  Scissors, 
  Calendar, 
  FileText, 
  X, 
  Sparkles,
  LayoutGrid,
  Table as TableIcon,
  User,
  ArrowUpRight,
  Download,
  Loader2
} from 'lucide-react';
import { MeasurementRecord, Customer } from '../../types';
import { downloadElementAsPdf } from '../../utils/documentExport';

interface MeasurementsViewProps {
  measurements: MeasurementRecord[];
  customers: Customer[];
  onNewMeasurement: () => void;
  onEditMeasurement: (measurement: MeasurementRecord) => void;
  onDeleteMeasurement: (measurement: MeasurementRecord) => void;
}

export const MeasurementsView: React.FC<MeasurementsViewProps> = ({
  measurements,
  customers,
  onNewMeasurement,
  onEditMeasurement,
  onDeleteMeasurement
}) => {
  const [selectedFilter, setSelectedFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  
  // Modal for Viewing Full Measurement Sheet
  const [viewingRecord, setViewingRecord] = useState<MeasurementRecord | null>(null);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  // Filter list
  const filtered = measurements.filter(m => {
    const custPhone = m.customerPhone || customers.find(c => c.id === m.customerId)?.phone || '';
    const matchesSearch =
      m.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      custPhone.includes(searchQuery) ||
      (m.orderNumber && m.orderNumber.toLowerCase().includes(searchQuery.toLowerCase())) ||
      m.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (typeof m.garmentType === 'string' && m.garmentType.toLowerCase().includes(searchQuery.toLowerCase()));

    const garmentsList = m.selectedGarments || (typeof m.garmentType === 'string' ? m.garmentType.split(', ') : []);
    
    let matchesFilter = true;
    if (selectedFilter === 'Coat') {
      matchesFilter = garmentsList.some(g => g.toLowerCase().includes('coat') || g.toLowerCase().includes('suit') || g.toLowerCase().includes('blazer'));
    } else if (selectedFilter === 'Pant') {
      matchesFilter = garmentsList.some(g => g.toLowerCase().includes('pant') || g.toLowerCase().includes('trouser'));
    } else if (selectedFilter === 'Shirt') {
      matchesFilter = garmentsList.some(g => g.toLowerCase().includes('shirt'));
    } else if (selectedFilter === 'Kurta') {
      matchesFilter = garmentsList.some(g => g.toLowerCase().includes('kurta'));
    } else if (selectedFilter === 'Pajama') {
      matchesFilter = garmentsList.some(g => g.toLowerCase().includes('pajama'));
    }

    return matchesSearch && matchesFilter;
  });

  const handlePrint = (record: MeasurementRecord) => {
    setViewingRecord(record);
    setTimeout(() => {
      window.print();
    }, 250);
  };

  // Helper to extract phone
  const getCustomerPhone = (m: MeasurementRecord) => {
    if (m.customerPhone) return m.customerPhone;
    const c = customers.find(cust => cust.id === m.customerId);
    return c ? c.phone : '—';
  };

  // Helper to extract city
  const getCustomerCity = (m: MeasurementRecord) => {
    const c = customers.find(cust => cust.id === m.customerId);
    return c ? c.city : '';
  };

  // Statistics
  const totalCount = measurements.length;
  const coatCount = measurements.filter(m => m.coat || m.jacket || (m.selectedGarments && m.selectedGarments.includes('Coat'))).length;
  const pantCount = measurements.filter(m => m.pant || m.trouser || (m.selectedGarments && m.selectedGarments.includes('Pant'))).length;
  const shirtCount = measurements.filter(m => m.shirt || (m.selectedGarments && m.selectedGarments.includes('Shirt'))).length;
  const ethnicCount = measurements.filter(m => m.kurta || m.pajama || (m.selectedGarments && (m.selectedGarments.includes('Kurta') || m.selectedGarments.includes('Pajama')))).length;

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* ======================================================== */}
      {/* PAGE HEADER */}
      {/* ======================================================== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-[#E6E1D7] shadow-2xs">
        <div>
          <div className="text-[10px] font-bold tracking-[0.2em] text-[#C9A24A] uppercase mb-1">
            BESPOKE SPECIFICATIONS REGISTER
          </div>
          <h1 className="text-2xl font-extrabold text-[#071426]">
            Measurements
          </h1>
          <p className="text-xs text-[#7A7060] mt-0.5">
            Manage customer garment measurements &amp; cutter workshop specifications
          </p>
        </div>

        <button
          onClick={onNewMeasurement}
          className="px-5 py-2.5 bg-[#C9A24A] hover:bg-[#B8913B] text-[#071426] font-extrabold text-xs rounded-xl shadow-xs transition-all flex items-center gap-2 self-start sm:self-auto active:scale-95 cursor-pointer"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>+ New Measurement</span>
        </button>
      </div>

      {/* ======================================================== */}
      {/* QUICK METRICS BAR */}
      {/* ======================================================== */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-[#E6E1D7] shadow-2xs">
          <div className="text-[10px] font-bold text-[#8C7E6A] uppercase">Total Profiles</div>
          <div className="text-xl font-extrabold text-[#071426] mt-1">{totalCount}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-[#E6E1D7] shadow-2xs">
          <div className="text-[10px] font-bold text-[#8C7E6A] uppercase">Coats &amp; Suits</div>
          <div className="text-xl font-extrabold text-[#C9A24A] mt-1">{coatCount}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-[#E6E1D7] shadow-2xs">
          <div className="text-[10px] font-bold text-[#8C7E6A] uppercase">Pants &amp; Trousers</div>
          <div className="text-xl font-extrabold text-[#071426] mt-1">{pantCount}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-[#E6E1D7] shadow-2xs">
          <div className="text-[10px] font-bold text-[#8C7E6A] uppercase">Shirts &amp; Kurtas</div>
          <div className="text-xl font-extrabold text-[#071426] mt-1">{shirtCount + ethnicCount}</div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* SEARCH AND FILTER BAR */}
      {/* ======================================================== */}
      <div className="bg-white p-4 rounded-2xl border border-[#E6E1D7] shadow-2xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          
          {/* Search Box */}
          <div className="flex-1 bg-[#FAF8F5] border border-[#E0D8CB] px-3.5 py-2 rounded-xl flex items-center gap-2 focus-within:border-[#C9A24A] focus-within:bg-white transition-all">
            <Search className="w-4 h-4 text-[#C9A24A] shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search customer name, phone or order number..."
              className="w-full bg-transparent text-xs text-[#071426] outline-none placeholder:text-[#9A9080] font-medium"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-xs text-[#8C7E6A] hover:text-[#071426] font-bold px-1"
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex items-center justify-between gap-3">
            {/* Garment Filter Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0 scrollbar-none">
              {['All', 'Coat', 'Pant', 'Shirt', 'Kurta', 'Pajama'].map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedFilter(cat)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border cursor-pointer ${
                    selectedFilter === cat
                      ? 'bg-[#071426] text-[#D4AF5A] border-[#071426]'
                      : 'bg-[#FAF8F5] text-[#6E6454] border-[#E0D8CB] hover:bg-white'
                  }`}
                >
                  {cat === 'All' ? 'All Garments' : cat}
                </button>
              ))}
            </div>

            {/* Layout Toggle (Cards vs Table) */}
            <div className="flex items-center bg-[#FAF8F5] p-1 rounded-xl border border-[#E0D8CB]">
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                  viewMode === 'cards'
                    ? 'bg-[#071426] text-[#D4AF5A] shadow-xs'
                    : 'text-[#6E6454] hover:text-[#071426]'
                }`}
                title="Two-Column Studio Cards View"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-[#071426] text-[#D4AF5A] shadow-xs'
                    : 'text-[#6E6454] hover:text-[#071426]'
                }`}
                title="List Table View"
              >
                <TableIcon className="w-4 h-4" />
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* ======================================================== */}
      {/* 2-COLUMN STUDIO CARDS VIEW */}
      {/* ======================================================== */}
      {viewMode === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.length > 0 ? (
            filtered.map((record) => {
              const phone = getCustomerPhone(record);
              const city = getCustomerCity(record);
              const garments = record.selectedGarments || (typeof record.garmentType === 'string' ? record.garmentType.split(', ') : []);

              return (
                <div
                  key={record.id}
                  className="bg-white rounded-2xl border border-[#E6E1D7] hover:border-[#C9A24A]/60 transition-all p-5 shadow-2xs hover:shadow-sm flex flex-col justify-between space-y-4 group"
                >
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3 border-b border-[#F2ECE1] pb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#071426] text-[#D4AF5A] font-bold text-sm flex items-center justify-center shrink-0">
                        {record.customerName.charAt(0)}
                      </div>
                      <div>
                        <h3 className="font-extrabold text-sm text-[#071426] group-hover:text-[#C9A24A] transition-colors flex items-center gap-2">
                          <span>{record.customerName}</span>
                        </h3>
                        <div className="text-[11px] text-[#7A7060] flex items-center gap-2 mt-0.5">
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3 text-[#C9A24A]" />
                            <span>{phone}</span>
                          </span>
                          <span>•</span>
                          <span>{city}</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[10px] font-mono font-bold text-[#C9A24A] bg-[#FAF8F5] px-2 py-0.5 rounded-md border border-[#E0D8CB]">
                        {record.id}
                      </span>
                      {record.orderNumber && (
                        <div className="text-[10px] text-[#8C7E6A] font-mono mt-1">
                          Order: <strong className="text-[#071426]">{record.orderNumber}</strong>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Garment Quick Badges & Highlights */}
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {garments.map((g, idx) => (
                        <span
                          key={idx}
                          className="px-2.5 py-1 rounded-lg text-xs font-bold bg-[#FAF8F5] text-[#071426] border border-[#E0D8CB] flex items-center gap-1"
                        >
                          {g === 'Coat' && '🧥'}
                          {g === 'Pant' && '👖'}
                          {g === 'Shirt' && '👔'}
                          {g === 'Kurta' && '👘'}
                          {g === 'Pajama' && '🩳'}
                          <span>{g}</span>
                        </span>
                      ))}
                      <span className="text-[10px] font-bold text-[#C9A24A] ml-auto uppercase">
                        Unit: {record.unit || 'in'}
                      </span>
                    </div>

                    {/* Compact Specs Preview */}
                    <div className="grid grid-cols-2 gap-2 text-xs bg-[#FAF8F5] p-3 rounded-xl border border-[#EAE4D8]">
                      {(record.coat || record.jacket) && (
                        <div>
                          <div className="text-[10px] font-bold text-[#8C7E6A] uppercase flex items-center gap-1">
                            <span>Coat (L / C / S)</span>
                          </div>
                          <div className="font-extrabold text-[#071426]">
                            {record.coat?.length || record.jacket?.jacketLength || '—'}" / {record.coat?.chest || record.jacket?.chest || '—'}" / {record.coat?.stomach || record.jacket?.waist || '—'}"
                          </div>
                        </div>
                      )}

                      {(record.pant || record.trouser) && (
                        <div>
                          <div className="text-[10px] font-bold text-[#8C7E6A] uppercase flex items-center gap-1">
                            <span>Pant (L / W / Thigh)</span>
                          </div>
                          <div className="font-extrabold text-[#071426]">
                            {record.pant?.length || record.trouser?.outseam || '—'}" / {record.pant?.waist || record.trouser?.waist || '—'}" / {record.pant?.thigh || record.trouser?.thigh || '—'}"
                          </div>
                        </div>
                      )}

                      {record.shirt && (
                        <div>
                          <div className="text-[10px] font-bold text-[#8C7E6A] uppercase">
                            Shirt (L / C / Collar)
                          </div>
                          <div className="font-extrabold text-[#071426]">
                            {record.shirt.length || '—'}" / {record.shirt.chest || '—'}" / {record.shirt.collar || '—'}"
                          </div>
                        </div>
                      )}

                      {record.kurta && (
                        <div>
                          <div className="text-[10px] font-bold text-[#8C7E6A] uppercase">
                            Kurta (L / C / Slv)
                          </div>
                          <div className="font-extrabold text-[#071426]">
                            {record.kurta.length || '—'}" / {record.kurta.chest || '—'}" / {record.kurta.sleeve || '—'}"
                          </div>
                        </div>
                      )}

                      {record.pajama && (
                        <div>
                          <div className="text-[10px] font-bold text-[#8C7E6A] uppercase">
                            Pajama (L / W / Bottom)
                          </div>
                          <div className="font-extrabold text-[#071426]">
                            {record.pajama.length || '—'}" / {record.pajama.waist || '—'}" / {record.pajama.bottom || '—'}"
                          </div>
                        </div>
                      )}

                      {record.fitPreference && (
                        <div className="col-span-2 text-[10px] text-[#6E6454] pt-1 border-t border-[#E0D8CB]">
                          Cut Preference: <strong className="text-[#071426]">{record.fitPreference}</strong>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Footer Actions */}
                  <div className="flex items-center justify-between pt-2 border-t border-[#F2ECE1]">
                    <div className="text-[10px] text-[#8C7E6A] flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-[#A39682]" />
                      <span>{record.lastUpdated}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setViewingRecord(record)}
                        className="px-2.5 py-1 rounded-lg text-xs font-bold bg-[#071426] text-[#D4AF5A] hover:bg-[#0B1930] transition-colors flex items-center gap-1 cursor-pointer"
                        title="View Full Measurement Sheet"
                      >
                        <Eye className="w-3 h-3" />
                        <span>View</span>
                      </button>

                      <button
                        onClick={() => onEditMeasurement(record)}
                        className="p-1.5 rounded-lg border border-[#E0D8CB] text-[#071426] hover:bg-[#FAF8F5] transition-colors cursor-pointer"
                        title="Edit Measurements"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handlePrint(record)}
                        className="p-1.5 rounded-lg border border-[#E0D8CB] text-[#071426] hover:bg-[#C9A24A] hover:text-[#071426] transition-colors cursor-pointer"
                        title="Print Workshop Slip"
                      >
                        <Printer className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => onDeleteMeasurement(record)}
                        className="p-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                        title="Delete Record"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                </div>
              );
            })
          ) : (
            <div className="col-span-2 py-14 text-center bg-white rounded-2xl border border-[#E6E1D7] shadow-2xs">
              {measurements.length === 0 ? (
                <div className="max-w-sm mx-auto space-y-3">
                  <div className="w-12 h-12 rounded-full bg-[#FAF8F5] border border-[#E5DFD5] flex items-center justify-center mx-auto text-[#C9A24A]">
                    <Ruler className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-bold text-[#071426]">No Measurements Yet</h3>
                  <p className="text-xs text-[#7A7060]">
                    Create a measurement from a customer or new order.
                  </p>
                  <button
                    onClick={onNewMeasurement}
                    className="mt-2 px-4 py-2 bg-[#071426] text-[#D4AF5A] text-xs font-semibold rounded-xl hover:bg-[#0E2038] transition-colors cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5 text-[#C9A24A]" />
                    <span>+ New Measurement</span>
                  </button>
                </div>
              ) : (
                <div className="max-w-sm mx-auto space-y-2">
                  <Ruler className="w-8 h-8 mx-auto text-[#C9A24A]/40 mb-2" />
                  <p className="text-xs text-[#8C7E6A]">No customer measurement records match your search or filter.</p>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* ======================================================== */
        /* TABLE VIEW */
        /* ======================================================== */
        <div className="bg-white rounded-2xl border border-[#E6E1D7] shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-[#F7F3EA] text-[#7A7060] font-bold uppercase text-[10px] tracking-wider border-b border-[#E6E1D7]">
                  <th className="py-3.5 px-4">Customer Name &amp; ID</th>
                  <th className="py-3.5 px-4">Contact Phone</th>
                  <th className="py-3.5 px-4">Garment Types</th>
                  <th className="py-3.5 px-4">Order #</th>
                  <th className="py-3.5 px-4">Last Updated</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F2ECE1]">
                {filtered.length > 0 ? (
                  filtered.map((record) => {
                    const phone = getCustomerPhone(record);
                    const garments = record.selectedGarments || (typeof record.garmentType === 'string' ? record.garmentType.split(', ') : []);

                    return (
                      <tr key={record.id} className="hover:bg-[#FAF8F5] transition-colors">
                        {/* Customer */}
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-[#071426] text-sm flex items-center gap-1.5">
                            <span>{record.customerName}</span>
                          </div>
                          <div className="text-[11px] font-mono text-[#C9A24A]">
                            {record.id}
                          </div>
                        </td>

                        {/* Phone */}
                        <td className="py-3.5 px-4 text-[#6E6454]">
                          <div className="flex items-center gap-1.5 font-medium">
                            <Phone className="w-3 h-3 text-[#C9A24A]" />
                            <span>{phone}</span>
                          </div>
                        </td>

                        {/* Garment Badges */}
                        <td className="py-3.5 px-4">
                          <div className="flex flex-wrap items-center gap-1">
                            {garments.map((g, idx) => (
                              <span
                                key={idx}
                                className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#F7F3EA] text-[#071426] border border-[#E0D8CB]"
                              >
                                {g}
                              </span>
                            ))}
                          </div>
                        </td>

                        {/* Order Number */}
                        <td className="py-3.5 px-4">
                          {record.orderNumber ? (
                            <span className="font-mono font-bold text-xs px-2 py-0.5 bg-[#071426]/5 text-[#071426] rounded-md">
                              {record.orderNumber}
                            </span>
                          ) : (
                            <span className="text-[#A39682] text-[11px] italic">Unlinked</span>
                          )}
                        </td>

                        {/* Last Updated */}
                        <td className="py-3.5 px-4 text-[#7A7060] font-medium">
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-[#A39682]" />
                            <span>{record.lastUpdated}</span>
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setViewingRecord(record)}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-[#FAF8F5] hover:bg-[#071426] hover:text-[#D4AF5A] text-[#071426] border border-[#E0D8CB] transition-colors flex items-center gap-1 cursor-pointer"
                              title="View Full Measurement Sheet"
                            >
                              <Eye className="w-3.5 h-3.5 text-[#C9A24A]" />
                              <span>View</span>
                            </button>

                            <button
                              onClick={() => onEditMeasurement(record)}
                              className="p-1.5 rounded-lg border border-[#E0D8CB] text-[#071426] hover:bg-[#F7F3EA] transition-colors cursor-pointer"
                              title="Edit Measurements"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => handlePrint(record)}
                              className="p-1.5 rounded-lg border border-[#E0D8CB] text-[#071426] hover:bg-[#C9A24A] hover:text-[#071426] transition-colors cursor-pointer"
                              title="Print Measurement Sheet"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => onDeleteMeasurement(record)}
                              className="p-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                              title="Delete Record"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="py-14 text-center">
                      {measurements.length === 0 ? (
                        <div className="max-w-sm mx-auto space-y-3">
                          <div className="w-12 h-12 rounded-full bg-[#FAF8F5] border border-[#E5DFD5] flex items-center justify-center mx-auto text-[#C9A24A]">
                            <Ruler className="w-6 h-6" />
                          </div>
                          <h3 className="text-base font-bold text-[#071426]">No Measurements Yet</h3>
                          <p className="text-xs text-[#7A7060]">
                            Create a measurement from a customer or new order.
                          </p>
                          <button
                            onClick={onNewMeasurement}
                            className="mt-2 px-4 py-2 bg-[#071426] text-[#D4AF5A] text-xs font-semibold rounded-xl hover:bg-[#0E2038] transition-colors cursor-pointer inline-flex items-center gap-1.5"
                          >
                            <Plus className="w-3.5 h-3.5 text-[#C9A24A]" />
                            <span>+ New Measurement</span>
                          </button>
                        </div>
                      ) : (
                        <div className="max-w-sm mx-auto space-y-2">
                          <Ruler className="w-8 h-8 mx-auto text-[#C9A24A]/40 mb-2" />
                          <p className="text-xs text-[#8C7E6A]">No customer measurement records match your search or filter.</p>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* VIEW / PRINT MEASUREMENT SHEET MODAL */}
      {/* ======================================================== */}
      {viewingRecord && (
        <div className="fixed inset-0 z-50 bg-[#071426]/85 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto font-sans">
          <div className="bg-white rounded-2xl border border-[#E6E1D7] max-w-4xl w-full p-6 sm:p-8 shadow-2xl space-y-6 my-6 relative max-h-[92vh] overflow-y-auto print:max-h-none print:shadow-none print:border-none print:p-0">
            
            {/* Modal Header & Close (hidden in print) */}
            <div className="flex items-center justify-between border-b border-[#F2ECE1] pb-4 print:hidden">
              <div className="flex items-center gap-2">
                <Ruler className="w-5 h-5 text-[#C9A24A]" />
                <h2 className="text-lg font-bold text-[#071426]">
                  Bespoke Measurement Sheet
                </h2>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    if (!viewingRecord) return;
                    try {
                      setIsDownloadingPdf(true);
                      await downloadElementAsPdf(
                        'printable-measurement-sheet',
                        `Regency_Tailors_Measurements_${viewingRecord.customerName.replace(/\s+/g, '_')}.pdf`
                      );
                    } finally {
                      setIsDownloadingPdf(false);
                    }
                  }}
                  disabled={isDownloadingPdf}
                  className="px-3.5 py-1.5 bg-[#071426] hover:bg-[#0B1930] text-[#D4AF5A] font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                  title="Download Measurement Sheet as PDF"
                >
                  {isDownloadingPdf ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#C9A24A]" />
                  ) : (
                    <Download className="w-3.5 h-3.5 text-[#C9A24A]" />
                  )}
                  <span>{isDownloadingPdf ? 'Saving...' : 'Download PDF'}</span>
                </button>

                <button
                  onClick={() => handlePrint(viewingRecord)}
                  className="px-3.5 py-1.5 bg-[#C9A24A] hover:bg-[#B8913B] text-[#071426] font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Sheet</span>
                </button>
                <button
                  onClick={() => {
                    const rec = viewingRecord;
                    setViewingRecord(null);
                    onEditMeasurement(rec);
                  }}
                  className="px-3 py-1.5 bg-[#FAF8F5] hover:bg-[#F7F3EA] text-[#071426] font-bold text-xs rounded-xl border border-[#E0D8CB] transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit</span>
                </button>
                <button
                  onClick={() => setViewingRecord(null)}
                  className="p-1.5 text-[#8C7E6A] hover:text-[#071426] hover:bg-[#F7F3EA] rounded-xl transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* PRINTABLE SHEET CONTAINER (Clean 2-column layout for workshop cutters) */}
            <div id="printable-measurement-sheet" className="space-y-6 print:m-0 text-[#071426] bg-[#FAF7F0] p-4 sm:p-6 rounded-2xl border border-[#E6E1D7]">
              
              {/* Brand Letterhead */}
              <div className="border-b-2 border-[#C9A24A] pb-4 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                <div>
                  <div className="text-2xl font-extrabold text-[#071426] tracking-wider">
                    REGENCY TAILORS
                  </div>
                  <div className="text-[10px] text-[#C9A24A] font-bold tracking-[0.2em] uppercase">
                    HAUTE BESPOKE &amp; MASTER CRAFTSMANSHIP
                  </div>
                  <div className="text-[11px] text-[#6E6454] mt-0.5">
                    Civil Lines • Jalandhar City • Punjab
                  </div>
                </div>

                <div className="text-left sm:text-right text-xs space-y-0.5">
                  <div className="font-mono text-[11px] text-[#8C7E6A]">SPEC ID: <strong className="text-[#071426]">{viewingRecord.id}</strong></div>
                  <div className="text-[#6E6454]">Date: <strong className="text-[#071426]">{viewingRecord.lastUpdated}</strong></div>
                  <div className="text-[#6E6454]">Unit: <strong className="text-[#C9A24A] uppercase">{viewingRecord.unit || 'Inches'}</strong></div>
                </div>
              </div>

              {/* Customer Information Block */}
              <div className="bg-[#FAF8F5] p-4 rounded-xl border border-[#E6E1D7] grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs print:bg-white print:border-[#CCC]">
                <div>
                  <div className="text-[10px] uppercase font-bold text-[#8C7E6A]">Client Name</div>
                  <div className="text-base font-extrabold text-[#071426]">{viewingRecord.customerName}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-bold text-[#8C7E6A]">Contact Phone</div>
                  <div className="font-bold text-[#071426]">{getCustomerPhone(viewingRecord)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-bold text-[#8C7E6A]">Order Reference #</div>
                  <div className="font-mono font-bold text-[#C9A24A]">
                    {viewingRecord.orderNumber || 'Bespoke Registry'}
                  </div>
                </div>
              </div>

              {/* TWO-COLUMN GROUPED MEASUREMENT BLOCKS */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* 1. COAT SPECIFICATIONS */}
                {(viewingRecord.coat || viewingRecord.jacket) && (
                  <div className="bg-[#FAF8F5] p-4 rounded-xl border border-[#E6E1D7] space-y-2.5 print:bg-white print:border-[#CCC]">
                    <div className="flex items-center justify-between border-b border-[#E6E1D7] pb-1.5">
                      <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#071426] flex items-center gap-1.5">
                        <span>🧥</span>
                        <span>COAT MEASUREMENTS</span>
                      </h3>
                      <span className="text-[10px] font-bold text-[#C9A24A]">Unit: {viewingRecord.unit || 'in'}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-white p-2 rounded-lg border border-[#EAE4D8]">
                        <div className="text-[10px] text-[#8C7E6A] font-bold">1. Length</div>
                        <div className="text-sm font-extrabold text-[#071426]">
                          {viewingRecord.coat?.length || viewingRecord.jacket?.jacketLength || '—'} {viewingRecord.unit === 'cm' ? 'cm' : '"'}
                        </div>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-[#EAE4D8]">
                        <div className="text-[10px] text-[#8C7E6A] font-bold">2. Chest</div>
                        <div className="text-sm font-extrabold text-[#071426]">
                          {viewingRecord.coat?.chest || viewingRecord.jacket?.chest || '—'} {viewingRecord.unit === 'cm' ? 'cm' : '"'}
                        </div>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-[#EAE4D8]">
                        <div className="text-[10px] text-[#8C7E6A] font-bold">3. Stomach</div>
                        <div className="text-sm font-extrabold text-[#071426]">
                          {viewingRecord.coat?.stomach || viewingRecord.jacket?.waist || '—'} {viewingRecord.unit === 'cm' ? 'cm' : '"'}
                        </div>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-[#EAE4D8]">
                        <div className="text-[10px] text-[#8C7E6A] font-bold">4. H.P. / Hip</div>
                        <div className="text-sm font-extrabold text-[#071426]">
                          {viewingRecord.coat?.hip || viewingRecord.jacket?.hip || '—'} {viewingRecord.unit === 'cm' ? 'cm' : '"'}
                        </div>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-[#EAE4D8]">
                        <div className="text-[10px] text-[#8C7E6A] font-bold">5. Shoulder</div>
                        <div className="text-sm font-extrabold text-[#071426]">
                          {viewingRecord.coat?.shoulder || viewingRecord.jacket?.shoulderWidth || '—'} {viewingRecord.unit === 'cm' ? 'cm' : '"'}
                        </div>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-[#EAE4D8]">
                        <div className="text-[10px] text-[#8C7E6A] font-bold">6. Sleeve</div>
                        <div className="text-sm font-extrabold text-[#071426]">
                          {viewingRecord.coat?.sleeve || viewingRecord.jacket?.sleeveLength || '—'} {viewingRecord.unit === 'cm' ? 'cm' : '"'}
                        </div>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-[#EAE4D8] col-span-2">
                        <div className="text-[10px] text-[#8C7E6A] font-bold">7. X-Back</div>
                        <div className="text-sm font-extrabold text-[#071426]">
                          {viewingRecord.coat?.xBack || viewingRecord.jacket?.crossBack || '—'} {viewingRecord.unit === 'cm' ? 'cm' : '"'}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. PANT SPECIFICATIONS */}
                {(viewingRecord.pant || viewingRecord.trouser) && (
                  <div className="bg-[#FAF8F5] p-4 rounded-xl border border-[#E6E1D7] space-y-2.5 print:bg-white print:border-[#CCC]">
                    <div className="flex items-center justify-between border-b border-[#E6E1D7] pb-1.5">
                      <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#071426] flex items-center gap-1.5">
                        <span>👖</span>
                        <span>PANT MEASUREMENTS</span>
                      </h3>
                      <span className="text-[10px] font-bold text-[#C9A24A]">Unit: {viewingRecord.unit || 'in'}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-white p-2 rounded-lg border border-[#EAE4D8]">
                        <div className="text-[10px] text-[#8C7E6A] font-bold">1. Length</div>
                        <div className="text-sm font-extrabold text-[#071426]">
                          {viewingRecord.pant?.length || viewingRecord.trouser?.outseam || '—'} {viewingRecord.unit === 'cm' ? 'cm' : '"'}
                        </div>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-[#EAE4D8]">
                        <div className="text-[10px] text-[#8C7E6A] font-bold">2. Waist</div>
                        <div className="text-sm font-extrabold text-[#071426]">
                          {viewingRecord.pant?.waist || viewingRecord.trouser?.waist || '—'} {viewingRecord.unit === 'cm' ? 'cm' : '"'}
                        </div>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-[#EAE4D8]">
                        <div className="text-[10px] text-[#8C7E6A] font-bold">3. H.P. / Hip</div>
                        <div className="text-sm font-extrabold text-[#071426]">
                          {viewingRecord.pant?.hip || viewingRecord.trouser?.hip || '—'} {viewingRecord.unit === 'cm' ? 'cm' : '"'}
                        </div>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-[#EAE4D8]">
                        <div className="text-[10px] text-[#8C7E6A] font-bold">4. Thigh</div>
                        <div className="text-sm font-extrabold text-[#071426]">
                          {viewingRecord.pant?.thigh || viewingRecord.trouser?.thigh || '—'} {viewingRecord.unit === 'cm' ? 'cm' : '"'}
                        </div>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-[#EAE4D8]">
                        <div className="text-[10px] text-[#8C7E6A] font-bold">5. In-Leg</div>
                        <div className="text-sm font-extrabold text-[#071426]">
                          {viewingRecord.pant?.inLeg || viewingRecord.trouser?.inseam || '—'} {viewingRecord.unit === 'cm' ? 'cm' : '"'}
                        </div>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-[#EAE4D8]">
                        <div className="text-[10px] text-[#8C7E6A] font-bold">6. Bottom</div>
                        <div className="text-sm font-extrabold text-[#071426]">
                          {viewingRecord.pant?.bottom || viewingRecord.trouser?.bottomOpening || '—'} {viewingRecord.unit === 'cm' ? 'cm' : '"'}
                        </div>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-[#EAE4D8] col-span-2">
                        <div className="text-[10px] text-[#8C7E6A] font-bold">7. Body (Rise)</div>
                        <div className="text-sm font-extrabold text-[#071426]">
                          {viewingRecord.pant?.body || viewingRecord.trouser?.rise || '—'} {viewingRecord.unit === 'cm' ? 'cm' : '"'}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. SHIRT SPECIFICATIONS */}
                {viewingRecord.shirt && (
                  <div className="bg-[#FAF8F5] p-4 rounded-xl border border-[#E6E1D7] space-y-2.5 print:bg-white print:border-[#CCC]">
                    <div className="flex items-center justify-between border-b border-[#E6E1D7] pb-1.5">
                      <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#071426] flex items-center gap-1.5">
                        <span>👔</span>
                        <span>SHIRT MEASUREMENTS</span>
                      </h3>
                      <span className="text-[10px] font-bold text-[#C9A24A]">Unit: {viewingRecord.unit || 'in'}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-white p-2 rounded-lg border border-[#EAE4D8]">
                        <div className="text-[10px] text-[#8C7E6A] font-bold">1. Length</div>
                        <div className="text-sm font-extrabold text-[#071426]">{viewingRecord.shirt.length || '—'} {viewingRecord.unit === 'cm' ? 'cm' : '"'}</div>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-[#EAE4D8]">
                        <div className="text-[10px] text-[#8C7E6A] font-bold">2. Chest</div>
                        <div className="text-sm font-extrabold text-[#071426]">{viewingRecord.shirt.chest || '—'} {viewingRecord.unit === 'cm' ? 'cm' : '"'}</div>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-[#EAE4D8]">
                        <div className="text-[10px] text-[#8C7E6A] font-bold">3. Stomach</div>
                        <div className="text-sm font-extrabold text-[#071426]">{viewingRecord.shirt.stomach || '—'} {viewingRecord.unit === 'cm' ? 'cm' : '"'}</div>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-[#EAE4D8]">
                        <div className="text-[10px] text-[#8C7E6A] font-bold">4. H.P. / Hip</div>
                        <div className="text-sm font-extrabold text-[#071426]">{viewingRecord.shirt.hip || '—'} {viewingRecord.unit === 'cm' ? 'cm' : '"'}</div>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-[#EAE4D8]">
                        <div className="text-[10px] text-[#8C7E6A] font-bold">5. Shoulder</div>
                        <div className="text-sm font-extrabold text-[#071426]">{viewingRecord.shirt.shoulder || '—'} {viewingRecord.unit === 'cm' ? 'cm' : '"'}</div>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-[#EAE4D8]">
                        <div className="text-[10px] text-[#8C7E6A] font-bold">6. Sleeve</div>
                        <div className="text-sm font-extrabold text-[#071426]">{viewingRecord.shirt.sleeve || '—'} {viewingRecord.unit === 'cm' ? 'cm' : '"'}</div>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-[#EAE4D8]">
                        <div className="text-[10px] text-[#8C7E6A] font-bold">7. Collar</div>
                        <div className="text-sm font-extrabold text-[#071426]">{viewingRecord.shirt.collar || '—'} {viewingRecord.unit === 'cm' ? 'cm' : '"'}</div>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-[#EAE4D8]">
                        <div className="text-[10px] text-[#8C7E6A] font-bold">8. Cuff</div>
                        <div className="text-sm font-extrabold text-[#071426]">{viewingRecord.shirt.cuff || '—'} {viewingRecord.unit === 'cm' ? 'cm' : '"'}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 4. KURTA SPECIFICATIONS */}
                {viewingRecord.kurta && (
                  <div className="bg-[#FAF8F5] p-4 rounded-xl border border-[#E6E1D7] space-y-2.5 print:bg-white print:border-[#CCC]">
                    <div className="flex items-center justify-between border-b border-[#E6E1D7] pb-1.5">
                      <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#071426] flex items-center gap-1.5">
                        <span>👘</span>
                        <span>KURTA MEASUREMENTS</span>
                      </h3>
                      <span className="text-[10px] font-bold text-[#C9A24A]">Unit: {viewingRecord.unit || 'in'}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-white p-2 rounded-lg border border-[#EAE4D8]">
                        <div className="text-[10px] text-[#8C7E6A] font-bold">1. Length</div>
                        <div className="text-sm font-extrabold text-[#071426]">{viewingRecord.kurta.length || '—'} {viewingRecord.unit === 'cm' ? 'cm' : '"'}</div>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-[#EAE4D8]">
                        <div className="text-[10px] text-[#8C7E6A] font-bold">2. Chest</div>
                        <div className="text-sm font-extrabold text-[#071426]">{viewingRecord.kurta.chest || '—'} {viewingRecord.unit === 'cm' ? 'cm' : '"'}</div>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-[#EAE4D8]">
                        <div className="text-[10px] text-[#8C7E6A] font-bold">3. Stomach</div>
                        <div className="text-sm font-extrabold text-[#071426]">{viewingRecord.kurta.stomach || '—'} {viewingRecord.unit === 'cm' ? 'cm' : '"'}</div>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-[#EAE4D8]">
                        <div className="text-[10px] text-[#8C7E6A] font-bold">4. H.P. / Hip</div>
                        <div className="text-sm font-extrabold text-[#071426]">{viewingRecord.kurta.hip || '—'} {viewingRecord.unit === 'cm' ? 'cm' : '"'}</div>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-[#EAE4D8]">
                        <div className="text-[10px] text-[#8C7E6A] font-bold">5. Shoulder</div>
                        <div className="text-sm font-extrabold text-[#071426]">{viewingRecord.kurta.shoulder || '—'} {viewingRecord.unit === 'cm' ? 'cm' : '"'}</div>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-[#EAE4D8]">
                        <div className="text-[10px] text-[#8C7E6A] font-bold">6. Sleeve</div>
                        <div className="text-sm font-extrabold text-[#071426]">{viewingRecord.kurta.sleeve || '—'} {viewingRecord.unit === 'cm' ? 'cm' : '"'}</div>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-[#EAE4D8] col-span-2">
                        <div className="text-[10px] text-[#8C7E6A] font-bold">7. Collar</div>
                        <div className="text-sm font-extrabold text-[#071426]">{viewingRecord.kurta.collar || '—'} {viewingRecord.unit === 'cm' ? 'cm' : '"'}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 5. PAJAMA SPECIFICATIONS */}
                {viewingRecord.pajama && (
                  <div className="bg-[#FAF8F5] p-4 rounded-xl border border-[#E6E1D7] space-y-2.5 print:bg-white print:border-[#CCC]">
                    <div className="flex items-center justify-between border-b border-[#E6E1D7] pb-1.5">
                      <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#071426] flex items-center gap-1.5">
                        <span>🩳</span>
                        <span>PAJAMA MEASUREMENTS</span>
                      </h3>
                      <span className="text-[10px] font-bold text-[#C9A24A]">Unit: {viewingRecord.unit || 'in'}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-white p-2 rounded-lg border border-[#EAE4D8]">
                        <div className="text-[10px] text-[#8C7E6A] font-bold">1. Length</div>
                        <div className="text-sm font-extrabold text-[#071426]">{viewingRecord.pajama.length || '—'} {viewingRecord.unit === 'cm' ? 'cm' : '"'}</div>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-[#EAE4D8]">
                        <div className="text-[10px] text-[#8C7E6A] font-bold">2. Waist</div>
                        <div className="text-sm font-extrabold text-[#071426]">{viewingRecord.pajama.waist || '—'} {viewingRecord.unit === 'cm' ? 'cm' : '"'}</div>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-[#EAE4D8]">
                        <div className="text-[10px] text-[#8C7E6A] font-bold">3. H.P. / Hip</div>
                        <div className="text-sm font-extrabold text-[#071426]">{viewingRecord.pajama.hip || '—'} {viewingRecord.unit === 'cm' ? 'cm' : '"'}</div>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-[#EAE4D8]">
                        <div className="text-[10px] text-[#8C7E6A] font-bold">4. Thigh</div>
                        <div className="text-sm font-extrabold text-[#071426]">{viewingRecord.pajama.thigh || '—'} {viewingRecord.unit === 'cm' ? 'cm' : '"'}</div>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-[#EAE4D8]">
                        <div className="text-[10px] text-[#8C7E6A] font-bold">5. In-Leg</div>
                        <div className="text-sm font-extrabold text-[#071426]">{viewingRecord.pajama.inLeg || '—'} {viewingRecord.unit === 'cm' ? 'cm' : '"'}</div>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-[#EAE4D8]">
                        <div className="text-[10px] text-[#8C7E6A] font-bold">6. Bottom</div>
                        <div className="text-sm font-extrabold text-[#071426]">{viewingRecord.pajama.bottom || '—'} {viewingRecord.unit === 'cm' ? 'cm' : '"'}</div>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-[#EAE4D8] col-span-2">
                        <div className="text-[10px] text-[#8C7E6A] font-bold">7. Body (Rise)</div>
                        <div className="text-sm font-extrabold text-[#071426]">{viewingRecord.pajama.body || '—'} {viewingRecord.unit === 'cm' ? 'cm' : '"'}</div>
                      </div>
                    </div>
                  </div>
                )}

              </div>

              {/* Fitting Notes & Alterations */}
              {(viewingRecord.fittingNotes || viewingRecord.postureNotes || viewingRecord.fitPreference) && (
                <div className="bg-[#FAF8F5] p-4 rounded-xl border border-[#E6E1D7] space-y-1.5 text-xs print:bg-white print:border-[#CCC]">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-[#C9A24A] uppercase tracking-wider">
                      Fitting Instructions &amp; Posture Profile
                    </span>
                    {viewingRecord.fitPreference && (
                      <span className="text-[11px] font-bold text-[#071426]">
                        Cut Profile: {viewingRecord.fitPreference}
                      </span>
                    )}
                  </div>
                  <p className="text-[#071426] font-medium leading-relaxed">
                    {viewingRecord.fittingNotes || viewingRecord.postureNotes || 'Standard bespoke craftsmanship.'}
                  </p>
                </div>
              )}

              {/* Master Tailor Signature Box */}
              <div className="pt-6 border-t border-[#E6E1D7] flex items-center justify-between text-xs text-[#8C7E6A]">
                <div>
                  Verified by Master Cutter: <span className="font-bold text-[#071426]">Regency Master Tailor</span>
                </div>
                <div className="border-t border-[#8C7E6A] pt-1 px-8 text-center text-[11px]">
                  Master Tailor Sign
                </div>
              </div>

            </div>

          </div>
        </div>
      )}
    </div>
  );
};
