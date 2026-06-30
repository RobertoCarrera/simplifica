import { Injectable, inject, signal } from '@angular/core';
import { from, Observable } from 'rxjs';
import { SupabaseClientService } from './supabase-client.service';
import { canonicalizeModules } from '../shared/module-keys';

export interface Plan {
  id: string;
  name: string;
  tagline: string;
  description: string | null;
  base_price_cents: number;
  currency: string;
  billing_period: 'monthly' | 'yearly';
  included_users: number;
  extra_user_cents: number;
  included_modules: string[];
  sort_order: number;
  is_active: boolean;
  is_highlighted: boolean;
  created_at: string;
  updated_at: string;
}

export interface PlanAddon {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  price_cents: number;
  currency: string;
  billing_period: 'monthly' | 'yearly';
  applies_to_plans: string[];
  included_modules: string[];
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Read-only catalog of plans and add-ons.
 * Source of truth is the public.plans and public.plan_addons tables (RLS: SELECT public).
 * Writes (admin edits) must go through the admin_upsert_plan / admin_upsert_addon RPCs.
 */
@Injectable({ providedIn: 'root' })
export class PlanService {
  private supabase = inject(SupabaseClientService).instance;

  // In-memory cache for the session — plans rarely change, no need to refetch on every page.
  private _plans = signal<Plan[] | null>(null);
  private _addons = signal<PlanAddon[] | null>(null);

  readonly plansSignal = this._plans.asReadonly();
  readonly addonsSignal = this._addons.asReadonly();

  /** Fetch all active plans, ordered by sort_order. */
  getPlans(): Observable<Plan[]> {
    return from(
      (async () => {
        const { data, error } = await this.supabase
          .from('plans')
          .select('*')
          .eq('is_active', true)
          .order('sort_order', { ascending: true });
        if (error) throw error;
        // Defensive: even though migration 0001 rewrites every plan's
        // included_modules to canonical SIDEBAR_CATALOG keys, a DB row
        // that pre-dates 0001 (or was edited outside the RPC) can still
        // carry a legacy key. Canonicalize on read so the UI never
        // displays a raw legacy key (F-PB-004).
        const plans = ((data || []) as Plan[]).map((p) => ({
          ...p,
          included_modules: canonicalizeModules(p.included_modules ?? []),
        }));
        this._plans.set(plans);
        return plans;
      })()
    );
  }

  /** Fetch all active add-ons, ordered by sort_order. */
  getAddons(): Observable<PlanAddon[]> {
    return from(
      (async () => {
        const { data, error } = await this.supabase
          .from('plan_addons')
          .select('*')
          .eq('is_active', true)
          .order('sort_order', { ascending: true });
        if (error) throw error;
        const addons = (data || []) as PlanAddon[];
        this._addons.set(addons);
        return addons;
      })()
    );
  }

  /** Admin: upsert a plan (mutates included_modules + everything else). Requires super_admin. */
  updatePlan(plan: Plan): Observable<Plan> {
    return from(
      (async () => {
        const { data, error } = await this.supabase.rpc('admin_upsert_plan', {
          p_id: plan.id,
          p_name: plan.name,
          p_tagline: plan.tagline,
          p_description: plan.description,
          p_base_price_cents: plan.base_price_cents,
          p_currency: plan.currency,
          p_billing_period: plan.billing_period,
          p_included_users: plan.included_users,
          p_extra_user_cents: plan.extra_user_cents,
          p_included_modules: plan.included_modules,
          p_sort_order: plan.sort_order,
          p_is_active: plan.is_active,
          p_is_highlighted: plan.is_highlighted,
        });
        // Translate the typed 42501 from migration 0004 into a friendly
        // Spanish error so callers (ModulesAdminComponent) can show a
        // toast without parsing Postgres error messages (F-PB-003,
        // F-PCA-003).
        if (error && (error as any).code === '42501') {
          throw new Error('No tienes permisos de super_admin');
        }
        if (error) throw error;
        const fresh = data as Plan;
        // In-place merge so dependent signals (@for plans()) re-render
        // immediately, instead of waiting for the next getPlans() call
        // (F-PCA-002, F-PCA-003). Old behaviour was _plans.set(null)
        // which forced a refetch and showed stale data during a fast
        // toggle session.
        this._plans.set(
          (this._plans() ?? []).map((p) => (p.id === fresh.id ? fresh : p))
        );
        return fresh;
      })()
    );
  }

  /** Toggle a single module in a plan's included_modules. Optimistic local, then RPC. */
  togglePlanModule(plan: Plan, moduleKey: string, included: boolean): Observable<Plan> {
    const next: Plan = {
      ...plan,
      included_modules: included
        ? Array.from(new Set([...plan.included_modules, moduleKey]))
        : plan.included_modules.filter((k) => k !== moduleKey),
    };
    return this.updatePlan(next);
  }

  /**
   * Admin: upsert an add-on (create or update). Requires super_admin.
   *
   * Mirrors the F-ADDON-002 / F-ADDON-003 / F-ADDON-004 / F-ADDON-006
   * contract:
   *   - 42501 → "No tienes permisos de super_admin" (Spanish toast).
   *   - 23505 (unique_violation on p_id) → "Ya existe un add-on con ese
   *     identificador" so the create form can surface a clean message.
   *   - On success, in-place merge into the cached addons signal so the
   *     table re-renders without a refetch.
   *   - F-ADDON-006: included_modules is the list of module keys this
   *     add-on unlocks for the plans in applies_to_plans.
   */
  updateAddon(addon: PlanAddon): Observable<PlanAddon> {
    return from(
      (async () => {
        const { data, error } = await this.supabase.rpc('admin_upsert_addon', {
          p_id: addon.id,
          p_name: addon.name,
          p_description: addon.description,
          p_icon: addon.icon,
          p_price_cents: addon.price_cents,
          p_currency: addon.currency,
          p_billing_period: addon.billing_period,
          p_applies_to_plans: addon.applies_to_plans ?? [],
          p_sort_order: addon.sort_order,
          p_is_active: addon.is_active,
          p_included_modules: addon.included_modules ?? [],
        });
        if (error && (error as any).code === '42501') {
          throw new Error('No tienes permisos de super_admin');
        }
        if (error && (error as any).code === '23505') {
          throw new Error(`Ya existe un add-on con el identificador "${addon.id}".`);
        }
        if (error) throw error;
        const fresh = data as PlanAddon;
        this._addons.set(
          (this._addons() ?? []).some((a) => a.id === fresh.id)
            ? (this._addons() ?? []).map((a) => (a.id === fresh.id ? fresh : a))
            : [...(this._addons() ?? []), fresh].sort((a, b) => a.sort_order - b.sort_order),
        );
        return fresh;
      })()
    );
  }

  /** Format a price in cents as e.g. "39 €" or "39 €/mes". */
  static formatPrice(cents: number, currency = 'EUR', period: 'monthly' | 'yearly' = 'monthly'): string {
    const euros = (cents / 100).toLocaleString('es-ES', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
    const symbol = currency === 'EUR' ? '€' : currency;
    return `${euros} ${symbol}`;
  }

  static formatPriceFull(cents: number, currency = 'EUR', period: 'monthly' | 'yearly' = 'monthly'): string {
    const euros = (cents / 100).toLocaleString('es-ES', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
    const symbol = currency === 'EUR' ? '€' : currency;
    const suffix = period === 'monthly' ? '/mes' : '/año';
    return `${euros} ${symbol}${suffix}`;
  }
}
