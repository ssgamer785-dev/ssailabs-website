import React, { useState, useMemo } from 'react';
import { 
  X, 
  Search, 
  ShoppingBag, 
  Calendar, 
  Ruler, 
  CheckCircle2, 
  Clock, 
  User, 
  Phone, 
  MapPin, 
  Sparkles, 
  FileText, 
  Printer, 
  Info,
  ChevronRight,
  ShieldCheck,
  Tag,
  Scissors
} from 'lucide-react';
import { Order, MeasurementRecord, Customer } from '../../types';

interface ClientPortalModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders: Order[];
  measurements: MeasurementRecord[];
  customers: Customer[];
}

export const ClientPortalModal: React.FC<ClientPortalModalProps> = ({
  isOpen,
  onClose,
  orders,
  measurements,
  customers
}) => {
  const [lookupQuery, setLookupQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'measurements' | 'orders'>('measurements');
  const [searched, setSearched] = useState(false);
  const [selectedMeasurementIdx, setSelectedMeasurementIdx] = useState(0);

  // Clean and normalize strings for matching
  const cleanStr = (s: string = '') => s.toLowerCase().replace(/[^a-z0-9]/g, '');

  const searchResults = useMemo(() => {
    if (!isOpen || (!lookupQuery.trim() && !searched)) {
      return { customer: null, customerOrders: [], customerMeasurements: [] };
    }

    const q = lookupQuery.trim().toLowerCase();
    const cleanQ = cleanStr(q);

    // 1. Find matching customer
    let matchedCustomer = customers.find(c => 
      c.name.toLowerCase().includes(q) ||
      cleanStr(c.phone).includes(cleanQ) ||
      c.id.toLowerCase() === q
    );

    // 2. Find matching order
    let matchedOrders = orders.filter(o => 
      o.id.toLowerCase().includes(q) ||
      (o.orderNumber && o.orderNumber.toLowerCase().includes(q)) ||
      o.customerName.toLowerCase().includes(q) ||
      cleanStr(o.customerPhone).includes(cleanQ) ||
      (matchedCustomer && o.customerId === matchedCustomer.id)
    );

    // If order was matched directly, set customer if not yet found
    if (!matchedCustomer && matchedOrders.length > 0) {
      const firstOrd = matchedOrders[0];
      matchedCustomer = customers.find(c => c.id === firstOrd.customerId) || {
        id: firstOrd.customerId || 'CUST-TEMP',
        name: firstOrd.customerName,
        phone: firstOrd.customerPhone,
        email: firstOrd.customerEmail || '',
        address: firstOrd.customerAddress || '',
        city: 'Jalandhar',
        totalOrders: matchedOrders.length,
        lifetimeSpend: matchedOrders.reduce((sum, ord) => sum + (ord.totalAmount || 0), 0),
        lastVisitDate: firstOrd.orderDate,
        createdDate: firstOrd.orderDate
      };
    }

    // 3. Find all matching measurements for this customer
    const custId = matchedCustomer?.id;
    const custName = matchedCustomer?.name || '';
    const custPhone = matchedCustomer?.phone || '';

    let matchedMeasurements = measurements.filter(m => {
      if (custId && m.customerId === custId) return true;
      if (custPhone && m.customerPhone && cleanStr(m.customerPhone) === cleanStr(custPhone)) return true;
      if (custName && m.customerName.toLowerCase() === custName.toLowerCase()) return true;
      if (m.customerName.toLowerCase().includes(q) || (m.customerPhone && cleanStr(m.customerPhone).includes(cleanQ))) return true;
      if (m.orderNumber && m.orderNumber.toLowerCase().includes(q)) return true;
      return false;
    });

    // Also check if any matched order has a measurementsSnapshot
    matchedOrders.forEach(ord => {
      if (ord.measurementsSnapshot && Object.keys(ord.measurementsSnapshot).length > 0) {
        const snap = ord.measurementsSnapshot;
        // Check if snapshot is already represented
        const alreadyExists = matchedMeasurements.some(m => 
          m.id === snap.id || (m.orderNumber && m.orderNumber === ord.id)
        );
        if (!alreadyExists) {
          matchedMeasurements.push({
            id: snap.id || `snap-${ord.id}`,
            customerId: ord.customerId,
            customerName: ord.customerName,
            customerPhone: ord.customerPhone,
            orderNumber: ord.id,
            garmentType: (snap.garmentType as any) || ord.items?.[0]?.garmentType || 'Bespoke Garment',
            selectedGarments: snap.selectedGarments || ['Coat', 'Pant'],
            unit: snap.unit || 'inches',
            coat: snap.coat,
            pant: snap.pant,
            shirt: snap.shirt,
            kurta: snap.kurta,
            pajama: snap.pajama,
            jacket: snap.jacket,
            trouser: snap.trouser,
            fitPreference: snap.fitPreference || 'Classic Tailored',
            postureNotes: snap.postureNotes,
            fittingNotes: snap.fittingNotes,
            lastUpdated: ord.orderDate
          });
        }
      }
    });

    return {
      customer: matchedCustomer,
      customerOrders: matchedOrders,
      customerMeasurements: matchedMeasurements
    };
  }, [lookupQuery, searched, orders, measurements, customers]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lookupQuery.trim()) return;
    setSearched(true);
    setSelectedMeasurementIdx(0);
  };

  const handleQuickLookup = (sample: string) => {
    setLookupQuery(sample);
    setSearched(true);
    setSelectedMeasurementIdx(0);
  };

  const currentMeasurement = searchResults.customerMeasurements[selectedMeasurementIdx] || searchResults.customerMeasurements[0] || null;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#071426]/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto font-sans">
      <div className="bg-[#FAF8F5] border border-[#E0D8CB] text-[#071426] rounded-3xl max-w-4xl w-full p-4 sm:p-7 shadow-2xl relative space-y-5 my-4 max-h-[94vh] flex flex-col overflow-hidden">
        
        {/* Top Floating Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-[#8C7E6A] hover:text-[#071426] hover:bg-[#EAE4D8] rounded-xl transition-colors cursor-pointer z-10"
          title="Close Portal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Brand Header */}
        <div className="text-center space-y-1.5 border-b border-[#E6E1D7] pb-4 shrink-0">
          <div className="flex items-center justify-center gap-2">
            <span className="h-[1px] w-8 bg-[#C9A24A]/50"></span>
            <span className="text-[11px] text-[#9E721D] font-extrabold tracking-widest uppercase">
              ISOLATED CLIENT PORTAL & DIGITAL MEASUREMENT REGISTRY
            </span>
            <span className="h-[1px] w-8 bg-[#C9A24A]/50"></span>
          </div>
          <p className="text-xs text-[#7A7060] max-w-lg mx-auto">
            Live bespoke craftsmanship status, trial schedule, and complete precision tailoring measurements archive.
          </p>
        </div>

        {/* Search Bar */}
        <div className="shrink-0 space-y-2">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-[#9E721D]" />
              <input
                type="text"
                value={lookupQuery}
                onChange={(e) => setLookupQuery(e.target.value)}
                placeholder="Search by Order # (e.g. RT-0001), Mobile # (e.g. 9988771631), or Customer Name..."
                className="w-full bg-white border border-[#D5CDBC] focus:border-[#C9A24A] text-[#071426] text-xs sm:text-sm pl-10 pr-4 py-3 rounded-2xl outline-none placeholder:text-[#9C8F7A] transition-all shadow-2xs"
              />
            </div>
            <button
              type="submit"
              className="px-5 sm:px-7 py-3 bg-[#071426] hover:bg-[#11243E] text-[#D4AF5A] font-extrabold text-xs sm:text-sm rounded-2xl transition-all shadow-md cursor-pointer uppercase tracking-wider flex items-center gap-2 border border-[#C9A24A]/40"
            >
              <span>Search</span>
            </button>
          </form>

          {/* Quick chips if user hasn't searched or wants quick access */}
          {!searched && (orders.length > 0 || customers.length > 0) && (
            <div className="flex items-center gap-2 flex-wrap text-[11px] text-[#8C7E6A] pt-1">
              <span className="font-semibold text-[#8C7E6A]">Quick Lookup:</span>
              {orders.slice(0, 3).map((ord) => (
                <button
                  key={ord.id}
                  type="button"
                  onClick={() => handleQuickLookup(ord.id)}
                  className="px-2.5 py-1 bg-white hover:bg-[#F2ECE1] text-[#9E721D] border border-[#E6E1D7] rounded-lg transition-colors cursor-pointer font-mono font-bold"
                >
                  Order #{ord.id} ({ord.customerName})
                </button>
              ))}
              {customers.slice(0, 2).map((cust) => (
                <button
                  key={cust.id}
                  type="button"
                  onClick={() => handleQuickLookup(cust.phone || cust.name)}
                  className="px-2.5 py-1 bg-white hover:bg-[#F2ECE1] text-[#071426] border border-[#E6E1D7] rounded-lg transition-colors cursor-pointer font-medium"
                >
                  {cust.name} ({cust.phone})
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Main Content Area (Scrollable) */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-4">
          {searched ? (
            searchResults.customer || searchResults.customerOrders.length > 0 || searchResults.customerMeasurements.length > 0 ? (
              <div className="space-y-4">
                
                {/* Customer Dossier Bar */}
                <div className="bg-white border border-[#E0D8CB] rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-2xs relative overflow-hidden">
                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-2xl bg-[#071426] border border-[#C9A24A] text-[#D4AF5A] flex items-center justify-center font-serif text-xl font-bold shadow-sm shrink-0">
                      {(searchResults.customer?.name || searchResults.customerOrders[0]?.customerName || 'C')[0]}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-[#9E721D] uppercase tracking-wider font-bold">
                          REGENCY BESPOKE CLIENT
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-900 text-[10px] font-bold border border-amber-200">
                          <ShieldCheck className="w-3 h-3 text-[#9E721D]" /> Verified Record
                        </span>
                      </div>
                      <h2 className="text-lg sm:text-xl font-black text-[#071426]">
                        {searchResults.customer?.name || searchResults.customerOrders[0]?.customerName || 'Valued Customer'}
                      </h2>
                      <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-xs text-[#7A7060] mt-0.5">
                        <span className="flex items-center gap-1">
                          <Phone className="w-3.5 h-3.5 text-[#9E721D]" />
                          {searchResults.customer?.phone || searchResults.customerOrders[0]?.customerPhone || '—'}
                        </span>
                        {searchResults.customer?.address && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-[#9E721D]" />
                            {searchResults.customer.address}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Summary Metric Badges */}
                  <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 pt-3 sm:pt-0 border-[#E6E1D7]">
                    <div className="text-left sm:text-right">
                      <div className="text-[10px] text-[#8C7E6A] uppercase font-bold">Total Measurements</div>
                      <div className="text-sm font-extrabold text-[#9E721D]">
                        {searchResults.customerMeasurements.length} Garment Set{searchResults.customerMeasurements.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-[#8C7E6A] uppercase font-bold">Total Orders</div>
                      <div className="text-sm font-extrabold text-[#071426]">
                        {searchResults.customerOrders.length} Order{searchResults.customerOrders.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>
                </div>

                {/* View Tabs */}
                <div className="flex items-center justify-between border-b border-[#E6E1D7] pb-1">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setActiveTab('measurements')}
                      className={`px-4 py-2 text-xs font-extrabold rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
                        activeTab === 'measurements'
                          ? 'bg-[#071426] text-[#D4AF5A] shadow-md border border-[#C9A24A]/40'
                          : 'bg-white text-[#7A7060] hover:text-[#071426] hover:bg-[#F2ECE1] border border-[#E6E1D7]'
                      }`}
                    >
                      <Ruler className="w-4 h-4" />
                      <span>All Measurements ({searchResults.customerMeasurements.length})</span>
                    </button>
                    <button
                      onClick={() => setActiveTab('orders')}
                      className={`px-4 py-2 text-xs font-extrabold rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
                        activeTab === 'orders'
                          ? 'bg-[#071426] text-[#D4AF5A] shadow-md border border-[#C9A24A]/40'
                          : 'bg-white text-[#7A7060] hover:text-[#071426] hover:bg-[#F2ECE1] border border-[#E6E1D7]'
                      }`}
                    >
                      <ShoppingBag className="w-4 h-4" />
                      <span>Orders & Live Status ({searchResults.customerOrders.length})</span>
                    </button>
                  </div>
                </div>

                {/* ========================================================================= */}
                {/* TAB 1: ALL CUSTOMER MEASUREMENTS (SAARI CUSTOMER KI MEASUREMENTS) */}
                {/* ========================================================================= */}
                {activeTab === 'measurements' && (
                  <div className="space-y-4">
                    {searchResults.customerMeasurements.length > 0 ? (
                      <>
                        {/* Multi-Measurement Selector if multiple profiles exist */}
                        {searchResults.customerMeasurements.length > 1 && (
                          <div className="flex items-center gap-2 overflow-x-auto pb-1">
                            <span className="text-[11px] font-bold text-[#8C7E6A] shrink-0 uppercase tracking-wider">
                              Select Record:
                            </span>
                            {searchResults.customerMeasurements.map((m, idx) => (
                              <button
                                key={m.id || idx}
                                onClick={() => setSelectedMeasurementIdx(idx)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer border flex items-center gap-1.5 ${
                                  selectedMeasurementIdx === idx
                                    ? 'bg-[#071426] border-[#C9A24A] text-[#D4AF5A]'
                                    : 'bg-white border-[#E6E1D7] text-[#7A7060] hover:border-[#C9A24A]'
                                }`}
                              >
                                <Scissors className="w-3.5 h-3.5" />
                                <span>{m.garmentType || 'Measurement Set'}</span>
                                {m.orderNumber && (
                                  <span className="text-[10px] opacity-75 font-mono">#{m.orderNumber}</span>
                                )}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Selected Measurement Card */}
                        {currentMeasurement && (
                          <div className="bg-white border border-[#E0D8CB] rounded-2xl p-4 sm:p-6 space-y-5 shadow-2xs">
                            
                            {/* Profile Header & Specs */}
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-[#E6E1D7] pb-4">
                              <div>
                                <div className="text-[10px] text-[#9E721D] font-bold uppercase tracking-wider">
                                  Bespoke Garment Specifications
                                </div>
                                <h3 className="text-base sm:text-lg font-black text-[#071426] flex items-center gap-2">
                                  <span>{currentMeasurement.garmentType || 'Bespoke Garment Set'}</span>
                                  {currentMeasurement.fitPreference && (
                                    <span className="px-2.5 py-0.5 rounded-full bg-[#FAF8F5] border border-[#E6E1D7] text-[#9E721D] text-[10px] font-bold">
                                      {currentMeasurement.fitPreference}
                                    </span>
                                  )}
                                </h3>
                              </div>

                              <div className="flex items-center gap-3 text-xs text-[#7A7060]">
                                <span className="bg-[#FAF8F5] px-3 py-1.5 rounded-xl border border-[#E6E1D7]">
                                  Unit: <strong className="text-[#071426]">{currentMeasurement.unit || 'inches'}</strong>
                                </span>
                                <span className="bg-[#FAF8F5] px-3 py-1.5 rounded-xl border border-[#E6E1D7]">
                                  Updated: <strong className="text-[#071426]">{currentMeasurement.lastUpdated || 'Latest'}</strong>
                                </span>
                              </div>
                            </div>

                            {/* DETAILED MEASUREMENT SECTIONS */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              
                              {/* 1. COAT / BLAZER / SUIT JACKET */}
                              {(currentMeasurement.coat || currentMeasurement.jacket) && (
                                <div className="bg-[#FAF8F5] p-4 rounded-2xl border border-[#E0D8CB] space-y-3">
                                  <div className="flex items-center justify-between border-b border-[#E6E1D7] pb-2">
                                    <div className="text-xs font-black uppercase text-[#071426] flex items-center gap-2">
                                      <span>🧥</span>
                                      <span>COAT / SUIT JACKET MEASUREMENTS</span>
                                    </div>
                                    <span className="text-[10px] text-[#8C7E6A] font-mono">
                                      {currentMeasurement.unit || 'in'}
                                    </span>
                                  </div>

                                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                    <div className="bg-white p-2.5 rounded-xl border border-[#E6E1D7]">
                                      <div className="text-[10px] text-[#8C7E6A] font-bold">Length</div>
                                      <div className="text-sm font-black text-[#071426]">
                                        {currentMeasurement.coat?.length || currentMeasurement.jacket?.jacketLength || '—'} {currentMeasurement.unit === 'cm' ? 'cm' : '"'}
                                      </div>
                                    </div>
                                    <div className="bg-white p-2.5 rounded-xl border border-[#E6E1D7]">
                                      <div className="text-[10px] text-[#8C7E6A] font-bold">Chest</div>
                                      <div className="text-sm font-black text-[#071426]">
                                        {currentMeasurement.coat?.chest || currentMeasurement.jacket?.chest || '—'} {currentMeasurement.unit === 'cm' ? 'cm' : '"'}
                                      </div>
                                    </div>
                                    <div className="bg-white p-2.5 rounded-xl border border-[#E6E1D7]">
                                      <div className="text-[10px] text-[#8C7E6A] font-bold">Stomach / Waist</div>
                                      <div className="text-sm font-black text-[#071426]">
                                        {currentMeasurement.coat?.stomach || currentMeasurement.jacket?.waist || '—'} {currentMeasurement.unit === 'cm' ? 'cm' : '"'}
                                      </div>
                                    </div>
                                    <div className="bg-white p-2.5 rounded-xl border border-[#E6E1D7]">
                                      <div className="text-[10px] text-[#8C7E6A] font-bold">Hip / H.P.</div>
                                      <div className="text-sm font-black text-[#071426]">
                                        {currentMeasurement.coat?.hip || currentMeasurement.jacket?.hip || '—'} {currentMeasurement.unit === 'cm' ? 'cm' : '"'}
                                      </div>
                                    </div>
                                    <div className="bg-white p-2.5 rounded-xl border border-[#E6E1D7]">
                                      <div className="text-[10px] text-[#8C7E6A] font-bold">Shoulder</div>
                                      <div className="text-sm font-black text-[#071426]">
                                        {currentMeasurement.coat?.shoulder || currentMeasurement.jacket?.shoulderWidth || '—'} {currentMeasurement.unit === 'cm' ? 'cm' : '"'}
                                      </div>
                                    </div>
                                    <div className="bg-white p-2.5 rounded-xl border border-[#E6E1D7]">
                                      <div className="text-[10px] text-[#8C7E6A] font-bold">Sleeve</div>
                                      <div className="text-sm font-black text-[#071426]">
                                        {currentMeasurement.coat?.sleeve || currentMeasurement.jacket?.sleeveLength || '—'} {currentMeasurement.unit === 'cm' ? 'cm' : '"'}
                                      </div>
                                    </div>
                                    <div className="bg-white p-2.5 rounded-xl border border-[#E6E1D7] col-span-2 sm:col-span-3">
                                      <div className="text-[10px] text-[#8C7E6A] font-bold">X-Back (Cross Back)</div>
                                      <div className="text-sm font-black text-[#071426]">
                                        {currentMeasurement.coat?.xBack || currentMeasurement.jacket?.crossBack || '—'} {currentMeasurement.unit === 'cm' ? 'cm' : '"'}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* 2. PANT / TROUSER */}
                              {(currentMeasurement.pant || currentMeasurement.trouser) && (
                                <div className="bg-[#FAF8F5] p-4 rounded-2xl border border-[#E0D8CB] space-y-3">
                                  <div className="flex items-center justify-between border-b border-[#E6E1D7] pb-2">
                                    <div className="text-xs font-black uppercase text-[#071426] flex items-center gap-2">
                                      <span>👖</span>
                                      <span>PANT / TROUSER MEASUREMENTS</span>
                                    </div>
                                    <span className="text-[10px] text-[#8C7E6A] font-mono">
                                      {currentMeasurement.unit || 'in'}
                                    </span>
                                  </div>

                                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                    <div className="bg-white p-2.5 rounded-xl border border-[#E6E1D7]">
                                      <div className="text-[10px] text-[#8C7E6A] font-bold">Length (Outseam)</div>
                                      <div className="text-sm font-black text-[#071426]">
                                        {currentMeasurement.pant?.length || currentMeasurement.trouser?.outseam || '—'} {currentMeasurement.unit === 'cm' ? 'cm' : '"'}
                                      </div>
                                    </div>
                                    <div className="bg-white p-2.5 rounded-xl border border-[#E6E1D7]">
                                      <div className="text-[10px] text-[#8C7E6A] font-bold">Waist</div>
                                      <div className="text-sm font-black text-[#071426]">
                                        {currentMeasurement.pant?.waist || currentMeasurement.trouser?.waist || '—'} {currentMeasurement.unit === 'cm' ? 'cm' : '"'}
                                      </div>
                                    </div>
                                    <div className="bg-white p-2.5 rounded-xl border border-[#E6E1D7]">
                                      <div className="text-[10px] text-[#8C7E6A] font-bold">Hip / H.P.</div>
                                      <div className="text-sm font-black text-[#071426]">
                                        {currentMeasurement.pant?.hip || currentMeasurement.trouser?.hip || '—'} {currentMeasurement.unit === 'cm' ? 'cm' : '"'}
                                      </div>
                                    </div>
                                    <div className="bg-white p-2.5 rounded-xl border border-[#E6E1D7]">
                                      <div className="text-[10px] text-[#8C7E6A] font-bold">Thigh</div>
                                      <div className="text-sm font-black text-[#071426]">
                                        {currentMeasurement.pant?.thigh || currentMeasurement.trouser?.thigh || '—'} {currentMeasurement.unit === 'cm' ? 'cm' : '"'}
                                      </div>
                                    </div>
                                    <div className="bg-white p-2.5 rounded-xl border border-[#E6E1D7]">
                                      <div className="text-[10px] text-[#8C7E6A] font-bold">In-Leg (Inseam)</div>
                                      <div className="text-sm font-black text-[#071426]">
                                        {currentMeasurement.pant?.inLeg || currentMeasurement.trouser?.inseam || '—'} {currentMeasurement.unit === 'cm' ? 'cm' : '"'}
                                      </div>
                                    </div>
                                    <div className="bg-white p-2.5 rounded-xl border border-[#E6E1D7]">
                                      <div className="text-[10px] text-[#8C7E6A] font-bold">Bottom Opening</div>
                                      <div className="text-sm font-black text-[#071426]">
                                        {currentMeasurement.pant?.bottom || currentMeasurement.trouser?.bottomOpening || '—'} {currentMeasurement.unit === 'cm' ? 'cm' : '"'}
                                      </div>
                                    </div>
                                    <div className="bg-white p-2.5 rounded-xl border border-[#E6E1D7] col-span-2 sm:col-span-3">
                                      <div className="text-[10px] text-[#8C7E6A] font-bold">Body (Rise)</div>
                                      <div className="text-sm font-black text-[#071426]">
                                        {currentMeasurement.pant?.body || currentMeasurement.trouser?.rise || '—'} {currentMeasurement.unit === 'cm' ? 'cm' : '"'}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* 3. BESPOKE SHIRT */}
                              {currentMeasurement.shirt && (
                                <div className="bg-[#FAF8F5] p-4 rounded-2xl border border-[#E0D8CB] space-y-3">
                                  <div className="flex items-center justify-between border-b border-[#E6E1D7] pb-2">
                                    <div className="text-xs font-black uppercase text-[#071426] flex items-center gap-2">
                                      <span>👔</span>
                                      <span>BESPOKE SHIRT MEASUREMENTS</span>
                                    </div>
                                    <span className="text-[10px] text-[#8C7E6A] font-mono">
                                      {currentMeasurement.unit || 'in'}
                                    </span>
                                  </div>

                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    <div className="bg-white p-2.5 rounded-xl border border-[#E6E1D7]">
                                      <div className="text-[10px] text-[#8C7E6A] font-bold">Length</div>
                                      <div className="text-sm font-black text-[#071426]">{currentMeasurement.shirt.length || '—'} {currentMeasurement.unit === 'cm' ? 'cm' : '"'}</div>
                                    </div>
                                    <div className="bg-white p-2.5 rounded-xl border border-[#E6E1D7]">
                                      <div className="text-[10px] text-[#8C7E6A] font-bold">Chest</div>
                                      <div className="text-sm font-black text-[#071426]">{currentMeasurement.shirt.chest || '—'} {currentMeasurement.unit === 'cm' ? 'cm' : '"'}</div>
                                    </div>
                                    <div className="bg-white p-2.5 rounded-xl border border-[#E6E1D7]">
                                      <div className="text-[10px] text-[#8C7E6A] font-bold">Stomach</div>
                                      <div className="text-sm font-black text-[#071426]">{currentMeasurement.shirt.stomach || '—'} {currentMeasurement.unit === 'cm' ? 'cm' : '"'}</div>
                                    </div>
                                    <div className="bg-white p-2.5 rounded-xl border border-[#E6E1D7]">
                                      <div className="text-[10px] text-[#8C7E6A] font-bold">Hip</div>
                                      <div className="text-sm font-black text-[#071426]">{currentMeasurement.shirt.hip || '—'} {currentMeasurement.unit === 'cm' ? 'cm' : '"'}</div>
                                    </div>
                                    <div className="bg-white p-2.5 rounded-xl border border-[#E6E1D7]">
                                      <div className="text-[10px] text-[#8C7E6A] font-bold">Shoulder</div>
                                      <div className="text-sm font-black text-[#071426]">{currentMeasurement.shirt.shoulder || '—'} {currentMeasurement.unit === 'cm' ? 'cm' : '"'}</div>
                                    </div>
                                    <div className="bg-white p-2.5 rounded-xl border border-[#E6E1D7]">
                                      <div className="text-[10px] text-[#8C7E6A] font-bold">Sleeve</div>
                                      <div className="text-sm font-black text-[#071426]">{currentMeasurement.shirt.sleeve || '—'} {currentMeasurement.unit === 'cm' ? 'cm' : '"'}</div>
                                    </div>
                                    <div className="bg-white p-2.5 rounded-xl border border-[#E6E1D7]">
                                      <div className="text-[10px] text-[#8C7E6A] font-bold">Collar</div>
                                      <div className="text-sm font-black text-[#071426]">{currentMeasurement.shirt.collar || '—'} {currentMeasurement.unit === 'cm' ? 'cm' : '"'}</div>
                                    </div>
                                    <div className="bg-white p-2.5 rounded-xl border border-[#E6E1D7]">
                                      <div className="text-[10px] text-[#8C7E6A] font-bold">Cuff</div>
                                      <div className="text-sm font-black text-[#071426]">{currentMeasurement.shirt.cuff || '—'} {currentMeasurement.unit === 'cm' ? 'cm' : '"'}</div>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* 4. KURTA */}
                              {currentMeasurement.kurta && (
                                <div className="bg-[#FAF8F5] p-4 rounded-2xl border border-[#E0D8CB] space-y-3">
                                  <div className="flex items-center justify-between border-b border-[#E6E1D7] pb-2">
                                    <div className="text-xs font-black uppercase text-[#071426] flex items-center gap-2">
                                      <span>👘</span>
                                      <span>KURTA MEASUREMENTS</span>
                                    </div>
                                    <span className="text-[10px] text-[#8C7E6A] font-mono">
                                      {currentMeasurement.unit || 'in'}
                                    </span>
                                  </div>

                                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    <div className="bg-white p-2.5 rounded-xl border border-[#E6E1D7]">
                                      <div className="text-[10px] text-[#8C7E6A] font-bold">Length</div>
                                      <div className="text-sm font-black text-[#071426]">{currentMeasurement.kurta.length || '—'} {currentMeasurement.unit === 'cm' ? 'cm' : '"'}</div>
                                    </div>
                                    <div className="bg-white p-2.5 rounded-xl border border-[#E6E1D7]">
                                      <div className="text-[10px] text-[#8C7E6A] font-bold">Chest</div>
                                      <div className="text-sm font-black text-[#071426]">{currentMeasurement.kurta.chest || '—'} {currentMeasurement.unit === 'cm' ? 'cm' : '"'}</div>
                                    </div>
                                    <div className="bg-white p-2.5 rounded-xl border border-[#E6E1D7]">
                                      <div className="text-[10px] text-[#8C7E6A] font-bold">Stomach</div>
                                      <div className="text-sm font-black text-[#071426]">{currentMeasurement.kurta.stomach || '—'} {currentMeasurement.unit === 'cm' ? 'cm' : '"'}</div>
                                    </div>
                                    <div className="bg-white p-2.5 rounded-xl border border-[#E6E1D7]">
                                      <div className="text-[10px] text-[#8C7E6A] font-bold">Hip</div>
                                      <div className="text-sm font-black text-[#071426]">{currentMeasurement.kurta.hip || '—'} {currentMeasurement.unit === 'cm' ? 'cm' : '"'}</div>
                                    </div>
                                    <div className="bg-white p-2.5 rounded-xl border border-[#E6E1D7]">
                                      <div className="text-[10px] text-[#8C7E6A] font-bold">Shoulder</div>
                                      <div className="text-sm font-black text-[#071426]">{currentMeasurement.kurta.shoulder || '—'} {currentMeasurement.unit === 'cm' ? 'cm' : '"'}</div>
                                    </div>
                                    <div className="bg-white p-2.5 rounded-xl border border-[#E6E1D7]">
                                      <div className="text-[10px] text-[#8C7E6A] font-bold">Sleeve</div>
                                      <div className="text-sm font-black text-[#071426]">{currentMeasurement.kurta.sleeve || '—'} {currentMeasurement.unit === 'cm' ? 'cm' : '"'}</div>
                                    </div>
                                    <div className="bg-white p-2.5 rounded-xl border border-[#E6E1D7] col-span-2">
                                      <div className="text-[10px] text-[#8C7E6A] font-bold">Collar</div>
                                      <div className="text-sm font-black text-[#071426]">{currentMeasurement.kurta.collar || '—'} {currentMeasurement.unit === 'cm' ? 'cm' : '"'}</div>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* 5. PAJAMA */}
                              {currentMeasurement.pajama && (
                                <div className="bg-[#FAF8F5] p-4 rounded-2xl border border-[#E0D8CB] space-y-3">
                                  <div className="flex items-center justify-between border-b border-[#E6E1D7] pb-2">
                                    <div className="text-xs font-black uppercase text-[#071426] flex items-center gap-2">
                                      <span>🩳</span>
                                      <span>PAJAMA MEASUREMENTS</span>
                                    </div>
                                    <span className="text-[10px] text-[#8C7E6A] font-mono">
                                      {currentMeasurement.unit || 'in'}
                                    </span>
                                  </div>

                                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                    <div className="bg-white p-2.5 rounded-xl border border-[#E6E1D7]">
                                      <div className="text-[10px] text-[#8C7E6A] font-bold">Length</div>
                                      <div className="text-sm font-black text-[#071426]">{currentMeasurement.pajama.length || '—'} {currentMeasurement.unit === 'cm' ? 'cm' : '"'}</div>
                                    </div>
                                    <div className="bg-white p-2.5 rounded-xl border border-[#E6E1D7]">
                                      <div className="text-[10px] text-[#8C7E6A] font-bold">Waist</div>
                                      <div className="text-sm font-black text-[#071426]">{currentMeasurement.pajama.waist || '—'} {currentMeasurement.unit === 'cm' ? 'cm' : '"'}</div>
                                    </div>
                                    <div className="bg-white p-2.5 rounded-xl border border-[#E6E1D7]">
                                      <div className="text-[10px] text-[#8C7E6A] font-bold">Hip</div>
                                      <div className="text-sm font-black text-[#071426]">{currentMeasurement.pajama.hip || '—'} {currentMeasurement.unit === 'cm' ? 'cm' : '"'}</div>
                                    </div>
                                    <div className="bg-white p-2.5 rounded-xl border border-[#E6E1D7]">
                                      <div className="text-[10px] text-[#8C7E6A] font-bold">Thigh</div>
                                      <div className="text-sm font-black text-[#071426]">{currentMeasurement.pajama.thigh || '—'} {currentMeasurement.unit === 'cm' ? 'cm' : '"'}</div>
                                    </div>
                                    <div className="bg-white p-2.5 rounded-xl border border-[#E6E1D7]">
                                      <div className="text-[10px] text-[#8C7E6A] font-bold">In-Leg</div>
                                      <div className="text-sm font-black text-[#071426]">{currentMeasurement.pajama.inLeg || '—'} {currentMeasurement.unit === 'cm' ? 'cm' : '"'}</div>
                                    </div>
                                    <div className="bg-white p-2.5 rounded-xl border border-[#E6E1D7]">
                                      <div className="text-[10px] text-[#8C7E6A] font-bold">Bottom</div>
                                      <div className="text-sm font-black text-[#071426]">{currentMeasurement.pajama.bottom || '—'} {currentMeasurement.unit === 'cm' ? 'cm' : '"'}</div>
                                    </div>
                                  </div>
                                </div>
                              )}

                            </div>

                            {/* Posture & Fitting Notes */}
                            {(currentMeasurement.postureNotes || currentMeasurement.fittingNotes) && (
                              <div className="bg-[#FAF8F5] p-3.5 rounded-xl border border-[#E6E1D7] flex items-start gap-2.5 text-xs text-[#5A5040]">
                                <Info className="w-4 h-4 text-[#9E721D] shrink-0 mt-0.5" />
                                <div className="space-y-1">
                                  {currentMeasurement.postureNotes && (
                                    <div>
                                      <strong className="text-[#9E721D]">Posture Notes:</strong> {currentMeasurement.postureNotes}
                                    </div>
                                  )}
                                  {currentMeasurement.fittingNotes && (
                                    <div>
                                      <strong className="text-[#9E721D]">Master Tailor Notes:</strong> {currentMeasurement.fittingNotes}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                          </div>
                        )}
                      </>
                    ) : (
                      <div className="bg-white border border-[#E6E1D7] rounded-2xl p-8 text-center space-y-2">
                        <Ruler className="w-8 h-8 text-[#8C7E6A] mx-auto" />
                        <h4 className="text-sm font-bold text-[#071426]">No Digital Measurement Record Found</h4>
                        <p className="text-xs text-[#7A7060] max-w-sm mx-auto">
                          Measurements for this customer will appear here once recorded during your showroom trial or fitting session.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* ========================================================================= */}
                {/* TAB 2: ORDERS & CRAFTING PROGRESS */}
                {/* ========================================================================= */}
                {activeTab === 'orders' && (
                  <div className="space-y-3">
                    {searchResults.customerOrders.length > 0 ? (
                      searchResults.customerOrders.map((ord) => (
                        <div 
                          key={ord.id}
                          className="bg-white border border-[#E0D8CB] rounded-2xl p-4 sm:p-5 space-y-4 shadow-2xs"
                        >
                          <div className="flex items-center justify-between border-b border-[#E6E1D7] pb-3">
                            <div>
                              <span className="text-[10px] font-mono text-[#9E721D] font-bold uppercase">
                                ORDER #{ord.id}
                              </span>
                              <h4 className="text-base font-extrabold text-[#071426]">
                                {(ord.items || []).map(i => i.garmentType).join(' + ') || 'Bespoke Order'}
                              </h4>
                            </div>
                            <span className="px-3 py-1 bg-[#071426] text-[#D4AF5A] font-black text-xs rounded-full uppercase tracking-wider border border-[#C9A24A]/40">
                              {ord.status}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                            <div className="bg-[#FAF8F5] p-2.5 rounded-xl border border-[#E6E1D7]">
                              <div className="text-[10px] text-[#8C7E6A] uppercase font-bold">Order Date</div>
                              <div className="font-bold text-[#071426]">{ord.orderDate}</div>
                            </div>
                            <div className="bg-[#FAF8F5] p-2.5 rounded-xl border border-[#E6E1D7]">
                              <div className="text-[10px] text-[#8C7E6A] uppercase font-bold">Trial Fitting Date</div>
                              <div className="font-bold text-[#9E721D]">{ord.trialDate || 'TBD'}</div>
                            </div>
                            <div className="bg-[#FAF8F5] p-2.5 rounded-xl border border-[#E6E1D7]">
                              <div className="text-[10px] text-[#8C7E6A] uppercase font-bold">Expected Delivery</div>
                              <div className="font-bold text-[#071426]">{ord.deliveryDate}</div>
                            </div>
                            <div className="bg-[#FAF8F5] p-2.5 rounded-xl border border-[#E6E1D7]">
                              <div className="text-[10px] text-[#8C7E6A] uppercase font-bold">Priority</div>
                              <div className={`font-bold ${ord.urgent ? 'text-red-600' : 'text-[#071426]'}`}>
                                {ord.urgent ? 'Urgent Priority' : 'Standard'}
                              </div>
                            </div>
                          </div>

                          {/* Garment Items List */}
                          {ord.items && ord.items.length > 0 && (
                            <div className="space-y-1.5 pt-1">
                              <div className="text-[10px] font-bold uppercase text-[#8C7E6A] tracking-wider">
                                Itemized Garments:
                              </div>
                              <div className="space-y-1">
                                {ord.items.map((item, idx) => (
                                  <div 
                                    key={item.id || idx}
                                    className="bg-[#FAF8F5] p-2 rounded-lg border border-[#E6E1D7] flex items-center justify-between text-xs"
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className="w-1.5 h-1.5 rounded-full bg-[#9E721D]"></span>
                                      <span className="font-bold text-[#071426]">{item.garmentType}</span>
                                      {item.fabricName && (
                                        <span className="text-[#7A7060]">({item.fabricName})</span>
                                      )}
                                    </div>
                                    <span className="text-[11px] text-[#7A7060] font-medium">
                                      Qty: {item.quantity || 1}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                        </div>
                      ))
                    ) : (
                      <div className="bg-white border border-[#E6E1D7] rounded-2xl p-8 text-center space-y-2">
                        <ShoppingBag className="w-8 h-8 text-[#8C7E6A] mx-auto" />
                        <h4 className="text-sm font-bold text-[#071426]">No Orders Found</h4>
                        <p className="text-xs text-[#7A7060]">
                          No active or past orders found for this customer record.
                        </p>
                      </div>
                    )}
                  </div>
                )}

              </div>
            ) : (
              <div className="bg-white border border-red-200 rounded-2xl p-8 text-center space-y-2">
                <p className="text-sm font-bold text-[#071426]">
                  No matching record found for "<span className="text-[#9E721D]">{lookupQuery}</span>"
                </p>
                <p className="text-xs text-[#7A7060] max-w-sm mx-auto">
                  Please verify your Order # (e.g. RT-0001), 10-digit mobile number, or full customer name.
                </p>
              </div>
            )
          ) : (
            <div className="bg-white border border-[#E6E1D7] rounded-2xl p-8 sm:p-12 text-center space-y-3 shadow-2xs">
              <div className="w-12 h-12 rounded-2xl bg-[#FAF8F5] border border-[#C9A24A]/40 text-[#9E721D] flex items-center justify-center mx-auto shadow-2xs">
                <Ruler className="w-6 h-6" />
              </div>
              <h3 className="text-base font-extrabold text-[#071426]">
                Bespoke Client Tracking & Measurements
              </h3>
              <p className="text-xs text-[#7A7060] max-w-md mx-auto leading-relaxed">
                Enter your Order Reference Number or registered Mobile Number above to view all complete digital measurements, active crafting stages, and trial schedules.
              </p>
            </div>
          )}
        </div>

        {/* Showroom Footer Info */}
        <div className="shrink-0 pt-2 border-t border-[#E6E1D7] flex items-center justify-between text-[11px] text-[#8C7E6A]">
          <span>Regency Tailors • Jalandhar City Showroom Concierge</span>
          <span className="font-mono text-[#9E721D] font-bold">Support: 99887 71631</span>
        </div>

      </div>
    </div>
  );
};
