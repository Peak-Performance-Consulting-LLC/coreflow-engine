import type { Session } from '@supabase/supabase-js';
import type { RecordDetailResponse } from './crm-types';
import { getSupabaseClient } from './supabaseClient';

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

export interface VoiceOpsCallRecord {
  id: string;
  workspace_id: string;
  workspace_phone_number_id: string;
  voice_agent_id: string | null;
  voice_agent_binding_id: string | null;
  provider: 'telnyx';
  direction: 'inbound';
  provider_call_control_id: string;
  provider_call_leg_id: string | null;
  provider_call_session_id: string | null;
  provider_connection_id: string | null;
  from_number_e164: string;
  to_number_e164: string;
  status: string;
  lead_creation_status: string;
  gather_result: Record<string, unknown> | null;
  message_history: unknown[] | Record<string, unknown> | null;
  record_id: string | null;
  assistant_mapping_snapshot: Record<string, unknown> | null;
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
  phone_number_e164_label?: string | null;
  voice_number_last_webhook_observed_at?: string | null;
  voice_agent_name?: string | null;
}

export interface VoiceOpsEventRecord {
  id: string;
  event_type: string;
  occurred_at: string;
  processing_status: string;
  signature_valid: boolean;
  payload: Record<string, unknown>;
  processing_error: string | null;
  processed_at: string | null;
  created_at: string;
}

export interface VoiceOpsActionRunRecord {
  id: string;
  action_type: VoiceActionType;
  trigger_outcome_status: VoiceOutcomeStatus;
  status: VoiceActionRunStatus;
  target_record_id: string | null;
  task_id: string | null;
  attempt_count: number;
  next_retry_at: string | null;
  last_error: string | null;
  request_payload: Record<string, unknown>;
  result_payload: Record<string, unknown>;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface VoiceOpsArtifactRecord {
  id: string;
  artifact_type: VoiceArtifactType;
  status: 'pending' | 'ready' | 'failed';
  source: string | null;
  content_text: string | null;
  content_json: Record<string, unknown>;
  model: string | null;
  error_text: string | null;
  generated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface VoiceOpsTaskRecord {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_at: string | null;
  assigned_to: string | null;
  created_by: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface VoiceCallListQuery {
  workspace_id: string;
  outcome_status?: VoiceOutcomeStatus | null;
  review_status?: VoiceReviewStatus | null;
  assistant_id?: string | null;
  phone_number_id?: string | null;
  has_record?: boolean | null;
  date_from?: string | null;
  date_to?: string | null;
  page?: number;
  page_size?: number;
}

export interface VoiceCallListResponse {
  calls: VoiceOpsCallRecord[];
  page: number;
  pageSize: number;
  total: number;
  next_page: number | null;
}

export interface VoiceCallDetailResponse {
  call: VoiceOpsCallRecord;
  events: VoiceOpsEventRecord[];
  action_runs: VoiceOpsActionRunRecord[];
  artifacts: VoiceOpsArtifactRecord[];
  linked_record: RecordDetailResponse | null;
}

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

export async function listVoiceCalls(session: Session, query: VoiceCallListQuery) {
  return invoke<VoiceCallListResponse>('voice-call-list', session, query);
}

export async function getVoiceCallDetail(session: Session, workspaceId: string, voiceCallId: string) {
  return invoke<VoiceCallDetailResponse>('voice-call-get', session, {
    workspace_id: workspaceId,
    voice_call_id: voiceCallId,
  });
}

export async function retryVoiceCallLeadCreate(session: Session, workspaceId: string, voiceCallId: string) {
  return invoke<{ call: VoiceOpsCallRecord; record_id?: string; result: string }>('voice-call-retry-lead-create', session, {
    workspace_id: workspaceId,
    voice_call_id: voiceCallId,
  });
}

export async function retryVoiceAction(session: Session, workspaceId: string, actionRunId: string) {
  return invoke<{ action_run: VoiceOpsActionRunRecord }>('voice-call-retry-action', session, {
    workspace_id: workspaceId,
    action_run_id: actionRunId,
  });
}

export async function resolveVoiceReview(
  session: Session,
  payload: {
    workspace_id: string;
    voice_call_id: string;
    review_status: 'open' | 'resolved' | 'dismissed';
    note?: string;
  },
) {
  return invoke<{ call: VoiceOpsCallRecord }>('voice-call-resolve-review', session, payload);
}

export async function createVoiceTaskFromRecommendation(
  session: Session,
  payload: {
    workspace_id: string;
    voice_call_id: string;
    artifact_id: string;
  },
) {
  const response = await invoke<{ task: VoiceOpsTaskRecord }>('voice-call-create-task', session, payload);
  return response.task;
}
