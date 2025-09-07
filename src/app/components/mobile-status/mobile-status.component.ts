import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PWAService } from '../../services/pwa.service';
import { PushNotificationService } from '../../services/push-notification.service';
import { OfflineStorageService } from '../../services/offline-storage.service';

@Component({
  selector: 'app-mobile-status',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="fixed bottom-4 right-4 z-50">
      <!-- Status indicator -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-3 min-w-[280px] border border-gray-200 dark:border-gray-700">
        
        <!-- Header -->
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-semibold text-gray-900 dark:text-white text-sm">Estado Móvil</h3>
          <button 
            (click)="toggleExpanded()"
            class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <span class="material-icons">{{ expanded ? 'expand_less' : 'expand_more' }}</span>
          </button>
        </div>

        <!-- Compact view -->
        @if (!expanded) {
          <div class="flex items-center space-x-2">
            <!-- Connection status -->
            <div class="flex items-center">
              <div 
                class="w-2 h-2 rounded-full mr-2"
                [class]="pwaService.isOnline() ? 'bg-green-500' : 'bg-red-500'"
              ></div>
              <span class="text-xs text-gray-600 dark:text-gray-300">
                {{ pwaService.isOnline() ? 'Online' : 'Offline' }}
              </span>
            </div>

            <!-- Pending sync -->
            @if (offlineService.hasPendingActions()) {
              <div class="flex items-center">
                <span class="material-icons text-orange-500 text-xs mr-1">cloud_upload</span>
                <span class="text-xs text-orange-600 dark:text-orange-400">
                  {{ offlineService.syncStatus().pendingActions }}
                </span>
              </div>
            }

            <!-- Device type -->
            <div class="text-xs text-gray-500 dark:text-gray-400">
              {{ getDeviceTypeIcon() }}
            </div>
          </div>
        }

        <!-- Expanded view -->
        @if (expanded) {
          <div class="space-y-3">
            
            <!-- Connection Status -->
            <div class="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded">
              <div class="flex items-center">
                <div 
                  class="w-3 h-3 rounded-full mr-3"
                  [class]="pwaService.isOnline() ? 'bg-green-500' : 'bg-red-500'"
                ></div>
                <span class="text-sm font-medium">Conexión</span>
              </div>
              <span class="text-sm text-gray-600 dark:text-gray-300">
                {{ pwaService.isOnline() ? 'Online' : 'Offline' }}
              </span>
            </div>

            <!-- PWA Status -->
            <div class="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded">
              <div class="flex items-center">
                <span class="material-icons mr-3 text-blue-500">phone_android</span>
                <span class="text-sm font-medium">PWA</span>
              </div>
              <span class="text-sm text-gray-600 dark:text-gray-300">
                {{ pwaService.isInstalled() ? 'Instalada' : 'Web' }}
              </span>
            </div>

            <!-- Device Info -->
            <div class="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded">
              <div class="flex items-center">
                <i class="bi" [class]="getDeviceIcon()" class="mr-3 text-purple-500"></i>
                <span class="text-sm font-medium">Dispositivo</span>
              </div>
              <span class="text-sm text-gray-600 dark:text-gray-300">
                {{ getDeviceType() }}
              </span>
            </div>

            <!-- Sync Status -->
            @if (offlineService.syncStatus().pendingActions > 0) {
              <div class="flex items-center justify-between p-2 bg-orange-50 dark:bg-orange-900/20 rounded border border-orange-200 dark:border-orange-800">
                <div class="flex items-center">
                  <span class="material-icons mr-3 text-orange-500">cloud_upload</span>
                  <span class="text-sm font-medium">Sincronización</span>
                </div>
                <span class="text-sm text-orange-600 dark:text-orange-400">
                  {{ offlineService.syncStatus().pendingActions }} pendientes
                </span>
              </div>
            }

            <!-- Notifications -->
            <div class="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700 rounded">
              <div class="flex items-center">
                <span class="material-icons mr-3 text-green-500">notifications</span>
                <span class="text-sm font-medium">Notificaciones</span>
              </div>
              <span class="text-sm text-gray-600 dark:text-gray-300">
                {{ getNotificationStatus() }}
              </span>
            </div>

            <!-- Action buttons -->
            <div class="flex space-x-2 pt-2 border-t border-gray-200 dark:border-gray-600">
              @if (pwaService.canInstall()) {
                <button
                  (click)="installPWA()"
                  class="flex-1 bg-blue-500 hover:bg-blue-600 text-white text-xs py-2 px-3 rounded-md transition-colors"
                >
                  <span class="material-icons mr-1">download</span>
                  Instalar
                </button>
              }
              
              @if (pushService.permission() !== 'granted') {
                <button
                  (click)="enableNotifications()"
                  class="flex-1 bg-green-500 hover:bg-green-600 text-white text-xs py-2 px-3 rounded-md transition-colors"
                >
                  <span class="material-icons mr-1">notifications</span>
                  Notificar
                </button>
              } @else {
                <button
                  (click)="testNotification()"
                  class="flex-1 bg-gray-500 hover:bg-gray-600 text-white text-xs py-2 px-3 rounded-md transition-colors"
                >
                  <span class="material-icons mr-1">notifications</span>
                  Test
                </button>
              }
              
              @if (offlineService.hasPendingActions()) {
                <button
                  (click)="syncNow()"
                  [disabled]="!pwaService.isOnline() || offlineService.syncStatus().isSyncing"
                  class="flex-1 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-400 text-white text-xs py-2 px-3 rounded-md transition-colors"
                >
                  <span class="material-icons" [class.animate-spin]="offlineService.syncStatus().isSyncing">{{ offlineService.syncStatus().isSyncing ? 'sync' : 'cloud_upload' }}</span>
                  Sync
                </button>
              }
            </div>

          </div>
        }

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
export class MobileStatusComponent implements OnInit {
  pwaService = inject(PWAService);
  pushService = inject(PushNotificationService);
  offlineService = inject(OfflineStorageService);
  
  expanded = false;

  ngOnInit() {
    // Auto-hide on desktop
    if (this.pwaService.deviceInfo().isDesktop && 
        this.pwaService.deviceInfo().screenSize !== 'sm') {
      this.expanded = false;
    }
  }

  toggleExpanded() {
    this.expanded = !this.expanded;
  }

  getDeviceType(): string {
    const device = this.pwaService.deviceInfo();
    if (device.isMobile) return 'Móvil';
    if (device.isTablet) return 'Tablet';
    return 'Escritorio';
  }

  getDeviceTypeIcon(): string {
    const device = this.pwaService.deviceInfo();
    if (device.isMobile) return '📱';
    if (device.isTablet) return '💻';
    return '🖥️';
  }

  getDeviceIcon(): string {
    const device = this.pwaService.deviceInfo();
    if (device.isMobile) return 'phone_android';
    if (device.isTablet) return 'tablet';
    return 'computer';
  }

  getNotificationStatus(): string {
    const permission = this.pushService.permission();
    switch (permission) {
      case 'granted':
        return 'Activas';
      case 'denied':
        return 'Bloqueadas';
      default:
        return 'No configuradas';
    }
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

  async syncNow() {
    if (this.pwaService.isOnline()) {
      await this.offlineService.syncPendingActions();
      this.pwaService.vibrate([100, 50, 100]);
    }
  }
}
