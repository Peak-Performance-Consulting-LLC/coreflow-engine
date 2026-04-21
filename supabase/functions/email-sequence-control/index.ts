import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { enrollRecordEmailFollowupIfEligible } from '../_shared/email-automation.ts';
import { authenticateRequest, ensureWorkspaceMembership } from '../_shared/server.ts';

interface RequestBody {
  workspace_id?: string;
  record_id?: string;
  action?: 'stop' | 'pause' | 'resume';
}

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  try {
    const authContext = await authenticateRequest(request);

    if (authContext instanceof Response) {
      return authContext;
    }

    const payload = (await request.json()) as RequestBody;
    const workspaceId = normalizeString(payload.workspace_id);
    const recordId = normalizeString(payload.record_id);
    const action = payload.action ?? 'stop';

    if (!workspaceId || !recordId) {
      return jsonResponse({ error: 'workspace_id and record_id are required.' }, 400);
    }

    await ensureWorkspaceMembership(authContext.serviceClient, workspaceId, authContext.user.id);

    if (action === 'resume') {
      const { data: record, error: recordError } = await authContext.serviceClient
        .from('records')
        .select('id, full_name, email')
        .eq('workspace_id', workspaceId)
        .eq('id', recordId)
        .maybeSingle();

      if (recordError) {
        return jsonResponse({ error: recordError.message }, 400);
      }

      if (!record) {
        return jsonResponse({ error: 'Record not found in workspace.' }, 404);
      }

      const result = await enrollRecordEmailFollowupIfEligible({
        db: authContext.serviceClient,
        workspaceId,
        recordId,
        actorUserId: authContext.user.id,
        recordEmail: record.email,
        recordFullName: record.full_name,
      });

      if (!result.enrolled) {
        return jsonResponse({
          error: `Unable to resume sequence: ${result.reason}`,
          reason: result.reason,
        }, 422);
      }

      return jsonResponse({
        record_id: recordId,
        action,
        followup_id: result.followupId,
        status: 'active',
      });
    }

    const { data: followup, error: followupError } = await authContext.serviceClient
      .from('record_email_followups')
      .select('id, status')
      .eq('workspace_id', workspaceId)
      .eq('record_id', recordId)
      .eq('status', 'active')
      .order('enrolled_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (followupError) {
      return jsonResponse({ error: followupError.message }, 400);
    }

    if (!followup) {
      return jsonResponse({ error: 'No active sequence found for this record.' }, 404);
    }

    const now = new Date().toISOString();
    const reason = action === 'pause' ? 'paused_by_user' : 'stopped_by_user';

    const { error: updateFollowupError } = await authContext.serviceClient
      .from('record_email_followups')
      .update({
        status: 'stopped',
        stop_reason: reason,
        stopped_at: now,
        updated_by: authContext.user.id,
        updated_at: now,
      })
      .eq('workspace_id', workspaceId)
      .eq('id', followup.id);

    if (updateFollowupError) {
      return jsonResponse({ error: updateFollowupError.message }, 400);
    }

    const { error: stepError } = await authContext.serviceClient
      .from('record_email_followup_steps')
      .update({
        status: 'canceled',
        last_error: `Sequence ${action}d by workspace user.`,
        updated_at: now,
      })
      .eq('workspace_id', workspaceId)
      .eq('followup_id', followup.id)
      .in('status', ['pending', 'claimed', 'sending']);

    if (stepError) {
      return jsonResponse({ error: stepError.message }, 400);
    }

    return jsonResponse({
      record_id: recordId,
      followup_id: followup.id,
      action,
      status: 'stopped',
      reason,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return jsonResponse({ error: message }, 400);
  }
});
