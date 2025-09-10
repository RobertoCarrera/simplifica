import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { PWAService } from '../../services/pwa.service';

interface NavItem {
  id: string;
  label: string;
  icon: string;
  route: string;
}

@Component({
  selector: 'app-mobile-bottom-nav',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <!-- Solo mostrar en móvil -->
    @if (pwaService.deviceInfo().screenSize === 'sm' || pwaService.isMobileDevice()) {
      <nav class="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 safe-area-pb z-50">
        <div class="flex justify-around items-center h-16 px-4">
          @for (item of navItems; track item.id) {
            <a
              [routerLink]="item.route"
              routerLinkActive="active"
              #rla="routerLinkActive"
              class="flex flex-col items-center justify-center flex-1 h-full text-gray-500 dark:text-gray-400 transition-colors"
              [class]="rla.isActive ? 'text-blue-600 dark:text-blue-400' : 'hover:text-gray-700 dark:hover:text-gray-300'"
            >
              <i [class]="'fas fa-' + item.icon + ' text-lg mb-1'"></i>
              <span class="text-xs font-medium">{{ item.label }}</span>
            </a>
          }
        </div>
      </nav>
    }
  `,
  styles: [`
    .safe-area-pb {
      padding-bottom: env(safe-area-inset-bottom);
    }
    
    .active {
      color: #2563eb !important;
    }
    
    .dark .active {
      color: #60a5fa !important;
    }
    
    /* Agregar padding bottom al main content cuando esté visible */
    :host {
      display: contents;
    }
  `]
})
export class MobileBottomNavComponent {
  pwaService = inject(PWAService);
  
  navItems: NavItem[] = [
    {
      id: 'clientes',
      label: 'Clientes',
      icon: 'users',
      route: '/clientes'
    },
    {
      id: 'tickets',
      label: 'Tickets',
      icon: 'ticket-alt',
      route: '/tickets'
    },
    {
      id: 'servicios',
      label: 'Servicios',
      icon: 'cogs',
      route: '/servicios'
    },
    {
      id: 'mas',
      label: 'Más',
      icon: 'ellipsis-h',
      route: '/configuracion'
    }
  ];
}
