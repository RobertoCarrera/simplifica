-- Migration: Intelligent recipient autocomplete for webmail composer
-- RPC that suggests recipients from 4 prioritized sources:
--   1. Recent recipients (from sent folder, scored by frequency)
--   2. Team members (same company_id, scored 75)
--   3. Customers (clients with bookings, scored 50)
--   4. Address book contacts (mail_contacts, scored 25)
-- Results are UNION'd and ordered by score DESC, limited to p_limit total.
-- SECURITY DEFINER ensures the RPC can read across tables for the authenticated user.

CREATE OR REPLACE FUNCTION public.suggest_recipients_rpc(
  p_query TEXT,
  p_limit INT DEFAULT 10
)
RETURNS TABLE(
  email TEXT,
  name TEXT,
  source TEXT,
  score INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID;
  v_company_id UUID;
  v_account_ids UUID[];
BEGIN
  -- Guard: empty query returns nothing
  IF p_query IS NULL OR TRIM(p_query) = '' THEN
    RETURN;
  END IF;

  -- Resolve the calling user's internal ID
  SELECT u.id INTO v_user_id
  FROM public.users u
  WHERE u.auth_user_id = auth.uid();

  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Resolve the user's active company
  SELECT cm.company_id INTO v_company_id
  FROM public.company_members cm
  WHERE cm.user_id = v_user_id
    AND cm.status = 'active'
  LIMIT 1;

  -- Collect active mail accounts for this user
  SELECT array_agg(ma.id) INTO v_account_ids
  FROM public.mail_accounts ma
  WHERE ma.user_id = v_user_id
    AND ma.is_active = true;

  -- Deduplicate across sources: DISTINCT ON (r_email) keeps the row with
  -- the highest score per email, so a team member who was also a recent
  -- recipient appears only once, with the higher 'recent' score.
  RETURN QUERY
  SELECT DISTINCT ON (results.r_email)
    results.r_email,
    results.r_name,
    results.r_source,
    results.r_score
  FROM (
    ------------------------------------------------------------------
    -- Source 1: Recent recipients (from sent folder, most frequent first)
    ------------------------------------------------------------------
    SELECT
      LOWER(recipient->>'email') AS r_email,
      COALESCE(
        NULLIF(TRIM(recipient->>'name'), ''),
        split_part(recipient->>'email', '@', 1)
      ) AS r_name,
      'recent'::TEXT AS r_source,
      (100 + COUNT(*))::INT AS r_score
    FROM public.mail_messages mm,
         jsonb_array_elements(mm."to") AS recipient,
         public.mail_folders mf
    WHERE v_account_ids IS NOT NULL
      AND mm.account_id = ANY(v_account_ids)
      AND mm.folder_id = mf.id
      AND mf.system_role = 'sent'
      AND recipient->>'email' IS NOT NULL
      AND recipient->>'email' != ''
      AND (
        LOWER(recipient->>'email') LIKE '%' || LOWER(p_query) || '%'
        OR LOWER(COALESCE(recipient->>'name', '')) LIKE '%' || LOWER(p_query) || '%'
      )
    GROUP BY LOWER(recipient->>'email'), recipient->>'name'
    HAVING COUNT(*) >= 1

    UNION ALL

    ------------------------------------------------------------------
    -- Source 2: Team members (same company)
    ------------------------------------------------------------------
    SELECT
      LOWER(u.email) AS r_email,
      COALESCE(
        NULLIF(TRIM(COALESCE(u.name, '') || ' ' || COALESCE(u.surname, '')), ''),
        u.email
      ) AS r_name,
      'team'::TEXT AS r_source,
      75::INT AS r_score
    FROM public.company_members cm
    JOIN public.users u ON u.id = cm.user_id
    WHERE v_company_id IS NOT NULL
      AND cm.company_id = v_company_id
      AND cm.status = 'active'
      AND u.email IS NOT NULL
      AND (
        LOWER(u.email) LIKE '%' || LOWER(p_query) || '%'
        OR LOWER(COALESCE(u.name, '')) LIKE '%' || LOWER(p_query) || '%'
        OR LOWER(COALESCE(u.surname, '')) LIKE '%' || LOWER(p_query) || '%'
      )

    UNION ALL

    ------------------------------------------------------------------
    -- Source 3: Customers (clients with bookings in the user's company)
    ------------------------------------------------------------------
    SELECT DISTINCT ON (LOWER(c.email))
      LOWER(c.email) AS r_email,
      COALESCE(
        NULLIF(TRIM(COALESCE(c.name, '') || ' ' || COALESCE(c.surname, '')), ''),
        c.email
      ) AS r_name,
      'customer'::TEXT AS r_source,
      50::INT AS r_score
    FROM public.clients c
    WHERE v_company_id IS NOT NULL
      AND c.company_id = v_company_id
      AND c.email IS NOT NULL
      AND c.email != ''
      AND EXISTS (
        SELECT 1
        FROM public.bookings b
        WHERE b.client_id = c.id
          AND b.company_id = v_company_id
      )
      AND (
        LOWER(c.email) LIKE '%' || LOWER(p_query) || '%'
        OR LOWER(COALESCE(c.name, '')) LIKE '%' || LOWER(p_query) || '%'
        OR LOWER(COALESCE(c.surname, '')) LIKE '%' || LOWER(p_query) || '%'
      )

    UNION ALL

    ------------------------------------------------------------------
    -- Source 4: Address book contacts (mail_contacts table)
    ------------------------------------------------------------------
    SELECT
      LOWER(mc.email) AS r_email,
      COALESCE(
        NULLIF(TRIM(mc.name), ''),
        mc.email
      ) AS r_name,
      'contact'::TEXT AS r_source,
      25::INT AS r_score
    FROM public.mail_contacts mc
    WHERE mc.user_id = v_user_id
      AND mc.email IS NOT NULL
      AND (
        LOWER(mc.email) LIKE '%' || LOWER(p_query) || '%'
        OR LOWER(COALESCE(mc.name, '')) LIKE '%' || LOWER(p_query) || '%'
      )
  ) results
  ORDER BY results.r_email, results.r_score DESC
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION public.suggest_recipients_rpc(TEXT, INT)
  IS 'Intelligent recipient autocomplete: suggests recipients from 4 sources (recent, team, customer, contact), ranked by priority. Used by the webmail composer To/Cc/Bcc fields.';

GRANT EXECUTE ON FUNCTION public.suggest_recipients_rpc(TEXT, INT) TO authenticated;
