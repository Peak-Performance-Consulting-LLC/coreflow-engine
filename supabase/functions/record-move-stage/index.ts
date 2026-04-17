import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { moveRecordStageForWorkspace } from '../_shared/records.ts';
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

    const payload = (await request.json()) as Record<string, unknown>;
    const workspaceId = typeof payload.workspace_id === 'string' ? payload.workspace_id : '';
    const recordId = typeof payload.record_id === 'string' ? payload.record_id : '';
    const stageId = typeof payload.stage_id === 'string' ? payload.stage_id : '';

    if (!workspaceId || !recordId || !stageId) {
      return jsonResponse({ error: 'workspace_id, record_id, and stage_id are required.' }, 400);
    }

    await ensureWorkspaceMembership(authContext.serviceClient, workspaceId, authContext.user.id);
    const record = await moveRecordStageForWorkspace(
      authContext.serviceClient,
      authContext.user.id,
      workspaceId,
      recordId,
      stageId,
    );

    return jsonResponse(record);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return jsonResponse({ error: message }, 400);
  }
});
