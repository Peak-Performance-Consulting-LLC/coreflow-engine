import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { authenticateRequest, ensureWorkspaceMembership } from '../_shared/server.ts';
import { applyLeadCreated, findVoiceCallById } from '../_shared/voice-repository.ts';
import { finalizeVoiceCallOutcome } from '../_shared/voice-outcome-finalizer.ts';
import { enqueueVoiceActionRunsForOutcome } from '../_shared/voice-action-repository.ts';
import { runVoiceAction } from '../_shared/voice-action-runner.ts';
import { retryLeadCreationForVoiceCall } from '../_shared/voice-call-lead-recovery.ts';

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

    const finalized = await finalizeVoiceCallOutcome({
      db: authContext.serviceClient,
      workspaceId,
      voiceCallId,
      outcomeStatus: 'lead_created',
      outcomeReason: 'lead_created_retry',
      outcomeError: null,
    });
    const runs = await enqueueVoiceActionRunsForOutcome({
      db: authContext.serviceClient,
      call: finalized,
      outcomeStatus: 'lead_created',
      outcomeReason: finalized.outcome_reason,
      outcomeError: finalized.outcome_error,
    });

    for (const run of runs) {
      await runVoiceAction({
        db: authContext.serviceClient,
        workspaceId,
        actionRunId: run.id,
        actorUserId: authContext.user.id,
      });
    }

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
