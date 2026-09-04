/**
 * An in-memory stand-in for the Supabase PostgREST client.
 *
 * It exists so the repository's write paths can be tested against something
 * that behaves like the real schema rather than a permissive mock. The point of
 * these tests is a type error Postgres raised — `invalid input syntax for type
 * uuid` — so a fake that happily stores any string would prove nothing. This
 * one enforces the constraints that actually caught the bug:
 *
 *   - uuid columns reject anything that is not a uuid, with Postgres's own
 *     message and SQLSTATE (22P02)
 *   - `customers.phone_normalized` is generated from `phone`, exactly as the
 *     stored column is
 *   - the partial unique index on that column rejects a second live customer
 *     with the same number (23505)
 *   - `orders.customer_id` and `measurements.customer_id` must reference a
 *     customer that exists (23503)
 *   - ids and `orders.order_number` are issued by the database, never sent
 *
 * It implements only the query shapes `supabaseRepository` actually uses.
 */

type Row = Record<string, unknown>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Columns typed `uuid` in supabase/migrations/20260827000000_schema.sql. */
const UUID_COLUMNS: Record<string, string[]> = {
  customers: ['id'],
  orders: ['id', 'customer_id'],
  order_items: ['id', 'order_id'],
  order_payments: ['id', 'order_id'],
  measurements: ['id', 'customer_id'],
  measurement_values: ['id', 'measurement_id']
};

export interface PostgrestLikeError {
  message: string;
  code: string;
  details: string | null;
  hint: string | null;
}

const pgError = (code: string, message: string): PostgrestLikeError => ({
  message,
  code,
  details: null,
  hint: null
});

/** `right(regexp_replace(phone, '[^0-9]', '', 'g'), 10)` — the generated column. */
const generatePhoneNormalized = (phone: unknown): string =>
  String(phone ?? '').replace(/\D/g, '').slice(-10);

export class FakeSupabase {
  readonly tables: Record<string, Row[]> = {
    customers: [],
    orders: [],
    order_items: [],
    order_payments: [],
    measurements: [],
    measurement_values: [],
    showroom_settings: [],
    fittings: [],
    workers: [],
    invoices: [],
    expenses: [],
    trash_items: []
  };

  /** Every statement the repository issued, for assertions about what was sent. */
  readonly writes: { table: string; op: 'insert' | 'update' | 'delete' | 'upsert'; payload: unknown }[] = [];

  private uuidSeed = 0;
  private orderNumberSeq = 0;

  /** Set to force the next customers insert to raise a unique violation, so the
   *  concurrent-device path can be exercised deterministically. */
  raceNextCustomerInsert = false;

  newUuid(): string {
    this.uuidSeed += 1;
    const n = this.uuidSeed.toString(16).padStart(12, '0');
    return `00000000-0000-4000-8000-${n}`;
  }

  /** Seeds a customer the way a prior save would have, returning its real id. */
  seedCustomer(fields: Row): Row {
    const row: Row = {
      id: this.newUuid(),
      email: null,
      address: null,
      city: null,
      notes: null,
      created_at: '2026-09-01T00:00:00.000Z',
      deleted_at: null,
      ...fields
    };
    row.phone_normalized = generatePhoneNormalized(row.phone);
    this.tables.customers.push(row);
    return row;
  }

  from(table: string) {
    return new FakeQuery(this, table);
  }

  /**
   * Rows a query reads from. `customers_with_stats` is a view in the schema —
   * the customer row plus its order tally — so it is derived here rather than
   * stored, which also keeps the totals honest across a reload.
   */
  rowsFor(table: string): Row[] {
    if (table !== 'customers_with_stats') return this.tables[table] || [];
    return this.tables.customers.map(c => {
      const theirs = this.tables.orders.filter(o => o.customer_id === c.id && !o.deleted_at);
      return {
        ...c,
        total_orders: theirs.length,
        lifetime_spend: theirs.reduce((sum, o) => sum + Number(o.total_amount || 0), 0),
        last_visit_date: theirs.length > 0 ? theirs[theirs.length - 1].order_date : c.created_at
      };
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  rpc(_fn: string, _args?: unknown) {
    return Promise.resolve({ data: null, error: null });
  }

  /* ------------------------------------------------------------ internals */

  /** The check that reproduces the reported production failure. */
  assertUuidColumns(table: string, row: Row): PostgrestLikeError | null {
    for (const column of UUID_COLUMNS[table] || []) {
      const value = row[column];
      if (value === undefined || value === null) continue;
      if (!UUID_RE.test(String(value))) {
        return pgError('22P02', `invalid input syntax for type uuid: "${String(value)}"`);
      }
    }
    return null;
  }

  assertForeignKeys(table: string, row: Row): PostgrestLikeError | null {
    const fk: Record<string, [string, string]> = {
      orders: ['customer_id', 'customers'],
      measurements: ['customer_id', 'customers'],
      order_items: ['order_id', 'orders'],
      order_payments: ['order_id', 'orders']
    };
    const entry = fk[table];
    if (!entry) return null;
    const [column, parent] = entry;
    const value = row[column];
    if (value === undefined || value === null) return null;
    if (!this.tables[parent].some(r => r.id === value)) {
      return pgError(
        '23503',
        `insert or update on table "${table}" violates foreign key constraint "${table}_${column}_fkey"`
      );
    }
    return null;
  }

  /** `customers_phone_unique_live`: one live customer per number. */
  assertPhoneUnique(table: string, row: Row, ignoreId?: unknown): PostgrestLikeError | null {
    if (table !== 'customers') return null;
    if (row.deleted_at) return null;
    const normalized = row.phone_normalized;
    const clash = this.tables.customers.some(
      r => r.id !== ignoreId && !r.deleted_at && r.phone_normalized === normalized
    );
    if (clash) {
      return pgError(
        '23505',
        'duplicate key value violates unique constraint "customers_phone_unique_live"'
      );
    }
    return null;
  }

  defaultsFor(table: string, row: Row): Row {
    const withDefaults: Row = { id: this.newUuid(), deleted_at: null, ...row };
    if (table === 'customers') {
      withDefaults.phone_normalized = generatePhoneNormalized(withDefaults.phone);
      withDefaults.created_at = withDefaults.created_at || '2026-09-01T00:00:00.000Z';
    }
    if (table === 'orders') {
      this.orderNumberSeq += 1;
      withDefaults.order_number = this.orderNumberSeq;
      withDefaults.status = withDefaults.status || 'New';
      withDefaults.production_status = withDefaults.production_status || 'New';
    }
    return withDefaults;
  }
}

type Filter = (row: Row) => boolean;

/**
 * A thenable query builder: the repository awaits these directly, and also
 * finishes them with `.single()` / `.maybeSingle()`.
 */
class FakeQuery implements PromiseLike<{ data: unknown; error: PostgrestLikeError | null }> {
  private filters: Filter[] = [];
  private selectSpec = '*';
  private mode: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private payload: Row[] = [];

  constructor(private db: FakeSupabase, private table: string) {}

  select(spec = '*') {
    this.selectSpec = spec;
    if (this.mode === 'select') this.mode = 'select';
    return this;
  }

  insert(payload: Row | Row[]) {
    this.mode = 'insert';
    this.payload = Array.isArray(payload) ? payload : [payload];
    return this;
  }

  update(patch: Row) {
    this.mode = 'update';
    this.payload = [patch];
    return this;
  }

  upsert(payload: Row | Row[], _opts?: unknown) {
    this.mode = 'upsert';
    this.payload = Array.isArray(payload) ? payload : [payload];
    return this;
  }

  delete() {
    this.mode = 'delete';
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push(row => row[column] === value);
    return this;
  }

  is(column: string, value: unknown) {
    this.filters.push(row => (value === null ? row[column] === null || row[column] === undefined : row[column] === value));
    return this;
  }

  not(column: string, op: string, value: unknown) {
    this.filters.push(row =>
      op === 'is' && value === null ? row[column] !== null && row[column] !== undefined : row[column] !== value
    );
    return this;
  }

  order(_column: string, _opts?: unknown) {
    return this;
  }

  limit(_n: number) {
    return this;
  }

  maybeSingle() {
    return this.run().then(res => {
      if (res.error) return res;
      const rows = res.data as Row[];
      return { data: rows.length > 0 ? rows[0] : null, error: null };
    });
  }

  single() {
    return this.run().then(res => {
      if (res.error) return res;
      const rows = res.data as Row[];
      if (rows.length !== 1) {
        return {
          data: null,
          error: pgError('PGRST116', 'JSON object requested, multiple (or no) rows returned')
        };
      }
      return { data: rows[0], error: null };
    });
  }

  then<TResult1 = { data: unknown; error: PostgrestLikeError | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: PostgrestLikeError | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.run().then(onfulfilled, onrejected);
  }

  private matching(): Row[] {
    return this.db.rowsFor(this.table).filter(row => this.filters.every(f => f(row)));
  }

  /** Expands the embedded selects the repository asks for. */
  private project(rows: Row[]): Row[] {
    if (!this.selectSpec.includes('(')) return rows.map(r => ({ ...r }));
    return rows.map(row => {
      const out: Row = { ...row };
      if (this.selectSpec.includes('order_items(')) {
        out.order_items = this.db.tables.order_items.filter(i => i.order_id === row.id).map(i => ({ ...i }));
      }
      if (this.selectSpec.includes('order_payments(')) {
        out.order_payments = this.db.tables.order_payments.filter(p => p.order_id === row.id).map(p => ({ ...p }));
      }
      if (this.selectSpec.includes('measurement_values(')) {
        out.measurement_values = this.db.tables.measurement_values
          .filter(v => v.measurement_id === row.id)
          .map(v => ({ ...v }));
      }
      return out;
    });
  }

  private async run(): Promise<{ data: unknown; error: PostgrestLikeError | null }> {
    const table = this.table;
    const db = this.db;

    if (this.mode === 'select') {
      return { data: this.project(this.matching()), error: null };
    }

    if (this.mode === 'insert' || this.mode === 'upsert') {
      const inserted: Row[] = [];
      for (const raw of this.payload) {
        const row = db.defaultsFor(table, raw);

        const typeError = db.assertUuidColumns(table, row);
        if (typeError) return { data: null, error: typeError };

        if (table === 'customers' && db.raceNextCustomerInsert) {
          db.raceNextCustomerInsert = false;
          // Model the row a concurrent device committed a moment earlier.
          db.seedCustomer({ name: row.name, phone: row.phone });
          return {
            data: null,
            error: pgError('23505', 'duplicate key value violates unique constraint "customers_phone_unique_live"')
          };
        }

        const uniqueError = db.assertPhoneUnique(table, row);
        if (uniqueError) return { data: null, error: uniqueError };

        const fkError = db.assertForeignKeys(table, row);
        if (fkError) return { data: null, error: fkError };

        db.tables[table].push(row);
        inserted.push(row);
      }
      db.writes.push({ table, op: this.mode, payload: this.payload });
      return { data: this.project(inserted), error: null };
    }

    if (this.mode === 'update') {
      const patch = this.payload[0];
      const targets = this.matching();
      const updated: Row[] = [];
      for (const row of targets) {
        const next: Row = { ...row, ...patch };
        if (table === 'customers') next.phone_normalized = generatePhoneNormalized(next.phone);

        const typeError = db.assertUuidColumns(table, next);
        if (typeError) return { data: null, error: typeError };

        const uniqueError = db.assertPhoneUnique(table, next, row.id);
        if (uniqueError) return { data: null, error: uniqueError };

        const fkError = db.assertForeignKeys(table, next);
        if (fkError) return { data: null, error: fkError };

        Object.assign(row, next);
        updated.push(row);
      }
      db.writes.push({ table, op: 'update', payload: patch });
      return { data: this.project(updated), error: null };
    }

    // delete
    const doomed = new Set(this.matching());
    db.tables[table] = db.tables[table].filter(r => !doomed.has(r));
    db.writes.push({ table, op: 'delete', payload: [...doomed] });
    return { data: [...doomed], error: null };
  }
}
