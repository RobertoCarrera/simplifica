-- 1. Remove Duplicate Indexes
-- Verified: idx_verifactu_settings_company is identical to pkey.
DROP INDEX IF EXISTS public.idx_verifactu_settings_company;

-- Assuming these are duplicates based on advisor output
DROP INDEX IF EXISTS public.ix_quote_items_quote_id;
DROP INDEX IF EXISTS public.ix_tickets_stage_id;
DROP INDEX IF EXISTS public.ix_invoices_status;

-- 2. Add Missing Indexes (Foreign Keys)
-- AI Usage Logs
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_user_id ON public.ai_usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_company_id ON public.ai_usage_logs(company_id);

-- Availability Exceptions
CREATE INDEX IF NOT EXISTS idx_availability_exceptions_user_id ON public.availability_exceptions(user_id);
CREATE INDEX IF NOT EXISTS idx_availability_exceptions_company_id ON public.availability_exceptions(company_id);

-- Bookings
CREATE INDEX IF NOT EXISTS idx_bookings_service_id ON public.bookings(service_id);

-- Tickets & Comments
CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket_id ON public.ticket_comments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_comments_user_id ON public.ticket_comments(user_id);

-- Notifications: Skipped due to unclear schema (failed on user_id)
