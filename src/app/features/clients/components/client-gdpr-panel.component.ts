import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GDPRService, GDPRRequestType } from '../../../core/services/gdpr.service';

/**
 * Panel GDPR para gestión de datos personales del cliente
 * Muestra estado de consentimientos y permite ejercer derechos GDPR
 */
@Component({
  selector: 'app-client-gdpr-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="gdpr-panel bg-white rounded-lg shadow-md p-6 space-y-6">
      
      <!-- Header -->
      <div class="flex items-center justify-between border-b pb-4">
        <div class="flex items-center gap-3">
          <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <h3 class="text-lg font-semibold text-gray-900">Protección de Datos (GDPR)</h3>
        </div>
        <span class="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
          ✓ Cumplimiento GDPR
        </span>
      </div>

      <!-- Loading State -->
      <div *ngIf="loading" class="flex items-center justify-center py-8">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>

      <!-- Error State -->
      <div *ngIf="error" class="bg-red-50 border border-red-200 rounded-lg p-4">
        <p class="text-sm text-red-800">{{ error }}</p>
      </div>

      <!-- Content -->
      <div *ngIf="!loading && !error" class="space-y-6">
        
        <!-- Consentimientos -->
        <div class="bg-gray-50 rounded-lg p-4">
          <h4 class="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Consentimientos
          </h4>
          
          <div class="space-y-3">
            <!-- Marketing Consent -->
            <div class="flex items-center justify-between">
              <label class="flex items-center gap-2 cursor-pointer">
                <input 
                  type="checkbox" 
                  [(ngModel)]="marketingConsent"
                  (change)="updateMarketingConsent()"
                  [disabled]="updatingConsent"
                  class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500">
                <span class="text-sm text-gray-700">Marketing y comunicaciones comerciales</span>
              </label>
              <span *ngIf="updatingConsent" class="text-xs text-gray-500">Actualizando...</span>
            </div>

            <!-- Data Processing Consent -->
            <div class="flex items-center justify-between">
              <label class="flex items-center gap-2 cursor-pointer">
                <input 
                  type="checkbox" 
                  [(ngModel)]="dataProcessingConsent"
                  (change)="updateDataProcessingConsent()"
                  [disabled]="updatingConsent"
                  class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500">
                <span class="text-sm text-gray-700">Procesamiento de datos personales</span>
              </label>
            </div>

            <!-- Last Update -->
            <div class="text-xs text-gray-500 pt-2 border-t">
              Última actualización: {{ lastConsentUpdate || 'No disponible' }}
            </div>
          </div>
        </div>

        <!-- Información de Retención -->
        <div class="bg-blue-50 rounded-lg p-4">
          <h4 class="text-sm font-semibold text-blue-900 mb-2 flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Retención de Datos
          </h4>
          <p class="text-sm text-blue-800">
            Los datos se conservarán hasta: <strong>{{ dataRetentionUntil || 'No especificado' }}</strong>
          </p>
          <p class="text-xs text-blue-700 mt-1">
            Normativa española: 7 años desde última actividad comercial
          </p>
        </div>

        <!-- Estadísticas de Acceso -->
        <div class="grid grid-cols-2 gap-4">
          <div class="bg-gray-50 rounded-lg p-4">
            <div class="text-xs text-gray-600 mb-1">Accesos registrados</div>
            <div class="text-2xl font-bold text-gray-900">{{ accessCount || 0 }}</div>
          </div>
          <div class="bg-gray-50 rounded-lg p-4">
            <div class="text-xs text-gray-600 mb-1">Último acceso</div>
            <div class="text-sm font-semibold text-gray-900">
              {{ lastAccessed || 'Nunca' }}
            </div>
          </div>
        </div>

        <!-- Acciones GDPR -->
        <div class="space-y-3">
          <h4 class="text-sm font-semibold text-gray-700">Derechos del Interesado</h4>
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            
            <!-- Exportar Datos -->
            <button 
              (click)="exportData()"
              [disabled]="exporting"
              class="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors">
              <svg *ngIf="!exporting" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span class="text-sm">{{ exporting ? 'Exportando...' : 'Exportar Datos (Art. 15/20)' }}</span>
            </button>

            <!-- Solicitar Rectificación -->
            <button 
              (click)="createRequest('rectification')"
              [disabled]="creatingRequest"
              class="flex items-center justify-center gap-2 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:bg-gray-400 transition-colors">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              <span class="text-sm">Rectificar (Art. 16)</span>
            </button>

            <!-- Solicitar Supresión -->
            <button 
              (click)="requestDeletion()"
              [disabled]="requestingDeletion"
              class="flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-400 transition-colors">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              <span class="text-sm">{{ requestingDeletion ? 'Procesando...' : 'Derecho al Olvido (Art. 17)' }}</span>
            </button>

            <!-- Limitar Procesamiento -->
            <button 
              (click)="createRequest('restriction')"
              [disabled]="creatingRequest"
              class="flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400 transition-colors">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
              <span class="text-sm">Limitar (Art. 18)</span>
            </button>
          
          </div>
        </div>

        <!-- DPO Contact -->
        <div class="bg-gray-50 rounded-lg p-4 border-l-4 border-blue-600">
          <h4 class="text-sm font-semibold text-gray-700 mb-2">Contacto DPO</h4>
          <p class="text-xs text-gray-600">
            Para ejercer sus derechos GDPR, contacte con nuestro Delegado de Protección de Datos:
          </p>
          <a [href]="'mailto:' + dpoEmail" class="text-sm text-blue-600 hover:text-blue-800 font-medium">
            {{ dpoEmail }}
          </a>
        </div>

      </div>

      <!-- Success Message -->
      <div *ngIf="successMessage" class="bg-green-50 border border-green-200 rounded-lg p-4 mt-4">
        <p class="text-sm text-green-800">✓ {{ successMessage }}</p>
      </div>

    </div>
  `,
  styles: [`
    .gdpr-panel {
      max-width: 100%;
    }

    input[type="checkbox"]:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }

    button:disabled {
      cursor: not-allowed;
    }

    @media (max-width: 768px) {
      .grid-cols-2 {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class ClientGdprPanelComponent implements OnInit {
  @Input() clientId!: string;
  @Input() clientEmail!: string;
  @Input() clientName!: string;

  // Estado de consentimientos
  marketingConsent: boolean = false;
  dataProcessingConsent: boolean = false;
  lastConsentUpdate: string = '';
  dataRetentionUntil: string = '';
  
  // Estadísticas de acceso
  accessCount: number = 0;
  lastAccessed: string = '';
  
  // Estados de carga
  loading: boolean = true;
  updatingConsent: boolean = false;
  exporting: boolean = false;
  creatingRequest: boolean = false;
  requestingDeletion: boolean = false;
  
  // Mensajes
  error: string = '';
  successMessage: string = '';
  
  // Configuración
  dpoEmail: string = '';

  constructor(private gdprService: GDPRService) {
    const config = this.gdprService.getGDPRConfig();
    this.dpoEmail = config.dpoEmail;
  }

  ngOnInit(): void {
    if (!this.clientId) {
      this.error = 'ID de cliente no proporcionado';
      this.loading = false;
      return;
    }

    this.loadConsentStatus();
    this.markClientAccessed();
  }

  /**
   * Carga el estado de consentimientos del cliente
   */
  loadConsentStatus(): void {
    this.loading = true;
    this.error = '';

    this.gdprService.getConsentStatus(this.clientId).subscribe({
      next: (response: any) => {
        console.log('✅ GDPR Response:', response);
        
        if (response.success) {
          // La función RPC devuelve consents directamente, no dentro de data
          const consents = response.consents;
          if (consents) {
            this.marketingConsent = consents.marketing_consent || false;
            this.dataProcessingConsent = consents.data_processing_consent || false;
            this.dataRetentionUntil = this.formatDate(response.data_retention_until);
            this.lastConsentUpdate = this.formatDate(consents.marketing_consent_date || consents.data_processing_consent_date);
          }
        } else {
          this.error = response.error || 'Error cargando consentimientos';
        }
        this.loading = false;
      },
      error: (err) => {
        console.error('❌ Error loading consent:', err);
        this.error = 'Error de conexión al cargar consentimientos';
        this.loading = false;
      }
    });
  }

  /**
   * Marca el cliente como accedido (registra en audit log)
   */
  markClientAccessed(): void {
    this.gdprService.markClientAccessed(this.clientId).subscribe();
  }

  /**
   * Actualiza el consentimiento de marketing
   */
  updateMarketingConsent(): void {
    this.updatingConsent = true;
    this.successMessage = '';
    
    this.gdprService.updateConsent(
      this.clientId,
      'marketing',
      this.marketingConsent,
      'explicit',
      'Actualización de consentimiento de marketing'
    ).subscribe({
      next: (response) => {
        if (response.success) {
          this.successMessage = 'Consentimiento de marketing actualizado correctamente';
          setTimeout(() => this.successMessage = '', 3000);
        } else {
          this.error = response.error || 'Error actualizando consentimiento';
          // Revertir el cambio
          this.marketingConsent = !this.marketingConsent;
        }
        this.updatingConsent = false;
      },
      error: () => {
        this.error = 'Error de conexión';
        this.marketingConsent = !this.marketingConsent;
        this.updatingConsent = false;
      }
    });
  }

  /**
   * Actualiza el consentimiento de procesamiento de datos
   */
  updateDataProcessingConsent(): void {
    this.updatingConsent = true;
    this.successMessage = '';
    
    this.gdprService.updateConsent(
      this.clientId,
      'data_processing',
      this.dataProcessingConsent,
      'explicit',
      'Actualización de consentimiento de procesamiento de datos'
    ).subscribe({
      next: (response) => {
        if (response.success) {
          this.successMessage = 'Consentimiento de procesamiento actualizado correctamente';
          setTimeout(() => this.successMessage = '', 3000);
        } else {
          this.error = response.error || 'Error actualizando consentimiento';
          this.dataProcessingConsent = !this.dataProcessingConsent;
        }
        this.updatingConsent = false;
      },
      error: () => {
        this.error = 'Error de conexión';
        this.dataProcessingConsent = !this.dataProcessingConsent;
        this.updatingConsent = false;
      }
    });
  }

  /**
   * Exporta todos los datos del cliente (Art. 15 y 20)
   */
  exportData(): void {
    this.exporting = true;
    this.error = '';
    
    this.gdprService.downloadClientData(this.clientId, this.clientName).subscribe({
      next: (success) => {
        if (success) {
          this.successMessage = 'Datos exportados correctamente. Descargando archivo...';
          setTimeout(() => this.successMessage = '', 3000);
        } else {
          this.error = 'Error al exportar los datos';
        }
        this.exporting = false;
      },
      error: () => {
        this.error = 'Error de conexión al exportar datos';
        this.exporting = false;
      }
    });
  }

  /**
   * Solicita la eliminación/anonimización del cliente (Art. 17)
   */
  requestDeletion(): void {
    const confirmed = confirm(
      `¿Está seguro de solicitar la eliminación de los datos de ${this.clientName}?\n\n` +
      'Esta acción anonimizará todos los datos personales del cliente de forma permanente.\n' +
      'Los datos contables se conservarán anonimizados durante 7 años por ley.'
    );

    if (!confirmed) return;

    const reason = prompt('Por favor, indique el motivo de la eliminación:');
    if (!reason) return;

    this.requestingDeletion = true;
    this.error = '';

    this.gdprService.anonymizeClient(this.clientId, reason).subscribe({
      next: (response) => {
        if (response.success) {
          this.successMessage = 'Cliente anonimizado correctamente';
          setTimeout(() => {
            window.location.reload(); // Recargar para mostrar datos anonimizados
          }, 2000);
        } else {
          this.error = response.error || 'Error al anonimizar cliente';
        }
        this.requestingDeletion = false;
      },
      error: () => {
        this.error = 'Error de conexión al solicitar eliminación';
        this.requestingDeletion = false;
      }
    });
  }

  /**
   * Crea una solicitud GDPR genérica
   */
  createRequest(requestType: GDPRRequestType): void {
    const details = prompt(`Detalles de la solicitud de ${requestType}:`);
    if (!details) return;

    this.creatingRequest = true;
    this.error = '';

    this.gdprService.createAccessRequest(this.clientEmail, requestType, details).subscribe({
      next: (response) => {
        if (response.success) {
          this.successMessage = `Solicitud creada correctamente. ID: ${response.request_id}. Plazo: ${this.formatDate(response.deadline_date || '')}`;
          setTimeout(() => this.successMessage = '', 5000);
        } else {
          this.error = response.error || 'Error creando solicitud';
        }
        this.creatingRequest = false;
      },
      error: () => {
        this.error = 'Error de conexión al crear solicitud';
        this.creatingRequest = false;
      }
    });
  }

  /**
   * Formatea una fecha para mostrar
   */
  private formatDate(dateString: string): string {
    if (!dateString) return 'No disponible';
    
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateString;
    }
  }
}
