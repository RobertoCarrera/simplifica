import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';

import { CampaignListComponent } from './campaign-list.component';
import {
  SupabaseMarketingService,
  MarketingCampaign,
  MarketingClient,
} from '../../services/supabase-marketing.service';
import { ToastService } from '../../services/toast.service';

/**
 * Spec for the personalized send-confirmation modal integration on the
 * campaign LIST view (quick-send row action).
 *
 * The previous commit (9954b86b) wired the modal into the detail page but
 * left the list's green paper-plane icon calling a native `confirm()`.
 * These specs lock in the contract that the row now opens the personalized
 * modal instead.
 *
 * Coverage:
 *  - Clicking the green icon fetches the full campaign and opens the modal
 *    (NO native `confirm()` is used).
 *  - The modal's `isConsentMigration` is driven by `campaign.config.is_onboarding_email`.
 *  - Confirming the modal calls `marketingService.sendCampaign` and reloads.
 *  - Cancelling the modal does NOT call `sendCampaign` and does NOT reload.
 *
 * NOTE: this is a TestBed spec. The current `jest.config.cjs` excludes
 * component specs from the `npx jest` run (see the config comment about
 * migrating to jest-preset-angular). This spec documents the contract and
 * will run once the testing setup migration lands.
 */
describe('CampaignListComponent — quick-send confirmation modal', () => {
  let fixture: ComponentFixture<CampaignListComponent>;
  let comp: CampaignListComponent;

  // Marketing service stub. We pre-populate spies with explicit return
  // values per test so the spec body stays focused on assertions.
  const marketingStub = {
    getCampaigns: jasmine
      .createSpy('getCampaigns')
      .and.returnValue(Promise.resolve([] as MarketingCampaign[])),
    getCampaign: jasmine
      .createSpy('getCampaign')
      .and.returnValue(Promise.resolve(null as MarketingCampaign | null)),
    sendCampaign: jasmine
      .createSpy('sendCampaign')
      .and.returnValue(Promise.resolve({ sent: 3, failed: 0 })),
    getClientsWithConsent: jasmine
      .createSpy('getClientsWithConsent')
      .and.returnValue(Promise.resolve([] as MarketingClient[])),
    getAllActiveClients: jasmine
      .createSpy('getAllActiveClients')
      .and.returnValue(Promise.resolve([] as MarketingClient[])),
    deleteCampaign: jasmine
      .createSpy('deleteCampaign')
      .and.returnValue(Promise.resolve()),
  };

  const toastStub = {
    success: jasmine.createSpy('success'),
    error: jasmine.createSpy('error'),
  };

  function makeCampaign(overrides: Partial<MarketingCampaign> = {}): MarketingCampaign {
    return {
      id: 'camp-1',
      company_id: 'company-1',
      name: 'Promo verano',
      type: 'email',
      subject: 'Oferta especial',
      content: '<p>Hola, te tenemos una oferta...</p>',
      target_audience: { client_ids: ['c-1', 'c-2', 'c-3'] },
      status: 'draft',
      scheduled_at: null,
      sent_at: null,
      created_at: '2026-06-01T10:00:00Z',
      created_by: 'user-1',
      trigger_type: 'manual',
      is_active: false,
      config: null,
      ...overrides,
    };
  }

  async function configureTestBed() {
    TestBed.configureTestingModule({
      imports: [
        CampaignListComponent,
        RouterTestingModule,
        TranslocoTestingModule.forRoot({
          langs: {
            es: {
              marketing: {
                allStatus: 'Todos',
                draft: 'Borrador',
                scheduled: 'Programada',
                sent: 'Enviada',
                allTypes: 'Todos los tipos',
                newCampaign: 'Nueva campaña',
                campaignName: 'Nombre',
                type: 'Tipo',
                statusLabel: 'Estado',
                audience: 'Audiencia',
                created: 'Creada',
                actionsLabel: 'Acciones',
                sendNow: 'Enviar ahora',
                noCampaigns: 'No hay campañas',
                createFirst: 'Crear primera',
                status: { draft: 'Borrador', scheduled: 'Programada', sent: 'Enviada' },
                clients: 'clientes',
                onboardingEmailBadge: 'Incluye destinatarios sin consentimiento',
                sendConfirmation: {
                  consentTitle: 'Confirmar envío de solicitud de consentimiento',
                  marketingTitle: 'Confirmar envío de campaña',
                  consentIntro:
                    'Vas a enviar una solicitud de consentimiento RGPD a {{ count }} clientes que aún no te la han dado.',
                  consentOneTimeWarning:
                    'Se enviará UNA SOLA VEZ a cada destinatario. Si un destinatario no responde, su consentimiento quedará como no otorgado y no se le contactará con este fin.',
                  consentInformational:
                    'El email es informativo y permite al destinatario ACEPTAR o RECHAZAR mediante un enlace a una página pública. No contiene contenido comercial.',
                  campaignName: 'Campaña',
                  audienceCount: 'Destinatarios',
                  subject: 'Asunto',
                  contentPreview: 'Vista previa del contenido',
                  summary: 'Resumen',
                  andMore: 'más',
                  cancel: 'Cancelar',
                  consentConfirm: 'Enviar solicitud',
                  marketingConfirm: 'Enviar',
                },
              },
              common: {
                loading: 'Cargando',
                sending: 'Enviando',
                edit: 'Editar',
                delete: 'Eliminar',
                cancel: 'Cancelar',
              },
            },
          },
          translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        }),
      ],
      providers: [
        provideNoopAnimations(),
        { provide: SupabaseMarketingService, useValue: marketingStub },
        { provide: ToastService, useValue: toastStub },
      ],
    });
  }

  function resetStubs() {
    marketingStub.getCampaigns.calls.reset();
    marketingStub.getCampaign.calls.reset();
    marketingStub.getCampaign.calls.reset();
    marketingStub.sendCampaign.calls.reset();
    marketingStub.getClientsWithConsent.calls.reset();
    marketingStub.getAllActiveClients.calls.reset();
    marketingStub.deleteCampaign.calls.reset();
    toastStub.success.calls.reset();
    toastStub.error.calls.reset();
  }

  function quickSendButton(): HTMLButtonElement | null {
    return fixture.nativeElement.querySelector(
      '[data-testid="quick-send-btn"]',
    ) as HTMLButtonElement | null;
  }

  function confirmationModal(): HTMLElement | null {
    return fixture.nativeElement.querySelector(
      '[data-testid="send-confirmation-modal"]',
    );
  }

  async function flush(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  beforeEach(async () => {
    resetStubs();
    await configureTestBed();
    fixture = TestBed.createComponent(CampaignListComponent);
    comp = fixture.componentInstance;
    // Seed the table with one draft campaign so the quick-send button renders.
    marketingStub.getCampaigns.and.returnValue(Promise.resolve([makeCampaign()]));
    comp.ngOnInit();
    await flush();
    fixture.detectChanges();
  });

  it('should NOT call native confirm() — instead opens the personalized modal', async () => {
    const nativeConfirmSpy = spyOn(window, 'confirm');

    const btn = quickSendButton();
    expect(btn).toBeTruthy();
    btn!.click();

    await flush();
    fixture.detectChanges();

    expect(nativeConfirmSpy).not.toHaveBeenCalled();
    expect(comp.showSendModal()).toBeTrue();
    expect(confirmationModal()).toBeTruthy();
  });

  it('should set isConsentMigration=true when campaign.config.is_onboarding_email is true', async () => {
    marketingStub.getCampaign.and.returnValue(
      Promise.resolve(
        makeCampaign({ config: { is_onboarding_email: true } }),
      ),
    );
    marketingStub.getClientsWithConsent.and.returnValue(
      Promise.resolve([
        { id: 'c-1', name: 'Ana', surname: 'López', email: 'a@b.c', phone: '', marketing_consent: false } as MarketingClient,
        { id: 'c-2', name: 'Beto', surname: 'Ruiz', email: 'b@b.c', phone: '', marketing_consent: false } as MarketingClient,
      ]),
    );

    quickSendButton()!.click();
    await flush();
    fixture.detectChanges();

    expect(comp.isConsentMigration()).toBeTrue();
    // The modal title should reflect consent mode.
    const title = fixture.nativeElement.querySelector(
      '[data-testid="send-confirmation-title"]',
    ) as HTMLElement;
    expect(title.textContent).toContain(
      'Confirmar envío de solicitud de consentimiento',
    );
  });

  it('should set isConsentMigration=false when campaign.config.is_onboarding_email is missing', async () => {
    marketingStub.getCampaign.and.returnValue(Promise.resolve(makeCampaign()));

    quickSendButton()!.click();
    await flush();
    fixture.detectChanges();

    expect(comp.isConsentMigration()).toBeFalse();
    const title = fixture.nativeElement.querySelector(
      '[data-testid="send-confirmation-title"]',
    ) as HTMLElement;
    expect(title.textContent).toContain('Confirmar envío de campaña');
  });

  it('should call sendCampaign and reload the list when the modal is confirmed', async () => {
    marketingStub.sendCampaign.and.returnValue(
      Promise.resolve({ sent: 5, failed: 1 }),
    );

    quickSendButton()!.click();
    await flush();
    fixture.detectChanges();

    // Modal is open.
    expect(confirmationModal()).toBeTruthy();

    const confirmBtn = fixture.nativeElement.querySelector(
      '[data-testid="send-confirmation-confirm"]',
    ) as HTMLButtonElement;
    confirmBtn.click();

    await flush();
    fixture.detectChanges();

    expect(marketingStub.sendCampaign).toHaveBeenCalledTimes(1);
    expect(marketingStub.sendCampaign).toHaveBeenCalledWith('camp-1');
    // Modal closes and the list is reloaded.
    expect(comp.showSendModal()).toBeFalse();
    // getCampaigns should have been called again (initial ngOnInit + reload after send).
    expect(marketingStub.getCampaigns).toHaveBeenCalledTimes(2);
    expect(toastStub.success).toHaveBeenCalled();
  });

  it('should NOT call sendCampaign when the modal is cancelled', async () => {
    quickSendButton()!.click();
    await flush();
    fixture.detectChanges();

    const cancelBtn = fixture.nativeElement.querySelector(
      '[data-testid="send-confirmation-cancel"]',
    ) as HTMLButtonElement;
    cancelBtn.click();

    await flush();
    fixture.detectChanges();

    expect(marketingStub.sendCampaign).not.toHaveBeenCalled();
    expect(comp.showSendModal()).toBeFalse();
    // No extra reload — only the initial ngOnInit load should have fired.
    expect(marketingStub.getCampaigns).toHaveBeenCalledTimes(1);
    expect(toastStub.success).not.toHaveBeenCalled();
  });

  it('should NOT call sendCampaign when the modal is dismissed via the close button', async () => {
    quickSendButton()!.click();
    await flush();
    fixture.detectChanges();

    const closeBtn = fixture.nativeElement.querySelector(
      '[data-testid="send-confirmation-close"]',
    ) as HTMLButtonElement;
    closeBtn.click();

    await flush();
    fixture.detectChanges();

    expect(marketingStub.sendCampaign).not.toHaveBeenCalled();
    expect(comp.showSendModal()).toBeFalse();
  });

  it('should surface a toast error when the getCampaign call fails', async () => {
    marketingStub.getCampaign.and.returnValue(
      Promise.reject(new Error('Network down')),
    );

    quickSendButton()!.click();
    await flush();
    fixture.detectChanges();

    expect(comp.showSendModal()).toBeFalse();
    expect(toastStub.error).toHaveBeenCalledWith('Error', 'Network down');
    expect(marketingStub.sendCampaign).not.toHaveBeenCalled();
  });

  it('should surface a toast error when sendCampaign fails', async () => {
    marketingStub.sendCampaign.and.returnValue(
      Promise.reject(new Error('SES rejected')),
    );

    quickSendButton()!.click();
    await flush();
    fixture.detectChanges();

    const confirmBtn = fixture.nativeElement.querySelector(
      '[data-testid="send-confirmation-confirm"]',
    ) as HTMLButtonElement;
    confirmBtn.click();

    await flush();
    fixture.detectChanges();

    expect(marketingStub.sendCampaign).toHaveBeenCalledTimes(1);
    expect(toastStub.error).toHaveBeenCalledWith('Error', 'SES rejected');
  });
});
