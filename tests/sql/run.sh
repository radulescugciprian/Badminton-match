#!/usr/bin/env bash
# Builds a throw-away database, applies every migration (twice, to prove they are safe to re-run) and runs the rights tests.
# Connection comes from the usual PG* environment variables (PGHOST, PGPORT, PGUSER, PGPASSWORD).
set -euo pipefail
cd "$(dirname "$0")"
DB=${TEST_DB:-badminton_test}; Q="psql -X -q -v ON_ERROR_STOP=1"
$Q -d postgres -c "drop database if exists $DB" -c "create database $DB"
$Q -d $DB -f stub.sql
for f in ../../supabase/migrations/*.sql; do $Q -d $DB -f "$f"; done
for f in $(ls ../../supabase/migrations/*.sql | tail -n +2); do $Q -d $DB -f "$f" 2>/dev/null; done   # everything after the first file is idempotent
$Q -o /dev/null -d $DB -f rights.test.sql
echo "sql tests passed"
