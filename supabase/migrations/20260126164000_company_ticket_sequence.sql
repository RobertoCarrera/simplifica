-- Migration: 20260126164000_company_ticket_sequence.sql

-- 1. Create a table to track the sequence for each company
--    Using a separate table is safer for concurrency than MAX(ticket_number)+1
CREATE TABLE IF NOT EXISTS public.company_ticket_sequences (
    company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
    last_val INTEGER DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Function to get next number atomically
CREATE OR REPLACE FUNCTION public.get_next_ticket_number(p_company_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_next_val INTEGER;
BEGIN
    -- Upsert: Insert 0 if not exists, then increment and return
    INSERT INTO public.company_ticket_sequences (company_id, last_val)
    VALUES (p_company_id, 0)
    ON CONFLICT (company_id) DO NOTHING;

    -- Increment and return new value (Atomic update)
    UPDATE public.company_ticket_sequences
    SET last_val = last_val + 1,
        updated_at = NOW()
    WHERE company_id = p_company_id
    RETURNING last_val INTO v_next_val;

    RETURN v_next_val;
END;
$$;

-- 3. Trigger to auto-assign ticket_number on INSERT if null
CREATE OR REPLACE FUNCTION public.set_ticket_number()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    -- Only assign if not provided (or if 0/default)
    -- We ignore the global sequence default if we want per-company
    IF NEW.ticket_number IS NULL OR NEW.ticket_number = 0 THEN
        IF NEW.company_id IS NOT NULL THEN
            NEW.ticket_number := public.get_next_ticket_number(NEW.company_id);
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- 4. Attach Trigger
DROP TRIGGER IF EXISTS trg_set_ticket_number ON public.tickets;
CREATE TRIGGER trg_set_ticket_number
    BEFORE INSERT ON public.tickets
    FOR EACH ROW
    EXECUTE FUNCTION public.set_ticket_number();

-- 5. Backfill existing companies? 
--    Optionally, run a one-time script to seed company_ticket_sequences based on MAX(ticket_number) 
--    from existing tickets to prevent collisions if we switch strategies.
--    (For now, we assume new system or we trust the global sequence didn't overlap locally too bad)
--    BETTER: Seed from existing MAX per company.

INSERT INTO public.company_ticket_sequences (company_id, last_val)
SELECT company_id, COALESCE(MAX(ticket_number), 0)
FROM public.tickets
WHERE company_id IS NOT NULL
GROUP BY company_id
ON CONFLICT (company_id) DO UPDATE
SET last_val = EXCLUDED.last_val;
