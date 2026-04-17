import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { authenticateRequest, ensureWorkspaceMembership } from '../_shared/server.ts';

const allowedEntityTypes = new Set(['record']);
const allowedTargetTypes = new Set(['core', 'custom']);

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
    const previewRows = Array.isArray(payload.preview_rows) ? payload.preview_rows : [];
    const mappings = Array.isArray(payload.mappings) ? payload.mappings : [];

    if (!workspaceId || !fileName) {
      return jsonResponse({ error: 'workspace_id and file_name are required.' }, 400);
    }

    if (!allowedEntityTypes.has(entityType)) {
      return jsonResponse({ error: 'entity_type is invalid.' }, 400);
    }

    await ensureWorkspaceMembership(authContext.serviceClient, workspaceId, authContext.user.id);

    const { data: job, error: jobError } = await authContext.serviceClient
      .from('import_jobs')
      .insert({
        workspace_id: workspaceId,
        entity_type: entityType,
        file_name: fileName,
        status: 'pending',
        total_rows: previewRows.length,
        success_rows: 0,
        failed_rows: 0,
        created_by: authContext.user.id,
      })
      .select('id, workspace_id, entity_type, file_name, status, total_rows, success_rows, failed_rows, created_at, updated_at')
      .single();

    if (jobError || !job) {
      return jsonResponse({ error: jobError?.message || 'Unable to create import job.' }, 500);
    }

    if (mappings.length > 0) {
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
            import_job_id: job.id,
            source_column: next.source_column,
            target_type: next.target_type,
            target_key: next.target_key,
          };
        });

      const hasInvalidTargetType = mappingRows.some((mapping) => !allowedTargetTypes.has(mapping.target_type));

      if (hasInvalidTargetType) {
        return jsonResponse({ error: 'One or more import mappings use an invalid target_type.' }, 400);
      }

      const sourceColumns = new Set<string>();
      const targetPairs = new Set<string>();

      for (const mapping of mappingRows) {
        if (sourceColumns.has(mapping.source_column)) {
          return jsonResponse({ error: 'Each source column can only be mapped once per import job.' }, 400);
        }

        const targetKey = `${mapping.target_type}::${mapping.target_key}`;

        if (targetPairs.has(targetKey)) {
          return jsonResponse({ error: 'Each import target can only be mapped once per import job.' }, 400);
        }

        sourceColumns.add(mapping.source_column);
        targetPairs.add(targetKey);
      }

      if (mappingRows.length > 0) {
        const { error: mappingError } = await authContext.serviceClient.from('import_mappings').insert(mappingRows);

        if (mappingError) {
          return jsonResponse({ error: mappingError.message }, 500);
        }
      }
    }

    if (previewRows.length > 0) {
      const rowRecords = previewRows
        .filter((row) => typeof row === 'object' && row !== null && !Array.isArray(row))
        .map((row, index) => ({
          import_job_id: job.id,
          row_index: index,
          raw_data: row,
          status: 'pending',
        }));

      if (rowRecords.length > 0) {
        const { error: rowsError } = await authContext.serviceClient.from('import_rows').insert(rowRecords);

        if (rowsError) {
          return jsonResponse({ error: rowsError.message }, 500);
        }
      }
    }

    return jsonResponse({
      job,
      importExecutionImplemented: false,
      message: 'Import job scaffold created. Mapping and preview rows are stored, but execution is not implemented yet.',
    }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return jsonResponse({ error: message }, 400);
  }
});
