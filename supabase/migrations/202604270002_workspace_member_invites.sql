create table if not exists public.workspace_member_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  invited_email text not null,
  role text not null default 'agent' check (role in ('owner', 'agent')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  invited_by uuid references auth.users(id) on delete set null,
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_workspace_member_invites_workspace_status_created
on public.workspace_member_invites(workspace_id, status, created_at desc);

create index if not exists idx_workspace_member_invites_email_status_created
on public.workspace_member_invites(invited_email, status, created_at desc);

create unique index if not exists idx_workspace_member_invites_workspace_email_pending
on public.workspace_member_invites(workspace_id, invited_email)
where status = 'pending';

drop trigger if exists set_workspace_member_invites_updated_at on public.workspace_member_invites;
create trigger set_workspace_member_invites_updated_at
before update on public.workspace_member_invites
for each row
execute function public.set_updated_at();

alter table public.workspace_member_invites enable row level security;

drop policy if exists "workspace_member_invites_select_owner" on public.workspace_member_invites;
create policy "workspace_member_invites_select_owner"
on public.workspace_member_invites
for select
using (public.has_workspace_role(workspace_id, array['owner']));

drop policy if exists "workspace_member_invites_write_owner" on public.workspace_member_invites;
create policy "workspace_member_invites_write_owner"
on public.workspace_member_invites
for all
using (public.has_workspace_role(workspace_id, array['owner']))
with check (public.has_workspace_role(workspace_id, array['owner']));

notify pgrst, 'reload schema';
