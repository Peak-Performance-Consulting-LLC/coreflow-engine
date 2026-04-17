create table if not exists public.voice_agents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(trim(name)) >= 2),
  description text,
  status text not null default 'draft',
  greeting text not null check (char_length(trim(greeting)) >= 2),
  system_prompt text not null check (char_length(trim(system_prompt)) >= 2),
  source_id uuid references public.record_sources(id) on delete set null,
  fallback_mode text,
  record_creation_mode text,
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint voice_agents_status_check check (status in ('draft', 'active', 'disabled'))
);

create unique index if not exists idx_voice_agents_workspace_id_id
on public.voice_agents(workspace_id, id);

create index if not exists idx_voice_agents_workspace_id_status_created_at_desc
on public.voice_agents(workspace_id, status, created_at desc);

drop trigger if exists set_voice_agents_updated_at on public.voice_agents;
create trigger set_voice_agents_updated_at
before update on public.voice_agents
for each row
execute function public.set_updated_at();

create table if not exists public.voice_agent_phone_bindings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  voice_agent_id uuid not null,
  workspace_phone_number_id uuid not null,
  is_active boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists idx_voice_agent_phone_bindings_workspace_id_id
on public.voice_agent_phone_bindings(workspace_id, id);

create unique index if not exists idx_voice_agent_phone_bindings_workspace_agent_number_unique
on public.voice_agent_phone_bindings(workspace_id, voice_agent_id, workspace_phone_number_id);

create unique index if not exists idx_voice_agent_phone_bindings_one_active_per_number
on public.voice_agent_phone_bindings(workspace_phone_number_id)
where is_active = true;

create index if not exists idx_voice_agent_phone_bindings_workspace_id_voice_agent_id
on public.voice_agent_phone_bindings(workspace_id, voice_agent_id, created_at desc);

create index if not exists idx_voice_agent_phone_bindings_workspace_phone_number_id
on public.voice_agent_phone_bindings(workspace_phone_number_id, created_at desc);

drop trigger if exists set_voice_agent_phone_bindings_updated_at on public.voice_agent_phone_bindings;
create trigger set_voice_agent_phone_bindings_updated_at
before update on public.voice_agent_phone_bindings
for each row
execute function public.set_updated_at();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'voice_agent_phone_bindings_voice_agent_fkey'
  ) then
    alter table public.voice_agent_phone_bindings
      add constraint voice_agent_phone_bindings_voice_agent_fkey
      foreign key (workspace_id, voice_agent_id)
      references public.voice_agents(workspace_id, id)
      on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'voice_agent_phone_bindings_workspace_phone_number_fkey'
  ) then
    alter table public.voice_agent_phone_bindings
      add constraint voice_agent_phone_bindings_workspace_phone_number_fkey
      foreign key (workspace_id, workspace_phone_number_id)
      references public.workspace_phone_numbers(workspace_id, id)
      on delete cascade;
  end if;
end $$;

create table if not exists public.voice_agent_field_mappings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  voice_agent_id uuid not null,
  source_key text not null check (char_length(trim(source_key)) >= 1),
  source_label text not null check (char_length(trim(source_label)) >= 1),
  source_description text,
  source_value_type text not null default 'string',
  target_type text not null,
  target_key text not null check (char_length(trim(target_key)) >= 1),
  is_required boolean not null default false,
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint voice_agent_field_mappings_target_type_check check (target_type in ('core', 'custom'))
);

create unique index if not exists idx_voice_agent_field_mappings_workspace_id_id
on public.voice_agent_field_mappings(workspace_id, id);

create unique index if not exists idx_voice_agent_field_mappings_source_key_unique
on public.voice_agent_field_mappings(workspace_id, voice_agent_id, source_key);

create unique index if not exists idx_voice_agent_field_mappings_target_unique
on public.voice_agent_field_mappings(workspace_id, voice_agent_id, target_type, target_key);

create index if not exists idx_voice_agent_field_mappings_workspace_id_voice_agent_position
on public.voice_agent_field_mappings(workspace_id, voice_agent_id, position asc);

drop trigger if exists set_voice_agent_field_mappings_updated_at on public.voice_agent_field_mappings;
create trigger set_voice_agent_field_mappings_updated_at
before update on public.voice_agent_field_mappings
for each row
execute function public.set_updated_at();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'voice_agent_field_mappings_voice_agent_fkey'
  ) then
    alter table public.voice_agent_field_mappings
      add constraint voice_agent_field_mappings_voice_agent_fkey
      foreign key (workspace_id, voice_agent_id)
      references public.voice_agents(workspace_id, id)
      on delete cascade;
  end if;
end $$;

alter table public.voice_calls
  add column if not exists voice_agent_id uuid,
  add column if not exists voice_agent_binding_id uuid,
  add column if not exists assistant_mapping_snapshot jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'voice_calls_voice_agent_fkey'
  ) then
    alter table public.voice_calls
      add constraint voice_calls_voice_agent_fkey
      foreign key (workspace_id, voice_agent_id)
      references public.voice_agents(workspace_id, id)
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'voice_calls_voice_agent_binding_fkey'
  ) then
    alter table public.voice_calls
      add constraint voice_calls_voice_agent_binding_fkey
      foreign key (workspace_id, voice_agent_binding_id)
      references public.voice_agent_phone_bindings(workspace_id, id)
      on delete set null;
  end if;
end $$;

create index if not exists idx_voice_calls_workspace_id_voice_agent_id_created_at_desc
on public.voice_calls(workspace_id, voice_agent_id, created_at desc)
where voice_agent_id is not null;

create index if not exists idx_voice_calls_workspace_id_voice_agent_binding_id_created_at_desc
on public.voice_calls(workspace_id, voice_agent_binding_id, created_at desc)
where voice_agent_binding_id is not null;
