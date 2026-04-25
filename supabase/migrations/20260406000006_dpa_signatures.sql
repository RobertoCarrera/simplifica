-- Migration: DPA Signatures table
-- Tracks when each tenant (company) accepts the Data Processing Agreement (DPA) with Roberto.
-- Required for RGPD Art. 28 compliance — records the moment of acceptance.

CREATE TABLE IF NOT EXISTS public.dpa_signatures (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id     UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  signed_by      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  signed_at      TIMESTAMPTZ DEFAULT now() NOT NULL,
  dpa_version    TEXT        NOT NULL DEFAULT '1.1',
  ip_address     TEXT,
  user_agent     TEXT,
  signature_data TEXT,       -- base64 PNG of drawn signature (optional)
  created_at     TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX idx_dpa_signatures_company_id ON public.dpa_signatures(company_id);
CREATE INDEX idx_dpa_signatures_signed_at  ON public.dpa_signatures(signed_at DESC);
ALTER TABLE public.dpa_signatures ENABLE ROW LEVEL SECURITY;

-- Company members can read their own company's signatures
CREATE POLICY "dpa_signatures_select_own_company"
  ON public.dpa_signatures FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM public.company_members
      WHERE user_id = auth.uid()
    )
  );

-- Any authenticated member of the company can insert a DPA signature
CREATE POLICY "dpa_signatures_insert_own_company"
  ON public.dpa_signatures FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.company_members
      WHERE user_id = auth.uid()
    )
  );

-- Deletion not allowed via app — only via admin/service_role
CREATE POLICY "dpa_signatures_no_delete"
  ON public.dpa_signatures FOR DELETE
  USING (false);

-- Helper RPC: check if a company has a valid DPA signature
CREATE OR REPLACE FUNCTION public.has_valid_dpa(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.dpa_signatures
    WHERE company_id = p_company_id
  );
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.has_valid_dpa(UUID) TO authenticated;
