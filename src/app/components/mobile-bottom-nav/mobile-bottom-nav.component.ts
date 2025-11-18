import { Component, inject, computed, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { PWAService } from '../../services/pwa.service';
import { AuthService } from '../../services/auth.service';
import { DevRoleService } from '../../services/dev-role.service';
import { SupabaseModulesService, EffectiveModule } from '../../services/supabase-modules.service';
import { NotificationService } from '../../services/notification.service';

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
    <ng-container>
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
      <div *ngIf="showMoreSheet()" class="fixed inset-0 z-50" aria-modal="true" role="dialog" aria-label="Menú adicional">
        <div class="absolute inset-0 bg-black/40 backdrop-blur-sm" (click)="closeMoreSheet()" aria-hidden="true"></div>
        <div class="absolute left-0 right-0 bottom-0 bg-white dark:bg-[#1e293b] rounded-t-2xl shadow-xl border border-gray-200 dark:border-gray-700 max-h-[70vh] flex flex-col animate-slideUp">
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
  private notificationService = inject(NotificationService);

  // Server-side allowed modules set
  private _allowedModuleKeys = signal<Set<string> | null>(null);

  // Staff primary nav: restrict to 5 slots: Inicio | Clientes | Facturación | Notificaciones | Configuración/Más
  private baseItems: NavItem[] = [
    { id: 'inicio', label: 'Inicio', icon: 'home', route: '/inicio', module: 'core' },
    { id: 'clientes', label: 'Clientes', icon: 'users', route: '/clientes', module: 'production' },
    { id: 'facturacion', label: 'Facturación', icon: 'file-invoice-dollar', route: '/facturacion', module: 'development' },
    // Notificaciones should be always available in the primary bar
    { id: 'notificaciones', label: 'Notificaciones', icon: 'bell', action: 'notifications', module: 'development' },
    { id: 'settings', label: 'Configuración', icon: 'cog', route: '/configuracion', module: 'core' },
    { id: 'more', label: 'Más', icon: 'ellipsis-h', action: 'more', module: 'core' }
  ];

  // Client portal users bottom nav (simplified): Inicio | Tickets | Presupuestos | Configuración/Más
  private clientItemsBase: NavItem[] = [
    { id: 'inicio', label: 'Inicio', icon: 'home', route: '/inicio', module: 'core' },
    { id: 'tickets', label: 'Tickets', icon: 'ticket-alt', route: '/tickets', module: 'production' },
    { id: 'presupuestos', label: 'Presupuestos', icon: 'file-alt', route: '/portal/presupuestos', module: 'production' },
    { id: 'settings', label: 'Configuración', icon: 'cog', route: '/configuracion', module: 'core' },
    { id: 'more', label: 'Más', icon: 'ellipsis-h', action: 'more', module: 'core' }
  ];

  // Sheet state
  readonly showMoreSheet = signal(false);
  readonly unreadCount = this.notificationService.unreadCount; // currently deprecated service returns 0
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
    const items: MoreMenuItem[] = [];
    if (!isClient) {
      items.push(
        { id: 'chat', label: 'Chat', icon: 'comments', route: '/chat', devOnly: true },
        { id: 'contacts', label: 'Contactos', icon: 'address-book', route: '/anychat/contacts', devOnly: true },
        // Analytics is still in development; hide for non-devs/admins
        { id: 'analytics', label: 'Analíticas', icon: 'chart-line', route: '/analytics', devOnly: true },
        { id: 'search', label: 'Búsqueda', icon: 'search', route: '/search', devOnly: true },
        { id: 'notifications', label: 'Notificaciones', icon: 'bell', route: '/inicio', queryParams: { openNotifications: 'true' }, badge: this.unreadCount() },
        // Workflows & Export/Import are development features for now
        { id: 'workflows', label: 'Workflows', icon: 'project-diagram', route: '/workflows', devOnly: true },
        { id: 'export-import', label: 'Export/Import', icon: 'exchange-alt', route: '/export-import', devOnly: true },
        { id: 'mobile-dashboard', label: 'Dashboard Móvil', icon: 'mobile-alt', route: '/portal', devOnly: true },
        // Advanced features are dev-only
        { id: 'advanced', label: 'Funciones Avanzadas', icon: 'rocket', route: '/advanced-features', devOnly: true },
        // Gestión Módulos should be admin-only
        { id: 'modules', label: 'Gestión Módulos', icon: 'sliders-h', route: '/admin/modulos', roleOnly: 'adminOnly' },
      );
      // If the server enabled client-specific modules for this company, show quick links for them
      const allowed = this._allowedModuleKeys();
      if (allowed) {
        if (allowed.has('moduloSAT')) {
          items.push({ id: 'tickets', label: 'Tickets', icon: 'ticket-alt', route: '/tickets' });
        }
        if (allowed.has('moduloPresupuestos')) {
          items.push({ id: 'presupuestos', label: 'Presupuestos', icon: 'file-alt', route: '/presupuestos' });
        }
        if (allowed.has('moduloServicios')) {
          items.push({ id: 'servicios', label: 'Servicios', icon: 'tools', route: '/servicios' });
        }
      }
      // Configuración siempre al final
      items.push({ id: 'settings', label: 'Configuración', icon: 'cog', route: '/configuracion' });
    } else {
      // Client specific extra items (placeholder for future)
      items.push(
        { id: 'search', label: 'Búsqueda', icon: 'search', route: '/search' },
        { id: 'notifications', label: 'Notificaciones', icon: 'bell', route: '/inicio', queryParams: { openNotifications: 'true' }, badge: this.unreadCount() },
        { id: 'settings', label: 'Configuración', icon: 'cog', route: '/configuracion' },
      );
    }

    // Filter out dev-only items unless user is a dev or an admin
    const afterDevFilter = items.filter(it => !it.devOnly || this.devRoleService.isDev() || role === 'admin');

    // Apply role-only restrictions (owner/admin or admin-only)
    const visible = afterDevFilter.filter(it => {
      if (!it.roleOnly) return true;
      if (it.roleOnly === 'ownerAdmin') return role === 'owner' || role === 'admin';
      if (it.roleOnly === 'adminOnly') return role === 'admin';
      return true;
    });

    // Avoid showing duplicates: remove items that are present in the primary nav (including settings if it's shown)
    // Get the actual rendered items from filteredNavItems
    const renderedItems = this.filteredNavItems();
    const renderedRoutes = renderedItems.map(i => i.route || i.id);

    const filtered = visible.filter(it => {
      const r = it.route || it.id;
      if (!r) return true;
      // Don't show if already rendered in the bottom nav
      if (renderedRoutes.includes(r)) return false;
      return true;
    });

    return filtered;
  });

  // Computed filtered items honoring role and server-side modules
  filteredNavItems = computed<NavItem[]>(() => {
    const role = this.authService.userRole();
    const isAdmin = role === 'admin';
    const isClient = role === 'client';
    const isDev = this.devRoleService.isDev();
    const allowed = this._allowedModuleKeys();
    
    // Start from filtered base items. We treat 'more' and 'settings' as special controls
    let base = isClient ? [...this.clientItemsBase] : [...this.baseItems];
    const morePrototype: NavItem | undefined = base.find(b => b.id === 'more');
    const settingsPrototype: NavItem | undefined = base.find(b => b.id === 'settings');
    
    // Remove both 'more' and 'settings' from base - we'll decide which one to show
    base = base.filter(b => b.id !== 'more' && b.id !== 'settings');

    // Filter base by roleOnly
    base = base.filter(it => {
      if (!it.roleOnly) return true;
      if (it.roleOnly === 'ownerAdmin') return role === 'owner' || role === 'admin';
      if (it.roleOnly === 'adminOnly') return role === 'admin';
      return true;
    });

    // Filter base by module availability
    base = base.filter(it => {
      if (it.module === 'core') return true;
      if (it.module === 'development') return isAdmin || isDev;
      if (!allowed) return false; // while loading, hide production entries
      const key = this.routeToModuleKey(it.route || '');
      if (!key) return true;
      return allowed.has(key);
    });

    const maxSlots = 5;

    // Build promoted items (preserve order) - these should appear before extras and before 'Más'
    const promoted: NavItem[] = [];
    if (!isClient && allowed) {
      if (allowed.has('moduloSAT')) promoted.push({ id: 'tickets', label: 'Tickets', icon: 'ticket-alt', route: '/tickets' });
      if (allowed.has('moduloPresupuestos')) promoted.push({ id: 'presupuestos', label: 'Presupuestos', icon: 'file-alt', route: '/presupuestos' });
      if (allowed.has('moduloServicios')) promoted.push({ id: 'servicios', label: 'Servicios', icon: 'tools', route: '/servicios' });
    }

  // Build extra pool (candidates for More menu, in preferred order)
    const extras: MoreMenuItem[] = [];
    if (!isClient) {
      extras.push(
        { id: 'chat', label: 'Chat', icon: 'comments', route: '/chat', devOnly: true },
        { id: 'contacts', label: 'Contactos', icon: 'address-book', route: '/anychat/contacts', devOnly: true },
        { id: 'analytics', label: 'Analíticas', icon: 'chart-line', route: '/analytics', devOnly: true },
        { id: 'search', label: 'Búsqueda', icon: 'search', route: '/search', devOnly: true },
        { id: 'notifications', label: 'Notificaciones', icon: 'bell', route: '/inicio', queryParams: { openNotifications: 'true' } },
        { id: 'workflows', label: 'Workflows', icon: 'project-diagram', route: '/workflows', devOnly: true },
        { id: 'export-import', label: 'Export/Import', icon: 'exchange-alt', route: '/export-import', devOnly: true },
        { id: 'mobile-dashboard', label: 'Dashboard Móvil', icon: 'mobile-alt', route: '/portal', devOnly: true },
        { id: 'advanced', label: 'Funciones Avanzadas', icon: 'rocket', route: '/advanced-features', devOnly: true },
        { id: 'modules', label: 'Gestión Módulos', icon: 'sliders-h', route: '/admin/modulos', roleOnly: 'adminOnly' },
      );
      // Add module-specific items to extras so they appear in More menu when not in primary bar
      if (allowed) {
        if (allowed.has('moduloSAT')) extras.push({ id: 'tickets', label: 'Tickets', icon: 'ticket-alt', route: '/tickets' });
        if (allowed.has('moduloPresupuestos')) extras.push({ id: 'presupuestos', label: 'Presupuestos', icon: 'file-alt', route: '/presupuestos' });
        if (allowed.has('moduloServicios')) extras.push({ id: 'servicios', label: 'Servicios', icon: 'tools', route: '/servicios' });
      }
      // Configuración siempre al final
      extras.push({ id: 'settings', label: 'Configuración', icon: 'cog', route: '/configuracion' });
    } else {
      extras.push(
        { id: 'search', label: 'Búsqueda', icon: 'search', route: '/search' },
        { id: 'notifications', label: 'Notificaciones', icon: 'bell', route: '/inicio', queryParams: { openNotifications: 'true' } },
        { id: 'settings', label: 'Configuración', icon: 'cog', route: '/configuracion' },
      );
    }

    // Apply visibility filters to extras
    const visibleExtras = extras.filter(it => {
      if (it.devOnly && !(isAdmin || this.devRoleService.isDev())) return false;
      if (it.roleOnly === 'ownerAdmin' && !(role === 'owner' || role === 'admin')) return false;
      if (it.roleOnly === 'adminOnly' && role !== 'admin') return false;
      return true;
    });

    // Build ordered allCandidates (without 'Más' and 'settings'): base (filtered) first, then promoted (avoid duplicates), then visibleExtras (avoid duplicates)
    const allCandidates: NavItem[] = [];
    const pushIfNew = (n: NavItem) => {
      if (!allCandidates.some(a => (a.route && n.route && a.route === n.route) || a.id === n.id)) allCandidates.push(n);
    };

    base.forEach(b => pushIfNew(b as NavItem));
    promoted.forEach(p => pushIfNew(p));
    visibleExtras.forEach(e => pushIfNew(e as NavItem));

    // Decision logic: if all candidates + settings fit, show settings directly
    // Otherwise, show 'Más' button for overflow
    if (allCandidates.length < maxSlots) {
      // We have space: add 'Configuración' directly to the bar
      if (settingsPrototype) {
        allCandidates.push(settingsPrototype);
      }
      return allCandidates;
    }

    // Overflow case: show first (maxSlots - 1) items and add 'Más' as last slot
    const primary = allCandidates.slice(0, maxSlots - 1);
    if (morePrototype) {
      primary.push(morePrototype);
    }
    return primary;
  });

  ngOnInit(): void {
    // Debug: print current role on init so we can verify whether clientItemsBase is used
    console.debug('[mobile-bottom-nav] init role=', this.authService.userRole());

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
    this.router.navigate(['/inicio'], { queryParams: { openNotifications: 'true' }});
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
