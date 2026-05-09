/**
 * Gmail API email provider using OAuth2.
 * Handles token refresh, MIME message building, and Gmail API calls.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { EmailParams, EmailResult, TestResult } from './email-providers.ts';

export class GmailAPIProvider {
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;
  private supabaseAdmin: ReturnType<typeof createClient>;

  constructor(
    private refreshToken: string,
    private accountId: string,
    supabaseAdmin: ReturnType<typeof createClient>,
  ) {
    this.supabaseAdmin = supabaseAdmin;
  }

  /**
   * Send an email via Gmail API.
   * Auto-refreshes token if expired or within 5-minute buffer.
   */
  async send(params: EmailParams): Promise<EmailResult> {
    try {
      await this.ensureValidToken();

      if (!this.accessToken) {
        return {
          success: false,
          error: { code: 'OAUTH_NO_TOKEN', message: 'No access token available', retryable: false },
        };
      }

      const rawMessage = this.buildRawMessage(params);
      const encoded = this.base64urlEncode(rawMessage);

      const response = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ raw: encoded }),
        },
      );

      // 401: token may have been revoked, try refreshing once
      if (response.status === 401) {
        console.warn('[GmailAPIProvider] 401 received, attempting token refresh and retry');
        await this.refreshAccessToken();
        if (!this.accessToken) {
          return { success: false, error: { code: 'OAUTH_TOKEN_INVALID', message: 'Access token invalid or revoked after refresh', retryable: false } };
        }

        const retryResponse = await fetch(
          'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${this.accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ raw: encoded }),
          },
        );

        if (!retryResponse.ok) {
          return this.mapGmailError(retryResponse);
        }
        return this.parseGmailResponse(retryResponse);
      }

      if (!response.ok) {
        return this.mapGmailError(response);
      }

      return this.parseGmailResponse(response);
    } catch (err: any) {
      return { success: false, error: { code: 'GMAIL_SEND_ERROR', message: err.message || 'Gmail send failed', retryable: true } };
    }
  }

  /**
   * Send a test email (used by company-email-accounts test endpoint).
   */
  async test(params: EmailParams): Promise<TestResult> {
    try {
      const result = await this.send(params);
      return {
        success: result.success,
        message: result.messageId,
        error: result.error ? { code: result.error.code, message: result.error.message } : undefined,
      };
    } catch (err: any) {
      return { success: false, error: { code: 'GMAIL_TEST_FAILED', message: err.message } };
    }
  }

  /**
   * Get provider status.
   */
  getStatus(): { configured: boolean; error?: string } {
    return { configured: true };
  }

  /**
   * Build a raw MIME RFC822 message.
   */
  private buildRawMessage(params: EmailParams): string {
    const lines: string[] = [];

    // From
    const fromAddr = params.from.name
      ? `"${params.from.name.replace(/"/g, '\\"')}" <${params.from.email}>`
      : params.from.email;
    lines.push(`From: ${fromAddr}`);

    // To
    lines.push(`To: ${params.to.join(', ')}`);

    // CC
    if (params.cc && params.cc.length > 0) {
      lines.push(`Cc: ${params.cc.join(', ')}`);
    }

    // Subject
    lines.push(`Subject: ${params.subject}`);

    // Content-Type and body
    lines.push('Content-Type: text/html; charset=utf-8');
    lines.push('');
    lines.push(params.html);

    return lines.join('\r\n');
  }

  /**
   * Base64url encode (RFC 4648 URL-safe base64).
   */
  private base64urlEncode(str: string): string {
    const b64 = btoa(str);
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /**
   * Ensure we have a valid access token, refreshing if needed.
   * Uses 5-minute buffer before expiry.
   */
  private async ensureValidToken(): Promise<void> {
    if (this.tokenExpiry && new Date() < new Date(this.tokenExpiry.getTime() - 5 * 60 * 1000)) {
      return; // token is still valid with 5-min buffer
    }
    await this.refreshAccessToken();
  }

  /**
   * Refresh the OAuth2 access token using the refresh token.
   */
  async refreshAccessToken(): Promise<void> {
    const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID') ?? '';
    const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET') ?? '';

    if (!clientId || !clientSecret) {
      throw new Error('Google OAuth client credentials not configured');
    }

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

    // Persist encrypted expiry to DB (access token itself stays in memory only)
    const encryptionKey = Deno.env.get('ENCRYPTION_KEY') ?? '';
    const { data: encryptedExpiry } = await this.supabaseAdmin.rpc('encrypt_text', {
      text: this.tokenExpiry.toISOString(),
      key: encryptionKey,
    });

    if (!encryptedExpiry) {
      console.warn('[GmailAPIProvider] Failed to encrypt token expiry for account:', this.accountId);
    } else {
      // Store plaintext expiry (not sensitive) - just the timestamp
      await this.supabaseAdmin
        .from('company_email_accounts')
        .update({ oauth_token_expiry: this.tokenExpiry.toISOString() })
        .eq('id', this.accountId);
    }
  }

  /**
   * Map Gmail API HTTP response to EmailResult error.
   */
  private mapGmailError(response: Response): EmailResult {
    const status = response.status;
    if (status === 401) {
      return { success: false, error: { code: 'OAUTH_TOKEN_INVALID', message: 'Access token invalid or revoked', retryable: false }, retryable: false };
    }
    if (status === 403) {
      return { success: false, error: { code: 'GMAIL_FORBIDDEN', message: 'Gmail API access forbidden — check scopes', retryable: false }, retryable: false };
    }
    if (status === 429) {
      return { success: false, error: { code: 'GMAIL_RATE_LIMIT', message: 'Gmail API rate limit exceeded', retryable: true }, retryable: true };
    }
    return {
      success: false,
      error: { code: 'GMAIL_API_ERROR', message: `Gmail API error ${status}`, retryable: status >= 500 },
      retryable: status >= 500,
    };
  }

  /**
   * Parse successful Gmail API response.
   */
  private async parseGmailResponse(response: Response): Promise<EmailResult> {
    const data = await response.json();
    return { success: true, messageId: data.id };
  }
}