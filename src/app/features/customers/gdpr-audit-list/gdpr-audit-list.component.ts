import { Component, OnInit, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GdprComplianceService, GdprAuditEntry } from '../../../services/gdpr-compliance.service';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-gdpr-audit-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="space-y-4">
      <div class="flex flex-col sm:flex-row justify-between items-center gap-4">
        <h3 class="text-lg font-semibold dark:text-gray-200">Registro de Auditoría GDPR</h3>
        
        <div class="flex items-center gap-2 w-full sm:w-auto">
          <div class="relative flex-1 sm:w-64">
            <input 
              type="text" 
              [ngModel]="searchTerm()" 
              (ngModelChange)="searchTerm.set($event)"
              placeholder="Buscar por email, nombre..." 
              class="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500">
            <i class="fas fa-search absolute left-3 top-2 text-gray-400 dark:text-gray-500 text-xs"></i>
            <button 
              *ngIf="searchTerm()" 
              (click)="searchTerm.set('')"
              class="absolute right-2 top-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
              <i class="fas fa-times"></i>
            </button>
          </div>

          <button 
            (click)="loadLogs()" 
            class="px-3 py-1.5 text-sm bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 transition-colors whitespace-nowrap">
            <i class="fas fa-sync-alt mr-2"></i> <span class="hidden sm:inline">Actualizar</span>
          </button>
        </div>
      </div>

      <div class="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-800 shadow-sm">
        <table class="w-full text-sm text-left">
          <thead class="bg-gray-50 dark:bg-slate-700/50 text-gray-500 dark:text-gray-400 uppercase text-xs">
            <tr>
              <th class="px-6 py-3 border-b border-gray-200 dark:border-gray-700">Fecha</th>
              <th class="px-6 py-3 border-b border-gray-200 dark:border-gray-700">Acción</th>
              <th class="px-6 py-3 border-b border-gray-200 dark:border-gray-700">Sujeto</th>
              <th class="px-6 py-3 border-b border-gray-200 dark:border-gray-700">Razón</th>
              <th class="px-6 py-3 border-b border-gray-200 dark:border-gray-700">Datos</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
            <tr *ngFor="let log of paginatedLogs()" class="hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors">
              <td class="px-6 py-4 whitespace-nowrap text-gray-500 dark:text-gray-300">
                {{ log.created_at | date:'medium' }}
              </td>
              <td class="px-6 py-4">
                <span [ngClass]="getActionClass(log.action_type)" class="px-2 py-1 rounded-full text-xs font-medium border dark:border-transparent">
                  {{ log.action_type }}
                </span>
              </td>
              <td class="px-6 py-4 font-medium text-gray-900 dark:text-gray-100">
                <div class="flex flex-col">
                  <span class="font-semibold">{{ getSubjectName(log) }}</span>
                  <span class="text-xs text-gray-500 dark:text-gray-400">{{ log.subject_email || 'Email no registrado' }}</span>
                </div>
              </td>
              <td class="px-6 py-4 text-gray-500 dark:text-gray-400">
                {{ log.purpose || '-' }}
              </td>
              <td class="px-6 py-4">
                <button 
                  (click)="openDetails(log)"
                  class="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-xs font-semibold bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded border border-blue-100 dark:border-blue-800 hover:border-blue-300 transition-all">
                  Ver Detalles
                </button>
              </td>
            </tr>
            <tr *ngIf="paginatedLogs().length === 0 && !loading()">
              <td colspan="5" class="px-6 py-12 text-center text-gray-500 dark:text-gray-400 italic bg-gray-50/30 dark:bg-slate-800/50">
                <div class="flex flex-col items-center justify-center gap-2">
                  <i class="fas fa-search text-gray-300 dark:text-gray-600 text-3xl mb-2"></i>
                  <span>No se encontraron registros{{ searchTerm() ? ' para "' + searchTerm() + '"' : '' }}.</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination Controls -->
      <div class="px-6 py-4 bg-white dark:bg-slate-800 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between rounded-lg shadow-sm" *ngIf="totalPages() > 1">
        <div class="flex-1 flex justify-between sm:hidden">
          <button (click)="prevPage()" [disabled]="currentPage() === 1"
            class="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50">
            Anterior
          </button>
          <button (click)="nextPage()" [disabled]="currentPage() === totalPages()"
            class="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50">
            Siguiente
          </button>
        </div>
        <div class="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
          <div>
            <p class="text-sm text-gray-700 dark:text-gray-300">
              Mostrando <span class="font-medium">{{ (currentPage() - 1) * pageSize() + 1 }}</span> a <span
                class="font-medium">{{ Math.min(currentPage() * pageSize(), filteredLogs().length) }}</span> de
              <span class="font-medium">{{ filteredLogs().length }}</span> resultados
            </p>
          </div>
          <div>
            <nav class="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
              <button (click)="prevPage()" [disabled]="currentPage() === 1"
                class="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-700 text-sm font-medium text-gray-500 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-600 disabled:opacity-50">
                <span class="sr-only">Anterior</span>
                <i class="fas fa-chevron-left"></i>
              </button>
              
              <!-- Simple Page Numbers -->
              <span class="relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-700 text-sm font-medium text-gray-700 dark:text-gray-200">
                Página {{ currentPage() }} de {{ totalPages() }}
              </span>

              <button (click)="nextPage()" [disabled]="currentPage() === totalPages()"
                class="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-700 text-sm font-medium text-gray-500 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-600 disabled:opacity-50">
                <span class="sr-only">Siguiente</span>
                <i class="fas fa-chevron-right"></i>
              </button>
            </nav>
          </div>
        </div>
      </div>
    
      <!-- Loading State -->
      <div *ngIf="loading()" class="text-center py-4 text-gray-500">
        <i class="fas fa-spinner fa-spin mr-2"></i> Cargando registros...
      </div>
    </div>

    <!-- Details Modal -->
    <div *ngIf="showDetailsModal && selectedLog()" 
         class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm"
         (click)="closeDetails()">
      <div class="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden" (click)="$event.stopPropagation()">
        <!-- Header -->
        <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-slate-900/50">
          <div>
            <h3 class="text-lg font-bold text-gray-900 dark:text-white">Detalle de Auditoría</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400">ID: {{ selectedLog()?.id }}</p>
          </div>
          <button (click)="closeDetails()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
            <i class="fas fa-times text-xl"></i>
          </button>
        </div>

        <!-- Content -->
        <div class="p-6 overflow-y-auto">
          <div class="grid grid-cols-2 gap-4 mb-6">
            <div class="p-3 bg-gray-50 dark:bg-slate-700/30 rounded-lg">
              <span class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">Fecha</span>
              <p class="font-medium text-gray-900 dark:text-gray-100">{{ selectedLog()?.created_at | date:'medium' }}</p>
            </div>
            <div class="p-3 bg-gray-50 dark:bg-slate-700/30 rounded-lg">
              <span class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">Acción</span>
              <p class="font-medium text-gray-900 dark:text-gray-100">{{ selectedLog()?.action_type }}</p>
            </div>
            <div class="p-3 bg-gray-50 dark:bg-slate-700/30 rounded-lg">
              <span class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">Sujeto</span>
              <p class="font-medium text-gray-900 dark:text-gray-100">{{ getSubjectName(selectedLog()!) }}</p>
              <p class="text-xs text-gray-500">{{ selectedLog()?.subject_email }}</p>
            </div>
            <div class="p-3 bg-gray-50 dark:bg-slate-700/30 rounded-lg">
              <span class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">Razón</span>
              <p class="font-medium text-gray-900 dark:text-gray-100">{{ selectedLog()?.purpose }}</p>
            </div>
          </div>

          <div class="bg-slate-900 rounded-lg p-4 overflow-x-auto relative group">
            <div class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button (click)="copyJson()" class="text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded hover:bg-slate-600">Copiar</button>
            </div>
            <pre class="text-xs text-green-400 font-mono leading-relaxed">{{ getFormattedJson(selectedLog()!) }}</pre>
          </div>
        </div>
      
        <!-- Footer -->
        <div class="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-slate-900/50 flex justify-end">
          <button (click)="closeDetails()" class="px-4 py-2 bg-gray-200 dark:bg-slate-700 text-gray-800 dark:text-gray-200 rounded-lg font-medium hover:bg-gray-300 dark:hover:bg-slate-600 transition-colors">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  `,
  styles: []
})
export class GdprAuditListComponent implements OnInit {
  private gdprService = inject(GdprComplianceService);
  private toastService = inject(ToastService);

  logs = signal<GdprAuditEntry[]>([]);
  loading = signal(false);
  searchTerm = signal('');

  // Modal state
  showDetailsModal = false;
  selectedLog = signal<GdprAuditEntry | null>(null);

  filteredLogs = computed(() => {
    const term = this.searchTerm().toLowerCase();
    const allLogs = this.logs();

    if (!term) return allLogs;

    return allLogs.filter(log => {
      const emailMatch = log.subject_email?.toLowerCase().includes(term);
      const nameMatch = this.getSubjectName(log).toLowerCase().includes(term);
      const actionMatch = log.action_type.toLowerCase().includes(term);
      return emailMatch || nameMatch || actionMatch;
    });
  });

  // Pagination state
  currentPage = signal(1);
  pageSize = signal(5);

  // Expose Math for template
  protected Math = Math;

  totalPages = computed(() => {
    return Math.ceil(this.filteredLogs().length / this.pageSize());
  });

  paginatedLogs = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize();
    const end = start + this.pageSize();
    return this.filteredLogs().slice(start, end);
  });

  // Reset pagination when search changes
  constructor() {
    effect(() => {
      this.searchTerm();
      this.currentPage.set(1);
    }, { allowSignalWrites: true });
  }

  ngOnInit() {
    this.loadLogs();
  }

  loadLogs() {
    this.loading.set(true);
    this.gdprService.getAuditLogs(100).subscribe({
      next: (data: GdprAuditEntry[]) => {
        this.logs.set(data);
        this.loading.set(false);
      },
      error: (err: any) => {
        console.error('Error fetching logs', err);
        const msg = err && typeof err === 'object' && 'message' in err ? err.message : String(err);
        this.toastService.error('Error cargando auditoría: ' + msg, 'Error');
        this.loading.set(false);
      }
    });
  }

  // Pagination Controls
  changePage(page: number) {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
    }
  }

  nextPage() {
    if (this.currentPage() < this.totalPages()) {
      this.currentPage.update(p => p + 1);
    }
  }

  prevPage() {
    if (this.currentPage() > 1) {
      this.currentPage.update(p => p - 1);
    }
  }

  getActionClass(type: string): string {
    switch (type) {
      case 'anonymization': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
      case 'deletion': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
      case 'access_request': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      default: return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
    }
  }

  getSubjectName(log: GdprAuditEntry): string {
    if (log.old_values && typeof log.old_values === 'object') {
      const old = log.old_values as any;
      if (old.name || old.apellidos) {
        return `${old.name || ''} ${old.apellidos || ''}`.trim();
      }
    }
    return 'Desconocido'; // Or only email
  }

  getFormattedJson(log: GdprAuditEntry): string {
    const data = log.old_values || log.new_values || {};
    return JSON.stringify(data, null, 2);
  }

  openDetails(log: GdprAuditEntry) {
    this.selectedLog.set(log);
    this.showDetailsModal = true;
  }

  closeDetails() {
    this.showDetailsModal = false;
    this.selectedLog.set(null);
  }
  copyJson() {
    if (!this.selectedLog()) return;
    const jsonStr = this.getFormattedJson(this.selectedLog()!);
    navigator.clipboard.writeText(jsonStr).then(() => {
      this.toastService.success('JSON copiado al portapapeles', 'Info');
    }).catch(err => {
      console.error('Error al copiar:', err);
      this.toastService.error('No se pudo copiar el JSON', 'Error');
    });
  }
}


