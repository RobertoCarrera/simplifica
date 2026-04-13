import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BookingWaitlistComponent } from './booking-waitlist.component';
import {
  SupabaseSettingsService,
  CompanySettings,
} from '../../../../../services/supabase-settings.service';
import { ToastService } from '../../../../../services/toast.service';
import { of, throwError } from 'rxjs';

// ---------------------------------------------------------------------------
// Stub factories — recreated before each test to reset spy state
// ---------------------------------------------------------------------------

const makeSettingsStub = (overrides: Partial<CompanySettings> = {}) => ({
  waitlist_active_mode: true,
  waitlist_passive_mode: true,
  waitlist_auto_promote: true,
  waitlist_notification_window: 15,
  ...overrides,
});

let settingsServiceStub: {
  getCompanySettings: jasmine.Spy;
  upsertCompanySettings: jasmine.Spy;
};

let toastServiceStub: { success: jasmine.Spy; error: jasmine.Spy };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BookingWaitlistComponent', () => {
  let component: BookingWaitlistComponent;
  let fixture: ComponentFixture<BookingWaitlistComponent>;

  beforeEach(async () => {
    settingsServiceStub = {
      getCompanySettings: jasmine
        .createSpy('getCompanySettings')
        .and.returnValue(of(makeSettingsStub())),
      upsertCompanySettings: jasmine
        .createSpy('upsertCompanySettings')
        .and.returnValue(of(makeSettingsStub())),
    };

    toastServiceStub = {
      success: jasmine.createSpy('success'),
      error: jasmine.createSpy('error'),
    };

    await TestBed.configureTestingModule({
      imports: [BookingWaitlistComponent],
      providers: [
        { provide: SupabaseSettingsService, useValue: settingsServiceStub },
        { provide: ToastService, useValue: toastServiceStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BookingWaitlistComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should be created', () => {
    expect(component).toBeTruthy();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Initialization
  // ─────────────────────────────────────────────────────────────────────────

  describe('ngOnInit()', () => {
    it('should call getCompanySettings on init', () => {
      expect(settingsServiceStub.getCompanySettings).toHaveBeenCalled();
    });

    it('should populate settings from service response', () => {
      const expected = makeSettingsStub({
        waitlist_active_mode: false,
        waitlist_auto_promote: false,
        waitlist_notification_window: 30,
      });
      settingsServiceStub.getCompanySettings.and.returnValue(of(expected));

      component.ngOnInit();

      expect(component.settings().waitlist_active_mode).toBeFalse();
      expect(component.settings().waitlist_auto_promote).toBeFalse();
      expect(component.settings().waitlist_notification_window).toBe(30);
    });

    it('should set loading=false after settings load', () => {
      expect(component.loading()).toBeFalse();
    });

    it('should set loading=false when getCompanySettings returns null', () => {
      settingsServiceStub.getCompanySettings.and.returnValue(of(null));

      component.ngOnInit();

      expect(component.loading()).toBeFalse();
    });

    it('should set loading=false even when getCompanySettings errors', () => {
      settingsServiceStub.getCompanySettings.and.returnValue(
        throwError(() => new Error('Network error')),
      );

      component.ngOnInit();

      expect(component.loading()).toBeFalse();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // saveSetting()
  // ─────────────────────────────────────────────────────────────────────────

  describe('saveSetting()', () => {
    it('should call upsertCompanySettings with the given key-value pair', () => {
      component.saveSetting('waitlist_active_mode', false);

      expect(settingsServiceStub.upsertCompanySettings).toHaveBeenCalledWith(
        jasmine.objectContaining({ waitlist_active_mode: false }),
      );
    });

    it('should do optimistic update immediately (before server confirms)', () => {
      component.saveSetting('waitlist_passive_mode', false);

      // Optimistic: setting is updated right away, before the observable completes
      expect(component.settings().waitlist_passive_mode).toBeFalse();
    });

    it('should call upsertCompanySettings with notification window value', () => {
      component.saveSetting('waitlist_notification_window', 30);

      expect(settingsServiceStub.upsertCompanySettings).toHaveBeenCalledWith(
        jasmine.objectContaining({ waitlist_notification_window: 30 }),
      );
    });

    it('should show error toast and reload settings when upsert fails', () => {
      settingsServiceStub.upsertCompanySettings.and.returnValue(
        throwError(() => new Error('Save failed')),
      );
      settingsServiceStub.getCompanySettings.and.returnValue(of(makeSettingsStub()));

      component.saveSetting('waitlist_active_mode', false);

      expect(toastServiceStub.error).toHaveBeenCalled();
      // Should have called getCompanySettings again to reload (revert)
      expect(settingsServiceStub.getCompanySettings).toHaveBeenCalledTimes(2);
    });

    it('should set saving=false after successful upsert', () => {
      settingsServiceStub.upsertCompanySettings.and.returnValue(of(makeSettingsStub()));

      component.saveSetting('waitlist_auto_promote', false);

      expect(component.saving()).toBeFalse();
    });

    it('should set saving=false after failed upsert', () => {
      settingsServiceStub.upsertCompanySettings.and.returnValue(
        throwError(() => new Error('Error')),
      );
      settingsServiceStub.getCompanySettings.and.returnValue(of(makeSettingsStub()));

      component.saveSetting('waitlist_auto_promote', false);

      expect(component.saving()).toBeFalse();
    });
  });
});
