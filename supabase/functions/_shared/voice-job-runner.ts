import type { EdgeClient } from './server.ts';
import { resolveWorkspaceVoiceActorUserId } from './server.ts';
import { generateVoiceCallSummaryArtifacts } from './voice-call-summary.ts';
import { findVoiceCallById } from './voice-repository.ts';
import {
  findVoiceProcessingJobById,
  type VoiceProcessingJobRow,
  updateVoiceProcessingJob,
} from './voice-job-repository.ts';
import { findVoiceCallActionRunById } from './voice-repository.ts';
import { runVoiceAction } from './voice-action-runner.ts';
import { processVoicePostCallPipeline } from './voice-post-call-pipeline.ts';

type JobProcessResult =
  | {
    outcome: 'completed';
    resultPayload?: Record<string, unknown>;
  }
  | {
    outcome: 'retry';
    availableAt: string;
    errorMessage: string;
    resultPayload?: Record<string, unknown>;
  }
  | {
    outcome: 'dead_letter';
    errorMessage: string;
    resultPayload?: Record<string, unknown>;
  };

function safeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unexpected voice job failure.';
}

function computeRetryDelayMs(attemptCount: number) {
  const baseMinutes = Math.min(60, Math.max(1, 2 ** Math.max(0, attemptCount - 1)));
  const jitterMs = Math.floor(Math.random() * 30_000);
  return baseMinutes * 60_000 + jitterMs;
}

function nextRetryIso(attemptCount: number) {
  return new Date(Date.now() + computeRetryDelayMs(attemptCount)).toISOString();
}

async function processJobBody(
  db: EdgeClient,
  job: VoiceProcessingJobRow,
): Promise<JobProcessResult> {
  if (job.job_type === 'post_call_pipeline') {
    if (!job.voice_call_id) {
      return {
        outcome: 'dead_letter',
        errorMessage: 'post_call_pipeline job is missing voice_call_id.',
      };
    }

    const result = await processVoicePostCallPipeline({
      db,
      workspaceId: job.workspace_id,
      voiceCallId: job.voice_call_id,
    });

    return {
      outcome: 'completed',
      resultPayload: {
        voice_call_id: result.call.id,
        outcome_status: result.call.outcome_status,
        summary_job_id: result.summaryJob.id,
        action_job_count: result.actionJobs.length,
      },
    };
  }

  if (job.job_type === 'generate_summary') {
    if (!job.voice_call_id) {
      return {
        outcome: 'dead_letter',
        errorMessage: 'generate_summary job is missing voice_call_id.',
      };
    }

    const call = await findVoiceCallById(db, job.workspace_id, job.voice_call_id);

    await generateVoiceCallSummaryArtifacts({
      db,
      workspaceId: job.workspace_id,
      call,
    });

    return {
      outcome: 'completed',
      resultPayload: {
        voice_call_id: call.id,
        summary_generated: true,
      },
    };
  }

  if (job.job_type === 'execute_action_run') {
    if (!job.action_run_id) {
      return {
        outcome: 'dead_letter',
        errorMessage: 'execute_action_run job is missing action_run_id.',
      };
    }

    const actorUserId = await resolveWorkspaceVoiceActorUserId(db, job.workspace_id);
    const actionRun = await runVoiceAction({
      db,
      workspaceId: job.workspace_id,
      actionRunId: job.action_run_id,
      actorUserId,
    });

    if (actionRun.status === 'failed') {
      const retriedActionRun = await findVoiceCallActionRunById(db, job.workspace_id, job.action_run_id);
      const nextRetryAt = retriedActionRun.next_retry_at;
      const exceededAttempts = job.attempt_count + 1 >= job.max_attempts;

      if (!nextRetryAt || exceededAttempts) {
        return {
          outcome: 'dead_letter',
          errorMessage: retriedActionRun.last_error ?? 'Voice action run exhausted retries.',
          resultPayload: {
            action_run_id: retriedActionRun.id,
            status: retriedActionRun.status,
          },
        };
      }

      return {
        outcome: 'retry',
        availableAt: nextRetryAt,
        errorMessage: retriedActionRun.last_error ?? 'Voice action run will retry.',
        resultPayload: {
          action_run_id: retriedActionRun.id,
          status: retriedActionRun.status,
          next_retry_at: nextRetryAt,
        },
      };
    }

    return {
      outcome: 'completed',
      resultPayload: {
        action_run_id: actionRun.id,
        status: actionRun.status,
        task_id: actionRun.task_id,
        target_record_id: actionRun.target_record_id,
      },
    };
  }

  return {
    outcome: 'dead_letter',
    errorMessage: `Unsupported voice job type: ${job.job_type}`,
  };
}

export async function processVoiceProcessingJob(params: {
  db: EdgeClient;
  jobId: string;
  workspaceId: string;
}) {
  const startedAt = new Date().toISOString();
  const current = await findVoiceProcessingJobById(params.db, params.workspaceId, params.jobId);
  const nextAttemptCount = current.attempt_count + 1;

  await updateVoiceProcessingJob(params.db, {
    workspaceId: current.workspace_id,
    jobId: current.id,
    status: 'running',
    attemptCount: nextAttemptCount,
    startedAt,
    finishedAt: null,
    lastError: null,
  });

  try {
    const refreshed = await findVoiceProcessingJobById(params.db, params.workspaceId, params.jobId);
    const result = await processJobBody(params.db, refreshed);

    if (result.outcome === 'completed') {
      return updateVoiceProcessingJob(params.db, {
        workspaceId: refreshed.workspace_id,
        jobId: refreshed.id,
        status: 'completed',
        resultPayload: result.resultPayload ?? {},
        finishedAt: new Date().toISOString(),
        claimedAt: null,
        claimExpiresAt: null,
        lockToken: null,
        lastError: null,
      });
    }

    if (result.outcome === 'retry') {
      return updateVoiceProcessingJob(params.db, {
        workspaceId: refreshed.workspace_id,
        jobId: refreshed.id,
        status: 'pending',
        availableAt: result.availableAt,
        resultPayload: result.resultPayload ?? {},
        startedAt: null,
        finishedAt: null,
        claimedAt: null,
        claimExpiresAt: null,
        lockToken: null,
        lastError: result.errorMessage,
      });
    }

    return updateVoiceProcessingJob(params.db, {
      workspaceId: refreshed.workspace_id,
      jobId: refreshed.id,
      status: 'dead_letter',
      resultPayload: result.resultPayload ?? {},
      finishedAt: new Date().toISOString(),
      claimedAt: null,
      claimExpiresAt: null,
      lockToken: null,
      lastError: result.errorMessage,
    });
  } catch (error) {
    const message = safeErrorMessage(error);
    const latest = await findVoiceProcessingJobById(params.db, params.workspaceId, params.jobId);
    const shouldRetry = latest.attempt_count < latest.max_attempts;

    if (!shouldRetry) {
      return updateVoiceProcessingJob(params.db, {
        workspaceId: latest.workspace_id,
        jobId: latest.id,
        status: 'dead_letter',
        finishedAt: new Date().toISOString(),
        claimedAt: null,
        claimExpiresAt: null,
        lockToken: null,
        lastError: message,
      });
    }

    return updateVoiceProcessingJob(params.db, {
      workspaceId: latest.workspace_id,
      jobId: latest.id,
      status: 'pending',
      availableAt: nextRetryIso(latest.attempt_count),
      startedAt: null,
      finishedAt: null,
      claimedAt: null,
      claimExpiresAt: null,
      lockToken: null,
      lastError: message,
    });
  }
}
