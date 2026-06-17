#!/bin/bash
# ============================================================================
# run_all_tests.sh — Run all booking-driven lifecycle SQL tests
# ============================================================================
# Usage:   ./run_all_tests.sh
# Returns: 0 on all pass, 1 on any failure
#
# Requires: psql with access to the Supabase DB (or local pg).
# Reads DB connection from environment: PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE
# Or pass via URL: DATABASE_URL=postgresql://user:pass@host:port/db
# ============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TESTS_DIR="$SCRIPT_DIR"

# Build the connection string
if [ -n "$DATABASE_URL" ]; then
  PSQL_CONN="$DATABASE_URL"
else
  PSQL_CONN="postgresql://${PGUSER}:${PGPASSWORD}@${PGHOST}:${PGPORT:-5432}/${PGDATABASE:-postgres}"
fi

# Find all test files matching the naming pattern, sorted numerically
TESTS=$(ls "$TESTS_DIR"/test_*.sql 2>/dev/null | sort)

if [ -z "$TESTS" ]; then
  echo "No test files found in $TESTS_DIR"
  exit 1
fi

PASS=0
FAIL=0
FAILED_TESTS=""

echo "=========================================="
echo "Running $(echo "$TESTS" | wc -l) test(s)"
echo "=========================================="

for test_file in $TESTS; do
  test_name=$(basename "$test_file")
  echo ""
  echo "--- $test_name ---"

  # Run the test. Exit code: 0 = pass, non-zero = fail.
  if psql "$PSQL_CONN" \
    -v ON_ERROR_STOP=1 \
    --no-psqlrc \
    -X \
    -q \
    -f "$test_file" 2>&1 | tee /tmp/test_output.txt; then
    echo "RESULT: $test_name PASSED"
    PASS=$((PASS + 1))
  else
    echo "RESULT: $test_name FAILED"
    FAIL=$((FAIL + 1))
    FAILED_TESTS="$FAILED_TESTS $test_name"
  fi
done

echo ""
echo "=========================================="
echo "SUMMARY: $PASS passed, $FAIL failed"
echo "=========================================="

if [ $FAIL -gt 0 ]; then
  echo "Failed tests:$FAILED_TESTS"
  exit 1
fi

exit 0