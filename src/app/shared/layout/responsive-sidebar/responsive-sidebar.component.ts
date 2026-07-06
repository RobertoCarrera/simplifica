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
  Megaphone,
  Shield,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Check,
  Building,
  Calendar,
  LayoutGrid,
  Clock,
  Star,
  BookOpen,
  ClipboardCheck,
  Activity,
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
import { MailStoreService } from '../../../features/webmail/services/mail-store.service';
import { firstValueFrom, fromEvent, map, startWith } from 'rxjs';
import { SidebarFloatingTooltipComponent } from './components/sidebar-floating-tooltip/sidebar-floating-tooltip.component';
import { SidebarFooterLinksComponent } from './components/sidebar-footer-links/sidebar-footer-links.component';
import { SidebarMobileOverlayComponent } from './components/sidebar-mobile-overlay/sidebar-mobile-overlay.component';
import {
  MenuItem,
  ALL_NAV_ITEMS,
  WEBMAIL_ITEM_ID,
  NOTIFICATION_ITEM_IDS,
  isMenuItemAllowedByModules,
} from './data/sidebar-menu.items';

@Component({
  selector: 'app-responsive-sidebar',
  standalone: true,
  host: {
    '[class.collapsed]': 'isCollapsed()',
    '[class.expanded]': '!isCollapsed()',
    '[class.mobile-visible]': 'isOpen() && isMobile()',
    '[class.mobile-hidden]': '!isOpen() && isMobile()',
  },
  imports: [
    CommonModule,
    RouterModule,
    LucideAngularModule,
    TranslocoPipe,
    SidebarFloatingTooltipComponent,
    SidebarFooterLinksComponent,
    SidebarMobileOverlayComponent,
  ],
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
        Megaphone,
        Shield,
        ChevronDown,
        Check,
        Building,
        Calendar,
        LayoutGrid,
        Clock,
        ArrowLeft,
        Star,
        BookOpen,
        ClipboardCheck,
        Activity,
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
  
  // Tooltip interaction state — converted to signals so the floating-tooltip
  // sub-component can consume them as @Input() Signal<...> and react without
  // the parent re-rendering the entire sidebar on every hover change.
  readonly hoveredItem = signal<MenuItem | null>(null);
  readonly tooltipStyle = signal<{ top: string; left: string }>({ top: '0px', left: '0px' });

  onMouseEnter(event: MouseEvent, item: MenuItem) {
    if (!this.isCollapsed()) return;

    // Calculate position based on the target element
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();

    // Position fixed logic
    this.tooltipStyle.set({
      top: `${rect.top + rect.height / 2}px`,
      left: `${rect.right + 10}px`, // 10px offset
    });
    this.hoveredItem.set(item);
  }

  onMouseLeave() {
    this.hoveredItem.set(null);
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

  /**
   * Sorts allMenuItems by custom sidebar order (from DB) with id-based fallback.
   * Items marked as invisible in sidebar_navigation_order are excluded.
   *
   * Also filters out items whose module is NOT enabled for the current user's
   * company. This prevents the sidebar from showing links that would redirect
   * the user to /inicio when clicked (via ModuleGuard). This bug was reported
   * on 2026-06-10 for moduloProyectos: Miriam (owner of caibs) saw the link
   * but got redirected because her company doesn't have moduloProyectos in
   * company_modules. See module.guard.ts for the guard logic.
   */
private sortedAllMenuItems = computed<MenuItem[]>(() => {
    const orderMap = this.modulesService.sidebarOrderSignal();
    const isSuperAdmin = this.authService.userRole() === 'super_admin' || !!this.authService.userProfile?.is_super_admin;
    return [...this.allMenuItems]
      .filter((item) => {
        // Master visibility: if explicitly hidden (visible=false), filter out for everyone
        const entry = orderMap.get(item.sidebarKey);
        if (entry !== undefined && !entry.visible) return false;
        // Per-role visibility: team members only see items with visibleToTeam=true
        if (entry && entry.visibleToTeam === false && !isSuperAdmin) return false;
        // If dev mode is on, only superadmins can see it
        if (entry?.devMode && !isSuperAdmin) return false;
        // Module-level guard: the unified resolution (plan_includes ∪ addons
        // ∪ manual_grants − manual_revocations) is computed by the
        // get_effective_modules RPC. Items not in the catalog (core_/inicio
        // etc.) are governed by the plan_module_access table directly.
        if (item.sidebarKey && !isSuperAdmin) {
          const enabled = this.modulesService.isModuleEnabled(item.sidebarKey);
          if (enabled === false) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const orderA = orderMap.get(a.sidebarKey)?.order ?? null;
        const orderB = orderMap.get(b.sidebarKey)?.order ?? null;
        // Both have custom order: sort by it
        if (orderA !== null && orderB !== null) return orderA - orderB;
        // Only A has custom order: A first
        if (orderA !== null) return -1;
        // Only B has custom order: B first
        if (orderB !== null) return 1;
        // Neither has custom order: fallback to id
        return a.id - b.id;
      });
  });

  // Loaded flag derived from allowed set presence
  readonly isModulesLoaded = computed(() => this._allowedModuleKeys() !== null);

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

  /** True si el usuario es owner de al menos una empresa en la lista de companies disponibles */
  readonly isOwnerOfAnyCompany = computed(() =>
    this.availableCompanies().some((c) => c.role === 'owner')
  );

  selectProfessionalProfile(professionalId: string) {
    this.authService.switchToProfessionalProfile(professionalId);
    this.isSwitcherOpen.set(false);
  }

  exitProfessionalMode() {
    this.authService.exitProfessionalMode();
    this.isSwitcherOpen.set(false);
  }

  // Favorite star — toggle favorite company/profile
  readonly favoriteCompanyId = computed(() => this.authService.favoriteCompanyId());
  readonly favoriteProfessionalId = computed(() => this.authService.favoriteProfessionalId());

  toggleFavoriteCompany(event: Event, companyId: string) {
    event.stopPropagation(); // don't also trigger selectCompany
    const current = this.authService.favoriteCompanyId();
    if (current === companyId) {
      this.authService.setFavoriteCompany(null);
    } else {
      this.authService.setFavoriteCompany(companyId);
    }
  }

  toggleFavoriteProfessional(event: Event, professionalId: string) {
    event.stopPropagation(); // don't also trigger selectProfessionalProfile
    const current = this.authService.favoriteProfessionalId();
    if (current === professionalId) {
      this.authService.setFavoriteProfessional(null);
    } else {
      this.authService.setFavoriteProfessional(professionalId);
    }
  }

  // Computed values from service
  readonly isOpen = this.sidebarState.isOpen;
  readonly isCollapsed = this.sidebarState.isCollapsed;
  /**
   * Reactive window.innerWidth — toSignal auto-unsubscribes the fromEvent
   * stream when the component is destroyed, so no manual cleanup needed.
   * Feeds isMobileSignal below so sub-components (mobile-overlay) re-render
   * when the viewport crosses the 768px breakpoint on desktop.
   */
  readonly innerWidth = toSignal(
    fromEvent(window, 'resize').pipe(
      map(() => window.innerWidth),
      startWith(window.innerWidth),
    ),
    { initialValue: window.innerWidth },
  );

  /**
   * Reactive wrapper around the legacy isMobile() method. The host binding and
   * ngOnInit still call the method directly (which re-evaluates on each CD
   * cycle), but sub-components that need reactivity (e.g. mobile-overlay)
   * consume this signal as @Input() Signal<boolean>.
   *
   * innerWidth() is the reactive source for the viewport branch — the computed
   * re-evaluates on every resize event, so children update correctly when the
   * user crosses the 768px breakpoint on desktop.
   */
  readonly isMobileSignal = computed(
    () => this.pwaService.isMobileDevice() || this.innerWidth() < 768,
  );
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
    Megaphone,
    Shield,
    Calendar,
    LayoutGrid,
  };

  private allMenuItems: MenuItem[] = ALL_NAV_ITEMS;

  // Notification badge kept in a separate computed so that unreadCount changes
  // do NOT re-trigger the heavy menuItems filtering logic.
  notificationBadge = computed(() => this.notificationsService.unreadCount());

  // NOTIFICATION_ITEM_IDS and WEBMAIL_ITEM_ID are imported from
  // data/sidebar-menu.items and re-used by the nav list (PR 2 territory).
  // Re-exposed as readonly class members so the template type checker can
  // resolve them — Angular templates only see class members, not module-level
  // imports. The shadowed local names just rebind the imported constants.
  readonly WEBMAIL_ITEM_ID = WEBMAIL_ITEM_ID;
  readonly NOTIFICATION_ITEM_IDS = NOTIFICATION_ITEM_IDS;

  // Webmail unread badge
  private mailStore = inject(MailStoreService);
  webmailBadge = computed(() => this.mailStore.totalUnreadMail() || null);

  // Computed menu items based on user role (does NOT depend on notification count).
  // Core items render immediately. Production items appear once modules load.
  menuItems = computed(() => {
    const userRole = this.authService.userRole();
    const profile = this.authService.userProfile;
    const isSuperAdmin = userRole === 'super_admin' || !!profile?.is_super_admin || this.authService.isEmergencySuperAdmin();
    const isAdmin = userRole === 'admin' || userRole === 'supervisor' || isSuperAdmin;
    const isClient = userRole === 'client';
    const isDev = this.devRoleService.isDev();
    const allowed = this._allowedModuleKeys(); // null = still loading

    // No profile yet (pending/invited user): minimal menu
    if (!profile) {
      return [
        { id: 14, label: 'nav.ayuda', icon: 'help-circle', route: '/ayuda', module: 'core', sidebarKey: 'core_/ayuda' },
      ];
    }

    // Super Admin sees EVERYTHING (bypass module checks), using custom sort order
    if (isSuperAdmin) {
      return this.sortedAllMenuItems();
    }

    // Client role
    if (isClient) {
      let clientMenu: MenuItem[] = [
        { id: 2000, label: 'nav.inicio', icon: 'home', route: '/inicio', module: 'core', sidebarKey: 'core_/inicio' },
        {
          id: 2007,
          label: 'nav.notificaciones',
          icon: 'bell',
          route: '/notifications',
          module: 'core',
          sidebarKey: 'core_/notifications',
        },
        {
          id: 2001,
          label: 'nav.tickets',
          icon: 'ticket',
          route: '/tickets',
          module: 'production',
          moduleKey: 'moduloSAT',
          sidebarKey: 'moduloSAT',
        },
        {
          id: 2002,
          label: 'nav.presupuestos',
          icon: 'file-text',
          route: '/portal/presupuestos',
          module: 'production',
          moduleKey: 'moduloPresupuestos',
          sidebarKey: 'moduloPresupuestos',
        },
        {
          id: 2003,
          label: 'nav.facturas',
          icon: 'receipt',
          route: '/portal/facturas',
          module: 'production',
          moduleKey: 'moduloFacturas',
          sidebarKey: 'moduloFacturas',
        },
        {
          id: 2004,
          label: 'nav.servicios',
          icon: 'wrench',
          route: '/portal/servicios',
          module: 'production',
          moduleKey: 'moduloServicios',
          sidebarKey: 'moduloServicios',
        },
        {
          id: 2005,
          label: 'nav.dispositivos',
          icon: 'smartphone',
          route: '/portal/dispositivos',
          module: 'production',
          moduleKey: 'moduloSAT',
          sidebarKey: 'moduloSAT',
        },
        {
          id: 2008,
          label: 'nav.proyectos',
          icon: 'layout-grid',
          route: '/projects',
          module: 'production',
          moduleKey: 'moduloProyectos',
          sidebarKey: 'moduloProyectos',
        },
        {
          id: 2009,
          label: 'nav.chat',
          icon: 'message-circle',
          route: '/chat',
          module: 'production',
          moduleKey: 'moduloChat',
          sidebarKey: 'moduloChat',
        },
        {
          id: 2010,
          label: 'nav.reservas',
          icon: 'calendar',
          route: '/reservas',
          module: 'production',
          moduleKey: 'moduloReservas',
          sidebarKey: 'moduloReservas',
        },
        {
          id: 2011,
          label: 'nav.conciliacion',
          icon: 'clipboard-check',
          route: '/reservas/conciliacion',
          module: 'production',
          moduleKey: 'moduloReservas',
          sidebarKey: 'moduloReservas',
        },
        {
          id: 2006,
          label: 'nav.configuracion',
          icon: 'settings',
          route: '/configuracion',
          module: 'core',
          sidebarKey: 'core_/configuracion',
        },
      ];

      // While modules are loading, only show core items.
      // Once loaded, filter production items by allowed modules.
      if (allowed) {
        clientMenu = clientMenu.filter((item) => isMenuItemAllowedByModules(item, allowed));
      } else {
        clientMenu = clientMenu.filter((item) => item.module === 'core');
      }
      // Apply visibility rules from sidebar_navigation_order
      const orderMap = this.modulesService.sidebarOrderSignal();
      clientMenu = clientMenu.filter((item) => {
        const entry = orderMap.get(item.sidebarKey);
        // If explicitly hidden for clients, filter out
        if (entry !== undefined && !entry.visibleToClients) return false;
        // If dev mode, clients never see it
        if (entry?.devMode) return false;
        return true;
      });

      return clientMenu;
    }

    // Admin / member / professional: sort + filter from sortedAllMenuItems
    return this.sortedAllMenuItems().filter((item) => {
      // Check sidebar visibility for team: if explicitly hidden for team, filter out
      const orderEntry = this.modulesService.sidebarOrderSignal().get(item.sidebarKey);
      if (orderEntry !== undefined && !orderEntry.visibleToTeam) return false;

      // Core modules always visible immediately
      if (item.module === 'core') {
        if (item.roleOnly === 'ownerAdmin') {
          return isSuperAdmin || userRole === 'owner' || userRole === 'admin' || userRole === 'supervisor';
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

        // Professionals never see Servicios
        if (userRole === 'professional' && item.route === '/servicios') {
          return false;
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
    // Listen for mobile profile switcher trigger
    window.addEventListener('open-profile-switcher', () => {
      this.isSwitcherOpen.set(true);
    });

    // Auto-collapse on mobile
    if (this.isMobile()) {
      this.sidebarState.setCollapsed(false);
      this.sidebarState.setOpen(false);
    } else {
      // Restore collapsed state from localStorage
      this.sidebarState.loadSavedState();
    }

    // Load sidebar custom order (super_admin set) and modules in parallel
    this.modulesService.fetchSidebarOrder();
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
    
    switch (role) {
      case 'super_admin':
        return this.translocoService.translate('roles.superAdmin');
      case 'owner':
        return this.translocoService.translate('roles.propietario');
      case 'admin':
        return this.translocoService.translate('roles.administrador');
      case 'supervisor':
        return this.translocoService.translate('roles.supervisor');
      case 'member':
        return this.translocoService.translate('roles.miembro');
      case 'client':
        return this.translocoService.translate('roles.cliente');
      case 'professional':
        return this.translocoService.translate('roles.profesional');
      case 'none':
        return this.translocoService.translate('roles.sinAcceso');
      default:
        return role;
    }
  }

  getUserInitial(): string {
    const fullName = this.authService.userProfileSignal()?.full_name;
    return fullName ? fullName.charAt(0).toUpperCase() : 'U';
  }

  getUserDisplayName(): string {
    return (
      this.authService.userProfileSignal()?.full_name || this.translocoService.translate('shared.usuario')
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

  // routeToModuleKey + isMenuItemAllowedByModules are imported from
  // data/sidebar-menu.items and called directly (no `this.`) inside menuItems().
}
