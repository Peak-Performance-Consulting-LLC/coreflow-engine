import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import {
  buildSourceFingerprint,
  getWorkspaceCrmType,
  loadFieldContext,
  loadTransformContext,
  transformMappedValue,
} from '../_shared/import-intelligence.ts';
import { createRecordForWorkspace } from '../_shared/records.ts';
import { authenticateRequest, ensureWorkspaceMembership } from '../_shared/server.ts';

const allowedEntityTypes = new Set(['record']);
const allowedTargetTypes = new Set(['core', 'custom']);
const allowedCoreTargetKeys = new Set([
  'title',
  'full_name',
  'company_name',
  'email',
  'phone',
  'status',
  'priority',
]);

interface ImportMappingPayload {
  source_column: string;
  semantic_id?: string | null;
  target_type: 'core' | 'custom';
  target_key: string;
  confidence?: number | null;
  status?: 'auto_mapped' | 'needs_confirmation' | 'new_semantic' | 'ignored' | 'confirmed';
  mapping_source?: 'profile' | 'exact' | 'alias' | 'heuristic' | 'manual' | 'none';
  notes?: string | null;
}

interface ImportRowPayload {
  id: string;
  row_index: number;
  raw_data: Record<string, unknown>;
}

interface CustomFieldDefinitionRow {
  field_key: string;
  label: string;
  field_type: string;
  is_required: boolean;
  options: unknown;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getTrimmedString(value: unknown) {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

function coerceCustomValue(value: unknown, definition: CustomFieldDefinitionRow) {
  const normalized = getTrimmedString(value);

  if (!normalized) {
    return null;
  }

  switch (definition.field_type) {
    case 'text':
    case 'textarea':
    case 'select':
      return normalized;
    case 'number': {
      const numericValue = Number(normalized.replace(/,/g, ''));

      if (Number.isNaN(numericValue)) {
        throw new Error(`${definition.label} expects a numeric value.`);
      }

      return numericValue;
    }
    case 'boolean': {
      const lower = normalized.toLowerCase();

      if (['true', '1', 'yes', 'y'].includes(lower)) {
        return true;
      }

      if (['false', '0', 'no', 'n'].includes(lower)) {
        return false;
      }

      throw new Error(`${definition.label} expects true/false or yes/no.`);
    }
    case 'date': {
      if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
        return normalized;
      }

      const parsed = new Date(normalized);

      if (Number.isNaN(parsed.getTime())) {
        throw new Error(`${definition.label} expects a valid date.`);
      }

      return parsed.toISOString().slice(0, 10);
    }
    case 'multi_select':
      return normalized
        .split(/[|;,]/)
        .map((item) => item.trim())
        .filter(Boolean);
    default:
      return normalized;
  }
}

function buildImportPayload(
  row: Record<string, unknown>,
  mappings: ImportMappingPayload[],
  customFieldByKey: Map<string, CustomFieldDefinitionRow>,
  transformContext: {
    rules: Array<{ target_type: string; target_key: string; rule_type: string; rule_config: Record<string, unknown> | null }>;
    optionAliases: Array<{ field_key: string; alias_value: string; canonical_value: string }>;
  },
  rowIndex: number,
) {
  const core: Record<string, string | null> = {};
  const custom: Record<string, unknown> = {};
  const transformed: Record<string, unknown> = {};
  const lineage: Array<{
    source_column: string;
    target_type: 'core' | 'custom';
    target_key: string;
    raw_value: unknown;
    normalized_value: unknown;
  }> = [];

  for (const mapping of mappings) {
    const rawValue = row[mapping.source_column];

    if (mapping.target_type === 'core') {
      const normalizedCoreValue = transformMappedValue({
        value: rawValue,
        targetType: 'core',
        targetKey: mapping.target_key,
        rules: transformContext.rules,
        optionAliases: transformContext.optionAliases,
      });
      const asString = normalizedCoreValue === null || normalizedCoreValue === undefined
        ? null
        : getTrimmedString(normalizedCoreValue) || null;
      core[mapping.target_key] = asString;
      transformed[mapping.source_column] = asString;
      lineage.push({
        source_column: mapping.source_column,
        target_type: mapping.target_type,
        target_key: mapping.target_key,
        raw_value: rawValue,
        normalized_value: asString,
      });
      continue;
    }

    const definition = customFieldByKey.get(mapping.target_key);

    if (!definition) {
      throw new Error(`Unknown custom field: ${mapping.target_key}`);
    }

    const normalizedCustomValue = transformMappedValue({
      value: rawValue,
      targetType: 'custom',
      targetKey: mapping.target_key,
      customFieldType: definition.field_type,
      rules: transformContext.rules,
      customOptions: Array.isArray(definition.options)
        ? definition.options.map((option) => getTrimmedString(option)).filter(Boolean)
        : [],
      optionAliases: transformContext.optionAliases,
    });
    custom[mapping.target_key] = normalizedCustomValue === null ? null : coerceCustomValue(normalizedCustomValue, definition);
    transformed[mapping.source_column] = custom[mapping.target_key];
    lineage.push({
      source_column: mapping.source_column,
      target_type: mapping.target_type,
      target_key: mapping.target_key,
      raw_value: rawValue,
      normalized_value: custom[mapping.target_key],
    });
  }

  core.title = core.title || core.full_name || core.company_name || core.email || core.phone || `Imported row ${rowIndex + 1}`;

  return { core, custom, transformed, lineage };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authContext = await authenticateRequest(request);

    if (authContext instanceof Response) {
      return authContext;
    }

    const payload = (await request.json()) as Record<string, unknown>;
    const workspaceId = typeof payload.workspace_id === 'string' ? payload.workspace_id : '';
    const fileName = typeof payload.file_name === 'string' ? payload.file_name.trim() : '';
    const entityType = typeof payload.entity_type === 'string' ? payload.entity_type : 'record';
    const sourceFingerprint = typeof payload.source_fingerprint === 'string' && payload.source_fingerprint.trim()
      ? payload.source_fingerprint.trim()
      : '';
    const profileId = typeof payload.profile_id === 'string' ? payload.profile_id.trim() : null;
    const inputRows = Array.isArray(payload.rows)
      ? payload.rows
      : Array.isArray(payload.preview_rows)
        ? payload.preview_rows
        : [];
    const mappings = Array.isArray(payload.mappings) ? payload.mappings : [];

    if (!workspaceId || !fileName) {
      return jsonResponse({ error: 'workspace_id and file_name are required.' }, 400);
    }

    if (!allowedEntityTypes.has(entityType)) {
      return jsonResponse({ error: 'entity_type is invalid.' }, 400);
    }

    await ensureWorkspaceMembership(authContext.serviceClient, workspaceId, authContext.user.id);

    const importRows = inputRows
      .filter((row) => isPlainObject(row))
      .map((row) => row as Record<string, unknown>);

    if (importRows.length === 0) {
      return jsonResponse({ error: 'At least one CSV data row is required.' }, 400);
    }

    const mappingRows = mappings
      .filter(
        (mapping) =>
          typeof (mapping as Record<string, unknown>).source_column === 'string' &&
          typeof (mapping as Record<string, unknown>).target_type === 'string' &&
          typeof (mapping as Record<string, unknown>).target_key === 'string',
      )
      .map((mapping) => {
        const next = mapping as Record<string, string>;

        return {
          source_column: next.source_column.trim(),
          semantic_id: typeof next.semantic_id === 'string' ? next.semantic_id.trim() : null,
          target_type: next.target_type as 'core' | 'custom',
          target_key: next.target_key.trim(),
          confidence: typeof (mapping as Record<string, unknown>).confidence === 'number'
            ? ((mapping as Record<string, unknown>).confidence as number)
            : null,
          status: typeof next.status === 'string'
            ? next.status as 'auto_mapped' | 'needs_confirmation' | 'new_semantic' | 'ignored' | 'confirmed'
            : 'confirmed',
          mapping_source: typeof next.mapping_source === 'string'
            ? next.mapping_source as 'profile' | 'exact' | 'alias' | 'heuristic' | 'manual' | 'none'
            : 'manual',
          notes: typeof next.notes === 'string' ? next.notes : null,
        };
      })
      .filter((mapping) => mapping.source_column && mapping.target_key);

    if (mappingRows.length === 0) {
      return jsonResponse({ error: 'Map at least one CSV column before importing.' }, 400);
    }

    const hasInvalidTargetType = mappingRows.some((mapping) => !allowedTargetTypes.has(mapping.target_type));

    if (hasInvalidTargetType) {
      return jsonResponse({ error: 'One or more import mappings use an invalid target_type.' }, 400);
    }

    const effectiveMappings = mappingRows.filter((mapping) => mapping.status !== 'ignored');

    if (effectiveMappings.length === 0) {
      return jsonResponse({ error: 'All mappings are ignored. Map at least one CSV column before importing.' }, 400);
    }

    const sourceColumns = new Set<string>();
    const targetPairs = new Set<string>();
    const mappedTargetLabels = new Set<string>();

    for (const mapping of effectiveMappings) {
      if (sourceColumns.has(mapping.source_column)) {
        return jsonResponse({ error: 'Each source column can only be mapped once per import job.' }, 400);
      }

      const targetKey = `${mapping.target_type}::${mapping.target_key}`;

      if (targetPairs.has(targetKey)) {
        return jsonResponse({ error: 'Each import target can only be mapped once per import job.' }, 400);
      }

      if (mapping.target_type === 'core' && !allowedCoreTargetKeys.has(mapping.target_key)) {
        return jsonResponse({ error: `Unsupported core import target: ${mapping.target_key}` }, 400);
      }

      sourceColumns.add(mapping.source_column);
      targetPairs.add(targetKey);
      mappedTargetLabels.add(`${mapping.target_type}:${mapping.target_key}`);
    }

    const crmType = await getWorkspaceCrmType(authContext.serviceClient, workspaceId);
    const fieldContext = await loadFieldContext(authContext.serviceClient, workspaceId, crmType);
    const requiredTargets = new Set(
      fieldContext.bindings
        .filter((binding) => binding.is_required)
        .map((binding) => `${binding.target_type}:${binding.target_key}`),
    );
    const missingRequiredTargets = [...requiredTargets].filter((target) => !mappedTargetLabels.has(target));

    if (missingRequiredTargets.length > 0) {
      return jsonResponse({
        error: `Required import targets are missing: ${missingRequiredTargets.join(', ')}`,
        missing_required_targets: missingRequiredTargets,
      }, 400);
    }

    const { data: customFieldDefinitions, error: customFieldError } = await authContext.serviceClient
      .from('custom_field_definitions')
      .select('field_key, label, field_type, is_required, options')
      .eq('workspace_id', workspaceId)
      .eq('entity_type', 'record')
      .eq('is_active', true);

    if (customFieldError) {
      return jsonResponse({ error: customFieldError.message }, 500);
    }

    const customFieldByKey = new Map(
      ((customFieldDefinitions ?? []) as CustomFieldDefinitionRow[]).map((field) => [field.field_key, field]),
    );
    const requiredCustomTargets = ((customFieldDefinitions ?? []) as CustomFieldDefinitionRow[])
      .filter((field) => field.is_required)
      .map((field) => `custom:${field.field_key}`);

    for (const mapping of effectiveMappings) {
      if (mapping.target_type === 'custom' && !customFieldByKey.has(mapping.target_key)) {
        return jsonResponse({ error: `Unknown custom import target: ${mapping.target_key}` }, 400);
      }
    }

    const missingRequiredCustomTargets = requiredCustomTargets.filter((target) => !mappedTargetLabels.has(target));

    if (missingRequiredCustomTargets.length > 0) {
      return jsonResponse({
        error: `Required custom fields are missing: ${missingRequiredCustomTargets.join(', ')}`,
        missing_required_targets: [...missingRequiredTargets, ...missingRequiredCustomTargets],
      }, 400);
    }

    const { data: job, error: jobError } = await authContext.serviceClient
      .from('import_jobs')
      .insert({
        workspace_id: workspaceId,
        entity_type: entityType,
        file_name: fileName,
        status: 'pending',
        phase: 'ingest',
        source_fingerprint: sourceFingerprint || buildSourceFingerprint(Object.keys(importRows[0] ?? {})),
        profile_id: profileId,
        approval_status: 'approved',
        stats_json: {
          needs_confirmation_count: mappingRows.filter((mapping) => mapping.status === 'needs_confirmation').length,
          new_semantic_count: mappingRows.filter((mapping) => mapping.status === 'new_semantic').length,
          ignored_count: mappingRows.filter((mapping) => mapping.status === 'ignored').length,
        },
        total_rows: importRows.length,
        success_rows: 0,
        failed_rows: 0,
        created_by: authContext.user.id,
      })
      .select('id, workspace_id, entity_type, file_name, status, total_rows, success_rows, failed_rows, created_at, updated_at')
      .single();

    if (jobError || !job) {
      return jsonResponse({ error: jobError?.message || 'Unable to create import job.' }, 500);
    }

    const { error: mappingError } = await authContext.serviceClient.from('import_mappings').insert(
      mappingRows.map((mapping) => ({
        import_job_id: job.id,
        source_column: mapping.source_column,
        semantic_id: mapping.semantic_id ?? null,
        target_type: mapping.target_type,
        target_key: mapping.target_key,
        confidence: mapping.confidence ?? null,
        status: mapping.status ?? 'confirmed',
        mapping_source: mapping.mapping_source ?? 'manual',
        notes: mapping.notes ?? null,
      })),
    );

    if (mappingError) {
      await authContext.serviceClient
        .from('import_jobs')
        .update({ status: 'failed', failed_rows: importRows.length })
        .eq('id', job.id);
      return jsonResponse({ error: mappingError.message }, 500);
    }

    const { data: persistedImportRows, error: rowsError } = await authContext.serviceClient
      .from('import_rows')
      .insert(
        importRows.map((row, index) => ({
          import_job_id: job.id,
          row_index: index,
          raw_data: row,
          status: 'pending',
        })),
      )
      .select('id, row_index, raw_data');

    if (rowsError || !persistedImportRows) {
      await authContext.serviceClient
        .from('import_jobs')
        .update({ status: 'failed', failed_rows: importRows.length })
        .eq('id', job.id);
      return jsonResponse({ error: rowsError?.message || 'Unable to store import rows.' }, 500);
    }

    await authContext.serviceClient
      .from('import_jobs')
      .update({ status: 'processing', phase: 'execute' })
      .eq('id', job.id);

    const transformContext = await loadTransformContext(authContext.serviceClient, workspaceId, crmType);
    let successRows = 0;
    let failedRows = 0;
    const rowFailures: Array<{ rowIndex: number; error: string }> = [];

    for (const row of (persistedImportRows as ImportRowPayload[]).sort((left, right) => left.row_index - right.row_index)) {
      try {
        const importPayload = buildImportPayload(row.raw_data, effectiveMappings, customFieldByKey, transformContext, row.row_index);
        const created = await createRecordForWorkspace(authContext.serviceClient, authContext.user.id, {
          workspace_id: workspaceId,
          core: importPayload.core,
          custom: importPayload.custom,
        });

        await authContext.serviceClient
          .from('records')
          .update({
            imported_from: job.id,
            updated_by: authContext.user.id,
          })
          .eq('workspace_id', workspaceId)
          .eq('id', created.record.id);

        const { error: rowUpdateError } = await authContext.serviceClient
          .from('import_rows')
          .update({
            status: 'processed',
            error_message: null,
            transformed_data: importPayload.transformed,
            validation_errors: null,
            lineage: importPayload.lineage,
            created_record_id: created.record.id,
          })
          .eq('id', row.id);

        if (rowUpdateError) {
          throw new Error(rowUpdateError.message);
        }

        successRows += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to import row.';

        await authContext.serviceClient
          .from('import_rows')
          .update({
            status: 'failed',
            error_message: message,
            transformed_data: null,
            validation_errors: [{ message }],
            lineage: null,
            created_record_id: null,
          })
          .eq('id', row.id);

        failedRows += 1;
        rowFailures.push({
          rowIndex: row.row_index,
          error: message,
        });
      }
    }

    const finalStatus = successRows > 0 ? 'completed' : 'failed';
    const { data: completedJob, error: jobUpdateError } = await authContext.serviceClient
      .from('import_jobs')
      .update({
        status: finalStatus,
        phase: 'completed',
        success_rows: successRows,
        failed_rows: failedRows,
        stats_json: {
          total_rows: importRows.length,
          success_rows: successRows,
          failed_rows: failedRows,
          missing_required_targets: missingRequiredTargets,
        },
      })
      .eq('id', job.id)
      .select('id, workspace_id, entity_type, file_name, status, total_rows, success_rows, failed_rows, created_at, updated_at')
      .single();

    if (jobUpdateError || !completedJob) {
      return jsonResponse({ error: jobUpdateError?.message || 'Unable to finalize import job.' }, 500);
    }

    const summaryMessage = failedRows === 0
      ? `Imported ${successRows} ${successRows === 1 ? 'record' : 'records'} successfully.`
      : successRows === 0
        ? `Import failed for all ${failedRows} ${failedRows === 1 ? 'row' : 'rows'}.`
        : `Imported ${successRows} ${successRows === 1 ? 'record' : 'records'} with ${failedRows} failed ${failedRows === 1 ? 'row' : 'rows'}.`;

    return jsonResponse({
      job: completedJob,
      importExecutionImplemented: true,
      totalRows: importRows.length,
      importedCount: successRows,
      failedCount: failedRows,
      failures: rowFailures.slice(0, 10),
      message: summaryMessage,
    }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return jsonResponse({ error: message }, 400);
  }
});
