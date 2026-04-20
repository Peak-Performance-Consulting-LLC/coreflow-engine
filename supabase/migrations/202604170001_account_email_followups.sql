create table if not exists public.workspace_email_senders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null,
  sender_email text not null,
  sender_name text,
  status text not null default 'pending',
  is_default boolean not null default false,
  is_active boolean not null default true,
  oauth_access_token_encrypted text,
  oauth_refresh_token_encrypted text,
  oauth_token_expires_at timestamptz,
  oauth_scope text,
  smtp_host text,
  smtp_port integer,
  smtp_username text,
  smtp_password_encrypted text,
  smtp_use_tls boolean not null default true,
  health_status text not null default 'unknown',
  last_health_error text,
  connected_at timestamptz,
  last_used_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (workspace_id, provider, sender_email)
);

create unique index if not exists idx_workspace_email_senders_workspace_default_active
on public.workspace_email_senders(workspace_id)
where is_default = true and is_active = true;

create index if not exists idx_workspace_email_senders_workspace_status
on public.workspace_email_senders(workspace_id, status, provider, updated_at desc);

create table if not exists public.workspace_email_automation_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  is_enabled boolean not null default false,
  timezone text not null default 'UTC',
  stop_on_reply boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.workspace_email_sequence_steps (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  step_order integer not null check (step_order >= 1),
  delay_hours integer not null default 0 check (delay_hours >= 0),
  subject_template text not null,
  body_template text not null,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (workspace_id, step_order)
);

create index if not exists idx_workspace_email_sequence_steps_workspace_active
on public.workspace_email_sequence_steps(workspace_id, is_active, step_order asc);

create table if not exists public.record_email_followups (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  record_id uuid not null,
  sender_id uuid references public.workspace_email_senders(id) on delete set null,
  status text not null default 'active',
  stop_reason text,
  enrolled_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz,
  stopped_at timestamptz,
  failed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists idx_record_email_followups_workspace_active_record
on public.record_email_followups(workspace_id, record_id)
where status = 'active';

create index if not exists idx_record_email_followups_workspace_status
on public.record_email_followups(workspace_id, status, enrolled_at desc);

create table if not exists public.record_email_followup_steps (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  followup_id uuid not null references public.record_email_followups(id) on delete cascade,
  sender_id uuid references public.workspace_email_senders(id) on delete set null,
  step_order integer not null check (step_order >= 1),
  status text not null default 'pending',
  scheduled_for timestamptz not null,
  locked_at timestamptz,
  lock_token text,
  claim_expires_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 3 check (max_attempts >= 1),
  next_retry_at timestamptz,
  subject_rendered text not null,
  body_rendered text not null,
  provider_message_id text,
  sent_at timestamptz,
  last_error text,
  last_response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (followup_id, step_order)
);

create index if not exists idx_record_email_followup_steps_workspace_status_schedule
on public.record_email_followup_steps(workspace_id, status, scheduled_for asc);

create index if not exists idx_record_email_followup_steps_workspace_retry
on public.record_email_followup_steps(workspace_id, next_retry_at asc)
where next_retry_at is not null;

create table if not exists public.email_delivery_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  followup_id uuid references public.record_email_followups(id) on delete set null,
  followup_step_id uuid references public.record_email_followup_steps(id) on delete set null,
  sender_id uuid references public.workspace_email_senders(id) on delete set null,
  event_type text not null,
  provider text,
  provider_message_id text,
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  error_text text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_email_delivery_events_workspace_created_at_desc
on public.email_delivery_events(workspace_id, created_at desc);

create table if not exists public.email_oauth_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  state text not null unique,
  code_verifier text not null,
  code_challenge text not null,
  return_path text not null default '/account',
  redirect_uri text not null,
  status text not null default 'pending',
  expires_at timestamptz not null,
  consumed_at timestamptz,
  error_text text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_email_oauth_sessions_workspace_status_expires
on public.email_oauth_sessions(workspace_id, status, expires_at asc);

drop trigger if exists set_workspace_email_senders_updated_at on public.workspace_email_senders;
create trigger set_workspace_email_senders_updated_at
before update on public.workspace_email_senders
for each row execute function public.set_updated_at();

drop trigger if exists set_workspace_email_automation_settings_updated_at on public.workspace_email_automation_settings;
create trigger set_workspace_email_automation_settings_updated_at
before update on public.workspace_email_automation_settings
for each row execute function public.set_updated_at();

drop trigger if exists set_workspace_email_sequence_steps_updated_at on public.workspace_email_sequence_steps;
create trigger set_workspace_email_sequence_steps_updated_at
before update on public.workspace_email_sequence_steps
for each row execute function public.set_updated_at();

drop trigger if exists set_record_email_followups_updated_at on public.record_email_followups;
create trigger set_record_email_followups_updated_at
before update on public.record_email_followups
for each row execute function public.set_updated_at();

drop trigger if exists set_record_email_followup_steps_updated_at on public.record_email_followup_steps;
create trigger set_record_email_followup_steps_updated_at
before update on public.record_email_followup_steps
for each row execute function public.set_updated_at();

drop trigger if exists set_email_oauth_sessions_updated_at on public.email_oauth_sessions;
create trigger set_email_oauth_sessions_updated_at
before update on public.email_oauth_sessions
for each row execute function public.set_updated_at();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'workspace_email_senders_provider_check'
  ) then
    alter table public.workspace_email_senders
      add constraint workspace_email_senders_provider_check
      check (provider in ('google', 'microsoft', 'smtp'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'workspace_email_senders_status_check'
  ) then
    alter table public.workspace_email_senders
      add constraint workspace_email_senders_status_check
      check (status in ('pending', 'connected', 'failed', 'disabled'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'workspace_email_senders_health_status_check'
  ) then
    alter table public.workspace_email_senders
      add constraint workspace_email_senders_health_status_check
      check (health_status in ('unknown', 'healthy', 'degraded', 'failed'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'record_email_followups_status_check'
  ) then
    alter table public.record_email_followups
      add constraint record_email_followups_status_check
      check (status in ('active', 'completed', 'stopped', 'failed'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'record_email_followups_workspace_record_fkey'
  ) then
    alter table public.record_email_followups
      add constraint record_email_followups_workspace_record_fkey
      foreign key (workspace_id, record_id)
      references public.records(workspace_id, id)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'record_email_followup_steps_status_check'
  ) then
    alter table public.record_email_followup_steps
      add constraint record_email_followup_steps_status_check
      check (status in ('pending', 'claimed', 'sending', 'sent', 'failed', 'canceled'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'email_oauth_sessions_provider_check'
  ) then
    alter table public.email_oauth_sessions
      add constraint email_oauth_sessions_provider_check
      check (provider in ('google', 'microsoft'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'email_oauth_sessions_status_check'
  ) then
    alter table public.email_oauth_sessions
      add constraint email_oauth_sessions_status_check
      check (status in ('pending', 'completed', 'failed', 'expired'));
  end if;
end $$;

create or replace function public.ensure_workspace_email_automation_defaults(
  target_workspace_id uuid,
  actor_user_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.workspace_email_automation_settings (
    workspace_id,
    is_enabled,
    timezone,
    stop_on_reply,
    updated_by
  )
  values (
    target_workspace_id,
    false,
    'UTC',
    false,
    actor_user_id
  )
  on conflict (workspace_id) do nothing;

  insert into public.workspace_email_sequence_steps (
    workspace_id,
    step_order,
    delay_hours,
    subject_template,
    body_template,
    is_active,
    created_by,
    updated_by
  )
  values
    (
      target_workspace_id,
      1,
      0,
      'Quick follow-up from {{workspace_name}}',
      'Hi {{lead_full_name}},\n\nThanks for your interest. We wanted to quickly follow up and see how we can help.\n\nBest,\n{{sender_name}}',
      true,
      actor_user_id,
      actor_user_id
    ),
    (
      target_workspace_id,
      2,
      48,
      'Checking in on your request',
      'Hi {{lead_full_name}},\n\nJust checking in regarding your request. If you are available, reply here and we can continue.\n\nBest,\n{{sender_name}}',
      true,
      actor_user_id,
      actor_user_id
    ),
    (
      target_workspace_id,
      3,
      120,
      'Final follow-up',
      'Hi {{lead_full_name}},\n\nThis is a final follow-up from {{workspace_name}}. If timing is not right, no problem. We are here when you are ready.\n\nBest,\n{{sender_name}}',
      true,
      actor_user_id,
      actor_user_id
    )
  on conflict (workspace_id, step_order) do nothing;
end;
$$;

create or replace function public.claim_due_record_email_followup_steps(
  p_limit integer default 25,
  p_now timestamptz default timezone('utc', now())
)
returns setof public.record_email_followup_steps
language plpgsql
security definer
set search_path = public
as $$
declare
  next_limit integer;
begin
  next_limit := greatest(1, least(coalesce(p_limit, 25), 200));

  return query
  with due as (
    select steps.id
    from public.record_email_followup_steps steps
    where steps.status = 'pending'
      and steps.scheduled_for <= p_now
      and (steps.next_retry_at is null or steps.next_retry_at <= p_now)
      and (steps.claim_expires_at is null or steps.claim_expires_at <= p_now)
    order by steps.scheduled_for asc, steps.created_at asc
    limit next_limit
    for update skip locked
  ),
  claimed as (
    update public.record_email_followup_steps steps
    set
      status = 'claimed',
      locked_at = p_now,
      claim_expires_at = p_now + interval '2 minutes',
      lock_token = gen_random_uuid()::text,
      updated_at = timezone('utc', now())
    from due
    where steps.id = due.id
    returning steps.*
  )
  select *
  from claimed;
end;
$$;

alter table public.workspace_email_senders enable row level security;
alter table public.workspace_email_automation_settings enable row level security;
alter table public.workspace_email_sequence_steps enable row level security;
alter table public.record_email_followups enable row level security;
alter table public.record_email_followup_steps enable row level security;
alter table public.email_delivery_events enable row level security;
alter table public.email_oauth_sessions enable row level security;

drop policy if exists "workspace_email_senders_select_member" on public.workspace_email_senders;
create policy "workspace_email_senders_select_member"
on public.workspace_email_senders
for select
using (public.is_workspace_member(workspace_id));

drop policy if exists "workspace_email_senders_write_admin" on public.workspace_email_senders;
create policy "workspace_email_senders_write_admin"
on public.workspace_email_senders
for all
using (public.has_workspace_role(workspace_id, array['owner', 'admin']))
with check (public.has_workspace_role(workspace_id, array['owner', 'admin']));

drop policy if exists "workspace_email_automation_settings_select_member" on public.workspace_email_automation_settings;
create policy "workspace_email_automation_settings_select_member"
on public.workspace_email_automation_settings
for select
using (public.is_workspace_member(workspace_id));

drop policy if exists "workspace_email_automation_settings_write_admin" on public.workspace_email_automation_settings;
create policy "workspace_email_automation_settings_write_admin"
on public.workspace_email_automation_settings
for all
using (public.has_workspace_role(workspace_id, array['owner', 'admin']))
with check (public.has_workspace_role(workspace_id, array['owner', 'admin']));

drop policy if exists "workspace_email_sequence_steps_select_member" on public.workspace_email_sequence_steps;
create policy "workspace_email_sequence_steps_select_member"
on public.workspace_email_sequence_steps
for select
using (public.is_workspace_member(workspace_id));

drop policy if exists "workspace_email_sequence_steps_write_admin" on public.workspace_email_sequence_steps;
create policy "workspace_email_sequence_steps_write_admin"
on public.workspace_email_sequence_steps
for all
using (public.has_workspace_role(workspace_id, array['owner', 'admin']))
with check (public.has_workspace_role(workspace_id, array['owner', 'admin']));

drop policy if exists "record_email_followups_select_member" on public.record_email_followups;
create policy "record_email_followups_select_member"
on public.record_email_followups
for select
using (public.is_workspace_member(workspace_id));

drop policy if exists "record_email_followups_write_admin" on public.record_email_followups;
create policy "record_email_followups_write_admin"
on public.record_email_followups
for all
using (public.has_workspace_role(workspace_id, array['owner', 'admin']))
with check (public.has_workspace_role(workspace_id, array['owner', 'admin']));

drop policy if exists "record_email_followup_steps_select_member" on public.record_email_followup_steps;
create policy "record_email_followup_steps_select_member"
on public.record_email_followup_steps
for select
using (public.is_workspace_member(workspace_id));

drop policy if exists "record_email_followup_steps_write_admin" on public.record_email_followup_steps;
create policy "record_email_followup_steps_write_admin"
on public.record_email_followup_steps
for all
using (public.has_workspace_role(workspace_id, array['owner', 'admin']))
with check (public.has_workspace_role(workspace_id, array['owner', 'admin']));

drop policy if exists "email_delivery_events_select_member" on public.email_delivery_events;
create policy "email_delivery_events_select_member"
on public.email_delivery_events
for select
using (public.is_workspace_member(workspace_id));

drop policy if exists "email_delivery_events_write_admin" on public.email_delivery_events;
create policy "email_delivery_events_write_admin"
on public.email_delivery_events
for all
using (public.has_workspace_role(workspace_id, array['owner', 'admin']))
with check (public.has_workspace_role(workspace_id, array['owner', 'admin']));

drop policy if exists "email_oauth_sessions_select_admin" on public.email_oauth_sessions;
create policy "email_oauth_sessions_select_admin"
on public.email_oauth_sessions
for select
using (public.has_workspace_role(workspace_id, array['owner', 'admin']));

drop policy if exists "email_oauth_sessions_write_admin" on public.email_oauth_sessions;
create policy "email_oauth_sessions_write_admin"
on public.email_oauth_sessions
for all
using (public.has_workspace_role(workspace_id, array['owner', 'admin']))
with check (public.has_workspace_role(workspace_id, array['owner', 'admin']));
