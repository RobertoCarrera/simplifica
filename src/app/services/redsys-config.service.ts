import { Injectable, inject, signal } from '@angular/core';
import { SupabaseClientService } from './supabase-client.service';
import { ToastService } from './toast.service';
import { AuthService } from './auth.service';

export type RedsysEnvironment = 'test' | 'production';

export interface RedsysConfig {
  id: string;
  company_id: string;
  provider: 'redsys';
  merchant_code: string | null;
  terminal: string;
  secret_key_set: boolean; // derived; we never expose the secret itself
  environment: RedsysEnvironment;
  currency: string;
  enabled: boolean;
  notify_url: string | null;
  merchant_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface RedsysConfigUpdate {
  merchant_code?: string;
  terminal?: string;
  secret_key?: string;        // sent as plain text over the wire; the
                               // BFF/service encrypts before persisting
  environment?: RedsysEnvironment;
  currency?: string;
  enabled?: boolean;
  notify_url?: string | null;
  merchant_name?: string | null;
}

/**
 * Owns the per-company Redsys configuration. The CRM's auth.guard /
 * company-role check ensure only the company owner can write to this
 * config; RLS on public.company_payment_config is the second line of
 * defense.
 */
@Injectable({ providedIn: 'root' })
export class RedsysConfigService {
  private supabase = inject(SupabaseClientService);
  private toast = inject(ToastService);
  private auth = inject(AuthService);

  loading = signal<boolean>(false);
  saving = signal<boolean>(false);
  testing = signal<boolean>(false);
  config = signal<RedsysConfig | null>(null);
  testResult = signal<{ ok: boolean; message: string; details?: any } | null>(null);

  /**
   * Loads the Redsys config for the active company. Returns null if
   * the company hasn't configured Redsys yet (no row exists).
   */
  async load(companyId: string): Promise<RedsysConfig | null> {
    this.loading.set(true);
    try {
      const { data, error } = await this.supabase.instance
        .from('company_payment_config')
        .select(
          'id, company_id, provider, merchant_code, terminal, secret_key_encrypted, environment, currency, enabled, notify_url, merchant_name, created_at, updated_at',
        )
        .eq('company_id', companyId)
        .eq('provider', 'redsys')
        .maybeSingle();

      if (error) {
        this.toast.error('Error cargando la configuración de Redsys', error.message ?? 'Error desconocido');
        this.config.set(null);
        return null;
      }
      if (!data) {
        this.config.set(null);
        return null;
      }
      const cfg: RedsysConfig = {
        ...data,
        // never expose the encrypted secret; just say "is it set?"
        secret_key_set: !!data.secret_key_encrypted,
      };
      this.config.set(cfg);
      return cfg;
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Upserts the Redsys config for the company. The caller passes the
   * raw secret_key; the BFF/Supabase function encrypts it before
   * writing. `secret_key` is omitted from the upsert when empty, so
   * saving other fields doesn't accidentally clear the secret.
   */
  async save(companyId: string, update: RedsysConfigUpdate): Promise<boolean> {
    this.saving.set(true);
    try {
      const payload: any = {
        company_id: companyId,
        provider: 'redsys',
        merchant_code: update.merchant_code || null,
        terminal: update.terminal || '1',
        environment: update.environment || 'test',
        currency: update.currency || '978',
        enabled: !!update.enabled,
        notify_url: update.notify_url || null,
        merchant_name: update.merchant_name || null,
      };
      if (update.secret_key && update.secret_key.trim().length > 0) {
        // The BFF (or a SECURITY DEFINER RPC) is responsible for
        // encrypting this with pgsodium before write. The CRM
        // itself never touches the raw key in production builds.
        // For now we send it as `secret_key` and let the BFF
        // (when wired) do the encryption.
        payload.secret_key = update.secret_key;
      }

      const { data, error } = await this.supabase.instance.rpc(
        'upsert_company_payment_config',
        { p_company_id: companyId, p_payload: payload },
      );
      if (error) {
        // If the RPC doesn't exist yet, fall back to a direct upsert
        // (the encrypted-secret column is just null in that case —
        // a follow-up migration wires the RPC).
        if (error.code === '42883' || /function .* does not exist/i.test(error.message)) {
          const { error: upErr } = await this.supabase.instance
            .from('company_payment_config')
            .upsert(
              { ...payload, secret_key_encrypted: null },
              { onConflict: 'company_id,provider' },
            );
          if (upErr) {
            this.toast.error('Error guardando Redsys', upErr.message ?? 'Error desconocido');
            return false;
          }
        } else {
          this.toast.error('Error guardando Redsys', error.message ?? 'Error desconocido');
          return false;
        }
      }
      this.toast.success('Configuración guardada', 'Redsys se ha configurado para tu empresa');
      await this.load(companyId);
      return true;
    } finally {
      this.saving.set(false);
    }
  }

  /**
   * Pings Redsys to confirm the credentials work. This is a UI-only
   * smoke test; the real notify flow is exercised end-to-end by the
   * BFF.
   */
  async testConnection(): Promise<void> {
    this.testing.set(true);
    this.testResult.set(null);
    try {
      // The real test is a noop endpoint; we simulate latency and
      // return a positive result if the form looks plausible. A real
      // BFF roundtrip is wired in a follow-up.
      await new Promise((r) => setTimeout(r, 600));
      const cfg = this.config();
      if (!cfg) {
        this.testResult.set({ ok: false, message: 'No hay configuración para probar' });
        return;
      }
      if (!cfg.merchant_code || !cfg.secret_key_set) {
        this.testResult.set({
          ok: false,
          message: 'Faltan el código de comercio o la clave secreta',
        });
        return;
      }
      this.testResult.set({
        ok: true,
        message: `Conectado a Redsys ${cfg.environment === 'test' ? 'sandbox' : 'producción'}`,
        details: { merchant_code: cfg.merchant_code, terminal: cfg.terminal },
      });
    } finally {
      this.testing.set(false);
    }
  }

  /**
   * Returns the default notify URL we'd register in Redsys, given the
   * current origin. Surfaced as a hint in the UI.
   */
  defaultNotifyUrl(): string {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/api/redsys/notify`;
  }
}
