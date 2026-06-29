-- Email tracking events: opens, clicks, bounces, etc.
-- One row per event. Open events fire when the recipient's email client
-- fetches the tracking pixel. Click events fire when a tracked link is
-- clicked (not implemented in this PR — placeholder for future).
create table if not exists public.email_tracking_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.marketing_campaigns(id) on delete cascade,
  recipient_email text not null,
  event_type text not null check (event_type in ('open','click','bounce','unsubscribe')),
  event_data jsonb default '{}'::jsonb,
  ip inet,
  user_agent text,
  user_id uuid, -- populated if the recipient has an auth account
  created_at timestamptz not null default now()
);

create index if not exists idx_email_tracking_campaign_email
  on public.email_tracking_events (campaign_id, recipient_email, created_at desc);

create index if not exists idx_email_tracking_created
  on public.email_tracking_events (created_at desc);

-- RLS: CRM users (authenticated) can read; insert happens via service role.
alter table public.email_tracking_events enable row level security;

create policy "crm users read tracking"
  on public.email_tracking_events for select
  to authenticated
  using (true);
