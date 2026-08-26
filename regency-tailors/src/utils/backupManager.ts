import {
  Customer,
  Order,
  MeasurementRecord,
  Fitting,
  Worker,
  Invoice,
  Expense,
  TrashItem,
  ShowroomProfile
} from '../types';

export interface BackupMetadata {
  backupVersion: number;
  application: string;
  appVersion: string;
  schemaVersion: string;
  createdAt: string;
  exportSource: string;
  /** Highest order number ever issued. Restored so retired numbers stay retired. */
  orderSequence?: number;
  /** 'supabase' for files exported from the production database. */
  exportedFrom?: 'supabase' | 'browser-storage';
  stats: {
    customersCount: number;
    ordersCount: number;
    garmentsCount: number;
    measurementsCount: number;
    fittingsCount: number;
    workersCount: number;
    invoicesCount: number;
    expensesCount: number;
    trashCount: number;
  };
}

export interface RegencyBackupPayload {
  metadata: BackupMetadata;
  customers: Customer[];
  orders: Order[];
  measurements: MeasurementRecord[];
  fittings: Fitting[];
  workers: Worker[];
  invoices: Invoice[];
  expenses: Expense[];
  trash: TrashItem[];
  profile?: ShowroomProfile;
  /**
   * Exact Postgres row payload, present in files exported from the Supabase
   * database (backupVersion 2). Restoring this reproduces the database
   * verbatim; the collections above stay for readability and so that a v1
   * file from the browser-storage era still imports.
   */
  database?: Record<string, unknown>;
}

/** Relationship problems found in a backup. Reported, never silently ignored. */
export interface BackupIntegrityReport {
  orphanOrders: string[];
  orphanMeasurements: string[];
  orphanInvoices: string[];
  duplicateOrderIds: string[];
  repairedOrders: number;
}

export interface BackupValidationResult {
  isValid: boolean;
  error?: string;
  payload?: RegencyBackupPayload;
  stats?: BackupMetadata['stats'];
  createdAt?: string;
  backupVersion?: number;
  fileName?: string;
  fileSizeBytes?: number;
  integrity?: BackupIntegrityReport;
}

/** Refuse absurdly large files rather than freezing the browser tab. */
export const MAX_BACKUP_BYTES = 64 * 1024 * 1024;

const BACKUP_FORMAT_VERSION = 2;
const APP_SCHEMA_VERSION = '3.0.0';
const APP_NAME = 'Regency Tailors';

/**
 * Generate a complete, secure .regency.backup file snapshot
 */
export function buildBackupSnapshot(data: {
  customers: Customer[];
  orders: Order[];
  measurements: MeasurementRecord[];
  fittings: Fitting[];
  workers: Worker[];
  invoices: Invoice[];
  expenses: Expense[];
  trash: TrashItem[];
  profile: ShowroomProfile;
  orderSequence?: number;
  database?: Record<string, unknown>;
}): RegencyBackupPayload {
  // Count total garments across all orders
  const garmentsCount = data.orders.reduce((acc, order) => {
    return acc + (order.items ? order.items.reduce((sum, it) => sum + (it.quantity || 1), 0) : 0);
  }, 0);

  // Sanitize profile to ensure no secret tokens or credentials
  // Carried through verbatim. Earlier builds substituted invented showroom
  // details (a London address, a placeholder GSTIN) whenever a field was
  // blank, which then travelled into every exported backup.
  const safeProfile: ShowroomProfile = {
    name: data.profile.name || '',
    subtitle: data.profile.subtitle || '',
    city: data.profile.city || '',
    address: data.profile.address || '',
    phone: data.profile.phone || '',
    email: data.profile.email || '',
    gstin: data.profile.gstin || '',
    activeUser: data.profile.activeUser || '',
    activeRole: 'Admin'
  };

  const metadata: BackupMetadata = {
    backupVersion: BACKUP_FORMAT_VERSION,
    application: APP_NAME,
    appVersion: '1.0.0',
    schemaVersion: APP_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    exportSource: 'Regency Tailors Management Suite',
    orderSequence: data.orderSequence,
    exportedFrom: data.database ? 'supabase' : 'browser-storage',
    stats: {
      customersCount: Array.isArray(data.customers) ? data.customers.length : 0,
      ordersCount: Array.isArray(data.orders) ? data.orders.length : 0,
      garmentsCount,
      measurementsCount: Array.isArray(data.measurements) ? data.measurements.length : 0,
      fittingsCount: Array.isArray(data.fittings) ? data.fittings.length : 0,
      workersCount: Array.isArray(data.workers) ? data.workers.length : 0,
      invoicesCount: Array.isArray(data.invoices) ? data.invoices.length : 0,
      expensesCount: Array.isArray(data.expenses) ? data.expenses.length : 0,
      trashCount: Array.isArray(data.trash) ? data.trash.length : 0
    }
  };

  return {
    metadata,
    customers: Array.isArray(data.customers) ? data.customers : [],
    orders: Array.isArray(data.orders) ? data.orders : [],
    measurements: Array.isArray(data.measurements) ? data.measurements : [],
    fittings: Array.isArray(data.fittings) ? data.fittings : [],
    workers: Array.isArray(data.workers) ? data.workers : [],
    invoices: Array.isArray(data.invoices) ? data.invoices : [],
    expenses: Array.isArray(data.expenses) ? data.expenses : [],
    trash: Array.isArray(data.trash) ? data.trash : [],
    profile: safeProfile,
    ...(data.database ? { database: data.database } : {})
  };
}

/**
 * Triggers the browser download of the `.regency.backup` file
 */
export function downloadBackupFile(payload: RegencyBackupPayload): string {
  const jsonString = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const dateStr = new Date().toISOString().split('T')[0];
  const fileName = `Regency_Tailors_Backup_${dateStr}.regency.backup`;

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return fileName;
}

/**
 * Safely parse, inspect, and validate an incoming backup file text
 */
export function validateBackupContent(
  rawContent: string,
  fileName = 'backup.regency.backup',
  fileSizeBytes = 0
): BackupValidationResult {
  if (!rawContent || typeof rawContent !== 'string' || rawContent.trim() === '') {
    return {
      isValid: false,
      error: 'The uploaded backup file is completely empty.'
    };
  }

  if (fileSizeBytes > MAX_BACKUP_BYTES || rawContent.length > MAX_BACKUP_BYTES) {
    return {
      isValid: false,
      error: `This file is too large to restore safely (limit ${Math.round(MAX_BACKUP_BYTES / 1024 / 1024)} MB). No data was changed.`
    };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(rawContent);
  } catch (err: any) {
    return {
      isValid: false,
      error: `Corrupted file syntax: Unable to parse JSON. (${err.message || 'Invalid syntax'})`
    };
  }

  if (!parsed || typeof parsed !== 'object') {
    return {
      isValid: false,
      error: 'Invalid backup format. Root structure must be a JSON object.'
    };
  }

  // Check metadata / legacy support
  const metadata = parsed.metadata;
  let isLegacy = false;

  if (!metadata || typeof metadata !== 'object') {
    // Check if it has direct root properties (legacy format)
    if (
      Array.isArray(parsed.customers) ||
      Array.isArray(parsed.orders) ||
      Array.isArray(parsed.measurements)
    ) {
      isLegacy = true;
    } else {
      return {
        isValid: false,
        error: 'Missing required metadata section or valid Regency Tailors collections.'
      };
    }
  } else {
    // Validate Application name if metadata exists
    if (metadata.application && typeof metadata.application === 'string') {
      if (!metadata.application.toLowerCase().includes('regency')) {
        return {
          isValid: false,
          error: `Incompatible backup origin: Expected Regency Tailors, but found "${metadata.application}".`
        };
      }
    }
  }

  // Validate and sanitize data collections
  const sanitizeArray = <T>(arr: any): T[] => {
    if (!Array.isArray(arr)) return [];
    return arr.filter(item => item && typeof item === 'object');
  };

  const customers: Customer[] = sanitizeArray(parsed.customers);
  const orders: Order[] = sanitizeArray(parsed.orders);
  const measurements: MeasurementRecord[] = sanitizeArray(parsed.measurements);
  const fittings: Fitting[] = sanitizeArray(parsed.fittings);
  const workers: Worker[] = sanitizeArray(parsed.workers);
  const invoices: Invoice[] = sanitizeArray(parsed.invoices);
  const expenses: Expense[] = sanitizeArray(parsed.expenses);
  const trash: TrashItem[] = sanitizeArray(parsed.trash);

  // Compute stats
  const garmentsCount = orders.reduce((acc, order) => {
    return acc + (Array.isArray(order.items) ? order.items.reduce((sum, it) => sum + (it.quantity || 1), 0) : 0);
  }, 0);

  const stats = {
    customersCount: customers.length,
    ordersCount: orders.length,
    garmentsCount,
    measurementsCount: measurements.length,
    fittingsCount: fittings.length,
    workersCount: workers.length,
    invoicesCount: invoices.length,
    expensesCount: expenses.length,
    trashCount: trash.length
  };

  const rawPayload: RegencyBackupPayload = {
    metadata: {
      backupVersion: metadata?.backupVersion || (isLegacy ? 0 : 1),
      application: metadata?.application || APP_NAME,
      appVersion: metadata?.appVersion || '1.0.0',
      schemaVersion: metadata?.schemaVersion || APP_SCHEMA_VERSION,
      createdAt: metadata?.createdAt || parsed.exportDate || new Date().toISOString(),
      exportSource: metadata?.exportSource || 'Regency Tailors Management Suite',
      orderSequence: typeof metadata?.orderSequence === 'number' ? metadata.orderSequence : undefined,
      exportedFrom: metadata?.exportedFrom === 'supabase' ? 'supabase' : 'browser-storage',
      stats
    },
    customers,
    orders,
    measurements,
    fittings,
    workers,
    invoices,
    expenses,
    trash,
    profile: parsed.profile && typeof parsed.profile === 'object' ? parsed.profile : undefined,
    database:
      parsed.database && typeof parsed.database === 'object' && !Array.isArray(parsed.database)
        ? (parsed.database as Record<string, unknown>)
        : undefined
  };

  // Coerce every record into a shape the UI can render. A hand-edited or
  // partially-written backup used to load fine and then blank the screen the
  // moment a view touched `order.items.map(...)`.
  const payload = normalizeRestoredPayload(rawPayload);
  const integrity = inspectBackupIntegrity(payload);

  return {
    isValid: true,
    payload,
    stats: payload.metadata.stats,
    createdAt: payload.metadata.createdAt,
    backupVersion: payload.metadata.backupVersion,
    fileName,
    fileSizeBytes,
    integrity
  };
}

const asString = (v: unknown, fallback = ''): string =>
  typeof v === 'string' ? v : v === null || v === undefined ? fallback : String(v);

const asNumber = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : fallback;
};

/**
 * Repairs structurally-broken records so a bad file can never crash the suite.
 * Business values are preserved exactly; only missing/mistyped structure is fixed.
 */
export function normalizeRestoredPayload(payload: RegencyBackupPayload): RegencyBackupPayload {
  const seenOrderIds = new Set<string>();
  let repairedOrders = 0;

  const orders = (payload.orders || [])
    .filter(o => o && typeof o === 'object')
    .map((o: any, idx: number) => {
      const before = JSON.stringify(o.items);
      const items = (Array.isArray(o.items) ? o.items : [])
        .filter((i: any) => i && typeof i === 'object')
        .map((i: any, itemIdx: number) => ({
          ...i,
          id: asString(i.id, `ITEM-${asString(o.id, String(idx))}-${itemIdx + 1}`),
          garmentType: asString(i.garmentType, 'Bespoke Garment'),
          fabricCode: asString(i.fabricCode),
          fabricName: asString(i.fabricName),
          notes: asString(i.notes),
          remarks: asString(i.remarks),
          price: asNumber(i.price),
          quantity: Math.max(1, Math.round(asNumber(i.quantity, 1)))
        }));
      if (before !== JSON.stringify(items)) repairedOrders++;

      const totalAmount = asNumber(o.totalAmount);
      const advancePaid = asNumber(o.advancePaid);

      let id = asString(o.id, asString(o.orderNumber, `RESTORED-${idx + 1}`));
      while (seenOrderIds.has(id)) id = `${id}-DUP${idx + 1}`;
      seenOrderIds.add(id);

      return {
        ...o,
        id,
        orderNumber: asString(o.orderNumber, id),
        customerId: asString(o.customerId),
        customerName: asString(o.customerName, 'Unknown Customer'),
        customerPhone: asString(o.customerPhone),
        items,
        orderDate: asString(o.orderDate),
        trialDate: asString(o.trialDate),
        deliveryDate: asString(o.deliveryDate),
        status: asString(o.status, 'New'),
        totalAmount,
        advancePaid,
        balanceDue: asNumber(o.balanceDue, Math.max(0, totalAmount - advancePaid)),
        urgent: Boolean(o.urgent),
        paymentHistory: Array.isArray(o.paymentHistory) ? o.paymentHistory : [],
        measurementsSnapshot:
          o.measurementsSnapshot && typeof o.measurementsSnapshot === 'object' ? o.measurementsSnapshot : undefined
      } as Order;
    });

  const customers = (payload.customers || [])
    .filter(c => c && typeof c === 'object')
    .map((c: any, idx: number) => ({
      ...c,
      id: asString(c.id, `RESTORED-CUST-${idx + 1}`),
      name: asString(c.name, 'Unknown Customer'),
      phone: asString(c.phone),
      email: asString(c.email),
      address: asString(c.address),
      city: asString(c.city),
      totalOrders: Math.max(0, Math.round(asNumber(c.totalOrders))),
      lifetimeSpend: asNumber(c.lifetimeSpend),
      lastVisitDate: asString(c.lastVisitDate),
      createdDate: asString(c.createdDate)
    })) as Customer[];

  const measurements = (payload.measurements || [])
    .filter(m => m && typeof m === 'object')
    .map((m: any, idx: number) => ({
      ...m,
      id: asString(m.id, `RESTORED-MEAS-${idx + 1}`),
      customerId: asString(m.customerId),
      customerName: asString(m.customerName, 'Unknown Customer'),
      garmentType: asString(m.garmentType, 'Bespoke Garment'),
      selectedGarments: Array.isArray(m.selectedGarments) ? m.selectedGarments.map((g: any) => asString(g)) : undefined,
      garmentRemarks:
        m.garmentRemarks && typeof m.garmentRemarks === 'object' && !Array.isArray(m.garmentRemarks)
          ? m.garmentRemarks
          : undefined,
      lastUpdated: asString(m.lastUpdated)
    })) as MeasurementRecord[];

  const invoices = (payload.invoices || [])
    .filter(i => i && typeof i === 'object')
    .map((i: any, idx: number) => ({
      ...i,
      id: asString(i.id, `RESTORED-INV-${idx + 1}`),
      orderId: asString(i.orderId),
      customerName: asString(i.customerName, 'Unknown Customer'),
      customerPhone: asString(i.customerPhone),
      items: Array.isArray(i.items) ? i.items : [],
      subtotal: asNumber(i.subtotal),
      gstAmount: asNumber(i.gstAmount),
      discount: asNumber(i.discount),
      grandTotal: asNumber(i.grandTotal),
      amountPaid: asNumber(i.amountPaid),
      balanceRemaining: asNumber(i.balanceRemaining)
    })) as Invoice[];

  const fittings = (payload.fittings || []).filter(f => f && typeof f === 'object') as Fitting[];
  const workers = (payload.workers || []).filter(w => w && typeof w === 'object') as Worker[];
  const expenses = (payload.expenses || []).filter(e => e && typeof e === 'object') as Expense[];
  const trash = (payload.trash || []).filter(t => t && typeof t === 'object') as TrashItem[];

  const garmentsCount = orders.reduce(
    (acc, o) => acc + o.items.reduce((sum, it) => sum + (it.quantity || 1), 0),
    0
  );

  return {
    ...payload,
    metadata: {
      ...payload.metadata,
      stats: {
        customersCount: customers.length,
        ordersCount: orders.length,
        garmentsCount,
        measurementsCount: measurements.length,
        fittingsCount: fittings.length,
        workersCount: workers.length,
        invoicesCount: invoices.length,
        expensesCount: expenses.length,
        trashCount: trash.length
      }
    },
    customers,
    orders,
    measurements,
    fittings,
    workers,
    invoices,
    expenses,
    trash,
    __repairedOrders: repairedOrders
  } as RegencyBackupPayload & { __repairedOrders: number };
}

/**
 * Real relationship verification — the import screen previously claimed to
 * "verify relationships" without checking anything.
 */
export function inspectBackupIntegrity(payload: RegencyBackupPayload): BackupIntegrityReport {
  const customerIds = new Set((payload.customers || []).map(c => c.id));
  const orderIds = new Set((payload.orders || []).map(o => o.id));

  const seen = new Set<string>();
  const duplicateOrderIds: string[] = [];
  (payload.orders || []).forEach(o => {
    if (seen.has(o.id)) duplicateOrderIds.push(o.id);
    seen.add(o.id);
  });

  return {
    orphanOrders: (payload.orders || [])
      .filter(o => o.customerId && !customerIds.has(o.customerId))
      .map(o => o.orderNumber || o.id),
    orphanMeasurements: (payload.measurements || [])
      .filter(m => m.customerId && !customerIds.has(m.customerId))
      .map(m => m.id),
    orphanInvoices: (payload.invoices || [])
      .filter(i => i.orderId && !orderIds.has(i.orderId))
      .map(i => i.id),
    duplicateOrderIds,
    repairedOrders: (payload as any).__repairedOrders || 0
  };
}
