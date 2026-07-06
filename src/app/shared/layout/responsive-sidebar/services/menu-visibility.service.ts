/**
 * MenuVisibilityService — owns the pure logic that decides which nav items
 * the sidebar renders, for the current user/role/company/dev-mode/permissions.
 *
 * Moved out of ResponsiveSidebarComponent as the last step of the sidebar
 * refactor (PR 5/5). Lives at the sidebar level (not providedIn root) so the
 * lifetime matches the component that owns the load — but `providedIn: 'root'`
 * is fine here too since the service is stateless aside from the
 * allowed-modules cache and the public computed is read-only.
 *
 * Why extract:
 *   - The menuItems computed was ~100 LOC of branching logic tangled with
 *     component-level state (auth, modules, permissions, dev-mode, role).
 *     Extracting it makes the visibility rules unit-testable without spinning
 *     up a TestBed for the whole sidebar.
 *   - The parent component no longer needs to inject SupabaseModulesService /
 *     SupabasePermissionsService / DevRoleService — they are private
 *     dependencies of the service.
 *   - The pure helper `isMenuItemAllowedByModules` stays in the data file
 *     (data/sidebar-menu.items.ts) because it is also a candidate for reuse
 *     by other components (e.g. mobile-bottom-nav) in the future.
 *
 * Lifecycle:
 *   - The parent calls `loadSidebarData()` from ngOnInit; that fires both
 *     `fetchSidebarOrder()` and `fetchEffectiveModules()` and populates the
 *     internal `_allowedModuleKeys` signal. Until that resolves, production
 *     items are hidden (only core items render).
 *   - The public `visibleMenuItems` signal is reactive: it re-evaluates
 *     whenever any input signal (userRole, sidebarOrder, allowed modules,
 *     dev-mode toggle, permission changes) emits.
 */
import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../../../services/auth.service';
import { DevRoleService } from '../../../../services/dev-role.service';
import {
  SupabaseModulesService,
  EffectiveModule,
} from '../../../../services/supabase-modules.service';
import { SupabasePermissionsService } from '../../../../services/supabase-permissions.service';
import {
  MenuItem,
  ALL_NAV_ITEMS,
  isMenuItemAllowedByModules,
} from '../data/sidebar-menu.items';

@Injectable({ providedIn: 'root' })
export class MenuVisibilityService {
  private authService = inject(AuthService);
  private modulesService = inject(SupabaseModulesService);
  private permissionsService = inject(SupabasePermissionsService);
  private devRoleService = inject(DevRoleService);

  /** Full combined list — equivalent to the legacy `allMenuItems` on the parent. */
  private allMenuItems: MenuItem[] = ALL_NAV_ITEMS;

  /**
   * Allowed module keys for the current user's company. `null` = still loading.
   * Set by `loadSidebarData()` from the `fetchEffectiveModules()` RPC result.
   */
  private _allowedModuleKeys = signal<Set<string> | null>(null);

  /**
   * Trigger the two async loads the menu depends on:
   *   - sidebar_navigation_order (custom order + visibility flags)
   *   - effective_modules for the current user/company
   *
   * Call this from the consuming component's ngOnInit. Both are fire-and-forget;
   * the visibleMenuItems computed reacts as the signals update.
   */
  loadSidebarData(): void {
    this.modulesService.fetchSidebarOrder();
    this.modulesService.fetchEffectiveModules().subscribe({
      next: (mods: EffectiveModule[]) => {
        this._allowedModuleKeys.set(
          new Set<string>(mods.filter((m) => m.enabled).map((m) => m.key)),
        );
      },
      error: () => {
        // Treat fetch errors as "no modules allowed" — production items will
        // be hidden but the sidebar still renders core items. This matches the
        // legacy behavior in the parent component.
        this._allowedModuleKeys.set(new Set<string>());
      },
    });
    this.permissionsService.loadPermissionsMatrix();
  }

  /**
   * Sort + filter ALL_NAV_ITEMS by sidebar_navigation_order with id-based
   * fallback. Items marked as invisible in sidebar_navigation_order are
   * excluded. Also filters out items whose module is NOT enabled for the
   * current user's company. This prevents the sidebar from showing links
   * that would redirect the user to /inicio when clicked (via ModuleGuard).
   * The core-item bypass is intentional (see inline comment for regression
   * history — commit 2b1ab22f).
   */
  private sortedAllMenuItems = computed<MenuItem[]>(() => {
    const orderMap = this.modulesService.sidebarOrderSignal();
    const isSuperAdmin =
      this.authService.userRole() === 'super_admin' ||
      !!this.authService.userProfile?.is_super_admin;
    return [...this.allMenuItems]
      .filter((item) => {
        const entry = orderMap.get(item.sidebarKey);
        // Master visibility: if explicitly hidden (visible=false), filter out for everyone
        if (entry !== undefined && !entry.visible) return false;
        // Per-role visibility: team members only see items with visibleToTeam=true (superadmins bypass)
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

  /**
   * Public, final list consumed by the sidebar template. The only signal the
   * parent needs to bind in the template — everything else is internal.
   *
   * Decides what each role sees, applies sidebar_navigation_order visibility
   * rules, and waits for the allowed modules to load before revealing
   * production items. Core items render immediately. The notification count
   * is intentionally NOT read here so badge updates do not re-run this
   * heavy filter.
   */
  readonly visibleMenuItems = computed<MenuItem[]>(() => {
    const userRole = this.authService.userRole();
    const profile = this.authService.userProfile;
    const isSuperAdmin =
      userRole === 'super_admin' ||
      !!profile?.is_super_admin ||
      this.authService.isEmergencySuperAdmin();
    const isAdmin = userRole === 'admin' || userRole === 'supervisor' || isSuperAdmin;
    const isClient = userRole === 'client';
    const isDev = this.devRoleService.isDev();
    const allowed = this._allowedModuleKeys(); // null = still loading

    // No profile yet (pending/invited user): minimal menu
    if (!profile) {
      return [
        {
          id: 14,
          label: 'nav.ayuda',
          icon: 'help-circle',
          route: '/ayuda',
          module: 'core',
          sidebarKey: 'core_/ayuda',
        },
      ];
    }

    // Super Admin sees EVERYTHING (bypass module checks), using custom sort order
    if (isSuperAdmin) {
      return this.sortedAllMenuItems();
    }

    // Client role
    if (isClient) {
      let clientMenu: MenuItem[] = [
        {
          id: 2000,
          label: 'nav.inicio',
          icon: 'home',
          route: '/inicio',
          module: 'core',
          sidebarKey: 'core_/inicio',
        },
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
          return (
            isSuperAdmin ||
            userRole === 'owner' ||
            userRole === 'admin' ||
            userRole === 'supervisor'
          );
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
}
