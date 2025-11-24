import { Component, Input, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Invoice } from '../../../models/invoice.model';
import * as QRCode from 'qrcode';

@Component({
  selector: 'app-verifactu-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div *ngIf="invoice && invoice.verifactu_hash" class="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200 cursor-pointer" (click)="toggleQR()">
      <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
      <span class="text-xs font-medium">VeriFactu</span>
      <span class="text-xs"># {{ (invoice.verifactu_hash || '').slice(0, 12) }}</span>
    </div>

    <!-- QR Modal -->
    <div *ngIf="showQR" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" (click)="toggleQR()">
      <div class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-sm w-full mx-4" (click)="$event.stopPropagation()">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Código QR Veri*Factu</h3>
          <button (click)="toggleQR()" class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div class="flex justify-center mb-4 bg-white p-4 rounded">
          <canvas #qrCanvas></canvas>
        </div>

        <div class="text-xs text-center text-gray-500 dark:text-gray-400 break-all">
          {{ qrUrl }}
        </div>
        
        <div class="mt-4 flex justify-center">
             <button type="button" class="text-sm text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 underline" (click)="copyHash()">Copiar Hash Completo</button>
        </div>
      </div>
    </div>
  `
})
export class VerifactuBadgeComponent {
  @Input() invoice!: Invoice;
  @ViewChild('qrCanvas') qrCanvas!: ElementRef<HTMLCanvasElement>;

  showQR = false;
  qrUrl = '';

  toggleQR() {
    this.showQR = !this.showQR;
    if (this.showQR) {
      setTimeout(() => this.generateQR(), 0);
    }
  }

  async generateQR() {
    if (!this.invoice) return;

    // Construct URL (same logic as service, but client-side for immediate rendering)
    const baseUrl = 'https://www.agenciatributaria.es/verifactu';
    const params = new URLSearchParams({
      nif: this.invoice.company_id,
      numero: this.invoice.full_invoice_number || '',
      fecha: this.invoice.invoice_date,
      importe: this.invoice.total.toFixed(2),
      hash: this.invoice.verifactu_hash || ''
    });
    this.qrUrl = `${baseUrl}?${params.toString()}`;

    if (this.qrCanvas) {
      try {
        await QRCode.toCanvas(this.qrCanvas.nativeElement, this.qrUrl, {
          width: 200,
          margin: 1,
          color: {
            dark: '#000000',
            light: '#ffffff'
          }
        });
      } catch (err) {
        console.error('Error generating QR:', err);
      }
    }
  }

  async copyHash() {
    try {
      if (this.invoice?.verifactu_hash) {
        await navigator.clipboard.writeText(this.invoice.verifactu_hash);
      }
    } catch { }
  }
}
