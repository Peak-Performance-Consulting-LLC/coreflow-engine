create table if not exists public.workspace_phone_numbers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null default 'telnyx',
  phone_number_e164 text not null unique,
  provider_phone_number_id text,
  is_active boolean not null default true,
  voice_mode text not null default 'ai_lead_capture',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint workspace_phone_numbers_provider_check
    check (provider = 'telnyx'),
  constraint workspace_phone_numbers_voice_mode_check
    check (voice_mode in ('ai_lead_capture')),
  constraint workspace_phone_numbers_phone_number_e164_check
    check (phone_number_e164 ~ '^\+[1-9][0-9]{1,14}$')
);

create unique index if not exists idx_workspace_phone_numbers_workspace_id_id
on public.workspace_phone_numbers(workspace_id, id);

create unique index if not exists idx_workspace_phone_numbers_provider_phone_number_id_unique
on public.workspace_phone_numbers(provider_phone_number_id)
where provider_phone_number_id is not null;

create index if not exists idx_workspace_phone_numbers_workspace_id_is_active
on public.workspace_phone_numbers(workspace_id, is_active);

drop trigger if exists set_workspace_phone_numbers_updated_at on public.workspace_phone_numbers;
create trigger set_workspace_phone_numbers_updated_at
before update on public.workspace_phone_numbers
for each row
execute function public.set_updated_at();

create table if not exists public.voice_calls (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  workspace_phone_number_id uuid not null,
  provider text not null default 'telnyx',
  direction text not null default 'inbound',
  provider_call_control_id text not null,
  provider_call_leg_id text,
  provider_call_session_id text,
  provider_connection_id text,
  from_number_e164 text not null,
  to_number_e164 text not null,
  status text not null default 'initiated',
  lead_creation_status text not null default 'pending',
  gather_result jsonb,
  message_history jsonb,
  record_id uuid,
  answered_at timestamptz,
  gather_completed_at timestamptz,
  lead_created_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint voice_calls_workspace_phone_number_fkey
    foreign key (workspace_id, workspace_phone_number_id)
    references public.workspace_phone_numbers(workspace_id, id)
    on delete restrict,
  constraint voice_calls_record_fkey
    foreign key (workspace_id, record_id)
    references public.records(workspace_id, id)
    on delete restrict,
  constraint voice_calls_provider_call_control_unique
    unique (provider, provider_call_control_id),
  constraint voice_calls_provider_check
    check (provider = 'telnyx'),
  constraint voice_calls_direction_check
    check (direction = 'inbound'),
  constraint voice_calls_status_check
    check (status in ('initiated', 'answered', 'gathering', 'lead_created', 'ended', 'failed')),
  constraint voice_calls_lead_creation_status_check
    check (lead_creation_status in ('pending', 'created', 'failed')),
  constraint voice_calls_from_number_e164_check
    check (from_number_e164 ~ '^\+[1-9][0-9]{1,14}$'),
  constraint voice_calls_to_number_e164_check
    check (to_number_e164 ~ '^\+[1-9][0-9]{1,14}$'),
  constraint voice_calls_created_lead_requires_record_check
    check (lead_creation_status <> 'created' or record_id is not null),
  constraint voice_calls_answered_before_end_check
    check (
      ended_at is null
      or answered_at is null
      or ended_at >= answered_at
    ),
  constraint voice_calls_gather_after_answer_check
    check (
      gather_completed_at is null
      or answered_at is null
      or gather_completed_at >= answered_at
    )
);

create unique index if not exists idx_voice_calls_workspace_id_id
on public.voice_calls(workspace_id, id);

create index if not exists idx_voice_calls_workspace_id_created_at_desc
on public.voice_calls(workspace_id, created_at desc);

create index if not exists idx_voice_calls_workspace_id_status_created_at_desc
on public.voice_calls(workspace_id, status, created_at desc);

create index if not exists idx_voice_calls_workspace_id_lead_creation_status_created_at_desc
on public.voice_calls(workspace_id, lead_creation_status, created_at desc);

create index if not exists idx_voice_calls_workspace_phone_number_id_created_at_desc
on public.voice_calls(workspace_phone_number_id, created_at desc);

create index if not exists idx_voice_calls_provider_call_session_id
on public.voice_calls(provider_call_session_id)
where provider_call_session_id is not null;

drop trigger if exists set_voice_calls_updated_at on public.voice_calls;
create trigger set_voice_calls_updated_at
before update on public.voice_calls
for each row
execute function public.set_updated_at();

create table if not exists public.voice_call_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  voice_call_id uuid,
  provider text not null default 'telnyx',
  provider_event_id text not null,
  event_type text not null,
  occurred_at timestamptz not null,
  processing_status text not null default 'pending',
  signature_valid boolean not null default false,
  payload jsonb not null,
  processing_error text,
  processed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  constraint voice_call_events_voice_call_fkey
    foreign key (workspace_id, voice_call_id)
    references public.voice_calls(workspace_id, id)
    on delete restrict,
  constraint voice_call_events_provider_event_unique
    unique (provider, provider_event_id),
  constraint voice_call_events_provider_check
    check (provider = 'telnyx'),
  constraint voice_call_events_processing_status_check
    check (processing_status in ('pending', 'processed', 'ignored', 'failed'))
);

create index if not exists idx_voice_call_events_workspace_id_occurred_at_desc
on public.voice_call_events(workspace_id, occurred_at desc);

create index if not exists idx_voice_call_events_workspace_id_event_type_occurred_at_desc
on public.voice_call_events(workspace_id, event_type, occurred_at desc);

create index if not exists idx_voice_call_events_voice_call_id_occurred_at_desc
on public.voice_call_events(voice_call_id, occurred_at desc)
where voice_call_id is not null;

create index if not exists idx_voice_call_events_processing_status_created_at_asc
on public.voice_call_events(processing_status, created_at asc);
