import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  X, 
  Scissors, 
  Check, 
  CheckCircle2, 
  Search, 
  Plus, 
  ArrowRight, 
  ArrowLeft, 
  Printer, 
  AlertCircle, 
  RefreshCw, 
  User, 
  Phone, 
  MapPin, 
  Calendar, 
  Clock, 
  Sparkles, 
  Eye,
  ShoppingBag,
  FileText,
  ReceiptText
} from 'lucide-react';
import { peekNextOrderNumber, allocateOrderNumber } from '../../utils/orderNumbering';
import { 
  Order, 
  GarmentType, 
  Customer, 
  MeasurementRecord, 
  CoatMeasurement, 
  PantMeasurement, 
  ShirtMeasurement, 
  KurtaMeasurement, 
  PajamaMeasurement, 
  Invoice, 
  TrashItem
} from '../../types';
import {
  sectionFields,
  measurementDisplayValue,
  MeasurementSection
} from '../../utils/garmentMeasurements';

interface OrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveOrder?: (data: {
    order: Order;
    customer: Customer;
    isNewCustomer: boolean;
    measurementRecord?: MeasurementRecord;
    invoice?: Invoice;
  }) => void;
  onSave?: (order: Order) => void | Order | Promise<Order | void>;
  customers?: Customer[];
  allMeasurements?: MeasurementRecord[];
  measurements?: MeasurementRecord[];
  existingOrders?: Order[];
  orders?: Order[];
  trashItems?: TrashItem[];
  initialOrder?: Order | null;
  preselectedCustomer?: Customer | null;
  /** Persists the customer and, in Supabase mode, returns the stored record —
   *  whose id is the real database uuid the order must be linked to. */
  onAddCustomer?: (customer: Customer) => Customer | undefined | Promise<Customer | undefined>;
  onViewOrderDetails?: (order: Order) => void;
  onPrintProductionSlip?: (order: Order) => void;
  /** Customer-facing bill with no financial information. */
  onPrintOrderBill?: (order: Order) => void;
}

// Must match App.tsx's STORAGE_KEY — the order-number high-water mark lives there.
const ORDER_STORAGE_KEY = 'REGENCY_TAILORS_DB_V3';

/** Last 10 digits, so "+91 98765 43210" and "9876543210" are the same client. */
const normalisePhone = (phone?: string): string => {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
};

// 5 CLEAN STEPS: 1 Customer -> 2 Order Details -> 3 Garments -> 4 Measurements -> 5 Review
type OrderStep = 1 | 2 | 3 | 4 | 5;

/* The garments the showroom sells. Coat and Pant are separate products: a
 * customer ordering both gets two line items, each with its own quantity,
 * measurements and remark. There is deliberately no combined entry. */
type GarmentKey = 'Coat' | 'Pant' | 'Shirt' | 'Kurta Pajama';

interface GarmentConfig {
  key: GarmentKey;
  label: string;
  sublabel: string;
  icon: string;
}

/**
 * A garment's measurements for the wizard's review step, in one line.
 *
 * Every field the garment defines is listed, in the canonical order, with an
 * em dash where nothing was entered. The coat's line used to be written out by
 * hand and stopped after Collar, so a counter hand checking their work before
 * placing the order never saw whether X-Back, Jacket Length or Waistcoat
 * Length had been taken.
 */
function summariseMeasurement(section: MeasurementSection, values: object): string {
  const read = values as Record<string, string | number | undefined>;
  return sectionFields(section)
    .map(f => `${f.label}: ${measurementDisplayValue(read[f.key])}`)
    .join('  •  ');
}

const GARMENT_CONFIGS: GarmentConfig[] = [
  {
    key: 'Coat',
    label: 'COAT',
    sublabel: 'Bespoke Coat / Blazer / Suit Jacket',
    icon: '🧥'
  },
  {
    key: 'Pant',
    label: 'PANT',
    sublabel: 'Custom Tailored Trouser / Pant',
    icon: '👖'
  },
  {
    key: 'Shirt',
    label: 'SHIRT',
    sublabel: 'Hand-Tailored Egyptian Cotton Dress Shirt',
    icon: '👔'
  },
  {
    key: 'Kurta Pajama',
    label: 'KURTA PAJAMA',
    sublabel: 'Royal Bespoke Kurta with Tailored Pajama',
    icon: '👘'
  }
];

export const OrderModal: React.FC<OrderModalProps> = ({
  isOpen,
  onClose,
  onSaveOrder,
  onSave,
  customers = [],
  allMeasurements = [],
  measurements = [],
  existingOrders = [],
  orders = [],
  trashItems = [],
  initialOrder,
  preselectedCustomer,
  onAddCustomer,
  onViewOrderDetails,
  onPrintProductionSlip,
  onPrintOrderBill
}) => {
  const measurementsPool = allMeasurements && allMeasurements.length > 0 ? allMeasurements : measurements || [];
  const ordersPool = existingOrders && existingOrders.length > 0 ? existingOrders : orders || [];

  // Step Navigation State (1 to 5)
  const [currentStep, setCurrentStep] = useState<OrderStep>(1);
  const [isSuccessScreen, setIsSuccessScreen] = useState(false);
  const [createdOrderSummary, setCreatedOrderSummary] = useState<Order | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Field-level validation errors
  const [formErrors, setFormErrors] = useState<{
    customerName?: string;
    customerPhone?: string;
    deliveryDate?: string;
    garments?: string;
  }>({});

  // STEP 1: Customer State (Independent & Isolated fields)
  const [customerMode, setCustomerMode] = useState<'new' | 'existing'>('new');
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerCity, setCustomerCity] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerNotes, setCustomerNotes] = useState('');

  // STEP 2: Order Details State
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [deliveryDate, setDeliveryDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 12);
    return d.toISOString().split('T')[0];
  });
  const [specialInstructions, setSpecialInstructions] = useState('');

  // STEP 3: Garments State
  const [selectedGarments, setSelectedGarments] = useState<{
    [key in GarmentKey]?: {
      selected: boolean;
      quantity: number;
      fabricName: string;
      fabricCode: string;
      styleNotes: string;
      specialInstructions: string;
      remarks?: string;
    };
  }>({
    Coat: {
      selected: false,
      quantity: 1,
      fabricName: '',
      fabricCode: '',
      styleNotes: '',
      specialInstructions: '',
      remarks: ''
    },
    Pant: {
      selected: false,
      quantity: 1,
      fabricName: '',
      fabricCode: '',
      styleNotes: '',
      specialInstructions: '',
      remarks: ''
    },
    Shirt: {
      selected: false,
      quantity: 1,
      fabricName: '',
      fabricCode: '',
      styleNotes: '',
      specialInstructions: '',
      remarks: ''
    },
    'Kurta Pajama': {
      selected: false,
      quantity: 1,
      fabricName: '',
      fabricCode: '',
      styleNotes: '',
      specialInstructions: '',
      remarks: ''
    }
  });

  // STEP 4: Measurements State
  const [unit, setUnit] = useState<'inches' | 'cm'>('inches');
  const [fitPreference, setFitPreference] = useState<string>('');
  const [fittingNotes, setFittingNotes] = useState('');
  const [usedPreviousFeedback, setUsedPreviousFeedback] = useState(false);

  // Garment Measurements
  const [coatMeas, setCoatMeas] = useState<CoatMeasurement>({
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

  const [pantMeas, setPantMeas] = useState<PantMeasurement>({
    length: '',
    waist: '',
    hip: '',
    thigh: '',
    inLeg: '',
    bottom: '',
    body: ''
  });

  const [shirtMeas, setShirtMeas] = useState<ShirtMeasurement>({
    length: '',
    chest: '',
    stomach: '',
    hip: '',
    shoulder: '',
    sleeve: '',
    collar: '',
    cuff: ''
  });

  const [kurtaMeas, setKurtaMeas] = useState<KurtaMeasurement>({
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

  const [pajamaMeas, setPajamaMeas] = useState<PajamaMeasurement>({
    length: '',
    waist: '',
    hip: '',
    thigh: '',
    inLeg: '',
    bottom: '',
    body: ''
  });

  // Track if modal was already opened
  const wasOpenRef = useRef(false);
  const modalMainRef = useRef<HTMLElement | null>(null);

  // Smooth scroll to top of step container on step change
  useEffect(() => {
    if (modalMainRef.current) {
      modalMainRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [currentStep]);

  // -------------------------------------------------------------
  // Dynamic Sequential Order Number (Order #1, Order #2, Order #3...)
  // Only consumed upon final successful order placement
  // -------------------------------------------------------------
  // Preview only. The number actually issued is allocated at submit time from
  // the persisted high-water mark, so a number retired by a delete + empty-trash
  // (or already taken by another browser tab) can never be handed out twice.
  const displayOrderNumber = useMemo(() => {
    if (initialOrder) {
      return initialOrder.orderNumber || initialOrder.id;
    }
    return peekNextOrderNumber(ORDER_STORAGE_KEY, ordersPool, trashItems);
  }, [ordersPool, trashItems, initialOrder, isOpen]);

  // Clean Reset Function for New Order
  const resetToCleanNewOrder = () => {
    setCurrentStep(1);
    setIsSuccessScreen(false);
    setCreatedOrderSummary(null);
    setSaveError(null);
    setIsSubmitting(false);
    setFormErrors({});
    setUsedPreviousFeedback(false);

    // Step 1: Clean fields
    if (preselectedCustomer) {
      setCustomerMode('existing');
      setSelectedCustomerId(preselectedCustomer.id);
      setCustomerName(preselectedCustomer.name || '');
      setCustomerPhone(preselectedCustomer.phone || '');
      setCustomerCity(preselectedCustomer.city || '');
      setCustomerAddress(preselectedCustomer.address || '');
      setCustomerNotes(preselectedCustomer.notes || '');
      setCustomerSearch('');
    } else {
      setCustomerMode('new');
      setSelectedCustomerId('');
      setCustomerName('');
      setCustomerPhone('');
      setCustomerCity('');
      setCustomerAddress('');
      setCustomerNotes('');
      setCustomerSearch('');
    }

    // Step 2: Clean dates & notes
    setOrderDate(new Date().toISOString().split('T')[0]);
    const d = new Date();
    d.setDate(d.getDate() + 12);
    setDeliveryDate(d.toISOString().split('T')[0]);
    setSpecialInstructions('');

    // Step 3: Default Garment
    setSelectedGarments({
      Coat: {
        selected: false,
        quantity: 1,
        fabricName: '',
        fabricCode: '',
        styleNotes: '',
        specialInstructions: '',
        remarks: ''
      },
      Pant: {
        selected: false,
        quantity: 1,
        fabricName: '',
        fabricCode: '',
        styleNotes: '',
        specialInstructions: '',
        remarks: ''
      },
      Shirt: {
        selected: false,
        quantity: 1,
        fabricName: '',
        fabricCode: '',
        styleNotes: '',
        specialInstructions: '',
        remarks: ''
      },
      'Kurta Pajama': {
        selected: false,
        quantity: 1,
        fabricName: '',
        fabricCode: '',
        styleNotes: '',
        specialInstructions: '',
        remarks: ''
      }
    });

    // Step 4: Measurements
    setUnit('inches');
    setFitPreference('');
    setFittingNotes('');
    setCoatMeas({
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
    setPantMeas({
      length: '',
      waist: '',
      hip: '',
      thigh: '',
      inLeg: '',
      bottom: '',
      body: ''
    });
    setShirtMeas({
      length: '',
      chest: '',
      stomach: '',
      hip: '',
      shoulder: '',
      sleeve: '',
      collar: '',
      cuff: ''
    });
    setKurtaMeas({
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
    setPajamaMeas({
      length: '',
      waist: '',
      hip: '',
      thigh: '',
      inLeg: '',
      bottom: '',
      body: ''
    });
  };

  // Reset form whenever modal opens fresh
  useEffect(() => {
    if (isOpen) {
      if (!wasOpenRef.current) {
        wasOpenRef.current = true;
        if (initialOrder) {
          // Edit Mode
          setCurrentStep(1);
          setIsSuccessScreen(false);
          setCreatedOrderSummary(null);
          setSaveError(null);
          setIsSubmitting(false);
          setFormErrors({});

          setSelectedCustomerId(initialOrder.customerId);
          setCustomerName(initialOrder.customerName || '');
          setCustomerPhone(initialOrder.customerPhone || '');
          const existingCust = customers.find(c => c.id === initialOrder.customerId);
          setCustomerCity(existingCust?.city || '');
          setCustomerAddress(existingCust?.address || '');
          setCustomerNotes(existingCust?.notes || '');
          setCustomerMode('existing');

          setOrderDate(initialOrder.orderDate || new Date().toISOString().split('T')[0]);
          setDeliveryDate(initialOrder.deliveryDate);
          setSpecialInstructions(initialOrder.notes || initialOrder.specialInstructions || '');

          // Prepopulate garments
          const newSel = { ...selectedGarments };
          Object.keys(newSel).forEach(k => {
            newSel[k as GarmentKey]!.selected = false;
          });
          /*
           * Which product(s) a stored line item maps back onto.
           *
           * Almost always one. The exception is a legacy "Full Coat Pant" — the
           * combined garment the showroom used to sell — which maps onto both
           * Coat and Pant, because that is what it always was. Editing such an
           * order therefore reopens it as two products, and saving writes it
           * back as two line items. That is a deliberate conversion, not a
           * silent one: it happens only when someone opens the order and saves
           * it, and it never runs over stored data on its own. An order nobody
           * edits keeps exactly the record it was placed with.
           */
          const keysForItem = (garmentType: string): GarmentKey[] => {
            const t = (garmentType || '').toLowerCase();
            if (t.includes('kurta') || t.includes('ethnic') || t.includes('pajama')) return ['Kurta Pajama'];
            if (t.includes('shirt')) return ['Shirt'];
            const coat = t.includes('coat') || t.includes('blazer') || t.includes('jacket') || t.includes('suit');
            const pant = t.includes('pant') || t.includes('trouser') || t.includes('suit');
            if (coat && pant) return ['Coat', 'Pant'];
            if (pant) return ['Pant'];
            return ['Coat'];
          };

          // An explicit Coat or Pant line beats one derived from a combined
          // legacy item, so an order carrying both keeps the explicit values.
          const claimed = new Set<GarmentKey>();
          initialOrder.items.forEach(item => {
            const keys = keysForItem(item.garmentType || '');
            const derived = keys.length > 1;
            keys.forEach(key => {
              if (derived && claimed.has(key)) return;
              if (!derived) claimed.add(key);
              newSel[key] = {
                selected: true,
                quantity: item.quantity || 1,
                fabricName: item.fabricName,
                fabricCode: item.fabricCode,
                styleNotes: item.styleNotes || item.notes || '',
                specialInstructions: item.specialInstructions || '',
                remarks:
                  item.remarks ||
                  initialOrder.measurementsSnapshot?.garmentRemarks?.[key] ||
                  initialOrder.measurementsSnapshot?.garmentRemarks?.[item.garmentType || ''] ||
                  ''
              };
            });
          });
          setSelectedGarments(newSel);

          // Snapshot measurements
          if (initialOrder.measurementsSnapshot) {
            const s = initialOrder.measurementsSnapshot;
            if (s.coat) setCoatMeas(s.coat);
            if (s.pant) setPantMeas(s.pant);
            if (s.shirt) setShirtMeas(s.shirt);
            if (s.kurta) setKurtaMeas(s.kurta);
            if (s.pajama) setPajamaMeas(s.pajama);
            if (s.unit) setUnit(s.unit);
            if (s.fitPreference) setFitPreference(s.fitPreference);
            if (s.fittingNotes) setFittingNotes(s.fittingNotes);
          }
        } else {
          // Pure Clean New Order Mode
          resetToCleanNewOrder();
        }
      }
    } else {
      wasOpenRef.current = false;
      setIsSuccessScreen(false);
      setCreatedOrderSummary(null);
      setIsSubmitting(false);
      setSaveError(null);
      setFormErrors({});
    }
  }, [isOpen, initialOrder, preselectedCustomer]);

  // Active customer helper
  const currentCustomer = useMemo(() => {
    if (customerMode === 'new') {
      if (!customerName.trim()) return null;
      return {
        id: `CUST-${Math.floor(1000 + Math.random() * 9000)}`,
        name: customerName.trim(),
        phone: customerPhone.trim(),
        email: '',
        city: customerCity.trim(),
        address: customerAddress.trim(),
        notes: customerNotes.trim(),
        totalOrders: 0,
        lifetimeSpend: 0,
        createdDate: new Date().toISOString().split('T')[0],
        lastVisitDate: new Date().toISOString().split('T')[0]
      } as Customer;
    }
    return customers.find(c => c.id === selectedCustomerId) || null;
  }, [customerMode, selectedCustomerId, customers, customerName, customerPhone, customerCity, customerAddress, customerNotes]);

  // Check if customer has previous measurements
  const previousMeasurementRecord = useMemo(() => {
    if (!currentCustomer) return null;
    return measurementsPool.find(
      m => m.customerId === currentCustomer.id || (currentCustomer.phone && m.customerPhone === currentCustomer.phone)
    ) || null;
  }, [currentCustomer, measurementsPool]);

  // Load previous measurements
  const checkAndLoadPreviousMeasurements = (custId: string) => {
    const prev = measurementsPool.find(m => m.customerId === custId);
    if (prev) {
      if (prev.coat) setCoatMeas(prev.coat);
      if (prev.pant) setPantMeas(prev.pant);
      if (prev.shirt) setShirtMeas(prev.shirt);
      if (prev.kurta) setKurtaMeas(prev.kurta);
      if (prev.pajama) setPajamaMeas(prev.pajama);
      if (prev.unit) setUnit(prev.unit);
      if (prev.fitPreference) setFitPreference(prev.fitPreference);
      if (prev.fittingNotes) setFittingNotes(prev.fittingNotes);
      setUsedPreviousFeedback(true);
      setTimeout(() => setUsedPreviousFeedback(false), 3000);
    }
  };

  // Active Garments List
  const activeGarmentsList = useMemo(() => {
    const list: Array<{
      key: GarmentKey;
      label: string;
      selected: boolean;
      quantity: number;
      fabricName: string;
      fabricCode: string;
      styleNotes: string;
      specialInstructions: string;
      remarks?: string;
    }> = [];

    (Object.entries(selectedGarments) as [GarmentKey, {
      selected: boolean;
      quantity: number;
      fabricName: string;
      fabricCode: string;
      styleNotes: string;
      specialInstructions: string;
      remarks?: string;
    } | undefined][]).forEach(([key, data]) => {
      if (data && data.selected) {
        const cfg = GARMENT_CONFIGS.find(c => c.key === key);
        list.push({ key, label: cfg?.label || key, ...data });
      }
    });

    return list;
  }, [selectedGarments]);

  // Filtered customer list for search
  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers.slice(0, 8);
    const q = customerSearch.toLowerCase().trim();
    return customers.filter(
      c => (c.name || '').toLowerCase().includes(q) || (c.phone || '').includes(q) || (c.city || '').toLowerCase().includes(q)
    );
  }, [customerSearch, customers]);

  // Step Validation
  const validateCurrentStep = (step: OrderStep): boolean => {
    const errors: { customerName?: string; customerPhone?: string; deliveryDate?: string; garments?: string } = {};

    if (step === 1) {
      if (customerMode === 'new') {
        if (!customerName.trim()) {
          errors.customerName = 'Customer full name is required.';
        }
        const cleanPhone = customerPhone.replace(/\D/g, '');
        if (!customerPhone.trim()) {
          errors.customerPhone = 'Mobile number is required.';
        } else if (cleanPhone.length < 10) {
          errors.customerPhone = 'Please enter a valid 10-digit mobile number.';
        }
      } else {
        if (!selectedCustomerId) {
          errors.customerName = 'Please select a customer from the search results.';
        }
      }
    }

    if (step === 2) {
      if (!deliveryDate) {
        errors.deliveryDate = 'Expected delivery date is required.';
      }
    }

    if (step === 3) {
      if (activeGarmentsList.length === 0) {
        errors.garments = 'Please select at least one garment for this bespoke order.';
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleNextStep = () => {
    if (!validateCurrentStep(currentStep)) {
      return;
    }
    if (currentStep < 5) {
      setCurrentStep((prev) => (prev + 1) as OrderStep);
    }
  };

  const handlePrevStep = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => (prev - 1) as OrderStep);
    }
  };

  // Garment Toggle helper
  const handleToggleGarment = (key: GarmentKey) => {
    setSelectedGarments(prev => {
      const current = prev[key]!;
      return {
        ...prev,
        [key]: {
          ...current,
          selected: !current.selected
        }
      };
    });
    setFormErrors(prev => ({ ...prev, garments: undefined }));
  };

  // Garment Quantity
  const handleGarmentQtyChange = (key: GarmentKey, delta: number) => {
    setSelectedGarments(prev => {
      const current = prev[key]!;
      const newQty = Math.max(1, (current.quantity || 1) + delta);
      return {
        ...prev,
        [key]: {
          ...current,
          quantity: newQty
        }
      };
    });
  };

  // Quick Preset Packages
  const applyPresetPackage = (type: 'suit2' | 'suit3' | 'ethnic') => {
    const updated = { ...selectedGarments };
    // A two-piece suit is a coat and a pant — two products, not one.
    if (type === 'suit2') {
      updated.Coat!.selected = true;
      updated.Pant!.selected = true;
      updated.Shirt!.selected = false;
      updated['Kurta Pajama']!.selected = false;
    } else if (type === 'suit3') {
      updated.Coat!.selected = true;
      updated.Pant!.selected = true;
      updated.Shirt!.selected = true;
      updated['Kurta Pajama']!.selected = false;
    } else if (type === 'ethnic') {
      updated.Coat!.selected = false;
      updated.Pant!.selected = false;
      updated.Shirt!.selected = false;
      updated['Kurta Pajama']!.selected = true;
    }
    setSelectedGarments(updated);
    setFormErrors(prev => ({ ...prev, garments: undefined }));
  };

  // Measurement Value Helpers with Quick Step (+ / - 0.25)
  const stepMeasurement = (
    setter: React.Dispatch<React.SetStateAction<any>>,
    field: string,
    delta: number
  ) => {
    setter((prev: any) => {
      const cur = parseFloat(prev[field]) || 0;
      const next = Math.max(0, cur + delta);
      return {
        ...prev,
        [field]: Number.isInteger(next) ? next.toString() : next.toFixed(2).replace(/\.?0+$/, '')
      };
    });
  };

  const handleCloseAttempt = () => {
    resetToCleanNewOrder();
    onClose();
  };

  // FINAL ORDER SUBMISSION
  const handleFinalPlaceOrder = async () => {
    if (isSubmitting) return;

    try {
      setIsSubmitting(true);
      setSaveError(null);

      // Validate Step 1
      if (customerMode === 'new') {
        if (!customerName.trim() || !customerPhone.trim()) {
          setCurrentStep(1);
          setFormErrors({
            customerName: !customerName.trim() ? 'Customer full name is required.' : undefined,
            customerPhone: !customerPhone.trim() ? 'Mobile number is required.' : undefined
          });
          setIsSubmitting(false);
          return;
        }
      } else {
        if (!selectedCustomerId) {
          setCurrentStep(1);
          setFormErrors({ customerName: 'Please select an existing customer.' });
          setIsSubmitting(false);
          return;
        }
      }

      // Validate Garments
      if (activeGarmentsList.length === 0) {
        setCurrentStep(3);
        setFormErrors({ garments: 'Please select at least one garment for this order.' });
        setIsSubmitting(false);
        return;
      }

      // 0. Reserve the order number now, at commit time, from the persisted
      //    high-water mark. Editing keeps the original number.
      const issuedOrderNumber = initialOrder
        ? (initialOrder.orderNumber || initialOrder.id)
        : allocateOrderNumber(ORDER_STORAGE_KEY, ordersPool, trashItems);

      // 1. Resolve Customer
      let finalCustomer: Customer;
      let isNew = false;

      if (customerMode === 'new') {
        const typedPhone = normalisePhone(customerPhone);
        // A returning client typed in as "new" must not become a second record.
        const existingByPhone = typedPhone
          ? customers.find(c => normalisePhone(c.phone) === typedPhone)
          : undefined;

        if (existingByPhone) {
          finalCustomer = {
            ...existingByPhone,
            name: customerName.trim() || existingByPhone.name,
            phone: customerPhone.trim() || existingByPhone.phone,
            city: customerCity.trim() || existingByPhone.city,
            address: customerAddress.trim() || existingByPhone.address,
            notes: customerNotes.trim() || existingByPhone.notes,
            lastVisitDate: new Date().toISOString().split('T')[0]
          };
        } else {
          isNew = true;
          finalCustomer = {
            id: `CUST-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`,
            name: customerName.trim(),
            phone: customerPhone.trim(),
            email: '',
            city: customerCity.trim(),
            address: customerAddress.trim(),
            notes: customerNotes.trim(),
            totalOrders: 0,
            lifetimeSpend: 0,
            createdDate: new Date().toISOString().split('T')[0],
            lastVisitDate: new Date().toISOString().split('T')[0]
          };
        }
      } else {
        const found = customers.find(c => c.id === selectedCustomerId);
        if (!found) {
          throw new Error('Please select a valid customer.');
        }
        finalCustomer = {
          ...found,
          name: customerName.trim() || found.name,
          phone: customerPhone.trim() || found.phone,
          city: customerCity.trim() || found.city,
          address: customerAddress.trim() || found.address,
          notes: customerNotes.trim() || found.notes,
          lastVisitDate: new Date().toISOString().split('T')[0]
        };
      }

      // 2. Build Order Items
      const orderItems = activeGarmentsList.map((g, idx) => ({
        id: `ITEM-${issuedOrderNumber}-${idx + 1}`,
        garmentType: g.key as GarmentType,
        fabricCode: g.fabricCode || '',
        fabricName: g.fabricName || '',
        notes: g.styleNotes || '',
        price: 0,
        quantity: g.quantity || 1,
        styleNotes: g.styleNotes,
        specialInstructions: g.specialInstructions,
        remarks: g.remarks || ''
      }));

      const hasCoat = selectedGarments.Coat?.selected;
      const hasPant = selectedGarments.Pant?.selected;
      const hasShirt = selectedGarments.Shirt?.selected;
      const hasKurtaPajama = selectedGarments['Kurta Pajama']?.selected;

      const garmentRemarksMap: Record<string, string> = {};
      activeGarmentsList.forEach(g => {
        if (g.remarks && g.remarks.trim()) {
          garmentRemarksMap[g.key] = g.remarks.trim();
        }
      });

      // 3. Build Immutable Measurement Snapshot for this Order
      const measurementsSnapshot: Partial<MeasurementRecord> = {
        unit,
        fitPreference,
        fittingNotes,
        lastUpdated: orderDate,
        garmentRemarks: Object.keys(garmentRemarksMap).length > 0 ? garmentRemarksMap : undefined,
        ...(hasCoat ? { coat: coatMeas } : {}),
        ...(hasPant ? { pant: pantMeas } : {}),
        ...(hasShirt ? { shirt: shirtMeas } : {}),
        ...(hasKurtaPajama ? { kurta: kurtaMeas, pajama: pajamaMeas } : {})
      };

      // 4. Build Full Measurement Record for Customer Ledger
      const measurementRecord: MeasurementRecord = {
        id: previousMeasurementRecord ? previousMeasurementRecord.id : `MEAS-${Math.floor(1000 + Math.random() * 9000)}`,
        customerId: finalCustomer.id,
        customerName: finalCustomer.name,
        customerPhone: finalCustomer.phone,
        orderNumber: issuedOrderNumber,
        garmentType: activeGarmentsList.map(g => g.key).join(', '),
        selectedGarments: activeGarmentsList.map(g => g.key),
        unit,
        fitPreference,
        fittingNotes,
        lastUpdated: orderDate,
        garmentRemarks: Object.keys(garmentRemarksMap).length > 0 ? garmentRemarksMap : undefined,
        ...(hasCoat ? { coat: coatMeas } : {}),
        ...(hasPant ? { pant: pantMeas } : {}),
        ...(hasShirt ? { shirt: shirtMeas } : {}),
        ...(hasKurtaPajama ? { kurta: kurtaMeas, pajama: pajamaMeas } : {})
      };

      // 5. Build Final Order Object
      const fullOrder: Order = {
        id: issuedOrderNumber,
        orderNumber: issuedOrderNumber,
        customerId: finalCustomer.id,
        customerName: finalCustomer.name,
        customerPhone: finalCustomer.phone,
        customerEmail: finalCustomer.email || '',
        customerAddress: [finalCustomer.address, finalCustomer.city].filter(Boolean).join(', '),
        items: orderItems,
        orderDate,
        trialDate: '',
        trialRequired: false,
        deliveryDate,
        status: 'New',
        priority: 'Normal',
        specialInstructions,
        fittingNotes,
        totalAmount: 0,
        subtotal: 0,
        discount: 0,
        taxAmount: 0,
        advancePaid: 0,
        balanceDue: 0,
        urgent: false,
        notes: specialInstructions,
        measurementsSnapshot,
        paymentMethod: 'Showroom Counter',
        paymentHistory: []
      };

      // Execute onSave callbacks
      if (onSaveOrder) {
        onSaveOrder({
          order: fullOrder,
          customer: finalCustomer,
          isNewCustomer: isNew,
          measurementRecord
        });
      } else if (onSave) {
        // Persist the customer first and adopt the id the database issued.
        //
        // `orders.customer_id` is a uuid column. For a walk-in typed straight
        // into this wizard, `finalCustomer.id` is the provisional `CUST-...`
        // one built above, and sending that to Postgres is what raised
        // `invalid input syntax for type uuid`. Awaiting the save also orders
        // the two writes: the customer row exists before the order references
        // it, instead of the two racing.
        const savedCustomer = onAddCustomer ? await onAddCustomer(finalCustomer) : undefined;
        const orderToPersist: Order = savedCustomer?.id
          ? { ...fullOrder, customerId: savedCustomer.id }
          : fullOrder;
        const persisted = await onSave(orderToPersist);
        // The database issues the real order number, so the confirmation
        // screen and every document printed from it use the stored record.
        if (persisted && typeof persisted === 'object') {
          setCreatedOrderSummary(persisted as Order);
          setIsSuccessScreen(true);
          setIsSubmitting(false);
          return;
        }
      }

      // Show Order Success Screen
      setCreatedOrderSummary(fullOrder);
      setIsSuccessScreen(true);
      setIsSubmitting(false);
    } catch (err: any) {
      console.error('Order creation error:', err);
      setSaveError(err.message || 'Unable to place order. Please verify details and try again.');
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#F7F3EA] text-[#071426] flex flex-col h-screen w-screen overflow-hidden select-none print-app-shell">
      
      {/* ======================================================== */}
      {/* FULL-SCREEN TOP BAR */}
      {/* ======================================================== */}
      <header className="shrink-0 bg-[#071426] text-white px-6 md:px-10 py-4 border-b border-[#1E2D42] flex items-center justify-between shadow-md z-20">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-[#132338] border border-[#C9A24A]/40 text-[#C9A24A] flex items-center justify-center font-bold shadow-inner">
            {isSuccessScreen ? <Check className="w-5 h-5 text-emerald-400 stroke-[3]" /> : <Scissors className="w-5 h-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg md:text-xl font-black text-white tracking-wide brand-font uppercase">
                {isSuccessScreen ? 'ORDER CONFIRMED' : 'NEW ORDER'}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full bg-[#C9A24A]/20 text-[#D4AF5A] text-[11px] font-extrabold border border-[#C9A24A]/30">
                Order #{isSuccessScreen && createdOrderSummary ? (createdOrderSummary.orderNumber || createdOrderSummary.id) : displayOrderNumber}
              </span>
            </div>
            <p className="text-[11px] text-[#A39682]">
              {isSuccessScreen ? 'Tailoring order has been successfully recorded' : 'Create a new tailoring order'}
            </p>
          </div>
        </div>

        {/* 5-Step Stepper in Header (Desktop) */}
        {!isSuccessScreen && (
          <div className="hidden lg:flex items-center gap-1.5 bg-[#0E1E34] px-4 py-2 rounded-2xl border border-[#1E2D42]">
            {[
              { num: 1, label: 'Customer' },
              { num: 2, label: 'Order Details' },
              { num: 3, label: 'Garments' },
              { num: 4, label: 'Measurements' },
              { num: 5, label: 'Review' }
            ].map((step, idx) => {
              const isCurrent = currentStep === step.num;
              const isDone = currentStep > step.num;
              return (
                <React.Fragment key={step.num}>
                  {idx > 0 && (
                    <div className={`w-4 h-0.5 ${isDone ? 'bg-[#C9A24A]' : 'bg-[#23354E]'}`} />
                  )}
                  <button
                    onClick={() => {
                      if (step.num < currentStep) {
                        setCurrentStep(step.num as OrderStep);
                      }
                    }}
                    disabled={step.num > currentStep}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                      isCurrent
                        ? 'bg-[#C9A24A] text-[#071426] shadow-xs'
                        : isDone
                        ? 'text-[#C9A24A] hover:bg-[#152740] cursor-pointer'
                        : 'text-[#65758E] opacity-60 cursor-not-allowed'
                    }`}
                  >
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-black ${
                      isCurrent ? 'bg-[#071426] text-[#C9A24A]' : isDone ? 'bg-[#C9A24A] text-[#071426]' : 'bg-[#23354E] text-[#8C9BB0]'
                    }`}>
                      {isDone ? <Check className="w-2.5 h-2.5 stroke-[3]" /> : step.num}
                    </span>
                    <span>{step.label}</span>
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        )}

        {/* Close / Cancel Button */}
        <button
          onClick={handleCloseAttempt}
          className="px-4 py-2 bg-[#132338] hover:bg-[#1E324E] text-[#E0D8CB] hover:text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-2 border border-[#263A54] cursor-pointer"
          title="Exit Order Wizard"
        >
          <X className="w-4 h-4 text-[#C9A24A]" />
          <span>{isSuccessScreen ? 'Close' : 'Exit'}</span>
        </button>
      </header>

      {/* ======================================================== */}
      {/* MOBILE STEP PROGRESS BAR */}
      {/* ======================================================== */}
      {!isSuccessScreen && (
        <div className="lg:hidden shrink-0 bg-[#0E1E34] px-4 py-2.5 border-b border-[#1E2D42] flex items-center justify-between text-xs text-white">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-[#C9A24A] text-[#071426] font-black text-[11px] flex items-center justify-center">
              {currentStep}
            </span>
            <span className="font-bold text-[#E0D8CB]">
              Step {currentStep} of 5:{' '}
              {currentStep === 1 && 'Customer'}
              {currentStep === 2 && 'Order Details'}
              {currentStep === 3 && 'Garments'}
              {currentStep === 4 && 'Measurements'}
              {currentStep === 5 && 'Review'}
            </span>
          </div>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((s) => (
              <div
                key={s}
                className={`w-3 h-1.5 rounded-full ${s === currentStep ? 'bg-[#C9A24A]' : s < currentStep ? 'bg-[#C9A24A]/50' : 'bg-[#23354E]'}`}
              />
            ))}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MAIN CONTENT AREA */}
      {/* ======================================================== */}
      <main ref={modalMainRef} className="flex-1 overflow-y-auto bg-chevron-pattern overscroll-contain">
        <div className="max-w-6xl mx-auto px-4 py-6 md:px-8 md:py-8">

          {/* Error Banner */}
          {saveError && (
            <div className="mb-6 p-5 rounded-2xl bg-red-50 border-2 border-red-200 text-red-800 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-fadeIn">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-black text-red-900 uppercase tracking-wide">
                    Unable to Place Order
                  </h4>
                  <p className="text-xs font-semibold text-red-700 mt-0.5">
                    {saveError}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleFinalPlaceOrder}
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-extrabold rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSubmitting ? 'animate-spin' : ''}`} />
                  <span>{isSubmitting ? 'Retrying...' : 'Try Again'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSaveError(null)}
                  className="px-3 py-2 bg-white hover:bg-red-100 text-red-700 text-xs font-bold rounded-xl border border-red-200 transition-all cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* ------------------------------------------------------------- */}
          {/* SUCCESS SCREEN */}
          {/* ------------------------------------------------------------- */}
          {isSuccessScreen && createdOrderSummary ? (
            <div className="py-8 md:py-12 max-w-2xl mx-auto text-center space-y-7 animate-fadeIn">
              
              {/* Success Badge */}
              <div className="w-20 h-20 rounded-full bg-emerald-500/10 border-2 border-emerald-500/30 text-emerald-600 flex items-center justify-center mx-auto shadow-md">
                <CheckCircle2 className="w-10 h-10 stroke-[2.5]" />
              </div>

              {/* Header Titles */}
              <div className="space-y-2">
                <div className="text-xs font-bold tracking-[0.25em] text-[#C9A24A] uppercase">
                  REGENCY BESPOKE ORDER CONFIRMATION
                </div>
                <h2 className="text-3xl md:text-4xl font-black text-[#071426] brand-font uppercase">
                  ORDER PLACED
                </h2>
                <p className="text-sm md:text-base font-semibold text-[#7A7060]">
                  Your tailoring order has been successfully created.
                </p>
              </div>

              {/* Order & Customer Details Card */}
              <div className="bg-white p-6 md:p-8 rounded-3xl border border-[#E6E1D7] shadow-md text-left space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-[#E6E1D7] gap-2">
                  <div>
                    <span className="text-[11px] font-bold text-[#8C7E6A] uppercase tracking-wider">Order Reference</span>
                    <div className="text-2xl font-black text-[#071426]">
                      Order #{createdOrderSummary.orderNumber || createdOrderSummary.id}
                    </div>
                  </div>
                  <div className="sm:text-right">
                    <span className="text-[11px] font-bold text-[#8C7E6A] uppercase tracking-wider">Target Delivery</span>
                    <div className="text-sm font-extrabold text-[#C9A24A]">
                      {createdOrderSummary.deliveryDate}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 bg-[#FAF8F5] rounded-2xl border border-[#E0D8CB]">
                    <div className="text-[11px] font-bold text-[#8C7E6A] uppercase">Customer Name</div>
                    <div className="text-base font-extrabold text-[#071426] mt-0.5">
                      {createdOrderSummary.customerName}
                    </div>
                    {createdOrderSummary.customerPhone && (
                      <div className="text-xs text-[#7A7060] mt-1 flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-[#C9A24A]" />
                        <span>{createdOrderSummary.customerPhone}</span>
                      </div>
                    )}
                  </div>

                  <div className="p-4 bg-[#FAF8F5] rounded-2xl border border-[#E0D8CB]">
                    <div className="text-[11px] font-bold text-[#8C7E6A] uppercase">Garments Booked</div>
                    <div className="text-xs font-bold text-[#071426] mt-1 space-y-1">
                      {createdOrderSummary.items?.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center">
                          <span>{item.quantity}x {item.garmentType}</span>
                          {/* Only orders placed before fabric capture was removed carry one. */}
                          {item.fabricName && (
                            <span className="text-[11px] text-[#7A7060] font-medium">{item.fabricName}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-3 flex-wrap">
                {onPrintProductionSlip && (
                  <button
                    onClick={() => onPrintProductionSlip(createdOrderSummary)}
                    className="w-full sm:w-auto px-6 py-3.5 bg-[#071426] hover:bg-[#0E2038] text-[#D4AF5A] font-black text-xs md:text-sm rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer border border-[#C9A24A]/40 uppercase tracking-wider"
                  >
                    <Scissors className="w-4 h-4 text-[#C9A24A]" />
                    <span>PRINT PRODUCTION SLIP</span>
                  </button>
                )}

                {onPrintOrderBill && (
                  <button
                    onClick={() => onPrintOrderBill(createdOrderSummary)}
                    className="w-full sm:w-auto px-6 py-3.5 bg-[#C9A24A] hover:bg-[#B8913B] text-[#071426] font-black text-xs md:text-sm rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer uppercase tracking-wider"
                    title="Customer bill with the amount left blank to write by hand"
                  >
                    <ReceiptText className="w-4 h-4 text-[#071426]" />
                    <span>PRINT BILL</span>
                  </button>
                )}

                {onViewOrderDetails && (
                  <button
                    onClick={() => onViewOrderDetails(createdOrderSummary)}
                    className="w-full sm:w-auto px-5 py-3.5 bg-[#FAF8F5] hover:bg-[#EFE9DF] text-[#071426] font-extrabold text-xs md:text-sm rounded-2xl border border-[#E0D8CB] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Eye className="w-4 h-4" />
                    <span>View Order</span>
                  </button>
                )}

                <button
                  onClick={handleCloseAttempt}
                  className="w-full sm:w-auto px-6 py-3.5 bg-[#FAF8F5] hover:bg-[#EFE9DF] text-[#071426] font-extrabold text-xs md:text-sm rounded-2xl border border-[#E0D8CB] transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Back to Dashboard</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* ======================================================== */}
              {/* STEP 1: CUSTOMER DETAILS */}
              {/* ======================================================== */}
              {currentStep === 1 && (
                <div className="space-y-6 animate-fadeIn">
                  <div className="border-b border-[#E6E1D7] pb-4">
                    <h2 className="text-2xl md:text-3xl font-black text-[#071426] brand-font tracking-tight">
                      CUSTOMER DETAILS
                    </h2>
                    <p className="text-xs md:text-sm text-[#7A7060] mt-1">
                      Register a new customer profile or select from existing client registry.
                    </p>
                  </div>

                  {/* Mode Selector Tabs */}
                  <div className="grid grid-cols-2 gap-3 max-w-md">
                    <button
                      type="button"
                      onClick={() => {
                        setCustomerMode('new');
                        setSelectedCustomerId('');
                        setCustomerName('');
                        setCustomerPhone('');
                        setCustomerCity('');
                        setCustomerAddress('');
                        setCustomerNotes('');
                        setCustomerSearch('');
                        setFormErrors({});
                      }}
                      className={`py-3.5 px-4 rounded-2xl text-xs md:text-sm font-extrabold transition-all border-2 flex items-center justify-center gap-2 cursor-pointer ${
                        customerMode === 'new'
                          ? 'bg-[#071426] text-[#D4AF5A] border-[#071426] shadow-sm'
                          : 'bg-white text-[#6E6454] border-[#E0D8CB] hover:border-[#C9A24A]'
                      }`}
                    >
                      <Plus className="w-4 h-4 text-[#C9A24A]" />
                      <span>New Customer</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setCustomerMode('existing');
                        setFormErrors({});
                      }}
                      className={`py-3.5 px-4 rounded-2xl text-xs md:text-sm font-extrabold transition-all border-2 flex items-center justify-center gap-2 cursor-pointer ${
                        customerMode === 'existing'
                          ? 'bg-[#071426] text-[#D4AF5A] border-[#071426] shadow-sm'
                          : 'bg-white text-[#6E6454] border-[#E0D8CB] hover:border-[#C9A24A]'
                      }`}
                    >
                      <User className="w-4 h-4 text-[#C9A24A]" />
                      <span>Existing Customer</span>
                    </button>
                  </div>

                  {/* NEW CUSTOMER FORM */}
                  {customerMode === 'new' ? (
                    <div className="bg-white p-6 md:p-8 rounded-3xl border border-[#E6E1D7] shadow-sm space-y-5">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        {/* Customer Full Name */}
                        <div className="space-y-1.5">
                          <label htmlFor="order-cust-name" className="text-xs font-bold text-[#071426] uppercase tracking-wider">
                            Customer Full Name <span className="text-red-500">*</span>
                          </label>
                          <input
                            id="order-cust-name"
                            type="text"
                            value={customerName}
                            onChange={(e) => {
                              setCustomerName(e.target.value);
                              if (formErrors.customerName) {
                                setFormErrors(prev => ({ ...prev, customerName: undefined }));
                              }
                            }}
                            placeholder="e.g. Vikram Malhotra"
                            className={`w-full bg-[#FAF8F5] border-2 rounded-xl px-4 py-3 text-sm font-bold text-[#071426] outline-none transition-colors ${
                              formErrors.customerName ? 'border-red-500 focus:border-red-600' : 'border-[#E0D8CB] focus:border-[#C9A24A]'
                            }`}
                            autoFocus
                          />
                          {formErrors.customerName && (
                            <p className="text-xs font-bold text-red-600 mt-1 animate-fadeIn flex items-center gap-1">
                              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                              <span>{formErrors.customerName}</span>
                            </p>
                          )}
                        </div>

                        {/* Mobile Number */}
                        <div className="space-y-1.5">
                          <label htmlFor="order-cust-phone" className="text-xs font-bold text-[#071426] uppercase tracking-wider">
                            Mobile Number <span className="text-red-500">*</span>
                          </label>
                          <input
                            id="order-cust-phone"
                            type="tel"
                            value={customerPhone}
                            onChange={(e) => {
                              setCustomerPhone(e.target.value);
                              if (formErrors.customerPhone) {
                                setFormErrors(prev => ({ ...prev, customerPhone: undefined }));
                              }
                            }}
                            placeholder="e.g. 9876543210"
                            className={`w-full bg-[#FAF8F5] border-2 rounded-xl px-4 py-3 text-sm font-bold text-[#071426] outline-none transition-colors ${
                              formErrors.customerPhone ? 'border-red-500 focus:border-red-600' : 'border-[#E0D8CB] focus:border-[#C9A24A]'
                            }`}
                          />
                          {formErrors.customerPhone && (
                            <p className="text-xs font-bold text-red-600 mt-1 animate-fadeIn flex items-center gap-1">
                              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                              <span>{formErrors.customerPhone}</span>
                            </p>
                          )}
                        </div>

                        {/* City */}
                        <div className="space-y-1.5">
                          <label htmlFor="order-cust-city" className="text-xs font-bold text-[#071426] uppercase tracking-wider">
                            City
                          </label>
                          <input
                            id="order-cust-city"
                            type="text"
                            value={customerCity}
                            onChange={(e) => setCustomerCity(e.target.value)}
                            placeholder="e.g. Jalandhar"
                            className="w-full bg-[#FAF8F5] border-2 border-[#E0D8CB] focus:border-[#C9A24A] rounded-xl px-4 py-3 text-sm font-bold text-[#071426] outline-none"
                          />
                        </div>

                        {/* Customer Address */}
                        <div className="space-y-1.5">
                          <label htmlFor="order-cust-address" className="text-xs font-bold text-[#071426] uppercase tracking-wider">
                            Customer Address
                          </label>
                          <input
                            id="order-cust-address"
                            type="text"
                            value={customerAddress}
                            onChange={(e) => setCustomerAddress(e.target.value)}
                            placeholder="e.g. Model Town, Jalandhar"
                            className="w-full bg-[#FAF8F5] border-2 border-[#E0D8CB] focus:border-[#C9A24A] rounded-xl px-4 py-3 text-sm font-bold text-[#071426] outline-none"
                          />
                        </div>
                      </div>

                      {/* The counter takes a name, a number, a city and an
                          address. Client notes are no longer collected here;
                          notes already stored against a customer are left
                          alone and still travel with the record. */}
                    </div>
                  ) : (
                    /* EXISTING CUSTOMER SEARCH FLOW */
                    <div className="space-y-4">
                      <div className="bg-white p-4 rounded-2xl border-2 border-[#E0D8CB] focus-within:border-[#C9A24A] flex items-center gap-3 shadow-2xs">
                        <Search className="w-5 h-5 text-[#C9A24A] shrink-0" />
                        <input
                          type="text"
                          value={customerSearch}
                          onChange={(e) => setCustomerSearch(e.target.value)}
                          placeholder="Search customer name or mobile number..."
                          className="w-full bg-transparent text-sm md:text-base text-[#071426] font-bold outline-none placeholder:text-[#9A9080]"
                          autoFocus
                        />
                      </div>

                      {formErrors.customerName && (
                        <p className="text-xs font-bold text-red-600 animate-fadeIn flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>{formErrors.customerName}</span>
                        </p>
                      )}

                      {/* Customer Cards Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 max-h-[380px] overflow-y-auto pr-1">
                        {filteredCustomers.map(c => {
                          const isSelected = selectedCustomerId === c.id;
                          return (
                            <div
                              key={c.id}
                              onClick={() => {
                                setSelectedCustomerId(c.id);
                                setCustomerName(c.name || '');
                                setCustomerPhone(c.phone || '');
                                setCustomerCity(c.city || '');
                                setCustomerAddress(c.address || '');
                                setCustomerNotes(c.notes || '');
                                checkAndLoadPreviousMeasurements(c.id);
                                setFormErrors({});
                              }}
                              className={`p-4 rounded-2xl border-2 transition-all cursor-pointer space-y-1.5 relative ${
                                isSelected
                                  ? 'bg-[#FAF8F5] border-[#C9A24A] ring-2 ring-[#C9A24A]/20 shadow-md'
                                  : 'bg-white border-[#E6E1D7] hover:border-[#C9A24A]/60'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-extrabold text-sm md:text-base text-[#071426]">{c.name}</span>
                                {isSelected && (
                                  <span className="w-5 h-5 rounded-full bg-[#C9A24A] text-[#071426] flex items-center justify-center">
                                    <Check className="w-3 h-3 stroke-[3]" />
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-[#7A7060] flex items-center gap-1.5">
                                <Phone className="w-3.5 h-3.5 text-[#C9A24A]" />
                                <span>{c.phone}</span>
                              </div>
                              <div className="text-[11px] text-[#8C7E6A]">
                                {c.city || '\u2014'} • {c.totalOrders || 0} previous orders
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {filteredCustomers.length === 0 && (
                        <div className="bg-white p-8 rounded-2xl border border-[#E6E1D7] text-center space-y-3">
                          <p className="text-sm font-semibold text-[#7A7060]">No customer matched "{customerSearch}"</p>
                          <button
                            type="button"
                            onClick={() => {
                              setCustomerMode('new');
                              setCustomerName('');
                              setCustomerPhone('');
                              setCustomerCity('');
                              setCustomerAddress('');
                              setCustomerNotes('');
                              setCustomerSearch('');
                            }}
                            className="px-4 py-2 bg-[#071426] text-[#D4AF5A] font-bold text-xs rounded-xl cursor-pointer"
                          >
                            + Enter New Customer Details
                          </button>
                        </div>
                      )}

                      {/* Selected Customer Details Preview */}
                      {selectedCustomerId && customerName && (
                        <div className="p-4 bg-[#FAF8F5] rounded-2xl border border-[#E0D8CB] space-y-2">
                          <div className="text-[10px] font-extrabold text-[#8C7E6A] uppercase tracking-wider">
                            Selected Customer Profile
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                            <div>
                              <span className="text-[#7A7060]">Name: </span>
                              <strong className="text-[#071426]">{customerName}</strong>
                            </div>
                            <div>
                              <span className="text-[#7A7060]">Mobile: </span>
                              <strong className="text-[#071426]">{customerPhone}</strong>
                            </div>
                            <div>
                              <span className="text-[#7A7060]">City/Area: </span>
                              <strong className="text-[#071426]">{customerCity || '\u2014'}</strong>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ======================================================== */}
              {/* STEP 2: ORDER DETAILS */}
              {/* ======================================================== */}
              {currentStep === 2 && (
                <div className="space-y-6 animate-fadeIn">
                  <div className="border-b border-[#E6E1D7] pb-4">
                    <h2 className="text-2xl md:text-3xl font-black text-[#071426] brand-font tracking-tight">
                      ORDER DETAILS
                    </h2>
                    <p className="text-xs md:text-sm text-[#7A7060] mt-1">
                      Sequential order numbering, timeline, and master tailoring notes.
                    </p>
                  </div>

                  <div className="bg-white p-6 md:p-8 rounded-3xl border border-[#E6E1D7] shadow-sm space-y-6">
                    
                    {/* Auto-Generated Order Number Badge */}
                    <div className="p-4 bg-[#FAF8F5] rounded-2xl border-2 border-[#C9A24A]/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <div className="text-[11px] font-extrabold text-[#8C7E6A] uppercase tracking-wider">
                          SHOWROOM ORDER NUMBER (AUTOMATIC)
                        </div>
                        <div className="text-2xl md:text-3xl font-black text-[#071426] font-mono tracking-tight mt-0.5">
                          Order #{displayOrderNumber}
                        </div>
                      </div>
                      <div className="text-xs text-[#7A7060] bg-white px-3 py-1.5 rounded-xl border border-[#E6E1D7] self-start sm:self-auto font-semibold">
                        🔒 Auto-sequenced • Reserved upon placement
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-[#071426] uppercase tracking-wider">
                          Order Date
                        </label>
                        <input
                          type="date"
                          value={orderDate}
                          onChange={(e) => setOrderDate(e.target.value)}
                          className="w-full bg-[#FAF8F5] border-2 border-[#E0D8CB] focus:border-[#C9A24A] rounded-xl px-4 py-3 text-sm font-bold text-[#071426] outline-none"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-[#071426] uppercase tracking-wider">
                          Expected Delivery Date <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="date"
                          required
                          value={deliveryDate}
                          onChange={(e) => {
                            setDeliveryDate(e.target.value);
                            if (formErrors.deliveryDate) {
                              setFormErrors(prev => ({ ...prev, deliveryDate: undefined }));
                            }
                          }}
                          className={`w-full bg-[#FAF8F5] border-2 rounded-xl px-4 py-3 text-sm font-bold text-[#071426] outline-none ${
                            formErrors.deliveryDate ? 'border-red-500' : 'border-[#E0D8CB] focus:border-[#C9A24A]'
                          }`}
                        />
                        {formErrors.deliveryDate && (
                          <p className="text-xs font-bold text-red-600 mt-1 animate-fadeIn">
                            {formErrors.deliveryDate}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-[#071426] uppercase tracking-wider">
                        Special Instructions / Order Notes
                      </label>
                      <textarea
                        rows={3}
                        value={specialInstructions}
                        onChange={(e) => setSpecialInstructions(e.target.value)}
                        placeholder="e.g. Extra seam allowances on side seams, client requested contrast horn buttons."
                        className="w-full bg-[#FAF8F5] border-2 border-[#E0D8CB] focus:border-[#C9A24A] rounded-xl p-4 text-sm font-semibold text-[#071426] outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ======================================================== */}
              {/* STEP 3: SELECT GARMENTS */}
              {/* ======================================================== */}
              {currentStep === 3 && (
                <div className="space-y-6 animate-fadeIn">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E6E1D7] pb-4">
                    <div>
                      <h2 className="text-2xl md:text-3xl font-black text-[#071426] brand-font tracking-tight">
                        SELECT GARMENTS
                      </h2>
                      <p className="text-xs md:text-sm text-[#7A7060] mt-1">
                        Choose garments for this bespoke order and customize fabric & style notes.
                      </p>
                    </div>

                    {/* Quick Package presets */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => applyPresetPackage('suit2')}
                        className="px-3 py-1.5 bg-white border border-[#C9A24A] hover:bg-[#FAF8F5] text-[#071426] font-bold text-xs rounded-xl cursor-pointer"
                      >
                        2-Piece Suit
                      </button>
                      <button
                        type="button"
                        onClick={() => applyPresetPackage('suit3')}
                        className="px-3 py-1.5 bg-white border border-[#C9A24A] hover:bg-[#FAF8F5] text-[#071426] font-bold text-xs rounded-xl cursor-pointer"
                      >
                        3-Piece Suit
                      </button>
                      <button
                        type="button"
                        onClick={() => applyPresetPackage('ethnic')}
                        className="px-3 py-1.5 bg-white border border-[#C9A24A] hover:bg-[#FAF8F5] text-[#071426] font-bold text-xs rounded-xl cursor-pointer"
                      >
                        Kurta Pajama
                      </button>
                    </div>
                  </div>

                  {formErrors.garments && (
                    <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-2xl text-xs font-bold flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{formErrors.garments}</span>
                    </div>
                  )}

                  {/* Garments Cards Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {GARMENT_CONFIGS.map(cfg => {
                      const itemData = selectedGarments[cfg.key];
                      const isSelected = itemData?.selected || false;

                      return (
                        <div
                          key={cfg.key}
                          className={`p-6 rounded-3xl border-2 transition-all space-y-4 ${
                            isSelected
                              ? 'bg-white border-[#C9A24A] ring-2 ring-[#C9A24A]/20 shadow-md'
                              : 'bg-white/80 border-[#E6E1D7] hover:border-[#C9A24A]/50'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                              <span className="text-2xl">{cfg.icon}</span>
                              <div>
                                <h3 className="text-base md:text-lg font-black text-[#071426] tracking-wide">
                                  {cfg.label}
                                </h3>
                                <p className="text-xs text-[#7A7060]">{cfg.sublabel}</p>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleToggleGarment(cfg.key)}
                              className={`px-4 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                                isSelected
                                  ? 'bg-[#C9A24A] text-[#071426]'
                                  : 'bg-[#FAF8F5] text-[#6E6454] border border-[#E0D8CB] hover:bg-[#071426] hover:text-white'
                              }`}
                            >
                              {isSelected ? (
                                <>
                                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                                  <span>Selected</span>
                                </>
                              ) : (
                                <span>+ Select</span>
                              )}
                            </button>
                          </div>

                          {/* Expanded Configuration if Selected */}
                          {isSelected && (
                            <div className="pt-3 border-t border-[#F2ECE1] space-y-3 animate-fadeIn">
                              <div>
                                <label className="text-[10px] font-bold text-[#8C7E6A] uppercase">Quantity</label>
                                <div className="flex items-center gap-2 mt-1">
                                  <button
                                    type="button"
                                    onClick={() => handleGarmentQtyChange(cfg.key, -1)}
                                    className="w-8 h-8 rounded-lg bg-[#FAF8F5] border border-[#E0D8CB] font-bold text-xs hover:bg-[#E6E1D7] flex items-center justify-center cursor-pointer"
                                  >
                                    -
                                  </button>
                                  <span className="font-extrabold text-sm w-6 text-center">{itemData?.quantity || 1}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleGarmentQtyChange(cfg.key, 1)}
                                    className="w-8 h-8 rounded-lg bg-[#FAF8F5] border border-[#E0D8CB] font-bold text-xs hover:bg-[#E6E1D7] flex items-center justify-center cursor-pointer"
                                  >
                                    +
                                  </button>
                                </div>
                              </div>
                              {/*
                                Fabric, style/cut and garment notes are no longer
                                collected here: the workshop works from the
                                measurements and the garment's remark, and the
                                production slip prints only those.

                                The `fabricName` / `styleNotes` /
                                `specialInstructions` values still travel through
                                this modal's state (see the garment map above and
                                the save handler below) so that editing an order
                                placed before this change preserves whatever it
                                already had, rather than blanking those columns.
                              */}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Summary Bar */}
                  <div className="p-4 bg-[#071426] text-white rounded-2xl flex items-center justify-between shadow-sm">
                    <div className="text-xs text-[#E0D8CB]">
                      Selected Garments: <strong className="text-[#D4AF5A]">{activeGarmentsList.length} items</strong>
                    </div>
                    <div className="text-xs text-[#A39682]">
                      {activeGarmentsList.map(g => `${g.quantity}x ${g.label}`).join(' • ')}
                    </div>
                  </div>
                </div>
              )}

              {/* ======================================================== */}
              {/* STEP 4: MEASUREMENTS */}
              {/* ======================================================== */}
              {currentStep === 4 && (
                <div className="space-y-6 animate-fadeIn">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E6E1D7] pb-4">
                    <div>
                      <h2 className="text-2xl md:text-3xl font-black text-[#071426] brand-font tracking-tight">
                        MEASUREMENTS
                      </h2>
                      <p className="text-xs md:text-sm text-[#7A7060] mt-1">
                        Precision tailoring parameters for the selected garments.
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center bg-white rounded-xl border border-[#E0D8CB] p-1 text-xs font-bold">
                        <button
                          type="button"
                          onClick={() => setUnit('inches')}
                          className={`px-3 py-1 rounded-lg cursor-pointer ${unit === 'inches' ? 'bg-[#071426] text-[#D4AF5A]' : 'text-[#6E6454]'}`}
                        >
                          Inches
                        </button>
                        <button
                          type="button"
                          onClick={() => setUnit('cm')}
                          className={`px-3 py-1 rounded-lg cursor-pointer ${unit === 'cm' ? 'bg-[#071426] text-[#D4AF5A]' : 'text-[#6E6454]'}`}
                        >
                          CM
                        </button>
                      </div>

                      <select
                        value={fitPreference}
                        onChange={(e) => setFitPreference(e.target.value)}
                        className="bg-white border border-[#E0D8CB] rounded-xl px-3 py-1.5 text-xs font-bold text-[#071426] outline-none"
                      >
                        <option value="">Select fit preference…</option>
                        <option value="Italian Cut">Italian Cut</option>
                        <option value="Slim Fit">Slim Fit</option>
                        <option value="Classic Tailored">Classic Tailored</option>
                        <option value="Structured Shoulder">Structured Shoulder</option>
                        <option value="Soft Shoulder">Soft Shoulder</option>
                      </select>
                    </div>
                  </div>

                  {/* PREVIOUS MEASUREMENTS BANNER */}
                  {previousMeasurementRecord && (
                    <div className="p-5 bg-[#FAF8F5] rounded-2xl border-2 border-[#C9A24A]/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#C9A24A]/20 text-[#C9A24A] flex items-center justify-center font-bold">
                          <Sparkles className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="text-sm font-extrabold text-[#071426]">
                            Previous Measurements Found
                          </h4>
                          <p className="text-xs text-[#7A7060]">
                            Profile from {previousMeasurementRecord.lastUpdated || 'prior order'} ({previousMeasurementRecord.fitPreference || 'Standard'})
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-start sm:self-auto">
                        <button
                          type="button"
                          onClick={() => {
                            if (currentCustomer) {
                              checkAndLoadPreviousMeasurements(currentCustomer.id);
                            }
                          }}
                          className="px-4 py-2 bg-[#071426] hover:bg-[#0E2038] text-[#D4AF5A] font-bold text-xs rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Use Previous Measurements</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {usedPreviousFeedback && (
                    <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold flex items-center gap-2 animate-fadeIn">
                      <Check className="w-4 h-4 text-emerald-600 stroke-[3]" />
                      <span>Loaded previous measurements into current order. You can edit any value freely.</span>
                    </div>
                  )}

                  {/* DYNAMIC SECTIONS FOR SELECTED GARMENTS ONLY */}
                  <div className="space-y-6">
                    {activeGarmentsList.map((g, idx) => {
                      const itemNumber = idx + 1;
                      return (
                        <div key={g.key} className="bg-white p-6 rounded-3xl border border-[#E6E1D7] shadow-sm space-y-5">
                          {/* Garment Header with # badge */}
                          <div className="flex items-center justify-between pb-3 border-b border-[#F2ECE1]">
                            <div className="flex items-center gap-3">
                              <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg bg-[#071426] text-[#D4AF5A] font-black text-xs sm:text-sm font-mono shadow-xs border border-[#C9A24A]/40 shrink-0">
                                #{itemNumber}
                              </span>
                              <div>
                                <h3 className="text-base font-black text-[#071426] tracking-wide uppercase">
                                  {g.label} ({unit})
                                </h3>
                                <p className="text-xs text-[#7A7060]">
                                  {[g.fabricName, g.quantity > 1 ? `Qty: ${g.quantity}` : '']
                                    .filter(Boolean)
                                    .join(' • ')}
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* 1. Coat only */}
                          {g.key === 'Coat' && (
                            <div className="space-y-3">
                              <div className="flex items-center gap-2 pb-1 text-xs font-black text-[#071426] uppercase tracking-wider">
                                <span className="text-base">🧥</span>
                                <span>COAT MEASUREMENTS ({unit})</span>
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                                {sectionFields('coat').map(f => (
                                  <div key={f.key} className="space-y-1">
                                    <label className="text-[10px] font-bold text-[#8C7E6A] uppercase">{f.label}</label>
                                    <div className="relative">
                                      <input
                                        type="text"
                                        value={(coatMeas as any)[f.key] || ''}
                                        onChange={(e) => setCoatMeas({ ...coatMeas, [f.key]: e.target.value })}
                                        className="w-full bg-[#FAF8F5] border border-[#E0D8CB] focus:border-[#C9A24A] rounded-xl px-2.5 py-2 text-center text-sm font-extrabold text-[#071426] outline-none"
                                      />
                                      <div className="flex justify-between mt-1 gap-1">
                                        <button
                                          type="button"
                                          onClick={() => stepMeasurement(setCoatMeas, f.key, -0.25)}
                                          className="flex-1 py-0.5 bg-[#FAF8F5] hover:bg-[#E6E1D7] rounded text-[10px] font-bold text-[#6E6454] cursor-pointer"
                                        >
                                          -¼
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => stepMeasurement(setCoatMeas, f.key, 0.25)}
                                          className="flex-1 py-0.5 bg-[#FAF8F5] hover:bg-[#E6E1D7] rounded text-[10px] font-bold text-[#6E6454] cursor-pointer"
                                        >
                                          +¼
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* 2. Pant only */}
                          {g.key === 'Pant' && (
                            <div className="space-y-3">
                              <div className="flex items-center gap-2 pb-1 text-xs font-black text-[#071426] uppercase tracking-wider">
                                <span className="text-base">👖</span>
                                <span>PANT MEASUREMENTS ({unit})</span>
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
                                {[
                                  { key: 'length', label: 'Length' },
                                  { key: 'waist', label: 'Waist' },
                                  { key: 'hip', label: 'H.P. / Hip' },
                                  { key: 'thigh', label: 'Thigh' },
                                  { key: 'inLeg', label: 'In-Leg' },
                                  { key: 'bottom', label: 'Bottom' },
                                  { key: 'body', label: 'Body' }
                                ].map(f => (
                                  <div key={f.key} className="space-y-1">
                                    <label className="text-[10px] font-bold text-[#8C7E6A] uppercase">{f.label}</label>
                                    <div className="relative">
                                      <input
                                        type="text"
                                        value={(pantMeas as any)[f.key] || ''}
                                        onChange={(e) => setPantMeas({ ...pantMeas, [f.key]: e.target.value })}
                                        className="w-full bg-[#FAF8F5] border border-[#E0D8CB] focus:border-[#C9A24A] rounded-xl px-2.5 py-2 text-center text-sm font-extrabold text-[#071426] outline-none"
                                      />
                                      <div className="flex justify-between mt-1 gap-1">
                                        <button
                                          type="button"
                                          onClick={() => stepMeasurement(setPantMeas, f.key, -0.25)}
                                          className="flex-1 py-0.5 bg-[#FAF8F5] hover:bg-[#E6E1D7] rounded text-[10px] font-bold text-[#6E6454] cursor-pointer"
                                        >
                                          -¼
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => stepMeasurement(setPantMeas, f.key, 0.25)}
                                          className="flex-1 py-0.5 bg-[#FAF8F5] hover:bg-[#E6E1D7] rounded text-[10px] font-bold text-[#6E6454] cursor-pointer"
                                        >
                                          +¼
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* 3. Shirt */}
                          {g.key === 'Shirt' && (
                            <div className="space-y-3">
                              <div className="flex items-center gap-2 pb-1 text-xs font-black text-[#071426] uppercase tracking-wider">
                                <span className="text-base">👔</span>
                                <span>SHIRT MEASUREMENTS ({unit})</span>
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-3">
                                {[
                                  { key: 'length', label: 'Length' },
                                  { key: 'chest', label: 'Chest' },
                                  { key: 'stomach', label: 'Stomach' },
                                  { key: 'hip', label: 'H.P. / Hip' },
                                  { key: 'shoulder', label: 'Shoulder' },
                                  { key: 'sleeve', label: 'Sleeve' },
                                  { key: 'collar', label: 'Collar' },
                                  { key: 'cuff', label: 'Cuff' }
                                ].map(f => (
                                  <div key={f.key} className="space-y-1">
                                    <label className="text-[10px] font-bold text-[#8C7E6A] uppercase">{f.label}</label>
                                    <div className="relative">
                                      <input
                                        type="text"
                                        value={(shirtMeas as any)[f.key] || ''}
                                        onChange={(e) => setShirtMeas({ ...shirtMeas, [f.key]: e.target.value })}
                                        className="w-full bg-[#FAF8F5] border border-[#E0D8CB] focus:border-[#C9A24A] rounded-xl px-2 py-2 text-center text-sm font-extrabold text-[#071426] outline-none"
                                      />
                                      <div className="flex justify-between mt-1 gap-1">
                                        <button
                                          type="button"
                                          onClick={() => stepMeasurement(setShirtMeas, f.key, -0.25)}
                                          className="flex-1 py-0.5 bg-[#FAF8F5] hover:bg-[#E6E1D7] rounded text-[10px] font-bold text-[#6E6454] cursor-pointer"
                                        >
                                          -¼
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => stepMeasurement(setShirtMeas, f.key, 0.25)}
                                          className="flex-1 py-0.5 bg-[#FAF8F5] hover:bg-[#E6E1D7] rounded text-[10px] font-bold text-[#6E6454] cursor-pointer"
                                        >
                                          +¼
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* 4. Kurta Pajama */}
                          {g.key === 'Kurta Pajama' && (
                            <div className="space-y-5">
                              {/* KURTA */}
                              <div className="space-y-3">
                                <div className="flex items-center gap-2 pb-1 text-xs font-black text-[#071426] uppercase tracking-wider">
                                  <span className="text-base">👘</span>
                                  <span>KURTA MEASUREMENTS ({unit})</span>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                                  {[
                                    { key: 'length', label: 'Length' },
                                    { key: 'chest', label: 'Chest' },
                                    { key: 'stomach', label: 'Stomach / Waist' },
                                    { key: 'hip', label: 'H.P. / Hip' },
                                    { key: 'shoulder', label: 'Shoulder' },
                                    { key: 'sleeve', label: 'Sleeve' },
                                    { key: 'bicep', label: 'Bicep' },
                                    { key: 'cuff', label: 'Cuff' },
                                    { key: 'collar', label: 'Collar' }
                                  ].map(f => (
                                    <div key={f.key} className="space-y-1">
                                      <label className="text-[10px] font-bold text-[#8C7E6A] uppercase">{f.label}</label>
                                      <div className="relative">
                                        <input
                                          type="text"
                                          value={(kurtaMeas as any)[f.key] || ''}
                                          onChange={(e) => setKurtaMeas({ ...kurtaMeas, [f.key]: e.target.value })}
                                          className="w-full bg-[#FAF8F5] border border-[#E0D8CB] focus:border-[#C9A24A] rounded-xl px-2 py-2 text-center text-sm font-extrabold text-[#071426] outline-none"
                                        />
                                        <div className="flex justify-between mt-1 gap-1">
                                          <button
                                            type="button"
                                            onClick={() => stepMeasurement(setKurtaMeas, f.key, -0.25)}
                                            className="flex-1 py-0.5 bg-[#FAF8F5] hover:bg-[#E6E1D7] rounded text-[10px] font-bold text-[#6E6454] cursor-pointer"
                                          >
                                            -¼
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => stepMeasurement(setKurtaMeas, f.key, 0.25)}
                                            className="flex-1 py-0.5 bg-[#FAF8F5] hover:bg-[#E6E1D7] rounded text-[10px] font-bold text-[#6E6454] cursor-pointer"
                                          >
                                            +¼
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* PAJAMA */}
                              <div className="space-y-3 pt-4 border-t border-[#F2ECE1]">
                                <div className="flex items-center gap-2 pb-1 text-xs font-black text-[#071426] uppercase tracking-wider">
                                  <span className="text-base">👖</span>
                                  <span>PAJAMA MEASUREMENTS ({unit})</span>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
                                  {[
                                    { key: 'length', label: 'Length' },
                                    { key: 'waist', label: 'Waist' },
                                    { key: 'hip', label: 'H.P. / Hip' },
                                    { key: 'thigh', label: 'Thigh' },
                                    { key: 'inLeg', label: 'In-Leg' },
                                    { key: 'bottom', label: 'Bottom' },
                                    { key: 'body', label: 'Body' }
                                  ].map(f => (
                                    <div key={f.key} className="space-y-1">
                                      <label className="text-[10px] font-bold text-[#8C7E6A] uppercase">{f.label}</label>
                                      <div className="relative">
                                        <input
                                          type="text"
                                          value={(pajamaMeas as any)[f.key] || ''}
                                          onChange={(e) => setPajamaMeas({ ...pajamaMeas, [f.key]: e.target.value })}
                                          className="w-full bg-[#FAF8F5] border border-[#E0D8CB] focus:border-[#C9A24A] rounded-xl px-2 py-2 text-center text-sm font-extrabold text-[#071426] outline-none"
                                        />
                                        <div className="flex justify-between mt-1 gap-1">
                                          <button
                                            type="button"
                                            onClick={() => stepMeasurement(setPajamaMeas, f.key, -0.25)}
                                            className="flex-1 py-0.5 bg-[#FAF8F5] hover:bg-[#E6E1D7] rounded text-[10px] font-bold text-[#6E6454] cursor-pointer"
                                          >
                                            -¼
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => stepMeasurement(setPajamaMeas, f.key, 0.25)}
                                            className="flex-1 py-0.5 bg-[#FAF8F5] hover:bg-[#E6E1D7] rounded text-[10px] font-bold text-[#6E6454] cursor-pointer"
                                          >
                                            +¼
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* PER-GARMENT REMARKS FIELD BELOW MEASUREMENTS */}
                          <div className="pt-4 border-t border-[#F2ECE1] space-y-1.5">
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-black text-[#071426] uppercase tracking-wider">
                                REMARKS
                              </label>
                              <span className="text-[10px] font-bold text-[#8C7E6A] uppercase tracking-wider">
                                Optional • Production Only
                              </span>
                            </div>
                            <textarea
                              rows={3}
                              value={selectedGarments[g.key]?.remarks || ''}
                              onChange={(e) => {
                                const rem = e.target.value;
                                setSelectedGarments(prev => ({
                                  ...prev,
                                  [g.key]: {
                                    ...prev[g.key]!,
                                    remarks: rem
                                  }
                                }));
                              }}
                              placeholder="Add any production remarks for this garment..."
                              className="w-full bg-[#FAF8F5] border border-[#E0D8CB] focus:border-[#C9A24A] rounded-2xl p-3 text-xs font-semibold text-[#071426] outline-none transition-all placeholder:text-[#A39682]"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ======================================================== */}
              {/* STEP 5: REVIEW ORDER */}
              {/* ======================================================== */}
              {currentStep === 5 && (
                <div className="space-y-6 animate-fadeIn">
                  <div className="border-b border-[#E6E1D7] pb-4">
                    <h2 className="text-2xl md:text-3xl font-black text-[#071426] brand-font tracking-tight">
                      REVIEW ORDER
                    </h2>
                    <p className="text-xs md:text-sm text-[#7A7060] mt-1">
                      Verify client, garments, timeline, and master measurements before placing the order.
                    </p>
                  </div>

                  {/* CLIENT & TIMELINE — full width.

                      The crafting-notes column that used to sit beside this
                      one is gone: special instructions and the fit silhouette
                      are shown where they are entered and printed, not
                      restated here. Rather than leave half the row empty, the
                      details run in two columns inside the card, so the block
                      reads across the page instead of as one thin list. */}
                  <div className="bg-white p-6 rounded-3xl border border-[#E6E1D7] shadow-sm space-y-4">
                    <h3 className="text-xs font-black text-[#C9A24A] uppercase tracking-wider flex items-center gap-2">
                      <User className="w-4 h-4" />
                      <span>1. Client &amp; Timeline</span>
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2.5 text-sm">
                      <div className="flex justify-between gap-3">
                        <span className="text-[#7A7060]">Customer Name:</span>
                        <span className="font-extrabold text-[#071426] text-right">{customerName || 'New Client'}</span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-[#7A7060]">Order Number:</span>
                        <span className="font-black font-mono text-[#C9A24A] text-base">#{displayOrderNumber}</span>
                      </div>

                      <div className="flex justify-between gap-3">
                        <span className="text-[#7A7060]">Mobile:</span>
                        <span className="font-bold text-[#071426] text-right">{customerPhone || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-[#7A7060]">Order Date:</span>
                        <span className="font-semibold text-[#071426]">{orderDate}</span>
                      </div>

                      <div className="flex justify-between gap-3">
                        <span className="text-[#7A7060]">City / Address:</span>
                        <span className="font-semibold text-[#071426] text-right">
                          {customerCity || '\u2014'} {customerAddress ? `\u2022 ${customerAddress}` : ''}
                        </span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-[#7A7060]">Delivery Date:</span>
                        <span className="font-extrabold text-[#071426]">{deliveryDate}</span>
                      </div>
                    </div>
                  </div>

                  {/* GARMENTS LIST */}
                  <div className="bg-white p-6 rounded-3xl border border-[#E6E1D7] shadow-sm space-y-3">
                    <h3 className="text-xs font-black text-[#C9A24A] uppercase tracking-wider flex items-center gap-2">
                      <ShoppingBag className="w-4 h-4" />
                      <span>2. Booked Garments ({activeGarmentsList.length})</span>
                    </h3>
                    <div className="divide-y divide-[#F2ECE1]">
                      {activeGarmentsList.map((g, idx) => (
                        <div key={idx} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between text-sm gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-[#C9A24A]">#{idx + 1}</span>
                              <span className="font-extrabold text-[#071426]">{g.label}</span>
                              {g.fabricName && (
                                <span className="text-xs text-[#7A7060]">({g.fabricName})</span>
                              )}
                            </div>
                            {g.styleNotes && <div className="text-[11px] text-[#8C7E6A] mt-0.5">{g.styleNotes}</div>}
                            {g.remarks && (
                              <div className="mt-1.5 p-2 bg-[#FAF8F5] rounded-lg border border-[#E0D8CB] text-xs">
                                <span className="text-[10px] font-bold text-[#8C7E6A] uppercase block">Remarks:</span>
                                <span className="text-[#071426] font-semibold">{g.remarks}</span>
                              </div>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <span className="font-bold text-[#071426] px-3 py-1 bg-[#FAF8F5] rounded-lg border border-[#E0D8CB]">
                              Qty: {g.quantity}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* MEASUREMENTS OVERVIEW */}
                  <div className="bg-white p-6 rounded-3xl border border-[#E6E1D7] shadow-sm space-y-3">
                    <h3 className="text-xs font-black text-[#C9A24A] uppercase tracking-wider flex items-center gap-2">
                      <Scissors className="w-4 h-4" />
                      <span>3. Precision Measurements ({unit}{fitPreference ? ` • ${fitPreference}` : ''})</span>
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                      {selectedGarments.Coat?.selected && (
                        <div className="p-3 bg-[#FAF8F5] rounded-xl border border-[#E0D8CB]">
                          <span className="font-bold text-[#071426] block mb-1">Coat:</span>
                          <span className="text-[#574E3E]">{summariseMeasurement('coat', coatMeas)}</span>
                        </div>
                      )}
                      {selectedGarments.Pant?.selected && (
                        <div className="p-3 bg-[#FAF8F5] rounded-xl border border-[#E0D8CB]">
                          <span className="font-bold text-[#071426] block mb-1">Pant:</span>
                          <span className="text-[#574E3E]">{summariseMeasurement('pant', pantMeas)}</span>
                        </div>
                      )}
                      {selectedGarments.Shirt?.selected && (
                        <div className="p-3 bg-[#FAF8F5] rounded-xl border border-[#E0D8CB]">
                          <span className="font-bold text-[#071426] block mb-1">Shirt:</span>
                          <span className="text-[#574E3E]">{summariseMeasurement('shirt', shirtMeas)}</span>
                        </div>
                      )}
                      {selectedGarments['Kurta Pajama']?.selected && (
                        <div className="p-3 bg-[#FAF8F5] rounded-xl border border-[#E0D8CB]">
                          <span className="font-bold text-[#071426] block mb-1">Kurta Pajama:</span>
                          <span className="text-[#574E3E] block">Kurta — {summariseMeasurement('kurta', kurtaMeas)}</span>
                          <span className="text-[#574E3E] block mt-1">Pajama — {summariseMeasurement('pajama', pajamaMeas)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

        </div>
      </main>

      {/* ======================================================== */}
      {/* BOTTOM ACTION BAR */}
      {/* ======================================================== */}
      {!isSuccessScreen && (
        <footer className="shrink-0 bg-white border-t border-[#E6E1D7] px-6 md:px-12 py-4 flex items-center justify-between shadow-lg z-20">
          <div>
            {currentStep > 1 ? (
              <button
                type="button"
                onClick={handlePrevStep}
                className="px-5 py-3 bg-[#FAF8F5] hover:bg-[#E6E1D7] text-[#071426] font-bold text-xs md:text-sm rounded-xl border border-[#E0D8CB] transition-all flex items-center gap-2 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCloseAttempt}
                className="px-4 py-2.5 text-[#7A7060] hover:text-[#071426] font-bold text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {currentStep < 5 ? (
              <button
                type="button"
                onClick={handleNextStep}
                className="px-8 py-3.5 bg-[#071426] hover:bg-[#0E2038] text-[#D4AF5A] font-extrabold text-xs md:text-sm rounded-2xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
              >
                <span>Continue</span>
                <ArrowRight className="w-4 h-4 text-[#C9A24A]" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleFinalPlaceOrder}
                disabled={isSubmitting}
                className="px-10 py-4 bg-[#C9A24A] hover:bg-[#B8913B] text-[#071426] font-black text-sm md:text-base rounded-2xl shadow-lg transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Check className="w-5 h-5 stroke-[3]" />
                <span>{isSubmitting ? 'Placing Order...' : 'PLACE ORDER'}</span>
              </button>
            )}
          </div>
        </footer>
      )}

    </div>
  );
};
