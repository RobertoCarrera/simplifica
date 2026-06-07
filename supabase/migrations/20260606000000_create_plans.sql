-- ============================================
-- Migration: Plans & add-ons catalog
-- Phase 1 of pricing work (visual + persistido, sin Stripe aún).
--
-- Tabla `plans`: 3 planes base (Starter, Pro, Business) con precio base,
--   usuarios incluidos, módulos incluidos. Catálogo público para SELECT.
-- Tabla `plan_addons`: módulos optativos que se pueden sumar a cualquier plan.
--
-- Mutaciones: SOLO vía RPC SECURITY DEFINER que valida super_admin,
--   mismo patrón que admin_update_sidebar_navigation_order (migration 006).
--   La UI no hace INSERT/UPDATE/DELETE directamente: llama al RPC.
-- ============================================

-- ── TABLA plans ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plans (
  id              text PRIMARY KEY,                -- 'starter' | 'pro' | 'business'
  name            text NOT NULL,                   -- 'Starter' | 'Pro' | 'Business'
  tagline         text NOT NULL,                   -- frase corta para la card
  description     text,                            -- descripción larga (opcional)
  base_price_cents integer NOT NULL CHECK (base_price_cents >= 0),
  currency        text NOT NULL DEFAULT 'EUR',
  billing_period  text NOT NULL DEFAULT 'monthly' CHECK (billing_period IN ('monthly','yearly')),
  included_users  integer NOT NULL CHECK (included_users > 0),
  extra_user_cents integer NOT NULL DEFAULT 0 CHECK (extra_user_cents >= 0),
  included_modules text[] NOT NULL DEFAULT '{}',   -- module_keys incluidos en el plan
  sort_order      integer NOT NULL DEFAULT 0,      -- para ordenar las cards
  is_active       boolean NOT NULL DEFAULT true,
  is_highlighted  boolean NOT NULL DEFAULT false,  -- marca el plan "recomendado"
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.plans IS 'Catálogo de planes del CRM. Solo lectura pública; mutaciones vía RPC admin_upsert_plan.';
COMMENT ON COLUMN public.plans.id IS 'Identificador estable: starter, pro, business. Usar siempre lowercase ascii.';
COMMENT ON COLUMN public.plans.included_modules IS 'Array de module_keys (de modules_catalog.key) que el plan incluye de serie.';
COMMENT ON COLUMN public.plans.extra_user_cents IS 'Coste mensual en céntimos por cada usuario adicional sobre included_users.';

-- ── TABLA plan_addons ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plan_addons (
  id              text PRIMARY KEY,                -- 'ia' | 'marketing_pro' | 'automation' | 'verifactu_extra'
  name            text NOT NULL,
  description     text NOT NULL,
  icon            text NOT NULL DEFAULT 'fa-puzzle-piece',  -- FontAwesome class
  price_cents     integer NOT NULL CHECK (price_cents >= 0),
  currency        text NOT NULL DEFAULT 'EUR',
  billing_period  text NOT NULL DEFAULT 'monthly' CHECK (billing_period IN ('monthly','yearly')),
  applies_to_plans text[] NOT NULL DEFAULT '{}',    -- sobre qué planes aplica. Vacío = todos.
  sort_order      integer NOT NULL DEFAULT 0,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.plan_addons IS 'Módulos optativos sumables a cualquier plan. Catálogo público; mutaciones vía RPC.';

-- ── SEED ──────────────────────────────────────────────────
INSERT INTO public.plans (id, name, tagline, base_price_cents, currency, billing_period, included_users, extra_user_cents, included_modules, sort_order, is_highlighted)
VALUES
  ('starter',  'Starter',  'Agenda + clientes para empezar',
                 3900, 'EUR', 'monthly', 3,  1200,
                 ARRAY['clientes','reservas'],
                 1, false),
  ('pro',      'Pro',      'Facturación y email para PYMES en crecimiento',
                 8900, 'EUR', 'monthly', 8,  1200,
                 ARRAY['clientes','reservas','facturas','presupuestos','webmail'],
                 2, true),
  ('business', 'Business', 'Marketing, automatizaciones y todo lo anterior',
                 16900,'EUR', 'monthly', 15, 1200,
                 ARRAY['clientes','reservas','facturas','presupuestos','webmail','marketing','proyectos','analiticas','productos','servicios','dispositivos'],
                 3, false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.plan_addons (id, name, description, icon, price_cents, currency, billing_period, applies_to_plans, sort_order)
VALUES
  ('ia',              'IA',                  'Asistente inteligente, resúmenes automáticos, sugerencias de agenda.',          'fa-robot',         2500, 'EUR', 'monthly', ARRAY[]::text[], 1),
  ('marketing_pro',   'Marketing avanzado',  'Campañas masivas, A/B testing, segmentación avanzada.',                       'fa-bullhorn',      1900, 'EUR', 'monthly', ARRAY['pro','business'], 2),
  ('automation',      'Automatizaciones',    'Workflows personalizados: recordatorios, seguimientos, tareas recurrentes.',  'fa-cogs',          1500, 'EUR', 'monthly', ARRAY['pro','business'], 3),
  ('verifactu_extra', 'Verifactu extra',     'Volumen adicional de facturas Verifactu al mes.',                              'fa-file-invoice',  1000, 'EUR', 'monthly', ARRAY['pro','business'], 4)
ON CONFLICT (id) DO NOTHING;

-- ── RLS: SELECT a todos, mutaciones solo service_role (las RPCs usan service_role implícito) ─
ALTER TABLE public.plans       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_addons ENABLE ROW LEVEL SECURITY;

-- SELECT público: cualquier usuario (incluso anon) puede ver el catálogo de precios
DROP POLICY IF EXISTS plans_public_read ON public.plans;
CREATE POLICY plans_public_read
  ON public.plans
  FOR SELECT
  TO public
  USING (is_active = true);

DROP POLICY IF EXISTS plan_addons_public_read ON public.plan_addons;
CREATE POLICY plan_addons_public_read
  ON public.plan_addons
  FOR SELECT
  TO public
  USING (is_active = true);

-- INSERT/UPDATE/DELETE solo super_admin (vía RPC SECURITY DEFINER, no acceso directo a la tabla)
-- Sin policy = nadie puede escribir directamente. service_role bypasea RLS.

-- ── RPC: admin_upsert_plan ─────────────────────────────────
-- Inserta o actualiza un plan. Solo super_admin.
CREATE OR REPLACE FUNCTION public.admin_upsert_plan(
  p_id              text,
  p_name            text,
  p_tagline         text,
  p_description     text,
  p_base_price_cents integer,
  p_currency        text,
  p_billing_period  text,
  p_included_users  integer,
  p_extra_user_cents integer,
  p_included_modules text[],
  p_sort_order      integer,
  p_is_active       boolean,
  p_is_highlighted  boolean
)
RETURNS public.plans
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role_name text;
BEGIN
  SELECT r.name INTO v_role_name
  FROM public.users u
  JOIN public.app_roles r ON u.app_role_id = r.id
  WHERE u.auth_user_id = auth.uid();

  IF v_role_name IS NULL OR v_role_name != 'super_admin' THEN
    RAISE EXCEPTION 'Permission denied: super_admin required';
  END IF;

  INSERT INTO public.plans (
    id, name, tagline, description, base_price_cents, currency, billing_period,
    included_users, extra_user_cents, included_modules, sort_order, is_active, is_highlighted, updated_at
  ) VALUES (
    p_id, p_name, p_tagline, p_description, p_base_price_cents, p_currency, p_billing_period,
    p_included_users, p_extra_user_cents, p_included_modules, p_sort_order, p_is_active, p_is_highlighted, now()
  )
  ON CONFLICT (id) DO UPDATE SET
    name             = EXCLUDED.name,
    tagline          = EXCLUDED.tagline,
    description      = EXCLUDED.description,
    base_price_cents = EXCLUDED.base_price_cents,
    currency         = EXCLUDED.currency,
    billing_period   = EXCLUDED.billing_period,
    included_users   = EXCLUDED.included_users,
    extra_user_cents = EXCLUDED.extra_user_cents,
    included_modules = EXCLUDED.included_modules,
    sort_order       = EXCLUDED.sort_order,
    is_active        = EXCLUDED.is_active,
    is_highlighted   = EXCLUDED.is_highlighted,
    updated_at       = now();

  RETURN (SELECT p FROM public.plans p WHERE p.id = p_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_upsert_plan TO authenticated;

-- ── RPC: admin_upsert_addon ────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_upsert_addon(
  p_id              text,
  p_name            text,
  p_description     text,
  p_icon            text,
  p_price_cents     integer,
  p_currency        text,
  p_billing_period  text,
  p_applies_to_plans text[],
  p_sort_order      integer,
  p_is_active       boolean
)
RETURNS public.plan_addons
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_role_name text;
BEGIN
  SELECT r.name INTO v_role_name
  FROM public.users u
  JOIN public.app_roles r ON u.app_role_id = r.id
  WHERE u.auth_user_id = auth.uid();

  IF v_role_name IS NULL OR v_role_name != 'super_admin' THEN
    RAISE EXCEPTION 'Permission denied: super_admin required';
  END IF;

  INSERT INTO public.plan_addons (
    id, name, description, icon, price_cents, currency, billing_period,
    applies_to_plans, sort_order, is_active, updated_at
  ) VALUES (
    p_id, p_name, p_description, p_icon, p_price_cents, p_currency, p_billing_period,
    p_applies_to_plans, p_sort_order, p_is_active, now()
  )
  ON CONFLICT (id) DO UPDATE SET
    name             = EXCLUDED.name,
    description      = EXCLUDED.description,
    icon             = EXCLUDED.icon,
    price_cents      = EXCLUDED.price_cents,
    currency         = EXCLUDED.currency,
    billing_period   = EXCLUDED.billing_period,
    applies_to_plans = EXCLUDED.applies_to_plans,
    sort_order       = EXCLUDED.sort_order,
    is_active        = EXCLUDED.is_active,
    updated_at       = now();

  RETURN (SELECT a FROM public.plan_addons a WHERE a.id = p_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_upsert_addon TO authenticated;

-- Trigger para mantener updated_at
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS plans_touch_updated_at ON public.plans;
CREATE TRIGGER plans_touch_updated_at
  BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS plan_addons_touch_updated_at ON public.plan_addons;
CREATE TRIGGER plan_addons_touch_updated_at
  BEFORE UPDATE ON public.plan_addons
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ════════════════════════════════════════════════════════════════════════════
-- STATE SYNC — precios vigentes
-- Los precios son IVA INCLUIDO (visible al cliente). El seed inicial usa
-- ON CONFLICT DO NOTHING, así que este bloque UPDATE explícito es lo que
-- mantiene la BD alineada con la versión canónica de este archivo.
-- Idempotente: re-ejecutar la migración deja la BD en el mismo estado.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Planes ──
UPDATE public.plans SET
  name             = 'Starter',
  tagline          = 'Agenda, webmail y analítica para empezar',
  base_price_cents = 4500,
  currency         = 'EUR',
  billing_period   = 'monthly',
  included_users   = 3,
  extra_user_cents = 1500,
  included_modules = ARRAY['clientes','reservas','webmail','analiticas'],
  sort_order       = 1,
  is_active        = true,
  is_highlighted   = false
WHERE id = 'starter';

UPDATE public.plans SET
  name             = 'Pro',
  tagline          = 'Facturación y presupuestos para PYMES en crecimiento',
  base_price_cents = 10000,
  currency         = 'EUR',
  billing_period   = 'monthly',
  included_users   = 8,
  extra_user_cents = 1500,
  included_modules = ARRAY['clientes','reservas','webmail','analiticas','facturas','presupuestos'],
  sort_order       = 2,
  is_active        = true,
  is_highlighted   = true
WHERE id = 'pro';

UPDATE public.plans SET
  name             = 'Business',
  tagline          = 'Para equipos que necesitan todo el potencial',
  base_price_cents = 25000,
  currency         = 'EUR',
  billing_period   = 'monthly',
  included_users   = 15,
  extra_user_cents = 1500,
  -- 'marketing' sale del set base: ahora es add-on (marketing_pro)
  included_modules = ARRAY['clientes','reservas','webmail','analiticas','facturas','presupuestos'],
  sort_order       = 3,
  is_active        = true,
  is_highlighted   = false
WHERE id = 'business';

-- ── Add-ons: reasignar y añadir los que faltan ──

-- Marketing avanzado: ahora disponible desde Starter (antes solo pro/business)
UPDATE public.plan_addons SET
  name             = 'Marketing avanzado',
  description      = 'Campañas masivas, A/B testing, segmentación avanzada.',
  icon             = 'fa-bullhorn',
  price_cents      = 1900,
  currency         = 'EUR',
  billing_period   = 'monthly',
  applies_to_plans = ARRAY['starter','pro','business'],
  sort_order       = 1,
  is_active        = true
WHERE id = 'marketing_pro';

-- Proyectos: add-on de pago a partir de Starter
INSERT INTO public.plan_addons (id, name, description, icon, price_cents, currency, billing_period, applies_to_plans, sort_order, is_active)
VALUES ('proyectos', 'Proyectos', 'Gestión de proyectos, tareas y equipo.', 'fa-project-diagram', 1500, 'EUR', 'monthly', ARRAY['starter','pro','business'], 2, true)
ON CONFLICT (id) DO UPDATE SET
  name             = EXCLUDED.name,
  description      = EXCLUDED.description,
  icon             = EXCLUDED.icon,
  price_cents      = EXCLUDED.price_cents,
  currency         = EXCLUDED.currency,
  billing_period   = EXCLUDED.billing_period,
  applies_to_plans = EXCLUDED.applies_to_plans,
  sort_order       = EXCLUDED.sort_order,
  is_active        = EXCLUDED.is_active;

-- Automatizaciones: sigue siendo de pago, en pro y business
UPDATE public.plan_addons SET
  name             = 'Automatizaciones',
  description      = 'Workflows personalizados: recordatorios, seguimientos, tareas recurrentes.',
  icon             = 'fa-cogs',
  price_cents      = 1500,
  currency         = 'EUR',
  billing_period   = 'monthly',
  applies_to_plans = ARRAY['pro','business'],
  sort_order       = 3,
  is_active        = true
WHERE id = 'automation';

-- IA: add-on de pago disponible en todos los planes
UPDATE public.plan_addons SET
  name             = 'IA',
  description      = 'Asistente inteligente, resúmenes automáticos, sugerencias de agenda.',
  icon             = 'fa-robot',
  price_cents      = 2500,
  currency         = 'EUR',
  billing_period   = 'monthly',
  applies_to_plans = ARRAY['starter','pro','business'],
  sort_order       = 4,
  is_active        = true
WHERE id = 'ia';

-- Verifactu extra: de pago, pro y business
UPDATE public.plan_addons SET
  name             = 'Verifactu extra',
  description      = 'Volumen adicional de facturas Verifactu al mes.',
  icon             = 'fa-file-invoice',
  price_cents      = 1000,
  currency         = 'EUR',
  billing_period   = 'monthly',
  applies_to_plans = ARRAY['pro','business'],
  sort_order       = 5,
  is_active        = true
WHERE id = 'verifactu_extra';

-- ── Add-ons GRATUITOS opt-in (precio 0) ──
-- Servicios, Productos, Dispositivos, Tickets: elegibles según el negocio del cliente
INSERT INTO public.plan_addons (id, name, description, icon, price_cents, currency, billing_period, applies_to_plans, sort_order, is_active)
VALUES
  ('servicios',  'Servicios',  'Catálogo de servicios que ofreces (consultas, clases, tratamientos...).', 'fa-concierge-bell', 0, 'EUR', 'monthly', ARRAY['starter','pro','business'], 10, true),
  ('productos',  'Productos',  'Venta y stock de productos físicos o digitales.',                         'fa-box-open',        0, 'EUR', 'monthly', ARRAY['starter','pro','business'], 11, true),
  ('dispositivos','Dispositivos','Reparación de dispositivos: tickets, partes, seguimiento.',          'fa-mobile-alt',     0, 'EUR', 'monthly', ARRAY['starter','pro','business'], 12, true),
  ('tickets',    'Tickets',    'Sistema de tickets y atención al cliente.',                              'fa-ticket-alt',      0, 'EUR', 'monthly', ARRAY['starter','pro','business'], 13, true)
ON CONFLICT (id) DO UPDATE SET
  name             = EXCLUDED.name,
  description      = EXCLUDED.description,
  icon             = EXCLUDED.icon,
  price_cents      = EXCLUDED.price_cents,
  currency         = EXCLUDED.currency,
  billing_period   = EXCLUDED.billing_period,
  applies_to_plans = EXCLUDED.applies_to_plans,
  sort_order       = EXCLUDED.sort_order,
  is_active        = EXCLUDED.is_active;

-- Limpieza: el viejo add-on 'marketing' (sin _pro) ya no se usa; desactivarlo por si quedó
UPDATE public.plan_addons SET is_active = false WHERE id = 'marketing' AND id <> 'marketing_pro';
