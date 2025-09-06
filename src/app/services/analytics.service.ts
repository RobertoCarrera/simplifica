import { Injectable, signal, computed } from '@angular/core';
import { 
  DashboardMetric, 
  TicketAnalytics, 
  CustomerAnalytics, 
  RevenueAnalytics,
  AnalyticsFilter,
  ChartData,
  RealtimeMetric 
} from '../models/analytics.interface';

@Injectable({
  providedIn: 'root'
})
export class AnalyticsService {
  // Analytics data signals
  private ticketData = signal<TicketAnalytics>({
    total: 342,
    pending: 89,
    inProgress: 156,
    resolved: 97,
    trend: [45, 52, 48, 61, 58, 71, 65],
    priorityDistribution: {
      high: 89,
      medium: 156,
      low: 97
    }
  });

  private customerData = signal<CustomerAnalytics>({
    total: 1847,
    active: 1654,
    new: 23,
    growth: [1567, 1634, 1689, 1742, 1798, 1847],
    topCustomers: [
      { id: 1, name: 'TechCorp Solutions', ticketCount: 45, revenue: 28500 },
      { id: 2, name: 'Innovatech Ltd', ticketCount: 38, revenue: 24800 },
      { id: 3, name: 'Digital Systems', ticketCount: 32, revenue: 22100 },
      { id: 4, name: 'Smart Business Co', ticketCount: 28, revenue: 19200 },
      { id: 5, name: 'Future Tech Inc', ticketCount: 25, revenue: 17800 }
    ]
  });

  private revenueData = signal<RevenueAnalytics>({
    total: 2847000,
    monthly: 237250,
    quarterly: [540000, 675000, 825000, 807000],
    growth: 12.5
  });

  private currentFilter = signal<AnalyticsFilter>({
    dateRange: 'month',
    groupBy: 'day'
  });

  // Computed analytics
  getMetrics = computed((): DashboardMetric[] => [
    {
      id: 'total-tickets',
      title: 'Total Tickets',
      value: this.ticketData().total.toString(),
      change: 12.5,
      changeType: 'increase',
      icon: '🎫',
      color: '#3b82f6',
      description: 'Tickets activos en el sistema'
    },
    {
      id: 'pending-tickets',
      title: 'Pendientes',
      value: this.ticketData().pending.toString(),
      change: -5.2,
      changeType: 'decrease',
      icon: '⏳',
      color: '#f59e0b',
      description: 'Tickets esperando atención'
    },
    {
      id: 'in-progress',
      title: 'En Progreso',
      value: this.ticketData().inProgress.toString(),
      change: 8.1,
      changeType: 'increase',
      icon: '🔧',
      color: '#10b981',
      description: 'Tickets siendo trabajados'
    },
    {
      id: 'total-customers',
      title: 'Clientes',
      value: this.customerData().total.toString(),
      change: 15.3,
      changeType: 'increase',
      icon: '👥',
      color: '#8b5cf6',
      description: 'Clientes registrados'
    },
    {
      id: 'monthly-revenue',
      title: 'Ingresos Mes',
      value: `$${(this.revenueData().monthly / 1000).toFixed(0)}K`,
      change: 18.7,
      changeType: 'increase',
      icon: '💰',
      color: '#06b6d4',
      description: 'Ingresos del mes actual'
    },
    {
      id: 'resolution-rate',
      title: 'Tasa Resolución',
      value: '92%',
      change: 2.1,
      changeType: 'increase',
      icon: '✅',
      color: '#84cc16',
      description: 'Tickets resueltos exitosamente'
    }
  ]);

  ticketAnalytics = computed(() => this.ticketData());
  customerAnalytics = computed(() => this.customerData());
  revenueAnalytics = computed(() => this.revenueData());

  // Real-time metrics
  private realtimeMetrics = signal<RealtimeMetric[]>([
    { timestamp: new Date(), value: 342, metric: 'tickets' },
    { timestamp: new Date(), value: 1847, metric: 'customers' },
    { timestamp: new Date(), value: 237250, metric: 'revenue' }
  ]);

  getRealtimeMetrics = computed(() => this.realtimeMetrics());

  constructor() {
    // Start real-time updates
    this.startRealtimeUpdates();
  }

  updateFilter(filter: Partial<AnalyticsFilter>): void {
    this.currentFilter.update(current => ({ ...current, ...filter }));
    this.refreshData();
  }

  refreshData(): void {
    // Simulate data refresh with slight variations
    this.ticketData.update(current => ({
      ...current,
      total: current.total + Math.floor(Math.random() * 10) - 5,
      pending: Math.max(0, current.pending + Math.floor(Math.random() * 6) - 3),
      inProgress: Math.max(0, current.inProgress + Math.floor(Math.random() * 8) - 4)
    }));

    this.customerData.update(current => ({
      ...current,
      total: current.total + Math.floor(Math.random() * 5),
      new: Math.floor(Math.random() * 30) + 10
    }));

    this.revenueData.update(current => ({
      ...current,
      monthly: current.monthly + Math.floor(Math.random() * 10000) - 5000
    }));
  }

  private startRealtimeUpdates(): void {
    // Update metrics every 5 seconds
    setInterval(() => {
      const newMetric: RealtimeMetric = {
        timestamp: new Date(),
        value: this.ticketData().total,
        metric: 'tickets'
      };

      this.realtimeMetrics.update(current => {
        const updated = [newMetric, ...current];
        return updated.slice(0, 50); // Keep last 50 metrics
      });

      // Randomly update some data
      if (Math.random() > 0.7) {
        this.refreshData();
      }
    }, 5000);
  }

  // Chart data getters
  getTicketTrendData(): ChartData {
    return {
      labels: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
      datasets: [{
        label: 'Tickets',
        data: this.ticketData().trend,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)'
      }]
    };
  }

  getCustomerGrowthData(): ChartData {
    return {
      labels: ['Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
      datasets: [{
        label: 'Clientes',
        data: this.customerData().growth,
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)'
      }]
    };
  }

  getRevenueData(): ChartData {
    return {
      labels: ['Q1', 'Q2', 'Q3', 'Q4'],
      datasets: [{
        label: 'Ingresos ($)',
        data: this.revenueData().quarterly,
        borderColor: '#8b5cf6',
        backgroundColor: 'rgba(139, 92, 246, 0.1)'
      }]
    };
  }

  getPriorityData(): ChartData {
    const distribution = this.ticketData().priorityDistribution;
    return {
      labels: ['Alta', 'Media', 'Baja'],
      datasets: [{
        label: 'Tickets por Prioridad',
        data: [distribution.high, distribution.medium, distribution.low],
        backgroundColor: ['#ef4444', '#f59e0b', '#10b981']
      }]
    };
  }
}
