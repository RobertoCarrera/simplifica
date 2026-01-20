-- Migration: Automate Commission Calculation
-- 1. Ensure 1:1 relationship between booking and log
ALTER TABLE public.employee_productivity_logs
ADD CONSTRAINT uq_employee_productivity_booking UNIQUE (booking_id);

-- 2. Function to calculate and log commission
CREATE OR REPLACE FUNCTION public.calculate_commission_on_booking()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_employee_id UUID;
    v_service_price NUMERIC(10,2);
    v_service_name TEXT;
    v_commission_pct NUMERIC(5,2);
    v_fixed_amount NUMERIC(10,2);
    v_calculated NUMERIC(10,2);
BEGIN
    -- Only proceed if status is 'confirmed' (or 'completed' if you have that status)
    -- And if professional_id is present
    IF NEW.status = 'confirmed' AND NEW.professional_id IS NOT NULL THEN
        
        -- 1. Find Employee Record from Professional ID (Auth/User ID)
        SELECT id INTO v_employee_id
        FROM public.employees
        WHERE user_id = NEW.professional_id;

        -- If no employee record (e.g. owner working but not added as employee), skip or handle
        IF v_employee_id IS NULL THEN
            RETURN NEW; 
        END IF;

        -- 2. Get Service Details (Snapshot price from booking or service?)
        -- Assuming bookings might have price, otherwise fetch from services
        -- Let's check if 'price' exists on bookings. If not, use services.
        -- We will use a safe coalesce. 
        -- Note: bookings table usually has computed price if customization allowed.
        -- Failing that, we fetch from services.
        
        SELECT name, price INTO v_service_name, v_service_price
        FROM public.services
        WHERE id = NEW.service_id;
        
        -- 3. Get Commission Config
        SELECT commission_percentage, fixed_amount 
        INTO v_commission_pct, v_fixed_amount
        FROM public.employee_commissions_config
        WHERE employee_id = v_employee_id AND service_id = NEW.service_id;

        -- Defaults
        v_commission_pct := COALESCE(v_commission_pct, 0);
        v_fixed_amount := COALESCE(v_fixed_amount, 0);
        v_service_price := COALESCE(v_service_price, 0);

        -- 4. Calculate
        v_calculated := (v_service_price * v_commission_pct / 100) + v_fixed_amount;

        -- 5. Upsert Log
        INSERT INTO public.employee_productivity_logs (
            company_id,
            employee_id,
            booking_id,
            service_name,
            service_price,
            calculated_commission,
            performed_at
        ) VALUES (
            NEW.company_id,
            v_employee_id,
            NEW.id,
            v_service_name,
            v_service_price,
            v_calculated,
            NEW.start_time
        )
        ON CONFLICT (booking_id) DO UPDATE SET
            service_price = EXCLUDED.service_price,
            calculated_commission = EXCLUDED.calculated_commission,
            performed_at = EXCLUDED.performed_at,
            updated_at = NOW();
            
    ELSIF (NEW.status = 'cancelled' OR NEW.status = 'deleted') THEN
        -- Remove log if booking is cancelled
        DELETE FROM public.employee_productivity_logs
        WHERE booking_id = NEW.id;
    END IF;

    RETURN NEW;
END;
$$;

-- 3. Create Trigger
DROP TRIGGER IF EXISTS trg_calculate_commission ON public.bookings;

CREATE TRIGGER trg_calculate_commission
AFTER INSERT OR UPDATE ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.calculate_commission_on_booking();
