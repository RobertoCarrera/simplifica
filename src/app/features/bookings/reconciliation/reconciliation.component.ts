import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  OnInit,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ReconciliationService, ReconciliationStatus, ReconciliationRow, ReconciliationSummary } from './reconciliation.service';
import { AuthService } from '../../../services/auth.service';
import { SupabaseBookingsService } from '../../../services/supabase-bookings.service';

interface StatusChip {
  key: ReconciliationStatus | 'all';
  labelKey: string;
}

@Component({
  selector: 'app-reconciliation',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div class="max-w-7xl mx-auto">
        <div class="flex items-start justify-between gap-4 mb-2">
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
            {{ 'bookings.conciliation.title' | transloco }}
          </h1>
          <a routerLink="/reservas"
             class="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 underline whitespace-nowrap mt-2">
            ← {{ 'bookings.conciliation.backToBookings' | transloco }}
          </a>
        </div>
        <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">
          {{ 'bookings.conciliation.subtitle' | transloco }}
        </p>

        @if (errorMessage()) {
          <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-xl p-4 mb-4">
            <p class="text-red-700 dark:text-red-300">{{ errorMessage() }}</p>
          </div>
        }

        @if (isLoading()) {
          <div class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            @for (i of [1,2,3,4,5,6]; track i) {
              <div class="h-24 bg-white dark:bg-gray-800 rounded-xl animate-pulse"></div>
            }
          </div>
        } @else if (summary()) {
          <!-- Counter row: bookings (left) + invoices (right) -->
          <div class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
              <p class="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {{ 'bookings.conciliation.counters.totalBookings' | transloco }}
              </p>
              <p class="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                {{ summary()!.total_bookings }}
              </p>
            </div>
            <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
              <p class="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {{ 'bookings.conciliation.counters.withoutQuote' | transloco }}
              </p>
              <p class="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">
                {{ summary()!.bookings_without_quote }}
              </p>
            </div>
            <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
              <p class="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {{ 'bookings.conciliation.counters.quotesDraft' | transloco }}
              </p>
              <p class="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">
                {{ summary()!.quotes_draft }}
              </p>
            </div>
            <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
              <p class="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {{ 'bookings.conciliation.counters.sessionsWithoutInvoice' | transloco }}
              </p>
              <p class="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">
                {{ summary()!.sessions_without_invoice }}
              </p>
            </div>
            <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
              <p class="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {{ 'bookings.conciliation.counters.invoicesDraft' | transloco }}
              </p>
              <p class="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">
                {{ summary()!.invoices_draft }}
              </p>
            </div>
            <div class="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
              <p class="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {{ 'bookings.conciliation.counters.invoicesPaid' | transloco }}
              </p>
              <p class="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                {{ summary()!.invoices_paid }}
              </p>
              @if (summary()!.paid_amount_total > 0) {
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {{ summary()!.paid_amount_total }} €
                </p>
              }
            </div>
          </div>
        }

        <div class="flex flex-wrap gap-2 mb-4">
          @for (chip of statusChips; track chip.key) {
            <button
              type="button"
              (click)="setStatusFilter(chip.key)"
              class="px-3 py-1.5 text-sm rounded-full border transition-colors"
              [class]="activeStatus() === chip.key
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-700 hover:border-blue-300'"
            >
              {{ ('bookings.conciliation.filters.' + chip.labelKey) | transloco }}
            </button>
          }
        </div>

        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
          <div class="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center gap-3">
            <div class="relative flex-1 max-w-md">
              <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
              <input
                type="text"
                [ngModel]="searchTerm()"
                (ngModelChange)="setSearch($event)"
                [placeholder]="'bookings.conciliation.search.placeholder' | transloco"
                class="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            @if (searchTerm()) {
              <button
                type="button"
                (click)="setSearch('')"
                class="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 underline whitespace-nowrap">
                {{ 'bookings.conciliation.search.clear' | transloco }}
              </button>
            }
            <span class="text-xs text-gray-500 dark:text-gray-400 ml-auto whitespace-nowrap">
              {{ 'bookings.conciliation.search.showing' | transloco:{ count: visibleRows().length, total: rows().length } }}
            </span>
          </div>

          @if (visibleRows().length === 0 && !isLoading()) {
            <div class="p-8 text-center text-gray-500 dark:text-gray-400">
              {{ (searchTerm() ? 'bookings.conciliation.search.noResults' : 'bookings.conciliation.table.empty') | transloco }}
            </div>
          } @else {
            <div class="max-h-[60vh] overflow-y-auto">
              <table class="w-full text-sm">
                <thead class="bg-gray-50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400 uppercase text-xs sticky top-0 z-10">
                  <tr>
                    <th class="px-4 py-3 text-left">{{ 'bookings.conciliation.table.headers.customer' | transloco }}</th>
                    <th class="px-4 py-3 text-left">{{ 'bookings.conciliation.table.headers.date' | transloco }}</th>
                    <th class="px-4 py-3 text-left">{{ 'bookings.conciliation.table.headers.bookingStatus' | transloco }}</th>
                    <th class="px-4 py-3 text-right">{{ 'bookings.conciliation.table.headers.quote' | transloco }}</th>
                    <th class="px-4 py-3 text-right">{{ 'bookings.conciliation.table.headers.invoice' | transloco }}</th>
                    <th class="px-4 py-3 text-left">{{ 'bookings.conciliation.table.headers.invoicePayment' | transloco }}</th>
                    <th class="px-4 py-3 text-left">{{ 'bookings.conciliation.table.headers.conciliation' | transloco }}</th>
                    <th class="px-4 py-3 text-right">{{ 'bookings.conciliation.table.headers.actions' | transloco }}</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of visibleRows(); track row.booking_id) {
                    <tr class="border-t border-gray-100 dark:border-gray-700">
                      <td class="px-4 py-3 text-gray-900 dark:text-white">{{ row.customer_name ?? '—' }}</td>
                      <td class="px-4 py-3 text-gray-700 dark:text-gray-300">{{ formatDate(row.start_time) }}</td>
                      <td class="px-4 py-3 text-gray-700 dark:text-gray-300">{{ row.booking_status }}</td>
                      <td class="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                        @if (row.quote_total !== null) {
                          {{ row.quote_total }} €
                        } @else { — }
                      </td>
                      <td class="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                        @if (row.invoice_total !== null) {
                          {{ row.invoice_total }} €
                        } @else { — }
                      </td>
                      <td class="px-4 py-3 text-gray-700 dark:text-gray-300">
                        @if (row.invoice_payment_status) {
                          <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                            [class]="paymentStatusClass(row.invoice_payment_status)">
                            {{ row.invoice_payment_status }}
                          </span>
                        } @else { — }
                      </td>
                      <td class="px-4 py-3">
                        <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                          [class]="statusClass(row.reconciliation_status)">
                          {{ ('bookings.conciliation.filters.' + chipKey(row.reconciliation_status)) | transloco }}
                        </span>
                      </td>
                      <td class="px-4 py-3 text-right">
                        @if (canCancel(row)) {
                          <button
                            type="button"
                            (click)="cancelBooking(row)"
                            [disabled]="cancellingId() === row.booking_id"
                            class="text-xs px-2 py-1 rounded bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 text-red-700 dark:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            [title]="'bookings.conciliation.cancelBooking' | transloco"
                          >
                            @if (cancellingId() === row.booking_id) {
                              <i class="fas fa-spinner fa-spin text-[10px]"></i>
                            } @else {
                              <i class="fas fa-times text-[10px]"></i>
                              {{ 'bookings.conciliation.cancel' | transloco }}
                            }
                          </button>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </div>
      </div>
    </div>
  `,
})
export class ReconciliationComponent implements OnInit {
  private service = inject(ReconciliationService);
  private auth = inject(AuthService);
  private bookingsService = inject(SupabaseBookingsService);

  summary = signal<ReconciliationSummary | null>(null);
  rows = signal<ReconciliationRow[]>([]);
  isLoading = signal(true);
  errorMessage = signal<string | null>(null);
  activeStatus = signal<ReconciliationStatus | 'all'>('all');
  searchTerm = signal<string>('');

  visibleRows = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    const all = this.rows();
    if (!term) return all;
    return all.filter(r =>
      (r.customer_name ?? '').toLowerCase().includes(term) ||
      r.booking_status.toLowerCase().includes(term) ||
      (r.quote_status ?? '').toLowerCase().includes(term) ||
      (r.invoice_status ?? '').toLowerCase().includes(term) ||
      (r.invoice_payment_status ?? '').toLowerCase().includes(term)
    );
  });

  statusChips: StatusChip[] = [
    { key: 'all',             labelKey: 'all' },
    { key: 'missing_quote',   labelKey: 'missingQuote' },
    { key: 'missing_invoice', labelKey: 'missingInvoice' },
    { key: 'quote_draft',     labelKey: 'quoteDraft' },
    { key: 'invoice_draft',   labelKey: 'invoiceDraft' },
    { key: 'invoice_pending', labelKey: 'invoicePending' },
    { key: 'paid',            labelKey: 'paid' },
    { key: 'ok',              labelKey: 'ok' },
  ];

  constructor() {
    effect(() => {
      const cid = this.auth.companyId();
      if (cid && this.isLoading() && this.summary() === null) {
        this.load(cid);
      }
    });
  }

  ngOnInit(): void {
    const cid = this.auth.companyId();
    if (cid) this.load(cid);
  }

  /** Id of the booking currently being cancelled (for spinner). */
  cancellingId = signal<string | null>(null);

  /**
   * The cancel button is shown only for future bookings that have not
   * already been cancelled. Past sessions need a refund flow which is
   * out of scope.
   */
  canCancel(row: ReconciliationRow): boolean {
    if ((row.booking_status || '').toLowerCase() === 'cancelled') return false;
    if (row.session_confirmed) return false;
    if (!row.start_time) return false;
    return new Date(row.start_time).getTime() > Date.now();
  }

  async cancelBooking(row: ReconciliationRow): Promise<void> {
    if (!this.canCancel(row)) return;
    const customerName = row.customer_name || 'este cliente';
    const confirmed = window.confirm(
      `¿Cancelar la reserva de ${customerName}? El presupuesto asociado se marcará como rechazado. Esta acción no se puede deshacer.`
    );
    if (!confirmed) return;
    this.cancellingId.set(row.booking_id);
    try {
      await this.bookingsService.updateBooking(row.booking_id, { status: 'cancelled' } as any);
      // The DB trigger trg_cancel_booking_rejects_quote will mark the quote as rejected.
      // Re-fetch the data so the table reflects the new state.
      const cid = this.auth.companyId();
      if (cid) await this.load(cid);
    } catch (err: any) {
      console.error('[Reconciliation] cancel failed:', err);
      window.alert('Error al cancelar la reserva: ' + (err?.message || err));
    } finally {
      this.cancellingId.set(null);
    }
  }

  async load(companyId: string): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    try {
      const [summary, rows] = await Promise.all([
        this.service.getSummary(companyId),
        this.service.getRows(companyId),
      ]);
      this.summary.set(summary);
      this.rows.set(rows);
    } catch (err: any) {
      this.errorMessage.set(err?.message ?? 'No se pudo cargar la conciliación.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async setStatusFilter(status: ReconciliationStatus | 'all'): Promise<void> {
    this.activeStatus.set(status);
    const cid = this.auth.companyId();
    if (!cid) return;
    if (status === 'all') {
      const all = await this.service.getRows(cid);
      this.rows.set(all);
    } else {
      const filtered = await this.service.getRows(cid, status);
      this.rows.set(filtered);
    }
  }

  setSearch(term: string): void {
    this.searchTerm.set(term);
  }

  chipKey(status: ReconciliationStatus): string {
    switch (status) {
      case 'missing_quote':    return 'missingQuote';
      case 'missing_invoice':  return 'missingInvoice';
      case 'quote_draft':      return 'quoteDraft';
      case 'quote_rejected':   return 'quoteRejected';
      case 'invoice_draft':    return 'invoiceDraft';
      case 'invoice_pending':  return 'invoicePending';
      case 'paid':             return 'paid';
      case 'ok':               return 'ok';
    }
  }

  statusClass(status: ReconciliationStatus): string {
    switch (status) {
      case 'missing_quote':
      case 'missing_invoice':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
      case 'quote_draft':
      case 'invoice_draft':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
      case 'quote_rejected':
        return 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200';
      case 'invoice_pending':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
      case 'paid':
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300';
      case 'ok':
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300';
    }
  }

  paymentStatusClass(status: string): string {
    switch (status) {
      case 'paid':     return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300';
      case 'pending':  return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
      case 'partial':  return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
      case 'refunded': return 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200';
      default:         return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200';
    }
  }

  formatDate(iso: string): string {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' });
    } catch {
      return iso;
    }
  }
}
