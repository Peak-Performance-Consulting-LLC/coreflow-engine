import type { EdgeClient } from './server.ts';
import {
  addNoteToRecord,
  createTaskForRecord,
  getRecordDetails,
  moveRecordStageForWorkspace,
  updateRecordForWorkspace,
} from './records.ts';
import {
  findVoiceCallActionRunById,
  findVoiceCallById,
  updateVoiceCallActionRun,
  type VoiceCallActionRunRow,
} from './voice-repository.ts';
import { updateVoiceCallReviewState } from './voice-action-repository.ts';

function nowIso() {
  return new Date().toISOString();
}

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getConfig(run: VoiceCallActionRunRow) {
  const payload = isRecord(run.request_payload) ? run.request_payload : {};
  const actionConfig = isRecord(payload.action_config) ? payload.action_config : {};
  return {
    payload,
    actionConfig,
  };
}

function buildDefaultNoteBody(callId: string, outcomeStatus: string, outcomeReason: string | null, outcomeError: string | null) {
  const parts = [
    `Voice call outcome: ${outcomeStatus}.`,
    outcomeReason ? `Reason: ${outcomeReason}.` : null,
    outcomeError ? `Error: ${outcomeError}` : null,
    `Voice call id: ${callId}.`,
  ];

  return parts.filter(Boolean).join(' ');
}

function buildDefaultTaskTitle(callFrom: string, outcomeStatus: string) {
  return `Voice follow-up: ${outcomeStatus} (${callFrom})`;
}

async function createStandaloneTask(params: {
  db: EdgeClient;
  workspaceId: string;
  actorUserId: string;
  title: string;
  description?: string | null;
  dueAt?: string | null;
  priority?: string | null;
  assignedTo?: string | null;
}) {
  const { data, error } = await params.db
    .from('tasks')
    .insert({
      workspace_id: params.workspaceId,
      title: params.title,
      description: normalizeString(params.description) || null,
      priority: normalizeString(params.priority) || 'medium',
      due_at: normalizeString(params.dueAt) || null,
      assigned_to: normalizeString(params.assignedTo) || null,
      created_by: params.actorUserId,
    })
    .select('id, title, status, priority, due_at, assigned_to, created_at, updated_at')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Unable to create standalone callback task.');
  }

  return data as { id: string };
}

export async function runVoiceAction(params: {
  db: EdgeClient;
  workspaceId: string;
  actionRunId: string;
  actorUserId: string;
}) {
  const workspaceId = normalizeString(params.workspaceId);
  const actionRunId = normalizeString(params.actionRunId);
  const actorUserId = normalizeString(params.actorUserId);

  if (!workspaceId || !actionRunId || !actorUserId) {
    throw new Error('workspaceId, actionRunId, and actorUserId are required.');
  }

  const run = await findVoiceCallActionRunById(params.db, workspaceId, actionRunId);
  const call = await findVoiceCallById(params.db, workspaceId, run.voice_call_id);
  const { actionConfig, payload } = getConfig(run);
  const nextAttemptCount = (run.attempt_count ?? 0) + 1;

  await updateVoiceCallActionRun(params.db, {
    workspaceId,
    actionRunId,
    status: 'running',
    attemptCount: nextAttemptCount,
    lastError: null,
    startedAt: run.started_at ?? nowIso(),
    finishedAt: null,
  });

  try {
    let resultPayload: Record<string, unknown> = {};
    let taskId: string | null = run.task_id;
    let targetRecordId: string | null = call.record_id ?? run.target_record_id;

    if (run.action_type === 'open_review') {
      await updateVoiceCallReviewState({
        db: params.db,
        workspaceId,
        voiceCallId: call.id,
        reviewStatus: 'open',
        reviewOwnerUserId: normalizeString(actionConfig.review_owner_user_id) || call.review_owner_user_id,
      });
      resultPayload = { review_status: 'open' };
    } else if (run.action_type === 'create_record_note') {
      if (!targetRecordId) {
        throw new Error('This action requires a linked CRM record.');
      }

      const noteBody =
        normalizeString(actionConfig.note_body) ||
        buildDefaultNoteBody(call.id, run.trigger_outcome_status, call.outcome_reason, call.outcome_error);
      const note = await addNoteToRecord(params.db, actorUserId, workspaceId, targetRecordId, noteBody);
      resultPayload = { note_id: note.id, note_body: note.body };
    } else if (run.action_type === 'create_record_task') {
      if (!targetRecordId) {
        throw new Error('This action requires a linked CRM record.');
      }

      const task = await createTaskForRecord(params.db, actorUserId, workspaceId, targetRecordId, {
        title: normalizeString(actionConfig.title) || buildDefaultTaskTitle(call.from_number_e164, run.trigger_outcome_status),
        description: normalizeString(actionConfig.description) ||
          buildDefaultNoteBody(call.id, run.trigger_outcome_status, call.outcome_reason, call.outcome_error),
        priority: normalizeString(actionConfig.priority) || 'medium',
        due_at: normalizeString(actionConfig.due_at) || null,
        assigned_to: normalizeString(actionConfig.assigned_to) || null,
      });
      taskId = task.id;
      resultPayload = { task_id: task.id, task_title: task.title };
    } else if (run.action_type === 'assign_record_owner') {
      if (!targetRecordId) {
        throw new Error('This action requires a linked CRM record.');
      }

      const assigneeUserId = normalizeString(actionConfig.assignee_user_id);

      if (!assigneeUserId) {
        throw new Error('assignee_user_id is required for assign_record_owner.');
      }

      const detail = await getRecordDetails(params.db, workspaceId, targetRecordId);
      await updateRecordForWorkspace(params.db, actorUserId, targetRecordId, {
        workspace_id: workspaceId,
        core: {
          title: detail.record.title,
          assignee_user_id: assigneeUserId,
        },
      });
      resultPayload = { assignee_user_id: assigneeUserId };
    } else if (run.action_type === 'move_record_stage') {
      if (!targetRecordId) {
        throw new Error('This action requires a linked CRM record.');
      }

      const stageId = normalizeString(actionConfig.stage_id);

      if (!stageId) {
        throw new Error('stage_id is required for move_record_stage.');
      }

      await moveRecordStageForWorkspace(params.db, actorUserId, workspaceId, targetRecordId, stageId);
      resultPayload = { stage_id: stageId };
    } else if (run.action_type === 'update_record_status') {
      if (!targetRecordId) {
        throw new Error('This action requires a linked CRM record.');
      }

      const status = normalizeString(actionConfig.status);

      if (!status) {
        throw new Error('status is required for update_record_status.');
      }

      const detail = await getRecordDetails(params.db, workspaceId, targetRecordId);
      await updateRecordForWorkspace(params.db, actorUserId, targetRecordId, {
        workspace_id: workspaceId,
        core: {
          title: detail.record.title,
          status,
        },
      });
      resultPayload = { status };
    } else if (run.action_type === 'schedule_callback') {
      const title =
        normalizeString(actionConfig.title) ||
        buildDefaultTaskTitle(call.from_number_e164, run.trigger_outcome_status);
      const description =
        normalizeString(actionConfig.description) ||
        buildDefaultNoteBody(call.id, run.trigger_outcome_status, call.outcome_reason, call.outcome_error);

      if (targetRecordId) {
        const task = await createTaskForRecord(params.db, actorUserId, workspaceId, targetRecordId, {
          title,
          description,
          priority: normalizeString(actionConfig.priority) || 'high',
          due_at: normalizeString(actionConfig.due_at) || null,
          assigned_to: normalizeString(actionConfig.assigned_to) || null,
        });
        taskId = task.id;
      } else {
        const task = await createStandaloneTask({
          db: params.db,
          workspaceId,
          actorUserId,
          title,
          description,
          dueAt: normalizeString(actionConfig.due_at) || null,
          priority: normalizeString(actionConfig.priority) || 'high',
          assignedTo: normalizeString(actionConfig.assigned_to) || null,
        });
        taskId = task.id;
      }

      resultPayload = {
        task_id: taskId,
        schedule_source: targetRecordId ? 'record_task' : 'standalone_task',
      };
    } else {
      throw new Error(`Unsupported voice action type: ${run.action_type}`);
    }

    const updated = await updateVoiceCallActionRun(params.db, {
      workspaceId,
      actionRunId,
      status: 'completed',
      targetRecordId,
      taskId,
      lastError: null,
      nextRetryAt: null,
      resultPayload: {
        ...payload,
        ...resultPayload,
      },
      finishedAt: nowIso(),
    });

    return updated;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected action failure.';
    const nextRetryAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    return updateVoiceCallActionRun(params.db, {
      workspaceId,
      actionRunId,
      status: 'failed',
      lastError: message,
      nextRetryAt,
      finishedAt: nowIso(),
    });
  }
}
