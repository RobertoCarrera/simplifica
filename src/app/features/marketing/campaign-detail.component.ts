import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  SupabaseMarketingService,
  MarketingCampaign,
  MarketingClient,
} from '../../services/supabase-marketing.service';
import { ToastService } from '../../services/toast.service';
import { SendConfirmationModalComponent } from './send-confirmation-modal.component';

@Component({
  selector: 'app-campaign-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslocoPipe, SendConfirmationModalComponent],
  template: `
    <div class="max-w-3xl mx-auto space-y-6">
      <!-- Back link -->
      <a routerLink="/marketing" class="text-sm text-blue-600 dark:text-blue-400 hover:underline inline-block">
        <i class="fas fa-arrow-left mr-1"></i> {{ 'marketing.backToMarketing' | transloco }}
      </a>

      @if (loading()) {
        <div class="text-center py-8 text-gray-500 dark:text-gray-400">
          <i class="fas fa-spinner fa-spin mr-2"></i> {{ 'common.loading' | transloco }}
        </div>
      } @else if (campaign()) {
        <div class="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700">
          <!-- Header -->
          <div class="px-6 py-4 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between">
            <div>
              <h1 class="text-xl font-bold text-gray-900 dark:text-white">{{ campaign()!.name }}</h1>
              <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {{ 'marketing.createdOn' | transloco }} {{ campaign()!.created_at | date:'mediumDate' }}
              </p>
            </div>
            <span
              class="px-3 py-1 text-sm font-medium rounded-full"
              [class.bg-yellow-100]="campaign()!.status === 'draft'"
              [class.text-yellow-700]="campaign()!.status === 'draft'"
              [class.bg-blue-100]="campaign()!.status === 'scheduled'"
              [class.text-blue-700]="campaign()!.status === 'scheduled'"
              [class.bg-green-100]="campaign()!.status === 'sent'"
              [class.text-green-700]="campaign()!.status === 'sent'"
            >
              {{ 'marketing.status.' + campaign()!.status | transloco }}
            </span>
          </div>

          @if (campaign()!.config?.['is_onboarding_email']) {
            <div class="px-6 py-3 bg-amber-50 dark:bg-amber-950/20 border-t border-b border-amber-200 dark:border-amber-800">
              <p class="text-sm text-amber-800 dark:text-amber-300 flex items-center gap-2">
                <i class="fas fa-exclamation-triangle"></i>
                {{ 'marketing.onboardingEmailBadge' | transloco }}
              </p>
            </div>
          }

          <!-- Details -->
          <div class="px-6 py-4 space-y-4">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p class="text-xs text-gray-400 uppercase tracking-wide">{{ 'marketing.type' | transloco }}</p>
                <p class="text-sm text-gray-900 dark:text-white">
                  @if (campaign()!.type === 'email') { <i class="fas fa-envelope text-blue-500 mr-1"></i> Email }
                  @else if (campaign()!.type === 'whatsapp') { <i class="fas fa-comment text-green-500 mr-1"></i> WhatsApp }
                  @else { <i class="fas fa-mobile-alt text-purple-500 mr-1"></i> SMS }
                </p>
              </div>
              <div>
                <p class="text-xs text-gray-400 uppercase tracking-wide">{{ 'marketing.audience' | transloco }}</p>
                <p class="text-sm text-gray-900 dark:text-white">{{ audienceCount() }} {{ 'marketing.clients' | transloco }}</p>
              </div>
              @if (campaign()!.scheduled_at) {
                <div>
                  <p class="text-xs text-gray-400 uppercase tracking-wide">{{ 'marketing.scheduledFor' | transloco }}</p>
                  <p class="text-sm text-gray-900 dark:text-white">{{ campaign()!.scheduled_at | date:'medium' }}</p>
                </div>
              }
              @if (campaign()!.sent_at) {
                <div>
                  <p class="text-xs text-gray-400 uppercase tracking-wide">{{ 'marketing.sentOn' | transloco }}</p>
                  <p class="text-sm text-gray-900 dark:text-white">{{ campaign()!.sent_at | date:'medium' }}</p>
                </div>
              }
            </div>

            @if (campaign()!.subject) {
              <div>
                <p class="text-xs text-gray-400 uppercase tracking-wide">{{ 'marketing.subject' | transloco }}</p>
                <p class="text-sm text-gray-900 dark:text-white">{{ campaign()!.subject }}</p>
              </div>
            }

            <div>
              <p class="text-xs text-gray-400 uppercase tracking-wide">{{ 'marketing.content' | transloco }}</p>
              <div class="mt-2 p-4 bg-gray-50 dark:bg-slate-700/50 rounded-lg text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono">
                {{ campaign()!.content }}
              </div>
            </div>
          </div>

          <!-- Actions -->
          <div class="px-6 py-4 border-t border-gray-200 dark:border-slate-700 flex items-center gap-3">
            @if (campaign()!.status === 'draft') {
              <button
                (click)="sendCampaign()"
                [disabled]="sending()"
                class="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <i class="fas" [class.fa-paper-plane]="!sending()" [class.fa-spinner]="sending()" [class.fa-spin]="sending()"></i>
                {{ sending() ? ('common.sending' | transloco) : ('marketing.sendNow' | transloco) }}
              </button>
              <a
                [routerLink]="['/marketing/campaigns', campaign()!.id, 'edit']"
                class="px-4 py-2 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
              >
                <i class="fas fa-edit mr-1"></i> {{ 'common.edit' | transloco }}
              </a>
            }
          </div>
        </div>
      }

      <!-- Personalized send confirmation modal. -->
      @if (showSendModal() && campaign()) {
        <app-send-confirmation-modal
          [campaignName]="campaign()!.name"
          [audienceCount]="audienceCount()"
          [audienceNames]="audienceNames()"
          [isConsentMigration]="isConsentMigration()"
          [subject]="campaign()!.subject || ''"
          [contentPreview]="contentPreview()"
          [contentPreviewWasTruncated]="contentPreviewWasTruncated()"
          (confirmed)="onSendConfirmed()"
          (cancelled)="showSendModal.set(false)"
        />
      }
    </div>
  `,
})
export class CampaignDetailComponent implements OnInit {
  private marketingService = inject(SupabaseMarketingService);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);

  loading = signal(true);
  sending = signal(false);
  campaign = signal<MarketingCampaign | null>(null);
  audienceCount = signal(0);

  /** Personalized confirmation modal state. */
  showSendModal = signal(false);
  audienceNames = signal<string[]>([]);
  contentPreview = signal('');
  contentPreviewWasTruncated = signal(false);

  /** True when the campaign was flagged as a consent-migration send. */
  isConsentMigration = signal(false);

  /**
   * Open the personalized confirmation modal. Replaces the previous native
   * `confirm()` dialog. Resolves the first 5 recipient display names so the
   * modal can show a concrete preview of who will receive the send.
   */
  async sendCampaign() {
    const c = this.campaign();
    if (!c) return;

    const ids = c.target_audience?.client_ids || [];
    this.isConsentMigration.set(c.config?.['is_onboarding_email'] === true);

    if (ids.length > 0) {
      const names = await this.resolveRecipientNames(ids);
      this.audienceNames.set(names.slice(0, 5));
    } else {
      this.audienceNames.set([]);
    }

    // Truncate content for the marketing-mode preview (first 200 chars).
    const raw = c.content || '';
    const TRUNCATE_AT = 200;
    this.contentPreviewWasTruncated.set(raw.length > TRUNCATE_AT);
    this.contentPreview.set(
      raw.length > TRUNCATE_AT ? raw.slice(0, TRUNCATE_AT) : raw,
    );

    this.showSendModal.set(true);
  }

  /**
   * Called when the user clicks the primary button in the confirmation modal.
   * Performs the actual `send-campaign` Edge Function invocation.
   */
  async onSendConfirmed() {
    this.showSendModal.set(false);
    const c = this.campaign();
    if (!c) return;

    this.sending.set(true);
    try {
      const result = await this.marketingService.sendCampaign(c.id);
      this.toast.success(
        'Enviada',
        `${result.sent} emails enviados${result.failed > 0 ? `, ${result.failed} fallidos` : ''}`,
      );
      // Refresh
      const updated = await this.marketingService.getCampaign(c.id);
      this.campaign.set(updated);
    } catch (err: any) {
      this.toast.error('Error', err.message || 'No se pudo enviar la campaña');
    } finally {
      this.sending.set(false);
    }
  }

  /**
   * Resolve display names for the audience IDs. Fetches the active client
   * list (the marketing service doesn't expose a "by id" lookup) and falls
   * back to consent-migration audiences when the consented set doesn't
   * cover everyone.
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
      console.warn('Campaign detail: could not resolve recipient names', err);
    }

    // Preserve the order of the audience IDs so the preview matches what
    // the user actually selected in the campaign form.
    return ids
      .map((id) => found.get(id))
      .filter((name): name is string => Boolean(name));
  }

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;

    try {
      const c = await this.marketingService.getCampaign(id);
      this.campaign.set(c);
      this.audienceCount.set(c?.target_audience?.client_ids?.length ?? 0);
    } catch (err) {
      console.warn('Campaign detail: could not load', err);
    } finally {
      this.loading.set(false);
    }
  }
}
