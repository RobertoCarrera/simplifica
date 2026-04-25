-- Add link column to notifications table for invitation notifications
ALTER TABLE "public"."notifications" ADD COLUMN IF NOT EXISTS "link" text;

-- Create index for faster link lookups if needed
CREATE INDEX IF NOT EXISTS "notifications_link_idx" ON "public"."notifications" ("link");
