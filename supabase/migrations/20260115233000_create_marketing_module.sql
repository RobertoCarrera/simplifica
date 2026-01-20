-- Enable UUID extension if not already enabled
create extension if not exists "uuid-ossp";

-- Table: marketing_metrics
-- storing daily aggregate performance data
create table if not exists public.marketing_metrics (
    id uuid default uuid_generate_v4() primary key,
    company_id uuid references public.companies(id) on delete cascade not null,
    date date not null,
    channel text not null check (channel in ('google_ads', 'instagram_ads', 'tiktok_ads', 'organic', 'email', 'other')),
    spend numeric default 0,
    impressions integer default 0,
    clicks integer default 0,
    leads_attributed integer default 0, -- Optional manual attribution
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    
    unique(company_id, date, channel) -- Prevent duplicate entries for same day/channel
);

-- Indexes for marketing_metrics
create index if not exists idx_marketing_metrics_company_date on public.marketing_metrics(company_id, date);

-- RLS for marketing_metrics
alter table public.marketing_metrics enable row level security;

create policy "Admins/Owners manage marketing metrics"
    on public.marketing_metrics
    for all
    using (
        company_id in (
            select company_id from public.company_members 
            where user_id = auth.uid() and role in ('owner', 'admin')
        )
    );

create policy "Employees view marketing metrics"
    on public.marketing_metrics
    for select
    using (
        company_id in (
            select company_id from public.company_members 
            where user_id = auth.uid()
        )
    );


-- Table: social_metrics
-- storing periodic snapshots of social media growth
create table if not exists public.social_metrics (
    id uuid default uuid_generate_v4() primary key,
    company_id uuid references public.companies(id) on delete cascade not null,
    date date not null,
    platform text not null check (platform in ('instagram', 'tiktok', 'facebook', 'linkedin', 'google_business')),
    followers integer default 0,
    engagement_rate numeric(5,2) default 0, -- e.g. 5.43%
    posts_count integer default 0,
    created_at timestamptz default now(),
    
    unique(company_id, date, platform)
);

-- Indexes for social_metrics
create index if not exists idx_social_metrics_company_date on public.social_metrics(company_id, date);

-- RLS for social_metrics
alter table public.social_metrics enable row level security;

create policy "Admins/Owners manage social metrics"
    on public.social_metrics
    for all
    using (
        company_id in (
            select company_id from public.company_members 
            where user_id = auth.uid() and role in ('owner', 'admin')
        )
    );

create policy "Employees view social metrics"
    on public.social_metrics
    for select
    using (
        company_id in (
            select company_id from public.company_members 
            where user_id = auth.uid()
        )
    );

-- Trigger for marketing_metrics updated_at
create trigger update_marketing_metrics_updated_at
    before update on public.marketing_metrics
    for each row
    execute function update_updated_at_column();
