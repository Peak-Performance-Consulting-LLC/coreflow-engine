alter table public.workspace_phone_numbers
  add column if not exists label text,
  add column if not exists provisioning_status text not null default 'active',
  add column if not exists webhook_status text not null default 'pending',
  add column if not exists last_provisioning_error text,
  add column if not exists telnyx_connection_id text,
  add column if not exists provider_order_id text,
  add column if not exists telnyx_metadata jsonb not null default '{}'::jsonb,
  add column if not exists purchased_at timestamptz,
  add column if not exists released_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workspace_phone_numbers_provisioning_status_check'
  ) then
    alter table public.workspace_phone_numbers
      add constraint workspace_phone_numbers_provisioning_status_check
      check (provisioning_status in ('pending', 'active', 'failed', 'released'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'workspace_phone_numbers_webhook_status_check'
  ) then
    alter table public.workspace_phone_numbers
      add constraint workspace_phone_numbers_webhook_status_check
      check (webhook_status in ('pending', 'ready', 'failed'));
  end if;
end $$;

create index if not exists idx_workspace_phone_numbers_workspace_id_provisioning_status_created_at_desc
on public.workspace_phone_numbers(workspace_id, provisioning_status, created_at desc);

create index if not exists idx_workspace_phone_numbers_workspace_id_webhook_status
on public.workspace_phone_numbers(workspace_id, webhook_status);

update public.workspace_phone_numbers
set
  provisioning_status = coalesce(provisioning_status, 'active'),
  webhook_status = case
    when is_active then 'ready'
    else coalesce(webhook_status, 'pending')
  end,
  purchased_at = coalesce(purchased_at, created_at),
  telnyx_metadata = coalesce(telnyx_metadata, '{}'::jsonb)
where true;
