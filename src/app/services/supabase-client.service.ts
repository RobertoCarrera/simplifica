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
    this.client = createClient(
      environment.supabase.url,
      environment.supabase.anonKey,
      {
        auth: {
          storageKey: 'sb-main-auth-token'
        }
      }
    );
  }

  get instance(): SupabaseClient {
    return this.client;
  }
}
