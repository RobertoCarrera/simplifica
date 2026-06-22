import { Injectable, inject } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { Observable, from, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { SupabaseClientService } from '../../../../services/supabase-client.service';
import { RuntimeConfigService } from '../../../../services/runtime-config.service';
import { CompanyEmailAccount } from '../../../../models/company-email.models';

export interface OAuthCredentials {
  oauth_client_id: string;
  oauth_client_secret: string;
  oauth_refresh_token: string;
}

interface GoogleOAuthState {
  status: 'idle' | 'connecting' | 'connected' | 'error';
  errorMessage?: string;
  lastConnectedAt?: string;
}

@Injectable({ providedIn: 'root' })
export class EmailConfigService {
  private sbClient = inject(SupabaseClientService);
  private cfg = inject(RuntimeConfigService);
  private supabase = (this.sbClient as any).instance as SupabaseClient;
  private edgeFunctionsBaseUrl = (this.cfg as any).get().edgeFunctionsBaseUrl as string;

  /**
   * Initiate Google OAuth2 flow. Opens a popup window for the consent screen.
   * Returns the auth URL; caller opens the popup and listens for postMessage callbacks.
   */
  initiateGoogleOAuth(accountId: string): Observable<{ authUrl: string }> {
    return from(this.initiateGoogleOAuthImpl(accountId));
  }

  private async initiateGoogleOAuthImpl(
    accountId: string
  ): Promise<{ authUrl: string }> {
    const { data: { session } } = await this.supabase.auth.getSession();
    const token = session?.access_token;
    const url = `${this.edgeFunctionsBaseUrl}/company-email-accounts/google-auth-url?account_id=${accountId}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    if (!json.success) {
      throw new Error(json.error || json.message || 'Failed to get auth URL');
    }
    return { authUrl: json.data.auth_url };
  }

  /**
   * Open Google OAuth consent in a popup window and wait for callback via postMessage.
   *
   * C-4: CSRF protection — before opening the popup we generate a random nonce,
   * store it in sessionStorage keyed by accountId, and append it to the OAuth
   * `state` parameter. The callback component (oauth-callback.component.ts)
   * extracts the nonce from the returned `state` and compares it against the
   * stored value before forwarding the code to the backend. Without this,
   * an attacker could craft a URL with their own auth code and trick a logged-in
   * admin into linking the attacker's Google account to the victim's email account.
   */
  openGoogleOAuthPopup(accountId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.initiateGoogleOAuth(accountId).subscribe({
        next: async ({ authUrl }) => {
          // Generate CSRF nonce and append to state param
          const csrfNonce = this.generateAndStoreCsrfNonce(accountId);

          const authUrlWithNonce = this.appendCsrfNonceToState(authUrl, csrfNonce);

          const popup = window.open(
            authUrlWithNonce,
            'google_oauth',
            'width=600,height=700,left=100,top=100,popup=yes'
          );
          if (!popup) {
            reject(new Error('Popup blocked — please allow popups for this site'));
            return;
          }

          const timeout = setTimeout(() => {
            window.removeEventListener('message', listener);
            reject(new Error('OAuth timeout — please try again'));
          }, 10 * 60 * 1000);

          const listener = (event: MessageEvent) => {
            if (event.origin !== window.location.origin) return;
            if (event.data?.type === 'google_oauth_success' && event.data?.accountId === accountId) {
              clearTimeout(timeout);
              window.removeEventListener('message', listener);
              resolve();
            } else if (event.data?.type === 'google_oauth_error') {
              clearTimeout(timeout);
              window.removeEventListener('message', listener);
              reject(new Error(event.data.message));
            }
          };
          window.addEventListener('message', listener);
        },
        error: (err) => reject(err),
      });
    });
  }

  /**
   * C-4: Generate a fresh CSRF nonce and store it in sessionStorage keyed by
   * accountId. The callback component reads + removes this entry on success.
   */
  private generateAndStoreCsrfNonce(accountId: string): string {
    const csrfNonce = crypto.randomUUID();
    try {
      sessionStorage.setItem(`email_oauth_csrf_nonce_${accountId}`, csrfNonce);
    } catch {
      // sessionStorage unavailable (private mode, quota, etc.) — proceed anyway.
      // The callback will reject the state mismatch and the user will see an error.
    }
    return csrfNonce;
  }

  /**
   * C-4: Append the CSRF nonce to the OAuth `state` parameter using `:` as a
   * separator. The backend's google-callback edge function tolerates the
   * appended nonce (it uses its own state validation server-side).
   */
  private appendCsrfNonceToState(authUrl: string, csrfNonce: string): string {
    try {
      const url = new URL(authUrl);
      if (!['https:', 'http:'].includes(url.protocol)) {
        return authUrl; // Don't touch invalid protocol URLs
      }
      const originalState = url.searchParams.get('state') || '';
      url.searchParams.set('state', `${originalState}:${csrfNonce}`);
      return url.toString();
    } catch {
      return authUrl; // If URL parsing fails, return as-is (callback will fail validation)
    }
  }

  /**
   * C-4: Validate the CSRF nonce returned in the OAuth `state` parameter against
   * the value stored in sessionStorage by openGoogleOAuthPopup(). Returns true
   * if the nonce matches, false otherwise. Removes the stored entry on any
   * outcome (one-time use).
   */
  validateCsrfNonce(state: string, accountId: string): boolean {
    const storageKey = `email_oauth_csrf_nonce_${accountId}`;
    let storedNonce: string | null = null;
    try {
      storedNonce = sessionStorage.getItem(storageKey);
      sessionStorage.removeItem(storageKey);
    } catch {
      // sessionStorage unavailable
      return false;
    }

    if (!storedNonce || !state) return false;

    // State format from openGoogleOAuthPopup: `${originalState}:${csrfNonce}`
    // The nonce is always the LAST segment after splitting on `:`.
    const stateParts = state.split(':');
    const returnedNonce = stateParts[stateParts.length - 1];
    return returnedNonce === storedNonce;
  }

  /**
   * Handle OAuth callback after Google redirects to /oauth-callback route.
   * This is called by OAuthCallbackComponent after the redirect page processes the code/state.
   */
  handleOAuthCallback(code: string, state: string, accountId: string): Observable<void> {
    return from(this.handleOAuthCallbackImpl(code, state, accountId));
  }

  private async handleOAuthCallbackImpl(
    code: string,
    state: string,
    accountId: string
  ): Promise<void> {
    const { data: { session } } = await this.supabase.auth.getSession();
    const token = session?.access_token;
    const res = await fetch(
      `${this.edgeFunctionsBaseUrl}/company-email-accounts/google-callback`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code, state, account_id: accountId }),
      }
    );
    const json = await res.json();
    if (!json.success) {
      throw new Error(json.error || json.message || 'OAuth callback failed');
    }
  }

  /**
   * Send a test email from a specific account.
   */
  testAccountEmail(
    accountId: string,
    recipientEmail: string
  ): Observable<{ success: boolean; error?: string }> {
    return from(this.testAccountEmailImpl(accountId, recipientEmail));
  }

  private async testAccountEmailImpl(
    accountId: string,
    recipientEmail: string
  ): Promise<{ success: boolean; error?: string }> {
    const { data: { session } } = await this.supabase.auth.getSession();
    const token = session?.access_token;
    const res = await fetch(
      `${this.edgeFunctionsBaseUrl}/company-email-accounts/${accountId}/test`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ recipient_email: recipientEmail }),
      }
    );
    const json = await res.json();
    if (!json.success) {
      return {
        success: false,
        error: json.error?.message || json.error || 'Test email failed',
      };
    }
    return { success: true };
  }

  /**
   * Get all Google Workspace accounts for a company.
   */
  getGoogleWorkspaceAccounts(companyId: string): Observable<CompanyEmailAccount[]> {
    return from(
      this.supabase
        .from('company_email_accounts')
        .select('*')
        .eq('company_id', companyId)
        .eq('provider_type', 'google_workspace')
        .order('is_primary', { ascending: false })
    ).pipe(
      map((res) => {
        if (res.error) throw res.error;
        return res.data as CompanyEmailAccount[];
      }),
      catchError((err: unknown) => throwError(() => err instanceof Error ? err : new Error(String(err))))
    );
  }

  /**
   * Update OAuth credentials for an account (manual credential entry).
   */
  updateOAuthCredentials(
    accountId: string,
    creds: OAuthCredentials
  ): Observable<void> {
    return from(
      this.supabase
        .from('company_email_accounts')
        .update({
          oauth_client_id: creds.oauth_client_id,
          oauth_client_secret: creds.oauth_client_secret,
          oauth_refresh_token: creds.oauth_refresh_token,
          auth_method: 'oauth2',
          updated_at: new Date().toISOString(),
        })
        .eq('id', accountId)
    ).pipe(
      map((res) => {
        if (res.error) throw res.error;
      }),
      catchError((err: unknown) => throwError(() => err instanceof Error ? err : new Error(String(err))))
    );
  }
}