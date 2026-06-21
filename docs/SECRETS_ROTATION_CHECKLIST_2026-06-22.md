# URGENT: Secrets Rotation Checklist — simplifica-crm

**Created**: 2026-06-22
**Triggered by**: `docs/rafter-v19-secrets-deep-audit.md` (2 CRITICAL findings)
**Audience**: repo owner (Roberto) — must execute manually; **code cannot rotate Supabase secrets via API**.

---

## Background

A rafter secrets audit on 2026-06-21 found two CRITICAL secret exposures affecting the live Supabase project `ufutyjbqfjrlzkprvyvs.supabase.co` and the PUBLIC GitHub repo `github.com/RobertoCarrera/simplifica`:

1. **Active `service_role` JWT** (50-year lifetime) sitting on disk in `F:simplificatemp_keys.json` and `F:temp_keys.json` — **files have been deleted 2026-06-22, but the secrets themselves are still valid and must be rotated**.
2. **Git history leak** — commit `32b6cfdf` (2025-12-24) added `.env.local.remote` with real secrets (including a Management API PAT), removed 4 days later in `680951da`. Content persists in git history on the PUBLIC repo. Anyone with `git clone` access today can recover the values.

---

## 1. Local cleanup (already done — verify)

- [x] ~~Delete `F:\simplifica\simplifica-crm\F:simplificatemp_keys.json`~~ — **DELETED 2026-06-22**
- [x] ~~Delete `F:\simplifica\simplifica-crm\F:temp_keys.json`~~ — **DELETED 2026-06-22**
- [x] ~~Verify they're not in git~~ — **VERIFIED NOT TRACKED** (`git log --all -- '**/temp_keys*' '**/F:temp*' '**/F:simplifica*'` returned no matches across all branches/objects)
- [x] ~~Update `.gitignore` with `*temp_keys*`, `*.env.local.*`, `**/secrets.json`, `**/credentials.json`~~ — **DONE**
- [ ] **Sanitize any backups**: check OneDrive / cloud sync, IDE workspace cache (`.angular/cache`), `dist/` outputs, OS clipboard history, terminal scrollback, and any other machine that may have accessed these files.

> Caveat: `.gitignore` CANNOT match filenames containing `:` (Windows reserved character). The only real defense against this specific filename is **never redirect output to unquoted Windows paths**. If a similar filename is created in the future, git will not track it, but it WILL sit on disk unprotected.

---

## 2. Rotate Supabase secrets (USER ACTION REQUIRED — via Dashboard)

> **Cannot be done by code.** Sign in at <https://supabase.com/dashboard> with the account that owns the project.

### 2.1 Rotate legacy `service_role` JWT

- [ ] Open <https://supabase.com/dashboard/project/ufutyjbqfjrlzkprvyvs/settings/api>
- [ ] Under **Legacy API Keys**, click **Roll** next to `service_role` (secret) JWT.
- [ ] Confirm the new JWT's hash differs from the leaked one (the audit stored the old hash; the new roll will produce a different value).
- [ ] Save the new value to `.env.local` as `SUPABASE_SERVICE_ROLE_KEY=...`.
- [ ] Save it to Supabase Edge Function secrets: `supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...`.

### 2.2 Rotate new-format `sb_secret_*` keys

- [ ] Under **New API Keys** in the same dashboard page, click **Rotate** on:
  - `sb_secret_CP_7Q…` (current service_role — middle was redacted by Supabase API in the leaked file, but the prefix exposure means rotate it as a precaution)
  - `sb_secret_NjQNQ…` (named `portal_cross_project` — **lateral risk** to a related portal project; rotate even if `simplifica-crm` doesn't directly use it)
- [ ] Save new values to Edge Function secrets.

### 2.3 Revoke the Management API Personal Access Token

This is the **most dangerous** of the leaked credentials. Even after rotating data-plane keys, an attacker with this PAT can re-extract them via the Management API.

- [ ] Open <https://supabase.com/dashboard/account/tokens>
- [ ] Find the token with the leaked prefix `sbp_a588ac9e4f…` (full value is in `C:/Users/puchu/AppData/Local/Temp/rafter-secrets-deep-audit-2026-06-21.md`; last 4 chars `…f39`). Search your account tokens list for that prefix.
- [ ] Click **Revoke** / **Delete**
- [ ] If the token is still needed, generate a new one and save it ONLY to:
  - local `.env.local` (`SUPABASE_ACCESS_TOKEN=...`) — gitignored
  - CI secret store (GitHub Actions / Vercel env vars)
  - Anywhere it's actually used; audit which scripts/CI use it before re-creating.

### 2.4 Audit Supabase logs since 2025-12-24

- [ ] Open <https://supabase.com/dashboard/project/ufutyjbqfjrlzkprvyvs/logs/api> and filter for `role = 'service_role'` between 2025-12-24 → 2026-06-22.
- [ ] Look for unusual IP addresses, request volumes, or query patterns.
- [ ] Open <https://supabase.com/dashboard/project/ufutyjbqfjrlzkprvyvs/logs/postgres> for the same period; look for unexpected DDL (`CREATE`, `DROP`, `ALTER`) or bulk `SELECT *` from sensitive tables.
- [ ] Open <https://supabase.com/dashboard/project/ufutyjbqfjrlzkprvyvs/logs/auth> for signs of unauthorized user creation, password resets, or magic-link abuse.
- [ ] Open Storage logs for unexpected bucket creation or mass file uploads.
- [ ] If you find any suspicious activity: trigger your incident response plan (notify users per GDPR Art. 33 if personal data was exfiltrated, rotate DB-stored tokens, audit RLS policies).

### 2.5 Verify rotation

- [ ] After rotating, test that the OLD leaked values no longer authenticate:
  - `curl -H "Authorization: Bearer <OLD_JWT>" https://ufutyjbqfjrlzkprvyvs.supabase.co/rest/v1/users?select=*` should return 401.
- [ ] Test that the NEW values work end-to-end (login + a few critical reads).

---

## 3. Update local config + redeploy

- [ ] Update `simplifica-crm/.env.local` with new `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_URL`.
- [ ] Update `simplifica-crm/supabase/.env` (if present) with the same.
- [ ] Update Edge Function secrets: `supabase secrets set --env-file ./supabase/.env.local` (or individual `set` calls).
- [ ] Redeploy all Edge Functions: `supabase functions deploy --all`.
- [ ] Rebuild the Angular app: `pnpm build` → redeploy to Vercel.
- [ ] Smoke test: login → load dashboard → trigger one Edge Function → verify no 500s.

---

## 4. Git history (4-day exposure window on PUBLIC repo)

> This is a decision call. Both options have tradeoffs.

### Option A: Rewrite history with `git filter-repo` (recommended)

- [ ] Install `git-filter-repo` (`pip install git-filter-repo`).
- [ ] Run on a fresh clone:
  ```bash
  cd simplifica-crm
  git filter-repo --path .env.local.remote --invert-paths
  ```
- [ ] Force-push: `git push origin --force --all`.
- [ ] Notify all collaborators to re-clone (their clones still have the secret).
- [ ] Notify GitHub Support to **purge forks** (GitHub will rewrite refs in forks on request).
- [ ] Verify the blob is gone: `git rev-list --all --objects | grep -i env.local.remote` should return nothing.

### Option B: Accept the leak

- [ ] Only viable if the credentials have ALL been rotated and audit logs show no exploitation.
- [ ] Document the decision in this repo (e.g., add to `docs/security-decisions.md`).
- [ ] Compensating controls become mandatory (see step 5).

---

## 5. GitHub-side hardening (regardless of Option A or B)

- [ ] **Enable Secret Scanning**: Settings → Code security → Secret scanning → **Enabled**.
- [ ] **Enable Push Protection**: Settings → Code security → Push protection → **Enabled** (blocks pushes containing known secret patterns).
- [ ] **Enable Dependency Graph + Dependabot alerts** if not already.
- [ ] **Add CI secret scanner**: add a `.github/workflows/gitleaks.yml` workflow that runs `gitleaks detect` on every push and PR. Example:
  ```yaml
  name: gitleaks
  on: [push, pull_request]
  jobs:
    scan:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
          with:
            fetch-depth: 0
        - uses: gitleaks/gitleaks-action@v2
          env:
            GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  ```
- [ ] **Pre-commit hook** (optional, local):
  ```bash
  pip install pre-commit detect-secrets
  # Add .pre-commit-config.yaml with detect-secrets hook
  ```

---

## 6. Other items from the audit

- [ ] **`ALLOW_ALL_ORIGINS=true`** in `.env.local` — confirm this is dev-only. If honored in production, restrict to known origins (`https://app.simplificacrm.es`, `https://portal.simplificacrm.es`, Vercel preview URLs).
- [ ] **Verify RLS** on every table: `simplifica_get_advisors` security check, or manual `SELECT * FROM pg_tables WHERE schemaname='public' AND rowsecurity = false;`.
- [ ] **Service-role usage**: any server-side code calling Supabase with `service_role` should go through Edge Functions with `verify_jwt = true`, not raw HTTP calls.

---

## 7. Sign-off

When all `[ ]` items above are completed, replace with `[x]` and date the completed lines. Keep this file in `docs/` as evidence of the remediation cycle.

| Section | Completed by | Date |
|---------|--------------|------|
| Local cleanup (1) | automated | 2026-06-22 |
| Rotate Supabase secrets (2) |  |  |
| Update local config + redeploy (3) |  |  |
| Git history decision (4) |  |  |
| GitHub hardening (5) |  |  |
| Other items (6) |  |  |
