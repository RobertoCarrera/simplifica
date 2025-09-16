import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

/**
 * Servicio singleton que centraliza una única instancia de SupabaseClient.
 * Evita múltiples GoTrueClient compitiendo por el mismo storage.
 */
@Injectable({ providedIn: 'root' })
export class SupabaseClientService {
  private client: SupabaseClient;

  constructor() {
    // Use a stable storage key so sessions persist across reloads and match previous keys
    const storageKey = 'sb-main-auth-token';

    // Migrate any previous hostname-suffixed session to the canonical key if needed
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const hasCanonical = window.localStorage.getItem(storageKey);
        if (!hasCanonical) {
          // Find keys like sb-main-auth-token-<host>
          for (let i = 0; i < window.localStorage.length; i++) {
            const key = window.localStorage.key(i);
            if (key && key.startsWith(`${storageKey}-`)) {
              const val = window.localStorage.getItem(key);
              if (val) {
                window.localStorage.setItem(storageKey, val);
                break; // first match is enough
              }
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
      environment.supabase.url,
      environment.supabase.anonKey,
      {
        auth: {
          storageKey,
          // Provide custom storage to avoid navigator.lock coordination
          storage: noLockStorage,
          // Persist sessions in localStorage and auto-refresh so reloads don't sign out immediately
          persistSession: true,
          autoRefreshToken: true
        }
      }
    );
  }

  get instance(): SupabaseClient {
    return this.client;
  }
}
