import { requireSupabase } from '../lib/supabase';
import {
  Customer,
  Order,
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
import {
  toCustomer, toOrder, toMeasurementRecord, toInvoice, toFitting, toWorker,
  toExpense, toTrashItem, toShowroomProfile,
  customerToRow, orderToWizardRow, orderItemsToRows, measurementValueRows,
  isUuid, normalizePhone,
  CustomerRow, OrderRow, MeasurementRow
} from './mappers';

/**
 * Every read and write the showroom performs against Supabase.
 *
 * Two rules this layer holds to:
 *   1. It returns the exact shapes the existing React components consume, so
 *      no view or modal had to change to move off browser storage.
 *   2. It never decides who may see what. Authorisation lives in Row Level
 *      Security; these queries simply fail or come back empty for an account
 *      that is not on the allowlist.
 */

export interface ShowroomDataset {
  customers: Customer[];
  orders: Order[];
  measurements: MeasurementRecord[];
  fittings: Fitting[];
  workers: Worker[];
  invoices: Invoice[];
  expenses: Expense[];
  trash: TrashItem[];
  profile: ShowroomProfile;
}

function fail(context: string, error: { message: string } | null): never | void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

/* ------------------------------------------------------------------ read */

export async function loadDataset(activeUser: string): Promise<ShowroomDataset> {
  const db = requireSupabase();

  const [customersRes, ordersRes, measurementsRes, fittingsRes, workersRes, invoicesRes, expensesRes, trashRes, settingsRes] =
    await Promise.all([
      db.from('customers_with_stats').select('*').is('deleted_at', null).order('created_at', { ascending: false }),
      db.from('orders').select('*, order_items(*), order_payments(*)').is('deleted_at', null).order('order_number', { ascending: false }),
      db.from('measurements').select('*, measurement_values(*)').is('deleted_at', null),
      db.from('fittings').select('*').order('scheduled_date', { ascending: true }),
      db.from('workers').select('*').is('deleted_at', null),
      db.from('invoices').select('*'),
      db.from('expenses').select('*').order('spent_on', { ascending: false }),
      db.from('trash_items').select('*').order('deleted_at', { ascending: false }),
      db.from('showroom_settings').select('*').limit(1).maybeSingle()
    ]);

  fail('Could not load customers', customersRes.error);
  fail('Could not load orders', ordersRes.error);
  fail('Could not load measurements', measurementsRes.error);
  fail('Could not load fittings', fittingsRes.error);
  fail('Could not load workers', workersRes.error);
  fail('Could not load bills', invoicesRes.error);
  fail('Could not load expenses', expensesRes.error);
  fail('Could not load trash', trashRes.error);
  fail('Could not load showroom settings', settingsRes.error);

  const customers = (customersRes.data || []).map(r => toCustomer(r as CustomerRow));
  const byCustomerId = new Map(customers.map(c => [c.id, c]));

  const orders = (ordersRes.data || []).map(r => toOrder(r as unknown as OrderRow));
  const byOrderDbId = new Map(orders.map(o => [o.dbId!, o]));

  return {
    customers,
    orders,
    measurements: (measurementsRes.data || []).map(r =>
      toMeasurementRecord(r as unknown as MeasurementRow, byCustomerId.get((r as MeasurementRow).customer_id))
    ),
    fittings: (fittingsRes.data || []).map(r =>
      toFitting(r as Record<string, unknown>, byOrderDbId.get(String((r as Record<string, unknown>).order_id)))
    ),
    workers: (workersRes.data || []).map(r => toWorker(r as Record<string, unknown>)),
    invoices: (invoicesRes.data || []).map(r => toInvoice(r as Record<string, unknown>)),
    expenses: (expensesRes.data || []).map(r => toExpense(r as Record<string, unknown>)),
    trash: (trashRes.data || []).map(r => toTrashItem(r as Record<string, unknown>)),
    profile: toShowroomProfile(settingsRes.data as Record<string, unknown> | null, activeUser)
  };
}

/* -------------------------------------------------------------- customers */

/**
 * Creates or updates a customer, resolving a returning client by phone number
 * rather than creating a second ledger row. The database enforces the same
 * rule with a unique index, so a race between two devices ends in a caught
 * conflict rather than a duplicate.
 */
export async function saveCustomer(customer: Customer): Promise<Customer> {
  const db = requireSupabase();
  const payload = customerToRow(customer);

  // A uuid means Postgres already has this row. Anything else is a client-side
  // id the UI invented, and is matched by phone below instead — including the
  // `RESTORED-CUST-n` ids a legacy import mints, which the old `CUST-` prefix
  // test let through into `.eq('id', ...)` and a uuid error.
  if (isUuid(customer.id)) {
    const { data, error } = await db.from('customers').update(payload).eq('id', customer.id).select('*').single();
    fail('Could not save the customer', error);
    return toCustomer(data as CustomerRow);
  }

  const normalized = normalizePhone(customer.phone);
  const { data: existing } = await db
    .from('customers')
    .select('id')
    .eq('phone_normalized', normalized)
    .is('deleted_at', null)
    .maybeSingle();

  if (existing?.id) {
    const { data, error } = await db.from('customers').update(payload).eq('id', existing.id).select('*').single();
    fail('Could not update the existing customer', error);
    return toCustomer(data as CustomerRow);
  }

  const { data, error } = await db.from('customers').insert(payload).select('*').single();
  fail('Could not create the customer', error);
  return toCustomer(data as CustomerRow);
}

export async function softDeleteCustomer(customerId: string): Promise<void> {
  const db = requireSupabase();
  const { error } = await db
    .from('customers')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', customerId);
  fail('Could not move the customer to trash', error);
}

/**
 * Details the app knows about a customer, which may or may not be a saved row.
 */
export interface CustomerIdentity {
  id?: string;
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
}

/**
 * The real `customers.id` for a customer the UI may only know by a client id.
 *
 * `orders.customer_id` and `measurements.customer_id` are uuid columns with a
 * foreign key onto `customers`. The New Order wizard, though, builds its
 * customer the moment the counter hand finishes typing — with a provisional
 * `CUST-...` id, because no row exists yet — and the New Measurement modal does
 * the same. Handing either of those straight to Postgres is what produced
 * `invalid input syntax for type uuid: "CUST-MTMUP4YW-2286"`.
 *
 * The mapping is by phone number, which is the showroom's own idea of customer
 * identity and the key the `customers_phone_unique_live` index already enforces:
 *
 *   already a uuid        -> use it, the row exists
 *   known phone number    -> that customer's uuid, so a walk-in typed into the
 *                            order form lands on their existing ledger rather
 *                            than opening a second one
 *   unknown phone number  -> create the customer, return the issued uuid
 *
 * Nothing here weakens Row Level Security: these are ordinary authenticated
 * reads and writes, and an account that is not on the allowlist gets nothing
 * back from the lookup and is refused the insert.
 */
async function resolveCustomerUuid(identity: CustomerIdentity, context: string): Promise<string> {
  if (isUuid(identity.id)) return identity.id;

  const db = requireSupabase();
  const normalized = normalizePhone(identity.phone);

  // Without a phone number there is nothing to match on, and inventing a
  // customer from a name alone would merge unrelated people. Better to refuse
  // the write and say why than to guess at who this is.
  if (normalized.length < 10) {
    throw new Error(
      `${context}: this customer is not linked to a database record and has no phone number to match on.`
    );
  }

  const { data: existing, error: lookupError } = await db
    .from('customers')
    .select('id')
    .eq('phone_normalized', normalized)
    .is('deleted_at', null)
    .maybeSingle();
  fail(`${context}: the customer could not be looked up`, lookupError);
  if (existing?.id) return String(existing.id);

  const { data: created, error: insertError } = await db
    .from('customers')
    .insert({
      name: (identity.name || '').trim(),
      phone: (identity.phone || '').trim(),
      email: identity.email?.trim() || null,
      address: identity.address?.trim() || null,
      city: identity.city?.trim() || null
    })
    .select('id')
    .single();

  if (insertError) {
    // Another device — or this order's own customer save, racing us — may have
    // inserted the same number first. The partial unique index rejects the
    // duplicate, and the row it protected is exactly the one we were after.
    if ((insertError as { code?: string }).code === '23505') {
      const { data: raced } = await db
        .from('customers')
        .select('id')
        .eq('phone_normalized', normalized)
        .is('deleted_at', null)
        .maybeSingle();
      if (raced?.id) return String(raced.id);
    }
    throw new Error(`${context}: the customer could not be created: ${insertError.message}`);
  }

  return String((created as { id: string }).id);
}

/* ----------------------------------------------------------------- orders */

/**
 * Saves a new order or applies an edit.
 *
 * An edit writes only the columns the wizard owns. Money, workflow status,
 * production notes and payment history are never touched here — the defect
 * that erased a customer's advance in the browser-storage build is structurally
 * impossible now, because those columns are not in the update statement.
 */
export async function saveOrder(order: Order): Promise<Order> {
  const db = requireSupabase();

  // Resolved before anything is written, so the uuid column only ever receives
  // a uuid no matter which screen the order came from.
  const customerId = await resolveCustomerUuid(
    {
      id: order.customerId,
      name: order.customerName,
      phone: order.customerPhone,
      email: order.customerEmail,
      address: order.customerAddress
    },
    'Could not save the order'
  );

  const wizardColumns = orderToWizardRow(order, customerId);

  let orderDbId = order.dbId;

  if (orderDbId) {
    const { error } = await db.from('orders').update(wizardColumns).eq('id', orderDbId);
    fail('Could not save the order', error);
  } else {
    // order_number comes from the database sequence, never from the client.
    const { data, error } = await db.from('orders').insert(wizardColumns).select('id').single();
    fail('Could not create the order', error);
    orderDbId = (data as { id: string }).id;
  }

  // Garment lines are replaced wholesale: the wizard always submits the
  // complete set, and position 1..n must match what it shows.
  const { error: clearError } = await db.from('order_items').delete().eq('order_id', orderDbId);
  fail('Could not update the order garments', clearError);

  const itemRows = orderItemsToRows(order, orderDbId!);
  if (itemRows.length > 0) {
    const { error: itemsError } = await db.from('order_items').insert(itemRows);
    fail('Could not save the order garments', itemsError);
  }

  const { data: saved, error: readError } = await db
    .from('orders')
    .select('*, order_items(*), order_payments(*)')
    .eq('id', orderDbId)
    .single();
  fail('Could not re-read the saved order', readError);
  return toOrder(saved as unknown as OrderRow);
}

export async function updateOrderStatus(orderDbId: string, status: OrderStatus): Promise<void> {
  const db = requireSupabase();
  const { error } = await db.from('orders').update({ status }).eq('id', orderDbId);
  fail('Could not update the order status', error);
}

export async function updateProductionStatus(orderDbId: string, status: ProductionStatus): Promise<void> {
  const db = requireSupabase();
  const { error } = await db.from('orders').update({ production_status: status }).eq('id', orderDbId);
  fail('Could not update the production status', error);
}

export async function updateProductionNotes(orderDbId: string, notes: string): Promise<void> {
  const db = requireSupabase();
  const { error } = await db.from('orders').update({ production_notes: notes }).eq('id', orderDbId);
  fail('Could not save the production notes', error);
}

export async function softDeleteOrder(orderDbId: string): Promise<void> {
  const db = requireSupabase();
  const { error } = await db.from('orders').update({ deleted_at: new Date().toISOString() }).eq('id', orderDbId);
  fail('Could not move the order to trash', error);
}

/** Recording a payment inserts a row; the order's advance and balance follow
 *  by trigger, so the two can never disagree. */
export async function recordOrderPayment(
  orderDbId: string,
  amount: number,
  method: string,
  note?: string
): Promise<void> {
  const db = requireSupabase();
  const { error } = await db.from('order_payments').insert({
    order_id: orderDbId,
    amount,
    method,
    note: note || null
  });
  fail('Could not record the payment', error);
}

/* ----------------------------------------------------------- measurements */

/**
 * Upserts the customer's measurement ledger. Each garment category is its own
 * row, so a shirt-only visit cannot blank a previously recorded coat.
 */
export async function saveMeasurement(record: MeasurementRecord): Promise<void> {
  const db = requireSupabase();

  // Same uuid column, same provisional-id problem: the New Measurement modal
  // can create its customer inline exactly as the order wizard does.
  const customerId = await resolveCustomerUuid(
    { id: record.customerId, name: record.customerName, phone: record.customerPhone },
    'Could not save the measurement profile'
  );

  const { data: existing } = await db
    .from('measurements')
    .select('id')
    .eq('customer_id', customerId)
    .maybeSingle();

  const header = {
    customer_id: customerId,
    unit: record.unit === 'cm' ? 'cm' : 'inches',
    fit_preference: record.fitPreference || null,
    posture_notes: record.postureNotes || null,
    fitting_notes: record.fittingNotes || null,
    garment_remarks: record.garmentRemarks || null,
    last_updated: record.lastUpdated || new Date().toISOString().split('T')[0],
    deleted_at: null
  };

  let measurementId = existing?.id as string | undefined;

  if (measurementId) {
    const { error } = await db.from('measurements').update(header).eq('id', measurementId);
    fail('Could not save the measurement profile', error);
  } else {
    const { data, error } = await db.from('measurements').insert(header).select('id').single();
    fail('Could not create the measurement profile', error);
    measurementId = (data as { id: string }).id;
  }

  const rows = measurementValueRows(record).map(r => ({ ...r, measurement_id: measurementId }));
  if (rows.length > 0) {
    const { error } = await db
      .from('measurement_values')
      .upsert(rows, { onConflict: 'measurement_id,garment_category' });
    fail('Could not save the garment measurements', error);
  }
}

export async function softDeleteMeasurement(measurementId: string): Promise<void> {
  const db = requireSupabase();
  const { error } = await db
    .from('measurements')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', measurementId);
  fail('Could not move the measurement profile to trash', error);
}

/* -------------------------------------------------- fittings, workers, etc */

export async function updateFittingStatus(fittingId: string, status: Fitting['status'], notes?: string): Promise<void> {
  const db = requireSupabase();
  const patch: Record<string, unknown> = { status };
  if (notes !== undefined) patch.adjustment_notes = notes;
  const { error } = await db.from('fittings').update(patch).eq('id', fittingId);
  fail('Could not update the fitting', error);
}

export async function deleteFitting(fittingId: string): Promise<void> {
  const db = requireSupabase();
  const { error } = await db.from('fittings').delete().eq('id', fittingId);
  fail('Could not remove the fitting', error);
}

export async function recordWorkerAdvance(workerId: string, amount: number): Promise<void> {
  const db = requireSupabase();
  const { data, error: readError } = await db.from('workers').select('advance_taken').eq('id', workerId).single();
  fail('Could not read the artisan record', readError);
  const next = Number((data as { advance_taken: number }).advance_taken || 0) + amount;
  const { error } = await db.from('workers').update({ advance_taken: next }).eq('id', workerId);
  fail('Could not record the advance', error);
}

export async function markWorkerPayoutPaid(workerId: string): Promise<void> {
  const db = requireSupabase();
  const { error } = await db.from('workers').update({ advance_taken: 0, total_earned: 0 }).eq('id', workerId);
  fail('Could not mark the payout as paid', error);
}

export async function addExpense(expense: Omit<Expense, 'id'>): Promise<void> {
  const db = requireSupabase();
  const { error } = await db.from('expenses').insert({
    spent_on: expense.date,
    category: expense.category,
    description: expense.description,
    amount: expense.amount,
    paid_to: expense.paidTo
  });
  fail('Could not save the expense', error);
}

/* ------------------------------------------------------------------ trash */

const TRASH_TABLES: Record<string, string> = {
  Customer: 'customers',
  Order: 'orders',
  Measurement: 'measurements',
  Worker: 'workers'
};

export async function restoreTrashItem(item: TrashItem): Promise<void> {
  const db = requireSupabase();
  const table = TRASH_TABLES[item.itemType];
  const dbId = (item.originalData as { dbId?: string } | undefined)?.dbId;
  if (!table || !dbId) throw new Error('This trash entry cannot be restored automatically.');
  const { error } = await db.from(table).update({ deleted_at: null, deleted_by: null }).eq('id', dbId);
  fail('Could not restore the record', error);
}

/** Permanent removal. Restricted to records already in trash so a live record
 *  can never be destroyed by this path. */
export async function purgeTrashItem(item: TrashItem): Promise<void> {
  const db = requireSupabase();
  const table = TRASH_TABLES[item.itemType];
  const dbId = (item.originalData as { dbId?: string } | undefined)?.dbId;
  if (!table || !dbId) throw new Error('This trash entry cannot be deleted automatically.');
  const { error } = await db.from(table).delete().eq('id', dbId).not('deleted_at', 'is', null);
  fail('Could not permanently delete the record', error);
}

export async function emptyTrash(items: TrashItem[]): Promise<void> {
  for (const item of items) {
    await purgeTrashItem(item);
  }
}

/* --------------------------------------------------------- backup/restore */

export async function exportBackupPayload(): Promise<Record<string, unknown>> {
  const db = requireSupabase();
  const { data, error } = await db.rpc('export_backup');
  fail('Could not export the showroom database', error);
  return data as Record<string, unknown>;
}

/**
 * Replaces the whole dataset atomically inside the database. Validation, the
 * pre-restore safety snapshot and the replacement all happen in one
 * transaction: a failure leaves production exactly as it was.
 */
export async function restoreBackupPayload(payload: Record<string, unknown>, reason: string): Promise<Record<string, unknown>> {
  const db = requireSupabase();
  const { data, error } = await db.rpc('restore_backup', { p_payload: payload, p_reason: reason });
  fail('Could not restore the backup', error);
  return data as Record<string, unknown>;
}

export async function saveShowroomSettings(profile: ShowroomProfile): Promise<void> {
  const db = requireSupabase();
  const { error } = await db
    .from('showroom_settings')
    .update({
      name: profile.name,
      subtitle: profile.subtitle,
      city: profile.city,
      phone: profile.phone,
      email: profile.email || null,
      gstin: profile.gstin || null
    })
    .eq('id', true);
  fail('Could not save the showroom settings', error);
}
