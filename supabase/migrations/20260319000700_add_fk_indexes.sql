-- Migration: Add missing indexes on foreign key columns for critical tables
-- Prevents sequential scans on join/filter operations involving FK relationships.
-- Created based on Supabase performance advisor (unindexed_foreign_keys lint).
-- All index creation is conditional to handle environments where columns may not exist.

-- Helper: create index on column only if that column exists in the table
DO $$
DECLARE
  col_exists BOOLEAN;
BEGIN
  -- bookings
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'bookings') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_bookings_company_id ON public.bookings(company_id)';

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'resource_id') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_bookings_resource_id ON public.bookings(resource_id) WHERE resource_id IS NOT NULL';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'coupon_id') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_bookings_coupon_id ON public.bookings(coupon_id) WHERE coupon_id IS NOT NULL';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'quote_id') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_bookings_quote_id ON public.bookings(quote_id) WHERE quote_id IS NOT NULL';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'room_id') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_bookings_room_id ON public.bookings(room_id) WHERE room_id IS NOT NULL';
    END IF;
  END IF;

  -- clients
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'assigned_to') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_clients_assigned_to ON public.clients(assigned_to) WHERE assigned_to IS NOT NULL';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'direccion_id') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_clients_direccion_id ON public.clients(direccion_id) WHERE direccion_id IS NOT NULL';
  END IF;

  -- company_members
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_company_members_company ON public.company_members(company_id)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_company_members_role_id ON public.company_members(role_id) WHERE role_id IS NOT NULL';

  -- invoices
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'invoices') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'created_by') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_invoices_created_by ON public.invoices(created_by) WHERE created_by IS NOT NULL';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'rectifies_invoice_id') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_invoices_rectifies ON public.invoices(rectifies_invoice_id) WHERE rectifies_invoice_id IS NOT NULL';
    END IF;
  END IF;

  -- notifications
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'notifications') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'client_recipient_id') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_notifications_client_recipient ON public.notifications(client_recipient_id) WHERE client_recipient_id IS NOT NULL';
    END IF;
  END IF;

  -- projects
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'projects') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'client_id') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_projects_client_id ON public.projects(client_id) WHERE client_id IS NOT NULL';
    END IF;
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_projects_company_id ON public.projects(company_id)';
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'projects' AND column_name = 'stage_id') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_projects_stage_id ON public.projects(stage_id) WHERE stage_id IS NOT NULL';
    END IF;
  END IF;

  -- quotes
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'quotes') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'quotes' AND column_name = 'ticket_id') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_quotes_ticket_id ON public.quotes(ticket_id) WHERE ticket_id IS NOT NULL';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'quotes' AND column_name = 'booking_id') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_quotes_booking_id ON public.quotes(booking_id) WHERE booking_id IS NOT NULL';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'quotes' AND column_name = 'created_by') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_quotes_created_by ON public.quotes(created_by) WHERE created_by IS NOT NULL';
    END IF;
  END IF;

  -- tickets
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tickets') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'assigned_to') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to ON public.tickets(assigned_to) WHERE assigned_to IS NOT NULL';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'created_by') THEN
      EXECUTE 'CREATE INDEX IF NOT EXISTS idx_tickets_created_by ON public.tickets(created_by) WHERE created_by IS NOT NULL';
    END IF;
  END IF;

  -- users
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_users_app_role_id ON public.users(app_role_id) WHERE app_role_id IS NOT NULL';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_users_company_id_v2 ON public.users(company_id)';

  -- project_reads: add primary key (table has no PK - data integrity risk)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'project_reads') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'project_reads' AND column_name = 'id') THEN
      EXECUTE 'ALTER TABLE public.project_reads ADD COLUMN id uuid DEFAULT gen_random_uuid()';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.project_reads'::regclass AND contype = 'p'
    ) THEN
      EXECUTE 'ALTER TABLE public.project_reads ADD PRIMARY KEY (id)';
    END IF;
  END IF;

END;
$$;
