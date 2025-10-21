-- Allow 'client' as a valid role in public.users
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.check_constraints 
    WHERE constraint_name = 'users_role_check'
  ) THEN
    ALTER TABLE public.users DROP CONSTRAINT users_role_check;
  END IF;
  ALTER TABLE public.users ADD CONSTRAINT users_role_check 
    CHECK (role IN ('client','member','admin','owner'));
EXCEPTION WHEN OTHERS THEN
  -- In case the constraint name differs, try a second approach
  BEGIN
    ALTER TABLE public.users ADD CONSTRAINT users_role_check 
      CHECK (role IN ('client','member','admin','owner'));
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END $$;
