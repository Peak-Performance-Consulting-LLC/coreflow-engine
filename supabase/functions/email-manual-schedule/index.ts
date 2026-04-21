import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import {
  canSenderAttemptDelivery,
  getConnectedDefaultSender,
  listWorkspaceEmailSenders,
} from '../_shared/email-automation.ts';
import { findUnsupportedTemplateTokens } from '../_shared/email-template-renderer.ts';
import { authenticateRequest, ensureWorkspaceMembership } from '../_shared/server.ts';
import type { EdgeClient } from '../_shared/server.ts';

interface RequestBody {
  workspace_id?: string;
  schedule_at?: string;
  schedule_timezone?: string;
  record_ids?: string[];
  external_recipients?: Array<{ email?: string; name?: string }>;
  fallback_recipient_name?: string;
  sender_id?: string;
  template_id?: string;
  subject_template?: string;
  body_html_template?: string;
  body_plain_template?: string;
  layout_json?: unknown;
  theme_overrides?: Record<string, unknown>;
}

interface RecordRow {
  id: string;
  title: string | null;
  full_name: string | null;
  email: string | null;
}

interface ManualRecipientInsert {
  workspace_id: string;
  manual_send_id: string;
  record_id: string | null;
  recipient_email: string;
  recipient_name: string | null;
  status: 'pending';
}

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(value: unknown) {
  const next = normalizeString(value);
  if (!next || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) {
    return '';
  }
  return next.toLowerCase();
}

function parseIdArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return Array.from(new Set(value.map((entry) => normalizeString(entry)).filter((entry) => entry.length > 0)));
}

function parseExternalRecipients(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as Array<{ email: string; name: string | null }>;
  }

  const deduped = new Map<string, { email: string; name: string | null }>();

  for (const rawEntry of value) {
    const entry = typeof rawEntry === 'object' && rawEntry !== null
      ? (rawEntry as Record<string, unknown>)
      : {};
    const email = normalizeEmail(entry.email);
    if (!email) continue;

    const name = normalizeString(entry.name) || null;
    const existing = deduped.get(email);
    if (!existing) {
      deduped.set(email, { email, name });
      continue;
    }

    if (!existing.name && name) {
      deduped.set(email, { email, name });
    }
  }

  return Array.from(deduped.values());
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function resolveSender(serviceClient: EdgeClient, workspaceId: string, senderId: string | null) {
  if (!senderId) {
    return getConnectedDefaultSender(serviceClient, workspaceId);
  }

  const senders = await listWorkspaceEmailSenders(serviceClient, workspaceId);
  return senders.find((sender) => sender.id === senderId && canSenderAttemptDelivery(sender)) ?? null;
}

async function loadRecords(serviceClient: EdgeClient, workspaceId: string, recordIds: string[]) {
  if (recordIds.length === 0) {
    return [] as RecordRow[];
  }

  const { data, error } = await serviceClient
    .from('records')
    .select('id, title, full_name, email')
    .eq('workspace_id', workspaceId)
    .is('archived_at', null)
    .in('id', recordIds);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as RecordRow[];
}

async function loadTemplate(
  serviceClient: EdgeClient,
  workspaceId: string,
  templateId: string,
) {
  const { data, error } = await serviceClient
    .from('email_templates')
    .select('id, subject_template, body_html_template, body_plain_template, layout_json, theme_overrides')
    .eq('workspace_id', workspaceId)
    .eq('id', templateId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data as {
    id: string;
    subject_template: string;
    body_html_template: string | null;
    body_plain_template: string | null;
    layout_json: unknown;
    theme_overrides: Record<string, unknown> | null;
  } | null;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  try {
    const authContext = await authenticateRequest(request);

    if (authContext instanceof Response) {
      return authContext;
    }

    const payload = (await request.json()) as RequestBody;
    const workspaceId = normalizeString(payload.workspace_id);
    const senderId = normalizeString(payload.sender_id);
    const templateId = normalizeString(payload.template_id);
    const recordIds = parseIdArray(payload.record_ids);
    const externalRecipients = parseExternalRecipients(payload.external_recipients);
    const scheduleAtRaw = normalizeString(payload.schedule_at);

    if (!workspaceId) {
      return jsonResponse({ error: 'workspace_id is required.' }, 400);
    }

    if (!scheduleAtRaw) {
      return jsonResponse({ error: 'schedule_at is required.' }, 400);
    }

    const scheduleDate = new Date(scheduleAtRaw);
    if (!Number.isFinite(scheduleDate.getTime())) {
      return jsonResponse({ error: 'schedule_at must be a valid ISO datetime.' }, 400);
    }

    if (scheduleDate.getTime() <= Date.now() + 15_000) {
      return jsonResponse({ error: 'schedule_at must be in the future.' }, 400);
    }

    if (recordIds.length === 0 && externalRecipients.length === 0) {
      return jsonResponse({ error: 'Select at least one lead or external recipient.' }, 400);
    }

    await ensureWorkspaceMembership(authContext.serviceClient, workspaceId, authContext.user.id);

    const [sender, records, template] = await Promise.all([
      resolveSender(authContext.serviceClient, workspaceId, senderId || null),
      loadRecords(authContext.serviceClient, workspaceId, recordIds),
      templateId ? loadTemplate(authContext.serviceClient, workspaceId, templateId) : Promise.resolve(null),
    ]);

    if (!sender) {
      return jsonResponse({ error: 'No connected sender available.' }, 422);
    }

    if (recordIds.length > 0 && records.length === 0) {
      return jsonResponse({ error: 'No valid records were found for this workspace.' }, 404);
    }

    const subjectTemplate = normalizeString(payload.subject_template) || normalizeString(template?.subject_template);
    const bodyHtmlTemplate = normalizeString(payload.body_html_template) || normalizeString(template?.body_html_template);
    const bodyPlainTemplate = normalizeString(payload.body_plain_template) || normalizeString(template?.body_plain_template);
    const layoutJson = payload.layout_json ?? template?.layout_json ?? null;
    const themeOverrides = asRecord(payload.theme_overrides ?? template?.theme_overrides ?? {});

    if (!subjectTemplate) {
      return jsonResponse({ error: 'subject_template is required when template_id is not provided.' }, 400);
    }

    const tokenCheck = findUnsupportedTemplateTokens({
      subjectTemplate,
      bodyHtmlTemplate,
      bodyPlainTemplate,
      layoutJson,
    });

    if (tokenCheck.unsupported.length > 0) {
      return jsonResponse(
        {
          error: `Unsupported template variables: ${tokenCheck.unsupported.join(', ')}`,
          unsupported_variables: tokenCheck.unsupported,
          allowed_variables: ['lead_full_name', 'lead_first_name', 'lead_email', 'workspace_name', 'sender_name', 'sender_email'],
        },
        422,
      );
    }

    const now = new Date().toISOString();

    const { data: manualSend, error: manualSendError } = await authContext.serviceClient
      .from('email_manual_sends')
      .insert({
        workspace_id: workspaceId,
        template_id: template?.id ?? null,
        sender_id: sender.id,
        subject_template: subjectTemplate,
        body_html_template: bodyHtmlTemplate || null,
        body_plain_template: bodyPlainTemplate || null,
        layout_json: layoutJson,
        theme_overrides: themeOverrides,
        status: 'queued',
        recipient_count: recordIds.length + externalRecipients.length,
        sent_count: 0,
        failed_count: 0,
        suppressed_count: 0,
        scheduled_at: scheduleDate.toISOString(),
        created_by: authContext.user.id,
        updated_by: authContext.user.id,
        created_at: now,
        updated_at: now,
      })
      .select('id, status, scheduled_at')
      .single();

    if (manualSendError || !manualSend) {
      throw new Error(manualSendError?.message || 'Unable to initialize scheduled send.');
    }

    const recipientsToInsert = [
      ...records
        .map((record) => ({
          workspace_id: workspaceId,
          manual_send_id: manualSend.id,
          record_id: record.id,
          recipient_email: normalizeEmail(record.email),
          recipient_name: normalizeString(record.full_name) || normalizeString(record.title) || null,
          status: 'pending' as const,
        })),
      ...externalRecipients.map((recipient) => ({
        workspace_id: workspaceId,
        manual_send_id: manualSend.id,
        record_id: null,
        recipient_email: normalizeEmail(recipient.email),
        recipient_name: recipient.name,
        status: 'pending' as const,
      })),
    ]
      .filter((row) => row.recipient_email.length > 0)
      .reduce((acc, row) => {
        if (!acc.some((entry) => entry.recipient_email === row.recipient_email)) {
          acc.push(row);
        }
        return acc;
      }, [] as ManualRecipientInsert[]);

    if (recipientsToInsert.length === 0) {
      return jsonResponse({ error: 'No selected recipients have a valid email address.' }, 422);
    }

    await authContext.serviceClient
      .from('email_manual_sends')
      .update({
        recipient_count: recipientsToInsert.length,
        updated_at: new Date().toISOString(),
        updated_by: authContext.user.id,
      })
      .eq('id', manualSend.id)
      .eq('workspace_id', workspaceId);

    const { error: insertRecipientsError } = await authContext.serviceClient
      .from('email_manual_send_recipients')
      .insert(recipientsToInsert);

    if (insertRecipientsError) {
      throw new Error(insertRecipientsError.message);
    }

    return jsonResponse({
      manual_send_id: manualSend.id,
      status: manualSend.status,
      recipient_count: recipientsToInsert.length,
      scheduled_at: manualSend.scheduled_at,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return jsonResponse({ error: message }, 400);
  }
});
