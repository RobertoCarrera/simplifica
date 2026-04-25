# feedback-processing Specification

## Purpose

Edge Function that processes feedback submissions, stores records, and routes emails to superadmin.

## Requirements

### Requirement: Payload Validation

The Edge Function MUST validate incoming payloads:
- `type`: MUST be "bug" or "improvement"
- `description`: MUST be non-empty string, max 2000 characters
- `user_email`: MUST be valid email format
- `location`: MUST be valid URL if provided
- `screenshot_url`: MUST be valid URL if provided

### Requirement: Feedback Record Storage

The system MUST insert a record into `company_feedback` table with:
- `company_id`: from authenticated user's session
- `user_id`: from authenticated user
- `user_email`: from payload
- `type`: from payload
- `description`: from payload
- `location`: from payload (optional)
- `screenshot_url`: from payload (optional)
- `status`: "pending"

### Requirement: Superadmin Mail Account Discovery

The system MUST query `mail_accounts` table for records where `role = 'super_admin'` to find the recipient.

The system SHALL use the first superadmin account found, or fall back to `roberto@simplificacrm.es` if no superadmin account exists.

### Requirement: Mail Message Insertion

The system MUST insert a `mail_message` record into the superadmin's inbox with:
- `from`: { name: "Simplifica CRM Feedback", email: "feedback@simplificacrm.es" }
- `to`: superadmin's email address
- `reply_to`: submitting user's email (from payload)
- `subject`: "[🐛 Bug]" or "[💡 Mejora]" + first 50 chars of description
- `body_html`: formatted HTML with feedback details and screenshot reference
- `is_read`: false
- `folder`: "inbox"

### Requirement: Status Update

On successful mail insertion, the system MUST update the `company_feedback` record:
- Set `status` to "sent"
- Set `mail_message_id` to the inserted mail_message UUID

On failure, the system MUST:
- Set `status` to "failed"
- NOT modify the `mail_message_id`

## Scenarios

### Scenario: Bug Report Processed Successfully

- GIVEN a valid bug report payload
- WHEN the Edge Function receives the request
- THEN it validates the payload
- AND inserts a `company_feedback` record with status "pending"
- AND uploads screenshot to storage (if provided)
- AND finds the superadmin's mail account
- AND inserts a mail_message with "[🐛 Bug]" prefix
- AND updates the feedback record to status "sent"

### Scenario: Improvement Suggestion Processed Successfully

- GIVEN a valid improvement payload
- WHEN the Edge Function processes it
- THEN the mail subject prefix is "[💡 Mejora]"

### Scenario: No Screenshot Included

- GIVEN a valid payload without screenshot_url
- WHEN the Edge Function processes it
- THEN it inserts the mail_message with no screenshot reference in body_html

### Scenario: Payload Validation Failure

- GIVEN an invalid payload (missing type field)
- WHEN the Edge Function validates
- THEN it returns 400 Bad Request with error details

### Scenario: Mail Insertion Failure

- GIVEN a valid payload and stored feedback record
- WHEN the mail_message insertion fails
- THEN the feedback record status is set to "failed"
- AND the error is logged

## Error Handling

| Error | Response | Side Effect |
|-------|----------|-------------|
| Invalid payload | 400 Bad Request | No DB changes |
| DB insert fails | 500 Internal Server Error | Feedback status: "failed" |
| Mail insertion fails | 200 OK | Feedback status: "failed", mail_message_id unchanged |
| Superadmin not found | 500 Internal Server Error | Log warning, use fallback email |

## Acceptance Criteria

- [ ] Invalid payloads return 400 with field-level errors
- [ ] Valid payloads create company_feedback record with status "pending"
- [ ] Mail is inserted into superadmin's inbox with correct Reply-To
- [ ] Subject prefix correctly reflects type (bug/improvement)
- [ ] Feedback status updated to "sent" on success
- [ ] Feedback status updated to "failed" on mail failure
