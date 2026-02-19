-- Enable pgcrypto for encryption
create extension if not exists pgcrypto;

-- Create table for encrypted clinical notes
create table if not exists public.client_clinical_notes (
    id uuid default gen_random_uuid() primary key,
    client_id uuid not null references public.clients(id) on delete cascade,
    content text not null, -- Stores the ENCRYPTED content (armor encoded)
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    created_by uuid references auth.users(id) default auth.uid()
);

-- Enable RLS
alter table public.client_clinical_notes enable row level security;

-- RLS Policies
-- Only authenticated users can view/create notes (Application level control via RPC preferred, but basic RLS is safety net)
-- Note: Raw SELECT will return encrypted text. Decrypting requires the key which acts as a second layer of security.

create policy "Users can view notes for their company clients"
    on public.client_clinical_notes
    for select
    using (
        exists (
            select 1 from public.clients c
            where c.id = client_clinical_notes.client_id
            and c.company_id = (select company_id from public.users where id = auth.uid())
        )
    );

create policy "Users can create notes for their company clients"
    on public.client_clinical_notes
    for insert
    with check (
        exists (
            select 1 from public.clients c
            where c.id = client_clinical_notes.client_id
            and c.company_id = (select company_id from public.users where id = auth.uid())
        )
    );

create policy "Users can update their own notes"
    on public.client_clinical_notes
    for update
    using (
        created_by = auth.uid()
    );

create policy "Users can delete their own notes"
    on public.client_clinical_notes
    for delete
    using (
        created_by = auth.uid()
    );


-- Trigger for updated_at
create extension if not exists moddatetime schema extensions;

create trigger handle_updated_at before update on public.client_clinical_notes
  for each row execute procedure moddatetime (updated_at);


-- RPC: Create Secure Note
-- Encrypts the content using a server-side key (environment variable or hardcoded for now, ideally managed via Vault)
-- NOTE: For this implementation, we will use a fixed key 'simplifica-secure-key-2026' for simplicity, 
-- but in production this should be injected or stored in Supabase Vault.
create or replace function create_clinical_note(p_client_id uuid, p_content text)
returns jsonb
language plpgsql
security definer
as $$
declare
    v_note_id uuid;
    v_encrypted_content text;
    v_encryption_key text := 'simplifica-secure-key-2026'; -- HARDCODED KEY FOR DEMO
begin
    -- Encrypt content
    v_encrypted_content := pgp_sym_encrypt(p_content, v_encryption_key);

    insert into public.client_clinical_notes (client_id, content)
    values (p_client_id, v_encrypted_content)
    returning id into v_note_id;

    return jsonb_build_object(
        'id', v_note_id,
        'success', true
    );
end;
$$;

-- RPC: Get Decrypted Notes
create or replace function get_client_clinical_notes(p_client_id uuid)
returns table (
    id uuid,
    client_id uuid,
    content text,
    created_at timestamptz,
    created_by_name text
)
language plpgsql
security definer
as $$
declare
    v_encryption_key text := 'simplifica-secure-key-2026'; -- HARDCODED KEY FOR DEMO
begin
    return query
    select 
        n.id,
        n.client_id,
        pgp_sym_decrypt(n.content::bytea, v_encryption_key) as content,
        n.created_at,
        u.name as created_by_name
    from public.client_clinical_notes n
    left join public.users u on n.created_by = u.id
    where n.client_id = p_client_id
    order by n.created_at desc;
end;
$$;

-- Grant access
grant usage on schema public to authenticated;
grant all on public.client_clinical_notes to authenticated; -- turbo
