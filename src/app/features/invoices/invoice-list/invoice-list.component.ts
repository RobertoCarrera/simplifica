import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SupabaseInvoicesService } from '../../../services/supabase-invoices.service';
import { SupabaseModulesService } from '../../../services/supabase-modules.service';
import { SupabaseSettingsService } from '../../../services/supabase-settings.service';
import { ToastService } from '../../../services/toast.service';
import { HoldedIntegrationService } from '../../../services/holded-integration.service';
import { Invoice, formatInvoiceNumber, InvoiceStatus } from '../../../models/invoice.model';
import { environment } from '../../../../environments/environment';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-invoice-list',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  template: `
    <div class="px-4 py-6 md:px-0">
      <!-- Filters and Search -->
      <div class="mb-6 flex flex-col md:flex-row md:items-center gap-4">
        <!-- Search -->
        <div class="w-full md:flex-1">
          <div class="relative">
            <input
              type="text"
              placeholder="Buscar factura..."
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

        <!-- Filters Group -->
        <div class="flex flex-col sm:flex-row gap-3">
          <select
            [ngModel]="statusFilter()"
            (ngModelChange)="statusFilter.set($event)"
            class="w-full sm:w-auto px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Estado: Todos</option>
            <option value="draft">Borrador</option>
            <option value="issued">Emitida</option>
            <option value="sent">Enviada</option>
            <option value="paid">Pagada</option>
            <option value="overdue">Vencida</option>
            <option value="rectificative">Rectificativa</option>
          </select>

          <select
            [ngModel]="sortBy()"
            (ngModelChange)="sortBy.set($event)"
            class="w-full sm:w-auto px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
          >
            <option value="date-desc">Recientes</option>
            <option value="date-asc">Antiguas</option>
            <option value="amount-desc">Mayor importe</option>
            <option value="amount-asc">Menor importe</option>
            <option value="client-asc">Cliente A-Z</option>
          </select>
        </div>

        <!-- Action Button -->
      </div>

      <!-- VeriFactu Badge (if enabled) -->
      @if (isVerifactuEnabled()) {
        <div class="mb-4 flex flex-wrap items-center gap-3">
          @if (dispatcherHealth(); as h) {
            <span
              class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium"
              [ngClass]="
                h.pending > 0
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
              "
            >
              <span
                class="w-2 h-2 rounded-full mr-1.5"
                [ngClass]="h.pending > 0 ? 'bg-amber-500' : 'bg-emerald-500'"
              ></span>
              {{ h.pending > 0 ? h.pending + ' pendientes' : 'VeriFactu OK' }}
            </span>
          }
          <a
            routerLink="/facturacion/verifactu-registry"
            class="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
          >
            Registro AEAT
          </a>
        </div>
      }

      <!-- Holded Invoices Panel -->
      @if (holdedService.isActive()) {
        <div class="mb-6 bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700">
          <button
            type="button"
            class="w-full flex items-center justify-between px-4 py-3 text-left"
            (click)="holdedExpanded.set(!holdedExpanded())"
          >
            <div class="flex items-center gap-2">
              <span class="text-sm font-semibold text-gray-700 dark:text-gray-200">Facturas en Holded</span>
              @if (loadingHolded()) {
                <span class="text-xs text-gray-400 dark:text-gray-500">Cargando...</span>
              } @else {
                <span class="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">{{ holdedInvoices().length }}</span>
              }
            </div>
            <svg class="w-4 h-4 text-gray-400 transition-transform" [class.rotate-180]="holdedExpanded()" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
            </svg>
          </button>
          @if (holdedExpanded()) {
            @if (holdedError()) {
              <div class="px-4 pb-4 text-sm text-red-500 dark:text-red-400">{{ holdedError() }}</div>
            } @else if (loadingHolded()) {
              <div class="px-4 pb-4 text-sm text-gray-500 dark:text-gray-400">Cargando facturas de Holded...</div>
            } @else if (holdedInvoices().length === 0) {
              <div class="px-4 pb-4 text-sm text-gray-500 dark:text-gray-400">No se encontraron facturas en Holded.</div>
            } @else {
              <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-100 dark:divide-gray-700 text-sm">
                  <thead class="bg-gray-50 dark:bg-gray-700/50">
                    <tr>
                      <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Número</th>
                      <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Contacto</th>
                      <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Fecha</th>
                      <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Estado</th>
                      <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Total</th>
                      <th class="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
                    @for (inv of holdedInvoices(); track inv['id']) {
                      <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td class="px-4 py-3 font-mono font-medium text-gray-900 dark:text-white whitespace-nowrap">{{ inv['docNumber'] || inv['num'] || '—' }}</td>
                        <td class="px-4 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap">{{ inv['contactName'] || inv['contact'] || '—' }}</td>
                        <td class="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">{{ (inv['date'] ? (inv['date'] * 1000 | date:'dd/MM/yyyy') : '—') }}</td>
                        <td class="px-4 py-3 whitespace-nowrap">
                          <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                            {{ inv['status'] || '—' }}
                          </span>
                        </td>
                        <td class="px-4 py-3 text-right font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">{{ (inv['total'] ?? inv['amount'] ?? 0) | number:'1.2-2' }} €</td>
                        <td class="px-4 py-3 text-right">
                          <a
                            href="https://app.holded.com/invoices/invoice/{{ inv['id'] }}"
                            target="_blank"
                            rel="noopener noreferrer"
                            class="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                          >Ver en Holded</a>
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

      <!-- Desktop Table View (Hidden on Mobile) -->
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
                  Número
                </th>
                <th
                  class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                >
                  Cliente
                </th>
                <th
                  class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                >
                  Fecha
                </th>
                <th
                  class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                >
                  Estado
                </th>
                <th
                  class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                >
                  Total
                </th>
                <th class="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
              @for (inv of filteredInvoices(); track inv.id) {
                <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <td
                    class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white"
                  >
                    {{ formatNumber(inv) }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                    {{ inv.client?.name || 'Cliente sin nombre' }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {{ inv.invoice_date | date: 'dd/MM/yyyy' }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span
                      class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border"
                      [ngClass]="getStatusClass(inv)"
                    >
                      {{ getStatusLabel(inv) }}
                    </span>
                  </td>
                  <td
                    class="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-gray-900 dark:text-gray-100"
                  >
                    {{ getDisplayAmount(inv) | number: '1.2-2' }} {{ inv.currency || 'EUR' }}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div class="flex items-center justify-end gap-3">
                      <button
                        class="text-gray-400 hover:text-blue-600 transition-colors"
                        [routerLink]="['/facturacion', inv.id]"
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
                        (click)="downloadPdf(inv.id)"
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
                      <span class="text-base font-medium">No se encontraron facturas</span>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      <!-- Mobile Card View (Visible on Mobile) -->
      <div class="md:hidden space-y-4">
        @for (inv of filteredInvoices(); track inv.id) {
          <div
            class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4"
          >
            <div class="flex justify-between items-start mb-3">
              <div>
                <div class="text-lg font-bold text-gray-900 dark:text-white">
                  {{ formatNumber(inv) }}
                </div>
                <div class="text-sm text-gray-500 dark:text-gray-400">
                  {{ inv.invoice_date | date: 'dd MMM yyyy' }}
                </div>
              </div>
              <span
                class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border"
                [ngClass]="getStatusClass(inv)"
              >
                {{ getStatusLabel(inv) }}
              </span>
            </div>

            <div class="mb-4">
              <div class="text-sm font-medium text-gray-700 dark:text-gray-200">
                {{ inv.client?.name || 'Cliente sin nombre' }}
              </div>
              <div class="text-xl font-bold text-gray-900 dark:text-white mt-1">
                {{ getDisplayAmount(inv) | number: '1.2-2' }} {{ inv.currency || 'EUR' }}
              </div>
            </div>

            <div
              class="flex items-center justify-between border-t border-gray-100 dark:border-gray-700 pt-3 mt-3"
            >
              <button
                class="text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 flex items-center gap-1"
                (click)="downloadPdf(inv.id)"
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
                [routerLink]="['/facturacion', inv.id]"
                class="inline-flex items-center justify-center px-4 py-2 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 text-sm font-medium rounded-lg hover:bg-blue-100 transition-colors"
              >
                Ver Detalle
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
            <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">No se encontraron facturas</p>
          </div>
        }
      </div>
      <!-- Floating Action Button -->
      <button (click)="createDraft()" class="fab-button" title="Nueva Factura">
        <i class="fas fa-plus"></i>
      </button>
    </div>
  `,
})
export class InvoiceListComponent {
  private invoicesService = inject(SupabaseInvoicesService);
  private modulesService = inject(SupabaseModulesService);
  private settingsService = inject(SupabaseSettingsService);
  private router = inject(Router);
  private toast = inject(ToastService);
  holdedService = inject(HoldedIntegrationService);

  holdedInvoices = signal<any[]>([]);
  loadingHolded = signal(false);
  holdedExpanded = signal(true);
  holdedError = signal<string | null>(null);

  invoices = signal<Invoice[]>([]);
  searchTerm = signal<string>('');
  statusFilter = signal<string>('');
  sortBy = signal<string>('date-desc');
  dispatcherHealth = signal<{
    pending: number;
    lastEventAt: string | null;
    lastAcceptedAt: string | null;
    lastRejectedAt: string | null;
  } | null>(null);
  pricesIncludeTax = signal<boolean>(false);

  // Module-based visibility
  isVerifactuEnabled = computed(() => {
    const modules = this.modulesService.modulesSignal();
    if (!modules) return false;
    const mod = modules.find((m) => m.key === 'moduloVerifactu');
    return mod?.enabled ?? false;
  });

  // Filtered and sorted invoices
  filteredInvoices = computed(() => {
    let filtered = this.invoices();

    // Apply search filter
    const search = this.searchTerm().toLowerCase();
    if (search) {
      filtered = filtered.filter(
        (inv) =>
          this.formatNumber(inv).toLowerCase().includes(search) ||
          (inv.client?.name || '').toLowerCase().includes(search) ||
          inv.client_id?.toLowerCase().includes(search),
      );
    }

    // Apply status filter
    const status = this.statusFilter();
    if (status === 'rectificative') {
      filtered = filtered.filter(
        (inv) => inv.invoice_type === 'rectificative' || (inv.total || 0) < 0,
      );
    } else if (status === 'issued') {
      filtered = filtered.filter(
        (inv) =>
          inv.status === 'issued' ||
          (inv.verifactu_status === 'accepted' && ['draft', 'approved'].includes(inv.status)),
      );
    } else if (status) {
      filtered = filtered.filter((inv) => inv.status === status);
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
          return (a.total || 0) - (b.total || 0);
        case 'amount-desc':
          return (b.total || 0) - (a.total || 0);
        case 'client-asc':
          return (a.client?.name || '').localeCompare(b.client?.name || '');
        default:
          return 0;
      }
    });
  });

  constructor() {
    this.init();
  }

  private async init() {
    this.loadTaxSettings();
    this.loadHoldedInvoices();

    if (!this.modulesService.modulesSignal()) {
      firstValueFrom(this.modulesService.fetchEffectiveModules()).catch(e => console.warn('Error fetching modules', e));
    }

    try {
      const list = await firstValueFrom(this.invoicesService.getInvoices());
      const normalInvoices = (list || []).filter((inv) => !inv.is_recurring);
      const sorted = normalInvoices.sort((a, b) => {
        const dateA = new Date(a.invoice_date).getTime();
        const dateB = new Date(b.invoice_date).getTime();
        return dateB - dateA;
      });
      this.invoices.set(sorted);
    } catch (err) {
      console.error('Error loading invoices', err);
    }
  }

  private async loadHoldedInvoices(): Promise<void> {
    if (!this.holdedService.isActive()) return;
    this.loadingHolded.set(true);
    this.holdedError.set(null);
    try {
      const result = await this.holdedService.listDocuments('documents/invoice', { page: '1' });
      this.holdedInvoices.set(result as any[]);
    } catch (e: any) {
      this.holdedError.set(e?.message ?? 'Error al cargar facturas de Holded');
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
      this.pricesIncludeTax.set(effectivePricesIncludeTax);
    } catch (err) {
      console.error('Error loading tax settings:', err);
      this.pricesIncludeTax.set(false);
    }
  }

  async downloadPdf(invoiceId: string) {
    try {
      const signed = await firstValueFrom(this.invoicesService.getInvoicePdfUrl(invoiceId));
      window.open(signed, '_blank');
    } catch (e) {
      console.error('PDF error', e);
    }
  }

  getDisplayAmount(invoice: Invoice): number {
    return invoice.total || 0;
  }

  formatNumber(inv: Invoice): string {
    return formatInvoiceNumber(inv);
  }

  getStatusLabel(inv: Invoice): string {
    if (inv.invoice_type === 'rectificative' || (inv.total || 0) < 0) {
      return 'Rectificativa';
    }
    if (inv.verifactu_status === 'accepted' && ['draft', 'approved'].includes(inv.status)) {
      return 'Emitida';
    }
    const status = inv.status;
    const map: Record<string, string> = {
      draft: 'Borrador',
      approved: 'Aprobada',
      issued: 'Emitida',
      final: 'Emitida',
      sent: 'Enviada',
      paid: 'Pagada',
      partial: 'Parcial',
      overdue: 'Vencida',
      cancelled: 'Cancelada',
      void: 'Anulada',
      rectified: 'Rectificada',
    };
    return map[status] || status;
  }

  getStatusClass(inv: Invoice): string {
    if (inv.verifactu_status === 'accepted' && ['draft', 'approved'].includes(inv.status)) {
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200';
    }
    const status = inv.status;
    const map: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
      approved: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200',
      issued: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200',
      final: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200',
      sent: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
      paid: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
      partial: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200',
      overdue: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
      cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
      void: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300 line-through',
      rectified: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200',
    };
    return map[status] || 'bg-gray-100 text-gray-800';
  }

  async createDraft() {
    try {
      const inv = await firstValueFrom(this.invoicesService.createInvoice({
        client_id: null as any,
        invoice_date: new Date().toISOString().split('T')[0],
        invoice_type: 'normal' as any,
        items: [],
      }));
      this.router.navigate(['/facturacion', inv.id]);
    } catch (err: any) {
      const msg = err?.message || err?.toString() || 'Error desconocido';
      const isNoSeriesError = msg.includes('ninguna serie');
      
      this.toast.error(
        'Error', 
        msg, 
        undefined, 
        false, 
        isNoSeriesError ? 'serie-error' : undefined,
        isNoSeriesError ? { label: 'Configurar serie', link: '/facturacion/series' } : undefined
      );
    }
  }
}
