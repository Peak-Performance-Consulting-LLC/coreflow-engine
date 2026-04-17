import { createContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '../hooks/useAuth';
import { fetchCrmWorkspaceConfig, getCachedCrmWorkspaceConfig, refreshCrmWorkspaceConfig } from '../lib/crm-service';
import type { CrmWorkspaceConfig } from '../lib/crm-types';

interface CrmWorkspaceContextValue {
  config: CrmWorkspaceConfig | null;
  configError: string | null;
  configLoading: boolean;
  configRefreshing: boolean;
  ensureConfig: () => Promise<CrmWorkspaceConfig | null>;
  refreshConfig: () => Promise<CrmWorkspaceConfig | null>;
}

export const CrmWorkspaceContext = createContext<CrmWorkspaceContextValue | null>(null);

export function CrmWorkspaceProvider({ children }: { children: ReactNode }) {
  const { session, workspace } = useAuth();
  const workspaceId = workspace?.id ?? null;
  const userId = session?.user.id ?? null;
  const [config, setConfig] = useState<CrmWorkspaceConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [configRefreshing, setConfigRefreshing] = useState(false);

  async function ensureConfig() {
    if (!session || !workspaceId) {
      return null;
    }

    if (config) {
      return config;
    }

    setConfigLoading(true);
    setConfigError(null);

    try {
      const nextConfig = await fetchCrmWorkspaceConfig(session, workspaceId);
      setConfig(nextConfig);
      return nextConfig;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load CRM workspace config.';
      setConfigError(message);
      return null;
    } finally {
      setConfigLoading(false);
    }
  }

  async function refreshConfig() {
    if (!session || !workspaceId) {
      return null;
    }

    setConfigRefreshing(true);
    setConfigError(null);

    try {
      const nextConfig = await refreshCrmWorkspaceConfig(session, workspaceId);
      setConfig(nextConfig);
      return nextConfig;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to refresh CRM workspace config.';
      setConfigError(message);
      return config;
    } finally {
      setConfigLoading(false);
      setConfigRefreshing(false);
    }
  }

  useEffect(() => {
    if (!session || !workspaceId) {
      setConfig(null);
      setConfigError(null);
      setConfigLoading(false);
      setConfigRefreshing(false);
      return;
    }

    const cachedConfig = getCachedCrmWorkspaceConfig(workspaceId);
    let cancelled = false;

    setConfig(cachedConfig);
    setConfigError(null);
    setConfigLoading(!cachedConfig);
    setConfigRefreshing(Boolean(cachedConfig));

    void (async () => {
      try {
        const nextConfig = cachedConfig
          ? await refreshCrmWorkspaceConfig(session, workspaceId)
          : await fetchCrmWorkspaceConfig(session, workspaceId);

        if (!cancelled) {
          setConfig(nextConfig);
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Unable to load CRM workspace config.';
          setConfigError(message);
        }
      } finally {
        if (!cancelled) {
          setConfigLoading(false);
          setConfigRefreshing(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session, userId, workspaceId]);

  return (
    <CrmWorkspaceContext.Provider
      value={{
        config,
        configError,
        configLoading,
        configRefreshing,
        ensureConfig,
        refreshConfig,
      }}
    >
      {children}
    </CrmWorkspaceContext.Provider>
  );
}
