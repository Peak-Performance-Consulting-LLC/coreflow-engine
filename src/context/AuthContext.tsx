import type { Session, User } from '@supabase/supabase-js';
import { createContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { clearCachedUserWorkspace, fetchUserWorkspace, getCachedUserWorkspace } from '../lib/auth-helpers';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabaseClient';
import type { WorkspaceSummary } from '../lib/types';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  workspace: WorkspaceSummary | null;
  loading: boolean;
  workspaceLoading: boolean;
  isSupabaseReady: boolean;
  refreshWorkspace: (sessionOverride?: Session | null) => Promise<WorkspaceSummary | null>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
const EXISTING_USER_SIGNED_OUT_FLAG = 'coreflow.existing-user-signed-out';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const workspaceRequestIdRef = useRef(0);

  async function refreshWorkspace(sessionOverride?: Session | null) {
    const activeSession = sessionOverride ?? session;

    if (!activeSession || !isSupabaseConfigured) {
      setWorkspace(null);
      setWorkspaceLoading(false);
      setLoading(false);
      return null;
    }

    const requestId = ++workspaceRequestIdRef.current;
    const cachedWorkspace = getCachedUserWorkspace(activeSession.user.id);
    const visibleWorkspace = cachedWorkspace !== undefined ? cachedWorkspace : workspace;
    const hasVisibleWorkspace = visibleWorkspace !== null;

    if (cachedWorkspace !== undefined && cachedWorkspace !== null) {
      setWorkspace(cachedWorkspace);
      setLoading(false);
    }

    setWorkspaceLoading(!hasVisibleWorkspace);

    try {
      const nextWorkspace = await fetchUserWorkspace(activeSession);
      if (workspaceRequestIdRef.current !== requestId) {
        return nextWorkspace;
      }

      if (nextWorkspace === null && hasVisibleWorkspace) {
        return visibleWorkspace;
      }

      setWorkspace(nextWorkspace);
      return nextWorkspace;
    } catch (error) {
      console.error(error);
      if (workspaceRequestIdRef.current === requestId && !hasVisibleWorkspace) {
        setWorkspace(null);
      }
      return null;
    } finally {
      if (workspaceRequestIdRef.current === requestId) {
        setWorkspaceLoading(false);
        setLoading(false);
      }
    }
  }

  async function signOut() {
    if (!isSupabaseConfigured) {
      return;
    }

    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(EXISTING_USER_SIGNED_OUT_FLAG, '1');
    }

    const client = getSupabaseClient();
    await client.auth.signOut();
    clearCachedUserWorkspace(session?.user.id);
    setWorkspace(null);
  }

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    const client = getSupabaseClient();
    let isMounted = true;

    void (async () => {
      const {
        data: { session: initialSession },
      } = await client.auth.getSession();

      if (!isMounted) {
        return;
      }

      setSession(initialSession);
      setUser(initialSession?.user ?? null);

      if (initialSession) {
        await refreshWorkspace(initialSession);
      } else {
        setLoading(false);
      }
    })();

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) {
        return;
      }

      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (nextSession) {
        void refreshWorkspace(nextSession);
      } else {
        clearCachedUserWorkspace();
        setWorkspace(null);
        setWorkspaceLoading(false);
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        workspace,
        loading,
        workspaceLoading,
        isSupabaseReady: isSupabaseConfigured,
        refreshWorkspace,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
