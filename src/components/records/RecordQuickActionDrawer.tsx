import { CalendarClock, CheckSquare, MessageSquarePlus, Shuffle, Users, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { CrmWorkspaceConfig, RecordSummary } from '../../lib/crm-types';
import { formatFollowUpDate, formatRelativeDateTime } from '../../lib/record-workbench';
import { Button } from '../ui/Button';

export type RecordQuickActionMode = 'stage' | 'note' | 'task' | 'owner' | null;

interface RecordQuickActionDrawerProps {
  isOpen: boolean;
  mode: RecordQuickActionMode;
  record: RecordSummary | null;
  config: CrmWorkspaceConfig;
  onClose: () => void;
  onMoveStage: (record: RecordSummary, stageId: string) => Promise<void>;
  onAddNote: (record: RecordSummary, body: string) => Promise<void>;
  onCreateTask: (
    record: RecordSummary,
    payload: { title: string; description: string | null; priority: string; due_at: string | null; assigned_to: string | null },
  ) => Promise<void>;
  onAssignOwner: (record: RecordSummary, assigneeId: string | null) => Promise<void>;
}

function getStageName(config: CrmWorkspaceConfig, stageId: string | null) {
  for (const pipeline of config.pipelines) {
    const stage = pipeline.stages.find((item) => item.id === stageId);
    if (stage) return stage.name;
  }

  return 'Unstaged';
}

function getOwnerName(config: CrmWorkspaceConfig, assigneeId: string | null) {
  return config.assignees.find((assignee) => assignee.userId === assigneeId)?.fullName ?? 'Unassigned';
}

function getDrawerMeta(mode: RecordQuickActionMode) {
  switch (mode) {
    case 'stage':
      return {
        eyebrow: 'Stage update',
        title: 'Move record stage',
        description: 'Update the pipeline stage while keeping the records queue visible.',
        icon: Shuffle,
        submitLabel: 'Save stage',
      };
    case 'note':
      return {
        eyebrow: 'Timeline update',
        title: 'Add note',
        description: 'Capture the latest handoff, call summary, or follow-up context for this record.',
        icon: MessageSquarePlus,
        submitLabel: 'Save note',
      };
    case 'task':
      return {
        eyebrow: 'Follow-up planning',
        title: 'Create task',
        description: 'Create the next action item without leaving the work queue.',
        icon: CheckSquare,
        submitLabel: 'Create task',
      };
    case 'owner':
      return {
        eyebrow: 'Ownership',
        title: 'Assign owner',
        description: 'Route this record to the right teammate directly from the queue.',
        icon: Users,
        submitLabel: 'Save owner',
      };
    default:
      return {
        eyebrow: 'Record action',
        title: 'Update record',
        description: 'Choose an action for this record.',
        icon: CalendarClock,
        submitLabel: 'Save',
      };
  }
}

export function RecordQuickActionDrawer({
  isOpen,
  mode,
  record,
  config,
  onClose,
  onMoveStage,
  onAddNote,
  onCreateTask,
  onAssignOwner,
}: RecordQuickActionDrawerProps) {
  const [selectedStageId, setSelectedStageId] = useState('');
  const [selectedOwnerId, setSelectedOwnerId] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDueAt, setTaskDueAt] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    setSelectedStageId(record?.stage_id ?? '');
    setSelectedOwnerId(record?.assignee_user_id ?? '');
    setNoteBody('');
    setTaskTitle('');
    setTaskDueAt('');
    setSubmitting(false);
  }, [record, mode, isOpen]);

  const drawerMeta = getDrawerMeta(mode);
  const DrawerIcon = drawerMeta.icon;
  const stageOptions = useMemo(
    () =>
      config.pipelines.find((pipeline) => pipeline.id === record?.pipeline_id)?.stages ??
      config.pipelines.flatMap((pipeline) => pipeline.stages),
    [config, record?.pipeline_id],
  );

  if (!mode) {
    return null;
  }

  async function handleSubmit() {
    if (!record) {
      return;
    }

    setSubmitting(true);

    try {
      if (mode === 'stage') {
        if (!selectedStageId || selectedStageId === record.stage_id) {
          onClose();
          return;
        }

        await onMoveStage(record, selectedStageId);
      }

      if (mode === 'note') {
        const nextBody = noteBody.trim();
        if (!nextBody) {
          return;
        }

        await onAddNote(record, nextBody);
      }

      if (mode === 'task') {
        const nextTitle = taskTitle.trim();
        if (!nextTitle) {
          return;
        }

        await onCreateTask(record, {
          title: nextTitle,
          description: null,
          priority: record.priority ?? 'medium',
          due_at: taskDueAt || null,
          assigned_to: record.assignee_user_id ?? null,
        });
      }

      if (mode === 'owner') {
        await onAssignOwner(record, selectedOwnerId || null);
      }

      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className={`fixed inset-0 z-50 transition ${isOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}
      aria-hidden={!isOpen}
    >
      <button
        type="button"
        aria-label="Close record action drawer"
        onClick={onClose}
        className={`absolute inset-0 bg-transparent transition duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'}`}
      />

      <aside
        className={`absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col border-l border-slate-300 bg-slate-50 shadow-2xl backdrop-blur-xl transition duration-300 ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="record-quick-action-title"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-300 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-[0.28em] text-accent-blue">{drawerMeta.eyebrow}</div>
            <h2 id="record-quick-action-title" className="mt-2 truncate font-display text-2xl text-slate-900">
              {drawerMeta.title}
            </h2>
            <p className="mt-1 text-sm text-slate-600">{drawerMeta.description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-300 bg-slate-50 text-slate-700 transition hover:text-slate-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          {record ? (
            <div className="space-y-5">
              <div className="rounded-[28px] border border-indigo-200 bg-[#EEF2FF] p-5">
                <div className="flex items-start gap-3">
                  <div className="mt-1 rounded-2xl border border-indigo-200 bg-white p-2 text-slate-700">
                    <DrawerIcon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate font-display text-2xl text-slate-900">{record.title}</h3>
                    <p className="mt-1 text-sm text-slate-700">
                      {record.full_name || record.company_name || record.email || 'No primary contact details yet.'}
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
                  <div>Current stage: {getStageName(config, record.stage_id)}</div>
                  <div>Current owner: {getOwnerName(config, record.assignee_user_id)}</div>
                  <div>Follow-up: {formatFollowUpDate(record.next_follow_up_at)}</div>
                  <div>Updated: {formatRelativeDateTime(record.updated_at)}</div>
                </div>
              </div>

              {mode === 'stage' ? (
                <div className="space-y-4 rounded-[28px] border border-slate-300 bg-white p-5">
                  <label className="flex w-full flex-col gap-2 text-sm text-slate-700">
                    <span className="font-medium">Stage</span>
                    <select
                      value={selectedStageId}
                      onChange={(event) => setSelectedStageId(event.target.value)}
                      className="h-12 rounded-2xl border border-slate-300 bg-white px-4 text-sm text-slate-900"
                    >
                      <option value="">Select stage</option>
                      {stageOptions.map((stage) => (
                        <option key={stage.id} value={stage.id}>
                          {stage.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}

              {mode === 'note' ? (
                <div className="space-y-4 rounded-[28px] border border-slate-300 bg-white p-5">
                  <label className="flex w-full flex-col gap-2 text-sm text-slate-700">
                    <span className="font-medium">Note</span>
                    <textarea
                      rows={8}
                      value={noteBody}
                      onChange={(event) => setNoteBody(event.target.value)}
                      placeholder="Log the latest update, call notes, handoff context, or next steps."
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-500"
                    />
                  </label>
                </div>
              ) : null}

              {mode === 'task' ? (
                <div className="space-y-4 rounded-[28px] border border-slate-300 bg-white p-5">
                  <label className="flex w-full flex-col gap-2 text-sm text-slate-700">
                    <span className="font-medium">Task title</span>
                    <input
                      value={taskTitle}
                      onChange={(event) => setTaskTitle(event.target.value)}
                      placeholder="Create the next follow-up task"
                      className="h-12 rounded-2xl border border-slate-300 bg-white px-4 text-sm text-slate-900 placeholder:text-slate-500"
                    />
                  </label>
                  <label className="flex w-full flex-col gap-2 text-sm text-slate-700">
                    <span className="font-medium">Due date</span>
                    <input
                      type="date"
                      value={taskDueAt}
                      onChange={(event) => setTaskDueAt(event.target.value)}
                      className="h-12 rounded-2xl border border-slate-300 bg-white px-4 text-sm text-slate-900"
                    />
                  </label>
                </div>
              ) : null}

              {mode === 'owner' ? (
                <div className="space-y-4 rounded-[28px] border border-slate-300 bg-white p-5">
                  <label className="flex w-full flex-col gap-2 text-sm text-slate-700">
                    <span className="font-medium">Owner</span>
                    <select
                      value={selectedOwnerId}
                      onChange={(event) => setSelectedOwnerId(event.target.value)}
                      className="h-12 rounded-2xl border border-slate-300 bg-white px-4 text-sm text-slate-900"
                    >
                      <option value="">Unassigned</option>
                      {config.assignees.map((assignee) => (
                        <option key={assignee.userId} value={assignee.userId}>
                          {assignee.fullName ?? assignee.userId}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-[28px] border border-slate-300 bg-white px-5 py-4 text-sm text-slate-600">
              Select a record to continue.
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-300 px-4 py-4 sm:px-6">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} loading={submitting}>
            {drawerMeta.submitLabel}
          </Button>
        </div>
      </aside>
    </div>
  );
}
