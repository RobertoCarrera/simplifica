import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  SupabaseMarketingService,
  MarketingCampaign,
  MarketingClient,
} from '../../services/supabase-marketing.service';
import { ToastService } from '../../services/toast.service';
import { SendConfirmationModalComponent } from './send-confirmation-modal.component';

@Component({
  selector: 'app-campaign-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, TranslocoPipe, SendConfirmationModalComponent],
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
                  <th class="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400">{{ 'marketing.statusLabel' | transloco }}</th>
                  <th class="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400 hidden md:table-cell">{{ 'marketing.audience' | transloco }}</th>
                  <th class="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400 hidden md:table-cell">{{ 'marketing.created' | transloco }}</th>
                  <th class="px-4 py-3 text-right font-medium text-gray-500 dark:text-gray-400">{{ 'marketing.actionsLabel' | transloco }}</th>
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
                            [disabled]="sending()"
                            class="p-1.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors disabled:opacity-50"
                            [title]="'marketing.sendNow' | transloco"
                            data-testid="quick-send-btn"
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

      <!-- Personalized send confirmation modal (quick-send row action). -->
      @if (showSendModal() && selectedCampaign()) {
        <app-send-confirmation-modal
          [campaignName]="selectedCampaign()!.name"
          [audienceCount]="modalAudienceCount()"
          [audienceNames]="audienceNames()"
          [isConsentMigration]="isConsentMigration()"
          [subject]="selectedCampaign()!.subject || ''"
          [contentPreview]="contentPreview()"
          [contentPreviewWasTruncated]="contentPreviewWasTruncated()"
          (confirmed)="onSendConfirmed()"
          (cancelled)="showSendModal.set(false)"
        />
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

  /** Personalized confirmation modal state (mirrors campaign-detail's flow). */
  showSendModal = signal(false);
  sending = signal(false);
  selectedCampaign = signal<MarketingCampaign | null>(null);
  modalAudienceCount = signal(0);
  audienceNames = signal<string[]>([]);
  contentPreview = signal('');
  contentPreviewWasTruncated = signal(false);

  /** True when the campaign was flagged as a consent-migration send. */
  isConsentMigration = signal(false);

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

  /**
   * Quick-send handler bound to the row's green paper-plane icon.
   *
   * Replaces the previous native `confirm()` dialog with the personalized
   * `SendConfirmationModalComponent`. The list row only carries summary data,
   * so we fetch the full campaign first to resolve recipient names, the
   * consent-migration flag and the content preview the modal needs.
   */
  async sendNow(campaignId: string) {
    if (this.sending()) return;

    try {
      const full = await this.marketingService.getCampaign(campaignId);
      if (!full) {
        this.toast.error('Error', 'No se pudo cargar la campaña');
        return;
      }

      this.selectedCampaign.set(full);
      this.modalAudienceCount.set(full.target_audience?.client_ids?.length ?? 0);
      this.isConsentMigration.set(full.config?.['is_onboarding_email'] === true);

      const ids = full.target_audience?.client_ids || [];
      if (ids.length > 0) {
        const names = await this.resolveRecipientNames(ids);
        this.audienceNames.set(names.slice(0, 5));
      } else {
        this.audienceNames.set([]);
      }

      // Truncate content for the marketing-mode preview (first 200 chars).
      const raw = full.content || '';
      const TRUNCATE_AT = 200;
      this.contentPreviewWasTruncated.set(raw.length > TRUNCATE_AT);
      this.contentPreview.set(
        raw.length > TRUNCATE_AT ? raw.slice(0, TRUNCATE_AT) : raw,
      );

      this.showSendModal.set(true);
    } catch (err: any) {
      this.toast.error('Error', err.message || 'No se pudo preparar el envío');
    }
  }

  /**
   * Called when the user confirms the modal. Performs the actual
   * `send-campaign` Edge Function invocation and reloads the list so the
   * row flips from "draft" to "sent".
   */
  async onSendConfirmed() {
    const c = this.selectedCampaign();
    if (!c) return;

    this.showSendModal.set(false);
    this.sending.set(true);
    try {
      const result = await this.marketingService.sendCampaign(c.id);
      this.toast.success(
        'Campaña enviada',
        `${result.sent} emails enviados${result.failed > 0 ? `, ${result.failed} fallidos` : ''}`,
      );
      await this.loadCampaigns();
    } catch (err: any) {
      this.toast.error('Error', err.message || 'No se pudo enviar la campaña');
    } finally {
      this.sending.set(false);
    }
  }

  /**
   * Resolve display names for the audience IDs. Duplicates the same helper
   * from `campaign-detail.component.ts` because the detail page is out of
   * scope for this change and no shared utility exists yet. When the row's
   * audience mixes consent-migration clients with active consented clients,
   * we fall back from `getClientsWithConsent()` → `getAllActiveClients()` so
   * every recipient has a name when possible.
   */
  private async resolveRecipientNames(ids: string[]): Promise<string[]> {
    const wanted = new Set(ids);
    const found = new Map<string, string>();

    const collect = async (clients: MarketingClient[]) => {
      for (const cl of clients) {
        if (wanted.has(cl.id) && !found.has(cl.id)) {
          const full = `${cl.name ?? ''} ${cl.surname ?? ''}`.trim();
          if (full) found.set(cl.id, full);
        }
      }
    };

    try {
      const consented = await this.marketingService.getClientsWithConsent();
      await collect(consented);
      if (found.size < wanted.size) {
        const active = await this.marketingService.getAllActiveClients();
        await collect(active);
      }
    } catch (err) {
      console.warn('Campaign list: could not resolve recipient names', err);
    }

    // Preserve the order of the audience IDs so the preview matches what
    // the user actually selected in the campaign form.
    return ids
      .map((id) => found.get(id))
      .filter((name): name is string => Boolean(name));
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
