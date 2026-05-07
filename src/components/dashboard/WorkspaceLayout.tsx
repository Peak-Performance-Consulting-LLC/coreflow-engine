import { useEffect, useState, type ReactNode } from 'react';
import type { WorkspaceSummary } from '../../lib/types';
import { DashboardSidebar } from './DashboardSidebar';
import { DashboardTopbar } from './DashboardTopbar';

interface WorkspaceLayoutProps {
  workspace: WorkspaceSummary;
  onSignOut: () => Promise<void>;
  children: ReactNode;
  mainBackgroundClassName?: string;
}

const sidebarCollapsedStorageKey = 'coreflow.sidebar.collapsed';

export function WorkspaceLayout({
  workspace,
  onSignOut,
  children,
  mainBackgroundClassName = 'bg-[#f3f3f3]',
}: WorkspaceLayoutProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const stored = window.localStorage.getItem(sidebarCollapsedStorageKey);
    if (stored === '1') {
      setIsSidebarCollapsed(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(sidebarCollapsedStorageKey, isSidebarCollapsed ? '1' : '0');
  }, [isSidebarCollapsed]);

  return (
    <div className={`min-h-screen bg-slate-100 ${isSidebarCollapsed ? 'lg:pl-[88px]' : 'lg:pl-[256px]'}`}>
      <DashboardSidebar
        workspace={workspace}
        collapsed={isSidebarCollapsed}
        onToggleCollapsed={() => setIsSidebarCollapsed((current) => !current)}
      />
      <main className={`flex min-h-screen flex-1 flex-col ${mainBackgroundClassName}`}>
        <DashboardTopbar workspace={workspace} onSignOut={onSignOut} />
        <div className="flex-1">
          <div className="mx-auto w-full max-w-[1680px] px-4 py-5 lg:px-6 2xl:px-8">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
