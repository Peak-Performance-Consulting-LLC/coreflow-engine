alter table public.workspaces
  add column if not exists voice_system_actor_user_id uuid references auth.users(id) on delete set null;

create index if not exists idx_workspaces_voice_system_actor_user_id
on public.workspaces(voice_system_actor_user_id)
where voice_system_actor_user_id is not null;
