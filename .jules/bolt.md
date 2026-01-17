# Bolt's Performance Journal

## 2024-05-23 - ISO Date Sorting Optimization
**Learning:** `new Date(string).getTime()` inside sort comparators is a major bottleneck (O(N log N) instantiations). For ISO 8601 strings (like Supabase `created_at`), simple string comparison (`localeCompare` or `<`, `>`) yields identical results but is ~15x faster.
**Action:** Always prefer string comparison for sorting ISO date strings. Verify format is strictly ISO 8601 (YYYY-MM-DDTHH:mm:ss.sssZ) before applying.

## 2024-05-23 - Intl.Collator Reuse
**Learning:** `new Intl.Collator()` is expensive. Instantiating it inside a sort callback destroys performance.
**Action:** Instantiate `Intl.Collator` once outside the sort loop (e.g. in the computed signal or top-level constant) and reuse it.
