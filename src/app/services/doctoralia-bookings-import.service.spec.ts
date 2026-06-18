import { TestBed } from '@angular/core/testing';
import { DoctoraliaBookingsImportService } from './doctoralia-bookings-import.service';
import { SupabaseClientService } from './supabase-client.service';
import { ClinicalNotesImportService } from './clinical-notes-import.service';

describe('DoctoraliaBookingsImportService', () => {
  let service: DoctoraliaBookingsImportService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        DoctoraliaBookingsImportService,
        // Mocks: the tests below only exercise pure helpers, no real network.
        { provide: SupabaseClientService, useValue: { instance: {} } },
        {
          provide: ClinicalNotesImportService,
          useValue: {
            normalizeName: (s: string | null | undefined) =>
              (s ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' '),
            sha256Hex: async () => 'deadbeef',
            sanitizeNoteContent: (s: string | null | undefined) => (s ?? '').trim(),
            buildFailureReport: (failed: any[]) => 'row_index,client_id,status,reason\n' + failed.map((f) => `${f.rowIndex},,${f.errorCode},${f.errorMessage}`).join('\n'),
            createClientFromImport: () => ({ subscribe: () => {} } as any),
          },
        },
      ],
    });
    service = TestBed.inject(DoctoraliaBookingsImportService);
  });

  describe('mapAppointmentStatus (REQ-12)', () => {
    it('maps Scheduled → confirmed', () => {
      expect(service.mapAppointmentStatus('Scheduled')).toBe('confirmed');
    });
    it('maps WaitingForConfirmation → pending', () => {
      expect(service.mapAppointmentStatus('WaitingForConfirmation')).toBe('pending');
    });
    it('maps CanceledByUser → cancelled', () => {
      expect(service.mapAppointmentStatus('CanceledByUser')).toBe('cancelled');
    });
    it('returns null for unknown status', () => {
      expect(service.mapAppointmentStatus('Rescheduled')).toBeNull();
      expect(service.mapAppointmentStatus('')).toBeNull();
      expect(service.mapAppointmentStatus(null)).toBeNull();
    });
  });

  describe('applyTimezone (REQ-13)', () => {
    it('converts a Madrid summer time to UTC (CEST, +2)', () => {
      // 2025-06-04 12:30 Madrid (CEST) = 10:30 UTC
      const utc = service.applyTimezone('2025-06-04 12:30', 'Europe/Madrid');
      expect(utc.startsWith('2025-06-04T10:30:00')).toBeTrue();
    });
    it('converts a Madrid winter time to UTC (CET, +1)', () => {
      // 2025-01-15 12:30 Madrid (CET) = 11:30 UTC
      const utc = service.applyTimezone('2025-01-15 12:30', 'Europe/Madrid');
      expect(utc.startsWith('2025-01-15T11:30:00')).toBeTrue();
    });
    it('returns the same time for UTC', () => {
      const utc = service.applyTimezone('2025-06-04 12:30', 'UTC');
      expect(utc.startsWith('2025-06-04T12:30:00')).toBeTrue();
    });
  });

  describe('normalizeName (helper)', () => {
    it('strips diacritics, lowercases, collapses whitespace', () => {
      expect(service.normalizeName('  Sandra   Turréns  ')).toBe('sandra turrens');
    });
  });

  describe('buildFailureReport (REQ-16)', () => {
    it('produces a CSV with the failure rows', () => {
      const csv = service.buildFailureReport([
        { rowIndex: 3, ok: false, deduped: false, errorCode: 'unknown_status', errorMessage: 'Bad status' },
        { rowIndex: 7, ok: false, deduped: false, errorCode: 'missing_required_field', errorMessage: 'eventId' },
      ]);
      expect(csv).toContain('row_index');
      expect(csv).toContain('3,');
      expect(csv).toContain('7,');
    });
  });

  describe('resolveProfessional — token-set matching (REQ-5)', () => {
    // Use the optional preFetched parameter to inject test fixtures.
    const caibsProfessionals = [
      { id: 'p-miriam',  display_name: 'Miriam Blesa Cambra' },
      { id: 'p-xavier',  display_name: 'Xavier Blesa Cambra' },
      { id: 'p-sandra',  display_name: 'Sandra Turrens' },
      { id: 'p-eva',     display_name: 'Eva Cañete Hernández' },
      { id: 'p-marta',   display_name: 'Marta Calero' },
    ];

    async function resolve(agenda: string) {
      const rows = await service.resolveRows(
        [{ rowIndex: 1, fields: {
          patient_id: '1', first_name: 'Test', last_name: 'User',
          agenda, service: 'Svc', start_time: '2025-06-04 12:30', end_time: '2025-06-04 13:30',
          appointment_status: 'Scheduled', comments: '', recurrency_type: '',
        } as any }],
        'company-1',
        'Europe/Madrid',
        { professionals: caibsProfessionals as any, clients: [] as any, services: [] as any },
      );
      return rows[0];
    }

    it('matches "Blesa Cambra, Miriam" to "Miriam Blesa Cambra" (reordered compound surname)', async () => {
      const r = await resolve('Blesa Cambra, Miriam');
      expect(r.professionalId).toBe('p-miriam');
      expect(r.status).toBe('matched');
    });

    it('flags "Blesa Cambra, Miriam" as ambiguous when Xavier Blesa Cambra also exists', async () => {
      const r = await resolve('Blesa Cambra, Miriam');
      // Both have apellido "cambra" and Jaccard >= 0.6; expect ambiguous.
      expect(r.status).toBe('ambiguous');
      expect(r.professionalCandidates.length).toBeGreaterThanOrEqual(2);
    });

    it('does NOT match "Blesa Cambra, Miriam" to "Marta Calero" (different apellido)', async () => {
      const r = await resolve('Blesa Cambra, Miriam');
      // Filter candidates should not include p-marta
      expect(r.professionalCandidates.find((c: any) => c.id === 'p-marta')).toBeUndefined();
    });

    it('matches "Turrens, Sandra" to "Sandra Turrens" exactly', async () => {
      const r = await resolve('Turrens, Sandra');
      expect(r.professionalId).toBe('p-sandra');
    });

    it('matches "Cañete Hernández, Eva" to "Eva Cañete Hernández"', async () => {
      const r = await resolve('Cañete Hernández, Eva');
      expect(r.professionalId).toBe('p-eva');
    });

    it('marks truly unrelated names as unresolved', async () => {
      const r = await resolve('Zzz Yyy');
      expect(r.professionalId).toBeNull();
      expect(r.status).toBe('unresolved');
    });
  });

  describe('resolveService — Doctoralia service mapping (Pass 0)', () => {
    // Tests for the user-configured Doctoralia → CRM service mappings
    // (Configuración > Integraciones > Doctoralia > Mapeo de Servicios).
    // These mappings take priority over exact and fuzzy matching.
    const caibsServices = [
      { id: 's-psico-individual', name: 'Psicoterapia Individual' },
      { id: 's-sexologia',        name: 'Sexología' },
      { id: 's-terapia-pareja',   name: 'Psicoterapia de Pareja' },
      { id: 's-fisio',            name: 'Fisioterapia' },
    ];

    async function resolveWithMappings(
      serviceName: string,
      serviceMappingsByDpName: Map<string, string>,
    ) {
      const rows = await service.resolveRows(
        [{ rowIndex: 1, fields: {
          patient_id: '1', first_name: 'Test', last_name: 'User',
          agenda: 'Sandra Turrens', service: serviceName,
          start_time: '2025-06-04 12:30', end_time: '2025-06-04 13:30',
          appointment_status: 'Scheduled', comments: '', recurrency_type: '',
        } as any }],
        'company-1',
        'Europe/Madrid',
        {
          professionals: [] as any,
          clients: [] as any,
          services: caibsServices as any,
          serviceMappingsByDpName,
        },
      );
      return rows[0];
    }

    it('uses the Doctoralia service mapping for "Psicoterapia adultos"', async () => {
      // User mapped Doctoralia "Psicoterapia adultos" → CRM "Psicoterapia Individual"
      const mappings = new Map<string, string>([
        ['psicoterapia adultos', 's-psico-individual'],
      ]);
      const r = await resolveWithMappings('Psicoterapia adultos', mappings);
      expect(r.serviceId).toBe('s-psico-individual');
      expect(r.status).toBe('matched');
      expect(r.serviceCandidates[0].label).toContain('(mapeo Doctoralia)');
    });

    it('uses the mapping even with different capitalization', async () => {
      const mappings = new Map<string, string>([
        ['psicoterapia adultos', 's-psico-individual'],
      ]);
      const r = await resolveWithMappings('PSICOTERAPIA ADULTOS', mappings);
      expect(r.serviceId).toBe('s-psico-individual');
    });

    it('falls back to exact match when no mapping is configured', async () => {
      // No mappings → exact match wins
      const r = await resolveWithMappings('Psicoterapia Individual', new Map());
      expect(r.serviceId).toBe('s-psico-individual');
      // No "(mapeo Doctoralia)" suffix because the match came from Pass 1
      expect(r.serviceCandidates[0].label).not.toContain('(mapeo Doctoralia)');
    });

    it('falls back to fuzzy when no mapping and no exact match', async () => {
      const r = await resolveWithMappings('Terapia de pareja', new Map());
      // "Terapia de pareja" doesn't exact-match "Psicoterapia de Pareja" but
      // they share enough tokens for Jaccard ≥ 0.5
      expect(r.serviceId).toBe('s-terapia-pareja');
    });

    it('marks as unresolved when no mapping, no exact, no fuzzy', async () => {
      const r = await resolveWithMappings('Servicio Inexistente XYZ', new Map());
      expect(r.serviceId).toBeNull();
      expect(r.status).toBe('unresolved');
    });

    it('ignores mapping that points to a deleted CRM service', async () => {
      // Mapping points to a UUID that doesn't exist in caibsServices
      const mappings = new Map<string, string>([
        ['psicoterapia adultos', 's-deleted-no-longer-exists'],
      ]);
      const r = await resolveWithMappings('Psicoterapia adultos', mappings);
      // Should fall through to Pass 1 / Pass 2. None of those match either,
      // so it's unresolved.
      expect(r.serviceId).toBeNull();
    });
  });
});
