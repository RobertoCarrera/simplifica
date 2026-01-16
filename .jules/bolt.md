## 2026-01-16 - List Rendering Performance
**Learning:** `*ngFor` without `trackBy` is prevalent in the codebase, leading to unnecessary DOM re-creation during list updates.
**Action:** Always verify `*ngFor` loops in list components and add `trackBy` functions using unique identifiers (like `id`) to improve rendering performance.
