import { Component, Input, OnInit, OnChanges, SimpleChanges, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseAnalyticsService } from '../../../../services/supabase-analytics.service';
import { SupabaseService } from '../../../../services/supabase.service';

@Component({
    selector: 'app-top-performers',
    standalone: true,
    imports: [CommonModule],
    template: `
    <div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 p-5 h-full">
      <h3 class="font-semibold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
        <i class="fas fa-trophy text-amber-400"></i> Top Rendimiento ({{ monthName() }})
      </h3>

      @if (loading()) {
        <div class="space-y-3 animate-pulse">
            <div class="h-10 bg-slate-100 rounded"></div>
            <div class="h-10 bg-slate-100 rounded"></div>
            <div class="h-10 bg-slate-100 rounded"></div>
        </div>
      } @else if (performers().length === 0) {
        <div class="text-center text-slate-400 py-8">
            No hay datos para este mes.
        </div>
      } @else {
        <div class="space-y-4">
            @for (p of performers(); track p.professional_id; let i = $index) {
                <div class="flex items-center justify-between group">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm"
                            [ngClass]="getRankClass(i)">
                            {{ i + 1 }}
                        </div>
                        <div>
                            <p class="text-sm font-medium text-slate-900 dark:text-slate-100">{{ p.professional_name }}</p>
                            <p class="text-xs text-slate-500">{{ p.bookings_count }} citas</p>
                        </div>
                    </div>
                    <div class="text-right">
                        <p class="text-sm font-bold text-slate-700 dark:text-slate-300">
                            {{ p.total_revenue | currency:'EUR':'symbol':'1.0-0' }}
                        </p>
                    </div>
                </div>
                <!-- Progress bar relative to top performer -->
                <div class="h-1.5 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div class="h-full bg-indigo-500 rounded-full"
                        [style.width.%]="(p.total_revenue / maxRevenue()) * 100">
                    </div>
                </div>
            }
        </div>
      }
    </div>
  `
})
export class TopPerformersComponent implements OnInit, OnChanges {
    @Input() selectedDate!: string; // Using full date string to extract month

    private analyticsService = inject(SupabaseAnalyticsService);
    private supabaseService = inject(SupabaseService);

    loading = signal(false);
    performers = signal<any[]>([]);
    maxRevenue = signal(1); // Avoid division by zero
    monthName = signal('');

    ngOnInit() {
        this.displayMonth();
        this.loadData();
    }

    ngOnChanges(changes: SimpleChanges) {
        if (changes['selectedDate']) {
            this.displayMonth();
            this.loadData();
        }
    }

    displayMonth() {
        const d = new Date(this.selectedDate || new Date());
        this.monthName.set(d.toLocaleDateString('es-ES', { month: 'long' }));
    }

    async loadData() {
        const companyId = this.supabaseService.currentCompanyId;
        if (!companyId) return;

        this.loading.set(true);
        try {
            const date = new Date(this.selectedDate || new Date());
            const res = await this.analyticsService.getTopPerformers(companyId, date);

            this.performers.set(res);
            if (res.length > 0) {
                this.maxRevenue.set(Math.max(...res.map(r => r.total_revenue)));
            }
        } catch (err) {
            console.error(err);
        } finally {
            this.loading.set(false);
        }
    }

    getRankClass(index: number): string {
        switch (index) {
            case 0: return 'bg-amber-100 text-amber-600 ring-1 ring-amber-500/30';
            case 1: return 'bg-slate-100 text-slate-600 ring-1 ring-slate-400/30';
            case 2: return 'bg-orange-100 text-orange-700 ring-1 ring-orange-500/30';
            default: return 'bg-slate-50 text-slate-400';
        }
    }
}
