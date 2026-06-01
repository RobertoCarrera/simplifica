import { TestBed } from '@angular/core/testing';
import { SupabaseBookingsService, SourceKey } from './supabase-bookings.service';
import { SupabaseClientService } from './supabase-client.service';
import { AuthService } from './auth.service';

describe('SupabaseBookingsService', () => {
  let service: SupabaseBookingsService;
  let mockSupabase: { rpc: jasmine.ExistingFunc | jasmine.Func; from: jasmine.ExistingFunc | jasmine.Func };
  let rpcSpy: jasmine.Spy;

  beforeEach(() => {
    rpcSpy = jasmine.createSpy('rpc').and.returnValue(Promise.resolve({ data: null, error: null }));
    mockSupabase = {
      rpc: rpcSpy,
      from: jasmine.createSpy('from').and.returnValue({
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            single: jasmine.createSpy('single').and.returnValue(Promise.resolve({ data: null, error: null })),
          }),
        }),
      }),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: SupabaseClientService, useValue: { instance: mockSupabase } },
        { provide: AuthService, useValue: { currentCompanyId: () => 'test-company-id' } },
        SupabaseBookingsService,
      ],
    });
    service = TestBed.inject(SupabaseBookingsService);
  });

  describe('bookSlot routing', () => {
    const professionalId = '11111111-1111-1111-1111-111111111111';
    const startTime = '2026-06-01T09:00:00Z';
    const endTime = '2026-06-01T09:30:00Z';
    const bookingData = { customer_name: 'Test', customer_email: 'test@test.com' };

    it('6.4: routes to create_booking_with_resource when source=agenda', async () => {
      rpcSpy.and.returnValue(
        Promise.resolve({
          data: { success: true, booking_id: '22222222-2222-2222-2222-222222222222', resource_id: '33333333-3333-3333-3333-333333333333' },
          error: null,
        })
      );

      await service.bookSlot(professionalId, startTime, endTime, bookingData, 'public_portal');

      expect(rpcSpy).toHaveBeenCalledWith('create_booking_with_resource', {
        p_professional_id: professionalId,
        p_start_time: startTime,
        p_end_time: endTime,
        p_booking_data: bookingData,
        p_source: 'public_portal',
      });
    });

    it('6.4: routes to create_booking_with_resource when source=professional', async () => {
      rpcSpy.and.returnValue(
        Promise.resolve({
          data: { success: true, booking_id: '22222222-2222-2222-2222-222222222222', resource_id: '33333333-3333-3333-3333-333333333333' },
          error: null,
        })
      );

      await service.bookSlot(professionalId, startTime, endTime, bookingData, 'professional');

      expect(rpcSpy).toHaveBeenCalledWith('create_booking_with_resource', {
        p_professional_id: professionalId,
        p_start_time: startTime,
        p_end_time: endTime,
        p_booking_data: bookingData,
        p_source: 'professional',
      });
    });

    it('6.4: routes to book_slot (old RPC) when source=admin', async () => {
      rpcSpy.and.returnValue(
        Promise.resolve({
          data: { success: true, booking_id: '22222222-2222-2222-2222-222222222222' },
          error: null,
        })
      );

      await service.bookSlot(professionalId, startTime, endTime, bookingData, 'admin');

      expect(rpcSpy).toHaveBeenCalledWith('book_slot', {
        p_professional_id: professionalId,
        p_start_time: startTime,
        p_end_time: endTime,
        p_booking_data: bookingData,
      });
    });

    it('6.4: routes to book_slot (old RPC) when source is undefined', async () => {
      rpcSpy.and.returnValue(
        Promise.resolve({
          data: { success: true, booking_id: '22222222-2222-2222-2222-222222222222' },
          error: null,
        })
      );

      await service.bookSlot(professionalId, startTime, endTime, bookingData);

      expect(rpcSpy).toHaveBeenCalledWith('book_slot', {
        p_professional_id: professionalId,
        p_start_time: startTime,
        p_end_time: endTime,
        p_booking_data: bookingData,
      });
    });
  });
});
