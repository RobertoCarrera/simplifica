## 2025-02-24 - View Model Pattern for Signals
**Learning:** When using Angular Signals with `OnPush` and heavy template computations (like Regex or hash generation), pre-calculating these values into a View Model during the data fetching phase significantly reduces render overhead compared to calling functions in the template. Even with `OnPush`, template functions run on every CD cycle triggered by the component.
**Action:** Always map raw data to a View Model with pre-calculated display properties before setting the signal.
