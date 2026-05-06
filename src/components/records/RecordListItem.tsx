import {
  ArrowUpRight,
  CheckSquare,
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
  getStageName,
} from '../../lib/record-workbench';
import { cn } from '../../lib/utils';
import type { RecordQuickActionMode } from './RecordQuickActionDrawer';

export const recordListGridClassName =
  'grid min-w-[1220px] grid-cols-[40px_minmax(300px,2.35fr)_minmax(130px,0.95fr)_minmax(190px,1.2fr)_minmax(130px,0.95fr)_minmax(170px,1.1fr)_minmax(170px,1.1fr)_minmax(140px,1fr)_64px] items-center gap-4';

interface RecordListItemProps {
  record: RecordSummary;
  config: CrmWorkspaceConfig;
  crmType: CRMType;
  isSelected: boolean;
  onToggleSelect: (recordId: string, checked: boolean) => void;
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

function pillStyles(tone: 'neutral' | 'type' | 'source') {
  switch (tone) {
    case 'type':
      return 'border-[#d5ddeb] bg-[#eef2fb] text-[#5e6b89]';
    case 'source':
      return 'border-[#d9deea] bg-white text-[#606a82]';
    default:
      return 'border-[#d9deea] bg-white text-[#606a82]';
  }
}

function followUpStyles(tone: ReturnType<typeof getRecordFollowUpSummary>['tone']) {
  switch (tone) {
    case 'overdue':
      return 'border-rose-200 bg-rose-50 text-rose-700';
    case 'today':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'pending':
      return 'border-[#d6deec] bg-[#f4f6fb] text-[#6e778f]';
    default:
      return 'border-[#d6deec] bg-white text-[#6e778f]';
  }
}

function statusPillStyles(status: string | null | undefined) {
  const normalized = status?.trim().toLowerCase().replace(/\s+/g, '_') ?? '';

  if (!normalized || normalized === 'open') {
    return 'border-[#cde7d1] bg-[#edf9ee] text-[#4a9c5b]';
  }

  if (normalized.includes('new')) {
    return 'border-[#cde7d1] bg-[#edf9ee] text-[#4a9c5b]';
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

  return 'border-[#cde7d1] bg-[#edf9ee] text-[#4a9c5b]';
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
    const menuWidth = menuRect?.width ?? 220;
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
    <div className="flex justify-end">
      <button
        ref={triggerRef}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
        aria-label={`Open actions for ${record.title}`}
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#d8deeb] bg-[#f1f3f8] text-[#6a748d] transition hover:bg-[#e9edf5] hover:text-[#4f596f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#cdd4e3]"
      >
        <PencilLine className="h-4 w-4" />
      </button>

      {open && menuPosition
        ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            className="fixed z-[90] w-56 rounded-[16px] border border-[#d9deea] bg-white p-2 shadow-xl shadow-[#20293d24]"
            style={{ top: menuPosition.top, left: menuPosition.left }}
          >
            <div className="px-3 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#6a7288]">
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
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium text-[#4e566b] transition hover:bg-[#f3f5fa] hover:text-[#2f374b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#cdd4e3]"
                  >
                    <Icon className="h-4 w-4 text-[#6b7388]" />
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
  isSelected,
  onToggleSelect,
  onEditLead,
  onOpenAction,
}: RecordListItemProps) {
  const identity = useMemo(() => getRecordIdentity(record), [record]);
  const typeLabel = useMemo(() => getRecordTypeLabel(record, config, crmType), [record, config, crmType]);
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
  const contactSummary = phone ?? record.email?.trim() ?? 'No contact details';

  return (
    <div
      className={cn(
        recordListGridClassName,
        'group border-b border-[#eceff6] px-5 py-3 text-[13px] transition-colors duration-150 hover:bg-[#f7f8fc] focus-within:bg-[#f7f8fc]',
      )}
    >
      <div className="flex items-center justify-center">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(event) => onToggleSelect(record.id, event.target.checked)}
          aria-label={`Select ${identity.title}`}
          className="h-4 w-4 rounded-full border-[#cfd5e4] text-[#4c39df] focus:ring-[#cfd5e4]"
        />
      </div>

      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#cfd7e8] bg-[#e8edfb] text-sm font-semibold text-[#4f41d5]">
            {identity.initials}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <Link
                to={`/records/${record.id}`}
                className="truncate text-[18px] font-semibold leading-[1.2] tracking-normal text-[#1f2a3f] transition group-hover:text-[#33405f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ced6e8]"
              >
                {identity.title}
              </Link>
              {identity.supportingTag ? (
                <span className="rounded-full border border-[#d9deea] bg-white px-2 py-0.5 text-[10px] font-medium text-[#7a8297]">
                  {identity.supportingTag}
                </span>
              ) : null}
            </div>
            <div className="mt-0.5 truncate text-[13px] font-medium text-[#6c7388]">{identity.subtitle}</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px]">
              {(record.open_task_count ?? 0) > 0 ? (
                <span className={cn('rounded-full border px-2.5 py-0.5 font-semibold', pillStyles('neutral'))}>
                  {record.open_task_count} open task{record.open_task_count === 1 ? '' : 's'}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="min-w-0">
        <span className={cn('inline-flex max-w-full truncate rounded-full border px-2.5 py-1 text-[11px] font-semibold', pillStyles('type'))}>
          {typeLabel}
        </span>
      </div>

      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-[#2f3a54]">{sourceName}</div>
        <div className="mt-0.5 truncate text-[12px] font-medium text-[#757d93]">{contactSummary}</div>
      </div>

      <div className="min-w-0">
        <span
          className={cn(
            'inline-flex max-w-full truncate rounded-full border px-2.5 py-1 text-[11px] font-semibold',
            statusPillStyles(record.status),
          )}
        >
          {statusLabel}
        </span>
        <div className="mt-0.5 text-[11px] font-medium text-[#7b8397]">{getStageName(config, record.stage_id)}</div>
      </div>

      <div className="min-w-0">
        <Link
          to={followUpHref}
          aria-label={`Open follow-up details for ${record.title}`}
          className="group/followup block rounded-xl px-2 py-1.5 transition hover:bg-[#f1f4fa] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ced6e8]"
        >
          <div className="flex items-center justify-between gap-2">
            <span
              className={cn(
                'inline-flex max-w-full truncate rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]',
                followUpStyles(followUp.tone),
              )}
            >
              {followUp.label}
            </span>
            <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-[#8e95a8] transition group-hover/followup:text-[#5f6780]" />
          </div>
          <div className="mt-1 truncate text-sm font-semibold text-[#39435d]">{followUp.taskTitle}</div>
        </Link>
      </div>

      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#d9deea] bg-[#f2f4f8] text-[10px] font-semibold text-[#6b7388]">
            {ownerName.slice(0, 1).toUpperCase()}
          </span>
          <span className="truncate text-sm font-semibold text-[#2f3a54]">{ownerName}</span>
        </div>
        <div className="mt-1 text-[11px] font-medium text-[#7b8397]">{record.priority ? `${record.priority} priority` : 'No priority'}</div>
      </div>

      <div className="min-w-0">
        <div className="text-sm font-semibold text-[#2f3a54]">{formatRecordCreatedDate(record.created_at)}</div>
        <div className="mt-0.5 text-[11px] font-medium text-[#7b8397]">{formatRelativeDateTime(record.last_activity_at ?? record.updated_at)}</div>
      </div>

      <RowActionsMenu record={record} onEditLead={onEditLead} onOpenAction={onOpenAction} />
    </div>
  );
}
