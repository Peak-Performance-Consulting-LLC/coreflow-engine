import type { EdgeClient } from './server.ts';
import { getString, listWorkspaceAssignees } from './server.ts';

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

interface CoreRecordInput {
  title?: unknown;
  full_name?: unknown;
  company_name?: unknown;
  email?: unknown;
  phone?: unknown;
  source_id?: unknown;
  pipeline_id?: unknown;
  stage_id?: unknown;
  assignee_user_id?: unknown;
  status?: unknown;
  priority?: unknown;
}

interface SaveRecordPayload {
  workspace_id: string;
  core?: CoreRecordInput;
  custom?: Record<string, unknown>;
}

interface RecordFilters {
  workspace_id: string;
  search?: string;
  stage_id?: string | null;
  source_id?: string | null;
  assignee_user_id?: string | null;
  status?: string | null;
  include_archived?: boolean;
  page?: number;
  pageSize?: number;
}

interface CustomFieldDefinitionRow {
  id: string;
  field_key: string;
  label: string;
  field_type: string;
  is_required: boolean;
  options: unknown;
  placeholder: string | null;
  help_text: string | null;
  validation_rules: Json;
  default_value: Json;
  position: number;
}

interface StageSnapshotRow {
  id: string;
  pipeline_id: string;
  is_closed: boolean;
}

const recordStatuses = new Set(['open', 'qualified', 'nurturing', 'closed']);
const recordPriorities = new Set(['low', 'medium', 'high']);
const taskPriorities = new Set(['low', 'medium', 'high']);
const customFieldDefinitionRelation = 'custom_field_definitions!custom_field_values_field_definition_id_fkey';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeNullableString(value: unknown) {
  const nextValue = getString(value);
  return nextValue.length > 0 ? nextValue : null;
}

function normalizeEnumValue(value: unknown, allowed: Set<string>, errorLabel: string) {
  const nextValue = normalizeNullableString(value);

  if (!nextValue) {
    return null;
  }

  if (!allowed.has(nextValue)) {
    throw new Error(`${errorLabel} is invalid.`);
  }

  return nextValue;
}

function normalizeRecordStatus(value: unknown) {
  return normalizeEnumValue(value, recordStatuses, 'Status');
}

function normalizeRecordPriority(value: unknown) {
  return normalizeEnumValue(value, recordPriorities, 'Priority');
}

function normalizeTaskPriority(value: unknown) {
  return normalizeEnumValue(value, taskPriorities, 'Task priority');
}

function synchronizeRecordStatus(requestedStatus: string | null | undefined, stageIsClosed: boolean) {
  if (stageIsClosed) {
    return 'closed';
  }

  if (!requestedStatus || !recordStatuses.has(requestedStatus) || requestedStatus === 'closed') {
    return 'open';
  }

  return requestedStatus;
}

function isEmptyValue(value: unknown) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function serializeCustomValue(row: {
  value_text: string | null;
  value_number: number | string | null;
  value_boolean: boolean | null;
  value_date: string | null;
  value_datetime: string | null;
  value_json: Json | null;
}) {
  if (row.value_json !== null) return row.value_json;
  if (row.value_boolean !== null) return row.value_boolean;
  if (row.value_number !== null) return Number(row.value_number);
  if (row.value_datetime !== null) return row.value_datetime;
  if (row.value_date !== null) return row.value_date;
  return row.value_text;
}

function buildValueColumns(fieldType: string, value: unknown) {
  const base = {
    value_text: null as string | null,
    value_number: null as number | null,
    value_boolean: null as boolean | null,
    value_date: null as string | null,
    value_datetime: null as string | null,
    value_json: null as Json | null,
  };

  if (isEmptyValue(value)) {
    return base;
  }

  switch (fieldType) {
    case 'text':
    case 'textarea':
      return { ...base, value_text: getString(value) };
    case 'number': {
      const numericValue = typeof value === 'number' ? value : Number(value);
      if (Number.isNaN(numericValue)) {
        throw new Error('Expected a numeric value.');
      }
      return { ...base, value_number: numericValue };
    }
    case 'boolean':
      if (typeof value !== 'boolean') {
        throw new Error('Expected a boolean value.');
      }
      return { ...base, value_boolean: value };
    case 'date': {
      const nextValue = getString(value);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(nextValue)) {
        throw new Error('Expected a YYYY-MM-DD date value.');
      }
      return { ...base, value_date: nextValue };
    }
    case 'datetime': {
      const nextValue = getString(value);
      if (!nextValue) {
        return base;
      }
      const parsed = new Date(nextValue);
      if (Number.isNaN(parsed.getTime())) {
        throw new Error('Expected a valid datetime value.');
      }
      return { ...base, value_datetime: parsed.toISOString() };
    }
    case 'select':
      return { ...base, value_text: getString(value) };
    case 'multi_select':
      if (!Array.isArray(value)) {
        throw new Error('Expected an array of option values.');
      }
      return { ...base, value_json: value.map((item) => getString(item)) };
    default:
      throw new Error(`Unsupported field type: ${fieldType}`);
  }
}

async function getFieldDefinitions(serviceClient: EdgeClient, workspaceId: string) {
  const { data, error } = await serviceClient
    .from('custom_field_definitions')
    .select(
      'id, field_key, label, field_type, is_required, options, placeholder, help_text, validation_rules, default_value, position',
    )
    .eq('workspace_id', workspaceId)
    .eq('entity_type', 'record')
    .eq('is_active', true)
    .order('position', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as CustomFieldDefinitionRow[];
}

async function getExistingCustomValues(serviceClient: EdgeClient, recordId: string) {
  const { data, error } = await serviceClient
    .from('custom_field_values')
    .select(
      `field_definition_id, ${customFieldDefinitionRelation}!inner(field_key), value_text, value_number, value_boolean, value_date, value_datetime, value_json`,
    )
    .eq('entity_type', 'record')
    .eq('entity_id', recordId);

  if (error) {
    throw new Error(error.message);
  }

  const values = new Map<string, unknown>();

  for (const row of data ?? []) {
    const definitions = Array.isArray(row.custom_field_definitions)
      ? row.custom_field_definitions[0]
      : row.custom_field_definitions;

    if (definitions?.field_key) {
      values.set(
        definitions.field_key,
        serializeCustomValue({
          value_text: row.value_text,
          value_number: row.value_number,
          value_boolean: row.value_boolean,
          value_date: row.value_date,
          value_datetime: row.value_datetime,
          value_json: row.value_json,
        }),
      );
    }
  }

  return values;
}

async function validateWorkspaceReference(
  serviceClient: EdgeClient,
  table: string,
  workspaceId: string,
  id: string | null,
  errorLabel: string,
) {
  if (!id) {
    return null;
  }

  const { data, error } = await serviceClient
    .from(table)
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error(`${errorLabel} is invalid for this workspace.`);
  }

  return data.id;
}

async function validateAssignee(serviceClient: EdgeClient, workspaceId: string, userId: string | null) {
  if (!userId) {
    return null;
  }

  const { data, error } = await serviceClient
    .from('workspace_members')
    .select('user_id')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('Assignee must be a member of the workspace.');
  }

  return data.user_id;
}

async function validateStageBelongsToPipeline(
  serviceClient: EdgeClient,
  workspaceId: string,
  pipelineId: string | null,
  stageId: string | null,
) {
  if (!pipelineId || !stageId) {
    return;
  }

  const { data, error } = await serviceClient
    .from('pipeline_stages')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('pipeline_id', pipelineId)
    .eq('id', stageId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('Selected stage does not belong to the selected pipeline.');
  }
}

async function getStageSnapshot(serviceClient: EdgeClient, workspaceId: string, stageId: string | null) {
  if (!stageId) {
    return null;
  }

  const { data, error } = await serviceClient
    .from('pipeline_stages')
    .select('id, pipeline_id, is_closed')
    .eq('workspace_id', workspaceId)
    .eq('id', stageId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? null) as StageSnapshotRow | null;
}

async function resolvePipelineStageDefaults(serviceClient: EdgeClient, workspaceId: string) {
  const { data: pipeline, error: pipelineError } = await serviceClient
    .from('pipelines')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('entity_type', 'record')
    .eq('is_default', true)
    .maybeSingle();

  if (pipelineError) {
    throw new Error(pipelineError.message);
  }

  if (!pipeline) {
    return { pipelineId: null, stageId: null };
  }

  const { data: stage, error: stageError } = await serviceClient
    .from('pipeline_stages')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('pipeline_id', pipeline.id)
    .order('position', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (stageError) {
    throw new Error(stageError.message);
  }

  return {
    pipelineId: pipeline.id,
    stageId: stage?.id ?? null,
  };
}

async function upsertCustomFieldValues(
  serviceClient: EdgeClient,
  workspaceId: string,
  entityId: string,
  definitions: CustomFieldDefinitionRow[],
  customInput: Record<string, unknown>,
  existingValues?: Map<string, unknown>,
) {
  const definitionByKey = new Map(definitions.map((definition) => [definition.field_key, definition]));
  const mergedValues = new Map(existingValues ?? new Map<string, unknown>());

  for (const [fieldKey, value] of Object.entries(customInput)) {
    mergedValues.set(fieldKey, value);
  }

  for (const definition of definitions) {
    const value = mergedValues.get(definition.field_key);

    if (definition.is_required && isEmptyValue(value)) {
      throw new Error(`${definition.label} is required.`);
    }
  }

  const upsertRows: Array<Record<string, unknown>> = [];
  const deleteDefinitionIds: string[] = [];

  for (const [fieldKey, value] of Object.entries(customInput)) {
    const definition = definitionByKey.get(fieldKey);

    if (!definition) {
      throw new Error(`Unknown custom field: ${fieldKey}`);
    }

    if (definition.field_type === 'select' || definition.field_type === 'multi_select') {
      const optionList = Array.isArray(definition.options)
        ? definition.options
        : isPlainObject(definition.options) && Array.isArray(definition.options.values)
          ? definition.options.values
          : [];

      const normalizedOptions = Array.isArray(optionList)
        ? optionList.map((option) => getString(option))
        : [];

      if (normalizedOptions.length > 0 && !isEmptyValue(value)) {
        const valuesToCheck = definition.field_type === 'multi_select'
          ? (Array.isArray(value) ? value.map((item) => getString(item)) : [])
          : [getString(value)];

        for (const nextValue of valuesToCheck) {
          if (!normalizedOptions.includes(nextValue)) {
            throw new Error(`${definition.label} contains an invalid option.`);
          }
        }
      }
    }

    if (isEmptyValue(value)) {
      deleteDefinitionIds.push(definition.id);
      continue;
    }

    const valueColumns = buildValueColumns(definition.field_type, value);

    upsertRows.push({
      workspace_id: workspaceId,
      entity_type: 'record',
      entity_id: entityId,
      field_definition_id: definition.id,
      ...valueColumns,
    });
  }

  if (deleteDefinitionIds.length > 0) {
    const { error: deleteError } = await serviceClient
      .from('custom_field_values')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('entity_type', 'record')
      .eq('entity_id', entityId)
      .in('field_definition_id', deleteDefinitionIds);

    if (deleteError) {
      throw new Error(deleteError.message);
    }
  }

  if (upsertRows.length > 0) {
    const { error: upsertError } = await serviceClient
      .from('custom_field_values')
      .upsert(upsertRows, { onConflict: 'entity_type,entity_id,field_definition_id' });

    if (upsertError) {
      throw new Error(upsertError.message);
    }
  }
}

async function writeActivity(
  serviceClient: EdgeClient,
  workspaceId: string,
  recordId: string,
  activityType: string,
  createdBy: string | null,
  meta: Record<string, Json>,
) {
  const { error } = await serviceClient.from('record_activities').insert({
    workspace_id: workspaceId,
    record_id: recordId,
    activity_type: activityType,
    meta,
    created_by: createdBy,
  });

  if (error) {
    throw new Error(error.message);
  }
}

async function fetchCustomValuesMap(serviceClient: EdgeClient, workspaceId: string, recordId: string) {
  const { data, error } = await serviceClient
    .from('custom_field_values')
    .select(
      `value_text, value_number, value_boolean, value_date, value_datetime, value_json, ${customFieldDefinitionRelation}!inner(field_key, label, field_type)`,
    )
    .eq('workspace_id', workspaceId)
    .eq('entity_type', 'record')
    .eq('entity_id', recordId);

  if (error) {
    throw new Error(error.message);
  }

  const result: Record<string, unknown> = {};

  for (const row of data ?? []) {
    const definition = Array.isArray(row.custom_field_definitions)
      ? row.custom_field_definitions[0]
      : row.custom_field_definitions;

    if (!definition?.field_key) continue;

    result[definition.field_key] = serializeCustomValue({
      value_text: row.value_text,
      value_number: row.value_number,
      value_boolean: row.value_boolean,
      value_date: row.value_date,
      value_datetime: row.value_datetime,
      value_json: row.value_json,
    });
  }

  return result;
}

export async function getWorkspaceCrmConfig(serviceClient: EdgeClient, workspaceId: string) {
  const [
    pipelinesResult,
    sourcesResult,
    fieldDefinitions,
    assignees,
  ] = await Promise.all([
    serviceClient
      .from('pipelines')
      .select('id, name, is_default')
      .eq('workspace_id', workspaceId)
      .eq('entity_type', 'record')
      .order('created_at', { ascending: true }),
    serviceClient
      .from('record_sources')
      .select('id, name, source_type, is_active')
      .eq('workspace_id', workspaceId)
      .order('name', { ascending: true }),
    getFieldDefinitions(serviceClient, workspaceId),
    listWorkspaceAssignees(serviceClient, workspaceId),
  ]);

  if (pipelinesResult.error) throw new Error(pipelinesResult.error.message);
  if (sourcesResult.error) throw new Error(sourcesResult.error.message);

  const pipelineIds = (pipelinesResult.data ?? []).map((pipeline) => pipeline.id);

  let stages: Array<Record<string, unknown>> = [];

  if (pipelineIds.length > 0) {
    const { data, error } = await serviceClient
      .from('pipeline_stages')
      .select('id, pipeline_id, name, position, color, is_closed, win_probability')
      .eq('workspace_id', workspaceId)
      .in('pipeline_id', pipelineIds)
      .order('position', { ascending: true });

    if (error) throw new Error(error.message);
    stages = data ?? [];
  }

  return {
    pipelines: (pipelinesResult.data ?? []).map((pipeline) => ({
      ...pipeline,
      stages: stages.filter((stage) => stage.pipeline_id === pipeline.id),
    })),
    sources: sourcesResult.data ?? [],
    customFields: fieldDefinitions,
    assignees,
  };
}

export async function listRecordsForWorkspace(serviceClient: EdgeClient, filters: RecordFilters) {
  const requestedPage = Number.isFinite(filters.page) ? Math.max(1, Math.trunc(filters.page ?? 1)) : 1;
  const requestedPageSize = Number.isFinite(filters.pageSize) ? Math.max(1, Math.trunc(filters.pageSize ?? 10)) : 10;
  const pageSize = Math.min(requestedPageSize, 100);
  const search = getString(filters.search);
  const recordSelect =
    'id, workspace_id, record_type, title, full_name, company_name, email, phone, source_id, pipeline_id, stage_id, assignee_user_id, status, priority, imported_from, created_by, updated_by, archived_at, created_at, updated_at';

  function applyFilters(query: any) {
    let nextQuery = query.eq('workspace_id', filters.workspace_id);

    if (!filters.include_archived) {
      nextQuery = nextQuery.is('archived_at', null);
    }

    if (filters.stage_id) {
      nextQuery = nextQuery.eq('stage_id', filters.stage_id);
    }

    if (filters.source_id) {
      nextQuery = nextQuery.eq('source_id', filters.source_id);
    }

    if (filters.assignee_user_id) {
      nextQuery = nextQuery.eq('assignee_user_id', filters.assignee_user_id);
    }

    if (filters.status) {
      nextQuery = nextQuery.eq('status', filters.status);
    }

    if (search) {
      const escaped = search.replace(/[%_,]/g, '');
      nextQuery = nextQuery.or(
        `title.ilike.%${escaped}%,full_name.ilike.%${escaped}%,company_name.ilike.%${escaped}%,email.ilike.%${escaped}%`,
      );
    }

    return nextQuery;
  }

  const { count, error: countError } = await applyFilters(
    serviceClient.from('records').select('id', { count: 'exact', head: true }),
  );

  if (countError) {
    throw new Error(countError.message);
  }

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);

  if (total === 0) {
    return {
      items: [],
      records: [],
      page: 1,
      pageSize,
      total: 0,
      totalPages: 1,
      hasNextPage: false,
      hasPrevPage: false,
    };
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error } = await applyFilters(serviceClient.from('records').select(recordSelect))
    .order('updated_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, to);

  if (error) {
    throw new Error(error.message);
  }

  const records = data ?? [];

  if (records.length === 0) {
    return {
      items: [],
      records: [],
      page,
      pageSize,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    };
  }

  const recordIds = records.map((record) => record.id);
  const [customValuesResult, taskLinksResult, activitiesResult] = await Promise.all([
    serviceClient
      .from('custom_field_values')
      .select(
        `entity_id, value_text, value_number, value_boolean, value_date, value_datetime, value_json, ${customFieldDefinitionRelation}!inner(field_key)`,
      )
      .eq('workspace_id', filters.workspace_id)
      .eq('entity_type', 'record')
      .in('entity_id', recordIds),
    serviceClient
      .from('task_links')
      .select('entity_id, task_id')
      .eq('workspace_id', filters.workspace_id)
      .eq('entity_type', 'record')
      .in('entity_id', recordIds),
    serviceClient
      .from('record_activities')
      .select('record_id, activity_type, created_at')
      .eq('workspace_id', filters.workspace_id)
      .in('record_id', recordIds)
      .order('created_at', { ascending: false }),
  ]);

  if (customValuesResult.error) throw new Error(customValuesResult.error.message);
  if (taskLinksResult.error) throw new Error(taskLinksResult.error.message);
  if (activitiesResult.error) throw new Error(activitiesResult.error.message);

  const customByRecord = new Map<string, Record<string, unknown>>();

  for (const row of customValuesResult.data ?? []) {
    const definition = Array.isArray(row.custom_field_definitions)
      ? row.custom_field_definitions[0]
      : row.custom_field_definitions;

    if (!definition?.field_key) {
      continue;
    }

    const current = customByRecord.get(row.entity_id) ?? {};
    current[definition.field_key] = serializeCustomValue({
      value_text: row.value_text,
      value_number: row.value_number,
      value_boolean: row.value_boolean,
      value_date: row.value_date,
      value_datetime: row.value_datetime,
      value_json: row.value_json,
    });
    customByRecord.set(row.entity_id, current);
  }

  const latestActivityByRecord = new Map<string, { created_at: string; activity_type: string }>();

  for (const row of activitiesResult.data ?? []) {
    if (!latestActivityByRecord.has(row.record_id)) {
      latestActivityByRecord.set(row.record_id, {
        created_at: row.created_at,
        activity_type: row.activity_type,
      });
    }
  }

  const taskLinks = taskLinksResult.data ?? [];
  const taskIds = [...new Set(taskLinks.map((row) => row.task_id))];
  const tasksById = new Map<string, { id: string; title: string; status: string; due_at: string | null; created_at: string }>();

  if (taskIds.length > 0) {
    const { data: tasks, error: tasksError } = await serviceClient
      .from('tasks')
      .select('id, title, status, due_at, created_at')
      .eq('workspace_id', filters.workspace_id)
      .in('id', taskIds);

    if (tasksError) {
      throw new Error(tasksError.message);
    }

    for (const task of tasks ?? []) {
      tasksById.set(task.id, task);
    }
  }

  const tasksByRecord = new Map<string, Array<{ title: string; status: string; due_at: string | null; created_at: string }>>();

  for (const link of taskLinks) {
    const task = tasksById.get(link.task_id);

    if (!task) {
      continue;
    }

    const current = tasksByRecord.get(link.entity_id) ?? [];
    current.push({
      title: task.title,
      status: task.status,
      due_at: task.due_at,
      created_at: task.created_at,
    });
    tasksByRecord.set(link.entity_id, current);
  }

  const items = records.map((record) => {
    const linkedTasks = tasksByRecord.get(record.id) ?? [];
    const openTasks = linkedTasks.filter((task) => task.status !== 'completed');
    const sortedOpenTasks = [...openTasks].sort((left, right) => {
      const leftHasDueAt = Boolean(left.due_at);
      const rightHasDueAt = Boolean(right.due_at);

      if (leftHasDueAt && rightHasDueAt) {
        const leftTime = left.due_at ? new Date(left.due_at).getTime() : Number.POSITIVE_INFINITY;
        const rightTime = right.due_at ? new Date(right.due_at).getTime() : Number.POSITIVE_INFINITY;

        if (leftTime !== rightTime) {
          return leftTime - rightTime;
        }
      } else if (leftHasDueAt !== rightHasDueAt) {
        return leftHasDueAt ? -1 : 1;
      }

      const leftCreatedAt = new Date(left.created_at).getTime();
      const rightCreatedAt = new Date(right.created_at).getTime();

      if (leftCreatedAt !== rightCreatedAt) {
        return leftCreatedAt - rightCreatedAt;
      }

      return left.title.localeCompare(right.title);
    });

    const nextTask = sortedOpenTasks[0];
    const nextFollowUp = nextTask?.due_at ? nextTask : null;
    const latestActivity = latestActivityByRecord.get(record.id);

    return {
      ...record,
      custom: customByRecord.get(record.id) ?? {},
      next_follow_up_at: nextFollowUp?.due_at ?? null,
      next_task_title: nextTask?.title ?? null,
      next_task_due_at: nextTask?.due_at ?? null,
      last_activity_at: latestActivity?.created_at ?? record.updated_at,
      last_activity_type: latestActivity?.activity_type ?? null,
      open_task_count: openTasks.length,
    };
  });

  return {
    items,
    records: items,
    page,
    pageSize,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}

export async function getRecordDetails(serviceClient: EdgeClient, workspaceId: string, recordId: string) {
  const { data: record, error } = await serviceClient
    .from('records')
    .select(
      'id, workspace_id, record_type, title, full_name, company_name, email, phone, source_id, pipeline_id, stage_id, assignee_user_id, status, priority, imported_from, created_by, updated_by, archived_at, created_at, updated_at',
    )
    .eq('workspace_id', workspaceId)
    .eq('id', recordId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!record) {
    throw new Error('Record not found.');
  }

  const [custom, notesResult, tasksResult, activitiesResult] = await Promise.all([
    fetchCustomValuesMap(serviceClient, workspaceId, recordId),
    serviceClient
      .from('record_notes')
      .select('id, body, created_by, updated_by, created_at, updated_at')
      .eq('workspace_id', workspaceId)
      .eq('record_id', recordId)
      .order('created_at', { ascending: false }),
    serviceClient
      .from('task_links')
      .select('task_id')
      .eq('workspace_id', workspaceId)
      .eq('entity_type', 'record')
      .eq('entity_id', recordId),
    serviceClient
      .from('record_activities')
      .select('id, activity_type, meta, created_by, created_at')
      .eq('workspace_id', workspaceId)
      .eq('record_id', recordId)
      .order('created_at', { ascending: false }),
  ]);

  if (notesResult.error) throw new Error(notesResult.error.message);
  if (tasksResult.error) throw new Error(tasksResult.error.message);
  if (activitiesResult.error) throw new Error(activitiesResult.error.message);

  const taskIds = (tasksResult.data ?? []).map((row) => row.task_id);
  let tasks: Array<Record<string, unknown>> = [];

  if (taskIds.length > 0) {
    const { data, error: linkedTasksError } = await serviceClient
      .from('tasks')
      .select('id, title, description, status, priority, due_at, assigned_to, created_by, completed_at, created_at, updated_at')
      .eq('workspace_id', workspaceId)
      .in('id', taskIds)
      .order('created_at', { ascending: false });

    if (linkedTasksError) throw new Error(linkedTasksError.message);
    tasks = data ?? [];
  }

  return {
    record,
    custom,
    notes: notesResult.data ?? [],
    tasks,
    activities: activitiesResult.data ?? [],
  };
}

export async function createRecordForWorkspace(serviceClient: EdgeClient, userId: string, payload: SaveRecordPayload) {
  const core = isPlainObject(payload.core) ? payload.core : {};
  const custom = isPlainObject(payload.custom) ? payload.custom : {};
  const workspaceId = payload.workspace_id;
  const title = getString(core.title);

  if (title.length < 2) {
    throw new Error('Title is required.');
  }

  const defaults = await resolvePipelineStageDefaults(serviceClient, workspaceId);
  const pipelineId = await validateWorkspaceReference(
    serviceClient,
    'pipelines',
    workspaceId,
    normalizeNullableString(core.pipeline_id) ?? defaults.pipelineId,
    'Pipeline',
  );

  const stageId = await validateWorkspaceReference(
    serviceClient,
    'pipeline_stages',
    workspaceId,
    normalizeNullableString(core.stage_id) ?? defaults.stageId,
    'Stage',
  );

  const sourceId = await validateWorkspaceReference(
    serviceClient,
    'record_sources',
    workspaceId,
    normalizeNullableString(core.source_id),
    'Source',
  );

  const assigneeUserId = await validateAssignee(
    serviceClient,
    workspaceId,
    normalizeNullableString(core.assignee_user_id),
  );
  const requestedStatus = normalizeRecordStatus(core.status);
  const priority = normalizeRecordPriority(core.priority);

  await validateStageBelongsToPipeline(serviceClient, workspaceId, pipelineId, stageId);
  const stage = await getStageSnapshot(serviceClient, workspaceId, stageId);
  const status = synchronizeRecordStatus(requestedStatus, stage?.is_closed ?? false);

  const { data: record, error } = await serviceClient
    .from('records')
    .insert({
      workspace_id: workspaceId,
      record_type: 'lead',
      title,
      full_name: normalizeNullableString(core.full_name),
      company_name: normalizeNullableString(core.company_name),
      email: normalizeNullableString(core.email),
      phone: normalizeNullableString(core.phone),
      source_id: sourceId,
      pipeline_id: pipelineId,
      stage_id: stageId,
      assignee_user_id: assigneeUserId,
      status,
      priority,
      created_by: userId,
      updated_by: userId,
    })
    .select(
      'id, workspace_id, record_type, title, full_name, company_name, email, phone, source_id, pipeline_id, stage_id, assignee_user_id, status, priority, imported_from, created_by, updated_by, archived_at, created_at, updated_at',
    )
    .single();

  if (error || !record) {
    throw new Error(error?.message || 'Unable to create record.');
  }

  const definitions = await getFieldDefinitions(serviceClient, workspaceId);
  await upsertCustomFieldValues(serviceClient, workspaceId, record.id, definitions, custom);

  await writeActivity(serviceClient, workspaceId, record.id, 'record_created', userId, {
    title: record.title,
    stage_id: record.stage_id,
  });

  if (record.assignee_user_id) {
    await writeActivity(serviceClient, workspaceId, record.id, 'assignment_changed', userId, {
      assignee_user_id: record.assignee_user_id,
    });
  }

  return getRecordDetails(serviceClient, workspaceId, record.id);
}

export async function updateRecordForWorkspace(
  serviceClient: EdgeClient,
  userId: string,
  recordId: string,
  payload: SaveRecordPayload,
) {
  const workspaceId = payload.workspace_id;
  const existing = await getRecordDetails(serviceClient, workspaceId, recordId);
  const core = isPlainObject(payload.core) ? payload.core : {};
  const custom = isPlainObject(payload.custom) ? payload.custom : {};

  const pipelineId = await validateWorkspaceReference(
    serviceClient,
    'pipelines',
    workspaceId,
    normalizeNullableString(core.pipeline_id) ?? existing.record.pipeline_id,
    'Pipeline',
  );

  const stageId = await validateWorkspaceReference(
    serviceClient,
    'pipeline_stages',
    workspaceId,
    normalizeNullableString(core.stage_id) ?? existing.record.stage_id,
    'Stage',
  );

  const sourceId = await validateWorkspaceReference(
    serviceClient,
    'record_sources',
    workspaceId,
    normalizeNullableString(core.source_id) ?? existing.record.source_id,
    'Source',
  );

  const assigneeUserId = await validateAssignee(
    serviceClient,
    workspaceId,
    normalizeNullableString(core.assignee_user_id) ?? existing.record.assignee_user_id,
  );
  const requestedStatus =
    core.status === undefined ? existing.record.status : normalizeRecordStatus(core.status);
  const requestedPriority =
    core.priority === undefined ? existing.record.priority : normalizeRecordPriority(core.priority);

  await validateStageBelongsToPipeline(serviceClient, workspaceId, pipelineId, stageId);
  const stage = await getStageSnapshot(serviceClient, workspaceId, stageId);
  const nextStatus = synchronizeRecordStatus(requestedStatus, stage?.is_closed ?? false);

  const nextTitle = getString(core.title) || existing.record.title;

  if (nextTitle.length < 2) {
    throw new Error('Title is required.');
  }

  const { error } = await serviceClient
    .from('records')
    .update({
      title: nextTitle,
      full_name: core.full_name === undefined ? existing.record.full_name : normalizeNullableString(core.full_name),
      company_name:
        core.company_name === undefined ? existing.record.company_name : normalizeNullableString(core.company_name),
      email: core.email === undefined ? existing.record.email : normalizeNullableString(core.email),
      phone: core.phone === undefined ? existing.record.phone : normalizeNullableString(core.phone),
      source_id: sourceId,
      pipeline_id: pipelineId,
      stage_id: stageId,
      assignee_user_id: assigneeUserId,
      status: nextStatus,
      priority: requestedPriority,
      updated_by: userId,
    })
    .eq('workspace_id', workspaceId)
    .eq('id', recordId);

  if (error) {
    throw new Error(error.message);
  }

  const definitions = await getFieldDefinitions(serviceClient, workspaceId);
  const existingValues = await getExistingCustomValues(serviceClient, recordId);
  await upsertCustomFieldValues(serviceClient, workspaceId, recordId, definitions, custom, existingValues);

  if (existing.record.stage_id !== stageId) {
    await writeActivity(serviceClient, workspaceId, recordId, 'stage_changed', userId, {
      from_stage_id: existing.record.stage_id,
      to_stage_id: stageId,
    });
  }

  if (existing.record.assignee_user_id !== assigneeUserId) {
    await writeActivity(serviceClient, workspaceId, recordId, 'assignment_changed', userId, {
      from_assignee_user_id: existing.record.assignee_user_id,
      to_assignee_user_id: assigneeUserId,
    });
  }

  await writeActivity(serviceClient, workspaceId, recordId, 'record_updated', userId, {
    title: nextTitle,
  });

  return getRecordDetails(serviceClient, workspaceId, recordId);
}

export async function moveRecordStageForWorkspace(
  serviceClient: EdgeClient,
  userId: string,
  workspaceId: string,
  recordId: string,
  stageId: string,
) {
  const current = await getRecordDetails(serviceClient, workspaceId, recordId);
  const pipelineId = current.record.pipeline_id;
  const nextStageId = await validateWorkspaceReference(serviceClient, 'pipeline_stages', workspaceId, stageId, 'Stage');
  await validateStageBelongsToPipeline(serviceClient, workspaceId, pipelineId, nextStageId);
  const nextStage = await getStageSnapshot(serviceClient, workspaceId, nextStageId);
  const nextStatus = synchronizeRecordStatus(current.record.status, nextStage?.is_closed ?? false);

  const { error } = await serviceClient
    .from('records')
    .update({
      stage_id: nextStageId,
      status: nextStatus,
      updated_by: userId,
    })
    .eq('workspace_id', workspaceId)
    .eq('id', recordId);

  if (error) {
    throw new Error(error.message);
  }

  await writeActivity(serviceClient, workspaceId, recordId, 'stage_changed', userId, {
    from_stage_id: current.record.stage_id,
    to_stage_id: nextStageId,
  });

  return getRecordDetails(serviceClient, workspaceId, recordId);
}

export async function addNoteToRecord(
  serviceClient: EdgeClient,
  userId: string,
  workspaceId: string,
  recordId: string,
  body: string,
) {
  const nextBody = getString(body);

  if (nextBody.length < 1) {
    throw new Error('Note body is required.');
  }

  await getRecordDetails(serviceClient, workspaceId, recordId);

  const { data, error } = await serviceClient
    .from('record_notes')
    .insert({
      workspace_id: workspaceId,
      record_id: recordId,
      body: nextBody,
      created_by: userId,
      updated_by: userId,
    })
    .select('id, body, created_by, updated_by, created_at, updated_at')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Unable to add note.');
  }

  await writeActivity(serviceClient, workspaceId, recordId, 'note_added', userId, {
    note_id: data.id,
  });

  return data;
}

export async function createTaskForRecord(
  serviceClient: EdgeClient,
  userId: string,
  workspaceId: string,
  recordId: string,
  payload: { title?: unknown; description?: unknown; priority?: unknown; due_at?: unknown; assigned_to?: unknown },
) {
  const title = getString(payload.title);

  if (title.length < 2) {
    throw new Error('Task title is required.');
  }

  await getRecordDetails(serviceClient, workspaceId, recordId);

  const assignedTo = await validateAssignee(serviceClient, workspaceId, normalizeNullableString(payload.assigned_to));
  const dueAt = normalizeNullableString(payload.due_at);
  const priority = normalizeTaskPriority(payload.priority) ?? 'medium';

  const { data: task, error } = await serviceClient
    .from('tasks')
    .insert({
      workspace_id: workspaceId,
      title,
      description: normalizeNullableString(payload.description),
      priority,
      due_at: dueAt,
      assigned_to: assignedTo,
      created_by: userId,
    })
    .select('id, title, description, status, priority, due_at, assigned_to, created_by, completed_at, created_at, updated_at')
    .single();

  if (error || !task) {
    throw new Error(error?.message || 'Unable to create task.');
  }

  const { error: linkError } = await serviceClient.from('task_links').insert({
    workspace_id: workspaceId,
    task_id: task.id,
    entity_type: 'record',
    entity_id: recordId,
  });

  if (linkError) {
    throw new Error(linkError.message);
  }

  await writeActivity(serviceClient, workspaceId, recordId, 'task_created', userId, {
    task_id: task.id,
    title: task.title,
  });

  return task;
}
