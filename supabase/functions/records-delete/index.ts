import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { authenticateRequest, ensureWorkspaceMembership } from '../_shared/server.ts';

function parseRecordIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(
    value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter((item) => item.length > 0),
  ));
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
    const recordIds = parseRecordIds(payload.record_ids);

    if (!workspaceId) {
      return jsonResponse({ error: 'workspace_id is required.' }, 400);
    }

    if (recordIds.length === 0) {
      return jsonResponse({ error: 'record_ids is required.' }, 400);
    }

    if (recordIds.length > 200) {
      return jsonResponse({ error: 'You can delete at most 200 records at a time.' }, 400);
    }

    await ensureWorkspaceMembership(authContext.serviceClient, workspaceId, authContext.user.id);

    const { data: existingRecords, error: existingError } = await authContext.serviceClient
      .from('records')
      .select('id')
      .eq('workspace_id', workspaceId)
      .in('id', recordIds);

    if (existingError) {
      throw new Error(existingError.message);
    }

    const existingIds = (existingRecords ?? []).map((record) => record.id as string);
    const existingIdSet = new Set(existingIds);
    const skippedIds = recordIds.filter((id) => !existingIdSet.has(id));

    if (existingIds.length === 0) {
      return jsonResponse({
        deleted_count: 0,
        deleted_ids: [],
        requested_count: recordIds.length,
        skipped_ids: skippedIds,
      });
    }

    // Voice call history can keep the call while detaching the record reference.
    const { error: detachError } = await authContext.serviceClient
      .from('voice_calls')
      .update({ record_id: null })
      .eq('workspace_id', workspaceId)
      .in('record_id', existingIds);

    if (detachError) {
      throw new Error(detachError.message);
    }

    const { data: deletedRecords, error: deleteError } = await authContext.serviceClient
      .from('records')
      .delete()
      .eq('workspace_id', workspaceId)
      .in('id', existingIds)
      .select('id');

    if (deleteError) {
      throw new Error(deleteError.message);
    }

    const deletedIds = (deletedRecords ?? []).map((record) => record.id as string);

    return jsonResponse({
      deleted_count: deletedIds.length,
      deleted_ids: deletedIds,
      requested_count: recordIds.length,
      skipped_ids: skippedIds,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return jsonResponse({ error: message }, 400);
  }
});
