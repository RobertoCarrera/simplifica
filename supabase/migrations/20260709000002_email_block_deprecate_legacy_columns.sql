-- =============================================================================
-- PR3 email-block-editor: deprecate the legacy custom_button_text and
-- custom_header_template columns in favor of the new custom_blocks JSONB
-- (PR1) + block-based authoring UI (PR2a/PR2b).
--
-- Why COMMENT ON COLUMN (and not DROP COLUMN)?
--   The legacy fields are still READABLE: existing data must remain
--   queryable for the auto-migrate flow (PR2b) and for the @else (TipTap)
--   branch of TemplateEditorDialogComponent. They are NOT removed in
--   this PR — only annotated. Dropping them is a future change that
--   requires a separate migration window so existing rows can be
--   archived or backfilled.
--
--   Adding the COMMENT is cheap (catalog-only, no row rewrite) and
--   surfaces the deprecation in:
--     * psql \d+ public.company_email_settings
--     * Supabase Studio table view
--     * Supabase auto-generated API docs
--     * IDE tooltips for engineers writing SQL against the table
-- =============================================================================

COMMENT ON COLUMN public.company_email_settings.custom_button_text
  IS 'DEPRECATED: use custom_blocks button block instead. Removed in a future release.';

COMMENT ON COLUMN public.company_email_settings.custom_header_template
  IS 'DEPRECATED: use custom_blocks heading/paragraph blocks instead. Removed in a future release.';
