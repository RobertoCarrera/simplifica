-- T9.5: Enum has only the 7 canonical values
DO $$
DECLARE
  v_labels text;
BEGIN
  SELECT string_agg(enumlabel, ',' ORDER BY enumsortorder) INTO v_labels
  FROM pg_enum WHERE enumtypid = 'public.quote_status'::regtype;

  IF v_labels = 'draft,sent,viewed,accepted,rejected,cancelled,invoiced' THEN
    RAISE NOTICE 'PASS T9.5: enum has the 7 canonical values';
  ELSE
    RAISE EXCEPTION 'TEST FAILED T9.5: enum is %', v_labels;
  END IF;
END $$;
