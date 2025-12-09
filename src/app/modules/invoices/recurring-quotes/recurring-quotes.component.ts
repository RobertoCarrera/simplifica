import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SupabaseClientService } from '../../../services/supabase-client.service';
import { SupabaseSettingsService } from '../../../services/supabase-settings.service';
import { firstValueFrom } from 'rxjs';

interface RecurringQuote {
  id: string;
  quote_number: string;
  full_quote_number?: string;
  title: string;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  currency: string;
  recurrence_type: string;
  recurrence_interval: number;
  recurrence_day?: number;
  next_run_at: string | null;
  last_run_at: string | null;
  recurrence_end_date?: string | null;
  status: string;
  client?: {
    id: string;
    name: string;
  };
  invoices_generated?: number;
}

interface GeneratedInvoice {
  id: string;
  invoice_number: string;
  invoice_series: string;
  invoice_date: string;
  total: number;
  status: string;
  recurrence_period: string;
}

@Component({
  selector: 'app-recurring-quotes',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  template: `
  <div>
    <!-- Stats Cards -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-4">
        <div class="flex items-center">
          <div class="flex-shrink-0 w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
            <svg class="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>
          <div class="ml-4">
            <p class="text-sm font-medium text-gray-500 dark:text-gray-400">Activos</p>
            <p class="text-2xl font-semibold text-gray-900 dark:text-gray-100">{{ stats().active }}</p>
          </div>
        </div>
      </div>

      <div class="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-4">
        <div class="flex items-center">
          <div class="flex-shrink-0 w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
            <svg class="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div class="ml-4">
            <p class="text-sm font-medium text-gray-500 dark:text-gray-400">Próximos 7 días</p>
            <p class="text-2xl font-semibold text-gray-900 dark:text-gray-100">{{ stats().upcoming }}</p>
          </div>
        </div>
      </div>

      <div class="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-4">
        <div class="flex items-center">
          <div class="flex-shrink-0 w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
            <svg class="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div class="ml-4">
            <p class="text-sm font-medium text-gray-500 dark:text-gray-400">Facturas Generadas</p>
            <p class="text-2xl font-semibold text-gray-900 dark:text-gray-100">{{ stats().invoicesGenerated }}</p>
          </div>
        </div>
      </div>

      <div class="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-4">
        <div class="flex items-center">
          <div class="flex-shrink-0 w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center">
            <svg class="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div class="ml-4">
            <p class="text-sm font-medium text-gray-500 dark:text-gray-400">Ingresos/Mes</p>
            <p class="text-2xl font-semibold text-gray-900 dark:text-gray-100">{{ stats().monthlyRevenue | number:'1.2-2' }}€</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Main Content -->
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700">
      <div class="p-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
        <h2 class="text-lg font-medium text-gray-800 dark:text-gray-200">Presupuestos Recurrentes</h2>
        <div class="flex items-center gap-2">
          <select [(ngModel)]="statusFilter" (ngModelChange)="applyFilters()"
                  class="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200">
            <option value="">Todos</option>
            <option value="active">Activos</option>
            <option value="paused">Pausados</option>
          </select>
        </div>
      </div>

      @if (loading()) {
        <div class="p-8 text-center">
          <div class="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p class="mt-2 text-gray-500 dark:text-gray-400">Cargando...</p>
        </div>
      } @else if (filteredQuotes().length === 0) {
        <div class="p-8 text-center">
          <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">No hay presupuestos recurrentes</h3>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Crea un presupuesto y configúralo como recurrente para automatizar la facturación.
          </p>
          <div class="mt-6">
            <a routerLink="/presupuestos/nuevo" 
               class="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700">
              + Nuevo Presupuesto
            </a>
          </div>
        </div>
      } @else {
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead class="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Presupuesto</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Cliente</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Frecuencia</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Próxima Factura</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Estado</th>
                <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Importe</th>
                <th class="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
              @for (quote of filteredQuotes(); track quote.id) {
                <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <td class="px-4 py-3">
                    <div class="flex items-center">
                      <span class="inline-flex items-center justify-center w-8 h-8 rounded-lg text-xs font-bold mr-3"
                            [class]="getRecurrenceBadgeClass(quote.recurrence_type)">
                        {{ getRecurrenceLetter(quote.recurrence_type) }}
                      </span>
                      <div>
                        <a [routerLink]="['/presupuestos', quote.id]" 
                           class="text-sm font-medium text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400">
                          {{ quote.full_quote_number || quote.quote_number }}
                        </a>
                        <p class="text-xs text-gray-500 dark:text-gray-400">{{ quote.title }}</p>
                      </div>
                    </div>
                  </td>
                  <td class="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                    {{ quote.client?.name || '—' }}
                  </td>
                  <td class="px-4 py-3">
                    <span class="text-sm text-gray-900 dark:text-gray-100">{{ formatRecurrence(quote) }}</span>
                    @if (quote.recurrence_end_date) {
                      <p class="text-xs text-gray-500 dark:text-gray-400">Hasta {{ formatDate(quote.recurrence_end_date) }}</p>
                    }
                  </td>
                  <td class="px-4 py-3">
                    @if (quote.next_run_at) {
                      <span class="text-sm" [class]="isUpcoming(quote.next_run_at) ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-gray-900 dark:text-gray-100'">
                        {{ formatDate(quote.next_run_at) }}
                      </span>
                      <p class="text-xs text-gray-500 dark:text-gray-400">{{ getRelativeDate(quote.next_run_at) }}</p>
                    } @else {
                      <span class="text-sm text-gray-400">—</span>
                    }
                  </td>
                  <td class="px-4 py-3">
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                          [class]="getStatusClass(quote)">
                      {{ getStatusLabel(quote) }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-right">
                    <span class="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {{ getDisplayAmount(quote) | number:'1.2-2' }} {{ quote.currency || 'EUR' }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-right">
                    <div class="flex items-center justify-end gap-1">
                      <!-- View History -->
                      <button (click)="viewHistory(quote)" 
                              class="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
                              title="Ver historial de facturas">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                      </button>
                      <!-- Pause/Resume -->
                      @if (quote.status === 'accepted' || quote.status === 'active') {
                        <button (click)="pauseRecurrence(quote)" 
                                class="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-amber-500"
                                title="Pausar recurrencia">
                          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </button>
                      } @else {
                        <button (click)="resumeRecurrence(quote)" 
                                class="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-emerald-500"
                                title="Reactivar recurrencia">
                          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </button>
                      }
                      <!-- Cancel Recurrence -->
                      <button (click)="cancelRecurrence(quote)" 
                              class="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-red-500"
                              title="Cancelar recurrencia">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                      <!-- Edit -->
                      <a [routerLink]="['/presupuestos', quote.id, 'editar']" 
                         class="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-blue-500"
                         title="Editar presupuesto">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </a>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    <!-- History Modal -->
    @if (showHistoryModal()) {
      <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" (click)="closeHistory()">
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden"
             (click)="$event.stopPropagation()">
          <div class="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100">
              Historial de Facturas
            </h3>
            <button (click)="closeHistory()" class="text-gray-400 hover:text-gray-500">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div class="p-4 overflow-y-auto max-h-[60vh]">
            @if (selectedQuote()) {
              <div class="mb-4 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <p class="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {{ selectedQuote()!.full_quote_number || selectedQuote()!.quote_number }}
                </p>
                <p class="text-xs text-gray-500 dark:text-gray-400">{{ selectedQuote()!.title }}</p>
              </div>
            }
            @if (generatedInvoices().length === 0) {
              <p class="text-center text-gray-500 dark:text-gray-400 py-8">
                No se han generado facturas aún para este presupuesto.
              </p>
            } @else {
              <div class="space-y-2">
                @for (inv of generatedInvoices(); track inv.id) {
                  <a [routerLink]="['/facturacion', inv.id]" 
                     class="block p-3 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <div class="flex items-center justify-between">
                      <div>
                        <p class="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {{ inv.invoice_series }}-{{ inv.invoice_number }}
                        </p>
                        <p class="text-xs text-gray-500 dark:text-gray-400">
                          {{ formatDate(inv.invoice_date) }} · Período: {{ inv.recurrence_period }}
                        </p>
                      </div>
                      <div class="text-right">
                        <p class="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {{ inv.total | number:'1.2-2' }}€
                        </p>
                        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                              [class]="getInvoiceStatusClass(inv.status)">
                          {{ getInvoiceStatusLabel(inv.status) }}
                        </span>
                      </div>
                    </div>
                  </a>
                }
              </div>
            }
          </div>
        </div>
      </div>
    }
  </div>
  `
})
export class RecurringQuotesComponent implements OnInit {
  private supabase = inject(SupabaseClientService);
  private settingsService = inject(SupabaseSettingsService);

  quotes = signal<RecurringQuote[]>([]);
  filteredQuotes = signal<RecurringQuote[]>([]);
  loading = signal(true);
  statusFilter = '';

  // Tax configuration
  pricesIncludeTax = signal<boolean>(false);

  // History modal
  showHistoryModal = signal(false);
  selectedQuote = signal<RecurringQuote | null>(null);
  generatedInvoices = signal<GeneratedInvoice[]>([]);

  stats = computed(() => {
    const q = this.quotes();
    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    const active = q.filter(x => x.status === 'accepted' || x.status === 'active').length;
    const upcoming = q.filter(x => {
      if (!x.next_run_at) return false;
      const nextDate = new Date(x.next_run_at);
      return nextDate >= now && nextDate <= weekFromNow;
    }).length;
    
    const invoicesGenerated = q.reduce((sum, x) => sum + (x.invoices_generated || 0), 0);
    
    // Monthly revenue (sum of all monthly equivalents) using display amount
    const monthlyRevenue = q
      .filter(x => x.status === 'accepted' || x.status === 'active')
      .reduce((sum, x) => {
        const amount = this.getDisplayAmount(x);
        switch (x.recurrence_type) {
          case 'weekly': return sum + (amount * 4.33);
          case 'monthly': return sum + amount;
          case 'trimestral':
          case 'quarterly': return sum + (amount / 3);
          case 'annual':
          case 'yearly': return sum + (amount / 12);
          default: return sum + amount;
        }
      }, 0);

    return { active, upcoming, invoicesGenerated, monthlyRevenue };
  });

  ngOnInit(): void {
    this.loadTaxSettings().finally(() => this.loadRecurringQuotes());
  }

  private async loadTaxSettings(): Promise<void> {
    try {
      const [app, company] = await Promise.all([
        firstValueFrom(this.settingsService.getAppSettings()),
        firstValueFrom(this.settingsService.getCompanySettings())
      ]);
      const effectivePricesIncludeTax = (company?.prices_include_tax ?? null) ?? (app?.default_prices_include_tax ?? false);
      this.pricesIncludeTax.set(effectivePricesIncludeTax);
    } catch (err) {
      console.error('Error loading tax settings:', err);
      this.pricesIncludeTax.set(false);
    }
  }

  private async loadRecurringQuotes(): Promise<void> {
    this.loading.set(true);
    try {
      const client = this.supabase.instance;
      
      // Load recurring quotes
      const { data: quotes, error } = await client
        .from('quotes')
        .select(`
          id, quote_number, full_quote_number, title,
          subtotal, tax_amount, total_amount, currency, status,
          recurrence_type, recurrence_interval, recurrence_day,
          next_run_at, last_run_at, recurrence_end_date,
          client:clients(id, name)
        `)
        .not('recurrence_type', 'is', null)
        .neq('recurrence_type', 'none')
        .neq('recurrence_type', 'proyecto')
        .order('next_run_at', { ascending: true });

      if (error) throw error;

      // Count generated invoices for each quote
      const quotesWithCounts = await Promise.all(
        (quotes || []).map(async (q: any) => {
          const { count } = await client
            .from('invoices')
            .select('id', { count: 'exact', head: true })
            .eq('source_quote_id', q.id);
          return { ...q, invoices_generated: count || 0 };
        })
      );

      this.quotes.set(quotesWithCounts);
      this.applyFilters();
    } catch (err) {
      console.error('Error loading recurring quotes:', err);
    } finally {
      this.loading.set(false);
    }
  }

  applyFilters(): void {
    let filtered = this.quotes();
    
    if (this.statusFilter === 'active') {
      filtered = filtered.filter(q => q.status === 'accepted' || q.status === 'active');
    } else if (this.statusFilter === 'paused') {
      filtered = filtered.filter(q => q.status !== 'accepted' && q.status !== 'active');
    }
    
    this.filteredQuotes.set(filtered);
  }

  async viewHistory(quote: RecurringQuote): Promise<void> {
    this.selectedQuote.set(quote);
    this.showHistoryModal.set(true);
    
    try {
      const client = this.supabase.instance;
      const { data, error } = await client
        .from('invoices')
        .select('id, invoice_number, invoice_series, invoice_date, total, status, recurrence_period')
        .eq('source_quote_id', quote.id)
        .order('invoice_date', { ascending: false });

      if (error) throw error;
      this.generatedInvoices.set(data || []);
    } catch (err) {
      console.error('Error loading invoice history:', err);
      this.generatedInvoices.set([]);
    }
  }

  closeHistory(): void {
    this.showHistoryModal.set(false);
    this.selectedQuote.set(null);
    this.generatedInvoices.set([]);
  }

  async pauseRecurrence(quote: RecurringQuote): Promise<void> {
    if (!confirm(`¿Pausar la facturación recurrente de "${quote.title}"?`)) return;
    
    try {
      const client = this.supabase.instance;
      await client
        .from('quotes')
        .update({ status: 'paused' })
        .eq('id', quote.id);
      
      await this.loadRecurringQuotes();
    } catch (err) {
      console.error('Error pausing recurrence:', err);
      alert('Error al pausar la recurrencia');
    }
  }

  async resumeRecurrence(quote: RecurringQuote): Promise<void> {
    try {
      const client = this.supabase.instance;
      
      // If next_run_at is in the past, update it to now
      const updates: any = { status: 'accepted' };
      if (quote.next_run_at && new Date(quote.next_run_at) < new Date()) {
        updates.next_run_at = new Date().toISOString();
      }
      
      await client
        .from('quotes')
        .update(updates)
        .eq('id', quote.id);
      
      await this.loadRecurringQuotes();
    } catch (err) {
      console.error('Error resuming recurrence:', err);
      alert('Error al reactivar la recurrencia');
    }
  }

  async cancelRecurrence(quote: RecurringQuote): Promise<void> {
    if (!confirm(`¿Cancelar definitivamente la facturación recurrente de "${quote.title}"?\n\nEsto no eliminará el presupuesto, solo desactivará la generación automática de facturas.`)) return;
    
    try {
      const client = this.supabase.instance;
      await client
        .from('quotes')
        .update({ 
          recurrence_type: 'none',
          next_run_at: null 
        })
        .eq('id', quote.id);
      
      await this.loadRecurringQuotes();
    } catch (err) {
      console.error('Error canceling recurrence:', err);
      alert('Error al cancelar la recurrencia');
    }
  }

  // Format helpers
  getDisplayAmount(quote: RecurringQuote): number {
    // Si los precios incluyen IVA, mostrar el subtotal (sin IVA)
    // Si no incluyen IVA, mostrar el total_amount (con IVA)
    return this.pricesIncludeTax() ? (quote.subtotal || 0) : (quote.total_amount || 0);
  }

  formatRecurrence(quote: RecurringQuote): string {
    const interval = quote.recurrence_interval || 1;
    const type = quote.recurrence_type;
    
    const typeLabels: { [key: string]: [string, string] } = {
      'daily': ['Diario', 'días'],
      'weekly': ['Semanal', 'semanas'],
      'monthly': ['Mensual', 'meses'],
      'trimestral': ['Trimestral', 'trimestres'],
      'quarterly': ['Trimestral', 'trimestres'],
      'annual': ['Anual', 'años'],
      'yearly': ['Anual', 'años']
    };
    
    const [singular, plural] = typeLabels[type] || [type, type];
    
    if (interval === 1) {
      return singular;
    }
    return `Cada ${interval} ${plural}`;
  }

  getRecurrenceLetter(type: string): string {
    const map: { [key: string]: string } = {
      'daily': 'D',
      'weekly': 'S',
      'monthly': 'M',
      'trimestral': 'T',
      'quarterly': 'T',
      'annual': 'A',
      'yearly': 'A'
    };
    return map[type] || 'R';
  }

  getRecurrenceBadgeClass(type: string): string {
    const map: { [key: string]: string } = {
      'daily': 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
      'weekly': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-200',
      'monthly': 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
      'trimestral': 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200',
      'quarterly': 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200',
      'annual': 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
      'yearly': 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
    };
    return map[type] || 'bg-gray-100 text-gray-800';
  }

  formatDate(dateStr: string | null): string {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  getRelativeDate(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return `Hace ${Math.abs(diffDays)} días`;
    if (diffDays === 0) return 'Hoy';
    if (diffDays === 1) return 'Mañana';
    if (diffDays <= 7) return `En ${diffDays} días`;
    if (diffDays <= 30) return `En ${Math.ceil(diffDays / 7)} semanas`;
    return `En ${Math.ceil(diffDays / 30)} meses`;
  }

  isUpcoming(dateStr: string): boolean {
    const date = new Date(dateStr);
    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    return date >= now && date <= weekFromNow;
  }

  getStatusLabel(quote: RecurringQuote): string {
    if (quote.status === 'accepted' || quote.status === 'active') return 'Activo';
    if (quote.status === 'paused') return 'Pausado';
    return 'Inactivo';
  }

  getStatusClass(quote: RecurringQuote): string {
    if (quote.status === 'accepted' || quote.status === 'active') {
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200';
    }
    if (quote.status === 'paused') {
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200';
    }
    return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
  }

  getInvoiceStatusLabel(status: string): string {
    const map: { [key: string]: string } = {
      'draft': 'Borrador',
      'approved': 'Aprobada',
      'issued': 'Emitida',
      'sent': 'Enviada',
      'paid': 'Pagada',
      'partial': 'Parcial',
      'overdue': 'Vencida',
      'cancelled': 'Cancelada'
    };
    return map[status] || status;
  }

  getInvoiceStatusClass(status: string): string {
    const map: { [key: string]: string } = {
      'draft': 'bg-gray-100 text-gray-800',
      'approved': 'bg-indigo-100 text-indigo-800',
      'issued': 'bg-purple-100 text-purple-800',
      'sent': 'bg-blue-100 text-blue-800',
      'paid': 'bg-emerald-100 text-emerald-800',
      'partial': 'bg-yellow-100 text-yellow-800',
      'overdue': 'bg-red-100 text-red-800',
      'cancelled': 'bg-red-100 text-red-800'
    };
    return map[status] || 'bg-gray-100 text-gray-800';
  }
}
