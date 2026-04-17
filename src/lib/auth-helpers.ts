import type { Session } from '@supabase/supabase-js';
import type {
  CompleteSignupPayload,
  CompleteSignupResponse,
  WorkspaceLookupResponse,
  WorkspaceSummary,
} from './types';
import { getSupabaseClient } from './supabaseClient';

const WORKSPACE_CACHE_TTL_MS = 5 * 60 * 1000;

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
