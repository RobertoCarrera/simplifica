
DO $$
BEGIN
    -- 1. Check/Add 'created_by'
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'created_by') THEN
        ALTER TABLE tickets ADD COLUMN created_by uuid REFERENCES auth.users(id);
    END IF;

    -- 2. Check/Add 'ticket_type' (It was in args, maybe needed?)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'ticket_type') THEN
        ALTER TABLE tickets ADD COLUMN ticket_type text DEFAULT 'incident';
    END IF;

    -- 3. Check/Add 'status'
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'status') THEN
        ALTER TABLE tickets ADD COLUMN status text DEFAULT 'open';
    END IF;

    -- 4. Check/Add 'due_date'
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'due_date') THEN
        ALTER TABLE tickets ADD COLUMN due_date timestamptz;
    END IF;

    -- 5. Check/Add 'estimated_hours'
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'estimated_hours') THEN
        ALTER TABLE tickets ADD COLUMN estimated_hours numeric DEFAULT 0;
    END IF;

    -- 6. Check/Add 'total_amount'
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'total_amount') THEN
        ALTER TABLE tickets ADD COLUMN total_amount numeric DEFAULT 0;
    END IF;

    -- 7. Check/Add 'priority'
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'priority') THEN
        ALTER TABLE tickets ADD COLUMN priority text DEFAULT 'normal';
    END IF;
    
    -- 8. Check/Add 'stage_id'
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'stage_id') THEN
        ALTER TABLE tickets ADD COLUMN stage_id uuid REFERENCES public.ticket_stages(id);
    END IF;
    
    -- 9. Check/Add 'client_id'
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'client_id') THEN
        ALTER TABLE tickets ADD COLUMN client_id uuid REFERENCES public.clients(id);
    END IF;

    -- 10. Check/Add 'company_id'
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'company_id') THEN
        ALTER TABLE tickets ADD COLUMN company_id uuid REFERENCES public.companies(id);
    END IF;
    
    -- 11. Check/Add 'title'
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'title') THEN
        ALTER TABLE tickets ADD COLUMN title text;
    END IF;
    
    -- 12. Check/Add 'description'
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tickets' AND column_name = 'description') THEN
        ALTER TABLE tickets ADD COLUMN description text;
    END IF;

END $$;
