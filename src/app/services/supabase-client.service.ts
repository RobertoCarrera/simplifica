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
    const projectRef = (() => {
      try {
        const host = new URL(rc.supabase.url).host; // e.g., ufutyj...supabase.co
        return host.split('.')[0] || 'default';
      } catch {
        return 'default';
      }
    })();
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
