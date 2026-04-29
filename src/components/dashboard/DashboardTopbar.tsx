import { Bell, Building2, ChevronDown, LogOut, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { WorkspaceSummary } from '../../lib/types';

interface DashboardTopbarProps {
  workspace: WorkspaceSummary;
  onSignOut: () => Promise<void>;
}

export function DashboardTopbar({ workspace, onSignOut }: DashboardTopbarProps) {
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const notificationsRef = useRef<HTMLDivElement | null>(null);
  const notifications = [
    {
      id: 'workspace-check',
      title: 'Workspace check-in complete',
      message: 'Your dashboard is ready and synced.',
      time: 'Just now',
    },
    {
      id: 'reminder-follow-up',
      title: 'Reminder',
      message: 'Review recent records that need follow-up.',
      time: '5 min ago',
    },
  ];

  useEffect(() => {
    if (!isNotificationsOpen) {
      return;
    }

    function handleOutsideClick(event: MouseEvent) {
      if (!notificationsRef.current?.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsNotificationsOpen(false);
      }
    }

    window.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isNotificationsOpen]);

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
        <div className="relative" ref={notificationsRef}>
          <button
            type="button"
            className="relative flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
            aria-label="Notifications"
            aria-expanded={isNotificationsOpen}
            aria-haspopup="dialog"
            onClick={() => setIsNotificationsOpen((current) => !current)}
          >
            <Bell className="h-4 w-4" />
            <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-indigo-500" />
          </button>

          {isNotificationsOpen ? (
            <div className="absolute right-0 top-10 z-40 w-[320px] rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-100 px-1 pb-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Notifications</p>
                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                  {notifications.length} new
                </span>
              </div>
              <div className="mt-2 space-y-1">
                {notifications.map((notification) => (
                  <button
                    key={notification.id}
                    type="button"
                    className="w-full rounded-xl border border-transparent px-2 py-2 text-left transition hover:border-slate-200 hover:bg-slate-50"
                  >
                    <p className="text-sm font-semibold text-slate-800">{notification.title}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{notification.message}</p>
                    <p className="mt-1 text-[11px] text-slate-400">{notification.time}</p>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

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
