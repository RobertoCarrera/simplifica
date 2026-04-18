-- Migration: Add multi-session bonus system (bonos/abonamientos)
-- Priority: High (New feature for abonamientos)
-- Replaces: N/A (new system)
--
-- What this adds:
--   1. New columns on service_variants (is_bono, session_count, sessions_remaining, max_sessions_per_booking)
--   2. New client_bonuses table (tracks each purchased bono per client)
--   3. RPCs: create_client_bono, use_client_bono, get_client_bonuses
--------------------------------------------------------------------------------
-- 1. Add bono columns to service_variants
--------------------------------------------------------------------------------
ALTER TABLE public.service_variants
  ADD COLUMN IF NOT EXISTS session_count INTEGER,           -- e.g. 10 sessions (NULL = unlimited/single)
  ADD COLUMN IF NOT EXISTS sessions_remaining INTEGER,       -- remaining sessions (NULL = unlimited/single)
  ADD COLUMN IF NOT EXISTS is_bono BOOLEAN DEFAULT false,    -- true if this variant is a bono
  ADD COLUMN IF NOT EXISTS max_sessions_per_booking INTEGER DEFAULT 1; -- sessions deducted per booking

COMMENT ON COLUMN public.service_variants.session_count IS 'Total sessions in this bono (e.g. 10). NULL = single/unlimited.';
COMMENT ON COLUMN public.service_variants.sessions_remaining IS 'Remaining sessions. NULL = single/unlimited.';
COMMENT ON COLUMN public.service_variants.is_bono IS 'True if this variant represents a multi-session bono/abonamiento.';
COMMENT ON COLUMN public.service_variants.max_sessions_per_booking IS 'How many sessions to deduct per booking (default 1).';

--------------------------------------------------------------------------------
-- 2. Create client_bonuses table
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.client_bonuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES public.service_variants(id) ON DELETE RESTRICT,
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  company_id UUID NOT NULL,
  sessions_total INTEGER NOT NULL,          -- original sessions purchased
  sessions_used INTEGER DEFAULT 0,          -- sessions consumed so far
  sessions_remaining INTEGER NOT NULL,      -- remaining sessions
  purchase_date TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,                   -- nullable, NULL = no expiry
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookups by client
CREATE INDEX IF NOT EXISTS idx_client_bonuses_client_id ON public.client_bonuses(client_id);
-- Index for fast lookups by variant+client (used in use_client_bono)
CREATE INDEX IF NOT EXISTS idx_client_bonuses_client_variant ON public.client_bonuses(client_id, variant_id, service_id, company_id);

--------------------------------------------------------------------------------
-- 3. RLS on client_bonuses
--------------------------------------------------------------------------------
ALTER TABLE public.client_bonuses ENABLE ROW LEVEL SECURITY;

-- Read: any active company member
CREATE POLICY "client_bonuses_select" ON public.client_bonuses
  FOR SELECT USING (
    company_id IN (
      SELECT company_id FROM public.company_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Write/Delete: only owner and super_admin
CREATE POLICY "client_bonuses_all" ON public.client_bonuses
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.company_members
      WHERE user_id = auth.uid()
        AND company_id = client_bonuses.company_id
        AND role IN ('owner', 'super_admin')
        AND is_active = true
    )
  );

--------------------------------------------------------------------------------
-- 4. RPC: create_client_bono
--    Called when a booking is confirmed and payment completes for a bono variant.
--    Creates a new client_bonuses record.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_client_bono(
  p_client_id UUID,
  p_variant_id UUID,
  p_service_id UUID,
  p_company_id UUID,
  p_sessions_total INTEGER,
  p_expires_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS client_bonuses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_bono client_bonuses;
BEGIN
  INSERT INTO client_bonuses (
    client_id, variant_id, service_id, company_id,
    sessions_total, sessions_remaining, expires_at
  )
  VALUES (
    p_client_id, p_variant_id, p_service_id, p_company_id,
    p_sessions_total, p_sessions_total, p_expires_at
  )
  RETURNING * INTO v_bono;

  RETURN v_bono;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_client_bono TO authenticated;

--------------------------------------------------------------------------------
-- 5. RPC: use_client_bono
--    Deducts sessions from the oldest active bono for a client/variant/service.
--    Called when a booking that uses a bono variant is confirmed.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.use_client_bono(
  p_client_id UUID,
  p_variant_id UUID,
  p_service_id UUID,
  p_company_id UUID,
  p_sessions_to_use INTEGER DEFAULT 1
)
RETURNS TABLE(bonus_id UUID, sessions_remaining INTEGER, success BOOLEAN, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER AS $$
DECLARE
  v_bonus client_bonuses%ROWTYPE;
BEGIN
  -- Find the oldest active bono with enough remaining sessions
  SELECT * INTO v_bonus
  FROM client_bonuses
  WHERE client_id = p_client_id
    AND variant_id = p_variant_id
    AND service_id = p_service_id
    AND company_id = p_company_id
    AND is_active = true
    AND sessions_remaining >= p_sessions_to_use
    AND (expires_at IS NULL OR expires_at > now())
  ORDER BY purchase_date ASC
  LIMIT 1
  FOR UPDATE;

  IF v_bonus.id IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, NULL::INTEGER, false,
      'No hay bono disponible o no quedan sesiones'::TEXT;
    RETURN;
  END IF;

  UPDATE client_bonuses
  SET sessions_used = sessions_used + p_sessions_to_use,
      sessions_remaining = sessions_remaining - p_sessions_to_use,
      updated_at = now()
  WHERE id = v_bonus.id;

  RETURN QUERY
  SELECT v_bonus.id, (v_bonus.sessions_remaining - p_sessions_to_use), true,
    'Bono utilizado correctamente'::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.use_client_bono TO authenticated;

--------------------------------------------------------------------------------
-- 6. RPC: get_client_bonuses
--    Returns all active bonos for a client (joined with variant/service names).
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_client_bonuses(p_client_id UUID)
RETURNS TABLE(
  id UUID,
  variant_id UUID,
  service_id UUID,
  sessions_total INTEGER,
  sessions_used INTEGER,
  sessions_remaining INTEGER,
  purchase_date TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN,
  variant_name TEXT,
  service_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    cb.id,
    cb.variant_id,
    cb.service_id,
    cb.sessions_total,
    cb.sessions_used,
    cb.sessions_remaining,
    cb.purchase_date,
    cb.expires_at,
    cb.is_active,
    sv.variant_name,
    s.name AS service_name
  FROM client_bonuses cb
  JOIN service_variants sv ON sv.id = cb.variant_id
  JOIN services s ON s.id = cb.service_id
  WHERE cb.client_id = p_client_id
    AND cb.company_id IN (
      SELECT company_id FROM company_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  ORDER BY cb.purchase_date DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_client_bonuses TO authenticated;
