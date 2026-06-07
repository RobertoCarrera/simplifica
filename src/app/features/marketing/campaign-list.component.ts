import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  SupabaseMarketingService,
  MarketingCampaign,
} from '../../services/supabase-marketing.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-campaign-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, TranslocoPipe],
  template: `
    <div class="space-y-4">
      <!-- Toolbar -->
      <div class="flex flex-wrap items-center gap-3">
        <select
          [(ngModel)]="statusFilter"
          (change)="loadCampaigns()"
          class="px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">{{ 'marketing.allStatus' | transloco }}</option>
          <option value="draft">{{ 'marketing.draft' | transloco }}</option>
          <option value="scheduled">{{ 'marketing.scheduled' | transloco }}</option>
          <option value="sent">{{ 'marketing.sent' | transloco }}</option>
        </select>

        <select
          [(ngModel)]="typeFilter"
          (change)="loadCampaigns()"
          class="px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">{{ 'marketing.allTypes' | transloco }}</option>
          <option value="email">Email</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="sms">SMS</option>
        </select>

        <a
          routerLink="/marketing/campaigns/new"
          class="ml-auto inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <i class="fas fa-plus"></i>
          {{ 'marketing.newCampaign' | transloco }}
        </a>
      </div>

      <!-- Table -->
      @if (loading()) {
        <div class="text-center py-8 text-gray-500 dark:text-gray-400">
          <i class="fas fa-spinner fa-spin mr-2"></i>
          {{ 'common.loading' | transloco }}
        </div>
      } @else if (campaigns().length === 0) {
        <div class="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-12 text-center">
          <i class="fas fa-bullhorn text-4xl text-gray-300 dark:text-slate-600 mb-3"></i>
          <p class="text-gray-500 dark:text-gray-400 mb-4">{{ 'marketing.noCampaigns' | transloco }}</p>
          <a
            routerLink="/marketing/campaigns/new"
            class="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <i class="fas fa-plus"></i>
            {{ 'marketing.createFirst' | transloco }}
          </a>
        </div>
      } @else {
        <div class="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-gray-50 dark:bg-slate-700/50">
                <tr>
                  <th class="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">{{ 'marketing.campaignName' | transloco }}</th>
                  <th class="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">{{ 'marketing.type' | transloco }}</th>
                  <th class="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">{{ 'marketing.status' | transloco }}</th>
                  <th class="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400 hidden md:table-cell">{{ 'marketing.audience' | transloco }}</th>
                  <th class="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400 hidden md:table-cell">{{ 'marketing.created' | transloco }}</th>
                  <th class="px-4 py-3 text-right font-medium text-gray-500 dark:text-gray-400">{{ 'marketing.actions' | transloco }}</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200 dark:divide-slate-700">
                @for (c of campaigns(); track c.id) {
                  <tr class="hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors">
                    <td class="px-4 py-3">
                      <a
                        [routerLink]="['/marketing/campaigns', c.id]"
                        class="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                      >
                        {{ c.name }}
                      </a>
                    </td>
                    <td class="px-4 py-3">
                      <span class="inline-flex items-center gap-1 text-gray-600 dark:text-gray-300">
                        @if (c.type === 'email') { <i class="fas fa-envelope text-blue-500"></i> Email }
                        @else if (c.type === 'whatsapp') { <i class="fas fa-comment text-green-500"></i> WhatsApp }
                        @else if (c.type === 'sms') { <i class="fas fa-mobile-alt text-purple-500"></i> SMS }
                      </span>
                    </td>
                    <td class="px-4 py-3">
                      <span
                        class="px-2 py-0.5 text-xs font-medium rounded-full"
                        [class.bg-yellow-100]="c.status === 'draft'"
                        [class.text-yellow-700]="c.status === 'draft'"
                        [class.dark:bg-yellow-900/40]="c.status === 'draft'"
                        [class.dark:text-yellow-400]="c.status === 'draft'"
                        [class.bg-blue-100]="c.status === 'scheduled'"
                        [class.text-blue-700]="c.status === 'scheduled'"
                        [class.dark:bg-blue-900/40]="c.status === 'scheduled'"
                        [class.dark:text-blue-300]="c.status === 'scheduled'"
                        [class.bg-green-100]="c.status === 'sent'"
                        [class.text-green-700]="c.status === 'sent'"
                        [class.dark:bg-green-900/40]="c.status === 'sent'"
                        [class.dark:text-green-400]="c.status === 'sent'"
                      >
                        {{ 'marketing.status.' + c.status | transloco }}
                      </span>
                    </td>
                    <td class="px-4 py-3 text-gray-500 dark:text-gray-400 hidden md:table-cell">
                      {{ getAudienceCount(c) }} {{ 'marketing.clients' | transloco }}
                    </td>
                    <td class="px-4 py-3 text-gray-500 dark:text-gray-400 hidden md:table-cell">
                      {{ c.created_at | date:'shortDate' }}
                    </td>
                    <td class="px-4 py-3 text-right">
                      <div class="flex items-center justify-end gap-1">
                        @if (c.status === 'draft') {
                          <button
                            (click)="sendNow(c.id)"
                            class="p-1.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors"
                            [title]="'marketing.sendNow' | transloco"
                          >
                            <i class="fas fa-paper-plane"></i>
                          </button>
                        }
                        <a
                          [routerLink]="['/marketing/campaigns', c.id, 'edit']"
                          class="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                          [title]="'common.edit' | transloco"
                        >
                          <i class="fas fa-edit"></i>
                        </a>
                        <button
                          (click)="deleteCampaign(c)"
                          class="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                          [title]="'common.delete' | transloco"
                        >
                          <i class="fas fa-trash"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }
    </div>
  `,
})
export class CampaignListComponent implements OnInit {
  private marketingService = inject(SupabaseMarketingService);
  private toast = inject(ToastService);

  loading = signal(true);
  campaigns = signal<MarketingCampaign[]>([]);
  statusFilter = 'all';
  typeFilter = 'all';

  async ngOnInit() {
    await this.loadCampaigns();
  }

  async loadCampaigns() {
    this.loading.set(true);
    try {
      this.campaigns.set(
        await this.marketingService.getCampaigns({
          status: this.statusFilter,
          type: this.typeFilter,
        }),
      );
    } catch (err) {
      console.warn('Campaign list: could not load campaigns', err);
    } finally {
      this.loading.set(false);
    }
  }

  getAudienceCount(campaign: MarketingCampaign): number {
    return campaign.target_audience?.client_ids?.length ?? 0;
  }

  async sendNow(campaignId: string) {
    if (!confirm('¿Estás seguro de que quieres enviar esta campaña ahora?')) return;

    try {
      const result = await this.marketingService.sendCampaign(campaignId);
      this.toast.success(
        'Campaña enviada',
        `${result.sent} emails enviados${result.failed > 0 ? `, ${result.failed} fallidos` : ''}`,
      );
      await this.loadCampaigns();
    } catch (err: any) {
      this.toast.error('Error', err.message || 'No se pudo enviar la campaña');
    }
  }

  async deleteCampaign(campaign: MarketingCampaign) {
    if (!confirm(`¿Eliminar la campaña "${campaign.name}"?`)) return;

    try {
      await this.marketingService.deleteCampaign(campaign.id);
      this.toast.success('Eliminada', 'Campaña eliminada correctamente');
      await this.loadCampaigns();
    } catch (err: any) {
      this.toast.error('Error', err.message || 'No se pudo eliminar la campaña');
    }
  }
}
