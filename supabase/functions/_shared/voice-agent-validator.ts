import type { EdgeClient } from './server.ts';
import { validateVoiceSystemPrompt } from './voice-agent-prompt.ts';
import {
  findActiveVoiceAgentBindingForNumber,
  findVoiceAgentById,
  listVoiceAgentFieldMappings,
  type VoiceAgentFieldMappingRow,
  type VoiceAgentMappingTargetType,
  type VoiceAgentStatus,
} from './voice-agent-repository.ts';
import {
  findWorkspacePhoneNumberById,
  isWorkspacePhoneNumberRoutable,
} from './voice-repository.ts';
import {
  normalizeVoiceAgentLanguage,
  normalizeVoiceAgentTranscriptionModel,
} from './voice-agent-transcription.ts';

export const ALLOWED_VOICE_AGENT_CORE_TARGETS = new Set(['title', 'full_name', 'company_name', 'email']);
export const ALLOWED_VOICE_AGENT_SOURCE_VALUE_TYPES = new Set(['string', 'number', 'boolean', 'array']);

export interface VoiceAgentPayloadInput {
  name?: string;
  description?: string | null;
  status?: VoiceAgentStatus;
  greeting?: string;
  system_prompt?: string;
  source_id?: string | null;
  fallback_mode?: string | null;
  record_creation_mode?: string | null;
  telnyx_model?: string;
  telnyx_voice?: string;
  telnyx_transcription_model?: string;
  telnyx_language?: string;
}

export interface VoiceAgentMappingInput {
  source_key: string;
  source_label: string;
  source_description?: string | null;
  source_value_type: string;
  target_type: VoiceAgentMappingTargetType;
  target_key: string;
  is_required?: boolean;
  position?: number;
}

export interface ValidatedVoiceAgentMapping extends VoiceAgentMappingInput {
  source_key: string;
  source_label: string;
  source_description: string | null;
  source_value_type: string;
  target_type: VoiceAgentMappingTargetType;
  target_key: string;
  is_required: boolean;
  position: number;
}

export interface VoiceAgentSnapshotMappingTarget {
  source_label?: string | null;
  target_type: string;
  target_key: string;
}

interface ActiveCustomField {
  field_key: string;
  label: string;
  field_type: string;
  is_required: boolean;
}

export class VoiceAgentValidationError extends Error {
  issues?: string[];

  constructor(message: string, issues?: string[]) {
    super(message);
    this.name = 'VoiceAgentValidationError';
    this.issues = issues;
  }
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
    throw new VoiceAgentValidationError(`${field} is required.`);
  }

  return next;
}

function normalizeTelnyxLanguage(value: string) {
  const normalized = normalizeVoiceAgentLanguage(value);

  if (!normalized) {
    throw new VoiceAgentValidationError(
      'telnyx_language must be a valid language tag like "en" or "en-US".',
    );
  }

  return normalized;
}

function normalizeTranscriptionModel(value: string) {
  const rawValue = normalizeString(value);

  if (!rawValue) {
    throw new VoiceAgentValidationError('telnyx_transcription_model is required.');
  }

  if (rawValue.length > 128) {
    throw new VoiceAgentValidationError('telnyx_transcription_model must be 128 characters or fewer.');
  }

  const normalized = normalizeVoiceAgentTranscriptionModel(rawValue);

  if (!normalized) {
    throw new VoiceAgentValidationError(
      'telnyx_transcription_model contains invalid characters.',
    );
  }

  return normalized;
}

async function validateSourceId(db: EdgeClient, workspaceId: string, sourceId: string | null) {
  if (!sourceId) {
    return null;
  }

  const { data, error } = await db
    .from('record_sources')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('id', sourceId)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    throw new VoiceAgentValidationError(error.message);
  }

  if (!data) {
    throw new VoiceAgentValidationError('source_id is invalid for this workspace.');
  }

  return data.id as string;
}

async function listActiveCustomFields(db: EdgeClient, workspaceId: string): Promise<ActiveCustomField[]> {
  const { data, error } = await db
    .from('custom_field_definitions')
    .select('field_key, label, field_type, is_required')
    .eq('workspace_id', workspaceId)
    .eq('entity_type', 'record')
    .eq('is_active', true);

  if (error) {
    throw new VoiceAgentValidationError(error.message);
  }

  return (data ?? []) as ActiveCustomField[];
}

function validateVoiceAgentTargetKey(
  customFieldByKey: Map<string, ActiveCustomField>,
  targetType: string,
  targetKey: string,
  sourceLabel?: string | null,
) {
  const normalizedTargetKey = ensureNonEmpty(targetKey, 'target_key');
  const normalizedSourceLabel = normalizeNullableString(sourceLabel);

  if (targetType === 'core') {
    if (!ALLOWED_VOICE_AGENT_CORE_TARGETS.has(normalizedTargetKey)) {
      throw new VoiceAgentValidationError(`core target "${normalizedTargetKey}" is not allowed.`);
    }

    return;
  }

  if (targetType === 'custom') {
    if (!customFieldByKey.has(normalizedTargetKey)) {
      const context = normalizedSourceLabel ? ` for "${normalizedSourceLabel}"` : '';
      throw new VoiceAgentValidationError(
        `custom target "${normalizedTargetKey}"${context} does not exist in active CRM fields.`,
      );
    }

    return;
  }

  throw new VoiceAgentValidationError(`target_type "${targetType}" is invalid.`);
}

export async function validateVoiceAgentPayload(
  db: EdgeClient,
  workspaceId: string,
  payload: VoiceAgentPayloadInput,
) {
  const status = payload.status ?? 'draft';

  if (!['draft', 'active', 'disabled'].includes(status)) {
    throw new VoiceAgentValidationError('status is invalid.');
  }

  const name = payload.name !== undefined ? ensureNonEmpty(payload.name, 'name') : undefined;
  const greeting = payload.greeting !== undefined ? ensureNonEmpty(payload.greeting, 'greeting') : undefined;
  let systemPrompt: string | undefined;

  if (payload.system_prompt !== undefined) {
    const promptValidation = validateVoiceSystemPrompt(payload.system_prompt);

    if (promptValidation.issue) {
      throw new VoiceAgentValidationError(promptValidation.issue);
    }

    systemPrompt = promptValidation.normalized;
  }

  const telnyxModel =
    payload.telnyx_model !== undefined ? ensureNonEmpty(payload.telnyx_model, 'telnyx_model') : undefined;
  const telnyxVoice =
    payload.telnyx_voice !== undefined ? ensureNonEmpty(payload.telnyx_voice, 'telnyx_voice') : undefined;
  const telnyxTranscriptionModel =
    payload.telnyx_transcription_model !== undefined
      ? normalizeTranscriptionModel(payload.telnyx_transcription_model)
      : undefined;
  const telnyxLanguage =
    payload.telnyx_language !== undefined ? ensureNonEmpty(payload.telnyx_language, 'telnyx_language') : undefined;
  const sourceId = payload.source_id !== undefined
    ? await validateSourceId(db, workspaceId, normalizeNullableString(payload.source_id))
    : undefined;

  return {
    name,
    description: payload.description !== undefined ? normalizeNullableString(payload.description) : undefined,
    status,
    greeting,
    systemPrompt,
    telnyxModel,
    telnyxVoice,
    telnyxTranscriptionModel,
    telnyxLanguage: telnyxLanguage !== undefined ? normalizeTelnyxLanguage(telnyxLanguage) : undefined,
    sourceId,
    fallbackMode: payload.fallback_mode !== undefined ? normalizeNullableString(payload.fallback_mode) : undefined,
    recordCreationMode:
      payload.record_creation_mode !== undefined ? normalizeNullableString(payload.record_creation_mode) : undefined,
  };
}

export async function validateVoiceAgentMappings(
  db: EdgeClient,
  workspaceId: string,
  mappings: VoiceAgentMappingInput[],
): Promise<ValidatedVoiceAgentMapping[]> {
  const customFields = await listActiveCustomFields(db, workspaceId);
  const customFieldByKey = new Map(customFields.map((field) => [field.field_key, field]));
  const sourceKeys = new Set<string>();
  const targetPairs = new Set<string>();

  return mappings.map((mapping, index) => {
    const sourceKey = ensureNonEmpty(mapping.source_key, 'source_key');
    const sourceLabel = ensureNonEmpty(mapping.source_label, 'source_label');
    const sourceValueType = ensureNonEmpty(mapping.source_value_type, 'source_value_type');
    const targetType = mapping.target_type;
    const targetKey = ensureNonEmpty(mapping.target_key, 'target_key');

    if (!ALLOWED_VOICE_AGENT_SOURCE_VALUE_TYPES.has(sourceValueType)) {
      throw new VoiceAgentValidationError(`source_value_type "${sourceValueType}" is not supported.`);
    }

    if (sourceKeys.has(sourceKey)) {
      throw new VoiceAgentValidationError(`source_key "${sourceKey}" is duplicated.`);
    }

    const targetPair = `${targetType}::${targetKey}`;

    if (targetPairs.has(targetPair)) {
      throw new VoiceAgentValidationError(`target "${targetPair}" is duplicated.`);
    }

    validateVoiceAgentTargetKey(customFieldByKey, targetType, targetKey, sourceLabel);

    sourceKeys.add(sourceKey);
    targetPairs.add(targetPair);

    return {
      source_key: sourceKey,
      source_label: sourceLabel,
      source_description: normalizeNullableString(mapping.source_description),
      source_value_type: sourceValueType,
      target_type: targetType,
      target_key: targetKey,
      is_required: Boolean(mapping.is_required),
      position: Number.isFinite(mapping.position) ? Math.max(0, Math.trunc(Number(mapping.position))) : index,
    };
  });
}

export async function revalidateVoiceAgentSnapshotTargets(
  db: EdgeClient,
  workspaceId: string,
  mappings: VoiceAgentSnapshotMappingTarget[],
) {
  if (mappings.length === 0) {
    throw new VoiceAgentValidationError('Assistant snapshot does not contain any mapped fields.');
  }

  const customFields = await listActiveCustomFields(db, workspaceId);
  const customFieldByKey = new Map(customFields.map((field) => [field.field_key, field]));

  for (const mapping of mappings) {
    validateVoiceAgentTargetKey(
      customFieldByKey,
      normalizeString(mapping.target_type),
      mapping.target_key,
      mapping.source_label,
    );
  }
}

export async function collectVoiceAgentActivationIssues(
  db: EdgeClient,
  workspaceId: string,
  voiceAgentId: string,
  override?: {
    greeting?: string | null;
    systemPrompt?: string | null;
    sourceId?: string | null;
  },
) {
  const agent = await findVoiceAgentById(db, workspaceId, voiceAgentId);
  const mappings = await listVoiceAgentFieldMappings(db, workspaceId, voiceAgentId);
  const issues: string[] = [];
  const greeting = override?.greeting ?? agent.greeting;
  const systemPrompt = override?.systemPrompt ?? agent.system_prompt;
  const sourceId = override?.sourceId ?? agent.source_id;

  if (normalizeString(greeting).length < 2) {
    issues.push('Greeting must be present before the assistant can be activated.');
  }

  if (normalizeString(systemPrompt).length < 2) {
    issues.push('System prompt must be present before the assistant can be activated.');
  }

  if (mappings.length === 0) {
    issues.push('At least one field mapping is required before the assistant can be activated.');
  } else {
    await validateVoiceAgentMappings(
      db,
      workspaceId,
      mappings.map((mapping) => ({
        source_key: mapping.source_key,
        source_label: mapping.source_label,
        source_description: mapping.source_description,
        source_value_type: mapping.source_value_type,
        target_type: mapping.target_type,
        target_key: mapping.target_key,
        is_required: mapping.is_required,
        position: mapping.position,
      })),
    );
  }

  if (sourceId) {
    await validateSourceId(db, workspaceId, sourceId);
  }

  return issues;
}

export async function assertVoiceAgentCanBeActive(
  db: EdgeClient,
  workspaceId: string,
  voiceAgentId: string,
  override?: {
    greeting?: string | null;
    systemPrompt?: string | null;
    sourceId?: string | null;
  },
) {
  const issues = await collectVoiceAgentActivationIssues(db, workspaceId, voiceAgentId, override);

  if (issues.length > 0) {
    throw new VoiceAgentValidationError('Assistant cannot be activated yet.', issues);
  }
}

export async function assertVoiceAgentBindingIsValid(
  db: EdgeClient,
  workspaceId: string,
  voiceAgentId: string,
  workspacePhoneNumberId: string,
  isActive: boolean,
) {
  const agent = await findVoiceAgentById(db, workspaceId, voiceAgentId);
  const number = await findWorkspacePhoneNumberById(db, workspaceId, workspacePhoneNumberId);

  if (isActive && !isWorkspacePhoneNumberRoutable(number)) {
    throw new VoiceAgentValidationError('Only ready and active voice numbers can have an active assistant binding.');
  }

  if (isActive) {
    if (agent.status !== 'active') {
      throw new VoiceAgentValidationError('Only active assistants can be bound as active.');
    }

    await assertVoiceAgentCanBeActive(db, workspaceId, voiceAgentId);

    const existingActiveBinding = await findActiveVoiceAgentBindingForNumber(db, workspaceId, workspacePhoneNumberId);

    if (existingActiveBinding && existingActiveBinding.voice_agent_id !== voiceAgentId) {
      throw new VoiceAgentValidationError(
        `This phone number already has an active assistant binding${existingActiveBinding.agent_name ? ` (${existingActiveBinding.agent_name})` : ''}.`,
      );
    }
  }

  return { agent, number };
}

export async function assertVoiceAgentStatusTransition(
  db: EdgeClient,
  workspaceId: string,
  voiceAgentId: string,
  nextStatus: VoiceAgentStatus,
  override?: {
    greeting?: string | null;
    systemPrompt?: string | null;
    sourceId?: string | null;
  },
) {
  if (nextStatus === 'active') {
    await assertVoiceAgentCanBeActive(db, workspaceId, voiceAgentId, override);
  }

  return nextStatus;
}
