import React, { useState, useEffect } from 'react';
import { 
  X, 
  Ruler, 
  User, 
  UserPlus, 
  Check, 
  Scissors, 
  FileText,
  Sparkles,
  Search,
  CheckCircle2,
  Sliders,
  ChevronDown,
  RefreshCw,
  Plus,
  Minus
} from 'lucide-react';
import { 
  MeasurementRecord, 
  Customer, 
  CoatMeasurement, 
  PantMeasurement, 
  ShirtMeasurement, 
  KurtaMeasurement, 
  PajamaMeasurement 
} from '../../types';

interface MeasurementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (record: MeasurementRecord) => void;
  customers: Customer[];
  allMeasurements?: MeasurementRecord[];
  onAddCustomer?: (customer: Customer) => void;
  initialMeasurement?: MeasurementRecord | null;
  preselectedCustomer?: Customer | null;
}

type GarmentKey = 'Coat' | 'Pant' | 'Shirt' | 'Kurta' | 'Pajama';

interface FieldConfig {
  key: string;
  label: string;
  sublabel?: string;
  placeholder: string;
  defaultInches: string;
}

const COAT_FIELDS: FieldConfig[] = [
  { key: 'length', label: '1. Length', sublabel: 'Coat / Blazer Length', placeholder: '30.0', defaultInches: '30' },
  { key: 'chest', label: '2. Chest', sublabel: 'Full Chest Girth', placeholder: '40.0', defaultInches: '40' },
  { key: 'stomach', label: '3. Stomach', sublabel: 'Natural Waist / Belly', placeholder: '36.0', defaultInches: '36' },
  { key: 'hip', label: '4. H.P. / Hip', sublabel: 'Seat & Lower Hip', placeholder: '41.0', defaultInches: '41' },
  { key: 'shoulder', label: '5. Shoulder', sublabel: 'Shoulder Seam to Seam', placeholder: '18.5', defaultInches: '18.5' },
  { key: 'sleeve', label: '6. Sleeve', sublabel: 'Crown to Wrist Cuff', placeholder: '25.0', defaultInches: '25' },
  { key: 'xBack', label: '7. X-Back', sublabel: 'Cross Back Width', placeholder: '17.5', defaultInches: '17.5' },
  { key: 'collar', label: '8. Collar', sublabel: 'Neck Band / Collar', placeholder: '16.0', defaultInches: '16' },
  { key: 'jacketLength', label: '9. Jacket Length', sublabel: 'Jacket / Suit Length', placeholder: '30.5', defaultInches: '30.5' },
  { key: 'waistcoatLength', label: '10. Waistcoat Length', sublabel: 'Vest / Waistcoat Length', placeholder: '23.0', defaultInches: '23' },
];

const PANT_FIELDS: FieldConfig[] = [
  { key: 'length', label: '1. Length', sublabel: 'Outseam Length', placeholder: '40.0', defaultInches: '40' },
  { key: 'waist', label: '2. Waist', sublabel: 'Trouser Band Waist', placeholder: '34.0', defaultInches: '34' },
  { key: 'hip', label: '3. H.P. / Hip', sublabel: 'Trouser Hip / Seat', placeholder: '40.5', defaultInches: '40.5' },
  { key: 'thigh', label: '4. Thigh', sublabel: 'Upper Thigh Circumference', placeholder: '24.5', defaultInches: '24.5' },
  { key: 'inLeg', label: '5. In-Leg', sublabel: 'Crotch to Ankle Inseam', placeholder: '31.0', defaultInches: '31' },
  { key: 'bottom', label: '6. Bottom', sublabel: 'Trouser Cuff Opening', placeholder: '15.0', defaultInches: '15' },
  { key: 'body', label: '7. Body (Rise)', sublabel: 'Front Rise Depth', placeholder: '11.0', defaultInches: '11' },
];

const SHIRT_FIELDS: FieldConfig[] = [
  { key: 'length', label: '1. Length', sublabel: 'Shirt Front/Back Length', placeholder: '30.0', defaultInches: '30' },
  { key: 'chest', label: '2. Chest', sublabel: 'Full Chest Circumference', placeholder: '40.0', defaultInches: '40' },
  { key: 'stomach', label: '3. Stomach', sublabel: 'Waist & Midsection', placeholder: '36.0', defaultInches: '36' },
  { key: 'hip', label: '4. H.P. / Hip', sublabel: 'Shirt Hem / Lower Seat', placeholder: '41.0', defaultInches: '41' },
  { key: 'shoulder', label: '5. Shoulder', sublabel: 'Shoulder Yoke Width', placeholder: '18.5', defaultInches: '18.5' },
  { key: 'sleeve', label: '6. Sleeve', sublabel: 'Shoulder to Wrist Cuff', placeholder: '24.5', defaultInches: '24.5' },
  { key: 'collar', label: '7. Collar', sublabel: 'Neck Band Size', placeholder: '16.0', defaultInches: '16' },
  { key: 'cuff', label: '8. Cuff', sublabel: 'Wrist Band Opening', placeholder: '9.5', defaultInches: '9.5' },
];

const KURTA_FIELDS: FieldConfig[] = [
  { key: 'length', label: '1. Length', sublabel: 'Kurta Knee / Calf Length', placeholder: '42.0', defaultInches: '42' },
  { key: 'chest', label: '2. Chest', sublabel: 'Chest Girth with Ease', placeholder: '42.0', defaultInches: '42' },
  { key: 'stomach', label: '3. Stomach / Waist', sublabel: 'Midsection Relaxed', placeholder: '38.0', defaultInches: '38' },
  { key: 'hip', label: '4. H.P. / Hip', sublabel: 'Slit / Lower Hip Point', placeholder: '43.0', defaultInches: '43' },
  { key: 'shoulder', label: '5. Shoulder', sublabel: 'Broad Shoulder Width', placeholder: '19.0', defaultInches: '19' },
  { key: 'sleeve', label: '6. Sleeve', sublabel: 'Straight Sleeve Length', placeholder: '25.0', defaultInches: '25' },
  { key: 'bicep', label: '7. Bicep', sublabel: 'Upper Arm Girth', placeholder: '15.0', defaultInches: '15' },
  { key: 'cuff', label: '8. Cuff', sublabel: 'Sleeve Opening / Cuff', placeholder: '11.0', defaultInches: '11' },
  { key: 'collar', label: '9. Collar', sublabel: 'Mandarin / Nehru Collar', placeholder: '16.5', defaultInches: '16.5' },
];

const PAJAMA_FIELDS: FieldConfig[] = [
  { key: 'length', label: '1. Length', sublabel: 'Pajama Total Length', placeholder: '40.0', defaultInches: '40' },
  { key: 'waist', label: '2. Waist', sublabel: 'Drawstring / Elastic Waist', placeholder: '35.0', defaultInches: '35' },
  { key: 'hip', label: '3. H.P. / Hip', sublabel: 'Full Hip Room', placeholder: '42.0', defaultInches: '42' },
  { key: 'thigh', label: '4. Thigh', sublabel: 'Thigh Comfort Room', placeholder: '25.0', defaultInches: '25' },
  { key: 'inLeg', label: '5. In-Leg', sublabel: 'Inseam Length', placeholder: '30.0', defaultInches: '30' },
  { key: 'bottom', label: '6. Bottom', sublabel: 'Ankle / Mohri Opening', placeholder: '15.0', defaultInches: '15' },
  { key: 'body', label: '7. Body (Rise)', sublabel: 'Miyani / Crotch Depth', placeholder: '11.5', defaultInches: '11.5' },
];

export const MeasurementModal: React.FC<MeasurementModalProps> = ({
  isOpen,
  onClose,
  onSave,
  customers,
  allMeasurements = [],
  onAddCustomer,
  initialMeasurement,
  preselectedCustomer
}) => {
  // Customer selection mode
  const [customerMode, setCustomerMode] = useState<'existing' | 'new'>('existing');
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);

  // New Customer inline fields
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerCity, setNewCustomerCity] = useState('');

  // Order link & Unit
  const [orderNumber, setOrderNumber] = useState('');
  const [unit, setUnit] = useState<'inches' | 'cm'>('inches');
  const [copyFeedback, setCopyFeedback] = useState(false);

  // Garment Selection (supports multiple)
  const [selectedGarments, setSelectedGarments] = useState<GarmentKey[]>([]);

  // Fit & Notes
  const [fitPreference, setFitPreference] = useState<string>('');
  const [postureNotes, setPostureNotes] = useState('');
  const [fittingNotes, setFittingNotes] = useState('');

  // 1. COAT Measurements
  const [coat, setCoat] = useState<CoatMeasurement>({
    length: '',
    chest: '',
    stomach: '',
    hip: '',
    shoulder: '',
    sleeve: '',
    xBack: '',
    collar: '',
    jacketLength: '',
    waistcoatLength: ''
  });

  // 2. PANT Measurements
  const [pant, setPant] = useState<PantMeasurement>({
    length: '',
    waist: '',
    hip: '',
    thigh: '',
    inLeg: '',
    bottom: '',
    body: ''
  });

  // 3. SHIRT Measurements
  const [shirt, setShirt] = useState<ShirtMeasurement>({
    length: '',
    chest: '',
    stomach: '',
    hip: '',
    shoulder: '',
    sleeve: '',
    collar: '',
    cuff: ''
  });

  // 4. KURTA Measurements
  const [kurta, setKurta] = useState<KurtaMeasurement>({
    length: '',
    chest: '',
    stomach: '',
    hip: '',
    shoulder: '',
    sleeve: '',
    bicep: '',
    cuff: '',
    collar: ''
  });

  // 5. PAJAMA Measurements
  const [pajama, setPajama] = useState<PajamaMeasurement>({
    length: '',
    waist: '',
    hip: '',
    thigh: '',
    inLeg: '',
    bottom: '',
    body: ''
  });

  // Populate data on open or edit
  useEffect(() => {
    if (initialMeasurement) {
      setCustomerMode('existing');
      setSelectedCustomerId(initialMeasurement.customerId);
      setOrderNumber(initialMeasurement.orderNumber || '');
      setUnit(initialMeasurement.unit || 'inches');
      setFitPreference(initialMeasurement.fitPreference || '');
      setPostureNotes(initialMeasurement.postureNotes || '');
      setFittingNotes(initialMeasurement.fittingNotes || '');

      // Determine selected garments
      if (initialMeasurement.selectedGarments && initialMeasurement.selectedGarments.length > 0) {
        setSelectedGarments(initialMeasurement.selectedGarments as GarmentKey[]);
      } else {
        const inferred: GarmentKey[] = [];
        if (initialMeasurement.coat || initialMeasurement.jacket) inferred.push('Coat');
        if (initialMeasurement.pant || initialMeasurement.trouser) inferred.push('Pant');
        if (initialMeasurement.shirt) inferred.push('Shirt');
        if (initialMeasurement.kurta) inferred.push('Kurta');
        if (initialMeasurement.pajama) inferred.push('Pajama');
        setSelectedGarments(inferred);
      }

      // Populate Coat
      if (initialMeasurement.coat) {
        setCoat({ ...initialMeasurement.coat });
      } else if (initialMeasurement.jacket) {
        setCoat({
          length: initialMeasurement.jacket.jacketLength || '',
          chest: initialMeasurement.jacket.chest || '',
          stomach: initialMeasurement.jacket.waist || '',
          hip: initialMeasurement.jacket.hip || '',
          shoulder: initialMeasurement.jacket.shoulderWidth || '',
          sleeve: initialMeasurement.jacket.sleeveLength || '',
          xBack: initialMeasurement.jacket.crossBack || '',
          collar: initialMeasurement.jacket.neck || '',
          jacketLength: initialMeasurement.jacket.jacketLength || '',
          waistcoatLength: ''
        });
      } else {
        setCoat({ length: '', chest: '', stomach: '', hip: '', shoulder: '', sleeve: '', xBack: '', collar: '', jacketLength: '', waistcoatLength: '' });
      }

      // Populate Pant
      if (initialMeasurement.pant) {
        setPant({ ...initialMeasurement.pant });
      } else if (initialMeasurement.trouser) {
        setPant({
          length: initialMeasurement.trouser.outseam || '',
          waist: initialMeasurement.trouser.waist || '',
          hip: initialMeasurement.trouser.hip || '',
          thigh: initialMeasurement.trouser.thigh || '',
          inLeg: initialMeasurement.trouser.inseam || '',
          bottom: initialMeasurement.trouser.bottomOpening || '',
          body: initialMeasurement.trouser.rise || ''
        });
      } else {
        setPant({ length: '', waist: '', hip: '', thigh: '', inLeg: '', bottom: '', body: '' });
      }

      // Populate Shirt
      if (initialMeasurement.shirt) {
        setShirt({ ...initialMeasurement.shirt });
      } else {
        setShirt({ length: '', chest: '', stomach: '', hip: '', shoulder: '', sleeve: '', collar: '', cuff: '' });
      }

      // Populate Kurta
      if (initialMeasurement.kurta) {
        setKurta({ ...initialMeasurement.kurta });
      } else {
        setKurta({ length: '', chest: '', stomach: '', hip: '', shoulder: '', sleeve: '', bicep: '', cuff: '', collar: '' });
      }

      // Populate Pajama
      if (initialMeasurement.pajama) {
        setPajama({ ...initialMeasurement.pajama });
      } else {
        setPajama({ length: '', waist: '', hip: '', thigh: '', inLeg: '', bottom: '', body: '' });
      }

    } else if (preselectedCustomer) {
      setCustomerMode('existing');
      setSelectedCustomerId(preselectedCustomer.id);
      resetMeasurementDefaults();
      // Check if previous measurement exists
      const prev = allMeasurements.find(m => m.customerId === preselectedCustomer.id);
      if (prev) {
        applyPreviousMeasurement(prev);
      }
    } else {
      setCustomerMode('existing');
      if (customers.length > 0 && !selectedCustomerId) {
        setSelectedCustomerId(customers[0].id);
      }
      resetMeasurementDefaults();
    }
  }, [initialMeasurement, preselectedCustomer, customers, isOpen]);

  /**
   * A new measurement sheet opens completely blank.
   *
   * Earlier builds pre-filled every field with plausible numbers (chest 40,
   * waist 34, and so on). Saving without editing wrote invented body
   * measurements into a real client's record and then onto a workshop slip.
   * The placeholders on each input still show the expected format.
   */
  const resetMeasurementDefaults = () => {
    setOrderNumber('');
    setUnit('inches');
    setSelectedGarments([]);
    setFitPreference('');
    setPostureNotes('');
    setFittingNotes('');
    setCoat({ length: '', chest: '', stomach: '', hip: '', shoulder: '', sleeve: '', xBack: '', collar: '', jacketLength: '', waistcoatLength: '' });
    setPant({ length: '', waist: '', hip: '', thigh: '', inLeg: '', bottom: '', body: '' });
    setShirt({ length: '', chest: '', stomach: '', hip: '', shoulder: '', sleeve: '', collar: '', cuff: '' });
    setKurta({ length: '', chest: '', stomach: '', hip: '', shoulder: '', sleeve: '', bicep: '', cuff: '', collar: '' });
    setPajama({ length: '', waist: '', hip: '', thigh: '', inLeg: '', bottom: '', body: '' });
  };

  const applyPreviousMeasurement = (prev: MeasurementRecord) => {
    if (prev.selectedGarments && prev.selectedGarments.length > 0) {
      setSelectedGarments(prev.selectedGarments as GarmentKey[]);
    }
    if (prev.coat) setCoat({ ...prev.coat });
    else if (prev.jacket) {
      setCoat({
        length: prev.jacket.jacketLength || '',
        chest: prev.jacket.chest || '',
        stomach: prev.jacket.waist || '',
        hip: prev.jacket.hip || '',
        shoulder: prev.jacket.shoulderWidth || '',
        sleeve: prev.jacket.sleeveLength || '',
        xBack: prev.jacket.crossBack || ''
      });
    }
    if (prev.pant) setPant({ ...prev.pant });
    else if (prev.trouser) {
      setPant({
        length: prev.trouser.outseam || '',
        waist: prev.trouser.waist || '',
        hip: prev.trouser.hip || '',
        thigh: prev.trouser.thigh || '',
        inLeg: prev.trouser.inseam || '',
        bottom: prev.trouser.bottomOpening || '',
        body: prev.trouser.rise || ''
      });
    }
    if (prev.shirt) setShirt({ ...prev.shirt });
    if (prev.kurta) setKurta({ ...prev.kurta });
    if (prev.pajama) setPajama({ ...prev.pajama });
    if (prev.fittingNotes) setFittingNotes(prev.fittingNotes);
    if (prev.postureNotes) setPostureNotes(prev.postureNotes);
    if (prev.fitPreference) setFitPreference(prev.fitPreference);
    
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2500);
  };

  if (!isOpen) return null;

  // Selected customer object
  const activeCustomer = customers.find(c => c.id === selectedCustomerId);
  
  // Previous measurement for active customer
  const previousMeasurement = activeCustomer 
    ? allMeasurements.find(m => m.customerId === activeCustomer.id && (!initialMeasurement || m.id !== initialMeasurement.id))
    : null;

  // Filtered customers for search
  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.phone.includes(customerSearch) ||
    c.id.toLowerCase().includes(customerSearch.toLowerCase())
  );

  // Toggle garment selection
  const toggleGarment = (g: GarmentKey) => {
    setSelectedGarments(prev => {
      if (prev.includes(g)) {
        if (prev.length === 1) return prev; // Keep at least one
        return prev.filter(item => item !== g);
      } else {
        return [...prev, g];
      }
    });
  };

  const selectPreset = (type: 'suit2' | 'suit3' | 'kurtaPajama' | 'all') => {
    if (type === 'suit2') setSelectedGarments(['Coat', 'Pant']);
    if (type === 'suit3') setSelectedGarments(['Coat', 'Pant', 'Shirt']);
    if (type === 'kurtaPajama') setSelectedGarments(['Kurta', 'Pajama']);
    if (type === 'all') setSelectedGarments(['Coat', 'Pant', 'Shirt', 'Kurta', 'Pajama']);
  };

  const handleNudge = (
    getter: any,
    setter: (val: any) => void,
    field: string,
    delta: number
  ) => {
    const currentVal = parseFloat(String(getter[field])) || 0;
    const nextVal = Math.max(0, currentVal + delta);
    setter({
      ...getter,
      [field]: Number.isInteger(nextVal) ? nextVal.toString() : nextVal.toFixed(2).replace(/\.?0+$/, '')
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    let targetCust: Customer | undefined = activeCustomer;

    // If new customer mode
    if (customerMode === 'new') {
      if (!newCustomerName.trim() || !newCustomerPhone.trim()) {
        alert('Please enter customer full name and contact phone number.');
        return;
      }
      const newCust: Customer = {
        id: `CUST-${Math.floor(100 + Math.random() * 900)}`,
        name: newCustomerName.trim(),
        phone: newCustomerPhone.trim(),
        email: '',
        address: '',
        city: newCustomerCity.trim(),
        totalOrders: 1,
        lifetimeSpend: 0,
        lastVisitDate: new Date().toISOString().split('T')[0],
        createdDate: new Date().toISOString().split('T')[0]
      };
      if (onAddCustomer) {
        onAddCustomer(newCust);
      }
      targetCust = newCust;
    }

    if (!targetCust) {
      alert('Please select or create a customer.');
      return;
    }

    if (selectedGarments.length === 0) {
      alert('Please select at least one garment type.');
      return;
    }

    const garmentTypeLabel = selectedGarments.join(', ');

    // Convert values safely
    const record: MeasurementRecord = {
      id: initialMeasurement ? initialMeasurement.id : `MEAS-${Math.floor(100 + Math.random() * 900)}`,
      customerId: targetCust.id,
      customerName: targetCust.name,
      customerPhone: targetCust.phone,
      orderNumber: orderNumber.trim() || undefined,
      garmentType: garmentTypeLabel,
      selectedGarments,
      unit,
      coat: selectedGarments.includes('Coat') ? coat : undefined,
      pant: selectedGarments.includes('Pant') ? pant : undefined,
      shirt: selectedGarments.includes('Shirt') ? shirt : undefined,
      kurta: selectedGarments.includes('Kurta') ? kurta : undefined,
      pajama: selectedGarments.includes('Pajama') ? pajama : undefined,
      fitPreference,
      postureNotes: postureNotes.trim(),
      fittingNotes: fittingNotes.trim(),
      lastUpdated: new Date().toISOString().split('T')[0],
      // Compatibility structures
      jacket: selectedGarments.includes('Coat') ? {
        chest: parseFloat(String(coat.chest)) || 40,
        waist: parseFloat(String(coat.stomach)) || 36,
        hip: parseFloat(String(coat.hip)) || 41,
        shoulderWidth: parseFloat(String(coat.shoulder)) || 18.5,
        sleeveLength: parseFloat(String(coat.sleeve)) || 25,
        jacketLength: parseFloat(String(coat.length)) || 30,
        crossBack: parseFloat(String(coat.xBack)) || 17.5,
        neck: 16.5,
        crossFront: 16,
        armhole: 20,
        bicep: 14.5
      } : undefined,
      trouser: selectedGarments.includes('Pant') ? {
        waist: parseFloat(String(pant.waist)) || 34,
        hip: parseFloat(String(pant.hip)) || 40.5,
        inseam: parseFloat(String(pant.inLeg)) || 31,
        outseam: parseFloat(String(pant.length)) || 40,
        thigh: parseFloat(String(pant.thigh)) || 24.5,
        bottomOpening: parseFloat(String(pant.bottom)) || 15,
        rise: parseFloat(String(pant.body)) || 11,
        knee: 18
      } : undefined
    };

    onSave(record);
    onClose();
  };

  // Helper renderer for two-column input parameters inside each garment card
  const renderParamField = (
    field: FieldConfig,
    stateObj: any,
    setter: (val: any) => void
  ) => {
    const val = stateObj[field.key] || '';
    return (
      <div 
        key={field.key} 
        className="bg-white p-3 rounded-xl border border-[#E6E1D7] hover:border-[#C9A24A]/70 transition-all shadow-2xs group flex flex-col justify-between"
      >
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-bold text-[#071426] tracking-tight">
            {field.label}
          </label>
          {field.sublabel && (
            <span className="text-[10px] text-[#8C7E6A] font-medium hidden sm:inline-block">
              {field.sublabel}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* Main Number Input */}
          <div className="relative flex-1">
            <input
              type="number"
              step="0.25"
              value={val}
              onChange={(e) => setter({ ...stateObj, [field.key]: e.target.value })}
              placeholder={field.placeholder}
              className="w-full bg-[#FAF8F5] group-hover:bg-white border border-[#E0D8CB] focus:border-[#C9A24A] rounded-lg px-3 py-1.5 text-sm font-extrabold text-[#071426] outline-none transition-all pr-8"
            />
            <span className="absolute right-2.5 top-2 text-[10px] font-bold text-[#8C7E6A] uppercase pointer-events-none">
              {unit === 'inches' ? 'in' : 'cm'}
            </span>
          </div>

          {/* Quick Step Buttons for Fast Shopfloor Adjustment */}
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onClick={() => handleNudge(stateObj, setter, field.key, -0.25)}
              className="p-1 bg-[#FAF8F5] hover:bg-[#F2ECE1] text-[#6E6454] rounded-md border border-[#E0D8CB] transition-colors"
              title="Decrease 0.25"
            >
              <Minus className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => handleNudge(stateObj, setter, field.key, 0.25)}
              className="p-1 bg-[#FAF8F5] hover:bg-[#F2ECE1] text-[#6E6454] rounded-md border border-[#E0D8CB] transition-colors"
              title="Increase 0.25"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#071426]/85 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto print-app-shell">
      <div className="bg-[#FAF8F5] rounded-2xl border border-[#E6E1D7] max-w-6xl w-full p-4 sm:p-6 shadow-2xl space-y-4 my-4 max-h-[94vh] flex flex-col font-sans">
        
        {/* ======================================================== */}
        {/* MODAL HEADER */}
        {/* ======================================================== */}
        <div className="flex items-center justify-between border-b border-[#E6E1D7] pb-3 shrink-0">
          <div>
            <div className="text-[10px] font-bold text-[#C9A24A] tracking-[0.2em] uppercase">
              REGENCY TAILOR • BESPOKE MEASUREMENT REGISTER
            </div>
            <h2 className="text-lg sm:text-xl font-extrabold text-[#071426] flex items-center gap-2 mt-0.5">
              <Ruler className="w-5 h-5 text-[#C9A24A]" />
              <span>{initialMeasurement ? 'Edit Bespoke Measurement' : 'Record New Customer Measurement'}</span>
            </h2>
          </div>

          <div className="flex items-center gap-3">
            {/* Unit Selector Toggle */}
            <div className="flex items-center bg-white p-1 rounded-xl border border-[#E0D8CB] shadow-2xs">
              <button
                type="button"
                onClick={() => setUnit('inches')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  unit === 'inches'
                    ? 'bg-[#071426] text-[#D4AF5A] shadow-xs'
                    : 'text-[#6E6454] hover:text-[#071426]'
                }`}
              >
                Inches (in)
              </button>
              <button
                type="button"
                onClick={() => setUnit('cm')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  unit === 'cm'
                    ? 'bg-[#071426] text-[#D4AF5A] shadow-xs'
                    : 'text-[#6E6454] hover:text-[#071426]'
                }`}
              >
                Centimeters (cm)
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 text-[#8C7E6A] hover:text-[#071426] hover:bg-white rounded-xl border border-transparent hover:border-[#E0D8CB] transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ======================================================== */}
        {/* TWO-COLUMN FORM LAYOUT */}
        {/* ======================================================== */}
        <form onSubmit={handleSubmit} id="measurement-form" className="overflow-y-auto pr-1 flex-1 space-y-6 overscroll-contain">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* ======================================================== */}
            {/* LEFT COLUMN: CUSTOMER & GARMENT CONTROLS (5 cols) */}
            {/* ======================================================== */}
            <div className="lg:col-span-5 space-y-5">
              
              {/* STEP 1: CUSTOMER SELECTION CARD */}
              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-[#E6E1D7] shadow-2xs space-y-3.5">
                <div className="flex items-center justify-between border-b border-[#F2ECE1] pb-2.5">
                  <span className="text-xs font-extrabold text-[#071426] uppercase tracking-wider flex items-center gap-1.5">
                    <User className="w-4 h-4 text-[#C9A24A]" />
                    <span>1. Customer Selection</span>
                  </span>

                  {/* Mode Switcher */}
                  <div className="flex items-center gap-1 bg-[#FAF8F5] p-0.5 rounded-lg border border-[#E0D8CB]">
                    <button
                      type="button"
                      onClick={() => setCustomerMode('existing')}
                      className={`px-2.5 py-0.5 text-[11px] font-bold rounded-md transition-all cursor-pointer ${
                        customerMode === 'existing'
                          ? 'bg-[#071426] text-[#D4AF5A]'
                          : 'text-[#6E6454] hover:text-[#071426]'
                      }`}
                    >
                      Existing
                    </button>
                    <button
                      type="button"
                      onClick={() => setCustomerMode('new')}
                      className={`px-2.5 py-0.5 text-[11px] font-bold rounded-md transition-all flex items-center gap-1 cursor-pointer ${
                        customerMode === 'new'
                          ? 'bg-[#071426] text-[#D4AF5A]'
                          : 'text-[#6E6454] hover:text-[#071426]'
                      }`}
                    >
                      <UserPlus className="w-3 h-3" />
                      <span>New</span>
                    </button>
                  </div>
                </div>

                {customerMode === 'existing' ? (
                  <div className="space-y-3">
                    {/* Search & Select dropdown */}
                    <div>
                      <label className="block text-[11px] font-bold text-[#6E6454] mb-1">
                        Search or Select Customer *
                      </label>
                      <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#C9A24A]" />
                        <input
                          type="text"
                          value={customerSearch}
                          onChange={(e) => {
                            setCustomerSearch(e.target.value);
                            setIsCustomerDropdownOpen(true);
                          }}
                          onFocus={() => setIsCustomerDropdownOpen(true)}
                          placeholder="Type name, phone or ID..."
                          className="w-full bg-[#FAF8F5] border border-[#E0D8CB] rounded-xl pl-9 pr-3 py-2 text-xs text-[#071426] font-semibold outline-none focus:border-[#C9A24A] focus:bg-white"
                        />

                        {/* Dropdown suggestions */}
                        {isCustomerDropdownOpen && customerSearch && (
                          <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-[#E0D8CB] rounded-xl shadow-lg max-h-48 overflow-y-auto divide-y divide-[#F2ECE1]">
                            {filteredCustomers.length > 0 ? (
                              filteredCustomers.map(c => (
                                <div
                                  key={c.id}
                                  onClick={() => {
                                    setSelectedCustomerId(c.id);
                                    setCustomerSearch(c.name);
                                    setIsCustomerDropdownOpen(false);
                                  }}
                                  className="p-2 hover:bg-[#F7F3EA] cursor-pointer flex items-center justify-between text-xs"
                                >
                                  <div>
                                    <span className="font-bold text-[#071426]">{c.name}</span>
                                    <span className="text-[#8C7E6A] ml-1.5 text-[11px]">({c.phone})</span>
                                  </div>
                                  <span className="text-[10px] font-mono text-[#C9A24A]">{c.id}</span>
                                </div>
                              ))
                            ) : (
                              <div className="p-3 text-center text-xs text-[#8C7E6A]">No customer found.</div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <select
                        value={selectedCustomerId}
                        onChange={(e) => setSelectedCustomerId(e.target.value)}
                        className="w-full bg-[#FAF8F5] border border-[#E0D8CB] p-2 rounded-xl text-xs font-bold text-[#071426] outline-none focus:border-[#C9A24A]"
                      >
                        {customers.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.name} • {c.phone} ({c.city})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Active Customer Summary Badge */}
                    {activeCustomer && (
                      <div className="bg-[#FAF8F5] p-3 rounded-xl border border-[#E6E1D7] flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-[#071426] text-[#D4AF5A] font-bold text-xs flex items-center justify-center">
                            {activeCustomer.name.charAt(0)}
                          </div>
                          <div>
                            <div className="font-extrabold text-[#071426] text-xs">
                              {activeCustomer.name}
                            </div>
                            <div className="text-[10px] text-[#7A7060]">
                              {activeCustomer.phone} • {activeCustomer.city}
                            </div>
                          </div>
                        </div>

                        {previousMeasurement && (
                          <button
                            type="button"
                            onClick={() => applyPreviousMeasurement(previousMeasurement)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all flex items-center gap-1 cursor-pointer ${
                              copyFeedback
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : 'bg-white text-[#071426] border-[#C9A24A] hover:bg-[#C9A24A] hover:text-[#071426]'
                            }`}
                            title="Clone previous specs"
                          >
                            {copyFeedback ? (
                              <>
                                <Check className="w-3 h-3" />
                                <span>Copied!</span>
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-3 h-3 text-[#C9A24A]" />
                                <span>Use Previous</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  /* Inline New Customer Creation */
                  <div className="space-y-2.5 bg-[#FAF8F5] p-3 rounded-xl border border-[#E6E1D7]">
                    <div>
                      <label className="block text-[11px] font-bold text-[#6E6454] mb-1">Customer Full Name *</label>
                      <input
                        type="text"
                        required
                        value={newCustomerName}
                        onChange={(e) => setNewCustomerName(e.target.value)}
                        placeholder="e.g. Jaspreet Singh"
                        className="w-full bg-white border border-[#E0D8CB] px-3 py-1.5 rounded-lg text-xs font-bold text-[#071426] outline-none focus:border-[#C9A24A]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-[#6E6454] mb-1">Contact Phone *</label>
                      <input
                        type="text"
                        required
                        value={newCustomerPhone}
                        onChange={(e) => setNewCustomerPhone(e.target.value)}
                        placeholder="e.g. +91 98765 43210"
                        className="w-full bg-white border border-[#E0D8CB] px-3 py-1.5 rounded-lg text-xs font-bold text-[#071426] outline-none focus:border-[#C9A24A]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-[#6E6454] mb-1">City / Region</label>
                      <input
                        type="text"
                        value={newCustomerCity}
                        onChange={(e) => setNewCustomerCity(e.target.value)}
                        placeholder="e.g. Jalandhar"
                        className="w-full bg-white border border-[#E0D8CB] px-3 py-1.5 rounded-lg text-xs font-bold text-[#071426] outline-none focus:border-[#C9A24A]"
                      />
                    </div>
                  </div>
                )}

                {/* Linked Order Number */}
                <div className="pt-1 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-[#6E6454]">Linked Order # (Optional):</span>
                  <input
                    type="text"
                    value={orderNumber}
                    onChange={(e) => setOrderNumber(e.target.value)}
                    placeholder="REG-2026-089"
                    className="bg-white border border-[#E0D8CB] px-2.5 py-1 rounded-lg text-xs text-[#071426] font-mono font-bold outline-none focus:border-[#C9A24A] w-36 text-right"
                  />
                </div>
              </div>

              {/* STEP 2: GARMENT SELECTION CARD */}
              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-[#E6E1D7] shadow-2xs space-y-3.5">
                <div className="flex items-center justify-between border-b border-[#F2ECE1] pb-2.5">
                  <span className="text-xs font-extrabold text-[#071426] uppercase tracking-wider flex items-center gap-1.5">
                    <Scissors className="w-4 h-4 text-[#C9A24A]" />
                    <span>2. Select Garment Types</span>
                  </span>
                  <span className="text-[10px] font-bold text-[#C9A24A]">
                    {selectedGarments.length} Active
                  </span>
                </div>

                {/* Quick Selection Presets */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] text-[#8C7E6A] font-bold uppercase">Presets:</span>
                  <button
                    type="button"
                    onClick={() => selectPreset('suit2')}
                    className="px-2 py-0.5 rounded-md bg-[#FAF8F5] hover:bg-[#F2ECE1] text-[10px] font-bold text-[#071426] border border-[#E0D8CB] cursor-pointer"
                  >
                    2-Pc Suit
                  </button>
                  <button
                    type="button"
                    onClick={() => selectPreset('suit3')}
                    className="px-2 py-0.5 rounded-md bg-[#FAF8F5] hover:bg-[#F2ECE1] text-[10px] font-bold text-[#071426] border border-[#E0D8CB] cursor-pointer"
                  >
                    3-Pc Suit
                  </button>
                  <button
                    type="button"
                    onClick={() => selectPreset('kurtaPajama')}
                    className="px-2 py-0.5 rounded-md bg-[#FAF8F5] hover:bg-[#F2ECE1] text-[10px] font-bold text-[#071426] border border-[#E0D8CB] cursor-pointer"
                  >
                    Kurta Pajama
                  </button>
                  <button
                    type="button"
                    onClick={() => selectPreset('all')}
                    className="px-2 py-0.5 rounded-md bg-[#FAF8F5] hover:bg-[#F2ECE1] text-[10px] font-bold text-[#071426] border border-[#E0D8CB] cursor-pointer"
                  >
                    All Garments
                  </button>
                </div>

                {/* 5 Garment Checkbox Pills */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {/* Coat */}
                  <button
                    type="button"
                    onClick={() => toggleGarment('Coat')}
                    className={`p-2.5 rounded-xl border text-left transition-all flex items-center justify-between cursor-pointer ${
                      selectedGarments.includes('Coat')
                        ? 'bg-[#071426] text-white border-[#C9A24A] shadow-xs'
                        : 'bg-[#FAF8F5] text-[#071426] border-[#E0D8CB] hover:bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base">🧥</span>
                      <div>
                        <div className={`font-extrabold text-xs ${selectedGarments.includes('Coat') ? 'text-[#D4AF5A]' : 'text-[#071426]'}`}>
                          COAT
                        </div>
                        <div className={`text-[10px] ${selectedGarments.includes('Coat') ? 'text-slate-300' : 'text-[#8C7E6A]'}`}>
                          Blazer, Tuxedo
                        </div>
                      </div>
                    </div>
                    <div className={`w-4 h-4 rounded-md border flex items-center justify-center text-xs font-bold ${
                      selectedGarments.includes('Coat')
                        ? 'bg-[#C9A24A] text-[#071426] border-[#C9A24A]'
                        : 'border-[#CCC3B2] bg-white'
                    }`}>
                      {selectedGarments.includes('Coat') && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                  </button>

                  {/* Pant */}
                  <button
                    type="button"
                    onClick={() => toggleGarment('Pant')}
                    className={`p-2.5 rounded-xl border text-left transition-all flex items-center justify-between cursor-pointer ${
                      selectedGarments.includes('Pant')
                        ? 'bg-[#071426] text-white border-[#C9A24A] shadow-xs'
                        : 'bg-[#FAF8F5] text-[#071426] border-[#E0D8CB] hover:bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base">👖</span>
                      <div>
                        <div className={`font-extrabold text-xs ${selectedGarments.includes('Pant') ? 'text-[#D4AF5A]' : 'text-[#071426]'}`}>
                          PANT
                        </div>
                        <div className={`text-[10px] ${selectedGarments.includes('Pant') ? 'text-slate-300' : 'text-[#8C7E6A]'}`}>
                          Trousers, Slacks
                        </div>
                      </div>
                    </div>
                    <div className={`w-4 h-4 rounded-md border flex items-center justify-center text-xs font-bold ${
                      selectedGarments.includes('Pant')
                        ? 'bg-[#C9A24A] text-[#071426] border-[#C9A24A]'
                        : 'border-[#CCC3B2] bg-white'
                    }`}>
                      {selectedGarments.includes('Pant') && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                  </button>

                  {/* Shirt */}
                  <button
                    type="button"
                    onClick={() => toggleGarment('Shirt')}
                    className={`p-2.5 rounded-xl border text-left transition-all flex items-center justify-between cursor-pointer ${
                      selectedGarments.includes('Shirt')
                        ? 'bg-[#071426] text-white border-[#C9A24A] shadow-xs'
                        : 'bg-[#FAF8F5] text-[#071426] border-[#E0D8CB] hover:bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base">👔</span>
                      <div>
                        <div className={`font-extrabold text-xs ${selectedGarments.includes('Shirt') ? 'text-[#D4AF5A]' : 'text-[#071426]'}`}>
                          SHIRT
                        </div>
                        <div className={`text-[10px] ${selectedGarments.includes('Shirt') ? 'text-slate-300' : 'text-[#8C7E6A]'}`}>
                          Bespoke Shirt
                        </div>
                      </div>
                    </div>
                    <div className={`w-4 h-4 rounded-md border flex items-center justify-center text-xs font-bold ${
                      selectedGarments.includes('Shirt')
                        ? 'bg-[#C9A24A] text-[#071426] border-[#C9A24A]'
                        : 'border-[#CCC3B2] bg-white'
                    }`}>
                      {selectedGarments.includes('Shirt') && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                  </button>

                  {/* Kurta */}
                  <button
                    type="button"
                    onClick={() => toggleGarment('Kurta')}
                    className={`p-2.5 rounded-xl border text-left transition-all flex items-center justify-between cursor-pointer ${
                      selectedGarments.includes('Kurta')
                        ? 'bg-[#071426] text-white border-[#C9A24A] shadow-xs'
                        : 'bg-[#FAF8F5] text-[#071426] border-[#E0D8CB] hover:bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base">👘</span>
                      <div>
                        <div className={`font-extrabold text-xs ${selectedGarments.includes('Kurta') ? 'text-[#D4AF5A]' : 'text-[#071426]'}`}>
                          KURTA
                        </div>
                        <div className={`text-[10px] ${selectedGarments.includes('Kurta') ? 'text-slate-300' : 'text-[#8C7E6A]'}`}>
                          Ethnic Kurta
                        </div>
                      </div>
                    </div>
                    <div className={`w-4 h-4 rounded-md border flex items-center justify-center text-xs font-bold ${
                      selectedGarments.includes('Kurta')
                        ? 'bg-[#C9A24A] text-[#071426] border-[#C9A24A]'
                        : 'border-[#CCC3B2] bg-white'
                    }`}>
                      {selectedGarments.includes('Kurta') && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                  </button>

                  {/* Pajama */}
                  <button
                    type="button"
                    onClick={() => toggleGarment('Pajama')}
                    className={`p-2.5 rounded-xl border text-left transition-all flex items-center justify-between cursor-pointer sm:col-span-2 ${
                      selectedGarments.includes('Pajama')
                        ? 'bg-[#071426] text-white border-[#C9A24A] shadow-xs'
                        : 'bg-[#FAF8F5] text-[#071426] border-[#E0D8CB] hover:bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base">🩳</span>
                      <div>
                        <div className={`font-extrabold text-xs ${selectedGarments.includes('Pajama') ? 'text-[#D4AF5A]' : 'text-[#071426]'}`}>
                          PAJAMA
                        </div>
                        <div className={`text-[10px] ${selectedGarments.includes('Pajama') ? 'text-slate-300' : 'text-[#8C7E6A]'}`}>
                          Pyjama, Churidar, Aligarhi
                        </div>
                      </div>
                    </div>
                    <div className={`w-4 h-4 rounded-md border flex items-center justify-center text-xs font-bold ${
                      selectedGarments.includes('Pajama')
                        ? 'bg-[#C9A24A] text-[#071426] border-[#C9A24A]'
                        : 'border-[#CCC3B2] bg-white'
                    }`}>
                      {selectedGarments.includes('Pajama') && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                  </button>
                </div>
              </div>

              {/* STEP 3: FIT PROFILE & TAILOR INSTRUCTIONS */}
              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-[#E6E1D7] shadow-2xs space-y-3.5">
                <div className="flex items-center justify-between border-b border-[#F2ECE1] pb-2.5">
                  <span className="text-xs font-extrabold text-[#071426] uppercase tracking-wider flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-[#C9A24A]" />
                    <span>3. Fit &amp; Special Instructions</span>
                  </span>

                  <select
                    value={fitPreference}
                    onChange={(e) => setFitPreference(e.target.value)}
                    className="bg-[#FAF8F5] border border-[#E0D8CB] px-2.5 py-1 rounded-lg text-xs font-bold text-[#071426] outline-none"
                  >
                    <option value="">Select fit preference…</option>
                    <option value="Italian Cut">Italian Cut</option>
                    <option value="Slim Fit">Slim Fit</option>
                    <option value="Classic Tailored">Classic Tailored</option>
                    <option value="Structured Shoulder">Structured Shoulder</option>
                    <option value="Soft Shoulder">Soft Shoulder</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-[#6E6454] mb-1">
                    Cutter &amp; Workshop Notes
                  </label>
                  <textarea
                    rows={2}
                    value={fittingNotes}
                    onChange={(e) => setFittingNotes(e.target.value)}
                    placeholder="e.g. Slim fit with comfortable thigh room, watch sleeve allowance..."
                    className="w-full bg-[#FAF8F5] border border-[#E0D8CB] p-2.5 rounded-xl text-xs text-[#071426] outline-none focus:border-[#C9A24A] focus:bg-white"
                  />

                  {/* Quick Tag Badges */}
                  <div className="flex flex-wrap items-center gap-1 mt-2">
                    <span className="text-[10px] text-[#8C7E6A] font-bold">Quick:</span>
                    {[
                      'Slim Fit',
                      'Right Shoulder Slope (-0.5")',
                      'High Armhole',
                      'Watch Allowance',
                      'Comfort Thigh',
                      'French Cuff'
                    ].map(tag => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => {
                          setFittingNotes(prev => prev ? `${prev}, ${tag}` : tag);
                        }}
                        className="px-2 py-0.5 bg-[#FAF8F5] hover:bg-[#F2ECE1] border border-[#E0D8CB] rounded-md text-[10px] font-semibold text-[#6E6454] transition-colors cursor-pointer"
                      >
                        + {tag}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

            </div>

            {/* ======================================================== */}
            {/* RIGHT COLUMN: GROUPED GARMENT MEASUREMENT SUITE (7 cols) */}
            {/* ======================================================== */}
            <div className="lg:col-span-7 space-y-5">
              
              {selectedGarments.length === 0 ? (
                <div className="bg-white p-8 rounded-2xl border border-dashed border-[#E0D8CB] text-center space-y-2">
                  <Scissors className="w-8 h-8 mx-auto text-[#C9A24A]" />
                  <div className="text-sm font-bold text-[#071426]">No Garments Selected</div>
                  <p className="text-xs text-[#8C7E6A]">
                    Please pick at least one garment from the left column to begin entering parameters.
                  </p>
                </div>
              ) : null}

              {/* 1. COAT MEASUREMENT CARD */}
              {selectedGarments.includes('Coat') && (
                <div className="bg-[#FAF8F5] rounded-2xl border-2 border-[#C9A24A]/40 p-4 sm:p-5 space-y-4 shadow-sm">
                  <div className="flex items-center justify-between border-b border-[#E6E1D7] pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🧥</span>
                      <div>
                        <h3 className="text-xs sm:text-sm font-extrabold text-[#071426] uppercase tracking-wider">
                          COAT SPECIFICATIONS
                        </h3>
                        <span className="text-[10px] text-[#8C7E6A] font-bold">
                          Suit Jacket / Blazer / Tuxedo ({unit})
                        </span>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[#071426] text-[#D4AF5A]">
                      7 Parameters
                    </span>
                  </div>

                  {/* 2-Column Parameter Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {COAT_FIELDS.map(f => renderParamField(f, coat, setCoat))}
                  </div>
                </div>
              )}

              {/* 2. PANT MEASUREMENT CARD */}
              {selectedGarments.includes('Pant') && (
                <div className="bg-[#FAF8F5] rounded-2xl border-2 border-[#C9A24A]/40 p-4 sm:p-5 space-y-4 shadow-sm">
                  <div className="flex items-center justify-between border-b border-[#E6E1D7] pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">👖</span>
                      <div>
                        <h3 className="text-xs sm:text-sm font-extrabold text-[#071426] uppercase tracking-wider">
                          PANT SPECIFICATIONS
                        </h3>
                        <span className="text-[10px] text-[#8C7E6A] font-bold">
                          Bespoke Trousers / Slacks ({unit})
                        </span>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[#071426] text-[#D4AF5A]">
                      7 Parameters
                    </span>
                  </div>

                  {/* 2-Column Parameter Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {PANT_FIELDS.map(f => renderParamField(f, pant, setPant))}
                  </div>
                </div>
              )}

              {/* 3. SHIRT MEASUREMENT CARD */}
              {selectedGarments.includes('Shirt') && (
                <div className="bg-[#FAF8F5] rounded-2xl border-2 border-[#C9A24A]/40 p-4 sm:p-5 space-y-4 shadow-sm">
                  <div className="flex items-center justify-between border-b border-[#E6E1D7] pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">👔</span>
                      <div>
                        <h3 className="text-xs sm:text-sm font-extrabold text-[#071426] uppercase tracking-wider">
                          SHIRT SPECIFICATIONS
                        </h3>
                        <span className="text-[10px] text-[#8C7E6A] font-bold">
                          Bespoke Dress Shirt ({unit})
                        </span>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[#071426] text-[#D4AF5A]">
                      8 Parameters
                    </span>
                  </div>

                  {/* 2-Column Parameter Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {SHIRT_FIELDS.map(f => renderParamField(f, shirt, setShirt))}
                  </div>
                </div>
              )}

              {/* 4. KURTA MEASUREMENT CARD */}
              {selectedGarments.includes('Kurta') && (
                <div className="bg-[#FAF8F5] rounded-2xl border-2 border-[#C9A24A]/40 p-4 sm:p-5 space-y-4 shadow-sm">
                  <div className="flex items-center justify-between border-b border-[#E6E1D7] pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">👘</span>
                      <div>
                        <h3 className="text-xs sm:text-sm font-extrabold text-[#071426] uppercase tracking-wider">
                          KURTA SPECIFICATIONS
                        </h3>
                        <span className="text-[10px] text-[#8C7E6A] font-bold">
                          Traditional &amp; Designer Kurta ({unit})
                        </span>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[#071426] text-[#D4AF5A]">
                      7 Parameters
                    </span>
                  </div>

                  {/* 2-Column Parameter Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {KURTA_FIELDS.map(f => renderParamField(f, kurta, setKurta))}
                  </div>
                </div>
              )}

              {/* 5. PAJAMA MEASUREMENT CARD */}
              {selectedGarments.includes('Pajama') && (
                <div className="bg-[#FAF8F5] rounded-2xl border-2 border-[#C9A24A]/40 p-4 sm:p-5 space-y-4 shadow-sm">
                  <div className="flex items-center justify-between border-b border-[#E6E1D7] pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🩳</span>
                      <div>
                        <h3 className="text-xs sm:text-sm font-extrabold text-[#071426] uppercase tracking-wider">
                          PAJAMA SPECIFICATIONS
                        </h3>
                        <span className="text-[10px] text-[#8C7E6A] font-bold">
                          Pyjama / Churidar / Aligarhi ({unit})
                        </span>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[#071426] text-[#D4AF5A]">
                      7 Parameters
                    </span>
                  </div>

                  {/* 2-Column Parameter Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {PAJAMA_FIELDS.map(f => renderParamField(f, pajama, setPajama))}
                  </div>
                </div>
              )}

            </div>

          </div>
        </form>

        {/* ======================================================== */}
        {/* MODAL FOOTER */}
        {/* ======================================================== */}
        <div className="flex items-center justify-between pt-3 border-t border-[#E6E1D7] shrink-0">
          <div className="text-xs text-[#8C7E6A] hidden sm:block">
            Selected: <strong className="text-[#071426]">{selectedGarments.join(', ')}</strong> • Unit: <strong className="text-[#C9A24A]">{unit.toUpperCase()}</strong>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white border border-[#E0D8CB] text-[#071426] font-bold text-xs rounded-xl hover:bg-[#FAF8F5] transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              form="measurement-form"
              className="px-6 py-2.5 bg-[#C9A24A] hover:bg-[#B8913B] text-[#071426] font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center gap-2 active:scale-95 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Save Measurements</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
