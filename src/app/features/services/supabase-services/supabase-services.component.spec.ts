import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SupabaseServicesComponent } from './supabase-services.component';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';

// ---------------------------------------------------------------------------
// Minimal stubs for all injected services
// ---------------------------------------------------------------------------

const activatedRouteStub = {
  params: of({}),
  queryParams: of({}),
  snapshot: { params: {}, queryParams: {} },
};

// SupabaseServicesComponent may inject various services via `inject()`.
// We provide minimal stubs to prevent DI errors during compilation.
// Tests that need deeper mocking should extend these stubs.

describe('SupabaseServicesComponent', () => {
  let component: SupabaseServicesComponent;
  let fixture: ComponentFixture<SupabaseServicesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SupabaseServicesComponent],
      providers: [{ provide: ActivatedRoute, useValue: activatedRouteStub }],
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
