## 2024-05-23 - Regex Instantiation in Hot Paths
**Learning:** Creating `RegExp` objects inside functions called from templates (like `getDisplayName` in an `*ngFor` loop) causes unnecessary allocation and garbage collection pressure on every change detection cycle.
**Action:** Define static regex patterns as top-level `const` or `static readonly` class members.
