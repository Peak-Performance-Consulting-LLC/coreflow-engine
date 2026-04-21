-- Email Templates Enhancement: Template Management, Campaigns, Attachments, and Asset Management

-- ─── Email Template Categories ───────────────────────────────────────
create table if not exists public.email_template_categories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  icon text default '📧',
  color text default '#6D28D9',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (workspace_id, slug)
);

create index if not exists idx_email_template_categories_workspace
on public.email_template_categories(workspace_id, is_active, sort_order);

-- ─── Email Templates (Pre-made and Custom) ────────────────────────────
create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  category_id uuid references public.email_template_categories(id) on delete set null,
  name text not null,
  slug text,
  description text,
  thumbnail_url text,
  subject_template text not null,
  body_html_template text,
  body_plain_template text,
  is_html boolean not null default true,
  preview_html text,
  preview_plain text,
  template_type text not null default 'custom', -- 'custom', 'preset', 'system'
  use_case text, -- 'welcome', 'followup', 're-engagement', 'offer', 'feedback', 'custom'
  is_active boolean not null default true,
  is_locked boolean not null default false, -- System templates are locked
  logo_url text,
  brand_primary_color text,
  brand_secondary_color text,
  include_footer boolean not null default true,
  footer_html text,
  tags text[] default '{}',
  metadata jsonb default '{}'::jsonb,
  clone_count integer not null default 0,
  usage_count integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_email_templates_workspace_type
on public.email_templates(workspace_id, template_type, is_active);

create index if not exists idx_email_templates_category
on public.email_templates(category_id, is_active);

-- ─── Email Template Assets (Logos, Images, Attachments) ──────────────
create table if not exists public.email_template_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  template_id uuid references public.email_templates(id) on delete cascade,
  name text not null,
  file_type text not null, -- 'image', 'document', 'attachment'
  mime_type text not null,
  file_size integer not null check (file_size > 0 and file_size <= 50000000), -- 50MB max
  storage_path text not null unique,
  public_url text not null,
  is_logo boolean not null default false,
  is_signature boolean not null default false,
  usage_count integer not null default 0,
  metadata jsonb default '{}'::jsonb,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_email_template_assets_workspace_type
on public.email_template_assets(workspace_id, file_type, is_logo);

create index if not exists idx_email_template_assets_template
on public.email_template_assets(template_id);

-- ─── Email Campaigns ────────────────────────────────────────────────
create table if not exists public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  template_id uuid not null references public.email_templates(id) on delete restrict,
  sender_id uuid references public.workspace_email_senders(id) on delete set null,
  name text not null,
  description text,
  subject_override text, -- Override template subject
  body_override_html text, -- Override template body
  status text not null default 'draft', -- 'draft', 'scheduled', 'active', 'paused', 'completed', 'cancelled'
  recipient_filter jsonb not null default '{}'::jsonb, -- Query to filter records
  recipient_count integer not null default 0,
  scheduled_at timestamptz,
  started_at timestamptz,
  paused_at timestamptz,
  completed_at timestamptz,
  stopped_at timestamptz,
  stop_reason text,
  send_window_start integer, -- Hour of day to start sending (0-23)
  send_window_end integer,   -- Hour of day to stop sending (0-23)
  send_window_days text[], -- Days of week when sending is enabled
  timezone text not null default 'UTC',
  rate_limit integer not null default 0, -- Emails per minute (0 = unlimited)
  metadata jsonb default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_email_campaigns_workspace_status
on public.email_campaigns(workspace_id, status, created_at desc);

create index if not exists idx_email_campaigns_template
on public.email_campaigns(template_id);

-- ─── Campaign Recipients ────────────────────────────────────────────
create table if not exists public.email_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid not null references public.email_campaigns(id) on delete cascade,
  record_id uuid not null,
  recipient_email text not null,
  recipient_name text,
  status text not null default 'pending', -- 'pending', 'sent', 'failed', 'bounced', 'unsubscribed', 'skipped'
  scheduled_for timestamptz,
  sent_at timestamptz,
  failure_reason text,
  provider_message_id text,
  last_error text,
  last_response jsonb default '{}'::jsonb,
  attempt_count integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_email_campaign_recipients_campaign_status
on public.email_campaign_recipients(campaign_id, status, created_at desc);

create index if not exists idx_email_campaign_recipients_workspace_record
on public.email_campaign_recipients(workspace_id, record_id);

create index if not exists idx_email_campaign_recipients_scheduled
on public.email_campaign_recipients(workspace_id, scheduled_for asc)
where status = 'pending' and scheduled_for is not null;

-- ─── Campaign Template Attachments ──────────────────────────────────
create table if not exists public.email_campaign_template_attachments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid not null references public.email_campaigns(id) on delete cascade,
  template_id uuid not null references public.email_templates(id) on delete cascade,
  asset_id uuid not null references public.email_template_assets(id) on delete cascade,
  attachment_name text not null,
  is_required boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  unique (campaign_id, asset_id)
);

create index if not exists idx_email_campaign_attachments_campaign
on public.email_campaign_template_attachments(campaign_id, sort_order);

-- ─── Campaign Statistics ────────────────────────────────────────────
create table if not exists public.email_campaign_stats (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid not null references public.email_campaigns(id) on delete cascade unique,
  total_recipients integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  bounced_count integer not null default 0,
  unsubscribed_count integer not null default 0,
  open_count integer not null default 0,
  click_count integer not null default 0,
  reply_count integer not null default 0,
  last_updated_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_email_campaign_stats_workspace
on public.email_campaign_stats(workspace_id, campaign_id);

-- ─── Triggers ───────────────────────────────────────────────────────

drop trigger if exists set_email_template_categories_updated_at on public.email_template_categories;
create trigger set_email_template_categories_updated_at
before update on public.email_template_categories
for each row execute function public.set_updated_at();

drop trigger if exists set_email_templates_updated_at on public.email_templates;
create trigger set_email_templates_updated_at
before update on public.email_templates
for each row execute function public.set_updated_at();

drop trigger if exists set_email_template_assets_updated_at on public.email_template_assets;
create trigger set_email_template_assets_updated_at
before update on public.email_template_assets
for each row execute function public.set_updated_at();

drop trigger if exists set_email_campaigns_updated_at on public.email_campaigns;
create trigger set_email_campaigns_updated_at
before update on public.email_campaigns
for each row execute function public.set_updated_at();

drop trigger if exists set_email_campaign_recipients_updated_at on public.email_campaign_recipients;
create trigger set_email_campaign_recipients_updated_at
before update on public.email_campaign_recipients
for each row execute function public.set_updated_at();

drop trigger if exists set_email_campaign_stats_updated_at on public.email_campaign_stats;
create trigger set_email_campaign_stats_updated_at
before update on public.email_campaign_stats
for each row execute function public.set_updated_at();

-- ─── RLS Policies ───────────────────────────────────────────────────

alter table public.email_template_categories enable row level security;
alter table public.email_templates enable row level security;
alter table public.email_template_assets enable row level security;
alter table public.email_campaigns enable row level security;
alter table public.email_campaign_recipients enable row level security;
alter table public.email_campaign_template_attachments enable row level security;
alter table public.email_campaign_stats enable row level security;

-- Template Categories RLS
drop policy if exists "workspace_members_can_view_own_categories" on public.email_template_categories;
create policy "workspace_members_can_view_own_categories"
on public.email_template_categories for select
to authenticated
using (
  workspace_id in (
    select id from public.workspaces where exists (
      select 1 from public.workspace_members
      where workspace_id = public.workspaces.id
      and user_id = auth.uid()
    )
  )
);

drop policy if exists "workspace_admins_can_manage_categories" on public.email_template_categories;
create policy "workspace_admins_can_manage_categories"
on public.email_template_categories for all
to authenticated
using (
  workspace_id in (
    select id from public.workspaces where exists (
      select 1 from public.workspace_members
      where workspace_id = public.workspaces.id
      and user_id = auth.uid()
      and role in ('admin', 'owner')
    )
  )
);

-- Email Templates RLS
drop policy if exists "workspace_members_can_view_templates" on public.email_templates;
create policy "workspace_members_can_view_templates"
on public.email_templates for select
to authenticated
using (
  workspace_id in (
    select id from public.workspaces where exists (
      select 1 from public.workspace_members
      where workspace_id = public.workspaces.id
      and user_id = auth.uid()
    )
  )
);

drop policy if exists "workspace_members_can_create_templates" on public.email_templates;
create policy "workspace_members_can_create_templates"
on public.email_templates for insert
to authenticated
with check (
  workspace_id in (
    select id from public.workspaces where exists (
      select 1 from public.workspace_members
      where workspace_id = public.workspaces.id
      and user_id = auth.uid()
      and role in ('admin', 'owner', 'member')
    )
  )
  and created_by = auth.uid()
);

drop policy if exists "template_creators_can_update_own_custom_templates" on public.email_templates;
create policy "template_creators_can_update_own_custom_templates"
on public.email_templates for update
to authenticated
using (
  created_by = auth.uid()
  and template_type = 'custom'
  and not is_locked
  and workspace_id in (
    select id from public.workspaces where exists (
      select 1 from public.workspace_members
      where workspace_id = public.workspaces.id
      and user_id = auth.uid()
    )
  )
);

-- Email Assets RLS
drop policy if exists "workspace_members_can_view_assets" on public.email_template_assets;
create policy "workspace_members_can_view_assets"
on public.email_template_assets for select
to authenticated
using (
  workspace_id in (
    select id from public.workspaces where exists (
      select 1 from public.workspace_members
      where workspace_id = public.workspaces.id
      and user_id = auth.uid()
    )
  )
);

drop policy if exists "workspace_members_can_upload_assets" on public.email_template_assets;
create policy "workspace_members_can_upload_assets"
on public.email_template_assets for insert
to authenticated
with check (
  workspace_id in (
    select id from public.workspaces where exists (
      select 1 from public.workspace_members
      where workspace_id = public.workspaces.id
      and user_id = auth.uid()
      and role in ('admin', 'owner', 'member')
    )
  )
  and uploaded_by = auth.uid()
);

-- Email Campaigns RLS
drop policy if exists "workspace_members_can_view_campaigns" on public.email_campaigns;
create policy "workspace_members_can_view_campaigns"
on public.email_campaigns for select
to authenticated
using (
  workspace_id in (
    select id from public.workspaces where exists (
      select 1 from public.workspace_members
      where workspace_id = public.workspaces.id
      and user_id = auth.uid()
    )
  )
);

drop policy if exists "workspace_members_can_create_campaigns" on public.email_campaigns;
create policy "workspace_members_can_create_campaigns"
on public.email_campaigns for insert
to authenticated
with check (
  workspace_id in (
    select id from public.workspaces where exists (
      select 1 from public.workspace_members
      where workspace_id = public.workspaces.id
      and user_id = auth.uid()
      and role in ('admin', 'owner', 'member')
    )
  )
  and created_by = auth.uid()
);

drop policy if exists "campaign_creators_can_update_drafts" on public.email_campaigns;
create policy "campaign_creators_can_update_drafts"
on public.email_campaigns for update
to authenticated
using (
  created_by = auth.uid()
  and status in ('draft', 'scheduled')
  and workspace_id in (
    select id from public.workspaces where exists (
      select 1 from public.workspace_members
      where workspace_id = public.workspaces.id
      and user_id = auth.uid()
    )
  )
);

-- Campaign Recipients RLS
drop policy if exists "workspace_members_can_view_campaign_recipients" on public.email_campaign_recipients;
create policy "workspace_members_can_view_campaign_recipients"
on public.email_campaign_recipients for select
to authenticated
using (
  workspace_id in (
    select id from public.workspaces where exists (
      select 1 from public.workspace_members
      where workspace_id = public.workspaces.id
      and user_id = auth.uid()
    )
  )
);

drop policy if exists "service_role_can_manage_recipients" on public.email_campaign_recipients;
create policy "service_role_can_manage_recipients"
on public.email_campaign_recipients for all
to service_role
using (true);

-- Campaign Stats RLS
drop policy if exists "workspace_members_can_view_campaign_stats" on public.email_campaign_stats;
create policy "workspace_members_can_view_campaign_stats"
on public.email_campaign_stats for select
to authenticated
using (
  workspace_id in (
    select id from public.workspaces where exists (
      select 1 from public.workspace_members
      where workspace_id = public.workspaces.id
      and user_id = auth.uid()
    )
  )
);

-- Notify schema change
notify pgrst, 'reload schema';
