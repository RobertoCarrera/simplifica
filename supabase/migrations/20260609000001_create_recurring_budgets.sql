-- Migration: Create recurring_budgets system
-- Implements the automatic generation of budgets (presupuestos) from
-- contracted services with recurrence configuration.
--
-- Tables:
--   1. recurring_budgets       — one budget per client per period
--   2. recurring_budget_lines  — line items linking to contracted_services
--
-- Functions:
--   3. generate_recurring_budgets(target_date) — the scheduler entry point
--   4. calculate_recurrence_period(date, type)  — period label helper
--
-- Unique constraint (client_id, period) prevents duplicates.

--------------------------------------------------------------------------------
-- 1. TABLE: recurring_budgets
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recurring_budgets (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Period identifier (e.g. "2026-W23", "2026-06", "2026")
  period text NOT NULL,
  recurrence_type text NOT NULL
    CHECK (recurrence_type IN ('weekly', 'monthly', 'yearly')),

  -- Dates
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '30 days'),

  -- Financials
  subtotal numeric(12,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  tax_rate numeric(5,2) NOT NULL DEFAULT 21.00,
  tax_amount numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0 CHECK (total >= 0),

  -- Status
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'paid', 'cancelled')),

  -- Notes
  notes text,

  -- Metadata
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Unique: one budget per client per period
  CONSTRAINT uq_recurring_budgets_client_period UNIQUE (client_id, period)
);

--------------------------------------------------------------------------------
-- 2. TABLE: recurring_budget_lines
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recurring_budget_lines (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  budget_id uuid NOT NULL REFERENCES public.recurring_budgets(id) ON DELETE CASCADE,

  -- Link to the contracted service that generated this line
  contracted_service_id uuid NOT NULL
    REFERENCES public.contracted_services(id) ON DELETE SET NULL,

  -- Line details
  description text NOT NULL,
  quantity numeric(10,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price numeric(12,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  tax_rate numeric(5,2) NOT NULL DEFAULT 21.00,
  tax_amount numeric(12,2) NOT NULL DEFAULT 0,
  line_total numeric(12,2) NOT NULL DEFAULT 0,

  -- Ordering
  sort_order int NOT NULL DEFAULT 0,

  -- Metadata
  created_at timestamptz NOT NULL DEFAULT now()
);

--------------------------------------------------------------------------------
-- 3. INDEXES
--------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_recurring_budgets_client_id
  ON public.recurring_budgets(client_id);

CREATE INDEX IF NOT EXISTS idx_recurring_budgets_company_id
  ON public.recurring_budgets(company_id);

CREATE INDEX IF NOT EXISTS idx_recurring_budgets_period
  ON public.recurring_budgets(period);

CREATE INDEX IF NOT EXISTS idx_recurring_budgets_status
  ON public.recurring_budgets(status)
  WHERE status IN ('draft', 'sent');

CREATE INDEX IF NOT EXISTS idx_recurring_budget_lines_budget_id
  ON public.recurring_budget_lines(budget_id);

CREATE INDEX IF NOT EXISTS idx_recurring_budget_lines_service_id
  ON public.recurring_budget_lines(contracted_service_id)
  WHERE contracted_service_id IS NOT NULL;

--------------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY
--------------------------------------------------------------------------------
ALTER TABLE public.recurring_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_budget_lines ENABLE ROW LEVEL SECURITY;

-- SELECT: company members can view budgets in their company
CREATE POLICY "Company members can view recurring budgets"
  ON public.recurring_budgets
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      JOIN users u ON u.id = cm.user_id
      WHERE cm.company_id = recurring_budgets.company_id
        AND u.auth_user_id = auth.uid()
        AND cm.status = 'active'
    )
  );

-- INSERT: company members can create budgets (also used by the generation function
-- when invoked via SECURITY DEFINER)
CREATE POLICY "Company members can insert recurring budgets"
  ON public.recurring_budgets
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM company_members cm
      JOIN users u ON u.id = cm.user_id
      WHERE cm.company_id = recurring_budgets.company_id
        AND u.auth_user_id = auth.uid()
        AND cm.status = 'active'
    )
  );

-- UPDATE: company members can update budgets
CREATE POLICY "Company members can update recurring budgets"
  ON public.recurring_budgets
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      JOIN users u ON u.id = cm.user_id
      WHERE cm.company_id = recurring_budgets.company_id
        AND u.auth_user_id = auth.uid()
        AND cm.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM company_members cm
      JOIN users u ON u.id = cm.user_id
      WHERE cm.company_id = recurring_budgets.company_id
        AND u.auth_user_id = auth.uid()
        AND cm.status = 'active'
    )
  );

-- DELETE: company members can delete budgets
CREATE POLICY "Company members can delete recurring budgets"
  ON public.recurring_budgets
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM company_members cm
      JOIN users u ON u.id = cm.user_id
      WHERE cm.company_id = recurring_budgets.company_id
        AND u.auth_user_id = auth.uid()
        AND cm.status = 'active'
    )
  );

-- Lines inherit budget RLS: visible if parent budget is visible
CREATE POLICY "Company members can view budget lines"
  ON public.recurring_budget_lines
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM recurring_budgets rb
      JOIN company_members cm ON cm.company_id = rb.company_id
      JOIN users u ON u.id = cm.user_id
      WHERE rb.id = recurring_budget_lines.budget_id
        AND u.auth_user_id = auth.uid()
        AND cm.status = 'active'
    )
  );

CREATE POLICY "Company members can insert budget lines"
  ON public.recurring_budget_lines
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM recurring_budgets rb
      JOIN company_members cm ON cm.company_id = rb.company_id
      JOIN users u ON u.id = cm.user_id
      WHERE rb.id = recurring_budget_lines.budget_id
        AND u.auth_user_id = auth.uid()
        AND cm.status = 'active'
    )
  );

CREATE POLICY "Company members can update budget lines"
  ON public.recurring_budget_lines
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM recurring_budgets rb
      JOIN company_members cm ON cm.company_id = rb.company_id
      JOIN users u ON u.id = cm.user_id
      WHERE rb.id = recurring_budget_lines.budget_id
        AND u.auth_user_id = auth.uid()
        AND cm.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM recurring_budgets rb
      JOIN company_members cm ON cm.company_id = rb.company_id
      JOIN users u ON u.id = cm.user_id
      WHERE rb.id = recurring_budget_lines.budget_id
        AND u.auth_user_id = auth.uid()
        AND cm.status = 'active'
    )
  );

CREATE POLICY "Company members can delete budget lines"
  ON public.recurring_budget_lines
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM recurring_budgets rb
      JOIN company_members cm ON cm.company_id = rb.company_id
      JOIN users u ON u.id = cm.user_id
      WHERE rb.id = recurring_budget_lines.budget_id
        AND u.auth_user_id = auth.uid()
        AND cm.status = 'active'
    )
  );

--------------------------------------------------------------------------------
-- 5. HELPER: calculate_recurrence_period
--    Returns the period label for a given date and recurrence type.
--    - weekly  → "YYYY-Www" (ISO week)
--    - monthly → "YYYY-MM"
--    - yearly  → "YYYY"
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_recurrence_period(
  p_date date,
  p_type text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_week int;
  v_year int;
BEGIN
  CASE p_type
    WHEN 'weekly' THEN
      v_week := EXTRACT(WEEK FROM p_date);
      v_year := EXTRACT(YEAR FROM p_date);
      -- Edge case: last days of December may belong to week 1 of next year
      IF EXTRACT(MONTH FROM p_date) = 12 AND v_week = 1 THEN
        v_year := v_year + 1;
      END IF;
      RETURN v_year || '-W' || LPAD(v_week::text, 2, '0');

    WHEN 'monthly' THEN
      RETURN TO_CHAR(p_date, 'YYYY-MM');

    WHEN 'yearly' THEN
      RETURN TO_CHAR(p_date, 'YYYY');

    ELSE
      RETURN TO_CHAR(p_date, 'YYYY-MM-DD');
  END CASE;
END;
$$;

--------------------------------------------------------------------------------
-- 6. HELPER: is_recurrence_day_match
--    Returns TRUE if target_date matches the recurrence_day for the given type.
--    weekly:  1=Monday … 7=Sunday  (maps from PG DOW 0=Sun→7, 1=Mon→1, … 6=Sat→6)
--    monthly: day of month (1-28)
--    yearly:  day of year (1-365)
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_recurrence_day_match(
  p_date date,
  p_type text,
  p_day int
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_dow int;
BEGIN
  CASE p_type
    WHEN 'weekly' THEN
      -- PG DOW: 0=Sun, 1=Mon, …, 6=Sat
      -- Our encoding: 1=Mon, 7=Sun
      -- Map: PG DOW 0 → 7, PG DOW 1-6 → 1-6
      v_dow := EXTRACT(DOW FROM p_date)::int;
      IF v_dow = 0 THEN v_dow := 7; END IF;
      RETURN v_dow = p_day;

    WHEN 'monthly' THEN
      RETURN EXTRACT(DAY FROM p_date)::int = p_day;

    WHEN 'yearly' THEN
      RETURN EXTRACT(DOY FROM p_date)::int = p_day;

    ELSE
      RETURN false;
  END CASE;
END;
$$;

--------------------------------------------------------------------------------
-- 7. CORE: generate_recurring_budgets
--    Entry point for the scheduler. Scans all active contracted services with
--    recurrence, checks if today matches their recurrence day, and creates
--    budgets grouped by (client_id, period). Returns a summary rowset.
--
--    Parameters:
--      p_target_date  — date to generate budgets for (default: today)
--      p_dry_run      — if true, only reports what WOULD be created (no writes)
--
--    Returns: (budget_id, client_id, period, lines_count, action)
--      action = 'created' | 'skipped' | 'dry_run'
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_recurring_budgets(
  p_target_date date DEFAULT CURRENT_DATE,
  p_dry_run boolean DEFAULT false
)
RETURNS TABLE(
  budget_id uuid,
  client_id uuid,
  period text,
  lines_count int,
  action text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Per-contracted-service cursor variables
  v_cs_record record;

  -- Budget-level variables
  v_budget_id uuid;
  v_period text;
  v_subtotal numeric(12,2);
  v_tax_amount numeric(12,2);
  v_total numeric(12,2);
  v_tax_rate numeric(5,2);
  v_issue_date date;
  v_due_date date;
  v_line_total numeric(12,2);
  v_line_tax numeric(12,2);

  -- Aggregation: we group lines by (client_id, period)
  -- Using a temp table for intermediate results
BEGIN
  -- Temp table to hold the generated budget IDs and per-line data before
  -- inserting lines. We use a temp table so we can group lines by client+period
  -- easily and only insert budgets once.
  CREATE TEMP TABLE IF NOT EXISTS _gen_budgets (
    client_id uuid,
    company_id uuid,
    period text,
    recurrence_type text,
    issue_date date,
    due_date date,
    tax_rate numeric(5,2),
    contracted_service_id uuid,
    description text,
    unit_price numeric(12,2),
    sort_order int
  ) ON COMMIT DROP;

  -- Collect all services where today matches the recurrence day and the service
  -- is active and within its recurrence window.
  FOR v_cs_record IN
    SELECT
      cs.id,
      cs.client_id,
      cs.company_id,
      cs.name,
      cs.price,
      cs.currency,
      cs.recurrence_type,
      cs.recurrence_day,
      cs.recurrence_start,
      cs.recurrence_end
    FROM public.contracted_services cs
    WHERE cs.status = 'active'
      AND cs.deleted_at IS NULL
      AND cs.recurrence_type IS NOT NULL
      AND cs.recurrence_day IS NOT NULL
      AND cs.recurrence_start IS NOT NULL
      -- Within recurrence window
      AND p_target_date >= cs.recurrence_start
      AND (cs.recurrence_end IS NULL OR p_target_date <= cs.recurrence_end)
      -- Day match
      AND public.is_recurrence_day_match(
            p_target_date, cs.recurrence_type, cs.recurrence_day)
    ORDER BY cs.company_id, cs.client_id
  LOOP
    -- Calculate period for this service
    v_period := public.calculate_recurrence_period(
                  p_target_date, v_cs_record.recurrence_type);

    -- Insert into temp table for grouping
    INSERT INTO _gen_budgets (
      client_id, company_id, period, recurrence_type,
      issue_date, due_date, tax_rate,
      contracted_service_id, description, unit_price, sort_order
    ) VALUES (
      v_cs_record.client_id,
      v_cs_record.company_id,
      v_period,
      v_cs_record.recurrence_type,
      p_target_date,
      p_target_date + INTERVAL '30 days',
      21.00,
      v_cs_record.id,
      v_cs_record.name,
      v_cs_record.price,
      0
    );
  END LOOP;

  -- Now group by (client_id, period) and create budgets
  FOR v_cs_record IN
    SELECT DISTINCT
      gb.client_id,
      gb.company_id,
      gb.period,
      gb.recurrence_type,
      gb.issue_date,
      gb.due_date,
      gb.tax_rate
    FROM _gen_budgets gb
    ORDER BY gb.company_id, gb.client_id, gb.period
  LOOP
    -- Check for existing budget (duplicate prevention)
    SELECT rb.id INTO v_budget_id
    FROM public.recurring_budgets rb
    WHERE rb.client_id = v_cs_record.client_id
      AND rb.period = v_cs_record.period;

    IF v_budget_id IS NOT NULL THEN
      -- Already exists — skip
      client_id := v_cs_record.client_id;
      period := v_cs_record.period;
      budget_id := v_budget_id;
      lines_count := 0;
      action := 'skipped';
      RETURN NEXT;
      CONTINUE;
    END IF;

    IF p_dry_run THEN
      -- Dry run — report what would be created
      SELECT COUNT(*) INTO lines_count
      FROM _gen_budgets gb
      WHERE gb.client_id = v_cs_record.client_id
        AND gb.period = v_cs_record.period;

      client_id := v_cs_record.client_id;
      period := v_cs_record.period;
      budget_id := NULL;
      action := 'dry_run';
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- Calculate financials for this budget's lines
    SELECT
      COALESCE(SUM(gb.unit_price), 0),
      COUNT(*)
    INTO v_subtotal, lines_count
    FROM _gen_budgets gb
    WHERE gb.client_id = v_cs_record.client_id
      AND gb.period = v_cs_record.period;

    v_tax_rate := v_cs_record.tax_rate;
    v_tax_amount := ROUND(v_subtotal * v_tax_rate / 100.0, 2);
    v_total := v_subtotal + v_tax_amount;

    -- Create the budget
    INSERT INTO public.recurring_budgets (
      client_id, company_id, period, recurrence_type,
      issue_date, due_date,
      subtotal, tax_rate, tax_amount, total,
      status
    ) VALUES (
      v_cs_record.client_id,
      v_cs_record.company_id,
      v_cs_record.period,
      v_cs_record.recurrence_type,
      v_cs_record.issue_date,
      v_cs_record.due_date,
      v_subtotal,
      v_tax_rate,
      v_tax_amount,
      v_total,
      'draft'
    )
    RETURNING id INTO v_budget_id;

    -- Create lines for this budget
    INSERT INTO public.recurring_budget_lines (
      budget_id, contracted_service_id,
      description, quantity, unit_price,
      tax_rate, tax_amount, line_total,
      sort_order
    )
    SELECT
      v_budget_id,
      gb.contracted_service_id,
      gb.description,
      1,
      gb.unit_price,
      gb.tax_rate,
      ROUND(gb.unit_price * gb.tax_rate / 100.0, 2),
      ROUND(gb.unit_price * (1 + gb.tax_rate / 100.0), 2),
      ROW_NUMBER() OVER (ORDER BY gb.sort_order, gb.description)
    FROM _gen_budgets gb
    WHERE gb.client_id = v_cs_record.client_id
      AND gb.period = v_cs_record.period;

    -- Return result
    client_id := v_cs_record.client_id;
    period := v_cs_record.period;
    budget_id := v_budget_id;
    action := 'created';
    RETURN NEXT;
  END LOOP;

  -- Cleanup temp table
  DROP TABLE IF EXISTS _gen_budgets;
END;
$$;

--------------------------------------------------------------------------------
-- 8. UPDATED_AT TRIGGER for recurring_budgets
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_recurring_budgets_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recurring_budgets_updated_at ON public.recurring_budgets;
CREATE TRIGGER trg_recurring_budgets_updated_at
  BEFORE UPDATE ON public.recurring_budgets
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_recurring_budgets_updated_at();

--------------------------------------------------------------------------------
-- 9. COMMENTS
--------------------------------------------------------------------------------
COMMENT ON TABLE public.recurring_budgets IS
  'Presupuestos generados automáticamente desde servicios contratados con recurrencia. Uno por cliente + periodo.';

COMMENT ON TABLE public.recurring_budget_lines IS
  'Líneas de presupuesto recurrente. Cada línea corresponde a un servicio contratado incluido en el presupuesto.';

COMMENT ON COLUMN public.recurring_budgets.period IS
  'Identificador del periodo: "YYYY-Www" (semanal), "YYYY-MM" (mensual), "YYYY" (anual).';

COMMENT ON COLUMN public.recurring_budgets.recurrence_type IS
  'Tipo de recurrencia que generó este presupuesto: weekly, monthly, yearly.';

COMMENT ON COLUMN public.recurring_budgets.issue_date IS
  'Fecha de emisión del presupuesto (coincide con la fecha de generación).';

COMMENT ON COLUMN public.recurring_budgets.due_date IS
  'Fecha de vencimiento (por defecto issue_date + 30 días).';

COMMENT ON COLUMN public.recurring_budget_lines.contracted_service_id IS
  'FK → contracted_services. Servicio contratado que originó esta línea.';

COMMENT ON FUNCTION public.generate_recurring_budgets(date, boolean) IS
  'Motor de generación de presupuestos recurrentes. Para cada servicio contratado activo cuya recurrencia coincida con p_target_date, crea un presupuesto agrupado por cliente+periodo. Evita duplicados por la constraint UNIQUE(client_id, period).';

COMMENT ON FUNCTION public.calculate_recurrence_period(date, text) IS
  'Calcula la etiqueta de periodo para una fecha y tipo de recurrencia dados.';

COMMENT ON FUNCTION public.is_recurrence_day_match(date, text, int) IS
  'Determina si una fecha coincide con el día de recurrencia configurado para el tipo dado.';
