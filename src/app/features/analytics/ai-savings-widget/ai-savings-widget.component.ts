import { Component, OnInit, inject, signal, effect, importProvidersFrom } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AiAnalyticsService } from '../../../services/ai-analytics.service';
import { SupabaseModulesService } from '../../../services/supabase-modules.service';
import { LucideAngularModule, Sparkles, Ticket, Users, Smartphone, Clock, LUCIDE_ICONS, LucideIconProvider } from 'lucide-angular';
import { toObservable } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-ai-savings-widget',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  providers: [
    { provide: LUCIDE_ICONS, multi: true, useValue: new LucideIconProvider({ Sparkles, Ticket, Users, Smartphone, Clock }) }
  ],
  templateUrl: './ai-savings-widget.component.html',
  styleUrls: ['./ai-savings-widget.component.scss']
})
export class AiSavingsWidgetComponent implements OnInit {
  private analyticsService = inject(AiAnalyticsService);
  private modulesService = inject(SupabaseModulesService);

  hasAiModule = signal(false);
  isLoading = signal(true);
  breakdown = signal({ tickets: 0, clients: 0, devices: 0, totalSeconds: 0 });
  displayTime = signal('');
  displayUnit = signal('');

  constructor() {
    // React to module changes
    effect(() => {
      const modules = this.modulesService.modulesSignal();
      if (modules) {
        const hasAi = modules.some(m => m.key === 'ai' && m.enabled);
        this.hasAiModule.set(hasAi);
        this.fetchData(hasAi);
      }
    });
  }

  ngOnInit() {
    // Ensure modules are loaded
    this.modulesService.fetchEffectiveModules().subscribe();
  }

  fetchData(hasAi: boolean) {
    if (hasAi) {
      this.analyticsService.getUsageBreakdown().subscribe(data => {
        this.breakdown.set(data);
        this.calculateDisplay(data.totalSeconds);
        this.isLoading.set(false);
      });
    } else {
      this.analyticsService.getPotentialSavings().subscribe(seconds => {
        // For potential, we only show Time breakdown, others are 0 or estimated?
        // User asked for specific design for "Analitycs".
        // Let's keep potential simple or estimate? For now just time.
        this.breakdown.set({ tickets: 0, clients: 0, devices: 0, totalSeconds: seconds });
        this.calculateDisplay(seconds);
        this.isLoading.set(false);
      });
    }
  }

  private calculateDisplay(seconds: number) {
    if (seconds < 60) {
      this.displayTime.set(seconds.toString());
      this.displayUnit.set('segundos');
    } else if (seconds < 3600) {
      this.displayTime.set(Math.floor(seconds / 60).toString());
      this.displayUnit.set('minutos');
    } else if (seconds < 86400) { // Less than a day
      const hours = (seconds / 3600).toFixed(1);
      this.displayTime.set(hours.replace('.0', ''));
      this.displayUnit.set('horas');
    } else if (seconds < 2592000) { // Less than 30 days
      const days = (seconds / 86400).toFixed(1);
      this.displayTime.set(days.replace('.0', ''));
      this.displayUnit.set('días');
    } else {
      const months = (seconds / 2592000).toFixed(1);
      this.displayTime.set(months.replace('.0', ''));
      this.displayUnit.set('meses');
    }
  }
}
