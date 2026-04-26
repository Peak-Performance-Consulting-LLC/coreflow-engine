import { Bell, Building2, ChevronDown, LogOut, Search } from 'lucide-react';
import type { WorkspaceSummary } from '../../lib/types';

interface DashboardTopbarProps {
  workspace: WorkspaceSummary;
  onSignOut: () => Promise<void>;
}

export function DashboardTopbar({ workspace, onSignOut }: DashboardTopbarProps) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur-sm lg:px-6">
      {/* Search bar */}
      <div className="hidden w-[340px] items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-400 transition hover:border-slate-300 md:flex">
        <Search className="h-4 w-4 shrink-0" />
        <span>Search contacts, tasks, or notes</span>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2">
        {/* Workspace selector chip */}
        <div className="flex cursor-default items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-sm font-medium text-slate-700">
          <Building2 className="h-3.5 w-3.5 text-slate-400" />
          <span>{workspace.name}</span>
          <ChevronDown className="h-3 w-3 text-slate-400" />
        </div>

        {/* Bell */}
        <button
          className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
        </button>

        {/* Sign out */}
        <button
          onClick={() => void onSignOut()}
          className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-800"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign Out
        </button>
      </div>
    </header>
  );
}
