/**
 * Sidebar menu data — pure data file.
 *
 * Moved out of responsive-sidebar.component.ts as part of the sidebar refactor (PR 1/3).
 * Contains:
 *   - The MenuItem shape used across sidebar logic.
 *   - Static core nav items (always visible, not gated by modules).
 *   - Production-module nav items (gated by `modules_catalog`).
 *   - Badge ID constants used by the nav list (PR 2 territory).
 *   - Pure helpers for module-based filtering of nav items.
 *
 * No class, no component, no Angular DI here — keep this file side-effect free so it
 * can be imported from both the parent sidebar and any future sub-components.
 */

/** Shape of a single sidebar nav item. Mirrors the existing inline interface. */
export interface MenuItem {
  id: number;
  label: string;
  icon: string;
  route: string;
  badge?: number;
  children?: MenuItem[];
  /** 'core' | 'production' | 'development' — used by menuItems() computed for filtering. */
  module?: string;
  /** Optional explicit key into modules_catalog. Falls back to routeToModuleKey(route). */
  moduleKey?: string;
  /** Restrict visibility to specific role buckets. */
  roleOnly?: 'ownerAdmin' | 'adminOnly' | 'adminEmployeeClient' | 'adminOnlyWebmail';
  /** Permission key(s) required (OR logic). */
  requiredPermission?: string | string[];
  /** Key used to match sidebar_navigation_order table. */
  sidebarKey: string;
}

/** Webmail nav item id — drives the webmail unread badge. */
export const WEBMAIL_ITEM_ID = 95;

/** Item ids that carry the notifications badge (staff=90, client=2007). */
export const NOTIFICATION_ITEM_IDS: ReadonlySet<number> = new Set([90, 2007]);

/**
 * Core nav items — always visible, not gated by modules_catalog.
 * IDs 1xx range = admin-only/admin-webmail etc. 0–99 = general core.
 *
 * Order here is the *declaration* order; the sidebar reorders by
 * sidebar_navigation_order.order at render time, so this array is just the
 * canonical source of truth.
 */
export const CORE_NAV_ITEMS: MenuItem[] = [
  {
    id: 1,
    label: 'nav.inicio',
    icon: 'home',
    route: '/inicio',
    module: 'core',
    sidebarKey: 'core_/inicio',
  },
  {
    id: 90,
    label: 'nav.notificaciones',
    icon: 'bell',
    route: '/notifications',
    module: 'core',
    sidebarKey: 'core_/notifications',
  },
  {
    id: 2,
    label: 'nav.clientes',
    icon: 'users',
    route: '/clientes',
    module: 'core',
    sidebarKey: 'core_/clientes',
  },
  {
    id: 13,
    label: 'nav.rgpd',
    icon: 'shield',
    route: '/gdpr',
    module: 'core',
    roleOnly: 'ownerAdmin',
    sidebarKey: 'core_/gdpr',
  },
  {
    id: 95,
    label: 'nav.webmail',
    icon: 'mail',
    route: '/webmail',
    module: 'core',
    sidebarKey: 'core_/webmail',
  },
  {
    id: 97,
    label: 'nav.adminWebmail',
    icon: 'shield',
    route: '/webmail-admin',
    module: 'core',
    roleOnly: 'adminOnlyWebmail',
    sidebarKey: 'core_/webmail-admin',
  },
  {
    id: 98,
    label: 'nav.inboundMail',
    icon: 'mail',
    route: '/settings/inbound-mail',
    module: 'core',
    roleOnly: 'ownerAdmin',
    sidebarKey: 'core_/inbound-mail',
  },
  {
    id: 103,
    label: 'nav.adminInboundMail',
    icon: 'shield',
    route: '/admin/inbound-mail',
    module: 'core',
    roleOnly: 'adminOnly',
    sidebarKey: 'core_/admin/inbound-mail',
  },
  {
    id: 99,
    label: 'nav.gestionModulos',
    icon: 'sparkles',
    route: '/admin/modulos',
    module: 'core',
    roleOnly: 'adminOnly',
    sidebarKey: 'core_/admin/modulos',
  },
  {
    id: 102,
    label: 'nav.systemHealth',
    icon: 'activity',
    route: '/admin/system-health',
    module: 'core',
    roleOnly: 'adminOnly',
    sidebarKey: 'core_/admin/system-health',
  },
];

/**
 * Production-module nav items — gated by enabled modules in modules_catalog.
 *
 * Note: `Marketing` intentionally keeps a plain (non-transloco) label exactly
 * as it was in the legacy inline array. Transloco keys can be migrated
 * independently in a follow-up.
 */
export const MODULE_NAV_ITEMS: MenuItem[] = [
  {
    id: 100,
    label: 'nav.docs',
    icon: 'book-open',
    route: '/docs',
    module: 'production',
    sidebarKey: 'documentacion',
  },
  {
    id: 3,
    label: 'nav.dispositivos',
    icon: 'smartphone',
    route: '/dispositivos',
    module: 'production',
    moduleKey: 'moduloSAT',
    sidebarKey: 'moduloSAT',
  },
  {
    id: 4,
    label: 'nav.tickets',
    icon: 'ticket',
    route: '/tickets',
    module: 'production',
    moduleKey: 'moduloSAT',
    sidebarKey: 'moduloSAT',
    requiredPermission: ['tickets.view', 'tickets.create'],
  },
  {
    id: 5,
    label: 'nav.chat',
    icon: 'message-circle',
    route: '/chat',
    module: 'production',
    moduleKey: 'moduloChat',
    sidebarKey: 'moduloChat',
  },
  {
    id: 6,
    label: 'nav.presupuestos',
    icon: 'file-text',
    route: '/presupuestos',
    module: 'production',
    moduleKey: 'moduloPresupuestos',
    sidebarKey: 'moduloPresupuestos',
  },
  {
    id: 7,
    label: 'nav.facturacion',
    icon: 'receipt',
    route: '/facturacion',
    module: 'production',
    moduleKey: 'moduloFacturas',
    sidebarKey: 'moduloFacturas',
    requiredPermission: ['invoices.view', 'invoices.create'],
  },
  {
    id: 8,
    label: 'nav.analiticas',
    icon: 'trending-up',
    route: '/analytics',
    module: 'production',
    moduleKey: 'moduloAnaliticas',
    sidebarKey: 'moduloAnaliticas',
  },
  {
    id: 9,
    label: 'nav.productos',
    icon: 'package',
    route: '/productos',
    module: 'production',
    moduleKey: 'moduloProductos',
    sidebarKey: 'moduloProductos',
  },
  {
    id: 10,
    label: 'nav.servicios',
    icon: 'wrench',
    route: '/servicios',
    module: 'production',
    moduleKey: 'moduloServicios',
    sidebarKey: 'moduloServicios',
  },
  {
    id: 11,
    label: 'nav.reservas',
    icon: 'calendar',
    route: '/reservas',
    module: 'production',
    moduleKey: 'moduloReservas',
    sidebarKey: 'moduloReservas',
    requiredPermission: [
      'bookings.view',
      'bookings.view_own',
      'bookings.manage_own',
      'bookings.manage_all',
    ],
  },
  {
    id: 12,
    label: 'nav.conciliacion',
    icon: 'clipboard-check',
    route: '/reservas/conciliacion',
    module: 'production',
    moduleKey: 'moduloReservas',
    sidebarKey: 'moduloReservas',
    requiredPermission: [
      'bookings.view',
      'bookings.view_own',
      'bookings.manage_own',
      'bookings.manage_all',
    ],
  },
  {
    id: 101,
    label: 'nav.proyectos',
    icon: 'layout-grid',
    route: '/projects',
    module: 'production',
    moduleKey: 'moduloProyectos',
    sidebarKey: 'moduloProyectos',
  },
  {
    id: 96,
    label: 'Marketing',
    icon: 'megaphone',
    route: '/marketing',
    module: 'production',
    moduleKey: 'marketing',
    sidebarKey: 'marketing',
  },
];

/** Combined list — equivalent to the legacy `allMenuItems` array. */
export const ALL_NAV_ITEMS: MenuItem[] = [...CORE_NAV_ITEMS, ...MODULE_NAV_ITEMS];

/**
 * Map a sidebar route to its modules_catalog key. Used as a fallback when a
 * MenuItem does not declare an explicit `moduleKey`.
 */
export function routeToModuleKey(route: string): string | null {
  switch (route) {
    case '/tickets':
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
      return null;
  }
}

/**
 * Decide whether a MenuItem is allowed by the user's currently enabled modules.
 * Items without a moduleKey and without a route mapping are always allowed.
 */
export function isMenuItemAllowedByModules(
  item: MenuItem,
  allowed: Set<string>,
): boolean {
  if (item.moduleKey) {
    return allowed.has(item.moduleKey);
  }
  const key = routeToModuleKey(item.route);
  if (!key) return true;
  return allowed.has(key);
}
