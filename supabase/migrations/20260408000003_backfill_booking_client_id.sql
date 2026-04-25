-- =============================================================================
-- Backfill client_id on bookings that were created without it
-- =============================================================================
-- Root cause: booking-public function never set client_id; DocPlanner import
-- had early versions that didn't set it; some internal bookings also missed it.
--
-- Strategy (safe, in priority order):
--   1. Match by email (case-insensitive) — exact, unambiguous
--   2. Match by full name (case-insensitive) when client is UNIQUE in company
--      (skip if email already handled it)
-- =============================================================================

DO $$
DECLARE
  updated_email  INT;
  updated_name   INT;
BEGIN

  -- ── Pass 1: match by email ────────────────────────────────────────────────
  WITH candidates AS (
    SELECT DISTINCT ON (b.id)
      b.id   AS booking_id,
      c.id   AS client_id
    FROM   bookings b
    JOIN   clients  c ON c.company_id = b.company_id
                     AND LOWER(c.email) = LOWER(b.customer_email)
    WHERE  b.client_id       IS NULL
      AND  b.customer_email  IS NOT NULL
      AND  c.deleted_at      IS NULL
    ORDER  BY b.id, c.created_at  -- deterministic: oldest client wins on dup email
  )
  UPDATE bookings b
  SET    client_id = candidates.client_id
  FROM   candidates
  WHERE  b.id = candidates.booking_id;

  GET DIAGNOSTICS updated_email = ROW_COUNT;
  RAISE NOTICE 'Backfill pass 1 (email):  % rows updated', updated_email;

  -- ── Pass 2: match by full name when unique in that company ────────────────
  -- Only runs for bookings still without client_id after pass 1.
  WITH name_candidates AS (
    SELECT
      b.id                                              AS booking_id,
      c.id                                              AS client_id,
      COUNT(c.id) OVER (
        PARTITION BY b.company_id, LOWER(TRIM(b.customer_name))
      )                                                 AS match_count
    FROM   bookings b
    JOIN   clients  c ON c.company_id = b.company_id
                     AND LOWER(TRIM(c.name || ' ' || COALESCE(c.surname, '')))
                         = LOWER(TRIM(b.customer_name))
    WHERE  b.client_id     IS NULL
      AND  c.deleted_at    IS NULL
  ),
  unique_matches AS (
    SELECT DISTINCT ON (booking_id) booking_id, client_id
    FROM   name_candidates
    WHERE  match_count = 1
    ORDER  BY booking_id
  )
  UPDATE bookings b
  SET    client_id = unique_matches.client_id
  FROM   unique_matches
  WHERE  b.id = unique_matches.booking_id;

  GET DIAGNOSTICS updated_name = ROW_COUNT;
  RAISE NOTICE 'Backfill pass 2 (unique name): % rows updated', updated_name;
  RAISE NOTICE 'Total backfilled: %', updated_email + updated_name;

END;
$$;
