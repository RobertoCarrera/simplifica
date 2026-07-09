import { Injectable } from '@angular/core';

import { environment } from '../../environments/environment';

export interface RuntimeConfig {
  supabase: {
    url: string;
    anonKey: string;
  };
  edgeFunctionsBaseUrl: string;
  supportEmail?: string;
  vapidPublicKey?: string;
  // Optional feature flags toggled at runtime without rebuild
  features?: {
    anychatConversationsEnabled?: boolean;
    // PR2a (email-block-editor): when true, TemplateEditorDialogComponent
    // swaps the legacy TipTap + 4-field UI for the Divi-style block editor.
    // Default OFF in production; ON in dev/staging until PR2b ships.
    emailBlockEditorEnabled?: boolean;
    // PR3 (email-block-editor): when true, the dialog shows a yellow
    // deprecation banner above the block editor warning users that the
    // legacy "Cabecera" + "Texto del botón" fields are deprecated in
    // favor of blocks. Independent of emailBlockEditorEnabled so the
    // banner can be enabled in production even before the block editor
    // itself is the default. Default OFF (will be flipped after users
    // have had time to migrate).
    emailBlockEditorDeprecationBanner?: boolean;
  };
}

@Injectable({ providedIn: 'root' })
export class RuntimeConfigService {
  private config: RuntimeConfig | null = null;

  constructor() {}

  async load(): Promise<void> {
    try {
      // Add a cache-buster AND bypass HTTP cache + Service Worker cache.
      // The Angular Service Worker (ngsw) caches all /assets/* paths under
      // the "api-freshness" data group for up to 1 hour, which means a stale
      // or empty runtime-config.json can be served indefinitely. We force a
      // fresh fetch from the network by using cache: 'no-store' on the
      // request. This is critical for the runtime config because rotating
      // keys requires the new value to be picked up immediately.
      const cacheBuster = `ts=${Date.now()}`;
      const url = `/assets/runtime-config.json?${cacheBuster}`;
      console.log('[RuntimeConfigService] Fetching:', url);
      const response = await fetch(url, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
      });
      console.log('[RuntimeConfigService] Response status:', response.status, 'ok:', response.ok);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const cfg = (await response.json()) as RuntimeConfig;
      console.log('[RuntimeConfigService] Parsed cfg:', JSON.stringify(cfg).slice(0, 200));

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
          // emailBlockEditorEnabled: default OFF — flag-flip PR after PR2b merges.
          emailBlockEditorEnabled: false,
          // PR3: deprecation banner default OFF. Independent of block editor flag.
          emailBlockEditorDeprecationBanner: false,
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
        vapidPublicKey: cfg?.vapidPublicKey?.trim() ? cfg!.vapidPublicKey : '',
        features: {
          anychatConversationsEnabled:
            cfg?.features?.anychatConversationsEnabled === false
              ? false
              : (defaults.features?.anychatConversationsEnabled ?? true),
          // PR2a: emailBlockEditorEnabled — strict OFF unless explicitly true
          // in runtime-config.json. Production keeps the legacy TipTap UI
          // until PR2b (Logo/Paragraph/Button editors) ships.
          emailBlockEditorEnabled:
            cfg?.features?.emailBlockEditorEnabled === true
              ? true
              : (defaults.features?.emailBlockEditorEnabled ?? false),
          // PR3: emailBlockEditorDeprecationBanner — strict OFF unless
          // explicitly true. Independent of the block editor flag so it
          // can be flipped on a different cadence.
          emailBlockEditorDeprecationBanner:
            cfg?.features?.emailBlockEditorDeprecationBanner === true
              ? true
              : (defaults.features?.emailBlockEditorDeprecationBanner ?? false),
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
          emailBlockEditorEnabled: false,
          emailBlockEditorDeprecationBanner: false,
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
        features: {
          anychatConversationsEnabled: true,
          emailBlockEditorEnabled: false,
          emailBlockEditorDeprecationBanner: false,
        },
      } as RuntimeConfig;
    }
    return this.config;
  }
}
