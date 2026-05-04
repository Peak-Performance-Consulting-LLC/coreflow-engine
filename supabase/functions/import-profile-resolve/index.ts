import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import {
  buildSourceFingerprint,
  getWorkspaceCrmType,
  resolveImportProfile,
} from '../_shared/import-intelligence.ts';
import { authenticateRequest, ensureWorkspaceMembership } from '../_shared/server.ts';

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

    if (!workspaceId) {
      return jsonResponse({ error: 'workspace_id is required.' }, 400);
    }

    await ensureWorkspaceMembership(authContext.serviceClient, workspaceId, authContext.user.id);

    const columns = (Array.isArray(payload.columns) ? payload.columns : [])
      .map((column) => (typeof column === 'string' ? column.trim() : ''))
      .filter(Boolean);

    if (columns.length === 0) {
      return jsonResponse({ error: 'columns are required.' }, 400);
    }

    const crmType = await getWorkspaceCrmType(authContext.serviceClient, workspaceId);
    const profile = await resolveImportProfile(authContext.serviceClient, workspaceId, crmType, columns);

    return jsonResponse({
      workspace_id: workspaceId,
      crm_type: crmType,
      source_fingerprint: buildSourceFingerprint(columns),
      profile,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return jsonResponse({ error: message }, 400);
  }
});
