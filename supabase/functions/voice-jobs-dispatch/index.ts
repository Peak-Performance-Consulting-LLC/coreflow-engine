import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { createEdgeClients, type EdgeClient } from '../_shared/server.ts';
import { claimDueVoiceProcessingJobs } from '../_shared/voice-job-repository.ts';
import { processVoiceProcessingJob } from '../_shared/voice-job-runner.ts';

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function getCronSecret(request: Request) {
  return normalizeString(request.headers.get('x-cron-secret')) ||
    normalizeString(request.headers.get('authorization')).replace(/^Bearer\s+/i, '');
}

function toBatchSize(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(50, Math.trunc(parsed)) : 10;
}

async function resetExpiredClaimedJobs(db: EdgeClient) {
  const nowIso = new Date().toISOString();
  const { data, error } = await db
    .from('voice_processing_jobs')
    .update({
      status: 'pending',
      claimed_at: null,
      claim_expires_at: null,
      lock_token: null,
    })
    .eq('status', 'claimed')
    .lt('claim_expires_at', nowIso)
    .select('id, workspace_id, voice_call_id, action_run_id, job_type');

  if (error) {
    throw new Error(error.message);
  }

  const resetRows = data ?? [];

  if (resetRows.length > 0) {
    console.warn('[voice-jobs-dispatch] reset expired claimed jobs', {
      count: resetRows.length,
      jobs: resetRows.map((job) => ({
        id: job.id,
        workspace_id: job.workspace_id,
        voice_call_id: job.voice_call_id,
        action_run_id: job.action_run_id,
        job_type: job.job_type,
      })),
    });
  }

  return resetRows;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const configuredSecret = normalizeString(Deno.env.get('VOICE_JOBS_CRON_SECRET'));
    const providedSecret = getCronSecret(request);

    if (!configuredSecret) {
      return jsonResponse({ error: 'VOICE_JOBS_CRON_SECRET is required.' }, 500);
    }

    if (!providedSecret || providedSecret !== configuredSecret) {
      return jsonResponse({ error: 'Unauthorized.' }, 401);
    }

    const clients = createEdgeClients(request);

    if ('errorResponse' in clients) {
      return clients.errorResponse;
    }

    const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const batchSize = toBatchSize(payload.batch_size);
    const resetClaimedJobs = await resetExpiredClaimedJobs(clients.serviceClient);
    const jobs = await claimDueVoiceProcessingJobs(clients.serviceClient, batchSize);
    const processed = [];
    const failures = [];

    for (const job of jobs) {
      try {
        const updated = await processVoiceProcessingJob({
          db: clients.serviceClient,
          workspaceId: job.workspace_id,
          jobId: job.id,
        });
        processed.push({
          id: updated.id,
          job_type: updated.job_type,
          status: updated.status,
          attempt_count: updated.attempt_count,
          voice_call_id: updated.voice_call_id,
          action_run_id: updated.action_run_id,
        });
      } catch (error) {
        failures.push({
          id: job.id,
          job_type: job.job_type,
          message: error instanceof Error ? error.message : 'Unexpected dispatch error.',
        });
      }
    }

    return jsonResponse({
      ok: true,
      reset_claimed_count: resetClaimedJobs.length,
      claimed_count: jobs.length,
      processed_count: processed.length,
      failed_count: failures.length,
      processed,
      failures,
    });
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : 'Unexpected voice dispatch error.',
    }, 500);
  }
});
