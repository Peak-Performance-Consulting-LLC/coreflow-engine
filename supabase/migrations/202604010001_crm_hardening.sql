create extension if not exists pg_trgm;

delete from public.pipeline_stages ps
where not exists (
  select 1
  from public.pipelines p
  where p.id = ps.pipeline_id
    and p.workspace_id = ps.workspace_id
);

update public.records r
set source_id = null
where r.source_id is not null
  and not exists (
    select 1
    from public.record_sources rs
    where rs.id = r.source_id
      and rs.workspace_id = r.workspace_id
  );

update public.records r
set pipeline_id = null
where r.pipeline_id is not null
  and not exists (
    select 1
    from public.pipelines p
    where p.id = r.pipeline_id
      and p.workspace_id = r.workspace_id
  );

update public.records r
set stage_id = null
where r.stage_id is not null
  and (
    not exists (
      select 1
      from public.pipeline_stages ps
      where ps.id = r.stage_id
        and ps.workspace_id = r.workspace_id
    )
    or r.pipeline_id is null
    or not exists (
      select 1
      from public.pipeline_stages ps
      where ps.id = r.stage_id
        and ps.workspace_id = r.workspace_id
        and ps.pipeline_id = r.pipeline_id
    )
  );

update public.records r
set status = case
  when exists (
    select 1
    from public.pipeline_stages ps
    where ps.id = r.stage_id
      and ps.workspace_id = r.workspace_id
      and ps.is_closed = true
  ) then 'closed'
  when coalesce(nullif(btrim(r.status), ''), '') in ('open', 'qualified', 'nurturing') then btrim(r.status)
  else 'open'
end,
priority = case
  when r.priority is null or btrim(r.priority) = '' then null
  when btrim(r.priority) in ('low', 'medium', 'high') then btrim(r.priority)
  else null
end;

update public.tasks
set status = case
  when status in ('open', 'in_progress', 'completed', 'cancelled') then status
  else 'open'
end,
priority = case
  when priority in ('low', 'medium', 'high') then priority
  else 'medium'
end;

update public.pipelines
set entity_type = 'record'
where entity_type <> 'record';

update public.task_links
set entity_type = 'record'
where entity_type <> 'record';

update public.custom_field_definitions
set entity_type = 'record'
where entity_type <> 'record';

update public.custom_field_definitions
set field_type = 'text'
where field_type not in ('text', 'textarea', 'number', 'date', 'boolean', 'select', 'multi_select');

update public.custom_field_values
set entity_type = 'record'
where entity_type <> 'record';

update public.import_jobs
set entity_type = 'record'
where entity_type <> 'record';

update public.import_jobs
set status = case
  when status in ('pending', 'processing', 'completed', 'failed') then status
  else 'pending'
end;

update public.import_rows
set status = case
  when status in ('pending', 'processed', 'failed') then status
  else 'pending'
end;

delete from public.record_notes rn
where not exists (
  select 1
  from public.records r
  where r.id = rn.record_id
    and r.workspace_id = rn.workspace_id
);

delete from public.record_activities ra
where not exists (
  select 1
  from public.records r
  where r.id = ra.record_id
    and r.workspace_id = ra.workspace_id
);

delete from public.task_links tl
where not exists (
  select 1
  from public.tasks t
  where t.id = tl.task_id
    and t.workspace_id = tl.workspace_id
)
or not exists (
  select 1
  from public.records r
  where r.id = tl.entity_id
    and r.workspace_id = tl.workspace_id
);

delete from public.custom_field_values cfv
where not exists (
  select 1
  from public.records r
  where r.id = cfv.entity_id
    and r.workspace_id = cfv.workspace_id
)
or not exists (
  select 1
  from public.custom_field_definitions cfd
  where cfd.id = cfv.field_definition_id
    and cfd.workspace_id = cfv.workspace_id
);

delete from public.task_links tl
using (
  select
    ctid,
    row_number() over (
      partition by workspace_id, task_id, entity_type, entity_id
      order by created_at asc, id asc
    ) as duplicate_rank
  from public.task_links
) duplicates
where tl.ctid = duplicates.ctid
  and duplicates.duplicate_rank > 1;

delete from public.import_rows ir
using (
  select
    ctid,
    row_number() over (
      partition by import_job_id, row_index
      order by created_at asc, id asc
    ) as duplicate_rank
  from public.import_rows
) duplicates
where ir.ctid = duplicates.ctid
  and duplicates.duplicate_rank > 1;

delete from public.import_mappings im
using (
  select
    ctid,
    row_number() over (
      partition by import_job_id, source_column
      order by created_at asc, id asc
    ) as duplicate_rank
  from public.import_mappings
) duplicates
where im.ctid = duplicates.ctid
  and duplicates.duplicate_rank > 1;

delete from public.import_mappings im
using (
  select
    ctid,
    row_number() over (
      partition by import_job_id, target_type, target_key
      order by created_at asc, id asc
    ) as duplicate_rank
  from public.import_mappings
) duplicates
where im.ctid = duplicates.ctid
  and duplicates.duplicate_rank > 1;

create unique index if not exists idx_pipelines_workspace_id_id
on public.pipelines(workspace_id, id);

create unique index if not exists idx_pipeline_stages_workspace_id_id
on public.pipeline_stages(workspace_id, id);

create unique index if not exists idx_pipeline_stages_workspace_pipeline_id_id
on public.pipeline_stages(workspace_id, pipeline_id, id);

create unique index if not exists idx_record_sources_workspace_id_id
on public.record_sources(workspace_id, id);

create unique index if not exists idx_records_workspace_id_id
on public.records(workspace_id, id);

create unique index if not exists idx_tasks_workspace_id_id
on public.tasks(workspace_id, id);

create unique index if not exists idx_custom_field_definitions_workspace_id_id
on public.custom_field_definitions(workspace_id, id);

alter table public.records
alter column status set default 'open';

update public.records
set status = 'open'
where status is null or btrim(status) = '';

alter table public.records
alter column status set not null;

alter table public.records
drop constraint if exists records_status_check;

alter table public.records
add constraint records_status_check
check (status in ('open', 'qualified', 'nurturing', 'closed'));

alter table public.records
drop constraint if exists records_priority_check;

alter table public.records
add constraint records_priority_check
check (priority is null or priority in ('low', 'medium', 'high'));

alter table public.records
drop constraint if exists records_stage_requires_pipeline_check;

alter table public.records
add constraint records_stage_requires_pipeline_check
check (stage_id is null or pipeline_id is not null);

alter table public.tasks
drop constraint if exists tasks_status_check;

alter table public.tasks
add constraint tasks_status_check
check (status in ('open', 'in_progress', 'completed', 'cancelled'));

alter table public.tasks
drop constraint if exists tasks_priority_check;

alter table public.tasks
add constraint tasks_priority_check
check (priority in ('low', 'medium', 'high'));

alter table public.pipelines
drop constraint if exists pipelines_entity_type_check;

alter table public.pipelines
add constraint pipelines_entity_type_check
check (entity_type = 'record');

alter table public.task_links
drop constraint if exists task_links_entity_type_check;

alter table public.task_links
add constraint task_links_entity_type_check
check (entity_type = 'record');

alter table public.custom_field_definitions
drop constraint if exists custom_field_definitions_entity_type_check;

alter table public.custom_field_definitions
add constraint custom_field_definitions_entity_type_check
check (entity_type = 'record');

alter table public.custom_field_definitions
drop constraint if exists custom_field_definitions_field_type_check;

alter table public.custom_field_definitions
add constraint custom_field_definitions_field_type_check
check (field_type in ('text', 'textarea', 'number', 'date', 'boolean', 'select', 'multi_select'));

alter table public.custom_field_values
drop constraint if exists custom_field_values_entity_type_check;

alter table public.custom_field_values
add constraint custom_field_values_entity_type_check
check (entity_type = 'record');

alter table public.import_jobs
drop constraint if exists import_jobs_entity_type_check;

alter table public.import_jobs
add constraint import_jobs_entity_type_check
check (entity_type = 'record');

alter table public.import_jobs
drop constraint if exists import_jobs_status_check;

alter table public.import_jobs
add constraint import_jobs_status_check
check (status in ('pending', 'processing', 'completed', 'failed'));

alter table public.import_mappings
drop constraint if exists import_mappings_target_type_check;

alter table public.import_mappings
add constraint import_mappings_target_type_check
check (target_type in ('core', 'custom'));

alter table public.import_rows
drop constraint if exists import_rows_status_check;

alter table public.import_rows
add constraint import_rows_status_check
check (status in ('pending', 'processed', 'failed'));

alter table public.task_links
drop constraint if exists task_links_task_entity_unique;

alter table public.task_links
add constraint task_links_task_entity_unique
unique (workspace_id, task_id, entity_type, entity_id);

alter table public.import_rows
drop constraint if exists import_rows_job_row_index_unique;

alter table public.import_rows
add constraint import_rows_job_row_index_unique
unique (import_job_id, row_index);

alter table public.import_mappings
drop constraint if exists import_mappings_job_source_column_unique;

alter table public.import_mappings
add constraint import_mappings_job_source_column_unique
unique (import_job_id, source_column);

alter table public.import_mappings
drop constraint if exists import_mappings_job_target_unique;

alter table public.import_mappings
add constraint import_mappings_job_target_unique
unique (import_job_id, target_type, target_key);

alter table public.pipeline_stages
drop constraint if exists pipeline_stages_pipeline_id_fkey;

alter table public.pipeline_stages
drop constraint if exists pipeline_stages_workspace_pipeline_fkey;

alter table public.pipeline_stages
add constraint pipeline_stages_workspace_pipeline_fkey
foreign key (workspace_id, pipeline_id)
references public.pipelines(workspace_id, id)
on delete cascade;

alter table public.records
drop constraint if exists records_source_id_fkey;

alter table public.records
drop constraint if exists records_workspace_source_fkey;

alter table public.records
add constraint records_workspace_source_fkey
foreign key (workspace_id, source_id)
references public.record_sources(workspace_id, id)
on delete restrict;

alter table public.records
drop constraint if exists records_pipeline_id_fkey;

alter table public.records
drop constraint if exists records_workspace_pipeline_fkey;

alter table public.records
add constraint records_workspace_pipeline_fkey
foreign key (workspace_id, pipeline_id)
references public.pipelines(workspace_id, id)
on delete restrict;

alter table public.records
drop constraint if exists records_stage_id_fkey;

alter table public.records
drop constraint if exists records_workspace_stage_fkey;

alter table public.records
drop constraint if exists records_workspace_pipeline_stage_fkey;

alter table public.records
add constraint records_workspace_pipeline_stage_fkey
foreign key (workspace_id, pipeline_id, stage_id)
references public.pipeline_stages(workspace_id, pipeline_id, id)
on delete restrict;

alter table public.record_notes
drop constraint if exists record_notes_record_id_fkey;

alter table public.record_notes
drop constraint if exists record_notes_workspace_record_fkey;

alter table public.record_notes
add constraint record_notes_workspace_record_fkey
foreign key (workspace_id, record_id)
references public.records(workspace_id, id)
on delete cascade;

alter table public.record_activities
drop constraint if exists record_activities_record_id_fkey;

alter table public.record_activities
drop constraint if exists record_activities_workspace_record_fkey;

alter table public.record_activities
add constraint record_activities_workspace_record_fkey
foreign key (workspace_id, record_id)
references public.records(workspace_id, id)
on delete cascade;

alter table public.task_links
drop constraint if exists task_links_task_id_fkey;

alter table public.task_links
drop constraint if exists task_links_workspace_task_fkey;

alter table public.task_links
add constraint task_links_workspace_task_fkey
foreign key (workspace_id, task_id)
references public.tasks(workspace_id, id)
on delete cascade;

alter table public.task_links
drop constraint if exists task_links_workspace_record_fkey;

alter table public.task_links
add constraint task_links_workspace_record_fkey
foreign key (workspace_id, entity_id)
references public.records(workspace_id, id)
on delete cascade;

alter table public.custom_field_values
drop constraint if exists custom_field_values_field_definition_id_fkey;

alter table public.custom_field_values
drop constraint if exists custom_field_values_workspace_record_fkey;

alter table public.custom_field_values
add constraint custom_field_values_workspace_record_fkey
foreign key (workspace_id, entity_id)
references public.records(workspace_id, id)
on delete cascade;

alter table public.custom_field_values
drop constraint if exists custom_field_values_workspace_definition_fkey;

alter table public.custom_field_values
add constraint custom_field_values_workspace_definition_fkey
foreign key (workspace_id, field_definition_id)
references public.custom_field_definitions(workspace_id, id)
on delete cascade;

create or replace function public.sync_record_status_from_stage()
returns trigger
language plpgsql
as $$
declare
  stage_closed boolean;
begin
  if new.stage_id is null then
    if new.status is null or btrim(new.status) = '' or new.status = 'closed' then
      new.status = 'open';
    end if;

    return new;
  end if;

  select ps.is_closed
  into stage_closed
  from public.pipeline_stages ps
  where ps.id = new.stage_id
    and ps.workspace_id = new.workspace_id
  limit 1;

  if coalesce(stage_closed, false) then
    new.status = 'closed';
  elsif new.status is null or btrim(new.status) = '' or new.status = 'closed' then
    new.status = 'open';
  end if;

  return new;
end;
$$;

drop trigger if exists sync_record_status_from_stage on public.records;

create trigger sync_record_status_from_stage
before insert or update of workspace_id, stage_id, status
on public.records
for each row
execute function public.sync_record_status_from_stage();

create or replace function public.sync_records_for_stage_closure()
returns trigger
language plpgsql
as $$
begin
  if old.is_closed is distinct from new.is_closed then
    update public.records r
    set status = case
      when new.is_closed then 'closed'
      when r.status = 'closed' then 'open'
      else r.status
    end
    where r.workspace_id = new.workspace_id
      and r.stage_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_records_for_stage_closure on public.pipeline_stages;

create trigger sync_records_for_stage_closure
after update of is_closed
on public.pipeline_stages
for each row
execute function public.sync_records_for_stage_closure();

create or replace function public.ensure_import_row_record_workspace_match()
returns trigger
language plpgsql
as $$
declare
  job_workspace_id uuid;
  record_workspace_id uuid;
begin
  if new.created_record_id is null then
    return new;
  end if;

  select ij.workspace_id
  into job_workspace_id
  from public.import_jobs ij
  where ij.id = new.import_job_id;

  select r.workspace_id
  into record_workspace_id
  from public.records r
  where r.id = new.created_record_id;

  if job_workspace_id is null or record_workspace_id is null or job_workspace_id <> record_workspace_id then
    raise exception 'created_record_id must belong to the same workspace as the import job.';
  end if;

  return new;
end;
$$;

drop trigger if exists ensure_import_row_record_workspace_match on public.import_rows;

create trigger ensure_import_row_record_workspace_match
before insert or update of import_job_id, created_record_id
on public.import_rows
for each row
execute function public.ensure_import_row_record_workspace_match();

create index if not exists idx_records_workspace_active_updated_at
on public.records(workspace_id, updated_at desc, id desc)
where archived_at is null;

create index if not exists idx_records_workspace_active_stage_updated_at
on public.records(workspace_id, stage_id, updated_at desc, id desc)
where archived_at is null;

create index if not exists idx_records_workspace_active_source_updated_at
on public.records(workspace_id, source_id, updated_at desc, id desc)
where archived_at is null;

create index if not exists idx_records_workspace_active_assignee_updated_at
on public.records(workspace_id, assignee_user_id, updated_at desc, id desc)
where archived_at is null;

create index if not exists idx_records_workspace_active_status_updated_at
on public.records(workspace_id, status, updated_at desc, id desc)
where archived_at is null;

create index if not exists idx_records_title_trgm
on public.records
using gin (title gin_trgm_ops)
where archived_at is null;

create index if not exists idx_records_full_name_trgm
on public.records
using gin (full_name gin_trgm_ops)
where archived_at is null;

create index if not exists idx_records_company_name_trgm
on public.records
using gin (company_name gin_trgm_ops)
where archived_at is null;

create index if not exists idx_records_email_trgm
on public.records
using gin (email gin_trgm_ops)
where archived_at is null;
