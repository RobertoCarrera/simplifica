import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SupabaseInvoicesService } from '../../../services/supabase-invoices.service';
import { ToastService } from '../../../services/toast.service';

interface RegistryItem {
  id: string;
  invoice_number: string;
  invoice_date: string;
  app_status: string;
  total: number;
  currency: string;
  client_name: string;
  verifactu: {
    status: string;
    series: string;
    number: number;
    huella: string;
    issue_time: string;
    registered_at: string;
    updated_at: string;
  } | null;
  last_event: {
    type: string;
    status: string;
    date: string;
  } | null;
}

interface RegistryStats {
  total: number;
  registered: number;
  accepted: number;
  rejected: number;
  pending: number;
  void: number;
}

@Component({
  selector: 'app-verifactu-registry',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  template: `
    <div class="p-6 max-w-7xl mx-auto">
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Registro VeriFactu - AEAT
          </h1>
          <p class="text-gray-600 dark:text-gray-400 mt-1">
            Consulta de registros de facturación enviados a la Agencia Tributaria (Art. 12 RD 1007/2023)
          </p>
        </div>
        <div class="flex gap-3">
          <button 
            (click)="exportCsv()" 
            class="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex items-center gap-2"
            [disabled]="loading()">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Exportar CSV
          </button>
          <button 
            (click)="refresh()" 
            class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2"
            [disabled]="loading()">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" [class.animate-spin]="loading()" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {{ loading() ? 'Cargando...' : 'Actualizar' }}
          </button>
          <a routerLink="/facturacion" class="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">
            Volver
          </a>
        </div>
      </div>

      <!-- Stats Cards -->
      <div class="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border border-gray-200 dark:border-gray-700">
          <div class="text-2xl font-bold text-gray-900 dark:text-white">{{ stats().total }}</div>
          <div class="text-sm text-gray-500 dark:text-gray-400">Total facturas</div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border border-gray-200 dark:border-gray-700">
          <div class="text-2xl font-bold text-indigo-600">{{ stats().registered }}</div>
          <div class="text-sm text-gray-500 dark:text-gray-400">Registradas AEAT</div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border border-gray-200 dark:border-gray-700">
          <div class="text-2xl font-bold text-emerald-600">{{ stats().accepted }}</div>
          <div class="text-sm text-gray-500 dark:text-gray-400">Aceptadas</div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border border-gray-200 dark:border-gray-700">
          <div class="text-2xl font-bold text-amber-600">{{ stats().pending }}</div>
          <div class="text-sm text-gray-500 dark:text-gray-400">Pendientes</div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border border-gray-200 dark:border-gray-700">
          <div class="text-2xl font-bold text-red-600">{{ stats().rejected }}</div>
          <div class="text-sm text-gray-500 dark:text-gray-400">Rechazadas</div>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border border-gray-200 dark:border-gray-700">
          <div class="text-2xl font-bold text-gray-500">{{ stats().void }}</div>
          <div class="text-sm text-gray-500 dark:text-gray-400">Anuladas</div>
        </div>
      </div>

      <!-- Filter -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-6 border border-gray-200 dark:border-gray-700">
        <div class="flex flex-wrap gap-4 items-center">
          <div class="flex-1 min-w-[200px]">
            <label class="block text-sm text-gray-600 dark:text-gray-400 mb-1">Buscar</label>
            <input 
              type="text" 
              [(ngModel)]="searchTerm"
              (ngModelChange)="applyFilter()"
              placeholder="Número de factura, cliente..."
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500">
          </div>
          <div>
            <label class="block text-sm text-gray-600 dark:text-gray-400 mb-1">Estado VeriFactu</label>
            <select 
              [(ngModel)]="statusFilter"
              (ngModelChange)="applyFilter()"
              class="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500">
              <option value="">Todos</option>
              <option value="accepted">Aceptadas</option>
              <option value="pending">Pendientes</option>
              <option value="rejected">Rechazadas</option>
              <option value="void">Anuladas</option>
              <option value="none">Sin registro</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Table -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead class="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Factura</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Fecha</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Cliente</th>
                <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Importe</th>
                <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Estado AEAT</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Serie/Núm. AEAT</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Último evento</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Huella</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
              @for (item of filteredRegistry(); track item.id) {
                <tr class="hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer" [routerLink]="['/facturacion', item.id]">
                  <td class="px-4 py-3 whitespace-nowrap">
                    <span class="font-medium text-gray-900 dark:text-white">{{ item.invoice_number }}</span>
                  </td>
                  <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
                    {{ item.invoice_date | date:'dd/MM/yyyy' }}
                  </td>
                  <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300 max-w-[200px] truncate">
                    {{ item.client_name }}
                  </td>
                  <td class="px-4 py-3 whitespace-nowrap text-sm text-right font-medium text-gray-900 dark:text-white">
                    {{ item.total | number:'1.2-2' }} {{ item.currency }}
                  </td>
                  <td class="px-4 py-3 whitespace-nowrap text-center">
                    @if (item.verifactu) {
                      <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium" [ngClass]="getStatusClass(item.verifactu.status)">
                        {{ getStatusLabel(item.verifactu.status) }}
                      </span>
                    } @else {
                      <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                        Sin registro
                      </span>
                    }
                  </td>
                  <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
                    @if (item.verifactu) {
                      {{ item.verifactu.series }}-{{ item.verifactu.number }}
                    } @else {
                      <span class="text-gray-400">-</span>
                    }
                  </td>
                  <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
                    @if (item.last_event) {
                      <div class="flex flex-col">
                        <span class="text-xs font-medium" [ngClass]="{
                          'text-emerald-600': item.last_event.status === 'accepted',
                          'text-red-600': item.last_event.status === 'rejected',
                          'text-amber-600': item.last_event.status === 'pending' || item.last_event.status === 'sending'
                        }">{{ item.last_event.type }}</span>
                        <span class="text-xs text-gray-400">{{ item.last_event.date | date:'dd/MM/yy HH:mm' }}</span>
                      </div>
                    } @else {
                      <span class="text-gray-400">-</span>
                    }
                  </td>
                  <td class="px-4 py-3 whitespace-nowrap text-xs font-mono text-gray-500 dark:text-gray-400">
                    @if (item.verifactu?.huella) {
                      <span class="cursor-help" [title]="item.verifactu!.huella!">{{ item.verifactu!.huella!.substring(0, 12) }}...</span>
                    } @else {
                      <span class="text-gray-400">-</span>
                    }
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="8" class="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    @if (loading()) {
                      <div class="flex items-center justify-center gap-2">
                        <svg class="animate-spin h-5 w-5 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Cargando registros...
                      </div>
                    } @else {
                      No hay facturas que coincidan con los filtros
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        @if (pagination().totalPages > 1) {
          <div class="px-4 py-3 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <div class="text-sm text-gray-600 dark:text-gray-400">
              Mostrando {{ ((pagination().page - 1) * pagination().pageSize) + 1 }} - {{ Math.min(pagination().page * pagination().pageSize, pagination().total) }} de {{ pagination().total }}
            </div>
            <div class="flex gap-2">
              <button 
                (click)="prevPage()"
                [disabled]="pagination().page <= 1"
                class="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-600">
                Anterior
              </button>
              <span class="px-3 py-1 text-sm text-gray-600 dark:text-gray-400">
                Página {{ pagination().page }} de {{ pagination().totalPages }}
              </span>
              <button 
                (click)="nextPage()"
                [disabled]="pagination().page >= pagination().totalPages"
                class="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-600">
                Siguiente
              </button>
            </div>
          </div>
        }
      </div>

      <!-- Legal info -->
      <div class="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
        <div class="flex gap-3">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-blue-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div class="text-sm text-blue-800 dark:text-blue-200">
            <p class="font-medium mb-1">Información sobre VeriFactu</p>
            <p class="text-blue-700 dark:text-blue-300">
              Este registro muestra las facturas comunicadas a la Agencia Tributaria según el sistema VeriFactu 
              (Real Decreto 1007/2023). La <strong>huella</strong> es el hash SHA-256 que garantiza la integridad 
              del registro y permite su verificación. El <strong>estado AEAT</strong> indica si la factura ha sido 
              aceptada, rechazada o está pendiente de procesamiento.
            </p>
          </div>
        </div>
      </div>
    </div>
  `
})
export class VerifactuRegistryComponent implements OnInit {
  private invoicesService = inject(SupabaseInvoicesService);
  private toast = inject(ToastService);

  // State
  loading = signal(false);
  registry = signal<RegistryItem[]>([]);
  stats = signal<RegistryStats>({ total: 0, registered: 0, accepted: 0, rejected: 0, pending: 0, void: 0 });
  pagination = signal({ page: 1, pageSize: 50, total: 0, totalPages: 0 });

  // Filters
  searchTerm = '';
  statusFilter = '';

  // For Math in template
  Math = Math;

  // Computed filtered list
  filteredRegistry = computed(() => {
    let items = this.registry();
    
    // Filter by search term
    if (this.searchTerm.trim()) {
      const term = this.searchTerm.toLowerCase();
      items = items.filter(item => 
        item.invoice_number.toLowerCase().includes(term) ||
        item.client_name.toLowerCase().includes(term)
      );
    }
    
    // Filter by status
    if (this.statusFilter) {
      if (this.statusFilter === 'none') {
        items = items.filter(item => !item.verifactu);
      } else {
        items = items.filter(item => item.verifactu?.status === this.statusFilter);
      }
    }
    
    return items;
  });

  ngOnInit(): void {
    this.loadRegistry();
  }

  loadRegistry(page: number = 1): void {
    this.loading.set(true);
    this.invoicesService.getVerifactuRegistry(page, 50).subscribe({
      next: (data) => {
        this.registry.set(data.registry);
        this.stats.set(data.stats);
        this.pagination.set(data.pagination);
        this.loading.set(false);
      },
      error: (err) => {
        this.toast.error('Error', 'No se pudo cargar el registro VeriFactu: ' + (err.message || err));
        this.loading.set(false);
      }
    });
  }

  refresh(): void {
    this.loadRegistry(this.pagination().page);
  }

  applyFilter(): void {
    // Filters are applied via computed signal
  }

  prevPage(): void {
    if (this.pagination().page > 1) {
      this.loadRegistry(this.pagination().page - 1);
    }
  }

  nextPage(): void {
    if (this.pagination().page < this.pagination().totalPages) {
      this.loadRegistry(this.pagination().page + 1);
    }
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'accepted':
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200';
      case 'rejected':
        return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200';
      case 'pending':
      case 'sending':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200';
      case 'void':
        return 'bg-gray-200 text-gray-800 dark:bg-gray-600 dark:text-gray-200';
      default:
        return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400';
    }
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'accepted': return 'Aceptada';
      case 'rejected': return 'Rechazada';
      case 'pending': return 'Pendiente';
      case 'sending': return 'Enviando';
      case 'void': return 'Anulada';
      default: return status;
    }
  }

  exportCsv(): void {
    const items = this.filteredRegistry();
    if (items.length === 0) {
      this.toast.error('Sin datos', 'No hay registros para exportar');
      return;
    }

    const headers = [
      'Número Factura',
      'Fecha',
      'Cliente',
      'Importe',
      'Moneda',
      'Estado App',
      'Estado AEAT',
      'Serie AEAT',
      'Número AEAT',
      'Huella',
      'Fecha Registro',
      'Último Evento',
      'Fecha Evento'
    ];

    const rows = items.map(item => [
      item.invoice_number,
      item.invoice_date,
      `"${item.client_name.replace(/"/g, '""')}"`,
      item.total,
      item.currency,
      item.app_status,
      item.verifactu?.status || 'Sin registro',
      item.verifactu?.series || '',
      item.verifactu?.number || '',
      item.verifactu?.huella || '',
      item.verifactu?.registered_at || '',
      item.last_event?.type || '',
      item.last_event?.date || ''
    ]);

    const csvContent = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `registro-verifactu-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    this.toast.success('Exportado', 'Se ha descargado el CSV con ' + items.length + ' registros');
  }
}
