-- Migration: Seed initial docs_categories
-- Description: Inserts the 8 root categories for the /docs system:
--   1 transversal "Primeros pasos" (sort_order=0, shown first)
--   6 core product modules (Clientes, Agenda, Reservas, Presupuestos, Facturas, Calendario)
--   1 transversal "Mi cuenta y permisos"
-- Idempotent: uses ON CONFLICT (slug) DO NOTHING so re-running the migration
-- is safe. To re-seed (e.g. renaming a category), drop+re-insert manually.
--
-- Author: Roberto (Simplifica)

BEGIN;

-- 1. Transversal — must sort first
INSERT INTO public.docs_categories (slug, name, description, icon, sort_order)
VALUES
  ('primeros-pasos', 'Primeros pasos',
   'Empieza por aquí: crea tu cuenta, configura tu empresa y da de alta a tu equipo.',
   'rocket', 0),
  ('clientes', 'Clientes',
   'Gestiona tu base de datos de clientes: alta, importación, fichas y segmentación.',
   'people-fill', 10),
  ('agenda', 'Agenda',
   'Tu agenda personal y la de tu equipo. Eventos, citas y disponibilidad horaria.',
   'calendar-event', 20),
  ('reservas', 'Reservas',
   'Reservas online que hacen tus clientes desde tu página pública.',
   'calendar-check', 30),
  ('presupuestos', 'Presupuestos',
   'Crea presupuestos profesionales, envíalos y conviértelos en facturas.',
   'file-earmark-text', 40),
  ('facturas', 'Facturas',
   'Emisión de facturas, cobros, vencimientos y series de facturación.',
   'receipt', 50),
  ('calendario', 'Calendario',
   'Vista global de citas, eventos y reservas de todo tu equipo.',
   'calendar3', 60),
  ('cuenta', 'Mi cuenta y permisos',
   'Tu perfil, contraseña, autenticación en dos pasos y roles del equipo.',
   'person-gear', 70)
ON CONFLICT (slug) DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';
