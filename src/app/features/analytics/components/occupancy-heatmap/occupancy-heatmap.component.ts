import { Component, Input, OnInit, OnChanges, SimpleChanges, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseAnalyticsService } from '../../../../services/supabase-analytics.service';
import { SupabaseService } from '../../../../services/supabase.service';
import { NgApexchartsModule } from "ng-apexcharts";

@Component({
    selector: 'app-occupancy-heatmap',
    standalone: true,
    imports: [CommonModule, NgApexchartsModule],
    template: `
    <div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 p-5">
      <h3 class="font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
        <i class="fas fa-fire text-rose-500"></i> Ocupación por Hora
      </h3>
      
      @if (loading()) {
        <div class="h-[350px] flex items-center justify-center text-slate-400 animate-pulse">
            Cargando heatmap...
        </div>
      } @else {
        <apx-chart
            [series]="chartOptions.series!"
            [chart]="chartOptions.chart!"
            [dataLabels]="chartOptions.dataLabels!"
            [plotOptions]="chartOptions.plotOptions!"
            [xaxis]="chartOptions.xaxis!"
            [title]="chartOptions.title!"
        ></apx-chart>
      }
    </div>
  `
})
export class OccupancyHeatmapComponent implements OnInit, OnChanges {
    @Input() startDate!: string;
    @Input() endDate!: string;

    private analyticsService = inject(SupabaseAnalyticsService);
    private supabaseService = inject(SupabaseService);

    loading = signal(true);
    data = signal<{ day: number, hour: number, count: number }[]>([]);

    chartOptions: any = {
        series: [],
        chart: { height: 350, type: 'heatmap', toolbar: { show: false }, fontFamily: 'Inter' },
        plotOptions: {
            heatmap: {
                shadeIntensity: 0.5,
                colorScale: {
                    ranges: [
                        { from: 0, to: 0, color: '#f1f5f9', name: 'Libre' },
                        { from: 1, to: 5, color: '#93c5fd', name: 'Baja' },
                        { from: 6, to: 10, color: '#3b82f6', name: 'Media' },
                        { from: 11, to: 100, color: '#1d4ed8', name: 'Alta' }
                    ]
                }
            }
        },
        dataLabels: { enabled: false },
        title: { text: '' },
        xaxis: { type: 'category' }
    };

    ngOnInit() {
        this.loadData();
    }

    ngOnChanges(changes: SimpleChanges) {
        if (changes['startDate'] || changes['endDate']) {
            this.loadData();
        }
    }

    async loadData() {
        const companyId = this.supabaseService.currentCompanyId;
        if (!companyId) return;

        this.loading.set(true);
        try {
            const res = await this.analyticsService.getOccupancyHeatmap(
                companyId,
                new Date(this.startDate),
                new Date(this.endDate)
            );

            this.processData(res);
        } catch (err) {
            console.error(err);
        } finally {
            this.loading.set(false);
        }
    }

    processData(rawData: any[]) {
        const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        const hours = Array.from({ length: 12 }, (_, i) => i + 9); // 9am to 8pm (approx)

        const series = days.map((dayName, dayIndex) => {
            return {
                name: dayName,
                data: hours.map(hour => {
                    const found = rawData.find(d => d.day_of_week === dayIndex && d.hour_of_day === hour);
                    return {
                        x: `${hour}:00`,
                        y: found ? found.booking_count : 0
                    };
                })
            };
        }).reverse(); // Display Monday at top? usually Heatmaps vary. Let's keep Standard.

        this.chartOptions = {
            ...this.chartOptions,
            series: series
        };
    }
}
