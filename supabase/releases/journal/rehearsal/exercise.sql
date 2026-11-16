-- After the journal migration: two members use it the way the app does
-- (through RLS, as "authenticated"), then the figures are read back.
\set ON_ERROR_STOP 1
set role authenticated;
select set_config('app.current_user_id', 'b0000000-0000-4000-8000-000000000001', false) \g /dev/null
insert into public.journal_trades (trade_date, symbol, direction, risk_reward, result, pnl_amount, pnl_currency, strategy, mistakes, followed_plan)
values (current_date, 'XAUUSD', 'buy', 2, 'profit', 120.50, 'USD', 'Breakout', '{}', true),
       (current_date - 1, 'EURUSD', 'sell', 1, 'loss', -40, 'USD', 'Breakout', '{fomo}', false);
insert into public.journal_trades (trade_date, symbol, direction, risk_reward, result, pnl_amount, pnl_currency, strategy,
                                   screenshot_key, screenshot_mime, screenshot_width, screenshot_height)
values (current_date, 'NIFTY', 'buy', 3, 'breakeven', 0, 'INR', 'Pullback',
        'journal/b0000000-0000-4000-8000-000000000001/1763280000000-00000000-0000-4000-8000-0000000000aa.bin', 'image/png', 1280, 720);
select (public.journal_summary() ->> 'total') as student_one_trades;
select set_config('app.current_user_id', 'b0000000-0000-4000-8000-000000000002', false) \g /dev/null
select (public.journal_summary() ->> 'total') as student_two_sees,
       (select count(*) from public.journal_trades) as student_two_rows;
reset role;
select set_config('app.current_user_id', '', false) \g /dev/null
select count(*) as journal_trades from public.journal_trades;
