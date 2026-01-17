## 2024-05-22 - Missing trackBy in ngFor loops
**Learning:** The codebase has many `*ngFor` loops iterating over large lists without `trackBy` functions, causing unnecessary DOM re-creation.
**Action:** Systematically add `trackBy` to `*ngFor` loops, especially for lists backed by Signals or Observables that might emit new references.
