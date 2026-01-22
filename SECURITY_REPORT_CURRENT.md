# Security Audit Report - March 2026

## Summary
A recurring security audit was performed on the `Simplifica` CRM codebase. Critical vulnerabilities were identified in Edge Functions involving unauthenticated access to third-party APIs (AI) and database injection vectors (Email).

## Findings

### 1. `ai-request` Open Proxy (CRITICAL)
- **File:** `supabase/functions/ai-request/index.ts`
- **Issue:** The function checks for the presence of an `Authorization` header (`if (!authHeader)`) but **never validates it**. It does not create a Supabase client with the token nor call `getUser()`.
- **Impact:** Unauthenticated attackers can use this endpoint to generate content via Google Gemini, consuming the company's API quota and potentially costing money.
- **Remediation:** Implement `createClient` with the header and enforce `auth.getUser()`.

### 2. `process-inbound-email` Unauthenticated Injection (CRITICAL)
- **File:** `supabase/functions/process-inbound-email/index.ts`
- **Issue:** The function uses `SUPABASE_SERVICE_ROLE_KEY` to write to `mail_messages` but performs **no authentication** of the caller (e.g., verifying it comes from the email provider).
- **Impact:** Any attacker discovering the URL can inject arbitrary emails into user inboxes (Phishing, Spam) or corrupt thread contexts.
- **Remediation:** Implement a shared secret check (e.g., `X-Webhook-Secret`) against an environment variable.

### 3. `bookings` RLS Complexity (HIGH)
- **File:** `supabase/migrations/20260110210000_create_booking_system.sql`
- **Issue:** RLS policies rely heavily on `public.company_members`. While functionally secure for internal access, the `booking_types` policy explicitly notes that public access (for external booking pages) is missing, which will likely lead to "quick fix" policy removal later if not addressed properly.
- **Impact:** Potential future security regression or current functional blocker.

### 4. `booking-manager` Implementation Stubs (LOW)
- **File:** `supabase/functions/booking-manager/index.ts`
- **Issue:** The function contains stubbed logic (`// Stub`) and returns success without performing actions.
- **Impact:** Misleading system behavior; logic verification impossible.

## Recommended Action Plan
1. **Immediate Fix:** Patch `ai-request` to enforce valid Supabase User sessions.
2. **Immediate Fix:** Secure `process-inbound-email` with a webhook secret.
