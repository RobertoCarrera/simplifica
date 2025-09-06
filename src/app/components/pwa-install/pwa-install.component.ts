import { Component, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PwaService } from '../../services/pwa/pwa.service';
import { ToastService } from '../../services/toast.service';
import { AnimationService } from '../../services/animation.service';

@Component({
  selector: 'app-pwa-install',
  standalone: true,
  imports: [CommonModule],
  animations: [AnimationService.slideInModal, AnimationService.fadeInUp],
  template: `
    @if (showInstallPrompt()) {
      <div class="fixed bottom-4 left-4 right-4 md:left-auto md:w-80 z-50" @slideInModal>
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 p-4">
          <div class="flex items-start space-x-3">
            <div class="text-2xl">📱</div>
            <div class="flex-1">
              <h3 class="text-sm font-semibold text-gray-900 dark:text-white">
                Instalar Simplifica CRM
              </h3>
              <p class="text-xs text-gray-600 dark:text-gray-400 mt-1">
                Instala la aplicación para acceso rápido y funcionalidad offline
              </p>
              
              <div class="flex items-center space-x-2 mt-3">
                <button 
                  (click)="installApp()"
                  class="flex-1 bg-indigo-600 text-white text-xs font-medium py-2 px-3 rounded-md hover:bg-indigo-700 transition-colors">
                  Instalar
                </button>
                <button 
                  (click)="dismissPrompt()"
                  class="flex-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-medium py-2 px-3 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                  Ahora no
                </button>
              </div>
            </div>
            
            <button 
              (click)="dismissPrompt()"
              class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    }

    @if (pwaService.installed()) {
      <div class="fixed top-4 right-4 z-50" @fadeInUp>
        <div class="bg-green-100 dark:bg-green-900 border border-green-200 dark:border-green-700 rounded-lg p-3">
          <div class="flex items-center space-x-2">
            <div class="text-green-600 dark:text-green-400">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
              </svg>
            </div>
            <span class="text-sm font-medium text-green-800 dark:text-green-200">
              App instalada correctamente
            </span>
          </div>
        </div>
      </div>
    }

    @if (!pwaService.online()) {
      <div class="fixed top-4 left-4 right-4 z-50" @fadeInUp>
        <div class="bg-yellow-100 dark:bg-yellow-900 border border-yellow-200 dark:border-yellow-700 rounded-lg p-3">
          <div class="flex items-center space-x-2">
            <div class="text-yellow-600 dark:text-yellow-400">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"/>
              </svg>
            </div>
            <span class="text-sm font-medium text-yellow-800 dark:text-yellow-200">
              Sin conexión - Modo offline activado
            </span>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    :host {
      display: block;
    }
  `]
})
export class PwaInstallComponent {
  private dismissed = false;

  constructor(
    public pwaService: PwaService,
    private toastService: ToastService
  ) {}

  showInstallPrompt = computed(() => {
    return this.pwaService.installable() && !this.dismissed && !this.pwaService.installed();
  });

  async installApp() {
    try {
      const success = await this.pwaService.installApp();
      if (success) {
        this.toastService.success('PWA', 'Aplicación instalada correctamente');
      } else {
        this.toastService.error('PWA', 'No se pudo instalar la aplicación');
      }
    } catch (error) {
      this.toastService.error('PWA', 'Error durante la instalación');
    }
  }

  dismissPrompt() {
    this.dismissed = true;
  }
}
