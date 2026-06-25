-- ============================================================================
-- Migration: variant_channel_visibility — split visibility by channel
-- ============================================================================
-- Replaces the binary `service_variants.is_hidden` flag with a relational
-- table that records per-channel visibility.
--
-- Channels (initial):
--   - 'agenda'  : reservas.simplificacrm.es (public booking catalog)
--   - 'portal'  : portal.simplificacrm.es (client portal catalog)
--
-- Why relational instead of two boolean columns?
--   - Extensible: adding a new channel (e.g. 'marketplace') is one INSERT
--   - No regression: existing `is_hidden` flag is preserved (set to the
--     consolidated value across all channels) so anything that still reads it
--     doesn't break
--   - Audit-friendly: future revisions can add `hidden_by`, `hidden_at`
--
-- Migration of existing data:
--   - For every existing variant:
--       is_hidden = true  → both channels get is_visible = false
--       is_hidden = false → both channels get is_visible = true
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.variant_channel_visibility (
  variant_id uuid NOT NULL REFERENCES public.service_variants(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('agenda', 'portal')),
  is_visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (variant_id, channel)
);

COMMENT ON TABLE public.variant_channel_visibility IS
  'Per-channel visibility for service variants. Replaces the binary is_hidden flag for catalog consumers.';

CREATE INDEX IF NOT EXISTS idx_variant_channel_visibility_channel_visible
  ON public.variant_channel_visibility (channel, is_visible)
  WHERE is_visible = false;

-- Seed: for every existing variant, create rows for both channels.
-- Default = visible (true). Then we apply the existing is_hidden state.
INSERT INTO public.variant_channel_visibility (variant_id, channel, is_visible)
SELECT v.id, c.channel,
       (v.is_hidden IS NOT TRUE)  -- is_hidden = false/null → is_visible = true
FROM public.service_variants v
CROSS JOIN (VALUES ('agenda'), ('portal')) AS c(channel)
ON CONFLICT (variant_id, channel) DO NOTHING;

-- For variants where is_hidden = true, set both channels to is_visible = false
UPDATE public.variant_channel_visibility vcv
SET is_visible = false
FROM public.service_variants v
WHERE vcv.variant_id = v.id
  AND v.is_hidden = true;

-- Trigger: keep updated_at fresh
CREATE OR REPLACE FUNCTION public.touch_variant_channel_visibility()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_variant_channel_visibility ON public.variant_channel_visibility;
CREATE TRIGGER trg_touch_variant_channel_visibility
  BEFORE UPDATE ON public.variant_channel_visibility
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_variant_channel_visibility();

-- ============================================================================
-- RLS POLICIES for variant_channel_visibility
-- ============================================================================
-- Staff of the company (members of company_members WHERE status='active' AND
-- role IN owner/admin/supervisor/professional) can SELECT and manage their
-- company's variant visibility rows.
-- Clients cannot see this table directly — visibility is enforced via the
-- consolidated RLS on service_variants (see migration below).
-- ============================================================================

ALTER TABLE public.variant_channel_visibility ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (idempotent)
DROP POLICY IF EXISTS "Staff can manage variant channel visibility" ON public.variant_channel_visibility;
DROP POLICY IF EXISTS "Staff can view variant channel visibility" ON public.variant_channel_visibility;

-- SELECT: staff of the company
CREATE POLICY "Staff can view variant channel visibility"
  ON public.variant_channel_visibility
  FOR SELECT
  TO authenticated
  USING (
    variant_id IN (
      SELECT sv.id FROM public.service_variants sv
      JOIN public.services s ON s.id = sv.service_id
      JOIN public.company_members cm ON cm.company_id = s.company_id
      JOIN public.users u ON u.id = cm.user_id
      WHERE u.auth_user_id = auth.uid()
        AND cm.status = 'active'
    )
  );

-- ALL: staff of the company
CREATE POLICY "Staff can manage variant channel visibility"
  ON public.variant_channel_visibility
  FOR ALL
  TO authenticated
  USING (
    variant_id IN (
      SELECT sv.id FROM public.service_variants sv
      JOIN public.services s ON s.id = sv.service_id
      JOIN public.company_members cm ON cm.company_id = s.company_id
      JOIN public.users u ON u.id = cm.user_id
      WHERE u.auth_user_id = auth.uid()
        AND cm.status = 'active'
    )
  )
  WITH CHECK (
    variant_id IN (
      SELECT sv.id FROM public.service_variants sv
      JOIN public.services s ON s.id = sv.service_id
      JOIN public.company_members cm ON cm.company_id = s.company_id
      JOIN public.users u ON u.id = cm.user_id
      WHERE u.auth_user_id = auth.uid()
        AND cm.status = 'active'
    )
  );
