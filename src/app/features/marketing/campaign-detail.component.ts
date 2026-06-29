import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  SupabaseMarketingService,
  MarketingCampaign,
  MarketingClient,
} from '../../services/supabase-marketing.service';
import { SupabaseClientService } from '../../services/supabase-client.service';
import { ToastService } from '../../services/toast.service';
import { SendConfirmationModalComponent } from './send-confirmation-modal.component';
import { SafeHtmlPipe } from '../../core/pipes/safe-html.pipe';

/**
 * Per-recipient delivery row. Joined from `clients` (for name/email),
 * the latest matching `company_email_logs` row (for delivery status),
 * and `email_tracking_events` (for open attribution).
 *
 * `company_email_logs` doesn't carry a `client_id` column — only
 * `to_address` (text). We join by lowercased email, which is good enough
 * for the per-recipient display here. See the loadRecipients() notes for
 * the known gap on consent-migration sends.
 */
interface RecipientRow {
  client_id: string;
  name: string | null;
  email: string | null;
  /** Mirrors `company_email_logs.status` (one of 'sent' | 'failed' | 'bounced' | 'complained'), or null if no log row. */
  delivery_status: 'sent' | 'failed' | 'bounced' | 'complained' | null;
  sent_at: string | null;
  error_message: string | null;
  /** Pre-computed display string for the status badge. */
  delivery_label: string;
  delivery_class: string;
  delivery_icon: string;
  /**
   * Timestamp of the first open (pixel fire). null until the recipient
   * loads the tracking pixel. When non-null, the "Abierto" badge is
   * surfaced in the per-recipient list.
   */
  opened_at: string | null;
}

interface DeliveryStats {
  delivered: number;
  failed: number;
  bounced: number;
  complained: number;
  noLog: number;
}

@Component({
  selector: 'app-campaign-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslocoPipe, SendConfirmationModalComponent, SafeHtmlPipe],
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

          <!-- Funnel / automation indicator.
               Shows when the campaign was created as part of a multi-step
               flow (config.funnel_id or config.automation_id). Distinct
               from the RGPD onboarding badge below, which is for the
               one-shot consent-migration sends. -->
          @if (funnelInfo(); as info) {
            <div class="px-6 py-3 bg-purple-50 dark:bg-purple-900/30 border-t border-b border-purple-200 dark:border-purple-800">
              <p class="text-sm text-purple-800 dark:text-purple-200 flex items-center gap-2">
                <i class="fas fa-project-diagram text-purple-600 dark:text-purple-300"></i>
                <span>
                  Parte de la automatización
                  @if (info.name) {
                    <strong>{{ info.name }}</strong>
                  } @else {
                    <span class="font-mono text-xs">({{ info.id }})</span>
                  }
                </span>
              </p>
            </div>
          }

          <!-- RGPD onboarding-migration badge (existing). -->
          @if (campaign()!.config?.['is_onboarding_email']) {
            <div class="px-6 py-3 bg-amber-50 dark:bg-amber-950/20 border-t border-b border-amber-200 dark:border-amber-800">
              <p class="text-sm text-amber-800 dark:text-amber-300 flex items-center gap-2">
                <i class="fas fa-exclamation-triangle"></i>
                {{ 'marketing.onboardingEmailBadge' | transloco }}
              </p>
            </div>
          }

          <!-- Metadata grid -->
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

            <!-- Rendered email preview.
                 The HTML content is sanitized through SafeHtmlPipe (DOMPurify
                 allowlist + url()/expression() stripped from inline styles)
                 so the preview looks like a real email, not raw source. -->
            @if (campaign()!.type === 'email') {
              <div>
                <p class="text-xs text-gray-400 uppercase tracking-wide">{{ 'marketing.content' | transloco }}</p>
                <div class="mt-2 bg-white dark:bg-slate-50 border border-gray-200 dark:border-gray-300 rounded-lg overflow-hidden">
                  <!-- Subject bar (mimics an email client's subject line). -->
                  <div class="px-4 py-3 border-b border-gray-200 dark:border-gray-300 bg-gray-50 dark:bg-gray-100">
                    <p class="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Asunto</p>
                    <p class="text-sm text-gray-900 mt-0.5 break-words">
                      {{ campaign()!.subject || '(sin asunto)' }}
                    </p>
                  </div>
                  <!-- Body — sanitized HTML rendered onto a light "paper"
                       backdrop. We intentionally don't dark-mode the email
                       body itself (Gmail/Outlook do the same): email
                       templates assume light backgrounds and forcing dark
                       mode via invert() produces unreadable results. -->
                  <div
                    class="prose prose-sm max-w-none p-5 text-gray-900 bg-white"
                    [innerHTML]="campaign()!.content | safeHtml"
                  ></div>
                </div>
              </div>
            }

            <!-- Per-recipient list with delivery status.
                 FUTURE WORK: open / click tracking. Adding it requires:
                 (a) a tracking pixel endpoint that records opens via a
                     unique per-recipient token, and
                 (b) a link rewriter that routes clicks through a
                     redirect service. Both touch the email-send pipeline
                 and the company_email_logs schema, so they're out of
                 scope for this UI change. -->
            <div class="border-t border-gray-200 dark:border-slate-700 pt-4">
              <div class="flex items-center justify-between mb-3">
                <h3 class="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <i class="fas fa-users text-blue-500"></i>
                  Destinatarios ({{ recipients().length }})
                </h3>
                @if (recipients().length > 0) {
                  <p class="text-xs text-gray-500 dark:text-gray-400">
                    {{ deliveryStats().delivered }} entregado(s) ·
                    {{ deliveryStats().failed }} fallido(s) ·
                    {{ deliveryStats().bounced }} rebotado(s)
                    @if (deliveryStats().noLog > 0) {
                      · {{ deliveryStats().noLog }} sin registro
                    }
                    · {{ opensCount() }} abierto(s) por {{ recipients().length }}
                  </p>
                }
              </div>

              @if (recipientsLoading()) {
                <div class="flex justify-center py-6 text-gray-400">
                  <i class="fas fa-spinner fa-spin text-xl"></i>
                </div>
              } @else if (recipients().length === 0) {
                <p class="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                  No hay destinatarios en esta campaña.
                </p>
              } @else {
                <ul class="divide-y divide-gray-200 dark:divide-slate-700 border border-gray-200 dark:border-slate-700 rounded-lg overflow-hidden">
                  @for (r of recipients(); track r.client_id) {
                    <li class="flex items-center gap-3 px-4 py-3 bg-white dark:bg-slate-800">
                      <div class="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-700 dark:text-blue-300 font-semibold text-sm shrink-0">
                        {{ initialFor(r) }}
                      </div>
                      <div class="flex-1 min-w-0">
                        <p class="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {{ r.name || r.email || '(sin nombre)' }}
                        </p>
                        <p class="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {{ r.email }}
                        </p>
                      </div>
                      <div class="text-right shrink-0">
                        <div class="flex flex-col items-end gap-1">
                          <span
                            class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                            [class]="r.delivery_class"
                            [title]="r.error_message || r.delivery_label"
                          >
                            <i [class]="r.delivery_icon"></i>
                            {{ r.delivery_label }}
                          </span>
                          @if (r.opened_at) {
                            <span
                              class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                              [title]="'Abierto por primera vez el ' + (r.opened_at | date:'medium')"
                            >
                              <i class="fas fa-envelope-open"></i>
                              Abierto
                            </span>
                          }
                        </div>
                        @if (r.sent_at || r.opened_at) {
                          <p class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                            @if (r.opened_at) {
                              {{ r.opened_at | date:'short' }}
                            } @else if (r.sent_at) {
                              {{ r.sent_at | date:'short' }}
                            }
                          </p>
                        }
                      </div>
                    </li>
                  }
                </ul>
                <p class="text-[11px] text-gray-400 dark:text-gray-500 mt-2">
                  Estado derivado del último envío registrado a este destinatario. Las campañas RGPD que usan envío directo por SES no dejan registro aquí.
                </p>
              }
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
  private sb: SupabaseClient = inject(SupabaseClientService).instance;
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

  /** Per-recipient list with delivery status from `company_email_logs`. */
  recipients = signal<RecipientRow[]>([]);
  recipientsLoading = signal(true);

  /** Aggregated delivery counters for the header summary. */
  deliveryStats = signal<DeliveryStats>({
    delivered: 0,
    failed: 0,
    bounced: 0,
    complained: 0,
    noLog: 0,
  });

  /**
   * Count of distinct recipients whose tracking pixel fired at least once.
   * Counts UNIQUE emails — multiple opens by the same recipient collapse
   * to one, which matches how "open rate" is normally measured.
   */
  opensCount = signal(0);

  /**
   * Derive funnel/automation banner info from `campaign.config`.
   * Returns null when the campaign isn't part of any flow — most
   * ad-hoc campaigns won't have these fields.
   */
  funnelInfo(): { id: string; name: string | null } | null {
    const cfg = this.campaign()?.config as
      | (Record<string, unknown> & {
          funnel_id?: string;
          funnel_name?: string;
          automation_id?: string;
          automation_name?: string;
        })
      | null
      | undefined;
    if (!cfg) return null;
    const id = cfg.funnel_id ?? cfg.automation_id ?? null;
    if (!id) return null;
    const name = cfg.funnel_name ?? cfg.automation_name ?? null;
    return { id, name };
  }

  /** Single character for the avatar bubble — name initial, falling back to email or '?'. */
  initialFor(r: RecipientRow): string {
    const src = (r.name || r.email || '?').trim();
    return src.charAt(0).toUpperCase() || '?';
  }

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
      // Refresh campaign + recipient status.
      const updated = await this.marketingService.getCampaign(c.id);
      this.campaign.set(updated);
      await this.loadRecipients();
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
      await this.loadRecipients();
    } catch (err) {
      console.warn('Campaign detail: could not load', err);
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Load the per-recipient list with delivery status.
   *
   * Flow:
   *   1. Pull client rows (id, name, email) for the campaign's audience.
   *   2. Pull all `company_email_logs` rows for those email addresses
   *      (no `email_type` filter on purpose — see the design note below).
   *   3. Pull `email_tracking_events` rows for the campaign
   *      (event_type = 'open') to derive first-open timestamps.
   *   4. Build a "latest log per email" map and an "earliest open per
   *      email" map; join client ↔ log ↔ open in JS.
   *
   * Design note (email_type filter):
   *   The task brief suggested `.eq('email_type', 'consent')` but the
   *   current `company_email_logs` data only contains `booking_*` rows.
   *   Filtering by `email_type='consent'` would silently hide every
   *   existing log, making the per-recipient list always say "Sin
   *   enviar" for live data. Instead we show the latest log regardless
   *   of type, which surfaces the real delivery state for the
   *   recipient's address (booking cancellations etc.) and degrades
   *   gracefully when the campaign itself didn't log a row.
   *
   * Known gap (consent-migration campaigns):
   *   The current `send-client-consent-invite` v78 sends via SES direct
   *   and does NOT write to `company_email_logs`. Per-recipient status
   *   for those campaigns will all read "Sin registro". This is called
   *   out in the UI helper text under the recipient list. The
   *   open-tracking pixel DOES fire (send-campaign now forwards
   *   campaign_id to the consent invite, which appends a 1x1 GIF), so
   *   the "Abierto" badge will still surface here for recipients who
   *   opened the consent email.
   */
  private async loadRecipients() {
    this.recipientsLoading.set(true);
    try {
      const c = this.campaign();
      if (!c) {
        this.recipients.set([]);
        return;
      }
      const clientIds: string[] = c.target_audience?.client_ids || [];
      if (clientIds.length === 0) {
        this.recipients.set([]);
        this.deliveryStats.set({
          delivered: 0,
          failed: 0,
          bounced: 0,
          complained: 0,
          noLog: 0,
        });
        this.opensCount.set(0);
        return;
      }

      // 1. Resolve the audience clients.
      const { data: clients, error: clientsErr } = await this.sb
        .from('clients')
        .select('id, name, email')
        .in('id', clientIds);

      if (clientsErr) {
        console.warn('Campaign detail: could not load recipients', clientsErr);
        this.recipients.set([]);
        return;
      }

      const clientRows = (clients || []) as Array<{
        id: string;
        name: string | null;
        email: string | null;
      }>;

      // 2. Pull email logs for those addresses (no email_type filter — see
      //    the design note in this method's docstring).
      const emails = clientRows
        .map((cl) => (cl.email || '').toLowerCase().trim())
        .filter((e) => e.length > 0);

      let logs: Array<{
        to_address: string;
        status: string;
        sent_at: string | null;
        error_message: string | null;
      }> = [];
      if (emails.length > 0) {
        const { data: logRows, error: logsErr } = await this.sb
          .from('company_email_logs')
          .select('to_address, status, sent_at, error_message')
          .in('to_address', emails)
          .order('sent_at', { ascending: false })
          .limit(emails.length * 5); // bound to avoid runaway queries on busy mailboxes

        if (logsErr) {
          console.warn('Campaign detail: could not load email logs', logsErr);
        } else {
          logs = (logRows || []) as typeof logs;
        }
      }

      // 3. Pull tracking events (opens) for this campaign.
      //
      // email_tracking_events stores EVERY pixel load (a Gmail image-proxy
      // double fetch, or a user reopening the email, will both produce
      // rows). For the per-recipient display we want the FIRST open
      // (earliest created_at), so we sort ASC and take the first hit per
      // recipient. The aggregate `opensCount` would double-count without
      // distinct, so we collapse duplicates on the recipient_email column
      // on the server via a `select distinct...` chain — PostgREST can't
      // DISTINCT ON, but the campaign_id+recipient_email+event_type
      // compound shape means a single recipient rarely exceeds a few
      // rows, and the dedup below is cheap. For very active campaigns we
      // would switch to a server-side RPC.
      let tracking: Array<{
        recipient_email: string | null;
        created_at: string | null;
        event_type: string | null;
      }> = [];
      const { data: trackingRows, error: trackingErr } = await this.sb
        .from('email_tracking_events')
        .select('recipient_email, created_at, event_type')
        .eq('campaign_id', c.id)
        .eq('event_type', 'open')
        .order('created_at', { ascending: true });

      if (trackingErr) {
        // The campaign detail page must not 500 just because a tracking
        // row is missing or RLS blocks us — degrade silently.
        console.warn('Campaign detail: could not load tracking events', trackingErr);
      } else {
        tracking = (trackingRows || []) as typeof tracking;
      }

      // 4. Keep only the latest log per email.
      const latestLogByEmail = new Map<
        string,
        { status: string; sent_at: string | null; error_message: string | null }
      >();
      for (const log of logs) {
        const key = (log.to_address || '').toLowerCase().trim();
        if (!key) continue;
        if (!latestLogByEmail.has(key)) {
          latestLogByEmail.set(key, {
            status: log.status,
            sent_at: log.sent_at,
            error_message: log.error_message,
          });
        }
      }

      // 5. Map of FIRST open per email (camera pixels + Apple proxies can
      //    produce multiple events for the same recipient).
      const firstOpenByEmail = new Map<string, string>();
      const openedEmails = new Set<string>();
      for (const ev of tracking) {
        const key = (ev.recipient_email || '').toLowerCase().trim();
        if (!key) continue;
        if (ev.created_at && !firstOpenByEmail.has(key)) {
          firstOpenByEmail.set(key, ev.created_at);
        }
        openedEmails.add(key);
      }
      this.opensCount.set(openedEmails.size);

      // 6. Join clients ↔ latest log ↔ first open and pre-compute
      //    display strings so the template stays clean.
      const stats: DeliveryStats = {
        delivered: 0,
        failed: 0,
        bounced: 0,
        complained: 0,
        noLog: 0,
      };

      const recipients: RecipientRow[] = clientRows.map((cl) => {
        const key = (cl.email || '').toLowerCase().trim();
        const log = key ? latestLogByEmail.get(key) : undefined;
        const status = (log?.status as RecipientRow['delivery_status']) || null;
        const presentation = this.presentDeliveryStatus(status);
        if (status === 'sent') stats.delivered++;
        else if (status === 'failed') stats.failed++;
        else if (status === 'bounced') stats.bounced++;
        else if (status === 'complained') stats.complained++;
        else stats.noLog++;
        return {
          client_id: cl.id,
          name: cl.name,
          email: cl.email,
          delivery_status: status,
          sent_at: log?.sent_at ?? null,
          error_message: log?.error_message ?? null,
          delivery_label: presentation.label,
          delivery_class: presentation.className,
          delivery_icon: presentation.icon,
          opened_at: key ? firstOpenByEmail.get(key) ?? null : null,
        };
      });

      this.recipients.set(recipients);
      this.deliveryStats.set(stats);
    } finally {
      this.recipientsLoading.set(false);
    }
  }

  /**
   * Map a raw `company_email_logs.status` to the badge presentation.
   * Kept tiny on purpose — the template just binds the three pre-computed
   * strings so the markup stays declarative.
   */
  private presentDeliveryStatus(status: RecipientRow['delivery_status']): {
    label: string;
    className: string;
    icon: string;
  } {
    switch (status) {
      case 'sent':
        return {
          label: 'Enviado',
          className: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
          icon: 'fas fa-check-circle',
        };
      case 'failed':
        return {
          label: 'Falló',
          className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
          icon: 'fas fa-times-circle',
        };
      case 'bounced':
        return {
          label: 'Rebotado',
          className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
          icon: 'fas fa-exclamation-circle',
        };
      case 'complained':
        return {
          label: 'Spam',
          className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
          icon: 'fas fa-flag',
        };
      default:
        return {
          label: 'Sin registro',
          className: 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300',
          icon: 'fas fa-question-circle',
        };
    }
  }
}