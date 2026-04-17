import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { authenticateRequest, ensureWorkspaceMembership } from '../_shared/server.ts';
import { findVoiceCallActionRunById } from '../_shared/voice-repository.ts';
import { runVoiceAction } from '../_shared/voice-action-runner.ts';

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
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
    const workspaceId = normalizeString(payload.workspace_id);
    const actionRunId = normalizeString(payload.action_run_id);

    if (!workspaceId || !actionRunId) {
      return jsonResponse({ error: 'workspace_id and action_run_id are required.' }, 400);
    }

    await ensureWorkspaceMembership(authContext.serviceClient, workspaceId, authContext.user.id);
    await findVoiceCallActionRunById(authContext.serviceClient, workspaceId, actionRunId);
    const actionRun = await runVoiceAction({
      db: authContext.serviceClient,
      workspaceId,
      actionRunId,
      actorUserId: authContext.user.id,
    });

    return jsonResponse({ action_run: actionRun });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return jsonResponse({ error: message }, 500);
  }
});
