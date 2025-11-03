import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { SupabaseInvoicesService } from '../../../services/supabase-invoices.service';
import { Invoice } from '../../../models/invoice.model';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-invoice-detail',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
  <div class="p-4" *ngIf="invoice() as inv">
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-2xl font-semibold text-gray-900 dark:text-gray-100">Factura {{ inv.full_invoice_number || (inv.invoice_series + '-' + inv.invoice_number) }}</h1>
      <div class="flex gap-2">
        <a class="px-3 py-1.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100" routerLink="/facturacion">Volver</a>
        <button class="px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700" (click)="downloadPdf(inv.id)">Descargar PDF</button>
        <button class="px-3 py-1.5 rounded bg-red-600 text-white hover:bg-red-700" (click)="cancelInvoice(inv.id)">Anular</button>
  <button class="px-3 py-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60" [disabled]="sendingEmail()" (click)="sendEmail(inv.id)">{{ sendingEmail() ? 'Enviando…' : 'Enviar por email' }}</button>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-4">
        <h2 class="text-lg font-medium text-gray-800 dark:text-gray-200 mb-2">Datos</h2>
        <p class="text-sm text-gray-600 dark:text-gray-300">Fecha: {{ inv.invoice_date }}</p>
        <p class="text-sm text-gray-600 dark:text-gray-300">Vencimiento: {{ inv.due_date }}</p>
        <p class="text-sm text-gray-600 dark:text-gray-300">Estado: {{ inv.status }}</p>
      </div>
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-4">
        <h2 class="text-lg font-medium text-gray-800 dark:text-gray-200 mb-2">Importes</h2>
        <p class="text-sm text-gray-600 dark:text-gray-300">Subtotal: {{ inv.subtotal | number:'1.2-2' }} {{ inv.currency }}</p>
        <p class="text-sm text-gray-600 dark:text-gray-300">Impuestos: {{ inv.tax_amount | number:'1.2-2' }} {{ inv.currency }}</p>
        <p class="text-sm font-medium text-gray-900 dark:text-gray-100">Total: {{ inv.total | number:'1.2-2' }} {{ inv.currency }}</p>
      </div>
      <!-- VeriFactu Status -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 p-4 md:col-span-2">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-lg font-medium text-gray-800 dark:text-gray-200">Estado VeriFactu</h2>
          <div class="flex gap-2">
            <button class="px-3 py-1.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-600"
                    (click)="refreshVerifactu(inv.id)">
              Actualizar
            </button>
            <button class="px-3 py-1.5 rounded bg-indigo-600 text-white hover:bg-indigo-700"
                    (click)="runDispatcher()">
              Ejecutar dispatcher
            </button>
            <button class="px-3 py-1.5 rounded bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    [disabled]="!canRetry()"
                    (click)="retry(inv.id)">
              Reintentar envío
            </button>
          </div>
        </div>

        <div *ngIf="verifactuMeta() as meta; else noMeta">
          <div class="flex items-center gap-3 mb-3">
            <span class="text-sm text-gray-600 dark:text-gray-300">Serie/Número:</span>
            <span class="text-sm font-medium text-gray-900 dark:text-gray-100">{{ meta.series }}-{{ meta.number }}</span>
            <span class="ml-auto inline-flex items-center px-2 py-1 rounded text-xs font-medium"
                  [ngClass]="statusChipClass(meta.status)">{{ meta.status }}</span>
          </div>
          <div class="flex flex-wrap items-center gap-4 mb-3">
            <div class="text-sm text-gray-700 dark:text-gray-300">Intentos: <span class="font-medium text-gray-900 dark:text-gray-100">{{ attemptsDisplay() }}</span></div>
            <div class="text-sm text-gray-700 dark:text-gray-300">Próximo intento: <span class="font-medium text-gray-900 dark:text-gray-100">{{ nextRetryDisplay() }}</span></div>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <div class="text-xs text-gray-500 dark:text-gray-400">Hash</div>
              <div class="text-sm text-gray-800 dark:text-gray-200 truncate">{{ meta.chained_hash }}</div>
            </div>
            <div>
              <div class="text-xs text-gray-500 dark:text-gray-400">Emitida</div>
              <div class="text-sm text-gray-800 dark:text-gray-200">{{ meta.issue_time | date:'short' }}</div>
            </div>
            <div>
              <div class="text-xs text-gray-500 dark:text-gray-400">Creada</div>
              <div class="text-sm text-gray-800 dark:text-gray-200">{{ meta.created_at | date:'short' }}</div>
            </div>
          </div>

          <div class="mt-4">
            <div class="text-sm font-medium text-gray-800 dark:text-gray-200 mb-2">Últimos eventos</div>
            <div class="overflow-hidden rounded border border-gray-200 dark:border-gray-700">
              <table class="min-w-full text-sm">
                <thead class="bg-gray-50 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300">
                  <tr>
                    <th class="text-left px-3 py-2 font-medium">Fecha</th>
                    <th class="text-left px-3 py-2 font-medium">Tipo</th>
                    <th class="text-left px-3 py-2 font-medium">Estado</th>
                    <th class="text-left px-3 py-2 font-medium">Intentos</th>
                    <th class="text-left px-3 py-2 font-medium">Error</th>
                  </tr>
                </thead>
                <tbody>
                  @for (ev of verifactuEvents(); track ev.id) {
                    <tr class="border-t border-gray-100 dark:border-gray-700/60">
                      <td class="px-3 py-2 text-gray-800 dark:text-gray-200">{{ ev.created_at | date:'short' }}</td>
                      <td class="px-3 py-2 text-gray-800 dark:text-gray-200">{{ ev.event_type }}</td>
                      <td class="px-3 py-2">
                        <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium" [ngClass]="statusChipClass(ev.status)">{{ ev.status }}</span>
                      </td>
                      <td class="px-3 py-2 text-gray-800 dark:text-gray-200">{{ ev.attempts || 0 }}</td>
                      <td class="px-3 py-2 text-gray-600 dark:text-gray-300 truncate max-w-[24ch]">{{ ev.last_error || '-' }}</td>
                    </tr>
                  }
                  @empty {
                    <tr>
                      <td colspan="5" class="px-3 py-3 text-gray-500 dark:text-gray-400">Sin eventos.</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <ng-template #noMeta>
          <p class="text-sm text-gray-600 dark:text-gray-300">Aún no hay metadatos VeriFactu para esta factura.</p>
        </ng-template>
      </div>
    </div>
  </div>
  `
})
export class InvoiceDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private invoicesService = inject(SupabaseInvoicesService);
  invoice = signal<Invoice | null>(null);
  verifactuMeta = signal<any | null>(null);
  verifactuEvents = signal<any[]>([]);
  vfConfig = signal<{ maxAttempts: number; backoffMinutes: number[] } | null>(null);
  sendingEmail = signal(false);

  attemptsDisplay = computed(() => {
    const last = this.latestRelevantEvent();
    const cfg = this.vfConfig();
    const max = cfg?.maxAttempts ?? 7;
    const used = last ? (last.attempts ?? 0) : 0;
    return `${Math.min(used, max)}/${max}`;
  });

  nextRetryDisplay = computed(() => {
    const last = this.latestRelevantEvent();
    if (!last) return '-';
    const cfg = this.vfConfig();
    const max = cfg?.maxAttempts ?? 7;
    const backoff = cfg?.backoffMinutes ?? [0,1,5,15,60,180,720];
    const attempts = last.attempts ?? 0;
    if (attempts >= max) return '—';
    const idx = Math.min(attempts, backoff.length - 1);
    const waitMin = backoff[idx] ?? 0;
    const lastTs = last.sent_at ? new Date(last.sent_at).getTime() : new Date(last.created_at).getTime();
    const eta = lastTs + waitMin * 60_000;
    const diff = eta - Date.now();
    if (diff <= 0) return 'inminente';
    const mins = Math.ceil(diff / 60_000);
    if (mins < 60) return `~${mins} min`;
    const hours = Math.floor(mins / 60);
    const rem = mins % 60;
    return rem ? `~${hours} h ${rem} min` : `~${hours} h`;
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.invoicesService.getInvoice(id).subscribe({
        next: (inv) => this.invoice.set(inv),
        error: (err) => console.error('Error loading invoice', err)
      });
      // Load VeriFactu info
      this.refreshVerifactu(id);
    }
    // Load VF config from server
    this.invoicesService.getVerifactuConfig().subscribe({
      next: (cfg) => this.vfConfig.set(cfg),
      error: (e) => console.warn('VF config err', e)
    });
  }

  downloadPdf(invoiceId: string){
    const url = `${environment.edgeFunctionsBaseUrl}/invoices-pdf?invoice_id=${invoiceId}&download=1`;
    window.open(url, '_blank');
  }

  refreshVerifactu(invoiceId: string) {
    this.invoicesService.getVerifactuMeta(invoiceId).subscribe({
      next: (meta) => this.verifactuMeta.set(meta),
      error: (e) => console.warn('VF meta err', e)
    });
    this.invoicesService.getVerifactuEvents(invoiceId).subscribe({
      next: (list) => this.verifactuEvents.set(list || []),
      error: (e) => console.warn('VF events err', e)
    });
  }

  runDispatcher(){
    this.invoicesService.runDispatcherNow().subscribe({
      next: () => {
        const id = this.route.snapshot.paramMap.get('id');
        if (id) this.refreshVerifactu(id);
      },
      error: (e) => console.error('Dispatcher error', e)
    });
  }

  retry(invoiceId: string){
    this.invoicesService.retryVerifactu(invoiceId).subscribe({
      next: () => this.refreshVerifactu(invoiceId),
      error: (e) => console.error('Retry error', e)
    });
  }

  canRetry(): boolean {
    const events = this.verifactuEvents();
    if (!events || events.length === 0) return false;
    const last = events[0];
    // Retry allowed if last known event is rejected and attempts < MAX_ATTEMPTS (UI doesn't know exact limit; rely on server to enforce)
    return last.status === 'rejected';
  }

  statusChipClass(status: string): string {
    const s = (status || '').toLowerCase();
    if (s === 'accepted' || s === 'sent') return 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200';
    if (s === 'rejected') return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200';
    if (s === 'sending' || s === 'pending') return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200';
    if (s === 'void') return 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
  }

  private latestRelevantEvent(): any | null {
    const list = this.verifactuEvents();
    if (!list || list.length === 0) return null;
    // Prefer the most recent pending event (queued for retry), otherwise the most recent event
    const pending = list.find(ev => ev.status === 'pending');
    return pending || list[0];
  }

  cancelInvoice(invoiceId: string){
    if (!confirm('¿Anular esta factura? Se enviará anulación a AEAT.')) return;
    this.invoicesService.cancelInvoiceWithAEAT(invoiceId).subscribe({
      next: () => {
        // Reload invoice and verifactu state
        this.invoicesService.getInvoice(invoiceId).subscribe({
          next: (inv) => this.invoice.set(inv),
          error: (e) => console.warn('Reload invoice err', e)
        });
        this.refreshVerifactu(invoiceId);
      },
      error: (e) => alert('Error al anular: ' + (e?.message || e))
    });
  }

  sendEmail(invoiceId: string){
    const inv = this.invoice();
    const to = inv?.client?.email?.trim();
    if (!to) {
      alert('El cliente no tiene un email configurado. Añádelo en la ficha del cliente para poder enviar la factura.');
      return;
    }
    const num = inv?.full_invoice_number || (inv?.invoice_series && inv?.invoice_number ? `${inv.invoice_series}-${inv.invoice_number}` : undefined);
    const subject = num ? `Tu factura ${num}` : 'Tu factura';
    const message = 'Te enviamos tu factura. Puedes descargar el PDF desde el enlace seguro proporcionado.';
    this.sendingEmail.set(true);
    this.invoicesService.sendInvoiceEmail(invoiceId, to, subject, message).subscribe({
      next: () => {
        this.sendingEmail.set(false);
        alert('Email enviado correctamente');
      },
      error: (e) => {
        this.sendingEmail.set(false);
        alert('Error al enviar email: ' + (e?.message || e));
      }
    });
  }
}
