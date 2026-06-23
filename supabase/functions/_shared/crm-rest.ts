// @ts-nocheck
// Cross-project PostgREST helper for the portal Supabase project.
//
// We CANNOT use supabase-js with `createClient(URL, key)` when `key` is a
// `sb_secret_` API key (the new Supabase secret format): the JS client wraps
// the key in a JWT-shaped payload that the PostgREST gateway no longer
// accepts as a service-role bypass. The only working pattern with `sb_secret_`
// is direct REST calls to PostgREST with the key in two headers:
//
//   apikey:        <sb_secret>
//   Authorization: Bearer <sb_secret>
//
// See: https://supabase.com/docs/guides/api/api-keys (the "secret keys" /
// "legacy" / "new API keys" section, late 2024+).
//
// All other portal functions in this project do auth + queries via
// supabase-js against the portal's own project. Only the cross-project reads
// (CRM catalog, company modules, sidebar flags) go through this helper.

const REST_HEADERS = (sbSecret: string) => ({
  apikey: sbSecret,
  Authorization: `Bearer ${sbSecret}`,
  'Content-Type': 'application/json',
});

/**
 * Lightweight PostgREST select helper. Returns `{ data, error }` matching
 * the supabase-js shape so call sites can stay uniform.
 */
export async function crmSelect(
  crmUrl: string,
  sbSecret: string,
  table: string,
  query: string, // e.g. "module_key,status&company_id=eq.6f25..."
): Promise<{ data: any[] | null; error: string | null }> {
  const url = `${crmUrl}/rest/v1/${table}?${query}`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: REST_HEADERS(sbSecret),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { data: null, error: `HTTP ${res.status}: ${body.substring(0, 200)}` };
    }
    const data = await res.json();
    return { data: Array.isArray(data) ? data : null, error: null };
  } catch (e: any) {
    return { data: null, error: e?.message ?? String(e) };
  }
}

export interface CrmEnv {
  crmUrl: string;
  crmSecret: string;
}

export function readCrmEnv(): CrmEnv | null {
  const crmUrl = Deno.env.get('CRM_SUPABASE_URL') ?? '';
  const crmSecret = Deno.env.get('CRM_SERVICE_ROLE_KEY') ?? '';
  if (!crmUrl || !crmSecret) return null;
  return { crmUrl, crmSecret };
}
