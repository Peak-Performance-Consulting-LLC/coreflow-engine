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

interface SendBatchBody {
  workspace_id?: string;
  campaign_id?: string;
  batch_size?: number;
  dry_run?: boolean;
}

interface CampaignContext {
  id: string;
  workspace_id: string;
  template_id: string;
  sender_id: string | null;
  name: string;
  status: string;
  subject_override: string | null;
  body_override_html: string | null;
  scheduled_at: string | null;
  latest_snapshot_id: string | null;
  segment_definition: Record<string, unknown> | null;
}

interface TemplateContext {
  id: string;
  name: string;
  subject_template: string;
  body_html_template: string | null;
  body_plain_template: string | null;
  layout_json: unknown;
  theme_overrides: unknown;
}

interface RecipientContext {
  id: string;
  record_id: string;
  recipient_email: string;
  recipient_name: string | null;
  status: 'pending' | 'sent' | 'failed' | 'bounced' | 'unsubscribed' | 'skipped';
  scheduled_for: string | null;
  attempt_count: number;
}

interface RecordContext {
  id: string;
  title: string | null;
  full_name: string | null;
  email: string | null;
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

async function loadCampaign(serviceClient: EdgeClient, workspaceId: string, campaignId: string) {
  const { data, error } = await serviceClient
    .from('email_campaigns')
    .select('id, workspace_id, template_id, sender_id, name, status, subject_override, body_override_html, scheduled_at, latest_snapshot_id, segment_definition')
    .eq('workspace_id', workspaceId)
    .eq('id', campaignId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('Campaign not found.');
  }

  return data as CampaignContext;
}

async function loadTemplate(serviceClient: EdgeClient, workspaceId: string, templateId: string) {
  const { data, error } = await serviceClient
    .from('email_templates')
    .select('id, name, subject_template, body_html_template, body_plain_template, layout_json, theme_overrides')
    .eq('workspace_id', workspaceId)
    .eq('id', templateId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error('Template not found.');
  }

  return data as TemplateContext;
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

  if (!data) {
    return null;
  }

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

async function resolveCampaignSender(
  serviceClient: EdgeClient,
  workspaceId: string,
  senderId: string | null,
) {
  if (!senderId) {
    return getConnectedDefaultSender(serviceClient, workspaceId);
  }

  const senders = await listWorkspaceEmailSenders(serviceClient, workspaceId);
  return senders.find((sender) => sender.id === senderId && canSenderAttemptDelivery(sender)) ?? null;
}

async function listPendingRecipients(
  serviceClient: EdgeClient,
  workspaceId: string,
  campaignId: string,
  limit: number,
) {
  const { data, error } = await serviceClient
    .from('email_campaign_recipients')
    .select('id, record_id, recipient_email, recipient_name, status, scheduled_for, attempt_count')
    .eq('workspace_id', workspaceId)
    .eq('campaign_id', campaignId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(Math.max(limit * 3, limit));

  if (error) {
    throw new Error(error.message);
  }

  const now = Date.now();

  return ((data ?? []) as RecipientContext[])
    .filter((recipient) => {
      if (!recipient.scheduled_for) {
        return true;
      }

      const scheduledAt = Date.parse(recipient.scheduled_for);
      return Number.isFinite(scheduledAt) ? scheduledAt <= now : true;
    })
    .slice(0, limit);
}

async function loadRecipientRecord(
  serviceClient: EdgeClient,
  workspaceId: string,
  recordId: string,
) {
  const { data, error } = await serviceClient
    .from('records')
    .select('id, title, full_name, email')
    .eq('workspace_id', workspaceId)
    .eq('id', recordId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? null) as RecordContext | null;
}

async function updateRecipientStatus(
  serviceClient: EdgeClient,
  workspaceId: string,
  recipientId: string,
  patch: Record<string, unknown>,
) {
  const { error } = await serviceClient
    .from('email_campaign_recipients')
    .update({ ...patch, updated_at: new Date().toISOString() })
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
    campaignId: string;
    campaignRecipientId: string;
    recordId: string;
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
    channel: 'campaign',
    event_type: payload.eventType,
    campaign_id: payload.campaignId,
    campaign_recipient_id: payload.campaignRecipientId,
    record_id: payload.recordId,
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

async function refreshCampaignStats(serviceClient: EdgeClient, workspaceId: string, campaignId: string) {
  const { data, error } = await serviceClient
    .from('email_campaign_recipients')
    .select('status')
    .eq('workspace_id', workspaceId)
    .eq('campaign_id', campaignId);

  if (error) {
    throw new Error(error.message);
  }

  const counts = {
    total: 0,
    sent: 0,
    failed: 0,
    bounced: 0,
    unsubscribed: 0,
    pending: 0,
  };

  for (const row of data ?? []) {
    counts.total += 1;
    if (row.status === 'sent') counts.sent += 1;
    if (row.status === 'failed') counts.failed += 1;
    if (row.status === 'bounced') counts.bounced += 1;
    if (row.status === 'unsubscribed') counts.unsubscribed += 1;
    if (row.status === 'pending') counts.pending += 1;
  }

  const now = new Date().toISOString();

  const { error: statsError } = await serviceClient
    .from('email_campaign_stats')
    .upsert({
      workspace_id: workspaceId,
      campaign_id: campaignId,
      total_recipients: counts.total,
      sent_count: counts.sent,
      failed_count: counts.failed,
      bounced_count: counts.bounced,
      unsubscribed_count: counts.unsubscribed,
      last_updated_at: now,
      updated_at: now,
    }, { onConflict: 'campaign_id' });

  if (statsError) {
    throw new Error(statsError.message);
  }

  const nextStatus = counts.pending > 0 ? 'active' : 'completed';

  const { error: campaignError } = await serviceClient
    .from('email_campaigns')
    .update({
      status: nextStatus,
      dispatch_started_at: nextStatus === 'active' ? now : undefined,
      completed_at: nextStatus === 'completed' ? now : null,
      recipient_count: counts.total,
      updated_at: now,
    })
    .eq('workspace_id', workspaceId)
    .eq('id', campaignId);

  if (campaignError) {
    throw new Error(campaignError.message);
  }

  return counts;
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

    const payload = (await request.json()) as SendBatchBody;
    const workspaceId = normalizeString(payload.workspace_id);
    const campaignId = normalizeString(payload.campaign_id);
    const dryRun = Boolean(payload.dry_run);
    const batchSize = Math.max(1, Math.min(250, Number(payload.batch_size ?? 25) || 25));

    if (!workspaceId || !campaignId) {
      return jsonResponse({ error: 'workspace_id and campaign_id are required.' }, 400);
    }

    await ensureWorkspaceMembership(authContext.serviceClient, workspaceId, authContext.user.id);

    const [campaign, brandTheme] = await Promise.all([
      loadCampaign(authContext.serviceClient, workspaceId, campaignId),
      loadBrandTheme(authContext.serviceClient, workspaceId),
    ]);

    const template = await loadTemplate(authContext.serviceClient, workspaceId, campaign.template_id);
    const sender = await resolveCampaignSender(authContext.serviceClient, workspaceId, campaign.sender_id);

    const subjectTemplate = normalizeString(campaign.subject_override) || template.subject_template;
    const bodyHtmlTemplate = normalizeString(campaign.body_override_html) || template.body_html_template;
    const tokenCheck = findUnsupportedTemplateTokens({
      subjectTemplate,
      bodyHtmlTemplate,
      bodyPlainTemplate: template.body_plain_template,
      layoutJson: template.layout_json,
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

    if (!sender && !dryRun) {
      return jsonResponse({ error: 'No connected sender available for this campaign.' }, 422);
    }

    const recipients = await listPendingRecipients(authContext.serviceClient, workspaceId, campaignId, batchSize);

    if (recipients.length === 0) {
      const stats = await refreshCampaignStats(authContext.serviceClient, workspaceId, campaignId);
      return jsonResponse({ processed: 0, sent: 0, failed: 0, suppressed: 0, dry_run: dryRun, stats });
    }

    let processed = 0;
    let sent = 0;
    let failed = 0;
    let suppressed = 0;

    for (const recipient of recipients) {
      processed += 1;

      const recipientEmail = normalizeEmail(recipient.recipient_email);
      if (!recipientEmail) {
        await updateRecipientStatus(authContext.serviceClient, workspaceId, recipient.id, {
          status: 'failed',
          failure_reason: 'Recipient email is invalid.',
          last_error: 'Recipient email is invalid.',
          attempt_count: recipient.attempt_count + 1,
        });
        failed += 1;
        continue;
      }

      const isSuppressed = await isWorkspaceEmailSuppressed(authContext.serviceClient, workspaceId, recipientEmail);

      if (isSuppressed) {
        await updateRecipientStatus(authContext.serviceClient, workspaceId, recipient.id, {
          status: 'unsubscribed',
          suppression_reason: 'workspace_unsubscribed',
          sent_at: null,
        });

        await insertSendEvent(authContext.serviceClient, {
          workspaceId,
          campaignId,
          campaignRecipientId: recipient.id,
          recordId: recipient.record_id,
          senderId: sender?.id,
          recipientEmail,
          eventType: 'suppressed',
          details: { reason: 'workspace_unsubscribed' },
        });

        suppressed += 1;
        continue;
      }

      const record = await loadRecipientRecord(authContext.serviceClient, workspaceId, recipient.record_id);

      if (!record) {
        await updateRecipientStatus(authContext.serviceClient, workspaceId, recipient.id, {
          status: 'failed',
          failure_reason: 'Record not found in workspace.',
          last_error: 'Record not found in workspace.',
          attempt_count: recipient.attempt_count + 1,
        });
        failed += 1;
        continue;
      }

      const tokens = buildRecipientTokens({
        leadFullName: normalizeString(record.full_name) || normalizeString(record.title) || normalizeString(recipient.recipient_name),
        leadEmail: recipientEmail,
        workspaceName: brandTheme?.brandName || null,
        senderName: sender?.sender_name || null,
        senderEmail: sender?.sender_email || null,
      });

      const renderResult = renderTemplateContent({
        subjectTemplate,
        layoutJson: template.layout_json,
        bodyHtmlTemplate,
        bodyPlainTemplate: template.body_plain_template,
        baseTheme: brandTheme,
        themeOverrides: asRecord(template.theme_overrides),
        tokens,
      });

      if (dryRun) {
        await updateRecipientStatus(authContext.serviceClient, workspaceId, recipient.id, {
          status: 'pending',
          attempt_count: recipient.attempt_count,
        });

        continue;
      }

      try {
        const sendResult = await sendEmailWithSender({
          db: authContext.serviceClient,
          sender: sender as WorkspaceEmailSenderRow,
          toEmail: recipientEmail,
          subject: renderResult.subject,
          bodyText: renderResult.bodyText,
          bodyHtml: renderResult.bodyHtml,
          fromName: sender?.sender_name,
          fromEmail: sender?.sender_email,
        });

        const sentAt = new Date().toISOString();

        await updateRecipientStatus(authContext.serviceClient, workspaceId, recipient.id, {
          status: 'sent',
          sent_at: sentAt,
          provider_message_id: sendResult.providerMessageId,
          attempt_count: recipient.attempt_count + 1,
          failure_reason: null,
          last_error: null,
          last_response: sendResult.rawResponseMeta,
        });

        await insertSendEvent(authContext.serviceClient, {
          workspaceId,
          campaignId,
          campaignRecipientId: recipient.id,
          recordId: recipient.record_id,
          senderId: sender?.id,
          recipientEmail,
          eventType: 'sent',
          provider: sender?.provider,
          providerMessageId: sendResult.providerMessageId,
          details: {
            subject: renderResult.subject,
          },
        });

        sent += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unexpected send error.';

        await updateRecipientStatus(authContext.serviceClient, workspaceId, recipient.id, {
          status: 'failed',
          failure_reason: message,
          last_error: message,
          attempt_count: recipient.attempt_count + 1,
        });

        await insertSendEvent(authContext.serviceClient, {
          workspaceId,
          campaignId,
          campaignRecipientId: recipient.id,
          recordId: recipient.record_id,
          senderId: sender?.id,
          recipientEmail,
          eventType: 'failed',
          provider: sender?.provider,
          errorText: message,
        });

        failed += 1;
      }
    }

    const stats = await refreshCampaignStats(authContext.serviceClient, workspaceId, campaignId);

    return jsonResponse({
      processed,
      sent,
      failed,
      suppressed,
      dry_run: dryRun,
      stats,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return jsonResponse({ error: message }, 400);
  }
});
