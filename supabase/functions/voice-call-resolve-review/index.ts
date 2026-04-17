import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { authenticateRequest, ensureWorkspaceMembership } from '../_shared/server.ts';
import { addNoteToRecord } from '../_shared/records.ts';
import { updateVoiceCallReviewState } from '../_shared/voice-action-repository.ts';
import {
  findVoiceCallById,
  listVoiceCallActionRunsByVoiceCallId,
  updateVoiceCallActionRun,
} from '../_shared/voice-repository.ts';

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
    const reviewStatus = normalizeString(payload.review_status);
    const note = normalizeString(payload.note);

    if (!workspaceId || !voiceCallId || !reviewStatus) {
      return jsonResponse({ error: 'workspace_id, voice_call_id, and review_status are required.' }, 400);
    }

    if (!['resolved', 'dismissed', 'open'].includes(reviewStatus)) {
      return jsonResponse({ error: 'review_status must be open, resolved, or dismissed.' }, 400);
    }

    await ensureWorkspaceMembership(authContext.serviceClient, workspaceId, authContext.user.id);

    const currentCall = await findVoiceCallById(authContext.serviceClient, workspaceId, voiceCallId);
    const updated = await updateVoiceCallReviewState({
      db: authContext.serviceClient,
      workspaceId,
      voiceCallId,
      reviewStatus: reviewStatus as 'open' | 'resolved' | 'dismissed',
      reviewOwnerUserId: reviewStatus === 'open' ? authContext.user.id : currentCall.review_owner_user_id,
    });

    const runs = await listVoiceCallActionRunsByVoiceCallId(authContext.serviceClient, workspaceId, voiceCallId);
    const latestOpenReviewRun = runs.find((run) => run.action_type === 'open_review');

    if (latestOpenReviewRun) {
      const currentPayload =
        typeof latestOpenReviewRun.result_payload === 'object' &&
        latestOpenReviewRun.result_payload !== null &&
        !Array.isArray(latestOpenReviewRun.result_payload)
          ? latestOpenReviewRun.result_payload as Record<string, unknown>
          : {};

      await updateVoiceCallActionRun(authContext.serviceClient, {
        workspaceId,
        actionRunId: latestOpenReviewRun.id,
        resultPayload: {
          ...currentPayload,
          review_status: reviewStatus,
          resolution_note: note || null,
          resolved_by: authContext.user.id,
        },
      });
    }

    if (note && updated.record_id) {
      await addNoteToRecord(
        authContext.serviceClient,
        authContext.user.id,
        workspaceId,
        updated.record_id,
        `Voice review ${reviewStatus}: ${note}`,
      );
    }

    return jsonResponse({
      call: await findVoiceCallById(authContext.serviceClient, workspaceId, voiceCallId),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return jsonResponse({ error: message }, 500);
  }
});
