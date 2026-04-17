import type { ReactNode } from 'react';
import type { WorkspaceSummary } from '../../lib/types';
import { DashboardSidebar } from './DashboardSidebar';
import { DashboardTopbar } from './DashboardTopbar';

interface WorkspaceLayoutProps {
  workspace: WorkspaceSummary;
  onSignOut: () => Promise<void>;
  children: ReactNode;
}

export function WorkspaceLayout({ workspace, onSignOut, children }: WorkspaceLayoutProps) {
  return (
    <div className="min-h-screen bg-slate-100 lg:pl-[272px]">
      <DashboardSidebar workspace={workspace} />
      <main className="flex min-h-screen flex-1 flex-col bg-[#EEF0F7]">
        <DashboardTopbar workspace={workspace} onSignOut={onSignOut} />
        <div className="flex-1 px-4 py-5 lg:px-6">{children}</div>
      </main>
    </div>
  );
}
