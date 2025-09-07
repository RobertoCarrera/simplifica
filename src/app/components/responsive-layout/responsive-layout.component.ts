import { Component, inject, signal, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ResponsiveSidebarComponent } from '../responsive-sidebar/responsive-sidebar.component';
import { PWAService } from '../../services/pwa.service';

@Component({
  selector: 'app-responsive-layout',
  standalone: true,
  imports: [CommonModule, RouterModule, ResponsiveSidebarComponent],
  template: `
    <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
      <!-- Sidebar -->
      <app-responsive-sidebar></app-responsive-sidebar>

      <!-- Main content area -->
      <div class="flex-1" [class]="getMainContentClasses()">
        
        <!-- Top navigation bar (mobile) -->
        @if (isMobile()) {
          <div class="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 px-4 py-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center ml-12"> <!-- Offset for mobile menu button -->
                <h1 class="text-lg font-semibold text-gray-900 dark:text-white">
                  {{ getCurrentPageTitle() }}
                </h1>
              </div>
              
              <!-- Mobile actions -->
              <div class="flex items-center space-x-2">
                <!-- Connection status -->
                <div class="flex items-center">
                  <div 
                    class="w-2 h-2 rounded-full"
                    [class]="pwaService.isOnline() ? 'bg-green-500' : 'bg-red-500'"
                  ></div>
                </div>
                
                <!-- PWA status -->
                @if (pwaService.isInstalled()) {
                  <i class="bi bi-phone text-blue-500 text-sm"></i>
                }
              </div>
            </div>
          </div>
        }

        <!-- Page content -->
        <main class="flex-1" [class]="getMainContentPadding()">
          <div class="mx-auto" [class]="getContentWidth()">
            <router-outlet></router-outlet>
          </div>
        </main>

        <!-- Bottom navigation (mobile only) -->
        @if (showBottomNav()) {
          <div class="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-4 py-2 z-40">
            <div class="flex justify-around items-center">
              <a
                routerLink="/clientes"
                routerLinkActive="text-blue-500"
                class="flex flex-col items-center py-1 px-2 text-gray-600 dark:text-gray-400 hover:text-blue-500 transition-colors"
              >
                <i class="bi bi-people text-xl mb-1"></i>
                <span class="text-xs">Clientes</span>
              </a>
              
              <a
                routerLink="/tickets"
                routerLinkActive="text-blue-500"
                class="flex flex-col items-center py-1 px-2 text-gray-600 dark:text-gray-400 hover:text-blue-500 transition-colors relative"
              >
                <i class="bi bi-ticket text-xl mb-1"></i>
                <span class="text-xs">Tickets</span>
                <!-- Badge -->
                <span class="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">5</span>
              </a>
              
              <a
                routerLink="/trabajos"
                routerLinkActive="text-blue-500"
                class="flex flex-col items-center py-1 px-2 text-gray-600 dark:text-gray-400 hover:text-blue-500 transition-colors"
              >
                <i class="bi bi-tools text-xl mb-1"></i>
                <span class="text-xs">Trabajos</span>
              </a>
              
              <a
                routerLink="/mobile"
                routerLinkActive="text-blue-500"
                class="flex flex-col items-center py-1 px-2 text-gray-600 dark:text-gray-400 hover:text-blue-500 transition-colors"
              >
                <i class="bi bi-grid text-xl mb-1"></i>
                <span class="text-xs">Más</span>
              </a>
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .router-link-active {
      @apply text-blue-500;
    }
  `]
})
export class ResponsiveLayoutComponent {
  pwaService = inject(PWAService);
  
  private _currentTitle = signal('Dashboard');

  @HostListener('window:resize', ['$event'])
  onResize() {
    // Trigger change detection on resize
  }

  isMobile(): boolean {
    return this.pwaService.isMobileDevice() || window.innerWidth < 1024;
  }

  showBottomNav(): boolean {
    return this.isMobile() && this.pwaService.deviceInfo().screenSize === 'sm';
  }

  getMainContentClasses(): string {
    if (this.isMobile()) {
      return 'flex flex-col min-h-screen';
    }
    return 'lg:ml-64 flex flex-col min-h-screen'; // Default desktop margin for sidebar
  }

  getMainContentPadding(): string {
    const bottomPadding = this.showBottomNav() ? 'pb-16' : 'pb-4'; // Space for bottom nav
    return `p-4 lg:p-6 ${bottomPadding}`;
  }

  getContentWidth(): string {
    const screenSize = this.pwaService.deviceInfo().screenSize;
    
    switch (screenSize) {
      case 'sm':
        return 'max-w-full'; // Full width on small screens
      case 'md':
        return 'max-w-4xl'; // Constrained on medium screens
      case 'lg':
        return 'max-w-6xl'; // More space on large screens
      case 'xl':
        return 'max-w-7xl'; // Maximum space on extra large screens
      default:
        return 'max-w-6xl';
    }
  }

  getCurrentPageTitle(): string {
    // This would ideally come from a service or router data
    const path = window.location.pathname;
    
    const titleMap: { [key: string]: string } = {
      '/': 'Dashboard',
      '/clientes': 'Clientes',
      '/customers': 'Clientes',
      '/tickets': 'Tickets',
      '/trabajos': 'Trabajos',
      '/works': 'Trabajos',
      '/productos': 'Productos',
      '/products': 'Productos',
      '/analytics': 'Analytics',
      '/search': 'Búsqueda',
      '/notifications': 'Notificaciones',
      '/workflows': 'Workflows',
      '/export-import': 'Export/Import',
      '/advanced-features': 'Funciones Avanzadas',
      '/onboarding': 'Ayuda',
      '/mobile': 'Dashboard Móvil'
    };

    return titleMap[path] || 'Simplifica CRM';
  }
}
