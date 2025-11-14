import { Component, EventEmitter, Input, OnDestroy, OnInit, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { VerifactuService } from '../../../services/verifactu.service';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-issue-verifactu-button',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="inline-flex items-center gap-2">
      <button
        class="px-3 py-1.5 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
        [disabled]="disabled || state() === 'validating' || state() === 'issuing'"
        (click)="onClick()">
        <ng-container [ngSwitch]="state()">
          <span *ngSwitchCase="'validating'">Validando…</span>
          <span *ngSwitchCase="'issuing'">Emitiendo…</span>
          <span *ngSwitchCase="'done'">Emitida</span>
          <span *ngSwitchDefault>Emitir Verifactu</span>
        </ng-container>
      </button>

      <span *ngIf="hash()" class="text-xs text-gray-600 dark:text-gray-300"># {{ hash()!.slice(0, 12) }}</span>
    </div>

    <!-- Simple error modal/list -->
    <div *ngIf="errors().length > 0" class="mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm">
      <div class="font-medium text-red-800 dark:text-red-200 mb-1">Errores de validación</div>
      <ul class="list-disc list-inside text-red-700 dark:text-red-300">
        <li *ngFor="let e of errors()">{{ e }}</li>
      </ul>
    </div>
  `
})
export class IssueVerifactuButtonComponent implements OnInit, OnDestroy {
  private vf = inject(VerifactuService);
  private toast = inject(ToastService);

  @Input() invoiceId!: string;
  @Input() disabled = false;
  @Output() issued = new EventEmitter<{ hash: string; chain_position: number }>();
  @Output() error = new EventEmitter<string>();

  state = signal<'idle' | 'validating' | 'issuing' | 'done' | 'error'>('idle');
  errors = signal<string[]>([]);
  hash = signal<string | null>(null);

  ngOnInit() {}
  ngOnDestroy() {}

  async onClick() {
    if (!this.invoiceId) return;

    try {
      this.errors.set([]);
      this.state.set('validating');

      const validation = await this.vf.validateInvoiceBeforeIssue(this.invoiceId).toPromise();
      if (!validation?.valid) {
        this.errors.set(validation?.errors || ['Error de validación desconocido']);
        this.state.set('error');
        this.toast.error('Verifactu', 'La factura no es válida para emisión Verifactu');
        this.error.emit('validation');
        return;
      }

      this.state.set('issuing');
      const res = await this.vf.issueInvoice({ invoice_id: this.invoiceId }).toPromise();
      if (!res) throw new Error('No se recibió respuesta del servidor');

      this.hash.set(res.hash);
      this.state.set('done');
      this.toast.success('Verifactu', 'Factura emitida correctamente');
      this.issued.emit({ hash: res.hash, chain_position: res.chain_position });
    } catch (err: any) {
      this.state.set('error');
      const msg = err?.message || 'Error emitiendo la factura';
      this.toast.error('Verifactu', msg);
      this.error.emit(msg);
    }
  }
}
