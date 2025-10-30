import { Component, OnInit, inject, signal, HostListener, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { PWAService } from '../../services/pwa.service';
import { SidebarStateService } from '../../services/sidebar-state.service';
import { DevRoleService } from '../../services/dev-role.service';
import { AuthService } from '../../services/auth.service';

interface MenuItem {
  id: number;
  label: string;
  icon: string;
  route: string;
  badge?: number;
  children?: MenuItem[];
  module?: string;
  roleOnly?: 'ownerAdmin';
}

@Component({
  selector: 'app-responsive-sidebar',
  standalone: true,
  host: {
    '[class.collapsed]': 'isCollapsed()',
    '[class.expanded]': '!isCollapsed()',
    '[class.mobile-visible]': 'isOpen() && isMobile()',
    '[class.mobile-hidden]': '!isOpen() && isMobile()'
  },
  imports: [CommonModule, RouterModule],
  template: `
    <!-- Mobile overlay -->
    @if (isOpen() && isMobile()) {
      <div 
        class="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
        (click)="closeSidebar()"
      ></div>
    }

    <!-- Sidebar -->
    <div 
      class="flex flex-col h-dvh transition-all duration-300 ease-in-out bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700"
      [class]="getSidebarClasses()"
    >
      <!-- Header -->
      <div class="flex items-center justify-between h-16 px-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <!-- Logo area -->
        <div class="flex items-center flex-1">
          @if (!isCollapsed()) {
            <a routerLink="/inicio" class="flex items-center hover:opacity-80 transition-opacity">
              <div class="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center mr-3">
                <span class="text-white font-bold text-sm">S</span>
              </div>
              <span class="text-xl font-semibold text-gray-900 dark:text-white">Simplifica</span>
            </a>
          } @else {
            <a routerLink="/inicio" class="hover:opacity-80 transition-opacity">
              <div class="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center mx-auto">
                <span class="text-white font-bold text-sm">S</span>
              </div>
            </a>
          }
        </div>

  <!-- Toggle button (big) : visible when sidebar is expanded (all sizes) -->
  @if (!isCollapsed()) {
          <button
            (click)="toggleSidebar()"
            class="flex items-center justify-center w-8 h-8 rounded-lg border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 hover:border-blue-400 dark:hover:border-gray-500 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 shadow-sm hover:shadow-md"
            [title]="isCollapsed() ? 'Expandir sidebar' : 'Colapsar sidebar'"
          >
            <!-- Mostrar chevron hacia la izquierda cuando la sidebar está abierta -->
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
            </svg>
          </button>
        }
      </div>

  <!-- Expand button when collapsed (positioned outside) - visible in all sizes when collapsed -->
  @if (isCollapsed()) {
        <button
          (click)="toggleCollapse()"
          class="sidebar-expand-btn absolute top-4 -right-3 z-50 flex items-center justify-center w-6 h-6 rounded-full border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 hover:border-blue-400 dark:hover:border-gray-500 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 shadow-lg"
          [title]="'Expandir sidebar'"
        >
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
          </svg>
        </button>
      }

  <!-- Navigation -->
  <nav class="flex-1 px-2 py-4 space-y-1 bg-white dark:bg-gray-800 overflow-y-auto overflow-x-hidden">
        @for (item of menuItems(); track item.id) {
          <!-- Main menu item -->
          <div class="relative">
              <a
              [routerLink]="item.route"
              routerLinkActive="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-r-2 border-blue-500"
              (click)="setActiveItem(item.id); isMobile() && closeSidebar()"
              class="group flex items-center text-sm font-medium rounded-md text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white transition-colors duration-200"
              [class.justify-center]="isCollapsed()"
              [class.px-3]="!isCollapsed()"
              [class.px-1]="isCollapsed()"
              [class.py-2]="!isCollapsed()"
              [class.py-1]="isCollapsed()"
            >
            <svg class="flex-shrink-0 w-5 h-5" [class.mr-3]="!isCollapsed()" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              @switch (item.icon) {
                @case ('home') {
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
                }
                @case ('people') {
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a4 4 0 11-8 0 4 4 0 018 0z"/>
                }
                @case ('description') {
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                }
                @case ('confirmation_number') {
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z"/>
                }
                @case ('build') {
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                }
                @case ('inventory_2') {
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10"/>
                }
                @case ('trending_up') {
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>
                }
                @case ('search') {
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                }
                @case ('notifications') {
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-5 5v-5zM12 17H7l5 5v-5z"/>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9z"/>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.73 21a2 2 0 01-3.46 0"/>
                }
                @case ('account_tree') {
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3"/>
                }
                @case ('sync_alt') {
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                }
                @case ('phone_android') {
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M8 21h8a1 1 0 001-1V4a1 1 0 00-1-1H8a1 1 0 00-1 1v16a1 1 0 001 1z"/>
                }
                @case ('auto_awesome') {
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/>
                }
                @default {
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                }
              }
            </svg>
              
              @if (!isCollapsed()) {
                <span class="truncate">{{item.label}}</span>
                
                @if (item.badge) {
                  <span class="ml-auto inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                    {{item.badge}}
                  </span>
                }
                
                @if (item.children && item.children.length > 0) {
                  <i class="fas fa-chevron-down ml-auto text-xs transform transition-transform duration-200"></i>
                }
              }
            </a>

            <!-- Tooltip for collapsed state -->
            @if (isCollapsed()) {
              <div class="absolute left-full top-1/2 transform -translate-y-1/2 ml-3 px-3 py-2 bg-gray-900 dark:bg-gray-700 text-white text-sm rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none whitespace-nowrap z-50 shadow-lg">
                {{item.label}}
                @if (item.badge) {
                  <span class="ml-2 px-2 py-0.5 bg-red-500 rounded-full text-xs">{{item.badge}}</span>
                }
                <!-- Arrow -->
                <div class="absolute left-0 top-1/2 transform -translate-y-1/2 -translate-x-1 w-2 h-2 bg-gray-900 dark:bg-gray-700 rotate-45"></div>
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
                <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
                Instalar App
              </button>
            }
            
            <!-- Mobile dashboard link -->
            <a
              routerLink="/mobile"
              class="flex items-center px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-md transition-colors"
              [class.justify-center]="isCollapsed()"
            >
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M8 21h8a1 1 0 001-1V4a1 1 0 00-1-1H8a1 1 0 00-1 1v16a1 1 0 001 1z"/>
              </svg>
              @if (!isCollapsed()) {
                <span>Dashboard Móvil</span>
              }
            </a>
          </div>
        }
        
        <!-- User profile -->
        @if (!isCollapsed()) {
          <div class="flex items-center justify-between mt-3">
            <div class="flex items-center">
              <div class="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                <span class="text-white font-medium text-sm">{{ getUserInitial() }}</span>
              </div>
              <div class="ml-3">
                <p class="text-sm font-medium text-gray-900 dark:text-white">{{ getUserDisplayName() }}</p>
                <p class="text-xs text-gray-500 dark:text-gray-400">{{ getUserRoleDisplay() }}</p>
              </div>
            </div>
            <!-- Logout button -->
            <button
              (click)="logout()"
              class="p-2 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 transition-colors"
              title="Cerrar sesión"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
              </svg>
            </button>
          </div>
        } @else {
          <!-- Logout button when collapsed -->
          <div class="flex justify-center">
            <button
              (click)="logout()"
              class="p-2 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 transition-colors"
              title="Cerrar sesión"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
              </svg>
            </button>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .router-link-active {
      @apply bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-r-2 border-blue-500;
    }
    
    /* Forzar sidebar fija con CSS puro */
    :host {
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      height: 100vh !important;
      z-index: 1000 !important;
      transition: width 0.3s ease !important;
  overflow: visible !important;
    }
    
    :host(.collapsed) {
      width: 4rem !important; /* 64px = w-16 */
    }
    
    :host(.expanded) {
      width: 16rem !important; /* 256px = w-64 */
    }
    
    :host(.mobile-hidden) {
      transform: translateX(-100%) !important;
    }
    
    :host(.mobile-visible) {
      transform: translateX(0) !important;
    }
    
    /* Prevent horizontal scroll from long labels when collapsed */
    :host(.collapsed) nav {
      overflow-x: hidden !important;
    }

    /* Truncate labels and hide them visually when collapsed */
    :host(.collapsed) .truncate {
      max-width: 0 !important;
      opacity: 0 !important;
      pointer-events: none !important;
      display: inline-block !important;
      transform: translateX(-4px);
    }

    /* Ensure collapsed items have reduced padding so no overflow */
    :host(.collapsed) a {
      padding-left: 0.5rem !important; /* px-2 */
      padding-right: 0.5rem !important;
    }

    /* Small expand button visibility when collapsed */
    :host(.collapsed) .sidebar-expand-btn {
      display: flex !important;
    }

    :host(:not(.collapsed)) .sidebar-expand-btn {
      display: none !important;
    }

    /* Make sure the expand button is visible outside the sidebar edge */
    .sidebar-expand-btn {
      right: -12px; /* nudge outside the sidebar */
      top: 50px;
      box-shadow: 0 6px 16px rgba(15,23,42,0.12);
      z-index: 1100;
    }
  `]
})
export class ResponsiveSidebarComponent implements OnInit {
  pwaService = inject(PWAService);
  sidebarState = inject(SidebarStateService);
  private router = inject(Router);
  private devRoleService = inject(DevRoleService);
  authService = inject(AuthService); // Hacer público para usar en template

  // Local state
  private _activeItem = signal(1);
  readonly activeItem = this._activeItem.asReadonly();

  // Computed values from service
  readonly isOpen = this.sidebarState.isOpen;
  readonly isCollapsed = this.sidebarState.isCollapsed;

  // All menu items
  private allMenuItems: MenuItem[] = [
    {
      id: 1,
      label: 'Inicio',
      icon: 'home',
      route: '/inicio',
      module: 'core'
    },
    {
      id: 2,
      label: 'Clientes',
      icon: 'people',
      route: '/clientes',
      module: 'production'
    },
    {
      id: 16,
      label: 'Presupuestos',
      icon: 'description',
      route: '/presupuestos',
      module: 'development'
    },
    {
      id: 3,
      label: 'Tickets',
      icon: 'confirmation_number',
      route: '/tickets',
      module: 'production'
    },
    {
      id: 4,
      label: 'Servicios',
      icon: 'build',
      route: '/servicios',
      module: 'production'
    },
    {
      id: 41, // Nuevo ID entre servicios y productos
      label: 'Chat',
      icon: 'chat',
      route: '/chat',
      module: 'development'
    },
    {
      id: 42,
      label: 'Contactos',
      icon: 'people',
      route: '/contactos',
      module: 'development'
    },
    {
      id: 5,
      label: 'Productos',
      icon: 'inventory_2',
      route: '/productos',
      module: 'production'
    },
    {
      id: 6,
      label: 'Analytics',
      icon: 'trending_up',
      route: '/analytics',
      module: 'development'
    },
    {
      id: 7,
      label: 'Búsqueda',
      icon: 'search',
      route: '/search',
      module: 'development'
    },
    {
      id: 8,
      label: 'Notificaciones',
      icon: 'notifications',
      route: '/notifications',
      badge: 3,
      module: 'development'
    },
    {
      id: 9,
      label: 'Workflows',
      icon: 'account_tree',
      route: '/workflows',
      module: 'development'
    },
    {
      id: 10,
      label: 'Export/Import',
      icon: 'sync_alt',
      route: '/export-import',
      module: 'development'
    },
    {
      id: 11,
      label: 'Dashboard Móvil',
      icon: 'phone_android',
      route: '/mobile',
      module: 'development'
    },
    {
      id: 12,
      label: 'Funciones Avanzadas',
      icon: 'auto_awesome',
      route: '/advanced-features',
      module: 'development'
    },
    {
      id: 13,
      label: 'Configuración',
      icon: 'settings',
      route: '/configuracion',
      module: 'core'
    },
    // Empresa y Ayuda se integran en Configuración para simplificar el menú
  ];

  // Computed menu items based on user role
  menuItems = computed(() => {
    const userRole = this.authService.userRole();
    const profile = this.authService.userProfile;
    const isAdmin = userRole === 'admin';
    const isClient = userRole === 'client';
    const isDev = this.devRoleService.isDev();

    console.log('🔍 Menu filtering - Real user role:', userRole, 'Is adminOnly:', isAdmin, 'Is dev:', isDev);

    // Si no hay perfil de app (usuario pendiente/invitado): menú mínimo
    if (!profile) {
      return [
        { id: 1001, label: 'Confirmación', icon: 'auto_awesome', route: '/auth/confirm?pending=1', module: 'core' },
        { id: 14, label: 'Ayuda', icon: 'help_outline', route: '/ayuda', module: 'core' }
      ];
    }

    // Client role: restrict to Inicio, Tickets, Configuración
    if (isClient) {
      const allowedRoutes = new Set<string>(['/', '/tickets', '/configuracion']);
      return this.allMenuItems.filter(item => allowedRoutes.has(item.route));
    }

    return this.allMenuItems.filter(item => {
      // Core modules always visible
      if (item.module === 'core') {
        if (item.roleOnly === 'ownerAdmin') {
          return userRole === 'owner' || userRole === 'admin';
        }
        return true;
      }
      
      // Production modules for everyone
      if (item.module === 'production') return true;
      
  // Development modules only for admin (o señal dev explícita)
  if (item.module === 'development') return isAdmin || isDev;
      
      return false;
    });
  });

  ngOnInit() {
    // Auto-collapse on mobile
    if (this.isMobile()) {
      this.sidebarState.setCollapsed(false);
      this.sidebarState.setOpen(false);
    } else {
      // Restore collapsed state from localStorage
      this.sidebarState.loadSavedState();
    }
  }

  @HostListener('window:resize', ['$event'])
  onResize() {
    if (this.isMobile()) {
      this.sidebarState.setCollapsed(false);
      this.sidebarState.setOpen(false);
    }
  }

  isMobile(): boolean {
    return this.pwaService.isMobileDevice() || window.innerWidth < 1024;
  }

  toggleSidebar() {
    if (this.isMobile()) {
      // En mobile: abrir/cerrar completamente
      this.sidebarState.toggleOpen();
    } else {
      // En desktop: colapsar/expandir
      this.sidebarState.toggleCollapse();
    }
  }

  closeSidebar() {
    this.sidebarState.setOpen(false);
  }

  toggleCollapse() {
    if (!this.isMobile()) {
      this.sidebarState.toggleCollapse();
    }
  }

  setActiveItem(itemId: number) {
    this._activeItem.set(itemId);
  }

  getSidebarClasses(): string {
    if (this.isMobile()) {
      return this.isOpen() ? 'mobile-visible' : 'mobile-hidden';
    } else {
      return this.isCollapsed() ? 'collapsed' : 'expanded';
    }
  }

  async installPWA() {
    const success = await this.pwaService.installPWA();
    if (success) {
      this.pwaService.vibrate([200, 100, 200]);
    }
  }

  getRoleDisplayName(role: string): string {
    switch (role) {
      case 'owner': return 'Propietario';
      case 'admin': return 'Administrador';
      case 'member': return 'Miembro';
      case 'client': return 'Cliente';
      case 'none': return 'Sin acceso';
      default: return role;
    }
  }

  getUserInitial(): string {
    const fullName = this.authService.userProfile?.full_name;
    return fullName ? fullName.charAt(0).toUpperCase() : 'U';
  }

  getUserDisplayName(): string {
    return this.authService.userProfile?.full_name || 'Usuario';
  }

  getUserRoleDisplay(): string {
    const role = this.authService.userProfile?.role || 'member';
    return this.getRoleDisplayName(role);
  }

  async logout(): Promise<void> {
    try {
      await this.authService.logout();
      this.router.navigate(['/login']);
    } catch (error) {
      console.error('Error durante logout:', error);
    }
  }
}
