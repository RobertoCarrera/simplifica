# Tasks: feedback-via-webmail

## Phase 1: Database & Storage

- [x] **1.1**: Create migration `20260425000001_create_company_feedback.sql` with `company_feedback` table (id, company_id, user_id, user_email, type, description, location, screenshot_url, mail_message_id, status, created_at, updated_at). Include RLS policies.
  - File: `supabase/migrations/20260425000001_create_company_feedback.sql`
  - Verification: Migration runs without error; table exists in DB

- [x] **1.2**: Create migration `20260425000002_create_feedback_storage_bucket.sql` for `feedback_attachments` bucket (public=false, file_size_limit=1MB, allowed_mime_types=[image/jpeg,image/png,image/webp]). Add storage RLS policies.
  - File: `supabase/migrations/20260425000002_create_feedback_storage_bucket.sql`
  - Verification: Bucket exists in Supabase Storage; uploads succeed under 1MB

## Phase 2: Edge Function

- [x] **2.1**: Refactor `feedback/index.ts` to replace SES logic with: (a) Supabase auth.getUser() from JWT, (b) insert `company_feedback` record, (c) upload screenshot to `feedback_attachments` bucket, (d) find superadmin mail_account, (e) insert mail_message with `metadata.reply_to=user_email`, (f) update feedback status.
  - Files: `supabase/functions/feedback/index.ts` (root) and `simplifica-crm/supabase/functions/feedback/index.ts`
  - Verification: Edge Function returns success; DB has new `company_feedback` row and `mail_messages` row

- [x] **2.2**: Mirror refactored `feedback/index.ts` to `simplifica-crm/supabase/functions/feedback/index.ts` (duplicate edge function)
  - Files: `simplifica-crm/supabase/functions/feedback/index.ts`
  - Verification: Same behavior as root function

## Phase 3: Frontend

- [x] **3.1**: Update `feedback-modal.component.ts` to check `mail_accounts` on init; block widget + show Spanish error if no account configured; remove `userEmail` from payload.
  - File: `simplifica-crm/src/app/shared/feedback/feedback-modal.component.ts`
  - Verification: Widget hidden/blocked for users without mail_account; payload has no userEmail field

- [ ] **3.2**: Add unit test verifying widget blocks without mail_account (mock empty mail_accounts list).
  - Deferred: No TDD infrastructure for this component.
  - File: `simplifica-crm/src/app/shared/feedback/feedback-modal.component.spec.ts`
  - Verification: Test passes

## Phase 4: Webmail Reply-To Support

- [x] **4.1**: Update `message-detail.component.ts` reply logic to read `msg.metadata?.reply_to` and use it as `to` address when replying; fall back to `msg.from?.email`.
  - File: `simplifica-crm/src/app/features/webmail/components/message-detail/message-detail.component.ts`
  - Verification: Clicking Reply on a feedback email populates user's email (not noreply@) in composer TO field

## Phase 5: Integration Verification

- [ ] **5.1**: Run both migrations sequentially; verify `company_feedback` table and `feedback_attachments` bucket exist.
  - Verification: Query DB: `SELECT * FROM company_feedback LIMIT 1;` succeeds; Storage bucket visible

- [ ] **5.2**: E2E smoke test — submit feedback with screenshot; verify admin inbox receives it and can Reply to the user.
  - Verification: Mail message in admin inbox has `metadata.reply_to` set to submitter's email; Reply composer pre-fills user's email
