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
    const defaultKey = 'sb-main-auth-token';
    // Use a hostname-scoped storage key in browser to avoid Navigator Lock name collisions
    const storageKey = (typeof window !== 'undefined' && window.location && window.location.hostname)
      ? `${defaultKey}-${window.location.hostname}`
      : defaultKey;

    this.client = createClient(
      environment.supabase.url,
      environment.supabase.anonKey,
      {
        auth: {
          storageKey
        }
      }
    );
  }

  get instance(): SupabaseClient {
    return this.client;
  }
}
