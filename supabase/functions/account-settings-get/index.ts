import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import {
  ensureWorkspaceEmailAutomationDefaults,
  getWorkspaceAutomationSettings,
  listWorkspaceEmailSenders,
  listWorkspaceSequenceSteps,
} from '../_shared/email-automation.ts';
import { authenticateRequest, ensureWorkspaceMembership } from '../_shared/server.ts';

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

    // ── Resolve workspace_id: accept from body OR auto-resolve from membership ──
    let workspaceId = '';

    // Only parse body if content-type is JSON and there is a body
    const contentType = request.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      try {
        const payload = (await request.json()) as Record<string, unknown>;
        workspaceId = normalizeString(payload.workspace_id);
      } catch {
        // body may be empty – fall through to auto-resolve
      }
    }

    // Auto-resolve from workspace_members if not provided in body
    if (!workspaceId) {
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

      workspaceId = memberRow.workspace_id;
    }

    const membership = await ensureWorkspaceMembership(authContext.serviceClient, workspaceId, authContext.user.id);
    const canManage = true;

    // Initialize defaults (idempotent, skip gracefully if schema not cached yet)
    try {
      await ensureWorkspaceEmailAutomationDefaults(authContext.serviceClient, workspaceId, authContext.user.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (!msg.includes('Could not find')) throw err;
    }

    const [{ data: profile, error: profileError }, senders, automation, sequenceSteps] = await Promise.all([
      authContext.serviceClient
        .from('profiles')
        .select('id, full_name')
        .eq('id', authContext.user.id)
        .maybeSingle(),
      listWorkspaceEmailSenders(authContext.serviceClient, workspaceId),
      getWorkspaceAutomationSettings(authContext.serviceClient, workspaceId),
      listWorkspaceSequenceSteps(authContext.serviceClient, workspaceId, false),
    ]);

    if (profileError) {
      return jsonResponse({ error: profileError.message }, 400);
    }

    return jsonResponse({
      profile: {
        id: authContext.user.id,
        email: authContext.user.email ?? null,
        full_name: profile?.full_name ?? null,
      },
      workspace: {
        id: workspaceId,
        role: membership.role,
        can_manage: canManage,
      },
      senders: senders.map((sender) => ({
        id: sender.id,
        provider: sender.provider,
        sender_email: sender.sender_email,
        sender_name: sender.sender_name,
        status: sender.status,
        is_default: sender.is_default,
        is_active: sender.is_active,
        health_status: sender.health_status,
        last_health_error: sender.last_health_error,
        connected_at: sender.connected_at ?? null,
        smtp_host: sender.provider === 'smtp' ? sender.smtp_host : null,
        smtp_port: sender.provider === 'smtp' ? sender.smtp_port : null,
        smtp_username: sender.provider === 'smtp' ? sender.smtp_username : null,
        smtp_use_tls: sender.provider === 'smtp' ? sender.smtp_use_tls : null,
      })),
      automation: automation ?? {
        workspace_id: workspaceId,
        is_enabled: false,
        timezone: 'UTC',
        stop_on_reply: false,
        send_window_start_hour: null,
        send_window_end_hour: null,
        send_window_days: [1, 2, 3, 4, 5, 6, 7],
      },
      sequence_steps: sequenceSteps,
      tokens: ['{{lead_full_name}}', '{{lead_email}}', '{{workspace_name}}', '{{sender_name}}'],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return jsonResponse({ error: message }, 400);
  }
});
