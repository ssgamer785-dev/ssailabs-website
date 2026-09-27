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
  close: () => void;
}

type Filter = (row: Row) => boolean;

function parseList(raw: string): string[] {
  return raw.replace(/^\(|\)$/g, '').split(',').map(v => v.trim().replace(/^"|"$/g, ''));
}

function filtersFrom(query: URLSearchParams): { filters: Filter[]; limit: number | null } {
  const filters: Filter[] = [];
  let limit: number | null = null;
  for (const [column, raw] of query) {
    if (['select', 'order', 'offset', 'on_conflict', 'columns'].includes(column)) continue;
    if (column === 'limit') { limit = Number(raw); continue; }
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
  return { filters, limit };
}

export async function startFakeSupabase(options: {
  /** Bearer token → user id. */
  tokens: Record<string, string>;
  tables?: Record<string, Row[]>;
  rpc?: Record<string, (args: Record<string, unknown>, tables: Record<string, Row[]>) => unknown>;
  /** Tables whose writes fail: 'missing' answers as PostgREST does for an unknown table. */
  failWrites?: Record<string, 'missing' | 'error'>;
  /** Composite primary/unique keys to enforce on insert (answered as Postgres does: 23505). */
  uniqueKeys?: Record<string, string[]>;
}): Promise<FakeSupabase> {
  const tables: Record<string, Row[]> = options.tables ?? {};
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/auth/v1/user', (req, res) => {
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
    const { filters, limit } = filtersFrom(query);
    const rows = (tables[table] ?? []).filter(row => filters.every(f => f(row)));
    return limit === null ? rows : rows.slice(0, limit);
  };

  app.get('/rest/v1/:table', (req, res) => {
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
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    tables,
    rpcCalls,
    close: () => server.close(),
  };
}
