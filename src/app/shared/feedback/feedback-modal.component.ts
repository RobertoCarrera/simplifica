import {
  Component,
  signal,
  OnChanges,
  SimpleChanges,
  inject,
  effect,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RuntimeConfigService } from '../../services/runtime-config.service';
import { FeedbackService } from './feedback.service';
import { AuthService } from '../../services/auth.service';

interface FeedbackPayload {
  type: 'bug' | 'improvement';
  description: string;
  screenshot?: string;
  location: string;
  userEmail?: string;
}

@Component({
  selector: 'app-feedback-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    @if (feedbackService.isOpen()) {
      <!-- Floating Panel (bottom-right) -->
      <div
        class="fixed bottom-6 right-4 z-[99999] w-80 rounded-2xl shadow-2xl ring-1 ring-white/10 bg-white dark:bg-gray-900 overflow-hidden transition-all duration-300"
        [class.minimized]="isMinimized()"
        [class.closing]="isClosing()"
        [class.shrinking]="isShrinking()"
        [class.unshrinking]="isUnshrinking()"
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-title"
      >
        <!-- Header -->
        <div class="flex items-center justify-between px-4 py-3 bg-gray-900 dark:bg-gray-800">
          <div class="flex items-center gap-2">
            <span class="text-sm font-semibold text-white" id="feedback-title"> Feedback </span>
          </div>
          <div class="flex items-center gap-1">
            <button
              type="button"
              (click)="toggleMinimize()"
              class="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              [title]="isMinimized() ? 'Expandir' : 'Minimizar'"
            >
              <i
                class="fas"
                [class.fa-chevron-up]="isMinimized()"
                [class.fa-chevron-down]="!isMinimized()"
              ></i>
            </button>
            <button
              type="button"
              (click)="close()"
              class="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              title="Cerrar"
            >
              <i class="fas fa-xmark"></i>
            </button>
          </div>
        </div>

        <!-- Body -->
        <div class="flex flex-col max-h-[60vh]" [class.hidden]="isMinimized()">
          <div class="flex-1 overflow-y-auto p-4 space-y-4">
            <p class="text-xs text-gray-500 dark:text-gray-400">
              Reporta un bug o sugiere una mejora
            </p>

            <!-- Type Selector -->
            <div class="flex gap-2">
              <button
                type="button"
                (click)="setType('bug')"
                class="flex-1 py-2 px-3 rounded-xl border-2 transition-all duration-200 flex items-center justify-center gap-2 text-sm font-medium"
                [ngClass]="{
                  'border-red-400 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300':
                    form.type === 'bug',
                  'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600':
                    form.type !== 'bug',
                }"
              >
                <i class="fas fa-bug"></i>
                Bug
              </button>
              <button
                type="button"
                (click)="setType('improvement')"
                class="flex-1 py-2 px-3 rounded-xl border-2 transition-all duration-200 flex items-center justify-center gap-2 text-sm font-medium"
                [ngClass]="{
                  'border-yellow-400 bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300':
                    form.type === 'improvement',
                  'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600':
                    form.type !== 'improvement',
                }"
              >
                <i class="fas fa-lightbulb"></i>
                Mejora
              </button>
            </div>

            <!-- Description -->
            <div>
              <textarea
                [(ngModel)]="form.description"
                name="description"
                rows="3"
                class="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                placeholder="Describe el problema o mejora..."
                [class.border-red-400]="showValidationError && !form.description.trim()"
              ></textarea>
              @if (showValidationError && !form.description.trim()) {
                <p class="mt-1 text-xs text-red-500">La descripción es requerida</p>
              }
            </div>

            <!-- Location (readonly) -->
            <div class="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800">
              <span class="text-xs text-gray-400 truncate flex-1" [title]="form.location">
                {{ form.location }}
              </span>
            </div>

            <!-- Screenshot -->
            <div>
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs font-medium text-gray-700 dark:text-gray-300">
                  Captura de pantalla
                </span>
                @if (form.screenshot) {
                  <button
                    type="button"
                    (click)="removeScreenshot()"
                    class="text-xs text-red-500 hover:text-red-600 transition-colors"
                  >
                    Eliminar
                  </button>
                }
              </div>

              @if (form.screenshot) {
                <!-- Screenshot Preview -->
                <div
                  class="relative rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700"
                >
                  <img
                    [src]="form.screenshot"
                    alt="Screenshot"
                    class="w-full max-h-32 object-contain bg-gray-50 dark:bg-gray-800"
                  />
                </div>
              } @else {
                <!-- Screenshot Actions -->
                <div class="flex gap-2">
                  <button
                    type="button"
                    (click)="captureScreenshot()"
                    [disabled]="isCapturing()"
                    class="flex-1 py-2 px-3 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    @if (isCapturing()) {
                      <i class="fas fa-spinner fa-spin"></i>
                      <span>Capturando...</span>
                    } @else {
                      <i class="fas fa-camera"></i>
                      <span>Capturar</span>
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
                      class="flex-1 py-2 px-3 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-sm flex items-center justify-center gap-2"
                    >
                      <i class="fas fa-upload"></i>
                      <span>Subir</span>
                    </span>
                  </label>
                </div>
              }
              @if (screenshotError()) {
                <p class="mt-1 text-xs text-red-500">{{ screenshotError() }}</p>
              }
            </div>
          </div>

          <!-- Footer -->
          <div class="flex-shrink-0 p-4 pt-2 border-t border-gray-100 dark:border-gray-800">
            @if (submitError()) {
              <div
                class="mb-3 p-2 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-xs"
              >
                {{ submitError() }}
              </div>
            }
            @if (submitSuccess()) {
              <div
                class="mb-3 p-2 rounded-lg bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 text-xs flex items-center gap-2"
              >
                <i class="fas fa-paper-plane"></i>
                ¡Enviado! Gracias por tu feedback
              </div>
            }
            <button
              type="button"
              (click)="submit()"
              [disabled]="isSubmitting()"
              class="w-full py-2.5 px-4 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              @if (isSubmitting()) {
                <i class="fas fa-spinner fa-spin"></i>
                <span>Enviando...</span>
              } @else {
                <i class="fas fa-paper-plane"></i>
                <span>Enviar</span>
              }
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [
    `
      @keyframes panel-in {
        from {
          opacity: 0;
          transform: translateY(20px) scale(0.95);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      @keyframes panel-out {
        from {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
        to {
          opacity: 0;
          transform: translateY(20px) scale(0.95);
        }
      }

      @keyframes shrink {
        from {
          max-height: 600px;
          opacity: 1;
        }
        to {
          max-height: 52px;
          opacity: 1;
        }
      }

      @keyframes unshrink {
        from {
          max-height: 52px;
          opacity: 1;
        }
        to {
          max-height: 600px;
          opacity: 1;
        }
      }

      :host {
        display: contents;
      }

      :host > div {
        animation: panel-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
      }

      :host > div.closing {
        animation: panel-out 0.2s ease-in forwards;
      }

      .minimized {
        max-height: 52px !important;
      }

      .shrinking {
        animation: shrink 0.25s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        overflow: hidden;
      }

      .unshrinking {
        animation: unshrink 0.25s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        overflow: hidden;
      }

      .minimized > div:first-child {
        padding-bottom: 12px !important;
      }

      .minimized .flex.flex-col {
        display: none;
      }

      .transition-all {
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }
    `,
  ],
})
export class FeedbackModalComponent implements OnChanges {
  feedbackService = inject(FeedbackService);
  private runtimeConfig = inject(RuntimeConfigService);
  private auth = inject(AuthService);

  // Form state
  form = {
    type: 'bug' as 'bug' | 'improvement',
    description: '',
    screenshot: '',
    location: '',
  };

  // UI state
  isCapturing = signal(false);
  isSubmitting = signal(false);
  screenshotError = signal('');
  submitError = signal('');
  showValidationError = false;
  submitSuccess = signal(false);
  isMinimized = signal(false);
  isClosing = signal(false);
  isShrinking = signal(false);
  isUnshrinking = signal(false);

  constructor() {
    // Reset form when panel opens
    effect(() => {
      if (this.feedbackService.isOpen()) {
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
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Nothing needed — effect handles reset
  }

  setType(type: 'bug' | 'improvement'): void {
    this.form.type = type;
  }

  toggleMinimize(): void {
    const currentlyMinimized = this.isMinimized();

    if (currentlyMinimized) {
      // Expanding - trigger unshrink animation
      this.isUnshrinking.set(true);
      setTimeout(() => {
        this.isUnshrinking.set(false);
        this.isMinimized.set(false);
      }, 250);
    } else {
      // Shrinking - trigger shrink animation
      this.isShrinking.set(true);
      setTimeout(() => {
        this.isShrinking.set(false);
        this.isMinimized.set(true);
      }, 250);
    }
  }

  close(): void {
    this.isMinimized.set(false);
    this.isClosing.set(true);
    // Wait for exit animation to complete before actually closing
    setTimeout(() => {
      this.feedbackService.close();
      this.isClosing.set(false);
    }, 200);
  }

  async captureScreenshot(): Promise<void> {
    // Minimize first for cleaner capture
    this.isMinimized.set(true);

    // Wait for panel to shrink
    await new Promise((resolve) => setTimeout(resolve, 200));

    this.isCapturing.set(true);
    this.screenshotError.set('');

    try {
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

      if (dataUrl.length > 1400000) {
        this.screenshotError.set('La captura es muy grande. Usa una imagen más pequeña.');
        return;
      }

      this.form.screenshot = dataUrl;
    } catch (error: any) {
      console.error('Screenshot capture failed:', error);
      this.screenshotError.set('No se pudo capturar. Sube una imagen manualmente.');
    } finally {
      this.isCapturing.set(false);
      // Expand after capture
      this.isMinimized.set(false);
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

    if (file.size > 1048576) {
      this.screenshotError.set('El archivo es muy grande. Máximo 1MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      if (result.length > 1400000) {
        this.screenshotError.set('El archivo es muy grande. Usa una imagen más pequeña.');
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

      // Collect user email silently from session (not shown to user)
      const userEmail = this.auth.currentUser?.email ?? undefined;

      const payload: FeedbackPayload = {
        type: this.form.type,
        description: this.form.description.trim(),
        screenshot: this.form.screenshot || undefined,
        location: this.form.location,
        userEmail,
      };

      const session = await this.auth.client.auth.getSession();
      const response = await fetch(`${edgeFunctionsBaseUrl}/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': cfg?.supabase?.anonKey || '',
          'Authorization': `Bearer ${session.data.session?.access_token || ''}`,
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error('Demasiadas solicitudes. Espera un momento.');
        }
        throw new Error(result.error || 'Error al enviar');
      }

      this.submitSuccess.set(true);

      setTimeout(() => {
        this.close();
      }, 2000);
    } catch (error: any) {
      this.submitError.set(error.message || 'Error de conexión');
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
