-- Allow 'client' role in company_invitations and 'none' role in users
DO $$
BEGIN
  -- Update users.role check to include 'none'
  BEGIN
    IF EXISTS (
      SELECT 1 FROM information_schema.check_constraints cc
      JOIN information_schema.constraint_table_usage ctu ON cc.constraint_name = ctu.constraint_name
      WHERE ctu.table_schema = 'public' AND ctu.table_name = 'users' AND cc.constraint_name = 'users_role_check'
    ) THEN
      ALTER TABLE public.users DROP CONSTRAINT users_role_check;
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN
    ALTER TABLE public.users ADD CONSTRAINT users_role_check
      CHECK (role IN ('none','client','member','admin','owner'));
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Update company_invitations.role check to include 'client'
  -- Try to drop any existing check constraint on role
  FOR r IN (
    SELECT cc.constraint_name
    FROM information_schema.check_constraints cc
    JOIN information_schema.constraint_table_usage ctu ON cc.constraint_name = ctu.constraint_name
    WHERE ctu.table_schema = 'public'
      AND ctu.table_name = 'company_invitations'
      AND cc.check_clause ILIKE '%role%IN%('
  ) LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.company_invitations DROP CONSTRAINT %I', r.constraint_name);
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;

  BEGIN
    ALTER TABLE public.company_invitations
      ADD CONSTRAINT company_invitations_role_check
      CHECK (role IN ('owner','admin','member','client'));
  EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;
