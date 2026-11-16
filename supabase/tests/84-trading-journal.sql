-- Trading Journal (20261116090000_trading_journal.sql): who can read and write
-- a trade, what a trade may contain, the screenshot key rules, and the summary.
\pset pager off
set client_min_messages = notice;

create or replace function pg_temp.check(p_ok boolean, p_label text)
returns void language plpgsql as $$
begin
  if coalesce(p_ok, false) then raise notice 'PASS  %', p_label;
  else raise exception 'FAIL: %', p_label; end if;
end $$;

create or replace function pg_temp.must_fail(p_sql text, p_expect text, p_label text)
returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'FAIL: % — the statement was allowed', p_label;
exception when others then
  if sqlerrm like 'FAIL:%' then raise;
  elsif position(p_expect in sqlerrm) > 0 then raise notice 'PASS  % (%)', p_label, left(sqlerrm, 70);
  else raise exception 'FAIL: % — refused for the wrong reason: %', p_label, sqlerrm; end if;
end $$;

-- Fixtures: an admin, two activated students, one not activated.
insert into auth.users (id, email) values
  ('84a00000-0000-4000-8000-000000000001', 'admin84@test.local'),
  ('84b00000-0000-4000-8000-000000000001', 'gita84@test.local'),
  ('84b00000-0000-4000-8000-000000000002', 'hari84@test.local'),
  ('84b00000-0000-4000-8000-000000000003', 'ira84@test.local')
on conflict (id) do nothing;
update public.profiles set role = 'admin', full_name = 'Admin EightyFour' where id = '84a00000-0000-4000-8000-000000000001';
update public.profiles set full_name = 'Gita', activated_at = now() where id = '84b00000-0000-4000-8000-000000000001';
update public.profiles set full_name = 'Hari', activated_at = now() where id = '84b00000-0000-4000-8000-000000000002';
update public.profiles set full_name = 'Ira' where id = '84b00000-0000-4000-8000-000000000003';

create temp table t84(name text primary key, id uuid);
grant all on t84 to authenticated, service_role, anon;

-- ---------------------------------------------------------------------------
-- 1. Logging a trade
-- ---------------------------------------------------------------------------
set role authenticated;
select set_config('app.current_user_id', '84b00000-0000-4000-8000-000000000001', false);

with t as (
  insert into public.journal_trades (trade_date, symbol, direction, risk_reward, result, strategy, notes)
  values ('2026-11-10', 'XAUUSD', 'buy', 2.5, 'profit', 'Breakout retest', 'Waited for the close. Good patience.')
  returning id)
insert into t84 select 'gita1', id from t;
select pg_temp.check((select user_id = '84b00000-0000-4000-8000-000000000001' from public.journal_trades where id = (select id from t84 where name = 'gita1')),
  'a member logs a trade and it is theirs (owner filled in from the session)');

with t as (
  insert into public.journal_trades (trade_date, symbol, direction, risk_reward, result, screenshot_key, screenshot_mime, screenshot_width, screenshot_height)
  values ('2026-11-11', 'EUR/USD', 'sell', 1.5, 'loss',
          'journal/84b00000-0000-4000-8000-000000000001/1763280000000-0f0f0f0f-0000-4000-8000-000000000001.bin', 'image/png', 1600, 900)
  returning id)
insert into t84 select 'gita2', id from t;
select pg_temp.check((select screenshot_key is not null from public.journal_trades where id = (select id from t84 where name = 'gita2')),
  'a trade can carry a screenshot stored under its owner''s own key');
insert into public.journal_trades (trade_date, symbol, direction, risk_reward, result)
values ('2026-11-12', 'NIFTY 50', 'buy', 1, 'breakeven');

select pg_temp.must_fail($$insert into public.journal_trades (user_id, trade_date, symbol, direction, risk_reward, result)
  values ('84b00000-0000-4000-8000-000000000002', '2026-11-10', 'XAUUSD', 'buy', 2, 'profit')$$,
  'row-level security', 'nobody can log a trade in another member''s journal');

-- What a trade may contain.
select pg_temp.must_fail($$insert into public.journal_trades (trade_date, symbol, direction, risk_reward, result) values ('2026-11-10', 'X', 'long', 2, 'profit')$$,
  'journal_trades_direction', 'direction is Buy or Sell only');
select pg_temp.must_fail($$insert into public.journal_trades (trade_date, symbol, direction, risk_reward, result) values ('2026-11-10', 'X', 'buy', 2, 'win')$$,
  'journal_trades_result', 'result is Profit, Loss or Breakeven only');
select pg_temp.must_fail($$insert into public.journal_trades (trade_date, symbol, direction, risk_reward, result) values ('2026-11-10', 'X', 'buy', 0, 'profit')$$,
  'journal_trades_rr_range', 'R:R must be above zero');
select pg_temp.must_fail($$insert into public.journal_trades (trade_date, symbol, direction, risk_reward, result) values ('2026-11-10', 'X', 'buy', -1, 'profit')$$,
  'journal_trades_rr_range', 'R:R cannot be negative');
select pg_temp.must_fail($$insert into public.journal_trades (trade_date, symbol, direction, risk_reward, result) values ('2026-11-10', 'X', 'buy', 1001, 'profit')$$,
  'journal_trades_rr_range', 'R:R has a sane ceiling');
select pg_temp.must_fail($$insert into public.journal_trades (trade_date, symbol, direction, risk_reward, result) values ('2026-11-10', '   ', 'buy', 2, 'profit')$$,
  'journal_trades_symbol_len', 'a symbol is required');
select pg_temp.must_fail($$insert into public.journal_trades (trade_date, symbol, direction, risk_reward, result) values ('2026-11-10', repeat('A', 25), 'buy', 2, 'profit')$$,
  'journal_trades_symbol_len', 'a symbol is at most 24 characters');
select pg_temp.must_fail($$insert into public.journal_trades (trade_date, symbol, direction, risk_reward, result) values ('1999-12-31', 'X', 'buy', 2, 'profit')$$,
  'journal_trades_date_sane', 'the date must be a real trading date');
select pg_temp.must_fail($$insert into public.journal_trades (trade_date, symbol, direction, risk_reward, result, strategy) values ('2026-11-10', 'X', 'buy', 2, 'profit', repeat('s', 81))$$,
  'journal_trades_strategy_len', 'a strategy name is at most 80 characters');
select pg_temp.must_fail($$insert into public.journal_trades (trade_date, symbol, direction, risk_reward, result, notes) values ('2026-11-10', 'X', 'buy', 2, 'profit', repeat('n', 2001))$$,
  'journal_trades_notes_len', 'notes are at most 2000 characters');

-- Money: signed by the result, always with a currency, never mixed.
select pg_temp.must_fail($$insert into public.journal_trades (trade_date, symbol, direction, risk_reward, result, pnl_amount, pnl_currency) values ('2026-11-10', 'X', 'buy', 2, 'profit', -50, 'USD')$$,
  'journal_trades_pnl_sign', 'a profit is a positive amount');
select pg_temp.must_fail($$insert into public.journal_trades (trade_date, symbol, direction, risk_reward, result, pnl_amount, pnl_currency) values ('2026-11-10', 'X', 'buy', 2, 'loss', 50, 'USD')$$,
  'journal_trades_pnl_sign', 'a loss is a negative amount');
select pg_temp.must_fail($$insert into public.journal_trades (trade_date, symbol, direction, risk_reward, result, pnl_amount, pnl_currency) values ('2026-11-10', 'X', 'buy', 2, 'breakeven', 5, 'USD')$$,
  'journal_trades_pnl_sign', 'breakeven is exactly zero');
select pg_temp.must_fail($$insert into public.journal_trades (trade_date, symbol, direction, risk_reward, result, pnl_amount) values ('2026-11-10', 'X', 'buy', 2, 'profit', 50)$$,
  'journal_trades_pnl_pair', 'an amount always has its currency');
select pg_temp.must_fail($$insert into public.journal_trades (trade_date, symbol, direction, risk_reward, result, pnl_amount, pnl_currency) values ('2026-11-10', 'X', 'buy', 2, 'profit', 50, 'DOGE')$$,
  'journal_trades_pnl_currency', 'the currency is one the app offers');
-- Mistakes: known tags only, and "followed my plan" means no mistakes.
select pg_temp.must_fail($$insert into public.journal_trades (trade_date, symbol, direction, risk_reward, result, mistakes) values ('2026-11-10', 'X', 'buy', 2, 'profit', array['bad_luck'])$$,
  'journal_trades_mistakes_known', 'mistake tags come from the app''s list');
select pg_temp.must_fail($$insert into public.journal_trades (trade_date, symbol, direction, risk_reward, result, mistakes, followed_plan) values ('2026-11-10', 'X', 'buy', 2, 'profit', array['fomo'], true)$$,
  'journal_trades_plan_answer', '"followed my plan" cannot come with mistakes');

-- The screenshot key.
select pg_temp.must_fail($$insert into public.journal_trades (trade_date, symbol, direction, risk_reward, result, screenshot_key, screenshot_mime)
  values ('2026-11-10', 'X', 'buy', 2, 'profit', 'journal/84b00000-0000-4000-8000-000000000002/1763280000000-0f0f0f0f-0000-4000-8000-000000000009.bin', 'image/png')$$,
  'journal_trades_screenshot_own', 'a trade cannot point at another member''s screenshot');
select pg_temp.must_fail($$insert into public.journal_trades (trade_date, symbol, direction, risk_reward, result, screenshot_key, screenshot_mime)
  values ('2026-11-10', 'X', 'buy', 2, 'profit', 'journal/84b00000-0000-4000-8000-000000000001/../../chat/x/voice.bin', 'image/png')$$,
  'journal_trades_screenshot_own', 'a path-traversal key is refused');
select pg_temp.must_fail($$insert into public.journal_trades (trade_date, symbol, direction, risk_reward, result, screenshot_key, screenshot_mime)
  values ('2026-11-10', 'X', 'buy', 2, 'profit', 'posts/84b00000-0000-4000-8000-000000000001/1763280000000-0f0f0f0f-0000-4000-8000-000000000009.bin', 'image/png')$$,
  'journal_trades_screenshot_own', 'a key outside the journal namespace is refused');
select pg_temp.must_fail($$insert into public.journal_trades (trade_date, symbol, direction, risk_reward, result, screenshot_key, screenshot_mime)
  values ('2026-11-10', 'X', 'buy', 2, 'profit', 'journal/84b00000-0000-4000-8000-000000000001/1763280000000-0f0f0f0f-0000-4000-8000-000000000003.bin', 'image/gif')$$,
  'journal_trades_screenshot_mime', 'a screenshot is a JPEG, PNG or WebP picture');
select pg_temp.must_fail($$insert into public.journal_trades (trade_date, symbol, direction, risk_reward, result, screenshot_width)
  values ('2026-11-10', 'X', 'buy', 2, 'profit', 800)$$,
  'journal_trades_screenshot_whole', 'screenshot details never exist without the screenshot');
select pg_temp.must_fail($$insert into public.journal_trades (trade_date, symbol, direction, risk_reward, result, screenshot_key, screenshot_mime)
  values ('2026-11-10', 'X', 'buy', 2, 'profit', 'journal/84b00000-0000-4000-8000-000000000001/1763280000000-0f0f0f0f-0000-4000-8000-000000000001.bin', 'image/png')$$,
  'journal_trades_screenshot_key_idx', 'one screenshot belongs to one trade only');

-- ---------------------------------------------------------------------------
-- 2. Editing: still theirs, creation time kept, last change recorded
-- ---------------------------------------------------------------------------
create temp table t84_before as select created_at, updated_at from public.journal_trades where id = (select id from t84 where name = 'gita1');
select pg_sleep(0.01);
update public.journal_trades set result = 'loss', created_at = '2001-01-01' where id = (select id from t84 where name = 'gita1');
select pg_temp.check((select j.result = 'loss' and j.created_at = b.created_at and j.updated_at > b.updated_at
                        from public.journal_trades j, t84_before b where j.id = (select id from t84 where name = 'gita1')),
  'an edit is saved, the creation time cannot be rewritten, and the change time moves');
select pg_temp.must_fail($$update public.journal_trades set user_id = '84b00000-0000-4000-8000-000000000002' where id = (select id from t84 where name = 'gita1')$$,
  'cannot be moved to another member', 'a trade cannot be handed to another member');
reset role;
set role service_role;
select set_config('app.current_user_id', '', false);
select pg_temp.must_fail($$update public.journal_trades set user_id = '84b00000-0000-4000-8000-000000000002' where id = (select id from t84 where name = 'gita1')$$,
  'cannot be moved to another member', 'not even by the server');
reset role;

-- ---------------------------------------------------------------------------
-- 3. Privacy
-- ---------------------------------------------------------------------------
set role authenticated;
select set_config('app.current_user_id', '84b00000-0000-4000-8000-000000000002', false);
select pg_temp.check((select count(*) = 0 from public.journal_trades), 'another member sees none of Gita''s trades');
with changed as (update public.journal_trades set notes = 'hacked' where id = (select id from t84 where name = 'gita1') returning 1)
select pg_temp.check((select count(*) = 0 from changed), 'another member cannot edit them');
with gone as (delete from public.journal_trades where id = (select id from t84 where name = 'gita1') returning 1)
select pg_temp.check((select count(*) = 0 from gone), 'another member cannot delete them');
select pg_temp.check((select (s ->> 'total')::int = 0 and s -> 'average_rr' = 'null'::jsonb and s -> 'pnl' = '[]'::jsonb and s -> 'best_strategy' = 'null'::jsonb
                        from (select public.journal_summary() as s) x), 'another member''s summary is their own: empty, with no invented figures');

-- Not activated: no journal.
select set_config('app.current_user_id', '84b00000-0000-4000-8000-000000000003', false);
select pg_temp.must_fail($$insert into public.journal_trades (trade_date, symbol, direction, risk_reward, result) values ('2026-11-10', 'X', 'buy', 2, 'profit')$$,
  'row-level security', 'a member who is not activated yet cannot log trades');

-- The admin has no access to members' journals through the app either.
select set_config('app.current_user_id', '84a00000-0000-4000-8000-000000000001', false);
select pg_temp.check((select count(*) = 0 from public.journal_trades where user_id = '84b00000-0000-4000-8000-000000000001'), 'the admin cannot read a member''s journal');
with changed as (update public.journal_trades set notes = 'edited by admin' where id = (select id from t84 where name = 'gita1') returning 1)
select pg_temp.check((select count(*) = 0 from changed), 'the admin cannot edit a member''s trade');
with gone as (delete from public.journal_trades where id = (select id from t84 where name = 'gita1') returning 1)
select pg_temp.check((select count(*) = 0 from gone), 'the admin cannot delete a member''s trade');
select pg_temp.check((select (journal_summary() ->> 'total')::int = 0), 'the admin''s summary counts only the admin''s own trades');
reset role;

-- Signed out: nothing at all.
set role anon;
select set_config('app.current_user_id', '', false);
select pg_temp.must_fail($$select count(*) from public.journal_trades$$, 'permission denied', 'a signed-out visitor cannot read the journal');
select pg_temp.must_fail($$select public.journal_summary()$$, 'permission denied', 'a signed-out visitor cannot call the summary');
reset role;

-- ---------------------------------------------------------------------------
-- 4. The summary, over the owner's real trades
-- ---------------------------------------------------------------------------
set role authenticated;
select set_config('app.current_user_id', '84b00000-0000-4000-8000-000000000001', false);
-- Gita now has: XAUUSD loss (edited) 2.5, EUR/USD loss 1.5, NIFTY 50 breakeven 1.
select pg_temp.check((select (s->>'total')::int = 3 and (s->>'wins')::int = 0 and (s->>'losses')::int = 2 and (s->>'breakevens')::int = 1
                             and (s->>'average_rr')::numeric = 1.67 and s->'best_strategy' = 'null'::jsonb
                        from (select public.journal_summary() as s) x),
  'three trades: 0 W, 2 L, 1 BE, average R:R 1.67; one strategy with a single trade is not enough to name a best');

-- More trades, with money, strategies and mistakes, so every figure is exercised.
insert into public.journal_trades (trade_date, symbol, direction, risk_reward, result, pnl_amount, pnl_currency, strategy, mistakes, followed_plan) values
  ('2026-11-13', 'xauusd', 'buy', 2,   'profit',  210,   'USD', 'EMA Crossover', '{}', true),
  ('2026-11-13', 'XAUUSD', 'buy', 3,   'profit',  360,   'USD', 'ema crossover', '{}', true),
  ('2026-11-14', 'XAUUSD', 'sell', 2,  'loss',   -120,   'USD', 'EMA Crossover', array['fomo', 'early_entry'], false),
  ('2026-11-14', 'GBPUSD', 'sell', 1.5,'profit',  2500,  'INR', 'Breakout',      array['fomo'], false),
  ('2026-11-15', 'GBPUSD', 'buy', 1,   'breakeven', 0,   'INR', 'Breakout',      '{}', null),
  ('2026-11-15', 'BTCUSD', 'buy', 2,   'loss',   -800,   'INR', 'Breakout',      array['overtrading'], null);
select pg_temp.check((select (s->>'total')::int = 9 and (s->>'wins')::int = 3 and (s->>'losses')::int = 4 and (s->>'breakevens')::int = 2
                        from (select public.journal_summary() as s) x),
  'counts follow every new trade (9 trades: 3 W, 4 L, 2 BE)');
select pg_temp.check((select s->'pnl' = '[{"currency": "INR", "total": 1700.00, "trades": 3}, {"currency": "USD", "total": 450.00, "trades": 3}]'::jsonb
                        from (select public.journal_summary() as s) x),
  'net P&L is one total per currency (INR 2500 + 0 - 800 = 1700; USD 210 + 360 - 120 = 450), never added together');
select pg_temp.check((select s->'best_strategy' = '{"name": "EMA Crossover", "trades": 3, "wins": 2}'::jsonb
                        from (select public.journal_summary() as s) x),
  'best strategy: EMA Crossover (2 of 3 profitable) beats Breakout (1 of 3); spellings grouped, the usual one shown');
select pg_temp.check((select s->'top_symbol' = '{"symbol": "XAUUSD", "trades": 4}'::jsonb from (select public.journal_summary() as s) x),
  'most traded symbol: XAUUSD, 4 trades (case-insensitive)');
select pg_temp.check((select s->'top_mistake' = '{"tag": "fomo", "times": 2}'::jsonb from (select public.journal_summary() as s) x),
  'top mistake: FOMO, recorded twice');
select pg_temp.check((select s->'discipline' = '{"answered": 5, "followed": 2}'::jsonb from (select public.journal_summary() as s) x),
  'discipline counts only trades where the member answered (5), and how many followed the plan (2)');

-- ---------------------------------------------------------------------------
-- 5. Deleting your own trade
-- ---------------------------------------------------------------------------
with gone as (delete from public.journal_trades where id = (select id from t84 where name = 'gita2') returning 1)
select pg_temp.check((select count(*) = 1 from gone), 'a member deletes their own trade');
select pg_temp.check((select (journal_summary() ->> 'total')::int = 8), 'and the summary follows');
reset role;
