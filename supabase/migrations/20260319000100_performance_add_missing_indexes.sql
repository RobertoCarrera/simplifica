-- ============================================================
-- PERFORMANCE AUDIT: Add critical missing indexes
-- Date: 2026-03-19
-- Impact: Fixes full-table scans on every RLS check and all
--         major listing/filtering queries from the frontend.
-- ============================================================

-- ============================================================
-- PHASE 1: CRITICAL — RLS bottleneck + auth lookups
-- ============================================================

-- company_members: used in EVERY RLS policy subquery
-- Without this, PostgreSQL scans the entire table for each row checked
CREATE INDEX IF NOT EXISTS idx_company_members_user_status
  ON public.company_members(user_id, status)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_company_members_user_company_status
  ON public.company_members(user_id, company_id, status);

-- users: auth_user_id lookup on every login/session check
CREATE INDEX IF NOT EXISTS idx_users_auth_user_id
  ON public.users(auth_user_id);

CREATE INDEX IF NOT EXISTS idx_users_company_id
  ON public.users(company_id);

-- ============================================================
-- PHASE 2: HIGH — Main listing tables (most queried from frontend)
-- ============================================================

-- clients (28+ frontend queries)
CREATE INDEX IF NOT EXISTS idx_clients_company_id
  ON public.clients(company_id);

CREATE INDEX IF NOT EXISTS idx_clients_company_created
  ON public.clients(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_clients_email
  ON public.clients(email);

-- clients.status column may not exist in all environments (conditional index creation)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'status'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_clients_status ON public.clients(status)';
  END IF;
END;
$$;

-- invoices (9+ frontend queries)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'invoices') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_invoices_company_id ON public.invoices(company_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON public.invoices(client_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_invoices_company_date ON public.invoices(company_id, invoice_date DESC)';
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'payment_link_token') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_invoices_payment_link_token ON public.invoices(payment_link_token) WHERE payment_link_token IS NOT NULL';
    END IF;
  END IF;
END;
$$;

-- quotes (14+ frontend queries)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'quotes') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_quotes_company_id ON public.quotes(company_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_quotes_client_id ON public.quotes(client_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_quotes_company_date ON public.quotes(company_id, quote_date DESC)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_quotes_client_status ON public.quotes(client_id, status)';
  END IF;
END;
$$;

-- ============================================================
-- PHASE 3: MEDIUM — Secondary tables (conditional — may not exist in all envs)
-- ============================================================

DO $$
BEGIN
  -- tickets (6+ frontend queries, paginated)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tickets') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_tickets_company_id ON public.tickets(company_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_tickets_company_created ON public.tickets(company_id, created_at DESC) WHERE deleted_at IS NULL';
  END IF;

  -- ticket_stages (6 queries)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ticket_stages') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_ticket_stages_company_id ON public.ticket_stages(company_id)';
  END IF;

  -- addresses
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'addresses' AND column_name = 'usuario_id'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_addresses_usuario_id ON public.addresses(usuario_id)';
  END IF;

  -- payment transactions (webhook lookups)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payment_transactions') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_payment_transactions_external_id ON public.payment_transactions(external_id, provider)';
  END IF;
END;
$$;
