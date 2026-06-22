# Auth Hooks

## Custom Access Token Hook
- Status: REMOVED 2026-06-22
- Reason: Code was wired-up but never activated. Zero RLS policies use `auth.jwt() ->> 'company_id'` or `user_role` claims.
- To re-enable: see git history for the deleted `supabase/functions/custom-access-token/` and `config.toml` hook block.
