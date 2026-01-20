## 2025-02-18 - Intl.Collator for Sorting
**Learning:** Using `toLowerCase()` inside a sort comparator (O(n log n)) creates excessive string allocations. `Intl.Collator` is not only 7x faster but also correctly handles Spanish accents (e.g., 'Á' vs 'Z').
**Action:** Always prefer `Intl.Collator` for user-facing string sorting, especially in `computed` signals that re-evaluate often.
