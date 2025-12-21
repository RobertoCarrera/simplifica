import { Injectable, signal, computed } from '@angular/core';
import { 
  DashboardMetric, 
  TicketAnalytics, 
  CustomerAnalytics, 
  RevenueAnalytics,
  ChartData,
  RealtimeMetric,
  AnalyticsFilter
} from './analytics.interface';

@Injectable({
  providedIn: 'root'
})
export class AnalyticsService {
  private rawData = signal<any[]>([]);
  private filter = signal<AnalyticsFilter>({
    dateRange: {
      start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
      end: new Date()
    },
    categories: [],
    groupBy: 'day'
  });

  private realtimeMetrics = signal<RealtimeMetric[]>([]);

  // Computed analytics
  ticketAnalytics = computed(() => this.calculateTicketAnalytics());
  customerAnalytics = computed(() => this.calculateCustomerAnalytics());
  revenueAnalytics = computed(() => this.calculateRevenueAnalytics());
  
  // Chart data computed
  ticketTrendChart = computed(() => this.getTicketTrendChart());
  customerGrowthChart = computed(() => this.getCustomerGrowthChart());
  revenueChart = computed(() => this.getRevenueChart());
  priorityDistributionChart = computed(() => this.getPriorityDistributionChart());

  constructor() {
    this.generateMockData();
    this.startRealtimeUpdates();
  }

  // Public methods
  updateFilter(newFilter: Partial<AnalyticsFilter>) {
    this.filter.update(current => ({ ...current, ...newFilter }));
  }

  refreshData() {
    this.generateMockData();
  }

  getMetrics(): DashboardMetric[] {
    const ticketData = this.ticketAnalytics();
    const customerData = this.customerAnalytics();
    const revenueData = this.revenueAnalytics();

    return [
      {
        id: 'total-tickets',
        title: 'Total Tickets',
        value: ticketData.totalTickets,
        change: 12.5,
        changeType: 'increase',
        icon: '🎫',
        color: '#6366f1',
        description: 'Tickets este mes'
      },
      {
        id: 'customer-satisfaction',
        title: 'Satisfacción',
        value: `${ticketData.customerSatisfaction}%`,
        change: 3.2,
        changeType: 'increase',
        icon: '⭐',
        color: '#10b981',
        description: 'Promedio de calificaciones'
      },
      {
        id: 'total-customers',
        title: 'Clientes Activos',
        value: customerData.activeCustomers,
        change: 8.1,
        changeType: 'increase',
        icon: '👥',
        color: '#f59e0b',
        description: 'Clientes con actividad'
      },
      {
        id: 'monthly-revenue',
        title: 'Ingresos del Mes',
        value: `$${revenueData.monthlyRevenue.toLocaleString()}`,
        change: 15.3,
        changeType: 'increase',
        icon: '💰',
        color: '#ef4444',
        description: 'Ingresos generados'
      },
      {
        id: 'avg-resolution',
        title: 'Tiempo Resolución',
        value: `${ticketData.avgResolutionTime}h`,
        change: -2.1,
        changeType: 'decrease',
        icon: '⏱️',
        color: '#8b5cf6',
        description: 'Promedio de resolución'
      },
      {
        id: 'growth-rate',
        title: 'Crecimiento',
        value: `${revenueData.revenueGrowth}%`,
        change: 4.7,
        changeType: 'increase',
        icon: '📈',
        color: '#06b6d4',
        description: 'Crecimiento mensual'
      }
    ];
  }

  getRealtimeData() {
    return this.realtimeMetrics.asReadonly();
  }

  // Private calculation methods
  private calculateTicketAnalytics(): TicketAnalytics {
    return {
      totalTickets: 2847,
      openTickets: 342,
      closedTickets: 2398,
      inProgressTickets: 107,
      avgResolutionTime: 18.6,
      customerSatisfaction: 94.2,
      ticketsByPriority: {
        'Alta': 89,
        'Media': 156,
        'Baja': 97
      },
      ticketsByCategory: {
        'Soporte Técnico': 142,
        'Instalación': 98,
        'Mantenimiento': 67,
        'Consulta': 35
      },
      weeklyTrend: [45, 52, 48, 61, 58, 71, 65],
      monthlyTrend: [520, 634, 689, 756, 821, 934, 1047, 1156, 1289, 1387, 1456, 1523]
    };
  }

  private calculateCustomerAnalytics(): CustomerAnalytics {
    return {
      totalCustomers: 1847,
      activeCustomers: 1623,
      newCustomers: 89,
      churnRate: 2.1,
      avgTicketsPerCustomer: 1.54,
      topCustomers: [
        { id: '1', name: 'TechCorp Solutions', ticketCount: 45, revenue: 125000 },
        { id: '2', name: 'Digital Innovations', ticketCount: 38, revenue: 98000 },
        { id: '3', name: 'Future Systems', ticketCount: 32, revenue: 87000 },
        { id: '4', name: 'Smart Business', ticketCount: 29, revenue: 76000 },
        { id: '5', name: 'Cloud Dynamics', ticketCount: 24, revenue: 65000 }
      ]
    };
  }

  private calculateRevenueAnalytics(): RevenueAnalytics {
    return {
      totalRevenue: 2847000,
      monthlyRevenue: 284700,
      projectedRevenue: 3200000,
      revenueGrowth: 15.3,
      revenueByService: {
        'Soporte Técnico': 145000,
        'Instalación': 89000,
        'Mantenimiento': 67000,
        'Consultoría': 45000
      },
      monthlyTrend: [180000, 195000, 210000, 225000, 240000, 258000, 275000, 284700],
      quarterlyComparison: [540000, 675000, 825000, 807000]
    };
  }

  // Chart data methods
  private getTicketTrendChart(): ChartData {
    const data = this.ticketAnalytics();
    return {
      labels: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
      datasets: [
        {
          label: 'Tickets Creados',
          data: data.weeklyTrend,
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99, 102, 241, 0.1)',
          fill: true,
          tension: 0.4
        }
      ]
    };
  }

  private getCustomerGrowthChart(): ChartData {
    const data = this.customerAnalytics();
    return {
      labels: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
      datasets: [
        {
          label: 'Clientes Totales',
          data: [1200, 1285, 1356, 1423, 1498, 1567, 1634, 1689, 1742, 1798, 1823, 1847],
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          fill: true,
          tension: 0.4
        },
        {
          label: 'Clientes Activos',
          data: [1080, 1156, 1223, 1289, 1345, 1398, 1456, 1501, 1548, 1589, 1612, 1623],
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245, 158, 11, 0.1)',
          fill: true,
          tension: 0.4
        }
      ]
    };
  }

  private getRevenueChart(): ChartData {
    const data = this.revenueAnalytics();
    return {
      labels: ['Q1', 'Q2', 'Q3', 'Q4'],
      datasets: [
        {
          label: 'Ingresos por Trimestre',
          data: data.quarterlyComparison,
          backgroundColor: ['#6366f1', '#10b981', '#f59e0b', '#ef4444'],
          borderWidth: 0
        }
      ]
    };
  }

  private getPriorityDistributionChart(): ChartData {
    const data = this.ticketAnalytics();
    return {
      labels: Object.keys(data.ticketsByPriority),
      datasets: [
        {
          label: 'Tickets por Prioridad',
          data: Object.values(data.ticketsByPriority),
          backgroundColor: ['#ef4444', '#f59e0b', '#10b981'],
          borderWidth: 0
        }
      ]
    };
  }

  // Mock data generation
  private generateMockData() {
    // This would typically fetch from your API
    console.log('📊 Generating analytics mock data...');
  }

  // Realtime updates simulation
  private startRealtimeUpdates() {
    setInterval(() => {
      const newMetric: RealtimeMetric = {
        timestamp: new Date(),
        value: Math.floor(Math.random() * 100) + 1,
        category: ['tickets', 'customers', 'revenue'][Math.floor(Math.random() * 3)]
      };

      this.realtimeMetrics.update(current => {
        const updated = [...current, newMetric];
        // Keep only last 50 metrics
        return updated.slice(-50);
      });
    }, 5000); // Update every 5 seconds
  }
}
