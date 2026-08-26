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
}

const BACKUP_FORMAT_VERSION = 1;
const APP_SCHEMA_VERSION = '2.0.0';
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
}): RegencyBackupPayload {
  // Count total garments across all orders
  const garmentsCount = data.orders.reduce((acc, order) => {
    return acc + (order.items ? order.items.reduce((sum, it) => sum + (it.quantity || 1), 0) : 0);
  }, 0);

  // Sanitize profile to ensure no secret tokens or credentials
  const safeProfile: ShowroomProfile = {
    name: data.profile.name || 'Regency Tailors',
    subtitle: data.profile.subtitle || 'Master Bespoke Tailoring & Royal Suiting',
    city: data.profile.city || 'London / Mumbai',
    address: data.profile.address || '42 Savile Row / High Street Commercial Hub',
    phone: data.profile.phone || '+91 98765 43210',
    email: data.profile.email || 'concierge@regencytailors.com',
    gstin: data.profile.gstin || '27AABCR1234F1Z8',
    activeUser: data.profile.activeUser || 'Master Raymond',
    activeRole: data.profile.activeRole || 'Admin'
  };

  const metadata: BackupMetadata = {
    backupVersion: BACKUP_FORMAT_VERSION,
    application: APP_NAME,
    appVersion: '1.0.0',
    schemaVersion: APP_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    exportSource: 'Regency Tailors Management Suite',
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
    profile: safeProfile
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

  const payload: RegencyBackupPayload = {
    metadata: {
      backupVersion: metadata?.backupVersion || (isLegacy ? 0 : 1),
      application: metadata?.application || APP_NAME,
      appVersion: metadata?.appVersion || '1.0.0',
      schemaVersion: metadata?.schemaVersion || APP_SCHEMA_VERSION,
      createdAt: metadata?.createdAt || parsed.exportDate || new Date().toISOString(),
      exportSource: metadata?.exportSource || 'Regency Tailors Management Suite',
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
    profile: parsed.profile
  };

  return {
    isValid: true,
    payload,
    stats,
    createdAt: payload.metadata.createdAt,
    backupVersion: payload.metadata.backupVersion,
    fileName,
    fileSizeBytes
  };
}
