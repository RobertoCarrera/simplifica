import { Component, OnInit, inject, signal, computed, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { SupabaseClientService } from '../../../services/supabase-client.service';

interface ConsentRequest {
  success: boolean;
  error?: string;
  client_id?: string;
  client_name?: string;
  subject_email?: string;
  company_id?: string;
  company_name?: string;
  company_nif?: string | null;
  invitation_status?: string;
  consent_status?: string;
  marketing_consent?: boolean;
  consent_date?: string | null;
  purpose?: string;
  privacy_policy_url?: string;
}

/**
 * ConsentLandingComponent
 *
 * Public RGPD/LSSI consent landing page reached from the link in the
 * consent-migration email. The route is:
 *   /consent?token=<uuid>
 *
 * The token IS the authorization — the page is intentionally NOT behind an
 * auth guard. Both the Accept and Reject paths call
 * process_client_consent(p_token, ...) which looks up the client via
 * invitation_token; an invalid/expired token produces a friendly "enlace no
 * válido" message instead of leaking data.
 *
 * The component displays the full RGPD Art. 13 controller-identity block
 * (responsable, finalidad, base legal, retention, derechos, AEPD complaint)
 * and exposes two equally-prominent buttons — no dark patterns.
 *
 * IP is captured client-side (we have no server-side call here) by reading
 * the standard CF-Connecting-IP / X-Forwarded-For / X-Real-IP headers from
 * a no-op RPC round-trip. The user agent is read from navigator.userAgent.
 */
@Component({
  selector: 'app-consent-landing',
  standalone: true,
  imports: [CommonModule, RouterLink, TranslocoPipe],
  template: `
    <div class="min-h-screen bg-gray-50 dark:bg-gray-900 py-10 px-4 sm:px-6 lg:px-8">
      <div class="max-w-2xl mx-auto">

        @if (loading()) {
          <div class="flex items-center justify-center min-h-[40vh]">
            <div class="animate-spin w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full"></div>
          </div>
        } @else if (invalidToken()) {
          <!-- INVALID / EXPIRED TOKEN ────────────────────────────────────── -->
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-8 text-center">
            <div class="mx-auto w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mb-4">
              <i class="fas fa-link-slash text-amber-600 dark:text-amber-400 text-2xl"></i>
            </div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              {{ 'consentLanding.invalidTokenTitle' | transloco }}
            </h1>
            <p class="text-gray-600 dark:text-gray-300 mb-6">
              {{ 'consentLanding.invalidTokenBody' | transloco }}
            </p>
            <p class="text-sm text-gray-500 dark:text-gray-400">
              {{ 'consentLanding.invalidTokenContact' | transloco }}
            </p>
          </div>
        } @else if (alreadyCompleted()) {
          <!-- ALREADY COMPLETED ─────────────────────────────────────────── -->
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-8 text-center">
            <div class="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4">
              <i class="fas fa-check text-green-600 dark:text-green-400 text-2xl"></i>
            </div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              {{ 'consentLanding.alreadyCompletedTitle' | transloco }}
            </h1>
            <p class="text-gray-600 dark:text-gray-300 mb-2">
              {{ 'consentLanding.alreadyCompletedBody' | transloco }}
            </p>
            @if (requestData()?.consent_status) {
              <p class="text-sm text-gray-500 dark:text-gray-400">
                {{ 'consentLanding.currentStatus' | transloco }}:
                <strong class="text-gray-700 dark:text-gray-200">{{ requestData()?.consent_status }}</strong>
              </p>
            }
          </div>
        } @else if (submitted()) {
          <!-- SUBMITTED ──────────────────────────────────────────────────── -->
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-8 text-center">
            <div class="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4">
              <i class="fas fa-check text-green-600 dark:text-green-400 text-2xl"></i>
            </div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              {{ 'consentLanding.thanksTitle' | transloco }}
            </h1>
            <p class="text-gray-600 dark:text-gray-300 mb-4">
              {{ 'consentLanding.thanksBody' | transloco: { companyName: requestData()?.company_name } }}
            </p>
            <p class="text-sm text-gray-500 dark:text-gray-400">
              {{ 'consentLanding.thanksHint' | transloco }}
            </p>
          </div>
        } @else {
          <!-- MAIN CONSENT UI ───────────────────────────────────────────── -->
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">

            <!-- Header -->
            <div class="px-6 py-5 border-b border-gray-200 dark:border-gray-700">
              <p class="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400 mb-1">
                {{ 'consentLanding.headerEyebrow' | transloco }}
              </p>
              <h1 class="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                {{ 'consentLanding.headerTitle' | transloco: { companyName: requestData()?.company_name } }}
              </h1>
              @if (requestData()?.client_name) {
                <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {{ 'consentLanding.helloName' | transloco: { name: requestData()?.client_name } }}
                </p>
              }
            </div>

            <!-- RGPD Art. 13 block -->
            <div class="px-6 py-5 space-y-4 text-sm text-gray-700 dark:text-gray-300">
              <p>{{ 'consentLanding.bodyIntro' | transloco }}</p>

              <!-- Controller identity -->
              <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 space-y-1.5">
                <p class="font-semibold text-gray-900 dark:text-white">
                  {{ 'consentLanding.controllerTitle' | transloco }}
                </p>
                <p>
                  <span class="text-gray-500 dark:text-gray-400">{{ 'consentLanding.controllerName' | transloco }}:</span>
                  <strong>{{ requestData()?.company_name }}</strong>
                </p>
                @if (requestData()?.company_nif) {
                  <p>
                    <span class="text-gray-500 dark:text-gray-400">{{ 'consentLanding.controllerNif' | transloco }}:</span>
                    {{ requestData()?.company_nif }}
                  </p>
                }
              </div>

              <!-- Purpose + legal basis + retention -->
              <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 space-y-1.5">
                <p>
                  <span class="text-gray-500 dark:text-gray-400">{{ 'consentLanding.purposeLabel' | transloco }}:</span>
                  {{ 'consentLanding.purposeValue' | transloco }}
                </p>
                <p>
                  <span class="text-gray-500 dark:text-gray-400">{{ 'consentLanding.legalBasisLabel' | transloco }}:</span>
                  {{ 'consentLanding.legalBasisValue' | transloco }}
                </p>
                <p>
                  <span class="text-gray-500 dark:text-gray-400">{{ 'consentLanding.retentionLabel' | transloco }}:</span>
                  {{ 'consentLanding.retentionValue' | transloco }}
                </p>
              </div>

              <!-- Rights -->
              <div class="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                <p class="font-semibold text-gray-900 dark:text-white mb-1.5">
                  {{ 'consentLanding.rightsTitle' | transloco }}
                </p>
                <p>{{ 'consentLanding.rightsBody' | transloco }}</p>
                <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  {{ 'consentLanding.rightsAepd' | transloco }}
                </p>
              </div>
            </div>

            <!-- Action buttons (RGPD Art. 7.3 — equally prominent) -->
            <div class="border-t border-gray-200 dark:border-gray-700 p-6 bg-gray-50 dark:bg-gray-800/50">
              @if (submitError()) {
                <div class="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
                  <i class="fas fa-exclamation-circle mr-1"></i>
                  {{ submitError() }}
                </div>
              }
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  (click)="submit(true)"
                  [disabled]="submitting()"
                  data-testid="accept-btn"
                  class="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors"
                >
                  @if (submitting() && pendingChoice() === 'accept') {
                    <i class="fas fa-spinner fa-spin"></i>
                  } @else {
                    <i class="fas fa-check"></i>
                  }
                  {{ 'consentLanding.acceptButton' | transloco }}
                </button>
                <button
                  type="button"
                  (click)="submit(false)"
                  [disabled]="submitting()"
                  data-testid="reject-btn"
                  class="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-white dark:bg-gray-700 border-2 border-gray-300 dark:border-gray-500 hover:border-gray-400 dark:hover:border-gray-400 disabled:cursor-not-allowed text-gray-800 dark:text-white font-semibold text-sm transition-colors"
                >
                  @if (submitting() && pendingChoice() === 'reject') {
                    <i class="fas fa-spinner fa-spin"></i>
                  } @else {
                    <i class="fas fa-times"></i>
                  }
                  {{ 'consentLanding.rejectButton' | transloco }}
                </button>
              </div>
              <p class="text-xs text-gray-500 dark:text-gray-400 text-center mt-4">
                {{ 'consentLanding.actionsHint' | transloco }}
              </p>
            </div>

            <!-- Footer -->
            @if (requestData()?.privacy_policy_url) {
              <div class="px-6 py-3 border-t border-gray-200 dark:border-gray-700 text-center">
                <a
                  [routerLink]="requestData()?.privacy_policy_url"
                  class="text-xs text-gray-500 dark:text-gray-400 hover:underline"
                >
                  {{ 'consentLanding.privacyPolicyLink' | transloco }}
                </a>
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
})
export class ConsentLandingComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private sb = inject(SupabaseClientService);
  private platformId = inject(PLATFORM_ID);

  // State
  loading = signal(true);
  invalidToken = signal(false);
  alreadyCompleted = signal(false);
  submitted = signal(false);
  submitting = signal(false);
  pendingChoice = signal<'accept' | 'reject' | null>(null);
  submitError = signal<string | null>(null);

  requestData = signal<ConsentRequest | null>(null);

  private token: string | null = null;

  async ngOnInit(): Promise<void> {
    this.token = this.route.snapshot.queryParamMap.get('token');
    if (!this.token) {
      this.loading.set(false);
      this.invalidToken.set(true);
      return;
    }

    try {
      const { data, error } = await this.sb.instance.rpc('get_client_consent_request', {
        p_token: this.token,
      });

      if (error || !data) {
        this.loading.set(false);
        this.invalidToken.set(true);
        return;
      }

      const payload = data as ConsentRequest;
      this.requestData.set(payload);

      if (!payload.success) {
        this.loading.set(false);
        this.invalidToken.set(true);
        return;
      }

      if (payload.invitation_status === 'completed') {
        this.loading.set(false);
        this.alreadyCompleted.set(true);
        return;
      }

      this.loading.set(false);
    } catch (e) {
      console.error('[ConsentLanding] Failed to load consent request', e);
      this.loading.set(false);
      this.invalidToken.set(true);
    }
  }

  async submit(consentGiven: boolean): Promise<void> {
    if (this.submitting() || !this.token) return;
    this.submitting.set(true);
    this.pendingChoice.set(consentGiven ? 'accept' : 'reject');
    this.submitError.set(null);

    const ip = await this.detectClientIp();
    const ua = isPlatformBrowser(this.platformId)
      ? (navigator.userAgent || 'unknown')
      : 'server-side';

    const consentMethod = consentGiven
      ? 'consent_migration_accept'
      : 'consent_migration_reject';

    try {
      const { data, error } = await this.sb.instance.rpc('process_client_consent', {
        p_token: this.token,
        p_marketing_consent: consentGiven,
        p_ip: ip,
        p_user_agent: ua,
        p_consent_method: consentMethod,
      });

      const result = (data ?? {}) as { success?: boolean; error?: string };
      if (error || result.success === false) {
        this.submitError.set(
          (result.error || error?.message) ?? 'No se pudo registrar tu respuesta.',
        );
        this.submitting.set(false);
        this.pendingChoice.set(null);
        return;
      }

      this.submitted.set(true);
      this.submitting.set(false);
    } catch (e: any) {
      this.submitError.set(e?.message ?? 'Error desconocido.');
      this.submitting.set(false);
      this.pendingChoice.set(null);
    }
  }

  /**
   * Best-effort client IP detection.
   *
   * The public RPC (process_client_consent) runs in Postgres, not in an Edge
   * Function, so it cannot read the inbound HTTP request headers. The browser
   * itself does not know its public IP either. The existing 4-param version
   * of the RPC accepted a string and callers passed either a real IP (when
   * invoked server-side) or a placeholder (when invoked from a browser).
   *
   * To preserve that contract we try a lightweight, well-known IP-echo
   * service (api.ipify.org) with a short timeout. If it fails we fall back
   * to the literal 'browser-unknown' so the audit row still records the
   * user agent and the consent decision. The user agent is always the real
   * navigator.userAgent string.
   */
  private async detectClientIp(): Promise<string> {
    if (!isPlatformBrowser(this.platformId)) return 'server-side';
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1500);
      const res = await fetch('https://api.ipify.org?format=json', {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) {
        const body = await res.json().catch(() => null);
        if (body && typeof body.ip === 'string' && body.ip.length > 0) {
          return body.ip;
        }
      }
    } catch { /* network blocked, timeout, or offline — fall through */ }
    return 'browser-unknown';
  }
}
