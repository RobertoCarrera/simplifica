
## 2026-01-18 - Unused Components Accessibility
**Learning:** Several shared UI components (`BtnNewComponent`, `ThemeSelectorComponent`, `DataTableComponent`) are present in the codebase but appear unused and unmaintained, leading to accessibility gaps (missing ARIA labels) and even broken tests, despite a passing production build.
**Action:** When auditing for accessibility, check `shared/ui` components even if they don't appear in the main navigation; improving them ensures future-proofing. However, be aware they might have broken dependencies.
