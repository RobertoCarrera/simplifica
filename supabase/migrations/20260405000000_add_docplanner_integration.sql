-- ============================================================
-- Add DocPlanner (Doctoralia) integration
-- 2026-04-05
-- Idempotent: safe to re-run if a previous attempt partially applied.
-- ============================================================

-- 1. docplanner_integrations table (company-scoped, one row per company)
CREATE TABLE IF NOT EXISTS public.docplanner_integrations (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                uuid        NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id_encrypted       text        NOT NULL,
  client_secret_encrypted   text        NOT NULL,
  access_token_encrypted    text,
  token_expires_at          timestamptz,
  facility_id               text,
  facility_name             text,
  is_active                 boolean     NOT NULL DEFAULT false,
  sync_bookings             boolean     NOT NULL DEFAULT true,
  sync_patients             boolean     NOT NULL DEFAULT true,
  auto_sync                 boolean     NOT NULL DEFAULT false,
  sync_interval_minutes     integer     NOT NULL DEFAULT 30 CHECK (sync_interval_minutes >= 5),
  doctor_mappings           jsonb       NOT NULL DEFAULT '[]'::jsonb,
  last_sync_at              timestamptz,
  last_sync_status          text        CHECK (last_sync_status IN ('success', 'partial', 'error')),
  last_sync_message         text,
  webhook_secret            text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.docplanner_integrations IS
  'Stores encrypted DocPlanner OAuth credentials per company. Tokens are AES-256-GCM encrypted and never exposed to the client.';
COMMENT ON COLUMN public.docplanner_integrations.client_id_encrypted IS
  'AES-256-GCM encrypted DocPlanner OAuth client_id.';
COMMENT ON COLUMN public.docplanner_integrations.client_secret_encrypted IS
  'AES-256-GCM encrypted DocPlanner OAuth client_secret.';
COMMENT ON COLUMN public.docplanner_integrations.access_token_encrypted IS
  'AES-256-GCM encrypted DocPlanner access token. Auto-refreshed every 24h via client_credentials grant.';
COMMENT ON COLUMN public.docplanner_integrations.doctor_mappings IS
  'JSON array mapping DocPlanner doctor IDs to Simplifica professional IDs: [{"dp_doctor_id": "...", "dp_doctor_name": "...", "professional_id": "uuid", "address_id": "..."}]';

ALTER TABLE public.docplanner_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "docplanner_integrations_select" ON public.docplanner_integrations;
CREATE POLICY "docplanner_integrations_select" ON public.docplanner_integrations
  FOR SELECT USING (
    company_id IN (
      SELECT cm.company_id
      FROM   public.company_members cm
      WHERE  cm.user_id = public.get_my_user_id()
    )
  );

DROP POLICY IF EXISTS "docplanner_integrations_write" ON public.docplanner_integrations;
CREATE POLICY "docplanner_integrations_write" ON public.docplanner_integrations
  FOR ALL
  USING      (public.is_company_admin(company_id))
  WITH CHECK (public.is_company_admin(company_id));

CREATE INDEX IF NOT EXISTS idx_docplanner_integrations_company_id
  ON public.docplanner_integrations(company_id);

-- ─────────────────────────────────────────────────────────────
-- 2. Sync log table for audit trail
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.docplanner_sync_log (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sync_type       text        NOT NULL CHECK (sync_type IN ('bookings', 'patients', 'full', 'webhook')),
  direction       text        NOT NULL CHECK (direction IN ('pull', 'push', 'bidirectional')),
  status          text        NOT NULL CHECK (status IN ('started', 'success', 'partial', 'error')),
  records_synced  integer     NOT NULL DEFAULT 0,
  records_failed  integer     NOT NULL DEFAULT 0,
  error_details   jsonb,
  started_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.docplanner_sync_log IS
  'Audit log for DocPlanner synchronization operations.';

ALTER TABLE public.docplanner_sync_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "docplanner_sync_log_select" ON public.docplanner_sync_log;
CREATE POLICY "docplanner_sync_log_select" ON public.docplanner_sync_log
  FOR SELECT USING (
    company_id IN (
      SELECT cm.company_id
      FROM   public.company_members cm
      WHERE  cm.user_id = public.get_my_user_id()
    )
  );

DROP POLICY IF EXISTS "docplanner_sync_log_insert_service" ON public.docplanner_sync_log;
CREATE POLICY "docplanner_sync_log_insert_service" ON public.docplanner_sync_log
  FOR INSERT WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_docplanner_sync_log_company_id ON public.docplanner_sync_log(company_id);
CREATE INDEX IF NOT EXISTS idx_docplanner_sync_log_created_at ON public.docplanner_sync_log(created_at DESC);

-- ─────────────────────────────────────────────────────────────
-- 3. Add docplanner_booking_id to bookings for traceability
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS docplanner_booking_id text;

COMMENT ON COLUMN public.bookings.docplanner_booking_id IS
  'DocPlanner booking ID for bookings synced from/to Doctoralia. Null = not a DocPlanner booking.';

CREATE INDEX IF NOT EXISTS idx_bookings_docplanner_id
  ON public.bookings(docplanner_booking_id)
  WHERE docplanner_booking_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 4. Add docplanner_patient_id to clients for mapping
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS docplanner_patient_id text;

COMMENT ON COLUMN public.clients.docplanner_patient_id IS
  'DocPlanner patient ID for clients synced from Doctoralia. Null = not a DocPlanner client.';

CREATE INDEX IF NOT EXISTS idx_clients_docplanner_patient_id
  ON public.clients(docplanner_patient_id)
  WHERE docplanner_patient_id IS NOT NULL;
