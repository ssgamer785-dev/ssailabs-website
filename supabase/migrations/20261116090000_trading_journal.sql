-- ============================================================================
-- Trading Journal — each member's own private record of their trades.
--
-- ADDITIVE. One new table, one new trigger function and one new read-only
-- summary function. No existing table, row, policy, trigger or function is
-- touched, so every screen that exists today behaves exactly as before, and the
-- app shipped before this file keeps working.
--
-- Privacy
--   A journal is private to its owner: only they can read, add, change or
--   delete their trades (RLS). Not other members, not signed-out visitors, and
--   not the admin through the app. The server (service role) touches a journal
--   only to sign or delete its owner's own screenshot, or to remove the journal
--   of a member the admin deleted.
--
-- The screenshot
--   Stored in R2 like every other picture in the app, under a key the server
--   builds from the verified caller id: journal/<owner>/<millis>-<uuid>.bin
--   (server/journal-media.ts). A row may only name a key in its own owner's
--   namespace (CHECK below), so nobody can attach, or later get signed,
--   another member's object; one object belongs to at most one trade.
--
-- Money
--   pnl_amount is the result in money, signed: positive for a profit, negative
--   for a loss, zero for breakeven (CHECK below), always with its currency.
--   Totals are kept per currency; nothing ever adds two currencies together.
--
-- Rollback: supabase/rollbacks/20261116090000_trading_journal.rollback.sql
-- ============================================================================

create table if not exists public.journal_trades (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  trade_date         date not null,
  symbol             text not null,
  direction          text not null,
  -- The reward for one unit of risk: 2.5 means 1:2.5.
  risk_reward        numeric(7, 2) not null,
  result             text not null,
  pnl_amount         numeric(14, 2),
  pnl_currency       text,
  strategy           text,
  -- Tags from a fixed list (the app's "Mistakes" chips), so the most common one can be counted.
  mistakes           text[] not null default '{}',
  -- The member's own answer: true = no mistakes, followed the plan; false = made mistakes; null = not answered.
  followed_plan      boolean,
  notes              text,
  screenshot_key     text,
  screenshot_mime    text,
  screenshot_width   integer,
  screenshot_height  integer,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint journal_trades_date_sane      check (trade_date between date '2000-01-01' and date '2100-12-31'),
  constraint journal_trades_symbol_len     check (char_length(symbol) between 1 and 24 and symbol = btrim(symbol)),
  constraint journal_trades_direction      check (direction in ('buy', 'sell')),
  constraint journal_trades_rr_range       check (risk_reward > 0 and risk_reward <= 1000),
  constraint journal_trades_result         check (result in ('profit', 'loss', 'breakeven')),
  constraint journal_trades_pnl_pair       check ((pnl_amount is null) = (pnl_currency is null)),
  constraint journal_trades_pnl_currency   check (pnl_currency is null or pnl_currency in ('USD', 'INR', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'AED', 'USDT')),
  constraint journal_trades_pnl_sign       check (
    pnl_amount is null
    or (result = 'profit' and pnl_amount > 0)
    or (result = 'loss' and pnl_amount < 0)
    or (result = 'breakeven' and pnl_amount = 0)
  ),
  constraint journal_trades_pnl_range      check (pnl_amount is null or abs(pnl_amount) < 1000000000000),
  constraint journal_trades_strategy_len   check (strategy is null or (char_length(strategy) between 1 and 80 and strategy = btrim(strategy))),
  constraint journal_trades_mistakes_known check (
    cardinality(mistakes) <= 14
    and mistakes <@ array['early_entry', 'late_entry', 'no_confirmation', 'overtrading', 'fomo', 'revenge_trade',
                          'moved_stop_loss', 'no_stop_loss', 'exited_early', 'held_too_long', 'oversized_position',
                          'ignored_plan', 'emotional', 'other']::text[]
  ),
  constraint journal_trades_plan_answer    check (followed_plan is distinct from true or cardinality(mistakes) = 0),
  constraint journal_trades_notes_len      check (notes is null or char_length(notes) between 1 and 2000),
  -- Only a key the server minted for THIS row's owner.
  constraint journal_trades_screenshot_own check (
    screenshot_key is null
    or screenshot_key ~ ('^journal/' || user_id::text || '/[0-9]{13}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.bin$')
  ),
  constraint journal_trades_screenshot_mime check (screenshot_mime is null or screenshot_mime in ('image/jpeg', 'image/png', 'image/webp')),
  constraint journal_trades_screenshot_size check (
    (screenshot_width is null or screenshot_width between 1 and 20000)
    and (screenshot_height is null or screenshot_height between 1 and 20000)
  ),
  -- A screenshot's details only exist alongside the screenshot.
  constraint journal_trades_screenshot_whole check (
    screenshot_key is not null or (screenshot_mime is null and screenshot_width is null and screenshot_height is null)
  )
);

comment on table public.journal_trades is
  'Trading Journal: one row per trade a member logs. Private to its owner (RLS). Screenshot objects live in R2 under journal/<owner>/.';

-- The journal screen: a member's trades, newest trade date first, optionally within dates and by result.
create index if not exists journal_trades_owner_date_idx on public.journal_trades (user_id, trade_date desc, created_at desc);
-- One object, one trade: deleting a trade can never take another trade's picture with it.
create unique index if not exists journal_trades_screenshot_key_idx on public.journal_trades (screenshot_key) where screenshot_key is not null;

-- ----------------------------------------------------------------------------
-- Row rules: the owner, and only the owner
-- ----------------------------------------------------------------------------

alter table public.journal_trades enable row level security;

drop policy if exists journal_trades_select_own on public.journal_trades;
create policy journal_trades_select_own on public.journal_trades
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists journal_trades_insert_own on public.journal_trades;
create policy journal_trades_insert_own on public.journal_trades
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_activated());

drop policy if exists journal_trades_update_own on public.journal_trades;
create policy journal_trades_update_own on public.journal_trades
  for update to authenticated
  using (user_id = auth.uid() and public.is_activated())
  with check (user_id = auth.uid());

drop policy if exists journal_trades_delete_own on public.journal_trades;
create policy journal_trades_delete_own on public.journal_trades
  for delete to authenticated
  using (user_id = auth.uid());

-- Start from nothing, whatever the project's default privileges are.
revoke all on public.journal_trades from public, anon, authenticated;
grant select, insert, update, delete on public.journal_trades to authenticated;
grant all on public.journal_trades to service_role;

-- A trade stays its owner's, keeps its creation time, and records when it last changed.
create or replace function public.guard_journal_trade()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'A trade cannot be moved to another member' using errcode = '42501';
  end if;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists journal_trades_guard on public.journal_trades;
create trigger journal_trades_guard
  before update on public.journal_trades
  for each row execute function public.guard_journal_trade();

-- ----------------------------------------------------------------------------
-- The figures on the journal screen, over ALL of the caller's own trades (the
-- list itself is paged and filtered). Runs as the caller, so RLS applies, and
-- filters to the caller's own rows explicitly as well. Every figure is a plain
-- count or average of what the member recorded; nothing is estimated.
--
--   total, wins, losses, breakevens   counts by recorded result
--   average_rr                        mean of the recorded R:R (the reward per 1 of risk)
--   pnl                               [{currency, total, trades}] — one total per currency
--   best_strategy                     highest share of Profit results among strategies
--                                     with at least 3 trades (then more trades, then name);
--                                     strategies grouped case-insensitively
--   top_symbol                        the symbol logged most often (then most recent)
--   top_mistake                       the mistake tag recorded most often (then name)
--   discipline                        {answered, followed}: trades where the member said
--                                     whether they followed their plan, and how many they did
-- ----------------------------------------------------------------------------

create or replace function public.journal_summary()
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  with mine as (
    select * from public.journal_trades where user_id = auth.uid()
  ),
  totals as (
    select count(*) as total,
           count(*) filter (where result = 'profit') as wins,
           count(*) filter (where result = 'loss') as losses,
           count(*) filter (where result = 'breakeven') as breakevens,
           round(avg(risk_reward), 2) as average_rr,
           count(*) filter (where followed_plan is not null or cardinality(mistakes) > 0) as answered,
           count(*) filter (where followed_plan) as followed
      from mine
  ),
  pnl as (
    select coalesce(jsonb_agg(jsonb_build_object('currency', pnl_currency, 'total', total, 'trades', trades)
                              order by trades desc, pnl_currency), '[]'::jsonb) as list
      from (select pnl_currency, sum(pnl_amount) as total, count(*) as trades
              from mine where pnl_currency is not null group by pnl_currency) p
  ),
  strategies as (
    select lower(strategy) as name_key,
           mode() within group (order by strategy) as name,
           count(*) as trades,
           count(*) filter (where result = 'profit') as wins
      from mine where strategy is not null
     group by lower(strategy)
  ),
  best as (
    select jsonb_build_object('name', name, 'trades', trades, 'wins', wins) as value
      from strategies where trades >= 3
     order by wins::numeric / trades desc, trades desc, name_key
     limit 1
  ),
  symbols as (
    select jsonb_build_object('symbol', upper(symbol), 'trades', count(*)) as value
      from mine group by upper(symbol)
     order by count(*) desc, max(trade_date) desc, upper(symbol)
     limit 1
  ),
  mistake as (
    select jsonb_build_object('tag', tag, 'times', count(*)) as value
      from mine, unnest(mistakes) as tag
     group by tag
     order by count(*) desc, tag
     limit 1
  )
  select jsonb_build_object(
    'total', t.total, 'wins', t.wins, 'losses', t.losses, 'breakevens', t.breakevens,
    'average_rr', t.average_rr,
    'pnl', (select list from pnl),
    'best_strategy', (select value from best),
    'top_symbol', (select value from symbols),
    'top_mistake', (select value from mistake),
    'discipline', jsonb_build_object('answered', t.answered, 'followed', t.followed)
  )
  from totals t;
$$;

revoke all on function public.journal_summary() from public, anon;
grant execute on function public.journal_summary() to authenticated, service_role;

notify pgrst, 'reload schema';
