import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { ClientPortalService } from '../../services/client-portal.service';
import { SupabaseQuotesService } from '../../services/supabase-quotes.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-portal-quote-detail',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="min-h-screen bg-gray-50 dark:bg-gray-950 p-4 sm:p-6 lg:p-8">
      <div class="max-w-5xl mx-auto">
        <!-- Header -->
        <div class="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <a routerLink="/portal/presupuestos" class="inline-flex items-center text-sm text-blue-600 dark:text-blue-400 hover:underline mb-2">
              <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
              </svg>
              Volver a presupuestos
            </a>
            <h1 class="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
              Presupuesto {{ quote()?.full_quote_number }}
            </h1>
          </div>
        </div>

        <ng-container *ngIf="loading()">
          <div class="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-12">
            <div class="flex items-center justify-center">
              <div class="animate-spin rounded-full h-12 w-12 border-4 border-blue-200 dark:border-blue-900 border-t-blue-600 dark:border-t-blue-400"></div>
              <span class="ml-3 text-gray-600 dark:text-gray-400">Cargando presupuesto…</span>
            </div>
          </div>
        </ng-container>

        <ng-container *ngIf="!loading() && !quote()">
          <div class="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-12 text-center">
            <svg class="w-16 h-16 mx-auto text-gray-400 dark:text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
            </svg>
            <p class="text-lg text-gray-600 dark:text-gray-400">Presupuesto no encontrado o sin acceso.</p>
          </div>
        </ng-container>

        <ng-container *ngIf="!loading() && quote()">
          <!-- Quote info cards -->
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div class="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-5 transition-all hover:shadow-md">
              <div class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Título</div>
              <div class="text-base font-semibold text-gray-900 dark:text-gray-100">{{ quote()?.title }}</div>
            </div>
            
            <div class="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-5 transition-all hover:shadow-md">
              <div class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Estado</div>
              <div>
                <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold" 
                      [ngClass]="statusClass(quote()?.status)">
                  {{ statusLabel(quote()?.status) }}
                </span>
              </div>
            </div>
            
            <div class="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-5 transition-all hover:shadow-md">
              <div class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Fecha</div>
              <div class="text-base font-semibold text-gray-900 dark:text-gray-100">{{ quote()?.quote_date | date:'dd/MM/yyyy' }}</div>
            </div>
            
            <div class="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-5 transition-all hover:shadow-md">
              <div class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Válido hasta</div>
              <div class="text-base font-semibold text-gray-900 dark:text-gray-100">{{ quote()?.valid_until | date:'dd/MM/yyyy' }}</div>
            </div>
          </div>

          <!-- Items table -->
          <div class="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden mb-6">
            <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-800">
              <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">Conceptos</h2>
            </div>
            <div class="overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                <thead class="bg-gray-50 dark:bg-gray-800/50">
                  <tr>
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Descripción</th>
                    <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Cantidad</th>
                    <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Precio</th>
                    <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">IVA</th>
                    <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total</th>
                  </tr>
                </thead>
                <tbody class="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                  <tr *ngFor="let it of quote()?.items || []; let i = index" 
                      class="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td class="px-6 py-4 text-sm text-gray-900 dark:text-gray-100">
                      <div class="font-medium">{{ it.description }}</div>
                    </td>
                    <td class="px-6 py-4 text-sm text-right text-gray-700 dark:text-gray-300">{{ it.quantity }}</td>
                    <td class="px-6 py-4 text-sm text-right text-gray-700 dark:text-gray-300">{{ it.unit_price | number:'1.2-2' }} €</td>
                    <td class="px-6 py-4 text-sm text-right text-gray-700 dark:text-gray-300">{{ it.tax_rate }}%</td>
                    <td class="px-6 py-4 text-sm text-right font-medium text-gray-900 dark:text-gray-100">{{ it.total | number:'1.2-2' }} €</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Total and actions -->
          <div class="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-6">
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div class="flex-1">
                <div class="text-sm text-gray-600 dark:text-gray-400 mb-1">Importe Total</div>
                <div class="text-3xl font-bold text-gray-900 dark:text-gray-100">
                  {{ quote()?.total_amount | number:'1.2-2' }} €
                </div>
              </div>

              <!-- Action buttons (only show if quote is in 'sent' or 'viewed' status) -->
              <div class="flex flex-wrap gap-3 items-center">
                <button 
                  (click)="downloadPdf()"
                  class="px-6 py-3 rounded-lg font-medium text-sm transition-all 
                         bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 
                         border-2 border-gray-300 dark:border-gray-600 
                         hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-400 dark:hover:border-gray-500
                         shadow-sm hover:shadow">
                  Descargar PDF
                </button>
                <div *ngIf="canRespond()" class="flex gap-3">
                <button 
                  (click)="onReject()"
                  [disabled]="processing()"
                  class="px-6 py-3 rounded-lg font-medium text-sm transition-all 
                         bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 
                         border-2 border-gray-300 dark:border-gray-600 
                         hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-400 dark:hover:border-gray-500
                         disabled:opacity-50 disabled:cursor-not-allowed
                         shadow-sm hover:shadow">
                  <span *ngIf="!processing()">Rechazar</span>
                  <span *ngIf="processing()">Procesando...</span>
                </button>
                
                <button 
                  (click)="onAccept()"
                  [disabled]="processing()"
                  class="px-6 py-3 rounded-lg font-medium text-sm transition-all 
                         bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-500 dark:to-blue-600 
                         text-white 
                         hover:from-blue-700 hover:to-blue-800 dark:hover:from-blue-600 dark:hover:to-blue-700
                         disabled:opacity-50 disabled:cursor-not-allowed
                         shadow-md hover:shadow-lg
                         transform hover:scale-[1.02] active:scale-[0.98]">
                  <span *ngIf="!processing()">✓ Aceptar presupuesto</span>
                  <span *ngIf="processing()">Procesando...</span>
                </button>
                </div>
              </div>

              <!-- Already responded message -->
              <div *ngIf="!canRespond() && quote()?.status !== 'draft'" 
                   class="px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                <span class="text-sm text-gray-600 dark:text-gray-400">
                  Ya has respondido a este presupuesto
                </span>
              </div>
            </div>
          </div>
        </ng-container>
      </div>
    </div>

    <!-- Confirmation Modal -->
    <div *ngIf="showConfirmModal()" 
         class="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center p-4 z-50 animate-fadeIn"
         (click)="cancelConfirm()">
      <div class="bg-white dark:bg-gray-900 rounded-lg shadow-2xl max-w-md w-full p-6 animate-scaleIn"
           (click)="$event.stopPropagation()">
        <h3 class="text-xl font-bold text-gray-900 dark:text-gray-100 mb-3">
          {{ confirmAction() === 'accept' ? '¿Aceptar presupuesto?' : '¿Rechazar presupuesto?' }}
        </h3>
        <p class="text-gray-600 dark:text-gray-400 mb-6">
          <span *ngIf="confirmAction() === 'accept'">
            Al aceptar este presupuesto, confirmas que estás de acuerdo con los términos y el importe total de 
            <strong class="text-gray-900 dark:text-gray-100">{{ quote()?.total_amount | number:'1.2-2' }} €</strong>.
          </span>
          <span *ngIf="confirmAction() === 'reject'">
            ¿Estás seguro de que deseas rechazar este presupuesto? Esta acción notificará a la empresa.
          </span>
        </p>
        <div class="flex gap-3 justify-end">
          <button 
            (click)="cancelConfirm()"
            class="px-4 py-2 rounded-lg font-medium text-sm 
                   bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 
                   hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
            Cancelar
          </button>
          <button 
            (click)="confirmResponse()"
            [disabled]="processing()"
            class="px-4 py-2 rounded-lg font-medium text-sm transition-all disabled:opacity-50"
            [ngClass]="confirmAction() === 'accept' 
              ? 'bg-blue-600 dark:bg-blue-500 text-white hover:bg-blue-700 dark:hover:bg-blue-600' 
              : 'bg-red-600 dark:bg-red-500 text-white hover:bg-red-700 dark:hover:bg-red-600'">
            {{ confirmAction() === 'accept' ? 'Sí, aceptar' : 'Sí, rechazar' }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes scaleIn {
      from { transform: scale(0.95); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }
    .animate-fadeIn { animation: fadeIn 0.2s ease-out; }
    .animate-scaleIn { animation: scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
  `]
})
export class PortalQuoteDetailComponent implements OnInit {
  private svc = inject(ClientPortalService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toast = inject(ToastService);
  private quotes = inject(SupabaseQuotesService);

  quote = signal<any | null>(null);
  loading = signal<boolean>(true);
  processing = signal<boolean>(false);
  showConfirmModal = signal<boolean>(false);
  confirmAction = signal<'accept' | 'reject' | null>(null);

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id') as string;
    console.log('📄 Loading quote detail for ID:', id);
    const { data, error } = await this.svc.getQuote(id);
      if (error) {
      console.error('❌ Error loading quote:', error);
    } else {
      console.log('✅ Quote loaded:', data);
      this.quote.set(data);
    }
    this.loading.set(false);
  }

  downloadPdf() {
    const q = this.quote();
    if (!q) return;
    this.quotes.getQuotePdfUrl(q.id).subscribe({
      next: (signed) => window.open(signed, '_blank'),
      error: (e) => {
        try { this.toast.error('No se pudo generar el PDF', e?.message || String(e)); } catch {}
      }
    });
  }

  canRespond(): boolean {
    const status = this.quote()?.status;
    return status === 'sent' || status === 'viewed';
  }

  onAccept() {
    this.confirmAction.set('accept');
    this.showConfirmModal.set(true);
  }

  onReject() {
    this.confirmAction.set('reject');
    this.showConfirmModal.set(true);
  }

  cancelConfirm() {
    this.showConfirmModal.set(false);
    this.confirmAction.set(null);
  }

  async confirmResponse() {
    const action = this.confirmAction();
    if (!action) return;

    this.processing.set(true);
    const id = this.quote()?.id;

    try {
      console.log(`🔄 ${action === 'accept' ? 'Accepting' : 'Rejecting'} quote ${id}...`);
      
      const { data, error } = await this.svc.respondToQuote(id, action);
      
      if (error) {
        console.error(`❌ Error ${action}ing quote:`, error);
        try { this.toast.error('Error', `No se pudo ${action === 'accept' ? 'aceptar' : 'rechazar'} el presupuesto: ${error.message || 'Inténtalo de nuevo'}`);} catch {}
      } else {
        console.log(`✅ Quote ${action}ed successfully:`, data);
        // Update local quote state
        this.quote.set(data);
        // Show success message
        try { this.toast.success('Acción completada', `Presupuesto ${action === 'accept' ? 'aceptado' : 'rechazado'} correctamente`);} catch {}
      }
    } catch (err: any) {
      console.error(`❌ Unexpected error ${action}ing quote:`, err);
      try { this.toast.error('Error inesperado', err?.message || 'Operación no completada'); } catch {}
    } finally {
      this.processing.set(false);
      this.showConfirmModal.set(false);
      this.confirmAction.set(null);
    }
  }

  statusLabel(status?: string | null): string {
    const labels: Record<string, string> = {
      draft: 'Borrador',
      sent: 'Enviado',
      viewed: 'Visto',
      accepted: 'Aceptado',
      rejected: 'Rechazado',
      expired: 'Expirado',
      invoiced: 'Facturado',
      cancelled: 'Cancelado'
    };
    return (status && labels[status]) || (status || '');
  }

  statusClass(status?: string | null): string {
    const base = 'text-xs';
    const map: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
      sent: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
      viewed: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300',
      accepted: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
      rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
      expired: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
      invoiced: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
      cancelled: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'
    };
    return `${base} ${status ? map[status] : map['draft']}`;
  }
}
