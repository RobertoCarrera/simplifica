import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of } from 'rxjs';

import { FormNewCustomerComponent } from './form-new-customer.component';
import { SupabaseModulesService } from '../../../services/supabase-modules.service';
import { SupabaseCustomersService } from '../../../services/supabase-customers.service';
import { LocalitiesService } from '../../../services/localities.service';
import { AddressesService } from '../../../services/addresses.service';
import { ToastService } from '../../../services/toast.service';
import { HoneypotService } from '../../../services/honeypot.service';
import { AuthService } from '../../../services/auth.service';
import { GlobalTagsService } from '../../../core/services/global-tags.service';
import {
  GdprComplianceService,
  GdprConsentRecord,
} from '../../../services/gdpr-compliance.service';
import { AuditLoggerService } from '../../../services/audit-logger.service';

// ─── Task 1.1: Typed stub factory ────────────────────────────────────────────
/**
 * Creates a typed stub for any service interface.
 * Methods not provided default to jasmine spies returning undefined.
 */
function makeServiceStub<T>(methods: Partial<T>): T {
  return methods as unknown as T;
}

// ─── Task 1.2: SupabaseModulesService stub ───────────────────────────────────
function makeModulesServiceStub(isEnabled: boolean | null): SupabaseModulesService {
  return makeServiceStub<SupabaseModulesService>({
    isModuleEnabled: (_key: string) => isEnabled,
    modulesSignal: signal(null),
  });
}

// ─── Task 1.3: SupabaseCustomersService stub ─────────────────────────────────
function makeCustomersServiceStub(): SupabaseCustomersService {
  return makeServiceStub<SupabaseCustomersService>({
    createCustomer: jasmine.createSpy('createCustomer').and.returnValue(of({})),
    updateCustomer: jasmine.createSpy('updateCustomer').and.returnValue(of({})),
    getCustomer: jasmine.createSpy('getCustomer').and.returnValue(of(null)),
    getDistinctColumnValues: jasmine.createSpy('getDistinctColumnValues').and.returnValue(of([])),
    checkEmailExists: jasmine.createSpy('checkEmailExists').and.returnValue(Promise.resolve(false)),
    getClientContacts: jasmine.createSpy('getClientContacts').and.returnValue(Promise.resolve([])),
    saveClientContacts: jasmine.createSpy('saveClientContacts').and.returnValue(Promise.resolve()),
  });
}

// ─── Task 1.4: LocalitiesService stub ───────────────────────────────────────
function makeLocalitiesServiceStub(): LocalitiesService {
  return makeServiceStub<LocalitiesService>({
    getLocalities: jasmine.createSpy('getLocalities').and.returnValue(of([])),
    searchLocalities: jasmine.createSpy('searchLocalities').and.returnValue(of([])),
    findByPostalCode: jasmine.createSpy('findByPostalCode').and.returnValue(of(null)),
    createLocality: jasmine.createSpy('createLocality').and.returnValue(of({})),
  });
}

// ─── Task 1.5: AddressesService stub ────────────────────────────────────────
function makeAddressesServiceStub(): AddressesService {
  return makeServiceStub<AddressesService>({
    getAddresses: jasmine.createSpy('getAddresses').and.returnValue(of([])),
    getAddressById: jasmine.createSpy('getAddressById').and.returnValue(of(null)),
    createAddress: jasmine.createSpy('createAddress').and.returnValue(of({ _id: 'addr-1' })),
  });
}

// ─── Task 1.6: ToastService stub ────────────────────────────────────────────
function makeToastServiceStub(): ToastService {
  return makeServiceStub<ToastService>({
    success: jasmine.createSpy('success'),
    error: jasmine.createSpy('error'),
    warning: jasmine.createSpy('warning'),
    info: jasmine.createSpy('info'),
  });
}

// ─── Task 1.7: HoneypotService stub ─────────────────────────────────────────
function makeHoneypotServiceStub(): HoneypotService {
  return makeServiceStub<HoneypotService>({
    getHoneypotFieldName: jasmine
      .createSpy('getHoneypotFieldName')
      .and.returnValue('email_confirm'),
    getFormLoadTime: jasmine.createSpy('getFormLoadTime').and.returnValue(Date.now()),
    getSubmissionTime: jasmine.createSpy('getSubmissionTime').and.returnValue(5000),
    isProbablyBot: jasmine.createSpy('isProbablyBot').and.returnValue(false),
  });
}

// ─── Task 1.8: AuthService stub ──────────────────────────────────────────────
function makeAuthServiceStub(): AuthService {
  return makeServiceStub<AuthService>({
    userProfile: null,
    companyId: signal('test-company-id'),
    currentCompanyId: signal(null),
    userProfileSignal: signal(null),
    isAuthenticated: signal(false),
  });
}

// ─── Task 1.9: GlobalTagsService stub ────────────────────────────────────────
function makeGlobalTagsServiceStub(): GlobalTagsService {
  return makeServiceStub<GlobalTagsService>({
    getTags: jasmine.createSpy('getTags').and.returnValue(of([])),
    assignMultipleTags: jasmine.createSpy('assignMultipleTags').and.returnValue(of(void 0)),
  });
}

// ─── Task 1.10: GdprComplianceService stub ───────────────────────────────────
function makeGdprServiceStub(): GdprComplianceService {
  return makeServiceStub<GdprComplianceService>({
    recordConsent: jasmine.createSpy('recordConsent').and.returnValue(of({} as GdprConsentRecord)),
    getConsentRecords: jasmine.createSpy('getConsentRecords').and.returnValue(of([])),
  });
}

// ─── Task 1.11: AuditLoggerService stub ──────────────────────────────────────
function makeAuditLoggerServiceStub(): AuditLoggerService {
  return makeServiceStub<AuditLoggerService>({
    logAction: jasmine.createSpy('logAction').and.returnValue(Promise.resolve()),
  });
}

// ─── Helper: configure TestBed with a specific modules stub ─────────────────
// ─── Task 1.12: Replace provideHttpClient() with overrideProvider calls ──────
async function configureTestBed(modulesEnabled: boolean | null): Promise<void> {
  await TestBed.configureTestingModule({
    imports: [FormNewCustomerComponent],
  })
    .overrideProvider(SupabaseModulesService, { useValue: makeModulesServiceStub(modulesEnabled) })
    .overrideProvider(SupabaseCustomersService, { useValue: makeCustomersServiceStub() })
    .overrideProvider(LocalitiesService, { useValue: makeLocalitiesServiceStub() })
    .overrideProvider(AddressesService, { useValue: makeAddressesServiceStub() })
    .overrideProvider(ToastService, { useValue: makeToastServiceStub() })
    .overrideProvider(HoneypotService, { useValue: makeHoneypotServiceStub() })
    .overrideProvider(AuthService, { useValue: makeAuthServiceStub() })
    .overrideProvider(GlobalTagsService, { useValue: makeGlobalTagsServiceStub() })
    .overrideProvider(GdprComplianceService, { useValue: makeGdprServiceStub() })
    .overrideProvider(AuditLoggerService, { useValue: makeAuditLoggerServiceStub() })
    .compileComponents();
}

// ─────────────────────────────────────────────────────────────────────────────

describe('FormNewCustomerComponent', () => {
  // ─── Task 1.13: Update existing tests to use new DI setup ─────────────────

  describe('with module DISABLED (default)', () => {
    let component: FormNewCustomerComponent;
    let fixture: ComponentFixture<FormNewCustomerComponent>;
    let toastService: ToastService;

    beforeEach(async () => {
      await configureTestBed(false);
      fixture = TestBed.createComponent(FormNewCustomerComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      toastService = TestBed.inject(ToastService);
    });

    it('should create', () => {
      expect(component).toBeTruthy();
    });

    describe('historialClinicoEnabled computed signal', () => {
      it('should return false when module is disabled', () => {
        expect(component['historialClinicoEnabled']()).toBeFalse();
      });
    });

    describe('onHealthConsentGranted', () => {
      it('should set healthConsentGranted to true', () => {
        const mockRecord: GdprConsentRecord = {
          subject_email: 'test@test.com',
          consent_type: 'health_data',
          purpose: 'test',
          consent_given: true,
          consent_method: 'form',
        };
        component['onHealthConsentGranted'](mockRecord);
        expect(component['healthConsentGranted']()).toBeTrue();
      });

      it('should sync formData.health_data_consent to true', () => {
        const mockRecord: GdprConsentRecord = {
          subject_email: 'test@test.com',
          consent_type: 'health_data',
          purpose: 'test',
          consent_given: true,
          consent_method: 'form',
        };
        component['onHealthConsentGranted'](mockRecord);
        expect(component['formData'].health_data_consent).toBeTrue();
      });
    });

    describe('onHealthConsentDenied', () => {
      it('should set healthConsentGranted to false', () => {
        // Set it true first
        component['healthConsentGranted'].set(true);
        component['onHealthConsentDenied']();
        expect(component['healthConsentGranted']()).toBeFalse();
      });

      it('should sync formData.health_data_consent to false', () => {
        component['formData'].health_data_consent = true;
        component['onHealthConsentDenied']();
        expect(component['formData'].health_data_consent).toBeFalse();
      });
    });

    describe('saveCustomer() submission guard', () => {
      it('should NOT block submission when module is disabled', () => {
        component['healthConsentGranted'].set(false);

        // Set minimum required form data so the guard doesn't block on missing fields
        component['formData'].name = 'Test';
        component['formData'].email = 'test@example.com';

        component.saveCustomer();

        // Should NOT have been called with the consent-specific message
        const consentCall = (toastService.error as jasmine.Spy).calls
          .all()
          .find((c) => c.args[0] === 'Consentimiento requerido');
        expect(consentCall).toBeUndefined();
      });
    });
  });

  describe('with module NULL (loading state)', () => {
    let component: FormNewCustomerComponent;
    let fixture: ComponentFixture<FormNewCustomerComponent>;
    let toastService: ToastService;

    beforeEach(async () => {
      await configureTestBed(null);
      fixture = TestBed.createComponent(FormNewCustomerComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      toastService = TestBed.inject(ToastService);
    });

    describe('historialClinicoEnabled computed signal', () => {
      it('should return false when module returns null (not loaded)', () => {
        // historialClinicoEnabled does === true comparison, so null → false
        expect(component['historialClinicoEnabled']()).toBeFalse();
      });
    });

    // Task 2.4: isModuleLoading signal returns true when isModuleEnabled returns null
    describe('isModuleLoading computed signal', () => {
      it('should return true when module check is in progress (null state)', () => {
        expect(component['isModuleLoading']()).toBeTrue();
      });
    });

    // Task 2.5: form can submit when module check is null (no consent gate blocking)
    describe('saveCustomer() when module is loading', () => {
      it('should NOT block submission when module check is still loading (null)', () => {
        component['healthConsentGranted'].set(false);

        // Set minimum required form data
        component['formData'].name = 'Test';
        component['formData'].email = 'test@example.com';

        component.saveCustomer();

        // The consent guard only blocks when historialClinicoEnabled() === true
        // With null state, historialClinicoEnabled() returns false → no blocking
        const consentCall = (toastService.error as jasmine.Spy).calls
          .all()
          .find((c) => c.args[0] === 'Consentimiento requerido');
        expect(consentCall).toBeUndefined();
      });
    });
  });

  describe('with module ENABLED', () => {
    let component: FormNewCustomerComponent;
    let fixture: ComponentFixture<FormNewCustomerComponent>;
    let toastService: ToastService;

    beforeEach(async () => {
      await configureTestBed(true);
      fixture = TestBed.createComponent(FormNewCustomerComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      toastService = TestBed.inject(ToastService);
    });

    describe('historialClinicoEnabled computed signal', () => {
      it('should return true when module is enabled', () => {
        expect(component['historialClinicoEnabled']()).toBeTrue();
      });
    });

    describe('saveCustomer() submission guard', () => {
      it('should call toastService.error and return early when module enabled but consent not granted', () => {
        component['healthConsentGranted'].set(false);
        component.saveCustomer();

        expect(toastService.error).toHaveBeenCalledWith(
          'Consentimiento requerido',
          'Debe otorgar el consentimiento para datos de salud antes de guardar.',
        );
      });

      it('should NOT block submission when module enabled and consent granted', () => {
        component['healthConsentGranted'].set(true);
        // Set minimum required form data
        component['formData'].name = 'Test';
        component['formData'].email = 'test@example.com';

        component.saveCustomer();

        const consentCall = (toastService.error as jasmine.Spy).calls
          .all()
          .find((c) => c.args[0] === 'Consentimiento requerido');
        expect(consentCall).toBeUndefined();
      });
    });
  });
});
