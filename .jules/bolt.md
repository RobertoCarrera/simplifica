## 2025-02-18 - Sorting Performance Anti-Pattern
**Learning:** Using `toLowerCase()` inside a sort comparator function is an anti-pattern (O(N log N) allocations).
**Action:** Use `Intl.Collator` which handles case-insensitivity efficiently without creating intermediate strings.
