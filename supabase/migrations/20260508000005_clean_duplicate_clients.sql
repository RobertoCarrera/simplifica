-- ============================================================
-- Clean duplicate clients — batched, reversible
-- 2026-05-08
-- Keeps oldest (by created_at) per dedup group, marks rest inactive
-- Results: 1330 marked inactive, 150 active clients remain
-- ============================================================

DO $$
DECLARE
  batch_size  INT := 500;
  max_cycles INT := 1000;
  cycles     INT := 0;
  marked_ct  INT := 0;
  email_marked INT := 0;
  name_marked INT := 0;
BEGIN
  -- ── Stage 1: Email duplicates ─────────────────────────────────
  LOOP
    WITH email_duplicates AS (
      SELECT id, company_id, LOWER(email) AS norm_email,
        ROW_NUMBER() OVER (PARTITION BY company_id, LOWER(email) ORDER BY created_at ASC) AS rn
      FROM public.clients
      WHERE email IS NOT NULL AND email != ''
        AND deleted_at IS NULL
        AND (is_active IS NULL OR is_active = true)
    ),
    to_mark AS (
      SELECT id, company_id, norm_email
      FROM email_duplicates
      WHERE rn > 1
      LIMIT batch_size
    )
    UPDATE public.clients c
    SET    is_active           = false,
           deleted_at          = now(),
           duplicate_of        = (
             SELECT e.id FROM email_duplicates e
             WHERE e.company_id = c.company_id
               AND e.norm_email = LOWER(c.email)
               AND e.rn = 1
             LIMIT 1
           ),
           marked_duplicate_at = now(),
           dedup_match_type    = 'email',
           updated_at          = now()
    WHERE c.id IN (SELECT id FROM to_mark);

    GET DIAGNOSTICS marked_ct = ROW_COUNT;
    EXIT WHEN marked_ct = 0 OR cycles >= max_cycles;
    email_marked := email_marked + marked_ct;
    cycles := cycles + 1;
  END LOOP;
  RAISE NOTICE 'Stage 1 (email): cycles=%, marked=%', cycles, email_marked;

  -- ── Stage 2: Name+surname+phone_last9 duplicates ─────────────
  cycles := 0;
  marked_ct := 0;
  LOOP
    WITH norm_dups AS (
      SELECT id, company_id,
        UPPER(TRIM(REPLACE(COALESCE(name, ''), '\s+', ' '))) AS norm_name,
        UPPER(TRIM(REPLACE(COALESCE(surname, ''), '\s+', ' '))) AS norm_surname,
        RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(phone, ''), ' ', ''), '-', ''), '+', ''), '(', ''), ')', ''), 9) AS phone_last9,
        ROW_NUMBER() OVER (
          PARTITION BY company_id,
            UPPER(TRIM(REPLACE(COALESCE(name, ''), '\s+', ' '))),
            UPPER(TRIM(REPLACE(COALESCE(surname, ''), '\s+', ' '))),
            RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(phone, ''), ' ', ''), '-', ''), '+', ''), '(', ''), ')', ''), 9)
          ORDER BY created_at ASC
        ) AS rn
      FROM public.clients
      WHERE deleted_at IS NULL
        AND (is_active IS NULL OR is_active = true)
        AND name IS NOT NULL
        AND UPPER(TRIM(COALESCE(name, ''))) != ''
    ),
    to_mark AS (
      SELECT id, company_id, norm_name, norm_surname, phone_last9
      FROM norm_dups
      WHERE rn > 1
      LIMIT batch_size
    )
    UPDATE public.clients c
    SET    is_active           = false,
           deleted_at          = now(),
           duplicate_of        = (
             SELECT n.id FROM norm_dups n
             WHERE n.company_id = c.company_id
               AND n.norm_name = UPPER(TRIM(REPLACE(COALESCE(c.name, ''), '\s+', ' ')))
               AND n.norm_surname = UPPER(TRIM(REPLACE(COALESCE(c.surname, ''), '\s+', ' ')))
               AND n.rn = 1
             LIMIT 1
           ),
           marked_duplicate_at = now(),
           dedup_match_type    = 'name_surname',
           updated_at          = now()
    WHERE c.id IN (SELECT id FROM to_mark);

    GET DIAGNOSTICS marked_ct = ROW_COUNT;
    EXIT WHEN marked_ct = 0 OR cycles >= max_cycles;
    name_marked := name_marked + marked_ct;
    cycles := cycles + 1;
  END LOOP;
  RAISE NOTICE 'Stage 2 (name+surname+phone): cycles=%, marked=%', cycles, name_marked;
  RAISE NOTICE 'TOTAL: email=% rows, name/surname=% rows', email_marked, name_marked;
END;
$$;

-- Log all marked duplicates to cleanup_log (reversibility)
INSERT INTO client_dedup_cleanup_log (removed_id, kept_id, reason, company_id, dedup_key)
SELECT 
  c.id,
  c.duplicate_of,
  c.dedup_match_type,
  c.company_id,
  COALESCE(c.email, c.name || '|' || COALESCE(c.surname, ''))
FROM public.clients c
WHERE c.deleted_at IS NOT NULL 
  AND c.marked_duplicate_at IS NOT NULL
  AND c.duplicate_of IS NOT NULL
ON CONFLICT DO NOTHING;