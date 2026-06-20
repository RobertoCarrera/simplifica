# Rafter Security Audit v0.9 — SECDEFINER Analysis

**Branch**: `fix/rafter-v09-secdef-audit`
**Date**: 2026-06-20
**Author**: Roberto + AI
**Supabase project**: ufutyjbqfjrlzkprvyvs
**Status**: Analysis-only sprint. No production migrations in this PR.

---

## Executive Summary

Rafter scanned all `SECURITY DEFINER` functions in the `public` schema of the Simplifica CRM database. After v0.1–v0.5 already revoked 7 ALL-PUBLIC policies, 26 crypto/verifactu RPCs, 16 GDPR/payment/admin RPCs, and remediated 13 broken RLS policies via `is_super_admin_real()`, **127 `SECURITY DEFINER` functions remain** that do not perform an explicit `auth.uid()` check before operating.

This sprint produces **no migration**. The remediation scope is too broad and too coupled to the trigger engine, GDPR export flows, payment processing and verifactu compliance to ship as a blanket `REVOKE`. Applying strict filters (no trigger dependency, no internal helper usage, no public frontend surface) reduces the actionable list to **3 functions** that could be revoked without breaking business flows.

The remaining 124 require a per-domain incremental plan, ideally through a formal SDD change so that every revoke is paired with its dependency map (trigger graph, RPC callers, frontend invocations) and validated with regression tests before merge.

---

## Distribution by Category

The 127 functions cluster into the following business domains. Many functions belong to multiple categories (e.g. `encrypt_client_pii` is both `crypto` and `gdpr`), so totals exceed 127.

| Category | Count | Notes |
|----------|------:|-------|
| payment | 43 | Stripe + invoicing + quote flow |
| gdpr | 53 | PII access, export, right-to-be-forgotten |
| verifactu | 11 | Spanish fiscal compliance logs |
| crypto | 10 | PGP / pgcrypto helpers |
| company | 37 | Multi-tenant company data |
| crm_entity | 36 | Client / contact / lead records |
| booking | 36 | Appointments + calendar sync |
| auth_user | 35 | Roles, app_role_id, MFA |
| admin | 25 | Super-admin only operations |
| data_ops | 17 | Reporting / analytics / migrations |
| other | 121 | Mixed / internal helpers |
| trigger | 20 | **DO NOT REVOKE — Postgres engine calls them** |

> The trigger subset (functions matching `trg_*`, `fn_*`, `handle_*`, `trigger_*`) is explicitly excluded from any REVOKE plan. Revoking execute permission on a trigger function from `authenticated` would cause the underlying SQL trigger to fail at write time and silently break `INSERT`/`UPDATE`/`DELETE` on the affected tables.

---

## Functions Passing Aggressive Filter (3)

After excluding:

- trigger helpers (`trg_*`, `fn_*`, `handle_*`, `trigger_*`)
- internal helpers used by other SECDEFINER functions
- functions exposed to the public frontend surface

only 3 functions remain that would be safe to revoke from `anon` / `authenticated` without further analysis:

| Function | Signature | Reason it survives |
|----------|-----------|--------------------|
| `decrypt_client_pii` | `p_client_id uuid` | No trigger dependency, no internal helper usage, called only from authenticated UI surface |
| `encrypt_client_pii` | `p_company_id uuid, p_dni text, p_birth_date text` | Same: pure PII encryption helper, no cascading usage |
| `verifactu_log_event` | `p_event_type text, p_invoice_id uuid, p_company_id uuid, p_payload jsonb` | Verifactu audit log writes; no internal calls, no frontend callers from public pages |

Revoking these three would close the last "low hanging" SECDEFINER paths flagged by Rafter without business impact. They are intentionally **not** shipped in this PR so the rest of the analysis is reviewed first.

---

## Risk Analysis: Why NO Mass REVOKE in v0.9

Five reasons forced the decision to defer mass remediation out of v0.9:

1. **Trigger functions are off-limits.** Approximately 20 of the 127 functions back SQL triggers. Postgres invokes them as the table owner, not as the calling role. `REVOKE EXECUTE … FROM authenticated` on those functions makes the next `INSERT` / `UPDATE` raise `permission denied for function …`. Identifying them requires reading every trigger definition in the schema, not just listing functions by name.

2. **Internal helpers chain.** Many functions call other SECDEFINER functions (`A → B → C`). Revoking `C` breaks `B`, which silently breaks `A`. The dependency graph is not derivable from `pg_proc` alone; it requires reading each function body.

3. **Payment and verifactu need elevated privileges.** Stripe webhook reconciliation, AEAT verifactu stamping and signed event logging all rely on `SECURITY DEFINER` to access tables the calling user should not see directly. Tightening these requires replacing the auth model in those functions (e.g. service-role-only) — a design decision, not a permission flip.

4. **GDPR flows are user-initiated exports.** Functions like `gdpr_export_client_data` are called by authenticated users exercising their right of access. Revoking them would break compliance, not improve it. The correct fix is to ensure they `auth.uid()`-gate internally, not strip their permissions.

5. **No regression coverage.** Without per-domain integration tests, a mass `REVOKE` would ship blind. The 1924 lines of unrelated changes in the working tree (currently stashed) are evidence that this codebase is mid-refactor and not in a state where a wide revoke can be safely validated by smoke-test.

---

## Prior Sprint Summary

| Sprint | Scope | PR | Status |
|--------|-------|----|--------|
| v0.1 | Bypass Roberto elimination (frontend reads `is_super_admin` from DB) | #416 | merged |
| v0.2 | 7 ALL-PUBLIC catalog policies closed | #418 | open |
| v0.3 | 10 RPCs crypto/verifactu revoked from `anon`/`authenticated` | #418 | open |
| v0.4 | 16 RPCs GDPR/payment/admin revoked | #418 | open |
| v0.5 | 13 broken RLS policies fixed to use `is_super_admin_real()` | #418 | open |
| v0.6 | 3 Edge Functions migrated from `Access-Control-Allow-Origin: *` to `getCorsHeaders()` whitelist | #419 | open |
| v0.7 | 8 financial RLS policies moved from `roles={public}` to `roles={authenticated}` | #421 | open |
| v0.8 | Secrets hardcoded / log leaks / `vercel.json` CSP | — | no changes needed (already clean) |
| v0.9 | SECDEFINER analysis (this report) | this PR | open |

---

## Migration Files Created in Prior Sprints

All already applied to production:

- `supabase/migrations/20260619_close_public_all_policies.sql`
- `supabase/migrations/20260619_revoke_crypto_verifactu_anon.sql`
- `supabase/migrations/20260619_revoke_gdpr_payment_admin_anon.sql`
- `supabase/migrations/20260619200000_fix_rafter_v04_is_super_admin_policy_references.sql`
- `supabase/migrations/20260620_tighten_financial_rls_policies.sql`

---

## Recommended Next Steps

1. Open a formal SDD change `sdd-new rafter-v10-secdef-remediation` with this report as input. Do not skip the proposal → spec → design → tasks flow — the domain coupling is too high for ad-hoc migrations.
2. Categorize the "other" 121 functions to map internal helpers vs. external surface. This collapses the 127 into a smaller actionable set.
3. Build the trigger dependency graph: enumerate every `CREATE TRIGGER` statement and tag each SECDEFINER function as `trigger-backed`, `helper-of-trigger`, or `standalone`. Revoke only the last bucket.
4. Audit the **55 Edge Functions** that do **not** use `withSecurityHeaders()`. Roughly 13/68 currently wrap responses; the remaining 55 may leak CSP / HSTS / X-Frame-Options headers on unauthenticated paths.
5. Per-domain remediation slices (in order of risk):
   - payment (43) — biggest blast radius, ship last
   - gdpr (53) — biggest regulatory risk, ship second
   - company (37) — multi-tenant isolation, ship third
   - auth_user (35) — auth surface, ship fourth
   - admin (25) — least risky (already gated by `is_super_admin_real()`)
   - verifactu (11) + crypto (10) — keep current DEFINEER, add internal `auth.uid()` guards instead of revoke
6. Revoke the 3 standalone functions (`decrypt_client_pii`, `encrypt_client_pii`, `verifactu_log_event`) in a dedicated PR once the rest of the plan is approved.

---

## Working Tree Note

At the time of this commit the working tree contained ~1900 lines of unrelated changes to `service-variants` and `src/assets/i18n/`. They were stashed under message `WIP service-variants refactor + i18n changes - NOT related to Rafter v0.9` so this PR contains only the analysis file. Roberto should review those changes separately before deciding whether they belong on this branch or a dedicated refactor branch.

---

## Conclusion

v0.9 is a documentation and decision sprint. **No production migrations were shipped in this PR.** The 127 SECDEFINER functions require structured, per-domain remediation through a future SDD change so that every revoke is paired with its trigger graph, internal-caller map and regression tests. Until that plan exists, mass-revoking these functions would create more downtime than risk reduction.