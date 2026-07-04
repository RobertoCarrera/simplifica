import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseClientService } from '../../../services/supabase-client.service';
import { SupabaseClient } from '@supabase/supabase-js';
import { AuthService } from '../../../services/auth.service';
import { SupabaseModulesService } from '../../../services/supabase-modules.service';
import { PlanService, Plan, PlanAddon, PlanVisibleModule } from '../../../services/plan.service';
import { ToastService } from '../../../services/toast.service';
import { FA_ICON_CATALOG, FaIconEntry } from '../../../shared/fontawesome-icons';

/** All known sidebar navigation items with their display labels and icons */
const SIDEBAR_CATALOG: { key: string; label: string; icon: string; category: 'core' | 'production' }[] = [
  { key: 'core_/inicio',        label: 'Inicio',           icon: 'fa-home',            category: 'core' },
  { key: 'core_/notifications', label: 'Notificaciones',   icon: 'fa-bell',            category: 'core' },
  { key: 'core_/clientes',      label: 'Clientes',        icon: 'fa-users',           category: 'core' },
  { key: 'core_/gdpr',          label: 'RGPD',             icon: 'fa-shield-alt',      category: 'core' },
  { key: 'core_/webmail',       label: 'Webmail',          icon: 'fa-envelope',        category: 'core' },
  { key: 'core_/webmail-admin', label: 'Admin Webmail',    icon: 'fa-shield-alt',      category: 'core' },
  { key: 'core_/admin/modulos', label: 'Gestión Módulos',  icon: 'fa-sliders-h',       category: 'core' },
  { key: 'moduloSAT',            label: 'Dispositivos / Tickets', icon: 'fa-mobile-alt', category: 'production' },
  { key: 'moduloChat',           label: 'Chat',             icon: 'fa-comments',        category: 'production' },
  { key: 'moduloPresupuestos',  label: 'Presupuestos',     icon: 'fa-file-alt',        category: 'production' },
  { key: 'moduloFacturas',      label: 'Facturación',      icon: 'fa-file-invoice-dollar', category: 'production' },
  { key: 'moduloAnaliticas',    label: 'Analíticas',       icon: 'fa-chart-line',      category: 'production' },
  { key: 'moduloProductos',     label: 'Productos',         icon: 'fa-box-open',        category: 'production' },
  { key: 'moduloServicios',     label: 'Servicios',         icon: 'fa-tools',           category: 'production' },
  { key: 'moduloReservas',      label: 'Reservas',          icon: 'fa-calendar-alt',    category: 'production' },
  { key: 'moduloProyectos',     label: 'Proyectos',         icon: 'fa-project-diagram', category: 'production' },
  { key: 'marketing',          label: 'Marketing',         icon: 'fa-bullhorn',       category: 'production' },
  { key: 'documentacion',      label: 'Documentación',     icon: 'fa-book',           category: 'production' },
];

export interface SidebarOrderItem {
  key: string;
  label: string;
  icon: string;
  category: 'core' | 'production';
  order: number;
  visible: boolean;
  /** @deprecated kept in shape for RPC compatibility but always false — DEV modules are filtered out at load. */
  devMode?: boolean;
  /** Visible para clientes en su sidebar/menú mobile */
  visibleToClients: boolean;
  /** Visible para usuarios del team: profesionales, marketers, admins */
  visibleToTeam: boolean;
}

@Component({
  selector: 'app-modules-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './modules-admin.component.html',
  styleUrls: ['./modules-admin.component.scss']
})
export class ModulesAdminComponent implements OnInit {
  private sb: SupabaseClient = inject(SupabaseClientService).instance;
  private auth = inject(AuthService);
  private modulesService = inject(SupabaseModulesService);
  private planService = inject(PlanService);
  private toast = inject(ToastService);

  loading = signal(false);
  companies: any[] = [];
  companyQuery: string = '';

  // Sidebar order management
  sidebarOrderLoading = signal(false);
  sidebarOrderSaving = signal(false);
  sidebarOrderItems = signal<SidebarOrderItem[]>([]);
  activeTab = signal<'companies' | 'sidebar' | 'modules' | 'addons' | 'pricing'>('companies');

  // Pricing tab state
  pricingLoading = signal(false);
  plans = signal<Plan[]>([]);
  addons = signal<PlanAddon[]>([]);
  pricingSavingKey = signal<string | null>(null); // `${planId}:${moduleKey}` while RPC in flight

  // Modules catalog for resolving module_key → label
  private moduleLabelMap: Record<string, string> = Object.fromEntries(
    SIDEBAR_CATALOG.map((c) => [c.key, c.label])
  );

  // Drag & drop state
  draggedKey = signal<string | null>(null);
  dragOverKey = signal<string | null>(null);

  constructor() {
    // Close the icon picker on any click outside it. Listening on document
    // with capture phase so we beat other click handlers.
    document.addEventListener('click', () => {
      if (this.catalogIconPickerOpen()) {
        this.catalogIconPickerOpen.set(null);
        this.iconPickerAnchor.set(null);
      }
    });
  }

  ngOnInit(): void {
    this.loadCompanies();
    this.loadPricing();
    this.loadSidebarOrder();
    this.loadVisibleModules();
    this.loadModulesCatalog();
  }

  async loadCompanies() {
    this.loading.set(true);
    try {
      const res = await firstValueFrom(this.modulesService.adminListCompanies());
      this.companies = (res?.companies || []);
    } catch (e) {
      console.warn('Error loading companies', e);
      this.toast.error('Error', 'No se pudieron cargar las empresas.');
    } finally {
      this.loading.set(false);
    }
  }

  // Filtered companies for search box
  get filteredCompanies() {
    const q = (this.companyQuery || '').toLowerCase().trim();
    if (!q) return this.companies;
    return this.companies.filter(c =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.id || '').toLowerCase().includes(q)
    );
  }

  async toggleCompanyModule(company: any, moduleKey: string) {
    // Find the module in the company's list
    const mod = company.modules.find((m: any) => m.key === moduleKey);
    if (!mod) return;

    const currentStatus = mod.status;
    const newStatus = (currentStatus === 'active' || currentStatus === 'activado') ? 'inactive' : 'active';

    // Optimistic update
    mod.status = newStatus;

    try {
      const force = !this.isModuleInCompanyPlan(company, moduleKey);
      await firstValueFrom(this.modulesService.adminSetCompanyModule(company.id, moduleKey, newStatus, force));
      this.toast.success('Módulo actualizado', force ? `Módulo forzado ${newStatus === 'active' ? 'activado' : 'desactivado'} (override).` : `El módulo se ha ${newStatus === 'active' ? 'activado' : 'desactivado'}.`);
    } catch (e) {
      console.error('Error toggling module:', e);
      // Revert on error
      mod.status = currentStatus;
      this.toast.error('Error', 'No se pudo actualizar el módulo.');
    }
  }

  getLabel(mod: any) {
    return mod.label || mod.key;
  }

  // ── Visible modules (plan picker curation) ───────────────────────────────
  visibleModules = signal<PlanVisibleModule[]>([]);

  // Modules catalog (editable display labels + per-module DEV toggle)
  modulesCatalog = signal<{ key: string; label: string; is_dev_mode: boolean }[]>([]);
  showVisibleModulePicker = signal(false);
  showAddCatalogModal = signal(false);
  /** Pending icon selection in the "Añadir nuevo módulo" modal: module_key → icon class. */
  newModuleIcon = signal<Record<string, string>>({});

  setNewModuleIcon(key: string, icon: string) {
    this.newModuleIcon.set({ ...this.newModuleIcon(), [key]: icon });
  }
  visibleModulePickerQuery = signal('');

  // ── Add-on editor ────────────────────────────────────────────────────────
  editingAddon = signal<PlanAddon | null>(null);
  editingAddonDraft = signal<Partial<PlanAddon> | null>(null);
  newAddonMode = signal(false);
  addonModuleFilter = signal('');

  // ── Plan editor ──────────────────────────────────────────────────────────
  editingPlan = signal<Plan | null>(null);
  editingDraft = signal<Plan | null>(null);

  // Search query for the icon picker (Spanish + English).
  iconSearchQuery = signal('');

  // Curated list (static subset) used in the add-on edit form.
  static readonly POPULAR_FA_ICONS: readonly string[] = [
    'fa-bullhorn','fa-robot','fa-cogs','fa-file-invoice-dollar',
    'fa-chart-line','fa-box-open','fa-tools','fa-comments',
    'fa-mobile-alt','fa-project-diagram','fa-puzzle-piece','fa-magic',
  ];

  // Full FA 6 catalog with keywords (Spanish + English).
  get FA_ICONS(): readonly FaIconEntry[] {
    return FA_ICON_CATALOG;
  }

  /** Filtered icon list based on the search query. Matches the class name
   *  OR any of the keywords. Spanish keywords work because the FA metadata
   *  includes English terms that translate well; for the common Spanish-only
   *  queries the user can also type the class (e.g. "fa-home"). */
  filteredIcons(): FaIconEntry[] {
    const q = this.iconSearchQuery().toLowerCase().trim();
    if (!q) return FA_ICON_CATALOG.slice(0, 5);
    const qn = q.replace(/^fa-/, '').replace(/^fa/, '');
    // Map a few common Spanish queries to English equivalents the catalog uses.
    const es2en: Record<string, string[]> = {
      'casa': ['house','home'], 'hogar': ['house','home'],
      'usuario': ['user','users','person'], 'persona': ['user','person'],
      'dinero': ['money','dollar','wallet','coins','cash'],
      'pago': ['credit-card','money','dollar','wallet'],
      'correo': ['envelope','mail'], 'email': ['envelope','mail'],
      'cohete': ['rocket'], 'robot': ['robot','android'],
      'dinamica': ['chart-line','chart-bar','chart-pie','chart-area','gauge'],
      'mando': ['gamepad','terminal'], 'consola': ['terminal','gamepad'],
      'configuracion': ['gear','gears','sliders','cogs','cog'],
      'ajustes': ['gear','sliders'],
      'mensaje': ['message','comment','envelope','mail'],
      'comentario': ['comment','message','comments'],
      'seguridad': ['shield','lock','key','shield-halved'],
      'candado': ['lock','key'],
      'carrito': ['cart-shopping','bag-shopping','basket-shopping'],
      'tienda': ['store','cart-shopping','bag-shopping'],
      'archivo': ['file','folder','folder-open','file-lines','file-code'],
      'calendario': ['calendar','calendar-days','calendar-check','calendar-plus'],
      'reloj': ['clock','calendar'],
      'herramienta': ['tools','wrench','screwdriver-wrench','hammer'],
      'camara': ['camera','video','film'],
      'telefono': ['phone','mobile','mobile-screen','mobile-screen-button'],
      'corazon': ['heart'], 'favorito': ['heart','star'],
      'estrella': ['star'],
      'coche': ['car','truck','van-shuttle'],
      'engranaje': ['gear','cog','gears','cogs'],
      'llave': ['key'],
    };
    const extras = es2en[q] || [];
    return FA_ICON_CATALOG.filter(
      (e) =>
        e.class.includes(q) ||
        e.keywords.toLowerCase().includes(q) ||
        e.class.replace('fa-', '').includes(qn) ||
        extras.some((s) => e.class.includes(s))
    ).slice(0, 240);
  }

  isEditorEnabled(): boolean { return this.isSuperAdmin(); }

  isModuleInCompanyPlan(company: any, moduleKey: string): boolean {
    const planId = company?.subscription_tier;
    if (!planId) return false;
    const plan = this.plans().find((p) => p.id === planId);
    if (!plan) return false;
    if (plan.included_modules?.includes(moduleKey)) return true;
    return this.addons().some((a) =>
      a.is_active &&
      (a.applies_to_plans?.length === 0 || a.applies_to_plans.includes(planId)) &&
      a.included_modules?.includes(moduleKey)
    );
  }

  isImplicitModule(moduleKey: string): boolean {
    return moduleKey === 'core_/inicio';
  }

  /**
   * Modules of a company that are assignable in the Empresas tab.
   * Filters out modules marked as DEV in the catalog (super_admin only)
   * and superadmin-only surface keys. Use this in the company card template
   * instead of `c.modules` directly.
   */
  visibleCompanyModules(company: any): any[] {
    const devKeys = new Set(this.modulesCatalog().filter((m: any) => m.is_dev_mode).map((m: any) => m.key));
    return (company?.modules ?? []).filter(
      (m: any) => !devKeys.has(m.key) && !ModulesAdminComponent.SUPERADMIN_MODULE_KEYS.includes(m.key)
    );
  }

  static readonly SUPERADMIN_MODULE_KEYS: readonly string[] = [
    'core_/webmail-admin', 'core_/admin-modulos',
  ];

  moduleIcon(key: string): string {
    // First check the editable backend catalog (modules_catalog) — has the
    // admin-curated icon.
    const fromCatalog = this.modulesCatalog().find((m: any) => m.key === key);
    if ((fromCatalog as any)?.icon) return (fromCatalog as any).icon;
    // Then the plan picker (plan_visible_modules).
    const curated = this.visibleModules().find((m) => m.module_key === key);
    if (curated?.icon) return curated.icon;
    return 'fa-cube';
  }

  get availableModuleKeys(): string[] {
    const visible = this.visibleModules().map((m) => m.module_key);
    if (visible.length > 0) return visible;
    // Fallback: derive from the local catalog so the picker always shows entries
    // even if the plan_visible_modules RPC failed or returned 0 rows.
    return Object.keys(this.moduleLabelMap);
  }

  async loadVisibleModules() {
    try {
      const list = await firstValueFrom(this.planService.getVisibleModules());
      this.visibleModules.set(list);
    } catch (e) { console.error('Error loading visible modules:', e); }
  }

  addableAddonModules(): Array<{ key: string; label: string; icon: string }> {
    // Source of truth: local catalog + backend DEV filter.
    // Whatever is in plan_visible_modules but not DEV-flagged in modules_catalog is allowed.
    const devKeys = new Set(this.modulesCatalog().filter((m: any) => m.is_dev_mode).map((m: any) => m.key));
    const curatedIcons = new Map(
      this.modulesCatalog()
        .filter((m: any) => !!(m as any).icon)
        .map((m: any) => [m.key, (m as any).icon])
    );
    const sidebarIcons = new Map(SIDEBAR_CATALOG.map((c) => [c.key, c.icon]));
    return Object.entries(this.moduleLabelMap)
      .filter(([k]) => !devKeys.has(k) && !ModulesAdminComponent.SUPERADMIN_MODULE_KEYS.includes(k))
      .map(([k, v]) => ({ key: k, label: v, icon: curatedIcons.get(k) || sidebarIcons.get(k) || 'fa-cube' }));
  }

  get addableModuleKeys(): Array<{ key: string; label: string; icon: string }> {
    const visible = new Set(this.visibleModules().map((m) => m.module_key));
    const devKeys = new Set(this.modulesCatalog().filter((m: any) => m.is_dev_mode).map((m: any) => m.key));
    const curatedIcons = new Map(
      this.modulesCatalog()
        .filter((m: any) => !!(m as any).icon)
        .map((m: any) => [m.key, (m as any).icon])
    );
    const sidebarIcons = new Map(SIDEBAR_CATALOG.map((c) => [c.key, c.icon]));
    return Object.entries(this.moduleLabelMap)
      .filter(([k]) => !visible.has(k) && !devKeys.has(k) && !ModulesAdminComponent.SUPERADMIN_MODULE_KEYS.includes(k))
      .map(([k, v]) => ({ key: k, label: v, icon: curatedIcons.get(k) || sidebarIcons.get(k) || 'fa-cube' }));
  }

  filteredAddableModules() {
    const q = this.visibleModulePickerQuery().toLowerCase().trim();
    const all = this.addableModuleKeys;
    if (!q) return all;
    return all.filter((m) => m.label.toLowerCase().includes(q) || m.key.toLowerCase().includes(q));
  }

  async addVisibleModuleFromCatalog(moduleKey: string) {
    const entry = Object.entries(this.moduleLabelMap).find(([k]) => k === moduleKey);
    const label = entry?.[1] || moduleKey;
    try {
      await firstValueFrom(this.planService.addVisibleModule(moduleKey, label, 'fa-cube'));
      await this.loadVisibleModules();
      this.toast.success('Módulo añadido', '"' + label + '" aparece ahora.');
    } catch (e) { this.toast.error('Error', (e as any)?.message || 'No se pudo añadir.'); }
  }

  async removeVisibleModule(moduleKey: string) {
    const label = this.moduleLabelMap[moduleKey] || moduleKey;
    if (!confirm('¿Quitar "' + label + '" del plan picker?')) return;
    try {
      await firstValueFrom(this.planService.removeVisibleModule(moduleKey));
      await this.loadVisibleModules();
      this.toast.success('Quitado', '"' + label + '" ya no aparece.');
    } catch (e) { this.toast.error('Error', (e as any)?.message || 'No se pudo quitar.'); }
  }

  // ── Modules catalog (editable label + per-module DEV toggle) ──────────────
  async loadModulesCatalog() {
    try {
      const list = await firstValueFrom(this.modulesService.adminListModulesCatalog());
      this.modulesCatalog.set(list as any);
    } catch (e) { console.error('Error loading modules catalog:', e); }
  }

  async addModuleFromCatalog(key: string, label: string, icon: string = 'fa-cube') {
    try {
      await firstValueFrom(this.modulesService.adminAddModuleCatalog(key, label, icon));
      // Reload PostgREST schema cache so the freshly-inserted row is visible
      // to the next query without raising 'column not found in schema cache'.
      try { await firstValueFrom(this.modulesService.reloadSchemaCache()); } catch { /* best-effort */ }
      await this.loadModulesCatalog();
      this.toast.success('Módulo añadido', '"' + label + '" se ha añadido al catálogo.');
    } catch (e: any) {
      this.toast.error('Error', e?.message || 'No se pudo añadir.');
    }
  }

  async deleteModuleFromCatalog(key: string, label: string) {
    if (!confirm('¿Eliminar "' + label + '" del catálogo de módulos?')) return;
    try {
      await firstValueFrom(this.modulesService.adminDeleteModuleCatalog(key));
      await this.loadModulesCatalog();
      this.toast.success('Módulo eliminado', '"' + label + '" se ha eliminado.');
    } catch (e: any) {
      this.toast.error('Error', e?.message || 'No se pudo eliminar.');
    }
  }

  /**
   * Modules from the local SIDEBAR_CATALOG that are NOT yet present in the
   * backend `modules_catalog` table. Used by the "Añadir nuevo módulo" modal
   * on the Catálogo de módulos tab so the admin can promote them.
   */
  get addableCatalogKeys(): Array<{ key: string; label: string; icon: string }> {
    const existing = new Set(this.modulesCatalog().map((m: any) => m.key));
    // Build map of curated icons (from editable catalog) keyed by module_key
    const curatedIcons = new Map(
      this.modulesCatalog()
        .filter((m: any) => !!(m as any).icon)
        .map((m: any) => [m.key, (m as any).icon])
    );
    // Fallback to the static SIDEBAR_CATALOG icon if not in curated
    const sidebarIcons = new Map(SIDEBAR_CATALOG.map((c) => [c.key, c.icon]));
    return Object.entries(this.moduleLabelMap)
      .filter(([k]) => !existing.has(k) && !ModulesAdminComponent.SUPERADMIN_MODULE_KEYS.includes(k))
      .map(([k, v]) => ({ key: k, label: v, icon: curatedIcons.get(k) || sidebarIcons.get(k) || 'fa-cube' }));
  }

  async saveModuleCatalog(key: string, label: string, isDevMode: boolean, icon: string = 'fa-cube') {
    try {
      await firstValueFrom(this.modulesService.adminUpdateModuleCatalog(key, label, isDevMode, icon));
      await this.loadModulesCatalog();
      this.toast.success('Módulo actualizado', '"' + label + '" guardado.');
    } catch (e: any) {
      this.toast.error('Error', e?.message || 'No se pudo guardar.');
    }
  }

  editingCatalogDraft = signal<Record<string, { label: string; isDevMode: boolean; icon: string }>>({});
  /** Key of the module whose icon picker is currently open in the Catálogo grid (null = closed). */
  catalogIconPickerOpen = signal<string | null>(null);

  startCatalogEdit(key: string, label: string, isDevMode: boolean, icon: string) {
    this.editingCatalogDraft.set({ ...this.editingCatalogDraft(), [key]: { label, isDevMode, icon } });
    this.catalogIconPickerOpen.set(null);
  }

  updateCatalogDraft(key: string, patch: Partial<{ label: string; isDevMode: boolean; icon: string }>) {
    const current = this.editingCatalogDraft()[key];
    if (!current) return;
    this.editingCatalogDraft.set({ ...this.editingCatalogDraft(), [key]: { ...current, ...patch } });
  }

  setCatalogIcon(key: string, icon: string) {
    this.updateCatalogDraft(key, { icon });
  }

  toggleCatalogIconPicker(key: string, event?: MouseEvent) {
    if (this.catalogIconPickerOpen() === key) {
      this.catalogIconPickerOpen.set(null);
      this.iconPickerAnchor.set(null);
      return;
    }
    this.catalogIconPickerOpen.set(key);
    // Capture the button's viewport-relative position so we can render the
    // popup as position:fixed (which escapes any stacking-context the
    // sidebar creates and won't get clipped by ancestor overflow).
    const btn = (event?.currentTarget as HTMLElement) ?? null;
    if (btn) {
      const rect = btn.getBoundingClientRect();
      this.iconPickerAnchor.set({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
  }

  /** Viewport coordinates of the currently-open icon picker, or null. */
  iconPickerAnchor = signal<{ top: number; right: number } | null>(null);
  pickerPosition = computed(() => this.iconPickerAnchor() ?? { top: 0, right: 0 });

  async saveCatalogEdit(key: string) {
    const draft = this.editingCatalogDraft()[key];
    if (!draft) return;
    if (!draft.label.trim()) { this.toast.error('Validación', 'El nombre es obligatorio.'); return; }
    await this.saveModuleCatalog(key, draft.label.trim(), draft.isDevMode, draft.icon);
    const all = { ...this.editingCatalogDraft() };
    delete all[key];
    this.editingCatalogDraft.set(all);
  }

  cancelCatalogEdit(key: string) {
    const all = { ...this.editingCatalogDraft() };
    delete all[key];
    this.editingCatalogDraft.set(all);
  }

  isAddonEditorOpen(): boolean {
    return this.editingAddon() !== null || this.newAddonMode();
  }

  startNewAddon() {
    this.editingAddon.set(null);
    this.newAddonMode.set(true);
    this.editingAddonDraft.set({
      id: '', name: '', description: '', icon: 'fa-puzzle-piece',
      price_eur_cents: 0, currency: 'EUR', applies_to_plans: [],
      included_modules: [], sort_order: (this.addons().at(-1)?.sort_order ?? 0) + 10,
      is_active: true,
    } as any);
    this.addonModuleFilter.set('');
  }

  startAddonEdit(addon: PlanAddon) {
    this.editingAddon.set(addon);
    this.newAddonMode.set(false);
    this.editingAddonDraft.set({ ...addon });
    this.addonModuleFilter.set('');
  }

  cancelAddonEdit() {
    this.editingAddon.set(null);
    this.editingAddonDraft.set(null);
    this.newAddonMode.set(false);
    this.addonModuleFilter.set('');
  }

  toggleAddonPlan(planId: string) {
    const draft = this.editingAddonDraft();
    if (!draft) return;
    const current = Array.isArray(draft.applies_to_plans) ? draft.applies_to_plans : [];
    const next = current.includes(planId) ? current.filter((p) => p !== planId) : [...current, planId];
    this.editingAddonDraft.set({ ...draft, applies_to_plans: next });
  }

  toggleAddonModule(moduleKey: string) {
    const draft = this.editingAddonDraft();
    if (!draft) return;
    const current = Array.isArray(draft.included_modules) ? draft.included_modules : [];
    const next = current.includes(moduleKey) ? current.filter((k) => k !== moduleKey) : [...current, moduleKey];
    this.editingAddonDraft.set({ ...draft, included_modules: next });
  }

  filteredModuleKeys(): string[] {
    const q = this.addonModuleFilter().toLowerCase().trim();
    if (!q) return this.availableModuleKeys;
    return this.availableModuleKeys.filter((k) => this.moduleLabel(k).toLowerCase().includes(q));
  }

  moduleOwnerName(addonId: string, moduleKey: string): string | null {
    for (const a of this.addons()) {
      if (a.id === addonId) continue;
      if ((a.included_modules ?? []).includes(moduleKey)) return a.name;
    }
    return null;
  }

  eurosToCents(euros: string | number): number {
    const n = parseFloat(String(euros));
    return isNaN(n) ? 0 : Math.round(n * 100);
  }

  private validateAddonDraft(draft: Partial<PlanAddon> | null): string | null {
    if (!draft) return 'No hay borrador.';
    if (!draft.id || !String(draft.id).trim()) return 'El identificador es obligatorio.';
    if (!/^[a-z0-9_-]+$/i.test(String(draft.id))) return 'ID: solo letras, números, - y _.';
    if (!draft.name || !String(draft.name).trim()) return 'El nombre es obligatorio.';
    return null;
  }

  async saveAddon() {
    const draft = this.editingAddonDraft();
    const err = this.validateAddonDraft(draft);
    if (err) { this.toast.error('Validación', err); return; }
    const payload: PlanAddon = {
      id: String(draft!.id).trim(),
      name: String(draft!.name).trim(),
      description: draft!.description ?? '',
      icon: String(draft!.icon).trim(),
      price_eur_cents: Number(draft!.price_eur_cents),
      currency: draft!.currency ?? 'EUR',
      applies_to_plans: Array.isArray(draft!.applies_to_plans) ? draft!.applies_to_plans : [],
      included_modules: Array.isArray(draft!.included_modules) ? draft!.included_modules : [],
      sort_order: Number(draft!.sort_order ?? 0),
      is_active: !!draft!.is_active,
      created_at: draft!.created_at ?? '',
      updated_at: draft!.updated_at ?? '',
    };
    try {
      await firstValueFrom(this.planService.updateAddon(payload));
      this.cancelAddonEdit();
      this.toast.success('Add-on guardado', '"' + payload.name + '" guardado.');
    } catch (e) { this.toast.error('Error', (e as any)?.message || 'No se pudo guardar.'); }
  }

  async deleteAddonConfirm(addon: PlanAddon) {
    if (!confirm('¿Eliminar "' + addon.name + '"? No se puede deshacer.')) return;
    try {
      await firstValueFrom(this.planService.deleteAddon(addon.id));
      this.toast.success('Add-on eliminado', '"' + addon.name + '" eliminado.');
    } catch (e) { this.toast.error('Error', (e as any)?.message || 'No se pudo eliminar.'); }
  }

  onAddonDrop(event: any) {
    const items = [...this.addons()];
    const [m] = items.splice(event.previousIndex, 1);
    items.splice(event.currentIndex, 0, m);
    this.addons.set(items.map((a, i) => ({ ...a, sort_order: (i + 1) * 10 })));
  }

  // ── Plan editor ──────────────────────────────────────────────────────────
  startEdit(plan: Plan) {
    this.editingPlan.set(plan);
    this.editingDraft.set({ ...plan });
  }

  cancelEdit() {
    this.editingPlan.set(null);
    this.editingDraft.set(null);
  }

  async updatePlanMetadata() {
    const draft = this.editingDraft();
    if (!draft) return;
    try {
      await firstValueFrom(this.planService.updatePlan(draft));
      this.cancelEdit();
      this.toast.success('Plan actualizado', '"' + draft.name + '" guardado.');
    } catch (e: any) {
      this.toast.error('Error', e?.message || 'No se pudo guardar el plan.');
    }
  }

  // ── Sidebar Order Management ────────────────────────────────────────────────

  async loadSidebarOrder() {
    this.sidebarOrderLoading.set(true);
    try {
      const { data, error } = await this.sb.rpc('get_sidebar_navigation_order');
      if (error) throw error;

      const orderMap = new Map<string, { order: number; visible: boolean; devMode: boolean; visibleToClients: boolean; visibleToTeam: boolean }>(
        (data || []).map((r: any) => [r.module_key, {
          order: r.order_index,
          visible: r.is_visible,
          devMode: r.is_dev_mode ?? false,
          visibleToClients: r.visible_to_clients ?? true,
          visibleToTeam: r.visible_to_team ?? true,
        }])
      );

      // Build items: start with catalog, apply saved order/visibility
      const devKeys = new Set(this.modulesCatalog().filter((m: any) => m.is_dev_mode).map((m: any) => m.key));
      // Build a map of admin-curated icons from modules_catalog so the
      // Orden del Sidebar reflects the icon chosen in the Catálogo de módulos.
      const curatedIcons = new Map(
        this.modulesCatalog()
          .filter((m: any) => !!(m as any).icon)
          .map((m: any) => [m.key, (m as any).icon])
      );
      this.sidebarOrderItems.set(
        SIDEBAR_CATALOG
          .filter((cat) => !devKeys.has(cat.key))
          .map((cat) => {
            const saved = orderMap.get(cat.key);
            return {
              key: cat.key,
              label: cat.label,
              icon: curatedIcons.get(cat.key) || cat.icon,
              category: cat.category,
              order: saved?.order ?? null as any,
              visible: saved?.visible ?? true,
              visibleToClients: saved?.visibleToClients ?? true,
              visibleToTeam: saved?.visibleToTeam ?? true,
            };
          }).sort((a, b) => {
          // Sort: custom order first, then core items, then by id fallback
          if (a.order !== null && b.order !== null) return a.order - b.order;
          if (a.order !== null) return -1;
          if (b.order !== null) return 1;
          // Fallback: core before production, then by label
          if (a.category !== b.category) return a.category === 'core' ? -1 : 1;
          return a.label.localeCompare(b.label);
        })
      );
    } catch (e: any) {
      this.toast.error('Error', 'No se pudo cargar el orden del sidebar.');
    } finally {
      this.sidebarOrderLoading.set(false);
    }
  }

  async saveSidebarOrder() {
    this.sidebarOrderSaving.set(true);
    try {
      const entries = this.sidebarOrderItems().map((item, index) => ({
        module_key: item.key,
        order_index: item.order ?? index,
        is_visible: item.visible,
        is_dev_mode: false,
        visible_to_clients: item.visibleToClients,
        visible_to_team: item.visibleToTeam,
      }));

      await firstValueFrom(this.modulesService.adminUpdateSidebarOrder(entries));
      this.toast.success('Orden guardado', 'El orden del sidebar se ha guardado correctamente.');
    } catch (e: any) {
      this.toast.error('Error', e.message || 'No se pudo guardar el orden del sidebar.');
    } finally {
      this.sidebarOrderSaving.set(false);
    }
  }

  moveItemUp(item: SidebarOrderItem) {
    const items = [...this.sidebarOrderItems()];
    const idx = items.findIndex((i) => i.key === item.key);
    if (idx <= 0) return;
    // Swap order values with the item above
    const above = items[idx - 1];
    const tempOrder = above.order;
    above.order = item.order;
    item.order = tempOrder;
    // Re-sort and re-assign sequential orders to fill gaps
    items.sort((a, b) => {
      if (a.order !== null && b.order !== null) return a.order - b.order;
      if (a.order !== null) return -1;
      if (b.order !== null) return 1;
      return a.label.localeCompare(b.label);
    });
    // Normalize orders to be sequential starting from 0
    items.forEach((it, i) => { it.order = i; });
    this.sidebarOrderItems.set(items);
  }

  moveItemDown(item: SidebarOrderItem) {
    const items = [...this.sidebarOrderItems()];
    const idx = items.findIndex((i) => i.key === item.key);
    if (idx < 0 || idx >= items.length - 1) return;
    const below = items[idx + 1];
    const tempOrder = below.order;
    below.order = item.order;
    item.order = tempOrder;
    items.sort((a, b) => {
      if (a.order !== null && b.order !== null) return a.order - b.order;
      if (a.order !== null) return -1;
      if (b.order !== null) return 1;
      return a.label.localeCompare(b.label);
    });
    items.forEach((it, i) => { it.order = i; });
    this.sidebarOrderItems.set(items);
  }

  onDragStart(item: SidebarOrderItem) {
    this.draggedKey.set(item.key);
  }

  onDragOver(event: DragEvent, item: SidebarOrderItem) {
    event.preventDefault();
    if (this.draggedKey() !== item.key) {
      this.dragOverKey.set(item.key);
    }
  }

  onDrop(targetItem: SidebarOrderItem) {
    const dragKey = this.draggedKey();
    this.draggedKey.set(null);
    this.dragOverKey.set(null);
    if (!dragKey || dragKey === targetItem.key) return;
    const items = [...this.sidebarOrderItems()];
    const fromIdx = items.findIndex((i) => i.key === dragKey);
    const toIdx = items.findIndex((i) => i.key === targetItem.key);
    if (fromIdx < 0 || toIdx < 0) return;
    const [moved] = items.splice(fromIdx, 1);
    items.splice(toIdx, 0, moved);
    items.forEach((it, i) => { it.order = i; });
    this.sidebarOrderItems.set(items);
  }

  onDragEnd() {
    this.draggedKey.set(null);
    this.dragOverKey.set(null);
  }

  toggleItemVisible(item: SidebarOrderItem) {
    const items = [...this.sidebarOrderItems()];
    const idx = items.findIndex((i) => i.key === item.key);
    if (idx < 0) return;
    items[idx] = { ...items[idx], visible: !items[idx].visible };
    this.sidebarOrderItems.set(items);
  }

  toggleItemDevMode(item: SidebarOrderItem) {
    const items = [...this.sidebarOrderItems()];
    const idx = items.findIndex((i) => i.key === item.key);
    if (idx < 0) return;
    items[idx] = { ...items[idx], devMode: !items[idx].devMode };
    this.sidebarOrderItems.set(items);
  }

  toggleItemVisibleToClients(item: SidebarOrderItem) {
    const items = [...this.sidebarOrderItems()];
    const idx = items.findIndex((i) => i.key === item.key);
    if (idx < 0) return;
    items[idx] = { ...items[idx], visibleToClients: !items[idx].visibleToClients };
    this.sidebarOrderItems.set(items);
  }

  toggleItemVisibleToTeam(item: SidebarOrderItem) {
    const items = [...this.sidebarOrderItems()];
    const idx = items.findIndex((i) => i.key === item.key);
    if (idx < 0) return;
    items[idx] = { ...items[idx], visibleToTeam: !items[idx].visibleToTeam };
    this.sidebarOrderItems.set(items);
  }

  isSuperAdmin(): boolean {
    const role = this.auth.userRole();
    return role === 'super_admin' || !!this.auth.userProfile?.is_super_admin;
  }

  switchTab(tab: 'companies' | 'sidebar' | 'modules' | 'addons' | 'pricing') {
    this.activeTab.set(tab);
    if (tab === 'sidebar' || tab === 'modules') this.loadSidebarOrder();
    if (tab === 'pricing' || tab === 'modules' || tab === 'addons') this.loadPricing();
    if (tab === 'modules') {
      this.loadVisibleModules();
      this.loadModulesCatalog();
    }
    // The icon catalog is used by 3 places (sidebar order, plan matrix,
    // add-on modules picker), so always ensure it's loaded.
    this.loadModulesCatalog();
  }

  // ── Pricing tab ────────────────────────────────────────────────────────────

  async loadPricing() {
    // Skip if already loaded in this session
    if (this.plans().length > 0 && this.addons().length > 0) return;
    this.pricingLoading.set(true);
    try {
      const [plans, addons] = await Promise.all([
        firstValueFrom(this.planService.getPlans()),
        firstValueFrom(this.planService.getAddons()),
      ]);
      this.plans.set(plans);
      this.addons.set(addons);
    } catch (e) {
      console.error('Error loading pricing:', e);
      this.toast.error('Error', 'No se pudo cargar el catálogo de planes.');
    } finally {
      this.pricingLoading.set(false);
    }
  }

  formatPrice(cents: number, currency: string) {
    return PlanService.formatPriceFull(cents, currency);
  }

  formatExtraUserPrice(cents: number, currency: string) {
    return PlanService.formatPrice(cents, currency) + '/usuario extra';
  }

  moduleLabel(key: string): string {
    // Prefer the backend catalog label (admin-editable) over the local SIDEBAR_CATALOG.
    const fromCatalog = this.modulesCatalog().find((m: any) => m.key === key);
    if (fromCatalog?.label) return fromCatalog.label;
    return this.moduleLabelMap[key] || key;
  }

  isModuleInPlan(plan: Plan, moduleKey: string): boolean {
    return plan.included_modules.includes(moduleKey);
  }

  /**
   * Toggle a module in/out of a plan's included_modules.
   * Optimistic update: flips the local signal first, then calls the RPC.
   * On error, reverts and shows a toast.
   */
  async toggleModuleInPlan(plan: Plan, moduleKey: string) {
    const wasIncluded = this.isModuleInPlan(plan, moduleKey);
    const wantIncluded = !wasIncluded;
    const key = `${plan.id}:${moduleKey}`;
    this.pricingSavingKey.set(key);

    // Optimistic local update
    const updated: Plan = {
      ...plan,
      included_modules: wantIncluded
        ? Array.from(new Set([...plan.included_modules, moduleKey]))
        : plan.included_modules.filter((k) => k !== moduleKey),
    };
    this.plans.set(this.plans().map((p) => (p.id === plan.id ? updated : p)));

    try {
      await firstValueFrom(this.planService.togglePlanModule(plan, moduleKey, wantIncluded));
      this.toast.success(
        'Plan actualizado',
        wantIncluded
          ? `${this.moduleLabel(moduleKey)} añadido a ${plan.name}.`
          : `${this.moduleLabel(moduleKey)} quitado de ${plan.name}.`,
      );
    } catch (e: any) {
      // Revert
      this.plans.set(this.plans().map((p) => (p.id === plan.id ? plan : p)));
      console.error('Error updating plan module:', e);
      this.toast.error('Error', e?.message || 'No se pudo actualizar el plan.');
    } finally {
      this.pricingSavingKey.set(null);
    }
  }

  isPricingCellSaving(planId: string, moduleKey: string): boolean {
    return this.pricingSavingKey() === `${planId}:${moduleKey}`;
  }

  /** Add-ons that apply to a given plan (empty applies_to_plans = applies to all). */
  addonsForPlan(planId: string): PlanAddon[] {
    return this.addons().filter(
      (a) => a.applies_to_plans.length === 0 || a.applies_to_plans.includes(planId)
    );
  }

  // Expose static helpers for template usage (Angular templates can't call static methods directly).
  formatAddonPrice(cents: number, currency: string): string {
    return PlanService.formatPrice(cents, currency);
  }
}
