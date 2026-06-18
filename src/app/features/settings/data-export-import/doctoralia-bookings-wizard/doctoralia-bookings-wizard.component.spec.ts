import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DoctoraliaBookingsWizardComponent } from './doctoralia-bookings-wizard.component';
import { DoctoraliaBookingsImportService, ResolvedDoctoraliaRow } from '../../../../services/doctoralia-bookings-import.service';
import { AuthService } from '../../../../services/auth.service';
import { ToastService } from '../../../../services/toast.service';
import { of } from 'rxjs';

describe('DoctoraliaBookingsWizardComponent', () => {
  let component: DoctoraliaBookingsWizardComponent;
  let fixture: ComponentFixture<DoctoraliaBookingsWizardComponent>;
  let importServiceSpy: jasmine.SpyObj<DoctoraliaBookingsImportService>;

  const mockResolved: ResolvedDoctoraliaRow[] = [
    {
      rowIndex: 1, patientId: '1', firstName: 'Marc', lastName: 'Escoda',
      eventId: 'evt-1', agenda: 'Turrens, Sandra', serviceName: 'Primera visita Psicología',
      startTime: '2025-06-04T10:30:00Z', endTime: '2025-06-04T11:30:00Z',
      appointmentStatus: 'Scheduled', comments: '', recurrencyType: '', tz: 'Europe/Madrid',
      status: 'matched', clientId: 'c-1', clientCandidates: [{ id: 'c-1', label: 'Marc Escoda' }],
      professionalId: 'p-1', professionalCandidates: [{ id: 'p-1', label: 'Sandra Turrens' }],
      serviceId: 's-1', serviceCandidates: [{ id: 's-1', label: 'Primera visita' }],
    },
  ];

  beforeEach(async () => {
    importServiceSpy = jasmine.createSpyObj('DoctoraliaBookingsImportService', [
      'resolveRows', 'importChunk', 'applyTimezone', 'buildFailureReport',
    ]);
    importServiceSpy.applyTimezone.and.callFake((s: string, _tz: string) =>
      s ? new Date(s.replace(' ', 'T') + ':00Z').toISOString() : '1970-01-01T00:00:00Z',
    );

    // Clean sessionStorage between tests
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem('mfa_stepup_doctoralia_import');
    }

    await TestBed.configureTestingModule({
      imports: [DoctoraliaBookingsWizardComponent],
      providers: [
        { provide: DoctoraliaBookingsImportService, useValue: importServiceSpy },
        { provide: AuthService, useValue: { companyId: () => 'company-1', userProfile: { id: 'u-1' } } },
        { provide: ToastService, useValue: jasmine.createSpyObj('ToastService', ['error', 'success', 'info']) },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DoctoraliaBookingsWizardComponent);
    component = fixture.componentInstance;
    component.csvHeaders = [
      'patientId', 'first name', 'last name', 'agenda', 'service',
      'start time', 'end time', 'created', 'lastmodified', 'comments',
      'appointment status', 'recurrency type', 'schedule id', 'eventId',
    ];
    component.csvRows = [
      ['1', 'Marc', 'Escoda', 'Turrens, Sandra', 'Primera visita Psicología',
       '2025-06-04 12:30', '2025-06-04 13:30', '', '', '',
       'Scheduled', '', '142326', 'evt-1'],
    ];
  });

  it('starts at mfa-gate when no MFA flag is set', () => {
    component.ngOnInit();
    expect(component.step()).toBe('mfa-gate');
  });

  it('skips the MFA gate when the sessionStorage flag is valid', () => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('mfa_stepup_doctoralia_import', Date.now().toString());
    }
    component.ngOnInit();
    expect(component.step()).toBe('date-filter');
  });

  it('acknowledges the MFA gate and sets the flag', () => {
    component.ngOnInit();
    component.onMfaAcknowledge();
    expect(component.step()).toBe('date-filter');
    if (typeof window !== 'undefined') {
      expect(window.sessionStorage.getItem('mfa_stepup_doctoralia_import')).toBeTruthy();
    }
  });

  it('imports directly when all rows are matched (no resolution needed)', async () => {
    importServiceSpy.resolveRows.and.returnValue(Promise.resolve(mockResolved));
    importServiceSpy.importChunk.and.returnValue(of({
      results: mockResolved.map((r) => ({ rowIndex: r.rowIndex, ok: true, deduped: false })),
      notesImported: 0, notesDropped: 0,
    }));

    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('mfa_stepup_doctoralia_import', Date.now().toString());
    }
    component.ngOnInit();
    component.onDateFilterContinue();
    // Manually drive mapping → resolve → import
    component.onMappingConfirmed({
      mappings: component.csvHeaders.map((h, i) => ({
        csvHeader: h,
        targetField: h, // 1:1 mapping
      })),
    } as any);

    // resolveRows is async; wait one tick
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(component.step()).toBe('summary');
  });
});
