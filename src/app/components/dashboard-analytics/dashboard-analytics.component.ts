import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { NgApexchartsModule } from 'ng-apexcharts';
import { ApexAxisChartSeries, ApexChart, ApexXAxis, ApexYAxis, ApexDataLabels, ApexTooltip, ApexStroke, ApexLegend, ApexGrid, ApexPlotOptions, ApexTheme } from 'ng-apexcharts';
import { AnalyticsService } from '../../services/analytics.service';
import { AnimationService } from '../../services/animation.service';
import { SidebarStateService } from '../../services/sidebar-state.service';
import { ToastService } from '../../services/toast.service';

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
  imports: [CommonModule, NgApexchartsModule],
  template: `
    <div class="container-fluid h-full flex flex-col overflow-hidden pb-20 md:pb-8 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100"
      [attr.data-sidebar-collapsed]="sidebarService.isCollapsed() ? '1' : '0'">
      
      <!-- Inner wrapper: contains header and content -->
      <div class="flex-1 flex flex-col p-2 overflow-hidden">
        <!-- Header -->
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 md:p-6 mb-4 md:mb-6 border border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div class="flex justify-between items-center flex-wrap gap-4">
            <div>
              <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
                </svg>
                Analíticas
              </h1>
              <p class="text-gray-600 dark:text-gray-300 mt-1 hidden md:block">Métricas y estadísticas de presupuestos</p>
            </div>
            
            <button
              (click)="refreshData()"
              [disabled]="isLoading()"
              class="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors duration-200 inline-flex items-center gap-2 shadow-sm text-sm"
            >
              <svg class="w-4 h-4" [class.animate-spin]="isLoading()" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
              </svg>
              <span class="hidden sm:inline">Actualizar</span>
            </button>
          </div>
        </div>

        <!-- Scrollable content area -->
        <div class="flex-1 overflow-auto">
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
          <div class="space-y-4 md:space-y-6">
            <!-- Metrics skeleton -->
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
              @for (i of [1,2,3,4]; track i) {
                <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 md:p-6 border border-gray-200 dark:border-gray-700 animate-pulse">
                  <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-3"></div>
                  <div class="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mb-2"></div>
                  <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
                </div>
              }
            </div>
            <!-- Chart skeleton -->
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 md:p-6 border border-gray-200 dark:border-gray-700 animate-pulse">
              <div class="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-4"></div>
              <div class="h-64 bg-gray-200 dark:bg-gray-700 rounded"></div>
            </div>
          </div>
        }

        <!-- Content -->
        @if (!isLoading()) {
          <!-- Metrics Cards -->
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            @for (metric of dashboardMetrics(); track metric.id) {
              <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:shadow-md transition-all duration-200 p-4 md:p-6 border border-gray-200 dark:border-gray-700">
                <div class="flex items-start justify-between mb-2">
                  <div class="text-2xl md:text-3xl">{{ metric.icon }}</div>
                </div>
                <div class="space-y-1">
                  <p class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    {{ metric.title }}
                  </p>
                  <p class="text-xl md:text-2xl font-bold text-gray-900 dark:text-white break-words">
                    {{ metric.value }}
                  </p>
                  <p class="text-xs text-gray-500 dark:text-gray-400">
                    {{ metric.description }}
                  </p>
                </div>
              </div>
            }
          </div>

          <!-- Historical Trend Chart - ApexCharts Professional -->
          @if (historicalData().length > 0) {
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 md:p-6 border border-gray-200 dark:border-gray-700 mt-4 md:mt-6">
              <h3 class="text-base md:text-lg font-semibold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"></path>
                </svg>
                Evolución Mensual (últimos 6 meses)
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

          <!-- No Data State -->
          @if (historicalData().length === 0) {
            <div class="bg-white dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 p-8 md:p-12 text-center">
              <div class="w-16 h-16 md:w-20 md:h-20 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mb-4 mx-auto">
                <svg class="w-8 h-8 md:w-10 md:h-10 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
                </svg>
              </div>
              <h3 class="text-base md:text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">No hay datos históricos</h3>
              <p class="text-sm text-gray-600 dark:text-gray-400">Los datos de evolución mensual aparecerán aquí conforme crees presupuestos</p>
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
  sidebarService = inject(SidebarStateService);

  // Computed signals from service
  dashboardMetrics = this.analyticsService.getMetrics;
  historicalData = this.analyticsService.getHistoricalTrend;
  isLoading = this.analyticsService.isLoading;
  error = signal<string | null>(null);

  // ApexCharts configuration as computed signal
  chartOptions = computed<ChartOptions>(() => {
    const data = this.historicalData();
    const isDark = document.documentElement.classList.contains('dark');
    
    // Responsive: limit months based on screen size
    // Mobile: 4 months, Tablet/Desktop: 6 months
    const isMobile = window.innerWidth < 768;
    const maxMonths = isMobile ? 4 : 6;
    const limitedData = data.slice(-maxMonths);
    
    return {
      series: [
        {
          name: 'Base Imponible',
          data: limitedData.map(d => d.subtotal)
        },
        {
          name: 'IVA',
          data: limitedData.map(d => d.tax)
        }
      ],
      chart: {
        type: 'bar',
        height: 320,
        stacked: true,
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
          columnWidth: '60%',
          borderRadius: 8,
          borderRadiusApplication: 'end',
          dataLabels: {
            position: 'top'
          }
        }
      },
      colors: ['#10b981', '#f59e0b'],
      dataLabels: {
        enabled: true,
        formatter: (val: number, opt: any) => {
          // Show count only on the top series (IVA)
          if (opt.seriesIndex === 1) {
            const dataIndex = opt.dataPointIndex;
            const count = limitedData[dataIndex]?.count || 0;
            return count.toString();
          }
          return '';
        },
        offsetY: -20,
        style: {
          fontSize: '12px',
          fontWeight: 'bold',
          colors: [isDark ? '#60a5fa' : '#3b82f6']
        },
        background: {
          enabled: true,
          foreColor: '#ffffff',
          padding: 4,
          borderRadius: 4,
          borderWidth: 0,
          opacity: 1,
          dropShadow: {
            enabled: false
          }
        }
      },
      xaxis: {
        categories: limitedData.map(d => this.formatMonthShort(d.month)),
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
        width: 0,
        colors: ['transparent']
      },
      tooltip: {
        shared: true,
        intersect: false,
        theme: isDark ? 'dark' : 'light',
        style: {
          fontSize: '12px'
        },
        y: {
          formatter: (val: number) => this.formatCurrency(val)
        },
        custom: ({ series, seriesIndex, dataPointIndex, w }: any) => {
          const point = limitedData[dataPointIndex];
          if (!point) return '';
          
          const bgColor = isDark ? '#1f2937' : '#ffffff';
          const textColor = isDark ? '#f3f4f6' : '#111827';
          const borderColor = isDark ? '#374151' : '#e5e7eb';
          
          return `
            <div style="background: ${bgColor}; border: 1px solid ${borderColor}; border-radius: 8px; padding: 12px; min-width: 200px;">
              <div style="font-weight: bold; font-size: 14px; margin-bottom: 8px; color: ${textColor}; border-bottom: 1px solid ${borderColor}; padding-bottom: 6px;">
                ${this.formatMonthLabel(point.month)}
              </div>
              <div style="display: flex; flex-direction: column; gap: 6px;">
                <div style="display: flex; justify-content: space-between; gap: 16px;">
                  <span style="color: ${isDark ? '#9ca3af' : '#6b7280'};">Presupuestos:</span>
                  <span style="font-weight: 600; color: ${textColor};">${point.count}</span>
                </div>
                <div style="display: flex; justify-content: space-between; gap: 16px;">
                  <span style="color: ${isDark ? '#9ca3af' : '#6b7280'};">Base:</span>
                  <span style="font-weight: 600; color: #10b981;">${this.formatCurrency(point.subtotal)}</span>
                </div>
                <div style="display: flex; justify-content: space-between; gap: 16px;">
                  <span style="color: ${isDark ? '#9ca3af' : '#6b7280'};">IVA:</span>
                  <span style="font-weight: 600; color: #f59e0b;">${this.formatCurrency(point.tax)}</span>
                </div>
                <div style="display: flex; justify-content: space-between; gap: 16px; padding-top: 6px; border-top: 1px solid ${borderColor}; margin-top: 2px;">
                  <span style="color: ${isDark ? '#9ca3af' : '#6b7280'};">Total:</span>
                  <span style="font-weight: bold; color: ${textColor};">${this.formatCurrency(point.total)}</span>
                </div>
              </div>
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
          horizontal: 16,
          vertical: 0
        }
      },
      theme: {
        mode: isDark ? 'dark' : 'light'
      }
    };
  });

  ngOnInit() {
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
      return new Intl.DateTimeFormat('es-ES', { month: 'short', year: 'numeric' }).format(date);
    } catch {
      return month;
    }
  }

  formatMonthShort(month: string): string {
    // month format: YYYY-MM - show abbreviated month only
    try {
      const [year, m] = month.split('-');
      const date = new Date(Number(year), Number(m) - 1, 1);
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
