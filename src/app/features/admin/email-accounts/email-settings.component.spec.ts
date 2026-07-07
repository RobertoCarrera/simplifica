/**
 * Unit tests for EmailSettingsComponent — PR2b slice (PR3 trimmed: the
 * eye-only `openPreview` flow is gone, replaced by the editor's preview
 * pane).
 *
 * Covers (per design #1877 §9 "EmailSettingsComponent" row):
 *   - emailTypes array has 26 entries (PR1's 20 + 6 system types).
 *   - Pen button is visible for every type, including un-seeded
 *     ones (spec #1876 "All 26 controls present").
 *   - openTemplateEditor calls upsertTemplate when no row exists, then
 *     opens the dialog.
 *   - openTemplateEditor opens the dialog directly when a row exists.
 *   - loadData refreshes accounts and settings.
 *   - trackByEmailType returns the type string (stable across re-renders).
 *
 * The dialog component (`TemplateEditorDialogComponent`) is mocked —
 * PR2b only exercises the wiring glue at the settings-component layer.
 *
 * Test runner: Karma + Jasmine (`npm run test`). Karma is broken
 * pre-existing on main (test-infra issue, NOT PR2b); PR2a apply-progress
 * documented the same constraint. These specs compile under
 * `tsc --noEmit -p tsconfig.app.json`.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideAnimations } from '@angular/platform-browser/animations';
import { Dialog, DialogRef } from '@angular/cdk/dialog';
import { TranslocoService } from '@jsverse/transloco';
import { Observable, Subject, of, throwError } from 'rxjs';

import { EmailSettingsComponent } from './email-settings.component';
import { CompanyEmailService } from '../../../services/company-email.service';
import { CompanyEmailSetting, EmailType } from '../../../models/company-email.models';
import { EMAIL_SAMPLES } from '../../../email-samples';
import { ToastService } from '../../../services/toast.service';

// ---------- Mocks ---------------------------------------------------------

class FakeCompanyEmailService {
  accounts: any[] = [];
  settings: CompanyEmailSetting[] = [];

  // Observable-returning service methods (mirroring real signatures).
  getAccounts = jasmine.createSpy('getAccounts').and.returnValue(of(this.accounts));
  getSettings = jasmine.createSpy('getSettings').and.returnValue(of(this.settings));
  updateSetting = jasmine.createSpy('updateSetting').and.returnValue(of({} as CompanyEmailSetting));
  toggleSetting = jasmine.createSpy('toggleSetting').and.returnValue(of({} as CompanyEmailSetting));
  updateTemplate = jasmine.createSpy('updateTemplate').and.returnValue(of({} as CompanyEmailSetting));

  upsertTemplate = jasmine
    .createSpy('upsertTemplate')
    .and.callFake((companyId: string, type: EmailType) =>
      of({
        id: `seed-${type}`,
        company_id: companyId,
        email_type: type,
        email_account_id: null,
        is_active: true,
        custom_subject_template: '',
        custom_body_template: '',
        custom_header_template: null,
        custom_button_text: null,
      } as unknown as CompanyEmailSetting)
    );

  getSampleFor = jasmine.createSpy('getSampleFor').and.callFake(() => ({}));

  // Helpers to push data into the component without triggering loadData().
  pushAccounts(rows: any[]): void {
    this.accounts = rows;
    this.getAccounts.and.returnValue(of(rows));
  }
  pushSettings(rows: CompanyEmailSetting[]): void {
    this.settings = rows;
    this.getSettings.and.returnValue(of(rows));
  }
}

class FakeToastService {
  success = jasmine.createSpy('success');
  error = jasmine.createSpy('error');
  info = jasmine.createSpy('info');
}

class FakeTranslocoService {
  translate = jasmine.createSpy('translate').and.callFake((key: string) => key);
}

class FakeDialog {
  /** Records every open() call so specs can assert (component, data, width). */
  opens: Array<{ component: unknown; data: unknown; width?: string }> = [];

  /** What `ref.closed` should emit on the next `open()` call. */
  nextResult: unknown = undefined;

  open<T = unknown>(component: unknown, config?: { data?: unknown; width?: string }): DialogRef<T> {
    this.opens.push({ component, data: config?.data, width: config?.width });
    const subject = new Subject<T | undefined>();
    const ref = {
      closed: subject.asObservable() as Observable<T | undefined>,
      close: (result: T | undefined) => subject.next(result),
    } as unknown as DialogRef<T>;
    return ref;
  }
}

// ---------- Helpers -------------------------------------------------------

function makeSetting(type: EmailType, id = `id-${type}`): CompanyEmailSetting {
  return {
    id,
    company_id: 'company-1',
    email_type: type,
    email_account_id: 'account-1',
    is_active: true,
    custom_subject_template: '',
    custom_body_template: '',
    custom_header_template: null,
    custom_button_text: null,
  };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

// ---------- Spec ----------------------------------------------------------

describe('EmailSettingsComponent (PR2b)', () => {
  let fixture: ComponentFixture<EmailSettingsComponent>;
  let component: EmailSettingsComponent;
  let service: FakeCompanyEmailService;
  let toast: FakeToastService;
  let dialog: FakeDialog;

  beforeEach(async () => {
    service = new FakeCompanyEmailService();
    toast = new FakeToastService();
    dialog = new FakeDialog();

    await TestBed.configureTestingModule({
      imports: [EmailSettingsComponent],
      providers: [
        provideAnimations(),
        { provide: CompanyEmailService, useValue: service as any },
        { provide: ToastService, useValue: toast as any },
        { provide: TranslocoService, useValue: new FakeTranslocoService() as any },
        { provide: Dialog, useValue: dialog as any },
      ],
    })
      .compileComponents();

    fixture = TestBed.createComponent(EmailSettingsComponent);
    component = fixture.componentInstance;
    component.companyId = 'company-1';
  });

  it('expands emailTypes to 26 entries (PR1 20 + 6 system types)', () => {
    expect(component.emailTypes().length).toBe(26);
    expect(new Set(component.emailTypes()).size).toBe(26); // no duplicates
    // Sanity: each fixture-matrix key (`EMAIL_SAMPLES`) is present in
    // the rendered list (exhaustiveness check).
    for (const t of Object.keys(EMAIL_SAMPLES)) {
      expect(component.emailTypes()).toContain(t as EmailType);
    }
  });

  it('renders pen button for every type even when no setting exists', async () => {
    // accounts must be non-empty so the table renders (settings is empty).
    service.pushAccounts([{ id: 'a1', email: 'a@x', is_active: true, is_verified: true }]);
    service.pushSettings([]);

    fixture.detectChanges();
    await fixture.whenStable();
    flushMicrotasks();
    fixture.detectChanges();

    const buttons = fixture.nativeElement.querySelectorAll('button[title*="buttons"]');
    // 26 pen action buttons (PR3 removed the eye-only modal — preview is
    // now embedded in the editor dialog).
    expect(buttons.length).toBe(26);
  });

  it('calls upsertTemplate then opens dialog when no row exists', async () => {
    service.pushAccounts([{ id: 'a1', email: 'a@x', is_active: true, is_verified: true }]);
    service.pushSettings([]);

    fixture.detectChanges();
    await fixture.whenStable();
    flushMicrotasks();

    service.upsertTemplate.calls.reset();
    dialog.opens.length = 0;

    await component.openTemplateEditor('invite_owner');

    expect(service.upsertTemplate).toHaveBeenCalledOnceWith(
      'company-1',
      'invite_owner',
      jasmine.objectContaining({ is_active: true, email_account_id: null })
    );
    expect(dialog.opens.length).toBe(1);
    expect(dialog.opens[0].component).toBeDefined();
    expect(dialog.opens[0].data).toEqual(
      jasmine.objectContaining({
        companyId: 'company-1',
        emailType: 'invite_owner',
        setting: jasmine.objectContaining({ id: 'seed-invite_owner' }),
      })
    );
    expect(dialog.opens[0].width).toBe('1100px');
  });

  it('opens dialog directly (no upsert) when a row already exists', async () => {
    service.pushAccounts([{ id: 'a1', email: 'a@x', is_active: true, is_verified: true }]);
    service.pushSettings([makeSetting('consent')]);

    fixture.detectChanges();
    await fixture.whenStable();
    flushMicrotasks();

    service.upsertTemplate.calls.reset();
    dialog.opens.length = 0;

    await component.openTemplateEditor('consent');

    expect(service.upsertTemplate).not.toHaveBeenCalled();
    expect(dialog.opens.length).toBe(1);
    expect(dialog.opens[0].data).toEqual(
      jasmine.objectContaining({
        companyId: 'company-1',
        emailType: 'consent',
        setting: jasmine.objectContaining({ id: 'id-consent' }),
      })
    );
  });

  it('reload success toast + loadData after dialog closes with true', async () => {
    service.pushAccounts([{ id: 'a1', email: 'a@x', is_active: true, is_verified: true }]);
    service.pushSettings([makeSetting('consent')]);

    fixture.detectChanges();
    await fixture.whenStable();
    flushMicrotasks();

    await component.openTemplateEditor('consent');
    expect(dialog.opens.length).toBe(1);

    const initialSettingsCallCount = service.getSettings.calls.count();
    // Emit close(true) on the recorded dialog's subject.
    const ref = dialog.opens[0] as any;
    ref.close(true);

    await flushMicrotasks();
    expect(toast.success).toHaveBeenCalled();
    // loadData invoked → getSettings called again.
    expect(service.getSettings.calls.count()).toBeGreaterThan(initialSettingsCallCount);
  });

  it('reload skipped when dialog closes with false', async () => {
    service.pushAccounts([{ id: 'a1', email: 'a@x', is_active: true, is_verified: true }]);
    service.pushSettings([makeSetting('consent')]);

    fixture.detectChanges();
    await fixture.whenStable();
    flushMicrotasks();

    await component.openTemplateEditor('consent');
    const initialSettingsCallCount = service.getSettings.calls.count();

    const ref = dialog.opens[0] as any;
    ref.close(false);

    await flushMicrotasks();
    expect(toast.success).not.toHaveBeenCalled();
    expect(service.getSettings.calls.count()).toBe(initialSettingsCallCount);
  });

  it('trackByEmailType returns the type for stable re-rendering', () => {
    expect(component.trackByEmailType(0, 'consent')).toBe('consent');
    expect(component.trackByEmailType(99, 'invoice')).toBe('invoice');
  });

  it('upsert failure on first pen click surfaces an error toast and skips dialog', async () => {
    service.pushAccounts([{ id: 'a1', email: 'a@x', is_active: true, is_verified: true }]);
    service.pushSettings([]);
    service.upsertTemplate.and.returnValue(throwError(() => new Error('RLS denied')));

    fixture.detectChanges();
    await fixture.whenStable();
    flushMicrotasks();

    await component.openTemplateEditor('invite_owner');

    expect(toast.error).toHaveBeenCalled();
    expect(dialog.opens.length).toBe(0);
  });

  // ---------------------------------------------------------------------
  // PR2c polish: email-type categorization
  // ---------------------------------------------------------------------

  it('groups every email type into one of the 6 categories', () => {
    const groups = component.categorizedTypes();
    const allGrouped = groups.flatMap((g) => g.types);
    expect(allGrouped.length).toBe(26);
    // Every type appears in exactly one bucket (no duplicates across groups).
    expect(new Set(allGrouped).size).toBe(26);
    // The 6 known categories are present.
    const ids = groups.map((g) => g.category);
    expect(ids).toContain('reservas');
    expect(ids).toContain('facturacion');
    expect(ids).toContain('consentimiento');
    expect(ids).toContain('invitaciones');
    expect(ids).toContain('credenciales');
    expect(ids).toContain('notificaciones');
  });

  it('emits categories in the fixed order (Reservas -> Notificaciones)', () => {
    const groups = component.categorizedTypes();
    const orders = groups.map((g) => g.order);
    const sorted = [...orders].sort((a, b) => a - b);
    expect(orders).toEqual(sorted);
  });

  it('never renders empty category headers', () => {
    const groups = component.categorizedTypes();
    for (const g of groups) {
      expect(g.types.length).toBeGreaterThan(0);
    }
  });

  it('places the 5 booking/waitlist types under Reservas', () => {
    const reservas = component.categorizedTypes().find((g) => g.category === 'reservas');
    expect(reservas).toBeDefined();
    expect(reservas!.types).toContain('booking_confirmation');
    expect(reservas!.types).toContain('booking_reminder');
    expect(reservas!.types).toContain('booking_cancellation');
    expect(reservas!.types).toContain('booking_change');
    expect(reservas!.types).toContain('waitlist');
  });

  it('places invoice, quote and the 3 budget_* types under Facturacion', () => {
    const fact = component.categorizedTypes().find((g) => g.category === 'facturacion');
    expect(fact).toBeDefined();
    expect(fact!.types).toContain('invoice');
    expect(fact!.types).toContain('quote');
    expect(fact!.types).toContain('budget_created');
    expect(fact!.types).toContain('budget_reminder');
    expect(fact!.types).toContain('budget_overdue');
  });

  it('places every invite_* type under Invitaciones (including invite_marketer)', () => {
    const inv = component.categorizedTypes().find((g) => g.category === 'invitaciones');
    expect(inv).toBeDefined();
    expect(inv!.types).toContain('invite');
    expect(inv!.types).toContain('invite_owner');
    expect(inv!.types).toContain('invite_admin');
    expect(inv!.types).toContain('invite_member');
    expect(inv!.types).toContain('invite_professional');
    expect(inv!.types).toContain('invite_agent');
    expect(inv!.types).toContain('invite_marketer');
    expect(inv!.types).toContain('invite_client');
  });

  it('recomputes categorizedTypes when the emailTypes signal changes', () => {
    const before = component.categorizedTypes().map((g) => g.category);
    expect(before).toContain('reservas');

    // Replace the list with a single type that lives in Consentimiento.
    component.emailTypes.set(['consent']);
    const after = component.categorizedTypes().map((g) => g.category);
    expect(after).toEqual(['consentimiento']);
    expect(after).not.toContain('reservas');

    // Restore for downstream specs that depend on the 26-type default.
    component.emailTypes.set([
      'booking_confirmation', 'invoice', 'quote', 'consent', 'invite',
      'invite_owner', 'invite_admin', 'invite_member', 'invite_professional',
      'invite_agent', 'invite_client', 'waitlist', 'inactive_notice', 'generic',
      'booking_reminder', 'booking_cancellation', 'password_reset', 'magic_link',
      'welcome', 'staff_credentials', 'invite_marketer', 'google_review',
      'budget_created', 'budget_reminder', 'budget_overdue', 'booking_change',
    ]);
  });
});