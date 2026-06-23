/**
 * Escape user input for safe use in PostgREST `.ilike()` filters.
 *
 * Rafter v0.46 — ports the Deno `escapeLike()` helper from
 * `supabase/functions/_shared/security.ts` to the Angular frontend.
 * The v0.20 SECDEF/SQLi fixes applied this helper in 16 EF callsites
 * but never ported it to the frontend, leaving 20 callsites in `src/`
 * exposed to LIKE wildcard injection.
 *
 * Background (Rafter v0.46):
 *   PostgREST parameter-binds `.ilike()` values, so this is NOT
 *   classical SQL injection. However, raw `%` / `_` / `\` in user
 *   input can cause unintended row matches (information leakage
 *   beyond RLS-granted scope). This helper escapes those three
 *   characters.
 *
 * SECURITY CONTRACT:
 *   - EVERY user-controlled string interpolated into `.ilike()` or
 *     inside `%...%` in `.or()` filters MUST go through `escapeLike()`.
 *   - Use `escapeLikeForOr()` for the right side of `.or()` filters
 *     that use `.ilike.%...%` syntax (the `%`/`_`/`\` chars are
 *     inside the value, not the column).
 *
 * Matches Deno `supabase/functions/_shared/security.ts:escapeLike` byte-for-byte.
 */

export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Escape user input for use INSIDE `%...%` wildcards in `.or()` filters.
 *
 * Example:
 *   .or(`name.ilike.%${escapeLikeForOr(filters.search)}%,email.ilike.%${escapeLikeForOr(filters.search)}%`)
 *
 * Note: `.or()` does NOT parameter-bind its contents. To prevent
 * PostgREST filter injection (e.g. user input containing `,` or `.`
 * that breaks out of the filter syntax), escape the PostgREST
 * metacharacters too.
 *
 * For maximum safety, also wrap in escapeOrFilterValue() which strips
 * all PostgREST filter operators (`,`, `.`, `(`, `)`, `:`, `~`, `@`, `+`,
 * `-`, `*`, `?`).
 */
export function escapeOrFilterValue(input: string): string {
  return input
    // LIKE wildcards
    .replace(/[\\%_]/g, (c) => `\\${c}`)
    // PostgREST filter operators
    .replace(/[,().@~+:*?]/g, '');
}
