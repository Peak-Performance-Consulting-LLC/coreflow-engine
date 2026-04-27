import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { authenticateRequest, ensureWorkspaceOwner } from '../_shared/server.ts';

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
    const workspaceId = normalizeString(payload.workspace_id);
    const userId = normalizeString(payload.user_id);
    const inviteId = normalizeString(payload.invite_id);

    if (!workspaceId) {
      return jsonResponse({ error: 'workspace_id is required.' }, 400);
    }

    if (!userId && !inviteId) {
      return jsonResponse({ error: 'user_id or invite_id is required.' }, 400);
    }

    const workspace = await ensureWorkspaceOwner(authContext.serviceClient, workspaceId, authContext.user.id);

    if (inviteId) {
      const { error: revokeError } = await authContext.serviceClient
        .from('workspace_member_invites')
        .update({
          status: 'revoked',
          revoked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('workspace_id', workspaceId)
        .eq('id', inviteId)
        .eq('status', 'pending');

      if (revokeError) {
        return jsonResponse({ error: revokeError.message }, 500);
      }

      return jsonResponse({ success: true, target: 'invite' });
    }

    if (userId === workspace.owner_id) {
      return jsonResponse({ error: 'The workspace owner cannot be removed.' }, 400);
    }

    const { data: existingMember, error: existingMemberError } = await authContext.serviceClient
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId)
      .maybeSingle();

    if (existingMemberError) {
      return jsonResponse({ error: existingMemberError.message }, 500);
    }

    if (!existingMember) {
      return jsonResponse({ error: 'Workspace member not found.' }, 404);
    }

    const { error: deleteError } = await authContext.serviceClient
      .from('workspace_members')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('user_id', userId);

    if (deleteError) {
      return jsonResponse({ error: deleteError.message }, 500);
    }

    const { data: userData, error: userError } = await authContext.serviceClient.auth.admin.getUserById(userId);

    if (!userError) {
      const memberEmail = userData.user?.email?.trim().toLowerCase() ?? '';

      if (memberEmail) {
        await authContext.serviceClient
          .from('workspace_member_invites')
          .update({
            status: 'revoked',
            revoked_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('workspace_id', workspaceId)
          .eq('invited_email', memberEmail)
          .eq('status', 'pending');
      }
    }

    return jsonResponse({ success: true, target: 'member' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return jsonResponse({ error: message }, 400);
  }
});
