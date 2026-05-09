# Google Workspace Email Integration — Specification

## 1. Overview

This specification covers the implementation of Google Workspace email sending capabilities via Gmail API (OAuth2) as primary method and SMTP relay as fallback. The integration allows companies to send branded CRM emails from their Google Workspace addresses with full OAuth2 token management, automatic refresh, and encrypted credential storage.

---

## 2. Requirements

### F-GW-001: Google Workspace SMTP Configuration

**Scenario: Admin configures SMTP relay**

- **Given**: an admin is in the Google Workspace email configuration section
- **When**: they select "SMTP" authentication method and enter:
  - SMTP host: `smtp-relay.gmail.com`
  - Port: `587`
  - User: full Google Workspace email address
  - Password: App Password
- **Then**: the system SHALL validate the connection by attempting to send a test email
- **And**: SHALL store the credentials encrypted in `company_email_accounts` using `encrypt_text` RPC
- **And**: SHALL mark `auth_method` as `'password'`
- **And**: SHALL display "Connected Successfully" with verification checkmark if test succeeds
- **And**: SHALL display specific error message if test fails (auth failed, network error, etc.)

---

### F-GW-002: Google Workspace OAuth2 Configuration

**Scenario: Admin configures via OAuth2 flow**

- **Given**: an admin is in the Google Workspace email configuration section
- **When**: they click "Connect with Google" and complete the OAuth flow
- **Then**: the system SHALL redirect to Google's OAuth consent screen with:
  - `client_id` from `GOOGLE_OAUTH_CLIENT_ID` env var
  - `redirect_uri` pointing to `POST /company-email-accounts/google-callback`
  - `scope=gmail.send`
  - `access_type=offline`
  - `prompt=consent`
- **And**: SHALL exchange the authorization code for tokens on callback
- **And**: SHALL store `oauth_client_id`, `oauth_client_secret`, `oauth_refresh_token` encrypted in `company_email_accounts`
- **And**: SHALL set `auth_method` to `'oauth2'`
- **And**: SHALL be able to send emails on behalf of the Workspace user via Gmail API

---

### F-GW-003: Test Email

**Scenario: Admin sends test email**

- **Given**: an admin has configured a Google Workspace email account
- **When**: they click "Send Test Email" and enter a test recipient address
- **Then**: the system SHALL send a test email from the configured `email` address
- **And**: the email SHALL contain a simple verification message: "This is a test email from [Company Name] CRM"
- **And**: SHALL display "Test email sent successfully to [recipient]" on success
- **And**: SHALL display "Failed to send test email: [specific error]" on failure
- **And**: the test email SHALL use the same sending path (Gmail API or SMTP) as production sends

---

### F-GW-004: Default Sender Selection

**Scenario: Admin selects default sender**

- **Given**: an admin has multiple verified email accounts for their company
- **When**: they access the email configuration section
- **Then**: they SHALL see all configured accounts with status indicators (verified/unverified)
- **And**: they SHALL be able to select any verified account as "Default Sender" via radio/toggle
- **And**: the selected default SHALL have `is_primary=true`; all others `is_primary=false`
- **And**: all CRM emails SHALL use the primary address unless explicitly overridden at send time

---

### F-GW-005: Gmail API Sending

**Scenario: System sends via Gmail API**

- **Given**: a company has a Google Workspace account configured with OAuth2 credentials (`oauth_client_id`, `oauth_client_secret`, `oauth_refresh_token`)
- **When**: `send-branded-email` EF is called with `provider_type='google_workspace'` and OAuth fields are present
- **Then**: the system SHALL call `POST https://gmail.googleapis.com/gmail/v1/users/me/messages/send` with OAuth2 access token
- **And**: SHALL refresh the access token automatically if `oauth_token_expiry` is past or imminently due (within 5 minutes)
- **And**: SHALL fall back to SMTP sending if:
  - OAuth refresh fails (invalid grant, revoked consent)
  - Gmail API returns 403/429 (rate limit, disabled API)
- **And**: SHALL log which sending method was used in the email send log

---

### F-GW-006: Error Handling

**Scenario: Email send fails with specific error**

- **Given**: an email send attempt fails
- **When**: the failure is due to:
  - Invalid/expired credentials (401 from Gmail API, 535 from SMTP)
  - Authorization revoked (403 from Gmail API)
  - Daily sending limit reached (429 from Gmail API)
  - Network connectivity issue
- **Then**: the system SHALL log the specific error code and message
- **And**: SHALL return a structured error to the caller: `{ success: false, error: { code: string, message: string, retryable: boolean } }`
- **And**: SHALL NOT crash — errors SHALL be caught and handled gracefully
- **And**: retryable errors SHALL be logged for async retry handling

---

## 3. Data Model Changes

### Table: `company_email_accounts`

**Column additions:**

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `oauth_client_id` | `text` | nullable | Encrypted OAuth2 client ID |
| `oauth_client_secret` | `text` | nullable | Encrypted OAuth2 client secret |
| `oauth_refresh_token` | `text` | nullable | Encrypted OAuth2 refresh token |
| `oauth_access_token` | `text` | nullable | Encrypted access token (runtime only, not persisted long-term) |
| `oauth_token_expiry` | `timestamptz` | nullable | Expiry timestamp of current access token |
| `auth_method` | `text` | nullable, default 'password' | Authentication method: `'password'` or `'oauth2'` |

**Notes:**
- Existing `provider_type='google_workspace'` rows SHALL be migrated to use `auth_method='password'` by default
- All new OAuth2 fields are nullable — backward compatible with existing SMTP accounts
- `oauth_access_token` is runtime-only; not stored to DB (stored in memory during request lifecycle only if needed)

---

## 4. API Changes

### PATCH `/company-email-accounts/:id`

**Purpose:** Update email account, including OAuth2 credentials

**Request body additions:**
```json
{
  "oauth_client_id": "encrypted_string",
  "oauth_client_secret": "encrypted_string", 
  "oauth_refresh_token": "encrypted_string",
  "auth_method": "oauth2"
}
```

**Behavior:**
- Encrypts OAuth fields before storing (calls `encrypt_text` RPC)
- Validates that at least one auth method is complete (password OR all OAuth fields)
- Returns updated account record

---

### POST `/company-email-accounts/:id/test`

**Purpose:** Send a test email to verify configuration

**Request body:**
```json
{
  "recipient_email": "test@example.com"
}
```

**Response (success):**
```json
{
  "success": true,
  "message": "Test email sent successfully"
}
```

**Response (failure):**
```json
{
  "success": false,
  "error": {
    "code": "AUTH_FAILED",
    "message": "Invalid credentials or authorization revoked",
    "retryable": false
  }
}
```

---

### GET `/company-email-accounts/google-auth-url`

**Purpose:** Initiate OAuth2 flow, return Google's OAuth URL

**Response:**
```json
{
  "auth_url": "https://accounts.google.com/o/oauth2/v2/auth?client_id=...&redirect_uri=...&scope=gmail.send&..."
}
```

**Notes:**
- Uses `GOOGLE_OAUTH_CLIENT_ID` from environment
- `redirect_uri` is the EPs internal callback endpoint
- State parameter SHALL be generated to prevent CSRF

---

### POST `/company-email-accounts/google-callback`

**Purpose:** Handle OAuth2 callback, exchange code for tokens

**Request body:**
```json
{
  "code": "authorization_code_from_google",
  "state": "csrf_state_token",
  "account_id": "uuid_of_company_email_account"
}
```

**Behavior:**
1. Validates state to prevent CSRF
2. Exchanges code for tokens via `https://oauth2.googleapis.com/token`
3. Stores encrypted tokens in `company_email_accounts`
4. Sets `auth_method='oauth2'`
5. Sends a verification test email
6. Redirects to admin UI with success/error status

---

## 5. Edge Function Changes

### `send-branded-email`

**Modified function `sendViaGmailAPI()`:**

```
1. Check if account has oauth_refresh_token
2. If oauth_token_expiry is null OR (now + 5 min) >= oauth_token_expiry:
   a. POST to https://oauth2.googleapis.com/token with grant_type=refresh_token
   b. Update oauth_access_token and oauth_token_expiry
3. POST to https://gmail.googleapis.com/gmail/v1/users/me/messages/send
   - Authorization: Bearer {oauth_access_token}
   - Raw message encoded as base64url
4. On 401: attempt token refresh once, then retry
5. On 429/403: log and fall back to SMTP
6. On success: return { success: true, message_id: string }
```

### `company-email-accounts`

**New handlers:**

| Method | Path | Description |
|--------|------|-------------|
| PATCH | `/:id` | Update OAuth2 credentials |
| POST | `/:id/test` | Send test email |
| GET | `/google-auth-url` | Get OAuth URL |
| POST | `/google-callback` | Handle OAuth callback |

---

## 6. Environment Variables

```bash
# Google OAuth2 credentials (shared across all companies using OAuth)
GOOGLE_OAUTH_CLIENT_ID=your-gcp-oauth-client-id
GOOGLE_OAUTH_CLIENT_SECRET=your-gcp-oauth-client-secret

# Encryption key (already exists)
ENCRYPTION_KEY=your-32-byte-hex-key
```

**Security notes:**
- `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` are the app-level credentials registered in GCP
- Per-company tokens (refresh tokens) are stored encrypted in the DB
- `oauth_access_token` is never persisted — kept only in memory during request

---

## 7. Security Considerations

1. **Token encryption**: All OAuth tokens encrypted at rest using `ENCRYPTION_KEY` via `encrypt_text` RPC
2. **Scope minimization**: Only `gmail.send` scope requested — read/write only for sending
3. **CSRF protection**: OAuth state parameter validated on callback
4. **No refresh token storage in logs**: Refresh tokens redacted from all logging
5. **Offline access**: `access_type=offline` required for refresh tokens that persist across sessions

---

## 8. Acceptance Criteria

- [ ] F-GW-001: Admin can configure SMTP and receive "Connected Successfully" on valid credentials
- [ ] F-GW-002: Admin can complete OAuth2 flow with "Connect with Google" button
- [ ] F-GW-003: Test email sent and delivered from configured Workspace address
- [ ] F-GW-004: Admin can set default sender; CRM uses default for all outgoing emails
- [ ] F-GW-005: Emails sent via Gmail API with automatic token refresh
- [ ] F-GW-006: Errors return structured response with specific error codes; no crashes
- [ ] Fallback to SMTP works when OAuth fails
- [ ] Existing SES email sending unaffected