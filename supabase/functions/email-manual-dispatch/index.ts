import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import {
  authenticateRequest,
  createEdgeClients,
  ensureWorkspaceMembership,
  type EdgeClient,
} from '../_shared/server.ts';
import { sendEmailWithSender } from '../_shared/email-sender-adapters.ts';
import {
  canSenderAttemptDelivery,
  getConnectedDefaultSender,
  isWorkspaceEmailSuppressed,
  listWorkspaceEmailSenders,
  type WorkspaceEmailSenderRow,
} from '../_shared/email-automation.ts';
import { buildRecipientTokens, renderTemplateContent } from '../_shared/email-template-renderer.ts';

interface ManualSendRow {
  id: string;
  workspace_id: string;
  template_id: string | null;
  sender_id: string | null;
  subject_template: string;
  body_html_template: string | null;
  body_plain_template: string | null;
  layout_json: unknown;
  theme_overrides: Record<string, unknown> | null;
  status: string;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  suppressed_count: number;
  scheduled_at: string | null;
  started_at: string | null;
}

interface ManualRecipientRow {
  id: string;
  workspace_id: string;
  manual_send_id: string;
  record_id: string | null;
  recipient_email: string;
  recipient_name: string | null;
  status: 'pending' | 'sent' | 'failed' | 'unsubscribed';
  suppression_reason: string | null;
  provider_message_id: string | null;
  error_text: string | null;
  attempt_count: number;
}

interface RecordRow {
  id: string;
  title: string | null;
  full_name: string | null;
  email: string | null;
}

interface DispatchBody {
  workspace_id?: string;
  batch_size?: number;
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

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getCronSecret(request: Request) {
  return normalizeString(request.headers.get('x-cron-secret')) || normalizeString(request.headers.get('authorization')).replace(/^Bearer\s+/i, '');
}

async function listDueSends(serviceClient: EdgeClient, limit: number, workspaceId?: string) {
  const nowIso = new Date().toISOString();
  let query = serviceClient
    .from('email_manual_sends')
    .select('id, workspace_id, template_id, sender_id, subject_template, body_html_template, body_plain_template, layout_json, theme_overrides, status, recipient_count, sent_count, failed_count, suppressed_count, scheduled_at, started_at')
    .eq('status', 'queued')
    .not('scheduled_at', 'is', null)
    .lte('scheduled_at', nowIso)
    .order('scheduled_at', { ascending: true });

  if (workspaceId) {
    query = query.eq('workspace_id', workspaceId);
  }

  const { data, error } = await query.limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as ManualSendRow[];
}

async function claimSend(serviceClient: EdgeClient, sendId: string) {
  const nowIso = new Date().toISOString();
  const { data, error } = await serviceClient
    .from('email_manual_sends')
    .update({
      status: 'sending',
      started_at: nowIso,
      updated_at: nowIso,
    })
    .eq('id', sendId)
    .eq('status', 'queued')
    .select('id, workspace_id, template_id, sender_id, subject_template, body_html_template, body_plain_template, layout_json, theme_overrides, status, recipient_count, sent_count, failed_count, suppressed_count, scheduled_at, started_at')
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? null) as ManualSendRow | null;
}

async function resolveSender(serviceClient: EdgeClient, workspaceId: string, senderId: string | null) {
  if (!senderId) {
    return getConnectedDefaultSender(serviceClient, workspaceId);
  }

  const senders = await listWorkspaceEmailSenders(serviceClient, workspaceId);
  return senders.find((sender) => sender.id === senderId && canSenderAttemptDelivery(sender)) ?? null;
}

async function loadBrandTheme(serviceClient: EdgeClient, workspaceId: string) {
  const { data, error } = await serviceClient
    .from('workspace_email_brand_themes')
    .select('brand_name, logo_url, primary_color, secondary_color, accent_color, body_bg_color, card_bg_color, text_color, heading_font, body_font, footer_company_name, footer_address, footer_contact_email, footer_signature')
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) return null;

  return {
    brandName: normalizeString(data.brand_name),
    logoUrl: normalizeString(data.logo_url),
    primaryColor: normalizeString(data.primary_color),
    secondaryColor: normalizeString(data.secondary_color),
    accentColor: normalizeString(data.accent_color),
    bodyBgColor: normalizeString(data.body_bg_color),
    cardBgColor: normalizeString(data.card_bg_color),
    textColor: normalizeString(data.text_color),
    headingFont: normalizeString(data.heading_font),
    bodyFont: normalizeString(data.body_font),
    footerCompanyName: normalizeString(data.footer_company_name),
    footerAddress: normalizeString(data.footer_address),
    footerContactEmail: normalizeString(data.footer_contact_email),
    footerSignature: normalizeString(data.footer_signature),
  };
}

async function listPendingRecipients(serviceClient: EdgeClient, workspaceId: string, manualSendId: string) {
  const { data, error } = await serviceClient
    .from('email_manual_send_recipients')
    .select('id, workspace_id, manual_send_id, record_id, recipient_email, recipient_name, status, suppression_reason, provider_message_id, error_text, attempt_count')
    .eq('workspace_id', workspaceId)
    .eq('manual_send_id', manualSendId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as ManualRecipientRow[];
}

async function loadRecords(serviceClient: EdgeClient, workspaceId: string, recordIds: string[]) {
  if (recordIds.length === 0) {
    return [] as RecordRow[];
  }

  const { data, error } = await serviceClient
    .from('records')
    .select('id, title, full_name, email')
    .eq('workspace_id', workspaceId)
    .in('id', recordIds)
    .is('archived_at', null);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as RecordRow[];
}

async function updateRecipientStatus(
  serviceClient: EdgeClient,
  workspaceId: string,
  recipientId: string,
  patch: Record<string, unknown>,
) {
  const { error } = await serviceClient
    .from('email_manual_send_recipients')
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq('workspace_id', workspaceId)
    .eq('id', recipientId);

  if (error) {
    throw new Error(error.message);
  }
}

async function insertSendEvent(
  serviceClient: EdgeClient,
  payload: {
    workspaceId: string;
    manualSendId: string;
    manualRecipientId: string;
    recordId?: string | null;
    senderId?: string | null;
    recipientEmail: string;
    eventType: string;
    provider?: string | null;
    providerMessageId?: string | null;
    errorText?: string | null;
    details?: Record<string, unknown>;
  },
) {
  const { error } = await serviceClient.from('email_send_events').insert({
    workspace_id: payload.workspaceId,
    channel: 'manual',
    event_type: payload.eventType,
    manual_send_id: payload.manualSendId,
    manual_send_recipient_id: payload.manualRecipientId,
    record_id: normalizeString(payload.recordId) || null,
    sender_id: normalizeString(payload.senderId) || null,
    recipient_email: payload.recipientEmail,
    provider: normalizeString(payload.provider) || null,
    provider_message_id: normalizeString(payload.providerMessageId) || null,
    payload: payload.details ?? {},
    error_text: normalizeString(payload.errorText) || null,
  });

  if (error) {
    throw new Error(error.message);
  }
}

async function refreshManualSendStats(serviceClient: EdgeClient, workspaceId: string, manualSendId: string) {
  const { data, error } = await serviceClient
    .from('email_manual_send_recipients')
    .select('status')
    .eq('workspace_id', workspaceId)
    .eq('manual_send_id', manualSendId);

  if (error) {
    throw new Error(error.message);
  }

  let pending = 0;
  let sent = 0;
  let failed = 0;
  let suppressed = 0;

  for (const row of data ?? []) {
    if (row.status === 'pending') pending += 1;
    if (row.status === 'sent') sent += 1;
    if (row.status === 'failed') failed += 1;
    if (row.status === 'unsubscribed') suppressed += 1;
  }

  const nowIso = new Date().toISOString();
  const nextStatus = pending > 0
    ? 'queued'
    : sent === 0 && failed > 0
      ? 'failed'
      : 'completed';

  const { error: updateError } = await serviceClient
    .from('email_manual_sends')
    .update({
      status: nextStatus,
      sent_count: sent,
      failed_count: failed,
      suppressed_count: suppressed,
      completed_at: pending > 0 ? null : nowIso,
      updated_at: nowIso,
    })
    .eq('workspace_id', workspaceId)
    .eq('id', manualSendId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  return { pending, sent, failed, suppressed, status: nextStatus };
}

async function failSendDueToMissingSender(serviceClient: EdgeClient, send: ManualSendRow) {
  const nowIso = new Date().toISOString();

  const { error: recipientsError } = await serviceClient
    .from('email_manual_send_recipients')
    .update({
      status: 'failed',
      error_text: 'No connected sender available.',
      updated_at: nowIso,
    })
    .eq('workspace_id', send.workspace_id)
    .eq('manual_send_id', send.id)
    .eq('status', 'pending');

  if (recipientsError) {
    throw new Error(recipientsError.message);
  }

  const { data: recipientRows, error: fetchRecipientsError } = await serviceClient
    .from('email_manual_send_recipients')
    .select('id, recipient_email, record_id')
    .eq('workspace_id', send.workspace_id)
    .eq('manual_send_id', send.id);

  if (fetchRecipientsError) {
    throw new Error(fetchRecipientsError.message);
  }

  for (const recipient of recipientRows ?? []) {
    await insertSendEvent(serviceClient, {
      workspaceId: send.workspace_id,
      manualSendId: send.id,
      manualRecipientId: recipient.id,
      recordId: recipient.record_id,
      recipientEmail: normalizeEmail(recipient.recipient_email),
      eventType: 'failed',
      errorText: 'No connected sender available.',
    });
  }

  const totalRecipients = (recipientRows ?? []).length;

  const { error: sendError } = await serviceClient
    .from('email_manual_sends')
    .update({
      status: 'failed',
      sent_count: 0,
      failed_count: totalRecipients,
      suppressed_count: 0,
      completed_at: nowIso,
      updated_at: nowIso,
    })
    .eq('workspace_id', send.workspace_id)
    .eq('id', send.id);

  if (sendError) {
    throw new Error(sendError.message);
  }

  return {
    processed: totalRecipients,
    sent: 0,
    failed: totalRecipients,
    suppressed: 0,
    status: 'failed',
  };
}

async function processSend(serviceClient: EdgeClient, send: ManualSendRow) {
  const sender = await resolveSender(serviceClient, send.workspace_id, send.sender_id);

  if (!sender) {
    return failSendDueToMissingSender(serviceClient, send);
  }

  const [brandTheme, recipients] = await Promise.all([
    loadBrandTheme(serviceClient, send.workspace_id),
    listPendingRecipients(serviceClient, send.workspace_id, send.id),
  ]);

  if (recipients.length === 0) {
    const stats = await refreshManualSendStats(serviceClient, send.workspace_id, send.id);
    return {
      processed: 0,
      sent: 0,
      failed: 0,
      suppressed: 0,
      status: stats.status,
    };
  }

  const recordIds = Array.from(new Set(recipients.map((recipient) => normalizeString(recipient.record_id)).filter((value) => value.length > 0)));
  const records = await loadRecords(serviceClient, send.workspace_id, recordIds);
  const recordById = new Map(records.map((record) => [record.id, record]));

  let processed = 0;
  let sentCount = 0;
  let failedCount = 0;
  let suppressedCount = 0;

  for (const recipient of recipients) {
    processed += 1;

    const recipientEmail = normalizeEmail(recipient.recipient_email);
    const recordId = normalizeString(recipient.record_id);
    const record = recordId ? recordById.get(recordId) : null;
    const recipientName = normalizeString(recipient.recipient_name) || normalizeString(record?.full_name) || normalizeString(record?.title);

    if (!recipientEmail) {
      const errorText = 'Invalid recipient email.';

      await updateRecipientStatus(serviceClient, send.workspace_id, recipient.id, {
        status: 'failed',
        error_text: errorText,
        attempt_count: Number(recipient.attempt_count ?? 0) + 1,
      });

      await insertSendEvent(serviceClient, {
        workspaceId: send.workspace_id,
        manualSendId: send.id,
        manualRecipientId: recipient.id,
        recordId: recordId || null,
        senderId: sender.id,
        recipientEmail: normalizeString(recipient.recipient_email),
        eventType: 'failed',
        provider: sender.provider,
        errorText,
      });

      failedCount += 1;
      continue;
    }

    const isSuppressed = await isWorkspaceEmailSuppressed(serviceClient, send.workspace_id, recipientEmail);

    if (isSuppressed) {
      await updateRecipientStatus(serviceClient, send.workspace_id, recipient.id, {
        status: 'unsubscribed',
        suppression_reason: 'workspace_unsubscribed',
      });

      await insertSendEvent(serviceClient, {
        workspaceId: send.workspace_id,
        manualSendId: send.id,
        manualRecipientId: recipient.id,
        recordId: recordId || null,
        senderId: sender.id,
        recipientEmail,
        eventType: 'suppressed',
        details: { reason: 'workspace_unsubscribed' },
      });

      suppressedCount += 1;
      continue;
    }

    const tokens = buildRecipientTokens({
      leadFullName: recipientName,
      leadEmail: recipientEmail,
      workspaceName: brandTheme?.brandName || null,
      senderName: sender.sender_name,
      senderEmail: sender.sender_email,
    });

    const rendered = renderTemplateContent({
      subjectTemplate: normalizeString(send.subject_template),
      bodyHtmlTemplate: normalizeString(send.body_html_template),
      bodyPlainTemplate: normalizeString(send.body_plain_template),
      layoutJson: send.layout_json,
      baseTheme: brandTheme,
      themeOverrides: asRecord(send.theme_overrides),
      tokens,
    });

    try {
      const sendResult = await sendEmailWithSender({
        db: serviceClient,
        sender: sender as WorkspaceEmailSenderRow,
        toEmail: recipientEmail,
        subject: rendered.subject,
        bodyText: rendered.bodyText,
        bodyHtml: rendered.bodyHtml,
        fromName: sender.sender_name,
        fromEmail: sender.sender_email,
      });

      await updateRecipientStatus(serviceClient, send.workspace_id, recipient.id, {
        status: 'sent',
        provider_message_id: sendResult.providerMessageId,
        sent_at: new Date().toISOString(),
        attempt_count: Number(recipient.attempt_count ?? 0) + 1,
        error_text: null,
        suppression_reason: null,
      });

      await insertSendEvent(serviceClient, {
        workspaceId: send.workspace_id,
        manualSendId: send.id,
        manualRecipientId: recipient.id,
        recordId: recordId || null,
        senderId: sender.id,
        recipientEmail,
        eventType: 'sent',
        provider: sender.provider,
        providerMessageId: sendResult.providerMessageId,
        details: { subject: rendered.subject },
      });

      sentCount += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected send error.';

      await updateRecipientStatus(serviceClient, send.workspace_id, recipient.id, {
        status: 'failed',
        error_text: message,
        attempt_count: Number(recipient.attempt_count ?? 0) + 1,
      });

      await insertSendEvent(serviceClient, {
        workspaceId: send.workspace_id,
        manualSendId: send.id,
        manualRecipientId: recipient.id,
        recordId: recordId || null,
        senderId: sender.id,
        recipientEmail,
        eventType: 'failed',
        provider: sender.provider,
        errorText: message,
      });

      failedCount += 1;
    }
  }

  const stats = await refreshManualSendStats(serviceClient, send.workspace_id, send.id);

  return {
    processed,
    sent: sentCount,
    failed: failedCount,
    suppressed: suppressedCount,
    status: stats.status,
  };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed.' }, 405);
    }

    const payload = (await request.json().catch(() => ({}))) as DispatchBody;
    const expectedSecret = normalizeString(Deno.env.get('EMAIL_MANUAL_CRON_SECRET'));
    const suppliedSecret = getCronSecret(request);
    const isCronMode = Boolean(expectedSecret && suppliedSecret && suppliedSecret === expectedSecret);
    let scopedWorkspaceId = '';

    if (!isCronMode) {
      const authContext = await authenticateRequest(request);
      if (authContext instanceof Response) {
        return authContext;
      }

      scopedWorkspaceId = normalizeString(payload.workspace_id);
      if (!scopedWorkspaceId) {
        return jsonResponse({ error: 'workspace_id is required for manual dispatch.' }, 400);
      }

      await ensureWorkspaceMembership(authContext.serviceClient, scopedWorkspaceId, authContext.user.id);
    }

    const clients = createEdgeClients(request);

    if ('errorResponse' in clients) {
      return clients.errorResponse;
    }

    const envBatchSize = Number.parseInt(normalizeString(Deno.env.get('EMAIL_MANUAL_DISPATCH_BATCH_SIZE')) || '20', 10);
    const requestedBatchSize = Number(payload.batch_size);
    const effectiveBatchSize = Number.isFinite(requestedBatchSize)
      ? requestedBatchSize
      : Number.isFinite(envBatchSize)
        ? envBatchSize
        : 20;
    const batchSize = Math.max(1, Math.min(250, effectiveBatchSize));
    const dueSends = await listDueSends(
      clients.serviceClient,
      batchSize,
      scopedWorkspaceId || undefined,
    );

    let claimed = 0;
    let processedRecipients = 0;
    let sentRecipients = 0;
    let failedRecipients = 0;
    let suppressedRecipients = 0;

    for (const dueSend of dueSends) {
      const claimedSend = await claimSend(clients.serviceClient, dueSend.id);
      if (!claimedSend) continue;

      claimed += 1;

      const result = await processSend(clients.serviceClient, claimedSend);
      processedRecipients += result.processed;
      sentRecipients += result.sent;
      failedRecipients += result.failed;
      suppressedRecipients += result.suppressed;
    }

    return jsonResponse({
      mode: isCronMode ? 'cron' : 'workspace',
      workspace_id: scopedWorkspaceId || null,
      due: dueSends.length,
      claimed,
      processed_recipients: processedRecipients,
      sent_recipients: sentRecipients,
      failed_recipients: failedRecipients,
      suppressed_recipients: suppressedRecipients,
      executed_at: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return jsonResponse({ error: message }, 400);
  }
});
