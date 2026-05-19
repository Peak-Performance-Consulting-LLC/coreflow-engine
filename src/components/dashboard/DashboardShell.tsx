import {
  AlertCircle,
  ArrowRight,
  ChevronDown,
  Clock3,
  Mail,
  Phone,
  RefreshCw,
  Search,
  Sparkles,
  Users,
  Workflow,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { WorkspaceSummary } from '../../lib/types';
import { cn } from '../../lib/utils';
import { buttonStyles } from '../ui/Button';
import { WorkspaceLayout } from './WorkspaceLayout';
import type { WorkspaceSetupActionItem } from './WorkspaceSetupChecklist';

export interface DashboardShellAction {
  label: string;
  to: string;
  state?: Record<string, unknown>;
  guideId?: string;
  variant?: 'primary' | 'secondary' | 'link';
}

export interface DashboardShellRecommendation {
  id: string;
  title: string;
  description: string;
  ctaLabel: string;
  to: string;
  priority: number;
  tone: 'neutral' | 'warning' | 'success';
  icon: 'records' | 'workflow' | 'queue' | 'integrations' | 'email' | 'voice-number';
}

export interface DashboardShellSummaryCard {
  id: string;
  title: string;
  icon: 'records' | 'pipeline' | 'team';
  filterLabel: string;
  action: DashboardShellAction;
  headline: string;
  value: string;
  helperText: string;
  highlights: string[];
  footerLabel: string;
  footerTo: string;
  updatedAt: string;
}

export interface DashboardShellQuickStat {
  id: string;
  label: string;
  value: string;
  detail: string;
}

export interface DashboardShellRecentRecord {
  id: string;
  title: string;
  subtitle: string;
  meta: string;
  stageLabel: string | null;
  statusLabel: string;
  statusTone: 'warning' | 'success' | 'neutral';
  to: string;
}

export interface DashboardShellQueueItem {
  id: string;
  title: string;
  description: string;
  meta: string;
  priorityLabel: string;
  priorityTone: 'urgent' | 'warning' | 'neutral';
  ctaLabel: string;
  to: string;
}

export interface DashboardShellSetupItem {
  id: string;
  label: string;
  detail: string;
  statusLabel: string;
  status: 'healthy' | 'warning' | 'pending';
  to: string;
}

export interface DashboardShellHealthItem {
  id: string;
  label: string;
  value: string;
  hint: string;
  status: 'healthy' | 'warning' | 'pending';
  to: string;
  icon: 'records' | 'workflow' | 'integrations' | 'email' | 'voice-number';
}

export interface DashboardShellOverview {
  panelEyebrow: string;
  panelTitle: string;
  panelSubtitle: string;
  panelLink: DashboardShellAction;
  quickActions: DashboardShellAction[];
  recommendations: DashboardShellRecommendation[];
  quickStats: DashboardShellQuickStat[];
  summaryCards: DashboardShellSummaryCard[];
  recentRecordsFilterLabel: string;
  recentRecords: DashboardShellRecentRecord[];
  queueFilterLabel: string;
  queueItems: DashboardShellQueueItem[];
  setupFilterLabel: string;
  setupItems: DashboardShellSetupItem[];
  healthItems: DashboardShellHealthItem[];
  updatedAtLabel: string;
}

interface DashboardShellProps {
  workspace: WorkspaceSummary;
  onSignOut: () => Promise<void>;
  overview: DashboardShellOverview;
  overviewLoading?: boolean;
  setupActions?: WorkspaceSetupActionItem[];
  showSetupPopup?: boolean;
  onCloseSetupPopup?: () => void;
}

const recordStatusClasses: Record<DashboardShellRecentRecord['statusTone'], string> = {
  neutral: 'border-slate-200 bg-slate-50 text-slate-600',
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
};

const queuePriorityClasses: Record<DashboardShellQueueItem['priorityTone'], string> = {
  urgent: 'border-rose-200 bg-rose-50 text-rose-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
  neutral: 'border-sky-200 bg-sky-50 text-sky-700',
};

const setupStatusClasses: Record<DashboardShellSetupItem['status'], string> = {
  healthy: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
  pending: 'border-slate-200 bg-slate-100 text-slate-600',
};

const healthStatusClasses: Record<DashboardShellHealthItem['status'], string> = {
  healthy: 'border-emerald-200 bg-emerald-50/80',
  warning: 'border-amber-200 bg-amber-50/85',
  pending: 'border-slate-200 bg-slate-50',
};

function getIcon(icon: DashboardShellRecommendation['icon'] | DashboardShellSummaryCard['icon'] | DashboardShellHealthItem['icon']): LucideIcon {
  switch (icon) {
    case 'pipeline':
    case 'workflow':
      return Workflow;
    case 'team':
      return Users;
    case 'queue':
      return Clock3;
    case 'integrations':
      return Sparkles;
    case 'email':
      return Mail;
    case 'voice-number':
      return Phone;
    case 'records':
    default:
      return AlertCircle;
  }
}

function getAccentClasses(icon: DashboardShellRecommendation['icon'] | DashboardShellSummaryCard['icon']) {
  switch (icon) {
    case 'pipeline':
      return {
        iconWrap: 'border-orange-100 bg-orange-500 text-white',
        circle: 'bg-[#ffb29f]',
        dot: 'bg-[#ff8a6a]',
        ring: 'bg-[#ffe1d8]',
      };
    case 'team':
      return {
        iconWrap: 'border-fuchsia-100 bg-fuchsia-600 text-white',
        circle: 'bg-[#c77cf0]',
        dot: 'bg-[#8b35d6]',
        ring: 'bg-[#efdcff]',
      };
    case 'workflow':
      return {
        iconWrap: 'border-amber-100 bg-amber-500 text-white',
        circle: 'bg-[#ffd46d]',
        dot: 'bg-[#f3b300]',
        ring: 'bg-[#fff2c9]',
      };
    case 'integrations':
      return {
        iconWrap: 'border-violet-100 bg-violet-500 text-white',
        circle: 'bg-[#c4b5fd]',
        dot: 'bg-[#7c3aed]',
        ring: 'bg-[#ede9fe]',
      };
    case 'email':
      return {
        iconWrap: 'border-cyan-100 bg-cyan-500 text-white',
        circle: 'bg-[#a5f3fc]',
        dot: 'bg-[#0891b2]',
        ring: 'bg-[#cffafe]',
      };
    case 'voice-number':
      return {
        iconWrap: 'border-emerald-100 bg-emerald-500 text-white',
        circle: 'bg-[#a7f3d0]',
        dot: 'bg-[#059669]',
        ring: 'bg-[#d1fae5]',
      };
    case 'queue':
      return {
        iconWrap: 'border-pink-100 bg-pink-500 text-white',
        circle: 'bg-[#ff9db8]',
        dot: 'bg-[#ff5f87]',
        ring: 'bg-[#ffe0ea]',
      };
    case 'records':
    default:
      return {
        iconWrap: 'border-sky-100 bg-sky-500 text-white',
        circle: 'bg-[#8ec8ff]',
        dot: 'bg-[#4ea6ff]',
        ring: 'bg-[#dcedff]',
      };
  }
}

function renderActionLink(action: DashboardShellAction, className?: string) {
  const variant = action.variant ?? 'secondary';

  return (
    <Link
      to={action.to}
      state={action.state}
      data-guide-id={action.guideId}
      className={cn(
        variant === 'link'
          ? 'inline-flex items-center gap-1.5 text-[15px] font-semibold text-[#0b5cab] transition hover:text-[#014486]'
          : variant === 'primary'
            ? 'inline-flex h-9 items-center justify-center rounded-full border border-[#0b5cab] bg-white px-4 text-sm font-semibold text-[#0b5cab] transition hover:bg-[#f3f8fe]'
            : 'inline-flex h-9 items-center justify-center rounded-full border border-slate-300 bg-white px-4 text-sm font-semibold text-[#014486] transition hover:bg-slate-50',
        className,
      )}
    >
      <span>{action.label}</span>
      {variant === 'link' ? <ArrowRight className="h-3.5 w-3.5" /> : null}
    </Link>
  );
}

function DashboardCardFrame({
  title,
  icon,
  filterLabel,
  action,
  updatedAt,
  footerLabel,
  footerTo,
  children,
}: {
  title: string;
  icon: DashboardShellRecommendation['icon'] | DashboardShellSummaryCard['icon'];
  filterLabel: string;
  action: DashboardShellAction;
  updatedAt: string;
  footerLabel: string;
  footerTo: string;
  children: ReactNode;
}) {
  const Icon = getIcon(icon);
  const accent = getAccentClasses(icon);

  return (
    <article className="flex h-[340px] flex-col overflow-hidden rounded-2xl border border-[#d8dde6] bg-white shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
      <div className="flex items-center gap-2.5 px-3 pb-2 pt-3">
        <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full border', accent.iconWrap)}>
          <Icon className="h-4 w-4" />
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-[#c9cfd8] bg-white px-2.5 py-1.5 text-xs text-slate-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
            <span className="truncate">{filterLabel || title}</span>
            <Search className="ml-auto h-4 w-4 shrink-0 text-slate-400" />
          </div>
          <Link
            to={action.to}
            state={action.state}
            className="inline-flex h-8 items-center justify-center rounded-full border border-[#d8dde6] bg-white px-3 text-xs font-semibold text-[#0176d3] transition hover:bg-[#f3f8fe]"
          >
            {action.label}
          </Link>
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-[#d8dde6] bg-white text-[#0176d3] transition hover:bg-[#f3f8fe]"
            aria-label={`${title} options`}
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3">{children}</div>

      <div className="mt-auto flex items-center justify-between border-t border-[#e5e7eb] px-3 py-2 text-xs text-slate-500">
        <Link to={footerTo} className="font-medium text-[#0176d3] transition hover:text-[#014486]">
          {footerLabel}
        </Link>
        <div className="flex items-center gap-2">
          <span>{updatedAt}</span>
          <RefreshCw className="h-3.5 w-3.5 text-[#0176d3]" />
        </div>
      </div>
    </article>
  );
}

function SummaryVisual({ card }: { card: DashboardShellSummaryCard }) {
  const accent = getAccentClasses(card.icon);

  return (
    <div className="flex h-full min-h-[190px] flex-col items-center justify-center px-4 text-center">
      <div className="relative flex h-28 w-28 items-center justify-center">
        <div className={cn('absolute h-24 w-24 rounded-full', accent.circle)} />
        <div className={cn('absolute left-4 top-4 h-12 w-12 rounded-full opacity-65', accent.ring)} />
        <div className="relative z-10 rounded-2xl border border-[#e5e7eb] bg-white px-5 py-4 shadow-[0_8px_18px_rgba(0,0,0,0.08)]">
          <div className="grid grid-cols-4 gap-1">
            {Array.from({ length: 12 }).map((_, index) => (
              <span
                key={index}
                className={cn(
                  'h-3 w-3 rounded-sm',
                  index % 5 === 0 ? accent.dot : 'bg-slate-100',
                )}
              />
            ))}
          </div>
        </div>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-600">{card.helperText}</p>
      <div className="mt-3 w-full max-w-[250px] space-y-1.5 text-left">
        {card.highlights.map((highlight) => (
          <div key={highlight} className="flex items-center gap-2 text-xs text-slate-600">
            <span className={cn('h-2 w-2 rounded-full', accent.dot)} />
            <span>{highlight}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyStateIllustration({ variant }: { variant: 'records' | 'queue' }) {
  const palette =
    variant === 'records'
      ? {
          orb: 'bg-[#60a5fa]',
          orbSoft: 'bg-[#dbeafe]',
          icon: AlertCircle,
          iconWrap: 'bg-[#0ea5e9]',
        }
      : {
          orb: 'bg-[#f472b6]',
          orbSoft: 'bg-[#fce7f3]',
          icon: Clock3,
          iconWrap: 'bg-[#ec4899]',
        };

  const Icon = palette.icon;

  return (
    <div className="relative mx-auto h-28 w-[220px]">
      <div className={cn('absolute left-8 top-1 h-24 w-24 rounded-full opacity-90', palette.orb)} />
      <div className={cn('absolute left-12 top-5 h-24 w-24 rounded-full opacity-60', palette.orbSoft)} />

      <div className="absolute left-14 top-7 w-[150px] rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-[0_10px_22px_rgba(15,23,42,0.12)]">
        <div className="flex items-center gap-2">
          <span className={cn('inline-flex h-8 w-8 items-center justify-center rounded-full text-white', palette.iconWrap)}>
            <Icon className="h-4 w-4" />
          </span>
          <span className="h-2.5 w-16 rounded-full bg-slate-200" />
          <span className="h-2.5 w-14 rounded-full bg-slate-200" />
        </div>
        <div className="mt-3.5 space-y-2">
          <span className="block h-2.5 rounded-full bg-slate-100" />
          <span className="block h-2.5 w-4/5 rounded-full bg-slate-100" />
          <span className="block h-2.5 w-3/5 rounded-full bg-slate-100" />
        </div>
      </div>
    </div>
  );
}

function ListCardEmpty({ message, variant }: { message: string; variant: 'records' | 'queue' }) {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center px-5 text-center">
      <EmptyStateIllustration variant={variant} />
      <p className="mt-2 text-xs text-slate-500">{message}</p>
    </div>
  );
}

export function DashboardShell({
  workspace,
  onSignOut,
  overview,
  overviewLoading = false,
  setupActions = [],
  showSetupPopup = false,
  onCloseSetupPopup,
}: DashboardShellProps) {
  const [isHeroCollapsed, setIsHeroCollapsed] = useState(false);
  const [dismissedRecommendationIds, setDismissedRecommendationIds] = useState<string[]>([]);
  const pendingSetupActions = setupActions.filter((action) => !action.configured);
  const prioritizedRecommendations = useMemo(
    () => [...overview.recommendations].sort((left, right) => left.priority - right.priority),
    [overview.recommendations],
  );
  const visibleRecommendations = useMemo(
    () => prioritizedRecommendations.filter((recommendation) => !dismissedRecommendationIds.includes(recommendation.id)).slice(0, 3),
    [dismissedRecommendationIds, prioritizedRecommendations],
  );
  const hasVisibleRecommendations = visibleRecommendations.length > 0;
  const remainingRecommendationCount = useMemo(
    () => prioritizedRecommendations.filter((recommendation) => !dismissedRecommendationIds.includes(recommendation.id)).length,
    [dismissedRecommendationIds, prioritizedRecommendations],
  );

  useEffect(() => {
    setDismissedRecommendationIds((current) => current.filter((id) => prioritizedRecommendations.some((recommendation) => recommendation.id === id)));
  }, [prioritizedRecommendations]);

  function handleDismissRecommendation(recommendationId: string) {
    setDismissedRecommendationIds((current) => (current.includes(recommendationId) ? current : [...current, recommendationId]));
  }

  return (
    <WorkspaceLayout workspace={workspace} onSignOut={onSignOut}>
      <div className="space-y-3.5">
        <section
          data-guide-id="dashboard-hero"
          className="relative overflow-hidden rounded-2xl border border-[#d5e3f5] bg-[linear-gradient(135deg,#f8fbff_0%,#edf4ff_55%,#f5f8ff_100%)] shadow-[0_14px_34px_rgba(15,23,42,0.08)]"
        >
          <div className="pointer-events-none absolute -top-20 right-16 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(59,130,246,0.18)_0%,rgba(59,130,246,0)_72%)]" />
          <div className="pointer-events-none absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(56,189,248,0.14)_0%,rgba(56,189,248,0)_72%)]" />

          <div
            className={cn(
              'relative z-10 grid gap-4 px-4 py-4',
              !isHeroCollapsed && hasVisibleRecommendations && 'xl:grid-cols-[0.85fr_2.15fr] xl:items-center',
            )}
          >
            <div className={cn('flex justify-end', !isHeroCollapsed && 'xl:col-span-2')}>
              <button
                type="button"
                onClick={() => setIsHeroCollapsed((current) => !current)}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#d8dde6] bg-white px-3 py-1.5 text-xs font-semibold text-[#0176d3] transition hover:bg-[#f3f8fe]"
                aria-expanded={!isHeroCollapsed}
                aria-label={isHeroCollapsed ? 'Expand header' : 'Collapse header'}
              >
                {isHeroCollapsed ? 'Expand' : 'Collapse'}
                <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', isHeroCollapsed ? '-rotate-180' : 'rotate-0')} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-2 text-[#0176d3]">
                <div className="h-2.5 w-2.5 rounded-full bg-[#0176d3]" />
                <span className="text-sm font-semibold">{overview.panelEyebrow}</span>
                {overviewLoading ? <RefreshCw className="h-4 w-4 animate-spin text-slate-400" /> : null}
              </div>

              <div>
                <h1 className="text-3xl font-light tracking-tight text-[#16325c] lg:text-[34px]">{overview.panelTitle}</h1>
                {!isHeroCollapsed ? <p className="mt-1 max-w-md text-sm leading-6 text-slate-700">{overview.panelSubtitle}</p> : null}
              </div>

              {!isHeroCollapsed ? renderActionLink(overview.panelLink, 'w-fit') : null}

              {!isHeroCollapsed ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  {overview.quickActions.map((action) => renderActionLink(action, 'h-8 px-3 text-xs'))}
                </div>
              ) : null}
            </div>

            {!isHeroCollapsed && hasVisibleRecommendations ? (
              <div className="space-y-2">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {visibleRecommendations.map((recommendation) => {
                    const accent = getAccentClasses(recommendation.icon);
                    const Icon = getIcon(recommendation.icon);

                    return (
                      <article
                        key={recommendation.id}
                        className="min-h-[150px] rounded-2xl border border-[#dbe4f2] bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-4 shadow-[0_10px_22px_rgba(15,23,42,0.07)] backdrop-blur-[2px]"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className={cn('flex h-9 w-9 items-center justify-center rounded-full border', accent.iconWrap)}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDismissRecommendation(recommendation.id)}
                            className="flex h-8 w-8 items-center justify-center rounded-full text-[#0176d3] transition hover:bg-[#f3f8fe]"
                            aria-label={`Dismiss ${recommendation.title}`}
                          >
                            <X className="h-5 w-5" />
                          </button>
                        </div>

                        <div className="mt-5">
                          <h2 className="text-[15px] font-medium leading-5 text-[#16325c]">{recommendation.title}</h2>
                          <p className="mt-2 text-xs leading-5 text-slate-700">{recommendation.description}</p>
                        </div>

                        <Link
                          to={recommendation.to}
                          className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-[#0176d3] transition hover:text-[#014486]"
                        >
                          {recommendation.ctaLabel}
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </article>
                    );
                  })}
                </div>
                {remainingRecommendationCount > 0 ? (
                  <p className="text-xs font-medium text-slate-500">
                    {`${remainingRecommendationCount} priority ${remainingRecommendationCount === 1 ? 'card' : 'cards'} remaining`}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {overview.summaryCards.map((card) => (
            <DashboardCardFrame
              key={card.id}
              title={card.title}
              icon={card.icon}
              filterLabel={card.filterLabel}
              action={card.action}
              updatedAt={card.updatedAt}
              footerLabel={card.footerLabel}
              footerTo={card.footerTo}
            >
              <SummaryVisual card={card} />
            </DashboardCardFrame>
          ))}

          <DashboardCardFrame
            title="Recent Records"
            icon="records"
            filterLabel={overview.recentRecordsFilterLabel}
            action={{ label: 'New', to: '/records', state: { openCreateRecord: true } }}
            updatedAt={overview.updatedAtLabel}
            footerLabel="View Report"
            footerTo="/records"
          >
            <div className="space-y-2 pt-1">
              {overview.recentRecords.length > 0 ? (
                overview.recentRecords.map((record) => (
                  <div key={record.id} className="rounded-xl border border-[#e5e7eb] bg-[#fafbfc] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#16325c]">{record.title}</p>
                        <p className="mt-0.5 truncate text-xs text-slate-500">{record.subtitle}</p>
                      </div>
                      <span className={cn('inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold', recordStatusClasses[record.statusTone])}>
                        {record.statusLabel}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      {record.stageLabel ? <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">{record.stageLabel}</span> : null}
                      <span>{record.meta}</span>
                    </div>
                    <Link to={record.to} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#0176d3]">
                      Open
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                ))
              ) : (
                <ListCardEmpty
                  variant="records"
                  message="Recent records will appear here as the workspace becomes active."
                />
              )}
            </div>
          </DashboardCardFrame>

          <DashboardCardFrame
            title="Follow-up Queue"
            icon="queue"
            filterLabel={overview.queueFilterLabel}
            action={{ label: 'Open', to: '/records' }}
            updatedAt={overview.updatedAtLabel}
            footerLabel="View Report"
            footerTo="/records"
          >
            <div className="space-y-2 pt-1">
              {overview.queueItems.length > 0 ? (
                overview.queueItems.map((item) => (
                  <div key={item.id} className="rounded-xl border border-[#e5e7eb] bg-[#fafbfc] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#16325c]">{item.title}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">{item.description}</p>
                      </div>
                      <span className={cn('inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold', queuePriorityClasses[item.priorityTone])}>
                        {item.priorityLabel}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <p className="text-xs text-slate-500">{item.meta}</p>
                      <Link to={item.to} className="inline-flex items-center gap-1 text-xs font-medium text-[#0176d3]">
                        {item.ctaLabel}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>
                ))
              ) : (
                <ListCardEmpty variant="queue" message="The follow-up queue is clear right now." />
              )}
            </div>
          </DashboardCardFrame>

          <DashboardCardFrame
            title="Workspace Setup"
            icon="workflow"
            filterLabel={overview.setupFilterLabel}
            action={{ label: 'Review', to: '/account' }}
            updatedAt={overview.updatedAtLabel}
            footerLabel="View Report"
            footerTo="/account"
          >
            <div className="space-y-2 pt-1">
              {overview.setupItems.map((item) => (
                <div key={item.id} className="rounded-xl border border-[#e5e7eb] bg-[#fafbfc] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#16325c]">{item.label}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{item.detail}</p>
                    </div>
                    <span className={cn('inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold', setupStatusClasses[item.status])}>
                      {item.statusLabel}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </DashboardCardFrame>
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {overview.healthItems.map((item) => {
            const Icon = getIcon(item.icon);
            return (
              <Link
                key={item.id}
                to={item.to}
                className={cn(
                  'rounded-2xl border p-3 shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition hover:bg-white',
                  healthStatusClasses[item.status],
                )}
              >
                <div className="flex items-center gap-2 text-[#16325c]">
                  <Icon className="h-4 w-4 text-[#0176d3]" />
                  <p className="text-sm font-semibold">{item.label}</p>
                </div>
                <p className="mt-2 text-base font-semibold text-[#16325c]">{item.value}</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">{item.hint}</p>
              </Link>
            );
          })}
        </section>
      </div>

      {showSetupPopup && pendingSetupActions.length > 0 ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[24px] border border-[#d8dde6] bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#0176d3]">Workspace setup</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#16325c]">A few setup steps still need attention</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Finish these items to unlock the full queue, communication, and automation flow for this workspace.
                </p>
              </div>
              <button
                type="button"
                onClick={onCloseSetupPopup}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-[#d8dde6] text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
                aria-label="Close setup reminder"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 space-y-3">
              {pendingSetupActions.map((action) => (
                <div key={action.id} className="flex flex-col gap-3 rounded-2xl border border-[#e5e7eb] bg-[#fafbfc] p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[#16325c]">{action.title}</p>
                    <p className="mt-1 text-sm text-slate-500">{action.description}</p>
                  </div>
                  <Link to={action.to} className={buttonStyles('primary', 'sm')} onClick={onCloseSetupPopup}>
                    {action.actionLabel}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </WorkspaceLayout>
  );
}
