/**
 * Unit tests for AuthService — covers PR 2 / PR 3 acceptance:
 *   - acceptInvitation() translates SEAT_LIMIT_EXCEEDED envelope
 *     {success:false, code:'SEAT_LIMIT_EXCEEDED', current, max}
 *     into a friendly Spanish error that includes both numbers
 *     and a plan hint (F-SEAT-003).
 *   - AUTH_MISMATCH and other non-seat errors flow through unchanged
 *     (the fallback path stays intact, F-SEAT-005).
 *
 * Test runner: Karma+Jasmine (`npm run test`). Requires Chrome.
 *
 * Why this is excluded from `npm run test:unit` (Jest):
 *   AuthService imports the full SupabaseClient + Router stack at
 *   construction time. Spinning up that machinery under Jest would
 *   require jest-preset-angular (deferred to a separate refactor).
 *   Run on CI with Karma+Jasmine where Chrome is available.
 */
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { SupabaseClientService } from './supabase-client.service';
import { RuntimeConfigService } from './runtime-config.service';
import { SupabaseModulesService } from './supabase-modules.service';

/**
 * AuthService reads from `environment.production` and `localStorage`
 * at construction. A minimal shim keeps the test from blowing up
 * before we ever call acceptInvitation.
 */
declare const environment: { production: boolean };

interface SupabaseStub {
  rpcCalls: Array<{ name: string; args: any }>;
  rpc: (name: string, args: any) => Promise<{ data: any; error: any }>;
}

function setup(opts: {
  primaryRpcResult: { data: any; error: any };
  primaryRpcName?: string;
  userEmail?: string;
  authUserId?: string;
  isAuthenticated?: boolean;
}) {
  const rpcCalls: Array<{ name: string; args: any }> = [];
  const stub: SupabaseStub = {
    rpcCalls,
    rpc: async (name: string, args: any) => {
      rpcCalls.push({ name, args });
      if (name === (opts.primaryRpcName ?? 'accept_company_invitation')) {
        return opts.primaryRpcResult;
      }
      // Default fallback for any other RPC: empty success.
      return { data: { success: true }, error: null };
    },
  };

  const authStub = {
    // Used by handleAuthStateChange when the test path needs the user.
    getUser: async () => ({
      data: {
        user: opts.isAuthenticated
          ? { id: opts.authUserId ?? 'auth-user-1', email: opts.userEmail ?? 'invitee@example.com' }
          : null,
      },
    }),
    refreshCurrentUser: async () => undefined,
  };

  TestBed.configureTestingModule({
    providers: [
      AuthService,
      { provide: SupabaseClientService, useValue: { instance: stub } },
      {
        provide: RuntimeConfigService,
        useValue: {
          get: () => ({
            supabase: { url: 'http://localhost', anonKey: 'fake-key' },
          }),
        },
      },
      { provide: Router, useValue: { navigate: () => Promise.resolve(true) } },
      { provide: SupabaseModulesService, useValue: {} },
      { provide: AuthService, useValue: authStub },
    ],
  });

  return {
    service: TestBed.inject(AuthService) as AuthService,
    rpcCalls,
  };
}

describe('AuthService.acceptInvitation — PR 2 / PR 3 acceptance', () => {
  it('translates SEAT_LIMIT_EXCEEDED into a Spanish error with current/max numbers and a plan hint', async () => {
    const { service } = setup({
      isAuthenticated: true,
      primaryRpcResult: {
        data: { success: false, code: 'SEAT_LIMIT_EXCEEDED', current: 1, max: 1 },
        error: null,
      },
    });
    const result = await service.acceptInvitation('token-abc');
    expect(result.success).toBe(false);
    expect(result.error).toContain('1');
    // Spanish plan hint per F-SEAT-003.
    expect(result.error?.toLowerCase()).toContain('plan');
  });

  it('returns a plain error for AUTH_MISMATCH (no plan hint)', async () => {
    const { service } = setup({
      isAuthenticated: true,
      primaryRpcResult: {
        data: { success: false, code: 'AUTH_MISMATCH', error: 'AUTH_MISMATCH' },
        error: null,
      },
    });
    const result = await service.acceptInvitation('token-mismatch');
    expect(result.success).toBe(false);
    // Falls through to the generic result.error branch — no seat hint.
    expect(result.error).not.toMatch(/amplía el plan|ampliar el plan/i);
  });

  it('returns the invitation result on success', async () => {
    const { service } = setup({
      isAuthenticated: true,
      primaryRpcResult: {
        data: { success: true, company_id: 'co-1', company_name: 'Acme SL', role: 'member' },
        error: null,
      },
    });
    const result = await service.acceptInvitation('token-good');
    expect(result.success).toBe(true);
    expect(result.company?.id).toBe('co-1');
    expect(result.role).toBe('member');
  });
});