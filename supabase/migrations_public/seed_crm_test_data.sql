-- ============================================================
-- SEED DATA: CRM de prueba completo
-- Schema real detectado del CRM
-- ============================================================

BEGIN;

-- ============================================================
-- 1. COMPANY DE PRUEBA
-- ============================================================
INSERT INTO companies (id, name, slug, subscription_tier, max_users, is_active, company_type, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'Clínica Dental Sonrisa Perfecta',
  'sonrisa-perfecta',
  'pro',
  10,
  true,
  'healthcare',
  NOW(),
  NOW()
) ON CONFLICT DO NOTHING;

-- Guardar el company_id para usarlo después
DO $$
DECLARE
  v_company_id uuid;
  v_prof_001 uuid;
  v_prof_002 uuid;
  v_prof_003 uuid;
  v_prof_004 uuid;
  v_srv_001 uuid;
  v_srv_002 uuid;
  v_srv_003 uuid;
  v_srv_004 uuid;
  v_srv_005 uuid;
  v_srv_006 uuid;
  v_cli_001 uuid;
  v_cli_002 uuid;
  v_cli_003 uuid;
  v_cli_004 uuid;
  v_cli_005 uuid;
  v_cli_006 uuid;
  v_cli_007 uuid;
  v_cli_008 uuid;
BEGIN
  SELECT id INTO v_company_id FROM companies WHERE slug = 'sonrisa-perfecta' LIMIT 1;

  -- ============================================================
  -- 2. PROFESIONALES
  -- ============================================================
  INSERT INTO professionals (id, user_id, company_id, display_name, title, email, is_active, color, created_at, updated_at)
  VALUES
    (gen_random_uuid(), NULL, v_company_id, 'Dra. Ana Martínez', 'Ortodoncia', 'ana.martinez@sonrisa.com', true, '#3B82F6', NOW(), NOW()),
    (gen_random_uuid(), NULL, v_company_id, 'Dr. Carlos López', 'Implantes', 'carlos.lopez@sonrisa.com', true, '#10B981', NOW(), NOW()),
    (gen_random_uuid(), NULL, v_company_id, 'Dra. María García', 'Endodoncia', 'maria.garcia@sonrisa.com', true, '#8B5CF6', NOW(), NOW()),
    (gen_random_uuid(), NULL, v_company_id, 'Srta. Paula Torres', 'Profilaxis', 'paula.torres@sonrisa.com', true, '#F59E0B', NOW(), NOW())
  RETURNING id INTO v_prof_001;

  SELECT id INTO v_prof_001 FROM professionals WHERE email = 'ana.martinez@sonrisa.com' AND company_id = v_company_id LIMIT 1;
  SELECT id INTO v_prof_002 FROM professionals WHERE email = 'carlos.lopez@sonrisa.com' AND company_id = v_company_id LIMIT 1;
  SELECT id INTO v_prof_003 FROM professionals WHERE email = 'maria.garcia@sonrisa.com' AND company_id = v_company_id LIMIT 1;
  SELECT id INTO v_prof_004 FROM professionals WHERE email = 'paula.torres@sonrisa.com' AND company_id = v_company_id LIMIT 1;

  -- ============================================================
  -- 3. SERVICIOS
  -- ============================================================
  INSERT INTO services (id, company_id, name, description, category, estimated_hours, base_price, is_active, tax_rate, duration_minutes, is_bookable, booking_color, created_at, updated_at)
  VALUES
    (gen_random_uuid(), v_company_id, 'Limpieza Dental', 'Limpieza y profilaxis dental completa', 'clinical', 1, 2500.00, true, 21.0, 45, true, '#10B981', NOW(), NOW()),
    (gen_random_uuid(), v_company_id, 'Ortodoncia - Consulta Inicial', 'Evaluación y plan de tratamiento de ortodoncia', 'clinical', 1, 5000.00, true, 21.0, 60, true, '#3B82F6', NOW(), NOW()),
    (gen_random_uuid(), v_company_id, 'Implante Dental', 'Colocación de implante dental', 'clinical', 2, 45000.00, true, 21.0, 120, true, '#EF4444', NOW(), NOW()),
    (gen_random_uuid(), v_company_id, 'Endodoncia', 'Tratamiento de conducto', 'clinical', 2, 18000.00, true, 21.0, 90, true, '#8B5CF6', NOW(), NOW()),
    (gen_random_uuid(), v_company_id, 'Blanqueamiento', 'Blanqueamiento dental profesional', 'clinical', 1, 12000.00, true, 21.0, 60, true, '#F59E0B', NOW(), NOW()),
    (gen_random_uuid(), v_company_id, 'Consulta General', 'Revisión y diagnóstico general', 'clinical', 1, 1500.00, true, 21.0, 30, true, '#6366F1', NOW(), NOW())
  RETURNING id INTO v_srv_001;

  SELECT id INTO v_srv_001 FROM services WHERE name = 'Limpieza Dental' AND company_id = v_company_id LIMIT 1;
  SELECT id INTO v_srv_002 FROM services WHERE name = 'Ortodoncia - Consulta Inicial' AND company_id = v_company_id LIMIT 1;
  SELECT id INTO v_srv_003 FROM services WHERE name = 'Implante Dental' AND company_id = v_company_id LIMIT 1;
  SELECT id INTO v_srv_004 FROM services WHERE name = 'Endodoncia' AND company_id = v_company_id LIMIT 1;
  SELECT id INTO v_srv_005 FROM services WHERE name = 'Blanqueamiento' AND company_id = v_company_id LIMIT 1;
  SELECT id INTO v_srv_006 FROM services WHERE name = 'Consulta General' AND company_id = v_company_id LIMIT 1;

  -- ============================================================
  -- 4. CLIENTES
  -- ============================================================
  INSERT INTO clients (id, company_id, first_name, last_name, email, phone, city, source, status, is_active, billing_email, created_at, updated_at)
  VALUES
    (gen_random_uuid(), v_company_id, 'Juan', 'Pérez', 'juan.perez@gmail.com', '+54 11 5555-2001', 'Capital Federal', 'google', 'active', true, 'juan.perez@gmail.com', NOW(), NOW()),
    (gen_random_uuid(), v_company_id, 'María', 'Rodríguez', 'maria.rodriguez@yahoo.com', '+54 11 5555-2002', 'Vicente López', 'referral', 'active', true, 'maria.rodriguez@yahoo.com', NOW(), NOW()),
    (gen_random_uuid(), v_company_id, 'Carlos', 'González', 'cgonzalez@hotmail.com', '+54 11 5555-2003', 'San Isidro', 'google', 'inactive', true, 'cgonzalez@hotmail.com', NOW(), NOW()),
    (gen_random_uuid(), v_company_id, 'Ana', 'Fernández', 'ana.fernandez@outlook.com', '+54 11 5555-2004', 'Tigre', 'instagram', 'active', true, 'ana.fernandez@outlook.com', NOW(), NOW()),
    (gen_random_uuid(), v_company_id, 'Pedro', 'Sánchez', 'pedro.sanchez@gmail.com', '+54 11 5555-2005', 'Quilmes', 'google', 'active', true, 'pedro.sanchez@gmail.com', NOW(), NOW()),
    (gen_random_uuid(), v_company_id, 'Lucía', 'Martínez', 'lucia.martinez@gmail.com', '+54 11 5555-2006', 'Avellaneda', 'referral', 'active', true, 'lucia.martinez@gmail.com', NOW(), NOW()),
    (gen_random_uuid(), v_company_id, 'Jorge', 'Díaz', 'jorge.diaz@outlook.com', '+54 11 5555-2007', 'Lomas de Zamora', 'google', 'active', true, 'jorge.diaz@outlook.com', NOW(), NOW()),
    (gen_random_uuid(), v_company_id, 'Sofía', 'López', 'sofia.lopez@yahoo.com', '+54 11 5555-2008', 'Berazategui', 'instagram', 'lead', true, 'sofia.lopez@yahoo.com', NOW(), NOW())
  RETURNING id INTO v_cli_001;

  SELECT id INTO v_cli_001 FROM clients WHERE email = 'juan.perez@gmail.com' AND company_id = v_company_id LIMIT 1;
  SELECT id INTO v_cli_002 FROM clients WHERE email = 'maria.rodriguez@yahoo.com' AND company_id = v_company_id LIMIT 1;
  SELECT id INTO v_cli_003 FROM clients WHERE email = 'cgonzalez@hotmail.com' AND company_id = v_company_id LIMIT 1;
  SELECT id INTO v_cli_004 FROM clients WHERE email = 'ana.fernandez@outlook.com' AND company_id = v_company_id LIMIT 1;
  SELECT id INTO v_cli_005 FROM clients WHERE email = 'pedro.sanchez@gmail.com' AND company_id = v_company_id LIMIT 1;
  SELECT id INTO v_cli_006 FROM clients WHERE email = 'lucia.martinez@gmail.com' AND company_id = v_company_id LIMIT 1;
  SELECT id INTO v_cli_007 FROM clients WHERE email = 'jorge.diaz@outlook.com' AND company_id = v_company_id LIMIT 1;
  SELECT id INTO v_cli_008 FROM clients WHERE email = 'sofia.lopez@yahoo.com' AND company_id = v_company_id LIMIT 1;

  -- ============================================================
  -- 5. BOOKINGS (Reservas)
  -- ============================================================
  INSERT INTO bookings (id, company_id, client_id, professional_id, service_id, booking_type, status,
                        start_time, end_time, notes, total_price, currency, created_at, updated_at)
  VALUES
    -- Reserva confirmada futura (3 días adelante, 10:00)
    (gen_random_uuid(), v_company_id, v_cli_001, v_prof_004, v_srv_001, 'appointment', 'confirmed',
     (CURRENT_DATE + INTERVAL '3 days') + TIME '10:00', (CURRENT_DATE + INTERVAL '3 days') + TIME '10:45',
     'Primera limpieza del año', 2500.00, 'ARS', NOW(), NOW()),

    -- Reserva confirmada próxima (mañana 14:30)
    (gen_random_uuid(), v_company_id, v_cli_002, v_prof_001, v_srv_002, 'appointment', 'confirmed',
     (CURRENT_DATE + INTERVAL '1 day') + TIME '14:30', (CURRENT_DATE + INTERVAL '1 day') + TIME '15:30',
     'Consulta inicial ortodoncia', 5000.00, 'ARS', NOW(), NOW()),

    -- Reserva en curso (hoy, 09:00)
    (gen_random_uuid(), v_company_id, v_cli_003, v_prof_003, v_srv_004, 'appointment', 'in_progress',
     CURRENT_DATE + TIME '09:00', CURRENT_DATE + TIME '10:30',
     'Tratamiento de conducto molar', 18000.00, 'ARS', NOW(), NOW()),

    -- Reserva completada (hace 7 días)
    (gen_random_uuid(), v_company_id, v_cli_004, v_prof_002, v_srv_003, 'appointment', 'completed',
     (CURRENT_DATE - INTERVAL '7 days') + TIME '11:00', (CURRENT_DATE - INTERVAL '7 days') + TIME '13:00',
     'Implante pieza 14', 45000.00, 'ARS', NOW(), NOW()),

    -- Reserva cancelada (hace 3 días)
    (gen_random_uuid(), v_company_id, v_cli_005, v_prof_004, v_srv_005, 'appointment', 'cancelled',
     (CURRENT_DATE - INTERVAL '3 days') + TIME '15:00', (CURRENT_DATE - INTERVAL '3 days') + TIME '16:00',
     'Blanqueamiento - canceló por viaje', 12000.00, 'ARS', NOW(), NOW()),

    -- Reserva no asistida (hace 2 días)
    (gen_random_uuid(), v_company_id, v_cli_006, v_prof_001, v_srv_006, 'appointment', 'no_show',
     (CURRENT_DATE - INTERVAL '2 days') + TIME '16:00', (CURRENT_DATE - INTERVAL '2 days') + TIME '16:30',
     'Consulta general', 1500.00, 'ARS', NOW(), NOW()),

    -- Reserva confirmada lejana (10 días adelante)
    (gen_random_uuid(), v_company_id, v_cli_007, v_prof_003, v_srv_004, 'appointment', 'confirmed',
     (CURRENT_DATE + INTERVAL '10 days') + TIME '08:30', (CURRENT_DATE + INTERVAL '10 days') + TIME '10:00',
     'Endodoncia segunda sesión', 18000.00, 'ARS', NOW(), NOW());

  -- ============================================================
  -- 6. TICKETS
  -- ============================================================
  INSERT INTO tickets (id, company_id, client_id, title, description, priority, status, ticket_type,
                       assigned_to, created_by, created_at, updated_at)
  VALUES
    -- Ticket abierto
    (gen_random_uuid(), v_company_id, v_cli_001, 'Solicita turno de revisión',
     'El paciente solicita turno de revisión trimestral. Preferencia de horarios de mañana.',
     'medium', 'open', 'appointment_request',
     v_prof_001, v_cli_001, NOW(), NOW()),

    -- Ticket en progreso (urgent/high priority)
    (gen_random_uuid(), v_company_id, v_cli_002, 'Reclamo por demora en atención',
     'El paciente esperó 40 minutos para su turno del 15/03. Quiere una explicación.',
     'high', 'in_progress', 'complaint',
     v_prof_002, v_cli_002, NOW() - INTERVAL '1 day', NOW()),

    -- Ticket resuelto
    (gen_random_uuid(), v_company_id, v_cli_003, 'No puede asistir mañana',
     'El paciente llamó para informar que no puede asistir a su turno de endodoncia.',
     'low', 'resolved', 'rescheduling',
     v_prof_003, v_cli_003, NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day'),

    -- Ticket cerrado
    (gen_random_uuid(), v_company_id, v_cli_004, 'Consulta sobre blanqueamiento',
     'El paciente consulta sobre mantención del blanqueamiento realizado.',
     'low', 'closed', 'information',
     v_prof_004, v_cli_004, NOW() - INTERVAL '5 days', NOW() - INTERVAL '3 days'),

    -- Ticket urgente/emergency
    (gen_random_uuid(), v_company_id, v_cli_005, 'Dolor postoperatorio implantes',
     'Paciente reporta dolor intenso 3 días después de la cirugía de implantes.',
     'urgent', 'open', 'emergency',
     v_prof_002, v_cli_005, NOW(), NOW());

  -- Ticket comments
  INSERT INTO ticket_comments (id, ticket_id, author_id, author_type, content, created_at)
  SELECT
    gen_random_uuid(),
    t.id,
    v_prof_002,
    'professional',
    'Me comuniqué con el paciente. Ofrecimos un vale de descuento del 20% en su próximo tratamiento.',
    NOW() - INTERVAL '12 hours'
  FROM tickets t WHERE t.title = 'Reclamo por demora en atención';

  INSERT INTO ticket_comments (id, ticket_id, author_id, author_type, content, created_at)
  SELECT
    gen_random_uuid(),
    t.id,
    v_cli_002,
    'client',
    'Agradezco la atención, pero quiero que conste en mi historial que esto ocurrió.',
    NOW() - INTERVAL '6 hours'
  FROM tickets t WHERE t.title = 'Reclamo por demora en atención';

  -- ============================================================
  -- 7. LEADS
  -- ============================================================
  INSERT INTO leads (id, company_id, source, status, first_name, last_name, email, phone, interest,
                     assigned_to, created_at, updated_at)
  VALUES
    (gen_random_uuid(), v_company_id, 'google'::user_defined_source, 'new'::lead_status,
     'Roberto', 'Fernández', 'roberto.fernandez@gmail.com', '+54 11 5555-9001', 'ConsultaImplante',
     v_prof_001, NOW(), NOW()),

    (gen_random_uuid(), v_company_id, 'instagram'::user_defined_source, 'contacted'::lead_status,
     'Claudia', 'Ramírez', 'claudia.ramirez@outlook.com', '+54 11 5555-9002', 'Ortodoncia',
     v_prof_002, NOW() - INTERVAL '2 days', NOW()),

    (gen_random_uuid(), v_company_id, 'referral'::user_defined_source, 'qualified'::lead_status,
     'Fernando', 'Vega', 'fernando.vega@yahoo.com', '+54 11 5555-9003', 'Blanqueamiento',
     v_prof_001, NOW() - INTERVAL '7 days', NOW() - INTERVAL '3 days');

  -- ============================================================
  -- 8. CLIENT NOTES
  -- ============================================================
  INSERT INTO client_notes (id, client_id, author_id, author_type, content, created_at)
  VALUES
    (gen_random_uuid(), v_cli_001, v_prof_004, 'professional',
     'Paciente muy nervioso con las limpiezas. Usar anestésico tópico.',
     NOW() - INTERVAL '30 days'),
    (gen_random_uuid(), v_cli_002, v_prof_001, 'professional',
     'Paciente con historial de ortodoncia. Trajo estudios previos.',
     NOW() - INTERVAL '15 days'),
    (gen_random_uuid(), v_cli_004, v_prof_002, 'professional',
     'Implante exitoso. Programar control en 6 meses.',
     NOW() - INTERVAL '7 days');

  RAISE NOTICE 'Seed data creado exitosamente para Clínica Dental Sonrisa Perfecta';

END $$;

COMMIT;
