import type { EdgeClient } from './server.ts';
import { getTemplateForCrmType, type CRMType } from './crm-templates.ts';

interface WorkspaceSeedInput {
  workspaceId: string;
  crmType: CRMType;
}

export async function seedWorkspaceCrmConfig(serviceClient: EdgeClient, { workspaceId, crmType }: WorkspaceSeedInput) {
  const template = getTemplateForCrmType(crmType);

  if (!template) {
    throw new Error(`Unsupported CRM type: ${crmType}`);
  }

  const { data: pipeline, error: pipelineError } = await serviceClient
    .from('pipelines')
    .upsert(
      {
        workspace_id: workspaceId,
        entity_type: 'record',
        name: template.pipelineName,
        is_default: true,
      },
      { onConflict: 'workspace_id,entity_type,name' },
    )
    .select('id')
    .single();

  if (pipelineError || !pipeline) {
    throw new Error(pipelineError?.message || 'Unable to seed default pipeline.');
  }

  const stageRows = template.stages.map((stage, index) => ({
    workspace_id: workspaceId,
    pipeline_id: pipeline.id,
    name: stage.name,
    position: index,
    color: stage.color ?? null,
    is_closed: stage.is_closed ?? false,
    win_probability: stage.win_probability ?? null,
  }));

  const { error: stageError } = await serviceClient
    .from('pipeline_stages')
    .upsert(stageRows, { onConflict: 'workspace_id,pipeline_id,name' });

  if (stageError) {
    throw new Error(stageError.message);
  }

  const sourceRows = template.sources.map((source) => ({
    workspace_id: workspaceId,
    name: source.name,
    source_type: source.source_type ?? null,
    is_active: true,
  }));

  const { error: sourceError } = await serviceClient
    .from('record_sources')
    .upsert(sourceRows, { onConflict: 'workspace_id,name' });

  if (sourceError) {
    throw new Error(sourceError.message);
  }

  const fieldRows = template.fields.map((field, index) => ({
    workspace_id: workspaceId,
    entity_type: 'record',
    industry_type: crmType,
    field_key: field.field_key,
    label: field.label,
    field_type: field.field_type,
    is_required: field.is_required ?? false,
    is_system: false,
    is_active: true,
    position: index,
    placeholder: field.placeholder ?? null,
    help_text: field.help_text ?? null,
    default_value: field.default_value ?? null,
    options: field.options ? field.options : null,
    validation_rules: field.validation_rules ?? {},
    visibility_rules: {},
  }));

  const { data: existingFields, error: existingFieldsError } = await serviceClient
    .from('custom_field_definitions')
    .select('field_key')
    .eq('workspace_id', workspaceId)
    .eq('entity_type', 'record');

  if (existingFieldsError) {
    throw new Error(existingFieldsError.message);
  }

  const existingFieldKeys = new Set(
    (existingFields ?? [])
      .map((row) => (typeof row.field_key === 'string' ? row.field_key.trim() : ''))
      .filter((value) => value.length > 0),
  );
  const missingFieldRows = fieldRows.filter((field) => !existingFieldKeys.has(field.field_key));

  if (missingFieldRows.length === 0) {
    return;
  }

  const { error: fieldInsertError } = await serviceClient
    .from('custom_field_definitions')
    .insert(missingFieldRows);

  if (fieldInsertError) {
    throw new Error(fieldInsertError.message);
  }
}
