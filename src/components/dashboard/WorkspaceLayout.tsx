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
    <div className={`min-h-screen bg-slate-100 ${isSidebarCollapsed ? 'lg:pl-[76px]' : 'lg:pl-[232px]'}`}>
      <DashboardSidebar
        workspace={workspace}
        collapsed={isSidebarCollapsed}
        onToggleCollapsed={() => setIsSidebarCollapsed((current) => !current)}
      />
      <main className={`flex min-h-screen flex-1 flex-col ${mainBackgroundClassName}`}>
        <DashboardTopbar workspace={workspace} onSignOut={onSignOut} />
        <div className="flex-1">
          <div className="mx-auto w-full max-w-[1500px] px-3 py-3 lg:px-4 2xl:px-5">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
