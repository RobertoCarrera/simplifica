import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';

import { ConsentGateComponent } from './consent-gate.component';
import {
  GdprComplianceService,
  GdprConsentRecord,
} from '../../../../services/gdpr-compliance.service';
import { ToastService } from '../../../../services/toast.service';
import { AuthService } from '../../../../services/auth.service';

// ─── Typed stub factory ───────────────────────────────────────────────────────
function makeServiceStub<T>(methods: Partial<T>): T {
  return methods as unknown as T;
}

// ─── GdprComplianceService stub ───────────────────────────────────────────────
function makeGdprServiceStub(opts: { recordConsentError?: boolean } = {}): GdprComplianceService {
  return makeServiceStub<GdprComplianceService>({
    recordConsent: opts.recordConsentError
      ? jasmine
          .createSpy('recordConsent')
          .and.returnValue(throwError(() => new Error('Network error')))
      : jasmine.createSpy('recordConsent').and.returnValue(of({} as GdprConsentRecord)),
    getConsentRecords: jasmine.createSpy('getConsentRecords').and.returnValue(of([])),
  });
}

// ─── ToastService stub ────────────────────────────────────────────────────────
function makeToastServiceStub(): ToastService {
  return makeServiceStub<ToastService>({
    success: jasmine.createSpy('success'),
    error: jasmine.createSpy('error'),
    warning: jasmine.createSpy('warning'),
    info: jasmine.createSpy('info'),
  });
}

// ─── AuthService stub ─────────────────────────────────────────────────────────
function makeAuthServiceStub(): AuthService {
  return makeServiceStub<AuthService>({
    companyId: signal('test-company-id'),
  });
}

// ─── TestBed helper ──────────────────────────────────────────────────────────
async function configureConsentGateTestBed(
  opts: { recordConsentError?: boolean } = {},
): Promise<void> {
  await TestBed.configureTestingModule({
    imports: [ConsentGateComponent],
  })
    .overrideProvider(GdprComplianceService, { useValue: makeGdprServiceStub(opts) })
    .overrideProvider(ToastService, { useValue: makeToastServiceStub() })
    .overrideProvider(AuthService, { useValue: makeAuthServiceStub() })
    .compileComponents();
}

// ─────────────────────────────────────────────────────────────────────────────

describe('ConsentGateComponent', () => {
  // ─── Task 3.10: syncLoading output emission tests ────────────────────────

  describe('syncLoading output', () => {
    let component: ConsentGateComponent;
    let fixture: ComponentFixture<ConsentGateComponent>;

    beforeEach(async () => {
      await configureConsentGateTestBed();
      fixture = TestBed.createComponent(ConsentGateComponent);
      component = fixture.componentInstance;
      component.clientEmail = 'test@example.com';
      fixture.detectChanges();
    });

    it('should emit syncLoading(true) when grantConsent() starts', async () => {
      const emitted: boolean[] = [];
      component.syncLoading.subscribe((v) => emitted.push(v));

      await component.grantConsent();

      expect(emitted[0]).toBeTrue();
    });

    it('should emit syncLoading(false) after grantConsent() completes (success)', async () => {
      const emitted: boolean[] = [];
      component.syncLoading.subscribe((v) => emitted.push(v));

      await component.grantConsent();

      // Last emission must be false (finally block)
      expect(emitted[emitted.length - 1]).toBeFalse();
    });

    it('should emit syncLoading true then false in correct order', async () => {
      const emitted: boolean[] = [];
      component.syncLoading.subscribe((v) => emitted.push(v));

      await component.grantConsent();

      expect(emitted).toEqual([true, false]);
    });
  });

  describe('syncLoading output on error', () => {
    let component: ConsentGateComponent;
    let fixture: ComponentFixture<ConsentGateComponent>;

    beforeEach(async () => {
      await configureConsentGateTestBed({ recordConsentError: true });
      fixture = TestBed.createComponent(ConsentGateComponent);
      component = fixture.componentInstance;
      component.clientEmail = 'test@example.com';
      fixture.detectChanges();
    });

    it('should still emit syncLoading(false) even when grantConsent() throws', async () => {
      const emitted: boolean[] = [];
      component.syncLoading.subscribe((v) => emitted.push(v));

      await component.grantConsent();

      expect(emitted).toEqual([true, false]);
    });

    it('should set errorMessage when grantConsent() fails', async () => {
      await component.grantConsent();

      expect(component['errorMessage']()).toBe('Network error');
    });
  });

  describe('retryConsent()', () => {
    let component: ConsentGateComponent;
    let fixture: ComponentFixture<ConsentGateComponent>;
    let gdprService: GdprComplianceService;

    beforeEach(async () => {
      await configureConsentGateTestBed();
      fixture = TestBed.createComponent(ConsentGateComponent);
      component = fixture.componentInstance;
      component.clientEmail = 'test@example.com';
      fixture.detectChanges();
      gdprService = TestBed.inject(GdprComplianceService);
    });

    it('should clear errorMessage before retrying', async () => {
      // Simulate an existing error state
      component['errorMessage'].set('Previous error');

      await component.retryConsent();

      // After successful retry the error should be gone
      expect(component['errorMessage']()).toBeNull();
    });

    it('should call grantConsent() again (gdpr.recordConsent called)', async () => {
      await component.retryConsent();

      expect(gdprService.recordConsent).toHaveBeenCalled();
    });
  });

  describe('retry button in template', () => {
    let component: ConsentGateComponent;
    let fixture: ComponentFixture<ConsentGateComponent>;

    beforeEach(async () => {
      await configureConsentGateTestBed({ recordConsentError: true });
      fixture = TestBed.createComponent(ConsentGateComponent);
      component = fixture.componentInstance;
      component.clientEmail = 'test@example.com';
      fixture.detectChanges();
    });

    it('should render a retry button when errorMessage is set', async () => {
      await component.grantConsent();
      fixture.detectChanges();

      const retryBtn: HTMLButtonElement | null =
        fixture.nativeElement.querySelector('button.underline');
      expect(retryBtn).not.toBeNull();
      expect(retryBtn!.textContent).toContain('Reintentar');
    });

    it('should NOT render a retry button when there is no error', () => {
      // No error set yet
      const retryBtn: HTMLButtonElement | null =
        fixture.nativeElement.querySelector('button.underline');
      expect(retryBtn).toBeNull();
    });
  });
});
