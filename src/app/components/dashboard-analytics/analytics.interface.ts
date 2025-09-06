export interface DashboardMetric {
  id: string;
  title: string;
  value: number | string;
  change: number;
  changeType: 'increase' | 'decrease' | 'neutral';
  icon: string;
  color: string;
  description: string;
}

export interface ChartData {
  labels: string[];
  datasets: ChartDataset[];
}

export interface ChartDataset {
  label: string;
  data: number[];
  backgroundColor?: string | string[];
  borderColor?: string | string[];
  borderWidth?: number;
  fill?: boolean;
  tension?: number;
}

export interface RealtimeMetric {
  timestamp: Date;
  value: number;
  category: string;
}

export interface AnalyticsFilter {
  dateRange: {
    start: Date;
    end: Date;
  };
  categories: string[];
  groupBy: 'day' | 'week' | 'month' | 'year';
}

export interface TicketAnalytics {
  totalTickets: number;
  openTickets: number;
  closedTickets: number;
  inProgressTickets: number;
  avgResolutionTime: number;
  customerSatisfaction: number;
  ticketsByPriority: { [key: string]: number };
  ticketsByCategory: { [key: string]: number };
  weeklyTrend: number[];
  monthlyTrend: number[];
}

export interface CustomerAnalytics {
  totalCustomers: number;
  activeCustomers: number;
  newCustomers: number;
  churnRate: number;
  avgTicketsPerCustomer: number;
  topCustomers: Array<{
    id: string;
    name: string;
    ticketCount: number;
    revenue: number;
  }>;
}

export interface RevenueAnalytics {
  totalRevenue: number;
  monthlyRevenue: number;
  projectedRevenue: number;
  revenueGrowth: number;
  revenueByService: { [key: string]: number };
  monthlyTrend: number[];
  quarterlyComparison: number[];
}
