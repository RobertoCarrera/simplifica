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
    <!-- Main Content -->
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700">

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
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Presupuesto
                </th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Cliente</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Frecuencia</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Próxima Factura</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  <div class="flex items-center gap-2">
                    <span>Estado</span>
                  </div>
                </th>
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
                          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
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
                      <!-- Edit Recurrence Day -->
                      <button (click)="openEditDay(quote)" 
                              class="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-blue-500"
                              title="Cambiar día de facturación">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    <!-- Edit Recurrence Day Modal -->
    @if (showEditDayModal()) {
      <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50" (click)="closeEditDay()">
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4"
             (click)="$event.stopPropagation()">
          <div class="p-4 border-b border-gray-200 dark:border-gray-700">
            <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100">
              Cambiar día de facturación
            </h3>
            <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {{ editingQuote()?.full_quote_number || editingQuote()?.quote_number }} - {{ editingQuote()?.title }}
            </p>
          </div>
          <div class="p-4">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Día del mes para generar factura
            </label>
            <input type="number" 
                   min="1" 
                   max="31" 
                   [value]="editRecurrenceDay()"
                   (input)="onRecurrenceDayChange($event)"
                   class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent">
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">
              La próxima factura se generará el día {{ editRecurrenceDay() }} del mes correspondiente.
            </p>
          </div>
          <div class="p-4 border-t border-gray-200 dark:border-gray-700 flex gap-2 justify-end">
            <button (click)="closeEditDay()" 
                    class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
              Cancelar
            </button>
            <button (click)="saveRecurrenceDay()" 
                    class="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">
              Guardar
            </button>
          </div>
        </div>
      </div>
    }

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
  
  // Edit recurrence day modal
  showEditDayModal = signal(false);
  editingQuote = signal<RecurringQuote | null>(null);
  editRecurrenceDay = signal<number>(1);

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
      
      // Load recurring quotes (incluye pausados que mantienen su recurrence_type)
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
        .order('next_run_at', { ascending: true, nullsFirst: false });

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
    try {
      const client = this.supabase.instance;
      
      // Verificar si ya generó facturas pagadas
      const { data: paidInvoices, error: checkError } = await client
        .from('invoices')
        .select('id, invoice_number, status, payment_status')
        .eq('source_quote_id', quote.id)
        .in('payment_status', ['paid', 'partial']);
      
      if (checkError) throw checkError;
      
      if (paidInvoices && paidInvoices.length > 0) {
        alert(
          `❌ No se puede cancelar esta recurrencia\n\n` +
          `Ya se han generado ${paidInvoices.length} factura(s) pagada(s).\n` +
          `Por obligación legal y GDPR, estas facturas deben conservarse.\n\n` +
          `💡 Opciones:\n` +
          `• Usa "Pausar" para detener futuras facturas\n` +
          `• O contacta con soporte si necesitas emitir una factura rectificativa`
        );
        return;
      }
      
      // Verificar si hay facturas sin pagar (borrador, pendiente, etc.)
      const { data: otherInvoices } = await client
        .from('invoices')
        .select('id')
        .eq('source_quote_id', quote.id);
      
      const hasInvoices = otherInvoices && otherInvoices.length > 0;
      
      const confirmMessage = hasInvoices
        ? `⚠️ ATENCIÓN: Esta recurrencia ya generó ${otherInvoices.length} factura(s) sin pagar.\n\n` +
          `¿Cancelar definitivamente esta recurrencia?\n\n` +
          `• El presupuesto se convertirá en puntual\n` +
          `• Las facturas generadas se eliminarán\n` +
          `• Esta acción NO se puede deshacer`
        : `¿Cancelar definitivamente la facturación recurrente de "${quote.title}"?\n\n` +
          `• El presupuesto se convertirá en puntual\n` +
          `• No se han generado facturas aún\n` +
          `• Esta acción NO se puede deshacer`;
      
      if (!confirm(confirmMessage)) return;
      
      // Si hay facturas sin pagar, eliminarlas primero
      if (hasInvoices) {
        // Eliminar items de las facturas
        const invoiceIds = otherInvoices.map(inv => inv.id);
        await client
          .from('invoice_items')
          .delete()
          .in('invoice_id', invoiceIds);
        
        // Eliminar las facturas
        await client
          .from('invoices')
          .delete()
          .eq('source_quote_id', quote.id);
      }
      
      // Eliminar items del presupuesto
      await client
        .from('quote_items')
        .delete()
        .eq('quote_id', quote.id);
      
      // Eliminar el presupuesto (hard delete)
      await client
        .from('quotes')
        .delete()
        .eq('id', quote.id);
      
      await this.loadRecurringQuotes();
      alert('✓ Recurrencia cancelada y presupuesto eliminado correctamente');
    } catch (err) {
      console.error('Error canceling recurrence:', err);
      alert('Error al cancelar la recurrencia');
    }
  }

  openEditDay(quote: RecurringQuote): void {
    this.editingQuote.set(quote);
    this.editRecurrenceDay.set(quote.recurrence_day || 1);
    this.showEditDayModal.set(true);
  }

  closeEditDay(): void {
    this.showEditDayModal.set(false);
    this.editingQuote.set(null);
  }

  onRecurrenceDayChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    const numValue = Number(value);
    if (!isNaN(numValue)) {
      this.editRecurrenceDay.set(numValue);
    }
  }

  async saveRecurrenceDay(): Promise<void> {
    const quote = this.editingQuote();
    if (!quote) return;

    const newDay = this.editRecurrenceDay();
    if (newDay < 1 || newDay > 31) {
      alert('El día debe estar entre 1 y 31');
      return;
    }

    try {
      const client = this.supabase.instance;
      
      // Calcular nueva fecha de próxima ejecución
      const now = new Date();
      const nextRun = new Date(now.getFullYear(), now.getMonth(), newDay);
      
      // Si el día ya pasó este mes, programar para el próximo
      if (nextRun < now) {
        nextRun.setMonth(nextRun.getMonth() + 1);
      }

      const updateData = { 
        recurrence_day: newDay,
        next_run_at: nextRun.toISOString()
      };
      
      console.log('Updating quote with:', updateData);

      const { error } = await client
        .from('quotes')
        .update(updateData)
        .eq('id', quote.id);
      
      if (error) {
        console.error('Supabase error:', error);
        throw error;
      }
      
      this.closeEditDay();
      await this.loadRecurringQuotes();
      alert('Día de facturación actualizado correctamente');
    } catch (err) {
      console.error('Error updating recurrence day:', err);
      alert('Error al actualizar el día de facturación');
    }
  }

  // Format helpers
  getDisplayAmount(quote: RecurringQuote): number {
    // SIEMPRE mostrar el total_amount (lo que paga el cliente)
    // El total_amount ya incluye IVA, independientemente de cómo se haya introducido el precio
    return quote.total_amount || 0;
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
