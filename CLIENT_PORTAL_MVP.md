# Client Portal MVP — Ready to Implement

This blueprint wires a minimal, secure client portal that reuses your existing auth/invitation flows and adds a thin DB layer to scope data to a specific client without disturbing current internal-user RLS.

## Identity and invitation

- Reuse existing AuthService methods and RPCs:
  - invite_user_to_company(p_company_id, p_email, p_role, p_message)
  - accept_company_invitation(p_invitation_token, p_auth_user_id)
- On accept, AuthService already calls confirm_user_registration and ensureAppUser to create/link public.users to the company. No change required.
- New: link the invited email to a specific client via a lightweight mapping table client_portal_users (company_id, client_id, email). Owners/Admins create this link in backoffice. The client logs in with the same email and immediately sees only their data through secure functions/views below.

Notes
- We intentionally don’t add a new role (e.g., "client") to public.users to avoid impacting existing RLS. Client-portal access is provided via dedicated SECURE DEFINER functions that enforce client-level scoping.

## RLS scope for client users

- Keep existing RLS on core tables (tickets, quotes) unchanged (company-scoped).
- Add:
  - Table client_portal_users(company_id, client_id, email [, auth_user_id nullable]).
  - Helper function auth_user_email() to extract the authenticated email from JWT claims.
  - SECURE DEFINER functions that return only rows for the mapped client of the currently authenticated email:
    - client_get_visible_tickets(): returns tickets join clients filtered by client_portal_users mapping.
    - client_get_visible_quotes(): returns quotes join clients filtered by the mapping.
  - Read-only views client_visible_tickets and client_visible_quotes that select from those functions (familiar DX for the Angular service). Grant SELECT on views to authenticated.

Why SECURE DEFINER functions?
- Views cannot bypass table RLS, and current tickets/quotes RLS are company-based. The function runs with definer privileges and enforces client-level filters internally, keeping the surface small and auditable.

## Minimal routes/pages

1) Invitation accept route
- Route: /invite?token=... (or reuse /auth/confirm if you prefer)
- UI calls authService.acceptInvitation(token), then navigates to /portal when success. The mapping by email makes the portal immediately scoped.

2) Client dashboard route
- Route: /portal
- Shows list of their tickets/quotes using the new views:
  - from('client_visible_tickets')
  - from('client_visible_quotes')
- Optional filters: status, date, search.

Example Angular snippets

// routes in app.routes.ts (guard optional if you host on a subdomain)
{ path: 'invite', loadComponent: () => import('./components/portal-invite/portal-invite.component') },
{ path: 'portal', loadComponent: () => import('./components/portal-dashboard/portal-dashboard.component') },

// portal service (simplified)
const sb = this.sb.instance;
const { data: tickets } = await sb.from('client_visible_tickets')
  .select('*')
  .order('updated_at', { ascending: false });
const { data: quotes } = await sb.from('client_visible_quotes')
  .select('*')
  .order('quote_date', { ascending: false });

## Small UX additions

- The "Nuevo" badge already exists based on tickets.is_opened = false. In the portal ticket list:
  - Show the badge when is_opened = false.
  - On opening ticket detail, persist the change with a small RPC (or direct update with RLS) to set is_opened = true for that ticket. This is orthogonal to the scoping layer.

## Admin/backoffice workflow (1 minute)

1) Owner/Admin invites the customer’s email via existing backoffice (invite_user_to_company).
2) Owner/Admin links that email to a client record (one-time):
   - Insert into client_portal_users(company_id, client_id, email).
3) Customer accepts the invitation and logs in.
4) Portal shows only their tickets/quotes via the secure views.

## DB changes included (migration)

- New table client_portal_users with RLS.
- Helper function auth_user_email().
- SECURE DEFINER functions + views for tickets and quotes.
- Grants limited to authenticated for SELECT/EXECUTE.

See supabase/migrations/20251020_client_portal_mvp.sql and tests in supabase/tests/client_portal_rls.sql.

## Next steps

- Implement two tiny components: PortalInviteComponent and PortalDashboardComponent.
- Wire the service calls to the views shown above.
- Add a minimal admin form to create/update the client_portal_users link.
- Optional: mirror existing token-based public quote view patterns if you want unauthenticated share links; this MVP focuses on authenticated portal users.
