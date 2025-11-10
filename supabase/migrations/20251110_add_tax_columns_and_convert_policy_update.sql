-- Migration: Add tax columns to app/company settings and align convert_policy values
-- Date: 2025-11-10

-- 0) Safety: wrap in a transaction
begin;

-- 1) Add tax-related columns to app_settings (global defaults)
alter table public.app_settings
  add column if not exists default_prices_include_tax boolean not null default false,
  add column if not exists default_iva_enabled boolean not null default true,
  add column if not exists default_iva_rate numeric(5,2) not null default 21,
  add column if not exists default_irpf_enabled boolean not null default false,
  add column if not exists default_irpf_rate numeric(5,2) not null default 15;

-- 2) Add tax-related columns to company_settings (overrides)
alter table public.company_settings
  add column if not exists prices_include_tax boolean,
  add column if not exists iva_enabled boolean,
  add column if not exists iva_rate numeric(5,2),
  add column if not exists irpf_enabled boolean,
  add column if not exists irpf_rate numeric(5,2);

-- 3) Align convert_policy allowed values to include 'automatic'
-- app_settings.default_convert_policy
-- Drop and recreate the check constraint to include 'automatic' (keeping compatibility with 'on_accept')
-- Find existing constraint name defensively (works across environments)
DO $$
DECLARE
  cons_name text;
BEGIN
  SELECT conname INTO cons_name
  FROM pg_constraint
  WHERE conrelid = 'public.app_settings'::regclass
    AND contype = 'c'
    AND conname ILIKE '%default_convert_policy%';

  IF cons_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.app_settings DROP CONSTRAINT %I', cons_name);
  END IF;

  -- Recreate with expanded set
  EXECUTE $$
    ALTER TABLE public.app_settings
    ADD CONSTRAINT app_settings_default_convert_policy_check
    CHECK (default_convert_policy IN ('manual','on_accept','automatic','scheduled'))
  $$;
END $$;

-- company_settings.convert_policy
DO $$
DECLARE
  cons_name text;
BEGIN
  SELECT conname INTO cons_name
  FROM pg_constraint
  WHERE conrelid = 'public.company_settings'::regclass
    AND contype = 'c'
    AND conname ILIKE '%convert_policy%';

  IF cons_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.company_settings DROP CONSTRAINT %I', cons_name);
  END IF;

  EXECUTE $$
    ALTER TABLE public.company_settings
    ADD CONSTRAINT company_settings_convert_policy_check
    CHECK (convert_policy IN ('manual','on_accept','automatic','scheduled'))
  $$;
END $$;

-- quotes.convert_policy (for consistency with UI)
DO $$
DECLARE
  cons_name text;
BEGIN
  SELECT conname INTO cons_name
  FROM pg_constraint
  WHERE conrelid = 'public.quotes'::regclass
    AND contype = 'c'
    AND conname ILIKE '%convert_policy%';

  IF cons_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.quotes DROP CONSTRAINT %I', cons_name);
  END IF;

  EXECUTE $$
    ALTER TABLE public.quotes
    ADD CONSTRAINT quotes_convert_policy_check
    CHECK (convert_policy IN ('manual','on_accept','automatic','scheduled'))
  $$;
END $$;

-- 4) Optional data migration: normalize values
-- If the UI has been storing 'automatic' already, keep as-is; if prior values used 'on_accept', leave them (both are allowed now).
-- No update required.

commit;
