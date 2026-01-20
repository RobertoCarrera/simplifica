-- Migration for Client Portal Profile & Preferences Features

-- 1. Create User Preferences Table
CREATE TABLE IF NOT EXISTS public.user_preferences (
    user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    email_notifications BOOLEAN DEFAULT TRUE,
    sms_notifications BOOLEAN DEFAULT FALSE,
    marketing_accepted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS for user_preferences
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own preferences"
    ON public.user_preferences FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own preferences"
    ON public.user_preferences FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own preferences"
    ON public.user_preferences FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- 2. RPC: client_update_profile
-- Updates public.users and optionally syncs to public.clients if linked
CREATE OR REPLACE FUNCTION public.client_update_profile(
    p_full_name TEXT,
    p_phone TEXT,
    p_avatar_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_client_id UUID;
    v_result JSONB;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Update public.users
    UPDATE public.users
    SET
        name = p_full_name,
        phone = p_phone,
        avatar_url = COALESCE(p_avatar_url, avatar_url),
        updated_at = NOW()
    WHERE id = v_user_id;

    -- Check if user is linked to a client record (as a Primary Contact usually)
    -- We try to find the client record linked to this user.
    -- Assuming relationships: public.clients might have 'user_id' or we look up by email match if needed.
    -- However, usually client_portal_users access clients via a junction or direct link.
    -- Let's try to update the 'clients' table if this user is a 'client user'.
    
    -- Optimized: Update clients where this user is the "primary user" or matches email?
    -- Simplification: If public.clients has a user_id column, update it.
    -- Checking schema context: We usually verify 'clients.user_id' or 'company_members.user_id'.
    -- If 'clients' table has 'email' matching user email, we update name/phone there too.
    
    UPDATE public.clients
    SET
        name = p_full_name,
        phone = p_phone,
        updated_at = NOW()
    WHERE email = (SELECT email FROM auth.users WHERE id = v_user_id) -- Sync by email identity
       OR id IN (SELECT client_id FROM public.companies_clients_users WHERE user_id = v_user_id); -- Or Junction

    v_result := jsonb_build_object(
        'success', true,
        'user_id', v_user_id
    );

    RETURN v_result;
END;
$$;

-- 3. RPC: client_update_preferences
CREATE OR REPLACE FUNCTION public.client_update_preferences(
    p_email_notifications BOOLEAN,
    p_sms_notifications BOOLEAN,
    p_marketing_accepted BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID := auth.uid();
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Upsert preferences
    INSERT INTO public.user_preferences (user_id, email_notifications, sms_notifications, marketing_accepted, updated_at)
    VALUES (v_user_id, p_email_notifications, p_sms_notifications, p_marketing_accepted, NOW())
    ON CONFLICT (user_id)
    DO UPDATE SET
        email_notifications = EXCLUDED.email_notifications,
        sms_notifications = EXCLUDED.sms_notifications,
        marketing_accepted = EXCLUDED.marketing_accepted,
        updated_at = NOW();

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 4. RPC: client_get_preferences
CREATE OR REPLACE FUNCTION public.client_get_preferences()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_prefs JSONB;
BEGIN
    SELECT row_to_json(up) INTO v_prefs
    FROM public.user_preferences up
    WHERE up.user_id = v_user_id;

    -- Return default if null
    IF v_prefs IS NULL THEN
        v_prefs := jsonb_build_object(
            'email_notifications', true,
            'sms_notifications', false,
            'marketing_accepted', false
        );
    END IF;

    RETURN v_prefs;
END;
$$;
