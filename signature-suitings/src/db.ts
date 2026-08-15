/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Customer,
  Measurement,
  Order,
  Invoice,
  Appointment,
  Expense,
  User,
  ShopConfig,
  Trial,
  Alteration,
  MemoryNote,
  MeasurementChange,
  OrderStatus,
  PaymentEntry,
  PaymentStatus,
  InvoiceLineItem,
  Worker,
  AttendanceRecord,
  WorkerAdvance,
  WorkerSalaryPayout,
  AttendanceStatus,
  GarmentCategory,
  GarmentCatalogItem,
  MeasurementTemplate,
  GarmentLineItem
} from "./types";

import {
  defaultGarmentCategories,
  defaultMeasurementTemplates,
  defaultGarmentCatalog
} from "./defaultCatalogData";

import {
  initialShopConfig,
  initialUsers,
  initialCustomers,
  initialMeasurements,
  initialOrders,
  initialTrialsAndAlterations,
  initialInvoices,
  initialAppointments,
  initialExpenses
} from "./data";

import { supabase, isSupabaseConfigured } from "./supabase";

// Custom encryption/obfuscation key specifically tailored for Signature Showroom
const SECURE_SALT = "HardikNagpal_SignatureSuitings_10-15YearsSafePreservation_Gatekeeper_Secure";

export function obfuscateData(text: string): string {
  try {
    let result = "";
    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i);
      const saltCode = SECURE_SALT.charCodeAt(i % SECURE_SALT.length);
      const XORed = charCode ^ saltCode;
      result += String.fromCharCode(XORed);
    }
    return btoa(unescape(encodeURIComponent(result)));
  } catch (e) {
    return text;
  }
}

export function deobfuscateData(cipherText: string): string {
  try {
    const raw = decodeURIComponent(escape(atob(cipherText)));
    let result = "";
    for (let i = 0; i < raw.length; i++) {
      const charCode = raw.charCodeAt(i);
      const saltCode = SECURE_SALT.charCodeAt(i % SECURE_SALT.length);
      const XORed = charCode ^ saltCode;
      result += String.fromCharCode(XORed);
    }
    return result;
  } catch (e) {
    // Return original cipherText as fallback in case it was unencrypted/plain JSON
    return cipherText;
  }
}

// Helper to load from localStorage as offline backup cache
const loadKey = <T>(key: string, defaultValue: T): T => {
  try {
    if (typeof localStorage !== "undefined") {
      const data = localStorage.getItem(`sig_suit_${key}`);
      if (data) {
        try {
          const decrypted = deobfuscateData(data);
          return JSON.parse(decrypted);
        } catch (e) {
          try {
            return JSON.parse(data);
          } catch (innerError) {
            console.error(`Error parsing localStorage for ${key}`, innerError);
          }
        }
      }
    }
  } catch (e) {
    console.error(`Error reading localStorage key sig_suit_${key}`, e);
  }
  return defaultValue;
};

export const safeGetRawItem = (key: string): string | null => {
  try {
    if (typeof localStorage !== "undefined") {
      return localStorage.getItem(key);
    }
  } catch (e) {}
  return null;
};

// Helper to safely write to localStorage without crashing on QuotaExceededError
export const safeSetItem = (key: string, value: string): boolean => {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(key, value);
      return true;
    }
  } catch (e: any) {
    console.warn(`localStorage.setItem failed for key "${key}" due to quota limit:`, e);
    if (e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014 || e.message?.includes("exceeded"))) {
      try {
        if (typeof localStorage !== "undefined") localStorage.removeItem("showroom_user_photo");
      } catch (_) {}
    }
    return false;
  }
  return false;
};

export const safeRemoveItem = (key: string): void => {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(key);
    }
  } catch (e) {
    console.warn(`localStorage.removeItem failed for key "${key}":`, e);
  }
};

const SCHEMA_COLUMNS: Record<string, string[]> = {
  config: ['id', 'shopName', 'tagline', 'address', 'phone1', 'phone2', 'logoUrl', 'gstEnabled', 'gstNumber', 'gstPercent', 'currencySymbol', 'garmentTypesConfig', 'measurementFieldsConfig', 'garmentCategories', 'garmentCatalog', 'measurementTemplates', 'updated_at'],
  users: ['id', 'name', 'role', 'email', 'phone', 'active', 'photoUrl', 'created_at', 'updated_at'],
  customers: ['id', 'fullName', 'mobileNumber', 'alternateNumber', 'address', 'email', 'dob', 'preferredFabricBrands', 'generalNotes', 'customerSince', 'totalOrdersCount', 'outstandingBalance', 'qrCodeId', 'photoUrl', 'memoryNotes', 'preferenceTags', 'created_at', 'updated_at'],
  measurements: ['id', 'customerId', 'versionDate', 'slipNumber', 'tryOnDate', 'deliveryDate', 'coatIndoWestern', 'pent', 'vest', 'shirtKurta', 'designNotes', 'fabricSelected', 'liningChoice', 'remarks', 'createdBy', 'changesSincePrevious', 'created_at', 'updated_at'],
  orders: ['id', 'customerId', 'orderNumber', 'orderDate', 'garmentTypes', 'garmentLineItems', 'linkedMeasurementVersionId', 'fabricDetails', 'expectedDeliveryDate', 'actualDeliveryDate', 'status', 'statusHistory', 'assignedTailor', 'linkedInvoiceId', 'notes', 'totalAmount', 'advancePaid', 'created_at', 'updated_at'],
  trials: ['id', 'orderId', 'customerId', 'trialDate', 'feedback', 'alterationRequired', 'conductedBy', 'created_at', 'updated_at'],
  alterations: ['id', 'orderId', 'customerId', 'alterationDate', 'description', 'beforeNotes', 'afterNotes', 'handledBy', 'created_at', 'updated_at'],
  invoices: ['id', 'customerId', 'invoiceNumber', 'invoiceDate', 'linkedOrderId', 'lineItems', 'subtotal', 'discount', 'taxPercent', 'taxAmount', 'grandTotal', 'advancePaid', 'balanceDue', 'paymentStatus', 'payments', 'linkedAppointmentId', 'created_at', 'updated_at'],
  appointments: ['id', 'customerId', 'type', 'dateTime', 'status', 'notes', 'orderId', 'appointmentType', 'appointmentDate', 'appointmentTime', 'trialCharge', 'paymentStatus', 'linkedInvoiceId', 'clothDropOffDate', 'fittingPickupDate', 'pickupDate', 'pickupTime', 'readyDate', 'readyTime', 'trialStatus', 'completedStatus', 'created_at', 'updated_at'],
  expenses: ['id', 'category', 'amount', 'date', 'notes', 'supplier', 'paymentMethod', 'created_at', 'updated_at'],
  workers: ['id', 'name', 'mobileNumber', 'address', 'role', 'dailyWages', 'monthlySalary', 'active', 'joiningDate', 'photoUrl', 'created_at', 'updated_at'],
  attendance: ['id', 'workerId', 'date', 'status', 'notes', 'created_at', 'updated_at'],
  advances: ['id', 'workerId', 'amount', 'date', 'notes', 'repaid', 'repayDate', 'created_at', 'updated_at'],
  salaries: ['id', 'workerId', 'month', 'calculatedSalary', 'presents', 'halfDays', 'absents', 'paidLeavesUsed', 'advanceDeductions', 'bonus', 'netPaid', 'paymentDate', 'notes', 'created_at', 'updated_at']
};

// Marks that the bundled demonstration dataset has already been purged from this install.
const DEMO_PURGE_FLAG = "sig_suit_demo_data_purged_v1";

// Tag used to archive a customer instead of destroying their financial history.
export const ARCHIVED_TAG = "Archived";

/**
 * Attendance is one record per worker per day, so its id is derived from those two values
 * rather than being random. Two devices marking the same worker present on the same date now
 * produce the same id and upsert over each other instead of creating duplicate rows.
 * Mirrors the unique index added in supabase_migration_v2.sql.
 */
export function attendanceRecordId(workerId: string, date: string): string {
  const safeWorker = String(workerId || "unknown").replace(/[^a-zA-Z0-9_-]/g, "");
  const safeDate = String(date || "").replace(/[^0-9-]/g, "");
  return `att_${safeWorker}_${safeDate}`;
}

// Persisted registry of deleted record ids. Without this, the local<->cloud merge treats a
// record that exists locally but not remotely as "needs re-upload", which resurrects anything
// deleted on another device or in an earlier session.
const TOMBSTONE_KEY = "sig_suit_tombstones_v1";

// Tombstones older than this are pruned; by then the deletion has propagated everywhere.
const TOMBSTONE_TTL_MS = 120 * 24 * 60 * 60 * 1000; // 120 days

export type TombstoneMap = Record<string, Record<string, number>>;

// Durable queue of cloud writes that have not been confirmed by Supabase yet.
const OUTBOX_KEY = "sig_suit_pending_writes_v1";
const OUTBOX_MAX_ENTRIES = 2000;
const OUTBOX_RETRY_MS = 20000;

export interface PendingWrite {
  op: "upsert" | "delete";
  table: string;
  recordId: string;
  payload?: any;
  attempts: number;
  lastError: string;
  queuedAt: number;
  lastAttemptAt: number;
}

// Business tables that participate in sync, backup and restore.
export const BUSINESS_TABLES = [
  "users",
  "customers",
  "measurements",
  "orders",
  "trials",
  "alterations",
  "invoices",
  "appointments",
  "expenses",
  "workers",
  "attendance",
  "advances",
  "salaries"
] as const;

export function stripEmbeddedTags(text?: string): string {
  if (!text) return "";
  let clean = text
    .replace(/\/\*[A-Z_]+:[\s\S]*?\*\//g, "")
    .replace(/(GARMENT_ITEMS|STATUS_HIST|LINE_ITEMS|PAYMENTS|MEAS_SPEC|CUST_PREF|CFG_DATA):\s*(\[[\s\S]*?\]|\{[\s\S]*?\})/g, "")
    .replace(/\[\s*\{[\s\S]*?\}\s*\]/g, "")
    .replace(/\{\s*"[a-zA-Z0-9_]+"\s*:[\s\S]*?\}/g, "")
    .trim();

  if (clean === "[object Object]" || clean === "null" || clean === "undefined") {
    return "";
  }
  return clean;
}

export function encodeEmbeddedJSON(baseText: string | undefined, tag: string, payload: any): string {
  const regex = new RegExp(`\\/\\*${tag}:[\\s\\S]*?\\*\\/`, "g");
  const cleanedText = (baseText || "").replace(regex, "").trim();
  if (payload === undefined || payload === null) return cleanedText;
  if (Array.isArray(payload) && payload.length === 0) return cleanedText;
  try {
    const jsonStr = JSON.stringify(payload);
    return `${cleanedText} /*${tag}:${jsonStr}*/`.trim();
  } catch (e) {
    return cleanedText;
  }
}

export function decodeEmbeddedJSON<T>(baseText: string | undefined, tag: string): T | null {
  if (!baseText) return null;
  const match = baseText.match(new RegExp(`\\/\\*${tag}:([\\s\\S]*?)\\*\\/`));
  if (match && match[1]) {
    try {
      return JSON.parse(match[1]) as T;
    } catch (e) {
      console.warn(`Failed parsing embedded JSON for tag ${tag}:`, e);
    }
  }
  return null;
}

export function sanitizeRecordForTable(tableName: string, record: any): any {
  if (!record || typeof record !== "object") return record;
  const allowedCols = SCHEMA_COLUMNS[tableName];
  if (!allowedCols) return record;
  
  const clean: any = {};
  for (const col of allowedCols) {
    if (record[col] !== undefined) {
      let val = record[col];
      // Convert empty strings or invalid falsy values for foreign keys to null to protect referential integrity
      if (
        (col === "linkedMeasurementVersionId" || 
         col === "linkedInvoiceId" || 
         col === "linkedOrderId" || 
         col === "orderId" || 
         col === "customerId" || 
         col === "workerId" ||
         col === "linkedAppointmentId") && 
        (val === "" || val === null || val === undefined)
      ) {
        val = null;
      }
      clean[col] = val;
    }
  }

  const nowIso = new Date().toISOString();
  const dateStr = nowIso.split("T")[0];

  // Supply required non-null defaults for database constraints
  if (tableName === "config") {
    clean.id = clean.id || "global_config";
    clean.shopName = clean.shopName || "Signature Suitings";
    const configPayload = {
      garmentTypesConfig: record.garmentTypesConfig,
      measurementFieldsConfig: record.measurementFieldsConfig,
      garmentCategories: record.garmentCategories,
      garmentCatalog: record.garmentCatalog,
      measurementTemplates: record.measurementTemplates
    };
    clean.tagline = encodeEmbeddedJSON(clean.tagline, "CFG_DATA", configPayload);
  } else if (tableName === "users") {
    clean.id = clean.id || "usr_" + Date.now();
    clean.name = clean.name || "User";
    clean.email = clean.email || "user@example.com";
    clean.role = (clean.role === "Admin" || clean.role === "Staff") ? clean.role : "Admin";
  } else if (tableName === "customers") {
    clean.id = clean.id || "cust_" + Date.now();
    clean.fullName = clean.fullName || "Customer";
    clean.mobileNumber = clean.mobileNumber || "N/A";
    clean.customerSince = clean.customerSince || nowIso;
    clean.qrCodeId = clean.qrCodeId || ("qr_" + String(clean.fullName).toLowerCase().replace(/\s+/g, "_") + "_" + Date.now());
    if (record.preferenceTags || record.preferredFabricBrands) {
      clean.generalNotes = encodeEmbeddedJSON(clean.generalNotes, "CUST_PREF", {
        preferenceTags: record.preferenceTags,
        preferredFabricBrands: record.preferredFabricBrands
      });
    }
  } else if (tableName === "workers") {
    clean.id = clean.id || "worker_" + Date.now();
    clean.name = clean.name || "Worker";
    clean.mobileNumber = clean.mobileNumber || "N/A";
    clean.joiningDate = clean.joiningDate || dateStr;
    clean.role = clean.role || "Tailor";
    clean.monthlySalary = clean.monthlySalary !== undefined ? Number(clean.monthlySalary) : (clean.dailyWages !== undefined ? Number(clean.dailyWages) * 30 : 18000);
    clean.dailyWages = clean.dailyWages !== undefined ? Number(clean.dailyWages) : Math.round(clean.monthlySalary / 30);
    clean.active = clean.active !== undefined ? Boolean(clean.active) : true;
  } else if (tableName === "expenses") {
    clean.id = clean.id || "exp_" + Date.now();
    clean.category = clean.category || "General";
    clean.date = clean.date || dateStr;
  } else if (tableName === "measurements") {
    clean.id = clean.id || "meas_" + Date.now();
    clean.versionDate = clean.versionDate || dateStr;
    clean.slipNumber = clean.slipNumber || ("SLIP-" + Date.now());
    const measPayload = {
      coatIndoWestern: record.coatIndoWestern,
      pent: record.pent,
      vest: record.vest,
      shirtKurta: record.shirtKurta
    };
    clean.remarks = encodeEmbeddedJSON(clean.remarks, "MEAS_SPEC", measPayload);
  } else if (tableName === "orders") {
    clean.id = clean.id || "ord_" + Date.now();
    clean.orderNumber = clean.orderNumber || ("ORD-" + Date.now());
    clean.orderDate = clean.orderDate || dateStr;
    clean.expectedDeliveryDate = clean.expectedDeliveryDate || clean.orderDate || dateStr;
    clean.status = clean.status || "Booked";
    if (record.garmentLineItems && Array.isArray(record.garmentLineItems) && record.garmentLineItems.length > 0) {
      clean.notes = encodeEmbeddedJSON(clean.notes, "GARMENT_ITEMS", record.garmentLineItems);
    }
    if (record.statusHistory && Array.isArray(record.statusHistory) && record.statusHistory.length > 0) {
      clean.notes = encodeEmbeddedJSON(clean.notes, "STATUS_HIST", record.statusHistory);
    }
  } else if (tableName === "trials") {
    clean.id = clean.id || "trl_" + Date.now();
    clean.trialDate = clean.trialDate || dateStr;
  } else if (tableName === "alterations") {
    clean.id = clean.id || "alt_" + Date.now();
    clean.alterationDate = clean.alterationDate || dateStr;
    clean.description = clean.description || "Alteration Request";
  } else if (tableName === "invoices") {
    clean.id = clean.id || "inv_" + Date.now();
    clean.invoiceNumber = clean.invoiceNumber || ("INV-" + Date.now());
    clean.invoiceDate = clean.invoiceDate || dateStr;
    clean.paymentStatus = clean.paymentStatus || "Unpaid";
    if (record.lineItems && Array.isArray(record.lineItems) && record.lineItems.length > 0) {
      clean.notes = encodeEmbeddedJSON(clean.notes, "LINE_ITEMS", record.lineItems);
    }
    if (record.payments && Array.isArray(record.payments) && record.payments.length > 0) {
      clean.notes = encodeEmbeddedJSON(clean.notes, "PAYMENTS", record.payments);
    }
  } else if (tableName === "appointments") {
    clean.id = clean.id || "app_" + Date.now();
    clean.dateTime = clean.dateTime || nowIso;
    clean.type = clean.type || "Fitting";
    clean.status = clean.status || "Scheduled";
  } else if (tableName === "attendance") {
    clean.id = clean.id || "att_" + Date.now();
    clean.workerId = record.workerId || clean.workerId || null;
    clean.date = clean.date || dateStr;
    clean.status = clean.status || "Present";
    const attExt = {
      workerName: record.workerName,
      checkInTime: record.checkInTime,
      checkOutTime: record.checkOutTime,
      totalHours: record.totalHours,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    };
    if (record.workerName || record.checkInTime || record.checkOutTime || record.totalHours !== undefined) {
      clean.notes = encodeEmbeddedJSON(clean.notes || record.notes || "", "ATT_EXT", attExt);
    }
  } else if (tableName === "advances") {
    clean.id = clean.id || "adv_" + Date.now();
    clean.workerId = record.workerId || clean.workerId || null;
    clean.amount = clean.amount !== undefined ? Number(clean.amount) : 0;
    clean.date = clean.date || dateStr;
    clean.repaid = clean.repaid !== undefined ? Boolean(clean.repaid) : false;
  } else if (tableName === "salaries") {
    clean.id = clean.id || "sal_" + Date.now();
    clean.workerId = record.workerId || clean.workerId || null;
    clean.month = clean.month || nowIso.slice(0, 7);
    clean.calculatedSalary = clean.calculatedSalary !== undefined ? Number(clean.calculatedSalary) : 0;
    clean.netPaid = clean.netPaid !== undefined ? Number(clean.netPaid) : 0;
    clean.paymentDate = clean.paymentDate || dateStr;
  }

  return clean;
}

export async function safeUpsertSupabaseTable(tableName: string, recordOrRecords: any | any[]): Promise<{ data: any; error: any }> {
  if (!isSupabaseConfigured) return { data: null, error: null };

  const isArray = Array.isArray(recordOrRecords);
  let payload: any[] = isArray
    ? recordOrRecords.map(item => sanitizeRecordForTable(tableName, item))
    : [sanitizeRecordForTable(tableName, recordOrRecords)];

  try {
    let result = await supabase.from(tableName).upsert(payload);

    let retries = 0;
    while (result.error && result.error.code === "PGRST204" && retries < 15) {
      retries++;
      const msg = result.error?.message || "";
      const match = msg.match(/Could not find the '([^']+)' column/i) || msg.match(/column ['"]?([a-zA-Z0-9_]+)['"]? of/i);
      if (match && match[1]) {
        const missingCol = match[1];
        console.warn(`[Supabase Schema Align] Column '${missingCol}' does not exist on remote Supabase table '${tableName}'. Stripping '${missingCol}' from payload and retrying...`);
        payload = payload.map((item: any) => {
          const clone = { ...item };
          delete clone[missingCol];
          return clone;
        });
        result = await supabase.from(tableName).upsert(payload);
      } else {
        break;
      }
    }

    if (result.error) {
      const errMsg = String(result.error.message || result.error);
      if (errMsg.includes("Failed to fetch") || errMsg.includes("NetworkError") || !result.error.code) {
        return {
          data: null,
          error: {
            message: errMsg,
            code: "NETWORK_OFFLINE",
            isNetworkError: true,
            details: result.error.details || null,
            hint: result.error.hint || null
          }
        };
      }
    }

    return result;
  } catch (err: any) {
    const msg = String(err?.message || err || "Network request failed");
    console.warn(`[Supabase Network Guard] Table '${tableName}' upsert deferred (offline or connection paused): ${msg}`);
    return {
      data: null,
      error: {
        message: msg,
        code: "NETWORK_OFFLINE",
        isNetworkError: true,
        details: null,
        hint: null
      }
    };
  }
}

// Initialize Database State
export class TailorDatabase {
  private config: ShopConfig;
  private users: User[];
  private customers: Customer[];
  private measurements: Measurement[];
  private orders: Order[];
  private trials: Trial[];
  private alterations: Alteration[];
  private invoices: Invoice[];
  private appointments: Appointment[];
  private expenses: Expense[];
  private workers: Worker[];
  private attendance: AttendanceRecord[];
  private advances: WorkerAdvance[];
  private salaries: WorkerSalaryPayout[];
  private garmentCategories: GarmentCategory[];
  private measurementTemplates: MeasurementTemplate[];
  private garmentCatalog: GarmentCatalogItem[];

  // Reactive listeners for live updates
  private syncCallbacks: (() => void)[] = [];
  public supabaseQueue: Promise<any> = Promise.resolve();
  public isSyncing: boolean = false;
  public syncErrors: string[] = [];
  public connectionError: string | null = null;
  public isRestoring: boolean = false;
  private mutationGeneration: number = 0;

  // Realtime & Multi-tab synchronization
  public readonly tabInstanceId: string = typeof crypto !== "undefined" && (crypto as any).randomUUID ? (crypto as any).randomUUID() : ("tab_" + Date.now() + "_" + Math.random().toString(36).substring(2, 9));
  private crossTabChannel: BroadcastChannel | null = null;
  private realtimeChannel: any = null;
  private isReconnecting: boolean = false;
  private reconnectTimer: any = null;
  private reconnectAttempts: number = 0;

  // Deleted-record registry: table -> { recordId -> deletedAtEpochMs }
  private tombstones: TombstoneMap = {};

  public async waitForSync(): Promise<void> {
    try {
      await this.supabaseQueue;
    } catch (e) {
      console.warn("waitForSync queue resolved with error:", e);
    }
  }

  /**
   * Last-modified time of a record in epoch ms, or null when the record carries no usable
   * timestamp. Returning null (rather than 0) lets callers tell "unknown" apart from "epoch",
   * which matters for conflict resolution.
   */
  private getRecordTimestamp(record: any): number | null {
    if (!record) return null;
    const candidates = [
      record.updatedAt,
      record.updated_at,
      record.created_at,
      record.orderDate,
      record.versionDate,
      record.invoiceDate
    ];
    for (const c of candidates) {
      if (!c) continue;
      const t = new Date(c).getTime();
      if (!isNaN(t)) return t;
    }
    return null;
  }

  /**
   * Stamps a record as modified now. Without this, edits to records that only carry a
   * created_at look identical in age to the cloud copy, so an offline edit would be discarded
   * by the next merge instead of winning.
   */
  private stamp<T extends Record<string, any>>(record: T): T {
    const nowIso = new Date().toISOString();
    (record as any).updatedAt = nowIso;
    (record as any).updated_at = nowIso;
    return record;
  }

  // --- DELETION TOMBSTONES ---
  private loadTombstones() {
    const raw = safeGetRawItem(TOMBSTONE_KEY);
    if (!raw) {
      this.tombstones = {};
      return;
    }
    try {
      const parsed = JSON.parse(deobfuscateData(raw));
      this.tombstones = parsed && typeof parsed === "object" ? parsed : {};
    } catch (e) {
      this.tombstones = {};
    }
    this.pruneTombstones();
  }

  private pruneTombstones() {
    const cutoff = Date.now() - TOMBSTONE_TTL_MS;
    let mutated = false;
    for (const table of Object.keys(this.tombstones)) {
      const entries = this.tombstones[table] || {};
      for (const id of Object.keys(entries)) {
        if (!entries[id] || entries[id] < cutoff) {
          delete entries[id];
          mutated = true;
        }
      }
      if (Object.keys(entries).length === 0) {
        delete this.tombstones[table];
        mutated = true;
      }
    }
    if (mutated) this.saveTombstones();
  }

  private saveTombstones() {
    safeSetItem(TOMBSTONE_KEY, obfuscateData(JSON.stringify(this.tombstones)));
  }

  /** Record that `id` was deleted from `table` so no sync path can bring it back. */
  public markDeleted(table: string, id: string) {
    if (!table || !id) return;
    if (!this.tombstones[table]) this.tombstones[table] = {};
    this.tombstones[table][id] = Date.now();
    this.saveTombstones();
  }

  public isDeleted(table: string, id: string): boolean {
    return Boolean(id && this.tombstones[table] && this.tombstones[table][id]);
  }

  /** Clears a tombstone — used when a record is deliberately re-created or restored from backup. */
  public clearTombstone(table: string, id: string) {
    if (this.tombstones[table] && this.tombstones[table][id]) {
      delete this.tombstones[table][id];
      this.saveTombstones();
    }
  }

  public clearAllTombstones() {
    this.tombstones = {};
    this.saveTombstones();
  }

  private tableStateKey(table: string): string | null {
    const map: Record<string, string> = {
      users: "users",
      customers: "customers",
      measurements: "measurements",
      orders: "orders",
      trials: "trials",
      alterations: "alterations",
      invoices: "invoices",
      appointments: "appointments",
      expenses: "expenses",
      workers: "workers",
      attendance: "attendance",
      advances: "advances",
      salaries: "salaries"
    };
    return map[table] || null;
  }

  /**
   * Strips any record from in-memory state that carries a tombstone.
   * Returns true when something was removed. Persistence is left to the caller so this can
   * run during construction, before the catalog fields are initialised.
   */
  private applyTombstonesToLocalState(): boolean {
    let mutated = false;
    for (const table of Object.keys(this.tombstones)) {
      const key = this.tableStateKey(table);
      if (!key) continue;
      const list = (this as any)[key];
      if (!Array.isArray(list)) continue;
      const filtered = list.filter((item: any) => !(item && this.isDeleted(table, item.id)));
      if (filtered.length !== list.length) {
        (this as any)[key] = filtered;
        mutated = true;
      }
    }
    return mutated;
  }

  /**
   * Removes the sample dataset that shipped with earlier builds. Runs once per install.
   * The ids are tombstoned so the first cloud sync also clears them from Supabase rather
   * than pulling them back down.
   */
  private purgeBundledDemoData() {
    const demoIds: Array<[string, string[]]> = [
      ["customers", initialCustomers.map(c => c.id)],
      ["measurements", initialMeasurements.map(m => m.id)],
      ["orders", initialOrders.map(o => o.id)],
      ["invoices", initialInvoices.map(i => i.id)],
      ["trials", initialTrialsAndAlterations.trials.map(t => t.id)],
      ["alterations", initialTrialsAndAlterations.alterations.map(a => a.id)],
      ["appointments", initialAppointments.map(a => a.id)],
      ["expenses", initialExpenses.map(e => e.id)],
      // Legacy placeholder ids from pre-release builds
      ["workers", ["worker-1", "worker-2", "worker-3"]],
      ["attendance", ["att-1", "att-2"]],
      ["advances", ["adv-1", "adv-2"]],
      ["salaries", ["sal-1", "sal-2"]]
    ];

    for (const [table, ids] of demoIds) {
      ids.forEach(id => this.markDeleted(table, id));
    }
    console.log("[Signature Suitings] Bundled demonstration dataset purged. Showroom starts from an empty ledger.");
  }

  constructor() {
    // Load persisted tombstones before any data so deleted records can never be revived.
    this.loadTombstones();
    // Restore cloud writes that never got confirmed in a previous session (offline, crash, or
    // app closed mid-save). They are retried as soon as connectivity returns.
    this.loadOutbox();

    // One-time purge of the bundled demonstration dataset. Older builds shipped sample
    // customers/orders/invoices and re-inserted them on every boot, so deleting a demo
    // record never stuck and fake receivables showed on the dashboard. This runs once and
    // removes those records permanently (locally and, on first sync, in Supabase too).
    if (typeof localStorage !== "undefined" && !localStorage.getItem(DEMO_PURGE_FLAG)) {
      this.purgeBundledDemoData();
      safeSetItem(DEMO_PURGE_FLAG, "true");
    }

    // Standard bootstrap from cache
    this.config = loadKey("config", initialShopConfig);
    this.users = loadKey("users", initialUsers);
    this.customers = loadKey("customers", []);
    this.measurements = loadKey("measurements", []);
    this.orders = loadKey("orders", []);
    this.trials = loadKey("trials", []);
    this.alterations = loadKey("alterations", []);
    this.invoices = loadKey<any[]>("invoices", []).map((inv: any) => {
      const grandTotal = parseFloat(String(inv.grandTotal !== undefined && inv.grandTotal !== null ? inv.grandTotal : (inv.totalAmount !== undefined && inv.totalAmount !== null ? inv.totalAmount : 0))) || 0;
      const advancePaid = parseFloat(String(inv.advancePaid !== undefined && inv.advancePaid !== null ? inv.advancePaid : (inv.paidAmount !== undefined && inv.paidAmount !== null ? inv.paidAmount : 0))) || 0;
      const subtotal = parseFloat(String(inv.subtotal !== undefined && inv.subtotal !== null ? inv.subtotal : grandTotal)) || 0;
      const discount = parseFloat(String(inv.discount !== undefined && inv.discount !== null ? inv.discount : 0)) || 0;
      const taxPercent = parseFloat(String(inv.taxPercent !== undefined && inv.taxPercent !== null ? inv.taxPercent : (inv.taxPercentage !== undefined && inv.taxPercentage !== null ? inv.taxPercentage : 0))) || 0;
      const taxAmount = parseFloat(String(inv.taxAmount !== undefined && inv.taxAmount !== null ? inv.taxAmount : 0)) || 0;
      const balanceDue = parseFloat(String(inv.balanceDue !== undefined && inv.balanceDue !== null ? inv.balanceDue : (grandTotal - advancePaid))) || 0;
      const payments = inv.payments !== undefined && inv.payments !== null ? inv.payments : (inv.paymentsHistory !== undefined && inv.paymentsHistory !== null ? inv.paymentsHistory : []);
      const linkedOrderId = inv.linkedOrderId !== undefined && inv.linkedOrderId !== null ? inv.linkedOrderId : (inv.orderId !== undefined && inv.orderId !== null ? inv.orderId : "");

      return {
        ...inv,
        grandTotal,
        advancePaid,
        subtotal,
        discount,
        taxPercent,
        taxAmount,
        balanceDue,
        payments,
        linkedOrderId
      };
    });

    this.appointments = loadKey("appointments", []);
    this.expenses = loadKey("expenses", []);
    this.workers = loadKey("workers", []);
    this.attendance = loadKey("attendance", []);
    this.advances = loadKey("advances", []);
    this.salaries = loadKey("salaries", []);

    // Drop anything that was deleted previously but lingered in a stale cache.
    this.applyTombstonesToLocalState();

    // Bootstrap garment categories, templates, and catalog
    this.garmentCategories = loadKey("garmentCategories", defaultGarmentCategories);
    this.measurementTemplates = loadKey("measurementTemplates", defaultMeasurementTemplates);
    this.garmentCatalog = loadKey("garmentCatalog", defaultGarmentCatalog);

    // Sync to shop config object
    this.config.garmentCategories = this.garmentCategories;
    this.config.measurementTemplates = this.measurementTemplates;
    this.config.garmentCatalog = this.garmentCatalog;

    // Save back to ensure defaults are written
    this.saveAllLocal();
    this.recalculateAllBalances();

    // Setup multi-tab broadcast & storage listeners
    this.setupStorageListener();
    this.setupCrossTabChannel();
    this.setupConnectivityListener();

    // Trigger Supabase Background Cloud Sync and Realtime
    this.initializeSupabaseSync();

    // Push anything left over from the previous session.
    if (this.outbox.length > 0) this.scheduleOutboxFlush(2000);
  }

  // --- REACTIVE REFRESH REGISTRATION ---
  public onSync(callback: () => void) {
    this.syncCallbacks.push(callback);
    return () => {
      this.syncCallbacks = this.syncCallbacks.filter(cb => cb !== callback);
    };
  }

  private triggerSyncChange() {
    this.syncCallbacks.forEach(cb => {
      try { cb(); } catch (err) { console.error("Sync callback execution failed:", err); }
    });
  }

  // --- LOCAL PERSISTENCE BACKUP ---
  private saveKeyLocal<T>(key: string, value: T): void {
    const jsonStr = JSON.stringify(value);
    const encryptedStr = obfuscateData(jsonStr);
    safeSetItem(`sig_suit_${key}`, encryptedStr);
    this.triggerSyncChange();
  }

  private saveAllLocal() {
    const saveEncrypted = (key: string, val: any) => {
      safeSetItem(`sig_suit_${key}`, obfuscateData(JSON.stringify(val)));
    };
    saveEncrypted("config", {
      ...this.config,
      garmentCategories: this.garmentCategories,
      measurementTemplates: this.measurementTemplates,
      garmentCatalog: this.garmentCatalog
    });
    saveEncrypted("garmentCategories", this.garmentCategories);
    saveEncrypted("measurementTemplates", this.measurementTemplates);
    saveEncrypted("garmentCatalog", this.garmentCatalog);
    saveEncrypted("users", this.users);
    saveEncrypted("customers", this.customers);
    saveEncrypted("measurements", this.measurements);
    saveEncrypted("orders", this.orders);
    saveEncrypted("trials", this.trials);
    saveEncrypted("alterations", this.alterations);
    saveEncrypted("invoices", this.invoices);
    saveEncrypted("appointments", this.appointments);
    saveEncrypted("expenses", this.expenses);
    saveEncrypted("workers", this.workers);
    saveEncrypted("attendance", this.attendance);
    saveEncrypted("advances", this.advances);
    saveEncrypted("salaries", this.salaries);
  }

  // Flush and reset background write queue to prevent race conditions during sync/restore
  public async flushSupabaseQueue(): Promise<void> {
    try {
      await this.supabaseQueue;
    } catch (e) {
      // ignore previous queue errors
    }
    this.supabaseQueue = Promise.resolve();
  }

  // --- SUPABASE INTUITIVE LIVE SYNCHRONIZER & AUTO-MIGRATOR ---
  public async initializeSupabaseSync(forceOverwriteSupabase: boolean = false) {
    if (!isSupabaseConfigured) {
      console.log("Supabase is not configured yet. Running on LocalStorage Cache.");
      return;
    }

    if (this.isRestoring && !forceOverwriteSupabase) {
      console.log("[Supabase Sync] Skipping normal background sync because database restoration is active.");
      return;
    }

    this.isSyncing = true;
    this.syncErrors = [];
    this.connectionError = null;
    this.triggerSyncChange();

    try {
      console.log("Initializing Supabase Sync & Auto-Migration... Force Overwrite:", forceOverwriteSupabase);

      // Flush any queued single-item writes/deletes before bulk sync to avoid race conditions
      await this.flushSupabaseQueue();

      if (forceOverwriteSupabase) {
        console.log("Force Overwriting Supabase tables with restored local backup...");
        // 1. Delete all tables in reverse dependency order to prevent foreign key errors:
        const tablesToDeleteInOrder = [
          "invoices",
          "trials",
          "alterations",
          "orders",
          "appointments",
          "attendance",
          "advances",
          "salaries",
          "measurements",
          "workers",
          "customers",
          "users",
          "expenses",
          "config"
        ];
        for (const table of tablesToDeleteInOrder) {
          console.log(`Clearing remote table: ${table}...`);
          const { error } = await supabase.from(table).delete().neq("id", "_none_");
          if (error) {
            console.error(`Error clearing table ${table} during force-overwrite:`, error);
            throw new Error(`Failed to clear database table '${table}': ${error.message}`);
          }
        }

        // 2. Clear migration flags in localStorage to force push:
        const tables = Object.keys(SCHEMA_COLUMNS);
        tables.forEach(table => {
          safeSetItem(`sig_suit_migrated_${table}`, "false");
        });
      }

      // 1. Sync Config
      if (forceOverwriteSupabase) {
        console.log("Force-upserting config to Supabase...");
        const { error: configUpsertError } = await safeUpsertSupabaseTable("config", { id: "global_config", ...this.config });
        if (configUpsertError) {
          console.error(`Error upserting config: ${configUpsertError.message}`);
          this.syncErrors.push(`config: ${configUpsertError.message}`);
          throw new Error(`Failed restoring 'config': ${configUpsertError.message}`);
        } else {
          safeSetItem("sig_suit_migrated_config", "true");
        }
      } else {
        const { data: remoteConfig, error: configError } = await supabase.from("config").select("*");
        if (configError) {
          console.error(`Error syncing config: ${configError.message}`);
          this.syncErrors.push("config");
          this.connectionError = configError.message;
        } else if (remoteConfig && remoteConfig.length > 0) {
          const { id, updated_at, ...rest } = remoteConfig[0];
          this.config = rest;
          safeSetItem("sig_suit_migrated_config", "true");
        } else {
          const isConfigMigrated = safeGetRawItem("sig_suit_migrated_config") === "true";
          if (!isConfigMigrated) {
            const { error: configUpsertError } = await safeUpsertSupabaseTable("config", { id: "global_config", ...this.config });
            if (configUpsertError) {
              console.error(`Error upserting config: ${configUpsertError.message}`);
              this.syncErrors.push("config");
            } else {
              safeSetItem("sig_suit_migrated_config", "true");
            }
          }
        }
      }

      // Helper function to sync a table with non-destructive local-cloud merge
      const syncTable = async (tableName: string, localData: any[], stateKey: string) => {
        if (forceOverwriteSupabase) {
          if (localData.length > 0) {
            console.log(`Force-restoring table ${tableName} to Supabase with ${localData.length} records...`);
            
            // Batch upserts in chunks of 100
            const CHUNK_SIZE = 100;
            for (let i = 0; i < localData.length; i += CHUNK_SIZE) {
              const chunk = localData.slice(i, i + CHUNK_SIZE);
              const { error: upsertError } = await safeUpsertSupabaseTable(tableName, chunk);
              if (upsertError) {
                console.error(`Error force-upserting local data to table ${tableName}: ${upsertError.message}`);
                this.syncErrors.push(`${tableName}: ${upsertError.message}`);
                throw new Error(`Failed restoring table '${tableName}': ${upsertError.message}`);
              }
            }
            safeSetItem(`sig_suit_migrated_${tableName}`, "true");
          } else {
            safeSetItem(`sig_suit_migrated_${tableName}`, "true");
          }
          return;
        }

        const { data: remoteData, error } = await supabase.from(tableName).select("*");
        if (error) {
          console.error(`Error syncing table ${tableName}: ${error.message}`);
          this.syncErrors.push(tableName);
          return;
        }

        // NON-DESTRUCTIVE MERGE:
        // Combine remoteData with localData by ID so that offline/local edits are NEVER lost.
        const mergedMap = new Map<string, any>();

        // 1. Fill map with remote items first
        if (remoteData && Array.isArray(remoteData)) {
          remoteData.forEach((item: any) => {
            if (item && item.id) {
              // A record deleted here must not be pulled back down. Re-issue the remote
              // delete so the deletion converges instead of ping-ponging between devices.
              if (this.isDeleted(tableName, item.id)) {
                this.deleteFromSupabase(tableName, item.id, { alreadyTombstoned: true });
                return;
              }
              if (tableName === "orders") {
                const embeddedLines = decodeEmbeddedJSON<any[]>(item.notes, "GARMENT_ITEMS");
                if (embeddedLines && Array.isArray(embeddedLines) && embeddedLines.length > 0) {
                  item.garmentLineItems = item.garmentLineItems && item.garmentLineItems.length > 0 ? item.garmentLineItems : embeddedLines;
                }
                const embeddedHist = decodeEmbeddedJSON<any[]>(item.notes, "STATUS_HIST");
                if (embeddedHist && Array.isArray(embeddedHist) && embeddedHist.length > 0) {
                  item.statusHistory = item.statusHistory && item.statusHistory.length > 0 ? item.statusHistory : embeddedHist;
                }
              } else if (tableName === "invoices") {
                const embeddedLineItems = decodeEmbeddedJSON<any[]>(item.notes, "LINE_ITEMS");
                if (embeddedLineItems && Array.isArray(embeddedLineItems) && embeddedLineItems.length > 0) {
                  item.lineItems = item.lineItems && item.lineItems.length > 0 ? item.lineItems : embeddedLineItems;
                }
                const embeddedPayments = decodeEmbeddedJSON<any[]>(item.notes, "PAYMENTS");
                if (embeddedPayments && Array.isArray(embeddedPayments) && embeddedPayments.length > 0) {
                  item.payments = item.payments && item.payments.length > 0 ? item.payments : embeddedPayments;
                }
              } else if (tableName === "measurements") {
                const embeddedMeas = decodeEmbeddedJSON<any>(item.remarks, "MEAS_SPEC");
                if (embeddedMeas) {
                  item.coatIndoWestern = item.coatIndoWestern || embeddedMeas.coatIndoWestern;
                  item.pent = item.pent || embeddedMeas.pent;
                  item.vest = item.vest || embeddedMeas.vest;
                  item.shirtKurta = item.shirtKurta || embeddedMeas.shirtKurta;
                }
              } else if (tableName === "customers") {
                const embeddedCust = decodeEmbeddedJSON<any>(item.generalNotes, "CUST_PREF");
                if (embeddedCust) {
                  item.preferenceTags = item.preferenceTags || embeddedCust.preferenceTags;
                  item.preferredFabricBrands = item.preferredFabricBrands || embeddedCust.preferredFabricBrands;
                }
              }
              mergedMap.set(item.id, item);
            }
          });
        }

        // 2. Add local items if missing remotely OR if local version is newer / holds local unsaved updates
        if (localData && Array.isArray(localData)) {
          localData.forEach((localItem: any) => {
            if (!localItem || !localItem.id) return;
            // Never re-upload a record that was deleted.
            if (this.isDeleted(tableName, localItem.id)) return;
            const remoteItem = mergedMap.get(localItem.id);
            if (!remoteItem) {
              // Local item not present on cloud -> KEEP local item and push to cloud
              mergedMap.set(localItem.id, localItem);
              this.pushSingleToSupabase(tableName, localItem);
            } else {
              // Both sides hold this record. Resolve strictly by last-modified time so a stale
              // local copy can never clobber a newer edit made on another device.
              //
              // (The previous rule also accepted "local has >= as many line items", which was
              // true for every order whose arrays were equal length — including two empty
              // arrays — so local always won and remote edits were silently reverted.)
              const localTime = this.getRecordTimestamp(localItem);
              const remoteTime = this.getRecordTimestamp(remoteItem);

              // Unknown timestamps on both sides: keep remote, the authoritative copy.
              if (localTime === null && remoteTime === null) return;

              const localIsNewer =
                remoteTime === null ? true : (localTime !== null && localTime > remoteTime);

              if (!localIsNewer) return;

              if (tableName === "orders") {
                const localLines = Array.isArray(localItem.garmentLineItems) ? localItem.garmentLineItems : [];
                const remoteLines = Array.isArray(remoteItem.garmentLineItems) ? remoteItem.garmentLineItems : [];
                const localTypes = Array.isArray(localItem.garmentTypes) ? localItem.garmentTypes : [];
                const remoteTypes = Array.isArray(remoteItem.garmentTypes) ? remoteItem.garmentTypes : [];

                const combinedLines = localLines.length > 0 ? localLines : remoteLines;
                const rawNames = combinedLines.map((g: any) => g.garmentName || g.description || "");
                const extracted = Array.from(new Set(
                  [...rawNames, ...localTypes].flatMap((name: string) =>
                    name.startsWith("Bespoke Tailoring:")
                      ? name.replace("Bespoke Tailoring:", "").split(",").map(s => s.trim())
                      : name.split(",").map(s => s.trim())
                  ).filter(Boolean)
                ));

                const mergedOrder = {
                  ...remoteItem,
                  ...localItem,
                  garmentLineItems: combinedLines,
                  garmentTypes: extracted.length > 0 ? extracted : (localTypes.length > 0 ? localTypes : remoteTypes)
                };

                mergedMap.set(localItem.id, mergedOrder);
                this.pushSingleToSupabase(tableName, mergedOrder);
              } else {
                mergedMap.set(localItem.id, localItem);
                this.pushSingleToSupabase(tableName, localItem);
              }
            }
          });
        }

        let mergedList = Array.from(mergedMap.values());

        // Format orders properly
        if (tableName === "orders") {
          mergedList = mergedList.map((ord: any) => {
            const decodedLines = decodeEmbeddedJSON<any[]>(ord.notes, "GARMENT_ITEMS") || [];
            const decodedHist = decodeEmbeddedJSON<any[]>(ord.notes, "STATUS_HIST") || [];
            const gItems = Array.isArray(ord.garmentLineItems) && ord.garmentLineItems.length > 0
              ? ord.garmentLineItems
              : decodedLines;
            const sHist = Array.isArray(ord.statusHistory) && ord.statusHistory.length > 0
              ? ord.statusHistory
              : decodedHist;
            const gTypes = Array.isArray(ord.garmentTypes) ? ord.garmentTypes : [];
            const rawNames = gItems.map((g: any) => g.garmentName || g.description || "");
            const extracted = Array.from(new Set(
              [...rawNames, ...gTypes].flatMap((name: string) =>
                name.startsWith("Bespoke Tailoring:")
                  ? name.replace("Bespoke Tailoring:", "").split(",").map(s => s.trim())
                  : name.split(",").map(s => s.trim())
              ).filter(Boolean)
            ));

            return {
              ...ord,
              garmentLineItems: gItems,
              statusHistory: sHist,
              garmentTypes: extracted.length > 0 ? extracted : gTypes
            };
          });
        }

        // Format invoices properly
        if (tableName === "invoices") {
          mergedList = mergedList.map((inv: any) => {
            const grandTotal = parseFloat(String(inv.grandTotal !== undefined && inv.grandTotal !== null ? inv.grandTotal : (inv.totalAmount !== undefined && inv.totalAmount !== null ? inv.totalAmount : 0))) || 0;
            const advancePaid = parseFloat(String(inv.advancePaid !== undefined && inv.advancePaid !== null ? inv.advancePaid : (inv.paidAmount !== undefined && inv.paidAmount !== null ? inv.paidAmount : 0))) || 0;
            const subtotal = parseFloat(String(inv.subtotal !== undefined && inv.subtotal !== null ? inv.subtotal : grandTotal)) || 0;
            const discount = parseFloat(String(inv.discount !== undefined && inv.discount !== null ? inv.discount : 0)) || 0;
            const taxPercent = parseFloat(String(inv.taxPercent !== undefined && inv.taxPercent !== null ? inv.taxPercent : (inv.taxPercentage !== undefined && inv.taxPercentage !== null ? inv.taxPercentage : 0))) || 0;
            const taxAmount = parseFloat(String(inv.taxAmount !== undefined && inv.taxAmount !== null ? inv.taxAmount : 0)) || 0;
            const balanceDue = parseFloat(String(inv.balanceDue !== undefined && inv.balanceDue !== null ? inv.balanceDue : (grandTotal - advancePaid))) || 0;
            const payments = inv.payments !== undefined && inv.payments !== null ? inv.payments : (inv.paymentsHistory !== undefined && inv.paymentsHistory !== null ? inv.paymentsHistory : []);
            const linkedOrderId = inv.linkedOrderId !== undefined && inv.linkedOrderId !== null ? inv.linkedOrderId : (inv.orderId !== undefined && inv.orderId !== null ? inv.orderId : "");

            return {
              ...inv,
              grandTotal,
              advancePaid,
              subtotal,
              discount,
              taxPercent,
              taxAmount,
              balanceDue,
              payments,
              linkedOrderId
            };
          });
        }

        // Format attendance properly
        if (tableName === "attendance") {
          mergedList = mergedList.map((att: any) => {
            const decodedAtt = decodeEmbeddedJSON<any>(att.notes, "ATT_EXT");
            return {
              ...att,
              workerName: att.workerName || (decodedAtt && decodedAtt.workerName) || undefined,
              checkInTime: att.checkInTime || (decodedAtt && decodedAtt.checkInTime) || undefined,
              checkOutTime: att.checkOutTime || (decodedAtt && decodedAtt.checkOutTime) || undefined,
              totalHours: att.totalHours !== undefined ? att.totalHours : (decodedAtt && decodedAtt.totalHours !== undefined ? decodedAtt.totalHours : undefined),
              status: att.status || "Present",
              notes: stripEmbeddedTags(att.notes) || att.notes || ""
            };
          });
        }

        // Format workers properly
        if (tableName === "workers") {
          mergedList = mergedList.map((w: any) => ({
            ...w,
            dailyWages: parseFloat(String(w.dailyWages !== undefined && w.dailyWages !== null ? w.dailyWages : 600)) || 600,
            monthlySalary: w.monthlySalary !== undefined && w.monthlySalary !== null ? parseFloat(String(w.monthlySalary)) : undefined,
            active: w.active !== undefined ? Boolean(w.active) : true
          }));
        }

        // Format advances properly
        if (tableName === "advances") {
          mergedList = mergedList.map((adv: any) => ({
            ...adv,
            amount: parseFloat(String(adv.amount || 0)) || 0,
            repaid: Boolean(adv.repaid),
            repayDate: adv.repayDate || "",
            notes: adv.notes || ""
          }));
        }

        // Format salaries properly
        if (tableName === "salaries") {
          mergedList = mergedList.map((sal: any) => ({
            ...sal,
            calculatedSalary: parseFloat(String(sal.calculatedSalary || 0)) || 0,
            presents: parseInt(String(sal.presents || 0), 10) || 0,
            halfDays: parseInt(String(sal.halfDays || 0), 10) || 0,
            absents: parseInt(String(sal.absents || 0), 10) || 0,
            paidLeavesUsed: parseInt(String(sal.paidLeavesUsed || 0), 10) || 0,
            advanceDeductions: parseFloat(String(sal.advanceDeductions || 0)) || 0,
            bonus: parseFloat(String(sal.bonus || 0)) || 0,
            netPaid: parseFloat(String(sal.netPaid || 0)) || 0,
            notes: sal.notes || ""
          }));
        }

        (this[stateKey] as any) = mergedList;
        this.saveKeyLocal(stateKey, mergedList);
        safeSetItem(`sig_suit_migrated_${tableName}`, "true");
      };

      // Sync remaining tables in strict dependency order to avoid foreign key constraints violations
      // No dependencies first:
      await syncTable("users", this.users, "users");
      await syncTable("customers", this.customers, "customers");
      await syncTable("expenses", this.expenses, "expenses");
      await syncTable("workers", this.workers, "workers");

      // Depend on customers or workers:
      await syncTable("measurements", this.measurements, "measurements");
      await syncTable("appointments", this.appointments, "appointments");
      await syncTable("attendance", this.attendance, "attendance");
      await syncTable("advances", this.advances, "advances");
      await syncTable("salaries", this.salaries, "salaries");

      // Depend on measurements/customers:
      await syncTable("orders", this.orders, "orders");

      // Depend on orders:
      await syncTable("trials", this.trials, "trials");
      await syncTable("alterations", this.alterations, "alterations");
      await syncTable("invoices", this.invoices, "invoices");

      // POST-RESTORATION VERIFICATION AUDIT
      if (forceOverwriteSupabase) {
        console.log("Performing Post-Restoration Supabase Verification Audit...");
        const verificationTables = [
          { name: "config", expected: 1 },
          { name: "users", expected: this.users.length },
          { name: "customers", expected: this.customers.length },
          { name: "workers", expected: this.workers.length },
          { name: "expenses", expected: this.expenses.length },
          { name: "measurements", expected: this.measurements.length },
          { name: "appointments", expected: this.appointments.length },
          { name: "attendance", expected: this.attendance.length },
          { name: "advances", expected: this.advances.length },
          { name: "salaries", expected: this.salaries.length },
          { name: "orders", expected: this.orders.length },
          { name: "trials", expected: this.trials.length },
          { name: "alterations", expected: this.alterations.length },
          { name: "invoices", expected: this.invoices.length }
        ];

        const verificationErrors: string[] = [];
        for (const vt of verificationTables) {
          const { count, error } = await supabase.from(vt.name).select("id", { count: "exact" });
          if (error) {
            verificationErrors.push(`Failed to verify count for '${vt.name}': ${error.message}`);
          } else if (count !== vt.expected) {
            verificationErrors.push(`Verification mismatch on '${vt.name}': Expected ${vt.expected} records in database, found ${count}.`);
          }
        }

        if (verificationErrors.length > 0) {
          const combined = verificationErrors.join("; ");
          console.error("Post-restoration verification failed:", combined);
          throw new Error(`Restoration Verification Failed: ${combined}`);
        }
        console.log("Post-Restoration Supabase Verification Audit Passed 100%!");
      }

      this.saveAllLocal();
      this.recalculateAllBalances();
      if (this.syncErrors.length === 0) {
        console.log("Supabase Database Sync Successfully Completed!");
        this.setupRealtimeSubscription();
      } else {
        console.warn("Supabase database sync completed with errors. Using local backup for failed tables.");
      }
    } catch (err: any) {
      console.error("Critical failure during Supabase sync initialization:", err);
      this.connectionError = err.message || String(err);
      throw err;
    } finally {
      this.isSyncing = false;
      this.triggerSyncChange();
    }
  }

  private setupCrossTabChannel() {
    if (typeof window !== "undefined" && typeof BroadcastChannel !== "undefined" && !this.crossTabChannel) {
      try {
        this.crossTabChannel = new BroadcastChannel("sig_suitings_cross_tab");
        this.crossTabChannel.onmessage = (event) => {
          if (!event || !event.data) return;
          const { senderId, table, eventType, record, oldRecord } = event.data;
          if (senderId === this.tabInstanceId) return;
          this.applyRealtimeMutation(table, eventType, record, oldRecord, "cross_tab");
        };
      } catch (e) {
        console.warn("[CrossTab] BroadcastChannel init error:", e);
      }
    }
  }

  /** Retry parked cloud writes the moment the machine regains a network connection. */
  private setupConnectivityListener() {
    if (typeof window === "undefined") return;
    window.addEventListener("online", () => {
      console.log("[Connectivity] Back online — retrying queued cloud writes.");
      this.flushOutbox();
    });
  }

  private setupStorageListener() {
    if (typeof window !== "undefined") {
      window.addEventListener("storage", (e) => {
        if (!e.key || !e.key.startsWith("sig_suit_")) return;
        const key = e.key.replace("sig_suit_", "");
        if (key === "fresh_db_v6" || key.startsWith("migrated_")) return;
        if (e.newValue) {
          try {
            const decrypted = deobfuscateData(e.newValue);
            const parsed = JSON.parse(decrypted);
            if (key === "config") {
              this.config = parsed;
            } else if ((this as any)[key] !== undefined) {
              (this as any)[key] = parsed;
            }
            this.recalculateAllBalances();
            this.triggerSyncChange();
          } catch (err) {
            // ignore
          }
        }
      });
    }
  }

  public setupRealtimeSubscription() {
    if (!isSupabaseConfigured || this.realtimeChannel) return;
    this.setupCrossTabChannel();

    const existingChannels = typeof (supabase as any).getChannels === "function" ? (supabase as any).getChannels() : [];
    const match = existingChannels.find((c: any) => c && c.topic === "realtime:sig-suitings-realtime");
    if (match) {
      this.realtimeChannel = match;
      return;
    }

    console.log("Setting up Supabase Realtime Subscription on channel \"sig-suitings-realtime\"...");
    
    try {
      const channel = supabase.channel("sig-suitings-realtime", {
        config: {
          broadcast: { self: false }
        }
      });
      this.realtimeChannel = channel;

      // 1. Peer-to-peer WebSocket broadcast across all browser tabs / devices
      channel.on(
        "broadcast",
        { event: "db_mutation" },
        (msg: any) => {
          if (this.isRestoring) {
            console.log("[Realtime Broadcast] Ignored during active database restoration.");
            return;
          }
          const payload = msg?.payload;
          if (!payload || !payload.table) return;
          if (payload.senderId === this.tabInstanceId) return; // Prevent echoing local tab's own mutations
          this.applyRealtimeMutation(payload.table, payload.eventType, payload.record, payload.oldRecord, "remote_broadcast");
        }
      );

      // 2. PostgreSQL Logical Replication database changes (Direct Supabase DB events)
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public" },
        (payload: any) => {
          if (this.isRestoring) {
            console.log("[Postgres Changes] Ignored during active database restoration.");
            return;
          }
          const table = payload.table;
          if (!table) return;
          const eventType = payload.eventType; // "INSERT" | "UPDATE" | "DELETE"
          const newRecord = payload.new;
          const oldRecord = payload.old;
          this.applyRealtimeMutation(table, eventType, newRecord, oldRecord, "postgres_changes");
        }
      );

      // 3. Status handling and auto-reconnection
      channel.subscribe((status: string, err?: Error) => {
        console.log(`[Supabase Realtime] Channel status: ${status}`, err ? err.message : "");
        if (status === "SUBSCRIBED") {
          this.connectionError = null;
          this.reconnectAttempts = 0;
          if (this.isReconnecting) {
            this.isReconnecting = false;
            console.log("[Supabase Realtime] Reconnected. Running background catchup synchronization...");
            this.catchupSync();
          }
        } else if (status === "CLOSED" || status === "TIMED_OUT" || status === "CHANNEL_ERROR") {
          this.connectionError = `Realtime subscription ${status.toLowerCase()}`;
          this.handleRealtimeDisconnect();
        }
      });
    } catch (err: any) {
      console.error("Failed setting up Supabase Realtime channel:", err);
    }
  }

  private handleRealtimeDisconnect() {
    if (this.reconnectTimer) return;
    this.isReconnecting = true;
    const delay = Math.min(30000, 1000 * Math.pow(1.5, this.reconnectAttempts));
    this.reconnectAttempts++;
    console.warn(`[Supabase Realtime] Connection dropped. Scheduling reconnection in ${Math.round(delay / 1000)}s...`);
    
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.realtimeChannel) {
        try {
          supabase.removeChannel(this.realtimeChannel);
        } catch (e) {}
        this.realtimeChannel = null;
      }
      this.setupRealtimeSubscription();
    }, delay);
  }

  public async catchupSync(): Promise<void> {
    if (!isSupabaseConfigured || this.isRestoring) return;
    try {
      console.log("[Supabase Sync] Running lightweight catchup sync...");
      await this.initializeSupabaseSync(false);
    } catch (e) {
      console.warn("[Supabase Sync] Catchup sync warning:", e);
    }
  }

  public unsubscribeRealtime() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.crossTabChannel) {
      try {
        this.crossTabChannel.close();
      } catch (e) {}
      this.crossTabChannel = null;
    }
    if (this.realtimeChannel) {
      try {
        supabase.removeChannel(this.realtimeChannel);
      } catch (e) {}
      this.realtimeChannel = null;
    }
  }

  public broadcastMutation(table: string, eventType: "INSERT" | "UPDATE" | "DELETE", record?: any, oldRecord?: any) {
    const payload = {
      senderId: this.tabInstanceId,
      table,
      eventType,
      record,
      oldRecord,
      timestamp: Date.now()
    };

    // 1. Cross-tab within same browser (Instant sub-millisecond)
    if (this.crossTabChannel) {
      try {
        this.crossTabChannel.postMessage(payload);
      } catch (e) {
        console.warn("[CrossTab] Broadcast postMessage failed:", e);
      }
    }

    // 2. Realtime WebSocket broadcast to other browser instances / devices via Supabase
    if (this.realtimeChannel && isSupabaseConfigured) {
      try {
        this.realtimeChannel.send({
          type: "broadcast",
          event: "db_mutation",
          payload
        }).catch((e: any) => console.warn("[Supabase Realtime] Broadcast send warning:", e));
      } catch (e) {
        console.warn("[Supabase Realtime] Channel send failed:", e);
      }
    }
  }

  public hydrateRecordFromSupabase(tableName: string, raw: any): any {
    if (!raw || typeof raw !== "object") return raw;
    const item = { ...raw };

    if (tableName === "config") {
      const embeddedCfg = decodeEmbeddedJSON<any>(item.tagline, "CFG_DATA");
      if (embeddedCfg) {
        if (embeddedCfg.garmentCategories) item.garmentCategories = embeddedCfg.garmentCategories;
        if (embeddedCfg.garmentCatalog) item.garmentCatalog = embeddedCfg.garmentCatalog;
        if (embeddedCfg.measurementTemplates) item.measurementTemplates = embeddedCfg.measurementTemplates;
        if (embeddedCfg.garmentTypesConfig) item.garmentTypesConfig = embeddedCfg.garmentTypesConfig;
        if (embeddedCfg.measurementFieldsConfig) item.measurementFieldsConfig = embeddedCfg.measurementFieldsConfig;
      }
      item.tagline = stripEmbeddedTags(item.tagline) || item.tagline || "";
      return item;
    }

    if (tableName === "orders") {
      const decodedLines = decodeEmbeddedJSON<any[]>(item.notes, "GARMENT_ITEMS") || [];
      const decodedHist = decodeEmbeddedJSON<any[]>(item.notes, "STATUS_HIST") || [];
      const gItems = Array.isArray(item.garmentLineItems) && item.garmentLineItems.length > 0
        ? item.garmentLineItems
        : decodedLines;
      const sHist = Array.isArray(item.statusHistory) && item.statusHistory.length > 0
        ? item.statusHistory
        : decodedHist;
      const gTypes = Array.isArray(item.garmentTypes) ? item.garmentTypes : [];
      const rawNames = gItems.map((g: any) => g.garmentName || g.description || "");
      const extracted = Array.from(new Set(
        [...rawNames, ...gTypes].flatMap((name: string) =>
          name.startsWith("Bespoke Tailoring:")
            ? name.replace("Bespoke Tailoring:", "").split(",").map(s => s.trim())
            : name.split(",").map(s => s.trim())
        ).filter(Boolean)
      ));

      return {
        ...item,
        garmentLineItems: gItems,
        statusHistory: sHist,
        garmentTypes: extracted.length > 0 ? extracted : gTypes,
        notes: stripEmbeddedTags(item.notes) || item.notes || ""
      };
    }

    if (tableName === "invoices") {
      const grandTotal = parseFloat(String(item.grandTotal !== undefined && item.grandTotal !== null ? item.grandTotal : (item.totalAmount !== undefined && item.totalAmount !== null ? item.totalAmount : 0))) || 0;
      const advancePaid = parseFloat(String(item.advancePaid !== undefined && item.advancePaid !== null ? item.advancePaid : (item.paidAmount !== undefined && item.paidAmount !== null ? item.paidAmount : 0))) || 0;
      const subtotal = parseFloat(String(item.subtotal !== undefined && item.subtotal !== null ? item.subtotal : grandTotal)) || 0;
      const discount = parseFloat(String(item.discount !== undefined && item.discount !== null ? item.discount : 0)) || 0;
      const taxPercent = parseFloat(String(item.taxPercent !== undefined && item.taxPercent !== null ? item.taxPercent : (item.taxPercentage !== undefined && item.taxPercentage !== null ? item.taxPercentage : 0))) || 0;
      const taxAmount = parseFloat(String(item.taxAmount !== undefined && item.taxAmount !== null ? item.taxAmount : 0)) || 0;
      const balanceDue = parseFloat(String(item.balanceDue !== undefined && item.balanceDue !== null ? item.balanceDue : (grandTotal - advancePaid))) || 0;
      
      const embeddedLineItems = decodeEmbeddedJSON<any[]>(item.notes, "LINE_ITEMS");
      const embeddedPayments = decodeEmbeddedJSON<any[]>(item.notes, "PAYMENTS");
      const lineItems = (Array.isArray(item.lineItems) && item.lineItems.length > 0)
        ? item.lineItems
        : (embeddedLineItems && Array.isArray(embeddedLineItems) ? embeddedLineItems : []);
      const payments = (Array.isArray(item.payments) && item.payments.length > 0)
        ? item.payments
        : (embeddedPayments && Array.isArray(embeddedPayments) ? embeddedPayments : (item.paymentsHistory || []));
      const linkedOrderId = item.linkedOrderId !== undefined && item.linkedOrderId !== null ? item.linkedOrderId : (item.orderId !== undefined && item.orderId !== null ? item.orderId : "");

      return {
        ...item,
        grandTotal,
        advancePaid,
        subtotal,
        discount,
        taxPercent,
        taxAmount,
        balanceDue,
        lineItems,
        payments,
        linkedOrderId,
        notes: stripEmbeddedTags(item.notes) || item.notes || ""
      };
    }

    if (tableName === "measurements") {
      const embeddedMeas = decodeEmbeddedJSON<any>(item.remarks, "MEAS_SPEC");
      if (embeddedMeas) {
        item.coatIndoWestern = item.coatIndoWestern || embeddedMeas.coatIndoWestern;
        item.pent = item.pent || embeddedMeas.pent;
        item.vest = item.vest || embeddedMeas.vest;
        item.shirtKurta = item.shirtKurta || embeddedMeas.shirtKurta;
      }
      item.remarks = stripEmbeddedTags(item.remarks) || item.remarks || "";
      return item;
    }

    if (tableName === "customers") {
      const embeddedCust = decodeEmbeddedJSON<any>(item.generalNotes, "CUST_PREF");
      if (embeddedCust) {
        item.preferenceTags = item.preferenceTags || embeddedCust.preferenceTags || [];
        item.preferredFabricBrands = item.preferredFabricBrands || embeddedCust.preferredFabricBrands || [];
      } else {
        item.preferenceTags = Array.isArray(item.preferenceTags) ? item.preferenceTags : [];
        item.preferredFabricBrands = Array.isArray(item.preferredFabricBrands) ? item.preferredFabricBrands : [];
      }
      item.totalOrdersCount = parseInt(String(item.totalOrdersCount || 0), 10) || 0;
      item.outstandingBalance = parseFloat(String(item.outstandingBalance || 0)) || 0;
      item.generalNotes = stripEmbeddedTags(item.generalNotes) || item.generalNotes || "";
      return item;
    }

    if (tableName === "workers") {
      return {
        ...item,
        dailyWages: parseFloat(String(item.dailyWages !== undefined && item.dailyWages !== null ? item.dailyWages : 600)) || 600,
        monthlySalary: item.monthlySalary !== undefined && item.monthlySalary !== null ? parseFloat(String(item.monthlySalary)) : undefined,
        active: item.active !== undefined ? Boolean(item.active) : true
      };
    }

    if (tableName === "attendance") {
      const decodedAtt = decodeEmbeddedJSON<any>(item.notes, "ATT_EXT");
      return {
        ...item,
        workerName: item.workerName || (decodedAtt && decodedAtt.workerName) || undefined,
        checkInTime: item.checkInTime || (decodedAtt && decodedAtt.checkInTime) || undefined,
        checkOutTime: item.checkOutTime || (decodedAtt && decodedAtt.checkOutTime) || undefined,
        totalHours: item.totalHours !== undefined ? item.totalHours : (decodedAtt && decodedAtt.totalHours !== undefined ? decodedAtt.totalHours : undefined),
        status: item.status || "Present",
        notes: stripEmbeddedTags(item.notes) || item.notes || ""
      };
    }

    if (tableName === "advances") {
      return {
        ...item,
        amount: parseFloat(String(item.amount || 0)) || 0,
        repaid: Boolean(item.repaid),
        repayDate: item.repayDate || "",
        notes: item.notes || ""
      };
    }

    if (tableName === "salaries") {
      return {
        ...item,
        calculatedSalary: parseFloat(String(item.calculatedSalary || 0)) || 0,
        presents: parseInt(String(item.presents || 0), 10) || 0,
        halfDays: parseInt(String(item.halfDays || 0), 10) || 0,
        absents: parseInt(String(item.absents || 0), 10) || 0,
        paidLeavesUsed: parseInt(String(item.paidLeavesUsed || 0), 10) || 0,
        advanceDeductions: parseFloat(String(item.advanceDeductions || 0)) || 0,
        bonus: parseFloat(String(item.bonus || 0)) || 0,
        netPaid: parseFloat(String(item.netPaid || 0)) || 0,
        notes: item.notes || ""
      };
    }

    if (tableName === "expenses") {
      return {
        ...item,
        amount: parseFloat(String(item.amount || 0)) || 0,
        category: item.category || "General",
        date: item.date || new Date().toISOString().split("T")[0]
      };
    }

    return item;
  }

  public applyRealtimeMutation(
    table: string,
    eventType: "INSERT" | "UPDATE" | "DELETE" | string,
    newRecord: any,
    oldRecord: any,
    source: string = "unknown"
  ) {
    if (this.isRestoring) {
      console.log(`[Realtime ${source}] Ignored mutation during active restoration.`);
      return;
    }
    if (!table) return;

    const tableToPropMap: Record<string, string> = {
      config: "config",
      users: "users",
      customers: "customers",
      expenses: "expenses",
      workers: "workers",
      measurements: "measurements",
      appointments: "appointments",
      attendance: "attendance",
      advances: "advances",
      salaries: "salaries",
      orders: "orders",
      trials: "trials",
      alterations: "alterations",
      invoices: "invoices"
    };

    const prop = tableToPropMap[table];
    if (!prop) return;

    const normalizedEventType = (eventType || "INSERT").toUpperCase();

    // 1. Config Table
    if (prop === "config") {
      if (normalizedEventType === "DELETE") return;
      if (newRecord) {
        const hydrated = this.hydrateRecordFromSupabase("config", newRecord);
        const { id, updated_at, ...rest } = hydrated;
        this.config = { ...this.config, ...rest };
        if (rest.garmentCategories) this.garmentCategories = rest.garmentCategories;
        if (rest.garmentCatalog) this.garmentCatalog = rest.garmentCatalog;
        if (rest.measurementTemplates) this.measurementTemplates = rest.measurementTemplates;
        this.saveAllLocal();
        this.triggerSyncChange();
      }
      return;
    }

    const currentList = (this as any)[prop];
    if (!Array.isArray(currentList)) return;

    // 2. DELETE Event
    if (normalizedEventType === "DELETE") {
      const targetId = oldRecord?.id || newRecord?.id;
      if (!targetId) return;

      // Remember the deletion so a later merge cannot re-upload this record.
      this.markDeleted(table, targetId);

      const existingIdx = currentList.findIndex(item => item && item.id === targetId);
      if (existingIdx !== -1) {
        currentList.splice(existingIdx, 1);
        this.saveKeyLocal(prop as string, currentList);
        this.recalculateAllBalances();
        this.triggerSyncChange();
        console.log(`[Realtime ${source}] Removed deleted record "${targetId}" from "${table}".`);
      }
      return;
    }

    // 3. INSERT & UPDATE Events
    if (normalizedEventType === "INSERT" || normalizedEventType === "UPDATE") {
      if (!newRecord || !newRecord.id) return;
      // Ignore echoes of a record this device has already deleted.
      if (this.isDeleted(table, newRecord.id)) {
        this.deleteFromSupabase(table, newRecord.id, { alreadyTombstoned: true });
        return;
      }
      const hydrated = this.hydrateRecordFromSupabase(table, newRecord);
      const existingIdx = currentList.findIndex(item => item && item.id === hydrated.id);

      if (existingIdx !== -1) {
        // Deterministic conflict resolution: compare timestamps
        const existing = currentList[existingIdx];
        const existingTime = new Date(existing.updatedAt || existing.updated_at || existing.created_at || existing.orderDate || existing.versionDate || 0).getTime();
        const remoteTime = new Date(hydrated.updatedAt || hydrated.updated_at || hydrated.created_at || hydrated.orderDate || hydrated.versionDate || 0).getTime();

        if (remoteTime >= existingTime || !existing.updatedAt) {
          currentList[existingIdx] = { ...existing, ...hydrated };
        } else {
          currentList[existingIdx] = { ...hydrated, ...existing };
        }
      } else {
        // New record inserted
        currentList.push(hydrated);
      }

      this.saveKeyLocal(prop as string, currentList);
      this.recalculateAllBalances();
      this.triggerSyncChange();
      console.log(`[Realtime ${source}] Processed ${normalizedEventType} for record "${hydrated.id}" in "${table}".`);
    }
  }

  // Tables whose localStorage cache needs rewriting after in-place record stamping.
  private dirtyTables = new Set<string>();
  private persistTimer: any = null;

  /**
   * Batches localStorage rewrites triggered by record stamping. Writing immediately on every
   * push would fire a re-render per record during a bulk sync; a short debounce collapses
   * them into one write per table.
   */
  private schedulePersist(stateKey: string) {
    this.dirtyTables.add(stateKey);
    if (this.persistTimer || typeof setTimeout === "undefined") return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      const keys = Array.from(this.dirtyTables);
      this.dirtyTables.clear();
      for (const key of keys) {
        const list = (this as any)[key];
        if (Array.isArray(list)) {
          safeSetItem(`sig_suit_${key}`, obfuscateData(JSON.stringify(list)));
        }
      }
    }, 250);
  }

  // High performance single-record writer (Write-Through Cache)
  public async pushSingleToSupabase(tableName: string, record: any) {
    // Writing a record again is a deliberate re-creation, so lift any stale tombstone.
    if (record && record.id && this.isDeleted(tableName, record.id)) {
      this.clearTombstone(tableName, record.id);
    }

    // Stamp the modification time on the way out. Every mutator funnels through here, so this
    // guarantees an edit is dated and can win a later merge against an older cloud copy.
    if (record && typeof record === "object" && record.id) {
      this.stamp(record);
      const stateKey = this.tableStateKey(tableName);
      if (stateKey) this.schedulePersist(stateKey);
    }

    if (!isSupabaseConfigured || this.isRestoring) return;
    const queuedGen = this.mutationGeneration;

    // Broadcast locally/cross-tab immediately
    this.broadcastMutation(tableName, "UPDATE", record);

    this.supabaseQueue = this.supabaseQueue.then(async () => {
      if (this.isRestoring || this.mutationGeneration !== queuedGen) {
        console.warn(`[Supabase Queue] Skipping pushSingle for table "${tableName}" - stale mutation generation (queued gen ${queuedGen}, current gen ${this.mutationGeneration}, isRestoring=${this.isRestoring})`);
        return;
      }
      try {
        const cleanRecord = { ...record };

        // 1. Sanitize empty strings ("") or missing fields for any potential foreign key columns
        const fkeyCols = ["customerId", "linkedMeasurementVersionId", "linkedInvoiceId", "linkedOrderId", "orderId", "workerId"];
        for (const col of fkeyCols) {
          if (cleanRecord[col] === "" || cleanRecord[col] === undefined) {
            cleanRecord[col] = null;
          }
        }

        // 2. Self-Healing Referential Integrity Checks against local state
        if (cleanRecord.customerId && !this.customers.some(c => c.id === cleanRecord.customerId)) {
          console.warn(`[Ref Integrity] customerId "${cleanRecord.customerId}" in table "${tableName}" does not exist locally. Setting to null.`);
          cleanRecord.customerId = null;
        }

        if (tableName === "orders") {
          if (cleanRecord.linkedMeasurementVersionId && !this.measurements.some(m => m.id === cleanRecord.linkedMeasurementVersionId)) {
            console.warn(`[Ref Integrity] linkedMeasurementVersionId "${cleanRecord.linkedMeasurementVersionId}" in orders does not exist locally. Setting to null.`);
            cleanRecord.linkedMeasurementVersionId = null;
          }
          if (cleanRecord.linkedInvoiceId && !this.invoices.some(i => i.id === cleanRecord.linkedInvoiceId)) {
            console.warn(`[Ref Integrity] linkedInvoiceId "${cleanRecord.linkedInvoiceId}" in orders does not exist locally. Setting to null.`);
            cleanRecord.linkedInvoiceId = null;
          }
        }

        if (tableName === "invoices") {
          if (cleanRecord.linkedOrderId && !this.orders.some(o => o.id === cleanRecord.linkedOrderId)) {
            console.warn(`[Ref Integrity] linkedOrderId "${cleanRecord.linkedOrderId}" in invoices does not exist locally. Setting to null.`);
            cleanRecord.linkedOrderId = null;
          }
        }

        if (tableName === "trials" || tableName === "alterations") {
          if (cleanRecord.orderId && !this.orders.some(o => o.id === cleanRecord.orderId)) {
            console.warn(`[Ref Integrity] orderId "${cleanRecord.orderId}" in trials/alterations does not exist locally. Setting to null.`);
            cleanRecord.orderId = null;
          }
        }

        if (tableName === "attendance" || tableName === "advances" || tableName === "salaries") {
          // Keep workerId intact
          if (cleanRecord.workerId === undefined) {
            cleanRecord.workerId = null;
          }
        }

        const { error } = await safeUpsertSupabaseTable(tableName, cleanRecord);
        if (error) {
          this.recordWriteFailure("upsert", tableName, record?.id, error, record);
        } else {
          this.recordWriteSuccess("upsert", tableName, record?.id);
        }
      } catch (err: any) {
        this.recordWriteFailure("upsert", tableName, record?.id, err, record);
      }
    });
    return this.supabaseQueue;
  }

  private async deleteFromSupabase(
    tableName: string,
    id: string,
    options: { alreadyTombstoned?: boolean } = {}
  ) {
    // The tombstone is authoritative and must be written even when the cloud is unreachable
    // or a restore is in flight, otherwise the next merge revives the record.
    if (!options.alreadyTombstoned) {
      this.markDeleted(tableName, id);
    }

    if (!isSupabaseConfigured || this.isRestoring) return;
    const queuedGen = this.mutationGeneration;

    // Broadcast delete event immediately
    this.broadcastMutation(tableName, "DELETE", undefined, { id });

    this.supabaseQueue = this.supabaseQueue.then(async () => {
      if (this.isRestoring || this.mutationGeneration !== queuedGen) {
        console.warn(`[Supabase Queue] Skipping deleteFromSupabase for table "${tableName}", id "${id}" - stale mutation generation (queued gen ${queuedGen}, current gen ${this.mutationGeneration}, isRestoring=${this.isRestoring})`);
        return;
      }
      try {
        const { error } = await supabase.from(tableName).delete().eq("id", id);
        if (error) {
          this.recordWriteFailure("delete", tableName, id, error);
        } else {
          this.recordWriteSuccess("delete", tableName, id);
        }
      } catch (err: any) {
        this.recordWriteFailure("delete", tableName, id, err);
      }
    });
    return this.supabaseQueue;
  }

  // =====================================================================
  // DURABLE WRITE OUTBOX
  // Cloud writes used to be fire-and-forget: a failure only reached the console, so the UI
  // reported success for data that never left the device. Every failed write is now parked
  // in a persisted outbox, retried automatically, and exposed through getSyncHealth() so the
  // interface can tell the user the truth.
  // =====================================================================
  private outbox: PendingWrite[] = [];
  private outboxTimer: any = null;
  private outboxFlushing = false;

  private loadOutbox() {
    const raw = safeGetRawItem(OUTBOX_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(deobfuscateData(raw));
      if (Array.isArray(parsed)) this.outbox = parsed;
    } catch (e) {
      this.outbox = [];
    }
  }

  private saveOutbox() {
    // Cap the outbox so a long offline stretch cannot exhaust localStorage.
    if (this.outbox.length > OUTBOX_MAX_ENTRIES) {
      this.outbox = this.outbox.slice(-OUTBOX_MAX_ENTRIES);
    }
    safeSetItem(OUTBOX_KEY, obfuscateData(JSON.stringify(this.outbox)));
  }

  private recordWriteSuccess(op: PendingWrite["op"], table: string, id?: string) {
    if (!id) return;
    const before = this.outbox.length;
    this.outbox = this.outbox.filter(p => !(p.table === table && p.recordId === id && p.op === op));
    if (this.outbox.length !== before) {
      this.saveOutbox();
      this.triggerSyncChange();
    }
  }

  private recordWriteFailure(
    op: PendingWrite["op"],
    table: string,
    id: string | undefined,
    error: any,
    payload?: any
  ) {
    const message = String(error?.message || error || "Unknown error");
    const isNetwork =
      Boolean(error?.isNetworkError) ||
      error?.code === "NETWORK_OFFLINE" ||
      message.includes("Failed to fetch") ||
      message.includes("NetworkError");

    if (isNetwork) {
      console.warn(`[Cloud Save Pending] "${table}" write queued for retry (device appears offline). Local data is safe.`);
    } else {
      console.error(`[Cloud Save Failed] table "${table}", record "${id || "?"}": ${message}`);
    }

    if (!id) return;

    const existing = this.outbox.find(p => p.table === table && p.recordId === id && p.op === op);
    if (existing) {
      existing.attempts += 1;
      existing.lastError = message;
      existing.lastAttemptAt = Date.now();
      if (payload !== undefined) existing.payload = payload;
    } else {
      this.outbox.push({
        op,
        table,
        recordId: id,
        payload: op === "upsert" ? payload : undefined,
        attempts: 1,
        lastError: message,
        queuedAt: Date.now(),
        lastAttemptAt: Date.now()
      });
    }
    this.saveOutbox();
    this.triggerSyncChange();
    this.scheduleOutboxFlush();
  }

  private scheduleOutboxFlush(delayMs: number = OUTBOX_RETRY_MS) {
    if (this.outboxTimer || typeof setTimeout === "undefined") return;
    this.outboxTimer = setTimeout(() => {
      this.outboxTimer = null;
      this.flushOutbox();
    }, delayMs);
  }

  /**
   * Retries every parked write. Safe to call at any time; upserts are idempotent and deletes
   * are keyed by id. Returns the number of entries still pending afterwards.
   */
  public async flushOutbox(): Promise<number> {
    if (!isSupabaseConfigured || this.isRestoring || this.outboxFlushing) return this.outbox.length;
    if (this.outbox.length === 0) return 0;

    this.outboxFlushing = true;
    const stillPending: PendingWrite[] = [];

    try {
      for (const entry of [...this.outbox]) {
        // A record deleted after the write was queued no longer needs uploading.
        if (entry.op === "upsert" && this.isDeleted(entry.table, entry.recordId)) continue;

        try {
          if (entry.op === "delete") {
            const { error } = await supabase.from(entry.table).delete().eq("id", entry.recordId);
            if (error) {
              entry.attempts += 1;
              entry.lastError = String(error.message || error);
              entry.lastAttemptAt = Date.now();
              stillPending.push(entry);
            }
          } else {
            // Prefer the current in-memory version so the newest state wins.
            const live = this.findLiveRecord(entry.table, entry.recordId);
            const payload = live || entry.payload;
            if (!payload) continue;
            const { error } = await safeUpsertSupabaseTable(entry.table, payload);
            if (error) {
              entry.attempts += 1;
              entry.lastError = String(error.message || error);
              entry.lastAttemptAt = Date.now();
              stillPending.push(entry);
            }
          }
        } catch (err: any) {
          entry.attempts += 1;
          entry.lastError = String(err?.message || err);
          entry.lastAttemptAt = Date.now();
          stillPending.push(entry);
        }
      }
    } finally {
      this.outbox = stillPending;
      this.saveOutbox();
      this.outboxFlushing = false;
      this.triggerSyncChange();
      if (stillPending.length > 0) this.scheduleOutboxFlush();
    }

    return this.outbox.length;
  }

  private findLiveRecord(table: string, id: string): any | undefined {
    const key = this.tableStateKey(table);
    if (!key) return undefined;
    const list = (this as any)[key];
    if (!Array.isArray(list)) return undefined;
    return list.find((item: any) => item && item.id === id);
  }

  /**
   * Truthful sync state for the UI: how many cloud writes are still unconfirmed and why.
   */
  public getSyncHealth(): {
    cloudEnabled: boolean;
    isSyncing: boolean;
    pendingWrites: number;
    lastError: string | null;
    connectionError: string | null;
  } {
    const last = this.outbox.length > 0 ? this.outbox[this.outbox.length - 1] : null;
    return {
      cloudEnabled: isSupabaseConfigured,
      isSyncing: this.isSyncing,
      pendingWrites: this.outbox.length,
      lastError: last ? last.lastError : null,
      connectionError: this.connectionError
    };
  }

  /**
   * Awaits the write queue and reports whether everything reached Supabase.
   * Callers that show a "saved" confirmation should await this first.
   */
  public async confirmSaved(): Promise<{ saved: boolean; pending: number; error: string | null }> {
    await this.waitForSync();
    if (!isSupabaseConfigured) {
      return { saved: true, pending: 0, error: null };
    }
    if (this.outbox.length > 0) {
      await this.flushOutbox();
    }
    const health = this.getSyncHealth();
    return {
      saved: health.pendingWrites === 0,
      pending: health.pendingWrites,
      error: health.lastError
    };
  }

  // --- RECALCULATE OUTSTANDING BALANCES ---
  /**
   * Recomputes each customer's outstanding balance and order count from the invoice ledger.
   *
   * This deliberately does NOT create invoices. A previous version generated a zero-value
   * invoice (marked "Paid") for every order that had none, and it ran on every realtime
   * event — so an order arriving from another device before its invoice produced a second,
   * bogus invoice for the same order. Invoices are now only created by the explicit billing
   * paths (addOrder / addInvoice / saveFullOrderEdit).
   */
  public recalculateAllBalances() {
    let changed = false;
    const changedCustomers: Customer[] = [];
    this.customers = this.customers.map(c => {
      const customerInvoices = this.invoices.filter(inv => inv.customerId === c.id);
      const outstandingBalance = customerInvoices.reduce((sum, inv) => sum + inv.balanceDue, 0);
      const customerOrders = this.orders.filter(ord => ord.customerId === c.id);
      const totalOrdersCount = customerOrders.length;

      if (c.outstandingBalance !== outstandingBalance || c.totalOrdersCount !== totalOrdersCount) {
        changed = true;
        const updated = {
          ...c,
          outstandingBalance,
          totalOrdersCount
        };
        changedCustomers.push(updated);
        return updated;
      }
      return c;
    });

    if (changed) {
      this.saveKeyLocal("customers", this.customers);
      changedCustomers.forEach(cust => {
        this.pushSingleToSupabase("customers", cust);
      });
    }
  }

  // --- DATABASE BACKUP & RESTORE ---
  public getBackupData() {
    return {
      version: "6.0",
      timestamp: new Date().toISOString(),
      // Fold the catalog, templates and categories into the exported config. They live in
      // separate fields at runtime, and an earlier export could omit them entirely if a cloud
      // sync had replaced this.config wholesale — restoring then produced an empty catalog.
      config: {
        ...this.config,
        garmentCategories: this.garmentCategories,
        measurementTemplates: this.measurementTemplates,
        garmentCatalog: this.garmentCatalog
      },
      garmentCategories: this.garmentCategories,
      measurementTemplates: this.measurementTemplates,
      garmentCatalog: this.garmentCatalog,
      users: this.users,
      customers: this.customers,
      measurements: this.measurements,
      orders: this.orders,
      trials: this.trials,
      alterations: this.alterations,
      invoices: this.invoices,
      appointments: this.appointments,
      expenses: this.expenses,
      workers: this.workers,
      attendance: this.attendance,
      advances: this.advances,
      salaries: this.salaries
    };
  }

  public async restoreBackupData(backup: any): Promise<{ success: boolean; error?: string }> {
    // RESTORATION BARRIER STEP 1: Freeze normal synchronization and background mutations
    this.isRestoring = true;

    try {
      console.log("Entering Restore Barrier: flushing pending write queue...");
      // RESTORATION BARRIER STEP 2: Wait for all in-flight pending writes/deletes to drain
      await this.flushSupabaseQueue();

      // RESTORATION BARRIER STEP 3: Bump mutation generation to cancel any remaining queued mutations
      this.mutationGeneration++;
      console.log(`Restoration Barrier: mutation generation bumped to ${this.mutationGeneration}`);

      if (!backup || typeof backup !== "object") {
        return { success: false, error: "Invalid backup file format" };
      }
      if (!Array.isArray(backup.customers) || !Array.isArray(backup.orders)) {
        return { success: false, error: "Invalid backup content. Missing customers or orders." };
      }

      if (backup.config) this.config = backup.config;
      if (Array.isArray(backup.users)) this.users = backup.users;
      if (Array.isArray(backup.customers)) this.customers = backup.customers;
      if (Array.isArray(backup.measurements)) this.measurements = backup.measurements;
      if (Array.isArray(backup.orders)) this.orders = backup.orders;
      if (Array.isArray(backup.trials)) this.trials = backup.trials;
      if (Array.isArray(backup.alterations)) this.alterations = backup.alterations;
      if (Array.isArray(backup.invoices)) this.invoices = backup.invoices;
      if (Array.isArray(backup.appointments)) this.appointments = backup.appointments;
      if (Array.isArray(backup.expenses)) this.expenses = backup.expenses;
      if (Array.isArray(backup.workers)) this.workers = backup.workers;
      if (Array.isArray(backup.attendance)) this.attendance = backup.attendance;
      if (Array.isArray(backup.advances)) this.advances = backup.advances;
      if (Array.isArray(backup.salaries)) this.salaries = backup.salaries;

      // Catalog, templates and categories are held outside `config` at runtime. Restoring
      // config alone used to leave the showroom with an empty garment catalog, so pull them
      // back from either the top level or the embedded config, in that order.
      const restoredCategories = backup.garmentCategories || backup.config?.garmentCategories;
      const restoredTemplates = backup.measurementTemplates || backup.config?.measurementTemplates;
      const restoredCatalog = backup.garmentCatalog || backup.config?.garmentCatalog;
      if (Array.isArray(restoredCategories) && restoredCategories.length > 0) {
        this.garmentCategories = restoredCategories;
      }
      if (Array.isArray(restoredTemplates) && restoredTemplates.length > 0) {
        this.measurementTemplates = restoredTemplates;
      }
      if (Array.isArray(restoredCatalog) && restoredCatalog.length > 0) {
        this.garmentCatalog = restoredCatalog;
      }
      this.config = {
        ...this.config,
        garmentCategories: this.garmentCategories,
        measurementTemplates: this.measurementTemplates,
        garmentCatalog: this.garmentCatalog
      };

      // A restore re-asserts the backup as the truth, so previous deletions must not be
      // replayed against the records it brings back.
      this.clearAllTombstones();
      // Anything still parked in the outbox belongs to the state we just replaced.
      this.outbox = [];
      this.saveOutbox();

      this.saveAllLocal();
      this.recalculateAllBalances();

      // RESTORATION BARRIER STEP 4: Force Overwrite Supabase tables with restored backup
      if (isSupabaseConfigured) {
        await this.initializeSupabaseSync(true);
      }

      // RESTORATION BARRIER STEP 5: Re-sync fresh state directly from Supabase to guarantee in-memory cache matches remote database
      if (isSupabaseConfigured) {
        await this.initializeSupabaseSync(false);
      }

      await this.flushSupabaseQueue();
      return { success: true };
    } catch (e: any) {
      console.error("Critical failure during restoreBackupData:", e);
      return { success: false, error: e.message || "An unknown error occurred during database restoration" };
    } finally {
      // RESTORATION BARRIER STEP 6: Unfreeze normal synchronization
      this.isRestoring = false;
      this.triggerSyncChange();
    }
  }

  // --- CONFIG ---
  public getShopConfig(): ShopConfig {
    return {
      ...this.config,
      garmentCategories: this.garmentCategories,
      measurementTemplates: this.measurementTemplates,
      garmentCatalog: this.garmentCatalog
    };
  }
  public updateShopConfig(newConfig: ShopConfig) {
    this.config = {
      ...newConfig,
      garmentCategories: this.garmentCategories,
      measurementTemplates: this.measurementTemplates,
      garmentCatalog: this.garmentCatalog
    };
    this.saveKeyLocal("config", this.config);
    this.pushSingleToSupabase("config", { id: "global_config", ...this.config });
  }

  // --- GARMENT CATEGORIES ---
  public getGarmentCategories(): GarmentCategory[] {
    return this.garmentCategories.filter(c => c.active !== false).sort((a, b) => a.displayOrder - b.displayOrder);
  }
  public getAllGarmentCategoriesIncludingInactive(): GarmentCategory[] {
    return [...this.garmentCategories].sort((a, b) => a.displayOrder - b.displayOrder);
  }
  public addGarmentCategory(category: Omit<GarmentCategory, "id">): GarmentCategory {
    const newCategory: GarmentCategory = {
      ...category,
      id: `cat_${Date.now()}`
    };
    this.garmentCategories.push(newCategory);
    this.saveKeyLocal("garmentCategories", this.garmentCategories);
    this.updateShopConfig(this.config);
    return newCategory;
  }
  public updateGarmentCategory(id: string, updates: Partial<GarmentCategory>) {
    this.garmentCategories = this.garmentCategories.map(c => c.id === id ? { ...c, ...updates } : c);
    this.saveKeyLocal("garmentCategories", this.garmentCategories);
    this.updateShopConfig(this.config);
  }
  public deleteGarmentCategory(id: string) {
    this.garmentCategories = this.garmentCategories.filter(c => c.id !== id);
    this.saveKeyLocal("garmentCategories", this.garmentCategories);
    this.updateShopConfig(this.config);
  }

  // --- MEASUREMENT TEMPLATES ---
  public getMeasurementTemplates(): MeasurementTemplate[] {
    return this.measurementTemplates;
  }
  public getMeasurementTemplateById(id: string): MeasurementTemplate | undefined {
    return this.measurementTemplates.find(t => t.id === id) || defaultMeasurementTemplates[0];
  }
  public addMeasurementTemplate(template: Omit<MeasurementTemplate, "id" | "createdAt" | "updatedAt">): MeasurementTemplate {
    const newTmpl: MeasurementTemplate = {
      ...template,
      id: `tmpl_${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.measurementTemplates.push(newTmpl);
    this.saveKeyLocal("measurementTemplates", this.measurementTemplates);
    this.updateShopConfig(this.config);
    return newTmpl;
  }
  public updateMeasurementTemplate(id: string, updates: Partial<MeasurementTemplate>) {
    this.measurementTemplates = this.measurementTemplates.map(t => t.id === id ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t);
    this.saveKeyLocal("measurementTemplates", this.measurementTemplates);
    this.updateShopConfig(this.config);
  }
  public deleteMeasurementTemplate(id: string) {
    this.measurementTemplates = this.measurementTemplates.filter(t => t.id !== id);
    this.saveKeyLocal("measurementTemplates", this.measurementTemplates);
    this.updateShopConfig(this.config);
  }

  // --- GARMENT CATALOG ---
  public getGarmentCatalog(): GarmentCatalogItem[] {
    return this.garmentCatalog.filter(g => g.active !== false).sort((a, b) => a.displayOrder - b.displayOrder);
  }
  public getAllGarmentCatalogIncludingInactive(): GarmentCatalogItem[] {
    return [...this.garmentCatalog].sort((a, b) => a.displayOrder - b.displayOrder);
  }
  public getGarmentCatalogItemById(id: string): GarmentCatalogItem | undefined {
    return this.garmentCatalog.find(g => g.id === id);
  }
  public addGarmentCatalogItem(item: Omit<GarmentCatalogItem, "id">): GarmentCatalogItem {
    const newItem: GarmentCatalogItem = {
      ...item,
      id: `g_${Date.now()}`
    };
    this.garmentCatalog.push(newItem);
    this.saveKeyLocal("garmentCatalog", this.garmentCatalog);
    this.updateShopConfig(this.config);
    return newItem;
  }
  public updateGarmentCatalogItem(id: string, updates: Partial<GarmentCatalogItem>) {
    this.garmentCatalog = this.garmentCatalog.map(g => g.id === id ? { ...g, ...updates } : g);
    this.saveKeyLocal("garmentCatalog", this.garmentCatalog);
    this.updateShopConfig(this.config);
  }
  public deleteGarmentCatalogItem(id: string) {
    this.garmentCatalog = this.garmentCatalog.filter(g => g.id !== id);
    this.saveKeyLocal("garmentCatalog", this.garmentCatalog);
    this.updateShopConfig(this.config);
  }

  // --- USERS ---
  public getUsers(): User[] {
    return this.users.filter(u => u.active);
  }
  public getAllUsersIncludingInactive(): User[] {
    return this.users;
  }
  public addUser(user: Omit<User, "id">): User {
    const newUser: User = {
      ...user,
      id: `usr_${Date.now()}`
    };
    this.users.push(newUser);
    this.saveKeyLocal("users", this.users);
    this.pushSingleToSupabase("users", newUser);
    return newUser;
  }
  public updateUser(id: string, updated: Partial<User>) {
    this.users = this.users.map(u => u.id === id ? { ...u, ...updated } : u);
    this.saveKeyLocal("users", this.users);
    const match = this.users.find(u => u.id === id);
    if (match) {
      this.pushSingleToSupabase("users", match);
    }
  }

  // --- CUSTOMERS ---
  public getCustomers(): Customer[] {
    return this.customers;
  }
  public getCustomerById(id: string): Customer | undefined {
    return this.customers.find(c => c.id === id);
  }
  public getCustomerByQrId(qrId: string): Customer | undefined {
    return this.customers.find(c => c.qrCodeId === qrId);
  }
  public addCustomer(cust: Omit<Customer, "id" | "customerSince" | "totalOrdersCount" | "outstandingBalance" | "qrCodeId" | "memoryNotes" | "preferenceTags">): Customer {
    const id = `cust_${Date.now()}`;
    const newCustomer: Customer = {
      ...cust,
      id,
      customerSince: new Date().toISOString(),
      totalOrdersCount: 0,
      outstandingBalance: 0,
      qrCodeId: `qr_${cust.fullName.toLowerCase().replace(/\s+/g, "_")}_${cust.mobileNumber.slice(-5)}`,
      memoryNotes: [],
      preferenceTags: ["First Time Customer"]
    };
    this.customers.push(newCustomer);
    this.saveKeyLocal("customers", this.customers);
    this.pushSingleToSupabase("customers", newCustomer);
    return newCustomer;
  }
  public updateCustomer(id: string, updated: Partial<Customer>) {
    this.customers = this.customers.map(c => c.id === id ? { ...c, ...updated } : c);
    this.saveKeyLocal("customers", this.customers);
    const match = this.customers.find(c => c.id === id);
    if (match) {
      this.pushSingleToSupabase("customers", match);
    }
  }
  /**
   * Reports exactly what deleting a customer would destroy, so the UI can warn before acting
   * and offer archiving instead. Deleting a customer with settled invoices erases accounting
   * history, which is why `safeToDelete` goes false once money has changed hands.
   */
  public getCustomerDeletionImpact(id: string): {
    exists: boolean;
    customerName: string;
    orders: number;
    measurements: number;
    invoices: number;
    appointments: number;
    trials: number;
    alterations: number;
    recordedPayments: number;
    paidAmount: number;
    outstandingBalance: number;
    safeToDelete: boolean;
    reason?: string;
  } {
    const customer = this.customers.find(c => c.id === id);
    if (!customer) {
      return {
        exists: false, customerName: "", orders: 0, measurements: 0, invoices: 0,
        appointments: 0, trials: 0, alterations: 0, recordedPayments: 0,
        paidAmount: 0, outstandingBalance: 0, safeToDelete: true
      };
    }

    const orders = this.orders.filter(o => o.customerId === id);
    const invoices = this.invoices.filter(i => i.customerId === id);
    const orderIds = new Set(orders.map(o => o.id));

    let recordedPayments = 0;
    let paidAmount = 0;
    invoices.forEach(inv => {
      (inv.payments || []).forEach(p => {
        recordedPayments += 1;
        paidAmount += parseFloat(String(p.amount)) || 0;
      });
    });
    const outstandingBalance = invoices.reduce((s, i) => s + (parseFloat(String(i.balanceDue)) || 0), 0);

    const impact = {
      exists: true,
      customerName: customer.fullName,
      orders: orders.length,
      measurements: this.measurements.filter(m => m.customerId === id).length,
      invoices: invoices.length,
      appointments: this.appointments.filter(a => a.customerId === id).length,
      trials: this.trials.filter(t => t.customerId === id || orderIds.has(t.orderId)).length,
      alterations: this.alterations.filter(a => a.customerId === id || orderIds.has(a.orderId)).length,
      recordedPayments,
      paidAmount,
      outstandingBalance,
      safeToDelete: true,
      reason: undefined as string | undefined
    };

    if (recordedPayments > 0) {
      impact.safeToDelete = false;
      impact.reason = `${customer.fullName} has ${recordedPayments} recorded payment${recordedPayments === 1 ? "" : "s"} totalling ₹${paidAmount.toLocaleString("en-IN")}. Deleting the customer would erase that from your accounts. Archive the customer instead — they disappear from active lists while the ledger stays intact.`;
    } else if (outstandingBalance > 0) {
      impact.safeToDelete = false;
      impact.reason = `${customer.fullName} still owes ₹${outstandingBalance.toLocaleString("en-IN")}. Settle or write off the balance before deleting, or archive the customer to keep the record.`;
    }

    return impact;
  }

  /** Hides a customer from active lists without touching any historical record. */
  public archiveCustomer(id: string) {
    const customer = this.customers.find(c => c.id === id);
    if (!customer) return;
    const tags = Array.isArray(customer.preferenceTags) ? customer.preferenceTags : [];
    this.updateCustomer(id, {
      preferenceTags: tags.includes(ARCHIVED_TAG) ? tags : [...tags, ARCHIVED_TAG]
    });
  }

  public unarchiveCustomer(id: string) {
    const customer = this.customers.find(c => c.id === id);
    if (!customer) return;
    this.updateCustomer(id, {
      preferenceTags: (customer.preferenceTags || []).filter(t => t !== ARCHIVED_TAG)
    });
  }

  public isCustomerArchived(customer: Customer): boolean {
    return Array.isArray(customer.preferenceTags) && customer.preferenceTags.includes(ARCHIVED_TAG);
  }

  /**
   * Permanently removes a customer and everything hanging off them.
   *
   * Refuses when the customer carries financial history unless `force` is passed, so an
   * accidental click cannot wipe a paid ledger. Trials and alterations are now cleared from
   * local state too — previously they were only deleted in Supabase, so the next merge
   * re-uploaded the orphans.
   */
  public deleteCustomer(id: string, options: { force?: boolean } = {}) {
    const impact = this.getCustomerDeletionImpact(id);
    if (!impact.exists) return;
    if (!impact.safeToDelete && !options.force) {
      throw new Error(impact.reason || "This customer cannot be deleted safely.");
    }

    const measurementIds = this.measurements.filter(m => m.customerId === id).map(m => m.id);
    const orderIds = this.orders.filter(o => o.customerId === id).map(o => o.id);
    const orderIdSet = new Set(orderIds);
    const invoiceIds = this.invoices.filter(i => i.customerId === id).map(i => i.id);
    const appointmentIds = this.appointments.filter(a => a.customerId === id).map(a => a.id);
    const trialIds = this.trials.filter(t => t.customerId === id || orderIdSet.has(t.orderId)).map(t => t.id);
    const alterationIds = this.alterations.filter(a => a.customerId === id || orderIdSet.has(a.orderId)).map(a => a.id);

    this.customers = this.customers.filter(c => c.id !== id);
    this.measurements = this.measurements.filter(m => m.customerId !== id);
    this.orders = this.orders.filter(o => o.customerId !== id);
    this.invoices = this.invoices.filter(i => i.customerId !== id);
    this.appointments = this.appointments.filter(a => a.customerId !== id);
    this.trials = this.trials.filter(t => !trialIds.includes(t.id));
    this.alterations = this.alterations.filter(a => !alterationIds.includes(a.id));

    this.saveAllLocal();
    this.recalculateAllBalances();

    // Specific Supabase DB deletes (each also writes a tombstone)
    this.deleteFromSupabase("customers", id);
    measurementIds.forEach(mid => this.deleteFromSupabase("measurements", mid));
    orderIds.forEach(oid => this.deleteFromSupabase("orders", oid));
    trialIds.forEach(tid => this.deleteFromSupabase("trials", tid));
    alterationIds.forEach(aid => this.deleteFromSupabase("alterations", aid));
    invoiceIds.forEach(iid => this.deleteFromSupabase("invoices", iid));
    appointmentIds.forEach(aid => this.deleteFromSupabase("appointments", aid));
  }

  public searchCustomers(query: string): Customer[] {
    if (!query.trim()) return [];
    const q = query.toLowerCase().trim();
    return this.customers.filter(c =>
      c.fullName.toLowerCase().includes(q) ||
      c.mobileNumber.includes(q)
    );
  }

  public addCustomerMemoryNote(customerId: string, noteText: string, author: string) {
    const note: MemoryNote = {
      note: noteText,
      addedBy: author,
      timestamp: new Date().toISOString()
    };
    this.customers = this.customers.map(c => {
      if (c.id === customerId) {
        return {
          ...c,
          memoryNotes: [note, ...c.memoryNotes]
        };
      }
      return c;
    });
    this.saveKeyLocal("customers", this.customers);
    const match = this.customers.find(c => c.id === customerId);
    if (match) {
      this.pushSingleToSupabase("customers", match);
    }
  }

  public deleteCustomerMemoryNote(customerId: string, noteTimestamp: string) {
    this.customers = this.customers.map(c => {
      if (c.id === customerId) {
        return {
          ...c,
          memoryNotes: c.memoryNotes.filter(n => n.timestamp !== noteTimestamp)
        };
      }
      return c;
    });
    this.saveKeyLocal("customers", this.customers);
    const match = this.customers.find(c => c.id === customerId);
    if (match) {
      this.pushSingleToSupabase("customers", match);
    }
  }

  // --- MEASUREMENTS ---
  public getAllMeasurements(): Measurement[] {
    return this.measurements;
  }
  public getMeasurements(customerId: string): Measurement[] {
    return this.measurements
      .filter(m => m.customerId === customerId)
      .sort((a, b) => new Date(b.versionDate).getTime() - new Date(a.versionDate).getTime());
  }
  public getMeasurementById(id: string): Measurement | undefined {
    return this.measurements.find(m => m.id === id);
  }
  public getLatestMeasurement(customerId: string): Measurement | undefined {
    const list = this.getMeasurements(customerId);
    return list.length > 0 ? list[0] : undefined;
  }

  public saveMeasurement(meas: Omit<Measurement, "id" | "versionDate" | "slipNumber" | "changesSincePrevious">): Measurement {
    const customerId = meas.customerId;
    const latestMeas = this.getLatestMeasurement(customerId);

    meas.coatIndoWestern = meas.coatIndoWestern || {} as any;
    meas.pent = meas.pent || {} as any;
    meas.vest = meas.vest || {} as any;
    meas.shirtKurta = meas.shirtKurta || {} as any;

    const defaultCoat = { length: "", chest: "", waist: "", neck: "", tira: "", hb: "", cback: "", arms: "", bicep: "", front: "", moda: "" };
    const defaultPent = { waist: "", hips: "", patt: "", bottom: "", length: "", inlength: "", knee: "" };
    const defaultVest = { length: "", chest: "", waist: "", hip: "", tira: "", neck: "" };
    const defaultShirt = { length: "", chest: "", waist: "", hip: "", tira: "", arms: "", neck: "", cback: "", front: "", moda: "", bicep: "" };

    meas.coatIndoWestern = { ...defaultCoat, ...meas.coatIndoWestern };
    meas.pent = { ...defaultPent, ...meas.pent };
    meas.vest = { ...defaultVest, ...meas.vest };
    meas.shirtKurta = { ...defaultShirt, ...meas.shirtKurta };

    // Merge previous measurements so that empty fields don't overwrite existing measurements
    if (latestMeas) {
      const coatKeys = Object.keys(meas.coatIndoWestern) as (keyof typeof meas.coatIndoWestern)[];
      coatKeys.forEach(k => {
        if ((meas.coatIndoWestern[k] === undefined || meas.coatIndoWestern[k] === "") && latestMeas.coatIndoWestern?.[k]) {
          meas.coatIndoWestern[k] = latestMeas.coatIndoWestern[k];
        }
      });

      const pentKeys = Object.keys(meas.pent) as (keyof typeof meas.pent)[];
      pentKeys.forEach(k => {
        if ((meas.pent[k] === undefined || meas.pent[k] === "") && latestMeas.pent?.[k]) {
          meas.pent[k] = latestMeas.pent[k];
        }
      });

      const vestKeys = Object.keys(meas.vest) as (keyof typeof meas.vest)[];
      vestKeys.forEach(k => {
        if ((meas.vest[k] === undefined || meas.vest[k] === "") && latestMeas.vest?.[k]) {
          meas.vest[k] = latestMeas.vest[k];
        }
      });

      const shirtKeys = Object.keys(meas.shirtKurta) as (keyof typeof meas.shirtKurta)[];
      shirtKeys.forEach(k => {
        if ((meas.shirtKurta[k] === undefined || meas.shirtKurta[k] === "") && latestMeas.shirtKurta?.[k]) {
          meas.shirtKurta[k] = latestMeas.shirtKurta[k];
        }
      });

      if (!meas.designNotes && latestMeas.designNotes) meas.designNotes = latestMeas.designNotes;
      if (!meas.fabricSelected && latestMeas.fabricSelected) meas.fabricSelected = latestMeas.fabricSelected;
      if (!meas.liningChoice && latestMeas.liningChoice) meas.liningChoice = latestMeas.liningChoice;
      if (!meas.remarks && latestMeas.remarks) meas.remarks = latestMeas.remarks;
    }

    const id = `meas_${Date.now()}`;
    const versionDate = new Date().toISOString();
    const slipNumber = `SS-${String(this.measurements.length + 1).padStart(4, "0")}`;

    const changesSincePrevious: MeasurementChange[] = [];
    if (latestMeas) {
      const coatFields: (keyof typeof meas.coatIndoWestern)[] = ["length", "chest", "waist", "neck", "tira", "hb", "cback", "arms", "bicep", "front", "moda"];
      coatFields.forEach(field => {
        const valNew = meas.coatIndoWestern[field];
        const valOld = latestMeas.coatIndoWestern[field];
        if (valNew && valOld && valNew !== valOld) {
          const numNew = parseFloat(valNew);
          const numOld = parseFloat(valOld);
          let changeStr = "Changed";
          if (!isNaN(numNew) && !isNaN(numOld)) {
            const diff = numNew - numOld;
            changeStr = diff > 0 ? `+${diff}` : `${diff}`;
          }
          changesSincePrevious.push({
            field,
            garment: "Coat/Indo Western",
            oldValue: valOld,
            newValue: valNew,
            change: changeStr
          });
        }
      });

      const pentFields: (keyof typeof meas.pent)[] = ["waist", "hips", "patt", "bottom", "length", "inlength", "knee"];
      pentFields.forEach(field => {
        const valNew = meas.pent[field];
        const valOld = latestMeas.pent[field];
        if (valNew && valOld && valNew !== valOld) {
          const numNew = parseFloat(valNew);
          const numOld = parseFloat(valOld);
          let changeStr = "Changed";
          if (!isNaN(numNew) && !isNaN(numOld)) {
            const diff = numNew - numOld;
            changeStr = diff > 0 ? `+${diff}` : `${diff}`;
          }
          changesSincePrevious.push({
            field,
            garment: "Pent",
            oldValue: valOld,
            newValue: valNew,
            change: changeStr
          });
        }
      });

      const vestFields: (keyof typeof meas.vest)[] = ["length", "chest", "waist", "hip", "tira", "neck"];
      vestFields.forEach(field => {
        const valNew = meas.vest[field];
        const valOld = latestMeas.vest[field];
        if (valNew && valOld && valNew !== valOld) {
          const numNew = parseFloat(valNew);
          const numOld = parseFloat(valOld);
          let changeStr = "Changed";
          if (!isNaN(numNew) && !isNaN(numOld)) {
            const diff = numNew - numOld;
            changeStr = diff > 0 ? `+${diff}` : `${diff}`;
          }
          changesSincePrevious.push({
            field,
            garment: "Vest",
            oldValue: valOld,
            newValue: valNew,
            change: changeStr
          });
        }
      });

      const shirtKurtaFields: (keyof typeof meas.shirtKurta)[] = [
        "length", "chest", "waist", "hip", "tira", "arms", "neck", "cback", "front", "moda", "bicep"
      ];
      shirtKurtaFields.forEach(field => {
        const valNew = meas.shirtKurta[field];
        const valOld = latestMeas.shirtKurta[field];
        if (valNew && valOld && valNew !== valOld) {
          const numNew = parseFloat(valNew);
          const numOld = parseFloat(valOld);
          let changeStr = "Changed";
          if (!isNaN(numNew) && !isNaN(numOld)) {
            const diff = numNew - numOld;
            changeStr = diff > 0 ? `+${diff}` : `${diff}`;
          }
          changesSincePrevious.push({
            field,
            garment: "Shirt / Kurta",
            oldValue: valOld,
            newValue: valNew,
            change: changeStr
          });
        }
      });
    }

    const newMeasurement: Measurement = {
      ...meas,
      id,
      versionDate,
      slipNumber,
      changesSincePrevious
    };

    this.measurements.push(newMeasurement);
    this.saveKeyLocal("measurements", this.measurements);
    this.pushSingleToSupabase("measurements", newMeasurement);
    this.runPreferenceLearning(customerId);
    return newMeasurement;
  }

  // --- ORDERS ---
  public getOrders(): Order[] {
    // Copy before sorting: Array.sort mutates in place, and reordering the live state array
    // mid-render produces inconsistent lists across components.
    return [...this.orders].sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime());
  }
  public getOrdersForCustomer(customerId: string): Order[] {
    return this.orders.filter(o => o.customerId === customerId);
  }
  public getOrderById(id: string): Order | undefined {
    return this.orders.find(o => o.id === id);
  }

  /**
   * Keeps an order's invoice in step with the order.
   *
   * Non-destructive by design. Earlier versions rebuilt lineItems from garmentTypes, zeroed
   * discount/tax, and replaced the payments array with a single synthetic "Cash" entry on
   * every call — including plain status changes — which destroyed real billing breakdowns and
   * payment history. Now:
   *   - recorded payments are the source of truth for how much has been paid and are never
   *     rewritten here;
   *   - lineItems, discount and tax are left untouched unless a new total is supplied and the
   *     invoice has no itemised breakdown of its own;
   *   - passing no amounts (a status change) only refreshes the derived balance.
   */
  public syncInvoiceForOrder(order: Order, totalAmount?: number, advancePaid?: number) {
    let existingInvoice = this.invoices.find(i => i.linkedOrderId === order.id);

    if (existingInvoice) {
      const recordedPayments = Array.isArray(existingInvoice.payments) ? existingInvoice.payments : [];
      const sumOfPayments = recordedPayments.reduce((sum, p) => sum + (parseFloat(String(p.amount)) || 0), 0);

      const newTotal = parseFloat(String(totalAmount !== undefined ? totalAmount : existingInvoice.grandTotal)) || 0;

      // Recorded payments win. Only fall back to the passed-in advance when nothing has been
      // receipted yet, so a deposit booked at order creation still registers.
      const newAdvance = recordedPayments.length > 0
        ? sumOfPayments
        : (parseFloat(String(advancePaid !== undefined ? advancePaid : existingInvoice.advancePaid)) || 0);

      if (newTotal < newAdvance) {
        throw new Error(
          `Cannot set this order's total to ₹${newTotal.toLocaleString("en-IN")} — ₹${newAdvance.toLocaleString("en-IN")} has already been received against it.`
        );
      }

      const newBalance = Math.max(0, newTotal - newAdvance);
      const newPaymentStatus: PaymentStatus =
        newBalance === 0 ? "Paid" : (newAdvance > 0 ? "Partially Paid" : "Unpaid");

      // Seed a payment entry only when a deposit exists but was never receipted.
      const updatedPayments = recordedPayments.length === 0 && newAdvance > 0
        ? [{
            amount: newAdvance,
            date: existingInvoice.invoiceDate,
            mode: "Cash" as const,
            recordedBy: "Billing Counter"
          }]
        : recordedPayments;

      const hasOwnLineItems = Array.isArray(existingInvoice.lineItems) && existingInvoice.lineItems.length > 0;
      const shouldSeedLineItems = !hasOwnLineItems && totalAmount !== undefined && order.garmentTypes.length > 0;

      this.invoices = this.invoices.map(inv => {
        if (inv.id === existingInvoice!.id) {
          return {
            ...inv,
            customerId: order.customerId,
            linkedOrderId: order.id,
            // Preserve the invoice's own subtotal/discount/tax structure; only move the
            // grand total when the caller supplied a new one.
            subtotal: totalAmount !== undefined ? newTotal + (inv.discount || 0) - (inv.taxAmount || 0) : inv.subtotal,
            grandTotal: newTotal,
            advancePaid: newAdvance,
            balanceDue: newBalance,
            paymentStatus: newPaymentStatus,
            payments: updatedPayments,
            lineItems: shouldSeedLineItems
              ? order.garmentTypes.map(g => ({
                  description: `Custom tailoring of ${g}`,
                  quantity: 1,
                  rate: Math.round(newTotal / (order.garmentTypes.length || 1)),
                  amount: Math.round(newTotal / (order.garmentTypes.length || 1)),
                }))
              : inv.lineItems
          };
        }
        return inv;
      });

      this.saveKeyLocal("invoices", this.invoices);
      const updatedInv = this.invoices.find(i => i.id === existingInvoice!.id);
      if (updatedInv) {
        this.pushSingleToSupabase("invoices", updatedInv);
      }
    } else {
      // Only mint an invoice when the caller actually supplied billing figures. A bare status
      // change must never conjure a zero-value invoice for an order.
      if (totalAmount === undefined || totalAmount === null || isNaN(totalAmount)) {
        return;
      }

      const finalTotal = parseFloat(String(totalAmount));
      const finalAdvance = parseFloat(String(advancePaid !== undefined && advancePaid !== null && !isNaN(advancePaid) ? advancePaid : 0));

      if (finalTotal < 0) {
        throw new Error("Strict Transaction Error: totalAmount cannot be negative.");
      }
      if (finalAdvance < 0) {
        throw new Error("Strict Transaction Error: paidDeposit (advance) cannot be negative.");
      }
      if (finalAdvance > finalTotal) {
        throw new Error("Strict Transaction Error: paidDeposit (advance) cannot exceed totalAmount.");
      }

      const id = order.linkedInvoiceId || `inv_${Date.now()}`;
      const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
      const invoiceDate = order.orderDate || new Date().toISOString();
      const balanceDue = Math.max(0, finalTotal - finalAdvance);
      
      let paymentStatus: PaymentStatus = "Unpaid";
      if (balanceDue === 0) {
        paymentStatus = "Paid";
      } else if (finalAdvance > 0 && balanceDue > 0) {
        paymentStatus = "Partially Paid";
      } else if (finalAdvance === 0 && balanceDue > 0) {
        paymentStatus = "Unpaid";
      }

      const payments: PaymentEntry[] = [];
      if (finalAdvance > 0) {
        payments.push({
          amount: finalAdvance,
          date: invoiceDate,
          mode: "Cash",
          recordedBy: "Billing Counter"
        });
      }

      const newInvoice: Invoice = {
        id,
        customerId: order.customerId,
        invoiceNumber,
        invoiceDate,
        linkedOrderId: order.id,
        lineItems: order.garmentTypes.map(g => ({
          description: `Custom tailoring of ${g}`,
          quantity: 1,
          rate: Math.round(finalTotal / (order.garmentTypes.length || 1)),
          amount: Math.round(finalTotal / (order.garmentTypes.length || 1)),
        })),
        subtotal: finalTotal,
        discount: 0,
        taxPercent: 0,
        taxAmount: 0,
        grandTotal: finalTotal,
        advancePaid: finalAdvance,
        balanceDue,
        paymentStatus,
        payments
      };

      this.invoices.push(newInvoice);
      this.saveKeyLocal("invoices", this.invoices);
      this.pushSingleToSupabase("invoices", newInvoice);

      order.linkedInvoiceId = id;
    }

    this.recalculateAllBalances();
  }

  public addOrder(order: Omit<Order, "id" | "orderNumber" | "orderDate" | "statusHistory">, totalAmount?: number, advancePaid?: number): Order {
    const finalTotal = parseFloat(String(totalAmount !== undefined && totalAmount !== null && !isNaN(totalAmount) ? totalAmount : 0));
    const finalAdvance = parseFloat(String(advancePaid !== undefined && advancePaid !== null && !isNaN(advancePaid) ? advancePaid : 0));

    if (finalTotal < 0) {
      throw new Error("Strict Transaction Error: totalAmount cannot be negative.");
    }
    if (finalAdvance < 0) {
      throw new Error("Strict Transaction Error: advancePaid (paid deposit) cannot be negative.");
    }
    if (finalAdvance > finalTotal) {
      throw new Error("Strict Transaction Error: advancePaid (paid deposit) cannot exceed totalAmount.");
    }

    const id = `ord_${Date.now()}`;
    const orderNumber = `ORD-${Date.now().toString().slice(-6)}`;
    const orderDate = new Date().toISOString();

    // Pre-calculate linkedInvoiceId (required since totalAmount is valid and present)
    const preAllocatedInvoiceId = `inv_${Date.now()}`;

    // Ensure garmentLineItems and garmentTypes are populated and bidirectionally synced
    let garmentLineItems: GarmentLineItem[] = order.garmentLineItems || [];
    let garmentTypes: string[] = order.garmentTypes || [];

    if (garmentLineItems.length > 0) {
      garmentTypes = Array.from(new Set(garmentLineItems.map(g => g.garmentName)));
    } else if (garmentTypes.length > 0) {
      const perItemRate = garmentTypes.length > 0 ? Math.round(finalTotal / garmentTypes.length) : finalTotal;
      garmentLineItems = garmentTypes.map((gName, idx) => ({
        id: `item-${Date.now()}-${idx}`,
        garmentName: gName,
        category: "Custom",
        quantity: 1,
        fabric: order.fabricDetails || "",
        color: "",
        rate: perItemRate,
        discount: 0,
        amount: perItemRate,
        measurementValues: {},
        measurementStatus: "Pending",
        notes: ""
      }));
    }

    // Ensure linked measurement is retrieved
    const linkedMeas = order.linkedMeasurementVersionId ? this.getMeasurementById(order.linkedMeasurementVersionId) : this.getLatestMeasurement(order.customerId);
    const resolvedMeasId = linkedMeas?.id || order.linkedMeasurementVersionId || "";

    if (linkedMeas) {
      garmentLineItems = garmentLineItems.map(g => {
        const gLower = g.garmentName.toLowerCase();
        const mv = g.measurementValues || {};
        const isCoat = gLower.includes("coat") || gLower.includes("indo") || gLower.includes("blazer") || gLower.includes("sherwani") || gLower.includes("suit") || gLower.includes("achkan") || gLower.includes("jodhpuri") || gLower.includes("jacket") || gLower.includes("bandhgala") || gLower.includes("tuxedo") || gLower.includes("safari");
        const isPent = gLower.includes("pent") || gLower.includes("pant") || gLower.includes("trouser") || gLower.includes("pajama") || gLower.includes("salwar");
        const isVest = gLower.includes("vest") || gLower.includes("waistcoat") || gLower.includes("sadri");
        const isShirt = gLower.includes("shirt") || gLower.includes("kurta") || gLower.includes("kameez");

        const newMv = { ...mv };
        if (isCoat && linkedMeas.coatIndoWestern) {
          newMv.coatIndoWestern = { ...linkedMeas.coatIndoWestern, ...(mv.coatIndoWestern || {}) };
          Object.assign(newMv, newMv.coatIndoWestern);
          if (newMv.length) newMv.coatLength = newMv.length;
          if (newMv.chest) newMv.coatChest = newMv.chest;
          if (newMv.waist) newMv.coatWaist = newMv.waist;
          if (newMv.neck) newMv.coatNeck = newMv.neck;
          if (newMv.tira) newMv.coatTira = newMv.tira;
          if (newMv.hb) newMv.coatHb = newMv.hb;
          if (newMv.cback) newMv.coatCback = newMv.cback;
          if (newMv.arms) newMv.coatArms = newMv.arms;
          if (newMv.bicep) newMv.coatBicep = newMv.bicep;
          if (newMv.front) newMv.coatFront = newMv.front;
          if (newMv.moda) newMv.coatModa = newMv.moda;
        }
        if (isPent && linkedMeas.pent) {
          newMv.pent = { ...linkedMeas.pent, ...(mv.pent || {}) };
          Object.assign(newMv, newMv.pent);
          if (newMv.length) newMv.pentLength = newMv.length;
          if (newMv.inlength) newMv.pentInlength = newMv.inlength;
        }
        if (isVest && linkedMeas.vest) {
          newMv.vest = { ...linkedMeas.vest, ...(mv.vest || {}) };
          Object.assign(newMv, newMv.vest);
        }
        if (isShirt && linkedMeas.shirtKurta) {
          newMv.shirtKurta = { ...linkedMeas.shirtKurta, ...(mv.shirtKurta || {}) };
          Object.assign(newMv, newMv.shirtKurta);
        }

        return {
          ...g,
          measurementValues: newMv,
          // Must be "Complete" (the LineItemMeasurementStatus value the UI matches on).
          // The previous "Completed" never matched, so garments auto-filled from the
          // customer's size card still showed as having no measurements.
          measurementStatus: "Complete" as const
        };
      });
    }

    const newOrder: Order = {
      ...order,
      id,
      orderNumber,
      orderDate,
      updatedAt: orderDate,
      updated_at: orderDate,
      totalAmount: finalTotal,
      advancePaid: finalAdvance,
      garmentTypes,
      garmentLineItems,
      linkedMeasurementVersionId: resolvedMeasId,
      linkedInvoiceId: preAllocatedInvoiceId,
      statusHistory: [
        {
          status: order.status,
          timestamp: orderDate,
          updatedBy: "System Setup"
        }
      ]
    };

    // Sync measurement entries if present in line items
    if (order.garmentLineItems && order.garmentLineItems.length > 0) {
      const itemsWithMeas = order.garmentLineItems.filter(g => g.measurementValues && Object.keys(g.measurementValues).length > 0);
      if (itemsWithMeas.length > 0) {
        const mergedCoat: Record<string, string> = {};
        const mergedPent: Record<string, string> = {};
        const mergedVest: Record<string, string> = {};
        const mergedShirt: Record<string, string> = {};
        let mergedDesignNotes = "";
        let mergedFabric = "";
        let mergedLining = "";
        let mergedRemarks = "";

        itemsWithMeas.forEach(item => {
          const mv = item.measurementValues || {};
          if (mv.coatIndoWestern) Object.assign(mergedCoat, mv.coatIndoWestern);
          if (mv.pent) Object.assign(mergedPent, mv.pent);
          if (mv.vest) Object.assign(mergedVest, mv.vest);
          if (mv.shirtKurta) Object.assign(mergedShirt, mv.shirtKurta);
          if (mv.designNotes) mergedDesignNotes = mv.designNotes;
          if (mv.fabricSelected) mergedFabric = mv.fabricSelected;
          if (mv.liningChoice) mergedLining = mv.liningChoice;
          if (mv.remarks) mergedRemarks = mv.remarks;
        });

        const hasMeasContent =
          Object.values(mergedCoat).some(Boolean) ||
          Object.values(mergedPent).some(Boolean) ||
          Object.values(mergedVest).some(Boolean) ||
          Object.values(mergedShirt).some(Boolean) ||
          Boolean(mergedDesignNotes) ||
          Boolean(mergedRemarks);

        if (hasMeasContent) {
          const savedMeas = this.saveMeasurement({
            customerId: order.customerId,
            tryOnDate: order.expectedDeliveryDate || new Date().toISOString().split("T")[0],
            deliveryDate: order.expectedDeliveryDate || new Date().toISOString().split("T")[0],
            coatIndoWestern: mergedCoat as any,
            pent: mergedPent as any,
            vest: mergedVest as any,
            shirtKurta: mergedShirt as any,
            designNotes: mergedDesignNotes,
            fabricSelected: mergedFabric,
            liningChoice: mergedLining,
            remarks: mergedRemarks,
            createdBy: `New Order`
          });
          newOrder.linkedMeasurementVersionId = savedMeas.id;
        }
      }
    }

    this.orders.push(newOrder);

    // Save locally and push order to Supabase first, so it's referenceable by invoices (resolving foreign key dependency)
    this.saveKeyLocal("orders", this.orders);
    this.pushSingleToSupabase("orders", newOrder);

    // Now create and sync the invoice (it will find preAllocatedInvoiceId inside order.linkedInvoiceId)
    this.syncInvoiceForOrder(newOrder, finalTotal, finalAdvance);

    this.runPreferenceLearning(order.customerId);
    return newOrder;
  }

  public updateOrderStatus(orderId: string, status: OrderStatus, updatedBy: string) {
    this.orders = this.orders.map(o => {
      if (o.id === orderId) {
        const actualDeliveryDate = status === "Delivered" ? new Date().toISOString().split("T")[0] : o.actualDeliveryDate;
        return {
          ...o,
          status,
          actualDeliveryDate,
          statusHistory: [
            ...o.statusHistory,
            { status, timestamp: new Date().toISOString(), updatedBy }
          ]
        };
      }
      return o;
    });
    this.saveKeyLocal("orders", this.orders);
    const updatedOrder = this.orders.find(o => o.id === orderId);
    if (updatedOrder) {
      this.syncInvoiceForOrder(updatedOrder);
      this.pushSingleToSupabase("orders", updatedOrder);
    }
  }

  public updateOrder(id: string, updated: Partial<Order>) {
    this.orders = this.orders.map(o => o.id === id ? { ...o, ...updated } : o);
    this.saveKeyLocal("orders", this.orders);
    const updatedOrder = this.orders.find(o => o.id === id);
    if (updatedOrder) {
      this.syncInvoiceForOrder(updatedOrder);
      this.pushSingleToSupabase("orders", updatedOrder);
    }
  }

  public async saveFullOrderEdit(
    orderId: string,
    updatedOrderFields: Partial<Order>,
    lineItems: InvoiceLineItem[],
    financials: {
      subtotal: number;
      discount: number;
      taxPercent: number;
      taxAmount: number;
      grandTotal: number;
    }
  ): Promise<{ success: boolean; error?: any }> {
    const existingOrder = this.orders.find(o => o.id === orderId);
    if (!existingOrder) {
      return { success: false, error: { message: `Order with ID "${orderId}" not found in local memory state.` } };
    }

    const existingInvoice = this.invoices.find(i => i.linkedOrderId === orderId) || (existingOrder.linkedInvoiceId ? this.invoices.find(i => i.id === existingOrder.linkedInvoiceId) : undefined);

    // Calculate sum of recorded payments
    const advancePaid = existingInvoice?.payments && existingInvoice.payments.length > 0
      ? existingInvoice.payments.reduce((sum, p) => sum + (parseFloat(String(p.amount)) || 0), 0)
      : (existingInvoice?.advancePaid !== undefined && existingInvoice.advancePaid !== null ? existingInvoice.advancePaid : (existingOrder.advancePaid || 0));

    // Financial Guard check
    if (financials.grandTotal < advancePaid) {
      return {
        success: false,
        error: {
          message: `Financial Guard Violation: New Grand Total (₹${financials.grandTotal}) is less than recorded payments (₹${advancePaid}).`,
          details: `Refusing to save changes that create negative customer balances.`,
          hint: `Increase the item amounts or discount so Grand Total is at least ₹${advancePaid}.`
        }
      };
    }

    const balanceDue = Math.max(0, financials.grandTotal - advancePaid);
    const paymentStatus: PaymentStatus = balanceDue === 0 ? "Paid" : (advancePaid > 0 ? "Partially Paid" : "Unpaid");

    // Extract garment types from line item descriptions
    const extractedGarments = Array.from(new Set(
      lineItems.map(item => item.description.trim()).filter(Boolean)
    ));

    const nowIso = new Date().toISOString();

    const rawGarments = (updatedOrderFields.garmentLineItems && updatedOrderFields.garmentLineItems.length > 0)
      ? updatedOrderFields.garmentLineItems.map(g => g.garmentName)
      : (updatedOrderFields.garmentTypes || existingOrder.garmentTypes || []);

    const cleanGarmentTypes = Array.from(new Set(
      rawGarments.flatMap(name => 
        name.startsWith("Bespoke Tailoring:") 
          ? name.replace("Bespoke Tailoring:", "").split(",").map(s => s.trim())
          : name.split(",").map(s => s.trim())
      ).filter(Boolean)
    ));

    const updatedOrder: Order = {
      ...existingOrder,
      ...updatedOrderFields,
      updatedAt: nowIso,
      updated_at: nowIso,
      totalAmount: financials.grandTotal,
      advancePaid: advancePaid,
      garmentLineItems: updatedOrderFields.garmentLineItems !== undefined ? updatedOrderFields.garmentLineItems : (existingOrder.garmentLineItems || []),
      garmentTypes: cleanGarmentTypes.length > 0 ? cleanGarmentTypes : (existingOrder.garmentTypes || []),
      statusHistory: updatedOrderFields.status && updatedOrderFields.status !== existingOrder.status
        ? [...(existingOrder.statusHistory || []), { status: updatedOrderFields.status, timestamp: nowIso, updatedBy: "Admin Edit" }]
        : (existingOrder.statusHistory || [])
    };

    const invoiceId = existingInvoice?.id || `inv_${Date.now()}`;
    const updatedInvoice: Invoice = {
      id: invoiceId,
      customerId: updatedOrder.customerId,
      invoiceNumber: existingInvoice?.invoiceNumber || `INV-${Date.now().toString().slice(-6)}`,
      invoiceDate: existingInvoice?.invoiceDate || new Date().toISOString(),
      linkedOrderId: orderId,
      lineItems,
      subtotal: financials.subtotal,
      discount: financials.discount,
      taxPercent: financials.taxPercent,
      taxAmount: financials.taxAmount,
      grandTotal: financials.grandTotal,
      advancePaid,
      balanceDue,
      paymentStatus,
      payments: existingInvoice?.payments || (advancePaid > 0 ? [{ amount: advancePaid, date: new Date().toISOString(), mode: "Cash", recordedBy: "Order Edit" }] : []),
      linkedAppointmentId: existingInvoice?.linkedAppointmentId
    };

    updatedOrder.linkedInvoiceId = invoiceId;

    // SYNC MEASUREMENTS:
    // If any line item in updatedOrder has measurementValues, record a Measurement entry for the customer
    if (updatedOrder.garmentLineItems && updatedOrder.garmentLineItems.length > 0) {
      const itemsWithMeas = updatedOrder.garmentLineItems.filter(g => g.measurementValues && Object.keys(g.measurementValues).length > 0);
      if (itemsWithMeas.length > 0) {
        // Consolidate measurements from line items
        const mergedCoat: Record<string, string> = {};
        const mergedPent: Record<string, string> = {};
        const mergedVest: Record<string, string> = {};
        const mergedShirt: Record<string, string> = {};
        let mergedDesignNotes = "";
        let mergedFabric = "";
        let mergedLining = "";
        let mergedRemarks = "";

        itemsWithMeas.forEach(item => {
          const mv = item.measurementValues || {};
          if (mv.coatIndoWestern) Object.assign(mergedCoat, mv.coatIndoWestern);
          if (mv.pent) Object.assign(mergedPent, mv.pent);
          if (mv.vest) Object.assign(mergedVest, mv.vest);
          if (mv.shirtKurta) Object.assign(mergedShirt, mv.shirtKurta);
          if (mv.designNotes) mergedDesignNotes = mv.designNotes;
          if (mv.fabricSelected) mergedFabric = mv.fabricSelected;
          if (mv.liningChoice) mergedLining = mv.liningChoice;
          if (mv.remarks) mergedRemarks = mv.remarks;
        });

        const hasMeasContent =
          Object.values(mergedCoat).some(Boolean) ||
          Object.values(mergedPent).some(Boolean) ||
          Object.values(mergedVest).some(Boolean) ||
          Object.values(mergedShirt).some(Boolean) ||
          Boolean(mergedDesignNotes) ||
          Boolean(mergedRemarks);

        if (hasMeasContent) {
          const savedMeas = this.saveMeasurement({
            customerId: updatedOrder.customerId,
            tryOnDate: updatedOrder.expectedDeliveryDate || new Date().toISOString().split("T")[0],
            deliveryDate: updatedOrder.expectedDeliveryDate || new Date().toISOString().split("T")[0],
            coatIndoWestern: mergedCoat as any,
            pent: mergedPent as any,
            vest: mergedVest as any,
            shirtKurta: mergedShirt as any,
            designNotes: mergedDesignNotes,
            fabricSelected: mergedFabric,
            liningChoice: mergedLining,
            remarks: mergedRemarks,
            createdBy: `Order #${updatedOrder.orderNumber}`
          });
          updatedOrder.linkedMeasurementVersionId = savedMeas.id;
        }
      }
    }

    // Update Local Memory & Persistence First
    this.orders = this.orders.map(o => o.id === orderId ? updatedOrder : o);
    if (existingInvoice) {
      this.invoices = this.invoices.map(i => i.id === existingInvoice.id ? updatedInvoice : i);
    } else {
      this.invoices.push(updatedInvoice);
    }

    this.saveKeyLocal("orders", this.orders);
    this.saveKeyLocal("invoices", this.invoices);
    this.recalculateAllBalances();

    // Supabase background/cloud sync via write-through queue for strict ordering & foreign key safety
    if (isSupabaseConfigured) {
      try {
        this.pushSingleToSupabase("orders", updatedOrder);
        this.pushSingleToSupabase("invoices", updatedInvoice);
        await this.supabaseQueue;
      } catch (err: any) {
        console.warn("Supabase sync warning during order save:", err);
      }
    }

    this.triggerSyncChange();
    return { success: true };
  }

  /** Reports what deleting an order would destroy, including any money already taken. */
  public getOrderDeletionImpact(id: string): {
    exists: boolean;
    orderNumber: string;
    invoices: number;
    trials: number;
    alterations: number;
    recordedPayments: number;
    paidAmount: number;
    safeToDelete: boolean;
    reason?: string;
  } {
    const order = this.orders.find(o => o.id === id);
    if (!order) {
      return {
        exists: false, orderNumber: "", invoices: 0, trials: 0, alterations: 0,
        recordedPayments: 0, paidAmount: 0, safeToDelete: true
      };
    }

    const invoices = this.invoices.filter(inv => inv.linkedOrderId === id);
    let recordedPayments = 0;
    let paidAmount = 0;
    invoices.forEach(inv => {
      (inv.payments || []).forEach(p => {
        recordedPayments += 1;
        paidAmount += parseFloat(String(p.amount)) || 0;
      });
    });

    return {
      exists: true,
      orderNumber: order.orderNumber,
      invoices: invoices.length,
      trials: this.trials.filter(t => t.orderId === id).length,
      alterations: this.alterations.filter(a => a.orderId === id).length,
      recordedPayments,
      paidAmount,
      safeToDelete: recordedPayments === 0,
      reason: recordedPayments > 0
        ? `Order ${order.orderNumber} has ₹${paidAmount.toLocaleString("en-IN")} already received across ${recordedPayments} payment${recordedPayments === 1 ? "" : "s"}. Deleting it removes that money from your books. Cancel the order instead, or confirm you want the payment record destroyed.`
        : undefined
    };
  }

  /**
   * Deletes an order together with its invoice, trials and alterations.
   * Blocks by default when payments have been received against it; pass `force` to override
   * after the user has explicitly confirmed.
   */
  public deleteOrder(id: string, options: { force?: boolean } = {}) {
    const impact = this.getOrderDeletionImpact(id);
    if (!impact.exists) return;
    if (!impact.safeToDelete && !options.force) {
      throw new Error(impact.reason || "This order cannot be deleted safely.");
    }

    const trialIds = this.trials.filter(t => t.orderId === id).map(t => t.id);
    const alterationIds = this.alterations.filter(alt => alt.orderId === id).map(alt => alt.id);
    const invoiceIds = this.invoices.filter(inv => inv.linkedOrderId === id).map(inv => inv.id);

    this.orders = this.orders.filter(o => o.id !== id);
    this.trials = this.trials.filter(t => t.orderId !== id);
    this.alterations = this.alterations.filter(alt => alt.orderId !== id);
    this.invoices = this.invoices.filter(i => i.linkedOrderId !== id);

    this.saveKeyLocal("orders", this.orders);
    this.saveKeyLocal("trials", this.trials);
    this.saveKeyLocal("alterations", this.alterations);
    this.saveKeyLocal("invoices", this.invoices);

    this.deleteFromSupabase("orders", id);
    trialIds.forEach(tid => this.deleteFromSupabase("trials", tid));
    alterationIds.forEach(aid => this.deleteFromSupabase("alterations", aid));
    invoiceIds.forEach(iid => this.deleteFromSupabase("invoices", iid));

    this.recalculateAllBalances();
  }

  // --- TRIALS & ALTERATIONS ---
  public getTrialsForOrder(orderId: string): Trial[] {
    return this.trials.filter(t => t.orderId === orderId);
  }
  public getAlterationsForOrder(orderId: string): Alteration[] {
    return this.alterations.filter(a => a.orderId === orderId);
  }
  public getTrialsForCustomer(customerId: string): Trial[] {
    return this.trials.filter(t => t.customerId === customerId);
  }
  public getAlterationsForCustomer(customerId: string): Alteration[] {
    return this.alterations.filter(a => a.customerId === customerId);
  }
  public getAllTrials(): Trial[] {
    return this.trials;
  }

  public addTrial(trial: Omit<Trial, "id">): Trial {
    const id = `trial_${Date.now()}`;
    const newTrial: Trial = { ...trial, id };
    this.trials.push(newTrial);
    this.saveKeyLocal("trials", this.trials);
    this.pushSingleToSupabase("trials", newTrial);

    if (trial.alterationRequired) {
      this.updateOrderStatus(trial.orderId, "Trial Scheduled", trial.conductedBy);
    } else {
      this.updateOrderStatus(trial.orderId, "Ready", trial.conductedBy);
    }
    return newTrial;
  }

  public addAlteration(alt: Omit<Alteration, "id">): Alteration {
    const id = `alt_${Date.now()}`;
    const newAlt: Alteration = { ...alt, id };
    this.alterations.push(newAlt);
    this.saveKeyLocal("alterations", this.alterations);
    this.pushSingleToSupabase("alterations", newAlt);

    this.updateOrderStatus(alt.orderId, "Stitching", alt.handledBy);
    return newAlt;
  }

  // --- INVOICES ---
  public getInvoices(): Invoice[] {
    return [...this.invoices].sort((a, b) => new Date(b.invoiceDate).getTime() - new Date(a.invoiceDate).getTime());
  }
  public getInvoicesForCustomer(customerId: string): Invoice[] {
    return this.invoices.filter(i => i.customerId === customerId);
  }
  public getInvoiceById(id: string): Invoice | undefined {
    return this.invoices.find(i => i.id === id);
  }
  public getInvoiceByOrderId(orderId: string): Invoice | undefined {
    return this.invoices.find(i => i.linkedOrderId === orderId);
  }

  public addInvoice(inv: Omit<Invoice, "id" | "invoiceNumber" | "invoiceDate" | "balanceDue" | "paymentStatus" | "payments"> & { advancePaid: number; paymentMode?: string }): Invoice {
    // Strict Validation
    if (inv.grandTotal === undefined || inv.grandTotal === null || isNaN(inv.grandTotal)) {
      throw new Error("Strict Validation Error: grandTotal (totalAmount) is missing or undefined.");
    }
    if (inv.grandTotal < 0) {
      throw new Error("Strict Validation Error: grandTotal (totalAmount) cannot be negative.");
    }
    const finalAdvance = inv.advancePaid !== undefined && inv.advancePaid !== null && !isNaN(inv.advancePaid) ? inv.advancePaid : 0;
    if (finalAdvance < 0) {
      throw new Error("Strict Validation Error: advancePaid (paidDeposit) cannot be negative.");
    }
    if (finalAdvance > inv.grandTotal) {
      throw new Error("Strict Validation Error: advancePaid (paidDeposit) cannot exceed grandTotal (totalAmount).");
    }

    const id = `inv_${Date.now()}`;
    const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
    const invoiceDate = new Date().toISOString();
    const balanceDue = Math.max(0, inv.grandTotal - finalAdvance);
    
    let paymentStatus: PaymentStatus = "Unpaid";
    if (balanceDue === 0) {
      paymentStatus = "Paid";
    } else if (finalAdvance > 0 && balanceDue > 0) {
      paymentStatus = "Partially Paid";
    } else if (finalAdvance === 0 && balanceDue > 0) {
      paymentStatus = "Unpaid";
    }

    const payments: PaymentEntry[] = [];
    if (finalAdvance > 0) {
      payments.push({
        amount: finalAdvance,
        date: invoiceDate,
        mode: (inv.paymentMode as any) || "Cash",
        recordedBy: "Billing Counter"
      });
    }

    const newInvoice: Invoice = {
      id,
      customerId: inv.customerId,
      invoiceNumber,
      invoiceDate,
      linkedOrderId: inv.linkedOrderId,
      lineItems: inv.lineItems,
      subtotal: inv.subtotal,
      discount: inv.discount,
      taxPercent: inv.taxPercent,
      taxAmount: inv.taxAmount,
      grandTotal: inv.grandTotal,
      advancePaid: finalAdvance,
      balanceDue,
      paymentStatus,
      payments
    };

    this.invoices.push(newInvoice);
    this.saveKeyLocal("invoices", this.invoices);
    this.pushSingleToSupabase("invoices", newInvoice);

    if (inv.linkedOrderId) {
      this.updateOrder(inv.linkedOrderId, { linkedInvoiceId: id });
    }

    this.recalculateAllBalances();
    this.runPreferenceLearning(inv.customerId);
    return newInvoice;
  }

  public recordPayment(invoiceId: string, amount: number, mode: PaymentEntry["mode"], recordedBy: string, dateStr?: string) {
    const target = this.invoices.find(i => i.id === invoiceId);
    if (!target) {
      throw new Error("That bill could not be found. Refresh the page and try again.");
    }

    const payment = parseFloat(String(amount));
    if (isNaN(payment) || payment <= 0) {
      throw new Error("Enter a payment amount greater than zero.");
    }

    const outstanding = Math.max(0, (parseFloat(String(target.grandTotal)) || 0) - (parseFloat(String(target.advancePaid)) || 0));
    if (payment > outstanding + 0.5) {
      throw new Error(
        `This payment of ₹${payment.toLocaleString("en-IN")} is more than the ₹${outstanding.toLocaleString("en-IN")} still due on bill ${target.invoiceNumber}.`
      );
    }

    this.invoices = this.invoices.map(inv => {
      if (inv.id === invoiceId) {
        const currentAdvance = parseFloat(String(inv.advancePaid)) || 0;
        const currentGrand = parseFloat(String(inv.grandTotal)) || 0;
        const newAdvancePaid = currentAdvance + amount;
        const newBalanceDue = Math.max(0, currentGrand - newAdvancePaid);
        const newPaymentStatus = newBalanceDue <= 0 ? "Paid" : "Partially Paid";

        const newPayment: PaymentEntry = {
          amount,
          date: dateStr || new Date().toISOString(),
          mode,
          recordedBy
        };

        return {
          ...inv,
          advancePaid: newAdvancePaid,
          balanceDue: newBalanceDue,
          paymentStatus: newPaymentStatus,
          payments: [...inv.payments, newPayment]
        };
      }
      return inv;
    });

    this.saveKeyLocal("invoices", this.invoices);
    const updatedInvoice = this.invoices.find(i => i.id === invoiceId);
    if (updatedInvoice) {
      this.pushSingleToSupabase("invoices", updatedInvoice);
    }

    const invoice = this.invoices.find(i => i.id === invoiceId);
    if (invoice) {
      this.runPreferenceLearning(invoice.customerId);
    }
    this.recalculateAllBalances();
  }

  public addOpeningUdhar(customerId: string, amount: number, notes?: string): Invoice {
    if (amount <= 0) {
      throw new Error("Udhar amount must be greater than 0");
    }
    const description = notes ? `Purana Udhar / Opening Balance (${notes})` : "Purana Udhar / Opening Balance";
    return this.addInvoice({
      customerId,
      linkedOrderId: "UDHAR-OPENING",
      subtotal: amount,
      discount: 0,
      taxPercent: 0,
      taxAmount: 0,
      grandTotal: amount,
      advancePaid: 0,
      paymentMode: "Cash",
      lineItems: [
        {
          description,
          quantity: 1,
          rate: amount,
          amount: amount
        }
      ]
    });
  }

  public payCustomerUdhar(customerId: string, amount: number, mode: PaymentEntry["mode"] = "Cash", recordedBy: string = "Billing Counter") {
    if (amount <= 0) return;
    let remaining = amount;
    const unpaidInvoices = this.invoices
      .filter(inv => inv.customerId === customerId && inv.balanceDue > 0)
      .sort((a, b) => new Date(a.invoiceDate).getTime() - new Date(b.invoiceDate).getTime());

    for (const inv of unpaidInvoices) {
      if (remaining <= 0) break;
      const payForThis = Math.min(remaining, inv.balanceDue);
      this.recordPayment(inv.id, payForThis, mode, recordedBy);
      remaining -= payForThis;
    }
    this.recalculateAllBalances();
  }

  // --- APPOINTMENTS ---
  public getAppointments(): Appointment[] {
    return [...this.appointments].sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());
  }
  public getAppointmentsForCustomer(customerId: string): Appointment[] {
    return this.appointments.filter(a => a.customerId === customerId);
  }
  public addAppointment(appt: Omit<Appointment, "id">): Appointment {
    const id = `appt_${Date.now()}`;
    const newAppt: Appointment = {
      ...appt,
      id
    };
    this.appointments.push(newAppt);
    this.saveKeyLocal("appointments", this.appointments);
    this.pushSingleToSupabase("appointments", newAppt);
    this.syncAppointmentInvoice(newAppt);
    this.runPreferenceLearning(appt.customerId);
    return newAppt;
  }
  public updateAppointment(id: string, updated: Partial<Appointment>) {
    this.appointments = this.appointments.map(a => {
      if (a.id === id) {
        return { ...a, ...updated };
      }
      return a;
    });
    this.saveKeyLocal("appointments", this.appointments);
    const updatedAppt = this.appointments.find(a => a.id === id);
    if (updatedAppt) {
      this.pushSingleToSupabase("appointments", updatedAppt);
      this.syncAppointmentInvoice(updatedAppt);
    }
  }
  public updateAppointmentStatus(id: string, status: Appointment["status"]) {
    this.appointments = this.appointments.map(a => a.id === id ? { ...a, status } : a);
    this.saveKeyLocal("appointments", this.appointments);
    const updatedAppt = this.appointments.find(a => a.id === id);
    if (updatedAppt) {
      this.pushSingleToSupabase("appointments", updatedAppt);
      this.syncAppointmentInvoice(updatedAppt);
    }
  }

  public syncAppointmentInvoice(appt: Appointment) {
    if (appt.status === "Completed") {
      const trialCharge = parseFloat(String(appt.trialCharge || 0)) || 0;
      if (trialCharge <= 0) return; // Only create invoices for trials with positive charges

      const existingInvoice = this.invoices.find(i => i.linkedAppointmentId === appt.id);
      const paymentStatus = appt.paymentStatus || "Unpaid";
      const advancePaid = paymentStatus === "Paid" ? trialCharge : 0;
      const balanceDue = Math.max(0, trialCharge - advancePaid);

      const lineItems = [
        {
          description: `Trial/Fitting: ${appt.appointmentType || "Trial Fitting"}`,
          quantity: 1,
          rate: trialCharge,
          amount: trialCharge
        }
      ];

      if (existingInvoice) {
        this.invoices = this.invoices.map(inv => {
          if (inv.id === existingInvoice.id) {
            const payments = paymentStatus === "Paid" && inv.payments.length === 0
              ? [{ amount: trialCharge, date: new Date().toISOString(), mode: "Cash" as const, recordedBy: "Fitting Center" }]
              : inv.payments;

            return {
              ...inv,
              customerId: appt.customerId,
              linkedOrderId: appt.orderId || "",
              lineItems,
              subtotal: trialCharge,
              grandTotal: trialCharge,
              advancePaid,
              balanceDue,
              paymentStatus: paymentStatus as PaymentStatus,
              payments
            };
          }
          return inv;
        });
        this.saveKeyLocal("invoices", this.invoices);
        const updated = this.invoices.find(i => i.id === existingInvoice.id);
        if (updated) {
          this.pushSingleToSupabase("invoices", updated);
        }
      } else {
        const id = `inv_${Date.now()}`;
        const invoiceNumber = `INV-FIT-${Date.now().toString().slice(-6)}`;
        const invoiceDate = new Date().toISOString();
        const payments = paymentStatus === "Paid"
          ? [{ amount: trialCharge, date: invoiceDate, mode: "Cash" as const, recordedBy: "Fitting Center" }]
          : [];

        const newInvoice: Invoice = {
          id,
          customerId: appt.customerId,
          invoiceNumber,
          invoiceDate,
          linkedOrderId: appt.orderId || "",
          lineItems,
          subtotal: trialCharge,
          discount: 0,
          taxPercent: 0,
          taxAmount: 0,
          grandTotal: trialCharge,
          advancePaid,
          balanceDue,
          paymentStatus: paymentStatus as PaymentStatus,
          payments,
          linkedAppointmentId: appt.id
        };

        this.invoices.push(newInvoice);
        this.saveKeyLocal("invoices", this.invoices);
        this.pushSingleToSupabase("invoices", newInvoice);
        appt.linkedInvoiceId = id;
      }
    } else {
      // Appointment moved away from "Completed". Drop its auto-generated invoice only when
      // nothing has been received against it — deleting a receipted trial invoice would
      // silently remove money from the books.
      const existingInvoice = this.invoices.find(i => i.linkedAppointmentId === appt.id);
      if (existingInvoice) {
        const received = (existingInvoice.payments || [])
          .reduce((sum, p) => sum + (parseFloat(String(p.amount)) || 0), 0);

        if (received > 0) {
          console.warn(
            `[Billing] Kept invoice ${existingInvoice.invoiceNumber} for appointment ${appt.id}: ₹${received} already received.`
          );
        } else {
          this.invoices = this.invoices.filter(i => i.id !== existingInvoice.id);
          this.saveKeyLocal("invoices", this.invoices);
          this.deleteFromSupabase("invoices", existingInvoice.id);
        }
      }
    }
    this.recalculateAllBalances();
  }

  // --- EXPENSES ---
  public getExpenses(): Expense[] {
    return [...this.expenses].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }
  public addExpense(exp: Omit<Expense, "id">): Expense {
    const id = `exp_${Date.now()}`;
    const newExpense: Expense = {
      ...exp,
      id
    };
    this.expenses.push(newExpense);
    this.saveKeyLocal("expenses", this.expenses);
    this.pushSingleToSupabase("expenses", newExpense);
    return newExpense;
  }
  public deleteExpense(id: string) {
    this.expenses = this.expenses.filter(e => e.id !== id);
    this.saveKeyLocal("expenses", this.expenses);
    this.deleteFromSupabase("expenses", id);
  }
  public deleteInvoice(id: string) {
    this.invoices = this.invoices.filter(i => i.id !== id);
    this.saveKeyLocal("invoices", this.invoices);
    this.recalculateAllBalances();
    this.deleteFromSupabase("invoices", id);
  }
  public deleteAppointment(id: string) {
    const linkedInvoice = this.invoices.find(i => i.linkedAppointmentId === id);
    if (linkedInvoice) {
      this.invoices = this.invoices.filter(i => i.id !== linkedInvoice.id);
      this.saveKeyLocal("invoices", this.invoices);
      this.deleteFromSupabase("invoices", linkedInvoice.id);
    }
    this.appointments = this.appointments.filter(a => a.id !== id);
    this.saveKeyLocal("appointments", this.appointments);
    this.deleteFromSupabase("appointments", id);
    this.recalculateAllBalances();
  }
  public clearAllAppointments() {
    if (isSupabaseConfigured) {
      this.appointments.forEach(a => this.deleteFromSupabase("appointments", a.id));
    }
    this.appointments = [];
    this.saveKeyLocal("appointments", this.appointments);
  }

  // --- WORKERS ---
  public getWorkers(): Worker[] {
    return this.workers;
  }
  public getActiveWorkers(): Worker[] {
    return this.workers.filter(w => w.active);
  }
  public addWorker(worker: Omit<Worker, "id">): Worker {
    const id = `worker_${Date.now()}`;
    const newWorker: Worker = { ...worker, id };
    this.workers.push(newWorker);
    this.saveKeyLocal("workers", this.workers);
    this.pushSingleToSupabase("workers", newWorker);
    return newWorker;
  }
  public updateWorker(id: string, updated: Partial<Worker>) {
    this.workers = this.workers.map(w => w.id === id ? { ...w, ...updated } : w);
    this.saveKeyLocal("workers", this.workers);
    const updatedWorker = this.workers.find(w => w.id === id);
    if (updatedWorker) {
      this.pushSingleToSupabase("workers", updatedWorker);
    }
  }
  public getWorkerDeletionStatus(id: string): { allowed: boolean; reason?: string } {
    const worker = this.workers.find(w => w.id === id);
    if (!worker) {
      return { allowed: true };
    }
    
    // Check outstanding advances
    const outstandingAdvances = this.advances.filter(a => a.workerId === id && !a.repaid);
    const outstandingSum = outstandingAdvances.reduce((sum, a) => sum + a.amount, 0);
    if (outstandingSum > 0) {
      return {
        allowed: false,
        reason: `This worker (${worker.name}) has an outstanding cash advance of ₹${outstandingSum} which has not been repaid or deducted. You must settle this advance before deleting the worker.`
      };
    }

    // Check historical salary payouts or repaid advances
    const hasSalaries = this.salaries.some(s => s.workerId === id);
    const hasRepaidAdvances = this.advances.some(a => a.workerId === id && a.repaid);
    
    if (hasSalaries || hasRepaidAdvances) {
      return {
        allowed: false,
        reason: `This worker (${worker.name}) has historical payroll transaction records (salaries paid or settled advances). Deleting them would corrupt historical accounting ledger reports. Please set their status to "Inactive" (Deactivate) instead of deleting them. This preserves your accounting audit trail while removing them from active lists.`
      };
    }

    return { allowed: true };
  }

  public deleteWorker(id: string) {
    const status = this.getWorkerDeletionStatus(id);
    if (!status.allowed) {
      throw new Error(status.reason);
    }
    
    // Clean up related attendance records (since it's allowed and safe)
    this.attendance = this.attendance.filter(r => r.workerId !== id);
    this.saveKeyLocal("attendance", this.attendance);
    if (isSupabaseConfigured) {
      // Deleting related attendance records from Supabase in the background
      supabase.from("attendance").delete().eq("workerId", id).then(({ error }) => {
        if (error) console.error("Error deleting worker attendance:", error);
      });
    }

    this.workers = this.workers.filter(w => w.id !== id);
    this.saveKeyLocal("workers", this.workers);
    this.deleteFromSupabase("workers", id);
  }

  public clearAllWorkers() {
    if (isSupabaseConfigured) {
      this.workers.forEach(w => this.deleteFromSupabase("workers", w.id));
      this.attendance.forEach(a => this.deleteFromSupabase("attendance", a.id));
      this.advances.forEach(adv => this.deleteFromSupabase("advances", adv.id));
      this.salaries.forEach(sal => this.deleteFromSupabase("salaries", sal.id));
    }
    this.workers = [];
    this.attendance = [];
    this.advances = [];
    this.salaries = [];
    this.saveKeyLocal("workers", this.workers);
    this.saveKeyLocal("attendance", this.attendance);
    this.saveKeyLocal("advances", this.advances);
    this.saveKeyLocal("salaries", this.salaries);
    this.triggerSyncChange();
  }

  // --- ATTENDANCE ---
  public getAttendance(month?: string): AttendanceRecord[] {
    if (month) {
      return this.attendance.filter(r => r.date.startsWith(month));
    }
    return this.attendance;
  }
  public deleteAttendance(id: string) {
    this.attendance = this.attendance.filter(r => r.id !== id);
    this.saveKeyLocal("attendance", this.attendance);
    this.deleteFromSupabase("attendance", id);
  }
  public updateAttendance(id: string, updated: Partial<AttendanceRecord>) {
    this.attendance = this.attendance.map(r => r.id === id ? { ...r, ...updated } : r);
    this.saveKeyLocal("attendance", this.attendance);
    const record = this.attendance.find(r => r.id === id);
    if (record) {
      this.pushSingleToSupabase("attendance", record);
    }
  }
  public getWorkerAttendanceForMonth(workerId: string, month: string): AttendanceRecord[] {
    return this.attendance.filter(r => r.workerId === workerId && r.date.startsWith(month));
  }
  public saveAttendance(record: Omit<AttendanceRecord, "id">): AttendanceRecord {
    const existing = this.attendance.find(r => r.workerId === record.workerId && r.date === record.date);
    let newRecord: AttendanceRecord;

    if (existing) {
      this.attendance = this.attendance.map(r => r.id === existing.id ? { ...r, status: record.status, notes: record.notes } : r);
      newRecord = { ...existing, status: record.status, notes: record.notes };
    } else {
      const id = attendanceRecordId(record.workerId, record.date);
      newRecord = { ...record, id };
      this.attendance.push(newRecord);
    }

    this.saveKeyLocal("attendance", this.attendance);
    this.pushSingleToSupabase("attendance", newRecord);
    return newRecord;
  }
  public async saveBulkAttendance(records: Omit<AttendanceRecord, "id">[]): Promise<{ success: boolean; error?: string }> {
    const updatedRecords: AttendanceRecord[] = [];
    records.forEach(rec => {
      const existing = this.attendance.find(r => r.workerId === rec.workerId && r.date === rec.date);
      if (existing) {
        const merged = { ...existing, status: rec.status, notes: rec.notes };
        this.attendance = this.attendance.map(r => r.id === existing.id ? merged : r);
        updatedRecords.push(merged);
      } else {
        const id = attendanceRecordId(rec.workerId, rec.date);
        const nRecord = { ...rec, id };
        this.attendance.push(nRecord);
        updatedRecords.push(nRecord);
      }
    });

    this.saveKeyLocal("attendance", this.attendance);
    this.triggerSyncChange();

    if (!isSupabaseConfigured || updatedRecords.length === 0) {
      return { success: true };
    }

    try {
      // Push each record through the unified supabaseQueue to prevent race conditions
      for (const rec of updatedRecords) {
        this.pushSingleToSupabase("attendance", rec);
      }
      await this.supabaseQueue;
      return { success: true };
    } catch (err: any) {
      console.error("Error saving bulk attendance to Supabase:", err);
      return { success: false, error: err.message || "Failed to persist to cloud database." };
    }
  }

  public checkInWorker(workerId: string, workerName: string, dateStr?: string): AttendanceRecord {
    const todayStr = dateStr || new Date().toISOString().split("T")[0];
    const nowIso = new Date().toISOString();
    
    const existing = this.attendance.find(r => r.workerId === workerId && r.date === todayStr);
    
    if (existing && existing.checkInTime) {
      throw new Error("Worker already checked in for today!");
    }

    let newRecord: AttendanceRecord;
    if (existing) {
      newRecord = {
        ...existing,
        status: "Checked In",
        workerName,
        checkInTime: nowIso,
        updatedAt: nowIso
      };
      this.attendance = this.attendance.map(r => r.id === existing.id ? newRecord : r);
    } else {
      const id = attendanceRecordId(workerId, todayStr);
      newRecord = {
        id,
        workerId,
        workerName,
        date: todayStr,
        status: "Checked In",
        checkInTime: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso
      };
      this.attendance.push(newRecord);
    }

    this.saveKeyLocal("attendance", this.attendance);
    this.pushSingleToSupabase("attendance", newRecord);
    return newRecord;
  }

  public checkOutWorker(workerId: string, dateStr?: string): AttendanceRecord {
    const todayStr = dateStr || new Date().toISOString().split("T")[0];
    const nowIso = new Date().toISOString();
    
    const existing = this.attendance.find(r => r.workerId === workerId && r.date === todayStr);
    
    if (!existing || !existing.checkInTime) {
      throw new Error("Worker must check in before checking out!");
    }

    if (existing.checkOutTime) {
      throw new Error("Worker already checked out for today!");
    }

    const diffMs = new Date(nowIso).getTime() - new Date(existing.checkInTime).getTime();
    const totalHours = Number((diffMs / (1000 * 60 * 60)).toFixed(2));

    const newRecord: AttendanceRecord = {
      ...existing,
      status: "Checked Out",
      checkOutTime: nowIso,
      totalHours,
      updatedAt: nowIso
    };

    this.attendance = this.attendance.map(r => r.id === existing.id ? newRecord : r);
    this.saveKeyLocal("attendance", this.attendance);
    this.pushSingleToSupabase("attendance", newRecord);
    return newRecord;
  }

  // --- ADVANCES ---
  public getAdvances(workerId?: string): WorkerAdvance[] {
    if (workerId) {
      return this.advances.filter(a => a.workerId === workerId);
    }
    return this.advances;
  }
  public getUnrepaidAdvances(workerId: string): WorkerAdvance[] {
    return this.advances.filter(a => a.workerId === workerId && !a.repaid);
  }
  public addAdvance(advance: Omit<WorkerAdvance, "id" | "repaid">): WorkerAdvance {
    const id = `adv_${Date.now()}`;
    const newAdvance: WorkerAdvance = { ...advance, id, repaid: false };
    this.advances.push(newAdvance);
    this.saveKeyLocal("advances", this.advances);
    this.pushSingleToSupabase("advances", newAdvance);
    return newAdvance;
  }
  public updateAdvance(id: string, updated: Partial<WorkerAdvance>) {
    this.advances = this.advances.map(a => a.id === id ? { ...a, ...updated } : a);
    this.saveKeyLocal("advances", this.advances);
    const updatedAdvance = this.advances.find(a => a.id === id);
    if (updatedAdvance) {
      this.pushSingleToSupabase("advances", updatedAdvance);
    }
  }
  public deleteAdvance(id: string) {
    this.advances = this.advances.filter(a => a.id !== id);
    this.saveKeyLocal("advances", this.advances);
    this.deleteFromSupabase("advances", id);
  }
  public repayAdvance(id: string, repayDate: string) {
    this.advances = this.advances.map(a => a.id === id ? { ...a, repaid: true, repayDate } : a);
    this.saveKeyLocal("advances", this.advances);
    const updatedAdvance = this.advances.find(a => a.id === id);
    if (updatedAdvance) {
      this.pushSingleToSupabase("advances", updatedAdvance);
    }
  }

  // --- SALARIES ---
  public getSalaryPayouts(month?: string): WorkerSalaryPayout[] {
    if (month) {
      return this.salaries.filter(s => s.month === month);
    }
    return this.salaries;
  }
  public getWorkerSalaryPayouts(workerId: string): WorkerSalaryPayout[] {
    return this.salaries.filter(s => s.workerId === workerId);
  }
  public updateSalaryPayout(id: string, updated: Partial<WorkerSalaryPayout>) {
    this.salaries = this.salaries.map(s => s.id === id ? { ...s, ...updated } : s);
    this.saveKeyLocal("salaries", this.salaries);
    const updatedSalary = this.salaries.find(s => s.id === id);
    if (updatedSalary) {
      this.pushSingleToSupabase("salaries", updatedSalary);
    }
  }
  public addSalaryPayout(payout: Omit<WorkerSalaryPayout, "id">): WorkerSalaryPayout {
    const id = `sal_${Date.now()}`;
    const newPayout: WorkerSalaryPayout = { ...payout, id };
    this.salaries.push(newPayout);
    this.saveKeyLocal("salaries", this.salaries);
    this.pushSingleToSupabase("salaries", newPayout);

    // Deduct advance payouts recursively
    if (payout.advanceDeductions > 0) {
      let remainingDeduction = payout.advanceDeductions;
      this.advances = this.advances.map(adv => {
        if (adv.workerId === payout.workerId && !adv.repaid && remainingDeduction > 0) {
          if (adv.amount <= remainingDeduction) {
            remainingDeduction -= adv.amount;
            return { ...adv, repaid: true, repayDate: payout.paymentDate, notes: `${adv.notes || ""} (Repaid fully via deduction in salary ${payout.month})` };
          } else {
            const partialDeducted = remainingDeduction;
            remainingDeduction = 0;
            return { 
              ...adv, 
              amount: adv.amount - partialDeducted, 
              notes: `${adv.notes || ""} (Partially deducted ₹${partialDeducted} in ${payout.month})`
            };
          }
        }
        return adv;
      });
      this.saveKeyLocal("advances", this.advances);
      // Update the modified advances in Supabase
      this.advances.forEach(adv => {
        if (adv.workerId === payout.workerId) {
          this.pushSingleToSupabase("advances", adv);
        }
      });
    }

    // Record it as an Expense
    const worker = this.workers.find(w => w.id === payout.workerId);
    this.addExpense({
      category: "Tailoring Wages",
      amount: payout.netPaid,
      date: new Date(payout.paymentDate).toISOString(),
      notes: `Salary Payout to ${worker ? worker.name : "Worker"} for ${payout.month}. Net Paid: ₹${payout.netPaid}`
    });

    return newPayout;
  }

  public deleteSalaryPayout(id: string) {
    const payout = this.salaries.find(s => s.id === id);
    if (!payout) return;

    // 1. Remove the payout from this.salaries
    this.salaries = this.salaries.filter(s => s.id !== id);
    this.saveKeyLocal("salaries", this.salaries);
    this.deleteFromSupabase("salaries", id);

    // 2. Restore any advances that were deducted as part of this payout
    if (payout.advanceDeductions > 0) {
      const matchFull = `(Repaid fully via deduction in salary ${payout.month})`;
      const matchPartialPrefix = `(Partially deducted ₹`;
      const matchPartialSuffix = ` in ${payout.month})`;

      this.advances = this.advances.map(adv => {
        if (adv.workerId === payout.workerId) {
          let updatedNotes = adv.notes || "";
          let updatedRepaid = adv.repaid;
          let updatedAmount = adv.amount;
          let updatedRepayDate = adv.repayDate;

          if (updatedNotes.includes(matchFull)) {
            updatedNotes = updatedNotes.replace(matchFull, "").trim();
            updatedRepaid = false;
            updatedRepayDate = "";
          } else if (updatedNotes.includes(matchPartialPrefix) && updatedNotes.includes(matchPartialSuffix)) {
            const idxStart = updatedNotes.indexOf(matchPartialPrefix) + matchPartialPrefix.length;
            const idxEnd = updatedNotes.indexOf(matchPartialSuffix, idxStart);
            if (idxEnd > idxStart) {
              const amtStr = updatedNotes.substring(idxStart, idxEnd);
              const amt = parseFloat(amtStr);
              if (!isNaN(amt)) {
                updatedAmount += amt;
                const fullPartialString = matchPartialPrefix + amtStr + matchPartialSuffix;
                updatedNotes = updatedNotes.replace(fullPartialString, "").trim();
                updatedRepaid = false;
              }
            }
          }

          return {
            ...adv,
            amount: updatedAmount,
            repaid: updatedRepaid,
            repayDate: updatedRepayDate,
            notes: updatedNotes
          };
        }
        return adv;
      });

      this.saveKeyLocal("advances", this.advances);
      // Sync restored advances to Supabase
      this.advances.forEach(adv => {
        if (adv.workerId === payout.workerId) {
          this.pushSingleToSupabase("advances", adv);
        }
      });
    }

    // 3. Remove the corresponding expense if it exists
    const worker = this.workers.find(w => w.id === payout.workerId);
    const workerName = worker ? worker.name : "Worker";
    const notesToMatch = `Salary Payout to ${workerName} for ${payout.month}`;
    const expToDelete = this.expenses.find(e => e.category === "Tailoring Wages" && e.notes?.includes(notesToMatch));
    if (expToDelete) {
      this.expenses = this.expenses.filter(e => e.id !== expToDelete.id);
      this.saveKeyLocal("expenses", this.expenses);
      this.deleteFromSupabase("expenses", expToDelete.id);
    }
  }

  // --- PREFERENCE LEARNING ENGINE ---
  public runPreferenceLearning(customerId: string) {
    const customer = this.getCustomerById(customerId);
    if (!customer) return;

    const customerOrders = this.orders.filter(o => o.customerId === customerId);
    const customerInvoices = this.invoices.filter(i => i.customerId === customerId);
    const customerAppts = this.appointments.filter(a => a.customerId === customerId);

    const preferenceTags = new Set<string>();
    const preferredFabricBrands = new Set<string>(customer.preferredFabricBrands);

    // Learn from fabric choices
    customerOrders.forEach(ord => {
      if (ord.fabricDetails) {
        const text = ord.fabricDetails.toLowerCase();
        if (text.includes("raymond")) preferredFabricBrands.add("Raymond");
        if (text.includes("siyaram")) preferredFabricBrands.add("Siyaram's");
        if (text.includes("reid & taylor") || text.includes("reid")) preferredFabricBrands.add("Reid & Taylor");
        if (text.includes("armani")) preferredFabricBrands.add("Armani");
        if (text.includes("linen")) preferenceTags.add("Linen Lover");
        if (text.includes("wool")) preferenceTags.add("Wool Blend Preferer");
      }
    });

    // Learn from statuses & timing
    if (customerOrders.length >= 3) {
      preferenceTags.add("VIP Customer");
    }
    if (customerInvoices.some(inv => inv.paymentStatus === "Paid" && inv.balanceDue === 0)) {
      preferenceTags.add("Fast Payer");
    }

    // Preserve first-time/existing logic
    if (customerOrders.length > 0) {
      preferenceTags.delete("First Time Customer");
      preferenceTags.add("Regular Client");
    }

    // Update customer tags locally and in DB
    this.customers = this.customers.map(c => {
      if (c.id === customerId) {
        return {
          ...c,
          preferredFabricBrands: Array.from(preferredFabricBrands),
          preferenceTags: Array.from(preferenceTags)
        };
      }
      return c;
    });

    this.saveKeyLocal("customers", this.customers);
  }
}

// Singleton database handle
export const db = new TailorDatabase();
export default db;
