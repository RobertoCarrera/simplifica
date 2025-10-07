import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { CsrfService } from '../services/csrf.service';

/**
 * CSRF Protection Interceptor
 * 
 * Automatically includes CSRF tokens in mutating HTTP requests (POST, PUT, DELETE, PATCH).
 * Handles token expiration and automatic refresh.
 * 
 * Security Features:
 * - Fetches CSRF token on first mutating request
 * - Includes token in X-CSRF-Token header
 * - Auto-refreshes expired tokens
 * - Retries failed requests with new token
 */
export const csrfInterceptor: HttpInterceptorFn = (req, next) => {
  const csrfService = inject(CsrfService);
  
  // Only apply CSRF to mutating methods
  const requiresCsrf = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method);
  
  if (!requiresCsrf) {
    return next(req);
  }
  
  // Skip CSRF for login/register/public endpoints and CSRF token endpoint itself
  const publicEndpoints = ['/auth/login', '/auth/register', '/auth/reset-password', '/get-csrf-token'];
  if (publicEndpoints.some(endpoint => req.url.includes(endpoint))) {
    return next(req);
  }
  
  // Get current token or fetch if not available
  return csrfService.getCsrfToken().pipe(
    switchMap((token: string) => {
      // Clone request and add CSRF header
      const clonedReq = req.clone({
        headers: req.headers.set('X-CSRF-Token', token)
      });
      
      return next(clonedReq).pipe(
        catchError((error: HttpErrorResponse) => {
          // If CSRF validation failed (403), refresh token and retry once
          if (error.status === 403 && error.error?.message?.includes('CSRF')) {
            return csrfService.refreshCsrfToken().pipe(
              switchMap((newToken: string) => {
                const retryReq = req.clone({
                  headers: req.headers.set('X-CSRF-Token', newToken)
                });
                return next(retryReq);
              })
            );
          }
          
          return throwError(() => error);
        })
      );
    })
  );
};
