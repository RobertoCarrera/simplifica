-- Fix payment_status constraint to include 'pending_local'
-- Run this in Supabase SQL Editor
-- EJECUTAR EN: https://supabase.com/dashboard/project/ufutyjbqfjrlzkprvyvs/sql/new

-- Step 1: Check current constraint on payment_status
SELECT 
  tc.constraint_name, 
  cc.check_clause
FROM information_schema.table_constraints tc
JOIN information_schema.check_constraints cc 
  ON tc.constraint_name = cc.constraint_name
WHERE tc.table_name = 'invoices' 
  AND tc.constraint_type = 'CHECK'
  AND cc.check_clause LIKE '%payment_status%';

-- Step 2: Drop ALL payment_status constraints and add the correct one
DO $$
DECLARE
  constraint_rec RECORD;
BEGIN
  -- Find and drop ALL constraints related to payment_status
  FOR constraint_rec IN 
    SELECT tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.check_constraints cc 
      ON tc.constraint_name = cc.constraint_name
    WHERE tc.table_name = 'invoices' 
      AND tc.table_schema = 'public'
      AND tc.constraint_type = 'CHECK'
      AND cc.check_clause LIKE '%payment_status%'
  LOOP
    EXECUTE format('ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS %I', constraint_rec.constraint_name);
    RAISE NOTICE 'Dropped constraint: %', constraint_rec.constraint_name;
  END LOOP;
  
  -- Also try dropping by common names (just in case)
  BEGIN
    ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_payment_status_check;
    RAISE NOTICE 'Dropped invoices_payment_status_check';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'No constraint named invoices_payment_status_check';
  END;
  
  -- Add the new constraint with 'pending_local' included
  ALTER TABLE public.invoices 
  ADD CONSTRAINT invoices_payment_status_check 
  CHECK (payment_status IN ('pending', 'pending_local', 'partial', 'paid', 'refunded', 'cancelled'));
  
  RAISE NOTICE 'Added new payment_status constraint with pending_local';
END $$;

-- Step 3: Verify the new constraint
SELECT 
  tc.constraint_name, 
  cc.check_clause
FROM information_schema.table_constraints tc
JOIN information_schema.check_constraints cc 
  ON tc.constraint_name = cc.constraint_name
WHERE tc.table_name = 'invoices' 
  AND tc.constraint_type = 'CHECK'
  AND cc.check_clause LIKE '%payment_status%';

-- Step 4: Test - Try to update an invoice to pending_local (optional)
-- UPDATE public.invoices 
-- SET payment_status = 'pending_local' 
-- WHERE id = '842f802e-a2c4-414a-a20c-d6010bd73b40';
