import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { AnalyticsService } from '../../services/analytics.service';
import { AnimationService } from '../../services/animation.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-dashboard-analytics',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
      <div class="max-w-7xl mx-auto">
        <!-- Header -->
        <div class="mb-6">
          <h1 class="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-2">
            📊 Panel de Análisis
          </h1>
          <p class="text-sm md:text-base text-gray-600 dark:text-gray-400">
            Métricas de presupuestos calculadas en servidor
          </p>
        </div>

        <!-- Loading / Error State -->
        <div *ngIf="isLoading()" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-6">
          <div *ngFor="let i of [1,2,3,4]" 
               class="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 animate-pulse">
            <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-4"></div>
            <div class="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
          </div>
        </div>

        <div *ngIf="error()" class="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
          <p class="text-sm text-red-800 dark:text-red-200">⚠️ {{ error() }}</p>
        </div>

        <!-- Metrics Cards -->
        <div *ngIf="!isLoading()" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-6">
          <div 
            *ngFor="let metric of dashboardMetrics()"
            class="bg-white dark:bg-gray-800 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 p-6 border border-gray-100 dark:border-gray-700">
            
            <div class="flex items-start justify-between mb-3">
              <div class="text-3xl">{{ metric.icon }}</div>
            </div>
            
            <div class="space-y-1">
              <p class="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">
                {{ metric.title }}
              </p>
              <p class="text-2xl font-bold text-gray-900 dark:text-white">
                {{ metric.value }}
              </p>
              <p class="text-xs text-gray-500 dark:text-gray-400">
                {{ metric.description }}
              </p>
            </div>
          </div>
        </div>

        <!-- Historical Trend Chart -->
        <div *ngIf="!isLoading() && historicalData().length > 0" 
             class="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border border-gray-100 dark:border-gray-700 mb-6">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            📈 Evolución Mensual (últimos 6 meses)
          </h3>
          <div class="h-64 flex items-end justify-between space-x-2">
            <div 
              *ngFor="let point of historicalData()"
              class="bg-gradient-to-t from-blue-500 to-blue-300 dark:from-blue-600 dark:to-blue-400 rounded-t-lg flex-1 relative group cursor-pointer transition-all duration-300 hover:from-blue-600 hover:to-blue-400"
              [style.height.%]="getBarHeight(point.total)">
              
              <div class="absolute -top-20 left-1/2 transform -translate-x-1/2 bg-gray-900 dark:bg-gray-700 text-white text-xs px-3 py-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-lg">
                <div class="font-semibold">{{ formatMonthLabel(point.month) }}</div>
                <div class="text-gray-300">Total: {{ formatCurrency(point.total) }}</div>
                <div class="text-gray-300">Presupuestos: {{ point.count }}</div>
              </div>
              
              <div class="absolute -bottom-8 left-1/2 transform -translate-x-1/2 text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
                {{ formatMonthLabel(point.month) }}
              </div>
            </div>
          </div>
        </div>

        <!-- Real-time Indicator -->
        <div class="flex items-center justify-center">
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm px-4 py-2 flex items-center space-x-2 border border-gray-100 dark:border-gray-700">
            <div class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span class="text-xs text-gray-600 dark:text-gray-400">
              Datos actualizados desde servidor
            </span>
          </div>
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

  // Computed signals from service
  dashboardMetrics = this.analyticsService.getMetrics;
  historicalData = this.analyticsService.getHistoricalTrend;
  isLoading = this.analyticsService.isLoading;
  error = this.analyticsService.getError;

  ngOnInit() {
    this.showWelcomeMessage();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private showWelcomeMessage() {
    this.toastService.success(
      'Dashboard',
      'Panel de análisis cargado'
    );
  }

  getBarHeight(value: number): number {
    const data = this.historicalData();
    if (data.length === 0) return 0;
    const max = Math.max(...data.map(d => d.total), 1);
    return (value / max) * 100;
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

  formatCurrency(value: number): string {
    try {
      return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value);
    } catch {
      return `€${Math.round(value).toLocaleString('es-ES')}`;
    }
  }
}
