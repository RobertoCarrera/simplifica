-- Migration: Add status and provider columns to domains table
-- Date: 2026-02-19
-- Author: GitHub Copilot

-- Add status and provider columns to domains table to support frontend registration flow
ALTER TABLE public.domains
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending_verification',
ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'manual';

-- Ensure the columns are available
COMMENT ON COLUMN public.domains.status IS 'Status of the domain verification (e.g. pending_verification, verified, failed)';
COMMENT ON COLUMN public.domains.provider IS 'Provider of the domain (e.g. aws, manual)';
