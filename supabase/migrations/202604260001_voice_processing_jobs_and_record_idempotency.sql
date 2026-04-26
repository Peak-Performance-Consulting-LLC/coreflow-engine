alter table public.records
  add column if not exists external_source text,
  add column if not exists external_key text;

create unique index if not exists idx_records_workspace_external_unique
on public.records(workspace_id, external_source, external_key)
where external_source is not null and external_key is not null;

create index if not exists idx_records_workspace_external_lookup
on public.records(workspace_id, external_source, external_key);

create table if not exists public.voice_processing_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  voice_call_id uuid,
  action_run_id uuid,
  job_type text not null,
  status text not null default 'pending',
  idempotency_key text not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 6 check (max_attempts >= 1),
  available_at timestamptz not null default timezone('utc', now()),
  claimed_at timestamptz,
  claim_expires_at timestamptz,
  lock_token text,
  last_error text,
  payload jsonb not null default '{}'::jsonb,
  result_payload jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists idx_voice_processing_jobs_workspace_idempotency
on public.voice_processing_jobs(workspace_id, idempotency_key);

create index if not exists idx_voice_processing_jobs_due
on public.voice_processing_jobs(status, available_at asc, created_at asc)
where status = 'pending';

create index if not exists idx_voice_processing_jobs_workspace_voice_call_created_at_desc
on public.voice_processing_jobs(workspace_id, voice_call_id, created_at desc)
where voice_call_id is not null;

create index if not exists idx_voice_processing_jobs_workspace_action_run_created_at_desc
on public.voice_processing_jobs(workspace_id, action_run_id, created_at desc)
where action_run_id is not null;

drop trigger if exists set_voice_processing_jobs_updated_at on public.voice_processing_jobs;
create trigger set_voice_processing_jobs_updated_at
before update on public.voice_processing_jobs
for each row
execute function public.set_updated_at();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'voice_processing_jobs_workspace_voice_call_fkey'
  ) then
    alter table public.voice_processing_jobs
      add constraint voice_processing_jobs_workspace_voice_call_fkey
      foreign key (workspace_id, voice_call_id)
      references public.voice_calls(workspace_id, id)
      on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'voice_processing_jobs_workspace_action_run_fkey'
  ) then
    alter table public.voice_processing_jobs
      add constraint voice_processing_jobs_workspace_action_run_fkey
      foreign key (workspace_id, action_run_id)
      references public.voice_call_action_runs(workspace_id, id)
      on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'voice_processing_jobs_job_type_check'
  ) then
    alter table public.voice_processing_jobs
      add constraint voice_processing_jobs_job_type_check
      check (job_type in ('post_call_pipeline', 'generate_summary', 'execute_action_run'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'voice_processing_jobs_status_check'
  ) then
    alter table public.voice_processing_jobs
      add constraint voice_processing_jobs_status_check
      check (status in ('pending', 'claimed', 'running', 'completed', 'dead_letter', 'canceled'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'voice_processing_jobs_finished_after_started_check'
  ) then
    alter table public.voice_processing_jobs
      add constraint voice_processing_jobs_finished_after_started_check
      check (
        finished_at is null
        or started_at is null
        or finished_at >= started_at
      );
  end if;
end $$;

create or replace function public.claim_due_voice_processing_jobs(
  p_limit integer default 10,
  p_now timestamptz default timezone('utc', now())
)
returns setof public.voice_processing_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  next_limit integer;
begin
  next_limit := greatest(1, least(coalesce(p_limit, 10), 100));

  return query
  with due as (
    select jobs.id
    from public.voice_processing_jobs jobs
    where jobs.status = 'pending'
      and jobs.available_at <= p_now
      and (jobs.claim_expires_at is null or jobs.claim_expires_at <= p_now)
    order by jobs.available_at asc, jobs.created_at asc
    limit next_limit
    for update skip locked
  ),
  claimed as (
    update public.voice_processing_jobs jobs
    set
      status = 'claimed',
      claimed_at = p_now,
      claim_expires_at = p_now + interval '2 minutes',
      lock_token = gen_random_uuid()::text,
      updated_at = timezone('utc', now())
    from due
    where jobs.id = due.id
    returning jobs.*
  )
  select *
  from claimed;
end;
$$;

alter table public.voice_processing_jobs enable row level security;

drop policy if exists "voice_processing_jobs_select_member" on public.voice_processing_jobs;
create policy "voice_processing_jobs_select_member"
on public.voice_processing_jobs
for select
using (public.is_workspace_member(workspace_id));

drop policy if exists "voice_processing_jobs_write_admin" on public.voice_processing_jobs;
create policy "voice_processing_jobs_write_admin"
on public.voice_processing_jobs
for all
using (public.has_workspace_role(workspace_id, array['owner', 'admin']))
with check (public.has_workspace_role(workspace_id, array['owner', 'admin']));
