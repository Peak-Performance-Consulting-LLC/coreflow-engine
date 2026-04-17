import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import {
  createEdgeClients,
  resolveWorkspaceVoiceActorUserId,
  type EdgeClient,
} from '../_shared/server.ts';
import {
  answerCall,
  hangupCall,
  sanitizeTelnyxPayload,
  startGatherUsingAi,
  startNoiseSuppression,
  startRecording,
  startAIAssistant,
  TelnyxApiError,
} from '../_shared/telnyx-client.ts';
import {
  assertVerifiedTelnyxWebhook,
} from '../_shared/telnyx-signature.ts';
import {
  isPhase1HandledEvent,
  parseTelnyxWebhook,
} from '../_shared/telnyx-normalize.ts';
import {
  applyCallAnswered,
  applyCallGathering,
  applyCallHangup,
  applyGatherEnded,
  applyLeadCreated,
  applyLeadFailed,
  beginEventProcessing,
  findVoiceCallById,
  findWorkspacePhoneNumberById,
  findWorkspacePhoneNumberByE164,
  linkEventToVoiceCall,
  markWorkspacePhoneNumberWebhookObserved,
  markEventFailed,
  markEventIgnored,
  markEventProcessed,
  setVoiceCallRuntimeMode,
  updateVoiceCallAssistantContext,
  type VoiceCallRow,
  upsertVoiceCallBase,
} from '../_shared/voice-repository.ts';
import {
  buildVoiceAgentCallSnapshot,
} from '../_shared/voice-agent-mapper.ts';
import { buildVoiceProviderInstructions } from '../_shared/voice-agent-prompt.ts';
import {
  normalizeVoiceAgentLanguage,
  normalizeVoiceAgentTranscriptionModel,
  resolveDefaultVoiceAgentLanguage,
  resolveDefaultVoiceAgentTranscriptionModel,
} from '../_shared/voice-agent-transcription.ts';
import {
  getVoiceAgentRuntimeByPhoneNumberId,
  type VoiceAgentRuntimeConfig,
  type VoiceAgentRow,
} from '../_shared/voice-agent-repository.ts';
import { finalizeVoiceCallOutcome } from '../_shared/voice-outcome-finalizer.ts';
import { enqueueVoiceActionRunsForOutcome } from '../_shared/voice-action-repository.ts';
import { runVoiceAction } from '../_shared/voice-action-runner.ts';
import { buildLeadCreateInputFromVoiceCall } from '../_shared/voice-call-lead-recovery.ts';
import { createLeadFromVoiceCall } from '../_shared/voice-lead-create.ts';

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

const DEFAULT_ENABLE_NOISE_SUPPRESSION = parseBooleanEnv('TELNYX_DEFAULT_ENABLE_NOISE_SUPPRESSION', false);
const ENABLE_NOISE_SUPPRESSION = parseBooleanEnv('TELNYX_ENABLE_NOISE_SUPPRESSION', DEFAULT_ENABLE_NOISE_SUPPRESSION);
const ENABLE_RECORDING = parseBooleanEnv('TELNYX_ENABLE_RECORDING', false);
const RECORDING_CHANNELS = parseRecordingChannelsEnv('TELNYX_RECORDING_CHANNELS', 'dual');
const NOISE_SUPPRESSION_ENGINE = parseNoiseSuppressionEngineEnv('TELNYX_NOISE_SUPPRESSION_ENGINE', 'Denoiser');
const AI_USER_RESPONSE_TIMEOUT_MS = parseIntEnv('TELNYX_AI_USER_RESPONSE_TIMEOUT_MS', 1200);
const AI_SEND_PARTIAL_RESULTS = parseBooleanEnv('TELNYX_AI_SEND_PARTIAL_RESULTS', true);
const AI_ENABLE_BARGE_IN = parseBooleanEnv('TELNYX_AI_ENABLE_BARGE_IN', true);
const DEFAULT_GATHER_TRANSCRIPTION_MODEL = resolveDefaultVoiceAgentTranscriptionModel();
const DEFAULT_GATHER_LANGUAGE = resolveDefaultVoiceAgentLanguage();
const E164_REGEX = /^\+[1-9][0-9]{1,14}$/;

function ensureNonEmpty(value: string | null | undefined) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function isE164(value: string | null | undefined) {
  const normalized = ensureNonEmpty(value);
  return Boolean(normalized && E164_REGEX.test(normalized));
}

function parseBooleanEnv(name: string, fallback: boolean) {
  const raw = Deno.env.get(name)?.trim().toLowerCase();

  if (!raw) {
    return fallback;
  }

  if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on') {
    return true;
  }

  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') {
    return false;
  }

  return fallback;
}

function parseIntEnv(name: string, fallback: number) {
  const raw = Deno.env.get(name)?.trim();

  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return parsed;
}

function parseRecordingChannelsEnv(name: string, fallback: 'single' | 'dual') {
  const raw = Deno.env.get(name)?.trim().toLowerCase();
  return raw === 'single' || raw === 'dual' ? raw : fallback;
}

function parseNoiseSuppressionEngineEnv(
  name: string,
  fallback: 'Denoiser' | 'DeepFilterNet' | 'Krisp',
) {
  const raw = Deno.env.get(name)?.trim();

  if (raw === 'Denoiser' || raw === 'DeepFilterNet' || raw === 'Krisp') {
    return raw;
  }

  return fallback;
}


function resolveWebhookTraceId(request: Request) {
  return ensureNonEmpty(request.headers.get('x-request-id')) ??
    ensureNonEmpty(request.headers.get('traceparent')) ??
    ensureNonEmpty(request.headers.get('cf-ray')) ??
    null;
}

function buildTelnyxLogContext(params: {
  eventType: string;
  providerEventId: string | null;
  workspaceId: string;
  eventId: string | null;
  voiceCallId: string;
  callControlId: string;
  callSessionId: string | null;
  fromNumber: string | null;
  toNumber: string | null;
  requestTraceId: string | null;
  duplicateEvent: boolean;
}) {
  return {
    eventType: params.eventType,
    providerEventId: params.providerEventId,
    workspaceId: params.workspaceId,
    eventId: params.eventId,
    voiceCallId: params.voiceCallId,
    callControlId: params.callControlId,
    callSessionId: params.callSessionId,
    from: params.fromNumber,
    to: params.toNumber,
    requestTraceId: params.requestTraceId,
    duplicateEvent: params.duplicateEvent,
  };
}

function shouldSkipAnsweredStart(call: Pick<VoiceCallRow, 'status' | 'gather_status' | 'outcome_status'>) {
  if (call.status === 'gathering' || call.status === 'lead_created' || call.status === 'ended') {
    return true;
  }

  if (call.gather_status === 'in_progress' || call.gather_status === 'completed') {
    return true;
  }

  return Boolean(call.outcome_status);
}

function normalizeGatherVoice(value: string | null | undefined) {
  const normalized = ensureNonEmpty(value);

  if (!normalized) {
    return null;
  }

  if (normalized.includes('.')) {
    return normalized;
  }

  return `Telnyx.KokoroTTS.${normalized}`;
}

function normalizeGatherLanguage(value: string | null | undefined) {
  return normalizeVoiceAgentLanguage(value);
}

function normalizeGatherTranscriptionModel(value: string | null | undefined) {
  return normalizeVoiceAgentTranscriptionModel(value);
}

function buildGatherInterruptionSettings() {
  if (!AI_ENABLE_BARGE_IN) {
    return null;
  }

  // Telnyx supports interruption_settings on gather_using_ai, but schema keys
  // are provider-defined and may evolve. Keep this minimal and centralized so
  // it can be tuned safely without touching call orchestration flow.
  return {
    enabled: true,
  } as Record<string, unknown>;
}



function commandId(action: 'answer' | 'gather_start' | 'hangup', callControlId: string) {
  return `coreflow:voice:${action}:v1:${callControlId}`;
}

function assistantStartCommandId(
  callControlId: string,
  attempt: number,
) {
  return `coreflow:voice:assistant_start:v2:attempt:${attempt}:${callControlId}`;
}

function suppressionCommandId(callControlId: string) {
  return `coreflow:voice:suppression:v1:${callControlId}`;
}

function recordingCommandId(callControlId: string) {
  return `coreflow:voice:recording:v1:${callControlId}`;
}

function buildClientState(workspaceId: string, voiceCallId: string) {
  return btoa(JSON.stringify({ workspaceId, voiceCallId }));
}

function resolveAssistantId(agent?: Pick<VoiceAgentRow, 'telnyx_assistant_id'> | null) {
  const fromAgent = ensureNonEmpty(agent?.telnyx_assistant_id);
  const fromEnv = ensureNonEmpty(Deno.env.get('TELNYX_ASSISTANT_ID'));
  const candidate = fromEnv ?? fromAgent;

  if (!candidate) {
    return { assistantId: null, source: null as 'env' | 'agent' | null };
  }

  // Accept Telnyx UUID format (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
  // or the legacy `assistant-` prefixed ID format.
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidate);
  const isAssistantPrefixed = /^assistant-[a-zA-Z0-9-]{8,}$/.test(candidate);

  if (!isUuid && !isAssistantPrefixed) {
    return { assistantId: null, source: null as 'env' | 'agent' | null };
  }

  return { assistantId: candidate, source: candidate === fromEnv ? 'env' as const : 'agent' as const };
}

async function syncTelnyxResourceIdsFromEnv(params: {
  db: EdgeClient;
  workspaceId: string;
  workspacePhoneNumberId: string;
  voiceAgentId: string | null;
  currentAgentAssistantId: string | null;
  currentPhoneConnectionId: string | null;
  logContext: Record<string, unknown>;
}) {
  const envAssistantId = ensureNonEmpty(Deno.env.get('TELNYX_ASSISTANT_ID'));
  const envConnectionId = ensureNonEmpty(Deno.env.get('TELNYX_VOICE_CONNECTION_ID'));

  if (params.voiceAgentId && envAssistantId && envAssistantId !== ensureNonEmpty(params.currentAgentAssistantId)) {
    try {
      await params.db
        .from('voice_agents')
        .update({
          telnyx_assistant_id: envAssistantId,
          telnyx_sync_status: 'synced',
          telnyx_sync_error: null,
          telnyx_last_synced_at: new Date().toISOString(),
        })
        .eq('workspace_id', params.workspaceId)
        .eq('id', params.voiceAgentId);

      console.log('[telnyx-voice-webhook] synced voice_agent telnyx_assistant_id from env', {
        ...params.logContext,
        voiceAgentId: params.voiceAgentId,
        assistantIdSource: 'env',
      });
    } catch (error) {
      console.warn('[telnyx-voice-webhook] failed to sync voice_agent telnyx_assistant_id from env', {
        ...params.logContext,
        voiceAgentId: params.voiceAgentId,
        message: safeErrorMessage(error),
      });
    }
  }

  if (envConnectionId && envConnectionId !== ensureNonEmpty(params.currentPhoneConnectionId)) {
    try {
      await params.db
        .from('workspace_phone_numbers')
        .update({ telnyx_connection_id: envConnectionId })
        .eq('workspace_id', params.workspaceId)
        .eq('id', params.workspacePhoneNumberId);

      console.log('[telnyx-voice-webhook] synced workspace_phone_number telnyx_connection_id from env', {
        ...params.logContext,
        workspacePhoneNumberId: params.workspacePhoneNumberId,
      });
    } catch (error) {
      console.warn('[telnyx-voice-webhook] failed to sync workspace_phone_number telnyx_connection_id from env', {
        ...params.logContext,
        workspacePhoneNumberId: params.workspacePhoneNumberId,
        message: safeErrorMessage(error),
      });
    }
  }
}

function safeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unexpected error.';
}

function isMissingRequiredCrmFieldsError(error: unknown) {
  const message = safeErrorMessage(error);
  return message.startsWith('Missing required CRM fields for lead creation:');
}

function isTelnyxInvalidRequestError(error: unknown): error is TelnyxApiError {
  if (!(error instanceof TelnyxApiError)) {
    return false;
  }

  return error.status === 400 || error.status === 422;
}

function buildGatherSchemaFromMappings(mappings: VoiceAgentRuntimeConfig['mappings'] | undefined) {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  const safeMappings = Array.isArray(mappings) ? mappings : [];

  for (const mapping of safeMappings) {
    const sourceKey = ensureNonEmpty(mapping?.source_key);

    if (!sourceKey || properties[sourceKey]) {
      continue;
    }

    const valueType = ensureNonEmpty(mapping?.source_value_type)?.toLowerCase();
    const type = valueType === 'number' || valueType === 'boolean' || valueType === 'array' ? valueType : 'string';
    const description = ensureNonEmpty(mapping?.source_description) ?? ensureNonEmpty(mapping?.source_label) ?? sourceKey;
    properties[sourceKey] = {
      type,
      description,
    };

    if (mapping?.is_required) {
      required.push(sourceKey);
    }
  }

  return {
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  } as Record<string, unknown>;
}

function normalizeRequiredFieldToken(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

function extractRequiredFieldHints(parametersSchema: Record<string, unknown>) {
  const requiredRaw = Array.isArray(parametersSchema.required) ? parametersSchema.required : [];
  const properties = typeof parametersSchema.properties === 'object' && parametersSchema.properties !== null
    ? parametersSchema.properties as Record<string, unknown>
    : {};
  const requiredKeys = requiredRaw
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean);

  const requiredFields = requiredKeys.map((key) => {
    const property = properties[key];
    const description = typeof property === 'object' && property !== null && typeof (property as Record<string, unknown>).description === 'string'
      ? ((property as Record<string, unknown>).description as string).trim()
      : '';

    return {
      key,
      normalized: normalizeRequiredFieldToken(key),
      description,
    };
  });

  return {
    requiredFields,
    hasName: requiredFields.some((field) => /name/.test(field.normalized)),
    hasEmail: requiredFields.some((field) => /email/.test(field.normalized)),
    hasPreferredLocation: requiredFields.some((field) => /location|area|city|region/.test(field.normalized)),
    hasPropertyType: requiredFields.some((field) => /property.*type|property_type|home_type|house_type|requirement_type/.test(field.normalized)),
  };
}

function buildRequiredFieldCollectionInstructions(parametersSchema: Record<string, unknown>) {
  const hints = extractRequiredFieldHints(parametersSchema);

  if (hints.requiredFields.length === 0) {
    return null;
  }

  const requiredChecklist = hints.requiredFields
    .map((field) => `- ${field.key}${field.description ? `: ${field.description}` : ''}`)
    .join('\n');

  const criticalFields = [
    hints.hasName ? 'full name' : null,
    hints.hasEmail ? 'email' : null,
    hints.hasPreferredLocation ? 'preferred location' : null,
    hints.hasPropertyType ? 'property type' : null,
  ].filter((entry): entry is string => Boolean(entry));

  const criticalLine = criticalFields.length > 0
    ? `Critical fields to complete before ending: ${criticalFields.join(', ')}.`
    : null;

  const emailLine = hints.hasEmail
    ? 'For email, ask the caller to spell it once and read it back once for confirmation.'
    : null;

  return [
    'Field completion rules:',
    '- Collect every required field in the schema.',
    '- Ask one missing field at a time and wait for a clear answer.',
    '- If a value is unclear, ask one short clarification question.',
    '- Do not end the conversation until all required fields are captured.',
    ...(criticalLine ? [criticalLine] : []),
    ...(emailLine ? [emailLine] : []),
    'Required fields:',
    requiredChecklist,
  ].join('\n');
}

interface RequiredCrmFieldHint {
  field_key: string;
  label: string;
}

async function listActiveRequiredRecordFields(
  db: EdgeClient,
  workspaceId: string,
): Promise<RequiredCrmFieldHint[]> {
  const { data, error } = await db
    .from('custom_field_definitions')
    .select('field_key, label, is_required')
    .eq('workspace_id', workspaceId)
    .eq('entity_type', 'record')
    .eq('is_active', true)
    .eq('is_required', true);

  if (error) {
    throw new Error(error.message);
  }

  return (Array.isArray(data) ? data : [])
    .map((entry) => ({
      field_key: ensureNonEmpty(entry?.field_key),
      label: ensureNonEmpty(entry?.label) ?? ensureNonEmpty(entry?.field_key) ?? 'Required field',
    }))
    .filter((entry) => Boolean(entry.field_key));
}

function buildCrmRequiredFieldInstructions(requiredFields: RequiredCrmFieldHint[]) {
  if (!Array.isArray(requiredFields) || requiredFields.length === 0) {
    return null;
  }

  const normalized = requiredFields.map((field) => ({
    fieldKey: normalizeRequiredFieldToken(field.field_key),
    label: field.label,
  }));
  const hasName = normalized.some((field) => /name/.test(field.fieldKey));
  const hasEmail = normalized.some((field) => /email/.test(field.fieldKey));
  const hasPreferredLocation = normalized.some((field) => /location|area|city|region/.test(field.fieldKey));
  const hasPropertyType = normalized.some((field) => /property.*type|property_type|home_type|house_type|requirement_type/.test(field.fieldKey));
  const requiredChecklist = requiredFields.map((field) => `- ${field.label}`).join('\n');
  const criticalFields = [
    hasName ? 'full name' : null,
    hasEmail ? 'email' : null,
    hasPreferredLocation ? 'preferred location' : null,
    hasPropertyType ? 'property type' : null,
  ].filter((entry): entry is string => Boolean(entry));

  return [
    'CRM-required field rules:',
    '- These fields are required by CRM and must be collected before ending.',
    '- Ask for any missing required field one-by-one.',
    ...(criticalFields.length > 0
      ? [`Critical CRM fields to confirm: ${criticalFields.join(', ')}.`]
      : []),
    'CRM required fields:',
    requiredChecklist,
  ].join('\n');
}

function isTelnyxCallAlreadyEndedError(error: unknown) {
  if (!(error instanceof TelnyxApiError) || error.status !== 422) {
    return false;
  }

  const responseBody = error.responseBody;

  if (typeof responseBody !== 'object' || responseBody === null || !('errors' in responseBody)) {
    return false;
  }

  const errors = (responseBody as { errors?: unknown }).errors;

  if (!Array.isArray(errors)) {
    return false;
  }

  return errors.some((entry) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      return false;
    }

    const code = typeof entry.code === 'string' ? entry.code : '';
    const title = typeof entry.title === 'string' ? entry.title.toLowerCase() : '';
    const detail = typeof entry.detail === 'string' ? entry.detail.toLowerCase() : '';

    return code === '90018' || title.includes('call has already ended') || detail.includes("can't receive commands");
  });
}

function isRetryableAssistantStartError(error: unknown) {
  if (error instanceof TelnyxApiError) {
    if (error.status >= 500) {
      return true;
    }

    return error.status === 408 || error.status === 409 || error.status === 422 || error.status === 429;
  }

  return isRetryableInternalError(error);
}



function isRetryableInternalError(error: unknown) {
  if (error instanceof TelnyxApiError) {
    if (error.status >= 500 || error.status === 408 || error.status === 429) {
      return true;
    }

    return false;
  }

  if (!(error instanceof Error)) {
    return true;
  }

  if (error.name.includes('Signature')) {
    return false;
  }

  if (error.name.includes('Validation')) {
    return false;
  }

  return true;
}

function toJsonValue(value: unknown): JsonValue | null {
  if (value === null || value === undefined) {
    return null;
  }

  try {
    return JSON.parse(JSON.stringify(value)) as JsonValue;
  } catch {
    return null;
  }
}

function summarizeMessageHistory(messageHistory: unknown[] | null) {
  const summary = {
    total: 0,
    assistant: 0,
    user: 0,
    other: 0,
  };

  if (!Array.isArray(messageHistory)) {
    return summary;
  }

  for (const entry of messageHistory) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      summary.other += 1;
      continue;
    }

    summary.total += 1;
    const role = typeof entry.role === 'string' ? entry.role.trim().toLowerCase() : '';

    if (role === 'assistant') {
      summary.assistant += 1;
      continue;
    }

    if (role === 'user') {
      summary.user += 1;
      continue;
    }

    summary.other += 1;
  }

  return summary;
}

async function findExistingVoiceCallByControlId(
  db: EdgeClient,
  workspaceId: string,
  callControlId: string,
) {
  const { data, error } = await db
    .from('voice_calls')
    .select('id, from_number_e164, lead_creation_status')
    .eq('workspace_id', workspaceId)
    .eq('provider', 'telnyx')
    .eq('provider_call_control_id', callControlId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as { id: string; from_number_e164: string; lead_creation_status: string } | null;
}

async function findExistingVoiceCallByControlIdGlobal(
  db: EdgeClient,
  callControlId: string,
) {
  const { data, error } = await db
    .from('voice_calls')
    .select('id, workspace_id, workspace_phone_number_id, from_number_e164, to_number_e164, lead_creation_status')
    .eq('provider', 'telnyx')
    .eq('provider_call_control_id', callControlId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as {
    id: string;
    workspace_id: string;
    workspace_phone_number_id: string;
    provider_call_control_id: string;
    from_number_e164: string;
    to_number_e164: string;
    lead_creation_status: string;
  } | null;
}

async function findExistingVoiceCallBySessionIdGlobal(
  db: EdgeClient,
  callSessionId: string,
) {
  const { data, error } = await db
    .from('voice_calls')
    .select('id, workspace_id, workspace_phone_number_id, provider_call_control_id, from_number_e164, to_number_e164, lead_creation_status')
    .eq('provider', 'telnyx')
    .eq('provider_call_session_id', callSessionId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as {
    id: string;
    workspace_id: string;
    workspace_phone_number_id: string;
    provider_call_control_id: string;
    from_number_e164: string;
    to_number_e164: string;
    lead_creation_status: string;
  } | null;
}

async function tryCreateLeadSync(
  db: EdgeClient,
  workspaceId: string,
  voiceCall: VoiceCallRow,
  logContext: any
) {
  const currentCall = await findVoiceCallById(db, workspaceId, voiceCall.id);

  if (
    currentCall.record_id ||
    currentCall.lead_creation_status === 'created' ||
    currentCall.lead_creation_status === 'failed'
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
      mappedInput: leadCreateInput,
    });

    await applyLeadCreated(db, {
      workspaceId,
      voiceCallId: currentCall.id,
      recordId: created.recordId,
      leadCreatedAt: new Date().toISOString(),
    });

    console.log('[telnyx-voice-webhook] sync lead creation successful', {
      ...logContext,
      voiceCallId: currentCall.id,
      recordId: created.recordId,
    });

    return findVoiceCallById(db, workspaceId, currentCall.id);
  } catch (error) {
    const errorMessage = safeErrorMessage(error);
    console.error('[telnyx-voice-webhook] sync lead creation failed', {
      ...logContext,
      voiceCallId: currentCall.id,
      error: errorMessage,
    });

    if (isMissingRequiredCrmFieldsError(error)) {
      await db
        .from('voice_calls')
        .update({
          outcome_status: 'mapping_failed',
          outcome_reason: 'missing_required_crm_fields',
          outcome_error: errorMessage,
          review_status: 'open',
          review_reason: 'missing_required_crm_fields',
        })
        .eq('workspace_id', workspaceId)
        .eq('id', currentCall.id);
    } else {
      await applyLeadFailed(db, {
        workspaceId,
        voiceCallId: currentCall.id,
        errorMessage,
      });
    }

    return findVoiceCallById(db, workspaceId, currentCall.id);
  }
}

function deriveSyncOutcomeStatus(call: VoiceCallRow | null | undefined) {
  if (call?.outcome_status === 'mapping_failed') {
    return 'mapping_failed' as const;
  }

  if (call?.record_id || call?.lead_creation_status === 'created') {
    return 'lead_created' as const;
  }

  if (call?.lead_creation_status === 'failed') {
    return 'crm_failed' as const;
  }

  return null;
}

function deriveSyncOutcomeReason(call: VoiceCallRow | null | undefined, pendingReason: string) {
  const outcomeStatus = deriveSyncOutcomeStatus(call);

  if (outcomeStatus === 'lead_created') {
    return 'lead_created';
  }

  if (outcomeStatus === 'mapping_failed') {
    return 'missing_required_crm_fields';
  }

  if (outcomeStatus === 'crm_failed') {
    return 'crm_write_failed';
  }

  return pendingReason;
}

async function finalizeAndTriggerActions(params: {
  db: EdgeClient;
  workspaceId: string;
  voiceCallId: string;
  outcomeStatus: 'lead_created' | 'crm_failed' | 'gather_incomplete' | 'mapping_failed' | 'ended_without_lead' | 'review_needed';
  outcomeReason?: string | null;
  outcomeError?: string | null;
}) {
  const call = await finalizeVoiceCallOutcome({
    db: params.db,
    workspaceId: params.workspaceId,
    voiceCallId: params.voiceCallId,
    outcomeStatus: params.outcomeStatus,
    outcomeReason: params.outcomeReason,
    outcomeError: params.outcomeError,
  });
  const runs = await enqueueVoiceActionRunsForOutcome({
    db: params.db,
    call,
    outcomeStatus: call.outcome_status ?? params.outcomeStatus,
    outcomeReason: call.outcome_reason,
    outcomeError: call.outcome_error,
  });

  if (runs.length > 0) {
    const actorUserId = await resolveWorkspaceVoiceActorUserId(params.db, params.workspaceId);

    for (const run of runs) {
      await runVoiceAction({
        db: params.db,
        workspaceId: params.workspaceId,
        actionRunId: run.id,
        actorUserId,
      });
    }
  }

  return findVoiceCallById(params.db, params.workspaceId, params.voiceCallId);
}

async function startInboundNoiseSuppressionForCall(params: {
  workspaceId: string;
  voiceCallId: string;
  callControlId: string;
  logContext: Record<string, unknown>;
}) {
  if (!ENABLE_NOISE_SUPPRESSION) {
    console.log('[telnyx-voice-webhook] noise suppression skipped (disabled)', {
      ...params.logContext,
      workspaceId: params.workspaceId,
      voiceCallId: params.voiceCallId,
      callControlId: params.callControlId,
      enableNoiseSuppression: ENABLE_NOISE_SUPPRESSION,
      defaultEnableNoiseSuppression: DEFAULT_ENABLE_NOISE_SUPPRESSION,
      noiseSuppressionEngine: NOISE_SUPPRESSION_ENGINE,
    });
    return;
  }

  try {
    const suppressionResult = await startNoiseSuppression({
      callControlId: params.callControlId,
      commandId: suppressionCommandId(params.callControlId),
      clientState: buildClientState(params.workspaceId, params.voiceCallId),
      direction: 'inbound',
      noiseSuppressionEngine: NOISE_SUPPRESSION_ENGINE,
      logContext: params.logContext,
    });
    console.log('[telnyx-voice-webhook] noise suppression started', {
      ...params.logContext,
      workspaceId: params.workspaceId,
      voiceCallId: params.voiceCallId,
      callControlId: params.callControlId,
      commandId: suppressionResult.commandId,
      status: suppressionResult.status,
      enableNoiseSuppression: ENABLE_NOISE_SUPPRESSION,
      noiseSuppressionEngine: NOISE_SUPPRESSION_ENGINE,
    });
  } catch (error) {
    console.warn('[telnyx-voice-webhook] noise suppression start failed', {
      ...params.logContext,
      workspaceId: params.workspaceId,
      voiceCallId: params.voiceCallId,
      callControlId: params.callControlId,
      message: safeErrorMessage(error),
      enableNoiseSuppression: ENABLE_NOISE_SUPPRESSION,
      noiseSuppressionEngine: NOISE_SUPPRESSION_ENGINE,
      telnyxStatus: error instanceof TelnyxApiError ? error.status : null,
      telnyxResponseBody: error instanceof TelnyxApiError ? error.responseBody : null,
      telnyxRequestPayload: error instanceof TelnyxApiError ? error.requestBody : null,
    });
  }
}

async function startMinimalAssistant(params: {
  callControlId: string;
  assistantId: string;
  logContext: Record<string, unknown>;
}) {
  // Keep ai_assistant_start payload minimal to avoid schema drift and invalid
  // optional fields. Command id/client state are omitted intentionally.
  const assistantStartPayload = sanitizeTelnyxPayload({
    assistant_id: params.assistantId,
  });

  console.log('[telnyx-voice-webhook] assistant start request', {
    ...params.logContext,
    payload: assistantStartPayload,
  });

  return startAIAssistant({
    callControlId: params.callControlId,
    assistantId: params.assistantId,
    logContext: {
      ...params.logContext,
      payload: assistantStartPayload,
    },
  });
}

async function startGatherFallback(params: {
  workspaceId: string;
  voiceCallId: string;
  callControlId: string;
  runtimeConfig: VoiceAgentRuntimeConfig | null;
  crmRequiredFieldInstructions?: string | null;
  logContext: Record<string, unknown>;
  fallbackReason: string;
}) {
  const greeting = ensureNonEmpty(params.runtimeConfig?.agent?.greeting);
  const model = ensureNonEmpty(params.runtimeConfig?.agent?.telnyx_model);
  const normalizedSystemPrompt = ensureNonEmpty(params.runtimeConfig?.agent?.system_prompt);
  const parametersSchema = buildGatherSchemaFromMappings(params.runtimeConfig?.mappings);
  const requiredFieldInstructions = buildRequiredFieldCollectionInstructions(parametersSchema);
  const combinedRequiredFieldInstructions = [
    requiredFieldInstructions,
    params.crmRequiredFieldInstructions ?? null,
  ].filter((entry): entry is string => Boolean(entry)).join('\n\n');
  const providerBaseInstructions = normalizedSystemPrompt ? buildVoiceProviderInstructions(normalizedSystemPrompt) : null;
  const instructions = providerBaseInstructions
    ? [providerBaseInstructions, combinedRequiredFieldInstructions].filter(Boolean).join('\n\n')
    : (combinedRequiredFieldInstructions || null);
  const voice = normalizeGatherVoice(params.runtimeConfig?.agent?.telnyx_voice);
  const agentLanguage = normalizeGatherLanguage(params.runtimeConfig?.agent?.telnyx_language);
  const language = agentLanguage ?? DEFAULT_GATHER_LANGUAGE;
  const agentTranscriptionModel = normalizeGatherTranscriptionModel(params.runtimeConfig?.agent?.telnyx_transcription_model);
  const transcriptionModel = agentTranscriptionModel ?? DEFAULT_GATHER_TRANSCRIPTION_MODEL;
  const interruptionSettings = buildGatherInterruptionSettings();
  const hasRawAgentLanguage = Boolean(ensureNonEmpty(params.runtimeConfig?.agent?.telnyx_language));
  const hasRawAgentTranscriptionModel = Boolean(ensureNonEmpty(params.runtimeConfig?.agent?.telnyx_transcription_model));
  const usedLanguageFallback = !agentLanguage && hasRawAgentLanguage;
  const usedTranscriptionModelFallback = !agentTranscriptionModel && hasRawAgentTranscriptionModel;
  const gatherSettingsSummary = {
    userResponseTimeoutMs: AI_USER_RESPONSE_TIMEOUT_MS,
    sendPartialResults: AI_SEND_PARTIAL_RESULTS,
    sendMessageHistoryUpdates: true,
    bargeInEnabled: Boolean(interruptionSettings),
    effectiveLanguage: language,
    effectiveTranscriptionModel: transcriptionModel,
    usedLanguageFallback,
    usedTranscriptionModelFallback,
  };

  console.log('[telnyx-voice-webhook] gather fallback request', {
    ...params.logContext,
    fallbackReason: params.fallbackReason,
    gatherSettings: gatherSettingsSummary,
    hasModel: Boolean(model),
    hasInstructions: Boolean(instructions),
    providerInstructionLength: instructions?.length ?? 0,
    hasVoice: Boolean(voice),
    schemaPropertyCount: Object.keys(parametersSchema.properties ?? {}).length,
    requiredFieldCount: Array.isArray(parametersSchema.required) ? parametersSchema.required.length : 0,
  });

  const baseGatherParams = {
    callControlId: params.callControlId,
    commandId: commandId('gather_start', params.callControlId),
    clientState: buildClientState(params.workspaceId, params.voiceCallId),
    ...(greeting ? { greeting } : {}),
    parametersSchema,
    ...(model || instructions
      ? {
        assistant: {
          ...(model ? { model } : {}),
          ...(instructions ? { instructions } : {}),
        },
      }
      : {}),
    ...(voice ? { voice } : {}),
    ...(language ? { language } : {}),
    ...((transcriptionModel || language)
      ? {
        transcription: {
          ...(transcriptionModel ? { model: transcriptionModel } : {}),
          ...(language ? { language } : {}),
        },
      }
      : {}),
    userResponseTimeoutMs: AI_USER_RESPONSE_TIMEOUT_MS,
    sendPartialResults: AI_SEND_PARTIAL_RESULTS,
    sendMessageHistoryUpdates: true,
    logContext: {
      ...params.logContext,
      fallbackReason: params.fallbackReason,
      gatherSettings: gatherSettingsSummary,
    },
  };

  let gatherResult;

  try {
    gatherResult = await startGatherUsingAi({
      ...baseGatherParams,
      ...(interruptionSettings ? { interruptionSettings } : {}),
    });
  } catch (error) {
    if (isTelnyxInvalidRequestError(error) && interruptionSettings) {
      console.warn('[telnyx-voice-webhook] gather fallback retrying without interruption_settings', {
        ...params.logContext,
        fallbackReason: params.fallbackReason,
        message: safeErrorMessage(error),
        telnyxStatus: error.status,
      });

      gatherResult = await startGatherUsingAi(baseGatherParams);
    } else {
      throw error;
    }
  }

  console.log('[telnyx-voice-webhook] gather_using_ai fallback started', {
    ...params.logContext,
    workspaceId: params.workspaceId,
    voiceCallId: params.voiceCallId,
    callControlId: params.callControlId,
    commandId: gatherResult.commandId,
    status: gatherResult.status,
    fallbackReason: params.fallbackReason,
    gatherSettings: gatherSettingsSummary,
  });

  return gatherResult;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  const clients = createEdgeClients(request);

  if ('errorResponse' in clients) {
    return clients.errorResponse;
  }

  const db = clients.serviceClient;
  const requestTraceId = resolveWebhookTraceId(request);

  let normalizedEvent: ReturnType<typeof parseTelnyxWebhook> | null = null;
  let workspaceId: string | null = null;
  let eventId: string | null = null;

  try {
    const verified = await assertVerifiedTelnyxWebhook(request, {
      TELNYX_PUBLIC_KEY: Deno.env.get('TELNYX_PUBLIC_KEY'),
      TELNYX_SIGNATURE_MAX_SKEW_SECONDS: Deno.env.get('TELNYX_SIGNATURE_MAX_SKEW_SECONDS'),
    });

    let rawJson: unknown;

    try {
      rawJson = JSON.parse(verified.rawBodyText);
    } catch {
      return jsonResponse({
        ok: true,
        ignored: true,
        reason: 'invalid_json_payload',
      }, 200);
    }

    try {
      normalizedEvent = parseTelnyxWebhook(rawJson);
    } catch {
      return jsonResponse({
        ok: true,
        ignored: true,
        reason: 'malformed_webhook_payload',
      }, 200);
    }

    console.log('[telnyx-voice-webhook] received event', {
      requestTraceId,
      eventType: normalizedEvent.eventType,
      providerEventId: normalizedEvent.providerEventId,
      occurredAt: normalizedEvent.occurredAt,
      callControlId: normalizedEvent.callControlId,
      callSessionId: normalizedEvent.callSessionId,
      fromNumber: normalizedEvent.fromNumberE164,
      toNumber: normalizedEvent.toNumberE164,
    });

    if (!isPhase1HandledEvent(normalizedEvent.eventType)) {
      return jsonResponse({
        ok: true,
        ignored: true,
        reason: 'unhandled_event_type',
        event_type: normalizedEvent.eventType,
      }, 200);
    }

    const callControlIdFromEvent = ensureNonEmpty(normalizedEvent.callControlId);
    const callSessionIdFromEvent = ensureNonEmpty(normalizedEvent.callSessionId);
    let existingCallGlobal: Awaited<ReturnType<typeof findExistingVoiceCallByControlIdGlobal>> = null;
    let callControlId = callControlIdFromEvent;

    if (!callControlId && callSessionIdFromEvent) {
      existingCallGlobal = await findExistingVoiceCallBySessionIdGlobal(db, callSessionIdFromEvent);
      callControlId = ensureNonEmpty(existingCallGlobal?.provider_call_control_id);

      if (callControlId) {
        console.log('[telnyx-voice-webhook] resolved missing call_control_id from call_session_id', {
          requestTraceId,
          eventType: normalizedEvent.eventType,
          providerEventId: normalizedEvent.providerEventId,
          callSessionId: callSessionIdFromEvent,
          resolvedCallControlId: callControlId,
        });
      }
    }

    if (!callControlId) {
      return jsonResponse({
        ok: true,
        ignored: true,
        reason: 'missing_call_control_id',
      }, 200);
    }

    const toNumberCandidate = ensureNonEmpty(normalizedEvent.toNumberE164);
    const toNumber = isE164(toNumberCandidate) ? toNumberCandidate : null;
    let workspacePhoneNumber = toNumber ? await findWorkspacePhoneNumberByE164(db, toNumber) : null;
    if (!workspacePhoneNumber) {
      existingCallGlobal = existingCallGlobal ?? await findExistingVoiceCallByControlIdGlobal(db, callControlId);

      if (existingCallGlobal) {
        const existingWorkspaceId = ensureNonEmpty(existingCallGlobal.workspace_id);
        const existingWorkspacePhoneNumberId = ensureNonEmpty(existingCallGlobal.workspace_phone_number_id);

        if (existingWorkspaceId && existingWorkspacePhoneNumberId) {
          try {
            workspacePhoneNumber = await findWorkspacePhoneNumberById(
              db,
              existingWorkspaceId,
              existingWorkspacePhoneNumberId,
            );
          } catch {
            workspacePhoneNumber = null;
          }
        }
      }
    }

    if (!workspacePhoneNumber) {
      return jsonResponse({
        ok: true,
        ignored: true,
        reason: toNumberCandidate ? 'unknown_phone_number' : 'missing_or_non_e164_to_number',
      }, 200);
    }

    const resolvedWorkspaceId = ensureNonEmpty(workspacePhoneNumber.workspace_id);

    if (!resolvedWorkspaceId) {
      return jsonResponse({
        ok: true,
        ignored: true,
        reason: 'workspace_phone_number_missing_workspace_id',
      }, 200);
    }

    workspaceId = resolvedWorkspaceId;
    const resolvedToNumber = toNumber ?? ensureNonEmpty(existingCallGlobal?.to_number_e164);

    if (!resolvedToNumber || !isE164(resolvedToNumber)) {
      return jsonResponse({
        ok: true,
        ignored: true,
        reason: 'unable_to_resolve_e164_to_number',
      }, 200);
    }

    await markWorkspacePhoneNumberWebhookObserved(db, {
      workspaceId,
      voiceNumberId: workspacePhoneNumber.id,
      observedAt: normalizedEvent.occurredAt,
    });

    const providerEventId = ensureNonEmpty(normalizedEvent.providerEventId);
    const occurredAt = ensureNonEmpty(normalizedEvent.occurredAt);

    if (!providerEventId || !occurredAt || !callControlId) {
      return jsonResponse({
        ok: true,
        ignored: true,
        reason: 'missing_required_event_fields',
      }, 200);
    }

    const eventGate = await beginEventProcessing(db, {
      workspaceId,
      providerEventId,
      eventType: normalizedEvent.eventType,
      occurredAt,
      payload: normalizedEvent.rawPayload,
      signatureValid: true,
      provider: 'telnyx',
    });

    eventId = eventGate.event.id;

    if (!eventGate.shouldProcess) {
      console.log('[telnyx-voice-webhook] duplicate event ignored', {
        requestTraceId,
        eventType: normalizedEvent.eventType,
        providerEventId,
        callControlId,
        callSessionId: normalizedEvent.callSessionId,
        fromNumber: normalizedEvent.fromNumberE164,
        toNumber: resolvedToNumber,
        duplicateEvent: true,
      });
      return jsonResponse({
        ok: true,
        duplicate: true,
        reason: 'event_already_processed',
      }, 200);
    }

    console.log('[telnyx-voice-webhook] event accepted for processing', {
      requestTraceId,
      eventType: normalizedEvent.eventType,
      providerEventId,
      eventId,
      callControlId,
      callSessionId: normalizedEvent.callSessionId,
      fromNumber: normalizedEvent.fromNumberE164,
      toNumber: resolvedToNumber,
      duplicateEvent: false,
    });

    const initialStatus = normalizedEvent.eventType === 'call.initiated'
      ? 'initiated'
      : normalizedEvent.eventType === 'call.answered'
        ? 'answered'
        : normalizedEvent.eventType === 'call.ai_gather.ended' ||
            normalizedEvent.eventType === 'call.gather.ended' ||
            normalizedEvent.eventType === 'call.conversation.ended' ||
            normalizedEvent.eventType === 'call.analyzed'
          ? 'gathering'
          : 'ended';

    const existingCall = await findExistingVoiceCallByControlId(db, workspaceId, callControlId);
    const fromNumber = ensureNonEmpty(normalizedEvent.fromNumberE164) ?? existingCall?.from_number_e164 ?? null;

    if (!fromNumber) {
      await markEventFailed(db, {
        workspaceId,
        eventId,
        errorMessage: 'Missing from_number_e164 for call upsert.',
      });

      return jsonResponse({
        ok: true,
        failed: true,
        reason: 'missing_from_number_e164_for_call_upsert',
      }, 200);
    }

    const call = await upsertVoiceCallBase(db, {
      workspaceId,
      workspacePhoneNumberId: workspacePhoneNumber.id,
      provider: 'telnyx',
      direction: 'inbound',
      providerCallControlId: callControlId,
      providerCallLegId: normalizedEvent.callLegId,
      providerCallSessionId: normalizedEvent.callSessionId,
      providerConnectionId: normalizedEvent.connectionId,
      fromNumberE164: fromNumber,
      toNumberE164: resolvedToNumber,
      status: initialStatus,
    });

    await linkEventToVoiceCall(db, {
      workspaceId,
      eventId,
      voiceCallId: call.id,
    });

    const telnyxLogContext = buildTelnyxLogContext({
      eventType: normalizedEvent.eventType,
      providerEventId,
      workspaceId,
      eventId,
      voiceCallId: call.id,
      callControlId: call.provider_call_control_id,
      callSessionId: normalizedEvent.callSessionId,
      fromNumber,
      toNumber: resolvedToNumber,
      requestTraceId,
      duplicateEvent: false,
    });

    if (normalizedEvent.eventType === 'call.initiated') {
      console.log('[telnyx-voice-webhook] about to answer call', {
        ...telnyxLogContext,
      });
      await answerCall({
        callControlId: call.provider_call_control_id,
        commandId: commandId('answer', call.provider_call_control_id),
        clientState: buildClientState(workspaceId, call.id),
        logContext: telnyxLogContext,
      });
      await markEventProcessed(db, { workspaceId, eventId });
      return jsonResponse({ ok: true, handled: normalizedEvent.eventType }, 200);
    }

    if (normalizedEvent.eventType === 'call.answered') {
      const answeredProcessingStartedAt = performance.now();
      console.log('[telnyx-voice-webhook] call.answered startup begin', {
        ...telnyxLogContext,
        workspaceId,
        voiceCallId: call.id,
        callControlId: call.provider_call_control_id,
      });

      const answeredCall = await applyCallAnswered(db, {
        workspaceId,
        voiceCallId: call.id,
        answeredAt: occurredAt,
      });

      if (shouldSkipAnsweredStart(answeredCall)) {
        console.log('[telnyx-voice-webhook] call.answered command flow skipped (already progressed)', {
          ...telnyxLogContext,
          duplicateEvent: true,
          status: answeredCall.status,
          gatherStatus: answeredCall.gather_status,
          outcomeStatus: answeredCall.outcome_status,
        });
        await markEventProcessed(db, { workspaceId, eventId });
        return jsonResponse({
          ok: true,
          handled: normalizedEvent.eventType,
          duplicate: true,
          reason: 'call_answered_already_progressed',
        }, 200);
      }

      const runtimeConfig = await getVoiceAgentRuntimeByPhoneNumberId(
        db,
        workspaceId,
        workspacePhoneNumber.id,
      );
      const requiredCrmFields = await listActiveRequiredRecordFields(db, workspaceId);
      const crmRequiredFieldInstructions = buildCrmRequiredFieldInstructions(requiredCrmFields);

      const assistantResolution = resolveAssistantId(runtimeConfig?.agent);
      const assistantId = assistantResolution.assistantId;

      console.log('[telnyx-voice-webhook] resolved assistant id for call', {
        ...telnyxLogContext,
        assistantIdSource: assistantResolution.source,
        hasAssistantId: Boolean(assistantId),
      });

      console.log('[telnyx-voice-webhook] using gather fallback (gather_using_ai) instead of assistant per config', {
        ...telnyxLogContext,
        workspaceId,
        voiceCallId: call.id,
        callControlId: call.provider_call_control_id,
        runtimeVoiceAgentId: runtimeConfig?.agent.id ?? null,
        configuredAssistantId: runtimeConfig?.agent.telnyx_assistant_id ?? null,
      });

      console.log('[telnyx-voice-webhook] call.answered gather start pending', {
        ...telnyxLogContext,
        workspaceId,
        voiceCallId: call.id,
        callControlId: call.provider_call_control_id,
        startupElapsedMs: Math.round(performance.now() - answeredProcessingStartedAt),
      });

      await startGatherFallback({
        workspaceId,
        voiceCallId: call.id,
        callControlId: call.provider_call_control_id,
        runtimeConfig,
        crmRequiredFieldInstructions,
        logContext: telnyxLogContext,
        fallbackReason: 'assistant_disabled_by_user',
      });

      console.log('[telnyx-voice-webhook] call.answered gather started', {
        ...telnyxLogContext,
        workspaceId,
        voiceCallId: call.id,
        callControlId: call.provider_call_control_id,
        startupElapsedMs: Math.round(performance.now() - answeredProcessingStartedAt),
      });

      await applyCallGathering(db, {
        workspaceId,
        voiceCallId: call.id,
      });

      const postGatherSetupStartedAt = performance.now();

      await setVoiceCallRuntimeMode(db, {
        workspaceId,
        voiceCallId: call.id,
        runtimeMode: 'phase1_fallback',
      });

      if (runtimeConfig) {
        const snapshot = buildVoiceAgentCallSnapshot(runtimeConfig);
        await updateVoiceCallAssistantContext(db, {
          workspaceId,
          voiceCallId: call.id,
          voiceAgentId: runtimeConfig.agent.id,
          voiceAgentBindingId: runtimeConfig.binding.id,
          assistantMappingSnapshot: snapshot,
        });
      } else {
        await updateVoiceCallAssistantContext(db, {
          workspaceId,
          voiceCallId: call.id,
          voiceAgentId: null,
          voiceAgentBindingId: null,
          assistantMappingSnapshot: null,
        });
      }

      if (ENABLE_RECORDING) {
        try {
          const recordingResult = await startRecording({
            callControlId: call.provider_call_control_id,
            commandId: recordingCommandId(call.provider_call_control_id),
            clientState: buildClientState(workspaceId, call.id),
            format: 'wav',
            channels: RECORDING_CHANNELS,
            playBeep: false,
            logContext: telnyxLogContext,
          });
          console.log('[telnyx-voice-webhook] recording started', {
            ...telnyxLogContext,
            workspaceId,
            voiceCallId: call.id,
            callControlId: call.provider_call_control_id,
            commandId: recordingResult.commandId,
            status: recordingResult.status,
          });
        } catch (error) {
          console.warn('[telnyx-voice-webhook] recording start failed', {
            ...telnyxLogContext,
            workspaceId,
            voiceCallId: call.id,
            callControlId: call.provider_call_control_id,
            message: safeErrorMessage(error),
            telnyxStatus: error instanceof TelnyxApiError ? error.status : null,
            telnyxResponseBody: error instanceof TelnyxApiError ? error.responseBody : null,
            telnyxRequestPayload: error instanceof TelnyxApiError ? error.requestBody : null,
          });
        }
      } else {
        console.log('[telnyx-voice-webhook] recording skipped (disabled)', {
          ...telnyxLogContext,
          workspaceId,
          voiceCallId: call.id,
          callControlId: call.provider_call_control_id,
        });
      }

      await startInboundNoiseSuppressionForCall({
        workspaceId,
        voiceCallId: call.id,
        callControlId: call.provider_call_control_id,
        logContext: telnyxLogContext,
      });

      await syncTelnyxResourceIdsFromEnv({
        db,
        workspaceId,
        workspacePhoneNumberId: workspacePhoneNumber.id,
        voiceAgentId: runtimeConfig?.agent?.id ?? null,
        currentAgentAssistantId: runtimeConfig?.agent?.telnyx_assistant_id ?? null,
        currentPhoneConnectionId: workspacePhoneNumber.telnyx_connection_id ?? null,
        logContext: telnyxLogContext,
      });

      console.log('[telnyx-voice-webhook] call.answered deferred setup complete', {
        ...telnyxLogContext,
        workspaceId,
        voiceCallId: call.id,
        callControlId: call.provider_call_control_id,
        deferredSetupMs: Math.round(performance.now() - postGatherSetupStartedAt),
        totalAnsweredFlowMs: Math.round(performance.now() - answeredProcessingStartedAt),
      });

      await markEventProcessed(db, { workspaceId, eventId });
      return jsonResponse({ ok: true, handled: normalizedEvent.eventType }, 200);
    }

    if (
      normalizedEvent.eventType === 'call.ai_gather.ended' ||
      normalizedEvent.eventType === 'call.gather.ended' ||
      normalizedEvent.eventType === 'call.conversation.ended'
    ) {
      const messageSummary = summarizeMessageHistory(normalizedEvent.messageHistory);
      console.log(`[telnyx-voice-webhook] ${normalizedEvent.eventType} event received`, {
        ...telnyxLogContext,
        workspaceId,
        eventType: normalizedEvent.eventType,
        callControlId: normalizedEvent.callControlId,
        messageSummary,
      });

      const existingBeforeGatherEnded = await findVoiceCallById(db, workspaceId, call.id);
      const incomingGatherResult = toJsonValue(normalizedEvent.gatherResult);
      const incomingMessageHistory = toJsonValue(normalizedEvent.messageHistory);
      const mergedGatherResult = incomingGatherResult ?? toJsonValue(existingBeforeGatherEnded?.gather_result);
      const mergedMessageHistory = incomingMessageHistory ?? toJsonValue(existingBeforeGatherEnded?.message_history);

      await applyGatherEnded(db, {
        workspaceId,
        voiceCallId: call.id,
        gatherResult: mergedGatherResult,
        messageHistory: mergedMessageHistory,
        providerGatherStatus: normalizedEvent.gatherStatus,
        gatherStatus: 'completed',
        gatherCompletedAt: occurredAt,
      });

      const callForLeadCreation = await findVoiceCallById(db, workspaceId, call.id);

      if (callForLeadCreation) {
        await tryCreateLeadSync(
          db,
          workspaceId,
          callForLeadCreation,
          telnyxLogContext
        );
      }

      const refreshedCall = await findVoiceCallById(db, workspaceId, call.id);
      const outcomeStatus = deriveSyncOutcomeStatus(refreshedCall) ?? 'review_needed';

      await finalizeAndTriggerActions({
        db,
        workspaceId,
        voiceCallId: call.id,
        outcomeStatus,
        outcomeReason: deriveSyncOutcomeReason(refreshedCall, 'assistant_conversation_ended'),
        outcomeError: refreshedCall?.outcome_error ?? null,
      });

      try {
        await hangupCall({
          callControlId: call.provider_call_control_id,
          commandId: commandId('hangup', call.provider_call_control_id),
          logContext: telnyxLogContext,
        });
      } catch (error) {
        if (isTelnyxCallAlreadyEndedError(error)) {
          console.warn('[telnyx-voice-webhook] hangup skipped because call already ended', {
            ...telnyxLogContext,
            workspaceId,
            voiceCallId: call.id,
            callControlId: call.provider_call_control_id,
          });
        } else {
          throw error;
        }
      }

      await markEventProcessed(db, { workspaceId, eventId });
      return jsonResponse({ ok: true, handled: normalizedEvent.eventType }, 200);
    }

    if (normalizedEvent.eventType === 'call.analyzed') {
      console.log('[telnyx-voice-webhook] call.analyzed received (non-terminal), skipping forced hangup', {
        ...telnyxLogContext,
        workspaceId,
        voiceCallId: call.id,
        callControlId: call.provider_call_control_id,
      });

      await markEventProcessed(db, { workspaceId, eventId });
      return jsonResponse({ ok: true, handled: normalizedEvent.eventType }, 200);
    }

    if (normalizedEvent.eventType === 'call.hangup') {
      const hungup = await applyCallHangup(db, {
        workspaceId,
        voiceCallId: call.id,
        endedAt: occurredAt,
      });

      if (!hungup.outcome_status) {
        const refreshedCall = await findVoiceCallById(db, workspaceId, call.id);
        const outcomeStatus = deriveSyncOutcomeStatus(refreshedCall) ?? 'ended_without_lead';

        await finalizeAndTriggerActions({
          db,
          workspaceId,
          voiceCallId: call.id,
          outcomeStatus,
          outcomeReason: deriveSyncOutcomeReason(refreshedCall, 'call_hangup_without_lead'),
          outcomeError: refreshedCall?.outcome_error ?? null,
        });
      }

      await markEventProcessed(db, { workspaceId, eventId });
      return jsonResponse({ ok: true, handled: normalizedEvent.eventType }, 200);
    }

    await markEventIgnored(db, {
      workspaceId,
      eventId,
      reason: `Unhandled event type: ${normalizedEvent.eventType}`,
    });

    return jsonResponse({ ok: true, ignored: true, reason: 'unhandled_event_type' }, 200);
  } catch (error) {
    console.error('[telnyx-voice-webhook] fatal error', {
      requestTraceId,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : null,
      telnyxStatus: error instanceof TelnyxApiError ? error.status : null,
      telnyxResponseBody: error instanceof TelnyxApiError ? error.responseBody : null,
      telnyxRequestPath: error instanceof TelnyxApiError ? error.requestPath : null,
      telnyxRequestPayload: error instanceof TelnyxApiError ? error.requestBody : null,
      error,
      workspaceId,
      eventId,
      normalizedEventType: normalizedEvent?.eventType ?? null,
    });
    if (error instanceof Error && error.name.includes('Signature')) {
      return jsonResponse({ error: 'Invalid webhook signature.' }, 401);
    }

    if (!isRetryableInternalError(error)) {
      if (workspaceId && eventId) {
        try {
          await markEventFailed(db, {
            workspaceId,
            eventId,
            errorMessage: safeErrorMessage(error),
          });
        } catch {
          // Best effort failure tracking for non-retryable processing errors.
        }
      }

      return jsonResponse({ ok: true, failed: true, reason: safeErrorMessage(error) }, 200);
    }

    if (workspaceId && eventId && isRetryableInternalError(error)) {
      try {
        await markEventFailed(db, {
          workspaceId,
          eventId,
          errorMessage: safeErrorMessage(error),
        });
      } catch {
        // Best effort failure tracking; the original error response still indicates retry.
      }
    }

    return jsonResponse({ error: safeErrorMessage(error) }, 500);
  }
});
