import { Injectable, signal, computed, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { SupabaseClientService } from './supabase-client.service';
import { DashboardMetric } from '../models/analytics.interface';
import { SupabaseSettingsService } from './supabase-settings.service';

@Injectable({
  providedIn: 'root'
})
export class AnalyticsService {
  private supabase = inject(SupabaseClientService);
  private settings = inject(SupabaseSettingsService);

  // Server-driven analytics signals
  private kpisMonthly = signal<{
    period_month: string; // YYYY-MM-DD
    quotes_count: number;
    subtotal_sum: number;
    tax_sum: number;
    total_sum: number;
    avg_days_to_accept: number | null;
    conversion_rate: number | null;
  } | null>(null);

  private projectedDraftMonthly = signal<{ total: number; draftCount: number } | null>(null);

  // Historical trend: last 6 months of quotes data (server-computed)
  private historicalTrend = signal<Array<{ month: string; total: number; count: number }>>([]);
  
  // Loading state
  private loading = signal<boolean>(true);
  private error = signal<string | null>(null);

  // Pricing preference: whether prices are set with VAT included at company/app level
  private pricesIncludeTax = signal<boolean>(false);

  // Computed metrics for dashboard cards (all from backend)
  // Public accessors
  getMetrics = computed((): DashboardMetric[] => {
    const kpis = this.kpisMonthly();
    const proj = this.projectedDraftMonthly();
    const includeTax = this.pricesIncludeTax();
    return [
      {
        id: 'quotes-month',
        title: 'Presupuestos Mes',
        value: kpis ? String(kpis.quotes_count) : '—',
        change: 0,
        changeType: 'neutral',
        icon: '📄',
        color: '#3b82f6',
        description: 'Nº de presupuestos (mes actual)'
      },
      {
        id: 'total-quoted-month',
        title: 'Total Presupuestado',
        // Si la empresa trabaja con "precios con IVA incluido", mostramos subtotal (base imponible)
        // En caso contrario, mostramos el total con impuestos.
        value: kpis ? this.formatCurrency(includeTax ? kpis.subtotal_sum : kpis.total_sum) : '—',
        change: 0,
        changeType: 'neutral',
        icon: '💰',
        color: '#10b981',
        description: includeTax
          ? 'Base imponible presupuestada (mes actual)'
          : 'Importe total presupuestado (mes actual)'
      },
      {
        id: 'tax-quoted-month',
        title: 'IVA Presupuestado',
        value: kpis ? this.formatCurrency(kpis.tax_sum) : '—',
        change: 0,
        changeType: 'neutral',
        icon: '🧾',
        color: '#f59e0b',
        description: 'IVA total presupuestado (mes actual)'
      },
      {
        id: 'conversion-rate-month',
        title: 'Tasa de Conversión',
        value: kpis && kpis.conversion_rate != null ? this.formatPercent(kpis.conversion_rate) : '—',
        change: 0,
        changeType: 'neutral',
        icon: '✅',
        color: '#84cc16',
        description: 'Aceptados / Total (mes actual)'
      },
      {
        id: 'projected-draft',
        title: 'Previsto (borradores)',
        value: proj ? this.formatCurrency(proj.total) : '—',
        change: 0,
        changeType: 'neutral',
        icon: '🧮',
        color: '#0ea5e9',
        description: proj ? `Borradores: ${proj.draftCount}` : 'Suma de presupuestos en borrador (mes actual)'
      }
    ];
  });

  getHistoricalTrend = computed(() => this.historicalTrend());
  isLoading = computed(() => this.loading());
  getError = computed(() => this.error());

  constructor() {
    // Load server-side analytics on init
    // Load pricing preference in parallel
    this.loadPricingPreference();
    this.refreshAnalytics();
  }

  // Refresh analytics data (can be called manually or on interval)
  async refreshAnalytics(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      await Promise.all([
        this.loadMonthlyAnalytics(),
        this.loadHistoricalTrend()
      ]);
    } catch (err: any) {
      console.error('[AnalyticsService] Failed to load analytics', err);
      this.error.set(err?.message || 'Error al cargar analíticas');
    } finally {
      this.loading.set(false);
    }
  }

  // --- Server-side analytics over MVs (RPC) ---
  private async loadMonthlyAnalytics(): Promise<void> {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
    const p_start = start.toISOString().slice(0, 10); // YYYY-MM-DD
    const p_end = end.toISOString().slice(0, 10);

    // In parallel: KPIs and Projected Draft
    const [kpisRes, projRes] = await Promise.all([
      this.supabase.instance.rpc('f_quote_kpis_monthly', { p_start, p_end }),
      this.supabase.instance.rpc('f_quote_projected_revenue', { p_start, p_end })
    ]);

    if (kpisRes.error) {
      console.error('[AnalyticsService] f_quote_kpis_monthly RPC error:', kpisRes.error);
    } else {
      // Expect one row for current month
      const monthStr = p_start.slice(0, 7);
      const row = (kpisRes.data as any[] | null)?.find(r => String(r.period_month || '').startsWith(monthStr)) || null;
      if (row) {
        this.kpisMonthly.set({
          period_month: row.period_month,
          quotes_count: Number(row.quotes_count || 0),
          subtotal_sum: Number(row.subtotal_sum || 0),
          tax_sum: Number(row.tax_sum || 0),
          total_sum: Number(row.total_sum || 0),
          avg_days_to_accept: row.avg_days_to_accept == null ? null : Number(row.avg_days_to_accept),
          conversion_rate: row.conversion_rate == null ? null : Number(row.conversion_rate)
        });
      } else {
        this.kpisMonthly.set(null);
      }
    }

    if (projRes.error) {
      console.error('[AnalyticsService] f_quote_projected_revenue RPC error:', projRes.error);
      this.projectedDraftMonthly.set(null);
    } else {
      // Sum grand_total if present, otherwise sum amount (should be one month)
      const monthStr = p_start.slice(0, 7);
      const rows = (projRes.data as any[] | null) || [];
      const monthRows = rows.filter(r => String(r.period_month || '').startsWith(monthStr));
      const total = monthRows.reduce((acc, r) => acc + Number(r.grand_total ?? r.amount ?? 0), 0);
      const draftCount = monthRows.reduce((acc, r) => acc + Number(r.draft_count ?? 0), 0);
      this.projectedDraftMonthly.set({ total, draftCount });
    }
  }

  private async loadHistoricalTrend(): Promise<void> {
    const now = new Date();
    // Last 6 months
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
    const p_start = start.toISOString().slice(0, 10);
    const p_end = end.toISOString().slice(0, 10);

    const { data, error } = await this.supabase.instance.rpc('f_quote_kpis_monthly', { p_start, p_end });
    if (error) {
      console.error('[AnalyticsService] f_quote_kpis_monthly (trend) RPC error:', error);
      this.historicalTrend.set([]);
      return;
    }

    const rows = (data as any[] | null) || [];
    const includeTax = this.pricesIncludeTax();
    // Map and sort by period_month
    const trend = rows
      .map(r => ({
        month: String(r.period_month || '').slice(0, 7), // YYYY-MM
        total: Number((includeTax ? r.subtotal_sum : r.total_sum) || 0),
        count: Number(r.quotes_count || 0)
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
    
    this.historicalTrend.set(trend);
  }

  private formatCompact(value: number): string {
    try {
      // Intl compact notation (supported in modern browsers)
      return new Intl.NumberFormat('es-ES', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
    } catch {
      if (value >= 1_000_000) return (value / 1_000_000).toFixed(1) + 'M';
      if (value >= 1_000) return (value / 1_000).toFixed(1) + 'K';
      return String(Math.round(value));
    }
  }

  private formatCurrency(value: number): string {
    try {
      return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value);
    } catch {
      return `€${Math.round(value).toLocaleString('es-ES')}`;
    }
  }

  private formatPercent(value: number): string {
    try {
      return new Intl.NumberFormat('es-ES', { style: 'percent', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
    } catch {
      return `${Math.round(value * 100)}%`;
    }
  }

  // Load company/app preference for prices including tax
  private async loadPricingPreference(): Promise<void> {
    try {
      // Intentar obtener ambos y aplicar la misma lógica que en Quotes
      const [company, app] = await Promise.all([
        firstValueFrom(this.settings.getCompanySettings()),
        firstValueFrom(this.settings.getAppSettings()),
      ]);
      const effective = (company?.prices_include_tax ?? null) ?? (app?.default_prices_include_tax ?? false);
      this.pricesIncludeTax.set(Boolean(effective));
    } catch (e) {
      // Si falla, mantener false por defecto
      console.warn('[AnalyticsService] No fue posible cargar la preferencia de IVA incluido. Usando total con impuestos.', e);
      this.pricesIncludeTax.set(false);
    }
  }
}
