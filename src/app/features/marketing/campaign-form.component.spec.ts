import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, convertToParamMap, ParamMap } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TranslocoTestingModule } from '@jsverse/transloco';

import { CampaignFormComponent } from './campaign-form.component';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { LocalitiesService } from '../../services/localities.service';
import {
  SupabaseMarketingService,
  FilterOptions,
  MarketingClient,
} from '../../services/supabase-marketing.service';

/**
 * Spec for the consent-migration UX fix on campaign-form.component.ts.
 *
 * The bug: the "Contenido" field was hard-required even when the user toggled
 * "Incluir clientes sin consentimiento de marketing", which routes the send
 * through `send-client-consent-invite` (and ignores `form.content`).
 * The Guardar button stayed disabled with empty content.
 *
 * The fix: `contentRequired` is now `computed(() => !includeWithoutConsent())`,
 * so content is only required for normal marketing campaigns. When the toggle is
 * on, a hint is shown explaining the content will be ignored.
 */
describe('CampaignFormComponent — consent-migration content validation', () => {
  let fixture: ComponentFixture<CampaignFormComponent>;
  let comp: CampaignFormComponent;

  // Stub for the marketing service — only the methods used during ngOnInit
  // and save() need real return values; everything else is a jasmine spy.
  const marketingStub = {
    getFilterOptions: () => Promise.resolve({
      localities: [], tiers: [], sources: [], languages: [], tags: [],
    } satisfies FilterOptions),
    getClientsWithConsent: (_search?: string, _filters?: any) =>
      Promise.resolve([] as MarketingClient[]),
    getAllActiveClients: (_search?: string, _filters?: any) =>
      Promise.resolve([] as MarketingClient[]),
    getCampaign: (_id: string) => Promise.resolve(null),
    createCampaign: jasmine.createSpy('createCampaign').and.returnValue(Promise.resolve({ id: 'new' })),
    updateCampaign: jasmine.createSpy('updateCampaign').and.returnValue(Promise.resolve({ id: 'upd' })),
  };

  // ActivatedRoute: no id in URL → create mode
  const paramMap: ParamMap = convertToParamMap({});
  const activatedRouteStub = {
    snapshot: { paramMap },
  };

  // Minimal AuthService stub — component only uses `currentCompanyId()`
  const authStub = {
    currentCompanyId: signal<string | null>('company-1'),
  };

  // Minimal ToastService stub — component calls success/error on save
  const toastStub = {
    success: jasmine.createSpy('success'),
    error: jasmine.createSpy('error'),
  };

  // LocalitiesService isn't touched by the validation path, but it's injected
  // via `inject()` at construction time, so we need to provide it.
  const localitiesStub = {
    // Empty stub — add real methods here if ngOnInit starts calling them.
  };

  async function configureTestBed() {
    TestBed.configureTestingModule({
      imports: [
        CampaignFormComponent,
        RouterTestingModule,
        TranslocoTestingModule.forRoot({
          langs: {
            es: {
              marketing: {
                contentIgnoredHint: 'Este contenido se ignorará en el envío.',
                onboardingEmailCheckbox: 'Incluir sin consentimiento',
                onboardingEmailCheckboxHint: 'Envío informativo inicial RGPD',
                legalWarningTitle: 'Atención',
                legalWarningSubtitle: 'Lea antes de continuar',
                legalWarningIntro: 'Texto intro',
                legalBasisTitle: 'Base legal',
                legalBasis1: 'Base 1',
                legalBasis2: 'Base 2',
                legalBasis3: 'Base 3',
                requirementsTitle: 'Requisitos',
                requirement1: 'R1',
                requirement2: 'R2',
                requirement3: 'R3',
                requirement4: 'R4',
                responsibilityNotice: 'Usted asume la responsabilidad',
                confirmationCheckbox: 'Acepto las implicaciones',
                confirmationTypeLabel: 'Escriba ACEPTO',
                confirmationTypePlaceholder: 'ACEPTO',
                confirmationTypeMismatch: 'Debe escribir ACEPTO',
                confirmationRequired: 'Debe completar la confirmación',
                checkButton: 'Comprobar',
                verifiedBadge: 'Verificado',
                verificationSuccess: 'Verificación correcta',
                audienceLockedHint: 'Lista bloqueada',
                noClientsFound: 'No hay clientes',
                noClientsWithConsent: 'No hay clientes con consentimiento',
                badgeConsentYes: 'Con consentimiento',
                badgeConsentNo: 'Sin consentimiento',
                audience: 'Audiencia',
                selected: 'seleccionados',
                filters: 'Filtros',
                clearFilters: 'Limpiar',
                filterContactData: 'Datos de contacto',
                filterStatus: 'Estado',
                filterClassification: 'Clasificación',
                filterAll: 'Todos',
                filterYes: 'Sí',
                filterNo: 'No',
                filterActive: 'Activo',
                filterInactive: 'Inactivo',
                filterHasEmail: 'Con email',
                filterHasPhone: 'Con teléfono',
                filterHasDni: 'Con DNI',
                filterHasAddress: 'Con dirección',
                filterStatusLabel: 'Estado',
                filterMarketingConsent: 'Consentimiento',
                filterWithConsent: 'Con consentimiento',
                filterWithoutConsent: 'Sin consentimiento',
                filterLocality: 'Localidad',
                filterAgeRange: 'Edad',
                filterAge18_25: '18-25',
                filterAge26_35: '26-35',
                filterAge36_45: '36-45',
                filterAge46_55: '46-55',
                filterAge55plus: '55+',
                filterLanguage: 'Idioma',
                filterClientType: 'Tipo',
                filterIndividual: 'Particular',
                filterBusiness: 'Empresa',
                filterTier: 'Nivel',
                filterSource: 'Origen',
                filterTags: 'Etiquetas',
                filterTagsEmpty: 'Sin etiquetas',
                filterCreatedAfter: 'Desde',
                filterCreatedBefore: 'Hasta',
                filterBirthday: 'Cumpleaños',
                filterNoFilter: 'No aplica',
                filterBirthdayWeek: 'Esta semana',
                filterBirthdayMonth: 'Este mes',
                filterBirthday3months: '3 meses',
                filterActiveResults: 'Resultados',
                filterClientsMatch: 'coinciden',
                common: {
                  loading: 'Cargando',
                  saving: 'Guardando',
                  save: 'Guardar',
                  cancel: 'Cancelar',
                },
              },
            },
          },
          translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        }),
      ],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        { provide: SupabaseMarketingService, useValue: marketingStub },
        { provide: AuthService, useValue: authStub },
        { provide: ToastService, useValue: toastStub },
        { provide: LocalitiesService, useValue: localitiesStub },
        { provide: ActivatedRoute, useValue: activatedRouteStub },
      ],
    });
  }

  beforeEach(async () => {
    marketingStub.createCampaign.calls.reset();
    marketingStub.updateCampaign.calls.reset();
    toastStub.success.calls.reset();
    toastStub.error.calls.reset();
    await configureTestBed();
    fixture = TestBed.createComponent(CampaignFormComponent);
    comp = fixture.componentInstance;
    // ngOnInit awaits filter options and audience; flush microtasks
    comp.ngOnInit();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
  });

  describe('contentRequired computed signal', () => {
    it('should be true when the consent-migration toggle is OFF', () => {
      comp.includeWithoutConsent.set(false);
      expect(comp.contentRequired()).toBeTrue();
    });

    it('should be false when the consent-migration toggle is ON', () => {
      comp.includeWithoutConsent.set(true);
      expect(comp.contentRequired()).toBeFalse();
    });
  });

  describe('Guardar button — disabled binding', () => {
    function saveBtn(): HTMLButtonElement {
      // The first <button> in the sticky top bar is Guardar
      const buttons = fixture.nativeElement.querySelectorAll('button');
      return buttons[0] as HTMLButtonElement;
    }

    it('should be DISABLED when name and content are empty (toggle OFF, regression)', () => {
      comp.form.name = '';
      comp.form.content = '';
      comp.includeWithoutConsent.set(false);
      fixture.detectChanges();
      expect(saveBtn().disabled).toBeTrue();
    });

    it('should be DISABLED when toggle is OFF and content is empty even with name', () => {
      comp.form.name = 'Test campaign';
      comp.form.content = '';
      comp.includeWithoutConsent.set(false);
      fixture.detectChanges();
      expect(saveBtn().disabled).toBeTrue();
    });

    it('should be ENABLED when toggle is OFF and content is filled (regression)', () => {
      comp.form.name = 'Test campaign';
      comp.form.content = '<p>Hello</p>';
      comp.includeWithoutConsent.set(false);
      fixture.detectChanges();
      expect(saveBtn().disabled).toBeFalse();
    });

    it('should be ENABLED when toggle is ON and content is empty (THE BUG FIX)', () => {
      comp.form.name = 'RGPD consent migration';
      comp.form.content = '';
      comp.includeWithoutConsent.set(true);
      // When toggle is ON, legal verification is also required for save
      comp.legalAcknowledged.set(true);
      comp.legalAcceptText.set('ACEPTO');
      comp.legalVerified.set(true);
      fixture.detectChanges();
      expect(saveBtn().disabled).toBeFalse();
    });

    it('should still be DISABLED when toggle is ON and legal verification is incomplete', () => {
      comp.form.name = 'RGPD consent migration';
      comp.form.content = '';
      comp.includeWithoutConsent.set(true);
      comp.legalVerified.set(false);
      fixture.detectChanges();
      expect(saveBtn().disabled).toBeTrue();
    });
  });

  describe('UX hint — contentIgnoredHint', () => {
    it('should NOT show the content-ignored hint when toggle is OFF', () => {
      comp.includeWithoutConsent.set(false);
      fixture.detectChanges();
      const html = (fixture.nativeElement as HTMLElement).innerHTML;
      expect(html).not.toContain('Este contenido se ignorará');
    });

    it('should show the content-ignored hint when toggle is ON', () => {
      comp.includeWithoutConsent.set(true);
      fixture.detectChanges();
      const html = (fixture.nativeElement as HTMLElement).innerHTML;
      expect(html).toContain('Este contenido se ignorará');
    });
  });

  describe('Content label — required marker', () => {
    it('should show the * marker when toggle is OFF (regression)', () => {
      comp.includeWithoutConsent.set(false);
      fixture.detectChanges();
      const html = (fixture.nativeElement as HTMLElement).innerHTML;
      // Find the content label block
      const labelBlock = html.match(/marketing\.content[\s\S]{0,200}/);
      expect(labelBlock).toBeTruthy();
      // The * marker should be wrapped in text-red-500 span via @if (contentRequired())
      expect(html).toContain('text-red-500');
    });
  });

  describe('save() — programmatic validation', () => {
    it('should bail out when name is empty regardless of toggle state', async () => {
      comp.form.name = '';
      comp.form.content = 'Some content';
      comp.includeWithoutConsent.set(true);
      comp.legalVerified.set(true);
      await comp.save();
      expect(marketingStub.createCampaign).not.toHaveBeenCalled();
    });

    it('should bail out when toggle is OFF and content is empty', async () => {
      comp.form.name = 'Test';
      comp.form.content = '';
      comp.includeWithoutConsent.set(false);
      await comp.save();
      expect(marketingStub.createCampaign).not.toHaveBeenCalled();
    });

    it('should call createCampaign when toggle is OFF and content is filled', async () => {
      comp.form.name = 'Test';
      comp.form.content = '<p>Body</p>';
      comp.includeWithoutConsent.set(false);
      await comp.save();
      expect(marketingStub.createCampaign).toHaveBeenCalledTimes(1);
      const payload = marketingStub.createCampaign.calls.mostRecent().args[0];
      expect(payload.content).toBe('<p>Body</p>');
    });

    it('should call createCampaign when toggle is ON and content is empty (THE BUG FIX)', async () => {
      comp.form.name = 'RGPD consent migration';
      comp.form.content = '';
      comp.includeWithoutConsent.set(true);
      comp.legalAcknowledged.set(true);
      comp.legalAcceptText.set('ACEPTO');
      comp.legalVerified.set(true);
      await comp.save();
      expect(marketingStub.createCampaign).toHaveBeenCalledTimes(1);
      const payload = marketingStub.createCampaign.calls.mostRecent().args[0];
      // The payload still includes content: '' — the Edge Function ignores it,
      // but we don't strip it client-side. This matches the prior agent's
      // contract (the consent_invite RPC is responsible for substitution).
      expect(payload.config).toEqual({ is_onboarding_email: true });
    });

    it('should NOT call createCampaign when toggle is ON but legal is not verified', async () => {
      comp.form.name = 'RGPD consent migration';
      comp.form.content = '';
      comp.includeWithoutConsent.set(true);
      comp.legalVerified.set(false);
      await comp.save();
      expect(marketingStub.createCampaign).not.toHaveBeenCalled();
      expect(toastStub.error).toHaveBeenCalled();
    });
  });
});