-- Migration: Add user assignment to Mail Domains
-- Date: 2026-01-04
-- Author: Simplifica Assistant

-- Add assigned_to_user column to link domains to specific users
ALTER TABLE public.mail_domains 
ADD COLUMN IF NOT EXISTS assigned_to_user UUID REFERENCES auth.users(id);

-- Update RLS policies to reflect this
-- Users can view domains assigned to them OR global domains (if we have a flag, but for now strict assignment)

DROP POLICY IF EXISTS "Authenticated users can view verified domains" ON public.mail_domains;

CREATE POLICY "Users can view assigned domains"
ON public.mail_domains
FOR SELECT
USING (
  auth.uid() = assigned_to_user 
  OR assigned_to_user IS NULL -- Optional: Global domains visible to all? User requested "assigned available". 
  -- Let's stick to strict assignment for "My Domains" view.
);

-- Admin policy remains (Admins manage all)
