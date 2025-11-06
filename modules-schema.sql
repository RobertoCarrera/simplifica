-- Modules catalog for server-side feature flags
-- Run this SQL in your Supabase database

create table if not exists public.modules (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  category text,
  position integer not null default 0,
  enabled_by_default boolean not null default false,
  is_active boolean not null default true,
  plan_required text,
  price numeric,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable RLS and allow read for authenticated; service role unrestricted
alter table public.modules enable row level security;
create policy if not exists modules_select_active
  on public.modules for select
  using (is_active = true or auth.role() = 'service_role');

-- Optional: ensure (user_id, module_key) uniqueness on user_modules
-- Uncomment if you want to prevent duplicates
-- alter table public.user_modules add constraint user_modules_user_key_unique unique (user_id, module_key);

-- Seed basic modules (adjust to your needs)
insert into public.modules (key, name, description, category, position, enabled_by_default, is_active) values
  ('moduloPresupuestos', 'Presupuestos', 'Gestión de presupuestos', 'ventas', 10, true, true)
, ('moduloServicios', 'Servicios', 'Catálogo de servicios', 'ventas', 20, true, true)
, ('moduloMaterial', 'Material/Productos', 'Gestión de productos y material', 'inventario', 30, true, true)
, ('moduloFacturas', 'Facturación', 'Emitir y gestionar facturas', 'facturacion', 40, false, true)
ON CONFLICT (key) DO UPDATE set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  position = excluded.position,
  enabled_by_default = excluded.enabled_by_default,
  is_active = excluded.is_active,
  updated_at = now();
