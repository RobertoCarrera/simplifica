import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, DatePipe, CurrencyPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseAnalyticsService, DailyRevenue, ServiceRevenue, ProfessionalRevenue } from '../../../services/supabase-analytics.service';
import { SupabaseService } from '../../../services/supabase.service';

@Component({
  selector: 'app-analytics-page',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe, CurrencyPipe],
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
