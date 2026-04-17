import type { Session } from '@supabase/supabase-js';
import { getSupabaseClient } from './supabaseClient';

const VOICE_AGENT_CACHE_TTL_MS = 30 * 1000;

export type VoiceAgentStatus = 'draft' | 'active' | 'disabled';
export type VoiceAgentMappingTargetType = 'core' | 'custom';
export type VoiceAgentSourceValueType = 'string' | 'number' | 'boolean' | 'array';
export type VoiceAgentTelnyxSyncStatus = 'pending' | 'synced' | 'failed';

export interface VoiceAgentRecord {
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

export interface VoiceAgentBindingRecord {
  id: string;
  workspace_id: string;
  voice_agent_id: string;
  workspace_phone_number_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  phone_number_e164: string | null;
  phone_number_label: string | null;
  phone_number_is_active: boolean | null;
  phone_number_provisioning_status: string | null;
  phone_number_webhook_status: string | null;
}

export interface VoiceAgentMappingRecord {
  id: string;
  workspace_id: string;
  voice_agent_id: string;
  source_key: string;
  source_label: string;
  source_description: string | null;
  source_value_type: VoiceAgentSourceValueType;
  target_type: VoiceAgentMappingTargetType;
  target_key: string;
  is_required: boolean;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface VoiceAgentSummary extends VoiceAgentRecord {
  active_bindings: VoiceAgentBindingRecord[];
}

export interface VoiceAgentDetailResponse {
  agent: VoiceAgentRecord;
  bindings: VoiceAgentBindingRecord[];
  mappings: VoiceAgentMappingRecord[];
}

export interface VoiceAgentTelnyxOptions {
  telnyx_models: string[];
  telnyx_voices: string[];
  telnyx_transcription_models: string[];
  telnyx_languages: string[];
}

export interface VoiceAgentTelnyxOptionsResponse {
  options: VoiceAgentTelnyxOptions;
  warnings?: string[];
}

export interface VoiceAgentCreateInput {
  workspace_id: string;
  name: string;
  description?: string | null;
  greeting: string;
  system_prompt: string;
  telnyx_model: string;
  telnyx_voice: string;
  telnyx_transcription_model: string;
  telnyx_language: string;
  source_id?: string | null;
  fallback_mode?: string | null;
  record_creation_mode?: string | null;
  status?: VoiceAgentStatus;
}

export interface VoiceAgentUpdateInput {
  workspace_id: string;
  voice_agent_id: string;
  name?: string;
  description?: string | null;
  greeting?: string;
  system_prompt?: string;
  telnyx_model?: string;
  telnyx_voice?: string;
  telnyx_transcription_model?: string;
  telnyx_language?: string;
  source_id?: string | null;
  fallback_mode?: string | null;
  record_creation_mode?: string | null;
  status?: VoiceAgentStatus;
}

export interface VoiceAgentBindingInput {
  workspace_id: string;
  voice_agent_id: string;
  workspace_phone_number_id: string;
  is_active: boolean;
}

export interface VoiceAgentMappingInput {
  source_key: string;
  source_label: string;
  source_description?: string | null;
  source_value_type: VoiceAgentSourceValueType;
  target_type: VoiceAgentMappingTargetType;
  target_key: string;
  is_required: boolean;
  position: number;
}

export class VoiceAgentServiceError extends Error {
  activationIssues: string[];

  constructor(message: string, activationIssues: string[] = []) {
    super(message);
    this.name = 'VoiceAgentServiceError';
    this.activationIssues = activationIssues;
  }
}

interface CacheEntry<T> {
  data?: T;
  fetchedAt: number;
  promise?: Promise<T>;
}

const voiceAgentListCache = new Map<string, CacheEntry<{ agents: VoiceAgentSummary[] }>>();
const voiceAgentDetailCache = new Map<string, CacheEntry<VoiceAgentDetailResponse>>();
const voiceAgentTelnyxOptionsCache = new Map<string, CacheEntry<VoiceAgentTelnyxOptionsResponse>>();

function getAuthHeaders(session: Session) {
  return {
    Authorization: `Bearer ${session.access_token}`,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function parseInvokeError(error: unknown) {
  let message = error instanceof Error ? error.message : 'Request failed.';
  let activationIssues: string[] = [];
  const context = isRecord(error) ? error.context : null;

  if (context instanceof Response) {
    try {
      const payload = await context.clone().json();

      if (isRecord(payload)) {
        if (typeof payload.error === 'string' && payload.error.trim()) {
          message = payload.error.trim();
        }

        if (Array.isArray(payload.activation_issues)) {
          activationIssues = payload.activation_issues
            .filter((issue): issue is string => typeof issue === 'string')
            .map((issue) => issue.trim())
            .filter(Boolean);
        }
      }
    } catch {
      // Ignore malformed error payloads and fall back to the generic message.
    }
  }

  return { message, activationIssues };
}

async function invoke<TResponse>(name: string, session: Session, body?: unknown) {
  const client = getSupabaseClient();
  const { data, error } = await client.functions.invoke<TResponse>(name, {
    body: body as Record<string, unknown> | undefined,
    headers: getAuthHeaders(session),
  });

  if (error) {
    const parsedError = await parseInvokeError(error);
    throw new VoiceAgentServiceError(parsedError.message, parsedError.activationIssues);
  }

  return data as TResponse;
}

function isCacheFresh<T>(entry: CacheEntry<T> | undefined, ttlMs: number) {
  if (!entry?.data) {
    return false;
  }

  return Date.now() - entry.fetchedAt < ttlMs;
}

function createVoiceAgentDetailCacheKey(workspaceId: string, voiceAgentId: string) {
  return `${workspaceId}::${voiceAgentId}`;
}

function invalidateVoiceAgentCaches(workspaceId: string, voiceAgentId?: string) {
  voiceAgentListCache.delete(workspaceId);

  if (voiceAgentId) {
    voiceAgentDetailCache.delete(createVoiceAgentDetailCacheKey(workspaceId, voiceAgentId));
    return;
  }

  for (const cacheKey of voiceAgentDetailCache.keys()) {
    if (cacheKey.startsWith(`${workspaceId}::`)) {
      voiceAgentDetailCache.delete(cacheKey);
    }
  }
}

export async function listVoiceAgents(session: Session, workspaceId: string) {
  const cachedEntry = voiceAgentListCache.get(workspaceId);

  if (cachedEntry?.promise) {
    return cachedEntry.promise;
  }

  if (isCacheFresh(cachedEntry, VOICE_AGENT_CACHE_TTL_MS)) {
    return cachedEntry!.data as { agents: VoiceAgentSummary[] };
  }

  const request = invoke<{ agents: VoiceAgentSummary[] }>('voice-agent-list', session, {
    workspace_id: workspaceId,
  })
    .then((response) => {
      voiceAgentListCache.set(workspaceId, {
        data: response,
        fetchedAt: Date.now(),
      });
      return response;
    })
    .catch((error) => {
      if (cachedEntry?.data) {
        voiceAgentListCache.set(workspaceId, cachedEntry);
      } else {
        voiceAgentListCache.delete(workspaceId);
      }
      throw error;
    });

  voiceAgentListCache.set(workspaceId, {
    data: cachedEntry?.data,
    fetchedAt: cachedEntry?.fetchedAt ?? 0,
    promise: request,
  });

  return request;
}

export async function getVoiceAgent(session: Session, workspaceId: string, voiceAgentId: string) {
  const cacheKey = createVoiceAgentDetailCacheKey(workspaceId, voiceAgentId);
  const cachedEntry = voiceAgentDetailCache.get(cacheKey);

  if (cachedEntry?.promise) {
    return cachedEntry.promise;
  }

  if (isCacheFresh(cachedEntry, VOICE_AGENT_CACHE_TTL_MS)) {
    return cachedEntry!.data as VoiceAgentDetailResponse;
  }

  const request = invoke<VoiceAgentDetailResponse>('voice-agent-get', session, {
    workspace_id: workspaceId,
    voice_agent_id: voiceAgentId,
  })
    .then((response) => {
      voiceAgentDetailCache.set(cacheKey, {
        data: response,
        fetchedAt: Date.now(),
      });
      return response;
    })
    .catch((error) => {
      if (cachedEntry?.data) {
        voiceAgentDetailCache.set(cacheKey, cachedEntry);
      } else {
        voiceAgentDetailCache.delete(cacheKey);
      }
      throw error;
    });

  voiceAgentDetailCache.set(cacheKey, {
    data: cachedEntry?.data,
    fetchedAt: cachedEntry?.fetchedAt ?? 0,
    promise: request,
  });

  return request;
}

export async function createVoiceAgent(session: Session, payload: VoiceAgentCreateInput) {
  const response = await invoke<{ agent: VoiceAgentRecord; activation_issues?: string[] }>('voice-agent-create', session, payload);
  invalidateVoiceAgentCaches(payload.workspace_id, response.agent.id);
  return response;
}

export async function updateVoiceAgent(session: Session, payload: VoiceAgentUpdateInput) {
  const response = await invoke<{ agent: VoiceAgentRecord; activation_issues?: string[] }>('voice-agent-update', session, payload);
  invalidateVoiceAgentCaches(payload.workspace_id, payload.voice_agent_id);
  return response;
}

export async function deleteVoiceAgent(session: Session, payload: { workspace_id: string; voice_agent_id: string }) {
  const response = await invoke<{ agent: VoiceAgentRecord }>('voice-agent-delete', session, payload);
  invalidateVoiceAgentCaches(payload.workspace_id, payload.voice_agent_id);
  return response;
}

export async function bindVoiceAgentNumber(session: Session, payload: VoiceAgentBindingInput) {
  const response = await invoke<{ binding: VoiceAgentBindingRecord }>('voice-agent-bind-number', session, payload);
  invalidateVoiceAgentCaches(payload.workspace_id, payload.voice_agent_id);
  return response;
}

export async function setVoiceAgentMappings(
  session: Session,
  payload: {
    workspace_id: string;
    voice_agent_id: string;
    mappings: VoiceAgentMappingInput[];
  },
) {
  const response = await invoke<{ mappings: VoiceAgentMappingRecord[] }>('voice-agent-set-mappings', session, payload);
  invalidateVoiceAgentCaches(payload.workspace_id, payload.voice_agent_id);
  return response;
}

export async function listVoiceAgentTelnyxOptions(session: Session, workspaceId: string) {
  const cachedEntry = voiceAgentTelnyxOptionsCache.get(workspaceId);

  if (cachedEntry?.promise) {
    return cachedEntry.promise;
  }

  if (isCacheFresh(cachedEntry, VOICE_AGENT_CACHE_TTL_MS)) {
    return cachedEntry!.data as VoiceAgentTelnyxOptionsResponse;
  }

  const request = invoke<VoiceAgentTelnyxOptionsResponse>('voice-agent-options', session, {
    workspace_id: workspaceId,
  })
    .then((response) => {
      voiceAgentTelnyxOptionsCache.set(workspaceId, {
        data: response,
        fetchedAt: Date.now(),
      });
      return response;
    })
    .catch((error) => {
      if (cachedEntry?.data) {
        voiceAgentTelnyxOptionsCache.set(workspaceId, cachedEntry);
      } else {
        voiceAgentTelnyxOptionsCache.delete(workspaceId);
      }
      throw error;
    });

  voiceAgentTelnyxOptionsCache.set(workspaceId, {
    data: cachedEntry?.data,
    fetchedAt: cachedEntry?.fetchedAt ?? 0,
    promise: request,
  });

  return request;
}
