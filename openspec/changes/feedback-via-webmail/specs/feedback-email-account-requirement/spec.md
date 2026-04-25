# feedback-email-account-requirement Specification

## Purpose

Frontend enforcement that users must have a configured email account before using the feedback widget.

## Requirements

### Requirement: Email Account Check

Before rendering or opening the feedback modal, the system MUST query `mail_accounts` table for records where `user_id` equals the current user's ID.

The check MUST be performed via the `company-email.service.ts` or equivalent service that queries Supabase.

### Requirement: Blocked State Message

When the user has no mail_account, the system SHALL display an informative message in Spanish:

> "Configura una cuenta de correo para usar el widget de feedback"

This message SHALL be displayed instead of the feedback trigger button/icon, or as a tooltip/banner explaining why the widget is unavailable.

### Requirement: Feedback Trigger Behavior

If the user HAS a mail_account:
- The feedback widget trigger (button/icon) SHALL be visible and interactive
- Clicking it SHALL open the feedback modal

If the user has NO mail_account:
- The feedback widget trigger SHALL be hidden OR disabled
- If visible but disabled, it SHALL show the informative message on hover/focus

### Requirement: Check Timing

The email account check SHOULD be performed:
- On component initialization
- After successful email account creation (to enable the widget)

## Scenarios

### Scenario: User With Email Account Sees Widget

- GIVEN the user is authenticated
- AND the user has at least one mail_account record
- WHEN the feedback component loads
- THEN the feedback button/icon is visible
- AND clicking it opens the feedback modal

### Scenario: User Without Email Account Blocked

- GIVEN the user is authenticated
- AND the user has NO mail_account records
- WHEN the feedback component loads
- THEN the feedback button/icon is hidden or disabled
- AND an informative message is displayed on hover/click

### Scenario: Widget Enables After Account Creation

- GIVEN the user had no mail_account and the widget was blocked
- WHEN the user creates a new mail_account
- THEN on next load or after account creation success
- AND the feedback widget becomes visible/enabled

## Error Handling

| Error | Behavior |
|-------|----------|
| Query fails | Show widget as disabled with generic error |
| Network error | Show offline indicator, retry on reconnect |

## Acceptance Criteria

- [ ] Users without mail_account cannot open feedback modal
- [ ] Informative Spanish message is displayed
- [ ] Widget becomes available after mail_account creation
- [ ] Check is performed on component mount
