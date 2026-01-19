## 2025-05-20 - Blocking Alerts in UI Components
**Learning:** Found `alert()` calls embedded in UI component logic (`BtnNewComponent`) for navigation debugging. This halts the browser thread and creates a poor user experience.
**Action:** Replace all `alert()` calls with proper logging or non-blocking UI notifications (toasts) in future components. Ensure debugging code is stripped before commit.
