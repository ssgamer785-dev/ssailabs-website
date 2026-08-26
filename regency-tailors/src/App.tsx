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
import { RegencyBackupPayload } from './utils/backupManager';

const STORAGE_KEY = 'REGENCY_TAILORS_DB_V3';

export default function App() {
  // Persistence state setup
  const [customers, setCustomers] = useState<Customer[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_CUSTOMERS`);
    return saved ? JSON.parse(saved) : initialCustomers;
  });

  const [measurements, setMeasurements] = useState<MeasurementRecord[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_MEASUREMENTS`);
    return saved ? JSON.parse(saved) : initialMeasurements;
  });

  const [orders, setOrders] = useState<Order[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_ORDERS`);
    return saved ? JSON.parse(saved) : initialOrders;
  });

  const [fittings, setFittings] = useState<Fitting[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_FITTINGS`);
    return saved ? JSON.parse(saved) : initialFittings;
  });

  const [workers, setWorkers] = useState<Worker[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_WORKERS`);
    return saved ? JSON.parse(saved) : initialWorkers;
  });

  const [invoices, setInvoices] = useState<Invoice[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_INVOICES`);
    return saved ? JSON.parse(saved) : initialInvoices;
  });

  const [expenses, setExpenses] = useState<Expense[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_EXPENSES`);
    return saved ? JSON.parse(saved) : initialExpenses;
  });

  const [trash, setTrash] = useState<TrashItem[]>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_TRASH`);
    return saved ? JSON.parse(saved) : initialTrash;
  });

  const [profile, setProfile] = useState<ShowroomProfile>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}_PROFILE`);
    return saved ? JSON.parse(saved) : initialProfile;
  });

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
    localStorage.setItem(`${STORAGE_KEY}_CUSTOMERS`, JSON.stringify(customers));
  }, [customers]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_MEASUREMENTS`, JSON.stringify(measurements));
  }, [measurements]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_ORDERS`, JSON.stringify(orders));
  }, [orders]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_FITTINGS`, JSON.stringify(fittings));
  }, [fittings]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_WORKERS`, JSON.stringify(workers));
  }, [workers]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_INVOICES`, JSON.stringify(invoices));
  }, [invoices]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_EXPENSES`, JSON.stringify(expenses));
  }, [expenses]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_TRASH`, JSON.stringify(trash));
  }, [trash]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_PROFILE`, JSON.stringify(profile));
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
    // Keep persistent order sequence counter updated
    try {
      const numVal = parseInt(order.id, 10) || parseInt(order.orderNumber || '', 10);
      if (!isNaN(numVal)) {
        const curSaved = parseInt(localStorage.getItem(`${STORAGE_KEY}_ORDER_SEQ`) || '0', 10);
        localStorage.setItem(`${STORAGE_KEY}_ORDER_SEQ`, String(Math.max(numVal, curSaved)));
      }
    } catch {
      // ignore
    }

    setOrders(prev => {
      const exists = prev.some(o => o.id === order.id);
      if (exists) return prev.map(o => o.id === order.id ? order : o);
      return [order, ...prev];
    });

    // If order has measurements snapshot, update/create customer measurement record
    if (order.measurementsSnapshot) {
      const newMRecord: MeasurementRecord = {
        id: `M-${order.id}`,
        customerId: order.customerId,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        garmentType: (order.items || []).map(i => i.garmentType).join(', '),
        lastUpdated: new Date().toISOString().split('T')[0],
        unit: order.measurementsSnapshot.unit || 'inches',
        coat: order.measurementsSnapshot.coat,
        pant: order.measurementsSnapshot.pant,
        shirt: order.measurementsSnapshot.shirt,
        kurta: order.measurementsSnapshot.kurta,
        pajama: order.measurementsSnapshot.pajama,
        fittingNotes: order.measurementsSnapshot.fittingNotes
      };
      setMeasurements(prev => {
        const existingIdx = prev.findIndex(m => m.customerId === order.customerId);
        if (existingIdx >= 0) {
          const copy = [...prev];
          copy[existingIdx] = { ...copy[existingIdx], ...newMRecord, id: copy[existingIdx].id };
          return copy;
        }
        return [newMRecord, ...prev];
      });
    }

    // Also update customer lifetime spend & total orders
    setCustomers(prev =>
      prev.map(c => {
        if (c.id === order.customerId) {
          return {
            ...c,
            totalOrders: c.totalOrders + 1,
            lifetimeSpend: c.lifetimeSpend + order.totalAmount
          };
        }
        return c;
      })
    );

    // Auto generate corresponding invoice
    const newInvoice: Invoice = {
      id: `INV-${order.id}`,
      orderId: order.id,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      date: order.orderDate,
      items: (order.items || []).map(i => ({
        description: `${i.garmentType} (${i.fabricName || 'Bespoke'})`,
        qty: i.quantity || 1,
        rate: i.price,
        amount: i.price
      })),
      subtotal: order.subtotal || order.totalAmount,
      gstAmount: order.taxAmount || 0,
      discount: order.discount || 0,
      grandTotal: order.totalAmount,
      amountPaid: order.advancePaid,
      balanceRemaining: order.balanceDue,
      paymentMode: (order.paymentHistory?.[0]?.method as any) || (order.paymentMethod as any) || 'UPI / GPay',
      status: order.balanceDue === 0 ? 'Paid' : order.advancePaid > 0 ? 'Partial' : 'Outstanding'
    };

    setInvoices(prev => [newInvoice, ...prev.filter(i => i.orderId !== order.id)]);

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
  const handleRestoreBackup = (payload: RegencyBackupPayload) => {
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

    // 2. Immediate direct localStorage sync
    try {
      localStorage.setItem(`${STORAGE_KEY}_CUSTOMERS`, JSON.stringify(payload.customers || []));
      localStorage.setItem(`${STORAGE_KEY}_MEASUREMENTS`, JSON.stringify(payload.measurements || []));
      localStorage.setItem(`${STORAGE_KEY}_ORDERS`, JSON.stringify(payload.orders || []));
      localStorage.setItem(`${STORAGE_KEY}_FITTINGS`, JSON.stringify(payload.fittings || []));
      localStorage.setItem(`${STORAGE_KEY}_WORKERS`, JSON.stringify(payload.workers || []));
      localStorage.setItem(`${STORAGE_KEY}_INVOICES`, JSON.stringify(payload.invoices || []));
      localStorage.setItem(`${STORAGE_KEY}_EXPENSES`, JSON.stringify(payload.expenses || []));
      localStorage.setItem(`${STORAGE_KEY}_TRASH`, JSON.stringify(payload.trash || []));
      if (payload.profile) {
        localStorage.setItem(`${STORAGE_KEY}_PROFILE`, JSON.stringify(payload.profile));
      }
    } catch (e) {
      console.error('Failed to sync restored backup to localStorage', e);
    }
  };

  return (
    <div className="flex h-screen bg-[#F7F3EA] text-[#071426] overflow-hidden">
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
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
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
              onPrintBill={handleOpenPrintBill}
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
              customers={customers}
              orders={orders}
              measurements={measurements}
              fittings={fittings}
              workers={workers}
              invoices={invoices}
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
        invoices={invoices}
        onUpdateStatus={handleUpdateOrderStatus}
        onRecordPayment={handleRecordOrderPayment}
        onEditOrder={(order) => {
          setEditingOrder(order);
          setIsOrderModalOpen(true);
        }}
        onPrintProductionSlip={handleOpenPrintProductionSlip}
        onPrintBill={handleOpenPrintBill}
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
        invoices={invoices}
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
