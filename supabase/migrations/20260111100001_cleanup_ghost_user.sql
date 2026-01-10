-- CLEANUP GHOST USER SCRIPT
-- The user 'robertocarreratech@gmail.com' exists in 'public.users' but NOT in 'auth.users'.

DO $$
BEGIN
    -- 1. Unlink from company members
    DELETE FROM public.company_members 
    WHERE user_id IN (SELECT id FROM public.users WHERE email = 'robertocarreratech@gmail.com');

    -- 2. Delete from public users
    DELETE FROM public.users 
    WHERE email = 'robertocarreratech@gmail.com';

    RAISE NOTICE 'Ghost user cleaned up. You can now Register again in the App.';
END $$;
