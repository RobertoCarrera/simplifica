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

// Interfaces para KPIs de tickets
export interface TicketKpis {
  period_month: string;
  tickets_created: number;
  critical_count: number;
  high_priority_count: number;
  normal_priority_count: number;
  low_priority_count: number;
  open_count: number;
  in_progress_count: number;
  completed_count: number;
  completed_this_month: number;
  overdue_count: number;
  total_amount_sum: number;
  invoiced_amount_sum: number;
  avg_resolution_days: number | null;
  min_resolution_days: number | null;
  max_resolution_days: number | null;
  resolution_rate: number | null;
}

export interface TicketCurrentStatus {
  total_open: number;
  total_in_progress: number;
  total_completed: number;
  total_overdue: number;
  critical_open: number;
  high_open: number;
  avg_age_days: number | null;
  oldest_ticket_days: number | null;
}

// Interfaces para KPIs de Reservas
export interface BookingKpis {
  period_month: string;
  bookings_count: number;
  confirmed_count: number;
  cancelled_count: number;
  total_revenue: number;
  total_hours: number;
}

export interface TopService {
  service_id: string;
  service_name: string;
  bookings_count: number;
  total_revenue: number;
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
  private allDraftQuotes = signal<{ total: number; count: number } | null>(null);
  private recurringMonthly = signal<{ total: number; count: number } | null>(null);
  private currentPipeline = signal<{ total: number; count: number } | null>(null);

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

  // ========== TICKETS ==========
  private ticketKpisMonthly = signal<TicketKpis | null>(null);
  private ticketCurrentStatus = signal<TicketCurrentStatus | null>(null);

  // Historical trend: last 6 months of tickets data
  private ticketHistoricalTrend = signal<Array<{
    month: string;
    created: number;
    resolved: number;
    overdue: number;
  }>>([]);

  // ========== RESERVAS (BOOKINGS) ==========
  private bookingKpisMonthly = signal<BookingKpis | null>(null);
  private topServices = signal<TopService[]>([]);

  // Historical trend: bookings
  private bookingHistoricalTrend = signal<Array<{
    month: string;
    count: number;
    revenue: number;
    hours: number;
  }>>([]);

  // Leads By Channel (Signal)
  // We can either expose a signal or just a method. Let's expose a method to simple fetch for now as it's not time-series critical yet.

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
    const allDrafts = this.allDraftQuotes();
    const recurring = this.recurringMonthly();
    const pipeline = this.currentPipeline();
    const includeTax = this.pricesIncludeTax();

    // Usar el pipeline actual (incluye TODOS los presupuestos pendientes, sin importar cuándo se crearon)
    // y sumarle los recurrentes programados
    const pipelineCount = pipeline?.count || 0;
    const pipelineValue = pipeline?.total || 0;
    const recurringCount = recurring?.count || 0;
    const recurringValue = recurring?.total || 0;

    const totalQuotesCount = pipelineCount + recurringCount;
    const totalPipelineValue = pipelineValue + recurringValue;
    const hasRecurring = recurringCount > 0;

    const metrics: DashboardMetric[] = [
      {
        id: 'quotes-month',
        title: 'Presupuestos Mes',
        value: String(totalQuotesCount),
        change: 0,
        changeType: 'neutral',
        icon: '📄',
        color: '#3b82f6',
        description: hasRecurring
          ? `${pipelineCount} pendientes + ${recurringCount} recurrentes`
          : `${pipelineCount} presupuestos pendientes`
      },
      {
        id: 'total-quoted-month',
        title: 'Valor Pipeline',
        value: this.formatCurrency(totalPipelineValue),
        change: 0,
        changeType: 'neutral',
        icon: '📊',
        color: '#8b5cf6',
        description: hasRecurring
          ? `${this.formatCurrency(pipelineValue)} pendientes + ${this.formatCurrency(recurringValue)} recurrentes`
          : 'Valor potencial de presupuestos (sin IVA)'
      },
      {
        id: 'recurring-this-month',
        title: 'Recurrentes Este Mes',
        value: recurring ? this.formatCurrency(recurring.total) : '0 €',
        change: 0,
        changeType: recurring && recurring.count > 0 ? 'increase' : 'neutral',
        icon: '🔄',
        color: '#f59e0b',
        description: recurring && recurring.count > 0
          ? `${recurring.count} recurrentes a facturar este mes`
          : 'Sin recurrentes programados'
      },
      {
        id: 'conversion-rate',
        title: 'Tasa Conversión',
        value: kpis && kpis.conversion_rate != null
          ? this.formatPercent(kpis.conversion_rate)
          : '0%',
        change: 0,
        changeType: 'neutral',
        icon: '🎯',
        color: '#06b6d4',
        description: 'Presupuestos aceptados / totales'
      },
      {
        id: 'projected-draft',
        title: 'En Borrador',
        value: allDrafts ? this.formatCurrency(allDrafts.total) : '0 €',
        change: 0,
        changeType: 'neutral',
        icon: '📝',
        color: '#64748b',
        description: allDrafts && allDrafts.count > 0 ? `${allDrafts.count} borradores pendientes` : '0 borradores pendientes'
      }
    ];

    return metrics;
  });

  // Mantener getMetrics para compatibilidad (deprecated)
  getMetrics = computed((): DashboardMetric[] => {
    return [...this.getInvoiceMetrics(), ...this.getQuoteMetrics()];
  });

  // ========== COMPUTED: MÉTRICAS DE TICKETS (Gestión SAT) ==========
  getTicketMetrics = computed((): DashboardMetric[] => {
    const kpis = this.ticketKpisMonthly();
    const status = this.ticketCurrentStatus();

    // Calcular tickets abiertos actuales (no completados)
    const openNow = status
      ? (status.total_open + status.total_in_progress)
      : 0;

    const metrics: DashboardMetric[] = [
      {
        id: 'tickets-open',
        title: 'Tickets Abiertos',
        value: String(openNow),
        change: 0,
        changeType: status && status.critical_open > 0 ? 'decrease' : 'neutral',
        icon: '🎫',
        color: '#0ea5e9',
        description: status && status.critical_open > 0
          ? `${status.critical_open} críticos pendientes`
          : 'Tickets activos actualmente'
      },
      {
        id: 'tickets-resolved-month',
        title: 'Resueltos Mes',
        value: String(kpis?.completed_this_month || 0),
        change: 0,
        changeType: 'neutral',
        icon: '✅',
        color: '#22c55e',
        description: 'Tickets cerrados este mes'
      },
      {
        id: 'tickets-avg-resolution',
        title: 'Tiempo Medio',
        value: kpis && kpis.avg_resolution_days != null
          ? this.formatDays(kpis.avg_resolution_days)
          : '—',
        change: 0,
        changeType: 'neutral',
        icon: '⏱️',
        color: '#8b5cf6',
        description: 'Tiempo medio de resolución'
      },
      {
        id: 'tickets-overdue',
        title: 'Vencidos',
        value: String(status?.total_overdue || 0),
        change: 0,
        changeType: status && status.total_overdue > 0 ? 'decrease' : 'neutral',
        icon: '⚠️',
        color: status && status.total_overdue > 0 ? '#ef4444' : '#64748b',
        description: status && status.total_overdue > 0
          ? 'Requieren atención urgente'
          : 'Sin tickets vencidos'
      },
      {
        id: 'tickets-invoiced',
        title: 'Facturado Tickets',
        value: this.formatCurrency(kpis?.invoiced_amount_sum || 0),
        change: 0,
        changeType: 'neutral',
        icon: '💵',
        color: '#10b981',
        description: 'Importe de tickets cerrados'
      }
    ];

    return metrics;
  });

  // ========== COMPUTED: MÉTRICAS DE RESERVAS ==========
  getBookingMetrics = computed((): DashboardMetric[] => {
    const kpis = this.bookingKpisMonthly();

    const metrics: DashboardMetric[] = [
      {
        id: 'bookings-month',
        title: 'Citas Reservadas',
        value: kpis ? String(kpis.bookings_count) : '—',
        change: 0,
        changeType: 'neutral',
        icon: '📅',
        color: '#6366f1',
        description: kpis ? `${kpis.confirmed_count} confirmadas` : 'Total citas este mes'
      },
      {
        id: 'booking-revenue-month',
        title: 'Ingresos Reservas',
        value: kpis ? this.formatCurrency(kpis.total_revenue) : '—',
        change: 0,
        changeType: 'neutral',
        icon: '💳',
        color: '#8b5cf6',
        description: 'Valor total de citas (no canceladas)'
      },
      {
        id: 'booking-hours-month',
        title: 'Horas Reservadas',
        value: kpis ? this.formatCompact(kpis.total_hours) + 'h' : '—',
        change: 0,
        changeType: 'neutral',
        icon: '⏳',
        color: '#f43f5e',
        description: 'Total horas ocupadas'
      }
    ];

    return metrics;
  });

  getTopServices = computed(() => this.topServices());
  getBookingHistoricalTrend = computed(() => this.bookingHistoricalTrend());

  // Histórico de presupuestos
  getQuoteHistoricalTrend = computed(() => this.quoteHistoricalTrend());

  // Histórico de facturas
  getInvoiceHistoricalTrend = computed(() => this.invoiceHistoricalTrend());

  // Histórico de tickets
  getTicketHistoricalTrend = computed(() => this.ticketHistoricalTrend());
  getTicketCurrentStatus = computed(() => this.ticketCurrentStatus());

  // Recurrentes mensuales
  getRecurringMonthly = computed(() => this.recurringMonthly());

  // Pipeline actual (todos los presupuestos pendientes)
  getCurrentPipeline = computed(() => this.currentPipeline());

  // Legacy (deprecated)
  getHistoricalTrend = computed(() => this.quoteHistoricalTrend());

  isLoading = computed(() => this.loading());
  getError = computed(() => this.error());

  // Datos raw para gráficos combinados
  getRawQuoteKpis = computed(() => this.quoteKpisMonthly());
  getRawInvoiceKpis = computed(() => this.invoiceKpisMonthly());
  getRawTicketKpis = computed(() => this.ticketKpisMonthly());

  constructor() {
    // Load server-side analytics on init
    // Load pricing preference in parallel
    this.loadPricingPreference();
    this.refreshAnalytics();
  }

  // Refresh analytics data (can be called manually or on interval)
  async refreshAnalytics(): Promise<void> {
    // ...
  }

  /**
   * Get Leads by Channel (Source)
   */
  /**
   * Get Leads by Channel (Source)
   */
  async getLeadsByChannel(): Promise<{ source: string; count: number }[]> {
    // We rely on RLS to filter leads by the user's company.
    // The policy on 'leads' table ensures users only see leads from their company.

    const { data, error } = await this.supabase.instance
      .from('leads')
      .select('source');

    if (error) {
      console.error('[AnalyticsService] Error fetching leads stats:', error);
      return [];
    }

    const counts: Record<string, number> = {};
    (data || []).forEach((lead: any) => {
      const src = lead.source || 'other';
      counts[src] = (counts[src] || 0) + 1;
    });

    return Object.entries(counts)
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count);
  }

  // --- PRESUPUESTOS: Consolidado KPIs + Trend en una sola llamada ---
  private async loadQuoteKpisAndTrend(): Promise<void> {
    const now = new Date();
    // Rango de 6 meses para el histórico (incluye mes actual)
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
    const p_start = start.toISOString().slice(0, 10);
    const p_end = end.toISOString().slice(0, 10);
    const currentMonthStr = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

    try {
      const { data, error } = await this.supabase.instance.rpc('f_quote_kpis_monthly', { p_start, p_end });

      if (error) {
        console.error('[AnalyticsService] f_quote_kpis_monthly RPC error:', error);
        this.quoteKpisMonthly.set(null);
        this.quoteHistoricalTrend.set([]);
        return;
      }

      const rows = (data as any[] | null) || [];

      // 1. Extraer datos del mes actual para KPIs
      const currentRow = rows.find(r => String(r.period_month || '').startsWith(currentMonthStr)) || null;
      if (currentRow) {
        this.quoteKpisMonthly.set({
          period_month: currentRow.period_month,
          quotes_count: Number(currentRow.quotes_count || 0),
          subtotal_sum: Number(currentRow.subtotal_sum || 0),
          tax_sum: Number(currentRow.tax_sum || 0),
          total_sum: Number(currentRow.total_sum || 0),
          avg_days_to_accept: currentRow.avg_days_to_accept == null ? null : Number(currentRow.avg_days_to_accept),
          conversion_rate: currentRow.conversion_rate == null ? null : Number(currentRow.conversion_rate)
        });
      } else {
        this.quoteKpisMonthly.set(null);
      }

      // 2. Mapear todos los datos para el histórico/trend
      const trend = rows
        .map(r => ({
          month: String(r.period_month || '').slice(0, 7),
          total: Number(r.total_sum || 0),
          subtotal: Number(r.subtotal_sum || 0),
          tax: Number(r.tax_sum || 0),
          count: Number(r.quotes_count || 0)
        }))
        .sort((a, b) => a.month.localeCompare(b.month));

      this.quoteHistoricalTrend.set(trend);
    } catch (e) {
      console.error('[AnalyticsService] Error loading quote KPIs and trend:', e);
      this.quoteKpisMonthly.set(null);
      this.quoteHistoricalTrend.set([]);
    }
  }

  // --- PRESUPUESTOS: Cargar projected revenue (borradores del mes actual) ---
  private async loadQuoteMonthlyAnalytics(): Promise<void> {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
    const p_start = start.toISOString().slice(0, 10); // YYYY-MM-DD
    const p_end = end.toISOString().slice(0, 10);

    try {
      const { data: projRes, error } = await this.supabase.instance.rpc('f_quote_projected_revenue', { p_start, p_end });

      if (error) {
        console.error('[AnalyticsService] f_quote_projected_revenue RPC error:', error);
        this.projectedDraftMonthly.set(null);
        return;
      }

      // Sum based on prices_include_tax preference
      const monthStr = p_start.slice(0, 7);
      const rows = (projRes as any[] | null) || [];
      const monthRows = rows.filter(r => String(r.period_month || '').startsWith(monthStr));
      const includeTax = this.pricesIncludeTax();
      const total = monthRows.reduce((acc, r) => acc + Number((includeTax ? r.subtotal : r.grand_total) ?? 0), 0);
      const draftCount = monthRows.reduce((acc, r) => acc + Number(r.draft_count ?? 0), 0);
      this.projectedDraftMonthly.set({ total, draftCount });
    } catch (e) {
      console.error('[AnalyticsService] Error loading projected revenue:', e);
      this.projectedDraftMonthly.set(null);
    }
  }

  // Mantener para compatibilidad (ahora no se usa directamente)
  private async loadQuoteHistoricalTrend(): Promise<void> {
    // Esta funcionalidad está ahora consolidada en loadQuoteKpisAndTrend
  }

  // --- BORRADORES: Cargar todos los presupuestos en borrador (sin filtro de mes) ---
  private async loadAllDraftQuotes(): Promise<void> {
    try {
      // Llamar sin filtro de fechas para obtener TODOS los borradores pendientes
      const { data, error } = await this.supabase.instance.rpc('f_quote_projected_revenue', {});

      if (error) {
        console.warn('[AnalyticsService] f_quote_projected_revenue (all drafts) error:', error.message);
        this.allDraftQuotes.set(null);
        return;
      }

      const rows = (data as any[] | null) || [];
      const includeTax = this.pricesIncludeTax();
      // Sumar todos los borradores de todos los meses
      const total = rows.reduce((acc, r) => acc + Number((includeTax ? r.subtotal : r.grand_total) ?? 0), 0);
      const count = rows.reduce((acc, r) => acc + Number(r.draft_count ?? 0), 0);

      this.allDraftQuotes.set({ total, count });
    } catch (e) {
      console.warn('[AnalyticsService] Error loading all draft quotes:', e);
      this.allDraftQuotes.set(null);
    }
  }

  // --- RECURRENTES: Cargar presupuestos recurrentes del mes actual ---
  private async loadRecurringMonthly(): Promise<void> {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
    const p_start = start.toISOString().slice(0, 10);
    const p_end = end.toISOString().slice(0, 10);

    try {
      const { data, error } = await this.supabase.instance.rpc('f_quote_recurring_monthly', { p_start, p_end });

      if (error) {
        console.warn('[AnalyticsService] f_quote_recurring_monthly error:', error.message);
        this.recurringMonthly.set(null);
        return;
      }

      const rows = (data as any[] | null) || [];
      const includeTax = this.pricesIncludeTax();
      const monthStr = p_start.slice(0, 7);
      const monthRows = rows.filter(r => String(r.period_month || '').startsWith(monthStr));

      const total = monthRows.reduce((acc, r) => acc + Number((includeTax ? r.subtotal : r.grand_total) ?? 0), 0);
      const count = monthRows.reduce((acc, r) => acc + Number(r.recurring_count ?? 0), 0);

      this.recurringMonthly.set({ total, count });
    } catch (e) {
      console.warn('[AnalyticsService] Error loading recurring monthly:', e);
      this.recurringMonthly.set(null);
    }
  }

  // --- PIPELINE ACTUAL: Cargar TODOS los presupuestos pendientes actuales ---
  private async loadCurrentPipeline(): Promise<void> {
    try {
      const { data, error } = await this.supabase.instance.rpc('f_quote_pipeline_current', {});

      if (error) {
        console.warn('[AnalyticsService] f_quote_pipeline_current error:', error.message);
        this.currentPipeline.set(null);
        return;
      }

      const row = (data as any[] | null)?.[0] || null;
      if (row) {
        const includeTax = this.pricesIncludeTax();
        const total = Number((includeTax ? row.subtotal_sum : row.total_sum) ?? 0);
        const count = Number(row.quotes_count ?? 0);

        this.currentPipeline.set({ total, count });
      } else {
        this.currentPipeline.set({ total: 0, count: 0 });
      }
    } catch (e) {
      console.warn('[AnalyticsService] Error loading current pipeline:', e);
      this.currentPipeline.set(null);
    }
  }

  // --- FACTURAS: Consolidado KPIs + Trend en una sola llamada ---
  private async loadInvoiceKpisAndTrend(): Promise<void> {
    const now = new Date();
    // Rango de 6 meses para el histórico (incluye mes actual)
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
    const p_start = start.toISOString().slice(0, 10);
    const p_end = end.toISOString().slice(0, 10);
    const currentMonthStr = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

    try {
      const { data, error } = await this.supabase.instance.rpc('f_invoice_kpis_monthly', { p_start, p_end });

      if (error) {
        console.warn('[AnalyticsService] f_invoice_kpis_monthly RPC error:', error.message);
        this.invoiceKpisMonthly.set(null);
        this.invoiceHistoricalTrend.set([]);
        return;
      }

      const rows = (data as any[] | null) || [];

      // 1. Extraer datos del mes actual para KPIs
      const currentRow = rows.find(r => String(r.period_month || '').startsWith(currentMonthStr)) || null;
      if (currentRow) {
        this.invoiceKpisMonthly.set({
          period_month: currentRow.period_month,
          invoices_count: Number(currentRow.invoices_count || 0),
          paid_count: Number(currentRow.paid_count || 0),
          pending_count: Number(currentRow.pending_count || 0),
          overdue_count: Number(currentRow.overdue_count || 0),
          cancelled_count: Number(currentRow.cancelled_count || 0),
          draft_count: Number(currentRow.draft_count || 0),
          subtotal_sum: Number(currentRow.subtotal_sum || 0),
          tax_sum: Number(currentRow.tax_sum || 0),
          total_sum: Number(currentRow.total_sum || 0),
          collected_sum: Number(currentRow.collected_sum || 0),
          pending_sum: Number(currentRow.pending_sum || 0),
          paid_total_sum: Number(currentRow.paid_total_sum || 0),
          receivable_sum: Number(currentRow.receivable_sum || 0),
          avg_invoice_value: Number(currentRow.avg_invoice_value || 0),
          collection_rate: Number(currentRow.collection_rate || 0)
        });
      } else {
        this.invoiceKpisMonthly.set(null);
      }

      // 2. Mapear todos los datos para el histórico/trend
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
      console.warn('[AnalyticsService] Error loading invoice KPIs and trend:', e);
      this.invoiceKpisMonthly.set(null);
      this.invoiceHistoricalTrend.set([]);
    }
  }

  // Mantener para compatibilidad (ahora no se usa directamente)
  private async loadInvoiceMonthlyAnalytics(): Promise<void> {
    // Esta funcionalidad está ahora consolidada en loadInvoiceKpisAndTrend
  }

  // Mantener para compatibilidad (ahora no se usa directamente)
  private async loadInvoiceHistoricalTrend(): Promise<void> {
    // Esta funcionalidad está ahora consolidada en loadInvoiceKpisAndTrend
  }

  // --- TICKETS: Consolidado KPIs + Trend en una sola llamada ---
  private async loadTicketKpisAndTrend(): Promise<void> {
    const now = new Date();
    // Rango de 6 meses para el histórico
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
    const p_start = start.toISOString().slice(0, 10);
    const p_end = end.toISOString().slice(0, 10);
    const currentMonthStr = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

    try {
      const { data, error } = await this.supabase.instance.rpc('f_ticket_kpis_monthly', { p_start, p_end });

      if (error) {
        console.warn('[AnalyticsService] f_ticket_kpis_monthly RPC error:', error.message);
        this.ticketKpisMonthly.set(null);
        this.ticketHistoricalTrend.set([]);
        return;
      }

      const rows = (data as any[] | null) || [];

      // 1. Extraer datos del mes actual para KPIs
      const currentRow = rows.find(r => String(r.period_month || '').startsWith(currentMonthStr)) || null;
      if (currentRow) {
        this.ticketKpisMonthly.set({
          period_month: currentRow.period_month,
          tickets_created: Number(currentRow.tickets_created || 0),
          critical_count: Number(currentRow.critical_count || 0),
          high_priority_count: Number(currentRow.high_priority_count || 0),
          normal_priority_count: Number(currentRow.normal_priority_count || 0),
          low_priority_count: Number(currentRow.low_priority_count || 0),
          open_count: Number(currentRow.open_count || 0),
          in_progress_count: Number(currentRow.in_progress_count || 0),
          completed_count: Number(currentRow.completed_count || 0),
          completed_this_month: Number(currentRow.completed_this_month || 0),
          overdue_count: Number(currentRow.overdue_count || 0),
          total_amount_sum: Number(currentRow.total_amount_sum || 0),
          invoiced_amount_sum: Number(currentRow.invoiced_amount_sum || 0),
          avg_resolution_days: currentRow.avg_resolution_days == null ? null : Number(currentRow.avg_resolution_days),
          min_resolution_days: currentRow.min_resolution_days == null ? null : Number(currentRow.min_resolution_days),
          max_resolution_days: currentRow.max_resolution_days == null ? null : Number(currentRow.max_resolution_days),
          resolution_rate: currentRow.resolution_rate == null ? null : Number(currentRow.resolution_rate)
        });
      } else {
        this.ticketKpisMonthly.set(null);
      }

      // 2. Mapear todos los datos para el histórico/trend
      const trend = rows
        .map(r => ({
          month: String(r.period_month || '').slice(0, 7),
          created: Number(r.tickets_created || 0),
          resolved: Number(r.completed_this_month || 0),
          overdue: Number(r.overdue_count || 0)
        }))
        .sort((a, b) => a.month.localeCompare(b.month));

      this.ticketHistoricalTrend.set(trend);
    } catch (e) {
      console.warn('[AnalyticsService] Error loading ticket KPIs and trend:', e);
      this.ticketKpisMonthly.set(null);
      this.ticketHistoricalTrend.set([]);
    }
  }

  // Mantener para compatibilidad (ahora no se usa directamente)
  private async loadTicketMonthlyAnalytics(): Promise<void> {
    // Esta funcionalidad está ahora consolidada en loadTicketKpisAndTrend
  }

  // Mantener para compatibilidad (ahora no se usa directamente)
  private async loadTicketHistoricalTrend(): Promise<void> {
    // Esta funcionalidad está ahora consolidada en loadTicketKpisAndTrend
  }

  private async loadTicketCurrentStatus(): Promise<void> {
    try {
      const { data, error } = await this.supabase.instance.rpc('f_ticket_current_status');

      if (error) {
        console.warn('[AnalyticsService] f_ticket_current_status RPC error:', error.message);
        this.ticketCurrentStatus.set(null);
        return;
      }

      const row = (data as any[] | null)?.[0] || null;

      if (row) {
        this.ticketCurrentStatus.set({
          total_open: Number(row.total_open || 0),
          total_in_progress: Number(row.total_in_progress || 0),
          total_completed: Number(row.total_completed || 0),
          total_overdue: Number(row.total_overdue || 0),
          critical_open: Number(row.critical_open || 0),
          high_open: Number(row.high_open || 0),
          avg_age_days: row.avg_age_days == null ? null : Number(row.avg_age_days),
          oldest_ticket_days: row.oldest_ticket_days == null ? null : Number(row.oldest_ticket_days)
        });
      } else {
        this.ticketCurrentStatus.set(null);
      }
    } catch (e) {
      console.warn('[AnalyticsService] Error loading ticket status:', e);
      this.ticketCurrentStatus.set(null);
    }
  }

  // --- RESERVAS: Consolidado KPIs + Trend ---
  private async loadBookingKpisAndTrend(): Promise<void> {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
    const p_start = start.toISOString().slice(0, 10);
    const p_end = end.toISOString().slice(0, 10);
    const currentMonthStr = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

    try {
      const { data, error } = await this.supabase.instance.rpc('f_booking_analytics_monthly', { p_start, p_end });

      if (error) {
        console.warn('[AnalyticsService] f_booking_analytics_monthly RPC error:', error.message);
        this.bookingKpisMonthly.set(null);
        this.bookingHistoricalTrend.set([]);
        return;
      }

      const rows = (data as any[] | null) || [];
      const currentRow = rows.find(r => String(r.period_month || '').startsWith(currentMonthStr)) || null;

      if (currentRow) {
        this.bookingKpisMonthly.set({
          period_month: currentRow.period_month,
          bookings_count: Number(currentRow.bookings_count || 0),
          confirmed_count: Number(currentRow.confirmed_count || 0),
          cancelled_count: Number(currentRow.cancelled_count || 0),
          total_revenue: Number(currentRow.total_revenue || 0),
          total_hours: Number(currentRow.total_hours || 0)
        });
      } else {
        this.bookingKpisMonthly.set(null);
      }

      const trend = rows.map(r => ({
        month: String(r.period_month || '').slice(0, 7),
        count: Number(r.bookings_count || 0),
        revenue: Number(r.total_revenue || 0),
        hours: Number(r.total_hours || 0)
      })).sort((a, b) => a.month.localeCompare(b.month));

      this.bookingHistoricalTrend.set(trend);
    } catch (e) {
      console.warn('[AnalyticsService] Error loading booking KPIs:', e);
      this.bookingKpisMonthly.set(null);
      this.bookingHistoricalTrend.set([]);
    }
  }

  private async loadTopServices(): Promise<void> {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)); // This month
    // Optional: could do last 30 days or all time. Let's do this month for consistency with KPIs.
    const p_start = start.toISOString().slice(0, 10);

    try {
      const { data, error } = await this.supabase.instance.rpc('f_analytics_top_services', { p_start, p_limit: 5 });
      if (error) throw error;
      this.topServices.set(data as TopService[] || []);
    } catch (e) {
      console.warn('Error loading top services', e);
      this.topServices.set([]);
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

  private formatDays(days: number): string {
    if (days < 1) {
      const hours = Math.round(days * 24);
      return `${hours}h`;
    }
    if (days < 7) {
      return `${days.toFixed(1)}d`;
    }
    const weeks = Math.floor(days / 7);
    const remainingDays = Math.round(days % 7);
    if (remainingDays === 0) {
      return `${weeks}sem`;
    }
    return `${weeks}sem ${remainingDays}d`;
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
