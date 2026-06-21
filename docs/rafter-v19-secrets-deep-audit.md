# Rafter Secrets Deep Audit — simplifica-crm

**Date**: 2026-06-22
**Auditor**: rafter-secrets-deep-audit (3rd iteration)
**Source**: `C:/Users/puchu/AppData/Local/Temp/rafter-secrets-deep-audit-2026-06-21.md` (full report, NOT committed)
**Scope**: `F:/simplifica/simplifica-crm` — git remote `github.com/RobertoCarrera/simplifica` (**PUBLIC**, 1,622+ commits on `main`)
**Method**: ripgrep pattern scans + git log diff scan + manual review of `.gitignore`, Angular environments, `supabase/config.toml`, package.json scripts, and git history.

> **SECURITY NOTE**: This document is a **sanitized summary**. All secret VALUES are redacted. The full audit with raw values lives only in the user's local temp folder and must NEVER be committed to any repo.

---

## Findings Summary

| # | Severity | Secret Type | Location | In gitignore? | In git history? | Status |
|---|----------|-------------|----------|---------------|-----------------|--------|
| 1 | **CRITICAL** | Supabase `service_role` JWT (current, active, ~50-year lifetime) | `F:simplificatemp_keys.json` + `F:temp_keys.json` (Windows colon-filenames) | NO (`:` cannot match `.gitignore`) | NO (git refuses `:` filenames) | **DELETED 2026-06-22** |
| 2 | **CRITICAL** | Supabase `sb_secret_*` service_role secret + `sbp_*` Management API token + JWT_TOKEN | `.env.local.remote` (added `32b6cfdf` 2025-12-24, removed `680951da` 2025-12-28) | N/A (file removed) | **YES** — recoverable via `git show 32b6cfdf:.env.local.remote` | Content persists on PUBLIC repo |
| 3 | **MEDIUM** | CORS misconfig flag `ALLOW_ALL_ORIGINS=true` | `.env.local:5` | YES | NO | On disk only, but security issue |
| 4 | **LOW** (informational) | Supabase `sb_publishable_*` anon/publishable key (DESIGNED PUBLIC) | `src/environments/environment.ts:10`, `environment.prod.ts:11`, `.env.local:5` | `.env.local` yes; environments no (intentional) | YES (environments) | Expected — protected by RLS |
| 5 | **LOW** | Service_role secret key **prefix** disclosure | `F:temp_keys.json` (prefix only — Supabase redacts middle) | NO | NO | **Files deleted 2026-06-22** |

---

## Finding #1 — CRITICAL: Active service_role JWT on disk (RESOLVED)

- **File**: `F:/simplifica/simplifica-crm/F:simplificatemp_keys.json` AND `F:/simplifica/simplifica-crm/F:temp_keys.json`
- **Size**: 1968 bytes each, byte-identical (SHA256 `33fb9f94…`), created 2026-04-11
- **Secret**: Supabase legacy JWT with `role: service_role`, `ref: ufutyjbqfjrlzkprvyvs`, `iat: 2025-11-05`, `exp: 2077-11-05` (**~50 year lifetime**)
- **Co-located secrets**: current `sb_publishable_*` key, prefix of `sb_secret_CP_7Q…`, prefix of `sb_secret_NjQNQ…` (named `portal_cross_project`)
- **Why gitignore couldn't help**: Windows filenames containing `:` are not addressable by `.gitignore` patterns. Git refuses to track them.
- **Resolution 2026-06-22**:
  - Files deleted from disk.
  - `.gitignore` strengthened with `*temp_keys*`, `*.env.local.*`, `**/secrets.json`, `**/credentials.json`.
  - Note: `.gitignore` still CANNOT match filenames containing `:` — root-cause is that the user redirected output like `> F:\temp\keys.json` on Windows without proper path escaping, creating a literal `F:simplificatemp_keys.json` in the CWD.
- **Exploitation risk** (had it been found by an attacker with disk access): full DB/storage/auth admin, RLS bypass, cross-project lateral access.

## Finding #2 — CRITICAL: Secrets in git history on PUBLIC repo (OUTSTANDING)

- **Commit range**: added `32b6cfdf` (2025-12-24) → removed `680951da` (2025-12-28). **4-day exposure window** on a PUBLIC repo.
- **Recoverable credentials**:
  - `SUPABASE_SERVICE_ROLE_KEY` — legacy `sb_secret_*` for project `ufutyjbqfjrlzkprvyvs`
  - `SUPABASE_ACCESS_TOKEN` — Management API PAT (`sbp_*` prefix) — gives **programmatic control of the entire Supabase org** (can re-extract rotated keys unless THIS PAT is also revoked)
  - `SUPABASE_ANON_KEY` — `sb_publishable_*` (rotated since)
  - `JWT_TOKEN` — long-lived bearer token used for CLI/CI
- **Exploitability**: Anyone with `git clone` access today can run `git show 32b6cfdf:.env.local.remote` and recover all values. Public repo = no authentication barrier.
- **Recommendation**: see `docs/SECRETS_ROTATION_CHECKLIST_2026-06-22.md`. **Action required from user** — code cannot rotate Supabase secrets via API.
  - Rotate service_role secret (data-plane).
  - **Revoke Management API PAT** (sbp_...) — this is the more dangerous of the two.
  - Audit Supabase logs since 2025-12-24.
  - Decide on `git filter-repo` history rewrite (breaks forks).
  - Enable GitHub Secret Scanning + Push Protection.

## Finding #3 — MEDIUM: `ALLOW_ALL_ORIGINS=true` (OUTSTANDING)

- **Location**: `simplifica-crm/.env.local:5`
- **Severity**: Configuration, not a credential. Risk depends on whether the flag is honored in production.
- **Recommendation**: Confirm this is dev-only. If honored in production, **CRITICAL** — restrict to known origins.

## Finding #4 — LOW (informational): Publishable key in committed Angular environments

- **Locations**: `src/environments/environment.ts:10`, `src/environments/environment.prod.ts:11`
- **Status**: Expected. The publishable key is designed to be public and ships in the browser JS bundle. RLS is the real protection layer.
- **Recommendation**: None — architecture is correct.

## Finding #5 — LOW: Secret prefix disclosure (RESOLVED)

- Same files as Finding #1. Supabase's API only shows prefix + suffix + hash, so full secret was not exposed — only enough to correlate which secret it is.
- **Resolution**: Files deleted 2026-06-22 (same as Finding #1).

---

## Clean Checks (no real secret findings)

- AWS keys (`AKIA…`, `ASIA…`): 0 matches in tree and history.
- Stripe live/test keys: only UI placeholders and code that validates prefix format. Safe.
- Google API keys (`AIza…`): 0 matches. `environment.ts:34` has `googlePickerApiKey: ""` (empty placeholder).
- GitHub PAT, Slack tokens, OpenAI `sk-…`: 0 matches.
- JWT patterns (`eyJhbGciOi…`): only matched in temp_keys files (already covered).
- `supabase/config.toml`: all sensitive values use `env(VAR_NAME)` substitution. No hardcoded secrets.
- `package.json` scripts: no `env $(cat .env …)` or process-listing leaks.
- `.github/workflows/`: does not exist (only `.github/copilot-instructions.md` + `.github/skills/pentest/SKILL.md`).
- `vercel.json`: only domain names and security headers.
- `scripts/generate-runtime-config.mjs` + `scripts/generate-vapid-keys.mjs`: no embedded keys.

---

## Remediation Status

| Action | Status | Owner | Notes |
|--------|--------|-------|-------|
| Delete `F:simplificatemp_keys.json` + `F:temp_keys.json` | **DONE 2026-06-22** | automated | Files were untracked, on disk only |
| Strengthen `.gitignore` (`*temp_keys*`, `*.env.local.*`, `**/secrets.json`, `**/credentials.json`) | **DONE 2026-06-22** | automated | Note: `.gitignore` can't match filenames with `:` |
| Save sanitized audit report in `docs/` | **DONE 2026-06-22** | automated | This file |
| Save rotation checklist in `docs/` | **DONE 2026-06-22** | automated | See `SECRETS_ROTATION_CHECKLIST_2026-06-22.md` |
| Rotate Supabase service_role secret | **PENDING** | user | Cannot be done via code |
| Revoke Supabase Management API PAT | **PENDING** | user | Cannot be done via code |
| Audit Supabase logs since 2025-12-24 | **PENDING** | user | Manual via dashboard |
| Rewrite git history with `git filter-repo` | **PENDING** | user | Breaks forks — user's call |
| Enable GitHub Secret Scanning + Push Protection | **PENDING** | user | Repo is currently PUBLIC without these |
| Add CI step: `gitleaks detect` / `trufflehog filesystem` | **PENDING** | user | |
| Verify `ALLOW_ALL_ORIGINS` does not apply in production | **PENDING** | user | |

---

## Statistics

- **Total findings**: 5 (2 CRITICAL + 1 MEDIUM + 2 LOW)
- **Resolved automatically 2026-06-22**: Findings #1, #5 (local file cleanup)
- **Outstanding (require user action)**: Findings #2, #3 (and post-rotation: history rewrite + CI hardening)

---

*Generated from rafter-secrets-deep-audit 2026-06-21. Sanitized for repo storage — no secret values included.*
