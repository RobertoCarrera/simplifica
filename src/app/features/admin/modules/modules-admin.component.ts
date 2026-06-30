import { Component, OnInit, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
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
  private route = inject(ActivatedRoute);

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
  /** PR 3: which plan is currently in the inline-edit form. null = no editor open. */
  editingPlan = signal<Plan | null>(null);
  /** PR 3: working copy bound to the inline edit form ngModel controls. */
  editingDraft = signal<Plan | null>(null);

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

  // ── Inline plan editor (PR 3, F-PCA-001..003) ───────────────────────────────
  // The editor is gated by `?flag=plan-edit-v2` per ADR-05 so it ships OFF by
  // default. Even with the flag on, only super_admin sees the affordance. The
  // RPC admin_upsert_plan is itself super_admin-gated, so this is a UX gate,
  // not a security one — but it keeps the editorial surface quiet in normal
  // use and gives us a kill-switch for staging.

  /**
   * Editor gate. By default: any super_admin sees the Edit affordance.
   * Pass `?flag=plan-edit-readonly` in the URL to lock the catalog to read-only
   * (useful for demos, support sessions, or letting a super_admin preview
   * the public view without exposing mutations).
   *
   * History: this used to require `?flag=plan-edit-v2` to enable the form,
   * but that was over-engineered for a feature only super_admin touches.
   * Reverting to "default ON for super_admin" simplifies the dev loop.
   */
  isEditorEnabled(): boolean {
    if (!this.isSuperAdmin()) return false;
    const flag = this.route.snapshot.queryParamMap.get('flag');
    return flag !== 'plan-edit-readonly';
  }

  /** Open the editor for the given plan. Seeds the draft signal with a copy. */
  startEdit(plan: Plan): void {
    this.editingPlan.set(plan);
    this.editingDraft.set({ ...plan });
  }

  /** Close the editor without saving. */
  cancelEdit(): void {
    this.editingPlan.set(null);
    this.editingDraft.set(null);
  }

  /**
   * Persist the edit-form values via planService.updatePlan(). The RPC owns
   * canonical-key + is_highlighted mutex + 42501 guards; the client only does
   * lightweight numeric validation so the user gets fast feedback before
   * round-tripping.
   */
  async updatePlanMetadata(): Promise<void> {
    const draft = this.editingDraft();
    const target = this.editingPlan();
    if (!draft || !target) return;

    if (!draft.name || !draft.name.trim()) {
      this.toast.error('Validación', 'El nombre del plan es obligatorio.');
      return;
    }
    if (draft.base_price_cents < 0 || !Number.isFinite(draft.base_price_cents)) {
      this.toast.error('Validación', 'El precio base debe ser un número ≥ 0.');
      return;
    }
    if (!Number.isInteger(draft.included_users) || draft.included_users < 1) {
      this.toast.error('Validación', 'El plan debe incluir al menos 1 usuario.');
      return;
    }

    // Optimistic in-place merge so the @for re-renders instantly; the RPC's
    // success branch will overwrite with the canonical server response.
    this.plans.set(this.plans().map((p) => (p.id === target.id ? { ...target, ...draft } : p)));

    try {
      const fresh = await firstValueFrom(this.planService.updatePlan({ ...target, ...draft }));
      this.plans.set(this.plans().map((p) => (p.id === fresh.id ? fresh : p)));
      this.toast.success('Plan actualizado', `${fresh.name} se ha guardado correctamente.`);
      this.cancelEdit();
    } catch (e: any) {
      // Revert the optimistic update on error so the UI matches server state.
      this.plans.set(this.plans().map((p) => (p.id === target.id ? target : p)));
      console.error('Error updating plan metadata:', e);
      this.toast.error('Error', e?.message || 'No se pudo guardar el plan.');
    }
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
   *
   * Cascade promotion (F-PCA-006): when ADDING a module to plan P, the
   * same module is also added to every plan with sort_order > P.sort_order.
   * This enforces the invariant "every lower-tier plan is a subset of every
   * higher-tier plan" so that toggling ON in Starter also activates the
   * module in Pro, Business, etc. The cascade is one-way (lower → higher);
   * removing a module only affects the current plan, never propagates up.
   *
   * All affected plans are persisted via admin_upsert_plan RPC in parallel.
   * Each RPC inherits the canonical-key guard + is_highlighted mutex +
   * 42501 super_admin check from migration 0004.
   *
   * Optimistic update: flips the local signal for every affected plan first,
   * then awaits the parallel RPCs. On any failure, all optimistic updates
   * are reverted in one shot.
   */
  async toggleModuleInPlan(plan: Plan, moduleKey: string) {
    const wantIncluded = !this.isModuleInPlan(plan, moduleKey);
    const key = `${plan.id}:${moduleKey}`;
    this.pricingSavingKey.set(key);

    if (wantIncluded) {
      // Identify all plans that need the module added (current + higher tiers).
      const higherPlans = this.plans().filter(
        (p) => p.sort_order > plan.sort_order && !p.included_modules.includes(moduleKey),
      );
      const affectedPlans: Plan[] = [plan, ...higherPlans];

      // Optimistic in-place merge for every affected plan.
      this.plans.set(
        this.plans().map((p) => {
          if (p.id === plan.id) {
            return {
              ...p,
              included_modules: Array.from(new Set([...p.included_modules, moduleKey])),
            };
          }
          if (higherPlans.some((hp) => hp.id === p.id)) {
            return {
              ...p,
              included_modules: Array.from(new Set([...p.included_modules, moduleKey])),
            };
          }
          return p;
        }),
      );

      try {
        await Promise.all(
          affectedPlans.map((p) =>
            firstValueFrom(
              this.planService.updatePlan({
                ...p,
                included_modules: Array.from(new Set([...p.included_modules, moduleKey])),
              }),
            ),
          ),
        );
        const promotedNames = higherPlans.map((p) => p.name);
        const message =
          promotedNames.length > 0
            ? `${this.moduleLabel(moduleKey)} añadido a ${plan.name} y promovido a ${promotedNames.join(', ')}.`
            : `${this.moduleLabel(moduleKey)} añadido a ${plan.name}.`;
        this.toast.success('Plan actualizado', message);
      } catch (e: any) {
        // Revert ALL optimistic updates on any failure.
        this.plans.set(
          this.plans().map((p) => {
            const original = affectedPlans.find((ap) => ap.id === p.id);
            return original ?? p;
          }),
        );
        console.error('Error updating plan module:', e);
        this.toast.error('Error', e?.message || 'No se pudo actualizar el plan.');
      } finally {
        this.pricingSavingKey.set(null);
      }
    } else {
      // Demotion: removing a module is intentionally one-way (does not
      // cascade to higher plans). Use case: super_admin needs to strip a
      // module from Starter for a niche use without affecting Business.
      const updated: Plan = {
        ...plan,
        included_modules: plan.included_modules.filter((k) => k !== moduleKey),
      };
      this.plans.set(this.plans().map((p) => (p.id === plan.id ? updated : p)));

      try {
        await firstValueFrom(this.planService.togglePlanModule(plan, moduleKey, false));
        this.toast.success('Plan actualizado', `${this.moduleLabel(moduleKey)} quitado de ${plan.name}.`);
      } catch (e: any) {
        this.plans.set(this.plans().map((p) => (p.id === plan.id ? plan : p)));
        console.error('Error updating plan module:', e);
        this.toast.error('Error', e?.message || 'No se pudo actualizar el plan.');
      } finally {
        this.pricingSavingKey.set(null);
      }
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
}
