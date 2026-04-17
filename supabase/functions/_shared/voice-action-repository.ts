import type { EdgeClient } from './server.ts';
import {
  listVoiceActionPolicies,
  listVoiceCallActionRunsByVoiceCallId,
  saveVoiceCallActionRun,
  updateVoiceCallOutcome,
  type VoiceActionPolicyRow,
  type VoiceCallActionRunRow,
  type VoiceCallRow,
  type VoiceOutcomeStatus,
  type VoiceReviewStatus,
} from './voice-repository.ts';

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export async function getVoiceActionPoliciesForOutcome(params: {
  db: EdgeClient;
  workspaceId: string;
  voiceAgentId?: string | null;
  outcomeStatus: VoiceOutcomeStatus;
}): Promise<VoiceActionPolicyRow[]> {
  const policies = await listVoiceActionPolicies(params.db, {
    workspaceId: params.workspaceId,
    voiceAgentId: params.voiceAgentId,
    outcomeStatus: params.outcomeStatus,
  });

  return policies;
}

export async function enqueueVoiceActionRunsForOutcome(params: {
  db: EdgeClient;
  call: VoiceCallRow;
  outcomeStatus: VoiceOutcomeStatus;
  outcomeReason?: string | null;
  outcomeError?: string | null;
}) {
  const existingRuns = await listVoiceCallActionRunsByVoiceCallId(
    params.db,
    params.call.workspace_id,
    params.call.id,
  );
  const existingKeys = new Set(existingRuns.map((run) => `${run.trigger_outcome_status}:${run.action_type}:${run.policy_id ?? 'default'}`));
  const policies = await getVoiceActionPoliciesForOutcome({
    db: params.db,
    workspaceId: params.call.workspace_id,
    voiceAgentId: params.call.voice_agent_id,
    outcomeStatus: params.outcomeStatus,
  });

  const pendingRuns: VoiceCallActionRunRow[] = [];
  const policyBacked = policies.length > 0;

  for (const policy of policies) {
    const key = `${params.outcomeStatus}:${policy.action_type}:${policy.id}`;

    if (existingKeys.has(key)) {
      continue;
    }

    const created = await saveVoiceCallActionRun(params.db, {
      workspaceId: params.call.workspace_id,
      voiceCallId: params.call.id,
      policyId: policy.id,
      actionType: policy.action_type,
      triggerOutcomeStatus: params.outcomeStatus,
      targetRecordId: params.call.record_id,
      requestPayload: {
        policy_id: policy.id,
        action_config: policy.action_config,
        outcome_reason: params.outcomeReason ?? params.call.outcome_reason,
        outcome_error: params.outcomeError ?? params.call.outcome_error,
      },
    });

    pendingRuns.push(created);
  }

  if (!policyBacked && params.outcomeStatus !== 'lead_created') {
    const defaultKey = `${params.outcomeStatus}:open_review:default`;

    if (!existingKeys.has(defaultKey)) {
      const created = await saveVoiceCallActionRun(params.db, {
        workspaceId: params.call.workspace_id,
        voiceCallId: params.call.id,
        actionType: 'open_review',
        triggerOutcomeStatus: params.outcomeStatus,
        targetRecordId: params.call.record_id,
        requestPayload: {
          source: 'default_voice_recovery',
          outcome_reason: params.outcomeReason ?? params.call.outcome_reason,
          outcome_error: params.outcomeError ?? params.call.outcome_error,
        },
      });

      pendingRuns.push(created);
    }
  }

  return pendingRuns;
}

export async function updateVoiceCallReviewState(params: {
  db: EdgeClient;
  workspaceId: string;
  voiceCallId: string;
  reviewStatus: VoiceReviewStatus;
  reviewOwnerUserId?: string | null;
}) {
  const nextReviewStatus = params.reviewStatus;
  const reviewOpenedAt = nextReviewStatus === 'open' ? new Date().toISOString() : undefined;
  const reviewResolvedAt = nextReviewStatus === 'resolved' || nextReviewStatus === 'dismissed'
    ? new Date().toISOString()
    : null;

  return updateVoiceCallOutcome(params.db, {
    workspaceId: normalizeString(params.workspaceId),
    voiceCallId: normalizeString(params.voiceCallId),
    reviewStatus: nextReviewStatus,
    reviewOpenedAt,
    reviewResolvedAt,
    reviewOwnerUserId: params.reviewOwnerUserId,
  });
}
