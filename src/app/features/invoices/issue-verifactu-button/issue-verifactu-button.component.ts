import {
  Component,
  EventEmitter,
  Input,
  Output,
  inject,
  signal,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { VerifactuService } from '../../../services/verifactu.service';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-issue-verifactu-button',
  standalone: true,
  imports: [],
  template: `
    <div class="inline-flex items-center gap-2">
      <button
        class="px-3 py-1.5 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
        [disabled]="disabled || state() === 'validating' || state() === 'issuing'"
        (click)="onClick()"
      >
        @switch (state()) {
          @case ('validating') {
            <span>Validando…</span>
          }
          @case ('issuing') {
            <span>Emitiendo…</span>
          }
          @case ('done') {
            <span>Emitida</span>
          }
          @default {
            <span>Emitir Verifactu</span>
          }
        }
      </button>

      @if (hash()) {
        <span class="text-xs text-gray-600 dark:text-gray-300"># {{ hash()!.slice(0, 12) }}</span>
      }
    </div>

    <!-- Simple error modal/list -->
    @if (errors().length > 0) {
      <div
        class="mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-sm"
      >
        <div class="font-medium text-red-800 dark:text-red-200 mb-1">Errores de validación</div>
        <ul class="list-disc list-inside text-red-700 dark:text-red-300">
          @for (e of errors(); track e) {
            <li>{{ e }}</li>
          }
        </ul>
      </div>
    }
  `,
})
export class IssueVerifactuButtonComponent {
  private vf = inject(VerifactuService);
  private toast = inject(ToastService);

  @Input() invoiceId!: string;
  @Input() disabled = false;
  @Output() issued = new EventEmitter<{ hash: string; chain_position: number }>();
  @Output() error = new EventEmitter<string>();

  state = signal<'idle' | 'validating' | 'issuing' | 'done' | 'error'>('idle');
  errors = signal<string[]>([]);
  hash = signal<string | null>(null);



  async onClick() {
    if (!this.invoiceId) return;

    try {
      this.errors.set([]);
      this.state.set('issuing');

      // Do not call RPC validate_invoice_before_issue from the frontend —
      // the Edge Function `issue-invoice` runs `verifactu_preflight_issue` internally
      // and returns structured validation errors when appropriate.
      const res: any = await firstValueFrom(this.vf.issueInvoice({ invoiceid: this.invoiceId }));
      if (!res) throw new Error('No se recibió respuesta del servidor');

      if (res.ok === false) {
        if (res.errors && Array.isArray(res.errors)) {
          this.errors.set(res.errors);
          this.toast.error(this.toast.t('toast.verifactu.verifactu'), this.toast.t('toast.verifactu.facturaNoValida'));
          this.error.emit('validation');
          this.state.set('idle');
          return;
        }
        throw new Error(res.error || 'Error desconocido al emitir');
      }

      this.hash.set(res.hash);
      this.state.set('done');
      this.toast.success(this.toast.t('toast.verifactu.verifactu'), this.toast.t('toast.verifactu.facturaEmitida'));
      this.issued.emit({ hash: res.hash, chain_position: res.chain_position });
    } catch (err: any) {
      this.state.set('error');
      // If the error was a structured validation response from the Edge Function
      if (err && err.errors && Array.isArray(err.errors)) {
        this.errors.set(err.errors);
        this.toast.error(this.toast.t('toast.verifactu.verifactu'), this.toast.t('toast.verifactu.facturaNoValida'));
        this.error.emit('validation');
      } else {
        const msg = err?.message || 'Error emitiendo la factura';
        this.toast.error(this.toast.t('toast.verifactu.verifactu'), msg);
        this.error.emit(msg);
      }
    }
  }
}
