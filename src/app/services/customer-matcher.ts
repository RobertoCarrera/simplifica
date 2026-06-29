// ──────────────────────────────────────────────────────────────────────
// Customer matcher — shared fuzzy name matcher
// ──────────────────────────────────────────────────────────────────────
// Lifted from the Doctoralia wizard's resolveClient() (round 3 of that
// change) into a standalone, framework-free module so the new
// "Clientes (Asistente con revisión)" wizard can reuse the same logic
// for likely-duplicate detection.
//
// Algorithm (mirrors resolveClient pass 3 in
// doctoralia-bookings-import.service.ts):
//   1. Exact normalized (firstName + surname) equality.
//   2. Token-set Jaccard ≥ 0.7 with "apellido anchor" — every token of
//      the CSV's surname must appear in the candidate's surname tokens.
//      This prevents "Marc" from matching "Marc Antoni" when the CSV
//      surname field doesn't include "Antoni".
//
// Returned candidates are sorted by Jaccard similarity descending.
// ──────────────────────────────────────────────────────────────────────

/**
 * Lightweight client shape used by the matcher. Mirrors `ClientLite` in
 * `doctoralia-bookings-import.service.ts` but is a separate export so
 * the customer wizard can evolve independently. `cif_nif` is included
 * because the customer wizard uses it as an exact-match key (in
 * addition to email).
 */
export interface CustomerLite {
  id: string;
  name: string;
  surname: string | null;
  email: string | null;
  cif_nif: string | null;
  dni: string | null;
  /** Optional: company id for scoping. The matcher itself does not filter
   *  by company — callers should pre-filter the candidates array. */
  company_id?: string;
}

/** Accent-stripped, lowercased, whitespace-collapsed form of a name. */
export function normalizePersonName(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Token set of a normalized name, split on whitespace. */
export function tokensOfName(s: string | null | undefined): Set<string> {
  return new Set(normalizePersonName(s).split(' ').filter(Boolean));
}

/** Jaccard similarity: |A ∩ B| / |A ∪ B|. Returns 0 for two empty sets. */
export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  const inter = new Set([...a].filter((t) => b.has(t)));
  const union = new Set([...a, ...b]);
  return union.size === 0 ? 0 : inter.size / union.size;
}

/** A scored match candidate, sorted by jaccard descending. */
export interface CustomerMatchCandidate {
  client: CustomerLite;
  /** Full-name Jaccard between the CSV's normalized name and the
   *  candidate's combined name + surname tokens. */
  jaccard: number;
  /** True iff every token of the CSV's surname appears in the candidate's
   *  surname tokens. This is the "apellido anchor" — the safety net
   *  against cross-person false positives. */
  apellidoMatches: boolean;
  /** Which match strategy produced this candidate. */
  source: 'exact' | 'fuzzy';
}

/**
 * Match a CSV's (firstName, lastName) against a list of CRM clients.
 *
 * Returns candidates sorted by Jaccard descending. The caller decides
 * what to do with the result:
 *   - 0 candidates → "unresolved" (user must create new)
 *   - 1 candidate with source='exact' → "matched" (auto-link)
 *   - 1 candidate with source='fuzzy' → "matched" if confident (caller decides)
 *   - N > 1 → "ambiguous" (user picks)
 *
 * Does NOT consider email or cif_nif matching here — those are
 * exact-match keys handled separately by the wizard's classify step
 * (see classifyCustomerRow in supabase-customers.service.ts).
 *
 * @param csvFirstName The first name from the CSV row.
 * @param csvLastName The surname from the CSV row.
 * @param candidates CRM clients to match against. Caller is responsible
 *                   for pre-filtering by company_id (if applicable) and
 *                   by deleted_at IS NULL.
 */
export function matchCustomerByName(
  csvFirstName: string | null | undefined,
  csvLastName: string | null | undefined,
  candidates: CustomerLite[],
): CustomerMatchCandidate[] {
  const firstN = normalizePersonName(csvFirstName);
  const lastN = normalizePersonName(csvLastName);
  if (!firstN || !lastN) return [];

  // Pass 1: exact normalized equality on (first + last).
  const exactMatches = candidates.filter(
    (c) =>
      normalizePersonName(c.name) === firstN &&
      normalizePersonName(c.surname) === lastN,
  );
  if (exactMatches.length > 0) {
    return exactMatches.map((client) => ({
      client,
      jaccard: 1,
      apellidoMatches: true,
      source: 'exact' as const,
    }));
  }

  // Pass 2: fuzzy Jaccard ≥ 0.7 with apellido anchor.
  const csvTokens = tokensOfName(`${csvFirstName} ${csvLastName}`);
  const csvSurnameTokens = tokensOfName(csvLastName);
  const scored: CustomerMatchCandidate[] = candidates
    .map((client) => {
      const crmNameTokens = tokensOfName(client.name);
      const crmSurnameTokens = tokensOfName(client.surname);
      const fullJaccard = jaccardSimilarity(
        csvTokens,
        new Set([...crmNameTokens, ...crmSurnameTokens]),
      );
      const apellidoMatches = [...csvSurnameTokens].every((t) =>
        crmSurnameTokens.has(t),
      );
      return { client, jaccard: fullJaccard, apellidoMatches, source: 'fuzzy' as const };
    })
    .filter((x) => x.apellidoMatches && x.jaccard >= 0.7)
    .sort((a, b) => b.jaccard - a.jaccard);

  return scored;
}

/**
 * Exact match a CSV's email (case-insensitive, trimmed) against a list
 * of CRM clients. Returns at most one match (the first one found), or null.
 * Caller is responsible for pre-filtering by company_id.
 */
export function matchCustomerByExactEmail(
  csvEmail: string | null | undefined,
  candidates: CustomerLite[],
): CustomerLite | null {
  const norm = normalizePersonName(csvEmail); // accent + case + trim
  if (!norm) return null;
  return candidates.find((c) => normalizePersonName(c.email) === norm) ?? null;
}

/**
 * Exact match a CSV's cif_nif / dni against a list of CRM clients.
 * Returns at most one match, or null. Caller pre-filters by company_id.
 * Only considers non-null, non-empty values.
 *
 * Case-insensitive: the import_customers_batch RPC uppercases the value
 * on insert (so the DB always stores "B12345678"), but CSVs come in mixed
 * case. Normalizing to UPPER before comparing avoids false negatives.
 */
export function matchCustomerByCifOrDni(
  cif: string | null | undefined,
  dni: string | null | undefined,
  candidates: CustomerLite[],
): CustomerLite | null {
  const normCif = (cif ?? '').trim().toUpperCase();
  const normDni = (dni ?? '').trim().toUpperCase();
  if (!normCif && !normDni) return null;
  return (
    candidates.find((c) => {
      const cCif = (c.cif_nif ?? '').trim().toUpperCase();
      const cDni = (c.dni ?? '').trim().toUpperCase();
      if (normCif && cCif === normCif) return true;
      if (normDni && cDni === normDni) return true;
      return false;
    }) ?? null
  );
}