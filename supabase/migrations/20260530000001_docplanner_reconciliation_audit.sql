-- ================================================================
-- Migration: docplanner_reconciliation_audit
-- ================================================================
-- Per-date booking reconciliation audit: DocPlanner API counts
-- vs CRM-synced counts per company.
-- ================================================================

CREATE TABLE IF NOT EXISTS docplanner_reconciliation_audit (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  date            date NOT NULL,
  dp_total        integer NOT NULL DEFAULT 0,
  crm_synced      integer NOT NULL DEFAULT 0,
  discrepancy     integer NOT NULL DEFAULT 0,
  dp_breakdown    jsonb,
  synced_at       timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, date)
);

-- Index for widget queries: most-recent-first per company
CREATE INDEX idx_reconciliation_company_date
  ON docplanner_reconciliation_audit (company_id, date DESC);

-- Index for flagged discrepancy rows only
CREATE INDEX idx_reconciliation_discrepancy
  ON docplanner_reconciliation_audit (company_id, discrepancy)
  WHERE discrepancy != 0;

-- RLS
ALTER TABLE docplanner_reconciliation_audit ENABLE ROW LEVEL SECURITY;

-- Company members can read their company's audit rows
CREATE POLICY "Company members can read reconciliation audit"
  ON docplanner_reconciliation_audit FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM company_members
      WHERE company_members.company_id = docplanner_reconciliation_audit.company_id
        AND company_members.user_id = auth.uid()
    )
  );

-- Service role can read all (for edge function internal writes + pg_cron)
CREATE POLICY "Service role can read all"
  ON docplanner_reconciliation_audit FOR SELECT
  USING (auth.jwt()->>'role' = 'service_role');

-- Service role can insert audit rows (edge function upsert)
CREATE POLICY "Service role can insert"
  ON docplanner_reconciliation_audit FOR INSERT
  WITH CHECK (auth.jwt()->>'role' = 'service_role');

-- Service role can update audit rows (edge function upsert)
CREATE POLICY "Service role can update"
  ON docplanner_reconciliation_audit FOR UPDATE
  USING (auth.jwt()->>'role' = 'service_role');

COMMENT ON TABLE docplanner_reconciliation_audit IS
  'Per-date booking reconciliation audit: DocPlanner API counts vs CRM-synced counts.';