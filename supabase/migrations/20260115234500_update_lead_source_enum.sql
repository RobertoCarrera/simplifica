-- Add new sources to lead_source enum for Marketing ROI tracking
ALTER TYPE lead_source ADD VALUE IF NOT EXISTS 'google_ads';
ALTER TYPE lead_source ADD VALUE IF NOT EXISTS 'instagram_ads';
ALTER TYPE lead_source ADD VALUE IF NOT EXISTS 'tiktok_ads';
ALTER TYPE lead_source ADD VALUE IF NOT EXISTS 'email_marketing';
