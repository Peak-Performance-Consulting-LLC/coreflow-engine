import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { enrollRecordEmailFollowupIfEligible } from '../_shared/email-automation.ts';
import { authenticateRequest } from '../_shared/server.ts';

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

    const payload = (await request.json()) as Record<string, unknown>;
    const recordId = normalizeString(payload.record_id);

    if (!recordId) {
      return jsonResponse({ error: 'record_id is required.' }, 400);
    }

    // Resolve workspace from membership
    const { data: memberRow, error: memberError } = await authContext.serviceClient
      .from('workspace_members')
      .select('workspace_id, role')
      .eq('user_id', authContext.user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (memberError) {
      return jsonResponse({ error: memberError.message }, 500);
    }

    if (!memberRow) {
      return jsonResponse({ error: 'No workspace found for this user.' }, 404);
    }

    const workspaceId = memberRow.workspace_id;

    // Check record belongs to this workspace
    const { data: record, error: recordError } = await authContext.serviceClient
      .from('records')
      .select('id, title, full_name, email')
      .eq('workspace_id', workspaceId)
      .eq('id', recordId)
      .maybeSingle();

    if (recordError) {
      return jsonResponse({ error: recordError.message }, 500);
    }

    if (!record) {
      return jsonResponse({ error: 'Record not found in your workspace.' }, 404);
    }

    const result = await enrollRecordEmailFollowupIfEligible({
      db: authContext.serviceClient,
      workspaceId,
      recordId,
      actorUserId: authContext.user.id,
      recordEmail: (record as Record<string, string | null>).email,
      recordFullName: (record as Record<string, string | null>).full_name,
    });

    if (!result.enrolled) {
      const reasonMessages: Record<string, string> = {
        automation_disabled: 'Email automation is disabled for this workspace. Enable it in Email Settings.',
        sender_not_connected: 'No connected email sender found. Add a sender in Email Settings.',
        missing_email: 'This lead has no email address. Add one before enrolling.',
        no_sequence_steps: 'No active email sequence steps configured. Add steps in Email Settings.',
        already_enrolled: 'This lead is already enrolled in an active email sequence.',
        record_or_workspace_missing: 'Record or workspace data is missing.',
        missing_context: 'Missing required context to enroll this record.',
      };

      return jsonResponse(
        { error: reasonMessages[result.reason] ?? `Could not enroll: ${result.reason}` },
        422,
      );
    }

    // Count steps that were created
    const { count } = await authContext.serviceClient
      .from('record_email_followup_steps')
      .select('id', { count: 'exact', head: true })
      .eq('followup_id', result.followupId);

    const leadName = normalizeString((record as Record<string, string | null>).full_name) ||
      normalizeString((record as Record<string, string | null>).title) ||
      'Lead';

    return jsonResponse({
      followup_id: result.followupId,
      steps_scheduled: count ?? 0,
      message: `Enrolled "${leadName}" in ${count ?? 0}-step email sequence.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return jsonResponse({ error: message }, 400);
  }
});
