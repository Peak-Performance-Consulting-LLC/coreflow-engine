import type { EdgeClient } from './server.ts';
import { VoiceRepositoryNotFoundError } from './voice-repository.ts';

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type VoiceAgentStatus = 'draft' | 'active' | 'disabled';
export type VoiceAgentMappingTargetType = 'core' | 'custom';
export type VoiceAgentTelnyxSyncStatus = 'pending' | 'synced' | 'failed';

export interface VoiceAgentRow {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  status: VoiceAgentStatus;
  greeting: string;
  system_prompt: string;
  source_id: string | null;
  fallback_mode: string | null;
  record_creation_mode: string | null;
  telnyx_model: string;
  telnyx_voice: string;
  telnyx_transcription_model: string;
  telnyx_language: string;
  telnyx_assistant_id: string | null;
  telnyx_sync_status: VoiceAgentTelnyxSyncStatus;
  telnyx_sync_error: string | null;
  telnyx_last_synced_at: string | null;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface VoiceAgentPhoneBindingRow {
  id: string;
  workspace_id: string;
  voice_agent_id: string;
  workspace_phone_number_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface VoiceAgentPhoneBindingView extends VoiceAgentPhoneBindingRow {
  phone_number_e164: string | null;
  phone_number_label: string | null;
  phone_number_is_active: boolean | null;
  phone_number_provisioning_status: string | null;
  phone_number_webhook_status: string | null;
}

export interface VoiceAgentFieldMappingRow {
  id: string;
  workspace_id: string;
  voice_agent_id: string;
  source_key: string;
  source_label: string;
  source_description: string | null;
  source_value_type: string;
  target_type: VoiceAgentMappingTargetType;
  target_key: string;
  is_required: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface VoiceAgentSummary extends VoiceAgentRow {
  active_bindings: VoiceAgentPhoneBindingView[];
}

export interface VoiceAgentRuntimeConfig {
  binding: VoiceAgentPhoneBindingView;
  agent: VoiceAgentRow;
  mappings: VoiceAgentFieldMappingRow[];
}

export interface CreateVoiceAgentParams {
  workspaceId: string;
  name: string;
  description?: string | null;
  status?: VoiceAgentStatus;
  greeting: string;
  systemPrompt: string;
  sourceId?: string | null;
  fallbackMode?: string | null;
  recordCreationMode?: string | null;
  telnyxModel: string;
  telnyxVoice: string;
  telnyxTranscriptionModel: string;
  telnyxLanguage: string;
  telnyxAssistantId?: string | null;
  telnyxSyncStatus?: VoiceAgentTelnyxSyncStatus;
  telnyxSyncError?: string | null;
  telnyxLastSyncedAt?: string | null;
  createdBy: string;
}

export interface UpdateVoiceAgentParams {
  workspaceId: string;
  voiceAgentId: string;
  name?: string;
  description?: string | null;
  status?: VoiceAgentStatus;
  greeting?: string;
  systemPrompt?: string;
  sourceId?: string | null;
  fallbackMode?: string | null;
  recordCreationMode?: string | null;
  telnyxModel?: string;
  telnyxVoice?: string;
  telnyxTranscriptionModel?: string;
  telnyxLanguage?: string;
  telnyxAssistantId?: string | null;
  telnyxSyncStatus?: VoiceAgentTelnyxSyncStatus;
  telnyxSyncError?: string | null;
  telnyxLastSyncedAt?: string | null;
  updatedBy: string;
}

export interface UpsertVoiceAgentBindingParams {
  workspaceId: string;
  voiceAgentId: string;
  workspacePhoneNumberId: string;
  isActive: boolean;
}

export interface ReplaceVoiceAgentFieldMappingsParams {
  workspaceId: string;
  voiceAgentId: string;
  mappings: Array<{
    source_key: string;
    source_label: string;
    source_description?: string | null;
    source_value_type: string;
    target_type: VoiceAgentMappingTargetType;
    target_key: string;
    is_required?: boolean;
    position?: number;
  }>;
}

export interface SaveVoiceCallAssistantSnapshotParams {
  workspaceId: string;
  voiceCallId: string;
  voiceAgentId: string | null;
  voiceAgentBindingId: string | null;
  assistantMappingSnapshot: JsonValue | null;
}

const VOICE_AGENT_COLUMNS =
  'id, workspace_id, name, description, status, greeting, system_prompt, source_id, fallback_mode, record_creation_mode, telnyx_model, telnyx_voice, telnyx_transcription_model, telnyx_language, telnyx_assistant_id, telnyx_sync_status, telnyx_sync_error, telnyx_last_synced_at, created_by, updated_by, created_at, updated_at';
const VOICE_AGENT_PHONE_BINDING_COLUMNS =
  'id, workspace_id, voice_agent_id, workspace_phone_number_id, is_active, created_at, updated_at';
const VOICE_AGENT_FIELD_MAPPING_COLUMNS =
  'id, workspace_id, voice_agent_id, source_key, source_label, source_description, source_value_type, target_type, target_key, is_required, position, created_at, updated_at';

export class VoiceAgentRepositoryError extends Error {
  cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'VoiceAgentRepositoryError';
    this.cause = cause;
  }
}

export class VoiceAgentRepositoryDbError extends VoiceAgentRepositoryError {
  operation: string;

  constructor(operation: string, message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'VoiceAgentRepositoryDbError';
    this.operation = operation;
  }
}

export class VoiceAgentRepositoryValidationError extends VoiceAgentRepositoryError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'VoiceAgentRepositoryValidationError';
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

function ensureNonEmpty(value: unknown, field: string) {
  const next = normalizeString(value);

  if (!next) {
    throw new VoiceAgentRepositoryValidationError(`${field} is required.`);
  }

  return next;
}

function formatDbError(error: unknown) {
  if (!isRecord(error)) return 'Unknown database error.';
  const message = normalizeString(error.message);
  const code = normalizeString(error.code);
  const details = normalizeString(error.details);
  return [message, code ? `(code ${code})` : '', details ? `- ${details}` : ''].filter(Boolean).join(' ').trim();
}

function throwDbError(operation: string, error: unknown): never {
  throw new VoiceAgentRepositoryDbError(operation, formatDbError(error), error);
}

function toAssistantSnapshot(value: JsonValue | null) {
  if (value === null) {
    return null;
  }

  try {
    return JSON.parse(JSON.stringify(value)) as JsonValue;
  } catch {
    return null;
  }
}

async function getVoiceCallById(db: EdgeClient, workspaceId: string, voiceCallId: string) {
  const { data, error } = await db
    .from('voice_calls')
    .select('id, workspace_id, voice_agent_id, voice_agent_binding_id, assistant_mapping_snapshot')
    .eq('workspace_id', workspaceId)
    .eq('id', voiceCallId)
    .maybeSingle();

  if (error) {
    throwDbError('getVoiceCallById', error);
  }

  if (!data) {
    throw new VoiceRepositoryNotFoundError('Voice call not found.');
  }

  return data as {
    id: string;
    workspace_id: string;
    voice_agent_id: string | null;
    voice_agent_binding_id: string | null;
    assistant_mapping_snapshot: JsonValue | null;
  };
}

async function mapBindingsWithPhoneNumbers(
  db: EdgeClient,
  bindings: VoiceAgentPhoneBindingRow[],
): Promise<VoiceAgentPhoneBindingView[]> {
  if (bindings.length === 0) {
    return [];
  }

  const numberIds = [...new Set(bindings.map((binding) => binding.workspace_phone_number_id))];
  const { data, error } = await db
    .from('workspace_phone_numbers')
    .select('id, phone_number_e164, label, is_active, provisioning_status, webhook_status')
    .in('id', numberIds);

  if (error) {
    throwDbError('mapBindingsWithPhoneNumbers', error);
  }

  const numberById = new Map(
    (data ?? []).map((number) => [
      number.id,
      {
        phone_number_e164: typeof number.phone_number_e164 === 'string' ? number.phone_number_e164 : null,
        phone_number_label: typeof number.label === 'string' ? number.label : null,
        phone_number_is_active: typeof number.is_active === 'boolean' ? number.is_active : null,
        phone_number_provisioning_status:
          typeof number.provisioning_status === 'string' ? number.provisioning_status : null,
        phone_number_webhook_status: typeof number.webhook_status === 'string' ? number.webhook_status : null,
      },
    ]),
  );

  return bindings.map((binding) => ({
    ...binding,
    ...(numberById.get(binding.workspace_phone_number_id) ?? {
      phone_number_e164: null,
      phone_number_label: null,
      phone_number_is_active: null,
      phone_number_provisioning_status: null,
      phone_number_webhook_status: null,
    }),
  }));
}

export async function listVoiceAgents(db: EdgeClient, workspaceId: string): Promise<VoiceAgentSummary[]> {
  const nextWorkspaceId = ensureNonEmpty(workspaceId, 'workspaceId');
  const { data, error } = await db
    .from('voice_agents')
    .select(VOICE_AGENT_COLUMNS)
    .eq('workspace_id', nextWorkspaceId)
    .order('created_at', { ascending: false });

  if (error) {
    throwDbError('listVoiceAgents', error);
  }

  const agents = (data ?? []) as VoiceAgentRow[];

  if (agents.length === 0) {
    return [];
  }

  const agentIds = agents.map((agent) => agent.id);
  const { data: bindingRows, error: bindingError } = await db
    .from('voice_agent_phone_bindings')
    .select(VOICE_AGENT_PHONE_BINDING_COLUMNS)
    .eq('workspace_id', nextWorkspaceId)
    .eq('is_active', true)
    .in('voice_agent_id', agentIds)
    .order('created_at', { ascending: true });

  if (bindingError) {
    throwDbError('listVoiceAgents.bindings', bindingError);
  }

  const bindings = await mapBindingsWithPhoneNumbers(db, (bindingRows ?? []) as VoiceAgentPhoneBindingRow[]);
  const bindingsByAgentId = new Map<string, VoiceAgentPhoneBindingView[]>();

  for (const binding of bindings) {
    const current = bindingsByAgentId.get(binding.voice_agent_id) ?? [];
    current.push(binding);
    bindingsByAgentId.set(binding.voice_agent_id, current);
  }

  return agents.map((agent) => ({
    ...agent,
    active_bindings: bindingsByAgentId.get(agent.id) ?? [],
  }));
}

export async function findVoiceAgentById(
  db: EdgeClient,
  workspaceId: string,
  voiceAgentId: string,
): Promise<VoiceAgentRow> {
  const nextWorkspaceId = ensureNonEmpty(workspaceId, 'workspaceId');
  const nextVoiceAgentId = ensureNonEmpty(voiceAgentId, 'voiceAgentId');
  const { data, error } = await db
    .from('voice_agents')
    .select(VOICE_AGENT_COLUMNS)
    .eq('workspace_id', nextWorkspaceId)
    .eq('id', nextVoiceAgentId)
    .maybeSingle();

  if (error) {
    throwDbError('findVoiceAgentById', error);
  }

  if (!data) {
    throw new VoiceRepositoryNotFoundError('Voice assistant not found.');
  }

  return data as VoiceAgentRow;
}

export async function createVoiceAgent(db: EdgeClient, params: CreateVoiceAgentParams): Promise<VoiceAgentRow> {
  const { data, error } = await db
    .from('voice_agents')
    .insert({
      workspace_id: ensureNonEmpty(params.workspaceId, 'workspaceId'),
      name: ensureNonEmpty(params.name, 'name'),
      description: normalizeNullableString(params.description),
      status: params.status ?? 'draft',
      greeting: ensureNonEmpty(params.greeting, 'greeting'),
      system_prompt: ensureNonEmpty(params.systemPrompt, 'systemPrompt'),
      source_id: normalizeNullableString(params.sourceId),
      fallback_mode: normalizeNullableString(params.fallbackMode),
      record_creation_mode: normalizeNullableString(params.recordCreationMode),
      telnyx_model: ensureNonEmpty(params.telnyxModel, 'telnyxModel'),
      telnyx_voice: ensureNonEmpty(params.telnyxVoice, 'telnyxVoice'),
      telnyx_transcription_model: ensureNonEmpty(params.telnyxTranscriptionModel, 'telnyxTranscriptionModel'),
      telnyx_language: ensureNonEmpty(params.telnyxLanguage, 'telnyxLanguage'),
      telnyx_assistant_id: normalizeNullableString(params.telnyxAssistantId),
      telnyx_sync_status: params.telnyxSyncStatus ?? 'pending',
      telnyx_sync_error: normalizeNullableString(params.telnyxSyncError),
      telnyx_last_synced_at: normalizeNullableString(params.telnyxLastSyncedAt),
      created_by: ensureNonEmpty(params.createdBy, 'createdBy'),
      updated_by: ensureNonEmpty(params.createdBy, 'createdBy'),
    })
    .select(VOICE_AGENT_COLUMNS)
    .single();

  if (error || !data) {
    throwDbError('createVoiceAgent', error);
  }

  return data as VoiceAgentRow;
}

export async function updateVoiceAgent(db: EdgeClient, params: UpdateVoiceAgentParams): Promise<VoiceAgentRow> {
  const current = await findVoiceAgentById(db, params.workspaceId, params.voiceAgentId);
  const patch: Record<string, unknown> = {
    updated_by: ensureNonEmpty(params.updatedBy, 'updatedBy'),
  };

  if (params.name !== undefined) {
    patch.name = ensureNonEmpty(params.name, 'name');
  }

  if (params.description !== undefined) {
    patch.description = normalizeNullableString(params.description);
  }

  if (params.status !== undefined) {
    patch.status = params.status;
  }

  if (params.greeting !== undefined) {
    patch.greeting = ensureNonEmpty(params.greeting, 'greeting');
  }

  if (params.systemPrompt !== undefined) {
    patch.system_prompt = ensureNonEmpty(params.systemPrompt, 'systemPrompt');
  }

  if (params.sourceId !== undefined) {
    patch.source_id = normalizeNullableString(params.sourceId);
  }

  if (params.fallbackMode !== undefined) {
    patch.fallback_mode = normalizeNullableString(params.fallbackMode);
  }

  if (params.recordCreationMode !== undefined) {
    patch.record_creation_mode = normalizeNullableString(params.recordCreationMode);
  }

  if (params.telnyxModel !== undefined) {
    patch.telnyx_model = ensureNonEmpty(params.telnyxModel, 'telnyxModel');
  }

  if (params.telnyxVoice !== undefined) {
    patch.telnyx_voice = ensureNonEmpty(params.telnyxVoice, 'telnyxVoice');
  }

  if (params.telnyxTranscriptionModel !== undefined) {
    patch.telnyx_transcription_model = ensureNonEmpty(params.telnyxTranscriptionModel, 'telnyxTranscriptionModel');
  }

  if (params.telnyxLanguage !== undefined) {
    patch.telnyx_language = ensureNonEmpty(params.telnyxLanguage, 'telnyxLanguage');
  }

  if (params.telnyxAssistantId !== undefined) {
    patch.telnyx_assistant_id = normalizeNullableString(params.telnyxAssistantId);
  }

  if (params.telnyxSyncStatus !== undefined) {
    patch.telnyx_sync_status = params.telnyxSyncStatus;
  }

  if (params.telnyxSyncError !== undefined) {
    patch.telnyx_sync_error = normalizeNullableString(params.telnyxSyncError);
  }

  if (params.telnyxLastSyncedAt !== undefined) {
    patch.telnyx_last_synced_at = normalizeNullableString(params.telnyxLastSyncedAt);
  }

  const { data, error } = await db
    .from('voice_agents')
    .update(patch)
    .eq('workspace_id', current.workspace_id)
    .eq('id', current.id)
    .select(VOICE_AGENT_COLUMNS)
    .single();

  if (error || !data) {
    throwDbError('updateVoiceAgent', error);
  }

  return data as VoiceAgentRow;
}

export async function listVoiceAgentBindings(
  db: EdgeClient,
  workspaceId: string,
  voiceAgentId: string,
): Promise<VoiceAgentPhoneBindingView[]> {
  const agent = await findVoiceAgentById(db, workspaceId, voiceAgentId);
  const { data, error } = await db
    .from('voice_agent_phone_bindings')
    .select(VOICE_AGENT_PHONE_BINDING_COLUMNS)
    .eq('workspace_id', agent.workspace_id)
    .eq('voice_agent_id', agent.id)
    .order('created_at', { ascending: true });

  if (error) {
    throwDbError('listVoiceAgentBindings', error);
  }

  return mapBindingsWithPhoneNumbers(db, (data ?? []) as VoiceAgentPhoneBindingRow[]);
}

export async function deleteVoiceAgent(
  db: EdgeClient,
  workspaceId: string,
  voiceAgentId: string,
) {
  const agent = await findVoiceAgentById(db, workspaceId, voiceAgentId);
  const { error } = await db
    .from('voice_agents')
    .delete()
    .eq('workspace_id', agent.workspace_id)
    .eq('id', agent.id);

  if (error) {
    throwDbError('deleteVoiceAgent', error);
  }

  return agent;
}

export async function findActiveVoiceAgentBindingForNumber(
  db: EdgeClient,
  workspaceId: string,
  workspacePhoneNumberId: string,
): Promise<(VoiceAgentPhoneBindingView & { agent_name: string | null }) | null> {
  const nextWorkspaceId = ensureNonEmpty(workspaceId, 'workspaceId');
  const nextWorkspacePhoneNumberId = ensureNonEmpty(workspacePhoneNumberId, 'workspacePhoneNumberId');
  const { data, error } = await db
    .from('voice_agent_phone_bindings')
    .select(VOICE_AGENT_PHONE_BINDING_COLUMNS)
    .eq('workspace_id', nextWorkspaceId)
    .eq('workspace_phone_number_id', nextWorkspacePhoneNumberId)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    throwDbError('findActiveVoiceAgentBindingForNumber', error);
  }

  if (!data) {
    return null;
  }

  const [binding] = await mapBindingsWithPhoneNumbers(db, [data as VoiceAgentPhoneBindingRow]);
  const agent = await findVoiceAgentById(db, nextWorkspaceId, binding.voice_agent_id);

  return {
    ...binding,
    agent_name: agent.name,
  };
}

export async function upsertVoiceAgentBinding(
  db: EdgeClient,
  params: UpsertVoiceAgentBindingParams,
): Promise<VoiceAgentPhoneBindingView> {
  await findVoiceAgentById(db, params.workspaceId, params.voiceAgentId);

  const { data: existing, error: existingError } = await db
    .from('voice_agent_phone_bindings')
    .select(VOICE_AGENT_PHONE_BINDING_COLUMNS)
    .eq('workspace_id', params.workspaceId)
    .eq('voice_agent_id', params.voiceAgentId)
    .eq('workspace_phone_number_id', params.workspacePhoneNumberId)
    .maybeSingle();

  if (existingError) {
    throwDbError('upsertVoiceAgentBinding.findExisting', existingError);
  }

  if (params.isActive) {
    const existingActiveBinding = await findActiveVoiceAgentBindingForNumber(
      db,
      params.workspaceId,
      params.workspacePhoneNumberId,
    );

    if (existingActiveBinding && existingActiveBinding.voice_agent_id !== params.voiceAgentId) {
      throw new Error(
        `This phone number already has an active assistant binding${existingActiveBinding.agent_name ? ` (${existingActiveBinding.agent_name})` : ''}.`,
      );
    }
  }

  if (existing) {
    const { data, error } = await db
      .from('voice_agent_phone_bindings')
      .update({ is_active: params.isActive })
      .eq('workspace_id', params.workspaceId)
      .eq('id', existing.id)
      .select(VOICE_AGENT_PHONE_BINDING_COLUMNS)
      .single();

    if (error || !data) {
      throwDbError('upsertVoiceAgentBinding.updateExisting', error);
    }

    const [binding] = await mapBindingsWithPhoneNumbers(db, [data as VoiceAgentPhoneBindingRow]);
    return binding;
  }

  const { data, error } = await db
    .from('voice_agent_phone_bindings')
    .insert({
      workspace_id: params.workspaceId,
      voice_agent_id: params.voiceAgentId,
      workspace_phone_number_id: params.workspacePhoneNumberId,
      is_active: params.isActive,
    })
    .select(VOICE_AGENT_PHONE_BINDING_COLUMNS)
    .single();

  if (error || !data) {
    throwDbError('upsertVoiceAgentBinding.insert', error);
  }

  const [binding] = await mapBindingsWithPhoneNumbers(db, [data as VoiceAgentPhoneBindingRow]);
  return binding;
}

export async function listVoiceAgentFieldMappings(
  db: EdgeClient,
  workspaceId: string,
  voiceAgentId: string,
): Promise<VoiceAgentFieldMappingRow[]> {
  const agent = await findVoiceAgentById(db, workspaceId, voiceAgentId);
  const { data, error } = await db
    .from('voice_agent_field_mappings')
    .select(VOICE_AGENT_FIELD_MAPPING_COLUMNS)
    .eq('workspace_id', agent.workspace_id)
    .eq('voice_agent_id', agent.id)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    throwDbError('listVoiceAgentFieldMappings', error);
  }

  return (data ?? []) as VoiceAgentFieldMappingRow[];
}

export async function replaceVoiceAgentFieldMappings(
  db: EdgeClient,
  params: ReplaceVoiceAgentFieldMappingsParams,
): Promise<VoiceAgentFieldMappingRow[]> {
  const agent = await findVoiceAgentById(db, params.workspaceId, params.voiceAgentId);
  const { error: deleteError } = await db
    .from('voice_agent_field_mappings')
    .delete()
    .eq('workspace_id', agent.workspace_id)
    .eq('voice_agent_id', agent.id);

  if (deleteError) {
    throwDbError('replaceVoiceAgentFieldMappings.deleteExisting', deleteError);
  }

  if (params.mappings.length === 0) {
    return [];
  }

  const { data, error } = await db
    .from('voice_agent_field_mappings')
    .insert(
      params.mappings.map((mapping, index) => ({
        workspace_id: agent.workspace_id,
        voice_agent_id: agent.id,
        source_key: ensureNonEmpty(mapping.source_key, 'source_key'),
        source_label: ensureNonEmpty(mapping.source_label, 'source_label'),
        source_description: normalizeNullableString(mapping.source_description),
        source_value_type: ensureNonEmpty(mapping.source_value_type, 'source_value_type'),
        target_type: mapping.target_type,
        target_key: ensureNonEmpty(mapping.target_key, 'target_key'),
        is_required: Boolean(mapping.is_required),
        position: Number.isFinite(mapping.position) ? Math.max(0, Math.trunc(Number(mapping.position))) : index,
      })),
    )
    .select(VOICE_AGENT_FIELD_MAPPING_COLUMNS)
    .order('position', { ascending: true });

  if (error) {
    throwDbError('replaceVoiceAgentFieldMappings.insert', error);
  }

  return (data ?? []) as VoiceAgentFieldMappingRow[];
}

export async function getVoiceAgentRuntimeByPhoneNumberId(
  db: EdgeClient,
  workspaceId: string,
  workspacePhoneNumberId: string,
): Promise<VoiceAgentRuntimeConfig | null> {
  const activeBinding = await findActiveVoiceAgentBindingForNumber(db, workspaceId, workspacePhoneNumberId);

  if (!activeBinding) {
    return null;
  }

  const agent = await findVoiceAgentById(db, workspaceId, activeBinding.voice_agent_id);

  if (agent.status !== 'active') {
    return null;
  }

  const mappings = await listVoiceAgentFieldMappings(db, workspaceId, agent.id);

  // NOTE: An agent with no field mappings is still valid — the AI assistant can
  // start and gather unstructured conversation. Only gather_using_ai requires
  // mappings to build a parameters schema. Do NOT return null here.

  const { agent_name: _agentName, ...binding } = activeBinding;

  return {
    binding,
    agent,
    mappings,
  };
}

export async function saveVoiceCallAssistantSnapshot(
  db: EdgeClient,
  params: SaveVoiceCallAssistantSnapshotParams,
) {
  const call = await getVoiceCallById(db, params.workspaceId, params.voiceCallId);
  const nextSnapshot = toAssistantSnapshot(params.assistantMappingSnapshot);

  const { data, error } = await db
    .from('voice_calls')
    .update({
      voice_agent_id: normalizeNullableString(params.voiceAgentId),
      voice_agent_binding_id: normalizeNullableString(params.voiceAgentBindingId),
      assistant_mapping_snapshot: nextSnapshot,
    })
    .eq('workspace_id', call.workspace_id)
    .eq('id', call.id)
    .select('id, workspace_id, voice_agent_id, voice_agent_binding_id, assistant_mapping_snapshot')
    .single();

  if (error || !data) {
    throwDbError('saveVoiceCallAssistantSnapshot', error);
  }

  return data as {
    id: string;
    workspace_id: string;
    voice_agent_id: string | null;
    voice_agent_binding_id: string | null;
    assistant_mapping_snapshot: JsonValue | null;
  };
}
