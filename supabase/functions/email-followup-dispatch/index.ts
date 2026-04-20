import {
  claimDueFollowupSteps,
  getFollowupById,
  getFollowupStepRecipient,
  hasPendingFollowupSteps,
  listWorkspaceEmailSenders,
  logEmailDeliveryEvent,
  markFollowupStatus,
  resolveRetryDelayMinutes,
  updateFollowupStepStatus,
  type WorkspaceEmailSenderRow,
} from '../_shared/email-automation.ts';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import type { EdgeClient } from '../_shared/server.ts';
import { createEdgeClients } from '../_shared/server.ts';
import { sendEmailWithSender } from '../_shared/email-sender-adapters.ts';

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function getCronSecret(request: Request) {
  return normalizeString(request.headers.get('x-cron-secret')) || normalizeString(request.headers.get('authorization')).replace(/^Bearer\s+/i, '');
}

async function resolveSender(
  db: EdgeClient,
  workspaceId: string,
  senderId: string | null,
) {
  const senders = await listWorkspaceEmailSenders(db, workspaceId);

  if (senderId) {
    return senders.find((sender) => sender.id === senderId) ?? null;
  }

  return senders.find((sender) => sender.is_default && sender.is_active && sender.status === 'connected') ??
    senders.find((sender) => sender.is_active && sender.status === 'connected') ??
    null;
}

async function handleMissingSender(
  db: EdgeClient,
  params: {
    workspaceId: string;
    followupId: string;
    followupStepId: string;
  },
) {
  await updateFollowupStepStatus(db, {
    workspaceId: params.workspaceId,
    followupStepId: params.followupStepId,
    status: 'failed',
    clearLock: true,
    lastError: 'No connected sender is available.',
  });

  await markFollowupStatus(db, {
    workspaceId: params.workspaceId,
    followupId: params.followupId,
    status: 'failed',
    reason: 'missing_sender',
  });

  await logEmailDeliveryEvent(db, {
    workspaceId: params.workspaceId,
    followupId: params.followupId,
    followupStepId: params.followupStepId,
    eventType: 'failed',
    errorText: 'No connected sender is available.',
  });
}

async function handleMissingRecipient(
  db: EdgeClient,
  params: {
    workspaceId: string;
    followupId: string;
    followupStepId: string;
  },
) {
  await updateFollowupStepStatus(db, {
    workspaceId: params.workspaceId,
    followupStepId: params.followupStepId,
    status: 'failed',
    clearLock: true,
    lastError: 'Lead email is missing. Sequence stopped.',
  });

  await markFollowupStatus(db, {
    workspaceId: params.workspaceId,
    followupId: params.followupId,
    status: 'stopped',
    reason: 'missing_recipient_email',
  });

  await logEmailDeliveryEvent(db, {
    workspaceId: params.workspaceId,
    followupId: params.followupId,
    followupStepId: params.followupStepId,
    eventType: 'stopped',
    errorText: 'Lead email is missing. Sequence stopped.',
  });
}

async function processStep(
  db: EdgeClient,
  step: {
    id: string;
    workspace_id: string;
    followup_id: string;
    sender_id: string | null;
    attempt_count: number;
    max_attempts: number;
    subject_rendered: string;
    body_rendered: string;
  },
) {
  const followup = await getFollowupById(db, step.workspace_id, step.followup_id);

  if (!followup || followup.status !== 'active') {
    await updateFollowupStepStatus(db, {
      workspaceId: step.workspace_id,
      followupStepId: step.id,
      status: 'canceled',
      clearLock: true,
      lastError: 'Follow-up is no longer active.',
    });
    return { status: 'skipped' as const };
  }

  const sender = await resolveSender(db, step.workspace_id, step.sender_id);

  if (!sender) {
    await handleMissingSender(db, {
      workspaceId: step.workspace_id,
      followupId: step.followup_id,
      followupStepId: step.id,
    });

    return { status: 'failed' as const, reason: 'missing_sender' as const };
  }

  const recipient = await getFollowupStepRecipient(db, step.workspace_id, step.followup_id);

  if (!recipient?.recipientEmail) {
    await handleMissingRecipient(db, {
      workspaceId: step.workspace_id,
      followupId: step.followup_id,
      followupStepId: step.id,
    });

    return { status: 'failed' as const, reason: 'missing_recipient' as const };
  }

  const nextAttempt = step.attempt_count + 1;

  await updateFollowupStepStatus(db, {
    workspaceId: step.workspace_id,
    followupStepId: step.id,
    status: 'sending',
    attemptCount: nextAttempt,
    clearLock: false,
  });

  await logEmailDeliveryEvent(db, {
    workspaceId: step.workspace_id,
    followupId: step.followup_id,
    followupStepId: step.id,
    senderId: sender.id,
    eventType: 'sending',
    provider: sender.provider,
    requestPayload: {
      to: recipient.recipientEmail,
      subject: step.subject_rendered,
      attempt: nextAttempt,
    },
  });

  try {
    const result = await sendEmailWithSender({
      db,
      sender,
      toEmail: recipient.recipientEmail,
      subject: step.subject_rendered,
      bodyText: step.body_rendered,
      fromName: sender.sender_name,
      fromEmail: sender.sender_email,
    });

    const sentAt = new Date().toISOString();

    await updateFollowupStepStatus(db, {
      workspaceId: step.workspace_id,
      followupStepId: step.id,
      status: 'sent',
      providerMessageId: result.providerMessageId,
      sentAt,
      lastError: null,
      nextRetryAt: null,
      lastResponse: result.rawResponseMeta,
      clearLock: true,
      attemptCount: nextAttempt,
    });

    await logEmailDeliveryEvent(db, {
      workspaceId: step.workspace_id,
      followupId: step.followup_id,
      followupStepId: step.id,
      senderId: sender.id,
      eventType: 'sent',
      provider: sender.provider,
      providerMessageId: result.providerMessageId,
      requestPayload: {
        to: recipient.recipientEmail,
        subject: step.subject_rendered,
        attempt: nextAttempt,
      },
      responsePayload: result.rawResponseMeta,
    });

    const hasPending = await hasPendingFollowupSteps(db, step.workspace_id, step.followup_id);

    if (!hasPending) {
      await markFollowupStatus(db, {
        workspaceId: step.workspace_id,
        followupId: step.followup_id,
        status: 'completed',
      });
    }

    return { status: 'sent' as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected send failure.';

    const shouldRetry = nextAttempt < step.max_attempts;
    const retryMinutes = shouldRetry ? resolveRetryDelayMinutes(nextAttempt) : null;

    if (shouldRetry && retryMinutes) {
      const nextRetryAt = new Date(Date.now() + retryMinutes * 60 * 1000).toISOString();

      await updateFollowupStepStatus(db, {
        workspaceId: step.workspace_id,
        followupStepId: step.id,
        status: 'pending',
        nextRetryAt,
        clearLock: true,
        lastError: message,
        attemptCount: nextAttempt,
      });

      await logEmailDeliveryEvent(db, {
        workspaceId: step.workspace_id,
        followupId: step.followup_id,
        followupStepId: step.id,
        senderId: sender.id,
        eventType: 'retry_scheduled',
        provider: sender.provider,
        errorText: message,
        responsePayload: {
          attempt: nextAttempt,
          next_retry_at: nextRetryAt,
        },
      });

      return { status: 'retry_scheduled' as const };
    }

    await updateFollowupStepStatus(db, {
      workspaceId: step.workspace_id,
      followupStepId: step.id,
      status: 'failed',
      nextRetryAt: null,
      clearLock: true,
      lastError: message,
      attemptCount: nextAttempt,
    });

    await markFollowupStatus(db, {
      workspaceId: step.workspace_id,
      followupId: step.followup_id,
      status: 'failed',
      reason: 'max_retries_reached',
    });

    await logEmailDeliveryEvent(db, {
      workspaceId: step.workspace_id,
      followupId: step.followup_id,
      followupStepId: step.id,
      senderId: sender.id,
      eventType: 'failed',
      provider: sender.provider,
      errorText: message,
      responsePayload: {
        attempt: nextAttempt,
      },
    });

    return { status: 'failed' as const };
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const expectedSecret = normalizeString(Deno.env.get('EMAIL_FOLLOWUP_CRON_SECRET'));

    if (!expectedSecret) {
      return jsonResponse({ error: 'EMAIL_FOLLOWUP_CRON_SECRET is required.' }, 500);
    }

    const suppliedSecret = getCronSecret(request);

    if (!suppliedSecret || suppliedSecret !== expectedSecret) {
      return jsonResponse({ error: 'Unauthorized.' }, 401);
    }

    const clients = createEdgeClients(request);

    if ('errorResponse' in clients) {
      return clients.errorResponse;
    }

    const batchSize = Number.parseInt(normalizeString(Deno.env.get('EMAIL_FOLLOWUP_DISPATCH_BATCH_SIZE')) || '25', 10);
    const steps = await claimDueFollowupSteps(clients.serviceClient, Number.isFinite(batchSize) ? batchSize : 25);

    let sent = 0;
    let failed = 0;
    let retryScheduled = 0;
    let skipped = 0;

    for (const step of steps) {
      const result = await processStep(clients.serviceClient, step);
      if (result.status === 'sent') sent += 1;
      if (result.status === 'failed') failed += 1;
      if (result.status === 'retry_scheduled') retryScheduled += 1;
      if (result.status === 'skipped') skipped += 1;
    }

    return jsonResponse({
      claimed: steps.length,
      sent,
      failed,
      retry_scheduled: retryScheduled,
      skipped,
      executed_at: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return jsonResponse({ error: message }, 400);
  }
});
