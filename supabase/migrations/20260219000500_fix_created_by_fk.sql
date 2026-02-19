
DO $$
BEGIN
    -- Correct the reference for created_by to point to public.users instead of auth.users if needed
    -- First drop the constraint if it exists and points to the wrong table (detecting constraint name is tricky, so just drop by column if we can assume name or use blanket drop)
    
    -- Assuming default constraint name: tickets_created_by_fkey
    -- We can just drop it to be safe and re-add it pointing to public.users(id)
    
    -- BUT, first check if created_by exists. We just added it.
    
    -- We need to know if public.users exists.
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users') THEN
        -- Check if constraint exists
        IF EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE constraint_name = 'tickets_created_by_fkey' 
            AND table_name = 'tickets'
        ) THEN
            ALTER TABLE tickets DROP CONSTRAINT tickets_created_by_fkey;
        END IF;

        -- Add correct constraint
        ALTER TABLE tickets 
        ADD CONSTRAINT tickets_created_by_fkey 
        FOREIGN KEY (created_by) REFERENCES public.users(id);

    ELSE
        -- If public.users doesn't exist, maybe it's profiles? 
        -- Based on RPC: "FROM users WHERE auth_user_id = auth.uid()" -> table is 'users'.
        RAISE NOTICE 'Table public.users not found, cannot add FK constraint for created_by';
    END IF;

END $$;
