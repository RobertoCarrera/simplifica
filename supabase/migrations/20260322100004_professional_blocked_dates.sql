-- Professional blocked dates: specific date ranges where a professional is unavailable
CREATE TABLE IF NOT EXISTS professional_blocked_dates (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    professional_id UUID NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
    start_date  DATE NOT NULL,
    end_date    DATE NOT NULL,
    reason      TEXT,
    created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT blocked_dates_range_check CHECK (end_date >= start_date)
);

-- Indexes for common query patterns
CREATE INDEX idx_blocked_dates_company ON professional_blocked_dates(company_id);
CREATE INDEX idx_blocked_dates_professional ON professional_blocked_dates(professional_id);
CREATE INDEX idx_blocked_dates_range ON professional_blocked_dates(start_date, end_date);

-- RLS
ALTER TABLE professional_blocked_dates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "blocked_dates_select" ON professional_blocked_dates
    FOR SELECT USING (
        company_id = (SELECT company_id FROM users WHERE auth_user_id = auth.uid() LIMIT 1)
    );

CREATE POLICY "blocked_dates_insert" ON professional_blocked_dates
    FOR INSERT WITH CHECK (
        company_id = (SELECT company_id FROM users WHERE auth_user_id = auth.uid() LIMIT 1)
    );

CREATE POLICY "blocked_dates_update" ON professional_blocked_dates
    FOR UPDATE USING (
        company_id = (SELECT company_id FROM users WHERE auth_user_id = auth.uid() LIMIT 1)
    );

CREATE POLICY "blocked_dates_delete" ON professional_blocked_dates
    FOR DELETE USING (
        company_id = (SELECT company_id FROM users WHERE auth_user_id = auth.uid() LIMIT 1)
    );
