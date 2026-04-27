import { getSupabaseClient } from './supabaseClient';
import type { WorkspaceRole } from './types';

/* ─── Provider metadata ───────────────────────────────────────────────── */
export type EmailProvider = 'google' | 'microsoft' | 'zoho' | 'hostinger' | 'godaddy' | 'smtp';

export interface EmailProviderMeta {
  id: EmailProvider;
  label: string;
  icon: string;
  logoUrl?: string;
  color: string;
  authMethod: 'oauth' | 'smtp';
  smtpDefaults?: { host: string; port: number };
  description: string;
  docsUrl?: string;
}

export const EMAIL_PROVIDERS: EmailProviderMeta[] = [
  {
    id: 'google',
    label: 'Google Workspace',
    icon: '🔵',
    logoUrl: '/logos/google.webp',
    color: '#4285F4',
    authMethod: 'oauth',
    description: 'Gmail and Google Workspace accounts',
  },
  {
    id: 'microsoft',
    label: 'Microsoft 365',
    icon: '🟦',
    logoUrl: '/logos/microsoft.webp',
    color: '#00A4EF',
    authMethod: 'oauth',
    description: 'Outlook and Microsoft 365 accounts',
  },
  {
    id: 'zoho',
    label: 'Zoho Mail',
    icon: '🟠',
    logoUrl: '/logos/zoho.webp',
    color: '#E0601A',
    authMethod: 'smtp',
    smtpDefaults: { host: 'smtp.zoho.com', port: 465 },
    description: 'Zoho Mail SMTP',
  },
  {
    id: 'hostinger',
    label: 'Hostinger',
    icon: '🟣',
    logoUrl: '/logos/hostinger.webp',
    color: '#673DE6',
    authMethod: 'smtp',
    smtpDefaults: { host: 'smtp.hostinger.com', port: 587 },
    description: 'Hostinger email hosting',
  },
  {
    id: 'godaddy',
    label: 'GoDaddy',
    icon: '🟢',
    logoUrl: '/logos/Godaddy.webp',
    color: '#1BDB2C',
    authMethod: 'smtp',
    smtpDefaults: { host: 'smtpout.secureserver.net', port: 587 },
    description: 'GoDaddy professional email',
  },
  {
    id: 'smtp',
    label: 'Custom SMTP',
    icon: '⚙️',
    color: '#64748B',
    authMethod: 'smtp',
    description: 'Any SMTP server',
  },
];

/* ─── Template variables ──────────────────────────────────────────────── */
export const TEMPLATE_VARIABLES = [
  { token: '{{lead_full_name}}', label: 'Lead full name', example: 'John Smith' },
  { token: '{{lead_first_name}}', label: 'Lead first name', example: 'John' },
  { token: '{{lead_email}}', label: 'Lead email', example: 'john@example.com' },
  { token: '{{workspace_name}}', label: 'Workspace name', example: 'Acme Corp' },
  { token: '{{sender_name}}', label: 'Sender name', example: 'Jane Doe' },
  { token: '{{sender_email}}', label: 'Sender email', example: 'jane@acme.com' },
];

/* ─── Types ───────────────────────────────────────────────────────────── */
export interface EmailSender {
  id: string;
  provider: EmailProvider;
  sender_email: string;
  sender_name: string | null;
  status: 'pending' | 'connected' | 'failed' | 'disabled';
  is_default: boolean;
  is_active: boolean;
  health_status: 'unknown' | 'healthy' | 'degraded' | 'failed';
  last_health_error?: string | null;
  connected_at: string | null;
}

export interface EmailSequenceStep {
  id: string;
  workspace_id: string;
  step_order: number;
  delay_hours: number;
  subject_template: string;
  body_template: string;
  is_active: boolean;
}

export interface EmailAutomationSettings {
  workspace_id: string;
  is_enabled: boolean;
  timezone: string;
  stop_on_reply: boolean;
  send_window_start_hour?: number | null;
  send_window_end_hour?: number | null;
  send_window_days?: number[];
}

export interface AccountSettingsGetResponse {
  workspace_id?: string;
  workspace?: { id: string; role: WorkspaceRole; can_manage: boolean };
  automation: EmailAutomationSettings;
  senders: EmailSender[];
  sequence_steps: EmailSequenceStep[];
  tokens?: string[];
}

/* ─── Helpers ─────────────────────────────────────────────────────────── */
export function delayLabel(hours: number): string {
  if (hours === 0) return 'Send immediately';
  if (hours < 24) return `After ${hours}h`;
  const days = Math.floor(hours / 24);
  const rem = hours % 24;
  return rem > 0 ? `After ${days}d ${rem}h` : `After ${days} day${days > 1 ? 's' : ''}`;
}

export function renderTemplatePreview(template: string, workspaceName: string): string {
  return template
    .replace(/\{\{lead_full_name\}\}/g, 'John Smith')
    .replace(/\{\{lead_first_name\}\}/g, 'John')
    .replace(/\{\{lead_email\}\}/g, 'john@example.com')
    .replace(/\{\{workspace_name\}\}/g, workspaceName)
    .replace(/\{\{sender_name\}\}/g, 'Jane Doe')
    .replace(/\{\{sender_email\}\}/g, 'jane@yourcompany.com');
}

async function getFunctionAuthHeaders(): Promise<Record<string, string> | undefined> {
  const sb = getSupabaseClient();
  const {
    data: { session },
  } = await sb.auth.getSession();

  if (!session?.access_token) {
    return undefined;
  }

  return {
    Authorization: `Bearer ${session.access_token}`,
  };
}

/* ─── API calls ───────────────────────────────────────────────────────── */

export async function fetchAccountSettings(): Promise<AccountSettingsGetResponse> {
  const sb = getSupabaseClient();
  const { data, error } = await sb.functions.invoke<AccountSettingsGetResponse>('account-settings-get', {
    headers: await getFunctionAuthHeaders(),
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error('No data returned from account-settings-get.');
  return data;
}

export interface SmtpSenderInput {
  provider: EmailProvider;
  sender_email: string;
  sender_name?: string;
  smtp_host: string;
  smtp_port: number;
  smtp_username: string;
  smtp_password: string;
  smtp_use_tls: boolean;
}

export async function addSmtpSender(input: SmtpSenderInput & { make_default?: boolean }): Promise<void> {
  const sb = getSupabaseClient();
  const { error } = await sb.functions.invoke('account-settings-sender-add', {
    body: input,
    headers: await getFunctionAuthHeaders(),
  });
  if (error) throw new Error(error.message);
}

// Initiates OAuth via email-oauth-start — returns the authorize URL
export async function initiateOauth(
  provider: 'google' | 'microsoft',
  workspaceId: string,
): Promise<string> {
  const sb = getSupabaseClient();
  const { data, error } = await sb.functions.invoke<{ authorize_url?: string; error?: string }>('email-oauth-start', {
    body: { provider, workspace_id: workspaceId, return_path: '/email' },
    headers: await getFunctionAuthHeaders(),
  });
  if (error) {
    const functionError = typeof data?.error === 'string' ? data.error.trim() : '';

    if (functionError) {
      throw new Error(functionError);
    }

    throw new Error(
      `${error.message}. Check Supabase function secrets for OAuth: GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, MICROSOFT_OAUTH_CLIENT_ID, MICROSOFT_OAUTH_CLIENT_SECRET, EMAIL_CREDENTIALS_ENCRYPTION_KEY.`,
    );
  }
  if (!data?.authorize_url) {
    throw new Error(typeof data?.error === 'string' && data.error ? data.error : 'No authorize URL returned.');
  }
  return data.authorize_url;
}

export async function enrollLead(
  recordId: string,
): Promise<{ followup_id: string; steps_scheduled: number; message: string }> {
  const sb = getSupabaseClient();
  const { data, error } = await sb.functions.invoke<{
    followup_id: string;
    steps_scheduled: number;
    message: string;
  }>('email-enroll-lead', {
    body: { record_id: recordId },
    headers: await getFunctionAuthHeaders(),
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error('No response from enroll function.');
  return data;
}

export async function controlLeadSequence(
  workspaceId: string,
  recordId: string,
  action: 'stop' | 'pause' | 'resume',
): Promise<{ followup_id?: string; status: string; reason?: string }> {
  const sb = getSupabaseClient();
  const { data, error } = await sb.functions.invoke<{
    followup_id?: string;
    status: string;
    reason?: string;
  }>('email-sequence-control', {
    body: {
      workspace_id: workspaceId,
      record_id: recordId,
      action,
    },
    headers: await getFunctionAuthHeaders(),
  });

  if (error) throw new Error(error.message);
  if (!data) throw new Error('No response from sequence control function.');
  return data;
}

export async function updateAutomationSettings(
  workspaceId: string,
  patch: Partial<Omit<EmailAutomationSettings, 'workspace_id'>>,
): Promise<void> {
  const sb = getSupabaseClient();
  const { error } = await sb.from('workspace_email_automation_settings').upsert(
    { workspace_id: workspaceId, ...patch },
    { onConflict: 'workspace_id' },
  );
  if (error) throw new Error(error.message);
}

export async function updateSequenceStep(
  stepId: string,
  patch: Partial<Pick<EmailSequenceStep, 'subject_template' | 'body_template' | 'delay_hours' | 'is_active'>>,
): Promise<void> {
  const sb = getSupabaseClient();
  const { error } = await sb
    .from('workspace_email_sequence_steps')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', stepId);
  if (error) throw new Error(error.message);
}

export async function addSequenceStep(
  workspaceId: string,
  step: Pick<EmailSequenceStep, 'step_order' | 'delay_hours' | 'subject_template' | 'body_template'>,
): Promise<void> {
  const sb = getSupabaseClient();
  const { error } = await sb.from('workspace_email_sequence_steps').insert({
    workspace_id: workspaceId,
    ...step,
    is_active: true,
  });
  if (error) throw new Error(error.message);
}

export async function deleteSequenceStep(stepId: string): Promise<void> {
  const sb = getSupabaseClient();
  const { error } = await sb.from('workspace_email_sequence_steps').delete().eq('id', stepId);
  if (error) throw new Error(error.message);
}

export type ManualSendStatus = 'queued' | 'sending' | 'completed' | 'failed' | 'cancelled';

export interface ScheduledManualEmail {
  id: string;
  workspace_id: string;
  template_id?: string | null;
  sender_id?: string | null;
  subject_template: string;
  body_html_template?: string | null;
  body_plain_template?: string | null;
  layout_json?: unknown;
  theme_overrides?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  status: ManualSendStatus;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  suppressed_count: number;
  scheduled_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScheduledManualEmailRecipient {
  id: string;
  workspace_id: string;
  manual_send_id: string;
  record_id?: string | null;
  recipient_email: string;
  recipient_name?: string | null;
  status: 'pending' | 'sent' | 'failed' | 'unsubscribed';
  suppression_reason?: string | null;
  provider_message_id?: string | null;
  error_text?: string | null;
  sent_at?: string | null;
  attempt_count: number;
  created_at: string;
  updated_at: string;
}

export async function scheduleManualEmail(
  workspaceId: string,
  payload: {
    schedule_at: string;
    schedule_timezone?: string;
    record_ids?: string[];
    external_recipients?: Array<{ email: string; name?: string }>;
    fallback_recipient_name?: string;
    sender_id?: string;
    template_id?: string;
    subject_template?: string;
    body_html_template?: string;
    body_plain_template?: string;
    layout_json?: unknown;
    theme_overrides?: Record<string, unknown>;
  },
): Promise<{ manual_send_id: string; status: string; recipient_count: number; scheduled_at: string }> {
  const sb = getSupabaseClient();
  const { data, error } = await sb.functions.invoke<{ manual_send_id: string; status: string; recipient_count: number; scheduled_at: string }>('email-manual-schedule', {
    body: {
      workspace_id: workspaceId,
      ...payload,
    },
    headers: await getFunctionAuthHeaders(),
  });

  if (error) throw new Error(error.message);
  if (!data) throw new Error('No response from email-manual-schedule.');
  return data;
}

export async function fetchScheduledManualEmails(
  workspaceId: string,
  limit = 100,
): Promise<ScheduledManualEmail[]> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('email_manual_sends')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as ScheduledManualEmail[];
}

export async function cancelScheduledManualEmail(workspaceId: string, manualSendId: string): Promise<void> {
  const sb = getSupabaseClient();
  const { error } = await sb
    .from('email_manual_sends')
    .update({
      status: 'cancelled',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('workspace_id', workspaceId)
    .eq('id', manualSendId)
    .eq('status', 'queued');

  if (error) throw new Error(error.message);
}

export async function fetchScheduledManualEmailRecipients(
  workspaceId: string,
  manualSendId: string,
): Promise<ScheduledManualEmailRecipient[]> {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('email_manual_send_recipients')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('manual_send_id', manualSendId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as ScheduledManualEmailRecipient[];
}

export async function dispatchDueManualEmails(
  workspaceId: string,
): Promise<{ due: number; claimed: number; processed_recipients: number; sent_recipients: number; failed_recipients: number; suppressed_recipients: number; executed_at: string }> {
  const sb = getSupabaseClient();
  const { data, error } = await sb.functions.invoke<{
    due: number;
    claimed: number;
    processed_recipients: number;
    sent_recipients: number;
    failed_recipients: number;
    suppressed_recipients: number;
    executed_at: string;
  }>('email-manual-dispatch', {
    body: {
      workspace_id: workspaceId,
    },
    headers: await getFunctionAuthHeaders(),
  });

  if (error) throw new Error(error.message);
  if (!data) throw new Error('No response from email-manual-dispatch.');
  return data;
}

export async function sendManualEmailNow(
  workspaceId: string,
  payload: {
    record_ids?: string[];
    external_recipients?: Array<{ email: string; name?: string }>;
    fallback_recipient_name?: string;
    sender_id?: string;
    template_id?: string;
    subject_template?: string;
    body_html_template?: string;
    body_plain_template?: string;
    layout_json?: unknown;
    theme_overrides?: Record<string, unknown>;
  },
): Promise<{ manual_send_id: string; recipient_count: number; sent_count: number; failed_count: number; suppressed_count: number; failure_samples?: Array<{ recipient_email: string; error: string }> }> {
  const sb = getSupabaseClient();
  const { data, error } = await sb.functions.invoke<{
    manual_send_id: string;
    recipient_count: number;
    sent_count: number;
    failed_count: number;
    suppressed_count: number;
    failure_samples?: Array<{ recipient_email: string; error: string }>;
  }>('email-manual-send', {
    body: {
      workspace_id: workspaceId,
      ...payload,
    },
    headers: await getFunctionAuthHeaders(),
  });

  if (error) throw new Error(error.message);
  if (!data) throw new Error('No response from email-manual-send.');
  return data;
}
