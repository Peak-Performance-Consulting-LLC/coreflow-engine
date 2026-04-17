import type { EdgeClient } from './server.ts';

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type VoiceProvider = 'telnyx';
export type VoiceDirection = 'inbound';
export type VoiceCallStatus = 'initiated' | 'answered' | 'gathering' | 'lead_created' | 'ended' | 'failed';
export type VoiceLeadCreationStatus = 'pending' | 'created' | 'failed';
export type VoiceEventProcessingStatus = 'pending' | 'processed' | 'ignored' | 'failed';
export type WorkspacePhoneProvisioningStatus = 'pending' | 'active' | 'failed' | 'released';
export type WorkspacePhoneWebhookStatus = 'pending' | 'ready' | 'failed';
export type VoiceRuntimeMode = 'assistant' | 'phase1_default' | 'phase1_fallback';
export type VoiceGatherStatus = 'not_started' | 'in_progress' | 'completed' | 'incomplete' | 'failed';
export type VoiceOutcomeStatus =
  | 'lead_created'
  | 'crm_failed'
  | 'gather_incomplete'
  | 'mapping_failed'
  | 'ended_without_lead'
  | 'review_needed';
export type VoiceReviewStatus = 'not_needed' | 'open' | 'resolved' | 'dismissed';
export type VoiceActionType =
  | 'open_review'
  | 'create_record_note'
  | 'create_record_task'
  | 'assign_record_owner'
  | 'move_record_stage'
  | 'update_record_status'
  | 'schedule_callback';
export type VoiceActionRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'canceled';
export type VoiceArtifactType = 'summary' | 'disposition' | 'follow_up_recommendation' | 'transcript';
export type VoiceArtifactStatus = 'pending' | 'ready' | 'failed';

export interface WorkspacePhoneNumberRow {
  id: string;
  workspace_id: string;
  provider: VoiceProvider;
  phone_number_e164: string;
  label: string | null;
  provisioning_status: WorkspacePhoneProvisioningStatus;
  webhook_status: WorkspacePhoneWebhookStatus;
  last_provisioning_error: string | null;
  telnyx_connection_id: string | null;
  provider_order_id: string | null;
  telnyx_metadata: JsonValue;
  provider_phone_number_id: string | null;
  is_active: boolean;
  voice_mode: string;
  purchased_at: string | null;
  released_at: string | null;
  provisioning_locked_at: string | null;
  last_webhook_observed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkspacePhoneNumberView {
  id: string;
  phone_number_e164: string;
  label: string | null;
  provisioning_status: WorkspacePhoneProvisioningStatus;
  webhook_status: WorkspacePhoneWebhookStatus;
  last_provisioning_error: string | null;
  is_active: boolean;
  voice_mode: string;
  purchased_at: string | null;
  released_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface VoiceCallRow {
  id: string;
  workspace_id: string;
  workspace_phone_number_id: string;
  voice_agent_id: string | null;
  voice_agent_binding_id: string | null;
  provider: VoiceProvider;
  direction: VoiceDirection;
  provider_call_control_id: string;
  provider_call_leg_id: string | null;
  provider_call_session_id: string | null;
  provider_connection_id: string | null;
  from_number_e164: string;
  to_number_e164: string;
  status: VoiceCallStatus;
  lead_creation_status: VoiceLeadCreationStatus;
  gather_result: JsonValue | null;
  message_history: JsonValue | null;
  record_id: string | null;
  assistant_mapping_snapshot: JsonValue | null;
  runtime_mode: VoiceRuntimeMode;
  gather_status: VoiceGatherStatus;
  provider_gather_status: string | null;
  outcome_status: VoiceOutcomeStatus | null;
  outcome_reason: string | null;
  outcome_error: string | null;
  review_status: VoiceReviewStatus;
  review_opened_at: string | null;
  review_resolved_at: string | null;
  review_owner_user_id: string | null;
  answered_at: string | null;
  gather_completed_at: string | null;
  lead_created_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface VoiceCallEventRow {
  id: string;
  workspace_id: string;
  voice_call_id: string | null;
  provider: VoiceProvider;
  provider_event_id: string;
  event_type: string;
  occurred_at: string;
  processing_status: VoiceEventProcessingStatus;
  signature_valid: boolean;
  payload: JsonValue;
  processing_error: string | null;
  processed_at: string | null;
  created_at: string;
}

export interface VoiceActionPolicyRow {
  id: string;
  workspace_id: string;
  voice_agent_id: string | null;
  outcome_status: VoiceOutcomeStatus;
  action_type: VoiceActionType;
  is_enabled: boolean;
  position: number;
  action_config: JsonValue;
  created_at: string;
  updated_at: string;
}

export interface VoiceCallActionRunRow {
  id: string;
  workspace_id: string;
  voice_call_id: string;
  policy_id: string | null;
  action_type: VoiceActionType;
  trigger_outcome_status: VoiceOutcomeStatus;
  status: VoiceActionRunStatus;
  target_record_id: string | null;
  task_id: string | null;
  attempt_count: number;
  next_retry_at: string | null;
  last_error: string | null;
  request_payload: JsonValue;
  result_payload: JsonValue;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface VoiceCallArtifactRow {
  id: string;
  workspace_id: string;
  voice_call_id: string;
  artifact_type: VoiceArtifactType;
  status: VoiceArtifactStatus;
  source: string | null;
  content_text: string | null;
  content_json: JsonValue;
  model: string | null;
  error_text: string | null;
  generated_at: string | null;
  created_at: string;
  updated_at: string;
}

export class VoiceRepositoryError extends Error {
  cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'VoiceRepositoryError';
    this.cause = cause;
  }
}

export class VoiceRepositoryDbError extends VoiceRepositoryError {
  operation: string;

  constructor(operation: string, message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'VoiceRepositoryDbError';
    this.operation = operation;
  }
}

export class VoiceRepositoryValidationError extends VoiceRepositoryError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'VoiceRepositoryValidationError';
  }
}

export class VoiceRepositoryNotFoundError extends VoiceRepositoryError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'VoiceRepositoryNotFoundError';
  }
}

export class VoiceRepositoryWorkspaceMismatchError extends VoiceRepositoryError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'VoiceRepositoryWorkspaceMismatchError';
  }
}

export interface BeginEventProcessingParams {
  workspaceId: string;
  providerEventId: string;
  eventType: string;
  occurredAt: string;
  payload: JsonValue;
  signatureValid: boolean;
  provider?: VoiceProvider;
}

export interface BeginEventProcessingResult {
  event: VoiceCallEventRow;
  duplicate: boolean;
  shouldProcess: boolean;
}

export interface UpsertVoiceCallBaseParams {
  workspaceId: string;
  workspacePhoneNumberId: string;
  providerCallControlId: string;
  providerCallLegId?: string | null;
  providerCallSessionId?: string | null;
  providerConnectionId?: string | null;
  fromNumberE164: string;
  toNumberE164: string;
  status: VoiceCallStatus;
  provider?: VoiceProvider;
  direction?: VoiceDirection;
}

export interface LinkEventToVoiceCallParams {
  workspaceId: string;
  eventId: string;
  voiceCallId: string;
}

export interface MarkEventProcessedParams {
  workspaceId: string;
  eventId: string;
}

export interface MarkEventIgnoredParams {
  workspaceId: string;
  eventId: string;
  reason?: string | null;
}

export interface MarkEventFailedParams {
  workspaceId: string;
  eventId: string;
  errorMessage: string;
}

export interface ApplyCallAnsweredParams {
  workspaceId: string;
  voiceCallId: string;
  answeredAt?: string | null;
}

export interface ApplyCallGatheringParams {
  workspaceId: string;
  voiceCallId: string;
}

export interface UpdateVoiceCallAssistantContextParams {
  workspaceId: string;
  voiceCallId: string;
  voiceAgentId?: string | null;
  voiceAgentBindingId?: string | null;
  assistantMappingSnapshot?: JsonValue | null;
}

export interface ApplyGatherEndedParams {
  workspaceId: string;
  voiceCallId: string;
  gatherResult: JsonValue | null;
  messageHistory: JsonValue | null;
  providerGatherStatus?: string | null;
  gatherStatus?: VoiceGatherStatus;
  gatherCompletedAt?: string | null;
}

export interface ApplyLeadCreatedParams {
  workspaceId: string;
  voiceCallId: string;
  recordId: string;
  leadCreatedAt?: string | null;
}

export interface ApplyLeadFailedParams {
  workspaceId: string;
  voiceCallId: string;
  errorMessage?: string | null;
}

export interface ApplyCallHangupParams {
  workspaceId: string;
  voiceCallId: string;
  endedAt?: string | null;
}

export interface ListWorkspacePhoneNumbersParams {
  workspaceId: string;
  includeInactive?: boolean;
}

export interface SaveWorkspacePhoneNumberParams {
  workspaceId: string;
  phoneNumberE164: string;
  label?: string | null;
  provider?: VoiceProvider;
  providerPhoneNumberId?: string | null;
  providerOrderId?: string | null;
  provisioningStatus?: WorkspacePhoneProvisioningStatus;
  webhookStatus?: WorkspacePhoneWebhookStatus;
  lastProvisioningError?: string | null;
  telnyxConnectionId?: string | null;
  telnyxMetadata?: JsonValue;
  isActive?: boolean;
  voiceMode?: string | null;
  purchasedAt?: string | null;
  releasedAt?: string | null;
  provisioningLockedAt?: string | null;
}

export interface UpdateWorkspacePhoneNumberParams {
  workspaceId: string;
  voiceNumberId: string;
  label?: string | null;
  providerPhoneNumberId?: string | null;
  providerOrderId?: string | null;
  provisioningStatus?: WorkspacePhoneProvisioningStatus;
  webhookStatus?: WorkspacePhoneWebhookStatus;
  lastProvisioningError?: string | null;
  telnyxConnectionId?: string | null;
  telnyxMetadata?: JsonValue;
  isActive?: boolean;
  voiceMode?: string | null;
  purchasedAt?: string | null;
  releasedAt?: string | null;
  provisioningLockedAt?: string | null;
}

export interface ClaimWorkspacePhoneNumberProvisioningParams {
  workspaceId: string;
  voiceNumberId: string;
  staleAfterSeconds?: number;
}

export interface ClaimWorkspacePhoneNumberProvisioningResult {
  claimed: boolean;
  number: WorkspacePhoneNumberRow;
}

export interface MarkWorkspacePhoneNumberWebhookObservedParams {
  workspaceId: string;
  voiceNumberId: string;
  observedAt?: string | null;
}

export interface SetVoiceCallRuntimeModeParams {
  workspaceId: string;
  voiceCallId: string;
  runtimeMode: VoiceRuntimeMode;
}

export interface UpdateVoiceCallOutcomeParams {
  workspaceId: string;
  voiceCallId: string;
  outcomeStatus?: VoiceOutcomeStatus | null;
  outcomeReason?: string | null;
  outcomeError?: string | null;
  reviewStatus?: VoiceReviewStatus;
  reviewOpenedAt?: string | null;
  reviewResolvedAt?: string | null;
  reviewOwnerUserId?: string | null;
}

export interface ListVoiceActionPoliciesParams {
  workspaceId: string;
  outcomeStatus?: VoiceOutcomeStatus;
  voiceAgentId?: string | null;
  includeDisabled?: boolean;
}

export interface SaveVoiceCallActionRunParams {
  workspaceId: string;
  voiceCallId: string;
  policyId?: string | null;
  actionType: VoiceActionType;
  triggerOutcomeStatus: VoiceOutcomeStatus;
  status?: VoiceActionRunStatus;
  targetRecordId?: string | null;
  taskId?: string | null;
  attemptCount?: number;
  nextRetryAt?: string | null;
  lastError?: string | null;
  requestPayload?: JsonValue;
  resultPayload?: JsonValue;
  startedAt?: string | null;
  finishedAt?: string | null;
}

export interface UpdateVoiceCallActionRunParams {
  workspaceId: string;
  actionRunId: string;
  status?: VoiceActionRunStatus;
  targetRecordId?: string | null;
  taskId?: string | null;
  attemptCount?: number;
  nextRetryAt?: string | null;
  lastError?: string | null;
  requestPayload?: JsonValue;
  resultPayload?: JsonValue;
  startedAt?: string | null;
  finishedAt?: string | null;
}

export interface SaveVoiceCallArtifactParams {
  workspaceId: string;
  voiceCallId: string;
  artifactType: VoiceArtifactType;
  status?: VoiceArtifactStatus;
  source?: string | null;
  contentText?: string | null;
  contentJson?: JsonValue;
  model?: string | null;
  errorText?: string | null;
  generatedAt?: string | null;
}

const WORKSPACE_PHONE_NUMBER_COLUMNS =
  'id, workspace_id, provider, phone_number_e164, label, provisioning_status, webhook_status, last_provisioning_error, telnyx_connection_id, provider_order_id, telnyx_metadata, provider_phone_number_id, is_active, voice_mode, purchased_at, released_at, provisioning_locked_at, last_webhook_observed_at, created_at, updated_at';
const VOICE_CALL_COLUMNS =
  'id, workspace_id, workspace_phone_number_id, voice_agent_id, voice_agent_binding_id, provider, direction, provider_call_control_id, provider_call_leg_id, provider_call_session_id, provider_connection_id, from_number_e164, to_number_e164, status, lead_creation_status, gather_result, message_history, record_id, assistant_mapping_snapshot, runtime_mode, gather_status, provider_gather_status, outcome_status, outcome_reason, outcome_error, review_status, review_opened_at, review_resolved_at, review_owner_user_id, answered_at, gather_completed_at, lead_created_at, ended_at, created_at, updated_at';
const VOICE_EVENT_COLUMNS =
  'id, workspace_id, voice_call_id, provider, provider_event_id, event_type, occurred_at, processing_status, signature_valid, payload, processing_error, processed_at, created_at';
const VOICE_ACTION_POLICY_COLUMNS =
  'id, workspace_id, voice_agent_id, outcome_status, action_type, is_enabled, position, action_config, created_at, updated_at';
const VOICE_CALL_ACTION_RUN_COLUMNS =
  'id, workspace_id, voice_call_id, policy_id, action_type, trigger_outcome_status, status, target_record_id, task_id, attempt_count, next_retry_at, last_error, request_payload, result_payload, started_at, finished_at, created_at, updated_at';
const VOICE_CALL_ARTIFACT_COLUMNS =
  'id, workspace_id, voice_call_id, artifact_type, status, source, content_text, content_json, model, error_text, generated_at, created_at, updated_at';

const E164_REGEX = /^\+[1-9][0-9]{1,14}$/;
const NOW = () => new Date().toISOString();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every((item) => isJsonValue(item));
  }

  if (isRecord(value)) {
    return Object.values(value).every((item) => isJsonValue(item));
  }

  return false;
}

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeNullableString(value: unknown) {
  const next = normalizeString(value);
  return next.length > 0 ? next : null;
}

function ensureNonEmpty(value: unknown, field: string) {
  const next = normalizeString(value);

  if (!next) {
    throw new VoiceRepositoryValidationError(`${field} is required.`);
  }

  return next;
}

function ensureE164(value: unknown, field: string) {
  const next = ensureNonEmpty(value, field);

  if (!E164_REGEX.test(next)) {
    throw new VoiceRepositoryValidationError(`${field} must be a valid E.164 number.`);
  }

  return next;
}

function ensureIsoTimestamp(value: unknown, field: string) {
  const next = ensureNonEmpty(value, field);
  const parsed = new Date(next);

  if (Number.isNaN(parsed.getTime())) {
    throw new VoiceRepositoryValidationError(`${field} must be a valid ISO timestamp.`);
  }

  return parsed.toISOString();
}

function parseTime(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function maxIso(left: string, right: string) {
  return parseTime(left)! >= parseTime(right)! ? left : right;
}

function minIso(left: string, right: string) {
  return parseTime(left)! <= parseTime(right)! ? left : right;
}

function isWorkspacePhoneNumberReadyState(
  provisioningStatus: WorkspacePhoneProvisioningStatus,
  webhookStatus: WorkspacePhoneWebhookStatus,
  releasedAt: string | null,
) {
  return provisioningStatus === 'active' && webhookStatus === 'ready' && releasedAt === null;
}

export function isWorkspacePhoneNumberRoutable(row: Pick<
  WorkspacePhoneNumberRow,
  'provisioning_status' | 'webhook_status' | 'released_at' | 'is_active'
>) {
  return row.is_active && isWorkspacePhoneNumberReadyState(row.provisioning_status, row.webhook_status, row.released_at);
}

function resolveWorkspacePhoneNumberRuntimeState(params: {
  current?: WorkspacePhoneNumberRow | null;
  provisioningStatus?: WorkspacePhoneProvisioningStatus;
  webhookStatus?: WorkspacePhoneWebhookStatus;
  isActive?: boolean;
  releasedAt?: string | null;
}) {
  const current = params.current ?? null;
  const provisioningStatus = params.provisioningStatus ?? current?.provisioning_status ?? 'pending';
  const webhookStatus = params.webhookStatus ?? current?.webhook_status ?? 'pending';
  const releasedAt = params.releasedAt !== undefined
    ? params.releasedAt
    : current?.released_at ?? null;
  const requestedIsActive = typeof params.isActive === 'boolean'
    ? params.isActive
    : current?.is_active ?? false;

  return {
    provisioningStatus,
    webhookStatus,
    releasedAt,
    isActive: requestedIsActive && isWorkspacePhoneNumberReadyState(provisioningStatus, webhookStatus, releasedAt),
  };
}

function isUniqueViolation(error: unknown) {
  if (!isRecord(error)) return false;
  const code = normalizeString(error.code);
  const message = normalizeString(error.message).toLowerCase();
  return code === '23505' || message.includes('duplicate key');
}

function formatDbError(error: unknown) {
  if (!isRecord(error)) return 'Unknown database error.';
  const message = normalizeString(error.message);
  const code = normalizeString(error.code);
  const details = normalizeString(error.details);
  return [message, code ? `(code ${code})` : '', details ? `- ${details}` : ''].filter(Boolean).join(' ').trim();
}

function throwDbError(operation: string, error: unknown): never {
  throw new VoiceRepositoryDbError(operation, formatDbError(error), error);
}

function resolveCallStatus(current: VoiceCallStatus, incoming: VoiceCallStatus): VoiceCallStatus {
  if (current === 'ended' || incoming === 'ended') {
    return 'ended';
  }

  if (current === 'lead_created') {
    return 'lead_created';
  }

  if (incoming === 'lead_created') {
    return 'lead_created';
  }

  if (incoming === 'initiated') {
    return current;
  }

  if (incoming === 'answered') {
    return current === 'initiated' || current === 'answered' ? 'answered' : current;
  }

  if (incoming === 'gathering') {
    return current === 'lead_created' ? current : 'gathering';
  }

  if (incoming === 'failed') {
    return current === 'lead_created' ? current : 'failed';
  }

  return current;
}

async function getVoiceCallById(db: EdgeClient, workspaceId: string, voiceCallId: string) {
  const { data, error } = await db
    .from('voice_calls')
    .select(VOICE_CALL_COLUMNS)
    .eq('workspace_id', workspaceId)
    .eq('id', voiceCallId)
    .maybeSingle();

  if (error) {
    throwDbError('getVoiceCallById', error);
  }

  if (!data) {
    throw new VoiceRepositoryNotFoundError('Voice call not found.');
  }

  return data as VoiceCallRow;
}

async function getVoiceEventById(db: EdgeClient, workspaceId: string, eventId: string) {
  const { data, error } = await db
    .from('voice_call_events')
    .select(VOICE_EVENT_COLUMNS)
    .eq('workspace_id', workspaceId)
    .eq('id', eventId)
    .maybeSingle();

  if (error) {
    throwDbError('getVoiceEventById', error);
  }

  if (!data) {
    throw new VoiceRepositoryNotFoundError('Voice call event not found.');
  }

  return data as VoiceCallEventRow;
}

async function getEventByProviderEventId(db: EdgeClient, providerEventId: string) {
  const { data, error } = await db
    .from('voice_call_events')
    .select(VOICE_EVENT_COLUMNS)
    .eq('provider', 'telnyx')
    .eq('provider_event_id', providerEventId)
    .maybeSingle();

  if (error) {
    throwDbError('getEventByProviderEventId', error);
  }

  return (data ?? null) as VoiceCallEventRow | null;
}

async function updateVoiceCall(
  db: EdgeClient,
  workspaceId: string,
  voiceCallId: string,
  patch: Record<string, unknown>,
  operation: string,
) {
  const { data, error } = await db
    .from('voice_calls')
    .update(patch)
    .eq('workspace_id', workspaceId)
    .eq('id', voiceCallId)
    .select(VOICE_CALL_COLUMNS)
    .single();

  if (error) {
    throwDbError(operation, error);
  }

  return data as VoiceCallRow;
}

async function updateVoiceEvent(
  db: EdgeClient,
  workspaceId: string,
  eventId: string,
  patch: Record<string, unknown>,
  operation: string,
) {
  const { data, error } = await db
    .from('voice_call_events')
    .update(patch)
    .eq('workspace_id', workspaceId)
    .eq('id', eventId)
    .select(VOICE_EVENT_COLUMNS)
    .single();

  if (error) {
    throwDbError(operation, error);
  }

  return data as VoiceCallEventRow;
}

export async function findVoiceCallById(
  db: EdgeClient,
  workspaceId: string,
  voiceCallId: string,
) {
  return getVoiceCallById(db, ensureNonEmpty(workspaceId, 'workspaceId'), ensureNonEmpty(voiceCallId, 'voiceCallId'));
}

export async function listVoiceCallEventsByVoiceCallId(
  db: EdgeClient,
  workspaceId: string,
  voiceCallId: string,
) {
  const nextWorkspaceId = ensureNonEmpty(workspaceId, 'workspaceId');
  const nextVoiceCallId = ensureNonEmpty(voiceCallId, 'voiceCallId');
  const { data, error } = await db
    .from('voice_call_events')
    .select(VOICE_EVENT_COLUMNS)
    .eq('workspace_id', nextWorkspaceId)
    .eq('voice_call_id', nextVoiceCallId)
    .order('occurred_at', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    throwDbError('listVoiceCallEventsByVoiceCallId', error);
  }

  return (data ?? []) as VoiceCallEventRow[];
}

export async function setVoiceCallRuntimeMode(
  db: EdgeClient,
  params: SetVoiceCallRuntimeModeParams,
) {
  const workspaceId = ensureNonEmpty(params.workspaceId, 'workspaceId');
  const voiceCallId = ensureNonEmpty(params.voiceCallId, 'voiceCallId');
  const call = await getVoiceCallById(db, workspaceId, voiceCallId);

  if (call.runtime_mode === params.runtimeMode) {
    return call;
  }

  return updateVoiceCall(
    db,
    workspaceId,
    voiceCallId,
    { runtime_mode: params.runtimeMode },
    'setVoiceCallRuntimeMode',
  );
}

export async function updateVoiceCallOutcome(
  db: EdgeClient,
  params: UpdateVoiceCallOutcomeParams,
) {
  const workspaceId = ensureNonEmpty(params.workspaceId, 'workspaceId');
  const voiceCallId = ensureNonEmpty(params.voiceCallId, 'voiceCallId');
  const call = await getVoiceCallById(db, workspaceId, voiceCallId);
  const patch: Record<string, unknown> = {};

  if (params.outcomeStatus !== undefined) {
    patch.outcome_status = params.outcomeStatus;
  }

  if (params.outcomeReason !== undefined) {
    patch.outcome_reason = normalizeNullableString(params.outcomeReason);
  }

  if (params.outcomeError !== undefined) {
    patch.outcome_error = normalizeNullableString(params.outcomeError);
  }

  if (params.reviewStatus !== undefined) {
    patch.review_status = params.reviewStatus;
  }

  if (params.reviewOpenedAt !== undefined) {
    patch.review_opened_at = params.reviewOpenedAt ? ensureIsoTimestamp(params.reviewOpenedAt, 'reviewOpenedAt') : null;
  }

  if (params.reviewResolvedAt !== undefined) {
    patch.review_resolved_at = params.reviewResolvedAt
      ? ensureIsoTimestamp(params.reviewResolvedAt, 'reviewResolvedAt')
      : null;
  }

  if (params.reviewOwnerUserId !== undefined) {
    patch.review_owner_user_id = normalizeNullableString(params.reviewOwnerUserId);
  }

  if (Object.keys(patch).length === 0) {
    return call;
  }

  return updateVoiceCall(
    db,
    workspaceId,
    voiceCallId,
    patch,
    'updateVoiceCallOutcome',
  );
}

export async function listVoiceActionPolicies(
  db: EdgeClient,
  params: ListVoiceActionPoliciesParams,
) {
  const workspaceId = ensureNonEmpty(params.workspaceId, 'workspaceId');
  let query = db
    .from('voice_action_policies')
    .select(VOICE_ACTION_POLICY_COLUMNS)
    .eq('workspace_id', workspaceId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });

  if (params.outcomeStatus) {
    query = query.eq('outcome_status', params.outcomeStatus);
  }

  if (!params.includeDisabled) {
    query = query.eq('is_enabled', true);
  }

  if (params.voiceAgentId !== undefined) {
    if (params.voiceAgentId) {
      query = query.or(`voice_agent_id.eq.${params.voiceAgentId},voice_agent_id.is.null`);
    } else {
      query = query.is('voice_agent_id', null);
    }
  }

  const { data, error } = await query;

  if (error) {
    throwDbError('listVoiceActionPolicies', error);
  }

  const policies = (data ?? []) as VoiceActionPolicyRow[];

  if (!params.voiceAgentId) {
    return policies;
  }

  return policies.sort((left, right) => {
    const leftSpecificity = left.voice_agent_id ? 0 : 1;
    const rightSpecificity = right.voice_agent_id ? 0 : 1;
    if (leftSpecificity !== rightSpecificity) {
      return leftSpecificity - rightSpecificity;
    }
    if (left.position !== right.position) {
      return left.position - right.position;
    }
    return left.created_at.localeCompare(right.created_at);
  });
}

async function getVoiceCallActionRunById(
  db: EdgeClient,
  workspaceId: string,
  actionRunId: string,
) {
  const { data, error } = await db
    .from('voice_call_action_runs')
    .select(VOICE_CALL_ACTION_RUN_COLUMNS)
    .eq('workspace_id', workspaceId)
    .eq('id', actionRunId)
    .maybeSingle();

  if (error) {
    throwDbError('getVoiceCallActionRunById', error);
  }

  if (!data) {
    throw new VoiceRepositoryNotFoundError('Voice call action run not found.');
  }

  return data as VoiceCallActionRunRow;
}

export async function listVoiceCallActionRunsByVoiceCallId(
  db: EdgeClient,
  workspaceId: string,
  voiceCallId: string,
) {
  const nextWorkspaceId = ensureNonEmpty(workspaceId, 'workspaceId');
  const nextVoiceCallId = ensureNonEmpty(voiceCallId, 'voiceCallId');
  const { data, error } = await db
    .from('voice_call_action_runs')
    .select(VOICE_CALL_ACTION_RUN_COLUMNS)
    .eq('workspace_id', nextWorkspaceId)
    .eq('voice_call_id', nextVoiceCallId)
    .order('created_at', { ascending: false });

  if (error) {
    throwDbError('listVoiceCallActionRunsByVoiceCallId', error);
  }

  return (data ?? []) as VoiceCallActionRunRow[];
}

export async function findVoiceCallActionRunById(
  db: EdgeClient,
  workspaceId: string,
  actionRunId: string,
) {
  return getVoiceCallActionRunById(
    db,
    ensureNonEmpty(workspaceId, 'workspaceId'),
    ensureNonEmpty(actionRunId, 'actionRunId'),
  );
}

export async function saveVoiceCallActionRun(
  db: EdgeClient,
  params: SaveVoiceCallActionRunParams,
) {
  const workspaceId = ensureNonEmpty(params.workspaceId, 'workspaceId');
  const voiceCallId = ensureNonEmpty(params.voiceCallId, 'voiceCallId');
  const payload = {
    workspace_id: workspaceId,
    voice_call_id: voiceCallId,
    policy_id: normalizeNullableString(params.policyId),
    action_type: params.actionType,
    trigger_outcome_status: params.triggerOutcomeStatus,
    status: params.status ?? 'pending',
    target_record_id: normalizeNullableString(params.targetRecordId),
    task_id: normalizeNullableString(params.taskId),
    attempt_count: Number.isFinite(params.attemptCount) ? Math.max(0, Math.trunc(Number(params.attemptCount))) : 0,
    next_retry_at: params.nextRetryAt ? ensureIsoTimestamp(params.nextRetryAt, 'nextRetryAt') : null,
    last_error: normalizeNullableString(params.lastError),
    request_payload: isJsonValue(params.requestPayload) ? params.requestPayload : {},
    result_payload: isJsonValue(params.resultPayload) ? params.resultPayload : {},
    started_at: params.startedAt ? ensureIsoTimestamp(params.startedAt, 'startedAt') : null,
    finished_at: params.finishedAt ? ensureIsoTimestamp(params.finishedAt, 'finishedAt') : null,
  };

  const { data, error } = await db
    .from('voice_call_action_runs')
    .insert(payload)
    .select(VOICE_CALL_ACTION_RUN_COLUMNS)
    .single();

  if (error) {
    throwDbError('saveVoiceCallActionRun', error);
  }

  return data as VoiceCallActionRunRow;
}

export async function updateVoiceCallActionRun(
  db: EdgeClient,
  params: UpdateVoiceCallActionRunParams,
) {
  const workspaceId = ensureNonEmpty(params.workspaceId, 'workspaceId');
  const actionRunId = ensureNonEmpty(params.actionRunId, 'actionRunId');
  const current = await getVoiceCallActionRunById(db, workspaceId, actionRunId);
  const patch: Record<string, unknown> = {};

  if (params.status !== undefined) {
    patch.status = params.status;
  }

  if (params.targetRecordId !== undefined) {
    patch.target_record_id = normalizeNullableString(params.targetRecordId);
  }

  if (params.taskId !== undefined) {
    patch.task_id = normalizeNullableString(params.taskId);
  }

  if (params.attemptCount !== undefined) {
    patch.attempt_count = Number.isFinite(params.attemptCount)
      ? Math.max(0, Math.trunc(Number(params.attemptCount)))
      : current.attempt_count;
  }

  if (params.nextRetryAt !== undefined) {
    patch.next_retry_at = params.nextRetryAt ? ensureIsoTimestamp(params.nextRetryAt, 'nextRetryAt') : null;
  }

  if (params.lastError !== undefined) {
    patch.last_error = normalizeNullableString(params.lastError);
  }

  if (params.requestPayload !== undefined) {
    patch.request_payload = isJsonValue(params.requestPayload) ? params.requestPayload : {};
  }

  if (params.resultPayload !== undefined) {
    patch.result_payload = isJsonValue(params.resultPayload) ? params.resultPayload : {};
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
    .from('voice_call_action_runs')
    .update(patch)
    .eq('workspace_id', workspaceId)
    .eq('id', actionRunId)
    .select(VOICE_CALL_ACTION_RUN_COLUMNS)
    .single();

  if (error) {
    throwDbError('updateVoiceCallActionRun', error);
  }

  return data as VoiceCallActionRunRow;
}

export async function listVoiceCallArtifactsByVoiceCallId(
  db: EdgeClient,
  workspaceId: string,
  voiceCallId: string,
) {
  const nextWorkspaceId = ensureNonEmpty(workspaceId, 'workspaceId');
  const nextVoiceCallId = ensureNonEmpty(voiceCallId, 'voiceCallId');
  const { data, error } = await db
    .from('voice_call_artifacts')
    .select(VOICE_CALL_ARTIFACT_COLUMNS)
    .eq('workspace_id', nextWorkspaceId)
    .eq('voice_call_id', nextVoiceCallId)
    .order('created_at', { ascending: false });

  if (error) {
    throwDbError('listVoiceCallArtifactsByVoiceCallId', error);
  }

  return (data ?? []) as VoiceCallArtifactRow[];
}

export async function saveVoiceCallArtifact(
  db: EdgeClient,
  params: SaveVoiceCallArtifactParams,
) {
  const workspaceId = ensureNonEmpty(params.workspaceId, 'workspaceId');
  const voiceCallId = ensureNonEmpty(params.voiceCallId, 'voiceCallId');
  const { data: existing, error: existingError } = await db
    .from('voice_call_artifacts')
    .select(VOICE_CALL_ARTIFACT_COLUMNS)
    .eq('workspace_id', workspaceId)
    .eq('voice_call_id', voiceCallId)
    .eq('artifact_type', params.artifactType)
    .maybeSingle();

  if (existingError) {
    throwDbError('saveVoiceCallArtifact.findExisting', existingError);
  }

  const patch = {
    status: params.status ?? existing?.status ?? 'pending',
    source: params.source !== undefined ? normalizeNullableString(params.source) : existing?.source ?? null,
    content_text: params.contentText !== undefined ? normalizeNullableString(params.contentText) : existing?.content_text ?? null,
    content_json: params.contentJson !== undefined
      ? (isJsonValue(params.contentJson) ? params.contentJson : {})
      : existing?.content_json ?? {},
    model: params.model !== undefined ? normalizeNullableString(params.model) : existing?.model ?? null,
    error_text: params.errorText !== undefined ? normalizeNullableString(params.errorText) : existing?.error_text ?? null,
    generated_at: params.generatedAt !== undefined
      ? (params.generatedAt ? ensureIsoTimestamp(params.generatedAt, 'generatedAt') : null)
      : existing?.generated_at ?? null,
  };

  if (existing) {
    const { data, error } = await db
      .from('voice_call_artifacts')
      .update(patch)
      .eq('workspace_id', workspaceId)
      .eq('id', existing.id)
      .select(VOICE_CALL_ARTIFACT_COLUMNS)
      .single();

    if (error) {
      throwDbError('saveVoiceCallArtifact.updateExisting', error);
    }

    return data as VoiceCallArtifactRow;
  }

  const { data, error } = await db
    .from('voice_call_artifacts')
    .insert({
      workspace_id: workspaceId,
      voice_call_id: voiceCallId,
      artifact_type: params.artifactType,
      ...patch,
    })
    .select(VOICE_CALL_ARTIFACT_COLUMNS)
    .single();

  if (error) {
    if (isUniqueViolation(error)) {
      const { data: conflict, error: conflictError } = await db
        .from('voice_call_artifacts')
        .select(VOICE_CALL_ARTIFACT_COLUMNS)
        .eq('workspace_id', workspaceId)
        .eq('voice_call_id', voiceCallId)
        .eq('artifact_type', params.artifactType)
        .maybeSingle();

      if (conflictError) {
        throwDbError('saveVoiceCallArtifact.insertThenRefetch', conflictError);
      }

      if (!conflict) {
        throwDbError('saveVoiceCallArtifact.insertThenRefetch', error);
      }

      const { data: updatedConflict, error: updateConflictError } = await db
        .from('voice_call_artifacts')
        .update(patch)
        .eq('id', conflict.id)
        .select(VOICE_CALL_ARTIFACT_COLUMNS)
        .single();

      if (updateConflictError) {
        throwDbError('saveVoiceCallArtifact.updateAfterConflict', updateConflictError);
      }

      return updatedConflict as VoiceCallArtifactRow;
    }
    throwDbError('saveVoiceCallArtifact.insert', error);
  }

  return data as VoiceCallArtifactRow;
}

export async function findWorkspacePhoneNumberByE164(db: EdgeClient, toNumber: string) {
  const phoneNumber = ensureE164(toNumber, 'toNumber');
  const { data, error } = await db
    .from('workspace_phone_numbers')
    .select(WORKSPACE_PHONE_NUMBER_COLUMNS)
    .eq('provider', 'telnyx')
    .eq('phone_number_e164', phoneNumber)
    .eq('is_active', true)
    .eq('provisioning_status', 'active')
    .eq('webhook_status', 'ready')
    .is('released_at', null)
    .maybeSingle();

  if (error) {
    throwDbError('findWorkspacePhoneNumberByE164', error);
  }

  return (data ?? null) as WorkspacePhoneNumberRow | null;
}

export async function findWorkspacePhoneNumberById(
  db: EdgeClient,
  workspaceId: string,
  voiceNumberId: string,
) {
  const nextWorkspaceId = ensureNonEmpty(workspaceId, 'workspaceId');
  const nextVoiceNumberId = ensureNonEmpty(voiceNumberId, 'voiceNumberId');
  const { data, error } = await db
    .from('workspace_phone_numbers')
    .select(WORKSPACE_PHONE_NUMBER_COLUMNS)
    .eq('workspace_id', nextWorkspaceId)
    .eq('id', nextVoiceNumberId)
    .maybeSingle();

  if (error) {
    throwDbError('findWorkspacePhoneNumberById', error);
  }

  if (!data) {
    throw new VoiceRepositoryNotFoundError('Workspace phone number not found.');
  }

  return data as WorkspacePhoneNumberRow;
}

export async function findWorkspacePhoneNumberByE164AnyStatus(
  db: EdgeClient,
  phoneNumber: string,
) {
  const normalizedPhoneNumber = ensureE164(phoneNumber, 'phoneNumber');
  const { data, error } = await db
    .from('workspace_phone_numbers')
    .select(WORKSPACE_PHONE_NUMBER_COLUMNS)
    .eq('provider', 'telnyx')
    .eq('phone_number_e164', normalizedPhoneNumber)
    .maybeSingle();

  if (error) {
    throwDbError('findWorkspacePhoneNumberByE164AnyStatus', error);
  }

  return (data ?? null) as WorkspacePhoneNumberRow | null;
}

export function toWorkspacePhoneNumberView(row: WorkspacePhoneNumberRow): WorkspacePhoneNumberView {
  return {
    id: row.id,
    phone_number_e164: row.phone_number_e164,
    label: row.label,
    provisioning_status: row.provisioning_status,
    webhook_status: row.webhook_status,
    last_provisioning_error: row.last_provisioning_error,
    is_active: row.is_active,
    voice_mode: row.voice_mode,
    purchased_at: row.purchased_at,
    released_at: row.released_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function listWorkspacePhoneNumbers(
  db: EdgeClient,
  params: ListWorkspacePhoneNumbersParams,
) {
  const workspaceId = ensureNonEmpty(params.workspaceId, 'workspaceId');
  let query = db
    .from('workspace_phone_numbers')
    .select(WORKSPACE_PHONE_NUMBER_COLUMNS)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

  if (!params.includeInactive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;

  if (error) {
    throwDbError('listWorkspacePhoneNumbers', error);
  }

  return (data ?? []) as WorkspacePhoneNumberRow[];
}

export async function saveWorkspacePhoneNumber(
  db: EdgeClient,
  params: SaveWorkspacePhoneNumberParams,
) {
  const workspaceId = ensureNonEmpty(params.workspaceId, 'workspaceId');
  const phoneNumber = ensureE164(params.phoneNumberE164, 'phoneNumberE164');
  const existing = await findWorkspacePhoneNumberByE164AnyStatus(db, phoneNumber);
  const voiceMode = normalizeNullableString(params.voiceMode) ?? existing?.voice_mode ?? 'ai_lead_capture';
  const telnyxMetadata = params.telnyxMetadata !== undefined
    ? isRecord(params.telnyxMetadata) || Array.isArray(params.telnyxMetadata)
      ? params.telnyxMetadata
      : {}
    : existing?.telnyx_metadata ?? {};
  const purchasedAt = params.purchasedAt !== undefined
    ? params.purchasedAt
      ? ensureIsoTimestamp(params.purchasedAt, 'purchasedAt')
      : null
    : existing?.purchased_at ?? null;
  const releasedAt = params.releasedAt !== undefined
    ? params.releasedAt
      ? ensureIsoTimestamp(params.releasedAt, 'releasedAt')
      : null
    : existing?.released_at ?? null;
  const provisioningLockedAt = params.provisioningLockedAt !== undefined
    ? params.provisioningLockedAt
      ? ensureIsoTimestamp(params.provisioningLockedAt, 'provisioningLockedAt')
      : null
    : existing?.provisioning_locked_at ?? null;
  const runtimeState = resolveWorkspacePhoneNumberRuntimeState({
    current: existing,
    provisioningStatus: params.provisioningStatus,
    webhookStatus: params.webhookStatus,
    isActive: params.isActive,
    releasedAt,
  });

  const payload = {
    label: params.label !== undefined ? normalizeNullableString(params.label) : existing?.label ?? null,
    provisioning_status: runtimeState.provisioningStatus,
    webhook_status: runtimeState.webhookStatus,
    last_provisioning_error: params.lastProvisioningError !== undefined
      ? normalizeNullableString(params.lastProvisioningError)
      : existing?.last_provisioning_error ?? null,
    telnyx_connection_id: params.telnyxConnectionId !== undefined
      ? normalizeNullableString(params.telnyxConnectionId)
      : existing?.telnyx_connection_id ?? null,
    provider_order_id: params.providerOrderId !== undefined
      ? normalizeNullableString(params.providerOrderId)
      : existing?.provider_order_id ?? null,
    telnyx_metadata: telnyxMetadata,
    provider_phone_number_id: params.providerPhoneNumberId !== undefined
      ? normalizeNullableString(params.providerPhoneNumberId)
      : existing?.provider_phone_number_id ?? null,
    is_active: runtimeState.isActive,
    voice_mode: voiceMode,
    purchased_at: purchasedAt,
    released_at: runtimeState.releasedAt,
    provisioning_locked_at: provisioningLockedAt,
  };

  if (existing && existing.workspace_id !== workspaceId) {
    throw new VoiceRepositoryWorkspaceMismatchError(
      'This phone number is already assigned to another workspace.',
    );
  }

  if (existing) {
    const { data, error } = await db
      .from('workspace_phone_numbers')
      .update(payload)
      .eq('workspace_id', existing.workspace_id)
      .eq('id', existing.id)
      .select(WORKSPACE_PHONE_NUMBER_COLUMNS)
      .single();

    if (error) {
      throwDbError('saveWorkspacePhoneNumber.updateExisting', error);
    }

    return data as WorkspacePhoneNumberRow;
  }

  const { data, error } = await db
    .from('workspace_phone_numbers')
    .insert({
      workspace_id: workspaceId,
      provider: params.provider ?? 'telnyx',
      phone_number_e164: phoneNumber,
      ...payload,
    })
    .select(WORKSPACE_PHONE_NUMBER_COLUMNS)
    .single();

  if (error) {
    if (isUniqueViolation(error)) {
      const conflict = await findWorkspacePhoneNumberByE164AnyStatus(db, phoneNumber);

      if (conflict && conflict.workspace_id !== workspaceId) {
        throw new VoiceRepositoryWorkspaceMismatchError(
          'This phone number is already assigned to another workspace.',
        );
      }

      if (conflict) {
        return saveWorkspacePhoneNumber(db, params);
      }
    }

    throwDbError('saveWorkspacePhoneNumber', error);
  }

  return data as WorkspacePhoneNumberRow;
}

export async function updateWorkspacePhoneNumber(
  db: EdgeClient,
  params: UpdateWorkspacePhoneNumberParams,
) {
  const current = await findWorkspacePhoneNumberById(db, params.workspaceId, params.voiceNumberId);
  const patch: Record<string, unknown> = {};

  if (params.label !== undefined) {
    patch.label = normalizeNullableString(params.label);
  }

  if (params.providerPhoneNumberId !== undefined) {
    patch.provider_phone_number_id = normalizeNullableString(params.providerPhoneNumberId);
  }

  if (params.providerOrderId !== undefined) {
    patch.provider_order_id = normalizeNullableString(params.providerOrderId);
  }

  if (params.provisioningStatus !== undefined) {
    patch.provisioning_status = params.provisioningStatus;
  }

  if (params.webhookStatus !== undefined) {
    patch.webhook_status = params.webhookStatus;
  }

  if (params.lastProvisioningError !== undefined) {
    patch.last_provisioning_error = normalizeNullableString(params.lastProvisioningError);
  }

  if (params.telnyxConnectionId !== undefined) {
    patch.telnyx_connection_id = normalizeNullableString(params.telnyxConnectionId);
  }

  if (params.telnyxMetadata !== undefined) {
    patch.telnyx_metadata =
      isRecord(params.telnyxMetadata) || Array.isArray(params.telnyxMetadata)
        ? params.telnyxMetadata
        : {};
  }

  if (typeof params.isActive === 'boolean') {
    patch.is_active = params.isActive;
  }

  if (params.voiceMode !== undefined) {
    patch.voice_mode = normalizeNullableString(params.voiceMode) ?? current.voice_mode;
  }

  if (params.purchasedAt !== undefined) {
    patch.purchased_at = params.purchasedAt ? ensureIsoTimestamp(params.purchasedAt, 'purchasedAt') : null;
  }

  if (params.releasedAt !== undefined) {
    patch.released_at = params.releasedAt ? ensureIsoTimestamp(params.releasedAt, 'releasedAt') : null;
  }

  if (params.provisioningLockedAt !== undefined) {
    patch.provisioning_locked_at = params.provisioningLockedAt
      ? ensureIsoTimestamp(params.provisioningLockedAt, 'provisioningLockedAt')
      : null;
  }

  if (Object.keys(patch).length === 0) {
    return current;
  }

  const runtimeState = resolveWorkspacePhoneNumberRuntimeState({
    current,
    provisioningStatus: patch.provisioning_status as WorkspacePhoneProvisioningStatus | undefined,
    webhookStatus: patch.webhook_status as WorkspacePhoneWebhookStatus | undefined,
    isActive: typeof patch.is_active === 'boolean' ? patch.is_active : undefined,
    releasedAt: Object.hasOwn(patch, 'released_at') ? (patch.released_at as string | null) : undefined,
  });

  patch.provisioning_status = runtimeState.provisioningStatus;
  patch.webhook_status = runtimeState.webhookStatus;
  patch.released_at = runtimeState.releasedAt;
  patch.is_active = runtimeState.isActive;

  const { data, error } = await db
    .from('workspace_phone_numbers')
    .update(patch)
    .eq('workspace_id', current.workspace_id)
    .eq('id', current.id)
    .select(WORKSPACE_PHONE_NUMBER_COLUMNS)
    .single();

  if (error) {
    throwDbError('updateWorkspacePhoneNumber', error);
  }

  return data as WorkspacePhoneNumberRow;
}

export async function claimWorkspacePhoneNumberProvisioning(
  db: EdgeClient,
  params: ClaimWorkspacePhoneNumberProvisioningParams,
): Promise<ClaimWorkspacePhoneNumberProvisioningResult> {
  const current = await findWorkspacePhoneNumberById(db, params.workspaceId, params.voiceNumberId);
  const staleAfterSeconds = Number.isFinite(params.staleAfterSeconds)
    ? Math.max(30, Math.trunc(Number(params.staleAfterSeconds)))
    : 120;
  const staleBefore = new Date(Date.now() - staleAfterSeconds * 1000).toISOString();
  const currentLockedAt = current.provisioning_locked_at;
  const isStale = currentLockedAt ? currentLockedAt <= staleBefore : true;

  if (currentLockedAt && !isStale) {
    return { claimed: false, number: current };
  }

  let query = db
    .from('workspace_phone_numbers')
    .update({ provisioning_locked_at: NOW() })
    .eq('workspace_id', current.workspace_id)
    .eq('id', current.id)
    .select(WORKSPACE_PHONE_NUMBER_COLUMNS);

  query = currentLockedAt
    ? query.eq('provisioning_locked_at', currentLockedAt)
    : query.is('provisioning_locked_at', null);

  const { data, error } = await query.maybeSingle();

  if (error) {
    throwDbError('claimWorkspacePhoneNumberProvisioning', error);
  }

  if (!data) {
    const fresh = await findWorkspacePhoneNumberById(db, params.workspaceId, params.voiceNumberId);
    return { claimed: false, number: fresh };
  }

  return {
    claimed: true,
    number: data as WorkspacePhoneNumberRow,
  };
}

export async function releaseWorkspacePhoneNumberProvisioning(
  db: EdgeClient,
  workspaceId: string,
  voiceNumberId: string,
) {
  const number = await findWorkspacePhoneNumberById(db, workspaceId, voiceNumberId);
  const { data, error } = await db
    .from('workspace_phone_numbers')
    .update({ provisioning_locked_at: null })
    .eq('workspace_id', number.workspace_id)
    .eq('id', number.id)
    .select(WORKSPACE_PHONE_NUMBER_COLUMNS)
    .single();

  if (error) {
    throwDbError('releaseWorkspacePhoneNumberProvisioning', error);
  }

  return data as WorkspacePhoneNumberRow;
}

export async function markWorkspacePhoneNumberWebhookObserved(
  db: EdgeClient,
  params: MarkWorkspacePhoneNumberWebhookObservedParams,
) {
  const workspaceId = ensureNonEmpty(params.workspaceId, 'workspaceId');
  const voiceNumberId = ensureNonEmpty(params.voiceNumberId, 'voiceNumberId');
  const observedAt = params.observedAt ? ensureIsoTimestamp(params.observedAt, 'observedAt') : NOW();
  const current = await findWorkspacePhoneNumberById(db, workspaceId, voiceNumberId);
  const nextObservedAt = current.last_webhook_observed_at
    ? maxIso(current.last_webhook_observed_at, observedAt)
    : observedAt;

  if (current.last_webhook_observed_at === nextObservedAt) {
    return current;
  }

  const { data, error } = await db
    .from('workspace_phone_numbers')
    .update({ last_webhook_observed_at: nextObservedAt })
    .eq('workspace_id', current.workspace_id)
    .eq('id', current.id)
    .select(WORKSPACE_PHONE_NUMBER_COLUMNS)
    .single();

  if (error) {
    throwDbError('markWorkspacePhoneNumberWebhookObserved', error);
  }

  return data as WorkspacePhoneNumberRow;
}

export async function beginEventProcessing(
  db: EdgeClient,
  params: BeginEventProcessingParams,
): Promise<BeginEventProcessingResult> {
  const workspaceId = ensureNonEmpty(params.workspaceId, 'workspaceId');
  const providerEventId = ensureNonEmpty(params.providerEventId, 'providerEventId');
  const eventType = ensureNonEmpty(params.eventType, 'eventType');
  const occurredAt = ensureIsoTimestamp(params.occurredAt, 'occurredAt');
  const signatureValid = Boolean(params.signatureValid);
  const payload = params.payload;

  const existing = await getEventByProviderEventId(db, providerEventId);

  if (existing) {
    if (existing.workspace_id !== workspaceId) {
      throw new VoiceRepositoryWorkspaceMismatchError(
        'Provider event id already exists under a different workspace.',
      );
    }

    if (existing.processing_status === 'processed' || existing.processing_status === 'ignored') {
      return {
        event: existing,
        duplicate: true,
        shouldProcess: false,
      };
    }

    // Failed events are intentionally reset back to pending so retryable webhook processing can continue.
    const reused = await updateVoiceEvent(
      db,
      workspaceId,
      existing.id,
      {
        event_type: eventType,
        occurred_at: occurredAt,
        payload,
        signature_valid: existing.signature_valid || signatureValid,
        processing_status: 'pending',
        processing_error: null,
        processed_at: null,
      },
      'beginEventProcessing.reusePendingOrFailed',
    );

    return {
      event: reused,
      duplicate: false,
      shouldProcess: true,
    };
  }

  const insertPayload = {
    workspace_id: workspaceId,
    provider: params.provider ?? 'telnyx',
    provider_event_id: providerEventId,
    event_type: eventType,
    occurred_at: occurredAt,
    processing_status: 'pending' as VoiceEventProcessingStatus,
    signature_valid: signatureValid,
    payload,
  };

  const { data, error } = await db
    .from('voice_call_events')
    .insert(insertPayload)
    .select(VOICE_EVENT_COLUMNS)
    .single();

  if (error) {
    if (isUniqueViolation(error)) {
      const duplicate = await getEventByProviderEventId(db, providerEventId);

      if (!duplicate) {
        throwDbError('beginEventProcessing.insertThenRefetch', error);
      }

      if (duplicate.workspace_id !== workspaceId) {
        throw new VoiceRepositoryWorkspaceMismatchError(
          'Provider event id already exists under a different workspace.',
        );
      }

      if (duplicate.processing_status === 'processed' || duplicate.processing_status === 'ignored') {
        return {
          event: duplicate,
          duplicate: true,
          shouldProcess: false,
        };
      }

      const reused = await updateVoiceEvent(
        db,
        workspaceId,
        duplicate.id,
        {
          event_type: eventType,
          occurred_at: occurredAt,
          payload,
          signature_valid: duplicate.signature_valid || signatureValid,
          processing_status: 'pending',
          processing_error: null,
          processed_at: null,
        },
        'beginEventProcessing.reuseAfterConflict',
      );

      return {
        event: reused,
        duplicate: false,
        shouldProcess: true,
      };
    }

    throwDbError('beginEventProcessing.insert', error);
  }

  return {
    event: data as VoiceCallEventRow,
    duplicate: false,
    shouldProcess: true,
  };
}

export async function upsertVoiceCallBase(db: EdgeClient, params: UpsertVoiceCallBaseParams) {
  const workspacePhoneNumberId = ensureNonEmpty(params.workspacePhoneNumberId, 'workspacePhoneNumberId');
  const { data: phoneRow, error: phoneError } = await db
    .from('workspace_phone_numbers')
    .select('id, workspace_id')
    .eq('id', workspacePhoneNumberId)
    .maybeSingle();

  if (phoneError) {
    throwDbError('upsertVoiceCallBase.findWorkspacePhoneNumber', phoneError);
  }

  if (!phoneRow) {
    throw new VoiceRepositoryNotFoundError('Workspace phone number not found.');
  }

  const phoneWorkspaceId = ensureNonEmpty((phoneRow as { workspace_id: string | null }).workspace_id, 'workspace_id');
  const requestedWorkspaceId = normalizeNullableString(params.workspaceId);
  const workspaceId = requestedWorkspaceId ?? phoneWorkspaceId;

  if (workspaceId !== phoneWorkspaceId) {
    throw new VoiceRepositoryWorkspaceMismatchError(
      'workspace_phone_number_id is linked to a different workspace than workspaceId.',
    );
  }

  const providerCallControlId = ensureNonEmpty(params.providerCallControlId, 'providerCallControlId');
  const providerCallLegId = normalizeNullableString(params.providerCallLegId);
  const providerCallSessionId = normalizeNullableString(params.providerCallSessionId);
  const providerConnectionId = normalizeNullableString(params.providerConnectionId);
  const fromNumberE164 = ensureE164(params.fromNumberE164, 'fromNumberE164');
  const toNumberE164 = ensureE164(params.toNumberE164, 'toNumberE164');
  const provider: VoiceProvider = params.provider ?? 'telnyx';
  const direction: VoiceDirection = params.direction ?? 'inbound';

  const { data: existing, error: existingError } = await db
    .from('voice_calls')
    .select(VOICE_CALL_COLUMNS)
    .eq('provider', provider)
    .eq('provider_call_control_id', providerCallControlId)
    .maybeSingle();

  if (existingError) {
    throwDbError('upsertVoiceCallBase.findExisting', existingError);
  }

  if (!existing) {
    const insertPayload = {
      workspace_id: workspaceId,
      workspace_phone_number_id: workspacePhoneNumberId,
      provider,
      direction,
      provider_call_control_id: providerCallControlId,
      provider_call_leg_id: providerCallLegId,
      provider_call_session_id: providerCallSessionId,
      provider_connection_id: providerConnectionId,
      from_number_e164: fromNumberE164,
      to_number_e164: toNumberE164,
      status: params.status,
      lead_creation_status: 'pending' as VoiceLeadCreationStatus,
    };

    const { data, error } = await db
      .from('voice_calls')
      .insert(insertPayload)
      .select(VOICE_CALL_COLUMNS)
      .single();

    if (error) {
      if (isUniqueViolation(error)) {
        return upsertVoiceCallBase(db, params);
      }
      throwDbError('upsertVoiceCallBase.insert', error);
    }

    return data as VoiceCallRow;
  }

  const current = existing as VoiceCallRow;

  if (current.workspace_id !== workspaceId) {
    throw new VoiceRepositoryWorkspaceMismatchError(
      'Provider call control id already exists under a different workspace.',
    );
  }

  if (current.workspace_phone_number_id !== workspacePhoneNumberId) {
    throw new VoiceRepositoryWorkspaceMismatchError(
      'Provider call control id is already linked to a different workspace phone number.',
    );
  }

  const nextStatus = resolveCallStatus(current.status, params.status);
  const patch: Record<string, unknown> = {
    provider_call_leg_id: providerCallLegId ?? current.provider_call_leg_id,
    provider_call_session_id: providerCallSessionId ?? current.provider_call_session_id,
    provider_connection_id: providerConnectionId ?? current.provider_connection_id,
    from_number_e164: fromNumberE164,
    to_number_e164: toNumberE164,
    status: nextStatus,
  };

  const noChanges =
    patch.provider_call_leg_id === current.provider_call_leg_id &&
    patch.provider_call_session_id === current.provider_call_session_id &&
    patch.provider_connection_id === current.provider_connection_id &&
    patch.from_number_e164 === current.from_number_e164 &&
    patch.to_number_e164 === current.to_number_e164 &&
    patch.status === current.status;

  if (noChanges) {
    return current;
  }

  return updateVoiceCall(db, workspaceId, current.id, patch, 'upsertVoiceCallBase.updateExisting');
}

export async function linkEventToVoiceCall(db: EdgeClient, params: LinkEventToVoiceCallParams) {
  const workspaceId = ensureNonEmpty(params.workspaceId, 'workspaceId');
  const eventId = ensureNonEmpty(params.eventId, 'eventId');
  const voiceCallId = ensureNonEmpty(params.voiceCallId, 'voiceCallId');
  const event = await getVoiceEventById(db, workspaceId, eventId);

  if (event.voice_call_id && event.voice_call_id !== voiceCallId) {
    throw new VoiceRepositoryWorkspaceMismatchError('Event is already linked to a different voice call.');
  }

  if (event.voice_call_id === voiceCallId) {
    return event;
  }

  return updateVoiceEvent(
    db,
    workspaceId,
    event.id,
    { voice_call_id: voiceCallId },
    'linkEventToVoiceCall',
  );
}

export async function markEventProcessed(db: EdgeClient, params: MarkEventProcessedParams) {
  const workspaceId = ensureNonEmpty(params.workspaceId, 'workspaceId');
  const eventId = ensureNonEmpty(params.eventId, 'eventId');

  return updateVoiceEvent(
    db,
    workspaceId,
    eventId,
    {
      processing_status: 'processed',
      processed_at: NOW(),
      processing_error: null,
    },
    'markEventProcessed',
  );
}

export async function markEventIgnored(db: EdgeClient, params: MarkEventIgnoredParams) {
  const workspaceId = ensureNonEmpty(params.workspaceId, 'workspaceId');
  const eventId = ensureNonEmpty(params.eventId, 'eventId');
  const reason = normalizeNullableString(params.reason);

  return updateVoiceEvent(
    db,
    workspaceId,
    eventId,
    {
      processing_status: 'ignored',
      processed_at: NOW(),
      processing_error: reason,
    },
    'markEventIgnored',
  );
}

export async function markEventFailed(db: EdgeClient, params: MarkEventFailedParams) {
  const workspaceId = ensureNonEmpty(params.workspaceId, 'workspaceId');
  const eventId = ensureNonEmpty(params.eventId, 'eventId');
  const errorMessage = ensureNonEmpty(params.errorMessage, 'errorMessage');

  return updateVoiceEvent(
    db,
    workspaceId,
    eventId,
    {
      processing_status: 'failed',
      processing_error: errorMessage,
      processed_at: NOW(),
    },
    'markEventFailed',
  );
}

export async function applyCallAnswered(db: EdgeClient, params: ApplyCallAnsweredParams) {
  const workspaceId = ensureNonEmpty(params.workspaceId, 'workspaceId');
  const voiceCallId = ensureNonEmpty(params.voiceCallId, 'voiceCallId');
  const call = await getVoiceCallById(db, workspaceId, voiceCallId);

  const rawAnsweredAt = params.answeredAt ? ensureIsoTimestamp(params.answeredAt, 'answeredAt') : NOW();
  const boundedAnsweredAt = call.ended_at ? minIso(rawAnsweredAt, call.ended_at) : rawAnsweredAt;
  const nextAnsweredAt = call.answered_at ?? boundedAnsweredAt;
  const nextStatus = call.status === 'initiated' || call.status === 'answered' ? 'answered' : call.status;

  if (nextAnsweredAt === call.answered_at && nextStatus === call.status) {
    return call;
  }

  return updateVoiceCall(
    db,
    workspaceId,
    voiceCallId,
    {
      answered_at: nextAnsweredAt,
      status: nextStatus,
    },
    'applyCallAnswered',
  );
}

export async function applyCallGathering(db: EdgeClient, params: ApplyCallGatheringParams) {
  const workspaceId = ensureNonEmpty(params.workspaceId, 'workspaceId');
  const voiceCallId = ensureNonEmpty(params.voiceCallId, 'voiceCallId');
  const call = await getVoiceCallById(db, workspaceId, voiceCallId);

  const nextStatus =
    call.status === 'lead_created' || call.status === 'ended'
      ? call.status
      : 'gathering';

  if (call.status === nextStatus && call.gather_status === 'in_progress') {
    return call;
  }

  return updateVoiceCall(
    db,
    workspaceId,
    voiceCallId,
    {
      status: nextStatus,
      gather_status: 'in_progress',
    },
    'applyCallGathering',
  );
}

export async function updateVoiceCallAssistantContext(db: EdgeClient, params: UpdateVoiceCallAssistantContextParams) {
  const workspaceId = ensureNonEmpty(params.workspaceId, 'workspaceId');
  const voiceCallId = ensureNonEmpty(params.voiceCallId, 'voiceCallId');
  const call = await getVoiceCallById(db, workspaceId, voiceCallId);
  const patch: Record<string, unknown> = {};

  if (params.voiceAgentId !== undefined) {
    patch.voice_agent_id = normalizeNullableString(params.voiceAgentId);
  }

  if (params.voiceAgentBindingId !== undefined) {
    patch.voice_agent_binding_id = normalizeNullableString(params.voiceAgentBindingId);
  }

  if (params.assistantMappingSnapshot !== undefined) {
    patch.assistant_mapping_snapshot = isJsonValue(params.assistantMappingSnapshot)
      ? params.assistantMappingSnapshot
      : null;
  }

  if (Object.keys(patch).length === 0) {
    return call;
  }

  return updateVoiceCall(
    db,
    workspaceId,
    voiceCallId,
    patch,
    'updateVoiceCallAssistantContext',
  );
}

export async function applyGatherEnded(db: EdgeClient, params: ApplyGatherEndedParams) {
  const workspaceId = ensureNonEmpty(params.workspaceId, 'workspaceId');
  const voiceCallId = ensureNonEmpty(params.voiceCallId, 'voiceCallId');
  const call = await getVoiceCallById(db, workspaceId, voiceCallId);
  const rawGatherCompletedAt = params.gatherCompletedAt
    ? ensureIsoTimestamp(params.gatherCompletedAt, 'gatherCompletedAt')
    : NOW();
  const boundedGatherCompletedAt = call.answered_at
    ? maxIso(rawGatherCompletedAt, call.answered_at)
    : rawGatherCompletedAt;

  const nextGatherCompletedAt = call.gather_completed_at ?? boundedGatherCompletedAt;
  const patch: Record<string, unknown> = {
    gather_result: params.gatherResult,
    message_history: params.messageHistory,
    gather_completed_at: nextGatherCompletedAt,
    provider_gather_status: normalizeNullableString(params.providerGatherStatus),
    gather_status: params.gatherStatus ?? 'completed',
  };

  return updateVoiceCall(db, workspaceId, voiceCallId, patch, 'applyGatherEnded');
}

export async function applyLeadCreated(db: EdgeClient, params: ApplyLeadCreatedParams) {
  const workspaceId = ensureNonEmpty(params.workspaceId, 'workspaceId');
  const voiceCallId = ensureNonEmpty(params.voiceCallId, 'voiceCallId');
  const recordId = ensureNonEmpty(params.recordId, 'recordId');
  const call = await getVoiceCallById(db, workspaceId, voiceCallId);
  const leadCreatedAt = params.leadCreatedAt ? ensureIsoTimestamp(params.leadCreatedAt, 'leadCreatedAt') : NOW();

  const nextStatus = call.status === 'ended' ? 'ended' : 'lead_created';
  const nextLeadCreatedAt = call.lead_created_at ?? leadCreatedAt;

  if (
    call.record_id === recordId &&
    call.lead_creation_status === 'created' &&
    call.lead_created_at === nextLeadCreatedAt &&
    call.status === nextStatus
  ) {
    return call;
  }

  return updateVoiceCall(
    db,
    workspaceId,
    voiceCallId,
    {
      record_id: recordId,
      lead_creation_status: 'created',
      lead_created_at: nextLeadCreatedAt,
      status: nextStatus,
      outcome_status: 'lead_created',
      outcome_reason: null,
      outcome_error: null,
      review_status: 'resolved',
      review_resolved_at: NOW(),
    },
    'applyLeadCreated',
  );
}

export async function applyLeadFailed(db: EdgeClient, params: ApplyLeadFailedParams) {
  const workspaceId = ensureNonEmpty(params.workspaceId, 'workspaceId');
  const voiceCallId = ensureNonEmpty(params.voiceCallId, 'voiceCallId');
  const call = await getVoiceCallById(db, workspaceId, voiceCallId);
  // Keep detailed failure text on voice_call_events via markEventFailed(); phase 1 voice_calls has no lead-failure text column.
  void params.errorMessage; // accepted for caller parity; not persisted on voice_calls in phase 1 schema.

  const nextStatus =
    call.status === 'ended' || call.status === 'lead_created'
      ? call.status
      : 'failed';

  if (call.lead_creation_status === 'failed' && call.status === nextStatus) {
    return call;
  }

  return updateVoiceCall(
    db,
    workspaceId,
    voiceCallId,
    {
      lead_creation_status: 'failed',
      status: nextStatus,
      outcome_error: normalizeNullableString(params.errorMessage),
      review_status: call.review_status === 'not_needed' ? 'open' : call.review_status,
      review_opened_at: call.review_opened_at ?? NOW(),
      review_resolved_at: null,
    },
    'applyLeadFailed',
  );
}

export async function applyCallHangup(db: EdgeClient, params: ApplyCallHangupParams) {
  const workspaceId = ensureNonEmpty(params.workspaceId, 'workspaceId');
  const voiceCallId = ensureNonEmpty(params.voiceCallId, 'voiceCallId');
  const call = await getVoiceCallById(db, workspaceId, voiceCallId);
  const rawEndedAt = params.endedAt ? ensureIsoTimestamp(params.endedAt, 'endedAt') : NOW();
  const boundedEndedAt = call.answered_at ? maxIso(rawEndedAt, call.answered_at) : rawEndedAt;
  const nextEndedAt = call.ended_at ?? boundedEndedAt;

  if (call.status === 'ended' && call.ended_at === nextEndedAt) {
    return call;
  }

  return updateVoiceCall(
    db,
    workspaceId,
    voiceCallId,
    {
      ended_at: nextEndedAt,
      status: 'ended',
    },
    'applyCallHangup',
  );
}
