/**
 * Canonical module-key namespace + legacy alias map.
 *
 * Source of truth for module identity across the admin UI and the
 * plans/pricing surface. The server holds the same mapping in
 * `public.module_key_canonical_map` (created by migration
 * 20260630000001_align_plans_module_keys.sql). Both MUST stay in sync.
 *
 * The Angular UI reads `plans.included_modules` rows that may still
 * carry legacy keys (pre-migration 0001 data, or a partial migration
 * apply). `LEGACY_MODULE_KEY_ALIASES` resolves those to canonical keys
 * so the UI never displays a raw legacy key.
 */

/** Single source of truth for module catalog entries used by the admin surface. */
export interface SidebarCatalogEntry {
  key: string;
  label: string;
  icon: string;
  category: 'core' | 'production';
}

/** Canonical module keys rendered by the sidebar and admin matrices. */
export const SIDEBAR_CATALOG: ReadonlyArray<SidebarCatalogEntry> = [
  { key: 'core_/inicio',        label: 'Inicio',           icon: 'fa-home',                category: 'core' },
  { key: 'core_/notifications', label: 'Notificaciones',   icon: 'fa-bell',                category: 'core' },
  { key: 'core_/clientes',      label: 'Clientes',         icon: 'fa-users',               category: 'core' },
  { key: 'core_/gdpr',          label: 'RGPD',             icon: 'fa-shield-alt',          category: 'core' },
  { key: 'core_/webmail',       label: 'Webmail',          icon: 'fa-envelope',            category: 'core' },
  { key: 'core_/webmail-admin', label: 'Admin Webmail',    icon: 'fa-shield-alt',          category: 'core' },
  { key: 'core_/admin/modulos', label: 'Gestión Módulos',  icon: 'fa-sliders-h',           category: 'core' },
  { key: 'moduloSAT',           label: 'Dispositivos / Tickets', icon: 'fa-mobile-alt',   category: 'production' },
  { key: 'moduloChat',          label: 'Chat',             icon: 'fa-comments',            category: 'production' },
  { key: 'moduloPresupuestos',  label: 'Presupuestos',     icon: 'fa-file-alt',            category: 'production' },
  { key: 'moduloFacturas',      label: 'Facturación',      icon: 'fa-file-invoice-dollar', category: 'production' },
  { key: 'moduloAnaliticas',    label: 'Analíticas',       icon: 'fa-chart-line',          category: 'production' },
  { key: 'moduloProductos',     label: 'Productos',        icon: 'fa-box-open',            category: 'production' },
  { key: 'moduloServicios',     label: 'Servicios',        icon: 'fa-tools',               category: 'production' },
  { key: 'moduloReservas',      label: 'Reservas',         icon: 'fa-calendar-alt',        category: 'production' },
  { key: 'moduloProyectos',     label: 'Proyectos',        icon: 'fa-project-diagram',     category: 'production' },
  { key: 'marketing',           label: 'Marketing',        icon: 'fa-bullhorn',            category: 'production' },
  { key: 'documentacion',       label: 'Documentación',    icon: 'fa-book',                category: 'production' },
];

/**
 * Legacy plain-key → canonical SIDEBAR_CATALOG key.
 * Mirror of `public.module_key_canonical_map.legacy_key → canonical_key`.
 */
export const LEGACY_MODULE_KEY_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  clientes:     'core_/clientes',
  reservas:     'moduloReservas',
  webmail:      'core_/webmail',
  analiticas:   'moduloAnaliticas',
  facturas:     'moduloFacturas',
  presupuestos: 'moduloPresupuestos',
  facturacion:  'moduloFacturas',
  proyectos:    'moduloProyectos',
  servicios:    'moduloServicios',
  productos:    'moduloProductos',
  dispositivos: 'moduloSAT',
  tickets:      'moduloChat',
  marketing:    'marketing',
});

/** Alias name preferred for external callers (e.g. tests, RPC error messages). */
export const MODULE_KEY_ALIASES = LEGACY_MODULE_KEY_ALIASES;

/** Set of canonical keys for O(1) membership checks. */
export const CANONICAL_MODULE_KEYS: ReadonlySet<string> = new Set(SIDEBAR_CATALOG.map((c) => c.key));

/** Resolve a single legacy or canonical key to its canonical form. */
export function canonicalModuleKey(key: string): string {
  return LEGACY_MODULE_KEY_ALIASES[key] ?? key;
}

/**
 * Canonicalize and de-duplicate a list of module keys. Unknown keys
 * pass through unchanged so future canonical keys added to the server
 * do not require a client release.
 */
export function canonicalizeModules(keys: ReadonlyArray<string>): string[] {
  const out = keys.map((k) => LEGACY_MODULE_KEY_ALIASES[k] ?? k);
  return Array.from(new Set(out));
}

/** True when the key is part of the canonical namespace. */
export function isCanonicalModuleKey(key: string): boolean {
  return CANONICAL_MODULE_KEYS.has(key);
}