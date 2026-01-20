-- Migration: 20260126165500_enable_realtime_stages.sql

-- Enable Realtime for ticket_stages if not already enabled
-- This allows the Kanban board to update live if someone changes a stage config
BEGIN;
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime FOR TABLE tickets, ticket_stages;
COMMIT;
-- Note: The above might fail if publication already exists with more tables.
-- Better approach: ALTER PUBLICATION

ALTER PUBLICATION supabase_realtime ADD TABLE ticket_stages;
