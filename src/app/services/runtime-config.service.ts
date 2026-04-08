import { Injectable } from '@angular/core';

import { environment } from '../../environments/environment';

export interface RuntimeConfig {
  supabase: {
    url: string;
    anonKey: string;
  };
  edgeFunctionsBaseUrl: string;
  supportEmail?: string;
  // Optional feature flags toggled at runtime without rebuild
  features?: {
    anychatConversationsEnabled?: boolean;
  };
}

@Injectable({ providedIn: 'root' })
export class RuntimeConfigService {
  private config: RuntimeConfig | null = null;

  constructor() {}

  async load(): Promise<void> {
    try {
      // Add a cache-buster to avoid CDN caching old keys after rotations/deploys
      const cacheBuster = `ts=${Date.now()}`;
      const response = await fetch(`/assets/runtime-config.json?${cacheBuster}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const cfg = (await response.json()) as RuntimeConfig;

      // Defaults from compile-time environment for local/dev, or as fallback
      const defaults: RuntimeConfig = {
        supabase: {
          url: environment.supabase?.url ?? '',
          anonKey: environment.supabase?.anonKey ?? '',
        },
        edgeFunctionsBaseUrl: (environment as any)?.edgeFunctionsBaseUrl ?? '',
        supportEmail: (environment as any)?.supportEmail ?? '',
        features: {
          anychatConversationsEnabled: true,
        },
      };

      const merged: RuntimeConfig = {
        supabase: {
          url: cfg?.supabase?.url?.trim() ? cfg!.supabase.url : defaults.supabase.url,
          anonKey: cfg?.supabase?.anonKey?.trim()
            ? cfg!.supabase.anonKey
            : defaults.supabase.anonKey,
        },
        edgeFunctionsBaseUrl: cfg?.edgeFunctionsBaseUrl?.trim()
          ? cfg!.edgeFunctionsBaseUrl
          : defaults.edgeFunctionsBaseUrl,
        supportEmail: cfg?.supportEmail?.trim() ? cfg!.supportEmail : defaults.supportEmail,
        features: {
          anychatConversationsEnabled:
            cfg?.features?.anychatConversationsEnabled === false
              ? false
              : (defaults.features?.anychatConversationsEnabled ?? true),
        },
      };

      this.config = merged;
    } catch (e) {
      console.warn('⚠️ RuntimeConfigService: Config load failed, using defaults.', e);
      // Fallback entirely to environment if runtime config cannot be loaded
      this.config = {
        supabase: {
          url: environment.supabase?.url ?? '',
          anonKey: environment.supabase?.anonKey ?? '',
        },
        edgeFunctionsBaseUrl: (environment as any)?.edgeFunctionsBaseUrl ?? '',
        supportEmail: (environment as any)?.supportEmail ?? '',
        features: {
          anychatConversationsEnabled: true,
        },
      };
    }
  }

  get(): RuntimeConfig {
    if (!this.config) {
      // Should be initialized by APP_INITIALIZER — fall back to environment defaults
      return {
        supabase: {
          url: environment.supabase?.url ?? '',
          anonKey: environment.supabase?.anonKey ?? '',
        },
        edgeFunctionsBaseUrl: (environment as any)?.edgeFunctionsBaseUrl ?? '',
        supportEmail: (environment as any)?.supportEmail ?? '',
      } as RuntimeConfig;
    }
    return this.config;
  }
}
