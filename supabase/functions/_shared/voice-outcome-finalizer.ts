import type { EdgeClient } from './server.ts';
import { generateVoiceCallSummaryArtifacts } from './voice-call-summary.ts';
import {
  findVoiceCallById,
  listVoiceCallArtifactsByVoiceCallId,
  saveVoiceCallArtifact,
  updateVoiceCallOutcome,
  type VoiceCallRow,
  type VoiceOutcomeStatus,
  type VoiceReviewStatus,
} from './voice-repository.ts';

function nowIso() {
  return new Date().toISOString();
}

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function defaultOutcomeReason(status: VoiceOutcomeStatus, call: VoiceCallRow) {
  switch (status) {
    case 'lead_created':
      return 'lead_created';
    case 'crm_failed':
      return 'crm_write_failed';
    case 'gather_incomplete':
      return call.provider_gather_status ?? 'gather_incomplete';
    case 'mapping_failed':
      return 'mapping_validation_failed';
    case 'ended_without_lead':
      return 'call_ended_without_lead';
    case 'review_needed':
      return 'review_needed';
    default:
      return 'review_needed';
  }
}

function deriveOutcomeStatus(call: VoiceCallRow): VoiceOutcomeStatus {
  if (call.record_id || call.lead_creation_status === 'created') {
    return 'lead_created';
  }

  if (call.gather_status === 'incomplete' || call.gather_status === 'failed') {
    return 'gather_incomplete';
  }

  if (call.lead_creation_status === 'failed') {
    return 'crm_failed';
  }

  if (call.review_status === 'open') {
    return 'review_needed';
  }

  return 'ended_without_lead';
}

function deriveReviewStatus(outcomeStatus: VoiceOutcomeStatus): VoiceReviewStatus {
  return outcomeStatus === 'lead_created' ? 'resolved' : 'open';
}

async function ensureArtifactPlaceholders(db: EdgeClient, workspaceId: string, voiceCallId: string) {
  const existing = await listVoiceCallArtifactsByVoiceCallId(db, workspaceId, voiceCallId);
  const existingTypes = new Set(existing.map((artifact) => artifact.artifact_type));

  for (const artifactType of ['summary', 'disposition', 'follow_up_recommendation'] as const) {
    if (existingTypes.has(artifactType)) {
      continue;
    }

    await saveVoiceCallArtifact(db, {
      workspaceId,
      voiceCallId,
      artifactType,
      status: 'pending',
      source: 'message_history',
    });
  }
}

export async function finalizeVoiceCallOutcome(params: {
  db: EdgeClient;
  workspaceId: string;
  voiceCallId: string;
  outcomeStatus?: VoiceOutcomeStatus;
  outcomeReason?: string | null;
  outcomeError?: string | null;
  reviewStatus?: VoiceReviewStatus;
  reviewOwnerUserId?: string | null;
}) {
  const workspaceId = normalizeString(params.workspaceId);
  const voiceCallId = normalizeString(params.voiceCallId);

  if (!workspaceId || !voiceCallId) {
    throw new Error('workspaceId and voiceCallId are required.');
  }

  const call = await findVoiceCallById(params.db, workspaceId, voiceCallId);
  const outcomeStatus = params.outcomeStatus ?? deriveOutcomeStatus(call);
  const reviewStatus = params.reviewStatus ?? deriveReviewStatus(outcomeStatus);
  const reviewOpenedAt = reviewStatus === 'open' ? call.review_opened_at ?? nowIso() : null;
  const reviewResolvedAt = reviewStatus === 'resolved' || reviewStatus === 'dismissed' ? nowIso() : null;

  const updated = await updateVoiceCallOutcome(params.db, {
    workspaceId,
    voiceCallId,
    outcomeStatus,
    outcomeReason: normalizeString(params.outcomeReason) || defaultOutcomeReason(outcomeStatus, call),
    outcomeError: params.outcomeError ?? call.outcome_error,
    reviewStatus,
    reviewOpenedAt,
    reviewResolvedAt,
    reviewOwnerUserId: params.reviewOwnerUserId ?? call.review_owner_user_id,
  });

  await ensureArtifactPlaceholders(params.db, workspaceId, voiceCallId);

  try {
    await generateVoiceCallSummaryArtifacts({
      db: params.db,
      workspaceId,
      call: updated,
    });
  } catch (error) {
    console.warn('[voice-outcome-finalizer] summary generation skipped after failure', {
      workspaceId,
      voiceCallId,
      message: error instanceof Error ? error.message : 'Unknown error.',
    });
  }

  return updated;
}
