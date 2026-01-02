-- Cleanup script for GEMMA SOCIAS LAHOZ test data (Force Clean v3)

DO $$
DECLARE
    v_client_id uuid;
    v_company_id uuid;
BEGIN
    -- 1. Find the client
    SELECT id, company_id INTO v_client_id, v_company_id
    FROM public.clients 
    WHERE name LIKE '%GEMMA SOCIAS LAHOZ%' 
    LIMIT 1;

    IF v_client_id IS NOT NULL THEN
        RAISE NOTICE 'Cleaning up data for Client ID: %, Company: %', v_client_id, v_company_id;

        -- DISABLE USER TRIGGERS (avoids permission error on system triggers)
        ALTER TABLE public.invoices DISABLE TRIGGER USER;
        ALTER TABLE public.invoice_items DISABLE TRIGGER USER; 

        -- 2. Delete Invoices & Items
        DELETE FROM public.invoice_items 
        WHERE invoice_id IN (SELECT id FROM public.invoices WHERE client_id = v_client_id);
        
        DELETE FROM public.invoices 
        WHERE client_id = v_client_id;

        -- RE-ENABLE USER TRIGGERS
        ALTER TABLE public.invoices ENABLE TRIGGER USER;
        ALTER TABLE public.invoice_items ENABLE TRIGGER USER;

        -- 3. Delete Quote Items & Quotes
        DELETE FROM public.quote_items 
        WHERE quote_id IN (SELECT id FROM public.quotes WHERE client_id = v_client_id);

        DELETE FROM public.quotes 
        WHERE client_id = v_client_id;

        -- 4. (Attributes are cleaned up by deleting quotes/invoices)
        -- DO NOT Unlink Auth User - this breaks login
        -- UPDATE public.clients SET auth_user_id = NULL WHERE id = v_client_id;
        
        RAISE NOTICE 'Cleanup complete successfully.';
    ELSE
        RAISE NOTICE 'Client GEMMA SOCIAS LAHOZ not found. Skipping cleanup.';
    END IF;
EXCEPTION WHEN OTHERS THEN
    -- Safety: Try to re-enable triggers if something fails
    ALTER TABLE public.invoices ENABLE TRIGGER USER;
    ALTER TABLE public.invoice_items ENABLE TRIGGER USER;
    RAISE;
END;
$$;
