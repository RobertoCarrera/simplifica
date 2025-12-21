import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { PWAService } from '../../../services/pwa.service';
import { PushNotificationService } from '../../../services/push-notification.service';
import { OfflineStorageService } from '../../../services/offline-storage.service';

@Component({
  selector: 'app-mobile-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div class="container mx-auto px-4 py-6">
        
        <!-- Header -->
        <div class="text-center mb-8">
          <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            📱 Experiencia Móvil
          </h1>
          <p class="text-gray-600 dark:text-gray-300">
            Dashboard de funcionalidades PWA y móviles
          </p>
        </div>

        <!-- Device Info Card -->
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-6">
          <h2 class="text-xl font-semibold mb-4 flex items-center">
            <span class="material-icons mr-2 text-blue-500">info</span>
            Información del Dispositivo
          </h2>
          
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <!-- Device Type -->
            <div class="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
              <div class="flex items-center mb-2">
                <span class="material-icons text-blue-500 mr-2" [innerHTML]="getDeviceIcon()"></span>
                <span class="font-medium">Dispositivo</span>
              </div>
              <p class="text-sm text-gray-600 dark:text-gray-300">{{ getDeviceType() }}</p>
            </div>

            <!-- Screen Size -->
            <div class="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-lg">
              <div class="flex items-center mb-2">
                <span class="material-icons text-purple-500 mr-2">aspect_ratio</span>
                <span class="font-medium">Pantalla</span>
              </div>
              <p class="text-sm text-gray-600 dark:text-gray-300">{{ pwaService.deviceInfo().screenSize.toUpperCase() }}</p>
            </div>

            <!-- Connection -->
            <div class="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
              <div class="flex items-center mb-2">
                <div 
                  class="w-3 h-3 rounded-full mr-2"
                  [class]="pwaService.isOnline() ? 'bg-green-500' : 'bg-red-500'"
                ></div>
                <span class="font-medium">Conexión</span>
              </div>
              <p class="text-sm text-gray-600 dark:text-gray-300">
                {{ pwaService.isOnline() ? 'Online' : 'Offline' }}
              </p>
            </div>

            <!-- PWA Status -->
            <div class="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-lg">
              <div class="flex items-center mb-2">
                <span class="material-icons text-orange-500 mr-2">phone_android</span>
                <span class="font-medium">PWA</span>
              </div>
              <p class="text-sm text-gray-600 dark:text-gray-300">
                {{ pwaService.isInstalled() ? 'Instalada' : 'Web' }}
              </p>
            </div>
          </div>
        </div>

        <!-- Features Grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          
          <!-- PWA Installation -->
          <div class="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
            <div class="flex items-center mb-4">
              <div class="w-12 h-12 bg-blue-100 dark:bg-blue-900/20 rounded-lg flex items-center justify-center mr-4">
                <span class="material-icons text-blue-500 text-xl">download</span>
              </div>
              <div>
                <h3 class="font-semibold text-gray-900 dark:text-white">Instalación PWA</h3>
                <p class="text-sm text-gray-600 dark:text-gray-300">App nativa</p>
              </div>
            </div>
            
            @if (pwaService.canInstall()) {
              <button
                (click)="installPWA()"
                class="w-full bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded-lg transition-colors"
              >
                <span class="material-icons mr-2">download</span>
                Instalar Aplicación
              </button>
            } @else if (pwaService.isInstalled()) {
              <div class="text-center py-2">
                <span class="material-icons text-green-500 text-2xl mb-2">check_circle</span>
                <p class="text-sm text-green-600 dark:text-green-400">¡PWA Instalada!</p>
              </div>
            } @else {
              <div class="text-center py-2">
                <p class="text-sm text-gray-600 dark:text-gray-300">No disponible en este navegador</p>
              </div>
            }
          </div>

          <!-- Push Notifications -->
          <div class="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
            <div class="flex items-center mb-4">
              <div class="w-12 h-12 bg-green-100 dark:bg-green-900/20 rounded-lg flex items-center justify-center mr-4">
                <span class="material-icons text-green-500 text-xl">notifications</span>
              </div>
              <div>
                <h3 class="font-semibold text-gray-900 dark:text-white">Notificaciones</h3>
                <p class="text-sm text-gray-600 dark:text-gray-300">Push notifications</p>
              </div>
            </div>
            
            @if (pushService.permission() === 'granted') {
              <div class="space-y-2">
                <button
                  (click)="testNotification()"
                  class="w-full bg-green-500 hover:bg-green-600 text-white py-2 px-4 rounded-lg transition-colors"
                >
                  <span class="material-icons mr-2">notifications</span>
                  Probar Notificación
                </button>
                <button
                  (click)="unsubscribeNotifications()"
                  class="w-full bg-gray-500 hover:bg-gray-600 text-white py-2 px-4 rounded-lg transition-colors text-sm"
                >
                  Desactivar
                </button>
              </div>
            } @else {
              <button
                (click)="enableNotifications()"
                class="w-full bg-green-500 hover:bg-green-600 text-white py-2 px-4 rounded-lg transition-colors"
              >
                <span class="material-icons mr-2">notifications</span>
                Activar Notificaciones
              </button>
            }
          </div>

          <!-- Offline Storage -->
          <div class="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
            <div class="flex items-center mb-4">
              <div class="w-12 h-12 bg-purple-100 dark:bg-purple-900/20 rounded-lg flex items-center justify-center mr-4">
                <span class="material-icons text-purple-500 text-xl">cloud_off</span>
              </div>
              <div>
                <h3 class="font-semibold text-gray-900 dark:text-white">Almacenamiento</h3>
                <p class="text-sm text-gray-600 dark:text-gray-300">Datos offline</p>
              </div>
            </div>
            
            <div class="space-y-2">
              <div class="flex justify-between items-center">
                <span class="text-sm">Acciones pendientes:</span>
                <span class="text-sm font-medium text-orange-600">
                  {{ offlineService.syncStatus().pendingActions }}
                </span>
              </div>
              
              @if (offlineService.hasPendingActions()) {
                <button
                  (click)="syncNow()"
                  [disabled]="!pwaService.isOnline() || offlineService.syncStatus().isSyncing"
                  class="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-gray-400 text-white py-2 px-4 rounded-lg transition-colors"
                >
                  <span class="material-icons" [class.animate-spin]="offlineService.syncStatus().isSyncing">{{ offlineService.syncStatus().isSyncing ? 'sync' : 'cloud_upload' }}</span>
                  {{ offlineService.syncStatus().isSyncing ? 'Sincronizando...' : 'Sincronizar Ahora' }}
                </button>
              } @else {
                <div class="text-center py-2">
                  <span class="material-icons text-green-500 text-lg">check_circle</span>
                  <p class="text-sm text-green-600 dark:text-green-400">Todo sincronizado</p>
                </div>
              }
            </div>
          </div>

        </div>

        <!-- Advanced Features -->
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-6">
          <h2 class="text-xl font-semibold mb-4 flex items-center">
            <span class="material-icons mr-2 text-indigo-500">build</span>
            Funcionalidades Avanzadas
          </h2>
          
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <!-- Share API -->
            <button
              (click)="testShare()"
              class="flex flex-col items-center p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
            >
              <span class="material-icons text-blue-500 text-2xl mb-2">share</span>
              <span class="text-sm font-medium">Compartir</span>
            </button>

            <!-- Vibration -->
            <button
              (click)="testVibration()"
              class="flex flex-col items-center p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
            >
              <span class="material-icons text-purple-500 text-2xl mb-2">vibration</span>
              <span class="text-sm font-medium">Vibración</span>
            </button>

            <!-- Wake Lock -->
            <button
              (click)="toggleWakeLock()"
              class="flex flex-col items-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
            >
              <span class="material-icons text-green-500 text-2xl mb-2">lightbulb</span>
              <span class="text-sm font-medium">Keep Awake</span>
            </button>

            <!-- Cache Management -->
            <button
              (click)="clearCache()"
              class="flex flex-col items-center p-4 bg-red-50 dark:bg-red-900/20 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
            >
              <span class="material-icons text-red-500 text-2xl mb-2">delete</span>
              <span class="text-sm font-medium">Limpiar Cache</span>
            </button>
          </div>
        </div>

        <!-- Quick Actions -->
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
          <h2 class="text-xl font-semibold mb-4 flex items-center">
            <span class="material-icons mr-2 text-yellow-500">flash_on</span>
            Acciones Rápidas
          </h2>
          
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <a
              routerLink="/customers"
              class="flex flex-col items-center p-4 bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all"
            >
              <span class="material-icons text-2xl mb-2">people</span>
              <span class="text-sm font-medium">Clientes</span>
            </a>

            <a
              routerLink="/tickets"
              class="flex flex-col items-center p-4 bg-gradient-to-br from-orange-500 to-orange-600 text-white rounded-lg hover:from-orange-600 hover:to-orange-700 transition-all"
            >
              <span class="material-icons text-2xl mb-2">confirmation_number</span>
              <span class="text-sm font-medium">Tickets</span>
            </a>

            <a
              routerLink="/works"
              class="flex flex-col items-center p-4 bg-gradient-to-br from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 transition-all"
            >
              <span class="material-icons text-2xl mb-2">build</span>
              <span class="text-sm font-medium">Servicios</span>
            </a>

            <a
              routerLink="/products"
              class="flex flex-col items-center p-4 bg-gradient-to-br from-purple-500 to-purple-600 text-white rounded-lg hover:from-purple-600 hover:to-purple-700 transition-all"
            >
              <span class="material-icons text-2xl mb-2">inventory_2</span>
              <span class="text-sm font-medium">Productos</span>
            </a>
          </div>
        </div>

      </div>
    </div>
  `,
  styles: [`
    .animate-spin {
      animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `]
})
export class MobileDashboardComponent implements OnInit {
  pwaService = inject(PWAService);
  pushService = inject(PushNotificationService);
  offlineService = inject(OfflineStorageService);

  private wakeLock: any = null;

  ngOnInit() {
    console.log('📱 Mobile Dashboard initialized');
  }

  getDeviceType(): string {
    const device = this.pwaService.deviceInfo();
    if (device.isMobile) return 'Dispositivo Móvil';
    if (device.isTablet) return 'Tablet';
    return 'Escritorio';
  }

  getDeviceIcon(): string {
    const device = this.pwaService.deviceInfo();
    if (device.isMobile) return 'phone_android';
    if (device.isTablet) return 'tablet';
    return 'computer';
  }

  async installPWA() {
    const success = await this.pwaService.installPWA();
    if (success) {
      this.pwaService.vibrate([200, 100, 200]);
    }
  }

  async enableNotifications() {
    const granted = await this.pushService.requestPermission();
    if (granted) {
      await this.pushService.subscribeToPush();
      this.pwaService.vibrate(200);
    }
  }

  async testNotification() {
    await this.pushService.testNotification();
  }

  async unsubscribeNotifications() {
    await this.pushService.unsubscribeFromPush();
  }

  async syncNow() {
    if (this.pwaService.isOnline()) {
      await this.offlineService.syncPendingActions();
      this.pwaService.vibrate([100, 50, 100]);
    }
  }

  async testShare() {
    const success = await this.pwaService.share({
      title: 'Simplifica CRM',
      text: '¡Mira esta increíble aplicación CRM con PWA!',
      url: window.location.href
    });

    if (success) {
      this.pwaService.vibrate(100);
    } else {
      // Fallback - copy to clipboard
      navigator.clipboard.writeText(window.location.href);
      alert('URL copiada al portapapeles');
    }
  }

  testVibration() {
    const patterns = [
      [200],
      [100, 100, 100],
      [200, 100, 200, 100, 200],
      [50, 50, 50, 50, 50, 50]
    ];

    const randomPattern = patterns[Math.floor(Math.random() * patterns.length)];
    this.pwaService.vibrate(randomPattern);
  }

  async toggleWakeLock() {
    if (this.wakeLock) {
      await this.wakeLock.release();
      this.wakeLock = null;
      alert('Wake lock desactivado');
    } else {
      this.wakeLock = await this.pwaService.requestWakeLock();
      if (this.wakeLock) {
        alert('Wake lock activado - la pantalla no se apagará');
      } else {
        alert('Wake lock no disponible en este dispositivo');
      }
    }
  }

  async clearCache() {
    if (confirm('¿Estás seguro de que quieres limpiar el cache? Esto eliminará todos los datos offline.')) {
      await this.pwaService.clearCache();
      await this.offlineService.clearCache();
      alert('Cache limpiado exitosamente');
      window.location.reload();
    }
  }
}
