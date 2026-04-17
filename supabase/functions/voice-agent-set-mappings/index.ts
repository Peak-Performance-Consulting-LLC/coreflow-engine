import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { authenticateRequest, ensureWorkspaceOwner } from '../_shared/server.ts';
import {
  findVoiceAgentById,
  replaceVoiceAgentFieldMappings,
} from '../_shared/voice-agent-repository.ts';
import { validateVoiceAgentMappings } from '../_shared/voice-agent-validator.ts';

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
    const mappings = Array.isArray(payload.mappings) ? payload.mappings : null;

    if (!workspaceId || !voiceAgentId || mappings === null) {
      return jsonResponse({ error: 'workspace_id, voice_agent_id, and mappings are required.' }, 400);
    }

    await ensureWorkspaceOwner(authContext.serviceClient, workspaceId, authContext.user.id);
    const agent = await findVoiceAgentById(authContext.serviceClient, workspaceId, voiceAgentId);
    const validatedMappings = await validateVoiceAgentMappings(
      authContext.serviceClient,
      workspaceId,
      mappings
        .filter((mapping) => typeof mapping === 'object' && mapping !== null && !Array.isArray(mapping))
        .map((mapping) => {
          const next = mapping as Record<string, unknown>;
          return {
            source_key: typeof next.source_key === 'string' ? next.source_key : '',
            source_label: typeof next.source_label === 'string' ? next.source_label : '',
            source_description:
              typeof next.source_description === 'string' ? next.source_description : next.source_description === null ? null : undefined,
            source_value_type: typeof next.source_value_type === 'string' ? next.source_value_type : '',
            target_type: next.target_type === 'custom' ? 'custom' : 'core',
            target_key: typeof next.target_key === 'string' ? next.target_key : '',
            is_required: typeof next.is_required === 'boolean' ? next.is_required : false,
            position: typeof next.position === 'number' ? next.position : undefined,
          };
        }),
    );

    if (agent.status === 'active' && validatedMappings.length === 0) {
      return jsonResponse({
        error: 'Active assistants must keep at least one field mapping.',
      }, 400);
    }

    const savedMappings = await replaceVoiceAgentFieldMappings(authContext.serviceClient, {
      workspaceId,
      voiceAgentId,
      mappings: validatedMappings,
    });

    return jsonResponse({ mappings: savedMappings });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return jsonResponse({ error: message }, 400);
  }
});
