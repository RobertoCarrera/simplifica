import { Component, OnInit, inject, signal, computed, effect, Input, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GdprComplianceService, GdprAuditEntry } from '../../../services/gdpr-compliance.service';
import { ToastService } from '../../../services/toast.service';
import { TranslocoService } from '@jsverse/transloco';

@Component({
  selector: 'app-gdpr-audit-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="space-y-4">
      <div class="flex flex-col sm:flex-row justify-between items-center gap-4">
        <h3 class="text-lg font-semibold dark:text-gray-200">
          {{ translate('clients.gdpr.manager.auditoria.titulo') }}
        </h3>

        <div class="flex items-center gap-2 w-full sm:w-auto">
          <div class="relative flex-1 sm:w-64">
            <input
              type="text"
              [ngModel]="searchTerm()"
              (ngModelChange)="searchTerm.set($event)"
              [placeholder]="translate('clients.buscar')"
              class="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            />
            <i class="fas fa-search absolute left-3 top-2 text-gray-400 dark:text-gray-500 text-xs"></i>
            @if (searchTerm()) {
              <button
                (click)="searchTerm.set('')"
                class="absolute right-2 top-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <i class="fas fa-times"></i>
              </button>
            }
          </div>

          <button
            (click)="loadLogs()"
            class="px-3 py-1.5 text-sm bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 transition-colors whitespace-nowrap"
          >
            <i class="fas fa-sync-alt mr-2"></i> <span class="hidden sm:inline">{{ translate('shared.actualizar') }}</span>
          </button>
        </div>
      </div>

      <div class="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-800 shadow-sm">
        <div class="overflow-x-auto">
          <table class="w-full text-sm text-left">
            <thead class="bg-gray-50 dark:bg-slate-700/50 text-gray-500 dark:text-gray-400 uppercase text-xs">
              <tr>
                <th class="px-6 py-3 border-b border-gray-200 dark:border-gray-700">{{ translate('clients.gdpr.manager.auditoria.fecha') }}</th>
                <th class="px-6 py-3 border-b border-gray-200 dark:border-gray-700">{{ translate('clients.gdpr.manager.auditoria.accion') }}</th>
                <th class="px-6 py-3 border-b border-gray-200 dark:border-gray-700">{{ translate('clients.gdpr.manager.auditoria.sujeto') }}</th>
                <th class="px-6 py-3 border-b border-gray-200 dark:border-gray-700 font-medium">{{ translate('clients.gdpr.manager.auditoria.razon') }}</th>
                <th class="px-6 py-3 border-b border-gray-200 dark:border-gray-700">{{ translate('clients.gdpr.manager.auditoria.datos') }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
              @for (log of paginatedLogs(); track log.id) {
                <tr class="hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors">
                  <td class="px-6 py-4 whitespace-nowrap text-gray-500 dark:text-gray-300">
                    {{ formatDate(log.created_at || '') }}
                  </td>
                  <td class="px-6 py-4">
                    <span
                      [ngStyle]="getActionStyles(log.action_type)"
                      class="px-2 py-1 rounded-full text-xs font-medium border"
                    >
                      {{ translateAction(log.action_type) }}
                    </span>
                  </td>
                  <td class="px-6 py-4 font-medium text-gray-900 dark:text-gray-100">
                    <div class="flex flex-col">
                      <span class="font-semibold">{{ getSubjectName(log) }}</span>
                      <span class="text-xs text-gray-500 dark:text-gray-400">{{
                        log.subject_email || translate('clients.gdpr.noDisponible')
                      }}</span>
                    </div>
                  </td>
                  <td class="px-6 py-4 text-gray-500 dark:text-gray-400">
                    {{ translateReason(log.purpose || '-') }}
                  </td>
                  <td class="px-6 py-4">
                    <button
                      (click)="openDetails(log)"
                      class="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-xs font-semibold bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded border border-blue-100 dark:border-blue-800 hover:border-blue-300 transition-all"
                    >
                      {{ translate('clients.gdpr.manager.auditoria.verDetalles') }}
                    </button>
                  </td>
                </tr>
              }
              @if (paginatedLogs().length === 0 && !loading()) {
                <tr>
                  <td
                    colspan="5"
                    class="px-6 py-12 text-center text-gray-500 dark:text-gray-400 italic"
                  >
                    {{ translate('clients.noResultados') }}
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      @if (totalPages() > 1) {
        <div class="bg-white dark:bg-slate-800 px-4 py-3 flex items-center justify-between border-t border-gray-200 dark:border-gray-700 sm:px-6">
          <div class="flex-1 flex justify-between sm:hidden">
            <button
              (click)="prevPage()"
              [disabled]="currentPage() === 1"
              class="relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-slate-700 hover:bg-gray-50 dark:hover:bg-slate-600 disabled:opacity-50"
            >
              {{ translate('shared.anterior') }}
            </button>
            <button
              (click)="nextPage()"
              [disabled]="currentPage() === totalPages()"
              class="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-slate-700 hover:bg-gray-50 dark:hover:bg-slate-600 disabled:opacity-50"
            >
              {{ translate('shared.siguiente') }}
            </button>
          </div>
          <div class="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
            <div>
              <p class="text-sm text-gray-700 dark:text-gray-400">
                {{ translate('shared.pagina') }} <span class="font-medium">{{ currentPage() }}</span> {{ translate('shared.de') }}
                <span class="font-medium">{{ totalPages() }}</span>
              </p>
            </div>
            <div>
              <nav
                class="relative z-0 inline-flex rounded-md shadow-sm -space-x-px"
                aria-label="Pagination"
              >
                <button
                  (click)="prevPage()"
                  [disabled]="currentPage() === 1"
                  class="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-700 text-sm font-medium text-gray-500 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-600 disabled:opacity-50"
                >
                  <span class="sr-only">{{ translate('shared.anterior') }}</span>
                  <i class="fas fa-chevron-left"></i>
                </button>
                <span
                  class="relative inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-700 text-sm font-medium text-gray-700 dark:text-gray-200"
                >
                  {{ translate('shared.pagina') }} {{ currentPage() }} {{ translate('shared.de') }} {{ totalPages() }}
                </span>
                <button
                  (click)="nextPage()"
                  [disabled]="currentPage() === totalPages()"
                  class="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-700 text-sm font-medium text-gray-500 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-600 disabled:opacity-50"
                >
                  <span class="sr-only">{{ translate('shared.siguiente') }}</span>
                  <i class="fas fa-chevron-right"></i>
                </button>
              </nav>
            </div>
          </div>
        </div>
      }

      @if (loading()) {
        <div class="text-center py-4 text-gray-500">
          <i class="fas fa-spinner fa-spin mr-2"></i> {{ translate('clients.cargando') }}
        </div>
      }

      @if (showDetailsModal && selectedLog()) {
        <div
          class="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm"
          (click)="closeDetails()"
        >
          <div
            class="bg-white dark:bg-slate-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden"
            (click)="$event.stopPropagation()"
          >
            <div
              class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-slate-900/50"
            >
              <div>
                <h3 class="text-lg font-bold text-gray-900 dark:text-white">{{ translate('clients.gdpr.manager.auditoria.verDetalles') }}</h3>
                <p class="text-sm text-gray-500 dark:text-gray-400">ID: {{ selectedLog()?.id }}</p>
              </div>
              <button
                (click)="closeDetails()"
                class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
              >
                <i class="fas fa-times text-xl"></i>
              </button>
            </div>
            <div class="p-6 overflow-y-auto">
              <div class="grid grid-cols-2 gap-4 mb-6">
                <div class="p-3 bg-gray-50 dark:bg-slate-700/30 rounded-lg">
                  <span class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                    >{{ translate('clients.gdpr.manager.auditoria.fecha') }}</span
                  >
                  <p class="font-medium text-gray-900 dark:text-white">
                    {{ formatDate(selectedLog()?.created_at || '') }}
                  </p>
                </div>
                <div class="p-3 bg-gray-50 dark:bg-slate-700/30 rounded-lg">
                  <span class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                    >{{ translate('clients.gdpr.manager.auditoria.accion') }}</span
                  >
                  <p class="font-medium text-gray-900 dark:text-white">
                    {{ translateAction(selectedLog()?.action_type || '') }}
                  </p>
                </div>
                <div class="p-3 bg-gray-50 dark:bg-slate-700/30 rounded-lg">
                  <span class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                    >{{ translate('clients.gdpr.manager.auditoria.sujeto') }}</span
                  >
                  <p class="font-medium text-gray-900 dark:text-white">
                    {{ getSubjectName(selectedLog()!) }}
                  </p>
                  <p class="text-xs text-gray-500 dark:text-gray-400">{{ selectedLog()?.subject_email }}</p>
                </div>
                <div class="p-3 bg-gray-50 dark:bg-slate-700/30 rounded-lg">
                  <span class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                    >{{ translate('clients.gdpr.manager.auditoria.razon') }}</span
                  >
                  <p class="font-medium text-gray-900 dark:text-white">
                    {{ translateReason(selectedLog()?.purpose || '') }}
                  </p>
                </div>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 class="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">{{translate('clients.gdpr.manager.auditoria.verDetalles')}} (Prev)</h4>
                  <pre class="p-3 bg-gray-50 dark:bg-slate-900 rounded-lg text-[10px] overflow-x-auto border border-gray-100 dark:border-gray-700 text-gray-600 dark:text-gray-400">{{ selectedLog()?.old_values | json }}</pre>
                </div>
                <div>
                  <h4 class="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2">{{translate('clients.gdpr.manager.auditoria.verDetalles')}} (New)</h4>
                  <pre class="p-3 bg-gray-50 dark:bg-slate-900 rounded-lg text-[10px] overflow-x-auto border border-gray-100 dark:border-gray-700 text-gray-600 dark:text-gray-400">{{ selectedLog()?.new_values | json }}</pre>
                </div>
              </div>
            </div>
            <div class="px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-slate-900/50 text-right">
              <button
                (click)="closeDetails()"
                class="px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
              >
                {{ translate('shared.cerrar') }}
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }
  `]
})
export class GdprAuditListComponent implements OnInit, OnChanges {
  @Input() subjectEmail?: string;

  private gdprService = inject(GdprComplianceService);
  private toastService = inject(ToastService);
  private translocoService = inject(TranslocoService);

  logs = signal<GdprAuditEntry[]>([]);
  loading = signal(false);
  searchTerm = signal('');

  filteredLogs = computed(() => {
    const term = this.searchTerm().toLowerCase();
    const allLogs = this.logs();

    if (!term) return allLogs;

    return allLogs.filter((log) => {
      const emailMatch = (log.subject_email || '').toLowerCase().includes(term);
      const nameMatch = this.getSubjectName(log).toLowerCase().includes(term);
      const actionMatch = log.action_type.toLowerCase().includes(term);
      const reasonMatch = (log.purpose || '').toLowerCase().includes(term);
      return emailMatch || nameMatch || actionMatch || reasonMatch;
    });
  });

  currentPage = signal(1);
  pageSize = signal(10);
  protected Math = Math;
  showDetailsModal = false;
  selectedLog = signal<GdprAuditEntry | null>(null);

  totalPages = computed(() => {
    return Math.ceil(this.filteredLogs().length / this.pageSize());
  });

  paginatedLogs = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize();
    const end = start + this.pageSize();
    return this.filteredLogs().slice(start, end);
  });

  constructor() {
    effect(() => {
      this.searchTerm();
      this.currentPage.set(1);
    }, { allowSignalWrites: true });
  }

  ngOnChanges() { this.loadLogs(); }
  ngOnInit() { this.loadLogs(); }

  translate(key: string): string {
    return this.translocoService.translate(key);
  }

  loadLogs() {
    this.loading.set(true);
    let obs$;
    if (this.subjectEmail) {
      obs$ = this.gdprService.getAuditLog({ subjectEmail: this.subjectEmail, limit: 100 });
    } else {
      obs$ = this.gdprService.getAuditLogs(100);
    }
    obs$.subscribe({
      next: (data: GdprAuditEntry[]) => {
        this.logs.set(data);
        this.loading.set(false);
      },
      error: (err: any) => {
        console.error('Error fetching logs', err);
        this.toastService.error('Error cargando auditoria', 'Error');
        this.loading.set(false);
      },
    });
  }

  changePage(page: number) { if (page >= 1 && page <= this.totalPages()) this.currentPage.set(page); }
  nextPage() { if (this.currentPage() < this.totalPages()) this.currentPage.update((p) => p + 1); }
  prevPage() { if (this.currentPage() > 1) this.currentPage.update((p) => p - 1); }

  formatDate(dateString: string): string {
    if (!dateString) return '';
    const lang = this.translocoService.getActiveLang();
    const locale = lang === 'ca' ? 'ca-ES' : 'es-ES';
    return new Date(dateString).toLocaleDateString(locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  getActionStyles(type: string): Record<string, string> {
    switch (type) {
      case 'anonymization':
      case 'deletion':
        return { 'background-color': '#fef2f2', 'color': '#dc2626', 'border-color': '#fee2e2' };
      case 'access_request':
        return { 'background-color': '#eff6ff', 'color': '#2563eb', 'border-color': '#dbeafe' };
      default:
        return { 'background-color': '#f9fafb', 'color': '#4b5563', 'border-color': '#f3f4f6' };
    }
  }

  getSubjectName(log: GdprAuditEntry): string {
    if (log.old_values && typeof log.old_values === 'object') {
      const old = log.old_values as any;
      if (old.name || old.surname) return `${old.name || ''} ${old.surname || ''}`.trim();
    }
    return this.translate('clients.gdpr.manager.desconocido');
  }

  openDetails(log: GdprAuditEntry) { this.selectedLog.set(log); this.showDetailsModal = true; }
  closeDetails() { this.showDetailsModal = false; this.selectedLog.set(null); }

  translateAction(action: string): string {
    const map: Record<string, string> = {
      consent: this.translate('clients.gdpr.manager.auditoria.consentimiento'),
      update: this.translate('shared.actualizar'),
      anonymization: this.translate('clients.gdpr.manager.auditoria.anonimizacion'),
      deletion: this.translate('shared.eliminar'),
      access_request: this.translate('clients.gdpr.manager.auditoria.solicitudAcceso'),
      rectification: this.translate('clients.gdpr.manager.auditoria.rectificacion'),
      restriction: this.translate('clients.gdpr.manager.auditoria.limitacion'),
      booking_creation: this.translate('clients.gdpr.manager.auditoria.reservaCreada'),
      booking_cancellation: this.translate('clients.gdpr.manager.auditoria.reservaCancelada'),
      login: this.translate('shared.login'),
    };
    return map[action] || action;
  }

  translateReason(reason: string): string {
    const map: Record<string, string> = {
      'Consent granted for data_processing': this.translate('clients.gdpr.manager.auditoria.razonProcesamiento'),
      'Consent granted for marketing': this.translate('clients.gdpr.manager.auditoria.razonMarketing'),
      client_modification: this.translate('clients.gdpr.manager.auditoria.modificacionCliente'),
      'Client Record Change': this.translate('clients.gdpr.manager.auditoria.cambioFicha'),
      'Solicitud Web Derecho al Olvido (Modal Premium)': this.translate('clients.gdpr.manager.auditoria.solicitudOlvido'),
      'Access request status updated to completed': this.translate('clients.gdpr.manager.auditoria.estadoCompletado'),
      user_requested_anonymization: this.translate('clients.gdpr.manager.auditoria.solicitudAnonimizacion'),
      bulk_inactivity_cleanup: this.translate('clients.gdpr.manager.auditoria.limpiezaInactividad'),
    };
    return map[reason] || reason;
  }
}
