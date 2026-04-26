import type { EdgeClient } from './server.ts';
import { resolveWorkspaceVoiceActorUserId } from './server.ts';
import {
  applyLeadCreated,
  applyLeadFailed,
  findVoiceCallById,
  type VoiceCallRow,
  type VoiceOutcomeStatus,
  updateVoiceCallOutcome,
} from './voice-repository.ts';
import { buildLeadCreateInputFromVoiceCall } from './voice-call-lead-recovery.ts';
import { createLeadFromVoiceCall } from './voice-lead-create.ts';
import { finalizeVoiceCallOutcome } from './voice-outcome-finalizer.ts';
import { enqueueVoiceActionRunsForOutcome } from './voice-action-repository.ts';
import { enqueueVoiceProcessingJob } from './voice-job-repository.ts';

function safeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unexpected error.';
}

function isMissingRequiredCrmFieldsError(error: unknown) {
  return safeErrorMessage(error).startsWith('Missing required CRM fields for lead creation:');
}

function isInvalidAssistantSnapshotError(error: unknown) {
  return safeErrorMessage(error).includes('snapshot is missing or invalid');
}

function isNoUsableGatherPayloadError(error: unknown) {
  const message = safeErrorMessage(error);
  return message.includes('does not have a usable gather result or transcript');
}

export function buildPostCallPipelineJobKey(voiceCallId: string) {
  return `voice-call:${voiceCallId}:post-call-pipeline:v1`;
}

export function buildSummaryJobKey(voiceCallId: string) {
  return `voice-call:${voiceCallId}:generate-summary:v1`;
}

export function buildActionRunJobKey(actionRunId: string) {
  return `voice-action-run:${actionRunId}:execute:v1`;
}

function derivePipelineOutcomeStatus(call: VoiceCallRow): VoiceOutcomeStatus {
  if (call.outcome_status === 'mapping_failed') {
    return 'mapping_failed';
  }

  if (call.record_id || call.lead_creation_status === 'created') {
    return 'lead_created';
  }

  if (call.gather_status === 'incomplete' || call.gather_status === 'failed') {
    return 'gather_incomplete';
  }

  if (call.lead_creation_status === 'failed') {
    return 'crm_failed';
  }

  if (call.outcome_status === 'review_needed') {
    return 'review_needed';
  }

  return 'ended_without_lead';
}

function derivePipelineOutcomeReason(call: VoiceCallRow, fallbackReason: string) {
  const status = derivePipelineOutcomeStatus(call);

  if (status === 'lead_created') {
    return 'lead_created';
  }

  if (status === 'mapping_failed') {
    return 'missing_required_crm_fields';
  }

  if (status === 'crm_failed') {
    return 'crm_write_failed';
  }

  if (status === 'gather_incomplete') {
    return call.provider_gather_status ?? 'gather_incomplete';
  }

  return fallbackReason;
}

async function tryCreateLeadForCall(
  db: EdgeClient,
  workspaceId: string,
  call: VoiceCallRow,
) {
  const currentCall = await findVoiceCallById(db, workspaceId, call.id);

  if (
    currentCall.record_id ||
    currentCall.lead_creation_status === 'created' ||
    currentCall.lead_creation_status === 'failed' ||
    currentCall.outcome_status === 'mapping_failed'
  ) {
    return currentCall;
  }

  try {
    const actorUserId = await resolveWorkspaceVoiceActorUserId(db, workspaceId);
    const leadCreateInput = await buildLeadCreateInputFromVoiceCall({
      db,
      workspaceId,
      call: currentCall,
    });

    const created = await createLeadFromVoiceCall({
      db,
      workspaceId,
      actorUserId,
      voiceCallId: currentCall.id,
      mappedInput: leadCreateInput,
    });

    await applyLeadCreated(db, {
      workspaceId,
      voiceCallId: currentCall.id,
      recordId: created.recordId,
      leadCreatedAt: new Date().toISOString(),
    });

    return findVoiceCallById(db, workspaceId, currentCall.id);
  } catch (error) {
    const errorMessage = safeErrorMessage(error);

    if (isMissingRequiredCrmFieldsError(error) || isInvalidAssistantSnapshotError(error)) {
      await updateVoiceCallOutcome(db, {
        workspaceId,
        voiceCallId: currentCall.id,
        outcomeStatus: 'mapping_failed',
        outcomeReason: 'missing_required_crm_fields',
        outcomeError: errorMessage,
        reviewStatus: 'open',
      });

      return findVoiceCallById(db, workspaceId, currentCall.id);
    }

    if (isNoUsableGatherPayloadError(error)) {
      return currentCall;
    }

    await applyLeadFailed(db, {
      workspaceId,
      voiceCallId: currentCall.id,
      errorMessage,
    });

    return findVoiceCallById(db, workspaceId, currentCall.id);
  }
}

export async function processVoicePostCallPipeline(params: {
  db: EdgeClient;
  workspaceId: string;
  voiceCallId: string;
}) {
  const workspaceId = params.workspaceId.trim();
  const voiceCallId = params.voiceCallId.trim();
  const originalCall = await findVoiceCallById(params.db, workspaceId, voiceCallId);
  const callAfterLeadAttempt = await tryCreateLeadForCall(params.db, workspaceId, originalCall);
  const finalized = await finalizeVoiceCallOutcome({
    db: params.db,
    workspaceId,
    voiceCallId,
    outcomeStatus: derivePipelineOutcomeStatus(callAfterLeadAttempt),
    outcomeReason: derivePipelineOutcomeReason(callAfterLeadAttempt, 'post_call_pipeline_completed'),
    outcomeError: callAfterLeadAttempt.outcome_error,
    generateArtifacts: false,
  });

  const summaryJob = await enqueueVoiceProcessingJob(params.db, {
    workspaceId,
    voiceCallId,
    jobType: 'generate_summary',
    idempotencyKey: buildSummaryJobKey(voiceCallId),
    payload: {
      voice_call_id: voiceCallId,
    },
    maxAttempts: 4,
  });

  const actionRuns = await enqueueVoiceActionRunsForOutcome({
    db: params.db,
    call: finalized,
    outcomeStatus: finalized.outcome_status ?? derivePipelineOutcomeStatus(finalized),
    outcomeReason: finalized.outcome_reason,
    outcomeError: finalized.outcome_error,
  });

  const actionJobs = [];

  for (const run of actionRuns) {
    const queued = await enqueueVoiceProcessingJob(params.db, {
      workspaceId,
      voiceCallId,
      actionRunId: run.id,
      jobType: 'execute_action_run',
      idempotencyKey: buildActionRunJobKey(run.id),
      payload: {
        voice_call_id: voiceCallId,
        action_run_id: run.id,
      },
      maxAttempts: 6,
    });
    actionJobs.push(queued);
  }

  return {
    call: finalized,
    summaryJob,
    actionRuns,
    actionJobs,
  };
}
