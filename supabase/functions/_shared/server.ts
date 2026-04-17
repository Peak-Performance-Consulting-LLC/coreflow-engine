import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { jsonResponse } from './cors.ts';

export type EdgeClient = ReturnType<typeof createClient>;

export interface AuthenticatedContext {
  serviceClient: EdgeClient;
  user: { id: string; email?: string | null };
}

export function createEdgeClients(request: Request) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authHeader = request.headers.get('Authorization') ?? '';

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return {
      errorResponse: jsonResponse({ error: 'Missing Supabase function environment variables.' }, 500),
    };
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
    auth: {
      persistSession: false,
    },
  });

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
    },
  });

  return { userClient, serviceClient };
}

export async function authenticateRequest(request: Request): Promise<AuthenticatedContext | Response> {
  const clients = createEdgeClients(request);

  if ('errorResponse' in clients) {
    return clients.errorResponse;
  }

  const {
    userClient,
    serviceClient,
  } = clients;

  const {
    data: { user },
    error,
  } = await userClient.auth.getUser();

  if (error || !user) {
    return jsonResponse({ error: 'Unauthorized.' }, 401);
  }

  return {
    serviceClient,
    user: {
      id: user.id,
      email: user.email,
    },
  };
}

export async function ensureWorkspaceMembership(serviceClient: EdgeClient, workspaceId: string, userId: string) {
  const { data, error } = await serviceClient
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('You do not have access to this workspace.');
  }

  return data;
}

export async function ensureWorkspaceOwner(serviceClient: EdgeClient, workspaceId: string, userId: string) {
  await ensureWorkspaceMembership(serviceClient, workspaceId, userId);

  const { data, error } = await serviceClient
    .from('workspaces')
    .select('id, owner_id, name, slug, crm_type')
    .eq('id', workspaceId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('Workspace not found.');
  }

  if (data.owner_id !== userId) {
    throw new Error('Only the workspace owner can manage voice settings.');
  }

  return data;
}

export async function resolveWorkspaceVoiceActorUserId(serviceClient: EdgeClient, workspaceId: string) {
  const { data, error } = await serviceClient
    .from('workspaces')
    .select('id, owner_id, voice_system_actor_user_id')
    .eq('id', workspaceId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('Workspace not found.');
  }

  const actorUserId =
    typeof data.voice_system_actor_user_id === 'string' && data.voice_system_actor_user_id.trim().length > 0
      ? data.voice_system_actor_user_id.trim()
      : typeof data.owner_id === 'string' && data.owner_id.trim().length > 0
        ? data.owner_id.trim()
        : '';

  if (!actorUserId) {
    throw new Error('Workspace voice actor could not be resolved.');
  }

  return actorUserId;
}

export async function listWorkspaceAssignees(serviceClient: EdgeClient, workspaceId: string) {
  const { data: members, error: memberError } = await serviceClient
    .from('workspace_members')
    .select('user_id, role')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true });

  if (memberError) {
    throw new Error(memberError.message);
  }

  const userIds = (members ?? []).map((member) => member.user_id);

  if (userIds.length === 0) {
    return [];
  }

  const { data: profiles, error: profileError } = await serviceClient
    .from('profiles')
    .select('id, full_name')
    .in('id', userIds);

  if (profileError) {
    throw new Error(profileError.message);
  }

  const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name]));

  return (members ?? []).map((member) => ({
    userId: member.user_id,
    role: member.role,
    fullName: profileMap.get(member.user_id) ?? null,
  }));
}

export function getString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export function isRecordLike(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
