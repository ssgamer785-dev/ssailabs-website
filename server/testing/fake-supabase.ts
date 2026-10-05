/**
 * An in-memory stand-in for the parts of Supabase the API routes call, for
 * route-level tests: token → user lookup, PostgREST reads/writes with the
 * filters the routes use (eq, neq, is, in, limit), `.single()` semantics,
 * and RPCs answered by test-supplied handlers. Test-only; never imported by
 * the app.
 */
import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

export type Row = Record<string, unknown>;

export interface FakeSupabase {
  url: string;
  tables: Record<string, Row[]>;
  rpcCalls: { fn: string; args: Record<string, unknown> }[];
  /** The auth server's answer to every token check while set (an outage: 502, 503…); null for normal service. */
  authOutage: number | null;
  close: () => void;
}

type Filter = (row: Row) => boolean;

function parseList(raw: string): string[] {
  return raw.replace(/^\(|\)$/g, '').split(',').map(v => v.trim().replace(/^"|"$/g, ''));
}

function filtersFrom(query: URLSearchParams): { filters: Filter[]; limit: number | null; offset: number; order: string | null } {
  const filters: Filter[] = [];
  let limit: number | null = null;
  let offset = 0;
  let order: string | null = null;
  for (const [column, raw] of query) {
    if (['select', 'on_conflict', 'columns'].includes(column)) continue;
    if (column === 'limit') { limit = Number(raw); continue; }
    if (column === 'offset') { offset = Number(raw); continue; }
    if (column === 'order') { order = raw; continue; }
    const dot = raw.indexOf('.');
    const op = raw.slice(0, dot);
    const value = raw.slice(dot + 1);
    if (op === 'eq') filters.push(row => String(row[column]) === value);
    else if (op === 'neq') filters.push(row => String(row[column]) !== value);
    else if (op === 'is') filters.push(row => (value === 'null' ? row[column] == null : String(row[column]) === value));
    else if (op === 'in') { const set = new Set(parseList(value)); filters.push(row => set.has(String(row[column]))); }
    else if (op === 'lt') filters.push(row => String(row[column] ?? '') < value);
    else if (op === 'gt') filters.push(row => String(row[column] ?? '') > value);
    else if (raw === 'not.is.null') filters.push(row => row[column] != null);
    else throw new Error(`fake-supabase: unsupported filter ${column}=${raw}`);
  }
  return { filters, limit, offset, order };
}

export async function startFakeSupabase(options: {
  /** Bearer token → user id. */
  tokens: Record<string, string>;
  tables?: Record<string, Row[]>;
  rpc?: Record<string, (args: Record<string, unknown>, tables: Record<string, Row[]>) => unknown>;
  /** Tables whose writes fail: 'missing' answers as PostgREST does for an unknown table. */
  failWrites?: Record<string, 'missing' | 'error'>;
  /** Tables that do not exist: reads answer as PostgREST does for an unknown table. */
  missingTables?: string[];
  /** Composite primary/unique keys to enforce on insert (answered as Postgres does: 23505). */
  uniqueKeys?: Record<string, string[]>;
  /** Columns a table does not have yet (a migration not applied): selecting or writing one is refused as PostgREST does. */
  rejectColumns?: Record<string, string[]>;
}): Promise<FakeSupabase> {
  const tables: Record<string, Row[]> = options.tables ?? {};
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
  const fake: FakeSupabase = { url: '', tables, rpcCalls, authOutage: null, close: () => {} };
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/auth/v1/user', (req, res) => {
    if (fake.authOutage) return res.status(fake.authOutage).json({ message: 'upstream unavailable' });
    const id = options.tokens[req.get('authorization')?.replace(/^Bearer /, '') ?? ''];
    if (!id) return res.status(401).json({ message: 'invalid JWT' });
    return res.json({ id, aud: 'authenticated', email: `${id}@example.test`, app_metadata: {}, user_metadata: {} });
  });

  app.post('/rest/v1/rpc/:fn', (req, res) => {
    const handler = options.rpc?.[req.params.fn];
    rpcCalls.push({ fn: req.params.fn, args: req.body ?? {} });
    if (!handler) return res.status(404).json({ code: 'PGRST202', message: `no fake for ${req.params.fn}` });
    return res.json(handler(req.body ?? {}, tables) ?? null);
  });

  const matching = (table: string, query: URLSearchParams) => {
    const { filters, limit, offset, order } = filtersFrom(query);
    let rows = (tables[table] ?? []).filter(row => filters.every(f => f(row)));
    // Single-column ordering (`column.asc|desc`), compared as strings like the other filters.
    const [orderColumn, direction] = order ? order.split('.') : [];
    if (orderColumn) {
      const sign = direction === 'desc' ? -1 : 1;
      rows = [...rows].sort((a, b) => sign * (String(a[orderColumn] ?? '') < String(b[orderColumn] ?? '') ? -1 : String(a[orderColumn] ?? '') > String(b[orderColumn] ?? '') ? 1 : 0));
    }
    rows = rows.slice(offset);
    return limit === null ? rows : rows.slice(0, limit);
  };

  app.get('/rest/v1/:table', (req, res) => {
    if (options.missingTables?.includes(req.params.table)) {
      return res.status(404).json({ code: 'PGRST205', message: `Could not find the table 'public.${req.params.table}' in the schema cache` });
    }
    const select = (new URL(req.originalUrl, 'http://fake').searchParams.get('select') ?? '').split(',');
    const unknown = (options.rejectColumns?.[req.params.table] ?? []).find(column => select.includes(column));
    if (unknown) return res.status(400).json({ code: '42703', message: `column ${req.params.table}.${unknown} does not exist` });
    const rows = matching(req.params.table, new URL(req.originalUrl, 'http://fake').searchParams);
    if ((req.get('accept') ?? '').includes('vnd.pgrst.object')) {
      if (rows.length !== 1) return res.status(406).json({ code: 'PGRST116', message: `${rows.length} rows` });
      return res.set('Content-Type', 'application/vnd.pgrst.object+json').json(rows[0]);
    }
    return res.json(rows);
  });

  app.post('/rest/v1/:table', (req, res) => {
    const failure = options.failWrites?.[req.params.table];
    if (failure === 'missing') {
      return res.status(404).json({ code: 'PGRST205', message: `Could not find the table 'public.${req.params.table}' in the schema cache` });
    }
    if (failure === 'error') return res.status(503).json({ code: 'XX000', message: 'fake write failure' });
    const table = (tables[req.params.table] ??= []);
    const incoming: Row[] = Array.isArray(req.body) ? req.body : [req.body];
    const unknown = (options.rejectColumns?.[req.params.table] ?? []).find(column => incoming.some(row => column in row));
    if (unknown) return res.status(400).json({ code: 'PGRST204', message: `Could not find the '${unknown}' column of '${req.params.table}' in the schema cache` });
    const conflict = new URL(req.originalUrl, 'http://fake').searchParams.get('on_conflict');
    const merge = (req.get('prefer') ?? '').includes('merge-duplicates');
    const key = options.uniqueKeys?.[req.params.table];
    for (const row of incoming) {
      if (key && table.some(r => key.every(column => r[column] === row[column]))) {
        return res.status(409).json({ code: '23505', message: 'duplicate key value violates unique constraint' });
      }
      const existing = conflict ? table.find(r => r[conflict] === row[conflict]) : undefined;
      if (existing && merge) Object.assign(existing, row);
      else if (existing) return res.status(409).json({ code: '23505', message: 'duplicate key' });
      else table.push({ ...row });
    }
    return res.status(201).json(incoming);
  });

  app.patch('/rest/v1/:table', (req, res) => {
    const rows = matching(req.params.table, new URL(req.originalUrl, 'http://fake').searchParams);
    for (const row of rows) Object.assign(row, req.body);
    return res.json(rows);
  });

  app.delete('/rest/v1/:table', (req, res) => {
    const doomed = new Set(matching(req.params.table, new URL(req.originalUrl, 'http://fake').searchParams));
    tables[req.params.table] = (tables[req.params.table] ?? []).filter(row => !doomed.has(row));
    return res.json([...doomed]);
  });

  const server = await new Promise<Server>(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  fake.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  fake.close = () => server.close();
  return fake;
}
