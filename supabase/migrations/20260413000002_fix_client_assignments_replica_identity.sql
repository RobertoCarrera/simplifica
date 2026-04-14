-- Fix: Realtime DELETE events on client_assignments do not include non-PK columns in payload.old
-- Root cause: with REPLICA IDENTITY DEFAULT, PostgreSQL only includes PK columns in the
-- old record for DELETE events. The handler in supabase-customers.service.ts reads
-- payload.old?.client_id, which was always undefined, so removed professionals were never
-- reflected in the client list.
-- Fix: set REPLICA IDENTITY FULL so all columns are included in DELETE payloads.

ALTER TABLE public.client_assignments REPLICA IDENTITY FULL;
