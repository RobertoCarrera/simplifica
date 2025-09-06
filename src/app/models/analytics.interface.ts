// Analytics dashboard interfaces
export interface DashboardMetric {
  id: string;
  title: string;
  value: string;
  change: number;
  changeType: 'increase' | 'decrease' | 'neutral';
  icon: string;
  color: string;
  description: string;
}

export interface TicketAnalytics {
  total: number;
  pending: number;
  inProgress: number;
  resolved: number;
  trend: number[];
  priorityDistribution: {
    high: number;
    medium: number;
    low: number;
  };
}

export interface CustomerAnalytics {
  total: number;
  active: number;
  new: number;
  growth: number[];
  topCustomers: {
    id: number;
    name: string;
    ticketCount: number;
    revenue: number;
  }[];
}

export interface RevenueAnalytics {
  total: number;
  monthly: number;
  quarterly: number[];
  growth: number;
}

export interface AnalyticsFilter {
  dateRange: 'day' | 'week' | 'month' | 'year';
  groupBy: 'day' | 'week' | 'month' | 'quarter';
}

export interface ChartData {
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    borderColor?: string;
    backgroundColor?: string | string[];
  }[];
}

export interface RealtimeMetric {
  timestamp: Date;
  value: number;
  metric: string;
}
