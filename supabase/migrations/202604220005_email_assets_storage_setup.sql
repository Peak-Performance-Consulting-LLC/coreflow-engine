-- Ensure email template assets bucket exists and has workspace-scoped policies.

insert into storage.buckets (id, name, public, file_size_limit)
values ('email-assets', 'email-assets', true, 52428800)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

drop policy if exists "email_assets_member_select" on storage.objects;
create policy "email_assets_member_select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'email-assets'
  and (storage.foldername(name))[1] in (
    select wm.workspace_id::text
    from public.workspace_members wm
    where wm.user_id = auth.uid()
  )
);

drop policy if exists "email_assets_member_insert" on storage.objects;
create policy "email_assets_member_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'email-assets'
  and (storage.foldername(name))[1] in (
    select wm.workspace_id::text
    from public.workspace_members wm
    where wm.user_id = auth.uid()
  )
  and coalesce((storage.foldername(name))[2], '') in ('image', 'document', 'attachment')
);

drop policy if exists "email_assets_member_update" on storage.objects;
create policy "email_assets_member_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'email-assets'
  and (storage.foldername(name))[1] in (
    select wm.workspace_id::text
    from public.workspace_members wm
    where wm.user_id = auth.uid()
  )
)
with check (
  bucket_id = 'email-assets'
  and (storage.foldername(name))[1] in (
    select wm.workspace_id::text
    from public.workspace_members wm
    where wm.user_id = auth.uid()
  )
  and coalesce((storage.foldername(name))[2], '') in ('image', 'document', 'attachment')
);

drop policy if exists "email_assets_member_delete" on storage.objects;
create policy "email_assets_member_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'email-assets'
  and (storage.foldername(name))[1] in (
    select wm.workspace_id::text
    from public.workspace_members wm
    where wm.user_id = auth.uid()
  )
);
