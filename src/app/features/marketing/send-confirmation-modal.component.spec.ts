import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { TranslocoTestingModule } from '@jsverse/transloco';

import { SendConfirmationModalComponent } from './send-confirmation-modal.component';

/**
 * Spec for the personalized send-confirmation modal.
 *
 * Coverage:
 *  - Renders the RGPD consent-migration title when `isConsentMigration=true`.
 *  - Renders the marketing campaign title when `isConsentMigration=false`.
 *  - Shows the "Enviar solicitud" button text in consent mode.
 *  - Shows the "Enviar" button text in marketing mode.
 *  - Emits `confirmed` when the primary button is clicked.
 *  - Shows first 5 names plus a "+N más" line when `audienceCount` exceeds
 *    the length of `audienceNames`.
 *
 * NOTE: this is a TestBed spec. The current `jest.config.cjs` excludes
 * component specs from the `npx jest` run (see the config comment about
 * migrating to jest-preset-angular). This spec documents the contract and
 * will run once the testing setup migration lands.
 */
describe('SendConfirmationModalComponent', () => {
  let fixture: ComponentFixture<SendConfirmationModalComponent>;
  let comp: SendConfirmationModalComponent;

  async function createModal(
    overrides: Partial<{
      campaignName: string;
      audienceCount: number;
      audienceNames: string[];
      isConsentMigration: boolean;
      subject: string;
      contentPreview: string;
      contentPreviewWasTruncated: boolean;
    }> = {},
  ) {
    const defaults = {
      campaignName: 'Campaña de prueba',
      audienceCount: 0,
      audienceNames: [] as string[],
      isConsentMigration: false,
      subject: '',
      contentPreview: '',
      contentPreviewWasTruncated: false,
    };
    const cfg = { ...defaults, ...overrides };

    TestBed.configureTestingModule({
      imports: [
        SendConfirmationModalComponent,
        TranslocoTestingModule.forRoot({
          langs: {
            es: {
              marketing: {
                clients: 'clientes',
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
              common: { cancel: 'Cancelar' },
            },
          },
          translocoConfig: { availableLangs: ['es'], defaultLang: 'es' },
        }),
      ],
      providers: [provideNoopAnimations()],
    });

    fixture = TestBed.createComponent(SendConfirmationModalComponent);
    comp = fixture.componentInstance;

    // Apply inputs via Angular's signal-input `setInput` API.
    fixture.componentRef.setInput('campaignName', cfg.campaignName);
    fixture.componentRef.setInput('audienceCount', cfg.audienceCount);
    fixture.componentRef.setInput('audienceNames', cfg.audienceNames);
    fixture.componentRef.setInput('isConsentMigration', cfg.isConsentMigration);
    if (cfg.subject) {
      fixture.componentRef.setInput('subject', cfg.subject);
    }
    if (cfg.contentPreview) {
      fixture.componentRef.setInput('contentPreview', cfg.contentPreview);
    }
    fixture.componentRef.setInput(
      'contentPreviewWasTruncated',
      cfg.contentPreviewWasTruncated,
    );
    fixture.detectChanges();

    return { fixture, comp };
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('should render the consent-migration title when isConsentMigration=true', async () => {
    await createModal({ isConsentMigration: true });
    const title = fixture.nativeElement.querySelector(
      '[data-testid="send-confirmation-title"]',
    ) as HTMLElement;
    expect(title.textContent).toContain(
      'Confirmar envío de solicitud de consentimiento',
    );
  });

  it('should render the marketing title when isConsentMigration=false', async () => {
    await createModal({ isConsentMigration: false });
    const title = fixture.nativeElement.querySelector(
      '[data-testid="send-confirmation-title"]',
    ) as HTMLElement;
    expect(title.textContent).toContain('Confirmar envío de campaña');
  });

  it('should show "Enviar solicitud" on the confirm button in consent mode', async () => {
    await createModal({ isConsentMigration: true });
    const btn = fixture.nativeElement.querySelector(
      '[data-testid="send-confirmation-confirm"]',
    ) as HTMLButtonElement;
    expect(btn.textContent).toContain('Enviar solicitud');
    // The marketing label should NOT appear.
    expect(btn.textContent.trim()).not.toBe('Enviar');
  });

  it('should show "Enviar" on the confirm button in marketing mode', async () => {
    await createModal({ isConsentMigration: false });
    const btn = fixture.nativeElement.querySelector(
      '[data-testid="send-confirmation-confirm"]',
    ) as HTMLButtonElement;
    expect(btn.textContent).toContain('Enviar');
    expect(btn.textContent).not.toContain('Enviar solicitud');
  });

  it('should emit `confirmed` when the primary button is clicked', async () => {
    await createModal({ isConsentMigration: true });
    const spy = jasmine.createSpy('confirmed');
    comp.confirmed.subscribe(spy);

    const btn = fixture.nativeElement.querySelector(
      '[data-testid="send-confirmation-confirm"]',
    ) as HTMLButtonElement;
    btn.click();

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('should render the first 5 names plus a "+N más" line when there are more than 5 recipients', async () => {
    await createModal({
      isConsentMigration: false,
      audienceCount: 12,
      audienceNames: [
        'Ana López',
        'Berta Martínez',
        'Carlos Núñez',
        'Diana Pérez',
        'Eduardo Ruiz',
      ],
    });

    const list = fixture.nativeElement.querySelector(
      '[data-testid="send-confirmation-recipient-list"]',
    ) as HTMLElement;
    const items = list.querySelectorAll('li');

    // 5 names + the "+N más" line.
    expect(items.length).toBe(6);
    expect(items[0].textContent).toContain('Ana López');
    expect(items[4].textContent).toContain('Eduardo Ruiz');
    expect(items[5].textContent.trim()).toContain('+7');
    expect(items[5].textContent).toContain('más');
  });

  it('should NOT render a "+N más" line when the audience fits within the first 5 names', async () => {
    await createModal({
      isConsentMigration: true,
      audienceCount: 3,
      audienceNames: ['Ana López', 'Berta Martínez', 'Carlos Núñez'],
    });

    const list = fixture.nativeElement.querySelector(
      '[data-testid="send-confirmation-recipient-list"]',
    ) as HTMLElement;
    const items = list.querySelectorAll('li');

    expect(items.length).toBe(3);
    // No "+" overflow marker.
    const overflow = Array.from(items).find((li) =>
      li.textContent.includes('+'),
    );
    expect(overflow).toBeUndefined();
  });

  it('should emit `cancelled` when the close button is clicked', async () => {
    await createModal({ isConsentMigration: false });
    const spy = jasmine.createSpy('cancelled');
    comp.cancelled.subscribe(spy);

    const btn = fixture.nativeElement.querySelector(
      '[data-testid="send-confirmation-close"]',
    ) as HTMLButtonElement;
    btn.click();

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('should emit `cancelled` when the cancel footer button is clicked', async () => {
    await createModal({ isConsentMigration: false });
    const spy = jasmine.createSpy('cancelled');
    comp.cancelled.subscribe(spy);

    const btn = fixture.nativeElement.querySelector(
      '[data-testid="send-confirmation-cancel"]',
    ) as HTMLButtonElement;
    btn.click();

    expect(spy).toHaveBeenCalledTimes(1);
  });
});