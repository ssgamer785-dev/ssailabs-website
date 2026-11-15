#!/usr/bin/env bash
# RC6 database rehearsal on a throwaway LOCAL Postgres 16 (never Production): the
# migration chain up to RC5, seeded, then preflight -> apply on a busy table (must
# time out, changing nothing) -> apply -> verify -> re-apply -> rollback -> re-apply
# -> use the features -> rollback -> re-apply.
#
# Usage:  supabase/releases/rc6/rehearsal/rehearse.sh [PGHOST] [PGPORT]
# Needs:  a Postgres 16 server you can create databases on as postgres (trust auth),
#         as for supabase/tests/run.sh.
set -uo pipefail
export PGOPTIONS="-c client_min_messages=warning"
HERE="$(cd "$(dirname "$0")" && pwd)"
WT="$(cd "$HERE/../../../.." && pwd)"; HOST="${1:-/tmp}"; PORT="${2:-55432}"; DB=rc6_rehearsal_$$
REL=$WT/supabase/releases/rc6; RB=$WT/supabase/rollbacks/20261115090000_rc6_poll_image_member_deletion_chat_replies.rollback.sql
P=(psql -X -h $HOST -p $PORT -U postgres -v ON_ERROR_STOP=1)
OUT=$(mktemp -d); trap '"${P[@]}" -q -c "drop database if exists $DB" >/dev/null 2>&1; rm -rf "$OUT"' EXIT
fails=0; ok() { echo "PASS $1"; }; bad() { echo "FAIL $1"; fails=$((fails+1)); }
ro() { "${P[@]}" -d $DB -A -F '|' -P footer=off -q -c 'begin transaction read only' -f "$1" -c 'rollback' 2>&1; }
col() { grep -E "^$2\|" "$1" | cut -d'|' -f3; }
res() { grep -E "^$2\|" "$1" | cut -d'|' -f2; }

"${P[@]}" -q -c "create database $DB"
"${P[@]}" -d $DB -q -f $WT/supabase/tests/00-supabase-shim.sql 2>/dev/null
for m in $WT/supabase/migrations/*.sql; do
  case $(basename $m) in 20261115090000_*) continue;; esac
  "${P[@]}" -d $DB -q -f $m 2>&1 | grep -vE 'wal_level|^HINT' ; done
"${P[@]}" -d $DB -q -c "grant select on auth.users to authenticated, service_role;"
"${P[@]}" -d $DB -q -f "$HERE/seed.sql" > $OUT/seed.txt 2>&1 && ok "seeded a Production-like database (RC5 chain, admin, 3 students, poll + votes, chat, devices)" || { bad seed; cat $OUT/seed.txt; }

# 1. preflight
ro $REL/preflight.sql > $OUT/1-preflight.txt
grep -q '|STOP|' $OUT/1-preflight.txt && bad "preflight has STOP rows" || ok "preflight: no STOP rows ($(grep -c '|OK|' $OUT/1-preflight.txt) OK)"
grep -qiE 'ERROR' $OUT/1-preflight.txt && { bad "preflight errored"; cat $OUT/1-preflight.txt; }
grep -qE '@|\+91|Student|Admin\|' $OUT/1-preflight.txt && bad "preflight output contains personal data" || ok "preflight output: no names, e-mails or phone numbers"

# 2. apply while a member's request holds the messages table: must give up after 5 s, changing nothing
( "${P[@]}" -d $DB -q -c "begin; select count(*) from public.messages; select pg_sleep(12); commit;" >/dev/null 2>&1 ) &
sleep 1
start=$(date +%s); "${P[@]}" -d $DB -q -f $REL/apply.sql > $OUT/2-apply-busy.txt 2>&1; rc=$?; took=$(( $(date +%s) - start ))
wait
[ $rc -ne 0 ] && grep -q 'lock timeout' $OUT/2-apply-busy.txt && ok "apply on a busy table gives up after ${took}s with 'lock timeout'" || { bad "busy apply did not time out (rc=$rc)"; cat $OUT/2-apply-busy.txt; }
ro $REL/preflight.sql > $OUT/2b-preflight.txt
diff <(grep -v '^long_running' $OUT/1-preflight.txt) <(grep -v '^long_running' $OUT/2b-preflight.txt) >/dev/null && ok "after the timed-out apply nothing changed (preflight identical)" || { bad "timed-out apply left changes"; diff $OUT/1-preflight.txt $OUT/2b-preflight.txt; }

# 3. apply + verify
"${P[@]}" -d $DB -q -f $REL/apply.sql > $OUT/3-apply.txt 2>&1 && ok "apply.sql committed" || { bad "apply failed"; cat $OUT/3-apply.txt; }
ro $REL/verify.sql > $OUT/3-verify.txt
grep -qE '\|(FAIL|CHECK)\|' $OUT/3-verify.txt || grep -qi error $OUT/3-verify.txt && { bad "verify not clean"; cat $OUT/3-verify.txt; } || ok "verify: all $(grep -c '|OK|' $OUT/3-verify.txt) checks OK (run in a READ ONLY transaction)"
for f in fp_functions fp_policies fp_triggers fp_columns fp_table_grants fp_indexes; do
  [ "$(col $OUT/1-preflight.txt $f)" = "$(col $OUT/3-verify.txt $f)" ] && [ -n "$(col $OUT/3-verify.txt $f)" ] || bad "$f differs between preflight and verify"; done
ok "all 6 fingerprints identical before and after (no existing function, policy, trigger, column, grant or index changed)"
diff <(grep '^count_' $OUT/1-preflight.txt) <(grep '^count_' $OUT/3-verify.txt) >/dev/null && ok "all 17 row counts identical (no row added, changed or removed)" || bad "row counts changed"

# 4. re-run is harmless
"${P[@]}" -d $DB -q -f $REL/apply.sql > $OUT/4-reapply.txt 2>&1 && ok "apply.sql re-run: OK" || { bad "re-run failed"; cat $OUT/4-reapply.txt; }
ro $REL/verify.sql > $OUT/4-verify.txt
diff $OUT/3-verify.txt $OUT/4-verify.txt >/dev/null && ok "verify after re-run identical" || { bad "re-run changed something"; diff $OUT/3-verify.txt $OUT/4-verify.txt; }

# 5. rollback with no member deleted: everything RC6 added that holds no data goes
"${P[@]}" -d $DB -q -f $RB > $OUT/5-rollback.txt 2>&1 && ok "rollback committed" || { bad "rollback failed"; cat $OUT/5-rollback.txt; }
ro $REL/preflight.sql > $OUT/5-preflight.txt
for f in fp_functions fp_policies fp_triggers fp_columns fp_table_grants fp_indexes; do
  [ "$(col $OUT/1-preflight.txt $f)" = "$(col $OUT/5-preflight.txt $f)" ] || bad "$f differs after rollback"; done
ok "after rollback the pre-RC6 schema fingerprints are back"
[ "$(res $OUT/5-preflight.txt new_functions)" = "OK" ] && ok "after rollback no RC6 function remains" || bad "RC6 functions left after rollback"
diff <(grep '^count_' $OUT/1-preflight.txt) <(grep '^count_' $OUT/5-preflight.txt) >/dev/null && ok "rollback removed no row" || bad "rollback changed row counts"

# 6. re-apply after rollback
"${P[@]}" -d $DB -q -f $REL/apply.sql > $OUT/6-apply.txt 2>&1 && ok "apply after rollback: OK" || { bad "apply after rollback failed"; cat $OUT/6-apply.txt; }
ro $REL/verify.sql > $OUT/6-verify.txt
grep -qE '\|(FAIL|CHECK)\|' $OUT/6-verify.txt && { bad "verify after re-apply"; cat $OUT/6-verify.txt; } || ok "verify after re-apply: all OK"

# 7. use the features, then verify reports it honestly
"${P[@]}" -d $DB -A -F '|' -P footer=off -q -f "$HERE/exercise.sql" > $OUT/7-exercise.txt 2>&1 && ok "features used: $(tail -2 $OUT/7-exercise.txt | tr '\n' ' ')" || { bad "exercise failed"; cat $OUT/7-exercise.txt; }
ro $REL/verify.sql > $OUT/7-verify.txt
[ "$(res $OUT/7-verify.txt no_member_deleted_yet)" = "CHECK" ] && [ "$(res $OUT/7-verify.txt no_row_changed)" = "CHECK" ] && ! grep -q '|FAIL|' $OUT/7-verify.txt && ok "verify after real use: structure OK, and it flags the deletion and the reply as CHECK (expected only right after applying)" || { bad "verify after use"; cat $OUT/7-verify.txt; }

# 8. rollback with a deleted member: the lock that keeps them deleted stays; their data stays
"${P[@]}" -d $DB -q -f $RB > $OUT/8-rollback.txt 2>&1 && ok "rollback with a deleted member: committed" || { bad "rollback 2 failed"; cat $OUT/8-rollback.txt; }
kept=$("${P[@]}" -d $DB -Atc "select (select count(*) from pg_trigger where tgname='profiles_guard_deletion')||'/'||(select count(*) from public.profiles where deleted_at is not null)||'/'||(select count(*) from public.messages where reply_to_id is not null)||'/'||(select count(*) from public.admin_audit_events)||'/'||(select count(*) from pg_proc where proname in ('admin_delete_member','create_poll_post_with_image','guard_message_reply'))")
[ "$kept" = "1/1/1/1/0" ] && ok "after rollback: deletion lock kept, deleted member still deleted, reply link and audit row kept, RC6 functions gone ($kept)" || bad "rollback 2 state $kept"
"${P[@]}" -d $DB -q -c "update public.profiles set deleted_at = null where deleted_at is not null" > $OUT/8b.txt 2>&1 && bad "a deleted member could be restored after rollback" || ok "even after rollback a deleted member cannot be restored"

# 9. re-apply on top
"${P[@]}" -d $DB -q -f $REL/apply.sql > $OUT/9-apply.txt 2>&1 && ok "apply again after the second rollback: OK" || { bad "apply 3 failed"; cat $OUT/9-apply.txt; }
ro $REL/verify.sql > $OUT/9-verify.txt
! grep -q '|FAIL|' $OUT/9-verify.txt && ok "verify: no FAIL" || { bad "verify 9"; cat $OUT/9-verify.txt; }

echo; [ $fails -eq 0 ] && echo "REHEARSAL PASSED" || echo "REHEARSAL: $fails FAILED"
