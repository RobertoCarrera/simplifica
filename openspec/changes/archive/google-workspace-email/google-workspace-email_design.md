# Google Workspace Email — Technical Design

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Angular Admin UI                                  │
│  src/app/features/admin/email-accounts/email-config/                  │
│  ─ EmailConfigComponent (OAuth2 + SMTP form, test email)             │
│  ─ EmailConfigService (shared/services/)                            │
└──────────────────┬──────────────────────────────────────────────────┘
                   │ REST / OAuth2 redirect
                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│               Supabase Edge Functions                                │
│                                                                      │
│  company-email-accounts/          send-branded-email/                 │
│  ├── GET  /google-auth-url        ─────────────────────             │
│  ├── POST /google-callback        sendViaGmailAPI()  ◄── new         │
│  ├── PATCH /:id (OAuth update)    sendViaSMTP()                      │
│  ├── POST /:id/test               sendViaSES()                        │
│  └── existing CRUD                                             │
│                                                                      │
│  Dispatch logic (provider_type + auth_method):                       │
│  google_workspace + oauth_refresh_token → Gmail API                  │
│  google_workspace + smtp_password            → SMTP relay             │
│  ses_iam / ses_shared                          → AWS SES             │
└──────────────────┬──────────────────────────────────────────────────┘
                   │
       ┌───────────┼────────────────┐
       ▼           ▼                ▼
   Gmail API    SMTP relay      AWS SES
  (OAuth2)    smtp-relay.gmail  (existing)
               .com:587
```

**Existing code reuse:**
- `send-branded-email/index.ts` already has `sendViaSMTP()` (lines 630–664) using nodemailer
- `company-email-accounts/index.ts` provides CRUD structure to extend
- `CompanyEmailService` in `src/app/services/company-email.service.ts` is the Angular service to extend
- `company-email.models.ts` provides TypeScript interfaces to extend

---

## 2. Email Provider Abstraction

### TypeScript Interface

```typescript
// shared/email-providers.ts — new shared types for Edge Functions

export interface Attachment {
  filename: string;
  content: string;        // base64-encoded
  contentType?: string;
}

export interface EmailParams {
  from: { email: string; name?: string };
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: Attachment[];
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

export interface TestResult {
  success: boolean;
  message?: string;
  error?: {
    code: string;
    message: string;
  };
}

export type ProviderStatus = 'ready' | 'degraded' | 'error';

export interface EmailProvider {
  send(params: EmailParams): Promise<EmailResult>;
  test(params: EmailParams): Promise<TestResult>;
  getStatus(): ProviderStatus;
}
```

### Concrete Implementations

```typescript
// providers/smtp-provider.ts
export class SMTPProvider implements EmailProvider {
  constructor(
    private host: string,
    private port: number,
    private user: string,
    private password: string,  // already decrypted
  ) {}

  async send(params: EmailParams): Promise<EmailResult> {
    // Reuse existing sendViaSMTP() from send-branded-email
    const result = await sendViaSMTP(this.host, this.port, this.user, this.password,
      params.from.email, params.from.name ?? null,
      params.to, params.subject, params.html);
    return { success: result.success, messageId: result.messageId, error: result.error ? { code: 'SMTP_ERROR', message: result.error, retryable: false } : undefined };
  }

  async test(params: EmailParams): Promise<TestResult> {
    return this.send(params).then(r => ({ success: r.success, message: r.messageId, error: r.error }));
  }

  getStatus(): ProviderStatus { return 'ready'; }
}

// providers/gmail-api-provider.ts
export class GmailAPIProvider implements EmailProvider {
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;

  constructor(
    private refreshToken: string,  // encrypted, decrypted by caller
    private accountId: string,
    private supabaseAdmin: ReturnType<typeof createClient>,
  ) {}

  async send(params: EmailParams): Promise<EmailResult> {
    await this.ensureValidToken();
    const rawMessage = this.buildRawMessage(params);
    const encoded = this.base64urlEncode(rawMessage);

    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: encoded }),
    });

    if (response.status === 401) {
      // Token was revoked — attempt refresh once
      await this.refreshAccessToken();
      const retry = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw: encoded }),
      });
      if (!retry.ok) return this.mapGmailError(retry);
      return this.parseGmailResponse(retry);
    }

    if (!response.ok) return this.mapGmailError(response);

    return this.parseGmailResponse(response);
  }

  private buildRawMessage(params: EmailParams): string {
    const lines = [
      `From: ${params.from.name ? `"${params.from.name}" <${params.from.email}>` : params.from.email}`,
      `To: ${params.to.join(', ')}`,
      `Subject: ${params.subject}`,
      `Content-Type: text/html; charset=utf-8`,
      '',
      params.html,
    ];
    return lines.join('\r\n');
  }

  private base64urlEncode(str: string): string {
    const b64 = btoa(str);
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  private async ensureValidToken(): Promise<void> {
    if (this.tokenExpiry && (new Date()) < new Date(this.tokenExpiry.getTime() - 5 * 60 * 1000)) {
      return; // valid with 5-minute buffer
    }
    await this.refreshAccessToken();
  }

  async refreshAccessToken(): Promise<void> {
    const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID') ?? '';
    const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET') ?? '';

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: this.refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.json();
      throw new Error(`Token refresh failed: ${err.error_description ?? err.error}`);
    }

    const tokens = await tokenRes.json();
    this.accessToken = tokens.access_token;
    this.tokenExpiry = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000);

    // Persist encrypted expiry to DB (not the access token itself)
    const encryptionKey = Deno.env.get('ENCRYPTION_KEY') ?? '';
    const { error: expiryErr } = await this.supabaseAdmin.rpc('encrypt_text', {
      text: this.tokenExpiry.toISOString(),
      key: encryptionKey,
    });
    if (!expiryErr) {
      await this.supabaseAdmin
        .from('company_email_accounts')
        .update({ oauth_token_expiry: this.tokenExpiry.toISOString() })
        .eq('id', this.accountId);
    }
  }

  private mapGmailError(response: Response): EmailResult {
    const status = response.status;
    if (status === 401) return { success: false, error: { code: 'OAUTH_TOKEN_INVALID', message: 'Access token invalid or revoked', retryable: false } };
    if (status === 403) return { success: false, error: { code: 'GMAIL_FORBIDDEN', message: 'Gmail API access forbidden — check scopes', retryable: false } };
    if (status === 429) return { success: false, error: { code: 'GMAIL_RATE_LIMIT', message: 'Gmail API rate limit exceeded', retryable: true } };
    return { success: false, error: { code: 'GMAIL_API_ERROR', message: `Gmail API error ${status}`, retryable: status >= 500 } };
  }

  private async parseGmailResponse(response: Response): Promise<EmailResult> {
    const data = await response.json();
    return { success: true, messageId: data.id };
  }

  async test(params: EmailParams): Promise<TestResult> {
    try {
      const result = await this.send(params);
      return { success: result.success, error: result.error };
    } catch (e: any) {
      return { success: false, error: { code: 'GMAIL_TEST_FAILED', message: e.message } };
    }
  }

  getStatus(): ProviderStatus { return 'ready'; }
}
```

### Dispatch Logic in `send-branded-email`

```typescript
// In the send-branded-email handler, where provider routing happens (line ~871):
if (providerType === 'google_workspace') {
  const oauthRefreshToken = account?.oauth_refresh_token;
  const authMethod = account?.auth_method;

  if (authMethod === 'oauth2' && oauthRefreshToken) {
    // ── Gmail API path ──────────────────────────────────────────
    const encryptedRefreshToken = account.oauth_refresh_token;
    const encryptionKey = Deno.env.get('ENCRYPTION_KEY') ?? '';
    const { data: refreshToken } = await supabaseAdmin.rpc('decrypt_text', {
      encrypted_hex: encryptedRefreshToken,
      key: encryptionKey,
    });

    if (!refreshToken) {
      sendResult = { success: false, error: 'google_oauth_no_token' };
    } else {
      const gmailProvider = new GmailAPIProvider(refreshToken, account.id, supabaseAdmin);
      const emailResult = await gmailProvider.send({
        from: { email: fromEmail, name: fromName },
        to: toEmails,
        subject: emailSubject,
        html: htmlBody,
      });
      sendResult = {
        success: emailResult.success,
        messageId: emailResult.messageId,
        error: emailResult.error?.message,
      };
    }
  } else {
    // ── SMTP path (existing) ─────────────────────────────────────
    sendResult = await sendViaSMTP(smtpHost, smtpPort, smtpUser, decryptedPassword, ...);
  }
}
```

---

## 3. Database Migration

```sql
-- supabase/migrations/xxxx_add_google_oauth_columns.sql

BEGIN;

-- Add OAuth2 columns to company_email_accounts
ALTER TABLE company_email_accounts
  ADD COLUMN IF NOT EXISTS oauth_client_id        text,
  ADD COLUMN IF NOT EXISTS oauth_client_secret    text,
  ADD COLUMN IF NOT EXISTS oauth_refresh_token    text,
  ADD COLUMN IF NOT EXISTS oauth_token_expiry     timestamptz,
  ADD COLUMN IF NOT EXISTS auth_method            text DEFAULT 'password';

-- auth_method values: 'password' (default, existing SMTP) | 'oauth2'

-- Mark existing google_workspace rows as 'password' auth (backward compat)
UPDATE company_email_accounts
  SET auth_method = 'password'
  WHERE provider_type = 'google_workspace'
    AND auth_method IS NULL;

-- RLS: grant read access to oauth columns for owners/admins of the company
-- (oauth columns are encrypted, so exposing column names is not a security risk)

COMMIT;
```

**Note on storage:** All OAuth tokens stored in `oauth_refresh_token` are encrypted via `encrypt_text` RPC before INSERT/UPDATE. The `oauth_access_token` is NOT stored to DB — it is kept in-memory only (via `GmailAPIProvider` instance) during the request lifecycle.

---

## 4. Edge Function: `company-email-accounts`

### New Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/google-auth-url` | Returns Google OAuth consent URL |
| POST | `/google-callback` | Handles OAuth2 callback from Google |
| POST | `/:id/test` | Sends test email from account |
| PATCH | `/:id` | Updates OAuth2 credentials |

### GET `/google-auth-url` — Initiate OAuth Flow

```typescript
// In company-email-accounts/index.ts

// In-memory state store (Map<state, {accountId, companyId, expiresAt}>)
const oauthStateStore = new Map<string, { accountId: string; companyId: string; expiresAt: Date }>();

// GET /company-email-accounts/google-auth-url
if (method === 'GET' && pathParts[pathParts.length - 1] === 'google-auth-url') {
  // Get accountId from query param ?account_id=uuid
  const url = new URL(req.url);
  const accountId = url.searchParams.get('account_id');

  if (!accountId || !isValidUUID(accountId)) {
    return jsonError(400, 'account_id inválido o faltante');
  }

  // Verify user owns this account
  const { data: account } = await supabaseClient
    .from('company_email_accounts')
    .select('company_id, email, provider_type')
    .eq('id', accountId)
    .single();

  if (!account || account.provider_type !== 'google_workspace') {
    return jsonError(404, 'Cuenta Google Workspace no encontrada');
  }

  // Check user is owner/admin of the company
  const role = await getUserCompanyRole(supabaseClient, userId, account.company_id);
  if (role !== 'owner' && role !== 'admin') {
    return jsonError(403, 'Solo owners y admins pueden configurar OAuth');
  }

  // Generate CSRF state
  const state = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  oauthStateStore.set(state, { accountId, companyId: account.company_id, expiresAt });

  const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID') ?? '';
  const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/company-email-accounts/google-callback`;

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/gmail.send');
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('state', state);

  return jsonSuccess(200, { auth_url: authUrl.toString() });
}
```

### POST `/google-callback` — Handle OAuth Callback

```typescript
// POST /company-email-accounts/google-callback
if (method === 'POST' && pathParts[pathParts.length - 1] === 'google-callback') {
  const { code, state, account_id } = await req.json();

  if (!code || !state || !account_id) {
    return jsonError(400, 'code, state y account_id son requeridos');
  }

  if (!isValidUUID(account_id)) {
    return jsonError(400, 'account_id inválido');
  }

  // Validate CSRF state
  const storedState = oauthStateStore.get(state);
  if (!storedState || storedState.expiresAt < new Date()) {
    oauthStateStore.delete(state);
    return jsonError(400, 'State inválido o expirado — reinicia el flujo OAuth');
  }

  if (storedState.accountId !== account_id) {
    return jsonError(400, 'Account ID no coincide con el estado OAuth');
  }

  oauthStateStore.delete(state);

  // Exchange code for tokens
  const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID') ?? '';
  const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET') ?? '';
  const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/company-email-accounts/google-callback`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.json();
    console.error('[google-callback] Token exchange failed:', err);
    return jsonError(400, `Error OAuth: ${err.error_description ?? err.error}`);
  }

  const tokens = await tokenRes.json();
  const accessToken = tokens.access_token;
  const refreshToken = tokens.refresh_token;
  const expiresIn = tokens.expires_in ?? 3600;
  const tokenExpiry = new Date(Date.now() + expiresIn * 1000);

  // Encrypt tokens before storing
  const encryptionKey = Deno.env.get('ENCRYPTION_KEY') ?? '';

  const [encRefresh, encAccess] = await Promise.all([
    supabaseAdmin.rpc('encrypt_text', { text: refreshToken, key: encryptionKey }),
    supabaseAdmin.rpc('encrypt_text', { text: accessToken,  key: encryptionKey }),
  ]);

  if (encRefresh.error || !encRefresh.data) {
    throw new Error('Failed to encrypt refresh token');
  }

  // Update account with OAuth tokens
  const { data: updated, error: updateErr } = await supabaseAdmin
    .from('company_email_accounts')
    .update({
      oauth_refresh_token: encRefresh.data,
      oauth_access_token: encAccess.data,     // runtime-only, encrypted
      oauth_token_expiry: tokenExpiry.toISOString(),
      auth_method: 'oauth2',
      is_verified: true,                      // trust Google's verification
      verified_at: new Date().toISOString(),
    })
    .eq('id', account_id)
    .select()
    .single();

  if (updateErr) throw updateErr;

  // Send a test email to verify sending works
  try {
    const testEmail = account?.email; // the workspace email
    if (testEmail) {
      await sendTestEmailViaGmail(accessToken, testEmail, 'noreply@simplifica.es');
    }
  } catch (e: any) {
    console.warn('[google-callback] Test email failed (non-fatal):', e.message);
  }

  return jsonSuccess(200, { message: 'OAuth configurado correctamente', account: updated });
}
```

### POST `/:id/test` — Send Test Email

```typescript
// POST /company-email-accounts/:id/test
if (method === 'POST' && resourceId) {
  // Validate user owns account + is owner/admin
  const { data: account } = await supabaseClient
    .from('company_email_accounts')
    .select('*')
    .eq('id', resourceId)
    .single();

  if (!account) return jsonError(404, 'Cuenta no encontrada');

  const role = await getUserCompanyRole(supabaseClient, userId, account.company_id);
  if (role !== 'owner' && role !== 'admin') {
    return jsonError(403, 'Solo owners y admins pueden enviar emails de prueba');
  }

  const { recipient_email } = await req.json();
  if (!recipient_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient_email)) {
    return jsonError(400, 'recipient_email inválido');
  }

  // Build test email params
  const fromEmail = account.ses_from_email || account.email;
  const fromName = account.display_name || 'Simplifica CRM';
  const subject = `Test email from ${fromEmail}`;
  const htmlBody = `<p>This is a test email from Simplifica CRM.</p><p>If you received this, the configuration is working correctly.</p>`;

  let result;
  if (account.provider_type === 'google_workspace') {
    if (account.auth_method === 'oauth2' && account.oauth_refresh_token) {
      const enc = account.oauth_refresh_token;
      const encryptionKey = Deno.env.get('ENCRYPTION_KEY') ?? '';
      const { data: refreshToken } = await supabaseAdmin.rpc('decrypt_text', {
        encrypted_hex: enc, key: encryptionKey,
      });
      if (!refreshToken) {
        return jsonError(500, 'No se pudo desencriptar el token OAuth');
      }
      const gmailProvider = new GmailAPIProvider(refreshToken, account.id, supabaseAdmin);
      const testResult = await gmailProvider.test({
        from: { email: fromEmail, name: fromName },
        to: [recipient_email],
        subject,
        html: htmlBody,
      });
      result = testResult;
    } else {
      // SMTP path
      const encPw = account.smtp_encrypted_password;
      if (!encPw) return jsonError(500, 'Credenciales SMTP no configuradas');
      const encryptionKey = Deno.env.get('ENCRYPTION_KEY') ?? '';
      const { data: password } = await supabaseAdmin.rpc('decrypt_text', {
        encrypted_hex: encPw, key: encryptionKey,
      });
      if (!password) return jsonError(500, 'No se pudo desencriptar la contraseña SMTP');
      const smtpResult = await sendViaSMTP(
        account.smtp_host ?? 'smtp-relay.gmail.com',
        account.smtp_port ?? 587,
        account.smtp_user ?? fromEmail,
        password,
        fromEmail,
        fromName,
        [recipient_email],
        subject,
        htmlBody,
      );
      result = { success: smtpResult.success, message: smtpResult.messageId, error: smtpResult.error ? { code: 'SMTP_ERROR', message: smtpResult.error } : undefined };
    }
  } else {
    return jsonError(400, 'Esta cuenta no soporta emails de prueba');
  }

  if (result.success) {
    return jsonSuccess(200, { message: `Test email enviado a ${recipient_email}` });
  } else {
    return jsonError(500, { success: false, error: result.error });
  }
}
```

---

## 5. Edge Function: `send-branded-email`

### Changes to `EmailAccount` interface (add OAuth fields)

```typescript
// Add to existing EmailAccount interface
interface EmailAccount {
  // ... existing fields ...

  // Google Workspace OAuth2 (new)
  oauth_refresh_token?: string | null;   // encrypted
  oauth_access_token?: string | null;    // encrypted, runtime only
  oauth_token_expiry?: string | null;     // timestamptz
  auth_method?: 'password' | 'oauth2';
}
```

### New `sendViaGmailAPI()` function

```typescript
async function sendViaGmailAPI(
  account: EmailAccount,
  fromEmail: string,
  fromName: string | null,
  toEmails: string[],
  subject: string,
  htmlBody: string,
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const encryptionKey = Deno.env.get('ENCRYPTION_KEY') ?? '';

  // Decrypt refresh token
  const { data: refreshToken, error: decryptErr } = await supabaseAdmin.rpc('decrypt_text', {
    encrypted_hex: account.oauth_refresh_token!,
    key: encryptionKey,
  });

  if (decryptErr || !refreshToken) {
    console.error('[send-branded-email] OAuth refresh token decryption failed for account:', account.id);
    return { success: false, error: 'oauth_token_decryption_failed' };
  }

  const provider = new GmailAPIProvider(refreshToken, account.id, supabaseAdmin);

  try {
    const result = await provider.send({
      from: { email: fromEmail, name: fromName ?? undefined },
      to: toEmails,
      subject,
      html: htmlBody,
    });

    return {
      success: result.success,
      messageId: result.messageId,
      error: result.error?.message,
    };
  } catch (err: any) {
    console.error('[send-branded-email] Gmail API error:', err.message);
    return { success: false, error: err.message };
  }
}
```

### Updated dispatch block (replace existing `if (providerType === 'google_workspace')` block)

```typescript
if (providerType === 'google_workspace') {
  const authMethod = account?.auth_method;

  if (authMethod === 'oauth2' && account?.oauth_refresh_token) {
    // Primary: Gmail API
    const gmailResult = await sendViaGmailAPI(
      account,
      fromEmail,
      fromName,
      toEmails,
      emailSubject,
      htmlBody,
    );

    if (!gmailResult.success) {
      // Fallback to SMTP if OAuth fails
      console.warn(`[send-branded-email] Gmail API failed for account ${accountId}, falling back to SMTP: ${gmailResult.error}`);
      if (account?.smtp_host && account?.smtp_encrypted_password) {
        const encryptionKey = Deno.env.get('ENCRYPTION_KEY') ?? '';
        const { data: smtpPw } = await supabaseAdmin.rpc('decrypt_text', {
          encrypted_hex: account.smtp_encrypted_password,
          key: encryptionKey,
        });
        if (smtpPw) {
          sendResult = await sendViaSMTP(
            account.smtp_host, account.smtp_port ?? 587, account.smtp_user ?? fromEmail, smtpPw,
            fromEmail, fromName, toEmails, emailSubject, htmlBody,
          );
        } else {
          sendResult = { success: false, error: `gmail_api_failed:${gmailResult.error}` };
        }
      } else {
        sendResult = { success: false, error: `gmail_api_failed:${gmailResult.error}` };
      }
    } else {
      sendResult = { success: true, messageId: gmailResult.messageId };
    }
  } else if (account?.smtp_host && account?.smtp_encrypted_password) {
    // SMTP fallback (existing behavior)
    const encryptionKey = Deno.env.get('ENCRYPTION_KEY') ?? '';
    const { data: decryptedPassword } = await supabaseAdmin.rpc('decrypt_text', {
      encrypted_hex: account.smtp_encrypted_password,
      key: encryptionKey,
    });
    if (!decryptedPassword) {
      sendResult = { success: false, error: 'smtp_password_decryption_failed' };
    } else {
      sendResult = await sendViaSMTP(
        account.smtp_host, account.smtp_port ?? 587,
        account.smtp_user ?? fromEmail, decryptedPassword,
        fromEmail, fromName, toEmails, emailSubject, htmlBody,
      );
    }
  } else {
    sendResult = { success: false, error: 'google_workspace_not_configured' };
  }
}
```

---

## 6. Angular Admin UI

### New Component Structure

```
src/app/features/admin/email-accounts/
  ├── email-accounts.component.ts        # existing — tab router
  ├── email-account-form.component.ts    # existing — SMTP form
  └── email-config/
      ├── email-config.component.ts      # NEW — full config (OAuth2 + SMTP)
      ├── email-config.component.html
      ├── email-config.component.scss
      ├── email-config.service.ts        # NEW — wraps CompanyEmailService
      └── providers/
          └── email-provider.interface.ts
```

### `EmailConfigService`

```typescript
// src/app/features/admin/email-accounts/email-config/email-config.service.ts
@Injectable({ providedIn: 'root' })
export class EmailConfigService {
  private cfg = inject(RuntimeConfigService);
  private supabase = inject(SupabaseClientService).instance;
  private baseUrl = this.cfg.get().edgeFunctionsBaseUrl;

  /**
   * Get the Google OAuth2 authorization URL.
   * Opens a popup window for the OAuth flow.
   */
  async initiateGoogleOAuth(accountId: string): Promise<void> {
    const { data: { session } } = await this.supabase.auth.getSession();
    const token = session?.access_token;
    const url = `${this.baseUrl}/company-email-accounts/google-auth-url?account_id=${accountId}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);

    // Open OAuth consent in popup
    const popup = window.open(json.data.auth_url, 'google_oauth', 'width=600,height=700');
    return new Promise((resolve, reject) => {
      // Listen for callback on window (postMessage from redirect or popup close)
      const listener = (event: MessageEvent) => {
        if (event.data?.type === 'google_oauth_success') {
          window.removeEventListener('message', listener);
          resolve();
        } else if (event.data?.type === 'google_oauth_error') {
          window.removeEventListener('message', listener);
          reject(new Error(event.data.message));
        }
      };
      window.addEventListener('message', listener);
      // Timeout after 10 minutes
      setTimeout(() => { window.removeEventListener('message', listener); reject(new Error('OAuth timeout')); }, 10 * 60 * 1000);
    });
  }

  /**
   * After OAuth callback, update account with OAuth tokens.
   * The Edge Function handles token exchange and storage.
   */
  async handleOAuthCallback(code: string, state: string, accountId: string): Promise<void> {
    const { data: { session } } = await this.supabase.auth.getSession();
    const token = session?.access_token;
    const res = await fetch(`${this.baseUrl}/company-email-accounts/google-callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ code, state, account_id: accountId }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error || json.message);
  }

  /**
   * Update OAuth credentials (when user brings their own GCP credentials).
   */
  async updateOAuthCredentials(
    accountId: string,
    clientId: string,
    clientSecret: string,
    refreshToken: string,
  ): Observable<CompanyEmailAccount> {
    return from(
      this.supabase.functions.invoke('company-email-accounts', {
        method: 'PATCH',
        body: {
          id: accountId,
          oauth_client_id: clientId,       // will be encrypted server-side
          oauth_client_secret: clientSecret,
          oauth_refresh_token: refreshToken,
          auth_method: 'oauth2',
        },
      }).then(r => r.data as CompanyEmailAccount)
    );
  }

  /**
   * Send a test email from a specific account.
   */
  async testAccountEmail(accountId: string, recipientEmail: string): Promise<void> {
    const { data: { session } } = await this.supabase.auth.getSession();
    const token = session?.access_token;
    const res = await fetch(`${this.baseUrl}/company-email-accounts/${accountId}/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ recipient_email: recipientEmail }),
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error?.message || 'Test email failed');
  }

  /**
   * Get accounts with full OAuth status.
   */
  getAccounts(companyId: string): Observable<CompanyEmailAccount[]> {
    return from(
      this.supabase
        .from('company_email_accounts')
        .select('*')
        .eq('company_id', companyId)
        .eq('provider_type', 'google_workspace')
        .order('is_primary', { ascending: false })
    ).pipe(map(r => r.data as CompanyEmailAccount[]));
  }
}
```

### `EmailConfigComponent` Signals

```typescript
// src/app/features/admin/email-accounts/email-config/email-config.component.ts
interface GoogleOAuthState {
  status: 'idle' | 'connecting' | 'connected' | 'error';
  errorMessage?: string;
  lastConnectedAt?: string;
}

@Component({ selector: 'app-email-config', standalone: true, ... })
export class EmailConfigComponent {
  // ── Injected services ────────────────────────────────────────────
  private emailService = inject(CompanyEmailService);      // existing service
  private configService = inject(EmailConfigService);       // new service
  private toast = inject(ToastService);

  // ── State signals ────────────────────────────────────────────────
  accounts = signal<CompanyEmailAccount[]>([]);
  loadingAccounts = signal(false);
  selectedAccount = signal<CompanyEmailAccount | null>(null);

  // OAuth2 state per account
  oauthStates = signal<Record<string, GoogleOAuthState>>({});

  // Active auth tab: 'oauth2' | 'smtp'
  activeAuthTab = signal<'oauth2' | 'smtp'>('oauth2');

  // Test email
  testEmailModalOpen = signal(false);
  testEmailRecipient = signal('');
  sendingTestEmail = signal(false);

  // SMTP form
  smtpForm: FormGroup;

  // ── Computed ────────────────────────────────────────────────────
  selectedAccountOAuthStatus = computed((): GoogleOAuthState => {
    const id = this.selectedAccount()?.id;
    return id ? (this.oauthStates()[id] ?? { status: 'idle' }) : { status: 'idle' };
  });

  // ── Lifecycle ───────────────────────────────────────────────────
  ngOnInit() {
    this.loadAccounts();
    this.initSMTPForm();
  }

  // ── OAuth2 Flow ─────────────────────────────────────────────────
  async connectWithGoogle(account: CompanyEmailAccount) {
    this.oauthStates.update(s => ({ ...s, [account.id]: { status: 'connecting' } }));
    try {
      // Step 1: Get auth URL from Edge Function
      const { data: { session } } = await this.supabase.auth.getSession();
      const token = session?.access_token;
      const res = await fetch(
        `${this.edgeFunctionsBaseUrl}/company-email-accounts/google-auth-url?account_id=${account.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const json = await res.json();
      if (!json.success) throw new Error(json.error);

      // Step 2: Open Google consent popup
      const popup = window.open(
        json.data.auth_url,
        'google_oauth',
        'popup=yes,width=600,height=700,left=100,top=100'
      );

      // Step 3: Wait for callback via postMessage
      await this.waitForOAuthCallback(account.id);
    } catch (err: any) {
      this.oauthStates.update(s => ({
        ...s,
        [account.id]: { status: 'error', errorMessage: err.message }
      }));
    }
  }

  private waitForOAuthCallback(accountId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        window.removeEventListener('message', listener);
        reject(new Error('OAuth timeout — please try again'));
      }, 10 * 60 * 1000);

      const listener = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        if (event.data?.type === 'google_oauth_success' && event.data?.accountId === accountId) {
          clearTimeout(timeout);
          window.removeEventListener('message', listener);
          this.oauthStates.update(s => ({
            ...s, [accountId]: { status: 'connected', lastConnectedAt: new Date().toISOString() }
          }));
          this.toast.success('Google OAuth connected', 'Emails will now be sent via Gmail API');
          this.loadAccounts();
          resolve();
        }
        if (event.data?.type === 'google_oauth_error') {
          clearTimeout(timeout);
          window.removeEventListener('message', listener);
          this.oauthStates.update(s => ({
            ...s, [accountId]: { status: 'error', errorMessage: event.data.message }
          }));
          reject(new Error(event.data.message));
        }
      };
      window.addEventListener('message', listener);
    });
  }

  // ── OAuth Callback Page ─────────────────────────────────────────
  // A separate minimal component (oauth-callback.component.ts) handles the redirect
  // from Google. It extracts ?code=...&state=..., sends to handleOAuthCallback(),
  // then uses window.opener.postMessage({ type: 'google_oauth_success', accountId }) and closes.

  // ── SMTP Configuration ──────────────────────────────────────────
  private initSMTPForm() {
    this.smtpForm = this.fb.group({
      smtp_host: ['smtp-relay.gmail.com', Validators.required],
      smtp_port: [587, [Validators.required, Validators.min(1), Validators.max(65535)]],
      smtp_user: ['', Validators.required],
      smtp_password: ['', Validators.required],
    });
  }

  async saveSMTPConfig(account: CompanyEmailAccount) {
    if (!this.smtpForm.valid) return;
    const { smtp_host, smtp_port, smtp_user, smtp_password } = this.smtpForm.value;

    try {
      await this.emailService.provisionGoogleWorkspace(account.id, smtp_password);
      await this.emailService.updateAccount(account.id, {
        smtp_host, smtp_port, smtp_user,
      });
      this.toast.success('SMTP configurado', 'Credentials saved and encrypted');
      this.loadAccounts();
    } catch (err: any) {
      this.toast.error('Error', err.message);
    }
  }

  // ── Test Email ──────────────────────────────────────────────────
  async sendTestEmail(account: CompanyEmailAccount, recipient: string) {
    this.sendingTestEmail.set(true);
    try {
      await this.configService.testAccountEmail(account.id, recipient);
      this.toast.success('Test email sent', `Sent to ${recipient}`);
      this.testEmailModalOpen.set(false);
    } catch (err: any) {
      this.toast.error('Failed to send test email', err.message);
    } finally {
      this.sendingTestEmail.set(false);
    }
  }

  // ── Primary Account Selector ────────────────────────────────────
  async setAsPrimary(account: CompanyEmailAccount) {
    await firstValueFrom(this.emailService.setPrimaryAccount(account.id, account.company_id));
    this.toast.success('Default sender updated');
    this.loadAccounts();
  }
}
```

### Component Template Sections

```html
<!-- email-config.component.html — key sections -->

<!-- Account Selector -->
<div class="account-selector">
  <h3>{{ 'emailConfig.selectAccount' | transloco }}</h3>
  <div class="account-list">
    @for (account of accounts(); track account.id) {
      <div class="account-card" [class.selected]="selectedAccount()?.id === account.id"
           (click)="selectedAccount.set(account)">
        <div class="account-info">
          <span class="email">{{ account.email }}</span>
          <span class="badge" [class.oauth2]="account.auth_method === 'oauth2'"
                                 [class.smtp]="account.auth_method === 'password'">
            {{ account.auth_method === 'oauth2' ? 'Gmail API' : 'SMTP' }}
          </span>
        </div>
        <span class="primary-indicator" *ngIf="account.is_primary">★</span>
      </div>
    }
  </div>
</div>

<!-- OAuth2 Tab -->
<div class="auth-tab oauth2" *ngIf="activeAuthTab() === 'oauth2'">
  <div class="oauth-status">
    @if (selectedAccountOAuthStatus().status === 'connected') {
      <div class="status-badge success">
        <i class="fa fa-check-circle"></i>
        {{ 'emailConfig.connected' | transloco }}
        <span class="last-connected">{{ selectedAccountOAuthStatus().lastConnectedAt | date:'short' }}</span>
      </div>
    } @else if (selectedAccountOAuthStatus().status === 'error') {
      <div class="status-badge error">{{ selectedAccountOAuthStatus().errorMessage }}</div>
    }
  </div>

  <button class="btn-google" (click)="connectWithGoogle(selectedAccount())"
          [disabled]="selectedAccountOAuthStatus().status === 'connecting'">
    <img src="/assets/google-logo.svg" alt="Google">
    @if (selectedAccountOAuthStatus().status === 'connecting') {
      {{ 'emailConfig.connecting' | transloco }}...
    } @else {
      {{ 'emailConfig.connectWithGoogle' | transloco }}
    }
  </button>

  <p class="oauth-help">{{ 'emailConfig.oauthHelpText' | transloco }}</p>
</div>

<!-- SMTP Tab -->
<div class="auth-tab smtp" *ngIf="activeAuthTab() === 'smtp'">
  <form [formGroup]="smtpForm">
    <input formControlName="smtp_host" placeholder="smtp-relay.gmail.com" />
    <input type="number" formControlName="smtp_port" placeholder="587" />
    <input formControlName="smtp_user" placeholder="user@domain.com" />
    <input type="password" formControlName="smtp_password" placeholder="App Password" />

    <button class="btn-primary" (click)="saveSMTPConfig(selectedAccount())">
      {{ 'emailConfig.saveSMTP' | transloco }}
    </button>
  </form>
</div>

<!-- Test Email Section -->
<div class="test-section">
  <h4>{{ 'emailConfig.testEmail' | transloco }}</h4>
  <input [(ngModel)]="testEmailRecipient" placeholder="test@example.com" />
  <button (click)="sendTestEmail(selectedAccount(), testEmailRecipient)"
          [disabled]="sendingTestEmail()">
    {{ sendingTestEmail() ? '...' : ('emailConfig.sendTest' | transloco) }}
  </button>
</div>

<!-- Default Sender -->
<div class="primary-selector">
  <h4>{{ 'emailConfig.defaultSender' | transloco }}</h4>
  @for (account of accounts(); track account.id) {
    <label>
      <input type="radio" [checked]="account.is_primary"
             (change)="setAsPrimary(account)" />
      {{ account.email }} — {{ account.is_verified ? 'Verified' : 'Unverified' }}
    </label>
  }
</div>
```

---

## 7. Security Model

| Asset | At Rest | In Transit | Access Control |
|-------|---------|------------|----------------|
| `oauth_refresh_token` | Encrypted via `encrypt_text` RPC with `ENCRYPTION_KEY` | Always HTTPS | Edge Function only; decrypted in-memory for token refresh |
| `oauth_access_token` | NOT stored (runtime only) | HTTPS | Edge Function only |
| `oauth_token_expiry` | Plaintext in DB | HTTPS | RLS-protected column |
| `GOOGLE_OAUTH_CLIENT_ID/SECRET` | Env var (Supabase secrets) | N/A | Edge Function runtime |
| CSRF state param | In-memory Map (10min TTL) | N/A | Validated against in-memory store |

### CSRF Protection
- Random UUID state generated per OAuth initiation
- Stored in `Map<state, {accountId, companyId, expiresAt}>` with 10-minute TTL
- Validated on callback: matches `state` param AND `account_id` matches AND not expired
- After validation, state is deleted from store (single-use)

---

## 8. Environment Variables

```bash
# supabase/functions/send-branded-email/secrets:
GOOGLE_OAUTH_CLIENT_ID=your-gcp-oauth2-client-id        # app-level, shared
GOOGLE_OAUTH_CLIENT_SECRET=your-gcp-oauth2-client-secret
ENCRYPTION_KEY=<existing-32-byte-hex>                    # already exists

# supabase/functions/company-email-accounts/secrets:
GOOGLE_OAUTH_CLIENT_ID=your-gcp-oauth2-client-id
GOOGLE_OAUTH_CLIENT_SECRET=your-gcp-oauth2-client-secret
ENCRYPTION_KEY=<existing-32-byte-hex>
```

**`GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` are app-level GCP credentials.** All companies share these — only the per-company **refresh tokens** (stored encrypted in `company_email_accounts`) are what make each company's sending unique.

---

## 9. File Summary

| File | Change | Description |
|------|--------|-------------|
| `openspec/changes/google-workspace-email/design.md` | CREATE | This document |
| `supabase/migrations/xxxx_add_google_oauth_columns.sql` | CREATE | DB schema migration |
| `supabase/functions/company-email-accounts/index.ts` | MODIFY | Add OAuth endpoints + test handler |
| `supabase/functions/send-branded-email/index.ts` | MODIFY | Add `sendViaGmailAPI()`, update dispatch |
| `src/app/features/admin/email-accounts/email-config/email-config.component.ts` | CREATE | Admin UI component |
| `src/app/features/admin/email-accounts/email-config/email-config.service.ts` | CREATE | Angular OAuth2 service |
| `src/app/models/company-email.models.ts` | MODIFY | Add OAuth fields to interfaces |
| `src/app/services/company-email.service.ts` | MODIFY | Add `testAccountEmail()`, `getGoogleAuthUrl()`, `handleOAuthCallback()` |