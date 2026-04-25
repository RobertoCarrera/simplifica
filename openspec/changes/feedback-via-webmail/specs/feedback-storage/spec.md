# feedback-storage Specification

## Purpose

Screenshot storage for feedback attachments via Supabase Storage.

## Requirements

### Requirement: Storage Bucket

The system SHALL use bucket `feedback_attachments` for feedback screenshots.

If the bucket does not exist, it MUST be created via migration or Supabase Storage API with:
- `public`: false (private bucket)
- `file_size_limit`: 1048576 bytes (1MB)
- `allowed_mime_types`: ["image/jpeg", "image/png", "image/webp"]

### Requirement: File Naming Convention

The system MUST store files with path pattern: `feedback/{feedback_id}/{timestamp}.jpg`

- `feedback_id`: UUID of the corresponding `company_feedback` record
- `timestamp`: Unix epoch milliseconds at upload time

### Requirement: Content Type Enforcement

Uploaded files MUST be stored with `Content-Type: image/jpeg`.

### Requirement: Size Limit Enforcement

The system MUST reject uploads exceeding 1MB (1048576 bytes).

Frontend is responsible for pre-validating file size. Backend MUST enforce the limit.

### Requirement: URL Accessibility

Stored screenshots MUST be accessible via signed URL with 1-hour expiration for email inclusion.

## Scenarios

### Scenario: Successful Screenshot Upload

- GIVEN a valid image file under 1MB
- WHEN the upload request is made with feedback_id and file
- THEN the file is stored at `feedback/{feedback_id}/{timestamp}.jpg`
- AND the stored Content-Type is image/jpeg
- AND the URL is returned in the response

### Scenario: Oversized File Rejection

- GIVEN a file exceeding 1MB
- WHEN the upload is attempted
- THEN the server returns 413 Payload Too Large
- AND no file is stored

### Scenario: File Retrieved via Signed URL

- GIVEN a stored screenshot
- WHEN a signed URL is requested
- THEN the URL is valid for 1 hour
- AND the image is downloadable

## Error Handling

| Error | HTTP Status | Message |
|-------|-------------|---------|
| File too large | 413 | "File size exceeds 1MB limit" |
| Invalid mime type | 400 | "Only JPEG, PNG, and WebP images are allowed" |
| Bucket not found | 500 | "Storage bucket not configured" |
| Upload failed | 500 | "Screenshot upload failed" |

## Acceptance Criteria

- [ ] Bucket `feedback_attachments` exists or is created
- [ ] Files stored with correct path pattern
- [ ] 1MB size limit enforced
- [ ] Signed URLs generated for access
- [ ] Content-Type set to image/jpeg on upload
