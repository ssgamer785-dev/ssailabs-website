#!/usr/bin/env bash
# =========================================================================
# Regency Tailors — database test runner
#
# Boots a throwaway PostgreSQL cluster, applies the auth stub and every
# migration in order, then runs the assertion suite. Nothing here touches a
# Supabase project.
#
#   ./supabase/tests/run-tests.sh
#
# Requires the PostgreSQL server binaries (Debian/Ubuntu: postgresql-16).
# =========================================================================
set -euo pipefail

PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PGPORT="${PGPORT:-55432}"
PGDATA="${PGDATA:-/var/tmp/regency-dbtest}"
PGSOCK="${PGSOCK:-/var/tmp}"
PGUSER_NAME="regency"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"

if [ ! -x "$PGBIN/initdb" ]; then
  echo "PostgreSQL server binaries not found at $PGBIN" >&2
  echo "Install them (e.g. apt-get install postgresql-16) or set PGBIN." >&2
  exit 2
fi

# initdb refuses to run as root; use the postgres system account when we are.
RUNNER=""
if [ "$(id -u)" -eq 0 ]; then
  RUNNER="su postgres -c"
fi
run_pg() { if [ -n "$RUNNER" ]; then su postgres -c "$1"; else bash -c "$1"; fi; }

cleanup() {
  run_pg "$PGBIN/pg_ctl -D $PGDATA stop -m immediate" >/dev/null 2>&1 || true
  rm -rf "$PGDATA"
}
trap cleanup EXIT

echo "==> Starting throwaway PostgreSQL cluster on port $PGPORT"
rm -rf "$PGDATA"; mkdir -p "$PGDATA"
if [ -n "$RUNNER" ]; then chown postgres "$PGDATA"; fi
chmod 700 "$PGDATA"

run_pg "$PGBIN/initdb -D $PGDATA -U $PGUSER_NAME --auth=trust" >/dev/null
run_pg "$PGBIN/pg_ctl -D $PGDATA -o '-p $PGPORT -k $PGSOCK -c listen_addresses=' -l $PGSOCK/regency-pg.log start" >/dev/null
sleep 2

PSQL="$PGBIN/psql -h $PGSOCK -p $PGPORT -U $PGUSER_NAME -d postgres -v ON_ERROR_STOP=1 -X -q"

echo "==> Applying auth stub"
run_pg "$PSQL -f $HERE/00_auth_stub.sql" >/dev/null

echo "==> Applying migrations"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "    $(basename "$f")"
  run_pg "$PSQL -f $f" >/dev/null
done

echo "==> Running assertions"
FAILED=0
for f in "$HERE"/1*_test_*.sql; do
  echo ""
  echo "--- $(basename "$f") ---"
  if ! run_pg "$PGBIN/psql -h $PGSOCK -p $PGPORT -U $PGUSER_NAME -d postgres -X -q -v ON_ERROR_STOP=1 -f $f"; then
    FAILED=1
  fi
done

echo ""
if [ "$FAILED" -ne 0 ]; then
  echo "DATABASE TESTS: FAILED"
  exit 1
fi
echo "DATABASE TESTS: ALL PASSED"
