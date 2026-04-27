import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { authenticateRequest, ensureWorkspaceOwner, type EdgeClient } from '../_shared/server.ts';

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

async function getEmailByUserId(serviceClient: EdgeClient, userId: string) {
  const { data, error } = await serviceClient.auth.admin.getUserById(userId);

  if (error) {
    throw new Error(error.message || 'Unable to load workspace member email.');
  }

  return data?.user?.email ?? null;
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

    if (!workspaceId) {
      return jsonResponse({ error: 'workspace_id is required.' }, 400);
    }

    await ensureWorkspaceOwner(authContext.serviceClient, workspaceId, authContext.user.id);

    const [{ data: members, error: membersError }, { data: invites, error: invitesError }] = await Promise.all([
      authContext.serviceClient
        .from('workspace_members')
        .select('user_id, role, created_at')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: true }),
      authContext.serviceClient
        .from('workspace_member_invites')
        .select('id, invited_email, role, status, created_at')
        .eq('workspace_id', workspaceId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
    ]);

    if (membersError) {
      return jsonResponse({ error: membersError.message }, 500);
    }

    if (invitesError) {
      return jsonResponse({ error: invitesError.message }, 500);
    }

    const userIds = Array.from(new Set((members ?? []).map((member) => member.user_id)));
    const { data: profiles, error: profilesError } = userIds.length > 0
      ? await authContext.serviceClient.from('profiles').select('id, full_name').in('id', userIds)
      : { data: [], error: null };

    if (profilesError) {
      return jsonResponse({ error: profilesError.message }, 500);
    }

    const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name ?? null]));
    const emailEntries = await Promise.all(
      userIds.map(async (userId) => [userId, await getEmailByUserId(authContext.serviceClient, userId)] as const),
    );
    const emailMap = new Map(emailEntries);

    return jsonResponse({
      members: (members ?? []).map((member) => ({
        user_id: member.user_id,
        role: member.role,
        full_name: profileMap.get(member.user_id) ?? null,
        email: emailMap.get(member.user_id) ?? null,
        created_at: member.created_at,
      })),
      invites: (invites ?? []).map((invite) => ({
        id: invite.id,
        invited_email: invite.invited_email,
        role: invite.role,
        status: invite.status,
        created_at: invite.created_at,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return jsonResponse({ error: message }, 400);
  }
});
