import { buildLeadTitle, type LeadCreateInput } from './voice-lead-mapper.ts';
import type { VoiceAgentFieldMappingRow, VoiceAgentPhoneBindingView, VoiceAgentRow } from './voice-agent-repository.ts';

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface VoiceAgentSnapshotField {
  source_key: string;
  source_label: string;
  source_description: string | null;
  source_value_type: string;
  target_type: 'core' | 'custom';
  target_key: string;
  is_required: boolean;
  position: number;
}

export interface VoiceAgentCallSnapshot {
  version: 1;
  voice_agent_id: string;
  voice_agent_binding_id: string;
  workspace_phone_number_id: string;
  greeting: string;
  system_prompt: string;
  source_id: string | null;
  fallback_mode: string | null;
  record_creation_mode: string | null;
  mappings: VoiceAgentSnapshotField[];
}

export class VoiceAgentMapperError extends Error {
  cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'VoiceAgentMapperError';
    this.cause = cause;
  }
}

export class VoiceAgentMapperValidationError extends VoiceAgentMapperError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'VoiceAgentMapperValidationError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeNullableString(value: unknown) {
  const next = normalizeString(value);
  return next.length > 0 ? next : null;
}

function normalizeTelnyxVoice(value: unknown) {
  const normalized = normalizeString(value);

  if (!normalized) {
    return null;
  }

  if (normalized.includes('.')) {
    return normalized;
  }

  return `Telnyx.KokoroTTS.${normalized}`;
}

function normalizeTelnyxLanguage(value: unknown) {
  const normalized = normalizeString(value).toLowerCase().replace('_', '-');

  if (!normalized) {
    return null;
  }

  const [base] = normalized.split('-');

  if (base && /^[a-z]{2,3}$/.test(base)) {
    return base;
  }

  return normalized;
}

function ensureE164(value: unknown, field: string) {
  const next = normalizeString(value);

  if (!/^\+[1-9][0-9]{1,14}$/.test(next)) {
    throw new VoiceAgentMapperValidationError(`${field} must be a valid E.164 phone number.`);
  }

  return next;
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

function normalizeMappedValue(mapping: VoiceAgentSnapshotField, value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  switch (mapping.source_value_type) {
    case 'string': {
      const normalized = normalizeString(value);
      return normalized.length > 0 ? normalized : null;
    }
    case 'number': {
      const numericValue = typeof value === 'number' ? value : Number(value);
      return Number.isFinite(numericValue) ? numericValue : null;
    }
    case 'boolean':
      return typeof value === 'boolean' ? value : null;
    case 'array':
      return Array.isArray(value)
        ? value
            .map((item) => normalizeString(item))
            .filter(Boolean)
        : null;
    default:
      return null;
  }
}

export function buildVoiceAgentGatherSchema(mappings: VoiceAgentFieldMappingRow[]) {
  const properties: Record<string, Record<string, unknown>> = {};
  const required: string[] = [];

  for (const mapping of mappings) {
    const description = normalizeNullableString(mapping.source_description) ??
      normalizeNullableString(mapping.source_label) ??
      `Collect ${mapping.source_key.replace(/_/g, ' ')}.`;

    if (mapping.source_value_type === 'array') {
      properties[mapping.source_key] = {
        type: 'array',
        items: { type: 'string' },
        description,
      };
    } else {
      properties[mapping.source_key] = {
        type: mapping.source_value_type,
        description,
        ...(mapping.target_type === 'core' && mapping.target_key === 'email' ? { format: 'email' } : {}),
      };
    }

    if (mapping.is_required) {
      required.push(mapping.source_key);
    }
  }

  return {
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  };
}

export function buildVoiceAgentAssistantPayload(agent: VoiceAgentRow) {
  const model = normalizeNullableString(agent.telnyx_model);
  const voice = normalizeTelnyxVoice(agent.telnyx_voice);
  const language = normalizeTelnyxLanguage(agent.telnyx_language);
  const transcriptionModel = normalizeNullableString(agent.telnyx_transcription_model);

  return {
    ...(model ? { model } : {}),
    instructions: agent.system_prompt,
    ...(voice ? { voice } : {}),
    ...(language ? { language } : {}),
    ...(transcriptionModel
      ? {
        transcription: {
          model: transcriptionModel,
          ...(language ? { language } : {}),
        },
      }
      : {}),
  };
}

export function buildVoiceAgentCallSnapshot(params: {
  agent: VoiceAgentRow;
  binding: VoiceAgentPhoneBindingView;
  mappings: VoiceAgentFieldMappingRow[];
}): VoiceAgentCallSnapshot {
  return {
    version: 1,
    voice_agent_id: params.agent.id,
    voice_agent_binding_id: params.binding.id,
    workspace_phone_number_id: params.binding.workspace_phone_number_id,
    greeting: params.agent.greeting,
    system_prompt: params.agent.system_prompt,
    source_id: params.agent.source_id,
    fallback_mode: params.agent.fallback_mode,
    record_creation_mode: params.agent.record_creation_mode,
    mappings: params.mappings.map((mapping) => ({
      source_key: mapping.source_key,
      source_label: mapping.source_label,
      source_description: mapping.source_description,
      source_value_type: mapping.source_value_type,
      target_type: mapping.target_type,
      target_key: mapping.target_key,
      is_required: mapping.is_required,
      position: mapping.position,
    })),
  };
}

export function parseVoiceAgentCallSnapshot(value: unknown): VoiceAgentCallSnapshot | null {
  if (!isRecord(value)) {
    return null;
  }

  const version = value.version;
  const voiceAgentId = normalizeNullableString(value.voice_agent_id);
  const voiceAgentBindingId = normalizeNullableString(value.voice_agent_binding_id);
  const workspacePhoneNumberId = normalizeNullableString(value.workspace_phone_number_id);
  const greeting = normalizeNullableString(value.greeting);
  const systemPrompt = normalizeNullableString(value.system_prompt);
  const mappings = Array.isArray(value.mappings) ? value.mappings : [];

  if (
    version !== 1 ||
    !voiceAgentId ||
    !voiceAgentBindingId ||
    !workspacePhoneNumberId ||
    !greeting ||
    !systemPrompt
  ) {
    return null;
  }

  const parsedMappings = mappings
    .filter((mapping) => isRecord(mapping))
    .map((mapping) => ({
      source_key: normalizeString(mapping.source_key),
      source_label: normalizeString(mapping.source_label),
      source_description: normalizeNullableString(mapping.source_description),
      source_value_type: normalizeString(mapping.source_value_type),
      target_type: normalizeString(mapping.target_type) === 'custom' ? 'custom' : 'core',
      target_key: normalizeString(mapping.target_key),
      is_required: Boolean(mapping.is_required),
      position: Number.isFinite(mapping.position) ? Math.max(0, Math.trunc(Number(mapping.position))) : 0,
    }))
    .filter((mapping) => mapping.source_key && mapping.source_label && mapping.source_value_type && mapping.target_key);

  if (parsedMappings.length === 0) {
    return null;
  }

  return {
    version: 1,
    voice_agent_id: voiceAgentId,
    voice_agent_binding_id: voiceAgentBindingId,
    workspace_phone_number_id: workspacePhoneNumberId,
    greeting,
    system_prompt: systemPrompt,
    source_id: normalizeNullableString(value.source_id),
    fallback_mode: normalizeNullableString(value.fallback_mode),
    record_creation_mode: normalizeNullableString(value.record_creation_mode),
    mappings: parsedMappings,
  };
}

export function mapVoiceAgentGatherResultToLeadInput(params: {
  fromNumberE164: string;
  gatherResult: Record<string, unknown> | null;
  snapshot: VoiceAgentCallSnapshot;
  fallbackSourceId?: string | null;
}): LeadCreateInput {
  const phone = ensureE164(params.fromNumberE164, 'fromNumberE164');
  const gather = isRecord(params.gatherResult) ? params.gatherResult : {};
  const core: LeadCreateInput['core'] = {
    phone,
  };
  const custom: Record<string, unknown> = {};
  const fullNameFromMappedTitle = { value: null as string | null };
  const companyNameFromMappedTitle = { value: null as string | null };

  for (const mapping of params.snapshot.mappings) {
    const value = normalizeMappedValue(mapping, gather[mapping.source_key]);

    if (mapping.is_required && (value === null || value === '' || (Array.isArray(value) && value.length === 0))) {
      throw new VoiceAgentMapperValidationError(`${mapping.source_label} is required.`);
    }

    if (value === null) {
      continue;
    }

    if (mapping.target_type === 'core') {
      if (mapping.target_key === 'title' && typeof value === 'string') {
        core.title = value;
      }

      if (mapping.target_key === 'full_name' && typeof value === 'string') {
        core.full_name = value;
        fullNameFromMappedTitle.value = value;
      }

      if (mapping.target_key === 'company_name' && typeof value === 'string') {
        core.company_name = value;
        companyNameFromMappedTitle.value = value;
      }

      if (mapping.target_key === 'email' && typeof value === 'string') {
        const normalizedEmail = normalizeNullableString(value)?.toLowerCase() ?? null;

        if (normalizedEmail) {
          core.email = normalizedEmail;
        }
      }

      continue;
    }

    if (isJsonValue(value)) {
      custom[mapping.target_key] = value;
    }
  }

  const sourceId = normalizeNullableString(params.snapshot.source_id) ?? normalizeNullableString(params.fallbackSourceId);

  if (sourceId) {
    core.source_id = sourceId;
  }

  if (!normalizeNullableString(core.title)) {
    core.title = buildLeadTitle({
      fullName: normalizeNullableString(core.full_name) ?? fullNameFromMappedTitle.value,
      companyName: normalizeNullableString(core.company_name) ?? companyNameFromMappedTitle.value,
      phoneNumberE164: phone,
    });
  }

  return {
    core,
    custom,
  };
}
