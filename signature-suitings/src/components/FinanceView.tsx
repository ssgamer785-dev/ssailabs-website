/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from "react";
import { 
  TrendingUp, 
  Coins, 
  Plus, 
  Trash2, 
  Filter, 
  Calendar, 
  PieChart as PieIcon, 
  BarChart as BarIcon, 
  Download, 
  Printer, 
  Calculator, 
  Percent, 
  TrendingDown, 
  Info, 
  X, 
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  ShieldAlert,
  DownloadCloud,
  Layers,
  ShoppingBag,
  DollarSign
} from "lucide-react";
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  BarChart, 
  Bar, 
  PieChart, 
  Cell, 
  Pie, 
  CartesianGrid, 
  Legend,
  LineChart,
  Line
} from "recharts";
import { db } from "../db";
import { Expense, Invoice, Order, ExpenseCategory } from "../types";
import ConfirmModal from "./ConfirmModal";

// Helper to filter dates relative to local system date July 1st, 2026
const getFilterDateRange = (
  filterType: string, 
  customStart?: string, 
  customEnd?: string
): { start: Date, end: Date } => {
  const now = new Date("2026-07-01T02:30:31-07:00");
  let start = new Date(0); // All time start (Epoch)
  let end = new Date("2099-12-31T23:59:59");

  if (filterType === "this_month") {
    start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  } else if (filterType === "last_month") {
    start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0);
    end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
  } else if (filterType === "this_quarter") {
    const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
    start = new Date(now.getFullYear(), quarterStartMonth, 1, 0, 0, 0);
    end = new Date(now.getFullYear(), quarterStartMonth + 3, 0, 23, 59, 59);
  } else if (filterType === "this_year") {
    start = new Date(now.getFullYear(), 0, 1, 0, 0, 0);
    end = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
  } else if (filterType === "custom" && customStart && customEnd) {
    start = new Date(customStart + "T00:00:00");
    end = new Date(customEnd + "T23:59:59");
  }

  return { start, end };
};

export default function FinanceView() {
  // --- DB REFRESH STATES ---
  const [invoices, setInvoices] = useState(db.getInvoices());
  const [expenses, setExpenses] = useState(db.getExpenses());
  const [orders, setOrders] = useState(db.getOrders());

  // --- FILTER STATES ---
  const [dateFilter, setDateFilter] = useState<"all_time" | "this_month" | "last_month" | "this_quarter" | "this_year" | "custom">("all_time");
  const [customStartDate, setCustomStartDate] = useState("2026-01-01");
  const [customEndDate, setCustomEndDate] = useState("2026-12-31");

  // --- INTERACTIVE UI STATES ---
  const [isLoading, setIsLoading] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isPrintReportOpen, setIsPrintReportOpen] = useState(false);

  // --- CUSTOM CONFIRM MODAL STATE ---
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: "danger" | "warning" | "info";
    onConfirm: () => void;
    onCancel?: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  // --- EXPENSE FORM STATE ---
  const [expCategory, setExpCategory] = useState<ExpenseCategory>("Fabric Purchase");
  const [expSupplier, setExpSupplier] = useState("");
  const [expAmount, setExpAmount] = useState(12500);
  const [expDate, setExpDate] = useState("2026-07-01");
  const [expPmtMethod, setExpPmtMethod] = useState<"Cash" | "UPI" | "Card" | "Bank Transfer">("Bank Transfer");

  // Simulate loading skeleton transition on filter shift for supreme UX
  useEffect(() => {
    setIsLoading(true);
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [dateFilter, customStartDate, customEndDate]);

  // Sync DB records
  const refreshDb = () => {
    setInvoices(db.getInvoices());
    setExpenses(db.getExpenses());
    setOrders(db.getOrders());
  };

  useEffect(() => {
    refreshDb();
    return db.onSync(refreshDb);
  }, []);

  // --- COMPUTE LEGACY FIELD ADAPTERS ---
  const getSupplierName = (exp: Expense) => {
    if (exp.supplier) return exp.supplier;
    if (exp.notes) {
      const match = exp.notes.match(/Supplier\/Payee:\s*([^|]+)/i);
      if (match && match[1]) return match[1].trim();
    }
    // Fallbacks based on category type
    if (exp.category === "Fabric Purchase") return "Loro Piana & Raymond Mills";
    if (exp.category === "Tailoring Wages") return "Showroom Tailor Stitching Masters";
    if (exp.category === "Rent") return "Main Street Commercial Complex";
    if (exp.category === "Utilities") return "Punjab State Power Corp";
    return "Showroom General Vendor";
  };

  const getPaymentMethod = (exp: Expense) => {
    if (exp.paymentMethod) return exp.paymentMethod;
    if (exp.notes) {
      const match = exp.notes.match(/Paid via\s*(.+)/i);
      if (match && match[1]) return match[1].trim();
    }
    return "Bank Transfer";
  };

  const getCustomerName = (customerId: string) => {
    const cust = db.getCustomers().find(c => c.id === customerId);
    return cust ? cust.fullName : "Bespoke Client";
  };

  // --- FILTERED COLLECTIONS ---
  const filteredData = useMemo(() => {
    const { start, end } = getFilterDateRange(dateFilter, customStartDate, customEndDate);

    const checkDateInRange = (dateStr: string) => {
      if (!dateStr) return false;
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return false;
      return d >= start && d <= end;
    };

    const invs = invoices.filter(i => checkDateInRange(i.invoiceDate));
    const exps = expenses.filter(e => checkDateInRange(e.date));
    const ords = orders.filter(o => checkDateInRange(o.orderDate));

    return { invs, exps, ords };
  }, [invoices, expenses, orders, dateFilter, customStartDate, customEndDate]);

  // --- KPI COMPUTATIONS ---
  const kpis = useMemo(() => {
    const revenue = filteredData.invs.reduce((sum, inv) => sum + (inv.grandTotal - inv.balanceDue), 0);
    const outflow = filteredData.exps.reduce((sum, exp) => sum + exp.amount, 0);
    const netProfit = revenue - outflow;
    const receivables = filteredData.invs.reduce((sum, inv) => sum + inv.balanceDue, 0);
    const margin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

    return {
      revenue,
      expenses: outflow,
      netProfit,
      receivables,
      margin
    };
  }, [filteredData]);

  // --- MONTHLY SUMMARY TABLE CALCULATOR ---
  const monthlySummaries = useMemo(() => {
    const summaries: Record<string, { monthName: string, revenue: number, receivables: number, ordersCount: number }> = {};

    filteredData.invs.forEach(inv => {
      if (!inv.invoiceDate) return;
      const date = new Date(inv.invoiceDate);
      if (isNaN(date.getTime())) return;
      const year = date.getFullYear();
      const month = date.getMonth();
      const key = `${year}-${String(month + 1).padStart(2, "0")}`;
      const monthName = date.toLocaleDateString("en-IN", { month: "long", year: "numeric" });

      if (!summaries[key]) {
        summaries[key] = { monthName, revenue: 0, receivables: 0, ordersCount: 0 };
      }
      summaries[key].revenue += (inv.grandTotal - inv.balanceDue);
      summaries[key].receivables += inv.balanceDue;
    });

    filteredData.ords.forEach(ord => {
      if (!ord.orderDate) return;
      const date = new Date(ord.orderDate);
      if (isNaN(date.getTime())) return;
      const year = date.getFullYear();
      const month = date.getMonth();
      const key = `${year}-${String(month + 1).padStart(2, "0")}`;
      const monthName = date.toLocaleDateString("en-IN", { month: "long", year: "numeric" });

      if (!summaries[key]) {
        summaries[key] = { monthName, revenue: 0, receivables: 0, ordersCount: 0 };
      }
      summaries[key].ordersCount += 1;
    });

    return Object.entries(summaries)
      .map(([key, val]) => ({
        monthKey: key,
        monthName: val.monthName,
        revenue: val.revenue,
        receivables: val.receivables,
        ordersCount: val.ordersCount
      }))
      .sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  }, [filteredData]);

  // --- CHART 1: MONTHLY REVENUE TREND ---
  const chartRevenueTrend = useMemo(() => {
    const monthsMap: Record<string, number> = {};
    const now = new Date("2026-07-01");
    // Prepopulate last 6 calendar months
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
      monthsMap[key] = 0;
    }

    filteredData.invs.forEach(inv => {
      if (!inv.invoiceDate) return;
      const d = new Date(inv.invoiceDate);
      if (isNaN(d.getTime())) return;
      const key = d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
      monthsMap[key] = (monthsMap[key] || 0) + (inv.grandTotal - inv.balanceDue);
    });

    return Object.entries(monthsMap)
      .map(([name, Revenue]) => ({ name, Revenue }))
      .sort((a, b) => {
        const parseDate = (s: string) => {
          const [m, y] = s.split(" ");
          return new Date(`01 ${m} 20${y}`);
        };
        return parseDate(a.name).getTime() - parseDate(b.name).getTime();
      });
  }, [filteredData]);

  // --- CHART 2: ORDERS PLACED PER MONTH ---
  const chartOrdersTrend = useMemo(() => {
    const monthsMap: Record<string, number> = {};
    const now = new Date("2026-07-01");
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
      monthsMap[key] = 0;
    }

    filteredData.ords.forEach(ord => {
      if (!ord.orderDate) return;
      const d = new Date(ord.orderDate);
      if (isNaN(d.getTime())) return;
      const key = d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
      monthsMap[key] = (monthsMap[key] || 0) + 1;
    });

    return Object.entries(monthsMap)
      .map(([name, Orders]) => ({ name, Orders }))
      .sort((a, b) => {
        const parseDate = (s: string) => {
          const [m, y] = s.split(" ");
          return new Date(`01 ${m} 20${y}`);
        };
        return parseDate(a.name).getTime() - parseDate(b.name).getTime();
      });
  }, [filteredData]);

  // --- CHART 3: TOP 10 CUSTOMERS BY SPEND ---
  const chartTopCustomers = useMemo(() => {
    const customerSpend: Record<string, number> = {};
    filteredData.invs.forEach(inv => {
      customerSpend[inv.customerId] = (customerSpend[inv.customerId] || 0) + (inv.grandTotal - inv.balanceDue);
    });

    const customersList = db.getCustomers();
    const data = Object.entries(customerSpend).map(([custId, spend]) => {
      const cust = customersList.find(c => c.id === custId);
      return {
        name: cust ? cust.fullName : "Bespoke Client",
        Spend: spend
      };
    });

    return data.sort((a, b) => b.Spend - a.Spend).slice(0, 10);
  }, [filteredData]);

  // --- CHART 4: GARMENT TYPE POPULARITY ---
  const chartGarmentPopularity = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredData.ords.forEach(ord => {
      if (Array.isArray(ord.garmentTypes)) {
        ord.garmentTypes.forEach(g => {
          counts[g] = (counts[g] || 0) + 1;
        });
      }
    });

    const colors = ["#0B1F3A", "#C9A24B", "#132A4C", "#E8D5A3", "#475569", "#78716C"];
    return Object.entries(counts).map(([name, value], idx) => ({
      name,
      value,
      color: colors[idx % colors.length]
    }));
  }, [filteredData]);

  // --- CHART 5: AVERAGE ORDER VALUE TREND ---
  const chartAvgOrderValue = useMemo(() => {
    const revTrend = chartRevenueTrend;
    const ordTrend = chartOrdersTrend;

    return revTrend.map(r => {
      const o = ordTrend.find(item => item.name === r.name);
      const ordersCount = o ? o.Orders : 0;
      const value = ordersCount > 0 ? Math.round(r.Revenue / ordersCount) : 0;
      return {
        name: r.name,
        "Avg Order Value": value
      };
    });
  }, [chartRevenueTrend, chartOrdersTrend]);

  // --- CHART 6: PENDING VS DELIVERED ORDERS ---
  const chartPendingVsDelivered = useMemo(() => {
    let pending = 0;
    let delivered = 0;
    filteredData.ords.forEach(ord => {
      if (ord.status === "Delivered") {
        delivered++;
      } else {
        pending++;
      }
    });

    return [
      { name: "Pending", value: pending, color: "#C9A24B" },
      { name: "Delivered", value: delivered, color: "#0B1F3A" }
    ];
  }, [filteredData]);

  // --- OPERATIONS: LOG VOUCHER ---
  const handleAddExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!expSupplier.trim()) {
      setConfirmModal({
        isOpen: true,
        title: "Input Required",
        message: "Please specify supplier / payee description.",
        confirmLabel: "Understood",
        variant: "warning",
        onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
      });
      return;
    }
    if (expAmount <= 0) {
      setConfirmModal({
        isOpen: true,
        title: "Invalid Amount",
        message: "Please specify a valid numeric amount.",
        confirmLabel: "Understood",
        variant: "warning",
        onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
      });
      return;
    }

    db.addExpense({
      category: expCategory,
      amount: expAmount,
      date: expDate,
      supplier: expSupplier,
      paymentMethod: expPmtMethod,
      notes: `Direct Voucher | Payee: ${expSupplier} | Disbursement: ${expPmtMethod}`
    });

    setConfirmModal({
      isOpen: true,
      title: "Voucher Registered",
      message: "Operational expense voucher has been registered successfully in the showroom finance ledgers.",
      confirmLabel: "Understood",
      variant: "info",
      onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
    });
    refreshDb();
    setIsExpenseModalOpen(false);

    // Reset
    setExpSupplier("");
    setExpAmount(12500);
    setExpCategory("Fabric Purchase");
  };

  const handleDeleteExpense = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Delete Expense Voucher",
      message: "Are you sure you want to delete this expense voucher? This will permanently remove the record from the operational disbursements log.",
      confirmLabel: "Delete Voucher",
      cancelLabel: "Cancel",
      variant: "danger",
      onConfirm: () => {
        db.deleteExpense(id);
        refreshDb();
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      },
      onCancel: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
    });
  };

  // --- DATA EXPORT FORMATTER ---
  const exportToCSV = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    
    csvContent += "SIGNATURE SUITINGS FINANCIAL STATEMENT REPORT\n";
    csvContent += `Generated At: ${new Date().toLocaleDateString("en-IN")}\n`;
    csvContent += `Scope Filtering: ${dateFilter.toUpperCase()}\n\n`;

    csvContent += "FINANCIAL SCORECARDS KPIs\n";
    csvContent += `Gross Deposits Intake,INR ${kpis.revenue}\n`;
    csvContent += `Total Outstanding Receivables,INR ${kpis.receivables}\n`;
    csvContent += `Total Booked Orders,${filteredData.ords.length}\n\n`;

    csvContent += "MONTHLY FINANCIAL SUMMARIES\n";
    csvContent += "Month,Gross Intake,Pending Receivables,Booked Orders\n";
    monthlySummaries.forEach(s => {
      csvContent += `"${s.monthName}",${s.revenue},${s.receivables},${s.ordersCount}\n`;
    });
    csvContent += "\n";

    csvContent += "RECENT SHOWROOM INVOICES DETAIL\n";
    csvContent += "Invoice Number,Customer Name,Grand Total,Received Advance,Balance Due,Date\n";
    filteredData.invs.forEach(inv => {
      csvContent += `"${inv.invoiceNumber}","${getCustomerName(inv.customerId)}",${inv.grandTotal},${inv.grandTotal - inv.balanceDue},${inv.balanceDue},"${new Date(inv.invoiceDate).toLocaleDateString("en-IN")}"\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Signature_Suitings_Financials_${dateFilter}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- SKELETON & EMPTY STATE TEMPLATES ---
  const ChartSkeleton = () => (
    <div className="w-full h-56 bg-cream/20 rounded-2xl animate-pulse flex flex-col items-center justify-center space-y-2">
      <RefreshCw className="w-5 h-5 text-gold/60 animate-spin" />
      <span className="text-[10px] font-medium text-muted-grey">Calculating business intelligence metrics...</span>
    </div>
  );

  const ChartEmptyState = ({ title }: { title: string }) => (
    <div className="w-full h-56 bg-cream/10 rounded-2xl border border-dashed border-light flex flex-col items-center justify-center text-center p-4">
      <Info className="w-5 h-5 text-gold/70 mb-1.5" />
      <span className="text-[11px] font-bold text-navy uppercase tracking-wider">{title}</span>
      <p className="text-[9px] text-muted-grey mt-0.5 max-w-xs">No entries matching the current filter scope exist in the showroom journal.</p>
    </div>
  );

  return (
    <div className="space-y-6 font-sans text-xs">
      
      {/* =====================================================================
          1. HEADER PANEL & DATE SCOPE FILTER
      ===================================================================== */}
      <div className="bg-white rounded-3xl border border-light shadow-sm p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 animate-fade-in print:hidden">
        <div className="space-y-1">
          <h1 className="text-2xl font-sans text-navy font-bold flex items-center gap-2">
            <Coins className="w-6 h-6 text-gold" />
            Showroom Financials & Charts
          </h1>
          <p className="text-muted-grey text-sm">Real-time charts of client suit bookings, fabric drape preferences, and operational expense vouchers</p>
        </div>

        {/* Date Filters Menu */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex bg-cream p-1 rounded-xl border border-light text-[10px]">
            <button 
              onClick={() => setDateFilter("all_time")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${dateFilter === "all_time" ? "bg-white text-navy shadow-xs" : "text-charcoal hover:text-navy"}`}
            >
              All Time
            </button>
            <button 
              onClick={() => setDateFilter("this_month")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${dateFilter === "this_month" ? "bg-white text-navy shadow-xs" : "text-charcoal hover:text-navy"}`}
            >
              This Month
            </button>
            <button 
              onClick={() => setDateFilter("last_month")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${dateFilter === "last_month" ? "bg-white text-navy shadow-xs" : "text-charcoal hover:text-navy"}`}
            >
              Last Month
            </button>
            <button 
              onClick={() => setDateFilter("this_quarter")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${dateFilter === "this_quarter" ? "bg-white text-navy shadow-xs" : "text-charcoal hover:text-navy"}`}
            >
              This Quarter
            </button>
            <button 
              onClick={() => setDateFilter("this_year")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${dateFilter === "this_year" ? "bg-white text-navy shadow-xs" : "text-charcoal hover:text-navy"}`}
            >
              This Year
            </button>
            <button 
              onClick={() => setDateFilter("custom")}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${dateFilter === "custom" ? "bg-white text-navy shadow-xs" : "text-charcoal hover:text-navy"}`}
            >
              Custom
            </button>
          </div>

          {/* Custom Date Form */}
          {dateFilter === "custom" && (
            <div className="flex items-center gap-2 bg-cream p-1.5 rounded-xl border border-light">
              <input 
                type="date" 
                value={customStartDate} 
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="bg-white px-2 py-1 rounded-md border border-light text-[9px] focus:outline-hidden"
              />
              <span className="text-muted-grey text-[9px] font-bold">to</span>
              <input 
                type="date" 
                value={customEndDate} 
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="bg-white px-2 py-1 rounded-md border border-light text-[9px] focus:outline-hidden"
              />
            </div>
          )}

          <div className="flex items-center gap-2">
            <button 
              onClick={exportToCSV}
              className="bg-cream hover:bg-cream/80 text-navy font-semibold px-4 py-2 rounded-xl border border-light shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-gold" />
              Export Excel/CSV
            </button>

            <button 
              onClick={() => setIsPrintReportOpen(true)}
              className="bg-cream hover:bg-cream/80 text-navy font-semibold px-4 py-2 rounded-xl border border-light shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-gold" />
              Print Ledger Report
            </button>
          </div>
        </div>
      </div>

      {/* =====================================================================
          2. FINANCIAL OVERVIEW KPIS
      ===================================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 print:hidden">
        
        {/* KPI: Revenue */}
        <div className="bg-white rounded-3xl border border-light p-5 space-y-2 relative overflow-hidden shadow-xs">
          <div className="flex justify-between items-start">
            <span className="text-muted-grey uppercase text-[10px] font-bold tracking-wider">Gross Deposits Intake</span>
            <div className="p-1.5 bg-green-50 rounded-lg text-green-700">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div className="space-y-0.5">
            <p className="font-sans font-bold text-navy text-2xl">₹{kpis.revenue.toLocaleString("en-IN")}</p>
            <p className="text-[10px] text-muted-grey">Actual cash advances received</p>
          </div>
        </div>

        {/* KPI: Outstanding Receivables */}
        <div className="bg-white rounded-3xl border border-light p-5 space-y-2 relative overflow-hidden shadow-xs">
          <div className="flex justify-between items-start">
            <span className="text-muted-grey uppercase text-[10px] font-bold tracking-wider">Outstanding Receivables</span>
            <div className="p-1.5 bg-amber-50 rounded-lg text-amber-700">
              <Calculator className="w-4 h-4" />
            </div>
          </div>
          <div className="space-y-0.5">
            <p className="font-sans font-bold text-navy text-2xl">₹{kpis.receivables.toLocaleString("en-IN")}</p>
            <p className="text-[10px] text-muted-grey">Pending balances on active bookings</p>
          </div>
        </div>

        {/* KPI: Total Booked Orders */}
        <div className="bg-white rounded-3xl border border-light p-5 space-y-2 relative overflow-hidden shadow-xs">
          <div className="flex justify-between items-start">
            <span className="text-muted-grey uppercase text-[10px] font-bold tracking-wider">Total Booked Orders</span>
            <div className="p-1.5 bg-blue-50 rounded-lg text-blue-700">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div className="space-y-0.5">
            <p className="font-sans font-bold text-navy text-2xl">{filteredData.ords.length}</p>
            <p className="text-[10px] text-muted-grey">Total bespoke garments commissioned</p>
          </div>
        </div>

        {/* KPI: Average Order Value (AOV) */}
        <div className="bg-white rounded-3xl border border-light p-5 space-y-2 relative overflow-hidden shadow-xs">
          <div className="flex justify-between items-start">
            <span className="text-muted-grey uppercase text-[10px] font-bold tracking-wider">Average Order Value (AOV)</span>
            <div className="p-1.5 bg-purple-50 rounded-lg text-purple-700">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="space-y-0.5">
            <p className="font-sans font-bold text-navy text-2xl">
              ₹{Math.round(filteredData.ords.length > 0 ? (filteredData.ords.reduce((sum, o) => sum + o.totalAmount, 0) / filteredData.ords.length) : 0).toLocaleString("en-IN")}
            </p>
            <p className="text-[10px] text-muted-grey">Average ticket size per booked suit</p>
          </div>
        </div>

      </div>

      {/* =====================================================================
          3. BENTO GRAPHICS CHARTS SECTION
      ===================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 print:hidden">
        
        {/* Chart 1: Monthly Revenue Trend (Line Chart) */}
        <div className="lg:col-span-8 bg-white rounded-3xl border border-light p-5 space-y-4 shadow-3xs">
          <div className="flex justify-between items-center border-b border-light pb-2.5">
            <h3 className="text-sm font-sans font-bold text-navy uppercase tracking-wider flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-gold" />
              Collected deposits monthly trend
            </h3>
            <span className="text-[9px] font-mono text-muted-grey uppercase">Monthly cumulative (₹)</span>
          </div>
          {isLoading ? <ChartSkeleton /> : (
            chartRevenueTrend.length === 0 || chartRevenueTrend.every(x => x.Revenue === 0) ? (
              <ChartEmptyState title="Collected Revenue Trend" />
            ) : (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartRevenueTrend} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#C9A24B" stopOpacity={0.35}/>
                        <stop offset="95%" stopColor="#C9A24B" stopOpacity={0.0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1ECE4" />
                    <XAxis dataKey="name" stroke="#6B7280" style={{ fontSize: 9, fontFamily: "Inter" }} />
                    <YAxis stroke="#6B7280" style={{ fontSize: 9, fontFamily: "Inter" }} tickFormatter={(val) => `₹${val >= 1000 ? (val / 1000) + "k" : val}`} />
                    <Tooltip formatter={(value) => [`₹${Number(value).toLocaleString("en-IN")}`, "Deposits Received"]} contentStyle={{ fontFamily: "Inter", fontSize: 10, borderRadius: 12, border: "1px solid #E5E0D5" }} />
                    <Area type="monotone" dataKey="Revenue" stroke="#C9A24B" strokeWidth={2.5} fillOpacity={1} fill="url(#revenueGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )
          )}
        </div>

        {/* Chart 6: Pending vs Delivered (Donut Chart) */}
        <div className="lg:col-span-4 bg-white rounded-3xl border border-light p-5 space-y-4 shadow-3xs">
          <div className="flex justify-between items-center border-b border-light pb-2.5">
            <h3 className="text-sm font-sans font-bold text-navy uppercase tracking-wider flex items-center gap-1.5">
              <PieIcon className="w-4 h-4 text-gold" />
              Order Pipeline Distribution
            </h3>
            <span className="text-[9px] font-mono text-muted-grey uppercase">Deliveries State</span>
          </div>
          {isLoading ? <ChartSkeleton /> : (
            chartPendingVsDelivered.every(x => x.value === 0) ? (
              <ChartEmptyState title="Pending vs Delivered Orders" />
            ) : (
              <div className="space-y-4">
                <div className="h-44 relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={chartPendingVsDelivered}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={65}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {chartPendingVsDelivered.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => [value, "Orders count"]} contentStyle={{ fontFamily: "Inter", fontSize: 10, borderRadius: 12, border: "1px solid #E5E0D5" }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none mt-1">
                    <span className="font-sans font-bold text-navy text-sm">
                      {chartPendingVsDelivered.reduce((s, x) => s + x.value, 0)}
                    </span>
                    <span className="text-[7px] text-muted-grey font-bold tracking-widest uppercase">Total Orders</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[9px] border-t border-light pt-3 font-semibold">
                  {chartPendingVsDelivered.map((g, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 animate-scale-up" style={{ backgroundColor: g.color }} />
                      <span className="text-charcoal">{g.name}: {g.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          )}
        </div>

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 print:hidden">
        
        {/* Chart 2: Orders Placed per Month (Bar Chart) */}
        <div className="lg:col-span-6 bg-white rounded-3xl border border-light p-5 space-y-4 shadow-3xs">
          <div className="flex justify-between items-center border-b border-light pb-2.5">
            <h3 className="text-sm font-sans font-bold text-navy uppercase tracking-wider flex items-center gap-1.5">
              <ShoppingBag className="w-4 h-4 text-gold" />
              Volume of bespoke commissions
            </h3>
            <span className="text-[9px] font-mono text-muted-grey uppercase">Monthly Orders Count</span>
          </div>
          {isLoading ? <ChartSkeleton /> : (
            chartOrdersTrend.length === 0 || chartOrdersTrend.every(x => x.Orders === 0) ? (
              <ChartEmptyState title="Monthly Bespoke Commissions" />
            ) : (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartOrdersTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1ECE4" />
                    <XAxis dataKey="name" stroke="#6B7280" style={{ fontSize: 9, fontFamily: "Inter" }} />
                    <YAxis stroke="#6B7280" style={{ fontSize: 9, fontFamily: "Inter" }} allowDecimals={false} />
                    <Tooltip formatter={(value) => [value, "Orders Booked"]} contentStyle={{ fontFamily: "Inter", fontSize: 10, borderRadius: 12, border: "1px solid #E5E0D5" }} />
                    <Bar dataKey="Orders" fill="#0B1F3A" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )
          )}
        </div>

        {/* Chart 5: Average Order Value Trend (Line Chart) */}
        <div className="lg:col-span-6 bg-white rounded-3xl border border-light p-5 space-y-4 shadow-3xs">
          <div className="flex justify-between items-center border-b border-light pb-2.5">
            <h3 className="text-sm font-sans font-bold text-navy uppercase tracking-wider flex items-center gap-1.5">
              <Calculator className="w-4 h-4 text-gold" />
              Average ticket size per order (AOV)
            </h3>
            <span className="text-[9px] font-mono text-muted-grey uppercase">Monthly AOV (₹)</span>
          </div>
          {isLoading ? <ChartSkeleton /> : (
            chartAvgOrderValue.every(x => x["Avg Order Value"] === 0) ? (
              <ChartEmptyState title="AOV Trend Analytics" />
            ) : (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartAvgOrderValue} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1ECE4" />
                    <XAxis dataKey="name" stroke="#6B7280" style={{ fontSize: 9, fontFamily: "Inter" }} />
                    <YAxis stroke="#6B7280" style={{ fontSize: 9, fontFamily: "Inter" }} tickFormatter={(val) => `₹${val >= 1000 ? (val / 1000) + "k" : val}`} />
                    <Tooltip formatter={(value) => [`₹${Number(value).toLocaleString("en-IN")}`, "AOV"]} contentStyle={{ fontFamily: "Inter", fontSize: 10, borderRadius: 12, border: "1px solid #E5E0D5" }} />
                    <Line type="monotone" dataKey="Avg Order Value" stroke="#C9A24B" strokeWidth={3} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )
          )}
        </div>

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 print:hidden">
        
        {/* Chart 3: Top 10 Customers by Spend (Horizontal Bar Chart) */}
        <div className="lg:col-span-8 bg-white rounded-3xl border border-light p-5 space-y-4 shadow-3xs">
          <div className="flex justify-between items-center border-b border-light pb-2.5">
            <h3 className="text-sm font-sans font-bold text-navy uppercase tracking-wider flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-gold" />
              Showroom Valued Clients Index (Spend)
            </h3>
            <span className="text-[9px] font-mono text-muted-grey uppercase">Top Spenders (₹)</span>
          </div>
          {isLoading ? <ChartSkeleton /> : (
            chartTopCustomers.length === 0 ? (
              <ChartEmptyState title="Top Spenders Analytics" />
            ) : (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart 
                    data={chartTopCustomers} 
                    layout="vertical" 
                    margin={{ top: 5, right: 15, left: 15, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1ECE4" />
                    <XAxis type="number" stroke="#6B7280" style={{ fontSize: 9, fontFamily: "Inter" }} tickFormatter={(val) => `₹${val >= 1000 ? (val / 1000) + "k" : val}`} />
                    <YAxis dataKey="name" type="category" stroke="#6B7280" style={{ fontSize: 8, fontFamily: "Inter" }} width={80} />
                    <Tooltip formatter={(value) => [`₹${Number(value).toLocaleString("en-IN")}`, "Deposited Spend"]} contentStyle={{ fontFamily: "Inter", fontSize: 10, borderRadius: 12, border: "1px solid #E5E0D5" }} />
                    <Bar dataKey="Spend" fill="#0B1F3A" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )
          )}
        </div>

        {/* Chart 4: Garment Type Popularity (Pie Chart) */}
        <div className="lg:col-span-4 bg-white rounded-3xl border border-light p-5 space-y-4 shadow-3xs">
          <div className="flex justify-between items-center border-b border-light pb-2.5">
            <h3 className="text-sm font-sans font-bold text-navy uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-gold" />
              Popular silhouettes volume
            </h3>
            <span className="text-[9px] font-mono text-muted-grey uppercase">Product Split</span>
          </div>
          {isLoading ? <ChartSkeleton /> : (
            chartGarmentPopularity.length === 0 ? (
              <ChartEmptyState title="Silhouettes Volume Analytics" />
            ) : (
              <div className="space-y-4">
                <div className="h-44 relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={chartGarmentPopularity}
                        cx="50%"
                        cy="50%"
                        outerRadius={65}
                        dataKey="value"
                      >
                        {chartGarmentPopularity.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => [value, "Garments Sized"]} contentStyle={{ fontFamily: "Inter", fontSize: 10, borderRadius: 12, border: "1px solid #E5E0D5" }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[9px] border-t border-light pt-3 font-semibold">
                  {chartGarmentPopularity.map((g, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 animate-scale-up" style={{ backgroundColor: g.color }} />
                      <span className="text-charcoal truncate">{g.name}: {g.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          )}
        </div>

      </div>

      {/* =====================================================================
          4. LEDGER PANELS: DEPOSITS & MONTHLY SUMMARY TABLES
      ===================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 print:hidden">
        
        {/* Dynamic Monthly Summary Table */}
        <div className="lg:col-span-5 bg-white rounded-3xl border border-light p-6 space-y-4 shadow-sm">
          <div>
            <h3 className="text-sm font-sans font-bold text-navy uppercase tracking-wider">
              Showroom deposits monthly summary
            </h3>
            <p className="text-[10px] text-muted-grey mt-0.5">Calculated dynamically from live booking intakes</p>
          </div>

          <div className="overflow-x-auto border border-light rounded-xl">
            {monthlySummaries.length === 0 ? (
              <div className="py-12 text-center text-muted-grey italic">No monthly logs recorded in this period.</div>
            ) : (
              <table className="w-full text-left font-sans border-collapse">
                <thead>
                  <tr className="bg-cream/40 text-navy font-bold border-b border-light text-[10px]">
                    <th className="p-3">Month</th>
                    <th className="p-3">Deposits Intake</th>
                    <th className="p-3">Pending Receivables</th>
                    <th className="p-3 text-right">Orders Booked</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-light text-charcoal font-medium text-[10px]">
                  {monthlySummaries.map((summary) => (
                    <tr key={summary.monthKey} className="hover:bg-cream/10 transition-colors">
                      <td className="p-3 font-semibold text-navy">{summary.monthName}</td>
                      <td className="p-3 font-mono text-green-700">₹{summary.revenue.toLocaleString("en-IN")}</td>
                      <td className="p-3 font-mono text-amber-700">₹{summary.receivables.toLocaleString("en-IN")}</td>
                      <td className="p-3 text-right font-semibold font-mono text-navy">
                        {summary.ordersCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Detailed Deposits & Invoices Table */}
        <div className="lg:col-span-7 bg-white rounded-3xl border border-light p-6 space-y-4 shadow-sm">
          <div>
            <h3 className="text-sm font-sans font-bold text-navy uppercase tracking-wider">
              Recent Invoices & Deposits Journal
            </h3>
            <p className="text-[10px] text-muted-grey mt-0.5">Showroom cash collections, pending receivables, and client invoice records</p>
          </div>

          <div className="overflow-x-auto border border-light rounded-xl">
            {filteredData.invs.length === 0 ? (
              <div className="py-12 text-center text-muted-grey italic">No booking invoice records found in this period.</div>
            ) : (
              <table className="w-full text-left font-sans border-collapse">
                <thead>
                  <tr className="bg-cream/40 text-navy font-bold border-b border-light text-[10px]">
                    <th className="p-3">Invoice No</th>
                    <th className="p-3">Customer</th>
                    <th className="p-3">Total Value</th>
                    <th className="p-3">Received Advance</th>
                    <th className="p-3">Balance Due</th>
                    <th className="p-3">Logged Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-light text-charcoal font-medium text-[10px]">
                  {filteredData.invs.slice(0, 15).map((inv) => (
                    <tr key={inv.id} className="hover:bg-cream/10 transition-colors">
                      <td className="p-3">
                        <span className="px-2.5 py-0.5 bg-cream rounded-md text-navy font-bold text-[9px] uppercase border border-light">
                          #{inv.invoiceNumber}
                        </span>
                      </td>
                      <td className="p-3 font-semibold text-navy truncate max-w-[140px]" title={getCustomerName(inv.customerId)}>
                        {getCustomerName(inv.customerId)}
                      </td>
                      <td className="p-3 font-mono text-navy font-bold">₹{inv.grandTotal.toLocaleString("en-IN")}</td>
                      <td className="p-3 font-mono text-green-700 font-bold">₹{(inv.grandTotal - inv.balanceDue).toLocaleString("en-IN")}</td>
                      <td className="p-3 font-mono text-amber-700 font-bold">₹{inv.balanceDue.toLocaleString("en-IN")}</td>
                      <td className="p-3 text-muted-grey">
                        {new Date(inv.invoiceDate).toLocaleDateString("en-IN", {
                          day: "numeric", month: "short", year: "numeric"
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

      </div>

      {/* =====================================================================
          5. EXPENSE VOUCHER CREATION MODAL
      ===================================================================== */}
      {isExpenseModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 animate-fade-in text-xs">
          <div className="bg-white rounded-3xl border border-light max-w-md w-full shadow-2xl p-6 space-y-5 animate-scale-up">
            <div className="flex justify-between items-center border-b border-light pb-3">
              <h3 className="text-base font-sans font-bold text-navy flex items-center gap-1.5">
                <Coins className="w-4 h-4 text-gold" />
                Log Operational Expense Voucher
              </h3>
              <button onClick={() => setIsExpenseModalOpen(false)} className="text-muted-grey hover:text-navy cursor-pointer">✕</button>
            </div>

            <form onSubmit={handleAddExpense} className="space-y-4">
              
              {/* Category */}
              <div className="space-y-1">
                <label className="font-semibold text-navy">Expense Category</label>
                <select 
                  value={expCategory}
                  onChange={(e: any) => setExpCategory(e.target.value)}
                  className="w-full bg-white px-3 py-2 border border-light rounded-lg focus:outline-hidden focus:border-gold"
                >
                  <option value="Fabric Purchase">Fabric Purchase (Raw Materials Import)</option>
                  <option value="Tailoring Wages">Staff Salaries & Payouts</option>
                  <option value="Rent">Showroom Rent (Showroom Lease)</option>
                  <option value="Utilities">Utilities (Broadband & Electricity)</option>
                  <option value="Miscellaneous">Miscellaneous (Hangers, Packaging, Catering)</option>
                </select>
              </div>

              {/* Supplier Payee */}
              <div className="space-y-1">
                <label className="font-semibold text-navy">Supplier Payee Name <span className="text-red-600">*</span></label>
                <input 
                  type="text" 
                  required
                  placeholder="E.g. Raymond Textile Mills, Jalandhar"
                  value={expSupplier}
                  onChange={(e) => setExpSupplier(e.target.value)}
                  className="w-full bg-white px-3 py-2 border border-light rounded-lg focus:outline-hidden focus:border-gold"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Outflow Amount */}
                <div className="space-y-1">
                  <label className="font-semibold text-navy">Voucher Outflow (₹)</label>
                  <input 
                    type="number" 
                    required
                    value={expAmount}
                    onChange={(e) => setExpAmount(Number(e.target.value))}
                    className="w-full bg-white px-3 py-2 border border-light rounded-lg focus:outline-hidden focus:border-gold font-mono"
                  />
                </div>

                {/* Date */}
                <div className="space-y-1">
                  <label className="font-semibold text-navy">Voucher Date</label>
                  <input 
                    type="date" 
                    value={expDate}
                    onChange={(e) => setExpDate(e.target.value)}
                    className="w-full bg-white px-3 py-2 border border-light rounded-lg focus:outline-hidden focus:border-gold font-sans"
                  />
                </div>
              </div>

              {/* Payment Mode */}
              <div className="space-y-1">
                <label className="font-semibold text-navy">Disbursement Mode</label>
                <select 
                  value={expPmtMethod}
                  onChange={(e: any) => setExpPmtMethod(e.target.value)}
                  className="w-full bg-white px-3 py-2 border border-light rounded-lg focus:outline-hidden focus:border-gold"
                >
                  <option value="Bank Transfer">Bank IMPS / RTGS Transfer</option>
                  <option value="UPI">Showroom QR UPI Payout</option>
                  <option value="Cash">Cash Handover</option>
                  <option value="Card">Business Credit Card</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-light">
                <button 
                  type="button" 
                  onClick={() => setIsExpenseModalOpen(false)}
                  className="bg-cream hover:bg-cream/80 text-navy font-semibold px-4 py-2 rounded-xl border border-light"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="bg-navy hover:bg-navy-hover text-white font-semibold px-5 py-2 rounded-xl"
                >
                  Log Voucher
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          6. PREMIUM PRINTABLE FINANCIAL STATEMENT REPORT PREVIEW
      ===================================================================== */}
      {isPrintReportOpen && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50 animate-fade-in text-xs font-sans print:p-0 print:bg-white print:static print:z-auto">
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[92vh] overflow-y-auto shadow-2xl p-6 space-y-6 print:p-0 print:shadow-none print:max-h-none print:overflow-visible print:border-0 print:rounded-none">
            
            {/* Action Bar */}
            <div className="flex justify-between items-center border-b border-light pb-3 print:hidden">
              <span className="font-sans font-bold text-navy text-sm">Bespoke Ledger Statement Print Preview</span>
              <div className="flex gap-2">
                <button 
                  onClick={() => window.print()}
                  className="bg-navy hover:bg-navy-hover text-white px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Printer className="w-3.5 h-3.5 text-gold" />
                  Print Report
                </button>
                <button 
                  onClick={() => setIsPrintReportOpen(false)}
                  className="bg-cream hover:bg-cream/80 text-navy px-4 py-2 rounded-xl text-xs font-semibold border border-light cursor-pointer transition-colors"
                >
                  Close
                </button>
              </div>
            </div>

            {/* Statement Slip Sheet Mockup */}
            <div className="bg-white border-2 border-charcoal p-8 text-charcoal space-y-6 max-w-[210mm] mx-auto print:border-0 print:p-0">
              
              {/* Header Letterhead */}
              <div className="text-center space-y-1.5 border-b-2 border-charcoal pb-4">
                <h1 className="text-2xl font-sans font-extrabold tracking-wider uppercase">SIGNATURE SUITINGS</h1>
                <p className="text-[10px] font-sans font-bold tracking-widest text-charcoal/80">HARDIK NAGPAL INDUSTRIES &bull; "THE SIGN OF COMFORT"</p>
                <p className="text-[9px] text-charcoal/70">
                  2, Tara Singh Avenue, Peer Dad Road, Jalandhar, Punjab, India &bull; Phones: 93572 51900, 95696 81900
                </p>
                <p className="text-[10px] font-mono font-bold uppercase text-navy pt-1">Administrative Financial Ledger & Audit Statement</p>
              </div>

              {/* Metadata details */}
              <div className="grid grid-cols-2 gap-6 text-[10px] border-b border-charcoal/40 pb-4">
                <div>
                  <p><b>Statement Period:</b> {dateFilter === "all_time" ? "Full Cumulative History" : dateFilter.toUpperCase()}</p>
                  <p><b>Audit Date:</b> {new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</p>
                  <p><b>Operational Scope:</b> Showroom Ledger Audit (Jalandhar)</p>
                </div>
                <div className="text-right">
                  <p><b>Currency:</b> INR (₹)</p>
                  <p><b>Authorized signature:</b> Hardik Nagpal (Showroom Owner)</p>
                  <p><b>State License:</b> JLD-PB-2026/8931</p>
                </div>
              </div>

              {/* KPIs Section */}
              <div className="grid grid-cols-4 gap-4 text-center">
                <div className="border border-charcoal/30 rounded-lg p-2.5">
                  <span className="text-[8px] font-bold uppercase block text-charcoal/80">Deposits Intake</span>
                  <span className="text-xs font-bold font-sans">₹{kpis.revenue.toLocaleString("en-IN")}</span>
                </div>
                <div className="border border-charcoal/30 rounded-lg p-2.5">
                  <span className="text-[8px] font-bold uppercase block text-charcoal/80">Outstanding Receivables</span>
                  <span className="text-xs font-bold font-sans">₹{kpis.receivables.toLocaleString("en-IN")}</span>
                </div>
                <div className="border border-charcoal/30 rounded-lg p-2.5">
                  <span className="text-[8px] font-bold uppercase block text-charcoal/80">Booked Orders</span>
                  <span className="text-xs font-bold font-sans">{filteredData.ords.length}</span>
                </div>
                <div className="border border-charcoal/30 rounded-lg p-2.5">
                  <span className="text-[8px] font-bold uppercase block text-charcoal/80">Average Order Value (AOV)</span>
                  <span className="text-xs font-bold font-sans">
                    ₹{Math.round(filteredData.ords.length > 0 ? (filteredData.ords.reduce((sum, o) => sum + o.totalAmount, 0) / filteredData.ords.length) : 0).toLocaleString("en-IN")}
                  </span>
                </div>
              </div>

              {/* Monthly Summaries List */}
              <div className="space-y-2">
                <h3 className="font-bold uppercase text-[9px] tracking-wider text-navy border-b border-charcoal/50 pb-1">Monthly Financial Summary Records</h3>
                <table className="w-full text-left font-sans border-collapse text-[10px]">
                  <thead>
                    <tr className="border-b border-charcoal text-[9px] font-bold">
                      <th className="py-1.5">Month</th>
                      <th className="py-1.5">Deposits Intake</th>
                      <th className="py-1.5">Pending Receivables</th>
                      <th className="py-1.5 text-right">Orders Booked</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-charcoal/20">
                    {monthlySummaries.map((s) => (
                      <tr key={s.monthKey}>
                        <td className="py-1.5 font-medium">{s.monthName}</td>
                        <td className="py-1.5 font-mono">₹{s.revenue.toLocaleString("en-IN")}</td>
                        <td className="py-1.5 font-mono">₹{s.receivables.toLocaleString("en-IN")}</td>
                        <td className="py-1.5 text-right font-mono font-bold">{s.ordersCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Outgoings Ledger table */}
              <div className="space-y-2">
                <h3 className="font-bold uppercase text-[9px] tracking-wider text-navy border-b border-charcoal/50 pb-1">Detailed Showroom Invoices Ledger</h3>
                <table className="w-full text-left font-sans border-collapse text-[10px]">
                  <thead>
                    <tr className="border-b border-charcoal text-[9px] font-bold">
                      <th className="py-1.5">Invoice No</th>
                      <th className="py-1.5">Customer Name</th>
                      <th className="py-1.5">Total Value</th>
                      <th className="py-1.5">Date</th>
                      <th className="py-1.5 text-right">Received Advance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-charcoal/20">
                    {filteredData.invs.slice(0, 15).map((inv) => (
                      <tr key={inv.id}>
                        <td className="py-1.5 font-bold uppercase text-[8px]">#{inv.invoiceNumber}</td>
                        <td className="py-1.5 font-medium">{getCustomerName(inv.customerId)}</td>
                        <td className="py-1.5 font-mono">₹{inv.grandTotal.toLocaleString("en-IN")}</td>
                        <td className="py-1.5 text-charcoal/80">{new Date(inv.invoiceDate).toLocaleDateString("en-IN")}</td>
                        <td className="py-1.5 text-right font-mono font-bold text-green-700">₹{(inv.grandTotal - inv.balanceDue).toLocaleString("en-IN")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Sign-off section */}
              <div className="border-t-2 border-charcoal pt-6 mt-6 grid grid-cols-2 gap-4 text-[9px] font-sans font-semibold text-charcoal/90">
                <div className="space-y-1">
                  <p>Declaration: This document serves as a verified extract of showroom accounting. All deposits and outgoings are certified under Hardik Nagpal Industries audit rules.</p>
                  <p className="text-[7px] text-charcoal/60">Signature Suitings &bull; Administrative Audit Statement</p>
                </div>
                <div className="flex flex-col justify-end items-end h-16 pt-4">
                  <span className="border-t border-charcoal/60 w-32 text-center text-[9px] uppercase tracking-wider text-charcoal/80 pt-1">
                    Audited & Approved
                  </span>
                </div>
              </div>

            </div>

            {/* Footer Buttons */}
            <div className="flex justify-end gap-3 print:hidden">
              <button 
                onClick={() => setIsPrintReportOpen(false)}
                className="bg-navy hover:bg-navy-hover text-white font-semibold font-sans px-5 py-2.5 rounded-xl text-xs transition-colors cursor-pointer"
              >
                Close Preview
              </button>
            </div>

          </div>
        </div>
      )}

      {/* CUSTOM CONFIRMATION MODAL */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmLabel={confirmModal.confirmLabel}
        cancelLabel={confirmModal.cancelLabel}
        variant={confirmModal.variant}
        onConfirm={confirmModal.onConfirm}
        onCancel={confirmModal.onCancel}
      />

    </div>
  );
}
