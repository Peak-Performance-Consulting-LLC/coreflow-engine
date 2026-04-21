-- Fix workspace membership helper functions to avoid RLS recursion.
-- The previous SECURITY INVOKER definitions could recurse through
-- workspace_members select policies and trigger "stack depth limit exceeded".

create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
  );
$$;

create or replace function public.has_workspace_role(target_workspace_id uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
      and wm.role = any(allowed_roles)
  );
$$;

grant execute on function public.is_workspace_member(uuid) to authenticated, service_role;
grant execute on function public.has_workspace_role(uuid, text[]) to authenticated, service_role;

notify pgrst, 'reload schema';
