import { getSupabaseClient } from './supabaseClient';

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
    smtpDefaults: { host: 'smtp.zoho.com', port: 587 },
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
}

export interface AccountSettingsGetResponse {
  workspace_id?: string;
  workspace?: { id: string; role: string; can_manage: boolean };
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

/* ─── API calls ───────────────────────────────────────────────────────── */

export async function fetchAccountSettings(): Promise<AccountSettingsGetResponse> {
  const sb = getSupabaseClient();
  const { data, error } = await sb.functions.invoke<AccountSettingsGetResponse>('account-settings-get');
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
  const { error } = await sb.functions.invoke('account-settings-sender-add', { body: input });
  if (error) throw new Error(error.message);
}

// Initiates OAuth via email-oauth-start — returns the authorize URL
export async function initiateOauth(
  provider: 'google' | 'microsoft',
  workspaceId: string,
): Promise<string> {
  const sb = getSupabaseClient();
  const { data, error } = await sb.functions.invoke<{ authorize_url: string }>('email-oauth-start', {
    body: { provider, workspace_id: workspaceId, return_path: '/email' },
  });
  if (error) throw new Error(error.message);
  if (!data?.authorize_url) throw new Error('No authorize URL returned.');
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
  }>('email-enroll-lead', { body: { record_id: recordId } });
  if (error) throw new Error(error.message);
  if (!data) throw new Error('No response from enroll function.');
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
