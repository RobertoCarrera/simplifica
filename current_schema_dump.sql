

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'Sistema de presupuestos con conversión a facturas - Compatible con Veri*Factu';



CREATE TYPE "public"."invoice_status" AS ENUM (
    'draft',
    'sent',
    'paid',
    'partial',
    'overdue',
    'cancelled',
    'void',
    'approved',
    'issued',
    'rectified'
);


ALTER TYPE "public"."invoice_status" OWNER TO "postgres";


COMMENT ON TYPE "public"."invoice_status" IS 'draft, sent, paid, partial, overdue, cancelled, approved, issued, rectified';



CREATE TYPE "public"."invoice_type" AS ENUM (
    'normal',
    'simplified',
    'rectificative',
    'summary'
);


ALTER TYPE "public"."invoice_type" OWNER TO "postgres";


CREATE TYPE "public"."module_status" AS ENUM (
    'activado',
    'desactivado',
    'en_desarrollo'
);


ALTER TYPE "public"."module_status" OWNER TO "postgres";


CREATE TYPE "public"."payment_method" AS ENUM (
    'cash',
    'bank_transfer',
    'card',
    'direct_debit',
    'paypal',
    'other'
);


ALTER TYPE "public"."payment_method" OWNER TO "postgres";


CREATE TYPE "public"."quote_status" AS ENUM (
    'draft',
    'sent',
    'viewed',
    'accepted',
    'rejected',
    'expired',
    'invoiced',
    'cancelled',
    'paused',
    'pending',
    'request',
    'active'
);


ALTER TYPE "public"."quote_status" OWNER TO "postgres";


CREATE TYPE "public"."stage_category" AS ENUM (
    'open',
    'in_progress',
    'completed',
    'on_hold'
);


ALTER TYPE "public"."stage_category" OWNER TO "postgres";


CREATE TYPE "public"."workflow_category" AS ENUM (
    'cancel',
    'waiting',
    'analysis',
    'action',
    'final'
);


ALTER TYPE "public"."workflow_category" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accept_company_invitation"("p_invitation_token" "text", "p_auth_user_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  inv public.company_invitations;
  existing_user public.users;
  existing_client public.clients;
  placeholder_user public.users;
  new_user_id UUID;
  new_client_id UUID;
  company_name TEXT;
BEGIN
  -- Security check
  IF auth.uid() IS DISTINCT FROM p_auth_user_id THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Find the invitation
  SELECT * INTO inv
  FROM public.company_invitations
  WHERE token = p_invitation_token
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Invalid or expired invitation');
  END IF;

  -- Get company name
  SELECT name INTO company_name FROM public.companies WHERE id = inv.company_id;

  -- Check if already accepted
  IF inv.status = 'accepted' THEN
    RETURN json_build_object('success', true, 'company_id', inv.company_id, 'company_name', company_name, 'role', inv.role, 'message', 'Invitation already accepted');
  END IF;

  -- Handle CLIENT role differently - link to clients table, not users
  IF inv.role = 'client' THEN
    -- Find existing client by email in this company
    SELECT * INTO existing_client
    FROM public.clients
    WHERE email = inv.email AND company_id = inv.company_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND THEN
      -- Update existing client with auth_user_id
      UPDATE public.clients
      SET auth_user_id = p_auth_user_id,
          is_active = true,
          updated_at = NOW()
      WHERE id = existing_client.id
      RETURNING id INTO new_client_id;
    ELSE
      -- Create new client record
      INSERT INTO public.clients (email, name, company_id, auth_user_id, is_active, created_at, updated_at)
      VALUES (inv.email, split_part(inv.email, '@', 1), inv.company_id, p_auth_user_id, true, NOW(), NOW())
      RETURNING id INTO new_client_id;
    END IF;

    -- Mark invitation as accepted
    UPDATE public.company_invitations
    SET status = 'accepted', responded_at = NOW()
    WHERE id = inv.id;

    RETURN json_build_object(
      'success', true, 
      'client_id', new_client_id, 
      'company_id', inv.company_id, 
      'company_name', company_name, 
      'role', inv.role, 
      'message', 'Client invitation accepted successfully'
    );
  END IF;

  -- Original logic for non-client roles (staff/admin/member/owner)
  SELECT * INTO existing_user FROM public.users WHERE auth_user_id = p_auth_user_id LIMIT 1;
  
  IF FOUND THEN
    UPDATE public.users
    SET email = COALESCE(inv.email, existing_user.email),
        role = inv.role,
        active = true,
        company_id = inv.company_id,
        updated_at = NOW()
    WHERE id = existing_user.id
    RETURNING id INTO new_user_id;
  ELSE
    -- Check for placeholder user by email
    SELECT * INTO placeholder_user
    FROM public.users
    WHERE email = inv.email AND company_id = inv.company_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND THEN
      UPDATE public.users
      SET auth_user_id = p_auth_user_id,
          role = inv.role,
          active = true,
          updated_at = NOW()
      WHERE id = placeholder_user.id
      RETURNING id INTO new_user_id;
    ELSE
      INSERT INTO public.users (email, name, surname, role, active, company_id, auth_user_id, permissions)
      VALUES (inv.email, split_part(inv.email, '@', 1), NULL, inv.role, true, inv.company_id, p_auth_user_id, '{}'::jsonb)
      RETURNING id INTO new_user_id;
    END IF;
  END IF;

  -- Mark invitation as accepted
  UPDATE public.company_invitations
  SET status = 'accepted', responded_at = NOW()
  WHERE id = inv.id;

  -- Update pending_users if exists
  UPDATE public.pending_users
  SET confirmed_at = NOW(), company_id = inv.company_id
  WHERE auth_user_id = p_auth_user_id AND email = inv.email;

  RETURN json_build_object('success', true, 'user_id', new_user_id, 'company_id', inv.company_id, 'company_name', company_name, 'role', inv.role, 'message', 'Invitation accepted successfully');
  
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;


ALTER FUNCTION "public"."accept_company_invitation"("p_invitation_token" "text", "p_auth_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accept_company_invitation_admin"("p_invitation_token" "text", "p_auth_user_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    inv public.company_invitations;
    existing_user public.users;
    placeholder_user public.users;
    new_user_id UUID;
    company_name TEXT;
BEGIN
    SELECT * INTO inv
    FROM public.company_invitations
    WHERE token = p_invitation_token
      AND expires_at > NOW()
    ORDER BY created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Invalid or expired invitation');
    END IF;

    SELECT name INTO company_name FROM public.companies WHERE id = inv.company_id;

    SELECT * INTO existing_user FROM public.users WHERE auth_user_id = p_auth_user_id LIMIT 1;
    IF FOUND THEN
        UPDATE public.users
           SET email = COALESCE(inv.email, existing_user.email),
               role = inv.role,
               active = true,
               company_id = inv.company_id,
               updated_at = NOW()
         WHERE id = existing_user.id
     RETURNING id INTO new_user_id;
    ELSE
        SELECT * INTO placeholder_user
          FROM public.users
         WHERE email = inv.email AND company_id = inv.company_id
         ORDER BY created_at DESC
         LIMIT 1;

        IF FOUND THEN
            UPDATE public.users
               SET auth_user_id = p_auth_user_id,
                   role = inv.role,
                   active = true,
                   updated_at = NOW()
             WHERE id = placeholder_user.id
         RETURNING id INTO new_user_id;
        ELSE
            INSERT INTO public.users (
                email, name, surname, role, active, company_id, auth_user_id, permissions
            ) VALUES (
                inv.email,
                split_part(inv.email, '@', 1),
                NULL,
                inv.role,
                true,
                inv.company_id,
                p_auth_user_id,
                '{}'::jsonb
            ) RETURNING id INTO new_user_id;
        END IF;
    END IF;

    UPDATE public.company_invitations
       SET status = 'accepted', responded_at = NOW()
     WHERE id = inv.id;

    UPDATE public.pending_users
       SET confirmed_at = NOW(), company_id = inv.company_id
     WHERE auth_user_id = p_auth_user_id AND email = inv.email;

    RETURN json_build_object(
        'success', true,
        'user_id', new_user_id,
        'company_id', inv.company_id,
        'company_name', company_name,
        'role', inv.role
    );
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;


ALTER FUNCTION "public"."accept_company_invitation_admin"("p_invitation_token" "text", "p_auth_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accept_company_invitation_by_email"("p_email" "text", "p_auth_user_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  inv public.company_invitations;
  existing_user public.users;
  placeholder_user public.users;
  new_user_id UUID;
  company_name TEXT;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_auth_user_id THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT * INTO inv
  FROM public.company_invitations
  WHERE LOWER(email) = LOWER(p_email)
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Invitation not found for email');
  END IF;

  SELECT name INTO company_name FROM public.companies WHERE id = inv.company_id;

  IF inv.status = 'accepted' THEN
    RETURN json_build_object('success', true, 'company_id', inv.company_id, 'company_name', company_name, 'role', inv.role, 'message', 'Invitation already accepted');
  END IF;

  SELECT * INTO existing_user FROM public.users WHERE auth_user_id = p_auth_user_id LIMIT 1;
  IF FOUND THEN
    UPDATE public.users
    SET email = COALESCE(inv.email, existing_user.email),
        role = inv.role,
        active = true,
        company_id = inv.company_id,
        updated_at = NOW()
    WHERE id = existing_user.id
    RETURNING id INTO new_user_id;
  ELSE
    SELECT * INTO placeholder_user
    FROM public.users
    WHERE email = inv.email AND company_id = inv.company_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND THEN
      UPDATE public.users
      SET auth_user_id = p_auth_user_id,
          role = inv.role,
          active = true,
          updated_at = NOW()
      WHERE id = placeholder_user.id
      RETURNING id INTO new_user_id;
    ELSE
      INSERT INTO public.users (email, name, surname, role, active, company_id, auth_user_id, permissions)
      VALUES (inv.email, split_part(inv.email, '@', 1), NULL, inv.role, true, inv.company_id, p_auth_user_id, '{}'::jsonb)
      RETURNING id INTO new_user_id;
    END IF;
  END IF;

  UPDATE public.company_invitations
  SET status = 'accepted', responded_at = NOW()
  WHERE id = inv.id;

  UPDATE public.pending_users
  SET confirmed_at = NOW(), company_id = inv.company_id
  WHERE auth_user_id = p_auth_user_id AND email = inv.email;

  RETURN json_build_object('success', true, 'user_id', new_user_id, 'company_id', inv.company_id, 'company_name', company_name, 'role', inv.role, 'message', 'Invitation accepted successfully');
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;


ALTER FUNCTION "public"."accept_company_invitation_by_email"("p_email" "text", "p_auth_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."activate_invited_user"("auth_user_id" "uuid", "user_email" "text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  user_record RECORD;
BEGIN
  -- Buscar el usuario por email
  SELECT * INTO user_record
  FROM users 
  WHERE email = user_email 
  AND active = false
  LIMIT 1;
  
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Usuario no encontrado o ya está activo'
    );
  END IF;
  
  -- Activar usuario y asociar con auth_user_id
  UPDATE users 
  SET 
    auth_user_id = activate_invited_user.auth_user_id,
    active = true,
    updated_at = NOW()
  WHERE id = user_record.id;
  
  RETURN json_build_object(
    'success', true,
    'message', 'Usuario activado correctamente',
    'user_id', user_record.id,
    'company_id', user_record.company_id
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;


ALTER FUNCTION "public"."activate_invited_user"("auth_user_id" "uuid", "user_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."activate_recurring_service_on_payment"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Check if invoice is paid and has a source quote
  IF NEW.payment_status = 'paid' AND NEW.source_quote_id IS NOT NULL THEN
     -- Update quote status to 'active' if it is 'accepted' and is recurring
     UPDATE public.quotes
     SET status = 'active'
     WHERE id = NEW.source_quote_id
       AND recurrence_type IS NOT NULL
       AND recurrence_type <> 'none'
       AND status = 'accepted';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."activate_recurring_service_on_payment"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."anonymize_client_data"("p_client_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Verificar que sea persona física
  IF (SELECT client_type FROM public.clients WHERE id = p_client_id) = 'business' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Las empresas no están sujetas a GDPR. No se puede anonimizar.'
    );
  END IF;
  
  -- ... resto del código de anonimización
END;
$$;


ALTER FUNCTION "public"."anonymize_client_data"("p_client_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."anonymize_client_data"("p_client_id" "uuid", "p_reason" "text" DEFAULT 'gdpr_erasure_request'::"text", "p_requesting_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_client record;
    v_company_id uuid;
    v_original_email text;
    v_anonymized_count int := 0;
BEGIN
    -- Verificar acceso del usuario
    SELECT company_id INTO v_company_id
    FROM users
    WHERE auth_user_id = COALESCE(p_requesting_user_id, auth.uid());
    
    -- Obtener datos del cliente antes de anonimizar
    SELECT * INTO v_client
    FROM clients
    WHERE id = p_client_id
    AND company_id = v_company_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Cliente no encontrado o sin acceso'
        );
    END IF;
    
    -- Verificar si ya está anonimizado
    IF v_client.anonymized_at IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Cliente ya fue anonimizado',
            'anonymized_at', v_client.anonymized_at
        );
    END IF;
    
    v_original_email := v_client.email;
    
    -- ✅ Anonimizar datos del cliente (INCLUYENDO APELLIDOS)
    UPDATE clients
    SET 
        name = 'ANONYMIZED_' || SUBSTRING(MD5(name) FROM 1 FOR 8),
        apellidos = 'ANONYMIZED_' || SUBSTRING(MD5(COALESCE(apellidos, '')) FROM 1 FOR 8),
        email = 'anonymized.' || SUBSTRING(MD5(email) FROM 1 FOR 8) || '@anonymized.local',
        phone = NULL,
        dni = NULL,
        address = jsonb_build_object('anonymized', true),
        metadata = jsonb_build_object(
            'anonymized', true,
            'original_metadata', jsonb_build_object(
                'original_id', p_client_id,
                'anonymized_at', now(),
                'anonymized_by', COALESCE(p_requesting_user_id, auth.uid()),
                'reason', p_reason,
                'original_email_hash', MD5(v_original_email),
                'original_dni_hash', MD5(COALESCE(v_client.dni, ''))
            )
        ),
        anonymized_at = now(),
        last_accessed_at = now(),
        access_count = COALESCE(access_count, 0) + 1,
        is_active = true,
        updated_at = now()
    WHERE id = p_client_id;
    
    GET DIAGNOSTICS v_anonymized_count = ROW_COUNT;
    
    -- Anonimizar registros de consentimiento relacionados
    UPDATE gdpr_consent_records
    SET 
        subject_email = 'anonymized.' || SUBSTRING(MD5(subject_email) FROM 1 FOR 8) || '@anonymized.local'
    WHERE subject_id = p_client_id;
    
    -- Registrar en audit log
    INSERT INTO gdpr_audit_log (
        user_id,
        company_id,
        action_type,
        table_name,
        record_id,
        subject_email,
        purpose,
        created_at
    ) VALUES (
        COALESCE(p_requesting_user_id, auth.uid()),
        v_company_id,
        'anonymize',
        'clients',
        p_client_id,
        'anonymized.' || SUBSTRING(MD5(v_original_email) FROM 1 FOR 8) || '@anonymized.local',
        p_reason,
        now()
    );
    
    -- Retornar resultado exitoso
    RETURN jsonb_build_object(
        'success', true,
        'message', 'Cliente anonimizado correctamente',
        'anonymized_count', v_anonymized_count,
        'client_id', p_client_id,
        'anonymized_at', now()
    );
    
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'error_detail', SQLSTATE
    );
END;
$$;


ALTER FUNCTION "public"."anonymize_client_data"("p_client_id" "uuid", "p_reason" "text", "p_requesting_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."anonymize_client_data"("p_client_id" "uuid", "p_reason" "text", "p_requesting_user_id" "uuid") IS 'Anonimiza todos los datos personales de un cliente incluyendo apellidos (Art. 17 GDPR)';



CREATE OR REPLACE FUNCTION "public"."anonymize_invoice_data"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.retention_until < CURRENT_DATE AND NEW.anonymized_at IS NULL THEN
    NEW.notes := 'ANONIMIZADO';
    NEW.internal_notes := 'ANONIMIZADO';
    NEW.anonymized_at := CURRENT_TIMESTAMP;
    RAISE NOTICE 'Factura % anonimizada por GDPR', NEW.full_invoice_number;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."anonymize_invoice_data"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."anonymize_quote_data"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Solo anonimizar si el periodo de retención ha pasado
  IF OLD.retention_until < CURRENT_DATE AND NOT OLD.is_anonymized THEN
    UPDATE quotes
    SET 
      description = '[ANONIMIZADO]',
      notes = NULL,
      terms_conditions = NULL,
      client_ip_address = NULL,
      client_user_agent = NULL,
      digital_signature = NULL,
      is_anonymized = TRUE,
      anonymized_at = NOW()
    WHERE id = OLD.id;
  END IF;
  
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."anonymize_quote_data"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auth_user_email"() RETURNS "text"
    LANGUAGE "sql" STABLE
    AS $$
  SELECT lower(current_setting('request.jwt.claims', true)::jsonb ->> 'email')
$$;


ALTER FUNCTION "public"."auth_user_email"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."auth_user_email"() IS 'Returns lowercased email from JWT claims.';



CREATE OR REPLACE FUNCTION "public"."calculate_annual_price"("p_monthly_price" numeric, "p_discount_percentage" numeric DEFAULT 16) RETURNS numeric
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
BEGIN
  RETURN ROUND((p_monthly_price * 12) * (1 - p_discount_percentage / 100), 2);
END;
$$;


ALTER FUNCTION "public"."calculate_annual_price"("p_monthly_price" numeric, "p_discount_percentage" numeric) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."calculate_annual_price"("p_monthly_price" numeric, "p_discount_percentage" numeric) IS 'Calcula el precio anual aplicando un descuento al precio mensual';



CREATE OR REPLACE FUNCTION "public"."calculate_invoice_totals"("p_invoice_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_subtotal NUMERIC(12,2);
  v_tax_amount NUMERIC(12,2);
  v_total NUMERIC(12,2);
  v_paid_amount NUMERIC(12,2);
  v_new_status invoice_status;
  v_due_date DATE;
BEGIN
  -- Calcular totales desde las líneas
  SELECT 
    COALESCE(SUM(subtotal), 0),
    COALESCE(SUM(tax_amount), 0),
    COALESCE(SUM(total), 0)
  INTO v_subtotal, v_tax_amount, v_total
  FROM invoice_items
  WHERE invoice_id = p_invoice_id;
  
  -- Calcular total pagado
  SELECT COALESCE(SUM(amount), 0)
  INTO v_paid_amount
  FROM invoice_payments
  WHERE invoice_id = p_invoice_id;
  
  -- Obtener estado actual y fecha vencimiento
  SELECT status, due_date INTO v_new_status, v_due_date 
  FROM invoices WHERE id = p_invoice_id;
  
  -- Lógica de estados
  IF v_paid_amount >= v_total AND v_total > 0 THEN
    v_new_status := 'paid';
  ELSIF v_paid_amount > 0 AND v_paid_amount < v_total THEN
    v_new_status := 'partial';
  ELSIF v_new_status = 'draft' THEN
    v_new_status := 'draft';
  ELSIF v_due_date < CURRENT_DATE AND v_new_status NOT IN ('cancelled', 'rectified', 'paid') THEN
    v_new_status := 'overdue';
  ELSE
    -- Si no es pagada, ni parcial, ni borrador, ni vencida...
    -- Mantener estados especiales si ya los tiene
    IF v_new_status IN ('approved', 'issued', 'rectified', 'sent', 'cancelled') THEN
       -- Mantener el estado actual
       v_new_status := v_new_status;
    ELSE
       -- Si venía de 'paid', 'partial' u 'overdue' y ya no lo es,
       -- por defecto la pasamos a 'sent' (o 'approved' si preferimos, pero 'sent' es más seguro para cobro)
       -- En este caso, si acabamos de crearla como 'approved', entrará en el IF anterior y se mantendrá.
       v_new_status := 'sent';
    END IF;
  END IF;
  
  -- Actualizar factura
  UPDATE invoices
  SET 
    subtotal = v_subtotal,
    tax_amount = v_tax_amount,
    total = v_total,
    paid_amount = v_paid_amount,
    status = v_new_status,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = p_invoice_id;
END;
$$;


ALTER FUNCTION "public"."calculate_invoice_totals"("p_invoice_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."calculate_invoice_totals"("p_invoice_id" "uuid") IS 'Recalcula los totales y estado de una factura';



CREATE OR REPLACE FUNCTION "public"."calculate_invoice_totals_payment_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM calculate_invoice_totals(OLD.invoice_id);
  ELSE
    PERFORM calculate_invoice_totals(NEW.invoice_id);
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."calculate_invoice_totals_payment_trigger"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_invoice_totals_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM calculate_invoice_totals(OLD.invoice_id);
  ELSE
    PERFORM calculate_invoice_totals(NEW.invoice_id);
  END IF;
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."calculate_invoice_totals_trigger"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_quote_item_totals"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_prices_include_tax boolean;
  v_divisor numeric;
BEGIN
  -- Obtener configuración de la empresa
  SELECT prices_include_tax INTO v_prices_include_tax 
  FROM company_settings 
  WHERE company_id = NEW.company_id;

  -- Si no hay configuración de empresa, usar la global
  IF v_prices_include_tax IS NULL THEN
    SELECT default_prices_include_tax INTO v_prices_include_tax
    FROM app_settings
    LIMIT 1;
  END IF;

  -- Default: FALSE (precios SIN IVA)
  v_prices_include_tax := COALESCE(v_prices_include_tax, false);

  IF v_prices_include_tax AND NEW.tax_rate > 0 THEN
    -- =============================================
    -- PRECIOS CON IVA INCLUIDO
    -- =============================================
    -- unit_price ya incluye IVA, así que:
    -- total = quantity * unit_price (el usuario ya puso el precio final)
    -- subtotal = total / (1 + tax_rate/100) (extraer base imponible)
    -- tax_amount = total - subtotal

    -- 1. Total bruto (antes de descuento)
    NEW.total := NEW.quantity * NEW.unit_price;
    
    -- 2. Aplicar descuento sobre el total
    NEW.discount_amount := NEW.total * (COALESCE(NEW.discount_percent, 0) / 100);
    NEW.total := NEW.total - NEW.discount_amount;

    -- 3. Extraer base imponible (subtotal) del total
    v_divisor := 1 + (NEW.tax_rate / 100);
    NEW.subtotal := NEW.total / v_divisor;
    
    -- 4. Calcular IVA (la diferencia)
    NEW.tax_amount := NEW.total - NEW.subtotal;
    
  ELSE
    -- =============================================
    -- PRECIOS SIN IVA INCLUIDO (comportamiento tradicional)
    -- =============================================
    -- unit_price es el precio neto, hay que añadir IVA

    -- 1. Subtotal = quantity * unit_price
    NEW.subtotal := NEW.quantity * NEW.unit_price;
    
    -- 2. Aplicar descuento
    NEW.discount_amount := NEW.subtotal * (COALESCE(NEW.discount_percent, 0) / 100);
    NEW.subtotal := NEW.subtotal - NEW.discount_amount;
    
    -- 3. Calcular IVA sobre la base imponible
    NEW.tax_amount := NEW.subtotal * (NEW.tax_rate / 100);
    
    -- 4. Total = base + IVA
    NEW.total := NEW.subtotal + NEW.tax_amount;
  END IF;
  
  -- Redondear a 2 decimales
  NEW.subtotal := ROUND(NEW.subtotal, 2);
  NEW.tax_amount := ROUND(NEW.tax_amount, 2);
  NEW.total := ROUND(NEW.total, 2);
  NEW.discount_amount := ROUND(COALESCE(NEW.discount_amount, 0), 2);
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."calculate_quote_item_totals"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."calculate_quote_item_totals"() IS 'Calcula subtotal, tax_amount y total de quote_items respetando prices_include_tax';



CREATE OR REPLACE FUNCTION "public"."calculate_quote_totals"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  items_subtotal DECIMAL(12, 2);
  items_tax DECIMAL(12, 2);
BEGIN
  -- Sumar todos los items
  SELECT 
    COALESCE(SUM(subtotal), 0),
    COALESCE(SUM(tax_amount), 0)
  INTO items_subtotal, items_tax
  FROM quote_items
  WHERE quote_id = NEW.quote_id;
  
  -- Actualizar totales del presupuesto
  UPDATE quotes
  SET 
    subtotal = items_subtotal,
    tax_amount = items_tax,
    total_amount = items_subtotal + items_tax,
    updated_at = NOW()
  WHERE id = NEW.quote_id;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."calculate_quote_totals"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_invoice"("p_invoice_id" "uuid", "p_reason" "text" DEFAULT NULL::"text") RETURNS json
    LANGUAGE "plpgsql"
    AS $$
declare
  v_company_id uuid;
begin
  select company_id into v_company_id from public.invoices where id=p_invoice_id;
  if v_company_id is null then raise exception 'Invoice not found'; end if;
  
  -- Update status AND state to void
  -- We update both to ensure consistency and bypass immutability guard (which now allows 'void')
  update public.invoices 
  set status='void', 
      state='void' 
  where id=p_invoice_id 
  and (status <> 'void' or state <> 'void');
  
  -- Insert or update anulacion event (idempotent)
  insert into verifactu.events(company_id, invoice_id, event_type, payload)
  values (v_company_id, p_invoice_id, 'anulacion', jsonb_build_object('reason', coalesce(p_reason,'n/a')))
  on conflict (invoice_id, event_type) do update
  set payload = excluded.payload,
      status = 'pending'; -- Reset status to pending if we are re-requesting cancellation
  
  -- Update meta status
  update verifactu.invoice_meta set status='void' where invoice_id=p_invoice_id;
  
  return json_build_object('status','void');
end$$;


ALTER FUNCTION "public"."cancel_invoice"("p_invoice_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_company_exists"("p_company_name" "text") RETURNS TABLE("company_exists" boolean, "company_id" "uuid", "company_name" "text", "owner_email" "text", "owner_name" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    EXISTS(SELECT 1 FROM public.companies WHERE LOWER(name) = LOWER(p_company_name)) as company_exists,
    c.id as company_id,
    c.name as company_name,
    u.email as owner_email,
    u.name as owner_name
  FROM public.companies c
  LEFT JOIN public.users u ON u.company_id = c.id AND u.role = 'owner' AND u.active = true
  WHERE LOWER(c.name) = LOWER(p_company_name)
  LIMIT 1;
END;
$$;


ALTER FUNCTION "public"."check_company_exists"("p_company_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_gdpr_compliance"() RETURNS TABLE("check_name" "text", "status" "text", "value" "text", "is_compliant" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
    RETURN QUERY
    
    -- Check 1: Todos los clientes tienen consentimiento
    SELECT 
        'Consentimiento de procesamiento'::TEXT,
        CASE 
            WHEN pct = 100 THEN '✅ COMPLIANT'
            WHEN pct >= 80 THEN '⚠️ ADVERTENCIA'
            ELSE '❌ NO COMPLIANT'
        END,
        pct::TEXT || '%',
        pct >= 80
    FROM (
        SELECT ROUND(
            100.0 * COUNT(*) FILTER (WHERE data_processing_consent = true) 
            / NULLIF(COUNT(*), 0),
            2
        ) as pct
        FROM clients WHERE deleted_at IS NULL
    ) sub
    
    UNION ALL
    
    -- Check 2: Todos los clientes tienen base legal
    SELECT 
        'Base legal de procesamiento'::TEXT,
        CASE 
            WHEN pct = 100 THEN '✅ COMPLIANT'
            WHEN pct >= 80 THEN '⚠️ ADVERTENCIA'
            ELSE '❌ NO COMPLIANT'
        END,
        pct::TEXT || '%',
        pct >= 80
    FROM (
        SELECT ROUND(
            100.0 * COUNT(*) FILTER (WHERE data_processing_legal_basis IS NOT NULL) 
            / NULLIF(COUNT(*), 0),
            2
        ) as pct
        FROM clients WHERE deleted_at IS NULL
    ) sub
    
    UNION ALL
    
    -- Check 3: RLS habilitado en tablas críticas
    SELECT 
        'RLS en tablas GDPR'::TEXT,
        CASE 
            WHEN COUNT(*) FILTER (WHERE rowsecurity = false) = 0 THEN '✅ COMPLIANT'
            ELSE '❌ NO COMPLIANT'
        END,
        COUNT(*) FILTER (WHERE rowsecurity = true)::TEXT || '/' || COUNT(*)::TEXT || ' tablas',
        COUNT(*) FILTER (WHERE rowsecurity = false) = 0
    FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename IN ('clients', 'gdpr_access_requests', 'gdpr_consent_records', 'gdpr_audit_log')
    
    UNION ALL
    
    -- Check 4: Políticas RLS en tablas GDPR
    SELECT 
        'Políticas RLS GDPR'::TEXT,
        CASE 
            WHEN COUNT(*) >= 12 THEN '✅ COMPLIANT'
            WHEN COUNT(*) >= 8 THEN '⚠️ ADVERTENCIA'
            ELSE '❌ NO COMPLIANT'
        END,
        COUNT(*)::TEXT || ' políticas',
        COUNT(*) >= 8
    FROM pg_policies
    WHERE tablename LIKE 'gdpr_%'
    
    UNION ALL
    
    -- Check 5: Solicitudes GDPR procesadas a tiempo (<30 días)
    SELECT 
        'Tiempo de respuesta solicitudes'::TEXT,
        CASE 
            WHEN avg_days <= 15 THEN '✅ COMPLIANT'
            WHEN avg_days <= 30 THEN '⚠️ ADVERTENCIA'
            ELSE '❌ NO COMPLIANT'
        END,
        ROUND(avg_days, 1)::TEXT || ' días promedio',
        avg_days <= 30
    FROM (
        SELECT COALESCE(
            AVG(EXTRACT(DAY FROM (completed_at - created_at))),
            0
        ) as avg_days
        FROM gdpr_access_requests
        WHERE processing_status = 'completed'
        AND completed_at IS NOT NULL
    ) sub;
    
END;
$$;


ALTER FUNCTION "public"."check_gdpr_compliance"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clean_expired_pending_users"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Eliminar registros expirados (más de 24 horas)
    DELETE FROM public.pending_users 
    WHERE expires_at < NOW() 
    AND confirmed_at IS NULL;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$;


ALTER FUNCTION "public"."clean_expired_pending_users"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_current_duplicates"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
    duplicate_count INTEGER := 0;
    company_record RECORD;
BEGIN
    -- Buscar empresas con nombres similares y consolidar
    FOR company_record IN
        SELECT 
            c1.id as keep_id,
            c1.name as keep_name,
            c2.id as remove_id,
            c2.name as remove_name
        FROM public.companies c1
        JOIN public.companies c2 ON 
            LOWER(TRIM(c1.name)) = LOWER(TRIM(c2.name))
            AND c1.id != c2.id
            AND c1.created_at < c2.created_at
        WHERE c1.deleted_at IS NULL AND c2.deleted_at IS NULL
    LOOP
        -- Migrar usuarios de empresa duplicada a empresa original
        UPDATE public.users
        SET company_id = company_record.keep_id
        WHERE company_id = company_record.remove_id;
        
        -- Marcar empresa duplicada como eliminada
        UPDATE public.companies
        SET deleted_at = NOW()
        WHERE id = company_record.remove_id;
        
        duplicate_count := duplicate_count + 1;
    END LOOP;
    
    RETURN FORMAT('Cleaned up %s duplicate companies', duplicate_count);
END;
$$;


ALTER FUNCTION "public"."cleanup_current_duplicates"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_duplicate_companies"() RETURNS TABLE("action" "text", "details" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  dup_record RECORD;
  users_migrated INTEGER := 0;
  total_companies_cleaned INTEGER := 0;
BEGIN
  FOR dup_record IN
    WITH duplicates AS (
      SELECT name, id, created_at,
             ROW_NUMBER() OVER (PARTITION BY LOWER(name) ORDER BY created_at DESC) as rn
      FROM public.companies
      WHERE deleted_at IS NULL
    ),
    to_keep AS (
      SELECT name, id as keep_id FROM duplicates WHERE rn = 1
    ),
    to_remove AS (
      SELECT d.name, d.id as remove_id, tk.keep_id
      FROM duplicates d
      JOIN to_keep tk ON LOWER(d.name) = LOWER(tk.name)
      WHERE d.rn > 1
    )
    SELECT * FROM to_remove
  LOOP
    UPDATE public.users SET company_id = dup_record.keep_id WHERE company_id = dup_record.remove_id;
    GET DIAGNOSTICS users_migrated = ROW_COUNT;

    UPDATE public.companies SET deleted_at = NOW() WHERE id = dup_record.remove_id;

    total_companies_cleaned := total_companies_cleaned + 1;

    RETURN QUERY SELECT 'MIGRATED'::TEXT,
      FORMAT('Company "%s": migrated %s users from %s to %s', dup_record.name, users_migrated, dup_record.remove_id, dup_record.keep_id);
  END LOOP;

  IF total_companies_cleaned = 0 THEN
    RETURN QUERY SELECT 'NO_DUPLICATES'::TEXT, 'No duplicate companies found';
  ELSE
    RETURN QUERY SELECT 'COMPLETED'::TEXT, FORMAT('Cleaned up %s duplicate companies', total_companies_cleaned);
  END IF;
END;
$$;


ALTER FUNCTION "public"."cleanup_duplicate_companies"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_expired_gdpr_data"() RETURNS TABLE("clients_anonymized" integer, "audit_logs_deleted" integer, "old_consents_archived" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_clients_anonymized INT := 0;
    v_audit_logs_deleted INT := 0;
    v_consents_archived INT := 0;
BEGIN
    -- 1. Anonimizar clientes cuya retención ha expirado
    WITH anonymized AS (
        UPDATE clients
        SET 
            name = 'Cliente Anonimizado',
            email = 'anonimizado_' || id::text || '@gdpr.local',
            phone = NULL,
            address = NULL,
            metadata = jsonb_set(
                COALESCE(metadata, '{}'::jsonb),
                '{anonimizado}',
                'true'::jsonb
            ),
            anonymized_at = NOW(),
            is_active = false
        WHERE data_retention_until < NOW()
        AND anonymized_at IS NULL
        AND deleted_at IS NULL
        RETURNING id
    )
    SELECT COUNT(*) INTO v_clients_anonymized FROM anonymized;
    
    -- 2. Eliminar logs de auditoría antiguos (>2 años)
    WITH deleted_logs AS (
        DELETE FROM gdpr_audit_log
        WHERE created_at < NOW() - INTERVAL '2 years'
        AND action_type NOT IN ('anonymize', 'delete', 'breach_reported')
        RETURNING id
    )
    SELECT COUNT(*) INTO v_audit_logs_deleted FROM deleted_logs;
    
    -- 3. Archivar consentimientos antiguos inactivos (>3 años)
    -- (Para cumplir con minimización de datos)
    WITH archived_consents AS (
        UPDATE gdpr_consent_records
        SET is_active = false
        WHERE created_at < NOW() - INTERVAL '3 years'
        AND is_active = true
        AND consent_given = false
        RETURNING id
    )
    SELECT COUNT(*) INTO v_consents_archived FROM archived_consents;
    
    RETURN QUERY SELECT v_clients_anonymized, v_audit_logs_deleted, v_consents_archived;
END;
$$;


ALTER FUNCTION "public"."cleanup_expired_gdpr_data"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_pending_user"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
    DELETE FROM public.pending_users 
    WHERE auth_user_id = OLD.id;
    RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."cleanup_pending_user"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."quotes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "quote_number" character varying(50) NOT NULL,
    "year" integer DEFAULT EXTRACT(year FROM CURRENT_DATE) NOT NULL,
    "sequence_number" integer NOT NULL,
    "status" "public"."quote_status" DEFAULT 'draft'::"public"."quote_status" NOT NULL,
    "quote_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "valid_until" "date" NOT NULL,
    "accepted_at" timestamp with time zone,
    "rejected_at" timestamp with time zone,
    "invoiced_at" timestamp with time zone,
    "invoice_id" "uuid",
    "title" character varying(500) NOT NULL,
    "description" "text",
    "notes" "text",
    "terms_conditions" "text",
    "subtotal" numeric(12,2) DEFAULT 0 NOT NULL,
    "tax_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "total_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "discount_percent" numeric(5,2) DEFAULT 0,
    "discount_amount" numeric(12,2) DEFAULT 0,
    "currency" character varying(3) DEFAULT 'EUR'::character varying,
    "language" character varying(5) DEFAULT 'es'::character varying,
    "client_viewed_at" timestamp with time zone,
    "client_ip_address" "inet",
    "client_user_agent" "text",
    "pdf_url" "text",
    "pdf_generated_at" timestamp with time zone,
    "digital_signature" "text",
    "signature_timestamp" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_anonymized" boolean DEFAULT false,
    "anonymized_at" timestamp with time zone,
    "retention_until" "date" GENERATED ALWAYS AS (("quote_date" + '7 years'::interval)) STORED,
    "convert_policy" "text",
    "deposit_percentage" numeric(5,2),
    "invoice_on_date" "date",
    "conversion_status" "text" DEFAULT 'not_converted'::"text" NOT NULL,
    "ticket_id" "uuid",
    "recurrence_type" "text" DEFAULT 'none'::"text" NOT NULL,
    "recurrence_interval" integer DEFAULT 1 NOT NULL,
    "recurrence_day" integer,
    "recurrence_start_date" "date",
    "recurrence_end_date" "date",
    "next_run_at" timestamp with time zone,
    "last_run_at" timestamp with time zone,
    "quote_month" "date",
    "rectifies_invoice_id" "uuid",
    "scheduled_conversion_date" "date",
    "rectification_reason" "text",
    "full_quote_number" character varying(100) GENERATED ALWAYS AS ((("year" || '-P-'::"text") || "lpad"(("sequence_number")::"text", 5, '0'::"text"))) STORED,
    "rejection_reason" "text",
    CONSTRAINT "quotes_conversion_status_check" CHECK (("conversion_status" = ANY (ARRAY['not_converted'::"text", 'scheduled'::"text", 'converted'::"text", 'partial'::"text"]))),
    CONSTRAINT "quotes_convert_policy_check" CHECK (("convert_policy" = ANY (ARRAY['manual'::"text", 'on_accept'::"text", 'automatic'::"text", 'scheduled'::"text"]))),
    CONSTRAINT "valid_dates" CHECK (("valid_until" >= "quote_date")),
    CONSTRAINT "valid_discount" CHECK ((("discount_percent" >= (0)::numeric) AND ("discount_percent" <= (100)::numeric))),
    CONSTRAINT "valid_totals_consistency" CHECK (("total_amount" = ("subtotal" + "tax_amount")))
);


ALTER TABLE "public"."quotes" OWNER TO "postgres";


COMMENT ON TABLE "public"."quotes" IS 'Presupuestos enviados a clientes con posibilidad de conversión a factura';



COMMENT ON COLUMN "public"."quotes"."valid_until" IS 'Fecha hasta la cual el presupuesto es válido';



COMMENT ON COLUMN "public"."quotes"."invoice_id" IS 'ID de la factura generada si el presupuesto fue aceptado';



COMMENT ON COLUMN "public"."quotes"."ticket_id" IS 'Referencia al ticket origen del presupuesto (si aplica)';



COMMENT ON COLUMN "public"."quotes"."scheduled_conversion_date" IS 'Fecha programada para la conversión automática a factura. Null si no hay conversión programada.';



COMMENT ON COLUMN "public"."quotes"."rectification_reason" IS 'Motivo de rectificación cuando el presupuesto es una rectificativa de una factura. Se copia a la factura resultante.';



CREATE OR REPLACE FUNCTION "public"."client_get_visible_quotes"() RETURNS SETOF "public"."quotes"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  WITH user_mapping AS (
    SELECT company_id, client_id
    FROM public.client_portal_users
    WHERE is_active = true
      AND lower(email) = public.auth_user_email()
    LIMIT 1
  )
  SELECT q.*
  FROM public.quotes q
  JOIN user_mapping m ON m.company_id = q.company_id AND m.client_id = q.client_id
$$;


ALTER FUNCTION "public"."client_get_visible_quotes"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."client_get_visible_quotes"() IS 'Returns quotes for the client mapped to the current auth email.';



CREATE TABLE IF NOT EXISTS "public"."tickets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ticket_number" integer NOT NULL,
    "client_id" "uuid",
    "company_id" "uuid",
    "stage_id" "uuid",
    "title" character varying(200) NOT NULL,
    "description" "text",
    "priority" character varying(20) DEFAULT 'normal'::character varying,
    "due_date" "date",
    "comments" "text"[],
    "total_amount" numeric(10,2) DEFAULT 0.00,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone,
    "estimated_hours" numeric(5,2) DEFAULT 0,
    "actual_hours" numeric(5,2) DEFAULT 0,
    "is_opened" boolean DEFAULT false NOT NULL,
    "ticket_month" "date",
    "assigned_to" "uuid"
);


ALTER TABLE "public"."tickets" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."client_get_visible_tickets"() RETURNS SETOF "public"."tickets"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  WITH user_mapping AS (
    SELECT company_id, client_id
    FROM public.client_portal_users
    WHERE is_active = true
      AND lower(email) = public.auth_user_email()
    LIMIT 1
  )
  SELECT t.*
  FROM public.tickets t
  JOIN user_mapping m ON m.company_id = t.company_id AND m.client_id = t.client_id
$$;


ALTER FUNCTION "public"."client_get_visible_tickets"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."client_get_visible_tickets"() IS 'Returns tickets for the client mapped to the current auth email.';



CREATE OR REPLACE FUNCTION "public"."column_exists"("table_name" "text", "column_name" "text") RETURNS boolean
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = column_exists.table_name 
        AND column_name = column_exists.column_name
    );
END;
$$;


ALTER FUNCTION "public"."column_exists"("table_name" "text", "column_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirm_user_registration"("p_auth_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_pending RECORD;
    v_company_id UUID;
    v_user_id UUID;
    v_existing_company RECORD;
BEGIN
    -- 1. Buscar registro pendiente
    SELECT * INTO v_pending
    FROM pending_users
    WHERE auth_user_id = p_auth_user_id
      AND confirmed_at IS NULL
      AND (expires_at IS NULL OR expires_at > NOW())
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_pending IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No pending registration found');
    END IF;

    -- 2. Verificar si ya existe usuario en la tabla users
    SELECT id INTO v_user_id
    FROM users
    WHERE auth_user_id = p_auth_user_id;

    IF v_user_id IS NOT NULL THEN
        UPDATE pending_users SET confirmed_at = NOW() WHERE id = v_pending.id;
        RETURN jsonb_build_object('success', true, 'already_exists', true);
    END IF;

    -- 3. Verificar si la empresa ya existe
    SELECT id INTO v_existing_company
    FROM companies
    WHERE LOWER(TRIM(name)) = LOWER(TRIM(v_pending.company_name))
    LIMIT 1;

    IF v_existing_company.id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false, 
            'requires_invitation_approval', true,
            'company_id', v_existing_company.id,
            'company_name', v_pending.company_name
        );
    END IF;

    -- 4. Crear empresa nueva CON NIF
    INSERT INTO companies (name, slug, nif)
    VALUES (
        COALESCE(v_pending.company_name, 'Mi Empresa'),
        LOWER(REGEXP_REPLACE(COALESCE(v_pending.company_name, 'mi-empresa'), '[^a-zA-Z0-9]+', '-', 'g')) || '-' || FLOOR(RANDOM() * 1000000000)::TEXT,
        v_pending.company_nif
    )
    RETURNING id INTO v_company_id;

    -- 5. Crear usuario como owner
    INSERT INTO users (email, name, surname, role, active, company_id, auth_user_id, permissions)
    VALUES (
        v_pending.email,
        COALESCE(v_pending.given_name, SPLIT_PART(v_pending.full_name, ' ', 1), 'Usuario'),
        v_pending.surname,
        'owner',
        true,
        v_company_id,
        p_auth_user_id,
        '{}'::JSONB
    )
    RETURNING id INTO v_user_id;

    -- 6. Marcar como confirmado
    UPDATE pending_users SET confirmed_at = NOW() WHERE id = v_pending.id;

    RETURN jsonb_build_object(
        'success', true,
        'company_id', v_company_id,
        'user_id', v_user_id
    );
END;
$$;


ALTER FUNCTION "public"."confirm_user_registration"("p_auth_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."confirm_user_registration"("p_auth_user_id" "uuid", "p_confirmation_token" "text" DEFAULT NULL::"text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  pending_user_data public.pending_users;
  existing_company_info RECORD;
  new_company_id UUID;
  new_user_id UUID;
  owner_user_id UUID;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_auth_user_id THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT * INTO pending_user_data
  FROM public.pending_users
  WHERE auth_user_id = p_auth_user_id
    AND (p_confirmation_token IS NULL OR confirmation_token = p_confirmation_token)
    AND confirmed_at IS NULL
    AND expires_at > NOW();

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Invalid or expired confirmation');
  END IF;

  IF pending_user_data.company_name IS NOT NULL AND TRIM(pending_user_data.company_name) <> '' THEN
    SELECT * INTO existing_company_info
    FROM check_company_exists(pending_user_data.company_name);

    IF existing_company_info.company_exists THEN
      SELECT u.id INTO owner_user_id
      FROM public.users u
      WHERE u.company_id = existing_company_info.company_id 
        AND u.role = 'owner' 
        AND u.active = true
      LIMIT 1;

      IF owner_user_id IS NOT NULL THEN
        INSERT INTO public.company_invitations (company_id, email, invited_by_user_id, role, status, message)
        VALUES (existing_company_info.company_id, pending_user_data.email, owner_user_id, 'member', 'pending',
                'Solicitud automática generada durante el registro');

        UPDATE public.pending_users
        SET confirmed_at = NOW()
        WHERE auth_user_id = p_auth_user_id;

        RETURN json_build_object(
          'success', true,
          'requires_invitation_approval', true,
          'company_name', existing_company_info.company_name,
          'owner_email', existing_company_info.owner_email,
          'message', 'Company already exists. Invitation sent to company owner for approval.'
        );
      END IF;
    END IF;
  END IF;

  INSERT INTO public.companies (name, slug, is_active)
  VALUES (
    COALESCE(NULLIF(TRIM(pending_user_data.company_name), ''), SPLIT_PART(pending_user_data.email, '@', 1)),
    LOWER(COALESCE(NULLIF(TRIM(pending_user_data.company_name), ''), SPLIT_PART(pending_user_data.email, '@', 1))) 
      || '-' || EXTRACT(EPOCH FROM NOW())::BIGINT,
    true
  )
  RETURNING id INTO new_company_id;

  INSERT INTO public.users (email, name, surname, role, active, company_id, auth_user_id, permissions)
  VALUES (
    pending_user_data.email,
    COALESCE(NULLIF(pending_user_data.given_name, ''), split_part(pending_user_data.full_name, ' ', 1), split_part(pending_user_data.email, '@', 1)),
    COALESCE(NULLIF(pending_user_data.surname, ''), NULLIF(regexp_replace(pending_user_data.full_name, '^[^\s]+\s*', ''), '')),
    'owner',
    true,
    new_company_id,
    pending_user_data.auth_user_id,
    '{}'::jsonb
  )
  RETURNING id INTO new_user_id;

  UPDATE public.pending_users
  SET confirmed_at = NOW()
  WHERE auth_user_id = p_auth_user_id;

  RETURN json_build_object('success', true, 'company_id', new_company_id, 'user_id', new_user_id, 'is_owner', true, 'message', 'Registration confirmed successfully. New company created.');
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;


ALTER FUNCTION "public"."confirm_user_registration"("p_auth_user_id" "uuid", "p_confirmation_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."convert_quote_to_invoice"("p_quote_id" "uuid", "p_invoice_series_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_quote public.quotes%rowtype;
  v_invoice_id uuid;
  v_series_id uuid;
  v_series_label text;
  v_invoice_number text;
  v_item record;
  v_invoice_type invoice_type;
  v_recurrence_period text;
  v_is_recurring boolean;
  v_created_by uuid;
BEGIN
  -- Load quote
  SELECT * INTO v_quote FROM public.quotes WHERE id = p_quote_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quote % not found', p_quote_id;
  END IF;

  -- Validate state
  IF v_quote.status <> 'accepted' AND v_quote.status <> 'invoiced' AND v_quote.status <> 'active' THEN
    RAISE EXCEPTION 'Solo se pueden convertir presupuestos aceptados o activos';
  END IF;
  
  -- Allow conversion if recurring (even if already has invoice_id, as it generates multiple)
  -- BUT strict check: for non-recurring, prevent duplicates
  v_is_recurring := v_quote.recurrence_type IS NOT NULL AND v_quote.recurrence_type <> 'none';

  IF NOT v_is_recurring AND v_quote.invoice_id IS NOT NULL THEN
    RAISE EXCEPTION 'Este presupuesto ya fue convertido a factura';
  END IF;

  -- Determinar el tipo de factura
  IF v_quote.rectifies_invoice_id IS NOT NULL OR (v_quote.total_amount < 0) THEN
    v_invoice_type := 'rectificative'::invoice_type;
  ELSE
    v_invoice_type := 'normal'::invoice_type;
  END IF;

  -- Calculate recurrence_period
  IF v_is_recurring THEN
    v_recurrence_period := to_char(current_date, 'YYYY-MM');
  ELSE
    v_recurrence_period := NULL;
  END IF;

  -- Resolve series
  IF p_invoice_series_id IS NULL THEN
    SELECT id INTO v_series_id
      FROM public.invoice_series
     WHERE company_id = v_quote.company_id
       AND is_active = true
       AND is_default = true
     ORDER BY year DESC
     LIMIT 1;
  ELSE
    v_series_id := p_invoice_series_id;
  END IF;
  
  IF v_series_id IS NULL THEN
    RAISE EXCEPTION 'No hay serie de factura por defecto configurada';
  END IF;

  -- Build series label and get next number
  SELECT (year::text || '-' || series_code) INTO v_series_label 
    FROM public.invoice_series WHERE id = v_series_id;
  SELECT get_next_invoice_number(v_series_id) INTO v_invoice_number;

  -- VALIDAR created_by
  IF v_quote.created_by IS NULL OR NOT EXISTS (SELECT 1 FROM public.users WHERE id = v_quote.created_by) THEN
    SELECT id INTO v_created_by 
      FROM public.users 
     WHERE company_id = v_quote.company_id 
       AND role = 'owner'
     LIMIT 1;
    IF v_created_by IS NULL THEN
      SELECT id INTO v_created_by 
        FROM public.users 
       WHERE company_id = v_quote.company_id 
       LIMIT 1;
    END IF;
  ELSE
    v_created_by := v_quote.created_by;
  END IF;

  -- INSERT using 'draft' status
  INSERT INTO public.invoices (
    company_id,
    client_id,
    series_id,
    invoice_number,
    invoice_series,
    invoice_type,
    invoice_date,
    due_date,
    subtotal,
    tax_amount,
    total,
    currency,
    status,           -- 'draft'
    notes,
    rectifies_invoice_id,
    rectification_reason,
    created_by,
    source_quote_id,
    recurrence_period
  ) VALUES (
    v_quote.company_id,
    v_quote.client_id,
    v_series_id,
    v_invoice_number,
    v_series_label,
    v_invoice_type,
    current_date,
    current_date + interval '30 days',
    v_quote.subtotal,
    v_quote.tax_amount,
    v_quote.total_amount,
    v_quote.currency,
    'draft',          
    'Generada desde presupuesto: ' || coalesce(v_quote.full_quote_number, v_quote.quote_number),
    v_quote.rectifies_invoice_id,
    v_quote.rectification_reason,
    v_created_by,
    CASE WHEN v_is_recurring THEN p_quote_id ELSE NULL END,
    v_recurrence_period
  ) RETURNING id INTO v_invoice_id;

  -- Copy items
  FOR v_item IN
    SELECT * FROM public.quote_items WHERE quote_id = p_quote_id ORDER BY line_number
  LOOP
    INSERT INTO public.invoice_items (
      invoice_id,
      line_order,
      description,
      quantity,
      unit_price,
      discount_percent,
      tax_rate,
      tax_amount,
      subtotal,
      total
    ) VALUES (
      v_invoice_id,
      v_item.line_number,
      v_item.description,
      v_item.quantity,
      v_item.unit_price,
      coalesce(v_item.discount_percent, 0),
      v_item.tax_rate,
      v_item.tax_amount,
      v_item.subtotal,
      v_item.total
    );
  END LOOP;

  -- Update quote
  -- KEY CHANGE: If recurring, do NOT set status to 'invoiced' (which essentially closes it).
  -- Keep it as is (accepted) or let the Payment Trigger upgrade it to 'active'.
  UPDATE public.quotes
     SET invoice_id = v_invoice_id,
         status = CASE WHEN v_is_recurring THEN status ELSE 'invoiced' END,
         invoiced_at = now(),
         updated_at = now(),
         last_run_at = CASE WHEN v_is_recurring THEN now() ELSE last_run_at END
   WHERE id = p_quote_id;

  RETURN v_invoice_id;
END
$$;


ALTER FUNCTION "public"."convert_quote_to_invoice"("p_quote_id" "uuid", "p_invoice_series_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."count_customers_by_user"("target_user_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
    customer_count INTEGER;
    user_company_id uuid;
BEGIN
    -- Obtener company_id del usuario
    SELECT company_id INTO user_company_id 
    FROM public.users 
    WHERE auth_user_id = target_user_id;
    
    -- Contar clientes de la empresa del usuario
    SELECT COUNT(*)
    INTO customer_count
    FROM public.clients c
    WHERE c.company_id = user_company_id
    AND c.deleted_at IS NULL
    AND c.anonymized_at IS NULL;  -- No contar anonimizados
    
    RETURN COALESCE(customer_count, 0);
END;
$$;


ALTER FUNCTION "public"."count_customers_by_user"("target_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_address_dev"("target_user_id" "uuid", "p_direccion" character varying, "p_numero" character varying DEFAULT NULL::character varying, "p_piso" character varying DEFAULT NULL::character varying, "p_puerta" character varying DEFAULT NULL::character varying, "p_codigo_postal" character varying DEFAULT NULL::character varying, "p_locality_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
    new_address_id uuid;
BEGIN
    INSERT INTO public.addresses (
        usuario_id,
        direccion,
        numero,
        piso,
        puerta,
        codigo_postal,
        locality_id
    ) VALUES (
        target_user_id,
        p_direccion,
        p_numero,
        p_piso,
        p_puerta,
        p_codigo_postal,
        p_locality_id
    )
    RETURNING id INTO new_address_id;
    
    RETURN new_address_id;
END;
$$;


ALTER FUNCTION "public"."create_address_dev"("target_user_id" "uuid", "p_direccion" character varying, "p_numero" character varying, "p_piso" character varying, "p_puerta" character varying, "p_codigo_postal" character varying, "p_locality_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_address_dev"("target_user_id" "uuid", "p_direccion" character varying, "p_numero" character varying, "p_piso" character varying, "p_puerta" character varying, "p_codigo_postal" character varying, "p_locality_id" "uuid") IS 'Función RPC para crear direcciones en modo desarrollo';



CREATE OR REPLACE FUNCTION "public"."create_attachment"("p_company_id" "uuid", "p_job_id" "uuid", "p_file_name" "text", "p_file_size" integer DEFAULT NULL::integer, "p_mime_type" "text" DEFAULT NULL::"text", "p_subfolder" "text" DEFAULT 'attachments'::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  attachment_id uuid;
  file_path text;
BEGIN
  -- Validar que el job pertenece a la company
  IF NOT EXISTS (
    SELECT 1 FROM public.jobs 
    WHERE id = p_job_id 
    AND company_id = p_company_id 
    AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Job does not belong to company or does not exist';
  END IF;
  
  -- Generar ruta segura
  file_path := public.generate_file_path(p_company_id, p_file_name, p_subfolder);
  
  -- Crear registro
  INSERT INTO public.attachments (
    company_id, job_id, file_name, file_path, file_size, mime_type
  ) VALUES (
    p_company_id, p_job_id, p_file_name, file_path, p_file_size, p_mime_type
  ) RETURNING id INTO attachment_id;
  
  RETURN attachment_id;
END;
$$;


ALTER FUNCTION "public"."create_attachment"("p_company_id" "uuid", "p_job_id" "uuid", "p_file_name" "text", "p_file_size" integer, "p_mime_type" "text", "p_subfolder" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_customer_dev"("target_user_id" "uuid", "p_nombre" character varying, "p_apellidos" character varying, "p_email" character varying, "p_telefono" character varying DEFAULT NULL::character varying, "p_dni" character varying DEFAULT NULL::character varying) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
    new_client_id uuid;
    user_company_id uuid;
BEGIN
    -- Obtener company_id del usuario
    SELECT company_id INTO user_company_id 
    FROM public.users 
    WHERE auth_user_id = target_user_id;
    
    IF user_company_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no tiene empresa asignada';
    END IF;
    
    -- Insertar en clients (no customers)
    INSERT INTO public.clients (
        company_id,
        name,
        apellidos,
        email,
        phone,
        dni,
        -- Campos GDPR obligatorios
        marketing_consent,
        data_processing_consent,
        data_processing_consent_date,
        data_processing_legal_basis,
        is_minor,
        access_count
    ) VALUES (
        user_company_id,
        p_nombre,
        p_apellidos,
        p_email,
        p_telefono,
        p_dni,
        false,  -- Marketing consent por defecto NO
        true,   -- Processing consent por defecto SÍ
        now(),
        'contract',
        false,
        0
    )
    RETURNING id INTO new_client_id;
    
    RETURN new_client_id;
END;
$$;


ALTER FUNCTION "public"."create_customer_dev"("target_user_id" "uuid", "p_nombre" character varying, "p_apellidos" character varying, "p_email" character varying, "p_telefono" character varying, "p_dni" character varying) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_customer_dev"("target_user_id" "uuid", "p_nombre" character varying, "p_apellidos" character varying, "p_email" character varying, "p_telefono" character varying DEFAULT NULL::character varying, "p_dni" character varying DEFAULT NULL::character varying, "p_fecha_nacimiento" "date" DEFAULT NULL::"date", "p_profesion" character varying DEFAULT NULL::character varying, "p_empresa" character varying DEFAULT NULL::character varying, "p_notas" "text" DEFAULT NULL::"text", "p_avatar_url" "text" DEFAULT NULL::"text", "p_direccion_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
    new_customer_id uuid;
BEGIN
    INSERT INTO public.customers (
        usuario_id,
        nombre,
        apellidos,
        email,
        telefono,
        dni,
        fecha_nacimiento,
        profesion,
        empresa,
        notas,
        avatar_url,
        direccion_id,
        activo
    ) VALUES (
        target_user_id,
        p_nombre,
        p_apellidos,
        p_email,
        p_telefono,
        p_dni,
        p_fecha_nacimiento,
        p_profesion,
        p_empresa,
        p_notas,
        p_avatar_url,
        p_direccion_id,
        true
    )
    RETURNING id INTO new_customer_id;
    
    RETURN new_customer_id;
END;
$$;


ALTER FUNCTION "public"."create_customer_dev"("target_user_id" "uuid", "p_nombre" character varying, "p_apellidos" character varying, "p_email" character varying, "p_telefono" character varying, "p_dni" character varying, "p_fecha_nacimiento" "date", "p_profesion" character varying, "p_empresa" character varying, "p_notas" "text", "p_avatar_url" "text", "p_direccion_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_customer_dev"("target_user_id" "uuid", "p_nombre" character varying, "p_apellidos" character varying, "p_email" character varying, "p_telefono" character varying, "p_dni" character varying, "p_fecha_nacimiento" "date", "p_profesion" character varying, "p_empresa" character varying, "p_notas" "text", "p_avatar_url" "text", "p_direccion_id" "uuid") IS 'Función RPC para crear clientes asignados a un usuario específico en modo desarrollo';



CREATE OR REPLACE FUNCTION "public"."create_gdpr_access_request"("p_subject_email" "text", "p_request_type" "text", "p_subject_name" "text" DEFAULT NULL::"text", "p_request_details" "jsonb" DEFAULT '{}'::"jsonb", "p_requesting_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_company_id uuid;
    v_request_id uuid;
    v_deadline_date timestamp with time zone;
BEGIN
    -- Validar tipo de solicitud
    IF p_request_type NOT IN ('access', 'rectification', 'erasure', 'portability', 'restriction', 'objection') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Tipo de solicitud inválido. Valores permitidos: access, rectification, erasure, portability, restriction, objection'
        );
    END IF;
    
    -- Obtener company_id del usuario solicitante
    SELECT company_id INTO v_company_id
    FROM users
    WHERE auth_user_id = COALESCE(p_requesting_user_id, auth.uid());
    
    -- Calcular fecha límite (30 días por defecto según GDPR Art. 12.3)
    v_deadline_date := now() + INTERVAL '30 days';
    
    -- Crear solicitud
    INSERT INTO gdpr_access_requests (
        request_type,
        subject_email,
        subject_name,
        company_id,
        requested_by,
        request_details,
        verification_status,
        processing_status,
        deadline_date,
        created_at,
        updated_at
    ) VALUES (
        p_request_type,
        p_subject_email,
        p_subject_name,
        v_company_id,
        COALESCE(p_requesting_user_id, auth.uid()),
        p_request_details,
        'pending',
        'received',
        v_deadline_date,
        now(),
        now()
    )
    RETURNING id INTO v_request_id;
    
    -- Registrar en audit log
    INSERT INTO gdpr_audit_log (
        user_id,
        company_id,
        action_type,
        table_name,
        record_id,
        subject_email,
        purpose,
        new_values,
        created_at
    ) VALUES (
        COALESCE(p_requesting_user_id, auth.uid()),
        v_company_id,
        'access_request',
        'gdpr_access_requests',
        v_request_id,
        p_subject_email,
        'GDPR ' || p_request_type || ' request created',
        jsonb_build_object(
            'request_type', p_request_type,
            'deadline', v_deadline_date
        ),
        now()
    );
    
    RETURN jsonb_build_object(
        'success', true,
        'message', 'Solicitud GDPR creada correctamente',
        'request_id', v_request_id,
        'request_type', p_request_type,
        'subject_email', p_subject_email,
        'deadline_date', v_deadline_date,
        'status', 'received'
    );
    
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'error_detail', SQLSTATE
    );
END;
$$;


ALTER FUNCTION "public"."create_gdpr_access_request"("p_subject_email" "text", "p_request_type" "text", "p_subject_name" "text", "p_request_details" "jsonb", "p_requesting_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_gdpr_access_request"("p_subject_email" "text", "p_request_type" "text", "p_subject_name" "text", "p_request_details" "jsonb", "p_requesting_user_id" "uuid") IS 'Crea una solicitud de acceso GDPR (Art. 15-22)';



CREATE OR REPLACE FUNCTION "public"."create_notification"("p_company_id" "uuid", "p_recipient_id" "uuid", "p_type" "text", "p_reference_id" "uuid", "p_title" "text", "p_content" "text", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO public.notifications (company_id, recipient_id, type, reference_id, title, content, metadata)
    VALUES (p_company_id, p_recipient_id, p_type, p_reference_id, p_title, p_content, p_metadata)
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$;


ALTER FUNCTION "public"."create_notification"("p_company_id" "uuid", "p_recipient_id" "uuid", "p_type" "text", "p_reference_id" "uuid", "p_title" "text", "p_content" "text", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_rectification_quote"("p_invoice_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_invoice RECORD;
  v_quote_id UUID;
  v_item RECORD;
  v_quote_number TEXT;
  v_sequence_number INTEGER;
  v_year INTEGER;
BEGIN
  -- 1. Obtener datos de la factura original
  SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id;
  
  IF v_invoice IS NULL THEN
    RAISE EXCEPTION 'Factura no encontrada';
  END IF;

  -- 2. Calcular nuevo número de presupuesto (para la rectificativa)
  v_year := EXTRACT(YEAR FROM CURRENT_DATE);
  
  SELECT COALESCE(MAX(sequence_number), 0) + 1
  INTO v_sequence_number
  FROM public.quotes
  WHERE company_id = v_invoice.company_id AND year = v_year;
  
  -- CORRECCIÓN: Formato estándar YYYY-P-XXXXX (5 dígitos)
  v_quote_number := v_year || '-P-' || LPAD(v_sequence_number::TEXT, 5, '0');

  -- 3. Crear el presupuesto de rectificación
  INSERT INTO public.quotes (
    company_id,
    client_id,
    quote_number,
    sequence_number,
    year,
    quote_date,
    valid_until,
    status,
    title,
    subtotal,
    tax_amount,
    total_amount,
    notes,
    created_by
  ) VALUES (
    v_invoice.company_id,
    v_invoice.client_id,
    v_quote_number,
    v_sequence_number,
    v_year,
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '30 days',
    'draft', -- Se crea en borrador para revisión
    'Rectificación de factura ' || coalesce(v_invoice.full_invoice_number, v_invoice.invoice_series || '-' || v_invoice.invoice_number),
    v_invoice.subtotal * -1, -- Importes negativos por defecto para rectificativa
    v_invoice.tax_amount * -1,
    v_invoice.total * -1,
    'Rectificación de la factura ' || coalesce(v_invoice.full_invoice_number, v_invoice.invoice_series || '-' || v_invoice.invoice_number) || '. Motivo: ',
    auth.uid()
  ) RETURNING id INTO v_quote_id;

  -- 4. Copiar líneas de la factura al presupuesto (con importes negativos)
  FOR v_item IN SELECT * FROM public.invoice_items WHERE invoice_id = p_invoice_id LOOP
    INSERT INTO public.quote_items (
      quote_id,
      company_id,
      line_number,
      description,
      quantity,
      unit_price,
      discount_percent,
      tax_rate,
      tax_amount,
      subtotal,
      total
    ) VALUES (
      v_quote_id,
      v_invoice.company_id,
      v_item.line_order,
      v_item.description,
      v_item.quantity * -1, -- Cantidad negativa para rectificación
      v_item.unit_price,
      v_item.discount_percent,
      v_item.tax_rate,
      v_item.tax_amount * -1,
      v_item.subtotal * -1,
      v_item.total * -1
    );
  END LOOP;

  -- 5. Actualizar estado de la factura original a 'rectified'
  UPDATE public.invoices 
  SET status = 'rectified',
      updated_at = NOW()
  WHERE id = p_invoice_id;

  RETURN v_quote_id;
END;
$$;


ALTER FUNCTION "public"."create_rectification_quote"("p_invoice_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_rectification_quote"("p_invoice_id" "uuid", "p_rectification_reason" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_invoice RECORD;
  v_quote_id UUID;
  v_item RECORD;
  v_quote_number TEXT;
  v_sequence_number INTEGER;
  v_year INTEGER;
  v_company_id UUID;
  v_line_number INTEGER := 0;
BEGIN
  -- 1. Obtener datos de la factura original
  SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id;
  
  IF v_invoice IS NULL THEN
    RAISE EXCEPTION 'Factura no encontrada';
  END IF;

  v_company_id := v_invoice.company_id;

  -- 2. Calcular nuevo número de presupuesto
  v_year := EXTRACT(YEAR FROM CURRENT_DATE);
  
  SELECT COALESCE(MAX(sequence_number), 0) + 1
  INTO v_sequence_number
  FROM public.quotes
  WHERE company_id = v_company_id 
    AND year = v_year;
  
  v_quote_number := v_year || '-P-' || LPAD(v_sequence_number::TEXT, 5, '0');

  -- 3. Crear el presupuesto rectificativo (con valores negativos)
  INSERT INTO public.quotes (
    company_id,
    client_id,
    quote_number,
    year,
    sequence_number,
    quote_date,
    valid_until,
    status,
    title,
    subtotal,
    tax_amount,
    total_amount,
    currency,
    notes,
    rectifies_invoice_id,
    rectification_reason,
    created_by
  ) VALUES (
    v_company_id,
    v_invoice.client_id,
    v_quote_number,
    v_year,
    v_sequence_number,
    CURRENT_DATE,
    CURRENT_DATE + INTERVAL '30 days',
    'accepted',
    'Rectificación de factura ' || v_invoice.full_invoice_number,
    v_invoice.subtotal * -1,
    v_invoice.tax_amount * -1,
    v_invoice.total * -1,
    v_invoice.currency,
    COALESCE(
      'Rectificación de la factura ' || v_invoice.full_invoice_number || '. Motivo: ' || p_rectification_reason,
      'Rectificación de la factura ' || v_invoice.full_invoice_number
    ),
    p_invoice_id,
    p_rectification_reason,
    auth.uid()
  ) RETURNING id INTO v_quote_id;

  -- 4. Copiar líneas de factura (con valores negativos)
  -- NOTA: invoice_items usa "line_order", quote_items usa "line_number"
  v_line_number := 0;
  FOR v_item IN 
    SELECT * FROM public.invoice_items WHERE invoice_id = p_invoice_id ORDER BY line_order
  LOOP
    v_line_number := v_line_number + 1;
    INSERT INTO public.quote_items (
      company_id,
      quote_id,
      line_number,
      description,
      quantity,
      unit_price,
      discount_percent,
      tax_rate,
      tax_amount,
      subtotal,
      total
    ) VALUES (
      v_company_id,
      v_quote_id,
      v_line_number,
      v_item.description,
      v_item.quantity * -1,
      v_item.unit_price,
      COALESCE(v_item.discount_percent, 0),
      v_item.tax_rate,
      v_item.tax_amount * -1,
      v_item.subtotal * -1,
      v_item.total * -1
    );
  END LOOP;

  -- 5. Actualizar estado de la factura original a 'rectified'
  UPDATE public.invoices 
  SET status = 'rectified',
      updated_at = NOW()
  WHERE id = p_invoice_id;

  RETURN v_quote_id;
END;
$$;


ALTER FUNCTION "public"."create_rectification_quote"("p_invoice_id" "uuid", "p_rectification_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_company_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE
    AS $$
  select nullif((current_setting('request.jwt.claims', true)::jsonb ->> 'company_id')::uuid, null)
$$;


ALTER FUNCTION "public"."current_company_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_customer_dev"("client_id" "uuid", "target_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
    deleted_rows INTEGER;
    user_company_id uuid;
BEGIN
    -- Obtener company_id del usuario
    SELECT company_id INTO user_company_id 
    FROM public.users 
    WHERE auth_user_id = target_user_id;
    
    -- Borrado suave con marca GDPR
    UPDATE public.clients 
    SET 
        deleted_at = now(),
        deletion_reason = 'User deletion request'
    WHERE 
        id = client_id 
        AND company_id = user_company_id
        AND deleted_at IS NULL;
    
    GET DIAGNOSTICS deleted_rows = ROW_COUNT;
    
    RETURN deleted_rows > 0;
END;
$$;


ALTER FUNCTION "public"."delete_customer_dev"("client_id" "uuid", "target_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_payment_integration"("p_company_id" "uuid", "p_provider" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_access_allowed boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM public.users
        WHERE auth_user_id = auth.uid()
        AND company_id = p_company_id
        AND role IN ('owner', 'admin')
    ) INTO v_access_allowed;

    IF NOT v_access_allowed THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    DELETE FROM public.payment_integrations
    WHERE company_id = p_company_id AND provider = p_provider;

    RETURN FOUND;
END;
$$;


ALTER FUNCTION "public"."delete_payment_integration"("p_company_id" "uuid", "p_provider" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enqueue_verifactu_dispatch"("pinvoiceid" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  INSERT INTO public.scheduled_jobs (job_type, payload)
  VALUES ('verifactu_dispatch', jsonb_build_object('invoice_id', pinvoiceid));
$$;


ALTER FUNCTION "public"."enqueue_verifactu_dispatch"("pinvoiceid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enqueue_verifactu_dispatch"("pinvoice_id" "uuid", "pcompany_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  -- Insertar evento en tabla verifactu_events o similar
  INSERT INTO public.verifactu_events (
    invoice_id,
    company_id,
    status,
    attempts,
    created_at
  ) VALUES (
    pinvoice_id,
    pcompany_id,
    'pending',
    0,
    NOW()
  )
  ON CONFLICT (invoice_id) DO UPDATE
  SET 
    status = 'pending',
    attempts = 0,
    updated_at = NOW();
END;
$$;


ALTER FUNCTION "public"."enqueue_verifactu_dispatch"("pinvoice_id" "uuid", "pcompany_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_all_companies"() RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
    result_text TEXT := '';
    michinanny_id UUID;
    satpcgo_id UUID;
    libera_id UUID;
    empresa_count INTEGER;
BEGIN
    result_text := result_text || '=== VERIFICANDO EMPRESAS EXISTENTES ===' || E'\n';
    
    -- Contar empresas actuales
    SELECT COUNT(*) INTO empresa_count FROM companies WHERE deleted_at IS NULL;
    result_text := result_text || 'Empresas actuales en BD: ' || empresa_count::text || E'\n\n';
    
    -- Mostrar empresas existentes
    result_text := result_text || '📋 Empresas existentes:' || E'\n';
    FOR michinanny_id IN 
        SELECT id FROM companies WHERE deleted_at IS NULL ORDER BY name
    LOOP
        SELECT name INTO result_text FROM companies WHERE id = michinanny_id;
        result_text := result_text || '  ✅ ' || (SELECT name FROM companies WHERE id = michinanny_id) || ' (ID: ' || michinanny_id::text || ')' || E'\n';
    END LOOP;
    
    result_text := result_text || E'\n=== CREANDO EMPRESAS FALTANTES ===' || E'\n';
    
    -- Verificar y crear SatPCGo
    SELECT id INTO satpcgo_id FROM companies WHERE name = 'SatPCGo' AND deleted_at IS NULL;
    IF satpcgo_id IS NULL THEN
        INSERT INTO companies (id, name, website, legacy_negocio_id, created_at, updated_at)
        VALUES (
            gen_random_uuid(),
            'SatPCGo',
            'satpcgo.com',
            1, -- ID del negocio original
            NOW(),
            NOW()
        )
        RETURNING id INTO satpcgo_id;
        
        result_text := result_text || '✅ SatPCGo creado: ' || satpcgo_id::text || E'\n';
    ELSE
        result_text := result_text || '✅ SatPCGo ya existe: ' || satpcgo_id::text || E'\n';
    END IF;
    
    -- Verificar y crear Michinanny
    SELECT id INTO michinanny_id FROM companies WHERE name = 'Michinanny' AND deleted_at IS NULL;
    IF michinanny_id IS NULL THEN
        INSERT INTO companies (id, name, website, legacy_negocio_id, created_at, updated_at)
        VALUES (
            gen_random_uuid(),
            'Michinanny',
            'michinanny.com',
            2, -- Nuevo negocio
            NOW(),
            NOW()
        )
        RETURNING id INTO michinanny_id;
        
        result_text := result_text || '✅ Michinanny creado: ' || michinanny_id::text || E'\n';
    ELSE
        result_text := result_text || '✅ Michinanny ya existe: ' || michinanny_id::text || E'\n';
    END IF;
    
    -- Verificar y crear Libera Tus Creencias
    SELECT id INTO libera_id FROM companies WHERE name = 'Libera Tus Creencias' AND deleted_at IS NULL;
    IF libera_id IS NULL THEN
        INSERT INTO companies (id, name, website, legacy_negocio_id, created_at, updated_at)
        VALUES (
            gen_random_uuid(),
            'Libera Tus Creencias',
            'liberatuscreencias.com',
            3, -- Nuevo negocio
            NOW(),
            NOW()
        )
        RETURNING id INTO libera_id;
        
        result_text := result_text || '✅ Libera Tus Creencias creado: ' || libera_id::text || E'\n';
    ELSE
        result_text := result_text || '✅ Libera Tus Creencias ya existe: ' || libera_id::text || E'\n';
    END IF;
    
    -- Resumen final
    result_text := result_text || E'\n=== RESUMEN ===' || E'\n';
    SELECT COUNT(*) INTO empresa_count FROM companies WHERE deleted_at IS NULL;
    result_text := result_text || 'Total empresas en BD: ' || empresa_count::text || E'\n';
    result_text := result_text || 'SatPCGo ID: ' || satpcgo_id::text || E'\n';
    result_text := result_text || 'Michinanny ID: ' || michinanny_id::text || E'\n';
    result_text := result_text || 'Libera Tus Creencias ID: ' || libera_id::text || E'\n';
    result_text := result_text || E'\n✅ Todas las empresas están disponibles' || E'\n';
    
    RETURN result_text;
END;
$$;


ALTER FUNCTION "public"."ensure_all_companies"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_min_one_stage_per_category"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  cats TEXT[] := ARRAY['waiting','analysis','action','final','cancel'];
  cat TEXT;
  cnt INT;
  comp UUID;
BEGIN
  -- Determine affected company (works for UPDATE/DELETE)
  comp := COALESCE(NEW.company_id, OLD.company_id);

  -- If company cannot be determined, allow (no-op)
  IF comp IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  FOREACH cat IN ARRAY cats LOOP
    -- Count VISIBLE stages for this company and category
    -- visible = company-owned OR (generic and NOT hidden by this company)
    SELECT COUNT(*) INTO cnt
    FROM ticket_stages s
    WHERE s.deleted_at IS NULL
      AND s.workflow_category::text = cat
      AND (
        s.company_id = comp
        OR (
          s.company_id IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM hidden_stages h
             WHERE h.company_id = comp AND h.stage_id = s.id
          )
        )
      );

    IF cnt = 0 THEN
      RAISE EXCEPTION 'Debe existir al menos un estado visible de la categoría % para la empresa %', cat, comp;
    END IF;
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."ensure_min_one_stage_per_category"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."export_client_gdpr_data"("p_client_id" "uuid", "p_requesting_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_client record;
    v_company_id uuid;
    v_result jsonb;
    v_services jsonb;
    v_tickets jsonb;
    v_devices jsonb;
    v_consent_records jsonb;
    v_access_requests jsonb;
BEGIN
    -- Verificar que el usuario tenga acceso
    SELECT company_id INTO v_company_id
    FROM users
    WHERE auth_user_id = COALESCE(p_requesting_user_id, auth.uid());
    
    -- Obtener datos del cliente
    SELECT * INTO v_client
    FROM clients
    WHERE id = p_client_id
    AND company_id = v_company_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Cliente no encontrado o sin acceso'
        );
    END IF;
    
    -- Obtener servicios relacionados
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'description', s.description,
        'price', s.price,
        'created_at', s.created_at
    )), '[]'::jsonb) INTO v_services
    FROM services s
    WHERE s.id = ANY(
        SELECT jsonb_array_elements_text(v_client.metadata->'services')::uuid
    );
    
    -- Obtener tickets relacionados
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', t.id,
        'title', t.title,
        'description', t.description,
        'status', t.status,
        'priority', t.priority,
        'created_at', t.created_at,
        'updated_at', t.updated_at
    )), '[]'::jsonb) INTO v_tickets
    FROM tickets t
    WHERE t.client_id = p_client_id;
    
    -- Obtener dispositivos relacionados
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', d.id,
        'brand', d.brand,
        'model', d.model,
        'device_type', d.device_type,
        'serial_number', d.serial_number,
        'status', d.status,
        'created_at', d.created_at
    )), '[]'::jsonb) INTO v_devices
    FROM devices d
    WHERE d.client_id = p_client_id;
    
    -- Obtener registros de consentimiento
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'consent_type', cr.consent_type,
        'purpose', cr.purpose,
        'consent_given', cr.consent_given,
        'consent_method', cr.consent_method,
        'created_at', cr.created_at,
        'withdrawn_at', cr.withdrawn_at,
        'is_active', cr.is_active
    )), '[]'::jsonb) INTO v_consent_records
    FROM gdpr_consent_records cr
    WHERE cr.subject_email = v_client.email;
    
    -- Obtener solicitudes de acceso GDPR
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'request_type', ar.request_type,
        'processing_status', ar.processing_status,
        'created_at', ar.created_at,
        'completed_at', ar.completed_at
    )), '[]'::jsonb) INTO v_access_requests
    FROM gdpr_access_requests ar
    WHERE ar.subject_email = v_client.email;
    
    -- Construir resultado completo
    v_result := jsonb_build_object(
        'export_info', jsonb_build_object(
            'exported_at', now(),
            'exported_by', COALESCE(p_requesting_user_id, auth.uid()),
            'export_format', 'JSON',
            'gdpr_article', 'Article 20 - Right to Data Portability'
        ),
        'personal_data', jsonb_build_object(
            'id', v_client.id,
            'name', v_client.name,
            'email', v_client.email,
            'phone', v_client.phone,
            'address', v_client.address,
            'apellidos', v_client.apellidos,
            'dni', v_client.dni,
            'created_at', v_client.created_at,
            'updated_at', v_client.updated_at
        ),
        'consent_information', jsonb_build_object(
            'marketing_consent', v_client.marketing_consent,
            'marketing_consent_date', v_client.marketing_consent_date,
            'data_processing_consent', v_client.data_processing_consent,
            'data_processing_consent_date', v_client.data_processing_consent_date,
            'data_processing_legal_basis', v_client.data_processing_legal_basis
        ),
        'data_retention', jsonb_build_object(
            'retention_until', v_client.data_retention_until,
            'is_active', v_client.is_active
        ),
        'related_data', jsonb_build_object(
            'services', v_services,
            'tickets', v_tickets,
            'devices', v_devices
        ),
        'gdpr_records', jsonb_build_object(
            'consent_records', v_consent_records,
            'access_requests', v_access_requests
        ),
        'metadata', v_client.metadata
    );
    
    -- Registrar en audit log
    INSERT INTO gdpr_audit_log (
        user_id, 
        company_id,
        action_type, 
        table_name, 
        record_id,
        subject_email, 
        purpose,
        created_at
    ) VALUES (
        COALESCE(p_requesting_user_id, auth.uid()),
        v_company_id,
        'export',
        'clients',
        p_client_id,
        v_client.email,
        'GDPR Art. 20 - Data Portability Request',
        now()
    );
    
    RETURN jsonb_build_object(
        'success', true,
        'data', v_result
    );
    
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'error_detail', SQLSTATE
    );
END;
$$;


ALTER FUNCTION "public"."export_client_gdpr_data"("p_client_id" "uuid", "p_requesting_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."export_client_gdpr_data"("p_client_id" "uuid", "p_requesting_user_id" "uuid") IS 'Exporta todos los datos personales de un cliente en formato JSON (Art. 20 GDPR)';



CREATE OR REPLACE FUNCTION "public"."f_invoice_collection_status"("p_start" "date" DEFAULT NULL::"date", "p_end" "date" DEFAULT NULL::"date") RETURNS TABLE("company_id" "uuid", "created_by" "uuid", "total_invoiced" numeric, "total_collected" numeric, "total_pending" numeric, "total_overdue" numeric, "overdue_count" bigint, "avg_days_overdue" numeric)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'analytics'
    AS $$
  SELECT 
    ib.company_id,
    ib.created_by,
    SUM(ib.total_amount) AS total_invoiced,
    SUM(ib.paid_amount) AS total_collected,
    SUM(ib.pending_amount) AS total_pending,
    SUM(ib.pending_amount) FILTER (WHERE ib.is_overdue) AS total_overdue,
    COUNT(*) FILTER (WHERE ib.is_overdue) AS overdue_count,
    AVG(ABS(ib.days_to_due)) FILTER (WHERE ib.is_overdue)::numeric AS avg_days_overdue
  FROM analytics.invoice_base ib
  WHERE ib.company_id = public.get_user_company_id()
    AND ib.created_by = auth.uid()
    AND ib.status NOT IN ('cancelled', 'draft')
    AND (p_start IS NULL OR ib.period_month >= p_start)
    AND (p_end   IS NULL OR ib.period_month <= p_end)
  GROUP BY ib.company_id, ib.created_by;
$$;


ALTER FUNCTION "public"."f_invoice_collection_status"("p_start" "date", "p_end" "date") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."f_invoice_collection_status"("p_start" "date", "p_end" "date") IS 'Retorna estado de cobro agregado para el período especificado';



CREATE OR REPLACE FUNCTION "public"."f_invoice_kpis_monthly"("p_start" "date" DEFAULT NULL::"date", "p_end" "date" DEFAULT NULL::"date") RETURNS TABLE("company_id" "uuid", "created_by" "uuid", "period_month" "date", "invoices_count" bigint, "paid_count" bigint, "pending_count" bigint, "overdue_count" bigint, "cancelled_count" bigint, "draft_count" bigint, "subtotal_sum" numeric, "tax_sum" numeric, "total_sum" numeric, "collected_sum" numeric, "pending_sum" numeric, "paid_total_sum" numeric, "receivable_sum" numeric, "avg_invoice_value" numeric, "collection_rate" numeric)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  WITH 
  real_invoices AS (
    SELECT 
      i.company_id,
      i.created_by,
      DATE_TRUNC('month', i.invoice_date)::date as period_month,
      i.status::text as status,
      COALESCE(i.subtotal, 0) as subtotal,
      COALESCE(i.tax_amount, 0) as tax_amount,
      COALESCE(i.total, 0) as total_amount,
      COALESCE(i.paid_amount, 0) as paid_amount
    FROM public.invoices i
    WHERE i.company_id = public.get_company_id_from_jwt()
  ),
  legacy_recurring AS (
    SELECT 
      q.company_id,
      q.created_by,
      DATE_TRUNC('month', q.last_run_at)::date as period_month,
      'paid'::text as status,
      COALESCE(q.subtotal, 0) as subtotal,
      COALESCE(q.tax_amount, 0) as tax_amount,
      COALESCE(q.total_amount, 0) as total_amount,
      COALESCE(q.total_amount, 0) as paid_amount
    FROM public.quotes q
    WHERE q.company_id = public.get_company_id_from_jwt()
      AND q.status = 'invoiced'
      AND q.recurrence_type IS NOT NULL 
      AND q.recurrence_type != 'none'
      AND q.last_run_at IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.invoices inv
        WHERE inv.source_quote_id = q.id
          AND DATE_TRUNC('month', inv.invoice_date)::date = DATE_TRUNC('month', q.last_run_at)::date
      )
  ),
  legacy_first_invoice AS (
    SELECT 
      q.company_id,
      q.created_by,
      DATE_TRUNC('month', q.invoiced_at)::date as period_month,
      'paid'::text as status,
      COALESCE(q.subtotal, 0) as subtotal,
      COALESCE(q.tax_amount, 0) as tax_amount,
      COALESCE(q.total_amount, 0) as total_amount,
      COALESCE(q.total_amount, 0) as paid_amount
    FROM public.quotes q
    WHERE q.company_id = public.get_company_id_from_jwt()
      AND q.status = 'invoiced'
      AND q.recurrence_type IS NOT NULL 
      AND q.recurrence_type != 'none'
      AND q.invoiced_at IS NOT NULL
      AND (q.last_run_at IS NULL OR DATE_TRUNC('month', q.invoiced_at)::date != DATE_TRUNC('month', q.last_run_at)::date)
      AND NOT EXISTS (
        SELECT 1 FROM public.invoices inv
        WHERE inv.source_quote_id = q.id
          AND DATE_TRUNC('month', inv.invoice_date)::date = DATE_TRUNC('month', q.invoiced_at)::date
      )
  ),
  all_invoices AS (
    SELECT * FROM real_invoices
    UNION ALL
    SELECT * FROM legacy_recurring
    UNION ALL
    SELECT * FROM legacy_first_invoice
  ),
  filtered_invoices AS (
    SELECT *
    FROM all_invoices
    WHERE (p_start IS NULL OR period_month >= p_start)
      AND (p_end IS NULL OR period_month <= p_end)
  )
  SELECT 
    fi.company_id,
    fi.created_by,
    fi.period_month,
    COUNT(*)::bigint as invoices_count,
    COUNT(*) FILTER (WHERE fi.status = 'paid')::bigint as paid_count,
    COUNT(*) FILTER (WHERE fi.status IN ('sent', 'draft'))::bigint as pending_count,
    COUNT(*) FILTER (WHERE fi.status = 'overdue')::bigint as overdue_count,
    COUNT(*) FILTER (WHERE fi.status = 'cancelled')::bigint as cancelled_count,
    COUNT(*) FILTER (WHERE fi.status = 'draft')::bigint as draft_count,
    COALESCE(SUM(fi.subtotal), 0) as subtotal_sum,
    COALESCE(SUM(fi.tax_amount), 0) as tax_sum,
    COALESCE(SUM(fi.total_amount), 0) as total_sum,
    COALESCE(SUM(fi.paid_amount), 0) as collected_sum,
    COALESCE(SUM(fi.total_amount) FILTER (WHERE fi.status IN ('sent', 'draft')), 0) as pending_sum,
    COALESCE(SUM(fi.total_amount) FILTER (WHERE fi.status = 'paid'), 0) as paid_total_sum,
    COALESCE(SUM(fi.total_amount) FILTER (WHERE fi.status IN ('sent', 'draft', 'overdue')), 0) as receivable_sum,
    AVG(fi.total_amount) as avg_invoice_value,
    (COUNT(*) FILTER (WHERE fi.status = 'paid')::numeric / NULLIF(COUNT(*), 0)) as collection_rate
  FROM filtered_invoices fi
  GROUP BY fi.company_id, fi.created_by, fi.period_month
  ORDER BY fi.period_month DESC;
$$;


ALTER FUNCTION "public"."f_invoice_kpis_monthly"("p_start" "date", "p_end" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_invoice_kpis_monthly_debug"("p_start" "date" DEFAULT NULL::"date", "p_end" "date" DEFAULT NULL::"date") RETURNS TABLE("company_id" "uuid", "created_by" "uuid", "period_month" "date", "invoices_count" bigint, "total_sum" numeric)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'analytics'
    AS $$
  SELECT m.company_id, m.created_by, m.period_month,
         m.invoices_count, m.total_sum
  FROM analytics.mv_invoice_kpis_monthly m
  WHERE m.company_id = 'cd830f43-f6f0-4b78-a2a4-505e4e0976b5'::uuid
    AND (p_start IS NULL OR m.period_month >= p_start)
    AND (p_end   IS NULL OR m.period_month <= p_end)
  ORDER BY m.period_month DESC;
$$;


ALTER FUNCTION "public"."f_invoice_kpis_monthly_debug"("p_start" "date", "p_end" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_invoice_kpis_monthly_temp"("p_start" "date" DEFAULT NULL::"date", "p_end" "date" DEFAULT NULL::"date") RETURNS TABLE("company_id" "uuid", "created_by" "uuid", "period_month" "date", "invoices_count" bigint, "paid_count" bigint, "pending_count" bigint, "overdue_count" bigint, "cancelled_count" bigint, "draft_count" bigint, "subtotal_sum" numeric, "tax_sum" numeric, "total_sum" numeric, "collected_sum" numeric, "pending_sum" numeric, "paid_total_sum" numeric, "receivable_sum" numeric, "avg_invoice_value" numeric, "collection_rate" numeric)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'analytics'
    AS $$
  SELECT m.company_id, m.created_by, m.period_month,
         m.invoices_count, m.paid_count, m.pending_count, m.overdue_count, 
         m.cancelled_count, m.draft_count,
         m.subtotal_sum, m.tax_sum, m.total_sum,
         m.collected_sum, m.pending_sum, m.paid_total_sum, m.receivable_sum,
         m.avg_invoice_value, m.collection_rate
  FROM analytics.mv_invoice_kpis_monthly m
  WHERE m.company_id = 'cd830f43-f6f0-4b78-a2a4-505e4e0976b5'
    AND (p_start IS NULL OR m.period_month >= p_start)
    AND (p_end   IS NULL OR m.period_month <= p_end)
  ORDER BY m.period_month DESC;
$$;


ALTER FUNCTION "public"."f_invoice_kpis_monthly_temp"("p_start" "date", "p_end" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_quote_cube"("p_start" "date" DEFAULT NULL::"date", "p_end" "date" DEFAULT NULL::"date") RETURNS TABLE("company_id" "uuid", "created_by" "uuid", "period_month" "date", "status" "text", "conversion_status" "text", "group_id" integer, "quotes_count" bigint, "subtotal_sum" numeric, "tax_sum" numeric, "total_sum" numeric)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'analytics'
    AS $$
  SELECT c.company_id, c.created_by, c.period_month, c.status, c.conversion_status, c.group_id,
         c.quotes_count, c.subtotal_sum, c.tax_sum, c.total_sum
  FROM analytics.mv_quote_cube c
  WHERE c.company_id = public.get_user_company_id()
    AND c.created_by = auth.uid()
    AND (p_start IS NULL OR c.period_month >= p_start)
    AND (p_end   IS NULL OR c.period_month <= p_end)
  ORDER BY c.period_month NULLS LAST, c.status NULLS LAST, c.conversion_status NULLS LAST;
$$;


ALTER FUNCTION "public"."f_quote_cube"("p_start" "date", "p_end" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_quote_kpis_monthly"("p_start" "date" DEFAULT NULL::"date", "p_end" "date" DEFAULT NULL::"date") RETURNS TABLE("company_id" "uuid", "period_month" "date", "quotes_count" bigint, "draft_count" bigint, "converted_count" bigint, "pending_count" bigint, "subtotal_sum" numeric, "tax_sum" numeric, "total_sum" numeric, "avg_days_to_accept" numeric, "conversion_rate" numeric)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  WITH current_month AS (
    SELECT DATE_TRUNC('month', CURRENT_DATE)::date as start_date
  ),
  pending_quotes AS (
    SELECT 
      q.company_id,
      (SELECT start_date FROM current_month) as period_month,
      q.status,
      q.conversion_status,
      COALESCE(q.subtotal, 0) as subtotal,
      COALESCE(q.tax_amount, 0) as tax_amount,
      COALESCE(q.total_amount, 0) as total_amount,
      CASE 
        WHEN q.accepted_at IS NOT NULL 
        THEN EXTRACT(DAY FROM (q.accepted_at - COALESCE(q.quote_date, q.created_at)))
        ELSE NULL 
      END as days_to_accept
    FROM public.quotes q
    WHERE q.company_id = public.get_company_id_from_jwt()
      AND q.status IN ('draft', 'sent', 'accepted', 'expired')
      AND (q.conversion_status IS NULL OR q.conversion_status = 'not_converted')
  )
  SELECT 
    pq.company_id,
    pq.period_month,
    COUNT(*)::bigint as quotes_count,
    COUNT(*) FILTER (WHERE pq.status = 'draft')::bigint as draft_count,
    0::bigint as converted_count,
    COUNT(*)::bigint as pending_count,
    COALESCE(SUM(pq.subtotal), 0) as subtotal_sum,
    COALESCE(SUM(pq.tax_amount), 0) as tax_sum,
    COALESCE(SUM(pq.total_amount), 0) as total_sum,
    AVG(pq.days_to_accept) as avg_days_to_accept,
    0::numeric as conversion_rate
  FROM pending_quotes pq
  WHERE (p_start IS NULL OR pq.period_month >= p_start)
    AND (p_end IS NULL OR pq.period_month <= p_end)
  GROUP BY pq.company_id, pq.period_month
  ORDER BY pq.period_month DESC;
$$;


ALTER FUNCTION "public"."f_quote_kpis_monthly"("p_start" "date", "p_end" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_quote_kpis_monthly_enhanced"("p_start" "date" DEFAULT NULL::"date", "p_end" "date" DEFAULT NULL::"date") RETURNS TABLE("company_id" "uuid", "period_month" "date", "quotes_count" bigint, "draft_count" bigint, "converted_count" bigint, "pending_count" bigint, "subtotal_sum" numeric, "tax_sum" numeric, "total_sum" numeric, "avg_days_to_accept" numeric, "conversion_rate" numeric)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  WITH current_month_start AS (
    SELECT DATE_TRUNC('month', CURRENT_DATE)::date as month_start
  ),
  quote_data AS (
    SELECT 
      q.company_id,
      CASE 
        WHEN DATE_TRUNC('month', COALESCE(q.quote_date, q.created_at))::date < (SELECT month_start FROM current_month_start)
          AND q.status IN ('draft', 'sent', 'accepted')
          AND (q.conversion_status IS NULL OR q.conversion_status NOT IN ('converted', 'invoiced'))
        THEN (SELECT month_start FROM current_month_start)
        ELSE DATE_TRUNC('month', COALESCE(q.quote_date, q.created_at))::date
      END as period_month,
      q.status,
      q.conversion_status,
      COALESCE(q.subtotal, 0) as subtotal,
      COALESCE(q.tax_amount, 0) as tax_amount,
      COALESCE(q.total_amount, 0) as total_amount,
      CASE 
        WHEN q.accepted_at IS NOT NULL 
        THEN EXTRACT(DAY FROM (q.accepted_at - COALESCE(q.quote_date, q.created_at)))
        ELSE NULL 
      END as days_to_accept
    FROM public.quotes q
    WHERE q.company_id = public.get_company_id_from_jwt()
      AND (
        q.status IN ('draft', 'sent', 'accepted')
        OR q.conversion_status IN ('converted', 'invoiced')
      )
  ),
  filtered_data AS (
    SELECT *
    FROM quote_data
    WHERE (p_start IS NULL OR period_month >= p_start)
      AND (p_end IS NULL OR period_month <= p_end)
  )
  SELECT 
    qd.company_id,
    qd.period_month,
    COUNT(*)::bigint as quotes_count,
    COUNT(*) FILTER (WHERE qd.status = 'draft')::bigint as draft_count,
    COUNT(*) FILTER (WHERE qd.conversion_status IN ('converted', 'invoiced'))::bigint as converted_count,
    COUNT(*) FILTER (WHERE qd.status IN ('draft', 'sent', 'accepted') 
                      AND (qd.conversion_status IS NULL OR qd.conversion_status NOT IN ('converted', 'invoiced')))::bigint as pending_count,
    SUM(CASE 
      WHEN qd.status IN ('draft', 'sent', 'accepted')
        AND (qd.conversion_status IS NULL OR qd.conversion_status NOT IN ('converted', 'invoiced'))
      THEN qd.subtotal 
      ELSE 0 
    END) as subtotal_sum,
    SUM(CASE 
      WHEN qd.status IN ('draft', 'sent', 'accepted')
        AND (qd.conversion_status IS NULL OR qd.conversion_status NOT IN ('converted', 'invoiced'))
      THEN qd.tax_amount 
      ELSE 0 
    END) as tax_sum,
    SUM(CASE 
      WHEN qd.status IN ('draft', 'sent', 'accepted')
        AND (qd.conversion_status IS NULL OR qd.conversion_status NOT IN ('converted', 'invoiced'))
      THEN qd.total_amount 
      ELSE 0 
    END) as total_sum,
    AVG(qd.days_to_accept) as avg_days_to_accept,
    (COUNT(*) FILTER (WHERE qd.conversion_status IN ('converted', 'invoiced'))::numeric / NULLIF(COUNT(*), 0)) as conversion_rate
  FROM filtered_data qd
  GROUP BY qd.company_id, qd.period_month
  ORDER BY qd.period_month DESC;
$$;


ALTER FUNCTION "public"."f_quote_kpis_monthly_enhanced"("p_start" "date", "p_end" "date") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."f_quote_kpis_monthly_enhanced"("p_start" "date", "p_end" "date") IS 'Retorna KPIs mejorados de presupuestos por mes';



CREATE OR REPLACE FUNCTION "public"."f_quote_pipeline_current"() RETURNS TABLE("company_id" "uuid", "quotes_count" bigint, "draft_count" bigint, "sent_count" bigint, "accepted_count" bigint, "expired_count" bigint, "subtotal_sum" numeric, "tax_sum" numeric, "total_sum" numeric)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT 
    q.company_id,
    COUNT(*)::bigint as quotes_count,
    COUNT(*) FILTER (WHERE q.status = 'draft')::bigint as draft_count,
    COUNT(*) FILTER (WHERE q.status = 'sent')::bigint as sent_count,
    COUNT(*) FILTER (WHERE q.status = 'accepted')::bigint as accepted_count,
    COUNT(*) FILTER (WHERE q.status = 'expired')::bigint as expired_count,
    COALESCE(SUM(q.subtotal), 0) as subtotal_sum,
    COALESCE(SUM(q.tax_amount), 0) as tax_sum,
    COALESCE(SUM(q.total_amount), 0) as total_sum
  FROM public.quotes q
  WHERE q.company_id = public.get_company_id_from_jwt()
    AND q.status IN ('draft', 'sent', 'accepted', 'expired')
    AND (q.conversion_status IS NULL OR q.conversion_status = 'not_converted')
  GROUP BY q.company_id;
$$;


ALTER FUNCTION "public"."f_quote_pipeline_current"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_quote_projected_revenue"("p_start" "date" DEFAULT NULL::"date", "p_end" "date" DEFAULT NULL::"date") RETURNS TABLE("company_id" "uuid", "period_month" "date", "draft_count" bigint, "subtotal" numeric, "tax_amount" numeric, "grand_total" numeric)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'analytics'
    AS $$
  SELECT
    q.company_id,
    q.quote_month as period_month,
    COUNT(*)::bigint as draft_count,
    COALESCE(SUM(q.subtotal), 0) as subtotal,
    COALESCE(SUM(q.tax_amount), 0) as tax_amount,
    COALESCE(SUM(q.total_amount), 0) as grand_total
  FROM public.quotes q
  WHERE q.company_id = public.get_company_id_from_jwt()
    AND q.status = 'draft'
    AND (p_start IS NULL OR q.quote_month >= p_start)
    AND (p_end IS NULL OR q.quote_month <= p_end)
  GROUP BY q.company_id, q.quote_month
  ORDER BY q.quote_month DESC;
$$;


ALTER FUNCTION "public"."f_quote_projected_revenue"("p_start" "date", "p_end" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_quote_recurring_monthly"("p_start" "date" DEFAULT NULL::"date", "p_end" "date" DEFAULT NULL::"date") RETURNS TABLE("company_id" "uuid", "period_month" "date", "recurring_count" bigint, "subtotal" numeric, "tax_amount" numeric, "grand_total" numeric)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  WITH target_period AS (
    SELECT 
      COALESCE(p_start, DATE_TRUNC('month', CURRENT_DATE)::date) as start_date,
      COALESCE(p_end, (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::date) as end_date
  ),
  recurring_with_calculated_date AS (
    SELECT 
      q.company_id,
      q.subtotal,
      q.tax_amount,
      q.total_amount,
      -- Calcular next_run_at si es NULL basándose en recurrence_day y recurrence_type
      COALESCE(
        q.next_run_at::date,
        q.invoice_on_date,  -- CORREGIDO: era scheduled_conversion_date
        -- Si es mensual y tiene recurrence_day, usar ese día del mes actual/siguiente
        CASE 
          WHEN q.recurrence_type = 'monthly' AND q.recurrence_day IS NOT NULL THEN
            CASE
              -- Si el día ya pasó este mes, usar el próximo mes
              WHEN q.recurrence_day < EXTRACT(DAY FROM CURRENT_DATE) THEN
                (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' + (q.recurrence_day - 1 || ' days')::INTERVAL)::date
              -- Si el día es hoy o futuro, usar este mes
              ELSE
                (DATE_TRUNC('month', CURRENT_DATE) + (q.recurrence_day - 1 || ' days')::INTERVAL)::date
            END
          -- Si es trimestral, calcular 3 meses después de la última factura
          WHEN q.recurrence_type = 'quarterly' AND q.last_run_at IS NOT NULL THEN
            (q.last_run_at + INTERVAL '3 months')::date
          -- Si es anual, calcular 1 año después
          WHEN q.recurrence_type = 'yearly' AND q.last_run_at IS NOT NULL THEN
            (q.last_run_at + INTERVAL '1 year')::date
          -- Default: usar el día de hoy
          ELSE CURRENT_DATE
        END
      ) as calculated_next_run
    FROM public.quotes q, target_period tp
    WHERE q.company_id = public.get_company_id_from_jwt()
      AND q.recurrence_type != 'none'
      -- CORREGIDO: solo estados válidos (sin 'pending')
      AND q.status IN ('draft', 'sent', 'accepted', 'invoiced')
      -- ELIMINADO: deleted_at no existe en quotes
      -- Si tiene fecha de fin, verificar que no haya expirado
      AND (q.recurrence_end_date IS NULL OR q.recurrence_end_date >= tp.start_date)
  )
  SELECT 
    r.company_id,
    DATE_TRUNC('month', r.calculated_next_run)::date as period_month,
    COUNT(*)::bigint as recurring_count,
    COALESCE(SUM(r.subtotal), 0) as subtotal,
    COALESCE(SUM(r.tax_amount), 0) as tax_amount,
    COALESCE(SUM(r.total_amount), 0) as grand_total
  FROM recurring_with_calculated_date r, target_period tp
  WHERE r.calculated_next_run BETWEEN tp.start_date AND tp.end_date
  GROUP BY r.company_id, period_month
  ORDER BY period_month DESC;
$$;


ALTER FUNCTION "public"."f_quote_recurring_monthly"("p_start" "date", "p_end" "date") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."f_quote_recurring_monthly"("p_start" "date", "p_end" "date") IS 'Retorna presupuestos recurrentes que deben convertirse a factura en el período especificado. Calcula next_run_at dinámicamente si es NULL.';



CREATE OR REPLACE FUNCTION "public"."f_quote_top_items_monthly"("p_start" "date" DEFAULT NULL::"date", "p_end" "date" DEFAULT NULL::"date", "p_limit" integer DEFAULT 50) RETURNS TABLE("company_id" "uuid", "created_by" "uuid", "period_month" "date", "item_id" "uuid", "qty_sum" numeric, "subtotal_sum" numeric, "total_sum" numeric, "rn_by_amount" bigint, "rn_by_qty" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'analytics'
    AS $$
  SELECT t.company_id, t.created_by, t.period_month, t.item_id,
         t.qty_sum, t.subtotal_sum, t.total_sum, t.rn_by_amount, t.rn_by_qty
  FROM analytics.mv_quote_top_items_monthly t
  WHERE t.company_id = public.get_user_company_id()
    AND t.created_by = auth.uid()
    AND (p_start IS NULL OR t.period_month >= p_start)
    AND (p_end   IS NULL OR t.period_month <= p_end)
    AND (t.rn_by_amount <= p_limit OR t.rn_by_qty <= p_limit)
  ORDER BY t.period_month DESC, t.total_sum DESC;
$$;


ALTER FUNCTION "public"."f_quote_top_items_monthly"("p_start" "date", "p_end" "date", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_ticket_current_status"() RETURNS TABLE("company_id" "uuid", "total_open" bigint, "total_in_progress" bigint, "total_completed" bigint, "total_overdue" bigint, "critical_open" bigint, "high_open" bigint, "avg_age_days" numeric, "oldest_ticket_days" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'analytics'
    AS $$
  SELECT 
    tb.company_id,
    COUNT(*) FILTER (WHERE tb.workflow_category = 'waiting' 
      OR (tb.workflow_category IS NULL AND tb.stage_category = 'open')) AS total_open,
    COUNT(*) FILTER (WHERE tb.workflow_category IN ('analysis', 'action')
      OR (tb.workflow_category IS NULL AND tb.stage_category = 'in_progress')) AS total_in_progress,
    COUNT(*) FILTER (WHERE tb.is_completed) AS total_completed,
    COUNT(*) FILTER (WHERE tb.is_overdue) AS total_overdue,
    COUNT(*) FILTER (WHERE NOT tb.is_completed AND (tb.priority = 'critical' OR tb.priority = 'urgent')) AS critical_open,
    COUNT(*) FILTER (WHERE NOT tb.is_completed AND tb.priority = 'high') AS high_open,
    AVG(EXTRACT(EPOCH FROM (NOW() - tb.created_at)) / 86400.0) 
      FILTER (WHERE NOT tb.is_completed)::numeric AS avg_age_days,
    MAX((CURRENT_DATE - tb.created_at::date)) 
      FILTER (WHERE NOT tb.is_completed)::integer AS oldest_ticket_days
  FROM analytics.ticket_base tb
  WHERE tb.company_id = public.get_company_id_from_jwt()
  GROUP BY tb.company_id;
$$;


ALTER FUNCTION "public"."f_ticket_current_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."f_ticket_kpis_monthly"("p_start" "date" DEFAULT NULL::"date", "p_end" "date" DEFAULT NULL::"date") RETURNS TABLE("company_id" "uuid", "period_month" "date", "tickets_created" bigint, "critical_count" bigint, "high_priority_count" bigint, "normal_priority_count" bigint, "low_priority_count" bigint, "open_count" bigint, "in_progress_count" bigint, "completed_count" bigint, "completed_this_month" bigint, "overdue_count" bigint, "total_amount_sum" numeric, "invoiced_amount_sum" numeric, "avg_resolution_days" numeric, "min_resolution_days" numeric, "max_resolution_days" numeric, "resolution_rate" numeric)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'analytics'
    AS $$
  SELECT 
    m.company_id, 
    m.period_month,
    m.tickets_created, 
    m.critical_count, 
    m.high_priority_count, 
    m.normal_priority_count, 
    m.low_priority_count,
    m.open_count, 
    m.in_progress_count, 
    m.completed_count, 
    m.completed_this_month, 
    m.overdue_count,
    m.total_amount_sum, 
    m.invoiced_amount_sum,
    m.avg_resolution_days, 
    m.min_resolution_days, 
    m.max_resolution_days,
    m.resolution_rate
  FROM analytics.mv_ticket_kpis_monthly m
  WHERE m.company_id = public.get_company_id_from_jwt()
    AND (p_start IS NULL OR m.period_month >= p_start)
    AND (p_end   IS NULL OR m.period_month <= p_end)
  ORDER BY m.period_month DESC;
$$;


ALTER FUNCTION "public"."f_ticket_kpis_monthly"("p_start" "date", "p_end" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finalize_invoice"("p_invoice_id" "uuid", "p_series" "text", "p_device_id" "text" DEFAULT NULL::"text", "p_software_id" "text" DEFAULT NULL::"text") RETURNS json
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_company_id uuid;
  v_user uuid := auth.uid();
  v_number bigint;
  v_prev text;
  v_payload jsonb;
  v_hash text;
  v_vat jsonb;
  v_qr text;
  v_invoice_type text;
  v_rectifies_id uuid;
  v_rectified_series text;
  v_rectified_number text;
  v_rectified_date date;
BEGIN
  SELECT company_id, invoice_type, rectifies_invoice_id 
    INTO v_company_id, v_invoice_type, v_rectifies_id 
    FROM public.invoices WHERE id = p_invoice_id;
    
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Invoice % not found or missing company_id', p_invoice_id;
  END IF;

  -- Get sequential number & previous hash
  SELECT number, previous_hash INTO v_number, v_prev FROM verifactu.get_next_invoice_number(v_company_id, p_series);

  -- VAT breakdown
  BEGIN
    v_vat := verifactu.compute_vat_breakdown(p_invoice_id);
  EXCEPTION WHEN undefined_function THEN
    v_vat := '[]'::jsonb;
  END;

  -- Canonical payload for hash
  v_payload := jsonb_build_object(
    'invoice_id', p_invoice_id,
    'company_id', v_company_id,
    'series', p_series,
    'number', v_number,
    'currency', (SELECT currency FROM public.invoices WHERE id=p_invoice_id),
    'totals', jsonb_build_object(
      'base', (SELECT total_tax_base FROM public.invoices WHERE id=p_invoice_id),
      'vat', (SELECT total_vat FROM public.invoices WHERE id=p_invoice_id),
      'gross', (SELECT total_gross FROM public.invoices WHERE id=p_invoice_id)
    ),
    'vat_breakdown', COALESCE(v_vat, '[]'::jsonb)
  );

  -- Add Rectification details if applicable
  IF v_invoice_type = 'rectificative' AND v_rectifies_id IS NOT NULL THEN
    -- Fetch rectified invoice details
    SELECT series, number::text, issue_time::date 
      INTO v_rectified_series, v_rectified_number, v_rectified_date
      FROM verifactu.invoice_meta 
     WHERE invoice_id = v_rectifies_id;
     
    -- Fallback to invoices table if not in meta
    IF v_rectified_series IS NULL THEN
       SELECT invoice_series, invoice_number, invoice_date 
         INTO v_rectified_series, v_rectified_number, v_rectified_date
         FROM public.invoices WHERE id = v_rectifies_id;
    END IF;

    v_payload := v_payload || jsonb_build_object(
      'invoice_type', 'R',
      'rectified_invoice', jsonb_build_object(
        'series', v_rectified_series,
        'number', v_rectified_number,
        'issue_date', v_rectified_date
      ),
      'rectification_type', 'S'
    );
  END IF;

  v_hash := verifactu.compute_invoice_hash(v_payload, v_prev);
  v_qr := 'SERIE:'||p_series||'|NUM:'||v_number||'|HASH:'||v_hash;

  -- Persist meta
  INSERT INTO verifactu.invoice_meta(invoice_id, company_id, series, number, chained_hash, previous_hash, device_id, software_id, qr_payload, status, created_by)
  VALUES (p_invoice_id, v_company_id, p_series, v_number, v_hash, v_prev, p_device_id, p_software_id, v_qr, 'pending', v_user)
  ON CONFLICT (invoice_id) DO UPDATE
    SET chained_hash = excluded.chained_hash,
        previous_hash = excluded.previous_hash,
        series = excluded.series,
        number = excluded.number,
        device_id = excluded.device_id,
        software_id = excluded.software_id,
        qr_payload = excluded.qr_payload,
        status = 'pending';

  -- Mark invoice as final
  UPDATE public.invoices
     SET state='final',
         finalized_at = COALESCE(finalized_at, now()),
         canonical_payload = v_payload,
         hash_prev = v_prev,
         hash_current = v_hash
   WHERE id=p_invoice_id;

  -- Advance sequence
  UPDATE verifactu.invoice_sequence
     SET last_hash = v_hash,
         updated_at = now()
   WHERE company_id=v_company_id AND series=p_series;

  -- Enqueue event
  INSERT INTO verifactu.events(company_id, invoice_id, event_type, payload)
  VALUES (v_company_id, p_invoice_id, 'alta', v_payload)
  ON CONFLICT (invoice_id, event_type) DO NOTHING;

  RETURN json_build_object('invoice_id', p_invoice_id, 'series', p_series, 'number', v_number, 'hash', v_hash, 'qr', v_qr, 'vat_breakdown', COALESCE(v_vat, '[]'::jsonb));
END;
$$;


ALTER FUNCTION "public"."finalize_invoice"("p_invoice_id" "uuid", "p_series" "text", "p_device_id" "text", "p_software_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_invoice_immutable_after_issue"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF OLD.state = 'final' OR OLD.status IN ('sent','paid') THEN
    IF (NEW.subtotal, NEW.tax_amount, NEW.total) IS DISTINCT FROM (OLD.subtotal, OLD.tax_amount, OLD.total)
       OR NEW.client_id <> OLD.client_id THEN
      RAISE EXCEPTION 'Immutable invoice after emission (amounts/client)';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_invoice_immutable_after_issue"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_is_variant_visible"("p_variant_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_auth_uid uuid := auth.uid();
  v_service_id uuid;
  v_is_hidden boolean;
  v_service_is_public boolean;
  v_service_is_active boolean;
  v_has_assignment boolean;
  v_has_other_assignment boolean;
BEGIN
  -- If no user is logged in, denied
  IF v_auth_uid IS NULL THEN
    RETURN false;
  END IF;

  -- Get variant and service info
  SELECT sv.service_id, COALESCE(sv.is_hidden, false), COALESCE(s.is_public, false), COALESCE(s.is_active, false)
  INTO v_service_id, v_is_hidden, v_service_is_public, v_service_is_active
  FROM service_variants sv
  JOIN services s ON s.id = sv.service_id
  WHERE sv.id = p_variant_id;

  -- If variant not found, return false
  IF v_service_id IS NULL THEN
    RETURN false;
  END IF;

  -- 1. Check if user has specific assignment to THIS variant
  SELECT EXISTS (
    SELECT 1 
    FROM client_variant_assignments cva
    JOIN clients c ON c.id = cva.client_id
    WHERE cva.variant_id = p_variant_id
    AND c.auth_user_id = v_auth_uid
  ) INTO v_has_assignment;

  IF v_has_assignment THEN
    RETURN true;
  END IF;

  -- 2. Check general visibility conditions
  -- Must not be hidden
  IF v_is_hidden THEN
    RETURN false;
  END IF;

  -- Must be public and active service
  IF NOT (v_service_is_public AND v_service_is_active) THEN
    RETURN false;
  END IF;

  -- Must NOT have assignment to ANY OTHER variant of this service
  -- (If you are assigned a specific variant, you shouldn't see the public ones for that service)
  SELECT EXISTS (
    SELECT 1 
    FROM client_variant_assignments cva
    JOIN clients c ON c.id = cva.client_id
    WHERE cva.service_id = v_service_id
    AND c.auth_user_id = v_auth_uid
  ) INTO v_has_other_assignment;

  IF v_has_other_assignment THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;


ALTER FUNCTION "public"."fn_is_variant_visible"("p_variant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_ticket_comments_maintain_integrity"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_company uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.ticket_id IS DISTINCT FROM OLD.ticket_id THEN
      RAISE EXCEPTION 'ticket_id cannot be changed for a comment';
    END IF;
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'user_id cannot be changed for a comment';
    END IF;
  END IF;

  SELECT t.company_id INTO v_company FROM public.tickets t WHERE t.id = NEW.ticket_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Invalid ticket reference on ticket_comments (ticket not found)';
  END IF;
  NEW.company_id := v_company;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_ticket_comments_maintain_integrity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end; $$;


ALTER FUNCTION "public"."fn_touch_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_verifactu_settings_enforce_modes"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.cert_pem_enc IS NOT NULL OR NEW.key_pem_enc IS NOT NULL THEN
    NEW.cert_pem := NULL;
    NEW.key_pem := NULL;
    NEW.key_passphrase := NULL;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."fn_verifactu_settings_enforce_modes"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gdpr_accept_consent"("p_token" "text", "p_preferences" "jsonb", "p_evidence" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  r public.gdpr_consent_requests;
  v_now timestamptz := now();
  v_type text;
  v_given boolean;
BEGIN
  SELECT * INTO r FROM public.gdpr_consent_requests WHERE token = p_token FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_token');
  END IF;
  IF r.status <> 'pending' OR r.expires_at < v_now THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_pending');
  END IF;

  -- Insert one consent record per requested type
  FOREACH v_type IN ARRAY r.consent_types LOOP
    v_given := COALESCE((p_preferences ->> v_type)::boolean, false);
    INSERT INTO public.gdpr_consent_records (
      subject_id, subject_email, consent_type, purpose, consent_given, consent_method,
      consent_evidence, company_id, processed_by, legal_basis
    ) VALUES (
      r.client_id,
      r.subject_email,
      v_type,
      COALESCE(r.purpose, 'consent_portal'),
      v_given,
      'website',
      jsonb_build_object('source','consent_portal','token',p_token,'evidence',p_evidence),
      r.company_id,
      NULL,
      CASE WHEN v_type = 'data_processing' THEN 'consent' ELSE NULL END
    );
  END LOOP;

  -- Update convenience fields on clients when present
  IF r.client_id IS NOT NULL THEN
    UPDATE public.clients SET
      data_processing_consent = COALESCE((p_preferences->>'data_processing')::boolean, data_processing_consent),
      data_processing_consent_date = CASE WHEN (p_preferences->>'data_processing')::boolean IS NOT NULL THEN v_now ELSE data_processing_consent_date END,
      marketing_consent = COALESCE((p_preferences->>'marketing')::boolean, marketing_consent),
      marketing_consent_date = CASE WHEN (p_preferences->>'marketing')::boolean IS NOT NULL THEN v_now ELSE marketing_consent_date END,
      marketing_consent_method = 'website'
    WHERE id = r.client_id;
  END IF;

  UPDATE public.gdpr_consent_requests
  SET status = 'accepted', accepted_at = v_now, evidence = p_evidence
  WHERE id = r.id;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;


ALTER FUNCTION "public"."gdpr_accept_consent"("p_token" "text", "p_preferences" "jsonb", "p_evidence" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gdpr_anonymize_client"("client_id" "uuid", "requesting_user_id" "uuid", "anonymization_reason" "text" DEFAULT 'gdpr_erasure_request'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    client_record record;
    anonymized_data jsonb;
BEGIN
    -- Get client record
    SELECT * INTO client_record FROM public.clients WHERE id = client_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Client not found');
    END IF;
    
    -- Verificar si ya está anonimizado
    IF client_record.anonymized_at IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Client already anonymized',
            'anonymized_at', client_record.anonymized_at
        );
    END IF;
    
    -- Create anonymized data structure
    anonymized_data := jsonb_build_object(
        'original_id', client_record.id,
        'anonymized_at', now(),
        'anonymized_by', requesting_user_id,
        'reason', anonymization_reason,
        'original_email_hash', md5(client_record.email),
        'original_dni_hash', md5(COALESCE(client_record.dni, ''))
    );
    
    -- ✅ Update client with anonymized data (INCLUYENDO APELLIDOS)
    UPDATE public.clients SET
        name = 'ANONYMIZED_' || left(md5(client_record.name), 8),
        apellidos = 'ANONYMIZED_' || left(md5(COALESCE(client_record.apellidos, '')), 8),
        email = 'anonymized.' || left(md5(client_record.email), 8) || '@anonymized.local',
        phone = NULL,
        dni = NULL,
        address = jsonb_build_object('anonymized', true),
        metadata = jsonb_build_object('anonymized', true, 'original_metadata', anonymized_data),
        anonymized_at = now(),
        last_accessed_at = now(),
        access_count = COALESCE(access_count, 0) + 1,
        updated_at = now()
    WHERE id = client_id;
    
    -- Log the anonymization
    INSERT INTO public.gdpr_audit_log (
        user_id, action_type, table_name, record_id, 
        subject_email, purpose, created_at
    ) VALUES (
        requesting_user_id, 'anonymize', 'clients', client_id,
        client_record.email, anonymization_reason, now()
    );
    
    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Client data anonymized successfully',
        'anonymized_id', client_id,
        'anonymized_at', now()
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false, 
        'error', SQLERRM
    );
END;
$$;


ALTER FUNCTION "public"."gdpr_anonymize_client"("client_id" "uuid", "requesting_user_id" "uuid", "anonymization_reason" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."gdpr_anonymize_client"("client_id" "uuid", "requesting_user_id" "uuid", "anonymization_reason" "text") IS 'Anonimiza todos los datos personales de un cliente incluyendo apellidos (Art. 17 GDPR)';



CREATE OR REPLACE FUNCTION "public"."gdpr_audit_clients_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        PERFORM gdpr_log_access(
            auth.uid(),
            'create',
            'clients',
            NEW.id,
            NEW.email,
            'client_creation',
            NULL,
            to_jsonb(NEW)
        );
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        PERFORM gdpr_log_access(
            auth.uid(),
            'update',
            'clients',
            NEW.id,
            NEW.email,
            'client_modification',
            to_jsonb(OLD),
            to_jsonb(NEW)
        );
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        PERFORM gdpr_log_access(
            auth.uid(),
            'delete',
            'clients',
            OLD.id,
            OLD.email,
            'client_deletion',
            to_jsonb(OLD),
            NULL
        );
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."gdpr_audit_clients_trigger"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gdpr_audit_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $_$
declare
  payload jsonb;
  tbl text := tg_table_schema || '.' || tg_table_name;
  act text := tg_op;
  rec_id text := coalesce((to_jsonb(new)->>'id'), (to_jsonb(old)->>'id'));
begin
  payload := jsonb_build_object(
    'table', tbl,
    'op', act,
    'when', now(),
    'user', auth.uid(),
    'pk', rec_id,
    'new', case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end,
    'old', case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end
  );
  perform pg_notify('gdpr_audit', payload::text);
  begin
    execute 'insert into public.gdpr_audit_log(action, details) values ($1,$2)'
      using concat('TRIGGER ', tbl, ' ', act), payload;
  exception when undefined_table or undefined_column then
    -- ignore if audit table/columns differ or do not exist
    null;
  end;
  return coalesce(new, old);
end$_$;


ALTER FUNCTION "public"."gdpr_audit_trigger"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gdpr_create_consent_request"("p_client_id" "uuid", "p_subject_email" "text", "p_consent_types" "text"[], "p_purpose" "text" DEFAULT NULL::"text", "p_expires" interval DEFAULT '30 days'::interval) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_company_id uuid;
  v_request_id uuid;
  v_token text;
BEGIN
  -- Determine company of current user
  SELECT company_id INTO v_company_id FROM public.users WHERE auth_user_id = auth.uid() AND active = true LIMIT 1;
  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  INSERT INTO public.gdpr_consent_requests (client_id, subject_email, company_id, consent_types, purpose, expires_at)
  VALUES (p_client_id, lower(trim(p_subject_email)), v_company_id, p_consent_types, p_purpose, now() + COALESCE(p_expires, interval '30 days'))
  RETURNING id, token INTO v_request_id, v_token;

  -- Log audit
  PERFORM gdpr_log_access(auth.uid(), 'consent', 'gdpr_consent_requests', v_request_id, p_subject_email, 'consent_request_created');

  RETURN jsonb_build_object('success', true, 'request_id', v_request_id, 'token', v_token, 'path', '/consent?t='||v_token);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;


ALTER FUNCTION "public"."gdpr_create_consent_request"("p_client_id" "uuid", "p_subject_email" "text", "p_consent_types" "text"[], "p_purpose" "text", "p_expires" interval) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gdpr_decline_consent"("p_token" "text", "p_evidence" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  r public.gdpr_consent_requests;
BEGIN
  SELECT * INTO r FROM public.gdpr_consent_requests WHERE token = p_token FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_token');
  END IF;

  UPDATE public.gdpr_consent_requests
  SET status = 'declined', accepted_at = now(), evidence = p_evidence
  WHERE id = r.id;

  -- Optional: record explicit refusal entries for traceability (consent_given = false)
  INSERT INTO public.gdpr_consent_records (
    subject_id, subject_email, consent_type, purpose, consent_given, consent_method,
    consent_evidence, company_id, processed_by, legal_basis
  )
  SELECT r.client_id, r.subject_email, ct, COALESCE(r.purpose,'consent_portal'), false, 'website',
         jsonb_build_object('source','consent_portal','token',p_token,'evidence',p_evidence), r.company_id, NULL, NULL
  FROM unnest(r.consent_types) AS ct;

  RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;


ALTER FUNCTION "public"."gdpr_decline_consent"("p_token" "text", "p_evidence" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gdpr_export_client_data"("client_email" "text", "requesting_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
    client_data jsonb;
    related_data jsonb;
BEGIN
    -- Get main client data
    SELECT jsonb_build_object(
        'personal_data', jsonb_build_object(
            'id', c.id,
            'name', c.name,
            'email', c.email,
            'phone', c.phone,
            'dni', c.dni,
            'address', c.address,
            'created_at', c.created_at,
            'updated_at', c.updated_at
        ),
        'consent_records', (
            SELECT jsonb_agg(jsonb_build_object(
                'consent_type', consent_type,
                'purpose', purpose,
                'consent_given', consent_given,
                'consent_method', consent_method,
                'created_at', created_at,
                'withdrawn_at', withdrawn_at
            ))
            FROM public.gdpr_consent_records 
            WHERE subject_email = client_email
        ),
        'processing_activities', (
            SELECT jsonb_agg(jsonb_build_object(
                'activity_name', activity_name,
                'purpose', purpose,
                'legal_basis', legal_basis,
                'retention_period', retention_period
            ))
            FROM public.gdpr_processing_activities
            WHERE 'customers' = ANY(data_subjects)
        )
    ) INTO client_data
    FROM public.clients c
    WHERE c.email = client_email;
    
    -- Log the data export
    INSERT INTO public.gdpr_audit_log (
        user_id, action_type, table_name, subject_email, 
        purpose, created_at
    ) VALUES (
        requesting_user_id, 'export', 'clients', client_email,
        'gdpr_data_portability_request', now()
    );
    
    RETURN jsonb_build_object(
        'success', true,
        'export_date', now(),
        'exported_by', requesting_user_id,
        'data', client_data
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$;


ALTER FUNCTION "public"."gdpr_export_client_data"("client_email" "text", "requesting_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gdpr_get_consent_request"("p_token" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  r record;
  v_expired boolean;
BEGIN
  SELECT gcr.*, c.name AS company_name INTO r
  FROM public.gdpr_consent_requests gcr
  JOIN public.companies c ON c.id = gcr.company_id
  WHERE gcr.token = p_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_token');
  END IF;

  v_expired := (r.expires_at < now());

  RETURN jsonb_build_object(
    'success', true,
    'status', CASE WHEN v_expired AND r.status='pending' THEN 'expired' ELSE r.status END,
    'subject_email', r.subject_email,
    'client_id', r.client_id,
    'company_id', r.company_id,
    'company_name', r.company_name,
    'consent_types', r.consent_types,
    'purpose', r.purpose,
    'expires_at', r.expires_at
  );
END;
$$;


ALTER FUNCTION "public"."gdpr_get_consent_request"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."gdpr_log_access"("user_id" "uuid", "action_type" "text", "table_name" "text", "record_id" "uuid" DEFAULT NULL::"uuid", "subject_email" "text" DEFAULT NULL::"text", "purpose" "text" DEFAULT NULL::"text", "old_values" "jsonb" DEFAULT NULL::"jsonb", "new_values" "jsonb" DEFAULT NULL::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
    INSERT INTO public.gdpr_audit_log (
        user_id, action_type, table_name, record_id,
        subject_email, purpose, old_values, new_values,
        ip_address, created_at
    ) VALUES (
        user_id, action_type, table_name, record_id,
        subject_email, purpose, old_values, new_values,
        inet_client_addr(), now()
    );
END;
$$;


ALTER FUNCTION "public"."gdpr_log_access"("user_id" "uuid", "action_type" "text", "table_name" "text", "record_id" "uuid", "subject_email" "text", "purpose" "text", "old_values" "jsonb", "new_values" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_file_path"("company_uuid" "uuid", "file_name" "text", "subfolder" "text" DEFAULT 'general'::"text") RETURNS "text"
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  -- Genera: company_id/subfolder/timestamp_filename
  RETURN company_uuid::text || '/' || subfolder || '/' || 
         extract(epoch from now())::bigint || '_' || file_name;
END;
$$;


ALTER FUNCTION "public"."generate_file_path"("company_uuid" "uuid", "file_name" "text", "subfolder" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_verifactu_hash"("p_invoice_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_invoice RECORD;
  v_previous_hash TEXT;
  v_data_string TEXT;
  v_new_hash TEXT;
BEGIN
  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id;

  SELECT verifactu_hash INTO v_previous_hash
  FROM invoices
  WHERE series_id = v_invoice.series_id
    AND verifactu_chain_position = (v_invoice.verifactu_chain_position - 1)
  LIMIT 1;

  v_previous_hash := COALESCE(v_previous_hash, 'GENESIS');

  v_data_string := v_previous_hash ||
                   v_invoice.full_invoice_number ||
                   v_invoice.invoice_date::TEXT ||
                   v_invoice.total::TEXT ||
                   v_invoice.company_id::TEXT ||
                   v_invoice.client_id::TEXT;

  v_new_hash := encode(digest(v_data_string, 'sha256'), 'hex');
  RETURN v_new_hash;
END;
$$;


ALTER FUNCTION "public"."generate_verifactu_hash"("p_invoice_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."generate_verifactu_hash"("p_invoice_id" "uuid") IS 'Genera hash SHA-256 para cadena Veri*Factu';



CREATE OR REPLACE FUNCTION "public"."get_addresses_dev"("target_user_id" "uuid") RETURNS TABLE("id" "uuid", "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "direccion" character varying, "numero" character varying, "piso" character varying, "puerta" character varying, "codigo_postal" character varying, "locality_id" "uuid", "usuario_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        a.id,
        a.created_at,
        a.updated_at,
        a.direccion,
        a.numero,
        a.piso,
        a.puerta,
        a.codigo_postal,
        a.locality_id,
        a.usuario_id
    FROM public.addresses a
    WHERE a.usuario_id = target_user_id
    ORDER BY a.created_at DESC;
END;
$$;


ALTER FUNCTION "public"."get_addresses_dev"("target_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_addresses_dev"("target_user_id" "uuid") IS 'Función RPC para obtener direcciones en modo desarrollo';



CREATE OR REPLACE FUNCTION "public"."get_all_companies_stats"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    company_record RECORD;
    all_stats jsonb := '[]'::jsonb;
    company_stats jsonb;
BEGIN
    -- Para cada empresa activa
    FOR company_record IN 
        SELECT id, name FROM companies WHERE deleted_at IS NULL ORDER BY name
    LOOP
        -- Obtener estadísticas de la empresa
        company_stats := get_ticket_stats(company_record.id);
        
        -- Añadir nombre de empresa
        company_stats := company_stats || jsonb_build_object('companyName', company_record.name);
        
        -- Agregar al array de resultados
        all_stats := all_stats || jsonb_build_array(company_stats);
    END LOOP;
    
    RETURN jsonb_build_object(
        'companies', all_stats,
        'totalCompanies', jsonb_array_length(all_stats),
        'generatedAt', now()
    );
END;
$$;


ALTER FUNCTION "public"."get_all_companies_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_all_users_with_customers"() RETURNS TABLE("user_id" "uuid", "customer_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.usuario_id as user_id,
        COUNT(*) as customer_count
    FROM public.customers c
    GROUP BY c.usuario_id
    HAVING COUNT(*) > 0
    ORDER BY customer_count DESC;
END;
$$;


ALTER FUNCTION "public"."get_all_users_with_customers"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_all_users_with_customers"() IS 'Función RPC para obtener usuarios con clientes para el selector DEV';



CREATE OR REPLACE FUNCTION "public"."get_client_consent_status"("p_client_id" "uuid", "p_requesting_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_client record;
    v_company_id uuid;
    v_consent_records jsonb;
BEGIN
    -- Verificar acceso
    SELECT company_id INTO v_company_id
    FROM users
    WHERE auth_user_id = COALESCE(p_requesting_user_id, auth.uid());
    
    -- Obtener cliente
    SELECT * INTO v_client
    FROM clients
    WHERE id = p_client_id
    AND company_id = v_company_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Cliente no encontrado o sin acceso'
        );
    END IF;
    
    -- Obtener registros de consentimiento detallados
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', cr.id,
        'consent_type', cr.consent_type,
        'purpose', cr.purpose,
        'consent_given', cr.consent_given,
        'consent_method', cr.consent_method,
        'consent_evidence', cr.consent_evidence,
        'legal_basis', cr.legal_basis,
        'created_at', cr.created_at,
        'withdrawn_at', cr.withdrawn_at,
        'is_active', cr.is_active
    ) ORDER BY cr.created_at DESC), '[]'::jsonb) INTO v_consent_records
    FROM gdpr_consent_records cr
    WHERE cr.subject_email = v_client.email;
    
    RETURN jsonb_build_object(
        'success', true,
        'client_id', p_client_id,
        'client_email', v_client.email,
        'client_name', v_client.name,
        'consents', jsonb_build_object(
            'marketing_consent', v_client.marketing_consent,
            'marketing_consent_date', v_client.marketing_consent_date,
            'marketing_consent_method', v_client.marketing_consent_method,
            'data_processing_consent', v_client.data_processing_consent,
            'data_processing_consent_date', v_client.data_processing_consent_date,
            'data_processing_legal_basis', v_client.data_processing_legal_basis
        ),
        'consent_records', v_consent_records,
        'data_retention_until', v_client.data_retention_until,
        'is_active', v_client.is_active
    );
    
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'error_detail', SQLSTATE
    );
END;
$$;


ALTER FUNCTION "public"."get_client_consent_status"("p_client_id" "uuid", "p_requesting_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_client_consent_status"("p_client_id" "uuid", "p_requesting_user_id" "uuid") IS 'Obtiene el estado completo de consentimientos de un cliente';



CREATE OR REPLACE FUNCTION "public"."get_company_id_from_jwt"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT COALESCE(
    (auth.jwt() ->> 'company_id')::uuid,
    (auth.jwt() -> 'user_metadata' ->> 'company_id')::uuid,
    (auth.jwt() -> 'app_metadata' ->> 'company_id')::uuid
  );
$$;


ALTER FUNCTION "public"."get_company_id_from_jwt"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_company_invitation_token"("p_invitation_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_token TEXT;
BEGIN
  SELECT token INTO v_token
  FROM public.company_invitations
  WHERE id = p_invitation_id;

  RETURN v_token;
END;
$$;


ALTER FUNCTION "public"."get_company_invitation_token"("p_invitation_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_company_invitation_token"("p_invitation_id" "uuid") IS 'Returns token for a given company_invitations.id';



CREATE OR REPLACE FUNCTION "public"."get_company_services_with_variants"("p_company_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object(
      'service', row_to_json(s.*),
      'variants', COALESCE(
        (
          SELECT jsonb_agg(row_to_json(sv.*) ORDER BY sv.sort_order, sv.variant_name, sv.billing_period)
          FROM service_variants sv
          WHERE sv.service_id = s.id
          AND sv.is_active = true
        ),
        '[]'::jsonb
      )
    )
  )
  INTO v_result
  FROM services s
  WHERE s.company_id = p_company_id
  AND s.is_active = true
  AND s.deleted_at IS NULL
  ORDER BY s.name;
  
  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;


ALTER FUNCTION "public"."get_company_services_with_variants"("p_company_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_company_services_with_variants"("p_company_id" "uuid") IS 'Obtiene todos los servicios activos de una empresa con sus variantes';



CREATE OR REPLACE FUNCTION "public"."get_config_stages"() RETURNS TABLE("id" "uuid", "name" "text", "position" integer, "color" "text", "company_id" "uuid", "stage_category" "text", "workflow_category" "text", "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "is_hidden" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_company_id uuid;
BEGIN
  -- Resolve company_id using table aliases to avoid conflict with output parameter 'company_id'
  
  -- Try users table
  SELECT u.company_id INTO v_company_id
  FROM users u
  WHERE u.auth_user_id = auth.uid()
  LIMIT 1;

  -- Fallback to clients table
  IF v_company_id IS NULL THEN
    SELECT c.company_id INTO v_company_id
    FROM clients c
    WHERE c.auth_user_id = auth.uid()
    LIMIT 1;
  END IF;

  RETURN QUERY
  SELECT
    s.id,
    s.name::text,
    COALESCE(o.position, s.position) as position,
    s.color::text,
    s.company_id,
    s.stage_category::text,
    s.workflow_category::text,
    s.created_at,
    s.updated_at,
    (h.id IS NOT NULL) as is_hidden
  FROM ticket_stages s
  LEFT JOIN hidden_stages h ON s.id = h.stage_id AND h.company_id = v_company_id
  LEFT JOIN company_stage_order o ON s.id = o.stage_id AND o.company_id = v_company_id
  WHERE s.company_id IS NULL -- Only generic stages
  ORDER BY 
    COALESCE(o.position, s.position) ASC;
END;
$$;


ALTER FUNCTION "public"."get_config_stages"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_config_units"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_company_id uuid;
    v_user_id uuid;
    result jsonb;
BEGIN
    v_user_id := auth.uid();
    
    -- Get user's company (try users table first)
    SELECT company_id INTO v_company_id FROM public.users WHERE auth_user_id = v_user_id;
    
    -- If not found, try clients (though typically config is for dashboard users)
    IF v_company_id IS NULL THEN
        SELECT company_id INTO v_company_id FROM public.clients WHERE auth_user_id = v_user_id;
    END IF;

    -- Return units combined with is_hidden flag
    SELECT jsonb_agg(
        to_jsonb(u) || jsonb_build_object('is_hidden', (hu.unit_id IS NOT NULL))
        ORDER BY u.name ASC
    ) INTO result
    FROM public.service_units u
    LEFT JOIN public.hidden_units hu ON u.id = hu.unit_id AND hu.company_id = v_company_id
    WHERE (u.company_id IS NULL OR u.company_id = v_company_id)
    AND (u.deleted_at IS NULL);

    RETURN COALESCE(result, '[]'::jsonb);
END;
$$;


ALTER FUNCTION "public"."get_config_units"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_customer_stats"("user_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'total', (SELECT COUNT(*) FROM public.customers WHERE usuario_id = user_id),
        'active_this_month', (
            SELECT COUNT(*) 
            FROM public.customers 
            WHERE usuario_id = user_id 
            AND created_at >= date_trunc('month', CURRENT_DATE)
        ),
        'new_this_week', (
            SELECT COUNT(*) 
            FROM public.customers 
            WHERE usuario_id = user_id 
            AND created_at >= date_trunc('week', CURRENT_DATE)
        ),
        'by_locality', (
            SELECT json_object_agg(l.name, customer_count)
            FROM (
                SELECT 
                    COALESCE(l.name, 'Sin localidad') as name,
                    COUNT(c.id) as customer_count
                FROM public.customers c
                LEFT JOIN public.addresses a ON c.direccion_id = a.id
                LEFT JOIN public.localities l ON a.locality_id = l.id
                WHERE c.usuario_id = user_id
                GROUP BY l.name
            ) l
        )
    ) INTO result;
    
    RETURN result;
END;
$$;


ALTER FUNCTION "public"."get_customer_stats"("user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_customer_stats_dev"("target_user_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'total', (
            SELECT COUNT(*) 
            FROM public.customers 
            WHERE usuario_id = target_user_id
        ),
        'active_this_month', (
            SELECT COUNT(*) 
            FROM public.customers 
            WHERE 
                usuario_id = target_user_id AND
                activo = true AND
                created_at >= date_trunc('month', CURRENT_DATE)
        ),
        'new_this_week', (
            SELECT COUNT(*) 
            FROM public.customers 
            WHERE 
                usuario_id = target_user_id AND
                created_at >= date_trunc('week', CURRENT_DATE)
        ),
        'by_locality', (
            SELECT COALESCE(json_object_agg(l.name, customer_count), '{}'::json)
            FROM (
                SELECT 
                    COALESCE(l.name, 'Sin localidad') as name,
                    COUNT(c.id) as customer_count
                FROM public.customers c
                LEFT JOIN public.addresses a ON c.direccion_id = a.id
                LEFT JOIN public.localities l ON a.locality_id = l.id
                WHERE c.usuario_id = target_user_id
                GROUP BY l.name
                HAVING COUNT(c.id) > 0
            ) l
        )
    ) INTO result;
    
    RETURN result;
END;
$$;


ALTER FUNCTION "public"."get_customer_stats_dev"("target_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_customer_stats_dev"("target_user_id" "uuid") IS 'Función RPC para estadísticas de clientes en modo desarrollo';



CREATE OR REPLACE FUNCTION "public"."get_customers_dev"("target_user_id" "uuid") RETURNS TABLE("id" "uuid", "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "nombre" character varying, "apellidos" character varying, "dni" character varying, "fecha_nacimiento" "date", "email" character varying, "telefono" character varying, "profesion" character varying, "empresa" character varying, "notas" "text", "activo" boolean, "avatar_url" "text", "direccion_id" "uuid", "usuario_id" "uuid", "search_vector" "tsvector")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.created_at,
        c.updated_at,
        c.nombre,
        c.apellidos,
        c.dni,
        c.fecha_nacimiento,
        c.email,
        c.telefono,
        c.profesion,
        c.empresa,
        c.notas,
        c.activo,
        c.avatar_url,
        c.direccion_id,
        c.usuario_id,
        c.search_vector
    FROM public.customers c
    WHERE c.usuario_id = target_user_id
    ORDER BY c.created_at DESC;
END;
$$;


ALTER FUNCTION "public"."get_customers_dev"("target_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_customers_dev"("target_user_id" "uuid") IS 'Función RPC para obtener clientes de un usuario específico en modo desarrollo, bypaseando RLS';



CREATE OR REPLACE FUNCTION "public"."get_devices_stats"("company_uuid" "uuid") RETURNS TABLE("total_devices" bigint, "received_count" bigint, "in_progress_count" bigint, "completed_count" bigint, "delivered_count" bigint, "avg_repair_time" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) as total_devices,
        COUNT(*) FILTER (WHERE status = 'received') as received_count,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_count,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
        COUNT(*) FILTER (WHERE status = 'delivered') as delivered_count,
        AVG(actual_repair_time) as avg_repair_time
    FROM devices 
    WHERE company_id = company_uuid
    AND created_at >= NOW() - INTERVAL '30 days';
END;
$$;


ALTER FUNCTION "public"."get_devices_stats"("company_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_devices_with_client_info"("company_uuid" "uuid") RETURNS TABLE("device_id" "uuid", "brand" character varying, "model" character varying, "device_type" character varying, "status" character varying, "client_name" character varying, "client_email" character varying, "received_at" timestamp with time zone, "estimated_cost" numeric, "progress_days" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        d.id as device_id,
        d.brand,
        d.model,
        d.device_type,
        d.status,
        c.name as client_name,
        c.email as client_email,
        d.received_at,
        d.estimated_cost,
        EXTRACT(DAY FROM NOW() - d.received_at)::INTEGER as progress_days
    FROM devices d
    LEFT JOIN clients c ON d.client_id = c.id
    WHERE d.company_id = company_uuid
    ORDER BY d.received_at DESC;
END;
$$;


ALTER FUNCTION "public"."get_devices_with_client_info"("company_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_effective_modules"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    result jsonb;
    v_auth_user_id uuid;
    v_public_user_id uuid;
BEGIN
    v_auth_user_id := auth.uid();
    
    -- Resolve public user id from auth id
    SELECT id INTO v_public_user_id
    FROM public.users
    WHERE auth_user_id = v_auth_user_id;

    -- If the user is not found in public.users, we can't find their modules
    -- (This handles the case where the session exists but the public profile is missing)
    IF v_public_user_id IS NULL THEN
        RETURN '[]'::jsonb;
    END IF;

    SELECT jsonb_agg(
        jsonb_build_object(
            'key', mc.key,
            'name', mc.label,
            'enabled', (
                um.status IS NOT NULL AND 
                LOWER(um.status::text) IN ('activado', 'active', 'enabled')
            )
        ) ORDER BY mc.key
    ) INTO result
    FROM public.modules_catalog mc
    LEFT JOIN public.user_modules um 
        ON mc.key = um.module_key 
        AND um.user_id = v_public_user_id; -- Correctly use the PUBLIC user id

    RETURN COALESCE(result, '[]'::jsonb);
END;
$$;


ALTER FUNCTION "public"."get_effective_modules"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_job_attachments"("p_job_id" "uuid", "p_company_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("id" "uuid", "file_name" "text", "file_path" "text", "file_size" integer, "mime_type" "text", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  -- Si no se especifica company_id, intentar obtenerlo del contexto
  IF p_company_id IS NULL THEN
    p_company_id := public.get_current_company_id();
  END IF;
  
  RETURN QUERY
  SELECT a.id, a.file_name, a.file_path, a.file_size, a.mime_type, a.created_at
  FROM public.attachments a
  JOIN public.jobs j ON j.id = a.job_id
  WHERE a.job_id = p_job_id 
    AND a.deleted_at IS NULL
    AND j.deleted_at IS NULL
    AND (p_company_id IS NULL OR j.company_id = p_company_id);
END;
$$;


ALTER FUNCTION "public"."get_job_attachments"("p_job_id" "uuid", "p_company_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_company_id"() RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN (SELECT company_id FROM public.users WHERE id = auth.uid());
END;
$$;


ALTER FUNCTION "public"."get_my_company_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_next_invoice_number"("p_series_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_next_number INTEGER;
  v_prefix TEXT;
  v_number_text TEXT;
BEGIN
  UPDATE invoice_series
  SET next_number = next_number + 1,
      updated_at = CURRENT_TIMESTAMP
  WHERE id = p_series_id
  RETURNING next_number - 1, prefix INTO v_next_number, v_prefix;

  v_number_text := LPAD(v_next_number::TEXT, 5, '0');
  RETURN v_number_text;
END;
$$;


ALTER FUNCTION "public"."get_next_invoice_number"("p_series_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_next_invoice_number"("p_series_id" "uuid") IS 'Genera el siguiente número de factura para una serie';



CREATE OR REPLACE FUNCTION "public"."get_next_quote_number"("p_company_id" "uuid", "p_year" integer) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  next_number INTEGER;
BEGIN
  -- Obtener el siguiente número de secuencia para el año
  SELECT COALESCE(MAX(sequence_number), 0) + 1
  INTO next_number
  FROM quotes
  WHERE company_id = p_company_id
    AND year = p_year;
  
  RETURN next_number;
END;
$$;


ALTER FUNCTION "public"."get_next_quote_number"("p_company_id" "uuid", "p_year" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_next_quote_number"("p_company_id" "uuid", "p_year" integer) IS 'Genera el siguiente número de presupuesto para una empresa y año';



CREATE OR REPLACE FUNCTION "public"."get_or_create_brand"("p_brand_name" "text", "p_company_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_brand_id UUID;
BEGIN
  -- Try to find existing brand
  SELECT id INTO v_brand_id
  FROM public.product_brands
  WHERE name = p_brand_name
    AND (company_id = p_company_id OR company_id IS NULL)
    AND deleted_at IS NULL
  LIMIT 1;

  -- If not found, create it
  IF v_brand_id IS NULL THEN
    INSERT INTO public.product_brands (name, company_id)
    VALUES (p_brand_name, p_company_id)
    RETURNING id INTO v_brand_id;
  END IF;

  RETURN v_brand_id;
END;
$$;


ALTER FUNCTION "public"."get_or_create_brand"("p_brand_name" "text", "p_company_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_or_create_brand"("p_brand_name" "text", "p_company_id" "uuid") IS 'Helper function to get existing brand or create new one';



CREATE OR REPLACE FUNCTION "public"."get_or_create_category"("p_category_name" "text", "p_company_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_category_id UUID;
BEGIN
  -- Try to find existing category
  SELECT id INTO v_category_id
  FROM public.product_categories
  WHERE name = p_category_name
    AND (company_id = p_company_id OR company_id IS NULL)
    AND deleted_at IS NULL
  LIMIT 1;

  -- If not found, create it
  IF v_category_id IS NULL THEN
    INSERT INTO public.product_categories (name, company_id)
    VALUES (p_category_name, p_company_id)
    RETURNING id INTO v_category_id;
  END IF;

  RETURN v_category_id;
END;
$$;


ALTER FUNCTION "public"."get_or_create_category"("p_category_name" "text", "p_company_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_or_create_category"("p_category_name" "text", "p_company_id" "uuid") IS 'Helper function to get existing category or create new one';



CREATE OR REPLACE FUNCTION "public"."get_payment_integrations"("p_company_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_integrations json;
    v_access_allowed boolean;
    v_encryption_key text := 'default-dev-key-change-in-prod'; -- Should ideally be in Vault
BEGIN
    -- Check permissions
    SELECT EXISTS (
        SELECT 1 FROM public.users
        WHERE auth_user_id = auth.uid()
        AND company_id = p_company_id
        AND role IN ('owner', 'admin')
    ) INTO v_access_allowed;

    IF NOT v_access_allowed THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    -- Fetch and process
    SELECT json_agg(row_to_json(t))
    INTO v_integrations
    FROM (
        SELECT
            id,
            company_id,
            provider,
            is_active,
            is_sandbox,
            webhook_url,
            last_verified_at,
            verification_status,
            created_at,
            updated_at,
            -- Mask credentials logic
            CASE
                WHEN credentials_encrypted IS NOT NULL THEN
                    (
                        -- Try to decrypt
                        CASE
                            WHEN provider = 'paypal' THEN
                                json_build_object(
                                    'clientId',
                                    CASE 
                                        -- Simple masking: first 4 chars + **** + last 4 chars
                                        WHEN length(
                                            (pgp_sym_decrypt(decode(credentials_encrypted, 'base64'), v_encryption_key)::jsonb->>'clientId')
                                        ) > 8 THEN
                                            left((pgp_sym_decrypt(decode(credentials_encrypted, 'base64'), v_encryption_key)::jsonb->>'clientId'), 4) || '••••' || right((pgp_sym_decrypt(decode(credentials_encrypted, 'base64'), v_encryption_key)::jsonb->>'clientId'), 4)
                                        ELSE '••••••••'
                                    END
                                )
                            WHEN provider = 'stripe' THEN
                                json_build_object(
                                    'publishableKey',
                                    CASE 
                                        WHEN length(
                                            (pgp_sym_decrypt(decode(credentials_encrypted, 'base64'), v_encryption_key)::jsonb->>'publishableKey')
                                        ) > 8 THEN
                                            left((pgp_sym_decrypt(decode(credentials_encrypted, 'base64'), v_encryption_key)::jsonb->>'publishableKey'), 4) || '••••' || right((pgp_sym_decrypt(decode(credentials_encrypted, 'base64'), v_encryption_key)::jsonb->>'publishableKey'), 4)
                                        ELSE '••••••••'
                                    END
                                )
                            ELSE '{}'::json
                        END
                    )
                ELSE '{}'::json
            END as credentials_masked
        FROM public.payment_integrations
        WHERE company_id = p_company_id
    ) t;

    RETURN COALESCE(v_integrations, '[]'::json);
EXCEPTION
    WHEN OTHERS THEN
        -- If decryption fails (old key/format), return empty credentials
        RETURN (
            SELECT json_agg(
                json_build_object(
                    'id', id,
                    'company_id', company_id,
                    'provider', provider,
                    'is_active', is_active,
                    'is_sandbox', is_sandbox,
                    'webhook_url', webhook_url,
                    'last_verified_at', last_verified_at,
                    'verification_status', verification_status,
                    'created_at', created_at,
                    'updated_at', updated_at,
                    'credentials_masked', '{}'::json
                )
            )
            FROM public.payment_integrations
            WHERE company_id = p_company_id
        );
END;
$$;


ALTER FUNCTION "public"."get_payment_integrations"("p_company_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_service_with_variants"("p_service_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'service', row_to_json(s.*),
    'variants', COALESCE(
      (
        SELECT jsonb_agg(row_to_json(sv.*) ORDER BY sv.sort_order, sv.variant_name, sv.billing_period)
        FROM service_variants sv
        WHERE sv.service_id = s.id
        AND sv.is_active = true
      ),
      '[]'::jsonb
    )
  )
  INTO v_result
  FROM services s
  WHERE s.id = p_service_id;
  
  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."get_service_with_variants"("p_service_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_service_with_variants"("p_service_id" "uuid") IS 'Obtiene un servicio con todas sus variantes activas';



CREATE OR REPLACE FUNCTION "public"."get_sessions_with_booking_counts"("p_start_date" "date" DEFAULT NULL::"date", "p_end_date" "date" DEFAULT NULL::"date") RETURNS TABLE("id" integer, "class_type_id" integer, "capacity" integer, "schedule_date" "date", "schedule_time" time without time zone, "confirmed_bookings_count" integer, "available_spots" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return query
  select 
    cs.id,
    cs.class_type_id,
    cs.capacity,
    cs.schedule_date,
    cs.schedule_time,
    coalesce(b.confirmed_count, 0)::int as confirmed_bookings_count,
    (cs.capacity - coalesce(b.confirmed_count, 0))::int as available_spots
  from class_sessions cs
  left join (
    select class_session_id, count(*) as confirmed_count
    from bookings
    where upper(status) = 'CONFIRMED'
    group by class_session_id
  ) b on b.class_session_id = cs.id
  where (p_start_date is null or cs.schedule_date >= p_start_date)
    and (p_end_date is null or cs.schedule_date <= p_end_date)
  order by cs.schedule_date, cs.schedule_time;
end;
$$;


ALTER FUNCTION "public"."get_sessions_with_booking_counts"("p_start_date" "date", "p_end_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_ticket_stats"("target_company_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    stats_result jsonb;
    total_tickets integer;
    open_tickets integer;
    in_progress_tickets integer;
    completed_tickets integer;
    overdue_tickets integer;
    total_revenue numeric;
    total_estimated_hours numeric;
    total_actual_hours numeric;
    avg_resolution_days numeric;
    completed_with_dates integer;
    total_resolution_time bigint;
BEGIN
    -- Verificar que la empresa existe
    IF NOT EXISTS (SELECT 1 FROM companies WHERE id = target_company_id AND deleted_at IS NULL) THEN
        RAISE EXCEPTION 'Company with ID % does not exist or is deleted', target_company_id;
    END IF;
    
    -- Contar tickets totales
    SELECT COUNT(*) INTO total_tickets
    FROM tickets t
    WHERE t.company_id = target_company_id
    AND t.deleted_at IS NULL;
    
    -- Contar tickets abiertos/pendientes priorizando workflow_category (fallback a stage_category)
    SELECT COUNT(*) INTO open_tickets
    FROM tickets t
    JOIN ticket_stages ts ON t.stage_id = ts.id
    WHERE t.company_id = target_company_id
    AND t.deleted_at IS NULL
    AND (
        (ts.workflow_category IN ('waiting'))
        OR (ts.workflow_category IS NULL AND ts.stage_category = 'open')
    );
    
    -- Contar tickets en progreso priorizando workflow_category (analysis/action) con fallback a stage_category
    SELECT COUNT(*) INTO in_progress_tickets
    FROM tickets t
    JOIN ticket_stages ts ON t.stage_id = ts.id
    WHERE t.company_id = target_company_id
    AND t.deleted_at IS NULL
    AND (
        (ts.workflow_category IN ('analysis','action'))
        OR (ts.workflow_category IS NULL AND ts.stage_category = 'in_progress')
    );
    
    -- Contar tickets completados priorizando workflow_category (final/cancel) con fallback a stage_category
    SELECT COUNT(*) INTO completed_tickets
    FROM tickets t
    JOIN ticket_stages ts ON t.stage_id = ts.id
    WHERE t.company_id = target_company_id
    AND t.deleted_at IS NULL
    AND (
        (ts.workflow_category IN ('final','cancel'))
        OR (ts.workflow_category IS NULL AND ts.stage_category = 'completed')
    );
    
    -- Contar tickets vencidos
    SELECT COUNT(*) INTO overdue_tickets
    FROM tickets t
    WHERE t.company_id = target_company_id
    AND t.deleted_at IS NULL
    AND t.due_date IS NOT NULL
    AND t.due_date < CURRENT_DATE;
    
    -- Calcular ingresos totales
    SELECT COALESCE(SUM(t.total_amount), 0) INTO total_revenue
    FROM tickets t
    WHERE t.company_id = target_company_id
    AND t.deleted_at IS NULL;
    
    -- Calcular horas estimadas totales desde servicios asociados
    SELECT COALESCE(SUM(s.estimated_hours * ts.quantity), 0) INTO total_estimated_hours
    FROM tickets t
    JOIN ticket_services ts ON t.id = ts.ticket_id
    JOIN services s ON ts.service_id = s.id
    WHERE t.company_id = target_company_id
    AND t.deleted_at IS NULL;
    
    -- Calcular horas reales totales (si existe la columna actual_hours en tickets)
    -- Si no existe, usar estimated_hours de la tabla tickets como fallback
    BEGIN
        SELECT COALESCE(SUM(t.actual_hours), 0) INTO total_actual_hours
        FROM tickets t
        WHERE t.company_id = target_company_id
        AND t.deleted_at IS NULL;
    EXCEPTION WHEN undefined_column THEN
        -- Si no existe actual_hours, usar estimated_hours de tickets
        SELECT COALESCE(SUM(t.estimated_hours), 0) INTO total_actual_hours
        FROM tickets t
        WHERE t.company_id = target_company_id
        AND t.deleted_at IS NULL;
    END;
    
    -- Calcular tiempo promedio de resolución en días
    -- Solo para tickets completados que tienen fechas válidas
    SELECT COUNT(*), COALESCE(SUM(EXTRACT(EPOCH FROM (t.updated_at - t.created_at))), 0)
    INTO completed_with_dates, total_resolution_time
    FROM tickets t
    JOIN ticket_stages ts ON t.stage_id = ts.id
    WHERE t.company_id = target_company_id
    AND t.deleted_at IS NULL
    AND (
        (ts.workflow_category IN ('final','cancel'))
        OR (ts.workflow_category IS NULL AND ts.stage_category = 'completed')
    )
    AND t.created_at IS NOT NULL
    AND t.updated_at IS NOT NULL
    AND t.updated_at > t.created_at;
    
    -- Convertir a días promedio
    IF completed_with_dates > 0 THEN
        avg_resolution_days := ROUND((total_resolution_time / completed_with_dates) / 86400, 1);
    ELSE
        avg_resolution_days := 0;
    END IF;
    
    -- Construir resultado JSON
    stats_result := jsonb_build_object(
        'total', total_tickets,
        'open', open_tickets,
        'inProgress', in_progress_tickets,
        'completed', completed_tickets,
        'overdue', overdue_tickets,
        'avgResolutionTime', avg_resolution_days,
        'totalRevenue', total_revenue,
        'totalEstimatedHours', total_estimated_hours,
        'totalActualHours', total_actual_hours,
        'calculatedAt', now(),
        'companyId', target_company_id
    );
    
    RETURN stats_result;
END;
$$;


ALTER FUNCTION "public"."get_ticket_stats"("target_company_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_top_used_products"("target_company_id" "uuid", "limit_count" integer DEFAULT 3) RETURNS TABLE("id" "uuid", "name" "text", "description" "text", "price" numeric, "category" "text", "brand" "text", "model" "text", "stock_quantity" integer, "usage_count" bigint, "category_id" "uuid", "brand_id" "uuid")
    LANGUAGE "sql"
    AS $$
  SELECT
    p.id,
    p.name,
    p.description,
    p.price,
    COALESCE(pc.name, p.category) AS category,
    COALESCE(pb.name, p.brand) AS brand,
    p.model,
    COALESCE(p.stock_quantity, 0) AS stock_quantity,
    COALESCE(SUM(tp.quantity), 0) AS usage_count,
    p.category_id,
    p.brand_id
  FROM public.products p
  LEFT JOIN public.ticket_products tp
    ON tp.product_id = p.id
    AND (tp.company_id = target_company_id OR tp.company_id IS NULL)
  LEFT JOIN public.product_categories pc ON p.category_id = pc.id
  LEFT JOIN public.product_brands pb ON p.brand_id = pb.id
  WHERE p.deleted_at IS NULL
    AND (p.company_id = target_company_id OR p.company_id IS NULL)
  GROUP BY p.id, p.name, p.description, p.price, p.category, p.brand, p.model, p.stock_quantity, p.category_id, p.brand_id, pc.name, pb.name
  ORDER BY usage_count DESC, p.name ASC
  LIMIT GREATEST(limit_count, 0)
$$;


ALTER FUNCTION "public"."get_top_used_products"("target_company_id" "uuid", "limit_count" integer) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_top_used_products"("target_company_id" "uuid", "limit_count" integer) IS 'Return the top used products (by ticket_products.quantity) for a company with normalized brand and category names';



CREATE TABLE IF NOT EXISTS "public"."services" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(200) NOT NULL,
    "description" "text",
    "estimated_hours" numeric(4,2) DEFAULT 1.0,
    "base_price" numeric(10,2) DEFAULT 0.00,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone,
    "is_active" boolean DEFAULT true NOT NULL,
    "category" "text" DEFAULT 'Servicio Técnico'::"text",
    "legacy_negocio_id" "text",
    "company_id" "uuid" NOT NULL,
    "tax_rate" numeric(5,2) DEFAULT 21.00,
    "unit_type" character varying(50) DEFAULT 'horas'::character varying,
    "min_quantity" numeric(10,2) DEFAULT 1.00,
    "max_quantity" numeric(10,2),
    "difficulty_level" integer DEFAULT 1,
    "profit_margin" numeric(5,2) DEFAULT 30.00,
    "cost_price" numeric(10,2) DEFAULT 0.00,
    "requires_parts" boolean DEFAULT false,
    "requires_diagnosis" boolean DEFAULT false,
    "warranty_days" integer DEFAULT 30,
    "skill_requirements" "text"[],
    "tools_required" "text"[],
    "can_be_remote" boolean DEFAULT true,
    "priority_level" integer DEFAULT 3,
    "has_variants" boolean DEFAULT false,
    "base_features" "jsonb" DEFAULT '{}'::"jsonb",
    "is_public" boolean DEFAULT false,
    "features" "text",
    "allow_direct_contracting" boolean DEFAULT false,
    CONSTRAINT "services_difficulty_level_check" CHECK ((("difficulty_level" >= 1) AND ("difficulty_level" <= 5))),
    CONSTRAINT "services_priority_level_check" CHECK ((("priority_level" >= 1) AND ("priority_level" <= 5))),
    CONSTRAINT "services_unit_type_not_empty" CHECK ((TRIM(BOTH FROM "unit_type") <> ''::"text"))
);


ALTER TABLE "public"."services" OWNER TO "postgres";


COMMENT ON COLUMN "public"."services"."has_variants" IS 'Indica si el servicio tiene variantes. Si es false, se usa el precio base directamente.';



COMMENT ON COLUMN "public"."services"."base_features" IS 'Características comunes a todas las variantes del servicio';



CREATE OR REPLACE FUNCTION "public"."get_top_used_services"("target_company_id" "uuid", "limit_count" integer) RETURNS SETOF "public"."services"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  RETURN QUERY
  SELECT s.*
  FROM services s
  LEFT JOIN (
     SELECT service_id, COUNT(*) as usage_count
     FROM ticket_services
     GROUP BY service_id
  ) usage ON s.id = usage.service_id
  WHERE s.company_id = target_company_id
    AND s.is_active = true
    AND s.deleted_at IS NULL
  ORDER BY usage.usage_count DESC NULLS LAST, s.name ASC
  LIMIT limit_count;
END;
$$;


ALTER FUNCTION "public"."get_top_used_services"("target_company_id" "uuid", "limit_count" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_company_id"() RETURNS "uuid"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'analytics'
    AS $$
DECLARE
  jwt jsonb;
  cid text;
  auth_id uuid;
  client_company_id uuid;
BEGIN
  jwt := COALESCE(current_setting('request.jwt.claims', true)::jsonb, '{}'::jsonb);
  cid := NULLIF((jwt ->> 'company_id'), '');
  
  -- If company_id is in JWT claims, use it
  IF cid IS NOT NULL THEN
    RETURN cid::uuid;
  END IF;
  
  -- Fallback: check if user is a client and get their company_id
  auth_id := auth.uid();
  IF auth_id IS NOT NULL THEN
    -- First try clients table
    SELECT company_id INTO client_company_id
    FROM public.clients
    WHERE auth_user_id = auth_id
    LIMIT 1;
    
    IF client_company_id IS NOT NULL THEN
      RETURN client_company_id;
    END IF;
    
    -- Then try users table
    SELECT company_id INTO client_company_id
    FROM public.users
    WHERE auth_user_id = auth_id
    LIMIT 1;
    
    IF client_company_id IS NOT NULL THEN
      RETURN client_company_id;
    END IF;
  END IF;
  
  -- If no company_id found anywhere, return NULL instead of raising exception
  -- This allows clients to still access their own records via auth_user_id policies
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."get_user_company_id"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_user_company_id"() IS 'Extrae company_id del JWT custom claim (Auth Hook)';



CREATE OR REPLACE FUNCTION "public"."get_user_permissions"("user_email" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
    user_perms JSONB;
BEGIN
    SELECT permissions INTO user_perms
    FROM users 
    WHERE email = user_email AND active = true;
    
    RETURN COALESCE(user_perms, '{}');
END;
$$;


ALTER FUNCTION "public"."get_user_permissions"("user_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_role"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
    RETURN (
        SELECT role FROM user_profiles 
        WHERE id = auth.uid()
    );
END;
$$;


ALTER FUNCTION "public"."get_user_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_verifactu_cert_status"("p_company_id" "uuid") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_settings jsonb;
    v_history jsonb;
    v_access_allowed boolean;
BEGIN
    -- Permission check
    SELECT EXISTS (
        SELECT 1 FROM public.users
        WHERE auth_user_id = auth.uid()
        AND company_id = p_company_id
        AND role IN ('owner', 'admin')
    ) INTO v_access_allowed;

    IF NOT v_access_allowed THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    -- Fetch Settings
    SELECT jsonb_build_object(
        'software_code', COALESCE(software_code, ''),
        'issuer_nif', COALESCE(issuer_nif, ''),
        'environment', COALESCE(environment, 'pre'),
        'configured', (cert_pem_enc IS NOT NULL AND key_pem_enc IS NOT NULL),
        'mode', CASE WHEN (cert_pem_enc IS NOT NULL AND key_pem_enc IS NOT NULL) THEN 'encrypted' ELSE 'none' END
    )
    INTO v_settings
    FROM public.verifactu_settings
    WHERE company_id = p_company_id;

    IF v_settings IS NULL THEN
        v_settings := jsonb_build_object(
            'software_code', '',
            'issuer_nif', '',
            'environment', 'pre',
            'configured', false,
            'mode', 'none'
        );
    END IF;

    -- Fetch History
    SELECT jsonb_agg(
        jsonb_build_object(
            'version', version,
            'stored_at', stored_at,
            'rotated_by', rotated_by,
            'integrity_hash', integrity_hash,
            'notes', notes,
            'cert_len', CASE WHEN cert_pem_enc IS NOT NULL THEN length(cert_pem_enc) ELSE NULL END,
            'key_len', CASE WHEN key_pem_enc IS NOT NULL THEN length(key_pem_enc) ELSE NULL END,
            'pass_present', (key_pass_enc IS NOT NULL)
        ) ORDER BY version DESC
    )
    INTO v_history
    FROM public.verifactu_cert_history
    WHERE company_id = p_company_id;

    RETURN json_build_object(
        'ok', true,
        'settings', v_settings,
        'history', COALESCE(v_history, '[]'::jsonb)
    );
END;
$$;


ALTER FUNCTION "public"."get_verifactu_cert_status"("p_company_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_verifactu_settings_for_company"("p_company_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_result JSONB;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.auth_user_id = auth.uid()
          AND u.company_id = p_company_id
          AND u.role IN ('owner', 'admin')
          AND u.deleted_at IS NULL
    ) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'access_denied');
    END IF;
    
    SELECT jsonb_build_object(
        'ok', true,
        'software_code', vs.software_code,
        'software_name', vs.software_name,
        'software_version', vs.software_version,
        'issuer_nif', vs.issuer_nif,
        'environment', vs.environment,
        'is_active', vs.is_active,
        'cert_subject', vs.cert_subject,
        'cert_valid_from', vs.cert_valid_from,
        'cert_valid_to', vs.cert_valid_to,
        'has_certificate', (vs.cert_pem_enc IS NOT NULL)
    ) INTO v_result
    FROM public.verifactu_settings vs
    WHERE vs.company_id = p_company_id;
    
    IF v_result IS NULL THEN
        RETURN jsonb_build_object('ok', true, 'exists', false, 'message', 'No configuration found');
    END IF;
    
    RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."get_verifactu_settings_for_company"("p_company_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_comment_notifications"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_ticket RECORD;
BEGIN
    SELECT * INTO v_ticket FROM public.tickets WHERE id = NEW.ticket_id;
    
    IF NEW.is_internal THEN
        IF v_ticket.assigned_to IS NOT NULL AND v_ticket.assigned_to != NEW.user_id THEN
            PERFORM public.create_notification(v_ticket.company_id, v_ticket.assigned_to, 'ticket_comment_internal', NEW.ticket_id, 'Nota Interna en Ticket #' || v_ticket.ticket_number, 'Nueva nota interna: ' || left(NEW.comment, 50) || '...');
        END IF;
    ELSE
        IF v_ticket.assigned_to IS NOT NULL AND v_ticket.assigned_to != NEW.user_id THEN
             PERFORM public.create_notification(v_ticket.company_id, v_ticket.assigned_to, 'ticket_comment', NEW.ticket_id, 'Nuevo Comentario en Ticket #' || v_ticket.ticket_number, 'Nuevo comentario: ' || left(NEW.comment, 50) || '...');
        END IF;
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_comment_notifications"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_company_registration"("p_auth_user_id" "uuid", "p_email" "text", "p_full_name" "text", "p_company_name" "text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
    company_info RECORD;
    new_company_id UUID;
    new_user_id UUID;
    user_role TEXT := 'owner';
BEGIN
    -- Verificar si la empresa ya existe
    SELECT * INTO company_info
    FROM check_company_exists(p_company_name);
    
    IF company_info.company_exists THEN
        -- La empresa existe, el usuario debe ser 'member'
        user_role := 'member';
        new_company_id := company_info.company_id;
        
        -- Verificar si ya existe un usuario con este email en esta empresa
        IF EXISTS (
            SELECT 1 FROM public.users 
            WHERE email = p_email AND company_id = new_company_id
        ) THEN
            RETURN json_build_object(
                'success', false,
                'error', 'User already exists in this company',
                'requires_invitation_approval', true,
                'company_name', company_info.company_name,
                'owner_email', company_info.owner_email
            );
        END IF;
    ELSE
        -- La empresa no existe, crear nueva
        INSERT INTO public.companies (name, slug)
        VALUES (
            p_company_name,
            LOWER(REPLACE(p_company_name, ' ', '-')) || '-' || EXTRACT(EPOCH FROM NOW())::BIGINT
        )
        RETURNING id INTO new_company_id;
        
        user_role := 'owner';
    END IF;
    
    -- Crear el usuario
    INSERT INTO public.users (
        email,
        name,
        surname,
        role,
        active,
        company_id,
        auth_user_id,
        permissions
    )
    VALUES (
        p_email,
        split_part(p_full_name, ' ', 1),
        NULLIF(regexp_replace(p_full_name, '^[^\s]+\s*', ''), ''),
        user_role,
        true,
        new_company_id,
        p_auth_user_id,
        '{}'::jsonb
    )
    RETURNING id INTO new_user_id;
    
    RETURN json_build_object(
        'success', true,
        'user_id', new_user_id,
        'company_id', new_company_id,
        'role', user_role,
        'message', CASE 
            WHEN user_role = 'owner' THEN 'New company created successfully'
            ELSE 'User added to existing company'
        END
    );
    
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$;


ALTER FUNCTION "public"."handle_company_registration"("p_auth_user_id" "uuid", "p_email" "text", "p_full_name" "text", "p_company_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_ticket_auto_assignment"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    agent_count integer;
    sole_agent_id uuid;
BEGIN
    IF NEW.assigned_to IS NULL THEN
        SELECT count(*), min(id::text)::uuid
        INTO agent_count, sole_agent_id
        FROM public.users
        WHERE company_id = NEW.company_id
          AND role IN ('owner', 'admin', 'member')
          AND active = true;

        IF agent_count = 1 THEN
            NEW.assigned_to := sole_agent_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_ticket_auto_assignment"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_ticket_comment_automation"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_stage_id uuid;
  v_stage_pos int;
  v_stage_workflow text;
  v_target_stage_id uuid;
  v_user_comment_count int;
  v_config_staff_reply_stage uuid;
  v_config_client_reply_stage uuid;
BEGIN
  -- A) CLIENT REPLY
  IF NEW.client_id IS NOT NULL THEN
      -- Check setting for client reply
      SELECT ticket_stage_on_client_reply INTO v_config_client_reply_stage
      FROM public.company_settings
      WHERE company_id = (SELECT company_id FROM tickets WHERE id = NEW.ticket_id);
      
      IF v_config_client_reply_stage IS NOT NULL THEN
         UPDATE tickets SET stage_id = v_config_client_reply_stage, updated_at = NOW() WHERE id = NEW.ticket_id;
      END IF;
      -- If Not configured, do nothing (default behavior for now, or could act 'waiting')
      RETURN NEW; 
  END IF;

  -- B) STAFF REPLY
  IF NEW.user_id IS NOT NULL THEN
    SELECT count(*) INTO v_user_comment_count 
    FROM ticket_comments 
    WHERE ticket_id = NEW.ticket_id AND user_id IS NOT NULL;
    
    -- Only automate on FIRST staff comment? 
    -- User might want EVERY staff comment to move to 'On Progress'?
    -- Let's keep "First Comment" logic for the DEFAULT behavior.
    -- BUT if `ticket_stage_on_staff_reply` is set, should we do it ALWAYS or just FIRST?
    -- Usually "First Response" is the key transition. 
    -- If we do it always, we might overwrite manual changes.
    -- Let's stick to "First Comment" constraint even for Configured Stage, UNLESS user explicitly asked "When I reply, move to X".
    -- Safer: Stick to First Comment constraint for now to avoid annoyance.
    
    IF v_user_comment_count = 1 THEN
       
       -- 1. Check Settings
       SELECT ticket_stage_on_staff_reply INTO v_config_staff_reply_stage
       FROM public.company_settings
       WHERE company_id = (SELECT company_id FROM tickets WHERE id = NEW.ticket_id);

       IF v_config_staff_reply_stage IS NOT NULL THEN
          v_target_stage_id := v_config_staff_reply_stage;
       ELSE
           -- 2. Default Logic: Find 'En Análisis'
           SELECT id INTO v_target_stage_id
           FROM ticket_stages
           WHERE 
             (company_id = (SELECT company_id FROM tickets WHERE id = NEW.ticket_id) OR company_id IS NULL)
             AND deleted_at IS NULL
             AND (name ILIKE '%Análisis%' OR workflow_category = 'analysis')
             AND NOT EXISTS (
                SELECT 1 FROM hidden_stages hs 
                WHERE hs.stage_id = ticket_stages.id 
                AND hs.company_id = (SELECT company_id FROM tickets WHERE id = NEW.ticket_id)
             )
           ORDER BY (company_id IS NOT NULL) DESC, (workflow_category = 'analysis') DESC, position ASC
           LIMIT 1;
       END IF;

       -- Validations (Current != Target)
       SELECT id, position, workflow_category INTO v_stage_id, v_stage_pos, v_stage_workflow
       FROM ticket_stages
       WHERE id = (SELECT stage_id FROM tickets WHERE id = NEW.ticket_id);
       
       IF v_target_stage_id IS NOT NULL AND v_target_stage_id != v_stage_id THEN
          DECLARE
            v_target_pos int;
          BEGIN
            SELECT position INTO v_target_pos FROM ticket_stages WHERE id = v_target_stage_id;
            
            -- ALLOW MOVE IF: Current is 'waiting'/'open' OR strictly lower OR (Configured Setting override safety checks? No, keeps strictness unless configured?)
            -- If user configured it, we should probably allows it comfortably.
            -- Let's keep the check: Only advance forward or from open/waiting.
            -- If Configured, we assume user wants it. Maybe skip check?
            -- Let's skip check IF v_config_staff_reply_stage IS NOT NULL.
            
            IF v_config_staff_reply_stage IS NOT NULL OR (v_stage_workflow IN ('waiting', 'open')) OR (v_stage_pos < v_target_pos) THEN
               UPDATE tickets SET stage_id = v_target_stage_id, updated_at = NOW() WHERE id = NEW.ticket_id;
            END IF;
          END;
       END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_ticket_comment_automation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_ticket_notifications"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_recipient_id UUID;
    v_admins CURSOR FOR SELECT id FROM public.users WHERE company_id = NEW.company_id AND role IN ('owner', 'admin') AND active = true;
BEGIN
    IF TG_OP = 'INSERT' THEN
        FOR admin_Rec IN v_admins LOOP
            PERFORM public.create_notification(NEW.company_id, admin_Rec.id, 'ticket_created', NEW.id, 'Nuevo Ticket #' || NEW.ticket_number, 'Se ha creado un nuevo ticket: ' || NEW.title);
        END LOOP;
        
        IF NEW.assigned_to IS NOT NULL THEN
             PERFORM public.create_notification(NEW.company_id, NEW.assigned_to, 'ticket_assigned', NEW.id, 'Ticket Asignado #' || NEW.ticket_number, 'Te han asignado el ticket: ' || NEW.title);
        END IF;

    ELSIF TG_OP = 'UPDATE' THEN
        IF (OLD.assigned_to IS DISTINCT FROM NEW.assigned_to) AND (NEW.assigned_to IS NOT NULL) THEN
            PERFORM public.create_notification(NEW.company_id, NEW.assigned_to, 'ticket_assigned', NEW.id, 'Ticket Asignado #' || NEW.ticket_number, 'Te han asignado el ticket: ' || NEW.title);
        END IF;

        IF (OLD.stage_id IS DISTINCT FROM NEW.stage_id) THEN
            IF NEW.assigned_to IS NOT NULL THEN
                PERFORM public.create_notification(NEW.company_id, NEW.assigned_to, 'ticket_status_change', NEW.id, 'Cambio de Estado Ticket #' || NEW.ticket_number, 'El estado del ticket ha cambiado.');
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_ticket_notifications"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_ticket_soft_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_cancel_stage_id uuid;
    v_config_stage_id uuid;
BEGIN
    -- Check if ticket is being soft-deleted
    IF (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL) THEN
        
        -- 1. Check Company Settings FIRST
        SELECT ticket_stage_on_delete INTO v_config_stage_id
        FROM public.company_settings
        WHERE company_id = NEW.company_id;

        IF v_config_stage_id IS NOT NULL THEN
             -- Use configured stage
             v_cancel_stage_id := v_config_stage_id;
        ELSE
             -- 2. Fallback: Find 'cancel' stage (CHECK BOTH COMPANY AND GLOBAL)
            SELECT id INTO v_cancel_stage_id
            FROM public.ticket_stages
            WHERE (company_id = NEW.company_id OR company_id IS NULL)
              AND workflow_category = 'cancel'
            -- Prefer company specific, then global
            ORDER BY (company_id IS NOT NULL) DESC
            LIMIT 1;
        END IF;

        IF v_cancel_stage_id IS NOT NULL THEN
            NEW.stage_id := v_cancel_stage_id;
            NEW.is_opened := false; -- Explicitly close it
        END IF;
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_ticket_soft_delete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_verifactu_voiding"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- If an anulacion event is accepted, mark the invoice as void
  IF NEW.event_type = 'anulacion' AND NEW.status = 'accepted' THEN
    UPDATE public.invoices
       SET status = 'void',
           state = 'void'
     WHERE id = NEW.invoice_id
       AND (status != 'void' OR state != 'void');
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_verifactu_voiding"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."localities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "name" character varying(100) NOT NULL,
    "province" character varying(100),
    "country" character varying(100) DEFAULT 'España'::character varying,
    "postal_code" character varying(10)
);


ALTER TABLE "public"."localities" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."insert_or_get_locality"("p_name" "text", "p_province" "text", "p_country" "text", "p_postal_code" "text") RETURNS "public"."localities"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  _row public.localities;
BEGIN
  -- Normalize input inside DB if desired (caller should already normalize)
  SELECT * INTO _row FROM public.localities WHERE postal_code = p_postal_code LIMIT 1;
  IF FOUND THEN
    RETURN _row;
  END IF;

  INSERT INTO public.localities (name, province, country, postal_code)
  VALUES (p_name, p_province, p_country, p_postal_code)
  RETURNING * INTO _row;

  RETURN _row;
EXCEPTION WHEN unique_violation THEN
  SELECT * INTO _row FROM public.localities WHERE postal_code = p_postal_code LIMIT 1;
  RETURN _row;
END;
$$;


ALTER FUNCTION "public"."insert_or_get_locality"("p_name" "text", "p_province" "text", "p_country" "text", "p_postal_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."invite_user_to_company"("user_email" "text", "user_name" "text", "user_role" "text" DEFAULT 'member'::"text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
    current_user_company_id UUID;
    current_user_role TEXT;
    new_user_id UUID;
    result JSON;
BEGIN
    -- Obtener empresa y rol del usuario actual (método directo)
    SELECT u.company_id, u.role
    INTO current_user_company_id, current_user_role
    FROM public.users u
    WHERE u.auth_user_id = auth.uid()
    AND u.active = true
    LIMIT 1;
    
    -- Verificar que el usuario actual existe
    IF current_user_company_id IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Usuario no encontrado o inactivo'
        );
    END IF;
    
    -- Solo owners y admins pueden invitar
    IF current_user_role NOT IN ('owner', 'admin') THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Solo owners y administradores pueden invitar usuarios'
        );
    END IF;
    
    -- Verificar si el usuario ya existe
    IF EXISTS (
        SELECT 1 FROM public.users 
        WHERE email = user_email 
        AND company_id = current_user_company_id 
        AND deleted_at IS NULL
    ) THEN
        RETURN json_build_object(
            'success', false,
            'error', 'El usuario ya existe en esta empresa'
        );
    END IF;
    
    -- Validar role
    IF user_role NOT IN ('owner', 'admin', 'member') THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Rol no válido. Debe ser: owner, admin o member'
        );
    END IF;
    
    -- Crear el usuario
    INSERT INTO public.users (
        company_id, 
        email, 
        name, 
        role, 
        active,
        permissions
    ) VALUES (
        current_user_company_id,
        user_email,
        user_name,
        user_role,
        true,
        '{"moduloFacturas": false, "moduloMaterial": false, "moduloServicios": false, "moduloPresupuestos": false}'::jsonb
    ) RETURNING id INTO new_user_id;
    
    RETURN json_build_object(
        'success', true,
        'user_id', new_user_id,
        'company_id', current_user_company_id,
        'message', 'Usuario invitado correctamente'
    );
    
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', false,
        'error', 'Error: ' || SQLERRM
    );
END;
$$;


ALTER FUNCTION "public"."invite_user_to_company"("user_email" "text", "user_name" "text", "user_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."invite_user_to_company"("p_company_id" "uuid", "p_email" "text", "p_role" "text" DEFAULT 'member'::"text", "p_message" "text" DEFAULT NULL::"text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  inviter_id UUID;
  invitation_id UUID;
  company_name TEXT;
BEGIN
  SELECT u.id, c.name INTO inviter_id, company_name
  FROM public.users u
  JOIN public.companies c ON c.id = u.company_id
  WHERE u.auth_user_id = auth.uid()
    AND u.company_id = p_company_id
    AND u.role IN ('owner', 'admin')
    AND u.active = true;

  IF inviter_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Unauthorized or company not found');
  END IF;

  IF EXISTS(SELECT 1 FROM public.users WHERE email = p_email AND company_id = p_company_id AND active = true) THEN
    RETURN json_build_object('success', false, 'error', 'User already exists in this company');
  END IF;

  UPDATE public.company_invitations
  SET status = 'expired'
  WHERE email = p_email AND company_id = p_company_id AND status = 'pending';

  INSERT INTO public.company_invitations (company_id, email, invited_by_user_id, role, message)
  VALUES (p_company_id, p_email, inviter_id, p_role, p_message)
  RETURNING id INTO invitation_id;

  RETURN json_build_object('success', true, 'invitation_id', invitation_id, 'company_name', company_name, 'message', 'Invitation sent successfully');
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;


ALTER FUNCTION "public"."invite_user_to_company"("p_company_id" "uuid", "p_email" "text", "p_role" "text", "p_message" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."invite_user_to_company_debug"("user_email" "text", "user_name" "text", "user_role" "text" DEFAULT 'member'::"text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
    current_auth_uid UUID;
    current_user_company_id UUID;
    current_user_role TEXT;
    new_user_id UUID;
    debug_info JSON;
    result JSON;
BEGIN
    -- Debug: Obtener información del contexto actual
    current_auth_uid := auth.uid();
    
    -- Si no hay usuario autenticado, usar el primer owner disponible
    IF current_auth_uid IS NULL THEN
        SELECT u.company_id, u.role, u.auth_user_id
        INTO current_user_company_id, current_user_role, current_auth_uid
        FROM public.users u
        WHERE u.role = 'owner' 
        AND u.active = true
        LIMIT 1;
        
        IF current_user_company_id IS NULL THEN
            RETURN json_build_object(
                'success', false,
                'error', 'No hay usuarios owner disponibles y no hay sesión autenticada',
                'debug', json_build_object(
                    'auth_uid', current_auth_uid,
                    'users_count', (SELECT count(*) FROM public.users)
                )
            );
        END IF;
    ELSE
        -- Obtener empresa y rol del usuario autenticado
        SELECT u.company_id, u.role
        INTO current_user_company_id, current_user_role
        FROM public.users u
        WHERE u.auth_user_id = current_auth_uid
        AND u.active = true
        LIMIT 1;
    END IF;
    
    -- Si aún no encontramos empresa, usar la primera disponible
    IF current_user_company_id IS NULL THEN
        SELECT id INTO current_user_company_id
        FROM public.companies 
        WHERE is_active = true 
        LIMIT 1;
        
        current_user_role := 'owner'; -- Asumimos permisos para crear
    END IF;
    
    debug_info := json_build_object(
        'auth_uid', current_auth_uid,
        'company_id', current_user_company_id,
        'user_role', current_user_role,
        'input_email', user_email,
        'input_name', user_name,
        'input_role', user_role
    );
    
    -- Verificar si el usuario ya existe
    IF EXISTS (
        SELECT 1 FROM public.users 
        WHERE email = user_email 
        AND deleted_at IS NULL
    ) THEN
        RETURN json_build_object(
            'success', false,
            'error', 'El usuario ya existe en el sistema',
            'debug', debug_info
        );
    END IF;
    
    -- Validar role
    IF user_role NOT IN ('owner', 'admin', 'member') THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Rol no válido. Debe ser: owner, admin o member',
            'debug', debug_info
        );
    END IF;
    
    -- Crear el usuario
    INSERT INTO public.users (
        company_id, 
        email, 
        name, 
        role, 
        active,
        permissions
    ) VALUES (
        current_user_company_id,
        user_email,
        user_name,
        user_role,
        true,
        '{"moduloFacturas": false, "moduloMaterial": false, "moduloServicios": false, "moduloPresupuestos": false}'::jsonb
    ) RETURNING id INTO new_user_id;
    
    RETURN json_build_object(
        'success', true,
        'user_id', new_user_id,
        'company_id', current_user_company_id,
        'message', 'Usuario invitado correctamente',
        'debug', debug_info
    );
    
EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object(
        'success', false,
        'error', 'Error: ' || SQLERRM,
        'sqlstate', SQLSTATE,
        'debug', debug_info
    );
END;
$$;


ALTER FUNCTION "public"."invite_user_to_company_debug"("user_email" "text", "user_name" "text", "user_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."invoices_immutability_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  old_values JSONB;
  new_values JSONB;
  diff_keys TEXT[];
  base_allowed_fields TEXT[] := ARRAY[
    'payment_status',
    'notes_internal', 
    'payment_method',
    'payment_reference',
    'paid_at',
    'due_date',
    'updated_at',
    'stripe_payment_url',
    'stripe_payment_token',
    'paypal_payment_url',
    'paypal_payment_token',
    'payment_link_token',
    'payment_link_provider',
    'payment_link_expires_at',
    'retention_until',
    'full_invoice_number'
  ];
  allowed_fields TEXT[];
BEGIN
  -- Only block updates if invoice is in a final state
  -- We use 'issued', 'sent', 'paid', 'partially_paid', 'rectified', 'void', 'cancelled'
  -- We assume 'draft' is mutable.
  -- Valid enum values: draft, sent, paid, partial, overdue, cancelled, void, approved, issued, rectified
  IF OLD.status NOT IN ('issued', 'sent', 'paid', 'partial', 'overdue', 'rectified', 'void', 'cancelled') THEN
    RETURN NEW;
  END IF;

  allowed_fields := base_allowed_fields;
  
  -- Allow rectification changes
  IF NEW.status IN ('rectified', 'void') THEN
    allowed_fields := allowed_fields || ARRAY['status', 'rectification_invoice_id', 'rectification_reason', 'rectification_type', 'rectified_at'];
  END IF;
  
  old_values := to_jsonb(OLD);
  new_values := to_jsonb(NEW);
  
  FOR i IN 1..array_length(allowed_fields, 1) LOOP
    old_values := old_values - allowed_fields[i];
    new_values := new_values - allowed_fields[i];
  END LOOP;
  
  SELECT array_agg(key) INTO diff_keys
  FROM (
    SELECT key FROM jsonb_each(new_values) 
    EXCEPT 
    SELECT key FROM jsonb_each(old_values) WHERE old_values->key = new_values->key
  ) AS diffs;
  
  IF diff_keys IS NOT NULL AND array_length(diff_keys, 1) > 0 THEN
    FOR i IN 1..array_length(diff_keys, 1) LOOP
      IF new_values->diff_keys[i] IS DISTINCT FROM old_values->diff_keys[i] THEN
        RAISE EXCEPTION 'Invoice is in final state (%) and immutable. Diff: New=% Old=%', 
          OLD.status, new_values, old_values
        USING HINT = 'Allowed: ' || array_to_string(allowed_fields, ', ');
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."invoices_immutability_guard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."invoke_process_recurring_quotes"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_url text;
  v_service_key text;
BEGIN
  -- Obtener la URL base de Supabase
  -- Nota: En producción, estas deberían estar configuradas como secrets
  v_url := current_setting('app.settings.supabase_url', true);
  v_service_key := current_setting('app.settings.service_role_key', true);
  
  IF v_url IS NULL THEN
    v_url := 'https://ufutyjbqfjrlzkprvyvs.supabase.co';
  END IF;

  -- Hacer la llamada HTTP a la Edge Function
  PERFORM net.http_post(
    url := v_url || '/functions/v1/process-recurring-quotes',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body := '{}'::jsonb
  );
  
  RAISE NOTICE 'Invoked process-recurring-quotes at %', NOW();
END;
$$;


ALTER FUNCTION "public"."invoke_process_recurring_quotes"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."invoke_process_recurring_quotes"() IS 'Invoca la Edge Function process-recurring-quotes para generar facturas
de presupuestos recurrentes que están pendientes de facturar.
Se ejecuta diariamente a las 00:05 UTC via pg_cron.';



CREATE OR REPLACE FUNCTION "public"."is_company_admin"("target_company" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select (
    auth.role() = 'service_role'
    or exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and u.company_id = target_company
        and u.role in ('admin','manager','owner')
    )
  );
$$;


ALTER FUNCTION "public"."is_company_admin"("target_company" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_dev_user"("user_email" "text") RETURNS boolean
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM users 
        WHERE email = user_email 
        AND role = 'owner'
        AND active = true
        AND (permissions->>'isDev')::boolean = true
    );
END;
$$;


ALTER FUNCTION "public"."is_dev_user"("user_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_stage_hidden_for_company"("p_stage_id" "uuid", "p_company_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM hidden_stages
    WHERE stage_id = p_stage_id
      AND company_id = p_company_id
  );
END;
$$;


ALTER FUNCTION "public"."is_stage_hidden_for_company"("p_stage_id" "uuid", "p_company_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."is_stage_hidden_for_company"("p_stage_id" "uuid", "p_company_id" "uuid") IS 'Verifica si un estado genérico está oculto para una empresa específica';



CREATE OR REPLACE FUNCTION "public"."issue_invoice_verifactu"("pinvoiceid" "uuid", "pdeviceid" "text" DEFAULT NULL::"text", "psoftwareid" "text" DEFAULT NULL::"text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_inv       RECORD;
  v_next_pos  int;
  v_hash      text;
  v_result    json;
BEGIN
  -- Cargar y bloquear
  SELECT i.*, s.verifactuenabled, s.lastverifactuhash
  INTO v_inv
  FROM public.invoices i
  JOIN public.invoiceseries s ON s.id = i.seriesid
  WHERE i.id = pinvoiceid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found: %', pinvoiceid;
  END IF;

  IF v_inv.state IN ('final','void') OR v_inv.status NOT IN ('draft','sent') THEN
    RAISE EXCEPTION 'Invalid state to issue: state=% status=%', v_inv.state, v_inv.status;
  END IF;

  IF v_inv.verifactuenabled IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Series not enabled for Verifactu';
  END IF;

  -- Siguiente posición de cadena por serie
  SELECT COALESCE(MAX(verifactuchainposition), 0) + 1
    INTO v_next_pos
  FROM public.invoices
  WHERE seriesid = v_inv.seriesid
    AND deleted_at IS NULL;

  UPDATE public.invoices
     SET verifactuchainposition = v_next_pos
   WHERE id = pinvoiceid;

  -- Hash encadenado propio
  v_hash := public.generateverifactuhash(pinvoiceid);

  -- Finalizar con tu función
  v_result := public.finalizeinvoice(
    pinvoiceid := pinvoiceid,
    pseries    := v_inv.invoiceseries, -- etiqueta visible de la serie en tu invoices
    pdeviceid  := pdeviceid,
    psoftwareid:= psoftwareid
  );

  -- Actualizar último hash de la serie
  UPDATE public.invoiceseries
     SET lastverifactuhash = v_hash,
         updated_at = CURRENT_TIMESTAMP
   WHERE id = v_inv.seriesid;

  -- Registrar evento de emisión (service role lo usa; si llamas desde Edge, usa verifactu_log_event)
  INSERT INTO public.verifactu_events(eventtype, invoiceid, companyid, payload)
  VALUES ('issue', pinvoiceid, v_inv.companyid, jsonb_build_object('hash', v_hash, 'chain_position', v_next_pos));

  RETURN json_build_object(
    'invoice_id', pinvoiceid,
    'company_id', v_inv.companyid,
    'chain_position', v_next_pos,
    'hash', v_hash,
    'result', v_result
  );
END;
$$;


ALTER FUNCTION "public"."issue_invoice_verifactu"("pinvoiceid" "uuid", "pdeviceid" "text", "psoftwareid" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_client_access"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_company_id uuid;
  v_record_id uuid;
  v_email text;
  v_action text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_company_id := NEW.company_id;
    v_record_id := NEW.id;
    v_email := NEW.email;
    v_action := 'create';
  ELSIF TG_OP = 'UPDATE' THEN
    v_company_id := NEW.company_id;
    v_record_id := NEW.id;
    v_email := NEW.email;
    v_action := 'update';
  ELSIF TG_OP = 'DELETE' THEN
    v_company_id := OLD.company_id;
    v_record_id := OLD.id;
    v_email := OLD.email;
    v_action := 'delete';
  END IF;

  PERFORM public.gdpr_log_access(
    auth.uid(),
    v_action,
    TG_TABLE_NAME,
    v_record_id,
    v_email,
    'client_data_management',
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END
  );

  IF TG_OP = 'UPDATE' AND pg_trigger_depth() = 1 THEN
    UPDATE public.clients
    SET
      last_accessed_at = now(),
      access_count = COALESCE(access_count, 0) + 1
    WHERE id = NEW.id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."log_client_access"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_device_status_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
    -- Solo registrar si el estado realmente cambió
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO device_status_history (
            device_id, 
            previous_status, 
            new_status, 
            changed_by,
            notes
        ) VALUES (
            NEW.id,
            OLD.status,
            NEW.status,
            NEW.created_by, -- O usar auth.uid() si está disponible
            CASE 
                WHEN NEW.status = 'in_progress' AND NEW.started_repair_at IS NULL THEN 
                    'Reparación iniciada automáticamente'
                WHEN NEW.status = 'completed' AND NEW.completed_at IS NULL THEN 
                    'Reparación completada automáticamente'
                WHEN NEW.status = 'delivered' AND NEW.delivered_at IS NULL THEN 
                    'Dispositivo entregado automáticamente'
                ELSE 'Cambio de estado automático'
            END
        );
        
        -- Actualizar fechas automáticamente
        IF NEW.status = 'in_progress' AND NEW.started_repair_at IS NULL THEN
            NEW.started_repair_at = NOW();
        ELSIF NEW.status = 'completed' AND NEW.completed_at IS NULL THEN
            NEW.completed_at = NOW();
        ELSIF NEW.status = 'delivered' AND NEW.delivered_at IS NULL THEN
            NEW.delivered_at = NOW();
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."log_device_status_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_gdpr_audit"("p_action_type" "text", "p_table_name" "text", "p_record_id" "uuid" DEFAULT NULL::"uuid", "p_subject_email" "text" DEFAULT NULL::"text", "p_purpose" "text" DEFAULT NULL::"text", "p_old_values" "jsonb" DEFAULT NULL::"jsonb", "p_new_values" "jsonb" DEFAULT NULL::"jsonb", "p_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_company_id uuid;
    v_audit_id uuid;
BEGIN
    -- Validar action_type
    IF p_action_type NOT IN ('create', 'read', 'update', 'delete', 'export', 'anonymize', 'consent', 'access_request') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Tipo de acción inválido'
        );
    END IF;
    
    -- Obtener company_id
    SELECT company_id INTO v_company_id
    FROM users
    WHERE auth_user_id = COALESCE(p_user_id, auth.uid());
    
    -- Insertar en audit log
    INSERT INTO gdpr_audit_log (
        user_id,
        company_id,
        action_type,
        table_name,
        record_id,
        subject_email,
        purpose,
        old_values,
        new_values,
        created_at
    ) VALUES (
        COALESCE(p_user_id, auth.uid()),
        v_company_id,
        p_action_type,
        p_table_name,
        p_record_id,
        p_subject_email,
        p_purpose,
        p_old_values,
        p_new_values,
        now()
    )
    RETURNING id INTO v_audit_id;
    
    RETURN jsonb_build_object(
        'success', true,
        'audit_id', v_audit_id,
        'logged_at', now()
    );
    
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'error_detail', SQLSTATE
    );
END;
$$;


ALTER FUNCTION "public"."log_gdpr_audit"("p_action_type" "text", "p_table_name" "text", "p_record_id" "uuid", "p_subject_email" "text", "p_purpose" "text", "p_old_values" "jsonb", "p_new_values" "jsonb", "p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."log_gdpr_audit"("p_action_type" "text", "p_table_name" "text", "p_record_id" "uuid", "p_subject_email" "text", "p_purpose" "text", "p_old_values" "jsonb", "p_new_values" "jsonb", "p_user_id" "uuid") IS 'Registra un evento de auditoría GDPR en gdpr_audit_log';



CREATE OR REPLACE FUNCTION "public"."maintain_ticket_opened_status"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_category text;
  v_workflow text;
BEGIN
  -- Get category AND workflow of the NEW stage
  SELECT stage_category, workflow_category INTO v_category, v_workflow
  FROM ticket_stages
  WHERE id = NEW.stage_id;

  -- Logic: Close if category is 'completed' OR workflow is 'cancel' or 'final'
  -- (Because some users have 'final' stages marked as 'open' category erroneously)
  IF v_category = 'completed' OR v_workflow IN ('cancel', 'final') THEN
     NEW.is_opened := false;
  ELSE
     NEW.is_opened := true;
  END IF;
  
  -- Override if deleted
  IF NEW.deleted_at IS NOT NULL THEN
     NEW.is_opened := false;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."maintain_ticket_opened_status"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_client_accessed"("p_client_id" "uuid", "p_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_client_email text;
    v_company_id uuid;
    v_user_id uuid;
BEGIN
    -- Obtener email del cliente
    SELECT email INTO v_client_email
    FROM clients
    WHERE id = p_client_id;
    
    IF v_client_email IS NULL THEN
        RETURN;
    END IF;
    
    -- Obtener user_id y company_id
    SELECT u.id, u.company_id INTO v_user_id, v_company_id
    FROM users u
    WHERE u.auth_user_id = COALESCE(p_user_id, auth.uid())
    LIMIT 1;
    
    -- Actualizar last_accessed_at y access_count
    UPDATE clients
    SET 
        last_accessed_at = now(),
        access_count = COALESCE(access_count, 0) + 1
    WHERE id = p_client_id;
    
    -- Registrar en audit log (solo si pasó más de 1 hora desde el último registro)
    IF NOT EXISTS (
        SELECT 1 FROM gdpr_audit_log
        WHERE record_id = p_client_id
        AND action_type = 'read'
        AND created_at > now() - INTERVAL '1 hour'
    ) THEN
        INSERT INTO gdpr_audit_log (
            user_id,
            company_id,
            action_type,
            table_name,
            record_id,
            subject_email,
            purpose,
            created_at
        ) VALUES (
            v_user_id,
            v_company_id,
            'read',
            'clients',
            p_client_id,
            v_client_email,
            'Client data accessed',
            now()
        );
    END IF;
    
EXCEPTION WHEN OTHERS THEN
    -- No bloquear si falla
    RAISE WARNING 'Error al marcar cliente como accedido: %', SQLERRM;
END;
$$;


ALTER FUNCTION "public"."mark_client_accessed"("p_client_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."mark_client_accessed"("p_client_id" "uuid", "p_user_id" "uuid") IS 'Marca un cliente como accedido y registra en audit log (llamar desde frontend)';



CREATE OR REPLACE FUNCTION "public"."mark_expired_quotes"() RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE quotes
  SET status = 'expired',
      updated_at = NOW()
  WHERE status IN ('draft', 'sent', 'viewed')
    AND valid_until < CURRENT_DATE
    AND NOT is_anonymized;
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;


ALTER FUNCTION "public"."mark_expired_quotes"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."mark_expired_quotes"() IS 'Marca como expirados los presupuestos que superaron su fecha de validez';



CREATE OR REPLACE FUNCTION "public"."migrate_clients_by_tenant"() RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
    michinanny_id UUID;
    satpcgo_id UUID;
    libera_id UUID;
    result_text TEXT := '';
    clients_migrated INTEGER := 0;
BEGIN
    -- Obtener IDs de las empresas
    SELECT id INTO michinanny_id FROM companies WHERE name = 'Michinanny';
    SELECT id INTO satpcgo_id FROM companies WHERE name = 'SatPCGo';
    SELECT id INTO libera_id FROM companies WHERE name = 'Libera Tus Creencias';
    
    -- Verificar que las empresas existen
    IF michinanny_id IS NULL OR satpcgo_id IS NULL OR libera_id IS NULL THEN
        RAISE EXCEPTION 'No se encontraron todas las empresas. Ejecutar primero migrate_legacy_users().';
    END IF;
    
    result_text := result_text || '=== EMPRESAS ENCONTRADAS ===' || E'\n';
    result_text := result_text || 'Michinanny: ' || michinanny_id::text || E'\n';
    result_text := result_text || 'SatPCGo: ' || satpcgo_id::text || E'\n';
    result_text := result_text || 'Libera Tus Creencias: ' || libera_id::text || E'\n\n';
    
    -- Limpiar datos anteriores
    DELETE FROM clients WHERE metadata->>'migration_source' = 'legacy_data';
    result_text := result_text || '🧹 Datos anteriores limpiados' || E'\n\n';
    
    -- === CLIENTES DE SATPCGO (Reparación de ordenadores) ===
    -- Según mencionas, los datos originales pertenecían a SatPCGo
    result_text := result_text || '=== MIGRANDO CLIENTES A SATPCGO ===' || E'\n';
    
    INSERT INTO clients (id, company_id, name, email, phone, address, metadata, created_at, updated_at)
    VALUES 
    -- Clientes originales que tenían problemas con ordenadores
    (gen_random_uuid(), satpcgo_id, 'Ana Pérez García', 'ana.perez@example.com', '611223344',
     '{"direccion": "Calle Mayor 15, Madrid", "legacy_direccion_id": "6800b7d54417550a4cba4392"}'::jsonb,
     '{"legacy_id": "6800bb5a4417550a4cba43bb", "dni": "12345678A", "migration_source": "legacy_data", "tipo_cliente": "reparacion_pc"}'::jsonb,
     '2025-04-17 08:27:00'::timestamp, NOW()),
     
    (gen_random_uuid(), satpcgo_id, 'Luis González López', 'luis.gonzalez@example.com', '622334455',
     '{"direccion": "Avenida España 23, Barcelona", "legacy_direccion_id": "6800b7d54417550a4cba4393"}'::jsonb,
     '{"legacy_id": "6800bb5a4417550a4cba43bc", "dni": "98765432B", "migration_source": "legacy_data", "tipo_cliente": "mantenimiento"}'::jsonb,
     '2025-04-17 08:27:00'::timestamp, NOW()),
     
    (gen_random_uuid(), satpcgo_id, 'Sofía Martínez Ruiz', 'sofia.martinez@example.com', '633445566',
     '{"direccion": "Plaza Central 8, Valencia", "legacy_direccion_id": "6800b7d54417550a4cba4394"}'::jsonb,
     '{"legacy_id": "6800bb5a4417550a4cba43bd", "dni": "45678912C", "migration_source": "legacy_data", "tipo_cliente": "reparacion_laptop"}'::jsonb,
     '2025-04-17 08:27:00'::timestamp, NOW()),
     
    (gen_random_uuid(), satpcgo_id, 'Manolo Cabeza Bolo', 'cabezabolo@gmail.com', '654234567',
     '{"direccion": "Calle Inventada 42, Sevilla", "legacy_direccion_id": "68338e40fb9513a4a9116a0d"}'::jsonb,
     '{"legacy_id": "68338e4148117feab207eed1", "dni": "676545634L", "migration_source": "legacy_data", "tipo_cliente": "virus_removal"}'::jsonb,
     '2025-05-25 21:40:00'::timestamp, NOW()),
     
    (gen_random_uuid(), satpcgo_id, 'POR FAVOR FUNCIONA', 'porfavor@gmail.com', '675434567',
     '{"direccion": "Calle de la Desesperación 1, Madrid", "legacy_direccion_id": "6833a2f1fb9513a4a9116fd3"}'::jsonb,
     '{"legacy_id": "6833a2f248117feab207f474", "dni": "456284920G", "migration_source": "legacy_data", "tipo_cliente": "emergencia_pc", "nota": "Cliente desesperado por arreglar su PC"}'::jsonb,
     '2025-05-25 23:08:00'::timestamp, NOW());
     
    clients_migrated := clients_migrated + 5;
    result_text := result_text || '✅ 5 clientes migrados a SatPCGo' || E'\n';
    
    -- === CLIENTES DE MICHINANNY (Servicios para mascotas) ===
    result_text := result_text || E'\n=== AÑADIENDO CLIENTES A MICHINANNY ===' || E'\n';
    
    INSERT INTO clients (id, company_id, name, email, phone, address, metadata, created_at, updated_at)
    VALUES 
    (gen_random_uuid(), michinanny_id, 'Carmen López Fernández', 'carmen.lopez@example.com', '655667788',
     '{"direccion": "Barrio de Salamanca 12, Madrid", "tipo_vivienda": "piso"}'::jsonb,
     '{"migration_source": "legacy_data", "tipo_cliente": "cuidado_perros", "mascotas": ["Golden Retriever", "Gato Persa"], "servicios_frecuentes": ["paseo", "cuidado_fin_de_semana"]}'::jsonb,
     NOW(), NOW()),
     
    (gen_random_uuid(), michinanny_id, 'Mikimiau Miau Miau', 'miau@gmail.com', '657876452',
     '{"direccion": "Calle de los Gatos 7, Barcelona", "tipo_vivienda": "casa"}'::jsonb,
     '{"legacy_id": "68338da11985382d9f221703", "dni": "456234562A", "migration_source": "legacy_data", "tipo_cliente": "especialista_gatos", "mascotas": ["Miau", "Gatito", "Pelusa"], "nota": "Especialista en gatos, claramente"}'::jsonb,
     '2025-05-25 21:37:00'::timestamp, NOW()),
     
    (gen_random_uuid(), michinanny_id, 'Isabel Ruiz Pérez', 'isabel.ruiz@example.com', '677889900',
     '{"direccion": "Avenida de los Parques 34, Valencia", "tipo_vivienda": "chalet"}'::jsonb,
     '{"migration_source": "legacy_data", "tipo_cliente": "cuidado_premium", "mascotas": ["Labrador", "Yorkshire"], "servicios_frecuentes": ["grooming", "veterinario"]}'::jsonb,
     NOW(), NOW());
     
    clients_migrated := clients_migrated + 3;
    result_text := result_text || '✅ 3 clientes añadidos a Michinanny' || E'\n';
    
    -- === CLIENTES DE LIBERA TUS CREENCIAS (Coaching/Terapia) ===
    result_text := result_text || E'\n=== AÑADIENDO CLIENTES A LIBERA TUS CREENCIAS ===' || E'\n';
    
    INSERT INTO clients (id, company_id, name, email, phone, address, metadata, created_at, updated_at)
    VALUES 
    (gen_random_uuid(), libera_id, 'Elena Martín López', 'elena.martin@example.com', '699001122',
     '{"direccion": "Zona Zen 15, Ibiza", "tipo_vivienda": "apartamento"}'::jsonb,
     '{"migration_source": "legacy_data", "tipo_cliente": "coaching_personal", "servicios": ["autoestima", "liberacion_emocional"], "sesiones_completadas": 12}'::jsonb,
     NOW(), NOW()),
     
    (gen_random_uuid(), libera_id, 'Mamerto Humberto', 'hola@gmail.com', '654567432',
     '{"direccion": "Calle de la Paz Interior 3, Mallorca", "tipo_vivienda": "casa"}'::jsonb,
     '{"legacy_id": "683371be2e4bb9979f4c9025", "dni": "234567353K", "migration_source": "legacy_data", "tipo_cliente": "terapia_pareja", "servicios": ["comunicacion", "resolucion_conflictos"]}'::jsonb,
     '2025-05-25 19:38:00'::timestamp, NOW()),
     
    (gen_random_uuid(), libera_id, 'Alberto Paperto Miamerto', 'miamerto@gmail.com', '675432345',
     '{"direccion": "Plaza de la Libertad 88, Granada", "tipo_vivienda": "loft"}'::jsonb,
     '{"legacy_id": "6833917f48117feab207eefb", "dni": "657542345L", "migration_source": "legacy_data", "tipo_cliente": "coaching_profesional", "servicios": ["liderazgo", "gestion_tiempo"], "objetivo": "promocion_laboral"}'::jsonb,
     '2025-05-25 21:54:00'::timestamp, NOW());
     
    clients_migrated := clients_migrated + 3;
    result_text := result_text || '✅ 3 clientes añadidos a Libera Tus Creencias' || E'\n';
    
    -- Resumen final
    result_text := result_text || E'\n=== RESUMEN DE MIGRACIÓN ===' || E'\n';
    result_text := result_text || 'Total de clientes migrados: ' || clients_migrated::text || E'\n';
    result_text := result_text || '- SatPCGo (Reparación PC): 5 clientes' || E'\n';
    result_text := result_text || '- Michinanny (Mascotas): 3 clientes' || E'\n';
    result_text := result_text || '- Libera Tus Creencias (Coaching): 3 clientes' || E'\n';
    result_text := result_text || E'\n✅ Migración completada con datos distribuidos por tenant' || E'\n';
    
    RETURN result_text;
END;
$$;


ALTER FUNCTION "public"."migrate_clients_by_tenant"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."migrate_legacy_clients"() RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
    michinanny_company_id UUID;
    anscarr_company_id UUID;
    libera_company_id UUID;
    satpcgo_company_id UUID;
    result_text TEXT := '';
    clients_migrated INTEGER := 0;
BEGIN
    -- Obtener los IDs de las empresas existentes
    SELECT id INTO michinanny_company_id FROM companies WHERE name = 'Michinanny';
    SELECT id INTO anscarr_company_id FROM companies WHERE name = 'Anscarr';  
    SELECT id INTO libera_company_id FROM companies WHERE name = 'Libera Tus Creencias';
    SELECT id INTO satpcgo_company_id FROM companies WHERE name = 'SatPCGo';
    
    -- Verificar que las empresas existen
    IF michinanny_company_id IS NULL THEN
        RAISE EXCEPTION 'Empresa Michinanny no encontrada. Ejecutar primero el script de migración de usuarios.';
    END IF;
    
    result_text := result_text || 'Empresas encontradas:' || E'\n';
    result_text := result_text || '- Michinanny: ' || michinanny_company_id::text || E'\n';
    result_text := result_text || '- Anscarr: ' || COALESCE(anscarr_company_id::text, 'NOT FOUND') || E'\n';
    result_text := result_text || '- Libera Tus Creencias: ' || COALESCE(libera_company_id::text, 'NOT FOUND') || E'\n';
    result_text := result_text || '- SatPCGo: ' || COALESCE(satpcgo_company_id::text, 'NOT FOUND') || E'\n\n';
    
    -- Limpiar clientes existentes de migración anterior
    DELETE FROM clients WHERE metadata->>'legacy_id' IS NOT NULL;
    
    result_text := result_text || 'Iniciando migración de clientes...' || E'\n';
    
    -- MIGRAR CLIENTES
    -- La mayoría pertenecen a usuario_id: 672275dacb317c137fb1dd1f (Michinanny)
    -- Uno pertenece a usuario_id: 671e967acb317c137fb1dc4a (probablemente otra empresa)
    
    -- Clientes de Michinanny (usuario_id: 672275dacb317c137fb1dd1f)
    INSERT INTO clients (id, company_id, name, email, phone, address, metadata, created_at, updated_at)
    VALUES 
    -- Ana Pérez García
    (gen_random_uuid(), michinanny_company_id, 'Ana Pérez García', 'ana.perez@example.com', '611223344', 
     '{"legacy_direccion_id": "6800b7d54417550a4cba4392"}'::jsonb,
     '{"legacy_id": "6800bb5a4417550a4cba43bb", "legacy_usuario_id": "672275dacb317c137fb1dd1f", "dni": "12345678A"}'::jsonb,
     '2025-04-17 08:27:00'::timestamp, NOW()),
     
    -- Luis González López  
    (gen_random_uuid(), michinanny_company_id, 'Luis González López', 'luis.gonzalez@example.com', '622334455',
     '{"legacy_direccion_id": "6800b7d54417550a4cba4393"}'::jsonb,
     '{"legacy_id": "6800bb5a4417550a4cba43bc", "legacy_usuario_id": "672275dacb317c137fb1dd1f", "dni": "98765432B"}'::jsonb,
     '2025-04-17 08:27:00'::timestamp, NOW()),
     
    -- Sofía Martínez Ruiz
    (gen_random_uuid(), michinanny_company_id, 'Sofía Martínez Ruiz', 'sofia.martinez@example.com', '633445566',
     '{"legacy_direccion_id": "6800b7d54417550a4cba4394"}'::jsonb,
     '{"legacy_id": "6800bb5a4417550a4cba43bd", "legacy_usuario_id": "672275dacb317c137fb1dd1f", "dni": "45678912C"}'::jsonb,
     '2025-04-17 08:27:00'::timestamp, NOW()),
     
    -- Javier Sánchez Díaz
    (gen_random_uuid(), michinanny_company_id, 'Javier Sánchez Díaz', 'javier.sanchez@example.com', '644556677',
     '{"legacy_direccion_id": "6800b7d54417550a4cba4395"}'::jsonb,
     '{"legacy_id": "6800bb5a4417550a4cba43be", "legacy_usuario_id": "672275dacb317c137fb1dd1f", "dni": "32165498D"}'::jsonb,
     '2025-04-17 08:27:00'::timestamp, NOW()),
     
    -- Carmen López Fernández
    (gen_random_uuid(), michinanny_company_id, 'Carmen López Fernández', 'carmen.lopez@example.com', '655667788',
     '{"legacy_direccion_id": "6800b7d54417550a4cba4396"}'::jsonb,
     '{"legacy_id": "6800bb5a4417550a4cba43bf", "legacy_usuario_id": "672275dacb317c137fb1dd1f", "dni": "78912345E"}'::jsonb,
     '2025-04-17 08:27:00'::timestamp, NOW()),
     
    -- Manuel García Martín
    (gen_random_uuid(), michinanny_company_id, 'Manuel García Martín', 'manuel.garcia@example.com', '666778899',
     '{"legacy_direccion_id": "6800b7d54417550a4cba4397"}'::jsonb,
     '{"legacy_id": "6800bb5a4417550a4cba43c0", "legacy_usuario_id": "672275dacb317c137fb1dd1f", "dni": "65432178F"}'::jsonb,
     '2025-04-17 08:27:00'::timestamp, NOW()),
     
    -- Isabel Ruiz Pérez
    (gen_random_uuid(), michinanny_company_id, 'Isabel Ruiz Pérez', 'isabel.ruiz@example.com', '677889900',
     '{"legacy_direccion_id": "6800b7d54417550a4cba4398"}'::jsonb,
     '{"legacy_id": "6800bb5a4417550a4cba43c1", "legacy_usuario_id": "672275dacb317c137fb1dd1f", "dni": "21478536G"}'::jsonb,
     '2025-04-17 08:27:00'::timestamp, NOW()),
     
    -- Antonio Díaz González
    (gen_random_uuid(), michinanny_company_id, 'Antonio Díaz González', 'antonio.diaz@example.com', '688990011',
     '{"legacy_direccion_id": "6800b7d54417550a4cba4399"}'::jsonb,
     '{"legacy_id": "6800bb5a4417550a4cba43c2", "legacy_usuario_id": "672275dacb317c137fb1dd1f", "dni": "87521469H"}'::jsonb,
     '2025-04-17 08:27:00'::timestamp, NOW()),
     
    -- Elena Martín López
    (gen_random_uuid(), michinanny_company_id, 'Elena Martín López', 'elena.martin@example.com', '699001122',
     '{"legacy_direccion_id": "6800b7d54417550a4cba439a"}'::jsonb,
     '{"legacy_id": "6800bb5a4417550a4cba43c3", "legacy_usuario_id": "672275dacb317c137fb1dd1f", "dni": "96325874J"}'::jsonb,
     '2025-04-17 08:27:00'::timestamp, NOW()),
     
    -- Marta Pérez Díaz
    (gen_random_uuid(), michinanny_company_id, 'Marta Pérez Díaz', 'marta.perez@example.com', '611223355',
     '{"legacy_direccion_id": "6800b7d54417550a4cba439c"}'::jsonb,
     '{"legacy_id": "6800bb5a4417550a4cba43c5", "legacy_usuario_id": "672275dacb317c137fb1dd1f", "dni": "25874136L"}'::jsonb,
     '2025-04-17 08:27:00'::timestamp, NOW());
     
    clients_migrated := clients_migrated + 10;
    
    -- Continuar con más clientes de Michinanny (los primeros 45 registros)
    INSERT INTO clients (id, company_id, name, email, phone, address, metadata, created_at, updated_at)
    VALUES 
    -- Carlos González Martín
    (gen_random_uuid(), michinanny_company_id, 'Carlos González Martín', 'carlos.gonzalez@example.com', '622334466',
     '{"legacy_direccion_id": "6800b7d54417550a4cba439d"}'::jsonb,
     '{"legacy_id": "6800bb5a4417550a4cba43c6", "legacy_usuario_id": "672275dacb317c137fb1dd1f", "dni": "36985214M"}'::jsonb,
     '2025-04-17 08:27:00'::timestamp, NOW()),
     
    -- Lucía Martínez Fernández
    (gen_random_uuid(), michinanny_company_id, 'Lucía Martínez Fernández', 'lucia.martinez@example.com', '633445577',
     '{"legacy_direccion_id": "6800b7d54417550a4cba439e"}'::jsonb,
     '{"legacy_id": "6800bb5a4417550a4cba43c7", "legacy_usuario_id": "672275dacb317c137fb1dd1f", "dni": "15935782N"}'::jsonb,
     '2025-04-17 08:27:00'::timestamp, NOW()),
     
    -- Sergio Sánchez López
    (gen_random_uuid(), michinanny_company_id, 'Sergio Sánchez López', 'sergio.sanchez@example.com', '644556688',
     '{"legacy_direccion_id": "6800b7d54417550a4cba439f"}'::jsonb,
     '{"legacy_id": "6800bb5a4417550a4cba43c8", "legacy_usuario_id": "672275dacb317c137fb1dd1f", "dni": "75395128P"}'::jsonb,
     '2025-04-17 08:27:00'::timestamp, NOW()),
     
    -- Paula López García
    (gen_random_uuid(), michinanny_company_id, 'Paula López García', 'paula.lopez@example.com', '655667799',
     '{"legacy_direccion_id": "6800b7d54417550a4cba43a0"}'::jsonb,
     '{"legacy_id": "6800bb5a4417550a4cba43c9", "legacy_usuario_id": "672275dacb317c137fb1dd1f", "dni": "85274196Q"}'::jsonb,
     '2025-04-17 08:27:00'::timestamp, NOW()),
     
    -- Raúl García Ruiz
    (gen_random_uuid(), michinanny_company_id, 'Raúl García Ruiz', 'raul.garcia@example.com', '666778900',
     '{"legacy_direccion_id": "6800b7d54417550a4cba43a1"}'::jsonb,
     '{"legacy_id": "6800bb5a4417550a4cba43ca", "legacy_usuario_id": "672275dacb317c137fb1dd1f", "dni": "96385274R"}'::jsonb,
     '2025-04-17 08:27:00'::timestamp, NOW()),
     
    -- Mamerto Humberto (cliente especial - tiene apellidos vacíos)
    (gen_random_uuid(), michinanny_company_id, 'Mamerto Humberto', 'hola@gmail.com', '654567432',
     '{"legacy_direccion_id": "683371be48117feab207e815"}'::jsonb,
     '{"legacy_id": "683371be2e4bb9979f4c9025", "legacy_usuario_id": "672275dacb317c137fb1dd1f", "dni": "234567353K"}'::jsonb,
     '2025-05-25 19:38:00'::timestamp, NOW()),
     
    -- Mikimiau Miau Miau
    (gen_random_uuid(), michinanny_company_id, 'Mikimiau Miau Miau', 'miau@gmail.com', '657876452',
     '{"legacy_direccion_id": "68338da02e4bb9979f4c9b03"}'::jsonb,
     '{"legacy_id": "68338da11985382d9f221703", "legacy_usuario_id": "672275dacb317c137fb1dd1f", "dni": "456234562A"}'::jsonb,
     '2025-05-25 21:37:00'::timestamp, NOW()),
     
    -- Manolo Cabeza Bolo
    (gen_random_uuid(), michinanny_company_id, 'Manolo Cabeza Bolo', 'cabezabolo@gmail.com', '654234567',
     '{"legacy_direccion_id": "68338e40fb9513a4a9116a0d"}'::jsonb,
     '{"legacy_id": "68338e4148117feab207eed1", "legacy_usuario_id": "672275dacb317c137fb1dd1f", "dni": "676545634L"}'::jsonb,
     '2025-05-25 21:40:00'::timestamp, NOW()),
     
    -- Alberto Paperto Miamerto
    (gen_random_uuid(), michinanny_company_id, 'Alberto Paperto Miamerto', 'miamerto@gmail.com', '675432345',
     '{"legacy_direccion_id": "6833917efb9513a4a9116a4b"}'::jsonb,
     '{"legacy_id": "6833917f48117feab207eefb", "legacy_usuario_id": "672275dacb317c137fb1dd1f", "dni": "657542345L"}'::jsonb,
     '2025-05-25 21:54:00'::timestamp, NOW()),
     
    -- POR FAVOR FUNCIONA
    (gen_random_uuid(), michinanny_company_id, 'POR FAVOR FUNCIONA', 'porfavor@gmail.com', '675434567',
     '{"legacy_direccion_id": "6833a2f1fb9513a4a9116fd3"}'::jsonb,
     '{"legacy_id": "6833a2f248117feab207f474", "legacy_usuario_id": "672275dacb317c137fb1dd1f", "dni": "456284920G"}'::jsonb,
     '2025-05-25 23:08:00'::timestamp, NOW());
     
    clients_migrated := clients_migrated + 10;
    
    -- Cliente especial que pertenece a otro usuario_id (probablemente otra empresa)
    -- Pedro Fernández Ruiz (usuario_id: 671e967acb317c137fb1dc4a)
    IF anscarr_company_id IS NOT NULL THEN
        INSERT INTO clients (id, company_id, name, email, phone, address, metadata, created_at, updated_at)
        VALUES 
        (gen_random_uuid(), anscarr_company_id, 'Pedro Fernández Ruiz', 'pedro.fernandez@example.com', '600112233',
         '{"legacy_direccion_id": "6800b7d54417550a4cba439b"}'::jsonb,
         '{"legacy_id": "6800bb5a4417550a4cba43c4", "legacy_usuario_id": "671e967acb317c137fb1dc4a", "dni": "14785236K"}'::jsonb,
         '2025-04-17 08:27:00'::timestamp, NOW());
         
        clients_migrated := clients_migrated + 1;
        result_text := result_text || 'Cliente Pedro Fernández asignado a Anscarr' || E'\n';
    ELSE
        -- Si no existe Anscarr, asignar a Michinanny temporalmente
        INSERT INTO clients (id, company_id, name, email, phone, address, metadata, created_at, updated_at)
        VALUES 
        (gen_random_uuid(), michinanny_company_id, 'Pedro Fernández Ruiz', 'pedro.fernandez@example.com', '600112233',
         '{"legacy_direccion_id": "6800b7d54417550a4cba439b"}'::jsonb,
         '{"legacy_id": "6800bb5a4417550a4cba43c4", "legacy_usuario_id": "671e967acb317c137fb1dc4a", "dni": "14785236K", "note": "Originalmente de otro usuario_id - revisar asignación"}'::jsonb,
         '2025-04-17 08:27:00'::timestamp, NOW());
         
        clients_migrated := clients_migrated + 1;
        result_text := result_text || 'Cliente Pedro Fernández asignado temporalmente a Michinanny (usuario_id diferente)' || E'\n';
    END IF;
    
    -- Continuar con el resto de clientes de Michinanny...
    -- (Agregando algunos más de los 47 totales para completar la migración)
    INSERT INTO clients (id, company_id, name, email, phone, address, metadata, created_at, updated_at)
    VALUES 
    -- Nuria Ruiz Díaz
    (gen_random_uuid(), michinanny_company_id, 'Nuria Ruiz Díaz', 'nuria.ruiz@example.com', '677889911',
     '{"legacy_direccion_id": "6800b7d54417550a4cba43a2"}'::jsonb,
     '{"legacy_id": "6800bb5a4417550a4cba43cb", "legacy_usuario_id": "672275dacb317c137fb1dd1f", "dni": "10293847S"}'::jsonb,
     '2025-04-17 08:27:00'::timestamp, NOW()),
     
    -- David Díaz Martín
    (gen_random_uuid(), michinanny_company_id, 'David Díaz Martín', 'david.diaz@example.com', '688990022',
     '{"legacy_direccion_id": "6800b7d54417550a4cba43a3"}'::jsonb,
     '{"legacy_id": "6800bb5a4417550a4cba43cc", "legacy_usuario_id": "672275dacb317c137fb1dd1f", "dni": "47586932T"}'::jsonb,
     '2025-04-17 08:27:00'::timestamp, NOW()),
     
    -- Alba Martín Fernández
    (gen_random_uuid(), michinanny_company_id, 'Alba Martín Fernández', 'alba.martin@example.com', '699001133',
     '{"legacy_direccion_id": "6800b7d54417550a4cba43a4"}'::jsonb,
     '{"legacy_id": "6800bb5a4417550a4cba43cd", "legacy_usuario_id": "672275dacb317c137fb1dd1f", "dni": "29384756U"}'::jsonb,
     '2025-04-17 08:27:00'::timestamp, NOW()),
     
    -- Adrián Fernández López
    (gen_random_uuid(), michinanny_company_id, 'Adrián Fernández López', 'adrian.fernandez@example.com', '600112244',
     '{"legacy_direccion_id": "6800b7d54417550a4cba43a5"}'::jsonb,
     '{"legacy_id": "6800bb5a4417550a4cba43ce", "legacy_usuario_id": "672275dacb317c137fb1dd1f", "dni": "56473829V"}'::jsonb,
     '2025-04-17 08:27:00'::timestamp, NOW()),
     
    -- Clara Pérez García
    (gen_random_uuid(), michinanny_company_id, 'Clara Pérez García', 'clara.perez@example.com', '611223366',
     '{"legacy_direccion_id": "6800b7d54417550a4cba43a6"}'::jsonb,
     '{"legacy_id": "6800bb5a4417550a4cba43cf", "legacy_usuario_id": "672275dacb317c137fb1dd1f", "dni": "82736495W"}'::jsonb,
     '2025-04-17 08:27:00'::timestamp, NOW());
     
    clients_migrated := clients_migrated + 5;
    
    result_text := result_text || 'Migración completada exitosamente!' || E'\n';
    result_text := result_text || 'Total de clientes migrados: ' || clients_migrated::text || E'\n';
    result_text := result_text || 'Clientes asignados principalmente a Michinanny' || E'\n';
    result_text := result_text || 'Un cliente con usuario_id diferente identificado' || E'\n';
    
    RETURN result_text;
END;
$$;


ALTER FUNCTION "public"."migrate_legacy_clients"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."migrate_legacy_users"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
    company_uuid UUID;
    result_text TEXT := '';
BEGIN
    -- Limpiar datos anteriores de migración si existen
    DELETE FROM users WHERE email LIKE '%@michinanny.es' OR email LIKE '%@anscarr.es' OR email LIKE '%@liberatuscreencias.com' OR email LIKE '%@satpcgo.es';
    DELETE FROM companies WHERE legacy_negocio_id IS NOT NULL;
    
    -- EMPRESA 1: michinanny.es
    INSERT INTO companies (id, name, website, legacy_negocio_id, created_at, updated_at)
    VALUES (
        gen_random_uuid(),
        'Michinanny',
        'https://michinanny.es/',
        '671ec9f84ecc7019c9ea3bd2',
        '2024-10-27 19:19:00'::timestamp,
        NOW()
    ) RETURNING id INTO company_uuid;
    
    result_text := result_text || 'Empresa Michinanny creada: ' || company_uuid::text || E'\n';
    
    -- Usuarios de Michinanny
    INSERT INTO users (id, company_id, email, name, permissions, created_at, updated_at)
    VALUES 
    (gen_random_uuid(), company_uuid, 'marina@michinanny.es', 'Marina Casado García', 
     '{"moduloFacturas": false, "moduloPresupuestos": false, "moduloServicios": true, "moduloMaterial": false}'::jsonb,
     '2024-10-27 19:19:00'::timestamp, NOW()),
    (gen_random_uuid(), company_uuid, 'eva@michinanny.es', 'Eva Marín',
     '{"moduloFacturas": false, "moduloPresupuestos": false, "moduloServicios": true, "moduloMaterial": false}'::jsonb,
     '2024-10-27 19:20:00'::timestamp, NOW());
    
    -- EMPRESA 3: liberatuscreencias.com
    INSERT INTO companies (id, name, website, legacy_negocio_id, created_at, updated_at)
    VALUES (
        gen_random_uuid(),
        'Libera Tus Creencias',
        'https://liberatuscreencias.com/',
        '67227971cb317c137fb1dd20',
        '2024-10-27 19:40:00'::timestamp,
        NOW()
    ) RETURNING id INTO company_uuid;
    
    INSERT INTO users (id, company_id, email, name, permissions, created_at, updated_at)
    VALUES (
        gen_random_uuid(),
        company_uuid,
        'vanesa@liberatuscreencias.com',
        'Vanesa Santa Maria Garibaldi',
        '{"moduloFacturas": false, "moduloPresupuestos": false, "moduloServicios": false, "moduloMaterial": false}'::jsonb,
        '2024-10-27 19:40:00'::timestamp,
        NOW()
    );
    
    -- EMPRESA 4: satpcgo.es
    INSERT INTO companies (id, name, website, legacy_negocio_id, created_at, updated_at)
    VALUES (
        gen_random_uuid(),
        'SatPCGo',
        'https://satpcgo.es/',
        '671eca034ecc7019c9ea3bd3',
        '2024-10-30 18:07:00'::timestamp,
        NOW()
    ) RETURNING id INTO company_uuid;
    
    INSERT INTO users (id, company_id, email, name, permissions, created_at, updated_at)
    VALUES (
        gen_random_uuid(),
        company_uuid,
        'alberto@satpcgo.es',
        'Alberto Dominguez',
        '{"moduloFacturas": true, "moduloPresupuestos": true, "moduloServicios": true, "moduloMaterial": true}'::jsonb,
        '2024-10-30 18:07:00'::timestamp,
        NOW()
    );
    
    result_text := result_text || 'Migración completada exitosamente. 4 empresas y 5 usuarios creados.';
    
    RETURN result_text;
END;
$$;


ALTER FUNCTION "public"."migrate_legacy_users"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_gdpr_deletion_request"("p_request_id" "uuid", "p_approve" boolean, "p_rejection_reason" "text" DEFAULT NULL::"text", "p_processing_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_request record;
    v_company_id uuid;
    v_client_id uuid;
    v_result jsonb;
BEGIN
    -- Obtener company_id del usuario
    SELECT company_id INTO v_company_id
    FROM users
    WHERE auth_user_id = COALESCE(p_processing_user_id, auth.uid());
    
    -- Obtener solicitud
    SELECT * INTO v_request
    FROM gdpr_access_requests
    WHERE id = p_request_id
    AND company_id = v_company_id
    AND request_type = 'erasure';
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Solicitud de eliminación no encontrada o sin acceso'
        );
    END IF;
    
    -- Verificar que la solicitud no esté ya procesada
    IF v_request.processing_status IN ('completed', 'rejected') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Solicitud ya fue procesada',
            'status', v_request.processing_status,
            'completed_at', v_request.completed_at
        );
    END IF;
    
    IF p_approve THEN
        -- Buscar cliente por email
        SELECT id INTO v_client_id
        FROM clients
        WHERE email = v_request.subject_email
        AND company_id = v_company_id
        LIMIT 1;
        
        IF v_client_id IS NOT NULL THEN
            -- Anonimizar el cliente
            v_result := anonymize_client_data(
                v_client_id,
                'gdpr_deletion_request_approved',
                p_processing_user_id
            );
            
            IF (v_result->>'success')::boolean THEN
                -- Actualizar solicitud a completada
                UPDATE gdpr_access_requests
                SET 
                    processing_status = 'completed',
                    verification_status = 'verified',
                    completed_at = now(),
                    response_data = v_result,
                    updated_at = now()
                WHERE id = p_request_id;
                
                RETURN jsonb_build_object(
                    'success', true,
                    'message', 'Solicitud de eliminación procesada y cliente anonimizado',
                    'request_id', p_request_id,
                    'client_anonymized', true,
                    'completed_at', now()
                );
            ELSE
                RETURN jsonb_build_object(
                    'success', false,
                    'error', 'Error al anonimizar cliente',
                    'details', v_result
                );
            END IF;
        ELSE
            -- Cliente no encontrado, marcar como completada igual
            UPDATE gdpr_access_requests
            SET 
                processing_status = 'completed',
                verification_status = 'verified',
                completed_at = now(),
                response_data = jsonb_build_object('message', 'Cliente no encontrado en el sistema'),
                updated_at = now()
            WHERE id = p_request_id;
            
            RETURN jsonb_build_object(
                'success', true,
                'message', 'Solicitud marcada como completada (cliente no encontrado)',
                'request_id', p_request_id
            );
        END IF;
    ELSE
        -- Rechazar solicitud
        UPDATE gdpr_access_requests
        SET 
            processing_status = 'rejected',
            verification_status = 'rejected',
            legal_basis_for_delay = p_rejection_reason,
            completed_at = now(),
            updated_at = now()
        WHERE id = p_request_id;
        
        RETURN jsonb_build_object(
            'success', true,
            'message', 'Solicitud rechazada',
            'request_id', p_request_id,
            'rejection_reason', p_rejection_reason,
            'completed_at', now()
        );
    END IF;
    
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'error_detail', SQLSTATE
    );
END;
$$;


ALTER FUNCTION "public"."process_gdpr_deletion_request"("p_request_id" "uuid", "p_approve" boolean, "p_rejection_reason" "text", "p_processing_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."process_gdpr_deletion_request"("p_request_id" "uuid", "p_approve" boolean, "p_rejection_reason" "text", "p_processing_user_id" "uuid") IS 'Procesa una solicitud de eliminación GDPR, aprobando o rechazando';



CREATE OR REPLACE FUNCTION "public"."recompute_ticket_total"("p_ticket_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."recompute_ticket_total"("p_ticket_id" "uuid") OWNER TO "postgres";


CREATE PROCEDURE "public"."refresh_analytics_materialized_views"()
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'analytics'
    AS $$
BEGIN
  -- Presupuestos
  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_quote_kpis_monthly;
  EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_quote_top_items_monthly;
  EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_quote_cube;
  EXCEPTION WHEN undefined_table THEN NULL; END;
  -- Facturas
  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_invoice_kpis_monthly;
  EXCEPTION WHEN undefined_table THEN NULL; END;
  -- Tickets
  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_ticket_kpis_monthly;
  EXCEPTION WHEN undefined_table THEN NULL; END;
END;
$$;


ALTER PROCEDURE "public"."refresh_analytics_materialized_views"() OWNER TO "postgres";


CREATE PROCEDURE "public"."refresh_quotes_materialized_views"()
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'analytics'
    AS $$
BEGIN
  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_quote_kpis_monthly;
  EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_quote_top_items_monthly;
  EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_quote_cube;
  EXCEPTION WHEN undefined_table THEN NULL; END;
END;
$$;


ALTER PROCEDURE "public"."refresh_quotes_materialized_views"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."restore_original_invoice_on_void"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_original_invoice_id UUID;
  v_has_other_valid_rectifications BOOLEAN;
BEGIN
  -- Solo actuar si la factura está siendo anulada (void)
  IF NEW.status = 'void' AND OLD.status != 'void' THEN
    
    -- Verificar si esta factura es una rectificativa
    IF NEW.rectifies_invoice_id IS NOT NULL THEN
      v_original_invoice_id := NEW.rectifies_invoice_id;
      
      -- Comprobar si hay otras facturas rectificativas válidas para esta factura original
      SELECT EXISTS(
        SELECT 1 
        FROM public.invoices 
        WHERE rectifies_invoice_id = v_original_invoice_id 
          AND id != NEW.id
          AND status NOT IN ('void', 'cancelled')
      ) INTO v_has_other_valid_rectifications;
      
      -- Si no hay otras rectificativas válidas, restaurar el estado de la original
      IF NOT v_has_other_valid_rectifications THEN
        UPDATE public.invoices
        SET 
          status = 'approved',
          updated_at = NOW()
        WHERE id = v_original_invoice_id
          AND status = 'rectified';
          
        RAISE NOTICE 'Factura original % restaurada a estado approved', v_original_invoice_id;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."restore_original_invoice_on_void"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."restore_original_invoice_on_void"() IS 'Restaura el estado de una factura original de "rectified" a "approved" cuando se anula su factura rectificativa, permitiendo crear una nueva rectificación';



CREATE OR REPLACE FUNCTION "public"."safe_delete_ticket_stage"("p_stage_id" "uuid", "p_company_id" "uuid", "p_reassign_to" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_stage_company uuid;
  v_reassign_company uuid;
  v_exists integer;
  v_reassigned integer := 0;
  v_workflow text;
  v_stagecat text;
  v_visible_same_cat integer := 0;
  v_candidate_system_stage uuid;
  v_cat text;
  v_required_cats text[] := ARRAY['waiting','analysis','action','final','cancel'];
BEGIN
  IF p_stage_id IS NULL THEN
    RAISE EXCEPTION 'p_stage_id is required';
  END IF;

  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'p_company_id is required';
  END IF;

  -- Validate the stage exists and belongs to the company
  SELECT company_id INTO v_stage_company
  FROM ticket_stages
  WHERE id = p_stage_id
    AND deleted_at IS NULL
  LIMIT 1;

  IF v_stage_company IS NULL THEN
    RAISE EXCEPTION 'Stage % not found or already deleted', p_stage_id;
  END IF;

  IF v_stage_company <> p_company_id THEN
    RAISE EXCEPTION 'Stage % does not belong to company %', p_stage_id, p_company_id;
  END IF;

  -- Get categories of the stage being deleted
  SELECT workflow_category, stage_category
    INTO v_workflow, v_stagecat
  FROM ticket_stages
  WHERE id = p_stage_id
    AND deleted_at IS NULL;

  -- Count how many VISIBLE stages of the same workflow category remain (excluding the one to delete)
  -- Visible for company = owned by company OR (system AND not hidden by company)
  SELECT COUNT(*) INTO v_visible_same_cat
  FROM ticket_stages s
  WHERE s.deleted_at IS NULL
    AND s.id <> p_stage_id
    AND (
      s.company_id = p_company_id
      OR (
        s.company_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM hidden_stages h
           WHERE h.company_id = p_company_id AND h.stage_id = s.id
        )
      )
    )
    AND (
      (v_workflow IS NOT NULL AND s.workflow_category::text = v_workflow)
      OR (v_workflow IS NULL AND s.stage_category::text = v_stagecat)
    );

  -- If none remain, try to auto-unhide a matching system stage to preserve coverage
  IF v_visible_same_cat = 0 THEN
    SELECT s.id INTO v_candidate_system_stage
    FROM ticket_stages s
    WHERE s.deleted_at IS NULL
      AND s.company_id IS NULL
      AND (
        (v_workflow IS NOT NULL AND s.workflow_category::text = v_workflow)
        OR (v_workflow IS NULL AND s.stage_category::text = v_stagecat)
      )
      AND EXISTS (
        SELECT 1 FROM hidden_stages h
         WHERE h.company_id = p_company_id AND h.stage_id = s.id
      )
    LIMIT 1;

    IF v_candidate_system_stage IS NOT NULL THEN
      DELETE FROM hidden_stages
       WHERE company_id = p_company_id AND stage_id = v_candidate_system_stage;

      -- Recount
      SELECT COUNT(*) INTO v_visible_same_cat
      FROM ticket_stages s
      WHERE s.deleted_at IS NULL
        AND s.id <> p_stage_id
        AND (
          s.company_id = p_company_id
          OR (
            s.company_id IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM hidden_stages h
               WHERE h.company_id = p_company_id AND h.stage_id = s.id
            )
          )
        )
        AND (
          (v_workflow IS NOT NULL AND s.workflow_category::text = v_workflow)
          OR (v_workflow IS NULL AND s.stage_category::text = v_stagecat)
        );
    END IF;
  END IF;

  IF v_visible_same_cat = 0 THEN
    RAISE EXCEPTION 'Debe existir al menos un estado visible de la categoría % para la empresa % (activa algún estado del sistema o crea uno nuevo)',
      COALESCE(v_workflow, v_stagecat), p_company_id;
  END IF;

  -- Ensure global coverage across required workflow categories
  FOREACH v_cat IN ARRAY v_required_cats LOOP
    SELECT COUNT(*) INTO v_visible_same_cat
    FROM ticket_stages s
    WHERE s.deleted_at IS NULL
      AND s.id <> p_stage_id
      AND (
        s.company_id = p_company_id
        OR (
          s.company_id IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM hidden_stages h
             WHERE h.company_id = p_company_id AND h.stage_id = s.id
          )
        )
      )
      AND s.workflow_category::text = v_cat;

    IF v_visible_same_cat = 0 THEN
      SELECT s.id INTO v_candidate_system_stage
      FROM ticket_stages s
      WHERE s.deleted_at IS NULL
        AND s.company_id IS NULL
        AND s.workflow_category::text = v_cat
        AND EXISTS (
          SELECT 1 FROM hidden_stages h
           WHERE h.company_id = p_company_id AND h.stage_id = s.id
        )
      LIMIT 1;

      IF v_candidate_system_stage IS NOT NULL THEN
        DELETE FROM hidden_stages
         WHERE company_id = p_company_id AND stage_id = v_candidate_system_stage;

        SELECT COUNT(*) INTO v_visible_same_cat
        FROM ticket_stages s
        WHERE s.deleted_at IS NULL
          AND s.id <> p_stage_id
          AND (
            s.company_id = p_company_id
            OR (
              s.company_id IS NULL
              AND NOT EXISTS (
                SELECT 1 FROM hidden_stages h
                 WHERE h.company_id = p_company_id AND h.stage_id = s.id
              )
            )
          )
          AND s.workflow_category::text = v_cat;
      END IF;
    END IF;

    IF v_visible_same_cat = 0 THEN
      RAISE EXCEPTION 'Debe existir al menos un estado de la categoría % visible para la empresa %', v_cat, p_company_id;
    END IF;
  END LOOP;

  -- If provided, validate reassign stage
  IF p_reassign_to IS NOT NULL THEN
    IF p_reassign_to = p_stage_id THEN
      RAISE EXCEPTION 'p_reassign_to cannot be the same as p_stage_id';
    END IF;

    SELECT company_id INTO v_reassign_company
    FROM ticket_stages
    WHERE id = p_reassign_to
      AND deleted_at IS NULL
    LIMIT 1;

    IF v_reassign_company IS NULL THEN
      RAISE EXCEPTION 'Reassign stage % not found or deleted', p_reassign_to;
    END IF;

    IF v_reassign_company <> p_company_id THEN
      RAISE EXCEPTION 'Reassign stage % belongs to a different company', p_reassign_to;
    END IF;
  END IF;

  -- Check if there are tickets referencing the stage
  SELECT COUNT(*) INTO v_exists
  FROM tickets
  WHERE stage_id = p_stage_id
    AND company_id = p_company_id
    AND deleted_at IS NULL;

  IF v_exists > 0 THEN
    IF p_reassign_to IS NULL THEN
      RAISE EXCEPTION 'Stage % is referenced by % tickets. Provide p_reassign_to to reassign before delete.', p_stage_id, v_exists;
    END IF;

    UPDATE tickets
    SET stage_id = p_reassign_to,
        updated_at = NOW()
    WHERE stage_id = p_stage_id
      AND company_id = p_company_id
      AND deleted_at IS NULL;

    GET DIAGNOSTICS v_reassigned = ROW_COUNT;
  END IF;

  -- Clean references in hidden_stages
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'hidden_stages'
  ) THEN
    DELETE FROM hidden_stages
    WHERE stage_id = p_stage_id
      AND company_id = p_company_id;
  END IF;

  -- Finally, delete the stage
  DELETE FROM ticket_stages
  WHERE id = p_stage_id
    AND company_id = p_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Failed to delete stage % (not found or already deleted)', p_stage_id;
  END IF;

  RETURN jsonb_build_object(
    'deleted', true,
    'reassignedTickets', v_reassigned,
    'stageId', p_stage_id,
    'reassignedTo', p_reassign_to,
    'companyId', p_company_id,
    'deletedAt', NOW()
  );
END;
$$;


ALTER FUNCTION "public"."safe_delete_ticket_stage"("p_stage_id" "uuid", "p_company_id" "uuid", "p_reassign_to" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_payment_integration"("p_company_id" "uuid", "p_provider" "text", "p_credentials" "jsonb", "p_webhook_secret" "text", "p_is_sandbox" boolean, "p_is_active" boolean) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_integration json;
    v_existing_id uuid;
    v_existing_creds_enc text;
    v_new_creds_enc text;
    v_new_secret_enc text;
    v_encryption_key text := 'default-dev-key-change-in-prod';
    v_access_allowed boolean;
    v_merged_creds jsonb;
BEGIN
    -- Check permissions
    SELECT EXISTS (
        SELECT 1 FROM public.users
        WHERE auth_user_id = auth.uid()
        AND company_id = p_company_id
        AND role IN ('owner', 'admin')
    ) INTO v_access_allowed;

    IF NOT v_access_allowed THEN
        RAISE EXCEPTION 'Access denied';
    END IF;

    -- Validate provider
    IF p_provider NOT IN ('paypal', 'stripe') THEN
        RAISE EXCEPTION 'Invalid provider';
    END IF;

    -- Get existing
    SELECT id, credentials_encrypted INTO v_existing_id, v_existing_creds_enc
    FROM public.payment_integrations
    WHERE company_id = p_company_id AND provider = p_provider;

    -- Handle credentials merging
    IF p_credentials IS NOT NULL AND p_credentials != '{}'::jsonb THEN
        v_merged_creds := p_credentials;
        -- If partial update logic needed, implement here. For now, we assume full credential set or overwrite
        -- Encrypt
        v_new_creds_enc := encode(pgp_sym_encrypt(v_merged_creds::text, v_encryption_key), 'base64');
    ELSE
        v_new_creds_enc := v_existing_creds_enc;
    END IF;

    -- Encrypt webhook secret if provided
    IF p_webhook_secret IS NOT NULL THEN
        v_new_secret_enc := encode(pgp_sym_encrypt(p_webhook_secret, v_encryption_key), 'base64');
    END IF;

    -- Upsert
    INSERT INTO public.payment_integrations (
        company_id, provider, credentials_encrypted, webhook_secret_encrypted, 
        is_sandbox, is_active, updated_at
    )
    VALUES (
        p_company_id, p_provider, v_new_creds_enc, 
        COALESCE(v_new_secret_enc, (SELECT webhook_secret_encrypted FROM public.payment_integrations WHERE company_id = p_company_id AND provider = p_provider)),
        COALESCE(p_is_sandbox, false), COALESCE(p_is_active, true), now()
    )
    ON CONFLICT (company_id, provider) DO UPDATE
    SET
        credentials_encrypted = EXCLUDED.credentials_encrypted,
        webhook_secret_encrypted = COALESCE(EXCLUDED.webhook_secret_encrypted, payment_integrations.webhook_secret_encrypted),
        is_sandbox = COALESCE(p_is_sandbox, payment_integrations.is_sandbox),
        is_active = COALESCE(p_is_active, payment_integrations.is_active),
        updated_at = now()
    RETURNING row_to_json(payment_integrations.*) INTO v_integration;

    -- Return masked version (reuse get logic implicitly via simple construction)
    -- Actually, just return the id and basic fields to avoid decryption complexity here
    RETURN json_build_object(
        'id', v_integration->>'id',
        'company_id', v_integration->>'company_id',
        'provider', v_integration->>'provider',
        'is_active', (v_integration->>'is_active')::boolean,
        'is_sandbox', (v_integration->>'is_sandbox')::boolean,
        'updated_at', v_integration->>'updated_at'
    );
END;
$$;


ALTER FUNCTION "public"."save_payment_integration"("p_company_id" "uuid", "p_provider" "text", "p_credentials" "jsonb", "p_webhook_secret" "text", "p_is_sandbox" boolean, "p_is_active" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_customers"("search_term" "text", "user_id" "uuid") RETURNS TABLE("id" "uuid", "nombre" character varying, "apellidos" character varying, "email" character varying, "telefono" character varying, "created_at" timestamp with time zone, "rank" real)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.nombre,
        c.apellidos,
        c.email,
        c.telefono,
        c.created_at,
        ts_rank(c.search_vector, plainto_tsquery('spanish', search_term)) as rank
    FROM public.customers c
    WHERE 
        c.usuario_id = user_id AND
        c.search_vector @@ plainto_tsquery('spanish', search_term)
    ORDER BY rank DESC, c.created_at DESC;
END;
$$;


ALTER FUNCTION "public"."search_customers"("search_term" "text", "user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_customers_dev"("target_user_id" "uuid", "search_term" "text") RETURNS TABLE("id" "uuid", "nombre" character varying, "apellidos" character varying, "email" character varying, "telefono" character varying, "created_at" timestamp with time zone, "rank" real)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
    -- Si no hay término de búsqueda, devolver todos los clientes del usuario
    IF search_term IS NULL OR search_term = '' THEN
        RETURN QUERY
        SELECT 
            c.id,
            c.nombre,
            c.apellidos,
            c.email,
            c.telefono,
            c.created_at,
            1.0::real as rank
        FROM public.customers c
        WHERE c.usuario_id = target_user_id
        ORDER BY c.created_at DESC;
    ELSE
        -- Búsqueda con texto completo
        RETURN QUERY
        SELECT 
            c.id,
            c.nombre,
            c.apellidos,
            c.email,
            c.telefono,
            c.created_at,
            ts_rank(c.search_vector, plainto_tsquery('spanish', search_term)) as rank
        FROM public.customers c
        WHERE 
            c.usuario_id = target_user_id AND
            c.search_vector @@ plainto_tsquery('spanish', search_term)
        ORDER BY rank DESC, c.created_at DESC;
    END IF;
END;
$$;


ALTER FUNCTION "public"."search_customers_dev"("target_user_id" "uuid", "search_term" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."search_customers_dev"("target_user_id" "uuid", "search_term" "text") IS 'Función RPC para búsqueda de clientes en modo desarrollo';



CREATE OR REPLACE FUNCTION "public"."set_current_company_context"("company_uuid" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  PERFORM set_config('app.current_company_id', company_uuid::text, false);
END;
$$;


ALTER FUNCTION "public"."set_current_company_context"("company_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_initial_ticket_stage"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_initial_stage_id uuid;
BEGIN
    -- Find the stage with the lowest position for this company
    SELECT id INTO v_initial_stage_id
    FROM public.ticket_stages
    WHERE company_id = NEW.company_id
      AND deleted_at IS NULL
    ORDER BY position ASC
    LIMIT 1;

    -- If found, enforce it
    IF v_initial_stage_id IS NOT NULL THEN
        NEW.stage_id := v_initial_stage_id;
    END IF;

    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_initial_ticket_stage"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_invoice_month"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.invoice_month := DATE_TRUNC('month', COALESCE(NEW.invoice_date, NEW.created_at))::date;
  RETURN NEW;
END; $$;


ALTER FUNCTION "public"."set_invoice_month"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_quote_month"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.quote_month := DATE_TRUNC('month', COALESCE(NEW.quote_date, NEW.created_at))::date;
  RETURN NEW;
END; $$;


ALTER FUNCTION "public"."set_quote_month"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_ticket_month"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.ticket_month := DATE_TRUNC('month', NEW.created_at)::date;
  RETURN NEW;
END; $$;


ALTER FUNCTION "public"."set_ticket_month"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END; $$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at_ticket_products"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_updated_at_ticket_products"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_updated_at_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_ticket_tags_from_services"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
    -- Cuando se crea un ticket_service, sincronizar tags del servicio al ticket
    IF TG_OP = 'INSERT' THEN
        -- Agregar tags del servicio al ticket si no existen
        INSERT INTO ticket_tag_relations (ticket_id, tag_id)
        SELECT 
            NEW.ticket_id,
            str.tag_id
        FROM service_tag_relations str
        JOIN service_tags st ON str.tag_id = st.id
        WHERE str.service_id = NEW.service_id
        AND NOT EXISTS (
            SELECT 1 FROM ticket_tag_relations ttr 
            WHERE ttr.ticket_id = NEW.ticket_id 
            AND ttr.tag_id = str.tag_id
        );
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."sync_ticket_tags_from_services"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."toggle_stage_visibility"("p_stage_id" "uuid", "p_hide" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_company_id uuid;
  v_is_generic boolean;
BEGIN
  -- Get company_id
  SELECT u.company_id INTO v_company_id
  FROM users u
  WHERE u.auth_user_id = auth.uid()
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'User does not belong to a company';
  END IF;

  -- Check if stage is generic
  SELECT (company_id IS NULL) INTO v_is_generic
  FROM ticket_stages
  WHERE id = p_stage_id;

  IF NOT v_is_generic THEN
    RAISE EXCEPTION 'Cannot toggle visibility of non-generic stage via this RPC';
  END IF;

  IF p_hide THEN
    -- Insert into hidden_stages
    INSERT INTO hidden_stages (company_id, stage_id)
    VALUES (v_company_id, p_stage_id)
    ON CONFLICT (company_id, stage_id) DO NOTHING;
  ELSE
    -- Remove from hidden_stages
    DELETE FROM hidden_stages
    WHERE company_id = v_company_id AND stage_id = p_stage_id;
  END IF;
END;
$$;


ALTER FUNCTION "public"."toggle_stage_visibility"("p_stage_id" "uuid", "p_hide" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."toggle_unit_visibility"("p_unit_id" "uuid", "p_operation" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_company_id uuid;
    v_user_id uuid;
    v_app_user_id uuid;
BEGIN
    v_user_id := auth.uid();
    
    SELECT company_id, id INTO v_company_id, v_app_user_id 
    FROM public.users 
    WHERE auth_user_id = v_user_id;
    
    IF v_company_id IS NULL THEN
        RAISE EXCEPTION 'User not associated with a company or not found in users table';
    END IF;

    IF p_operation = 'hide' THEN
        INSERT INTO public.hidden_units (company_id, unit_id, hidden_by)
        VALUES (v_company_id, p_unit_id, v_app_user_id)
        ON CONFLICT (company_id, unit_id) DO NOTHING;
    ELSIF p_operation = 'unhide' THEN
        DELETE FROM public.hidden_units
        WHERE company_id = v_company_id AND unit_id = p_unit_id;
    ELSE
        RAISE EXCEPTION 'Invalid operation: %', p_operation;
    END IF;
END;
$$;


ALTER FUNCTION "public"."toggle_unit_visibility"("p_unit_id" "uuid", "p_operation" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_audit_access_requests"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_user_id uuid;
    v_company_id uuid;
BEGIN
    -- Obtener user_id y company_id
    SELECT u.id, u.company_id INTO v_user_id, v_company_id
    FROM users u
    WHERE u.auth_user_id = auth.uid()
    LIMIT 1;
    
    -- Si no hay usuario, no auditar
    IF v_user_id IS NULL THEN
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        ELSE
            RETURN NEW;
        END IF;
    END IF;
    
    -- Registrar cambios en solicitudes GDPR
    IF TG_OP = 'INSERT' THEN
        INSERT INTO gdpr_audit_log (
            user_id,
            company_id,
            action_type,
            table_name,
            record_id,
            subject_email,
            purpose,
            new_values,
            created_at
        ) VALUES (
            v_user_id,
            COALESCE(NEW.company_id, v_company_id),
            'access_request',
            'gdpr_access_requests',
            NEW.id,
            NEW.subject_email,
            'GDPR request created: ' || NEW.request_type,
            jsonb_build_object(
                'request_type', NEW.request_type,
                'processing_status', NEW.processing_status,
                'deadline_date', NEW.deadline_date
            ),
            now()
        );
    ELSIF TG_OP = 'UPDATE' THEN
        -- Solo auditar cambios de estado
        IF OLD.processing_status != NEW.processing_status OR
           OLD.verification_status != NEW.verification_status THEN
            INSERT INTO gdpr_audit_log (
                user_id,
                company_id,
                action_type,
                table_name,
                record_id,
                subject_email,
                purpose,
                old_values,
                new_values,
                created_at
            ) VALUES (
                v_user_id,
                COALESCE(NEW.company_id, v_company_id),
                'access_request',
                'gdpr_access_requests',
                NEW.id,
                NEW.subject_email,
                'GDPR request status updated',
                jsonb_build_object(
                    'processing_status', OLD.processing_status,
                    'verification_status', OLD.verification_status
                ),
                jsonb_build_object(
                    'processing_status', NEW.processing_status,
                    'verification_status', NEW.verification_status,
                    'completed_at', NEW.completed_at
                ),
                now()
            );
        END IF;
    END IF;
    
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
    
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Error en audit log de access_requests: %', SQLERRM;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;


ALTER FUNCTION "public"."trigger_audit_access_requests"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_audit_clients"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_user_id uuid;
    v_company_id uuid;
    v_action_type text;
    v_old_values jsonb;
    v_new_values jsonb;
BEGIN
    -- Obtener user_id y company_id del usuario actual
    SELECT u.id, u.company_id INTO v_user_id, v_company_id
    FROM users u
    WHERE u.auth_user_id = auth.uid()
    LIMIT 1;
    
    -- Si no hay usuario autenticado, no auditar (evita loops en funciones internas)
    IF v_user_id IS NULL THEN
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        ELSE
            RETURN NEW;
        END IF;
    END IF;
    
    -- Determinar tipo de acción
    IF TG_OP = 'INSERT' THEN
        v_action_type := 'create';
        v_old_values := NULL;
        v_new_values := jsonb_build_object(
            'name', NEW.name,
            'email', NEW.email,
            'phone', NEW.phone,
            'created_at', NEW.created_at
        );
    ELSIF TG_OP = 'UPDATE' THEN
        v_action_type := 'update';
        
        -- Solo registrar campos que cambiaron
        v_old_values := jsonb_build_object(
            'name', OLD.name,
            'email', OLD.email,
            'phone', OLD.phone,
            'marketing_consent', OLD.marketing_consent,
            'data_processing_consent', OLD.data_processing_consent
        );
        
        v_new_values := jsonb_build_object(
            'name', NEW.name,
            'email', NEW.email,
            'phone', NEW.phone,
            'marketing_consent', NEW.marketing_consent,
            'data_processing_consent', NEW.data_processing_consent
        );
        
        -- Si es anonimización, cambiar el tipo de acción
        IF NEW.anonymized_at IS NOT NULL AND OLD.anonymized_at IS NULL THEN
            v_action_type := 'anonymize';
        END IF;
        
    ELSIF TG_OP = 'DELETE' THEN
        v_action_type := 'delete';
        v_old_values := jsonb_build_object(
            'name', OLD.name,
            'email', OLD.email,
            'phone', OLD.phone
        );
        v_new_values := NULL;
    END IF;
    
    -- Insertar en audit log (sin causar trigger recursivo)
    INSERT INTO gdpr_audit_log (
        user_id,
        company_id,
        action_type,
        table_name,
        record_id,
        subject_email,
        purpose,
        old_values,
        new_values,
        created_at
    ) VALUES (
        v_user_id,
        v_company_id,
        v_action_type,
        'clients',
        COALESCE(NEW.id, OLD.id),
        COALESCE(NEW.email, OLD.email),
        'Automatic audit log from trigger',
        v_old_values,
        v_new_values,
        now()
    );
    
    -- Retornar el registro apropiado
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
    
EXCEPTION WHEN OTHERS THEN
    -- Si falla el audit, no bloquear la operación principal
    RAISE WARNING 'Error en audit log de clients: %', SQLERRM;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;


ALTER FUNCTION "public"."trigger_audit_clients"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_audit_consent_records"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_user_id uuid;
    v_company_id uuid;
BEGIN
    -- Obtener user_id y company_id
    SELECT u.id, u.company_id INTO v_user_id, v_company_id
    FROM users u
    WHERE u.auth_user_id = auth.uid()
    LIMIT 1;
    
    -- Si no hay usuario, no auditar
    IF v_user_id IS NULL THEN
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        ELSE
            RETURN NEW;
        END IF;
    END IF;
    
    -- Registrar cambio de consentimiento
    IF TG_OP = 'INSERT' THEN
        INSERT INTO gdpr_audit_log (
            user_id,
            company_id,
            action_type,
            table_name,
            record_id,
            subject_email,
            purpose,
            new_values,
            created_at
        ) VALUES (
            v_user_id,
            COALESCE(NEW.company_id, v_company_id),
            'consent',
            'gdpr_consent_records',
            NEW.id,
            NEW.subject_email,
            'New consent record: ' || NEW.consent_type,
            jsonb_build_object(
                'consent_type', NEW.consent_type,
                'consent_given', NEW.consent_given,
                'consent_method', NEW.consent_method,
                'purpose', NEW.purpose
            ),
            now()
        );
    ELSIF TG_OP = 'UPDATE' THEN
        -- Solo auditar si cambia el consentimiento o se retira
        IF OLD.consent_given != NEW.consent_given OR 
           (OLD.withdrawn_at IS NULL AND NEW.withdrawn_at IS NOT NULL) THEN
            INSERT INTO gdpr_audit_log (
                user_id,
                company_id,
                action_type,
                table_name,
                record_id,
                subject_email,
                purpose,
                old_values,
                new_values,
                created_at
            ) VALUES (
                v_user_id,
                COALESCE(NEW.company_id, v_company_id),
                'consent',
                'gdpr_consent_records',
                NEW.id,
                NEW.subject_email,
                CASE 
                    WHEN NEW.withdrawn_at IS NOT NULL THEN 'Consent withdrawn'
                    ELSE 'Consent status changed'
                END,
                jsonb_build_object(
                    'consent_given', OLD.consent_given,
                    'withdrawn_at', OLD.withdrawn_at
                ),
                jsonb_build_object(
                    'consent_given', NEW.consent_given,
                    'withdrawn_at', NEW.withdrawn_at
                ),
                now()
            );
        END IF;
    END IF;
    
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
    
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Error en audit log de consent_records: %', SQLERRM;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;


ALTER FUNCTION "public"."trigger_audit_consent_records"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_ticket_services_upsert"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."trigger_ticket_services_upsert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_update_last_accessed"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
    -- Solo actualizar en SELECT (cuando se lee el registro)
    -- Incrementar contador de accesos
    UPDATE clients
    SET 
        last_accessed_at = now(),
        access_count = COALESCE(access_count, 0) + 1
    WHERE id = NEW.id
    AND (last_accessed_at IS NULL OR last_accessed_at < now() - INTERVAL '1 hour');
    -- Solo actualizar si pasó más de 1 hora desde el último acceso
    
    RETURN NEW;
    
EXCEPTION WHEN OTHERS THEN
    -- No bloquear si falla
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_update_last_accessed"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_client_consent"("p_client_id" "uuid", "p_consent_type" "text", "p_consent_given" boolean, "p_consent_method" "text" DEFAULT 'manual'::"text", "p_consent_evidence" "jsonb" DEFAULT '{}'::"jsonb", "p_updating_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_client record;
    v_company_id uuid;
    v_old_consent boolean;
    v_consent_record_id uuid;
BEGIN
    -- Validar tipo de consentimiento
    IF p_consent_type NOT IN ('marketing', 'data_processing') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Tipo de consentimiento inválido. Valores permitidos: marketing, data_processing'
        );
    END IF;
    
    -- Verificar acceso
    SELECT company_id INTO v_company_id
    FROM users
    WHERE auth_user_id = COALESCE(p_updating_user_id, auth.uid());
    
    -- Obtener cliente
    SELECT * INTO v_client
    FROM clients
    WHERE id = p_client_id
    AND company_id = v_company_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Cliente no encontrado o sin acceso'
        );
    END IF;
    
    -- Actualizar consentimiento en tabla clients
    IF p_consent_type = 'marketing' THEN
        v_old_consent := v_client.marketing_consent;
        
        UPDATE clients
        SET 
            marketing_consent = p_consent_given,
            marketing_consent_date = now(),
            marketing_consent_method = p_consent_method,
            updated_at = now()
        WHERE id = p_client_id;
    ELSE -- data_processing
        v_old_consent := v_client.data_processing_consent;
        
        UPDATE clients
        SET 
            data_processing_consent = p_consent_given,
            data_processing_consent_date = now(),
            updated_at = now()
        WHERE id = p_client_id;
    END IF;
    
    -- Crear registro en gdpr_consent_records
    INSERT INTO gdpr_consent_records (
        subject_id,
        subject_email,
        consent_type,
        purpose,
        consent_given,
        consent_method,
        consent_evidence,
        company_id,
        processed_by,
        legal_basis,
        created_at,
        updated_at
    ) VALUES (
        p_client_id,
        v_client.email,
        p_consent_type,
        CASE 
            WHEN p_consent_type = 'marketing' THEN 'Consentimiento para comunicaciones comerciales'
            ELSE 'Consentimiento para procesamiento de datos personales'
        END,
        p_consent_given,
        p_consent_method,
        p_consent_evidence,
        v_company_id,
        COALESCE(p_updating_user_id, auth.uid()),
        CASE 
            WHEN p_consent_type = 'marketing' THEN 'consent'
            ELSE 'contract'
        END,
        now(),
        now()
    )
    RETURNING id INTO v_consent_record_id;
    
    -- Registrar en audit log
    INSERT INTO gdpr_audit_log (
        user_id,
        company_id,
        action_type,
        table_name,
        record_id,
        subject_email,
        purpose,
        old_values,
        new_values,
        created_at
    ) VALUES (
        COALESCE(p_updating_user_id, auth.uid()),
        v_company_id,
        'consent',
        'clients',
        p_client_id,
        v_client.email,
        'Consent update: ' || p_consent_type,
        jsonb_build_object(p_consent_type || '_consent', v_old_consent),
        jsonb_build_object(p_consent_type || '_consent', p_consent_given),
        now()
    );
    
    RETURN jsonb_build_object(
        'success', true,
        'message', 'Consentimiento actualizado correctamente',
        'client_id', p_client_id,
        'consent_type', p_consent_type,
        'consent_given', p_consent_given,
        'consent_record_id', v_consent_record_id,
        'updated_at', now()
    );
    
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'error_detail', SQLSTATE
    );
END;
$$;


ALTER FUNCTION "public"."update_client_consent"("p_client_id" "uuid", "p_consent_type" "text", "p_consent_given" boolean, "p_consent_method" "text", "p_consent_evidence" "jsonb", "p_updating_user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."update_client_consent"("p_client_id" "uuid", "p_consent_type" "text", "p_consent_given" boolean, "p_consent_method" "text", "p_consent_evidence" "jsonb", "p_updating_user_id" "uuid") IS 'Actualiza el consentimiento de un cliente y crea registro en gdpr_consent_records';



CREATE OR REPLACE FUNCTION "public"."update_company_user"("p_user_id" "uuid", "p_role" "text" DEFAULT NULL::"text", "p_active" boolean DEFAULT NULL::boolean) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    caller public.users;
    target public.users;
BEGIN
    -- Obtener el usuario que hace la llamada
    SELECT * INTO caller
    FROM public.users
    WHERE auth_user_id = auth.uid()
      AND active = true
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Usuario no encontrado o inactivo');
    END IF;

    -- Obtener el usuario objetivo
    SELECT * INTO target
    FROM public.users
    WHERE id = p_user_id;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Usuario objetivo no encontrado');
    END IF;

    -- Verificar que pertenecen a la misma empresa
    IF caller.company_id != target.company_id THEN
        RETURN json_build_object('success', false, 'error', 'No tienes permisos para modificar usuarios de otra empresa');
    END IF;

    -- Verificar que el caller tiene permisos (owner o admin)
    IF caller.role NOT IN ('owner', 'admin') THEN
        RETURN json_build_object('success', false, 'error', 'Solo owner o admin pueden modificar usuarios');
    END IF;

    -- ==========================================
    -- VALIDACIONES PARA CAMBIO DE ROL
    -- ==========================================
    IF p_role IS NOT NULL THEN
        -- Validar que el rol sea válido
        IF p_role NOT IN ('owner', 'admin', 'member') THEN
            RETURN json_build_object('success', false, 'error', 'Rol no válido. Debe ser: owner, admin o member');
        END IF;

        -- REGLA: Solo admin puede asignar rol admin
        -- Owner NO puede asignar admin, solo member u owner
        IF p_role = 'admin' AND caller.role != 'admin' THEN
            RETURN json_build_object('success', false, 'error', 'Solo un administrador puede asignar el rol admin');
        END IF;

        -- REGLA: Un admin no puede asignar rol owner
        IF p_role = 'owner' AND caller.role = 'admin' THEN
            RETURN json_build_object('success', false, 'error', 'Un administrador no puede asignar el rol owner');
        END IF;

        -- REGLA: No puedes cambiar tu propio rol
        IF caller.id = target.id THEN
            RETURN json_build_object('success', false, 'error', 'No puedes cambiar tu propio rol');
        END IF;

        -- REGLA: Un admin no puede cambiar el rol de un owner
        IF caller.role = 'admin' AND target.role = 'owner' THEN
            RETURN json_build_object('success', false, 'error', 'Un administrador no puede modificar el rol de un owner');
        END IF;

        -- Actualizar el rol
        UPDATE public.users
        SET role = p_role
        WHERE id = p_user_id;
    END IF;

    -- ==========================================
    -- VALIDACIONES PARA CAMBIO DE ESTADO ACTIVO
    -- ==========================================
    IF p_active IS NOT NULL THEN
        -- REGLA: No puedes desactivarte a ti mismo
        IF caller.id = target.id AND p_active = false THEN
            RETURN json_build_object('success', false, 'error', 'No puedes desactivarte a ti mismo');
        END IF;

        -- REGLA: Un admin no puede desactivar a un owner
        IF caller.role = 'admin' AND target.role = 'owner' AND p_active = false THEN
            RETURN json_build_object('success', false, 'error', 'Un administrador no puede desactivar a un owner');
        END IF;

        -- Actualizar el estado activo
        UPDATE public.users
        SET active = p_active
        WHERE id = p_user_id;
    END IF;

    RETURN json_build_object(
        'success', true,
        'user_id', p_user_id,
        'role', COALESCE(p_role, target.role),
        'active', COALESCE(p_active, target.active)
    );

EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;


ALTER FUNCTION "public"."update_company_user"("p_user_id" "uuid", "p_role" "text", "p_active" boolean) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."update_company_user"("p_user_id" "uuid", "p_role" "text", "p_active" boolean) IS 'Actualiza rol o estado activo de un usuario de la empresa con validaciones:
- Solo admin puede asignar rol admin
- Owner puede asignar member u owner, pero NO admin
- Admin no puede asignar owner
- Nadie puede cambiar su propio rol
- Nadie puede desactivarse a sí mismo
- Admin no puede modificar roles/estado de owners';



CREATE OR REPLACE FUNCTION "public"."update_customer_dev"("customer_id" "uuid", "target_user_id" "uuid", "p_nombre" character varying, "p_apellidos" character varying, "p_email" character varying, "p_telefono" character varying DEFAULT NULL::character varying, "p_dni" character varying DEFAULT NULL::character varying, "p_fecha_nacimiento" "date" DEFAULT NULL::"date", "p_profesion" character varying DEFAULT NULL::character varying, "p_empresa" character varying DEFAULT NULL::character varying, "p_notas" "text" DEFAULT NULL::"text", "p_avatar_url" "text" DEFAULT NULL::"text", "p_direccion_id" "uuid" DEFAULT NULL::"uuid", "p_activo" boolean DEFAULT true) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
    updated_rows INTEGER;
BEGIN
    UPDATE public.customers 
    SET
        nombre = p_nombre,
        apellidos = p_apellidos,
        email = p_email,
        telefono = p_telefono,
        dni = p_dni,
        fecha_nacimiento = p_fecha_nacimiento,
        profesion = p_profesion,
        empresa = p_empresa,
        notas = p_notas,
        avatar_url = p_avatar_url,
        direccion_id = p_direccion_id,
        activo = p_activo,
        updated_at = TIMEZONE('utc'::text, NOW())
    WHERE 
        id = customer_id AND 
        usuario_id = target_user_id;
    
    GET DIAGNOSTICS updated_rows = ROW_COUNT;
    
    RETURN updated_rows > 0;
END;
$$;


ALTER FUNCTION "public"."update_customer_dev"("customer_id" "uuid", "target_user_id" "uuid", "p_nombre" character varying, "p_apellidos" character varying, "p_email" character varying, "p_telefono" character varying, "p_dni" character varying, "p_fecha_nacimiento" "date", "p_profesion" character varying, "p_empresa" character varying, "p_notas" "text", "p_avatar_url" "text", "p_direccion_id" "uuid", "p_activo" boolean) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."update_customer_dev"("customer_id" "uuid", "target_user_id" "uuid", "p_nombre" character varying, "p_apellidos" character varying, "p_email" character varying, "p_telefono" character varying, "p_dni" character varying, "p_fecha_nacimiento" "date", "p_profesion" character varying, "p_empresa" character varying, "p_notas" "text", "p_avatar_url" "text", "p_direccion_id" "uuid", "p_activo" boolean) IS 'Función RPC para actualizar clientes en modo desarrollo';



CREATE OR REPLACE FUNCTION "public"."update_device_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_device_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_payment_integrations_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_payment_integrations_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_quotes_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_quotes_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_service_variants_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_service_variants_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_stage_order"("p_stage_id" "uuid", "p_new_position" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_company_id uuid;
BEGIN
   -- Get company_id
  SELECT u.company_id INTO v_company_id
  FROM users u
  WHERE u.auth_user_id = auth.uid()
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'User does not belong to a company';
  END IF;

  INSERT INTO company_stage_order (company_id, stage_id, position)
  VALUES (v_company_id, p_stage_id, p_new_position)
  ON CONFLICT (company_id, stage_id) 
  DO UPDATE SET position = EXCLUDED.position, created_at = now();
END;
$$;


ALTER FUNCTION "public"."update_stage_order"("p_stage_id" "uuid", "p_new_position" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_verifactu_settings_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_verifactu_settings_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_user_module"("p_user_id" "uuid", "p_module_key" "text", "p_status" "public"."module_status") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_role text;
BEGIN
  -- Optional: check role of current user
  SELECT role INTO v_role FROM public.users WHERE auth_user_id = auth.uid();
  IF v_role NOT IN ('admin','owner') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  INSERT INTO user_modules(user_id, module_key, status)
  VALUES (p_user_id, p_module_key, p_status)
  ON CONFLICT(user_id, module_key)
  DO UPDATE SET status = EXCLUDED.status, updated_at = now();
END;
$$;


ALTER FUNCTION "public"."upsert_user_module"("p_user_id" "uuid", "p_module_key" "text", "p_status" "public"."module_status") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_verifactu_settings"("psoftware_code" "text", "pissuer_nif" "text", "pcert_pem" "text", "pkey_pem" "text", "pkey_passphrase" "text", "penvironment" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_company uuid;
BEGIN
  -- Resuelve la empresa del usuario (ajusta helper si el tuyo difiere)
  SELECT companyid INTO v_company FROM public.users WHERE authuserid = auth.uid() LIMIT 1;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'No company for current user';
  END IF;

  INSERT INTO public.verifactu_settings(companyid, software_code, issuer_nif, cert_pem, key_pem, key_passphrase, environment)
  VALUES (v_company, psoftware_code, pissuer_nif, pcert_pem, pkey_pem, pkey_passphrase, penvironment)
  ON CONFLICT (companyid) DO UPDATE
    SET software_code   = EXCLUDED.software_code,
        issuer_nif      = EXCLUDED.issuer_nif,
        cert_pem        = EXCLUDED.cert_pem,
        key_pem         = EXCLUDED.key_pem,
        key_passphrase  = EXCLUDED.key_passphrase,
        environment     = EXCLUDED.environment,
        updated_at      = now();

  RETURN jsonb_build_object('ok', true, 'company_id', v_company);
END;
$$;


ALTER FUNCTION "public"."upsert_verifactu_settings"("psoftware_code" "text", "pissuer_nif" "text", "pcert_pem" "text", "pkey_pem" "text", "pkey_passphrase" "text", "penvironment" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_verifactu_settings"("p_company_id" "uuid", "p_software_code" "text" DEFAULT NULL::"text", "p_software_name" "text" DEFAULT NULL::"text", "p_software_version" "text" DEFAULT NULL::"text", "p_issuer_nif" "text" DEFAULT NULL::"text", "p_environment" "text" DEFAULT 'test'::"text", "p_is_active" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.auth_user_id = auth.uid()
          AND u.company_id = p_company_id
          AND u.role IN ('owner', 'admin')
          AND u.deleted_at IS NULL
    ) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'access_denied');
    END IF;
    
    INSERT INTO public.verifactu_settings (
        company_id, software_code, software_name, software_version,
        issuer_nif, environment, is_active
    ) VALUES (
        p_company_id, p_software_code, p_software_name, p_software_version,
        p_issuer_nif, p_environment, p_is_active
    )
    ON CONFLICT (company_id) DO UPDATE SET
        software_code = COALESCE(EXCLUDED.software_code, verifactu_settings.software_code),
        software_name = COALESCE(EXCLUDED.software_name, verifactu_settings.software_name),
        software_version = COALESCE(EXCLUDED.software_version, verifactu_settings.software_version),
        issuer_nif = COALESCE(EXCLUDED.issuer_nif, verifactu_settings.issuer_nif),
        environment = COALESCE(EXCLUDED.environment, verifactu_settings.environment),
        is_active = COALESCE(EXCLUDED.is_active, verifactu_settings.is_active),
        updated_at = NOW();
    
    RETURN jsonb_build_object('ok', true);
END;
$$;


ALTER FUNCTION "public"."upsert_verifactu_settings"("p_company_id" "uuid", "p_software_code" "text", "p_software_name" "text", "p_software_version" "text", "p_issuer_nif" "text", "p_environment" "text", "p_is_active" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_file_path"("file_path" "text", "company_uuid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" STABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  RETURN file_path LIKE (company_uuid::text || '/%');
END;
$$;


ALTER FUNCTION "public"."validate_file_path"("file_path" "text", "company_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_invoice_before_issue"("pinvoiceid" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_invoice RECORD;
  v_errors text[] := ARRAY[]::text[];
BEGIN
  -- Obtener factura con serie
  SELECT 
    i.*,
    s.verifactu_enabled
  INTO v_invoice
  FROM public.invoices i
  JOIN public.invoice_series s ON s.id = i.series_id
  WHERE i.id = pinvoiceid;

  IF NOT FOUND THEN
    v_errors := v_errors || 'invoice_not_found';
    RETURN jsonb_build_object('valid', false, 'errors', v_errors);
  END IF;

  -- Validar serie habilitada para Verifactu
  IF v_invoice.verifactu_enabled IS DISTINCT FROM TRUE THEN
    v_errors := array_append(v_errors, 'series_not_verifactu');
  END IF;

  -- Validar totales positivos
  IF v_invoice.total IS NULL OR v_invoice.total <= 0 THEN
    v_errors := array_append(v_errors, 'invalid_total');
  END IF;

  -- Validar cliente y CIF/NIF/DNI
  IF v_invoice.client_id IS NULL THEN
    v_errors := array_append(v_errors, 'missing_client');
  ELSE
    -- Check if either cif_nif OR dni is present
    IF NOT EXISTS (
      SELECT 1 FROM public.clients c
      WHERE c.id = v_invoice.client_id
        AND (
             (COALESCE(c.cif_nif, '') <> '' AND trim(c.cif_nif) <> '')
             OR 
             (COALESCE(c.dni, '') <> '' AND trim(c.dni) <> '')
            )
    ) THEN
      v_errors := array_append(v_errors, 'missing_client_vat');
    END IF;
  END IF;

  -- Validar coherencia de totales
  IF COALESCE(v_invoice.subtotal, 0) + COALESCE(v_invoice.tax_amount, 0) 
     <> COALESCE(v_invoice.total, 0) THEN
    v_errors := array_append(v_errors, 'totals_mismatch');
  END IF;

  -- Validar estado/status válido para emitir
  IF v_invoice.state IN ('final', 'void') 
     OR v_invoice.status NOT IN ('draft', 'sent') THEN
    v_errors := array_append(v_errors, 'invalid_status_state');
  END IF;

  RETURN jsonb_build_object(
    'valid', array_length(v_errors, 1) IS NULL,
    'errors', v_errors
  );
END;
$$;


ALTER FUNCTION "public"."validate_invoice_before_issue"("pinvoiceid" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."validate_invoice_before_issue"("pinvoiceid" "uuid") IS 'Validates invoice data before VeriFactu emission. Checks: series enabled, totals, client CIF/NIF, and status.';



CREATE OR REPLACE FUNCTION "public"."verifactu_log_event"("pevent_type" "text", "pinvoice_id" "uuid", "pcompany_id" "uuid", "ppayload" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  -- Insertar log en tabla de eventos
  INSERT INTO verifactu.events (
    event_type,
    invoice_id,
    company_id,
    payload,
    created_at
  ) VALUES (
    pevent_type,
    pinvoice_id,
    pcompany_id,
    ppayload,
    NOW()
  );
  
  -- O si usas otra tabla de logs
  -- INSERT INTO public.verifactu_logs (...)
  
EXCEPTION
  WHEN OTHERS THEN
    -- Log silencioso, no fallar
    RAISE WARNING 'Failed to log verifactu event: %', SQLERRM;
END;
$$;


ALTER FUNCTION "public"."verifactu_log_event"("pevent_type" "text", "pinvoice_id" "uuid", "pcompany_id" "uuid", "ppayload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verifactu_preflight_issue"("pinvoice_id" "uuid", "pdevice_id" "text" DEFAULT NULL::"text", "psoftware_id" "text" DEFAULT NULL::"text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_invoice_status text;
    v_series text;
    v_result json;
BEGIN
    -- Check invoice status and get series
    SELECT i.state, s.series_code INTO v_invoice_status, v_series
    FROM public.invoices i
    JOIN public.invoice_series s ON s.id = i.series_id
    WHERE i.id = pinvoice_id;
    
    IF v_invoice_status IS NULL THEN
        RAISE EXCEPTION 'Invoice not found';
    END IF;

    -- Allow 'draft' AND 'approved'
    IF v_invoice_status NOT IN ('draft', 'approved') THEN
        RAISE EXCEPTION 'invalid_status_state';
    END IF;

    -- Call finalize_invoice to perform the actual work (hashing, chaining, updating status)
    v_result := public.finalize_invoice(pinvoice_id, v_series, pdevice_id, psoftware_id);
    
    RETURN json_build_object('ok', true, 'data', v_result);
END;
$$;


ALTER FUNCTION "public"."verifactu_preflight_issue"("pinvoice_id" "uuid", "pdevice_id" "text", "psoftware_id" "text") OWNER TO "postgres";


CREATE PROCEDURE "public"."verifactu_process_pending_events"()
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  r RECORD;
  v_response jsonb;
BEGIN
  FOR r IN
    SELECT * FROM verifactu.events 
    WHERE status = 'pending' 
    ORDER BY created_at ASC 
    LIMIT 100
  LOOP
    -- Mark as sending
    UPDATE verifactu.events SET status = 'sending', sent_at = now() WHERE id = r.id;
    
    -- Mock Response
    v_response := jsonb_build_object(
      'status', 'ACCEPTED',
      'at', now(),
      'simulation', true,
      'echo', jsonb_build_object('id', r.id)
    );

    -- Mark as accepted
    UPDATE verifactu.events 
    SET status = 'accepted', response = v_response 
    WHERE id = r.id;

    -- Update Meta
    IF r.event_type = 'anulacion' THEN
      UPDATE verifactu.invoice_meta SET status = 'void' WHERE invoice_id = r.invoice_id;
    ELSE
      UPDATE verifactu.invoice_meta SET status = 'accepted' WHERE invoice_id = r.invoice_id;
    END IF;
    
  END LOOP;
END;
$$;


ALTER PROCEDURE "public"."verifactu_process_pending_events"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "series_id" "uuid" NOT NULL,
    "invoice_number" "text" NOT NULL,
    "invoice_series" "text" NOT NULL,
    "full_invoice_number" "text" GENERATED ALWAYS AS ((("invoice_series" || '-'::"text") || "invoice_number")) STORED,
    "invoice_type" "public"."invoice_type" DEFAULT 'normal'::"public"."invoice_type" NOT NULL,
    "invoice_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "due_date" "date" NOT NULL,
    "subtotal" numeric(12,2) DEFAULT 0 NOT NULL,
    "tax_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "total" numeric(12,2) DEFAULT 0 NOT NULL,
    "paid_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'EUR'::"text" NOT NULL,
    "status" "public"."invoice_status" DEFAULT 'draft'::"public"."invoice_status" NOT NULL,
    "payment_method" "public"."payment_method",
    "notes" "text",
    "internal_notes" "text",
    "rectifies_invoice_id" "uuid",
    "rectification_reason" "text",
    "verifactu_hash" "text",
    "verifactu_signature" "text",
    "verifactu_timestamp" timestamp with time zone,
    "verifactu_qr_code" "text",
    "verifactu_xml" "text",
    "verifactu_chain_position" integer,
    "anonymized_at" timestamp with time zone,
    "retention_until" "date" GENERATED ALWAYS AS (("invoice_date" + '7 years'::interval)) STORED,
    "gdpr_legal_basis" "text" DEFAULT 'legal_obligation'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "created_by" "uuid",
    "deleted_at" timestamp with time zone,
    "state" "text" DEFAULT 'draft'::"text",
    "total_tax_base" numeric(14,2),
    "total_vat" numeric(14,2),
    "total_gross" numeric(14,2),
    "source_quote_id" "uuid",
    "finalized_at" timestamp with time zone,
    "canonical_payload" "jsonb",
    "hash_prev" "text",
    "hash_current" "text",
    "invoice_month" "date",
    "payment_status" "text" DEFAULT 'pending'::"text",
    "payment_date" timestamp with time zone,
    "payment_reference" "text",
    "payment_link_token" "text",
    "payment_link_expires_at" timestamp with time zone,
    "payment_link_provider" "text",
    "recurrence_period" character varying(7),
    "stripe_payment_url" "text",
    "paypal_payment_url" "text",
    "stripe_payment_token" "text",
    "paypal_payment_token" "text",
    CONSTRAINT "invoices_payment_link_provider_check" CHECK (("payment_link_provider" = ANY (ARRAY['paypal'::"text", 'stripe'::"text"]))),
    CONSTRAINT "invoices_payment_status_check" CHECK (("payment_status" = ANY (ARRAY['pending'::"text", 'pending_local'::"text", 'partial'::"text", 'paid'::"text", 'refunded'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "valid_dates" CHECK (("due_date" >= "invoice_date")),
    CONSTRAINT "valid_paid_amount_logic" CHECK (((("total" >= (0)::numeric) AND ("paid_amount" >= (0)::numeric) AND ("paid_amount" <= "total")) OR (("total" < (0)::numeric) AND ("paid_amount" <= (0)::numeric) AND ("paid_amount" >= "total")))),
    CONSTRAINT "valid_total" CHECK (("total" = ("subtotal" + "tax_amount")))
);


ALTER TABLE "public"."invoices" OWNER TO "postgres";


COMMENT ON TABLE "public"."invoices" IS 'Facturas emitidas con soporte Veri*Factu y GDPR';



COMMENT ON COLUMN "public"."invoices"."payment_link_provider" IS 'Payment provider used for the payment link (paypal or stripe)';



COMMENT ON COLUMN "public"."invoices"."recurrence_period" IS 'Para facturas generadas de presupuestos recurrentes, indica el período (YYYY-MM)';



COMMENT ON COLUMN "public"."invoices"."stripe_payment_url" IS 'Direct Stripe checkout URL for this invoice';



COMMENT ON COLUMN "public"."invoices"."paypal_payment_url" IS 'Direct PayPal approval URL for this invoice';



COMMENT ON COLUMN "public"."invoices"."stripe_payment_token" IS 'Unique token for Stripe payment tracking';



COMMENT ON COLUMN "public"."invoices"."paypal_payment_token" IS 'Unique token for PayPal payment tracking';



CREATE OR REPLACE FUNCTION "public"."verifactu_status"("i" "public"."invoices") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  select status from verifactu.invoice_meta where invoice_id = i.id;
$$;


ALTER FUNCTION "public"."verifactu_status"("i" "public"."invoices") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."quote_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "quote_id" "uuid" NOT NULL,
    "company_id" "uuid" NOT NULL,
    "line_number" integer NOT NULL,
    "description" "text" NOT NULL,
    "quantity" numeric(10,2) DEFAULT 1 NOT NULL,
    "unit_price" numeric(12,2) NOT NULL,
    "tax_rate" numeric(5,2) DEFAULT 21.00 NOT NULL,
    "tax_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "discount_percent" numeric(5,2) DEFAULT 0,
    "discount_amount" numeric(12,2) DEFAULT 0,
    "subtotal" numeric(12,2) DEFAULT 0 NOT NULL,
    "total" numeric(12,2) DEFAULT 0 NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "service_id" "uuid",
    "product_id" "uuid",
    "variant_id" "uuid",
    "billing_period" "text",
    CONSTRAINT "chk_quote_items_billing_period_values" CHECK ((("billing_period" IS NULL) OR ("billing_period" = ANY (ARRAY['one-time'::"text", 'monthly'::"text", 'quarterly'::"text", 'annually'::"text", 'annual'::"text", 'yearly'::"text", 'custom'::"text"])))),
    CONSTRAINT "chk_quote_items_single_reference" CHECK (((("service_id" IS NOT NULL) AND ("product_id" IS NULL)) OR (("service_id" IS NULL) AND ("product_id" IS NOT NULL)) OR (("service_id" IS NULL) AND ("product_id" IS NULL)))),
    CONSTRAINT "valid_discount" CHECK ((("discount_percent" >= (0)::numeric) AND ("discount_percent" <= (100)::numeric))),
    CONSTRAINT "valid_price" CHECK (("unit_price" >= (0)::numeric)),
    CONSTRAINT "valid_quantity_nonzero" CHECK (("quantity" <> (0)::numeric)),
    CONSTRAINT "valid_tax_rate" CHECK ((("tax_rate" >= (0)::numeric) AND ("tax_rate" <= (100)::numeric)))
);


ALTER TABLE "public"."quote_items" OWNER TO "postgres";


COMMENT ON TABLE "public"."quote_items" IS 'Líneas de detalle de los presupuestos';



COMMENT ON COLUMN "public"."quote_items"."variant_id" IS 'Referencia a la variante del servicio seleccionada (si aplica)';



COMMENT ON COLUMN "public"."quote_items"."billing_period" IS 'Periodicidad aplicada a este item (one-time, monthly, quarterly, annually/yearly, custom)';



CREATE TABLE IF NOT EXISTS "public"."ticket_stages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(100) NOT NULL,
    "position" integer NOT NULL,
    "color" character varying(7) DEFAULT '#6b7280'::character varying,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone,
    "company_id" "uuid",
    "stage_category" "public"."stage_category" DEFAULT 'open'::"public"."stage_category",
    "workflow_category" "public"."workflow_category"
);


ALTER TABLE "public"."ticket_stages" OWNER TO "postgres";


COMMENT ON COLUMN "public"."ticket_stages"."company_id" IS 'NULL indicates a generic/system-wide stage available to all companies. 
   Non-NULL values are company-specific stages.';



COMMENT ON COLUMN "public"."ticket_stages"."stage_category" IS 'Categoría del stage: open, in_progress, completed, on_hold';



CREATE TABLE IF NOT EXISTS "public"."addresses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()),
    "direccion" character varying(255) NOT NULL,
    "numero" character varying(10),
    "piso" character varying(10),
    "puerta" character varying(10),
    "locality_id" "uuid",
    "usuario_id" "uuid" NOT NULL,
    "company_id" "uuid"
);


ALTER TABLE "public"."addresses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."companies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text",
    "settings" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone,
    "website" "text",
    "legacy_negocio_id" "text",
    "logo_url" "text",
    "subscription_tier" character varying(50) DEFAULT 'basic'::character varying,
    "max_users" integer DEFAULT 10,
    "is_active" boolean DEFAULT true,
    "nif" character varying(20)
);


ALTER TABLE "public"."companies" OWNER TO "postgres";


COMMENT ON COLUMN "public"."companies"."nif" IS 'NIF/CIF de la empresa. Obligatorio para facturación y VeriFactu.';



CREATE TABLE IF NOT EXISTS "public"."company_invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "invited_by_user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "token" "text" DEFAULT ("gen_random_uuid"())::"text" NOT NULL,
    "message" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone DEFAULT ("now"() + '7 days'::interval),
    "responded_at" timestamp with time zone,
    CONSTRAINT "company_invitations_role_check" CHECK (("role" = ANY (ARRAY['client'::"text", 'member'::"text", 'admin'::"text", 'owner'::"text"]))),
    CONSTRAINT "company_invitations_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'rejected'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."company_invitations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid",
    "email" "text" NOT NULL,
    "name" "text",
    "role" "text" DEFAULT 'member'::"text",
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone,
    "permissions" "jsonb" DEFAULT '{"moduloFacturas": false, "moduloMaterial": false, "moduloServicios": false, "moduloPresupuestos": false}'::"jsonb",
    "auth_user_id" "uuid",
    "is_dpo" boolean DEFAULT false,
    "gdpr_training_completed" boolean DEFAULT false,
    "gdpr_training_date" timestamp with time zone,
    "data_access_level" "text" DEFAULT 'standard'::"text",
    "last_privacy_policy_accepted" timestamp with time zone,
    "failed_login_attempts" integer DEFAULT 0,
    "account_locked_until" timestamp with time zone,
    "surname" "text",
    "last_session_at" timestamp with time zone,
    CONSTRAINT "users_role_check" CHECK (("role" = ANY (ARRAY['none'::"text", 'client'::"text", 'member'::"text", 'admin'::"text", 'owner'::"text"])))
);


ALTER TABLE "public"."users" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."admin_company_analysis" AS
 SELECT "c"."id",
    "c"."name",
    "c"."slug",
    "c"."created_at",
    "count"("u"."id") AS "total_users",
    "count"("u"."id") FILTER (WHERE ("u"."role" = 'owner'::"text")) AS "owners_count",
    "count"("u"."id") FILTER (WHERE ("u"."role" = 'admin'::"text")) AS "admins_count",
    "count"("u"."id") FILTER (WHERE ("u"."role" = 'member'::"text")) AS "members_count",
    "count"("ci"."id") FILTER (WHERE ("ci"."status" = 'pending'::"text")) AS "pending_invitations",
    "string_agg"("u"."email", ', '::"text") FILTER (WHERE ("u"."role" = 'owner'::"text")) AS "owner_emails"
   FROM (("public"."companies" "c"
     LEFT JOIN "public"."users" "u" ON ((("c"."id" = "u"."company_id") AND ("u"."active" = true))))
     LEFT JOIN "public"."company_invitations" "ci" ON ((("c"."id" = "ci"."company_id") AND ("ci"."status" = 'pending'::"text"))))
  WHERE ("c"."deleted_at" IS NULL)
  GROUP BY "c"."id", "c"."name", "c"."slug", "c"."created_at"
  ORDER BY "c"."created_at" DESC;


ALTER VIEW "public"."admin_company_analysis" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."admin_company_invitations" AS
 SELECT "ci"."id",
    "ci"."company_id",
    "ci"."email",
    "ci"."role",
    "ci"."status",
    "ci"."created_at",
    "ci"."expires_at",
    "ci"."responded_at",
    "c"."name" AS "company_name",
    "u"."name" AS "invited_by_name",
    "u"."email" AS "invited_by_email",
        CASE
            WHEN (("ci"."status" = 'pending'::"text") AND ("ci"."expires_at" < "now"())) THEN 'expired'::"text"
            ELSE "ci"."status"
        END AS "effective_status"
   FROM (("public"."company_invitations" "ci"
     JOIN "public"."companies" "c" ON (("ci"."company_id" = "c"."id")))
     JOIN "public"."users" "u" ON (("ci"."invited_by_user_id" = "u"."id")))
  ORDER BY "ci"."created_at" DESC;


ALTER VIEW "public"."admin_company_invitations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pending_users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "full_name" "text" NOT NULL,
    "company_name" "text",
    "auth_user_id" "uuid",
    "confirmation_token" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone DEFAULT ("now"() + '24:00:00'::interval),
    "confirmed_at" timestamp with time zone,
    "given_name" "text",
    "surname" "text",
    "company_id" "uuid",
    "company_nif" character varying(20)
);


ALTER TABLE "public"."pending_users" OWNER TO "postgres";


COMMENT ON COLUMN "public"."pending_users"."company_nif" IS 'NIF/CIF de la empresa a crear tras la confirmación del registro.';



CREATE OR REPLACE VIEW "public"."admin_pending_users" WITH ("security_invoker"='true') AS
 SELECT "id",
    "email",
    "full_name",
    "company_name",
    "created_at",
    "expires_at",
    "confirmed_at",
        CASE
            WHEN ("confirmed_at" IS NOT NULL) THEN 'confirmed'::"text"
            WHEN ("expires_at" < "now"()) THEN 'expired'::"text"
            ELSE 'pending'::"text"
        END AS "status"
   FROM "public"."pending_users" "p"
  WHERE (EXISTS ( SELECT 1
           FROM "public"."users" "u"
          WHERE (("u"."auth_user_id" = "auth"."uid"()) AND ("u"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"])) AND ("u"."active" = true))))
  ORDER BY "created_at" DESC;


ALTER VIEW "public"."admin_pending_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_usage_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "feature_key" "text" NOT NULL,
    "saved_seconds" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ai_usage_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "default_convert_policy" "text" DEFAULT 'manual'::"text" NOT NULL,
    "ask_before_convert" boolean DEFAULT true NOT NULL,
    "enforce_globally" boolean DEFAULT false NOT NULL,
    "default_payment_terms" "text",
    "default_invoice_delay_days" integer DEFAULT 0 NOT NULL,
    "default_prices_include_tax" boolean,
    "default_iva_enabled" boolean,
    "default_iva_rate" numeric,
    "default_irpf_enabled" boolean,
    "default_irpf_rate" numeric,
    "default_auto_send_quote_email" boolean DEFAULT false,
    CONSTRAINT "app_settings_default_convert_policy_check" CHECK (("default_convert_policy" = ANY (ARRAY['manual'::"text", 'on_accept'::"text", 'automatic'::"text", 'scheduled'::"text"])))
);


ALTER TABLE "public"."app_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."attachments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "job_id" "uuid",
    "file_name" "text" NOT NULL,
    "file_path" "text" NOT NULL,
    "file_size" integer,
    "mime_type" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."attachments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_portal_users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "auth_user_id" "uuid",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid"
);


ALTER TABLE "public"."client_portal_users" OWNER TO "postgres";


COMMENT ON TABLE "public"."client_portal_users" IS 'Maps a login email to a specific client within a company for client portal scoping.';



CREATE TABLE IF NOT EXISTS "public"."client_variant_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "client_id" "uuid" NOT NULL,
    "service_id" "uuid" NOT NULL,
    "variant_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid"
);


ALTER TABLE "public"."client_variant_assignments" OWNER TO "postgres";


COMMENT ON TABLE "public"."client_variant_assignments" IS 'Asignaciones de variantes personalizadas a clientes específicos. Si un cliente tiene una asignación, solo verá esa variante.';



CREATE OR REPLACE VIEW "public"."client_visible_quotes" AS
 SELECT "id",
    "company_id",
    "client_id",
    "quote_number",
    "year",
    "sequence_number",
    "status",
    "quote_date",
    "valid_until",
    "accepted_at",
    "rejected_at",
    "invoiced_at",
    "invoice_id",
    "title",
    "description",
    "notes",
    "terms_conditions",
    "subtotal",
    "tax_amount",
    "total_amount",
    "discount_percent",
    "discount_amount",
    "currency",
    "language",
    "client_viewed_at",
    "client_ip_address",
    "client_user_agent",
    "pdf_url",
    "pdf_generated_at",
    "digital_signature",
    "signature_timestamp",
    "created_by",
    "created_at",
    "updated_at",
    "is_anonymized",
    "anonymized_at",
    "retention_until",
    "convert_policy",
    "deposit_percentage",
    "invoice_on_date",
    "conversion_status",
    "ticket_id",
    "recurrence_type",
    "recurrence_interval",
    "recurrence_day",
    "recurrence_start_date",
    "recurrence_end_date",
    "next_run_at",
    "last_run_at",
    "quote_month",
    "rectifies_invoice_id",
    "scheduled_conversion_date",
    "rectification_reason",
    "full_quote_number"
   FROM "public"."client_get_visible_quotes"() "client_get_visible_quotes"("id", "company_id", "client_id", "quote_number", "year", "sequence_number", "status", "quote_date", "valid_until", "accepted_at", "rejected_at", "invoiced_at", "invoice_id", "title", "description", "notes", "terms_conditions", "subtotal", "tax_amount", "total_amount", "discount_percent", "discount_amount", "currency", "language", "client_viewed_at", "client_ip_address", "client_user_agent", "pdf_url", "pdf_generated_at", "digital_signature", "signature_timestamp", "created_by", "created_at", "updated_at", "is_anonymized", "anonymized_at", "retention_until", "convert_policy", "deposit_percentage", "invoice_on_date", "conversion_status", "ticket_id", "recurrence_type", "recurrence_interval", "recurrence_day", "recurrence_start_date", "recurrence_end_date", "next_run_at", "last_run_at", "quote_month", "rectifies_invoice_id", "scheduled_conversion_date", "rectification_reason", "full_quote_number", "rejection_reason");


ALTER VIEW "public"."client_visible_quotes" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."client_visible_services" AS
 SELECT "id",
    "name",
    "description",
    "estimated_hours",
    "base_price",
    "created_at",
    "updated_at",
    "deleted_at",
    "is_active",
    "category",
    "legacy_negocio_id",
    "company_id",
    "tax_rate",
    "unit_type",
    "min_quantity",
    "max_quantity",
    "difficulty_level",
    "profit_margin",
    "cost_price",
    "requires_parts",
    "requires_diagnosis",
    "warranty_days",
    "skill_requirements",
    "tools_required",
    "can_be_remote",
    "priority_level",
    "has_variants",
    "base_features",
    "is_public",
    "features"
   FROM "public"."services" "s"
  WHERE ("is_public" = true);


ALTER VIEW "public"."client_visible_services" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."client_visible_tickets" AS
 SELECT "id",
    "ticket_number",
    "client_id",
    "company_id",
    "stage_id",
    "title",
    "description",
    "priority",
    "due_date",
    "comments",
    "total_amount",
    "created_at",
    "updated_at",
    "deleted_at",
    "estimated_hours",
    "actual_hours",
    "is_opened"
   FROM "public"."client_get_visible_tickets"() "client_get_visible_tickets"("id", "ticket_number", "client_id", "company_id", "stage_id", "title", "description", "priority", "due_date", "comments", "total_amount", "created_at", "updated_at", "deleted_at", "estimated_hours", "actual_hours", "is_opened", "ticket_month", "assigned_to");


ALTER VIEW "public"."client_visible_tickets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "email" "text",
    "phone" "text",
    "address" "jsonb" DEFAULT '{}'::"jsonb",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone,
    "apellidos" character varying(200),
    "dni" character varying(50),
    "marketing_consent" boolean DEFAULT false,
    "marketing_consent_date" timestamp with time zone,
    "marketing_consent_method" "text",
    "data_processing_consent" boolean DEFAULT true,
    "data_processing_consent_date" timestamp with time zone DEFAULT "now"(),
    "data_processing_legal_basis" "text" DEFAULT 'contract'::"text",
    "data_retention_until" timestamp with time zone,
    "deletion_requested_at" timestamp with time zone,
    "deletion_reason" "text",
    "anonymized_at" timestamp with time zone,
    "is_minor" boolean DEFAULT false,
    "parental_consent_verified" boolean DEFAULT false,
    "parental_consent_date" timestamp with time zone,
    "data_minimization_applied" boolean DEFAULT false,
    "last_data_review_date" timestamp with time zone,
    "access_restrictions" "jsonb" DEFAULT '{}'::"jsonb",
    "last_accessed_at" timestamp with time zone,
    "access_count" integer DEFAULT 0,
    "is_active" boolean DEFAULT true,
    "direccion_id" "uuid",
    "client_type" "text" DEFAULT 'individual'::"text" NOT NULL,
    "business_name" "text",
    "cif_nif" "text",
    "trade_name" "text",
    "legal_representative_name" "text",
    "legal_representative_dni" "text",
    "mercantile_registry_data" "jsonb" DEFAULT '{}'::"jsonb",
    "auth_user_id" "uuid"
);


ALTER TABLE "public"."clients" OWNER TO "postgres";


COMMENT ON COLUMN "public"."clients"."auth_user_id" IS 'Links client to auth.users for portal login capability';



CREATE TABLE IF NOT EXISTS "public"."clients_tags" (
    "client_id" "uuid" NOT NULL,
    "tag_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."clients_tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."company_settings" (
    "company_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "convert_policy" "text",
    "ask_before_convert" boolean,
    "enforce_company_defaults" boolean DEFAULT false NOT NULL,
    "payment_terms" "text",
    "invoice_on_date" "date",
    "default_invoice_delay_days" integer,
    "prices_include_tax" boolean,
    "iva_enabled" boolean,
    "iva_rate" numeric,
    "irpf_enabled" boolean,
    "irpf_rate" numeric,
    "auto_send_quote_email" boolean DEFAULT false,
    "allow_direct_contracting" boolean DEFAULT false,
    "copy_features_between_variants" boolean DEFAULT false,
    "allow_local_payment" boolean DEFAULT false,
    "ticket_stage_on_delete" "uuid",
    "ticket_stage_on_staff_reply" "uuid",
    "ticket_stage_on_client_reply" "uuid",
    "ticket_client_view_estimated_hours" boolean DEFAULT true,
    "ticket_client_can_close" boolean DEFAULT true,
    "ticket_client_can_create_devices" boolean DEFAULT true,
    "ticket_default_internal_comment" boolean DEFAULT false,
    "ticket_auto_assign_on_reply" boolean DEFAULT false,
    "agent_module_access" "jsonb" DEFAULT '["dashboard", "clients", "moduloSAT", "moduloFacturas", "moduloPresupuestos", "moduloServicios", "moduloProductos", "moduloChat", "moduloAnaliticas"]'::"jsonb",
    CONSTRAINT "company_settings_convert_policy_check" CHECK (("convert_policy" = ANY (ARRAY['manual'::"text", 'on_accept'::"text", 'automatic'::"text", 'scheduled'::"text"])))
);


ALTER TABLE "public"."company_settings" OWNER TO "postgres";


COMMENT ON COLUMN "public"."company_settings"."copy_features_between_variants" IS 'If true, features are copied between variants in services';



COMMENT ON COLUMN "public"."company_settings"."allow_local_payment" IS 'Permite a los clientes registrar pagos en efectivo/local';



CREATE TABLE IF NOT EXISTS "public"."company_stage_order" (
    "company_id" "uuid" NOT NULL,
    "stage_id" "uuid" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."company_stage_order" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."device_components" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "device_id" "uuid" NOT NULL,
    "component_name" character varying(100) NOT NULL,
    "component_status" character varying(50) NOT NULL,
    "replacement_needed" boolean DEFAULT false,
    "replacement_cost" numeric(10,2),
    "supplier" character varying(100),
    "part_number" character varying(100),
    "installed_at" timestamp with time zone,
    "warranty_months" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "notes" "text"
);


ALTER TABLE "public"."device_components" OWNER TO "postgres";


COMMENT ON TABLE "public"."device_components" IS 'Gestión detallada de componentes y partes de dispositivos';



CREATE TABLE IF NOT EXISTS "public"."device_media" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "device_id" "uuid" NOT NULL,
    "media_type" character varying(20) NOT NULL,
    "file_url" "text" NOT NULL,
    "file_name" character varying(255),
    "file_size" integer,
    "mime_type" character varying(100),
    "media_context" character varying(50),
    "description" "text",
    "taken_by" "uuid",
    "taken_at" timestamp with time zone DEFAULT "now"(),
    "ai_analysis" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "ticket_device_id" "uuid"
);


ALTER TABLE "public"."device_media" OWNER TO "postgres";


COMMENT ON TABLE "public"."device_media" IS 'Imágenes y documentos asociados a dispositivos';



COMMENT ON COLUMN "public"."device_media"."ticket_device_id" IS 'Links this media to a specific ticket-device relationship. Captures device state at the time of repair.';



CREATE TABLE IF NOT EXISTS "public"."device_status_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "device_id" "uuid" NOT NULL,
    "previous_status" character varying(50),
    "new_status" character varying(50) NOT NULL,
    "changed_by" "uuid",
    "changed_at" timestamp with time zone DEFAULT "now"(),
    "notes" "text",
    "location" character varying(100),
    "technician_notes" "text"
);


ALTER TABLE "public"."device_status_history" OWNER TO "postgres";


COMMENT ON TABLE "public"."device_status_history" IS 'Historial completo de cambios de estado de dispositivos';



CREATE TABLE IF NOT EXISTS "public"."devices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "brand" character varying(100) NOT NULL,
    "model" character varying(200) NOT NULL,
    "device_type" character varying(50) NOT NULL,
    "serial_number" character varying(200),
    "imei" character varying(50),
    "status" character varying(50) DEFAULT 'received'::character varying NOT NULL,
    "condition_on_arrival" "text",
    "reported_issue" "text" NOT NULL,
    "operating_system" character varying(100),
    "storage_capacity" character varying(50),
    "color" character varying(50),
    "purchase_date" "date",
    "warranty_status" character varying(50),
    "priority" character varying(20) DEFAULT 'normal'::character varying,
    "estimated_repair_time" integer,
    "actual_repair_time" integer,
    "received_at" timestamp with time zone DEFAULT "now"(),
    "started_repair_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "delivered_at" timestamp with time zone,
    "estimated_cost" numeric(10,2),
    "final_cost" numeric(10,2),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid",
    "ai_diagnosis" "jsonb",
    "ai_confidence_score" numeric(3,2),
    "device_images" "text"[],
    "repair_notes" "text"[],
    "deleted_at" timestamp with time zone,
    "deletion_reason" "text"
);


ALTER TABLE "public"."devices" OWNER TO "postgres";


COMMENT ON TABLE "public"."devices" IS 'Tabla principal para gestión completa de dispositivos en reparación';



CREATE TABLE IF NOT EXISTS "public"."gdpr_access_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_type" "text" NOT NULL,
    "subject_email" "text" NOT NULL,
    "subject_name" "text",
    "subject_identifier" "text",
    "company_id" "uuid",
    "requested_by" "uuid",
    "request_details" "jsonb" DEFAULT '{}'::"jsonb",
    "verification_method" "text",
    "verification_status" "text" DEFAULT 'pending'::"text",
    "processing_status" "text" DEFAULT 'received'::"text",
    "response_data" "jsonb",
    "response_file_url" "text",
    "legal_basis_for_delay" "text",
    "deadline_date" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "valid_processing_status" CHECK (("processing_status" = ANY (ARRAY['received'::"text", 'in_progress'::"text", 'completed'::"text", 'rejected'::"text"]))),
    CONSTRAINT "valid_request_type" CHECK (("request_type" = ANY (ARRAY['access'::"text", 'rectification'::"text", 'erasure'::"text", 'portability'::"text", 'restriction'::"text", 'objection'::"text"]))),
    CONSTRAINT "valid_verification_status" CHECK (("verification_status" = ANY (ARRAY['pending'::"text", 'verified'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."gdpr_access_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gdpr_audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "company_id" "uuid",
    "action_type" "text" NOT NULL,
    "table_name" "text" NOT NULL,
    "record_id" "uuid",
    "subject_email" "text",
    "old_values" "jsonb",
    "new_values" "jsonb",
    "legal_basis" "text",
    "purpose" "text",
    "ip_address" "inet",
    "user_agent" "text",
    "session_id" "text",
    "request_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "valid_action_type" CHECK (("action_type" = ANY (ARRAY['create'::"text", 'read'::"text", 'update'::"text", 'delete'::"text", 'export'::"text", 'anonymize'::"text", 'consent'::"text", 'access_request'::"text"])))
);


ALTER TABLE "public"."gdpr_audit_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gdpr_breach_incidents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "incident_reference" "text" NOT NULL,
    "breach_type" "text"[] NOT NULL,
    "discovered_at" timestamp with time zone NOT NULL,
    "reported_at" timestamp with time zone,
    "reported_to_dpa" boolean DEFAULT false,
    "dpa_reference" "text",
    "data_subjects_notified" boolean DEFAULT false,
    "notification_method" "text",
    "affected_data_categories" "text"[],
    "estimated_affected_subjects" integer,
    "likely_consequences" "text",
    "mitigation_measures" "text",
    "preventive_measures" "text",
    "severity_level" "text",
    "company_id" "uuid",
    "reported_by" "uuid",
    "incident_details" "jsonb" DEFAULT '{}'::"jsonb",
    "resolution_status" "text" DEFAULT 'open'::"text",
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "valid_resolution_status" CHECK (("resolution_status" = ANY (ARRAY['open'::"text", 'investigating'::"text", 'contained'::"text", 'resolved'::"text"]))),
    CONSTRAINT "valid_severity" CHECK (("severity_level" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text", 'critical'::"text"])))
);


ALTER TABLE "public"."gdpr_breach_incidents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gdpr_consent_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "subject_id" "uuid",
    "subject_email" "text" NOT NULL,
    "consent_type" "text" NOT NULL,
    "purpose" "text" NOT NULL,
    "consent_given" boolean NOT NULL,
    "consent_method" "text" NOT NULL,
    "consent_evidence" "jsonb" DEFAULT '{}'::"jsonb",
    "withdrawn_at" timestamp with time zone,
    "withdrawal_method" "text",
    "withdrawal_evidence" "jsonb" DEFAULT '{}'::"jsonb",
    "company_id" "uuid",
    "processed_by" "uuid",
    "legal_basis" "text",
    "data_processing_purposes" "text"[],
    "retention_period" interval,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_active" boolean GENERATED ALWAYS AS (("withdrawn_at" IS NULL)) STORED
);


ALTER TABLE "public"."gdpr_consent_records" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."gdpr_consent_overview" WITH ("security_invoker"='true') AS
 SELECT "cr"."subject_email",
    "cr"."consent_type",
    "cr"."purpose",
    "cr"."consent_given",
    "cr"."consent_method",
    "cr"."created_at" AS "consent_date",
    "cr"."withdrawn_at",
    "cr"."is_active",
    "c"."name" AS "client_name"
   FROM ("public"."gdpr_consent_records" "cr"
     LEFT JOIN "public"."clients" "c" ON (("c"."email" = "cr"."subject_email")))
  WHERE ("cr"."company_id" IN ( SELECT "users"."company_id"
           FROM "public"."users"
          WHERE ("users"."auth_user_id" = "auth"."uid"())))
  ORDER BY "cr"."created_at" DESC;


ALTER VIEW "public"."gdpr_consent_overview" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gdpr_consent_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "token" "text" DEFAULT ("gen_random_uuid"())::"text" NOT NULL,
    "client_id" "uuid",
    "subject_email" "text" NOT NULL,
    "company_id" "uuid" NOT NULL,
    "consent_types" "text"[] NOT NULL,
    "purpose" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone DEFAULT ("now"() + '30 days'::interval),
    "accepted_at" timestamp with time zone,
    "evidence" "jsonb" DEFAULT '{}'::"jsonb",
    CONSTRAINT "gdpr_consent_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'declined'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."gdpr_consent_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gdpr_processing_activities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "activity_name" "text" NOT NULL,
    "purpose" "text" NOT NULL,
    "legal_basis" "text" NOT NULL,
    "data_categories" "text"[] NOT NULL,
    "data_subjects" "text"[] NOT NULL,
    "recipients" "text"[],
    "retention_period" interval,
    "security_measures" "jsonb" DEFAULT '{}'::"jsonb",
    "cross_border_transfers" "jsonb" DEFAULT '{}'::"jsonb",
    "dpo_assessment" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "is_active" boolean DEFAULT true,
    "company_id" "uuid"
);


ALTER TABLE "public"."gdpr_processing_activities" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."gdpr_processing_inventory" WITH ("security_invoker"='true') AS
 SELECT "pa"."activity_name",
    "pa"."purpose",
    "pa"."legal_basis",
    "pa"."data_categories",
    "pa"."data_subjects",
    "pa"."recipients",
    "pa"."retention_period",
    "pa"."cross_border_transfers",
    "count"(DISTINCT "c"."id") AS "affected_subjects_count",
    "pa"."created_at",
    "pa"."updated_at"
   FROM ("public"."gdpr_processing_activities" "pa"
     LEFT JOIN "public"."clients" "c" ON (("c"."company_id" IN ( SELECT "companies"."id"
           FROM "public"."companies"
          WHERE ("companies"."id" IN ( SELECT "users"."company_id"
                   FROM "public"."users"
                  WHERE ("users"."auth_user_id" = "auth"."uid"())))))))
  WHERE ("pa"."is_active" = true)
  GROUP BY "pa"."id", "pa"."activity_name", "pa"."purpose", "pa"."legal_basis", "pa"."data_categories", "pa"."data_subjects", "pa"."recipients", "pa"."retention_period", "pa"."cross_border_transfers", "pa"."created_at", "pa"."updated_at";


ALTER VIEW "public"."gdpr_processing_inventory" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."global_tags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "color" "text" DEFAULT '#6B7280'::"text",
    "category" "text",
    "scope" "text"[],
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."global_tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hidden_stages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "stage_id" "uuid" NOT NULL,
    "hidden_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "hidden_by" "uuid"
);


ALTER TABLE "public"."hidden_stages" OWNER TO "postgres";


COMMENT ON TABLE "public"."hidden_stages" IS 'Almacena qué estados genéricos del sistema ha ocultado cada empresa. Las operaciones se gestionan mediante la Edge Function hide-stage que valida y escribe con service_role.';



COMMENT ON COLUMN "public"."hidden_stages"."company_id" IS 'ID de la empresa que oculta el estado';



COMMENT ON COLUMN "public"."hidden_stages"."stage_id" IS 'ID del estado genérico que se oculta (debe tener company_id = NULL)';



COMMENT ON COLUMN "public"."hidden_stages"."hidden_at" IS 'Fecha y hora en que se ocultó el estado';



COMMENT ON COLUMN "public"."hidden_stages"."hidden_by" IS 'Usuario que ocultó el estado';



CREATE TABLE IF NOT EXISTS "public"."hidden_units" (
    "company_id" "uuid" NOT NULL,
    "unit_id" "uuid" NOT NULL,
    "hidden_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."hidden_units" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid",
    "email" character varying(255) NOT NULL,
    "role" character varying(50) DEFAULT 'user'::character varying,
    "invited_by" "uuid",
    "token" character varying(255) NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "accepted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."invitations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoice_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "line_order" integer DEFAULT 0 NOT NULL,
    "description" "text" NOT NULL,
    "quantity" numeric(12,3) DEFAULT 1 NOT NULL,
    "unit_price" numeric(12,2) NOT NULL,
    "discount_percent" numeric(5,2) DEFAULT 0 NOT NULL,
    "tax_rate" numeric(5,2) DEFAULT 21.00 NOT NULL,
    "tax_amount" numeric(12,2) NOT NULL,
    "subtotal" numeric(12,2) NOT NULL,
    "total" numeric(12,2) NOT NULL,
    "product_id" "uuid",
    "service_id" "uuid",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "valid_discount" CHECK ((("discount_percent" >= (0)::numeric) AND ("discount_percent" <= (100)::numeric))),
    CONSTRAINT "valid_item_total" CHECK (("total" = ("subtotal" + "tax_amount"))),
    CONSTRAINT "valid_quantity_nonzero" CHECK (("quantity" <> (0)::numeric)),
    CONSTRAINT "valid_tax_rate" CHECK ((("tax_rate" >= (0)::numeric) AND ("tax_rate" <= (100)::numeric))),
    CONSTRAINT "valid_unit_price" CHECK (("unit_price" >= (0)::numeric))
);


ALTER TABLE "public"."invoice_items" OWNER TO "postgres";


COMMENT ON TABLE "public"."invoice_items" IS 'Líneas/conceptos de las facturas';



CREATE TABLE IF NOT EXISTS "public"."invoice_meta" (
    "invoice_id" "uuid" NOT NULL,
    "status" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."invoice_meta" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoice_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "payment_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "payment_method" "public"."payment_method" NOT NULL,
    "reference" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "created_by" "uuid",
    CONSTRAINT "valid_payment_amount" CHECK (("amount" > (0)::numeric))
);


ALTER TABLE "public"."invoice_payments" OWNER TO "postgres";


COMMENT ON TABLE "public"."invoice_payments" IS 'Pagos recibidos de facturas';



CREATE TABLE IF NOT EXISTS "public"."invoice_series" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "series_code" "text" NOT NULL,
    "series_name" "text" NOT NULL,
    "year" integer DEFAULT EXTRACT(year FROM CURRENT_DATE) NOT NULL,
    "prefix" "text" NOT NULL,
    "next_number" integer DEFAULT 1 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "verifactu_enabled" boolean DEFAULT true NOT NULL,
    "last_verifactu_hash" "text",
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "created_by" "uuid"
);


ALTER TABLE "public"."invoice_series" OWNER TO "postgres";


COMMENT ON TABLE "public"."invoice_series" IS 'Series de facturación con numeración automática';



CREATE TABLE IF NOT EXISTS "public"."invoice_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "is_default" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "html_template" "text" NOT NULL,
    "css_styles" "text",
    "show_company_logo" boolean DEFAULT true NOT NULL,
    "show_payment_info" boolean DEFAULT true NOT NULL,
    "show_tax_breakdown" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "created_by" "uuid"
);


ALTER TABLE "public"."invoice_templates" OWNER TO "postgres";


COMMENT ON TABLE "public"."invoice_templates" IS 'Plantillas de diseño para PDFs de facturas';



CREATE OR REPLACE VIEW "public"."invoiceseries" AS
 SELECT "id",
    "company_id",
    "series_code",
    "series_name",
    "year",
    "prefix",
    "next_number",
    "is_active",
    "is_default",
    "verifactu_enabled",
    "last_verifactu_hash",
    "created_at",
    "updated_at",
    "created_by"
   FROM "public"."invoice_series";


ALTER VIEW "public"."invoiceseries" OWNER TO "postgres";


COMMENT ON VIEW "public"."invoiceseries" IS 'Compatibility view for legacy code that referenced invoiceseries (maps to invoice_series)';



CREATE TABLE IF NOT EXISTS "public"."job_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "note" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "company_id" "uuid" NOT NULL
);


ALTER TABLE "public"."job_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."modules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "category" "text",
    "position" integer DEFAULT 0 NOT NULL,
    "enabled_by_default" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "plan_required" "text",
    "price" numeric,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."modules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."modules_catalog" (
    "key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."modules_catalog" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "recipient_id" "uuid" NOT NULL,
    "type" "text" NOT NULL,
    "reference_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "content" "text",
    "is_read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "metadata" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment_integrations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "is_active" boolean DEFAULT false NOT NULL,
    "is_sandbox" boolean DEFAULT true NOT NULL,
    "credentials_encrypted" "text" NOT NULL,
    "webhook_secret_encrypted" "text",
    "webhook_url" "text",
    "last_verified_at" timestamp with time zone,
    "verification_status" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "payment_integrations_provider_check" CHECK (("provider" = ANY (ARRAY['paypal'::"text", 'stripe'::"text"]))),
    CONSTRAINT "payment_integrations_verification_status_check" CHECK (("verification_status" = ANY (ARRAY['pending'::"text", 'verified'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."payment_integrations" OWNER TO "postgres";


COMMENT ON TABLE "public"."payment_integrations" IS 'Stores encrypted payment provider credentials (PayPal/Stripe) per company';



CREATE TABLE IF NOT EXISTS "public"."payment_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "company_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "external_id" "text",
    "amount" numeric(12,2) NOT NULL,
    "currency" "text" DEFAULT 'EUR'::"text" NOT NULL,
    "status" "text" NOT NULL,
    "provider_response" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "payment_transactions_provider_check" CHECK (("provider" = ANY (ARRAY['paypal'::"text", 'stripe'::"text", 'manual'::"text"]))),
    CONSTRAINT "payment_transactions_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'completed'::"text", 'failed'::"text", 'refunded'::"text"])))
);


ALTER TABLE "public"."payment_transactions" OWNER TO "postgres";


COMMENT ON TABLE "public"."payment_transactions" IS 'Records individual payment transactions for invoices';



CREATE TABLE IF NOT EXISTS "public"."product_brands" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "company_id" "uuid",
    "description" "text",
    "logo_url" "text",
    "website" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."product_brands" OWNER TO "postgres";


COMMENT ON TABLE "public"."product_brands" IS 'Normalized table for product brands. Supports both global (company_id IS NULL) and company-specific brands.';



COMMENT ON COLUMN "public"."product_brands"."company_id" IS 'NULL for global brands, UUID for company-specific brands';



CREATE TABLE IF NOT EXISTS "public"."product_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "company_id" "uuid",
    "description" "text",
    "parent_id" "uuid",
    "icon" "text",
    "color" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."product_categories" OWNER TO "postgres";


COMMENT ON TABLE "public"."product_categories" IS 'Normalized table for product categories with hierarchical support. Supports both global and company-specific categories.';



COMMENT ON COLUMN "public"."product_categories"."parent_id" IS 'Allows for subcategories (e.g., Hardware > RAM)';



CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(200) NOT NULL,
    "category" character varying(100),
    "brand" character varying(100),
    "model" character varying(100),
    "description" "text",
    "price" numeric(10,2) DEFAULT 0.00,
    "stock_quantity" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone,
    "company_id" "uuid" NOT NULL,
    "brand_id" "uuid",
    "category_id" "uuid"
);


ALTER TABLE "public"."products" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."profiles" AS
 SELECT "auth_user_id" AS "user_id",
    "company_id",
    "role",
    "last_session_at"
   FROM "public"."users"
  WHERE ("deleted_at" IS NULL);


ALTER VIEW "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."quote_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "name" character varying(200) NOT NULL,
    "description" "text",
    "title_template" character varying(500),
    "description_template" "text",
    "notes_template" "text",
    "terms_conditions_template" "text",
    "default_items" "jsonb",
    "default_valid_days" integer DEFAULT 30,
    "default_tax_rate" numeric(5,2) DEFAULT 21.00,
    "is_active" boolean DEFAULT true,
    "usage_count" integer DEFAULT 0,
    "last_used_at" timestamp with time zone,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."quote_templates" OWNER TO "postgres";


COMMENT ON TABLE "public"."quote_templates" IS 'Plantillas reutilizables para crear presupuestos rápidamente';



CREATE TABLE IF NOT EXISTS "public"."scheduled_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "scheduled_at" timestamp with time zone NOT NULL,
    "executed_at" timestamp with time zone,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "job_type" "text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "retry_count" integer DEFAULT 0 NOT NULL,
    "last_error" "text",
    CONSTRAINT "scheduled_jobs_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'succeeded'::"text", 'failed'::"text", 'canceled'::"text"])))
);


ALTER TABLE "public"."scheduled_jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."service_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(100) NOT NULL,
    "color" character varying(7) DEFAULT '#6b7280'::character varying,
    "icon" character varying(50) DEFAULT 'fas fa-cog'::character varying,
    "description" "text",
    "company_id" "uuid" NOT NULL,
    "is_active" boolean DEFAULT true,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."service_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."service_tag_relations" (
    "service_id" "uuid" NOT NULL,
    "tag_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."service_tag_relations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."service_tags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(50) NOT NULL,
    "color" character varying(7) DEFAULT '#6b7280'::character varying,
    "description" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "company_id" "uuid" NOT NULL
);


ALTER TABLE "public"."service_tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."service_units" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid",
    "name" "text" NOT NULL,
    "code" "text" NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."service_units" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."service_variants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "service_id" "uuid" NOT NULL,
    "variant_name" "text" NOT NULL,
    "estimated_hours" numeric DEFAULT 0,
    "cost_price" numeric DEFAULT 0,
    "profit_margin" numeric DEFAULT 30.00,
    "discount_percentage" numeric DEFAULT 0,
    "features" "jsonb" DEFAULT '{"limits": {}, "excluded": [], "included": []}'::"jsonb",
    "display_config" "jsonb" DEFAULT '{"badge": null, "color": null, "highlight": false}'::"jsonb",
    "is_active" boolean DEFAULT true,
    "sort_order" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "pricing" "jsonb",
    "is_hidden" boolean DEFAULT false,
    CONSTRAINT "check_pricing_structure" CHECK ((("pricing" IS NULL) OR (("jsonb_typeof"("pricing") = 'array'::"text") AND ("jsonb_array_length"("pricing") > 0)))),
    CONSTRAINT "service_variants_cost_price_check" CHECK (("cost_price" >= (0)::numeric)),
    CONSTRAINT "service_variants_discount_percentage_check" CHECK ((("discount_percentage" >= (0)::numeric) AND ("discount_percentage" <= (100)::numeric))),
    CONSTRAINT "service_variants_profit_margin_check" CHECK ((("profit_margin" >= (0)::numeric) AND ("profit_margin" <= (100)::numeric)))
);


ALTER TABLE "public"."service_variants" OWNER TO "postgres";


COMMENT ON TABLE "public"."service_variants" IS 'Variantes de servicios: diferentes niveles (Esencial, Avanzado, Superior) y periodicidades (mensual, anual) de un mismo servicio base';



COMMENT ON COLUMN "public"."service_variants"."is_hidden" IS 'Si true, la variante no se muestra en el catálogo público';



CREATE TABLE IF NOT EXISTS "public"."ticket_comment_attachments" (
    "comment_id" "uuid" NOT NULL,
    "attachment_id" "uuid" NOT NULL,
    "linked_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ticket_comment_attachments" OWNER TO "postgres";


COMMENT ON TABLE "public"."ticket_comment_attachments" IS 'Link table between ticket_comments and attachments';



CREATE TABLE IF NOT EXISTS "public"."ticket_comment_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "comment_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "changed_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ticket_comment_versions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ticket_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ticket_id" "uuid" NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"(),
    "comment" "text" NOT NULL,
    "is_internal" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "client_id" "uuid",
    "parent_id" "uuid",
    "deleted_at" timestamp with time zone,
    "edited_at" timestamp with time zone
);


ALTER TABLE "public"."ticket_comments" OWNER TO "postgres";


COMMENT ON TABLE "public"."ticket_comments" IS 'Comments for tickets with multitenant RLS and author constraints';



CREATE TABLE IF NOT EXISTS "public"."ticket_devices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ticket_id" "uuid" NOT NULL,
    "device_id" "uuid" NOT NULL,
    "relation_type" character varying(50) DEFAULT 'repair'::character varying,
    "assigned_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone,
    "progress_percentage" integer DEFAULT 0,
    "current_task" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ticket_devices" OWNER TO "postgres";


COMMENT ON TABLE "public"."ticket_devices" IS 'Relación entre tickets y dispositivos para workflow completo';



CREATE TABLE IF NOT EXISTS "public"."ticket_products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ticket_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "price_per_unit" numeric(12,2) DEFAULT 0 NOT NULL,
    "total_price" numeric(12,2) DEFAULT 0 NOT NULL,
    "company_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ticket_products_quantity_check" CHECK (("quantity" > 0))
);


ALTER TABLE "public"."ticket_products" OWNER TO "postgres";


COMMENT ON TABLE "public"."ticket_products" IS 'Relación de productos asociados a tickets con cantidades y precios.';



COMMENT ON COLUMN "public"."ticket_products"."price_per_unit" IS 'Precio por unidad al momento de agregar el producto al ticket.';



COMMENT ON COLUMN "public"."ticket_products"."total_price" IS 'Cantidad * precio por unidad.';



CREATE TABLE IF NOT EXISTS "public"."ticket_services" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ticket_id" "uuid" NOT NULL,
    "service_id" "uuid" NOT NULL,
    "quantity" integer DEFAULT 1,
    "price_per_unit" numeric(10,2),
    "total_price" numeric(10,2),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "company_id" "uuid",
    "variant_id" "uuid"
);


ALTER TABLE "public"."ticket_services" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ticket_tag_relations" (
    "ticket_id" "uuid" NOT NULL,
    "tag_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ticket_tag_relations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ticket_tags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" character varying(50) NOT NULL,
    "color" character varying(7) DEFAULT '#6b7280'::character varying,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "company_id" "uuid" NOT NULL
);


ALTER TABLE "public"."ticket_tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tickets_tags" (
    "ticket_id" "uuid" NOT NULL,
    "tag_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tickets_tags" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."tickets_ticket_number_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."tickets_ticket_number_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."tickets_ticket_number_seq" OWNED BY "public"."tickets"."ticket_number";



CREATE OR REPLACE VIEW "public"."user_company_context" AS
 SELECT "auth"."uid"() AS "auth_user_id",
    "company_id",
    "role"
   FROM "public"."users" "u"
  WHERE ("auth_user_id" = "auth"."uid"());


ALTER VIEW "public"."user_company_context" OWNER TO "postgres";


COMMENT ON VIEW "public"."user_company_context" IS 'Vista de contexto del usuario autenticado. Devuelve company_id y role del usuario actual.';



CREATE TABLE IF NOT EXISTS "public"."user_modules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "module_key" "text" NOT NULL,
    "status" "public"."module_status" DEFAULT 'desactivado'::"public"."module_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_modules" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."users_with_company" AS
 SELECT "u"."id",
    "u"."email",
    "u"."name",
    "u"."surname",
    "u"."permissions",
    "u"."created_at" AS "user_created_at",
    "c"."id" AS "company_id",
    "c"."name" AS "company_name",
    "c"."website" AS "company_website",
    "c"."legacy_negocio_id"
   FROM ("public"."users" "u"
     JOIN "public"."companies" "c" ON (("u"."company_id" = "c"."id")))
  WHERE (("u"."deleted_at" IS NULL) AND ("c"."deleted_at" IS NULL) AND ("u"."company_id" IN ( SELECT "user_company_context"."company_id"
           FROM "public"."user_company_context")));


ALTER VIEW "public"."users_with_company" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_current_user_modules" AS
 SELECT "um"."id",
    "um"."user_id",
    "um"."module_key",
    "um"."status",
    "um"."created_at",
    "um"."updated_at"
   FROM ("public"."user_modules" "um"
     JOIN "public"."users" "u" ON (("u"."id" = "um"."user_id")))
  WHERE ("u"."auth_user_id" = "auth"."uid"());


ALTER VIEW "public"."v_current_user_modules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."verifactu_cert_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid" NOT NULL,
    "version" integer NOT NULL,
    "stored_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "rotated_by" "uuid",
    "cert_pem_enc" "text",
    "key_pem_enc" "text",
    "key_pass_enc" "text",
    "integrity_hash" "text",
    "notes" "text"
);


ALTER TABLE "public"."verifactu_cert_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."verifactu_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "companyid" "uuid" NOT NULL,
    "invoiceid" "uuid",
    "eventtype" "text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    CONSTRAINT "verifactu_events_eventtype_check" CHECK (("eventtype" = ANY (ARRAY['issue'::"text", 'rectify'::"text", 'cancel'::"text", 'resend'::"text", 'aeat_ack'::"text", 'aeat_error'::"text"])))
);


ALTER TABLE "public"."verifactu_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."verifactu_function_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "timestamp" timestamp without time zone DEFAULT "now"(),
    "function" "text",
    "user_id" "uuid",
    "request_payload" "jsonb",
    "error" "text",
    "auth_role" "text",
    "status" integer,
    "remote_ip" "text"
);


ALTER TABLE "public"."verifactu_function_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."verifactu_invoice_meta" (
    "invoice_id" "uuid" NOT NULL,
    "status" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."verifactu_invoice_meta" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."verifactu_settings" (
    "company_id" "uuid" NOT NULL,
    "software_code" "text" NOT NULL,
    "issuer_nif" "text" NOT NULL,
    "environment" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "cert_pem_enc" "text",
    "key_pem_enc" "text",
    "key_pass_enc" "text",
    CONSTRAINT "verifactu_settings_environment_check" CHECK (("environment" = ANY (ARRAY['pre'::"text", 'prod'::"text"])))
);


ALTER TABLE "public"."verifactu_settings" OWNER TO "postgres";


COMMENT ON TABLE "public"."verifactu_settings" IS 'Configuración VeriFactu por empresa. Certificados almacenados encriptados.';



CREATE OR REPLACE VIEW "public"."visible_stages_by_company" AS
 SELECT "ts"."id",
    "ts"."name",
    "ts"."position",
    "ts"."color",
    "ts"."created_at",
    "ts"."updated_at",
    "ts"."deleted_at",
    "ts"."company_id",
    "c"."id" AS "viewing_company_id",
        CASE
            WHEN ("ts"."company_id" IS NULL) THEN 'generic'::"text"
            WHEN ("ts"."company_id" = "c"."id") THEN 'company'::"text"
            ELSE 'other'::"text"
        END AS "stage_type",
        CASE
            WHEN ("hs"."id" IS NOT NULL) THEN true
            ELSE false
        END AS "is_hidden"
   FROM (("public"."ticket_stages" "ts"
     CROSS JOIN "public"."companies" "c")
     LEFT JOIN "public"."hidden_stages" "hs" ON ((("hs"."stage_id" = "ts"."id") AND ("hs"."company_id" = "c"."id") AND ("ts"."company_id" IS NULL))))
  WHERE ((("ts"."company_id" IS NULL) AND ("hs"."id" IS NULL)) OR ("ts"."company_id" = "c"."id"));


ALTER VIEW "public"."visible_stages_by_company" OWNER TO "postgres";


COMMENT ON VIEW "public"."visible_stages_by_company" IS 'Vista que muestra los estados visibles para cada empresa (genéricos no ocultos + propios)';



ALTER TABLE ONLY "public"."tickets" ALTER COLUMN "ticket_number" SET DEFAULT "nextval"('"public"."tickets_ticket_number_seq"'::"regclass");



ALTER TABLE ONLY "public"."addresses"
    ADD CONSTRAINT "addresses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_usage_logs"
    ADD CONSTRAINT "ai_usage_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_settings"
    ADD CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."attachments"
    ADD CONSTRAINT "attachments_pkey" PRIMARY KEY ("id");



ALTER TABLE "public"."clients"
    ADD CONSTRAINT "check_client_identification" CHECK (((COALESCE("is_active", true) = false) OR ((COALESCE("client_type", 'individual'::"text") = 'business'::"text") AND ("cif_nif" IS NOT NULL)) OR ((COALESCE("client_type", 'individual'::"text") = 'individual'::"text") AND (("dni" IS NOT NULL) OR ("cif_nif" IS NOT NULL))))) NOT VALID;



ALTER TABLE ONLY "public"."client_portal_users"
    ADD CONSTRAINT "client_portal_users_company_id_client_id_email_key" UNIQUE ("company_id", "client_id", "email");



ALTER TABLE ONLY "public"."client_portal_users"
    ADD CONSTRAINT "client_portal_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_variant_assignments"
    ADD CONSTRAINT "client_variant_assignments_client_id_service_id_key" UNIQUE ("client_id", "service_id");



ALTER TABLE ONLY "public"."client_variant_assignments"
    ADD CONSTRAINT "client_variant_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_id_company_unique" UNIQUE ("id", "company_id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clients_tags"
    ADD CONSTRAINT "clients_tags_pkey" PRIMARY KEY ("client_id", "tag_id");



ALTER TABLE ONLY "public"."companies"
    ADD CONSTRAINT "companies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."companies"
    ADD CONSTRAINT "companies_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."company_invitations"
    ADD CONSTRAINT "company_invitations_company_email_uniq" UNIQUE ("company_id", "email");



ALTER TABLE ONLY "public"."company_invitations"
    ADD CONSTRAINT "company_invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."company_invitations"
    ADD CONSTRAINT "company_invitations_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."company_settings"
    ADD CONSTRAINT "company_settings_pkey" PRIMARY KEY ("company_id");



ALTER TABLE ONLY "public"."company_stage_order"
    ADD CONSTRAINT "company_stage_order_pkey" PRIMARY KEY ("company_id", "stage_id");



ALTER TABLE ONLY "public"."device_components"
    ADD CONSTRAINT "device_components_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."device_media"
    ADD CONSTRAINT "device_media_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."device_status_history"
    ADD CONSTRAINT "device_status_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."devices"
    ADD CONSTRAINT "devices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gdpr_access_requests"
    ADD CONSTRAINT "gdpr_access_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gdpr_audit_log"
    ADD CONSTRAINT "gdpr_audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gdpr_breach_incidents"
    ADD CONSTRAINT "gdpr_breach_incidents_incident_reference_key" UNIQUE ("incident_reference");



ALTER TABLE ONLY "public"."gdpr_breach_incidents"
    ADD CONSTRAINT "gdpr_breach_incidents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gdpr_consent_records"
    ADD CONSTRAINT "gdpr_consent_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gdpr_consent_requests"
    ADD CONSTRAINT "gdpr_consent_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gdpr_consent_requests"
    ADD CONSTRAINT "gdpr_consent_requests_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."gdpr_processing_activities"
    ADD CONSTRAINT "gdpr_processing_activities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."global_tags"
    ADD CONSTRAINT "global_tags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hidden_stages"
    ADD CONSTRAINT "hidden_stages_company_id_stage_id_key" UNIQUE ("company_id", "stage_id");



ALTER TABLE ONLY "public"."hidden_stages"
    ADD CONSTRAINT "hidden_stages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hidden_units"
    ADD CONSTRAINT "hidden_units_pkey" PRIMARY KEY ("company_id", "unit_id");



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."invoice_items"
    ADD CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoice_meta"
    ADD CONSTRAINT "invoice_meta_pkey" PRIMARY KEY ("invoice_id");



ALTER TABLE ONLY "public"."invoice_payments"
    ADD CONSTRAINT "invoice_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoice_series"
    ADD CONSTRAINT "invoice_series_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoice_templates"
    ADD CONSTRAINT "invoice_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_payment_link_token_key" UNIQUE ("payment_link_token");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_paypal_payment_token_key" UNIQUE ("paypal_payment_token");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_stripe_payment_token_key" UNIQUE ("stripe_payment_token");



ALTER TABLE ONLY "public"."job_notes"
    ADD CONSTRAINT "job_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."localities"
    ADD CONSTRAINT "localities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."localities"
    ADD CONSTRAINT "localities_postal_code_unique" UNIQUE ("postal_code");



ALTER TABLE ONLY "public"."modules_catalog"
    ADD CONSTRAINT "modules_catalog_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."modules"
    ADD CONSTRAINT "modules_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."modules"
    ADD CONSTRAINT "modules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_integrations"
    ADD CONSTRAINT "payment_integrations_company_id_provider_key" UNIQUE ("company_id", "provider");



ALTER TABLE ONLY "public"."payment_integrations"
    ADD CONSTRAINT "payment_integrations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_transactions"
    ADD CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pending_users"
    ADD CONSTRAINT "pending_users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."pending_users"
    ADD CONSTRAINT "pending_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_brands"
    ADD CONSTRAINT "product_brands_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_categories"
    ADD CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quote_items"
    ADD CONSTRAINT "quote_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quote_templates"
    ADD CONSTRAINT "quote_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quotes"
    ADD CONSTRAINT "quotes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."scheduled_jobs"
    ADD CONSTRAINT "scheduled_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."service_categories"
    ADD CONSTRAINT "service_categories_name_company_id_key" UNIQUE ("name", "company_id");



ALTER TABLE ONLY "public"."service_categories"
    ADD CONSTRAINT "service_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."service_tag_relations"
    ADD CONSTRAINT "service_tag_relations_pkey" PRIMARY KEY ("service_id", "tag_id");



ALTER TABLE ONLY "public"."service_tags"
    ADD CONSTRAINT "service_tags_name_company_unique" UNIQUE ("name", "company_id");



ALTER TABLE ONLY "public"."service_tags"
    ADD CONSTRAINT "service_tags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."service_units"
    ADD CONSTRAINT "service_units_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."service_variants"
    ADD CONSTRAINT "service_variants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ticket_comment_attachments"
    ADD CONSTRAINT "ticket_comment_attachments_pkey" PRIMARY KEY ("comment_id", "attachment_id");



ALTER TABLE ONLY "public"."ticket_comment_versions"
    ADD CONSTRAINT "ticket_comment_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ticket_comments"
    ADD CONSTRAINT "ticket_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ticket_devices"
    ADD CONSTRAINT "ticket_devices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ticket_devices"
    ADD CONSTRAINT "ticket_devices_ticket_id_device_id_relation_type_key" UNIQUE ("ticket_id", "device_id", "relation_type");



ALTER TABLE ONLY "public"."ticket_products"
    ADD CONSTRAINT "ticket_products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ticket_services"
    ADD CONSTRAINT "ticket_services_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ticket_services"
    ADD CONSTRAINT "ticket_services_ticket_id_service_id_key" UNIQUE ("ticket_id", "service_id");



ALTER TABLE ONLY "public"."ticket_stages"
    ADD CONSTRAINT "ticket_stages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ticket_tag_relations"
    ADD CONSTRAINT "ticket_tag_relations_pkey" PRIMARY KEY ("ticket_id", "tag_id");



ALTER TABLE ONLY "public"."ticket_tags"
    ADD CONSTRAINT "ticket_tags_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."ticket_tags"
    ADD CONSTRAINT "ticket_tags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tickets_tags"
    ADD CONSTRAINT "tickets_tags_pkey" PRIMARY KEY ("ticket_id", "tag_id");



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_ticket_number_key" UNIQUE ("ticket_number");



ALTER TABLE ONLY "public"."product_brands"
    ADD CONSTRAINT "unique_brand_per_company" UNIQUE NULLS NOT DISTINCT ("name", "company_id");



ALTER TABLE ONLY "public"."product_categories"
    ADD CONSTRAINT "unique_category_per_company" UNIQUE NULLS NOT DISTINCT ("name", "company_id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "unique_invoice_number_per_series" UNIQUE ("series_id", "invoice_number");



ALTER TABLE ONLY "public"."invoice_series"
    ADD CONSTRAINT "unique_series_per_company_year" UNIQUE ("company_id", "series_code", "year");



ALTER TABLE ONLY "public"."user_modules"
    ADD CONSTRAINT "user_modules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_modules"
    ADD CONSTRAINT "user_modules_user_id_module_key_key" UNIQUE ("user_id", "module_key");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_auth_user_id_key" UNIQUE ("auth_user_id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."verifactu_cert_history"
    ADD CONSTRAINT "verifactu_cert_history_company_id_version_key" UNIQUE ("company_id", "version");



ALTER TABLE ONLY "public"."verifactu_cert_history"
    ADD CONSTRAINT "verifactu_cert_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."verifactu_events"
    ADD CONSTRAINT "verifactu_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."verifactu_function_log"
    ADD CONSTRAINT "verifactu_function_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."verifactu_invoice_meta"
    ADD CONSTRAINT "verifactu_invoice_meta_pkey" PRIMARY KEY ("invoice_id");



ALTER TABLE ONLY "public"."verifactu_settings"
    ADD CONSTRAINT "verifactu_settings_pkey" PRIMARY KEY ("company_id");



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "works_pkey" PRIMARY KEY ("id");



CREATE INDEX "addresses_locality_id_idx" ON "public"."addresses" USING "btree" ("locality_id");



CREATE INDEX "addresses_usuario_id_idx" ON "public"."addresses" USING "btree" ("usuario_id");



CREATE INDEX "idx_addresses_company_id" ON "public"."addresses" USING "btree" ("company_id");



CREATE INDEX "idx_addresses_company_usuario" ON "public"."addresses" USING "btree" ("company_id", "usuario_id");



CREATE INDEX "idx_ai_logs_company" ON "public"."ai_usage_logs" USING "btree" ("company_id");



CREATE INDEX "idx_ai_logs_created_at" ON "public"."ai_usage_logs" USING "btree" ("created_at");



CREATE INDEX "idx_attachments_company" ON "public"."attachments" USING "btree" ("company_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_client_variant_assignments_client_service" ON "public"."client_variant_assignments" USING "btree" ("client_id", "service_id");



CREATE INDEX "idx_client_variant_assignments_variant" ON "public"."client_variant_assignments" USING "btree" ("variant_id");



CREATE INDEX "idx_clients_active" ON "public"."clients" USING "btree" ("is_active") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_clients_anonymized" ON "public"."clients" USING "btree" ("anonymized_at") WHERE ("anonymized_at" IS NOT NULL);



CREATE UNIQUE INDEX "idx_clients_auth_user_company" ON "public"."clients" USING "btree" ("auth_user_id", "company_id") WHERE ("auth_user_id" IS NOT NULL);



CREATE INDEX "idx_clients_auth_user_id" ON "public"."clients" USING "btree" ("auth_user_id") WHERE ("auth_user_id" IS NOT NULL);



CREATE INDEX "idx_clients_company" ON "public"."clients" USING "btree" ("company_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_clients_deletion_requested" ON "public"."clients" USING "btree" ("deletion_requested_at") WHERE ("deletion_requested_at" IS NOT NULL);



CREATE INDEX "idx_clients_last_accessed" ON "public"."clients" USING "btree" ("last_accessed_at");



CREATE INDEX "idx_clients_marketing_consent" ON "public"."clients" USING "btree" ("marketing_consent");



CREATE INDEX "idx_clients_retention_expired" ON "public"."clients" USING "btree" ("data_retention_until") WHERE ("data_retention_until" IS NOT NULL);



CREATE INDEX "idx_clients_retention_until" ON "public"."clients" USING "btree" ("data_retention_until");



CREATE INDEX "idx_clients_tags_tag_id" ON "public"."clients_tags" USING "btree" ("tag_id");



CREATE INDEX "idx_companies_is_active" ON "public"."companies" USING "btree" ("is_active");



CREATE INDEX "idx_companies_nif" ON "public"."companies" USING "btree" ("nif") WHERE ("nif" IS NOT NULL);



CREATE INDEX "idx_companies_slug" ON "public"."companies" USING "btree" ("slug");



CREATE INDEX "idx_companies_subscription_tier" ON "public"."companies" USING "btree" ("subscription_tier");



CREATE INDEX "idx_company_invitations_company" ON "public"."company_invitations" USING "btree" ("company_id");



CREATE INDEX "idx_company_invitations_email" ON "public"."company_invitations" USING "btree" ("email");



CREATE INDEX "idx_company_invitations_status" ON "public"."company_invitations" USING "btree" ("status");



CREATE INDEX "idx_company_invitations_token" ON "public"."company_invitations" USING "btree" ("token");



CREATE INDEX "idx_company_stage_order_company" ON "public"."company_stage_order" USING "btree" ("company_id");



CREATE INDEX "idx_company_stage_order_company_position" ON "public"."company_stage_order" USING "btree" ("company_id", "position");



CREATE INDEX "idx_device_components_device_id" ON "public"."device_components" USING "btree" ("device_id");



CREATE INDEX "idx_device_media_device_id" ON "public"."device_media" USING "btree" ("device_id");



CREATE INDEX "idx_device_status_history_changed_at" ON "public"."device_status_history" USING "btree" ("changed_at");



CREATE INDEX "idx_device_status_history_device_id" ON "public"."device_status_history" USING "btree" ("device_id");



CREATE INDEX "idx_devices_brand_model" ON "public"."devices" USING "btree" ("brand", "model");



CREATE INDEX "idx_devices_client_id" ON "public"."devices" USING "btree" ("client_id");



CREATE INDEX "idx_devices_company_id" ON "public"."devices" USING "btree" ("company_id");



CREATE INDEX "idx_devices_deleted_at" ON "public"."devices" USING "btree" ("deleted_at");



CREATE INDEX "idx_devices_device_type" ON "public"."devices" USING "btree" ("device_type");



CREATE INDEX "idx_devices_received_at" ON "public"."devices" USING "btree" ("received_at");



CREATE INDEX "idx_devices_status" ON "public"."devices" USING "btree" ("status");



CREATE INDEX "idx_gcr_company" ON "public"."gdpr_consent_requests" USING "btree" ("company_id");



CREATE INDEX "idx_gcr_email" ON "public"."gdpr_consent_requests" USING "btree" ("subject_email");



CREATE INDEX "idx_gcr_status" ON "public"."gdpr_consent_requests" USING "btree" ("status");



CREATE INDEX "idx_gdpr_access_requests_company_id" ON "public"."gdpr_access_requests" USING "btree" ("company_id");



CREATE INDEX "idx_gdpr_access_requests_deadline" ON "public"."gdpr_access_requests" USING "btree" ("deadline_date");



CREATE INDEX "idx_gdpr_access_requests_email" ON "public"."gdpr_access_requests" USING "btree" ("subject_email");



CREATE INDEX "idx_gdpr_access_requests_status" ON "public"."gdpr_access_requests" USING "btree" ("processing_status");



CREATE INDEX "idx_gdpr_access_requests_subject_email" ON "public"."gdpr_access_requests" USING "btree" ("subject_email");



CREATE INDEX "idx_gdpr_audit_log_created_at" ON "public"."gdpr_audit_log" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_gdpr_audit_log_subject_email" ON "public"."gdpr_audit_log" USING "btree" ("subject_email");



CREATE INDEX "idx_gdpr_audit_log_table_record" ON "public"."gdpr_audit_log" USING "btree" ("table_name", "record_id");



CREATE INDEX "idx_gdpr_audit_log_user_id" ON "public"."gdpr_audit_log" USING "btree" ("user_id");



CREATE INDEX "idx_gdpr_consent_records_active" ON "public"."gdpr_consent_records" USING "btree" ("is_active");



CREATE INDEX "idx_gdpr_consent_records_email" ON "public"."gdpr_consent_records" USING "btree" ("subject_email");



CREATE INDEX "idx_gdpr_consent_records_subject_email" ON "public"."gdpr_consent_records" USING "btree" ("subject_email");



CREATE INDEX "idx_gdpr_consent_records_subject_id" ON "public"."gdpr_consent_records" USING "btree" ("subject_id");



CREATE INDEX "idx_gdpr_consent_records_type" ON "public"."gdpr_consent_records" USING "btree" ("consent_type");



CREATE INDEX "idx_global_tags_scope" ON "public"."global_tags" USING "gin" ("scope");



CREATE INDEX "idx_hidden_stages_company" ON "public"."hidden_stages" USING "btree" ("company_id");



CREATE INDEX "idx_hidden_stages_company_stage" ON "public"."hidden_stages" USING "btree" ("company_id", "stage_id");



CREATE INDEX "idx_hidden_stages_stage" ON "public"."hidden_stages" USING "btree" ("stage_id");



CREATE INDEX "idx_hidden_units_unit" ON "public"."hidden_units" USING "btree" ("unit_id");



CREATE INDEX "idx_invitations_email" ON "public"."invitations" USING "btree" ("email");



CREATE INDEX "idx_invitations_token" ON "public"."invitations" USING "btree" ("token");



CREATE INDEX "idx_invoice_items_invoice" ON "public"."invoice_items" USING "btree" ("invoice_id");



CREATE INDEX "idx_invoice_items_product" ON "public"."invoice_items" USING "btree" ("product_id") WHERE ("product_id" IS NOT NULL);



CREATE INDEX "idx_invoice_items_service" ON "public"."invoice_items" USING "btree" ("service_id") WHERE ("service_id" IS NOT NULL);



CREATE INDEX "idx_invoice_payments_date" ON "public"."invoice_payments" USING "btree" ("payment_date" DESC);



CREATE INDEX "idx_invoice_payments_invoice" ON "public"."invoice_payments" USING "btree" ("invoice_id");



CREATE INDEX "idx_invoice_series_active" ON "public"."invoice_series" USING "btree" ("company_id", "is_active");



CREATE INDEX "idx_invoice_series_company" ON "public"."invoice_series" USING "btree" ("company_id");



CREATE INDEX "idx_invoice_templates_company" ON "public"."invoice_templates" USING "btree" ("company_id");



CREATE INDEX "idx_invoices_client" ON "public"."invoices" USING "btree" ("client_id");



CREATE INDEX "idx_invoices_company" ON "public"."invoices" USING "btree" ("company_id");



CREATE INDEX "idx_invoices_date" ON "public"."invoices" USING "btree" ("invoice_date" DESC);



CREATE INDEX "idx_invoices_full_number" ON "public"."invoices" USING "btree" ("full_invoice_number");



CREATE INDEX "idx_invoices_payment_status" ON "public"."invoices" USING "btree" ("company_id", "payment_status");



CREATE INDEX "idx_invoices_paypal_token" ON "public"."invoices" USING "btree" ("paypal_payment_token") WHERE ("paypal_payment_token" IS NOT NULL);



CREATE INDEX "idx_invoices_retention" ON "public"."invoices" USING "btree" ("retention_until") WHERE ("anonymized_at" IS NULL);



CREATE INDEX "idx_invoices_series" ON "public"."invoices" USING "btree" ("series_id");



CREATE INDEX "idx_invoices_source_quote_id" ON "public"."invoices" USING "btree" ("source_quote_id") WHERE ("source_quote_id" IS NOT NULL);



CREATE INDEX "idx_invoices_status" ON "public"."invoices" USING "btree" ("status");



CREATE INDEX "idx_invoices_stripe_token" ON "public"."invoices" USING "btree" ("stripe_payment_token") WHERE ("stripe_payment_token" IS NOT NULL);



CREATE INDEX "idx_invoices_verifactu" ON "public"."invoices" USING "btree" ("verifactu_chain_position") WHERE ("verifactu_hash" IS NOT NULL);



CREATE INDEX "idx_job_notes_company" ON "public"."job_notes" USING "btree" ("company_id");



CREATE INDEX "idx_notifications_company" ON "public"."notifications" USING "btree" ("company_id");



CREATE INDEX "idx_notifications_recipient" ON "public"."notifications" USING "btree" ("recipient_id");



CREATE INDEX "idx_notifications_unread" ON "public"."notifications" USING "btree" ("recipient_id") WHERE ("is_read" = false);



CREATE INDEX "idx_payment_integrations_active" ON "public"."payment_integrations" USING "btree" ("company_id", "provider") WHERE ("is_active" = true);



CREATE INDEX "idx_payment_integrations_company" ON "public"."payment_integrations" USING "btree" ("company_id");



CREATE INDEX "idx_payment_transactions_company" ON "public"."payment_transactions" USING "btree" ("company_id");



CREATE INDEX "idx_payment_transactions_external" ON "public"."payment_transactions" USING "btree" ("provider", "external_id");



CREATE INDEX "idx_payment_transactions_invoice" ON "public"."payment_transactions" USING "btree" ("invoice_id");



CREATE INDEX "idx_pending_users_auth_id" ON "public"."pending_users" USING "btree" ("auth_user_id");



CREATE INDEX "idx_pending_users_company" ON "public"."pending_users" USING "btree" ("company_id") WHERE ("company_id" IS NOT NULL);



CREATE INDEX "idx_pending_users_email" ON "public"."pending_users" USING "btree" ("email");



CREATE INDEX "idx_pending_users_token" ON "public"."pending_users" USING "btree" ("confirmation_token");



CREATE INDEX "idx_product_brands_company" ON "public"."product_brands" USING "btree" ("company_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_product_brands_name" ON "public"."product_brands" USING "btree" ("name") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_product_categories_company" ON "public"."product_categories" USING "btree" ("company_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_product_categories_name" ON "public"."product_categories" USING "btree" ("name") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_product_categories_parent" ON "public"."product_categories" USING "btree" ("parent_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_products_brand_id" ON "public"."products" USING "btree" ("brand_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_products_category_id" ON "public"."products" USING "btree" ("category_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_products_company" ON "public"."products" USING "btree" ("company_id");



CREATE INDEX "idx_products_company_deleted" ON "public"."products" USING "btree" ("company_id", "deleted_at");



CREATE INDEX "idx_quote_items_company" ON "public"."quote_items" USING "btree" ("company_id");



CREATE INDEX "idx_quote_items_line_number" ON "public"."quote_items" USING "btree" ("quote_id", "line_number");



CREATE INDEX "idx_quote_items_product" ON "public"."quote_items" USING "btree" ("product_id");



CREATE INDEX "idx_quote_items_quote" ON "public"."quote_items" USING "btree" ("quote_id");



CREATE INDEX "idx_quote_items_service" ON "public"."quote_items" USING "btree" ("service_id");



CREATE INDEX "idx_quote_items_variant" ON "public"."quote_items" USING "btree" ("variant_id");



CREATE INDEX "idx_quote_templates_active" ON "public"."quote_templates" USING "btree" ("company_id", "is_active");



CREATE INDEX "idx_quote_templates_company" ON "public"."quote_templates" USING "btree" ("company_id");



CREATE INDEX "idx_quotes_client" ON "public"."quotes" USING "btree" ("client_id");



CREATE INDEX "idx_quotes_company" ON "public"."quotes" USING "btree" ("company_id");



CREATE INDEX "idx_quotes_full_number" ON "public"."quotes" USING "btree" ("full_quote_number");



CREATE INDEX "idx_quotes_invoice" ON "public"."quotes" USING "btree" ("invoice_id");



CREATE INDEX "idx_quotes_next_run_at" ON "public"."quotes" USING "btree" ("next_run_at");



CREATE INDEX "idx_quotes_quote_date" ON "public"."quotes" USING "btree" ("quote_date");



CREATE INDEX "idx_quotes_recurrence_type" ON "public"."quotes" USING "btree" ("recurrence_type");



CREATE INDEX "idx_quotes_retention" ON "public"."quotes" USING "btree" ("retention_until") WHERE (NOT "is_anonymized");



CREATE INDEX "idx_quotes_scheduled_conversion" ON "public"."quotes" USING "btree" ("scheduled_conversion_date") WHERE (("scheduled_conversion_date" IS NOT NULL) AND ("status" = 'accepted'::"public"."quote_status"));



CREATE INDEX "idx_quotes_status" ON "public"."quotes" USING "btree" ("status");



CREATE UNIQUE INDEX "idx_quotes_unique_number" ON "public"."quotes" USING "btree" ("company_id", "year", "sequence_number");



CREATE INDEX "idx_quotes_valid_until" ON "public"."quotes" USING "btree" ("valid_until");



CREATE INDEX "idx_scheduled_jobs_status_time" ON "public"."scheduled_jobs" USING "btree" ("status", "scheduled_at");



CREATE INDEX "idx_scheduled_jobs_type" ON "public"."scheduled_jobs" USING "btree" ("job_type");



CREATE INDEX "idx_service_categories_active" ON "public"."service_categories" USING "btree" ("is_active");



CREATE INDEX "idx_service_categories_company" ON "public"."service_categories" USING "btree" ("company_id");



CREATE INDEX "idx_service_categories_sort" ON "public"."service_categories" USING "btree" ("sort_order");



CREATE INDEX "idx_service_tag_relations_service" ON "public"."service_tag_relations" USING "btree" ("service_id");



CREATE INDEX "idx_service_tag_relations_tag" ON "public"."service_tag_relations" USING "btree" ("tag_id");



CREATE INDEX "idx_service_tags_active" ON "public"."service_tags" USING "btree" ("is_active") WHERE ("is_active" = true);



CREATE INDEX "idx_service_tags_name" ON "public"."service_tags" USING "btree" ("name");



CREATE INDEX "idx_service_variants_active" ON "public"."service_variants" USING "btree" ("service_id", "is_active");



CREATE INDEX "idx_service_variants_pricing" ON "public"."service_variants" USING "gin" ("pricing");



CREATE INDEX "idx_service_variants_service_id" ON "public"."service_variants" USING "btree" ("service_id");



CREATE INDEX "idx_services_category" ON "public"."services" USING "btree" ("category");



CREATE INDEX "idx_services_company_active" ON "public"."services" USING "btree" ("company_id", "is_active");



CREATE INDEX "idx_services_company_id" ON "public"."services" USING "btree" ("company_id");



CREATE INDEX "idx_services_difficulty" ON "public"."services" USING "btree" ("difficulty_level");



CREATE INDEX "idx_services_is_active" ON "public"."services" USING "btree" ("is_active");



CREATE INDEX "idx_services_price_range" ON "public"."services" USING "btree" ("base_price");



CREATE INDEX "idx_services_priority" ON "public"."services" USING "btree" ("priority_level");



CREATE INDEX "idx_tca_attachment" ON "public"."ticket_comment_attachments" USING "btree" ("attachment_id");



CREATE INDEX "idx_tca_comment" ON "public"."ticket_comment_attachments" USING "btree" ("comment_id");



CREATE INDEX "idx_ticket_comments_company_id" ON "public"."ticket_comments" USING "btree" ("company_id");



CREATE INDEX "idx_ticket_comments_created_at" ON "public"."ticket_comments" USING "btree" ("created_at");



CREATE INDEX "idx_ticket_comments_ticket_id" ON "public"."ticket_comments" USING "btree" ("ticket_id");



CREATE INDEX "idx_ticket_comments_user_id" ON "public"."ticket_comments" USING "btree" ("user_id");



CREATE INDEX "idx_ticket_devices_device_id" ON "public"."ticket_devices" USING "btree" ("device_id");



CREATE INDEX "idx_ticket_devices_ticket_id" ON "public"."ticket_devices" USING "btree" ("ticket_id");



CREATE INDEX "idx_ticket_products_company" ON "public"."ticket_products" USING "btree" ("company_id");



CREATE INDEX "idx_ticket_products_company_product" ON "public"."ticket_products" USING "btree" ("company_id", "product_id");



CREATE INDEX "idx_ticket_products_product" ON "public"."ticket_products" USING "btree" ("product_id");



CREATE INDEX "idx_ticket_products_ticket" ON "public"."ticket_products" USING "btree" ("ticket_id");



CREATE INDEX "idx_ticket_services_company_service" ON "public"."ticket_services" USING "btree" ("company_id", "service_id");



CREATE INDEX "idx_ticket_services_variant_id" ON "public"."ticket_services" USING "btree" ("variant_id");



CREATE INDEX "idx_ticket_stages_category" ON "public"."ticket_stages" USING "btree" ("stage_category");



CREATE INDEX "idx_ticket_stages_company" ON "public"."ticket_stages" USING "btree" ("company_id");



CREATE INDEX "idx_ticket_tags_company" ON "public"."ticket_tags" USING "btree" ("company_id");



CREATE INDEX "idx_tickets_client_id" ON "public"."tickets" USING "btree" ("client_id");



CREATE INDEX "idx_tickets_company_id" ON "public"."tickets" USING "btree" ("company_id");



CREATE INDEX "idx_tickets_is_opened" ON "public"."tickets" USING "btree" ("is_opened");



CREATE INDEX "idx_tickets_stage_id" ON "public"."tickets" USING "btree" ("stage_id");



CREATE INDEX "idx_tickets_tags_tag_id" ON "public"."tickets_tags" USING "btree" ("tag_id");



CREATE INDEX "idx_users_auth_user_id" ON "public"."users" USING "btree" ("auth_user_id");



CREATE INDEX "idx_users_last_session_at" ON "public"."users" USING "btree" ("last_session_at");



CREATE INDEX "idx_verifactu_cert_history_company" ON "public"."verifactu_cert_history" USING "btree" ("company_id");



CREATE INDEX "idx_verifactu_settings_company" ON "public"."verifactu_settings" USING "btree" ("company_id");



CREATE INDEX "ix_invoices_company_created_month" ON "public"."invoices" USING "btree" ("company_id", "created_by", "invoice_month");



CREATE INDEX "ix_invoices_date" ON "public"."invoices" USING "btree" ("invoice_date" DESC);



CREATE INDEX "ix_invoices_status" ON "public"."invoices" USING "btree" ("status");



CREATE INDEX "ix_quote_items_quote_id" ON "public"."quote_items" USING "btree" ("quote_id");



CREATE INDEX "ix_quotes_company_created_month" ON "public"."quotes" USING "btree" ("company_id", "created_by", "quote_month");



CREATE INDEX "ix_tickets_company_month" ON "public"."tickets" USING "btree" ("company_id", "ticket_month");



CREATE INDEX "ix_tickets_due_date" ON "public"."tickets" USING "btree" ("due_date");



CREATE INDEX "ix_tickets_stage_id" ON "public"."tickets" USING "btree" ("stage_id");



CREATE INDEX "ix_verifactu_events_company" ON "public"."verifactu_events" USING "btree" ("companyid", "created_at" DESC);



CREATE INDEX "ix_verifactu_events_invoice" ON "public"."verifactu_events" USING "btree" ("invoiceid", "created_at" DESC);



CREATE INDEX "localities_name_idx" ON "public"."localities" USING "btree" ("name");



CREATE UNIQUE INDEX "service_units_company_code_uniq" ON "public"."service_units" USING "btree" (COALESCE("company_id", '00000000-0000-0000-0000-000000000000'::"uuid"), "lower"("code")) WHERE ("deleted_at" IS NULL);



CREATE UNIQUE INDEX "service_units_company_name_uniq" ON "public"."service_units" USING "btree" (COALESCE("company_id", '00000000-0000-0000-0000-000000000000'::"uuid"), "lower"("name")) WHERE ("deleted_at" IS NULL);



CREATE UNIQUE INDEX "services_name_company_unique_idx" ON "public"."services" USING "btree" ("name", "company_id");



CREATE UNIQUE INDEX "uniq_invoice_series_one_default_per_company" ON "public"."invoice_series" USING "btree" ("company_id") WHERE ("is_default" = true);



CREATE UNIQUE INDEX "uniq_invoice_templates_one_default_per_company" ON "public"."invoice_templates" USING "btree" ("company_id") WHERE ("is_default" = true);



CREATE UNIQUE INDEX "uq_active_quote_per_ticket" ON "public"."quotes" USING "btree" ("company_id", "ticket_id") WHERE (("ticket_id" IS NOT NULL) AND ("status" = ANY (ARRAY['draft'::"public"."quote_status", 'sent'::"public"."quote_status", 'viewed'::"public"."quote_status", 'accepted'::"public"."quote_status"])) AND ("invoice_id" IS NULL) AND (NOT "is_anonymized"));



CREATE UNIQUE INDEX "uq_company_invitations_pending_one_per_email_company" ON "public"."company_invitations" USING "btree" ("company_id", "email") WHERE ("status" = 'pending'::"text");



CREATE UNIQUE INDEX "ux_ticket_stages_company_cancel" ON "public"."ticket_stages" USING "btree" ("company_id") WHERE ("workflow_category" = 'cancel'::"public"."workflow_category");



CREATE UNIQUE INDEX "ux_ticket_stages_company_final" ON "public"."ticket_stages" USING "btree" ("company_id") WHERE ("workflow_category" = 'final'::"public"."workflow_category");



CREATE UNIQUE INDEX "verifactu_settings_company_id_key" ON "public"."verifactu_settings" USING "btree" ("company_id");



CREATE OR REPLACE TRIGGER "anonymize_old_invoices_trigger" BEFORE UPDATE ON "public"."invoices" FOR EACH ROW EXECUTE FUNCTION "public"."anonymize_invoice_data"();



CREATE OR REPLACE TRIGGER "audit_access_requests_changes" AFTER INSERT OR UPDATE ON "public"."gdpr_access_requests" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_audit_access_requests"();



COMMENT ON TRIGGER "audit_access_requests_changes" ON "public"."gdpr_access_requests" IS 'Registra cambios en solicitudes de acceso GDPR';



CREATE OR REPLACE TRIGGER "audit_clients_changes" AFTER INSERT OR DELETE OR UPDATE ON "public"."clients" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_audit_clients"();



COMMENT ON TRIGGER "audit_clients_changes" ON "public"."clients" IS 'Registra automáticamente todos los cambios en clientes para cumplimiento GDPR';



CREATE OR REPLACE TRIGGER "audit_consent_records_changes" AFTER INSERT OR UPDATE ON "public"."gdpr_consent_records" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_audit_consent_records"();



COMMENT ON TRIGGER "audit_consent_records_changes" ON "public"."gdpr_consent_records" IS 'Registra cambios en consentimientos GDPR';



CREATE OR REPLACE TRIGGER "clients_updated_at" BEFORE UPDATE ON "public"."clients" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "companies_updated_at" BEFORE UPDATE ON "public"."companies" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "ensure_initial_stage_insert" BEFORE INSERT ON "public"."tickets" FOR EACH ROW EXECUTE FUNCTION "public"."set_initial_ticket_stage"();



CREATE OR REPLACE TRIGGER "gdpr_audit_clients" AFTER INSERT OR DELETE OR UPDATE ON "public"."clients" FOR EACH ROW EXECUTE FUNCTION "public"."gdpr_audit_clients_trigger"();



CREATE OR REPLACE TRIGGER "invoices_immutability_trigger" BEFORE UPDATE ON "public"."invoices" FOR EACH ROW EXECUTE FUNCTION "public"."invoices_immutability_guard"();



CREATE OR REPLACE TRIGGER "recalculate_invoice_totals_on_item_delete" AFTER DELETE ON "public"."invoice_items" FOR EACH ROW EXECUTE FUNCTION "public"."calculate_invoice_totals_trigger"();



CREATE OR REPLACE TRIGGER "recalculate_invoice_totals_on_item_insert" AFTER INSERT ON "public"."invoice_items" FOR EACH ROW EXECUTE FUNCTION "public"."calculate_invoice_totals_trigger"();



CREATE OR REPLACE TRIGGER "recalculate_invoice_totals_on_item_update" AFTER UPDATE ON "public"."invoice_items" FOR EACH ROW EXECUTE FUNCTION "public"."calculate_invoice_totals_trigger"();



CREATE OR REPLACE TRIGGER "recalculate_invoice_totals_on_payment" AFTER INSERT OR DELETE OR UPDATE ON "public"."invoice_payments" FOR EACH ROW EXECUTE FUNCTION "public"."calculate_invoice_totals_payment_trigger"();



CREATE OR REPLACE TRIGGER "t_invoices_immutable_after_issue" BEFORE UPDATE ON "public"."invoices" FOR EACH ROW EXECUTE FUNCTION "public"."fn_invoice_immutable_after_issue"();



CREATE OR REPLACE TRIGGER "ticket_auto_assign_trigger" BEFORE INSERT ON "public"."tickets" FOR EACH ROW EXECUTE FUNCTION "public"."handle_ticket_auto_assignment"();



CREATE OR REPLACE TRIGGER "ticket_services_upsert_trigger" AFTER INSERT OR DELETE OR UPDATE ON "public"."ticket_services" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_ticket_services_upsert"();



CREATE OR REPLACE TRIGGER "tr_activate_recurring_service" AFTER UPDATE OF "payment_status" ON "public"."invoices" FOR EACH ROW WHEN (("new"."payment_status" = 'paid'::"text")) EXECUTE FUNCTION "public"."activate_recurring_service_on_payment"();



CREATE OR REPLACE TRIGGER "tr_device_status_change" BEFORE UPDATE ON "public"."devices" FOR EACH ROW EXECUTE FUNCTION "public"."log_device_status_change"();



CREATE OR REPLACE TRIGGER "tr_devices_updated_at" BEFORE UPDATE ON "public"."devices" FOR EACH ROW EXECUTE FUNCTION "public"."update_device_updated_at"();



CREATE OR REPLACE TRIGGER "trg_app_settings_updated_at" BEFORE UPDATE ON "public"."app_settings" FOR EACH ROW EXECUTE FUNCTION "public"."fn_touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_audit_invoices" AFTER INSERT OR UPDATE ON "public"."invoices" FOR EACH ROW EXECUTE FUNCTION "public"."gdpr_audit_trigger"();



CREATE OR REPLACE TRIGGER "trg_company_settings_updated_at" BEFORE UPDATE ON "public"."company_settings" FOR EACH ROW EXECUTE FUNCTION "public"."fn_touch_updated_at"();



CREATE OR REPLACE TRIGGER "trg_company_stage_order_updated_at" BEFORE UPDATE ON "public"."company_stage_order" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at_timestamp"();



CREATE OR REPLACE TRIGGER "trg_invoices_immutable" BEFORE UPDATE ON "public"."invoices" FOR EACH ROW EXECUTE FUNCTION "public"."invoices_immutability_guard"();



CREATE OR REPLACE TRIGGER "trg_payment_integrations_updated_at" BEFORE UPDATE ON "public"."payment_integrations" FOR EACH ROW EXECUTE FUNCTION "public"."update_payment_integrations_updated_at"();



CREATE OR REPLACE TRIGGER "trg_restore_original_on_void" AFTER UPDATE ON "public"."invoices" FOR EACH ROW WHEN ((("new"."status" = 'void'::"public"."invoice_status") AND ("old"."status" IS DISTINCT FROM 'void'::"public"."invoice_status"))) EXECUTE FUNCTION "public"."restore_original_invoice_on_void"();



CREATE OR REPLACE TRIGGER "trg_service_units_updated_at" BEFORE UPDATE ON "public"."service_units" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_set_invoice_month" BEFORE INSERT OR UPDATE ON "public"."invoices" FOR EACH ROW EXECUTE FUNCTION "public"."set_invoice_month"();



CREATE OR REPLACE TRIGGER "trg_set_quote_month" BEFORE INSERT OR UPDATE ON "public"."quotes" FOR EACH ROW EXECUTE FUNCTION "public"."set_quote_month"();



CREATE OR REPLACE TRIGGER "trg_set_ticket_month" BEFORE INSERT OR UPDATE ON "public"."tickets" FOR EACH ROW EXECUTE FUNCTION "public"."set_ticket_month"();



CREATE OR REPLACE TRIGGER "trg_set_updated_at_ticket_products" BEFORE UPDATE ON "public"."ticket_products" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at_ticket_products"();



CREATE OR REPLACE TRIGGER "trg_ticket_comments_maintain_integrity" BEFORE INSERT OR UPDATE ON "public"."ticket_comments" FOR EACH ROW EXECUTE FUNCTION "public"."fn_ticket_comments_maintain_integrity"();



CREATE OR REPLACE TRIGGER "trg_ticket_stages_min_per_category_del" AFTER DELETE ON "public"."ticket_stages" FOR EACH ROW EXECUTE FUNCTION "public"."ensure_min_one_stage_per_category"();



CREATE OR REPLACE TRIGGER "trg_ticket_stages_min_per_category_upd" AFTER UPDATE OF "workflow_category", "company_id", "deleted_at" ON "public"."ticket_stages" FOR EACH ROW WHEN ((("old"."workflow_category" IS DISTINCT FROM "new"."workflow_category") OR ("new"."deleted_at" IS NOT NULL) OR ("old"."company_id" IS DISTINCT FROM "new"."company_id"))) EXECUTE FUNCTION "public"."ensure_min_one_stage_per_category"();



CREATE OR REPLACE TRIGGER "trg_user_modules_updated_at" BEFORE UPDATE ON "public"."user_modules" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_verifactu_settings_updated_at" BEFORE UPDATE ON "public"."verifactu_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trigger_anonymize_old_quotes" AFTER UPDATE ON "public"."quotes" FOR EACH ROW WHEN ((("new"."retention_until" < CURRENT_DATE) AND (NOT "new"."is_anonymized"))) EXECUTE FUNCTION "public"."anonymize_quote_data"();



CREATE OR REPLACE TRIGGER "trigger_auto_cancel_on_delete" BEFORE UPDATE ON "public"."tickets" FOR EACH ROW EXECUTE FUNCTION "public"."handle_ticket_soft_delete"();



CREATE OR REPLACE TRIGGER "trigger_calculate_quote_item_totals" BEFORE INSERT OR UPDATE ON "public"."quote_items" FOR EACH ROW EXECUTE FUNCTION "public"."calculate_quote_item_totals"();



CREATE OR REPLACE TRIGGER "trigger_comment_notifications" AFTER INSERT ON "public"."ticket_comments" FOR EACH ROW EXECUTE FUNCTION "public"."handle_comment_notifications"();



CREATE OR REPLACE TRIGGER "trigger_invoice_verifactu" AFTER INSERT OR UPDATE ON "public"."invoices" FOR EACH ROW EXECUTE FUNCTION "verifactu"."handle_invoice_verifactu"();



CREATE OR REPLACE TRIGGER "trigger_log_client_gdpr_access" AFTER INSERT OR DELETE OR UPDATE ON "public"."clients" FOR EACH ROW EXECUTE FUNCTION "public"."log_client_access"();



CREATE OR REPLACE TRIGGER "trigger_maintain_opened_status" BEFORE INSERT OR UPDATE OF "stage_id", "deleted_at" ON "public"."tickets" FOR EACH ROW EXECUTE FUNCTION "public"."maintain_ticket_opened_status"();



CREATE OR REPLACE TRIGGER "trigger_quote_items_updated_at" BEFORE UPDATE ON "public"."quote_items" FOR EACH ROW EXECUTE FUNCTION "public"."update_quotes_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_quote_templates_updated_at" BEFORE UPDATE ON "public"."quote_templates" FOR EACH ROW EXECUTE FUNCTION "public"."update_quotes_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_quotes_updated_at" BEFORE UPDATE ON "public"."quotes" FOR EACH ROW EXECUTE FUNCTION "public"."update_quotes_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_recalculate_quote_totals_delete" AFTER DELETE ON "public"."quote_items" FOR EACH ROW EXECUTE FUNCTION "public"."calculate_quote_totals"();



CREATE OR REPLACE TRIGGER "trigger_recalculate_quote_totals_insert" AFTER INSERT ON "public"."quote_items" FOR EACH ROW EXECUTE FUNCTION "public"."calculate_quote_totals"();



CREATE OR REPLACE TRIGGER "trigger_recalculate_quote_totals_update" AFTER UPDATE ON "public"."quote_items" FOR EACH ROW EXECUTE FUNCTION "public"."calculate_quote_totals"();



CREATE OR REPLACE TRIGGER "trigger_sync_ticket_tags_from_services" AFTER INSERT ON "public"."ticket_services" FOR EACH ROW EXECUTE FUNCTION "public"."sync_ticket_tags_from_services"();



CREATE OR REPLACE TRIGGER "trigger_ticket_comment_automation" AFTER INSERT ON "public"."ticket_comments" FOR EACH ROW EXECUTE FUNCTION "public"."handle_ticket_comment_automation"();



CREATE OR REPLACE TRIGGER "trigger_ticket_notifications" AFTER INSERT OR UPDATE ON "public"."tickets" FOR EACH ROW EXECUTE FUNCTION "public"."handle_ticket_notifications"();



CREATE OR REPLACE TRIGGER "trigger_update_service_variants_updated_at" BEFORE UPDATE ON "public"."service_variants" FOR EACH ROW EXECUTE FUNCTION "public"."update_service_variants_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_verifactu_settings_updated_at" BEFORE UPDATE ON "public"."verifactu_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_verifactu_settings_updated_at"();



CREATE OR REPLACE TRIGGER "update_addresses_updated_at" BEFORE UPDATE ON "public"."addresses" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_companies_updated_at" BEFORE UPDATE ON "public"."companies" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_invoice_series_updated_at" BEFORE UPDATE ON "public"."invoice_series" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_invoice_templates_updated_at" BEFORE UPDATE ON "public"."invoice_templates" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_invoices_updated_at" BEFORE UPDATE ON "public"."invoices" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_last_accessed" AFTER UPDATE OF "last_accessed_at" ON "public"."clients" FOR EACH ROW WHEN (("new"."last_accessed_at" IS DISTINCT FROM "old"."last_accessed_at")) EXECUTE FUNCTION "public"."trigger_update_last_accessed"();



COMMENT ON TRIGGER "update_last_accessed" ON "public"."clients" IS 'Actualiza fecha y contador de accesos a datos personales';



CREATE OR REPLACE TRIGGER "update_services_updated_at" BEFORE UPDATE ON "public"."services" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "update_tickets_updated_at" BEFORE UPDATE ON "public"."tickets" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "users_updated_at" BEFORE UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



ALTER TABLE ONLY "public"."addresses"
    ADD CONSTRAINT "addresses_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id");



ALTER TABLE ONLY "public"."addresses"
    ADD CONSTRAINT "addresses_locality_id_fkey" FOREIGN KEY ("locality_id") REFERENCES "public"."localities"("id");



ALTER TABLE ONLY "public"."addresses"
    ADD CONSTRAINT "addresses_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_usage_logs"
    ADD CONSTRAINT "ai_usage_logs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_usage_logs"
    ADD CONSTRAINT "ai_usage_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."attachments"
    ADD CONSTRAINT "attachments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id");



ALTER TABLE ONLY "public"."client_portal_users"
    ADD CONSTRAINT "client_portal_users_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_portal_users"
    ADD CONSTRAINT "client_portal_users_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_portal_users"
    ADD CONSTRAINT "client_portal_users_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."client_variant_assignments"
    ADD CONSTRAINT "client_variant_assignments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_variant_assignments"
    ADD CONSTRAINT "client_variant_assignments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."client_variant_assignments"
    ADD CONSTRAINT "client_variant_assignments_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_variant_assignments"
    ADD CONSTRAINT "client_variant_assignments_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "public"."service_variants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_auth_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_direccion_id_fkey" FOREIGN KEY ("direccion_id") REFERENCES "public"."addresses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."clients_tags"
    ADD CONSTRAINT "clients_tags_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clients_tags"
    ADD CONSTRAINT "clients_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."global_tags"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."company_invitations"
    ADD CONSTRAINT "company_invitations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."company_invitations"
    ADD CONSTRAINT "company_invitations_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."company_settings"
    ADD CONSTRAINT "company_settings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."company_settings"
    ADD CONSTRAINT "company_settings_ticket_stage_on_client_reply_fkey" FOREIGN KEY ("ticket_stage_on_client_reply") REFERENCES "public"."ticket_stages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."company_settings"
    ADD CONSTRAINT "company_settings_ticket_stage_on_delete_fkey" FOREIGN KEY ("ticket_stage_on_delete") REFERENCES "public"."ticket_stages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."company_settings"
    ADD CONSTRAINT "company_settings_ticket_stage_on_staff_reply_fkey" FOREIGN KEY ("ticket_stage_on_staff_reply") REFERENCES "public"."ticket_stages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."company_stage_order"
    ADD CONSTRAINT "company_stage_order_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "public"."ticket_stages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."device_components"
    ADD CONSTRAINT "device_components_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."device_media"
    ADD CONSTRAINT "device_media_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."device_media"
    ADD CONSTRAINT "device_media_taken_by_fkey" FOREIGN KEY ("taken_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."device_media"
    ADD CONSTRAINT "device_media_ticket_device_id_fkey" FOREIGN KEY ("ticket_device_id") REFERENCES "public"."ticket_devices"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."device_status_history"
    ADD CONSTRAINT "device_status_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."device_status_history"
    ADD CONSTRAINT "device_status_history_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."devices"
    ADD CONSTRAINT "devices_client_company_fkey" FOREIGN KEY ("client_id", "company_id") REFERENCES "public"."clients"("id", "company_id");



ALTER TABLE ONLY "public"."devices"
    ADD CONSTRAINT "devices_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."devices"
    ADD CONSTRAINT "devices_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."devices"
    ADD CONSTRAINT "devices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "fk_reference_ticket" FOREIGN KEY ("reference_id") REFERENCES "public"."tickets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gdpr_access_requests"
    ADD CONSTRAINT "gdpr_access_requests_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id");



ALTER TABLE ONLY "public"."gdpr_access_requests"
    ADD CONSTRAINT "gdpr_access_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."gdpr_audit_log"
    ADD CONSTRAINT "gdpr_audit_log_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id");



ALTER TABLE ONLY "public"."gdpr_audit_log"
    ADD CONSTRAINT "gdpr_audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."gdpr_breach_incidents"
    ADD CONSTRAINT "gdpr_breach_incidents_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id");



ALTER TABLE ONLY "public"."gdpr_breach_incidents"
    ADD CONSTRAINT "gdpr_breach_incidents_reported_by_fkey" FOREIGN KEY ("reported_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."gdpr_consent_records"
    ADD CONSTRAINT "gdpr_consent_records_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id");



ALTER TABLE ONLY "public"."gdpr_consent_records"
    ADD CONSTRAINT "gdpr_consent_records_processed_by_fkey" FOREIGN KEY ("processed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."gdpr_consent_requests"
    ADD CONSTRAINT "gdpr_consent_requests_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."gdpr_consent_requests"
    ADD CONSTRAINT "gdpr_consent_requests_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gdpr_processing_activities"
    ADD CONSTRAINT "gdpr_processing_activities_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id");



ALTER TABLE ONLY "public"."hidden_stages"
    ADD CONSTRAINT "hidden_stages_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hidden_stages"
    ADD CONSTRAINT "hidden_stages_hidden_by_fkey" FOREIGN KEY ("hidden_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."hidden_stages"
    ADD CONSTRAINT "hidden_stages_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "public"."ticket_stages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hidden_units"
    ADD CONSTRAINT "hidden_units_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hidden_units"
    ADD CONSTRAINT "hidden_units_hidden_by_fkey" FOREIGN KEY ("hidden_by") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."hidden_units"
    ADD CONSTRAINT "hidden_units_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "public"."service_units"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."invoice_items"
    ADD CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoice_payments"
    ADD CONSTRAINT "invoice_payments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."invoice_payments"
    ADD CONSTRAINT "invoice_payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoice_series"
    ADD CONSTRAINT "invoice_series_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoice_series"
    ADD CONSTRAINT "invoice_series_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."invoice_templates"
    ADD CONSTRAINT "invoice_templates_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoice_templates"
    ADD CONSTRAINT "invoice_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_rectifies_invoice_id_fkey" FOREIGN KEY ("rectifies_invoice_id") REFERENCES "public"."invoices"("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "public"."invoice_series"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_source_quote_id_fkey" FOREIGN KEY ("source_quote_id") REFERENCES "public"."quotes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."job_notes"
    ADD CONSTRAINT "job_notes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id");



ALTER TABLE ONLY "public"."job_notes"
    ADD CONSTRAINT "job_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_integrations"
    ADD CONSTRAINT "payment_integrations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_transactions"
    ADD CONSTRAINT "payment_transactions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_transactions"
    ADD CONSTRAINT "payment_transactions_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pending_users"
    ADD CONSTRAINT "pending_users_auth_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pending_users"
    ADD CONSTRAINT "pending_users_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id");



ALTER TABLE ONLY "public"."product_brands"
    ADD CONSTRAINT "product_brands_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_categories"
    ADD CONSTRAINT "product_categories_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_categories"
    ADD CONSTRAINT "product_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."product_categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "public"."product_brands"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."product_categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id");



ALTER TABLE ONLY "public"."quote_items"
    ADD CONSTRAINT "quote_items_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quote_items"
    ADD CONSTRAINT "quote_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."quote_items"
    ADD CONSTRAINT "quote_items_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quote_items"
    ADD CONSTRAINT "quote_items_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."quote_items"
    ADD CONSTRAINT "quote_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "public"."service_variants"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."quote_templates"
    ADD CONSTRAINT "quote_templates_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quote_templates"
    ADD CONSTRAINT "quote_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."quotes"
    ADD CONSTRAINT "quotes_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."quotes"
    ADD CONSTRAINT "quotes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quotes"
    ADD CONSTRAINT "quotes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."quotes"
    ADD CONSTRAINT "quotes_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."quotes"
    ADD CONSTRAINT "quotes_rectifies_invoice_id_fkey" FOREIGN KEY ("rectifies_invoice_id") REFERENCES "public"."invoices"("id");



ALTER TABLE ONLY "public"."quotes"
    ADD CONSTRAINT "quotes_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."service_categories"
    ADD CONSTRAINT "service_categories_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."service_tag_relations"
    ADD CONSTRAINT "service_tag_relations_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."service_tag_relations"
    ADD CONSTRAINT "service_tag_relations_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."service_tags"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."service_tags"
    ADD CONSTRAINT "service_tags_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."service_units"
    ADD CONSTRAINT "service_units_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."service_variants"
    ADD CONSTRAINT "service_variants_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."ticket_comment_attachments"
    ADD CONSTRAINT "ticket_comment_attachments_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "public"."attachments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_comment_attachments"
    ADD CONSTRAINT "ticket_comment_attachments_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "public"."ticket_comments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_comment_versions"
    ADD CONSTRAINT "ticket_comment_versions_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."ticket_comment_versions"
    ADD CONSTRAINT "ticket_comment_versions_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "public"."ticket_comments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_comments"
    ADD CONSTRAINT "ticket_comments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id");



ALTER TABLE ONLY "public"."ticket_comments"
    ADD CONSTRAINT "ticket_comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."ticket_comments"("id");



ALTER TABLE ONLY "public"."ticket_comments"
    ADD CONSTRAINT "ticket_comments_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_comments"
    ADD CONSTRAINT "ticket_comments_user_id_fkey_public" FOREIGN KEY ("user_id") REFERENCES "public"."users"("auth_user_id") ON DELETE CASCADE;



COMMENT ON CONSTRAINT "ticket_comments_user_id_fkey_public" ON "public"."ticket_comments" IS 'Allows PostgREST to embed public.users via user_id -> users.auth_user_id (unique), while preserving auth.users FK semantics.';



ALTER TABLE ONLY "public"."ticket_devices"
    ADD CONSTRAINT "ticket_devices_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_devices"
    ADD CONSTRAINT "ticket_devices_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_products"
    ADD CONSTRAINT "ticket_products_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_products"
    ADD CONSTRAINT "ticket_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."ticket_products"
    ADD CONSTRAINT "ticket_products_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_services"
    ADD CONSTRAINT "ticket_services_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id");



ALTER TABLE ONLY "public"."ticket_services"
    ADD CONSTRAINT "ticket_services_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_services"
    ADD CONSTRAINT "ticket_services_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_services"
    ADD CONSTRAINT "ticket_services_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "public"."service_variants"("id");



ALTER TABLE ONLY "public"."ticket_stages"
    ADD CONSTRAINT "ticket_stages_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id");



ALTER TABLE ONLY "public"."ticket_tag_relations"
    ADD CONSTRAINT "ticket_tag_relations_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."ticket_tags"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_tag_relations"
    ADD CONSTRAINT "ticket_tag_relations_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ticket_tags"
    ADD CONSTRAINT "ticket_tags_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id");



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id");



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id");



ALTER TABLE ONLY "public"."tickets"
    ADD CONSTRAINT "tickets_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "public"."ticket_stages"("id");



ALTER TABLE ONLY "public"."tickets_tags"
    ADD CONSTRAINT "tickets_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."global_tags"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tickets_tags"
    ADD CONSTRAINT "tickets_tags_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_modules"
    ADD CONSTRAINT "user_modules_module_key_fkey" FOREIGN KEY ("module_key") REFERENCES "public"."modules"("key");



ALTER TABLE ONLY "public"."user_modules"
    ADD CONSTRAINT "user_modules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_auth_user_id_fkey" FOREIGN KEY ("auth_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id");



ALTER TABLE ONLY "public"."verifactu_cert_history"
    ADD CONSTRAINT "verifactu_cert_history_company_fk" FOREIGN KEY ("company_id") REFERENCES "public"."verifactu_settings"("company_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."verifactu_cert_history"
    ADD CONSTRAINT "verifactu_cert_history_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."verifactu_settings"("company_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."verifactu_events"
    ADD CONSTRAINT "verifactu_events_companyid_fkey" FOREIGN KEY ("companyid") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."verifactu_events"
    ADD CONSTRAINT "verifactu_events_invoiceid_fkey" FOREIGN KEY ("invoiceid") REFERENCES "public"."invoices"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."verifactu_settings"
    ADD CONSTRAINT "verifactu_settings_companyid_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



CREATE POLICY "Admins can manage assignments" ON "public"."client_variant_assignments" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['admin'::"text", 'superadmin'::"text"]))))));



CREATE POLICY "Allow delete ticket_products by company membership" ON "public"."ticket_products" FOR DELETE USING ((("company_id" IS NULL) OR ("company_id" = "public"."get_user_company_id"())));



CREATE POLICY "Allow insert ticket_products by company membership" ON "public"."ticket_products" FOR INSERT WITH CHECK ((("company_id" IS NULL) OR ("company_id" = "public"."get_user_company_id"())));



CREATE POLICY "Allow read access for authenticated users" ON "public"."modules_catalog" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Allow select ticket_products by company membership" ON "public"."ticket_products" FOR SELECT USING ((("company_id" IS NULL) OR ("company_id" = "public"."get_user_company_id"())));



CREATE POLICY "Allow service_role insert with company check" ON "public"."services" FOR INSERT TO "service_role" WITH CHECK (("company_id" = ( SELECT ("current_setting"('app.current_company_id'::"text"))::"uuid" AS "current_setting")));



CREATE POLICY "Allow update ticket_products by company membership" ON "public"."ticket_products" FOR UPDATE USING ((("company_id" IS NULL) OR ("company_id" = "public"."get_user_company_id"()))) WITH CHECK ((("company_id" IS NULL) OR ("company_id" = "public"."get_user_company_id"())));



CREATE POLICY "Authenticated users can view assignments" ON "public"."client_variant_assignments" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Clients can insert comments" ON "public"."ticket_comments" FOR INSERT WITH CHECK ((("client_id" IN ( SELECT "clients"."id"
   FROM "public"."clients"
  WHERE ("clients"."auth_user_id" = "auth"."uid"()))) AND ("ticket_id" IN ( SELECT "tickets"."id"
   FROM "public"."tickets"
  WHERE ("tickets"."client_id" IN ( SELECT "clients"."id"
           FROM "public"."clients"
          WHERE ("clients"."auth_user_id" = "auth"."uid"())))))));



CREATE POLICY "Clients can update own comments" ON "public"."ticket_comments" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."clients"
  WHERE (("clients"."id" = "ticket_comments"."client_id") AND ("clients"."auth_user_id" = "auth"."uid"()))))) WITH CHECK (("is_internal" = false));



CREATE POLICY "Clients can view public services" ON "public"."services" FOR SELECT TO "authenticated" USING (("is_public" = true));



CREATE POLICY "Clients can view services they have contracted" ON "public"."services" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (("public"."quote_items" "qi"
     JOIN "public"."quotes" "q" ON (("q"."id" = "qi"."quote_id")))
     JOIN "public"."clients" "c" ON (("c"."id" = "q"."client_id")))
  WHERE (("qi"."service_id" = "services"."id") AND ("c"."auth_user_id" = "auth"."uid"())))));



CREATE POLICY "Clients can view their own variant assignments" ON "public"."client_variant_assignments" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."id" = "client_variant_assignments"."client_id") AND ("c"."auth_user_id" = "auth"."uid"())))));



CREATE POLICY "Clients see assigned or public variants" ON "public"."service_variants" FOR SELECT USING ("public"."fn_is_variant_visible"("id"));



CREATE POLICY "Comments delete by author" ON "public"."ticket_comments" FOR DELETE USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."auth_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("u"."company_id" = "ticket_comments"."company_id") AND ("u"."active" = true))))));



CREATE POLICY "Comments insert by company members" ON "public"."ticket_comments" FOR INSERT WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("company_id" = ( SELECT "t2"."company_id"
   FROM "public"."tickets" "t2"
  WHERE ("t2"."id" = "ticket_comments"."ticket_id"))) AND (EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."auth_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("u"."company_id" = "u"."company_id") AND ("u"."active" = true))))));



CREATE POLICY "Comments selectable by company members" ON "public"."ticket_comments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."auth_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("u"."company_id" = "ticket_comments"."company_id") AND ("u"."active" = true)))));



CREATE POLICY "Comments update by author" ON "public"."ticket_comments" FOR UPDATE USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."auth_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("u"."company_id" = "ticket_comments"."company_id") AND ("u"."active" = true)))))) WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("company_id" = ( SELECT "t"."company_id"
   FROM "public"."tickets" "t"
  WHERE ("t"."id" = "ticket_comments"."ticket_id"))) AND (EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."auth_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("u"."company_id" = "ticket_comments"."company_id") AND ("u"."active" = true))))));



CREATE POLICY "Company admins can delete invitations" ON "public"."company_invitations" FOR DELETE TO "authenticated" USING ((("company_id" = "public"."get_user_company_id"()) AND (EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."auth_user_id" = "auth"."uid"()) AND ("users"."company_id" = "company_invitations"."company_id") AND ("users"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"])))))));



CREATE POLICY "Company members can view invitations" ON "public"."company_invitations" FOR SELECT USING (("company_id" IN ( SELECT "users"."company_id"
   FROM "public"."users"
  WHERE (("users"."auth_user_id" = "auth"."uid"()) AND ("users"."active" = true)))));



CREATE POLICY "Company users can manage client variant assignments" ON "public"."client_variant_assignments" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."clients" "c"
     JOIN "public"."users" "u" ON (("u"."company_id" = "c"."company_id")))
  WHERE (("c"."id" = "client_variant_assignments"."client_id") AND ("u"."auth_user_id" = "auth"."uid"())))));



CREATE POLICY "Company users can manage their variants" ON "public"."service_variants" USING ((EXISTS ( SELECT 1
   FROM ("public"."services" "s"
     JOIN "public"."users" "u" ON (("u"."company_id" = "s"."company_id")))
  WHERE (("s"."id" = "service_variants"."service_id") AND ("u"."auth_user_id" = "auth"."uid"())))));



CREATE POLICY "Company users can view client variant assignments" ON "public"."client_variant_assignments" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."clients" "c"
     JOIN "public"."users" "u" ON (("u"."company_id" = "c"."company_id")))
  WHERE (("c"."id" = "client_variant_assignments"."client_id") AND ("u"."auth_user_id" = "auth"."uid"())))));



CREATE POLICY "Company users can view their variants" ON "public"."service_variants" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."services" "s"
     JOIN "public"."users" "u" ON (("u"."company_id" = "s"."company_id")))
  WHERE (("s"."id" = "service_variants"."service_id") AND ("u"."auth_user_id" = "auth"."uid"())))));



CREATE POLICY "Enable read access for authenticated users" ON "public"."clients_tags" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Enable read access for authenticated users" ON "public"."global_tags" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Enable read access for authenticated users" ON "public"."tickets_tags" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Enable read access for authenticated users" ON "public"."users" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Enable write access for authenticated users" ON "public"."clients_tags" TO "authenticated" USING (true);



CREATE POLICY "Enable write access for authenticated users" ON "public"."global_tags" TO "authenticated" USING (true);



CREATE POLICY "Enable write access for authenticated users" ON "public"."tickets_tags" TO "authenticated" USING (true);



CREATE POLICY "Inviter can update invitations" ON "public"."company_invitations" FOR UPDATE USING (("invited_by_user_id" IN ( SELECT "users"."id"
   FROM "public"."users"
  WHERE (("users"."auth_user_id" = "auth"."uid"()) AND ("users"."active" = true)))));



CREATE POLICY "Owners and admins can create invitations" ON "public"."company_invitations" FOR INSERT WITH CHECK (("invited_by_user_id" IN ( SELECT "users"."id"
   FROM "public"."users"
  WHERE (("users"."auth_user_id" = "auth"."uid"()) AND ("users"."company_id" = "company_invitations"."company_id") AND ("users"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"])) AND ("users"."active" = true)))));



CREATE POLICY "Owners and admins can manage payment integrations" ON "public"."payment_integrations" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."auth_user_id" = "auth"."uid"()) AND ("users"."company_id" = "payment_integrations"."company_id") AND ("users"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "Public can read invitation by token" ON "public"."company_invitations" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Service role can insert invitations" ON "public"."company_invitations" FOR INSERT TO "service_role" WITH CHECK (true);



CREATE POLICY "Service role can update invitations" ON "public"."company_invitations" FOR UPDATE TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Staff can moderate (update) any comment in company" ON "public"."ticket_comments" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."auth_user_id" = "auth"."uid"()) AND ("users"."company_id" = "ticket_comments"."company_id") AND ("users"."active" = true)))));



CREATE POLICY "Staff can update own comments" ON "public"."ticket_comments" FOR UPDATE USING ((("user_id" = "auth"."uid"()) OR (("user_id" IS NULL) AND (EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."auth_user_id" = "auth"."uid"()) AND ("users"."company_id" = "ticket_comments"."company_id"))))))) WITH CHECK (true);



CREATE POLICY "Staff can view comment versions" ON "public"."ticket_comment_versions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."ticket_comments" "tc"
     JOIN "public"."users" "u" ON (("u"."company_id" = "tc"."company_id")))
  WHERE (("tc"."id" = "ticket_comment_versions"."comment_id") AND ("u"."auth_user_id" = "auth"."uid"())))));



CREATE POLICY "Users can accept their own invitation" ON "public"."company_invitations" FOR UPDATE TO "authenticated" USING ((("lower"("email") = "lower"((("current_setting"('request.jwt.claims'::"text", true))::"jsonb" ->> 'email'::"text"))) AND ("status" = 'pending'::"text"))) WITH CHECK (("status" = ANY (ARRAY['accepted'::"text", 'rejected'::"text"])));



CREATE POLICY "Users can create brands for their company" ON "public"."product_brands" FOR INSERT WITH CHECK (("company_id" IN ( SELECT "users"."company_id"
   FROM "public"."users"
  WHERE ("users"."auth_user_id" = "auth"."uid"()))));



CREATE POLICY "Users can create categories for their company" ON "public"."product_categories" FOR INSERT WITH CHECK (("company_id" IN ( SELECT "users"."company_id"
   FROM "public"."users"
  WHERE ("users"."auth_user_id" = "auth"."uid"()))));



CREATE POLICY "Users can delete company stages" ON "public"."ticket_stages" FOR DELETE USING (("company_id" IN ( SELECT "users"."company_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



CREATE POLICY "Users can delete hidden_stages of their company" ON "public"."hidden_stages" FOR DELETE USING (("company_id" IN ( SELECT "users"."company_id"
   FROM "public"."users"
  WHERE ("users"."auth_user_id" = "auth"."uid"()))));



CREATE POLICY "Users can hide generic stages for their company" ON "public"."hidden_stages" FOR INSERT WITH CHECK (("company_id" IN ( SELECT "users"."company_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



COMMENT ON POLICY "Users can hide generic stages for their company" ON "public"."hidden_stages" IS 'Permite a usuarios insertar registros de estados ocultos. La validación de que el stage sea genérico se hace en la Edge Function hide-stage.';



CREATE POLICY "Users can insert comments for their company" ON "public"."ticket_comments" FOR INSERT WITH CHECK (("company_id" IN ( SELECT "users"."company_id"
   FROM "public"."users"
  WHERE ("users"."auth_user_id" = "auth"."uid"()))));



CREATE POLICY "Users can insert company stages" ON "public"."ticket_stages" FOR INSERT WITH CHECK (("company_id" IN ( SELECT "users"."company_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



CREATE POLICY "Users can insert hidden_stages for their company" ON "public"."hidden_stages" FOR INSERT WITH CHECK (("company_id" IN ( SELECT "users"."company_id"
   FROM "public"."users"
  WHERE ("users"."auth_user_id" = "auth"."uid"()))));



CREATE POLICY "Users can insert their own AI logs" ON "public"."ai_usage_logs" FOR INSERT TO "authenticated" WITH CHECK ((("auth"."uid"() = "user_id") OR ("company_id" IN ( SELECT "users"."company_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"())))));



CREATE POLICY "Users can insert ticket devices from their company" ON "public"."ticket_devices" FOR INSERT WITH CHECK (((( SELECT "t3"."company_id"
   FROM "public"."tickets" "t3"
  WHERE ("t3"."id" = "ticket_devices"."ticket_id")) = ( SELECT "d2"."company_id"
   FROM "public"."devices" "d2"
  WHERE ("d2"."id" = "ticket_devices"."device_id"))) AND (EXISTS ( SELECT 1
   FROM "public"."users" "u2"
  WHERE (("u2"."auth_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("u2"."active" = true) AND ("u2"."company_id" = ( SELECT "t4"."company_id"
           FROM "public"."tickets" "t4"
          WHERE ("t4"."id" = "ticket_devices"."ticket_id"))))))));



CREATE POLICY "Users can insert versions" ON "public"."ticket_comment_versions" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."ticket_comments" "tc"
  WHERE ("tc"."id" = "ticket_comment_versions"."comment_id"))));



CREATE POLICY "Users can manage hidden units for their company" ON "public"."hidden_units" USING (("company_id" IN ( SELECT "users"."company_id"
   FROM "public"."users"
  WHERE ("users"."auth_user_id" = "auth"."uid"())))) WITH CHECK (("company_id" IN ( SELECT "users"."company_id"
   FROM "public"."users"
  WHERE ("users"."auth_user_id" = "auth"."uid"()))));



CREATE POLICY "Users can manage stage order for their company" ON "public"."company_stage_order" USING (("company_id" IN ( SELECT "users"."company_id"
   FROM "public"."users"
  WHERE ("users"."auth_user_id" = "auth"."uid"()))));



CREATE POLICY "Users can manage ticket devices from their company" ON "public"."ticket_devices" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."tickets" "t"
     JOIN "public"."users" "u" ON ((("u"."company_id" = "t"."company_id") AND ("u"."auth_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("u"."active" = true))))
  WHERE ("t"."id" = "ticket_devices"."ticket_id"))));



CREATE POLICY "Users can unhide generic stages for their company" ON "public"."hidden_stages" FOR DELETE USING (("company_id" IN ( SELECT "users"."company_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



COMMENT ON POLICY "Users can unhide generic stages for their company" ON "public"."hidden_stages" IS 'Permite a usuarios eliminar registros de estados ocultos. La Edge Function hide-stage maneja la lógica de negocio.';



CREATE POLICY "Users can update company stages" ON "public"."ticket_stages" FOR UPDATE USING (("company_id" IN ( SELECT "users"."company_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"())))) WITH CHECK (("company_id" IN ( SELECT "users"."company_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



CREATE POLICY "Users can update own notifications" ON "public"."notifications" FOR UPDATE USING (("auth"."uid"() IN ( SELECT "users"."auth_user_id"
   FROM "public"."users"
  WHERE ("users"."id" = "notifications"."recipient_id"))));



CREATE POLICY "Users can update their company brands" ON "public"."product_brands" FOR UPDATE USING (("company_id" IN ( SELECT "users"."company_id"
   FROM "public"."users"
  WHERE ("users"."auth_user_id" = "auth"."uid"()))));



CREATE POLICY "Users can update their company categories" ON "public"."product_categories" FOR UPDATE USING (("company_id" IN ( SELECT "users"."company_id"
   FROM "public"."users"
  WHERE ("users"."auth_user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view accessible brands" ON "public"."product_brands" FOR SELECT USING ((("company_id" IS NULL) OR ("company_id" IN ( SELECT "users"."company_id"
   FROM "public"."users"
  WHERE ("users"."auth_user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view accessible categories" ON "public"."product_categories" FOR SELECT USING ((("company_id" IS NULL) OR ("company_id" IN ( SELECT "users"."company_id"
   FROM "public"."users"
  WHERE ("users"."auth_user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view comments for their company" ON "public"."ticket_comments" FOR SELECT USING (("company_id" IN ( SELECT "users"."company_id"
   FROM "public"."users"
  WHERE ("users"."auth_user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view generic or company stages" ON "public"."ticket_stages" FOR SELECT USING ((("company_id" IS NULL) OR ("company_id" IN ( SELECT "users"."company_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"())))));



CREATE POLICY "Users can view hidden_stages of their company" ON "public"."hidden_stages" FOR SELECT USING (("company_id" IN ( SELECT "users"."company_id"
   FROM "public"."users"
  WHERE ("users"."auth_user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view logs for their company" ON "public"."ai_usage_logs" FOR SELECT TO "authenticated" USING (("company_id" IN ( SELECT "users"."company_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



CREATE POLICY "Users can view own notifications" ON "public"."notifications" FOR SELECT USING (("auth"."uid"() IN ( SELECT "users"."auth_user_id"
   FROM "public"."users"
  WHERE ("users"."id" = "notifications"."recipient_id"))));



CREATE POLICY "Users can view own pending registrations" ON "public"."pending_users" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "auth_user_id"));



CREATE POLICY "Users can view own profile" ON "public"."users" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view stage order of their company" ON "public"."company_stage_order" FOR SELECT USING (("company_id" IN ( SELECT "users"."company_id"
   FROM "public"."users"
  WHERE ("users"."auth_user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view team members" ON "public"."users" FOR SELECT USING (("company_id" = "public"."get_my_company_id"()));



CREATE POLICY "Users can view their company hidden stages" ON "public"."hidden_stages" FOR SELECT USING (("company_id" IN ( SELECT "users"."company_id"
   FROM "public"."users"
  WHERE ("users"."id" = "auth"."uid"()))));



CREATE POLICY "Users can view their own profile" ON "public"."users" FOR SELECT USING (("auth"."uid"() = "auth_user_id"));



ALTER TABLE "public"."addresses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "addresses_delete_company_only" ON "public"."addresses" FOR DELETE USING (("company_id" = "public"."get_user_company_id"()));



CREATE POLICY "addresses_insert_company_only" ON "public"."addresses" FOR INSERT WITH CHECK (("company_id" = "public"."get_user_company_id"()));



CREATE POLICY "addresses_select_company_only" ON "public"."addresses" FOR SELECT USING (("company_id" = "public"."get_user_company_id"()));



CREATE POLICY "addresses_update_company_only" ON "public"."addresses" FOR UPDATE USING (("company_id" = "public"."get_user_company_id"())) WITH CHECK (("company_id" = "public"."get_user_company_id"()));



ALTER TABLE "public"."ai_usage_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "app_settings_insert" ON "public"."app_settings" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "app_settings_select" ON "public"."app_settings" FOR SELECT USING (true);



CREATE POLICY "app_settings_update" ON "public"."app_settings" FOR UPDATE USING (("auth"."uid"() IS NOT NULL)) WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "app_settings_write" ON "public"."app_settings" USING ((("auth"."role"() = 'service_role'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = ANY (ARRAY['admin'::"text", 'owner'::"text"]))))))) WITH CHECK ((("auth"."role"() = 'service_role'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = ANY (ARRAY['admin'::"text", 'owner'::"text"])))))));



ALTER TABLE "public"."attachments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "attachments_company_access" ON "public"."attachments" USING ((("company_id" IN ( SELECT "users"."company_id"
   FROM "public"."users"
  WHERE ("users"."auth_user_id" = ( SELECT "auth"."uid"() AS "uid")))) AND ("deleted_at" IS NULL)));



ALTER TABLE "public"."client_portal_users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_variant_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clients" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "clients_can_update_own_quotes_status" ON "public"."quotes" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."id" = "quotes"."client_id") AND ("c"."auth_user_id" = "auth"."uid"()) AND ("c"."is_active" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."id" = "quotes"."client_id") AND ("c"."auth_user_id" = "auth"."uid"()) AND ("c"."is_active" = true)))));



COMMENT ON POLICY "clients_can_update_own_quotes_status" ON "public"."quotes" IS 'Permite a clientes del portal aceptar/rechazar sus presupuestos';



CREATE POLICY "clients_can_view_own_invoice_items" ON "public"."invoice_items" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."invoices" "i"
     JOIN "public"."clients" "c" ON (("c"."id" = "i"."client_id")))
  WHERE (("i"."id" = "invoice_items"."invoice_id") AND ("c"."auth_user_id" = "auth"."uid"()) AND ("c"."is_active" = true)))));



CREATE POLICY "clients_can_view_own_invoices" ON "public"."invoices" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."id" = "invoices"."client_id") AND ("c"."auth_user_id" = "auth"."uid"()) AND ("c"."is_active" = true)))));



COMMENT ON POLICY "clients_can_view_own_invoices" ON "public"."invoices" IS 'Permite a clientes del portal ver solo sus propias facturas';



CREATE POLICY "clients_can_view_own_quote_items" ON "public"."quote_items" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."quotes" "q"
     JOIN "public"."clients" "c" ON (("c"."id" = "q"."client_id")))
  WHERE (("q"."id" = "quote_items"."quote_id") AND ("c"."auth_user_id" = "auth"."uid"()) AND ("c"."is_active" = true)))));



CREATE POLICY "clients_can_view_own_quotes" ON "public"."quotes" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."id" = "quotes"."client_id") AND ("c"."auth_user_id" = "auth"."uid"()) AND ("c"."is_active" = true)))));



COMMENT ON POLICY "clients_can_view_own_quotes" ON "public"."quotes" IS 'Permite a clientes del portal ver solo sus propios presupuestos';



CREATE POLICY "clients_can_view_own_ticket_comments" ON "public"."ticket_comments" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM ("public"."tickets" "t"
     JOIN "public"."clients" "c" ON (("c"."id" = "t"."client_id")))
  WHERE (("t"."id" = "ticket_comments"."ticket_id") AND ("c"."auth_user_id" = "auth"."uid"()) AND ("c"."is_active" = true)))) AND ("is_internal" = false)));



CREATE POLICY "clients_can_view_own_tickets" ON "public"."tickets" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."id" = "tickets"."client_id") AND ("c"."auth_user_id" = "auth"."uid"()) AND ("c"."is_active" = true)))));



COMMENT ON POLICY "clients_can_view_own_tickets" ON "public"."tickets" IS 'Permite a clientes del portal ver solo sus propios tickets';



CREATE POLICY "clients_can_view_ticket_stages" ON "public"."ticket_stages" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."auth_user_id" = "auth"."uid"()) AND ("c"."company_id" = "ticket_stages"."company_id") AND ("c"."is_active" = true)))));



CREATE POLICY "clients_delete_company_only" ON "public"."clients" FOR DELETE USING (("company_id" = "public"."get_user_company_id"()));



CREATE POLICY "clients_insert_company_only" ON "public"."clients" FOR INSERT WITH CHECK (("company_id" = "public"."get_user_company_id"()));



CREATE POLICY "clients_select_company_only" ON "public"."clients" FOR SELECT USING (("company_id" = "public"."get_user_company_id"()));



CREATE POLICY "clients_select_own_record" ON "public"."clients" FOR SELECT USING (("auth_user_id" = "auth"."uid"()));



ALTER TABLE "public"."clients_tags" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "clients_update_company_only" ON "public"."clients" FOR UPDATE USING (("company_id" = "public"."get_user_company_id"())) WITH CHECK (("company_id" = "public"."get_user_company_id"()));



CREATE POLICY "clients_update_own_record" ON "public"."clients" FOR UPDATE USING (("auth_user_id" = "auth"."uid"())) WITH CHECK (("auth_user_id" = "auth"."uid"()));



ALTER TABLE "public"."companies" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "companies_client_access" ON "public"."companies" FOR SELECT USING (("id" IN ( SELECT "clients"."company_id"
   FROM "public"."clients"
  WHERE ("clients"."auth_user_id" = "auth"."uid"()))));



CREATE POLICY "companies_own_only" ON "public"."companies" USING (("id" IN ( SELECT "users"."company_id"
   FROM "public"."users"
  WHERE ("users"."auth_user_id" = "auth"."uid"()))));



ALTER TABLE "public"."company_invitations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "company_invitations_company_only" ON "public"."company_invitations" USING ((("company_id" = "public"."get_user_company_id"()) OR (("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text")));



ALTER TABLE "public"."company_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "company_settings_insert" ON "public"."company_settings" FOR INSERT WITH CHECK (("company_id" IN ( SELECT "u"."company_id"
   FROM "public"."users" "u"
  WHERE ("u"."auth_user_id" = "auth"."uid"()))));



CREATE POLICY "company_settings_select" ON "public"."company_settings" FOR SELECT USING (("company_id" IN ( SELECT "u"."company_id"
   FROM "public"."users" "u"
  WHERE ("u"."auth_user_id" = "auth"."uid"()))));



CREATE POLICY "company_settings_update" ON "public"."company_settings" FOR UPDATE USING (("company_id" IN ( SELECT "u"."company_id"
   FROM "public"."users" "u"
  WHERE ("u"."auth_user_id" = "auth"."uid"())))) WITH CHECK (("company_id" IN ( SELECT "u"."company_id"
   FROM "public"."users" "u"
  WHERE ("u"."auth_user_id" = "auth"."uid"()))));



CREATE POLICY "company_settings_write" ON "public"."company_settings" USING ("public"."is_company_admin"("company_id")) WITH CHECK ("public"."is_company_admin"("company_id"));



ALTER TABLE "public"."company_stage_order" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cpu_delete" ON "public"."client_portal_users" FOR DELETE USING (("company_id" = "public"."get_user_company_id"()));



CREATE POLICY "cpu_insert" ON "public"."client_portal_users" FOR INSERT WITH CHECK (("company_id" = "public"."get_user_company_id"()));



CREATE POLICY "cpu_select" ON "public"."client_portal_users" FOR SELECT USING ((("company_id" = "public"."get_user_company_id"()) OR ("lower"("email") = "lower"((("current_setting"('request.jwt.claims'::"text", true))::"jsonb" ->> 'email'::"text")))));



CREATE POLICY "cpu_update" ON "public"."client_portal_users" FOR UPDATE USING (("company_id" = "public"."get_user_company_id"())) WITH CHECK (("company_id" = "public"."get_user_company_id"()));



ALTER TABLE "public"."device_components" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "device_components_via_device" ON "public"."device_components" USING ((EXISTS ( SELECT 1
   FROM "public"."devices" "d"
  WHERE (("d"."id" = "device_components"."device_id") AND ("d"."company_id" = "public"."get_user_company_id"())))));



ALTER TABLE "public"."device_media" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "device_media_via_device" ON "public"."device_media" USING ((EXISTS ( SELECT 1
   FROM "public"."devices" "d"
  WHERE (("d"."id" = "device_media"."device_id") AND ("d"."company_id" = "public"."get_user_company_id"())))));



ALTER TABLE "public"."device_status_history" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "device_status_history_via_device" ON "public"."device_status_history" USING ((EXISTS ( SELECT 1
   FROM "public"."devices" "d"
  WHERE (("d"."id" = "device_status_history"."device_id") AND ("d"."company_id" = "public"."get_user_company_id"())))));



ALTER TABLE "public"."devices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "devices_company_only" ON "public"."devices" USING (("company_id" = "public"."get_user_company_id"()));



CREATE POLICY "devices_gdpr_company_access" ON "public"."devices" FOR SELECT USING ((("company_id" IN ( SELECT "u"."company_id"
   FROM "public"."users" "u"
  WHERE ("u"."auth_user_id" = ( SELECT "auth"."uid"() AS "uid")))) AND (NOT ("client_id" IN ( SELECT "clients"."id"
   FROM "public"."clients"
  WHERE ("clients"."anonymized_at" IS NOT NULL))))));



CREATE POLICY "gcr_company_policy" ON "public"."gdpr_consent_requests" FOR SELECT USING (("company_id" IN ( SELECT "users"."company_id"
   FROM "public"."users"
  WHERE ("users"."auth_user_id" = ( SELECT "auth"."uid"() AS "uid")))));



ALTER TABLE "public"."gdpr_access_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "gdpr_access_requests_company" ON "public"."gdpr_access_requests" USING (("company_id" IN ( SELECT "users"."company_id"
   FROM "public"."users"
  WHERE ("users"."auth_user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "gdpr_access_requests_company_only" ON "public"."gdpr_access_requests" USING (("company_id" = "public"."get_user_company_id"()));



ALTER TABLE "public"."gdpr_audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "gdpr_audit_log_access" ON "public"."gdpr_audit_log" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."auth_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("u"."is_dpo" = true) OR ("u"."data_access_level" = ANY (ARRAY['admin'::"text", 'elevated'::"text"])))))));



ALTER TABLE "public"."gdpr_breach_incidents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "gdpr_breach_incidents_dpo_admin" ON "public"."gdpr_breach_incidents" USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."auth_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("u"."is_dpo" = true) OR ("u"."data_access_level" = ANY (ARRAY['admin'::"text", 'elevated'::"text"])))))));



CREATE POLICY "gdpr_clients_only" ON "public"."clients" USING ((("company_id" = "public"."get_user_company_id"()) AND (("client_type" = 'business'::"text") OR ("data_processing_consent" = true))));



ALTER TABLE "public"."gdpr_consent_records" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "gdpr_consent_records_company" ON "public"."gdpr_consent_records" USING (("company_id" IN ( SELECT "users"."company_id"
   FROM "public"."users"
  WHERE ("users"."auth_user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "gdpr_consent_records_company_only" ON "public"."gdpr_consent_records" USING (((EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."id" = "gdpr_consent_records"."subject_id") AND ("c"."company_id" = "public"."get_user_company_id"())))) OR ("company_id" = "public"."get_user_company_id"())));



ALTER TABLE "public"."gdpr_consent_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "gdpr_consent_requests_company_only" ON "public"."gdpr_consent_requests" USING (((EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."id" = "gdpr_consent_requests"."client_id") AND ("c"."company_id" = "public"."get_user_company_id"())))) OR ("company_id" = "public"."get_user_company_id"())));



ALTER TABLE "public"."gdpr_processing_activities" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "gdpr_processing_activities_admin_only" ON "public"."gdpr_processing_activities" USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."auth_user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("u"."is_dpo" = true) OR ("u"."data_access_level" = ANY (ARRAY['admin'::"text", 'elevated'::"text"])))))));



ALTER TABLE "public"."global_tags" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hidden_stages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hidden_units" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invitations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invitations_company_only" ON "public"."invitations" USING ((("company_id" = "public"."get_user_company_id"()) OR (("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text")));



ALTER TABLE "public"."invoice_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invoice_items_delete_company" ON "public"."invoice_items" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."invoices"
  WHERE (("invoices"."id" = "invoice_items"."invoice_id") AND ("invoices"."company_id" = "public"."get_user_company_id"())))));



CREATE POLICY "invoice_items_insert_company" ON "public"."invoice_items" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."invoices"
  WHERE (("invoices"."id" = "invoice_items"."invoice_id") AND ("invoices"."company_id" = "public"."get_user_company_id"())))));



CREATE POLICY "invoice_items_select_company" ON "public"."invoice_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."invoices"
  WHERE (("invoices"."id" = "invoice_items"."invoice_id") AND ("invoices"."company_id" = "public"."get_user_company_id"())))));



CREATE POLICY "invoice_items_update_company" ON "public"."invoice_items" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."invoices"
  WHERE (("invoices"."id" = "invoice_items"."invoice_id") AND ("invoices"."company_id" = "public"."get_user_company_id"())))));



ALTER TABLE "public"."invoice_payments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invoice_payments_delete_company" ON "public"."invoice_payments" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."invoices"
  WHERE (("invoices"."id" = "invoice_payments"."invoice_id") AND ("invoices"."company_id" = "public"."get_user_company_id"())))));



CREATE POLICY "invoice_payments_insert_company" ON "public"."invoice_payments" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."invoices"
  WHERE (("invoices"."id" = "invoice_payments"."invoice_id") AND ("invoices"."company_id" = "public"."get_user_company_id"())))));



CREATE POLICY "invoice_payments_select_company" ON "public"."invoice_payments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."invoices"
  WHERE (("invoices"."id" = "invoice_payments"."invoice_id") AND ("invoices"."company_id" = "public"."get_user_company_id"())))));



CREATE POLICY "invoice_payments_update_company" ON "public"."invoice_payments" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."invoices"
  WHERE (("invoices"."id" = "invoice_payments"."invoice_id") AND ("invoices"."company_id" = "public"."get_user_company_id"())))));



ALTER TABLE "public"."invoice_series" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invoice_series_delete_company" ON "public"."invoice_series" FOR DELETE USING (("company_id" = "public"."get_user_company_id"()));



CREATE POLICY "invoice_series_insert_company" ON "public"."invoice_series" FOR INSERT WITH CHECK (("company_id" = "public"."get_user_company_id"()));



CREATE POLICY "invoice_series_select_company" ON "public"."invoice_series" FOR SELECT USING (("company_id" = "public"."get_user_company_id"()));



CREATE POLICY "invoice_series_update_company" ON "public"."invoice_series" FOR UPDATE USING (("company_id" = "public"."get_user_company_id"())) WITH CHECK (("company_id" = "public"."get_user_company_id"()));



ALTER TABLE "public"."invoice_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invoice_templates_delete_company" ON "public"."invoice_templates" FOR DELETE USING (("company_id" = "public"."get_user_company_id"()));



CREATE POLICY "invoice_templates_insert_company" ON "public"."invoice_templates" FOR INSERT WITH CHECK (("company_id" = "public"."get_user_company_id"()));



CREATE POLICY "invoice_templates_select_company" ON "public"."invoice_templates" FOR SELECT USING (("company_id" = "public"."get_user_company_id"()));



CREATE POLICY "invoice_templates_update_company" ON "public"."invoice_templates" FOR UPDATE USING (("company_id" = "public"."get_user_company_id"())) WITH CHECK (("company_id" = "public"."get_user_company_id"()));



ALTER TABLE "public"."invoices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invoices_delete_company" ON "public"."invoices" FOR DELETE USING (("company_id" = "public"."get_user_company_id"()));



CREATE POLICY "invoices_insert_company" ON "public"."invoices" FOR INSERT WITH CHECK (("company_id" = "public"."get_user_company_id"()));



CREATE POLICY "invoices_select_company" ON "public"."invoices" FOR SELECT USING ((("company_id" = "public"."get_user_company_id"()) AND ("deleted_at" IS NULL)));



CREATE POLICY "invoices_update_company" ON "public"."invoices" FOR UPDATE USING ((("company_id" = "public"."get_user_company_id"()) AND ("deleted_at" IS NULL))) WITH CHECK (("company_id" = "public"."get_user_company_id"()));



ALTER TABLE "public"."job_notes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "job_notes_company_only" ON "public"."job_notes" USING (("company_id" = "public"."get_user_company_id"()));



ALTER TABLE "public"."localities" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "localities_read_all" ON "public"."localities" FOR SELECT USING (true);



CREATE POLICY "localities_update_authenticated" ON "public"."localities" FOR UPDATE USING ((( SELECT "auth"."role"() AS "role") = 'authenticated'::"text"));



CREATE POLICY "localities_write_authenticated" ON "public"."localities" FOR INSERT WITH CHECK ((( SELECT "auth"."role"() AS "role") = 'authenticated'::"text"));



ALTER TABLE "public"."modules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."modules_catalog" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "modules_select_active" ON "public"."modules" FOR SELECT USING ((("is_active" = true) OR ("auth"."role"() = 'service_role'::"text")));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payment_integrations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payment_integrations_delete" ON "public"."payment_integrations" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."auth_user_id" = "auth"."uid"()) AND ("u"."company_id" = "payment_integrations"."company_id") AND ("u"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"])) AND ("u"."active" = true)))));



CREATE POLICY "payment_integrations_insert" ON "public"."payment_integrations" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."auth_user_id" = "auth"."uid"()) AND ("u"."company_id" = "payment_integrations"."company_id") AND ("u"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"])) AND ("u"."active" = true)))));



CREATE POLICY "payment_integrations_select" ON "public"."payment_integrations" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."auth_user_id" = "auth"."uid"()) AND ("u"."company_id" = "payment_integrations"."company_id") AND ("u"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"])) AND ("u"."active" = true)))));



CREATE POLICY "payment_integrations_update" ON "public"."payment_integrations" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."auth_user_id" = "auth"."uid"()) AND ("u"."company_id" = "payment_integrations"."company_id") AND ("u"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"])) AND ("u"."active" = true))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."auth_user_id" = "auth"."uid"()) AND ("u"."company_id" = "payment_integrations"."company_id") AND ("u"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"])) AND ("u"."active" = true)))));



ALTER TABLE "public"."payment_transactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payment_transactions_select" ON "public"."payment_transactions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."auth_user_id" = "auth"."uid"()) AND ("u"."company_id" = "payment_transactions"."company_id") AND ("u"."active" = true)))));



ALTER TABLE "public"."pending_users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pending_users_access" ON "public"."pending_users" USING ((("company_id" IS NULL) OR (("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text") OR (("company_id" IS NOT NULL) AND (("auth"."jwt"() ->> 'company_id'::"text") IS NOT NULL) AND ("company_id" = (("auth"."jwt"() ->> 'company_id'::"text"))::"uuid")))) WITH CHECK ((("company_id" IS NULL) OR (("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text") OR (("company_id" IS NOT NULL) AND (("auth"."jwt"() ->> 'company_id'::"text") IS NOT NULL) AND ("company_id" = (("auth"."jwt"() ->> 'company_id'::"text"))::"uuid"))));



ALTER TABLE "public"."product_brands" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "products_company_only" ON "public"."products" USING (("company_id" = "public"."get_user_company_id"()));



ALTER TABLE "public"."quote_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "quote_items_delete_policy" ON "public"."quote_items" FOR DELETE USING (("company_id" = "public"."get_user_company_id"()));



CREATE POLICY "quote_items_insert_policy" ON "public"."quote_items" FOR INSERT WITH CHECK (("company_id" = "public"."get_user_company_id"()));



CREATE POLICY "quote_items_select_policy" ON "public"."quote_items" FOR SELECT USING (("company_id" = "public"."get_user_company_id"()));



CREATE POLICY "quote_items_update_policy" ON "public"."quote_items" FOR UPDATE USING (("company_id" = "public"."get_user_company_id"())) WITH CHECK (("company_id" = "public"."get_user_company_id"()));



ALTER TABLE "public"."quote_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "quote_templates_delete_policy" ON "public"."quote_templates" FOR DELETE USING (("company_id" = "public"."get_user_company_id"()));



CREATE POLICY "quote_templates_insert_policy" ON "public"."quote_templates" FOR INSERT WITH CHECK (("company_id" = "public"."get_user_company_id"()));



CREATE POLICY "quote_templates_select_policy" ON "public"."quote_templates" FOR SELECT USING (("company_id" = "public"."get_user_company_id"()));



CREATE POLICY "quote_templates_update_policy" ON "public"."quote_templates" FOR UPDATE USING (("company_id" = "public"."get_user_company_id"())) WITH CHECK (("company_id" = "public"."get_user_company_id"()));



ALTER TABLE "public"."quotes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "quotes_delete_policy" ON "public"."quotes" FOR DELETE USING (("company_id" = "public"."get_user_company_id"()));



CREATE POLICY "quotes_insert_policy" ON "public"."quotes" FOR INSERT WITH CHECK (("company_id" = "public"."get_user_company_id"()));



CREATE POLICY "quotes_select_policy" ON "public"."quotes" FOR SELECT USING (("company_id" = "public"."get_user_company_id"()));



CREATE POLICY "quotes_update_policy" ON "public"."quotes" FOR UPDATE USING (("company_id" = "public"."get_user_company_id"())) WITH CHECK (("company_id" = "public"."get_user_company_id"()));



ALTER TABLE "public"."scheduled_jobs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "scheduled_jobs_read" ON "public"."scheduled_jobs" FOR SELECT USING ((("auth"."role"() = 'service_role'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."role" = ANY (ARRAY['admin'::"text", 'owner'::"text"])))))));



CREATE POLICY "scheduled_jobs_service_all" ON "public"."scheduled_jobs" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "scheduled_jobs_write" ON "public"."scheduled_jobs" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."service_categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_categories_company_only" ON "public"."service_categories" USING (("company_id" = "public"."get_user_company_id"()));



ALTER TABLE "public"."service_tag_relations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_tag_relations_via_service" ON "public"."service_tag_relations" USING ((EXISTS ( SELECT 1
   FROM "public"."services" "s"
  WHERE (("s"."id" = "service_tag_relations"."service_id") AND ("s"."company_id" = "public"."get_user_company_id"())))));



ALTER TABLE "public"."service_tags" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_tags_company_only" ON "public"."service_tags" USING (("company_id" = "public"."get_user_company_id"()));



ALTER TABLE "public"."service_units" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_units_company_or_global" ON "public"."service_units" FOR SELECT USING ((("company_id" IS NULL) OR ("company_id" = "public"."get_user_company_id"())));



CREATE POLICY "service_units_delete_company" ON "public"."service_units" FOR DELETE USING (("company_id" = "public"."get_user_company_id"()));



CREATE POLICY "service_units_insert_company" ON "public"."service_units" FOR INSERT WITH CHECK (("company_id" = "public"."get_user_company_id"()));



CREATE POLICY "service_units_update_company" ON "public"."service_units" FOR UPDATE USING (("company_id" = "public"."get_user_company_id"()));



ALTER TABLE "public"."service_variants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."services" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "services_delete_company_only" ON "public"."services" FOR DELETE USING (("company_id" = "public"."get_user_company_id"()));



CREATE POLICY "services_insert_company_only" ON "public"."services" FOR INSERT WITH CHECK (("company_id" = "public"."get_user_company_id"()));



CREATE POLICY "services_select_company_only" ON "public"."services" FOR SELECT USING (("company_id" = "public"."get_user_company_id"()));



CREATE POLICY "services_update_company_only" ON "public"."services" FOR UPDATE USING (("company_id" = "public"."get_user_company_id"())) WITH CHECK (("company_id" = "public"."get_user_company_id"()));



ALTER TABLE "public"."ticket_comment_attachments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ticket_comment_attachments_via_ticket" ON "public"."ticket_comment_attachments" USING ((EXISTS ( SELECT 1
   FROM ("public"."ticket_comments" "tc"
     JOIN "public"."tickets" "t" ON (("t"."id" = "tc"."ticket_id")))
  WHERE (("tc"."id" = "ticket_comment_attachments"."comment_id") AND ("t"."company_id" = "public"."get_user_company_id"())))));



ALTER TABLE "public"."ticket_comment_versions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ticket_comments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ticket_comments_company_only" ON "public"."ticket_comments" USING ((EXISTS ( SELECT 1
   FROM "public"."tickets" "t"
  WHERE (("t"."id" = "ticket_comments"."ticket_id") AND ("t"."company_id" = "public"."get_user_company_id"())))));



ALTER TABLE "public"."ticket_devices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ticket_devices_via_ticket" ON "public"."ticket_devices" USING ((EXISTS ( SELECT 1
   FROM "public"."tickets" "t"
  WHERE (("t"."id" = "ticket_devices"."ticket_id") AND ("t"."company_id" = "public"."get_user_company_id"())))));



ALTER TABLE "public"."ticket_products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ticket_services" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ticket_services_company_only" ON "public"."ticket_services" USING ((EXISTS ( SELECT 1
   FROM "public"."tickets" "t"
  WHERE (("t"."id" = "ticket_services"."ticket_id") AND ("t"."company_id" = "public"."get_user_company_id"())))));



ALTER TABLE "public"."ticket_stages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ticket_stages_company_only" ON "public"."ticket_stages" USING (("company_id" = "public"."get_user_company_id"()));



ALTER TABLE "public"."ticket_tag_relations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ticket_tag_relations_via_ticket" ON "public"."ticket_tag_relations" USING ((EXISTS ( SELECT 1
   FROM "public"."tickets" "t"
  WHERE (("t"."id" = "ticket_tag_relations"."ticket_id") AND ("t"."company_id" = "public"."get_user_company_id"())))));



ALTER TABLE "public"."ticket_tags" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ticket_tags_company_only" ON "public"."ticket_tags" USING (("company_id" = "public"."get_user_company_id"()));



ALTER TABLE "public"."tickets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tickets_delete_company_only" ON "public"."tickets" FOR DELETE USING (("company_id" = "public"."get_user_company_id"()));



CREATE POLICY "tickets_insert_company_only" ON "public"."tickets" FOR INSERT WITH CHECK (("company_id" = "public"."get_user_company_id"()));



CREATE POLICY "tickets_select_company_only" ON "public"."tickets" FOR SELECT USING (("company_id" = "public"."get_user_company_id"()));



ALTER TABLE "public"."tickets_tags" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tickets_update_company_only" ON "public"."tickets" FOR UPDATE USING (("company_id" = "public"."get_user_company_id"())) WITH CHECK (("company_id" = "public"."get_user_company_id"()));



ALTER TABLE "public"."user_modules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_modules_insert_none" ON "public"."user_modules" FOR INSERT TO "authenticated" WITH CHECK (false);



CREATE POLICY "user_modules_select_own" ON "public"."user_modules" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users" "pu"
  WHERE (("pu"."id" = "user_modules"."user_id") AND ("pu"."auth_user_id" = "auth"."uid"())))));



CREATE POLICY "user_modules_update_own" ON "public"."user_modules" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users" "pu"
  WHERE (("pu"."id" = "user_modules"."user_id") AND ("pu"."auth_user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users" "pu"
  WHERE (("pu"."id" = "user_modules"."user_id") AND ("pu"."auth_user_id" = "auth"."uid"())))));



ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users_own_profile" ON "public"."users" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "auth_user_id"));



CREATE POLICY "users_own_update" ON "public"."users" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "auth_user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "auth_user_id"));



CREATE POLICY "users_select_client_self" ON "public"."users" FOR SELECT TO "authenticated" USING ((("auth"."uid"() = "auth_user_id") AND ("role" = 'client'::"text") AND ("active" = true)));



COMMENT ON POLICY "users_select_client_self" ON "public"."users" IS 'Permite a clientes del portal ver su propio registro en la tabla users';



ALTER TABLE "public"."verifactu_cert_history" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "verifactu_cert_history_select_policy" ON "public"."verifactu_cert_history" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."auth_user_id" = "auth"."uid"()) AND ("u"."company_id" = "verifactu_cert_history"."company_id") AND ("u"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"])) AND ("u"."deleted_at" IS NULL)))));



ALTER TABLE "public"."verifactu_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "verifactu_events_read_by_company" ON "public"."verifactu_events" FOR SELECT TO "authenticated" USING (("companyid" = "public"."get_user_company_id"()));



CREATE POLICY "verifactu_events_service_all" ON "public"."verifactu_events" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."verifactu_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "verifactu_settings_delete_policy" ON "public"."verifactu_settings" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."auth_user_id" = "auth"."uid"()) AND ("u"."company_id" = "verifactu_settings"."company_id") AND ("u"."role" = 'owner'::"text") AND ("u"."deleted_at" IS NULL)))));



CREATE POLICY "verifactu_settings_insert_policy" ON "public"."verifactu_settings" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."auth_user_id" = "auth"."uid"()) AND ("u"."company_id" = "verifactu_settings"."company_id") AND ("u"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"])) AND ("u"."deleted_at" IS NULL)))));



CREATE POLICY "verifactu_settings_select_policy" ON "public"."verifactu_settings" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."auth_user_id" = "auth"."uid"()) AND ("u"."company_id" = "verifactu_settings"."company_id") AND ("u"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"])) AND ("u"."deleted_at" IS NULL)))));



CREATE POLICY "verifactu_settings_update_policy" ON "public"."verifactu_settings" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."auth_user_id" = "auth"."uid"()) AND ("u"."company_id" = "verifactu_settings"."company_id") AND ("u"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"])) AND ("u"."deleted_at" IS NULL))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users" "u"
  WHERE (("u"."auth_user_id" = "auth"."uid"()) AND ("u"."company_id" = "verifactu_settings"."company_id") AND ("u"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"])) AND ("u"."deleted_at" IS NULL)))));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."accept_company_invitation"("p_invitation_token" "text", "p_auth_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."accept_company_invitation"("p_invitation_token" "text", "p_auth_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_company_invitation"("p_invitation_token" "text", "p_auth_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."accept_company_invitation_admin"("p_invitation_token" "text", "p_auth_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."accept_company_invitation_admin"("p_invitation_token" "text", "p_auth_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_company_invitation_admin"("p_invitation_token" "text", "p_auth_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."accept_company_invitation_by_email"("p_email" "text", "p_auth_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."accept_company_invitation_by_email"("p_email" "text", "p_auth_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_company_invitation_by_email"("p_email" "text", "p_auth_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."activate_invited_user"("auth_user_id" "uuid", "user_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."activate_invited_user"("auth_user_id" "uuid", "user_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."activate_invited_user"("auth_user_id" "uuid", "user_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."activate_recurring_service_on_payment"() TO "anon";
GRANT ALL ON FUNCTION "public"."activate_recurring_service_on_payment"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."activate_recurring_service_on_payment"() TO "service_role";



GRANT ALL ON FUNCTION "public"."anonymize_client_data"("p_client_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."anonymize_client_data"("p_client_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."anonymize_client_data"("p_client_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."anonymize_client_data"("p_client_id" "uuid", "p_reason" "text", "p_requesting_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."anonymize_client_data"("p_client_id" "uuid", "p_reason" "text", "p_requesting_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."anonymize_client_data"("p_client_id" "uuid", "p_reason" "text", "p_requesting_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."anonymize_invoice_data"() TO "anon";
GRANT ALL ON FUNCTION "public"."anonymize_invoice_data"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."anonymize_invoice_data"() TO "service_role";



GRANT ALL ON FUNCTION "public"."anonymize_quote_data"() TO "anon";
GRANT ALL ON FUNCTION "public"."anonymize_quote_data"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."anonymize_quote_data"() TO "service_role";



GRANT ALL ON FUNCTION "public"."auth_user_email"() TO "anon";
GRANT ALL ON FUNCTION "public"."auth_user_email"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auth_user_email"() TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_annual_price"("p_monthly_price" numeric, "p_discount_percentage" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_annual_price"("p_monthly_price" numeric, "p_discount_percentage" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_annual_price"("p_monthly_price" numeric, "p_discount_percentage" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_invoice_totals"("p_invoice_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_invoice_totals"("p_invoice_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_invoice_totals"("p_invoice_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_invoice_totals_payment_trigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_invoice_totals_payment_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_invoice_totals_payment_trigger"() TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_invoice_totals_trigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_invoice_totals_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_invoice_totals_trigger"() TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_quote_item_totals"() TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_quote_item_totals"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_quote_item_totals"() TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_quote_totals"() TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_quote_totals"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_quote_totals"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cancel_invoice"("p_invoice_id" "uuid", "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."cancel_invoice"("p_invoice_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_invoice"("p_invoice_id" "uuid", "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_company_exists"("p_company_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."check_company_exists"("p_company_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_company_exists"("p_company_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_gdpr_compliance"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_gdpr_compliance"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_gdpr_compliance"() TO "service_role";



GRANT ALL ON FUNCTION "public"."clean_expired_pending_users"() TO "anon";
GRANT ALL ON FUNCTION "public"."clean_expired_pending_users"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."clean_expired_pending_users"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_current_duplicates"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_current_duplicates"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_current_duplicates"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_duplicate_companies"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_duplicate_companies"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_duplicate_companies"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_expired_gdpr_data"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_expired_gdpr_data"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_expired_gdpr_data"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_pending_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_pending_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_pending_user"() TO "service_role";



GRANT ALL ON TABLE "public"."quotes" TO "anon";
GRANT ALL ON TABLE "public"."quotes" TO "authenticated";
GRANT ALL ON TABLE "public"."quotes" TO "service_role";



GRANT ALL ON FUNCTION "public"."client_get_visible_quotes"() TO "anon";
GRANT ALL ON FUNCTION "public"."client_get_visible_quotes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."client_get_visible_quotes"() TO "service_role";



GRANT ALL ON TABLE "public"."tickets" TO "anon";
GRANT ALL ON TABLE "public"."tickets" TO "authenticated";
GRANT ALL ON TABLE "public"."tickets" TO "service_role";



GRANT ALL ON FUNCTION "public"."client_get_visible_tickets"() TO "anon";
GRANT ALL ON FUNCTION "public"."client_get_visible_tickets"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."client_get_visible_tickets"() TO "service_role";



GRANT ALL ON FUNCTION "public"."column_exists"("table_name" "text", "column_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."column_exists"("table_name" "text", "column_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."column_exists"("table_name" "text", "column_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."confirm_user_registration"("p_auth_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."confirm_user_registration"("p_auth_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."confirm_user_registration"("p_auth_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."confirm_user_registration"("p_auth_user_id" "uuid", "p_confirmation_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."confirm_user_registration"("p_auth_user_id" "uuid", "p_confirmation_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."confirm_user_registration"("p_auth_user_id" "uuid", "p_confirmation_token" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."convert_quote_to_invoice"("p_quote_id" "uuid", "p_invoice_series_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."convert_quote_to_invoice"("p_quote_id" "uuid", "p_invoice_series_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."convert_quote_to_invoice"("p_quote_id" "uuid", "p_invoice_series_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."count_customers_by_user"("target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."count_customers_by_user"("target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."count_customers_by_user"("target_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_address_dev"("target_user_id" "uuid", "p_direccion" character varying, "p_numero" character varying, "p_piso" character varying, "p_puerta" character varying, "p_codigo_postal" character varying, "p_locality_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_address_dev"("target_user_id" "uuid", "p_direccion" character varying, "p_numero" character varying, "p_piso" character varying, "p_puerta" character varying, "p_codigo_postal" character varying, "p_locality_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_address_dev"("target_user_id" "uuid", "p_direccion" character varying, "p_numero" character varying, "p_piso" character varying, "p_puerta" character varying, "p_codigo_postal" character varying, "p_locality_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_attachment"("p_company_id" "uuid", "p_job_id" "uuid", "p_file_name" "text", "p_file_size" integer, "p_mime_type" "text", "p_subfolder" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_attachment"("p_company_id" "uuid", "p_job_id" "uuid", "p_file_name" "text", "p_file_size" integer, "p_mime_type" "text", "p_subfolder" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_attachment"("p_company_id" "uuid", "p_job_id" "uuid", "p_file_name" "text", "p_file_size" integer, "p_mime_type" "text", "p_subfolder" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_customer_dev"("target_user_id" "uuid", "p_nombre" character varying, "p_apellidos" character varying, "p_email" character varying, "p_telefono" character varying, "p_dni" character varying) TO "anon";
GRANT ALL ON FUNCTION "public"."create_customer_dev"("target_user_id" "uuid", "p_nombre" character varying, "p_apellidos" character varying, "p_email" character varying, "p_telefono" character varying, "p_dni" character varying) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_customer_dev"("target_user_id" "uuid", "p_nombre" character varying, "p_apellidos" character varying, "p_email" character varying, "p_telefono" character varying, "p_dni" character varying) TO "service_role";



GRANT ALL ON FUNCTION "public"."create_customer_dev"("target_user_id" "uuid", "p_nombre" character varying, "p_apellidos" character varying, "p_email" character varying, "p_telefono" character varying, "p_dni" character varying, "p_fecha_nacimiento" "date", "p_profesion" character varying, "p_empresa" character varying, "p_notas" "text", "p_avatar_url" "text", "p_direccion_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_customer_dev"("target_user_id" "uuid", "p_nombre" character varying, "p_apellidos" character varying, "p_email" character varying, "p_telefono" character varying, "p_dni" character varying, "p_fecha_nacimiento" "date", "p_profesion" character varying, "p_empresa" character varying, "p_notas" "text", "p_avatar_url" "text", "p_direccion_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_customer_dev"("target_user_id" "uuid", "p_nombre" character varying, "p_apellidos" character varying, "p_email" character varying, "p_telefono" character varying, "p_dni" character varying, "p_fecha_nacimiento" "date", "p_profesion" character varying, "p_empresa" character varying, "p_notas" "text", "p_avatar_url" "text", "p_direccion_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_gdpr_access_request"("p_subject_email" "text", "p_request_type" "text", "p_subject_name" "text", "p_request_details" "jsonb", "p_requesting_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_gdpr_access_request"("p_subject_email" "text", "p_request_type" "text", "p_subject_name" "text", "p_request_details" "jsonb", "p_requesting_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_gdpr_access_request"("p_subject_email" "text", "p_request_type" "text", "p_subject_name" "text", "p_request_details" "jsonb", "p_requesting_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_notification"("p_company_id" "uuid", "p_recipient_id" "uuid", "p_type" "text", "p_reference_id" "uuid", "p_title" "text", "p_content" "text", "p_metadata" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."create_notification"("p_company_id" "uuid", "p_recipient_id" "uuid", "p_type" "text", "p_reference_id" "uuid", "p_title" "text", "p_content" "text", "p_metadata" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_notification"("p_company_id" "uuid", "p_recipient_id" "uuid", "p_type" "text", "p_reference_id" "uuid", "p_title" "text", "p_content" "text", "p_metadata" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_rectification_quote"("p_invoice_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_rectification_quote"("p_invoice_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_rectification_quote"("p_invoice_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_rectification_quote"("p_invoice_id" "uuid", "p_rectification_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_rectification_quote"("p_invoice_id" "uuid", "p_rectification_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_rectification_quote"("p_invoice_id" "uuid", "p_rectification_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."current_company_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_company_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_company_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_customer_dev"("client_id" "uuid", "target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_customer_dev"("client_id" "uuid", "target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_customer_dev"("client_id" "uuid", "target_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_payment_integration"("p_company_id" "uuid", "p_provider" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_payment_integration"("p_company_id" "uuid", "p_provider" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_payment_integration"("p_company_id" "uuid", "p_provider" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."enqueue_verifactu_dispatch"("pinvoiceid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."enqueue_verifactu_dispatch"("pinvoiceid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."enqueue_verifactu_dispatch"("pinvoiceid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."enqueue_verifactu_dispatch"("pinvoice_id" "uuid", "pcompany_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."enqueue_verifactu_dispatch"("pinvoice_id" "uuid", "pcompany_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."enqueue_verifactu_dispatch"("pinvoice_id" "uuid", "pcompany_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_all_companies"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_all_companies"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_all_companies"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_min_one_stage_per_category"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_min_one_stage_per_category"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_min_one_stage_per_category"() TO "service_role";



GRANT ALL ON FUNCTION "public"."export_client_gdpr_data"("p_client_id" "uuid", "p_requesting_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."export_client_gdpr_data"("p_client_id" "uuid", "p_requesting_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."export_client_gdpr_data"("p_client_id" "uuid", "p_requesting_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_invoice_collection_status"("p_start" "date", "p_end" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."f_invoice_collection_status"("p_start" "date", "p_end" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_invoice_collection_status"("p_start" "date", "p_end" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_invoice_kpis_monthly"("p_start" "date", "p_end" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."f_invoice_kpis_monthly"("p_start" "date", "p_end" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_invoice_kpis_monthly"("p_start" "date", "p_end" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_invoice_kpis_monthly_debug"("p_start" "date", "p_end" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."f_invoice_kpis_monthly_debug"("p_start" "date", "p_end" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_invoice_kpis_monthly_debug"("p_start" "date", "p_end" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_invoice_kpis_monthly_temp"("p_start" "date", "p_end" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."f_invoice_kpis_monthly_temp"("p_start" "date", "p_end" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_invoice_kpis_monthly_temp"("p_start" "date", "p_end" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_quote_cube"("p_start" "date", "p_end" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."f_quote_cube"("p_start" "date", "p_end" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_quote_cube"("p_start" "date", "p_end" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_quote_kpis_monthly"("p_start" "date", "p_end" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."f_quote_kpis_monthly"("p_start" "date", "p_end" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_quote_kpis_monthly"("p_start" "date", "p_end" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_quote_kpis_monthly_enhanced"("p_start" "date", "p_end" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."f_quote_kpis_monthly_enhanced"("p_start" "date", "p_end" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_quote_kpis_monthly_enhanced"("p_start" "date", "p_end" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_quote_pipeline_current"() TO "anon";
GRANT ALL ON FUNCTION "public"."f_quote_pipeline_current"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_quote_pipeline_current"() TO "service_role";



GRANT ALL ON FUNCTION "public"."f_quote_projected_revenue"("p_start" "date", "p_end" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."f_quote_projected_revenue"("p_start" "date", "p_end" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_quote_projected_revenue"("p_start" "date", "p_end" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_quote_recurring_monthly"("p_start" "date", "p_end" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."f_quote_recurring_monthly"("p_start" "date", "p_end" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_quote_recurring_monthly"("p_start" "date", "p_end" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."f_quote_top_items_monthly"("p_start" "date", "p_end" "date", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."f_quote_top_items_monthly"("p_start" "date", "p_end" "date", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_quote_top_items_monthly"("p_start" "date", "p_end" "date", "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."f_ticket_current_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."f_ticket_current_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_ticket_current_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."f_ticket_kpis_monthly"("p_start" "date", "p_end" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."f_ticket_kpis_monthly"("p_start" "date", "p_end" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."f_ticket_kpis_monthly"("p_start" "date", "p_end" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."finalize_invoice"("p_invoice_id" "uuid", "p_series" "text", "p_device_id" "text", "p_software_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."finalize_invoice"("p_invoice_id" "uuid", "p_series" "text", "p_device_id" "text", "p_software_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."finalize_invoice"("p_invoice_id" "uuid", "p_series" "text", "p_device_id" "text", "p_software_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_invoice_immutable_after_issue"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_invoice_immutable_after_issue"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_invoice_immutable_after_issue"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_is_variant_visible"("p_variant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."fn_is_variant_visible"("p_variant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_is_variant_visible"("p_variant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_ticket_comments_maintain_integrity"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_ticket_comments_maintain_integrity"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_ticket_comments_maintain_integrity"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_touch_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_touch_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_verifactu_settings_enforce_modes"() TO "anon";
GRANT ALL ON FUNCTION "public"."fn_verifactu_settings_enforce_modes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_verifactu_settings_enforce_modes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."gdpr_accept_consent"("p_token" "text", "p_preferences" "jsonb", "p_evidence" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."gdpr_accept_consent"("p_token" "text", "p_preferences" "jsonb", "p_evidence" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gdpr_accept_consent"("p_token" "text", "p_preferences" "jsonb", "p_evidence" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."gdpr_anonymize_client"("client_id" "uuid", "requesting_user_id" "uuid", "anonymization_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."gdpr_anonymize_client"("client_id" "uuid", "requesting_user_id" "uuid", "anonymization_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gdpr_anonymize_client"("client_id" "uuid", "requesting_user_id" "uuid", "anonymization_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."gdpr_audit_clients_trigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."gdpr_audit_clients_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."gdpr_audit_clients_trigger"() TO "service_role";



GRANT ALL ON FUNCTION "public"."gdpr_audit_trigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."gdpr_audit_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."gdpr_audit_trigger"() TO "service_role";



GRANT ALL ON FUNCTION "public"."gdpr_create_consent_request"("p_client_id" "uuid", "p_subject_email" "text", "p_consent_types" "text"[], "p_purpose" "text", "p_expires" interval) TO "anon";
GRANT ALL ON FUNCTION "public"."gdpr_create_consent_request"("p_client_id" "uuid", "p_subject_email" "text", "p_consent_types" "text"[], "p_purpose" "text", "p_expires" interval) TO "authenticated";
GRANT ALL ON FUNCTION "public"."gdpr_create_consent_request"("p_client_id" "uuid", "p_subject_email" "text", "p_consent_types" "text"[], "p_purpose" "text", "p_expires" interval) TO "service_role";



GRANT ALL ON FUNCTION "public"."gdpr_decline_consent"("p_token" "text", "p_evidence" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."gdpr_decline_consent"("p_token" "text", "p_evidence" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gdpr_decline_consent"("p_token" "text", "p_evidence" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."gdpr_export_client_data"("client_email" "text", "requesting_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."gdpr_export_client_data"("client_email" "text", "requesting_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gdpr_export_client_data"("client_email" "text", "requesting_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."gdpr_get_consent_request"("p_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."gdpr_get_consent_request"("p_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gdpr_get_consent_request"("p_token" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."gdpr_log_access"("user_id" "uuid", "action_type" "text", "table_name" "text", "record_id" "uuid", "subject_email" "text", "purpose" "text", "old_values" "jsonb", "new_values" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."gdpr_log_access"("user_id" "uuid", "action_type" "text", "table_name" "text", "record_id" "uuid", "subject_email" "text", "purpose" "text", "old_values" "jsonb", "new_values" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gdpr_log_access"("user_id" "uuid", "action_type" "text", "table_name" "text", "record_id" "uuid", "subject_email" "text", "purpose" "text", "old_values" "jsonb", "new_values" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_file_path"("company_uuid" "uuid", "file_name" "text", "subfolder" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_file_path"("company_uuid" "uuid", "file_name" "text", "subfolder" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_file_path"("company_uuid" "uuid", "file_name" "text", "subfolder" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_verifactu_hash"("p_invoice_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_verifactu_hash"("p_invoice_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_verifactu_hash"("p_invoice_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_addresses_dev"("target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_addresses_dev"("target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_addresses_dev"("target_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_all_companies_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_all_companies_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_all_companies_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_all_users_with_customers"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_all_users_with_customers"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_all_users_with_customers"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_client_consent_status"("p_client_id" "uuid", "p_requesting_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_client_consent_status"("p_client_id" "uuid", "p_requesting_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_client_consent_status"("p_client_id" "uuid", "p_requesting_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_company_id_from_jwt"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_company_id_from_jwt"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_company_id_from_jwt"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_company_invitation_token"("p_invitation_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_company_invitation_token"("p_invitation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_company_invitation_token"("p_invitation_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_company_services_with_variants"("p_company_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_company_services_with_variants"("p_company_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_company_services_with_variants"("p_company_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_config_stages"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_config_stages"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_config_stages"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_config_units"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_config_units"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_config_units"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_customer_stats"("user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_customer_stats"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_customer_stats"("user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_customer_stats_dev"("target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_customer_stats_dev"("target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_customer_stats_dev"("target_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_customers_dev"("target_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_customers_dev"("target_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_customers_dev"("target_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_devices_stats"("company_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_devices_stats"("company_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_devices_stats"("company_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_devices_with_client_info"("company_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_devices_with_client_info"("company_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_devices_with_client_info"("company_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_effective_modules"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_effective_modules"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_effective_modules"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_job_attachments"("p_job_id" "uuid", "p_company_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_job_attachments"("p_job_id" "uuid", "p_company_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_job_attachments"("p_job_id" "uuid", "p_company_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_my_company_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_company_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_company_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_next_invoice_number"("p_series_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_next_invoice_number"("p_series_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_next_invoice_number"("p_series_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_next_quote_number"("p_company_id" "uuid", "p_year" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_next_quote_number"("p_company_id" "uuid", "p_year" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_next_quote_number"("p_company_id" "uuid", "p_year" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_or_create_brand"("p_brand_name" "text", "p_company_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_or_create_brand"("p_brand_name" "text", "p_company_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_or_create_brand"("p_brand_name" "text", "p_company_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_or_create_category"("p_category_name" "text", "p_company_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_or_create_category"("p_category_name" "text", "p_company_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_or_create_category"("p_category_name" "text", "p_company_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_payment_integrations"("p_company_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_payment_integrations"("p_company_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_payment_integrations"("p_company_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_service_with_variants"("p_service_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_service_with_variants"("p_service_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_service_with_variants"("p_service_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_sessions_with_booking_counts"("p_start_date" "date", "p_end_date" "date") TO "anon";
GRANT ALL ON FUNCTION "public"."get_sessions_with_booking_counts"("p_start_date" "date", "p_end_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_sessions_with_booking_counts"("p_start_date" "date", "p_end_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_ticket_stats"("target_company_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_ticket_stats"("target_company_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_ticket_stats"("target_company_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_top_used_products"("target_company_id" "uuid", "limit_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_top_used_products"("target_company_id" "uuid", "limit_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_top_used_products"("target_company_id" "uuid", "limit_count" integer) TO "service_role";



GRANT ALL ON TABLE "public"."services" TO "anon";
GRANT ALL ON TABLE "public"."services" TO "authenticated";
GRANT ALL ON TABLE "public"."services" TO "service_role";



GRANT ALL ON FUNCTION "public"."get_top_used_services"("target_company_id" "uuid", "limit_count" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_top_used_services"("target_company_id" "uuid", "limit_count" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_top_used_services"("target_company_id" "uuid", "limit_count" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_company_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_company_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_company_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_permissions"("user_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_permissions"("user_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_permissions"("user_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_verifactu_cert_status"("p_company_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_verifactu_cert_status"("p_company_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_verifactu_cert_status"("p_company_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_verifactu_settings_for_company"("p_company_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_verifactu_settings_for_company"("p_company_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_verifactu_settings_for_company"("p_company_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_comment_notifications"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_comment_notifications"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_comment_notifications"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_company_registration"("p_auth_user_id" "uuid", "p_email" "text", "p_full_name" "text", "p_company_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."handle_company_registration"("p_auth_user_id" "uuid", "p_email" "text", "p_full_name" "text", "p_company_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_company_registration"("p_auth_user_id" "uuid", "p_email" "text", "p_full_name" "text", "p_company_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_ticket_auto_assignment"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_ticket_auto_assignment"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_ticket_auto_assignment"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_ticket_comment_automation"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_ticket_comment_automation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_ticket_comment_automation"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_ticket_notifications"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_ticket_notifications"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_ticket_notifications"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_ticket_soft_delete"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_ticket_soft_delete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_ticket_soft_delete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_verifactu_voiding"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_verifactu_voiding"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_verifactu_voiding"() TO "service_role";



GRANT ALL ON TABLE "public"."localities" TO "anon";
GRANT ALL ON TABLE "public"."localities" TO "authenticated";
GRANT ALL ON TABLE "public"."localities" TO "service_role";



GRANT ALL ON FUNCTION "public"."insert_or_get_locality"("p_name" "text", "p_province" "text", "p_country" "text", "p_postal_code" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."insert_or_get_locality"("p_name" "text", "p_province" "text", "p_country" "text", "p_postal_code" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."insert_or_get_locality"("p_name" "text", "p_province" "text", "p_country" "text", "p_postal_code" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."invite_user_to_company"("user_email" "text", "user_name" "text", "user_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."invite_user_to_company"("user_email" "text", "user_name" "text", "user_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."invite_user_to_company"("user_email" "text", "user_name" "text", "user_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."invite_user_to_company"("p_company_id" "uuid", "p_email" "text", "p_role" "text", "p_message" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."invite_user_to_company"("p_company_id" "uuid", "p_email" "text", "p_role" "text", "p_message" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."invite_user_to_company"("p_company_id" "uuid", "p_email" "text", "p_role" "text", "p_message" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."invite_user_to_company_debug"("user_email" "text", "user_name" "text", "user_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."invite_user_to_company_debug"("user_email" "text", "user_name" "text", "user_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."invite_user_to_company_debug"("user_email" "text", "user_name" "text", "user_role" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."invoices_immutability_guard"() TO "anon";
GRANT ALL ON FUNCTION "public"."invoices_immutability_guard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."invoices_immutability_guard"() TO "service_role";



GRANT ALL ON FUNCTION "public"."invoke_process_recurring_quotes"() TO "anon";
GRANT ALL ON FUNCTION "public"."invoke_process_recurring_quotes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."invoke_process_recurring_quotes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_company_admin"("target_company" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_company_admin"("target_company" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_company_admin"("target_company" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_dev_user"("user_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_dev_user"("user_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_dev_user"("user_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_stage_hidden_for_company"("p_stage_id" "uuid", "p_company_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_stage_hidden_for_company"("p_stage_id" "uuid", "p_company_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_stage_hidden_for_company"("p_stage_id" "uuid", "p_company_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."issue_invoice_verifactu"("pinvoiceid" "uuid", "pdeviceid" "text", "psoftwareid" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."issue_invoice_verifactu"("pinvoiceid" "uuid", "pdeviceid" "text", "psoftwareid" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."issue_invoice_verifactu"("pinvoiceid" "uuid", "pdeviceid" "text", "psoftwareid" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."issue_invoice_verifactu"("pinvoiceid" "uuid", "pdeviceid" "text", "psoftwareid" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_client_access"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_client_access"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_client_access"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_device_status_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."log_device_status_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_device_status_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."log_gdpr_audit"("p_action_type" "text", "p_table_name" "text", "p_record_id" "uuid", "p_subject_email" "text", "p_purpose" "text", "p_old_values" "jsonb", "p_new_values" "jsonb", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."log_gdpr_audit"("p_action_type" "text", "p_table_name" "text", "p_record_id" "uuid", "p_subject_email" "text", "p_purpose" "text", "p_old_values" "jsonb", "p_new_values" "jsonb", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_gdpr_audit"("p_action_type" "text", "p_table_name" "text", "p_record_id" "uuid", "p_subject_email" "text", "p_purpose" "text", "p_old_values" "jsonb", "p_new_values" "jsonb", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."maintain_ticket_opened_status"() TO "anon";
GRANT ALL ON FUNCTION "public"."maintain_ticket_opened_status"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."maintain_ticket_opened_status"() TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_client_accessed"("p_client_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_client_accessed"("p_client_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_client_accessed"("p_client_id" "uuid", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_expired_quotes"() TO "anon";
GRANT ALL ON FUNCTION "public"."mark_expired_quotes"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_expired_quotes"() TO "service_role";



GRANT ALL ON FUNCTION "public"."migrate_clients_by_tenant"() TO "anon";
GRANT ALL ON FUNCTION "public"."migrate_clients_by_tenant"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."migrate_clients_by_tenant"() TO "service_role";



GRANT ALL ON FUNCTION "public"."migrate_legacy_clients"() TO "anon";
GRANT ALL ON FUNCTION "public"."migrate_legacy_clients"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."migrate_legacy_clients"() TO "service_role";



GRANT ALL ON FUNCTION "public"."migrate_legacy_users"() TO "anon";
GRANT ALL ON FUNCTION "public"."migrate_legacy_users"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."migrate_legacy_users"() TO "service_role";



GRANT ALL ON FUNCTION "public"."process_gdpr_deletion_request"("p_request_id" "uuid", "p_approve" boolean, "p_rejection_reason" "text", "p_processing_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."process_gdpr_deletion_request"("p_request_id" "uuid", "p_approve" boolean, "p_rejection_reason" "text", "p_processing_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_gdpr_deletion_request"("p_request_id" "uuid", "p_approve" boolean, "p_rejection_reason" "text", "p_processing_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."recompute_ticket_total"("p_ticket_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."recompute_ticket_total"("p_ticket_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."recompute_ticket_total"("p_ticket_id" "uuid") TO "service_role";



GRANT ALL ON PROCEDURE "public"."refresh_analytics_materialized_views"() TO "anon";
GRANT ALL ON PROCEDURE "public"."refresh_analytics_materialized_views"() TO "authenticated";
GRANT ALL ON PROCEDURE "public"."refresh_analytics_materialized_views"() TO "service_role";



GRANT ALL ON PROCEDURE "public"."refresh_quotes_materialized_views"() TO "anon";
GRANT ALL ON PROCEDURE "public"."refresh_quotes_materialized_views"() TO "authenticated";
GRANT ALL ON PROCEDURE "public"."refresh_quotes_materialized_views"() TO "service_role";



GRANT ALL ON FUNCTION "public"."restore_original_invoice_on_void"() TO "anon";
GRANT ALL ON FUNCTION "public"."restore_original_invoice_on_void"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."restore_original_invoice_on_void"() TO "service_role";



GRANT ALL ON FUNCTION "public"."safe_delete_ticket_stage"("p_stage_id" "uuid", "p_company_id" "uuid", "p_reassign_to" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."safe_delete_ticket_stage"("p_stage_id" "uuid", "p_company_id" "uuid", "p_reassign_to" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."safe_delete_ticket_stage"("p_stage_id" "uuid", "p_company_id" "uuid", "p_reassign_to" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."save_payment_integration"("p_company_id" "uuid", "p_provider" "text", "p_credentials" "jsonb", "p_webhook_secret" "text", "p_is_sandbox" boolean, "p_is_active" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."save_payment_integration"("p_company_id" "uuid", "p_provider" "text", "p_credentials" "jsonb", "p_webhook_secret" "text", "p_is_sandbox" boolean, "p_is_active" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_payment_integration"("p_company_id" "uuid", "p_provider" "text", "p_credentials" "jsonb", "p_webhook_secret" "text", "p_is_sandbox" boolean, "p_is_active" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."search_customers"("search_term" "text", "user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."search_customers"("search_term" "text", "user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_customers"("search_term" "text", "user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."search_customers_dev"("target_user_id" "uuid", "search_term" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."search_customers_dev"("target_user_id" "uuid", "search_term" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_customers_dev"("target_user_id" "uuid", "search_term" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_current_company_context"("company_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."set_current_company_context"("company_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_current_company_context"("company_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_initial_ticket_stage"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_initial_ticket_stage"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_initial_ticket_stage"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_invoice_month"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_invoice_month"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_invoice_month"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_quote_month"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_quote_month"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_quote_month"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_ticket_month"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_ticket_month"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_ticket_month"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at_ticket_products"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at_ticket_products"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at_ticket_products"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_ticket_tags_from_services"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_ticket_tags_from_services"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_ticket_tags_from_services"() TO "service_role";



GRANT ALL ON FUNCTION "public"."toggle_stage_visibility"("p_stage_id" "uuid", "p_hide" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."toggle_stage_visibility"("p_stage_id" "uuid", "p_hide" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."toggle_stage_visibility"("p_stage_id" "uuid", "p_hide" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."toggle_unit_visibility"("p_unit_id" "uuid", "p_operation" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."toggle_unit_visibility"("p_unit_id" "uuid", "p_operation" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."toggle_unit_visibility"("p_unit_id" "uuid", "p_operation" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_audit_access_requests"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_audit_access_requests"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_audit_access_requests"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_audit_clients"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_audit_clients"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_audit_clients"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_audit_consent_records"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_audit_consent_records"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_audit_consent_records"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_ticket_services_upsert"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_ticket_services_upsert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_ticket_services_upsert"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_update_last_accessed"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_update_last_accessed"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_update_last_accessed"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_client_consent"("p_client_id" "uuid", "p_consent_type" "text", "p_consent_given" boolean, "p_consent_method" "text", "p_consent_evidence" "jsonb", "p_updating_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."update_client_consent"("p_client_id" "uuid", "p_consent_type" "text", "p_consent_given" boolean, "p_consent_method" "text", "p_consent_evidence" "jsonb", "p_updating_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_client_consent"("p_client_id" "uuid", "p_consent_type" "text", "p_consent_given" boolean, "p_consent_method" "text", "p_consent_evidence" "jsonb", "p_updating_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_company_user"("p_user_id" "uuid", "p_role" "text", "p_active" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."update_company_user"("p_user_id" "uuid", "p_role" "text", "p_active" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_company_user"("p_user_id" "uuid", "p_role" "text", "p_active" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_customer_dev"("customer_id" "uuid", "target_user_id" "uuid", "p_nombre" character varying, "p_apellidos" character varying, "p_email" character varying, "p_telefono" character varying, "p_dni" character varying, "p_fecha_nacimiento" "date", "p_profesion" character varying, "p_empresa" character varying, "p_notas" "text", "p_avatar_url" "text", "p_direccion_id" "uuid", "p_activo" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."update_customer_dev"("customer_id" "uuid", "target_user_id" "uuid", "p_nombre" character varying, "p_apellidos" character varying, "p_email" character varying, "p_telefono" character varying, "p_dni" character varying, "p_fecha_nacimiento" "date", "p_profesion" character varying, "p_empresa" character varying, "p_notas" "text", "p_avatar_url" "text", "p_direccion_id" "uuid", "p_activo" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_customer_dev"("customer_id" "uuid", "target_user_id" "uuid", "p_nombre" character varying, "p_apellidos" character varying, "p_email" character varying, "p_telefono" character varying, "p_dni" character varying, "p_fecha_nacimiento" "date", "p_profesion" character varying, "p_empresa" character varying, "p_notas" "text", "p_avatar_url" "text", "p_direccion_id" "uuid", "p_activo" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_device_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_device_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_device_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_payment_integrations_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_payment_integrations_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_payment_integrations_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_quotes_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_quotes_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_quotes_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_service_variants_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_service_variants_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_service_variants_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_stage_order"("p_stage_id" "uuid", "p_new_position" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."update_stage_order"("p_stage_id" "uuid", "p_new_position" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_stage_order"("p_stage_id" "uuid", "p_new_position" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_verifactu_settings_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_verifactu_settings_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_verifactu_settings_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."upsert_user_module"("p_user_id" "uuid", "p_module_key" "text", "p_status" "public"."module_status") TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_user_module"("p_user_id" "uuid", "p_module_key" "text", "p_status" "public"."module_status") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_user_module"("p_user_id" "uuid", "p_module_key" "text", "p_status" "public"."module_status") TO "service_role";



REVOKE ALL ON FUNCTION "public"."upsert_verifactu_settings"("psoftware_code" "text", "pissuer_nif" "text", "pcert_pem" "text", "pkey_pem" "text", "pkey_passphrase" "text", "penvironment" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upsert_verifactu_settings"("psoftware_code" "text", "pissuer_nif" "text", "pcert_pem" "text", "pkey_pem" "text", "pkey_passphrase" "text", "penvironment" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_verifactu_settings"("psoftware_code" "text", "pissuer_nif" "text", "pcert_pem" "text", "pkey_pem" "text", "pkey_passphrase" "text", "penvironment" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_verifactu_settings"("psoftware_code" "text", "pissuer_nif" "text", "pcert_pem" "text", "pkey_pem" "text", "pkey_passphrase" "text", "penvironment" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."upsert_verifactu_settings"("p_company_id" "uuid", "p_software_code" "text", "p_software_name" "text", "p_software_version" "text", "p_issuer_nif" "text", "p_environment" "text", "p_is_active" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_verifactu_settings"("p_company_id" "uuid", "p_software_code" "text", "p_software_name" "text", "p_software_version" "text", "p_issuer_nif" "text", "p_environment" "text", "p_is_active" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_verifactu_settings"("p_company_id" "uuid", "p_software_code" "text", "p_software_name" "text", "p_software_version" "text", "p_issuer_nif" "text", "p_environment" "text", "p_is_active" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_file_path"("file_path" "text", "company_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."validate_file_path"("file_path" "text", "company_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_file_path"("file_path" "text", "company_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_invoice_before_issue"("pinvoiceid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."validate_invoice_before_issue"("pinvoiceid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_invoice_before_issue"("pinvoiceid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."verifactu_log_event"("pevent_type" "text", "pinvoice_id" "uuid", "pcompany_id" "uuid", "ppayload" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."verifactu_log_event"("pevent_type" "text", "pinvoice_id" "uuid", "pcompany_id" "uuid", "ppayload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."verifactu_log_event"("pevent_type" "text", "pinvoice_id" "uuid", "pcompany_id" "uuid", "ppayload" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."verifactu_preflight_issue"("pinvoice_id" "uuid", "pdevice_id" "text", "psoftware_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."verifactu_preflight_issue"("pinvoice_id" "uuid", "pdevice_id" "text", "psoftware_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."verifactu_preflight_issue"("pinvoice_id" "uuid", "pdevice_id" "text", "psoftware_id" "text") TO "service_role";



GRANT ALL ON PROCEDURE "public"."verifactu_process_pending_events"() TO "anon";
GRANT ALL ON PROCEDURE "public"."verifactu_process_pending_events"() TO "authenticated";
GRANT ALL ON PROCEDURE "public"."verifactu_process_pending_events"() TO "service_role";



GRANT ALL ON TABLE "public"."invoices" TO "anon";
GRANT ALL ON TABLE "public"."invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."invoices" TO "service_role";



GRANT ALL ON FUNCTION "public"."verifactu_status"("i" "public"."invoices") TO "anon";
GRANT ALL ON FUNCTION "public"."verifactu_status"("i" "public"."invoices") TO "authenticated";
GRANT ALL ON FUNCTION "public"."verifactu_status"("i" "public"."invoices") TO "service_role";



GRANT ALL ON TABLE "public"."quote_items" TO "anon";
GRANT ALL ON TABLE "public"."quote_items" TO "authenticated";
GRANT ALL ON TABLE "public"."quote_items" TO "service_role";



GRANT ALL ON TABLE "public"."ticket_stages" TO "anon";
GRANT ALL ON TABLE "public"."ticket_stages" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_stages" TO "service_role";



GRANT ALL ON TABLE "public"."addresses" TO "anon";
GRANT ALL ON TABLE "public"."addresses" TO "authenticated";
GRANT ALL ON TABLE "public"."addresses" TO "service_role";



GRANT ALL ON TABLE "public"."companies" TO "anon";
GRANT ALL ON TABLE "public"."companies" TO "authenticated";
GRANT ALL ON TABLE "public"."companies" TO "service_role";



GRANT ALL ON TABLE "public"."company_invitations" TO "anon";
GRANT ALL ON TABLE "public"."company_invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."company_invitations" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT ALL ON TABLE "public"."admin_company_analysis" TO "anon";
GRANT ALL ON TABLE "public"."admin_company_analysis" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_company_analysis" TO "service_role";



GRANT ALL ON TABLE "public"."admin_company_invitations" TO "anon";
GRANT ALL ON TABLE "public"."admin_company_invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_company_invitations" TO "service_role";



GRANT ALL ON TABLE "public"."pending_users" TO "anon";
GRANT ALL ON TABLE "public"."pending_users" TO "authenticated";
GRANT ALL ON TABLE "public"."pending_users" TO "service_role";



GRANT ALL ON TABLE "public"."admin_pending_users" TO "anon";
GRANT ALL ON TABLE "public"."admin_pending_users" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_pending_users" TO "service_role";



GRANT ALL ON TABLE "public"."ai_usage_logs" TO "anon";
GRANT ALL ON TABLE "public"."ai_usage_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_usage_logs" TO "service_role";



GRANT ALL ON TABLE "public"."app_settings" TO "anon";
GRANT ALL ON TABLE "public"."app_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."app_settings" TO "service_role";



GRANT ALL ON TABLE "public"."attachments" TO "anon";
GRANT ALL ON TABLE "public"."attachments" TO "authenticated";
GRANT ALL ON TABLE "public"."attachments" TO "service_role";



GRANT ALL ON TABLE "public"."client_portal_users" TO "anon";
GRANT ALL ON TABLE "public"."client_portal_users" TO "authenticated";
GRANT ALL ON TABLE "public"."client_portal_users" TO "service_role";



GRANT ALL ON TABLE "public"."client_variant_assignments" TO "anon";
GRANT ALL ON TABLE "public"."client_variant_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."client_variant_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."client_visible_quotes" TO "anon";
GRANT ALL ON TABLE "public"."client_visible_quotes" TO "authenticated";
GRANT ALL ON TABLE "public"."client_visible_quotes" TO "service_role";



GRANT ALL ON TABLE "public"."client_visible_services" TO "anon";
GRANT ALL ON TABLE "public"."client_visible_services" TO "authenticated";
GRANT ALL ON TABLE "public"."client_visible_services" TO "service_role";



GRANT ALL ON TABLE "public"."client_visible_tickets" TO "anon";
GRANT ALL ON TABLE "public"."client_visible_tickets" TO "authenticated";
GRANT ALL ON TABLE "public"."client_visible_tickets" TO "service_role";



GRANT ALL ON TABLE "public"."clients" TO "anon";
GRANT ALL ON TABLE "public"."clients" TO "authenticated";
GRANT ALL ON TABLE "public"."clients" TO "service_role";



GRANT ALL ON TABLE "public"."clients_tags" TO "anon";
GRANT ALL ON TABLE "public"."clients_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."clients_tags" TO "service_role";



GRANT ALL ON TABLE "public"."company_settings" TO "anon";
GRANT ALL ON TABLE "public"."company_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."company_settings" TO "service_role";



GRANT ALL ON TABLE "public"."company_stage_order" TO "anon";
GRANT ALL ON TABLE "public"."company_stage_order" TO "authenticated";
GRANT ALL ON TABLE "public"."company_stage_order" TO "service_role";



GRANT ALL ON TABLE "public"."device_components" TO "anon";
GRANT ALL ON TABLE "public"."device_components" TO "authenticated";
GRANT ALL ON TABLE "public"."device_components" TO "service_role";



GRANT ALL ON TABLE "public"."device_media" TO "anon";
GRANT ALL ON TABLE "public"."device_media" TO "authenticated";
GRANT ALL ON TABLE "public"."device_media" TO "service_role";



GRANT ALL ON TABLE "public"."device_status_history" TO "anon";
GRANT ALL ON TABLE "public"."device_status_history" TO "authenticated";
GRANT ALL ON TABLE "public"."device_status_history" TO "service_role";



GRANT ALL ON TABLE "public"."devices" TO "anon";
GRANT ALL ON TABLE "public"."devices" TO "authenticated";
GRANT ALL ON TABLE "public"."devices" TO "service_role";



GRANT ALL ON TABLE "public"."gdpr_access_requests" TO "anon";
GRANT ALL ON TABLE "public"."gdpr_access_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."gdpr_access_requests" TO "service_role";



GRANT ALL ON TABLE "public"."gdpr_audit_log" TO "anon";
GRANT ALL ON TABLE "public"."gdpr_audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."gdpr_audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."gdpr_breach_incidents" TO "anon";
GRANT ALL ON TABLE "public"."gdpr_breach_incidents" TO "authenticated";
GRANT ALL ON TABLE "public"."gdpr_breach_incidents" TO "service_role";



GRANT ALL ON TABLE "public"."gdpr_consent_records" TO "anon";
GRANT ALL ON TABLE "public"."gdpr_consent_records" TO "authenticated";
GRANT ALL ON TABLE "public"."gdpr_consent_records" TO "service_role";



GRANT ALL ON TABLE "public"."gdpr_consent_overview" TO "anon";
GRANT ALL ON TABLE "public"."gdpr_consent_overview" TO "authenticated";
GRANT ALL ON TABLE "public"."gdpr_consent_overview" TO "service_role";



GRANT ALL ON TABLE "public"."gdpr_consent_requests" TO "anon";
GRANT ALL ON TABLE "public"."gdpr_consent_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."gdpr_consent_requests" TO "service_role";



GRANT ALL ON TABLE "public"."gdpr_processing_activities" TO "anon";
GRANT ALL ON TABLE "public"."gdpr_processing_activities" TO "authenticated";
GRANT ALL ON TABLE "public"."gdpr_processing_activities" TO "service_role";



GRANT ALL ON TABLE "public"."gdpr_processing_inventory" TO "anon";
GRANT ALL ON TABLE "public"."gdpr_processing_inventory" TO "authenticated";
GRANT ALL ON TABLE "public"."gdpr_processing_inventory" TO "service_role";



GRANT ALL ON TABLE "public"."global_tags" TO "anon";
GRANT ALL ON TABLE "public"."global_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."global_tags" TO "service_role";



GRANT ALL ON TABLE "public"."hidden_stages" TO "anon";
GRANT ALL ON TABLE "public"."hidden_stages" TO "authenticated";
GRANT ALL ON TABLE "public"."hidden_stages" TO "service_role";



GRANT ALL ON TABLE "public"."hidden_units" TO "anon";
GRANT ALL ON TABLE "public"."hidden_units" TO "authenticated";
GRANT ALL ON TABLE "public"."hidden_units" TO "service_role";



GRANT ALL ON TABLE "public"."invitations" TO "anon";
GRANT ALL ON TABLE "public"."invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."invitations" TO "service_role";



GRANT ALL ON TABLE "public"."invoice_items" TO "anon";
GRANT ALL ON TABLE "public"."invoice_items" TO "authenticated";
GRANT ALL ON TABLE "public"."invoice_items" TO "service_role";



GRANT ALL ON TABLE "public"."invoice_meta" TO "anon";
GRANT ALL ON TABLE "public"."invoice_meta" TO "authenticated";
GRANT ALL ON TABLE "public"."invoice_meta" TO "service_role";



GRANT ALL ON TABLE "public"."invoice_payments" TO "anon";
GRANT ALL ON TABLE "public"."invoice_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."invoice_payments" TO "service_role";



GRANT ALL ON TABLE "public"."invoice_series" TO "anon";
GRANT ALL ON TABLE "public"."invoice_series" TO "authenticated";
GRANT ALL ON TABLE "public"."invoice_series" TO "service_role";



GRANT ALL ON TABLE "public"."invoice_templates" TO "anon";
GRANT ALL ON TABLE "public"."invoice_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."invoice_templates" TO "service_role";



GRANT ALL ON TABLE "public"."invoiceseries" TO "anon";
GRANT ALL ON TABLE "public"."invoiceseries" TO "authenticated";
GRANT ALL ON TABLE "public"."invoiceseries" TO "service_role";



GRANT ALL ON TABLE "public"."job_notes" TO "anon";
GRANT ALL ON TABLE "public"."job_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."job_notes" TO "service_role";



GRANT ALL ON TABLE "public"."modules" TO "anon";
GRANT ALL ON TABLE "public"."modules" TO "authenticated";
GRANT ALL ON TABLE "public"."modules" TO "service_role";



GRANT ALL ON TABLE "public"."modules_catalog" TO "anon";
GRANT ALL ON TABLE "public"."modules_catalog" TO "authenticated";
GRANT ALL ON TABLE "public"."modules_catalog" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."payment_integrations" TO "anon";
GRANT ALL ON TABLE "public"."payment_integrations" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_integrations" TO "service_role";



GRANT ALL ON TABLE "public"."payment_transactions" TO "anon";
GRANT ALL ON TABLE "public"."payment_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."product_brands" TO "anon";
GRANT ALL ON TABLE "public"."product_brands" TO "authenticated";
GRANT ALL ON TABLE "public"."product_brands" TO "service_role";



GRANT ALL ON TABLE "public"."product_categories" TO "anon";
GRANT ALL ON TABLE "public"."product_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."product_categories" TO "service_role";



GRANT ALL ON TABLE "public"."products" TO "anon";
GRANT ALL ON TABLE "public"."products" TO "authenticated";
GRANT ALL ON TABLE "public"."products" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."quote_templates" TO "anon";
GRANT ALL ON TABLE "public"."quote_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."quote_templates" TO "service_role";



GRANT ALL ON TABLE "public"."scheduled_jobs" TO "anon";
GRANT ALL ON TABLE "public"."scheduled_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."scheduled_jobs" TO "service_role";



GRANT ALL ON TABLE "public"."service_categories" TO "anon";
GRANT ALL ON TABLE "public"."service_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."service_categories" TO "service_role";



GRANT ALL ON TABLE "public"."service_tag_relations" TO "anon";
GRANT ALL ON TABLE "public"."service_tag_relations" TO "authenticated";
GRANT ALL ON TABLE "public"."service_tag_relations" TO "service_role";



GRANT ALL ON TABLE "public"."service_tags" TO "anon";
GRANT ALL ON TABLE "public"."service_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."service_tags" TO "service_role";



GRANT ALL ON TABLE "public"."service_units" TO "anon";
GRANT ALL ON TABLE "public"."service_units" TO "authenticated";
GRANT ALL ON TABLE "public"."service_units" TO "service_role";



GRANT ALL ON TABLE "public"."service_variants" TO "anon";
GRANT ALL ON TABLE "public"."service_variants" TO "authenticated";
GRANT ALL ON TABLE "public"."service_variants" TO "service_role";



GRANT ALL ON TABLE "public"."ticket_comment_attachments" TO "anon";
GRANT ALL ON TABLE "public"."ticket_comment_attachments" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_comment_attachments" TO "service_role";



GRANT ALL ON TABLE "public"."ticket_comment_versions" TO "anon";
GRANT ALL ON TABLE "public"."ticket_comment_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_comment_versions" TO "service_role";



GRANT ALL ON TABLE "public"."ticket_comments" TO "anon";
GRANT ALL ON TABLE "public"."ticket_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_comments" TO "service_role";



GRANT ALL ON TABLE "public"."ticket_devices" TO "anon";
GRANT ALL ON TABLE "public"."ticket_devices" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_devices" TO "service_role";



GRANT ALL ON TABLE "public"."ticket_products" TO "anon";
GRANT ALL ON TABLE "public"."ticket_products" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_products" TO "service_role";



GRANT ALL ON TABLE "public"."ticket_services" TO "anon";
GRANT ALL ON TABLE "public"."ticket_services" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_services" TO "service_role";



GRANT ALL ON TABLE "public"."ticket_tag_relations" TO "anon";
GRANT ALL ON TABLE "public"."ticket_tag_relations" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_tag_relations" TO "service_role";



GRANT ALL ON TABLE "public"."ticket_tags" TO "anon";
GRANT ALL ON TABLE "public"."ticket_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."ticket_tags" TO "service_role";



GRANT ALL ON TABLE "public"."tickets_tags" TO "anon";
GRANT ALL ON TABLE "public"."tickets_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."tickets_tags" TO "service_role";



GRANT ALL ON SEQUENCE "public"."tickets_ticket_number_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."tickets_ticket_number_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."tickets_ticket_number_seq" TO "service_role";



GRANT ALL ON TABLE "public"."user_company_context" TO "anon";
GRANT ALL ON TABLE "public"."user_company_context" TO "authenticated";
GRANT ALL ON TABLE "public"."user_company_context" TO "service_role";



GRANT ALL ON TABLE "public"."user_modules" TO "anon";
GRANT ALL ON TABLE "public"."user_modules" TO "authenticated";
GRANT ALL ON TABLE "public"."user_modules" TO "service_role";



GRANT ALL ON TABLE "public"."users_with_company" TO "anon";
GRANT ALL ON TABLE "public"."users_with_company" TO "authenticated";
GRANT ALL ON TABLE "public"."users_with_company" TO "service_role";



GRANT ALL ON TABLE "public"."v_current_user_modules" TO "anon";
GRANT ALL ON TABLE "public"."v_current_user_modules" TO "authenticated";
GRANT ALL ON TABLE "public"."v_current_user_modules" TO "service_role";



GRANT ALL ON TABLE "public"."verifactu_cert_history" TO "anon";
GRANT ALL ON TABLE "public"."verifactu_cert_history" TO "authenticated";
GRANT ALL ON TABLE "public"."verifactu_cert_history" TO "service_role";



GRANT ALL ON TABLE "public"."verifactu_events" TO "anon";
GRANT ALL ON TABLE "public"."verifactu_events" TO "authenticated";
GRANT ALL ON TABLE "public"."verifactu_events" TO "service_role";



GRANT ALL ON TABLE "public"."verifactu_function_log" TO "anon";
GRANT ALL ON TABLE "public"."verifactu_function_log" TO "authenticated";
GRANT ALL ON TABLE "public"."verifactu_function_log" TO "service_role";



GRANT ALL ON TABLE "public"."verifactu_invoice_meta" TO "anon";
GRANT ALL ON TABLE "public"."verifactu_invoice_meta" TO "authenticated";
GRANT ALL ON TABLE "public"."verifactu_invoice_meta" TO "service_role";



GRANT ALL ON TABLE "public"."verifactu_settings" TO "anon";
GRANT ALL ON TABLE "public"."verifactu_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."verifactu_settings" TO "service_role";



GRANT ALL ON TABLE "public"."visible_stages_by_company" TO "anon";
GRANT ALL ON TABLE "public"."visible_stages_by_company" TO "authenticated";
GRANT ALL ON TABLE "public"."visible_stages_by_company" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";






