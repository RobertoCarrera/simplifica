-- Hotfix: append_compliance_footer mixed E'...\n' (real newline) and
-- '...\n' (literal backslash + n) in its string concatenations. The literal
-- form renders as visible "\n" characters in the email preview because
-- HTML does not interpret backslash escapes.
--
-- Symptom: the rendered email preview shows stray "\n" inside the RGPD
-- footer paragraphs.
--
-- Fix: replace all '\n' literals with chr(10) which is unambiguous in any
-- string-literal style. This rewrites append_compliance_footer in a way
-- that is robust regardless of whether the SQL is parsed as E'...' or
-- plain '...'.
--
-- Idempotent: CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.append_compliance_footer(
  p_html     text,
  p_company_id uuid,
  p_app_url  text DEFAULT 'https://app.simplificacrm.es'
)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_company_name text;
  v_company_nif  text;
  v_company_addr text;
  v_base_footer  text;
  v_block        text;
BEGIN
  SELECT name, COALESCE(nif, ''),
         COALESCE(settings->'address'->>'value', settings->>'address', '')
    INTO v_company_name, v_company_nif, v_company_addr
    FROM public.companies WHERE id = p_company_id;

  v_base_footer := v_company_name
    || CASE WHEN v_company_nif <> '' THEN ' · NIF: ' || v_company_nif ELSE '' END
    || CASE WHEN v_company_addr <> '' THEN ' · ' || v_company_addr ELSE '' END;

  -- Use chr(10) for newlines so this works regardless of string-literal
  -- escape style (E'...' vs '...'). Prior versions used a mix of E'...'
  -- with '\n' and regular '...' with literal '\n', which produced visible
  -- backslash-n characters in the rendered email when the non-E string
  -- was the only one in a particular concatenation branch.
  v_block := chr(10)
    || '    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 12px;">' || chr(10)
    || '    <p style="font-size:12px;color:#6b7280;margin:0 0 6px;text-align:center;">'
    || v_base_footer || '</p>' || chr(10)
    || '    <p style="font-size:11px;color:#9ca3af;margin:6px 0 0;text-align:center;line-height:1.5;">' || chr(10)
    || '      En cumplimiento del RGPD, sus datos serán tratados conforme a nuestra' || chr(10)
    || '      <a href="' || p_app_url || '/privacidad" style="color:#6b7280;">política de privacidad</a>.' || chr(10)
    || '    </p>' || chr(10)
    || '    <p style="font-size:11px;color:#9ca3af;margin:8px 0 0;text-align:center;">' || chr(10)
    || '      ¿No deseas recibir más comunicaciones?' || chr(10)
    || '      <a href="' || p_app_url || '/unsubscribe?company=' || p_company_id::text
    || '" style="color:#6b7280;text-decoration:underline;">Darse de baja</a>' || chr(10)
    || '    </p>' || chr(10);

  IF p_html LIKE '%</body>%' THEN
    RETURN replace(p_html, '</body>', v_block || '</body>');
  END IF;
  RETURN p_html || v_block;
END;
$$;

NOTIFY pgrst, 'reload schema';