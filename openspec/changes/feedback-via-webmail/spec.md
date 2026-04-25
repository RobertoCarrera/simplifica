# Delta for feedback-via-webmail

## ADDED Requirements

### Requirement: feedback-submission

The feedback widget MUST enforce email account prerequisite, collect all required fields (type, description, location, optional screenshot, user_email), upload screenshots to `feedback_attachments` bucket, and submit to the `feedback` Edge Function.

#### Scenario: Bug Report Submission

- GIVEN the user is authenticated with an email account configured
- WHEN the user selects "Bug", fills description, optionally attaches a screenshot, and clicks Submit
- THEN the system uploads the screenshot and submits the feedback payload
- AND the user sees a success confirmation

#### Scenario: Feedback Without Screenshot

- GIVEN the user is authenticated with an email account configured
- WHEN the user submits feedback without a screenshot
- THEN the system submits the feedback payload without screenshot_url

### Requirement: feedback-processing

The `feedback` Edge Function MUST validate payloads, store records in `company_feedback` table, insert mail_messages into superadmin's inbox with proper Reply-To headers, and update feedback status appropriately.

#### Scenario: Bug Report Processed Successfully

- GIVEN a valid bug report payload
- WHEN the Edge Function receives the request
- THEN it validates, stores record, uploads screenshot, inserts mail, updates status to "sent"

#### Scenario: Mail Insertion Failure

- GIVEN a valid payload and stored feedback record
- WHEN the mail_message insertion fails
- THEN the feedback record status is set to "failed"

### Requirement: feedback-storage

Screenshots MUST be stored in `feedback_attachments` bucket with path pattern `feedback/{feedback_id}/{timestamp}.jpg`, max size 1MB, Content-Type image/jpeg.

#### Scenario: Successful Screenshot Upload

- GIVEN a valid image file under 1MB
- WHEN the upload request is made
- THEN the file is stored at `feedback/{feedback_id}/{timestamp}.jpg`

### Requirement: feedback-email-account-requirement

Before opening the feedback widget, the system MUST check if the user has a mail_account. If not, display "Configura una cuenta de correo para usar el widget de feedback" and block access.

#### Scenario: User Without Email Account Blocked

- GIVEN the user is authenticated with NO mail_account records
- WHEN the feedback component loads
- THEN the feedback button is hidden or disabled
- AND an informative message is displayed

### Requirement: company_feedback Table

The system MUST support the new `company_feedback` table for historical tracking.

```sql
CREATE TABLE company_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id),
  user_id UUID REFERENCES auth.users(id),
  user_email TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('bug', 'improvement')),
  description TEXT NOT NULL,
  location TEXT,
  screenshot_url TEXT,
  mail_message_id UUID,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

## Acceptance Criteria

- [ ] Feedback is stored in `company_feedback` table
- [ ] Screenshots stored in `feedback_attachments` bucket
- [ ] Mail inserted into superadmin's inbox
- [ ] Reply-To correctly set to submitting user's email
- [ ] Users without email account are blocked from feedback widget
