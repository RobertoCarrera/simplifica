import { Component, OnInit, inject, signal, HostListener, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { PWAService } from '../../services/pwa.service';
import { SidebarStateService } from '../../services/sidebar-state.service';
import { DevRoleService } from '../../services/dev-role.service';
import { AuthService } from '../../services/auth.service';
import { SupabaseModulesService, EffectiveModule } from '../../services/supabase-modules.service';

// Menu item shape used by this component
interface MenuItem {
  id: number;
  label: string;
  icon: string;
  route: string;
  badge?: number;
  children?: MenuItem[];
  module?: string; // 'core' | 'production' | 'development'
  moduleKey?: string; // Optional key to check in modules_catalog (e.g., 'moduloTickets')
  // roleOnly can be used to restrict visibility to specific roles
  roleOnly?: 'ownerAdmin' | 'adminOnly';
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
  templateUrl: './responsive-sidebar.component.html',
  styleUrls: ['./responsive-sidebar.component.scss'],
})
export class ResponsiveSidebarComponent implements OnInit {
  pwaService = inject(PWAService);
  sidebarState = inject(SidebarStateService);
  private router = inject(Router);
  private devRoleService = inject(DevRoleService);
  authService = inject(AuthService); // público para template
  private modulesService = inject(SupabaseModulesService);

  // Server-side modules allowed for this user
  private _allowedModuleKeys = signal<Set<string> | null>(null);
  // Loaded flag derived from allowed set presence
  readonly isModulesLoaded = computed(() => this._allowedModuleKeys() !== null);

  // Local state
  private _activeItem = signal(1);
  readonly activeItem = this._activeItem.asReadonly();

  // Computed values from service
  readonly isOpen = this.sidebarState.isOpen;
  readonly isCollapsed = this.sidebarState.isCollapsed;
  // All menu items (productivos, visibles también en desarrollo)
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
      module: 'core'
    },
    {
      id: 3,
      label: 'Tickets',
      icon: 'confirmation_number',
      route: '/tickets',
      module: 'production',
      moduleKey: 'moduloSAT'
    },
    {
      id: 4,
      label: 'Servicios',
      icon: 'build',
      route: '/servicios',
      module: 'production'
    },
    {
      id: 5,
      label: 'Productos',
      icon: 'inventory_2',
      route: '/productos',
      module: 'production'
    },
    {
      id: 43,
      label: 'Presupuestos',
      icon: 'request_quote',
      route: '/presupuestos',
      module: 'production'
    },
    {
      id: 6,
      label: 'Analíticas',
      icon: 'trending_up',
      route: '/analytics',
      module: 'production',
      moduleKey: 'moduloAnaliticas'
    },
    {
      id: 44,
      label: 'Facturación',
      icon: 'description',
      route: '/facturacion',
      module: 'production'
    },
    {
      id: 41,
      label: 'Chat',
      icon: 'chat',
      route: '/chat',
      module: 'production',
      moduleKey: 'moduloChat'
    },
    {
      id: 13,
      label: 'Configuración',
      icon: 'settings',
      route: '/configuracion',
      module: 'core'
    },
    {
      id: 45,
      label: 'Gestión Módulos',
      icon: 'auto_awesome',
      route: '/admin/modulos',
      module: 'core',
      roleOnly: 'adminOnly'
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
    const allowed = this._allowedModuleKeys();

    console.log('🔍 Menu filtering - Real user role:', userRole, 'Is adminOnly:', isAdmin, 'Is dev:', isDev);

    // Si no hay perfil de app (usuario pendiente/invitado): menú mínimo
    if (!profile) {
      return [
        { id: 1001, label: 'Confirmación', icon: 'auto_awesome', route: '/auth/confirm?pending=1', module: 'core' },
        { id: 14, label: 'Ayuda', icon: 'help_outline', route: '/ayuda', module: 'core' }
      ];
    }

    // Client role: show Tickets, Presupuestos (client portal), Configuración
    if (isClient) {
      // Mostrar módulo de facturas en modo desarrollo únicamente (isDev)
      let clientMenu: MenuItem[] = [
        { id: 2001, label: 'Tickets', icon: 'confirmation_number', route: '/tickets', module: 'production' },
        { id: 2002, label: 'Presupuestos', icon: 'description', route: '/portal/presupuestos', module: 'production' },
        { id: 2003, label: 'Configuración', icon: 'settings', route: '/configuracion', module: 'core' }
      ];

      if (isDev) {
        // Añadir acceso a facturas sólo en entornos de desarrollo
        clientMenu.splice(2, 0, { id: 2004, label: 'Facturas', icon: 'receipt_long', route: '/portal/facturas', module: 'production' });
      }

      // Si tenemos módulos efectivos, filtrar también por ellos
      if (allowed) {
        clientMenu = clientMenu.filter(item => this.isMenuItemAllowedByModules(item, allowed));
      }
      return clientMenu;
    }

    return this.allMenuItems.filter(item => {
      // Core modules always visible
      if (item.module === 'core') {
        if (item.roleOnly === 'ownerAdmin') {
          return userRole === 'owner' || userRole === 'admin';
        }
        if (item.roleOnly === 'adminOnly') {
          return userRole === 'admin';
        }
        return true;
      }
      
      // Production modules: requieren verificación de módulos; si aún no cargaron, ocultar
      if (item.module === 'production') {
        if (!allowed) return false; // ocultar hasta tener decisión
        return this.isMenuItemAllowedByModules(item, allowed);
      }
      
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

    // Cargar módulos efectivos (server-side) y construir set de claves permitidas
    this.modulesService.fetchEffectiveModules().subscribe({
      next: (mods: EffectiveModule[]) => {
        const allowed = new Set<string>(mods.filter(m => m.enabled).map(m => m.key));
        this._allowedModuleKeys.set(allowed);
      },
      error: (e) => {
        console.warn('No se pudieron cargar los módulos efectivos:', e);
        this._allowedModuleKeys.set(null);
      }
    });
  }

  @HostListener('window:resize', ['$event'])
  onResize(_event: Event) {
    if (this.isMobile()) {
      this.sidebarState.setCollapsed(false);
      this.sidebarState.setOpen(false);
    }
  }

  isMobile(): boolean {
    return this.pwaService.isMobileDevice() || window.innerWidth < 768;
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

  // Mapear rutas a claves de módulo (ajustar si cambian rutas)
  private routeToModuleKey(route: string): string | null {
    switch (route) {
      case '/tickets':
        // Tickets module key (can also be specified via item.moduleKey)
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
      case '/chat':
        return 'moduloChat';
      default:
        return null; // elementos sin control por módulo
    }
  }

  private isMenuItemAllowedByModules(item: MenuItem, allowed: Set<string>): boolean {
    // If item has explicit moduleKey, use it directly
    if (item.moduleKey) {
      return allowed.has(item.moduleKey);
    }
    // Otherwise, map route to module key
    const key = this.routeToModuleKey(item.route);
    if (!key) return true; // no requiere gating
    return allowed.has(key);
  }
}
