import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

export interface RuntimeConfig {
  supabase: {
    url: string;
    anonKey: string;
  };
  edgeFunctionsBaseUrl: string;
  // Optional feature flags toggled at runtime without rebuild
  features?: {
    anychatConversationsEnabled?: boolean;
  };
}

@Injectable({ providedIn: 'root' })
export class RuntimeConfigService {
  private config: RuntimeConfig | null = null;

  constructor(private http: HttpClient) {}

  async load(): Promise<void> {
    try {
      // Add a cache-buster to avoid CDN caching old keys after rotations/deploys
      const cacheBuster = `ts=${Date.now()}`;
      const cfg = await this.http
        .get<RuntimeConfig>(`/assets/runtime-config.json?${cacheBuster}`, { withCredentials: false })
        .toPromise();
      // Defaults from compile-time environment for local/dev, or as fallback
      const defaults: RuntimeConfig = {
        supabase: {
          url: environment.supabase?.url ?? '',
          anonKey: environment.supabase?.anonKey ?? ''
        },
        edgeFunctionsBaseUrl: (environment as any)?.edgeFunctionsBaseUrl ?? '',
        features: {
          anychatConversationsEnabled: true,
        }
      };

      const merged: RuntimeConfig = {
        supabase: {
          url: cfg?.supabase?.url?.trim() ? cfg!.supabase.url : defaults.supabase.url,
          anonKey: cfg?.supabase?.anonKey?.trim() ? cfg!.supabase.anonKey : defaults.supabase.anonKey
        },
        edgeFunctionsBaseUrl: cfg?.edgeFunctionsBaseUrl?.trim()
          ? cfg!.edgeFunctionsBaseUrl
          : defaults.edgeFunctionsBaseUrl,
        features: {
          anychatConversationsEnabled:
            cfg?.features?.anychatConversationsEnabled === false
              ? false
              : (defaults.features?.anychatConversationsEnabled ?? true),
        }
      };

      this.config = merged;
    } catch (e) {
      console.warn('Runtime config not found, using empty defaults. Create /assets/runtime-config.json at build time.');
      // Fallback entirely to environment if runtime config cannot be loaded
      this.config = {
        supabase: {
          url: environment.supabase?.url ?? '',
          anonKey: environment.supabase?.anonKey ?? ''
        },
        edgeFunctionsBaseUrl: (environment as any)?.edgeFunctionsBaseUrl ?? '',
        features: {
          anychatConversationsEnabled: true,
        }
      };
    }
  }

  get(): RuntimeConfig {
    if (!this.config) {
      // Should be initialized by APP_INITIALIZER
      return { supabase: { url: '', anonKey: '' }, edgeFunctionsBaseUrl: '' } as RuntimeConfig;
    }
    return this.config;
  }
}
