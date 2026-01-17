## 2025-02-27 - Accessibility Patterns in Admin Dashboard
**Learning:** Many icon-only buttons (FABs, sorting, pagination) rely solely on `title` or visual cues, lacking `aria-label`. This is a common pattern in the `data-table` and customer list components.
**Action:** Systematically check for `<button><i class="..."></i></button>` patterns and ensure they have `aria-label`. Also, `aria-current` is often missing from pagination.

## 2025-02-27 - Verification Constraints
**Learning:** Protected routes (Guards) block headless Playwright verification without credentials.
**Action:** For future UX tasks, prioritize verifying shared components in isolation or rely on code review for protected route templates if mocking auth is not feasible.
