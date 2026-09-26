#!/usr/bin/env bash
# =============================================================================
# VoyageX — db/reset.sh
# Drops and rebuilds the entire database from empty, in one command.
#
# Phase 2 of docs/project_plan.md · SRS NFR-10 ("the schema shall rebuild from
# empty with a single command")
#
#   ./db/reset.sh              rebuild the development database
#   ./db/reset.sh --test       rebuild the test database ($PGDATABASE_TEST)
#   ./db/reset.sh --seed       rebuild, then run db/seed.py
#   ./db/reset.sh --quiet      only report failures and the final summary
#   ./db/reset.sh --help
#
# This script will be run many times during development, by the test suite
# before each run, and once nervously before the demo. It is therefore:
#   * idempotent      — safe to run against a populated database or an empty one
#   * fail-fast       — ON_ERROR_STOP=1; the first SQL error aborts the build
#   * forward-looking — it applies whichever of db/0*.sql exist, in numeric
#                       order, so it keeps working as phases 3-7 add files
#                       without needing to be edited
#
# Connection settings come from .env if present, otherwise from the standard
# PG* environment variables, otherwise from the defaults below. No credentials
# are stored in this file (SRS C-07).
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

# --- Options ---------------------------------------------------------------
USE_TEST_DB=false
RUN_SEED=false
QUIET=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --test)  USE_TEST_DB=true; shift ;;
        --seed)  RUN_SEED=true;    shift ;;
        --quiet) QUIET=true;       shift ;;
        -h|--help)
            sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
            exit 0 ;;
        *)
            echo "reset.sh: unknown option '$1' (try --help)" >&2
            exit 2 ;;
    esac
done

# --- Configuration ---------------------------------------------------------
# .env is git-ignored; .env.example documents every variable with dummy values.
if [[ -f "$REPO_ROOT/.env" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "$REPO_ROOT/.env"
    set +a
fi

PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGADMIN_USER:-${PGUSER:-postgres}}"
[[ -n "${PGADMIN_PASSWORD:-}" ]] && export PGPASSWORD="$PGADMIN_PASSWORD"

if [[ "$USE_TEST_DB" == true ]]; then
    TARGET_DB="${PGDATABASE_TEST:-travel_test}"
else
    TARGET_DB="${PGDATABASE:-travel_tourism}"
fi

export PGHOST PGPORT PGUSER

# --- Output ----------------------------------------------------------------
if [[ -t 1 ]]; then
    BOLD=$'\033[1m'; RED=$'\033[31m'; GREEN=$'\033[32m'; DIM=$'\033[2m'; OFF=$'\033[0m'
else
    BOLD=''; RED=''; GREEN=''; DIM=''; OFF=''
fi

say()  { [[ "$QUIET" == true ]] || echo "$@"; }
fail() { echo "${RED}✗ $*${OFF}" >&2; exit 1; }

# psql for the target database: fail on the first error, quiet, no pager.
psql_db() {
    psql --dbname="$TARGET_DB" --no-psqlrc --quiet --pset=pager=off \
         --set=ON_ERROR_STOP=1 "$@"
}

START_TIME=$(date +%s)

say "${BOLD}VoyageX — database reset${OFF}"
say "${DIM}  host     $PGHOST:$PGPORT"
say "  user     $PGUSER"
say "  database $TARGET_DB$([[ "$USE_TEST_DB" == true ]] && echo '  (test)')${OFF}"
say ""

# --- 1. Server reachable? --------------------------------------------------
pg_isready --host="$PGHOST" --port="$PGPORT" --timeout=5 >/dev/null 2>&1 \
    || fail "no PostgreSQL server at $PGHOST:$PGPORT. Start it, or run 'docker compose up postgres'."

# --- 2. Database exists? ---------------------------------------------------
# Connect to the maintenance database to ask, and to create it if it is missing,
# so that a fresh clone needs one command rather than two.
db_exists=$(psql --dbname=postgres --no-psqlrc --quiet --tuples-only --no-align \
                 --set=ON_ERROR_STOP=1 \
                 --command="SELECT 1 FROM pg_database WHERE datname = '$TARGET_DB'" 2>/dev/null || true)

if [[ "$db_exists" != "1" ]]; then
    say "  database does not exist — creating it"
    createdb "$TARGET_DB" || fail "could not create database '$TARGET_DB'"
fi

# --- 3. Drop everything ----------------------------------------------------
# DROP SCHEMA ... CASCADE removes every table, view, trigger, function and
# sequence in one statement, which is what makes this safe to run repeatedly.
#
# Note: PostgreSQL roles are cluster-level, not schema-level, so they survive
# this. 07_roles_grants.sql is written to be idempotent for that reason.
# client_min_messages=warning suppresses the "drop cascades to table ..." notice
# per object, which on a populated database is 25 lines of noise on stderr.
say "  dropping schema"
psql_db --command="SET client_min_messages = warning;
                   DROP SCHEMA IF EXISTS public CASCADE;
                   CREATE SCHEMA public;" >/dev/null 2>&1 \
    || fail "could not drop and recreate schema 'public'"

# --- 4. Apply the build files in numeric order -----------------------------
# Globbing db/0*.sql rather than listing files means this loop does not change
# as phases 3-7 add 03_views.sql through 07_roles_grants.sql.
shopt -s nullglob
BUILD_FILES=("$SCRIPT_DIR"/0*.sql)
shopt -u nullglob

[[ ${#BUILD_FILES[@]} -gt 0 ]] || fail "no build files matching db/0*.sql"

for sql_file in "${BUILD_FILES[@]}"; do
    name="$(basename "$sql_file")"
    printf '  %-26s' "$name"

    if output=$(psql_db --file="$sql_file" 2>&1); then
        # NOTICEs are informational (for example "extension already exists").
        notices=$(grep -c '^NOTICE' <<<"$output" || true)
        if [[ "$notices" -gt 0 ]]; then
            echo "${GREEN}ok${OFF} ${DIM}($notices notice$([[ $notices -ne 1 ]] && echo s))${OFF}"
        else
            echo "${GREEN}ok${OFF}"
        fi
    else
        echo "${RED}FAILED${OFF}"
        echo "" >&2
        echo "$output" >&2
        fail "build stopped at $name"
    fi
done

# --- 5. Verify the exit condition ------------------------------------------
# Phase 2 is accepted when reset.sh builds all 25 tables from empty with zero
# errors (docs/project_plan.md). Counting them here means the script asserts its
# own exit condition rather than leaving it to be eyeballed.
EXPECTED_TABLES=25

count_of() {
    psql_db --tuples-only --no-align --command="$1"
}

TABLES=$(count_of "SELECT count(*) FROM information_schema.tables
                   WHERE table_schema = 'public' AND table_type = 'BASE TABLE'")
VIEWS=$(count_of "SELECT count(*) FROM information_schema.views
                  WHERE table_schema = 'public'")
CONSTRAINTS=$(count_of "SELECT count(*) FROM pg_constraint c
                        JOIN pg_namespace n ON n.oid = c.connamespace
                        WHERE n.nspname = 'public'")
CHECKS=$(count_of "SELECT count(*) FROM pg_constraint c
                   JOIN pg_namespace n ON n.oid = c.connamespace
                   WHERE n.nspname = 'public' AND c.contype = 'c'")
FKS=$(count_of "SELECT count(*) FROM pg_constraint c
                JOIN pg_namespace n ON n.oid = c.connamespace
                WHERE n.nspname = 'public' AND c.contype = 'f'")
TRIGGERS=$(count_of "SELECT count(*) FROM pg_trigger
                     WHERE NOT tgisinternal")
# Excludes functions owned by an extension (pg_trgm installs ~30 of its own into
# public), so this counts only the procedures and trigger functions this project
# defines.
ROUTINES=$(count_of "SELECT count(*) FROM pg_proc p
                     JOIN pg_namespace n ON n.oid = p.pronamespace
                     WHERE n.nspname = 'public'
                       AND NOT EXISTS (SELECT 1 FROM pg_depend d
                                       WHERE d.objid = p.oid AND d.deptype = 'e')")
INDEXES=$(count_of "SELECT count(*) FROM pg_indexes WHERE schemaname = 'public'")

# --- 6. Optional seeding ---------------------------------------------------
if [[ "$RUN_SEED" == true ]]; then
    if [[ -f "$SCRIPT_DIR/seed.py" ]]; then
        say ""
        say "  seeding"
        PGDATABASE="$TARGET_DB" python3 "$SCRIPT_DIR/seed.py" || fail "seeding failed"
    else
        say "  ${DIM}--seed given but db/seed.py does not exist yet (Phase 3)${OFF}"
    fi
fi

# --- 7. Summary ------------------------------------------------------------
ELAPSED=$(( $(date +%s) - START_TIME ))

say ""
say "${BOLD}  Schema objects${OFF}"
say "    tables        $TABLES / $EXPECTED_TABLES expected"
say "    views         $VIEWS"
say "    indexes       $INDEXES"
say "    constraints   $CONSTRAINTS ${DIM}($CHECKS check, $FKS foreign key)${OFF}"
say "    triggers      $TRIGGERS"
say "    routines      $ROUTINES"
say ""

if [[ "$TABLES" -ne "$EXPECTED_TABLES" ]]; then
    echo "${RED}✗ expected $EXPECTED_TABLES tables, found $TABLES${OFF}" >&2
    psql_db --command="SELECT table_name FROM information_schema.tables
                       WHERE table_schema='public' AND table_type='BASE TABLE'
                       ORDER BY table_name" >&2
    exit 1
fi

echo "${GREEN}✓ database '$TARGET_DB' rebuilt from empty in ${ELAPSED}s — $TABLES tables, 0 errors${OFF}"
