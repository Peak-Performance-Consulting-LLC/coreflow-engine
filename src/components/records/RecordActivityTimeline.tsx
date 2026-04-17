import {
  BadgeCheck,
  CalendarClock,
  CheckSquare,
  ChevronDown,
  CircleDot,
  MessageSquareText,
  PencilLine,
  Shuffle,
  UserRound,
} from 'lucide-react';
import type { CrmWorkspaceConfig, RecordActivity, RecordNote, RecordSummary, RecordTask } from '../../lib/crm-types';
import { formatActivityLabel, formatFollowUpDateTime, formatRelativeDateTime } from '../../lib/record-workbench';
import { cn } from '../../lib/utils';
import { Card } from '../ui/Card';

type ActivityTone = 'neutral' | 'success' | 'warning' | 'accent';

type ActivityDetailRow = {
  label: string;
  value: string;
};

type ActivityPresentation = {
  title: string;
  summary: string;
  detail?: string | null;
  details: ActivityDetailRow[];
  tone: ActivityTone;
  icon: typeof CircleDot;
};

interface RecordActivityTimelineProps {
  activities: RecordActivity[];
  config: CrmWorkspaceConfig;
  record: Pick<RecordSummary, 'title'>;
  notes: RecordNote[];
  tasks: RecordTask[];
}

function getStageName(config: CrmWorkspaceConfig, stageId: string | null | undefined) {
  if (!stageId) {
    return null;
  }

  for (const pipeline of config.pipelines) {
    const stage = pipeline.stages.find((item) => item.id === stageId);

    if (stage) {
      return stage.name;
    }
  }

  return null;
}

function getAssigneeName(config: CrmWorkspaceConfig, userId: string | null | undefined) {
  if (!userId) {
    return null;
  }

  return config.assignees.find((assignee) => assignee.userId === userId)?.fullName ?? null;
}

function getTaskById(tasks: RecordTask[], taskId: string | null | undefined) {
  if (!taskId) {
    return null;
  }

  return tasks.find((task) => task.id === taskId) ?? null;
}

function getNoteById(notes: RecordNote[], noteId: string | null | undefined) {
  if (!noteId) {
    return null;
  }

  return notes.find((note) => note.id === noteId) ?? null;
}

function getString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function truncateText(value: string, maxLength = 120) {
  const normalized = value.replace(/\s+/g, ' ').trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3)}...`;
}

function formatAbsoluteTimestamp(value: string) {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatRawActivity(activity: RecordActivity) {
  return JSON.stringify(
    {
      id: activity.id,
      activity_type: activity.activity_type,
      created_by: activity.created_by,
      created_at: activity.created_at,
      meta: activity.meta ?? {},
    },
    null,
    2,
  );
}

function formatEventDateTime(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return formatFollowUpDateTime(value);
}

function addDetailRow(rows: ActivityDetailRow[], label: string, value: string | null | undefined) {
  const normalized = typeof value === 'string' ? value.trim() : '';

  if (!normalized) {
    return;
  }

  rows.push({ label, value: normalized });
}

function hasMetadata(meta: Record<string, unknown>) {
  return Object.keys(meta).length > 0;
}

function toneStyles(tone: ActivityTone) {
  switch (tone) {
    case 'success':
      return {
        rail: 'bg-emerald-300/25',
        icon: 'border-indigo-300 bg-[#EEF2FF] text-slate-700',
        badge: 'border-indigo-300 bg-[#EEF2FF] text-slate-700',
      };
    case 'warning':
      return {
        rail: 'bg-amber-300/25',
        icon: 'border-indigo-200 bg-[#EEF2FF] text-slate-700',
        badge: 'border-indigo-200 bg-[#EEF2FF] text-slate-700',
      };
    case 'accent':
      return {
        rail: 'bg-[#E2E8F0]',
        icon: 'border-indigo-200 bg-[#EEF2FF] text-slate-700',
        badge: 'border-indigo-200 bg-[#EEF2FF] text-slate-700',
      };
    default:
      return {
        rail: 'bg-[#F1F5F9]',
        icon: 'border-slate-300 bg-white text-slate-700',
        badge: 'border-slate-300 bg-white text-slate-700',
      };
  }
}

function buildActivityPresentation(
  activity: RecordActivity,
  config: CrmWorkspaceConfig,
  record: Pick<RecordSummary, 'title'>,
  notes: RecordNote[],
  tasks: RecordTask[],
): ActivityPresentation {
  const meta = activity.meta ?? {};
  const titleFromMeta = getString(meta.title);
  const actorName = getAssigneeName(config, getString(activity.created_by)) ?? 'System';
  const eventType = formatActivityLabel(activity.activity_type);

  switch (activity.activity_type) {
    case 'record_created': {
      const stageName = getStageName(config, getString(meta.stage_id));
      const details: ActivityDetailRow[] = [];

      addDetailRow(details, 'Record title', record.title || 'Untitled record');
      addDetailRow(details, 'Initial stage', stageName ?? (getString(meta.stage_id) ? 'Unknown stage' : 'Not set'));
      addDetailRow(details, 'Created by', actorName);
      addDetailRow(details, 'Event type', eventType);

      return {
        title: 'Record created',
        summary: `${record.title} record created`,
        detail: stageName ? `Entered the pipeline in ${stageName}` : 'Added to the workspace record pipeline',
        details,
        tone: 'success',
        icon: BadgeCheck,
      };
    }
    case 'task_created': {
      const task = getTaskById(tasks, getString(meta.task_id));
      const taskTitle = task?.title ?? (titleFromMeta || 'A follow-up task was created');
      const dueLabel = task?.due_at ? formatFollowUpDateTime(task.due_at) : null;
      const assigneeName = getAssigneeName(config, task?.assigned_to);
      const detailParts = [dueLabel ? `Due ${dueLabel}` : null, assigneeName ? `Assigned to ${assigneeName}` : null].filter(
        Boolean,
      );
      const details: ActivityDetailRow[] = [];

      addDetailRow(details, 'Task title', task?.title ?? (titleFromMeta || 'Untitled task'));
      addDetailRow(details, 'Due date', formatEventDateTime(task?.due_at ?? getString(meta.due_at)) ?? 'No due date');
      addDetailRow(
        details,
        'Assigned to',
        assigneeName ?? (task?.assigned_to ? 'Unknown assignee' : getString(meta.assigned_to) ? 'Unknown assignee' : 'Unassigned'),
      );
      addDetailRow(details, 'Created by', actorName);
      addDetailRow(details, 'Event type', eventType);

      return {
        title: 'Follow-up task created',
        summary: taskTitle,
        detail: detailParts.length > 0 ? detailParts.join(' - ') : 'Linked to this record for follow-up tracking',
        details,
        tone: 'warning',
        icon: CheckSquare,
      };
    }
    case 'stage_changed': {
      const fromStage = getStageName(config, getString(meta.from_stage_id));
      const toStage = getStageName(config, getString(meta.to_stage_id));
      const details: ActivityDetailRow[] = [];
      const summary =
        fromStage && toStage
          ? `Moved from ${fromStage} to ${toStage}`
          : toStage
            ? `Moved to ${toStage}`
            : 'Pipeline stage updated';

      addDetailRow(details, 'From stage', fromStage ?? (getString(meta.from_stage_id) ? 'Unknown stage' : 'Not set'));
      addDetailRow(details, 'To stage', toStage ?? (getString(meta.to_stage_id) ? 'Unknown stage' : 'Not set'));
      addDetailRow(details, 'Changed by', actorName);
      addDetailRow(details, 'Event type', eventType);

      return {
        title: 'Stage changed',
        summary,
        detail: 'Lifecycle stage updated by the system',
        details,
        tone: 'accent',
        icon: Shuffle,
      };
    }
    case 'assignment_changed': {
      const fromAssignee = getAssigneeName(config, getString(meta.from_assignee_user_id));
      const toAssignee =
        getAssigneeName(config, getString(meta.to_assignee_user_id)) ??
        getAssigneeName(config, getString(meta.assignee_user_id));
      const details: ActivityDetailRow[] = [];
      let summary = 'Ownership updated';

      if (fromAssignee && toAssignee) {
        summary = `Reassigned from ${fromAssignee} to ${toAssignee}`;
      } else if (toAssignee) {
        summary = `Assigned to ${toAssignee}`;
      } else if (fromAssignee) {
        summary = `Unassigned from ${fromAssignee}`;
      }

      addDetailRow(
        details,
        'Assigned to',
        toAssignee ??
          (getString(meta.to_assignee_user_id) || getString(meta.assignee_user_id) ? 'Unknown assignee' : 'Unassigned'),
      );
      addDetailRow(details, 'Changed by', actorName);
      addDetailRow(details, 'Event type', eventType);

      return {
        title: 'Owner changed',
        summary,
        detail: 'Record routing was updated',
        details,
        tone: 'accent',
        icon: UserRound,
      };
    }
    case 'note_added': {
      const note = getNoteById(notes, getString(meta.note_id));
      const notePreview = note ? truncateText(note.body) : truncateText(getString(meta.body));
      const details: ActivityDetailRow[] = [];

      addDetailRow(details, 'Note preview', notePreview ?? 'Saved to the record');
      addDetailRow(details, 'Added by', actorName);
      addDetailRow(details, 'Event type', eventType);

      return {
        title: 'Note added',
        summary: notePreview ?? 'A note was added to this record',
        detail: notePreview ? 'Captured in the record notes section' : 'Additional context was saved to the record',
        details,
        tone: 'neutral',
        icon: MessageSquareText,
      };
    }
    case 'record_updated':
      return {
        title: 'Record updated',
        summary: titleFromMeta ? `Updated record details for ${titleFromMeta}` : 'Record details were updated',
        detail: actorName ? `Updated by ${actorName}` : 'Core details or custom fields changed',
        details: [
          { label: 'Record title', value: record.title || 'Untitled record' },
          { label: 'Updated by', value: actorName },
          { label: 'Event type', value: eventType },
        ],
        tone: 'neutral',
        icon: PencilLine,
      };
    default:
      return {
        title: formatActivityLabel(activity.activity_type),
        summary: 'This record activity was captured by the system',
        detail: 'Structured event details are available below',
        details: [
          { label: 'Event type', value: eventType },
          { label: 'Recorded by', value: actorName },
          { label: 'Recorded at', value: formatAbsoluteTimestamp(activity.created_at) },
        ],
        tone: 'neutral',
        icon: CalendarClock,
      };
  }
}

export function RecordActivityTimeline({
  activities,
  config,
  record,
  notes,
  tasks,
}: RecordActivityTimelineProps) {
  return (
    <Card className="p-6">
      <div>
        <h3 className="font-display text-2xl text-slate-900">Activity timeline</h3>
        <p className="mt-1 text-sm text-slate-600">Readable, server-written lifecycle history for this record.</p>
      </div>

      <div className="mt-6 space-y-4">
        {activities.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white/[0.02] p-4 text-sm text-slate-500">
            No timeline activity yet.
          </div>
        ) : (
          activities.map((activity, index) => {
            const presentation = buildActivityPresentation(activity, config, record, notes, tasks);
            const styles = toneStyles(presentation.tone);
            const Icon = presentation.icon;
            const actorName = getAssigneeName(config, activity.created_by);
            const footerParts = [formatAbsoluteTimestamp(activity.created_at), actorName ? `by ${actorName}` : null].filter(Boolean);

            return (
              <div key={activity.id} className="relative pl-16">
                {index < activities.length - 1 ? (
                  <div className={cn('absolute left-[23px] top-12 bottom-[-16px] w-px', styles.rail)} />
                ) : null}

                <div
                  className={cn(
                    'absolute left-0 top-1 flex h-12 w-12 items-center justify-center rounded-2xl border shadow-lg shadow-slate-950/20',
                    styles.icon,
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>

                <div className="rounded-[24px] border border-slate-300 bg-white p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-semibold text-slate-900">{presentation.title}</div>
                        <span
                          className={cn(
                            'rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.22em]',
                            styles.badge,
                          )}
                        >
                          {formatActivityLabel(activity.activity_type)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-7 text-slate-700">{presentation.summary}</p>
                      {presentation.detail ? <div className="mt-2 text-sm text-slate-600">{presentation.detail}</div> : null}
                    </div>

                    <div className="shrink-0 text-xs text-slate-500">{formatRelativeDateTime(activity.created_at)}</div>
                  </div>

                  <div className="mt-4 text-xs uppercase tracking-[0.2em] text-slate-500">{footerParts.join(' - ')}</div>

                  <details className="mt-4 group rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm text-slate-700 transition hover:text-slate-900">
                      <span>Event details</span>
                      <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
                    </summary>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {presentation.details.map((row) => (
                        <div
                          key={`${activity.id}-${row.label}`}
                          className="rounded-2xl border border-slate-300 bg-white px-4 py-3"
                        >
                          <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">{row.label}</div>
                          <div className="mt-2 text-sm leading-6 text-slate-700">{row.value}</div>
                        </div>
                      ))}
                    </div>

                    {hasMetadata(activity.meta) ? (
                      <details className="mt-4 group rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm text-slate-600 transition hover:text-slate-700">
                          <span>Technical details</span>
                          <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
                        </summary>
                        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-slate-500">
                          {formatRawActivity(activity)}
                        </pre>
                      </details>
                    ) : null}
                  </details>
                </div>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}
