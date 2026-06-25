import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { SupabaseClientService } from '../../../services/supabase-client.service';
import { ToastService } from '../../../services/toast.service';

/**
 * PortalQuotesListComponent
 *
 * Lista los presupuestos del cliente autenticado. RLS se encarga de
 * filtrar por `client_id` (cada cliente solo ve los suyos). Si el caller
 * es staff, RLS permite ver los de su company.
 *
 * Pill de estado con colores. Botón "Aceptar/Rechazar" sólo si
 * status = 'sent' | 'viewed'.
 */
@Component({
  selector: 'app-portal-quotes-list',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, TranslocoPipe],
  template: `
    <div class="min-h-screen bg-gray-50 dark:bg-gray-950 py-8 px-4 sm:px-6 lg:px-8">
      <div class="max-w-5xl mx-auto">
        <!-- Header -->
        <div class="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 class="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
              {{ 'portal.quotes.title' | transloco }}
            </h1>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {{ 'portal.quotes.subtitle' | transloco }}
            </p>
          </div>
        </div>

        <!-- Filters -->
        <div class="mb-4 flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            [ngModel]="searchTerm()"
            (ngModelChange)="searchTerm.set($event)"
            [placeholder]="'portal.quotes.searchPlaceholder' | transloco"
            class="flex-1 min-w-[200px] px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <select
            [ngModel]="statusFilter()"
            (ngModelChange)="statusFilter.set($event)"
            class="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
          >
            <option value="">{{ 'portal.quotes.allStatuses' | transloco }}</option>
            <option value="sent">{{ 'portal.quotes.statusSent' | transloco }}</option>
            <option value="viewed">{{ 'portal.quotes.statusViewed' | transloco }}</option>
            <option value="accepted">{{ 'portal.quotes.statusAccepted' | transloco }}</option>
            <option value="rejected">{{ 'portal.quotes.statusRejected' | transloco }}</option>
            <option value="expired">{{ 'portal.quotes.statusExpired' | transloco }}</option>
            <option value="invoiced">{{ 'portal.quotes.statusInvoiced' | transloco }}</option>
            <option value="cancelled">{{ 'portal.quotes.statusCancelled' | transloco }}</option>
          </select>
        </div>

        <!-- Loading -->
        @if (loading()) {
          <div class="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-12">
            <div class="flex items-center justify-center gap-3">
              <div class="animate-spin rounded-full h-10 w-10 border-4 border-blue-200 dark:border-blue-900 border-t-blue-600 dark:border-t-blue-400"></div>
              <span class="text-gray-600 dark:text-gray-400">{{ 'portal.quotes.loading' | transloco }}</span>
            </div>
          </div>
        }

        <!-- Empty -->
        @if (!loading() && filteredQuotes().length === 0) {
          <div class="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-12 text-center">
            <svg class="h-14 w-14 mx-auto text-gray-300 dark:text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p class="text-lg font-medium text-gray-500 dark:text-gray-400">
              {{ 'portal.quotes.empty' | transloco }}
            </p>
            <p class="text-sm text-gray-400 dark:text-gray-500 mt-1">
              {{ 'portal.quotes.emptyHint' | transloco }}
            </p>
          </div>
        }

        <!-- Table -->
        @if (!loading() && filteredQuotes().length > 0) {
          <div class="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div class="overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                <thead class="bg-gray-50 dark:bg-gray-800/50">
                  <tr>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {{ 'portal.quotes.colNumber' | transloco }}
                    </th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {{ 'portal.quotes.colTitle' | transloco }}
                    </th>
                    <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {{ 'portal.quotes.colTotal' | transloco }}
                    </th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {{ 'portal.quotes.colStatus' | transloco }}
                    </th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {{ 'portal.quotes.colIssued' | transloco }}
                    </th>
                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {{ 'portal.quotes.colValidUntil' | transloco }}
                    </th>
                    <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {{ 'portal.quotes.colActions' | transloco }}
                    </th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
                  @for (q of filteredQuotes(); track q.id) {
                    <tr
                      class="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
                      (click)="openQuote(q.id)"
                    >
                      <td class="px-4 py-3 text-sm font-mono text-gray-900 dark:text-gray-100">
                        {{ q.full_quote_number || q.quote_number }}
                      </td>
                      <td class="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                        {{ q.title || ('portal.quotes.untitled' | transloco) }}
                      </td>
                      <td class="px-4 py-3 text-sm text-right font-semibold text-gray-900 dark:text-gray-100">
                        {{ formatAmount(q.total_amount, q.currency) }}
                      </td>
                      <td class="px-4 py-3 text-sm">
                        <span [class]="statusPillClass(q.status)">
                          {{ statusLabel(q.status) | transloco }}
                        </span>
                      </td>
                      <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                        {{ formatDate(q.quote_date) }}
                      </td>
                      <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                        {{ formatDate(q.valid_until) }}
                      </td>
                      <td class="px-4 py-3 text-sm text-right" (click)="$event.stopPropagation()">
                        @if (canAcceptOrReject(q.status)) {
                          <a
                            [routerLink]="['/portal/quotes', q.id, 'accept']"
                            class="inline-block px-3 py-1.5 mr-1 rounded-md text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
                          >
                            {{ 'portal.quote.accept' | transloco }}
                          </a>
                          <a
                            [routerLink]="['/portal/quotes', q.id, 'reject']"
                            class="inline-block px-3 py-1.5 rounded-md text-xs font-medium bg-white dark:bg-gray-800 text-red-600 dark:text-red-400 border border-red-300 dark:border-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          >
                            {{ 'portal.quote.reject' | transloco }}
                          </a>
                        } @else {
                          <span class="text-xs text-gray-400 dark:text-gray-500">
                            {{ 'portal.quotes.noActions' | transloco }}
                          </span>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        }
      </div>
    </div>
  `,
})
export class PortalQuotesListComponent implements OnInit {
  private supabase = inject(SupabaseClientService);
  private toast = inject(ToastService);

  loading = signal<boolean>(true);
  quotes = signal<any[]>([]);
  searchTerm = signal<string>('');
  statusFilter = signal<string>('');

  filteredQuotes = computed(() => {
    const term = this.searchTerm().toLowerCase().trim();
    const status = this.statusFilter();
    return this.quotes().filter((q) => {
      const matchesSearch =
        !term ||
        (q.quote_number || '').toLowerCase().includes(term) ||
        (q.full_quote_number || '').toLowerCase().includes(term) ||
        (q.title || '').toLowerCase().includes(term);
      const matchesStatus = !status || q.status === status;
      return matchesSearch && matchesStatus;
    });
  });

  async ngOnInit(): Promise<void> {
    await this.loadQuotes();
  }

  private async loadQuotes(): Promise<void> {
    this.loading.set(true);
    try {
      const client = this.supabase.instance;
      const { data, error } = await client
        .from('quotes')
        .select(
          'id, company_id, client_id, quote_number, full_quote_number, title, status, total_amount, currency, quote_date, valid_until, created_at',
        )
        .in('status', ['sent', 'viewed', 'accepted', 'rejected', 'expired', 'invoiced', 'cancelled'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      this.quotes.set(data || []);
    } catch (err: any) {
      console.error('[PortalQuotesListComponent] loadQuotes failed', err);
      this.toast.error('Error', err?.message || 'Error al cargar los presupuestos');
      this.quotes.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  openQuote(id: string): void {
    // Router navigation is handled by the row's link, but we expose this
    // method for keyboard / programmatic use.
    window.location.href = `/portal/quotes/${id}`;
  }

  canAcceptOrReject(status: string): boolean {
    return status === 'sent' || status === 'viewed';
  }

  statusPillClass(status: string): string {
    const base = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium';
    switch (status) {
      case 'draft':
        return `${base} bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300`;
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
}