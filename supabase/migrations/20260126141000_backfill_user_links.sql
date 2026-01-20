-- Backfill: Link existing users/clients that missed the trigger
DO $$
BEGIN
    -- Link public.users
    UPDATE public.users u
    SET auth_user_id = au.id
    FROM auth.users au
    WHERE LOWER(u.email) = LOWER(au.email)
      AND u.auth_user_id IS NULL;

    -- Link public.clients
    UPDATE public.clients c
    SET auth_user_id = au.id
    FROM auth.users au
    WHERE LOWER(c.email) = LOWER(au.email)
      AND c.auth_user_id IS NULL;
END $$;
