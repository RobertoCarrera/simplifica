-- Drop the legacy get_email_template_preview RPC. Superseded by
-- preview_email_template (which renders the per-type defaults with
-- branding + RGPD footer, returns {html, sample_data}, and lives under
-- SECDEF + is_company_member guard). The legacy function was used only by
-- the eye-only modal in EmailPreviewComponent which PR3 deletes.
--
-- Idempotent: DROP IF EXISTS.

DROP FUNCTION IF EXISTS public.get_email_template_preview(uuid, text);
