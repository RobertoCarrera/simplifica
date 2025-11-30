import { Injectable, signal, computed, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { SupabaseClientService } from './supabase-client.service';
import { DashboardMetric } from '../models/analytics.interface';
import { SupabaseSettingsService } from './supabase-settings.service';

// Interfaces para KPIs de facturas
export interface InvoiceKpis {
  period_month: string;
  invoices_count: number;
  paid_count: number;
  pending_count: number;
  overdue_count: number;
  cancelled_count: number;
  draft_count: number;
  subtotal_sum: number;
  tax_sum: number;
  total_sum: number;
  collected_sum: number;
  pending_sum: number;
  paid_total_sum: number;
  receivable_sum: number;
  avg_invoice_value: number;
  collection_rate: number;
}

export interface QuoteKpis {
  period_month: string;
  quotes_count: number;
  subtotal_sum: number;
  tax_sum: number;
  total_sum: number;
  avg_days_to_accept: number | null;
  conversion_rate: number | null;
}

@Injectable({
  providedIn: 'root'
})
export class AnalyticsService {
  private supabase = inject(SupabaseClientService);
  private settings = inject(SupabaseSettingsService);

  // ========== PRESUPUESTOS ==========
  private quoteKpisMonthly = signal<QuoteKpis | null>(null);
  private projectedDraftMonthly = signal<{ total: number; draftCount: number } | null>(null);
  
  // Historical trend: last 6 months of quotes data (server-computed)
  private quoteHistoricalTrend = signal<Array<{ 
    month: string; 
    total: number; 
    subtotal: number;
    tax: number;
    count: number;
  }>>([]);

  // ========== FACTURAS ==========
  private invoiceKpisMonthly = signal<InvoiceKpis | null>(null);
  
  // Historical trend: last 6 months of invoices data
  private invoiceHistoricalTrend = signal<Array<{ 
    month: string; 
    total: number; 
    subtotal: number;
    tax: number;
    count: number;
    collected: number;
  }>>([]);
  
  // Loading state
  private loading = signal<boolean>(true);
  private error = signal<string | null>(null);

  // Pricing preference: whether prices are set with VAT included at company/app level
  private pricesIncludeTax = signal<boolean>(false);

  // ========== COMPUTED: MÉTRICAS DE FACTURAS (Ingresos Reales) ==========
  getInvoiceMetrics = computed((): DashboardMetric[] => {
    const kpis = this.invoiceKpisMonthly();
    
    const metrics: DashboardMetric[] = [
      {
        id: 'invoices-month',
        title: 'Facturas Emitidas',
        value: kpis ? String(kpis.invoices_count) : '—',
        change: 0,
        changeType: 'neutral',
        icon: '📃',
        color: '#10b981',
        description: 'Nº de facturas (mes actual)'
      },
      {
        id: 'total-invoiced-month',
        title: 'Total Facturado',
        value: kpis ? this.formatCurrency(kpis.subtotal_sum) : '—',
        change: 0,
        changeType: 'neutral',
        icon: '💰',
        color: '#10b981',
        description: 'Base imponible facturada (mes actual)'
      },
      {
        id: 'tax-invoiced-month',
        title: 'IVA Facturado',
        value: kpis ? this.formatCurrency(kpis.tax_sum) : '—',
        change: 0,
        changeType: 'neutral',
        icon: '🧾',
        color: '#f59e0b',
        description: 'IVA a declarar (mes actual)'
      },
      {
        id: 'collected-month',
        title: 'Cobrado',
        value: kpis ? this.formatCurrency(kpis.collected_sum || 0) : '—',
        change: 0,
        changeType: 'neutral',
        icon: '✅',
        color: '#22c55e',
        description: 'Total cobrado (mes actual)'
      },
      {
        id: 'pending-collection',
        title: 'Pendiente de Cobro',
        value: kpis ? this.formatCurrency(kpis.pending_sum || 0) : '—',
        change: 0,
        changeType: kpis && (kpis.overdue_count || 0) > 0 ? 'decrease' : 'neutral',
        icon: '⏳',
        color: '#eab308',
        description: kpis && (kpis.overdue_count || 0) > 0 
          ? `${kpis.overdue_count} facturas vencidas`
          : 'Facturas por cobrar'
      }
    ];

    return metrics;
  });

  // ========== COMPUTED: MÉTRICAS DE PRESUPUESTOS (Pipeline) ==========
  getQuoteMetrics = computed((): DashboardMetric[] => {
    const kpis = this.quoteKpisMonthly();
    const proj = this.projectedDraftMonthly();
    const includeTax = this.pricesIncludeTax();
    
    const metrics: DashboardMetric[] = [
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
        title: 'Valor Pipeline',
        value: kpis ? this.formatCurrency(kpis.subtotal_sum) : '—',
        change: 0,
        changeType: 'neutral',
        icon: '📊',
        color: '#8b5cf6',
        description: 'Valor potencial de presupuestos (sin IVA)'
      },
      {
        id: 'conversion-rate',
        title: 'Tasa Conversión',
        value: kpis && kpis.conversion_rate != null 
          ? this.formatPercent(kpis.conversion_rate) 
          : '—',
        change: 0,
        changeType: 'neutral',
        icon: '🎯',
        color: '#06b6d4',
        description: 'Presupuestos aceptados / totales'
      },
      {
        id: 'projected-draft',
        title: 'En Borrador',
        value: proj ? this.formatCurrency(proj.total) : '—',
        change: 0,
        changeType: 'neutral',
        icon: '📝',
        color: '#64748b',
        description: proj ? `${proj.draftCount} borradores pendientes` : 'Borradores por enviar'
      }
    ];

    return metrics;
  });

  // Mantener getMetrics para compatibilidad (deprecated)
  getMetrics = computed((): DashboardMetric[] => {
    return [...this.getInvoiceMetrics(), ...this.getQuoteMetrics()];
  });

  // Histórico de presupuestos
  getQuoteHistoricalTrend = computed(() => this.quoteHistoricalTrend());
  
  // Histórico de facturas
  getInvoiceHistoricalTrend = computed(() => this.invoiceHistoricalTrend());
  
  // Legacy (deprecated)
  getHistoricalTrend = computed(() => this.quoteHistoricalTrend());
  
  isLoading = computed(() => this.loading());
  getError = computed(() => this.error());

  // Datos raw para gráficos combinados
  getRawQuoteKpis = computed(() => this.quoteKpisMonthly());
  getRawInvoiceKpis = computed(() => this.invoiceKpisMonthly());

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
        this.loadQuoteMonthlyAnalytics(),
        this.loadQuoteHistoricalTrend(),
        this.loadInvoiceMonthlyAnalytics(),
        this.loadInvoiceHistoricalTrend()
      ]);
    } catch (err: any) {
      console.error('[AnalyticsService] Failed to load analytics', err);
      this.error.set(err?.message || 'Error al cargar analíticas');
    } finally {
      this.loading.set(false);
    }
  }

  // --- PRESUPUESTOS: Server-side analytics over MVs (RPC) ---
  private async loadQuoteMonthlyAnalytics(): Promise<void> {
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
        this.quoteKpisMonthly.set({
          period_month: row.period_month,
          quotes_count: Number(row.quotes_count || 0),
          subtotal_sum: Number(row.subtotal_sum || 0),
          tax_sum: Number(row.tax_sum || 0),
          total_sum: Number(row.total_sum || 0),
          avg_days_to_accept: row.avg_days_to_accept == null ? null : Number(row.avg_days_to_accept),
          conversion_rate: row.conversion_rate == null ? null : Number(row.conversion_rate)
        });
      } else {
        this.quoteKpisMonthly.set(null);
      }
    }

    if (projRes.error) {
      console.error('[AnalyticsService] f_quote_projected_revenue RPC error:', projRes.error);
      this.projectedDraftMonthly.set(null);
    } else {
      // Sum based on prices_include_tax preference
      const monthStr = p_start.slice(0, 7);
      const rows = (projRes.data as any[] | null) || [];
      const monthRows = rows.filter(r => String(r.period_month || '').startsWith(monthStr));
      const includeTax = this.pricesIncludeTax();
      // Use subtotal if prices include tax (show net), otherwise use grand_total
      const total = monthRows.reduce((acc, r) => acc + Number((includeTax ? r.subtotal : r.grand_total) ?? 0), 0);
      const draftCount = monthRows.reduce((acc, r) => acc + Number(r.draft_count ?? 0), 0);
      this.projectedDraftMonthly.set({ total, draftCount });
    }
  }

  private async loadQuoteHistoricalTrend(): Promise<void> {
    const now = new Date();
    // Last 6 months
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
    const p_start = start.toISOString().slice(0, 10);
    const p_end = end.toISOString().slice(0, 10);

    const { data, error } = await this.supabase.instance.rpc('f_quote_kpis_monthly', { p_start, p_end });
    if (error) {
      console.error('[AnalyticsService] f_quote_kpis_monthly (trend) RPC error:', error);
      this.quoteHistoricalTrend.set([]);
      return;
    }

    const rows = (data as any[] | null) || [];
    // Map and sort by period_month - include all data for enhanced chart
    const trend = rows
      .map(r => ({
        month: String(r.period_month || '').slice(0, 7), // YYYY-MM
        total: Number(r.total_sum || 0),
        subtotal: Number(r.subtotal_sum || 0),
        tax: Number(r.tax_sum || 0),
        count: Number(r.quotes_count || 0)
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
    
    this.quoteHistoricalTrend.set(trend);
  }

  // --- FACTURAS: Server-side analytics over MVs (RPC) ---
  private async loadInvoiceMonthlyAnalytics(): Promise<void> {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
    const p_start = start.toISOString().slice(0, 10);
    const p_end = end.toISOString().slice(0, 10);

    try {
      const { data, error } = await this.supabase.instance.rpc('f_invoice_kpis_monthly', { p_start, p_end });

      if (error) {
        // Si la función no existe aún, simplemente no mostramos datos de facturas
        console.warn('[AnalyticsService] f_invoice_kpis_monthly RPC error (puede que no esté desplegada):', error.message);
        this.invoiceKpisMonthly.set(null);
        return;
      }

      const monthStr = p_start.slice(0, 7);
      const row = (data as any[] | null)?.find(r => String(r.period_month || '').startsWith(monthStr)) || null;
      
      if (row) {
        this.invoiceKpisMonthly.set({
          period_month: row.period_month,
          invoices_count: Number(row.invoices_count || 0),
          paid_count: Number(row.paid_count || 0),
          pending_count: Number(row.pending_count || 0),
          overdue_count: Number(row.overdue_count || 0),
          cancelled_count: Number(row.cancelled_count || 0),
          draft_count: Number(row.draft_count || 0),
          subtotal_sum: Number(row.subtotal_sum || 0),
          tax_sum: Number(row.tax_sum || 0),
          total_sum: Number(row.total_sum || 0),
          collected_sum: Number(row.collected_sum || 0),
          pending_sum: Number(row.pending_sum || 0),
          paid_total_sum: Number(row.paid_total_sum || 0),
          receivable_sum: Number(row.receivable_sum || 0),
          avg_invoice_value: Number(row.avg_invoice_value || 0),
          collection_rate: Number(row.collection_rate || 0)
        });
      } else {
        this.invoiceKpisMonthly.set(null);
      }
    } catch (e) {
      console.warn('[AnalyticsService] Error loading invoice analytics:', e);
      this.invoiceKpisMonthly.set(null);
    }
  }

  private async loadInvoiceHistoricalTrend(): Promise<void> {
    const now = new Date();
    // Last 6 months
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
    const p_start = start.toISOString().slice(0, 10);
    const p_end = end.toISOString().slice(0, 10);

    try {
      const { data, error } = await this.supabase.instance.rpc('f_invoice_kpis_monthly', { p_start, p_end });
      
      if (error) {
        console.warn('[AnalyticsService] f_invoice_kpis_monthly (trend) RPC error:', error.message);
        this.invoiceHistoricalTrend.set([]);
        return;
      }

      const rows = (data as any[] | null) || [];
      const trend = rows
        .map(r => ({
          month: String(r.period_month || '').slice(0, 7),
          total: Number(r.total_sum || 0),
          subtotal: Number(r.subtotal_sum || 0),
          tax: Number(r.tax_sum || 0),
          count: Number(r.invoices_count || 0),
          collected: Number(r.collected_sum || 0)
        }))
        .sort((a, b) => a.month.localeCompare(b.month));
      
      this.invoiceHistoricalTrend.set(trend);
    } catch (e) {
      console.warn('[AnalyticsService] Error loading invoice trend:', e);
      this.invoiceHistoricalTrend.set([]);
    }
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
