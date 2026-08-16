/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { 
  Users, 
  ShoppingBag, 
  CalendarCheck, 
  Wallet, 
  ArrowUpRight, 
  Plus,
  UserPlus,
  FileSpreadsheet,
  CalendarDays,
  CheckCircle,
  AlertTriangle,
  TrendingUp,
  X,
  Search,
  Sparkles,
  Check,
  Flame,
  Phone,
  ExternalLink,
  CheckSquare,
  Printer,
  Receipt
} from "lucide-react";
import { Customer, Order, Invoice, Appointment } from "../types";
import { db, obfuscateData, deobfuscateData, stripEmbeddedTags } from "../db";
import ConfirmModal from "./ConfirmModal";
import { getLocalDateString } from "../utils/dateUtils";

interface DashboardViewProps {
  onNavigate: (page: string, params?: any) => void;
  onOpenQuickAction: (action: string) => void;
  currentUserRole: string;
}

export default function DashboardView({ onNavigate, onOpenQuickAction, currentUserRole }: DashboardViewProps) {
  const [dbState, setDbState] = useState({
    customers: db.getCustomers(),
    orders: db.getOrders(),
    invoices: db.getInvoices(),
    appointments: db.getAppointments(),
    expenses: db.getExpenses(),
    measurements: db.getAllMeasurements(),
    workers: db.getWorkers(),
  });

  const refreshDb = () => {
    setDbState({
      customers: db.getCustomers(),
      orders: db.getOrders(),
      invoices: db.getInvoices(),
      appointments: db.getAppointments(),
      expenses: db.getExpenses(),
      measurements: db.getAllMeasurements(),
      workers: db.getWorkers(),
    });
  };

  React.useEffect(() => {
    const unsubscribe = db.onSync(() => {
      setDbState({
        customers: db.getCustomers(),
        orders: db.getOrders(),
        invoices: db.getInvoices(),
        appointments: db.getAppointments(),
        expenses: db.getExpenses(),
        measurements: db.getAllMeasurements(),
        workers: db.getWorkers(),
      });
    });
    return unsubscribe;
  }, []);

  const handleMarkAsDelivered = (orderId: string) => {
    db.updateOrderStatus(orderId, "Delivered", currentUserRole === "Admin" ? "Hardik Nagpal" : "Showroom Staff");
    refreshDb();
  };

  // --- DATABASE EXPORT / IMPORT STATE & ACTIONS ---
  const [restoreStatus, setRestoreStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const exportToJSONBackup = () => {
    const backupData = db.getBackupData();
    const jsonStr = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `SS_Showroom_Master_Backup_${new Date().toISOString().split("T")[0]}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToExcelCSV = () => {
    const rows: string[][] = [];

    // 1. Title Header
    rows.push(["SIGNATURE SUITINGS & SHOWROOM - MASTER EXCEL EXPORT & AUTO-RESTORE SYSTEM"]);
    rows.push([`Exported on: ${new Date().toLocaleString("en-IN")}`]);
    rows.push([`Authorized Owner: Hardik Nagpal`]);
    rows.push([`Total Recorded History: 10-15 Years Safe Preservation`]);
    rows.push([]);

    // 2. Customers Section
    rows.push(["--- CUSTOMERS & OUTSTANDING BALANCES ---"]);
    rows.push(["Customer ID", "Full Name", "Mobile Number", "Email Address", "Total Orders", "Outstanding Balance (INR)", "Profile Tags", "Preferred Fabric Brands"]);
    dbState.customers.forEach((c: any) => {
      rows.push([
        c.id,
        c.fullName,
        c.mobileNumber || "N/A",
        c.emailAddress || "N/A",
        String(c.totalOrdersCount || 0),
        String(c.outstandingBalance || 0),
        (c.preferenceTags || []).join("; "),
        (c.preferredFabricBrands || []).join("; ")
      ]);
    });
    rows.push([]);

    // 3. Orders Section
    rows.push(["--- SHOWROOM ORDERS BOOK ---"]);
    rows.push(["Order Number", "Customer Name", "Garment Types", "Order Date", "Required Delivery Date", "Current Status", "Overall Priority", "Fits & Styling Preferences"]);
    dbState.orders.forEach((o: any) => {
      const cust = dbState.customers.find((c: any) => c.id === o.customerId);
      rows.push([
        o.orderNumber,
        cust ? cust.fullName : "Unknown",
        o.garmentTypes.join(" & "),
        o.orderDate,
        o.expectedDeliveryDate,
        o.status,
        o.priority || "Normal",
        (o.notes || "").replace(/[\r\n,]/g, " ")
      ]);
    });
    rows.push([]);

    // 4. Measurements Section
    rows.push(["--- BESPOKE SIZE CARDS (MEASUREMENTS) ---"]);
    rows.push([
      "Slip Number", 
      "Customer Name", 
      "Garment Type", 
      "Serial Number", 
      "Length", 
      "Chest", 
      "Waist", 
      "Hip/Seat", 
      "Neck", 
      "Tira (Shoulder)", 
      "Arms/Sleeve", 
      "Half Back (H.B.)", 
      "Center Back (C.Back)", 
      "Bicep", 
      "Front", 
      "Moda (Armhole)", 
      "Patt (Thigh)", 
      "Knee", 
      "Bottom Width", 
      "Remarks/Notes"
    ]);

    dbState.measurements.forEach((m: any) => {
      const cust = dbState.customers.find((c: any) => c.id === m.customerId);
      const custName = cust ? cust.fullName : "Unknown";

      // Coat/Indo Western
      if (m.coatIndoWestern && Object.values(m.coatIndoWestern).some(v => v !== "" && v !== undefined && v !== m.coatIndoWestern.serialNumber)) {
        rows.push([
          m.slipNumber,
          custName,
          "Coat/Indo Western",
          m.coatIndoWestern.serialNumber || "-",
          m.coatIndoWestern.length || "-",
          m.coatIndoWestern.chest || "-",
          m.coatIndoWestern.waist || "-",
          "-",
          m.coatIndoWestern.neck || "-",
          m.coatIndoWestern.tira || "-",
          m.coatIndoWestern.arms || "-",
          m.coatIndoWestern.hb || "-",
          m.coatIndoWestern.cback || "-",
          m.coatIndoWestern.bicep || "-",
          m.coatIndoWestern.front || "-",
          m.coatIndoWestern.moda || "-",
          "-",
          "-",
          "-",
          stripEmbeddedTags(m.remarks || m.designNotes || "") || "-"
        ]);
      }

      // Pent
      if (m.pent && Object.values(m.pent).some(v => v !== "" && v !== undefined && v !== m.pent.serialNumber)) {
        rows.push([
          m.slipNumber,
          custName,
          "Pent",
          m.pent.serialNumber || "-",
          m.pent.length || "-",
          "-",
          m.pent.waist || "-",
          m.pent.hips || "-",
          "-",
          "-",
          "-",
          "-",
          "-",
          "-",
          "-",
          "-",
          m.pent.patt || "-",
          m.pent.knee || "-",
          m.pent.bottom || "-",
          stripEmbeddedTags(m.remarks || m.designNotes || "") || "-"
        ]);
      }

      // Vest
      if (m.vest && Object.values(m.vest).some(v => v !== "" && v !== undefined && v !== m.vest.serialNumber)) {
        rows.push([
          m.slipNumber,
          custName,
          "Vest",
          m.vest.serialNumber || "-",
          m.vest.length || "-",
          m.vest.chest || "-",
          m.vest.waist || "-",
          m.vest.hip || "-",
          m.vest.neck || "-",
          m.vest.tira || "-",
          "-",
          "-",
          "-",
          "-",
          "-",
          "-",
          "-",
          "-",
          "-",
          stripEmbeddedTags(m.remarks || m.designNotes || "") || "-"
        ]);
      }

      // Shirt/Kurta
      if (m.shirtKurta && Object.values(m.shirtKurta).some(v => v !== "" && v !== undefined && v !== m.shirtKurta.serialNumber)) {
        rows.push([
          m.slipNumber,
          custName,
          "Shirt/Kurta",
          m.shirtKurta.serialNumber || "-",
          m.shirtKurta.length || "-",
          m.shirtKurta.chest || "-",
          m.shirtKurta.waist || "-",
          m.shirtKurta.hip || "-",
          m.shirtKurta.neck || "-",
          m.shirtKurta.tira || "-",
          m.shirtKurta.arms || "-",
          "-",
          m.shirtKurta.cback || "-",
          m.shirtKurta.bicep || "-",
          m.shirtKurta.front || "-",
          m.shirtKurta.moda || "-",
          "-",
          "-",
          "-",
          stripEmbeddedTags(m.remarks || m.designNotes || "") || "-"
        ]);
      }
    });
    rows.push([]);

    // 5. Finance Section (Invoices)
    rows.push(["--- FINANCIAL BILLING & INVOICES ---"]);
    rows.push(["Invoice Number", "Order Ref", "Customer Name", "Subtotal (INR)", "Discount (INR)", "Tax Amount (INR)", "Grand Total (INR)", "Paid Amount (INR)", "Balance Due (INR)", "Payment Method"]);
    dbState.invoices.forEach((i: any) => {
      const cust = dbState.customers.find((c: any) => c.id === i.customerId);
      rows.push([
        i.invoiceNumber,
        i.orderNumber,
        cust ? cust.fullName : "Unknown",
        String(i.subtotal || 0),
        String(i.discount || 0),
        String(i.taxAmount || 0),
        String(i.grandTotal || 0),
        String(i.advancePaid || 0),
        String(i.balanceDue || 0),
        i.payments && i.payments.length > 0 ? i.payments.map((p: any) => p.paymentMethod).join("; ") : "N/A"
      ]);
    });
    rows.push([]);

    // 6. Expenses Section
    rows.push(["--- OUTGOINGS & EXPENSES ---"]);
    rows.push(["Expense ID", "Category", "Amount (INR)", "Date", "Description", "Recorded By"]);
    dbState.expenses.forEach((e: any) => {
      rows.push([
        e.id,
        e.category,
        String(e.amount),
        e.date,
        e.description.replace(/[\r\n,]/g, " "),
        e.recordedBy || "Admin"
      ]);
    });

    // Convert to CSV string, escape commas/quotes properly
    let csvContent = rows.map(r => 
      r.map(val => {
        if (val === null || val === undefined) return '""';
        const clean = String(val).replace(/"/g, '""');
        return `"${clean}"`;
      }).join(",")
    ).join("\n");

    // Add lossless auto-restore backup payload at the bottom of the CSV
    const backupData = db.getBackupData();
    const jsonStr = JSON.stringify(backupData);
    const base64Str = obfuscateData(jsonStr);
    
    csvContent += `\n\n"--- SYSTEM DATABASE AUTO-RESTORE KEY (DO NOT DELETE OR MODIFY) ---"\n"${base64Str}"`;

    // Trigger browser download of CSV (with standard Excel BOM '\uFEFF' to preserve formatting and rupee symbol)
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `SS_Showroom_Excel_Backup_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const processBackupFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        
        if (file.name.endsWith(".json") || text.trim().startsWith("{")) {
          const parsed = JSON.parse(text);
          const result = await db.restoreBackupData(parsed);
          // Report what the cloud database confirmed it holds, not what the file claimed.
          if (result.success && result.cloudVerified) {
            const c = result.tableCounts || {};
            setRestoreStatus({
              success: true,
              message: `Showroom database restored and confirmed in the cloud: ${c.customers ?? 0} customers, ${c.orders ?? 0} orders, ${c.invoices ?? 0} bills.`
            });
            refreshDb();
          } else {
            setRestoreStatus({
              success: false,
              message: result.error || "Restoration failed. Please make sure the JSON file format matches the showroom structure."
            });
          }
        } else if (file.name.endsWith(".csv") || text.includes("SYSTEM DATABASE AUTO-RESTORE KEY")) {
          const marker = "--- SYSTEM DATABASE AUTO-RESTORE KEY (DO NOT DELETE OR MODIFY) ---";
          const index = text.indexOf(marker);
          if (index !== -1) {
            const remaining = text.substring(index + marker.length).trim();
            const base64Str = remaining.replace(/"/g, "").trim();
            try {
              let parsed: any;
              try {
                const decodedJson = deobfuscateData(base64Str);
                parsed = JSON.parse(decodedJson);
              } catch (innerErr) {
                // Fallback for older backups
                const decodedJson = decodeURIComponent(escape(atob(base64Str)));
                parsed = JSON.parse(decodedJson);
              }
              const result = await db.restoreBackupData(parsed);
              if (result.success && result.cloudVerified) {
                const c = result.tableCounts || {};
                setRestoreStatus({
                  success: true,
                  message: `Showroom database restored from the Excel backup and confirmed in the cloud: ${c.customers ?? 0} customers, ${c.orders ?? 0} orders, ${c.invoices ?? 0} bills.`
                });
                refreshDb();
              } else {
                setRestoreStatus({
                  success: false,
                  message: result.error || "Restoration failed. Please make sure the Excel CSV file contains a valid auto-restore key."
                });
              }
            } catch (err) {
              setRestoreStatus({
                success: false,
                message: "Failed to decode the embedded auto-restore key from the Excel CSV file."
              });
            }
          } else {
            setRestoreStatus({
              success: false,
              message: "The uploaded CSV/Excel file does not contain a valid system restore key. Please make sure to upload the original exported CSV containing the 'SYSTEM DATABASE AUTO-RESTORE KEY' at the bottom."
            });
          }
        } else {
          setRestoreStatus({
            success: false,
            message: "Unsupported file type. Please upload a previously exported .json Restore File or .csv Excel Backup file."
          });
        }
      } catch (err: any) {
        setRestoreStatus({
          success: false,
          message: "Failed to parse the file. Please make sure you are uploading a valid JSON or CSV backup file."
        });
      }
    };
    reader.readAsText(file);
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processBackupFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processBackupFile(file);
    }
  };

  // Quick Order modal state
  const [isQuickOrderOpen, setIsQuickOrderOpen] = useState(false);

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
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [selectedCust, setSelectedCust] = useState<Customer | null>(null);

  // Customer Form state
  const [custName, setCustName] = useState("");
  const [custMobile, setCustMobile] = useState("");
  const [custAddress, setCustAddress] = useState("");

  // Garment Selector state
  const garmentOptions = ["Coat/Indo Western", "Pent", "Vest", "Shirt/Kurta"];
  const [selectedGarments, setSelectedGarments] = useState<Record<string, boolean>>({
    "Coat/Indo Western": false,
    "Pent": false,
    "Vest": false,
    "Shirt/Kurta": false,
  });

  // Measurement values state
  const emptyCoat = { length: "", chest: "", waist: "", neck: "", tira: "", hb: "", cback: "", arms: "", bicep: "", front: "", moda: "" };
  const emptyPent = { waist: "", hips: "", patt: "", bottom: "", length: "", inlength: "", knee: "" };
  const emptyVest = { length: "", chest: "", waist: "", hip: "", tira: "", neck: "" };
  const emptyShirt = { length: "", chest: "", waist: "", hip: "", tira: "", arms: "", neck: "", cback: "", front: "", moda: "", bicep: "" };

  const [coatValues, setCoatValues] = useState(emptyCoat);
  const [pentValues, setPentValues] = useState(emptyPent);
  const [vestValues, setVestValues] = useState(emptyVest);
  const [shirtValues, setShirtValues] = useState(emptyShirt);

  const [prefNotes, setPrefNotes] = useState("");

  // Udhar state for new customer
  const [openingUdhar, setOpeningUdhar] = useState("");

  // Order & Delivery Info state
  const [tryOnDate, setTryOnDate] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [advancePaid, setAdvancePaid] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [assignedTailor, setAssignedTailor] = useState("Master Harjeet Singh");
  const [orderPriority, setOrderPriority] = useState("Normal");
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [fabricBrand, setFabricBrand] = useState("");
  const [fabricColor, setFabricColor] = useState("");
  const [lapelStyle, setLapelStyle] = useState("Notch Lapel (Standard)");
  const [ventStyle, setVentStyle] = useState("Double Vent (Side)");
  const [isPrintSlipOpen, setIsPrintSlipOpen] = useState(false);

  // Success Confirmation state
  const [successData, setSuccessData] = useState<{
    orderId: string;
    orderNumber: string;
    customerName: string;
    deliveryDate: string;
    garments: string[];
    totalAmount: number;
    advancePaid: number;
    balanceDue: number;
  } | null>(null);

  const matchedCustomers = customerSearchQuery.trim() 
    ? db.searchCustomers(customerSearchQuery) 
    : [];

  const latestMeas = selectedCust ? db.getLatestMeasurement(selectedCust.id) : undefined;

  const openQuickOrderModal = (preselectedCust?: Customer) => {
    const dTry = new Date();
    dTry.setDate(dTry.getDate() + 7);
    const dDel = new Date();
    dDel.setDate(dDel.getDate() + 14);

    const allM = db.getAllMeasurements();
    const allO = db.getOrders();
    const slipNum = `SS-${allM.length + allO.length + 1045}`;

    setTryOnDate(dTry.toISOString().split("T")[0]);
    setDeliveryDate(dDel.toISOString().split("T")[0]);
    setSerialNumber(slipNum);
    setOrderPriority("Normal");
    
    const activeWorkers = dbState.workers.filter(w => w.active);
    setAssignedTailor(activeWorkers.length > 0 ? activeWorkers[0].name : "Master Harjeet Singh");
    setPaymentMode("Cash");
    setFabricBrand("");
    setFabricColor("");
    setLapelStyle("Notch Lapel (Standard)");
    setVentStyle("Double Vent (Side)");

    if (preselectedCust) {
      handleSelectCustomer(preselectedCust);
    } else {
      setSelectedGarments({
        "Coat/Indo Western": true,
        "Pent": true,
        "Vest": false,
        "Shirt/Kurta": false,
      });
    }
    setIsQuickOrderOpen(true);
  };

  const applyGarmentPreset = (preset: "2pc" | "3pc" | "shirt_pent" | "kurta" | "coat" | "pent" | "shirt") => {
    if (preset === "2pc") {
      setSelectedGarments({ "Coat/Indo Western": true, "Pent": true, "Vest": false, "Shirt/Kurta": false });
    } else if (preset === "3pc") {
      setSelectedGarments({ "Coat/Indo Western": true, "Pent": true, "Vest": true, "Shirt/Kurta": false });
    } else if (preset === "shirt_pent") {
      setSelectedGarments({ "Coat/Indo Western": false, "Pent": true, "Vest": false, "Shirt/Kurta": true });
    } else if (preset === "kurta") {
      setSelectedGarments({ "Coat/Indo Western": false, "Pent": true, "Vest": false, "Shirt/Kurta": true });
    } else if (preset === "coat") {
      setSelectedGarments({ "Coat/Indo Western": true, "Pent": false, "Vest": false, "Shirt/Kurta": false });
    } else if (preset === "pent") {
      setSelectedGarments({ "Coat/Indo Western": false, "Pent": true, "Vest": false, "Shirt/Kurta": false });
    } else if (preset === "shirt") {
      setSelectedGarments({ "Coat/Indo Western": false, "Pent": false, "Vest": false, "Shirt/Kurta": true });
    }
  };

  const handleSearchChange = (val: string) => {
    setCustomerSearchQuery(val);
    if (!selectedCust) {
      setCustName(val); // Type new name to add
    }
    if (val.trim().length > 0) {
      setShowCustomerDropdown(true);
    } else {
      setShowCustomerDropdown(false);
    }
  };

  const handleSelectCustomer = (c: Customer) => {
    setSelectedCust(c);
    setCustName(c.fullName);
    setCustMobile(c.mobileNumber);
    setCustAddress(c.address);
    setCustomerSearchQuery(c.fullName);
    setShowCustomerDropdown(false);

    // Automatically load last measurements for this customer
    const latest = db.getLatestMeasurement(c.id);
    if (latest) {
      setCoatValues({
        length: latest.coatIndoWestern?.length || "",
        chest: latest.coatIndoWestern?.chest || "",
        waist: latest.coatIndoWestern?.waist || "",
        neck: latest.coatIndoWestern?.neck || "",
        tira: latest.coatIndoWestern?.tira || "",
        hb: latest.coatIndoWestern?.hb || "",
        cback: latest.coatIndoWestern?.cback || "",
        arms: latest.coatIndoWestern?.arms || "",
        bicep: latest.coatIndoWestern?.bicep || "",
        front: latest.coatIndoWestern?.front || "",
        moda: latest.coatIndoWestern?.moda || "",
      });
      setPentValues({
        waist: latest.pent?.waist || "",
        hips: latest.pent?.hips || "",
        patt: latest.pent?.patt || "",
        bottom: latest.pent?.bottom || "",
        length: latest.pent?.length || "",
        inlength: latest.pent?.inlength || "",
        knee: latest.pent?.knee || "",
      });
      setVestValues({
        length: latest.vest?.length || "",
        chest: latest.vest?.chest || "",
        waist: latest.vest?.waist || "",
        hip: latest.vest?.hip || "",
        tira: latest.vest?.tira || "",
        neck: latest.vest?.neck || "",
      });
      setShirtValues({
        length: latest.shirtKurta?.length || "",
        chest: latest.shirtKurta?.chest || "",
        waist: latest.shirtKurta?.waist || "",
        hip: latest.shirtKurta?.hip || "",
        tira: latest.shirtKurta?.tira || "",
        arms: latest.shirtKurta?.arms || "",
        neck: latest.shirtKurta?.neck || "",
        cback: latest.shirtKurta?.cback || "",
        front: latest.shirtKurta?.front || "",
        moda: latest.shirtKurta?.moda || "",
        bicep: latest.shirtKurta?.bicep || "",
      });
      setPrefNotes(latest.remarks || latest.designNotes || "");
      setSelectedGarments({
        "Coat/Indo Western": !!(latest.coatIndoWestern?.length || latest.coatIndoWestern?.chest),
        "Pent": !!(latest.pent?.waist || latest.pent?.hips),
        "Vest": !!(latest.vest?.length || latest.vest?.chest),
        "Shirt/Kurta": !!(latest.shirtKurta?.length || latest.shirtKurta?.chest),
      });
    }
  };

  const handleUseLastMeasurements = () => {
    if (!latestMeas) return;
    setCoatValues({
      length: latestMeas.coatIndoWestern?.length || "",
      chest: latestMeas.coatIndoWestern?.chest || "",
      waist: latestMeas.coatIndoWestern?.waist || "",
      neck: latestMeas.coatIndoWestern?.neck || "",
      tira: latestMeas.coatIndoWestern?.tira || "",
      hb: latestMeas.coatIndoWestern?.hb || "",
      cback: latestMeas.coatIndoWestern?.cback || "",
      arms: latestMeas.coatIndoWestern?.arms || "",
      bicep: latestMeas.coatIndoWestern?.bicep || "",
      front: latestMeas.coatIndoWestern?.front || "",
      moda: latestMeas.coatIndoWestern?.moda || "",
    });
    setPentValues({
      waist: latestMeas.pent?.waist || "",
      hips: latestMeas.pent?.hips || "",
      patt: latestMeas.pent?.patt || "",
      bottom: latestMeas.pent?.bottom || "",
      length: latestMeas.pent?.length || "",
      inlength: latestMeas.pent?.inlength || "",
      knee: latestMeas.pent?.knee || "",
    });
    setVestValues({
      length: latestMeas.vest?.length || "",
      chest: latestMeas.vest?.chest || "",
      waist: latestMeas.vest?.waist || "",
      hip: latestMeas.vest?.hip || "",
      tira: latestMeas.vest?.tira || "",
      neck: latestMeas.vest?.neck || "",
    });
    setShirtValues({
      length: latestMeas.shirtKurta?.length || "",
      chest: latestMeas.shirtKurta?.chest || "",
      waist: latestMeas.shirtKurta?.waist || "",
      hip: latestMeas.shirtKurta?.hip || "",
      tira: latestMeas.shirtKurta?.tira || "",
      arms: latestMeas.shirtKurta?.arms || "",
      neck: latestMeas.shirtKurta?.neck || "",
      cback: latestMeas.shirtKurta?.cback || "",
      front: latestMeas.shirtKurta?.front || "",
      moda: latestMeas.shirtKurta?.moda || "",
      bicep: latestMeas.shirtKurta?.bicep || "",
    });
    setPrefNotes(latestMeas.remarks || latestMeas.designNotes || "");
    
    // Auto-select garments that have existing measurements filled
    setSelectedGarments({
      "Coat/Indo Western": !!(latestMeas.coatIndoWestern?.length || latestMeas.coatIndoWestern?.chest),
      "Pent": !!(latestMeas.pent?.waist || latestMeas.pent?.hips),
      "Vest": !!(latestMeas.vest?.length || latestMeas.vest?.chest),
      "Shirt/Kurta": !!(latestMeas.shirtKurta?.length || latestMeas.shirtKurta?.chest),
    });
  };

  const handleResetForm = () => {
    setCustomerSearchQuery("");
    setShowCustomerDropdown(false);
    setSelectedCust(null);
    setCustName("");
    setCustMobile("");
    setCustAddress("");
    setSelectedGarments({
      "Coat/Indo Western": true,
      "Pent": true,
      "Vest": false,
      "Shirt/Kurta": false,
    });
    setCoatValues(emptyCoat);
    setPentValues(emptyPent);
    setVestValues(emptyVest);
    setShirtValues(emptyShirt);
    setPrefNotes("");
    
    const dTry = new Date();
    dTry.setDate(dTry.getDate() + 7);
    const dDel = new Date();
    dDel.setDate(dDel.getDate() + 14);
    const allM = db.getAllMeasurements();
    const allO = db.getOrders();
    const slipNum = `SS-${allM.length + allO.length + 1045}`;

    setTryOnDate(dTry.toISOString().split("T")[0]);
    setDeliveryDate(dDel.toISOString().split("T")[0]);
    setSerialNumber(slipNum);
    setAdvancePaid("");
    setTotalAmount("");
    setFabricBrand("");
    setFabricColor("");
    setLapelStyle("Notch Lapel (Standard)");
    setVentStyle("Double Vent (Side)");
    setOrderPriority("Normal");
    setPaymentMode("Cash");
    setOpeningUdhar("");
    setSuccessData(null);
  };

  const handleSaveOrder = (e: React.FormEvent) => {
    e.preventDefault();
    
    const nameToUse = custName.trim();
    const mobileToUse = custMobile.trim();
    const addressToUse = custAddress.trim();

    if (!nameToUse || !mobileToUse || !addressToUse) {
      setConfirmModal({
        isOpen: true,
        title: "Information Required",
        message: "Please complete the Customer Info section (Name, Mobile, and Address are required).",
        confirmLabel: "Understood",
        variant: "warning",
        onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
      });
      return;
    }

    const garmentsList = Object.keys(selectedGarments).filter(g => selectedGarments[g]);
    if (garmentsList.length === 0) {
      setConfirmModal({
        isOpen: true,
        title: "Garment Required",
        message: "Please select at least one garment for this order.",
        confirmLabel: "Understood",
        variant: "warning",
        onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
      });
      return;
    }

    if (!deliveryDate) {
      setConfirmModal({
        isOpen: true,
        title: "Delivery Date Required",
        message: "Please specify a required Delivery Date.",
        confirmLabel: "Understood",
        variant: "warning",
        onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
      });
      return;
    }

    let customerId = "";
    let customerName = nameToUse;
    if (selectedCust) {
      customerId = selectedCust.id;
      if (selectedCust.mobileNumber !== mobileToUse || selectedCust.address !== addressToUse) {
        db.updateCustomer(customerId, { mobileNumber: mobileToUse, address: addressToUse });
      }
    } else {
      const newC = db.addCustomer({
        fullName: nameToUse,
        mobileNumber: mobileToUse,
        address: addressToUse,
        preferredFabricBrands: fabricBrand ? [fabricBrand] : [],
      });
      customerId = newC.id;
      customerName = newC.fullName;

      // Add opening Udhar if provided for new customer
      const parsedOpening = parseFloat(openingUdhar);
      if (!isNaN(parsedOpening) && parsedOpening > 0) {
        db.addOpeningUdhar(customerId, parsedOpening, "Purana Udhar at Registration");
      }
    }

    const measurementVersion = db.saveMeasurement({
      customerId,
      tryOnDate: tryOnDate || "",
      deliveryDate: deliveryDate,
      createdBy: "Staff",
      coatIndoWestern: {
        length: coatValues.length || "",
        chest: coatValues.chest || "",
        waist: coatValues.waist || "",
        neck: coatValues.neck || "",
        tira: coatValues.tira || "",
        hb: coatValues.hb || "",
        cback: coatValues.cback || "",
        arms: coatValues.arms || "",
        bicep: coatValues.bicep || "",
        front: coatValues.front || "",
        moda: coatValues.moda || "",
        serialNumber: serialNumber,
      },
      pent: {
        waist: pentValues.waist || "",
        hips: pentValues.hips || "",
        patt: pentValues.patt || "",
        bottom: pentValues.bottom || "",
        length: pentValues.length || "",
        inlength: pentValues.inlength || "",
        knee: pentValues.knee || "",
        serialNumber: serialNumber,
      },
      vest: {
        length: vestValues.length || "",
        chest: vestValues.chest || "",
        waist: vestValues.waist || "",
        hip: vestValues.hip || "",
        tira: vestValues.tira || "",
        neck: vestValues.neck || "",
        serialNumber: serialNumber,
      },
      shirtKurta: {
        length: shirtValues.length || "",
        chest: shirtValues.chest || "",
        waist: shirtValues.waist || "",
        hip: shirtValues.hip || "",
        tira: shirtValues.tira || "",
        arms: shirtValues.arms || "",
        neck: shirtValues.neck || "",
        cback: shirtValues.cback || "",
        front: shirtValues.front || "",
        moda: shirtValues.moda || "",
        bicep: shirtValues.bicep || "",
        serialNumber: serialNumber,
      },
      remarks: prefNotes,
      designNotes: prefNotes,
    });

    const fabricSummary = [
      fabricBrand ? `Brand: ${fabricBrand}` : "",
      fabricColor ? `Color/Code: ${fabricColor}` : "",
      lapelStyle ? `Lapels: ${lapelStyle}` : "",
      ventStyle ? `Vents: ${ventStyle}` : "",
    ].filter(Boolean).join(" | ");

    const combinedFabricDetails = [fabricSummary, prefNotes].filter(Boolean).join(" — ") || "Standard Walk-in Fabric";
    const tryOnNote = tryOnDate ? `[Try-on scheduled: ${tryOnDate}]` : "";
    const priorityNote = orderPriority !== "Normal" ? `[Priority: ${orderPriority}]` : "";
    const payModeNote = paymentMode ? `[Advance Paid via: ${paymentMode}]` : "";
    const combinedNotes = `${combinedFabricDetails} ${tryOnNote} ${priorityNote} ${payModeNote}`.trim();

    const parsedTotal = totalAmount ? parseFloat(totalAmount) : 0;
    if (isNaN(parsedTotal) || parsedTotal < 0) {
      setConfirmModal({
        isOpen: true,
        title: "Total Amount Invalid",
        message: "Please enter a valid non-negative total order amount or leave it blank (defaults to ₹0).",
        confirmLabel: "Understood",
        variant: "warning",
        onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
      });
      return;
    }

    const parsedAdvance = advancePaid ? parseFloat(advancePaid) : 0;
    if (isNaN(parsedAdvance) || parsedAdvance < 0) {
      setConfirmModal({
        isOpen: true,
        title: "Invalid Advance",
        message: "Advance paid deposit cannot be negative.",
        confirmLabel: "Understood",
        variant: "warning",
        onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
      });
      return;
    }

    if (parsedAdvance > parsedTotal) {
      setConfirmModal({
        isOpen: true,
        title: "Invalid Advance",
        message: "Advance paid cannot exceed the total order amount.",
        confirmLabel: "Understood",
        variant: "warning",
        onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
      });
      return;
    }

    try {
      const createdOrder = db.addOrder({
        customerId,
        garmentTypes: garmentsList,
        linkedMeasurementVersionId: measurementVersion.id,
        fabricDetails: combinedFabricDetails,
        expectedDeliveryDate: deliveryDate,
        status: "Pending",
        assignedTailor: assignedTailor || "Staff",
        notes: combinedNotes,
      }, parsedTotal, parsedAdvance);

      refreshDb();

      setSuccessData({
        orderId: createdOrder.id,
        orderNumber: createdOrder.orderNumber,
        customerName: customerName,
        deliveryDate: deliveryDate,
        garments: garmentsList,
        totalAmount: parsedTotal,
        advancePaid: parsedAdvance,
        balanceDue: Math.max(0, parsedTotal - parsedAdvance)
      });
    } catch (err: any) {
      setConfirmModal({
        isOpen: true,
        title: "Transaction Failed",
        message: err.message || "Failed to log order. Please verify financial inputs.",
        confirmLabel: "Understood",
        variant: "warning",
        onConfirm: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
      });
    }
  };

  const handleViewOrder = () => {
    if (!successData) return;
    setIsQuickOrderOpen(false);
    const linkedCustId = db.getOrderById(successData.orderId)?.customerId;
    onNavigate("Orders", { customerId: linkedCustId });
    handleResetForm();
  };

  const handleResetAgenda = () => {
    setConfirmModal({
      isOpen: true,
      title: "Reset Weekly Agenda",
      message: "Are you sure you want to delete and reset all scheduled fitting agenda/appointment data? This action cannot be undone.",
      confirmLabel: "Yes, Reset Data",
      cancelLabel: "Cancel",
      variant: "danger",
      onConfirm: () => {
        db.clearAllAppointments();
        refreshDb();
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      },
      onCancel: () => setConfirmModal(prev => ({ ...prev, isOpen: false })),
    });
  };

  // Calculate stats
  const totalCustomers = dbState.customers.length;

  // Real month-to-date customer growth. This badge previously showed a hardcoded "+12%",
  // which stayed on screen even with zero customers.
  const monthPrefix = getLocalDateString().slice(0, 7); // YYYY-MM
  const newCustomersThisMonth = dbState.customers.filter((c: any) =>
    typeof c.customerSince === "string" && c.customerSince.slice(0, 7) === monthPrefix
  ).length;
  
  // Normalized local today date string (YYYY-MM-DD based on local system time)
  const todayStr = getLocalDateString();

  // Active orders (not delivered)
  const activeOrders = dbState.orders.filter(o => o.status !== "Delivered");
  
  // Due this week (next 7 days starting from current local midnight)
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const sevenDaysLater = new Date(startOfToday);
  sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
  sevenDaysLater.setHours(23, 59, 59, 999);

  const dueThisWeek = dbState.orders.filter(o => {
    if (o.status === "Delivered" || !o.expectedDeliveryDate) return false;
    const parts = o.expectedDeliveryDate.split("-");
    if (parts.length < 3) return false;
    const delDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    return delDate >= startOfToday && delDate <= sevenDaysLater;
  });
 
  // Pending payments (sum of balance due from all invoices where balanceDue > 0)
  const pendingPaymentsAmount = dbState.invoices.reduce((sum, i) => {
    const balance = parseFloat(String(i.balanceDue)) || 0;
    return sum + (balance > 0 ? balance : 0);
  }, 0);
 
  // Today's appointments (matching current local today string)
  const todayAppts = dbState.appointments.filter(appt => {
    const apptDateStr = appt.appointmentDate || (appt.dateTime ? appt.dateTime.split("T")[0] : "");
    return apptDateStr === todayStr;
  });
 
  // Today's deliveries (expectedDeliveryDate === todayStr)
  const todayDeliveries = dbState.orders.filter(o => {
    return o.expectedDeliveryDate === todayStr;
  });

  // Quick Action triggers
  const triggerQuickAction = (action: string) => {
    if (action === "new_order") {
      openQuickOrderModal();
    } else {
      onOpenQuickAction(action);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Clean Premium Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b border-light pb-6">
        <div>
          <span className="text-[10px] uppercase tracking-[0.35em] text-gold font-bold font-sans">
            Jalandhar City Showroom
          </span>
          <h1 className="text-3xl sm:text-4xl font-serif text-navy font-black tracking-widest uppercase mt-1">
            SIGNATURE SUITINGS
          </h1>
          <p className="text-muted-grey text-sm mt-1.5 font-sans">
            Welcome Back, <span className="text-navy font-semibold">{currentUserRole === "Admin" ? "Hardik Nagpal" : "Showroom Staff"}</span> &bull; {currentUserRole === "Admin" ? "Showroom Owner" : "Tailor / Manager"}
          </p>
        </div>


      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
        {/* KPI 1 */}
        <div 
          onClick={() => onNavigate("Customers")}
          className="bg-white p-5 rounded-2xl border border-light shadow-sm hover:shadow-md hover:border-gold/30 transition-all cursor-pointer group"
        >
          <div className="flex justify-between items-start">
            <div className="bg-cream p-2.5 rounded-xl text-navy group-hover:bg-gold/10 group-hover:text-gold transition-colors">
              <Users className="w-5 h-5" />
            </div>
            {newCustomersThisMonth > 0 && (
              <span className="text-xs font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                <TrendingUp className="w-3 h-3" /> +{newCustomersThisMonth} this month
              </span>
            )}
          </div>
          <p className="text-muted-grey text-xs mt-4 font-medium uppercase tracking-wider">Total Customers</p>
          <h3 className="text-2xl font-bold text-navy mt-1 font-serif">{totalCustomers}</h3>
        </div>

        {/* KPI 2 */}
        <div 
          onClick={() => onNavigate("Orders")}
          className="bg-white p-5 rounded-2xl border border-light shadow-sm hover:shadow-md hover:border-gold/30 transition-all cursor-pointer group"
        >
          <div className="flex justify-between items-start">
            <div className="bg-cream p-2.5 rounded-xl text-navy group-hover:bg-gold/10 group-hover:text-gold transition-colors">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <span className="text-xs font-medium text-navy bg-cream px-2.5 py-0.5 rounded-full">
              In Production
            </span>
          </div>
          <p className="text-muted-grey text-xs mt-4 font-medium uppercase tracking-wider">Active Orders</p>
          <h3 className="text-2xl font-bold text-navy mt-1 font-serif">{activeOrders.length}</h3>
        </div>

        {/* KPI 3 */}
        <div 
          onClick={() => onNavigate("Orders", { filter: "due_week" })}
          className="bg-white p-5 rounded-2xl border border-light shadow-sm hover:shadow-md hover:border-gold/30 transition-all cursor-pointer group"
        >
          <div className="flex justify-between items-start">
            <div className="bg-cream p-2.5 rounded-xl text-navy group-hover:bg-gold/10 group-hover:text-gold transition-colors">
              <CalendarCheck className="w-5 h-5" />
            </div>
            {dueThisWeek.length > 0 && (
              <span className="animate-pulse text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                {dueThisWeek.length} Urgent
              </span>
            )}
          </div>
          <p className="text-muted-grey text-xs mt-4 font-medium uppercase tracking-wider">Due This Week</p>
          <h3 className="text-2xl font-bold text-navy mt-1 font-serif">{dueThisWeek.length}</h3>
        </div>

        {/* KPI 4 */}
        <div 
          onClick={() => onNavigate("Invoices", { filter: "unpaid" })}
          className="bg-white p-5 rounded-2xl border border-light shadow-sm hover:shadow-md hover:border-gold/30 transition-all cursor-pointer group"
        >
          <div className="flex justify-between items-start">
            <div className="bg-cream p-2.5 rounded-xl text-navy group-hover:bg-gold/10 group-hover:text-gold transition-colors">
              <Wallet className="w-5 h-5" />
            </div>
            <span className="text-xs font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full">
              Outstanding
            </span>
          </div>
          <p className="text-muted-grey text-xs mt-4 font-medium uppercase tracking-wider">Pending Receivables</p>
          <h3 className="text-2xl font-bold text-navy mt-1 font-serif">₹{pendingPaymentsAmount.toLocaleString("en-IN")}</h3>
        </div>

        {/* KPI 5 */}
        <div 
          onClick={() => onNavigate("Scheduling")}
          className="bg-white p-5 rounded-2xl border border-light shadow-sm hover:shadow-md hover:border-gold/30 transition-all cursor-pointer group"
        >
          <div className="flex justify-between items-start">
            <div className="bg-cream p-2.5 rounded-xl text-navy group-hover:bg-gold/10 group-hover:text-gold transition-colors">
              <CalendarDays className="w-5 h-5" />
            </div>
            <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
              Today
            </span>
          </div>
          <p className="text-muted-grey text-xs mt-4 font-medium uppercase tracking-wider">Today's Appointments</p>
          <h3 className="text-2xl font-bold text-navy mt-1 font-serif">{todayAppts.length}</h3>
        </div>
      </div>

      {/* Today Deliveries 🔥 */}
      <div className="bg-white rounded-3xl border border-light shadow-sm p-6 space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-light pb-4">
          <div className="flex items-center gap-3">
            <div className="bg-amber-50 text-amber-600 p-2.5 rounded-xl border border-amber-100 flex items-center justify-center animate-pulse">
              <Flame className="w-5 h-5 text-amber-600 fill-amber-500" />
            </div>
            <div>
              <h2 className="text-xl font-serif font-black text-navy tracking-tight flex items-center gap-2">
                Today's Deliveries 🔥
              </h2>
              <p className="text-muted-grey text-xs mt-0.5">Bespoke orders scheduled for showroom pickup or delivery today</p>
            </div>
          </div>
          <span className="text-xs font-bold text-amber-700 bg-amber-50 px-3 py-1.5 rounded-full border border-amber-100/60 font-sans">
            {todayDeliveries.length} {todayDeliveries.length === 1 ? 'Order' : 'Orders'} Scheduled
          </span>
        </div>

        {todayDeliveries.length === 0 ? (
          <div className="py-10 flex flex-col items-center justify-center text-center space-y-3 bg-cream/20 rounded-2xl border border-dashed border-light">
            <div className="bg-cream/50 text-gold p-3 rounded-full">
              <Sparkles className="w-6 h-6 text-gold fill-gold/10" />
            </div>
            <div className="max-w-md">
              <p className="font-serif font-bold text-navy text-sm">All Clear for Today!</p>
              <p className="text-muted-grey text-xs mt-1">
                No custom suits or garments are scheduled for delivery today. Use the Order Book to review upcoming order dates.
              </p>
            </div>
            <button 
              onClick={() => onNavigate("Orders")}
              className="mt-2 text-xs font-bold text-gold bg-navy hover:bg-navy-hover text-white px-4 py-2 rounded-xl shadow-xs transition-colors"
            >
              Open Order Book
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {todayDeliveries.map((order) => {
              const cust = dbState.customers.find(c => c.id === order.customerId);
              const inv = dbState.invoices.find(i => i.linkedOrderId === order.id);
              const isDelivered = order.status === "Delivered";
              const isReady = order.status === "Ready";

              return (
                <div 
                  key={order.id} 
                  className={`bg-white rounded-2xl border ${isDelivered ? 'border-light bg-cream/10' : 'border-light'} hover:shadow-md transition-all relative overflow-hidden flex flex-col justify-between`}
                >
                  {/* Left accent bar */}
                  <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${isDelivered ? 'bg-emerald-500' : isReady ? 'bg-green-500 animate-pulse' : 'bg-gold'}`} />
                  
                  <div className="p-5 pl-6 space-y-4 flex-1">
                    {/* Customer & Phone info */}
                    <div className="flex justify-between items-start gap-3">
                      <div>
                        <h4 className="font-serif font-extrabold text-navy text-base leading-tight">
                          {cust?.fullName || "Bespoke Customer"}
                        </h4>
                        {cust?.mobileNumber && (
                          <a 
                            href={`tel:${cust.mobileNumber}`} 
                            className="inline-flex items-center gap-1.5 text-xs text-muted-grey hover:text-gold transition-colors mt-1 font-sans"
                          >
                            <Phone className="w-3.5 h-3.5 text-gold" />
                            <span>{cust.mobileNumber}</span>
                          </a>
                        )}
                      </div>
                      
                      {/* Status Badge */}
                      <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider font-sans border ${
                        isDelivered 
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                          : isReady 
                            ? 'bg-green-50 text-green-700 border-green-200 animate-pulse' 
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}>
                        {order.status}
                      </span>
                    </div>

                    {/* Garments & Order details */}
                    <div className="bg-cream/35 p-3 rounded-xl border border-light text-xs space-y-1.5">
                      <div className="flex justify-between text-muted-grey font-mono text-[10px]">
                        <span>Order Ref:</span>
                        <span className="font-semibold text-charcoal">{order.orderNumber}</span>
                      </div>
                      <div className="flex justify-between text-muted-grey">
                        <span>Garments:</span>
                        <span className="font-semibold text-navy text-right">
                          {order.garmentTypes.join(" & ")}
                        </span>
                      </div>
                    </div>

                    {/* Payment/Receivables summary */}
                    {inv && (
                      <div className="flex items-center justify-between pt-1 border-t border-dashed border-light">
                        <span className="text-xs text-muted-grey font-sans">Payment Summary:</span>
                        {inv.balanceDue > 0 ? (
                          <span className="text-xs font-bold text-rose-600 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-100 flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Collect ₹{inv.balanceDue.toLocaleString("en-IN")}
                          </span>
                        ) : (
                          <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100 flex items-center gap-1">
                            <Check className="w-3.5 h-3.5" />
                            Fully Paid
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions footer bar */}
                  <div className="bg-cream/15 p-3 rounded-b-2xl border-t border-light flex gap-2">
                    {!isDelivered ? (
                      <button 
                        onClick={() => handleMarkAsDelivered(order.id)}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
                      >
                        <CheckSquare className="w-3.5 h-3.5" />
                        Mark Delivered
                      </button>
                    ) : (
                      <div className="flex-1 bg-emerald-50 text-emerald-800 text-xs font-bold py-2 px-3 rounded-xl border border-emerald-100 flex items-center justify-center gap-1.5 font-sans">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                        Handed Over Successfully
                      </div>
                    )}
                    <button 
                      onClick={() => onNavigate("Orders", { customerId: order.customerId, orderId: order.id })}
                      className="bg-white hover:bg-cream/30 text-navy border border-light hover:border-gold/30 text-xs font-bold p-2 rounded-xl transition-all flex items-center justify-center gap-1 shadow-xs active:scale-95 cursor-pointer"
                      title="View Full Work Order Details"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {/* Scheduling & Quick Actions */}
      <div className="grid grid-cols-1 gap-8">
        
        {/* Right Column (40% width): Mini Calendar + Quick Actions */}
        <div className="lg:col-span-12 space-y-8">
          
          {/* Mini Calendar Widget */}
          <div className="bg-white rounded-3xl border border-light shadow-sm p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-light pb-3">
              <h3 className="text-base font-serif font-bold text-navy flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-gold" />
                This Week's Agenda
              </h3>
              <div className="flex items-center gap-3">
                {dbState.appointments.length > 0 && (
                  <button 
                    onClick={handleResetAgenda}
                    className="text-[10px] font-extrabold text-rose-600 hover:text-rose-800 transition-colors bg-rose-50 px-2 py-1 rounded-lg border border-rose-100 active:scale-95 uppercase tracking-wider font-sans"
                  >
                    Reset Data
                  </button>
                )}
                <button 
                  onClick={() => onNavigate("Scheduling")}
                  className="text-xs font-semibold text-gold hover:text-navy transition-colors hover:underline"
                >
                  View Full
                </button>
              </div>
            </div>

            {/* Dynamic Current Week Header */}
            <div className="grid grid-cols-7 gap-1 text-center border-b border-light pb-2 text-xs font-semibold text-muted-grey">
              <span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span>
            </div>

            {/* Dynamic Current Week Dates */}
            {(() => {
              const now = new Date();
              const day = now.getDay();
              const diffToMon = day === 0 ? -6 : 1 - day;
              const monday = new Date(now);
              monday.setDate(now.getDate() + diffToMon);

              const days = Array.from({ length: 7 }, (_, i) => {
                const d = new Date(monday);
                d.setDate(monday.getDate() + i);
                const dStr = getLocalDateString(d);
                return {
                  dateObj: d,
                  dateStr: dStr,
                  dayNum: d.getDate(),
                  isToday: dStr === todayStr
                };
              });

              return (
                <div className="grid grid-cols-7 gap-1 text-center">
                  {days.map((d, idx) => {
                    const hasAppt = dbState.appointments.some(a => {
                      const aDate = a.appointmentDate || (a.dateTime ? a.dateTime.split("T")[0] : "");
                      return aDate === d.dateStr;
                    });

                    if (d.isToday) {
                      return (
                        <div key={idx} className="p-1 rounded-lg bg-navy text-white text-xs font-bold relative flex flex-col items-center justify-center">
                          {d.dayNum}
                          {hasAppt && <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-gold" />}
                        </div>
                      );
                    }

                    return (
                      <div key={idx} className="p-1 rounded-lg text-xs hover:bg-cream cursor-pointer relative flex flex-col items-center justify-center text-charcoal">
                        {d.dayNum}
                        {hasAppt && <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-amber-500" />}
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* Quick Agenda List */}
            <div className="space-y-2.5 mt-3 pt-2">
              {dbState.appointments.length === 0 ? (
                <div className="py-6 flex flex-col items-center justify-center text-center space-y-2 bg-cream/20 rounded-2xl border border-dashed border-light">
                  <span className="text-[11px] text-muted-grey font-semibold italic">No scheduled fitting agenda</span>
                </div>
              ) : (
                dbState.appointments.map((appt) => {
                  const cust = dbState.customers.find(c => c.id === appt.customerId);
                  const timeStr = appt.dateTime ? appt.dateTime.split("T")[1]?.substring(0, 5) : "";
                  const apptType = appt.type || "Trial";
                  
                  return (
                    <div key={appt.id} className="flex justify-between items-center bg-cream/50 p-2.5 rounded-xl border border-light text-xs">
                      <span className="font-semibold text-charcoal">
                        {cust?.fullName || "Bespoke Customer"} {timeStr ? `(${timeStr})` : ""}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        apptType === "Delivery"
                          ? "bg-green-100 text-green-800"
                          : apptType === "Measurement"
                          ? "bg-blue-100 text-blue-800"
                          : "bg-amber-100 text-amber-800"
                      }`}>
                        {apptType === "Delivery" ? "Delivery" : apptType === "Measurement" ? "Measurement" : "Trial Fit"}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Quick Actions Panel */}
          <div className="bg-navy text-white rounded-3xl p-6 shadow-md relative overflow-hidden space-y-4">
            {/* Background texture flourish */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-gold/10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none" />
            
            <div>
              <h3 className="text-base font-serif font-bold text-gold">Showroom Quick Actions</h3>
              <p className="text-white/60 text-xs">Standard showroom floor entries</p>
            </div>

            <div className="space-y-3 pt-2">
              {/* PRIMARY GOLD QUICK NEW ORDER BUTTON */}
              <button 
                onClick={() => setIsQuickOrderOpen(true)}
                className="w-full bg-gold hover:bg-gold/90 text-navy rounded-2xl py-4 px-4 text-left font-bold transition-all flex items-center justify-between shadow-lg group border border-gold cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <Plus className="w-6 h-6 stroke-[3px]" />
                  <div className="flex flex-col">
                    <span className="text-sm font-extrabold tracking-tight uppercase">+ Quick New Order</span>
                    <span className="text-[10px] text-navy/70 font-normal normal-case font-sans">Daily counter rapid 60s entry</span>
                  </div>
                </div>
                <ArrowUpRight className="w-5 h-5 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform stroke-[2.5px]" />
              </button>

              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => triggerQuickAction("new_customer")}
                  className="bg-white/10 hover:bg-gold/20 hover:text-gold hover:border-gold/30 text-white rounded-xl py-3 px-3 text-left border border-white/5 transition-all flex flex-col justify-between h-20 group cursor-pointer"
                >
                  <UserPlus className="w-5 h-5 text-gold group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-semibold font-sans">New Customer</span>
                </button>

                <button 
                  onClick={() => triggerQuickAction("new_order")}
                  className="bg-white/10 hover:bg-gold/20 hover:text-gold hover:border-gold/30 text-white rounded-xl py-3 px-3 text-left border border-white/5 transition-all flex flex-col justify-between h-20 group cursor-pointer"
                >
                  <ShoppingBag className="w-5 h-5 text-gold group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-semibold font-sans">New Order</span>
                </button>

                <button 
                  onClick={() => triggerQuickAction("new_invoice")}
                  className="bg-white/10 hover:bg-gold/20 hover:text-gold hover:border-gold/30 text-white rounded-xl py-3 px-3 text-left border border-white/5 transition-all flex flex-col justify-between h-20 group cursor-pointer"
                >
                  <FileSpreadsheet className="w-5 h-5 text-gold group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-semibold font-sans">New Billing</span>
                </button>

                <button 
                  onClick={() => triggerQuickAction("new_appointment")}
                  className="bg-white/10 hover:bg-gold/20 hover:text-gold hover:border-gold/30 text-white rounded-xl py-3 px-3 text-left border border-white/5 transition-all flex flex-col justify-between h-20 group cursor-pointer"
                >
                  <CalendarDays className="w-5 h-5 text-gold group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-semibold font-sans">Schedule Fit</span>
                </button>
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* QUICK NEW ORDER MODAL */}
      {isQuickOrderOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/60 backdrop-blur-xs p-4 sm:p-6 overflow-y-auto">
          <div className="bg-white w-full max-w-4xl rounded-3xl border border-light shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-fade-in font-sans text-charcoal">
            
            {/* Header */}
            <div className="p-5 border-b border-light flex justify-between items-center bg-cream/30 flex-shrink-0">
              <div className="space-y-0.5">
                <h2 className="text-xl font-serif font-bold text-navy flex items-center gap-2">
                  <ShoppingBag className="w-5 h-5 text-gold" />
                  Quick Counter Order Registration
                </h2>
                <p className="text-muted-grey text-xs">Add customer, log measurements, and schedule bespoke creation on a single screen.</p>
              </div>
              <button 
                type="button" 
                onClick={() => {
                  setIsQuickOrderOpen(false);
                  handleResetForm();
                }}
                className="text-muted-grey hover:text-navy p-1.5 rounded-full hover:bg-cream transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {successData ? (
              /* SUCCESS SCREEN */
              <div className="p-8 text-center space-y-5 flex flex-col items-center justify-center overflow-y-auto">
                <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center text-green-600 border border-green-200 shadow-sm">
                  <CheckCircle className="w-10 h-10" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-2xl font-serif font-bold text-navy">Order Registered Successfully!</h3>
                  <p className="text-muted-grey text-sm">
                    Bespoke order <b className="text-gold font-mono font-bold">{successData.orderNumber}</b> has been recorded for <b className="text-charcoal font-bold">{successData.customerName}</b>.
                  </p>
                  <p className="text-xs text-muted-grey">
                    Expected Delivery: <b className="text-navy font-semibold">{new Date(successData.deliveryDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</b> &bull; Total: <b className="text-navy">₹{successData.totalAmount.toLocaleString("en-IN")}</b> &bull; Balance Due: <b className="text-rose-600 font-mono">₹{successData.balanceDue.toLocaleString("en-IN")}</b>
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-3 w-full max-w-lg pt-4">
                  <button
                    type="button"
                    onClick={() => setIsPrintSlipOpen(true)}
                    className="flex-1 min-w-[140px] bg-navy text-white hover:bg-navy-hover font-bold py-3 px-4 rounded-2xl transition-all text-xs flex items-center justify-center gap-2 cursor-pointer shadow-md"
                  >
                    <Printer className="w-4 h-4 text-gold" />
                    Print Workshop Slip
                  </button>
                  <button
                    type="button"
                    onClick={handleViewOrder}
                    className="flex-1 min-w-[140px] bg-cream/70 hover:bg-cream text-navy font-bold py-3 px-4 rounded-2xl border border-light transition-all text-xs cursor-pointer"
                  >
                    View Registered Order
                  </button>
                  <button
                    type="button"
                    onClick={handleResetForm}
                    className="flex-1 min-w-[140px] bg-gold hover:bg-gold/90 text-navy font-bold py-3 px-4 rounded-2xl transition-all text-xs cursor-pointer shadow-sm"
                  >
                    + Add Another Order
                  </button>
                </div>
              </div>
            ) : (
              /* FORM SCREEN */
              <form onSubmit={handleSaveOrder} className="flex flex-col flex-1 overflow-hidden">
                <div className="flex-1 overflow-y-auto p-6 space-y-6">

                  {/* STEP 1 — Customer Info */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-navy flex items-center gap-2 border-b border-light pb-2">
                      <span className="w-5 h-5 rounded-full bg-gold/15 text-gold flex items-center justify-center text-xs font-bold font-mono">1</span>
                      Customer Information
                    </h3>

                    {selectedCust ? (
                      <div className="bg-cream/30 p-4 rounded-2xl border border-gold/30 flex justify-between items-center gap-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="px-2 py-0.5 bg-gold/10 text-gold text-[9px] font-bold uppercase rounded border border-gold/20">Selected Returning Client</span>
                            {selectedCust.outstandingBalance > 0 ? (
                              <span className="px-2 py-0.5 bg-rose-100 text-rose-700 text-[9px] font-bold uppercase rounded border border-rose-200">
                                Purana Udhar: ₹{selectedCust.outstandingBalance.toLocaleString("en-IN")}
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[9px] font-bold uppercase rounded border border-emerald-200">
                                Koi Udhar Nahi (₹0)
                              </span>
                            )}
                            {latestMeas && (
                              <span className="px-2 py-0.5 bg-navy/10 text-navy text-[9px] font-bold uppercase rounded border border-navy/20 flex items-center gap-1">
                                <Sparkles className="w-2.5 h-2.5 text-gold" /> Last Measurements Found
                              </span>
                            )}
                          </div>
                          <p className="font-serif font-bold text-navy text-lg">{selectedCust.fullName}</p>
                          <p className="text-muted-grey text-xs">Mobile: {custMobile} &bull; Address: {custAddress}</p>
                        </div>
                        <button 
                          type="button" 
                          onClick={() => {
                            setSelectedCust(null);
                            setCustName(customerSearchQuery);
                            setCustMobile("");
                            setCustAddress("");
                          }}
                          className="text-muted-grey hover:text-red-600 p-1.5 rounded-full hover:bg-red-50 transition-colors cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3.5">
                        {/* Search Input */}
                        <div className="relative">
                          <label className="text-[11px] font-bold text-navy uppercase tracking-wider block mb-1">Search returning customer or type new name</label>
                          <div className="relative">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-grey" />
                            <input 
                              type="text" 
                              value={customerSearchQuery}
                              onChange={e => handleSearchChange(e.target.value)}
                              placeholder="Search by name / mobile number..."
                              className="w-full bg-cream/5 border border-light pl-10 pr-4 py-2.5 text-xs rounded-xl text-charcoal font-semibold focus:border-gold focus:outline-none transition-colors"
                            />
                          </div>
                          {/* Suggested dropdown */}
                          {showCustomerDropdown && matchedCustomers.length > 0 && (
                            <div className="absolute z-20 w-full mt-1 bg-white border border-light rounded-2xl shadow-lg max-h-48 overflow-y-auto divide-y divide-light">
                              {matchedCustomers.map(c => (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => handleSelectCustomer(c)}
                                  className="w-full text-left p-3 hover:bg-cream/20 text-xs font-semibold flex items-center justify-between gap-2 text-charcoal cursor-pointer"
                                >
                                  <div>
                                    <span className="font-serif text-navy text-sm font-bold block">{c.fullName}</span>
                                    <span className="text-muted-grey">Mobile: {c.mobileNumber} &bull; {c.address}</span>
                                  </div>
                                  {c.outstandingBalance > 0 ? (
                                    <span className="px-2 py-0.5 bg-rose-100 text-rose-700 text-[10px] font-bold rounded shrink-0">
                                      Udhar: ₹{c.outstandingBalance.toLocaleString("en-IN")}
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-medium rounded shrink-0">
                                      Udhar: ₹0
                                    </span>
                                  )}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Manual details */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold text-muted-grey uppercase">Full Name <span className="text-red-500">*</span></label>
                            <input 
                              type="text" 
                              value={custName}
                              onChange={e => setCustName(e.target.value)}
                              placeholder="Enter full name"
                              required
                              className="w-full bg-cream/5 border border-light p-2.5 text-xs rounded-xl text-charcoal font-semibold focus:border-gold focus:outline-none transition-colors"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold text-muted-grey uppercase">Mobile Number <span className="text-red-500">*</span></label>
                            <input 
                              type="text" 
                              value={custMobile}
                              onChange={e => setCustMobile(e.target.value)}
                              placeholder="Enter 10-digit mobile"
                              required
                              className="w-full bg-cream/5 border border-light p-2.5 text-xs rounded-xl text-charcoal font-semibold focus:border-gold focus:outline-none transition-colors"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold text-muted-grey uppercase">Address <span className="text-red-500">*</span></label>
                            <input 
                              type="text" 
                              value={custAddress}
                              onChange={e => setCustAddress(e.target.value)}
                              placeholder="Enter residential city / district"
                              required
                              className="w-full bg-cream/5 border border-light p-2.5 text-xs rounded-xl text-charcoal font-semibold focus:border-gold focus:outline-none transition-colors"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold text-muted-grey uppercase">Purana Udhar (Opening Balance ₹)</label>
                            <input 
                              type="number" 
                              value={openingUdhar}
                              onChange={e => setOpeningUdhar(e.target.value)}
                              placeholder="0 (Past due if any)"
                              min="0"
                              className="w-full bg-cream/5 border border-light p-2.5 text-xs rounded-xl text-charcoal font-semibold focus:border-gold focus:outline-none transition-colors"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* STEP 2 — Quick Measurement Entry */}
                  <div className="space-y-4">
                    <div className="flex flex-wrap justify-between items-center gap-3 border-b border-light pb-2">
                      <h3 className="text-sm font-bold uppercase tracking-wider text-navy flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-gold/15 text-gold flex items-center justify-center text-xs font-bold font-mono">2</span>
                        Quick Measurement Entry
                      </h3>
                      {latestMeas && (
                        <button
                          type="button"
                          onClick={handleUseLastMeasurements}
                          className="bg-gold/10 hover:bg-gold/20 text-gold border border-gold/30 px-3 py-1 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-gold" />
                          Use Last Measurements
                        </button>
                      )}
                    </div>

                    {/* Garment checkboxes */}
                    <div className="space-y-2">
                      <label className="text-[11px] font-bold text-navy uppercase tracking-wider block">Select Garments for this Order</label>
                      <div className="flex flex-wrap gap-2.5">
                        {garmentOptions.map(g => (
                          <label 
                            key={g}
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer select-none transition-all text-xs font-semibold ${
                              selectedGarments[g] 
                                ? "bg-gold/10 border-gold text-gold shadow-sm" 
                                : "bg-cream/5 hover:bg-cream border-light text-charcoal"
                            }`}
                          >
                            <input 
                              type="checkbox" 
                              checked={selectedGarments[g]}
                              onChange={() => setSelectedGarments({
                                ...selectedGarments,
                                [g]: !selectedGarments[g]
                              })}
                              className="w-4 h-4 text-gold accent-gold focus:ring-gold border-light rounded"
                            />
                            {g}
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Dynamic measurement sub-sections */}
                    <div className="space-y-4">
                      {/* Coat measurements */}
                      {selectedGarments["Coat/Indo Western"] && (
                        <div className="bg-cream/15 p-4 rounded-2xl border border-light/50 space-y-3">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-navy border-b border-light pb-1.5 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-gold" />
                            Coat / Indo Western Measurements (Inches)
                          </h4>
                          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
                            {[
                              { key: "length", label: "Length" },
                              { key: "chest", label: "Chest" },
                              { key: "waist", label: "Waist" },
                              { key: "neck", label: "Neck" },
                              { key: "tira", label: "Tira" },
                              { key: "hb", label: "H.B." },
                              { key: "cback", label: "C/Back" },
                              { key: "arms", label: "Arms" },
                              { key: "bicep", label: "Bicep" },
                              { key: "front", label: "Front" },
                              { key: "moda", label: "Moda" },
                            ].map(f => (
                              <div key={f.key} className="space-y-1">
                                <label className="text-[10px] font-semibold text-muted-grey uppercase">{f.label}</label>
                                <input 
                                  type="text" 
                                  value={(coatValues as any)[f.key]} 
                                  onChange={e => setCoatValues({ ...coatValues, [f.key]: e.target.value })} 
                                  placeholder="Inches"
                                  className="w-full bg-white border border-light p-1.5 px-2.5 text-xs rounded-xl text-charcoal font-semibold focus:border-gold focus:outline-none transition-colors"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Pent measurements */}
                      {selectedGarments["Pent"] && (
                        <div className="bg-cream/15 p-4 rounded-2xl border border-light/50 space-y-3">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-navy border-b border-light pb-1.5 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-gold" />
                            Pent Measurements (Inches)
                          </h4>
                          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2.5">
                            {[
                              { key: "length", label: "Length" },
                              { key: "inlength", label: "Inlength" },
                              { key: "waist", label: "Waist" },
                              { key: "hips", label: "Hips" },
                              { key: "patt", label: "Patt" },
                              { key: "knee", label: "Knee" },
                              { key: "bottom", label: "Bottom" },
                            ].map(f => (
                              <div key={f.key} className="space-y-1">
                                <label className="text-[10px] font-semibold text-muted-grey uppercase">{f.label}</label>
                                <input 
                                  type="text" 
                                  value={(pentValues as any)[f.key]} 
                                  onChange={e => setPentValues({ ...pentValues, [f.key]: e.target.value })} 
                                  placeholder="Inches"
                                  className="w-full bg-white border border-light p-1.5 px-2.5 text-xs rounded-xl text-charcoal font-semibold focus:border-gold focus:outline-none transition-colors"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Vest measurements */}
                      {selectedGarments["Vest"] && (
                        <div className="bg-cream/15 p-4 rounded-2xl border border-light/50 space-y-3">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-navy border-b border-light pb-1.5 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-gold" />
                            Vest Measurements (Inches)
                          </h4>
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
                            {[
                              { key: "length", label: "Length" },
                              { key: "chest", label: "Chest" },
                              { key: "waist", label: "Waist" },
                              { key: "hip", label: "Hip" },
                              { key: "tira", label: "Tira" },
                              { key: "neck", label: "Neck" },
                            ].map(f => (
                              <div key={f.key} className="space-y-1">
                                <label className="text-[10px] font-semibold text-muted-grey uppercase">{f.label}</label>
                                <input 
                                  type="text" 
                                  value={(vestValues as any)[f.key]} 
                                  onChange={e => setVestValues({ ...vestValues, [f.key]: e.target.value })} 
                                  placeholder="Inches"
                                  className="w-full bg-white border border-light p-1.5 px-2.5 text-xs rounded-xl text-charcoal font-semibold focus:border-gold focus:outline-none transition-colors"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Shirt/Kurta measurements */}
                      {selectedGarments["Shirt/Kurta"] && (
                        <div className="bg-cream/15 p-4 rounded-2xl border border-light/50 space-y-3">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-navy border-b border-light pb-1.5 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-gold" />
                            Shirt / Kurta Measurements (Inches)
                          </h4>
                          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
                            {[
                              { key: "length", label: "Length" },
                              { key: "chest", label: "Chest" },
                              { key: "waist", label: "Waist" },
                              { key: "hip", label: "Hip" },
                              { key: "tira", label: "Tira" },
                              { key: "arms", label: "Arms" },
                              { key: "neck", label: "Neck" },
                              { key: "cback", label: "C/Back" },
                              { key: "front", label: "Front" },
                              { key: "moda", label: "Moda" },
                              { key: "bicep", label: "Bicep" },
                            ].map(f => (
                              <div key={f.key} className="space-y-1">
                                <label className="text-[10px] font-semibold text-muted-grey uppercase">{f.label}</label>
                                <input 
                                  type="text" 
                                  value={(shirtValues as any)[f.key]} 
                                  onChange={e => setShirtValues({ ...shirtValues, [f.key]: e.target.value })} 
                                  placeholder="Inches"
                                  className="w-full bg-white border border-light p-1.5 px-2.5 text-xs rounded-xl text-charcoal font-semibold focus:border-gold focus:outline-none transition-colors"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* STEP 3 — Order, Pricing & Delivery Schedule */}
                  <div className="space-y-4 pb-4">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-navy flex items-center gap-2 border-b border-light pb-2">
                      <span className="w-5 h-5 rounded-full bg-gold/15 text-gold flex items-center justify-center text-xs font-bold font-mono">3</span>
                      Order, Pricing & Delivery Schedule
                    </h3>

                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-muted-grey uppercase">Serial / Slip Number</label>
                      <input 
                        type="text"
                        value={serialNumber}
                        onChange={e => setSerialNumber(e.target.value)}
                        placeholder="e.g. SN-1045"
                        className="w-full bg-cream/5 border border-light p-2.5 text-xs rounded-xl text-charcoal font-semibold focus:border-gold focus:outline-none transition-colors font-mono"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold text-muted-grey uppercase">Try-On Fit Date</label>
                        <input 
                          type="date"
                          value={tryOnDate}
                          onChange={e => setTryOnDate(e.target.value)}
                          className="w-full bg-cream/5 border border-light p-2.5 text-xs rounded-xl text-charcoal font-semibold focus:border-gold focus:outline-none transition-colors"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold text-muted-grey uppercase">Required Delivery Date <span className="text-red-500">*</span></label>
                        <input 
                          type="date"
                          value={deliveryDate}
                          onChange={e => setDeliveryDate(e.target.value)}
                          required
                          className="w-full bg-cream/5 border border-light p-2.5 text-xs rounded-xl text-charcoal font-semibold focus:border-gold focus:outline-none transition-colors"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold text-muted-grey uppercase">Total Billable Amount (₹)</label>
                        <input 
                          type="number"
                          value={totalAmount}
                          onChange={e => setTotalAmount(e.target.value)}
                          placeholder="e.g. 15000"
                          className="w-full bg-white border border-light p-2.5 text-xs rounded-xl text-charcoal font-semibold focus:border-gold focus:outline-none transition-colors font-mono"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold text-muted-grey uppercase">Advance Deposited (₹)</label>
                        <input 
                          type="number"
                          value={advancePaid}
                          onChange={e => setAdvancePaid(e.target.value)}
                          placeholder="e.g. 5000"
                          className="w-full bg-white border border-light p-2.5 text-xs rounded-xl text-charcoal font-semibold focus:border-gold focus:outline-none transition-colors font-mono"
                        />
                      </div>
                    </div>

                    {(totalAmount || (selectedCust && selectedCust.outstandingBalance > 0) || (parseFloat(openingUdhar) > 0)) && (
                      <div className="bg-cream/35 p-3.5 rounded-2xl border border-light/80 space-y-2 text-xs">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] uppercase font-bold text-navy tracking-wider flex items-center gap-1.5">
                            <Receipt className="w-3.5 h-3.5 text-gold" /> Udhar & Payment Ledger
                          </span>
                          <span className="font-mono text-xs font-semibold text-charcoal">
                            Total Order: ₹{(parseFloat(totalAmount) || 0).toLocaleString("en-IN")} &bull; Advance: ₹{(parseFloat(advancePaid) || 0).toLocaleString("en-IN")}
                          </span>
                        </div>

                        <div className="pt-2 border-t border-light/60 grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <div className="bg-white/80 p-2.5 rounded-xl border border-light text-center">
                            <span className="text-[9px] uppercase font-bold text-muted-grey block">Purana Udhar (Past Balance)</span>
                            <span className="font-mono text-sm font-bold text-navy">
                              ₹{(selectedCust ? selectedCust.outstandingBalance : (parseFloat(openingUdhar) || 0)).toLocaleString("en-IN")}
                            </span>
                          </div>
                          <div className="bg-white/80 p-2.5 rounded-xl border border-light text-center">
                            <span className="text-[9px] uppercase font-bold text-muted-grey block">Is Order Ka Baki (Due)</span>
                            <span className="font-mono text-sm font-bold text-amber-700">
                              ₹{Math.max(0, (parseFloat(totalAmount) || 0) - (parseFloat(advancePaid) || 0)).toLocaleString("en-IN")}
                            </span>
                          </div>
                          <div className="bg-rose-50 p-2.5 rounded-xl border border-rose-200 text-center">
                            <span className="text-[9px] uppercase font-bold text-rose-800 block">Kul Udhar (Total Outstanding)</span>
                            <span className="font-mono text-sm font-bold text-rose-700">
                              ₹{((selectedCust ? selectedCust.outstandingBalance : (parseFloat(openingUdhar) || 0)) + Math.max(0, (parseFloat(totalAmount) || 0) - (parseFloat(advancePaid) || 0))).toLocaleString("en-IN")}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                </div>

                {/* Form Action Footer */}
                <div className="p-4 border-t border-light bg-cream/30 flex justify-between items-center flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setIsQuickOrderOpen(false);
                      handleResetForm();
                    }}
                    className="bg-white hover:bg-cream text-navy font-semibold px-5 py-2.5 rounded-2xl border border-light text-xs transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="bg-gold hover:bg-gold/90 text-navy font-bold py-3 px-8 rounded-2xl text-sm transition-all shadow-md active:scale-[0.98] cursor-pointer"
                  >
                    Save & Create Bespoke Order
                  </button>
                </div>
              </form>
            )}

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

      {/* PRINT WORKSHOP PRODUCTION SLIP MODAL */}
      {isPrintSlipOpen && successData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/70 backdrop-blur-xs p-4 sm:p-6 overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-3xl border border-light shadow-2xl p-6 sm:p-8 space-y-6 animate-fade-in text-charcoal font-sans">
            
            {/* Slip Header */}
            <div className="flex justify-between items-start border-b-2 border-navy pb-4">
              <div>
                <h2 className="text-xl font-serif font-bold text-navy uppercase tracking-wider">Signature Suitings & Tailors</h2>
                <p className="text-[11px] text-muted-grey">Workshop Production & Sizing Job Sheet</p>
              </div>
              <div className="text-right">
                <span className="text-xs font-mono font-bold bg-gold/15 text-navy px-2.5 py-1 rounded-lg border border-gold/30">
                  {successData.orderNumber}
                </span>
                <p className="text-[10px] text-muted-grey mt-1 font-mono">{new Date().toLocaleDateString("en-IN")}</p>
              </div>
            </div>

            {/* Client & Production Details */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-cream/30 p-3.5 rounded-2xl border border-light text-xs">
              <div>
                <span className="text-[10px] text-muted-grey uppercase font-bold block">Customer</span>
                <p className="font-bold text-navy">{successData.customerName}</p>
                <p className="text-muted-grey">{custMobile}</p>
              </div>
              <div>
                <span className="text-[10px] text-muted-grey uppercase font-bold block">Master Tailor</span>
                <p className="font-bold text-navy">{assignedTailor}</p>
                <span className={`px-1.5 py-0.2 text-[9px] rounded font-bold uppercase ${orderPriority === 'Urgent' ? 'bg-rose-100 text-rose-700' : 'bg-blue-100 text-navy'}`}>
                  {orderPriority}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-muted-grey uppercase font-bold block">Fit Try-On</span>
                <p className="font-semibold text-charcoal">{tryOnDate || "N/A"}</p>
              </div>
              <div>
                <span className="text-[10px] text-muted-grey uppercase font-bold block">Final Delivery</span>
                <p className="font-bold text-rose-700">{successData.deliveryDate}</p>
              </div>
            </div>

            {/* Garments & Measurements Snapshot */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-navy border-b border-light pb-1">
                Garments: {successData.garments.join(" + ")}
              </h4>

              {selectedGarments["Coat/Indo Western"] && (
                <div className="p-3 bg-cream/15 rounded-xl border border-light/60 space-y-1.5">
                  <span className="text-[11px] font-bold text-navy uppercase">Coat Sizing (Inches):</span>
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 text-xs">
                    {Object.entries(coatValues).filter(([_, v]) => v).map(([k, v]) => (
                      <div key={k} className="bg-white p-1 rounded border border-light/60 text-center">
                        <span className="text-[9px] text-muted-grey uppercase block">{k}</span>
                        <span className="font-mono font-bold text-navy">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedGarments["Pent"] && (
                <div className="p-3 bg-cream/15 rounded-xl border border-light/60 space-y-1.5">
                  <span className="text-[11px] font-bold text-navy uppercase">Pent Sizing (Inches):</span>
                  <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 text-xs">
                    {Object.entries(pentValues).filter(([_, v]) => v).map(([k, v]) => (
                      <div key={k} className="bg-white p-1 rounded border border-light/60 text-center">
                        <span className="text-[9px] text-muted-grey uppercase block">{k}</span>
                        <span className="font-mono font-bold text-navy">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedGarments["Vest"] && (
                <div className="p-3 bg-cream/15 rounded-xl border border-light/60 space-y-1.5">
                  <span className="text-[11px] font-bold text-navy uppercase">Vest Sizing (Inches):</span>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-xs">
                    {Object.entries(vestValues).filter(([_, v]) => v).map(([k, v]) => (
                      <div key={k} className="bg-white p-1 rounded border border-light/60 text-center">
                        <span className="text-[9px] text-muted-grey uppercase block">{k}</span>
                        <span className="font-mono font-bold text-navy">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedGarments["Shirt/Kurta"] && (
                <div className="p-3 bg-cream/15 rounded-xl border border-light/60 space-y-1.5">
                  <span className="text-[11px] font-bold text-navy uppercase">Shirt Sizing (Inches):</span>
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 text-xs">
                    {Object.entries(shirtValues).filter(([_, v]) => v).map(([k, v]) => (
                      <div key={k} className="bg-white p-1 rounded border border-light/60 text-center">
                        <span className="text-[9px] text-muted-grey uppercase block">{k}</span>
                        <span className="font-mono font-bold text-navy">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Fabric & Styling Specs */}
            <div className="p-3 bg-cream/20 rounded-xl border border-light/60 text-xs space-y-1">
              <p><b>Fabric:</b> {fabricBrand || "Selected Fabric"} &bull; <b>Color/Code:</b> {fabricColor || "Standard"} &bull; <b>Lapel:</b> {lapelStyle} &bull; <b>Vent:</b> {ventStyle}</p>
              {prefNotes && <p className="text-muted-grey italic"><b>Notes:</b> {prefNotes}</p>}
            </div>

            {/* Financials & Signatures */}
            <div className="flex justify-between items-center pt-2 text-xs border-t border-light">
              <div className="space-y-0.5">
                <p><b>Total:</b> ₹{successData.totalAmount.toLocaleString("en-IN")} &bull; <b>Adv ({paymentMode}):</b> ₹{successData.advancePaid.toLocaleString("en-IN")}</p>
                <p className="text-rose-600 font-bold font-mono">Balance: ₹{successData.balanceDue.toLocaleString("en-IN")}</p>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="bg-navy hover:bg-navy-hover text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <Printer className="w-4 h-4 text-gold" /> Print Slip
                </button>
                <button
                  type="button"
                  onClick={() => setIsPrintSlipOpen(false)}
                  className="bg-cream hover:bg-cream/80 text-navy font-semibold px-4 py-2 rounded-xl text-xs border border-light cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
