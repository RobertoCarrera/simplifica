import { Component, Input, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoService } from '@jsverse/transloco';
import { GdprComplianceService } from '../../../../services/gdpr-compliance.service';
import { ToastService } from '../../../../services/toast.service';

export interface AccessHistoryEntry {
  user_id: string;
  user_name: string;
  accessed_at: string;
  table_name: string;
  action_type: string;
  purpose: string;
  record_id: string;
}

@Component({
  selector: 'app-client-access-history',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="access-history space-y-4">
      <div class="flex items-center justify-between">
        <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2">
          <i class="fas fa-eye text-gray-400"></i>
          {{ translate('clients.gdpr.accessHistory.title') }}
        </h4>
        <button
          (click)="loadHistory()"
          class="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1"
          [disabled]="loading()"
        >
          @if (loading()) {
            <i class="fas fa-spinner fa-spin"></i>
          } @else {
            <i class="fas fa-sync-alt"></i>
          }
          {{ translate('shared.actualizar') }}
        </button>
      </div>

      @if (error()) {
        <div class="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded">
          {{ error() }}
        </div>
      }

      @if (!loading() && entries().length === 0 && !error()) {
        <div class="text-xs text-gray-500 dark:text-gray-400 italic py-4 text-center">
          {{ translate('clients.gdpr.accessHistory.noData') }}
        </div>
      }

      @if (!loading() && entries().length > 0) {
        <div class="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
          <table class="w-full text-xs">
            <thead class="bg-gray-50 dark:bg-slate-700/50">
              <tr>
                <th class="px-3 py-2 text-left text-gray-500 dark:text-gray-400 font-medium">
                  {{ translate('clients.gdpr.accessHistory.user') }}
                </th>
                <th class="px-3 py-2 text-left text-gray-500 dark:text-gray-400 font-medium">
                  {{ translate('clients.gdpr.accessHistory.when') }}
                </th>
                <th class="px-3 py-2 text-left text-gray-500 dark:text-gray-400 font-medium">
                  {{ translate('clients.gdpr.accessHistory.action') }}
                </th>
                <th class="px-3 py-2 text-left text-gray-500 dark:text-gray-400 font-medium hidden sm:table-cell">
                  {{ translate('clients.gdpr.accessHistory.purpose') }}
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
              @for (entry of entries(); track entry.user_id + entry.accessed_at) {
                <tr class="hover:bg-gray-50 dark:hover:bg-slate-700/30">
                  <td class="px-3 py-2 text-gray-900 dark:text-gray-100">
                    <div class="flex flex-col">
                      <span class="font-medium">{{ entry.user_name }}</span>
                    </div>
                  </td>
                  <td class="px-3 py-2 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {{ formatDate(entry.accessed_at) }}
                  </td>
                  <td class="px-3 py-2">
                    <span
                      class="px-2 py-0.5 rounded-full text-[10px] font-medium"
                      [ngClass]="getActionClass(entry.action_type)"
                    >
                      {{ translateAction(entry.action_type) }}
                    </span>
                  </td>
                  <td class="px-3 py-2 text-gray-500 dark:text-gray-400 hidden sm:table-cell">
                    {{ entry.purpose || '-' }}
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      @if (loading()) {
        <div class="text-center py-4">
          <i class="fas fa-spinner fa-spin text-blue-500"></i>
          <span class="ml-2 text-xs text-gray-500">{{ translate('clients.cargando') }}</span>
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }
  `]
})
export class ClientAccessHistoryComponent implements OnInit {
  @Input() clientId!: string;
  @Input() clientEmail?: string;

  private gdprService = inject(GdprComplianceService);
  private toastService = inject(ToastService);
  private translocoService = inject(TranslocoService);

  entries = signal<AccessHistoryEntry[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);

  ngOnInit() {
    if (this.clientId) {
      this.loadHistory();
    }
  }

  ngOnChanges() {
    if (this.clientId) {
      this.loadHistory();
    }
  }

  translate(key: string): string {
    return this.translocoService.translate(key);
  }

  loadHistory() {
    if (!this.clientId) return;

    this.loading.set(true);
    this.error.set(null);

    this.gdprService.getClientAccessHistory(this.clientId).subscribe({
      next: (data) => {
        this.entries.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error loading access history:', err);
        this.error.set(this.translate('clients.gdpr.accessHistory.loadError'));
        this.loading.set(false);
        this.toastService.error(
          this.translate('clients.gdpr.accessHistory.loadError'),
          this.translate('shared.error')
        );
      }
    });
  }

  formatDate(dateString: string): string {
    if (!dateString) return '-';
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

  translateAction(action: string): string {
    const map: Record<string, string> = {
      'data_access': this.translate('clients.gdpr.accessHistory.dataAccess'),
      'update': this.translate('shared.actualizar'),
      'insert': this.translate('shared.crear'),
      'delete': this.translate('shared.eliminar'),
      'export': this.translate('clients.gdpr.accessHistory.export'),
    };
    return map[action] || action;
  }

  getActionClass(action: string): Record<string, boolean> {
    switch (action) {
      case 'data_access':
        return { 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400': true };
      case 'export':
        return { 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400': true };
      case 'update':
        return { 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400': true };
      default:
        return { 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300': true };
    }
  }
}
