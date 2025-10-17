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
    <div class="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6">
      <div>
        <!-- Header -->
        <div class="mb-8">
          <h1 class="text-3xl font-bold text-gray-900 mb-2">📊 Panel de Análisis</h1>
          <p class="text-gray-600">Dashboard empresarial con métricas en tiempo real</p>
        </div>

        <!-- Metrics Cards -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <div 
            *ngFor="let metric of dashboardMetrics(); let i = index"
            class="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1">
            
            <div class="flex items-center justify-between mb-4">
              <div class="text-3xl">{{ metric.icon }}</div>
              <div class="text-right">
                <p class="text-sm text-gray-500">{{ metric.title }}</p>
                <p class="text-2xl font-bold text-gray-900">{{ metric.value }}</p>
              </div>
            </div>
            
            <div class="flex items-center text-sm">
              <span 
                [class]="metric.changeType === 'increase' ? 'text-green-600' : metric.changeType === 'decrease' ? 'text-red-600' : 'text-gray-600'"
                class="flex items-center">
                <span class="mr-1">
                  {{ metric.changeType === 'increase' ? '↗️' : metric.changeType === 'decrease' ? '↘️' : '➡️' }}
                </span>
                {{ metric.change }}%
              </span>
              <span class="text-gray-500 ml-2">vs mes anterior</span>
            </div>
          </div>
        </div>

        <!-- Charts Section -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <!-- Ticket Trends -->
          <div class="bg-white rounded-xl shadow-lg p-6">
            <h3 class="text-lg font-semibold text-gray-900 mb-4">📈 Tendencia de Tickets</h3>
            <div class="h-64 flex items-end justify-between space-x-2">
              <div 
                *ngFor="let point of ticketChartData(); let i = index"
                class="bg-gradient-to-t from-blue-500 to-blue-300 rounded-t-lg flex-1 relative group cursor-pointer transition-all duration-300 hover:from-blue-600 hover:to-blue-400"
                [style.height.%]="(point.value / getMaxValue(ticketChartData())) * 100">
                
                <div class="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                  {{ point.value }}
                </div>
                
                <div class="absolute -bottom-6 left-1/2 transform -translate-x-1/2 text-xs text-gray-600">
                  {{ point.label.slice(0, 3) }}
                </div>
              </div>
            </div>
          </div>

          <!-- Customer Growth -->
          <div class="bg-white rounded-xl shadow-lg p-6">
            <h3 class="text-lg font-semibold text-gray-900 mb-4">👥 Crecimiento de Clientes</h3>
            <div class="h-64 flex items-end justify-between space-x-2">
              <div 
                *ngFor="let point of customerChartData(); let i = index"
                class="bg-gradient-to-t from-green-500 to-green-300 rounded-t-lg flex-1 relative group cursor-pointer transition-all duration-300 hover:from-green-600 hover:to-green-400"
                [style.height.%]="(point.value / getMaxValue(customerChartData())) * 100">
                
                <div class="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                  {{ point.value }}
                </div>
                
                <div class="absolute -bottom-6 left-1/2 transform -translate-x-1/2 text-xs text-gray-600">
                  {{ point.label.slice(0, 3) }}
                </div>
              </div>
            </div>
          </div>

          <!-- Priority Distribution -->
          <div class="bg-white rounded-xl shadow-lg p-6">
            <h3 class="text-lg font-semibold text-gray-900 mb-4">⚡ Distribución por Prioridad</h3>
            <div class="space-y-4">
              <div *ngFor="let item of priorityData()" class="flex items-center">
                <div class="w-4 h-4 rounded-full mr-3" [style.background-color]="item.color"></div>
                <div class="flex-1">
                  <div class="flex justify-between items-center mb-1">
                    <span class="text-sm font-medium text-gray-700">{{ item.label }}</span>
                    <span class="text-sm text-gray-600">{{ item.value }}%</span>
                  </div>
                  <div class="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      class="h-2 rounded-full transition-all duration-500"
                      [style.background-color]="item.color"
                      [style.width.%]="item.value">
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Revenue Chart -->
          <div class="bg-white rounded-xl shadow-lg p-6">
            <h3 class="text-lg font-semibold text-gray-900 mb-4">💰 Ingresos Mensuales</h3>
            <div class="h-64 flex items-end justify-between space-x-2">
              <div 
                *ngFor="let point of revenueChartData(); let i = index"
                class="bg-gradient-to-t from-purple-500 to-purple-300 rounded-t-lg flex-1 relative group cursor-pointer transition-all duration-300 hover:from-purple-600 hover:to-purple-400"
                [style.height.%]="(point.value / getMaxValue(revenueChartData())) * 100">
                
                <div class="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                  {{ '$' + point.value.toLocaleString() }}
                </div>
                
                <div class="absolute -bottom-6 left-1/2 transform -translate-x-1/2 text-xs text-gray-600">
                  {{ point.label.slice(0, 3) }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Real-time Updates Indicator -->
        <div class="flex items-center justify-center">
          <div class="bg-white rounded-lg shadow-md px-4 py-2 flex items-center space-x-2">
            <div class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span class="text-sm text-gray-600">Actualizando en tiempo real</span>
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

  ngOnInit() {
    this.showWelcomeMessage();
    // this.animationService.fadeInUp('.grid > div', 150); // Commented out until AnimationService is available
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private showWelcomeMessage() {
    this.toastService.success(
      'Dashboard',
      'Panel de análisis cargado exitosamente'
    );
  }

  // Chart data methods
  ticketChartData() {
    return [
      { label: 'Enero', value: 45 },
      { label: 'Febrero', value: 52 },
      { label: 'Marzo', value: 48 },
      { label: 'Abril', value: 61 },
      { label: 'Mayo', value: 55 },
      { label: 'Junio', value: 67 }
    ];
  }

  customerChartData() {
    return [
      { label: 'Enero', value: 120 },
      { label: 'Febrero', value: 135 },
      { label: 'Marzo', value: 148 },
      { label: 'Abril', value: 162 },
      { label: 'Mayo', value: 178 },
      { label: 'Junio', value: 195 }
    ];
  }

  priorityData() {
    return [
      { label: 'Alta', value: 35, color: '#ef4444' },
      { label: 'Media', value: 45, color: '#f59e0b' },
      { label: 'Baja', value: 20, color: '#10b981' }
    ];
  }

  revenueChartData() {
    return [
      { label: 'Enero', value: 12500 },
      { label: 'Febrero', value: 14200 },
      { label: 'Marzo', value: 13800 },
      { label: 'Abril', value: 16500 },
      { label: 'Mayo', value: 15900 },
      { label: 'Junio', value: 18200 }
    ];
  }

  getMaxValue(data: any[]): number {
    return Math.max(...data.map(item => item.value));
  }
}
