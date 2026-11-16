#!/usr/bin/env bash
# Trading Journal database rehearsal on a throwaway LOCAL Postgres 16 (never
# Production): the migration chain up to RC6, seeded like Production today, then
# preflight -> apply while profiles is being written (must time out, changing
# nothing) -> apply -> verify -> re-apply -> rollback -> re-apply -> members use
# it -> rollback (trades kept) -> re-apply (trades still there).
#
# Usage:  supabase/releases/journal/rehearsal/rehearse.sh [PGHOST] [PGPORT]
# Needs:  a Postgres 16 server you can create databases on as postgres (trust auth),
#         as for supabase/tests/run.sh.
set -uo pipefail
export PGOPTIONS="-c client_min_messages=warning"
HERE="$(cd "$(dirname "$0")" && pwd)"
WT="$(cd "$HERE/../../../.." && pwd)"; HOST="${1:-/tmp}"; PORT="${2:-55432}"; DB=journal_rehearsal_$$
REL=$WT/supabase/releases/journal; RB=$WT/supabase/rollbacks/20261116090000_trading_journal.rollback.sql
RC6=$WT/supabase/releases/rc6/rehearsal
P=(psql -X -h $HOST -p $PORT -U postgres -v ON_ERROR_STOP=1)
OUT=$(mktemp -d); trap '"${P[@]}" -q -c "drop database if exists $DB" >/dev/null 2>&1; rm -rf "$OUT"' EXIT
fails=0; ok() { echo "PASS $1"; }; bad() { echo "FAIL $1"; fails=$((fails+1)); }
ro() { "${P[@]}" -d $DB -A -F '|' -P footer=off -q -c 'begin transaction read only' -f "$1" -c 'rollback' 2>&1; }
col() { grep -E "^$2\|" "$1" | cut -d'|' -f3; }
res() { grep -E "^$2\|" "$1" | cut -d'|' -f2; }
FPS="fp_functions fp_policies fp_triggers fp_columns fp_table_grants fp_indexes"

"${P[@]}" -q -c "create database $DB"
"${P[@]}" -d $DB -q -f $WT/supabase/tests/00-supabase-shim.sql 2>/dev/null
for m in $WT/supabase/migrations/*.sql; do
  case $(basename $m) in 20261116090000_*) continue;; esac
  "${P[@]}" -d $DB -q -f $m 2>&1 | grep -vE 'wal_level|^HINT' ; done
"${P[@]}" -d $DB -q -c "grant select on auth.users to authenticated, service_role;"
{ "${P[@]}" -d $DB -q -f "$RC6/seed.sql" && "${P[@]}" -d $DB -q -f "$RC6/exercise.sql"; } > $OUT/seed.txt 2>&1 \
  && ok "seeded a Production-like database (chain to RC6; admin, 3 students, one deleted; polls, votes, chat with a reply, devices)" || { bad seed; cat $OUT/seed.txt; }

# 1. preflight
ro $REL/preflight.sql > $OUT/1-preflight.txt
grep -q '|STOP|' $OUT/1-preflight.txt && { bad "preflight has STOP rows"; cat $OUT/1-preflight.txt; } || ok "preflight: no STOP rows ($(grep -c '|OK|' $OUT/1-preflight.txt) OK)"
grep -qiE 'ERROR' $OUT/1-preflight.txt && { bad "preflight errored"; cat $OUT/1-preflight.txt; }
grep -qE '@|\+91|Student|Admin\|' $OUT/1-preflight.txt && bad "preflight output contains personal data" || ok "preflight output: no names, e-mails or phone numbers"
[ "$(res $OUT/1-preflight.txt journal_table)" = "OK" ] && [ "$(res $OUT/1-preflight.txt previous_release_applied)" = "OK" ] && ok "preflight: RC6 base found, no journal table yet" || bad "preflight base checks"

# 2. apply while a member's profile edit holds profiles: must give up after 5 s, changing nothing
( "${P[@]}" -d $DB -q -c "begin; lock table public.profiles in row exclusive mode; select pg_sleep(12); commit;" >/dev/null 2>&1 ) &
sleep 1
start=$(date +%s); "${P[@]}" -d $DB -q -f $REL/apply.sql > $OUT/2-apply-busy.txt 2>&1; rc=$?; took=$(( $(date +%s) - start ))
wait
[ $rc -ne 0 ] && grep -q 'lock timeout' $OUT/2-apply-busy.txt && ok "apply while profiles is being written gives up after ${took}s with 'lock timeout'" || { bad "busy apply did not time out (rc=$rc)"; cat $OUT/2-apply-busy.txt; }
ro $REL/preflight.sql > $OUT/2b-preflight.txt
diff <(grep -v '^long_running' $OUT/1-preflight.txt) <(grep -v '^long_running' $OUT/2b-preflight.txt) >/dev/null && ok "after the timed-out apply nothing changed (preflight identical, still no journal table)" || { bad "timed-out apply left changes"; diff $OUT/1-preflight.txt $OUT/2b-preflight.txt; }

# 3. apply + verify
"${P[@]}" -d $DB -q -f $REL/apply.sql > $OUT/3-apply.txt 2>&1 && ok "apply.sql committed" || { bad "apply failed"; cat $OUT/3-apply.txt; }
ro $REL/verify.sql > $OUT/3-verify.txt
{ grep -qE '\|(FAIL|CHECK)\|' $OUT/3-verify.txt || grep -qi error $OUT/3-verify.txt; } && { bad "verify not clean"; cat $OUT/3-verify.txt; } || ok "verify: all $(grep -c '|OK|' $OUT/3-verify.txt) checks OK (run in a READ ONLY transaction)"
same=1; for f in $FPS; do
  [ "$(col $OUT/1-preflight.txt $f)" = "$(col $OUT/3-verify.txt $f)" ] && [ -n "$(col $OUT/3-verify.txt $f)" ] || { bad "$f differs between preflight and verify"; same=0; }; done
[ $same = 1 ] && ok "all 6 fingerprints identical before and after (no existing function, policy, trigger, column, grant or index changed)"
n=$(grep -c '^count_' $OUT/1-preflight.txt)
diff <(grep '^count_' $OUT/1-preflight.txt) <(grep '^count_' $OUT/3-verify.txt) >/dev/null && ok "all $n row counts identical (no existing row added, changed or removed)" || bad "row counts changed"

# 4. re-run is harmless
"${P[@]}" -d $DB -q -f $REL/apply.sql > $OUT/4-reapply.txt 2>&1 && ok "apply.sql re-run: OK" || { bad "re-run failed"; cat $OUT/4-reapply.txt; }
ro $REL/verify.sql > $OUT/4-verify.txt
diff $OUT/3-verify.txt $OUT/4-verify.txt >/dev/null && ok "verify after re-run identical" || { bad "re-run changed something"; diff $OUT/3-verify.txt $OUT/4-verify.txt; }
ro $REL/preflight.sql > $OUT/4-preflight.txt
[ "$(res $OUT/4-preflight.txt journal_table)" = "INFO" ] && ! grep -q '|STOP|' $OUT/4-preflight.txt && ok "preflight on an already-migrated database: no STOP (journal table reported as already present)" || { bad "preflight after apply"; cat $OUT/4-preflight.txt; }

# 5. rollback (default, non-destructive) with no trades
"${P[@]}" -d $DB -q -f $RB > $OUT/5-rollback.txt 2>&1 && ok "rollback committed" || { bad "rollback failed"; cat $OUT/5-rollback.txt; }
left=$("${P[@]}" -d $DB -Atc "select (to_regprocedure('public.journal_summary()') is null)::text || '/' || (to_regclass('public.journal_trades') is not null)::text")
[ "$left" = "true/false" ] || [ "$left" = "true/true" ] && ok "rollback: journal_summary() gone; table kept for its owners' data ($left)" || bad "rollback state $left"
ro $REL/preflight.sql > $OUT/5-preflight.txt
same=1; for f in $FPS; do [ "$(col $OUT/1-preflight.txt $f)" = "$(col $OUT/5-preflight.txt $f)" ] || { bad "$f differs after rollback"; same=0; }; done
[ $same = 1 ] && ok "after rollback every pre-existing object is exactly as before"
diff <(grep '^count_' $OUT/1-preflight.txt) <(grep '^count_' $OUT/5-preflight.txt) >/dev/null && ok "rollback removed no row" || bad "rollback changed row counts"

# 6. re-apply after rollback
"${P[@]}" -d $DB -q -f $REL/apply.sql > $OUT/6-apply.txt 2>&1 && ok "apply after rollback: OK" || { bad "apply after rollback failed"; cat $OUT/6-apply.txt; }
ro $REL/verify.sql > $OUT/6-verify.txt
grep -qE '\|(FAIL|CHECK)\|' $OUT/6-verify.txt && { bad "verify after re-apply"; cat $OUT/6-verify.txt; } || ok "verify after re-apply: all OK"

# 7. members use it; verify reports the trades honestly
"${P[@]}" -d $DB -A -F '|' -P footer=off -q -f "$HERE/exercise.sql" > $OUT/7-exercise.txt 2>&1 || { bad "exercise failed"; cat $OUT/7-exercise.txt; }
got=$(grep -vE "^(student|journal_trades)" $OUT/7-exercise.txt | tr "\n" " ")
[ "$got" = "3 0|0 3 " ] && ok "members used it through RLS: student one logged 3 trades; student two sees 0 of them; 3 rows in all" || { bad "exercise result: $got"; cat $OUT/7-exercise.txt; }
ro $REL/verify.sql > $OUT/7-verify.txt
[ "$(res $OUT/7-verify.txt no_trades_yet)" = "CHECK" ] && ! grep -q '|FAIL|' $OUT/7-verify.txt && ok "verify after real use: structure OK; it flags the 3 trades as CHECK (0 expected only right after applying)" || { bad "verify after use"; cat $OUT/7-verify.txt; }

# 8. rollback with trades: every trade stays
"${P[@]}" -d $DB -q -f $RB > $OUT/8-rollback.txt 2>&1 && ok "rollback with trades: committed" || { bad "rollback 2 failed"; cat $OUT/8-rollback.txt; }
kept=$("${P[@]}" -d $DB -Atc "select (select count(*) from public.journal_trades)||'/'||(select count(*) from pg_policies where tablename='journal_trades')||'/'||(to_regprocedure('public.journal_summary()') is null)::text")
[ "$kept" = "3/4/true" ] && ok "after rollback: all 3 trades kept, still owner-only (4 policies), summary function gone ($kept)" || bad "rollback 2 state $kept"

# 9. re-apply on top: the trades are still there and the summary is back
"${P[@]}" -d $DB -q -f $REL/apply.sql > $OUT/9-apply.txt 2>&1 && ok "apply again after the second rollback: OK" || { bad "apply 3 failed"; cat $OUT/9-apply.txt; }
ro $REL/verify.sql > $OUT/9-verify.txt
! grep -q '|FAIL|' $OUT/9-verify.txt && ok "verify: no FAIL" || { bad "verify 9"; cat $OUT/9-verify.txt; }
back=$("${P[@]}" -d $DB -Atc "set role authenticated; select set_config('app.current_user_id','b0000000-0000-4000-8000-000000000001',false); select public.journal_summary() ->> 'total';" | tail -1)
[ "$back" = "3" ] && ok "student one's 3 trades survived rollback and re-apply" || bad "trades after re-apply: $back"

echo; [ $fails -eq 0 ] && echo "REHEARSAL PASSED" || echo "REHEARSAL: $fails FAILED"
