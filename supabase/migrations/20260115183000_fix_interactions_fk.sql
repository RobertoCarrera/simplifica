-- Fix lead_interactions FK to point to public.users instead of auth.users
-- This allows Postgrest to perform joins with specific columns from public.users table

DO $$ 
BEGIN
  -- Drop the old constraint if it exists (referencing auth.users)
  IF EXISTS (
    SELECT 1 
    FROM information_schema.table_constraints 
    WHERE constraint_name = 'lead_interactions_user_id_fkey' 
    AND table_name = 'lead_interactions'
  ) THEN
    ALTER TABLE lead_interactions DROP CONSTRAINT lead_interactions_user_id_fkey;
  END IF;

  -- Add the new constraint (referencing public.users)
  ALTER TABLE lead_interactions 
    ADD CONSTRAINT lead_interactions_user_id_fkey 
    FOREIGN KEY (user_id) 
    REFERENCES public.users(id) 
    ON DELETE SET NULL;
END $$;
