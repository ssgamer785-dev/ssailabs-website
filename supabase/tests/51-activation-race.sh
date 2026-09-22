#!/usr/bin/env bash
#
# One activation code, eight users, all redeeming at the same instant.
# Exactly one must win.
#
# This cannot be written as a psql script: a single session serialises itself,
# so the row lock that makes redeem_activation_code() atomic is never actually
# contended. Eight real connections are the only way to exercise it.
#
# The contenders align on a shared wall-clock instant with pg_sleep_until()
# rather than just being launched together, so they arrive at the UPDATE inside
# the same few milliseconds instead of whenever their process happened to start.
#
# Usage: 51-activation-race.sh <host> <port> <db>
set -euo pipefail

HOST="${1:-/var/tmp}"; PORT="${2:-55432}"; DB="${3:?database name required}"
PSQL=(psql -h "$HOST" -p "$PORT" -U postgres -d "$DB" -v ON_ERROR_STOP=1 -tA)

CONTENDERS=8
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

# Eight fresh students, plus a code minted by the existing admin fixture.
for i in $(seq 1 "$CONTENDERS"); do
  uid="99999999-0000-0000-0000-00000000000$i"
  "${PSQL[@]}" -c "
    insert into auth.users (id, email) values ('$uid', 'race$i@test.local')
      on conflict (id) do nothing;
    update public.profiles
       set role = 'student', activated_at = null, activation_attempts = 0
     where id = '$uid';" >/dev/null
done

# tail -1: psql prints a command tag for each SET before the SELECT's row.
CODE="$("${PSQL[@]}" -c "
  set role authenticated;
  set app.current_user_id = '11111111-1111-1111-1111-111111111111';
  select public.create_activation_code() ->> 'code';" | tail -1)"

if [[ ! "$CODE" =~ ^TP-[A-Z2-9]{4}-[A-Z2-9]{4}$ ]]; then
  echo " FAIL: could not mint a code for the race (got '$CODE')"
  exit 1
fi

# A common start instant, far enough out that every process is parked on
# pg_sleep_until() before it arrives.
START="$("${PSQL[@]}" -c "select (now() + interval '3 seconds')::text;")"

for i in $(seq 1 "$CONTENDERS"); do
  uid="99999999-0000-0000-0000-00000000000$i"
  (
    "${PSQL[@]}" -c "
      begin;
      set local role authenticated;
      set local app.current_user_id = '$uid';
      select pg_sleep_until('$START'::timestamptz);
      select public.redeem_activation_code('$CODE') ->> 'ok';
      commit;" 2>"$OUT/err.$i" | grep -Ex 'true|false' > "$OUT/res.$i" || true
  ) &
done
wait

wins=0; losses=0
for i in $(seq 1 "$CONTENDERS"); do
  case "$(cat "$OUT/res.$i" 2>/dev/null)" in
    true)  wins=$((wins + 1)) ;;
    false) losses=$((losses + 1)) ;;
    *)     echo " FAIL: contender $i produced no verdict: $(head -2 "$OUT/err.$i" 2>/dev/null)"; exit 1 ;;
  esac
done

# And the database must agree: one redemption, one activated profile.
redeemed="$("${PSQL[@]}" -c "
  select count(*) from public.activation_codes
   where code_hash = encode(digest(public.normalise_activation_code('$CODE'), 'sha256'), 'hex')
     and redeemed_at is not null;")"
activated="$("${PSQL[@]}" -c "
  select count(*) from public.profiles
   where id::text like '99999999-%' and activated_at is not null;")"

echo "--- concurrent redemption of one code by $CONTENDERS users"
if [ "$wins" -eq 1 ] && [ "$losses" -eq $((CONTENDERS - 1)) ] \
   && [ "$redeemed" -eq 1 ] && [ "$activated" -eq 1 ]; then
  echo " PASS  exactly one winner ($wins ok, $losses refused, $redeemed code redeemed, $activated profile activated)"
  exit 0
fi
echo " FAIL: $wins winners, $losses refused, $redeemed codes redeemed, $activated profiles activated"
exit 1
