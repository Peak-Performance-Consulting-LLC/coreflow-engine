import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { authenticateRequest, ensureWorkspaceOwner } from '../_shared/server.ts';
import { upsertVoiceAgentBinding } from '../_shared/voice-agent-repository.ts';
import { assertVoiceAgentBindingIsValid } from '../_shared/voice-agent-validator.ts';

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
    const workspacePhoneNumberId =
      typeof payload.workspace_phone_number_id === 'string' ? payload.workspace_phone_number_id.trim() : '';
    const isActive = typeof payload.is_active === 'boolean' ? payload.is_active : null;

    if (!workspaceId || !voiceAgentId || !workspacePhoneNumberId || isActive === null) {
      return jsonResponse({ error: 'workspace_id, voice_agent_id, workspace_phone_number_id, and is_active are required.' }, 400);
    }

    await ensureWorkspaceOwner(authContext.serviceClient, workspaceId, authContext.user.id);
    await assertVoiceAgentBindingIsValid(
      authContext.serviceClient,
      workspaceId,
      voiceAgentId,
      workspacePhoneNumberId,
      isActive,
    );

    const binding = await upsertVoiceAgentBinding(authContext.serviceClient, {
      workspaceId,
      voiceAgentId,
      workspacePhoneNumberId,
      isActive,
    });

    return jsonResponse({ binding });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return jsonResponse({ error: message }, 400);
  }
});
