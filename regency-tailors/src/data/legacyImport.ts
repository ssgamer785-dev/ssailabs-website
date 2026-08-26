import { Customer, Order, MeasurementRecord, Fitting, Worker, Expense } from '../types';
import { MEASUREMENT_CATEGORIES, num } from './mappers';

/**
 * Converts the browser-storage data model into Postgres rows.
 *
 * Used in two places, and it must behave identically in both:
 *   - the one-time migration of a showroom's existing localStorage database
 *   - importing a v1 `.regency.backup` file produced before Supabase existed
 *
 * Nothing is invented and nothing is dropped silently: records that cannot be
 * mapped are collected in `skipped` and reported to the user.
 */

export interface LegacyDataset {
  customers?: Customer[];
  orders?: Order[];
  measurements?: MeasurementRecord[];
  fittings?: Fitting[];
  workers?: Worker[];
  expenses?: Expense[];
  orderSequence?: number;
}

export interface DbPayload {
  customers: Record<string, unknown>[];
  orders: Record<string, unknown>[];
  order_items: Record<string, unknown>[];
  order_payments: Record<string, unknown>[];
  measurements: Record<string, unknown>[];
  measurement_values: Record<string, unknown>[];
  fittings: Record<string, unknown>[];
  workers: Record<string, unknown>[];
  expenses: Record<string, unknown>[];
  order_sequence: number;
}

export interface ConversionResult {
  payload: DbPayload;
  stats: Record<string, number>;
  skipped: string[];
}

/** RFC 4122 v4 identifier, using the platform CSPRNG where available. */
export function newId(): string {
  const g = globalThis as { crypto?: Crypto };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (g.crypto?.getRandomValues) {
    g.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const isoDate = (value: unknown): string | null => {
  const s = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};

const digits = (phone: unknown): string => String(phone || '').replace(/\D/g, '');

const orderNumberOf = (order: Order): number => {
  const match = String(order.orderNumber || order.id || '').match(/\d+/g);
  if (!match) return 0;
  const n = parseInt(match.join(''), 10);
  return Number.isFinite(n) && n > 0 && n < 1_000_000 ? n : 0;
};

export function convertLegacyDataset(input: LegacyDataset): ConversionResult {
  const skipped: string[] = [];

  /* ---------------------------------------------------------- customers */
  const customerIdByLegacy = new Map<string, string>();
  const customerIdByPhone = new Map<string, string>();
  const customers: Record<string, unknown>[] = [];

  (input.customers || []).forEach(c => {
    if (!c || !String(c.name || '').trim()) {
      skipped.push(`Customer without a name (id ${c?.id ?? 'unknown'})`);
      return;
    }
    const phone = digits(c.phone);
    if (phone.length < 10) {
      skipped.push(`Customer "${c.name}" has no usable phone number and cannot be migrated`);
      return;
    }

    const key = phone.slice(-10);
    // The browser build allowed duplicate rows for one person; the database
    // does not. Fold them together rather than failing the whole migration.
    const existing = customerIdByPhone.get(key);
    if (existing) {
      if (c.id) customerIdByLegacy.set(c.id, existing);
      skipped.push(`Customer "${c.name}" merged into the existing record for ${key}`);
      return;
    }

    const id = newId();
    customerIdByPhone.set(key, id);
    if (c.id) customerIdByLegacy.set(c.id, id);

    customers.push({
      id,
      legacy_id: c.id || null,
      name: String(c.name).trim(),
      phone: String(c.phone).trim(),
      email: c.email || null,
      address: c.address || null,
      city: c.city || null,
      notes: c.notes || null,
      created_at: isoDate(c.createdDate) ? `${isoDate(c.createdDate)}T00:00:00Z` : new Date().toISOString()
    });
  });

  /* ------------------------------------------------------------- orders */
  const orders: Record<string, unknown>[] = [];
  const order_items: Record<string, unknown>[] = [];
  const order_payments: Record<string, unknown>[] = [];
  const usedNumbers = new Set<number>();
  let highestNumber = num(input.orderSequence, 0);

  (input.orders || []).forEach(o => {
    if (!o) return;

    const customerId =
      (o.customerId && customerIdByLegacy.get(o.customerId)) ||
      customerIdByPhone.get(digits(o.customerPhone).slice(-10));

    if (!customerId) {
      skipped.push(`Order ${o.orderNumber || o.id} references a customer that is not in the data and was not migrated`);
      return;
    }

    let number = orderNumberOf(o);
    if (!number || usedNumbers.has(number)) {
      const replacement = Math.max(highestNumber, ...usedNumbers, 0) + 1;
      if (number) skipped.push(`Order ${number} was a duplicate number and was re-issued as ${replacement}`);
      number = replacement;
    }
    usedNumbers.add(number);
    highestNumber = Math.max(highestNumber, number);

    const id = newId();
    const total = num(o.totalAmount);
    const advance = num(o.advancePaid);

    orders.push({
      id,
      legacy_id: o.id || null,
      order_number: number,
      customer_id: customerId,
      customer_name: o.customerName || '',
      customer_phone: o.customerPhone || '',
      customer_email: o.customerEmail || null,
      customer_address: o.customerAddress || null,
      order_date: isoDate(o.orderDate) || new Date().toISOString().slice(0, 10),
      trial_date: isoDate(o.trialDate),
      delivery_date: isoDate(o.deliveryDate) || isoDate(o.orderDate) || new Date().toISOString().slice(0, 10),
      status: o.status || 'New',
      production_status: o.productionStatus || 'New',
      production_notes: o.productionNotes || null,
      priority: o.priority || 'Normal',
      special_instructions: o.specialInstructions || null,
      fitting_notes: o.fittingNotes || null,
      notes: o.notes || null,
      urgent: Boolean(o.urgent),
      subtotal: num(o.subtotal),
      discount: num(o.discount),
      tax_amount: num(o.taxAmount),
      total_amount: total,
      advance_paid: advance,
      payment_method: o.paymentMethod || null,
      measurements_snapshot: o.measurementsSnapshot || null
    });

    (o.items || []).forEach((item, index) => {
      order_items.push({
        id: newId(),
        legacy_id: item.id || null,
        order_id: id,
        position: index + 1,
        garment_type: item.garmentType || 'Bespoke Garment',
        fabric_code: item.fabricCode || null,
        fabric_name: item.fabricName || null,
        notes: item.notes || null,
        style_notes: item.styleNotes || null,
        special_instructions: item.specialInstructions || null,
        remarks: item.remarks || null,
        price: num(item.price),
        quantity: Math.max(1, Math.round(num(item.quantity, 1)))
      });
    });

    // Payments were embedded on the order. Recreate them as rows so the
    // advance becomes a consequence of the payment history, not a loose number.
    const history = Array.isArray(o.paymentHistory) ? o.paymentHistory : [];
    if (history.length > 0) {
      history.forEach(pay => {
        if (num(pay.amount) <= 0) return;
        order_payments.push({
          id: newId(),
          legacy_id: pay.id || null,
          order_id: id,
          paid_on: isoDate(pay.date) || isoDate(o.orderDate) || new Date().toISOString().slice(0, 10),
          amount: num(pay.amount),
          method: pay.method || null,
          note: pay.note || null
        });
      });
    } else if (advance > 0) {
      // An advance with no history still has to be represented, or the money
      // would silently disappear when the trigger recomputes the total.
      order_payments.push({
        id: newId(),
        order_id: id,
        paid_on: isoDate(o.orderDate) || new Date().toISOString().slice(0, 10),
        amount: advance,
        method: o.paymentMethod || 'Migrated opening balance',
        note: 'Carried over from the previous system'
      });
    }
  });

  /* ------------------------------------------------------- measurements */
  const measurements: Record<string, unknown>[] = [];
  const measurement_values: Record<string, unknown>[] = [];
  const measurementByCustomer = new Map<string, string>();

  (input.measurements || []).forEach(m => {
    if (!m) return;
    const customerId =
      (m.customerId && customerIdByLegacy.get(m.customerId)) ||
      customerIdByPhone.get(digits(m.customerPhone).slice(-10));

    if (!customerId) {
      skipped.push(`Measurement profile for "${m.customerName || 'unknown client'}" has no matching customer`);
      return;
    }
    if (measurementByCustomer.has(customerId)) {
      skipped.push(`A second measurement profile for "${m.customerName}" was merged into the first`);
      return;
    }

    const id = newId();
    measurementByCustomer.set(customerId, id);

    measurements.push({
      id,
      legacy_id: m.id || null,
      customer_id: customerId,
      unit: m.unit === 'cm' ? 'cm' : 'inches',
      fit_preference: m.fitPreference || null,
      posture_notes: m.postureNotes || null,
      fitting_notes: m.fittingNotes || null,
      garment_remarks: m.garmentRemarks || null,
      last_updated: isoDate(m.lastUpdated) || new Date().toISOString().slice(0, 10)
    });

    MEASUREMENT_CATEGORIES.forEach(category => {
      const data = (m as unknown as Record<string, unknown>)[category];
      if (data && typeof data === 'object') {
        measurement_values.push({
          id: newId(),
          measurement_id: id,
          garment_category: category,
          data
        });
      }
    });
  });

  /* ------------------------------------------- fittings, workers, expenses */
  const orderIdByLegacy = new Map<string, string>();
  orders.forEach(o => {
    if (o.legacy_id) orderIdByLegacy.set(String(o.legacy_id), String(o.id));
  });

  const fittings: Record<string, unknown>[] = [];
  (input.fittings || []).forEach(f => {
    if (!f) return;
    const orderId = orderIdByLegacy.get(String(f.orderId));
    if (!orderId) {
      skipped.push(`Fitting ${f.id} references an order that was not migrated`);
      return;
    }
    fittings.push({
      id: newId(),
      legacy_id: f.id || null,
      order_id: orderId,
      garment: f.garment || null,
      trial_stage: f.trialStage || 'First Trial',
      scheduled_date: isoDate(f.scheduledDate) || new Date().toISOString().slice(0, 10),
      scheduled_time: f.scheduledTime || null,
      status: f.status || 'Scheduled',
      adjustment_notes: f.adjustmentNotes || null
    });
  });

  const workers: Record<string, unknown>[] = (input.workers || []).filter(Boolean).map(w => ({
    id: newId(),
    legacy_id: w.id || null,
    name: w.name,
    role: w.role || null,
    phone: w.phone || null,
    type: w.type || 'Piece-Rate',
    rate_per_garment: num(w.ratePerGarment),
    monthly_salary: num(w.monthlySalary),
    garments_completed_this_month: Math.round(num(w.garmentsCompletedThisMonth)),
    total_earned: num(w.totalEarned),
    advance_taken: num(w.advanceTaken),
    status: w.status || 'Active'
  }));

  const expenses: Record<string, unknown>[] = (input.expenses || []).filter(Boolean).map(e => ({
    id: newId(),
    legacy_id: e.id || null,
    spent_on: isoDate(e.date) || new Date().toISOString().slice(0, 10),
    category: e.category || 'Misc',
    description: e.description || null,
    amount: num(e.amount),
    paid_to: e.paidTo || null
  }));

  return {
    payload: {
      customers,
      orders,
      order_items,
      order_payments,
      measurements,
      measurement_values,
      fittings,
      workers,
      expenses,
      order_sequence: Math.max(highestNumber, 1)
    },
    stats: {
      customers: customers.length,
      orders: orders.length,
      garments: order_items.length,
      payments: order_payments.length,
      measurements: measurements.length,
      fittings: fittings.length,
      workers: workers.length,
      expenses: expenses.length
    },
    skipped
  };
}

/** Reads the showroom's existing browser-storage database, if any. */
export function readLegacyLocalDatabase(storageKey = 'REGENCY_TAILORS_DB_V3'): LegacyDataset | null {
  const read = <T>(suffix: string): T[] => {
    try {
      const raw = localStorage.getItem(`${storageKey}_${suffix}`);
      const parsed = raw ? JSON.parse(raw) : null;
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  };

  const dataset: LegacyDataset = {
    customers: read<Customer>('CUSTOMERS'),
    orders: read<Order>('ORDERS'),
    measurements: read<MeasurementRecord>('MEASUREMENTS'),
    fittings: read<Fitting>('FITTINGS'),
    workers: read<Worker>('WORKERS'),
    expenses: read<Expense>('EXPENSES'),
    orderSequence: (() => {
      try {
        return parseInt(localStorage.getItem(`${storageKey}_ORDER_SEQ`) || '0', 10) || 0;
      } catch {
        return 0;
      }
    })()
  };

  const hasAnything =
    (dataset.customers?.length || 0) + (dataset.orders?.length || 0) + (dataset.measurements?.length || 0) > 0;

  return hasAnything ? dataset : null;
}
