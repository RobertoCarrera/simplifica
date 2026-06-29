# Security Grep Guard (Rafter v0.56)

Four Perl grep scripts under `scripts/` catch the XSS and SQLi patterns that
bit us in v0.45 (Edge Function XSS) and v0.46 (frontend PostgREST filter
injection). The same scripts run in CI and locally via lefthook — if any
script reports a violation, the commit (and the CI build) is blocked.

| Script                          | Scope                       | Catches                                                            |
| ------------------------------- | --------------------------- | ------------------------------------------------------------------ |
| `check-xss-efs.pl`              | `supabase/functions/**/*.ts` | `html:` / `html_body:` template literals interpolating user fields without `escapeHtml()` |
| `check-or-sqli.pl`              | `src/app/**/*.ts`           | `.or(\`...${var}...\`)` PostgREST filter injection               |
| `check-ilike-sqli.pl`           | `src/app/**/*.ts`           | `.ilike('col', \`...${var}...\`)` LIKE wildcard injection          |
| `check-xss-frontend.pl`         | `src/app/**/*.ts`           | Angular `[innerHTML]`, `bypassSecurityTrust*`, `.innerHTML =`, `document.write` on raw values |

## Run locally

```bash
perl scripts/check-xss-efs.pl
perl scripts/check-or-sqli.pl
perl scripts/check-ilike-sqli.pl
perl scripts/check-xss-frontend.pl
```

Each script exits non-zero if it finds a violation and prints the file:line
to stderr.

## Install the pre-commit hook

The repo uses [lefthook](https://github.com/evilmartians/lefthook) — a
single-binary Go-based git hooks manager (no Node dependency).

```bash
brew install lefthook
lefthook install
```

`lefthook install` wires up the config in `lefthook.yml`. From then on,
every `git commit` runs the 4 grep scripts against staged files before
the commit lands. `stage_fixed: true` means the hook only re-runs against
staged files, not the whole repo, for sub-second feedback.

If the hook blocks a commit you believe is a false positive, fix the
code rather than skipping the hook — false positives are usually a sign
that the variable name doesn't make its sanitisation obvious (rename
`html` → `sanitizedHtml`, wrap with `DOMPurify.sanitize(...)`, etc.).
The patterns are tuned to pass on every currently-safe callsite in
`src/app/`.

## CI

`.github/workflows/security-grep.yml` runs the same 4 scripts on every
PR and push to `main`. The Summary step at the bottom fails the build
if any individual step is not `success`.

## Adding a new pattern

If a new class of XSS / SQLi vector emerges:

1. Add a new pattern to the most relevant script in `scripts/`.
2. Verify the script still passes on `main`: `perl scripts/check-*.pl`.
3. Update this doc's table with the new entry.
4. Update the lefthook and CI workflow if you add a new script.