-- Migration: email_sample_fixtures helper table
--
-- Locks the preview-vs-send contract by mirroring the sample-data +
-- expected-substrings matrix from `supabase/email-samples.json` into a
-- SQL-readable table. Consumed by:
--   - `supabase/tests/snapshot_email_render.sql` — asserts that
--     `email_render_template(...)` produces HTML matching every
--     expected_substring for every type.
--   - Any future TS snapshot test that wants to assert against the
--     SQL renderer without re-parsing the JSON file at runtime.
--
-- Source of truth: `supabase/email-samples.json` (committed). This
-- table is a denormalization for SQL access; if the JSON changes, this
-- migration must be re-run (or a follow-up migration must UPDATE the
-- rows). The seed INSERTs below match the JSON entries as of 2026-07-06.
--
-- Type count is 26 (25 in EF EMAIL_TYPES + invite_marketer handled in
-- the switch but missing from EMAIL_TYPES — see
-- sdd/email-customization-faithful-preview/apply-progress).

BEGIN;

DROP TABLE IF EXISTS public.email_sample_fixtures;

CREATE TABLE public.email_sample_fixtures (
  email_type          text PRIMARY KEY,
  sample_data         jsonb NOT NULL,
  expected_substrings text[] NOT NULL,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.email_sample_fixtures IS
  'Mirror of supabase/email-samples.json. Each row pins one email type '
  'to a representative sample_data payload and the substrings that MUST '
  'appear in the rendered HTML. Used by supabase/tests/snapshot_email_render.sql.';

-- Seed: 26 rows from email-samples.json. Keep aligned with that file.
INSERT INTO public.email_sample_fixtures (email_type, sample_data, expected_substrings) VALUES
  ('booking_confirmation',
   '{"servicio":"Fisioterapia deportiva","fecha":"2026-07-10","hora":"16:30","empresa":"Clínica Norte"}'::jsonb,
   ARRAY['Reserva confirmada','Fisioterapia deportiva','2026-07-10','16:30','política de privacidad','Darse de baja']),
  ('invoice',
   '{"numero_factura":"F-2026-0042","invoice_url":"https://app.simplificacrm.es/invoices/abc123"}'::jsonb,
   ARRAY['Factura F-2026-0042','Ver factura PDF','https://app.simplificacrm.es/invoices/abc123','política de privacidad']),
  ('quote',
   '{"numero_presupuesto":"P-2026-0017","quote_url":"https://app.simplificacrm.es/quotes/xyz789"}'::jsonb,
   ARRAY['Presupuesto P-2026-0017','Ver presupuesto','https://app.simplificacrm.es/quotes/xyz789','política de privacidad']),
  ('consent',
   '{"consent_url":"https://app.simplificacrm.es/consent/tk-9"}'::jsonb,
   ARRAY['Solicitud de consentimiento RGPD','Revisar y validar datos','https://app.simplificacrm.es/consent/tk-9','política de privacidad']),
  ('invite',
   '{"invite_url":"https://app.simplificacrm.es/invite/abc","inviter_name":"Roberto","invited_name":"Ada"}'::jsonb,
   ARRAY['Te han invitado a','Roberto','https://app.simplificacrm.es/invite/abc','política de privacidad']),
  ('invite_owner',
   '{"invite_url":"https://app.simplificacrm.es/invite/owner-1","inviter_name":"Roberto","invited_name":"Ada Lovelace","message":"Bienvenida al equipo"}'::jsonb,
   ARRAY['Invitación para crear tu empresa','Aceptar e introducir datos de empresa','Roberto','Bienvenida al equipo','política de privacidad']),
  ('invite_admin',
   '{"invite_url":"https://app.simplificacrm.es/invite/admin-1","inviter_name":"Roberto","invited_name":"Ada","role_label":"Administrador"}'::jsonb,
   ARRAY['Te han invitado a','Administrador','Aceptar invitación','https://app.simplificacrm.es/invite/admin-1','política de privacidad']),
  ('invite_member',
   '{"invite_url":"https://app.simplificacrm.es/invite/member-1","inviter_name":"Roberto","invited_name":"Ada"}'::jsonb,
   ARRAY['Te han invitado a','Miembro','Aceptar invitación','https://app.simplificacrm.es/invite/member-1']),
  ('invite_professional',
   '{"invite_url":"https://app.simplificacrm.es/invite/pro-1","inviter_name":"Roberto","invited_name":"Dra. Smith"}'::jsonb,
   ARRAY['Te han invitado a','Profesional','Aceptar invitación']),
  ('invite_agent',
   '{"invite_url":"https://app.simplificacrm.es/invite/agent-1","inviter_name":"Roberto","invited_name":"Marcos"}'::jsonb,
   ARRAY['Te han invitado a','Agente','Aceptar invitación']),
  ('invite_marketer',
   '{"invite_url":"https://app.simplificacrm.es/invite/mkt-1","inviter_name":"Roberto","invited_name":"Lucía"}'::jsonb,
   ARRAY['Te han invitado a','Marketing','Aceptar invitación']),
  ('invite_client',
   '{"invite_url":"https://app.simplificacrm.es/invite/client-1","inviter_name":"Roberto","invited_name":"Cliente Demo"}'::jsonb,
   ARRAY['Te han invitado a','portal de clientes','Aceptar invitación','https://app.simplificacrm.es/invite/client-1']),
  ('waitlist',
   '{"heading":"¡Estás en la lista!","body_text":"Te avisaremos cuando puedas reservar.","waitlist_url":"https://app.simplificacrm.es/waitlist/join"}'::jsonb,
   ARRAY['Estás en la lista','Te avisaremos cuando puedas reservar','Reservar ahora','https://app.simplificacrm.es/waitlist/join']),
  ('inactive_notice',
   '{"client_names":["Ana García","Luis Pérez","Marta Ruiz"]}'::jsonb,
   ARRAY['Clientes inactivos','Ana García','Luis Pérez','Marta Ruiz','Este es un mensaje automático']),
  ('generic',
   '{"message":"Mensaje informativo para el cliente"}'::jsonb,
   ARRAY['Mensaje informativo para el cliente']),
  ('google_review',
   '{"client_name":"Ana García","review_url":"https://g.page/r/test/reviews"}'::jsonb,
   ARRAY['Gracias por tu visita, Ana García','Dejar Google Review','https://g.page/r/test/reviews']),
  ('booking_reminder',
   '{"message":"Recordatorio de tu cita mañana"}'::jsonb,
   ARRAY['Recordatorio de tu cita mañana']),
  ('booking_cancellation',
   '{"message":"Tu cita ha sido cancelada"}'::jsonb,
   ARRAY['Tu cita ha sido cancelada']),
  ('password_reset',
   '{"message":"Restablece tu contraseña en https://app.simplificacrm.es/reset/abc-token"}'::jsonb,
   ARRAY['Restablece tu contraseña','https://app.simplificacrm.es/reset/abc-token']),
  ('magic_link',
   '{"message":"Tu enlace mágico: https://app.simplificacrm.es/magic/token-xyz"}'::jsonb,
   ARRAY['Tu enlace mágico','https://app.simplificacrm.es/magic/token-xyz']),
  ('welcome',
   '{"user_name":"Ada Lovelace","message":"Bienvenida a Simplifica"}'::jsonb,
   ARRAY['Bienvenida a Simplifica']),
  ('staff_credentials',
   '{"user_name":"Roberto","temp_password":"Tmp#2026-xyz","message":"Tus credenciales temporales"}'::jsonb,
   ARRAY['Tus credenciales temporales']),
  ('budget_created',
   '{"period_label":"Julio 2026","total_formatted":"1.250,00 €","client_name":"Ana García","payment_url":"https://app.simplificacrm.es/pay/b-1","cta_text":"Ver presupuesto"}'::jsonb,
   ARRAY['Nuevo presupuesto','Julio 2026','1.250,00','Ana García','https://app.simplificacrm.es/pay/b-1']),
  ('budget_reminder',
   '{"period_label":"Julio 2026","total_formatted":"1.250,00 €","client_name":"Ana García","payment_url":"https://app.simplificacrm.es/pay/b-2","due_date_formatted":"15/07/2026","days_to_due":3,"intro":"Tu presupuesto vence pronto."}'::jsonb,
   ARRAY['Tu presupuesto vence pronto','1.250,00','15/07/2026','Vence en 3 días','https://app.simplificacrm.es/pay/b-2']),
  ('budget_overdue',
   '{"period_label":"Junio 2026","total_formatted":"980,00 €","client_name":"Luis Pérez","payment_url":"https://app.simplificacrm.es/pay/b-3","due_date_formatted":"01/07/2026","days_to_due":-5,"intro":"Tu presupuesto ha vencido y aún no hemos recibido el pago."}'::jsonb,
   ARRAY['Presupuesto vencido','980,00','01/07/2026','Vencido hace 5 días','https://app.simplificacrm.es/pay/b-3']),
  ('booking_change',
   '{"change_type":"rescheduled","audience":"client","audience_name":"Ana García","service_name":"Fisioterapia deportiva","starts_at":"2026-07-10 16:30","previous_starts_at":"2026-07-09 10:00","booking_url":"https://app.simplificacrm.es/bookings/bk-1"}'::jsonb,
   ARRAY['reserva se ha reprogramado','Fisioterapia deportiva','Ana García','Anterior: 2026-07-09 10:00','https://app.simplificacrm.es/bookings/bk-1']);

-- The snapshot harness needs to read this table; allow the service_role
-- (used by tests) and any SECURITY DEFINER helper that needs it.
GRANT SELECT ON public.email_sample_fixtures TO authenticated;
GRANT SELECT ON public.email_sample_fixtures TO service_role;

COMMENT ON COLUMN public.email_sample_fixtures.sample_data IS
  'Variable bag passed to email_render_template(...) and to the TS renderer. '
  'Mirrors supabase/email-samples.json verbatim.';

COMMENT ON COLUMN public.email_sample_fixtures.expected_substrings IS
  'Substrings that MUST appear in the rendered HTML for this type. The '
  'snapshot harness asserts each one is present (LIKE %substring% match).';

COMMIT;

NOTIFY pgrst, 'reload schema';