import { Component, signal, OnChanges, SimpleChanges, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  LucideAngularModule,
  X,
  Bug,
  Lightbulb,
  Camera,
  Upload,
  ChevronDown,
  ChevronUp,
  Send,
  Loader,
} from 'lucide-angular';
import { RuntimeConfigService } from '../../services/runtime-config.service';
import { FeedbackService } from './feedback.service';

interface FeedbackPayload {
  type: 'bug' | 'improvement';
  description: string;
  screenshot?: string;
  location: string;
}

@Component({
  selector: 'app-feedback-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  template: `
    @if (feedbackService.isOpen()) {
      <!-- Floating Panel (bottom-right) -->
      <div
        class="fixed bottom-20 right-4 z-[99999] w-80 rounded-2xl shadow-2xl ring-1 ring-white/10 bg-white dark:bg-gray-900 overflow-hidden transition-all duration-300"
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
              (click)="minimize()"
              class="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              title="Minimizar"
            >
              <lucide-icon name="chevron-down" [size]="16"></lucide-icon>
            </button>
            <button
              type="button"
              (click)="close()"
              class="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              title="Cerrar"
            >
              <lucide-icon name="x" [size]="16"></lucide-icon>
            </button>
          </div>
        </div>

        <!-- Body -->
        <div class="flex flex-col max-h-[60vh]">
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
                <lucide-icon name="bug" [size]="14"></lucide-icon>
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
                <lucide-icon name="lightbulb" [size]="14"></lucide-icon>
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
                      <lucide-icon name="loader" [size]="14" class="animate-spin"></lucide-icon>
                      <span>Capturando...</span>
                    } @else {
                      <lucide-icon name="camera" [size]="14"></lucide-icon>
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
                      <lucide-icon name="upload" [size]="14"></lucide-icon>
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
                <lucide-icon name="send" [size]="12"></lucide-icon>
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
                <lucide-icon name="loader" [size]="14" class="animate-spin"></lucide-icon>
                <span>Enviando...</span>
              } @else {
                <lucide-icon name="send" [size]="14"></lucide-icon>
                <span>Enviar</span>
              }
            </button>
          </div>
        </div>
      </div>

      <!-- FAB (fixed bottom-right) -->
      <button
        type="button"
        (click)="close()"
        class="fixed bottom-4 right-4 z-[99998] w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-xl hover:shadow-2xl flex items-center justify-center transition-all duration-200 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        title="Cerrar feedback"
      >
        <lucide-icon name="x" [size]="22"></lucide-icon>
      </button>
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
      :host {
        display: contents;
      }
      :host > div {
        animation: panel-in 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }
    `,
  ],
})
export class FeedbackModalComponent implements OnChanges {
  feedbackService = inject(FeedbackService);
  private runtimeConfig = inject(RuntimeConfigService);

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

  minimize(): void {
    this.feedbackService.close();
  }

  close(): void {
    this.feedbackService.close();
  }

  async captureScreenshot(): Promise<void> {
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
