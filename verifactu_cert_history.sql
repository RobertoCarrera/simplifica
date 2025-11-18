-- Migration: create history table for encrypted Veri*Factu certificates
-- Stores previous encrypted certificates for rotation/audit without plaintext exposure.

begin;

create table if not exists public.verifactu_cert_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.verifactu_settings(company_id) on delete cascade,
  version int not null,
  stored_at timestamptz not null default now(),
  rotated_by uuid, -- auth user id performing rotation (can map through users)
  cert_pem_enc text, -- encrypted previous cert (nullable if legacy plaintext only existed)
  key_pem_enc text, -- encrypted previous key (nullable if legacy)
  key_pass_enc text, -- encrypted previous passphrase (nullable)
  integrity_hash text, -- SHA256 over cert_pem_enc||key_pem_enc for tamper detection
  notes text,
  unique (company_id, version)
);

-- Simple index for queries
create index if not exists idx_verifactu_cert_history_company on public.verifactu_cert_history(company_id);

commit;
