-- ============================================================================
-- HOTFIX Migration: Fix type error in render_blocks_to_html dispatcher
-- ============================================================================
-- Bug introduced in PR1-block-editor (migration
-- 20260709000001_email_block_editor_foundation.sql, line ~299):
--
--     v_props := COALESCE(v_block->>'props', '{}'::jsonb);
--
--   The ->> operator returns TEXT but the fallback '{}'::jsonb is JSONB.
--   COALESCE requires a common type; text and jsonb cannot be matched
--   (PostgreSQL error 42804). The function errors on EVERY call, breaking
--   the entire block editor preview path.
--
-- Fix: use v_block->'props' (the -> operator returns jsonb) instead of
--      v_block->>'props' (the ->> operator returns text). The fallback
--      '{}'::jsonb then matches cleanly.
--
-- This hotfix was first applied to production via direct MCP call on
-- 2026-07-09 after the bug was discovered. This file preserves the fix
-- in migration history so fresh-database setups (dev/staging, new envs)
-- get the correct function.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.render_blocks_to_html(p_blocks jsonb)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_block jsonb;
  v_type  text;
  v_props jsonb;
  v_html  text := '';
BEGIN
  IF p_blocks IS NULL OR jsonb_typeof(p_blocks) <> 'array' THEN
    RETURN '';
  END IF;

  FOR v_block IN SELECT * FROM jsonb_array_elements(p_blocks) LOOP
    v_type  := COALESCE(v_block->>'type', '');
    -- FIX: use -> (jsonb) not ->> (text) so COALESCE can match the jsonb fallback
    v_props := COALESCE(v_block->'props', '{}'::jsonb);
    CASE v_type
      WHEN 'logo'      THEN v_html := v_html || public.render_block_logo(v_props);
      WHEN 'heading'   THEN v_html := v_html || public.render_block_heading(v_props);
      WHEN 'paragraph' THEN v_html := v_html || public.render_block_paragraph(v_props);
      WHEN 'button'    THEN v_html := v_html || public.render_block_button(v_props);
      ELSE v_html := v_html || '';
    END CASE;
  END LOOP;

  RETURN v_html;
END;
$$;

REVOKE ALL ON FUNCTION public.render_blocks_to_html(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.render_blocks_to_html(jsonb) TO service_role;

COMMENT ON FUNCTION public.render_blocks_to_html(jsonb) IS
  'Dispatcher that walks a JSONB array of Block objects and concatenates the '
  'HTML output of each per-type renderer (render_block_logo/heading/paragraph/'
  'button). Unknown block types contribute empty string (graceful forward-'
  'compat for future block additions). SERVER-AUTHORITATIVE — the TS mirror '
  'in supabase/functions/_shared/email-templates.ts mirrors this for snapshot '
  'parity and Edge delivery only. Returns empty string for NULL or non-array '
  'input. SECURITY DEFINER + search_path pinned + REVOKE FROM PUBLIC + '
  'GRANT service_role (per RLS hardening).';

NOTIFY pgrst, 'reload schema';
