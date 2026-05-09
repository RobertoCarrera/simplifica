# Proposal: Google Workspace Email Integration

## Intent

Enable the CRM to send branded emails from company Google Workspace addresses (e.g., `[email protected]`) via Gmail API (OAuth2) or SMTP relay, giving companies full control over their sending domain while keeping their existing Google Workspace setup.

## Scope

### In Scope
- Admin UI for Google Workspace account configuration (OAuth2 + SMTP options)
- Gmail API sending path via `send-branded-email` EF (new Option B)
- OAuth2 token management (access/refresh tokens, auto-refresh)
- `company-email-accounts` EF extension: CRUD for Google Workspace with OAuth, test-email endpoint
- Test connection / send test email button in admin UI
- Documentation for Google Workspace OAuth2 setup (GCP console steps)

### Out of Scope
- Email queue/worker system
- Email template editor
- Other providers (SES beyond existing, Mailgun, SendGrid)
- Inbound email processing
- Superadmin domain selector (already exists for SES)

## Capabilities

### New Capabilities
- `google-workspace-oauth`: Gmail API OAuth2 sending — access/refresh token storage, automatic token refresh, `sendViaGmailAPI()` in `send-branded-email`

### Modified Capabilities
- `email-accounts-crud`: Extend `company-email-accounts` EF to handle `google_workspace` provider with OAuth2 fields and a test-email action
- `email-account-form`: Add OAuth2 setup flow (GCP client ID/secret input, OAuth consent redirect) alongside existing SMTP fields

## Approach

Two options for Google Workspace sending. Both use the existing `provider_type: 'google_workspace'` column.

### Option A — SMTP Relay (smtp-relay.gmail.com)
- **How**: Existing SMTP path in `send-branded-email` (`sendViaSMTP()`) with `smtp-relay.gmail.com:587 TLS`
- **Auth**: App Password (less secure) or OAuth2 refresh token (stored as `smtp_encrypted_password`)
- **Pros**: Simplest, leverages existing code, no GCP project needed
- **Cons**: Less secure with App Password; SMTP relay has stricter limits than Gmail API

### Option B — Gmail API (recommended)
- **How**: `POST /v1/users/{userId}/messages/send` via Gmail API with OAuth2 access token
- **Auth**: OAuth2 (client_id + client_secret + refresh_token → access token with auto-refresh)
- **Pros**: Most secure, better deliverability, full Gmail API features
- **Cons**: Requires GCP project setup per company; more complex initial configuration
- **Token storage**: `company_email_accounts` gains `gmail_access_token`, `gmail_refresh_token`, `gmail_token_expiry`

**Decision**: Implement both. Option B as primary/recommended, Option A as fallback for companies without GCP access.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `supabase/functions/company-email-accounts/` | Modified | Add `google_workspace` OAuth CRUD, test-email action |
| `supabase/functions/send-branded-email/` | Modified | Add `sendViaGmailAPI()`, token refresh logic |
| `supabase/functions/google-workspace-provision/` | Modified | Extend to store OAuth tokens |
| `src/app/features/admin/email-accounts/` | Modified | OAuth2 setup form, test connection UI |
| `src/app/services/company-email.service.ts` | Modified | Add OAuth methods, test-email call |
| `src/app/models/company-email.models.ts` | Modified | Add OAuth fields to `CompanyEmailAccount` |
| `company_email_accounts` table | Modified | Add `gmail_access_token`, `gmail_refresh_token`, `gmail_token_expiry`, `gmail_client_id`, `gmail_client_secret` columns |
| Database: RLS policies | Modified | RLS on new columns |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| OAuth token expiry breaks sending | Med | Auto-refresh before expiry using `gmail_token_expiry`; fallback to SMTP |
| GCP consent screen rejection | Low | Use "Internal" option (no review needed for single-tenant) |
| Companies without GCP access | Med | Provide SMTP Option A as fallback |
| Token storage security | Low | All tokens encrypted at rest via `ENCRYPTION_KEY` (same as SMTP passwords) |

## Rollback Plan

1. Set `provider_type` back to `ses_shared` or `ses_iam` on affected accounts via admin UI
2. `send-branded-email` already falls back to SES if `google_workspace` config is incomplete — no hard dependency
3. No DB migration rollback needed; new columns are nullable and backward-compatible
4. Disable feature at proxy level if needed

## Dependencies

- Existing `ENCRYPTION_KEY` mechanism for token storage (already in use for SMTP passwords)
- GCP project per company (company creates; admin inputs client ID/secret)
- Existing `company_email_accounts` RLS and auth patterns (reuse)

## Success Criteria

- [ ] Admin can configure Google Workspace via OAuth2 in < 5 minutes
- [ ] Test email sent and delivered via Gmail API
- [ ] Token auto-refresh works before expiry
- [ ] SMTP Option A still functional as fallback
- [ ] No breaking changes to existing SES email sending
- [ ] Documentation covers GCP console setup with screenshots