-- v4.11: Restore EXECUTE on get_my_user_id() for authenticated and PUBLIC.
-- This reverses the hardening from 20260621_revoke_safe_secdef_authenticated_r{1,2}.sql
-- while keeping SECURITY DEFINER restricted to trusted roles only.
--
-- The root cause of the previous issue (cross-tenant leakage from invoice-list)
-- was a missing .eq('company_id', ...) filter in supabase-invoices.service.ts
-- (fixed in 376b6cd4). Now that the service layer is safe, we can re-grant the
-- helper function so policies that depend on it work again.

GRANT EXECUTE ON FUNCTION public.get_my_user_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_user_id() TO PUBLIC;
