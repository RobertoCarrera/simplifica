import { Component, inject, computed, OnInit, signal, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs/operators';
import { PWAService } from '../../../services/pwa.service';
import { AuthService } from '../../../services/auth.service';
import { DevRoleService } from '../../../services/dev-role.service';
import { SupabaseModulesService, EffectiveModule } from '../../../services/supabase-modules.service';
import { NotificationStore } from '../../../stores/notification.store';

export interface MoreMenuItem {
  id: string;
  label: string;
  icon: string;
  route?: string;
  badge?: number;
  queryParams?: Record<string, any>;
  devOnly?: boolean;
  roleOnly?: 'ownerAdmin' | 'adminOnly';
}

interface NavItem {
  id: string;
  label: string;
  icon: string; // font-awesome or custom icon class
  route?: string; // optional when action-based (e.g. 'more')
  module?: 'core' | 'production' | 'development';
  roleOnly?: 'ownerAdmin' | 'adminOnly';
  action?: 'more' | 'search' | 'notifications';
}

@Component({
  selector: 'app-mobile-bottom-nav',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <ng-container *ngIf="!shouldHideNav()">
      <nav class="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 safe-area-pb z-50 md:hidden" role="navigation" aria-label="Navegación principal móvil">
        <ul class="flex justify-around items-center h-16 px-4 m-0 list-none" role="menubar">
          <li *ngFor="let item of filteredNavItems(); let i = index" class="flex-1 flex justify-center" role="none">
            <button *ngIf="item.action === 'more'" (click)="toggleMoreSheet()" role="menuitem" aria-label="Más opciones"
              class="relative flex flex-col items-center justify-center w-full h-full text-gray-500 dark:text-gray-400 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
              [class.text-blue-600]="showMoreSheet()">
              <i [class]="'fas fa-' + item.icon + ' text-lg mb-1'"></i>
              <span class="text-xs font-medium">{{ item.label }}</span>
            </button>

            <button *ngIf="item.action === 'notifications'" (click)="openNotifications()" role="menuitem" aria-label="Notificaciones"
              class="relative flex flex-col items-center justify-center w-full h-full text-gray-500 dark:text-gray-400 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500">
              <i [class]="'fas fa-' + item.icon + ' text-lg mb-1'"></i>
              <span class="text-xs font-medium">{{ item.label }}</span>
              <span *ngIf="unreadCount() > 0" class="absolute top-1 right-4 bg-red-500 text-white text-[10px] leading-none px-1 py-0.5 rounded-full min-w-[18px] text-center font-semibold">{{ unreadCount() }}</span>
            </button>

            <a *ngIf="!item.action" [routerLink]="item.route" routerLinkActive="active" #rla="routerLinkActive" role="menuitem"
              class="flex flex-col items-center justify-center w-full h-full text-gray-500 dark:text-gray-400 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
              [class]="rla.isActive ? 'text-blue-600 dark:text-blue-400' : 'hover:text-gray-700 dark:hover:text-gray-300'">
              <i [class]="'fas fa-' + item.icon + ' text-lg mb-1'"></i>
              <span class="text-xs font-medium">{{ item.label }}</span>
            </a>
          </li>
        </ul>
      </nav>

      <!-- Bottom Sheet Más (inline) -->
      <div *ngIf="showMoreSheet()" class="fixed inset-0" style="z-index: 6000" aria-modal="true" role="dialog" aria-label="Menú adicional">
        <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" (click)="closeMoreSheet()" aria-hidden="true"></div>
        <div class="absolute left-0 right-0 bottom-0 bg-white dark:bg-[#1e293b] rounded-t-2xl shadow-xl border border-gray-200 dark:border-gray-700 max-h-[70vh] flex flex-col animate-slideUp" style="z-index: 6001">
          <div class="flex items-center justify-between px-5 pt-4 pb-2">
            <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-200">Más opciones</h2>
            <button (click)="closeMoreSheet()" aria-label="Cerrar" class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
              <i class="fas fa-times"></i>
            </button>
          </div>
          <div class="px-3 pb-6 overflow-y-auto flex-1">
            <div class="grid grid-cols-3 gap-2">
              <a *ngFor="let it of moreMenuItems()" [routerLink]="it.route" [queryParams]="it.queryParams" (click)="closeMoreSheet()" class="menu-btn" [attr.aria-label]="it.label">
                <span class="relative">
                  <i [class]="'fas fa-' + it.icon"></i>
                  <span *ngIf="it.badge && it.badge > 0" class="badge">{{ it.badge }}</span>
                </span>
                <span>{{ it.label }}</span>
              </a>
            </div>
          </div>
          <div class="px-5 py-3 border-t border-gray-200 dark:border-gray-800 flex justify-end">
            <button (click)="closeMoreSheet()" class="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">Cerrar</button>
          </div>
        </div>
      </div>
    </ng-container>
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
    .menu-btn { 
      @apply flex flex-col items-center justify-center gap-1 p-3 rounded-xl text-xs text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors; 
      min-height: 64px;
    }
    .menu-btn i { @apply text-base; }
    .badge { @apply absolute -top-1 -right-2 bg-red-500 text-white text-[10px] leading-none px-1 py-0.5 rounded-full min-w-[18px] text-center font-semibold; }
    @keyframes slideUp { from { transform: translateY(20px); opacity:0 } to { transform: translateY(0); opacity:1 } }
    .animate-slideUp { animation: slideUp .25s ease-out; }
  `]
})
export class MobileBottomNavComponent implements OnInit {
  pwaService = inject(PWAService);
  private authService = inject(AuthService);
  private devRoleService = inject(DevRoleService);
  private modulesService = inject(SupabaseModulesService);
  private router = inject(Router);
  private notificationStore = inject(NotificationStore);
  private destroyRef = inject(DestroyRef);

  // Signal to track current route for hiding nav on form pages
  private currentUrl = signal(this.router.url);

  // Routes where the bottom nav should be hidden (form pages that act like full-screen modals)
  private readonly hideOnRoutes = [
    '/presupuestos/new',
    '/presupuestos/edit',
    '/tickets/nuevo',
    '/tickets/editar',
    '/facturacion/new',
    '/facturacion/edit',
    '/clientes/nuevo',
    '/clientes/editar',
    '/servicios/nuevo',
    '/servicios/editar',
  ];

  // Computed signal to determine if nav should be hidden
  shouldHideNav = computed(() => {
    const url = this.currentUrl();
    return this.hideOnRoutes.some(route => url.includes(route));
  });

  // Server-side allowed modules set
  private _allowedModuleKeys = signal<Set<string> | null>(null);

  // Staff primary nav: main items that appear in the bottom bar
  // The 4 most important items + "Más" for overflow
  private baseItems: NavItem[] = [
    { id: 'inicio', label: 'Inicio', icon: 'home', route: '/inicio', module: 'core' },
    { id: 'clientes', label: 'Clientes', icon: 'users', route: '/clientes', module: 'core' },
    { id: 'tickets', label: 'Tickets', icon: 'ticket-alt', route: '/tickets', module: 'production' },
    { id: 'presupuestos', label: 'Presupuestos', icon: 'file-alt', route: '/presupuestos', module: 'production' },
    { id: 'more', label: 'Más', icon: 'ellipsis-h', action: 'more', module: 'core' }
  ];

  // Client portal users bottom nav (simplified): Inicio | Tickets | Más
  private clientItemsBase: NavItem[] = [
    { id: 'inicio', label: 'Inicio', icon: 'home', route: '/inicio', module: 'core' },
    { id: 'tickets', label: 'Tickets', icon: 'ticket-alt', route: '/tickets', module: 'production' },
    { id: 'more', label: 'Más', icon: 'ellipsis-h', action: 'more', module: 'core' }
  ];

  // Sheet state
  readonly showMoreSheet = signal(false);
  readonly unreadCount = this.notificationStore.unreadCount;
  // Public debug accessors for template (so bindings don't reference private fields)
  readonly debugRole = computed(() => this.authService.userRole());
  readonly debugModules = computed(() => {
    const s = this._allowedModuleKeys();
    return s ? Array.from(s) : null;
  });
  // Secondary sheet items derived from role / modules
  moreMenuItems = computed<MoreMenuItem[]>(() => {
    const role = this.authService.userRole();
    const isClient = role === 'client';
    const isDev = this.devRoleService.isDev();
    const isOwnerOrAdmin = role === 'owner' || role === 'admin';
    const allowed = this._allowedModuleKeys();
    const items: MoreMenuItem[] = [];

    if (!isClient) {
      // Módulos de producción (solo si están habilitados)

      // Productos (New)
      if (allowed?.has('moduloProductos')) {
        items.push({ id: 'productos', label: 'Productos', icon: 'box-open', route: '/productos' });
      }

      // Dispositivos (New)
      if (allowed?.has('moduloSAT')) {
        items.push({ id: 'dispositivos', label: 'Dispositivos', icon: 'mobile-alt', route: '/dispositivos' });
      }

      // Servicios
      if (allowed?.has('moduloServicios')) {
        items.push({ id: 'servicios', label: 'Servicios', icon: 'tools', route: '/servicios' });
      }

      // Reservas (New)
      if (allowed?.has('moduloReservas')) {
        items.push({ id: 'reservas', label: 'Reservas', icon: 'calendar-alt', route: '/reservas' });
      }

      // Analíticas (visible para owner/admin/dev)
      if ((isOwnerOrAdmin || isDev) && allowed?.has('moduloAnaliticas')) {
        items.push({ id: 'analytics', label: 'Analíticas', icon: 'chart-line', route: '/analytics' });
      }

      // Facturación (visible para owner/admin/dev)
      if ((isOwnerOrAdmin || isDev) && allowed?.has('moduloFacturas')) {
        items.push({ id: 'facturacion', label: 'Facturación', icon: 'file-invoice-dollar', route: '/facturacion' });
      }

      // Chat (visible para owner/admin/dev Y si moduloChat está habilitado)
      if ((isOwnerOrAdmin || isDev) && allowed?.has('moduloChat')) {
        items.push({ id: 'chat', label: 'Chat', icon: 'comments', route: '/chat' });
      }

      // Webmail (Core)
      items.push({ id: 'webmail', label: 'Webmail', icon: 'envelope', route: '/webmail' });

      // Admin Webmail (Specific role)
      if (role === 'admin' || role === 'super_admin' || isDev) { // Adjusted logic to match sidebar generic admin check roughly
        // Check if they have access to admin webmail route if it exists
        // Sidebar uses roleOnly: 'adminOnlyWebmail'. Assuming admin is enough here or exact role.
        // Let's rely on role === 'admin' as a safe bet for now.
        items.push({ id: 'webmail-admin', label: 'Admin Webmail', icon: 'shield-alt', route: '/webmail-admin', roleOnly: 'adminOnly' });
      }

      // Notificaciones
      items.push({ id: 'notifications', label: 'Notificaciones', icon: 'bell', route: '/inicio', queryParams: { openNotifications: 'true' }, badge: this.unreadCount() });

      // Gestión Módulos (solo admin)
      if (role === 'admin' || role === 'super_admin') {
        items.push({ id: 'modules', label: 'Gestión Módulos', icon: 'sliders-h', route: '/admin/modulos' });
      }

      // Configuración siempre al final
      items.push({ id: 'settings', label: 'Configuración', icon: 'cog', route: '/configuracion' });
    } else {
      // Client specific extra items based on enabled modules
      if (allowed?.has('moduloPresupuestos')) {
        items.push({ id: 'presupuestos', label: 'Presupuestos', icon: 'file-alt', route: '/portal/presupuestos' });
      }
      if (allowed?.has('moduloFacturas')) {
        items.push({ id: 'facturacion', label: 'Facturas', icon: 'file-invoice-dollar', route: '/portal/facturas' });
      }
      if (allowed?.has('moduloServicios')) {
        items.push({ id: 'servicios', label: 'Mis Servicios', icon: 'tools', route: '/portal/servicios' });
      }
      if (allowed?.has('moduloSAT')) {
        items.push({ id: 'dispositivos', label: 'Mis Dispositivos', icon: 'mobile-alt', route: '/portal/dispositivos' });
      }
      items.push(
        { id: 'notifications', label: 'Notificaciones', icon: 'bell', route: '/inicio', queryParams: { openNotifications: 'true' }, badge: this.unreadCount() },
        { id: 'settings', label: 'Configuración', icon: 'cog', route: '/configuracion' },
      );
    }

    // Avoid showing duplicates: remove items that are present in the primary nav
    const renderedItems = this.filteredNavItems();
    const renderedRoutes = new Set(renderedItems.map(i => i.route || i.id));

    return items.filter(it => {
      const r = it.route || it.id;
      return !r || !renderedRoutes.has(r);
    });
  });

  // Computed filtered items honoring role and server-side modules
  filteredNavItems = computed<NavItem[]>(() => {
    const role = this.authService.userRole();
    const isOwnerOrAdmin = role === 'owner' || role === 'admin';
    const isClient = role === 'client';
    const isDev = this.devRoleService.isDev();
    const allowed = this._allowedModuleKeys();

    // Use client items for client role, staff items otherwise
    const base = isClient ? [...this.clientItemsBase] : [...this.baseItems];

    // Filter by module availability
    return base.filter(it => {
      // Core items always visible
      if (it.module === 'core') return true;

      // Development items only for owner/admin/dev
      if (it.module === 'development') return isOwnerOrAdmin || isDev;

      // Production items check against allowed modules
      if (it.module === 'production') {
        if (!allowed) return false; // while loading, hide production entries
        const key = this.routeToModuleKey(it.route || '');
        if (!key) return true;
        return allowed.has(key);
      }

      return true;
    });
  });

  ngOnInit(): void {
    // Debug: print current role on init so we can verify whether clientItemsBase is used
    console.debug('[mobile-bottom-nav] init role=', this.authService.userRole());

    // Subscribe to router navigation events to update currentUrl signal
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((event) => {
      this.currentUrl.set(event.urlAfterRedirects);
    });

    // Load effective modules from server
    this.modulesService.fetchEffectiveModules().subscribe({
      next: (mods: EffectiveModule[]) => {
        const allowed = new Set<string>(mods.filter(m => m.enabled).map(m => m.key));
        this._allowedModuleKeys.set(allowed);
        // Debug: show which module keys arrived for this company/user
        try {
          console.debug('[mobile-bottom-nav] allowed module keys=', Array.from(allowed));
        } catch (e) {
          /* swallow debug error */
        }
      },
      error: (e) => {
        console.warn('No se pudieron cargar los módulos efectivos (mobile-nav):', e);
        this._allowedModuleKeys.set(null);
      }
    });
  }

  toggleMoreSheet(): void {
    this.showMoreSheet.update(v => !v);
  }

  closeMoreSheet(): void { this.showMoreSheet.set(false); }
  openNotifications(): void {
    // Strategy: navigate to home with query param triggering notification center; adapt as needed
    this.router.navigate(['/inicio'], { queryParams: { openNotifications: 'true' } });
  }

  navigateAndClose(route: string): void {
    this.router.navigate([route]);
    this.closeMoreSheet();
  }

  // Map routes to module keys (mirror of sidebar mapping)
  private routeToModuleKey(route: string): string | null {
    switch (route) {
      case '/clientes':
        return 'moduloClientes';
      case '/tickets':
        return 'moduloSAT';
      case '/presupuestos':
      case '/portal/presupuestos':
        return 'moduloPresupuestos';
      case '/servicios':
      case '/portal/servicios':
        return 'moduloServicios';
      case '/productos':
        return 'moduloMaterial';
      case '/facturacion':
      case '/portal/facturas':
        return 'moduloFacturas';
      case '/chat':
        return 'moduloChat';
      default:
        return null;
    }
  }
}
