# Google Workspace Email Integration — Archive

**Change**: google-workspace-email
**Archived**: 2026-05-05
**Status**: Completed

---

## Summary

Implemented Google Workspace email sending capabilities for the CRM, allowing companies to send branded emails from their own Google Workspace addresses via Gmail API (OAuth2) as primary method or SMTP relay as fallback.

**Decision made**: Implement both Gmail API (OAuth2) and SMTP relay paths. Gmail API is primary/recommended due to better deliverability and security. SMTP relay serves as fallback for companies without GCP access. OAuth2 uses per-company refresh tokens with shared app-level GCP credentials.

---

## File Manifest

| File | Description |
|------|-------------|
| `proposal.md` | Original change proposal — intent, scope, approach, risks |
| `spec.md` | Full specification with requirements F-GW-001 through F-GW-006 |
| `design.md` | Technical design — architecture, providers, database migration, Edge Functions, Angular UI |
| `tasks.md` | Implementation task breakdown (6 sections, 12 tasks) |
| `test-checklist.md` | Integration test checklist mapped to acceptance criteria |

---

## Key Implementation Decisions

### 1. OAuth2 Token Management
- App-level GCP credentials (`GOOGLE_OAUTH_CLIENT_ID/SECRET`) shared across all companies
- Per-company refresh tokens stored encrypted in `company_email_accounts` via `encrypt_text` RPC
- `oauth_access_token` is runtime-only (never persisted to DB)
- Token refresh auto-triggered 5 minutes before expiry

### 2. Dual Sending Path Dispatch
- `provider_type='google_workspace'` + `auth_method='oauth2'` → Gmail API
- `provider_type='google_workspace'` + `auth_method='password'` → SMTP relay (smtp-relay.gmail.com:587)
- Gmail API failure automatically falls back to SMTP if SMTP credentials exist

### 3. CSRF Protection for OAuth Flow
- Random UUID state generated per OAuth initiation, stored in in-memory Map with 10-minute TTL
- State validated on callback: matches + not expired + account_id matches
- Single-use state deletion after validation

### 4. Email Provider Abstraction
- `EmailParams`, `EmailResult`, `TestResult`, `ProviderStatus`, `EmailProvider` interface
- `GmailAPIProvider` class encapsulating send, token refresh, error mapping
- `SMTPProvider` class reusing existing `sendViaSMTP()`

### 5. Database Schema
- New columns on `company_email_accounts`: `oauth_client_id`, `oauth_client_secret`, `oauth_refresh_token`, `oauth_access_token`, `oauth_token_expiry`, `auth_method`
- All nullable, backward-compatible with existing SMTP accounts
- Existing `provider_type='google_workspace'` rows migrated to `auth_method='password'`

### 6. Angular Admin UI
- New `EmailConfigComponent` with signals-based state management
- OAuth2 popup flow via `window.open()` + `postMessage` listener
- Tabbed interface switching between OAuth2 and SMTP configuration
- Test email modal and default sender selection

---

## Environment Variables Added

```bash
GOOGLE_OAUTH_CLIENT_ID=   # app-level, shared across all companies
GOOGLE_OAUTH_CLIENT_SECRET=
```

---

## Areas Modified

| Area | Impact | Key Files |
|------|--------|-----------|
| `supabase/functions/send-branded-email/` | Modified | Added `GmailAPIProvider`, `sendViaGmailAPI()`, updated dispatch |
| `supabase/functions/company-email-accounts/` | Modified | Added OAuth endpoints: `/google-auth-url`, `/google-callback`, `/:id/test`, `PATCH /:id` |
| `supabase/migrations/` | Modified | Added `xxxx_add_google_oauth_columns.sql` |
| `src/app/features/admin/email-accounts/` | Modified | New `email-config/` component and service |
| `src/app/models/company-email.models.ts` | Modified | Added OAuth fields to interface |
| `src/app/services/company-email.service.ts` | Modified | Added OAuth helper methods |

---

## Dependencies

- Existing `ENCRYPTION_KEY` mechanism for token storage (already in use for SMTP passwords)
- Existing `company_email_accounts` table and RLS patterns
- Existing `sendViaSMTP()` implementation in `send-branded-email`
- Shared GCP OAuth2 app credentials per company

---

*Archived on 2026-05-05 as part of SDD cycle completion.*
