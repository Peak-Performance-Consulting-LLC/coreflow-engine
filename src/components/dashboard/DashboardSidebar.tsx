import {
  ArrowDownToLine,
  Bot,
  ClipboardList,
  LayoutGrid,
  ListChecks,
  Mail,
  PhoneCall,
  PlusCircle,
  Rows3,
  Users,
  UserCircle2,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { NavLink } from 'react-router-dom';
import { preloadRoute } from '../../routes/routePreload';
import type { WorkspaceSummary } from '../../lib/types';
import { isWorkspaceOwner } from '../../lib/utils';
import { LogoMark } from '../ui/LogoMark';

interface SidebarNavItem {
  label: string;
  icon: ComponentType<{ className?: string }>;
  to: string;
  end?: boolean;
  indent?: boolean;
}

export function DashboardSidebar({ workspace }: { workspace: WorkspaceSummary }) {
  const isOwner = isWorkspaceOwner(workspace);
  const workspaceItems: SidebarNavItem[] = [
    { label: 'Overview', icon: LayoutGrid, to: `/dashboard/${workspace.crmType}`, end: true },
    { label: 'Records', icon: Rows3, to: '/records' },
    ...(isOwner ? [{ label: 'Form Builder', icon: ClipboardList, to: '/records/form-builder', end: true }] : []),
    { label: 'Imports', icon: ArrowDownToLine, to: '/imports' },
    { label: 'Email', icon: Mail, to: '/email', end: true },
    ...(isOwner ? [{ label: 'Team', icon: Users, to: '/team', end: true }] : []),
    { label: 'Account', icon: UserCircle2, to: '/account', end: true },
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

  function renderNavItem(item: SidebarNavItem) {
    const Icon = item.icon;

    return (
      <NavLink
        key={item.label}
        to={item.to}
        end={item.end}
        onMouseEnter={() => preloadRoute(item.to)}
        onFocus={() => preloadRoute(item.to)}
        className={({ isActive }) =>
          `group flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-[15px] font-medium transition-all duration-150 ${
            isActive
              ? 'border-indigo-200 bg-gradient-to-r from-indigo-50 to-white text-indigo-700 shadow-[0_14px_22px_-22px_rgba(79,70,229,0.55)]'
              : 'border-transparent bg-transparent text-slate-600 hover:border-slate-200 hover:bg-white/85 hover:text-slate-900'
          } ${item.indent ? 'ml-4 w-[calc(100%-1rem)] pl-2.5' : 'w-full'}`
        }
      >
        {item.indent ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300 transition-colors group-hover:bg-indigo-400" /> : null}
        <Icon className="h-4 w-4 shrink-0 transition-transform group-hover:scale-[1.03]" />
        <span>{item.label}</span>
      </NavLink>
    );
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[280px] flex-col overflow-hidden border-r border-slate-200/80 bg-gradient-to-b from-white via-slate-50/70 to-indigo-50/50 lg:flex">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-14 -top-14 h-40 w-40 rounded-full bg-indigo-200/30 blur-2xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-20 -right-16 h-56 w-56 rounded-full bg-sky-200/25 blur-3xl"
      />

      <div className="relative flex h-20 items-center border-b border-slate-200/80 px-6">
        <LogoMark />
      </div>

      <div className="relative flex flex-1 flex-col overflow-y-auto px-4 py-5">
        <div className="mb-2 pl-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Workspace</div>
        <nav className="mt-2 space-y-1">{workspaceItems.map(renderNavItem)}</nav>

        <div className="mx-2 my-5 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />

        <div className="mb-2 pl-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Voice</div>
        <nav className="mt-2 flex-1 space-y-1">{voiceItems.map(renderNavItem)}</nav>
      </div>
    </aside>
  );
}
