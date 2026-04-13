-- =================================================================
-- 1. Fix ambiguous "id" in get_client_clinical_notes()
--    The RETURNS TABLE(id uuid, ...) creates a PL/pgSQL variable
--    that conflicts with unqualified "id" in subqueries.
-- =================================================================
CREATE OR REPLACE FUNCTION public.get_client_clinical_notes(p_client_id uuid)
RETURNS TABLE (
  id              uuid,
  client_id       uuid,
  content         text,
  created_at      timestamptz,
  created_by_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_has_access boolean;
BEGIN
  -- Permission check (qualify all column refs to avoid ambiguity)
  SELECT EXISTS (
    SELECT 1 FROM public.clients c
    JOIN public.company_members cm ON c.company_id = cm.company_id
    WHERE c.id = p_client_id
      AND cm.user_id = (SELECT u.id FROM public.users u WHERE u.auth_user_id = auth.uid())
      AND cm.status = 'active'
  ) INTO v_has_access;

  IF NOT v_has_access THEN
    RAISE EXCEPTION 'Access denied: user is not an active member of this client''s company';
  END IF;

  -- Decrypt each note using its own key version
  RETURN QUERY
  SELECT
    n.id,
    n.client_id,
    extensions.pgp_sym_decrypt(
      n.content::bytea,
      (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'clinical_encryption_key_v' || n.key_version::TEXT
      )
    ) AS content,
    n.created_at,
    u.name AS created_by_name
  FROM public.client_clinical_notes n
  LEFT JOIN public.users u ON n.created_by = u.id
  WHERE n.client_id = p_client_id
  ORDER BY n.created_at DESC;
END;
$$;

-- =================================================================
-- 2. Add missing columns to bookings table
--    The Angular frontend expects: client_id, payment_status,
--    total_price, currency
-- =================================================================
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('paid', 'pending', 'partial', 'refunded'));
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS total_price NUMERIC(10,2);
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'EUR';

-- Index for client_id lookups (used in client profile bookings tab)
CREATE INDEX IF NOT EXISTS idx_bookings_client ON public.bookings(client_id);
