-- Simplify workspace roles to owner + agent and align permissions.

update public.workspace_members
set role = 'agent'
where role in ('admin', 'member');

alter table public.workspace_members
  drop constraint if exists workspace_members_role_check;

alter table public.workspace_members
  add constraint workspace_members_role_check
  check (role in ('owner', 'agent'));

drop policy if exists "workspaces_update_owner_or_admin" on public.workspaces;
create policy "workspaces_update_owner_or_admin"
on public.workspaces
for update
using (public.has_workspace_role(id, array['owner']))
with check (public.has_workspace_role(id, array['owner']));

drop policy if exists "workspace_members_select_related" on public.workspace_members;
create policy "workspace_members_select_related"
on public.workspace_members
for select
using (
  user_id = auth.uid()
  or public.has_workspace_role(workspace_id, array['owner'])
);

drop policy if exists "workspace_members_update_owner_or_admin" on public.workspace_members;
create policy "workspace_members_update_owner_or_admin"
on public.workspace_members
for update
using (public.has_workspace_role(workspace_id, array['owner']))
with check (public.has_workspace_role(workspace_id, array['owner']));

drop policy if exists "pipelines_insert_admin" on public.pipelines;
create policy "pipelines_insert_admin"
on public.pipelines
for insert
with check (public.has_workspace_role(workspace_id, array['owner']));

drop policy if exists "pipelines_update_admin" on public.pipelines;
create policy "pipelines_update_admin"
on public.pipelines
for update
using (public.has_workspace_role(workspace_id, array['owner']))
with check (public.has_workspace_role(workspace_id, array['owner']));

drop policy if exists "pipeline_stages_insert_admin" on public.pipeline_stages;
create policy "pipeline_stages_insert_admin"
on public.pipeline_stages
for insert
with check (public.has_workspace_role(workspace_id, array['owner']));

drop policy if exists "pipeline_stages_update_admin" on public.pipeline_stages;
create policy "pipeline_stages_update_admin"
on public.pipeline_stages
for update
using (public.has_workspace_role(workspace_id, array['owner']))
with check (public.has_workspace_role(workspace_id, array['owner']));

drop policy if exists "record_sources_insert_admin" on public.record_sources;
create policy "record_sources_insert_admin"
on public.record_sources
for insert
with check (public.has_workspace_role(workspace_id, array['owner']));

drop policy if exists "record_sources_update_admin" on public.record_sources;
create policy "record_sources_update_admin"
on public.record_sources
for update
using (public.has_workspace_role(workspace_id, array['owner']))
with check (public.has_workspace_role(workspace_id, array['owner']));

drop policy if exists "custom_field_definitions_insert_admin" on public.custom_field_definitions;
create policy "custom_field_definitions_insert_admin"
on public.custom_field_definitions
for insert
with check (public.has_workspace_role(workspace_id, array['owner']));

drop policy if exists "custom_field_definitions_update_admin" on public.custom_field_definitions;
create policy "custom_field_definitions_update_admin"
on public.custom_field_definitions
for update
using (public.has_workspace_role(workspace_id, array['owner']))
with check (public.has_workspace_role(workspace_id, array['owner']));

drop policy if exists "voice_processing_jobs_write_admin" on public.voice_processing_jobs;
create policy "voice_processing_jobs_write_admin"
on public.voice_processing_jobs
for all
using (public.has_workspace_role(workspace_id, array['owner']))
with check (public.has_workspace_role(workspace_id, array['owner']));

drop policy if exists "workspace_email_senders_member_all" on public.workspace_email_senders;
create policy "workspace_email_senders_member_all"
on public.workspace_email_senders
for all
to authenticated
using (public.has_workspace_role(workspace_id, array['owner']))
with check (public.has_workspace_role(workspace_id, array['owner']));

drop policy if exists "workspace_email_automation_settings_member_all" on public.workspace_email_automation_settings;
create policy "workspace_email_automation_settings_member_all"
on public.workspace_email_automation_settings
for all
to authenticated
using (public.has_workspace_role(workspace_id, array['owner']))
with check (public.has_workspace_role(workspace_id, array['owner']));

drop policy if exists "workspace_email_sequence_steps_member_all" on public.workspace_email_sequence_steps;
create policy "workspace_email_sequence_steps_member_all"
on public.workspace_email_sequence_steps
for all
to authenticated
using (public.has_workspace_role(workspace_id, array['owner']))
with check (public.has_workspace_role(workspace_id, array['owner']));

drop policy if exists "email_oauth_sessions_member_all" on public.email_oauth_sessions;
create policy "email_oauth_sessions_member_all"
on public.email_oauth_sessions
for all
to authenticated
using (public.has_workspace_role(workspace_id, array['owner']))
with check (public.has_workspace_role(workspace_id, array['owner']));

drop policy if exists "workspace_email_brand_themes_member_all" on public.workspace_email_brand_themes;
create policy "workspace_email_brand_themes_member_all"
on public.workspace_email_brand_themes
for all
to authenticated
using (public.has_workspace_role(workspace_id, array['owner']))
with check (public.has_workspace_role(workspace_id, array['owner']));

notify pgrst, 'reload schema';
