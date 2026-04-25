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
  v_tkt_002 uuid;
  v_user_id uuid;
  v_role_id uuid;
BEGIN
  -- 1. COMPANY
  INSERT INTO companies (name, slug, subscription_tier, max_users, is_active, company_type, dpa_status, created_at, updated_at)
  VALUES ('Clinica Dental Sonrisa Perfecta', 'sonrisa-perfecta', 'pro', 10, true, 'autonomo', 'not_required', NOW(), NOW())
  RETURNING id INTO v_company_id;

  -- 2. PROFESIONALES
  INSERT INTO professionals (user_id, company_id, display_name, title, email, is_active, color, created_at, updated_at)
  VALUES (NULL, v_company_id, 'Dra. Ana Martinez', 'Ortodoncia', 'ana.martinez@sonrisa.com', true, '#3B82F6', NOW(), NOW())
  RETURNING id INTO v_prof_001;

  INSERT INTO professionals (user_id, company_id, display_name, title, email, is_active, color, created_at, updated_at)
  VALUES (NULL, v_company_id, 'Dr. Carlos Lopez', 'Implantes', 'carlos.lopez@sonrisa.com', true, '#10B981', NOW(), NOW())
  RETURNING id INTO v_prof_002;

  INSERT INTO professionals (user_id, company_id, display_name, title, email, is_active, color, created_at, updated_at)
  VALUES (NULL, v_company_id, 'Dra. Maria Garcia', 'Endodoncia', 'maria.garcia@sonrisa.com', true, '#8B5CF6', NOW(), NOW())
  RETURNING id INTO v_prof_003;

  INSERT INTO professionals (user_id, company_id, display_name, title, email, is_active, color, created_at, updated_at)
  VALUES (NULL, v_company_id, 'Srta. Paula Torres', 'Profilaxis', 'paula.torres@sonrisa.com', true, '#F59E0B', NOW(), NOW())
  RETURNING id INTO v_prof_004;

  -- 3. USUARIO DE LOGIN
  SELECT id INTO v_role_id FROM app_roles WHERE name = 'owner' LIMIT 1;

  INSERT INTO users (id, company_id, email, name, auth_user_id, permissions, active, created_at, updated_at)
  VALUES (
    gen_random_uuid(),
    v_company_id,
    'dra.ana.martinez@sonrisa.com',
    'Dra. Ana Martinez',
    NULL,
    '{"moduloClientes":true,"moduloReservas":true,"moduloTickets":true,"moduloServicios":true,"moduloFacturas":true,"moduloPresupuestos":true,"moduloLeads":true,"moduloDashboard":true}'::jsonb,
    true,
    NOW(),
    NOW()
  )
  RETURNING id INTO v_user_id;

  INSERT INTO company_members (user_id, company_id, role_id, status, created_at, updated_at)
  VALUES (v_user_id, v_company_id, v_role_id, 'active', NOW(), NOW());

  UPDATE professionals SET user_id = v_user_id WHERE id = v_prof_001;

  -- 4. SERVICIOS
  INSERT INTO services (company_id, name, description, category, estimated_hours, base_price, is_active, tax_rate, duration_minutes, is_bookable, booking_color, created_at, updated_at)
  VALUES (v_company_id, 'Limpieza Dental', 'Limpieza y profilaxis dental completa', 'clinical', 1, 2500.00, true, 21.0, 45, true, '#10B981', NOW(), NOW())
  RETURNING id INTO v_srv_001;

  INSERT INTO services (company_id, name, description, category, estimated_hours, base_price, is_active, tax_rate, duration_minutes, is_bookable, booking_color, created_at, updated_at)
  VALUES (v_company_id, 'Ortodoncia Consulta Inicial', 'Evaluacion y plan de tratamiento de ortodoncia', 'clinical', 1, 5000.00, true, 21.0, 60, true, '#3B82F6', NOW(), NOW())
  RETURNING id INTO v_srv_002;

  INSERT INTO services (company_id, name, description, category, estimated_hours, base_price, is_active, tax_rate, duration_minutes, is_bookable, booking_color, created_at, updated_at)
  VALUES (v_company_id, 'Implante Dental', 'Colocacion de implante dental', 'clinical', 2, 45000.00, true, 21.0, 120, true, '#EF4444', NOW(), NOW())
  RETURNING id INTO v_srv_003;

  INSERT INTO services (company_id, name, description, category, estimated_hours, base_price, is_active, tax_rate, duration_minutes, is_bookable, booking_color, created_at, updated_at)
  VALUES (v_company_id, 'Endodoncia', 'Tratamiento de conducto', 'clinical', 2, 18000.00, true, 21.0, 90, true, '#8B5CF6', NOW(), NOW())
  RETURNING id INTO v_srv_004;

  INSERT INTO services (company_id, name, description, category, estimated_hours, base_price, is_active, tax_rate, duration_minutes, is_bookable, booking_color, created_at, updated_at)
  VALUES (v_company_id, 'Blanqueamiento', 'Blanqueamiento dental profesional', 'clinical', 1, 12000.00, true, 21.0, 60, true, '#F59E0B', NOW(), NOW())
  RETURNING id INTO v_srv_005;

  INSERT INTO services (company_id, name, description, category, estimated_hours, base_price, is_active, tax_rate, duration_minutes, is_bookable, booking_color, created_at, updated_at)
  VALUES (v_company_id, 'Consulta General', 'Revision y diagnostico general', 'clinical', 1, 1500.00, true, 21.0, 30, true, '#6366F1', NOW(), NOW())
  RETURNING id INTO v_srv_006;

  -- 5. CLIENTES
  INSERT INTO clients (company_id, name, email, phone, source, status, is_active, billing_email, created_at, updated_at)
  VALUES (v_company_id, 'Juan Perez', 'juan.perez@gmail.com', '+54 11 5555-2001', 'google', 'active', true, 'juan.perez@gmail.com', NOW(), NOW())
  RETURNING id INTO v_cli_001;

  INSERT INTO clients (company_id, name, email, phone, source, status, is_active, billing_email, created_at, updated_at)
  VALUES (v_company_id, 'Maria Rodriguez', 'maria.rodriguez@yahoo.com', '+54 11 5555-2002', 'referral', 'active', true, 'maria.rodriguez@yahoo.com', NOW(), NOW())
  RETURNING id INTO v_cli_002;

  INSERT INTO clients (company_id, name, email, phone, source, status, is_active, billing_email, created_at, updated_at)
  VALUES (v_company_id, 'Carlos Gonzalez', 'cgonzalez@hotmail.com', '+54 11 5555-2003', 'google', 'inactive', true, 'cgonzalez@hotmail.com', NOW(), NOW())
  RETURNING id INTO v_cli_003;

  INSERT INTO clients (company_id, name, email, phone, source, status, is_active, billing_email, created_at, updated_at)
  VALUES (v_company_id, 'Ana Fernandez', 'ana.fernandez@outlook.com', '+54 11 5555-2004', 'instagram', 'active', true, 'ana.fernandez@outlook.com', NOW(), NOW())
  RETURNING id INTO v_cli_004;

  INSERT INTO clients (company_id, name, email, phone, source, status, is_active, billing_email, created_at, updated_at)
  VALUES (v_company_id, 'Pedro Sanchez', 'pedro.sanchez@gmail.com', '+54 11 5555-2005', 'google', 'active', true, 'pedro.sanchez@gmail.com', NOW(), NOW())
  RETURNING id INTO v_cli_005;

  INSERT INTO clients (company_id, name, email, phone, source, status, is_active, billing_email, created_at, updated_at)
  VALUES (v_company_id, 'Lucia Martinez', 'lucia.martinez@gmail.com', '+54 11 5555-2006', 'referral', 'active', true, 'lucia.martinez@gmail.com', NOW(), NOW())
  RETURNING id INTO v_cli_006;

  INSERT INTO clients (company_id, name, email, phone, source, status, is_active, billing_email, created_at, updated_at)
  VALUES (v_company_id, 'Jorge Diaz', 'jorge.diaz@outlook.com', '+54 11 5555-2007', 'google', 'active', true, 'jorge.diaz@outlook.com', NOW(), NOW())
  RETURNING id INTO v_cli_007;

  INSERT INTO clients (company_id, name, email, phone, source, status, is_active, billing_email, created_at, updated_at)
  VALUES (v_company_id, 'Sofia Lopez', 'sofia.lopez@yahoo.com', '+54 11 5555-2008', 'instagram', 'lead', true, 'sofia.lopez@yahoo.com', NOW(), NOW())
  RETURNING id INTO v_cli_008;

  -- 6. BOOKINGS
  INSERT INTO bookings (company_id, client_id, professional_id, service_id, booking_type, status,
                       customer_name, customer_email, customer_phone,
                       start_time, end_time, notes, total_price, currency, session_type,
                       source, payment_status, created_at, updated_at)
  VALUES
    (v_company_id, v_cli_001, v_prof_004, v_srv_001, 'appointment', 'confirmed',
     'Juan Perez', 'juan.perez@gmail.com', '+54 11 5555-2001',
     (CURRENT_DATE + INTERVAL '3 days') + TIME '10:00', (CURRENT_DATE + INTERVAL '3 days') + TIME '10:45',
     'Primera limpieza del ano', 2500.00, 'ARS', 'presencial', 'internal', 'pending', NOW(), NOW()),

    (v_company_id, v_cli_002, v_prof_001, v_srv_002, 'appointment', 'confirmed',
     'Maria Rodriguez', 'maria.rodriguez@yahoo.com', '+54 11 5555-2002',
     (CURRENT_DATE + INTERVAL '1 day') + TIME '14:30', (CURRENT_DATE + INTERVAL '1 day') + TIME '15:30',
     'Consulta inicial ortodoncia', 5000.00, 'ARS', 'presencial', 'internal', 'pending', NOW(), NOW()),

    (v_company_id, v_cli_003, v_prof_003, v_srv_004, 'appointment', 'pending',
     'Carlos Gonzalez', 'cgonzalez@hotmail.com', '+54 11 5555-2003',
     CURRENT_DATE + TIME '09:00', CURRENT_DATE + TIME '10:30',
     'Tratamiento de conducto molar', 18000.00, 'ARS', 'presencial', 'internal', 'pending', NOW(), NOW()),

    (v_company_id, v_cli_004, v_prof_002, v_srv_003, 'appointment', 'confirmed',
     'Ana Fernandez', 'ana.fernandez@outlook.com', '+54 11 5555-2004',
     (CURRENT_DATE - INTERVAL '7 days') + TIME '11:00', (CURRENT_DATE - INTERVAL '7 days') + TIME '13:00',
     'Implante pieza 14', 45000.00, 'ARS', 'presencial', 'internal', 'paid', NOW(), NOW()),

    (v_company_id, v_cli_005, v_prof_004, v_srv_005, 'appointment', 'cancelled',
     'Pedro Sanchez', 'pedro.sanchez@gmail.com', '+54 11 5555-2005',
     (CURRENT_DATE - INTERVAL '3 days') + TIME '15:00', (CURRENT_DATE - INTERVAL '3 days') + TIME '16:00',
     'Blanqueamiento - cancelo', 12000.00, 'ARS', 'presencial', 'internal', 'refunded', NOW(), NOW()),

    (v_company_id, v_cli_006, v_prof_001, v_srv_006, 'appointment', 'cancelled',
     'Lucia Martinez', 'lucia.martinez@gmail.com', '+54 11 5555-2006',
     (CURRENT_DATE - INTERVAL '2 days') + TIME '16:00', (CURRENT_DATE - INTERVAL '2 days') + TIME '16:30',
     'Consulta general - no asistio', 1500.00, 'ARS', 'presencial', 'internal', 'pending', NOW(), NOW()),

    (v_company_id, v_cli_007, v_prof_003, v_srv_004, 'appointment', 'confirmed',
     'Jorge Diaz', 'jorge.diaz@outlook.com', '+54 11 5555-2007',
     (CURRENT_DATE + INTERVAL '10 days') + TIME '08:30', (CURRENT_DATE + INTERVAL '10 days') + TIME '10:00',
     'Endodoncia segunda sesion', 18000.00, 'ARS', 'presencial', 'internal', 'pending', NOW(), NOW());

  -- 7. TICKETS
  INSERT INTO tickets (company_id, client_id, title, description, priority, status, ticket_type,
                       assigned_to, created_by, created_at, updated_at)
  VALUES
    (v_company_id, v_cli_001, 'Solicita turno de revision',
     'El paciente solicita turno de revision trimestral.',
     'medium', 'open', 'appointment_request',
     v_user_id, v_user_id, NOW(), NOW()),

    (v_company_id, v_cli_002, 'Reclamo por demora en atencion',
     'El paciente espero 40 minutos para su turno del 15/03.',
     'high', 'in_progress', 'complaint',
     v_user_id, v_user_id, NOW() - INTERVAL '1 day', NOW())
  RETURNING id INTO v_tkt_002;

  INSERT INTO tickets (company_id, client_id, title, description, priority, status, ticket_type,
                       assigned_to, created_by, created_at, updated_at)
  VALUES
    (v_company_id, v_cli_003, 'No puede asistir',
     'El paciente informo que no puede asistir a su turno.',
     'low', 'resolved', 'rescheduling',
     v_user_id, v_user_id, NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day'),

    (v_company_id, v_cli_004, 'Consulta sobre blanqueamiento',
     'El paciente consulta sobre mantenimiento del blanqueamiento.',
     'low', 'closed', 'information',
     v_user_id, v_user_id, NOW() - INTERVAL '5 days', NOW() - INTERVAL '3 days'),

    (v_company_id, v_cli_005, 'Dolor postoperatorio implantes',
     'Paciente reporta dolor intenso 3 dias despues de la cirugia.',
     'urgent', 'open', 'emergency',
     v_user_id, v_user_id, NOW(), NOW());

  -- Ticket comments
  INSERT INTO ticket_comments (ticket_id, author_id, author_type, content, created_at)
  VALUES
    (v_tkt_002, v_user_id, 'professional',
     'Me comunique con el paciente. Ofrecimos un vale de descuento del 20% en su proximo tratamiento.',
     NOW() - INTERVAL '12 hours'),
    (v_tkt_002, v_cli_002, 'client',
     'Agradezco la atencion, pero quiero que conste en mi historial.',
     NOW() - INTERVAL '6 hours');

  -- 8. LEADS
  INSERT INTO leads (company_id, source, status, first_name, last_name, email, phone, interest, assigned_to, created_at, updated_at)
  VALUES
    (v_company_id, 'google', 'new', 'Roberto', 'Fernandez', 'roberto.fernandez@gmail.com', '+54 11 5555-9001', 'Consulta Implante', v_prof_001, NOW(), NOW()),
    (v_company_id, 'instagram', 'contacted', 'Claudia', 'Ramirez', 'claudia.ramirez@outlook.com', '+54 11 5555-9002', 'Ortodoncia', v_prof_002, NOW() - INTERVAL '2 days', NOW()),
    (v_company_id, 'referral', 'qualified', 'Fernando', 'Vega', 'fernando.vega@yahoo.com', '+54 11 5555-9003', 'Blanqueamiento', v_prof_001, NOW() - INTERVAL '7 days', NOW() - INTERVAL '3 days');

  -- 9. CLIENT NOTES
  INSERT INTO client_notes (client_id, author_id, author_type, content, created_at)
  VALUES
    (v_cli_001, v_prof_004, 'professional', 'Paciente muy nervioso con las limpiezas. Usar anestetico topico.', NOW() - INTERVAL '30 days'),
    (v_cli_002, v_prof_001, 'professional', 'Paciente con historial de ortodoncia. Trajo estudios previos.', NOW() - INTERVAL '15 days'),
    (v_cli_004, v_prof_002, 'professional', 'Implante exitoso. Programar control en 6 meses.', NOW() - INTERVAL '7 days');

END $$;