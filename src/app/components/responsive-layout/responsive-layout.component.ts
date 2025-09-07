import { Component, inject, signal, HostListener, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ResponsiveSidebarComponent } from '../responsive-sidebar/responsive-sidebar.component';
import { PWAService } from '../../services/pwa.service';
import { SidebarStateService } from '../../services/sidebar-state.service';

@Component({
  selector: 'app-responsive-layout',
  standalone: true,
  imports: [CommonModule, RouterModule, ResponsiveSidebarComponent],
  template: `
    <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
      <!-- Sidebar -->
      <app-responsive-sidebar></app-responsive-sidebar>

      <!-- Main content area -->
      <div class="main-content-area flex flex-col min-h-screen overflow-hidden" [class]="mainAreaClasses()">
        
        <!-- Top navigation bar (mobile) -->
        @if (isMobile()) {
          <div class="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex-shrink-0">
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
                  <svg class="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M8 21h8a1 1 0 001-1V4a1 1 0 00-1-1H8a1 1 0 00-1 1v16a1 1 0 001 1z"/>
                  </svg>
                }
              </div>
            </div>
          </div>
        }

        <!-- Page content -->
        <main class="flex-1 overflow-auto" [class]="getMainContentPadding()">
          <div class="mx-auto" [class]="getContentWidth()">
            <router-outlet></router-outlet>
          </div>
        </main>

        <!-- Bottom navigation (mobile only) -->
        @if (showBottomNav()) {
          <div class="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-4 py-2 z-40 flex-shrink-0">
            <div class="flex justify-around items-center">
              <a
                routerLink="/clientes"
                routerLinkActive="text-blue-500"
                class="flex flex-col items-center py-1 px-2 text-gray-600 dark:text-gray-400 hover:text-blue-500 transition-colors"
              >
                <svg class="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a4 4 0 11-8 0 4 4 0 018 0z"/>
                </svg>
                <span class="text-xs">Clientes</span>
              </a>
              
              <a
                routerLink="/tickets"
                routerLinkActive="text-blue-500"
                class="flex flex-col items-center py-1 px-2 text-gray-600 dark:text-gray-400 hover:text-blue-500 transition-colors relative"
              >
                <svg class="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z"/>
                </svg>
                <span class="text-xs">Tickets</span>
                <!-- Badge -->
                <span class="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">5</span>
              </a>
              
              <a
                routerLink="/trabajos"
                routerLinkActive="text-blue-500"
                class="flex flex-col items-center py-1 px-2 text-gray-600 dark:text-gray-400 hover:text-blue-500 transition-colors"
              >
                <svg class="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>
                <span class="text-xs">Trabajos</span>
              </a>
              
              <a
                routerLink="/mobile"
                routerLinkActive="text-blue-500"
                class="flex flex-col items-center py-1 px-2 text-gray-600 dark:text-gray-400 hover:text-blue-500 transition-colors"
              >
                <svg class="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/>
                </svg>
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
    
    /* CSS puro para layout responsivo */
    .main-content-area {
      margin-left: 16rem !important; /* 256px = w-64 por defecto */
      min-height: 100vh !important;
      transition: margin-left 0.3s ease !important;
    }
    
    .main-content-area.collapsed {
      margin-left: 4rem !important; /* 64px = w-16 cuando está colapsada */
    }
    
    .main-content-area.mobile {
      margin-left: 0 !important; /* Sin margen en móvil */
    }
    
    @media (max-width: 1024px) {
      .main-content-area {
        margin-left: 0 !important; /* Forzar sin margen en pantallas pequeñas */
      }
    }
  `]
})
export class ResponsiveLayoutComponent {
  pwaService = inject(PWAService);
  private sidebarService = inject(SidebarStateService);
  
  private _currentTitle = signal('Dashboard');

  // Computed signal para las clases del área principal con CSS puro
  mainAreaClasses = computed(() => {
    if (this.isMobile()) {
      return 'mobile';
    } else {
      return this.sidebarService.isCollapsed() ? 'collapsed' : '';
    }
  });

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
