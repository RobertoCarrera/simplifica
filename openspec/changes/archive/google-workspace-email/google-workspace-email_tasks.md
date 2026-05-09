# Google Workspace Email — Implementation Tasks

---

## 1. Infrastructure

**1.1 — Add Google OAuth environment variables to Supabase Edge Functions**

Files:
- `supabase/functions/send-branded-email/.env` (create if missing)
- `supabase/functions/company-email-accounts/.env` (create if missing)

Tasks:
- Add `GOOGLE_OAUTH_CLIENT_ID` to both functions' environment / secrets
- Add `GOOGLE_OAUTH_CLIENT_SECRET` to both functions' environment / secrets
- Verify `ENCRYPTION_KEY` is already present in both

Acceptance: Both functions have `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` accessible via `Deno.env.get()`.

---

## 2. Database Migration

**2.1 — Create migration for OAuth2 columns on `company_email_accounts`**

File:
- `supabase/migrations/xxxx_add_google_oauth_columns.sql` (create)

Tasks:
- Add `oauth_client_id` (text, nullable)
- Add `oauth_client_secret` (text, nullable)
- Add `oauth_refresh_token` (text, nullable)
- Add `oauth_access_token` (text, nullable) — runtime-only, encrypted
- Add `oauth_token_expiry` (timestamptz, nullable)
- Add `auth_method` (text, default 'password')
- Update existing `provider_type = 'google_workspace'` rows to set `auth_method = 'password'`
- Add RLS policies for new columns (same tenant isolation as existing columns)

Acceptance:
- Migration runs without errors
- `company_email_accounts` table has all new columns
- Existing google_workspace accounts have `auth_method = 'password'`

---

## 3. Edge Functions

**3.1 — Implement `GmailAPIProvider` class**

Files:
- `supabase/functions/send-branded-email/providers/gmail-api-provider.ts` (create)
- `supabase/functions/send-branded-email/email-providers.ts` (create shared interface)

Tasks:
- Create `EmailParams`, `EmailResult`, `EmailProvider` interface in `email-providers.ts`
- Implement `GmailAPIProvider` class with:
  - `send()` — builds raw MIME message, base64url encodes, calls Gmail API
  - `refreshAccessToken()` — calls `https://oauth2.googleapis.com/token` with refresh_token grant
  - `ensureValidToken()` — checks expiry (5-min buffer), refreshes if needed
  - `test()` — sends test email
  - `getStatus()` — returns provider status
- On 401: attempt one token refresh + retry
- On 429/403: return retryable/non-retryable error
- Encrypt `oauth_token_expiry` before persisting to DB (runtime access token stays in memory only)

Acceptance:
- `GmailAPIProvider` can send email via Gmail API
- Token auto-refresh works when token is expired or within 5 minutes of expiry
- On 401, retries once after refreshing

---

**3.2 — Update `send-branded-email` dispatch logic for Gmail API**

Files:
- `supabase/functions/send-branded-email/index.ts` (modify)

Tasks:
- Extend `EmailAccount` interface with OAuth2 fields (`oauth_refresh_token`, `oauth_access_token`, `oauth_token_expiry`, `auth_method`)
- Create `sendViaGmailAPI()` function that:
  - Decrypts `oauth_refresh_token`
  - Instantiates `GmailAPIProvider`
  - Calls `provider.send()`
  - Returns `{ success, messageId?, error? }`
- Update the `provider_type === 'google_workspace'` dispatch block:
  - If `auth_method === 'oauth2'` and `oauth_refresh_token` exists → use Gmail API
  - On Gmail API failure → fall back to SMTP if SMTP credentials exist
  - If `auth_method === 'password'` or no OAuth token → use existing SMTP path
- Add `gmail_api_fallback_triggered` entry in email send log

Acceptance:
- Google Workspace accounts with OAuth2 credentials send via Gmail API
- Gmail API failures fall back to SMTP relay automatically
- Email send log distinguishes Gmail API vs SMTP sends

---

**3.3 — Add OAuth endpoints to `company-email-accounts` Edge Function**

Files:
- `supabase/functions/company-email-accounts/index.ts` (modify)

Tasks:
- Add in-memory `Map<state, {accountId, companyId, expiresAt}>` for CSRF state (10-min TTL)
- Implement `GET /google-auth-url`:
  - Validate `account_id` query param
  - Verify user owns account and is owner/admin of company
  - Verify `provider_type === 'google_workspace'`
  - Generate random UUID state, store in map with 10-min expiry
  - Build Google OAuth URL with `client_id`, `redirect_uri`, `scope=gmail.send`, `access_type=offline`, `prompt=consent`
  - Return `{ auth_url }`
- Implement `POST /google-callback`:
  - Validate state from map (exists, not expired, account_id matches)
  - Exchange authorization code for tokens via `https://oauth2.googleapis.com/token`
  - Encrypt refresh token and access token before storing
  - Update `company_email_accounts` with encrypted tokens, `oauth_token_expiry`, `auth_method='oauth2'`, set `is_verified=true`
  - Send test email to verify (non-fatal if it fails)
  - Return success / error
- Implement `POST /:id/test`:
  - Validate user owns account and is owner/admin
  - If OAuth2 account → decrypt refresh token, send test via `GmailAPIProvider`
  - If SMTP account → decrypt password, send test via `sendViaSMTP`
  - Return structured `{ success, message?, error? }`
- Implement `PATCH /:id`:
  - Update OAuth2 credentials (encrypt before storing)
  - Validate at least one complete auth method (password OR all OAuth fields)
  - Return updated account record

Acceptance:
- Admin can initiate OAuth2 flow and receive auth URL
- OAuth callback successfully exchanges code for tokens and stores encrypted in DB
- Test email endpoint works for both OAuth2 and SMTP accounts
- PATCH updates OAuth credentials correctly

---

## 4. Angular Admin UI

**4.1 — Create `EmailConfigService`** ✅ COMPLETED

Files:
- `src/app/features/admin/email-accounts/email-config/email-config.service.ts` (create)

Tasks:
- Inject `RuntimeConfigService` and `SupabaseClientService`
- `initiateGoogleOAuth(accountId)` — calls `GET /google-auth-url`, opens popup with OAuth consent URL
- `handleOAuthCallback(code, state, accountId)` — POSTs to `/google-callback`
- `updateOAuthCredentials(accountId, clientId, clientSecret, refreshToken)` — PATCHes account
- `testAccountEmail(accountId, recipientEmail)` — POSTs to `/:id/test`
- `getAccounts(companyId)` — queries `company_email_accounts` filtered by `provider_type='google_workspace'`, ordered by `is_primary`

Acceptance:
- Service correctly calls Edge Function endpoints with auth token
- Popup window opens for OAuth flow
- postMessage listener handles OAuth callback

---

**4.2 — Create `EmailConfigComponent`**

Files:
- `src/app/features/admin/email-accounts/email-config/email-config.component.ts` (create)
- `src/app/features/admin/email-accounts/email-config/email-config.component.html` (create)
- `src/app/features/admin/email-accounts/email-config/email-config.component.scss` (create)

Tasks:
- State signals: `accounts`, `selectedAccount`, `oauthStates`, `activeAuthTab`, `testEmailModalOpen`, `testEmailRecipient`, `sendingTestEmail`
- `smtpForm` FormGroup with `smtp_host`, `smtp_port`, `smtp_user`, `smtp_password`
- `connectWithGoogle(account)` method:
  - Calls Edge Function for auth URL
  - Opens Google consent popup
  - Listens for `postMessage` with `google_oauth_success` or `google_oauth_error`
  - Updates `oauthStates` signal on success/error
- `sendTestEmail(account, recipient)` — calls service, shows toast on success/failure
- `saveSMTPConfig(account)` — validates form, calls provision + update
- `setAsPrimary(account)` — calls `emailService.setPrimaryAccount()`
- Template: account selector list, OAuth2 tab (connect button + status badge), SMTP tab (form), test email section, default sender radio group

Acceptance:
- Admin can select a Google Workspace account
- "Connect with Google" button triggers OAuth popup flow
- OAuth status (connected/error) displays correctly after callback
- Test email can be sent from selected account
- Default sender selection persists correctly

---

**4.3 — Create `OAuthCallbackComponent` for OAuth redirect handling**

Files:
- `src/app/features/admin/email-accounts/email-config/oauth-callback.component.ts` (create)
- `src/app/features/admin/email-accounts/email-config/oauth-callback.component.html` (create)

Tasks:
- Route: `/admin/email-accounts/oauth-callback`
- Extract `code` and `state` from URL query params
- Call `EmailConfigService.handleOAuthCallback(code, state, accountId)`
- On success: `window.opener.postMessage({ type: 'google_oauth_success', accountId }, origin)` + close window
- On error: `window.opener.postMessage({ type: 'google_oauth_error', message: err.message }, origin)` + close window

Acceptance:
- Google redirect lands on this page
- Page correctly extracts code/state and calls callback service
- Communicates result back to opener and closes

---

**4.4 — Update `CompanyEmailService` with OAuth methods**

Files:
- `src/app/services/company-email.service.ts` (modify)

Tasks:
- Add `testAccountEmail(accountId, recipientEmail): Observable<any>`
- Add `getGoogleAuthUrl(accountId): Observable<string>` (calls Edge Function)
- Add `handleOAuthCallback(code, state, accountId): Observable<void>`
- Ensure existing `setPrimaryAccount()` still works

Acceptance:
- Existing methods unchanged
- New OAuth methods call correct Edge Function endpoints

---

**4.5 — Update `CompanyEmailAccount` model with OAuth fields**

Files:
- `src/app/models/company-email.models.ts` (modify)

Tasks:
- Add `oauth_client_id?: string`
- Add `oauth_client_secret?: string`
- Add `oauth_refresh_token?: string`
- Add `oauth_access_token?: string` (runtime only)
- Add `oauth_token_expiry?: string`
- Add `auth_method?: 'password' | 'oauth2'`

Acceptance:
- TypeScript interface reflects all new DB columns
- Existing fields unchanged

---

**4.6 — Add routing and integrate `EmailConfigComponent` in admin email accounts**

Files:
- `src/app/features/admin/email-accounts/email-accounts.component.ts` (modify)

Tasks:
- Add route or tab for `email-config` that uses `EmailConfigComponent`
- Ensure routing is protected (owner/admin only)

Acceptance:
- Admin UI accessible under `/admin/email-accounts`
- Only owner/admin role can access OAuth configuration

---

## 5. Documentation

**5.1 — Write GCP project setup guide**

File:
- `docs/google-workspace-oauth-setup.md` (create in project docs folder)

Tasks:
- Step-by-step GCP console instructions:
  1. Create or select GCP project
  2. Enable Gmail API
  3. Create OAuth2 credentials (Client ID + Client Secret)
  4. Configure OAuth consent screen (Internal vs External)
  5. Add `https://<project>.supabase.co/functions/v1/company-email-accounts/google-callback` as redirect URI
  6. Explain `gmail.send` scope
- Screenshots or screenshot references
- How to create App Passwords (for SMTP fallback) vs OAuth2 (for Gmail API)

Acceptance:
- Admin with no GCP experience can set up credentials in < 10 minutes
- All required fields (client ID, client secret) clearly explained

---

**5.2 — Write integration test checklist**

File:
- `openspec/changes/google-workspace-email/test-checklist.md` (create)

Tasks:
- Smoke test: send test email via SMTP (existing)
- Smoke test: OAuth2 flow completes without errors
- Smoke test: test email sent and delivered via Gmail API
- Smoke test: default sender selection works across accounts
- Smoke test: token refresh triggers before expiry (5-min buffer)
- Smoke test: Gmail API failure falls back to SMTP
- Smoke test: errors return structured `{ success: false, error: { code, message, retryable } }`
- Smoke test: existing SES sending unaffected

Acceptance:
- All scenarios can be manually verified in < 15 minutes
- Checkpoints map to spec acceptance criteria (F-GW-001 through F-GW-006)