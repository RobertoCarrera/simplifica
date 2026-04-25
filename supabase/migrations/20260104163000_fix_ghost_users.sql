-- SCRIPT TO FIX DATA INTEGRITY: Sync public.users with auth.users

-- 1. Try to recover users who exist in auth but have wrong ID in public
-- Update public.users IDs to match auth.users IDs if emails match
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT u.id as auth_id, p.id as public_id, p.email 
             FROM auth.users u 
             JOIN public.users p ON u.email = p.email 
             WHERE u.id != p.id
    LOOP
        RAISE NOTICE 'Fixing ID for user %: % -> %', r.email, r.public_id, r.auth_id;
        
        -- Disable trigger temporarily if needed, or just update
        -- Note: If public.users.id is referenced by other tables, this might fail unless CASCADE is on.
        -- We will try to update. 
        BEGIN
            UPDATE public.users SET id = r.auth_id WHERE email = r.email;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not update user %: %', r.email, SQLERRM;
        END;
    END LOOP;
END $$;

-- 2. Identify and (Optionally) Remove Ghost Users
-- valid_users view helps see who is safe
CREATE OR REPLACE VIEW valid_users_view AS
SELECT p.*, (a.id IS NOT NULL) as has_auth
FROM public.users p
LEFT JOIN auth.users a ON p.id = a.id;

-- Show users that will cause 409 error
SELECT * FROM valid_users_view WHERE has_auth = false;

-- UNCOMMENT TO DELETE GHOST USERS (Risky if they have data)
-- DELETE FROM public.users WHERE id NOT IN (SELECT id FROM auth.users);
