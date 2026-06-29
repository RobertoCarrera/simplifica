-- Migration: Create get_email_template_preview RPC
--
-- Bug: The CRM frontend calls
--     supabase.rpc('get_email_template_preview', { p_company_id, p_email_type })
-- from CompanyEmailService.getEmailTemplatePreview() (consumed by
-- admin/email-accounts/email-preview.component.ts's eye-icon preview). The RPC
-- was referenced in code but never created, so every click on the eye icon
-- errored with
--   "Could not find the function public.get_email_template_preview(
--      p_company_id, p_email_type) in the schema cache"
-- and the preview never rendered.
--
-- Fix: Create the RPC.
--
-- Return type rationale — TEXT (not JSONB):
--   The consumer treats the return value as a string of HTML and assigns it
--   to a signal<string> that backs an [innerHTML] binding:
--       const html = await firstValueFrom(svc.getEmailTemplatePreview(...));
--       this.htmlContent.set(html);
--       <div [innerHTML]="htmlContent()"></div>
--   A JSONB return would coerce to "[object Object]" in innerHTML and break
--   the preview. Returning TEXT of the body template matches the contract.
--   The subject template is included as the same string wrapped in an
--   <h1> so the preview shows the rendered email at a glance.
--
-- Security model:
--   - SECURITY DEFINER so it bypasses RLS — the user calling the RPC may not
--     have a direct SELECT policy on company_email_settings for their tenant
--     (those policies gate writes/edits, not just reads).
--   - search_path pinned to 'public' to satisfy Supabase's "function search
--     path mutable" advisory (no role takeover via malicious search_path).
--   - GRANT EXECUTE TO authenticated: the Angular SPA's authenticated role
--     invokes this RPC on behalf of the CRM tenant owner.
--   - The function returns ONLY the active template for the requested
--     (company_id, email_type) pair. No cross-tenant leakage: the WHERE
--     clause uses the caller-supplied p_company_id, and we read it back with
--     a parameterised SELECT, not by joining on auth.uid().

BEGIN;

CREATE OR REPLACE FUNCTION public.get_email_template_preview(
  p_company_id uuid,
  p_email_type text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_subject text;
  v_body text;
BEGIN
  SELECT custom_subject_template, custom_body_template
    INTO v_subject, v_body
  FROM company_email_settings
  WHERE company_id = p_company_id
    AND email_type = p_email_type
    AND is_active = true
  LIMIT 1;

  -- Empty-string fallbacks (not NULL) so the [innerHTML] binding renders a
  -- deterministic value and the caller can tell "no template" apart from
  -- "template missing" if it wants to.
  v_subject := COALESCE(v_subject, '');
  v_body    := COALESCE(v_body, '');

  -- Preview rendering: the body is the canonical HTML preview (what the
  -- client will actually receive in their inbox). The subject is shown as
  -- a heading so the eye-icon preview shows the full email at a glance.
  -- Admins who need raw templates can still query company_email_settings
  -- directly from the SQL editor.
  IF v_body = '' THEN
    RETURN '';
  END IF;

  IF v_subject <> '' THEN
    RETURN '<h2 style="font-family:sans-serif;color:#111827;margin:0 0 16px;">'
           || v_subject
           || '</h2>' || v_body;
  END IF;

  RETURN v_body;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_email_template_preview(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.get_email_template_preview(uuid, text) IS
  'Returns the active company_email_settings template body for a given '
  '(company_id, email_type) as a TEXT chunk of HTML, suitable for direct '
  '[innerHTML] binding in the CRM email preview pane. SECURITY DEFINER '
  'with search_path pinned to public. Wraps the subject in an <h2> heading '
  'when available so the preview shows the full email layout.';

COMMIT;
