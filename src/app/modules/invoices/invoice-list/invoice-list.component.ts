import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SupabaseInvoicesService } from '../../../services/supabase-invoices.service';
import { SupabaseModulesService } from '../../../services/supabase-modules.service';
import { SupabaseSettingsService } from '../../../services/supabase-settings.service';
import { Invoice, formatInvoiceNumber } from '../../../models/invoice.model';
import { environment } from '../../../../environments/environment';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-invoice-list',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  template: `
  <div>
    <!-- Filters and Search -->
    <div class="mb-4 flex flex-wrap gap-3 items-center">
      <input type="text" placeholder="Buscar por cliente o número..." [ngModel]="searchTerm()" (ngModelChange)="searchTerm.set($event)" 
             class="flex-1 min-w-[200px] px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent" />
      
      <select [ngModel]="statusFilter()" (ngModelChange)="statusFilter.set($event)" class="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500">
        <option value="">Todos los estados</option>
        <option value="draft">Borrador</option>
        <option value="issued">Emitida</option>
        <option value="sent">Enviada</option>
        <option value="paid">Pagada</option>
        <option value="overdue">Vencida</option>
        <option value="rectificative">Rectificativa</option>
      </select>

      <select [ngModel]="sortBy()" (ngModelChange)="sortBy.set($event)" class="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500">
        <option value="date-desc">Fecha (más reciente)</option>
        <option value="date-asc">Fecha (más antigua)</option>
        <option value="amount-desc">Importe (mayor)</option>
        <option value="amount-asc">Importe (menor)</option>
        <option value="client-asc">Cliente (A-Z)</option>
      </select>
      <!-- Dispatcher health - only show if Verifactu module is enabled -->
      <div *ngIf="isVerifactuEnabled()" class="flex items-center gap-3">
        <span *ngIf="dispatcherHealth() as h" class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium"
              [ngClass]="h.pending > 0 ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'">
          <span class="w-2 h-2 rounded-full mr-1.5" [ngClass]="h.pending > 0 ? 'bg-amber-500' : 'bg-emerald-500'"></span>
          {{ h.pending > 0 ? (h.pending + ' eventos pendientes') : 'VeriFactu OK' }}
        </span>
        <a routerLink="/facturacion/verifactu-registry" 
          class="inline-flex items-center gap-1.5 px-3 py-3 rounded-lg text-xs font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-900/60 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Registro AEAT
        </a>
      </div>
    </div>

    <div class="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700">
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead class="bg-gray-50 dark:bg-gray-700/50">
            <tr>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300">Número</th>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300">Cliente</th>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300">Fecha</th>
              <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300">Estado</th>
              <th class="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-300">Total</th>
              <th class="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
            @for (inv of filteredInvoices(); track inv.id) {
              <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                <td class="px-4 py-2 text-sm text-gray-800 dark:text-gray-200">{{ formatNumber(inv) }}</td>
                <td class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">{{ inv.client?.name || inv.client_id }}</td>
                <td class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">{{ inv.invoice_date }}</td>
                <td class="px-4 py-2 text-sm">
                  <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium" [ngClass]="getStatusClass(inv)">
                    {{ getStatusLabel(inv) }}
                  </span>
                </td>
                <td class="px-4 py-2 text-sm text-right text-gray-900 dark:text-gray-100 font-medium">{{ getDisplayAmount(inv) | number:'1.2-2' }} {{ inv.currency || 'EUR' }}</td>
                <td class="px-4 py-2 text-right">
                  <a class="text-blue-600 hover:underline mr-3" [routerLink]="['/facturacion', inv.id]">Ver</a>
                  <button class="text-sm px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700" (click)="downloadPdf(inv.id)">PDF</button>
                </td>
              </tr>
            }
            @empty {
              <tr>
                <td colspan="5" class="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">No hay facturas todavía.</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `
})
export class InvoiceListComponent implements OnInit {
  private invoicesService = inject(SupabaseInvoicesService);
  private modulesService = inject(SupabaseModulesService);
  private settingsService = inject(SupabaseSettingsService);
  
  invoices = signal<Invoice[]>([]);
  searchTerm = signal<string>('');
  statusFilter = signal<string>('');
  sortBy = signal<string>('date-desc');
  dispatcherHealth = signal<{ pending: number; lastEventAt: string | null; lastAcceptedAt: string | null; lastRejectedAt: string | null; } | null>(null);
  pricesIncludeTax = signal<boolean>(false);

  // Module-based visibility
  isVerifactuEnabled = computed(() => {
    const modules = this.modulesService.modulesSignal();
    if (!modules) return false;
    const mod = modules.find(m => m.key === 'moduloVerifactu');
    return mod?.enabled ?? false;
  });

  // Filtered and sorted invoices
  filteredInvoices = computed(() => {
    let filtered = this.invoices();
    
    // Apply search filter
    const search = this.searchTerm().toLowerCase();
    if (search) {
      filtered = filtered.filter(inv => 
        this.formatNumber(inv).toLowerCase().includes(search) ||
        (inv.client?.name || '').toLowerCase().includes(search) ||
        inv.client_id?.toLowerCase().includes(search)
      );
    }
    
    // Apply status filter
    const status = this.statusFilter();
    if (status === 'rectificative') {
      filtered = filtered.filter(inv => inv.invoice_type === 'rectificative' || (inv.total || 0) < 0);
    } else if (status === 'issued') {
      filtered = filtered.filter(inv => 
        inv.status === 'issued' || 

        (inv.verifactu_status === 'accepted' && ['draft', 'approved'].includes(inv.status))
      );
    } else if (status) {
      filtered = filtered.filter(inv => inv.status === status);
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

  ngOnInit(): void {
    // Load tax configuration
    this.loadTaxSettings();

    // Load modules if not cached
    if (!this.modulesService.modulesSignal()) {
      this.modulesService.fetchEffectiveModules().subscribe();
    }
    this.invoicesService.getInvoices().subscribe({
      next: (list) => {
        // Filtrar facturas recurrentes (solo mostrar facturas normales)
        const normalInvoices = (list || []).filter(inv => !inv.is_recurring);
        // Ordenar de más nueva a más antigua por fecha de factura
        const sorted = normalInvoices.sort((a, b) => {
          const dateA = new Date(a.invoice_date).getTime();
          const dateB = new Date(b.invoice_date).getTime();
          return dateB - dateA; // Más reciente primero
        });
        this.invoices.set(sorted);
      },
      error: (err) => console.error('Error loading invoices', err)
    });
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

  downloadPdf(invoiceId: string) {
    this.invoicesService.getInvoicePdfUrl(invoiceId).subscribe({
      next: (signed) => window.open(signed, '_blank'),
      error: (e) => console.error('PDF error', e)
    });
  }

  getDisplayAmount(invoice: Invoice): number {
    // SIEMPRE mostramos el total real (lo que paga el cliente)
    return invoice.total || 0;
  }

  // runDispatcher(){
  //   this.invoicesService.runDispatcherNow().subscribe({
  //     next: () => this.invoicesService.getDispatcherHealth().subscribe(h => this.dispatcherHealth.set(h)),
  //     error: (e) => console.error('Dispatcher error', e)
  //   });
  // }

  formatNumber(inv: Invoice): string {
    return formatInvoiceNumber(inv);
  }

  getStatusLabel(inv: Invoice): string {
    // Si es una factura rectificativa (importe negativo o tipo rectificative)
    if (inv.invoice_type === 'rectificative' || (inv.total || 0) < 0) {
      return 'Rectificativa';
    }
    // Si está aceptada por VeriFactu y el estado es borrador o aprobada, mostrar como Emitida
    if (inv.verifactu_status === 'accepted' && ['draft', 'approved'].includes(inv.status)) {
      return 'Emitida';
    }
    const status = inv.status;
    const map: Record<string, string> = {
      'draft': 'Borrador',
      'approved': 'Aprobada',
      'issued': 'Emitida',
      'final': 'Emitida',
      'sent': 'Enviada',
      'paid': 'Pagada',
      'partial': 'Parcial',
      'overdue': 'Vencida',
      'cancelled': 'Cancelada',
      'void': 'Anulada',
      'rectified': 'Rectificada'
    };
    return map[status] || status;
  }

  getStatusClass(inv: Invoice): string {
    if (inv.verifactu_status === 'accepted' && ['draft', 'approved'].includes(inv.status)) {
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200';
    }
    const status = inv.status;
    const map: Record<string, string> = {
      'draft': 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
      'approved': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200',
      'issued': 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200',
      'final': 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200',
      'sent': 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
      'paid': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
      'partial': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200',
      'overdue': 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
      'cancelled': 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
      'void': 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300 line-through',
      'rectified': 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200'
    };
    return map[status] || 'bg-gray-100 text-gray-800';
  }
}
