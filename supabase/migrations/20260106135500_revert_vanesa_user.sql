-- Revert: Delete the wrongly created user in public.users
-- But preserve the auth user and the client record.

DO $$
DECLARE
    v_email text := 'puchu_114@hotmail.com';
BEGIN
    RAISE NOTICE 'Reverting user creation for %', v_email;

    -- Delete from public.users only
    DELETE FROM public.users
    WHERE email = v_email;

    RAISE NOTICE 'Deleted from public.users. Auth and Client records remain untouched.';
END $$;
