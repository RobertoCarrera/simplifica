import { Component, Input, Output, EventEmitter, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface ContractProgressStep {
  id: string;
  label: string;
  status: 'pending' | 'in-progress' | 'completed' | 'error';
  errorMessage?: string;
}

export interface PaymentOption {
  provider: 'stripe' | 'paypal' | 'local';
  url?: string;
  label: string;
  icon: string;
  iconClass: string;
  buttonClass: string;
}

export interface ContractResult {
  success: boolean;
  paymentUrl?: string;
  paymentOptions?: PaymentOption[];
  message?: string;
  error?: string;
  quoteId?: string;
  invoiceId?: string;
}

@Component({
  selector: 'app-contract-progress-dialog',
  standalone: true,
  imports: [CommonModule],
  template: `
    <!-- Modal Overlay - z-[9999] ensures it's above everything including sidebars -->
    <div *ngIf="visible()" 
         class="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
         [class.cursor-not-allowed]="!canClose()"
         (click)="onBackdropClick($event)">
      <!-- Modal Container -->
      <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md transform transition-all animate-modal-appear"
           role="dialog"
           aria-modal="true"
           [attr.aria-labelledby]="'contract-dialog-title'"
           (click)="$event.stopPropagation()">
        
        <!-- Header -->
        <div class="p-6 border-b border-gray-200 dark:border-slate-700">
          <div class="flex items-center justify-between">
            <h3 id="contract-dialog-title" class="text-xl font-bold text-gray-900 dark:text-white">
              {{ isComplete() ? (hasError() ? '❌ Error' : '✅ ¡Listo!') : '⏳ Procesando...' }}
            </h3>
            <!-- Only show close button when process is complete -->
            <button *ngIf="canClose()" 
                    (click)="close()"
                    class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1 rounded-full hover:bg-gray-100 dark:hover:bg-slate-700"
                    aria-label="Cerrar">
              <i class="fas fa-times text-xl"></i>
            </button>
          </div>
          <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {{ serviceName }}
          </p>
        </div>

        <!-- Progress Steps -->
        <div class="p-6">
          <div class="space-y-4">
            <div *ngFor="let step of steps(); let i = index" 
                 class="flex items-start gap-4">
              
              <!-- Step Icon -->
              <div class="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300"
                   [ngClass]="{
                     'bg-gray-100 dark:bg-slate-700 text-gray-400': step.status === 'pending',
                     'bg-orange-100 dark:bg-orange-900/30 text-orange-500': step.status === 'in-progress',
                     'bg-green-100 dark:bg-green-900/30 text-green-500': step.status === 'completed',
                     'bg-red-100 dark:bg-red-900/30 text-red-500': step.status === 'error'
                   }">
                <i *ngIf="step.status === 'pending'" class="fas fa-circle text-xs"></i>
                <i *ngIf="step.status === 'in-progress'" class="fas fa-spinner fa-spin"></i>
                <i *ngIf="step.status === 'completed'" class="fas fa-check"></i>
                <i *ngIf="step.status === 'error'" class="fas fa-exclamation"></i>
              </div>

              <!-- Step Content -->
              <div class="flex-1 min-w-0">
                <p class="font-medium transition-colors duration-300"
                   [ngClass]="{
                     'text-gray-400 dark:text-gray-500': step.status === 'pending',
                     'text-orange-600 dark:text-orange-400': step.status === 'in-progress',
                     'text-green-600 dark:text-green-400': step.status === 'completed',
                     'text-red-600 dark:text-red-400': step.status === 'error'
                   }">
                  {{ step.label }}
                </p>
                <p *ngIf="step.status === 'in-progress'" 
                   class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  Procesando...
                </p>
                <p *ngIf="step.errorMessage" 
                   class="text-sm text-red-500 dark:text-red-400 mt-0.5">
                  {{ step.errorMessage }}
                </p>
              </div>

              <!-- Connection Line -->
              <div *ngIf="i < steps().length - 1"
                   class="absolute left-5 mt-10 w-0.5 h-4 bg-gray-200 dark:bg-slate-700 -z-10"
                   [ngClass]="{
                     'bg-green-300 dark:bg-green-700': step.status === 'completed'
                   }">
              </div>
            </div>
          </div>

          <!-- Result Message -->
          <div *ngIf="resultMessage()" 
               class="mt-6 p-4 rounded-xl transition-all"
               [ngClass]="{
                 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800': !hasError(),
                 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800': hasError()
               }">
            <p class="text-sm"
               [ngClass]="{
                 'text-green-700 dark:text-green-300': !hasError(),
                 'text-red-700 dark:text-red-300': hasError()
               }">
              {{ resultMessage() }}
            </p>
          </div>
        </div>

        <!-- Actions -->
        <div class="p-6 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-700/50 rounded-b-2xl">
          <!-- Multiple Payment Options -->
          <div *ngIf="paymentOptions().length > 0" class="space-y-3">
            <p class="text-sm text-gray-600 dark:text-gray-400 text-center mb-4">
              Selecciona tu método de pago preferido:
            </p>
            <button *ngFor="let option of paymentOptions()" 
                    (click)="selectPaymentOption(option)"
                    class="w-full py-3 px-4 font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center gap-3"
                    [ngClass]="option.buttonClass">
              <i [class]="option.icon + ' ' + option.iconClass" class="text-xl"></i>
              {{ option.label }}
              <i *ngIf="option.provider !== 'local'" class="fas fa-arrow-right text-sm"></i>
            </button>
          </div>

          <!-- Single Payment Button (legacy/fallback) -->
          <button *ngIf="paymentUrl() && paymentOptions().length === 0" 
                  (click)="goToPayment()"
                  class="w-full py-3 px-4 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center gap-2">
            <i class="fas fa-credit-card"></i>
            Ir al pago
            <i class="fas fa-arrow-right text-sm"></i>
          </button>

          <!-- Close Button (when no payment) -->
          <button *ngIf="isComplete() && !paymentUrl() && paymentOptions().length === 0" 
                  (click)="close()"
                  class="w-full py-3 px-4 bg-gray-200 hover:bg-gray-300 dark:bg-slate-600 dark:hover:bg-slate-500 text-gray-700 dark:text-white font-semibold rounded-xl transition-all duration-200">
            {{ hasError() ? 'Cerrar' : 'Entendido' }}
          </button>

          <!-- Cancel during process -->
          <p *ngIf="!isComplete()" 
             class="text-center text-xs text-gray-400 dark:text-gray-500 mt-3">
            Por favor, espera mientras procesamos tu solicitud...
          </p>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: contents;
    }
    
    /* Animation for modal appearance */
    @keyframes modal-appear {
      from {
        opacity: 0;
        transform: scale(0.95) translateY(-10px);
      }
      to {
        opacity: 1;
        transform: scale(1) translateY(0);
      }
    }
    
    .animate-modal-appear {
      animation: modal-appear 0.2s ease-out forwards;
    }
  `]
})
export class ContractProgressDialogComponent {
  @Input() serviceName = '';
  @Output() closed = new EventEmitter<void>();
  @Output() paymentRedirect = new EventEmitter<string>();
  @Output() localPaymentSelected = new EventEmitter<void>();
  @Output() paymentSelected = new EventEmitter<PaymentOption>();

  visible = signal(false);
  steps = signal<ContractProgressStep[]>([]);
  resultMessage = signal<string>('');
  paymentUrl = signal<string>('');
  paymentOptions = signal<PaymentOption[]>([]);
  private _hasError = signal(false);

  isComplete = computed(() => {
    const currentSteps = this.steps();
    return currentSteps.length > 0 && currentSteps.every(s => s.status === 'completed' || s.status === 'error');
  });

  hasError = computed(() => this._hasError());

  canClose = computed(() => this.isComplete());

  /**
   * Start the contract process with visual steps
   */
  startProcess(serviceName: string) {
    this.serviceName = serviceName;
    this._hasError.set(false);
    this.resultMessage.set('');
    this.paymentUrl.set('');
    this.paymentOptions.set([]);
    
    this.steps.set([
      { id: 'quote', label: 'Generando presupuesto', status: 'pending' },
      { id: 'invoice', label: 'Creando factura', status: 'pending' },
      { id: 'payment', label: 'Preparando pago', status: 'pending' }
    ]);
    
    this.visible.set(true);
    
    // Start first step
    this.updateStep('quote', 'in-progress');
  }

  /**
   * Update a specific step's status
   */
  updateStep(stepId: string, status: ContractProgressStep['status'], errorMessage?: string) {
    this.steps.update(steps => 
      steps.map(s => 
        s.id === stepId 
          ? { ...s, status, errorMessage } 
          : s
      )
    );
  }

  /**
   * Move to the next step
   */
  nextStep() {
    const currentSteps = this.steps();
    const currentIndex = currentSteps.findIndex(s => s.status === 'in-progress');
    
    if (currentIndex >= 0) {
      this.updateStep(currentSteps[currentIndex].id, 'completed');
      
      if (currentIndex < currentSteps.length - 1) {
        this.updateStep(currentSteps[currentIndex + 1].id, 'in-progress');
      }
    }
  }

  /**
   * Complete the process successfully
   */
  completeSuccess(result: ContractResult) {
    // Mark all remaining steps as completed
    this.steps.update(steps => 
      steps.map(s => ({ ...s, status: 'completed' as const }))
    );

    // If we have multiple payment options, display them
    if (result.paymentOptions && result.paymentOptions.length > 0) {
      this.paymentOptions.set(result.paymentOptions);
      this.resultMessage.set(result.message || '¡Todo listo! Selecciona cómo quieres realizar el pago.');
    } else if (result.paymentUrl) {
      this.paymentUrl.set(result.paymentUrl);
      this.resultMessage.set(result.message || '¡Todo listo! Haz clic en el botón para completar el pago.');
    } else {
      this.resultMessage.set(result.message || 'El servicio ha sido contratado correctamente. Te contactaremos para el pago.');
    }
  }

  /**
   * Complete with multiple payment options
   */
  completeWithPaymentOptions(options: PaymentOption[], message?: string) {
    // Mark all steps as completed
    this.steps.update(steps => 
      steps.map(s => ({ ...s, status: 'completed' as const }))
    );

    this.paymentOptions.set(options);
    this.resultMessage.set(message || '¡Todo listo! Selecciona cómo quieres realizar el pago.');
  }

  /**
   * Complete the process with an error
   */
  completeError(stepId: string, errorMessage: string, fallbackMessage?: string) {
    this._hasError.set(true);
    this.updateStep(stepId, 'error', errorMessage);
    
    // Mark subsequent steps as skipped (keep as pending)
    const currentSteps = this.steps();
    const errorIndex = currentSteps.findIndex(s => s.id === stepId);
    
    this.steps.update(steps =>
      steps.map((s, i) => 
        i > errorIndex ? { ...s, status: 'pending' as const } : s
      )
    );

    this.resultMessage.set(fallbackMessage || 'Se ha producido un error. Por favor, contacta con nosotros.');
  }

  /**
   * Handle fallback case (no payment integration)
   */
  completeFallback(message: string) {
    // Mark steps appropriately
    this.updateStep('quote', 'completed');
    this.updateStep('invoice', 'completed');
    this.updateStep('payment', 'completed');
    
    // Update payment step label for fallback
    this.steps.update(steps =>
      steps.map(s => 
        s.id === 'payment' 
          ? { ...s, label: 'Contacto configurado' }
          : s
      )
    );

    this.resultMessage.set(message);
  }

  /**
   * Handle payment option selection
   */
  selectPaymentOption(option: PaymentOption) {
    // Emit the generic payment selected event
    this.paymentSelected.emit(option);
    
    if (option.provider === 'local') {
      // For local payment, emit event and close
      this.localPaymentSelected.emit();
      this.visible.set(false);
      this.closed.emit();
    } else if (option.url) {
      // For online payment providers, redirect
      this.paymentRedirect.emit(option.url);
      window.open(option.url, '_blank');
      this.visible.set(false);
      this.closed.emit();
    }
  }

  goToPayment() {
    const url = this.paymentUrl();
    if (url) {
      this.paymentRedirect.emit(url);
      // Open in new tab to preserve app state
      window.open(url, '_blank');
      // Close the dialog after opening payment
      this.visible.set(false);
      this.closed.emit();
    }
  }

  close() {
    this.visible.set(false);
    this.closed.emit();
  }

  onBackdropClick(event: Event) {
    // Do NOT allow closing by clicking outside - user must complete the process
    // or click the close button when process is complete
    // This prevents accidental dismissal during the contract flow
  }
}
