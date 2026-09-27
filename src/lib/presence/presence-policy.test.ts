import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  'supabase/migrations/20260925100000_authenticated_account_presence.sql',
  'utf8',
);

describe('Realtime account presence authorization policy', () => {
  it('permits only authenticated Presence reads on the intended account topics', () => {
    expect(migration).toContain('for select\n  to authenticated');
    expect(migration).toContain("extension = 'presence'");
    expect(migration).toContain("realtime.topic() = 'tp:presence:admin'");
    expect(migration).toContain("realtime.topic() = 'tp:presence:student:' || (select auth.uid())::text");
    expect(migration).toContain('(select public.is_admin())');
  });

  it('restricts writes to the Admin topic for Admins or the current Student topic', () => {
    expect(migration).toContain('for insert\n  to authenticated');
    expect(migration).toContain("(realtime.topic() = 'tp:presence:admin' and (select public.is_admin()))");
    expect(migration).toContain("realtime.topic() = 'tp:presence:student:' || (select auth.uid())::text");
    expect(migration).not.toMatch(/to\s+anon\b/i);
  });

  it('adds restrictive boundaries so a future permissive policy cannot enable spoofing', () => {
    expect(migration).toContain('as restrictive\n  for select');
    expect(migration).toContain('as restrictive\n  for insert');
    expect(migration.match(/extension <> 'presence'/g)).toHaveLength(2);
  });
});
