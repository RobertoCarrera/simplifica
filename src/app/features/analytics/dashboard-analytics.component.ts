import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { NgApexchartsModule } from 'ng-apexcharts';
import { ApexAxisChartSeries, ApexChart, ApexXAxis, ApexYAxis, ApexDataLabels, ApexTooltip, ApexStroke, ApexLegend, ApexGrid, ApexPlotOptions, ApexTheme } from 'ng-apexcharts';
import { AnalyticsService } from '../../services/analytics.service';
import { AnimationService } from '../../services/animation.service';
import { SidebarStateService } from '../../services/sidebar-state.service';
import { ToastService } from '../../services/toast.service';
import { SupabaseModulesService } from '../../services/supabase-modules.service';
import { AiSavingsWidgetComponent } from './ai-savings-widget/ai-savings-widget.component';

export type ChartOptions = {
  series: ApexAxisChartSeries;
  chart: ApexChart;
  xaxis: ApexXAxis;
  yaxis: ApexYAxis;
  dataLabels: ApexDataLabels;
  tooltip: ApexTooltip;
  stroke: ApexStroke;
  legend: ApexLegend;
  grid: ApexGrid;
  plotOptions: ApexPlotOptions;
  colors: string[];
  theme: ApexTheme;
};

@Component({
  selector: 'app-dashboard-analytics',
  standalone: true,
  imports: [CommonModule, NgApexchartsModule, AiSavingsWidgetComponent],
  template: `
    <div class="container-fluid h-full flex flex-col overflow-hidden pb-20 md:pb-8 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100"
      [attr.data-sidebar-collapsed]="sidebarService.isCollapsed() ? '1' : '0'">
      
      <!-- Inner wrapper: contains header and content -->
      <div class="flex-1 flex flex-col p-2 overflow-hidden">

        <!-- Scrollable content area -->
        <div class="flex-1 overflow-auto space-y-6">
          <!-- Error Alert -->
          @if (error()) {
            <div class="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg flex items-start gap-3">
              <svg class="w-5 h-5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"></path>
              </svg>
              <div class="flex-1 text-sm">{{ error() }}</div>
              <button (click)="clearError()" class="text-red-700 dark:text-red-300 hover:text-red-900 dark:hover:text-red-200">
                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path>
                </svg>
              </button>
            </div>
          }

          <!-- Loading State -->
          @if (isLoading()) {
            <div class="space-y-6">
              <!-- Section skeleton -->
              @for (section of [1, 2]; track section) {
                <div class="rounded-xl border-2 border-gray-200 dark:border-gray-700 p-4">
                  <div class="h-6 bg-gray-200 dark:bg-gray-700 rounded w-48 mb-4 animate-pulse"></div>
                  <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    @for (i of [1,2,3,4,5]; track i) {
                      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 border border-gray-200 dark:border-gray-700 animate-pulse">
                        <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-3"></div>
                        <div class="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mb-2"></div>
                        <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
                      </div>
                    }
                  </div>
                </div>
              }
              <!-- Chart skeleton -->
              <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 md:p-6 border border-gray-200 dark:border-gray-700 animate-pulse">
                <div class="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-4"></div>
                <div class="h-64 bg-gray-200 dark:bg-gray-700 rounded"></div>
              </div>
            </div>
          }

          <!-- ========== GRÁFICO COMPARATIVO ========== -->
            @if (quoteHistoricalData().length > 0 || invoiceHistoricalData().length > 0) {
              <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 md:p-6 border border-gray-200 dark:border-gray-700">
                <h3 class="text-base md:text-lg font-semibold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"></path>
                  </svg>
                  Evolución Mensual (últimos 6 meses)
                  <button
                    [disabled]="isLoading()"
                    class="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors duration-200 inline-flex items-center gap-2 shadow-sm text-sm"
                  >
                    <svg class="w-4 h-4" [class.animate-spin]="isLoading()" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                    </svg>
                    <span class="hidden sm:inline">Actualizar</span>
                  </button>
                </h3>
                
                <apx-chart
                  [series]="chartOptions().series"
                  [chart]="chartOptions().chart"
                  [xaxis]="chartOptions().xaxis"
                  [yaxis]="chartOptions().yaxis"
                  [dataLabels]="chartOptions().dataLabels"
                  [tooltip]="chartOptions().tooltip"
                  [stroke]="chartOptions().stroke"
                  [legend]="chartOptions().legend"
                  [grid]="chartOptions().grid"
                  [plotOptions]="chartOptions().plotOptions"
                  [colors]="chartOptions().colors"
                  [theme]="chartOptions().theme"
                ></apx-chart>
              </div>
            }

          <!-- Content -->
          @if (!isLoading()) {
            <!-- AI Savings Widget -->
             <div class="mb-6">
                <app-ai-savings-widget></app-ai-savings-widget>
             </div>

            <!-- ========== SECCIÓN 1: INGRESOS REALES (Facturas) ========== -->
            <div class="rounded-xl border-2 border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 p-4">
              <div class="flex items-center gap-3 mb-4">
                <div class="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center">
                  <svg class="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                  </svg>
                </div>
                <div>
                  <h2 class="text-lg font-bold text-emerald-800 dark:text-emerald-200">Ingresos Reales</h2>
                  <p class="text-xs text-emerald-600 dark:text-emerald-400">Facturas emitidas · Dinero confirmado</p>
                </div>
              </div>
              
              <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                @for (metric of invoiceMetrics(); track metric.id) {
                  <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 p-3 md:p-4 border border-emerald-100 dark:border-emerald-900/50">
                    <div class="flex items-start justify-between mb-1">
                      <div class="text-xl md:text-2xl">{{ metric.icon }}</div>
                    </div>
                    <div class="space-y-0.5">
                      <p class="text-[10px] md:text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                        {{ metric.title }}
                      </p>
                      <p class="text-lg md:text-xl font-bold text-gray-900 dark:text-white break-words">
                        {{ metric.value }}
                      </p>
                      <p class="text-[10px] md:text-xs text-gray-500 dark:text-gray-400 truncate">
                        {{ metric.description }}
                      </p>
                    </div>
                  </div>
                }
                
                <!-- Empty state for invoices -->
                @if (invoiceMetrics().length === 0 || invoiceMetrics()[0].value === '—') {
                  <div class="col-span-full bg-white/50 dark:bg-gray-800/50 rounded-lg border border-dashed border-emerald-300 dark:border-emerald-700 p-6 text-center">
                    <p class="text-sm text-emerald-600 dark:text-emerald-400">
                      Aún no hay facturas emitidas este mes
                    </p>
                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Las métricas de facturación aparecerán aquí
                    </p>
                  </div>
                }
              </div>
            </div>

            <!-- ========== SECCIÓN 2: PIPELINE DE VENTAS (Presupuestos) ========== -->
            <div class="rounded-xl border-2 border-violet-200 dark:border-violet-800 bg-violet-50/50 dark:bg-violet-950/20 p-4">
              <div class="flex items-center gap-3 mb-4">
                <div class="w-10 h-10 rounded-full bg-violet-100 dark:bg-violet-900 flex items-center justify-center">
                  <svg class="w-5 h-5 text-violet-600 dark:text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path>
                  </svg>
                </div>
                <div>
                  <h2 class="text-lg font-bold text-violet-800 dark:text-violet-200">Pipeline de Ventas</h2>
                  <p class="text-xs text-violet-600 dark:text-violet-400">Presupuestos · Dinero potencial</p>
                </div>
              </div>
              
              <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                @for (metric of quoteMetrics(); track metric.id) {
                  <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 p-3 md:p-4 border border-violet-100 dark:border-violet-900/50"
                       [class.ring-2]="metric.id === 'recurring-this-month' && metric.changeType === 'increase'"
                       [class.ring-amber-400]="metric.id === 'recurring-this-month' && metric.changeType === 'increase'">
                    <div class="flex items-start justify-between mb-1">
                      <div class="text-xl md:text-2xl">{{ metric.icon }}</div>
                      @if (metric.id === 'recurring-this-month' && metric.changeType === 'increase') {
                        <span class="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 text-[9px] font-semibold rounded">
                          ¡PROGRAMADO!
                        </span>
                      }
                    </div>
                    <div class="space-y-0.5">
                      <p class="text-[10px] md:text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                        {{ metric.title }}
                      </p>
                      <p class="text-lg md:text-xl font-bold text-gray-900 dark:text-white break-words">
                        {{ metric.value }}
                      </p>
                      <p class="text-[10px] md:text-xs text-gray-500 dark:text-gray-400 truncate">
                        {{ metric.description }}
                      </p>
                    </div>
                  </div>
                }
              </div>
            </div>

            <!-- ========== SECCIÓN 3: GESTIÓN DE TICKETS (SAT) - Solo si tiene módulo ========== -->
            @if (hasTicketsModule()) {
              <div class="rounded-xl border-2 border-cyan-200 dark:border-cyan-800 bg-cyan-50/50 dark:bg-cyan-950/20 p-4">
                <div class="flex items-center gap-3 mb-4">
                  <div class="w-10 h-10 rounded-full bg-cyan-100 dark:bg-cyan-900 flex items-center justify-center">
                    <svg class="w-5 h-5 text-cyan-600 dark:text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z"></path>
                    </svg>
                  </div>
                  <div>
                    <h2 class="text-lg font-bold text-cyan-800 dark:text-cyan-200">Gestión de Tickets</h2>
                    <p class="text-xs text-cyan-600 dark:text-cyan-400">Soporte y servicios técnicos</p>
                  </div>
                </div>
                
                <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                  @for (metric of ticketMetrics(); track metric.id) {
                    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 p-3 md:p-4 border border-cyan-100 dark:border-cyan-900/50">
                      <div class="flex items-start justify-between mb-1">
                        <div class="text-xl md:text-2xl">{{ metric.icon }}</div>
                      </div>
                      <div class="space-y-0.5">
                        <p class="text-[10px] md:text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                          {{ metric.title }}
                        </p>
                        <p class="text-lg md:text-xl font-bold text-gray-900 dark:text-white break-words"
                           [class.text-red-600]="metric.id === 'tickets-overdue' && metric.value !== '0' && metric.value !== '—'"
                           [class.dark:text-red-400]="metric.id === 'tickets-overdue' && metric.value !== '0' && metric.value !== '—'">
                          {{ metric.value }}
                        </p>
                        <p class="text-[10px] md:text-xs text-gray-500 dark:text-gray-400 truncate">
                          {{ metric.description }}
                        </p>
                      </div>
                    </div>
                  }
                  
                  <!-- Empty state for tickets -->
                  @if (ticketMetrics().length === 0 || ticketMetrics()[0].value === '—') {
                    <div class="col-span-full bg-white/50 dark:bg-gray-800/50 rounded-lg border border-dashed border-cyan-300 dark:border-cyan-700 p-6 text-center">
                      <p class="text-sm text-cyan-600 dark:text-cyan-400">
                        Aún no hay tickets registrados
                      </p>
                      <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Las métricas de tickets aparecerán aquí
                      </p>
                    </div>
                  }
                </div>
              </div>
            }

          
            <!-- No Data State -->
            @if (quoteHistoricalData().length === 0 && invoiceHistoricalData().length === 0) {
              <div class="bg-white dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 p-8 md:p-12 text-center">
                <div class="w-16 h-16 md:w-20 md:h-20 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mb-4 mx-auto">
                  <svg class="w-8 h-8 md:w-10 md:h-10 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
                  </svg>
                </div>
                <h3 class="text-base md:text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">No hay datos históricos</h3>
                <p class="text-sm text-gray-600 dark:text-gray-400">Los datos de evolución mensual aparecerán aquí conforme crees presupuestos y facturas</p>
              </div>
            }
          }
        </div>
      </div>
    </div>
  `,
  styleUrl: './dashboard-analytics.component.scss'
})
export class DashboardAnalyticsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private analyticsService = inject(AnalyticsService);
  private animationService = inject(AnimationService);
  private toastService = inject(ToastService);
  private modulesService = inject(SupabaseModulesService);
  sidebarService = inject(SidebarStateService);

  // Computed signals from service - Separados por tipo
  invoiceMetrics = this.analyticsService.getInvoiceMetrics;
  quoteMetrics = this.analyticsService.getQuoteMetrics;
  ticketMetrics = this.analyticsService.getTicketMetrics;
  quoteHistoricalData = this.analyticsService.getQuoteHistoricalTrend;
  invoiceHistoricalData = this.analyticsService.getInvoiceHistoricalTrend;
  ticketHistoricalData = this.analyticsService.getTicketHistoricalTrend;
  recurringMonthly = this.analyticsService.getRecurringMonthly;
  currentPipeline = this.analyticsService.getCurrentPipeline;
  isLoading = this.analyticsService.isLoading;
  error = signal<string | null>(null);

  // Module gating for tickets
  private allowedModuleKeys = computed<Set<string> | null>(() => {
    const mods = this.modulesService.modulesSignal();
    if (!mods) return null;
    return new Set<string>(mods.filter(m => m.enabled).map(m => m.key));
  });

  hasTicketsModule = computed(() => {
    const set = this.allowedModuleKeys();
    // moduloSAT or moduloSat (case-insensitive check)
    return !!set && (set.has('moduloSAT') || set.has('moduloSat'));
  });

  // ApexCharts configuration - Gráfico comparativo Facturas vs Presupuestos
  chartOptions = computed<ChartOptions>(() => {
    const quoteData = this.quoteHistoricalData();
    const invoiceData = this.invoiceHistoricalData();
    const recurring = this.recurringMonthly();
    const pipeline = this.currentPipeline();
    const isDark = document.documentElement.classList.contains('dark');

    // Responsive: limit months based on screen size
    const isMobile = window.innerWidth < 768;
    const maxMonths = isMobile ? 4 : 6;

    // Mes actual para usar pipeline actual + recurrentes
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Combinar datos por mes
    const allMonths = new Set([
      ...quoteData.map(d => d.month),
      ...invoiceData.map(d => d.month)
    ]);
    const sortedMonths = Array.from(allMonths).sort().slice(-maxMonths);

    // Crear series para el gráfico - Presupuestos (potencial) vs Facturas (confirmado)
    const quoteSeries = sortedMonths.map(month => {
      // Si es el mes actual, usar pipeline actual + recurrentes (incluye presupuestos de meses anteriores que siguen pendientes)
      if (month === currentMonth) {
        const pipelineValue = pipeline?.total || 0;
        const recurringValue = recurring?.total || 0;
        return pipelineValue + recurringValue;
      }
      // Para meses pasados: SIEMPRE 0 (los presupuestos pendientes se arrastran al mes actual)
      return 0;
    });

    const invoiceTotalSeries = sortedMonths.map(month => {
      const data = invoiceData.find(d => d.month === month);
      return data?.total || 0;
    });

    return {
      series: [
        {
          name: 'Facturado (con IVA)',
          data: invoiceTotalSeries
        },
        {
          name: 'Presupuestado',
          data: quoteSeries
        }
      ],
      chart: {
        type: 'bar',
        height: 360,
        stacked: false,
        toolbar: {
          show: false
        },
        background: 'transparent',
        fontFamily: 'inherit',
        animations: {
          enabled: true,
          easing: 'easeinout',
          speed: 800,
          animateGradually: {
            enabled: true,
            delay: 150
          }
        }
      },
      plotOptions: {
        bar: {
          horizontal: false,
          columnWidth: sortedMonths.length === 1 ? '40%' : '60%',
          borderRadius: 8,
          borderRadiusApplication: 'end',
          dataLabels: {
            position: 'top'
          }
        }
      },
      colors: ['#10b981', '#8b5cf6'],
      dataLabels: {
        enabled: false
      },
      xaxis: {
        categories: sortedMonths.map(m => this.formatMonthShort(m)),
        labels: {
          style: {
            colors: isDark ? '#9ca3af' : '#6b7280',
            fontSize: '12px',
            fontWeight: 500
          }
        },
        axisBorder: {
          show: true,
          color: isDark ? '#4b5563' : '#d1d5db'
        },
        axisTicks: {
          show: false
        }
      },
      yaxis: {
        labels: {
          formatter: (val: number) => this.formatCurrency(val),
          style: {
            colors: isDark ? '#9ca3af' : '#6b7280',
            fontSize: '12px',
            fontWeight: 500
          }
        }
      },
      grid: {
        show: true,
        borderColor: isDark ? '#374151' : '#e5e7eb',
        strokeDashArray: 0,
        position: 'back',
        xaxis: {
          lines: {
            show: false
          }
        },
        yaxis: {
          lines: {
            show: true
          }
        },
        padding: {
          top: 0,
          right: 10,
          bottom: 0,
          left: 10
        }
      },
      stroke: {
        show: true,
        width: 2,
        colors: ['transparent']
      },
      tooltip: {
        shared: true,
        intersect: false,
        theme: isDark ? 'dark' : 'light',
        style: {
          fontSize: '12px'
        },
        fixed: {
          enabled: true,
          position: 'topRight',
          offsetX: -10,
          offsetY: 0
        },
        custom: ({ series, seriesIndex, dataPointIndex, w }: any) => {
          const month = sortedMonths[dataPointIndex];
          const quotePoint = quoteData.find(d => d.month === month);
          const invoicePoint = invoiceData.find(d => d.month === month);

          // Si es el mes actual, usar pipeline actual + recurrentes
          const now = new Date();
          const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
          const isCurrentMonth = month === currentMonth;

          const bgColor = isDark ? '#1f2937' : '#ffffff';
          const textColor = isDark ? '#f3f4f6' : '#111827';
          const borderColor = isDark ? '#374151' : '#e5e7eb';

          // Calcular totales de presupuestos
          let quoteBaseCount = 0;
          let quoteBaseValue = 0;
          let recurringCount = 0;
          let recurringValue = 0;
          let totalQuoteCount = 0;
          let totalQuoteValue = 0;

          if (isCurrentMonth) {
            // Mes actual: usar pipeline actual + recurrentes
            quoteBaseCount = pipeline?.count || 0;
            quoteBaseValue = pipeline?.total || 0;
            recurringCount = recurring?.count || 0;
            recurringValue = recurring?.total || 0;
          } else {
            // Mes pasado: NO mostrar presupuestos (se arrastran al actual)
            quoteBaseCount = 0;
            quoteBaseValue = 0;
            recurringCount = 0;
            recurringValue = 0;
          }

          totalQuoteCount = quoteBaseCount + recurringCount;
          totalQuoteValue = quoteBaseValue + recurringValue;

          return `
            <div style="background: ${bgColor}; border: 1px solid ${borderColor}; border-radius: 8px; padding: 12px; min-width: 240px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
              <div style="font-weight: bold; font-size: 14px; margin-bottom: 10px; color: ${textColor}; border-bottom: 1px solid ${borderColor}; padding-bottom: 6px;">
                ${this.formatMonthLabel(month)}
              </div>
              
              <!-- Facturas -->
              <div style="margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px dashed ${borderColor};">
                <div style="font-weight: 600; font-size: 11px; color: #10b981; margin-bottom: 4px; text-transform: uppercase;">
                  💰 Facturas (Confirmado)
                </div>
                <div style="display: flex; justify-content: space-between; gap: 12px; font-size: 12px;">
                  <span style="color: ${isDark ? '#9ca3af' : '#6b7280'};">Base:</span>
                  <span style="font-weight: 600; color: #10b981;">${this.formatCurrency(invoicePoint?.subtotal || 0)}</span>
                </div>
                <div style="display: flex; justify-content: space-between; gap: 12px; font-size: 12px;">
                  <span style="color: ${isDark ? '#9ca3af' : '#6b7280'};">IVA:</span>
                  <span style="font-weight: 600; color: #f59e0b;">${this.formatCurrency(invoicePoint?.tax || 0)}</span>
                </div>
                <div style="display: flex; justify-content: space-between; gap: 12px; font-size: 12px; margin-top: 2px;">
                  <span style="color: ${isDark ? '#9ca3af' : '#6b7280'};">Total:</span>
                  <span style="font-weight: bold; color: ${textColor};">${this.formatCurrency(invoicePoint?.total || 0)}</span>
                </div>
              </div>
              
              <!-- Presupuestos (solo mes actual) o Métricas (meses pasados) -->
              ${isCurrentMonth ? `
              <div>
                <div style="font-weight: 600; font-size: 11px; color: #8b5cf6; margin-bottom: 4px; text-transform: uppercase;">
                  📄 Presupuestos (Potencial)
                </div>
                <div style="display: flex; justify-content: space-between; gap: 12px; font-size: 12px;">
                  <span style="color: ${isDark ? '#9ca3af' : '#6b7280'};">Cantidad:</span>
                  <span style="font-weight: 600; color: ${textColor};">${totalQuoteCount}</span>
                </div>
                ${recurringCount > 0 ? `
                <div style="display: flex; justify-content: space-between; gap: 12px; font-size: 11px; margin-left: 12px; color: ${isDark ? '#9ca3af' : '#6b7280'};">
                  <span>└─ Pendientes:</span>
                  <span>${quoteBaseCount}</span>
                </div>
                <div style="display: flex; justify-content: space-between; gap: 12px; font-size: 11px; margin-left: 12px; color: #f59e0b;">
                  <span>└─ 🔄 Recurrentes:</span>
                  <span style="font-weight: 600;">${recurringCount}</span>
                </div>
                ` : ''}
                <div style="display: flex; justify-content: space-between; gap: 12px; font-size: 12px; margin-top: 4px;">
                  <span style="color: ${isDark ? '#9ca3af' : '#6b7280'};">Valor:</span>
                  <span style="font-weight: 600; color: #8b5cf6;">${this.formatCurrency(totalQuoteValue)}</span>
                </div>
                ${recurringValue > 0 ? `
                <div style="display: flex; justify-content: space-between; gap: 12px; font-size: 11px; margin-left: 12px; color: ${isDark ? '#9ca3af' : '#6b7280'};">
                  <span>└─ Pendientes:</span>
                  <span>${this.formatCurrency(quoteBaseValue)}</span>
                </div>
                <div style="display: flex; justify-content: space-between; gap: 12px; font-size: 11px; margin-left: 12px; color: #f59e0b;">
                  <span>└─ 🔄 Recurrentes:</span>
                  <span style="font-weight: 600;">${this.formatCurrency(recurringValue)}</span>
                </div>
                ` : ''}
              </div>
              ` : `
              <div>
                <div style="font-weight: 600; font-size: 11px; color: #6b7280; margin-bottom: 4px; text-transform: uppercase;">
                  📊 Métricas del Mes
                </div>
                <div style="display: flex; justify-content: space-between; gap: 12px; font-size: 12px;">
                  <span style="color: ${isDark ? '#9ca3af' : '#6b7280'};">Facturas emitidas:</span>
                  <span style="font-weight: 600; color: ${textColor};">${invoicePoint?.count || 0}</span>
                </div>
                <div style="display: flex; justify-content: space-between; gap: 12px; font-size: 12px;">
                  <span style="color: ${isDark ? '#9ca3af' : '#6b7280'};">Tasa cobro:</span>
                  <span style="font-weight: 600; color: #10b981;">${invoicePoint?.count ? '100%' : '-'}</span>
                </div>
              </div>
              `}
            </div>
          `;
        }
      },
      legend: {
        position: 'bottom',
        horizontalAlign: 'center',
        fontSize: '12px',
        fontWeight: 400,
        offsetY: 10,
        labels: {
          colors: isDark ? '#9ca3af' : '#6b7280'
        },
        markers: {
          width: 16,
          height: 16,
          radius: 2,
          offsetX: -5
        },
        itemMargin: {
          horizontal: 12,
          vertical: 0
        }
      },
      theme: {
        mode: isDark ? 'dark' : 'light'
      }
    };
  });

  ngOnInit() {
    // Load modules for conditional rendering
    this.modulesService.fetchEffectiveModules().subscribe();

    // Subscribe to service error
    const serviceError = this.analyticsService.getError();
    if (serviceError) {
      this.error.set(serviceError);
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  refreshData() {
    this.error.set(null);
    this.analyticsService.refreshAnalytics().then(() => {
      this.toastService.success('Analíticas', 'Datos actualizados correctamente');
      const serviceError = this.analyticsService.getError();
      if (serviceError) {
        this.error.set(serviceError);
      }
    }).catch(err => {
      this.error.set(err?.message || 'Error al actualizar datos');
      this.toastService.error('Error', 'No se pudieron actualizar las analíticas');
    });
  }

  clearError() {
    this.error.set(null);
  }

  formatMonthLabel(month: string): string {
    // month format: YYYY-MM
    try {
      const [year, m] = month.split('-');
      const date = new Date(Number(year), Number(m) - 1, 1);
      return new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(date);
    } catch {
      return month;
    }
  }

  formatMonthShort(month: string): string {
    // month format: YYYY-MM - show abbreviated month only
    try {
      const [year, m] = month.split('-');
      const date = new Date(Number(year), Number(m) - 1, 1);

      // Si es el mes actual, mostrar "actual"
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      if (month === currentMonth) {
        return 'actual';
      }

      return new Intl.DateTimeFormat('es-ES', { month: 'short' }).format(date);
    } catch {
      return month;
    }
  }

  formatCurrency(value: number): string {
    try {
      return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value);
    } catch {
      return `€${Math.round(value).toLocaleString('es-ES')}`;
    }
  }
}
