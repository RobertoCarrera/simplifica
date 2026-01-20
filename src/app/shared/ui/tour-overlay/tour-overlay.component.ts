import { Component, signal, computed, OnInit, OnDestroy, ElementRef, ViewChild, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OnboardingService } from '../../../features/services/onboarding.service';
import { TourStep } from '../../../features/interfaces/onboarding.interface';
import { SafeHtmlPipe } from '../../../core/pipes/safe-html.pipe';

@Component({
  selector: 'app-tour-overlay',
  standalone: true,
  imports: [CommonModule, SafeHtmlPipe],
  template: `
    @if (isVisible()) {
      <!-- Overlay de fondo -->
      <div class="fixed inset-0 z-50">
        <!-- Máscara oscura -->
        <div class="absolute inset-0 bg-black bg-opacity-50 transition-opacity duration-300"></div>
        
        <!-- Highlight del elemento target -->
        @if (targetElement()) {
          <div 
            class="absolute border-4 border-blue-400 rounded-lg shadow-lg transition-all duration-300 pointer-events-none highlight-pulse"
            [style.left.px]="targetElement()!.left - 4"
            [style.top.px]="targetElement()!.top - 4"
            [style.width.px]="targetElement()!.width + 8"
            [style.height.px]="targetElement()!.height + 8"
          ></div>
          
          <!-- Apertura en la máscara para mostrar el elemento -->
          <div 
            class="absolute bg-transparent border-4 border-blue-400 rounded-lg"
            [style.left.px]="targetElement()!.left - 4"
            [style.top.px]="targetElement()!.top - 4"
            [style.width.px]="targetElement()!.width + 8"
            [style.height.px]="targetElement()!.height + 8"
            style="box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5);"
          ></div>
        }
        
        <!-- Tooltip del tour -->
        @if (currentStep()) {
          <div 
            #tourTooltip
            class="fixed bg-white rounded-xl shadow-2xl border border-gray-200 p-6 max-w-sm w-80 pointer-events-auto transition-all duration-300 transform z-[60]"
            [style]="getTooltipStyle()"
          >
            <!-- Header del tooltip -->
            <div class="flex items-start justify-between mb-4">
              <div class="flex-1">
                <h3 class="text-lg font-bold text-gray-900 mb-1">{{ currentStep()!.title }}</h3>
                <div class="flex items-center gap-2 text-sm text-gray-500">
                  <span>Paso {{ currentStepIndex() + 1 }} de {{ totalSteps() }}</span>
                  @if (currentTour()) {
                    <span>•</span>
                    <span>{{ currentTour()!.name }}</span>
                  }
                </div>
              </div>
              
              @if (currentStep()!.showSkip) {
                <button
                  (click)="skipTour()"
                  class="text-gray-400 hover:text-gray-600 p-1"
                  title="Saltar tour"
                >
                  <i class="bi bi-x-lg"></i>
                </button>
              }
            </div>

            <!-- Contenido -->
            <div class="mb-6">
              <p class="text-gray-700 leading-relaxed" [innerHTML]="currentStep()!.content | safeHtml"></p>
            </div>

            <!-- Barra de progreso -->
            <div class="mb-6">
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs font-medium text-gray-600">Progreso</span>
                <span class="text-xs font-bold text-blue-600">{{ Math.round(progress()) }}%</span>
              </div>
              <div class="w-full bg-gray-200 rounded-full h-2">
                <div 
                  class="bg-gradient-to-r from-blue-500 to-purple-600 h-2 rounded-full transition-all duration-500 ease-out"
                  [style.width.%]="progress()"
                ></div>
              </div>
            </div>

            <!-- Botones de navegación -->
            <div class="flex items-center justify-between">
              <div class="flex gap-2">
                @if (currentStep()!.showPrev && !isFirstStep()) {
                  <button
                    (click)="previousStep()"
                    class="px-4 py-2 rounded-lg font-medium transition-colors duration-200 tour-button-secondary"
                  >
                    <i class="bi bi-arrow-left mr-2"></i>
                    Anterior
                  </button>
                }
              </div>

              <div class="flex gap-2">
                @if (currentStep()!.showSkip && !isLastStep()) {
                  <button
                    (click)="skipTour()"
                    class="px-4 py-2 font-medium transition-colors duration-200 tour-button-secondary"
                  >
                    Saltar
                  </button>
                }

                @if (currentStep()!.showNext) {
                  <button
                    (click)="nextStep()"
                    class="px-6 py-2 rounded-lg font-medium transition-all duration-200 shadow-lg hover:shadow-xl tour-button-primary"
                  >
                    @if (isLastStep()) {
                      <i class="bi bi-check-circle mr-2"></i>
                      Finalizar
                    } @else {
                      Siguiente
                      <i class="bi bi-arrow-right ml-2"></i>
                    }
                  </button>
                }
              </div>
            </div>
          </div>
        }
      </div>
    }
  `,
  styles: [`
    @keyframes pulse {
      0%, 100% {
        box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7);
      }
      50% {
        box-shadow: 0 0 0 10px rgba(59, 130, 246, 0);
      }
    }

    @keyframes highlight-pulse {
      0%, 100% {
        border-color: #3b82f6;
        box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7);
      }
      50% {
        border-color: #60a5fa;
        box-shadow: 0 0 0 8px rgba(59, 130, 246, 0);
      }
    }

    .highlight-pulse {
      animation: highlight-pulse 2s infinite;
    }

    .tooltip-enter {
      animation: slideIn 0.3s ease-out;
    }

    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateY(10px) scale(0.95);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    /* Asegurar que los botones sean visibles */
    .tour-button-primary {
      background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%) !important;
      color: white !important;
      border: none !important;
    }

    .tour-button-secondary {
      background: white !important;
      color: #374151 !important;
      border: 1px solid #d1d5db !important;
    }

    .tour-button-secondary:hover {
      background: #f9fafb !important;
      color: #111827 !important;
    }
  `]
})
export class TourOverlayComponent implements OnInit, OnDestroy {
  @ViewChild('tourTooltip', { static: false }) tourTooltip!: ElementRef;

  // Referencia a Math para el template
  Math = Math;

  // Signals para highlighting
  readonly targetElement = signal<{ left: number; top: number; width: number; height: number } | null>(null);

  // Computed values del servicio
  readonly currentTour = computed(() => this.onboardingService.currentTourData());
  readonly currentStep = computed(() => this.onboardingService.currentStep());
  readonly currentStepIndex = computed(() => this.onboardingService.stepIndex());
  readonly totalSteps = computed(() => this.currentTour()?.steps.length || 0);
  readonly isFirstStep = computed(() => this.onboardingService.isFirstStep());
  readonly isLastStep = computed(() => this.onboardingService.isLastStep());
  readonly isVisible = computed(() => {
    const visible = this.currentTour() !== null && this.currentStep() !== null;
    console.log('🎯 Tour Overlay visible:', visible, 'Tour:', this.currentTour()?.name, 'Step:', this.currentStep()?.title);
    return visible;
  });

  readonly progress = computed(() => {
    const total = this.totalSteps();
    const current = this.currentStepIndex();
    return total > 0 ? ((current + 1) / total) * 100 : 0;
  });

  constructor(private onboardingService: OnboardingService) { }

  ngOnInit() {
    // Usar effect para actualizar posiciones cuando cambie el step
    effect(() => {
      const step = this.currentStep();
      if (step) {
        setTimeout(() => this.updateTargetPosition(), 100);
      }
    });

    console.log('🎯 Tour Overlay inicializado');
  }

  ngOnDestroy() {
    // Cleanup si necesario
  }

  private updateTargetPosition(): void {
    const step = this.currentStep();
    if (!step) return;

    // Si es posición center, no necesitamos encontrar elemento
    if (step.position === 'center' || step.targetElement === 'body') {
      this.targetElement.set(null);
      return;
    }

    // Buscar elemento target
    const element = document.querySelector(step.targetElement);
    if (!element) {
      console.warn('Elemento target no encontrado:', step.targetElement);
      this.targetElement.set(null);
      return;
    }

    const rect = element.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

    this.targetElement.set({
      left: rect.left + scrollLeft,
      top: rect.top + scrollTop,
      width: rect.width,
      height: rect.height
    });
  }

  getTooltipStyle(): { [key: string]: string } {
    const step = this.currentStep();
    const target = this.targetElement();

    if (!step) return {};

    // Posición por defecto (center)
    let left = '50%';
    let top = '50%';
    let transform = 'translate(-50%, -50%)';

    // Si hay elemento target, posicionar relative al elemento
    if (target && step.position !== 'center') {
      const tooltipWidth = 320;
      const tooltipHeight = 300;
      const margin = 20;

      switch (step.position) {
        case 'bottom':
          left = `${target.left + (target.width / 2) - (tooltipWidth / 2)}px`;
          top = `${target.top + target.height + margin}px`;
          transform = 'none';
          break;
        case 'top':
          left = `${target.left + (target.width / 2) - (tooltipWidth / 2)}px`;
          top = `${target.top - tooltipHeight - margin}px`;
          transform = 'none';
          break;
        case 'right':
          left = `${target.left + target.width + margin}px`;
          top = `${target.top + (target.height / 2) - (tooltipHeight / 2)}px`;
          transform = 'none';
          break;
        case 'left':
          left = `${target.left - tooltipWidth - margin}px`;
          top = `${target.top + (target.height / 2) - (tooltipHeight / 2)}px`;
          transform = 'none';
          break;
      }

      // Ajustar si se sale de la pantalla
      const leftNum = parseInt(left);
      const topNum = parseInt(top);

      if (leftNum < 20) left = '20px';
      if (leftNum + tooltipWidth > window.innerWidth - 20) {
        left = `${window.innerWidth - tooltipWidth - 20}px`;
      }
      if (topNum < 20) top = '20px';
      if (topNum + tooltipHeight > window.innerHeight - 20) {
        top = `${window.innerHeight - tooltipHeight - 20}px`;
      }
    }

    return {
      left,
      top,
      transform
    };
  }

  // Métodos de navegación
  nextStep(): void {
    this.onboardingService.nextStep();
  }

  previousStep(): void {
    this.onboardingService.previousStep();
  }

  skipTour(): void {
    this.onboardingService.skipTour();
  }
}
