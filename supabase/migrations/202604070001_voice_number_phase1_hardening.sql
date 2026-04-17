alter table public.workspace_phone_numbers
  add column if not exists provisioning_locked_at timestamptz,
  add column if not exists last_webhook_observed_at timestamptz;

update public.workspace_phone_numbers
set
  is_active = false,
  provisioning_locked_at = null
where
  provisioning_status = 'released'
  or released_at is not null
  or provisioning_status <> 'active'
  or webhook_status <> 'ready';

update public.workspace_phone_numbers as numbers
set last_webhook_observed_at = calls.last_seen_at
from (
  select workspace_phone_number_id, max(created_at) as last_seen_at
  from public.voice_calls
  group by workspace_phone_number_id
) as calls
where
  numbers.id = calls.workspace_phone_number_id
  and (
    numbers.last_webhook_observed_at is null
    or numbers.last_webhook_observed_at < calls.last_seen_at
  );

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workspace_phone_numbers_routable_state_check'
  ) then
    alter table public.workspace_phone_numbers
      add constraint workspace_phone_numbers_routable_state_check
      check (
        not is_active
        or (
          provisioning_status = 'active'
          and webhook_status = 'ready'
          and released_at is null
        )
      );
  end if;
end $$;
