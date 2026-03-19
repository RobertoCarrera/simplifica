import { Injectable, isDevMode } from '@angular/core';

/**
 * Application-wide logging service.
 *
 * Rules:
 * - Output is ONLY produced in development mode (isDevMode() === true).
 * - In production builds Angular's build optimizer sets isDevMode() = false,
 *   so all calls become no-ops — no PII or architectural detail leaks to DevTools.
 * - Use this service instead of direct console.* calls in all new code.
 *
 * Usage:
 *   constructor(private logger: LoggerService) {}
 *   this.logger.log('User loaded', user.id);
 *   this.logger.error('Auth failed', err);
 */
@Injectable({ providedIn: 'root' })
export class LoggerService {
  private readonly enabled = isDevMode();

  log(...args: unknown[]): void {
    if (this.enabled) console.log(...args);
  }

  info(...args: unknown[]): void {
    if (this.enabled) console.info(...args);
  }

  warn(...args: unknown[]): void {
    if (this.enabled) console.warn(...args);
  }

  /** For genuine errors use a monitoring service (Sentry, etc.) in production. */
  error(...args: unknown[]): void {
    if (this.enabled) console.error(...args);
  }

  debug(...args: unknown[]): void {
    if (this.enabled) console.debug(...args);
  }
}
