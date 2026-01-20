## 2024-05-22 - String Sorting Optimization
**Learning:** `Intl.Collator` is ~2x faster than `toLowerCase()` for sorting strings (verified: 19ms vs 41ms for 10k items).
**Action:** Always prefer `Intl.Collator` for client-side sorting of potentially large lists, especially when locale sensitivity is needed (Spanish).
