/**
 * Unit tests for PlanService — covers PR 2 changes:
 *   - getPlans() canonicalizes included_modules (defense in depth vs migration 0001)
 *   - updatePlan() throws 'No tienes permisos de super_admin' on error.code === '42501'
 *   - updatePlan() re-throws non-42501 errors unchanged
 *
 * Test runner: Karma+Jasmine (`npm run test`). Requires Chrome.
 *
 * Excluded from `npm run test:unit` (Jest) for the same reason as
 * seat-badge.component.spec.ts — Angular 21's ESM `@angular/core/testing`
 * is not transformable by Jest's ts-jest preset in this environment.
 */
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { PlanService } from './plan.service';
import { SupabaseClientService } from './supabase-client.service';

// Minimal shape we control in each test.
interface FakeQueryResult<T> {
  data: T | null;
  error: { code?: string; message?: string } | null;
}

function makeSupabaseStub(impl: {
  select?: FakeQueryResult<any[]>;
  rpc?: FakeQueryResult<any>;
}) {
  return {
    from: (_table: string) => ({
      select: () => ({
        eq: () => ({
          order: async () => impl.select ?? { data: [], error: null },
        }),
      }),
    }),
    rpc: async (_name: string, _args: any) => impl.rpc ?? { data: null, error: null },
  };
}

function setupService(impl: Parameters<typeof makeSupabaseStub>[0]) {
  const supabaseStub = makeSupabaseStub(impl);
  TestBed.configureTestingModule({
    providers: [
      PlanService,
      { provide: SupabaseClientService, useValue: { instance: supabaseStub } },
    ],
  });
  return { service: TestBed.inject(PlanService), stub: supabaseStub };
}

describe('PlanService (PR 2 additions)', () => {
  describe('getPlans', () => {
    it('canonicalizes legacy module keys before storing in the signal', async () => {
      const { service } = setupService({
        select: {
          data: [
            {
              id: 'p1', name: 'Plan 1', tagline: '', description: null,
              base_price_cents: 0, currency: 'EUR', billing_period: 'monthly',
              included_users: 1, extra_user_cents: 0,
              included_modules: ['clientes', 'facturas', 'core_/clientes'],
              sort_order: 1, is_active: true, is_highlighted: false,
              created_at: '', updated_at: '',
            },
          ],
          error: null,
        },
      });

      const plans = await firstValueFrom(service.getPlans());
      expect(plans[0].included_modules).toEqual([
        'core_/clientes',
        'moduloFacturas',
      ]);
      // Signal holds the same canonicalized list (defense in depth: any
      // consumer that reads plansSignal() also gets canonical keys).
      expect(service.plansSignal()?.[0].included_modules).toEqual([
        'core_/clientes',
        'moduloFacturas',
      ]);
    });
  });

  describe('updatePlan', () => {
    it('translates 42501 RPC errors to "No tienes permisos de super_admin"', async () => {
      const { service } = setupService({
        rpc: {
          data: null,
          error: { code: '42501', message: 'insufficient_privilege: super_admin required' },
        },
      });

      const basePlan = {
        id: 'p1', name: 'Plan 1', tagline: '', description: null,
        base_price_cents: 0, currency: 'EUR', billing_period: 'monthly' as const,
        included_users: 1, extra_user_cents: 0, included_modules: [],
        sort_order: 1, is_active: true, is_highlighted: false,
        created_at: '', updated_at: '',
      };

      await expect(
        firstValueFrom(service.updatePlan(basePlan as any))
      ).rejects.toThrow('No tienes permisos de super_admin');
    });

    it('re-throws non-42501 errors unchanged so callers can show generic toasts', async () => {
      const { service } = setupService({
        rpc: {
          data: null,
          error: { code: '22023', message: 'invalid_module_key' },
        },
      });

      const basePlan = {
        id: 'p1', name: 'Plan 1', tagline: '', description: null,
        base_price_cents: 0, currency: 'EUR', billing_period: 'monthly' as const,
        included_users: 1, extra_user_cents: 0, included_modules: [],
        sort_order: 1, is_active: true, is_highlighted: false,
        created_at: '', updated_at: '',
      };

      await expect(
        firstValueFrom(service.updatePlan(basePlan as any))
      ).rejects.toThrow('invalid_module_key');
    });
  });
});