import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { inject } from '@angular/core';
import { RuntimeConfigService } from './runtime-config.service';

/**
 * Servicio singleton que centraliza una única instancia de SupabaseClient.
 * Evita múltiples GoTrueClient compitiendo por el mismo storage.
 */
@Injectable({ providedIn: 'root' })
export class SupabaseClientService {
  private client: SupabaseClient;
  private cfg = inject(RuntimeConfigService);

  constructor() {
    // Derive a unique storage key per Supabase project to avoid cross-app lock collisions
    const rc = this.cfg.get();
    try {
      const redactedKey = (rc.supabase.anonKey || '').toString();
      const preview = redactedKey
        ? `${redactedKey.slice(0, 6)}…${redactedKey.slice(-4)}`
        : '(empty)';
      console.info('[SupabaseClientService] Using Supabase URL:', rc.supabase.url);
      console.info('[SupabaseClientService] Using Supabase anon/publishable key (redacted):', preview);
      ; (globalThis as any).__SUPABASE_CFG__ = { url: rc.supabase.url, anonKeyPreview: preview };
    } catch { /* noop */ }
    const projectRef = (() => {
      try {
        const host = new URL(rc.supabase.url).host; // e.g., ufutyj...supabase.co
        return host.split('.')[0] || 'default';
      } catch {
        return 'default';
      }
    })();
    // Optional sanity check: ensure anon key belongs to the same project as URL
    try {
      const parts = (rc.supabase.anonKey || '').split('.');
      if (parts.length >= 2) {
        const payload = JSON.parse(atob(parts[1]));
        const keyRef = payload?.ref || payload?.project_id || payload?.iss?.split('/')?.pop();
        if (keyRef && typeof keyRef === 'string' && !projectRef.startsWith('default') && keyRef !== projectRef) {
          console.error('[SupabaseClientService] Mismatch between SUPABASE_URL project ref and anon key:', { urlRef: projectRef, keyRef });
          console.error('This will cause 401 Invalid API key. Ensure the runtime config uses matching URL and publishable (anon) key from the same Supabase project.');
        }
      }
    } catch { /* ignore decode errors */ }
    const storageKey = `sb-${projectRef}-auth-token`;

    // Migrate any previous hostname-suffixed session to the canonical key if needed
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        // Migrate from legacy keys if present
        const hasCanonical = window.localStorage.getItem(storageKey);
        if (!hasCanonical) {
          const legacyKeys = [
            'sb-main-auth-token',
            `${storageKey}-legacy`,
          ];
          for (const lk of legacyKeys) {
            const val = window.localStorage.getItem(lk);
            if (val) {
              window.localStorage.setItem(storageKey, val);
              break;
            }
          }
        }
      } catch { /* ignore storage errors */ }
    }

    // Create a lightweight storage adapter that uses localStorage directly and
    // intentionally avoids the LockManager-based coordination that can trigger
    // NavigatorLockAcquireTimeoutError in some browsers or race conditions across tabs.
    // This preserves session persistence while avoiding navigator.locks usage.
    const noLockStorage = ((): Storage => {
      const safe = {
        getItem(key: string) {
          try { return window.localStorage.getItem(key); } catch (e) { return null; }
        },
        setItem(key: string, value: string) {
          try { window.localStorage.setItem(key, value); } catch (e) { /* ignore */ }
        },
        removeItem(key: string) {
          try { window.localStorage.removeItem(key); } catch (e) { /* ignore */ }
        }
      } as unknown as Storage;
      return safe;
    })();

    this.client = createClient(
      rc.supabase.url,
      rc.supabase.anonKey,
      {
        auth: {
          storageKey,
          // Provide custom storage to avoid navigator.lock coordination
          storage: noLockStorage,
          // Persist sessions in localStorage and auto-refresh so reloads don't sign out immediately
          // Persist sessions in localStorage and auto-refresh so reloads don't sign out immediately
          persistSession: true,
          autoRefreshToken: true,
          // CRITICAL FIX: Bypass navigator.locks entirely to prevent NavigatorLockAcquireTimeoutError
          // This forces the client to run without exclusive locks, which is safe for this app's architecture
          lock: async (name: string, acquireTimeout: number, acquireFn: (lock: any) => Promise<any>) => {
            // Immediately execute the callback without real locking
            return await acquireFn({ name });
          }
        },
        realtime: {
          params: {
            eventsPerSecond: 10
          }
        },
        // Lightweight fetch wrapper to verify auth headers are attached (no secrets logged)
        global: {
          fetch: (input: RequestInfo | URL, init?: RequestInit) => {
            try {
              const url = typeof input === 'string' ? input : (input as any)?.url;
              if (url && (url.includes('/auth/v1') || url.includes('/rest/v1'))) {
                const h = (init?.headers instanceof Headers)
                  ? init.headers
                  : new Headers(init?.headers as any);
                const hasAuth = h.has('Authorization');
                const hasApikey = h.has('apikey');
                // eslint-disable-next-line no-console
                console.info('[SupabaseClientService] fetch', new URL(url).pathname, { hasAuthorization: hasAuth, hasApikey });
              }
            } catch { /* ignore */ }
            return fetch(input as any, init as any);
          }
        }
      }
    );
  }

  get instance(): SupabaseClient {
    return this.client;
  }
}
