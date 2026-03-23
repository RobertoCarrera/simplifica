import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { SupabaseServicesComponent } from './supabase-services.component';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { SupabaseClientService } from '../../../services/supabase-client.service';
import { AuthService } from '../../../services/auth.service';

// ---------------------------------------------------------------------------
// Minimal stubs for all injected services
// ---------------------------------------------------------------------------

const activatedRouteStub = {
  params: of({}),
  queryParams: of({}),
  snapshot: { params: {}, queryParams: {} },
};

/**
 * Minimal Supabase client mock.
 * Prevents SupabaseClientService from calling createClient() during tests,
 * which would crash because supabaseUrl is not set in the test environment.
 */
function buildMinimalSupabaseMock() {
  const single = jasmine.createSpy('single').and.resolveTo({ data: null, error: null });
  const order = jasmine.createSpy('order').and.resolveTo({ data: [], error: null });
  const eq = jasmine.createSpy('eq').and.callFake(() => ({ eq, order, single }));
  const select = jasmine.createSpy('select').and.returnValue({ eq, single, order });
  const insert = jasmine.createSpy('insert').and.returnValue({ select });
  const update = jasmine.createSpy('update').and.returnValue({ eq });
  const from = jasmine.createSpy('from').and.returnValue({ insert, update, select, eq });
  const rpc = jasmine.createSpy('rpc').and.resolveTo({ data: null, error: null });

  return {
    from,
    rpc,
    functions: {
      invoke: jasmine.createSpy('invoke').and.resolveTo({ data: null, error: null }),
    },
  };
}

const supabaseClientServiceStub = {
  instance: buildMinimalSupabaseMock(),
};

/**
 * Minimal AuthService stub.
 * Prevents AuthService from calling createClient() or setting up auth listeners.
 */
const authServiceStub = {
  currentCompanyId: signal<string | null>(null),
  currentUser: null,
  currentUser$: of(null),
};

describe('SupabaseServicesComponent', () => {
  let component: SupabaseServicesComponent;
  let fixture: ComponentFixture<SupabaseServicesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SupabaseServicesComponent],
      providers: [
        { provide: ActivatedRoute, useValue: activatedRouteStub },
        { provide: SupabaseClientService, useValue: supabaseClientServiceStub },
        { provide: AuthService, useValue: authServiceStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SupabaseServicesComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // WaitlistToggle integration (T11)
  // ─────────────────────────────────────────────────────────────────────────

  describe('waitlist toggle integration', () => {
    it('should have onWaitlistToggle method', () => {
      expect(typeof component.onWaitlistToggle).toBe('function');
    });

    it('should update formData.enable_waitlist when onWaitlistToggle is called with enable_waitlist=true', () => {
      component.onWaitlistToggle({
        enable_waitlist: true,
        active_mode_enabled: true,
        passive_mode_enabled: false,
      });

      expect(component.formData.enable_waitlist).toBeTrue();
    });

    it('should update formData.enable_waitlist when onWaitlistToggle is called with enable_waitlist=false', () => {
      component.onWaitlistToggle({
        enable_waitlist: false,
        active_mode_enabled: true,
        passive_mode_enabled: true,
      });

      expect(component.formData.enable_waitlist).toBeFalse();
    });
  });
});
