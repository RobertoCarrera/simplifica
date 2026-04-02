import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SupabaseQuotesService } from '../../../services/supabase-quotes.service';
import { SupabaseSettingsService } from '../../../services/supabase-settings.service';
import { AuthService } from '../../../services/auth.service';
import { AiService } from '../../../services/ai.service';
import { SupabaseCustomersService } from '../../../services/supabase-customers.service';
import { SupabaseModulesService } from '../../../services/supabase-modules.service';
import { ToastService } from '../../../services/toast.service';
import { HoldedIntegrationService } from '../../../services/holded-integration.service';
import { firstValueFrom } from 'rxjs';
import { RealtimeChannel } from '@supabase/supabase-js';
import {
  Quote,
  QuoteStatus,
  QUOTE_STATUS_LABELS,
  QUOTE_STATUS_COLORS,
  formatQuoteNumber,
  isQuoteExpired,
} from '../../../models/quote.model';
import { TranslocoPipe } from '@jsverse/transloco';

@Component({
  selector: 'app-quote-list',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, TranslocoPipe],
  template: `
    <div class="px-4 py-6 md:px-0">
      <!-- Toolbar - SIN contenedor blanco (exactamente como invoice-list) -->
      <div class="mb-6 flex flex-col md:flex-row md:items-center gap-4">
        <!-- Buscador -->
        <div class="w-full md:flex-1">
          <div class="relative">
            <input
              type="text"
              [placeholder]="'quotes.list.buscar' | transloco"
              [ngModel]="searchTerm()"
              (ngModelChange)="searchTerm.set($event)"
              class="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent"
            />
            <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg
                class="h-4 w-4 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
          </div>
        </div>

        <!-- Filtros -->
        <div class="flex flex-col sm:flex-row gap-3">
          <select
            [ngModel]="statusFilter()"
            (ngModelChange)="statusFilter.set($event)"
            class="w-full sm:w-auto px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
          >
            <option value="">{{ 'quotes.estadoTodos' | transloco }}</option>
            <option value="draft">{{ 'quotes.borrador' | transloco }}</option>
            <option value="request">{{ 'quotes.solicitado' | transloco }}</option>
            <option value="sent">{{ 'quotes.enviado' | transloco }}</option>
            <option value="accepted">{{ 'quotes.aceptado' | transloco }}</option>
            <option value="rejected">{{ 'quotes.rechazado' | transloco }}</option>
            <option value="expired">{{ 'quotes.expirado' | transloco }}</option>
          </select>

          <select
            [ngModel]="sortBy()"
            (ngModelChange)="sortBy.set($event)"
            class="w-full sm:w-auto px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
          >
            <option value="date-desc">{{ 'quotes.recientes' | transloco }}</option>
            <option value="date-asc">{{ 'quotes.antiguos' | transloco }}</option>
            <option value="amount-desc">{{ 'quotes.mayorImporte' | transloco }}</option>
            <option value="amount-asc">{{ 'quotes.menorImporte' | transloco }}</option>
            <option value="client-asc">{{ 'quotes.clienteAZ' | transloco }}</option>
          </select>
        </div>
      </div>

      <!-- Holded Estimates Panel - CON contenedor blanco (exactamente como invoice-list) -->
      @if (holdedService.isActive()) {
        <div
          class="mb-6 bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700"
        >
          <button
            type="button"
            class="w-full flex items-center justify-between px-4 py-3 text-left"
            (click)="holdedExpanded.set(!holdedExpanded())"
          >
            <div class="flex items-center gap-2">
              <span class="text-sm font-semibold text-gray-700 dark:text-gray-200"
                >Presupuestos en Holded</span
              >
              @if (loadingHolded()) {
                <span class="text-xs text-gray-400 dark:text-gray-500">Cargando...</span>
              } @else {
                <span
                  class="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full"
                  >{{ holdedEstimates().length }}</span
                >
              }
            </div>
            <svg
              class="w-4 h-4 text-gray-400 transition-transform"
              [class.rotate-180]="holdedExpanded()"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
          @if (holdedExpanded()) {
            @if (holdedError()) {
              <div class="px-4 pb-4 text-sm text-red-500 dark:text-red-400">
                {{ holdedError() }}
              </div>
            } @else if (loadingHolded()) {
              <div class="px-4 pb-4 text-sm text-gray-500 dark:text-gray-400">
                Cargando presupuestos de Holded...
              </div>
            } @else if (holdedEstimates().length === 0) {
              <div class="px-4 pb-4 text-sm text-gray-500 dark:text-gray-400">
                No se encontraron presupuestos en Holded.
              </div>
            } @else {
              <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-100 dark:divide-gray-700 text-sm">
                  <thead class="bg-gray-50 dark:bg-gray-700/50">
                    <tr>
                      <th
                        class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase"
                      >
                        Número
                      </th>
                      <th
                        class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase"
                      >
                        Contacto
                      </th>
                      <th
                        class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase"
                      >
                        Fecha
                      </th>
                      <th
                        class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase"
                      >
                        Estado
                      </th>
                      <th
                        class="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase"
                      >
                        Total
                      </th>
                      <th class="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
                    @for (est of holdedEstimates(); track est['id']) {
                      <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td
                          class="px-4 py-3 font-mono font-medium text-gray-900 dark:text-white whitespace-nowrap"
                        >
                          {{ est['docNumber'] || est['num'] || '—' }}
                        </td>
                        <td class="px-4 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                          {{ est['contactName'] || est['contact'] || '—' }}
                        </td>
                        <td class="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                          {{ est['date'] ? (est['date'] * 1000 | date: 'dd/MM/yyyy') : '—' }}
                        </td>
                        <td class="px-4 py-3 whitespace-nowrap">
                          <span
                            class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                          >
                            {{ est['status'] || '—' }}
                          </span>
                        </td>
                        <td
                          class="px-4 py-3 text-right font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap"
                        >
                          {{ est['total'] ?? est['amount'] ?? 0 | number: '1.2-2' }} €
                        </td>
                        <td class="px-4 py-3 text-right">
                          <a
                            href="https://app.holded.com/invoices/estimate/{{ est['id'] }}"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                            >Ver en Holded</a
                          >
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          }
        </div>
      }

      <!-- Desktop Table View (Hidden on Mobile) - CON contenedor blanco (exactamente como invoice-list) -->
      <div
        class="hidden md:block bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 overflow-hidden"
      >
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead class="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                <th
                  class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                >
                  {{ 'quotes.numero' | transloco }}
                </th>
                <th
                  class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                >
                  {{ 'quotes.cliente' | transloco }}
                </th>
                <th
                  class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                >
                  {{ 'quotes.fecha' | transloco }}
                </th>
                <th
                  class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                >
                  {{ 'quotes.estado' | transloco }}
                </th>
                <th
                  class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                >
                  {{ 'quotes.total' | transloco }}
                </th>
                <th class="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
              @for (quote of filteredQuotes(); track quote.id) {
                <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <td
                    class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white"
                  >
                    {{ formatQuoteNumber(quote) }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                    {{
                      quote.client?.business_name ||
                        quote.client?.name ||
                        ('quotes.clienteSinNombre' | transloco)
                    }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {{ quote.quote_date | date: 'dd/MM/yyyy' }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span
                      class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border"
                      [ngClass]="getStatusClass(quote)"
                    >
                      {{ getStatusLabel(quote) }}
                    </span>
                  </td>
                  <td
                    class="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-gray-900 dark:text-gray-100"
                  >
                    {{ formatCurrency(displayTotal(quote)) }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div class="flex items-center justify-end gap-3">
                      <button
                        class="text-gray-400 hover:text-blue-600 transition-colors"
                        [routerLink]="['/presupuestos', quote.id]"
                        title="Ver"
                      >
                        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                          />
                        </svg>
                      </button>
                      <button
                        class="text-gray-400 hover:text-red-600 transition-colors"
                        (click)="downloadPdf(quote.id)"
                        title="Descargar PDF"
                      >
                        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                          />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="6" class="px-6 py-12 text-center">
                    <div
                      class="flex flex-col items-center justify-center text-gray-400 dark:text-gray-500"
                    >
                      <svg
                        class="h-12 w-12 mb-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                      <span class="text-base font-medium">{{
                        'quotes.noPresupuestosEncontrados' | transloco
                      }}</span>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      <!-- Mobile Card View (Visible on Mobile) - exactametne como invoice-list -->
      <div class="md:hidden space-y-4">
        @for (quote of filteredQuotes(); track quote.id) {
          <div
            class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4"
          >
            <div class="flex justify-between items-start mb-3">
              <div>
                <div class="text-lg font-bold text-gray-900 dark:text-white">
                  {{ formatQuoteNumber(quote) }}
                </div>
                <div class="text-sm text-gray-500 dark:text-gray-400">
                  {{ quote.quote_date | date: 'dd MMM yyyy' }}
                </div>
              </div>
              <span
                class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border"
                [ngClass]="getStatusClass(quote)"
              >
                {{ getStatusLabel(quote) }}
              </span>
            </div>

            <div class="mb-4">
              <div class="text-sm font-medium text-gray-700 dark:text-gray-200">
                {{ quote.client?.business_name || quote.client?.name || 'Cliente sin nombre' }}
              </div>
              <div class="text-xl font-bold text-gray-900 dark:text-white mt-1">
                {{ formatCurrency(displayTotal(quote)) }}
              </div>
            </div>

            <div
              class="flex items-center justify-between border-t border-gray-100 dark:border-gray-700 pt-3 mt-3"
            >
              <button
                class="text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 flex items-center gap-1"
                (click)="downloadPdf(quote.id)"
              >
                <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                PDF
              </button>
              <a
                [routerLink]="['/presupuestos', quote.id]"
                class="inline-flex items-center justify-center px-4 py-2 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 text-sm font-medium rounded-lg hover:bg-blue-100 transition-colors"
              >
                {{ 'quotes.verDetalle' | transloco }}
                <svg class="ml-1.5 w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </a>
            </div>
          </div>
        } @empty {
          <div
            class="text-center py-12 bg-white dark:bg-gray-800 rounded-lg border border-dashed border-gray-300 dark:border-gray-700"
          >
            <svg
              class="h-12 w-12 mx-auto text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {{ 'quotes.noPresupuestosEncontrados' | transloco }}
            </p>
          </div>
        }
      </div>

      <!-- Floating Action Button -->
      <button (click)="createQuote()" class="fab-button" [title]="'quotes.nuevo' | transloco">
        <i class="fas fa-plus"></i>
      </button>
    </div>
  `,
  styleUrl: './quote-list.component.scss',
})
export class QuoteListComponent implements OnInit, OnDestroy {
  private quotesService = inject(SupabaseQuotesService);
  private settingsService = inject(SupabaseSettingsService);
  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private customersService = inject(SupabaseCustomersService);
  private modulesService = inject(SupabaseModulesService);
  private aiService = inject(AiService);
  private toastService = inject(ToastService);
  holdedService = inject(HoldedIntegrationService);

  holdedEstimates = signal<any[]>([]);
  loadingHolded = signal(false);
  holdedExpanded = signal(true);
  holdedError = signal<string | null>(null);

  quotes = signal<Quote[]>([]);
  searchTerm = signal<string>('');
  statusFilter = signal<string>('');
  sortBy = signal<string>('date-desc');

  // Tax configuration
  pricesIncludeTax = signal<boolean>(false);

  // AI Module Check
  hasAiModule = signal(false);
  isRecording = signal(false);
  isProcessingAudio = signal(false);
  mediaRecorder: MediaRecorder | null = null;
  audioChunks: any[] = [];

  subscription: RealtimeChannel | null = null;

  // Filtered and sorted quotes
  filteredQuotes = computed(() => {
    let filtered = this.quotes();

    // Apply search filter
    const search = this.searchTerm().toLowerCase();
    if (search) {
      filtered = filtered.filter(
        (q) =>
          this.formatQuoteNumber(q).toLowerCase().includes(search) ||
          (q.client?.business_name || q.client?.name || '').toLowerCase().includes(search) ||
          (q.title || '').toLowerCase().includes(search),
      );
    }

    // Apply status filter
    const status = this.statusFilter();
    if (status) {
      filtered = filtered.filter((q) => q.status === status);
    }

    // Apply sorting
    const sort = this.sortBy();
    return filtered.sort((a, b) => {
      switch (sort) {
        case 'date-asc':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'date-desc':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'amount-asc':
          return this.displayTotal(a) - this.displayTotal(b);
        case 'amount-desc':
          return this.displayTotal(b) - this.displayTotal(a);
        case 'client-asc':
          return (a.client?.name || '').localeCompare(b.client?.name || '');
        default:
          return 0;
      }
    });
  });

  ngOnInit() {
    // Check for query params (status filter from home)
    this.route.queryParams.subscribe((params) => {
      if (params['status']) {
        this.statusFilter.set(params['status']);
      }
    });

    this.modulesService.fetchEffectiveModules().subscribe((modules) => {
      const hasAi = modules.some((m) => m.key === 'ai' && m.enabled);
      this.hasAiModule.set(hasAi);
    });

    this.loadTaxSettings().finally(async () => {
      await this.loadQuotes();
      await this.holdedService.loadIntegration();
      this.loadHoldedEstimates();
      this.setupRealtimeSubscription();
    });
  }

  ngOnDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  private async loadHoldedEstimates(): Promise<void> {
    if (!this.holdedService.isActive()) return;
    this.loadingHolded.set(true);
    this.holdedError.set(null);
    try {
      const result = await this.holdedService.listDocuments('documents/estimate', { page: '1' });
      this.holdedEstimates.set(result as any[]);
    } catch (e: any) {
      this.holdedError.set(e?.message ?? 'Error al cargar presupuestos de Holded');
    } finally {
      this.loadingHolded.set(false);
    }
  }

  private async loadTaxSettings(): Promise<void> {
    try {
      const [app, company] = await Promise.all([
        firstValueFrom(this.settingsService.getAppSettings()),
        firstValueFrom(this.settingsService.getCompanySettings()),
      ]);
      const effectivePricesIncludeTax =
        company?.prices_include_tax ?? app?.default_prices_include_tax ?? false;
      this.pricesIncludeTax.set(!!effectivePricesIncludeTax);
    } catch {
      // keep defaults
    }
  }

  private async loadQuotes(): Promise<void> {
    try {
      const result = await firstValueFrom(this.quotesService.getQuotes());
      this.quotes.set(result.data || []);
    } catch (err) {
      console.error('Error loading quotes', err);
    }
  }

  createQuote() {
    this.router.navigate(['/presupuestos/new']);
  }

  formatQuoteNumber(quote: Quote): string {
    return formatQuoteNumber(quote);
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);
  }

  // Compute display total with VAT according to settings
  displayTotal(quote: Quote): number {
    const items = (quote.items || []) as any[];
    if (!items.length) {
      return Number(quote.total_amount || 0);
    }

    let subtotal = 0;
    let taxAmount = 0;

    for (const item of items) {
      const qty = Number(item.quantity) || 0;
      const price = Number((item.unit_price ?? item.price ?? item.price_per_unit) || 0);
      const discount = Number(item.discount_percent || 0);
      const taxRate = Number(item.tax_rate || 0);

      const itemSubtotal = qty * price;
      const itemDiscount = itemSubtotal * (discount / 100);
      const itemNet = itemSubtotal - itemDiscount;
      const itemTax = itemNet * (taxRate / 100);
      subtotal += itemNet;
      taxAmount += itemTax;
    }

    return Math.round((subtotal + taxAmount) * 100) / 100;
  }

  getStatusLabel(quote: Quote): string {
    const status = quote.status;
    const map: Record<string, string> = {
      draft: 'Borrador',
      request: 'Solicitado',
      sent: 'Enviado',
      accepted: 'Aceptado',
      rejected: 'Rechazado',
      expired: 'Expirado',
    };
    return map[status] || status;
  }

  getStatusClass(quote: Quote): string {
    const status = quote.status;
    const map: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
      request: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200',
      sent: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
      accepted: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
      rejected: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
      expired: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
    };
    return map[status] || 'bg-gray-100 text-gray-800';
  }

  downloadPdf(id: string) {
    this.quotesService.getQuotePdfUrl(id).subscribe({
      next: (signed) => window.open(signed, '_blank'),
      error: (e) => console.error('PDF error', e),
    });
  }

  setupRealtimeSubscription() {
    if (this.subscription) return;

    this.subscription = this.quotesService.subscribeToQuoteChanges((payload) => {
      if (payload.eventType === 'UPDATE') {
        this.quotes.update((quotes) =>
          quotes.map((q) => (q.id === payload.new.id ? { ...q, ...payload.new } : q)),
        );
      } else if (payload.eventType === 'INSERT') {
        this.quotes.update((quotes) => [payload.new, ...quotes]);
      } else if (payload.eventType === 'DELETE') {
        this.quotes.update((quotes) => quotes.filter((q) => q.id !== payload.old.id));
      }
    });
  }
}
