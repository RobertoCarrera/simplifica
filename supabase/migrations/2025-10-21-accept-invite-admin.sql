-- Admin variant: accept invitation without relying on auth.uid()
-- Used by Edge Function to onboard client users who are not logged in

CREATE OR REPLACE FUNCTION accept_company_invitation_admin(
  p_invitation_token TEXT,
  p_auth_user_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    inv public.company_invitations;
    existing_user public.users;
    placeholder_user public.users;
    new_user_id UUID;
    company_name TEXT;
BEGIN
    SELECT * INTO inv
    FROM public.company_invitations
    WHERE token = p_invitation_token
      AND expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Invalid or expired invitation');
    END IF;

    SELECT name INTO company_name FROM public.companies WHERE id = inv.company_id;

    SELECT * INTO existing_user FROM public.users WHERE auth_user_id = p_auth_user_id LIMIT 1;
    IF FOUND THEN
        UPDATE public.users
           SET email = COALESCE(inv.email, existing_user.email),
               role = inv.role,
               active = true,
               company_id = inv.company_id,
               updated_at = NOW()
         WHERE id = existing_user.id
     RETURNING id INTO new_user_id;
    ELSE
        SELECT * INTO placeholder_user
          FROM public.users
         WHERE email = inv.email AND company_id = inv.company_id
         ORDER BY created_at DESC
         LIMIT 1;

        IF FOUND THEN
            UPDATE public.users
               SET auth_user_id = p_auth_user_id,
                   role = inv.role,
                   active = true,
                   updated_at = NOW()
             WHERE id = placeholder_user.id
         RETURNING id INTO new_user_id;
        ELSE
            INSERT INTO public.users (
                email, name, surname, role, active, company_id, auth_user_id, permissions
            ) VALUES (
                inv.email,
                split_part(inv.email, '@', 1),
                NULL,
                inv.role,
                true,
                inv.company_id,
                p_auth_user_id,
                '{}'::jsonb
            ) RETURNING id INTO new_user_id;
        END IF;
    END IF;

    UPDATE public.company_invitations
       SET status = 'accepted', responded_at = NOW()
     WHERE id = inv.id;

    UPDATE public.pending_users
       SET confirmed_at = NOW(), company_id = inv.company_id
     WHERE auth_user_id = p_auth_user_id AND email = inv.email;

    RETURN json_build_object(
        'success', true,
        'user_id', new_user_id,
        'company_id', inv.company_id,
        'company_name', company_name,
        'role', inv.role
    );
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;
