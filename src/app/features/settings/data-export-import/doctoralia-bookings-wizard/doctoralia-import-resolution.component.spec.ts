import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { DoctoraliaImportResolutionComponent } from './doctoralia-import-resolution.component';
import { DoctoraliaBookingsImportService, ResolvedDoctoraliaRow } from '../../../../services/doctoralia-bookings-import.service';
import { AuthService } from '../../../../services/auth.service';
import { ToastService } from '../../../../services/toast.service';
import { of } from 'rxjs';

describe('DoctoraliaImportResolutionComponent', () => {
  let component: DoctoraliaImportResolutionComponent;
  let fixture: ComponentFixture<DoctoraliaImportResolutionComponent>;
  let importServiceSpy: jasmine.SpyObj<DoctoraliaBookingsImportService>;
  let toastSpy: jasmine.SpyObj<ToastService>;

  const mockRows: ResolvedDoctoraliaRow[] = [
    {
      rowIndex: 1, patientId: '23993847', firstName: 'Marc', lastName: 'Escoda Salat',
      eventId: '55674881', agenda: 'Turrens, Sandra', serviceName: 'Primera visita Psicología',
      startTime: '2025-06-04T10:30:00Z', endTime: '2025-06-04T11:30:00Z',
      appointmentStatus: 'Scheduled', comments: '', recurrencyType: '', tz: 'Europe/Madrid',
      status: 'matched', clientId: 'c-1', clientCandidates: [{ id: 'c-1', label: 'Marc Escoda' }],
      professionalId: 'p-1', professionalCandidates: [{ id: 'p-1', label: 'Sandra Turrens' }],
      serviceId: 's-1', serviceCandidates: [{ id: 's-1', label: 'Primera visita Psicología' }],
    },
    {
      rowIndex: 2, patientId: '23999999', firstName: 'Test', lastName: 'Ambiguous',
      eventId: 'evt-2', agenda: 'Turrens, Sandra', serviceName: 'Servicio X',
      startTime: '2025-06-04T11:00:00Z', endTime: '2025-06-04T12:00:00Z',
      appointmentStatus: 'Scheduled', comments: '', recurrencyType: '', tz: 'Europe/Madrid',
      status: 'ambiguous', clientId: null,
      clientCandidates: [{ id: 'c-2', label: 'Test Ambiguous #1' }, { id: 'c-3', label: 'Test Ambiguous #2' }],
      professionalId: 'p-1', professionalCandidates: [{ id: 'p-1', label: 'Sandra Turrens' }],
      serviceId: 's-1', serviceCandidates: [{ id: 's-1', label: 'Servicio X' }],
    },
    {
      rowIndex: 3, patientId: '99999999', firstName: 'Test', lastName: 'Unresolved',
      eventId: 'evt-3', agenda: 'Profesional Nuevo', serviceName: 'Servicio Nuevo',
      startTime: '2025-06-04T13:00:00Z', endTime: '2025-06-04T14:00:00Z',
      appointmentStatus: 'Scheduled', comments: '', recurrencyType: '', tz: 'Europe/Madrid',
      status: 'unresolved', clientId: null, clientCandidates: [],
      professionalId: null, professionalCandidates: [],
      serviceId: null, serviceCandidates: [],
    },
  ];

  beforeEach(async () => {
    importServiceSpy = jasmine.createSpyObj('DoctoraliaBookingsImportService', [
      'createServiceOnTheFly', 'createClientOnTheFly',
      'fetchClientsForLink', 'fetchProfessionalsForLink', 'fetchServicesForLink',
    ]);
    // Default stub: empty arrays so any picker call resolves to "no results".
    importServiceSpy.fetchClientsForLink.and.returnValue(Promise.resolve([]));
    importServiceSpy.fetchProfessionalsForLink.and.returnValue(Promise.resolve([]));
    importServiceSpy.fetchServicesForLink.and.returnValue(Promise.resolve([]));
    toastSpy = jasmine.createSpyObj('ToastService', ['error', 'success', 'info']);

    await TestBed.configureTestingModule({
      imports: [DoctoraliaImportResolutionComponent, TranslocoTestingModule.forRoot({})],
      providers: [
        { provide: DoctoraliaBookingsImportService, useValue: importServiceSpy },
        { provide: AuthService, useValue: { companyId: () => 'company-1' } },
        { provide: ToastService, useValue: toastSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DoctoraliaImportResolutionComponent);
    component = fixture.componentInstance;
    component.rows = mockRows;
    fixture.detectChanges();
  });

  it('shows the count of matched/ambiguous/unresolved rows', () => {
    expect(component.countMatched).toBe(1);
    expect(component.countAmbiguous).toBe(1);
    expect(component.countUnresolved).toBe(1);
  });

  it('blocks confirm while any row is ambiguous or unresolved', () => {
    spyOn(component.confirmed, 'emit');
    component.onConfirm();
    expect(component.confirmed.emit).not.toHaveBeenCalled();
    expect(toastSpy.error).toHaveBeenCalled();
  });

  it('skips a row, allowing confirm to proceed', () => {
    spyOn(component.confirmed, 'emit');
    const unresolvedRow = component._rows()[2];
    component.skipRow(unresolvedRow);
    component.onConfirm();
    expect(toastSpy.error).not.toHaveBeenCalled();
    expect(component.confirmed.emit).toHaveBeenCalled();
  });

  it('picks a client candidate for an ambiguous row', () => {
    const ambigRow = component._rows()[1];
    component.pickClient(ambigRow, 'c-2');
    const updated = component._rows()[1];
    expect(updated.clientId).toBe('c-2');
  });

  it('creates a service on the fly and resolves the row', () => {
    importServiceSpy.createServiceOnTheFly.and.returnValue(of({ id: 's-new' }));
    const unresolvedRow = component._rows()[2];
    component.openCreateService(unresolvedRow);
    component.newServiceName.set('Servicio Nuevo');
    component.confirmCreateService();
    const updated = component._rows()[2];
    expect(updated.serviceId).toBe('s-new');
    expect(importServiceSpy.createServiceOnTheFly).toHaveBeenCalledWith('company-1', 'Servicio Nuevo');
  });

  // ── Broadcast feature (round 4) ─────────────────────────────────

  it('counts service duplicates excluding already-matched rows', () => {
    // Row 1 is matched with service "Primera visita Psicología"
    // Row 2 has serviceName "Servicio X" (ambiguous)
    // Row 3 has serviceName "Servicio Nuevo" (unresolved)
    // So duplicating by "Servicio X" should be 0 (no other row has it).
    // For a hypothetical "Servicio X" the count from row 2 should be 0.
    expect(component.countServiceDuplicates('Servicio X', 2)).toBe(0);
    // "Servicio Nuevo" — no other row has it, so 0.
    expect(component.countServiceDuplicates('Servicio Nuevo', 3)).toBe(0);
  });

  it('broadcast: pickFromLinkPicker for service applies the same CRM id to all other rows sharing the csvServiceName', () => {
    // Build a 3-row dataset where 2 rows share the same csvServiceName and are unresolved.
    component.rows = [
      {
        rowIndex: 1, patientId: null, firstName: 'A', lastName: 'A',
        eventId: 'e1', agenda: 'Sandra Turrens', serviceName: 'Duda X',
        startTime: null, endTime: null, appointmentStatus: 'Scheduled',
        comments: '', recurrencyType: '', tz: 'Europe/Madrid',
        status: 'unresolved', clientId: null, clientCandidates: [],
        professionalId: null, professionalCandidates: [],
        serviceId: null, serviceCandidates: [],
      },
      {
        rowIndex: 2, patientId: null, firstName: 'B', lastName: 'B',
        eventId: 'e2', agenda: 'Sandra Turrens', serviceName: 'Duda X',
        startTime: null, endTime: null, appointmentStatus: 'Scheduled',
        comments: '', recurrencyType: '', tz: 'Europe/Madrid',
        status: 'unresolved', clientId: null, clientCandidates: [],
        professionalId: null, professionalCandidates: [],
        serviceId: null, serviceCandidates: [],
      },
      {
        rowIndex: 3, patientId: null, firstName: 'C', lastName: 'C',
        eventId: 'e3', agenda: 'Otro', serviceName: 'Otro Servicio',
        startTime: null, endTime: null, appointmentStatus: 'Scheduled',
        comments: '', recurrencyType: '', tz: 'Europe/Madrid',
        status: 'unresolved', clientId: null, clientCandidates: [],
        professionalId: null, professionalCandidates: [],
        serviceId: null, serviceCandidates: [],
      },
    ];
    // Open the picker for row 1 and enable broadcast.
    component.linkPicker.set({ rowIndex: 1, section: 'service', loading: false, query: '', items: [] });
    component.linkPickerBroadcast.set(true);

    // Pick the service from the picker.
    component.pickFromLinkPicker({ id: 's-X', label: 'Servicio X CRM' });

    // Row 1 (the source) gets it.
    expect(component._rows()[0].serviceId).toBe('s-X');
    // Row 2 (same csvServiceName, unresolved) gets it too. The section is
    // now matched but the row's overall status is still 'unresolved' because
    // client + professional are still missing in this fixture.
    expect(component._rows()[1].serviceId).toBe('s-X');
    expect(component._rows()[1].status).toBe('unresolved');
    // Row 3 (different csvServiceName) is NOT touched.
    expect(component._rows()[2].serviceId).toBeNull();
  });

  it('broadcast: already-matched rows are NOT touched', () => {
    component.rows = [
      {
        rowIndex: 1, patientId: null, firstName: 'A', lastName: 'A',
        eventId: 'e1', agenda: 'Sandra', serviceName: 'Duda X',
        startTime: null, endTime: null, appointmentStatus: 'Scheduled',
        comments: '', recurrencyType: '', tz: 'Europe/Madrid',
        status: 'unresolved', clientId: null, clientCandidates: [],
        professionalId: null, professionalCandidates: [],
        serviceId: null, serviceCandidates: [],
      },
      {
        rowIndex: 2, patientId: null, firstName: 'B', lastName: 'B',
        eventId: 'e2', agenda: 'Sandra', serviceName: 'Duda X',
        startTime: null, endTime: null, appointmentStatus: 'Scheduled',
        comments: '', recurrencyType: '', tz: 'Europe/Madrid',
        status: 'matched', clientId: 'c-1', clientCandidates: [{ id: 'c-1', label: 'B B' }],
        professionalId: 'p-1', professionalCandidates: [{ id: 'p-1', label: 'Sandra' }],
        serviceId: 's-ORIGINAL', serviceCandidates: [{ id: 's-ORIGINAL', label: 'Original' }],
      },
    ];
    component.linkPicker.set({ rowIndex: 1, section: 'service', loading: false, query: '', items: [] });
    component.linkPickerBroadcast.set(true);
    component.pickFromLinkPicker({ id: 's-NEW', label: 'New' });

    // Row 1 was unresolved, now matched.
    expect(component._rows()[0].serviceId).toBe('s-NEW');
    // Row 2 was already matched with the original service. Broadcast must NOT overwrite it.
    expect(component._rows()[1].serviceId).toBe('s-ORIGINAL');
  });

  it('broadcast: same pattern works for professional, keyed by csvAgenda', () => {
    component.rows = [
      {
        rowIndex: 1, patientId: null, firstName: 'A', lastName: 'A',
        eventId: 'e1', agenda: 'Sandra Turrens', serviceName: 'S1',
        startTime: null, endTime: null, appointmentStatus: 'Scheduled',
        comments: '', recurrencyType: '', tz: 'Europe/Madrid',
        status: 'unresolved', clientId: null, clientCandidates: [],
        professionalId: null, professionalCandidates: [],
        serviceId: null, serviceCandidates: [],
      },
      {
        rowIndex: 2, patientId: null, firstName: 'B', lastName: 'B',
        eventId: 'e2', agenda: 'Sandra Turrens', serviceName: 'S2',
        startTime: null, endTime: null, appointmentStatus: 'Scheduled',
        comments: '', recurrencyType: '', tz: 'Europe/Madrid',
        status: 'unresolved', clientId: null, clientCandidates: [],
        professionalId: null, professionalCandidates: [],
        serviceId: null, serviceCandidates: [],
      },
    ];
    component.linkPicker.set({ rowIndex: 1, section: 'professional', loading: false, query: '', items: [] });
    component.linkPickerBroadcast.set(true);
    component.pickFromLinkPicker({ id: 'p-Sandra', label: 'Sandra Turrens' });

    expect(component._rows()[0].professionalId).toBe('p-Sandra');
    expect(component._rows()[1].professionalId).toBe('p-Sandra');
    // Row 1 (the source) gets the pick. Row 2 has the professional id now but
    // the row's overall status is still 'unresolved' because client + service
    // are missing in this fixture.
    expect(component._rows()[1].status).toBe('unresolved');
  });

  it('broadcast checkbox is hidden when currentPickerBroadcastCount is 0 (N=1 case)', () => {
    // Only one row has csvServiceName = "Servicio X" → currentPickerBroadcastCount = 0.
    component.rows = [
      {
        rowIndex: 1, patientId: null, firstName: 'A', lastName: 'A',
        eventId: 'e1', agenda: 'Sandra', serviceName: 'Único',
        startTime: null, endTime: null, appointmentStatus: 'Scheduled',
        comments: '', recurrencyType: '', tz: 'Europe/Madrid',
        status: 'unresolved', clientId: null, clientCandidates: [],
        professionalId: null, professionalCandidates: [],
        serviceId: null, serviceCandidates: [],
      },
      {
        rowIndex: 2, patientId: null, firstName: 'B', lastName: 'B',
        eventId: 'e2', agenda: 'Sandra', serviceName: 'Distinto',
        startTime: null, endTime: null, appointmentStatus: 'Scheduled',
        comments: '', recurrencyType: '', tz: 'Europe/Madrid',
        status: 'unresolved', clientId: null, clientCandidates: [],
        professionalId: null, professionalCandidates: [],
        serviceId: null, serviceCandidates: [],
      },
    ];
    component.linkPicker.set({ rowIndex: 1, section: 'service', loading: false, query: '', items: [] });
    expect(component.currentPickerBroadcastCount).toBe(0);
  });

  it('broadcast: header counts update after a service broadcast', () => {
    // 2 unresolved rows that share the same csvServiceName.
    component.rows = [
      {
        rowIndex: 1, patientId: null, firstName: 'A', lastName: 'A',
        eventId: 'e1', agenda: 'Sandra', serviceName: 'Duda X',
        startTime: null, endTime: null, appointmentStatus: 'Scheduled',
        comments: '', recurrencyType: '', tz: 'Europe/Madrid',
        status: 'unresolved', clientId: null, clientCandidates: [],
        professionalId: null, professionalCandidates: [],
        serviceId: null, serviceCandidates: [],
      },
      {
        rowIndex: 2, patientId: null, firstName: 'B', lastName: 'B',
        eventId: 'e2', agenda: 'Sandra', serviceName: 'Duda X',
        startTime: null, endTime: null, appointmentStatus: 'Scheduled',
        comments: '', recurrencyType: '', tz: 'Europe/Madrid',
        status: 'unresolved', clientId: null, clientCandidates: [],
        professionalId: null, professionalCandidates: [],
        serviceId: null, serviceCandidates: [],
      },
    ];
    expect(component.countUnresolved).toBe(2);
    expect(component.countMatched).toBe(0);

    component.linkPicker.set({ rowIndex: 1, section: 'service', loading: false, query: '', items: [] });
    component.linkPickerBroadcast.set(true);
    component.pickFromLinkPicker({ id: 's-X', label: 'Servicio X CRM' });

    // After the service broadcast, both rows have a serviceId but are still
    // missing clientId + professionalId, so the row status is 'unresolved'
    // (worst of the 3 sections). The service SECTION is matched now though.
    expect(component.countUnresolved).toBe(2);
    expect(component.countMatched).toBe(0);
    expect(component.serviceSection(component._rows()[0]).status).toBe('matched');
    expect(component.serviceSection(component._rows()[1]).status).toBe('matched');
  });

  // ── Auto-hide resolved rows (round 5) ──────────────────────────

  it('auto-hide: by default, matched and skipped rows are not in visibleRows', () => {
    // mockRows has 1 matched, 1 ambiguous, 1 unresolved.
    // default showResolved = false → visibleRows should contain only 2 rows.
    expect(component.showResolved()).toBe(false);
    const visible = component.visibleRows();
    expect(visible.length).toBe(2);
    expect(visible.every((r) => r.status !== 'matched' && r.status !== 'skipped')).toBe(true);
  });

  it('auto-hide: hiddenResolvedCount returns the number of rows currently hidden', () => {
    // 1 matched in mockRows → hiddenResolvedCount = 1
    expect(component.hiddenResolvedCount).toBe(1);
  });

  it('auto-hide: toggling showResolved shows the previously hidden rows', () => {
    expect(component.visibleRows().length).toBe(2);
    component.toggleShowResolved();
    expect(component.showResolved()).toBe(true);
    expect(component.visibleRows().length).toBe(3);
    component.toggleShowResolved();
    expect(component.showResolved()).toBe(false);
    expect(component.visibleRows().length).toBe(2);
  });

  it('auto-hide: onConfirm still operates on the full rows list, not just visible ones', () => {
    // The matched row is hidden by default. Skipping the unresolved row should
    // still leave the ambiguous row blocking the confirm — proving the filter
    // is purely visual and onConfirm sees the full set.
    spyOn(component.confirmed, 'emit');
    // Skip the unresolved row.
    component.skipRow(component._rows()[2]);
    // The ambiguous row is still in the full set, even though it would be visible.
    expect(component.visibleRows().length).toBe(1); // only the ambiguous one
    component.onConfirm();
    expect(toastSpy.error).toHaveBeenCalled();
    expect(component.confirmed.emit).not.toHaveBeenCalled();
  });

  it('auto-hide: a row that was matched and then un-picked is no longer in the hidden set', () => {
    // hiddenResolvedCount should respond to live row status changes.
    // mockRows[0] is fully resolved (3 ids) → hiddenResolvedCount = 1.
    expect(component.hiddenResolvedCount).toBe(1);
    // Manually clear the service id on that row to simulate an un-pick.
    // Now only 2 of 3 sections are resolved → rowIsFullyResolved → false → row is visible.
    component._rows.update((rows) =>
      rows.map((r) => (r.rowIndex === 1 ? { ...r, serviceId: null, serviceCandidates: [] } : r)),
    );
    expect(component.hiddenResolvedCount).toBe(0);
    expect(component.visibleRows().length).toBe(3);
  });

  // ── Section-aware status (round 7) ────────────────────────────

  it('section-aware: a row with status=matched but a missing service id is NOT fully resolved', () => {
    // The previous implementation was too permissive: a row became 'matched'
    // as soon as ANY section was picked. Now the row is only fully resolved
    // when client + professional + service all have ids.
    component._rows.update((rows) =>
      rows.map((r) => (r.rowIndex === 1 ? { ...r, serviceId: null, serviceCandidates: [] } : r)),
    );
    expect(component.rowIsFullyResolved(component._rows()[0])).toBe(false);
    expect(component._rows()[0].status).toBe('matched'); // legacy status, kept for compat
    // hiddenResolvedCount drops because the row is no longer fully resolved.
    expect(component.hiddenResolvedCount).toBe(0);
    expect(component.visibleRows().length).toBe(3);
  });

  it('section-aware: a row with status=matched and all 3 sections filled IS fully resolved', () => {
    // mockRows[0] has all 3 ids and status=matched → fully resolved.
    expect(component.rowIsFullyResolved(component._rows()[0])).toBe(true);
    expect(component.hiddenResolvedCount).toBe(1);
  });

  it('section-aware: ambiguous row is never fully resolved (no clientId, multiple candidates)', () => {
    // mockRows[1] is the ambiguous one (no clientId, 2 candidates).
    expect(component.rowIsFullyResolved(component._rows()[1])).toBe(false);
  });

  it('section-aware: recomputeStatus returns the worst of the 3 section statuses', () => {
    // Build a row with all 3 sections having different statuses.
    const row: ResolvedDoctoraliaRow = {
      rowIndex: 99, patientId: null, firstName: 'X', lastName: 'Y',
      eventId: 'e99', agenda: null, serviceName: 'S',
      startTime: null, endTime: null, appointmentStatus: 'Scheduled',
      comments: '', recurrencyType: '', tz: 'Europe/Madrid',
      status: 'unresolved', // legacy
      clientId: 'c-1', clientCandidates: [{ id: 'c-1', label: 'X Y' }],  // matched
      professionalId: null, professionalCandidates: [],                   // unresolved
      serviceId: null, serviceCandidates: [
        { id: 's-1', label: 'S' }, { id: 's-2', label: 'S' },              // ambiguous
      ],
    };
    component._rows.set([row]);
    // 1 section unresolved + 1 ambiguous + 1 matched → row is unresolved.
    expect(component._rows()[0].status).toBe('unresolved');
    expect(component.rowIsFullyResolved(row)).toBe(false);
  });

  it('section-aware: a row with all 3 sections matched is rowIsFullyResolved even if status was previously something else', () => {
    const row: ResolvedDoctoraliaRow = {
      rowIndex: 100, patientId: null, firstName: 'A', lastName: 'B',
      eventId: 'e100', agenda: 'Sandra', serviceName: 'S',
      startTime: null, endTime: null, appointmentStatus: 'Scheduled',
      comments: '', recurrencyType: '', tz: 'Europe/Madrid',
      status: 'ambiguous', // legacy (would be ambiguous because the row was just edited)
      clientId: 'c-A', clientCandidates: [{ id: 'c-A', label: 'A B' }],
      professionalId: 'p-S', professionalCandidates: [{ id: 'p-S', label: 'Sandra' }],
      serviceId: 's-S', serviceCandidates: [{ id: 's-S', label: 'S' }],
    };
    expect(component.rowIsFullyResolved(row)).toBe(true);
  });

  // ── Client broadcast (round 6) ──────────────────────────────────

  it('client: clientKey normalizes accents, case and whitespace', () => {
    const rowA = { ...component._rows()[1], firstName: 'Aránzazu', lastName: 'MOLINA  LÓPEZ' } as ResolvedDoctoraliaRow;
    const rowB = { ...component._rows()[1], firstName: 'aranzazu', lastName: 'molina lopez' } as ResolvedDoctoraliaRow;
    expect(component.clientKey(rowA)).toBe('aranzazu|molina lopez');
    expect(component.clientKey(rowB)).toBe(component.clientKey(rowA));
  });

  it('client: clientKey returns null when firstName or lastName is missing', () => {
    const r1 = { ...component._rows()[1], firstName: null, lastName: 'Molina' } as ResolvedDoctoraliaRow;
    const r2 = { ...component._rows()[1], firstName: 'Aranzazu', lastName: null } as ResolvedDoctoraliaRow;
    expect(component.clientKey(r1)).toBeNull();
    expect(component.clientKey(r2)).toBeNull();
  });

  it('client broadcast: applies to all other rows with the same normalized name, leaves already-matched alone', () => {
    component.rows = [
      {
        rowIndex: 1, patientId: 'pid-1', firstName: 'Marta', lastName: 'Fernandez',
        eventId: 'e1', agenda: 'Sandra', serviceName: 'S1',
        startTime: null, endTime: null, appointmentStatus: 'Scheduled',
        comments: '', recurrencyType: '', tz: 'Europe/Madrid',
        status: 'unresolved', clientId: null, clientCandidates: [],
        professionalId: null, professionalCandidates: [],
        serviceId: null, serviceCandidates: [],
      },
      {
        rowIndex: 2, patientId: 'pid-1', firstName: 'MARTA', lastName: 'fernandez',
        eventId: 'e2', agenda: 'Sandra', serviceName: 'S1',
        startTime: null, endTime: null, appointmentStatus: 'Scheduled',
        comments: '', recurrencyType: '', tz: 'Europe/Madrid',
        status: 'unresolved', clientId: null, clientCandidates: [],
        professionalId: null, professionalCandidates: [],
        serviceId: null, serviceCandidates: [],
      },
      {
        rowIndex: 3, patientId: 'pid-1', firstName: 'Marta', lastName: 'FERNÁNDEZ',
        eventId: 'e3', agenda: 'Sandra', serviceName: 'S1',
        startTime: null, endTime: null, appointmentStatus: 'Scheduled',
        comments: '', recurrencyType: '', tz: 'Europe/Madrid',
        status: 'matched', clientId: 'c-OTHER', clientCandidates: [{ id: 'c-OTHER', label: 'Other Marta' }],
        professionalId: 'p-1', professionalCandidates: [{ id: 'p-1', label: 'Sandra' }],
        serviceId: 's-1', serviceCandidates: [{ id: 's-1', label: 'S1' }],
      },
    ];
    component.linkPicker.set({ rowIndex: 1, section: 'client', loading: false, query: '', items: [] });
    component.linkPickerBroadcast.set(true);
    component.pickFromLinkPicker({ id: 'c-marta', label: 'Marta Fernandez' });

    // Source row gets the pick.
    expect(component._rows()[0].clientId).toBe('c-marta');
    // Other unresolved row with the same name gets the pick. Section is now
    // matched but the row's overall status is still 'unresolved' because
    // professional + service are still missing in this fixture.
    expect(component._rows()[1].clientId).toBe('c-marta');
    expect(component._rows()[1].status).toBe('unresolved');
    // Already-matched row is NOT touched.
    expect(component._rows()[2].clientId).toBe('c-OTHER');
    expect(component._rows()[2].status).toBe('matched');
  });

  it('client broadcast: blocked when the group has conflicting non-null patientIds', () => {
    component.rows = [
      {
        rowIndex: 1, patientId: 'pid-A', firstName: 'Marc', lastName: 'Garcia',
        eventId: 'e1', agenda: 'Sandra', serviceName: 'S1',
        startTime: null, endTime: null, appointmentStatus: 'Scheduled',
        comments: '', recurrencyType: '', tz: 'Europe/Madrid',
        status: 'unresolved', clientId: null, clientCandidates: [],
        professionalId: null, professionalCandidates: [],
        serviceId: null, serviceCandidates: [],
      },
      {
        rowIndex: 2, patientId: 'pid-B', firstName: 'MARC', lastName: 'GARCIA',
        eventId: 'e2', agenda: 'Sandra', serviceName: 'S1',
        startTime: null, endTime: null, appointmentStatus: 'Scheduled',
        comments: '', recurrencyType: '', tz: 'Europe/Madrid',
        status: 'unresolved', clientId: null, clientCandidates: [],
        professionalId: null, professionalCandidates: [],
        serviceId: null, serviceCandidates: [],
      },
    ];
    // The picker should NOT show the broadcast checkbox at all (count = 0).
    component.linkPicker.set({ rowIndex: 1, section: 'client', loading: false, query: '', items: [] });
    expect(component.currentPickerBroadcastCount).toBe(0);
    // And even if the user somehow flips the checkbox on and picks, the
    // broadcast should be a no-op for the other row.
    component.linkPickerBroadcast.set(true);
    component.pickFromLinkPicker({ id: 'c-marc', label: 'Marc Garcia' });
    expect(component._rows()[0].clientId).toBe('c-marc'); // source row OK
    expect(component._rows()[1].clientId).toBeNull();     // other row NOT touched
  });

  it('client broadcast: allowed when patientIds are all the same (or all null)', () => {
    component.rows = [
      {
        rowIndex: 1, patientId: 'pid-1', firstName: 'Pere', lastName: 'Roma',
        eventId: 'e1', agenda: 'Sandra', serviceName: 'S1',
        startTime: null, endTime: null, appointmentStatus: 'Scheduled',
        comments: '', recurrencyType: '', tz: 'Europe/Madrid',
        status: 'unresolved', clientId: null, clientCandidates: [],
        professionalId: null, professionalCandidates: [],
        serviceId: null, serviceCandidates: [],
      },
      {
        rowIndex: 2, patientId: 'pid-1', firstName: 'PERE', lastName: 'ROMA',
        eventId: 'e2', agenda: 'Sandra', serviceName: 'S1',
        startTime: null, endTime: null, appointmentStatus: 'Scheduled',
        comments: '', recurrencyType: '', tz: 'Europe/Madrid',
        status: 'unresolved', clientId: null, clientCandidates: [],
        professionalId: null, professionalCandidates: [],
        serviceId: null, serviceCandidates: [],
      },
      {
        rowIndex: 3, patientId: null, firstName: 'Pere', lastName: 'Roma',
        eventId: 'e3', agenda: 'Sandra', serviceName: 'S1',
        startTime: null, endTime: null, appointmentStatus: 'Scheduled',
        comments: '', recurrencyType: '', tz: 'Europe/Madrid',
        status: 'unresolved', clientId: null, clientCandidates: [],
        professionalId: null, professionalCandidates: [],
        serviceId: null, serviceCandidates: [],
      },
    ];
    component.linkPicker.set({ rowIndex: 1, section: 'client', loading: false, query: '', items: [] });
    expect(component.currentPickerBroadcastCount).toBe(2);
    component.linkPickerBroadcast.set(true);
    component.pickFromLinkPicker({ id: 'c-pere', label: 'Pere Roma' });
    expect(component._rows()[0].clientId).toBe('c-pere');
    expect(component._rows()[1].clientId).toBe('c-pere');
    expect(component._rows()[2].clientId).toBe('c-pere');
  });

  it('client broadcast: header counts update after the broadcast', () => {
    component.rows = [
      {
        rowIndex: 1, patientId: 'pid-1', firstName: 'Laia', lastName: 'Aleta',
        eventId: 'e1', agenda: 'Sandra', serviceName: 'S1',
        startTime: null, endTime: null, appointmentStatus: 'Scheduled',
        comments: '', recurrencyType: '', tz: 'Europe/Madrid',
        status: 'unresolved', clientId: null, clientCandidates: [],
        professionalId: null, professionalCandidates: [],
        serviceId: null, serviceCandidates: [],
      },
      {
        rowIndex: 2, patientId: 'pid-1', firstName: 'laia', lastName: 'aleta',
        eventId: 'e2', agenda: 'Sandra', serviceName: 'S1',
        startTime: null, endTime: null, appointmentStatus: 'Scheduled',
        comments: '', recurrencyType: '', tz: 'Europe/Madrid',
        status: 'unresolved', clientId: null, clientCandidates: [],
        professionalId: null, professionalCandidates: [],
        serviceId: null, serviceCandidates: [],
      },
    ];
    expect(component.countUnresolved).toBe(2);
    expect(component.countMatched).toBe(0);
    component.linkPicker.set({ rowIndex: 1, section: 'client', loading: false, query: '', items: [] });
    component.linkPickerBroadcast.set(true);
    component.pickFromLinkPicker({ id: 'c-laia', label: 'Laia Aleta' });
    // After the client broadcast, both rows have a clientId but are still
    // missing professionalId + serviceId, so the row status is 'unresolved'
    // (worst of the 3 sections). The client SECTION is matched now though.
    expect(component.countUnresolved).toBe(2);
    expect(component.countMatched).toBe(0);
    expect(component.clientSection(component._rows()[0]).status).toBe('matched');
    expect(component.clientSection(component._rows()[1]).status).toBe('matched');
  });

  it('client broadcast: checkbox hidden when only one row has the name (N=1 case)', () => {
    component.rows = [
      {
        rowIndex: 1, patientId: 'pid-1', firstName: 'Solo', lastName: 'Unico',
        eventId: 'e1', agenda: 'Sandra', serviceName: 'S1',
        startTime: null, endTime: null, appointmentStatus: 'Scheduled',
        comments: '', recurrencyType: '', tz: 'Europe/Madrid',
        status: 'unresolved', clientId: null, clientCandidates: [],
        professionalId: null, professionalCandidates: [],
        serviceId: null, serviceCandidates: [],
      },
      {
        rowIndex: 2, patientId: 'pid-2', firstName: 'Otro', lastName: 'Nombre',
        eventId: 'e2', agenda: 'Sandra', serviceName: 'S1',
        startTime: null, endTime: null, appointmentStatus: 'Scheduled',
        comments: '', recurrencyType: '', tz: 'Europe/Madrid',
        status: 'unresolved', clientId: null, clientCandidates: [],
        professionalId: null, professionalCandidates: [],
        serviceId: null, serviceCandidates: [],
      },
    ];
    component.linkPicker.set({ rowIndex: 1, section: 'client', loading: false, query: '', items: [] });
    expect(component.currentPickerBroadcastCount).toBe(0);
    expect(component.currentPickerClientNameLabel).toBe('SOLO UNICO');
  });
});
