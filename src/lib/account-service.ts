import type { Session } from '@supabase/supabase-js';
import type { CRMType } from './types';
import { getSupabaseClient } from './supabaseClient';

export type EmailSenderProvider = 'google' | 'microsoft' | 'smtp';

export interface AccountProfile {
  id: string;
  email: string | null;
  full_name: string | null;
}

export interface AccountWorkspace {
  id: string;
  name: string;
  slug: string;
  crm_type: CRMType;
  role: string;
  can_manage: boolean;
}

export interface WorkspaceEmailSender {
  id: string;
  provider: EmailSenderProvider;
  sender_email: string;
  sender_name: string | null;
  status: 'pending' | 'connected' | 'failed' | 'disabled';
  is_default: boolean;
  is_active: boolean;
  health_status: 'unknown' | 'healthy' | 'degraded' | 'failed';
  last_health_error: string | null;
  connected_at: string | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_username: string | null;
  smtp_use_tls: boolean | null;
}

export interface WorkspaceEmailAutomation {
  workspace_id: string;
  is_enabled: boolean;
  timezone: string;
  stop_on_reply: boolean;
}

export interface WorkspaceEmailSequenceStep {
  id: string;
  workspace_id: string;
  step_order: number;
  delay_hours: number;
  subject_template: string;
  body_template: string;
  is_active: boolean;
}

export interface AccountSettingsResponse {
  profile: AccountProfile;
  workspace: AccountWorkspace;
  senders: WorkspaceEmailSender[];
  automation: WorkspaceEmailAutomation;
  sequence_steps: WorkspaceEmailSequenceStep[];
  tokens: string[];
}

export interface AccountSettingsUpdatePayload {
  workspace_id: string;
  profile?: {
    full_name?: string;
  };
  workspace?: {
    name?: string;
    slug?: string;
    crm_type?: CRMType;
  };
  sender?: {
    id?: string;
    provider?: EmailSenderProvider;
    sender_email?: string;
    sender_name?: string | null;
    is_active?: boolean;
    is_default?: boolean;
    smtp?: {
      host?: string;
      port?: number;
      username?: string;
      password?: string;
      use_tls?: boolean;
    };
  };
  automation?: {
    is_enabled?: boolean;
    timezone?: string;
  };
  sequence_steps?: Array<{
    step_order: number;
    delay_hours: number;
    subject_template: string;
    body_template: string;
    is_active?: boolean;
  }>;
}

interface OAuthStartResponse {
  authorize_url: string;
  state: string;
  expires_at: string;
  provider: EmailSenderProvider;
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

export async function getAccountSettings(session: Session, workspaceId: string) {
  return invoke<AccountSettingsResponse>('account-settings-get', session, {
    workspace_id: workspaceId,
  });
}

export async function updateAccountSettings(session: Session, payload: AccountSettingsUpdatePayload) {
  return invoke<AccountSettingsResponse>('account-settings-update', session, payload);
}

export async function startEmailOAuth(
  session: Session,
  payload: {
    workspace_id: string;
    provider: 'google' | 'microsoft';
    return_path?: string;
  },
) {
  return invoke<OAuthStartResponse>('email-oauth-start', session, payload);
}
