import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { listRecordsForWorkspace } from '../_shared/records.ts';
import { authenticateRequest, ensureWorkspaceMembership } from '../_shared/server.ts';

function normalizePositiveInteger(value: unknown, fallback: number) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(1, Math.trunc(parsed));
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

    const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const workspaceId = typeof payload.workspace_id === 'string' ? payload.workspace_id : '';

    if (!workspaceId) {
      return jsonResponse({ error: 'workspace_id is required.' }, 400);
    }

    await ensureWorkspaceMembership(authContext.serviceClient, workspaceId, authContext.user.id);

    const records = await listRecordsForWorkspace(authContext.serviceClient, {
      workspace_id: workspaceId,
      search: typeof payload.search === 'string' ? payload.search : '',
      stage_id: typeof payload.stage_id === 'string' ? payload.stage_id : null,
      source_id: typeof payload.source_id === 'string' ? payload.source_id : null,
      assignee_user_id: typeof payload.assignee_user_id === 'string' ? payload.assignee_user_id : null,
      status: typeof payload.status === 'string' ? payload.status : null,
      include_archived: Boolean(payload.include_archived),
      page: normalizePositiveInteger(payload.page, 1),
      pageSize: normalizePositiveInteger(payload.pageSize, 10),
    });

    return jsonResponse(records);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return jsonResponse({ error: message }, 500);
  }
});
