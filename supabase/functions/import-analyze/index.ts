import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import {
  analyzeImportColumns,
  getWorkspaceCrmType,
  resolveImportProfile,
} from '../_shared/import-intelligence.ts';
import { authenticateRequest, ensureWorkspaceMembership, isRecordLike } from '../_shared/server.ts';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authContext = await authenticateRequest(request);

    if (authContext instanceof Response) {
      return authContext;
    }

    const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const workspaceId = typeof payload.workspace_id === 'string' ? payload.workspace_id.trim() : '';
    const inputColumns = Array.isArray(payload.columns) ? payload.columns : [];
    const inputRows = Array.isArray(payload.rows)
      ? payload.rows
      : Array.isArray(payload.preview_rows)
        ? payload.preview_rows
        : [];

    if (!workspaceId) {
      return jsonResponse({ error: 'workspace_id is required.' }, 400);
    }

    await ensureWorkspaceMembership(authContext.serviceClient, workspaceId, authContext.user.id);

    const rows = inputRows
      .filter((row) => isRecordLike(row))
      .map((row) => row as Record<string, unknown>);

    const columns = inputColumns
      .map((column) => (typeof column === 'string' ? column.trim() : ''))
      .filter(Boolean);

    if (columns.length === 0 && rows.length > 0) {
      const derivedColumns = Object.keys(rows[0]).map((column) => column.trim()).filter(Boolean);
      columns.push(...derivedColumns);
    }

    if (columns.length === 0) {
      return jsonResponse({ error: 'At least one column is required to analyze mappings.' }, 400);
    }

    const crmType = await getWorkspaceCrmType(authContext.serviceClient, workspaceId);
    const profile = await resolveImportProfile(authContext.serviceClient, workspaceId, crmType, columns).catch(() => null);

    const analysis = await analyzeImportColumns({
      serviceClient: authContext.serviceClient,
      workspaceId,
      columns,
      sampleRows: rows.slice(0, 25),
      profile,
    });

    return jsonResponse({
      workspace_id: workspaceId,
      crm_type: analysis.crmType,
      source_fingerprint: analysis.sourceFingerprint,
      profile: analysis.profile,
      suggestions: analysis.suggestions,
      required_missing_targets: analysis.requiredMissingTargets,
      needs_confirmation_count: analysis.suggestions.filter((item) => item.status === 'needs_confirmation').length,
      new_semantic_count: analysis.suggestions.filter((item) => item.status === 'new_semantic').length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return jsonResponse({ error: message }, 400);
  }
});
