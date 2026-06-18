-- =====================================================================
-- feat/clinical-history-importer
-- Adds columns to client_clinical_notes needed by the CSV importer:
-- title, sequence_number, event_date, source, source_id, imported_at, imported_by.
-- Plus a partial unique index for idempotency on (client_id, source, source_id).
-- =====================================================================

ALTER TABLE public.client_clinical_notes
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS sequence_number integer,
  ADD COLUMN IF NOT EXISTS event_date timestamptz,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS source_id text,
  ADD COLUMN IF NOT EXISTS imported_at timestamptz,
  ADD COLUMN IF NOT EXISTS imported_by uuid;

-- Idempotency: one row per (client, source, source_id) when source is present.
-- Partial index (WHERE source IS NOT NULL) keeps existing manual notes unconstrained.
CREATE UNIQUE INDEX IF NOT EXISTS uq_client_clinical_notes_source
  ON public.client_clinical_notes(client_id, source, source_id)
  WHERE source IS NOT NULL;

-- Index to speed up duplicate-merge reattach (client_id lookups)
CREATE INDEX IF NOT EXISTS idx_client_clinical_notes_client_id
  ON public.client_clinical_notes(client_id);
