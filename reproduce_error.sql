DO $$
DECLARE
  v_company_id uuid;
  v_client_id uuid;
  v_user_id uuid;
  v_auth_id uuid := '3a99b61c-2ce7-448c-b175-9423bc436d8a'; -- User from logs
  v_result jsonb;
BEGIN
  -- 1. Setup Context
  -- We need to find a company/client this user has access to, or just pick one if we assume they are owner/admin.
  -- Let's pick a company where they are a member.
  SELECT company_id INTO v_company_id 
  FROM public.company_members 
  WHERE user_id = (SELECT id FROM public.users WHERE auth_user_id = v_auth_id)
  LIMIT 1;

  IF v_company_id IS NULL THEN
      -- Fallback: Check users table
      SELECT company_id INTO v_company_id 
      FROM public.users 
      WHERE auth_user_id = v_auth_id;
  END IF;

  -- Find a client for this company (to use as p_client_id)
  SELECT id INTO v_client_id FROM public.clients WHERE company_id = v_company_id LIMIT 1;
  
  -- Mock Auth
  -- Supabase RLS relies on request.jwt.claims or auth.uid() function.
  -- In a DO block, auth.uid() might return NULL unless we set local config.
  -- HOWEVER, most Supabase functions use `auth.uid()`.
  -- We can override `auth.uid()` by setting `request.jwt.claim.sub`.
  
  PERFORM set_config('request.jwt.claims', '{"sub": "3a99b61c-2ce7-448c-b175-9423bc436d8a", "role": "authenticated"}', true);
  PERFORM set_config('role', 'authenticated', true);

  -- 2. Call create_ticket
  -- We wrap in begin/exception to catch the specific error
  BEGIN
    v_result := public.create_ticket(
        p_company_id := v_company_id,
        p_client_id := v_client_id, -- Can be null or self if client. If staff, can be any client.
        p_title := 'Test Ticket',
        p_description := 'Test Description',
        p_priority := 'normal'
    );
    RAISE NOTICE 'Success: %', v_result;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Error Details: % %', SQLSTATE, SQLERRM;
    -- We want to see the context!
    RAISE; 
  END;

END;
$$;
