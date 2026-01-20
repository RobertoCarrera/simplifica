-- Migration: 20260126160000_optimize_tickets_performance.sql

-- 1. Index on created_at (Sorting) - Critical for default list view
CREATE INDEX IF NOT EXISTS idx_tickets_created_at 
ON public.tickets (created_at DESC);

-- 2. Index on deleted_at (Soft Delete Filter) - Used in almost every query
CREATE INDEX IF NOT EXISTS idx_tickets_deleted_at 
ON public.tickets (deleted_at) 
WHERE deleted_at IS NULL;

-- 3. Index on stage_id (Filtering by Stage)
CREATE INDEX IF NOT EXISTS idx_tickets_stage_id 
ON public.tickets (stage_id);

-- 4. Index on client_id (Filtering by Client)
CREATE INDEX IF NOT EXISTS idx_tickets_client_id 
ON public.tickets (client_id);

-- 5. Index on is_opened (Filtering Open/Closed)
CREATE INDEX IF NOT EXISTS idx_tickets_is_opened 
ON public.tickets (is_opened);

-- 6. Composite Index for Company + Created At (Common sort per company)
CREATE INDEX IF NOT EXISTS idx_tickets_company_created 
ON public.tickets (company_id, created_at DESC);
