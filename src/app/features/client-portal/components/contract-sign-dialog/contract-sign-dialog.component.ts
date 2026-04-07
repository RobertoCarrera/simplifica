import { Component, ContentChild, ElementRef, Input, Output, EventEmitter, ViewChild, inject, signal, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SignaturePadComponent } from '../../../../shared/components/signature-pad/signature-pad.component';
import { Contract, ContractsService } from '../../../../core/services/contracts.service';
import { SafeHtmlPipe } from '../../../../core/pipes/safe-html.pipe';
// Imports dinámicos para evitar carga inicial pesada
// import jsPDF from 'jspdf';
// import html2canvas from 'html2canvas';

@Component({
  selector: 'app-contract-sign-dialog',
  standalone: true,
  imports: [CommonModule, SignaturePadComponent, SafeHtmlPipe],
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

        <!-- Important Notice -->
        <div class="px-6 py-3 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800">
          <div class="flex items-center gap-3">
            <div class="flex items-center justify-center w-8 h-8 bg-amber-100 dark:bg-amber-900/40 rounded-full">
              <i class="fas fa-exclamation-triangle text-amber-600 dark:text-amber-400 text-sm"></i>
            </div>
            <div class="flex-1">
              <p class="font-medium text-amber-800 dark:text-amber-200 text-sm">
                ⚠️ Este documento es importante, léelo detenidamente antes de firmar
              </p>
            </div>
            <div class="text-sm">
              @if (secondsRemaining() > 0) {
                <span class="text-amber-600 dark:text-amber-400 font-mono">
                  Espera {{ secondsRemaining() }}s para poder firmar
                </span>
              } @else {
                <span class="text-emerald-600 dark:text-emerald-400 font-medium">
                  ✓ Listo para firmar
                </span>
              }
            </div>
          </div>
        </div>

        <!-- Scrollable Content -->
        <div class="flex-1 overflow-y-auto p-6 bg-gray-200 dark:bg-slate-900" 
             id="contract-content-container"
             (scroll)="onScroll($event)"
              #scrollContainer>
           <!-- Contract Document Paper -->
           <div #contractContent class="bg-white shadow-2xl rounded-xl mx-auto max-w-3xl overflow-hidden" style="min-height: 900px;">
             <div class="dpa-document" style="padding: 48px 56px;" [innerHTML]="contract()?.content_html | safeHtml"></div>
             
             <!-- Metadata Footer for PDF -->
             <div class="px-16 pb-12 pt-8 border-t border-gray-100 text-xs text-gray-400 font-mono">
                <p>Documento ID: {{ contract()?.id }}</p>
                <p>Generado el: {{ contract()?.created_at | date:'medium' }}</p>
                <!-- Signature info when signed -->
                <div *ngIf="signedImage()" class="mt-4">
                   <p class="mb-2">Firmado digitalmente por:</p>
                   <img [src]="signedImage()" class="h-16 object-contain mb-2" />
                   <p>IP: {{ ipAddress || 'Registrada' }}</p>
                </div>
             </div>
           </div>
         </div>

        <!-- Footer / Signature Area -->
        <div class="p-6 border-t border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-b-2xl">
          
          <div *ngIf="isSigning()" class="space-y-4">
            <!-- Admin Signature Option -->
            <div *ngIf="adminSignature()" class="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800">
              <div class="flex items-center gap-3">
                <input type="checkbox" id="useAdminSignature" [checked]="useAdminSignature()" (change)="toggleUseAdminSignature()" class="rounded text-primary-600 focus:ring-primary-500">
                <label for="useAdminSignature" class="text-sm text-emerald-800 dark:text-emerald-200">
                  Usar mi firma guardada (se aplicará automáticamente)
                </label>
              </div>
            </div>
            
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
                     [disabled]="!canSign()"
                     class="px-6 py-3 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium shadow-lg hover:shadow-xl transition-all flex items-center gap-2">
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
    
    /* Clean paper-like document */
    ::ng-deep .dpa-document {
      font-family: Georgia, 'Times New Roman', serif;
      color: #222;
      line-height: 1.85;
      font-size: 14px;
      padding: 20px 0;
    }
    
    ::ng-deep .dpa-document h1 {
      font-size: 20px;
      font-weight: 700;
      color: #111;
      text-align: center;
      margin: 0 0 6px 0;
      letter-spacing: 0.5px;
    }
    
    ::ng-deep .dpa-document .subtitle {
      font-size: 11px;
      color: #555;
      text-align: center;
      margin: 0 0 28px 0;
      font-style: italic;
    }
    
    ::ng-deep .dpa-document h2 {
      font-size: 13px;
      font-weight: 700;
      color: #333;
      margin: 28px 0 12px 0;
      font-family: Arial, Helvetica, sans-serif;
    }
    
    ::ng-deep .dpa-document h2:first-of-type {
      margin-top: 20px;
    }
    
    ::ng-deep .dpa-document p {
      margin: 0 0 11px 0;
      text-align: justify;
      hyphens: auto;
      font-size: 13px;
      color: #333;
    }
    
    ::ng-deep .dpa-document ul {
      margin: 0 0 18px 0;
      padding-left: 24px;
    }
    
    ::ng-deep .dpa-document li {
      margin-bottom: 9px;
      font-size: 13px;
      color: #333;
    }
    
    ::ng-deep .dpa-document .partes-grid {
      display: flex;
      gap: 18px;
      margin: 22px 0;
    }
    
    ::ng-deep .dpa-document .parte-box {
      flex: 1;
      padding: 14px 16px;
    }
    
    ::ng-deep .dpa-document .parte-label {
      font-size: 10px;
      font-weight: 700;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      margin-bottom: 6px;
      font-family: Arial, Helvetica, sans-serif;
    }
    
    ::ng-deep .dpa-document .parte-box p {
      margin: 0;
      font-size: 12.5px;
      color: #333;
      text-align: left;
      hyphens: none;
    }
    
    ::ng-deep .dpa-document .firma-section {
      margin: 40px 0 0 0;
      padding: 24px 28px;
    }
    
    ::ng-deep .dpa-document .firma-section h3 {
      font-size: 11px;
      font-weight: 700;
      color: #555;
      margin: 0 0 20px 0;
      text-align: center;
      font-family: Arial, Helvetica, sans-serif;
      text-transform: uppercase;
      letter-spacing: 0.8px;
    }
    
    ::ng-deep .dpa-document .firma-row {
      display: flex;
      justify-content: center;
      gap: 80px;
    }
    
    ::ng-deep .dpa-document .firma-box {
      text-align: center;
      min-width: 180px;
    }
    
    ::ng-deep .dpa-document .firma-line {
      border-bottom: 1px solid #333;
      margin-bottom: 6px;
      height: 100px;
    }
    
    ::ng-deep .dpa-document .firma-image {
      height: 100px;
      margin-bottom: 6px;
      object-fit: contain;
    }
    
    ::ng-deep .dpa-document .firma-box label {
      font-size: 10px;
      color: #555;
      font-family: Arial, Helvetica, sans-serif;
      line-height: 1.4;
    }
    
    ::ng-deep .dpa-document .firma-date {
      margin-top: 24px;
      text-align: center;
      font-size: 11px;
      color: #555;
      font-family: Arial, Helvetica, sans-serif;
    }
  `]
})
export class ContractSignDialogComponent implements AfterViewInit, OnDestroy {
  @ViewChild('contractContent') contractContent!: ElementRef<HTMLDivElement>;
  @ViewChild('signaturePad') signaturePad!: SignaturePadComponent;
  @ViewChild('scrollContainer') scrollContainer!: ElementRef<HTMLDivElement>;
  @Output() signed = new EventEmitter<Contract>();

  private contractsService = inject(ContractsService);
  private countdownInterval: any = null;

  visible = signal(false);
  contract = signal<Contract | null>(null);
  companyId = signal<string | null>(null);
  isSigning = signal(false);
  processing = signal(false);
  signedImage = signal<string | null>(null);
  hasScrolledToBottom = signal(false);
  secondsRemaining = signal(0);
  
  // Admin signature for auto-sign (from GDPR dashboard)
  adminSignature = signal<string | null>(null);
  useAdminSignature = signal(false);

  hasSignature = false;
  consentChecked = false;

  currentSignatureData: string | null = null;
  NOW = new Date();
  ipAddress = '';

  constructor() {
    // Try to get IP (optional, backend usually reliable)
    // fetch('https://api.ipify.org?format:json').then(r => r.json()).then(d => this.ipAddress = d.ip).catch(() => {});
  }

  ngAfterViewInit() {
    // Component initialized
  }

  ngOnDestroy() {
    this.stopCountdown();
  }

  canSign(): boolean {
    return this.hasScrolledToBottom() && this.secondsRemaining() === 0;
  }

  onScroll(event: Event) {
    const container = event.target as HTMLElement;
    const scrollTop = container.scrollTop;
    const scrollHeight = container.scrollHeight;
    const clientHeight = container.clientHeight;
    
    // Check if user has scrolled to within 50px of the bottom
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    
    if (isAtBottom && !this.hasScrolledToBottom()) {
      this.hasScrolledToBottom.set(true);
      this.startCountdown();
    }
  }

  private startCountdown() {
    if (this.countdownInterval) return; // Already running
    
    this.secondsRemaining.set(20);
    
    this.countdownInterval = setInterval(() => {
      const current = this.secondsRemaining();
      if (current <= 1) {
        this.secondsRemaining.set(0);
        this.stopCountdown();
      } else {
        this.secondsRemaining.set(current - 1);
      }
    }, 1000);
  }

  private stopCountdown() {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
  }

  open(contract: Contract, companyId?: string, adminSignature?: string) {
    // Replace {{SIGNING_DATE}} placeholder with current date
    const signingDate = new Date().toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
    const modifiedContract = {
      ...contract,
      content_html: contract.content_html?.replace(/\{\{SIGNING_DATE\}\}/g, signingDate) || ''
    };
    
    this.contract.set(modifiedContract);
    this.companyId.set(companyId || contract.company_id || null);
    this.visible.set(true);
    this.isSigning.set(false);
    this.signedImage.set(null);
    this.consentChecked = false;
    this.hasSignature = false;
    this.currentSignatureData = null;
    this.NOW = new Date();
    this.hasScrolledToBottom.set(false);
    this.secondsRemaining.set(20);
    
    // Set admin signature if provided (from GDPR dashboard)
    if (adminSignature) {
      this.adminSignature.set(adminSignature);
      this.useAdminSignature.set(true); // Default to using saved signature
      this.hasSignature = true;
      this.currentSignatureData = adminSignature;
    } else {
      this.adminSignature.set(null);
      this.useAdminSignature.set(false);
    }
    
    this.startCountdown();
  }

  close() {
    // Allow closing even during processing - the processing state is for UI feedback only
    // and should not block the modal from closing after signing completes
    this.visible.set(false);
    this.stopCountdown();
  }

  startSigning() {
    if (!this.canSign()) return;
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
    // Uncheck admin signature if user draws their own
    if (data) {
      this.useAdminSignature.set(false);
    }
  }

  toggleUseAdminSignature() {
    this.useAdminSignature.set(!this.useAdminSignature());
    if (this.useAdminSignature()) {
      // Using admin signature - clear manual signature
      this.hasSignature = true;
      this.currentSignatureData = this.adminSignature();
      // Clear the signature pad visually
      if (this.signaturePad) {
        this.signaturePad.clear();
      }
    } else {
      // Switching to manual signature - reset state
      this.hasSignature = false;
      this.currentSignatureData = null;
    }
  }

  toggleConsent() {
    this.consentChecked = !this.consentChecked;
  }

  async confirmSign() {
    // Use admin signature if available and selected
    const adminSig = this.adminSignature();
    const useAdmin = this.useAdminSignature();
    
    if (adminSig && useAdmin && !this.hasSignature) {
      this.currentSignatureData = adminSig;
      this.hasSignature = true;
    }
    
    if (!this.consentChecked || !this.hasSignature || !this.contract()) return;

    this.processing.set(true);
    this.signedImage.set(this.currentSignatureData);

    try {
      // Wait for UI to update with signature image
      await new Promise(resolve => setTimeout(resolve, 500));

      // Wait for contractContent to be available in DOM
      let attempts = 0;
      while (!this.contractContent?.nativeElement && attempts < 10) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }

      // Ensure contractContent is available
      if (!this.contractContent?.nativeElement) {
        console.error('Contract content element not found');
        throw new Error('No se pudo acceder al contenido del contrato');
      }

      // Generate PDF con imports dinámicos
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
        company_id: this.companyId(),
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
