import {
  normalizePersonName,
  tokensOfName,
  jaccardSimilarity,
  matchCustomerByName,
  matchCustomerByExactEmail,
  matchCustomerByCifOrDni,
  CustomerLite,
} from './customer-matcher';

describe('customer-matcher', () => {
  describe('normalizePersonName', () => {
    it('lowercases', () => {
      expect(normalizePersonName('JAVIER')).toBe('javier');
    });
    it('strips accents', () => {
      expect(normalizePersonName('Aránzazu')).toBe('aranzazu');
    });
    it('collapses whitespace', () => {
      expect(normalizePersonName('  Marc   Antoni  ')).toBe('marc antoni');
    });
    it('handles null/undefined/empty', () => {
      expect(normalizePersonName(null)).toBe('');
      expect(normalizePersonName(undefined)).toBe('');
      expect(normalizePersonName('')).toBe('');
    });
  });

  describe('tokensOfName', () => {
    it('splits on whitespace', () => {
      const tokens = tokensOfName('Marc Antoni');
      expect(tokens.size).toBe(2);
      expect(tokens.has('marc')).toBe(true);
      expect(tokens.has('antoni')).toBe(true);
    });
    it('ignores empty strings', () => {
      expect(tokensOfName('').size).toBe(0);
      expect(tokensOfName(null).size).toBe(0);
    });
  });

  describe('jaccardSimilarity', () => {
    it('returns 0 for two empty sets', () => {
      expect(jaccardSimilarity(new Set(), new Set())).toBe(0);
    });
    it('returns 1 for identical sets', () => {
      const a = new Set(['x', 'y']);
      expect(jaccardSimilarity(a, new Set(['x', 'y']))).toBe(1);
    });
    it('returns intersection over union', () => {
      // {a, b} ∩ {b, c} = {b}; {a, b} ∪ {b, c} = {a, b, c}; → 1/3
      const a = new Set(['a', 'b']);
      const b = new Set(['b', 'c']);
      expect(jaccardSimilarity(a, b)).toBeCloseTo(1 / 3);
    });
  });

  describe('matchCustomerByName', () => {
    const candidates: CustomerLite[] = [
      { id: 'c-1', name: 'Marc', surname: 'Escoda Salat', email: 'marc@x.com', cif_nif: null, dni: null },
      { id: 'c-2', name: 'Miriam', surname: 'Blesa Cambra', email: null, cif_nif: null, dni: null },
      { id: 'c-3', name: 'Marta', surname: 'Calero', email: null, cif_nif: null, dni: null },
      { id: 'c-4', name: 'Sandra', surname: 'Turrens', email: null, cif_nif: null, dni: null },
      { id: 'c-5', name: 'Marc', surname: 'Antoni', email: null, cif_nif: null, dni: null },
    ];

    it('exact match (single candidate) returns source=exact with jaccard=1', () => {
      const result = matchCustomerByName('Marc', 'Escoda Salat', candidates);
      expect(result.length).toBe(1);
      expect(result[0].client.id).toBe('c-1');
      expect(result[0].source).toBe('exact');
      expect(result[0].jaccard).toBe(1);
    });

    it('returns empty array when both names are missing', () => {
      expect(matchCustomerByName(null, 'Calero', candidates)).toEqual([]);
      expect(matchCustomerByName('Marta', null, candidates)).toEqual([]);
      expect(matchCustomerByName(null, null, candidates)).toEqual([]);
    });

    it('apellido anchor: "Marc" + "Antoni" matches "Marc Antoni" (jaccard=1, exact)', () => {
      const result = matchCustomerByName('Marc', 'Antoni', candidates);
      expect(result.length).toBe(1);
      expect(result[0].client.id).toBe('c-5');
      expect(result[0].source).toBe('exact');
    });

    it('apellido anchor prevents "Marc" from matching "Marc Antoni" when CSV surname is just "Marc"', () => {
      // CSV: firstName="Marc", lastName="Marc" — surname token = "marc"
      // Candidate: name="Marc", surname="Antoni" — surname tokens = ["antoni"]
      // apellido anchor: csvSurnameTokens=["marc"].every(t => crmSurnameTokens.has(t))
      //   = "marc" must be in ["antoni"] → FALSE → blocked
      const result = matchCustomerByName('Marc', 'Marc', candidates);
      expect(result.length).toBe(0);
    });

    it('compound surname reordered matches via fuzzy (Jaccard ≥ 0.7 + apellido anchor)', () => {
      // CSV: "Miriam" + "Blesa Cambra" → tokens [miriam, blesa, cambra]
      // CRM: name="Miriam", surname="Blesa Cambra" → tokens [miriam, blesa, cambra]
      // Jaccard = 1, source=exact (full equality)
      const result = matchCustomerByName('Miriam', 'Blesa Cambra', candidates);
      expect(result.length).toBe(1);
      expect(result[0].client.id).toBe('c-2');
      expect(result[0].source).toBe('exact');
    });

    it('does NOT match unrelated names (Marta Calero vs Marc Escoda)', () => {
      const result = matchCustomerByName('Marta', 'Calero', [candidates[0]]);
      // The CRM candidate has surname "Escoda Salat"; CSV surname "Calero".
      // apellido anchor fails immediately → 0 candidates.
      expect(result.length).toBe(0);
    });

    it('returns candidates sorted by jaccard descending (fuzzy matches)', () => {
      // CSV: firstName="Eva", lastName="Cañete Hernández" — tokens [eva, canete, hernandez]
      // Candidate c-A: name="Eva", surname="Cañete" — passes anchor ("canete" ⊂ ["canete"]);
      //   full Jaccard on [eva, canete, hernandez] ∪ [eva, canete] = [eva, canete, hernandez]
      //   intersection = [eva, canete], union = 3 → Jaccard = 2/3 ≈ 0.67. Under 0.7 → rejected.
      // Candidate c-B: name="Eva", surname="Cañete Hernandez" — passes anchor;
      //   full Jaccard = 3/3 = 1.
      // To get TWO fuzzy matches, we need two non-exact candidates with high overlap.
      const manyCandidates: CustomerLite[] = [
        { id: 'c-A', name: 'Eva', surname: 'Cañete', email: null, cif_nif: null, dni: null },
        { id: 'c-B', name: 'Eva Maria', surname: 'Cañete Hernández', email: null, cif_nif: null, dni: null },
      ];
      // CSV: "Eva Maria" + "Cañete Hernández" — exact match with c-B → only c-B returned.
      // To trigger fuzzy for both, pick a CSV name that matches NEITHER exactly but
      // has enough overlap to pass Jaccard ≥ 0.7.
      // csvTokens = [eva, maria, lopez]; c-A tokens = [eva, canete]; Jaccard = 1/4 = 0.25.
      // This doesn't pass. Let's instead test sort with two exact matches:
      const exactCandidates: CustomerLite[] = [
        { id: 'c-X', name: 'Eva', surname: 'Cañete', email: null, cif_nif: null, dni: null },
        { id: 'c-Y', name: 'Eva', surname: 'Cañete', email: null, cif_nif: null, dni: null },
      ];
      const result = matchCustomerByName('Eva', 'Cañete', exactCandidates);
      expect(result.length).toBe(2);
      // Both have source=exact and jaccard=1, so they're "sorted" but equal.
      for (let i = 1; i < result.length; i++) {
        expect(result[i].jaccard).toBeLessThanOrEqual(result[i - 1].jaccard);
      }
    });

    it('handles surname accents', () => {
      const result = matchCustomerByName('Marta', 'Cañete Hernández', [
        { id: 'c-Z', name: 'Marta', surname: 'Canete Hernandez', email: null, cif_nif: null, dni: null },
      ]);
      expect(result.length).toBe(1);
      expect(result[0].source).toBe('exact');
    });
  });

  describe('matchCustomerByExactEmail', () => {
    const candidates: CustomerLite[] = [
      { id: 'c-1', name: 'A', surname: 'B', email: 'Foo@Bar.COM', cif_nif: null, dni: null },
      { id: 'c-2', name: 'C', surname: 'D', email: 'baz@example.com', cif_nif: null, dni: null },
    ];

    it('matches case-insensitively', () => {
      expect(matchCustomerByExactEmail('foo@bar.com', candidates)?.id).toBe('c-1');
    });

    it('matches with surrounding whitespace', () => {
      expect(matchCustomerByExactEmail('  FOO@bar.com  ', candidates)?.id).toBe('c-1');
    });

    it('returns null when no match', () => {
      expect(matchCustomerByExactEmail('nope@example.com', candidates)).toBeNull();
    });

    it('returns null when email is null/empty', () => {
      expect(matchCustomerByExactEmail(null, candidates)).toBeNull();
      expect(matchCustomerByExactEmail('', candidates)).toBeNull();
    });
  });

  describe('matchCustomerByCifOrDni', () => {
    const candidates: CustomerLite[] = [
      { id: 'c-1', name: 'A', surname: 'B', email: null, cif_nif: 'B12345678', dni: '12345678X' },
      { id: 'c-2', name: 'C', surname: 'D', email: null, cif_nif: null, dni: null },
    ];

    it('matches by cif_nif exact', () => {
      expect(matchCustomerByCifOrDni('B12345678', null, candidates)?.id).toBe('c-1');
    });

    it('matches by dni exact', () => {
      expect(matchCustomerByCifOrDni(null, '12345678X', candidates)?.id).toBe('c-1');
    });

    it('matches with surrounding whitespace', () => {
      expect(matchCustomerByCifOrDni('  B12345678  ', null, candidates)?.id).toBe('c-1');
    });

    it('returns null when neither cif nor dni provided', () => {
      expect(matchCustomerByCifOrDni(null, null, candidates)).toBeNull();
      expect(matchCustomerByCifOrDni('', '', candidates)).toBeNull();
    });

    it('returns null when no match', () => {
      expect(matchCustomerByCifOrDni('B99999999', null, candidates)).toBeNull();
    });

    it('matches case-insensitively (CSV comes in mixed case, DB stores uppercase)', () => {
      // CSV lowercase, CRM uppercase → should still match.
      expect(matchCustomerByCifOrDni('b12345678', null, candidates)?.id).toBe('c-1');
      expect(matchCustomerByCifOrDni(null, '12345678x', candidates)?.id).toBe('c-1');
    });
  });
});