import type { EdgeClient } from './server.ts';

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type VoiceProcessingJobType = 'post_call_pipeline' | 'generate_summary' | 'execute_action_run';
export type VoiceProcessingJobStatus = 'pending' | 'claimed' | 'running' | 'completed' | 'dead_letter' | 'canceled';

export interface VoiceProcessingJobRow {
  id: string;
  workspace_id: string;
  voice_call_id: string | null;
  action_run_id: string | null;
  job_type: VoiceProcessingJobType;
  status: VoiceProcessingJobStatus;
  idempotency_key: string;
  attempt_count: number;
  max_attempts: number;
  available_at: string;
  claimed_at: string | null;
  claim_expires_at: string | null;
  lock_token: string | null;
  last_error: string | null;
  payload: JsonValue;
  result_payload: JsonValue;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EnqueueVoiceProcessingJobParams {
  workspaceId: string;
  voiceCallId?: string | null;
  actionRunId?: string | null;
  jobType: VoiceProcessingJobType;
  idempotencyKey: string;
  payload?: JsonValue;
  availableAt?: string | null;
  maxAttempts?: number;
}

interface UpdateVoiceProcessingJobParams {
  workspaceId: string;
  jobId: string;
  status?: VoiceProcessingJobStatus;
  attemptCount?: number;
  maxAttempts?: number;
  availableAt?: string | null;
  claimedAt?: string | null;
  claimExpiresAt?: string | null;
  lockToken?: string | null;
  lastError?: string | null;
  payload?: JsonValue;
  resultPayload?: JsonValue;
  startedAt?: string | null;
  finishedAt?: string | null;
}

const VOICE_PROCESSING_JOB_COLUMNS = [
  'id',
  'workspace_id',
  'voice_call_id',
  'action_run_id',
  'job_type',
  'status',
  'idempotency_key',
  'attempt_count',
  'max_attempts',
  'available_at',
  'claimed_at',
  'claim_expires_at',
  'lock_token',
  'last_error',
  'payload',
  'result_payload',
  'started_at',
  'finished_at',
  'created_at',
  'updated_at',
].join(', ');

function ensureNonEmpty(value: unknown, field: string) {
  const normalized = typeof value === 'string' ? value.trim() : '';

  if (!normalized) {
    throw new Error(`${field} is required.`);
  }

  return normalized;
}

function normalizeNullableString(value: unknown) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized.length > 0 ? normalized : null;
}

function ensureIsoTimestamp(value: string, field: string) {
  const normalized = ensureNonEmpty(value, field);
  const parsed = new Date(normalized);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${field} must be a valid ISO timestamp.`);
  }

  return parsed.toISOString();
}

function isUniqueViolation(error: unknown) {
  if (typeof error !== 'object' || error === null || Array.isArray(error)) {
    return false;
  }

  return typeof (error as { code?: unknown }).code === 'string' && (error as { code: string }).code === '23505';
}

async function getVoiceProcessingJobById(
  db: EdgeClient,
  workspaceId: string,
  jobId: string,
) {
  const { data, error } = await db
    .from('voice_processing_jobs')
    .select(VOICE_PROCESSING_JOB_COLUMNS)
    .eq('workspace_id', workspaceId)
    .eq('id', jobId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('Voice processing job not found.');
  }

  return data as VoiceProcessingJobRow;
}

export async function findVoiceProcessingJobById(
  db: EdgeClient,
  workspaceId: string,
  jobId: string,
) {
  return getVoiceProcessingJobById(
    db,
    ensureNonEmpty(workspaceId, 'workspaceId'),
    ensureNonEmpty(jobId, 'jobId'),
  );
}

export async function findVoiceProcessingJobByIdempotencyKey(
  db: EdgeClient,
  workspaceId: string,
  idempotencyKey: string,
) {
  const { data, error } = await db
    .from('voice_processing_jobs')
    .select(VOICE_PROCESSING_JOB_COLUMNS)
    .eq('workspace_id', ensureNonEmpty(workspaceId, 'workspaceId'))
    .eq('idempotency_key', ensureNonEmpty(idempotencyKey, 'idempotencyKey'))
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? null) as VoiceProcessingJobRow | null;
}

export async function listVoiceProcessingJobsByVoiceCallId(
  db: EdgeClient,
  workspaceId: string,
  voiceCallId: string,
) {
  const { data, error } = await db
    .from('voice_processing_jobs')
    .select(VOICE_PROCESSING_JOB_COLUMNS)
    .eq('workspace_id', ensureNonEmpty(workspaceId, 'workspaceId'))
    .eq('voice_call_id', ensureNonEmpty(voiceCallId, 'voiceCallId'))
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as VoiceProcessingJobRow[];
}

export async function enqueueVoiceProcessingJob(
  db: EdgeClient,
  params: EnqueueVoiceProcessingJobParams,
) {
  const payload = {
    workspace_id: ensureNonEmpty(params.workspaceId, 'workspaceId'),
    voice_call_id: normalizeNullableString(params.voiceCallId),
    action_run_id: normalizeNullableString(params.actionRunId),
    job_type: params.jobType,
    status: 'pending' as const,
    idempotency_key: ensureNonEmpty(params.idempotencyKey, 'idempotencyKey'),
    attempt_count: 0,
    max_attempts: Number.isFinite(params.maxAttempts)
      ? Math.max(1, Math.trunc(Number(params.maxAttempts)))
      : 6,
    available_at: params.availableAt ? ensureIsoTimestamp(params.availableAt, 'availableAt') : new Date().toISOString(),
    payload: params.payload ?? {},
    result_payload: {},
  };

  const { data, error } = await db
    .from('voice_processing_jobs')
    .insert(payload)
    .select(VOICE_PROCESSING_JOB_COLUMNS)
    .single();

  if (error) {
    if (isUniqueViolation(error)) {
      const existing = await findVoiceProcessingJobByIdempotencyKey(
        db,
        payload.workspace_id,
        payload.idempotency_key,
      );

      if (!existing) {
        throw new Error('Voice processing job already exists but could not be re-fetched.');
      }

      return existing;
    }

    throw new Error(error.message);
  }

  return data as VoiceProcessingJobRow;
}

export async function claimDueVoiceProcessingJobs(
  db: EdgeClient,
  limit = 10,
) {
  const { data, error } = await db.rpc('claim_due_voice_processing_jobs', {
    p_limit: limit,
    p_now: new Date().toISOString(),
  });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as VoiceProcessingJobRow[];
}

export async function updateVoiceProcessingJob(
  db: EdgeClient,
  params: UpdateVoiceProcessingJobParams,
) {
  const workspaceId = ensureNonEmpty(params.workspaceId, 'workspaceId');
  const jobId = ensureNonEmpty(params.jobId, 'jobId');
  const current = await getVoiceProcessingJobById(db, workspaceId, jobId);
  const patch: Record<string, unknown> = {};

  if (params.status !== undefined) {
    patch.status = params.status;
  }

  if (params.attemptCount !== undefined) {
    patch.attempt_count = Number.isFinite(params.attemptCount)
      ? Math.max(0, Math.trunc(Number(params.attemptCount)))
      : current.attempt_count;
  }

  if (params.maxAttempts !== undefined) {
    patch.max_attempts = Number.isFinite(params.maxAttempts)
      ? Math.max(1, Math.trunc(Number(params.maxAttempts)))
      : current.max_attempts;
  }

  if (params.availableAt !== undefined) {
    patch.available_at = params.availableAt ? ensureIsoTimestamp(params.availableAt, 'availableAt') : current.available_at;
  }

  if (params.claimedAt !== undefined) {
    patch.claimed_at = params.claimedAt ? ensureIsoTimestamp(params.claimedAt, 'claimedAt') : null;
  }

  if (params.claimExpiresAt !== undefined) {
    patch.claim_expires_at = params.claimExpiresAt ? ensureIsoTimestamp(params.claimExpiresAt, 'claimExpiresAt') : null;
  }

  if (params.lockToken !== undefined) {
    patch.lock_token = normalizeNullableString(params.lockToken);
  }

  if (params.lastError !== undefined) {
    patch.last_error = normalizeNullableString(params.lastError);
  }

  if (params.payload !== undefined) {
    patch.payload = params.payload;
  }

  if (params.resultPayload !== undefined) {
    patch.result_payload = params.resultPayload;
  }

  if (params.startedAt !== undefined) {
    patch.started_at = params.startedAt ? ensureIsoTimestamp(params.startedAt, 'startedAt') : null;
  }

  if (params.finishedAt !== undefined) {
    patch.finished_at = params.finishedAt ? ensureIsoTimestamp(params.finishedAt, 'finishedAt') : null;
  }

  if (Object.keys(patch).length === 0) {
    return current;
  }

  const { data, error } = await db
    .from('voice_processing_jobs')
    .update(patch)
    .eq('workspace_id', workspaceId)
    .eq('id', jobId)
    .select(VOICE_PROCESSING_JOB_COLUMNS)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as VoiceProcessingJobRow;
}
