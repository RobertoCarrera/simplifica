# Google Workspace Email — Integration Test Checklist

This checklist maps smoke test scenarios to the acceptance criteria defined in `spec.md` (F-GW-001 through F-GW-006).

---

## Prerequisites

Before running these tests, ensure:
- [ ] A Google Workspace account (`provider_type = 'google_workspace'`) exists in `company_email_accounts`
- [ ] `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` are configured in Edge Function secrets
- [ ] The `company_email_accounts` table has the new OAuth columns (`oauth_refresh_token`, `oauth_client_id`, `auth_method`, etc.)
- [ ] `ENCRYPTION_KEY` is set in Edge Function secrets

---

## Test Scenarios

### F-GW-001: SMTP Configuration

**Scenario**: Admin configures SMTP relay

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Navigate to **Email Accounts** → **Google WS** tab | Google Workspace accounts load |
| 2 | Select a Google Workspace account | Account details panel appears |
| 3 | Go to **SMTP** tab | SMTP form with host/port/user/password fields |
| 4 | Enter: `smtp-relay.gmail.com`, port `587`, user `admin@tu-dominio.com`, App Password | Form accepts values |
| 5 | Click **Guardar SMTP** | Toast: "SMTP configurado" or success message |
| 6 | Click **Enviar prueba** | Test email modal opens |
| 7 | Enter a test recipient email and submit | Email received within ~30 seconds |
| 8 | Verify the email appears in email logs with correct from address | Log entry shows `google_workspace` + `password` auth method |

**Pass Criteria**: Test email is sent and delivered; credentials are encrypted in DB.

---

### F-GW-002: OAuth2 Configuration

**Scenario**: Admin configures via OAuth2 flow

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Navigate to **Email Accounts** → **Google WS** tab | Account list loads |
| 2 | Select a Google Workspace account | Account panel opens on OAuth2 tab by default |
| 3 | Verify OAuth status shows "No configurado" | Badge shows `idle` status |
| 4 | Click **Conectar con Google** | Google OAuth consent popup opens |
| 5 | Complete Google sign-in and consent screen | Popup closes; status updates |
| 6 | Verify status badge changes to "connected" or similar | OAuth status signal becomes `connected` |
| 7 | Verify `auth_method` = `'oauth2'` in database | `company_email_accounts.auth_method = 'oauth2'` |
| 8 | Verify `oauth_refresh_token` is encrypted in DB | Column has encrypted value (not plaintext) |

**Pass Criteria**: OAuth flow completes without errors; tokens stored encrypted; `auth_method = 'oauth2'`.

---

### F-GW-003: Test Email via Gmail API

**Scenario**: Test email sent via configured OAuth2 account

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | After F-GW-002 completes, click **Enviar prueba** | Test email modal opens |
| 2 | Enter a recipient email you can access | Field validates as email format |
| 3 | Click **Enviar** | Button shows spinner → success or error |
| 4 | Verify email is received with correct "From" address | Email shows the configured Workspace address |
| 5 | Check Edge Function logs | Request logs show `gmail.googleapis.com` call |

**Pass Criteria**: Test email received with correct from address via Gmail API.

---

### F-GW-004: Default Sender Selection

**Scenario**: Admin selects default sender across multiple accounts

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Create or ensure 2+ Google Workspace accounts exist | At least 2 accounts in account list |
| 2 | On the first account, click **Establecer como principal** | Toast confirms primary updated |
| 3 | Verify the account shows "Principal" badge | Purple badge with star appears |
| 4 | Click **Establecer como principal** on the second account | First account loses primary; second gains it |
| 5 | Verify in database: `is_primary` is `true` for selected account only | Single `true`, all others `false` |

**Pass Criteria**: Only one account is primary at a time; CRM emails use primary address for sending.

---

### F-GW-005: Gmail API Sending with Token Refresh

**Scenario**: System sends via Gmail API with automatic token refresh

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | With an OAuth2-connected account, trigger a CRM email (e.g., booking confirmation) | Email is sent successfully |
| 2 | Check Edge Function logs | Logs show `gmail.googleapis.com` was called |
| 3 | Simulate token expiry (token refresh) | System auto-refreshes and continues sending |
| 4 | Verify `oauth_token_expiry` is updated in DB after refresh | Timestamp updated in `company_email_accounts` |

**Pass Criteria**: Emails go through Gmail API; token refresh is transparent to user.

---

### F-GW-006: Error Handling

**Scenario**: Email send fails with specific error

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Disconnect OAuth by clearing `oauth_refresh_token` in DB (test only) | Account shows OAuth configured but token missing |
| 2 | Trigger a CRM email | Email fails gracefully |
| 3 | Check response | Returns `{ success: false, error: { code, message, retryable } }` |
| 4 | Verify no crash/500 in Edge Function logs | Error is caught and structured |
| 5 | Verify fallback to SMTP works if SMTP credentials exist | Email sent via SMTP instead |

**Pass Criteria**: Errors return structured response; no crashes; retryable errors are identifiable.

---

## Smoke Test (Complete Flow)

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Create a new Google Workspace account via the "Nueva cuenta" modal | Account appears in list |
| 2 | Configure SMTP credentials (F-GW-001) | Test email sends |
| 3 | Re-configure with OAuth2 (F-GW-002) | OAuth flow completes |
| 4 | Send test email via OAuth (F-GW-003) | Email received via Gmail API |
| 5 | Set as primary (F-GW-004) | Account marked primary |
| 6 | Trigger a production email | Goes through primary account |
| 7 | Break OAuth, trigger email (F-GW-006) | Falls back to SMTP gracefully |

---

## Regression: SES Sending Unaffected

| # | Step | Expected Result |
|---|------|-----------------|
| 1 | Have at least one SES account configured | SES account in email accounts list |
| 2 | Send a booking confirmation (or any CRM email that defaults to SES) | Email goes through SES |
| 3 | Verify Edge Function logs | `ses` provider type, not `google_workspace` |
| 4 | Google Workspace changes do NOT break SES sending | SES continues to work |

---

## Spec Acceptance Criteria Checklist

| ID | Criterion | Tested | Notes |
|----|-----------|--------|-------|
| F-GW-001 | Admin can configure SMTP and receive "Connected Successfully" on valid credentials | [ ] | |
| F-GW-002 | Admin can complete OAuth2 flow with "Connect with Google" button | [ ] | |
| F-GW-003 | Test email sent and delivered from configured Workspace address | [ ] | |
| F-GW-004 | Admin can set default sender; CRM uses default for all outgoing emails | [ ] | |
| F-GW-005 | Emails sent via Gmail API with automatic token refresh | [ ] | |
| F-GW-006 | Errors return structured response with specific error codes; no crashes | [ ] | |
| — | Fallback to SMTP works when OAuth fails | [ ] | |
| — | Existing SES email sending unaffected | [ ] | |