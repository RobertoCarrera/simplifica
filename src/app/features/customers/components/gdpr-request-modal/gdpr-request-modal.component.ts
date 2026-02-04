import { Component, Input, Output, EventEmitter, inject, ElementRef, OnInit, OnDestroy, Inject } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GdprComplianceService, GdprAccessRequest } from '../../../../services/gdpr-compliance.service';
import { ToastService } from '../../../../services/toast.service';

@Component({
    selector: 'app-gdpr-request-modal',
    standalone: true,
    imports: [CommonModule, FormsModule],
    template: `
    <div *ngIf="showModal" class="fixed inset-0 bg-gray-600 bg-opacity-75 overflow-y-auto h-full w-full z-[99999] flex items-center justify-center modal-backdrop">
      <div class="relative p-6 border w-11/12 md:w-1/2 lg:w-2/5 rounded-xl bg-white dark:bg-slate-800 dark:border-slate-600 modal-content-box" (click)="$event.stopPropagation()">
        
        <!-- Header -->
        <div class="flex justify-between items-center mb-4">
            <h3 class="text-xl font-bold text-gray-900 dark:text-white">{{ config.title }}</h3>
            <button (click)="close()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <i class="fas fa-times text-xl"></i>
            </button>
        </div>

        <p class="text-sm text-gray-600 dark:text-gray-400 mb-6 bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-100 dark:border-blue-800">
            {{ config.description }}
        </p>

        <!-- Info Alerts for Client -->
        <div *ngIf="config.type === 'rectification'" class="mb-6 p-3 bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 rounded-r text-sm text-blue-800 dark:text-blue-300">
           <p class="font-bold mb-1">Sobre la Rectificación:</p>
           Selecciona qué datos son erróneos e indica el valor correcto. Nosotros lo verificaremos y actualizaremos.
        </div>
        
        <div *ngIf="config.type === 'restriction'" class="mb-6 p-3 bg-orange-50 dark:bg-orange-900/20 border-l-4 border-orange-500 rounded-r text-sm text-orange-800 dark:text-orange-300">
           <p class="font-bold mb-1">¡Advertencia!</p>
           Limitar el tratamiento bloqueará tu acceso a la plataforma. No podremos procesar tus datos para prestarte el servicio, aunque los conservaremos bloqueados por imperativo legal.
        </div>
        
        <!-- GENERIC REASON INPUT (For Restriction / Objection) -->
        <div class="mb-6" *ngIf="config.type !== 'rectification'">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Motivo / Detalles de la solicitud <span class="text-red-500">*</span>
            </label>
            <textarea 
                [(ngModel)]="config.reason"
                rows="4" 
                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400"
                placeholder="Por favor, explique brevemente su solicitud..."></textarea>
        </div>

        <!-- STRUCTED RECTIFICATION FORM -->
        <div class="mb-6 space-y-4" *ngIf="config.type === 'rectification'">
            <div *ngFor="let field of rectificationFields" class="p-3 border rounded-lg border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                <div class="flex items-center mb-2">
                    <input type="checkbox" [id]="'check-' + field.key" [(ngModel)]="field.selected" 
                        class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500">
                    <label [for]="'check-' + field.key" class="ml-2 block text-sm font-medium text-gray-900 dark:text-white cursor-pointer select-none">
                        {{ field.label }}
                    </label>
                </div>
                
                <div *ngIf="field.selected" class="ml-6 space-y-2 animate-fadeIn">
                    <div class="text-xs text-gray-500 dark:text-gray-400" *ngIf="field.currentValue">
                        Valor actual: <span class="font-mono bg-gray-100 dark:bg-gray-700 px-1 rounded">{{ field.currentValue }}</span>
                    </div>
                    <div>
                        <input type="text" [(ngModel)]="field.newValue"
                            class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                            [placeholder]="'Introduce el nuevo ' + field.label.toLowerCase()">
                    </div>
                </div>
            </div>
             <p *ngIf="!hasSelectedFields()" class="text-sm text-red-500 text-center animate-pulse">
                Debes seleccionar al menos un campo para rectificar.
            </p>
        </div>

        <div class="flex justify-end gap-3">
            <button 
                (click)="close()" 
                class="px-4 py-2 bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-600 font-medium transition-colors">
                Cancelar
            </button>
            <button 
                (click)="submit()"
                [disabled]="submitting || !isValid()"
                class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-sm transition-colors flex items-center gap-2">
                <span *ngIf="submitting" class="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></span>
                Enviar Solicitud
            </button>
        </div>
      </div>
    </div>
  `,
    styles: [`
    .modal-backdrop {
        background-color: rgba(0, 0, 0, 0.7);
        padding: 1rem;
    }
    .modal-content-box {
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
        margin: auto;
        max-height: 95vh;
        display: flex;
        flex-direction: column;
        overflow-y: auto;
    }
    .animate-fadeIn {
        animation: fadeIn 0.2s ease-out;
    }
    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(-5px); }
        to { opacity: 1; transform: translateY(0); }
    }
  `]
})
export class GdprRequestModalComponent implements OnInit, OnDestroy {
    @Input() clientId!: string;
    @Input() clientEmail!: string;
    @Input() clientName!: string;
    @Input() clientPhone?: string;
    @Input() clientDni?: string;
    @Input() clientAddress?: string;

    // Billing Data Inputs
    @Input() billingData?: {
        business_name?: string;
        trade_name?: string;
        cif_nif?: string;
        billing_email?: string;
        iban?: string;
        address?: string;
    };

    @Input() context: 'personal' | 'billing' = 'personal';

    @Output() requestCreated = new EventEmitter<void>();

    showModal = false;
    submitting = false;

    config = {
        type: 'rectification' as 'rectification' | 'restriction' | 'objection',
        title: '',
        description: '',
        reason: ''
    };

    // Rectification Form Data
    rectificationFields: Array<{
        key: string;
        label: string;
        currentValue: string;
        newValue: string;
        selected: boolean;
    }> = [];

    private gdprService = inject(GdprComplianceService);
    private toastService = inject(ToastService);
    private el = inject(ElementRef);
    private document = inject(DOCUMENT);

    ngOnInit() {
        this.document.body.appendChild(this.el.nativeElement);
    }

    ngOnDestroy() {
        if (this.el.nativeElement.parentNode) {
            this.el.nativeElement.parentNode.removeChild(this.el.nativeElement);
        }
    }

    open(type: 'rectification' | 'restriction' | 'objection') {
        let title = '';
        let description = '';

        switch (type) {
            case 'rectification':
                title = this.context === 'billing' ? 'Rectificar Datos de Facturación' : 'Rectificar Datos Personales';
                description = 'Indica qué datos son incorrectos y cuáles son los valores correctos.';
                this.initRectificationForm();
                break;
            case 'restriction':
                title = 'Limitar Tratamiento de Datos';
                description = 'Indica qué tratamiento deseas limitar y por qué motivo.';
                break;
            case 'objection':
                title = 'Oponerse al Tratamiento';
                description = 'Explica los motivos relacionados con tu situación particular.';
                break;
        }

        this.config = {
            type,
            title,
            description,
            reason: ''
        };
        this.showModal = true;
    }

    close() {
        this.showModal = false;
        this.config.reason = '';
    }

    initRectificationForm() {
        if (this.context === 'billing') {
            this.rectificationFields = [
                { key: 'business_name', label: 'Razón Social', currentValue: this.billingData?.business_name || '', newValue: '', selected: false },
                { key: 'trade_name', label: 'Nombre Comercial', currentValue: this.billingData?.trade_name || '', newValue: '', selected: false },
                { key: 'cif_nif', label: 'CIF / NIF', currentValue: this.billingData?.cif_nif || '', newValue: '', selected: false },
                { key: 'billing_email', label: 'Email Facturación', currentValue: this.billingData?.billing_email || '', newValue: '', selected: false },
                { key: 'iban', label: 'IBAN / Cuenta', currentValue: this.billingData?.iban || '***', newValue: '', selected: false },
                { key: 'address', label: 'Dirección Fiscal', currentValue: this.billingData?.address || '', newValue: '', selected: false }
            ];
        } else {
            // Personal Context
            this.rectificationFields = [
                { key: 'name', label: 'Nombre Completo', currentValue: this.clientName || '', newValue: '', selected: false },
                { key: 'email', label: 'Email', currentValue: this.clientEmail || '', newValue: '', selected: false },
                { key: 'phone', label: 'Teléfono', currentValue: this.clientPhone || 'No registrado', newValue: '', selected: false }
            ];
        }
    }

    hasSelectedFields(): boolean {
        return this.rectificationFields.some(f => f.selected);
    }

    isValid(): boolean {
        if (this.config.type === 'rectification') {
            // Must have at least one field selected and that field must have a newValue
            const selected = this.rectificationFields.filter(f => f.selected);
            if (selected.length === 0) return false;
            return selected.every(f => f.newValue && f.newValue.trim().length > 0);
        } else {
            return !!this.config.reason && this.config.reason.trim().length >= 20;
        }
    }

    submit() {
        let finalReason = this.config.reason;

        if (this.config.type === 'rectification') {
            if (!this.isValid()) {
                this.toastService.error('Por favor, completa los valores nuevos para los campos seleccionados.', 'Faltan datos');
                return;
            }

            // Format the rectification request nicely
            const changes = this.rectificationFields
                .filter(f => f.selected)
                .map(f => `- ${f.label}: Valor actual "${f.currentValue}" => Nuevo valor "${f.newValue}"`)
                .join('\n');

            finalReason = `SOLICITUD DE RECTIFICACIÓN:\n${changes}`;
        } else {
            if (!finalReason.trim()) {
                this.toastService.error('Por favor, indica un motivo o detalle.', 'Campo requerido');
                return;
            }

            if (finalReason.length < 20) {
                this.toastService.error('Por favor, detalla más tu solicitud (mínimo 20 caracteres).', 'Descripción muy corta');
                return;
            }
        }

        this.submitting = true;

        const request: GdprAccessRequest = {
            request_type: this.config.type,
            subject_email: this.clientEmail,
            subject_name: this.clientName || this.clientEmail.split('@')[0],
            subject_identifier: this.clientId,
            request_details: { description: finalReason }
        };

        this.gdprService.createAccessRequest(request).subscribe({
            next: () => {
                this.toastService.success('Solicitud enviada correctamente. El responsable ha sido notificado.', 'Éxito');
                this.submitting = false;
                this.requestCreated.emit();
                this.close();
            },
            error: (err) => {
                this.toastService.error('Error creando solicitud: ' + (err.message || 'Error desconocido'), 'Error');
                this.submitting = false;
            }
        });
    }
}
