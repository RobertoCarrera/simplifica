import { Component, OnInit, signal, inject, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuditService, AuditLog } from '../../../services/audit.service';
import { JsonPipe } from '@angular/common';

@Component({
  selector: 'app-audit-logs',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="p-6 max-w-7xl mx-auto space-y-6">
      <!-- Header -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 class="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <i class="fas fa-shield-alt text-amber-500"></i> Auditoría Global
          </h1>
          <p class="text-slate-500 dark:text-slate-400">Registro de seguridad y cambios en el sistema</p>
        </div>
        <div class="flex items-center gap-2">
           <button (click)="loadLogs()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors">
              <i class="fas fa-sync-alt" [class.animate-spin]="loading()"></i> Actualizar
           </button>
        </div>
      </div>

      <!-- Filters -->
      <div class="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label class="block text-xs font-medium text-slate-500 mb-1">Entidad</label>
          <select [(ngModel)]="filters.entityType" (change)="resetAndLoad()" class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm">
            <option value="">Todas</option>
            <option value="bookings">Bookings</option>
            <option value="users">Users</option>
            <option value="invoices">Invoices</option>
            <option value="companies">Companies</option>
            <option value="verifactu_settings">Veri*Factu</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-500 mb-1">Acción</label>
          <select [(ngModel)]="filters.action" (change)="resetAndLoad()" class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm">
            <option value="">Todas</option>
            <option value="INSERT">Crear (INSERT)</option>
            <option value="UPDATE">Modificar (UPDATE)</option>
            <option value="DELETE">Eliminar (DELETE)</option>
          </select>
        </div>
        <!-- Date filters placeholder -->
      </div>

      <!-- Logs Table -->
      <div class="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead class="bg-slate-50 dark:bg-slate-900/50 text-slate-500 font-medium">
              <tr>
                <th class="px-4 py-3">Fecha/Hora</th>
                <th class="px-4 py-3">Actor</th>
                <th class="px-4 py-3">Acción</th>
                <th class="px-4 py-3">Entidad</th>
                <th class="px-4 py-3">IP Address</th>
                <th class="px-4 py-3 text-right">Detalles</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-700">
              @if (loading() && logs().length === 0) {
                <tr><td colspan="6" class="p-8 text-center text-slate-400">Cargando registros...</td></tr>
              } @else if (logs().length === 0) {
                <tr><td colspan="6" class="p-8 text-center text-slate-400">No se encontraron registros.</td></tr>
              }
              
              @for (log of logs(); track log.id) {
                <tr class="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                  <td class="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                    {{ log.created_at | date:'dd/MM/yy HH:mm:ss' }}
                  </td>
                  <td class="px-4 py-3">
                    <div class="flex items-center gap-2">
                       <div class="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold">
                          {{ (log.actor_email || '?')[0] | uppercase }}
                       </div>
                       <span class="text-slate-700 dark:text-slate-200 font-medium truncate max-w-[150px]" [title]="log.actor_email">
                          {{ log.actor_email || 'System' }}
                       </span>
                    </div>
                  </td>
                  <td class="px-4 py-3">
                    <span class="px-2 py-1 rounded-full text-xs font-semibold"
                      [class.bg-green-100]="log.action === 'INSERT'" [class.text-green-700]="log.action === 'INSERT'"
                      [class.bg-blue-100]="log.action === 'UPDATE'" [class.text-blue-700]="log.action === 'UPDATE'"
                      [class.bg-red-100]="log.action === 'DELETE'" [class.text-red-700]="log.action === 'DELETE'">
                      {{ log.action }}
                    </span>
                  </td>
                  <td class="px-4 py-3 text-slate-600 dark:text-slate-300">
                    {{ log.entity_type }} <span class="text-xs text-slate-400">#{{ log.entity_id.substring(0,6) }}...</span>
                  </td>
                  <td class="px-4 py-3 text-slate-500 text-xs font-mono">
                    {{ log.ip_address || '—' }}
                  </td>
                  <td class="px-4 py-3 text-right">
                    <button (click)="openDetail(log)" class="text-indigo-600 hover:text-indigo-800 text-sm font-medium">
                      Ver cambios
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        
        <!-- Pagination -->
        <div class="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center">
            <button [disabled]="page() === 0" (click)="changePage(-1)" class="px-3 py-1 bg-white border border-slate-300 rounded disabled:opacity-50">Anterior</button>
            <span class="text-sm text-slate-500">Página {{ page() + 1 }}</span>
            <button [disabled]="logs().length < pageSize" (click)="changePage(1)" class="px-3 py-1 bg-white border border-slate-300 rounded disabled:opacity-50">Siguiente</button>
        </div>
      </div>
    </div>

    <!-- Detail Modal -->
    @if (selectedLog(); as log) {
      <div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" (click)="closeDetail()">
        <div class="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col" (click)="$event.stopPropagation()">
            <div class="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900">
                <h3 class="font-bold text-lg text-slate-800 dark:text-white">Detalle de Auditoría</h3>
                <button (click)="closeDetail()" class="text-slate-400 hover:text-slate-600"><i class="fas fa-times"></i></button>
            </div>
            
            <div class="p-6 overflow-y-auto flex-1 grid grid-cols-2 gap-6 font-mono text-xs">
                <!-- BEFORE -->
                <div class="space-y-2">
                    <h4 class="font-bold text-red-600 bg-red-50 p-2 rounded">ANTES (Old Data)</h4>
                    @if (log.old_data) {
                        <pre class="bg-slate-50 dark:bg-black/20 p-4 rounded border border-slate-200 overflow-x-auto text-slate-600">{{ log.old_data | json }}</pre>
                    } @else {
                        <div class="p-4 text-slate-400 italic">No existe (Creación)</div>
                    }
                </div>

                <!-- AFTER -->
                <div class="space-y-2">
                    <h4 class="font-bold text-green-600 bg-green-50 p-2 rounded">DESPUÉS (New Data)</h4>
                    @if (log.new_data) {
                        <pre class="bg-slate-50 dark:bg-black/20 p-4 rounded border border-slate-200 overflow-x-auto text-slate-600">{{ log.new_data | json }}</pre>
                    } @else {
                        <div class="p-4 text-slate-400 italic">Eliminado</div>
                    }
                </div>
            </div>
            
            <div class="p-4 bg-slate-50 dark:bg-slate-900 text-xs text-slate-500 border-t border-slate-200">
                User Agent: {{ log.user_agent }}
            </div>
        </div>
      </div>
    }
  `
})
export class AuditLogsComponent implements OnInit {
  private auditService = inject(AuditService);
  private zone = inject(NgZone);

  logs = signal<AuditLog[]>([]);
  loading = signal(false);
  page = signal(0);
  pageSize = 20;

  filters = {
    entityType: '',
    action: ''
  };

  selectedLog = signal<AuditLog | null>(null);

  subscription: any;

  ngOnInit() {
    this.loadLogs();
    this.setupRealtimeSubscription();
  }

  ngOnDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  setupRealtimeSubscription() {
    this.subscription = this.auditService.subscribeToLogs((newLog) => {
      // Run inside Angular Zone to ensure Signal update triggers view refresh
      this.zone.run(() => {
        this.logs.update(current => {
          if (current.some(log => log.id === newLog.id)) {
            return current;
          }
          return [newLog, ...current];
        });
      });
    });
  }

  async loadLogs() {
    this.loading.set(true);
    try {
      const res = await this.auditService.getLogs(this.page(), this.pageSize, {
        entityType: this.filters.entityType || undefined,
        action: this.filters.action || undefined
      });
      this.logs.set(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      this.loading.set(false);
    }
  }

  resetAndLoad() {
    this.page.set(0);
    this.loadLogs();
  }

  changePage(delta: number) {
    this.page.update(p => Math.max(0, p + delta));
    this.loadLogs();
  }

  openDetail(log: AuditLog) {
    this.selectedLog.set(log);
  }

  closeDetail() {
    this.selectedLog.set(null);
  }
}
