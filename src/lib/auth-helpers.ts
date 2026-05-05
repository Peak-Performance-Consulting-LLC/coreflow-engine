import type { Session } from '@supabase/supabase-js';
import type {
  CompleteSignupPayload,
  CRMType,
  CompleteSignupResponse,
  WorkspaceLookupResponse,
  WorkspaceSummary,
} from './types';
import { getSupabaseClient } from './supabaseClient';

const WORKSPACE_CACHE_TTL_MS = 5 * 60 * 1000;
const ALLOWED_CRM_TYPES: CRMType[] = [
  'real-estate',
  'gas-station',
  'convenience-store',
  'restaurant',
  'auto-repair',
];

interface WorkspaceCacheEntry {
  fetchedAt: number;
  promise?: Promise<WorkspaceSummary | null>;
  workspace: WorkspaceSummary | null;
}

const workspaceCache = new Map<string, WorkspaceCacheEntry>();

function getAuthHeaders(session: Session) {
  return {
    Authorization: `Bearer ${session.access_token}`,
  };
}

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function isWorkspaceCacheFresh(entry: WorkspaceCacheEntry | undefined) {
  if (!entry) {
    return false;
  }

  return Date.now() - entry.fetchedAt < WORKSPACE_CACHE_TTL_MS;
}

export function getCachedUserWorkspace(userId: string) {
  return workspaceCache.get(userId)?.workspace;
}

export function clearCachedUserWorkspace(userId?: string) {
  if (userId) {
    workspaceCache.delete(userId);
    return;
  }

  workspaceCache.clear();
}

export function primeUserWorkspaceCache(userId: string, workspace: WorkspaceSummary | null) {
  workspaceCache.set(userId, {
    workspace,
    fetchedAt: Date.now(),
  });
}

export function getPendingSignupPayloadFromUser(user: { user_metadata?: Record<string, unknown> | null } | null | undefined) {
  const metadata = user?.user_metadata ?? {};
  const fullName = normalizeString(metadata.full_name) || normalizeString(metadata.name);
  const workspaceName = normalizeString(metadata.pending_workspace_name);
  const workspaceSlug = normalizeString(metadata.pending_workspace_slug).toLowerCase();
  const crmType = normalizeString(metadata.pending_crm_type) as CRMType;

  if (!fullName || !workspaceName || !workspaceSlug || !ALLOWED_CRM_TYPES.includes(crmType)) {
    return null;
  }

  return {
    full_name: fullName,
    workspace_name: workspaceName,
    workspace_slug: workspaceSlug,
    crm_type: crmType,
  } satisfies CompleteSignupPayload;
}

export async function clearPendingSignupMetadata() {
  const client = getSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    return;
  }

  const metadata = {
    ...(user.user_metadata ?? {}),
    pending_workspace_name: null,
    pending_workspace_slug: null,
    pending_crm_type: null,
  };

  await client.auth.updateUser({
    data: metadata,
  });
}

export async function completeSignup(payload: CompleteSignupPayload, session: Session) {
  const client = getSupabaseClient();
  const { data, error } = await client.functions.invoke<CompleteSignupResponse>('complete-signup', {
    body: payload,
    headers: getAuthHeaders(session),
  });

  if (error) {
    throw new Error(error.message || 'Unable to complete signup.');
  }

  if (!data?.workspace) {
    throw new Error('Signup completed without a workspace response.');
  }

  primeUserWorkspaceCache(session.user.id, data.workspace);
  return data.workspace;
}

export async function acceptWorkspaceInvite(session: Session) {
  const client = getSupabaseClient();
  const { data, error } = await client.functions.invoke<WorkspaceLookupResponse>('accept-workspace-invite', {
    headers: getAuthHeaders(session),
  });

  if (error) {
    throw new Error(error.message || 'Unable to accept workspace invite.');
  }

  if (!data?.workspace) {
    throw new Error('No pending workspace invite was found for this account.');
  }

  primeUserWorkspaceCache(session.user.id, data.workspace);
  return data.workspace;
}

export async function completePendingSignupIfAvailable(
  session: Session,
  user: { user_metadata?: Record<string, unknown> | null } | null | undefined = session.user,
) {
  const payload = getPendingSignupPayloadFromUser(user);

  if (!payload) {
    return null;
  }

  const workspace = await completeSignup(payload, session);

  try {
    await clearPendingSignupMetadata();
  } catch {
    // Metadata cleanup is best-effort and should not block access.
  }

  return workspace;
}

export async function fetchUserWorkspace(session: Session) {
  const cacheKey = session.user.id;
  const cachedEntry = workspaceCache.get(cacheKey);

  if (cachedEntry?.promise) {
    return cachedEntry.promise;
  }

  if (isWorkspaceCacheFresh(cachedEntry)) {
    return cachedEntry!.workspace;
  }

  const client = getSupabaseClient();
  const request = client.functions
    .invoke<WorkspaceLookupResponse>('get-user-workspace', {
      headers: getAuthHeaders(session),
    })
    .then(({ data, error }) => {
      if (error) {
        throw new Error(error.message || 'Unable to load your workspace.');
      }

      const workspace = (data?.workspace as WorkspaceSummary | null) ?? null;
      primeUserWorkspaceCache(cacheKey, workspace);
      return workspace;
    })
    .catch((error) => {
      workspaceCache.delete(cacheKey);
      throw error;
    });

  workspaceCache.set(cacheKey, {
    workspace: cachedEntry?.workspace ?? null,
    fetchedAt: cachedEntry?.fetchedAt ?? 0,
    promise: request,
  });

  return request;
}
