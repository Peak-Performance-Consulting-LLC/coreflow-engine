import {
  ArrowDownToLine,
  Bot,
  LayoutGrid,
  ListChecks,
  PhoneCall,
  PlusCircle,
  Rows3,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { formatCrmLabel } from '../../lib/utils';
import type { WorkspaceSummary } from '../../lib/types';
import { LogoMark } from '../ui/LogoMark';

interface SidebarNavItem {
  label: string;
  icon: ComponentType<{ className?: string }>;
  to: string;
  end?: boolean;
  indent?: boolean;
}

export function DashboardSidebar({ workspace }: { workspace: WorkspaceSummary }) {
  const { user } = useAuth();
  const isOwner = workspace.ownerId === user?.id;
  const workspaceItems: SidebarNavItem[] = [
    { label: 'Overview', icon: LayoutGrid, to: `/dashboard/${workspace.crmType}`, end: true },
    { label: 'Records', icon: Rows3, to: '/records' },
    { label: 'Imports', icon: ArrowDownToLine, to: '/imports' },
  ];
  const ownerVoiceItems: SidebarNavItem[] = [
    { label: 'Provisioned numbers', icon: ListChecks, to: '/voice/numbers', end: true },
    { label: 'New number', icon: PlusCircle, to: '/voice/numbers/new', indent: true, end: true },
    { label: 'Assistants', icon: Bot, to: '/voice/assistants', end: true },
    { label: 'New assistant', icon: PlusCircle, to: '/voice/assistants/new', indent: true, end: true },
    { label: 'Call ops', icon: PhoneCall, to: '/voice/ops', end: true },
  ];
  const memberVoiceItems: SidebarNavItem[] = [{ label: 'Call ops', icon: PhoneCall, to: '/voice/ops', end: true }];
  const voiceItems = isOwner ? ownerVoiceItems : memberVoiceItems;

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[272px] flex-col border-r border-slate-200 bg-white lg:flex">
      <div className="flex h-16 items-center border-b border-slate-100 px-6">
        <LogoMark />
      </div>

      <div className="flex flex-1 flex-col overflow-y-auto px-4 py-5">
        <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Workspace</p>
          <p className="mt-1 text-base font-semibold text-slate-800">{workspace.name}</p>
          <p className="mt-1 text-xs text-slate-500">{formatCrmLabel(workspace.crmType)} mode</p>
        </div>

        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Workspace</div>
        <nav className="mt-2 space-y-1">
          {workspaceItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.label}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-[15px] font-medium transition-all duration-150 ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="mt-6 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Voice</div>
        <nav className="mt-2 flex-1 space-y-1">
          {voiceItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.label}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-[15px] font-medium transition-all duration-150 ${
                    item.indent ? 'ml-3 w-[calc(100%-0.75rem)]' : ''
                  } ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-700'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
