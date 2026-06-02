import { Component, inject, computed, OnInit, signal, DestroyRef } from '@angular/core';

import { RouterModule, Router, NavigationEnd } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs/operators';
import { PWAService } from '../../../services/pwa.service';
import { AuthService } from '../../../services/auth.service';
import { DevRoleService } from '../../../services/dev-role.service';
import { FeedbackService } from '../../feedback/feedback.service';
import {
  SupabaseModulesService,
  EffectiveModule,
} from '../../../services/supabase-modules.service';
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
  sidebarKey: string;
}

interface NavItem {
  id: string;
  label: string;
  icon: string; // font-awesome or custom icon class
  route?: string; // optional when action-based (e.g. 'more')
  module?: 'core' | 'production' | 'development';
  roleOnly?: 'ownerAdmin' | 'adminOnly';
  action?: 'more' | 'search' | 'notifications';
  sidebarKey: string;
}

@Component({
  selector: 'app-mobile-bottom-nav',
  standalone: true,
  imports: [RouterModule],
  template: `
    @if (!shouldHideNav()) {
      <nav
        class="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 safe-area-pb z-50 md:hidden"
        role="navigation"
        aria-label="Navegación principal móvil"
      >
        <ul class="flex justify-around items-center h-16 px-4 m-0 list-none" role="menubar">
          @for (item of filteredNavItems(); track item; let i = $index) {
            <li class="flex-1 flex justify-center" role="none">
              @if (item.action === 'more') {
                <button
                  (click)="toggleMoreSheet()"
                  role="menuitem"
                  aria-label="Más opciones"
                  class="relative flex flex-col items-center justify-center w-full h-full text-gray-500 dark:text-gray-400 transition-colors focus:outline-none "
                  [class.text-blue-600]="showMoreSheet()"
                >
                  <i [class]="'fas fa-' + item.icon + ' text-lg mb-1'"></i>
                  <span class="text-xs font-medium">{{ item.label }}</span>
                </button>
              }
              @if (item.action === 'notifications') {
                <button
                  (click)="openNotifications()"
                  role="menuitem"
                  aria-label="Notificaciones"
                  class="relative flex flex-col items-center justify-center w-full h-full text-gray-500 dark:text-gray-400 transition-colors focus:outline-none "
                >
                  <i [class]="'fas fa-' + item.icon + ' text-lg mb-1'"></i>
                  <span class="text-xs font-medium">{{ item.label }}</span>
                  @if (unreadCount() > 0) {
                    <span
                      class="absolute top-1 right-4 bg-red-500 text-white text-[10px] leading-none px-1 py-0.5 rounded-full min-w-[18px] text-center font-semibold"
                      >{{ unreadCount() }}</span
                    >
                  }
                </button>
              }
              @if (!item.action) {
                <button
                  (click)="item.route && navigateAndClose(item.route)"
                  role="menuitem"
                  class="flex flex-col items-center justify-center w-full h-full text-gray-500 dark:text-gray-400 transition-colors focus:outline-none "
                  [class.text-blue-600]="currentUrl().startsWith(item.route || '')"
                >
                  <i [class]="'fas fa-' + item.icon + ' text-lg mb-1'"></i>
                  <span class="text-xs font-medium">{{ item.label }}</span>
                </button>
              }
            </li>
          }
        </ul>
      </nav>
      <!-- Bottom Sheet Más (inline) -->
      @if (showMoreSheet()) {
        <div
          class="fixed inset-0"
          style="z-index: 6000"
          aria-modal="true"
          role="dialog"
          aria-label="Menú adicional"
        >
          <div
            class="absolute inset-0 bg-black/40 backdrop-blur-sm"
            (click)="closeMoreSheet()"
            aria-hidden="true"
          ></div>
          <div
            class="absolute left-0 right-0 bottom-0 bg-white dark:bg-[#1e293b] rounded-t-2xl shadow-xl border border-gray-200 dark:border-gray-700 max-h-[70vh] flex flex-col animate-slideUp"
            style="z-index: 6001"
          >
            <div class="flex items-center justify-between px-5 pt-4 pb-2">
              <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-200">Más opciones</h2>
              <button
                (click)="closeMoreSheet()"
                aria-label="Cerrar"
                class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <i class="fas fa-times"></i>
              </button>
            </div>
            <div class="px-3 pb-6 overflow-y-auto flex-1">
              <div class="grid grid-cols-3 gap-2">
                @for (it of moreMenuItems(); track it) {
                  <button
                    (click)="it.route && navigateAndClose(it.route, ($any(it)).queryParams)"
                    class="menu-btn"
                    [attr.aria-label]="it.label"
                  >
                    <span class="relative">
                      <i [class]="'fas fa-' + it.icon"></i>
                      @if (it.badge && it.badge > 0) {
                        <span class="badge">{{ it.badge }}</span>
                      }
                    </span>
                    <span>{{ it.label }}</span>
                  </button>
                }
              </div>
            </div>
            <!-- Profile Switcher + Feedback Row -->
            <div class="px-5 py-3 border-t border-gray-200 dark:border-gray-800">
              <div class="flex items-center gap-3">
                <!-- Profile Switcher (show only if in pro mode OR has linked professionals) -->
                @if (authService.isInProfessionalMode() || authService.linkedProfessionals().length > 0) {
                  <button
                    type="button"
                    (click)="toggleProfileSwitcher()"
                    class="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 rounded-xl text-sm font-medium transition-colors"
                  >
                    <i class="fas fa-user-md"></i>
                    <span>{{ authService.isInProfessionalMode() ? 'Volver a Admin' : 'Cambiar Perfil' }}</span>
                  </button>
                }
                <!-- Feedback Button -->
                <button
                  type="button"
                  (click)="openFeedback()"
                  class="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-xl text-sm font-medium transition-colors"
                >
                  <i class="fas fa-circle-question"></i>
                  <span>Feedback</span>
                </button>
              </div>
            </div>
            <div class="px-5 py-3 border-t border-gray-200 dark:border-gray-800 flex justify-end">
              <button
                (click)="closeMoreSheet()"
                class="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      }

      <!-- Profile Switcher Sheet -->
      @if (showProfileSheet()) {
        <div
          class="fixed inset-0"
          style="z-index: 6002"
          aria-modal="true"
          role="dialog"
          aria-label="Cambiar Perfil"
        >
          <div
            class="absolute inset-0 bg-black/40 backdrop-blur-sm"
            (click)="closeProfileSheet()"
            aria-hidden="true"
          ></div>
          <div
            class="absolute left-0 right-0 bottom-0 bg-white dark:bg-[#1e293b] rounded-t-2xl shadow-xl border border-gray-200 dark:border-gray-700 max-h-[80vh] flex flex-col animate-slideUp"
            style="z-index: 6003"
          >
            <div class="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-200 dark:border-gray-700">
              <h2 class="text-base font-semibold text-gray-700 dark:text-gray-200">Cambiar Perfil</h2>
              <button
                (click)="closeProfileSheet()"
                aria-label="Cerrar"
                class="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <i class="fas fa-times"></i>
              </button>
            </div>
            <div class="overflow-y-auto flex-1 p-4">
              @if (authService.isInProfessionalMode()) {
                <!-- Exit professional mode option -->
                <button
                  type="button"
                  (click)="exitProfessionalModeFromSheet()"
                  class="w-full flex items-center gap-3 px-4 py-3 mb-3 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 rounded-xl transition-colors"
                >
                  <i class="fas fa-arrow-left"></i>
                  <span class="font-medium">Volver a Admin</span>
                </button>
              }
              @if (authService.linkedProfessionals().length > 0) {
                <p class="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 px-1">Perfiles Profesionales</p>
                <div class="flex flex-col gap-2">
                  @for (prof of authService.linkedProfessionals(); track prof.id) {
                    <button
                      type="button"
                      (click)="selectProfile(prof.id)"
                      class="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl transition-colors text-left"
                      [class.bg-emerald-50]="authService.activeProfessionalId() === prof.id"
                      [class.dark.bg-emerald-900/20]="authService.activeProfessionalId() === prof.id"
                      [class.text-emerald-700]="authService.activeProfessionalId() === prof.id"
                      [class.dark.text-emerald-400]="authService.activeProfessionalId() === prof.id"
                    >
                      <div class="flex-1">
                        <div class="font-semibold text-sm">{{ prof.display_name }}</div>
                        @if (prof.title) {
                          <div class="text-xs text-gray-500">{{ prof.title }}</div>
                        }
                        @if (prof.company_name) {
                          <div class="text-xs text-gray-400">{{ prof.company_name }}</div>
                        }
                      </div>
                      @if (authService.activeProfessionalId() === prof.id) {
                        <i class="fas fa-check text-emerald-500"></i>
                      }
                    </button>
                  }
                </div>
              } @else {
                <div class="text-center py-8 text-gray-400 text-sm">
                  No hay perfiles profesionales vinculados
                </div>
              }
            </div>
          </div>
        </div>
      }
    }
  `,
  styles: [
    `
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
      .menu-btn i {
        @apply text-base;
      }
      .badge {
        @apply absolute -top-1 -right-2 bg-red-500 text-white text-[10px] leading-none px-1 py-0.5 rounded-full min-w-[18px] text-center font-semibold;
      }
      @keyframes slideUp {
        from {
          transform: translateY(20px);
          opacity: 0;
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }
      .animate-slideUp {
        animation: slideUp 0.25s ease-out;
      }
    `,
  ],
})
export class MobileBottomNavComponent implements OnInit {
  // Hardcoded emergency superadmin — never changes, no signal/subscription needed
  private static readonly ROBERTO_EMAIL = 'roberto@simplificacrm.es';
  pwaService = inject(PWAService);
  authService = inject(AuthService);
  private devRoleService = inject(DevRoleService);
  private modulesService = inject(SupabaseModulesService);
  private router = inject(Router);
  private notificationStore = inject(NotificationStore);
  feedbackService = inject(FeedbackService);
  private destroyRef = inject(DestroyRef);

  // Signal to track current route for hiding nav on form pages
  readonly currentUrl = signal(this.router.url);

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
    return this.hideOnRoutes.some((route) => url.includes(route));
  });

  // Server-side allowed modules set
  private _allowedModuleKeys = signal<Set<string> | null>(null);

  // Staff primary nav: main items that appear in the bottom bar
  // The 4 most important items + "Más" for overflow
  private baseItems: NavItem[] = [
    { id: 'inicio', label: 'Inicio', icon: 'home', route: '/inicio', module: 'core', sidebarKey: 'core_/inicio' },
    { id: 'clientes', label: 'Clientes', icon: 'users', route: '/clientes', module: 'core', sidebarKey: 'core_/clientes' },
    {
      id: 'tickets',
      label: 'Tickets',
      icon: 'ticket-alt',
      route: '/tickets',
      module: 'production',
      sidebarKey: 'moduloSAT',
    },
    {
      id: 'presupuestos',
      label: 'Presupuestos',
      icon: 'file-alt',
      route: '/presupuestos',
      module: 'production',
      sidebarKey: 'moduloPresupuestos',
    },
    { id: 'more', label: 'Más', icon: 'ellipsis-h', action: 'more', module: 'core', sidebarKey: 'core_more' },
  ];

  // Client portal users bottom nav (simplified): Inicio | Tickets | Más
  private clientItemsBase: NavItem[] = [
    { id: 'inicio', label: 'Inicio', icon: 'home', route: '/inicio', module: 'core', sidebarKey: 'core_/inicio' },
    {
      id: 'tickets',
      label: 'Tickets',
      icon: 'ticket-alt',
      route: '/tickets',
      module: 'production',
      sidebarKey: 'moduloSAT',
    },
    { id: 'more', label: 'Más', icon: 'ellipsis-h', action: 'more', module: 'core', sidebarKey: 'core_more' },
  ];

  // Sheet state
  readonly showMoreSheet = signal(false);
  readonly showProfileSheet = signal(false);

  /** Sort items by custom sidebar order, falling back to id/index order */
  private sortBySidebarOrder<T extends { sidebarKey: string }>(items: T[]): T[] {
    const orderMap = this.modulesService.sidebarOrderSignal();
    return [...items].sort((a, b) => {
      const orderA = orderMap.get(a.sidebarKey)?.order ?? null;
      const orderB = orderMap.get(b.sidebarKey)?.order ?? null;
      if (orderA !== null && orderB !== null) return orderA - orderB;
      if (orderA !== null) return -1;
      if (orderB !== null) return 1;
      return 0; // preserve original order when no custom order
    });
  }
  readonly unreadCount = this.notificationStore.unreadCount;
  // Public debug accessors for template (so bindings don't reference private fields)
  readonly debugRole = computed(() => this.authService.userRole());
  readonly isRobertoDetected = computed(() => {
    const role = this.authService.userRole();
    return role === 'super_admin'
      || this.authService.userProfile?.email === MobileBottomNavComponent.ROBERTO_EMAIL
      || this.authService.currentUser?.email === MobileBottomNavComponent.ROBERTO_EMAIL;
  });
  readonly debugModules = computed(() => {
    const s = this._allowedModuleKeys();
    return s ? Array.from(s) : null;
  });
  // Secondary sheet items derived from role / modules
  moreMenuItems = computed<MoreMenuItem[]>(() => {
    const role = this.authService.userRole();
    // Direct email check — bypasses any signal/subscription timing issues
    const isRoberto = role === 'super_admin'
      || this.authService.userProfile?.email === MobileBottomNavComponent.ROBERTO_EMAIL
      || this.authService.currentUser?.email === MobileBottomNavComponent.ROBERTO_EMAIL;
    const isSuperAdmin = role === 'super_admin' || !!this.authService.userProfile?.is_super_admin || isRoberto;
    const isClient = role === 'client';
    const isDev = this.devRoleService.isDev();
    const isOwnerOrAdmin = role === 'owner' || role === 'admin' || role === 'supervisor' || isSuperAdmin;
    const isProfessional = role === 'professional';
    const isAdmin = isSuperAdmin; // Includes Roberto via isSuperAdmin flag
    const allowed = this._allowedModuleKeys();
    const items: MoreMenuItem[] = [];

    // Roberto sees ALL items — no filtering
    if (isRoberto) {
      console.warn('[MobileNav] ROBERTO BYPASS in moreMenuItems — returning all items', { role, isRoberto, isSuperAdmin });
      items.push(
        { id: 'productos', label: 'Productos', icon: 'box-open', route: '/productos', sidebarKey: 'moduloProductos' },
        { id: 'dispositivos', label: 'Dispositivos', icon: 'mobile-alt', route: '/dispositivos', sidebarKey: 'moduloSAT' },
        { id: 'servicios', label: 'Servicios', icon: 'tools', route: '/servicios', sidebarKey: 'moduloServicios' },
        { id: 'reservas', label: 'Reservas', icon: 'calendar-alt', route: '/reservas', sidebarKey: 'moduloReservas' },
        { id: 'analytics', label: 'Analíticas', icon: 'chart-line', route: '/analytics', sidebarKey: 'moduloAnaliticas' },
        { id: 'facturacion', label: 'Facturación', icon: 'file-invoice-dollar', route: '/facturacion', sidebarKey: 'moduloFacturas' },
        { id: 'chat', label: 'Chat', icon: 'comments', route: '/chat', sidebarKey: 'moduloChat' },
        { id: 'webmail', label: 'Webmail', icon: 'envelope', route: '/webmail', sidebarKey: 'core_/webmail' },
        { id: 'webmail-admin', label: 'Admin Webmail', icon: 'shield-alt', route: '/webmail-admin', sidebarKey: 'core_/webmail-admin' },
        { id: 'notifications', label: 'Notificaciones', icon: 'bell', route: '/inicio', queryParams: { openNotifications: 'true' }, badge: this.unreadCount(), sidebarKey: 'core_/notifications' },
        { id: 'modules', label: 'Gestión Módulos', icon: 'sliders-h', route: '/admin/modulos', sidebarKey: 'core_/admin/modulos' },
        { id: 'settings', label: 'Configuración', icon: 'cog', route: '/configuracion', sidebarKey: 'core_/configuracion' },
      );
      return this.sortBySidebarOrder(items);
    }

    console.debug('[MobileNav] moreMenuItems', { role, isRoberto, isSuperAdmin, allowed: allowed ? Array.from(allowed) : null, isClient });

    if (!isClient) {
      // Módulos de producción (solo si están habilitados)

      // Productos (New)
      if (isSuperAdmin || allowed?.has('moduloProductos')) {
        items.push({ id: 'productos', label: 'Productos', icon: 'box-open', route: '/productos', sidebarKey: 'moduloProductos' });
      }

      // Dispositivos (New)
      if (isSuperAdmin || allowed?.has('moduloSAT')) {
        items.push({
          id: 'dispositivos',
          label: 'Dispositivos',
          icon: 'mobile-alt',
          route: '/dispositivos',
          sidebarKey: 'moduloSAT',
        });
      }

      // Servicios (not visible for professional role)
      if (!isProfessional && (isSuperAdmin || allowed?.has('moduloServicios'))) {
        items.push({ id: 'servicios', label: 'Servicios', icon: 'tools', route: '/servicios', sidebarKey: 'moduloServicios' });
      }

      // Reservas (New)
      if (isSuperAdmin || isProfessional || allowed?.has('moduloReservas')) {
        items.push({ id: 'reservas', label: 'Reservas', icon: 'calendar-alt', route: '/reservas', sidebarKey: 'moduloReservas' });
      }

      // Analíticas (visible para owner/admin/dev)
      if ((isOwnerOrAdmin || isDev) && (isSuperAdmin || allowed?.has('moduloAnaliticas'))) {
        items.push({
          id: 'analytics',
          label: 'Analíticas',
          icon: 'chart-line',
          route: '/analytics',
          sidebarKey: 'moduloAnaliticas',
        });
      }

      // Facturación (visible para owner/admin/dev)
      if ((isOwnerOrAdmin || isDev) && (isSuperAdmin || allowed?.has('moduloFacturas'))) {
        items.push({
          id: 'facturacion',
          label: 'Facturación',
          icon: 'file-invoice-dollar',
          route: '/facturacion',
          sidebarKey: 'moduloFacturas',
        });
      }

      // Chat (visible para owner/admin/dev Y si moduloChat está habilitado)
      if ((isOwnerOrAdmin || isDev) && (isSuperAdmin || allowed?.has('moduloChat'))) {
        items.push({ id: 'chat', label: 'Chat', icon: 'comments', route: '/chat', sidebarKey: 'moduloChat' });
      }

      // Webmail (Core)
      items.push({ id: 'webmail', label: 'Webmail', icon: 'envelope', route: '/webmail', sidebarKey: 'core_/webmail' });

      // Admin Webmail (Specific role: only admin, super_admin)
      if (isAdmin) {
        items.push({
          id: 'webmail-admin',
          label: 'Admin Webmail',
          icon: 'shield-alt',
          route: '/webmail-admin',
          sidebarKey: 'core_/webmail-admin',
        });
      }

      // Notificaciones
      items.push({
        id: 'notifications',
        label: 'Notificaciones',
        icon: 'bell',
        route: '/inicio',
        queryParams: { openNotifications: 'true' },
        badge: this.unreadCount(),
        sidebarKey: 'core_/notifications',
      });

      // Gestión Módulos (solo admin)
      if (isAdmin) {
        items.push({
          id: 'modules',
          label: 'Gestión Módulos',
          icon: 'sliders-h',
          route: '/admin/modulos',
          sidebarKey: 'core_/admin/modulos',
        });
      }

      // Configuración siempre al final
      items.push({ id: 'settings', label: 'Configuración', icon: 'cog', route: '/configuracion', sidebarKey: 'core_/configuracion' });
    } else {
      // Client specific extra items based on enabled modules
      if (allowed?.has('moduloPresupuestos')) {
        items.push({
          id: 'presupuestos',
          label: 'Presupuestos',
          icon: 'file-alt',
          route: '/portal/presupuestos',
          sidebarKey: 'moduloPresupuestos',
        });
      }
      if (allowed?.has('moduloFacturas')) {
        items.push({
          id: 'facturacion',
          label: 'Facturas',
          icon: 'file-invoice-dollar',
          route: '/portal/facturas',
          sidebarKey: 'moduloFacturas',
        });
      }
      if (allowed?.has('moduloServicios')) {
        items.push({
          id: 'servicios',
          label: 'Mis Servicios',
          icon: 'tools',
          route: '/portal/servicios',
          sidebarKey: 'moduloServicios',
        });
      }
      if (allowed?.has('moduloSAT')) {
        items.push({
          id: 'dispositivos',
          label: 'Mis Dispositivos',
          icon: 'mobile-alt',
          route: '/portal/dispositivos',
          sidebarKey: 'moduloSAT',
        });
      }
      if (allowed?.has('moduloProyectos')) {
        items.push({
          id: 'projects',
          label: 'Proyectos',
          icon: 'project-diagram',
          route: '/projects',
          sidebarKey: 'moduloProyectos',
        });
      }
      if (allowed?.has('moduloChat')) {
        items.push({ id: 'chat', label: 'Chat', icon: 'comments', route: '/chat', sidebarKey: 'moduloChat' });
      }
      if (allowed?.has('moduloReservas')) {
        items.push({ id: 'reservas', label: 'Reservas', icon: 'calendar-alt', route: '/reservas', sidebarKey: 'moduloReservas' });
      }
      items.push(
        {
          id: 'notifications',
          label: 'Notificaciones',
          icon: 'bell',
          route: '/inicio',
          queryParams: { openNotifications: 'true' },
          badge: this.unreadCount(),
          sidebarKey: 'core_/notifications',
        },
        { id: 'settings', label: 'Configuración', icon: 'cog', route: '/configuracion', sidebarKey: 'core_/configuracion' },
      );
    }

    // Avoid showing duplicates: remove items that are present in the primary nav
    const renderedItems = this.filteredNavItems();
    const renderedRoutes = new Set(renderedItems.map((i) => i.route || i.id));

    const filtered = items.filter((it) => {
      const r = it.route || it.id;
      return !r || !renderedRoutes.has(r);
    });

    return this.sortBySidebarOrder(filtered);
  });

  // Computed filtered items honoring role and server-side modules

  filteredNavItems = computed<NavItem[]>(() => {
    const role = this.authService.userRole();
    const isRoberto = role === 'super_admin'
      || this.authService.userProfile?.email === MobileBottomNavComponent.ROBERTO_EMAIL
      || this.authService.currentUser?.email === MobileBottomNavComponent.ROBERTO_EMAIL;
    const isSuperAdmin = role === 'super_admin' || !!this.authService.userProfile?.is_super_admin || isRoberto;
    const isOwnerOrAdmin = role === 'owner' || role === 'admin' || role === 'supervisor' || isSuperAdmin;
    const isClient = role === 'client';
    const isDev = this.devRoleService.isDev();
    const allowed = this._allowedModuleKeys();

    // Roberto or Super Admin sees everything — bypass module checks entirely
    if (isSuperAdmin || isRoberto) {
      console.warn('[MobileNav] SUPER ADMIN / ROBERTO BYPASS in filteredNavItems', { role, isRoberto, isSuperAdmin });
      return this.sortBySidebarOrder([...this.baseItems]);
    }

    // Use client items for client role, staff items otherwise
    const base = isClient ? [...this.clientItemsBase] : [...this.baseItems];

    // Filter by module availability
    const filtered = base.filter((it) => {
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

    return this.sortBySidebarOrder(filtered);
  });

  ngOnInit(): void {
    // Debug: print current role on init so we can verify whether clientItemsBase is used
    console.debug('[mobile-bottom-nav] init role=', this.authService.userRole());

    // Subscribe to router navigation events to update currentUrl signal
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((event) => {
        this.currentUrl.set(event.urlAfterRedirects);
      });

    // Load custom sidebar order (super_admin set) and effective modules
    this.modulesService.fetchSidebarOrder();
    this.modulesService.fetchEffectiveModules().subscribe({
      next: (mods: EffectiveModule[]) => {
        const allowed = new Set<string>(mods.filter((m) => m.enabled).map((m) => m.key));
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
      },
    });
  }

  toggleMoreSheet(): void {
    this.showMoreSheet.update((v) => !v);
  }

  closeMoreSheet(): void {
    this.showMoreSheet.set(false);
  }
  openNotifications(): void {
    this.router.navigate(['/notifications']);
  }

  toggleProfileSwitcher(): void {
    this.closeMoreSheet();
    if (this.authService.isInProfessionalMode()) {
      this.authService.exitProfessionalMode();
      return;
    }
    // Show profile list bottom sheet instead of trying to open desktop sidebar
    this.showProfileSheet.set(true);
  }

  closeProfileSheet(): void {
    this.showProfileSheet.set(false);
  }

  selectProfile(professionalId: string): void {
    // Navigate to current route (or /inicio if no route) then switch profile
    // so guards run from the right place
    const targetRoute = this.router.url.includes('/') && !this.router.url.includes('/login')
      ? this.router.url.split('?')[0]
      : '/inicio';
    this.router.navigate([targetRoute]).then(() => {
      this.authService.switchToProfessionalProfile(professionalId);
    });
    this.closeProfileSheet();
  }

  exitProfessionalModeFromSheet(): void {
    this.closeProfileSheet();
    this.authService.exitProfessionalMode();
  }

  openFeedback(): void {
    this.closeMoreSheet();
    this.feedbackService.open();
  }

  navigateAndClose(route: string, queryParams?: Record<string, any>): void {
    this.router.navigate([route], queryParams ? { queryParams } : undefined);
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
        return 'moduloProductos';
      case '/facturacion':
      case '/portal/facturas':
        return 'moduloFacturas';
      case '/chat':
        return 'moduloChat';
      case '/projects':
        return 'moduloProyectos';
      case '/reservas':
        return 'moduloReservas';
      case '/portal/dispositivos':
      case '/dispositivos':
        return 'moduloSAT';
      default:
        return null;
    }
  }
}
