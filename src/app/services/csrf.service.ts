import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, tap, shareReplay, of, switchMap } from 'rxjs';
import { RuntimeConfigService } from './runtime-config.service';

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
  private http = inject(HttpClient);
  private tokenSubject = new BehaviorSubject<string | null>(null);
  private tokenExpiry: number | null = null;
  private fetchingToken$: Observable<string> | null = null;
  
  // Supabase Edge Function endpoint
  private readonly csrfEndpoint = `${inject(RuntimeConfigService).get().supabase.url}/functions/v1/get-csrf-token`;
  
  /**
   * Get the current CSRF token or fetch a new one if needed
   */
  getCsrfToken(): Observable<string> {
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
    return this.fetchCsrfToken();
  }
  
  /**
   * Force refresh the CSRF token
   */
  refreshCsrfToken(): Observable<string> {
    this.fetchingToken$ = null;
    return this.fetchCsrfToken();
  }
  
  /**
   * Fetch a new CSRF token from the backend
   */
  private fetchCsrfToken(): Observable<string> {
    const anonKey = inject(RuntimeConfigService).get().supabase.anonKey;
    this.fetchingToken$ = this.http.get<CsrfTokenResponse>(this.csrfEndpoint, { headers: { apikey: anonKey } }).pipe(
      tap(response => {
        this.tokenSubject.next(response.csrfToken);
        this.tokenExpiry = Date.now() + response.expiresIn;
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
      // Extract just the token string
      switchMap((response: CsrfTokenResponse) => of(response.csrfToken))
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
