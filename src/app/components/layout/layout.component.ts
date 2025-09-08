import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { ThemeSelectorComponent } from '../theme-selector/theme-selector.component';
import { NotificationBellComponent } from '../notification-bell/notification-bell.component';
import { TourOverlayComponent } from '../tour-overlay/tour-overlay.component';
import { ThemeService } from '../../services/theme.service';
import { AnimationService } from '../../services/animation.service';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, ThemeSelectorComponent, NotificationBellComponent, TourOverlayComponent],
  animations: [
    AnimationService.sidebarCollapse,
    AnimationService.fadeInUp,
    AnimationService.slideInModal
  ],
  template: `
    <div class="flex h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
      <!-- Sidebar -->
      <div class="sidebar shadow-lg border-r border-gray-200 dark:border-gray-700 transition-all duration-300"
           [class]="sidebarCollapsed() ? 'w-16' : 'w-64'"
           [style.background]="getSidebarColor()">
        <div class="p-6">
          <!-- Header with theme toggle -->
          <div class="flex items-center justify-between mb-8">
            <h1 *ngIf="!sidebarCollapsed()" 
                class="text-white text-2xl font-bold">Simplifica CRM</h1>
            <h1 *ngIf="sidebarCollapsed()" 
                class="text-white text-xl font-bold text-center w-full">S</h1>
            
            <!-- Sidebar Toggle Button -->
            <button 
              (click)="toggleSidebar()"
              class="p-2 text-white hover:bg-black hover:bg-opacity-20 rounded-lg transition-colors duration-200"
              [title]="sidebarCollapsed() ? 'Expandir sidebar' : 'Contraer sidebar'">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path *ngIf="!sidebarCollapsed()" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"></path>
                <path *ngIf="sidebarCollapsed()" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M5 5l7 7-7 7"></path>
              </svg>
            </button>
          </div>
          
          <!-- Navigation Menu -->
          <nav class="space-y-2">
            <a routerLink="/clientes" 
               routerLinkActive="active-nav-item"
               class="nav-item group relative"
               [class.collapsed-nav]="sidebarCollapsed()">
               <span class="nav-icon">👥</span>
               <span *ngIf="!sidebarCollapsed()" class="nav-text">Clientes</span>
               <div *ngIf="sidebarCollapsed()" 
                    class="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-sm rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                 Clientes
               </div>
            </a>
            
            <a routerLink="/tickets" 
               routerLinkActive="active-nav-item"
               class="nav-item group relative"
               [class.collapsed-nav]="sidebarCollapsed()">
               <span class="nav-icon">🎫</span>
               <span *ngIf="!sidebarCollapsed()" class="nav-text">Tickets</span>
               <div *ngIf="sidebarCollapsed()" 
                    class="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-sm rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                 Tickets
               </div>
            </a>
            
            <a routerLink="/productos" 
               routerLinkActive="active-nav-item"
               class="nav-item group relative"
               [class.collapsed-nav]="sidebarCollapsed()">
               <span class="nav-icon">📦</span>
               <span *ngIf="!sidebarCollapsed()" class="nav-text">Productos</span>
               <div *ngIf="sidebarCollapsed()" 
                    class="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-sm rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                 Productos
               </div>
            </a>
            
            <a routerLink="/servicios" 
               routerLinkActive="active-nav-item"
               class="nav-item group relative"
               [class.collapsed-nav]="sidebarCollapsed()">
               <span class="nav-icon">🔧</span>
               <span *ngIf="!sidebarCollapsed()" class="nav-text">Servicios</span>
               <div *ngIf="sidebarCollapsed()" 
                    class="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-sm rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                 Servicios
               </div>
            </a>
            
            <!-- Divider -->
            <div *ngIf="!sidebarCollapsed()" class="border-t border-white border-opacity-20 my-4"></div>
            
            <!-- Analytics Dashboard -->
            <a routerLink="/analytics" 
               routerLinkActive="active-nav-item"
               class="nav-item group relative"
               [class.collapsed-nav]="sidebarCollapsed()">
               <span class="nav-icon">📊</span>
               <span *ngIf="!sidebarCollapsed()" class="nav-text">Analytics</span>
               <div *ngIf="sidebarCollapsed()" 
                    class="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-sm rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                 Analytics
               </div>
            </a>
            
            <!-- Advanced Search -->
            <a routerLink="/search" 
               routerLinkActive="active-nav-item"
               class="nav-item group relative"
               [class.collapsed-nav]="sidebarCollapsed()">
               <span class="nav-icon">🔍</span>
               <span *ngIf="!sidebarCollapsed()" class="nav-text">Búsqueda</span>
               <div *ngIf="sidebarCollapsed()" 
                    class="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-sm rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                 Búsqueda
               </div>
            </a>
            
            <!-- Notifications -->
            <a routerLink="/notifications" 
               routerLinkActive="active-nav-item"
               class="nav-item group relative"
               [class.collapsed-nav]="sidebarCollapsed()">
               <span class="nav-icon">🔔</span>
               <span *ngIf="!sidebarCollapsed()" class="nav-text">Notificaciones</span>
               <div *ngIf="sidebarCollapsed()" 
                    class="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-sm rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                 Notificaciones
               </div>
            </a>
            
            <!-- Workflows -->
            <a routerLink="/workflows" 
               routerLinkActive="active-nav-item"
               class="nav-item group relative"
               [class.collapsed-nav]="sidebarCollapsed()">
               <span class="nav-icon">🤖</span>
               <span *ngIf="!sidebarCollapsed()" class="nav-text">Workflows</span>
               <div *ngIf="sidebarCollapsed()" 
                    class="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-sm rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                 Workflows
               </div>
            </a>
            
            <!-- Export/Import -->
            <a routerLink="/export-import" 
               routerLinkActive="active-nav-item"
               class="nav-item group relative"
               [class.collapsed-nav]="sidebarCollapsed()">
               <span class="nav-icon">📁</span>
               <span *ngIf="!sidebarCollapsed()" class="nav-text">Export/Import</span>
               <div *ngIf="sidebarCollapsed()" 
                    class="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-sm rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                 Export/Import
               </div>
            </a>
            
            <!-- Divider -->
            <div *ngIf="!sidebarCollapsed()" class="border-t border-white border-opacity-20 my-4"></div>
            
            <!-- Centro de Onboarding y Ayuda -->
            <a routerLink="/onboarding" 
               routerLinkActive="active-nav-item"
               class="nav-item group relative"
               [class.collapsed-nav]="sidebarCollapsed()">
               <span class="nav-icon">🎓</span>
               <span *ngIf="!sidebarCollapsed()" class="nav-text">Ayuda & Tours</span>
               <div *ngIf="sidebarCollapsed()" 
                    class="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-sm rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                 Ayuda & Tours
               </div>
            </a>
            
            <!-- Advanced Features Dashboard -->
            <a routerLink="/advanced-features" 
               routerLinkActive="active-nav-item"
               class="nav-item group relative"
               [class.collapsed-nav]="sidebarCollapsed()">
               <span class="nav-icon">⭐</span>
               <span *ngIf="!sidebarCollapsed()" class="nav-text">Funciones Avanzadas</span>
               <div *ngIf="sidebarCollapsed()" 
                    class="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-sm rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                 Funciones Avanzadas
               </div>
            </a>
            
            <!-- Divider -->
            <div *ngIf="!sidebarCollapsed()" class="border-t border-white border-opacity-20 my-4"></div>
            
            <!-- Demo Pages -->
            <a routerLink="/demo" 
               routerLinkActive="active-nav-item"
               class="nav-item group relative"
               [class.collapsed-nav]="sidebarCollapsed()">
               <span class="nav-icon">✨</span>
               <span *ngIf="!sidebarCollapsed()" class="nav-text">Demo UX</span>
               <div *ngIf="sidebarCollapsed()" 
                    class="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-sm rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                 Demo UX
               </div>
            </a>
            
            <a routerLink="/notification-demo" 
               routerLinkActive="active-nav-item"
               class="nav-item group relative"
               [class.collapsed-nav]="sidebarCollapsed()">
               <span class="nav-icon">🔔</span>
               <span *ngIf="!sidebarCollapsed()" class="nav-text">Demo Notif</span>
               <div *ngIf="sidebarCollapsed()" 
                    class="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-sm rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                 Demo Notif
               </div>
            </a>
            
            <!-- Divider -->
            <div *ngIf="!sidebarCollapsed()" class="border-t border-white border-opacity-20 my-4"></div>
            
            <!-- Theme Selector Toggle -->
            <button 
              (click)="toggleThemeSelector()"
              class="nav-item group relative w-full text-left"
              [class.collapsed-nav]="sidebarCollapsed()">
              <span class="nav-icon">🎨</span>
              <span *ngIf="!sidebarCollapsed()" class="nav-text">Temas</span>
              <div *ngIf="sidebarCollapsed()" 
                   class="absolute left-full ml-2 px-2 py-1 bg-gray-900 text-white text-sm rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
                Temas
              </div>
            </button>
          </nav>
        </div>
      </div>

      <!-- Main Content -->
      <div class="flex-1 flex flex-col overflow-hidden">
        <!-- Top Bar -->
        <header class="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 transition-colors duration-200">
          <div class="px-6 py-4">
            <div class="flex items-center justify-between">
              <h2 class="text-xl font-semibold text-gray-800 dark:text-white">{{ getPageTitle() }}</h2>
              <div class="flex items-center space-x-4">
                <app-notification-bell></app-notification-bell>
                <span class="text-sm text-gray-600 dark:text-gray-300">{{ getCurrentDate() }}</span>
                <div class="w-8 h-8 bg-gray-300 dark:bg-gray-600 rounded-full flex items-center justify-center">
                  <span class="text-sm font-medium text-gray-600 dark:text-gray-300">👤</span>
                </div>
              </div>
            </div>
          </div>
        </header>

        <!-- Main Content Area -->
        <main class="flex-1 overflow-auto bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
          <router-outlet></router-outlet>
        </main>
      </div>

      <!-- Theme Selector Modal -->
      <div *ngIf="showThemeSelector()" 
           class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
           (click)="toggleThemeSelector()">
        <div class="max-w-md w-full mx-4" (click)="$event.stopPropagation()">
          <app-theme-selector></app-theme-selector>
        </div>
      </div>
    </div>

    <!-- Tour Overlay Global -->
    <app-tour-overlay></app-tour-overlay>
  `,
  styles: [`
    .sidebar {
      transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .nav-item {
      @apply flex items-center px-4 py-3 text-white hover:bg-black hover:bg-opacity-20 rounded-lg transition-all duration-200 cursor-pointer;
    }

    .nav-item.collapsed-nav {
      @apply justify-center px-2;
    }

    .nav-item.active-nav-item {
      @apply bg-white bg-opacity-20 border-r-4 border-white;
    }

    .nav-icon {
      @apply text-lg;
      min-width: 1.5rem;
    }

    .nav-text {
      @apply ml-3 font-medium;
    }

    .collapsed-nav .nav-text {
      @apply hidden;
    }
  `]
})
export class LayoutComponent {
  private themeService = inject(ThemeService);
  
  sidebarCollapsed = signal(false);
  showThemeSelector = signal(false);

  constructor() {
    // Inicializar servicio de temas
    this.themeService.listenToSystemTheme();
  }

  toggleSidebar(): void {
    this.sidebarCollapsed.update(collapsed => !collapsed);
  }

  toggleThemeSelector(): void {
    this.showThemeSelector.update(show => !show);
  }

  getSidebarColor(): string {
    const colorScheme = this.themeService.currentColorScheme();
    const colorMap = {
      orange: 'linear-gradient(135deg, #ea580c 0%, #f97316 100%)',
      blue: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)',
      green: 'linear-gradient(135deg, #16a34a 0%, #22c55e 100%)',
      purple: 'linear-gradient(135deg, #9333ea 0%, #a855f7 100%)',
      red: 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)'
    };
    return colorMap[colorScheme];
  }

  getPageTitle(): string {
    const path = window.location.pathname;
    const titles: {[key: string]: string} = {
      '/clientes': 'Gestión de Clientes',
      '/tickets': 'Tickets de Soporte',
      '/productos': 'Catálogo de Productos',
      '/servicios': 'Servicios',
      '/setup-db': 'Configuración de Base de Datos'
    };
    
    for (const route in titles) {
      if (path.startsWith(route)) {
        return titles[route];
      }
    }
    
    return 'Dashboard';
  }

  getCurrentDate(): string {
    return new Date().toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }
}
