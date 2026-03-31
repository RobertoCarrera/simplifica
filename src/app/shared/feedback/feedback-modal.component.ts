import {
  Component,
  Input,
  Output,
  EventEmitter,
  signal,
  OnChanges,
  SimpleChanges,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RuntimeConfigService } from '../../services/runtime-config.service';

interface FeedbackPayload {
  type: 'bug' | 'improvement';
  description: string;
  screenshot?: string;
  location: string;
}

@Component({
  selector: 'app-feedback-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    @if (visible) {
      <!-- Backdrop -->
      <div
        class="fixed inset-0 z-[99999] flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-title"
        (click)="onBackdropClick($event)"
      >
        <!-- Blur overlay -->
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>

        <!-- Panel -->
        <div
          class="relative w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/10 bg-white dark:bg-gray-900 animate-modal"
          (click)="$event.stopPropagation()"
        >
          <!-- Header -->
          <div class="px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-800">
            <div class="flex items-center justify-between">
              <h3 id="feedback-title" class="text-lg font-bold text-gray-900 dark:text-white">
                Enviar Feedback
              </h3>
              <button
                type="button"
                (click)="close()"
                class="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Reporta un bug o sugiere una mejora
            </p>
          </div>

          <!-- Body -->
          <div class="px-6 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
            <!-- Type Selector -->
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Tipo de feedback *
              </label>
              <div class="flex gap-3">
                <button
                  type="button"
                  (click)="setType('bug')"
                  class="flex-1 py-3 px-4 rounded-xl border-2 transition-all duration-200 flex items-center justify-center gap-2"
                  [ngClass]="{
                    'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300':
                      form.type === 'bug',
                    'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600':
                      form.type !== 'bug',
                  }"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.667-2.694-1.667-3.464 0L3.34 16c-.77 1.667.192 3 1.732 3z"
                    />
                  </svg>
                  Bug
                </button>
                <button
                  type="button"
                  (click)="setType('improvement')"
                  class="flex-1 py-3 px-4 rounded-xl border-2 transition-all duration-200 flex items-center justify-center gap-2"
                  [ngClass]="{
                    'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300':
                      form.type === 'improvement',
                    'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600':
                      form.type !== 'improvement',
                  }"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                    />
                  </svg>
                  Mejora
                </button>
              </div>
            </div>

            <!-- Description -->
            <div>
              <label
                for="description"
                class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                Descripción *
              </label>
              <textarea
                id="description"
                [(ngModel)]="form.description"
                name="description"
                rows="4"
                class="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                placeholder="Describe el problema o la mejora que sugieres..."
                [class.border-red-500]="showValidationError && !form.description.trim()"
              ></textarea>
              @if (showValidationError && !form.description.trim()) {
                <p class="mt-1 text-sm text-red-500">La descripción es requerida</p>
              }
            </div>

            <!-- URL (read-only, prefilled) -->
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Página
              </label>
              <div
                class="px-4 py-2 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-sm truncate"
              >
                {{ form.location }}
              </div>
            </div>

            <!-- Screenshot -->
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Captura de pantalla
                <span class="text-gray-400 font-normal">(opcional, máx 1MB)</span>
              </label>

              @if (form.screenshot) {
                <!-- Screenshot preview -->
                <div
                  class="relative rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700"
                >
                  <img
                    [src]="form.screenshot"
                    alt="Screenshot preview"
                    class="w-full max-h-40 object-contain bg-gray-50 dark:bg-gray-800"
                  />
                  <button
                    type="button"
                    (click)="removeScreenshot()"
                    class="absolute top-2 right-2 p-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors shadow-lg"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              } @else {
                <!-- Upload button -->
                <div class="flex gap-3">
                  <button
                    type="button"
                    (click)="captureScreenshot()"
                    [disabled]="isCapturing()"
                    class="flex-1 py-2.5 px-4 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    @if (isCapturing()) {
                      <svg
                        class="animate-spin w-4 h-4"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          class="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          stroke-width="4"
                        ></circle>
                        <path
                          class="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      Capturando...
                    } @else {
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                        />
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                      </svg>
                      Capturar pantalla
                    }
                  </button>

                  <label class="flex-1 cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      (change)="onFileSelected($event)"
                      class="hidden"
                    />
                    <span
                      class="flex-1 py-2.5 px-4 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                      Subir imagen
                    </span>
                  </label>
                </div>
                @if (screenshotError()) {
                  <p class="mt-1 text-sm text-red-500">{{ screenshotError() }}</p>
                }
              }
            </div>
          </div>

          <!-- Footer -->
          <div class="px-6 pb-6 pt-4 border-t border-gray-100 dark:border-gray-800">
            @if (submitError()) {
              <div
                class="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm"
              >
                {{ submitError() }}
              </div>
            }
            @if (submitSuccess()) {
              <div
                class="mb-4 p-3 rounded-xl bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-sm flex items-center gap-2"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                Feedback enviado correctamente. ¡Gracias!
              </div>
            }

            <div class="flex gap-3">
              <button
                type="button"
                (click)="close()"
                class="flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 transition-all duration-150"
              >
                Cancelar
              </button>
              <button
                type="button"
                (click)="submit()"
                [disabled]="isSubmitting()"
                class="flex-1 py-2.5 px-4 rounded-xl text-sm font-bold text-white shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 transition-all duration-150 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                @if (isSubmitting()) {
                  <svg
                    class="animate-spin w-4 h-4"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      class="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      stroke-width="4"
                    ></circle>
                    <path
                      class="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Enviando...
                } @else {
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                    />
                  </svg>
                  Enviar
                }
              </button>
            </div>
          </div>
        </div>
      </div>
    }
  `,
  styles: [
    `
      @keyframes modal-in {
        from {
          opacity: 0;
          transform: scale(0.94) translateY(8px);
        }
        to {
          opacity: 1;
          transform: scale(1) translateY(0);
        }
      }
      .animate-modal {
        animation: modal-in 0.18s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }
    `,
  ],
})
export class FeedbackModalComponent implements OnChanges {
  @Input() visible = false;
  @Output() closed = new EventEmitter<void>();
  @Output() submitted = new EventEmitter<void>();

  private runtimeConfig = inject(RuntimeConfigService);

  // Form state
  form = {
    type: 'bug' as 'bug' | 'improvement',
    description: '',
    screenshot: '',
    location: '',
  };

  // UI state signals
  isCapturing = signal(false);
  isSubmitting = signal(false);
  screenshotError = signal('');
  submitError = signal('');
  showValidationError = false;
  submitSuccess = signal(false);

  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    if (changes['visible'] && this.visible) {
      // Reset form when modal opens
      this.form = {
        type: 'bug',
        description: '',
        screenshot: '',
        location: typeof window !== 'undefined' ? window.location.href : '',
      };
      this.submitError.set('');
      this.screenshotError.set('');
      this.showValidationError = false;
      this.submitSuccess.set(false);
    }
  }

  setType(type: 'bug' | 'improvement'): void {
    this.form.type = type;
  }

  close(): void {
    this.closed.emit();
  }

  async captureScreenshot(): Promise<void> {
    this.isCapturing.set(true);
    this.screenshotError.set('');

    try {
      // Dynamically import html2canvas
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(document.body, {
        useCORS: true,
        logging: false,
        width: window.innerWidth,
        height: window.innerHeight,
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
      });

      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);

      // Check size (max 1MB = ~1,048,576 chars as base64)
      if (dataUrl.length > 1400000) {
        this.screenshotError.set(
          'La captura es muy grande. Por favor, sube una imagen más pequeña.',
        );
        return;
      }

      this.form.screenshot = dataUrl;
    } catch (error: any) {
      console.error('Screenshot capture failed:', error);
      this.screenshotError.set(
        'No se pudo capturar la pantalla. Puedes subir una imagen manualmente.',
      );
    } finally {
      this.isCapturing.set(false);
    }
  }

  removeScreenshot(): void {
    this.form.screenshot = '';
    this.screenshotError.set('');
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];

    // Check file size (max 1MB)
    if (file.size > 1048576) {
      this.screenshotError.set('El archivo es muy grande. Máximo 1MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Check base64 size
      if (result.length > 1400000) {
        this.screenshotError.set(
          'El archivo es muy grande. Por favor, usa una imagen más pequeña.',
        );
        return;
      }
      this.form.screenshot = result;
      this.screenshotError.set('');
    };
    reader.onerror = () => {
      this.screenshotError.set('Error al leer el archivo.');
    };
    reader.readAsDataURL(file);
  }

  async submit(): Promise<void> {
    // Validate
    if (!this.form.description.trim()) {
      this.showValidationError = true;
      this.submitError.set('');
      return;
    }

    this.showValidationError = false;
    this.isSubmitting.set(true);
    this.submitError.set('');
    this.submitSuccess.set(false);

    try {
      const cfg = this.runtimeConfig.get();
      const edgeFunctionsBaseUrl = cfg?.edgeFunctionsBaseUrl || '';

      if (!edgeFunctionsBaseUrl) {
        throw new Error('Configuración de API no disponible');
      }

      const payload: FeedbackPayload = {
        type: this.form.type,
        description: this.form.description.trim(),
        screenshot: this.form.screenshot || undefined,
        location: this.form.location,
      };

      const response = await fetch(`${edgeFunctionsBaseUrl}/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: cfg?.supabase?.anonKey || '',
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error('Demasiadas solicitudes. Por favor, espera un momento.');
        }
        throw new Error(result.error || 'Error al enviar el feedback');
      }

      this.submitSuccess.set(true);
      this.submitted.emit();

      // Auto-close after success
      setTimeout(() => {
        this.close();
      }, 2000);
    } catch (error: any) {
      this.submitError.set(error.message || 'Error de conexión. Inténtalo de nuevo.');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  onBackdropClick(event: Event): void {
    this.close();
  }
}
