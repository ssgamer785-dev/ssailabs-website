/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface MemoryNote {
  note: string;
  addedBy: string;
  timestamp: string; // ISO string
}

export interface Customer {
  id: string;
  fullName: string;
  mobileNumber: string;
  alternateNumber?: string;
  address?: string;
  email?: string;
  dob?: string;
  preferredFabricBrands: string[];
  generalNotes?: string;
  customerSince: string; // ISO string
  totalOrdersCount: number;
  outstandingBalance: number; // in ₹
  qrCodeId: string; // unique identifier for Client Portal
  photoUrl?: string;
  memoryNotes: MemoryNote[];
  preferenceTags: string[];
}

export interface GarmentCoat {
  length: string;
  chest: string;
  waist: string;
  neck: string;
  tira: string;
  hb: string;
  cback: string;
  arms: string;
  bicep?: string;
  front?: string;
  moda?: string;
  serialNumber?: string;
}

export interface GarmentPent {
  waist: string;
  hips: string;
  patt: string;
  bottom: string;
  length?: string;
  inlength?: string;
  knee?: string;
  serialNumber?: string;
}

/**
 * The seven measurements taken for every lower-body garment — pant, pent, trouser, chinos.
 * This is the single source of truth: every form, summary, printout and portal view builds
 * its pant fields from this list, so they cannot drift apart again. Order is the order they
 * are shown in.
 *
 * Only pant-family garments use this. Coat, indo-western, vest, shirt and kurta keep their
 * own separate field sets.
 */
export const PANT_MEASUREMENT_FIELDS: ReadonlyArray<{ key: keyof GarmentPent; label: string }> = [
  { key: "length", label: "Length" },
  { key: "waist", label: "Waist" },
  { key: "hips", label: "Hips" },
  { key: "inlength", label: "Inlength" },
  { key: "patt", label: "Patt" },
  { key: "knee", label: "Knee" },
  { key: "bottom", label: "Bottom" }
];

/** True when a garment name refers to a lower-body pant/trouser garment. */
export function isPantGarment(name?: string): boolean {
  const n = (name || "").toLowerCase();
  return n.includes("pent") || n.includes("pant") || n.includes("trouser") ||
         n.includes("chino") || n.includes("pajama") || n.includes("pyjama") ||
         n.includes("salwar");
}

/**
 * Normalises a stored pant measurement onto the seven standard keys.
 *
 * Older records and template-driven line items used other names for the same measurement
 * (inseam for inlength, thigh for patt, seat for hips). Those are mapped across so historic
 * size cards stay readable. Anything unrecognised is preserved untouched rather than dropped,
 * so no historical data is silently lost.
 */
export function normalizePantMeasurement(raw: any): GarmentPent {
  const src = raw && typeof raw === "object" ? raw : {};
  const pick = (...keys: string[]): string => {
    for (const k of keys) {
      const v = src[k];
      if (v !== undefined && v !== null && String(v).trim() !== "") return String(v);
    }
    return "";
  };
  const normalized: any = {
    length: pick("length", "pentLength", "len", "pantLength"),
    waist: pick("waist", "pentWaist"),
    hips: pick("hips", "hip", "pentHips", "seat"),
    inlength: pick("inlength", "inLength", "pentInlength", "inseam", "inSeam"),
    patt: pick("patt", "pentPatt", "thigh"),
    knee: pick("knee", "pentKnee"),
    bottom: pick("bottom", "pentBottom", "bottomWidth")
  };
  // Carry over anything else already stored (serialNumber, legacy extras) without loss.
  for (const key of Object.keys(src)) {
    if (!(key in normalized)) normalized[key] = src[key];
  }
  return normalized as GarmentPent;
}

export interface GarmentVest {
  length: string;
  chest: string;
  waist: string;
  hip: string;
  tira: string;
  neck: string;
  serialNumber?: string;
}

export interface GarmentShirtKurta {
  length: string;
  chest: string;
  waist: string;
  hip: string;
  tira: string;
  arms: string;
  neck: string;
  cback: string;
  front: string;
  moda: string;
  bicep: string;
  serialNumber?: string;
}

export interface MeasurementChange {
  field: string;
  garment: string;
  oldValue: string;
  newValue: string;
  change: string; // e.g. "+1" or "-0.5" or "Changed"
}

export interface Measurement {
  id: string;
  customerId: string;
  versionDate: string; // ISO string
  slipNumber: string;
  tryOnDate: string; // YYYY-MM-DD
  deliveryDate: string; // YYYY-MM-DD
  coatIndoWestern: GarmentCoat;
  pent: GarmentPent;
  vest: GarmentVest;
  shirtKurta: GarmentShirtKurta;
  designNotes?: string;
  fabricSelected?: string;
  liningChoice?: string;
  remarks?: string;
  createdBy: string; // staff/user id
  changesSincePrevious: MeasurementChange[];
}

export interface GarmentCategory {
  id: string;
  name: string;
  description?: string;
  displayOrder: number;
  active: boolean;
}

export type MeasurementInputType = "Number" | "Text" | "Dropdown" | "Checkbox" | "Radio" | "Visual Selector";

export interface MeasurementFieldOption {
  label: string;
  value: string;
  iconOrVisual?: string;
}

export interface MeasurementField {
  id: string;
  fieldName: string;
  shortName: string;
  unit: string;
  inputType: MeasurementInputType;
  options?: MeasurementFieldOption[];
  required: boolean;
  displayOrder: number;
  active: boolean;
  notes?: string;
}

export interface MeasurementTemplate {
  id: string;
  name: string;
  description?: string;
  fields: MeasurementField[];
  isDefault?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GarmentCatalogItem {
  id: string;
  name: string;
  categoryId: string;
  categoryName?: string;
  description?: string;
  defaultPrice: number;
  measurementTemplateId: string;
  measurementTemplateName?: string;
  active: boolean;
  displayOrder: number;
  imageUrl?: string;
}

export type LineItemMeasurementStatus = "Pending" | "Complete" | "Updated";

export interface GarmentLineItem {
  id: string;
  garmentCatalogId?: string;
  garmentName: string;
  category?: string;
  quantity: number;
  fabric?: string;
  color?: string;
  styleNotes?: string;
  rate: number;
  discount: number;
  amount: number;
  measurementTemplateId?: string;
  measurementTemplateSnapshot?: MeasurementTemplate;
  measurementValues: Record<string, any>;
  measurementStatus: LineItemMeasurementStatus;
  productionStatus?: "Pending" | "In Production" | "Trial" | "Ready" | "Delivered";
  notes?: string;
  updatedAt?: string;
}

export type OrderStatus = "Pending" | "In Cutting" | "Stitching" | "Trial Scheduled" | "Ready" | "Delivered";

export interface StatusHistoryEntry {
  status: OrderStatus;
  timestamp: string; // ISO string
  updatedBy: string;
}

export interface Order {
  id: string;
  customerId: string;
  orderNumber: string;
  orderDate: string; // ISO string
  garmentTypes: string[]; // e.g. ["Coat", "Pent"]
  garmentLineItems?: GarmentLineItem[];
  linkedMeasurementVersionId: string; // Reference to measurement document ID
  fabricDetails: string;
  expectedDeliveryDate: string; // YYYY-MM-DD
  actualDeliveryDate?: string; // YYYY-MM-DD
  status: OrderStatus;
  statusHistory: StatusHistoryEntry[];
  assignedTailor?: string;
  linkedInvoiceId?: string;
  notes?: string;
  totalAmount?: number;
  advancePaid?: number;
  updatedAt?: string;
  updated_at?: string;
}

export interface Trial {
  id: string;
  orderId: string;
  customerId: string;
  trialDate: string; // ISO string or YYYY-MM-DD
  feedback: string;
  alterationRequired: boolean;
  conductedBy: string;
}

export interface Alteration {
  id: string;
  orderId: string;
  customerId: string;
  alterationDate: string; // ISO string or YYYY-MM-DD
  description: string;
  beforeNotes?: string;
  afterNotes?: string;
  handledBy: string;
}

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  rate: number;
  amount: number; // auto-calculated
}

export interface PaymentEntry {
  amount: number;
  date: string; // ISO string
  mode: "Cash" | "UPI" | "Card" | "Bank Transfer";
  recordedBy: string;
}

export type PaymentStatus = "Unpaid" | "Partially Paid" | "Paid";

export interface Invoice {
  id: string;
  customerId: string;
  invoiceNumber: string;
  invoiceDate: string; // ISO string
  linkedOrderId: string;
  lineItems: InvoiceLineItem[];
  subtotal: number;
  discount: number;
  taxPercent: number;
  taxAmount: number;
  grandTotal: number;
  advancePaid: number;
  balanceDue: number;
  paymentStatus: PaymentStatus;
  payments: PaymentEntry[];
  linkedAppointmentId?: string;
}

export type AppointmentType = "Measurement" | "Trial" | "Delivery";
export type AppointmentStatus = "Scheduled" | "Completed" | "Cancelled" | "No-Show";

export interface Appointment {
  id: string;
  customerId: string;
  type: AppointmentType;
  dateTime: string; // ISO string
  status: AppointmentStatus;
  notes?: string;
  orderId?: string;
  appointmentType?: string; // "Trial Fitting" | "Alteration Check" | "Bespoke Fitting"
  appointmentDate?: string; // YYYY-MM-DD
  appointmentTime?: string; // HH:MM
  trialCharge?: number;
  paymentStatus?: "Paid" | "Unpaid";
  linkedInvoiceId?: string;
  clothDropOffDate?: string; // Date cloth was handed over (iss din deke gye cloth)
  fittingPickupDate?: string; // Promised pickup date (iss din pickup krna h)
  pickupDate?: string;
  pickupTime?: string;
  readyDate?: string;
  readyTime?: string;
  trialStatus?: "Pending" | "Ready" | "In-Progress" | "Altered" | "Delivered";
  completedStatus?: "Pending" | "Completed" | "Cancelled";
}

export type ExpenseCategory = "Fabric Purchase" | "Tailoring Wages" | "Rent" | "Utilities" | "Miscellaneous";

export interface Expense {
  id: string;
  category: ExpenseCategory;
  amount: number;
  date: string; // ISO string
  notes?: string;
  supplier?: string;
  paymentMethod?: string;
}

export type UserRole = "Admin" | "Staff";

export interface User {
  id: string;
  name: string;
  role: UserRole;
  email: string;
  phone: string;
  active: boolean;
  photoUrl?: string;
}

export interface ShopConfig {
  shopName: string;
  tagline: string;
  address: string;
  phone1: string;
  phone2: string;
  logoUrl?: string;
  gstEnabled: boolean;
  gstNumber?: string;
  gstPercent: number;
  currencySymbol: string;
  garmentTypesConfig: string[];
  measurementFieldsConfig: {
    [garmentType: string]: string[];
  };
  garmentCategories?: GarmentCategory[];
  garmentCatalog?: GarmentCatalogItem[];
  measurementTemplates?: MeasurementTemplate[];
  autoBackupFrequency?: "Off" | "Daily" | "Weekly";
  lastAutoBackupTimestamp?: string;
}

export interface Worker {
  id: string;
  name: string;
  mobileNumber: string;
  address?: string;
  role: string; // e.g. "Tailor", "Helper", "Master"
  monthlySalary: number; // Monthly fixed salary
  dailyWages?: number; // Optional legacy field
  active: boolean;
  joiningDate: string; // YYYY-MM-DD or ISO
  photoUrl?: string;
}

export type AttendanceStatus = "Present" | "Absent" | "Half Day" | "Paid Leave" | "Checked In" | "Checked Out"; // "Paid Leave" is the free leave!

export interface AttendanceRecord {
  id: string;
  workerId: string;
  workerName?: string;
  date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  notes?: string;
  checkInTime?: string; // ISO string
  checkOutTime?: string; // ISO string
  totalHours?: number; // total working hours computed automatically
  createdAt?: string; // ISO string
  updatedAt?: string; // ISO string
}

export interface WorkerAdvance {
  id: string;
  workerId: string;
  amount: number;
  date: string; // YYYY-MM-DD
  notes?: string;
  repaid: boolean;
  repayDate?: string; // YYYY-MM-DD
}

export interface WorkerSalaryPayout {
  id: string;
  workerId: string;
  month: string; // YYYY-MM format
  calculatedSalary: number; // Base computed wages/salary
  presents: number; // count of present days
  halfDays: number; // count of half days
  absents: number; // count of absent days
  paidLeavesUsed: number; // count of paid leaves used (max 2 free)
  advanceDeductions: number; // advance amount deducted in this payout
  bonus: number; // any extra bonus
  netPaid: number; // calculatedSalary + bonus - advanceDeductions
  paymentDate: string; // YYYY-MM-DD
  notes?: string;
}

