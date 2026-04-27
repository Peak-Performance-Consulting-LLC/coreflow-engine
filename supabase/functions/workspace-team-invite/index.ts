import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { authenticateRequest, ensureWorkspaceOwner } from '../_shared/server.ts';

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(value: unknown) {
  return normalizeString(value).toLowerCase();
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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
    const workspaceId = normalizeString(payload.workspace_id);
    const invitedEmail = normalizeEmail(payload.invited_email);
    const role = normalizeString(payload.role) || 'agent';

    if (!workspaceId) {
      return jsonResponse({ error: 'workspace_id is required.' }, 400);
    }

    if (!invitedEmail || !isValidEmail(invitedEmail)) {
      return jsonResponse({ error: 'A valid invited_email is required.' }, 400);
    }

    if (role !== 'agent') {
      return jsonResponse({ error: 'Only the agent role can be invited.' }, 400);
    }

    await ensureWorkspaceOwner(authContext.serviceClient, workspaceId, authContext.user.id);

    if (invitedEmail === (authContext.user.email ?? '').trim().toLowerCase()) {
      return jsonResponse({ error: 'You already own this workspace.' }, 400);
    }

    const { data: existingInvite, error: existingInviteError } = await authContext.serviceClient
      .from('workspace_member_invites')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('invited_email', invitedEmail)
      .eq('status', 'pending')
      .maybeSingle();

    if (existingInviteError) {
      return jsonResponse({ error: existingInviteError.message }, 500);
    }

    if (existingInvite) {
      return jsonResponse({ error: 'This email already has a pending invite.' }, 409);
    }

    const { data: members, error: membersError } = await authContext.serviceClient
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', workspaceId);

    if (membersError) {
      return jsonResponse({ error: membersError.message }, 500);
    }

    for (const member of members ?? []) {
      const { data, error } = await authContext.serviceClient.auth.admin.getUserById(member.user_id);

      if (error) {
        return jsonResponse({ error: error.message || 'Unable to validate existing members.' }, 500);
      }

      const memberEmail = data.user?.email?.trim().toLowerCase() ?? '';
      if (memberEmail && memberEmail === invitedEmail) {
        return jsonResponse({ error: 'This user is already a member of the workspace.' }, 409);
      }
    }

    const { data: invite, error: inviteError } = await authContext.serviceClient
      .from('workspace_member_invites')
      .insert({
        workspace_id: workspaceId,
        invited_email: invitedEmail,
        role,
        invited_by: authContext.user.id,
      })
      .select('id, invited_email, role, status, created_at')
      .single();

    if (inviteError || !invite) {
      return jsonResponse({ error: inviteError?.message || 'Unable to create invite.' }, 500);
    }

    return jsonResponse({ invite });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return jsonResponse({ error: message }, 400);
  }
});
