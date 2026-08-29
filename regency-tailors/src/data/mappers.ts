import {
  Customer,
  Order,
  OrderItem,
  MeasurementRecord,
  Fitting,
  Worker,
  Invoice,
  Expense,
  TrashItem,
  ShowroomProfile,
  OrderStatus,
  ProductionStatus
} from '../types';

/**
 * Translation between the Postgres row shapes and the shapes the existing
 * React components already consume.
 *
 * Everything here is a pure function so the mapping can be tested without a
 * database. The rule the whole layer follows: the application's state shape
 * does not change. `OrdersView`, `OrderModal`, `ProductionSlipPage` and the
 * rest receive exactly the props they received when this ran on localStorage.
 */

export const MEASUREMENT_CATEGORIES = ['coat', 'pant', 'shirt', 'kurta', 'pajama'] as const;
export type MeasurementCategory = (typeof MEASUREMENT_CATEGORIES)[number];

/* ----------------------------------------------------------------- rows */

export interface CustomerRow {
  id: string;
  legacy_id?: string | null;
  name: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  notes?: string | null;
  created_at?: string | null;
  deleted_at?: string | null;
  total_orders?: number | null;   // from customers_with_stats
  lifetime_spend?: number | null; // from customers_with_stats
  last_visit_date?: string | null;
}

export interface OrderItemRow {
  id: string;
  order_id: string;
  position: number;
  garment_type: string;
  fabric_code?: string | null;
  fabric_name?: string | null;
  notes?: string | null;
  style_notes?: string | null;
  special_instructions?: string | null;
  remarks?: string | null;
  price?: number | string | null;
  quantity?: number | null;
}

export interface OrderRow {
  id: string;
  order_number: number;
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string | null;
  customer_address?: string | null;
  order_date?: string | null;
  trial_date?: string | null;
  trial_time?: string | null;
  trial_required?: boolean | null;
  trial_charge?: number | string | null;
  delivery_date: string;
  delivery_time?: string | null;
  delivery_type?: string | null;
  status?: string | null;
  production_status?: string | null;
  production_notes?: string | null;
  priority?: string | null;
  salesperson?: string | null;
  special_instructions?: string | null;
  fitting_notes?: string | null;
  notes?: string | null;
  urgent?: boolean | null;
  subtotal?: number | string | null;
  discount?: number | string | null;
  tax_amount?: number | string | null;
  total_amount?: number | string | null;
  advance_paid?: number | string | null;
  balance_due?: number | string | null;
  payment_method?: string | null;
  measurements_snapshot?: Partial<MeasurementRecord> | null;
  deleted_at?: string | null;
  order_items?: OrderItemRow[] | null;
  order_payments?: OrderPaymentRow[] | null;
}

export interface OrderPaymentRow {
  id: string;
  order_id: string;
  paid_on?: string | null;
  amount: number | string;
  method?: string | null;
  note?: string | null;
}

export interface MeasurementRow {
  id: string;
  customer_id: string;
  last_order_id?: string | null;
  unit?: string | null;
  fit_preference?: string | null;
  posture_notes?: string | null;
  fitting_notes?: string | null;
  garment_remarks?: Record<string, string> | null;
  last_updated?: string | null;
  deleted_at?: string | null;
  measurement_values?: MeasurementValueRow[] | null;
}

export interface MeasurementValueRow {
  id?: string;
  measurement_id?: string;
  garment_category: string;
  data: Record<string, unknown>;
}

/* ------------------------------------------------------------- helpers */

/** Postgres numerics arrive as strings over the wire. */
export const num = (v: unknown, fallback = 0): number => {
  if (v === null || v === undefined || v === '') return fallback;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const str = (v: unknown, fallback = ''): string => (v === null || v === undefined ? fallback : String(v));

/** Date columns render as plain YYYY-MM-DD throughout the UI. */
export const dateOnly = (v: unknown): string => {
  if (!v) return '';
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : s;
};

/* ---------------------------------------------------------- to the app */

export function toCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    name: str(row.name),
    phone: str(row.phone),
    email: str(row.email),
    address: str(row.address),
    city: str(row.city),
    notes: str(row.notes) || undefined,
    totalOrders: num(row.total_orders),
    lifetimeSpend: num(row.lifetime_spend),
    lastVisitDate: dateOnly(row.last_visit_date || row.created_at),
    createdDate: dateOnly(row.created_at)
  };
}

export function toOrderItem(row: OrderItemRow): OrderItem {
  return {
    id: row.id,
    garmentType: str(row.garment_type),
    fabricCode: str(row.fabric_code),
    fabricName: str(row.fabric_name),
    notes: str(row.notes),
    price: num(row.price),
    quantity: Math.max(1, Math.round(num(row.quantity, 1))),
    styleNotes: str(row.style_notes) || undefined,
    specialInstructions: str(row.special_instructions) || undefined,
    remarks: str(row.remarks)
  };
}

export function toOrder(row: OrderRow): Order {
  const items = (row.order_items || [])
    .slice()
    .sort((a, b) => (a.position || 0) - (b.position || 0))
    .map(toOrderItem);

  const orderNumber = String(row.order_number);

  return {
    // The order number is the identity the showroom uses on paper, so it stays
    // the id the UI works with. The uuid travels alongside for the repository.
    id: orderNumber,
    orderNumber,
    dbId: row.id,
    customerId: row.customer_id,
    customerName: str(row.customer_name),
    customerPhone: str(row.customer_phone),
    customerEmail: str(row.customer_email),
    customerAddress: str(row.customer_address),
    items,
    orderDate: dateOnly(row.order_date),
    trialDate: dateOnly(row.trial_date),
    trialTime: str(row.trial_time) || undefined,
    trialRequired: Boolean(row.trial_required),
    trialCharge: num(row.trial_charge),
    deliveryDate: dateOnly(row.delivery_date),
    deliveryTime: str(row.delivery_time) || undefined,
    deliveryType: str(row.delivery_type) || undefined,
    status: (str(row.status, 'New') as OrderStatus),
    productionStatus: (str(row.production_status, 'New') as ProductionStatus),
    productionNotes: str(row.production_notes) || undefined,
    priority: (str(row.priority, 'Normal') as Order['priority']),
    salesperson: str(row.salesperson) || undefined,
    specialInstructions: str(row.special_instructions),
    fittingNotes: str(row.fitting_notes) || undefined,
    notes: str(row.notes),
    urgent: Boolean(row.urgent),
    subtotal: num(row.subtotal),
    discount: num(row.discount),
    taxAmount: num(row.tax_amount),
    totalAmount: num(row.total_amount),
    advancePaid: num(row.advance_paid),
    balanceDue: num(row.balance_due),
    paymentMethod: str(row.payment_method) || undefined,
    paymentHistory: (row.order_payments || []).map(p => ({
      id: p.id,
      date: dateOnly(p.paid_on),
      amount: num(p.amount),
      method: str(p.method, 'Cash'),
      note: str(p.note) || undefined
    })),
    measurementsSnapshot: row.measurements_snapshot || undefined
  };
}

export function toMeasurementRecord(row: MeasurementRow, customer?: Customer | null): MeasurementRecord {
  const byCategory: Partial<Record<MeasurementCategory, Record<string, unknown>>> = {};
  (row.measurement_values || []).forEach(v => {
    if ((MEASUREMENT_CATEGORIES as readonly string[]).includes(v.garment_category)) {
      byCategory[v.garment_category as MeasurementCategory] = v.data || {};
    }
  });

  const selected = MEASUREMENT_CATEGORIES.filter(c => byCategory[c]).map(
    c => c.charAt(0).toUpperCase() + c.slice(1)
  );

  return {
    id: row.id,
    customerId: row.customer_id,
    customerName: customer?.name || '',
    customerPhone: customer?.phone || '',
    garmentType: selected.join(', '),
    selectedGarments: selected,
    unit: (row.unit === 'cm' ? 'cm' : 'inches'),
    fitPreference: str(row.fit_preference) || undefined,
    postureNotes: str(row.posture_notes) || undefined,
    fittingNotes: str(row.fitting_notes) || undefined,
    garmentRemarks: row.garment_remarks || undefined,
    lastUpdated: dateOnly(row.last_updated),
    coat: byCategory.coat as MeasurementRecord['coat'],
    pant: byCategory.pant as MeasurementRecord['pant'],
    shirt: byCategory.shirt as MeasurementRecord['shirt'],
    kurta: byCategory.kurta as MeasurementRecord['kurta'],
    pajama: byCategory.pajama as MeasurementRecord['pajama']
  };
}

export function toInvoice(row: Record<string, unknown>): Invoice {
  return {
    id: str(row.id),
    orderId: String(row.order_number ?? ''),
    customerName: str(row.customer_name),
    customerPhone: str(row.customer_phone),
    date: dateOnly(row.date),
    items: Array.isArray(row.items) ? (row.items as Invoice['items']) : [],
    subtotal: num(row.subtotal),
    gstAmount: num(row.gst_amount),
    discount: num(row.discount),
    grandTotal: num(row.grand_total),
    amountPaid: num(row.amount_paid),
    balanceRemaining: num(row.balance_remaining),
    paymentMode: (str(row.payment_mode, 'Cash') as Invoice['paymentMode']),
    status: (str(row.status, 'Outstanding') as Invoice['status'])
  };
}

export function toFitting(row: Record<string, unknown>, order?: Order | null): Fitting {
  return {
    id: str(row.id),
    orderId: order?.id || str(row.order_id),
    customerName: order?.customerName || '',
    customerPhone: order?.customerPhone || '',
    garment: str(row.garment),
    trialStage: (str(row.trial_stage, 'First Trial') as Fitting['trialStage']),
    scheduledDate: dateOnly(row.scheduled_date),
    scheduledTime: str(row.scheduled_time),
    status: (str(row.status, 'Scheduled') as Fitting['status']),
    adjustmentNotes: str(row.adjustment_notes)
  };
}

export function toWorker(row: Record<string, unknown>): Worker {
  return {
    id: str(row.id),
    name: str(row.name),
    role: (str(row.role) as Worker['role']),
    phone: str(row.phone),
    type: (str(row.type, 'Piece-Rate') as Worker['type']),
    ratePerGarment: num(row.rate_per_garment),
    monthlySalary: num(row.monthly_salary),
    garmentsCompletedThisMonth: num(row.garments_completed_this_month),
    totalEarned: num(row.total_earned),
    advanceTaken: num(row.advance_taken),
    balancePayout: num(row.balance_payout),
    status: (str(row.status, 'Active') as Worker['status'])
  };
}

export function toExpense(row: Record<string, unknown>): Expense {
  return {
    id: str(row.id),
    date: dateOnly(row.spent_on),
    category: (str(row.category, 'Misc') as Expense['category']),
    description: str(row.description),
    amount: num(row.amount),
    paidTo: str(row.paid_to)
  };
}

export function toTrashItem(row: Record<string, unknown>): TrashItem {
  return {
    id: str(row.id),
    itemType: (str(row.item_type) as TrashItem['itemType']),
    title: str(row.title),
    // Restoring is a matter of clearing deleted_at, so the entity id is all
    // the repository needs to carry here.
    originalData: { dbId: str(row.entity_id) },
    deletedAt: dateOnly(row.deleted_at),
    deletedBy: str(row.deleted_by) || 'Showroom Owner'
  };
}

export function toShowroomProfile(row: Record<string, unknown> | null, activeUser: string): ShowroomProfile {
  const line1 = str(row?.address_line1);
  const line2 = str(row?.address_line2);
  return {
    name: str(row?.name, 'REGENCY TAILOR'),
    subtitle: str(row?.subtitle, 'Bespoke Showroom & Tailoring Suite'),
    city: str(row?.city),
    address: [line1, line2].filter(Boolean).join(' ').trim(),
    phone: str(row?.phone),
    email: str(row?.email),
    gstin: str(row?.gstin),
    activeUser,
    activeRole: 'Admin'
  };
}

/* -------------------------------------------------------- to the database */

export function customerToRow(customer: Customer): Record<string, unknown> {
  return {
    name: customer.name?.trim(),
    phone: customer.phone?.trim(),
    email: customer.email?.trim() || null,
    address: customer.address?.trim() || null,
    city: customer.city?.trim() || null,
    notes: customer.notes?.trim() || null
  };
}

/** Columns the order wizard is allowed to write. Money, workflow status and
 *  production state are deliberately absent: an edit must never reset them. */
export function orderToWizardRow(order: Order): Record<string, unknown> {
  return {
    customer_id: order.customerId,
    customer_name: order.customerName,
    customer_phone: order.customerPhone,
    customer_email: order.customerEmail || null,
    customer_address: order.customerAddress || null,
    order_date: order.orderDate || null,
    delivery_date: order.deliveryDate,
    special_instructions: order.specialInstructions || null,
    notes: order.notes || null,
    fitting_notes: order.fittingNotes || null,
    measurements_snapshot: order.measurementsSnapshot || null
  };
}

export function orderItemsToRows(order: Order, orderDbId: string): Record<string, unknown>[] {
  return (order.items || []).map((item, index) => ({
    order_id: orderDbId,
    position: index + 1,
    garment_type: item.garmentType,
    fabric_code: item.fabricCode || null,
    fabric_name: item.fabricName || null,
    notes: item.notes || null,
    style_notes: item.styleNotes || null,
    special_instructions: item.specialInstructions || null,
    remarks: item.remarks || null,
    price: num(item.price),
    quantity: Math.max(1, Math.round(num(item.quantity, 1)))
  }));
}

/** Splits an app measurement record into its per-category database rows. */
export function measurementValueRows(record: Partial<MeasurementRecord>): { garment_category: MeasurementCategory; data: Record<string, unknown> }[] {
  const rows: { garment_category: MeasurementCategory; data: Record<string, unknown> }[] = [];
  MEASUREMENT_CATEGORIES.forEach(category => {
    const data = (record as Record<string, unknown>)[category];
    if (data && typeof data === 'object') {
      rows.push({ garment_category: category, data: data as Record<string, unknown> });
    }
  });
  return rows;
}
