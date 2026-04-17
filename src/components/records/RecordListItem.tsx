import {
  ArrowUpRight,
  CheckSquare,
  Ellipsis,
  ExternalLink,
  MessageSquarePlus,
  PencilLine,
  Shuffle,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import type { CrmWorkspaceConfig, RecordSummary } from '../../lib/crm-types';
import type { CRMType } from '../../lib/types';
import {
  getRecordFollowUpSummary,
  formatRecordCreatedDate,
  formatRelativeDateTime,
  getRecordIdentity,
  getRecordTypeLabel,
  getSourceName,
  getStageDetails,
  getStageName,
} from '../../lib/record-workbench';
import { cn } from '../../lib/utils';
import type { RecordQuickActionMode } from './RecordQuickActionDrawer';

export const recordListGridClassName =
  'grid min-w-[1260px] grid-cols-[minmax(320px,2.35fr)_minmax(140px,1fr)_minmax(130px,0.9fr)_minmax(130px,0.9fr)_minmax(140px,1fr)_minmax(160px,1fr)_minmax(220px,1.15fr)_64px] items-center gap-4';

interface RecordListItemProps {
  record: RecordSummary;
  config: CrmWorkspaceConfig;
  crmType: CRMType;
  onEditLead: (record: RecordSummary) => void;
  onOpenAction: (record: RecordSummary, mode: Exclude<RecordQuickActionMode, null>) => void;
}

function formatStatusLabel(status: string | null | undefined) {
  const value = status?.trim();

  if (!value) {
    return 'Open';
  }

  return value
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function pillStyles(tone: 'neutral' | 'type' | 'source' | 'stage' | 'closed') {
  switch (tone) {
    case 'type':
      return 'border-indigo-200 bg-indigo-50 text-indigo-700';
    case 'source':
      return 'border-slate-300 bg-white text-slate-700';
    case 'stage':
      return 'border-violet-200 bg-violet-50 text-violet-700';
    case 'closed':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    default:
      return 'border-slate-300 bg-white text-slate-700';
  }
}

function followUpStyles(tone: ReturnType<typeof getRecordFollowUpSummary>['tone']) {
  switch (tone) {
    case 'overdue':
      return 'border-rose-200 bg-rose-50 text-rose-700';
    case 'today':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'pending':
      return 'border-sky-200 bg-sky-50 text-sky-700';
    default:
      return 'border-slate-300 bg-white text-slate-700';
  }
}

function statusPillStyles(status: string | null | undefined) {
  const normalized = status?.trim().toLowerCase().replace(/\s+/g, '_') ?? '';

  if (!normalized || normalized === 'open') {
    return 'border-sky-200 bg-sky-50 text-sky-700';
  }

  if (normalized.includes('new')) {
    return 'border-indigo-200 bg-indigo-50 text-indigo-700';
  }

  if (normalized.includes('nurtur')) {
    return 'border-violet-200 bg-violet-50 text-violet-700';
  }

  if (normalized.includes('qualified') || normalized.includes('active')) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }

  if (normalized.includes('closed') || normalized.includes('won')) {
    return 'border-slate-300 bg-slate-100 text-slate-700';
  }

  return 'border-indigo-200 bg-indigo-50 text-indigo-700';
}

function ownerPillStyles(ownerName: string) {
  return ownerName === 'Unassigned'
    ? 'border-amber-200 bg-amber-50 text-amber-700'
    : 'border-slate-300 bg-white text-slate-700';
}

function RowActionsMenu({
  record,
  onEditLead,
  onOpenAction,
}: Pick<RecordListItemProps, 'record' | 'onEditLead' | 'onOpenAction'>) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);

  const updateMenuPosition = useCallback(() => {
    if (!open || !triggerRef.current) {
      return;
    }

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const menuRect = menuRef.current?.getBoundingClientRect();
    const menuWidth = menuRect?.width ?? 224;
    const menuHeight = menuRect?.height ?? 280;
    const viewportPadding = 12;
    const verticalGap = 8;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const desiredLeft = triggerRect.right - menuWidth;
    const left = Math.min(
      Math.max(viewportPadding, desiredLeft),
      Math.max(viewportPadding, viewportWidth - menuWidth - viewportPadding),
    );

    const spaceBelow = viewportHeight - triggerRect.bottom - viewportPadding;
    const spaceAbove = triggerRect.top - viewportPadding;
    const shouldOpenAbove = spaceBelow < menuHeight + verticalGap && spaceAbove > spaceBelow;

    const top = shouldOpenAbove
      ? Math.max(viewportPadding, triggerRect.top - menuHeight - verticalGap)
      : Math.min(
          Math.max(viewportPadding, triggerRect.bottom + verticalGap),
          Math.max(viewportPadding, viewportHeight - menuHeight - viewportPadding),
        );

    setMenuPosition({ top, left });
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;

      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) {
        return;
      }

      setOpen(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    function handleViewportChange() {
      updateMenuPosition();
    }

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [open, updateMenuPosition]);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    updateMenuPosition();
  }, [open, updateMenuPosition]);

  const actions: Array<{
    label: string;
    icon: typeof ExternalLink;
    onSelect: () => void;
  }> = [
    {
      label: 'View details',
      icon: ExternalLink,
      onSelect: () => navigate(`/records/${record.id}`),
    },
    {
      label: 'Edit record',
      icon: PencilLine,
      onSelect: () => onEditLead(record),
    },
    {
      label: 'Add note',
      icon: MessageSquarePlus,
      onSelect: () => onOpenAction(record, 'note'),
    },
    {
      label: 'Create task',
      icon: CheckSquare,
      onSelect: () => onOpenAction(record, 'task'),
    },
    {
      label: 'Move stage',
      icon: Shuffle,
      onSelect: () => onOpenAction(record, 'stage'),
    },
    {
      label: 'Assign owner',
      icon: Users,
      onSelect: () => onOpenAction(record, 'owner'),
    },
  ];

  return (
    <div className="relative flex justify-end">
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Open actions for ${record.title}`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-transparent bg-transparent text-slate-500 transition hover:border-slate-300 hover:bg-white hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200"
      >
        <Ellipsis className="h-4 w-4" />
      </button>

      {open && menuPosition
        ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            className="fixed z-[90] w-56 rounded-[20px] border border-slate-300 bg-slate-50 p-2 shadow-2xl shadow-slate-950/40 backdrop-blur-xl"
            style={{ top: menuPosition.top, left: menuPosition.left }}
          >
            <div className="px-3 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Actions
            </div>
            <div className="space-y-1">
              {actions.map((action) => {
                const Icon = action.icon;

                return (
                  <button
                    key={action.label}
                    type="button"
                    role="menuitem"
                    onClick={(event) => {
                      event.stopPropagation();
                      setOpen(false);
                      action.onSelect();
                    }}
                    className="flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-white hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200"
                  >
                    <Icon className="h-4 w-4 text-slate-600" />
                    <span>{action.label}</span>
                  </button>
                );
              })}
            </div>
          </div>,
          document.body,
        )
        : null}
    </div>
  );
}

export function RecordListItem({
  record,
  config,
  crmType,
  onEditLead,
  onOpenAction,
}: RecordListItemProps) {
  const identity = useMemo(() => getRecordIdentity(record), [record]);
  const typeLabel = useMemo(() => getRecordTypeLabel(record, config, crmType), [record, config, crmType]);
  const stage = useMemo(() => getStageDetails(config, record.stage_id), [config, record.stage_id]);
  const sourceName = useMemo(
    () => getSourceName(config, record.source_id, record.imported_from ?? null),
    [config, record.source_id, record.imported_from],
  );
  const ownerName = useMemo(
    () => config.assignees.find((assignee) => assignee.userId === record.assignee_user_id)?.fullName ?? 'Unassigned',
    [config.assignees, record.assignee_user_id],
  );
  const followUp = useMemo(() => getRecordFollowUpSummary(record), [record]);
  const phone = record.phone?.trim() || null;
  const statusLabel = formatStatusLabel(record.status);
  const followUpHref = `/records/${record.id}#tasks`;

  return (
    <div
      className={cn(
        recordListGridClassName,
        'group border-b border-slate-300 px-5 py-3 text-[13px] transition-colors duration-150 hover:bg-slate-50 focus-within:bg-slate-50',
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-accent-blue/25 bg-accent-blue/10 text-sm font-semibold text-accent-blue">
            {identity.initials}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <Link
                to={`/records/${record.id}`}
                className="truncate text-[14px] font-semibold text-slate-900 transition group-hover:text-accent-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200"
              >
                {identity.title}
              </Link>
              {identity.supportingTag ? (
                <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[10px] text-slate-600">
                  {identity.supportingTag}
                </span>
              ) : null}
            </div>
            <div className="mt-0.5 truncate text-[12px] text-slate-500">{identity.subtitle}</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px]">
              <span className={cn('rounded-full border px-2.5 py-0.5 font-medium', statusPillStyles(record.status))}>
                {statusLabel}
              </span>
              <span className={cn('rounded-full border px-2.5 py-0.5', ownerPillStyles(ownerName))}>
                Owner: {ownerName}
              </span>
              {(record.open_task_count ?? 0) > 0 ? (
                <span className={cn('rounded-full border px-2.5 py-0.5 text-slate-600', pillStyles('neutral'))}>
                  {record.open_task_count} open task{record.open_task_count === 1 ? '' : 's'}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="min-w-0">
        {phone ? (
          <a
            href={`tel:${phone}`}
            className="text-sm font-medium text-slate-700 transition hover:text-accent-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200"
          >
            {phone}
          </a>
        ) : (
          <span className="text-sm text-slate-500">No phone</span>
        )}
      </div>

      <div className="min-w-0">
        <span className={cn('inline-flex max-w-full truncate rounded-full border px-2.5 py-1 text-[11px] font-medium', pillStyles('type'))}>
          {typeLabel}
        </span>
      </div>

      <div className="min-w-0">
        <span
          className={cn(
            'inline-flex max-w-full truncate rounded-full border px-2.5 py-1 text-[11px] font-medium',
            stage?.is_closed ? pillStyles('closed') : pillStyles('stage'),
          )}
        >
          {getStageName(config, record.stage_id)}
        </span>
        <div className="mt-0.5 text-[11px] text-slate-500">{record.priority ? `${record.priority} priority` : 'No priority'}</div>
      </div>

      <div className="min-w-0">
        <span className={cn('inline-flex max-w-full truncate rounded-full border px-2.5 py-1 text-[11px] font-medium', pillStyles('source'))}>
          {sourceName}
        </span>
        <div className="mt-0.5 text-[11px] text-slate-500">{ownerName}</div>
      </div>

      <div className="min-w-0">
        <div className="text-sm font-medium text-slate-700">{formatRecordCreatedDate(record.created_at)}</div>
        <div className="mt-0.5 text-[11px] text-slate-500">Updated {formatRelativeDateTime(record.updated_at)}</div>
      </div>

      <div className="min-w-0">
        <Link
          to={followUpHref}
          aria-label={`Open follow-up details for ${record.title}`}
          className="group/followup block rounded-xl px-2 py-1.5 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200"
        >
          <div className="flex items-center justify-between gap-2">
            <span
              className={cn(
                'inline-flex max-w-full truncate rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em]',
                followUpStyles(followUp.tone),
              )}
            >
              {followUp.label}
            </span>
            <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-slate-400 transition group-hover/followup:text-accent-blue" />
          </div>
          <div className="mt-1 truncate text-sm font-medium text-slate-800 transition group-hover/followup:text-slate-900">
            {followUp.taskTitle}
          </div>
          <div className="mt-0.5 truncate text-[11px] text-slate-500">{followUp.detail}</div>
          <div className="mt-0.5 text-[11px] text-slate-500">
            Last activity {formatRelativeDateTime(record.last_activity_at ?? record.updated_at)}
          </div>
        </Link>
      </div>

      <RowActionsMenu record={record} onEditLead={onEditLead} onOpenAction={onOpenAction} />
    </div>
  );
}
