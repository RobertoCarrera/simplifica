import { Component, OnInit, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseClientService } from '../../../services/supabase-client.service';
import { SupabaseClient } from '@supabase/supabase-js';
import { AuthService } from '../../../services/auth.service';
import { SupabaseModulesService } from '../../../services/supabase-modules.service';
import { PlanService, Plan, PlanAddon } from '../../../services/plan.service';
import { ToastService } from '../../../services/toast.service';
import { SIDEBAR_CATALOG } from '../../../shared/module-keys';
import { SeatBadgeComponent } from '../../../shared/seat-badge.component';

export interface SidebarOrderItem {
  key: string;
  label: string;
  icon: string;
  category: 'core' | 'production';
  order: number;
  visible: boolean;
  devMode: boolean;
  /** Visible para clientes en su sidebar/menú mobile */
  visibleToClients: boolean;
  /** Visible para usuarios del team: profesionales, marketers, admins */
  visibleToTeam: boolean;
}

@Component({
  selector: 'app-modules-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, SeatBadgeComponent],
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
  activeTab = signal<'companies' | 'sidebar' | 'pricing'>('companies');

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

  ngOnInit(): void {
    this.loadCompanies();
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
      await firstValueFrom(this.modulesService.adminSetCompanyModule(company.id, moduleKey, newStatus));
      this.toast.success('Módulo actualizado', `El módulo se ha ${newStatus === 'active' ? 'activado' : 'desactivado'} correctamente.`);
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
      this.sidebarOrderItems.set(
        SIDEBAR_CATALOG.map((cat) => {
          const saved = orderMap.get(cat.key);
          return {
            key: cat.key,
            label: cat.label,
            icon: cat.icon,
            category: cat.category,
            order: saved?.order ?? null as any,
            visible: saved?.visible ?? true,
            devMode: saved?.devMode ?? false,
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
        is_dev_mode: item.devMode,
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
    return role === 'super_admin' || !!this.auth.userProfile?.is_super_admin || this.auth.isEmergencySuperAdmin();
  }

  switchTab(tab: 'companies' | 'sidebar' | 'pricing') {
    this.activeTab.set(tab);
    if (tab === 'sidebar') this.loadSidebarOrder();
    if (tab === 'pricing') this.loadPricing();
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

  formatPrice(cents: number, currency: string, period: 'monthly' | 'yearly') {
    return PlanService.formatPriceFull(cents, currency, period);
  }

  formatExtraUserPrice(cents: number, currency: string) {
    return PlanService.formatPrice(cents, currency, 'monthly') + '/usuario extra';
  }

  moduleLabel(key: string): string {
    return this.moduleLabelMap[key] || key;
  }

  /** All module keys available in the catalog (derived from SIDEBAR_CATALOG). */
  get availableModuleKeys(): string[] {
    return Object.keys(this.moduleLabelMap);
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
  formatAddonPrice(cents: number, currency: string, period: 'monthly' | 'yearly'): string {
    return PlanService.formatPrice(cents, currency, period);
  }

  // ── Seat badge (F-SEAT-004) ────────────────────────────────────────────────
  // The SeatBadgeComponent is intentionally stateless and only emits a
  // click event. For now we surface a toast with the company id; a future
  // PR will wire this to a members-breakdown side panel.
  onSeatBadgeClick(company: any): void {
    const max = company?.max_users ?? null;
    const current = company?.seat_current ?? 0;
    if (max === null) {
      this.toast.info('Sin límite de plazas', `${company?.name || 'Esta empresa'} no tiene tope de plazas configurado.`);
      return;
    }
    this.toast.info(
      'Plazas ocupadas',
      `${company?.name || 'Empresa'}: ${current} / ${max} plazas no-client usadas.`,
    );
  }

  // ── Add-ons editor (F-ADDON-001..005) ─────────────────────────────────────

  /** PR 4: which add-on is currently in the inline-edit form. null = no editor open. */
  editingAddon = signal<PlanAddon | null>(null);
  /** PR 4: working copy bound to the inline edit form ngModel controls. */
  editingAddonDraft = signal<Partial<PlanAddon> | null>(null);
  /** PR 4: true when the editor is in "new add-on" mode vs "edit existing". */
  newAddonMode = signal<boolean>(false);
  /** PR 4: which add-on row is currently saving (for spinner). null = idle. */
  addonSavingId = signal<string | null>(null);

  /** Open the editor for an existing add-on (PR 4, F-ADDON-002). */
  startAddonEdit(addon: PlanAddon): void {
    this.newAddonMode.set(false);
    this.editingAddon.set(addon);
    this.editingAddonDraft.set({ ...addon });
  }

  /** Open the editor in "create" mode for a brand-new add-on (F-ADDON-003). */
  startNewAddon(): void {
    const existingIds = this.addons().map((a) => a.id);
    const maxSort = this.addons().reduce((m, a) => Math.max(m, a.sort_order), 0);
    this.newAddonMode.set(true);
    this.editingAddon.set(null);
    this.editingAddonDraft.set({
      id: '',
      name: '',
      description: '',
      icon: 'fa-puzzle-piece',
      price_cents: 0,
      currency: 'EUR',
      billing_period: 'monthly',
      applies_to_plans: [],
      sort_order: maxSort + 10,
      is_active: true,
      _existingIds: existingIds,
    } as any);
  }

  /** Close the editor without saving. */
  cancelAddonEdit(): void {
    this.editingAddon.set(null);
    this.editingAddonDraft.set(null);
    this.newAddonMode.set(false);
  }

  /**
   * Validate the add-on draft before saving. Returns the first error
   * message or null. Mirrors the plan-edit validation style (F-PCA-002).
   */
  private validateAddonDraft(draft: Partial<PlanAddon> | null): string | null {
    if (!draft) return 'No hay borrador para guardar.';
    if (!draft.id || !String(draft.id).trim()) return 'El identificador (id) es obligatorio.';
    if (!/^[a-z0-9_-]+$/i.test(String(draft.id))) return 'El identificador solo puede tener letras, números, guiones y guiones bajos.';
    if (!draft.name || !String(draft.name).trim()) return 'El nombre es obligatorio.';
    if (typeof draft.price_cents !== 'number' || !Number.isFinite(draft.price_cents) || draft.price_cents < 0) {
      return 'El precio debe ser un número ≥ 0 (en céntimos).';
    }
    if (!draft.icon || !String(draft.icon).trim()) return 'El icono es obligatorio.';
    return null;
  }

  /**
   * Persist the add-on draft via planService.updateAddon(). Translates
   * the typed 42501 + 23505 errors into Spanish toasts and updates the
   * local addons signal optimistically on success.
   */
  async saveAddon(): Promise<void> {
    const draft = this.editingAddonDraft() as Partial<PlanAddon> | null;
    if (!draft) return;
    const validation = this.validateAddonDraft(draft);
    if (validation) {
      this.toast.error('Validación', validation);
      return;
    }
    const payload: PlanAddon = {
      id: String(draft.id).trim(),
      name: String(draft.name).trim(),
      description: draft.description ?? null,
      icon: String(draft.icon).trim(),
      price_cents: Number(draft.price_cents),
      currency: draft.currency ?? 'EUR',
      billing_period: (draft.billing_period as 'monthly' | 'yearly') ?? 'monthly',
      applies_to_plans: Array.isArray(draft.applies_to_plans) ? draft.applies_to_plans : [],
      sort_order: Number(draft.sort_order ?? 0),
      is_active: !!draft.is_active,
      created_at: draft.created_at ?? '',
      updated_at: draft.updated_at ?? '',
    };
    this.addonSavingId.set(payload.id);
    try {
      const fresh = await firstValueFrom(this.planService.updateAddon(payload));
      this.toast.success(
        this.newAddonMode() ? 'Add-on creado' : 'Add-on actualizado',
        `${fresh.name} se ha guardado correctamente.`,
      );
      this.cancelAddonEdit();
    } catch (e: any) {
      console.error('Error saving add-on:', e);
      this.toast.error('Error', e?.message || 'No se pudo guardar el add-on.');
    } finally {
      this.addonSavingId.set(null);
    }
  }

  /** Toggle a plan_id in the addon's applies_to_plans multi-select. */
  toggleAddonPlan(planId: string): void {
    const draft = this.editingAddonDraft();
    if (!draft) return;
    const current = Array.isArray(draft.applies_to_plans) ? draft.applies_to_plans : [];
    const next = current.includes(planId)
      ? current.filter((p) => p !== planId)
      : [...current, planId];
    this.editingAddonDraft.set({ ...draft, applies_to_plans: next });
  }

  /** Convenience flag for the template: is the editor open in any mode? */
  isAddonEditorOpen(): boolean {
    return this.editingAddon() !== null || this.newAddonMode();
  }

  /** Convenience flag: is the editor open on a specific add-on row? */
  isAddonEditorFor(addonId: string): boolean {
    return !this.newAddonMode() && this.editingAddon()?.id === addonId;
  }
}
