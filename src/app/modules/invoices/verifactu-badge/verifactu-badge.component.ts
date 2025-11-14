import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Invoice } from '../../../models/invoice.model';

@Component({
  selector: 'app-verifactu-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div *ngIf="invoice && invoice.verifactu_hash" class="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
      <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
      <span class="text-xs font-medium">VeriFactu</span>
      <span class="text-xs"># {{ (invoice.verifactu_hash || '').slice(0, 12) }}</span>
      <button type="button" class="text-xs underline hover:no-underline" (click)="copyHash()">Copiar</button>
    </div>
  `
})
export class VerifactuBadgeComponent {
  @Input() invoice!: Invoice;

  async copyHash() {
    try {
      if (this.invoice?.verifactu_hash) {
        await navigator.clipboard.writeText(this.invoice.verifactu_hash);
      }
    } catch {}
  }
}
