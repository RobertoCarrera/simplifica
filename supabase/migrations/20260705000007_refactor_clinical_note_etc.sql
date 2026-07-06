-- Migration: refactor 3 functions to read from company_module_grants
-- Date: 2026-07-05
--
-- Background: migration 20260705000001 introduced public.company_module_grants
-- as the new source of truth for company-level module access. The legacy
-- public.company_modules table is kept for back-compat but every new read
-- should go through the grants table.
--
-- This migration rewrites the 3 application-level functions that still read
-- from public.company_modules so they read from public.company_module_grants
-- instead. Each rewrite is a 1:1 table swap — no logic changes, same
-- signature, same SECURITY DEFINER posture, same search_path, same EXECUTE
-- grants.
--
-- Functions rewritten (the 3 that actually read from public.company_modules):
--   1. create_clinical_note            (8-arg overload with the module gate)
--   2. create_booking_clinical_note    (module gate on historial_clinico)
--   3. generate_privacy_policy_html    (ARRAY_AGG of active module_keys)
--
-- Not touched:
--   - create_clinical_note (2-arg overload): never read company_modules;
--     left in place because it has different semantics and a different
--     caller surface. Refactor it separately if/when needed.
--   - ensure_simplifica_moduloProyectos_active: this is a MIGRATION FILENAME,
--     not a function. The June-10 migration was a one-shot DO block that
--     inserted/updated the moduloProyectos row in company_modules for the
--     company with slug='simplifica'. There is no function by that name in
--     pg_proc and no trigger function either. The moduloProyectos grant was
--     already backfilled into company_module_grants by migration
--     20260705000001, which is the equivalent of the old idempotent block
--     for the new schema.

-- ============================================================================
-- 1. create_clinical_note (8-arg overload with module flag check)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_clinical_note(
  p_client_id uuid,
  p_content text,
  p_title text DEFAULT NULL::text,
  p_sequence_number integer DEFAULT NULL::integer,
  p_event_date timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_source text DEFAULT NULL::text,
  p_source_id text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_note_id          uuid;
  v_existing_id      uuid;
  v_existing_content text;
  v_encrypted_content text;
  v_encryption_key   text;
  v_company_id       uuid;
  v_caller_user_id   uuid;
  v_current_version  SMALLINT := 1;
  v_deduped          boolean := false;
BEGIN
  -- 1. Resolve caller
  SELECT u.id INTO v_caller_user_id
  FROM public.users u
  WHERE u.auth_user_id = auth.uid();

  IF v_caller_user_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: no user profile linked to this auth session';
  END IF;

  -- 2. Permission check: caller must be an active member of the client's company
  SELECT c.company_id INTO v_company_id
  FROM public.clients c
  JOIN public.company_members cm ON c.company_id = cm.company_id
  WHERE c.id = p_client_id
    AND cm.user_id = v_caller_user_id
    AND cm.status = 'active';

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: user is not an active member of this client''s company';
  END IF;

  -- 3. Module flag check: historial_clinico must be active for the company
  IF NOT EXISTS (
    SELECT 1 FROM public.company_module_grants
    WHERE company_id = v_company_id
      AND module_key = 'historial_clinico'
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Module not enabled: historial_clinico is not active for this company';
  END IF;

  -- 4. Health-data consent check
  IF NOT EXISTS (
    SELECT 1 FROM public.clients
    WHERE id = p_client_id AND health_data_consent = true
  ) THEN
    RAISE EXCEPTION 'Consent not granted: client has not consented to health-data processing';
  END IF;

  -- 5. Read encryption key from Vault
  SELECT ds.decrypted_secret INTO v_encryption_key
  FROM vault.decrypted_secrets ds
  WHERE ds.name = 'clinical_encryption_key_v' || v_current_version::TEXT;

  IF v_encryption_key IS NULL OR v_encryption_key = '' THEN
    RAISE EXCEPTION 'Encryption key v% not found in Vault. Contact your system administrator.', v_current_version;
  END IF;

  -- 6. Idempotency: if (client_id, source, source_id) already exists, update it
  IF p_source IS NOT NULL AND p_source_id IS NOT NULL THEN
    SELECT id, extensions.pgp_sym_decrypt(content::bytea, v_encryption_key)
      INTO v_existing_id, v_existing_content
    FROM public.client_clinical_notes
    WHERE client_id = p_client_id
      AND source = p_source
      AND source_id = p_source_id
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      v_deduped := true;

      -- Re-encrypt only if content actually changed
      IF v_existing_content IS DISTINCT FROM p_content THEN
        v_encrypted_content := extensions.pgp_sym_encrypt(p_content, v_encryption_key);
        UPDATE public.client_clinical_notes
        SET content        = v_encrypted_content,
            title          = COALESCE(p_title, title),
            sequence_number = COALESCE(p_sequence_number, sequence_number),
            event_date     = COALESCE(p_event_date, event_date),
            updated_at     = now()
        WHERE id = v_existing_id
        RETURNING id INTO v_note_id;
      ELSE
        -- Content unchanged: just refresh metadata (title/seq/date) without re-encrypting
        UPDATE public.client_clinical_notes
        SET title          = COALESCE(p_title, title),
            sequence_number = COALESCE(p_sequence_number, sequence_number),
            event_date     = COALESCE(p_event_date, event_date),
            updated_at     = now()
        WHERE id = v_existing_id
        RETURNING id INTO v_note_id;
      END IF;

      RETURN jsonb_build_object('id', v_note_id, 'deduped', v_deduped);
    END IF;
  END IF;

  -- 7. New row: encrypt and insert
  v_encrypted_content := extensions.pgp_sym_encrypt(p_content, v_encryption_key);

  INSERT INTO public.client_clinical_notes (
    client_id, content, created_by, key_version,
    title, sequence_number, event_date, source, source_id, imported_at, imported_by
  )
  VALUES (
    p_client_id,
    v_encrypted_content,
    v_caller_user_id,
    v_current_version,
    p_title,
    p_sequence_number,
    p_event_date,
    p_source,
    p_source_id,
    CASE WHEN p_source IS NOT NULL THEN now() ELSE NULL END,
    CASE WHEN p_source IS NOT NULL THEN v_caller_user_id ELSE NULL END
  )
  RETURNING id INTO v_note_id;

  RETURN jsonb_build_object('id', v_note_id, 'deduped', false);
END;
$function$;

-- ============================================================================
-- 2. create_booking_clinical_note
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_booking_clinical_note(
  p_booking_id uuid,
  p_content text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_note_id          uuid;
  v_company_id       uuid;
  v_client_id        uuid;
  v_caller_user_id   uuid;
  v_current_version  SMALLINT := 1;
  v_encrypted_content text;
  v_encryption_key   text;
BEGIN
  -- 1. Resolve the caller's public.users.id from auth.uid()
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Access denied: no authenticated session';
  END IF;

  SELECT u.id INTO v_caller_user_id
  FROM public.users u
  WHERE u.auth_user_id = auth.uid();

  IF v_caller_user_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: no user profile linked to this auth session';
  END IF;

  -- 2. Permission + tenant check: caller must be an active member of the
  --    booking's company. Resolve client_id from the booking in the same
  --    statement (avoids an extra round-trip and keeps the check atomic).
  SELECT b.company_id, b.client_id
    INTO v_company_id, v_client_id
  FROM public.bookings b
  JOIN public.company_members cm ON cm.company_id = b.company_id
  WHERE b.id = p_booking_id
    AND cm.user_id = v_caller_user_id
    AND cm.status = 'active'
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Access denied: user is not an active member of this booking''s company';
  END IF;

  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'Invalid booking: booking has no client_id';
  END IF;

  -- 3. Module flag check: historial_clinico must be active for the company
  IF NOT EXISTS (
    SELECT 1 FROM public.company_module_grants
    WHERE company_id = v_company_id
      AND module_key = 'historial_clinico'
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Module not enabled: historial_clinico is not active for this company';
  END IF;

  -- 4. Health-data consent check on the client linked to the booking
  IF NOT EXISTS (
    SELECT 1 FROM public.clients
    WHERE id = v_client_id AND health_data_consent = true
  ) THEN
    RAISE EXCEPTION 'Consent not granted: client has not consented to health-data processing';
  END IF;

  -- 5. Read encryption key from Vault (same key as create_clinical_note)
  SELECT ds.decrypted_secret INTO v_encryption_key
  FROM vault.decrypted_secrets ds
  WHERE ds.name = 'clinical_encryption_key_v' || v_current_version::TEXT;

  IF v_encryption_key IS NULL OR v_encryption_key = '' THEN
    RAISE EXCEPTION 'Encryption key v% not found in Vault. Contact your system administrator.', v_current_version;
  END IF;

  -- 6. Encrypt and insert
  v_encrypted_content := extensions.pgp_sym_encrypt(p_content, v_encryption_key);

  INSERT INTO public.booking_clinical_notes (
    booking_id, client_id, content, created_by, key_version
  )
  VALUES (
    p_booking_id, v_client_id, v_encrypted_content, v_caller_user_id, v_current_version
  )
  RETURNING id INTO v_note_id;

  RETURN jsonb_build_object('id', v_note_id, 'deduped', false);
END;
$function$;

-- ============================================================================
-- 3. generate_privacy_policy_html
-- ============================================================================
CREATE OR REPLACE FUNCTION public.generate_privacy_policy_html(p_company_id uuid)
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_company RECORD;
  v_settings jsonb;
  v_company_type text;
  v_nif text;
  v_address text;
  v_phone text;
  v_dpo_name text;
  v_dpo_email text;
  v_responsable_name text;
  v_responsable_label text;
  v_active_providers text[];
  v_module_keys text[];
  v_has_google_calendar boolean;
  v_has_docplanner boolean;
  v_has_holded boolean;
  v_has_stripe boolean;
  v_has_paypal boolean;
  v_has_clinical boolean;
  v_has_invoices boolean;
  v_has_marketing boolean;
  v_current_date text;
  v_recipients text;
  v_purposes text;
  v_data_categories text;
  v_legal_representative_html text;
  v_dpo_html text;
  v_treats_minors boolean;
BEGIN
  SELECT id, name, nif, company_type, settings INTO v_company
  FROM companies WHERE id = p_company_id;
  
  IF NOT FOUND THEN
    RETURN 'Error: Empresa no encontrada';
  END IF;
  
  v_company_type := COALESCE(v_company.company_type, 'autonomo');
  v_nif := COALESCE(v_company.nif, 'B00000000');
  v_settings := COALESCE(v_company.settings, '{}'::jsonb);
  v_address := NULLIF(v_settings->>'address', '');
  IF v_address IS NULL THEN v_address := 'Dirección no especificada'; END IF;
  v_phone := COALESCE(NULLIF(v_settings->>'phone', ''), '');
  v_dpo_name := COALESCE(NULLIF(v_settings->>'dpo_name', ''), NULLIF(v_settings->>'dpo_contact_name', ''), 'DPO');
  v_dpo_email := COALESCE(NULLIF(v_settings->>'dpo_email', ''), NULLIF(v_settings->>'contact_email', ''), NULLIF(v_settings->>'email', ''), '');
  v_treats_minors := (v_settings->>'treats_minors_data')::boolean = true;
  
  IF v_company_type = 'autonomo' THEN
    v_responsable_name := COALESCE(
      NULLIF(v_settings->>'legal_representative_name', ''),
      NULLIF(v_settings->>'owner_name', ''),
      v_company.name,
      'Autónomo'
    );
    v_responsable_label := 'Responsable (Titular)';
  ELSE
    v_responsable_name := COALESCE(v_company.name, 'Empresa');
    v_responsable_label := 'Responsable';
  END IF;
  
  SELECT ARRAY_AGG(provider) INTO v_active_providers
  FROM integrations WHERE company_id = p_company_id;
  v_active_providers := COALESCE(v_active_providers, ARRAY[]::text[]);
  
  v_has_google_calendar := 'google_calendar' = ANY(v_active_providers);
  v_has_docplanner := 'docplanner' = ANY(v_active_providers);
  v_has_holded := 'holded' = ANY(v_active_providers);
  v_has_stripe := 'stripe' = ANY(v_active_providers);
  v_has_paypal := 'paypal' = ANY(v_active_providers);
  
  -- Aggregates active module grants from company_module_grants (new source of truth).
  SELECT ARRAY_AGG(module_key) INTO v_module_keys
  FROM company_module_grants WHERE company_id = p_company_id AND status = 'active';
  v_module_keys := COALESCE(v_module_keys, ARRAY[]::text[]);
  
  v_has_clinical := 'moduloClinico' = ANY(v_module_keys) OR 'clinical' = ANY(v_module_keys);
  v_has_invoices := 'moduloFacturas' = ANY(v_module_keys) OR 'moduloPresupuestos' = ANY(v_module_keys) OR 'invoices' = ANY(v_module_keys) OR 'billing' = ANY(v_module_keys);
  v_has_marketing := 'marketing' = ANY(v_module_keys) OR 'moduloMarketing' = ANY(v_module_keys);
  
  v_current_date := TO_CHAR(CURRENT_DATE, 'DD FMmonth YYYY');
  
  v_recipients := '<tr><td>Supabase Ltd</td><td>Base de datos y autenticación</td><td>Francia</td><td>DPA, datos en UE</td></tr>'
    || '<tr><td>Amazon Web Services (SES)</td><td>Correo electrónico transaccional</td><td>Francia</td><td>DPA, datos en UE</td></tr>'
    || '<tr><td>Vercel Inc.</td><td>Alojamiento web</td><td>Francia</td><td>DPA, datos en UE</td></tr>';
  
  IF v_has_stripe OR v_has_paypal THEN
    v_recipients := v_recipients || '<tr><td>Stripe / PayPal</td><td>Procesamiento de pagos</td><td>EE.UU./Luxemburgo</td><td>CCT / UE</td></tr>';
  END IF;
  
  IF v_has_google_calendar THEN
    v_recipients := v_recipients || '<tr><td>Google LLC</td><td>Sincronización de calendario</td><td>EE.UU.</td><td>CCT (Art. 46 RGPD)</td></tr>';
  END IF;
  
  IF v_has_docplanner THEN
    v_recipients := v_recipients || '<tr><td>Docplanner Tech S.L.</td><td>Sincronización de agenda (DocPlanner/Doctoralia)</td><td>España (UE)</td><td>DPA, datos en UE</td></tr>';
  END IF;
  
  IF v_has_holded THEN
    v_recipients := v_recipients || '<tr><td>Holded</td><td>Contabilidad y facturación</td><td>España (UE)</td><td>DPA, datos en UE</td></tr>';
  END IF;
  
  v_purposes := '<tr><td>Gestión de clientes y relación contractual</td><td>Ejecución de contrato (Art. 6.1.b RGPD)</td></tr>'
    || '<tr><td>Programación de citas y reservas</td><td>Ejecución de contrato (Art. 6.1.b RGPD)</td></tr>';
  
  IF v_has_invoices THEN
    v_purposes := v_purposes || '<tr><td>Facturación, contabilidad y obligaciones fiscales</td><td>Obligación legal (Art. 6.1.c RGPD)</td></tr>';
  END IF;
  
  IF v_has_clinical THEN
    v_purposes := v_purposes || '<tr><td>Tratamiento de datos de salud (módulo clínico)</td><td>Art. 9.2.h RGPD + Art. 9 LOPDGDD (asistencia sanitaria)</td></tr>';
  END IF;
  
  IF v_has_marketing THEN
    v_purposes := v_purposes || '<tr><td>Envío de comunicaciones comerciales</td><td>Consentimiento (Art. 6.1.a RGPD)</td></tr>';
  END IF;
  
  v_purposes := v_purposes || '<tr><td>Seguridad del sistema y prevención del fraude</td><td>Interés legítimo (Art. 6.1.f RGPD)</td></tr>';
  
  v_data_categories := '<li><strong>Datos identificativos:</strong> nombre, apellidos, dirección, correo electrónico, teléfono, NIF/CIF.</li>'
    || '<li><strong>Datos de contacto:</strong> email, teléfono, dirección postal.</li>'
    || '<li><strong>Datos de citas/reservas:</strong> historial de citas, servicios contratados, profesional asignado.</li>';
  
  IF v_has_clinical THEN
    v_data_categories := v_data_categories || '<li><strong>Datos de salud</strong> (categoría especial Art. 9 RGPD): notas clínicas, historiales médicos, diagnósticos. Estos datos se almacenan cifrados con AES-256.</li>';
  END IF;
  
  IF v_has_invoices THEN
    v_data_categories := v_data_categories || '<li><strong>Datos económicos:</strong> datos de facturación, IBAN, información de pago.</li>';
  END IF;
  
  v_data_categories := v_data_categories || '<li><strong>Datos de navegación:</strong> logs de acceso, dirección IP, agente de usuario.</li>';
  
  v_legal_representative_html := '';
  IF v_company_type = 'empresa' AND NULLIF(v_settings->>'legal_representative_name', '') IS NOT NULL THEN
    v_legal_representative_html := '<li><strong>Representante legal:</strong> ' || (v_settings->>'legal_representative_name') || '</li>';
  END IF;
  
  v_dpo_html := '';
  IF v_dpo_email IS NOT NULL AND v_dpo_email != '' THEN
    v_dpo_html := '<li><strong>Delegado de Protección de Datos:</strong> ' || CASE WHEN v_dpo_name != 'DPO' THEN v_dpo_name || ' — ' ELSE '' END || v_dpo_email || '</li>';
  END IF;
  
  RETURN '<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Política de Privacidad - ' || v_company.name || '</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, sans-serif; line-height: 1.6; color: #333; background: #f9fafb; }
    .container { max-width: 800px; margin: 0 auto; padding: 40px 20px; }
    .content { background: white; border-radius: 12px; padding: 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    h1 { font-size: 2rem; color: #111; margin-bottom: 8px; }
    h2 { font-size: 1.25rem; color: #1f2937; margin: 24px 0 12px; border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; }
    p, li { color: #4b5563; }
    ul { margin: 8px 0 16px 24px; }
    li { margin: 4px 0; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 0.875rem; }
    th, td { padding: 10px 12px; text-align: left; border: 1px solid #e5e7eb; }
    th { background: #f3f4f6; font-weight: 600; }
    .meta { color: #6b7280; font-size: 0.875rem; margin-bottom: 32px; }
    .footer { margin-top: 32px; padding-top: 24px; border-top: 1px solid #e5e7eb; display: flex; gap: 16px; flex-wrap: wrap; }
    .footer a { color: #2563eb; text-decoration: none; }
    .footer a:hover { text-decoration: underline; }
    .highlight { background: #fef3c7; padding: 12px 16px; border-radius: 8px; margin: 16px 0; }
    .highlight strong { color: #92400e; }
    .rights-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin: 16px 0; }
    .right-card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; }
    .right-card h4 { margin: 0 0 8px; color: #1f2937; font-size: 0.95rem; }
    .right-card p { margin: 0; font-size: 0.85rem; }
    .email-box { background: #f3f4f6; padding: 16px; border-radius: 8px; margin-top: 12px; }
    .email-box strong { color: #1f2937; }
  </style>
</head>
<body>
  <div class="container">
    <div class="content">
      <h1>Política de Privacidad</h1>
      <p class="meta">Última actualización: ' || v_current_date || '</p>

      <div class="highlight">
        <strong>Aviso importante:</strong> ' || v_responsable_name || ' opera como <strong>Responsable del Tratamiento</strong> (Data Controller) de sus datos personales. 
        Simplifica CRM proporciona la infraestructura tecnológica y es el <strong>Encargado del Tratamiento</strong> (Data Processor), 
        conforme al Artículo 28 del RGPD. Esta política ha sido generada automáticamente basada en la configuración de ' || v_responsable_name || '.
      </div>

      <h2>1. Responsable del Tratamiento</h2>
      <p>En cumplimiento del artículo 13 del Reglamento (UE) 2016/679 (RGPD) y de la Ley Orgánica 3/2018 (LOPDGDD):</p>
      <ul>
        <li><strong>' || v_responsable_label || ':</strong> ' || v_responsable_name || '</li>
        ' || CASE WHEN v_company_type = 'empresa' THEN '<li><strong>Denominación social:</strong> ' || v_company.name || '</li>' ELSE '' END || '
        <li><strong>NIF/CIF:</strong> ' || v_nif || '</li>
        <li><strong>Domicilio:</strong> ' || v_address || CASE WHEN v_phone != '' THEN ', ' || v_phone ELSE '' END || '</li>
        <li><strong>Correo de contacto:</strong> ' || COALESCE(v_dpo_email, 'No especificado') || '</li>
        ' || v_legal_representative_html || '
        ' || v_dpo_html || '
      </ul>

      <h2>2. Finalidades del Tratamiento y Base Jurídica</h2>
      <p>Tratamos sus datos personales para las siguientes finalidades:</p>
      <table>
        <thead>
          <tr><th>Finalidad</th><th>Base jurídica</th></tr>
        </thead>
        <tbody>
          ' || v_purposes || '
        </tbody>
      </table>

      <h2>3. Categorías de Datos Tratados</h2>
      <p>Según el contexto de uso, tratamos las siguientes categorías de datos:</p>
      <ul>
        ' || v_data_categories || '
      </ul>
      ' || CASE WHEN v_treats_minors THEN '<p>ADVERTENCIA: Este servicio puede tratar datos de menores de 14 años. Se requiere consentimiento verificable de padre/tutor legal.</p>' ELSE '<p>No tratamos datos de menores de 14 años sin el consentimiento de sus representantes legales.</p>' END || '

      <h2>4. Plazos de Conservación</h2>
      <table>
        <thead>
          <tr><th>Categoría</th><th>Plazo</th><th>Norma</th></tr>
        </thead>
        <tbody>
          <tr><td>Datos de cuenta y relación contractual</td><td>Duración del contrato + 3 años</td><td>Art. 1964 CC</td></tr>
          <tr><td>Datos fiscales y de facturación</td><td>4 años</td><td>Arts. 66-70 LGT</td></tr>
          ' || CASE WHEN v_has_clinical THEN '<tr><td>Datos clínicos / historial de salud</td><td>Mínimo 5 años desde el alta</td><td>Art. 17 Ley 41/2002</td></tr>' ELSE '' END || '
          <tr><td>Logs de auditoría y seguridad</td><td>10 años</td><td>RGPD Art. 5.2</td></tr>
          <tr><td>Consentimientos de marketing</td><td>Hasta retirada del consentimiento</td><td>Art. 7 RGPD</td></tr>
        </tbody>
      </table>

      <h2>5. Destinatarios y Sub-encargados</h2>
      <p>Sus datos no se cederán a terceros con fines comerciales. Para prestar el servicio:</p>
      <table>
        <thead>
          <tr><th>Proveedor</th><th>Servicio</th><th>País</th><th>Garantía</th></tr>
        </thead>
        <tbody>
          ' || v_recipients || '
        </tbody>
      </table>

      <h2>6. Transferencias Internacionales</h2>
      <p>
        Todos los proveedores de servicios están ubicados en la <strong>Unión Europea</strong>. 
        No se realizan transferencias de datos fuera del EEE.
      </p>

      <h2>7. Sus Derechos</h2>
      <p>Puede ejercer sus derechos de protección de datos de forma sencilla desde nuestra aplicación:</p>
      
      <div class="rights-grid">
        <div class="right-card">
          <h4>📖 Acceso</h4>
          <p>Conoce todos los datos personales que almacenamos sobre ti.</p>
        </div>
        <div class="right-card">
          <h4>✏️ Rectificación</h4>
          <p>Corrige datos inexactos o incompletos de tu perfil.</p>
        </div>
        <div class="right-card">
          <h4>🗑️ Supresión</h4>
          <p>Solicita la eliminación de tus datos (cuando la ley lo permita).</p>
        </div>
        <div class="right-card">
          <h4>⏸️ Limitación</h4>
          <p>Restringe cómo usamos tus datos en determinadas situaciones.</p>
        </div>
        <div class="right-card">
          <h4>📥 Portabilidad</h4>
          <p>Recibe todos tus datos en formato estructurado y legible.</p>
        </div>
        <div class="right-card">
          <h4>🚫 Oposición</h4>
          <p>Objeta el tratamiento basado en interés legítimo.</p>
        </div>
      </div>
      
      <p>Para ejercer tus derechos, accede a tu cuenta y visita la sección <strong>"Mis Derechos RGPD"</strong>. Si prefieres contactar por correo:</p>
      
      <div class="email-box">
        <p><strong>Email:</strong> ' || COALESCE(v_dpo_email, 'info@empresa.com') || '</p>
        <p style="font-size: 0.85rem; color: #6b7280; margin-top: 8px;">Responderemos a tu solicitud en un plazo máximo de <strong>30 días</strong>.</p>
      </div>

      <h2>8. Derecho a Reclamar ante la AEPD</h2>
      <p>
        Si considera que el tratamiento infringe la normativa de protección de datos, puede presentar 
        reclamación ante la <strong>Agencia Española de Protección de Datos (AEPD)</strong>: 
        <a href="https://www.aepd.es" target="_blank" rel="noopener">www.aepd.es</a> — C/Jorge Juan, 6, 28001 Madrid.
      </p>

      <h2>9. Decisiones Automatizadas</h2>
      <p>
        ' || v_company.name || ' <strong>no adopta decisiones individuales automatizadas</strong> que produzcan efectos jurídicos 
        o que afecten significativamente al interesado (Art. 22 RGPD).
      </p>

      <h2>10. Cookies</h2>
      <p>
        Esta plataforma utiliza únicamente <strong>cookies técnicas y de sesión</strong> estrictamente necesarias 
        para el funcionamiento del servicio (autenticación, preferencias). No usamos cookies analíticas ni publicitarias.
      </p>

      <h2>11. Modificaciones</h2>
      <p>
        Esta Política puede actualizarse periódicamente. Le notificaremos los cambios materiales 
        con al menos 30 días de antelación.
      </p>

      <div class="footer">
        <a href="/">Volver al inicio</a>
      </div>
    </div>
  </div>
</body>
</html>';
END;
$function$;

-- ============================================================================
-- Grants (defensive: preserve EXECUTE access for the 3 application roles
-- that already had it. CREATE OR REPLACE FUNCTION preserves existing grants,
-- so these statements are no-ops if the grants are already in place — but
-- they make the access policy explicit and self-documenting.)
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.create_clinical_note(uuid, text, text, integer, timestamp with time zone, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_booking_clinical_note(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_privacy_policy_html(uuid) TO authenticated;