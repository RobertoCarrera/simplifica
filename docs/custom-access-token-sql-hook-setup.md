# Custom Access Token — Postgres Hook Setup

> **STATUS: Migration applied. Hook NOT yet active until the user flips the switch below.**
> Login is currently broken for ALL users until step 4 is completed.

## What happened

The Custom Access Token hook was running as an HTTPS Edge Function
(`custom-access-token`). Supabase Gateway recently started requiring the
`apikey` header on non-browser callers, but GoTrue's hook dispatcher does
not send one. Every login attempt fails with **"Hook requires authorization
token"** (HTTP 500 → 401 to the client).

## What we did

Created a Postgres-native replacement function with the SAME claim logic as
the EF, but invoked directly by GoTrue inside the database — the HTTPS
dispatcher is bypassed entirely, so the apikey requirement is no longer
relevant.

The function:

- Reads `public.users` joined with `public.app_roles` (matched on
  `auth_user_id`, filtered by `active = true AND deleted_at IS NULL`).
- Falls back to `public.clients` (filtered by `is_active = true AND
  deleted_at IS NULL`) when no internal user row is found, assigning
  `user_role = 'client'`.
- Injects `company_id`, `user_role`, and `app_role` into the JWT claims,
  preserving every existing claim Supabase already set.
- Runs as `SECURITY DEFINER` (owned by the migration runner = `postgres`)
  so it can read the tables regardless of RLS.
- Revokes `EXECUTE` from `PUBLIC`, `anon`, `authenticated`, and
  `service_role` — only `supabase_auth_admin` and `authenticator` can call
  it.

The migration file lives at:
`supabase/migrations/20260622_switch_custom_access_token_to_postgres_hook.sql`

## What YOU must do (one-time, ~60 seconds)

1. Open the Supabase Dashboard for `ufutyjbqfjrlzkprvyvs`:
   https://supabase.com/dashboard/project/ufutyjbqfjrlzkprvyvs/auth/hooks
2. Click **"Custom Access Token"** (under the "Customize Access Token (JWT)
   Claims" section).
3. In the Type dropdown, change **HTTPS** → **Postgres**.
4. In the Schema dropdown, select **`public`**.
5. In the Function dropdown, select **`custom_access_token`** (the one with
   argument `event jsonb`).
6. Click **Save / Enable**.

That's it. New login attempts will now hit the Postgres function instead
of the broken Edge Function.

## What stays the same

- The Edge Function `custom-access-token` stays deployed (it will be
  unreachable once the hook is on Postgres, but the code remains as a
  reference for the equivalent logic).
- All existing JWT consumers keep working — the claims (`company_id`,
  `user_role`, `app_role`) have the same shape they had before.

## Verification

After saving the hook, try logging in. The freshly-issued JWT should
contain the three custom claims. You can decode it at https://jwt.io to
confirm.

If a user gets `company_id: null` or no `user_role`, they probably don't
have a row in `public.users` (with `active = true`, `deleted_at IS NULL`,
`auth_user_id` matching their `auth.users.id`) or `public.clients` (same
conditions on `is_active` / `deleted_at`). That's the same failure mode
the EF would have produced.

## Rollback

If you need to revert to the HTTPS hook:

1. Dashboard → Auth → Hooks → Custom Access Token → change back to HTTPS,
   point at the `custom-access-token` Edge Function, paste the webhook
   secret.
2. To drop the SQL function:
   ```sql
   DROP FUNCTION IF EXISTS public.custom_access_token(jsonb);
   ```

Note: dropping the function while the Postgres hook still points at it
will break login again — do the Dashboard switch first.

## References

- EF source being replaced:
  `supabase/functions/custom-access-token/index.ts`
- Supabase docs on Auth Hooks (Postgres variant):
  https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook
