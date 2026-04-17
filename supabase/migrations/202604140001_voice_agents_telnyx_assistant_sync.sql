alter table public.voice_agents
  add column if not exists telnyx_assistant_id text,
  add column if not exists telnyx_sync_status text not null default 'pending',
  add column if not exists telnyx_sync_error text,
  add column if not exists telnyx_last_synced_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'voice_agents_telnyx_sync_status_check'
  ) then
    alter table public.voice_agents
      add constraint voice_agents_telnyx_sync_status_check
      check (telnyx_sync_status in ('pending', 'synced', 'failed'));
  end if;
end $$;

create unique index if not exists idx_voice_agents_telnyx_assistant_id_unique
on public.voice_agents(telnyx_assistant_id)
where telnyx_assistant_id is not null;
