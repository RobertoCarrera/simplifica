import { Component, Input, OnInit, inject } from '@angular/core';
import { environment } from '../../../../../environments/environment';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GdprComplianceService, GdprConsentRecord, GdprAccessRequest } from '../../../../services/gdpr-compliance.service';
import { firstValueFrom } from 'rxjs';

/**
 * Panel GDPR para gestión de datos personales del cliente
 * Muestra estado de consentimientos y permite ejercer derechos GDPR
 */
@Component({
  selector: 'app-client-gdpr-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="gdpr-panel bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 p-6 space-y-8">
      
      <!-- Header -->
      <div *ngIf="showHeader" class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 dark:border-gray-700 pb-6">
        <div class="flex items-center gap-4">
          <div class="p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
            <svg class="w-8 h-8 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div>
            <h3 class="text-xl font-bold text-gray-900 dark:text-white">Protección de Datos (GDPR)</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400">Administra tus preferencias de privacidad y datos personales.</p>
          </div>
        </div>
        <span class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
          <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
          Cumplimiento GDPR
        </span>
      </div>

      <!-- Loading State -->
      <div *ngIf="loading" class="flex items-center justify-center py-12">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>

      <!-- Error State -->
      <div *ngIf="error" class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 flex items-start gap-3">
        <svg class="w-5 h-5 text-red-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
        <p class="text-sm text-red-800 dark:text-red-300">{{ error }}</p>
      </div>

      <!-- Content -->
      <div *ngIf="!loading && !error" class="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        <!-- Left Column: Consents -->
        <div class="space-y-6">
          <div class="bg-gray-50 dark:bg-slate-700/30 rounded-xl p-6 border border-gray-200 dark:border-gray-600 h-full">
            <h4 class="text-base font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Consentimientos
            </h4>
            
            <div class="space-y-4">
              <!-- Marketing Consent -->
              <div class="relative flex items-start p-4 rounded-lg bg-white dark:bg-slate-800 border border-gray-100 dark:border-gray-700 shadow-sm transition-shadow hover:shadow-md">
                <div class="flex items-center h-5">
                  <input 
                    type="checkbox" 
                    [(ngModel)]="marketingConsent"
                    (change)="updateMarketingConsent()"
                    [disabled]="updatingConsent || readOnly"
                    class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 focus:ring-offset-2 dark:bg-slate-700 dark:border-gray-600">
                </div>
                <div class="ml-3 text-sm">
                  <label class="font-medium text-gray-700 dark:text-gray-200 cursor-pointer">Marketing y comunicaciones</label>
                  <p class="text-gray-500 dark:text-gray-400 text-xs mt-1">Autorizo el envío de novedades y ofertas comerciales.</p>
                </div>
                <span *ngIf="updatingConsent" class="absolute top-2 right-2 text-xs text-blue-500 animate-pulse">Guardando...</span>
              </div>

              <!-- Data Processing Consent -->
              <div class="relative flex items-start p-4 rounded-lg bg-white dark:bg-slate-800 border border-gray-100 dark:border-gray-700 shadow-sm transition-shadow hover:shadow-md">
                <div class="flex items-center h-5">
                  <input 
                    type="checkbox" 
                    [(ngModel)]="dataProcessingConsent"
                    (change)="updateDataProcessingConsent()"
                    [disabled]="updatingConsent || readOnly"
                    class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 focus:ring-offset-2 dark:bg-slate-700 dark:border-gray-600">
                </div>
                <div class="ml-3 text-sm">
                  <label class="font-medium text-gray-700 dark:text-gray-200 cursor-pointer">Procesamiento de datos</label>
                  <p class="text-gray-500 dark:text-gray-400 text-xs mt-1">Autorizo el tratamiento de mis datos para la prestación del servicio.</p>
                </div>
              </div>

              <!-- Last Update -->
              <div class="flex items-center gap-2 text-xs text-gray-400 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                Última actualización: {{ lastConsentUpdate || 'No disponible' }}
              </div>
            </div>
          </div>
        </div>

        <!-- Right Column: Info & Actions -->
        <div class="space-y-6">
          
          <!-- Información de Retención -->
          <div class="bg-blue-50 dark:bg-blue-900/10 rounded-xl p-6 border border-blue-100 dark:border-blue-800">
            <h4 class="text-base font-semibold text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-2">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Retención de Datos
            </h4>
            <p class="text-sm text-blue-800 dark:text-blue-200 leading-relaxed">
              En cumplimiento con la normativa fiscal vigente, sus datos personales y transaccionales se conservarán durante un periodo de <strong>{{ retentionPeriodYears }} años</strong> desde la última actividad comercial registrada.
            </p>
          </div>

          <!-- Acciones GDPR (Filtered based on isClientView) -->
          <div class="bg-gray-50 dark:bg-slate-700/30 rounded-xl p-6 border border-gray-200 dark:border-gray-600">
            <h4 class="text-sm font-semibold text-gray-900 dark:text-white mb-4">Derechos sobre sus Datos</h4>
            
            <div class="space-y-3">
              <!-- Exportar Datos (Available to ALL) -->
              <button 
                (click)="exportData()"
                [disabled]="exporting"
                class="w-full flex items-center justify-between p-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-200 hover:border-blue-500 dark:hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition-all group">
                <div class="flex items-center gap-3">
                  <div class="p-2 bg-gray-100 dark:bg-slate-700 rounded text-gray-500 group-hover:text-blue-600">
                    <svg *ngIf="!exporting" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    <svg *ngIf="exporting" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  </div>
                  <span class="font-medium">Exportar mis datos</span>
                </div>
                <svg class="w-4 h-4 text-gray-400 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
              </button>

              <!-- Admin Rights Actions (HIDDEN for Clients) -->
              <ng-container *ngIf="!isClientView">
                
                <!-- Rectificar -->
                <button 
                  (click)="createRequest('rectification')"
                  class="w-full flex items-center justify-between p-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-200 hover:border-amber-500 hover:text-amber-600 transition-all group">
                  <div class="flex items-center gap-3">
                    <div class="p-2 bg-amber-50 dark:bg-amber-900/20 rounded text-amber-600">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                    </div>
                    <span class="font-medium">Solicitar Rectificación</span>
                  </div>
                  <svg class="w-4 h-4 text-gray-400 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                </button>

                <!-- Olvido / Borrar -->
                <button 
                  (click)="requestDeletion()"
                  class="w-full flex items-center justify-between p-3 bg-white dark:bg-slate-800 border border-red-100 rounded-lg text-sm text-red-600 hover:bg-red-50 hover:border-red-200 transition-all group">
                  <div class="flex items-center gap-3">
                    <div class="p-2 bg-red-50 rounded text-red-500">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </div>
                    <span class="font-medium">Derecho al Olvido (Eliminar)</span>
                  </div>
                  <svg class="w-4 h-4 text-red-400 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                </button>

                <!-- Limitar (Restored) -->
                <button 
                  (click)="createRequest('restriction')"
                  class="w-full flex items-center justify-between p-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-200 hover:border-purple-500 hover:text-purple-600 transition-all group">
                  <div class="flex items-center gap-3">
                    <div class="p-2 bg-purple-50 dark:bg-purple-900/20 rounded text-purple-600">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"></path></svg>
                    </div>
                    <span class="font-medium">Limitar Tratamiento</span>
                  </div>
                  <svg class="w-4 h-4 text-gray-400 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                </button>
              </ng-container>

            </div>
            
            <p *ngIf="isClientView" class="text-xs text-gray-500 mt-4 text-center">
              Para ejercer otros derechos (rectificación, supresión, limitación), por favor contacte con nuestro delegado.
            </p>
          </div>

          <!-- DPO Contact (Always visible) -->
          <div class="text-center">
            <p class="text-xs text-gray-500 mb-1">Contacto Delegado de Protección de Datos:</p>
            <a [href]="'mailto:' + dpoEmail" class="text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline">
              {{ dpoEmail }}
            </a>
          </div>

        </div>
      </div>

      <!-- Success Toast/Message (Overlay) -->
      <div *ngIf="successMessage" class="fixed bottom-4 right-4 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-3 animate-slide-up z-50">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
        <span>{{ successMessage }}</span>
      </div>

    </div>
  `,
  styles: [`
    .gdpr-panel {
      width: 100%;
    }
    input[type="checkbox"] {
        cursor: pointer;
    }
    @keyframes slide-up {
        from { transform: translateY(100%); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
    }
    .animate-slide-up {
        animation: slide-up 0.3s ease-out forwards;
    }
  `]
})
export class ClientGdprPanelComponent implements OnInit {
  @Input() clientId!: string;
  @Input() clientEmail!: string;
  @Input() clientName!: string;
  @Input() readOnly: boolean = false;
  @Input() isClientView: boolean = false;
  @Input() showHeader: boolean = true;

  // Estado de consentimientos
  marketingConsent: boolean = false;
  dataProcessingConsent: boolean = false;
  lastConsentUpdate: string = '';
  retentionPeriodYears: number = 7; // Default by strict fiscal laws


  // Estado
  loading: boolean = true;
  updatingConsent: boolean = false;
  exporting: boolean = false;
  creatingRequest: boolean = false;
  requestingDeletion: boolean = false;

  // Mensajes
  error: string = '';
  successMessage: string = '';

  // Configuración
  dpoEmail = environment.gdpr.dpoEmail;

  private gdprService = inject(GdprComplianceService);

  async ngOnInit() {
    if (!this.clientEmail) {
      this.error = 'Email de cliente no proporcionado';
      this.loading = false;
      return;
    }

    // Try to get dynamic DPO email if available in storage or assume default
    // Ideally this comes from a CompanyConfig service, for now hardcoded fallback is safer

    await this.loadConsentStatus();
  }

  /**
   * Carga el estado de consentimientos del cliente buscando el último registro de cada tipo
   */
  async loadConsentStatus() {
    this.loading = true;
    this.error = '';

    this.gdprService.getConsentRecords(this.clientEmail).subscribe({
      next: (records) => {
        // Records are already sorted by created_at desc
        const marketing = records.find(r => r.consent_type === 'marketing');
        const processing = records.find(r => r.consent_type === 'data_processing');

        if (marketing) {
          this.marketingConsent = marketing.consent_given;
          this.lastConsentUpdate = this.formatDate(marketing.created_at || '');
        }
        if (processing) {
          this.dataProcessingConsent = processing.consent_given;
          // Update date if newer
          if (processing.created_at && (!marketing?.created_at || processing.created_at > marketing.created_at)) {
            this.lastConsentUpdate = this.formatDate(processing.created_at);
          }
        }

        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading consents:', err);
        this.error = 'Error cargando historial de consentimientos';
        this.loading = false;
      }
    });
  }

  updateMarketingConsent() {
    this.recordConsent('marketing', this.marketingConsent);
  }

  updateDataProcessingConsent() {
    this.recordConsent('data_processing', this.dataProcessingConsent);
  }

  private recordConsent(type: 'marketing' | 'data_processing', given: boolean) {
    this.updatingConsent = true;
    this.successMessage = '';

    const record: GdprConsentRecord = {
      subject_email: this.clientEmail,
      subject_id: this.clientId, // Optional but good for linking
      consent_type: type,
      consent_given: given,
      consent_method: 'form', // Since it's from the panel
      purpose: type === 'marketing' ? 'Comunicaciones comerciales' : 'Gestión de servicios',
      data_processing_purposes: type === 'data_processing' ? ['service_delivery', 'legal_compliance'] : ['marketing']
    };

    this.gdprService.recordConsent(record).subscribe({
      next: () => {
        this.successMessage = 'Consentimiento actualizado correctamente';
        setTimeout(() => this.successMessage = '', 3000);
        this.updatingConsent = false;
        this.loadConsentStatus(); // Refresh to confirm timestamp
      },
      error: (err) => {
        this.error = 'Error al guardar consentimiento: ' + err.message;
        // Revert UI
        if (type === 'marketing') this.marketingConsent = !given;
        else this.dataProcessingConsent = !given;
        this.updatingConsent = false;
      }
    });
  }

  exportData() {
    this.exporting = true;
    this.error = '';

    // Uses the new download method (using email)
    this.gdprService.downloadClientData(this.clientEmail, this.clientName).subscribe({
      next: (success) => {
        if (success) {
          this.successMessage = 'Datos exportados correctamente.';
          setTimeout(() => this.successMessage = '', 3000);
        } else {
          this.error = 'No se pudieron descargar los datos.';
        }
        this.exporting = false;
      },
      error: (err) => {
        this.error = 'Error exportando datos: ' + err.message;
        this.exporting = false;
      }
    });
  }

  requestDeletion() {
    const confirmed = confirm(
      `¿Está seguro de solicitar la eliminación de los datos de ${this.clientName}?\n\n` +
      'Esta acción anonimizará todos los datos personales.\n' +
      'Para confirmar, por favor escriba "BORRAR" (Mayúsculas).'
    );

    if (!confirmed) return;

    const doubleCheck = prompt('Escriba "BORRAR" para confirmar la eliminación irreversible:');
    if (doubleCheck !== 'BORRAR') {
      alert('Confirmación incorrecta. Operación cancelada.');
      return;
    }

    const reason = prompt('Indique el motivo de la eliminación:');
    if (!reason) return;

    this.requestingDeletion = true;

    this.gdprService.anonymizeClientData(this.clientId, reason).subscribe({
      next: () => {
        this.successMessage = 'Cliente anonimizado correctamente.';
        setTimeout(() => window.location.reload(), 2000);
      },
      error: (err) => {
        this.error = 'Error al anonimizar: ' + err.message;
        this.requestingDeletion = false;
      }
    });
  }

  createRequest(type: 'rectification' | 'restriction' | 'portability' | 'access' | 'erasure' | 'objection') {
    const details = prompt(`Detalles de la solicitud de ${type}:`);
    if (!details) return;

    this.creatingRequest = true;

    const request: GdprAccessRequest = {
      request_type: type,
      subject_email: this.clientEmail,
      subject_name: this.clientName,
      subject_identifier: this.clientId,
      request_details: { description: details }
    };

    this.gdprService.createAccessRequest(request).subscribe({
      next: () => {
        this.successMessage = 'Solicitud creada correctamente.';
        setTimeout(() => this.successMessage = '', 3000);
        this.creatingRequest = false;
      },
      error: (err) => {
        this.error = 'Error creando solicitud: ' + err.message;
        this.creatingRequest = false;
      }
    });
  }

  private formatDate(dateString: string): string {
    if (!dateString) return 'No disponible';
    try {
      return new Date(dateString).toLocaleDateString('es-ES', {
        year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });
    } catch { return dateString; }
  }
}
