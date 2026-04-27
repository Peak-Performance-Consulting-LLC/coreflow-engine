import type { Session } from '@supabase/supabase-js';
import type { WorkspaceRole } from './types';
import { getSupabaseClient } from './supabaseClient';

export interface WorkspaceTeamMember {
  user_id: string;
  role: WorkspaceRole;
  full_name: string | null;
  email: string | null;
  created_at: string;
}

export interface WorkspaceTeamInvite {
  id: string;
  invited_email: string;
  role: WorkspaceRole;
  status: 'pending' | 'accepted' | 'revoked';
  created_at: string;
}

export interface WorkspaceTeamResponse {
  members: WorkspaceTeamMember[];
  invites: WorkspaceTeamInvite[];
}

function getAuthHeaders(session: Session) {
  return {
    Authorization: `Bearer ${session.access_token}`,
  };
}

async function invoke<TResponse>(name: string, session: Session, body?: unknown) {
  const client = getSupabaseClient();
  const { data, error } = await client.functions.invoke<TResponse>(name, {
    body: body as Record<string, unknown> | undefined,
    headers: getAuthHeaders(session),
  });

  if (error) {
    throw new Error(error.message || 'Request failed.');
  }

  return data as TResponse;
}

export async function getWorkspaceTeam(session: Session, workspaceId: string) {
  return invoke<WorkspaceTeamResponse>('workspace-team-get', session, {
    workspace_id: workspaceId,
  });
}

export async function inviteWorkspaceAgent(session: Session, workspaceId: string, invitedEmail: string) {
  return invoke<{ invite: WorkspaceTeamInvite }>('workspace-team-invite', session, {
    workspace_id: workspaceId,
    invited_email: invitedEmail,
    role: 'agent',
  });
}

export async function removeWorkspaceMember(session: Session, workspaceId: string, userId: string) {
  return invoke<{ success: boolean; target: 'member' | 'invite' }>('workspace-team-remove', session, {
    workspace_id: workspaceId,
    user_id: userId,
  });
}

export async function revokeWorkspaceInvite(session: Session, workspaceId: string, inviteId: string) {
  return invoke<{ success: boolean; target: 'member' | 'invite' }>('workspace-team-remove', session, {
    workspace_id: workspaceId,
    invite_id: inviteId,
  });
}
