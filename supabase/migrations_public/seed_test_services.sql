-- ============================================================
-- DATOS DE PRUEBA: Servicios para el slug "caibs"
-- Ejecutar en: Dashboard -> SQL Editor del proyecto PÚBLICO (lsntpezzhinnohggezxy)
-- ============================================================

INSERT INTO public.booking_types_public (id, company_slug, name, duration_minutes, price, currency, description, professional_names, available_days, slot_start, slot_end, slot_interval_minutes, active)
VALUES 
  (
    gen_random_uuid(),
    'caibs',
    'Consulta General',
    30,
    25.00,
    'EUR',
    'Consulta general de asesoramiento',
    '["Ana García", "Carlos López"]'::jsonb,
    '{1,2,3,4,5}',
    '09:00',
    '18:00',
    30,
    true
  ),
  (
    gen_random_uuid(),
    'caibs',
    'Revisión Completa',
    60,
    45.00,
    'EUR',
    'Revisión completa con informe detallado',
    '["Ana García"]'::jsonb,
    '{1,2,3,4,5}',
    '09:00',
    '14:00',
    60,
    true
  ),
  (
    gen_random_uuid(),
    'caibs',
    'Sesión Express',
    15,
    15.00,
    'EUR',
    'Consulta rápida para temas puntuales',
    '["Carlos López", "María Ruiz"]'::jsonb,
    '{1,2,3,4,5,6}',
    '10:00',
    '20:00',
    15,
    true
  );
