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
              ? 'border-[rgba(99,102,241,0.22)] bg-[rgba(99,102,241,0.14)] text-white shadow-[0_14px_28px_-20px_rgba(30,41,59,0.7)] [&_svg]:text-white'
              : 'border-transparent bg-transparent text-[#CBD5E1] hover:border-transparent hover:bg-[rgba(255,255,255,0.04)] hover:text-white [&_svg]:text-[#94A3B8] hover:[&_svg]:text-[#CBD5E1]'
          } ${item.indent ? 'ml-4 w-[calc(100%-1rem)] pl-2.5' : 'w-full'}`
        }
      >
        {item.indent ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#94A3B8]/60 transition-colors group-hover:bg-[#CBD5E1]" /> : null}
        <Icon className="h-4 w-4 shrink-0 transition-transform group-hover:scale-[1.03]" />
        <span>{item.label}</span>
      </NavLink>
    );
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[256px] flex-col overflow-hidden border-r border-white/10 bg-[linear-gradient(180deg,#0f172a_0%,#111827_100%)] shadow-[10px_0_30px_-24px_rgba(2,6,23,0.85)] backdrop-blur-xl lg:flex">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-14 -top-14 h-40 w-40 rounded-full bg-indigo-500/20 blur-2xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-20 -right-16 h-56 w-56 rounded-full bg-cyan-400/15 blur-3xl"
      />

      <div className="relative flex h-20 items-center border-b border-white/10 px-6">
        <LogoMark theme="dark" />
      </div>

      <div className="relative flex flex-1 flex-col overflow-y-auto px-4 py-5">
        <div className="mb-2 pl-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#94A3B8]">Workspace</div>
        <nav className="mt-2 space-y-1">{workspaceItems.map(renderNavItem)}</nav>

        <div className="mx-2 my-5 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

        <div className="mb-2 pl-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#94A3B8]">Voice</div>
        <nav className="mt-2 flex-1 space-y-1">{voiceItems.map(renderNavItem)}</nav>
      </div>
    </aside>
  );
}
