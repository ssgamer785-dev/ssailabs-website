import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The guard that would have caught the restore failure.
 *
 * `restore_backup` cleared the business tables with nine bare statements —
 * `delete from public.measurement_values;` and eight more. Every local test
 * passed, because a plain PostgreSQL cluster is happy to run them. Supabase is
 * not: it preloads pg_safeupdate for the role PostgREST connects as, which
 * rejects a DELETE or an UPDATE with no WHERE clause even inside a function
 * body. The showroom got
 *
 *     Failed to restore backup: Could not restore the backup:
 *     DELETE requires a WHERE clause
 *
 * and no way to import their own data.
 *
 * A behavioural test could not catch this without the extension installed, so
 * the check is on the SQL text itself: no migration may contain an unqualified
 * DELETE or UPDATE. Clearing a whole table is still allowed — through TRUNCATE,
 * which names its tables and cannot be mistaken for a statement that meant to
 * have a filter.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const MIGRATIONS = resolve(ROOT, 'supabase/migrations');
const FILES = readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort();
const textOf = (f: string): string => readFileSync(resolve(MIGRATIONS, f), 'utf8');

/** Comments and string literals removed, so a WHERE inside either cannot make
 *  a statement look filtered. */
const declutter = (sql: string): string =>
  sql.replace(/--[^\n]*/g, ' ')
     .replace(/\/\*[\s\S]*?\*\//g, ' ')
     .replace(/'(?:[^']|'')*'/g, "''");

const statementsOf = (sql: string): string[] =>
  declutter(sql).split(';').map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);

const unqualified = (sql: string): string[] =>
  statementsOf(sql).filter(s =>
    (/^delete\s+from\s/i.test(s) || /^update\s+(?:only\s+)?[a-z_."]+\s+set\s/i.test(s)) &&
    !/\swhere\s/i.test(s));

/**
 * The body each function actually has once every migration has been applied.
 *
 * `create or replace` means the last definition in filename order wins, so
 * that is the code the live database runs — and the only code worth asserting
 * on. Historical migrations keep whatever they were written with; they are
 * already applied and must not be edited.
 */
function effectiveFunctionBodies(): Map<string, { file: string; body: string }> {
  const out = new Map<string, { file: string; body: string }>();
  for (const file of FILES) {
    const sql = textOf(file);
    const re = /create\s+or\s+replace\s+function\s+(public\.[a-z_]+)\s*\([\s\S]*?\)[\s\S]*?\bas\s+\$\$([\s\S]*?)\$\$/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql)) !== null) out.set(m[1].toLowerCase(), { file, body: m[2] });
  }
  return out;
}

/** Everything a migration runs directly, with function bodies taken out. */
const outsideFunctionBodies = (sql: string): string => sql.replace(/\$\$[\s\S]*?\$\$/g, ' $$BODY$$ ');

describe('the SQL the live database ends up running has no unqualified DELETE or UPDATE', () => {
  const bodies = effectiveFunctionBodies();

  it('there are functions to check', () => {
    expect(bodies.size).toBeGreaterThan(5);
    expect([...bodies.keys()]).toContain('public.restore_backup');
    expect([...bodies.keys()]).toContain('public.purge_trash_entry');
  });

  for (const [name, { file, body }] of effectiveFunctionBodies()) {
    it(`${name} (last defined in ${file})`, () => {
      const offenders = unqualified(body);
      expect(offenders,
        `pg_safeupdate rejects these on Supabase:\n  ${offenders.join('\n  ')}`).toEqual([]);
    });
  }

  it('and neither does anything a migration runs directly', () => {
    for (const file of FILES) {
      const offenders = unqualified(outsideFunctionBodies(textOf(file)));
      expect(offenders, `${file} runs an unqualified statement at apply time`).toEqual([]);
    }
  });
});

describe('the two historical migrations are superseded, not edited', () => {
  /**
   * `20260827000003_backup_restore.sql` and `20260831000000_backup_settings_and_audit.sql`
   * still contain the nine bare DELETEs. They are already applied to the live
   * project, so they stay exactly as they were shipped; the migration that
   * follows them replaces the function body, and a fresh database applying all
   * of them in order lands on the same corrected definition.
   */
  const SUPERSEDED = [
    '20260827000003_backup_restore.sql',
    '20260831000000_backup_settings_and_audit.sql'
  ];

  it('both still define restore_backup with the old bare DELETEs', () => {
    for (const f of SUPERSEDED) {
      expect(textOf(f)).toContain('create or replace function public.restore_backup');
      expect(unqualified(textOf(f)).length).toBeGreaterThan(0);
    }
  });

  it('a later migration redefines it, so the last word is the corrected body', () => {
    const last = [...effectiveFunctionBodies().entries()]
      .find(([n]) => n === 'public.restore_backup')![1];
    expect(SUPERSEDED).not.toContain(last.file);
    expect(last.file > SUPERSEDED[1]).toBe(true);
    expect(unqualified(last.body)).toEqual([]);
  });

  it('no migration newer than those two carries an unqualified statement', () => {
    for (const f of FILES.filter(f => f > SUPERSEDED[1])) {
      expect(unqualified(textOf(f)), `${f}`).toEqual([]);
    }
  });
});

describe('the restore clears exactly the tables it replaces', () => {
  const latest = readFileSync(resolve(MIGRATIONS, '20260906000000_purge_and_restore_safety.sql'), 'utf8');

  it('uses a named TRUNCATE rather than a filter that means "everything"', () => {
    expect(latest).toMatch(/truncate table\s+public\.measurement_values,/i);
    // A `where true` would satisfy pg_safeupdate while saying nothing about scope.
    expect(latest.toLowerCase()).not.toContain('where true');
  });

  it('names every table the payload replaces, and no others', () => {
    const block = latest.slice(latest.indexOf('truncate table'));
    const truncated = block.slice(0, block.indexOf(';'))
      .replace(/truncate table/i, '')
      .split(',').map(t => t.trim()).filter(Boolean);
    expect(truncated.sort()).toEqual([
      'public.customers', 'public.expenses', 'public.fittings',
      'public.measurement_values', 'public.measurements', 'public.order_items',
      'public.order_payments', 'public.orders', 'public.workers'
    ]);
  });

  it('does not clear the audit log, the snapshots, the staff list or the showroom settings', () => {
    const block = latest.slice(latest.indexOf('truncate table'));
    const stmt = block.slice(0, block.indexOf(';')).toLowerCase();
    for (const t of ['audit_log', 'backup_snapshots', 'staff_profiles', 'showroom_settings']) {
      expect(stmt, `${t} must not be truncated by a restore`).not.toContain(t);
    }
  });

  it('does not use CASCADE, so a new referencing table fails loudly instead of being emptied', () => {
    const block = latest.slice(latest.indexOf('truncate table'));
    expect(block.slice(0, block.indexOf(';')).toLowerCase()).not.toContain('cascade');
  });
});

describe('permanent deletion is a database function, not a browser DELETE', () => {
  const repo = readFileSync(resolve(ROOT, 'src/data/supabaseRepository.ts'), 'utf8');
  const latest = readFileSync(resolve(MIGRATIONS, '20260906000000_purge_and_restore_safety.sql'), 'utf8');

  it('the client calls the RPC and never deletes a business table directly', () => {
    expect(repo).toContain("db.rpc('purge_trash_entry'");
    // The statement that produced orders_customer_id_fkey in production.
    expect(repo).not.toMatch(/from\(table\)\.delete\(\)/);
  });

  it('the client passes a label, never a table name', () => {
    expect(repo).toContain('p_entity_type: entityType');
    expect(repo).not.toMatch(/p_entity_type:\s*table/);
  });

  it('the function checks authorisation itself and pins its search_path', () => {
    const fn = latest.slice(latest.indexOf('function public.purge_trash_entry'));
    expect(fn).toContain('security definer');
    expect(fn).toContain('set search_path = public, pg_temp');
    expect(fn).toContain('if not public.is_authorized_admin() then');
  });

  it('the entity type is an allow-list, and there is no dynamic SQL', () => {
    const fn = latest.slice(latest.indexOf('function public.purge_trash_entry'),
                            latest.indexOf('revoke all on function public.purge_trash_entry'));
    expect(fn).toContain("not in ('Customer', 'Order', 'Measurement', 'Worker')");
    expect(fn).not.toMatch(/\bexecute format\b/i);
    expect(fn).not.toMatch(/\bexecute\s+'/i);
  });

  it('only trashed records can be purged', () => {
    const fn = latest.slice(latest.indexOf('function public.purge_trash_entry'),
                            latest.indexOf('revoke all on function public.purge_trash_entry'));
    expect((fn.match(/deleted_at is not null/g) || []).length).toBeGreaterThanOrEqual(8);
  });

  it('purging an order never deletes its customer', () => {
    const fn = latest.slice(latest.indexOf("elsif p_entity_type = 'Order'"),
                            latest.indexOf("elsif p_entity_type = 'Measurement'"));
    expect(fn).not.toMatch(/delete from public\.customers/);
    // The measurement profile belongs to the customer: untagged, not deleted.
    expect(fn).toContain('set last_order_id = null');
    expect(fn).not.toMatch(/delete from public\.measurements/);
  });

  it('purging a measurement never deletes the customer or the order', () => {
    const fn = latest.slice(latest.indexOf("elsif p_entity_type = 'Measurement'"),
                            latest.indexOf('    -- ------------------------------------------------------------------ worker'));
    expect(fn).not.toMatch(/delete from public\.customers/);
    expect(fn).not.toMatch(/delete from public\.orders/);
  });

  it('the function is not executable by anon', () => {
    expect(latest).toContain('revoke all on function public.purge_trash_entry(text, uuid) from public, anon');
    expect(latest).toContain('grant execute on function public.purge_trash_entry(text, uuid) to authenticated');
  });
});
