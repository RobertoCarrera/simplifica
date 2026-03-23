import { TestBed } from '@angular/core/testing';
import {
  SupabaseWaitlistService,
  WaitlistEntry,
  PromoteWaitlistResult,
  NotifyWaitlistResult,
  ClaimWaitlistResult,
} from './supabase-waitlist.service';
import { SupabaseClientService } from './supabase-client.service';
import { AuthService } from './auth.service';
import { signal } from '@angular/core';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const makeEntry = (overrides: Partial<WaitlistEntry> = {}): WaitlistEntry => ({
  id: 'wl-001',
  company_id: 'company-001',
  client_id: 'user-001',
  service_id: 'svc-001',
  start_time: '2026-04-01T10:00:00Z',
  end_time: '2026-04-01T11:00:00Z',
  mode: 'active',
  status: 'pending',
  notified_at: null,
  converted_booking_id: null,
  notes: null,
  created_at: '2026-03-01T00:00:00Z',
  updated_at: '2026-03-01T00:00:00Z',
  ...overrides,
});

/**
 * Build a minimal Supabase client mock for Jasmine spies.
 * Supports from().insert().select().single() and rpc() / functions.invoke().
 */
function buildSupabaseMock() {
  const single = jasmine.createSpy('single').and.resolveTo({ data: makeEntry(), error: null });
  const maybeSingle = jasmine.createSpy('maybeSingle').and.resolveTo({ data: null, error: null });
  const order = jasmine.createSpy('order').and.resolveTo({ data: [], error: null });
  const inFilter = jasmine.createSpy('in').and.returnValue({ order });
  const eq = jasmine
    .createSpy('eq')
    .and.callFake(() => ({ eq, in: inFilter, order, single, maybeSingle }));
  const select = jasmine.createSpy('select').and.returnValue({ eq, single, maybeSingle });
  const insert = jasmine.createSpy('insert').and.returnValue({ select });
  const update = jasmine.createSpy('update').and.returnValue({ eq });
  const del = jasmine.createSpy('delete').and.returnValue({ eq });

  const from = jasmine
    .createSpy('from')
    .and.returnValue({ insert, update, delete: del, select, eq });

  const rpc = jasmine.createSpy('rpc').and.resolveTo({ data: null, error: null });
  const invoke = jasmine
    .createSpy('invoke')
    .and.resolveTo({ data: { success: true }, error: null });

  return {
    from,
    rpc,
    functions: { invoke },
    _chains: { single, maybeSingle, order, inFilter, eq, select, insert, update, del },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SupabaseWaitlistService', () => {
  let service: SupabaseWaitlistService;
  let sb: ReturnType<typeof buildSupabaseMock>;

  beforeEach(() => {
    sb = buildSupabaseMock();

    const mockAuthService = {
      currentCompanyId: signal<string | null>('company-001'),
    };

    TestBed.configureTestingModule({
      providers: [
        SupabaseWaitlistService,
        { provide: SupabaseClientService, useValue: { instance: sb } },
        { provide: AuthService, useValue: mockAuthService },
      ],
    });

    service = TestBed.inject(SupabaseWaitlistService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // addToWaitlist()
  // ─────────────────────────────────────────────────────────────────────────

  describe('addToWaitlist()', () => {
    it('should call supabase.from("waitlist") and insert with status=pending', async () => {
      sb._chains.single.and.resolveTo({ data: makeEntry(), error: null });

      await service.addToWaitlist({
        company_id: 'c',
        client_id: 'u',
        service_id: 's',
        start_time: '2026-04-01T10:00:00Z',
        end_time: '2026-04-01T11:00:00Z',
        mode: 'active',
      });

      expect(sb.from).toHaveBeenCalledWith('waitlist');
      const insertArg = sb._chains.insert.calls.mostRecent().args[0];
      expect(insertArg.status).toBe('pending');
      expect(insertArg.mode).toBe('active');
    });

    it('should default mode to "active" when not provided', async () => {
      sb._chains.single.and.resolveTo({ data: makeEntry(), error: null });

      await service.addToWaitlist({
        company_id: 'c',
        client_id: 'u',
        service_id: 's',
        start_time: 'ts',
        end_time: 'ts',
      });

      const insertArg = sb._chains.insert.calls.mostRecent().args[0];
      expect(insertArg.mode).toBe('active');
    });

    it('should throw when supabase returns an error', async () => {
      const mockError = { message: 'unique violation', code: '23505' };
      sb._chains.single.and.resolveTo({ data: null, error: mockError });

      let thrown: unknown;
      try {
        await service.addToWaitlist({
          company_id: 'c',
          client_id: 'u',
          service_id: 's',
          start_time: 'ts',
          end_time: 'ts',
        });
      } catch (e) {
        thrown = e;
      }

      expect(thrown).toEqual(mockError);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // joinPassiveWaitlist()
  // ─────────────────────────────────────────────────────────────────────────

  describe('joinPassiveWaitlist()', () => {
    it('should insert with mode="passive" and epoch sentinel times', async () => {
      sb._chains.single.and.resolveTo({ data: makeEntry({ mode: 'passive' }), error: null });

      await service.joinPassiveWaitlist({
        company_id: 'company-001',
        client_id: 'user-001',
        service_id: 'svc-001',
      });

      const insertArg = sb._chains.insert.calls.mostRecent().args[0];
      expect(insertArg.mode).toBe('passive');
      expect(insertArg.status).toBe('pending');
      expect(insertArg.start_time).toBe(new Date(0).toISOString());
      expect(insertArg.end_time).toBe(new Date(0).toISOString());
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // leaveWaitlist()
  // ─────────────────────────────────────────────────────────────────────────

  describe('leaveWaitlist()', () => {
    it('should update entry to status=cancelled', async () => {
      const eqResolved = jasmine.createSpy('eq').and.resolveTo({ data: null, error: null });
      const updateChain = {
        update: jasmine.createSpy('update').and.returnValue({ eq: eqResolved }),
        eq: eqResolved,
      };
      sb.from.and.returnValue(updateChain);

      await service.leaveWaitlist('wl-001');

      const updateArg = updateChain.update.calls.mostRecent().args[0];
      expect(updateArg.status).toBe('cancelled');
    });

    it('should throw on supabase error', async () => {
      const mockError = { message: 'not found' };
      const eqResolved = jasmine.createSpy('eq').and.resolveTo({ data: null, error: mockError });
      sb.from.and.returnValue({
        update: jasmine.createSpy('update').and.returnValue({ eq: eqResolved }),
      });

      let thrown: unknown;
      try {
        await service.leaveWaitlist('wl-001');
      } catch (e) {
        thrown = e;
      }

      expect(thrown).toEqual(mockError);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // promoteWaitlist()
  // ─────────────────────────────────────────────────────────────────────────

  describe('promoteWaitlist()', () => {
    it('should call promote_waitlist RPC with correct params', async () => {
      const rpcResult: PromoteWaitlistResult = { promoted: false, message: 'no_pending_entries' };
      sb.rpc.and.resolveTo({ data: rpcResult, error: null });

      await service.promoteWaitlist('svc-001', '2026-04-01T10:00:00Z', '2026-04-01T11:00:00Z');

      expect(sb.rpc).toHaveBeenCalledWith('promote_waitlist', {
        p_service_id: 'svc-001',
        p_start_time: '2026-04-01T10:00:00Z',
        p_end_time: '2026-04-01T11:00:00Z',
      });
    });

    it('should dispatch send-waitlist-email when promoted=true with client_email', async () => {
      const rpcResult: PromoteWaitlistResult = {
        promoted: true,
        waitlist_id: 'wl-001',
        client_email: 'client@test.com',
        client_name: 'Test Client',
        service_name: 'Yoga',
      };
      sb.rpc.and.resolveTo({ data: rpcResult, error: null });

      await service.promoteWaitlist('svc-001', '2026-04-01T10:00:00Z', '2026-04-01T11:00:00Z');

      expect(sb.functions.invoke).toHaveBeenCalledWith(
        'send-waitlist-email',
        jasmine.objectContaining({
          body: jasmine.objectContaining({ to: 'client@test.com', type: 'promoted' }),
        }),
      );
    });

    it('should NOT dispatch email when promoted=false', async () => {
      const rpcResult: PromoteWaitlistResult = { promoted: false, message: 'no_pending_entries' };
      sb.rpc.and.resolveTo({ data: rpcResult, error: null });

      await service.promoteWaitlist('svc-001', 'ts', 'ts');

      expect(sb.functions.invoke).not.toHaveBeenCalled();
    });

    it('should return notify_instead=true when auto_promote is disabled', async () => {
      const rpcResult: PromoteWaitlistResult = { promoted: false, notify_instead: true };
      sb.rpc.and.resolveTo({ data: rpcResult, error: null });

      const result = await service.promoteWaitlist('svc-001', 'ts', 'ts');

      expect(result.notify_instead).toBeTrue();
      expect(result.promoted).toBeFalse();
    });

    it('should throw when RPC returns a network/transport error', async () => {
      const mockError = { message: 'RPC error', code: 'P0001' };
      sb.rpc.and.resolveTo({ data: null, error: mockError });

      let thrown: unknown;
      try {
        await service.promoteWaitlist('svc-001', 'ts', 'ts');
      } catch (e) {
        thrown = e;
      }

      expect(thrown).toEqual(mockError);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // notifyWaitlist()
  // ─────────────────────────────────────────────────────────────────────────

  describe('notifyWaitlist()', () => {
    it('should call notify_waitlist RPC with correct params', async () => {
      const rpcResult: NotifyWaitlistResult = { notified: 0, emails_to_send: [] };
      sb.rpc.and.resolveTo({ data: rpcResult, error: null });

      await service.notifyWaitlist('svc-001', 'ts', 'ts', 'active');

      expect(sb.rpc).toHaveBeenCalledWith('notify_waitlist', {
        p_service_id: 'svc-001',
        p_start_time: 'ts',
        p_end_time: 'ts',
        p_mode: 'active',
      });
    });

    it('should default mode to "active" when not provided', async () => {
      const rpcResult: NotifyWaitlistResult = { notified: 0, emails_to_send: [] };
      sb.rpc.and.resolveTo({ data: rpcResult, error: null });

      await service.notifyWaitlist('svc-001', 'ts', 'ts');

      const rpcArg = sb.rpc.calls.mostRecent().args[1] as Record<string, unknown>;
      expect(rpcArg['p_mode']).toBe('active');
    });

    it('should dispatch send-waitlist-email for each entry in emails_to_send (passive)', async () => {
      const rpcResult: NotifyWaitlistResult = {
        notified: 2,
        emails_to_send: [
          { email: 'a@test.com', name: 'A', service_name: 'Yoga', waitlist_id: 'wl-001' },
          { email: 'b@test.com', name: 'B', service_name: 'Yoga', waitlist_id: 'wl-002' },
        ],
      };
      sb.rpc.and.resolveTo({ data: rpcResult, error: null });

      await service.notifyWaitlist('svc-001', 'ts', 'ts', 'passive');

      expect(sb.functions.invoke).toHaveBeenCalledTimes(2);
      const firstCall = sb.functions.invoke.calls.argsFor(0);
      expect(firstCall[0]).toBe('send-waitlist-email');
      expect((firstCall[1] as { body: Record<string, unknown> }).body['type']).toBe('passive');
    });

    it('should use type "active_notify" for active mode emails', async () => {
      const rpcResult: NotifyWaitlistResult = {
        notified: 1,
        emails_to_send: [
          { email: 'x@test.com', name: 'X', service_name: 'Pilates', waitlist_id: 'wl-010' },
        ],
      };
      sb.rpc.and.resolveTo({ data: rpcResult, error: null });

      await service.notifyWaitlist('svc-001', 'ts', 'ts', 'active');

      const invokeArg = sb.functions.invoke.calls.mostRecent().args[1] as {
        body: Record<string, unknown>;
      };
      expect(invokeArg.body['type']).toBe('active_notify');
    });

    it('should NOT dispatch any emails when emails_to_send is empty', async () => {
      const rpcResult: NotifyWaitlistResult = { notified: 0, emails_to_send: [] };
      sb.rpc.and.resolveTo({ data: rpcResult, error: null });

      await service.notifyWaitlist('svc-001', 'ts', 'ts');

      expect(sb.functions.invoke).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // claimSpot()
  // ─────────────────────────────────────────────────────────────────────────

  describe('claimSpot()', () => {
    it('should call claim_waitlist_spot RPC with correct entry ID', async () => {
      const claimResult: ClaimWaitlistResult = { booking_id: 'bk-001' };
      sb.rpc.and.resolveTo({ data: claimResult, error: null });

      const result = await service.claimSpot('wl-001');

      expect(sb.rpc).toHaveBeenCalledWith('claim_waitlist_spot', { p_waitlist_entry_id: 'wl-001' });
      expect((result as { booking_id: string }).booking_id).toBe('bk-001');
    });

    it('should return error object for spot_taken', async () => {
      sb.rpc.and.resolveTo({ data: { error: 'spot_taken' }, error: null });

      const result = await service.claimSpot('wl-001');

      expect((result as { error: string }).error).toBe('spot_taken');
    });

    it('should return error object for window_expired', async () => {
      sb.rpc.and.resolveTo({ data: { error: 'window_expired' }, error: null });

      const result = await service.claimSpot('wl-001');

      expect((result as { error: string }).error).toBe('window_expired');
    });

    it('should return error for already_booked', async () => {
      sb.rpc.and.resolveTo({ data: { error: 'already_booked' }, error: null });

      const result = await service.claimSpot('wl-001');

      expect((result as { error: string }).error).toBe('already_booked');
    });

    it('should throw on RPC transport error', async () => {
      const mockError = { message: 'network error' };
      sb.rpc.and.resolveTo({ data: null, error: mockError });

      let thrown: unknown;
      try {
        await service.claimSpot('wl-001');
      } catch (e) {
        thrown = e;
      }

      expect(thrown).toEqual(mockError);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // handleCancellationWaitlist()
  // ─────────────────────────────────────────────────────────────────────────

  describe('handleCancellationWaitlist()', () => {
    it('should call promote_waitlist and then notify_waitlist passive on cancellation', async () => {
      const promoteResult: PromoteWaitlistResult = {
        promoted: true,
        client_email: 'client@test.com',
        client_name: 'Test',
        service_name: 'Yoga',
        waitlist_id: 'wl-001',
      };

      sb.rpc.and.callFake((fnName: string) => {
        if (fnName === 'promote_waitlist')
          return Promise.resolve({ data: promoteResult, error: null });
        return Promise.resolve({ data: { notified: 0, emails_to_send: [] }, error: null });
      });

      await service.handleCancellationWaitlist('svc-001', 'ts', 'ts');

      const rpcCalls = sb.rpc.calls.allArgs() as Array<[string, unknown]>;
      expect(rpcCalls.some(([fn]) => fn === 'promote_waitlist')).toBeTrue();
      expect(
        rpcCalls.some(
          ([fn, args]) =>
            fn === 'notify_waitlist' && (args as Record<string, unknown>)['p_mode'] === 'passive',
        ),
      ).toBeTrue();
    });

    it('should call notify_waitlist active when promote returns notify_instead=true', async () => {
      const promoteResult: PromoteWaitlistResult = { promoted: false, notify_instead: true };

      sb.rpc.and.callFake((fnName: string) => {
        if (fnName === 'promote_waitlist')
          return Promise.resolve({ data: promoteResult, error: null });
        return Promise.resolve({ data: { notified: 0, emails_to_send: [] }, error: null });
      });

      await service.handleCancellationWaitlist('svc-001', 'ts', 'ts');

      const rpcCalls = sb.rpc.calls.allArgs() as Array<[string, unknown]>;
      const notifyCalls = rpcCalls.filter(([fn]) => fn === 'notify_waitlist');
      expect(
        notifyCalls.some(([, args]) => (args as Record<string, unknown>)['p_mode'] === 'active'),
      ).toBeTrue();
      expect(
        notifyCalls.some(([, args]) => (args as Record<string, unknown>)['p_mode'] === 'passive'),
      ).toBeTrue();
    });

    it('should not throw if promoteWaitlist RPC fails — continues to passive notify', async () => {
      const mockError = { message: 'RPC error' };
      sb.rpc.and.callFake((fnName: string) => {
        if (fnName === 'promote_waitlist') return Promise.resolve({ data: null, error: mockError });
        return Promise.resolve({ data: { notified: 0, emails_to_send: [] }, error: null });
      });

      let thrown: unknown;
      try {
        await service.handleCancellationWaitlist('svc-001', 'ts', 'ts');
      } catch (e) {
        thrown = e;
      }

      expect(thrown).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // getPassiveWaitlistForService()
  // ─────────────────────────────────────────────────────────────────────────

  describe('getPassiveWaitlistForService()', () => {
    it('should query waitlist filtered by service_id and mode=passive', async () => {
      const eqChain = {
        eq: jasmine.createSpy('eq').and.callFake(() => eqChain),
        in: jasmine.createSpy('in').and.callFake(() => eqChain),
        order: jasmine.createSpy('order').and.resolveTo({ data: [], error: null }),
      };
      const selectChain = { select: jasmine.createSpy('select').and.returnValue(eqChain) };
      sb.from.and.returnValue(selectChain);

      await service.getPassiveWaitlistForService('svc-001');

      expect(eqChain.eq).toHaveBeenCalledWith('service_id', 'svc-001');
      expect(eqChain.eq).toHaveBeenCalledWith('mode', 'passive');
    });
  });
});
