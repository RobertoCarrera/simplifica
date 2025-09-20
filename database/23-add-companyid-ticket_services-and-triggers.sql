-- Migration: add company_id to ticket_services (if missing), backfill and add triggers
-- Path: database/23-add-companyid-ticket_services-and-triggers.sql
-- Safe: checks if column exists before altering. Adds trigger to maintain tickets.total_amount

BEGIN;

-- 1) Add company_id column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'ticket_services'
          AND column_name = 'company_id'
    ) THEN
        ALTER TABLE public.ticket_services
          ADD COLUMN company_id uuid;
        RAISE NOTICE 'Added company_id to ticket_services';
    ELSE
        RAISE NOTICE 'Column company_id already exists on ticket_services';
    END IF;
END$$;

-- 2) Backfill company_id from tickets where null
-- Only run if company_id column exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ticket_services' AND column_name='company_id') THEN
        UPDATE public.ticket_services ts
        SET company_id = t.company_id
        FROM public.tickets t
        WHERE ts.ticket_id = t.id AND ts.company_id IS NULL;
        RAISE NOTICE 'Backfilled company_id on ticket_services from tickets';
    END IF;
END$$;

-- 3) Add foreign key constraint if not present (skip if constraint exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_name = 'ticket_services' AND tc.constraint_type = 'FOREIGN KEY' AND kcu.column_name = 'company_id'
    ) THEN
        -- Add FK only when the column exists
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ticket_services' AND column_name='company_id') THEN
            ALTER TABLE public.ticket_services
              ADD CONSTRAINT ticket_services_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id);
            RAISE NOTICE 'Added FK ticket_services(company_id) -> companies(id)';
        END IF;
    ELSE
        RAISE NOTICE 'Foreign key on company_id already exists for ticket_services';
    END IF;
END$$;

-- 4) Function to recompute ticket total_amount from ticket_services
CREATE OR REPLACE FUNCTION public.recompute_ticket_total(p_ticket_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    v_total numeric := 0;
BEGIN
    SELECT COALESCE(SUM(COALESCE(total_price, price_per_unit * quantity)),0)
    INTO v_total
    FROM public.ticket_services
    WHERE ticket_id = p_ticket_id;

    UPDATE public.tickets
    SET total_amount = v_total, updated_at = timezone('utc', now())
    WHERE id = p_ticket_id;
END;
$$;

-- 5) Trigger function to set company_id on insert if null, and recompute ticket total on changes
CREATE OR REPLACE FUNCTION public.trigger_ticket_services_upsert()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    -- On INSERT or UPDATE: ensure company_id is set using tickets.company_id if null
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
        IF NEW.company_id IS NULL THEN
            UPDATE public.tickets SET updated_at = timezone('utc', now()) WHERE id = NEW.ticket_id; -- ensure ticket exists
            SELECT t.company_id INTO NEW.company_id FROM public.tickets t WHERE t.id = NEW.ticket_id;
        END IF;
        PERFORM public.recompute_ticket_total(NEW.ticket_id);
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        PERFORM public.recompute_ticket_total(OLD.ticket_id);
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$;

-- 6) Create triggers for INSERT, UPDATE, DELETE
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'ticket_services_upsert_trigger') THEN
        CREATE TRIGGER ticket_services_upsert_trigger
        AFTER INSERT OR UPDATE OR DELETE ON public.ticket_services
        FOR EACH ROW EXECUTE FUNCTION public.trigger_ticket_services_upsert();
        RAISE NOTICE 'Created trigger ticket_services_upsert_trigger';
    ELSE
        RAISE NOTICE 'Trigger ticket_services_upsert_trigger already exists';
    END IF;
END$$;

COMMIT;
