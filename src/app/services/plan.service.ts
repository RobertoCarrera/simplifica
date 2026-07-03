import { Injectable, inject, signal } from '@angular/core';
import { from, Observable } from 'rxjs';
import { SupabaseClientService } from './supabase-client.service';

export interface Plan {
  id: string;
  name: string;
  tagline: string;
  description: string | null;
  base_price_eur_cents: number;
  currency: string;
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
  description: string;
  icon: string;
  price_eur_cents: number;
  currency: string;
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
/** Curated whitelist of modules assignable to plans (F-PCA-008). */
export interface PlanVisibleModule {
  module_key: string;
  display_label: string;
  icon: string;
  sort_order: number;
}

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
        const plans = (data || []) as Plan[];
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

  /** Fetch the curated list of modules that are plan-assignable. */
  getVisibleModules(): Observable<PlanVisibleModule[]> {
    return from((async () => {
      const { data, error } = await this.supabase.from('plan_visible_modules').select('module_key, display_label, icon, sort_order').order('sort_order', { ascending: true });
      if (error) throw error;
      return (data || []) as PlanVisibleModule[];
    })());
  }

  addVisibleModule(moduleKey: string, displayLabel: string, icon: string, sortOrder?: number): Observable<PlanVisibleModule> {
    return from((async () => {
      const { data, error } = await this.supabase.rpc('admin_manage_plan_visible_modules', {
        p_action: 'add', p_module_key: moduleKey, p_display_label: displayLabel, p_icon: icon, p_sort_order: sortOrder ?? null,
      });
      if (error && (error as any).code === '42501') throw new Error('No tienes permisos de super_admin');
      if (error) throw error;
      return data as PlanVisibleModule;
    })());
  }

  removeVisibleModule(moduleKey: string): Observable<void> {
    return from((async () => {
      const { error } = await this.supabase.rpc('admin_manage_plan_visible_modules', {
        p_action: 'remove', p_module_key: moduleKey,
      });
      if (error && (error as any).code === '42501') throw new Error('No tienes permisos de super_admin');
      if (error && (error as any).code === 'P0002') return;
      if (error) throw error;
    })());
  }

  deleteAddon(addonId: string): Observable<void> {
    return from((async () => {
      const { error } = await this.supabase.rpc('admin_delete_addon', { p_id: addonId });
      if (error && (error as any).code === '42501') throw new Error('No tienes permisos de super_admin');
      if (error) throw error;
      this._addons.set((this._addons() ?? []).filter((a) => a.id !== addonId));
    })());
  }

  updateAddon(addon: PlanAddon): Observable<PlanAddon> {
    return from((async () => {
      const { data, error } = await this.supabase.rpc('admin_upsert_addon', {
        p_id: addon.id,
        p_name: addon.name,
        p_description: addon.description,
        p_icon: addon.icon,
        p_price_eur_cents: addon.price_eur_cents,
        p_currency: addon.currency,
        p_applies_to_plans: addon.applies_to_plans ?? [],
        p_sort_order: addon.sort_order,
        p_is_active: addon.is_active,
        p_included_modules: addon.included_modules ?? [],
      });
      if (error && (error as any).code === '42501') throw new Error('No tienes permisos de super_admin');
      if (error && (error as any).code === '23505') throw new Error('Ya existe un add-on con ese identificador.');
      if (error && (error as any).code === '23514') throw new Error(error.message || 'Conflicto de módulos.');
      if (error) throw error;
      const fresh = data as PlanAddon;
      this._addons.set(
        (this._addons() ?? []).some((a) => a.id === fresh.id)
          ? (this._addons() ?? []).map((a) => (a.id === fresh.id ? fresh : a))
          : [...(this._addons() ?? []), fresh].sort((a, b) => a.sort_order - b.sort_order)
      );
      return fresh;
    })());
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
          p_base_price_eur_cents: plan.base_price_eur_cents,
          p_currency: plan.currency,
          
          p_included_users: plan.included_users,
          p_extra_user_cents: plan.extra_user_cents,
          p_included_modules: plan.included_modules,
          p_sort_order: plan.sort_order,
          p_is_active: plan.is_active,
          p_is_highlighted: plan.is_highlighted,
        });
        if (error) throw error;
        // Invalidate cache so the next getPlans() refetches.
        this._plans.set(null);
        return data as Plan;
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

  /** Format a price in cents as e.g. "39 €" or "39 €/mes". */
  static formatPrice(cents: number, currency = 'EUR'): string {
    const euros = (cents / 100).toLocaleString('es-ES', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
    const symbol = currency === 'EUR' ? '€' : currency;
    return `${euros} ${symbol}`;
  }

  static formatPriceFull(cents: number, currency = 'EUR'): string {
    const euros = (cents / 100).toLocaleString('es-ES', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
    const symbol = currency === 'EUR' ? '€' : currency;
    return `${euros} ${symbol}/mes`;
  }
}
