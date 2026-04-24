do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'voice_call_artifacts_status_check'
  ) then
    alter table public.voice_call_artifacts
      drop constraint voice_call_artifacts_status_check;
  end if;

  alter table public.voice_call_artifacts
    add constraint voice_call_artifacts_status_check
    check (status in ('pending', 'processing', 'ready', 'failed'));
end $$;
