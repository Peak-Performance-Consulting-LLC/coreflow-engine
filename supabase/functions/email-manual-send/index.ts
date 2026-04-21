import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { sendEmailWithSender } from '../_shared/email-sender-adapters.ts';
import {
  canSenderAttemptDelivery,
  getConnectedDefaultSender,
  isWorkspaceEmailSuppressed,
  listWorkspaceEmailSenders,
  type WorkspaceEmailSenderRow,
} from '../_shared/email-automation.ts';
import {
  buildRecipientTokens,
  findUnsupportedTemplateTokens,
  renderTemplateContent,
} from '../_shared/email-template-renderer.ts';
import { authenticateRequest, ensureWorkspaceMembership } from '../_shared/server.ts';
import type { EdgeClient } from '../_shared/server.ts';

interface RequestBody {
  workspace_id?: string;
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
    const fallbackRecipientName = normalizeString(payload.fallback_recipient_name);

    if (!workspaceId) {
      return jsonResponse({ error: 'workspace_id is required.' }, 400);
    }

    if (recordIds.length === 0 && externalRecipients.length === 0) {
      return jsonResponse({ error: 'Select at least one lead or external recipient.' }, 400);
    }

    await ensureWorkspaceMembership(authContext.serviceClient, workspaceId, authContext.user.id);

    const [sender, records, brandTheme, template] = await Promise.all([
      resolveSender(authContext.serviceClient, workspaceId, senderId || null),
      loadRecords(authContext.serviceClient, workspaceId, recordIds),
      loadBrandTheme(authContext.serviceClient, workspaceId),
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
    const themeOverrides = payload.theme_overrides ?? template?.theme_overrides ?? {};

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
        status: 'sending',
        recipient_count: recordIds.length + externalRecipients.length,
        started_at: now,
        created_by: authContext.user.id,
        updated_by: authContext.user.id,
      })
      .select('id')
      .single();

    if (manualSendError || !manualSend) {
      throw new Error(manualSendError?.message || 'Unable to initialize manual send.');
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

    const { data: manualRecipients, error: insertRecipientsError } = await authContext.serviceClient
      .from('email_manual_send_recipients')
      .insert(recipientsToInsert)
      .select('id, record_id, recipient_email, recipient_name, attempt_count');

    if (insertRecipientsError) {
      throw new Error(insertRecipientsError.message);
    }

    const recipientByRecord = new Map(records.map((record) => [record.id, record]));

    let sentCount = 0;
    let failedCount = 0;
    let suppressedCount = 0;
    const failureSamples: Array<{ recipient_email: string; error: string }> = [];

    for (const recipient of manualRecipients ?? []) {
      const recipientEmail = normalizeEmail(recipient.recipient_email);
      const recordId = normalizeString(recipient.record_id);
      const record = recordId ? recipientByRecord.get(recordId) : null;
      const recipientName = normalizeString(recipient.recipient_name) ||
        normalizeString(record?.full_name) ||
        normalizeString(record?.title);

      if (!recipientEmail) {
        const errorText = 'Invalid recipient email.';
        await authContext.serviceClient
          .from('email_manual_send_recipients')
          .update({
            status: 'failed',
            error_text: errorText,
            attempt_count: Number(recipient.attempt_count ?? 0) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', recipient.id)
          .eq('workspace_id', workspaceId);

        failureSamples.push({ recipient_email: normalizeString(recipient.recipient_email), error: errorText });
        failedCount += 1;
        continue;
      }

      const isSuppressed = await isWorkspaceEmailSuppressed(authContext.serviceClient, workspaceId, recipientEmail);
      if (isSuppressed) {
        await authContext.serviceClient
          .from('email_manual_send_recipients')
          .update({
            status: 'unsubscribed',
            suppression_reason: 'workspace_unsubscribed',
            updated_at: new Date().toISOString(),
          })
          .eq('id', recipient.id)
          .eq('workspace_id', workspaceId);

        await insertSendEvent(authContext.serviceClient, {
          workspaceId,
          manualSendId: manualSend.id,
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
        fallbackLeadName: fallbackRecipientName,
      });

      const rendered = renderTemplateContent({
        subjectTemplate,
        bodyHtmlTemplate,
        bodyPlainTemplate,
        layoutJson,
        baseTheme: brandTheme,
        themeOverrides,
        tokens,
      });

      try {
        const sendResult = await sendEmailWithSender({
          db: authContext.serviceClient,
          sender: sender as WorkspaceEmailSenderRow,
          toEmail: recipientEmail,
          subject: rendered.subject,
          bodyText: rendered.bodyText,
          bodyHtml: rendered.bodyHtml,
          fromName: sender.sender_name,
          fromEmail: sender.sender_email,
        });

        await authContext.serviceClient
          .from('email_manual_send_recipients')
          .update({
            status: 'sent',
            provider_message_id: sendResult.providerMessageId,
            sent_at: new Date().toISOString(),
            attempt_count: Number(recipient.attempt_count ?? 0) + 1,
            error_text: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', recipient.id)
          .eq('workspace_id', workspaceId);

        await insertSendEvent(authContext.serviceClient, {
          workspaceId,
          manualSendId: manualSend.id,
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

        await authContext.serviceClient
          .from('email_manual_send_recipients')
          .update({
            status: 'failed',
            error_text: message,
            attempt_count: Number(recipient.attempt_count ?? 0) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', recipient.id)
          .eq('workspace_id', workspaceId);

        await insertSendEvent(authContext.serviceClient, {
          workspaceId,
          manualSendId: manualSend.id,
          manualRecipientId: recipient.id,
          recordId: recordId || null,
          senderId: sender.id,
          recipientEmail,
          eventType: 'failed',
          provider: sender.provider,
          errorText: message,
        });

        failureSamples.push({ recipient_email: recipientEmail, error: message });
        failedCount += 1;
      }
    }

    await authContext.serviceClient
      .from('email_manual_sends')
      .update({
        status: 'completed',
        sent_count: sentCount,
        failed_count: failedCount,
        suppressed_count: suppressedCount,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        updated_by: authContext.user.id,
      })
      .eq('id', manualSend.id)
      .eq('workspace_id', workspaceId);

    return jsonResponse({
      manual_send_id: manualSend.id,
      recipient_count: recipientsToInsert.length,
      sent_count: sentCount,
      failed_count: failedCount,
      suppressed_count: suppressedCount,
      failure_samples: failureSamples.slice(0, 5),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return jsonResponse({ error: message }, 400);
  }
});
