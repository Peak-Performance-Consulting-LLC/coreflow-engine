create unique index if not exists idx_record_sources_workspace_id_id
on public.record_sources(workspace_id, id);

update public.voice_agents as va
set source_id = null
where va.source_id is not null
  and not exists (
    select 1
    from public.record_sources as rs
    where rs.workspace_id = va.workspace_id
      and rs.id = va.source_id
  );

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'voice_agents_source_id_fkey'
  ) then
    alter table public.voice_agents
      drop constraint voice_agents_source_id_fkey;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'voice_agents_workspace_source_fkey'
  ) then
    alter table public.voice_agents
      add constraint voice_agents_workspace_source_fkey
      foreign key (workspace_id, source_id)
      references public.record_sources(workspace_id, id)
      on delete set null;
  end if;
end $$;
