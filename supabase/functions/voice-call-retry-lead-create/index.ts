import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { authenticateRequest, ensureWorkspaceMembership } from '../_shared/server.ts';
import { applyLeadCreated, findVoiceCallById } from '../_shared/voice-repository.ts';
import { retryLeadCreationForVoiceCall } from '../_shared/voice-call-lead-recovery.ts';
import { processVoicePostCallPipeline } from '../_shared/voice-post-call-pipeline.ts';

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
    const currentCall = await findVoiceCallById(authContext.serviceClient, workspaceId, voiceCallId);

    if (currentCall.record_id && currentCall.lead_creation_status === 'created') {
      return jsonResponse({
        call: currentCall,
        record_id: currentCall.record_id,
        result: 'already_created',
      });
    }

    const recovered = await retryLeadCreationForVoiceCall({
      db: authContext.serviceClient,
      workspaceId,
      voiceCallId,
      actorUserId: authContext.user.id,
    });

    await applyLeadCreated(authContext.serviceClient, {
      workspaceId,
      voiceCallId,
      recordId: recovered.created.recordId,
    });
    await processVoicePostCallPipeline({
      db: authContext.serviceClient,
      workspaceId,
      voiceCallId,
    });

    return jsonResponse({
      call: await findVoiceCallById(authContext.serviceClient, workspaceId, voiceCallId),
      record_id: recovered.created.recordId,
      result: 'lead_created',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return jsonResponse({ error: message }, 500);
  }
});
