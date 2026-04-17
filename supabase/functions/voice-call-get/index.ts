import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { authenticateRequest, ensureWorkspaceMembership } from '../_shared/server.ts';
import { getVoiceCallOpsDetail } from '../_shared/voice-ops-repository.ts';

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
    const voiceCallId = normalizeString(payload.voice_call_id);

    if (!workspaceId || !voiceCallId) {
      return jsonResponse({ error: 'workspace_id and voice_call_id are required.' }, 400);
    }

    await ensureWorkspaceMembership(authContext.serviceClient, workspaceId, authContext.user.id);
    const detail = await getVoiceCallOpsDetail(authContext.serviceClient, workspaceId, voiceCallId);
    return jsonResponse(detail);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    const status = message.includes('not found') ? 404 : 500;
    return jsonResponse({ error: message }, status);
  }
});
