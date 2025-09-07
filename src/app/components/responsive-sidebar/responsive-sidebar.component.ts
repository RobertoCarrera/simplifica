import { Component, OnInit, inject, signal, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { PWAService } from '../../services/pwa.service';

interface MenuItem {
  id: number;
  label: string;
  icon: string;
  route: string;
  badge?: number;
  children?: MenuItem[];
  module?: string;
}

@Component({
  selector: 'app-responsive-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <!-- Mobile overlay -->
    @if (isOpen() && isMobile()) {
      <div 
        class="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
        (click)="toggleSidebar()"
      ></div>
    }

    <!-- Sidebar -->
    <div 
      class="fixed inset-y-0 left-0 z-50 flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0"
      [class]="getSidebarClasses()"
    >
      <!-- Header -->
      <div class="flex items-center h-16 px-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <!-- Logo area -->
        <div class="flex items-center">
          @if (!isCollapsed()) {
            <div class="flex items-center">
              <div class="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center mr-3">
                <span class="text-white font-bold text-sm">S</span>
              </div>
              <span class="text-xl font-semibold text-gray-900 dark:text-white">Simplifica</span>
            </div>
          } @else {
            <div class="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center mx-auto">
              <span class="text-white font-bold text-sm">S</span>
            </div>
          }
        </div>

        <!-- Toggle button for desktop -->
        @if (!isMobile()) {
          <button
            (click)="toggleCollapse()"
            class="ml-auto p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <i class="bi" [class]="isCollapsed() ? 'bi-chevron-right' : 'bi-chevron-left'"></i>
          </button>
        }
      </div>

      <!-- Navigation -->
      <nav class="flex-1 px-2 py-4 space-y-1 bg-white dark:bg-gray-800 overflow-y-auto">
        @for (item of menuItems; track item.id) {
          <!-- Main menu item -->
          <div class="relative">
            <a
              [routerLink]="item.route"
              routerLinkActive="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-r-2 border-blue-500"
              (click)="setActiveItem(item.id); isMobile() && closeSidebar()"
              class="group flex items-center px-3 py-2 text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white transition-colors duration-200"
              [class.justify-center]="isCollapsed()"
            >
              <i class="{{item.icon}} flex-shrink-0 text-lg" [class.mr-3]="!isCollapsed()"></i>
              
              @if (!isCollapsed()) {
                <span class="truncate">{{item.label}}</span>
                
                @if (item.badge) {
                  <span class="ml-auto inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                    {{item.badge}}
                  </span>
                }
                
                @if (item.children && item.children.length > 0) {
                  <i class="bi bi-chevron-down ml-auto text-xs transform transition-transform duration-200"></i>
                }
              }
            </a>

            <!-- Tooltip for collapsed state -->
            @if (isCollapsed()) {
              <div class="absolute left-full top-0 ml-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none whitespace-nowrap z-50">
                {{item.label}}
                @if (item.badge) {
                  <span class="ml-1 px-1 py-0.5 bg-red-500 rounded-full text-xs">{{item.badge}}</span>
                }
              </div>
            }
          </div>
        }
      </nav>

      <!-- Footer -->
      <div class="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 p-4">
        <!-- Mobile/PWA actions -->
        @if (isMobile() || pwaService.deviceInfo().screenSize === 'sm') {
          <div class="space-y-2">
            <!-- PWA Install button -->
            @if (pwaService.canInstall() && !isCollapsed()) {
              <button
                (click)="installPWA()"
                class="w-full flex items-center px-3 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-md transition-colors"
              >
                <i class="bi bi-download mr-2"></i>
                Instalar App
              </button>
            }
            
            <!-- Mobile dashboard link -->
            <a
              routerLink="/mobile"
              class="flex items-center px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition-colors"
              [class.justify-center]="isCollapsed()"
            >
              <i class="bi bi-phone mr-2"></i>
              @if (!isCollapsed()) {
                <span>Dashboard Móvil</span>
              }
            </a>
          </div>
        }
        
        <!-- User profile -->
        @if (!isCollapsed()) {
          <div class="flex items-center mt-3">
            <div class="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
              <span class="text-white font-medium text-sm">U</span>
            </div>
            <div class="ml-3">
              <p class="text-sm font-medium text-gray-900 dark:text-white">Usuario</p>
              <p class="text-xs text-gray-500 dark:text-gray-400">Admin</p>
            </div>
          </div>
        }
      </div>
    </div>

    <!-- Mobile menu button -->
    @if (isMobile()) {
      <button
        (click)="toggleSidebar()"
        class="fixed top-4 left-4 z-50 p-2 rounded-md bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-700 lg:hidden"
      >
        <i class="bi bi-list text-xl text-gray-600 dark:text-gray-300"></i>
      </button>
    }
  `,
  styles: [`
    .router-link-active {
      @apply bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-r-2 border-blue-500;
    }
  `]
})
export class ResponsiveSidebarComponent implements OnInit {
  pwaService = inject(PWAService);
  private router = inject(Router);

  // Reactive state
  private _isOpen = signal(false);
  private _isCollapsed = signal(false);
  private _activeItem = signal(1);

  // Public signals
  readonly isOpen = this._isOpen.asReadonly();
  readonly isCollapsed = this._isCollapsed.asReadonly();
  readonly activeItem = this._activeItem.asReadonly();

  // Menu items
  menuItems: MenuItem[] = [
    {
      id: 1,
      label: 'Inicio',
      icon: 'bi bi-house',
      route: '/'
    },
    {
      id: 2,
      label: 'Clientes',
      icon: 'bi bi-people',
      route: '/clientes'
    },
    {
      id: 3,
      label: 'Tickets',
      icon: 'bi bi-ticket',
      route: '/tickets',
      badge: 5
    },
    {
      id: 4,
      label: 'Trabajos',
      icon: 'bi bi-tools',
      route: '/trabajos'
    },
    {
      id: 5,
      label: 'Productos',
      icon: 'bi bi-box',
      route: '/productos'
    },
    {
      id: 6,
      label: 'Analytics',
      icon: 'bi bi-graph-up',
      route: '/analytics'
    },
    {
      id: 7,
      label: 'Búsqueda',
      icon: 'bi bi-search',
      route: '/search'
    },
    {
      id: 8,
      label: 'Notificaciones',
      icon: 'bi bi-bell',
      route: '/notifications',
      badge: 3
    },
    {
      id: 9,
      label: 'Workflows',
      icon: 'bi bi-diagram-3',
      route: '/workflows'
    },
    {
      id: 10,
      label: 'Export/Import',
      icon: 'bi bi-arrow-left-right',
      route: '/export-import'
    },
    {
      id: 11,
      label: 'Dashboard Móvil',
      icon: 'bi bi-phone',
      route: '/mobile'
    },
    {
      id: 12,
      label: 'Funciones Avanzadas',
      icon: 'bi bi-stars',
      route: '/advanced-features'
    },
    {
      id: 13,
      label: 'Ayuda',
      icon: 'bi bi-question-circle',
      route: '/onboarding'
    }
  ];

  ngOnInit() {
    // Auto-collapse on mobile
    if (this.isMobile()) {
      this._isCollapsed.set(false);
      this._isOpen.set(false);
    } else {
      // Restore collapsed state from localStorage
      const savedState = localStorage.getItem('sidebar-collapsed');
      if (savedState !== null) {
        this._isCollapsed.set(JSON.parse(savedState));
      }
    }
  }

  @HostListener('window:resize', ['$event'])
  onResize() {
    if (this.isMobile()) {
      this._isCollapsed.set(false);
      this._isOpen.set(false);
    }
  }

  isMobile(): boolean {
    return this.pwaService.isMobileDevice() || window.innerWidth < 1024;
  }

  toggleSidebar() {
    this._isOpen.update(current => !current);
  }

  closeSidebar() {
    this._isOpen.set(false);
  }

  toggleCollapse() {
    if (!this.isMobile()) {
      this._isCollapsed.update(current => {
        const newState = !current;
        localStorage.setItem('sidebar-collapsed', JSON.stringify(newState));
        return newState;
      });
    }
  }

  setActiveItem(itemId: number) {
    this._activeItem.set(itemId);
  }

  getSidebarClasses(): string {
    const baseClasses = 'bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700';
    
    if (this.isMobile()) {
      return `${baseClasses} w-64 ${this.isOpen() ? 'translate-x-0' : '-translate-x-full'}`;
    } else {
      return `${baseClasses} ${this.isCollapsed() ? 'w-16' : 'w-64'}`;
    }
  }

  async installPWA() {
    const success = await this.pwaService.installPWA();
    if (success) {
      this.pwaService.vibrate([200, 100, 200]);
    }
  }
}
