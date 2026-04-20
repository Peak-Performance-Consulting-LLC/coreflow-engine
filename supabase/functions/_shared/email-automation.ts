import type { EdgeClient } from './server.ts';

export type EmailSenderProvider = 'google' | 'microsoft' | 'smtp';

export interface WorkspaceEmailSenderRow {
  id: string;
  workspace_id: string;
  provider: EmailSenderProvider;
  sender_email: string;
  sender_name: string | null;
  status: 'pending' | 'connected' | 'failed' | 'disabled';
  is_default: boolean;
  is_active: boolean;
  oauth_access_token_encrypted: string | null;
  oauth_refresh_token_encrypted: string | null;
  oauth_token_expires_at: string | null;
  oauth_scope: string | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_username: string | null;
  smtp_password_encrypted: string | null;
  smtp_use_tls: boolean;
  health_status: 'unknown' | 'healthy' | 'degraded' | 'failed';
  last_health_error: string | null;
  connected_at?: string | null;
  last_used_at?: string | null;
}

export interface WorkspaceEmailAutomationSettingsRow {
  workspace_id: string;
  is_enabled: boolean;
  timezone: string;
  stop_on_reply: boolean;
}

export interface WorkspaceEmailSequenceStepRow {
  id: string;
  workspace_id: string;
  step_order: number;
  delay_hours: number;
  subject_template: string;
  body_template: string;
  is_active: boolean;
}

export interface DispatchFollowupStepRow {
  id: string;
  workspace_id: string;
  followup_id: string;
  sender_id: string | null;
  step_order: number;
  status: 'pending' | 'claimed' | 'sending' | 'sent' | 'failed' | 'canceled';
  scheduled_for: string;
  locked_at: string | null;
  lock_token: string | null;
  claim_expires_at: string | null;
  attempt_count: number;
  max_attempts: number;
  next_retry_at: string | null;
  subject_rendered: string;
  body_rendered: string;
  provider_message_id: string | null;
  sent_at: string | null;
  last_error: string | null;
}

interface RecordEmailFollowupRow {
  id: string;
  workspace_id: string;
  record_id: string;
  sender_id: string | null;
  status: 'active' | 'completed' | 'stopped' | 'failed';
  stop_reason: string | null;
}

interface WorkspaceRecordRow {
  id: string;
  workspace_id: string;
  title: string;
  full_name: string | null;
  email: string | null;
}

interface WorkspaceRow {
  id: string;
  name: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_SENDER_NAME = 'CoreFlow Team';

const DEFAULT_SEQUENCE_STEPS: Array<Pick<WorkspaceEmailSequenceStepRow, 'step_order' | 'delay_hours' | 'subject_template' | 'body_template'>> = [
  {
    step_order: 1,
    delay_hours: 0,
    subject_template: 'Quick follow-up from {{workspace_name}}',
    body_template:
      'Hi {{lead_full_name}},\n\nThanks for your interest. We wanted to quickly follow up and see how we can help.\n\nBest,\n{{sender_name}}',
  },
  {
    step_order: 2,
    delay_hours: 48,
    subject_template: 'Checking in on your request',
    body_template:
      'Hi {{lead_full_name}},\n\nJust checking in regarding your request. If you are available, reply here and we can continue.\n\nBest,\n{{sender_name}}',
  },
  {
    step_order: 3,
    delay_hours: 120,
    subject_template: 'Final follow-up',
    body_template:
      'Hi {{lead_full_name}},\n\nThis is a final follow-up from {{workspace_name}}. If timing is not right, no problem. We are here when you are ready.\n\nBest,\n{{sender_name}}',
  },
];

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function sanitizeEmail(value: string | null | undefined) {
  const normalized = normalizeString(value);
  if (!normalized || !EMAIL_REGEX.test(normalized)) {
    return null;
  }
  return normalized.toLowerCase();
}

function isUniqueViolation(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === '23505';
}

export function renderEmailTemplate(template: string, tokens: Record<string, string>) {
  let output = template;

  for (const [key, value] of Object.entries(tokens)) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    output = output.replace(new RegExp(`{{\\s*${escapedKey}\\s*}}`, 'g'), value);
  }

  return output;
}

export function resolveRetryDelayMinutes(attemptCount: number) {
  if (attemptCount <= 1) {
    return 5;
  }

  if (attemptCount === 2) {
    return 15;
  }

  if (attemptCount === 3) {
    return 60;
  }

  return null;
}

export async function ensureWorkspaceEmailAutomationDefaults(db: EdgeClient, workspaceId: string, actorUserId?: string | null) {
  const workspace = normalizeString(workspaceId);
  if (!workspace) {
    throw new Error('workspaceId is required.');
  }

  const { error } = await db.rpc('ensure_workspace_email_automation_defaults', {
    target_workspace_id: workspace,
    actor_user_id: normalizeString(actorUserId) || null,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function getWorkspaceAutomationSettings(db: EdgeClient, workspaceId: string) {
  const { data, error } = await db
    .from('workspace_email_automation_settings')
    .select('workspace_id, is_enabled, timezone, stop_on_reply')
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? null) as WorkspaceEmailAutomationSettingsRow | null;
}

export async function listWorkspaceEmailSenders(db: EdgeClient, workspaceId: string) {
  const { data, error } = await db
    .from('workspace_email_senders')
    .select(
      'id, workspace_id, provider, sender_email, sender_name, status, is_default, is_active, oauth_access_token_encrypted, oauth_refresh_token_encrypted, oauth_token_expires_at, oauth_scope, smtp_host, smtp_port, smtp_username, smtp_password_encrypted, smtp_use_tls, health_status, last_health_error, connected_at, last_used_at',
    )
    .eq('workspace_id', workspaceId)
    .order('is_default', { ascending: false })
    .order('updated_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as WorkspaceEmailSenderRow[];
}

export async function getConnectedDefaultSender(db: EdgeClient, workspaceId: string) {
  const senders = await listWorkspaceEmailSenders(db, workspaceId);
  return senders.find((sender) => sender.is_active && sender.status === 'connected') ?? null;
}

export async function listWorkspaceSequenceSteps(db: EdgeClient, workspaceId: string, activeOnly = false) {
  let query = db
    .from('workspace_email_sequence_steps')
    .select('id, workspace_id, step_order, delay_hours, subject_template, body_template, is_active')
    .eq('workspace_id', workspaceId)
    .order('step_order', { ascending: true });

  if (activeOnly) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  if ((data ?? []).length === 0 && activeOnly) {
    return DEFAULT_SEQUENCE_STEPS.map((step, index) => ({
      id: `default-${index + 1}`,
      workspace_id: workspaceId,
      ...step,
      is_active: true,
    }));
  }

  return (data ?? []) as WorkspaceEmailSequenceStepRow[];
}

export async function logEmailDeliveryEvent(
  db: EdgeClient,
  payload: {
    workspaceId: string;
    followupId?: string | null;
    followupStepId?: string | null;
    senderId?: string | null;
    eventType: string;
    provider?: string | null;
    providerMessageId?: string | null;
    requestPayload?: Record<string, unknown>;
    responsePayload?: Record<string, unknown>;
    errorText?: string | null;
  },
) {
  const { error } = await db.from('email_delivery_events').insert({
    workspace_id: payload.workspaceId,
    followup_id: normalizeString(payload.followupId) || null,
    followup_step_id: normalizeString(payload.followupStepId) || null,
    sender_id: normalizeString(payload.senderId) || null,
    event_type: payload.eventType,
    provider: normalizeString(payload.provider) || null,
    provider_message_id: normalizeString(payload.providerMessageId) || null,
    request_payload: payload.requestPayload ?? {},
    response_payload: payload.responsePayload ?? {},
    error_text: normalizeString(payload.errorText) || null,
  });

  if (error) {
    throw new Error(error.message);
  }
}

async function getWorkspaceRecord(db: EdgeClient, workspaceId: string, recordId: string) {
  const { data, error } = await db
    .from('records')
    .select('id, workspace_id, title, full_name, email')
    .eq('workspace_id', workspaceId)
    .eq('id', recordId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? null) as WorkspaceRecordRow | null;
}

async function getWorkspaceById(db: EdgeClient, workspaceId: string) {
  const { data, error } = await db
    .from('workspaces')
    .select('id, name')
    .eq('id', workspaceId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? null) as WorkspaceRow | null;
}

export async function enrollRecordEmailFollowupIfEligible(params: {
  db: EdgeClient;
  workspaceId: string;
  recordId: string;
  actorUserId: string;
  recordEmail?: string | null;
  recordFullName?: string | null;
}) {
  const workspaceId = normalizeString(params.workspaceId);
  const recordId = normalizeString(params.recordId);
  const actorUserId = normalizeString(params.actorUserId);

  if (!workspaceId || !recordId || !actorUserId) {
    return { enrolled: false, reason: 'missing_context' as const };
  }

  await ensureWorkspaceEmailAutomationDefaults(params.db, workspaceId, actorUserId);

  const settings = await getWorkspaceAutomationSettings(params.db, workspaceId);

  if (!settings?.is_enabled) {
    return { enrolled: false, reason: 'automation_disabled' as const };
  }

  const sender = await getConnectedDefaultSender(params.db, workspaceId);

  if (!sender) {
    return { enrolled: false, reason: 'sender_not_connected' as const };
  }

  const workspace = await getWorkspaceById(params.db, workspaceId);
  const record = await getWorkspaceRecord(params.db, workspaceId, recordId);

  if (!workspace || !record) {
    return { enrolled: false, reason: 'record_or_workspace_missing' as const };
  }

  const leadEmail = sanitizeEmail(params.recordEmail ?? record.email);

  if (!leadEmail) {
    return { enrolled: false, reason: 'missing_email' as const };
  }

  const steps = await listWorkspaceSequenceSteps(params.db, workspaceId, true);

  if (steps.length === 0) {
    return { enrolled: false, reason: 'no_sequence_steps' as const };
  }

  const { data: followup, error: followupError } = await params.db
    .from('record_email_followups')
    .insert({
      workspace_id: workspaceId,
      record_id: recordId,
      sender_id: sender.id,
      status: 'active',
      created_by: actorUserId,
      updated_by: actorUserId,
    })
    .select('id, workspace_id, record_id, sender_id, status, stop_reason')
    .single();

  if (followupError) {
    if (isUniqueViolation(followupError)) {
      return { enrolled: false, reason: 'already_enrolled' as const };
    }

    throw new Error(followupError.message);
  }

  const tokens = {
    lead_full_name: normalizeString(params.recordFullName) || normalizeString(record.full_name) || leadEmail,
    lead_email: leadEmail,
    workspace_name: workspace.name,
    sender_name: normalizeString(sender.sender_name) || DEFAULT_SENDER_NAME,
  };

  const now = new Date();

  const stepRows = steps.map((step) => {
    const scheduledFor = new Date(now.getTime() + step.delay_hours * 60 * 60 * 1000).toISOString();

    return {
      workspace_id: workspaceId,
      followup_id: (followup as RecordEmailFollowupRow).id,
      sender_id: sender.id,
      step_order: step.step_order,
      status: 'pending',
      scheduled_for: scheduledFor,
      subject_rendered: renderEmailTemplate(step.subject_template, tokens),
      body_rendered: renderEmailTemplate(step.body_template, tokens),
      max_attempts: 3,
    };
  });

  const { error: stepsError } = await params.db.from('record_email_followup_steps').insert(stepRows);

  if (stepsError) {
    throw new Error(stepsError.message);
  }

  await logEmailDeliveryEvent(params.db, {
    workspaceId,
    followupId: (followup as RecordEmailFollowupRow).id,
    senderId: sender.id,
    eventType: 'enrolled',
    provider: sender.provider,
    responsePayload: {
      record_id: recordId,
      steps: steps.map((step) => ({
        step_order: step.step_order,
        delay_hours: step.delay_hours,
      })),
    },
  });

  return {
    enrolled: true,
    reason: 'enrolled' as const,
    followupId: (followup as RecordEmailFollowupRow).id,
  };
}

export async function claimDueFollowupSteps(db: EdgeClient, limit = 25) {
  const { data, error } = await db.rpc('claim_due_record_email_followup_steps', {
    p_limit: limit,
    p_now: new Date().toISOString(),
  });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as DispatchFollowupStepRow[];
}

export async function getFollowupById(db: EdgeClient, workspaceId: string, followupId: string) {
  const { data, error } = await db
    .from('record_email_followups')
    .select('id, workspace_id, record_id, sender_id, status, stop_reason')
    .eq('workspace_id', workspaceId)
    .eq('id', followupId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? null) as RecordEmailFollowupRow | null;
}

export async function updateFollowupStepStatus(
  db: EdgeClient,
  params: {
    workspaceId: string;
    followupStepId: string;
    status: DispatchFollowupStepRow['status'];
    attemptCount?: number;
    nextRetryAt?: string | null;
    providerMessageId?: string | null;
    sentAt?: string | null;
    lastError?: string | null;
    lastResponse?: Record<string, unknown>;
    clearLock?: boolean;
  },
) {
  const patch: Record<string, unknown> = {
    status: params.status,
    updated_at: new Date().toISOString(),
  };

  if (typeof params.attemptCount === 'number') {
    patch.attempt_count = params.attemptCount;
  }

  if (params.nextRetryAt !== undefined) {
    patch.next_retry_at = params.nextRetryAt;
  }

  if (params.providerMessageId !== undefined) {
    patch.provider_message_id = params.providerMessageId;
  }

  if (params.sentAt !== undefined) {
    patch.sent_at = params.sentAt;
  }

  if (params.lastError !== undefined) {
    patch.last_error = params.lastError;
  }

  if (params.lastResponse !== undefined) {
    patch.last_response = params.lastResponse;
  }

  if (params.clearLock) {
    patch.locked_at = null;
    patch.lock_token = null;
    patch.claim_expires_at = null;
  }

  const { error } = await db
    .from('record_email_followup_steps')
    .update(patch)
    .eq('workspace_id', params.workspaceId)
    .eq('id', params.followupStepId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function markFollowupStatus(
  db: EdgeClient,
  params: {
    workspaceId: string;
    followupId: string;
    status: 'active' | 'completed' | 'stopped' | 'failed';
    reason?: string | null;
  },
) {
  const patch: Record<string, unknown> = {
    status: params.status,
    stop_reason: normalizeString(params.reason) || null,
  };

  if (params.status === 'completed') {
    patch.completed_at = new Date().toISOString();
  }

  if (params.status === 'stopped') {
    patch.stopped_at = new Date().toISOString();
  }

  if (params.status === 'failed') {
    patch.failed_at = new Date().toISOString();
  }

  const { error } = await db
    .from('record_email_followups')
    .update(patch)
    .eq('workspace_id', params.workspaceId)
    .eq('id', params.followupId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function hasPendingFollowupSteps(db: EdgeClient, workspaceId: string, followupId: string) {
  const { count, error } = await db
    .from('record_email_followup_steps')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('followup_id', followupId)
    .in('status', ['pending', 'claimed', 'sending']);

  if (error) {
    throw new Error(error.message);
  }

  return (count ?? 0) > 0;
}

export async function getFollowupStepRecipient(db: EdgeClient, workspaceId: string, followupId: string) {
  const followup = await getFollowupById(db, workspaceId, followupId);

  if (!followup) {
    return null;
  }

  const record = await getWorkspaceRecord(db, workspaceId, followup.record_id);

  if (!record) {
    return null;
  }

  return {
    record,
    recipientEmail: sanitizeEmail(record.email),
  };
}
