## 2024-05-22 - Angular List Optimization
**Learning:** Even simple list components can be significant bottlenecks if `OnPush` and `trackBy` are missing. Signals make `OnPush` implementation trivial as they handle the dirty marking automatically.
**Action:** Always check `*ngFor` loops in list components for `trackBy`, especially if they use Signals but default change detection.
