import { Injectable, Injector, inject } from '@angular/core';
import { Observable, BehaviorSubject, tap, shareReplay, of, switchMap, from, map } from 'rxjs';
import { RuntimeConfigService } from './runtime-config.service';
import { SupabaseClientService } from './supabase-client.service';
import { environment } from '../../environments/environment';

interface CsrfTokenResponse {
  csrfToken: string;
  expiresIn: number;
}

/**
 * CSRF Token Management Service
 * 
 * Handles fetching, caching, and refreshing CSRF tokens from the backend.
 * Tokens are stored in memory and automatically refreshed before expiration.
 * 
 * Security Features:
 * - In-memory token storage (not localStorage to prevent XSS)
 * - Automatic token refresh before expiration
 * - Shared token fetching to prevent multiple simultaneous requests
 * - Token validation before use
 */
@Injectable({
  providedIn: 'root'
})
export class CsrfService {
  private runtimeConfig = inject(RuntimeConfigService);
  private injector = inject(Injector);
  private tokenSubject = new BehaviorSubject<string | null>(null);
  private tokenExpiry: number | null = null;
  private fetchingToken$: Observable<string> | null = null;
  
  private getCsrfEndpoint(): string {
    const cfg = this.runtimeConfig.get();
    const base = cfg.edgeFunctionsBaseUrl
      || (cfg.supabase.url ? `${cfg.supabase.url}/functions/v1` : '')
      || (environment as any).edgeFunctionsBaseUrl
      || '';
    return `${base.replace(/\/$/, '')}/get-csrf-token`;
  }
  
  /**
   * Get the current CSRF token or fetch a new one if needed.
   * @param accessToken Optional Bearer token to avoid a redundant getSession() call
   */
  getCsrfToken(accessToken?: string): Observable<string> {
    const currentToken = this.tokenSubject.value;
    
    // Return cached token if still valid (with 5 min buffer)
    if (currentToken && this.tokenExpiry && this.tokenExpiry > Date.now() + 5 * 60 * 1000) {
      return of(currentToken);
    }
    
    // If already fetching, return the existing request
    if (this.fetchingToken$) {
      return this.fetchingToken$;
    }
    
    // Fetch new token
    return this.fetchCsrfToken(accessToken);
  }
  
  /**
   * Force refresh the CSRF token
   */
  refreshCsrfToken(): Observable<string> {
    this.fetchingToken$ = null;
    return this.fetchCsrfToken();
  }
  
  /**
   * Fetch a new CSRF token from the backend using native fetch (bypasses Angular HttpClient
   * interceptor chain to guarantee custom headers like Authorization are sent as-is).
   * @param accessToken Optional Bearer token — avoids a redundant getSession() call
   */
  private fetchCsrfToken(accessToken?: string): Observable<string> {
    const cfg = this.runtimeConfig.get();
    const anonKey = cfg.supabase.anonKey;
    const endpoint = this.getCsrfEndpoint();

    const token$ = accessToken
      ? of(accessToken)
      : from(
          this.injector.get(SupabaseClientService).instance.auth.getSession()
        ).pipe(map(({ data: { session } }) => session?.access_token ?? null));

    this.fetchingToken$ = token$.pipe(
      switchMap(token => {
        const headers: Record<string, string> = {
          'Accept': 'application/json',
          'apikey': anonKey,
        };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }
        // Use native fetch — Angular HttpClient does not affect these headers
        return from(
          fetch(endpoint, { method: 'GET', headers }).then(res => {
            if (!res.ok) {
              return res.text().then(body => {
                throw new Error(`CSRF fetch failed (${res.status}): ${body}`);
              });
            }
            return res.json() as Promise<CsrfTokenResponse>;
          })
        );
      }),
      tap(response => {
        this.tokenSubject.next(response.csrfToken);
        this.tokenExpiry = Date.now() + response.expiresIn * 1000;
      }),
      shareReplay(1),
      tap({
        next: () => {
          this.fetchingToken$ = null;
        },
        error: (error) => {
          console.error('Error fetching CSRF token:', error);
          this.fetchingToken$ = null;
          this.tokenSubject.next(null);
          this.tokenExpiry = null;
        }
      }),
      map((response: CsrfTokenResponse) => response.csrfToken)
    );
    
    return this.fetchingToken$;
  }
  
  /**
   * Clear the current token (useful for logout)
   */
  clearToken(): void {
    this.tokenSubject.next(null);
    this.tokenExpiry = null;
    this.fetchingToken$ = null;
  }
}
