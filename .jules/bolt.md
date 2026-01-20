## 2024-05-22 - Lockfile Conflicts & List Optimization
**Learning:**
1. Vercel deployment logs can reveal "phantom" dependencies (like `@angular/service-worker` or `@tiptap/extension-bubble-menu`) that exist in the remote environment but are missing locally. To fix `ERR_PNPM_OUTDATED_LOCKFILE`, these must be added to `package.json` before regenerating the lockfile.
2. Even if a project contains `package-lock.json` or `bun.lock`, Vercel will switch to `pnpm` if it detects `pnpm-lock.yaml`. Removing the unused lockfiles prevents "Package Manager changed" warnings and potential conflicts.
**Action:** When fixing deployment lockfile errors, verify all dependencies listed in the error log are actually present in `package.json`, and ensure only one lockfile exists in the repo.
