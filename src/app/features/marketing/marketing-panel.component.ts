import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { SupabaseMarketingService, MarketingStats } from '../../services/supabase-marketing.service';

@Component({
  selector: 'app-marketing-panel',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslocoPipe],
  template: `
    <div class="space-y-6">
      <!-- Stats Grid -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-5">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-500 dark:text-gray-400">{{ 'marketing.totalCampaigns' | transloco }}</p>
              <p class="text-2xl font-bold text-gray-900 dark:text-white mt-1">{{ stats().total }}</p>
            </div>
            <i class="fas fa-bullhorn text-2xl text-blue-500"></i>
          </div>
        </div>

        <div class="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-5">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-500 dark:text-gray-400">{{ 'marketing.activeCampaigns' | transloco }}</p>
              <p class="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">{{ stats().active }}</p>
            </div>
            <i class="fas fa-play-circle text-2xl text-green-500"></i>
          </div>
        </div>

        <div class="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-5">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-500 dark:text-gray-400">{{ 'marketing.sentCampaigns' | transloco }}</p>
              <p class="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-1">{{ stats().sent }}</p>
            </div>
            <i class="fas fa-paper-plane text-2xl text-purple-500"></i>
          </div>
        </div>

        <div class="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-5">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-500 dark:text-gray-400">{{ 'marketing.clientsWithConsent' | transloco }}</p>
              <p class="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">{{ stats().clientsWithConsent }}</p>
            </div>
            <i class="fas fa-users text-2xl text-amber-500"></i>
          </div>
        </div>
      </div>

      <!-- Quick Actions -->
      <div class="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6">
        <h2 class="text-base font-semibold text-gray-900 dark:text-white mb-4">{{ 'marketing.quickActions' | transloco }}</h2>
        <div class="flex flex-wrap gap-3">
          <a
            routerLink="/marketing/campaigns/new"
            class="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <i class="fas fa-plus"></i>
            {{ 'marketing.newCampaign' | transloco }}
          </a>
        </div>
      </div>

      @if (loading()) {
        <div class="text-center py-8 text-gray-500 dark:text-gray-400">
          <i class="fas fa-spinner fa-spin mr-2"></i>
          {{ 'common.loading' | transloco }}
        </div>
      }
    </div>
  `,
})
export class MarketingPanelComponent implements OnInit {
  private marketingService = inject(SupabaseMarketingService);

  loading = signal(true);
  stats = signal<MarketingStats>({ total: 0, active: 0, sent: 0, clientsWithConsent: 0 });

  async ngOnInit() {
    try {
      this.stats.set(await this.marketingService.getStats());
    } catch (err) {
      console.warn('Marketing panel: could not load stats', err);
    } finally {
      this.loading.set(false);
    }
  }
}
