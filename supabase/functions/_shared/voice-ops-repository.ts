import type { EdgeClient } from './server.ts';
import { getRecordDetails } from './records.ts';
import {
  findVoiceCallById,
  listVoiceCallActionRunsByVoiceCallId,
  listVoiceCallArtifactsByVoiceCallId,
  listVoiceCallEventsByVoiceCallId,
  type VoiceCallRow,
} from './voice-repository.ts';

export interface VoiceCallListFilters {
  workspaceId: string;
  outcomeStatus?: string | null;
  reviewStatus?: string | null;
  assistantId?: string | null;
  phoneNumberId?: string | null;
  hasRecord?: boolean | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  page?: number;
  pageSize?: number;
}

export interface VoiceCallOpsListItem extends VoiceCallRow {
  phone_number_e164_label: string | null;
  voice_number_last_webhook_observed_at: string | null;
  voice_agent_name: string | null;
}

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function toPositiveInt(value: unknown, fallback: number) {
  const next = Number(value);
  return Number.isFinite(next) && next > 0 ? Math.trunc(next) : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function loadPhoneNumberContext(
  db: EdgeClient,
  workspaceId: string,
  phoneNumberIds: string[],
) {
  if (phoneNumberIds.length === 0) {
    return new Map<string, { phone_number_e164: string; label: string | null; last_webhook_observed_at: string | null }>();
  }

  const { data, error } = await db
    .from('workspace_phone_numbers')
    .select('id, phone_number_e164, label, last_webhook_observed_at')
    .eq('workspace_id', workspaceId)
    .in('id', phoneNumberIds);

  if (error) {
    throw new Error(error.message);
  }

  return new Map(
    (data ?? []).map((row) => [
      row.id as string,
      {
        phone_number_e164: row.phone_number_e164 as string,
        label: (row.label as string | null) ?? null,
        last_webhook_observed_at: (row.last_webhook_observed_at as string | null) ?? null,
      },
    ]),
  );
}

async function loadAgentContext(
  db: EdgeClient,
  workspaceId: string,
  agentIds: string[],
) {
  if (agentIds.length === 0) {
    return new Map<string, { name: string | null }>();
  }

  const { data, error } = await db
    .from('voice_agents')
    .select('id, name')
    .eq('workspace_id', workspaceId)
    .in('id', agentIds);

  if (error) {
    throw new Error(error.message);
  }

  return new Map((data ?? []).map((row) => [row.id as string, { name: (row.name as string | null) ?? null }]));
}

export async function listVoiceCallsForOps(
  db: EdgeClient,
  filters: VoiceCallListFilters,
) {
  const workspaceId = normalizeString(filters.workspaceId);

  if (!workspaceId) {
    throw new Error('workspaceId is required.');
  }

  const page = toPositiveInt(filters.page, 1);
  const pageSize = Math.min(100, toPositiveInt(filters.pageSize, 25));
  const rangeFrom = (page - 1) * pageSize;
  const rangeTo = rangeFrom + pageSize - 1;

  let query = db
    .from('voice_calls')
    .select('*', { count: 'exact' })
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .range(rangeFrom, rangeTo);

  if (filters.outcomeStatus) {
    query = query.eq('outcome_status', filters.outcomeStatus);
  }

  if (filters.reviewStatus) {
    query = query.eq('review_status', filters.reviewStatus);
  }

  if (filters.assistantId) {
    query = query.eq('voice_agent_id', filters.assistantId);
  }

  if (filters.phoneNumberId) {
    query = query.eq('workspace_phone_number_id', filters.phoneNumberId);
  }

  if (filters.hasRecord === true) {
    query = query.not('record_id', 'is', null);
  } else if (filters.hasRecord === false) {
    query = query.is('record_id', null);
  }

  if (filters.dateFrom) {
    query = query.gte('created_at', filters.dateFrom);
  }

  if (filters.dateTo) {
    query = query.lte('created_at', filters.dateTo);
  }

  const { data, error, count } = await query;

  if (error) {
    throw new Error(error.message);
  }

  const calls = (data ?? []) as VoiceCallRow[];
  const phoneNumberIds = [...new Set(calls.map((call) => call.workspace_phone_number_id).filter(Boolean))];
  const agentIds = [...new Set(calls.map((call) => call.voice_agent_id).filter(Boolean))] as string[];
  const [phoneNumbers, agents] = await Promise.all([
    loadPhoneNumberContext(db, workspaceId, phoneNumberIds),
    loadAgentContext(db, workspaceId, agentIds),
  ]);

  const items: VoiceCallOpsListItem[] = calls.map((call) => {
    const phoneNumber = phoneNumbers.get(call.workspace_phone_number_id);
    const agent = call.voice_agent_id ? agents.get(call.voice_agent_id) : null;

    return {
      ...call,
      phone_number_e164_label: phoneNumber?.label ?? phoneNumber?.phone_number_e164 ?? null,
      voice_number_last_webhook_observed_at: phoneNumber?.last_webhook_observed_at ?? null,
      voice_agent_name: agent?.name ?? null,
    };
  });

  return {
    calls: items,
    page,
    pageSize,
    total: count ?? items.length,
    next_page: (count ?? 0) > rangeTo + 1 ? page + 1 : null,
  };
}

export async function getVoiceCallOpsDetail(
  db: EdgeClient,
  workspaceId: string,
  voiceCallId: string,
) {
  const call = await findVoiceCallById(db, workspaceId, voiceCallId);
  const [events, actionRuns, artifacts, linkedRecord] = await Promise.all([
    listVoiceCallEventsByVoiceCallId(db, workspaceId, voiceCallId),
    listVoiceCallActionRunsByVoiceCallId(db, workspaceId, voiceCallId),
    listVoiceCallArtifactsByVoiceCallId(db, workspaceId, voiceCallId),
    call.record_id ? getRecordDetails(db, workspaceId, call.record_id).catch(() => null) : Promise.resolve(null),
  ]);

  const [phoneNumbers, agents] = await Promise.all([
    loadPhoneNumberContext(db, workspaceId, [call.workspace_phone_number_id]),
    loadAgentContext(db, workspaceId, call.voice_agent_id ? [call.voice_agent_id] : []),
  ]);

  const phoneNumber = phoneNumbers.get(call.workspace_phone_number_id);
  const voiceAgent = call.voice_agent_id ? agents.get(call.voice_agent_id) : null;

  return {
    call: {
      ...call,
      phone_number_e164_label: phoneNumber?.label ?? phoneNumber?.phone_number_e164 ?? null,
      voice_number_last_webhook_observed_at: phoneNumber?.last_webhook_observed_at ?? null,
      voice_agent_name: voiceAgent?.name ?? null,
    },
    events,
    action_runs: actionRuns,
    artifacts,
    linked_record: linkedRecord,
  };
}
