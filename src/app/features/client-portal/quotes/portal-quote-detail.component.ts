import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { SupabaseClientService } from '../../../services/supabase-client.service';
import { ToastService } from '../../../services/toast.service';

/**
 * PortalQuoteDetailComponent
 *
 * Muestra el detalle de un presupuesto al cliente del portal. Al entrar:
 *   1) Llama a `mark_quote_as_viewed(p_quote_id)` para registrar la vista
 *      (sent → viewed, idempotente).
 *   2) Carga las líneas (quote_items).
 *   3) Carga el histórico de transiciones (quote_status_transitions).
 *
 * Botones "Aceptar" / "Rechazar" si status = 'sent' | 'viewed'.
 */
@Component({
  selector: 'app-portal-quote-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslocoPipe],
  template: `
    <div class="min-h-screen bg-gray-50 dark:bg-gray-950 py-8 px-4 sm:px-6 lg:px-8">
      <div class="max-w-5xl mx-auto">
        <!-- Back link -->
        <a
          routerLink="/portal/quotes"
          class="inline-flex items-center text-sm text-blue-600 dark:text-blue-400 hover:underline mb-4"
        >
          <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
          </svg>
          {{ 'portal.quote.backToList' | transloco }}
        </a>

        <!-- Loading -->
        @if (loading()) {
          <div class="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-12">
            <div class="flex items-center justify-center gap-3">
              <div class="animate-spin rounded-full h-10 w-10 border-4 border-blue-200 dark:border-blue-900 border-t-blue-600 dark:border-t-blue-400"></div>
              <span class="text-gray-600 dark:text-gray-400">{{ 'portal.quote.loading' | transloco }}</span>
            </div>
          </div>
        }

        <!-- Not found / no access -->
        @if (!loading() && !quote()) {
          <div class="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-12 text-center">
            <svg class="h-14 w-14 mx-auto text-gray-300 dark:text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p class="text-lg font-medium text-gray-500 dark:text-gray-400">
              {{ 'portal.quote.notFound' | transloco }}
            </p>
            <p class="text-sm text-gray-400 dark:text-gray-500 mt-1">
              {{ 'portal.quote.notFoundHint' | transloco }}
            </p>
          </div>
        }

        @if (!loading() && quote(); as q) {
          <!-- Header -->
          <div class="mb-6 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <div class="flex items-center gap-3">
                <h1 class="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
                  {{ 'portal.quote.title' | transloco:{ number: q.full_quote_number || q.quote_number } }}
                </h1>
                <span [class]="statusPillClass(q.status)">
                  {{ statusLabel(q.status) | transloco }}
                </span>
              </div>
              @if (q.title) {
                <p class="text-gray-500 dark:text-gray-400 mt-1">{{ q.title }}</p>
              }
            </div>
            <div class="text-right">
              <p class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {{ 'portal.quote.total' | transloco }}
              </p>
              <p class="text-3xl font-bold text-gray-900 dark:text-gray-100">
                {{ formatAmount(q.total_amount, q.currency) }}
              </p>
              @if (q.valid_until) {
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {{ 'portal.quote.validUntil' | transloco }} {{ formatDate(q.valid_until) }}
                </p>
              }
            </div>
          </div>

          <!-- Description / notes -->
          @if (q.description) {
            <div class="mb-6 bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-5">
              <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                {{ 'portal.quote.description' | transloco }}
              </h3>
              <p class="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-line">{{ q.description }}</p>
            </div>
          }

          <!-- Line items -->
          <div class="mb-6 bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div class="p-5 border-b border-gray-200 dark:border-gray-800">
              <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300">
                {{ 'portal.quote.lineItems' | transloco }}
              </h3>
            </div>
            @if (lineItems().length === 0) {
              <div class="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
                {{ 'portal.quote.noLineItems' | transloco }}
              </div>
            } @else {
              <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                  <thead class="bg-gray-50 dark:bg-gray-800/50">
                    <tr>
                      <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        {{ 'portal.quote.colDescription' | transloco }}
                      </th>
                      <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        {{ 'portal.quote.colQty' | transloco }}
                      </th>
                      <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        {{ 'portal.quote.colUnitPrice' | transloco }}
                      </th>
                      <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        {{ 'portal.quote.colTotal' | transloco }}
                      </th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
                    @for (it of lineItems(); track it.id) {
                      <tr>
                        <td class="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                          {{ it.description }}
                        </td>
                        <td class="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">
                          {{ it.quantity }}
                        </td>
                        <td class="px-4 py-3 text-sm text-right text-gray-700 dark:text-gray-300">
                          {{ formatAmount(it.unit_price, q.currency) }}
                        </td>
                        <td class="px-4 py-3 text-sm text-right font-medium text-gray-900 dark:text-gray-100">
                          {{ formatAmount(it.total_price, q.currency) }}
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              <!-- Totals -->
              <div class="p-5 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/30">
                <div class="flex justify-end">
                  <div class="w-full sm:w-72 space-y-2 text-sm">
                    <div class="flex justify-between text-gray-600 dark:text-gray-400">
                      <span>{{ 'portal.quote.subtotal' | transloco }}</span>
                      <span>{{ formatAmount(q.subtotal, q.currency) }}</span>
                    </div>
                    @if (q.tax_amount && q.tax_amount > 0) {
                      <div class="flex justify-between text-gray-600 dark:text-gray-400">
                        <span>{{ 'portal.quote.tax' | transloco }}</span>
                        <span>{{ formatAmount(q.tax_amount, q.currency) }}</span>
                      </div>
                    }
                    @if (q.discount_amount && q.discount_amount > 0) {
                      <div class="flex justify-between text-gray-600 dark:text-gray-400">
                        <span>{{ 'portal.quote.discount' | transloco }}</span>
                        <span>- {{ formatAmount(q.discount_amount, q.currency) }}</span>
                      </div>
                    }
                    <div class="flex justify-between text-base font-bold text-gray-900 dark:text-gray-100 pt-2 border-t border-gray-200 dark:border-gray-700">
                      <span>{{ 'portal.quote.total' | transloco }}</span>
                      <span>{{ formatAmount(q.total_amount, q.currency) }}</span>
                    </div>
                  </div>
                </div>
              </div>
            }
          </div>

          <!-- Terms and conditions -->
          @if (q.terms_conditions) {
            <div class="mb-6 bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-5">
              <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                {{ 'portal.quote.termsTitle' | transloco }}
              </h3>
              <p class="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-line">{{ q.terms_conditions }}</p>
            </div>
          }

          <!-- Signature preview (if accepted) -->
          @if (q.status === 'accepted' && q.digital_signature) {
            <div class="mb-6 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800 p-5">
              <h3 class="text-sm font-semibold text-emerald-800 dark:text-emerald-200 mb-2">
                {{ 'portal.quote.signedTitle' | transloco }}
              </h3>
              @if (isImageDataUrl(q.digital_signature)) {
                <img [src]="q.digital_signature" alt="Firma" class="max-h-32 bg-white p-2 rounded border" />
              }
              <p class="text-xs text-emerald-700 dark:text-emerald-300 mt-2">
                {{ 'portal.quote.signedAt' | transloco }} {{ formatDateTime(q.signature_timestamp) }}
              </p>
            </div>
          }

          <!-- Rejection reason (if rejected) -->
          @if (q.status === 'rejected' && q.rejection_reason) {
            <div class="mb-6 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 p-5">
              <h3 class="text-sm font-semibold text-red-800 dark:text-red-200 mb-2">
                {{ 'portal.quote.rejectionReason' | transloco }}
              </h3>
              <p class="text-sm text-red-700 dark:text-red-300 whitespace-pre-line">{{ q.rejection_reason }}</p>
            </div>
          }

          <!-- Action buttons -->
          @if (canAcceptOrReject(q.status)) {
            <div class="flex flex-col sm:flex-row gap-3">
              <a
                [routerLink]="['/portal/quotes', q.id, 'accept']"
                class="flex-1 text-center px-5 py-3 rounded-lg font-medium text-sm bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
              >
                {{ 'portal.quote.accept' | transloco }}
              </a>
              <a
                [routerLink]="['/portal/quotes', q.id, 'reject']"
                class="flex-1 text-center px-5 py-3 rounded-lg font-medium text-sm bg-white dark:bg-gray-800 text-red-600 dark:text-red-400 border-2 border-red-300 dark:border-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                {{ 'portal.quote.reject' | transloco }}
              </a>
            </div>
          }

          <!-- Transition history -->
          @if (transitions().length > 0) {
            <div class="mt-8 bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-5">
              <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                {{ 'portal.quote.historyTitle' | transloco }}
              </h3>
              <ol class="space-y-3">
                @for (t of transitions(); track t.id) {
                  <li class="flex gap-3">
                    <span class="flex-shrink-0 w-2 h-2 rounded-full bg-blue-500 mt-2"></span>
                    <div class="flex-1">
                      <p class="text-sm text-gray-900 dark:text-gray-100">
                        {{ statusLabel(t.from_status) | transloco }} → {{ statusLabel(t.to_status) | transloco }}
                      </p>
                      <p class="text-xs text-gray-500 dark:text-gray-400">
                        {{ formatDateTime(t.created_at) }}
                      </p>
                      @if (t.reason) {
                        <p class="text-xs text-gray-600 dark:text-gray-400 mt-1 italic">{{ t.reason }}</p>
                      }
                    </div>
                  </li>
                }
              </ol>
            </div>
          }
        }
      </div>
    </div>
  `,
})
export class PortalQuoteDetailComponent implements OnInit, OnDestroy {
  private supabase = inject(SupabaseClientService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toast = inject(ToastService);

  loading = signal<boolean>(true);
  quote = signal<any | null>(null);
  lineItems = signal<any[]>([]);
  transitions = signal<any[]>([]);
  private viewedMarked = false;

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.loading.set(false);
      return;
    }
    await this.loadQuote(id);
    await this.loadLineItems(id);
    await this.loadTransitions(id);
    // Mark as viewed after we successfully loaded the quote (idempotent).
    await this.markViewed(id);
  }

  ngOnDestroy(): void {
    // no-op
  }

  private async loadQuote(id: string): Promise<void> {
    try {
      const client = this.supabase.instance;
      const { data, error } = await client
        .from('quotes')
        .select(
          'id, company_id, client_id, quote_number, full_quote_number, title, description, status, subtotal, tax_amount, discount_amount, total_amount, currency, quote_date, valid_until, accepted_at, rejected_at, rejection_reason, digital_signature, signature_timestamp, client_viewed_at, terms_conditions',
        )
        .eq('id', id)
        .single();
      if (error) throw error;
      this.quote.set(data);
    } catch (err: any) {
      console.error('[PortalQuoteDetailComponent] loadQuote failed', err);
      this.toast.error('Error', err?.message || 'Error al cargar el presupuesto');
      this.quote.set(null);
    }
  }

  private async loadLineItems(id: string): Promise<void> {
    try {
      const client = this.supabase.instance;
      const { data, error } = await client
        .from('quote_items')
        .select('id, description, quantity, unit_price, total_price, position')
        .eq('quote_id', id)
        .order('position', { ascending: true });
      if (error) throw error;
      this.lineItems.set(data || []);
    } catch (err) {
      console.warn('[PortalQuoteDetailComponent] loadLineItems failed', err);
      this.lineItems.set([]);
    }
  }

  private async loadTransitions(id: string): Promise<void> {
    try {
      const client = this.supabase.instance;
      const { data, error } = await client
        .from('quote_status_transitions')
        .select('id, from_status, to_status, reason, created_at, metadata')
        .eq('quote_id', id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      this.transitions.set(data || []);
    } catch (err) {
      console.warn('[PortalQuoteDetailComponent] loadTransitions failed', err);
      this.transitions.set([]);
    }
  }

  /**
   * Calls the SECURITY DEFINER RPC `mark_quote_as_viewed(p_quote_id)`.
   * Idempotent: if the quote is already past 'sent', it does nothing.
   * If it fails (e.g. trigger bug), we silently log and continue — the
   * detail page still renders, the client can still accept/reject.
   */
  private async markViewed(id: string): Promise<void> {
    if (this.viewedMarked) return;
    this.viewedMarked = true;
    try {
      const client = this.supabase.instance;
      const { error } = await client.rpc('mark_quote_as_viewed', {
        p_quote_id: id,
      });
      if (error) throw error;
    } catch (err: any) {
      console.warn('[PortalQuoteDetailComponent] mark_quote_as_viewed failed (non-blocking)', err);
    }
  }

  canAcceptOrReject(status: string): boolean {
    return status === 'sent' || status === 'viewed';
  }

  statusPillClass(status: string): string {
    const base = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium';
    switch (status) {
      case 'sent':
        return `${base} bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300`;
      case 'viewed':
        return `${base} bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300`;
      case 'accepted':
        return `${base} bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300`;
      case 'rejected':
        return `${base} bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300`;
      case 'expired':
        return `${base} bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300`;
      case 'invoiced':
        return `${base} bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300`;
      case 'cancelled':
        return `${base} bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400`;
      default:
        return base;
    }
  }

  statusLabel(status: string): string {
    return `portal.quotes.status${status.charAt(0).toUpperCase()}${status.slice(1)}`;
  }

  isImageDataUrl(value: string): boolean {
    return typeof value === 'string' && value.startsWith('data:image/');
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

  formatDate(value: string | null | undefined): string {
    if (!value) return '—';
    try {
      return new Intl.DateTimeFormat('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(new Date(value));
    } catch {
      return value;
    }
  }

  formatDateTime(value: string | null | undefined): string {
    if (!value) return '—';
    try {
      return new Intl.DateTimeFormat('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(value));
    } catch {
      return value;
    }
  }
}