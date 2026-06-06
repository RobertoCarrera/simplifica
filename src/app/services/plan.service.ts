import { Injectable, inject, signal } from '@angular/core';
import { from, Observable } from 'rxjs';
import { SupabaseClientService } from './supabase-client.service';

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
  description: string;
  icon: string;
  price_cents: number;
  currency: string;
  billing_period: 'monthly' | 'yearly';
  applies_to_plans: string[];
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
