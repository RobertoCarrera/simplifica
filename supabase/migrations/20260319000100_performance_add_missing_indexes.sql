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

CREATE INDEX IF NOT EXISTS idx_clients_status
  ON public.clients(status);

-- invoices (9+ frontend queries)
CREATE INDEX IF NOT EXISTS idx_invoices_company_id
  ON public.invoices(company_id);

CREATE INDEX IF NOT EXISTS idx_invoices_client_id
  ON public.invoices(client_id);

CREATE INDEX IF NOT EXISTS idx_invoices_company_date
  ON public.invoices(company_id, invoice_date DESC);

-- quotes (14+ frontend queries)
CREATE INDEX IF NOT EXISTS idx_quotes_company_id
  ON public.quotes(company_id);

CREATE INDEX IF NOT EXISTS idx_quotes_client_id
  ON public.quotes(client_id);

CREATE INDEX IF NOT EXISTS idx_quotes_company_date
  ON public.quotes(company_id, quote_date DESC);

CREATE INDEX IF NOT EXISTS idx_quotes_client_status
  ON public.quotes(client_id, status);

-- ============================================================
-- PHASE 3: MEDIUM — Secondary tables
-- ============================================================

-- tickets (6+ frontend queries, paginated)
CREATE INDEX IF NOT EXISTS idx_tickets_company_id
  ON public.tickets(company_id);

CREATE INDEX IF NOT EXISTS idx_tickets_company_created
  ON public.tickets(company_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- ticket_stages (6 queries)
CREATE INDEX IF NOT EXISTS idx_ticket_stages_company_id
  ON public.ticket_stages(company_id);

-- addresses (9 queries via relations)
-- Note: addresses table uses usuario_id (references auth.users.id), not client_id
CREATE INDEX IF NOT EXISTS idx_addresses_usuario_id
  ON public.addresses(usuario_id);

-- payment transactions (webhook lookups)
CREATE INDEX IF NOT EXISTS idx_payment_transactions_external_id
  ON public.payment_transactions(external_id, provider);

-- invoices: payment_link_token lookup (public payment flow)
CREATE INDEX IF NOT EXISTS idx_invoices_payment_link_token
  ON public.invoices(payment_link_token)
  WHERE payment_link_token IS NOT NULL;
