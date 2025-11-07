import { Component, inject, computed, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { PWAService } from '../../services/pwa.service';
import { AuthService } from '../../services/auth.service';
import { DevRoleService } from '../../services/dev-role.service';
import { SupabaseModulesService, EffectiveModule } from '../../services/supabase-modules.service';

interface NavItem {
  id: string;
  label: string;
  icon: string;
  route: string;
  module?: 'core' | 'production' | 'development';
  roleOnly?: 'ownerAdmin' | 'adminOnly';
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
          @for (item of filteredNavItems(); track item.id) {
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
export class MobileBottomNavComponent implements OnInit {
  pwaService = inject(PWAService);
  private authService = inject(AuthService);
  private devRoleService = inject(DevRoleService);
  private modulesService = inject(SupabaseModulesService);

  // Server-side allowed modules set
  private _allowedModuleKeys = signal<Set<string> | null>(null);

  // Base items for staff (non-client) users on mobile
  private baseItems: NavItem[] = [
    // Añadimos 'Inicio' al principio para consistencia con el sidebar
    { id: 'inicio', label: 'Inicio', icon: 'home', route: '/inicio', module: 'core' },
    { id: 'clientes', label: 'Clientes', icon: 'users', route: '/clientes', module: 'production' },
    { id: 'tickets', label: 'Tickets', icon: 'ticket-alt', route: '/tickets', module: 'production' },
    { id: 'servicios', label: 'Servicios', icon: 'cogs', route: '/servicios', module: 'production' },
    { id: 'presupuestos', label: 'Presupuestos', icon: 'file-alt', route: '/presupuestos', module: 'production' },
    { id: 'config', label: 'Más', icon: 'ellipsis-h', route: '/configuracion', module: 'core' }
  ];

  // Base items for client users (portal)
  private clientItemsBase: NavItem[] = [
    // Incluir 'Inicio' para clientes también
    { id: 'inicio', label: 'Inicio', icon: 'home', route: '/inicio', module: 'core' },
    { id: 'tickets', label: 'Tickets', icon: 'ticket-alt', route: '/tickets', module: 'production' },
    { id: 'presupuestos', label: 'Presupuestos', icon: 'file-alt', route: '/portal/presupuestos', module: 'production' },
    { id: 'config', label: 'Configuración', icon: 'cog', route: '/configuracion', module: 'core' }
  ];

  // Computed filtered items honoring role and server-side modules
  filteredNavItems = computed<NavItem[]>(() => {
    const role = this.authService.userRole();
    const isAdmin = role === 'admin';
    const isClient = role === 'client';
    const isDev = this.devRoleService.isDev();
    const allowed = this._allowedModuleKeys();

    let items = isClient ? [...this.clientItemsBase] : [...this.baseItems];

    // Filter by roleOnly
    items = items.filter(it => {
      if (!it.roleOnly) return true;
      if (it.roleOnly === 'ownerAdmin') return role === 'owner' || role === 'admin';
      if (it.roleOnly === 'adminOnly') return role === 'admin';
      return true;
    });

    // Filter by module availability
    items = items.filter(it => {
      if (it.module === 'core') return true;
      if (it.module === 'development') return isAdmin || isDev;
      // production modules
      if (!allowed) return true; // while loading, be permissive
      const key = this.routeToModuleKey(it.route);
      if (!key) return true;
      return allowed.has(key);
    });

    // Keep max 4-5 items for compactness on mobile
    return items.slice(0, 5);
  });

  ngOnInit(): void {
    // Load effective modules from server
    this.modulesService.fetchEffectiveModules().subscribe({
      next: (mods: EffectiveModule[]) => {
        const allowed = new Set<string>(mods.filter(m => m.enabled).map(m => m.key));
        this._allowedModuleKeys.set(allowed);
      },
      error: (e) => {
        console.warn('No se pudieron cargar los módulos efectivos (mobile-nav):', e);
        this._allowedModuleKeys.set(null);
      }
    });
  }

  // Map routes to module keys (mirror of sidebar mapping)
  private routeToModuleKey(route: string): string | null {
    switch (route) {
      case '/tickets':
        return 'moduloSat';
      case '/presupuestos':
      case '/portal/presupuestos':
        return 'moduloPresupuestos';
      case '/servicios':
        return 'moduloServicios';
      case '/productos':
        return 'moduloMaterial';
      case '/facturacion':
      case '/portal/facturas':
        return 'moduloFacturas';
      default:
        return null;
    }
  }
}
