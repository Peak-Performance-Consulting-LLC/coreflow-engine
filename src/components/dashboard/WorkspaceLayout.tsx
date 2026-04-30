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
    <div className="min-h-screen bg-slate-100 lg:pl-[280px]">
      <DashboardSidebar workspace={workspace} />
      <main className="flex min-h-screen flex-1 flex-col bg-[#EEF0F7]">
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
