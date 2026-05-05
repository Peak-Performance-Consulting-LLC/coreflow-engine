import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { authenticateRequest } from '../_shared/server.ts';

type CRMType =
  | 'real-estate'
  | 'gas-station'
  | 'convenience-store'
  | 'restaurant'
  | 'auto-repair';

function normalizeWorkspace(
  row: { id: string; name: string; slug: string; crm_type: CRMType; owner_id: string },
  role: string,
) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    crmType: row.crm_type,
    ownerId: row.owner_id,
    role,
  };
}

function normalizeEmail(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
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

    const normalizedUserEmail = normalizeEmail(authContext.user.email);

    if (!normalizedUserEmail) {
      return jsonResponse({ error: 'The invited account does not have an email address.' }, 400);
    }

    const { data: existingMembership, error: existingMembershipError } = await authContext.serviceClient
      .from('workspace_members')
      .select('role, workspaces!inner(id, name, slug, crm_type, owner_id)')
      .eq('user_id', authContext.user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (existingMembershipError) {
      return jsonResponse({ error: existingMembershipError.message }, 500);
    }

    if (existingMembership) {
      const workspaceRow = Array.isArray(existingMembership.workspaces)
        ? existingMembership.workspaces[0]
        : existingMembership.workspaces;

      if (!workspaceRow) {
        return jsonResponse({ error: 'Workspace could not be resolved for this membership.' }, 500);
      }

      return jsonResponse({ workspace: normalizeWorkspace(workspaceRow, existingMembership.role) });
    }

    const { data: pendingInvite, error: pendingInviteError } = await authContext.serviceClient
      .from('workspace_member_invites')
      .select('id, workspace_id, role')
      .eq('invited_email', normalizedUserEmail)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (pendingInviteError) {
      return jsonResponse({ error: pendingInviteError.message }, 500);
    }

    if (!pendingInvite) {
      return jsonResponse({ error: 'No pending workspace invite was found for this account.' }, 404);
    }

    const { error: membershipError } = await authContext.serviceClient
      .from('workspace_members')
      .upsert(
        {
          workspace_id: pendingInvite.workspace_id,
          user_id: authContext.user.id,
          role: pendingInvite.role,
        },
        { onConflict: 'workspace_id,user_id' },
      );

    if (membershipError) {
      return jsonResponse({ error: membershipError.message }, 500);
    }

    const acceptedAt = new Date().toISOString();
    const { error: inviteUpdateError } = await authContext.serviceClient
      .from('workspace_member_invites')
      .update({
        status: 'accepted',
        accepted_by: authContext.user.id,
        accepted_at: acceptedAt,
        updated_at: acceptedAt,
      })
      .eq('id', pendingInvite.id)
      .eq('status', 'pending');

    if (inviteUpdateError) {
      return jsonResponse({ error: inviteUpdateError.message }, 500);
    }

    const { data: membership, error: membershipLookupError } = await authContext.serviceClient
      .from('workspace_members')
      .select('role, workspaces!inner(id, name, slug, crm_type, owner_id)')
      .eq('workspace_id', pendingInvite.workspace_id)
      .eq('user_id', authContext.user.id)
      .maybeSingle();

    if (membershipLookupError) {
      return jsonResponse({ error: membershipLookupError.message }, 500);
    }

    if (!membership) {
      return jsonResponse({ error: 'Workspace access could not be finalized.' }, 500);
    }

    const workspaceRow = Array.isArray(membership.workspaces)
      ? membership.workspaces[0]
      : membership.workspaces;

    if (!workspaceRow) {
      return jsonResponse({ error: 'Workspace could not be resolved after invite acceptance.' }, 500);
    }

    return jsonResponse({
      workspace: normalizeWorkspace(workspaceRow, membership.role),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return jsonResponse({ error: message }, 500);
  }
});
