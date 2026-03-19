-- Migration: Add missing indexes on foreign key columns for critical tables
-- Prevents sequential scans on join/filter operations involving FK relationships.
-- Created based on Supabase performance advisor (unindexed_foreign_keys lint).

-- bookings
CREATE INDEX IF NOT EXISTS idx_bookings_company_id      ON public.bookings(company_id);
CREATE INDEX IF NOT EXISTS idx_bookings_resource_id     ON public.bookings(resource_id)   WHERE resource_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_coupon_id       ON public.bookings(coupon_id)     WHERE coupon_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_quote_id        ON public.bookings(quote_id)      WHERE quote_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_room_id         ON public.bookings(room_id)       WHERE room_id IS NOT NULL;

-- clients
CREATE INDEX IF NOT EXISTS idx_clients_assigned_to      ON public.clients(assigned_to)    WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clients_direccion_id     ON public.clients(direccion_id)   WHERE direccion_id IS NOT NULL;

-- company_members
CREATE INDEX IF NOT EXISTS idx_company_members_company  ON public.company_members(company_id);
CREATE INDEX IF NOT EXISTS idx_company_members_role_id  ON public.company_members(role_id) WHERE role_id IS NOT NULL;

-- invoices
CREATE INDEX IF NOT EXISTS idx_invoices_created_by      ON public.invoices(created_by)             WHERE created_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_rectifies       ON public.invoices(rectifies_invoice_id)   WHERE rectifies_invoice_id IS NOT NULL;

-- notifications
CREATE INDEX IF NOT EXISTS idx_notifications_client_recipient ON public.notifications(client_recipient_id) WHERE client_recipient_id IS NOT NULL;

-- projects
CREATE INDEX IF NOT EXISTS idx_projects_client_id       ON public.projects(client_id)    WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_projects_company_id      ON public.projects(company_id);
CREATE INDEX IF NOT EXISTS idx_projects_stage_id        ON public.projects(stage_id)     WHERE stage_id IS NOT NULL;

-- quotes
CREATE INDEX IF NOT EXISTS idx_quotes_ticket_id         ON public.quotes(ticket_id)      WHERE ticket_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quotes_booking_id        ON public.quotes(booking_id)     WHERE booking_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quotes_created_by        ON public.quotes(created_by)     WHERE created_by IS NOT NULL;

-- tickets
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to      ON public.tickets(assigned_to)   WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_created_by       ON public.tickets(created_by)    WHERE created_by IS NOT NULL;

-- users
CREATE INDEX IF NOT EXISTS idx_users_app_role_id        ON public.users(app_role_id)     WHERE app_role_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_company_id         ON public.users(company_id);

-- project_reads: add primary key (table has no PK - data integrity risk)
ALTER TABLE public.project_reads
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.project_reads'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE public.project_reads ADD PRIMARY KEY (id);
  END IF;
END $$;
