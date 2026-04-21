import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import {
  ensureWorkspaceEmailAutomationDefaults,
  getWorkspaceAutomationSettings,
  listWorkspaceEmailSenders,
  listWorkspaceSequenceSteps,
} from '../_shared/email-automation.ts';
import { encryptSecret } from '../_shared/email-crypto.ts';
import type { EdgeClient } from '../_shared/server.ts';
import { authenticateRequest, ensureWorkspaceMembership } from '../_shared/server.ts';

interface SenderPayload {
  id?: unknown;
  provider?: unknown;
  sender_email?: unknown;
  sender_name?: unknown;
  is_active?: unknown;
  is_default?: unknown;
  smtp?: {
    host?: unknown;
    port?: unknown;
    username?: unknown;
    password?: unknown;
    use_tls?: unknown;
  };
}

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeNullableString(value: unknown) {
  const normalized = normalizeString(value);
  return normalized || null;
}

function normalizeBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : null;
}

function normalizeInteger(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number.parseInt(value.trim(), 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

async function upsertSender(
  serviceClient: EdgeClient,
  workspaceId: string,
  actorUserId: string,
  senderPayload: SenderPayload,
) {
  const senderId = normalizeString(senderPayload.id);
  const provider = normalizeString(senderPayload.provider) as 'google' | 'microsoft' | 'smtp' | '';
  const senderEmail = normalizeString(senderPayload.sender_email).toLowerCase();
  const senderName = normalizeNullableString(senderPayload.sender_name);
  const isActive = normalizeBoolean(senderPayload.is_active);
  const isDefault = normalizeBoolean(senderPayload.is_default);

  if (senderId) {
    const patch: Record<string, unknown> = {
      updated_by: actorUserId,
    };

    if (senderName !== null) {
      patch.sender_name = senderName;
    }

    if (isActive !== null) {
      patch.is_active = isActive;
      patch.status = isActive ? 'connected' : 'disabled';
    }

    if (isDefault !== null) {
      patch.is_default = isDefault;
    }

    const smtp = asObject(senderPayload.smtp);

    if (smtp) {
      const host = normalizeNullableString(smtp.host);
      const port = normalizeInteger(smtp.port);
      const username = normalizeNullableString(smtp.username);
      const password = normalizeString(smtp.password);
      const useTls = normalizeBoolean(smtp.use_tls);

      if (host !== null) patch.smtp_host = host;
      if (port !== null) patch.smtp_port = port;
      if (username !== null) patch.smtp_username = username;
      if (useTls !== null) patch.smtp_use_tls = useTls;
      if (password) {
        patch.smtp_password_encrypted = await encryptSecret(password);
      }
    }

    const { error } = await serviceClient
      .from('workspace_email_senders')
      .update(patch)
      .eq('workspace_id', workspaceId)
      .eq('id', senderId);

    if (error) {
      throw new Error(error.message);
    }

    if (isDefault) {
      const { error: clearDefaultError } = await serviceClient
        .from('workspace_email_senders')
        .update({ is_default: false })
        .eq('workspace_id', workspaceId)
        .neq('id', senderId);

      if (clearDefaultError) {
        throw new Error(clearDefaultError.message);
      }
    }

    return;
  }

  if (!provider) {
    throw new Error('sender.provider is required when creating a sender.');
  }

  if (!senderEmail) {
    throw new Error('sender.sender_email is required when creating a sender.');
  }

  if (provider === 'smtp') {
    const smtp = asObject(senderPayload.smtp);

    if (!smtp) {
      throw new Error('sender.smtp is required for SMTP sender configuration.');
    }

    const host = normalizeString(smtp.host);
    const port = normalizeInteger(smtp.port);
    const username = normalizeString(smtp.username);
    const password = normalizeString(smtp.password);
    const useTls = normalizeBoolean(smtp.use_tls);

    if (!host || !port || !username || !password) {
      throw new Error('SMTP sender requires host, port, username, and password.');
    }

    const encryptedPassword = await encryptSecret(password);

    const { data: inserted, error } = await serviceClient
      .from('workspace_email_senders')
      .upsert(
        {
          workspace_id: workspaceId,
          provider,
          sender_email: senderEmail,
          sender_name: senderName,
          status: 'connected',
          is_default: isDefault ?? false,
          is_active: isActive ?? true,
          smtp_host: host,
          smtp_port: port,
          smtp_username: username,
          smtp_password_encrypted: encryptedPassword,
          smtp_use_tls: useTls ?? true,
          health_status: 'unknown',
          connected_at: new Date().toISOString(),
          created_by: actorUserId,
          updated_by: actorUserId,
        },
        {
          onConflict: 'workspace_id,provider,sender_email',
        },
      )
      .select('id')
      .single();

    if (error || !inserted) {
      throw new Error(error?.message || 'Unable to save SMTP sender.');
    }

    if (isDefault) {
      const { error: clearDefaultError } = await serviceClient
        .from('workspace_email_senders')
        .update({ is_default: false })
        .eq('workspace_id', workspaceId)
        .neq('id', inserted.id);

      if (clearDefaultError) {
        throw new Error(clearDefaultError.message);
      }
    }

    return;
  }

  const { data: inserted, error } = await serviceClient
    .from('workspace_email_senders')
    .upsert(
      {
        workspace_id: workspaceId,
        provider,
        sender_email: senderEmail,
        sender_name: senderName,
        status: 'pending',
        is_default: isDefault ?? false,
        is_active: isActive ?? true,
        oauth_scope: provider === 'google'
          ? 'https://www.googleapis.com/auth/gmail.send'
          : 'offline_access https://graph.microsoft.com/Mail.Send',
        created_by: actorUserId,
        updated_by: actorUserId,
      },
      {
        onConflict: 'workspace_id,provider,sender_email',
      },
    )
    .select('id')
    .single();

  if (error || !inserted) {
    throw new Error(error?.message || 'Unable to save OAuth sender.');
  }

  if (isDefault) {
    const { error: clearDefaultError } = await serviceClient
      .from('workspace_email_senders')
      .update({ is_default: false })
      .eq('workspace_id', workspaceId)
      .neq('id', inserted.id);

    if (clearDefaultError) {
      throw new Error(clearDefaultError.message);
    }
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authContext = await authenticateRequest(request);

    if (authContext instanceof Response) {
      return authContext;
    }

    const payload = (await request.json()) as Record<string, unknown>;
    const workspaceId = normalizeString(payload.workspace_id);

    if (!workspaceId) {
      return jsonResponse({ error: 'workspace_id is required.' }, 400);
    }

    const membership = await ensureWorkspaceMembership(authContext.serviceClient, workspaceId, authContext.user.id);
    const canManage = true;

    await ensureWorkspaceEmailAutomationDefaults(authContext.serviceClient, workspaceId, authContext.user.id);

    const profilePayload = asObject(payload.profile);
    if (profilePayload && Object.prototype.hasOwnProperty.call(profilePayload, 'full_name')) {
      const fullName = normalizeString(profilePayload.full_name);
      if (fullName.length < 2) {
        return jsonResponse({ error: 'profile.full_name must be at least 2 characters.' }, 400);
      }

      const { error: profileError } = await authContext.serviceClient
        .from('profiles')
        .upsert({
          id: authContext.user.id,
          full_name: fullName,
        });

      if (profileError) {
        return jsonResponse({ error: profileError.message }, 400);
      }
    }

    const senderPayload = asObject(payload.sender) as SenderPayload | null;
    if (senderPayload) {
      await upsertSender(authContext.serviceClient, workspaceId, authContext.user.id, senderPayload);
    }

    const automationPayload = asObject(payload.automation);
    if (automationPayload) {
      const patch: Record<string, unknown> = {
        updated_by: authContext.user.id,
      };

      const isEnabled = normalizeBoolean(automationPayload.is_enabled);
      const timezone = normalizeString(automationPayload.timezone);
      const sendWindowStartHour = normalizeInteger(automationPayload.send_window_start_hour);
      const sendWindowEndHour = normalizeInteger(automationPayload.send_window_end_hour);
      const sendWindowDaysRaw = Array.isArray(automationPayload.send_window_days)
        ? automationPayload.send_window_days
        : null;
      const sendWindowDays = sendWindowDaysRaw
        ? sendWindowDaysRaw
          .map((day) => normalizeInteger(day))
          .filter((day): day is number => day !== null && day >= 1 && day <= 7)
        : null;

      if (isEnabled !== null) {
        patch.is_enabled = isEnabled;
      }

      if (timezone) {
        patch.timezone = timezone;
      }

      if (sendWindowStartHour !== null) {
        patch.send_window_start_hour = sendWindowStartHour;
      }

      if (sendWindowEndHour !== null) {
        patch.send_window_end_hour = sendWindowEndHour;
      }

      if (sendWindowDays && sendWindowDays.length > 0) {
        patch.send_window_days = Array.from(new Set(sendWindowDays));
      }

      const { error: automationError } = await authContext.serviceClient
        .from('workspace_email_automation_settings')
        .update(patch)
        .eq('workspace_id', workspaceId);

      if (automationError) {
        return jsonResponse({ error: automationError.message }, 400);
      }
    }

    const sequencePayload = Array.isArray(payload.sequence_steps) ? payload.sequence_steps : null;

    if (sequencePayload) {
      if (sequencePayload.length === 0) {
        return jsonResponse({ error: 'sequence_steps cannot be empty.' }, 400);
      }

      const upsertRows: Array<Record<string, unknown>> = [];
      const stepOrders = new Set<number>();

      for (const rawStep of sequencePayload) {
        const step = asObject(rawStep);

        if (!step) {
          return jsonResponse({ error: 'Each sequence step must be an object.' }, 400);
        }

        const stepOrder = normalizeInteger(step.step_order);
        const delayHours = normalizeInteger(step.delay_hours);
        const subjectTemplate = normalizeString(step.subject_template);
        const bodyTemplate = normalizeString(step.body_template);
        const isActive = normalizeBoolean(step.is_active);

        if (!stepOrder || stepOrder < 1) {
          return jsonResponse({ error: 'sequence_steps[].step_order must be a positive integer.' }, 400);
        }

        if (stepOrders.has(stepOrder)) {
          return jsonResponse({ error: `Duplicate sequence step_order detected: ${stepOrder}.` }, 400);
        }

        if (delayHours === null || delayHours < 0) {
          return jsonResponse({ error: `sequence_steps[${stepOrder}] has invalid delay_hours.` }, 400);
        }

        if (!subjectTemplate) {
          return jsonResponse({ error: `sequence_steps[${stepOrder}] subject_template is required.` }, 400);
        }

        if (!bodyTemplate) {
          return jsonResponse({ error: `sequence_steps[${stepOrder}] body_template is required.` }, 400);
        }

        stepOrders.add(stepOrder);

        upsertRows.push({
          workspace_id: workspaceId,
          step_order: stepOrder,
          delay_hours: delayHours,
          subject_template: subjectTemplate,
          body_template: bodyTemplate,
          is_active: isActive ?? true,
          updated_by: authContext.user.id,
          created_by: authContext.user.id,
        });
      }

      const { error: upsertError } = await authContext.serviceClient
        .from('workspace_email_sequence_steps')
        .upsert(upsertRows, {
          onConflict: 'workspace_id,step_order',
        });

      if (upsertError) {
        return jsonResponse({ error: upsertError.message }, 400);
      }

      const { error: disableError } = await authContext.serviceClient
        .from('workspace_email_sequence_steps')
        .update({ is_active: false, updated_by: authContext.user.id })
        .eq('workspace_id', workspaceId)
        .not('step_order', 'in', `(${Array.from(stepOrders).join(',')})`);

      if (disableError) {
        return jsonResponse({ error: disableError.message }, 400);
      }
    }

    const [{ data: profile, error: profileError }, senders, automation, sequenceSteps] = await Promise.all([
      authContext.serviceClient
        .from('profiles')
        .select('id, full_name')
        .eq('id', authContext.user.id)
        .maybeSingle(),
      listWorkspaceEmailSenders(authContext.serviceClient, workspaceId),
      getWorkspaceAutomationSettings(authContext.serviceClient, workspaceId),
      listWorkspaceSequenceSteps(authContext.serviceClient, workspaceId, false),
    ]);

    if (profileError) {
      return jsonResponse({ error: profileError.message }, 400);
    }

    return jsonResponse({
      profile: {
        id: authContext.user.id,
        email: authContext.user.email ?? null,
        full_name: profile?.full_name ?? null,
      },
      workspace: {
        id: workspaceId,
        role: membership.role,
        can_manage: canManage,
      },
      senders: senders.map((sender) => ({
        id: sender.id,
        provider: sender.provider,
        sender_email: sender.sender_email,
        sender_name: sender.sender_name,
        status: sender.status,
        is_default: sender.is_default,
        is_active: sender.is_active,
        health_status: sender.health_status,
        last_health_error: sender.last_health_error,
        connected_at: sender.connected_at ?? null,
        smtp_host: sender.provider === 'smtp' ? sender.smtp_host : null,
        smtp_port: sender.provider === 'smtp' ? sender.smtp_port : null,
        smtp_username: sender.provider === 'smtp' ? sender.smtp_username : null,
        smtp_use_tls: sender.provider === 'smtp' ? sender.smtp_use_tls : null,
      })),
      automation: automation ?? {
        workspace_id: workspaceId,
        is_enabled: false,
        timezone: 'UTC',
        stop_on_reply: false,
        send_window_start_hour: null,
        send_window_end_hour: null,
        send_window_days: [1, 2, 3, 4, 5, 6, 7],
      },
      sequence_steps: sequenceSteps,
      tokens: ['{{lead_full_name}}', '{{lead_email}}', '{{workspace_name}}', '{{sender_name}}'],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error.';
    return jsonResponse({ error: message }, 400);
  }
});
