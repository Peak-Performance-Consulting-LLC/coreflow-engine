-- CoreFlow Email Experience V1 foundation
-- Adds visual template schema, workspace branding, suppression model,
-- campaign recipient snapshots, manual sends, and all-member email governance.

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------
create or replace function public.normalize_email_address(email_input text)
returns text
language sql
immutable
as $$
  select case
    when email_input is null then null
    else lower(trim(email_input))
  end;
$$;

-- ---------------------------------------------------------------------
-- Template and Brand Models
-- ---------------------------------------------------------------------
create table if not exists public.workspace_email_brand_themes (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  logo_url text,
  brand_name text,
  primary_color text,
  secondary_color text,
  accent_color text,
  body_bg_color text,
  card_bg_color text,
  text_color text,
  heading_font text,
  body_font text,
  font_scale text not null default 'base',
  footer_company_name text,
  footer_address text,
  footer_contact_email text,
  footer_signature text,
  sender_display_name_default text,
  sender_email_default text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_workspace_email_brand_themes_updated_at
on public.workspace_email_brand_themes(updated_at desc);

alter table public.email_template_categories
  add column if not exists archived_at timestamptz,
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

alter table public.email_templates
  add column if not exists layout_json jsonb,
  add column if not exists theme_overrides jsonb,
  add column if not exists preview_meta jsonb,
  add column if not exists sender_display_name_override text,
  add column if not exists sender_email_override text,
  add column if not exists archived_at timestamptz;

update public.email_templates
set layout_json = jsonb_build_object(
  'version', 1,
  'blocks', jsonb_build_array(
    jsonb_build_object(
      'id', 'body-text',
      'type', 'text',
      'content', coalesce(nullif(body_html_template, ''), nullif(body_plain_template, ''), ''),
      'align', 'left'
    )
  )
)
where layout_json is null;

update public.email_templates
set theme_overrides = '{}'::jsonb
where theme_overrides is null;

update public.email_templates
set preview_meta = '{}'::jsonb
where preview_meta is null;

alter table public.email_templates
  alter column layout_json set default jsonb_build_object(
    'version', 1,
    'blocks', jsonb_build_array(
      jsonb_build_object('id', 'hero-text', 'type', 'text', 'content', 'Write your message here.', 'align', 'left')
    )
  ),
  alter column layout_json set not null,
  alter column theme_overrides set default '{}'::jsonb,
  alter column theme_overrides set not null,
  alter column preview_meta set default '{}'::jsonb,
  alter column preview_meta set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'email_templates_layout_json_object_check'
  ) then
    alter table public.email_templates
      add constraint email_templates_layout_json_object_check
      check (jsonb_typeof(layout_json) = 'object');
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Campaign recipient snapshot + suppression + manual send models
-- ---------------------------------------------------------------------
create table if not exists public.workspace_email_unsubscribes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  source text not null default 'manual',
  reason text,
  details jsonb not null default '{}'::jsonb,
  unsubscribed_at timestamptz not null default timezone('utc', now()),
  resubscribed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (workspace_id, email)
);

update public.workspace_email_unsubscribes
set email = public.normalize_email_address(email);

create index if not exists idx_workspace_email_unsubscribes_workspace_active
on public.workspace_email_unsubscribes(workspace_id, email)
where resubscribed_at is null or resubscribed_at < unsubscribed_at;

create or replace function public.is_workspace_email_suppressed(target_workspace_id uuid, email_input text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_email_unsubscribes u
    where u.workspace_id = target_workspace_id
      and u.email = public.normalize_email_address(email_input)
      and (u.resubscribed_at is null or u.resubscribed_at < u.unsubscribed_at)
  );
$$;

create table if not exists public.email_campaign_recipient_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid not null references public.email_campaigns(id) on delete cascade,
  segment_definition jsonb not null default '{}'::jsonb,
  include_record_ids uuid[] not null default '{}',
  exclude_record_ids uuid[] not null default '{}',
  total_candidates integer not null default 0,
  total_included integer not null default 0,
  frozen_at timestamptz not null default timezone('utc', now()),
  frozen_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (campaign_id)
);

create index if not exists idx_email_campaign_recipient_snapshots_workspace_campaign
on public.email_campaign_recipient_snapshots(workspace_id, campaign_id);

alter table public.email_campaigns
  add column if not exists segment_definition jsonb not null default '{}'::jsonb,
  add column if not exists manual_include_record_ids uuid[] not null default '{}',
  add column if not exists manual_exclude_record_ids uuid[] not null default '{}',
  add column if not exists snapshot_frozen_at timestamptz,
  add column if not exists latest_snapshot_id uuid references public.email_campaign_recipient_snapshots(id) on delete set null,
  add column if not exists dispatch_started_at timestamptz,
  add column if not exists archived_at timestamptz;

alter table public.email_campaign_recipients
  add column if not exists snapshot_id uuid references public.email_campaign_recipient_snapshots(id) on delete set null,
  add column if not exists suppression_reason text,
  add column if not exists manual_override text,
  add column if not exists delivery_channel text not null default 'campaign';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'email_campaign_recipients_workspace_record_fkey'
  ) then
    alter table public.email_campaign_recipients
      add constraint email_campaign_recipients_workspace_record_fkey
      foreign key (workspace_id, record_id)
      references public.records(workspace_id, id)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'email_campaign_recipients_campaign_record_unique'
  ) then
    alter table public.email_campaign_recipients
      add constraint email_campaign_recipients_campaign_record_unique
      unique (campaign_id, record_id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'email_campaign_recipients_delivery_channel_check'
  ) then
    alter table public.email_campaign_recipients
      add constraint email_campaign_recipients_delivery_channel_check
      check (delivery_channel in ('campaign'));
  end if;
end $$;

create index if not exists idx_email_campaign_recipients_snapshot_status
on public.email_campaign_recipients(snapshot_id, status, created_at desc);

create table if not exists public.email_manual_sends (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  template_id uuid references public.email_templates(id) on delete set null,
  sender_id uuid references public.workspace_email_senders(id) on delete set null,
  subject_template text not null,
  body_html_template text,
  body_plain_template text,
  layout_json jsonb,
  theme_overrides jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  recipient_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  suppressed_count integer not null default 0,
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.email_manual_send_recipients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  manual_send_id uuid not null references public.email_manual_sends(id) on delete cascade,
  record_id uuid not null,
  recipient_email text not null,
  recipient_name text,
  status text not null default 'pending',
  suppression_reason text,
  provider_message_id text,
  error_text text,
  sent_at timestamptz,
  attempt_count integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_email_manual_send_recipients_manual_status
on public.email_manual_send_recipients(manual_send_id, status, created_at desc);

create table if not exists public.email_send_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  channel text not null,
  event_type text not null,
  campaign_id uuid references public.email_campaigns(id) on delete set null,
  campaign_recipient_id uuid references public.email_campaign_recipients(id) on delete set null,
  followup_id uuid references public.record_email_followups(id) on delete set null,
  followup_step_id uuid references public.record_email_followup_steps(id) on delete set null,
  manual_send_id uuid references public.email_manual_sends(id) on delete set null,
  manual_send_recipient_id uuid references public.email_manual_send_recipients(id) on delete set null,
  record_id uuid references public.records(id) on delete set null,
  sender_id uuid references public.workspace_email_senders(id) on delete set null,
  recipient_email text,
  provider text,
  provider_message_id text,
  payload jsonb not null default '{}'::jsonb,
  error_text text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_email_send_events_workspace_created_at
on public.email_send_events(workspace_id, created_at desc);

-- ---------------------------------------------------------------------
-- Sequence scheduling controls: timezone + send window
-- ---------------------------------------------------------------------
alter table public.workspace_email_automation_settings
  add column if not exists send_window_start_hour integer,
  add column if not exists send_window_end_hour integer,
  add column if not exists send_window_days integer[] not null default array[1,2,3,4,5,6,7];

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'workspace_email_automation_settings_send_window_start_hour_check'
  ) then
    alter table public.workspace_email_automation_settings
      add constraint workspace_email_automation_settings_send_window_start_hour_check
      check (send_window_start_hour is null or (send_window_start_hour >= 0 and send_window_start_hour <= 23));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'workspace_email_automation_settings_send_window_end_hour_check'
  ) then
    alter table public.workspace_email_automation_settings
      add constraint workspace_email_automation_settings_send_window_end_hour_check
      check (send_window_end_hour is null or (send_window_end_hour >= 0 and send_window_end_hour <= 23));
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Seed default categories required by V1
-- ---------------------------------------------------------------------
update public.email_template_categories c
set slug = 'reminder',
    name = 'Reminder',
    description = 'Reminder and gentle check-in templates',
    icon = coalesce(c.icon, '⏰'),
    updated_at = timezone('utc', now())
where c.slug = 'reengagement'
  and not exists (
    select 1
    from public.email_template_categories x
    where x.workspace_id = c.workspace_id
      and x.slug = 'reminder'
  );

update public.email_template_categories c
set slug = 'feedback-request',
    name = 'Feedback Request',
    description = 'Ask leads and clients for feedback or reviews',
    icon = coalesce(c.icon, '💬'),
    updated_at = timezone('utc', now())
where c.slug in ('feedback', 'feedback-survey')
  and not exists (
    select 1
    from public.email_template_categories x
    where x.workspace_id = c.workspace_id
      and x.slug = 'feedback-request'
  );

with defaults(slug, name, description, icon, color, sort_order) as (
  values
    ('welcome', 'Welcome', 'Welcome and thank-you sequences', '👋', '#10B981', 1),
    ('followups', 'Follow-ups', 'Nurture and follow-up sequences', '📬', '#F59E0B', 2),
    ('reminder', 'Reminder', 'Reminder and gentle check-in templates', '⏰', '#3B82F6', 3),
    ('feedback-request', 'Feedback Request', 'Ask leads and clients for feedback', '💬', '#06B6D4', 4),
    ('offers', 'Offers & Promotions', 'Promotions, offers, and sales campaigns', '🎁', '#EC4899', 5)
)
insert into public.email_template_categories (
  workspace_id,
  name,
  slug,
  description,
  icon,
  color,
  sort_order,
  is_active,
  created_at,
  updated_at
)
select
  w.id,
  d.name,
  d.slug,
  d.description,
  d.icon,
  d.color,
  d.sort_order,
  true,
  timezone('utc', now()),
  timezone('utc', now())
from public.workspaces w
cross join defaults d
where not exists (
  select 1
  from public.email_template_categories c
  where c.workspace_id = w.id
    and c.slug = d.slug
);

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------
drop trigger if exists set_workspace_email_brand_themes_updated_at on public.workspace_email_brand_themes;
create trigger set_workspace_email_brand_themes_updated_at
before update on public.workspace_email_brand_themes
for each row execute function public.set_updated_at();

drop trigger if exists set_workspace_email_unsubscribes_updated_at on public.workspace_email_unsubscribes;
create trigger set_workspace_email_unsubscribes_updated_at
before update on public.workspace_email_unsubscribes
for each row execute function public.set_updated_at();

drop trigger if exists set_email_manual_sends_updated_at on public.email_manual_sends;
create trigger set_email_manual_sends_updated_at
before update on public.email_manual_sends
for each row execute function public.set_updated_at();

drop trigger if exists set_email_manual_send_recipients_updated_at on public.email_manual_send_recipients;
create trigger set_email_manual_send_recipients_updated_at
before update on public.email_manual_send_recipients
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- RLS: all workspace members can configure/send email features in V1
-- ---------------------------------------------------------------------
alter table public.workspace_email_brand_themes enable row level security;
alter table public.workspace_email_unsubscribes enable row level security;
alter table public.email_campaign_recipient_snapshots enable row level security;
alter table public.email_manual_sends enable row level security;
alter table public.email_manual_send_recipients enable row level security;
alter table public.email_send_events enable row level security;

-- Existing tables from previous migrations also move to all-member writes.
alter table public.workspace_email_senders enable row level security;
alter table public.workspace_email_automation_settings enable row level security;
alter table public.workspace_email_sequence_steps enable row level security;
alter table public.record_email_followups enable row level security;
alter table public.record_email_followup_steps enable row level security;
alter table public.email_delivery_events enable row level security;
alter table public.email_oauth_sessions enable row level security;
alter table public.email_template_categories enable row level security;
alter table public.email_templates enable row level security;
alter table public.email_template_assets enable row level security;
alter table public.email_campaigns enable row level security;
alter table public.email_campaign_recipients enable row level security;
alter table public.email_campaign_template_attachments enable row level security;
alter table public.email_campaign_stats enable row level security;

-- Drop policies created in earlier migrations (idempotent).
drop policy if exists "workspace_email_senders_select_member" on public.workspace_email_senders;
drop policy if exists "workspace_email_senders_write_admin" on public.workspace_email_senders;
drop policy if exists "workspace_email_automation_settings_select_member" on public.workspace_email_automation_settings;
drop policy if exists "workspace_email_automation_settings_write_admin" on public.workspace_email_automation_settings;
drop policy if exists "workspace_email_sequence_steps_select_member" on public.workspace_email_sequence_steps;
drop policy if exists "workspace_email_sequence_steps_write_admin" on public.workspace_email_sequence_steps;
drop policy if exists "record_email_followups_select_member" on public.record_email_followups;
drop policy if exists "record_email_followups_write_admin" on public.record_email_followups;
drop policy if exists "record_email_followup_steps_select_member" on public.record_email_followup_steps;
drop policy if exists "record_email_followup_steps_write_admin" on public.record_email_followup_steps;
drop policy if exists "email_delivery_events_select_member" on public.email_delivery_events;
drop policy if exists "email_delivery_events_write_admin" on public.email_delivery_events;
drop policy if exists "email_oauth_sessions_select_admin" on public.email_oauth_sessions;
drop policy if exists "email_oauth_sessions_write_admin" on public.email_oauth_sessions;

drop policy if exists "workspace_members_can_view_own_categories" on public.email_template_categories;
drop policy if exists "workspace_admins_can_manage_categories" on public.email_template_categories;
drop policy if exists "workspace_members_can_view_templates" on public.email_templates;
drop policy if exists "workspace_members_can_create_templates" on public.email_templates;
drop policy if exists "template_creators_can_update_own_custom_templates" on public.email_templates;
drop policy if exists "workspace_members_can_view_assets" on public.email_template_assets;
drop policy if exists "workspace_members_can_upload_assets" on public.email_template_assets;
drop policy if exists "workspace_members_can_view_campaigns" on public.email_campaigns;
drop policy if exists "workspace_members_can_create_campaigns" on public.email_campaigns;
drop policy if exists "campaign_creators_can_update_drafts" on public.email_campaigns;
drop policy if exists "workspace_members_can_view_campaign_recipients" on public.email_campaign_recipients;
drop policy if exists "service_role_can_manage_recipients" on public.email_campaign_recipients;
drop policy if exists "workspace_members_can_view_campaign_stats" on public.email_campaign_stats;

-- Generic all-member policies used by V1 email modules.
create policy "workspace_email_senders_member_all"
on public.workspace_email_senders
for all
to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

create policy "workspace_email_automation_settings_member_all"
on public.workspace_email_automation_settings
for all
to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

create policy "workspace_email_sequence_steps_member_all"
on public.workspace_email_sequence_steps
for all
to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

create policy "record_email_followups_member_all"
on public.record_email_followups
for all
to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

create policy "record_email_followup_steps_member_all"
on public.record_email_followup_steps
for all
to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

create policy "email_delivery_events_member_all"
on public.email_delivery_events
for all
to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

create policy "email_oauth_sessions_member_all"
on public.email_oauth_sessions
for all
to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

create policy "email_template_categories_member_all"
on public.email_template_categories
for all
to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

create policy "email_templates_member_all"
on public.email_templates
for all
to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

create policy "email_template_assets_member_all"
on public.email_template_assets
for all
to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

create policy "email_campaigns_member_all"
on public.email_campaigns
for all
to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

create policy "email_campaign_recipients_member_all"
on public.email_campaign_recipients
for all
to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

create policy "email_campaign_template_attachments_member_all"
on public.email_campaign_template_attachments
for all
to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

create policy "email_campaign_stats_member_all"
on public.email_campaign_stats
for all
to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

create policy "workspace_email_brand_themes_member_all"
on public.workspace_email_brand_themes
for all
to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

create policy "workspace_email_unsubscribes_member_all"
on public.workspace_email_unsubscribes
for all
to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

create policy "email_campaign_recipient_snapshots_member_all"
on public.email_campaign_recipient_snapshots
for all
to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

create policy "email_manual_sends_member_all"
on public.email_manual_sends
for all
to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

create policy "email_manual_send_recipients_member_all"
on public.email_manual_send_recipients
for all
to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

create policy "email_send_events_member_all"
on public.email_send_events
for all
to authenticated
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

grant execute on function public.normalize_email_address(text) to authenticated, service_role;
grant execute on function public.is_workspace_email_suppressed(uuid, text) to authenticated, service_role;

notify pgrst, 'reload schema';
