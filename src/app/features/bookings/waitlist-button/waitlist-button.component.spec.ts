import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WaitlistButtonComponent } from './waitlist-button.component';
import { SupabaseWaitlistService } from '../../../services/supabase-waitlist.service';
import { AuthService } from '../../../services/auth.service';
import { ToastService } from '../../../services/toast.service';

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

const waitlistServiceStub = {
  addToWaitlist: jasmine.createSpy('addToWaitlist'),
  leaveWaitlist: jasmine.createSpy('leaveWaitlist'),
};

const authServiceStub = {
  userProfile: { id: 'user-001' },
};

const toastServiceStub = {
  success: jasmine.createSpy('success'),
  error: jasmine.createSpy('error'),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WaitlistButtonComponent', () => {
  let component: WaitlistButtonComponent;
  let fixture: ComponentFixture<WaitlistButtonComponent>;

  beforeEach(async () => {
    waitlistServiceStub.addToWaitlist = jasmine.createSpy('addToWaitlist');
    waitlistServiceStub.leaveWaitlist = jasmine.createSpy('leaveWaitlist');
    toastServiceStub.success = jasmine.createSpy('success');
    toastServiceStub.error = jasmine.createSpy('error');

    await TestBed.configureTestingModule({
      imports: [WaitlistButtonComponent],
      providers: [
        { provide: SupabaseWaitlistService, useValue: waitlistServiceStub },
        { provide: AuthService, useValue: authServiceStub },
        { provide: ToastService, useValue: toastServiceStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WaitlistButtonComponent);
    component = fixture.componentInstance;
  });

  it('should be created', () => {
    expect(component).toBeTruthy();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Rendering guard conditions
  // ─────────────────────────────────────────────────────────────────────────

  it('should not render any button when enableWaitlist=false', () => {
    component.enableWaitlist = false;
    component.activeModeEnabled = true;
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const button = compiled.querySelector('button');
    expect(button).toBeNull();
  });

  it('should not render any button when activeModeEnabled=false', () => {
    component.enableWaitlist = true;
    component.activeModeEnabled = false;
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const button = compiled.querySelector('button');
    expect(button).toBeNull();
  });

  it('should render join button when enableWaitlist=true and activeModeEnabled=true and no entry', () => {
    component.enableWaitlist = true;
    component.activeModeEnabled = true;
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const button = compiled.querySelector('button');
    expect(button).toBeTruthy();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // joinWaitlist()
  // ─────────────────────────────────────────────────────────────────────────

  describe('joinWaitlist()', () => {
    beforeEach(() => {
      component.enableWaitlist = true;
      component.activeModeEnabled = true;
      component.serviceId = 'svc-001';
      component.companyId = 'company-001';
      component.startTime = '2026-04-01T10:00:00Z';
      component.endTime = '2026-04-01T11:00:00Z';
    });

    it('should call addToWaitlist with correct params and emit joined event', async () => {
      const newEntry = {
        id: 'wl-001',
        company_id: 'company-001',
        client_id: 'user-001',
        service_id: 'svc-001',
        start_time: '2026-04-01T10:00:00Z',
        end_time: '2026-04-01T11:00:00Z',
        mode: 'active' as const,
        status: 'pending' as const,
        notified_at: null,
        converted_booking_id: null,
        notes: null,
        created_at: '2026-03-01T00:00:00Z',
        updated_at: '2026-03-01T00:00:00Z',
      };
      waitlistServiceStub.addToWaitlist.and.resolveTo(newEntry);

      const joinedSpy = jasmine.createSpy('joined');
      component.joined.subscribe(joinedSpy);

      await component.joinWaitlist();

      expect(waitlistServiceStub.addToWaitlist).toHaveBeenCalledWith(
        jasmine.objectContaining({
          company_id: 'company-001',
          client_id: 'user-001',
          service_id: 'svc-001',
          mode: 'active',
        }),
      );
      expect(joinedSpy).toHaveBeenCalledWith(newEntry);
      expect(toastServiceStub.success).toHaveBeenCalled();
    });

    it('should show error toast when addToWaitlist fails', async () => {
      waitlistServiceStub.addToWaitlist.and.rejectWith(new Error('DB error'));

      await component.joinWaitlist();

      expect(toastServiceStub.error).toHaveBeenCalled();
    });

    it('should show error toast when serviceId is missing', async () => {
      component.serviceId = '';

      await component.joinWaitlist();

      expect(toastServiceStub.error).toHaveBeenCalled();
      expect(waitlistServiceStub.addToWaitlist).not.toHaveBeenCalled();
    });

    it('should show session error when user is not authenticated', async () => {
      (authServiceStub as { userProfile: unknown }).userProfile = null;

      await component.joinWaitlist();

      expect(toastServiceStub.error).toHaveBeenCalled();
      expect(waitlistServiceStub.addToWaitlist).not.toHaveBeenCalled();

      // Restore
      (authServiceStub as { userProfile: unknown }).userProfile = { id: 'user-001' };
    });

    it('should set loading=false after successful join', async () => {
      const newEntry = {
        id: 'wl-001',
        company_id: 'c',
        client_id: 'u',
        service_id: 's',
        start_time: 'ts',
        end_time: 'ts',
        mode: 'active' as const,
        status: 'pending' as const,
        notified_at: null,
        converted_booking_id: null,
        notes: null,
        created_at: 'ts',
        updated_at: 'ts',
      };
      waitlistServiceStub.addToWaitlist.and.resolveTo(newEntry);

      await component.joinWaitlist();

      expect(component.loading()).toBeFalse();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // leaveWaitlist()
  // ─────────────────────────────────────────────────────────────────────────

  describe('leaveWaitlist()', () => {
    it('should call leaveWaitlist and emit left event', async () => {
      const existingEntry = {
        id: 'wl-001',
        company_id: 'c',
        client_id: 'u',
        service_id: 's',
        start_time: 'ts',
        end_time: 'ts',
        mode: 'active' as const,
        status: 'notified' as const,
        notified_at: null,
        converted_booking_id: null,
        notes: null,
        created_at: 'ts',
        updated_at: 'ts',
      };
      component.existingEntry = existingEntry;
      waitlistServiceStub.leaveWaitlist.and.resolveTo(undefined);

      const leftSpy = jasmine.createSpy('left');
      component.left.subscribe(leftSpy);

      await component.leaveWaitlist();

      expect(waitlistServiceStub.leaveWaitlist).toHaveBeenCalledWith('wl-001');
      expect(leftSpy).toHaveBeenCalled();
      expect(component.entry()).toBeNull();
    });

    it('should show error toast when leaveWaitlist fails', async () => {
      const existingEntry = {
        id: 'wl-001',
        company_id: 'c',
        client_id: 'u',
        service_id: 's',
        start_time: 'ts',
        end_time: 'ts',
        mode: 'active' as const,
        status: 'notified' as const,
        notified_at: null,
        converted_booking_id: null,
        notes: null,
        created_at: 'ts',
        updated_at: 'ts',
      };
      component.existingEntry = existingEntry;
      waitlistServiceStub.leaveWaitlist.and.rejectWith(new Error('Network error'));

      await component.leaveWaitlist();

      expect(toastServiceStub.error).toHaveBeenCalled();
    });

    it('should not call leaveWaitlist if no current entry', async () => {
      // No entry set
      component.entry.set(null);

      await component.leaveWaitlist();

      expect(waitlistServiceStub.leaveWaitlist).not.toHaveBeenCalled();
    });
  });
});
