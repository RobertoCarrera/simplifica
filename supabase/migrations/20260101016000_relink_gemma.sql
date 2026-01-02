-- Re-link GEMMA SOCIAS LAHOZ to her auth user
-- This fixes the "loop" caused by the frontend finding no client profile for the logged-in user.

DO $$
DECLARE
    v_user_email text := 'puchu_114@hotmail.com';
    v_user_id uuid;
BEGIN
    SELECT id INTO v_user_id FROM auth.users WHERE email = v_user_email;

    IF v_user_id IS NOT NULL THEN
        UPDATE public.clients
        SET auth_user_id = v_user_id
        WHERE email = v_user_email 
        AND auth_user_id IS NULL;
        
        RAISE NOTICE 'Re-linked client for email %', v_user_email;
    ELSE
        RAISE WARNING 'No auth user found for email %', v_user_email;
    END IF;
END;
$$;
