-- Migration: Create contracted_services table
-- Models the "Servicio Contratado" entity: a client can have N contracted services,
-- each with name, description, price, currency, start date, status,
-- and an optional recurrence configuration.
--
-- Every contracted service is tied to a client and inherits the client's company for RLS.

--------------------------------------------------------------------------------
-- 1. TABLE DEFINITION
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contracted_services (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Core fields
  name text NOT NULL,
  description text,
  price numeric(10,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  currency text NOT NULL DEFAULT 'EUR',
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'cancelled')),

  -- Recurrence configuration (nullable — only for recurring services)
  recurrence_type text
    CHECK (recurrence_type IS NULL OR recurrence_type IN ('monthly', 'weekly', 'yearly')),
  recurrence_day int
    CHECK (recurrence_day IS NULL OR (recurrence_day >= 1 AND recurrence_day <= 31)),
  recurrence_start date,
  recurrence_end date,

  -- Metadata
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  deleted_at timestamptz
);

--------------------------------------------------------------------------------
-- 2. INDEXES
--------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_contracted_services_client_id
  ON public.contracted_services(client_id);

CREATE INDEX IF NOT EXISTS idx_contracted_services_company_id
  ON public.contracted_services(company_id);

CREATE INDEX IF NOT EXISTS idx_contracted_services_status
  ON public.contracted_services(status)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_contracted_services_recurrence
  ON public.contracted_services(recurrence_type, recurrence_start)
  WHERE recurrence_type IS NOT NULL AND recurrence_start IS NOT NULL;

--------------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY
--------------------------------------------------------------------------------
ALTER TABLE public.contracted_services ENABLE ROW LEVEL SECURITY;

-- SELECT: company members can view contracted services for clients in their company
CREATE POLICY "Company members can view contracted services"
  ON public.contracted_services
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      JOIN users u ON u.id = cm.user_id
      WHERE cm.company_id = contracted_services.company_id
        AND u.auth_user_id = auth.uid()
        AND cm.status = 'active'
    )
  );

-- INSERT: company members can create contracted services for clients in their company
CREATE POLICY "Company members can insert contracted services"
  ON public.contracted_services
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM company_members cm
      JOIN users u ON u.id = cm.user_id
      WHERE cm.company_id = contracted_services.company_id
        AND u.auth_user_id = auth.uid()
        AND cm.status = 'active'
    )
  );

-- UPDATE: company members can update contracted services for clients in their company
CREATE POLICY "Company members can update contracted services"
  ON public.contracted_services
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      JOIN users u ON u.id = cm.user_id
      WHERE cm.company_id = contracted_services.company_id
        AND u.auth_user_id = auth.uid()
        AND cm.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM company_members cm
      JOIN users u ON u.id = cm.user_id
      WHERE cm.company_id = contracted_services.company_id
        AND u.auth_user_id = auth.uid()
        AND cm.status = 'active'
    )
  );

-- DELETE: company members can soft-delete (set deleted_at) for clients in their company
CREATE POLICY "Company members can delete contracted services"
  ON public.contracted_services
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      JOIN users u ON u.id = cm.user_id
      WHERE cm.company_id = contracted_services.company_id
        AND u.auth_user_id = auth.uid()
        AND cm.status = 'active'
    )
  );

--------------------------------------------------------------------------------
-- 4. UPDATED_AT TRIGGER
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_contracted_services_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contracted_services_updated_at ON public.contracted_services;
CREATE TRIGGER trg_contracted_services_updated_at
  BEFORE UPDATE ON public.contracted_services
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_contracted_services_updated_at();

--------------------------------------------------------------------------------
-- 5. COMMENTS
--------------------------------------------------------------------------------
COMMENT ON TABLE public.contracted_services IS 'Servicios contratados por clientes. Cada cliente puede tener N servicios contratados con configuración de recurrencia opcional.';

COMMENT ON COLUMN public.contracted_services.id IS 'UUID v4 primary key';
COMMENT ON COLUMN public.contracted_services.client_id IS 'FK → clients.id. Client who contracted this service.';
COMMENT ON COLUMN public.contracted_services.company_id IS 'FK → companies.id. Company scope for RLS (inherited from client).';
COMMENT ON COLUMN public.contracted_services.name IS 'Human-readable service name (e.g., "Mantenimiento mensual de equipos").';
COMMENT ON COLUMN public.contracted_services.description IS 'Optional detailed description of the contracted service.';
COMMENT ON COLUMN public.contracted_services.price IS 'Agreed price for the service in the specified currency.';
COMMENT ON COLUMN public.contracted_services.currency IS 'ISO 4217 currency code (EUR, USD, etc.). Default: EUR.';
COMMENT ON COLUMN public.contracted_services.start_date IS 'Date the service contract started (fecha de alta).';
COMMENT ON COLUMN public.contracted_services.status IS 'Current status: active, paused, or cancelled.';
COMMENT ON COLUMN public.contracted_services.recurrence_type IS 'Recurrence cadence: monthly, weekly, or yearly. NULL if non-recurring.';
COMMENT ON COLUMN public.contracted_services.recurrence_day IS 'Day of generation. For monthly: 1-28/31. For weekly: 1-7 (Mon-Sun). For yearly: day of year or month-day encoded. NULL if non-recurring.';
COMMENT ON COLUMN public.contracted_services.recurrence_start IS 'First recurrence generation date. NULL if non-recurring.';
COMMENT ON COLUMN public.contracted_services.recurrence_end IS 'Optional end date for recurrence. NULL = no end (indefinite).';
COMMENT ON COLUMN public.contracted_services.created_at IS 'Record creation timestamp.';
COMMENT ON COLUMN public.contracted_services.updated_at IS 'Last update timestamp (auto-maintained by trigger).';
COMMENT ON COLUMN public.contracted_services.created_by IS 'FK → users.id. Who created this contracted service.';
COMMENT ON COLUMN public.contracted_services.deleted_at IS 'Soft-delete timestamp. NULL means active record.';
