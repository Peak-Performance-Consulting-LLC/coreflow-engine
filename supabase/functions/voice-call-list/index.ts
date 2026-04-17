import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { authenticateRequest, ensureWorkspaceMembership } from '../_shared/server.ts';
import { listVoiceCallsForOps } from '../_shared/voice-ops-repository.ts';

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

    if (!workspaceId) {
      return jsonResponse({ error: 'workspace_id is required.' }, 400);
    }

    await ensureWorkspaceMembership(authContext.serviceClient, workspaceId, authContext.user.id);

    const result = await listVoiceCallsForOps(authContext.serviceClient, {
      workspaceId,
      outcomeStatus: normalizeString(payload.outcome_status) || null,
      reviewStatus: normalizeString(payload.review_status) || null,
      assistantId: normalizeString(payload.assistant_id) || null,
      phoneNumberId: normalizeString(payload.phone_number_id) || null,
      hasRecord: typeof payload.has_record === 'boolean' ? payload.has_record : null,
      dateFrom: normalizeString(payload.date_from) || null,
      dateTo: normalizeString(payload.date_to) || null,
      page: typeof payload.page === 'number' ? payload.page : undefined,
      pageSize: typeof payload.page_size === 'number' ? payload.page_size : undefined,
    });

    return jsonResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return jsonResponse({ error: message }, 500);
  }
});
