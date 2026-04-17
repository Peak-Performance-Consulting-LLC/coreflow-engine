import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { authenticateRequest, ensureWorkspaceOwner } from '../_shared/server.ts';
import { deleteTelnyxAssistant } from '../_shared/telnyx-assistant-client.ts';
import { TelnyxApiError } from '../_shared/telnyx-client.ts';
import { deleteVoiceAgent, findVoiceAgentById } from '../_shared/voice-agent-repository.ts';

function shouldIgnoreMissingTelnyxAssistant(error: unknown) {
  return error instanceof TelnyxApiError && error.status === 404;
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
    const workspaceId = typeof payload.workspace_id === 'string' ? payload.workspace_id.trim() : '';
    const voiceAgentId = typeof payload.voice_agent_id === 'string' ? payload.voice_agent_id.trim() : '';

    if (!workspaceId || !voiceAgentId) {
      return jsonResponse({ error: 'workspace_id and voice_agent_id are required.' }, 400);
    }

    await ensureWorkspaceOwner(authContext.serviceClient, workspaceId, authContext.user.id);
    const agent = await findVoiceAgentById(authContext.serviceClient, workspaceId, voiceAgentId);

    if (agent.telnyx_assistant_id) {
      try {
        await deleteTelnyxAssistant({ assistantId: agent.telnyx_assistant_id });
      } catch (error) {
        if (!shouldIgnoreMissingTelnyxAssistant(error)) {
          throw error;
        }
      }
    }

    const deletedAgent = await deleteVoiceAgent(authContext.serviceClient, workspaceId, voiceAgentId);
    return jsonResponse({ agent: deletedAgent });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return jsonResponse({ error: message }, 400);
  }
});
