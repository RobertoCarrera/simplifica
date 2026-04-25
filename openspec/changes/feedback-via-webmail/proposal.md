# Proposal: feedback-via-webmail

## Intent

Re-architect the Feedback component to integrate natively with the internal webmail system. This addresses broken inline screenshots (blocked by Gmail) and broken reply functionality (replies incorrectly sent to the admin instead of the user), while adding historical tracking and enforcing email account configuration.

## Scope

### In Scope
- Create a new `company_feedback` table for historical tracking.
- Modify the feedback Edge Function(s) to use direct `mail_message` insertion instead of SES.
- Upload feedback screenshots to Supabase Storage (e.g., `mail_attachments` bucket).
- Include proper `Reply-To` headers pointing to the user's email address.
- Update frontend (`feedback-modal.component.ts`) to require a configured email account before allowing feedback submission.

### Out of Scope
- A dedicated UI for managing the `company_feedback` table (admin will manage via inbox for now).
- Migration of old feedback emails into the new table.
- Multi-admin round-robin assignment (hardcoded to `roberto@simplificacrm.es` for now).

## Capabilities

### New Capabilities
- `feedback-management`: Tracking and processing user feedback through the webmail system, including storage of attachments and correct routing.

### Modified Capabilities
None

## Approach

1. **Database**: Create `company_feedback` table via migration.
2. **Storage**: Store screenshots in the existing `mail_attachments` bucket to reuse attachment infrastructure.
3. **Backend**: Refactor `supabase/functions/feedback/index.ts` (and `simplifica-crm` duplicate if applicable) to:
   - Save the record in `company_feedback`.
   - Upload screenshot to `mail_attachments`.
   - Insert a `mail_message` into `roberto@simplificacrm.es`'s inbox folder.
   - Set the `replyTo` field/header to the submitter's email so process-inbound-email works correctly on reply.
4. **Frontend**: Use `company-email.service.ts` to verify the user has a linked `mail_account`. If not, prompt them to configure it before opening the feedback form.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `supabase/migrations/` | New | Migration for `company_feedback` table |
| `supabase/functions/feedback/` | Modified | Edge function logic changed to use internal mail delivery and storage |
| `simplifica-crm/src/app/shared/feedback/` | Modified | Require email account validation before rendering/submitting |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Storage Costs | Low | Limit max screenshot resolution/size in frontend. Auto-cleanup old feedback after N months. |
| User Blocked | Medium | Clear prompt directing users to configure email before sending feedback. |

## Rollback Plan

1. Revert the database migration dropping `company_feedback`.
2. Redeploy the `feedback` Edge Function(s) using the old SES implementation.
3. Revert frontend changes to remove the email account requirement.

## Dependencies

- Existing webmail architecture (`mail_messages`, `mail_accounts`)
- Supabase Storage (`mail_attachments` bucket)

## Success Criteria

- [ ] Feedback is stored successfully in `company_feedback` table.
- [ ] Screenshots are stored in Supabase Storage and linked properly in the email.
- [ ] Feedback is inserted directly into the superadmin's inbox as a `mail_message`.
- [ ] Superadmin can hit "Reply" and the response goes to the user's email address.
- [ ] Users without an email account configured are prevented from using the feedback widget.
