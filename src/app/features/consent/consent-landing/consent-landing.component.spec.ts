import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, convertToParamMap, ParamMap } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { TranslocoTestingModule } from '@jsverse/transloco';

import { ConsentLandingComponent } from './consent-landing.component';
import { SupabaseClientService } from '../../../services/supabase-client.service';

interface FakeRpc {
  rpc: jasmine.Spy;
}

function makeServiceStub(opts: {
  getRequestResponse?: any;
  getRequestError?: any;
  processConsentResponse?: any;
  processConsentError?: any;
} = {}): SupabaseClientService & FakeRpc {
  const getSpy = jasmine
    .createSpy('getClientConsentRequest')
    .and.returnValue(
      opts.getRequestError
        ? throwError(() => opts.getRequestError)
        : Promise.resolve({ data: opts.getRequestResponse ?? null, error: null }),
    );

  const processSpy = jasmine
    .createSpy('processClientConsent')
    .and.returnValue(
      opts.processConsentError
        ? throwError(() => opts.processConsentError)
        : Promise.resolve({ data: opts.processConsentResponse ?? { success: true }, error: null }),
    );

  // SupabaseClientService.instance returns a SupabaseClient; we expose a
  // minimal object with the two RPC methods the component uses.
  const fakeClient: any = {
    rpc: (name: string, params: any) => {
      if (name === 'get_client_consent_request') return getSpy(params);
      if (name === 'process_client_consent') return processSpy(params);
      return Promise.resolve({ data: null, error: null });
    },
  };

  return makeStub<SupabaseClientService & FakeRpc>({ instance: fakeClient, rpc: getSpy });
}

function makeStub<T>(methods: Partial<T>): T {
  return methods as unknown as T;
}

function configureTestBed(opts: Parameters<typeof makeServiceStub>[0] = {}, token: string | null = 'abc') {
  const paramMap: ParamMap = token
    ? convertToParamMap({ token })
    : convertToParamMap({});

  const activatedRouteStub = {
    snapshot: { queryParamMap: paramMap },
  };

  TestBed.configureTestingModule({
    imports: [
      ConsentLandingComponent,
      RouterTestingModule,
      TranslocoTestingModule.forRoot({
        langs: { es: { consentLanding: {
          headerEyebrow: 'Consentimiento RGPD',
          acceptButton: 'Aceptar',
          rejectButton: 'Rechazar',
          invalidTokenTitle: 'Enlace inválido',
          alreadyCompletedTitle: 'Ya respondido',
          thanksTitle: 'Gracias',
        } } },
        translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
      }),
    ],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideNoopAnimations(),
      { provide: SupabaseClientService, useValue: makeServiceStub(opts) },
      { provide: ActivatedRoute, useValue: activatedRouteStub },
    ],
  });
}

describe('ConsentLandingComponent', () => {
  describe('routing & token handling', () => {
    it('should show the invalid-token screen when no token is present', async () => {
      configureTestBed({}, null);
      const fixture = TestBed.createComponent(ConsentLandingComponent);
      const comp = fixture.componentInstance;
      comp.ngOnInit();
      // Resolve microtasks
      await Promise.resolve();
      await Promise.resolve();
      fixture.detectChanges();
      expect(comp.invalidToken()).toBeTrue();
    });

    it('should show the invalid-token screen when the token does not exist', async () => {
      configureTestBed(
        { getRequestResponse: { success: false, error: 'Token not found' } },
        'does-not-exist',
      );
      const fixture = TestBed.createComponent(ConsentLandingComponent);
      const comp = fixture.componentInstance;
      comp.ngOnInit();
      await Promise.resolve();
      await Promise.resolve();
      fixture.detectChanges();
      expect(comp.invalidToken()).toBeTrue();
    });

    it('should show the already-completed screen when invitation_status is completed', async () => {
      configureTestBed(
        {
          getRequestResponse: {
            success: true,
            client_id: 'c1',
            client_name: 'María',
            subject_email: 'maria@example.com',
            company_id: 'co1',
            company_name: 'ACME',
            company_nif: 'B12345678',
            invitation_status: 'completed',
            consent_status: 'accepted',
            privacy_policy_url: '/privacy/co1',
          },
        },
        'ok-token',
      );
      const fixture = TestBed.createComponent(ConsentLandingComponent);
      const comp = fixture.componentInstance;
      comp.ngOnInit();
      await Promise.resolve();
      await Promise.resolve();
      fixture.detectChanges();
      expect(comp.alreadyCompleted()).toBeTrue();
      expect(comp.invalidToken()).toBeFalse();
    });
  });

  describe('main UI', () => {
    let fixture: ComponentFixture<ConsentLandingComponent>;
    let comp: ConsentLandingComponent;

    beforeEach(async () => {
      configureTestBed(
        {
          getRequestResponse: {
            success: true,
            client_id: 'c1',
            client_name: 'María',
            subject_email: 'maria@example.com',
            company_id: 'co1',
            company_name: 'ACME',
            company_nif: 'B12345678',
            invitation_status: 'sent',
            consent_status: 'pending',
            privacy_policy_url: '/privacy/co1',
          },
        },
        'ok-token',
      );
      fixture = TestBed.createComponent(ConsentLandingComponent);
      comp = fixture.componentInstance;
      comp.ngOnInit();
      await Promise.resolve();
      await Promise.resolve();
      fixture.detectChanges();
    });

    it('should render the consent UI on a valid pending token', () => {
      expect(comp.invalidToken()).toBeFalse();
      expect(comp.alreadyCompleted()).toBeFalse();
      expect(comp.requestData()?.company_name).toBe('ACME');
    });

    it('should render BOTH Accept and Reject buttons with data-testid', () => {
      const acceptEl = fixture.nativeElement.querySelector('[data-testid="accept-btn"]');
      const rejectEl = fixture.nativeElement.querySelector('[data-testid="reject-btn"]');
      expect(acceptEl).toBeTruthy();
      expect(rejectEl).toBeTruthy();
      // Equal visibility: same width via the grid (col-span-1 on each)
      const aRect = acceptEl.getBoundingClientRect();
      const rRect = rejectEl.getBoundingClientRect();
      // Both buttons share the same computed width because of grid placement.
      // We allow a 1px tolerance for subpixel rendering.
      expect(Math.abs(aRect.width - rRect.width)).toBeLessThan(2);
    });
  });

  describe('submitting accept', () => {
    let fixture: ComponentFixture<ConsentLandingComponent>;
    let comp: ConsentLandingComponent;
    let serviceStub: any;

    beforeEach(async () => {
      configureTestBed(
        {
          getRequestResponse: {
            success: true,
            client_id: 'c1',
            client_name: 'María',
            company_name: 'ACME',
            invitation_status: 'sent',
            consent_status: 'pending',
            privacy_policy_url: '/privacy/co1',
          },
        },
        'ok-token',
      );
      fixture = TestBed.createComponent(ConsentLandingComponent);
      comp = fixture.componentInstance;
      serviceStub = TestBed.inject(SupabaseClientService) as any;
      comp.ngOnInit();
      await Promise.resolve();
      await Promise.resolve();
      fixture.detectChanges();
    });

    it('should call process_client_consent with consent_migration_accept + UA + IP on accept', async () => {
      await comp.submit(true);
      // process RPC was called once
      const calls = serviceStub.instance.rpc.calls.allArgs();
      const processCall = calls.find((c: any[]) => c[0] === 'process_client_consent');
      expect(processCall).toBeTruthy();
      const params = processCall[1];
      expect(params.p_token).toBe('ok-token');
      expect(params.p_marketing_consent).toBeTrue();
      expect(params.p_consent_method).toBe('consent_migration_accept');
      expect(typeof params.p_user_agent).toBe('string');
      // IP is either 'browser-unknown' (no network in jsdom) or a real IP
      expect(typeof params.p_ip).toBe('string');
    });

    it('should call process_client_consent with consent_migration_reject on reject', async () => {
      await comp.submit(false);
      const calls = serviceStub.instance.rpc.calls.allArgs();
      const processCall = calls.find((c: any[]) => c[0] === 'process_client_consent');
      expect(processCall).toBeTruthy();
      const params = processCall[1];
      expect(params.p_marketing_consent).toBeFalse();
      expect(params.p_consent_method).toBe('consent_migration_reject');
    });

    it('should show confirmation after a successful submit', async () => {
      await comp.submit(true);
      expect(comp.submitted()).toBeTrue();
    });

    it('should show an error message when the RPC returns success: false', async () => {
      // Override the process RPC for this single test
      const originalInstance = serviceStub.instance;
      (serviceStub as any).instance = {
        rpc: (name: string, params: any) => {
          if (name === 'process_client_consent') {
            return Promise.resolve({ data: { success: false, error: 'Token revoked' }, error: null });
          }
          return originalInstance.rpc(name, params);
        },
      };
      await comp.submit(true);
      expect(comp.submitted()).toBeFalse();
      expect(comp.submitError()).toContain('Token revoked');
    });
  });
});
