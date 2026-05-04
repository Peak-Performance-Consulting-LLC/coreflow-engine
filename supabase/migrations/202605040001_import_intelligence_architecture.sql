-- Import intelligence architecture: semantic mapping, profiles, and governed field onboarding.

create table if not exists public.field_semantics (
  id uuid primary key default gen_random_uuid(),
  semantic_key text not null unique,
  label text not null,
  description text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.field_aliases (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  crm_type text,
  semantic_id uuid not null references public.field_semantics(id) on delete cascade,
  alias_text text not null,
  weight numeric not null default 1.0 check (weight > 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (workspace_id, crm_type, semantic_id, alias_text)
);

create table if not exists public.semantic_bindings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  crm_type text,
  semantic_id uuid not null references public.field_semantics(id) on delete cascade,
  target_type text not null check (target_type in ('core', 'custom')),
  target_key text not null,
  is_required boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (workspace_id, crm_type, semantic_id)
);

create table if not exists public.import_profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  crm_type text not null,
  source_fingerprint text not null,
  profile_name text not null,
  is_default boolean not null default false,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists idx_import_profiles_default
on public.import_profiles(workspace_id, crm_type, source_fingerprint)
where is_default = true;

create table if not exists public.import_profile_mappings (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.import_profiles(id) on delete cascade,
  source_column text not null,
  semantic_id uuid references public.field_semantics(id) on delete set null,
  target_type text not null check (target_type in ('core', 'custom')),
  target_key text not null,
  confidence numeric,
  created_at timestamptz not null default timezone('utc', now()),
  unique (profile_id, source_column)
);

create table if not exists public.value_transform_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  crm_type text,
  target_type text not null check (target_type in ('core', 'custom')),
  target_key text not null,
  rule_type text not null check (rule_type in ('date', 'number', 'boolean', 'enum', 'phone', 'currency')),
  rule_config jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.option_aliases (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  crm_type text,
  field_key text not null,
  alias_value text not null,
  canonical_value text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (workspace_id, crm_type, field_key, alias_value)
);

alter table public.import_jobs
  add column if not exists phase text not null default 'ingest',
  add column if not exists source_fingerprint text,
  add column if not exists profile_id uuid references public.import_profiles(id) on delete set null,
  add column if not exists approval_status text not null default 'approved',
  add column if not exists stats_json jsonb not null default '{}'::jsonb;

alter table public.import_mappings
  add column if not exists semantic_id uuid references public.field_semantics(id) on delete set null,
  add column if not exists confidence numeric,
  add column if not exists mapping_source text not null default 'manual',
  add column if not exists status text not null default 'confirmed',
  add column if not exists notes text;

alter table public.import_rows
  add column if not exists transformed_data jsonb,
  add column if not exists validation_errors jsonb,
  add column if not exists lineage jsonb;

create index if not exists idx_field_aliases_lookup
on public.field_aliases(workspace_id, crm_type, alias_text);

create index if not exists idx_semantic_bindings_lookup
on public.semantic_bindings(workspace_id, crm_type, semantic_id);

create index if not exists idx_import_profile_mappings_profile
on public.import_profile_mappings(profile_id);

create index if not exists idx_value_transform_rules_lookup
on public.value_transform_rules(workspace_id, crm_type, target_type, target_key);

create index if not exists idx_option_aliases_lookup
on public.option_aliases(workspace_id, crm_type, field_key, alias_value);

create index if not exists idx_import_jobs_phase
on public.import_jobs(workspace_id, phase, created_at desc);

create index if not exists idx_import_rows_job_idx
on public.import_rows(import_job_id, row_index);

create index if not exists idx_import_rows_status
on public.import_rows(import_job_id, status);

drop trigger if exists set_field_semantics_updated_at on public.field_semantics;
create trigger set_field_semantics_updated_at
before update on public.field_semantics
for each row
execute function public.set_updated_at();

drop trigger if exists set_field_aliases_updated_at on public.field_aliases;
create trigger set_field_aliases_updated_at
before update on public.field_aliases
for each row
execute function public.set_updated_at();

drop trigger if exists set_semantic_bindings_updated_at on public.semantic_bindings;
create trigger set_semantic_bindings_updated_at
before update on public.semantic_bindings
for each row
execute function public.set_updated_at();

drop trigger if exists set_import_profiles_updated_at on public.import_profiles;
create trigger set_import_profiles_updated_at
before update on public.import_profiles
for each row
execute function public.set_updated_at();

drop trigger if exists set_value_transform_rules_updated_at on public.value_transform_rules;
create trigger set_value_transform_rules_updated_at
before update on public.value_transform_rules
for each row
execute function public.set_updated_at();

drop trigger if exists set_option_aliases_updated_at on public.option_aliases;
create trigger set_option_aliases_updated_at
before update on public.option_aliases
for each row
execute function public.set_updated_at();

create or replace function public.is_import_profile_member(target_profile_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.import_profiles p
    where p.id = target_profile_id
      and public.is_workspace_member(p.workspace_id)
  );
$$;

alter table public.field_semantics enable row level security;
alter table public.field_aliases enable row level security;
alter table public.semantic_bindings enable row level security;
alter table public.import_profiles enable row level security;
alter table public.import_profile_mappings enable row level security;
alter table public.value_transform_rules enable row level security;
alter table public.option_aliases enable row level security;

drop policy if exists "field_semantics_select_authenticated" on public.field_semantics;
create policy "field_semantics_select_authenticated"
on public.field_semantics
for select
to authenticated
using (true);

drop policy if exists "field_aliases_select_member" on public.field_aliases;
create policy "field_aliases_select_member"
on public.field_aliases
for select
using (workspace_id is null or public.is_workspace_member(workspace_id));

drop policy if exists "field_aliases_write_owner" on public.field_aliases;
create policy "field_aliases_write_owner"
on public.field_aliases
for all
to authenticated
using (workspace_id is null or public.has_workspace_role(workspace_id, array['owner']))
with check (workspace_id is null or public.has_workspace_role(workspace_id, array['owner']));

drop policy if exists "semantic_bindings_select_member" on public.semantic_bindings;
create policy "semantic_bindings_select_member"
on public.semantic_bindings
for select
using (workspace_id is null or public.is_workspace_member(workspace_id));

drop policy if exists "semantic_bindings_write_owner" on public.semantic_bindings;
create policy "semantic_bindings_write_owner"
on public.semantic_bindings
for all
to authenticated
using (workspace_id is null or public.has_workspace_role(workspace_id, array['owner']))
with check (workspace_id is null or public.has_workspace_role(workspace_id, array['owner']));

drop policy if exists "import_profiles_select_member" on public.import_profiles;
create policy "import_profiles_select_member"
on public.import_profiles
for select
using (public.is_workspace_member(workspace_id));

drop policy if exists "import_profiles_insert_member" on public.import_profiles;
create policy "import_profiles_insert_member"
on public.import_profiles
for insert
with check (public.is_workspace_member(workspace_id) and created_by = auth.uid());

drop policy if exists "import_profiles_update_member" on public.import_profiles;
create policy "import_profiles_update_member"
on public.import_profiles
for update
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists "import_profile_mappings_select_member" on public.import_profile_mappings;
create policy "import_profile_mappings_select_member"
on public.import_profile_mappings
for select
using (public.is_import_profile_member(profile_id));

drop policy if exists "import_profile_mappings_insert_member" on public.import_profile_mappings;
create policy "import_profile_mappings_insert_member"
on public.import_profile_mappings
for insert
with check (public.is_import_profile_member(profile_id));

drop policy if exists "import_profile_mappings_update_member" on public.import_profile_mappings;
create policy "import_profile_mappings_update_member"
on public.import_profile_mappings
for update
using (public.is_import_profile_member(profile_id))
with check (public.is_import_profile_member(profile_id));

drop policy if exists "value_transform_rules_select_member" on public.value_transform_rules;
create policy "value_transform_rules_select_member"
on public.value_transform_rules
for select
using (workspace_id is null or public.is_workspace_member(workspace_id));

drop policy if exists "value_transform_rules_write_owner" on public.value_transform_rules;
create policy "value_transform_rules_write_owner"
on public.value_transform_rules
for all
to authenticated
using (workspace_id is null or public.has_workspace_role(workspace_id, array['owner']))
with check (workspace_id is null or public.has_workspace_role(workspace_id, array['owner']));

drop policy if exists "option_aliases_select_member" on public.option_aliases;
create policy "option_aliases_select_member"
on public.option_aliases
for select
using (workspace_id is null or public.is_workspace_member(workspace_id));

drop policy if exists "option_aliases_write_owner" on public.option_aliases;
create policy "option_aliases_write_owner"
on public.option_aliases
for all
to authenticated
using (workspace_id is null or public.has_workspace_role(workspace_id, array['owner']))
with check (workspace_id is null or public.has_workspace_role(workspace_id, array['owner']));

insert into public.field_semantics (semantic_key, label, description)
values
  ('title', 'Title', 'Primary record title'),
  ('full_name', 'Full Name', 'Primary contact full name'),
  ('company_name', 'Company Name', 'Company or organization name'),
  ('email', 'Email', 'Primary email address'),
  ('phone', 'Phone', 'Primary phone number'),
  ('status', 'Status', 'Record lifecycle status'),
  ('priority', 'Priority', 'Record urgency/priority')
on conflict (semantic_key) do nothing;

notify pgrst, 'reload schema';
