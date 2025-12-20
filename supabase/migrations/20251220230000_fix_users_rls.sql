-- Secure function to get current user's company_id (bypassing RLS)
CREATE OR REPLACE FUNCTION public.get_my_company_id()
RETURNS UUID AS $$
BEGIN
  RETURN (SELECT company_id FROM public.users WHERE id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop existing restricted policies if any (safeguard)
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
DROP POLICY IF EXISTS "Users can view team members" ON public.users;

-- Policy: Users can view their own profile
CREATE POLICY "Users can view own profile" ON public.users
FOR SELECT USING (
  auth.uid() = id
);

-- Policy: Users can view other users from the same company
CREATE POLICY "Users can view team members" ON public.users
FOR SELECT USING (
  company_id = get_my_company_id()
);

-- Ensure RLS is enabled
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
