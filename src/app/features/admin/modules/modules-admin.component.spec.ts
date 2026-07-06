/**
 * Unit tests for ModulesAdminComponent — covers PR 3 + PR 4 additions:
 *
 * PR 3:
 *   - isEditorEnabled() default ON for super_admin (F-PCA-005 simplified)
 *   - Edit button visibility follows flag + super_admin role (F-PCA-001, ADR-05)
 *   - updatePlanMetadata() calls planService.updatePlan() and toasts success
 *   - 42501 from RPC is surfaced as a 'No tienes permisos de super_admin' toast
 *
 * PR 4:
 *   - Add-on edit form (F-ADDON-002)
 *   - New add-on creation (F-ADDON-003)
 *   - 23505 duplicate-id surfaces Spanish toast
 *   - toggleAddonPlan multi-select
 *
 * REMOVED (commit e23c3b33, follow-up refactor ef6e38c4):
 *   - F-PCA-006 tier cascade promotion — the cascade wrote through
 *     `plans.included_modules`, which was dropped in
 *     migration 20260705000009. `toggleModuleInPlan` now writes
 *     one plan at a time via `admin_set_plan_module_access` → the
 *     `plan_module_access` table; cascade semantics are no longer a
 *     client concern (the RPC validates and the read model rebuilds).
 *     The describe block is kept as `describe.skip` for archaeological
 *     context and to make the removal explicit.
 *
 * Test runner: Karma+Jasmine (`npm run test`). Requires Chrome.
 *
 * Why this is excluded from `npm run test:unit` (Jest):
 *   Angular 21's ESM `@angular/core/testing` cannot be transformed by
 *   Jest's ts-jest preset in this environment — same root cause as
 *   plan.service.spec.ts and seat-badge.component.spec.ts (PR 2).
 *   Run on CI with Karma+Jasmine where Chrome is available.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, ParamMap } from '@angular/router';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { ModulesAdminComponent } from './modules-admin.component';
import { PlanService, Plan, PlanAddon } from '../../../services/plan.service';
import { ToastService } from '../../../services/toast.service';
import { AuthService } from '../../../services/auth.service';
import { SupabaseModulesService } from '../../../services/supabase-modules.service';

const SAMPLE_PLAN: Plan = {
  id: 'starter',
  name: 'Starter',
  tagline: 'Para empezar',
  description: null,
  base_price_eur_cents: 4900,
  currency: 'EUR',  included_users: 3,
  extra_user_cents: 0,
  included_modules: [],
  sort_order: 1,
  is_active: true,
  is_highlighted: false,
  created_at: '',
  updated_at: '',
};

const PRO_PLAN: Plan = { ...SAMPLE_PLAN, id: 'pro', name: 'Pro', sort_order: 2, base_price_eur_cents: 9900 };
const BUSINESS_PLAN: Plan = { ...SAMPLE_PLAN, id: 'business', name: 'Business', sort_order: 3, base_price_eur_cents: 24900 };
const FREE_PLAN: Plan = { ...SAMPLE_PLAN, id: 'free', name: 'Free', sort_order: 0, base_price_eur_cents: 0, included_users: 1 };

const SAMPLE_ADDON: PlanAddon = {
  id: 'marketing_pro',
  name: 'Marketing avanzado',
  description: 'Campañas y segmentación',
  icon: 'fa-bullhorn',
  price_eur_cents: 1900,
  currency: 'EUR',  applies_to_plans: ['pro'],
  included_modules: ['marketing'],
  sort_order: 10,
  is_active: true,
  created_at: '',
  updated_at: '',
};

function makeQueryParamMap(flagValue: string | null): ParamMap {
  const m: Record<string, string> = {};
  if (flagValue !== null) m['flag'] = flagValue;
  return convertToParamMap(m);
}

function setup({
  flag,
  role = 'super_admin',
  plans = [SAMPLE_PLAN],
  addons = [SAMPLE_ADDON],
  updatePlanOverride,
  updateAddonOverride,
}: {
  flag: string | null;
  role?: string;
  plans?: Plan[];
  addons?: PlanAddon[];
  updatePlanOverride?: (p: Plan) => any;
  updateAddonOverride?: (a: PlanAddon) => any;
} = {}) {
  const authStub = {
    userRole: signal<string>(role),
    userProfile: { is_super_admin: role === 'super_admin' } as any,
    isEmergencySuperAdmin: () => role === 'super_admin',
  };

  const updatePlan = jasmine
    .createSpy('updatePlan')
    .and.callFake(updatePlanOverride ?? ((p: Plan) => of({ ...p, updated_at: 'now' } as Plan)));
  const updateAddon = jasmine
    .createSpy('updateAddon')
    .and.callFake(updateAddonOverride ?? ((a: PlanAddon) => of({ ...a, updated_at: 'now' } as PlanAddon)));
  const planServiceStub = {
    getPlans: () => of(plans),
    getAddons: () => of(addons),
    updatePlan,
    updateAddon,
  };

  const toastStub = {
    success: jasmine.createSpy('success'),
    error: jasmine.createSpy('error'),
    info: jasmine.createSpy('info'),
  };

  const modulesServiceStub = {
    adminListCompanies: () => of({ companies: [] }),
    // New write path — toggleModuleInPlan() routes through
    // `admin_set_plan_module_access` (plan_module_access), not
    // `PlanService.togglePlanModule`. The default is a no-op success.
    adminSetPlanModuleAccess: () => of(undefined),
    adminGetPlanModuleAccess: () => of([]),
  };

  const supabaseStub = {
    rpc: () => Promise.resolve({ data: null, error: null }),
  };

  TestBed.configureTestingModule({
    imports: [ModulesAdminComponent],
    providers: [
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: makeQueryParamMap(flag) } } },
      { provide: AuthService, useValue: authStub },
      { provide: PlanService, useValue: planServiceStub },
      { provide: ToastService, useValue: toastStub },
      { provide: SupabaseModulesService, useValue: modulesServiceStub },
    ],
  });

  const fixture: ComponentFixture<ModulesAdminComponent> = TestBed.createComponent(ModulesAdminComponent);
  fixture.detectChanges();
  return { fixture, updatePlan, updateAddon, toast: toastStub, component: fixture.componentInstance };
}

describe('ModulesAdminComponent — PR 3 inline plan-edit form', () => {
  it('shows the edit affordance by default for super_admin (no flag required)', () => {
    const { fixture, component } = setup({ flag: null, role: 'super_admin' });
    component.activeTab.set('pricing');
    component.plans.set([SAMPLE_PLAN]);
    fixture.detectChanges();
    expect(component.isEditorEnabled()).toBe(true);
  });

  it('hides the edit affordance when the viewer is not super_admin', () => {
    const { fixture, component } = setup({ flag: null, role: 'admin' });
    component.activeTab.set('pricing');
    component.plans.set([SAMPLE_PLAN]);
    fixture.detectChanges();
    expect(component.isEditorEnabled()).toBe(false);
    expect(fixture.nativeElement.querySelector('[data-testid="plan-edit-button"]')).toBeNull();
  });

  it('respects ?flag=plan-edit-readonly as an explicit kill switch for super_admin', () => {
    const { component } = setup({ flag: 'plan-edit-readonly', role: 'super_admin' });
    component.activeTab.set('pricing');
    component.plans.set([SAMPLE_PLAN]);
    expect(component.isEditorEnabled()).toBe(false);
  });

  it('renders the Edit button + form for super_admin by default', () => {
    const { fixture, component } = setup({ flag: null, role: 'super_admin' });
    component.activeTab.set('pricing');
    component.plans.set([SAMPLE_PLAN]);
    fixture.detectChanges();
    expect(component.isEditorEnabled()).toBe(true);
    expect(fixture.nativeElement.querySelector('[data-testid="plan-edit-button"]')).not.toBeNull();

    component.startEdit(SAMPLE_PLAN);
    fixture.detectChanges();
    const form = fixture.nativeElement.querySelector('[data-testid="plan-edit-form"]');
    expect(form).not.toBeNull();
    const inputs = form.querySelectorAll('input,select');
    expect(inputs.length).toBeGreaterThanOrEqual(7);
  });

  it('calls planService.updatePlan() and toasts success when Save is clicked', async () => {
    const { fixture, component, updatePlan, toast } = setup({
      flag: null,
      role: 'super_admin',
    });
    component.activeTab.set('pricing');
    component.plans.set([SAMPLE_PLAN]);
    component.startEdit(SAMPLE_PLAN);
    fixture.detectChanges();
    await component.updatePlanMetadata();
    expect(updatePlan).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalled();
    expect(component.editingPlan()).toBeNull();
  });

  it('surfaces 42501 RPC errors as "No tienes permisos de super_admin" toast', async () => {
    const { fixture, component, toast } = setup({
      flag: null,
      role: 'super_admin',
    });
    component.activeTab.set('pricing');
    component.plans.set([SAMPLE_PLAN]);
    component.startEdit(SAMPLE_PLAN);
    const svc = TestBed.inject(PlanService) as any;
    svc.updatePlan = () => throwError(() => new Error('No tienes permisos de super_admin'));
    fixture.detectChanges();
    await component.updatePlanMetadata();
    expect(toast.error).toHaveBeenCalled();
    const args = toast.error.calls.mostRecent().args;
    expect(args[1]).toContain('No tienes permisos de super_admin');
  });
});

describe.skip('ModulesAdminComponent — F-PCA-006 tier cascade promotion (removed in e23c3b33)', () => {
  // REMOVED — migration 20260705000009 dropped the `plans.included_modules`
  // column and refactor ef6e38c4 moved per-plan writes through
  // `admin_set_plan_module_access` → `plan_module_access`. The cascade
  // promotion feature itself was retired: each plan × module toggle is
  // now an explicit per-row write. There is no cascade to test on the
  // client side anymore. Server-side cascade (if reintroduced) would
  // belong in a Postgres regression test, not here.
  const NEW_MODULE = 'core_/facturacion';

  it('cascades a module toggle ON to every higher-tier plan (sort_order > current)', async () => {
    const { component, updatePlan, toast } = setup({
      flag: null,
      role: 'super_admin',
      plans: [
        { ...FREE_PLAN, included_modules: [] },
        { ...SAMPLE_PLAN, included_modules: [] },
        { ...PRO_PLAN, included_modules: [] },
        { ...BUSINESS_PLAN, included_modules: [] },
      ],
    });
    component.activeTab.set('pricing');
    component.plans.set([
      { ...FREE_PLAN, included_modules: [] },
      { ...SAMPLE_PLAN, included_modules: [] },
      { ...PRO_PLAN, included_modules: [] },
      { ...BUSINESS_PLAN, included_modules: [] },
    ]);

    const starter = component.plans().find((p) => p.id === 'starter')!;
    await component.toggleModuleInPlan(starter, NEW_MODULE);

    const afterPlans = component.plans();
    expect(afterPlans.find((p) => p.id === 'starter')!.included_modules).toContain(NEW_MODULE);
    expect(afterPlans.find((p) => p.id === 'pro')!.included_modules).toContain(NEW_MODULE);
    expect(afterPlans.find((p) => p.id === 'business')!.included_modules).toContain(NEW_MODULE);
    expect(afterPlans.find((p) => p.id === 'free')!.included_modules).not.toContain(NEW_MODULE);

    expect(updatePlan).toHaveBeenCalledTimes(3);
    const calledIds = updatePlan.calls.allArgs().map((args) => (args[0] as Plan).id);
    expect(calledIds.sort()).toEqual(['business', 'pro', 'starter']);

    expect(toast.success).toHaveBeenCalled();
    const toastMsg = toast.success.calls.mostRecent().args[1] as string;
    expect(toastMsg).toContain(NEW_MODULE);
    expect(toastMsg).toContain('Starter');
    expect(toastMsg).toContain('promovido');
  });

  it('does not cascade a module toggle OFF (one-way demotion)', async () => {
    const { component, updatePlan } = setup({ flag: null, role: 'super_admin' });
    component.activeTab.set('pricing');
    const allWithModule = [NEW_MODULE];
    component.plans.set([
      { ...SAMPLE_PLAN, included_modules: allWithModule },
      { ...PRO_PLAN, included_modules: allWithModule },
      { ...BUSINESS_PLAN, included_modules: allWithModule },
    ]);

    const starter = component.plans().find((p) => p.id === 'starter')!;
    await component.toggleModuleInPlan(starter, NEW_MODULE);

    const afterPlans = component.plans();
    expect(afterPlans.find((p) => p.id === 'starter')!.included_modules).not.toContain(NEW_MODULE);
    expect(afterPlans.find((p) => p.id === 'pro')!.included_modules).toContain(NEW_MODULE);
    expect(afterPlans.find((p) => p.id === 'business')!.included_modules).toContain(NEW_MODULE);

    expect(updatePlan).toHaveBeenCalledTimes(1);
    expect((updatePlan.calls.mostRecent().args[0] as Plan).id).toBe('starter');
  });

  it('does not cascade when toggling ON in the highest-tier plan', async () => {
    const { component, updatePlan } = setup({ flag: null, role: 'super_admin' });
    component.activeTab.set('pricing');
    component.plans.set([
      { ...SAMPLE_PLAN, included_modules: [] },
      { ...PRO_PLAN, included_modules: [] },
      { ...BUSINESS_PLAN, included_modules: [] },
    ]);

    const business = component.plans().find((p) => p.id === 'business')!;
    await component.toggleModuleInPlan(business, NEW_MODULE);

    expect(updatePlan).toHaveBeenCalledTimes(1);
    expect((updatePlan.calls.mostRecent().args[0] as Plan).id).toBe('business');
  });

  it('reverts ALL optimistic updates when one cascade RPC fails (atomic rollback)', async () => {
    let proCallCount = 0;
    const { component, toast } = setup({
      flag: null,
      role: 'super_admin',
      updatePlanOverride: (p: Plan) => {
        if (p.id === 'pro' && proCallCount++ === 0) {
          return throwError(() => new Error('No tienes permisos de super_admin'));
        }
        return of({ ...p, updated_at: 'now' } as Plan);
      },
    });
    component.activeTab.set('pricing');
    component.plans.set([
      { ...SAMPLE_PLAN, included_modules: [] },
      { ...PRO_PLAN, included_modules: [] },
      { ...BUSINESS_PLAN, included_modules: [] },
    ]);

    const starter = component.plans().find((p) => p.id === 'starter')!;
    await component.toggleModuleInPlan(starter, NEW_MODULE);

    const afterPlans = component.plans();
    expect(afterPlans.find((p) => p.id === 'starter')!.included_modules).not.toContain(NEW_MODULE);
    expect(afterPlans.find((p) => p.id === 'pro')!.included_modules).not.toContain(NEW_MODULE);
    expect(afterPlans.find((p) => p.id === 'business')!.included_modules).not.toContain(NEW_MODULE);

    expect(toast.error).toHaveBeenCalled();
    const errMsg = toast.error.calls.mostRecent().args[1] as string;
    expect(errMsg).toContain('No tienes permisos de super_admin');
  });

  it('does not double-add when a higher plan already has the module', async () => {
    const { component, updatePlan } = setup({ flag: null, role: 'super_admin' });
    component.activeTab.set('pricing');
    component.plans.set([
      { ...SAMPLE_PLAN, included_modules: [] },
      { ...PRO_PLAN, included_modules: [NEW_MODULE] },
      { ...BUSINESS_PLAN, included_modules: [NEW_MODULE] },
    ]);

    const starter = component.plans().find((p) => p.id === 'starter')!;
    await component.toggleModuleInPlan(starter, NEW_MODULE);

    expect(updatePlan).toHaveBeenCalledTimes(1);
    expect((updatePlan.calls.mostRecent().args[0] as Plan).id).toBe('starter');
  });
});

describe('ModulesAdminComponent — PR 4 add-on editor', () => {
  it('renders the "Nuevo add-on" button for super_admin by default', () => {
    const { fixture, component } = setup({ flag: null, role: 'super_admin' });
    component.activeTab.set('pricing');
    component.plans.set([SAMPLE_PLAN]);
    component.addons.set([SAMPLE_ADDON]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="addon-new-button"]')).not.toBeNull();
  });

  it('hides the "Nuevo add-on" button for non-super_admin', () => {
    const { fixture, component } = setup({ flag: null, role: 'admin' });
    component.activeTab.set('pricing');
    component.plans.set([SAMPLE_PLAN]);
    component.addons.set([SAMPLE_ADDON]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="addon-new-button"]')).toBeNull();
  });

  it('opens the inline form when "Nuevo add-on" is clicked', () => {
    const { fixture, component } = setup({ flag: null, role: 'super_admin' });
    component.activeTab.set('pricing');
    component.plans.set([SAMPLE_PLAN]);
    component.addons.set([]);
    fixture.detectChanges();

    component.startNewAddon();
    fixture.detectChanges();

    expect(component.isAddonEditorOpen()).toBe(true);
    expect(component.newAddonMode()).toBe(true);
    expect(fixture.nativeElement.querySelector('[data-testid="addon-edit-form"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="addon-edit-id"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="addon-edit-name"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="addon-edit-price"]')).not.toBeNull();
  });

  it('opens the inline form when Edit is clicked on an existing add-on', () => {
    const { fixture, component } = setup({ flag: null, role: 'super_admin' });
    component.activeTab.set('pricing');
    component.plans.set([SAMPLE_PLAN]);
    component.addons.set([SAMPLE_ADDON]);
    fixture.detectChanges();

    component.startAddonEdit(SAMPLE_ADDON);
    fixture.detectChanges();

    expect(component.isAddonEditorFor(SAMPLE_ADDON.id)).toBe(true);
    expect(component.newAddonMode()).toBe(false);
    const draft = component.editingAddonDraft();
    expect(draft?.id).toBe(SAMPLE_ADDON.id);
    expect(draft?.name).toBe(SAMPLE_ADDON.name);
  });

  it('calls planService.updateAddon and toasts success on Save (edit existing)', async () => {
    const { fixture, component, updateAddon, toast } = setup({ flag: null, role: 'super_admin' });
    component.activeTab.set('pricing');
    component.plans.set([SAMPLE_PLAN]);
    component.addons.set([SAMPLE_ADDON]);
    component.startAddonEdit(SAMPLE_ADDON);
    fixture.detectChanges();

    await component.saveAddon();

    expect(updateAddon).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalled();
    expect(component.isAddonEditorOpen()).toBe(false);
  });

  it('rejects Save with empty id via validation toast (no RPC call)', async () => {
    const { fixture, component, updateAddon, toast } = setup({ flag: null, role: 'super_admin' });
    component.activeTab.set('pricing');
    component.plans.set([SAMPLE_PLAN]);
    component.addons.set([]);
    component.startNewAddon();
    component.editingAddonDraft.set({ ...component.editingAddonDraft()!, id: '', name: 'X' });
    fixture.detectChanges();

    await component.saveAddon();

    expect(updateAddon).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
    const args = toast.error.calls.mostRecent().args;
    expect(args[1]).toContain('identificador');
  });

  it('surfaces 23505 (duplicate id) as Spanish toast', async () => {
    const { fixture, component, toast } = setup({
      flag: null,
      role: 'super_admin',
      updateAddonOverride: () => throwError(() => new Error('Ya existe un add-on con el identificador "marketing_pro".')),
    });
    component.activeTab.set('pricing');
    component.plans.set([SAMPLE_PLAN]);
    component.addons.set([SAMPLE_ADDON]);
    component.startAddonEdit(SAMPLE_ADDON);
    fixture.detectChanges();

    await component.saveAddon();

    expect(toast.error).toHaveBeenCalled();
    const args = toast.error.calls.mostRecent().args;
    expect(args[1]).toContain('Ya existe');
  });

  it('toggles a plan_id in applies_to_plans', () => {
    const { component } = setup({ flag: null, role: 'super_admin' });
    component.startNewAddon();
    component.toggleAddonPlan('starter');
    expect(component.editingAddonDraft()?.applies_to_plans).toContain('starter');
    component.toggleAddonPlan('starter');
    expect(component.editingAddonDraft()?.applies_to_plans).not.toContain('starter');
  });

  it('cancelAddonEdit closes the editor', () => {
    const { fixture, component } = setup({ flag: null, role: 'super_admin' });
    component.activeTab.set('pricing');
    component.startNewAddon();
    expect(component.isAddonEditorOpen()).toBe(true);
    component.cancelAddonEdit();
    expect(component.isAddonEditorOpen()).toBe(false);
    expect(fixture.nativeElement.querySelector('[data-testid="addon-edit-form"]')).toBeNull();
  });

  it('F-ADDON-006: included_modules is sent in the RPC payload', async () => {
    const { fixture, component, updateAddon } = setup({ flag: null, role: 'super_admin' });
    component.activeTab.set('pricing');
    component.plans.set([SAMPLE_PLAN]);
    component.addons.set([SAMPLE_ADDON]);
    component.startAddonEdit(SAMPLE_ADDON);
    component.toggleAddonModule('core_/facturacion');
    fixture.detectChanges();

    await component.saveAddon();

    expect(updateAddon).toHaveBeenCalled();
    const payload = updateAddon.calls.mostRecent().args[0] as PlanAddon;
    expect(payload.included_modules).toEqual(['marketing', 'core_/facturacion']);
  });

  it('F-ADDON-006: toggleAddonModule adds and removes module keys', () => {
    const { component } = setup({ flag: null, role: 'super_admin' });
    component.startNewAddon();
    component.toggleAddonModule('marketing');
    expect(component.editingAddonDraft()?.included_modules).toEqual(['marketing']);
    component.toggleAddonModule('moduloFacturas');
    expect(component.editingAddonDraft()?.included_modules).toEqual(['marketing', 'moduloFacturas']);
    component.toggleAddonModule('marketing');
    expect(component.editingAddonDraft()?.included_modules).toEqual(['moduloFacturas']);
  });

  it('F-ADDON-007: unavailableModules excludes the add-on being edited', () => {
    const addonA: PlanAddon = { ...SAMPLE_ADDON, id: 'a', included_modules: ['moduloFacturas'] };
    const addonB: PlanAddon = { ...SAMPLE_ADDON, id: 'b', included_modules: ['core_/clientes'] };
    const { component } = setup({ flag: null, role: 'super_admin', addons: [addonA, addonB] });
    component.addons.set([addonA, addonB]);
    const unavail = component.unavailableModules('a');
    expect(unavail.has('moduloFacturas')).toBe(false); // A's own module
    expect(unavail.has('core_/clientes')).toBe(true); // B's module is blocked
  });

  it('F-ADDON-007: unavailableModules for a new add-on (empty id) blocks every other add-on module', () => {
    const addonA: PlanAddon = { ...SAMPLE_ADDON, id: 'a', included_modules: ['moduloFacturas'] };
    const { component } = setup({ flag: null, role: 'super_admin', addons: [addonA] });
    component.addons.set([addonA]);
    const unavail = component.unavailableModules('');
    expect(unavail.has('moduloFacturas')).toBe(true);
  });

  it('F-ADDON-007: inactive add-ons do NOT hold their modules', () => {
    const inactiveA: PlanAddon = { ...SAMPLE_ADDON, id: 'a', included_modules: ['moduloFacturas'], is_active: false };
    const activeB: PlanAddon = { ...SAMPLE_ADDON, id: 'b', included_modules: [] };
    const { component } = setup({ flag: null, role: 'super_admin', addons: [inactiveA, activeB] });
    component.addons.set([inactiveA, activeB]);
    // B is being edited; A is inactive so moduloFacturas is free.
    const unavail = component.unavailableModules('b');
    expect(unavail.has('moduloFacturas')).toBe(false);
  });

  it('F-ADDON-007: moduleOwnerName returns the owning add-on name', () => {
    const addonA: PlanAddon = { ...SAMPLE_ADDON, id: 'a', name: 'Add-on A', included_modules: ['moduloFacturas'] };
    const { component } = setup({ flag: null, role: 'super_admin', addons: [addonA] });
    component.addons.set([addonA]);
    expect(component.moduleOwnerName('b', 'moduloFacturas')).toBe('Add-on A');
    expect(component.moduleOwnerName('a', 'moduloFacturas')).toBeNull(); // excluded when editing itself
  });

  it('F-ADDON-008: filteredModuleKeys narrows the list by label substring (case-insensitive)', () => {
    const { component } = setup({ flag: null, role: 'super_admin' });
    component.addonModuleFilter.set('clien');
    const filtered = component.filteredModuleKeys();
    expect(filtered.every((k) => component.moduleLabel(k).toLowerCase().includes('clien'))).toBe(true);
    expect(filtered.length).toBeGreaterThan(0);
  });

  it('F-ADDON-008: filteredModuleKeys returns the full catalog when the filter is empty', () => {
    const { component } = setup({ flag: null, role: 'super_admin' });
    component.addonModuleFilter.set('');
    expect(component.filteredModuleKeys().length).toBe(component.availableModuleKeys.length);
  });

  it('F-ADDON-008: opening the editor resets the filter', () => {
    const { component } = setup({ flag: null, role: 'super_admin' });
    component.addonModuleFilter.set('facturacion');
    component.startNewAddon();
    expect(component.addonModuleFilter()).toBe('');
    component.addonModuleFilter.set('cliente');
    component.startAddonEdit(SAMPLE_ADDON);
    expect(component.addonModuleFilter()).toBe('');
    component.addonModuleFilter.set('chat');
    component.cancelAddonEdit();
    expect(component.addonModuleFilter()).toBe('');
  });

  it('F-ADDON-007: 23514 from updateAddon surfaces a Spanish conflict toast', async () => {
    const { fixture, component, toast } = setup({
      flag: null,
      role: 'super_admin',
      updateAddonOverride: () => throwError(() => new Error('El módulo "moduloFacturas" ya está incluido en el add-on "Verifactu extra". Desactívalo o quítalo de allí antes de poder reasignarlo.')),
    });
    component.activeTab.set('pricing');
    component.plans.set([SAMPLE_PLAN]);
    component.addons.set([SAMPLE_ADDON]);
    component.startAddonEdit(SAMPLE_ADDON);
    fixture.detectChanges();

    await component.saveAddon();

    expect(toast.error).toHaveBeenCalled();
    const args = toast.error.calls.mostRecent().args;
    expect(args[1]).toContain('ya está incluido');
    expect(args[1]).toContain('Verifactu extra');
  });
});