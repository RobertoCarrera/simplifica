-- Add is_active boolean to clients to distinguish active vs. deactivated (soft) entries
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'clients' AND column_name = 'is_active'
    ) THEN
        ALTER TABLE public.clients ADD COLUMN is_active BOOLEAN DEFAULT true;
        -- Backfill: mark all existing non-deleted as active
        UPDATE public.clients SET is_active = true WHERE deleted_at IS NULL;
        -- Optional: for any rows previously flagged as inactive_on_import in metadata, set is_active=false
        UPDATE public.clients 
        SET is_active = false 
        WHERE (metadata ->> 'inactive_on_import')::boolean IS TRUE;
    END IF;
END;
$$;

-- Helpful index for filtering active customers
CREATE INDEX IF NOT EXISTS idx_clients_active ON public.clients(is_active) WHERE deleted_at IS NULL;
