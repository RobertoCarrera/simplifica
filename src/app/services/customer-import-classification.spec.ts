// Spec for the customer-import wizard service methods.
// These are pure-function specs (no Supabase mocking needed for the
// classification logic). The async DB-fetching methods (fetchClientsForMatcher,
// importCustomersWizard) are NOT covered here — they require integration
// tests with a real or mocked Supabase client.

import {
  ClassifiedCustomerRow,
  CustomerCsvRow,
  CustomerInsertPayload,
} from './customer-import.types';

// Re-import the service without instantiating it. We test the static-ish
// methods via duck-typing since they don't touch `this.supabase`.
//
// To avoid importing the full service (which has 3046 lines and pulls in
// many Angular dependencies), we test the classification logic via the
// matcher module directly — which is what the service delegates to.

import {
  matchCustomerByName,
  matchCustomerByExactEmail,
  matchCustomerByCifOrDni,
} from './customer-matcher';

describe('customer-import wizard classification logic (via customer-matcher delegation)', () => {
  const existing: CustomerLiteForTest[] = [
    { id: 'c-1', name: 'Marc', surname: 'Escoda', email: 'marc@x.com', cif_nif: 'B12345678', dni: '12345678X' },
    { id: 'c-2', name: 'Miriam', surname: 'Blesa Cambra', email: 'miriam@x.com', cif_nif: null, dni: null },
    { id: 'c-3', name: 'Marta', surname: 'Calero', email: null, cif_nif: null, dni: null },
  ];

  describe('email exact match', () => {
    it('marks the row as alreadyExists when email matches case-insensitively', () => {
      const match = matchCustomerByExactEmail('MARC@x.com', existing);
      expect(match?.id).toBe('c-1');
    });

    it('returns null when no email match', () => {
      expect(matchCustomerByExactEmail('nope@x.com', existing)).toBeNull();
    });
  });

  describe('cif/dni exact match', () => {
    it('matches by cif_nif', () => {
      expect(matchCustomerByCifOrDni('b12345678', null, existing)?.id).toBe('c-1');
    });
    it('matches by dni', () => {
      expect(matchCustomerByCifOrDni(null, '12345678X', existing)?.id).toBe('c-1');
    });
  });

  describe('fuzzy name match', () => {
    it('matches compound surname reordered', () => {
      const result = matchCustomerByName('Miriam', 'Blesa Cambra', existing);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].client.id).toBe('c-2');
    });

    it('returns empty for unrelated name', () => {
      expect(matchCustomerByName('Pedro', 'García', existing)).toEqual([]);
    });
  });

// Helper that mimics the service's classifyCustomerRow output for a
// given CSV row against an existing client list. We re-implement the
// classification here (the service does the same logic) so the test is
// a unit test of the *flow*, not of the service. Exposed at the top level
// so multiple describe blocks can share it.
function classifyFlow(
  row: CustomerCsvRow,
  candidates: CustomerLiteForTest[],
): Pick<ClassifiedCustomerRow, 'status' | 'candidates' | 'invalidFields'> {
      const invalid: string[] = [];
      const rawCt = (row.clientType ?? '').toLowerCase().trim();
      const validTypes = ['individual', 'business', 'self_employed', 'consumer'];
      const hasBusinessName = !!(row.businessName && row.businessName.trim());
      const hasPersonName =
        !!(row.firstName && row.firstName.trim()) || !!(row.surname && row.surname.trim());
      let ct: string;
      if (validTypes.includes(rawCt)) {
        ct = rawCt;
      } else if (hasBusinessName && !hasPersonName) {
        ct = 'business';
      } else {
        ct = 'individual';
      }
      if (row.clientType && rawCt && !validTypes.includes(rawCt)) {
        invalid.push('clientType');
      }
      if (ct === 'individual' || ct === 'consumer' || ct === 'self_employed') {
        if (!row.firstName?.trim()) invalid.push('firstName');
        if (!row.surname?.trim()) invalid.push('surname');
      } else if (ct === 'business') {
        if (!row.businessName?.trim()) invalid.push('businessName');
      }
      if (invalid.length > 0) return { status: 'invalid', candidates: [], invalidFields: invalid };

      const email = matchCustomerByExactEmail(row.email, candidates);
      if (email) return { status: 'alreadyExists', candidates: [{ client: email, jaccard: 1, apellidoMatches: true, source: 'exact' }], invalidFields: [] };

      const cif = matchCustomerByCifOrDni(row.cif, row.dni, candidates);
      if (cif) return { status: 'alreadyExists', candidates: [{ client: cif, jaccard: 1, apellidoMatches: true, source: 'exact' }], invalidFields: [] };

      if (ct === 'individual' || ct === 'consumer' || ct === 'self_employed') {
        const fuzzy = matchCustomerByName(row.firstName, row.surname, candidates);
        if (fuzzy.length > 0) return { status: 'likely_duplicate', candidates: fuzzy, invalidFields: [] };
      }
      return { status: 'valid', candidates: [], invalidFields: [] };
}

  describe('resolution classification flow', () => {
    it('valid row: no match anywhere → valid', () => {
      const row: CustomerCsvRow = {
        rowIndex: 0,
        firstName: 'Pepita', surname: 'Nueva',
        email: null, phone: null, cif: null, dni: null,
        clientType: 'individual',
        businessName: null, tradeName: null,
        legalRepresentativeName: null, legalRepresentativeDni: null,
        address: null, raw: {},
      };
      const result = classifyFlow(row, existing);
      expect(result.status).toBe('valid');
      expect(result.candidates).toEqual([]);
    });

    it('invalid row: missing name → invalid', () => {
      const row: CustomerCsvRow = {
        rowIndex: 0,
        firstName: '', surname: 'Apellido',
        email: null, phone: null, cif: null, dni: null,
        clientType: 'individual',
        businessName: null, tradeName: null,
        legalRepresentativeName: null, legalRepresentativeDni: null,
        address: null, raw: {},
      };
      const result = classifyFlow(row, existing);
      expect(result.status).toBe('invalid');
      expect(result.invalidFields).toContain('firstName');
    });

    it('likely_duplicate row: fuzzy name match', () => {
      const row: CustomerCsvRow = {
        rowIndex: 0,
        firstName: 'Miriam', surname: 'Blesa Cambra',
        email: null, phone: null, cif: null, dni: null,
        clientType: 'individual',
        businessName: null, tradeName: null,
        legalRepresentativeName: null, legalRepresentativeDni: null,
        address: null, raw: {},
      };
      const result = classifyFlow(row, existing);
      expect(result.status).toBe('likely_duplicate');
      expect(result.candidates.length).toBeGreaterThan(0);
    });

    it('alreadyExists row: exact email match', () => {
      const row: CustomerCsvRow = {
        rowIndex: 0,
        firstName: 'Otro', surname: 'Nombre',
        email: 'marc@x.com', phone: null, cif: null, dni: null,
        clientType: 'individual',
        businessName: null, tradeName: null,
        legalRepresentativeName: null, legalRepresentativeDni: null,
        address: null, raw: {},
      };
      const result = classifyFlow(row, existing);
      expect(result.status).toBe('alreadyExists');
    });

    it('business row: missing business_name → invalid', () => {
      const row: CustomerCsvRow = {
        rowIndex: 0,
        firstName: null, surname: null,
        email: null, phone: null, cif: null, dni: null,
        clientType: 'business',
        businessName: null, tradeName: null,
        legalRepresentativeName: null, legalRepresentativeDni: null,
        address: null, raw: {},
      };
      const result = classifyFlow(row, existing);
      expect(result.status).toBe('invalid');
      expect(result.invalidFields).toContain('businessName');
    });
  });

  describe('payload shape', () => {
    it('CustomerInsertPayload has source="csv-wizard"', () => {
      const p: CustomerInsertPayload = {
        csvRowIndex: 0,
        name: 'X', surname: 'Y',
        email: null, phone: null, dni: null,
        client_type: 'individual',
        business_name: null, cif_nif: null,
        trade_name: null, legal_representative_name: null, legal_representative_dni: null,
        source: 'csv-wizard',
        metadata: {},
      };
      expect(p.source).toBe('csv-wizard');
    });
  });

  describe('smart default for clientType', () => {
    it('company name without person name defaults to business and is valid', () => {
      // Stripe-style row: empty first/last name, only bill_to:company.
      const row: CustomerCsvRow = {
        rowIndex: 0,
        firstName: null, surname: null,
        email: 'info@dentamar.com', phone: null,
        cif: 'B64284433', dni: null,
        clientType: null,
        businessName: 'Subur Dental, S.L.P',
        tradeName: null, legalRepresentativeName: null, legalRepresentativeDni: null,
        address: null, addressCity: null, addressState: null,
        addressPostalCode: null, addressCountry: null,
        raw: {},
      };
      const result = classifyFlow(row, []);
      expect(result.status).toBe('valid');
      expect(result.invalidFields).toEqual([]);
    });

    it('person name without company name defaults to individual and is valid', () => {
      const row: CustomerCsvRow = {
        rowIndex: 0,
        firstName: 'Pia', surname: 'Mill',
        email: 'finance@slalom.agency', phone: null,
        cif: null, dni: null,
        clientType: null,
        businessName: null,
        tradeName: null, legalRepresentativeName: null, legalRepresentativeDni: null,
        address: null, addressCity: null, addressState: null,
        addressPostalCode: null, addressCountry: null,
        raw: {},
      };
      const result = classifyFlow(row, []);
      expect(result.status).toBe('valid');
      expect(result.invalidFields).toEqual([]);
    });

    it('both names present defaults to individual (most common case)', () => {
      const row: CustomerCsvRow = {
        rowIndex: 0,
        firstName: 'Pia', surname: 'Mill',
        email: null, phone: null, cif: null, dni: null,
        clientType: null,
        businessName: 'Some S.L.',
        tradeName: null, legalRepresentativeName: null, legalRepresentativeDni: null,
        address: null, addressCity: null, addressState: null,
        addressPostalCode: null, addressCountry: null,
        raw: {},
      };
      const result = classifyFlow(row, []);
      expect(result.status).toBe('valid');
    });

    it('neither name nor company present defaults to individual but is invalid', () => {
      const row: CustomerCsvRow = {
        rowIndex: 0,
        firstName: null, surname: null,
        email: 'orphan@example.com', phone: null,
        cif: null, dni: null,
        clientType: null,
        businessName: null,
        tradeName: null, legalRepresentativeName: null, legalRepresentativeDni: null,
        address: null, addressCity: null, addressState: null,
        addressPostalCode: null, addressCountry: null,
        raw: {},
      };
      const result = classifyFlow(row, []);
      expect(result.status).toBe('invalid');
      expect(result.invalidFields).toContain('firstName');
    });

    it('explicit clientType "business" is respected even with a person name', () => {
      const row: CustomerCsvRow = {
        rowIndex: 0,
        firstName: 'Pia', surname: 'Mill',
        email: null, phone: null, cif: null, dni: null,
        clientType: 'business',
        businessName: 'Some S.L.',
        tradeName: null, legalRepresentativeName: null, legalRepresentativeDni: null,
        address: null, addressCity: null, addressState: null,
        addressPostalCode: null, addressCountry: null,
        raw: {},
      };
      const result = classifyFlow(row, []);
      expect(result.status).toBe('valid');
      // businessName is present → no businessName error.
      expect(result.invalidFields).not.toContain('businessName');
    });
  });
});

// Local minimal type used in this spec (mirrors customer-matcher.CustomerLite)
interface CustomerLiteForTest {
  id: string;
  name: string;
  surname: string | null;
  email: string | null;
  cif_nif: string | null;
  dni: string | null;
}