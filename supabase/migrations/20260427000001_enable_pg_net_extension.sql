-- Migration: enable_pg_net_extension
-- Status: applied
-- Date: 2026-04-27
-- Purpose: Ensure pg_net extension is enabled for HTTP requests from PostgreSQL.
-- Required by: notify_session_created trigger (calls net.http_post to Edge Functions).

CREATE EXTENSION IF NOT EXISTS pg_net;