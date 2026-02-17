import { Component, ContentChild, ElementRef, Input, Output, EventEmitter, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SignaturePadComponent } from '../../../../shared/components/signature-pad/signature-pad.component';
import { Contract, ContractsService } from '../../../../core/services/contracts.service';
// Imports dinámicos para evitar carga inicial pesada
// import jsPDF from 'jspdf';
// import html2canvas from 'html2canvas';

@Component({
  selector: 'app-contract-sign-dialog',
  standalone: true,
  imports: [CommonModule, SignaturePadComponent],
  template: `
    <div *ngIf="visible()" 
         class="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
         (click)="close()">
      
      <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col"
           (click)="$event.stopPropagation()">
        
        <!-- Header -->
        <div class="p-6 border-b border-gray-200 dark:border-slate-700 flex justify-between items-center">
          <div>
             <h2 class="text-xl font-bold text-gray-900 dark:text-white">{{ contract()?.title }}</h2>
             <p class="text-sm text-gray-500 dark:text-gray-400">Por favor, lee el documento y firma al final.</p>
          </div>
          <button (click)="close()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <i class="fas fa-times text-xl"></i>
          </button>
        </div>

        <!-- Scrollable Content -->
        <div class="flex-1 overflow-y-auto p-8 bg-gray-50 dark:bg-slate-900" id="contract-content-container">
          <!-- Contract Document Paper -->
          <div #contractContent class="bg-white text-black p-10 shadow-sm mx-auto max-w-3xl min-h-[600px] prose prose-sm md:prose-base">
            <div [innerHTML]="contract()?.content_html"></div>
            
            <!-- Metadata Footer for PDF -->
            <div class="mt-12 pt-8 border-t border-gray-200 text-xs text-gray-400 font-mono">
               <p>Documento ID: {{ contract()?.id }}</p>
               <p>Generado el: {{ contract()?.created_at | date:'medium' }}</p>
               <!-- Signature placeholder for PDF generation -->
               <div *ngIf="signedImage()" class="mt-4">
                  <p class="mb-2">Firmado digitalmente por Cliente:</p>
                  <img [src]="signedImage()" class="h-16 object-contain" />
                  <p class="mt-1">Fecha de firma: {{ NOW | date:'medium' }}</p>
                  <p>IP: {{ ipAddress || 'Registrada' }}</p>
               </div>
            </div>
          </div>
        </div>

        <!-- Footer / Signature Area -->
        <div class="p-6 border-t border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-b-2xl">
          
          <div *ngIf="isSigning()" class="space-y-4">
            <p class="font-medium text-gray-700 dark:text-gray-200">Tu firma:</p>
            <app-signature-pad #signaturePad (signatureChange)="onSignatureChange($event)"></app-signature-pad>
            
            <div class="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <input type="checkbox" id="consent" [checked]="consentChecked" (change)="toggleConsent()" class="rounded text-primary-600 focus:ring-primary-500">
              <label for="consent">He leído y acepto los términos y condiciones de este contrato.</label>
            </div>

            <div class="flex justify-end gap-3 mt-4">
              <button (click)="cancelSigning()" 
                      class="px-4 py-2 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors">
                Cancelar
              </button>
              <button (click)="confirmSign()" 
                      [disabled]="!hasSignature || !consentChecked || processing()"
                      class="px-6 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium shadow-md transition-all flex items-center gap-2">
                <i *ngIf="processing()" class="fas fa-spinner fa-spin"></i>
                {{ processing() ? 'Procesando...' : 'Firmar y Finalizar' }}
              </button>
            </div>
          </div>

          <div *ngIf="!isSigning()" class="flex justify-end">
             <button (click)="startSigning()" 
                     class="px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium shadow-lg hover:shadow-xl transition-all flex items-center gap-2">
               <i class="fas fa-pen-nib"></i>
               Firmar Documento
             </button>
          </div>
        </div>

      </div>
    </div>
  `,
  styles: [`
    :host { display: contents; }
  `]
})
export class ContractSignDialogComponent {
  @ViewChild('contractContent') contractContent!: ElementRef<HTMLDivElement>;
  @ViewChild('signaturePad') signaturePad!: SignaturePadComponent;
  @Output() signed = new EventEmitter<Contract>();

  private contractsService = inject(ContractsService);

  visible = signal(false);
  contract = signal<Contract | null>(null);
  isSigning = signal(false);
  processing = signal(false);
  signedImage = signal<string | null>(null);

  hasSignature = false;
  consentChecked = false;

  currentSignatureData: string | null = null;
  NOW = new Date();
  ipAddress = '';

  constructor() {
    // Try to get IP (optional, backend usually reliable)
    // fetch('https://api.ipify.org?format=json').then(r => r.json()).then(d => this.ipAddress = d.ip).catch(() => {});
  }

  open(contract: Contract) {
    this.contract.set(contract);
    this.visible.set(true);
    this.isSigning.set(false);
    this.signedImage.set(null);
    this.consentChecked = false;
    this.hasSignature = false;
    this.currentSignatureData = null;
    this.NOW = new Date();
  }

  close() {
    if (this.processing()) return;
    this.visible.set(false);
  }

  startSigning() {
    this.isSigning.set(true);
    setTimeout(() => {
      // Scroll to bottom of container if needed
    }, 100);
  }

  cancelSigning() {
    this.isSigning.set(false);
    this.signedImage.set(null);
    this.currentSignatureData = null;
    this.hasSignature = false;
  }

  onSignatureChange(data: string | null) {
    this.hasSignature = !!data;
    this.currentSignatureData = data;
  }

  toggleConsent() {
    this.consentChecked = !this.consentChecked;
  }

  async confirmSign() {
    if (!this.consentChecked || !this.hasSignature || !this.contract()) return;

    this.processing.set(true);
    this.signedImage.set(this.currentSignatureData);

    try {
      // Wait for UI to update with signature image
      await new Promise(resolve => setTimeout(resolve, 500));

      // Generate PDF con imports dinámicos
      try {
        const { default: html2canvas } = await import('html2canvas');
        const { default: jsPDF } = await import('jspdf');

        const content = this.contractContent.nativeElement;
        const canvas = await html2canvas(content, {
          scale: 2, // Better resolution
          useCORS: true,
          logging: false
        });

        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const imgWidth = 210; // A4 width in mm
        const pageHeight = 297; // A4 height in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      // Add first page
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      // Add subsequent pages if content overflows
      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      const pdfBlob = pdf.output('blob');
      const pdfFile = new File([pdfBlob], `${this.contract()!.id}_signed.pdf`, { type: 'application/pdf' });

      // Metadata
      const metadata = {
        ip_address: 'Recorded by Application', // Placeholder or real IP if available
        user_agent: navigator.userAgent,
        timestamp: new Date().toISOString(),
        consent_text: 'He leído y acepto los términos y condiciones de este contrato.'
      };

      // Upload & Sign
      const updatedContract = await this.contractsService.signContract(
        this.contract()!.id,
        this.currentSignatureData!,
        pdfFile,
        metadata
      );

      this.signed.emit(updatedContract);
      this.close();

    } catch (error) {
      console.error('Error generating/signing PDF:', error);
      alert('Hubo un error al firmar el documento. Por favor, inténtalo de nuevo.');
    } finally {
      this.processing.set(false);
    }
  }
}
