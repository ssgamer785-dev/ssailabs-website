import React, { useState, useEffect, useRef } from 'react';
import {
  initialCustomers,
  initialMeasurements,
  initialOrders,
  initialFittings,
  initialWorkers,
  initialInvoices,
  initialExpenses,
  initialTrash,
  initialProfile
} from './data/initialData';
import {
  Customer,
  MeasurementRecord,
  Order,
  Fitting,
  Worker,
  Invoice,
  Expense,
  TrashItem,
  ShowroomProfile,
  OrderStatus,
  ProductionStatus
} from './types';
import { Sidebar, NavTab } from './components/Sidebar';
import { Header } from './components/Header';
import { DashboardView } from './components/views/DashboardView';
import { CustomersView } from './components/views/CustomersView';
import { MeasurementsView } from './components/views/MeasurementsView';
import { OrdersView } from './components/views/OrdersView';
import { ProductionSlipsView } from './components/views/ProductionSlipsView';
import { FittingsView } from './components/views/FittingsView';
import { WorkersView } from './components/views/WorkersView';
import { BillingsView } from './components/views/BillingsView';
import { FinancesView } from './components/views/FinancesView';
import { BackupView } from './components/views/BackupView';
import { TrashView } from './components/views/TrashView';

import { ClientPortalModal } from './components/modals/ClientPortalModal';
import { CustomerModal } from './components/modals/CustomerModal';
import { OrderModal } from './components/modals/OrderModal';
import { MeasurementModal } from './components/modals/MeasurementModal';
import { OrderDetailModal } from './components/modals/OrderDetailModal';
import { CustomerProfileModal } from './components/modals/CustomerProfileModal';
import { PrintProductionSlipModal } from './components/modals/PrintProductionSlipModal';
import { PrintBillModal } from './components/modals/PrintBillModal';
import { ProductionSlipDetailModal } from './components/modals/ProductionSlipDetailModal';
import { RegencyBackupPayload, normalizeRestoredPayload } from './utils/backupManager';
import { readArray, readObject, writeJson, onStorageFailure } from './utils/safeStorage';
import { highestNumberInData, raiseHighWaterMark, extractOrderNumber } from './utils/orderNumbering';
import { StorageAlertBanner } from './components/StorageAlertBanner';

const STORAGE_KEY = 'REGENCY_TAILORS_DB_V3';

export default function App() {
  // Persistence state setup
  const [customers, setCustomers] = useState<Customer[]>(() =>
    readArray<Customer>(`${STORAGE_KEY}_CUSTOMERS`, initialCustomers)
  );

  const [measurements, setMeasurements] = useState<MeasurementRecord[]>(() =>
    readArray<MeasurementRecord>(`${STORAGE_KEY}_MEASUREMENTS`, initialMeasurements)
  );

  const [orders, setOrders] = useState<Order[]>(() =>
    readArray<Order>(`${STORAGE_KEY}_ORDERS`, initialOrders)
  );

  const [fittings, setFittings] = useState<Fitting[]>(() =>
    readArray<Fitting>(`${STORAGE_KEY}_FITTINGS`, initialFittings)
  );

  const [workers, setWorkers] = useState<Worker[]>(() =>
    readArray<Worker>(`${STORAGE_KEY}_WORKERS`, initialWorkers)
  );

  const [invoices, setInvoices] = useState<Invoice[]>(() =>
    readArray<Invoice>(`${STORAGE_KEY}_INVOICES`, initialInvoices)
  );

  const [expenses, setExpenses] = useState<Expense[]>(() =>
    readArray<Expense>(`${STORAGE_KEY}_EXPENSES`, initialExpenses)
  );

  const [trash, setTrash] = useState<TrashItem[]>(() =>
    readArray<TrashItem>(`${STORAGE_KEY}_TRASH`, initialTrash)
  );

  const [profile, setProfile] = useState<ShowroomProfile>(() =>
    readObject<ShowroomProfile>(`${STORAGE_KEY}_PROFILE`, initialProfile)
  );

  // Surfaced to the user when the browser refuses to persist (quota full, private mode)
  const [storageAlert, setStorageAlert] = useState<string | null>(null);
  useEffect(() => onStorageFailure(f => setStorageAlert(f.message)), []);

  // Keep a second browser tab from overwriting the first tab's work. Each tab
  // holds the whole database in memory and writes it back wholesale, so without
  // this a stale tab silently erases orders saved elsewhere.
  useEffect(() => {
    const handleExternalWrite = (event: StorageEvent) => {
      if (!event.key || !event.key.startsWith(STORAGE_KEY) || event.newValue === null) return;

      switch (event.key) {
        case `${STORAGE_KEY}_CUSTOMERS`:
          setCustomers(readArray<Customer>(event.key, []));
          break;
        case `${STORAGE_KEY}_MEASUREMENTS`:
          setMeasurements(readArray<MeasurementRecord>(event.key, []));
          break;
        case `${STORAGE_KEY}_ORDERS`:
          setOrders(readArray<Order>(event.key, []));
          break;
        case `${STORAGE_KEY}_FITTINGS`:
          setFittings(readArray<Fitting>(event.key, []));
          break;
        case `${STORAGE_KEY}_WORKERS`:
          setWorkers(readArray<Worker>(event.key, []));
          break;
        case `${STORAGE_KEY}_INVOICES`:
          setInvoices(readArray<Invoice>(event.key, []));
          break;
        case `${STORAGE_KEY}_EXPENSES`:
          setExpenses(readArray<Expense>(event.key, []));
          break;
        case `${STORAGE_KEY}_TRASH`:
          setTrash(readArray<TrashItem>(event.key, []));
          break;
        default:
          break;
      }
    };

    window.addEventListener('storage', handleExternalWrite);
    return () => window.removeEventListener('storage', handleExternalWrite);
  }, []);

  // Navigation & Modal States
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeRole, setActiveRole] = useState<'Admin' | 'Receptionist'>('Admin');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [clientPortalOpen, setClientPortalOpen] = useState(false);

  const mainContentRef = useRef<HTMLElement | null>(null);
  const tabScrollMap = useRef<Record<string, number>>({});
  const prevTabRef = useRef<NavTab>(activeTab);

  useEffect(() => {
    if (mainContentRef.current) {
      if (prevTabRef.current !== activeTab) {
        tabScrollMap.current[prevTabRef.current] = mainContentRef.current.scrollTop;
        prevTabRef.current = activeTab;
        const savedScroll = tabScrollMap.current[activeTab] || 0;
        mainContentRef.current.scrollTop = savedScroll;
      }
    }
  }, [activeTab]);

  // Modals
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [preselectedCustomerForOrder, setPreselectedCustomerForOrder] = useState<Customer | null>(null);

  const [isOrderDetailModalOpen, setIsOrderDetailModalOpen] = useState(false);
  const [selectedOrderForDetail, setSelectedOrderForDetail] = useState<Order | null>(null);

  const [isCustomerProfileModalOpen, setIsCustomerProfileModalOpen] = useState(false);
  const [selectedCustomerProfile, setSelectedCustomerProfile] = useState<Customer | null>(null);

  const [isMeasurementModalOpen, setIsMeasurementModalOpen] = useState(false);
  const [editingMeasurement, setEditingMeasurement] = useState<MeasurementRecord | null>(null);
  const [preselectedCustomerForMeasurement, setPreselectedCustomerForMeasurement] = useState<Customer | null>(null);

  // Production Slip & Print Modals
  const [isPrintProductionSlipOpen, setIsPrintProductionSlipOpen] = useState(false);
  const [selectedOrderForPrintSlip, setSelectedOrderForPrintSlip] = useState<Order | null>(null);

  const [isPrintBillOpen, setIsPrintBillOpen] = useState(false);
  const [selectedOrderForPrintBill, setSelectedOrderForPrintBill] = useState<Order | null>(null);

  const [isProductionSlipDetailOpen, setIsProductionSlipDetailOpen] = useState(false);
  const [selectedOrderForSlipDetail, setSelectedOrderForSlipDetail] = useState<Order | null>(null);

  // Sync to localStorage
  useEffect(() => {
    writeJson(`${STORAGE_KEY}_CUSTOMERS`, customers);
  }, [customers]);

  useEffect(() => {
    writeJson(`${STORAGE_KEY}_MEASUREMENTS`, measurements);
  }, [measurements]);

  useEffect(() => {
    writeJson(`${STORAGE_KEY}_ORDERS`, orders);
  }, [orders]);

  useEffect(() => {
    writeJson(`${STORAGE_KEY}_FITTINGS`, fittings);
  }, [fittings]);

  useEffect(() => {
    writeJson(`${STORAGE_KEY}_WORKERS`, workers);
  }, [workers]);

  useEffect(() => {
    writeJson(`${STORAGE_KEY}_INVOICES`, invoices);
  }, [invoices]);

  useEffect(() => {
    writeJson(`${STORAGE_KEY}_EXPENSES`, expenses);
  }, [expenses]);

  useEffect(() => {
    writeJson(`${STORAGE_KEY}_TRASH`, trash);
  }, [trash]);

  useEffect(() => {
    writeJson(`${STORAGE_KEY}_PROFILE`, profile);
  }, [profile]);

  // Handlers: Customers
  const handleSaveCustomer = (customer: Customer) => {
    setCustomers(prev => {
      const exists = prev.some(c => c.id === customer.id);
      if (exists) return prev.map(c => c.id === customer.id ? customer : c);
      return [customer, ...prev];
    });
  };

  const handleDeleteCustomer = (customer: Customer) => {
    if (confirm(`Move customer "${customer.name}" to trash?`)) {
      setCustomers(prev => prev.filter(c => c.id !== customer.id));
      setTrash(prev => [
        {
          id: `TRASH-${Date.now()}`,
          itemType: 'Customer',
          title: `Client Profile: ${customer.name} (${customer.phone})`,
          originalData: customer,
          deletedAt: new Date().toISOString().split('T')[0],
          deletedBy: profile.activeUser
        },
        ...prev
      ]);
    }
  };

  // Handlers: Orders
  const handleSaveOrder = (order: Order) => {
    // Retire this order number permanently so it can never be re-issued,
    // even if the order is later deleted and the trash emptied.
    raiseHighWaterMark(STORAGE_KEY, extractOrderNumber(order.orderNumber || order.id));

    // An edit must never reset money, workflow status or production history.
    // The wizard only owns customer details, dates, garments and measurements;
    // everything else is carried over from the stored order.
    const existingOrder = orders.find(o => o.id === order.id) || null;
    const isEdit = Boolean(existingOrder);

    const mergedOrder: Order = existingOrder
      ? {
          ...existingOrder,
          // fields the order wizard is allowed to change
          customerId: order.customerId,
          customerName: order.customerName,
          customerPhone: order.customerPhone,
          customerEmail: order.customerEmail ?? existingOrder.customerEmail,
          customerAddress: order.customerAddress ?? existingOrder.customerAddress,
          items: order.items,
          orderDate: order.orderDate,
          deliveryDate: order.deliveryDate,
          specialInstructions: order.specialInstructions,
          notes: order.notes,
          fittingNotes: order.fittingNotes,
          measurementsSnapshot: order.measurementsSnapshot
          // status, productionStatus, productionNotes, totalAmount, subtotal,
          // discount, taxAmount, advancePaid, balanceDue, paymentHistory,
          // paymentMethod, trialDate, priority, urgent, invoiceId and fittingId
          // are intentionally preserved from `existingOrder`.
        }
      : order;

    setOrders(prev => {
      const exists = prev.some(o => o.id === mergedOrder.id);
      if (exists) return prev.map(o => o.id === mergedOrder.id ? mergedOrder : o);
      return [mergedOrder, ...prev];
    });

    // If order has measurements snapshot, update/create customer measurement record
    if (mergedOrder.measurementsSnapshot) {
      const snap = mergedOrder.measurementsSnapshot;
      // Only carry garment sections that this order actually captured, so a
      // shirt-only order never blanks a previously recorded coat or pant.
      const capturedSections: Partial<MeasurementRecord> = {};
      (['coat', 'pant', 'shirt', 'kurta', 'pajama'] as const).forEach(section => {
        if (snap[section]) (capturedSections as any)[section] = snap[section];
      });

      const newMRecord: MeasurementRecord = {
        id: `M-${mergedOrder.id}`,
        customerId: mergedOrder.customerId,
        customerName: mergedOrder.customerName,
        customerPhone: mergedOrder.customerPhone,
        orderNumber: mergedOrder.orderNumber || mergedOrder.id,
        garmentType: (mergedOrder.items || []).map(i => i.garmentType).join(', '),
        selectedGarments: (mergedOrder.items || []).map(i => String(i.garmentType)),
        lastUpdated: new Date().toISOString().split('T')[0],
        unit: snap.unit || 'inches',
        fitPreference: snap.fitPreference,
        garmentRemarks: snap.garmentRemarks,
        fittingNotes: snap.fittingNotes,
        ...capturedSections
      };

      setMeasurements(prev => {
        const existingIdx = prev.findIndex(m => m.customerId === mergedOrder.customerId);
        if (existingIdx >= 0) {
          const copy = [...prev];
          copy[existingIdx] = { ...copy[existingIdx], ...newMRecord, id: copy[existingIdx].id };
          return copy;
        }
        return [newMRecord, ...prev];
      });
    }

    // Customer order/spend totals move only when a genuinely new order is placed.
    if (!isEdit) {
      setCustomers(prev =>
        prev.map(c => {
          if (c.id === mergedOrder.customerId) {
            return {
              ...c,
              totalOrders: (c.totalOrders || 0) + 1,
              lifetimeSpend: (c.lifetimeSpend || 0) + (mergedOrder.totalAmount || 0),
              lastVisitDate: new Date().toISOString().split('T')[0]
            };
          }
          return c;
        })
      );
    }

    // Auto generate / refresh the corresponding invoice, keeping any payments
    // already recorded against it.
    setInvoices(prev => {
      const priorInvoice = prev.find(i => i.orderId === mergedOrder.id);
      const amountPaid = priorInvoice
        ? Math.max(priorInvoice.amountPaid || 0, mergedOrder.advancePaid || 0)
        : (mergedOrder.advancePaid || 0);
      const grandTotal = mergedOrder.totalAmount || 0;
      const balanceRemaining = Math.max(0, grandTotal - amountPaid);

      const refreshedInvoice: Invoice = {
        id: priorInvoice?.id || `INV-${mergedOrder.id}`,
        orderId: mergedOrder.id,
        customerName: mergedOrder.customerName,
        customerPhone: mergedOrder.customerPhone,
        date: mergedOrder.orderDate,
        items: (mergedOrder.items || []).map(i => ({
          description: `${i.garmentType} (${i.fabricName || 'Bespoke'})`,
          qty: i.quantity || 1,
          rate: i.price,
          amount: (i.price || 0) * (i.quantity || 1)
        })),
        subtotal: mergedOrder.subtotal || grandTotal,
        gstAmount: mergedOrder.taxAmount || 0,
        discount: mergedOrder.discount || 0,
        grandTotal,
        amountPaid,
        balanceRemaining,
        paymentMode:
          (priorInvoice?.paymentMode as any) ||
          (mergedOrder.paymentHistory?.[0]?.method as any) ||
          (mergedOrder.paymentMethod as any) ||
          'UPI / GPay',
        status: amountPaid > 0 && balanceRemaining === 0 ? 'Paid' : amountPaid > 0 ? 'Partial' : 'Outstanding'
      };

      return [refreshedInvoice, ...prev.filter(i => i.orderId !== mergedOrder.id)];
    });

    // Auto schedule fitting only if trial date explicitly provided (e.g. from existing orders)
    if (order.trialDate) {
      const newFitting: Fitting = {
        id: `FIT-${Math.floor(100 + Math.random() * 900)}`,
        orderId: order.id,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        garment: (order.items || []).map(i => i.garmentType).join(', '),
        trialStage: 'First Trial',
        scheduledDate: order.trialDate,
        scheduledTime: '03:00 PM',
        status: 'Scheduled',
        adjustmentNotes: 'First trial fitting for canvas structure, chest balance, and sleeve drape.'
      };
      setFittings(prev => [newFitting, ...prev.filter(f => f.orderId !== order.id)]);
    }

    if (selectedOrderForDetail?.id === order.id) {
      setSelectedOrderForDetail(order);
    }
  };

  const handleRecordOrderPayment = (orderId: string, amount: number, method: string, note?: string) => {
    if (amount <= 0) return;

    const today = new Date().toISOString().split('T')[0];
    const newPaymentRecord = {
      id: `PAY-${Date.now()}`,
      date: today,
      amount,
      method,
      note: note || 'Showroom counter payment'
    };

    setOrders(prev =>
      prev.map(ord => {
        if (ord.id === orderId) {
          const newAdvance = ord.advancePaid + amount;
          const newBalance = Math.max(0, ord.totalAmount - newAdvance);
          const updatedOrd: Order = {
            ...ord,
            advancePaid: newAdvance,
            balanceDue: newBalance,
            paymentHistory: [...(ord.paymentHistory || []), newPaymentRecord]
          };
          if (selectedOrderForDetail?.id === orderId) {
            setSelectedOrderForDetail(updatedOrd);
          }
          return updatedOrd;
        }
        return ord;
      })
    );

    // Also update invoice
    setInvoices(prev =>
      prev.map(inv => {
        if (inv.orderId === orderId) {
          const newPaid = inv.amountPaid + amount;
          const newBalance = Math.max(0, inv.grandTotal - newPaid);
          return {
            ...inv,
            amountPaid: newPaid,
            balanceRemaining: newBalance,
            status: newBalance === 0 ? 'Paid' : 'Partial'
          };
        }
        return inv;
      })
    );
  };

  const handleDeleteOrder = (order: Order) => {
    if (confirm(`Move order "${order.id}" to trash?`)) {
      setOrders(prev => prev.filter(o => o.id !== order.id));
      setTrash(prev => [
        {
          id: `TRASH-${Date.now()}`,
          itemType: 'Order',
          title: `Bespoke Order ${order.id} (${order.customerName})`,
          originalData: order,
          deletedAt: new Date().toISOString().split('T')[0],
          deletedBy: profile.activeUser
        },
        ...prev
      ]);
      if (selectedOrderForDetail?.id === order.id) {
        setIsOrderDetailModalOpen(false);
        setSelectedOrderForDetail(null);
      }
    }
  };

  const handleUpdateOrderStatus = (orderId: string, newStatus: OrderStatus) => {
    setOrders(prev =>
      prev.map(o => {
        if (o.id === orderId) {
          const updated = { ...o, status: newStatus };
          if (selectedOrderForDetail?.id === orderId) {
            setSelectedOrderForDetail(updated);
          }
          return updated;
        }
        return o;
      })
    );
  };

  // Handlers: Production Slips
  const handleUpdateProductionStatus = (orderId: string, status: ProductionStatus) => {
    setOrders(prev =>
      prev.map(o => {
        if (o.id === orderId) {
          const updated = { ...o, productionStatus: status };
          if (selectedOrderForDetail?.id === orderId) {
            setSelectedOrderForDetail(updated);
          }
          if (selectedOrderForSlipDetail?.id === orderId) {
            setSelectedOrderForSlipDetail(updated);
          }
          return updated;
        }
        return o;
      })
    );
  };

  const handleUpdateProductionNotes = (orderId: string, notes: string) => {
    setOrders(prev =>
      prev.map(o => {
        if (o.id === orderId) {
          const updated = { ...o, productionNotes: notes };
          if (selectedOrderForDetail?.id === orderId) {
            setSelectedOrderForDetail(updated);
          }
          if (selectedOrderForSlipDetail?.id === orderId) {
            setSelectedOrderForSlipDetail(updated);
          }
          return updated;
        }
        return o;
      })
    );
  };

  const handleOpenPrintProductionSlip = (order: Order) => {
    setSelectedOrderForPrintSlip(order);
    setIsPrintProductionSlipOpen(true);
  };

  const handleOpenPrintBill = (order: Order) => {
    setSelectedOrderForPrintBill(order);
    setIsPrintBillOpen(true);
  };

  const handleOpenProductionSlipDetail = (order: Order) => {
    setSelectedOrderForSlipDetail(order);
    setIsProductionSlipDetailOpen(true);
  };

  // Handlers: Measurements
  const handleSaveMeasurement = (record: MeasurementRecord) => {
    setMeasurements(prev => {
      const exists = prev.some(m => m.id === record.id);
      if (exists) return prev.map(m => m.id === record.id ? record : m);
      return [record, ...prev];
    });
  };

  const handleDeleteMeasurement = (record: MeasurementRecord) => {
    if (confirm(`Move measurement profile for "${record.customerName}" to trash?`)) {
      setMeasurements(prev => prev.filter(m => m.id !== record.id));
      setTrash(prev => [
        {
          id: `TRASH-${Date.now()}`,
          itemType: 'Measurement',
          title: `Measurement Spec: ${record.customerName} (${record.garmentType})`,
          originalData: record,
          deletedAt: new Date().toISOString().split('T')[0],
          deletedBy: profile.activeUser
        },
        ...prev
      ]);
    }
  };

  // Handlers: Fittings
  const handleUpdateFittingStatus = (fittingId: string, status: Fitting['status'], notes?: string) => {
    setFittings(prev =>
      prev.map(f => (f.id === fittingId ? { ...f, status, adjustmentNotes: notes || f.adjustmentNotes } : f))
    );
  };

  const handleDeleteFitting = (fittingId: string) => {
    setFittings(prev => prev.filter(f => f.id !== fittingId));
  };

  // Handlers: Workers
  const handleRecordAdvance = (workerId: string, amount: number) => {
    setWorkers(prev =>
      prev.map(w => {
        if (w.id === workerId) {
          const newAdvance = w.advanceTaken + amount;
          return {
            ...w,
            advanceTaken: newAdvance,
            balancePayout: Math.max(0, w.totalEarned - newAdvance)
          };
        }
        return w;
      })
    );
  };

  const handleMarkPayoutPaid = (workerId: string) => {
    setWorkers(prev =>
      prev.map(w => {
        if (w.id === workerId) {
          return {
            ...w,
            balancePayout: 0,
            advanceTaken: 0
          };
        }
        return w;
      })
    );
    alert('Worker payout marked as fully paid.');
  };

  // Handlers: Billing & Expense
  const handleRecordPayment = (invoiceId: string, amount: number) => {
    setInvoices(prev =>
      prev.map(i => {
        if (i.id === invoiceId) {
          const newPaid = i.amountPaid + amount;
          const newBalance = Math.max(0, i.grandTotal - newPaid);
          return {
            ...i,
            amountPaid: newPaid,
            balanceRemaining: newBalance,
            status: newBalance === 0 ? 'Paid' : 'Partial'
          };
        }
        return i;
      })
    );
  };

  const handleAddExpense = (exp: Omit<Expense, 'id'>) => {
    const newExp: Expense = {
      id: `EXP-${Math.floor(100 + Math.random() * 900)}`,
      ...exp
    };
    setExpenses(prev => [newExp, ...prev]);
  };

  // Handlers: Trash & Restore
  const handleRestoreItem = (item: TrashItem) => {
    if (item.itemType === 'Customer') setCustomers(prev => [item.originalData, ...prev]);
    if (item.itemType === 'Order') setOrders(prev => [item.originalData, ...prev]);
    if (item.itemType === 'Measurement') setMeasurements(prev => [item.originalData, ...prev]);
    setTrash(prev => prev.filter(t => t.id !== item.id));
    alert(`Restored ${item.title}`);
  };

  const handlePermanentDelete = (itemId: string) => {
    setTrash(prev => prev.filter(t => t.id !== itemId));
  };

  const handleEmptyTrash = () => {
    setTrash([]);
  };

  // Handlers: Backup & Atomic Restore
  const handleRestoreBackup = (incoming: RegencyBackupPayload) => {
    // Repair any structurally-broken records before they reach the UI, so a
    // hand-edited or truncated backup can never blank the screen.
    const payload = normalizeRestoredPayload(incoming);

    // 1. Atomic React state replacement
    setCustomers(payload.customers || []);
    setMeasurements(payload.measurements || []);
    setOrders(payload.orders || []);
    setFittings(payload.fittings || []);
    setWorkers(payload.workers || []);
    setInvoices(payload.invoices || []);
    setExpenses(payload.expenses || []);
    setTrash(payload.trash || []);
    if (payload.profile) {
      setProfile(payload.profile);
    }

    // 2. Immediate direct localStorage sync (fail-soft, reported to the user)
    writeJson(`${STORAGE_KEY}_CUSTOMERS`, payload.customers || []);
    writeJson(`${STORAGE_KEY}_MEASUREMENTS`, payload.measurements || []);
    writeJson(`${STORAGE_KEY}_ORDERS`, payload.orders || []);
    writeJson(`${STORAGE_KEY}_FITTINGS`, payload.fittings || []);
    writeJson(`${STORAGE_KEY}_WORKERS`, payload.workers || []);
    writeJson(`${STORAGE_KEY}_INVOICES`, payload.invoices || []);
    writeJson(`${STORAGE_KEY}_EXPENSES`, payload.expenses || []);
    writeJson(`${STORAGE_KEY}_TRASH`, payload.trash || []);
    if (payload.profile) {
      writeJson(`${STORAGE_KEY}_PROFILE`, payload.profile);
    }

    // 3. Restore the order-number high-water mark so a restored database
    //    continues from the correct next number instead of re-issuing one.
    raiseHighWaterMark(
      STORAGE_KEY,
      Math.max(
        payload.metadata?.orderSequence || 0,
        highestNumberInData(payload.orders || [], payload.trash || [])
      )
    );
  };

  return (
    <div className="flex h-screen bg-[#F7F3EA] text-[#071426] overflow-hidden print-app-root">
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenClientPortal={() => setClientPortalOpen(true)}
        activeRole={activeRole}
        setActiveRole={setActiveRole}
        userName={profile.activeUser}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden print-app-shell">
        {/* Top Header */}
        <Header
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          customers={customers}
          orders={orders}
          onSelectCustomer={(c) => {
            setActiveTab('customers');
          }}
          onSelectOrder={(o) => {
            setActiveTab('orders');
          }}
          onOpenMobileMenu={() => setMobileOpen(true)}
          userName={profile.activeUser}
          userRole={`${profile.subtitle} / ${activeRole}`}
        />

        <StorageAlertBanner message={storageAlert} onDismiss={() => setStorageAlert(null)} />

        {/* Dynamic View Scroll Container */}
        <main ref={mainContentRef} className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 bg-chevron-pattern w-full overscroll-contain">
          {activeTab === 'dashboard' && (
            <DashboardView
              customers={customers}
              orders={orders}
              fittings={fittings}
              userName={profile.activeUser}
              setActiveTab={setActiveTab}
              onNewOrder={() => {
                setEditingOrder(null);
                setPreselectedCustomerForOrder(null);
                setIsOrderModalOpen(true);
              }}
              onNewCustomer={() => {
                setEditingCustomer(null);
                setIsCustomerModalOpen(true);
              }}
              onNewMeasurement={() => {
                setEditingMeasurement(null);
                setPreselectedCustomerForMeasurement(null);
                setIsMeasurementModalOpen(true);
              }}
              onNewFitting={() => setActiveTab('fittings')}
              onSelectOrder={(o) => {
                setSelectedOrderForDetail(o);
                setIsOrderDetailModalOpen(true);
              }}
            />
          )}

          {activeTab === 'customers' && (
            <CustomersView
              customers={customers}
              orders={orders}
              measurements={measurements}
              onAddCustomer={() => {
                setEditingCustomer(null);
                setIsCustomerModalOpen(true);
              }}
              onEditCustomer={(c) => {
                setEditingCustomer(c);
                setIsCustomerModalOpen(true);
              }}
              onDeleteCustomer={handleDeleteCustomer}
              onViewMeasurements={(c) => {
                setPreselectedCustomerForMeasurement(c);
                setIsMeasurementModalOpen(true);
              }}
              onCreateOrderForCustomer={(c) => {
                setEditingOrder(null);
                setPreselectedCustomerForOrder(c);
                setIsOrderModalOpen(true);
              }}
              onSelectCustomerProfile={(c) => {
                setSelectedCustomerProfile(c);
                setIsCustomerProfileModalOpen(true);
              }}
            />
          )}

          {activeTab === 'measurements' && (
            <MeasurementsView
              measurements={measurements}
              customers={customers}
              onNewMeasurement={() => {
                setEditingMeasurement(null);
                setPreselectedCustomerForMeasurement(null);
                setIsMeasurementModalOpen(true);
              }}
              onEditMeasurement={(m) => {
                setEditingMeasurement(m);
                setIsMeasurementModalOpen(true);
              }}
              onDeleteMeasurement={handleDeleteMeasurement}
            />
          )}

          {activeTab === 'orders' && (
            <OrdersView
              orders={orders}
              onNewOrder={() => {
                setEditingOrder(null);
                setPreselectedCustomerForOrder(null);
                setIsOrderModalOpen(true);
              }}
              onEditOrder={(o) => {
                setEditingOrder(o);
                setIsOrderModalOpen(true);
              }}
              onDeleteOrder={handleDeleteOrder}
              onUpdateOrderStatus={handleUpdateOrderStatus}
              onSelectOrder={(o) => {
                setSelectedOrderForDetail(o);
                setIsOrderDetailModalOpen(true);
              }}
              onPrintProductionSlip={handleOpenPrintProductionSlip}
            />
          )}

          {activeTab === 'productionslips' && (
            <ProductionSlipsView
              orders={orders}
              onSelectProductionSlip={handleOpenProductionSlipDetail}
              onPrintProductionSlip={handleOpenPrintProductionSlip}
              onPrintBill={handleOpenPrintBill}
              onViewOrderDetails={(o) => {
                setSelectedOrderForDetail(o);
                setIsOrderDetailModalOpen(true);
              }}
              onUpdateProductionStatus={handleUpdateProductionStatus}
            />
          )}

          {activeTab === 'fittings' && (
            <FittingsView
              fittings={fittings}
              onNewFitting={() => {
                if (orders.length === 0) return alert('No orders found to schedule fitting.');
                const ord = orders[0];
                const newFit: Fitting = {
                  id: `FIT-${Math.floor(100 + Math.random() * 900)}`,
                  orderId: ord.id,
                  customerName: ord.customerName,
                  customerPhone: ord.customerPhone,
                  garment: ord.items.map(i => i.garmentType).join(', '),
                  trialStage: 'Second Trial',
                  scheduledDate: new Date().toISOString().split('T')[0],
                  scheduledTime: '02:00 PM',
                  status: 'Scheduled',
                  adjustmentNotes: 'Fine tune shoulder padding and sleeve pitch.'
                };
                setFittings(prev => [newFit, ...prev]);
              }}
              onUpdateFittingStatus={handleUpdateFittingStatus}
              onDeleteFitting={handleDeleteFitting}
            />
          )}

          {activeTab === 'workers' && (
            <WorkersView
              workers={workers}
              onAddWorker={() => {
                const name = prompt('Enter Artisan / Staff Name:');
                if (name) {
                  const newW: Worker = {
                    id: `WRK-${Math.floor(100 + Math.random() * 900)}`,
                    name,
                    role: 'Coat Specialist',
                    phone: '+91 98000 11223',
                    type: 'Piece-Rate',
                    ratePerGarment: 3000,
                    monthlySalary: 0,
                    garmentsCompletedThisMonth: 0,
                    totalEarned: 0,
                    advanceTaken: 0,
                    balancePayout: 0,
                    status: 'Active'
                  };
                  setWorkers(prev => [...prev, newW]);
                }
              }}
              onRecordAdvance={handleRecordAdvance}
              onMarkPayoutPaid={handleMarkPayoutPaid}
            />
          )}

          {activeTab === 'billings' && (
            <BillingsView
              invoices={invoices}
              profile={profile}
              orders={orders}
              onPrintBill={handleOpenPrintBill}
              onNewInvoice={() => {
                if (orders.length === 0) return;
                const ord = orders[0];
                const newInv: Invoice = {
                  id: `INV-REG-${Math.floor(1000 + Math.random() * 9000)}`,
                  orderId: ord.id,
                  customerName: ord.customerName,
                  customerPhone: ord.customerPhone,
                  date: new Date().toISOString().split('T')[0],
                  items: ord.items.map(i => ({
                    description: `${i.garmentType} Bespoke Crafting`,
                    qty: 1,
                    rate: i.price,
                    amount: i.price
                  })),
                  subtotal: ord.totalAmount,
                  gstAmount: Math.round(ord.totalAmount * 0.05),
                  discount: 0,
                  grandTotal: ord.totalAmount,
                  amountPaid: ord.advancePaid,
                  balanceRemaining: ord.balanceDue,
                  paymentMode: 'Cash',
                  status: ord.balanceDue === 0 ? 'Paid' : 'Partial'
                };
                setInvoices(prev => [newInv, ...prev]);
              }}
              onRecordPayment={handleRecordPayment}
            />
          )}

          {activeTab === 'finances' && (
            <FinancesView
              invoices={invoices}
              expenses={expenses}
              onAddExpense={handleAddExpense}
            />
          )}

          {activeTab === 'backup' && (
            <BackupView
              invoices={invoices}
              customers={customers}
              orders={orders}
              measurements={measurements}
              fittings={fittings}
              workers={workers}
                    expenses={expenses}
              trash={trash}
              profile={profile}
              onRestoreBackup={handleRestoreBackup}
            />
          )}

          {activeTab === 'trash' && (
            <TrashView
              trashItems={trash}
              onRestoreItem={handleRestoreItem}
              onPermanentDelete={handlePermanentDelete}
              onEmptyTrash={handleEmptyTrash}
            />
          )}
        </main>
      </div>

      {/* Client Portal Modal */}
      <ClientPortalModal
        isOpen={clientPortalOpen}
        onClose={() => setClientPortalOpen(false)}
        orders={orders}
        measurements={measurements}
        customers={customers}
      />

      {/* Customer Form Modal */}
      <CustomerModal
        isOpen={isCustomerModalOpen}
        onClose={() => setIsCustomerModalOpen(false)}
        onSave={handleSaveCustomer}
        initialCustomer={editingCustomer}
      />

      {/* Order Form Modal (6-step Bespoke Order Wizard) */}
      <OrderModal
        isOpen={isOrderModalOpen}
        onClose={() => setIsOrderModalOpen(false)}
        onSave={handleSaveOrder}
        customers={customers}
        workers={workers}
        measurements={measurements}
        allMeasurements={measurements}
        existingOrders={orders}
        orders={orders}
        trashItems={trash}
        onAddCustomer={handleSaveCustomer}
        initialOrder={editingOrder}
        preselectedCustomer={preselectedCustomerForOrder}
        onViewOrderDetails={(o) => {
          setIsOrderModalOpen(false);
          setSelectedOrderForDetail(o);
          setIsOrderDetailModalOpen(true);
        }}
        onPrintProductionSlip={handleOpenPrintProductionSlip}
        onPrintBill={handleOpenPrintBill}
      />

      {/* Order Dossier Detail Modal */}
      <OrderDetailModal
        isOpen={isOrderDetailModalOpen}
        onClose={() => {
          setIsOrderDetailModalOpen(false);
          setSelectedOrderForDetail(null);
        }}
        order={selectedOrderForDetail}
        customer={customers.find(c => c.id === selectedOrderForDetail?.customerId) || null}
        measurements={measurements}
        fittings={fittings}
        onUpdateStatus={handleUpdateOrderStatus}
        onEditOrder={(order) => {
          setEditingOrder(order);
          setIsOrderModalOpen(true);
        }}
        onPrintProductionSlip={handleOpenPrintProductionSlip}
      />

      {/* Customer Profile Modal */}
      <CustomerProfileModal
        isOpen={isCustomerProfileModalOpen}
        onClose={() => {
          setIsCustomerProfileModalOpen(false);
          setSelectedCustomerProfile(null);
        }}
        customer={selectedCustomerProfile}
        orders={orders}
        measurements={measurements}
        fittings={fittings}
        onNewOrderForCustomer={(c) => {
          setEditingOrder(null);
          setPreselectedCustomerForOrder(c);
          setIsOrderModalOpen(true);
        }}
        onNewMeasurementForCustomer={(c) => {
          setEditingMeasurement(null);
          setPreselectedCustomerForMeasurement(c);
          setIsMeasurementModalOpen(true);
        }}
        onSelectOrder={(ord) => {
          setSelectedOrderForDetail(ord);
          setIsOrderDetailModalOpen(true);
        }}
        onEditCustomer={(c) => {
          setEditingCustomer(c);
          setIsCustomerModalOpen(true);
        }}
      />

      {/* Measurement Form Modal */}
      <MeasurementModal
        isOpen={isMeasurementModalOpen}
        onClose={() => setIsMeasurementModalOpen(false)}
        onSave={handleSaveMeasurement}
        customers={customers}
        allMeasurements={measurements}
        onAddCustomer={handleSaveCustomer}
        initialMeasurement={editingMeasurement}
        preselectedCustomer={preselectedCustomerForMeasurement}
      />

      {/* Production Slip Detail Modal */}
      <ProductionSlipDetailModal
        isOpen={isProductionSlipDetailOpen}
        onClose={() => {
          setIsProductionSlipDetailOpen(false);
          setSelectedOrderForSlipDetail(null);
        }}
        order={selectedOrderForSlipDetail}
        onUpdateProductionStatus={handleUpdateProductionStatus}
        onUpdateProductionNotes={handleUpdateProductionNotes}
        onPrintProductionSlip={handleOpenPrintProductionSlip}
        onPrintBill={handleOpenPrintBill}
        onViewOrderDetails={(o) => {
          setSelectedOrderForDetail(o);
          setIsOrderDetailModalOpen(true);
        }}
      />

      {/* Print Production Slip Modal */}
      <PrintProductionSlipModal
        isOpen={isPrintProductionSlipOpen}
        onClose={() => {
          setIsPrintProductionSlipOpen(false);
          setSelectedOrderForPrintSlip(null);
        }}
        order={selectedOrderForPrintSlip}
      />

      {/* Print Bill Modal */}
      <PrintBillModal
        isOpen={isPrintBillOpen}
        onClose={() => {
          setIsPrintBillOpen(false);
          setSelectedOrderForPrintBill(null);
        }}
        order={selectedOrderForPrintBill}
        profile={profile}
      />
    </div>
  );
}
