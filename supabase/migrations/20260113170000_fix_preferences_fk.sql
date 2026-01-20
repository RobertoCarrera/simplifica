-- Fix User Preferences FK to point to auth.users instead of public.users
-- This prevents issues where a user exists in Auth but not yet in public.users (e.g. during onboarding or sync failure)

DO $$ 
BEGIN
    -- Try to drop the constraint if it exists (standard name)
    -- If created via "REFERENCES public.users", it usually gets this name.
    BEGIN
        ALTER TABLE public.user_preferences
        DROP CONSTRAINT IF EXISTS user_preferences_user_id_fkey;
    EXCEPTION
        WHEN undefined_object THEN
            RAISE NOTICE 'Constraint user_preferences_user_id_fkey did not exist';
    END;

    -- Re-add constraint pointing to auth.users
    ALTER TABLE public.user_preferences
    ADD CONSTRAINT user_preferences_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

END $$;
