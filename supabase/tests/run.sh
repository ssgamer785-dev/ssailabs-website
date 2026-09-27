#!/usr/bin/env bash
#
# Applies every migration to a throwaway Postgres database and runs the
# behaviour checks against it. Real Postgres, not a mock: RLS policies,
# SECURITY DEFINER functions and triggers only behave like themselves when
# the server is actually executing them.
#
# Usage:  supabase/tests/run.sh [PGHOST] [PGPORT]
# Needs:  a Postgres 16 server you can create databases on (trust auth).
set -euo pipefail

HOST="${1:-/tmp}"
PORT="${2:-55432}"
DB="tp_test_$$"
HERE="$(cd "$(dirname "$0")" && pwd)"
PSQL=(psql -h "$HOST" -p "$PORT" -U postgres -v ON_ERROR_STOP=1)

cleanup() { "${PSQL[@]}" -q -c "drop database if exists $DB;" >/dev/null 2>&1 || true; }
trap cleanup EXIT

"${PSQL[@]}" -q -c "create database $DB;"
"${PSQL[@]}" -d "$DB" -q -f "$HERE/00-supabase-shim.sql" 2>/dev/null

for migration in "$HERE"/../migrations/*.sql; do
  echo "applying $(basename "$migration")"
  "${PSQL[@]}" -d "$DB" -q -f "$migration" 2>/dev/null
done

# Only what lives outside the migration chain. The table and function grants
# used to be re-applied here, after the migrations -- which silently undid
# 20260824120000_restrict_server_only_functions.sql and let a suite report a
# maintenance function as locked down when the harness had just reopened it.
# The public schema is the migrations job now (20260823120000_api_grants.sql).
"${PSQL[@]}" -d "$DB" -q -c "
  grant select on auth.users to authenticated, service_role;"

failures=0
for suite in "$HERE"/[0-9][0-9]-*.sql; do
  case "$(basename "$suite")" in 00-*) continue ;; esac
  echo
  echo "== $(basename "$suite")"
  output=$("${PSQL[@]}" -d "$DB" -f "$suite" 2>&1 || true)
  echo "$output" | grep -E 'PASS|FAIL|^---|ERROR' || true
  if echo "$output" | grep -qE 'FAIL|ERROR'; then failures=$((failures + 1)); fi
done

# The concurrency check needs several real connections at once, so it is a
# script rather than a psql suite. Run last: it mints its own code and leaves
# eight activated fixtures behind.
echo
echo "== 51-activation-race.sh"
if "$HERE/51-activation-race.sh" "$HOST" "$PORT" "$DB"; then :; else failures=$((failures + 1)); fi

echo
if [ "$failures" -gt 0 ]; then
  echo "$failures suite(s) FAILED"
  exit 1
fi
echo "all suites passed"
