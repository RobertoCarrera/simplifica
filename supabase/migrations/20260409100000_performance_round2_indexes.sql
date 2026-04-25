-- Performance Round 2: Critical & High Priority Indexes
-- Applied to production via MCP apply_migration (name: performance_round2_indexes)

-- Notifications: recipient reads (most frequent query pattern)
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created
  ON public.notifications (recipient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread
  ON public.notifications (recipient_id, is_read, created_at DESC)
  WHERE is_read = false;

CREATE INDEX IF NOT EXISTS idx_notifications_client_recipient_created
  ON public.notifications (client_recipient_id, created_at DESC);

-- Bookings: client history queries
CREATE INDEX IF NOT EXISTS idx_bookings_client_start_time
  ON public.bookings (client_id, start_time DESC);

-- GDPR consent records: compliance queries
CREATE INDEX IF NOT EXISTS idx_gdpr_consent_records_company_active
  ON public.gdpr_consent_records (company_id, is_active)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_gdpr_consent_records_company_created
  ON public.gdpr_consent_records (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gdpr_consent_records_subject_company
  ON public.gdpr_consent_records (subject_email, company_id);

-- Clients: case-insensitive search (partial index on active clients)
CREATE INDEX IF NOT EXISTS idx_clients_company_email_func
  ON public.clients (company_id, lower(email))
  WHERE deleted_at IS NULL AND email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clients_company_name_lower
  ON public.clients (company_id, lower(name), lower(surname))
  WHERE deleted_at IS NULL AND name IS NOT NULL;

-- Tickets: client history
CREATE INDEX IF NOT EXISTS idx_tickets_client_updated
  ON public.tickets (client_id, updated_at);

-- Update planner statistics
ANALYZE public.notifications;
ANALYZE public.bookings;
ANALYZE public.gdpr_consent_records;
ANALYZE public.clients;
ANALYZE public.tickets;
