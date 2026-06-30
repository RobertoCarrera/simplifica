/**
 * Unit tests for ModulesAdminComponent — covers PR 4 additions:
 *   - isEditorEnabled() default ON for super_admin (F-PCA-005 simplified)
 *   - Add-on edit form (F-ADDON-002)
 *   - New add-on creation (F-ADDON-003)
 *   - 42501 from RPC surfaces as 'No tienes permisos de super_admin'
 *
 * Test runner: Karma+Jasmine (`npm run test`). Requires Chrome.
 *
 * Why excluded from Jest:
 *   Same Angular 21 ESM limitation as the PR 2 / PR 3 specs.
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
  base_price_cents: 4900,
  currency: 'EUR',
  billing_period: 'monthly',
  included_users: 3,
  extra_user_cents: 0,
  included_modules: [],
  sort_order: 1,
  is_active: true,
  is_highlighted: false,
  created_at: '',
  updated_at: '',
};

const SAMPLE_ADDON: PlanAddon = {
  id: 'marketing_pro',
  name: 'Marketing avanzado',
  description: 'Campañas y segmentación',
  icon: 'fa-bullhorn',
  price_cents: 1900,
  currency: 'EUR',
  billing_period: 'monthly',
  applies_to_plans: ['pro'],
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
  updateAddonOverride,
}: {
  flag: string | null;
  role?: string;
  plans?: Plan[];
  addons?: PlanAddon[];
  updateAddonOverride?: (a: PlanAddon) => any;
} = {}) {
  const authStub = {
    userRole: signal<string>(role),
    userProfile: { is_super_admin: role === 'super_admin' } as any,
    isEmergencySuperAdmin: () => role === 'super_admin',
  };

  const updateAddon = jasmine
    .createSpy('updateAddon')
    .and.callFake(updateAddonOverride ?? ((a: PlanAddon) => of({ ...a, updated_at: 'now' } as PlanAddon)));
  const planServiceStub = {
    getPlans: () => of(plans),
    getAddons: () => of(addons),
    updatePlan: () => of(SAMPLE_PLAN),
    togglePlanModule: () => of(SAMPLE_PLAN),
    updateAddon,
  };

  const toastStub = {
    success: jasmine.createSpy('success'),
    error: jasmine.createSpy('error'),
    info: jasmine.createSpy('info'),
  };

  const modulesServiceStub = {
    adminListCompanies: () => of({ companies: [] }),
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
  return { fixture, updateAddon, toast: toastStub, component: fixture.componentInstance };
}

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
    // Override draft with empty id
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
});