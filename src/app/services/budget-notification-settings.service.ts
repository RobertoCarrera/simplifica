/**
 * Budget notification settings service
 * -----------------------------------
 * Wraps the budget_notification_settings table + the supporting
 * RPCs introduced in 20260610000000/0001_budget_notifications_*.sql.
 *
 * Provides:
 *   - getSettings()               — current company settings (or defaults)
 *   - updateSettings(payload)     — partial update via PATCH semantics
 *   - listDueSummary()            — per-budget reminder/overdue badge data
 *   - listNotificationLog(budget) — audit trail of notifications sent
 *
 * Cadence arrays are exposed as number[] and persisted as Postgres
 * int[] — the service round-trips them through JSON and lets the
 * server validate the CHECK constraints (cardinality ≤ 6, 0..30).
 */

import { Injectable, inject } from '@angular/core';
import type { SupabaseClient } from '@supabase/supabase-js';

import { SupabaseClientService } from './supabase-client.service';
import { RuntimeConfigService } from './runtime-config.service';
import { AuthService } from './auth.service';
import { ToastService } from './toast.service';
import {
  BudgetNotificationSettings,
  CompanyBudgetDueSummaryRow,
  BudgetNotificationLogEntry,
  UpdateBudgetNotificationSettingsPayload,
} from '../models/recurring-budget.model';

/** Defaults — must match the column defaults in the SQL migration. */
export const DEFAULT_BUDGET_NOTIFICATION_SETTINGS: Omit<
  BudgetNotificationSettings,
  'company_id' | 'created_at' | 'updated_at'
> = {
  email_enabled: true,
  inapp_on_create: true,
  inapp_on_reminder: true,
  inapp_on_overdue: true,
  email_on_create: true,
  email_on_reminder: true,
  email_on_overdue: true,
  reminder_days_before: [3],
  overdue_days_after: [0, 3],
  locale: 'es',
  // Booking change notifications (migration 20260610000002).
  // Email: opt-in (off by default). In-app: opt-out (on by default).
  booking_email_enabled:        false,
  booking_inapp_enabled:        true,
  booking_notify_client:        true,
  booking_notify_professional:  true,
  booking_notify_admin:         true,
  booking_email_cc_admin:       false,
};

@Injectable({ providedIn: 'root' })
export class BudgetNotificationSettingsService {
  private supabase: SupabaseClient = inject(SupabaseClientService).instance;
  private runtimeConfig = inject(RuntimeConfigService);
  private authService = inject(AuthService);
  private toast = inject(ToastService);

  /**
   * Fetch the current company settings. Returns the defaults merged
   * with whatever is stored so callers always get a complete object.
   */
  async getSettings(): Promise<BudgetNotificationSettings> {
    const companyId = this.authService.companyId();
    if (!companyId) {
      throw new Error('No hay empresa activa en la sesión');
    }

    const { data, error } = await this.supabase
      .from('budget_notification_settings')
      .select('*')
      .eq('company_id', companyId)
      .maybeSingle();

    if (error) {
      console.error('[BudgetNotificationSettings] get error:', error);
      throw error;
    }

    if (data) return data as BudgetNotificationSettings;

    // No row yet — return defaults. The seed migration inserts one per
    // company, so this branch is rarely hit in production.
    return {
      company_id: companyId,
      ...DEFAULT_BUDGET_NOTIFICATION_SETTINGS,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  /**
   * Update one or more settings fields. Performs the same validation
   * the DB CHECK constraints do (cardinality ≤ 6, each value in 0..30)
   * so the user gets immediate feedback in the UI.
   */
  async updateSettings(
    payload: UpdateBudgetNotificationSettingsPayload,
  ): Promise<BudgetNotificationSettings> {
    const companyId = this.authService.companyId();
    if (!companyId) {
      throw new Error('No hay empresa activa en la sesión');
    }

    // Client-side validation — mirrors the SQL CHECK constraints
    if (payload.reminder_days_before !== undefined) {
      this.validateCadence(payload.reminder_days_before, 'reminder_days_before');
    }
    if (payload.overdue_days_after !== undefined) {
      this.validateCadence(payload.overdue_days_after, 'overdue_days_after');
    }
    if (payload.locale !== undefined && !['es', 'ca', 'en'].includes(payload.locale)) {
      throw new Error(`Locale no soportado: ${payload.locale}`);
    }

    const { data, error } = await this.supabase
      .from('budget_notification_settings')
      .update({
        ...payload,
        updated_at: new Date().toISOString(),
      })
      .eq('company_id', companyId)
      .select('*')
      .single();

    if (error) {
      console.error('[BudgetNotificationSettings] update error:', error);
      this.toast.error('Error', 'No se pudo guardar la configuración de notificaciones de presupuestos');
      throw error;
    }

    this.toast.success('Configuración guardada', 'Los cambios se aplicarán a partir del próximo escaneo');
    return data as BudgetNotificationSettings;
  }

  /**
   * RPC: list_company_budget_due_summary(company_id)
   * Returns every recurring_budget in the company with computed
   * days_to_due, is_overdue, and the timestamp of the last
   * reminder/overdue/created notification. Used by the dashboard
   * to render a per-budget notification badge.
   */
  async listDueSummary(): Promise<CompanyBudgetDueSummaryRow[]> {
    const companyId = this.authService.companyId();
    if (!companyId) return [];

    const { data, error } = await this.supabase
      .rpc('list_company_budget_due_summary', { p_company_id: companyId });

    if (error) {
      console.error('[BudgetNotificationSettings] listDueSummary error:', error);
      throw error;
    }

    return (data || []) as CompanyBudgetDueSummaryRow[];
  }

  /**
   * Audit log entries for a single budget. Used by the detail view
   * to show "Sent on …" badges.
   */
  async listNotificationLog(budgetId: string): Promise<BudgetNotificationLogEntry[]> {
    const { data, error } = await this.supabase
      .from('budget_notification_log')
      .select('*')
      .eq('budget_id', budgetId)
      .order('sent_at', { ascending: false });

    if (error) {
      console.error('[BudgetNotificationSettings] listLog error:', error);
      throw error;
    }

    return (data || []) as BudgetNotificationLogEntry[];
  }

  /**
   * Trigger the daily scan manually — useful for "Send test" buttons
   * in the settings page so admins can verify their cadence produces
   * the right emails without waiting for the cron to run.
   *
   * Calls the send-budget-reminders Edge Function (which wraps
   * scan_due_budget_notifications + dispatches one
   * send-budget-notification per row).
   */
  async triggerReminderScan(date?: string): Promise<{
    scanned: number;
    succeeded: number;
    failed: number;
    results: Array<{ budget_id: string; kind: string; day_offset: number; success: boolean; error?: string }>;
  }> {
    const cfg = this.runtimeConfig.get();
    const supabaseUrl = cfg.supabase.url.replace(/\/$/, '');
    if (!supabaseUrl) throw new Error('Supabase URL not available');

    // Use the anon key + apikey header (the function is service-role only
    // and rejects non-service-role callers, but admins with valid JWT
    // can still hit it if verify_jwt is off; config.toml has it off).
    const { data: { session } } = await this.supabase.auth.getSession();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'apikey': cfg.supabase.anonKey,
    };
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }

    const params = new URLSearchParams();
    if (date) params.set('date', date);

    const resp = await fetch(
      `${supabaseUrl}/functions/v1/send-budget-reminders?${params.toString()}`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ source: 'manual-trigger' }),
      },
    );
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`send-budget-reminders HTTP ${resp.status}: ${text}`);
    }
    return resp.json();
  }

  // ── Helpers ───────────────────────────────────────────────────

  private validateCadence(values: number[], field: string): void {
    if (values.length > 6) {
      throw new Error(`${field}: máximo 6 entradas (recibido ${values.length})`);
    }
    for (const v of values) {
      if (!Number.isInteger(v) || v < 0 || v > 30) {
        throw new Error(`${field}: cada valor debe ser un entero entre 0 y 30 (recibido ${v})`);
      }
    }
  }
}
