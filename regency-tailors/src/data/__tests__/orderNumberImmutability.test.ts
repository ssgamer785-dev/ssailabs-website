import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { orderToWizardRow } from '../mappers';
import { Order } from '../../types';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (rel: string): string => readFileSync(resolve(ROOT, rel), 'utf8');

/**
 * The order number is the customer-facing identity printed on the bill and the
 * workshop slip, and it belongs to the database.
 *
 * `orders.order_number` defaults to `nextval(order_number_seq)`, so an insert
 * that does not mention the column gets the next number and two counter hands
 * saving at once cannot collide. That guarantee survives only while the client
 * stays out of it: the moment a row carries an order_number, an edit can
 * rewrite the number on a bill the customer is already holding, and an insert
 * can hand out one that is already in use.
 *
 * These hold the client to sending nothing.
 */

const order = (over: Partial<Order> = {}): Order =>
  ({
    id: '17',
    orderNumber: '17',
    customerId: '00000000-0000-4000-8000-000000000001',
    customerName: 'Vikram Malhotra',
    customerPhone: '9876500001',
    items: [],
    orderDate: '2026-09-01',
    trialDate: '',
    deliveryDate: '2026-09-15',
    status: 'New',
    productionStatus: 'New',
    ...over
  }) as Order;

describe('the client never sends an order number', () => {
  const row = orderToWizardRow(order(), '00000000-0000-4000-8000-000000000001');

  it('the row written for a new order carries no order_number', () => {
    expect(Object.keys(row)).not.toContain('order_number');
  });

  it('nor any other spelling of it', () => {
    const suspicious = Object.keys(row).filter(k => /order_?num|orderNumber|\bnumber\b/i.test(k));
    expect(suspicious, `unexpected: ${suspicious.join(', ')}`).toEqual([]);
  });

  it('the same row is used for an edit, so an edit cannot rewrite the number', () => {
    // The repository sends these columns for both paths — insert when there is
    // no dbId, update when there is. Since the number is absent from the row,
    // an edit is an UPDATE that does not mention the column at all.
    const edited = orderToWizardRow(
      order({ customerName: 'Renamed', deliveryDate: '2026-10-01', productionStatus: 'Ready' }),
      '00000000-0000-4000-8000-000000000001'
    );
    expect(Object.keys(edited)).not.toContain('order_number');
    expect(Object.keys(edited).sort()).toEqual(Object.keys(row).sort());
  });

  it('and the repository routes an edit to UPDATE on the same row', () => {
    const repo = read('src/data/supabaseRepository.ts');
    const save = repo.slice(repo.indexOf('const wizardColumns = orderToWizardRow'));
    // dbId present -> update that row; absent -> insert and let the sequence
    // assign. Anything else would create a second order on every edit.
    expect(save).toMatch(/if \(orderDbId\)[\s\S]{0,200}\.update\(wizardColumns\)\.eq\('id', orderDbId\)/);
    expect(save).toContain('order_number comes from the database sequence, never from the client');
  });
});

describe('the database owns the sequence', () => {
  const schema = read('supabase/migrations/20260827000000_schema.sql');

  it('order_number defaults to the sequence and is unique', () => {
    expect(schema).toContain("order_number          bigint not null unique default nextval('public.order_number_seq')");
  });

  it('the sequence starts at 1', () => {
    expect(schema).toContain('create sequence if not exists public.order_number_seq as bigint start with 1');
  });

  it('the reset returns it to 1 unused, so the next order is #1', () => {
    const reset = read('supabase/migrations/20260909000000_reset_showroom_data.sql');
    expect(reset).toContain("setval('public.order_number_seq', 1, false)");
  });
});

describe('the reset refuses anyone it should', () => {
  const reset = read('supabase/migrations/20260909000000_reset_showroom_data.sql');

  it('checks the admin inside the function, not in the caller', () => {
    expect(reset).toContain('if not public.is_authorized_admin() then');
    expect(reset).toContain("errcode = '42501'");
  });

  it('requires the confirmation phrase exactly', () => {
    expect(reset).toContain("p_confirmation is distinct from 'RESET ALL DATA'");
  });

  it('is not reachable by an unauthenticated caller', () => {
    expect(reset).toContain('revoke all on function public.reset_showroom_data(text) from public, anon');
    expect(reset).toContain('grant execute on function public.reset_showroom_data(text) to authenticated');
  });

  it('takes no table name and builds no SQL from its argument', () => {
    // The function body only — `grant execute on function` is a privilege,
    // not dynamic SQL, and matching the whole file would flag it.
    const body = reset.slice(reset.indexOf('as $$'), reset.indexOf('$$;'));
    expect(body).not.toMatch(/execute\s+format|execute\s+'|execute\s+\w+\s*;/i);
    expect(body.match(/\bexecute\b/gi) || []).toEqual([]);
    // Its one argument is compared to a literal, never interpolated anywhere.
    expect(body).toContain("p_confirmation is distinct from 'RESET ALL DATA'");
  });

  it('keeps the admin allowlist, the settings and the sign-in', () => {
    for (const kept of ['staff_profiles', 'showroom_settings', 'auth.users']) {
      expect(reset).not.toMatch(new RegExp(`delete\\s+from\\s+(public\\.)?${kept.replace('.', '\\.')}`, 'i'));
    }
  });
});
