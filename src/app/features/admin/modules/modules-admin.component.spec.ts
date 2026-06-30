/**
 * Unit tests for ModulesAdminComponent — covers PR 3 additions:
 *   - isEditorEnabled() reads ?flag=plan-edit-v2 from ActivatedRoute snapshot
 *   - Edit button visibility follows flag + super_admin role (F-PCA-001, ADR-05)
 *   - updatePlanMetadata() calls planService.updatePlan() and toasts success
 *   - 42501 from RPC is surfaced as a 'No tienes permisos de super_admin' toast
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
import { PlanService, Plan } from '../../../services/plan.service';
import { ToastService } from '../../../services/toast.service';
import { AuthService } from '../../../services/auth.service';
import { SupabaseModulesService } from '../../../services/supabase-modules.service';

const SAMPLE_PLAN: Plan = {
  id: 'starter',
  name: 'Starter',
  tagline: 'Para empezar',
  description: null,
  base_price_cents: 2900,
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

const PRO_PLAN: Plan = { ...SAMPLE_PLAN, id: 'pro', name: 'Pro', sort_order: 2, base_price_cents: 7900 };
const BUSINESS_PLAN: Plan = { ...SAMPLE_PLAN, id: 'business', name: 'Business', sort_order: 3, base_price_cents: 19900 };
const FREE_PLAN: Plan = { ...SAMPLE_PLAN, id: 'free', name: 'Free', sort_order: 0, base_price_cents: 0, included_users: 1 };

function makeQueryParamMap(flagValue: string | null): ParamMap {
  const m: Record<string, string> = {};
  if (flagValue !== null) m['flag'] = flagValue;
  return convertToParamMap(m);
}

function setup({
  flag,
  role = 'super_admin',
  plans = [SAMPLE_PLAN],
  updatePlanOverride,
}: {
  flag: string | null;
  role?: string;
  plans?: Plan[];
  updatePlanOverride?: (p: Plan) => any;
} = {}) {
  // AuthService stub: only the methods the component touches in this spec.
  const authStub = {
    userRole: signal<string>(role),
    userProfile: { is_super_admin: role === 'super_admin' } as any,
    isEmergencySuperAdmin: () => role === 'super_admin',
  };

  // planService stub: getPlans returns the supplied plan list; togglePlanModule
  // resolves; updatePlan either succeeds or throws per the call.
  const updatePlan = jasmine
    .createSpy('updatePlan')
    .and.callFake(updatePlanOverride ?? ((p: Plan) => of({ ...p, updated_at: 'now' } as Plan)));
  const planServiceStub = {
    getPlans: () => of(plans),
    getAddons: () => of([]),
    togglePlanModule: () => of(SAMPLE_PLAN),
    updatePlan,
  };

  const toastStub = {
    success: jasmine.createSpy('success'),
    error: jasmine.createSpy('error'),
    info: jasmine.createSpy('info'),
  };

  const modulesServiceStub = {
    adminListCompanies: () => of({ companies: [] }),
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
  return { fixture, updatePlan, toast: toastStub, component: fixture.componentInstance };
}

describe('ModulesAdminComponent — PR 3 inline plan-edit form', () => {
  it('hides the edit affordance when ?flag=plan-edit-v2 is absent (default OFF)', () => {
    const { fixture } = setup({ flag: null });
    fixture.componentInstance.activeTab.set('pricing');
    fixture.detectChanges();
    expect(fixture.componentInstance.isEditorEnabled()).toBe(false);
    expect(fixture.nativeElement.querySelector('[data-testid="plan-edit-button"]')).toBeNull();
  });

  it('hides the edit affordance when the flag is set but the viewer is not super_admin', () => {
    const { fixture, component } = setup({ flag: 'plan-edit-v2', role: 'admin' });
    component.activeTab.set('pricing');
    component.plans.set([SAMPLE_PLAN]);
    fixture.detectChanges();
    expect(component.isEditorEnabled()).toBe(false);
    expect(fixture.nativeElement.querySelector('[data-testid="plan-edit-button"]')).toBeNull();
  });

  it('renders the Edit button + form for super_admin when the flag is set', () => {
    const { fixture, component } = setup({ flag: 'plan-edit-v2', role: 'super_admin' });
    component.activeTab.set('pricing');
    component.plans.set([SAMPLE_PLAN]);
    fixture.detectChanges();
    expect(component.isEditorEnabled()).toBe(true);
    expect(fixture.nativeElement.querySelector('[data-testid="plan-edit-button"]')).not.toBeNull();

    component.startEdit(SAMPLE_PLAN);
    fixture.detectChanges();
    const form = fixture.nativeElement.querySelector('[data-testid="plan-edit-form"]');
    expect(form).not.toBeNull();
    // All required inputs are present.
    const inputs = form.querySelectorAll('input,select');
    expect(inputs.length).toBeGreaterThanOrEqual(7); // name + tagline + base_price_cents + currency + billing_period + included_users + extra_user_cents + is_highlighted
  });

  it('calls planService.updatePlan() and toasts success when Save is clicked', async () => {
    const { fixture, component, updatePlan, toast } = setup({
      flag: 'plan-edit-v2',
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
      flag: 'plan-edit-v2',
      role: 'super_admin',
    });
    // Swap the spy to throw the same Error the service raises.
    component.activeTab.set('pricing');
    component.plans.set([SAMPLE_PLAN]);
    component.startEdit(SAMPLE_PLAN);
    // Override the stub for this test only.
    const svc = TestBed.inject(PlanService) as any;
    svc.updatePlan = () => throwError(() => new Error('No tienes permisos de super_admin'));
    fixture.detectChanges();
    await component.updatePlanMetadata();
    expect(toast.error).toHaveBeenCalled();
    const args = toast.error.calls.mostRecent().args;
    expect(args[1]).toContain('No tienes permisos de super_admin');
  });
});

describe('ModulesAdminComponent — F-PCA-006 tier cascade promotion', () => {
  const NEW_MODULE = 'core_/facturacion';

  it('cascades a module toggle ON to every higher-tier plan (sort_order > current)', async () => {
    const { component, updatePlan, toast } = setup({
      flag: 'plan-edit-v2',
      role: 'super_admin',
      plans: [
        { ...FREE_PLAN, included_modules: [] },
        { ...SAMPLE_PLAN, included_modules: [] }, // Starter sort_order=1
        { ...PRO_PLAN, included_modules: [] }, // Pro sort_order=2
        { ...BUSINESS_PLAN, included_modules: [] }, // Business sort_order=3
      ],
    });
    component.activeTab.set('pricing');
    component.plans.set([
      { ...FREE_PLAN, included_modules: [] },
      { ...SAMPLE_PLAN, included_modules: [] },
      { ...PRO_PLAN, included_modules: [] },
      { ...BUSINESS_PLAN, included_modules: [] },
    ]);
    component.isEditorEnabled(); // ensure flag check runs

    const starter = component.plans().find((p) => p.id === 'starter')!;
    await component.toggleModuleInPlan(starter, NEW_MODULE);

    // Optimistic: Starter + Pro + Business all have the new module; FREE does NOT.
    const afterPlans = component.plans();
    expect(afterPlans.find((p) => p.id === 'starter')!.included_modules).toContain(NEW_MODULE);
    expect(afterPlans.find((p) => p.id === 'pro')!.included_modules).toContain(NEW_MODULE);
    expect(afterPlans.find((p) => p.id === 'business')!.included_modules).toContain(NEW_MODULE);
    expect(afterPlans.find((p) => p.id === 'free')!.included_modules).not.toContain(NEW_MODULE);

    // RPC was called once per affected plan (Starter, Pro, Business = 3 calls).
    expect(updatePlan).toHaveBeenCalledTimes(3);
    const calledIds = updatePlan.calls.allArgs().map((args) => (args[0] as Plan).id);
    expect(calledIds.sort()).toEqual(['business', 'pro', 'starter']);

    // Toast announces the promotion.
    expect(toast.success).toHaveBeenCalled();
    const toastMsg = toast.success.calls.mostRecent().args[1] as string;
    expect(toastMsg).toContain(NEW_MODULE);
    expect(toastMsg).toContain('Starter');
    expect(toastMsg).toContain('promovido');
    expect(toastMsg).toContain('Pro');
    expect(toastMsg).toContain('Business');
  });

  it('does not cascade a module toggle OFF (one-way demotion)', async () => {
    const { component, updatePlan, toast } = setup({
      flag: 'plan-edit-v2',
      role: 'super_admin',
    });
    component.activeTab.set('pricing');
    const allWithModule = [NEW_MODULE];
    component.plans.set([
      { ...SAMPLE_PLAN, included_modules: allWithModule }, // Starter
      { ...PRO_PLAN, included_modules: allWithModule },
      { ...BUSINESS_PLAN, included_modules: allWithModule },
    ]);

    const starter = component.plans().find((p) => p.id === 'starter')!;
    await component.toggleModuleInPlan(starter, NEW_MODULE);

    // Starter removed it; Pro + Business untouched.
    const afterPlans = component.plans();
    expect(afterPlans.find((p) => p.id === 'starter')!.included_modules).not.toContain(NEW_MODULE);
    expect(afterPlans.find((p) => p.id === 'pro')!.included_modules).toContain(NEW_MODULE);
    expect(afterPlans.find((p) => p.id === 'business')!.included_modules).toContain(NEW_MODULE);

    // Only Starter RPC was called (no cascade for removal).
    expect(updatePlan).toHaveBeenCalledTimes(1);
    expect((updatePlan.calls.mostRecent().args[0] as Plan).id).toBe('starter');

    // Toast announces demotion without mentioning higher plans.
    const toastMsg = toast.success.calls.mostRecent().args[1] as string;
    expect(toastMsg).toContain('quitado');
    expect(toastMsg).toContain('Starter');
    expect(toastMsg).not.toContain('promovido');
  });

  it('does not cascade when toggling ON in the highest-tier plan', async () => {
    const { component, updatePlan } = setup({
      flag: 'plan-edit-v2',
      role: 'super_admin',
    });
    component.activeTab.set('pricing');
    component.plans.set([
      { ...SAMPLE_PLAN, included_modules: [] },
      { ...PRO_PLAN, included_modules: [] },
      { ...BUSINESS_PLAN, included_modules: [] }, // highest
    ]);

    const business = component.plans().find((p) => p.id === 'business')!;
    await component.toggleModuleInPlan(business, NEW_MODULE);

    expect(updatePlan).toHaveBeenCalledTimes(1);
    expect((updatePlan.calls.mostRecent().args[0] as Plan).id).toBe('business');
  });

  it('reverts ALL optimistic updates when one cascade RPC fails (atomic rollback)', async () => {
    let proCallCount = 0;
    const { component, toast } = setup({
      flag: 'plan-edit-v2',
      role: 'super_admin',
      updatePlanOverride: (p: Plan) => {
        if (p.id === 'pro' && proCallCount++ === 0) {
          return throwError(() => new Error('No tienes permisos de super_admin'));
        }
        return of({ ...p, updated_at: 'now' } as Plan);
      },
    });
    component.activeTab.set('pricing');
    const beforePlans = [
      { ...SAMPLE_PLAN, included_modules: [] }, // Starter empty
      { ...PRO_PLAN, included_modules: [] },
      { ...BUSINESS_PLAN, included_modules: [] },
    ];
    component.plans.set(beforePlans);

    const starter = component.plans().find((p) => p.id === 'starter')!;
    await component.toggleModuleInPlan(starter, NEW_MODULE);

    // All three plans reverted to original (no module).
    const afterPlans = component.plans();
    expect(afterPlans.find((p) => p.id === 'starter')!.included_modules).not.toContain(NEW_MODULE);
    expect(afterPlans.find((p) => p.id === 'pro')!.included_modules).not.toContain(NEW_MODULE);
    expect(afterPlans.find((p) => p.id === 'business')!.included_modules).not.toContain(NEW_MODULE);

    // Error toast fires.
    expect(toast.error).toHaveBeenCalled();
    const errMsg = toast.error.calls.mostRecent().args[1] as string;
    expect(errMsg).toContain('No tienes permisos de super_admin');
  });

  it('does not double-add when a higher plan already has the module', async () => {
    const { component, updatePlan } = setup({
      flag: 'plan-edit-v2',
      role: 'super_admin',
    });
    component.activeTab.set('pricing');
    component.plans.set([
      { ...SAMPLE_PLAN, included_modules: [] }, // Starter empty
      { ...PRO_PLAN, included_modules: [NEW_MODULE] }, // Pro already has it
      { ...BUSINESS_PLAN, included_modules: [NEW_MODULE] }, // Business already has it
    ]);

    const starter = component.plans().find((p) => p.id === 'starter')!;
    await component.toggleModuleInPlan(starter, NEW_MODULE);

    // Starter RPC called (added the module). Pro and Business SKIPPED (already had it).
    expect(updatePlan).toHaveBeenCalledTimes(1);
    expect((updatePlan.calls.mostRecent().args[0] as Plan).id).toBe('starter');
  });
});