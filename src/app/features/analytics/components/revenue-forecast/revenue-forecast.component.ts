import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseAnalyticsService } from '../../../../services/supabase-analytics.service';
import { SupabaseService } from '../../../../services/supabase.service';
import { NgApexchartsModule } from "ng-apexcharts";

@Component({
    selector: 'app-revenue-forecast',
    standalone: true,
    imports: [CommonModule, NgApexchartsModule],
    template: `
    <div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 p-5">
      <h3 class="font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
        <i class="fas fa-chart-line text-emerald-500"></i> Previsión de Ingresos (30 días)
      </h3>

      @if (loading()) {
        <div class="h-[300px] flex items-center justify-center text-slate-400 animate-pulse">
            Calculando previsión...
        </div>
      } @else {
        <div class="grid grid-cols-2 gap-4 mb-4">
            <div class="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                <p class="text-xs text-slate-500">Últimos 30 días</p>
                <p class="text-xl font-bold text-slate-700 dark:text-slate-200">
                    {{ pastRevenue() | currency:'EUR':'symbol':'1.0-0' }}
                </p>
            </div>
            <div class="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-100 dark:border-emerald-800/30">
                <p class="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Próximos 30 días</p>
                <p class="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                    {{ futureRevenue() | currency:'EUR':'symbol':'1.0-0' }}
                </p>
            </div>
        </div>
        
        <apx-chart
            [series]="chartOptions.series!"
            [chart]="chartOptions.chart!"
            [labels]="chartOptions.labels!"
            [colors]="chartOptions.colors!"
            [legend]="chartOptions.legend!"
            [plotOptions]="chartOptions.plotOptions!"
        ></apx-chart>
      }
    </div>
  `
})
export class RevenueForecastComponent implements OnInit {
    private analyticsService = inject(SupabaseAnalyticsService);
    private supabaseService = inject(SupabaseService);

    loading = signal(true);
    pastRevenue = signal(0);
    futureRevenue = signal(0);

    chartOptions: any = {
        series: [],
        chart: { type: 'donut', height: 250, fontFamily: 'Inter' },
        labels: ['Pasado (30d)', 'Futuro (30d)'],
        colors: ['#94a3b8', '#10b981'],
        legend: { position: 'bottom' },
        plotOptions: { pie: { donut: { size: '65%' } } }
    };

    ngOnInit() {
        // Subscribe to company changes to load data when company is ready
        this.supabaseService.company$.subscribe(companyId => {
            if (companyId) {
                this.loadData(companyId);
            } else {
                this.loading.set(false);
            }
        });
    }

    async loadData(companyId: string) {
        this.loading.set(true);
        try {
            const res = await this.analyticsService.getRevenueForecast(companyId);

            const past = res.find(r => r.period === 'past_30d')?.total_revenue || 0;
            const future = res.find(r => r.period === 'next_30d')?.total_revenue || 0;

            this.pastRevenue.set(past);
            this.futureRevenue.set(future);

            this.chartOptions = {
                ...this.chartOptions,
                series: [past, future]
            };
        } catch (err) {
            console.error(err);
        } finally {
            this.loading.set(false);
        }
    }
}
