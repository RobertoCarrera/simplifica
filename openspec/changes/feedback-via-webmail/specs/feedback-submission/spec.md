# feedback-submission Specification

## Purpose

Frontend feedback widget (bug/improvement) submission flow.

## Requirements

### Requirement: Email Account Prerequisite

The system SHALL verify the user has a configured email account before allowing feedback submission.

The feedback widget MUST query `mail_accounts` table for records where `user_id` matches the current user. If no record exists, the widget SHALL display an informative message and block submission.

### Requirement: Feedback Data Collection

The feedback widget MUST collect the following fields:
- `type`: bug or improvement (required)
- `description`: free text (required)
- `location`: current page URL (auto-populated)
- `screenshot`: image file (optional, max 1MB)
- `user_email`: from session/auth context (required)

### Requirement: Screenshot Upload

The system MUST upload screenshots to Supabase Storage bucket `feedback_attachments` before submitting feedback.

The file path MUST be `feedback/{feedback_id}/{timestamp}.jpg`. On upload failure, the system SHALL allow retry or submission without screenshot.

### Requirement: Feedback Submission

The system MUST submit all collected data to the `feedback` Edge Function as a JSON payload.

The Edge Function endpoint MUST be `POST /supabase/functions/v1/feedback`.

## Scenarios

### Scenario: Successful Bug Report Submission

- GIVEN the user is authenticated with an email account configured
- WHEN the user selects "Bug", fills description, optionally attaches a screenshot, and clicks Submit
- THEN the system uploads the screenshot to `feedback_attachments` bucket
- AND the system submits the feedback payload to the Edge Function
- AND the user sees a success confirmation

### Scenario: Feedback Submission Without Screenshot

- GIVEN the user is authenticated with an email account configured
- WHEN the user submits feedback without a screenshot
- THEN the system submits the feedback payload without a `screenshot_url` field
- AND the submission proceeds normally

### Scenario: Screenshot Upload Failure

- GIVEN the user has attached a screenshot and submits feedback
- WHEN the screenshot upload fails
- THEN the system displays an error message
- AND the user MAY retry the upload or submit without the screenshot

## Error Handling

| Error | User Message | Behavior |
|-------|--------------|----------|
| No email account | "Configura una cuenta de correo para usar el widget de feedback" | Block widget open |
| Screenshot upload fails | "Error al subir la captura. Intenta de nuevo." | Allow retry |
| Network failure | "Error de conexión. Intenta de nuevo." | Show retry option |

## Acceptance Criteria

- [ ] Widget is blocked when user has no mail_account
- [ ] All required fields are collected and validated
- [ ] Screenshot uploads to `feedback_attachments` bucket
- [ ] Payload submitted to Edge Function includes all fields
- [ ] Error messages are user-friendly in Spanish
