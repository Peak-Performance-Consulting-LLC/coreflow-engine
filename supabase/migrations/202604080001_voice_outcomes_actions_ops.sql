alter table public.voice_calls
  add column if not exists runtime_mode text not null default 'phase1_default',
  add column if not exists gather_status text not null default 'not_started',
  add column if not exists provider_gather_status text,
  add column if not exists outcome_status text,
  add column if not exists outcome_reason text,
  add column if not exists outcome_error text,
  add column if not exists review_status text not null default 'not_needed',
  add column if not exists review_opened_at timestamptz,
  add column if not exists review_resolved_at timestamptz,
  add column if not exists review_owner_user_id uuid references auth.users(id) on delete set null;

update public.voice_calls
set
  runtime_mode = case
    when voice_agent_id is not null or assistant_mapping_snapshot is not null then 'assistant'
    else 'phase1_default'
  end,
  gather_status = case
    when gather_completed_at is not null and coalesce(jsonb_typeof(gather_result), '') = 'object'
      and exists (
        select 1
        from jsonb_each(coalesce(gather_result, '{}'::jsonb))
      ) then 'completed'
    when gather_completed_at is not null then 'incomplete'
    when status = 'gathering' then 'in_progress'
    else coalesce(gather_status, 'not_started')
  end,
  provider_gather_status = coalesce(provider_gather_status, gather_result ->> 'status'),
  outcome_status = case
    when lead_creation_status = 'created' or record_id is not null then 'lead_created'
    when lead_creation_status = 'failed' then 'crm_failed'
    when status = 'ended' and record_id is null then 'ended_without_lead'
    else outcome_status
  end,
  review_status = case
    when coalesce(outcome_status, case
      when lead_creation_status = 'created' or record_id is not null then 'lead_created'
      when lead_creation_status = 'failed' then 'crm_failed'
      when status = 'ended' and record_id is null then 'ended_without_lead'
      else null
    end) in ('crm_failed', 'gather_incomplete', 'mapping_failed', 'ended_without_lead', 'review_needed')
      then 'open'
    else coalesce(review_status, 'not_needed')
  end,
  review_opened_at = case
    when coalesce(outcome_status, case
      when lead_creation_status = 'created' or record_id is not null then 'lead_created'
      when lead_creation_status = 'failed' then 'crm_failed'
      when status = 'ended' and record_id is null then 'ended_without_lead'
      else null
    end) in ('crm_failed', 'gather_incomplete', 'mapping_failed', 'ended_without_lead', 'review_needed')
      then coalesce(review_opened_at, updated_at, created_at)
    else review_opened_at
  end,
  review_resolved_at = case
    when coalesce(outcome_status, case
      when lead_creation_status = 'created' or record_id is not null then 'lead_created'
      when lead_creation_status = 'failed' then 'crm_failed'
      when status = 'ended' and record_id is null then 'ended_without_lead'
      else null
    end) = 'lead_created'
      then coalesce(review_resolved_at, lead_created_at, updated_at, created_at)
    else review_resolved_at
  end
where true;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'voice_calls_runtime_mode_check'
  ) then
    alter table public.voice_calls
      add constraint voice_calls_runtime_mode_check
      check (runtime_mode in ('assistant', 'phase1_default', 'phase1_fallback'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'voice_calls_gather_status_check'
  ) then
    alter table public.voice_calls
      add constraint voice_calls_gather_status_check
      check (gather_status in ('not_started', 'in_progress', 'completed', 'incomplete', 'failed'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'voice_calls_outcome_status_check'
  ) then
    alter table public.voice_calls
      add constraint voice_calls_outcome_status_check
      check (
        outcome_status is null
        or outcome_status in ('lead_created', 'crm_failed', 'gather_incomplete', 'mapping_failed', 'ended_without_lead', 'review_needed')
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'voice_calls_review_status_check'
  ) then
    alter table public.voice_calls
      add constraint voice_calls_review_status_check
      check (review_status in ('not_needed', 'open', 'resolved', 'dismissed'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'voice_calls_review_timestamps_check'
  ) then
    alter table public.voice_calls
      add constraint voice_calls_review_timestamps_check
      check (
        review_resolved_at is null
        or review_opened_at is null
        or review_resolved_at >= review_opened_at
      );
  end if;
end $$;

create index if not exists idx_voice_calls_workspace_id_outcome_status_created_at_desc
on public.voice_calls(workspace_id, outcome_status, created_at desc)
where outcome_status is not null;

create index if not exists idx_voice_calls_workspace_id_review_status_created_at_desc
on public.voice_calls(workspace_id, review_status, created_at desc);

create index if not exists idx_voice_calls_workspace_id_review_owner_user_id_created_at_desc
on public.voice_calls(workspace_id, review_owner_user_id, created_at desc)
where review_owner_user_id is not null;

create index if not exists idx_voice_calls_workspace_id_record_id_created_at_desc
on public.voice_calls(workspace_id, record_id, created_at desc)
where record_id is not null;

create table if not exists public.voice_action_policies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  voice_agent_id uuid,
  outcome_status text not null,
  action_type text not null,
  is_enabled boolean not null default true,
  position integer not null default 0 check (position >= 0),
  action_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists idx_voice_action_policies_workspace_id_id
on public.voice_action_policies(workspace_id, id);

create index if not exists idx_voice_action_policies_workspace_id_outcome_position
on public.voice_action_policies(workspace_id, outcome_status, position asc, created_at asc);

create index if not exists idx_voice_action_policies_workspace_id_voice_agent_outcome
on public.voice_action_policies(workspace_id, voice_agent_id, outcome_status, position asc);

drop trigger if exists set_voice_action_policies_updated_at on public.voice_action_policies;
create trigger set_voice_action_policies_updated_at
before update on public.voice_action_policies
for each row
execute function public.set_updated_at();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'voice_action_policies_outcome_status_check'
  ) then
    alter table public.voice_action_policies
      add constraint voice_action_policies_outcome_status_check
      check (outcome_status in ('lead_created', 'crm_failed', 'gather_incomplete', 'mapping_failed', 'ended_without_lead', 'review_needed'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'voice_action_policies_action_type_check'
  ) then
    alter table public.voice_action_policies
      add constraint voice_action_policies_action_type_check
      check (action_type in ('open_review', 'create_record_note', 'create_record_task', 'assign_record_owner', 'move_record_stage', 'update_record_status', 'schedule_callback'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'voice_action_policies_workspace_voice_agent_fkey'
  ) then
    alter table public.voice_action_policies
      add constraint voice_action_policies_workspace_voice_agent_fkey
      foreign key (workspace_id, voice_agent_id)
      references public.voice_agents(workspace_id, id)
      on delete cascade;
  end if;
end $$;

create table if not exists public.voice_call_action_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  voice_call_id uuid not null,
  policy_id uuid,
  action_type text not null,
  trigger_outcome_status text not null,
  status text not null default 'pending',
  target_record_id uuid,
  task_id uuid,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_retry_at timestamptz,
  last_error text,
  request_payload jsonb not null default '{}'::jsonb,
  result_payload jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists idx_voice_call_action_runs_workspace_id_id
on public.voice_call_action_runs(workspace_id, id);

create index if not exists idx_voice_call_action_runs_workspace_id_voice_call_created_at_desc
on public.voice_call_action_runs(workspace_id, voice_call_id, created_at desc);

create index if not exists idx_voice_call_action_runs_workspace_id_status_next_retry_at
on public.voice_call_action_runs(workspace_id, status, next_retry_at asc, created_at asc);

create index if not exists idx_voice_call_action_runs_workspace_id_target_record_id_created_at_desc
on public.voice_call_action_runs(workspace_id, target_record_id, created_at desc)
where target_record_id is not null;

drop trigger if exists set_voice_call_action_runs_updated_at on public.voice_call_action_runs;
create trigger set_voice_call_action_runs_updated_at
before update on public.voice_call_action_runs
for each row
execute function public.set_updated_at();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'voice_call_action_runs_workspace_voice_call_fkey'
  ) then
    alter table public.voice_call_action_runs
      add constraint voice_call_action_runs_workspace_voice_call_fkey
      foreign key (workspace_id, voice_call_id)
      references public.voice_calls(workspace_id, id)
      on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'voice_call_action_runs_workspace_policy_fkey'
  ) then
    alter table public.voice_call_action_runs
      add constraint voice_call_action_runs_workspace_policy_fkey
      foreign key (workspace_id, policy_id)
      references public.voice_action_policies(workspace_id, id)
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'voice_call_action_runs_workspace_record_fkey'
  ) then
    alter table public.voice_call_action_runs
      add constraint voice_call_action_runs_workspace_record_fkey
      foreign key (workspace_id, target_record_id)
      references public.records(workspace_id, id)
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'voice_call_action_runs_workspace_task_fkey'
  ) then
    alter table public.voice_call_action_runs
      add constraint voice_call_action_runs_workspace_task_fkey
      foreign key (workspace_id, task_id)
      references public.tasks(workspace_id, id)
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'voice_call_action_runs_action_type_check'
  ) then
    alter table public.voice_call_action_runs
      add constraint voice_call_action_runs_action_type_check
      check (action_type in ('open_review', 'create_record_note', 'create_record_task', 'assign_record_owner', 'move_record_stage', 'update_record_status', 'schedule_callback'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'voice_call_action_runs_trigger_outcome_status_check'
  ) then
    alter table public.voice_call_action_runs
      add constraint voice_call_action_runs_trigger_outcome_status_check
      check (trigger_outcome_status in ('lead_created', 'crm_failed', 'gather_incomplete', 'mapping_failed', 'ended_without_lead', 'review_needed'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'voice_call_action_runs_status_check'
  ) then
    alter table public.voice_call_action_runs
      add constraint voice_call_action_runs_status_check
      check (status in ('pending', 'running', 'completed', 'failed', 'canceled'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'voice_call_action_runs_finished_after_started_check'
  ) then
    alter table public.voice_call_action_runs
      add constraint voice_call_action_runs_finished_after_started_check
      check (
        finished_at is null
        or started_at is null
        or finished_at >= started_at
      );
  end if;
end $$;

create table if not exists public.voice_call_artifacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  voice_call_id uuid not null,
  artifact_type text not null,
  status text not null default 'pending',
  source text,
  content_text text,
  content_json jsonb not null default '{}'::jsonb,
  model text,
  error_text text,
  generated_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists idx_voice_call_artifacts_workspace_id_id
on public.voice_call_artifacts(workspace_id, id);

create index if not exists idx_voice_call_artifacts_workspace_id_voice_call_type_created_at_desc
on public.voice_call_artifacts(workspace_id, voice_call_id, artifact_type, created_at desc);

create unique index if not exists idx_voice_call_artifacts_workspace_id_voice_call_type_unique
on public.voice_call_artifacts(workspace_id, voice_call_id, artifact_type);

drop trigger if exists set_voice_call_artifacts_updated_at on public.voice_call_artifacts;
create trigger set_voice_call_artifacts_updated_at
before update on public.voice_call_artifacts
for each row
execute function public.set_updated_at();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'voice_call_artifacts_workspace_voice_call_fkey'
  ) then
    alter table public.voice_call_artifacts
      add constraint voice_call_artifacts_workspace_voice_call_fkey
      foreign key (workspace_id, voice_call_id)
      references public.voice_calls(workspace_id, id)
      on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'voice_call_artifacts_artifact_type_check'
  ) then
    alter table public.voice_call_artifacts
      add constraint voice_call_artifacts_artifact_type_check
      check (artifact_type in ('summary', 'disposition', 'follow_up_recommendation', 'transcript'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'voice_call_artifacts_status_check'
  ) then
    alter table public.voice_call_artifacts
      add constraint voice_call_artifacts_status_check
      check (status in ('pending', 'ready', 'failed'));
  end if;
end $$;
