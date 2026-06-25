import { Component, OnInit, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { SupabaseClientService } from '../../../services/supabase-client.service';
import { ToastService } from '../../../services/toast.service';
import { SignaturePadComponent } from '../../../shared/components/signature-pad/signature-pad.component';

/**
 * PortalQuoteAcceptComponent
 *
 * Página de aceptación con firma digital (canvas). Permite:
 *   - Firmar con mouse / touch en el SignaturePad.
 *   - O marcar el checkbox "Acepto sin firma digital".
 *   - Confirmar la aceptación llamando a `accept_quote_by_client`.
 *
 * El RPC:
 *   - Valida que el caller es el cliente (via client_portal_users).
 *   - Marca la transición sent|viewed → accepted.
 *   - Almacena la firma (truncada a 5000 chars en metadata) + IP + UA.
 *   - El trigger `trg_enforce_quote_status_transition` re-valida; ver
 *     KNOWN ISSUE en la migración 20260618000025_portal_quote_actions.sql.
 */
@Component({
  selector: 'app-portal-quote-accept',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, TranslocoPipe, SignaturePadComponent],
  template: `
    <div class="min-h-screen bg-gray-50 dark:bg-gray-950 py-8 px-4 sm:px-6 lg:px-8">
      <div class="max-w-3xl mx-auto">
        <!-- Back link -->
        <a
          [routerLink]="['/portal/quotes', quoteId()]"
          class="inline-flex items-center text-sm text-blue-600 dark:text-blue-400 hover:underline mb-4"
        >
          <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
          </svg>
          {{ 'portal.quote.backToDetail' | transloco }}
        </a>

        <h1 class="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          {{ 'portal.accept.title' | transloco }}
        </h1>
        <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">
          {{ 'portal.accept.subtitle' | transloco }}
        </p>

        <!-- Loading -->
        @if (loading()) {
          <div class="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-12">
            <div class="flex items-center justify-center gap-3">
              <div class="animate-spin rounded-full h-10 w-10 border-4 border-blue-200 dark:border-blue-900 border-t-blue-600 dark:border-t-blue-400"></div>
              <span class="text-gray-600 dark:text-gray-400">{{ 'portal.accept.loading' | transloco }}</span>
            </div>
          </div>
        }

        @if (!loading() && quote(); as q) {
          <!-- Summary -->
          <div class="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-5 mb-6">
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {{ q.full_quote_number || q.quote_number }}
                </p>
                <p class="text-lg font-semibold text-gray-900 dark:text-gray-100">{{ q.title }}</p>
              </div>
              <p class="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {{ formatAmount(q.total_amount, q.currency) }}
              </p>
            </div>
            @if (q.terms_conditions) {
              <details class="mt-4">
                <summary class="text-sm text-blue-600 dark:text-blue-400 cursor-pointer hover:underline">
                  {{ 'portal.accept.viewTerms' | transloco }}
                </summary>
                <p class="mt-2 text-sm text-gray-600 dark:text-gray-400 whitespace-pre-line">{{ q.terms_conditions }}</p>
              </details>
            }
          </div>

          <!-- Signature pad -->
          <div class="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-5 mb-6">
            <h2 class="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3">
              {{ 'portal.signature.title' | transloco }}
            </h2>
            <p class="text-sm text-gray-500 dark:text-gray-400 mb-3">
              {{ 'portal.signature.help' | transloco }}
            </p>
            <app-signature-pad
              #signaturePad
              (signatureChange)="onSignatureChange($event)"
            ></app-signature-pad>
          </div>

          <!-- No-signature opt-in -->
          <label class="flex items-start gap-3 mb-6 cursor-pointer">
            <input
              type="checkbox"
              [ngModel]="acceptWithoutSignature()"
              (ngModelChange)="acceptWithoutSignature.set($event)"
              class="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <span class="text-sm text-gray-700 dark:text-gray-300">
              {{ 'portal.accept.noSignatureLabel' | transloco }}
            </span>
          </label>

          <!-- Error message -->
          @if (errorMessage()) {
            <div class="mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300">
              {{ errorMessage() }}
            </div>
          }

          <!-- Confirm / cancel buttons -->
          <div class="flex flex-col sm:flex-row gap-3">
            <button
              (click)="confirmAccept()"
              [disabled]="submitting() || !canSubmit()"
              class="flex-1 px-5 py-3 rounded-lg font-medium text-sm bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed dark:disabled:bg-gray-700 text-white transition-colors"
            >
              @if (submitting()) {
                <span class="inline-flex items-center gap-2">
                  <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"></path>
                  </svg>
                  {{ 'portal.accept.submitting' | transloco }}
                </span>
              } @else {
                {{ 'portal.signature.confirm' | transloco }}
              }
            </button>
            <a
              [routerLink]="['/portal/quotes', quoteId()]"
              class="flex-1 text-center px-5 py-3 rounded-lg font-medium text-sm bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              {{ 'portal.accept.cancel' | transloco }}
            </a>
          </div>
        }

        @if (!loading() && !quote()) {
          <div class="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-12 text-center">
            <p class="text-lg font-medium text-gray-500 dark:text-gray-400">
              {{ 'portal.quote.notFound' | transloco }}
            </p>
          </div>
        }
      </div>
    </div>
  `,
})
export class PortalQuoteAcceptComponent implements OnInit {
  private supabase = inject(SupabaseClientService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toast = inject(ToastService);

  @ViewChild('signaturePad') signaturePad?: SignaturePadComponent;

  quoteId = signal<string>('');
  loading = signal<boolean>(true);
  submitting = signal<boolean>(false);
  quote = signal<any | null>(null);
  signatureDataUrl = signal<string | null>(null);
  acceptWithoutSignature = signal<boolean>(false);
  errorMessage = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.loading.set(false);
      return;
    }
    this.quoteId.set(id);
    await this.loadQuote(id);
  }

  onSignatureChange(dataUrl: string | null): void {
    this.signatureDataUrl.set(dataUrl);
    if (dataUrl) {
      this.acceptWithoutSignature.set(false);
    }
  }

  canSubmit(): boolean {
    return this.acceptWithoutSignature() || !!this.signatureDataUrl();
  }

  private async loadQuote(id: string): Promise<void> {
    try {
      const client = this.supabase.instance;
      const { data, error } = await client
        .from('quotes')
        .select(
          'id, company_id, client_id, quote_number, full_quote_number, title, status, total_amount, currency, terms_conditions',
        )
        .eq('id', id)
        .single();
      if (error) throw error;
      this.quote.set(data);
    } catch (err: any) {
      console.error('[PortalQuoteAcceptComponent] loadQuote failed', err);
      this.toast.error('Error', err?.message || 'Error al cargar el presupuesto');
      this.quote.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  async confirmAccept(): Promise<void> {
    if (!this.canSubmit() || this.submitting()) return;
    this.submitting.set(true);
    this.errorMessage.set(null);
    try {
      const client = this.supabase.instance;
      const signature = this.signatureDataUrl();
      const ua = typeof navigator !== 'undefined' ? navigator.userAgent : null;
      const { data, error } = await client.rpc('accept_quote_by_client', {
        p_quote_id: this.quoteId(),
        p_signature_data_url: signature,
        p_ip_address: null, // IP captured server-side via edge headers (see EF)
        p_user_agent: ua,
      });
      if (error) throw error;
      this.toast.success('Éxito', 'Presupuesto aceptado correctamente');
      // Navigate to the detail page so the user sees the "accepted" state
      // + transition history.
      this.router.navigate(['/portal/quotes', this.quoteId()]);
    } catch (err: any) {
      console.error('[PortalQuoteAcceptComponent] accept failed', err);
      const msg =
        err?.message ||
        'No se pudo aceptar el presupuesto. Inténtalo de nuevo o contacta con soporte.';
      this.errorMessage.set(msg);
      this.toast.error('Error', msg);
    } finally {
      this.submitting.set(false);
    }
  }

  formatAmount(amount: number | null | undefined, currency: string | null | undefined): string {
    if (amount == null) return '—';
    const symbol = (currency || 'EUR').toUpperCase();
    try {
      return new Intl.NumberFormat('es-ES', {
        style: 'currency',
        currency: symbol,
      }).format(Number(amount));
    } catch {
      return `${Number(amount).toFixed(2)} ${symbol}`;
    }
  }
}