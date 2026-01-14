import { Component, OnInit, inject, signal, computed, ViewChild } from '@angular/core';
import { CommonModule, DatePipe, CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseAnalyticsService, DailyRevenue, ServiceRevenue, ProfessionalRevenue } from '../../../services/supabase-analytics.service';
import { SupabaseService } from '../../../services/supabase.service';

import {
  NgApexchartsModule,
  ApexAxisChartSeries,
  ApexChart,
  ApexXAxis,
  ApexDataLabels,
  ApexStroke,
  ApexYAxis,
  ApexTitleSubtitle,
  ApexLegend,
  ApexTooltip,
  ApexGrid,
  ApexPlotOptions,
  ApexFill
} from "ng-apexcharts";

export type ChartOptions = {
  series: ApexAxisChartSeries;
  chart: ApexChart;
  xaxis: ApexXAxis;
  stroke: ApexStroke;
  dataLabels: ApexDataLabels;
  yaxis: ApexYAxis;
  title: ApexTitleSubtitle;
  labels: string[];
  legend: ApexLegend;
  subtitle: ApexTitleSubtitle;
  tooltip: ApexTooltip;
  grid: ApexGrid;
  plotOptions: ApexPlotOptions;
  fill: ApexFill;
  colors: string[];
};

@Component({
  selector: 'app-analytics-page',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe, CurrencyPipe, NgApexchartsModule],
  templateUrl: './analytics-page.component.html',
  styleUrls: ['./analytics-page.component.scss']
})
export class AnalyticsPageComponent implements OnInit {
  private analyticsService = inject(SupabaseAnalyticsService);
  private supabaseService = inject(SupabaseService);

  // Filters
  startDate = signal<string>('');
  endDate = signal<string>('');

  // Data
  dailyRevenue = signal<DailyRevenue[]>([]);
  serviceRevenue = signal<ServiceRevenue[]>([]);
  proRevenue = signal<ProfessionalRevenue[]>([]);

  // Totals
  totalRevenue = signal<number>(0);
  totalBookings = signal<number>(0);

  isLoading = signal<boolean>(false);

  // Computed Charts
  public revenueChartOptions = computed<Partial<ChartOptions>>(() => {
    const data = this.dailyRevenue();
    // Sort by date just in case
    const sorted = [...data].sort((a, b) => new Date(a.day).getTime() - new Date(b.day).getTime());

    const categories = sorted.map(d => {
      const date = new Date(d.day);
      return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
    });
    const seriesData = sorted.map(d => d.revenue);

    return {
      series: [{
        name: "Ingresos",
        data: seriesData
      }],
      chart: {
        height: 350,
        type: "area",
        fontFamily: 'Inter, sans-serif',
        toolbar: { show: false },
        animations: { enabled: true }
      },
      dataLabels: { enabled: false },
      stroke: { curve: "smooth", width: 3 },
      xaxis: {
        categories: categories,
        axisBorder: { show: false },
        axisTicks: { show: false },
        labels: { style: { colors: '#94a3b8' } },
        tickAmount: Math.min(10, categories.length) // Prevent overcrowding
      },
      yaxis: {
        labels: {
          formatter: (value) => {
            return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumSignificantDigits: 3 }).format(value);
          },
          style: { colors: '#94a3b8' }
        }
      },
      tooltip: {
        theme: 'dark',
        y: {
          formatter: function (val) {
            return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(val);
          }
        }
      },
      grid: {
        borderColor: '#f1f5f9',
        strokeDashArray: 4,
      },
      fill: {
        type: "gradient",
        gradient: {
          shadeIntensity: 1,
          opacityFrom: 0.7,
          opacityTo: 0.2,
          stops: [0, 90, 100]
        }
      },
      colors: ['#10b981'] // Emerald
    };
  });

  public bookingsChartOptions = computed<Partial<ChartOptions>>(() => {
    const data = this.dailyRevenue();
    const sorted = [...data].sort((a, b) => new Date(a.day).getTime() - new Date(b.day).getTime());

    const categories = sorted.map(d => {
      const date = new Date(d.day);
      return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
    });
    const seriesData = sorted.map(d => d.bookings_count);

    return {
      series: [{
        name: "Citas",
        data: seriesData
      }],
      chart: {
        height: 350,
        type: "bar",
        fontFamily: 'Inter, sans-serif',
        toolbar: { show: false }
      },
      plotOptions: {
        bar: {
          borderRadius: 4,
          columnWidth: '50%',
        }
      },
      dataLabels: { enabled: false },
      stroke: { show: true, width: 0, colors: ["transparent"] },
      xaxis: {
        categories: categories,
        axisBorder: { show: false },
        axisTicks: { show: false },
        labels: { style: { colors: '#94a3b8' } },
        tickAmount: Math.min(10, categories.length)
      },
      yaxis: {
        labels: { style: { colors: '#94a3b8' } }
      },
      grid: {
        borderColor: '#f1f5f9',
        strokeDashArray: 4,
      },
      colors: ['#6366f1'], // Indigo
      tooltip: { theme: 'dark' }
    };
  });

  ngOnInit() {
    // Default to current month
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Format for input type="date"
    this.startDate.set(firstDay.toISOString().split('T')[0]);
    this.endDate.set(lastDay.toISOString().split('T')[0]);

    this.loadData();
  }

  async loadData() {
    const companyId = this.supabaseService.currentCompanyId;
    if (!companyId) return;

    this.isLoading.set(true);
    const start = new Date(this.startDate());
    // Ensure end date includes the full day (23:59:59)
    const end = new Date(this.endDate());
    end.setHours(23, 59, 59, 999);

    try {
      const [daily, service, pro] = await Promise.all([
        this.analyticsService.getDailyRevenue(companyId, start, end),
        this.analyticsService.getRevenueByService(companyId, start, end),
        this.analyticsService.getRevenueByProfessional(companyId, start, end)
      ]);

      this.dailyRevenue.set(daily);
      this.serviceRevenue.set(service);
      this.proRevenue.set(pro);

      // Calculate totals
      this.totalRevenue.set(daily.reduce((acc, curr) => acc + curr.revenue, 0));
      this.totalBookings.set(daily.reduce((acc, curr) => acc + curr.bookings_count, 0));

    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      this.isLoading.set(false);
    }
  }

  onDateChange() {
    this.loadData();
  }
}
