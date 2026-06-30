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

function makeQueryParamMap(flagValue: string | null): ParamMap {
  const m: Record<string, string> = {};
  if (flagValue !== null) m['flag'] = flagValue;
  return convertToParamMap(m);
}

function setup({
  flag,
  role = 'super_admin',
}: { flag: string | null; role?: string }) {
  // AuthService stub: only the methods the component touches in this spec.
  const authStub = {
    userRole: signal<string>(role),
    userProfile: { is_super_admin: role === 'super_admin' } as any,
    isEmergencySuperAdmin: () => role === 'super_admin',
  };

  // planService stub: getPlans returns one sample plan; togglePlanModule
  // resolves; updatePlan either succeeds or throws per the call.
  const updatePlan = jasmine.createSpy('updatePlan').and.callFake((p: Plan) =>
    of({ ...p, updated_at: 'now' } as Plan)
  );
  const planServiceStub = {
    getPlans: () => of([SAMPLE_PLAN]),
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