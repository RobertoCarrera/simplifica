import { Component, OnInit, inject, signal, HostListener, computed } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { TranslocoService, TranslocoPipe } from '@jsverse/transloco';
import {
  LucideAngularModule,
  LUCIDE_ICONS,
  LucideIconProvider,
  Home,
  Users,
  Ticket,
  MessageCircle,
  FileText,
  Receipt,
  TrendingUp,
  Package,
  Wrench,
  Settings,
  Sparkles,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Smartphone,
  Download,
  FileQuestion,
  FileStack,
  Bell,
  Mail,
  Shield,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Check,
  Building,
  Calendar,
  LayoutGrid,
  Clock,
} from 'lucide-angular';
import { PWAService } from '../../../services/pwa.service';
import { SidebarStateService } from '../../../services/sidebar-state.service';
import { DevRoleService } from '../../../services/dev-role.service';
import { AuthService, LinkedProfessional } from '../../../services/auth.service';
import {
  SupabaseModulesService,
  EffectiveModule,
} from '../../../services/supabase-modules.service';
import { SupabaseSettingsService } from '../../../services/supabase-settings.service';
import { SupabaseNotificationsService } from '../../../services/supabase-notifications.service';
import { SupabasePermissionsService } from '../../../services/supabase-permissions.service';
import { AnalyticsService } from '../../../services/analytics.service';
import { FeedbackService } from '../../feedback/feedback.service';
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
    '[class.mobile-hidden]': '!isOpen() && isMobile()',
  },
  imports: [CommonModule, RouterModule, LucideAngularModule, TranslocoPipe],
  providers: [
    {
      provide: LUCIDE_ICONS,
      useValue: new LucideIconProvider({
        Home,
        Users,
        Ticket,
        MessageCircle,
        FileText,
        Receipt,
        TrendingUp,
        Package,
        Wrench,
        Settings,
        Sparkles,
        HelpCircle,
        ChevronLeft,
        ChevronRight,
        ChevronUp,
        LogOut,
        Smartphone,
        Download,
        FileQuestion,
        FileStack,
        Bell,
        Mail,
        Shield,
        ChevronDown,
        Check,
        Building,
        Calendar,
        LayoutGrid,
        Clock,
        ArrowLeft,
      }),
    },
  ],
  templateUrl: './responsive-sidebar.component.html',
  styleUrls: ['./responsive-sidebar.component.scss'],
})
export class ResponsiveSidebarComponent implements OnInit {
  pwaService = inject(PWAService);
  sidebarState = inject(SidebarStateService);
  private translocoService = inject(TranslocoService);
  
  // Reactive language signal - ensures computed values re-evaluate when language changes
  private currentLang = toSignal(this.translocoService.langChanges$, {
    initialValue: this.translocoService.getActiveLang(),
  });

  // Reactive roles translations - fires when translations load/change, avoids
  // calling translate() synchronously before async files are fetched (bootstrap warning)
  private _rolesTranslations = toSignal(
    this.translocoService.selectTranslateObject('roles'),
    { initialValue: null as Record<string, string> | null }
  );
  
  feedbackService = inject(FeedbackService);

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
      top: `${rect.top + rect.height / 2}px`,
      left: `${rect.right + 10}px`, // 10px offset
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
  private analyticsService = inject(AnalyticsService);

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
    const professionalCompanyIds = new Set(
      this.authService.linkedProfessionals().map((p) => p.company_id)
    );
    const uniqueMap = new Map();
    this.authService.companyMemberships().forEach((m) => {
      // Only hide from "CAMBIAR EMPRESA" if role is purely 'professional' AND has a linked profile.
      // Owners/admins/members keep the company entry even if they also have a professional profile.
      if (professionalCompanyIds.has(m.company_id) && m.role === 'professional') return;
      if (!uniqueMap.has(m.company_id)) {
        uniqueMap.set(m.company_id, {
          id: m.company_id,
          name: m.company?.name || 'Empresa Sin Nombre',
          role: m.role,
          isCurrent: m.company_id === this.authService.currentCompanyId(),
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
    const mem = this.authService.companyMemberships().find((m) => m.company_id === currentId);
    const profile = this.authService.userProfileSignal();
    return mem?.company?.name || profile?.company?.name || this.translocoService.translate('shared.miEmpresa');
  });

  currentCompanyLogo = computed(() => {
    const currentId = this.authService.currentCompanyId();
    const mem = this.authService.companyMemberships().find((m) => m.company_id === currentId);
    return mem?.company?.logo_url;
  });

  currentCompanyColors = computed(() => {
    const currentId = this.authService.currentCompanyId();
    const mem = this.authService.companyMemberships().find((m) => m.company_id === currentId);
    const settings = mem?.company?.settings || {};
    const branding = settings.branding || {};
    return {
      primary: branding.primary_color || branding.primary || settings.primaryColor || '#3B82F6',
      secondary:
        branding.secondary_color || branding.secondary || settings.secondaryColor || '#10B981',
    };
  });

  toggleSwitcher() {
    this.isSwitcherOpen.update((v) => !v);
  }

  selectCompany(companyId: string) {
    this.modulesService.clearCache();
    this.analyticsService.clearSignals();
    this.authService.switchCompany(companyId);
    this.isSwitcherOpen.set(false);
  }

  // Professional Mode
  readonly linkedProfessionals = computed(() => this.authService.linkedProfessionals());
  readonly isInProfessionalMode = computed(() => this.authService.isInProfessionalMode());
  readonly activeProfessionalId = computed(() => this.authService.activeProfessionalId());

  selectProfessionalProfile(professionalId: string) {
    this.authService.switchToProfessionalProfile(professionalId);
    this.isSwitcherOpen.set(false);
  }

  exitProfessionalMode() {
    this.authService.exitProfessionalMode();
    this.isSwitcherOpen.set(false);
  }

  // Computed values from service
  readonly isOpen = this.sidebarState.isOpen;
  readonly isCollapsed = this.sidebarState.isCollapsed;
  // All menu items (productivos, visibles también en desarrollo)
  // Lucide icons para el template
  readonly icons = {
    Home,
    Users,
    Ticket,
    MessageCircle,
    FileText,
    Receipt,
    TrendingUp,
    Package,
    Wrench,
    Settings,
    Sparkles,
    HelpCircle,
    ChevronLeft,
    ChevronRight,
    LogOut,
    Smartphone,
    Download,
    FileQuestion,
    FileStack,
    Bell,
    Mail,
    Shield,
    Calendar,
    LayoutGrid,
  };

  private allMenuItems: MenuItem[] = [
    {
      id: 1,
      label: 'nav.inicio',
      icon: 'home',
      route: '/inicio',
      module: 'core',
    },
    {
      id: 90,
      label: 'nav.notificaciones',
      icon: 'bell',
      route: '/notifications',
      module: 'core',
    },
    {
      id: 2,
      label: 'nav.clientes',
      icon: 'users',
      route: '/clientes',
      module: 'core',
    },
    {
      id: 13,
      label: 'nav.rgpd',
      icon: 'shield',
      route: '/gdpr',
      module: 'core',
      roleOnly: 'ownerAdmin',
    },
    {
      id: 3,
      label: 'nav.dispositivos',
      icon: 'smartphone',
      route: '/dispositivos',
      module: 'production',
      moduleKey: 'moduloSAT', // Linked to SAT/Tickets module
    },
    {
      id: 4,
      label: 'nav.tickets',
      icon: 'ticket',
      route: '/tickets',
      module: 'production',
      moduleKey: 'moduloSAT',
      requiredPermission: ['tickets.view', 'tickets.create'],
    },
    {
      id: 5,
      label: 'nav.chat',
      icon: 'message-circle',
      route: '/chat',
      module: 'production',
      moduleKey: 'moduloChat',
    },
    {
      id: 6,
      label: 'nav.presupuestos',
      icon: 'file-text',
      route: '/presupuestos',
      module: 'production',
      moduleKey: 'moduloPresupuestos',
    },
    {
      id: 7,
      label: 'nav.facturacion',
      icon: 'receipt',
      route: '/facturacion',
      module: 'production',
      moduleKey: 'moduloFacturas',
      requiredPermission: ['invoices.view', 'invoices.create'],
    },
    {
      id: 8,
      label: 'nav.analiticas',
      icon: 'trending-up',
      route: '/analytics',
      module: 'production',
      moduleKey: 'moduloAnaliticas',
    },
    {
      id: 9,
      label: 'nav.productos',
      icon: 'package',
      route: '/productos',
      module: 'production',
      moduleKey: 'moduloProductos',
    },
    {
      id: 10,
      label: 'nav.servicios',
      icon: 'wrench',
      route: '/servicios',
      module: 'production',
      moduleKey: 'moduloServicios',
      // No specific permission needed for "viewing" services? Or maybe 'services.view' (doesn't exist yet, implied?)
      // Assuming 'professional' user access is controlled by module only for now OR implied logic
    },
    {
      id: 11,
      label: 'nav.reservas',
      icon: 'calendar', // Lucide icon
      route: '/reservas',
      module: 'production',
      moduleKey: 'moduloReservas',
      requiredPermission: [
        'bookings.view',
        'bookings.view_own',
        'bookings.manage_own',
        'bookings.manage_all',
      ],
    },
    {
      id: 95,
      label: 'nav.webmail',
      icon: 'mail',
      route: '/webmail',
      module: 'core',
    },
    // id 98 (Configuración) was removed from main nav — moved to footer above Feedback
    {
      id: 97, // New ID for Admin Webmail
      label: 'nav.adminWebmail',
      icon: 'shield', // Using 'shield' icon
      route: '/webmail-admin',
      module: 'core',
      roleOnly: 'adminOnlyWebmail', // Specific role for admin webmail
    },
    {
      id: 12, // Next available ID (after 11)
      label: 'nav.proyectos',
      icon: 'layout-grid', // Use a suitable icon, e.g. layout-grid or similar if available, or 'folder-kanban'
      route: '/projects',
      module: 'production',
      moduleKey: 'moduloProyectos',
    },
    {
      id: 99,
      label: 'nav.gestionModulos',
      icon: 'sparkles',
      route: '/admin/modulos',
      module: 'core',
      roleOnly: 'adminOnly',
    },
    // Emails movido a Configuración > Emails
    // Empresa y Ayuda se integran en Configuración para simplificar el menú
  ];

  // Notification badge kept in a separate computed so that unreadCount changes
  // do NOT re-trigger the heavy menuItems filtering logic.
  notificationBadge = computed(() => this.notificationsService.unreadCount());

  // IDs that carry the notification badge (staff=90, client=2007)
  readonly NOTIFICATION_ITEM_IDS = new Set([90, 2007]);

  // Computed menu items based on user role (does NOT depend on notification count).
  // Core items render immediately. Production items appear once modules load.
  menuItems = computed(() => {
    const userRole = this.authService.userRole();
    const profile = this.authService.userProfile;
    const isSuperAdmin = userRole === 'super_admin' || !!profile?.is_super_admin;
    const isAdmin = userRole === 'admin' || isSuperAdmin;
    const isClient = userRole === 'client';
    const isDev = this.devRoleService.isDev();
    const allowed = this._allowedModuleKeys(); // null = still loading

    // No profile yet (pending/invited user): minimal menu
    if (!profile) {
      return [{ id: 14, label: 'nav.ayuda', icon: 'help-circle', route: '/ayuda', module: 'core' }];
    }

    // Super Admin sees EVERYTHING (bypass module checks)
    if (isSuperAdmin) {
      return [...this.allMenuItems];
    }

    // Client role
    if (isClient) {
      let clientMenu: MenuItem[] = [
        { id: 2000, label: 'nav.inicio', icon: 'home', route: '/inicio', module: 'core' },
        {
          id: 2007,
          label: 'nav.notificaciones',
          icon: 'bell',
          route: '/notifications',
          module: 'core',
        },
        {
          id: 2001,
          label: 'nav.tickets',
          icon: 'ticket',
          route: '/tickets',
          module: 'production',
          moduleKey: 'moduloSAT',
        },
        {
          id: 2002,
          label: 'nav.presupuestos',
          icon: 'file-text',
          route: '/portal/presupuestos',
          module: 'production',
          moduleKey: 'moduloPresupuestos',
        },
        {
          id: 2003,
          label: 'nav.facturas',
          icon: 'receipt',
          route: '/portal/facturas',
          module: 'production',
          moduleKey: 'moduloFacturas',
        },
        {
          id: 2004,
          label: 'nav.servicios',
          icon: 'wrench',
          route: '/portal/servicios',
          module: 'production',
          moduleKey: 'moduloServicios',
        },
        {
          id: 2005,
          label: 'nav.dispositivos',
          icon: 'smartphone',
          route: '/portal/dispositivos',
          module: 'production',
          moduleKey: 'moduloSAT',
        },
        {
          id: 2008,
          label: 'nav.proyectos',
          icon: 'layout-grid',
          route: '/projects',
          module: 'production',
          moduleKey: 'moduloProyectos',
        },
        {
          id: 2009,
          label: 'nav.chat',
          icon: 'message-circle',
          route: '/chat',
          module: 'production',
          moduleKey: 'moduloChat',
        },
        {
          id: 2010,
          label: 'nav.reservas',
          icon: 'calendar',
          route: '/reservas',
          module: 'production',
          moduleKey: 'moduloReservas',
        },
        {
          id: 2006,
          label: 'nav.configuracion',
          icon: 'settings',
          route: '/configuracion',
          module: 'core',
        },
      ];

      // While modules are loading, only show core items.
      // Once loaded, filter production items by allowed modules.
      if (allowed) {
        clientMenu = clientMenu.filter((item) => this.isMenuItemAllowedByModules(item, allowed));
      } else {
        clientMenu = clientMenu.filter((item) => item.module === 'core');
      }
      return clientMenu;
    }

    return this.allMenuItems.filter((item) => {
      // Owner: restrict to specific items only
      if (userRole === 'owner') {
        const ownerAllowedIds = [1, 90, 2, 10, 11];
        if (!ownerAllowedIds.includes(item.id)) return false;
      }

      // Core modules always visible immediately
      if (item.module === 'core') {
        if (item.roleOnly === 'ownerAdmin') {
          return isSuperAdmin || userRole === 'owner' || userRole === 'admin';
        }
        if (item.roleOnly === 'adminOnly') {
          return isAdmin;
        }
        if (item.roleOnly === 'adminOnlyWebmail') {
          return isAdmin;
        }
        return true;
      }

      // Production modules: hide while loading, then filter by allowed
      if (item.module === 'production') {
        if (!allowed) return false; // Still loading — omit, don't block

        // Special case: professional always sees Reservas regardless of module
        if (userRole === 'professional' && item.route === '/reservas') {
          return true;
        }

        if (!allowed.has(item.moduleKey || '')) return false;

        if (item.requiredPermission) {
          const perms = Array.isArray(item.requiredPermission)
            ? item.requiredPermission
            : [item.requiredPermission];
          if (!perms.some((p) => this.permissionsService.hasPermissionSync(p))) return false;
        }
        return true;
      }

      // Development modules only for admin
      if (item.module === 'development') return isAdmin || isDev;

      // Clients permission check for non-admin
      if (item.route === '/clientes' && !isAdmin && !isClient) {
        const canView =
          this.permissionsService.hasPermissionSync('clients.view') ||
          this.permissionsService.hasPermissionSync('clients.view_own');
        if (!canView) return false;
      }

      return true;
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

    // Load modules and permissions in parallel
    this.modulesService.fetchEffectiveModules().subscribe({
      next: (mods: EffectiveModule[]) => {
        this._allowedModuleKeys.set(
          new Set<string>(mods.filter((m) => m.enabled).map((m) => m.key)),
        );
      },
      error: () => {
        this._allowedModuleKeys.set(new Set<string>());
      },
    });

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

  // Computed role display - reactive to user profile and language changes
  userRoleDisplay = computed(() => {
    // Use _rolesTranslations (reactive to load + lang change) instead of translate()
    // to avoid "Missing translation" warnings during app bootstrap, when the async
    // translation file hasn't been fetched yet.
    const roles = this._rolesTranslations();
    const profile = this.authService.userProfileSignal();
    const role = profile?.role || 'member';

    // Translations not yet loaded — return readable Spanish fallback, no warning
    if (!roles) {
      if (profile?.is_super_admin) return 'Super Admin';
      switch (role) {
        case 'super_admin': return 'Super Admin';
        case 'owner':       return 'Propietario';
        case 'admin':       return 'Administrador';
        case 'member':      return 'Miembro';
        case 'client':      return 'Cliente';
        case 'none':        return 'Sin acceso';
        default:            return role;
      }
    }

    if (profile?.is_super_admin) return roles['superAdmin'];
    switch (role) {
      case 'super_admin': return roles['superAdmin'];
      case 'owner':       return roles['propietario'];
      case 'admin':       return roles['administrador'];
      case 'member':      return roles['miembro'];
      case 'client':      return roles['cliente'];
      case 'none':        return roles['sinAcceso'];
      default:            return role;
    }
  });

  getRoleDisplayName(role: string): string {
    // Read currentLang to create reactive dependency on language changes
    this.currentLang();
    
    if (this.authService.userProfile?.is_super_admin)
      return this.translocoService.translate('roles.superAdmin');
    switch (role) {
      case 'super_admin':
        return this.translocoService.translate('roles.superAdmin');
      case 'owner':
        return this.translocoService.translate('roles.propietario');
      case 'admin':
        return this.translocoService.translate('roles.administrador');
      case 'member':
        return this.translocoService.translate('roles.miembro');
      case 'client':
        return this.translocoService.translate('roles.cliente');
      case 'none':
        return this.translocoService.translate('roles.sinAcceso');
      default:
        return role;
    }
  }

  getUserInitial(): string {
    const fullName = this.authService.userProfile?.full_name;
    return fullName ? fullName.charAt(0).toUpperCase() : 'U';
  }

  getUserDisplayName(): string {
    return (
      this.authService.userProfile?.full_name || this.translocoService.translate('shared.usuario')
    );
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
