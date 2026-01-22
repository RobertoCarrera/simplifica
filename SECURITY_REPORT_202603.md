# Security Report - March 2026

## Executive Summary
This report outlines the findings from the recurring security audit performed on the "Simplifica" CRM repository. The audit focused on RLS policies, Edge Functions, and financial logic.

## Findings

### 1. `process-inbound-email` Edge Function (CRITICAL)
- **Description**: The function accepts POST requests with email data and inserts them into the database using `SUPABASE_SERVICE_ROLE_KEY`. It lacks any authentication or authorization mechanism.
- **Risk**: An attacker can inject arbitrary emails into any user's inbox by guessing the target email address, leading to phishing, spam, or data corruption.
- **Location**: `supabase/functions/process-inbound-email/index.ts`
- **Mitigation**: Implement `WEBHOOK_SECRET` verification (e.g., checking `x-webhook-secret` header).

### 2. `verifactu-dispatcher` Edge Function (HIGH)
- **Description**: The function contains several debug actions (`debug-test-update`, `debug-env`, `debug-last-event`, `diag`) that are accessible to the caller. These endpoints leak environment configuration (including partial keys) and allow database manipulation.
- **Risk**: Information disclosure and potential integrity violation. Although the function is likely internal, exposing these endpoints increases the attack surface if the URL is leaked or if the function is accidentally made public.
- **Location**: `supabase/functions/verifactu-dispatcher/index.ts`
- **Mitigation**: Remove all debug endpoints.

### 3. `bookings` RLS (MEDIUM)
- **Description**: The `bookings` and related tables (`booking_types`, `resources`) have strict RLS policies enabled, restricting access to authenticated company members.
- **Risk**: While secure for internal use, there appears to be no mechanism for public booking pages (a common feature). If this is implemented later, care must be taken to avoid opening up the tables too broadly (e.g., using `TO PUBLIC`). Currently, it acts as a functional blocker for public bookings rather than a vulnerability.
- **Location**: `supabase/migrations/20260110220000_add_bookings_module.sql`
- **Recommendation**: Ensure any public access is mediated via specific Edge Functions or strictly scoped `security definer` functions/RPCs, rather than opening table RLS.

## Action Plan
1.  Add `WEBHOOK_SECRET` validation to `process-inbound-email`.
2.  Remove debug code from `verifactu-dispatcher`.
