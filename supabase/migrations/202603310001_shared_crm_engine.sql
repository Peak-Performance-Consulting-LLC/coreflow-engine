create table if not exists public.pipelines (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  entity_type text not null default 'record',
  name text not null check (char_length(trim(name)) >= 2),
  is_default boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (workspace_id, entity_type, name)
);

create unique index if not exists idx_pipelines_default_per_workspace
on public.pipelines(workspace_id, entity_type)
where is_default = true;

create table if not exists public.pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  pipeline_id uuid not null references public.pipelines(id) on delete cascade,
  name text not null check (char_length(trim(name)) >= 2),
  position integer not null check (position >= 0),
  color text,
  is_closed boolean not null default false,
  win_probability integer check (win_probability between 0 and 100),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (workspace_id, pipeline_id, name),
  unique (workspace_id, pipeline_id, position)
);

create table if not exists public.record_sources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(trim(name)) >= 2),
  source_type text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (workspace_id, name)
);

create table if not exists public.records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  record_type text not null default 'lead',
  title text not null check (char_length(trim(title)) >= 2),
  full_name text,
  company_name text,
  email text,
  phone text,
  source_id uuid references public.record_sources(id) on delete set null,
  pipeline_id uuid references public.pipelines(id) on delete set null,
  stage_id uuid references public.pipeline_stages(id) on delete set null,
  assignee_user_id uuid references auth.users(id) on delete set null,
  status text,
  priority text,
  imported_from text,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid references auth.users(id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.record_notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  record_id uuid not null references public.records(id) on delete cascade,
  body text not null check (char_length(trim(body)) >= 1),
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null check (char_length(trim(title)) >= 2),
  description text,
  status text not null default 'open',
  priority text not null default 'medium',
  due_at timestamptz,
  assigned_to uuid references auth.users(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete restrict,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.task_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.record_activities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  record_id uuid not null references public.records(id) on delete cascade,
  activity_type text not null,
  meta jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.custom_field_definitions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  entity_type text not null default 'record',
  industry_type text,
  field_key text not null,
  label text not null,
  field_type text not null,
  is_required boolean not null default false,
  is_system boolean not null default false,
  is_active boolean not null default true,
  position integer not null default 0,
  placeholder text,
  help_text text,
  default_value jsonb,
  options jsonb,
  validation_rules jsonb not null default '{}'::jsonb,
  visibility_rules jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (workspace_id, entity_type, field_key)
);

create table if not exists public.custom_field_values (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  entity_type text not null default 'record',
  entity_id uuid not null,
  field_definition_id uuid not null references public.custom_field_definitions(id) on delete cascade,
  value_text text,
  value_number numeric,
  value_boolean boolean,
  value_date date,
  value_datetime timestamptz,
  value_json jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (entity_type, entity_id, field_definition_id)
);

create table if not exists public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  entity_type text not null default 'record',
  file_name text not null,
  status text not null default 'pending',
  total_rows integer,
  success_rows integer,
  failed_rows integer,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.import_mappings (
  id uuid primary key default gen_random_uuid(),
  import_job_id uuid not null references public.import_jobs(id) on delete cascade,
  source_column text not null,
  target_type text not null,
  target_key text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.import_rows (
  id uuid primary key default gen_random_uuid(),
  import_job_id uuid not null references public.import_jobs(id) on delete cascade,
  row_index integer not null check (row_index >= 0),
  raw_data jsonb not null,
  status text not null default 'pending',
  error_message text,
  created_record_id uuid references public.records(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_pipeline_stages_workspace_pipeline
on public.pipeline_stages(workspace_id, pipeline_id, position);

create index if not exists idx_record_sources_workspace_active
on public.record_sources(workspace_id, is_active);

create index if not exists idx_records_workspace_created_at
on public.records(workspace_id, created_at desc);

create index if not exists idx_records_workspace_pipeline_stage
on public.records(workspace_id, pipeline_id, stage_id);

create index if not exists idx_records_workspace_source
on public.records(workspace_id, source_id);

create index if not exists idx_records_workspace_assignee
on public.records(workspace_id, assignee_user_id);

create index if not exists idx_records_workspace_archived
on public.records(workspace_id, archived_at);

create index if not exists idx_record_notes_workspace_record
on public.record_notes(workspace_id, record_id, created_at desc);

create index if not exists idx_tasks_workspace_status
on public.tasks(workspace_id, status, due_at);

create index if not exists idx_tasks_workspace_assignee
on public.tasks(workspace_id, assigned_to);

create index if not exists idx_task_links_workspace_entity
on public.task_links(workspace_id, entity_type, entity_id);

create index if not exists idx_record_activities_workspace_record
on public.record_activities(workspace_id, record_id, created_at desc);

create index if not exists idx_custom_field_definitions_workspace_entity
on public.custom_field_definitions(workspace_id, entity_type, position);

create index if not exists idx_custom_field_values_workspace_entity
on public.custom_field_values(workspace_id, entity_type, entity_id);

create index if not exists idx_custom_field_values_definition
on public.custom_field_values(field_definition_id);

create index if not exists idx_import_jobs_workspace_status
on public.import_jobs(workspace_id, status, created_at desc);

create index if not exists idx_import_mappings_job
on public.import_mappings(import_job_id);

create index if not exists idx_import_rows_job_status
on public.import_rows(import_job_id, status, row_index);

drop trigger if exists set_pipelines_updated_at on public.pipelines;
create trigger set_pipelines_updated_at
before update on public.pipelines
for each row
execute function public.set_updated_at();

drop trigger if exists set_pipeline_stages_updated_at on public.pipeline_stages;
create trigger set_pipeline_stages_updated_at
before update on public.pipeline_stages
for each row
execute function public.set_updated_at();

drop trigger if exists set_record_sources_updated_at on public.record_sources;
create trigger set_record_sources_updated_at
before update on public.record_sources
for each row
execute function public.set_updated_at();

drop trigger if exists set_records_updated_at on public.records;
create trigger set_records_updated_at
before update on public.records
for each row
execute function public.set_updated_at();

drop trigger if exists set_record_notes_updated_at on public.record_notes;
create trigger set_record_notes_updated_at
before update on public.record_notes
for each row
execute function public.set_updated_at();

drop trigger if exists set_tasks_updated_at on public.tasks;
create trigger set_tasks_updated_at
before update on public.tasks
for each row
execute function public.set_updated_at();

drop trigger if exists set_custom_field_definitions_updated_at on public.custom_field_definitions;
create trigger set_custom_field_definitions_updated_at
before update on public.custom_field_definitions
for each row
execute function public.set_updated_at();

drop trigger if exists set_custom_field_values_updated_at on public.custom_field_values;
create trigger set_custom_field_values_updated_at
before update on public.custom_field_values
for each row
execute function public.set_updated_at();

drop trigger if exists set_import_jobs_updated_at on public.import_jobs;
create trigger set_import_jobs_updated_at
before update on public.import_jobs
for each row
execute function public.set_updated_at();

create or replace function public.is_import_job_member(target_import_job_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.import_jobs ij
    where ij.id = target_import_job_id
      and public.is_workspace_member(ij.workspace_id)
  );
$$;

alter table public.pipelines enable row level security;
alter table public.pipeline_stages enable row level security;
alter table public.record_sources enable row level security;
alter table public.records enable row level security;
alter table public.record_notes enable row level security;
alter table public.tasks enable row level security;
alter table public.task_links enable row level security;
alter table public.record_activities enable row level security;
alter table public.custom_field_definitions enable row level security;
alter table public.custom_field_values enable row level security;
alter table public.import_jobs enable row level security;
alter table public.import_mappings enable row level security;
alter table public.import_rows enable row level security;

drop policy if exists "pipelines_select_member" on public.pipelines;
create policy "pipelines_select_member"
on public.pipelines
for select
using (public.is_workspace_member(workspace_id));

drop policy if exists "pipelines_insert_admin" on public.pipelines;
create policy "pipelines_insert_admin"
on public.pipelines
for insert
with check (public.has_workspace_role(workspace_id, array['owner', 'admin']));

drop policy if exists "pipelines_update_admin" on public.pipelines;
create policy "pipelines_update_admin"
on public.pipelines
for update
using (public.has_workspace_role(workspace_id, array['owner', 'admin']))
with check (public.has_workspace_role(workspace_id, array['owner', 'admin']));

drop policy if exists "pipeline_stages_select_member" on public.pipeline_stages;
create policy "pipeline_stages_select_member"
on public.pipeline_stages
for select
using (public.is_workspace_member(workspace_id));

drop policy if exists "pipeline_stages_insert_admin" on public.pipeline_stages;
create policy "pipeline_stages_insert_admin"
on public.pipeline_stages
for insert
with check (public.has_workspace_role(workspace_id, array['owner', 'admin']));

drop policy if exists "pipeline_stages_update_admin" on public.pipeline_stages;
create policy "pipeline_stages_update_admin"
on public.pipeline_stages
for update
using (public.has_workspace_role(workspace_id, array['owner', 'admin']))
with check (public.has_workspace_role(workspace_id, array['owner', 'admin']));

drop policy if exists "record_sources_select_member" on public.record_sources;
create policy "record_sources_select_member"
on public.record_sources
for select
using (public.is_workspace_member(workspace_id));

drop policy if exists "record_sources_insert_admin" on public.record_sources;
create policy "record_sources_insert_admin"
on public.record_sources
for insert
with check (public.has_workspace_role(workspace_id, array['owner', 'admin']));

drop policy if exists "record_sources_update_admin" on public.record_sources;
create policy "record_sources_update_admin"
on public.record_sources
for update
using (public.has_workspace_role(workspace_id, array['owner', 'admin']))
with check (public.has_workspace_role(workspace_id, array['owner', 'admin']));

drop policy if exists "records_select_member" on public.records;
create policy "records_select_member"
on public.records
for select
using (public.is_workspace_member(workspace_id));

drop policy if exists "records_insert_member" on public.records;
create policy "records_insert_member"
on public.records
for insert
with check (public.is_workspace_member(workspace_id) and created_by = auth.uid());

drop policy if exists "records_update_member" on public.records;
create policy "records_update_member"
on public.records
for update
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists "record_notes_select_member" on public.record_notes;
create policy "record_notes_select_member"
on public.record_notes
for select
using (public.is_workspace_member(workspace_id));

drop policy if exists "record_notes_insert_member" on public.record_notes;
create policy "record_notes_insert_member"
on public.record_notes
for insert
with check (public.is_workspace_member(workspace_id) and created_by = auth.uid());

drop policy if exists "record_notes_update_member" on public.record_notes;
create policy "record_notes_update_member"
on public.record_notes
for update
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists "tasks_select_member" on public.tasks;
create policy "tasks_select_member"
on public.tasks
for select
using (public.is_workspace_member(workspace_id));

drop policy if exists "tasks_insert_member" on public.tasks;
create policy "tasks_insert_member"
on public.tasks
for insert
with check (public.is_workspace_member(workspace_id) and created_by = auth.uid());

drop policy if exists "tasks_update_member" on public.tasks;
create policy "tasks_update_member"
on public.tasks
for update
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists "task_links_select_member" on public.task_links;
create policy "task_links_select_member"
on public.task_links
for select
using (public.is_workspace_member(workspace_id));

drop policy if exists "task_links_insert_member" on public.task_links;
create policy "task_links_insert_member"
on public.task_links
for insert
with check (public.is_workspace_member(workspace_id));

drop policy if exists "record_activities_select_member" on public.record_activities;
create policy "record_activities_select_member"
on public.record_activities
for select
using (public.is_workspace_member(workspace_id));

drop policy if exists "record_activities_insert_member" on public.record_activities;
create policy "record_activities_insert_member"
on public.record_activities
for insert
with check (public.is_workspace_member(workspace_id));

drop policy if exists "custom_field_definitions_select_member" on public.custom_field_definitions;
create policy "custom_field_definitions_select_member"
on public.custom_field_definitions
for select
using (public.is_workspace_member(workspace_id));

drop policy if exists "custom_field_definitions_insert_admin" on public.custom_field_definitions;
create policy "custom_field_definitions_insert_admin"
on public.custom_field_definitions
for insert
with check (public.has_workspace_role(workspace_id, array['owner', 'admin']));

drop policy if exists "custom_field_definitions_update_admin" on public.custom_field_definitions;
create policy "custom_field_definitions_update_admin"
on public.custom_field_definitions
for update
using (public.has_workspace_role(workspace_id, array['owner', 'admin']))
with check (public.has_workspace_role(workspace_id, array['owner', 'admin']));

drop policy if exists "custom_field_values_select_member" on public.custom_field_values;
create policy "custom_field_values_select_member"
on public.custom_field_values
for select
using (public.is_workspace_member(workspace_id));

drop policy if exists "custom_field_values_insert_member" on public.custom_field_values;
create policy "custom_field_values_insert_member"
on public.custom_field_values
for insert
with check (public.is_workspace_member(workspace_id));

drop policy if exists "custom_field_values_update_member" on public.custom_field_values;
create policy "custom_field_values_update_member"
on public.custom_field_values
for update
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists "import_jobs_select_member" on public.import_jobs;
create policy "import_jobs_select_member"
on public.import_jobs
for select
using (public.is_workspace_member(workspace_id));

drop policy if exists "import_jobs_insert_member" on public.import_jobs;
create policy "import_jobs_insert_member"
on public.import_jobs
for insert
with check (public.is_workspace_member(workspace_id) and created_by = auth.uid());

drop policy if exists "import_jobs_update_member" on public.import_jobs;
create policy "import_jobs_update_member"
on public.import_jobs
for update
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists "import_mappings_select_member" on public.import_mappings;
create policy "import_mappings_select_member"
on public.import_mappings
for select
using (public.is_import_job_member(import_job_id));

drop policy if exists "import_mappings_insert_member" on public.import_mappings;
create policy "import_mappings_insert_member"
on public.import_mappings
for insert
with check (public.is_import_job_member(import_job_id));

drop policy if exists "import_rows_select_member" on public.import_rows;
create policy "import_rows_select_member"
on public.import_rows
for select
using (public.is_import_job_member(import_job_id));

drop policy if exists "import_rows_insert_member" on public.import_rows;
create policy "import_rows_insert_member"
on public.import_rows
for insert
with check (public.is_import_job_member(import_job_id));
