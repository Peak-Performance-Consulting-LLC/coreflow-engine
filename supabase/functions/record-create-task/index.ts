import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { createTaskForRecord } from '../_shared/records.ts';
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

    if (!workspaceId || !recordId) {
      return jsonResponse({ error: 'workspace_id and record_id are required.' }, 400);
    }

    await ensureWorkspaceMembership(authContext.serviceClient, workspaceId, authContext.user.id);
    const task = await createTaskForRecord(authContext.serviceClient, authContext.user.id, workspaceId, recordId, {
      title: payload.title,
      description: payload.description,
      priority: payload.priority,
      due_at: payload.due_at,
      assigned_to: payload.assigned_to,
    });

    return jsonResponse({ task }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return jsonResponse({ error: message }, 400);
  }
});
