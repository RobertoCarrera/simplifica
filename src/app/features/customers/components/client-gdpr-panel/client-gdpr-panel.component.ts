import { Component, Input, Output, EventEmitter, OnInit, inject, ViewChild } from '@angular/core';
import { environment } from '../../../../../environments/environment';
import { GdprRequestModalComponent } from '../gdpr-request-modal/gdpr-request-modal.component';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SkeletonComponent } from '../../../../shared/ui/skeleton/skeleton.component';

import { GdprComplianceService, GdprConsentRecord, GdprAccessRequest } from '../../../../services/gdpr-compliance.service';
import { ToastService } from '../../../../services/toast.service';
import { SupabaseCustomersService } from '../../../../services/supabase-customers.service';
import { AuthService } from '../../../../services/auth.service';
import { firstValueFrom, filter, switchMap, take } from 'rxjs';

/**
 * Panel GDPR para gestión de datos personales del cliente
 * Muestra estado de consentimientos y permite ejercer derechos GDPR
 */
@Component({
  selector: 'app-client-gdpr-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, GdprRequestModalComponent, SkeletonComponent],
  template: `
    <div class="gdpr-panel w-full space-y-8">

    <div class="gdpr-panel w-full space-y-8">

      <!-- Loading State (Skeleton) -->
      <div *ngIf="loading" class="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <!-- Left Column Skeleton -->
        <div class="space-y-6">
            <app-skeleton type="card" height="300px"></app-skeleton>
        </div>
        <!-- Right Column Skeleton -->
        <div class="space-y-6">
            <app-skeleton type="card" height="150px"></app-skeleton>
            <app-skeleton type="card" height="200px"></app-skeleton>
        </div>
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
          <div class="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 h-full">
            <h4 class="text-base font-semibold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
              <div class="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              Consentimientos (RGPD)
            </h4>
            
            <div class="space-y-4">
              
              <!-- 1. Health Data (Sensitive - Art. 9) -->
              <div class="relative flex items-start p-4 rounded-lg bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-800">
                <div class="flex items-center h-5">
                  <input 
                    type="checkbox" 
                    [(ngModel)]="healthDataConsent"
                    (change)="updateHealthDataConsent()"
                    [disabled]="updatingConsent || readOnly"
                    class="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500 focus:ring-offset-2 dark:bg-gray-700 dark:border-gray-600">
                </div>
                <div class="ml-3 text-sm">
                  <label class="font-bold text-gray-800 dark:text-gray-100 cursor-pointer">
                    Datos de Salud (Asistencial)
                    <span class="ml-2 text-[10px] uppercase font-bold px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded border border-emerald-200">Requerido</span>
                  </label>
                  <p class="text-gray-600 dark:text-gray-300 text-xs mt-1">Autorizo el tratamiento de mis datos de salud para la prestación de servicios asistenciales (Historia Clínica).</p>
                </div>
              </div>

              <!-- 2. Privacy Policy -->
              <div class="relative flex items-start p-4 rounded-lg bg-gray-50 dark:bg-gray-700/30 border border-gray-100 dark:border-gray-700">
                <div class="flex items-center h-5">
                  <input 
                    type="checkbox" 
                    [(ngModel)]="privacyPolicyConsent"
                    (change)="updatePrivacyPolicyConsent()"
                    [disabled]="updatingConsent || readOnly"
                    class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 focus:ring-offset-2 dark:bg-gray-700 dark:border-gray-600">
                </div>
                <div class="ml-3 text-sm">
                  <label class="font-medium text-gray-700 dark:text-gray-200 cursor-pointer flex items-center gap-2">
                    Política de Privacidad
                    <span *ngIf="privacyPolicyConsent" class="hidden sm:inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 border border-blue-200 uppercase">
                      Contrato Firmado
                    </span>
                  </label>
                  <p class="text-gray-500 dark:text-gray-400 text-xs mt-1">Acepto la política de privacidad y condiciones del servicio.</p>
                </div>
              </div>

              <!-- 3. Marketing Consent -->
              <div class="relative flex items-start p-4 rounded-lg bg-gray-50 dark:bg-gray-700/30 border border-gray-100 dark:border-gray-700">
                <div class="flex items-center h-5">
                  <input 
                    type="checkbox" 
                    [(ngModel)]="marketingConsent"
                    (change)="updateMarketingConsent()"
                    [disabled]="updatingConsent || readOnly"
                    class="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500 focus:ring-offset-2 dark:bg-gray-700 dark:border-gray-600">
                </div>
                <div class="ml-3 text-sm">
                  <label class="font-medium text-gray-700 dark:text-gray-200 cursor-pointer">Marketing y Novedades</label>
                  <p class="text-gray-500 dark:text-gray-400 text-xs mt-1">Autorizo el envío de ofertas comerciales, recordatorios y newsletters.</p>
                </div>
                <span *ngIf="updatingConsent" class="absolute top-2 right-2 text-xs text-blue-500 animate-pulse">Guardando...</span>
              </div>

              <!-- Last Update -->
              <div class="flex items-center gap-2 text-xs text-gray-400 mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
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
          <div class="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
            <h4 class="text-base font-semibold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
              <div class="p-2 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
              </div>
              Derechos sobre sus Datos
            </h4>
            
            <div class="space-y-3">
              <!-- Exportar Datos (Available to ALL) -->
              <button 
                (click)="exportData()"
                [disabled]="exporting"
                class="w-full flex items-center justify-between p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-200 hover:border-blue-500 dark:hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition-all group">
                <div class="flex items-center gap-3">
                  <div class="p-2 bg-gray-50 dark:bg-gray-700 rounded text-gray-500 group-hover:text-blue-600">
                    <svg *ngIf="!exporting" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    <svg *ngIf="exporting" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  </div>
                  <span class="font-medium">Exportar mis datos</span>
                </div>
                <svg class="w-4 h-4 text-gray-400 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
              </button>

              <!-- Consent Invitation Management -->
              <div class="pt-4 mt-4 border-t border-gray-100 dark:border-gray-700">
                <h5 class="text-sm font-semibold text-gray-900 dark:text-white mb-3">Gestión de Invitación</h5>
                
                <div class="flex flex-col gap-3">
                  <!-- Status Indicator -->
                  <div class="flex items-center justify-between text-sm">
                    <span class="text-gray-600 dark:text-gray-400">Estado:</span>
                    <span [ngClass]="{
                      'bg-gray-100 text-gray-600': invitationStatus === 'not_sent',
                      'bg-blue-100 text-blue-700': invitationStatus === 'sent',
                      'bg-yellow-100 text-yellow-700': invitationStatus === 'opened',
                      'bg-green-100 text-green-700': invitationStatus === 'completed'
                    }" class="px-2 py-0.5 rounded-full text-xs font-medium uppercase">
                      {{ getInvitationStatusLabel(invitationStatus) }}
                    </span>
                  </div>
                  
                  <div *ngIf="invitationSentAt" class="text-xs text-gray-500">
                    Enviado: {{ formatDate(invitationSentAt) }}
                  </div>

                  <!-- Send/Resend Button -->
                  <button 
                    (click)="sendInvite()"
                    [disabled]="sendingInvite"
                    class="w-full flex items-center justify-center gap-2 p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                    <svg *ngIf="!sendingInvite" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                    <svg *ngIf="sendingInvite" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    
                    <span *ngIf="invitationStatus === 'not_sent'">Enviar Invitación</span>
                    <span *ngIf="invitationStatus !== 'not_sent'">Reenviar Invitación</span>
                  </button>
                </div>
              </div>

              <!-- Admin Rights Actions (Available to ALL now) -->
                
                <!-- Rectificar -->
                <button 
                  (click)="openRequestModal('rectification')"
                  class="w-full flex items-center justify-between p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-200 hover:border-amber-500 hover:text-amber-600 transition-all group">
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
                  (click)="openAnonymizeModal()"
                  class="w-full flex items-center justify-between p-3 bg-white dark:bg-gray-800 border border-red-100 rounded-lg text-sm text-red-600 hover:bg-red-50 hover:border-red-200 transition-all group">
                  <div class="flex items-center gap-3">
                    <div class="p-2 bg-red-50 rounded text-red-500">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    </div>
                    <span class="font-medium">Derecho al Olvido (Eliminar)</span>
                  </div>
                  <svg class="w-4 h-4 text-red-400 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                </button>

                <!-- Limitar -->
                <button 
                  (click)="openRequestModal('restriction')"
                  class="w-full flex items-center justify-between p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-200 hover:border-purple-500 hover:text-purple-600 transition-all group">
                  <div class="flex items-center gap-3">
                    <div class="p-2 bg-purple-50 dark:bg-purple-900/20 rounded text-purple-600">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"></path></svg>
                    </div>
                    <span class="font-medium">Limitar Tratamiento</span>
                  </div>
                  <svg class="w-4 h-4 text-gray-400 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                </button>

            </div>
            
            <p *ngIf="isClientView" class="text-xs text-gray-500 mt-4 text-center">
              Para ejercer otros derechos, puede iniciar una solicitud arriba o contactar al DPO.
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

    <!-- Custom GDPR Request Modal Component -->
    <app-gdpr-request-modal
      #requestModal
      [clientId]="clientId"
      [clientEmail]="clientEmail"
      [clientName]="clientName"
      [clientPhone]="clientPhone"
      [clientDni]="clientDni"
      [clientAddress]="clientAddress"
      (requestCreated)="onRequestCreated()">
    </app-gdpr-request-modal>
      
    <!-- Anonymize Confirmation Modal -->
    <div *ngIf="showAnonymizeModal" class="fixed inset-0 bg-gray-600 bg-opacity-75 overflow-y-auto h-full w-full z-[10000] flex items-center justify-center modal-backdrop" (click)="closeAnonymizeModal()">
      <div class="relative p-5 border w-11/12 md:w-1/3 rounded-lg bg-white dark:bg-slate-800 dark:border-slate-600 modal-content-box" (click)="$event.stopPropagation()">
        <div class="mt-3 text-center">
          <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/30 mb-4">
            <svg class="w-6 h-6 text-red-600 dark:text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
          </div>
          <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-2">¿Estás absolutamente seguro?</h3>
          
          <div class="mt-2 px-4 py-2 bg-red-50 dark:bg-red-900/10 rounded text-left border border-red-100 dark:border-red-800">
            <p class="text-sm text-red-800 dark:text-red-300">
              Estás a punto de anonimizar los datos de <span class="font-bold">{{ clientName }}</span>.
            </p>
            <ul class="list-disc list-inside text-xs text-red-700 dark:text-red-400 mt-2 space-y-1">
              <li>Esta acción es <strong>IRREVERSIBLE</strong>.</li>
              <li>Se eliminarán nombre, email, teléfono y dirección.</li>
              <li>Se conservarán los registros fiscales (facturas) pero anonimizados.</li>
              <li>El usuario perderá acceso al portal de cliente.</li>
            </ul>
          </div>
          
          <div class="mt-6">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 text-left">
              Para confirmar, escribe <strong>BORRAR</strong> abajo:
            </label>
            <input
              type="text"
              [(ngModel)]="anonymizeConfirmationInput"
              placeholder="BORRAR"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-red-500 focus:border-red-500 uppercase font-mono tracking-wider text-center bg-white dark:bg-slate-700 dark:text-white"
              (keyup.enter)="processAnonymization()">
            
            <p *ngIf="anonymizeError" class="mt-2 text-sm text-red-600 dark:text-red-400">{{ anonymizeError }}</p>
          </div>
          
          <div class="mt-6 flex justify-end gap-3">
            <button
              (click)="closeAnonymizeModal()"
              class="px-4 py-2 bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors font-medium">
              Cancelar
            </button>
            
            <button
              (click)="processAnonymization()"
              [disabled]="anonymizeConfirmationInput !== 'BORRAR'"
              [class.opacity-50]="anonymizeConfirmationInput !== 'BORRAR'"
              [class.cursor-not-allowed]="anonymizeConfirmationInput !== 'BORRAR'"
              class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-bold shadow-sm">
              Confirmar Anonimización
            </button>
          </div>
        </div>
      </div>
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
    /* Fix for shadow visibility in dark mode and clipping */
    .modal-backdrop {
        background-color: rgba(0, 0, 0, 0.7); /* Darker backdrop for better contrast */
        padding: 2rem; /* Ensure space for shadow */
    }
    .modal-content-box {
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); /* Stronger shadow */
        margin: auto; /* Center if using flex */
        max-height: 90vh; /* Prevent overflowing viewport height */
        display: flex;
        flex-direction: column;
    }
  `]
})
export class ClientGdprPanelComponent implements OnInit {
  @Input() clientId!: string;
  @Input() clientEmail!: string;
  @Input() clientName!: string;
  @Input() clientPhone?: string;
  @Input() clientDni?: string;
  @Input() clientAddress?: string;
  @Input() readOnly: boolean = false;
  @Input() isClientView: boolean = false;
  @Input() showHeader: boolean = true;

  @Output() dataChanged = new EventEmitter<void>();
  @Output() closeModal = new EventEmitter<void>(); // Emit to close parent modal

  @ViewChild('requestModal') requestModal!: GdprRequestModalComponent;

  // Estado de consentimientos
  healthDataConsent: boolean = false;
  privacyPolicyConsent: boolean = false;
  marketingConsent: boolean = false;

  lastConsentUpdate: string = '';
  retentionPeriodYears: number = 5; // Updated to 5 years (Health Data Law)

  // Invitation Status
  invitationStatus: 'not_sent' | 'sent' | 'opened' | 'completed' = 'not_sent';
  invitationSentAt: string | null = null;
  sendingInvite: boolean = false;

  // Estado general
  loading: boolean = true;
  updatingConsent: boolean = false;
  exporting: boolean = false;
  creatingRequest: boolean = false;
  requestingDeletion: boolean = false;
  error: string = '';

  // Anonymization Modal State
  showAnonymizeModal: boolean = false;
  anonymizeConfirmationInput: string = '';
  anonymizeError: string = '';



  // Configuración
  dpoEmail = environment.gdpr.dpoEmail;

  private gdprService = inject(GdprComplianceService);
  private authService = inject(AuthService);
  private toastService = inject(ToastService);
  private customersService = inject(SupabaseCustomersService);

  async ngOnInit() {
    if (!this.clientEmail) {
      this.error = 'Email de cliente no proporcionado';
      this.loading = false;
      return;
    }

    // Wait for auth service to be ready and have company context
    this.authService.userProfile$
      .pipe(
        filter(p => !!p?.company_id),
        take(1)
      )
      .subscribe(() => {
        this.loadConsentStatus();
      });
  }

  /**
   * Carga el estado de consentimientos del cliente buscando el último registro de cada tipo
   */
  async loadConsentStatus() {
    this.loading = true;
    this.error = '';

    // Load current GDPR status from clients table (includes invitation status)
    this.gdprService.getClientGdprStatus(this.clientId).subscribe({
      next: (status) => {
        if (status) {
          // Map legacy/new fields
          this.marketingConsent = status.marketing_consent;
          this.invitationStatus = status.invitation_status || 'not_sent';
          this.invitationSentAt = status.invitation_sent_at;

          // Map 'consent_status' to granular if possible, or use defaults
          // Ideally we fetch from 'gdpr_consent_records' table for granular details, 
          // but for now we might need to rely on what we have or fetch extra.
          // Let's assume 'data_processing_consent' (legacy) maps to 'privacy_policy'
          this.privacyPolicyConsent = status.consent_status === 'accepted';

          // healthDataConsent is new, likely false unless verified
          // We should ideally fetch the specific records.
          this.loadGranularConsents();

          if (status.consent_date) {
            this.lastConsentUpdate = this.formatDate(status.consent_date);
          } else if (status.invitation_sent_at) {
            this.lastConsentUpdate = 'Invitación enviada';
          } else {
            this.lastConsentUpdate = 'Nunca';
          }
        }
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading GDPR status', err);
        this.error = 'Error cargando estado GDPR';
        this.loading = false;
      }
    });
  }

  loadGranularConsents() {
    this.gdprService.getConsentRecords(this.clientEmail).subscribe({
      next: (records) => {
        // Find latest for each type
        const health = records.filter(r => r.consent_type === 'health_data').sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())[0];
        const privacy = records.filter(r => r.consent_type === 'privacy_policy').sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())[0];
        const marketing = records.filter(r => r.consent_type === 'marketing').sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())[0];

        if (health) this.healthDataConsent = health.consent_given;
        if (privacy) this.privacyPolicyConsent = privacy.consent_given;
        if (marketing) this.marketingConsent = marketing.consent_given;
      }
    });
  }

  sendInvite() {
    this.sendingInvite = true;
    this.gdprService.sendConsentInvite(this.clientId).subscribe({
      next: (res) => {
        this.toastService.success('Invitación enviada correctamente.', 'Éxito');
        this.sendingInvite = false;
        this.loadConsentStatus(); // Refresh status
      },
      error: (err) => {
        this.sendingInvite = false;
        this.toastService.error(err.message || 'Error al enviar invitación', 'Error');
      }
    });
  }

  getInvitationStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      'not_sent': 'No enviada',
      'sent': 'Enviada',
      'opened': 'Abierta',
      'completed': 'Completado'
    };
    return labels[status] || status;
  }

  // New private auth service injection needed in class property list
  // private authService = inject(import('../../../../services/auth.service').then(m => m.AuthService)); // Dynamic import? No, just add to imports. 
  // Wait, I need to update the imports first. Let's do it cleanly.

  // Re-writing the whole strategy:
  // 1. Inject AuthService
  // 2. In ngOnInit, pipe userProfile$ -> filter(p => !!p?.company_id) -> first() -> switchMap(() => loadConsentStatus)

  // Let's just update the imports and class properties first in a separate block if needed, 
  // but here I will implement the logic assuming I can add the injection.

  // Correction: I can't easily add the import and injection in this single block if they are far apart.
  // The file view shows `private gdprService = inject(GdprComplianceService);` at line 341.
  // I will add `private authService = inject(AuthService);` there.

  // This block is for ngOnInit. I will assume authService is available.

  // WRONG APPROACH: I should split this into two edits:
  // 1. Add AuthService to imports and injection.
  // 2. Update ngOnInit.

  // Let's do step 1 first. I'll cancel this tool call and do imports first.

  // Actually, look at the file content again.
  // Line 345 is ngOnInit.
  // I need to add `import { AuthService } from .....` but it's already imported in `client-portal.service.ts` not here?
  // Checking `client-gdpr-panel.component.ts` imports...
  // It imports `GdprComplianceService`.
  // It DOES NOT import `AuthService`.

  // OK, I will cancel this and do the imports first.


  updateHealthDataConsent() {
    this.recordConsent('health_data', this.healthDataConsent);
  }

  updatePrivacyPolicyConsent() {
    this.recordConsent('privacy_policy', this.privacyPolicyConsent);
  }

  updateMarketingConsent() {
    this.recordConsent('marketing', this.marketingConsent);
  }

  private recordConsent(type: 'marketing' | 'health_data' | 'privacy_policy', given: boolean) {
    this.updatingConsent = true;

    const record: GdprConsentRecord = {
      subject_email: this.clientEmail,
      subject_id: this.clientId,
      consent_type: type,
      consent_given: given,
      consent_method: 'form',
      purpose: this.getPurposeLabel(type),
      data_processing_purposes: [type]
    };

    this.gdprService.recordConsent(record).subscribe({
      next: () => {
        // SYNC WITH CUSTOMERS TABLE FOR STATS (Legacy support)
        const updatePayload: any = {};
        if (type === 'marketing') updatePayload.marketing_consent = given;
        if (type === 'privacy_policy') updatePayload.data_processing_consent = given; // Map privacy to processing
        // Health data consent might not have a direct column in clients table yet, strictly specific record

        this.customersService.updateCustomer(this.clientId, updatePayload).subscribe({
          error: (e) => console.error('Error syncing consent stats', e)
        });

        this.toastService.success('Consentimiento actualizado correctamente', 'Éxito');
        this.updatingConsent = false;
        // this.loadConsentStatus(); // Avoid full reload to prevent UI jump
        this.lastConsentUpdate = 'Ahora mismo';
      },
      error: (err) => {
        this.error = 'Error al guardar consentimiento: ' + err.message;
        this.toastService.error(this.error, 'Error');
        // Revert UI
        if (type === 'marketing') this.marketingConsent = !given;
        if (type === 'health_data') this.healthDataConsent = !given;
        if (type === 'privacy_policy') this.privacyPolicyConsent = !given;
        this.updatingConsent = false;
      }
    });
  }

  private getPurposeLabel(type: string): string {
    switch (type) {
      case 'health_data': return 'Tratamiento de Datos de Salud (Asistencial)';
      case 'privacy_policy': return 'Política de Privacidad y Términos';
      case 'marketing': return 'Comunicaciones Comerciales';
      default: return type;
    }
  }

  exportData() {
    this.exporting = true;
    this.error = '';

    this.gdprService.downloadClientData(this.clientEmail, this.clientName).subscribe({
      next: (success) => {
        if (success) {
          this.toastService.success('Datos exportados correctamente.', 'Éxito');
        } else {
          this.error = 'No se pudieron descargar los datos.';
          this.toastService.error(this.error, 'Error');
        }
        this.exporting = false;
      },
      error: (err) => {
        this.error = 'Error exportando datos: ' + err.message;
        this.toastService.error(this.error, 'Error');
        this.exporting = false;
      }
    });
  }

  // --- Anonymization Modal Methods ---

  openAnonymizeModal() {
    this.anonymizeConfirmationInput = '';
    this.anonymizeError = '';
    this.showAnonymizeModal = true;
  }

  closeAnonymizeModal() {
    this.showAnonymizeModal = false;
    this.anonymizeConfirmationInput = '';
    this.anonymizeError = '';
  }



  processAnonymization() {
    if (this.anonymizeConfirmationInput !== 'BORRAR') {
      this.anonymizeError = 'Debes escribir "BORRAR" para confirmar.';
      return;
    }

    this.requestingDeletion = true;
    this.anonymizeError = '';

    const reason = 'Solicitud Web Derecho al Olvido (Modal Premium)';

    this.gdprService.anonymizeClientData(this.clientId, reason).subscribe({
      next: () => {
        this.toastService.success('Cliente anonimizado correctamente.', 'Éxito');
        this.closeAnonymizeModal();
        this.requestingDeletion = false;
        this.gdprService.getComplianceDashboard().subscribe();
        this.dataChanged.emit();
        setTimeout(() => this.closeModal.emit(), 300);
      },
      error: (err) => {
        this.anonymizeError = 'Error al anonimizar: ' + err.message;
        this.toastService.error(this.anonymizeError, 'Error');
        this.requestingDeletion = false;
      }
    });
  }

  // --- GDPR Request Modal Methods ---

  openRequestModal(type: 'rectification' | 'restriction' | 'objection') {
    this.requestModal.open(type);
  }

  onRequestCreated() {
    this.toastService.success('Solicitud procesada correctamente', 'GDPR');
    // Optional: refresh logic if needed
  }

  formatDate(dateString: string): string {
    if (!dateString) return 'No disponible';
    try {
      return new Date(dateString).toLocaleDateString('es-ES', {
        year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });
    } catch { return dateString; }
  }
}
