import { Component, OnInit, inject, signal, HostListener, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { LucideAngularModule, LUCIDE_ICONS, LucideIconProvider, Home, Users, Ticket, MessageCircle, FileText, Receipt, TrendingUp, Package, Wrench, Settings, Sparkles, HelpCircle, ChevronLeft, ChevronRight, LogOut, Smartphone, Download, FileQuestion, FileStack, Bell, Mail, Shield, ChevronDown, Check, Building, Calendar, LayoutGrid } from 'lucide-angular';
import { PWAService } from '../../../services/pwa.service';
import { SidebarStateService } from '../../../services/sidebar-state.service';
import { DevRoleService } from '../../../services/dev-role.service';
import { AuthService } from '../../../services/auth.service';
import { SupabaseModulesService, EffectiveModule } from '../../../services/supabase-modules.service';
import { SupabaseSettingsService } from '../../../services/supabase-settings.service';
import { SupabaseNotificationsService } from '../../../services/supabase-notifications.service';
import { SupabasePermissionsService } from '../../../services/supabase-permissions.service';
import { firstValueFrom } from 'rxjs';

// Menu item shape used by this component
interface MenuItem {
  id: number;
  label: string;
  icon: string;
  route: string;
  badge?: number;
  children?: MenuItem[];
  module?: string; // 'core' | 'production' | 'development'
  moduleKey?: string; // Optional key to check in modules_catalog
  // roleOnly can be used to restrict visibility to specific roles
  roleOnly?: 'ownerAdmin' | 'adminOnly' | 'adminEmployeeClient' | 'adminOnlyWebmail';
  requiredPermission?: string | string[]; // Permission key(s) required (OR logic)
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
  imports: [CommonModule, RouterModule, LucideAngularModule],
  providers: [
    {
      provide: LUCIDE_ICONS,
      useValue: new LucideIconProvider({ Home, Users, Ticket, MessageCircle, FileText, Receipt, TrendingUp, Package, Wrench, Settings, Sparkles, HelpCircle, ChevronLeft, ChevronRight, LogOut, Smartphone, Download, FileQuestion, FileStack, Bell, Mail, Shield, ChevronDown, Check, Building, Calendar, LayoutGrid })
    }
  ],
  templateUrl: './responsive-sidebar.component.html',
  styleUrls: ['./responsive-sidebar.component.scss'],
})
export class ResponsiveSidebarComponent implements OnInit {
  pwaService = inject(PWAService);
  sidebarState = inject(SidebarStateService);

  // Tooltip interaction state
  hoveredItem: any = null;
  tooltipStyle: { top: string; left: string } = { top: '0px', left: '0px' };

  onMouseEnter(event: MouseEvent, item: any) {
    if (!this.isCollapsed()) return;

    // Calculate position based on the target element
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();

    // Position fixed logic
    this.tooltipStyle = {
      top: `${rect.top + (rect.height / 2)}px`,
      left: `${rect.right + 10}px` // 10px offset
    };
    this.hoveredItem = item;
  }

  onMouseLeave() {
    this.hoveredItem = null;
  }
  private router = inject(Router);
  private devRoleService = inject(DevRoleService);
  authService = inject(AuthService); // público para template
  private modulesService = inject(SupabaseModulesService);
  private settingsService = inject(SupabaseSettingsService);
  notificationsService = inject(SupabaseNotificationsService); // Public for template access if needed
  private permissionsService = inject(SupabasePermissionsService);

  // Server-side modules allowed for this user
  private _allowedModuleKeys = signal<Set<string> | null>(null);
  // Loaded flag derived from allowed set presence
  readonly isModulesLoaded = computed(() => this._allowedModuleKeys() !== null);

  // Local state
  private _activeItem = signal(1);
  readonly activeItem = this._activeItem.asReadonly();

  // Company Switcher State
  isSwitcherOpen = signal(false);

  availableCompanies = computed(() => {
    const uniqueMap = new Map();
    this.authService.companyMemberships().forEach(m => {
      if (!uniqueMap.has(m.company_id)) {
        uniqueMap.set(m.company_id, {
          id: m.company_id,
          name: m.company?.name || 'Empresa Sin Nombre',
          role: m.role,
          isCurrent: m.company_id === this.authService.currentCompanyId()
        });
      } else {
        // If already exists, maybe upgrade role if current is 'client' and new is 'owner' etc?
        // For now, simple first-wins or we can implement priority. 
        // Assuming memberships might be ordered or random.
        // Let's just keep the first one found for now to fix the visual bug.
      }
    });
    return Array.from(uniqueMap.values());
  });

  currentCompanyName = computed(() => {
    const currentId = this.authService.currentCompanyId();
    const mem = this.authService.companyMemberships().find(m => m.company_id === currentId);
    return mem?.company?.name || 'Mi Empresa';
  });

  currentCompanyLogo = computed(() => {
    const currentId = this.authService.currentCompanyId();
    const mem = this.authService.companyMemberships().find(m => m.company_id === currentId);
    return mem?.company?.logo_url;
  });

  currentCompanyColors = computed(() => {
    const currentId = this.authService.currentCompanyId();
    const mem = this.authService.companyMemberships().find(m => m.company_id === currentId);
    const settings = mem?.company?.settings || {};
    const branding = settings.branding || {};
    return {
      primary: branding.primary_color || branding.primary || settings.primaryColor || '#3B82F6',
      secondary: branding.secondary_color || branding.secondary || settings.secondaryColor || '#10B981'
    };
  });

  toggleSwitcher() {
    this.isSwitcherOpen.update(v => !v);
  }

  selectCompany(companyId: string) {
    this.authService.switchCompany(companyId);
    this.isSwitcherOpen.set(false);
  }


  // Computed values from service
  readonly isOpen = this.sidebarState.isOpen;
  readonly isCollapsed = this.sidebarState.isCollapsed;
  // All menu items (productivos, visibles también en desarrollo)
  // Lucide icons para el template
  readonly icons = {
    Home, Users, Ticket, MessageCircle, FileText, Receipt, TrendingUp,
    Package, Wrench, Settings, Sparkles, HelpCircle, ChevronLeft,
    ChevronRight, LogOut, Smartphone, Download, FileQuestion, FileStack, Bell, Mail, Shield, Calendar, LayoutGrid
  };

  private allMenuItems: MenuItem[] = [
    {
      id: 1,
      label: 'Inicio',
      icon: 'home',
      route: '/inicio',
      module: 'core'
    },
    {
      id: 90,
      label: 'Notificaciones',
      icon: 'bell',
      route: '/notifications',
      module: 'core'
    },
    {
      id: 2,
      label: 'Clientes',
      icon: 'users',
      route: '/clientes',
      module: 'core'
    },
    {
      id: 3,
      label: 'Dispositivos',
      icon: 'smartphone',
      route: '/dispositivos',
      module: 'production',
      moduleKey: 'moduloSAT' // Linked to SAT/Tickets module
    },
    {
      id: 4,
      label: 'Tickets',
      icon: 'ticket',
      route: '/tickets',
      module: 'production',
      moduleKey: 'moduloSAT',
      requiredPermission: ['tickets.view', 'tickets.create']
    },
    {
      id: 5,
      label: 'Chat',
      icon: 'message-circle',
      route: '/chat',
      module: 'production',
      moduleKey: 'moduloChat'
    },
    {
      id: 6,
      label: 'Presupuestos',
      icon: 'file-text',
      route: '/presupuestos',
      module: 'production',
      moduleKey: 'moduloPresupuestos'
    },
    {
      id: 7,
      label: 'Facturación',
      icon: 'receipt',
      route: '/facturacion',
      module: 'production',
      moduleKey: 'moduloFacturas',
      requiredPermission: ['invoices.view', 'invoices.create']
    },
    {
      id: 8,
      label: 'Analíticas',
      icon: 'trending-up',
      route: '/analytics',
      module: 'production',
      moduleKey: 'moduloAnaliticas'
    },
    {
      id: 9,
      label: 'Productos',
      icon: 'package',
      route: '/productos',
      module: 'production',
      moduleKey: 'moduloProductos'
    },
    {
      id: 10,
      label: 'Servicios',
      icon: 'wrench',
      route: '/servicios',
      module: 'production',
      moduleKey: 'moduloServicios'
      // No specific permission needed for "viewing" services? Or maybe 'services.view' (doesn't exist yet, implied?)
      // Assuming 'professional' user access is controlled by module only for now OR implied logic
    },
    {
      id: 11,
      label: 'Reservas',
      icon: 'calendar', // Lucide icon
      route: '/reservas',
      module: 'production',
      moduleKey: 'moduloReservas',
      requiredPermission: ['bookings.view', 'bookings.view_own', 'bookings.manage_own', 'bookings.manage_all']
    },
    {
      id: 95,
      label: 'Webmail',
      icon: 'mail',
      route: '/webmail',
      module: 'core'
    },
    {
      id: 98,
      label: 'Configuración',
      icon: 'settings',
      route: '/configuracion',
      module: 'core',
      roleOnly: 'adminEmployeeClient' // Adjusted role visibility
    },
    {
      id: 97, // New ID for Admin Webmail
      label: 'Admin Webmail',
      icon: 'shield', // Using 'shield' icon
      route: '/webmail-admin',
      module: 'core',
      roleOnly: 'adminOnlyWebmail' // Specific role for admin webmail
    },
    {
      id: 12, // Next available ID (after 11)
      label: 'Proyectos',
      icon: 'layout-grid', // Use a suitable icon, e.g. layout-grid or similar if available, or 'folder-kanban'
      route: '/projects',
      module: 'production',
      moduleKey: 'moduloProyectos'
    },
    {
      id: 99,
      label: 'Gestión Módulos',
      icon: 'sparkles',
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
    const isAdmin = userRole === 'admin' || userRole === 'super_admin';
    const isClient = userRole === 'client';
    const isDev = this.devRoleService.isDev();
    const allowed = this._allowedModuleKeys();

    console.log('🔍 Menu filtering - Real user role:', userRole, 'Is adminOnly:', isAdmin, 'Is dev:', isDev);

    // Si no hay perfil de app (usuario pendiente/invitado): menú mínimo
    if (!profile) {
      return [
        { id: 14, label: 'Ayuda', icon: 'help-circle', route: '/ayuda', module: 'core' }
      ];
    }

    // Super Admin sees EVERYTHING (bypass module checks)
    const isSuperAdmin = userRole === 'super_admin';
    if (isSuperAdmin) {
      return this.allMenuItems.map(item => {
        if (item.id === 90) return { ...item, badge: this.notificationsService.unreadCount() };
        return item;
      });
    }

    // Client role: show full portal menu with conditional modules
    if (isClient) {
      let clientMenu: MenuItem[] = [
        { id: 2000, label: 'Inicio', icon: 'home', route: '/inicio', module: 'core' },
        { id: 2007, label: 'Notificaciones', icon: 'bell', route: '/notifications', module: 'core', badge: this.notificationsService.unreadCount() },
        { id: 2001, label: 'Tickets', icon: 'ticket', route: '/tickets', module: 'production', moduleKey: 'moduloSAT' },
        { id: 2002, label: 'Presupuestos', icon: 'file-text', route: '/portal/presupuestos', module: 'production', moduleKey: 'moduloPresupuestos' },
        { id: 2003, label: 'Facturas', icon: 'receipt', route: '/portal/facturas', module: 'production', moduleKey: 'moduloFacturas' },
        { id: 2004, label: 'Servicios', icon: 'wrench', route: '/portal/servicios', module: 'production', moduleKey: 'moduloServicios' },
        { id: 2005, label: 'Dispositivos', icon: 'smartphone', route: '/portal/dispositivos', module: 'production', moduleKey: 'moduloSAT' },
        { id: 2008, label: 'Proyectos', icon: 'layout-grid', route: '/projects', module: 'production', moduleKey: 'moduloProyectos' },
        { id: 2009, label: 'Chat', icon: 'message-circle', route: '/chat', module: 'production', moduleKey: 'moduloChat' },
        { id: 2006, label: 'Configuración', icon: 'settings', route: '/configuracion', module: 'core' }
      ];

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
          return userRole === 'owner' || userRole === 'admin' || userRole === 'super_admin';
        }
        if (item.roleOnly === 'adminOnly') {
          return isAdmin;
        }
        if (item.roleOnly === 'adminOnlyWebmail') {
          return isAdmin;
        }
        return true;
      }

      // Production modules: verify active module AND granular permissions
      if (item.module === 'production') {
        if (!allowed || !allowed.has(item.moduleKey || '')) return false;

        // Granular permission check
        if (item.requiredPermission) {
          const perms = Array.isArray(item.requiredPermission) ? item.requiredPermission : [item.requiredPermission];
          const hasPerm = perms.some(p => this.permissionsService.hasPermissionSync(p));
          if (!hasPerm) return false;
        }
        return true;
      }

      // Development modules only for admin (o señal dev explícita)
      if (item.module === 'development') return isAdmin || isDev;

      // Filter Core items that require permissions (e.g. Clients for non-admin)
      if (item.route === '/clientes' && !isAdmin && !isClient) { // Clients (ID 2)
        // Check if user has ANY client view permission
        const canView = this.permissionsService.hasPermissionSync('clients.view') ||
          this.permissionsService.hasPermissionSync('clients.view_own');
        if (!canView) return false;
      }

      // Filter Configuration (ID 98) using permission 'settings.access' for non-admins
      if (item.id === 98 && !isAdmin && !isClient) {
        // Access is now open to all authenticated users (filtered by content tabs)
        return true;
      }

      return true;
    }).map(item => {
      // Inject badge for notifications
      if (item.id === 90) {
        return { ...item, badge: this.notificationsService.unreadCount() };
      }
      return item;
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
        console.log('🔍 Sidebar: Raw fetched modules:', mods);
        const allowed = new Set<string>(mods.filter(m => m.enabled).map(m => m.key));
        console.log('🔍 Sidebar: Allowed module keys:', allowed);
        this._allowedModuleKeys.set(allowed);
      },
      error: (e) => {
        console.warn('No se pudieron cargar los módulos efectivos:', e);
        this._allowedModuleKeys.set(null);
      }
    });

    // Load granular permissions
    this.permissionsService.loadPermissionsMatrix();
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
    if (this.authService.userProfile?.is_super_admin) return 'Super Admin';
    switch (role) {
      case 'super_admin': return 'Super Admin';
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
        return 'moduloProductos';
      case '/facturacion':
      case '/portal/facturas':
        return 'moduloFacturas';
      case '/chat':
        return 'moduloChat';
      case '/projects':
        return 'moduloProyectos';
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
