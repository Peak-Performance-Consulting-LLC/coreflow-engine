import type { Session } from '@supabase/supabase-js';
import { getSupabaseClient } from './supabaseClient';

const VOICE_NUMBERS_CACHE_TTL_MS = 30 * 1000;

export type VoiceProvisioningStatus = 'pending' | 'active' | 'failed' | 'released';
export type VoiceWebhookStatus = 'pending' | 'ready' | 'failed';
export type VoiceMode = 'ai_lead_capture';

export interface VoiceNumberRecord {
  id: string;
  phone_number_e164: string;
  label: string | null;
  provisioning_status: VoiceProvisioningStatus;
  webhook_status: VoiceWebhookStatus;
  last_provisioning_error: string | null;
  is_active: boolean;
  voice_mode: VoiceMode;
  purchased_at: string | null;
  released_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface VoiceNumberSearchResult {
  phoneNumber: string;
  phoneNumberType: string | null;
  locality: string | null;
  administrativeArea: string | null;
  countryCode: string | null;
  bestEffort: boolean;
  quickship: boolean;
  features: string[];
  monthlyCost: string | null;
  upfrontCost: string | null;
}

export interface VoiceNumberSearchFilters {
  workspace_id: string;
  country_code?: string;
  locality?: string;
  administrative_area?: string;
  npa?: string;
  limit?: number;
  phone_number_type?: 'local' | 'toll_free' | '';
}

export interface VoiceNumberPurchaseInput {
  workspace_id: string;
  phone_number: string;
  label?: string;
  voice_mode?: VoiceMode;
}

export interface VoiceNumberPurchaseResponse {
  number: VoiceNumberRecord;
  webhookReady: boolean;
}

export interface VoiceNumberUpdateInput {
  workspace_id: string;
  voice_number_id: string;
  label?: string | null;
  is_active?: boolean;
  voice_mode?: VoiceMode;
}

interface CacheEntry<T> {
  data?: T;
  fetchedAt: number;
  promise?: Promise<T>;
}

const voiceNumbersCache = new Map<string, CacheEntry<{ numbers: VoiceNumberRecord[] }>>();

function getAuthHeaders(session: Session) {
  return {
    Authorization: `Bearer ${session.access_token}`,
  };
}

async function invoke<TResponse>(name: string, session: Session, body?: unknown) {
  const client = getSupabaseClient();
  const { data, error } = await client.functions.invoke<TResponse>(name, {
    body: body as Record<string, unknown> | undefined,
    headers: getAuthHeaders(session),
  });

  if (error) {
    throw new Error(error.message || 'Request failed.');
  }

  return data as TResponse;
}

function isCacheFresh<T>(entry: CacheEntry<T> | undefined, ttlMs: number) {
  if (!entry?.data) {
    return false;
  }

  return Date.now() - entry.fetchedAt < ttlMs;
}

function createVoiceNumbersCacheKey(workspaceId: string, includeInactive: boolean) {
  return `${workspaceId}::${includeInactive ? 'all' : 'active'}`;
}

function invalidateVoiceNumbersCache(workspaceId: string) {
  for (const cacheKey of voiceNumbersCache.keys()) {
    if (cacheKey.startsWith(`${workspaceId}::`)) {
      voiceNumbersCache.delete(cacheKey);
    }
  }
}

export async function listVoiceNumbers(session: Session, workspaceId: string, includeInactive = true) {
  const cacheKey = createVoiceNumbersCacheKey(workspaceId, includeInactive);
  const cachedEntry = voiceNumbersCache.get(cacheKey);

  if (cachedEntry?.promise) {
    return cachedEntry.promise;
  }

  if (isCacheFresh(cachedEntry, VOICE_NUMBERS_CACHE_TTL_MS)) {
    return cachedEntry!.data as { numbers: VoiceNumberRecord[] };
  }

  const request = invoke<{ numbers: VoiceNumberRecord[] }>('voice-number-list', session, {
    workspace_id: workspaceId,
    include_inactive: includeInactive,
  })
    .then((response) => {
      voiceNumbersCache.set(cacheKey, {
        data: response,
        fetchedAt: Date.now(),
      });
      return response;
    })
    .catch((error) => {
      if (cachedEntry?.data) {
        voiceNumbersCache.set(cacheKey, cachedEntry);
      } else {
        voiceNumbersCache.delete(cacheKey);
      }
      throw error;
    });

  voiceNumbersCache.set(cacheKey, {
    data: cachedEntry?.data,
    fetchedAt: cachedEntry?.fetchedAt ?? 0,
    promise: request,
  });

  return request;
}

export async function searchVoiceNumbers(session: Session, filters: VoiceNumberSearchFilters) {
  return invoke<{ results: VoiceNumberSearchResult[] }>('voice-number-search', session, filters);
}

export async function purchaseVoiceNumber(session: Session, payload: VoiceNumberPurchaseInput) {
  const response = await invoke<VoiceNumberPurchaseResponse>('voice-number-purchase', session, payload);
  invalidateVoiceNumbersCache(payload.workspace_id);
  return response;
}

export async function updateVoiceNumber(session: Session, payload: VoiceNumberUpdateInput) {
  const response = await invoke<{ number: VoiceNumberRecord }>('voice-number-update', session, payload);
  invalidateVoiceNumbersCache(payload.workspace_id);
  return response;
}

export async function reconcileVoiceNumber(
  session: Session,
  payload: Pick<VoiceNumberUpdateInput, 'workspace_id' | 'voice_number_id'>,
) {
  const response = await invoke<{ number: VoiceNumberRecord; webhookReady: boolean; reconciled?: boolean; provisioningInProgress?: boolean }>(
    'voice-number-reconcile',
    session,
    payload,
  );
  invalidateVoiceNumbersCache(payload.workspace_id);
  return response;
}
