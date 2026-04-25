# Design: feedback-via-webmail

## Technical Approach

We will replace the current SES-based delivery in the `feedback` Edge Function with native internal CRM webmail delivery. The Edge Function will parse the user's JWT to securely identify them, store the feedback locally in a new `company_feedback` table, upload any screenshots to a dedicated Supabase Storage bucket, and insert a new `mail_messages` record directly into the superadmin's inbox. The frontend will be updated to require a configured email account before allowing submission, and the payload will be simplified to exclude the user's email.

## Architecture Decisions

### Decision: Internal Delivery vs SES

**Choice**: Insert directly into `mail_messages` table.
**Alternatives considered**: Send via AWS SES to `roberto@simplificacrm.es`.
**Rationale**: Direct DB insertion avoids spam filters, ensures attachments aren't blocked by external clients (like Gmail blocking inline base64 or external links), and standardizes the feedback loop within the CRM webmail.

### Decision: Payload Authentication

**Choice**: Use Supabase `auth.getUser()` with the JWT token in the Edge Function to securely retrieve the user's ID, email, and `company_id`.
**Alternatives considered**: Trust the `userEmail` passed in the request body.
**Rationale**: Security. Trusting client payload for identity allows spoofing. Extracting identity from the JWT guarantees authenticity and allows us to safely drop `userEmail` from the client payload.

### Decision: Handling Reply-To Without a Column

**Choice**: Store the user's email in `metadata.reply_to` on the `mail_messages` insert.
**Alternatives considered**: Add a `reply_to` column to `mail_messages` or use a dummy `from` address.
**Rationale**: The `mail_messages` schema currently lacks a dedicated `reply_to` column. Storing it in `metadata` safely captures the intent without requiring a schema change to core webmail tables, keeping scope manageable. Future frontend updates can utilize this metadata when generating a reply.

### Decision: Frontend Account Prerequisite

**Choice**: Query `mail_accounts` on component initialization and block the widget (show error) if none is found.
**Alternatives considered**: Allow feedback and prompt later, or block at the Edge Function level only.
**Rationale**: The spec mandates that the user MUST have an email account configured before submission. Catching this early provides a better UX and prevents failed edge function calls.

## Data Flow

```text
[Frontend Widget]
  │
  ├── 1. Check mail_accounts (block if none)
  │
  ├── 2. POST /feedback (JWT Auth, type, description, screenshot, location)
  │
[Edge Function: feedback]
  │
  ├── 3. Get User + Company ID from DB
  ├── 4. Upload screenshot to Storage (Service Role)
  ├── 5. INSERT company_feedback (status: pending)
  ├── 6. Find Superadmin mail_account & inbox folder
  ├── 7. INSERT mail_messages (internal delivery)
  ├── 8. UPDATE company_feedback (status: sent, mail_message_id)
  │
[PostgreSQL Database]
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `supabase/functions/feedback/index.ts` | Modify | Replace SES logic with Supabase Storage upload and `mail_messages` DB insert. |
| `simplifica-crm/src/app/shared/feedback/feedback-modal.component.ts` | Modify | Add `mail_accounts` check, block UI if missing, remove `userEmail` from payload. |
| `supabase/migrations/XXX_create_company_feedback.sql` | Create | Table schema and RLS for `company_feedback`. |
| `supabase/migrations/YYY_create_feedback_storage.sql` | Create | Bucket creation script for `feedback_attachments`. |

## Interfaces / Contracts

**Edge Function Payload (POST /feedback):**
```typescript
interface FeedbackPayload {
  type: 'bug' | 'improvement';
  description: string;
  screenshot?: string; // Base64 data URL
  location: string;
}
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Frontend Component | Verify UI blocks submission without mail account. |
| Integration | Edge Function | Submit valid payload, verify `company_feedback` and `mail_messages` rows are created, and storage bucket contains the file. |
| E2E | End-to-end Flow | Open widget, submit feedback, verify admin inbox receives it. |

## Migration / Rollout

Run the two SQL migrations (table creation and storage bucket configuration) before deploying the Edge Function. The `feedback_attachments` bucket and `company_feedback` table must exist before the function runs. No data migration of old SES emails is required.

## Open Questions

- [ ] The `mail_messages` table lacks a `reply_to` column. We are storing `user.email` in `metadata.reply_to`. The webmail client will need to parse this if "Reply" is clicked, otherwise it will default to replying to the `from` address (`noreply@simplificacrm.es`). Is a frontend webmail update planned to support `metadata.reply_to`?
